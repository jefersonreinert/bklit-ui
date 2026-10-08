export const AI_MODELS = [
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    description: "Mais inteligente para análises e decisões",
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    description: "Rápido e capaz para o dia a dia",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    description: "O mais rápido para perguntas simples",
  },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_MODEL: AiModelId = "claude-opus-5-5";

/** Free models on Groq (OpenAI-compatible API), handy for testing. */
export const GROQ_MODELS = [
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B (Groq)",
    description: "Grátis para teste · o melhor do Groq, usa ferramentas",
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B (Groq)",
    description: "Grátis para teste · muito rápido",
  },
  {
    id: "qwen/qwen3.8-27b",
    name: "Qwen 3.8 27B (Groq)",
    description: "Grátis para teste · alternativa ao GPT-OSS",
  },
] as const;

export type GroqModelId = (typeof GROQ_MODELS)[number]["id"];
export type ChatModelId = AiModelId | GroqModelId;

export const DEFAULT_GROQ_MODEL: GroqModelId = "openai/gpt-oss-120b";

/** Every model the assistant, notes and voice can run on. */
export const CHAT_MODELS: {
  id: ChatModelId;
  name: string;
  description: string;
  provider: "anthropic" | "groq";
}[] = [
  ...AI_MODELS.map((m) => ({ ...m, provider: "anthropic" as const })),
  ...GROQ_MODELS.map((m) => ({ ...m, provider: "groq" as const })),
];

export const isGroqModel = (id: unknown): id is GroqModelId =>
  GROQ_MODELS.some((m) => m.id === id);

export const isChatModel = (id: unknown): id is ChatModelId =>
  CHAT_MODELS.some((m) => m.id === id);
