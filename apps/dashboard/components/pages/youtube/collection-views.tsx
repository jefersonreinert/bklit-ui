"use client";

import { Icon } from "@bklitui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatLongDuration,
  type YtChannel,
  type YtPlaylist,
  type YtPlaylistSummary,
  type YtVideo,
} from "@/lib/youtube-types";
import { shortNumber, useYt } from "./use-youtube";
import { GridSkeleton, Thumb, VideoCard, VideoRow } from "./video-card";

interface ChannelResponse {
  channel: YtChannel;
  playlists: YtPlaylistSummary[];
  recent: YtVideo[];
}

export function ChannelView({
  target,
  onVideo,
  onPlaylist,
}: {
  target: { id?: string; handle?: string };
  onVideo: (id: string) => void;
  onPlaylist: (id: string) => void;
}) {
  const params: Record<string, string> = target.id
    ? { id: target.id }
    : { handle: target.handle ?? "" };
  const { data, loading, error } = useYt<ChannelResponse>("channel", params);
  const [tab, setTab] = useState<"videos" | "playlists">("videos");

  if (loading) {
    return <GridSkeleton />;
  }
  if (error || !data) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        {error ?? "Canal não encontrado."}
      </p>
    );
  }
  const { channel, playlists, recent } = data;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-4">
        {channel.thumbnail ? (
          // biome-ignore lint/performance/noImgElement: remote YouTube avatar
          <img
            alt=""
            className="size-16 rounded-full bg-muted object-cover md:size-20"
            height={80}
            src={channel.thumbnail}
            width={80}
          />
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-xl tracking-tight">
            {channel.title}
          </h2>
          <p className="text-muted-foreground text-sm">
            {channel.handle ? `${channel.handle} · ` : ""}
            {shortNumber(channel.subscribers)} inscritos ·{" "}
            {channel.videoCount.toLocaleString("pt-BR")} vídeos ·{" "}
            {shortNumber(channel.viewCount)} visualizações
          </p>
          {channel.description ? (
            <p className="mt-1 line-clamp-2 max-w-2xl text-muted-foreground text-sm">
              {channel.description}
            </p>
          ) : null}
        </div>
      </header>

      <fieldset className="flex w-fit gap-1 rounded-lg border p-1">
        <legend className="sr-only">Seção do canal</legend>
        {(
          [
            ["videos", "Vídeos recentes"],
            ["playlists", `Playlists (${playlists.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-pressed={tab === id}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              tab === id
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </fieldset>

      {tab === "videos" ? (
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {recent.map((v) => (
            <VideoCard key={v.id} onOpen={() => onVideo(v.id)} video={v} />
          ))}
        </div>
      ) : (
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {playlists.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Este canal não tem playlists públicas.
            </p>
          ) : null}
          {playlists.map((p) => (
            <button
              className="group flex flex-col gap-2 text-left"
              key={p.id}
              onClick={() => onPlaylist(p.id)}
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
                Ver vídeos e duração total
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlaylistView({
  id,
  onVideo,
  onChannel,
}: {
  id: string;
  onVideo: (id: string) => void;
  onChannel: (channelId: string) => void;
}) {
  const { data: p, loading, error } = useYt<YtPlaylist>("playlist", { id });
  if (loading) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        Carregando playlist e somando as durações…
      </p>
    );
  }
  if (error || !p) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        {error ?? "Playlist não encontrada."}
      </p>
    );
  }
  const longest = [...p.videos].sort((a, b) => b.duration - a.duration)[0];
  const average = p.videos.length ? p.totalDuration / p.videos.length : 0;
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <Thumb duration={0} src={p.thumbnail} />
        <h2 className="font-semibold text-lg leading-snug tracking-tight">
          {p.title}
        </h2>
        <button
          className="w-fit text-muted-foreground text-sm hover:text-foreground"
          onClick={() => onChannel(p.channelId)}
          type="button"
        >
          {p.channelTitle}
        </button>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["vídeos", p.itemCount.toLocaleString("pt-BR")],
            ["duração total", formatLongDuration(p.totalDuration)],
            ["média por vídeo", formatLongDuration(average)],
            [
              "mais longo",
              longest ? formatLongDuration(longest.duration) : "—",
            ],
          ].map(([label, value]) => (
            <div className="rounded-xl border bg-card/60 px-3 py-2" key={label}>
              <p className="font-medium text-sm tabular-nums">{value}</p>
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {p.truncated ? (
          <p className="text-muted-foreground text-xs">
            Somando os {p.videos.length} primeiros vídeos da playlist.
          </p>
        ) : null}
        {p.description ? (
          <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground text-sm">
            {p.description}
          </p>
        ) : null}
        <Button
          nativeButton={false}
          render={
            <a
              href={`https://www.youtube.com/playlist?list=${p.id}`}
              rel="noopener noreferrer"
              target="_blank"
            />
          }
          variant="outline"
        >
          <Icon className="size-4" name="IconArrowUpRight" />
          Abrir no YouTube
        </Button>
      </aside>
      <ol className="flex flex-col gap-1">
        {p.videos.map((v, i) => (
          <li key={`${v.id}-${i}`}>
            <VideoRow index={i} onOpen={() => onVideo(v.id)} video={v} />
          </li>
        ))}
      </ol>
    </div>
  );
}
