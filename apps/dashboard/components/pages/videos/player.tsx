"use client";

import { useEffect, useRef } from "react";
import type { YtVideo } from "@/lib/youtube-types";
import { readProgress, saveProgress } from "./library-store";

/**
 * In-app player on the YouTube IFrame API: resumes where you stopped,
 * remembers progress in this browser and reports when a video ends.
 * https://developers.google.com/youtube/iframe_api_reference
 */

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) {
          resolve(window.YT);
        }
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.append(script);
    });
  }
  return apiPromise;
}

/** Where to resume: stored progress unless the video was (almost) finished. */
export function resumeAt(id: string) {
  const p = readProgress()[id];
  return p && p.d > 0 && p.t / p.d < 0.95 ? Math.floor(p.t) : 0;
}

export function Player({
  video,
  autoplay,
  seek,
  onEnded,
}: {
  video: YtVideo;
  autoplay: boolean;
  /** Changes to { t } jump the player to that second. */
  seek?: { t: number; n: number };
  onEnded?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const ready = useRef(false);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  const current = useRef(video);
  current.current = video;

  // Create the player once
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const record = () => {
      const p = player.current;
      if (!(p && ready.current)) {
        return;
      }
      const t = p.getCurrentTime();
      const d = p.getDuration() || current.current.duration;
      if (t > 1) {
        saveProgress(current.current.id, {
          t,
          d,
          at: Date.now(),
          video: current.current,
        });
      }
    };
    loadApi().then((YT) => {
      if (cancelled || !host.current) {
        return;
      }
      const mount = document.createElement("div");
      host.current.append(mount);
      player.current = new YT.Player(mount, {
        host: "https://www.youtube-nocookie.com",
        videoId: current.current.id,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          start: resumeAt(current.current.id),
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            ready.current = true;
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PAUSED) {
              record();
            }
            if (e.data === YT.PlayerState.ENDED) {
              const d =
                player.current?.getDuration() ?? current.current.duration;
              saveProgress(current.current.id, {
                t: d,
                d,
                at: Date.now(),
                video: current.current,
              });
              ended.current?.();
            }
          },
        },
      });
      timer = setInterval(record, 5000);
    });
    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
      record();
      player.current?.destroy();
      player.current = null;
      ready.current = false;
    };
    // The player is created once; video changes are handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch videos without recreating the iframe
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const p = player.current;
    if (!(p && ready.current)) {
      return;
    }
    const opts = { videoId: video.id, startSeconds: resumeAt(video.id) };
    if (autoplay) {
      p.loadVideoById(opts);
    } else {
      p.cueVideoById(opts);
    }
  }, [video.id, autoplay]);

  useEffect(() => {
    if (seek && player.current && ready.current) {
      player.current.loadVideoById({
        videoId: current.current.id,
        startSeconds: seek.t,
      });
    }
  }, [seek]);

  return (
    <div
      className="aspect-video w-full overflow-hidden rounded-2xl bg-black [&_iframe]:size-full"
      ref={host}
    />
  );
}
