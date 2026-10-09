"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AiChart } from "@/components/pages/ai/ai-chart";
import { NEVER_EMBED } from "@/lib/browser/embed";
import { Icon } from "@/lib/icons";
import { fileMeta, fileUrl } from "@/lib/notes/db";

const YOUTUBE =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg)(\?|$)/i;
const PDF_EXT = /\.pdf(\?|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i;
const HTTP = /^https?:\/\//i;
const IMAGE_HOSTS =
  /(^|\.)(images\.unsplash\.com|i\.imgur\.com|pbs\.twimg\.com|i\.pinimg\.com|lh\d\.googleusercontent\.com)$/i;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/;
const SPOTIFY =
  /open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/;
const LOOM = /loom\.com\/(?:share|embed)\/(\w+)/;
const DRIVE_FILE = /drive\.google\.com\/file\/d\/([\w-]+)/;
const GOOGLE_DOC =
  /(docs\.google\.com\/(?:document|spreadsheets|presentation|forms)\/d\/[\w-]+)/;
const FIGMA = /figma\.com\/(file|design|proto|board)\//;
const SOUNDCLOUD = /soundcloud\.com\//;
const WWW = /^www\./;

interface Provider {
  src: string;
  /** CSS aspect ratio, or a fixed height for players. */
  height: string;
  name: string;
}

/** Sites that offer an embeddable player for a normal link. */
export function providerEmbed(url: string): Provider | null {
  const vimeo = VIMEO.exec(url);
  if (vimeo) {
    return {
      src: `https://player.vimeo.com/video/${vimeo[1]}`,
      height: "aspect-video",
      name: "Vimeo",
    };
  }
  const spotify = SPOTIFY.exec(url);
  if (spotify) {
    const tall = spotify[1] === "track" || spotify[1] === "episode";
    return {
      src: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`,
      height: tall ? "h-[152px]" : "h-[380px]",
      name: "Spotify",
    };
  }
  const loom = LOOM.exec(url);
  if (loom) {
    return {
      src: `https://www.loom.com/embed/${loom[1]}`,
      height: "aspect-video",
      name: "Loom",
    };
  }
  const drive = DRIVE_FILE.exec(url);
  if (drive) {
    return {
      src: `https://drive.google.com/file/d/${drive[1]}/preview`,
      height: "h-[70vh]",
      name: "Google Drive",
    };
  }
  const doc = GOOGLE_DOC.exec(url);
  if (doc) {
    return {
      src: `https://${doc[1]}/preview`,
      height: "h-[70vh]",
      name: "Google Docs",
    };
  }
  if (FIGMA.test(url)) {
    return {
      src: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`,
      height: "h-[60vh]",
      name: "Figma",
    };
  }
  if (SOUNDCLOUD.test(url)) {
    return {
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`,
      height: "h-[166px]",
      name: "SoundCloud",
    };
  }
  return null;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(WWW, "");
  } catch {
    return url;
  }
};

export type MediaKind =
  | "web"
  | "provider"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "youtube"
  | "file";

function kindOf(src: string, type: string | undefined): MediaKind {
  if (YOUTUBE.test(src)) {
    return "youtube";
  }
  const t = type ?? "";
  if (t.startsWith("image/") || IMAGE_EXT.test(src)) {
    return "image";
  }
  if (t.startsWith("video/") || VIDEO_EXT.test(src)) {
    return "video";
  }
  if (t.startsWith("audio/") || AUDIO_EXT.test(src)) {
    return "audio";
  }
  if (t === "application/pdf" || PDF_EXT.test(src)) {
    return "pdf";
  }
  if (src.startsWith("att:")) {
    return "file";
  }
  if (providerEmbed(src)) {
    return "provider";
  }
  return HTTP.test(src) && !IMAGE_HOSTS.test(hostOf(src)) ? "web" : "image";
}

/** att:<id> → object URL from IndexedDB; other URLs pass through. */
export function useResolved(src: string) {
  const isAtt = src.startsWith("att:");
  const [url, setUrl] = useState<string | null>(isAtt ? null : src);
  useEffect(() => {
    if (!isAtt) {
      setUrl(src);
      return;
    }
    let alive = true;
    fileUrl(src.slice(4)).then((u) => {
      if (alive) {
        setUrl(u);
      }
    });
    return () => {
      alive = false;
    };
  }, [src, isAtt]);
  const meta = isAtt ? fileMeta(src.slice(4)) : undefined;
  return { url, meta, missing: isAtt && url === null && !meta };
}

const formatSize = (bytes: number) =>
  bytes > 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function FileChip({
  name,
  url,
  size,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  return (
    <a
      className="my-2 flex w-fit max-w-full items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm no-underline transition-colors hover:bg-muted"
      download={name}
      href={url ?? undefined}
    >
      <Icon className="size-5 shrink-0" name="IconFileText" />
      <span className="min-w-0 truncate">{name}</span>
      {size ? (
        <span className="shrink-0 text-muted-foreground text-xs">
          {formatSize(size)}
        </span>
      ) : null}
      <Icon
        className="size-4 shrink-0 text-muted-foreground"
        name="IconArrowDown"
      />
    </a>
  );
}

/** Any web page: a card with the site, and a live preview when allowed. */
function WebEmbed({ url, alt }: { url: string; alt: string }) {
  const host = hostOf(url);
  const blocked = NEVER_EMBED.test(host);
  const [preview, setPreview] = useState(!blocked);
  return (
    <span className="my-3 block overflow-hidden rounded-2xl border bg-card">
      <span className="flex items-center gap-3 px-3 py-2.5">
        {/* biome-ignore lint/performance/noImgElement: remote favicon */}
        <img
          alt=""
          className="size-5 shrink-0 rounded"
          height={20}
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          width={20}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">
            {alt && alt !== url ? alt : host}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {url}
          </span>
        </span>
        {blocked ? null : (
          <button
            className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs"
            onClick={() => setPreview((v) => !v)}
            type="button"
          >
            {preview ? "Ocultar" : "Prévia"}
          </button>
        )}
        <a
          className="shrink-0 rounded-full bg-foreground px-2.5 py-1 text-background text-xs no-underline"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Abrir
        </a>
      </span>
      {preview ? (
        <iframe
          className="block h-[60vh] w-full border-t bg-white"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          src={url}
          title={alt || host}
        />
      ) : null}
    </span>
  );
}

function ProviderEmbed({ url, alt }: { url: string; alt: string }) {
  const p = providerEmbed(url);
  if (!p) {
    return null;
  }
  return (
    <iframe
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      className={`my-3 block w-full rounded-2xl border ${p.height}`}
      src={p.src}
      title={alt || p.name}
    />
  );
}

export function MediaEmbed({ src, alt }: { src: string; alt: string }) {
  const { url, meta, missing } = useResolved(src);
  const kind = kindOf(src, meta?.type);
  if (kind === "web") {
    return <WebEmbed alt={alt} url={src} />;
  }
  if (kind === "provider") {
    return <ProviderEmbed alt={alt} url={src} />;
  }
  const name = meta?.name ?? (alt || src.split("/").pop() || "arquivo");
  if (missing) {
    return (
      <span className="my-2 block rounded-xl border border-dashed p-3 text-muted-foreground text-xs">
        Anexo não encontrado neste aparelho ({alt || src})
      </span>
    );
  }
  if (kind === "youtube") {
    const id = YOUTUBE.exec(src)?.[1];
    return (
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="my-3 aspect-video w-full rounded-2xl border"
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={alt || "Vídeo do YouTube"}
      />
    );
  }
  if (!url) {
    return (
      <span className="my-2 block h-40 animate-pulse rounded-2xl bg-muted" />
    );
  }
  if (kind === "image") {
    return (
      // biome-ignore lint/performance/noImgElement: user attachments (blob/data URLs)
      <img
        alt={alt}
        className="my-3 max-h-[70vh] w-auto max-w-full rounded-2xl border"
        height={480}
        loading="lazy"
        src={url}
        width={720}
      />
    );
  }
  if (kind === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: user-uploaded videos have no caption track
      <video
        className="my-3 max-h-[70vh] w-full rounded-2xl border bg-black"
        controls
        playsInline
        src={url}
      />
    );
  }
  if (kind === "audio") {
    // biome-ignore lint/a11y/useMediaCaption: user-uploaded audio has no caption track
    return <audio className="my-3 w-full" controls src={url} />;
  }
  if (kind === "pdf") {
    return (
      <span className="my-3 block overflow-hidden rounded-2xl border">
        <iframe className="h-[70vh] w-full bg-white" src={url} title={name} />
        <FileChip name={name} size={meta?.size} url={url} />
      </span>
    );
  }
  return <FileChip name={name} size={meta?.size} url={url} />;
}

/** Animated chart from a ```chart block, with an expanded full-screen view. */
export function ChartEmbed({ source }: { source: string }) {
  const [expanded, setExpanded] = useState(false);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <div className="group relative my-3">
      <div className="absolute top-3 right-3 z-10 flex gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        <button
          aria-label="Reproduzir animação"
          className="flex size-8 items-center justify-center rounded-full bg-background/80 backdrop-blur"
          onClick={() => setReplay((r) => r + 1)}
          type="button"
        >
          <Icon className="size-4" name="IconRotate" />
        </button>
        <button
          aria-label="Expandir gráfico"
          className="flex size-8 items-center justify-center rounded-full bg-background/80 backdrop-blur"
          onClick={() => setExpanded(true)}
          type="button"
        >
          <Icon className="size-4" name="IconArrowsAllSides" />
        </button>
      </div>
      <AiChart complete key={replay} source={source} />
      {expanded
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-md md:p-10"
              role="dialog"
            >
              <button
                aria-label="Fechar"
                className="absolute inset-0 cursor-default"
                onClick={() => setExpanded(false)}
                type="button"
              />
              <div className="fade-in zoom-in-95 relative w-full max-w-6xl animate-in duration-300">
                <button
                  aria-label="Fechar gráfico"
                  className="absolute -top-3 -right-3 z-10 flex size-9 items-center justify-center rounded-full bg-foreground text-background shadow-lg"
                  onClick={() => setExpanded(false)}
                  type="button"
                >
                  <Icon className="size-4" name="IconCrossSmall" />
                </button>
                <AiChart complete source={source} />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
