/**
 * The Inner Circle Trader monitor: posts of @I_Am_The_ICT collected by a
 * Convex cron (convex/ict.ts), analysed by Grok (xAI) and shown in
 * /ict. Pure types and constants shared by the backend and the page.
 */

export const ICT_ACCOUNT = {
  name: "The Inner Circle Trader",
  username: "I_Am_The_ICT",
  url: "https://x.com/i_am_the_ict",
} as const;

export const ICT_CATEGORIES = [
  "Market Analysis",
  "Trading Education",
  "ICT Concepts",
  "Market Structure",
  "Liquidity",
  "Price Action",
  "Economic Events",
  "Personal Commentary",
  "Announcement",
  "Other",
] as const;
export type IctCategory = (typeof ICT_CATEGORIES)[number];

export const RELEVANCE = ["low", "medium", "high"] as const;
export type Relevance = (typeof RELEVANCE)[number];

export const RELEVANCE_LABEL: Record<Relevance, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

/** What Grok returns for one post, validated by parseAnalysis(). */
export interface IctAnalysisResult {
  language: string;
  summary_pt: string;
  main_message: string;
  category: IctCategory;
  concepts: { name: string; explanation_pt: string }[];
  instruments: string[];
  sessions: string[];
  price_levels: string[];
  events: string[];
  relevance: Relevance;
  relevance_reason: string;
  key_points: string[];
  facts: string[];
  interpretation: string;
  uncertainties: string[];
  insufficient_data: boolean;
}

/** A post as normalized from the X API v2 response. */
export interface XPost {
  postId: string;
  authorId: string;
  username: string;
  text: string;
  createdAt: number;
  url: string;
  conversationId?: string;
  /** "replied_to" | "quoted" | "retweeted" + the referenced post id. */
  references: { type: string; id: string }[];
  media: { type: string; url?: string; previewUrl?: string }[];
  urls: string[];
  metrics?: Record<string, number>;
  /** The original API object, kept untouched as JSON. */
  raw: string;
}

export type MonitorStatus =
  | "idle"
  | "syncing"
  | "paused"
  | "auth_error"
  | "rate_limited"
  | "unavailable"
  | "not_configured"
  | "error";

export const STATUS_LABEL: Record<MonitorStatus, string> = {
  idle: "Monitorização ativa",
  syncing: "A sincronizar",
  paused: "Monitorização pausada",
  auth_error: "Erro de autenticação (X)",
  rate_limited: "Limite da API do X atingido",
  unavailable: "API do X temporariamente indisponível",
  not_configured: "Chave da API do X não configurada",
  error: "Erro na recolha",
};

export interface AlertRules {
  /** Alert on every new post. */
  newPost: boolean;
  categories: string[];
  keywords: string[];
  concepts: string[];
  /** Alert when Grok rates the post at least this relevant. */
  minRelevance: Relevance | null;
}

export const DEFAULT_ALERT_RULES: AlertRules = {
  newPost: false,
  categories: [],
  keywords: [],
  concepts: [],
  minRelevance: "high",
};
