/** File kinds of Documentos → Arquivos, from MIME type and name. */

export type FileKind = "image" | "video" | "pdf" | "audio" | "sheet" | "other";

const EXT = /\.([a-z0-9]{1,8})$/i;

const BY_EXT: Record<string, FileKind> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  heic: "image",
  heif: "image",
  avif: "image",
  bmp: "image",
  mp4: "video",
  mov: "video",
  webm: "video",
  m4v: "video",
  mkv: "video",
  pdf: "pdf",
  mp3: "audio",
  m4a: "audio",
  wav: "audio",
  ogg: "audio",
  md: "sheet",
  txt: "sheet",
};

export function extOf(name: string) {
  return EXT.exec(name)?.[1]?.toLowerCase() ?? "";
}

export function kindOf(mimeType: string, name: string): FileKind {
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  return BY_EXT[extOf(name)] ?? "other";
}

export function formatBytes(n: number) {
  if (n < 1024) {
    return `${n} B`;
  }
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

/** Name without extension, for sheets made from a file. */
export const baseName = (name: string) => name.replace(EXT, "");

/** Folder colors for the folder widgets. */
export const FOLDER_COLORS = [
  "#5b8def",
  "#f2a33a",
  "#e5534b",
  "#3fb27f",
  "#a371f7",
  "#d4a27f",
  "#8b949e",
] as const;
