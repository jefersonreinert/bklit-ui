/**
 * A small MCP client for the metatrader-mcp-server running on the person's
 * MT5 machine. Speaks both of its network transports:
 *
 * - streamable-http (`--transport streamable-http`, URL ends in /mcp):
 *   JSON-RPC over POST, answers as JSON or as an SSE stream.
 * - sse (the server's default, URL ends in /sse): a GET event stream that
 *   announces a POST endpoint; answers come back on the stream.
 *
 * No SDK so it runs anywhere fetch does (Convex actions, tests).
 */

export type McpTransport = "streamable-http" | "sse";

export interface McpTarget {
  url: string;
  transport: McpTransport;
  /** Extra headers, e.g. a reverse proxy's Authorization or CF Access. */
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PROTOCOL = "2025-03-26";
const CLIENT = { name: "casa-brasa-painel", version: "1.0.0" };
const DEFAULT_TIMEOUT = 30_000;
const LINE = /\r?\n/;
const LEADING_SPACE = /^ /;
const CRLF = /\r\n/g;

export class McpError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "McpError";
    this.code = code;
  }
}

export interface SseEvent {
  event: string;
  data: string;
}

/** Splits SSE text into events (blank line separated, multi-line data). */
export function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  let event = "message";
  let data: string[] = [];
  const flush = () => {
    if (data.length > 0) {
      events.push({ event, data: data.join("\n") });
    }
    event = "message";
    data = [];
  };
  for (const line of text.split(LINE)) {
    if (line === "") {
      flush();
    } else if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(LEADING_SPACE, ""));
    }
  }
  flush();
  return events;
}

/** Reads an SSE body incrementally, yielding complete events. */
async function* sseEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true }).replace(CRLF, "\n");
      let cut = buffer.indexOf("\n\n");
      while (cut >= 0) {
        yield* parseSse(buffer.slice(0, cut + 2));
        buffer = buffer.slice(cut + 2);
        cut = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) {
      yield* parseSse(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

function rpc(id: number | undefined, method: string, params?: unknown) {
  return JSON.stringify({
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id }),
    method,
    ...(params === undefined ? {} : { params }),
  });
}

function unwrap(msg: JsonRpcResponse): unknown {
  if (msg.error) {
    throw new McpError(
      msg.error.message || "Erro do servidor MCP",
      msg.error.code
    );
  }
  return msg.result;
}

async function httpError(res: Response) {
  const text = (await res.text().catch(() => "")).slice(0, 300);
  if (res.status === 401 || res.status === 403) {
    return new McpError(
      `Acesso negado pelo servidor (${res.status}). Confira os cabeçalhos de autenticação.`
    );
  }
  if (res.status === 404) {
    return new McpError(
      "Endereço não encontrado (404). O URL deve terminar em /mcp (streamable-http) ou /sse."
    );
  }
  return new McpError(`HTTP ${res.status}${text ? `: ${text}` : ""}`);
}

const initParams = {
  protocolVersion: PROTOCOL,
  capabilities: {},
  clientInfo: CLIENT,
};

/* ---------------------------- streamable-http ---------------------------- */

async function readHttpAnswer(res: Response, id: number) {
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/event-stream") && res.body) {
    for await (const ev of sseEvents(res.body)) {
      const msg = JSON.parse(ev.data) as JsonRpcResponse;
      if (msg.id === id) {
        return unwrap(msg);
      }
    }
    throw new McpError("O servidor fechou o stream sem responder.");
  }
  const body = (await res.json()) as JsonRpcResponse | JsonRpcResponse[];
  const msg = Array.isArray(body) ? body.find((m) => m.id === id) : body;
  if (!msg) {
    throw new McpError("Resposta sem o id do pedido.");
  }
  return unwrap(msg);
}

async function streamableSession<T>(
  t: McpTarget,
  signal: AbortSignal,
  work: (
    call: (method: string, params?: unknown) => Promise<unknown>
  ) => Promise<T>
): Promise<T> {
  let session: string | null = null;
  let nextId = 1;
  const post = async (body: string) => {
    const res = await fetch(t.url, {
      method: "POST",
      signal,
      headers: {
        ...t.headers,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL,
        ...(session ? { "mcp-session-id": session } : {}),
      },
      body,
    });
    if (!res.ok) {
      throw await httpError(res);
    }
    return res;
  };
  const call = async (method: string, params?: unknown) => {
    const id = nextId++;
    const res = await post(rpc(id, method, params));
    session = res.headers.get("mcp-session-id") ?? session;
    return await readHttpAnswer(res, id);
  };
  await call("initialize", initParams);
  const ack = await post(rpc(undefined, "notifications/initialized"));
  await ack.body?.cancel().catch(() => undefined);
  try {
    return await work(call);
  } finally {
    if (session) {
      await fetch(t.url, {
        method: "DELETE",
        headers: { ...t.headers, "mcp-session-id": session },
      }).catch(() => undefined);
    }
  }
}

/* ---------------------------------- sse ---------------------------------- */

async function sseSession<T>(
  t: McpTarget,
  signal: AbortSignal,
  work: (
    call: (method: string, params?: unknown) => Promise<unknown>
  ) => Promise<T>
): Promise<T> {
  // Own controller for the event stream: aborting it is the only reliable
  // way to end the read loop (the body is locked by its reader).
  const stream = new AbortController();
  const stop = () => stream.abort();
  signal.addEventListener("abort", stop);
  const res = await fetch(t.url, {
    method: "GET",
    signal: stream.signal,
    headers: { ...t.headers, accept: "text/event-stream" },
  });
  if (!(res.ok && res.body)) {
    throw await httpError(res);
  }
  const events = sseEvents(res.body);
  const first = await events.next();
  if (first.done || first.value.event !== "endpoint") {
    throw new McpError("O servidor SSE não anunciou o endpoint de mensagens.");
  }
  const endpoint = new URL(first.value.data.trim(), t.url).toString();
  const pending = new Map<number, (msg: JsonRpcResponse) => void>();
  let closed: Error | null = null;
  const pump = (async () => {
    for await (const ev of events) {
      if (ev.event !== "message") {
        continue;
      }
      const msg = JSON.parse(ev.data) as JsonRpcResponse;
      if (typeof msg.id === "number") {
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
      }
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      // Stream gone: fail whatever still waits for an answer.
      closed = new McpError("A ligação SSE com o servidor caiu.");
      for (const resolve of pending.values()) {
        resolve({
          jsonrpc: "2.0",
          error: { code: -1, message: closed.message },
        });
      }
      pending.clear();
    });

  let nextId = 1;
  const send = async (body: string) => {
    const r = await fetch(endpoint, {
      method: "POST",
      signal,
      headers: { ...t.headers, "content-type": "application/json" },
      body,
    });
    if (!r.ok) {
      throw await httpError(r);
    }
    await r.body?.cancel().catch(() => undefined);
  };
  const call = async (method: string, params?: unknown) => {
    const id = nextId++;
    if (closed) {
      throw closed;
    }
    const answer = new Promise<JsonRpcResponse>((resolve) => {
      pending.set(id, resolve);
    });
    await send(rpc(id, method, params));
    return unwrap(await answer);
  };
  try {
    await call("initialize", initParams);
    await send(rpc(undefined, "notifications/initialized"));
    return await work(call);
  } finally {
    signal.removeEventListener("abort", stop);
    stream.abort();
    await pump;
  }
}

/** Opens a session, runs `work` with a JSON-RPC caller, closes it. */
export async function withMcp<T>(
  t: McpTarget,
  work: (
    call: (method: string, params?: unknown) => Promise<unknown>
  ) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    t.timeoutMs ?? DEFAULT_TIMEOUT
  );
  try {
    const run = t.transport === "sse" ? sseSession : streamableSession;
    return await run(t, controller.signal, work);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new McpError(
        "O servidor MetaTrader não respondeu a tempo. O PC/VPS e o MT5 estão ligados?"
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------- results -------------------------------- */

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface McpCallResult {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

const tryJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * The value a FastMCP tool returned: structuredContent.result when the
 * server sends it, else the text parts (one per list item for lists).
 */
export function toolValue(result: unknown): { ok: boolean; value: unknown } {
  const r = (result ?? {}) as McpCallResult;
  const texts = (r.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string);
  let value: unknown;
  const structured = r.structuredContent as { result?: unknown } | undefined;
  if (structured && typeof structured === "object" && "result" in structured) {
    value = structured.result;
  } else if (structured !== undefined) {
    value = structured;
  } else if (texts.length === 1) {
    value = tryJson(texts[0] as string);
  } else {
    value = texts.map(tryJson);
  }
  const reportedError =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { error?: unknown }).error === true;
  return { ok: !(r.isError || reportedError), value };
}

export async function listTools(t: McpTarget): Promise<McpToolInfo[]> {
  return await withMcp(t, async (call) => {
    const r = (await call("tools/list", {})) as { tools?: McpToolInfo[] };
    return r.tools ?? [];
  });
}

export async function callTool(
  t: McpTarget,
  name: string,
  args: Record<string, unknown>
) {
  return await withMcp(t, async (call) =>
    toolValue(await call("tools/call", { name, arguments: args }))
  );
}
