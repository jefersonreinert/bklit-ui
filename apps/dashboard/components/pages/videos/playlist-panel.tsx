"use client";

import { Icon } from "@/lib/icons";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import {
  type LibItem,
  type LibPlaylist,
  type LibPrivacy,
  PRIVACY_LABELS,
  SAVED_TITLE,
} from "@/lib/video-library-types";
import {
  formatDuration,
  formatLongDuration,
  parseYtLink,
  type YtVideoDetails,
} from "@/lib/youtube-types";
import { relativeDate, shortNumber } from "../youtube/use-youtube";
import { Thumb } from "../youtube/video-card";
import {
  addToPlaylist,
  deletePlaylist,
  followChannel,
  type Progress,
  removeFromPlaylist,
  renamePlaylist,
  setPrivacy,
} from "./library-store";
import { resolveChannel } from "./resolve-channel";

const PRIVACY_ITEMS = (Object.keys(PRIVACY_LABELS) as LibPrivacy[]).map(
  (p) => ({
    value: p,
    label: PRIVACY_LABELS[p],
  })
);

function TitleEditor({ playlist }: { playlist: LibPlaylist }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(playlist.title);
  const [busy, setBusy] = useState(false);
  const fixed = playlist.title === SAVED_TITLE;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const title = value.trim();
    if (!title || title === playlist.title) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await renamePlaylist(playlist.id, title);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <form className="flex flex-1 items-center gap-2" onSubmit={save}>
        <Input
          aria-label="Nome da playlist"
          autoFocus
          className="h-9 max-w-md text-base"
          onChange={(e) => setValue(e.target.value)}
          value={value}
        />
        <Button disabled={busy} size="sm" type="submit">
          {busy ? "Salvando…" : "Salvar"}
        </Button>
        <Button
          onClick={() => {
            setValue(playlist.title);
            setEditing(false);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancelar
        </Button>
      </form>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <h2 className="truncate font-semibold text-xl tracking-tight">
        {playlist.title}
      </h2>
      {fixed ? null : (
        <Button
          aria-label="Renomear playlist"
          onClick={() => {
            setValue(playlist.title);
            setEditing(true);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconPencil" />
        </Button>
      )}
    </div>
  );
}

function AddVideo({
  playlistId,
  onAdded,
}: {
  playlistId: string;
  onAdded: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const link = parseYtLink(value);
    if (link?.kind !== "video") {
      setError("Cole o link de um vídeo do YouTube.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${BASE_PATH}/api/youtube/video/?id=${encodeURIComponent(link.id)}`
      );
      const video = (await res.json()) as YtVideoDetails & { error?: string };
      if (!res.ok) {
        throw new Error(video.error ?? "Vídeo não encontrado");
      }
      await addToPlaylist(playlistId, video);
      setValue("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="flex flex-col gap-1" onSubmit={submit}>
      <div className="flex gap-2">
        <Input
          aria-label="Link do vídeo para adicionar"
          className="h-9"
          onChange={(e) => setValue(e.target.value)}
          placeholder="Colar link do YouTube para adicionar…"
          value={value}
        />
        <Button className="h-9" disabled={busy || !value.trim()} type="submit">
          <Icon className="size-4" name="IconPlusSmall" />
          {busy ? "Adicionando…" : "Adicionar"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </form>
  );
}

/** An empty playlist named "@canal" usually means "show me this channel". */
function FollowHint({
  handle,
  onOpenChannel,
}: {
  handle: string;
  onOpenChannel: (channelId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const channel = await resolveChannel(handle);
      await followChannel({
        channelId: channel.id,
        title: channel.title,
        thumbnail: channel.thumbnail,
      });
      onOpenChannel(channel.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Canal não encontrado");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card/60 p-4 text-sm">
      <p>
        Esta é uma playlist sua com o nome <b>{handle}</b>, por isso está vazia.
        Para ver <b>todos os vídeos e playlists do canal</b>, siga o canal:
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={go} size="sm">
          <Icon className="size-4" name="IconYoutube" />
          {busy ? "Abrindo…" : `Seguir o canal ${handle}`}
        </Button>
        <span className="text-muted-foreground text-xs">
          Depois você pode excluir esta playlist vazia na lixeira acima.
        </span>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function PlaylistPanel({
  playlist,
  items,
  loading,
  progress,
  playingId,
  onPlay,
  onReload,
  onDeleted,
  onOpenChannel,
}: {
  onOpenChannel?: (channelId: string) => void;
  playlist: LibPlaylist;
  items: LibItem[];
  loading: boolean;
  progress: Record<string, Progress>;
  playingId: string | null;
  onPlay: (index: number) => void;
  onReload: () => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + i.video.duration, 0);
  const watched = items.filter((i) => {
    const p = progress[i.video.id];
    return p && p.d > 0 && p.t / p.d >= 0.95;
  }).length;

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <TitleEditor key={playlist.id} playlist={playlist} />
        <Select
          items={PRIVACY_ITEMS}
          onValueChange={(v) =>
            act(() => setPrivacy(playlist.id, v as LibPrivacy))
          }
          value={playlist.privacy}
        >
          <SelectTrigger aria-label="Privacidade" className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIVACY_ITEMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {confirm ? (
          <div className="flex items-center gap-1">
            <Button
              onClick={() =>
                act(async () => {
                  await deletePlaylist(playlist.id);
                  onDeleted();
                })
              }
              size="sm"
              variant="destructive"
            >
              Excluir de vez
            </Button>
            <Button onClick={() => setConfirm(false)} size="sm" variant="ghost">
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            aria-label="Excluir playlist"
            onClick={() => setConfirm(true)}
            size="icon-sm"
            variant="ghost"
          >
            <Icon className="size-4" name="IconTrashCan" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
        <span>{items.length} vídeos</span>
        <span>{formatLongDuration(total)}</span>
        <span>
          {watched}/{items.length} assistidos
        </span>
        <Button
          className="ml-auto"
          disabled={items.length === 0}
          onClick={() => onPlay(0)}
          size="sm"
        >
          <Icon className="size-4" name="IconPlay" />
          Reproduzir tudo
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <AddVideo onAdded={onReload} playlistId={playlist.id} />

      {loading ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          Carregando vídeos…
        </p>
      ) : null}
      {!loading &&
      items.length === 0 &&
      playlist.title.startsWith("@") &&
      onOpenChannel ? (
        <FollowHint handle={playlist.title} onOpenChannel={onOpenChannel} />
      ) : null}
      {!loading && items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
          Nenhum vídeo ainda. Cole um link acima ou use o botão <b>Salvar</b> em
          qualquer vídeo da página YouTube.
        </p>
      ) : null}

      <ol className="flex flex-col gap-1">
        {items.map((item, i) => {
          const p = progress[item.video.id];
          const pct = p && p.d > 0 ? Math.min(100, (p.t / p.d) * 100) : 0;
          const playing = playingId === item.video.id;
          return (
            <li
              className={cn(
                "group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60",
                playing && "bg-muted"
              )}
              key={item.itemId}
            >
              <span className="w-6 shrink-0 text-center text-muted-foreground text-xs tabular-nums">
                {playing ? (
                  <Icon className="mx-auto size-3.5" name="IconPlay" />
                ) : (
                  i + 1
                )}
              </span>
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => onPlay(i)}
                type="button"
              >
                <div className="relative w-32 shrink-0 sm:w-40">
                  <Thumb
                    duration={item.video.duration}
                    src={item.video.thumbnail}
                  />
                  {pct > 0 ? (
                    <span className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-white/30">
                      <span
                        className="block h-full bg-red-600"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium text-sm">
                    {item.video.title}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {item.video.channelTitle} · {shortNumber(item.video.views)}{" "}
                    visualizações · {relativeDate(item.video.publishedAt)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDuration(item.video.duration)}
                    {pct >= 95 ? " · assistido" : null}
                    {pct > 0 && pct < 95
                      ? ` · ${Math.round(pct)}% assistido`
                      : null}
                  </p>
                </div>
              </button>
              <Button
                aria-label="Remover da playlist"
                className="opacity-60 group-hover:opacity-100"
                onClick={() =>
                  act(async () => {
                    await removeFromPlaylist(playlist.id, item.itemId);
                    onReload();
                  })
                }
                size="icon-sm"
                variant="ghost"
              >
                <Icon className="size-4" name="IconCrossSmall" />
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
