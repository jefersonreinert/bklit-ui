"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { ancestors, childrenOf, createNote, saveNote } from "@/lib/notes/db";
import { isLogo } from "@/lib/notes/svgl";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import { AssetPicker, COVER_GRADIENTS, LogoImage } from "./note-assets";
import { useResolved } from "./note-embeds";

/** Notion-style page header: cover, icon, title, breadcrumbs, sub-pages. */

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
  if (isLogo(icon)) {
    return (
      <LogoImage
        className={cn("inline-block size-[1em]", className)}
        value={icon}
      />
    );
  }
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

function Cover({ note }: { note: Note }) {
  const att = note.cover?.startsWith("att:") ? note.cover : "";
  const { url } = useResolved(att);
  const logo = isLogo(note.cover) ? note.cover : null;
  return (
    <div
      className={cn(
        "group relative h-44 w-full bg-center bg-cover md:h-60",
        logo &&
          "flex items-center justify-center bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklab,var(--foreground)_8%,transparent),transparent_70%)] bg-muted/40"
      )}
      style={logo ? undefined : coverStyle(note.cover, url)}
    >
      {logo ? (
        <LogoImage
          className="h-20 w-auto max-w-[50%] drop-shadow-sm md:h-28"
          value={logo}
        />
      ) : null}
      <div className="absolute right-3 bottom-3 flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <AssetPicker
          hasValue={Boolean(note.cover)}
          mode="cover"
          onPick={(cover) => saveNote({ ...note, cover })}
        >
          <button
            className="rounded-full bg-background/85 px-3 py-1.5 text-xs shadow-sm backdrop-blur"
            type="button"
          >
            Trocar capa
          </button>
        </AssetPicker>
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
            <AssetPicker
              hasValue
              mode="icon"
              onPick={(icon) => saveNote({ ...note, icon })}
            >
              <button
                aria-label="Trocar ícone"
                className="relative w-fit rounded-2xl text-[72px] leading-none transition-transform hover:scale-105"
                type="button"
              >
                <NoteIcon className="drop-shadow-sm" icon={note.icon} />
              </button>
            </AssetPicker>
          ) : null}
          <div className="group mt-3 flex flex-wrap gap-1 text-muted-foreground text-sm">
            {note.icon ? null : (
              <AssetPicker
                hasValue={false}
                mode="icon"
                onPick={(icon) => saveNote({ ...note, icon })}
              >
                <button
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-muted"
                  type="button"
                >
                  <Icon className="size-4" name="IconEmojiGrinning" />
                  Adicionar ícone
                </button>
              </AssetPicker>
            )}
            {hasCover ? null : (
              <AssetPicker
                hasValue={Boolean(note.cover)}
                mode="cover"
                onPick={(cover) => saveNote({ ...note, cover })}
              >
                <button
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-muted"
                  type="button"
                >
                  <Icon className="size-4" name="IconImages1" />
                  Adicionar capa
                </button>
              </AssetPicker>
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
