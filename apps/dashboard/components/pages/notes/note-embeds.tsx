"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AiChart } from "@/components/pages/ai/ai-chart";
import { Icon } from "@/lib/icons";
import { fileMeta, fileUrl } from "@/lib/notes/db";

const YOUTUBE =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg)(\?|$)/i;
const PDF_EXT = /\.pdf(\?|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i;

export type MediaKind =
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
  return src.startsWith("att:") ? "file" : "image";
}

/** att:<id> → object URL from IndexedDB; other URLs pass through. */
function useResolved(src: string) {
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

export function MediaEmbed({ src, alt }: { src: string; alt: string }) {
  const { url, meta, missing } = useResolved(src);
  const kind = kindOf(src, meta?.type);
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
