"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { YtPlaylistSummary, YtVideo } from "@/lib/youtube-types";
import { shortNumber, useYt } from "./use-youtube";
import { GridSkeleton, Thumb, VideoCard } from "./video-card";

interface Library {
  channel: {
    id: string;
    title: string;
    handle: string | null;
    thumbnail: string;
    subscribers: number | null;
    videoCount: number;
  } | null;
  playlists: YtPlaylistSummary[];
  subscriptions: { channelId: string; title: string; thumbnail: string }[];
  liked: YtVideo[];
}

type Tab = "playlists" | "subscriptions" | "liked";

/** The signed-in user's YouTube: channel, playlists, subscriptions, likes. */
export function LibraryView({
  onVideo,
  onChannel,
  onPlaylist,
}: {
  onVideo: (id: string) => void;
  onChannel: (id: string) => void;
  onPlaylist: (id: string) => void;
}) {
  const { data, loading, error } = useYt<Library>("me", {});
  const [tab, setTab] = useState<Tab>("playlists");

  if (loading) {
    return <GridSkeleton />;
  }
  if (error || !data) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        {error ?? "Não foi possível abrir a sua conta do YouTube."}
      </p>
    );
  }
  const tabs: [Tab, string][] = [
    ["playlists", `Minhas playlists (${data.playlists.length})`],
    ["subscriptions", `Inscrições (${data.subscriptions.length})`],
    ["liked", `Curtidos (${data.liked.length})`],
  ];
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted">
          <Icon className="size-6" name="IconYoutube" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-xl tracking-tight">Minha conta</h2>
          <p className="text-muted-foreground text-sm">
            {data.channel
              ? `${data.channel.title}${data.channel.handle ? ` · ${data.channel.handle}` : ""} · ${shortNumber(data.channel.subscribers)} inscritos · ${data.channel.videoCount} vídeos`
              : "Sua conta não tem canal próprio — playlists, inscrições e curtidos continuam disponíveis."}
          </p>
        </div>
        {data.channel ? (
          <button
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => onChannel(data.channel?.id ?? "")}
            type="button"
          >
            Ver meu canal
          </button>
        ) : null}
      </header>

      <fieldset className="flex w-fit flex-wrap gap-1 rounded-lg border p-1">
        <legend className="sr-only">Seção da conta</legend>
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
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </fieldset>

      {tab === "playlists" ? (
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {data.playlists.map((p) => (
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
            </button>
          ))}
          {data.playlists.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma playlist.</p>
          ) : null}
        </div>
      ) : null}

      {tab === "subscriptions" ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.subscriptions.map((s) => (
            <li key={s.channelId}>
              <button
                className="flex w-full items-center gap-3 rounded-xl border bg-card/60 p-2.5 text-left hover:bg-muted/60"
                onClick={() => onChannel(s.channelId)}
                type="button"
              >
                {s.thumbnail ? (
                  // biome-ignore lint/performance/noImgElement: remote YouTube avatar
                  <img
                    alt=""
                    className="size-10 rounded-full bg-muted object-cover"
                    height={40}
                    loading="lazy"
                    src={s.thumbnail}
                    width={40}
                  />
                ) : null}
                <span className="min-w-0 truncate font-medium text-sm">
                  {s.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "liked" ? (
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {data.liked.map((v) => (
            <VideoCard
              key={v.id}
              onChannel={() => onChannel(v.channelId)}
              onOpen={() => onVideo(v.id)}
              video={v}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
