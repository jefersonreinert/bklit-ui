import { unzipSync } from "fflate";

/**
 * The files of an import as one tree of paths ("Page/Sub page abc.md").
 * Notion exports are a .zip that may hold more .zip parts; they are opened
 * here and merged (their own name never becomes part of the paths).
 */
export type Vfs = Map<string, Uint8Array>;

const ZIP = /\.zip$/i;
const MAC_JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$)/;
const BACKSLASH = /\\/g;
const LEADING_SLASH = /^\/+/;

export const normPath = (p: string) =>
  p.replace(BACKSLASH, "/").replace(LEADING_SLASH, "").normalize("NFC");

function add(vfs: Vfs, path: string, bytes: Uint8Array, depth: number) {
  if (MAC_JUNK.test(path) || path.endsWith("/")) {
    return;
  }
  if (ZIP.test(path) && depth < 4) {
    const entries = unzipSync(bytes);
    for (const [name, data] of Object.entries(entries)) {
      add(vfs, name, data, depth + 1);
    }
    return;
  }
  vfs.set(normPath(path), bytes);
}

export async function readInputs(files: File[]): Promise<Vfs> {
  const vfs: Vfs = new Map();
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    add(vfs, f.webkitRelativePath || f.name, bytes, 0);
  }
  return vfs;
}

/** "a/b/c.md" → "a/b/" */
export const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

export const baseOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Resolves "../x/y.png" against a directory ("a/b/"). */
export function joinPath(dir: string, rel: string) {
  const out: string[] = dir.split("/").filter(Boolean);
  for (const part of rel.split("/")) {
    if (part === "..") {
      out.pop();
    } else if (part !== "." && part !== "") {
      out.push(part);
    }
  }
  return normPath(out.join("/"));
}

/** Relative link from a directory to a path, URL-encoded per segment. */
export function relativeLink(fromDir: string, to: string) {
  const from = fromDir.split("/").filter(Boolean);
  const target = to.split("/");
  let same = 0;
  while (same < from.length && from[same] === target[same]) {
    same++;
  }
  const up = from.slice(same).map(() => "..");
  return [...up, ...target.slice(same)].map(encodeURIComponent).join("/");
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  heic: "image/heic",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  json: "application/json",
  zip: "application/zip",
};

export function mimeOf(name: string) {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

const decoder = new TextDecoder();
export const text = (bytes: Uint8Array) => decoder.decode(bytes);
