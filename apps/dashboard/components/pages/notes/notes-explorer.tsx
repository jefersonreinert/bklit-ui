"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/lib/icons";
import { childrenOf } from "@/lib/notes/db";
import { tagsOf } from "@/lib/notes/links";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import { NoteIcon } from "./note-hero";

const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 1) {
    return "agora";
  }
  if (m < 60) {
    return `${m} min`;
  }
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h` : new Date(ts).toLocaleDateString("pt-BR");
};

/** The whole note list, for nesting sub-pages under their parents. */
const TreeContext = createContext<{ all: Note[]; tree: boolean }>({
  all: [],
  tree: false,
});

function NoteRow({
  note,
  active,
  onOpen,
  activeId,
  onOpenId,
}: {
  note: Note;
  active: boolean;
  onOpen: () => void;
  activeId?: string | null;
  onOpenId?: (id: string) => void;
}) {
  const { all, tree } = useContext(TreeContext);
  const children = tree ? childrenOf(all, note.id) : [];
  const [open, setOpen] = useState(false);
  // Keep the branch with the open page expanded
  const containsActive = children.some(
    (c) =>
      c.id === activeId ||
      all.some((x) => x.id === activeId && x.parentId === c.id)
  );
  const expanded = open || containsActive;
  return (
    <div>
      <div
        className={cn(
          "flex w-full items-center gap-1 rounded-lg pr-2 text-sm transition-colors",
          active
            ? "bg-muted font-medium"
            : "text-foreground/85 hover:bg-muted/60"
        )}
      >
        {children.length > 0 ? (
          <button
            aria-label={expanded ? "Recolher subpáginas" : "Mostrar subpáginas"}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!expanded)}
            type="button"
          >
            <Icon
              className={cn(
                "size-3 transition-transform",
                expanded && "rotate-90"
              )}
              name="IconChevronRight"
            />
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <button
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
          onClick={onOpen}
          type="button"
        >
          <NoteIcon
            className="shrink-0 text-[15px] text-muted-foreground"
            icon={note.icon}
          />
          <span className="min-w-0 flex-1 truncate">
            {note.title || "Sem título"}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {ago(note.updatedAt)}
          </span>
        </button>
      </div>
      {expanded && children.length > 0 ? (
        <div className="ml-4 border-l pl-1">
          {children.map((c) => (
            <NoteRow
              active={c.id === activeId}
              activeId={activeId}
              key={c.id}
              note={c}
              onOpen={() => onOpenId?.(c.id)}
              onOpenId={onOpenId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Folder({
  name,
  notes,
  activeId,
  onOpen,
}: {
  name: string;
  notes: Note[];
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-muted-foreground text-xs uppercase tracking-wide hover:text-foreground"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <Icon
          className={cn("size-3 transition-transform", open && "rotate-90")}
          name="IconChevronRight"
        />
        <Icon className="size-3.5" name="IconFolder1" />
        {name}
        <span className="ml-auto">{notes.length}</span>
      </button>
      {open ? (
        <div className="ml-3 border-l pl-1">
          {notes.map((n) => (
            <NoteRow
              active={n.id === activeId}
              activeId={activeId}
              key={n.id}
              note={n}
              onOpen={() => onOpen(n.id)}
              onOpenId={onOpen}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function NotesExplorer({
  notes,
  activeId,
  tag,
  onTag,
  onOpen,
  onNew,
  onGraph,
  onImport,
}: {
  notes: Note[];
  activeId: string | null;
  tag: string | null;
  onTag: (tag: string | null) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onGraph: () => void;
  onImport: (files: FileList | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      notes
        .filter(
          (n) =>
            (!q ||
              n.title.toLowerCase().includes(q) ||
              n.content.toLowerCase().includes(q)) &&
            (!tag || tagsOf(n.content).includes(tag))
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [notes, q, tag]
  );
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const n of notes) {
      for (const t of tagsOf(n.content)) {
        count.set(t, (count.get(t) ?? 0) + 1);
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [notes]);
  const browsing = !(q || tag);
  const ids = useMemo(() => new Set(notes.map((n) => n.id)), [notes]);
  const isRoot = (n: Note) => !(n.parentId && ids.has(n.parentId));
  const folders = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of filtered) {
      if (!n.pinned && (!browsing || isRoot(n))) {
        map.set(n.folder, [...(map.get(n.folder) ?? []), n]);
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, browsing, isRoot]);
  const pinned = filtered.filter((n) => n.pinned);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onNew}>
          <Icon className="size-4" name="IconPlusSmall" />
          Nova nota
        </Button>
        <Button
          aria-label="Abrir grafo"
          onClick={onGraph}
          size="icon"
          variant="outline"
        >
          <Icon className="size-4" name="IconShapesPlusXSquareCircle" />
        </Button>
        <label
          className="flex size-9 cursor-pointer items-center justify-center rounded-md border hover:bg-muted"
          title="Importar .md"
        >
          <span className="sr-only">Importar arquivos Markdown</span>
          <input
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="sr-only"
            multiple
            onChange={(e) => {
              onImport(e.target.files);
              e.target.value = "";
            }}
            type="file"
          />
          <Icon className="size-4" name="IconImport" />
        </label>
      </div>
      <Input
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar nas notas…"
        value={query}
      />
      {tag ? (
        <button
          className="flex w-fit items-center gap-1 rounded-full bg-[#d97757]/15 px-3 py-1 text-[#d97757] text-xs"
          onClick={() => onTag(null)}
          type="button"
        >
          #{tag}
          <Icon className="size-3" name="IconCrossSmall" />
        </button>
      ) : null}
      <TreeContext.Provider value={{ all: notes, tree: browsing }}>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {pinned.length > 0 ? (
            <div className="mb-2">
              <p className="px-2 py-1 text-muted-foreground text-xs uppercase tracking-wide">
                Fixadas
              </p>
              {pinned.map((n) => (
                <NoteRow
                  active={n.id === activeId}
                  activeId={activeId}
                  key={n.id}
                  note={n}
                  onOpen={() => onOpen(n.id)}
                  onOpenId={onOpen}
                />
              ))}
            </div>
          ) : null}
          {folders.map(([folder, list]) =>
            folder ? (
              <Folder
                activeId={activeId}
                key={folder}
                name={folder}
                notes={list}
                onOpen={onOpen}
              />
            ) : (
              list.map((n) => (
                <NoteRow
                  active={n.id === activeId}
                  activeId={activeId}
                  key={n.id}
                  note={n}
                  onOpen={() => onOpen(n.id)}
                  onOpenId={onOpen}
                />
              ))
            )
          )}
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-muted-foreground text-sm">
              Nenhuma nota encontrada.
            </p>
          ) : null}
        </div>
      </TreeContext.Provider>
      {tags.length > 0 ? (
        <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto border-t pt-3">
          {tags.map(([t, n]) => (
            <button
              className={cn(
                "rounded-full px-2 py-0.5 text-xs transition-colors",
                tag === t
                  ? "bg-[#d97757] text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
              key={t}
              onClick={() => onTag(tag === t ? null : t)}
              type="button"
            >
              #{t} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
