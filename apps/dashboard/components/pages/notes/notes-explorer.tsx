"use client";

import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AiMascot } from "@/components/dashboard/ai-mascot";
import { Icon } from "@/lib/icons";
import { childrenOf } from "@/lib/notes/db";
import { tagsOf } from "@/lib/notes/links";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import { CoverPreview, NoteIcon } from "./note-hero";

/** Notion-style home: recent cards with covers, sections, page tree. */

const FENCED = /```[\s\S]*?```/g;
const MEDIA = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]+)\]\([^)]*\)/g;
const WIKI = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MARKS = /^\s*(#{1,6}|[-*+]\s+\[[ xX]\]|[-*+]|\d+[.)]|>)\s*/gm;
const EMPHASIS = /(\*\*|__|~~|==|`)/g;
const TAGS = /(^|\s)#[\p{L}\d_/-]+/gu;
const SPACES = /\s+/g;

/** First words of a note as plain text (no markdown). */
export function preview(content: string, max = 90) {
  const text = content
    .replace(FENCED, " ")
    .replace(MEDIA, " ")
    .replace(LINK, "$1")
    .replace(WIKI, (_m, title: string, label?: string) => label ?? title)
    .replace(MARKS, "")
    .replace(EMPHASIS, "")
    .replace(TAGS, " ")
    .replace(SPACES, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const TreeContext = createContext<{
  all: Note[];
  activeId: string | null;
  onOpen: (id: string) => void;
}>({ all: [], activeId: null, onOpen: () => undefined });

function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mt-5">
      <button
        className="flex items-center gap-1.5 px-2 text-[15px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {title}
        {count === undefined ? null : (
          <span className="text-xs opacity-60">{count}</span>
        )}
        <Icon
          className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
          name="IconChevronDownSmall"
        />
      </button>
      {open ? <div className="mt-1.5">{children}</div> : null}
    </section>
  );
}

function RecentCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  return (
    <button
      className="flex h-44 w-40 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-xs transition-transform active:scale-[0.98]"
      onClick={onOpen}
      type="button"
    >
      <CoverPreview
        className="h-[72px] w-full shrink-0"
        cover={note.cover}
        logoClassName="h-9 max-w-[60%]"
      />
      <div className="-mt-5 px-3">
        <NoteIcon className="text-[34px] drop-shadow-sm" icon={note.icon} />
      </div>
      <p className="line-clamp-2 px-3 pt-1.5 font-medium text-[15px] leading-snug">
        {note.title || "Sem título"}
      </p>
    </button>
  );
}

function PageRow({ note, depth = 0 }: { note: Note; depth?: number }) {
  const { all, activeId, onOpen } = useContext(TreeContext);
  const children = childrenOf(all, note.id);
  const [open, setOpen] = useState(false);
  const containsActive = children.some(
    (c) =>
      c.id === activeId ||
      all.some((x) => x.id === activeId && x.parentId === c.id)
  );
  const expanded = open || containsActive;
  const snippet = preview(note.content, 70);
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-xl pr-2 transition-colors",
          note.id === activeId ? "bg-muted" : "hover:bg-muted/60"
        )}
        style={{ paddingLeft: depth * 14 }}
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
          className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
          onClick={() => onOpen(note.id)}
          type="button"
        >
          <NoteIcon
            className="shrink-0 text-[22px] text-muted-foreground"
            icon={note.icon}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] leading-snug">
              {note.title || "Sem título"}
            </span>
            {snippet ? (
              <span className="block truncate text-muted-foreground text-xs leading-snug">
                {snippet}
              </span>
            ) : null}
          </span>
        </button>
      </div>
      {expanded && children.length > 0
        ? children.map((c) => <PageRow depth={depth + 1} key={c.id} note={c} />)
        : null}
    </div>
  );
}

function BottomBar({
  onSearch,
  onNew,
}: {
  onSearch: () => void;
  onNew: () => void;
}) {
  return (
    <div className="pointer-events-none sticky bottom-0 mt-auto flex items-center gap-2 px-1 pt-3 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.5rem))]">
      <button
        aria-label="Buscar"
        className="pointer-events-auto flex size-12 shrink-0 items-center justify-center rounded-full border bg-card shadow-md"
        onClick={onSearch}
        type="button"
      >
        <Icon className="size-5" name="IconMagnifyingGlass" />
      </button>
      <Link
        className="pointer-events-auto flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border bg-card pr-4 pl-2.5 text-muted-foreground shadow-md"
        href="/ia/"
      >
        <AiMascot className="size-8" />
        <span className="truncate">Pergunte à IA</span>
      </Link>
      <button
        aria-label="Nova página"
        className="pointer-events-auto flex size-12 shrink-0 items-center justify-center rounded-full border bg-card shadow-md"
        onClick={onNew}
        type="button"
      >
        <Icon className="size-5" name="IconEditBig" />
      </button>
    </div>
  );
}

function TopBar({
  onGraph,
  onImport,
}: {
  onGraph: () => void;
  onImport: (files: FileList | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-muted font-medium">
        <Icon className="size-5" name="IconHome" />
        Início
      </div>
      <button
        aria-label="Abrir grafo"
        className="flex size-11 items-center justify-center rounded-full bg-muted"
        onClick={onGraph}
        type="button"
      >
        <Icon className="size-5" name="IconShapesPlusXSquareCircle" />
      </button>
      <label
        className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-muted"
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
        <Icon className="size-5" name="IconImport" />
      </label>
    </div>
  );
}

/** Loose pages ("") first, then folders A–Z. */
function folderOrder(a: string, b: string) {
  if (a === "" || b === "") {
    return a === "" ? -1 : 1;
  }
  return a.localeCompare(b);
}

function useSections(notes: Note[]) {
  return useMemo(() => {
    const ids = new Set(notes.map((n) => n.id));
    const roots = notes.filter((n) => !(n.parentId && ids.has(n.parentId)));
    const byTitle = (a: Note, b: Note) => a.title.localeCompare(b.title);
    const pinned = roots.filter((n) => n.pinned).sort(byTitle);
    const folders = new Map<string, Note[]>();
    for (const n of roots.filter((r) => !r.pinned)) {
      folders.set(n.folder, [...(folders.get(n.folder) ?? []), n]);
    }
    const grouped = [...folders.entries()]
      .map(([name, list]) => [name, list.sort(byTitle)] as const)
      .sort(([a], [b]) => folderOrder(a, b));
    const recents = [...notes]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 10);
    return { pinned, grouped, recents };
  }, [notes]);
}

function useTagCounts(notes: Note[]) {
  return useMemo(() => {
    const count = new Map<string, number>();
    for (const n of notes) {
      for (const t of tagsOf(n.content)) {
        count.set(t, (count.get(t) ?? 0) + 1);
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [notes]);
}

function SearchResults({
  notes,
  q,
  tag,
}: {
  notes: Note[];
  q: string;
  tag: string | null;
}) {
  const results = notes
    .filter(
      (n) =>
        (!q ||
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)) &&
        (!tag || tagsOf(n.content).includes(tag))
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <Section count={results.length} title="Resultados">
      {results.map((n) => (
        <PageRow key={n.id} note={n} />
      ))}
      {results.length === 0 ? (
        <p className="px-2 py-6 text-center text-muted-foreground text-sm">
          Nada encontrado.
        </p>
      ) : null}
    </Section>
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
  const [searching, setSearching] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const { pinned, grouped, recents } = useSections(notes);
  const tags = useTagCounts(notes);
  const filtering = Boolean(q || tag);

  useEffect(() => {
    if (searching) {
      search.current?.focus();
    }
  }, [searching]);

  return (
    <TreeContext.Provider value={{ all: notes, activeId, onOpen }}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-1">
          <TopBar onGraph={onGraph} onImport={onImport} />
          {searching || q ? (
            <div className="mt-3 flex items-center gap-2 rounded-full border bg-card px-4">
              <Icon
                className="size-4 text-muted-foreground"
                name="IconMagnifyingGlass"
              />
              <input
                aria-label="Buscar nas notas"
                className="h-11 flex-1 bg-transparent outline-none"
                onBlur={() => setSearching(Boolean(query))}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar nas notas…"
                ref={search}
                value={query}
              />
              {query ? (
                <button
                  aria-label="Limpar busca"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <Icon
                    className="size-4 text-muted-foreground"
                    name="IconCrossSmall"
                  />
                </button>
              ) : null}
            </div>
          ) : null}
          {tag ? (
            <button
              className="mt-3 flex w-fit items-center gap-1 rounded-full bg-[#d97757]/15 px-3 py-1 text-[#d97757] text-xs"
              onClick={() => onTag(null)}
              type="button"
            >
              #{tag}
              <Icon className="size-3" name="IconCrossSmall" />
            </button>
          ) : null}

          {filtering ? (
            <SearchResults notes={notes} q={q} tag={tag} />
          ) : (
            <>
              <Section title="Recentes">
                <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
                  {recents.map((n) => (
                    <RecentCard
                      key={n.id}
                      note={n}
                      onOpen={() => onOpen(n.id)}
                    />
                  ))}
                </div>
              </Section>
              {pinned.length > 0 ? (
                <Section title="Fixadas">
                  {pinned.map((n) => (
                    <PageRow key={n.id} note={n} />
                  ))}
                </Section>
              ) : null}
              {grouped.map(([folder, list]) => (
                <Section key={folder || "root"} title={folder || "Páginas"}>
                  {list.map((n) => (
                    <PageRow key={n.id} note={n} />
                  ))}
                </Section>
              ))}
              {tags.length > 0 ? (
                <Section defaultOpen={false} title="Tags">
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {tags.map(([t, n]) => (
                      <button
                        className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground text-xs hover:text-foreground"
                        key={t}
                        onClick={() => onTag(t)}
                        type="button"
                      >
                        #{t} <span className="opacity-60">{n}</span>
                      </button>
                    ))}
                  </div>
                </Section>
              ) : null}
            </>
          )}
          <div className="h-4" />
        </div>
        <BottomBar onNew={onNew} onSearch={() => setSearching(true)} />
      </div>
    </TreeContext.Provider>
  );
}
