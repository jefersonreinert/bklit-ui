import type { Note } from "./types";

/** [[Note]] / [[Note|label]] links, #tags and the graph built from them. */

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const TAG = /(?:^|[\s(])#([\p{L}\d][\p{L}\d_/-]*)/gu;
const FENCED = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`]*`/g;
const HEADING_LINE = /^#{1,6}\s/gm;
const ID_LINK = /\]\(note:([^)\s]+)\)/g;

const key = (title: string) => title.trim().toLowerCase();

function prose(content: string) {
  return content.replace(FENCED, "").replace(INLINE_CODE, "");
}

export function linksOf(content: string) {
  return [...prose(content).matchAll(WIKILINK)].map((m) => (m[1] ?? "").trim());
}

/** Ids of pages linked as [label](note:<id>) (imported pages). */
export function idLinksOf(content: string) {
  return [...prose(content).matchAll(ID_LINK)].map((m) => m[1] ?? "");
}

export function tagsOf(content: string) {
  const text = prose(content).replace(HEADING_LINE, "");
  return [
    ...new Set([...text.matchAll(TAG)].map((m) => (m[1] ?? "").toLowerCase())),
  ];
}

export function findByTitle(notes: Note[], title: string) {
  const k = key(title);
  return notes.find((n) => key(n.title) === k);
}

export function backlinks(notes: Note[], note: Note) {
  const k = key(note.title);
  return notes.filter(
    (n) =>
      n.id !== note.id &&
      (linksOf(n.content).some((l) => key(l) === k) ||
        idLinksOf(n.content).includes(note.id))
  );
}

export type GraphNodeKind = "note" | "tag" | "ghost";

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export function buildGraph(notes: Note[], opts: { tags: boolean }) {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const byTitle = new Map(notes.map((n) => [key(n.title), n]));
  for (const n of notes) {
    nodes.set(n.id, { id: n.id, label: n.title, kind: "note", degree: 0 });
  }
  const link = (source: string, target: string) => {
    if (source === target) {
      return;
    }
    edges.push({ source, target });
    for (const id of [source, target]) {
      const node = nodes.get(id);
      if (node) {
        node.degree += 1;
      }
    }
  };
  /** Ghost (unresolved link) and tag nodes, created on first use. */
  const extra = (id: string, label: string, kind: GraphNodeKind) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label, kind, degree: 0 });
    }
    return id;
  };
  for (const n of notes) {
    for (const l of new Set(linksOf(n.content).map(key))) {
      link(n.id, byTitle.get(l)?.id ?? extra(`ghost:${l}`, l, "ghost"));
    }
    for (const id of new Set(idLinksOf(n.content))) {
      if (nodes.has(id)) {
        link(n.id, id);
      }
    }
    for (const t of opts.tags ? tagsOf(n.content) : []) {
      link(n.id, extra(`tag:${t}`, `#${t}`, "tag"));
    }
  }
  return { nodes: [...nodes.values()], edges };
}

/** Notes linked to or from a note (for the connectivity ring). */
export function neighbors(notes: Note[], note: Note) {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const outgoing = [
    ...linksOf(note.content).map((l) => findByTitle(notes, l)),
    ...idLinksOf(note.content).map((id) => byId.get(id)),
  ].filter((n): n is Note => Boolean(n));
  const all = [...outgoing, ...backlinks(notes, note)];
  return [...new Map(all.map((n) => [n.id, n])).values()];
}
