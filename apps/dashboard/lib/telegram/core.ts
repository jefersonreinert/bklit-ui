/**
 * Pure helpers of the Telegram connector, shared by the browser, the chat
 * route and the Convex Node actions (no JSON import, so Convex can bundle it).
 */

export type ToolTier = "read-only" | "write" | "destructive";

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export interface TgTool {
  name: string;
  module: string;
  tier: ToolTier;
  description: string;
  inputSchema: JsonSchema;
}

/** Group labels, in the order the explorer shows them. */
export const TG_MODULES: { key: string; label: string }[] = [
  { key: "auth", label: "Conexão" },
  { key: "messages", label: "Mensagens" },
  { key: "chats", label: "Conversas e grupos" },
  { key: "media", label: "Mídia" },
  { key: "send-media", label: "Enviar mídia" },
  { key: "contacts", label: "Contatos" },
  { key: "reactions", label: "Reações" },
  { key: "transcribe", label: "Transcrição" },
  { key: "fact-check", label: "Checagem de fatos" },
  { key: "extras", label: "Fixar, agendar, enquetes e tópicos" },
  { key: "account", label: "Conta e privacidade" },
  { key: "business", label: "Telegram Business" },
  { key: "folders", label: "Pastas" },
  { key: "stickers", label: "Figurinhas" },
  { key: "stories", label: "Stories" },
  { key: "boosts", label: "Boosts" },
  { key: "group-calls", label: "Chamadas em grupo" },
  { key: "stars", label: "Stars e presentes" },
  { key: "quick-replies", label: "Respostas rápidas" },
  { key: "music", label: "Música" },
];

export const TIER_LABEL: Record<ToolTier, string> = {
  "read-only": "Leitura",
  write: "Escrita",
  destructive: "Destrutiva",
};

/** Opt-in groups the package hides unless its env flag is "1". */
export const OPT_IN_GROUPS = {
  stars: "MCP_TELEGRAM_ENABLE_STARS",
  "group-calls": "MCP_TELEGRAM_ENABLE_GROUP_CALLS",
  "quick-replies": "MCP_TELEGRAM_ENABLE_QUICK_REPLIES",
} as const;
export type OptInGroup = keyof typeof OPT_IN_GROUPS;
export const isOptInGroup = (m: string): m is OptInGroup => m in OPT_IN_GROUPS;

/**
 * Login and logout run through the panel's own flow (QR or phone code that
 * survive between serverless calls), not through the package's tools.
 */
export const PANEL_ONLY_TOOLS = new Set(["telegram-login", "telegram-logout"]);

const ABSOLUTE_PATH = /absolute (local )?(filesystem )?path/i;
/** Parameters where the tool writes a file instead of reading one. */
const OUTPUT_PATH_KEYS = new Set(["downloadPath", "savePath"]);

/**
 * Parameters that take a local file path. In the panel the person picks a
 * file instead (it is uploaded to the server's temp folder), and files the
 * tool saves come back to the browser as downloads.
 */
export function fileParams(schema: JsonSchema) {
  const inputs: string[] = [];
  const outputs: string[] = [];
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (OUTPUT_PATH_KEYS.has(key)) {
      outputs.push(key);
    } else if (ABSOLUTE_PATH.test(prop.description ?? "")) {
      inputs.push(key);
    }
  }
  return { inputs, outputs };
}

/** A file picked in the browser, sent in place of a path parameter. */
export interface UploadedFile {
  tgUpload: { name: string; type: string; data: string };
}

export const isUploadedFile = (v: unknown): v is UploadedFile =>
  typeof v === "object" &&
  v !== null &&
  "tgUpload" in v &&
  typeof (v as UploadedFile).tgUpload?.data === "string";

/** What a tool returned, ready for the browser and the assistant. */
export interface ToolOutput {
  ok: boolean;
  text: string;
  images: { mimeType: string; data: string }[];
  files: { name: string; mimeType: string; data: string; size: number }[];
}

interface McpContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

/** Flattens an MCP CallToolResult (text and image parts). */
export function toOutput(result: {
  content?: unknown;
  isError?: unknown;
}): ToolOutput {
  const parts = Array.isArray(result.content)
    ? (result.content as McpContent[])
    : [];
  return {
    ok: result.isError !== true,
    text: parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n\n"),
    images: parts
      .filter((p) => p.type === "image" && typeof p.data === "string")
      .map((p) => ({
        mimeType: p.mimeType ?? "image/png",
        data: p.data as string,
      })),
    files: [],
  };
}

/** Whether `source` may run a tool of this tier. */
export function tierAllowed(
  tier: ToolTier,
  source: "panel" | "assistant",
  assistantWrites: boolean
) {
  return source === "panel" || tier === "read-only" || assistantWrites;
}

const MAGIC: [number[], string][] = [
  [[0xff, 0xd8, 0xff], "image/jpeg"],
  [[0x89, 0x50, 0x4e, 0x47], "image/png"],
  [[0x47, 0x49, 0x46, 0x38], "image/gif"],
  [[0x25, 0x50, 0x44, 0x46], "application/pdf"],
  [[0x4f, 0x67, 0x67, 0x53], "audio/ogg"],
  [[0x1a, 0x45, 0xdf, 0xa3], "video/webm"],
];

/** Media type of a downloaded file from its first bytes. */
export function sniffMime(bytes: Uint8Array) {
  for (const [sig, type] of MAGIC) {
    if (sig.every((b, i) => bytes[i] === b)) {
      return type;
    }
  }
  const tag = String.fromCharCode(...bytes.slice(4, 12));
  if (tag.startsWith("ftyp")) {
    return "video/mp4";
  }
  if (String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return "application/octet-stream";
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "audio/ogg": "ogg",
  "video/webm": "webm",
  "video/mp4": "mp4",
};
export const extensionFor = (mime: string) => EXT[mime] ?? "bin";

const DIGITS = /^\d{3,12}$/;
const HASH = /^[a-f0-9]{32}$/i;

/** Validates api_id / api_hash from my.telegram.org before saving. */
export function checkCredentials(apiId: string, apiHash: string) {
  const id = apiId.trim();
  const hash = apiHash.trim();
  if (!DIGITS.test(id)) {
    return { ok: false as const, message: "O api_id tem só números." };
  }
  if (!HASH.test(hash)) {
    return {
      ok: false as const,
      message: "O api_hash tem 32 caracteres (0-9 e a-f).",
    };
  }
  return { ok: true as const, apiId: Number(id), apiHash: hash.toLowerCase() };
}

const PHONE = /^\+\d{7,15}$/;
const NOT_DIGITS = /[^\d+]/g;

/** "+55 (11) 99999-0000" → "+5511999990000", or null when invalid. */
export function normalizePhone(raw: string) {
  const phone = raw.replace(NOT_DIGITS, "");
  return PHONE.test(phone) ? phone : null;
}

/** "+5511999990000" → "+55 •••• 0000" (for status lines). */
export function maskPhone(phone: string | undefined) {
  if (!phone) {
    return null;
  }
  return `${phone.slice(0, 3)} •••• ${phone.slice(-4)}`;
}

export interface ChatRow {
  kind: "private" | "group" | "channel";
  name: string;
  id: string;
  bot: boolean;
  notContact: boolean;
  unread: number;
}

const CHAT_LINE = /^([PGC]) (.+) \((-?\d+)\)((?: \[[^\]]+\])*)$/;
const UNREAD = /\[(\d+) unread\]/;
const KINDS = { P: "private", G: "group", C: "channel" } as const;

/** Parses telegram-list-chats ("G Name (id) [3 unread]" per line). */
export function parseChats(text: string): ChatRow[] {
  const rows: ChatRow[] = [];
  for (const line of text.split("\n")) {
    const m = CHAT_LINE.exec(line.trim());
    if (!m) {
      continue;
    }
    const tags = m[4] ?? "";
    rows.push({
      kind: KINDS[m[1] as keyof typeof KINDS],
      name: m[2] ?? "",
      id: m[3] ?? "",
      bot: tags.includes("[bot]"),
      notContact: tags.includes("[not in contacts]"),
      unread: Number(UNREAD.exec(tags)?.[1] ?? 0),
    });
  }
  return rows;
}

export interface MessageRow {
  id: number;
  date: string;
  sender: string;
  text: string;
}

const MESSAGE_HEAD = /^\[#(\d+)\] \[([^\]]+)\] ([^:]*): ?/;

/**
 * Parses telegram-read-messages / search output ("[#id] [date] Sender:
 * text", messages separated by blank lines; text may span lines). Oldest
 * first.
 */
export function parseMessages(text: string): MessageRow[] {
  const rows: MessageRow[] = [];
  for (const line of text.split("\n")) {
    const m = MESSAGE_HEAD.exec(line);
    const last = rows.at(-1);
    if (m) {
      rows.push({
        id: Number(m[1]),
        date: m[2] ?? "",
        sender: m[3] ?? "",
        text: line.slice(m[0].length),
      });
    } else if (last) {
      last.text += `\n${line}`;
    }
  }
  for (const r of rows) {
    r.text = r.text.trimEnd();
  }
  return rows.sort((a, b) => a.id - b.id);
}
