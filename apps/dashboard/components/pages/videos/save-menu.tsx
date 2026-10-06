"use client";

import { Icon } from "@bklitui/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SAVED_TITLE } from "@/lib/video-library-types";
import type { YtVideo } from "@/lib/youtube-types";
import {
  addToPlaylist,
  createPlaylist,
  toggleSaved,
  useLibrary,
} from "./library-store";

/** "Salvar" button: bookmark toggle plus "add to playlist" list. */
export function SaveMenu({
  video,
  compact = false,
}: {
  video: YtVideo;
  compact?: boolean;
}) {
  const lib = useLibrary();
  const saved = lib.saved.has(video.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setBusy(null);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const name = title.trim();
    if (!name) {
      return;
    }
    run("new", async () => {
      const p = await createPlaylist(name, "private");
      await addToPlaylist(p.id, video);
      setAdded((s) => new Set(s).add(p.id));
      setTitle("");
    });
  };

  const label = saved ? "Salvo" : "Salvar";
  const others = lib.playlists.filter((p) => p.title !== SAVED_TITLE);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={saved ? "Salvo" : "Salvar"}
            size={compact ? "icon-sm" : "default"}
            variant={saved ? "secondary" : "outline"}
          />
        }
      >
        <Icon
          className="size-4"
          name={saved ? "IconBookmarkCheck" : "IconBookmarkPlus"}
        />
        {compact ? null : label}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 gap-2 bg-background p-2"
        side="bottom"
      >
        <button
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
          disabled={busy !== null}
          onClick={() => run("saved", () => toggleSaved(video))}
          type="button"
        >
          <Icon
            className="size-4"
            name={saved ? "IconBookmarkCheck" : "IconBookmark"}
          />
          <span className="flex-1">
            {saved ? "Remover de Salvos" : "Salvar em Salvos"}
          </span>
          {busy === "saved" ? (
            <Icon className="size-4 animate-spin" name="IconLoader" />
          ) : null}
        </button>
        {others.length > 0 ? (
          <p className="px-2 pt-1 text-[11px] text-muted-foreground uppercase tracking-wide">
            Adicionar à playlist
          </p>
        ) : null}
        <div className="flex max-h-56 flex-col overflow-y-auto">
          {others.map((p) => (
            <button
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
              disabled={busy !== null || added.has(p.id)}
              key={p.id}
              onClick={() =>
                run(p.id, async () => {
                  await addToPlaylist(p.id, video);
                  setAdded((s) => new Set(s).add(p.id));
                })
              }
              type="button"
            >
              <Icon className="size-4" name="IconPlaylist" />
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              {busy === p.id ? (
                <Icon className="size-4 animate-spin" name="IconLoader" />
              ) : null}
              {added.has(p.id) ? (
                <Icon className="size-4" name="IconCheckmark1" />
              ) : null}
            </button>
          ))}
        </div>
        <form className="flex gap-1 border-t pt-2" onSubmit={create}>
          <Input
            aria-label="Nome da nova playlist"
            className="h-8"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nova playlist…"
            value={title}
          />
          <Button
            aria-label="Criar playlist e adicionar"
            disabled={!title.trim() || busy !== null}
            size="icon-sm"
            type="submit"
          >
            <Icon className="size-4" name="IconPlusSmall" />
          </Button>
        </form>
        {error ? (
          <p className="px-2 text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
        <p className={cn("px-2 text-[11px] text-muted-foreground")}>
          {lib.mode === "youtube"
            ? "Salvo na sua conta do YouTube."
            : "Salvo neste navegador. Conecte o Google para sincronizar."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
