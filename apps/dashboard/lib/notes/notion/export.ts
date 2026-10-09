import { zipSync } from "fflate";
import { childrenOf, fileBlob, fileMeta } from "../db";
import { findByTitle } from "../links";
import type { Note } from "../types";
import { dirOf, relativeLink } from "./vfs";

/**
 * Notes → a .zip Notion imports (Settings → Import → Text & Markdown):
 * one .md per page, sub-pages in a folder named like their parent, images
 * and files next to the page, links between pages as relative .md links.
 * The same zip opens in Obsidian and re-imports here.
 */

const UNSAFE = /[\\/:*?"<>|#%\n\r\t]+/g;
const SPACES = /\s+/g;
const ATT = /(!?)\[([^\]\n]*)\]\(att:([^)\s]+)\)/g;
const NOTE_LINK = /\[([^\]\n]*)\]\(note:([^)\s]+)\)/g;
const WIKI = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
const DETAILS =
  /^(\s*)<details[^>]*>\s*\n\s*<summary>(.*?)<\/summary>\s*\n([\s\S]*?)\n\s*<\/details>/gm;

const safeName = (s: string) =>
  s.replace(UNSAFE, " ").replace(SPACES, " ").trim().slice(0, 80) ||
  "Sem título";

interface Entry {
  note: Note;
  /** "Parent abc/Child def.md" */
  path: string;
  /** Folder for its sub-pages and files ("Parent abc/Child def/"). */
  folder: string;
}

function layout(notes: Note[], roots: Note[]) {
  const entries = new Map<string, Entry>();
  const walk = (note: Note, dir: string) => {
    if (entries.has(note.id)) {
      return;
    }
    // Pages imported from Notion keep their Notion id: re-imports match
    const id = note.origin?.startsWith("notion:")
      ? note.origin.slice(7)
      : note.id;
    const name = `${safeName(note.title)} ${id}`;
    entries.set(note.id, {
      note,
      path: `${dir}${name}.md`,
      folder: `${dir}${name}/`,
    });
    for (const child of childrenOf(notes, note.id)) {
      walk(child, `${dir}${name}/`);
    }
  };
  for (const r of roots) {
    walk(r, "");
  }
  return entries;
}

/** Toggles as a bullet with its content indented (what Notion imports). */
const toggles = (md: string) =>
  md.replace(DETAILS, (_, indent: string, summary: string, body: string) =>
    [
      `${indent}- ${summary}`,
      ...body.split("\n").map((l) => (l.trim() ? `${indent}    ${l}` : "")),
    ].join("\n")
  );

async function pageMarkdown(
  entry: Entry,
  entries: Map<string, Entry>,
  notes: Note[],
  files: Record<string, Uint8Array>
) {
  const dir = dirOf(entry.path);
  const linkTo = (target: Entry | undefined, label: string) =>
    target ? `[${label}](${relativeLink(dir, target.path)})` : label;

  let md = entry.note.content
    .replace(NOTE_LINK, (_, label: string, id: string) =>
      linkTo(entries.get(id), label)
    )
    .replace(WIKI, (_, title: string, label?: string) => {
      const n = findByTitle(notes, title);
      return linkTo(n ? entries.get(n.id) : undefined, label ?? title);
    });

  const atts = [...md.matchAll(ATT)];
  const used = new Set<string>();
  for (const m of atts) {
    const id = m[3] ?? "";
    const meta = fileMeta(id);
    const blob = meta ? await fileBlob(id) : null;
    if (!(meta && blob)) {
      continue;
    }
    let name = safeName(meta.name);
    for (let k = 2; used.has(name); k++) {
      name = `${k}-${safeName(meta.name)}`;
    }
    used.add(name);
    const path = `${entry.folder}${name}`;
    files[path] = new Uint8Array(await blob.arrayBuffer());
    md = md.replace(
      m[0],
      `${m[1]}[${m[2] || name}](${relativeLink(dir, path)})`
    );
  }
  return `# ${entry.note.title}\n\n${toggles(md)}\n`;
}

/** Zip of the given pages (and their sub-pages); all notes when omitted. */
export async function exportNotion(notes: Note[], rootIds?: string[]) {
  const ids = new Set(notes.map((n) => n.id));
  const roots = rootIds
    ? notes.filter((n) => rootIds.includes(n.id))
    : notes.filter((n) => !(n.parentId && ids.has(n.parentId)));
  const entries = layout(notes, roots);
  const files: Record<string, Uint8Array> = {};
  const enc = new TextEncoder();
  for (const entry of entries.values()) {
    files[entry.path] = enc.encode(
      await pageMarkdown(entry, entries, notes, files)
    );
  }
  const zip = zipSync(files, { level: 6 });
  return {
    blob: new Blob([zip as BlobPart], { type: "application/zip" }),
    pages: entries.size,
  };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
