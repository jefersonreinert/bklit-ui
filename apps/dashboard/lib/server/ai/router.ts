import type {
  AiAttempt,
  AiErrorKind,
  AiProviderId,
  AiRouterSettings,
} from "@/lib/ai/providers-meta";
import { AiError } from "./types";

/**
 * Automatic provider fallback. Tries the providers in priority order,
 * each AT MOST ONCE per request (no retry loops, nothing billed twice by
 * the router), and moves on only for errors where the request surely was
 * not processed — or, if the owner allows it, after a timeout too.
 * Providers that just failed for credits, rate limit or an outage cool
 * down, so the next requests skip them without spending a call.
 */

export interface RouterProvider {
  id: AiProviderId;
  enabled: boolean;
  model: string;
  key: string | null;
  cooldownUntil?: number;
}

export type RouteOutcome<T> =
  | {
      ok: true;
      value: T;
      provider: AiProviderId;
      model: string;
      attempts: AiAttempt[];
    }
  | {
      ok: false;
      attempts: AiAttempt[];
      error: string;
      kind: AiErrorKind | "not_configured";
    };

/** How long a provider is skipped after each kind of failure. */
export function cooldownFor(err: AiError): number {
  switch (err.kind) {
    case "credits":
      return 30 * 60_000;
    case "auth":
      // Until the key is changed (saving a key clears it)
      return 7 * 24 * 60 * 60_000;
    case "rate_limit":
      return Math.min(Math.max(err.retryAfterMs ?? 60_000, 5000), 15 * 60_000);
    case "unavailable":
      return Math.min(Math.max(err.retryAfterMs ?? 30_000, 5000), 5 * 60_000);
    default:
      return 0;
  }
}

/** Whether an error lets the router try the next provider. */
export function mayFallBack(err: AiError, settings: AiRouterSettings) {
  if (!settings.fallbackEnabled) {
    return false;
  }
  if (err.maybeBilled && !settings.allowAmbiguous) {
    return false;
  }
  return settings.fallbackOn.includes(err.kind);
}

export function ordered(
  providers: RouterProvider[],
  settings: AiRouterSettings
): RouterProvider[] {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const seen = new Set<AiProviderId>();
  const out: RouterProvider[] = [];
  for (const id of [...settings.order, ...providers.map((p) => p.id)]) {
    const p = byId.get(id);
    if (p && !seen.has(id)) {
      seen.add(id);
      out.push(p);
    }
  }
  return out;
}

export async function route<T>(
  providers: RouterProvider[],
  settings: AiRouterSettings,
  run: (p: RouterProvider & { key: string }) => Promise<T>,
  hooks: {
    now?: () => number;
    onFailure?: (p: RouterProvider, err: AiError, cooldownMs: number) => void;
    onSuccess?: (p: RouterProvider, ms: number) => void;
  } = {}
): Promise<RouteOutcome<T>> {
  const now = hooks.now ?? Date.now;
  const attempts: AiAttempt[] = [];
  let last: AiError | null = null;
  let considered = 0;

  for (const p of ordered(providers, settings)) {
    const base = { provider: p.id, model: p.model, ok: false, ms: 0 };
    if (!p.enabled) {
      continue;
    }
    // Without fallback only the primary (first enabled) provider is used
    if (considered > 0 && !settings.fallbackEnabled) {
      break;
    }
    considered++;
    if (!(p.key && p.model)) {
      attempts.push({ ...base, skipped: p.key ? "sem modelo" : "sem chave" });
      continue;
    }
    if (p.cooldownUntil && p.cooldownUntil > now()) {
      attempts.push({ ...base, skipped: "em pausa após erro recente" });
      continue;
    }
    const started = now();
    try {
      const value = await run({ ...p, key: p.key });
      const ms = now() - started;
      attempts.push({ ...base, ok: true, ms });
      hooks.onSuccess?.(p, ms);
      return { ok: true, value, provider: p.id, model: p.model, attempts };
    } catch (raw) {
      const err =
        raw instanceof AiError
          ? raw
          : new AiError("unknown", raw instanceof Error ? raw.message : "Erro");
      last = err;
      attempts.push({
        ...base,
        ms: now() - started,
        kind: err.kind,
        message: err.message.slice(0, 300),
      });
      hooks.onFailure?.(p, err, cooldownFor(err));
      if (!mayFallBack(err, settings)) {
        break;
      }
    }
  }

  if (!last) {
    return {
      ok: false,
      attempts,
      kind: "not_configured",
      error:
        "Nenhum provedor de IA disponível. Ative um provedor com chave em Configurações → AI Providers & API Configuration.",
    };
  }
  return { ok: false, attempts, kind: last.kind, error: last.message };
}
