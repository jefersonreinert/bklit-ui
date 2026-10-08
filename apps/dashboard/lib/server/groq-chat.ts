import type Anthropic from "@anthropic-ai/sdk";
import type { ChatStreamEvent } from "@/lib/ai-events";

/**
 * The same conversation the Claude route runs, on Groq's OpenAI-compatible
 * Chat Completions API (free tier, for testing). Streams text and runs the
 * panel's own tools (Gmail, Drive, YouTube, WhatsApp, Convex) in a loop.
 * Remote MCP servers (Notion, GitHub) and images are Claude-only.
 */

const URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_TURNS = 8;
/** Each Groq model has its own free per-minute quota. */
const FALLBACK_ORDER = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];
const MAX_WAIT_SECONDS = 25;

class GroqRateLimit extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super(
      "Limite gratuito do Groq atingido. Espere um minuto e tente de novo."
    );
    this.retryAfter = retryAfter;
  }
}

export const groqKey = () => process.env.GROQ_API_KEY ?? null;

type BetaTool = Anthropic.Beta.BetaTool;

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type GroqMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface Chunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string | null;
  }[];
  error?: { message?: string };
}

export interface GroqRun {
  model: string;
  system: string;
  history: Anthropic.Beta.BetaMessageParam[];
  tools: BetaTool[];
  runTool: (
    name: string,
    input: unknown
  ) => Promise<{ content: string; isError: boolean }>;
  toolServer: (name: string) => string;
  emit: (e: ChatStreamEvent) => void;
  signal: AbortSignal;
}

function plainText(content: Anthropic.Beta.BetaMessageParam["content"]) {
  if (typeof content === "string") {
    return content;
  }
  let images = 0;
  const text = content
    .map((b) => {
      if (b.type === "text") {
        return b.text;
      }
      if (b.type === "image") {
        images++;
      }
      return "";
    })
    .join("\n");
  return images
    ? `${text}\n\n[${images} imagem(ns) anexada(s): este modelo não vê imagens]`
    : text;
}

function toMessages(system: string, history: GroqRun["history"]) {
  const out: GroqMessage[] = [{ role: "system", content: system }];
  for (const m of history) {
    const content = plainText(m.content);
    out.push(
      m.role === "user"
        ? { role: "user", content }
        : { role: "assistant", content }
    );
  }
  return out;
}

const toFunctions = (tools: BetaTool[]) =>
  tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.input_schema,
    },
  }));

async function errorText(res: Response) {
  const body = (await res.json().catch(() => null)) as Chunk | null;
  if (res.status === 401) {
    return "Chave do Groq inválida (GROQ_API_KEY).";
  }
  return `Groq: ${body?.error?.message ?? `erro ${res.status}`}`;
}

/** Applies one SSE chunk: text goes out, tool-call pieces accumulate. */
function applyChunk(
  chunk: Chunk,
  calls: ToolCall[],
  state: { text: string; finish: string | null },
  emit: GroqRun["emit"]
) {
  const choice = chunk.choices?.[0];
  const delta = choice?.delta;
  if (delta?.content) {
    state.text += delta.content;
    emit({ type: "text", text: delta.content });
  }
  for (const tc of delta?.tool_calls ?? []) {
    if (!calls[tc.index]) {
      calls[tc.index] = {
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      };
    }
    const call = calls[tc.index] as ToolCall;
    call.id = tc.id ?? call.id;
    call.function.name += tc.function?.name ?? "";
    call.function.arguments += tc.function?.arguments ?? "";
  }
  if (choice?.finish_reason) {
    state.finish = choice.finish_reason;
  }
}

/** Server-sent events → parsed JSON chunks, until `data: [DONE]`. */
async function readSse(
  body: ReadableStream<Uint8Array>,
  onChunk: (c: Chunk) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (data && data !== "[DONE]") {
        onChunk(JSON.parse(data) as Chunk);
      }
    }
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

/**
 * One turn with quota handling: on a 429 it moves to the next Groq model
 * (separate quota), and when every model is limited waits once.
 */
async function turnWithFallback(
  run: GroqRun,
  messages: GroqMessage[],
  functions: ReturnType<typeof toFunctions>
) {
  const models = [run.model, ...FALLBACK_ORDER.filter((m) => m !== run.model)];
  let waited = false;
  for (let i = 0; i < models.length; i++) {
    run.model = models[i] as string;
    try {
      return await streamTurn(run, messages, functions);
    } catch (err) {
      if (!(err instanceof GroqRateLimit)) {
        throw err;
      }
      const last = i === models.length - 1;
      if (!last) {
        run.emit({
          type: "notice",
          text: `Limite do Groq neste modelo; continuando com ${models[i + 1]}.`,
        });
        continue;
      }
      if (waited || err.retryAfter > MAX_WAIT_SECONDS) {
        throw err;
      }
      waited = true;
      run.emit({
        type: "notice",
        text: `Limite gratuito do Groq: aguardando ${err.retryAfter}s…`,
      });
      await sleep(err.retryAfter * 1000, run.signal);
      i = -1;
    }
  }
  throw new GroqRateLimit(60);
}

async function streamTurn(
  run: GroqRun,
  messages: GroqMessage[],
  functions: ReturnType<typeof toFunctions>
) {
  const res = await fetch(URL, {
    method: "POST",
    signal: run.signal,
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: run.model,
      messages,
      stream: true,
      max_completion_tokens: 8192,
      reasoning_format: "hidden",
      ...(functions.length ? { tools: functions, tool_choice: "auto" } : {}),
    }),
  });
  if (res.status === 429) {
    throw new GroqRateLimit(Number(res.headers.get("retry-after")) || 30);
  }
  if (!(res.ok && res.body)) {
    throw new Error(await errorText(res));
  }
  const calls: ToolCall[] = [];
  const state = { text: "", finish: null as string | null };
  await readSse(res.body, (chunk) => {
    if (chunk.error) {
      throw new Error(`Groq: ${chunk.error.message ?? "erro"}`);
    }
    applyChunk(chunk, calls, state, run.emit);
  });
  return { ...state, calls: calls.filter(Boolean) };
}

function parseArgs(raw: string) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function runGroqConversation(run: GroqRun) {
  const messages = toMessages(run.system, run.history);
  const functions = toFunctions(run.tools);
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const result = await turnWithFallback(run, messages, functions);
    if (result.finish !== "tool_calls" || result.calls.length === 0) {
      if (result.finish === "length") {
        run.emit({
          type: "notice",
          text: "Resposta interrompida pelo limite de tamanho.",
        });
      }
      return;
    }
    messages.push({
      role: "assistant",
      content: result.text || null,
      tool_calls: result.calls,
    });
    for (const call of result.calls) {
      run.emit({
        type: "tool",
        server: run.toolServer(call.function.name),
        name: call.function.name,
      });
      const out = await run.runTool(
        call.function.name,
        parseArgs(call.function.arguments)
      );
      run.emit({ type: "tool_done", error: out.isError });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: out.content,
      });
    }
  }
  run.emit({
    type: "notice",
    text: "Parei depois de muitas etapas com ferramentas. Peça para eu continuar se precisar.",
  });
}
