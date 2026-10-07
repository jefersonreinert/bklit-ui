"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Icon } from "@/lib/icons";
import {
  addFile,
  ancestors,
  childrenOf,
  createNote,
  saveNote,
} from "@/lib/notes/db";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import { useResolved } from "./note-embeds";

/** Notion-style page header: cover, icon, title, breadcrumbs, sub-pages. */

export const COVER_GRADIENTS = [
  "linear-gradient(120deg,#d97757,#f2c4a8)",
  "linear-gradient(120deg,#1f2a1d,#9cc46b)",
  "linear-gradient(120deg,#0f172a,#475569 60%,#d4a27f)",
  "linear-gradient(120deg,#5c3d2e,#d4a27f)",
  "linear-gradient(120deg,#3b2f5c,#c48b9f)",
  "linear-gradient(120deg,#0e3b43,#5fb3a1)",
  "radial-gradient(circle at 30% 20%,#f5e6c8,#d97757 55%,#2b1d16)",
  "linear-gradient(120deg,#111,#333 50%,#111)",
];

const EMOJIS = [
  "📝",
  "📌",
  "📚",
  "💡",
  "🔥",
  "⭐",
  "✅",
  "📈",
  "💰",
  "🍽️",
  "🥩",
  "🍷",
  "🧑‍🍳",
  "🛒",
  "📦",
  "🧾",
  "🗓️",
  "⏰",
  "📞",
  "✉️",
  "🧠",
  "🎯",
  "🚀",
  "🛠️",
  "💻",
  "🤖",
  "🐙",
  "🦞",
  "🐡",
  "🌱",
  "🌍",
  "🏠",
  "❤️",
  "🎨",
  "🎵",
  "🎬",
  "📷",
  "🔒",
  "🔑",
  "⚙️",
];

const GRADIENT = /^grad:(\d+)$/;
const DEFAULT_ICON_CLASS = "size-[0.7em]";

/** Uploaded image via IndexedDB, or a preset gradient. */
function coverStyle(cover: string | undefined, url: string | null) {
  const grad = cover ? GRADIENT.exec(cover) : null;
  if (grad) {
    return {
      backgroundImage: COVER_GRADIENTS[Number(grad[1])] ?? COVER_GRADIENTS[0],
    };
  }
  return url ? { backgroundImage: `url("${url}")` } : undefined;
}

/** A page's icon at any size (font-size drives the size). */
export function NoteIcon({
  icon,
  className,
}: {
  icon?: string;
  className?: string;
}) {
  const isImage = Boolean(icon?.startsWith("att:"));
  const { url } = useResolved(isImage ? (icon ?? "") : "");
  if (isImage) {
    return url ? (
      // biome-ignore lint/performance/noImgElement: user-uploaded icon (blob URL)
      <img
        alt=""
        className={cn(
          "inline-block size-[1em] rounded-[0.18em] object-cover",
          className
        )}
        height={64}
        src={url}
        width={64}
      />
    ) : (
      <span
        className={cn(
          "inline-block size-[1em] rounded-[0.18em] bg-muted",
          className
        )}
      />
    );
  }
  if (icon) {
    return (
      <span className={cn("inline-block leading-none", className)}>{icon}</span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex size-[1em] items-center justify-center",
        className
      )}
    >
      <Icon className={DEFAULT_ICON_CLASS} name="IconFileText" />
    </span>
  );
}

function useUpload(onDone: (src: string) => void) {
  const input = useRef<HTMLInputElement>(null);
  const field = (
    <input
      accept="image/*"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) {
          const meta = await addFile(file);
          onDone(`att:${meta.id}`);
        }
      }}
      ref={input}
      type="file"
    />
  );
  return { field, open: () => input.current?.click() };
}

function IconPicker({
  note,
  children,
}: {
  note: Note;
  children: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const set = (icon: string | undefined) => {
    saveNote({ ...note, icon });
    setOpen(false);
  };
  const upload = useUpload((src) => set(src));
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger render={children} />
      <PopoverContent align="start" className="w-80 p-3">
        <div className="grid grid-cols-8 gap-1">
          {EMOJIS.map((e) => (
            <button
              aria-label={`Ícone ${e}`}
              className="flex size-8 items-center justify-center rounded-lg text-xl hover:bg-muted"
              key={e}
              onClick={() => set(e)}
              type="button"
            >
              {e}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) {
              set(custom.trim());
              setCustom("");
            }
          }}
        >
          <Input
            aria-label="Outro emoji"
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Outro emoji…"
            value={custom}
          />
          <Button size="sm" type="submit" variant="outline">
            Usar
          </Button>
        </form>
        <div className="mt-2 flex gap-2">
          <Button
            className="flex-1"
            onClick={upload.open}
            size="sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconCloudUpload" />
            Enviar imagem
          </Button>
          {note.icon ? (
            <Button onClick={() => set(undefined)} size="sm" variant="ghost">
              Remover
            </Button>
          ) : null}
        </div>
        {upload.field}
      </PopoverContent>
    </Popover>
  );
}

function CoverPicker({
  note,
  children,
}: {
  note: Note;
  children: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const set = (cover: string | undefined) => {
    saveNote({ ...note, cover });
    setOpen(false);
  };
  const upload = useUpload((src) => set(src));
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger render={children} />
      <PopoverContent align="end" className="w-80 p-3">
        <p className="mb-2 text-muted-foreground text-xs">Degradês</p>
        <div className="grid grid-cols-4 gap-2">
          {COVER_GRADIENTS.map((g, i) => (
            <button
              aria-label={`Capa ${i + 1}`}
              className="h-12 rounded-lg ring-foreground/40 hover:ring-2"
              key={g}
              onClick={() => set(`grad:${i}`)}
              style={{ backgroundImage: g }}
              type="button"
            />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            className="flex-1"
            onClick={upload.open}
            size="sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconCloudUpload" />
            Enviar imagem
          </Button>
          {note.cover ? (
            <Button onClick={() => set(undefined)} size="sm" variant="ghost">
              Remover
            </Button>
          ) : null}
        </div>
        {upload.field}
      </PopoverContent>
    </Popover>
  );
}

function Cover({ note }: { note: Note }) {
  const att = note.cover?.startsWith("att:") ? note.cover : "";
  const { url } = useResolved(att);
  return (
    <div
      className="group relative h-44 w-full bg-center bg-cover md:h-60"
      style={coverStyle(note.cover, url)}
    >
      <div className="absolute right-3 bottom-3 flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <CoverPicker note={note}>
          <button
            className="rounded-full bg-background/85 px-3 py-1.5 text-xs shadow-sm backdrop-blur"
            type="button"
          >
            Trocar capa
          </button>
        </CoverPicker>
      </div>
    </div>
  );
}

function Breadcrumbs({
  note,
  notes,
  onOpen,
}: {
  note: Note;
  notes: Note[];
  onOpen: (n: Note) => void;
}) {
  const chain = ancestors(notes, note);
  if (chain.length === 0) {
    return null;
  }
  return (
    <nav className="mb-2 flex flex-wrap items-center gap-1 text-muted-foreground text-sm">
      {chain.map((a) => (
        <span className="flex items-center gap-1" key={a.id}>
          <button
            className="flex items-center gap-1.5 rounded px-1 hover:bg-muted hover:text-foreground"
            onClick={() => onOpen(a)}
            type="button"
          >
            <NoteIcon icon={a.icon} />
            <span className="max-w-40 truncate">{a.title}</span>
          </button>
          <span>/</span>
        </span>
      ))}
    </nav>
  );
}

/** The sub-pages of a page, like Notion's page blocks. */
function SubPages({
  note,
  notes,
  onOpen,
}: {
  note: Note;
  notes: Note[];
  onOpen: (n: Note) => void;
}) {
  const children = childrenOf(notes, note.id);
  const add = () => {
    const child = createNote({ title: "Nova página", parentId: note.id });
    onOpen(child);
  };
  return (
    <div className="my-6 flex flex-col gap-1.5">
      {children.map((c) => (
        <button
          className="flex w-fit max-w-full items-center gap-3 rounded-lg px-1 py-1 text-left text-[17px] hover:bg-muted/60"
          key={c.id}
          onClick={() => onOpen(c)}
          type="button"
        >
          <NoteIcon className="shrink-0 text-xl" icon={c.icon} />
          <span className="truncate underline decoration-foreground/25 underline-offset-[6px]">
            {c.title || "Sem título"}
          </span>
        </button>
      ))}
      <button
        className="flex w-fit items-center gap-2 rounded-lg px-1 py-1 text-muted-foreground text-sm hover:bg-muted/60 hover:text-foreground"
        onClick={add}
        type="button"
      >
        <Icon className="size-4" name="IconPlusSmall" />
        Nova subpágina
      </button>
    </div>
  );
}

export function NoteHero({
  note,
  notes,
  onOpen,
  onRename,
}: {
  note: Note;
  notes: Note[];
  onOpen: (n: Note) => void;
  onRename: (title: string) => void;
}) {
  const [title, setTitle] = useState(note.title);
  useEffect(() => setTitle(note.title), [note.title]);
  const hasCover = Boolean(note.cover);
  return (
    <div className="min-w-0 pb-2">
      {hasCover ? <Cover note={note} /> : null}
      <div className="mx-auto max-w-3xl px-5 md:px-10">
        <div className={cn("flex flex-col", hasCover ? "-mt-12" : "pt-8")}>
          {note.icon ? (
            <IconPicker note={note}>
              <button
                aria-label="Trocar ícone"
                className="relative w-fit rounded-2xl text-[72px] leading-none transition-transform hover:scale-105"
                type="button"
              >
                <NoteIcon className="drop-shadow-sm" icon={note.icon} />
              </button>
            </IconPicker>
          ) : null}
          <div className="group mt-3 flex flex-wrap gap-1 text-muted-foreground text-sm">
            {note.icon ? null : (
              <IconPicker note={note}>
                <button
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-muted"
                  type="button"
                >
                  <Icon className="size-4" name="IconEmojiGrinning" />
                  Adicionar ícone
                </button>
              </IconPicker>
            )}
            {hasCover ? null : (
              <CoverPicker note={note}>
                <button
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-muted"
                  type="button"
                >
                  <Icon className="size-4" name="IconImages1" />
                  Adicionar capa
                </button>
              </CoverPicker>
            )}
          </div>
          <Breadcrumbs note={note} notes={notes} onOpen={onOpen} />
          <textarea
            aria-label="Título da página"
            className="field-sizing-content mt-1 w-full min-w-0 max-w-full resize-none bg-transparent font-bold text-4xl leading-tight tracking-tight outline-none placeholder:text-muted-foreground/50 md:text-5xl"
            onBlur={() => onRename(title)}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="Sem título"
            rows={1}
            value={title}
          />
          <SubPages note={note} notes={notes} onOpen={onOpen} />
        </div>
      </div>
    </div>
  );
}
