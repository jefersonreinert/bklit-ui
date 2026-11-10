import type { AiProviderId } from "@/lib/ai/providers-meta";
import { anthropicAdapter } from "./providers/anthropic";
import { openaiAdapter, xaiAdapter } from "./providers/openai-compatible";
import type { AiProviderAdapter } from "./types";

/** Every provider adapter, by id. New providers are one more line here. */
export const ADAPTERS: Record<AiProviderId, AiProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  xai: xaiAdapter,
};
