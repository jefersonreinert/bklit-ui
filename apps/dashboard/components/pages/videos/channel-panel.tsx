"use client";

import { Icon } from "@/lib/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  formatLongDuration,
  type YtChannel,
  type YtPlaylist,
  type YtPlaylistSummary,
  type YtVideo,
} from "@/lib/youtube-types";
import {
  relativeDate,
  shortNumber,
  useYt,
  ytGet,
} from "../youtube/use-youtube";
import { Thumb } from "../youtube/video-card";
import {
  followChannel,
  markSeen,
  type Progress,
  readSeen,
  unfollowChannel,
  useLibrary,
} from "./library-store";
import { SaveMenu } from "./save-menu";

interface UploadsPage {
  videos: YtVideo[];
  nextPageToken: string | null;
  total: number;
}

type PlayFn = (queue: YtVideo[], index: number, label: string) => void;

function VideoRows({
  videos,
  progress,
  playingId,
  newSince,
  onPlay,
}: {
  videos: YtVideo[];
  progress: Record<string, Progress>;
  playingId: string | null;
  newSince: string | null;
  onPlay: (index: number) => void;
}) {
  return (
    <ol className="flex flex-col gap-1">
      {videos.map((v, i) => {
        const p = progress[v.id];
        const pct = p && p.d > 0 ? Math.min(100, (p.t / p.d) * 100) : 0;
        const isNew = newSince !== null && v.publishedAt > newSince;
        return (
          <li
            className={cn(
              "group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60",
              playingId === v.id && "bg-muted"
            )}
            key={v.id}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() => onPlay(i)}
              type="button"
            >
              <div className="relative w-32 shrink-0 sm:w-40">
                <Thumb duration={v.duration} live={v.live} src={v.thumbnail} />
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
                  {isNew ? (
                    <span className="mr-1.5 rounded bg-red-600 px-1.5 py-0.5 align-middle font-semibold text-[10px] text-white uppercase">
                      Novo
                    </span>
                  ) : null}
                  {v.title}
                </p>
                <p className="text-muted-foreground text-xs">
                  {new Date(v.publishedAt).toLocaleDateString("pt-BR")} ·{" "}
                  {formatDuration(v.duration)} · {shortNumber(v.views)}{" "}
                  visualizações
                  {pct >= 95 ? " · assistido" : null}
                </p>
              </div>
            </button>
            <SaveMenu compact video={v} />
          </li>
        );
      })}
    </ol>
  );
}

function ChannelPlaylist({
  id,
  progress,
  playingId,
  onPlay,
  onBack,
}: {
  id: string;
  progress: Record<string, Progress>;
  playingId: string | null;
  onPlay: PlayFn;
  onBack: () => void;
}) {
  const { data: p, loading, error } = useYt<YtPlaylist>("playlist", { id });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label="Voltar às playlists"
          onClick={onBack}
          size="icon-sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconArrowLeft" />
        </Button>
        <h3 className="min-w-0 flex-1 basis-[calc(100%-3rem)] font-medium sm:basis-auto sm:truncate">
          {p?.title ?? "Playlist"}
        </h3>
        {p ? (
          <span className="text-muted-foreground text-sm">
            {p.videos.length} vídeos · {formatLongDuration(p.totalDuration)}
          </span>
        ) : null}
        <Button
          disabled={!p?.videos.length}
          onClick={() => p && onPlay(p.videos, 0, p.title)}
          size="sm"
        >
          <Icon className="size-4" name="IconPlay" />
          Reproduzir tudo
        </Button>
      </div>
      {loading ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          Carregando playlist…
        </p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {p ? (
        <VideoRows
          newSince={null}
          onPlay={(i) => onPlay(p.videos, i, p.title)}
          playingId={playingId}
          progress={progress}
          videos={p.videos}
        />
      ) : null}
    </div>
  );
}

function ChannelHeader({
  channelId,
  channel,
  playlistCount,
}: {
  channelId: string;
  channel: YtChannel | undefined;
  playlistCount: number;
}) {
  const lib = useLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const following = lib.followed.some((c) => c.channelId === channelId);

  const toggle = async () => {
    if (!channel) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (following) {
        await unfollowChannel(channelId);
      } else {
        await followChannel({
          channelId,
          title: channel.title,
          thumbnail: channel.thumbnail,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const stats = channel
    ? `${channel.handle ? `${channel.handle} · ` : ""}${shortNumber(channel.subscribers)} inscritos · ${channel.videoCount.toLocaleString("pt-BR")} vídeos · ${playlistCount} playlists`
    : "Carregando…";
  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        {channel?.thumbnail ? (
          // biome-ignore lint/performance/noImgElement: remote YouTube avatar
          <img
            alt=""
            className="size-14 rounded-full bg-muted object-cover"
            height={56}
            src={channel.thumbnail}
            width={56}
          />
        ) : (
          <span className="size-14 rounded-full bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold text-xl tracking-tight">
            {channel?.title ?? "Canal"}
          </h2>
          <p className="text-muted-foreground text-sm">{stats}</p>
        </div>
        <Button
          disabled={busy || !channel}
          onClick={toggle}
          variant={following ? "outline" : "default"}
        >
          <Icon
            className="size-4"
            name={following ? "IconCheckmark1" : "IconPlusSmall"}
          />
          {following ? "Seguindo" : "Seguir canal"}
        </Button>
      </header>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** All uploads, 50 per page, newest first, with "Novo" since last visit. */
function UploadsTab({
  channelId,
  label,
  progress,
  playingId,
  onPlay,
  onTotal,
}: {
  channelId: string;
  label: string;
  progress: Record<string, Progress>;
  playingId: string | null;
  onPlay: PlayFn;
  onTotal: (n: number) => void;
}) {
  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // "Novo" = published after the newest video seen on the previous visit
  const newSince = useRef<string | null>(readSeen()[channelId] ?? null);

  const load = useCallback(
    async (pageToken?: string, all = false) => {
      setLoading(true);
      setError(null);
      try {
        let token = pageToken;
        do {
          const page = await ytGet<UploadsPage>("uploads", {
            channelId,
            pageToken: token ?? "",
          });
          const first = !token;
          setVideos((prev) =>
            first ? page.videos : [...prev, ...page.videos]
          );
          setTotal(page.total);
          onTotal(page.total);
          setNext(page.nextPageToken);
          if (first && page.videos[0]) {
            markSeen(channelId, page.videos[0].publishedAt);
          }
          token = page.nextPageToken ?? undefined;
        } while (all && token);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar vídeos");
      } finally {
        setLoading(false);
      }
    },
    [channelId, onTotal]
  );

  useEffect(() => {
    load();
  }, [load]);

  const needle = filter.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle
        ? videos.filter((v) => v.title.toLowerCase().includes(needle))
        : videos,
    [videos, needle]
  );
  const since = newSince.current;
  const newCount = since
    ? videos.filter((v) => v.publishedAt > since).length
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Filtrar vídeos do canal"
          className="h-9 max-w-xs"
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar pelo título…"
          type="search"
          value={filter}
        />
        <span className="text-muted-foreground text-xs">
          {videos.length} de {total.toLocaleString("pt-BR")} carregados
          {newCount > 0 ? ` · ${newCount} novos desde a última visita` : ""}
        </span>
        <Button
          className="ml-auto"
          disabled={shown.length === 0}
          onClick={() => onPlay(shown, 0, label)}
          size="sm"
        >
          <Icon className="size-4" name="IconPlay" />
          Reproduzir
        </Button>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <VideoRows
        newSince={since}
        onPlay={(i) => onPlay(shown, i, label)}
        playingId={playingId}
        progress={progress}
        videos={shown}
      />
      {loading ? (
        <p className="py-4 text-center text-muted-foreground text-sm">
          Carregando vídeos…
        </p>
      ) : null}
      {next && !loading ? (
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => load(next)} variant="outline">
            Carregar mais 50
          </Button>
          <Button onClick={() => load(next, true)} variant="ghost">
            Carregar todos
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PlaylistGrid({
  playlists,
  onOpen,
}: {
  playlists: YtPlaylistSummary[];
  onOpen: (id: string) => void;
}) {
  if (playlists.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Este canal não tem playlists públicas.
      </p>
    );
  }
  return (
    <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
      {playlists.map((p) => (
        <button
          className="group flex flex-col gap-2 text-left"
          key={p.id}
          onClick={() => onOpen(p.id)}
          type="button"
        >
          <div className="relative">
            <Thumb duration={0} src={p.thumbnail} />
            <span className="absolute inset-y-0 right-0 flex w-2/5 flex-col items-center justify-center gap-1 rounded-r-xl bg-black/70 text-white">
              <Icon className="size-5" name="IconPlaylist" />
              <span className="font-medium text-sm">{p.itemCount}</span>
              <span className="text-[11px]">vídeos</span>
            </span>
          </div>
          <h3 className="line-clamp-2 font-medium text-sm group-hover:underline">
            {p.title}
          </h3>
          <p className="text-muted-foreground text-xs">
            {relativeDate(p.publishedAt)}
          </p>
        </button>
      ))}
    </div>
  );
}

export function ChannelPanel({
  channelId,
  progress,
  playingId,
  onPlay,
}: {
  channelId: string;
  progress: Record<string, Progress>;
  playingId: string | null;
  onPlay: PlayFn;
}) {
  const { data } = useYt<{
    channel: YtChannel;
    playlists: YtPlaylistSummary[];
  }>("channel", { id: channelId });
  const [tab, setTab] = useState<"videos" | "playlists">("videos");
  const [openPlaylist, setOpenPlaylist] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const channel = data?.channel;
  const playlists = data?.playlists ?? [];
  const videoCount = total || channel?.videoCount || 0;
  const tabs = [
    ["videos", `Vídeos (${videoCount.toLocaleString("pt-BR")})`],
    ["playlists", `Playlists (${playlists.length})`],
  ] as const;

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <ChannelHeader
        channel={channel}
        channelId={channelId}
        playlistCount={playlists.length}
      />
      <fieldset className="flex w-fit gap-1 rounded-lg border p-1">
        <legend className="sr-only">Seção do canal</legend>
        {tabs.map(([id, label]) => (
          <button
            aria-pressed={tab === id}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              tab === id
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={id}
            onClick={() => {
              setTab(id);
              setOpenPlaylist(null);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </fieldset>
      {tab === "videos" ? (
        <UploadsTab
          channelId={channelId}
          label={channel?.title ?? "Canal"}
          onPlay={onPlay}
          onTotal={setTotal}
          playingId={playingId}
          progress={progress}
        />
      ) : null}
      {tab === "playlists" && openPlaylist ? (
        <ChannelPlaylist
          id={openPlaylist}
          onBack={() => setOpenPlaylist(null)}
          onPlay={onPlay}
          playingId={playingId}
          progress={progress}
        />
      ) : null}
      {tab === "playlists" && !openPlaylist ? (
        <PlaylistGrid onOpen={setOpenPlaylist} playlists={playlists} />
      ) : null}
    </section>
  );
}
