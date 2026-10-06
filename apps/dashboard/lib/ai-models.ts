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
