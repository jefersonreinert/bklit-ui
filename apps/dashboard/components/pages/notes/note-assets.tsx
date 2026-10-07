"use client";

import { type ReactElement, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/lib/icons";
import { addFile, removeFromLibrary, useNotes } from "@/lib/notes/db";
import {
  type Logo,
  logoUrl,
  logoValue,
  useDarkTheme,
  useLogos,
} from "@/lib/notes/svgl";
import { cn } from "@/lib/utils";
import { useResolved } from "./note-embeds";

/**
 * Icon & cover library: emojis or gradients, the person's own uploaded
 * images (kept for reuse on any page) and every svgl brand logo.
 */

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

const FAVORITES_KEY = "cb:notes:logo-favorites";
const PAGE = 90;

type Mode = "icon" | "cover";
type Tab = "emoji" | "gradient" | "library" | "logos";

function readFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Logo image that follows the light/dark theme. */
export function LogoImage({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const dark = useDarkTheme();
  return (
    // biome-ignore lint/performance/noImgElement: remote SVG logos from svgl.app
    <img
      alt=""
      className={cn("object-contain", className)}
      height={64}
      loading="lazy"
      src={logoUrl(value, dark)}
      width={64}
    />
  );
}

function LibraryThumb({
  id,
  onPick,
  onRemove,
}: {
  id: string;
  onPick: () => void;
  onRemove: () => void;
}) {
  const { url } = useResolved(`att:${id}`);
  return (
    <div className="group relative">
      <button
        className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-muted/40 hover:ring-2 hover:ring-foreground/30"
        onClick={onPick}
        type="button"
      >
        {url ? (
          // biome-ignore lint/performance/noImgElement: blob URL from IndexedDB
          <img
            alt=""
            className="size-full object-cover"
            height={64}
            src={url}
            width={64}
          />
        ) : null}
      </button>
      <button
        aria-label="Remover da biblioteca"
        className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full bg-foreground text-background group-hover:flex"
        onClick={onRemove}
        type="button"
      >
        <Icon className="size-3" name="IconCrossSmall" />
      </button>
    </div>
  );
}

function LibraryTab({
  query,
  onPick,
}: {
  query: string;
  onPick: (v: string) => void;
}) {
  const { files } = useNotes();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [favorites, setFavorites] = useState(readFavorites);
  const q = query.toLowerCase();
  const images = files
    .filter(
      (f) =>
        f.library &&
        f.type.startsWith("image/") &&
        f.name.toLowerCase().includes(q)
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  const favs = favorites.filter((v) => v.toLowerCase().includes(q));

  const upload = async (list: FileList | null) => {
    setBusy(true);
    for (const f of [...(list ?? [])]) {
      if (f.type.startsWith("image/")) {
        await addFile(f, { library: true });
      }
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={() => input.current?.click()}
        size="sm"
        variant="outline"
      >
        {busy ? (
          <Spinner className="size-4" />
        ) : (
          <Icon className="size-4" name="IconCloudUpload" />
        )}
        Adicionar imagens à biblioteca
      </Button>
      <input
        accept="image/*"
        className="hidden"
        multiple
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
        ref={input}
        type="file"
      />
      {images.length + favs.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-xs">
          {q
            ? "Nada encontrado na sua biblioteca."
            : "Sua biblioteca está vazia. Envie imagens (PNG, JPG, SVG, GIF) ou marque logos com ★ na aba Logos."}
        </p>
      ) : null}
      <div className="grid grid-cols-5 gap-2">
        {images.map((f) => (
          <LibraryThumb
            id={f.id}
            key={f.id}
            onPick={() => onPick(`att:${f.id}`)}
            onRemove={() => removeFromLibrary(f.id)}
          />
        ))}
        {favs.map((v) => (
          <div className="group relative" key={v}>
            <button
              className="flex aspect-square w-full items-center justify-center rounded-xl border bg-muted/40 p-2 hover:ring-2 hover:ring-foreground/30"
              onClick={() => onPick(v)}
              type="button"
            >
              <LogoImage className="size-full" value={v} />
            </button>
            <button
              aria-label="Remover da biblioteca"
              className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full bg-foreground text-background group-hover:flex"
              onClick={() => {
                const next = favorites.filter((x) => x !== v);
                setFavorites(next);
                localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
              }}
              type="button"
            >
              <Icon className="size-3" name="IconCrossSmall" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogoTile({
  logo,
  starred,
  onPick,
  onStar,
}: {
  logo: Logo;
  starred: boolean;
  onPick: () => void;
  onStar: () => void;
}) {
  return (
    <div className="group relative">
      <button
        className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border bg-card p-2 hover:ring-2 hover:ring-foreground/30"
        onClick={onPick}
        title={logo.title}
        type="button"
      >
        <LogoImage className="size-8" value={logoValue(logo)} />
        <span className="w-full truncate text-center text-[9px] text-muted-foreground">
          {logo.title}
        </span>
      </button>
      <button
        aria-label={starred ? "Tirar da biblioteca" : "Salvar na biblioteca"}
        className={cn(
          "absolute top-0.5 right-0.5 size-5 rounded-full text-xs",
          starred
            ? "text-[#d97757]"
            : "hidden text-muted-foreground group-hover:block"
        )}
        onClick={onStar}
        type="button"
      >
        {starred ? "★" : "☆"}
      </button>
    </div>
  );
}

function LogosTab({
  query,
  onPick,
}: {
  query: string;
  onPick: (v: string) => void;
}) {
  const { logos, error } = useLogos(true);
  const [category, setCategory] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [favorites, setFavorites] = useState(readFavorites);
  const categories = useMemo(
    () => [...new Set((logos ?? []).flatMap((l) => l.categories))].sort(),
    [logos]
  );
  if (error) {
    return (
      <p className="py-6 text-center text-destructive text-xs">
        Não consegui carregar os logos do svgl.
      </p>
    );
  }
  if (!logos) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-5" />
      </div>
    );
  }
  const q = query.toLowerCase();
  const list = logos.filter(
    (l) =>
      (!category || l.categories.includes(category)) &&
      (!q || l.title.toLowerCase().includes(q))
  );
  const star = (v: string) => {
    const next = favorites.includes(v)
      ? favorites.filter((x) => x !== v)
      : [v, ...favorites];
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      // Private mode
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {[null, ...categories].map((c) => (
          <button
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-xs",
              category === c
                ? "border-foreground bg-foreground text-background"
                : "bg-card"
            )}
            key={c ?? "all"}
            onClick={() => {
              setCategory(c);
              setLimit(PAGE);
            }}
            type="button"
          >
            {c ?? `Todos (${logos.length})`}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {list.slice(0, limit).map((l) => {
          const v = logoValue(l);
          return (
            <LogoTile
              key={v}
              logo={l}
              onPick={() => onPick(v)}
              onStar={() => star(v)}
              starred={favorites.includes(v)}
            />
          );
        })}
      </div>
      {list.length > limit ? (
        <Button
          onClick={() => setLimit((n) => n + PAGE * 2)}
          size="sm"
          variant="ghost"
        >
          Mostrar mais ({list.length - limit})
        </Button>
      ) : null}
      {list.length === 0 ? (
        <p className="py-4 text-center text-muted-foreground text-xs">
          Nenhum logo encontrado.
        </p>
      ) : null}
      <p className="text-center text-[10px] text-muted-foreground">
        Logos do{" "}
        <a
          className="underline"
          href="https://svgl.app"
          rel="noopener noreferrer"
          target="_blank"
        >
          svgl
        </a>{" "}
        · marcas pertencem aos seus donos
      </p>
    </div>
  );
}

function EmojiTab({
  query,
  onPick,
}: {
  query: string;
  onPick: (v: string) => void;
}) {
  const custom = query.trim();
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-8 gap-1">
        {EMOJIS.map((e) => (
          <button
            aria-label={`Ícone ${e}`}
            className="flex aspect-square items-center justify-center rounded-lg text-2xl hover:bg-muted"
            key={e}
            onClick={() => onPick(e)}
            type="button"
          >
            {e}
          </button>
        ))}
      </div>
      {custom ? (
        <Button onClick={() => onPick(custom)} size="sm" variant="outline">
          Usar “{custom}” como ícone
        </Button>
      ) : (
        <p className="text-center text-muted-foreground text-xs">
          Digite qualquer emoji na busca para usá-lo.
        </p>
      )}
    </div>
  );
}

function GradientTab({ onPick }: { onPick: (v: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {COVER_GRADIENTS.map((g, i) => (
        <button
          aria-label={`Degradê ${i + 1}`}
          className="h-14 rounded-xl ring-foreground/40 hover:ring-2"
          key={g}
          onClick={() => onPick(`grad:${i}`)}
          style={{ backgroundImage: g }}
          type="button"
        />
      ))}
    </div>
  );
}

const TABS: Record<Mode, { id: Tab; label: string }[]> = {
  icon: [
    { id: "emoji", label: "Emojis" },
    { id: "library", label: "Biblioteca" },
    { id: "logos", label: "Logos" },
  ],
  cover: [
    { id: "gradient", label: "Degradês" },
    { id: "library", label: "Biblioteca" },
    { id: "logos", label: "Logos" },
  ],
};

/** Picker for a page's icon or cover. onPick(undefined) removes it. */
export function AssetPicker({
  mode,
  hasValue,
  onPick,
  children,
}: {
  mode: Mode;
  hasValue: boolean;
  onPick: (value: string | undefined) => void;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(mode === "icon" ? "emoji" : "gradient");
  const [query, setQuery] = useState("");
  const pick = (v: string | undefined) => {
    onPick(v);
    setOpen(false);
  };
  return (
    <Popover
      onOpenChange={(next) => {
        if (next) {
          setQuery("");
        }
        setOpen(next);
      }}
      open={open}
    >
      <PopoverTrigger render={children} />
      <PopoverContent
        align={mode === "icon" ? "start" : "end"}
        className="flex max-h-[min(70vh,560px)] w-[min(92vw,420px)] flex-col gap-3 overflow-hidden p-3"
      >
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-full bg-muted p-0.5 text-sm">
            {TABS[mode].map((t) => (
              <button
                className={cn(
                  "flex-1 rounded-full px-2 py-1 transition-colors",
                  tab === t.id ? "bg-card shadow-sm" : "text-muted-foreground"
                )}
                key={t.id}
                onClick={() => setTab(t.id)}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>
          {hasValue ? (
            <Button onClick={() => pick(undefined)} size="sm" variant="ghost">
              Remover
            </Button>
          ) : null}
        </div>
        {tab === "gradient" ? null : (
          <Input
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "emoji" ? "Digite um emoji…" : "Buscar…"}
            value={query}
          />
        )}
        <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-1">
          {tab === "emoji" ? <EmojiTab onPick={pick} query={query} /> : null}
          {tab === "gradient" ? <GradientTab onPick={pick} /> : null}
          {tab === "library" ? (
            <LibraryTab onPick={pick} query={query} />
          ) : null}
          {tab === "logos" ? <LogosTab onPick={pick} query={query} /> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
