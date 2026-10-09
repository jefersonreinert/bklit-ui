import { addFile, currentFiles, currentNotes, newId, saveNote } from "../db";
import type { Note } from "../types";
import { markdownTable, parseCsv } from "./csv";
import { htmlToMarkdown } from "./html";
import {
  baseOf,
  dirOf,
  joinPath,
  mimeOf,
  readInputs,
  text,
  type Vfs,
} from "./vfs";

/**
 * Imports a Notion export (Markdown & CSV or HTML, as the .zip Notion
 * gives, or loose .md files). Folders become sub-pages, links between
 * pages and to images/files keep working, databases become tables with
 * their rows as sub-pages. Importing the same export again updates the
 * pages it created instead of duplicating them.
 */

export interface ImportProgress {
  done: number;
  total: number;
  label: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  files: number;
  /** First top-level page, to open after the import. */
  rootId: string | null;
}

type Kind = "md" | "html" | "csv";

interface Page {
  path: string;
  dir: string;
  kind: Kind;
  stem: string;
  key: string;
  noteId: string;
  existing?: Note;
  parent: Page | null;
  title: string;
  body: string;
  icon?: string;
  cover?: string;
  /** Position of the first link to this page inside its parent. */
  order: number;
}

const PAGE_EXT = /\.(md|markdown|html?|csv)$/i;
const EXT = /\.[^.]+$/;
const NOTION_ID = /^(.*?)\s+([0-9a-f]{32})$/i;
/** Pages exported from these notes end in the note's own id. */
const APP_ID = /^(.*?)\s+([a-z0-9]{9,16})$/;
const ALL_SUFFIX = /_all$/;
const TITLE_LINE = /^#\s+(.+)$/;
const PROPERTY = /^([^:\n*#>|[-][^:\n]{0,59}):\s+(.*)$/;
const ASIDE = /<aside>\s*\n?([\s\S]*?)\n?\s*<\/aside>/g;
const LINK =
  /(!?)\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g;
const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const NOTION_URL = /notion\.(?:so|site)\/.*?([0-9a-f]{32})/i;
const HASH = /[#?].*$/;
const LEADING_NEWLINES = /^\n+/;
const BLANK_RUNS = /\n{3,}/g;

/** Convex keeps documents under 1 MB: longer pages are split into parts. */
const MAX_CHARS = 350_000;

function nameParts(path: string) {
  const base = baseOf(path).replace(EXT, "").replace(ALL_SUFFIX, "");
  const m = NOTION_ID.exec(base);
  return m
    ? { stem: (m[1] ?? "").trim(), notionId: (m[2] ?? "").toLowerCase() }
    : { stem: base.trim(), notionId: undefined };
}

function kindOf(path: string): Kind {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "csv") {
    return "csv";
  }
  return ext.startsWith("htm") ? "html" : "md";
}

/** Databases come as "X.csv" and "X_all.csv": keep the complete one. */
function pagePaths(vfs: Vfs) {
  const paths = [...vfs.keys()].filter((p) => PAGE_EXT.test(p));
  const all = new Set(paths.filter((p) => ALL_SUFFIX.test(p.replace(EXT, ""))));
  return paths.filter((p) => {
    if (p === "index.html") {
      return false; // HTML workspace exports: just a list of top pages
    }
    if (kindOf(p) !== "csv" || all.has(p)) {
      return true;
    }
    return !all.has(p.replace(EXT, "_all.csv"));
  });
}

function parentDir(dir: string) {
  const trimmed = dir.slice(0, -1);
  return trimmed.includes("/") ? dirOf(trimmed) : "";
}

/** Each page's sub-pages live in a folder named like it (with or without id). */
function linkParents(pages: Page[]) {
  const folders = new Map<string, Page>();
  for (const p of pages) {
    const id = p.key.startsWith("notion:") ? p.key.slice(7) : "";
    folders.set(`${p.dir}${p.stem}/`, p);
    folders.set(`${p.dir}${baseOf(p.path).replace(EXT, "")}/`, p);
    if (id) {
      folders.set(`${p.dir}${p.stem} ${id}/`, p);
    }
  }
  for (const p of pages) {
    let d = p.dir;
    while (d) {
      const owner = folders.get(d);
      if (owner && owner !== p) {
        p.parent = owner;
        break;
      }
      d = parentDir(d);
    }
  }
}

function splitTitle(md: string, fallback: string) {
  const lines = md.split("\n");
  const first = lines.findIndex((l) => l.trim() !== "");
  const m = first >= 0 ? TITLE_LINE.exec((lines[first] ?? "").trim()) : null;
  if (!m) {
    return { title: fallback, body: md };
  }
  return {
    title: (m[1] ?? fallback).trim(),
    body: lines.slice(first + 1).join("\n"),
  };
}

/** <aside> callouts → "> 💡 …" (rendered as callouts). */
const asides = (md: string) =>
  md.replace(ASIDE, (_, inner: string) =>
    inner
      .trim()
      .split("\n")
      .map((l) => (l.trim() ? `> ${l.trim()}` : ">"))
      .join("\n")
  );

/** Database row pages start with "Property: value" lines. */
function boldProperties(body: string) {
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length && lines[i]?.trim() === "") {
    i++;
  }
  while (i < lines.length && PROPERTY.test(lines[i] ?? "")) {
    lines[i] = (lines[i] ?? "").replace(PROPERTY, "**$1:** $2");
    i++;
  }
  return lines.join("\n");
}

function readPage(page: Page, vfs: Vfs) {
  const raw = text(vfs.get(page.path) ?? new Uint8Array());
  if (page.kind === "html") {
    const h = htmlToMarkdown(raw);
    page.title = h.title;
    page.body = h.markdown;
    page.icon = h.icon;
    page.cover = h.cover;
    return;
  }
  if (page.kind === "md") {
    const { title, body } = splitTitle(raw, page.stem);
    page.title = title;
    page.body = asides(body);
    return;
  }
  page.title = page.stem;
  page.body = raw; // CSV: turned into a table once row pages are known
}

/** Database: a table of its rows, the first column linking to row pages. */
function databaseTable(page: Page, pages: Page[]) {
  const rows = parseCsv(page.body);
  const rowPages = new Map(
    pages.filter((p) => p.parent === page).map((p) => [p.title, p])
  );
  const linked = rows.map((r, i) => {
    const target = i > 0 ? rowPages.get(r[0] ?? "") : undefined;
    return target ? [`[${r[0]}](note:${target.noteId})`, ...r.slice(1)] : r;
  });
  return markdownTable(linked);
}

/* ------------------------------ links/files ------------------------------ */

interface Context {
  vfs: Vfs;
  byPath: Map<string, Page>;
  byNotionId: Map<string, Page>;
  uploads: Map<string, Promise<string | null>>;
  uploaded: { count: number };
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Uploads a file of the export once; reuses one already in the notes. */
function upload(ctx: Context, path: string) {
  const cached = ctx.uploads.get(path);
  if (cached) {
    return cached;
  }
  const bytes = ctx.vfs.get(path);
  const name = baseOf(path);
  const job = (async () => {
    if (!bytes) {
      return null;
    }
    const same = currentFiles().find(
      (f) => f.name === name && f.size === bytes.byteLength
    );
    if (same) {
      return same.id;
    }
    const file = new File([bytes as BlobPart], name, { type: mimeOf(name) });
    const meta = await addFile(file);
    ctx.uploaded.count++;
    return meta.id;
  })();
  ctx.uploads.set(path, job);
  return job;
}

function findPage(ctx: Context, page: Page, target: string) {
  const notion = NOTION_URL.exec(target);
  if (notion) {
    return ctx.byNotionId.get((notion[1] ?? "").toLowerCase()) ?? null;
  }
  if (SCHEME.test(target)) {
    return null;
  }
  const path = joinPath(page.dir, safeDecode(target.replace(HASH, "")));
  return (
    ctx.byPath.get(path) ??
    ctx.byPath.get(path.replace(EXT, "_all.csv")) ??
    null
  );
}

async function rewriteLink(
  ctx: Context,
  page: Page,
  m: RegExpMatchArray
): Promise<string> {
  const [whole, bang, label = "", target = ""] = m;
  const linked = findPage(ctx, page, target);
  if (linked) {
    if (linked.parent === page) {
      linked.order = Math.min(linked.order, m.index ?? 0);
    }
    return `[${label || linked.title}](note:${linked.noteId})`;
  }
  if (SCHEME.test(target)) {
    return whole;
  }
  const path = joinPath(page.dir, safeDecode(target.replace(HASH, "")));
  if (!ctx.vfs.has(path)) {
    return label; // points outside the export
  }
  const id = await upload(ctx, path);
  if (!id) {
    return label;
  }
  const alt = bang ? label : label || baseOf(path);
  return `![${alt}](att:${id})`;
}

async function rewriteLinks(ctx: Context, page: Page, md: string) {
  const matches = [...md.matchAll(LINK)];
  const replaced = await Promise.all(
    matches.map((m) => rewriteLink(ctx, page, m))
  );
  let out = "";
  let last = 0;
  matches.forEach((m, i) => {
    out += md.slice(last, m.index) + replaced[i];
    last = (m.index ?? 0) + m[0].length;
  });
  return out + md.slice(last);
}

async function imageRef(ctx: Context, page: Page, src: string | undefined) {
  if (!src) {
    return undefined;
  }
  if (SCHEME.test(src)) {
    return undefined; // remote covers (Unsplash) are not copied
  }
  const id = await upload(ctx, joinPath(page.dir, safeDecode(src)));
  return id ? `att:${id}` : undefined;
}

/* --------------------------------- saving -------------------------------- */

function splitContent(s: string) {
  if (s.length <= MAX_CHARS) {
    return [s];
  }
  const parts: string[] = [];
  let rest = s;
  while (rest.length > MAX_CHARS) {
    let cut = rest.lastIndexOf("\n\n", MAX_CHARS);
    if (cut < MAX_CHARS / 2) {
      cut = rest.lastIndexOf("\n", MAX_CHARS);
    }
    if (cut <= 0) {
      cut = MAX_CHARS;
    }
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(LEADING_NEWLINES, "");
  }
  parts.push(rest);
  return parts;
}

function save(
  base: Partial<Note> & Pick<Note, "id" | "title" | "content">,
  existing: Note | undefined,
  createdAt: number
) {
  saveNote({
    folder: "",
    pinned: false,
    ...existing,
    ...base,
    createdAt: existing?.createdAt ?? createdAt,
    updatedAt: Date.now(),
  });
}

/** Saves a page; very long ones continue in "parte 2, 3…" sub-pages. */
function savePage(page: Page, byOrigin: Map<string, Note>, createdAt: number) {
  const parts = splitContent(page.body);
  const ids = parts.map((_, i) =>
    i === 0
      ? page.noteId
      : (byOrigin.get(`${page.key}#${i + 1}`)?.id ?? newId())
  );
  parts.forEach((part, i) => {
    const next = ids[i + 1];
    const content = next
      ? `${part}\n\n---\n\n[Continua na parte ${i + 2} →](note:${next})`
      : part;
    const origin = i === 0 ? page.key : `${page.key}#${i + 1}`;
    save(
      {
        id: ids[i] as string,
        title: i === 0 ? page.title : `${page.title} — parte ${i + 1}`,
        content,
        parentId: i === 0 ? (page.parent?.noteId ?? null) : page.noteId,
        origin,
        ...(i === 0 && page.icon ? { icon: page.icon } : {}),
        ...(i === 0 && page.cover ? { cover: page.cover } : {}),
      },
      byOrigin.get(origin),
      createdAt + i
    );
  });
}

function buildPages(vfs: Vfs, byOrigin: Map<string, Note>) {
  const byId = new Map(currentNotes().map((n) => [n.id, n]));
  return pagePaths(vfs).map((path): Page => {
    const { stem, notionId } = nameParts(path);
    const key = notionId ? `notion:${notionId}` : `file:${path}`;
    const own = notionId ? undefined : APP_ID.exec(stem);
    const existing =
      byOrigin.get(key) ?? (own ? byId.get(own[2] ?? "") : undefined);
    return {
      path,
      dir: dirOf(path),
      kind: kindOf(path),
      stem: existing && own ? (own[1] ?? stem) : stem,
      key: existing?.origin ?? key,
      noteId: existing?.id ?? newId(),
      existing,
      parent: null,
      title: stem,
      body: "",
      order: Number.MAX_SAFE_INTEGER,
    };
  });
}

/** Parents before children, siblings in the order the parent links them. */
function saveOrder(pages: Page[]) {
  const depth = (p: Page) => {
    let d = 0;
    for (let q = p.parent; q; q = q.parent) {
      d++;
    }
    return d;
  };
  return [...pages].sort(
    (a, b) =>
      depth(a) - depth(b) || a.order - b.order || a.title.localeCompare(b.title)
  );
}

export async function importNotion(
  files: File[],
  onProgress: (p: ImportProgress) => void
): Promise<ImportResult> {
  onProgress({ done: 0, total: 1, label: "Lendo o arquivo…" });
  const vfs = await readInputs(files);
  const byOrigin = new Map(
    currentNotes()
      .filter((n) => n.origin)
      .map((n) => [n.origin as string, n])
  );
  const pages = buildPages(vfs, byOrigin);
  if (pages.length === 0) {
    throw new Error(
      "Nenhuma página encontrada. Envie o .zip exportado do Notion (Markdown e CSV ou HTML)."
    );
  }
  linkParents(pages);
  for (const p of pages) {
    readPage(p, vfs);
  }
  const ctx: Context = {
    vfs,
    byPath: new Map(pages.map((p) => [p.path, p])),
    byNotionId: new Map(
      pages
        .filter((p) => p.key.startsWith("notion:"))
        .map((p) => [p.key.slice(7), p])
    ),
    uploads: new Map(),
    uploaded: { count: 0 },
  };
  let done = 0;
  for (const p of pages) {
    onProgress({ done, total: pages.length, label: p.title });
    if (p.kind === "csv") {
      p.body = databaseTable(p, pages);
    } else {
      const isRow = p.parent?.kind === "csv";
      p.body = await rewriteLinks(
        ctx,
        p,
        isRow ? boldProperties(p.body) : p.body
      );
    }
    p.body = p.body.replace(BLANK_RUNS, "\n\n").trim();
    p.icon =
      p.icon?.includes("/") || p.icon?.includes(".")
        ? await imageRef(ctx, p, p.icon)
        : p.icon;
    p.cover = await imageRef(ctx, p, p.cover);
    done++;
  }
  const start = Date.now();
  for (const [i, p] of saveOrder(pages).entries()) {
    savePage(p, byOrigin, start + i * 10);
  }
  onProgress({ done: pages.length, total: pages.length, label: "Pronto" });
  const roots = saveOrder(pages).filter((p) => !p.parent);
  return {
    created: pages.filter((p) => !p.existing).length,
    updated: pages.filter((p) => p.existing).length,
    files: ctx.uploaded.count,
    rootId: roots[0]?.noteId ?? null,
  };
}
