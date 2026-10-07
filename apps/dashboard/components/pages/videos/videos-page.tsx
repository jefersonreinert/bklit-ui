"use client";

import { Icon } from "@/lib/icons";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BASE_PATH, googleStartUrl, useConnectors } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import {
  type LibItem,
  type LibPlaylist,
  SAVED_TITLE,
} from "@/lib/video-library-types";
import { formatDuration, type YtVideo } from "@/lib/youtube-types";
import { relativeDate, shortNumber } from "../youtube/use-youtube";
import { Thumb } from "../youtube/video-card";
import { ChannelPanel } from "./channel-panel";
import {
  createPlaylist,
  followChannel,
  loadItems,
  type Progress,
  readProgress,
  useLibraryWith,
} from "./library-store";
import { Player } from "./player";
import { PlaylistPanel } from "./playlist-panel";
import { resolveChannel } from "./resolve-channel";
import { SaveMenu } from "./save-menu";

const CONTINUE = "continue";
const CHANNEL = "ch:";
const AUTOPLAY_KEY = "casa-brasa-video-autoplay";

interface NowPlaying {
  queue: YtVideo[];
  index: number;
  label: string;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card/60 px-4 py-3">
      <p className="font-semibold text-xl tabular-nums tracking-tight">
        {value}
      </p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function FollowChannel({ onFollowed }: { onFollowed: (id: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const channel = await resolveChannel(value);
      await followChannel({
        channelId: channel.id,
        title: channel.title,
        thumbnail: channel.thumbnail,
      });
      setValue("");
      onFollowed(channel.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Canal não encontrado");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="flex flex-col gap-1" onSubmit={submit}>
      <div className="flex gap-1">
        <Input
          aria-label="Seguir canal"
          className="h-8"
          onChange={(e) => setValue(e.target.value)}
          placeholder="@canal ou link do canal"
          value={value}
        />
        <Button
          aria-label="Seguir canal"
          disabled={busy || !value.trim()}
          size="icon-sm"
          type="submit"
        >
          <Icon
            className={cn("size-4", busy && "animate-spin")}
            name={busy ? "IconLoader" : "IconPlusSmall"}
          />
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </form>
  );
}

function NewPlaylist() {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createPlaylist(title.trim(), "private");
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="flex flex-col gap-1" onSubmit={submit}>
      <div className="flex gap-1">
        <Input
          aria-label="Nome da nova playlist"
          className="h-8"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova playlist…"
          value={title}
        />
        <Button
          aria-label="Criar playlist"
          disabled={busy || !title.trim()}
          size="icon-sm"
          type="submit"
        >
          <Icon className="size-4" name="IconPlusSmall" />
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </form>
  );
}

function NavItem({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: "IconHistory" | "IconBookmark" | "IconPlaylist" | "IconYoutube";
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-muted font-medium"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4 shrink-0" name={icon} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count === undefined ? null : (
        <span className="text-muted-foreground text-xs tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

function NowPlayingPanel({
  now,
  autoplay,
  onAutoplay,
  onIndex,
  onClose,
}: {
  now: NowPlaying;
  autoplay: boolean;
  onAutoplay: (on: boolean) => void;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const video = now.queue[now.index];
  if (!video) {
    return null;
  }
  const hasNext = now.index < now.queue.length - 1;
  const prompt = `Use o YouTube: transcreva o vídeo https://youtu.be/${video.id} ("${video.title}") e me dê um resumo em tópicos.`;
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-3">
        <Player
          autoplay
          onEnded={() => {
            if (autoplay && hasNext) {
              onIndex(now.index + 1);
            }
          }}
          video={video}
        />
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-lg leading-snug">
              {video.title}
            </h2>
            <p className="text-muted-foreground text-sm">
              {video.channelTitle} · {shortNumber(video.views)} visualizações ·{" "}
              {relativeDate(video.publishedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              aria-label="Anterior"
              disabled={now.index === 0}
              onClick={() => onIndex(now.index - 1)}
              size="icon"
              variant="outline"
            >
              <Icon className="size-4" name="IconArrowLeft" />
            </Button>
            <Button
              aria-label="Próximo"
              disabled={!hasNext}
              onClick={() => onIndex(now.index + 1)}
              size="icon"
              variant="outline"
            >
              <Icon className="size-4" name="IconArrowRight" />
            </Button>
            <SaveMenu video={video} />
            <Button
              nativeButton={false}
              render={<a href={`${BASE_PATH}/youtube/?v=${video.id}`} />}
              variant="outline"
            >
              <Icon className="size-4" name="IconFileText" />
              Transcrição
            </Button>
            <Button
              nativeButton={false}
              render={
                <a
                  href={`${BASE_PATH}/ia/?prompt=${encodeURIComponent(prompt)}`}
                />
              }
              variant="outline"
            >
              <Icon className="size-4" name="IconSparklesSoft" />
              IA
            </Button>
            <Button
              aria-label="Fechar player"
              onClick={onClose}
              size="icon"
              variant="ghost"
            >
              <Icon className="size-4" name="IconCrossSmall" />
            </Button>
          </div>
        </div>
      </div>
      <aside className="flex max-h-[70vh] flex-col gap-2 rounded-2xl border bg-card/60 p-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-medium text-sm">
            {now.label}{" "}
            <span className="text-muted-foreground">
              · {now.index + 1}/{now.queue.length}
            </span>
          </p>
          <span className="text-muted-foreground text-xs">Automático</span>
          <Switch
            aria-label="Reproduzir o próximo automaticamente"
            checked={autoplay}
            onCheckedChange={onAutoplay}
          />
        </div>
        <ol className="flex flex-col gap-1 overflow-y-auto">
          {now.queue.map((v, i) => (
            <li key={`${v.id}-${i}`}>
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-muted/60",
                  i === now.index && "bg-muted"
                )}
                onClick={() => onIndex(i)}
                type="button"
              >
                <Thumb
                  className="w-24 shrink-0"
                  duration={v.duration}
                  src={v.thumbnail}
                />
                <span className="line-clamp-2 min-w-0 flex-1 text-xs">
                  {v.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}

function ContinueWatching({
  progress,
  onPlay,
}: {
  progress: Record<string, Progress>;
  onPlay: (videos: YtVideo[], index: number) => void;
}) {
  const entries = Object.values(progress)
    .filter((p) => p.video && p.d > 0 && p.t / p.d > 0.02)
    .sort((a, b) => b.at - a.at);
  const videos = entries.map((p) => p.video as YtVideo);
  if (videos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        Os vídeos que você começar a assistir aparecem aqui, com o ponto onde
        parou.
      </p>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-xl tracking-tight">
        Continuar assistindo
      </h2>
      <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {entries.map((p, i) => {
          const v = p.video as YtVideo;
          const pct = Math.min(100, (p.t / p.d) * 100);
          return (
            <button
              className="group flex flex-col gap-2 text-left"
              key={v.id}
              onClick={() => onPlay(videos, i)}
              type="button"
            >
              <div className="relative">
                <Thumb duration={v.duration} src={v.thumbnail} />
                <span className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-white/30">
                  <span
                    className="block h-full bg-red-600"
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </div>
              <p className="line-clamp-2 font-medium text-sm">{v.title}</p>
              <p className="text-muted-foreground text-xs">
                {pct >= 95
                  ? "Assistido"
                  : `Parou em ${formatDuration(Math.floor(p.t))} de ${formatDuration(v.duration)}`}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function VideosPage() {
  const { status } = useConnectors();
  const lib = useLibraryWith(status);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<LibItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [autoplay, setAutoplay] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setProgress(readProgress());
    try {
      setAutoplay(localStorage.getItem(AUTOPLAY_KEY) !== "off");
    } catch {
      // keep default
    }
    const t = setInterval(() => setProgress(readProgress()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Default selection: Salvos, else the first playlist, else "continue"
  useEffect(() => {
    if (lib.mode === "loading") {
      return;
    }
    if (
      selected &&
      (selected === CONTINUE ||
        selected.startsWith(CHANNEL) ||
        lib.playlists.some((p) => p.id === selected))
    ) {
      return;
    }
    const saved = lib.playlists.find((p) => p.title === SAVED_TITLE);
    setSelected(saved?.id ?? lib.playlists[0]?.id ?? CONTINUE);
  }, [lib.mode, lib.playlists, selected]);

  const playlist: LibPlaylist | undefined = lib.playlists.find(
    (p) => p.id === selected
  );
  const count = playlist?.count;

  // Reloads when the playlist, its count or `version` changes
  useEffect(() => {
    if (!playlist) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoadingItems(true);
    loadItems(playlist.id)
      .then((list) => {
        if (!cancelled) {
          setItems(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingItems(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [playlist?.id, count, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const changeAutoplay = (on: boolean) => {
    setAutoplay(on);
    try {
      localStorage.setItem(AUTOPLAY_KEY, on ? "on" : "off");
    } catch {
      // ignore
    }
  };
  const play = (queue: YtVideo[], index: number, label: string) => {
    setNow({ queue, index, label });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const savedFirst = (p: LibPlaylist) => (p.title === SAVED_TITLE ? 0 : 1);
  const sorted = [...lib.playlists].sort(
    (a, b) => savedFirst(a) - savedFirst(b) || a.title.localeCompare(b.title)
  );
  const totalVideos = lib.playlists.reduce((s, p) => s + p.count, 0);
  const progressList = Object.values(progress);
  const inProgress = progressList.filter(
    (p) => p.d > 0 && p.t / p.d > 0.02 && p.t / p.d < 0.95
  ).length;
  const watchedHours =
    progressList.reduce((s, p) => s + Math.min(p.t, p.d), 0) / 3600;

  return (
    <div className="flex flex-col gap-5">
      {lib.mode === "local" ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card/60 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <Icon
            className="hidden size-4 shrink-0 sm:block"
            name="IconYoutube"
          />
          <span className="flex-1 text-muted-foreground">
            Sua biblioteca está salva neste navegador. Conecte o Google para
            guardar as playlists na sua conta do YouTube e ver tudo no iPhone,
            no computador e no app do YouTube.
          </span>
          {status?.configured && status.google.available ? (
            <a
              className="rounded-md bg-foreground px-2.5 py-1 font-medium text-background text-xs"
              href={googleStartUrl(`${BASE_PATH}/videos/`)}
            >
              Conectar com Google
            </a>
          ) : null}
        </div>
      ) : null}
      {lib.error ? (
        <p
          className="rounded-xl border border-destructive/40 px-4 py-3 text-destructive text-sm"
          role="alert"
        >
          {lib.error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="playlists" value={String(lib.playlists.length)} />
        <Kpi
          label="vídeos na biblioteca"
          value={totalVideos.toLocaleString("pt-BR")}
        />
        <Kpi label="em andamento" value={String(inProgress)} />
        <Kpi
          label="horas assistidas"
          value={watchedHours.toFixed(1).replace(".", ",")}
        />
      </div>

      {now ? (
        <NowPlayingPanel
          autoplay={autoplay}
          now={now}
          onAutoplay={changeAutoplay}
          onClose={() => {
            setNow(null);
            setProgress(readProgress());
          }}
          onIndex={(i) => setNow((n) => (n ? { ...n, index: i } : n))}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Playlists" className="flex flex-col gap-3">
          <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            <NavItem
              active={selected === CONTINUE}
              icon="IconHistory"
              label="Continuar assistindo"
              onClick={() => setSelected(CONTINUE)}
            />
            {sorted.map((p) => (
              <NavItem
                active={selected === p.id}
                count={p.count}
                icon={p.title === SAVED_TITLE ? "IconBookmark" : "IconPlaylist"}
                key={p.id}
                label={p.title}
                onClick={() => setSelected(p.id)}
              />
            ))}
          </div>
          <NewPlaylist />
          <div className="flex flex-col gap-1 border-t pt-3">
            <p className="px-1 text-[11px] text-muted-foreground uppercase tracking-wide">
              Canais seguidos
            </p>
            <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {lib.followed.map((c) => (
                <NavItem
                  active={selected === `${CHANNEL}${c.channelId}`}
                  icon="IconYoutube"
                  key={c.channelId}
                  label={c.title}
                  onClick={() => setSelected(`${CHANNEL}${c.channelId}`)}
                />
              ))}
            </div>
            <FollowChannel
              onFollowed={(id) => setSelected(`${CHANNEL}${id}`)}
            />
          </div>
          {lib.mode === "youtube" ? (
            <p className="text-[11px] text-muted-foreground">
              Sincronizado com a sua conta do YouTube ({status?.google.email}).
            </p>
          ) : null}
        </nav>

        {selected?.startsWith(CHANNEL) ? (
          <ChannelPanel
            channelId={selected.slice(CHANNEL.length)}
            key={selected}
            onPlay={play}
            playingId={now?.queue[now.index]?.id ?? null}
            progress={progress}
          />
        ) : null}
        {selected === CONTINUE ? (
          <ContinueWatching
            onPlay={(videos, i) => play(videos, i, "Continuar assistindo")}
            progress={progress}
          />
        ) : null}
        {playlist ? (
          <PlaylistPanel
            items={items}
            loading={loadingItems}
            onDeleted={() => setSelected(null)}
            onOpenChannel={(id) => setSelected(`${CHANNEL}${id}`)}
            onPlay={(i) =>
              play(
                items.map((it) => it.video),
                i,
                playlist.title
              )
            }
            onReload={reload}
            playingId={now?.queue[now.index]?.id ?? null}
            playlist={playlist}
            progress={progress}
          />
        ) : null}
        {lib.mode === "loading" ? (
          <p className="text-muted-foreground text-sm">
            Carregando biblioteca…
          </p>
        ) : null}
      </div>
    </div>
  );
}
