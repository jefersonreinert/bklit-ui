"use client";

import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatDuration, type YtVideo } from "@/lib/youtube-types";
import { relativeDate, shortNumber } from "./use-youtube";

export function Thumb({
  src,
  duration,
  live,
  className,
}: {
  src: string;
  duration: number;
  live?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden rounded-xl bg-muted",
        className
      )}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: remote YouTube thumbnails, images are unoptimized in this app
        <img
          alt=""
          className="size-full object-cover"
          height={180}
          loading="lazy"
          src={src}
          width={320}
        />
      ) : null}
      {live || duration > 0 ? (
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5 font-medium text-[11px] text-white tabular-nums">
          {live ? "AO VIVO" : formatDuration(duration)}
        </span>
      ) : null}
    </div>
  );
}

export function VideoCard({
  video,
  onOpen,
  onChannel,
}: {
  video: YtVideo;
  onOpen: () => void;
  onChannel?: () => void;
}) {
  return (
    <article className="group flex flex-col gap-2">
      <button className="text-left" onClick={onOpen} type="button">
        <Thumb
          className="transition-opacity group-hover:opacity-90"
          duration={video.duration}
          live={video.live}
          src={video.thumbnail}
        />
        <h3 className="mt-2 line-clamp-2 font-medium text-sm leading-snug">
          {video.title}
        </h3>
      </button>
      <div className="flex flex-col text-muted-foreground text-xs">
        {onChannel ? (
          <button
            className="w-fit truncate hover:text-foreground"
            onClick={onChannel}
            type="button"
          >
            {video.channelTitle}
          </button>
        ) : (
          <span className="truncate">{video.channelTitle}</span>
        )}
        <span>
          {shortNumber(video.views)} visualizações ·{" "}
          {relativeDate(video.publishedAt)}
        </span>
      </div>
    </article>
  );
}

export function VideoRow({
  video,
  index,
  onOpen,
}: {
  video: YtVideo;
  index?: number;
  onOpen: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted/60"
      onClick={onOpen}
      type="button"
    >
      {index === undefined ? null : (
        <span className="w-6 shrink-0 text-center text-muted-foreground text-xs tabular-nums">
          {index + 1}
        </span>
      )}
      <Thumb
        className="w-32 shrink-0 sm:w-40"
        duration={video.duration}
        live={video.live}
        src={video.thumbnail}
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium text-sm">{video.title}</p>
        <p className="mt-0.5 truncate text-muted-foreground text-xs">
          {video.channelTitle} · {shortNumber(video.views)} visualizações
        </p>
        <p className="flex items-center gap-1 text-muted-foreground text-xs">
          <Icon className="size-3" name="IconClock" />
          {formatDuration(video.duration)} · {relativeDate(video.publishedAt)}
        </p>
      </div>
    </button>
  );
}

export function GridSkeleton() {
  return (
    <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div className="flex flex-col gap-2" key={i}>
          <div className="aspect-video animate-pulse rounded-xl bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
