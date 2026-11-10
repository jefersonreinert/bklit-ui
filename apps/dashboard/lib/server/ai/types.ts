import {
  AMBIGUOUS_KINDS,
  type AiErrorKind,
  type AiProviderId,
} from "@/lib/ai/providers-meta";

/** A provider failure, already classified for the fallback router. */
export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;
  /** From Retry-After, when the provider sent it. */
  readonly retryAfterMs?: number;

  constructor(
    kind: AiErrorKind,
    message: string,
    extra: { status?: number; retryAfterMs?: number } = {}
  ) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.status = extra.status;
    this.retryAfterMs = extra.retryAfterMs;
  }

  /** The provider may have processed (and billed) the request. */
  get maybeBilled() {
    return AMBIGUOUS_KINDS.includes(this.kind);
  }
}

export interface ModelInfo {
  id: string;
  name?: string;
  /** Accepts images (when the provider says so). */
  vision?: boolean;
}

export interface VisionRequest {
  /** Base64 without the data: prefix. */
  image: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  system: string;
  prompt: string;
  maxTokens: number;
}

export interface VisionResponse {
  text: string;
  model: string;
}

/**
 * One AI provider. Each call is made exactly once (no internal retries):
 * retrying is the router's decision, so nothing is billed twice by
 * accident.
 */
export interface AiProviderAdapter {
  id: AiProviderId;
  listModels(key: string, signal: AbortSignal): Promise<ModelInfo[]>;
  vision(
    key: string,
    model: string,
    request: VisionRequest,
    signal: AbortSignal
  ): Promise<VisionResponse>;
}

const CREDIT_RE =
  /credit|billing|quota|balance|insufficient|payment|spending limit|exceeded your current/i;
const KEY_RE = /api key|apikey|unauthori[sz]ed|authentication|invalid.*key/i;
const MODEL_RE = /model.*(not found|does not exist|not available|invalid)/i;

/** Seconds or HTTP date → ms. */
export function retryAfter(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }
  const s = Number(value);
  if (Number.isFinite(s)) {
    return Math.max(0, s * 1000);
  }
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/**
 * Maps an HTTP status and error text to a kind. Shared by every adapter
 * so all providers mean the same thing by "credits" or "rate limit".
 */
export function classifyHttp(
  status: number,
  text: string,
  code?: string
): AiErrorKind {
  const haystack = `${code ?? ""} ${text}`;
  if (status === 402 || CREDIT_RE.test(haystack)) {
    return "credits";
  }
  if (status === 401 || (status === 403 && !CREDIT_RE.test(haystack))) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status === 404 || MODEL_RE.test(haystack)) {
    return "model";
  }
  if (status === 408) {
    return "timeout";
  }
  if (status >= 500) {
    return "unavailable";
  }
  if (status === 400 && KEY_RE.test(haystack)) {
    return "auth";
  }
  if (status >= 400) {
    return "bad_request";
  }
  return "unknown";
}

/** Errors thrown by fetch itself (no HTTP answer). */
export function classifyThrown(err: unknown, signal: AbortSignal): AiError {
  if (err instanceof AiError) {
    return err;
  }
  const name = (err as { name?: string })?.name;
  if (signal.aborted || name === "TimeoutError" || name === "AbortError") {
    return new AiError("timeout", "Tempo esgotado esperando o provedor.");
  }
  return new AiError(
    "network",
    err instanceof Error ? err.message : "Falha de rede."
  );
}
