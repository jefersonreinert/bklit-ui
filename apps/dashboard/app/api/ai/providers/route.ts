import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AI_ERROR_KINDS,
  AI_ERROR_LABELS,
  AI_PROVIDER_IDS,
} from "@/lib/ai/providers-meta";
import { aiAccess } from "@/lib/server/ai/access";
import {
  getConfig,
  getLog,
  loadModels,
  removeKey,
  saveProviderPrefs,
  saveRouter,
  setKey,
  testProvider,
} from "@/lib/server/ai/service";
import { AiError } from "@/lib/server/ai/types";

/**
 * AI Providers & API Configuration. Keys go in, never come out: the
 * answer has only whether a key exists and its last 4 characters.
 */

export const dynamic = "force-dynamic";

const provider = z.enum(AI_PROVIDER_IDS);

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("router"),
    router: z.object({
      order: z.array(provider).max(10),
      fallbackEnabled: z.boolean(),
      fallbackOn: z.array(z.enum(AI_ERROR_KINDS)).max(20),
      allowAmbiguous: z.boolean(),
      notifySwitch: z.boolean(),
      timeoutMs: z.number().int().min(10_000).max(120_000),
    }),
  }),
  z.object({
    action: z.literal("provider"),
    provider,
    enabled: z.boolean().optional(),
    model: z.string().max(120).optional(),
  }),
  z.object({ action: z.literal("setKey"), provider, key: z.string().max(400) }),
  z.object({ action: z.literal("removeKey"), provider }),
  z.object({ action: z.literal("test"), provider, full: z.boolean().default(true) }),
  z.object({ action: z.literal("models"), provider }),
]);

const denied = () => NextResponse.json({ error: "Sem acesso." }, { status: 401 });

function failure(err: unknown) {
  if (err instanceof AiError) {
    return NextResponse.json(
      { error: err.message, kind: err.kind, label: AI_ERROR_LABELS[err.kind] },
      { status: 400 }
    );
  }
  console.error("[ai/providers]", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Erro interno." },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  if (!(await aiAccess(request, "manage"))) {
    return denied();
  }
  try {
    const [config, log] = await Promise.all([getConfig(), getLog(25)]);
    return NextResponse.json({ config, log });
  } catch (err) {
    return failure(err);
  }
}

export async function POST(request: NextRequest) {
  if (!(await aiAccess(request, "manage"))) {
    return denied();
  }
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const a = parsed.data;
  try {
    switch (a.action) {
      case "router":
        await saveRouter(a.router);
        break;
      case "provider":
        await saveProviderPrefs(a.provider, { enabled: a.enabled, model: a.model });
        break;
      case "setKey":
        await setKey(a.provider, a.key);
        break;
      case "removeKey":
        await removeKey(a.provider);
        break;
      case "test":
        return NextResponse.json({
          test: await testProvider(a.provider, a.full),
          config: await getConfig(),
        });
      case "models":
        await loadModels(a.provider);
        break;
      default:
        break;
    }
    return NextResponse.json({ config: await getConfig() });
  } catch (err) {
    return failure(err);
  }
}
