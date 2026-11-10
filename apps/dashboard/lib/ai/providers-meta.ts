/**
 * AI providers the app can use for image recognition, and the shared
 * vocabulary of the fallback router. Client-safe: no keys, no network.
 *
 * Adding a provider: add its id and meta here, then one adapter file in
 * lib/server/ai/providers/ and one line in lib/server/ai/registry.ts.
 */

export const AI_PROVIDER_IDS = ["openai", "anthropic", "xai"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const isAiProviderId = (v: unknown): v is AiProviderId =>
  AI_PROVIDER_IDS.includes(v as AiProviderId);

export interface AiProviderMeta {
  id: AiProviderId;
  label: string;
  /** Product name people know ("ChatGPT", "Claude", "Grok"). */
  product: string;
  /** Where the owner creates and tops up the key. */
  consoleUrl: string;
  keyHint: string;
  /** Suggested models when the provider's list cannot be loaded. */
  suggested: string[];
}

export const AI_PROVIDERS: Record<AiProviderId, AiProviderMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    product: "ChatGPT",
    consoleUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…",
    suggested: ["gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4o"],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    product: "Claude",
    consoleUrl: "https://platform.claude.com/settings/keys",
    keyHint: "sk-ant-…",
    suggested: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  xai: {
    id: "xai",
    label: "xAI",
    product: "Grok",
    consoleUrl: "https://console.x.ai",
    keyHint: "xai-…",
    suggested: ["grok-4", "grok-2-vision-1212"],
  },
};

/**
 * Why a provider call failed. The router decides from this whether the
 * next provider may be tried.
 */
export const AI_ERROR_KINDS = [
  "auth",
  "credits",
  "rate_limit",
  "unavailable",
  "model",
  "timeout",
  "network",
  "bad_request",
  "refused",
  "unknown",
] as const;
export type AiErrorKind = (typeof AI_ERROR_KINDS)[number];

export const AI_ERROR_LABELS: Record<AiErrorKind, string> = {
  auth: "Chave inválida ou sem permissão",
  credits: "Sem créditos / cota esgotada",
  rate_limit: "Limite de uso (muitas solicitações)",
  unavailable: "Provedor indisponível ou sobrecarregado",
  model: "Modelo não encontrado",
  timeout: "Tempo esgotado (pode ter sido cobrado)",
  network: "Falha de rede",
  bad_request: "Solicitação recusada (formato/imagem)",
  refused: "O modelo recusou a imagem",
  unknown: "Erro desconhecido",
};

/**
 * Errors where the provider may already have processed (and billed) the
 * request. Falling back after one of these can mean paying twice.
 */
export const AMBIGUOUS_KINDS: readonly AiErrorKind[] = ["timeout"];

/** Default triggers: the request surely was not processed. */
export const DEFAULT_FALLBACK_ON: AiErrorKind[] = [
  "auth",
  "credits",
  "rate_limit",
  "unavailable",
  "model",
  "network",
];

export interface AiProviderStatus {
  state: "ok" | "error" | "unknown";
  kind?: AiErrorKind;
  message?: string;
  checkedAt?: number;
  latencyMs?: number;
}

/** What the settings screen sees (never the key itself). */
export interface AiProviderView {
  id: AiProviderId;
  enabled: boolean;
  model: string;
  hasKey: boolean;
  keyLast4?: string;
  status: AiProviderStatus;
  /** Skipped by the router until then (credits, rate limit, outage). */
  cooldownUntil?: number;
  models?: { id: string; name?: string; vision?: boolean }[];
  modelsAt?: number;
}

export interface AiRouterSettings {
  order: AiProviderId[];
  fallbackEnabled: boolean;
  fallbackOn: AiErrorKind[];
  /** Also fall back after a timeout (may bill twice). Off by default. */
  allowAmbiguous: boolean;
  notifySwitch: boolean;
  timeoutMs: number;
}

export const DEFAULT_ROUTER: AiRouterSettings = {
  order: ["openai", "anthropic", "xai"],
  fallbackEnabled: true,
  fallbackOn: DEFAULT_FALLBACK_ON,
  allowAmbiguous: false,
  notifySwitch: true,
  timeoutMs: 45_000,
};

export interface AiAttempt {
  provider: AiProviderId;
  model: string;
  ok: boolean;
  kind?: AiErrorKind;
  message?: string;
  ms: number;
  /** Not called: no key, disabled or cooling down. */
  skipped?: string;
}

export interface AiConfigView {
  router: AiRouterSettings;
  providers: AiProviderView[];
  /** The server can encrypt keys (CONNECTORS_SECRET set). */
  canStoreKeys: boolean;
}

export interface AiLogEntry {
  requestId: string;
  status: "running" | "ok" | "failed";
  provider?: AiProviderId;
  model?: string;
  attempts: AiAttempt[];
  cached?: boolean;
  createdAt: number;
  finishedAt?: number;
}

/** Normalized product recognition from a photo. */
export interface RecognizedProduct {
  name: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  barcode: string | null;
  size: string | null;
  description: string | null;
  confidence: number;
}

export interface RecognizeResponse {
  ok: boolean;
  product?: RecognizedProduct;
  provider?: AiProviderId;
  model?: string;
  attempts: AiAttempt[];
  /** Served from a previous identical request: no new charge. */
  cached?: boolean;
  /** Some provider failed before the one that answered. */
  switched?: boolean;
  error?: string;
  errorKind?: AiErrorKind;
}
