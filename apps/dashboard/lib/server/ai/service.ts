import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  AI_ERROR_KINDS,
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  type AiAttempt,
  type AiConfigView,
  type AiErrorKind,
  type AiLogEntry,
  type AiProviderId,
  type AiProviderView,
  type AiRouterSettings,
  DEFAULT_ROUTER,
  isAiProviderId,
  type RecognizeResponse,
} from "@/lib/ai/providers-meta";
import { convexUrl, signPanelToken } from "@/lib/server/panel-jwt";
import { connectorsSecret, seal, unseal } from "@/lib/server/sealed-cookie";
import {
  type CategoryHint,
  parseRecognition,
  recognitionRequest,
} from "./recognize";
import { ADAPTERS } from "./registry";
import { type RouterProvider, route } from "./router";
import { AiError, type VisionRequest } from "./types";

/**
 * The AI service used by the API routes: provider config (keys sealed
 * with AES-GCM, server-only), connection tests, model lists and the
 * recognition request with automatic fallback, de-duplication and log.
 */

const SUBJECT = "ai-router";
/** Same photo again within this window: answered from the log, free. */
const DEDUPE_MS = 10 * 60_000;
const TEST_TIMEOUT_MS = 20_000;

type ProviderDoc = Doc<"aiProviders">;

async function db() {
  const url = convexUrl();
  const signed = await signPanelToken(SUBJECT);
  if (!(url && signed)) {
    throw new Error("Banco de dados não configurado.");
  }
  const c = new ConvexHttpClient(url);
  c.setAuth(signed.token);
  return c;
}

function routerOf(doc: Doc<"aiSettings"> | null): AiRouterSettings {
  if (!doc) {
    return DEFAULT_ROUTER;
  }
  const order = doc.order.filter(isAiProviderId);
  return {
    order: [...order, ...AI_PROVIDER_IDS.filter((id) => !order.includes(id))],
    fallbackEnabled: doc.fallbackEnabled,
    fallbackOn: doc.fallbackOn.filter((k): k is AiErrorKind =>
      AI_ERROR_KINDS.includes(k as AiErrorKind)
    ),
    allowAmbiguous: doc.allowAmbiguous,
    notifySwitch: doc.notifySwitch,
    timeoutMs: doc.timeoutMs,
  };
}

async function loadAll(c: ConvexHttpClient) {
  const { providers, settings } = await c.query(api.ai.config, {});
  const byId = new Map(providers.map((p) => [p.provider, p]));
  return { router: routerOf(settings), byId };
}

function view(id: AiProviderId, doc: ProviderDoc | undefined): AiProviderView {
  return {
    id,
    enabled: doc?.enabled ?? false,
    model: doc?.model || AI_PROVIDERS[id].suggested[0] || "",
    hasKey: Boolean(doc?.keySealed),
    keyLast4: doc?.keyLast4,
    status: {
      ...(doc?.status ?? { state: "unknown" }),
      kind: doc?.status.kind as AiErrorKind | undefined,
    },
    cooldownUntil:
      doc?.cooldownUntil && doc.cooldownUntil > Date.now()
        ? doc.cooldownUntil
        : undefined,
    models: doc?.models,
    modelsAt: doc?.modelsAt,
  };
}

export async function getConfig(): Promise<AiConfigView> {
  const { router, byId } = await loadAll(await db());
  return {
    router,
    providers: router.order.map((id) => view(id, byId.get(id))),
    canStoreKeys: Boolean(connectorsSecret()),
  };
}

export async function getLog(limit = 30): Promise<AiLogEntry[]> {
  const rows = await (await db()).query(api.ai.log, { limit });
  return rows.map((r) => ({
    requestId: r.requestId,
    status: r.status,
    provider: isAiProviderId(r.provider) ? r.provider : undefined,
    model: r.model,
    attempts: r.attempts as AiAttempt[],
    cached: r.cached,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt,
  }));
}

export async function saveRouter(input: AiRouterSettings) {
  const order = input.order.filter(isAiProviderId);
  await (await db()).mutation(api.ai.saveSettings, {
    order: [...new Set(order)],
    fallbackEnabled: input.fallbackEnabled,
    fallbackOn: input.fallbackOn.filter((k) => AI_ERROR_KINDS.includes(k)),
    allowAmbiguous: input.allowAmbiguous,
    notifySwitch: input.notifySwitch,
    timeoutMs: Math.min(Math.max(Math.round(input.timeoutMs), 10_000), 120_000),
  });
}

export async function saveProviderPrefs(
  id: AiProviderId,
  prefs: { enabled?: boolean; model?: string }
) {
  const model = prefs.model?.trim().slice(0, 120);
  if (model !== undefined && !/^[\w.:/-]*$/.test(model)) {
    throw new AiError("bad_request", "Nome de modelo inválido.");
  }
  await (await db()).mutation(api.ai.saveProvider, {
    provider: id,
    enabled: prefs.enabled,
    model,
    // A new model deserves a fresh chance
    ...(model !== undefined ? { cooldownUntil: null } : {}),
  });
}

interface SealedKey {
  p: AiProviderId;
  k: string;
}

export async function setKey(id: AiProviderId, key: string) {
  const clean = key.trim();
  if (clean.length < 20 || clean.length > 400 || /\s/.test(clean)) {
    throw new AiError("auth", "Essa chave não parece válida.");
  }
  if (!connectorsSecret()) {
    throw new AiError(
      "unknown",
      "O servidor não pode guardar chaves: falta o segredo CONNECTORS_SECRET."
    );
  }
  await (await db()).mutation(api.ai.saveProvider, {
    provider: id,
    keySealed: await seal({ p: id, k: clean } satisfies SealedKey),
    keyLast4: clean.slice(-4),
    // A new key turns the provider on
    enabled: true,
    cooldownUntil: null,
    status: { state: "unknown" },
  });
}

export async function removeKey(id: AiProviderId) {
  await (await db()).mutation(api.ai.saveProvider, {
    provider: id,
    keySealed: null,
    keyLast4: null,
    enabled: false,
    status: { state: "unknown" },
    cooldownUntil: null,
  });
}

async function keyOf(doc: ProviderDoc | undefined) {
  const sealed = await unseal<SealedKey>(doc?.keySealed);
  return sealed && sealed.p === doc?.provider ? sealed.k : null;
}

const errorStatus = (err: AiError) => ({
  state: "error" as const,
  kind: err.kind,
  message: err.message.slice(0, 300),
  checkedAt: Date.now(),
});

/** Tiny gray PNG used by the full test (a real vision call). */
const PING_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAD0lEQVR4nGNoQAMMI1sAAAUMgAFaSOXNAAAAAElFTkSuQmCC";

/**
 * Checks a provider: the model list (validates the key, no cost) and,
 * when `full`, one tiny image request (detects missing credits; costs a
 * fraction of a cent).
 */
export async function testProvider(id: AiProviderId, full: boolean) {
  const c = await db();
  const { byId } = await loadAll(c);
  const doc = byId.get(id);
  const key = await keyOf(doc);
  if (!key) {
    throw new AiError("auth", "Salve uma chave de API primeiro.");
  }
  const adapter = ADAPTERS[id];
  const started = Date.now();
  try {
    const models = await adapter.listModels(key, AbortSignal.timeout(TEST_TIMEOUT_MS));
    const model = doc?.model || AI_PROVIDERS[id].suggested[0] || "";
    if (full) {
      await adapter.vision(
        key,
        model,
        {
          image: PING_PNG,
          mediaType: "image/png",
          system: "Connection test.",
          prompt: "Reply with the word OK.",
          maxTokens: 256,
        },
        AbortSignal.timeout(TEST_TIMEOUT_MS)
      );
    }
    const latencyMs = Date.now() - started;
    await c.mutation(api.ai.saveProvider, {
      provider: id,
      status: { state: "ok", checkedAt: Date.now(), latencyMs },
      cooldownUntil: null,
      models: models.slice(0, 200),
      modelsAt: Date.now(),
    });
    return { ok: true as const, latencyMs, models: models.length, model };
  } catch (raw) {
    const err = raw instanceof AiError ? raw : new AiError("unknown", String(raw));
    await c.mutation(api.ai.saveProvider, { provider: id, status: errorStatus(err) });
    return { ok: false as const, kind: err.kind, error: err.message };
  }
}

export async function loadModels(id: AiProviderId) {
  const c = await db();
  const { byId } = await loadAll(c);
  const key = await keyOf(byId.get(id));
  if (!key) {
    throw new AiError("auth", "Salve uma chave de API primeiro.");
  }
  try {
    const models = await ADAPTERS[id].listModels(key, AbortSignal.timeout(TEST_TIMEOUT_MS));
    await c.mutation(api.ai.saveProvider, {
      provider: id,
      models: models.slice(0, 200),
      modelsAt: Date.now(),
    });
    return models;
  } catch (raw) {
    const err = raw instanceof AiError ? raw : new AiError("unknown", String(raw));
    await c.mutation(api.ai.saveProvider, { provider: id, status: errorStatus(err) });
    throw err;
  }
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Buffer.from(digest).toString("hex");
}

/** Product recognition from a photo, with fallback between providers. */
export async function recognize(input: {
  requestId: string;
  image: string;
  mediaType: VisionRequest["mediaType"];
  categories: CategoryHint[];
  barcode: string | null;
}): Promise<RecognizeResponse> {
  const c = await db();
  const task = "recognize-product";
  const hash = await sha256(`${task}:${input.image}`);
  const claim = await c.mutation(api.ai.claim, {
    requestId: input.requestId,
    hash,
    task,
    dedupeMs: DEDUPE_MS,
  });
  if (claim.state === "running") {
    return {
      ok: false,
      attempts: [],
      error: "Esta foto já está sendo analisada. Aguarde o resultado.",
      errorKind: "rate_limit",
    };
  }
  if (claim.state === "done") {
    await c.mutation(api.ai.logCached, {
      requestId: input.requestId,
      hash,
      task,
      from: claim.doc._id,
    });
    return {
      ok: true,
      cached: true,
      product: claim.doc.result ? JSON.parse(claim.doc.result) : undefined,
      provider: isAiProviderId(claim.doc.provider) ? claim.doc.provider : undefined,
      model: claim.doc.model,
      attempts: [],
    };
  }

  const { router, byId } = await loadAll(c);
  const providers: RouterProvider[] = await Promise.all(
    router.order.map(async (id) => {
      const doc = byId.get(id);
      return {
        id,
        enabled: doc?.enabled ?? false,
        model: doc?.model || AI_PROVIDERS[id].suggested[0] || "",
        key: await keyOf(doc),
        cooldownUntil: doc?.cooldownUntil,
      };
    })
  );
  const request = recognitionRequest(
    input.image,
    input.mediaType,
    input.categories,
    input.barcode
  );
  const updates: Promise<unknown>[] = [];
  const outcome = await route(
    providers,
    router,
    async (p) => {
      const res = await ADAPTERS[p.id].vision(
        p.key,
        p.model,
        request,
        AbortSignal.timeout(router.timeoutMs)
      );
      const product = parseRecognition(res.text);
      if (!product) {
        // Answered (and billed), just not usable: no fallback
        throw new AiError("bad_request", "A IA respondeu num formato inesperado.");
      }
      return product;
    },
    {
      onFailure: (p, err, cooldownMs) => {
        updates.push(
          c.mutation(api.ai.saveProvider, {
            provider: p.id,
            status: errorStatus(err),
            ...(cooldownMs ? { cooldownUntil: Date.now() + cooldownMs } : {}),
          })
        );
      },
      onSuccess: (p, ms) => {
        updates.push(
          c.mutation(api.ai.saveProvider, {
            provider: p.id,
            status: { state: "ok", checkedAt: Date.now(), latencyMs: ms },
            cooldownUntil: null,
          })
        );
      },
    }
  );
  await Promise.allSettled(updates);
  await c.mutation(api.ai.finish, {
    requestId: input.requestId,
    ok: outcome.ok,
    provider: outcome.ok ? outcome.provider : undefined,
    model: outcome.ok ? outcome.model : undefined,
    attempts: outcome.attempts,
    result: outcome.ok ? JSON.stringify(outcome.value) : undefined,
  });
  if (!outcome.ok) {
    console.error("[ai] recognize failed", input.requestId, outcome.kind, outcome.attempts);
    return {
      ok: false,
      attempts: outcome.attempts,
      error: outcome.error,
      errorKind: outcome.kind === "not_configured" ? undefined : outcome.kind,
    };
  }
  const switched = outcome.attempts.some((a) => !(a.ok || a.skipped));
  if (switched) {
    console.warn("[ai] fallback used", input.requestId, outcome.attempts);
  }
  return {
    ok: true,
    product: outcome.value,
    provider: outcome.provider,
    model: outcome.model,
    attempts: outcome.attempts,
    switched: switched && router.notifySwitch,
  };
}
