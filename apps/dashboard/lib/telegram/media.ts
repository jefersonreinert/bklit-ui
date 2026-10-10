/**
 * Telegram media for the gallery: kinds, labels, day/month/year keys and
 * the media marker mcp-telegram appends to message text. Pure (no GramJS),
 * shared by the Convex Node action and the browser.
 */

export const MEDIA_KINDS = [
  "photo",
  "video",
  "audio",
  "voice",
  "pdf",
  "document",
  "gif",
  "sticker",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const KIND_LABEL: Record<MediaKind, string> = {
  photo: "Fotos",
  video: "Vídeos",
  audio: "Músicas / MP3",
  voice: "Áudios de voz",
  pdf: "PDFs",
  document: "Arquivos",
  gif: "GIFs",
  sticker: "Figurinhas",
};

export const isMediaKind = (k: string): k is MediaKind =>
  (MEDIA_KINDS as readonly string[]).includes(k);

/** What the Node side reads from a GramJS message (plain data, testable). */
export interface MediaShape {
  photo?: boolean;
  mimeType?: string;
  fileName?: string;
  voice?: boolean;
  audio?: boolean;
  video?: boolean;
  round?: boolean;
  sticker?: boolean;
  animated?: boolean;
}

export function classifyMedia(m: MediaShape): MediaKind {
  if (m.photo) {
    return "photo";
  }
  const mime = (m.mimeType ?? "").toLowerCase();
  if (m.sticker) {
    return "sticker";
  }
  if (m.animated || mime === "image/gif") {
    return "gif";
  }
  if (m.voice) {
    return "voice";
  }
  if (m.audio || mime.startsWith("audio/")) {
    return mime === "audio/ogg" && !m.fileName ? "voice" : "audio";
  }
  if (m.video || m.round || mime.startsWith("video/")) {
    return "video";
  }
  if (
    mime === "application/pdf" ||
    m.fileName?.toLowerCase().endsWith(".pdf")
  ) {
    return "pdf";
  }
  if (mime.startsWith("image/")) {
    return "photo";
  }
  return "document";
}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "application/x-tgsticker": "tgs",
};

const UNSAFE_NAME = /[\\/:*?"<>|]+/g;
const CONTROL = /\p{Cc}+/gu;

/** A file name for the download, from the original or the kind + id. */
export function mediaFileName(
  kind: MediaKind,
  messageId: number,
  mime: string,
  original?: string
) {
  const clean = original?.replace(CONTROL, "").replace(UNSAFE_NAME, "_").trim();
  if (clean) {
    return clean.slice(0, 120);
  }
  const ext = EXTENSION[mime] ?? (kind === "photo" ? "jpg" : "bin");
  return `${kind}-${messageId}.${ext}`;
}

/** Day/month/year keys in the person's time zone (gallery navigation). */
export function dateKeys(ms: number, timeZone?: string) {
  let parts: Record<string, string> = {};
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timeZone || "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date(ms))
        .map((p) => [p.type, p.value])
    );
  } catch {
    return dateKeys(ms, "UTC");
  }
  const year = parts.year ?? "1970";
  const month = `${year}-${parts.month ?? "01"}`;
  return { year, month, day: `${month}-${parts.day ?? "01"}` };
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-10" → "outubro de 2026"; "2026-10-05" → "5 de outubro de 2026". */
export function keyLabel(key: string) {
  const [y, m, d] = key.split("-");
  const month = MONTHS[Number(m) - 1];
  if (!month) {
    return y ?? key;
  }
  return d ? `${Number(d)} de ${month} de ${y}` : `${month} de ${y}`;
}

export const monthName = (key: string) =>
  MONTHS[Number(key.split("-")[1]) - 1] ?? key;

/**
 * mcp-telegram ends a message line with "[photo]", "[video: a.mp4]",
 * "[document: menu.pdf]"… (before any reactions).
 */
const MEDIA_MARKER = /\[(photo|video|audio|document|sticker)(?::\s([^\]]+))?\]/;

export function mediaMarker(text: string) {
  const m = MEDIA_MARKER.exec(text);
  return m ? { type: m[1] ?? "document", fileName: m[2] ?? null } : null;
}

export function formatBytes(n: number) {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${Math.round(n / 1024)} KB`;
  }
  if (n < 1024 ** 3) {
    return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  }
  return `${(n / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
}

/** Counts per year → month → day, for the gallery's date navigation. */
export type MediaCalendar = Record<
  string,
  Record<string, Record<string, number>>
>;

export function addToCalendar(
  cal: MediaCalendar,
  keys: { year: string; month: string; day: string }
) {
  const months = cal[keys.year] ?? {};
  cal[keys.year] = months;
  const days = months[keys.month] ?? {};
  months[keys.month] = days;
  days[keys.day] = (days[keys.day] ?? 0) + 1;
  return cal;
}
