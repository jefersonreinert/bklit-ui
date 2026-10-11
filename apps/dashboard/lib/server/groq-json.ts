import { groqKey } from "./groq-chat";

/**
 * Structured JSON from Groq, used when the Anthropic account has no
 * credits: photos go to a vision model, text-only jobs to GPT-OSS. The
 * reply is parsed and filled against the JSON schema, so callers get the
 * same shape they get from Claude. Groq does not read PDFs: the caller
 * gets a GroqNeedsImages error and the browser retries with page images.
 */

const URL = "https://api.groq.com/openai/v1/chat/completions";

const split = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Tried in order (quota or a retired model moves to the next one). */
const VISION_MODELS = () => [
  ...split(process.env.GROQ_VISION_MODELS),
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];
const TEXT_MODELS = () => [
  ...split(process.env.GROQ_TEXT_MODELS),
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];

/** Groq vision accepts at most 5 images per request. */
export const GROQ_MAX_IMAGES = 5;

export class GroqError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "groq") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface GroqFile {
  data: string;
  mimeType: string;
}

type Schema = Record<string, unknown>;

function conformScalar(schema: Schema, value: unknown): unknown {
  switch (schema.type) {
    case "number":
    case "integer": {
      const n = typeof value === "string" ? Number.parseFloat(value) : value;
      return typeof n === "number" && Number.isFinite(n) ? n : 0;
    }
    case "boolean":
      return value === true || value === "true";
    case "string": {
      if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        return schema.enum[0] ?? "";
      }
      if (typeof value === "string") {
        return value;
      }
      return value == null ? "" : String(value);
    }
    default:
      return value ?? null;
  }
}

/**
 * Makes `value` match `schema`: missing fields get empty values, numbers
 * sent as strings become numbers, extra fields are dropped. Models other
 * than Claude sometimes skip fields of a large schema.
 */
export function conform(schema: Schema, value: unknown): unknown {
  const any = schema.anyOf as Schema[] | undefined;
  if (any) {
    if (value == null && any.some((s) => s.type === "null")) {
      return null;
    }
    return conform(any.find((s) => s.type !== "null") ?? {}, value);
  }
  if (schema.type === "object") {
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    const src =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      Object.entries(props).map(([k, s]) => [k, conform(s, src[k])])
    );
  }
  if (schema.type === "array") {
    return Array.isArray(value)
      ? value.map((v) => conform((schema.items ?? {}) as Schema, v))
      : [];
  }
  return conformScalar(schema, value);
}

const JSON_BLOCK = /\{[\s\S]*\}/;

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = JSON_BLOCK.exec(text);
    if (m) {
      return JSON.parse(m[0]);
    }
    throw new GroqError("Resposta do Groq incompleta; tente de novo.", 502);
  }
}

interface Attempt {
  model: string;
  messages: unknown[];
  schema: Schema;
  strict: boolean;
  maxTokens: number;
}

async function call(a: Attempt) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: a.model,
      messages: a.messages,
      temperature: 0.2,
      max_completion_tokens: a.maxTokens,
      response_format: a.strict
        ? {
            type: "json_schema",
            json_schema: { name: "result", schema: a.schema, strict: false },
          }
        : { type: "json_object" },
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    error?: { message?: string; code?: string };
  } | null;
  return { res, body };
}

const RETRY_NEXT_MODEL = new Set([404, 429, 503]);
const SCHEMA_UNSUPPORTED = /response_format|json_schema|structured/i;

function checkFiles(files: GroqFile[]) {
  if (!groqKey()) {
    throw new GroqError("Groq não configurado (GROQ_API_KEY).", 503);
  }
  if (files.some((f) => f.mimeType === "application/pdf")) {
    throw new GroqError(
      "O Groq não lê PDF: convertendo as páginas em imagens.",
      415,
      "needs_images"
    );
  }
  if (files.length > GROQ_MAX_IMAGES) {
    throw new GroqError(
      `Sem créditos na Anthropic: o Groq lê no máximo ${GROQ_MAX_IMAGES} imagens por vez. Envie menos páginas.`,
      413
    );
  }
}

function messagesFor(files: GroqFile[], prompt: string, schema: Schema) {
  const text = `${prompt}

Reply with ONE JSON object only (no markdown, no comments) that follows this JSON schema exactly, with every field present:
${JSON.stringify(schema)}`;
  return [
    {
      role: "user",
      content: files.length
        ? [
            ...files.map((f) => ({
              type: "image_url",
              image_url: { url: `data:${f.mimeType};base64,${f.data}` },
            })),
            { type: "text", text },
          ]
        : text,
    },
  ];
}

type Outcome =
  | { done: true; value: unknown }
  | { done: false; retrySameModel: boolean; error: string };

/** One request; decides whether to retry, move on or give up. */
async function attempt(a: Attempt): Promise<Outcome> {
  const { res, body } = await call(a);
  if (res.ok) {
    const choice = body?.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new GroqError(
        "Documento grande demais para o Groq. Envie menos páginas por vez.",
        413
      );
    }
    return {
      done: true,
      value: conform(a.schema, parse(choice?.message?.content ?? "")),
    };
  }
  const error = body?.error?.message ?? `Groq ${res.status}`;
  if (res.status === 401) {
    throw new GroqError("Chave do Groq inválida (GROQ_API_KEY).", 401);
  }
  if (!(RETRY_NEXT_MODEL.has(res.status) || res.status === 400)) {
    throw new GroqError(error, 502);
  }
  // A model without structured outputs: same model again in JSON mode
  const retrySameModel =
    a.strict && res.status === 400 && SCHEMA_UNSUPPORTED.test(error);
  return { done: false, retrySameModel, error };
}

/** Runs the prompt on the first Groq model that answers. */
export async function groqJson<T>(
  files: GroqFile[],
  prompt: string,
  schema: Schema
): Promise<T> {
  checkFiles(files);
  const vision = files.length > 0;
  const messages = messagesFor(files, prompt, schema);
  let last = "Groq indisponível.";
  for (const model of vision ? VISION_MODELS() : TEXT_MODELS()) {
    for (const strict of [true, false]) {
      const out = await attempt({
        model,
        messages,
        schema,
        strict,
        maxTokens: vision ? 8192 : 32_768,
      });
      if (out.done) {
        return out.value as T;
      }
      last = out.error;
      if (!out.retrySameModel) {
        break;
      }
    }
  }
  throw new GroqError(`Groq: ${last}`, 502);
}
