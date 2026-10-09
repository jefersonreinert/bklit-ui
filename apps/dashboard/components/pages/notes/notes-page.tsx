"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useLiveWriter } from "@/lib/ai/live-writer";
import { Icon } from "@/lib/icons";
import { createNote, deleteNote, saveNote, useNotes } from "@/lib/notes/db";
import {
  backlinks,
  buildGraph,
  findByTitle,
  type GraphNode,
  neighbors,
} from "@/lib/notes/links";
import { downloadBlob, exportNotion } from "@/lib/notes/notion/export";
import type { Note } from "@/lib/notes/types";
import { connectedKeys, useConnectors } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import { NoteAiBar } from "./note-ai";
import { NoteEditor } from "./note-editor";
import { NoteHero, NoteIcon } from "./note-hero";
import { type MarkdownActions, NoteMarkdown } from "./note-markdown";
import { NoteRadial } from "./note-radial";
import { NotesExplorer } from "./notes-explorer";
import { NotesGraph } from "./notes-graph";
import { TransferSheet } from "./notes-transfer";

type Mode = "read" | "edit" | "split";
const MODE_KEY = "cb:notes:mode";
const ACTIVE_KEY = "cb:notes:active";
const TASK_MARK = /\[( |x|X)\]/;

function readPref(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode
  }
}

function download(note: Note) {
  const blob = new Blob([`# ${note.title}\n\n${note.content}`], {
    type: "text/markdown",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${note.title || "nota"}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Renames a note and rewrites [[Old]] links in the other notes. */
function rename(notes: Note[], note: Note, title: string) {
  const next = title.trim() || "Sem título";
  if (next === note.title) {
    return;
  }
  const escaped = note.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\[\\[${escaped}(\\]\\]|\\||#)`, "gi");
  for (const other of notes) {
    const content = other.content.replace(pattern, `[[${next}$1`);
    if (other.id !== note.id && content !== other.content) {
      saveNote({ ...other, content });
    }
  }
  saveNote({ ...note, title: next });
}

function ModeSwitch({
  mode,
  onMode,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  const modes: [Mode, string][] = [
    ["read", "Ler"],
    ["edit", "Editar"],
    ["split", "Dividir"],
  ];
  return (
    <div className="flex rounded-full bg-muted p-0.5 text-sm">
      {modes.map(([m, label]) => (
        <button
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            mode === m ? "bg-card shadow-sm" : "text-muted-foreground",
            m === "split" && "hidden lg:block"
          )}
          key={m}
          onClick={() => onMode(m)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NoteHeader({
  note,
  notes,
  mode,
  onMode,
  onBack,
  onDeleted,
  onOpenNote,
  onTransfer,
}: {
  onTransfer: () => void;
  note: Note;
  notes: Note[];
  mode: Mode;
  onMode: (m: Mode) => void;
  onBack: () => void;
  onDeleted: () => void;
  onOpenNote: (n: Note) => void;
}) {
  const parent = notes.find((n) => n.id === note.parentId);
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2 md:px-5">
      <Button
        aria-label="Voltar"
        className="lg:hidden"
        onClick={onBack}
        size="icon-sm"
        variant="ghost"
      >
        <Icon className="size-4" name="IconChevronLeft" />
      </Button>
      <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-muted-foreground text-sm">
        {parent ? (
          <>
            <NoteIcon icon={parent.icon} />
            <span className="truncate">{parent.title}</span>
            <span>/</span>
          </>
        ) : null}
        <NoteIcon icon={note.icon} />
        <span className="truncate text-foreground">{note.title}</span>
      </p>
      <ModeSwitch mode={mode} onMode={onMode} />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label="Mais opções" size="icon-sm" variant="ghost" />
          }
        >
          <Icon className="size-4" name="IconDotGrid1x3Horizontal" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => saveNote({ ...note, pinned: !note.pinned })}
          >
            {note.pinned ? "Desafixar" : "Fixar no topo"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              onOpenNote(
                createNote({ title: "Nova página", parentId: note.id })
              )
            }
          >
            Nova subpágina
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTransfer}>
            Importar do Notion…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => download(note)}>
            Exportar .md
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              const { blob } = await exportNotion(notes, [note.id]);
              downloadBlob(blob, `${note.title || "pagina"}.zip`);
            }}
          >
            Exportar para o Notion (.zip)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              deleteNote(note.id);
              onDeleted();
            }}
            variant="destructive"
          >
            Excluir nota
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SidePanel({
  note,
  notes,
  onOpen,
}: {
  note: Note;
  notes: Note[];
  onOpen: (n: Note) => void;
}) {
  const linked = neighbors(notes, note);
  const back = backlinks(notes, note);
  return (
    <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l p-4 xl:flex">
      <div>
        <p className="mb-1 font-medium text-sm">Conexões</p>
        <p className="mb-2 text-muted-foreground text-xs">
          {linked.length} notas ligadas
        </p>
        <NoteRadial key={note.id} linked={linked} note={note} onOpen={onOpen} />
      </div>
      <div>
        <p className="mb-2 font-medium text-sm">Mencionada em</p>
        {back.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nenhuma nota aponta para esta ainda.
          </p>
        ) : (
          back.map((b) => (
            <button
              className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-[#d97757] text-sm hover:bg-muted"
              key={b.id}
              onClick={() => onOpen(b)}
              type="button"
            >
              {b.title}
            </button>
          ))
        )}
      </div>
      <p className="mt-auto text-muted-foreground text-xs">
        Editada {new Date(note.updatedAt).toLocaleString("pt-BR")}
      </p>
    </aside>
  );
}

function GraphView({
  notes,
  activeId,
  onNode,
  onClose,
}: {
  notes: Note[];
  activeId: string | null;
  onNode: (n: GraphNode) => void;
  onClose: () => void;
}) {
  const [tags, setTags] = useState(true);
  const graph = useMemo(() => buildGraph(notes, { tags }), [notes, tags]);
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--foreground)_6%,transparent),transparent_70%)]">
      <NotesGraph
        activeId={activeId}
        edges={graph.edges}
        nodes={graph.nodes}
        onOpen={onNode}
      />
      <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1.5 text-xs backdrop-blur">
        <span className="size-2.5 rounded-full bg-[#9cc46b]" /> Notas
        <button
          className="flex items-center gap-1.5"
          onClick={() => setTags(!tags)}
          type="button"
        >
          <span
            className={cn(
              "size-2.5 rounded-full bg-[#d4a27f]",
              !tags && "opacity-30"
            )}
          />
          <span className={cn(!tags && "line-through opacity-60")}>Tags</span>
        </button>
        <span className="size-2.5 rounded-full border border-[#8a8a8a]" /> A
        criar
      </div>
      <Button
        className="absolute top-3 right-3"
        onClick={onClose}
        size="sm"
        variant="outline"
      >
        Fechar grafo
      </Button>
      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-muted-foreground text-xs">
        Arraste para mover · role ou pinça para zoom · toque num ponto para
        abrir
      </p>
    </div>
  );
}

function useNotesState() {
  const { ready, notes } = useNotes();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("read");
  const [view, setView] = useState<"note" | "graph">("note");
  const [tag, setTag] = useState<string | null>(null);
  const [transfer, setTransfer] = useState(false);
  useEffect(() => {
    setActiveId(readPref(ACTIVE_KEY));
    const m = readPref(MODE_KEY);
    if (m === "read" || m === "edit" || m === "split") {
      setMode(m);
    }
  }, []);

  const open = (id: string | null) => {
    setActiveId(id);
    setView("note");
    writePref(ACTIVE_KEY, id ?? "");
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    writePref(MODE_KEY, m);
  };
  const openTitle = (title: string) => {
    const found = findByTitle(notes, title);
    open(found ? found.id : createNote({ title }).id);
  };
  return {
    ready,
    notes,
    activeId,
    open,
    openTitle,
    mode,
    changeMode,
    view,
    setView,
    tag,
    setTag,
    transfer,
    setTransfer,
  };
}

type NotesState = ReturnType<typeof useNotesState>;

function toggleTask(content: string, lineIndex: number) {
  const lines = content.split("\n");
  lines[lineIndex] = (lines[lineIndex] ?? "").replace(TASK_MARK, (m) =>
    m === "[ ]" ? "[x]" : "[ ]"
  );
  return lines.join("\n");
}

function NoteArea({ note, s }: { note: Note; s: NotesState }) {
  const actions: MarkdownActions = {
    exists: (t) => Boolean(findByTitle(s.notes, t)),
    onLink: s.openTitle,
    hasId: (id) => s.notes.some((n) => n.id === id),
    onOpenId: (id) => {
      if (s.notes.some((n) => n.id === id)) {
        s.open(id);
      }
    },
    onTag: (t) => s.setTag(t),
    onToggleTask: (line) =>
      saveNote({ ...note, content: toggleTask(note.content, line) }),
  };
  const latest = useRef(note);
  latest.current = note;
  const { status } = useConnectors();
  const writer = useLiveWriter((content) =>
    saveNote({ ...latest.current, content })
  );
  const liveRef = useRef<HTMLDivElement>(null);
  const writing = writer.live !== null;
  useEffect(() => {
    if (writing) {
      liveRef.current?.scrollIntoView({ block: "end" });
    }
  });
  const showEditor = !writing && (s.mode === "edit" || s.mode === "split");
  const showReader = writing || s.mode === "read" || s.mode === "split";
  const hero = (
    <NoteHero
      note={note}
      notes={s.notes}
      onOpen={(n) => s.open(n.id)}
      onRename={(title) => rename(s.notes, note, title)}
    />
  );
  return (
    <>
      <div className="relative flex min-h-0 min-w-0 flex-col">
        <NoteHeader
          mode={s.mode}
          note={note}
          notes={s.notes}
          onBack={() => s.open(null)}
          onDeleted={() => s.open(null)}
          onMode={s.changeMode}
          onOpenNote={(n) => s.open(n.id)}
          onTransfer={() => s.setTransfer(true)}
        />
        <div
          className={cn(
            "grid min-h-0 flex-1",
            s.mode === "split" && "lg:grid-cols-2"
          )}
        >
          {showEditor ? (
            <NoteEditor
              header={s.mode === "edit" ? hero : null}
              note={note}
              onChange={(content) => saveNote({ ...note, content })}
              titles={s.notes.map((n) => n.title)}
            />
          ) : null}
          {showReader ? (
            <div
              className={cn(
                "min-h-0 overflow-y-auto",
                !writing && s.mode === "split" && "hidden border-l lg:block"
              )}
            >
              {hero}
              <article className="mx-auto max-w-3xl px-5 pb-32 md:px-10">
                <NoteMarkdown
                  actions={actions}
                  text={writing ? `${writer.live}▍` : note.content}
                />
                <div ref={liveRef} />
                {!writing && note.content.trim() === "" ? (
                  <button
                    className="text-muted-foreground text-sm"
                    onClick={() => s.changeMode("edit")}
                    type="button"
                  >
                    Nota vazia — toque para escrever.
                  </button>
                ) : null}
              </article>
            </div>
          ) : null}
        </div>
        <NoteAiBar
          onStart={(instruction, mode) =>
            writer.start({
              title: note.title,
              content: note.content,
              instruction,
              mode,
              titles: s.notes.map((n) => n.title),
              connectors: connectedKeys(status),
            })
          }
          onStop={writer.stop}
          state={writer.state}
        />
      </div>
      <SidePanel note={note} notes={s.notes} onOpen={(n) => s.open(n.id)} />
    </>
  );
}

function EmptyNote({
  onGraph,
  onImport,
}: {
  onGraph: () => void;
  onImport: () => void;
}) {
  return (
    <div className="hidden min-h-0 flex-col items-center justify-center gap-3 text-center text-muted-foreground lg:flex xl:col-span-2">
      <Icon className="size-10" name="IconFileText" />
      <p className="text-sm">Escolha uma nota ou crie uma nova.</p>
      <div className="flex gap-2">
        <Button onClick={onGraph} variant="outline">
          Ver o grafo das notas
        </Button>
        <Button onClick={onImport}>
          <Icon className="size-4" name="IconImport" />
          Importar do Notion
        </Button>
      </div>
    </div>
  );
}

export function NotesPage() {
  const s = useNotesState();
  const note = s.notes.find((n) => n.id === s.activeId) ?? null;

  const onNode = (n: GraphNode) => {
    if (n.kind === "note") {
      s.open(n.id);
    } else if (n.kind === "ghost") {
      s.openTitle(n.label);
    } else {
      s.setTag(n.label.slice(1));
      s.setView("note");
    }
  };

  if (!s.ready) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground text-sm">
        <Spinner className="mr-2 size-4" /> Abrindo suas notas…
      </div>
    );
  }

  const graph = s.view === "graph";
  return (
    <div className="-m-4 mb-[calc(-1rem-env(safe-area-inset-bottom))] grid h-[calc(100dvh-var(--header-h))] grid-cols-1 md:-m-6 md:mb-[calc(-1.5rem-env(safe-area-inset-bottom))] lg:grid-cols-[280px_1fr] xl:grid-cols-[280px_1fr_300px]">
      <div
        className={cn(
          "min-h-0 border-r p-3",
          (note || graph) && "hidden lg:block"
        )}
      >
        <NotesExplorer
          activeId={s.activeId}
          notes={s.notes}
          onGraph={() => s.setView("graph")}
          onImport={() => s.setTransfer(true)}
          onNew={() => {
            s.open(createNote({ content: "" }).id);
            s.changeMode("edit");
          }}
          onOpen={(id) => s.open(id)}
          onTag={s.setTag}
          tag={s.tag}
        />
      </div>
      {graph ? (
        <div className="flex min-h-0 flex-col xl:col-span-2">
          <GraphView
            activeId={s.activeId}
            notes={s.notes}
            onClose={() => s.setView("note")}
            onNode={onNode}
          />
        </div>
      ) : null}
      {!graph && note ? <NoteArea note={note} s={s} /> : null}
      {graph || note ? null : (
        <EmptyNote
          onGraph={() => s.setView("graph")}
          onImport={() => s.setTransfer(true)}
        />
      )}
      <TransferSheet
        current={note}
        notes={s.notes}
        onClose={() => s.setTransfer(false)}
        onOpen={s.open}
        open={s.transfer}
      />
    </div>
  );
}
