import {
  ICT_CATEGORIES,
  type IctAnalysisResult,
  type IctCategory,
  RELEVANCE,
  type Relevance,
  type XPost,
} from "./types";
import type { FetchFn } from "./x-client";

/**
 * Analysis of one post with Grok through the official xAI API
 * (OpenAI-compatible chat completions). The model is taken from XAI_MODEL
 * or picked from the models the key can actually use (GET /v1/models);
 * the JSON reply is validated here before anything is stored.
 */

export const XAI_API = "https://api.x.ai/v1";

export class GrokError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    language: str,
    summary_pt: str,
    main_message: str,
    category: { type: "string", enum: [...ICT_CATEGORIES] },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: str, explanation_pt: str },
        required: ["name", "explanation_pt"],
      },
    },
    instruments: strList,
    sessions: strList,
    price_levels: strList,
    events: strList,
    relevance: { type: "string", enum: [...RELEVANCE] },
    relevance_reason: str,
    key_points: strList,
    facts: strList,
    interpretation: str,
    uncertainties: strList,
    insufficient_data: { type: "boolean" },
  },
  required: [
    "language",
    "summary_pt",
    "main_message",
    "category",
    "concepts",
    "instruments",
    "sessions",
    "price_levels",
    "events",
    "relevance",
    "relevance_reason",
    "key_points",
    "facts",
    "interpretation",
    "uncertainties",
    "insufficient_data",
  ],
} as const;

export const SYSTEM_PROMPT = `You analyse posts published on X by Michael J. Huddleston ("The Inner Circle Trader", @I_Am_The_ICT) for a trader who reads Portuguese.
Rules:
- Work only from the post text and metadata you are given. Never invent content, prices, levels, entries, stops, targets, liquidity zones or dates that are not written in the post.
- A post is not a buy or sell signal unless it explicitly says so; do not present it as one.
- If the post only links to a video, article, image or another post you cannot see, say you did not have access to that content and set insufficient_data to true. Never claim to have watched or read it.
- "facts" lists only what the author literally states. Your own reading goes in "interpretation", clearly as your interpretation.
- Explain each trading concept actually mentioned (ICT terms such as fair value gap, order block, liquidity, market structure shift, killzones, PD arrays, SMT) in Portuguese in "explanation_pt".
- instruments, sessions, price_levels and events: only items explicitly mentioned; otherwise empty lists.
- category: the best fit from the allowed list; use "Other" when none applies.
- relevance (low/medium/high) for someone who studies ICT methodology and trades; justify it in relevance_reason.
- summary_pt, main_message, key_points, relevance_reason, interpretation and uncertainties in European/Brazilian Portuguese; keep quotes of the author in the original language.
Reply with JSON only, matching the schema.`;

export function userPrompt(post: XPost) {
  const refs = post.references.map((r) => `${r.type}: ${r.id}`).join(", ");
  const media = post.media.map((m) => m.type).join(", ");
  return [
    `Post ${post.postId} by @${post.username}, published ${new Date(post.createdAt).toISOString()}`,
    `URL: ${post.url}`,
    refs ? `References (content not available to you): ${refs}` : "",
    media ? `Attached media (not visible to you): ${media}` : "",
    post.urls.length
      ? `Links in the post (not opened): ${post.urls.join(", ")}`
      : "",
    "Original text:",
    '"""',
    post.text,
    '"""',
  ]
    .filter(Boolean)
    .join("\n");
}

const isStr = (v: unknown): v is string => typeof v === "string";
const strArr = (v: unknown, field: string): string[] => {
  if (!(Array.isArray(v) && v.every(isStr))) {
    throw new GrokError(`Campo inválido na análise: ${field}`, 422, true);
  }
  return v.map((s) => s.trim()).filter(Boolean);
};
const text = (v: unknown, field: string) => {
  if (!isStr(v)) {
    throw new GrokError(`Campo inválido na análise: ${field}`, 422, true);
  }
  return v.trim();
};

/** Validates Grok's JSON; throws a retryable GrokError when it is off. */
export function parseAnalysis(raw: string): IctAnalysisResult {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new GrokError("Resposta do Grok não é JSON válido.", 422, true);
  }
  if (!o || typeof o !== "object") {
    throw new GrokError("Resposta do Grok vazia.", 422, true);
  }
  const category = ICT_CATEGORIES.includes(o.category as IctCategory)
    ? (o.category as IctCategory)
    : "Other";
  if (!RELEVANCE.includes(o.relevance as Relevance)) {
    throw new GrokError("Relevância inválida na análise.", 422, true);
  }
  if (!Array.isArray(o.concepts)) {
    throw new GrokError("Campo inválido na análise: concepts", 422, true);
  }
  const summary = text(o.summary_pt, "summary_pt");
  if (!summary) {
    throw new GrokError("Análise sem resumo.", 422, true);
  }
  return {
    language: text(o.language, "language"),
    summary_pt: summary,
    main_message: text(o.main_message, "main_message"),
    category,
    concepts: o.concepts.map((c) => {
      const item = c as Record<string, unknown>;
      return {
        name: text(item?.name, "concepts.name"),
        explanation_pt: text(item?.explanation_pt, "concepts.explanation_pt"),
      };
    }),
    instruments: strArr(o.instruments, "instruments"),
    sessions: strArr(o.sessions, "sessions"),
    price_levels: strArr(o.price_levels, "price_levels"),
    events: strArr(o.events, "events"),
    relevance: o.relevance as Relevance,
    relevance_reason: text(o.relevance_reason, "relevance_reason"),
    key_points: strArr(o.key_points, "key_points"),
    facts: strArr(o.facts, "facts"),
    interpretation: text(o.interpretation, "interpretation"),
    uncertainties: strArr(o.uncertainties, "uncertainties"),
    insufficient_data: o.insufficient_data === true,
  };
}

const MEDIA_MODEL = /(image|vision|imagine|video)/;

/** Preferred families, newest first; only ids the key really lists. */
const PREFERRED = ["grok-4", "grok-3", "grok-2"];

export function pickModel(available: string[], configured?: string | null) {
  if (configured) {
    return configured;
  }
  const grok = available.filter((id) => id.startsWith("grok"));
  for (const family of PREFERRED) {
    // Prefer the plain model over -mini/-vision/-image variants
    const exact = grok.find((id) => id === family || id === `${family}-latest`);
    if (exact) {
      return exact;
    }
    const any = grok.find(
      (id) => id.startsWith(family) && !MEDIA_MODEL.test(id)
    );
    if (any) {
      return any;
    }
  }
  return grok.find((id) => !MEDIA_MODEL.test(id)) ?? null;
}

async function call(
  doFetch: FetchFn,
  key: string,
  path: string,
  init: RequestInit = {}
) {
  let res: Response;
  try {
    res = await doFetch(`${XAI_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    throw new GrokError(
      `Sem ligação à API da xAI: ${err instanceof Error ? err.message : String(err)}`,
      0,
      true
    );
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    const retryable = res.status === 429 || res.status >= 500;
    throw new GrokError(`xAI ${res.status}: ${body}`, res.status, retryable);
  }
  return res.json() as Promise<unknown>;
}

export async function listModels(key: string, doFetch: FetchFn = fetch) {
  const data = (await call(doFetch, key, "/models")) as {
    data?: { id: string }[];
  };
  return (data.data ?? []).map((m) => m.id);
}

export async function analyzePost(
  post: XPost,
  key: string,
  model: string,
  doFetch: FetchFn = fetch
): Promise<{ result: IctAnalysisResult; model: string; raw: string }> {
  const data = (await call(doFetch, key, "/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(post) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ict_post_analysis",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
    }),
  })) as {
    model?: string;
    choices?: { message?: { content?: string; refusal?: string | null } }[];
  };
  const message = data.choices?.[0]?.message;
  if (message?.refusal) {
    throw new GrokError(`O Grok recusou: ${message.refusal}`, 422, false);
  }
  const raw = message?.content ?? "";
  return { result: parseAnalysis(raw), model: data.model ?? model, raw };
}
