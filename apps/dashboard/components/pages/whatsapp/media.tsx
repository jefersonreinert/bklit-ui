"use client";

import { Icon } from "@bklitui/icons";
import { cn } from "@/lib/utils";
import type { WaMessage } from "@/lib/whatsapp-types";

/** Photos, videos, audio, stickers and documents inside a chat bubble. */

const sizeLabel = (bytes: number | null) => {
  if (!bytes) {
    return "";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
};

const duration = (s: number | null) =>
  s
    ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`
    : "";

const thumbUrl = (m: WaMessage) =>
  m.media?.thumb ? `data:image/jpeg;base64,${m.media.thumb}` : undefined;

function DocumentCard({ m }: { m: WaMessage }) {
  const name = m.media?.filename || "Documento";
  const ext = name.includes(".") ? name.split(".").pop()?.toUpperCase() : "";
  return (
    <a
      className="flex min-w-48 items-center gap-3 rounded-xl bg-black/5 p-2.5 transition-colors hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
      download={name}
      href={m.mediaUrl ?? undefined}
      rel="noopener"
      target="_blank"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-(--chat-accent) font-semibold text-(--chat-accent-foreground) text-[10px]">
        {ext?.slice(0, 4) || <Icon className="size-4" name="IconFileText" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">{name}</span>
        <span className="block text-xs opacity-70">
          {[sizeLabel(m.media?.size ?? null), "Toque para abrir"]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <Icon className="size-4 shrink-0 opacity-70" name="IconArrowDown" />
    </a>
  );
}

function ImageMedia({ m, poster }: { m: WaMessage; poster?: string }) {
  return (
    <a
      className="block overflow-hidden rounded-xl"
      href={m.mediaUrl ?? undefined}
      rel="noopener"
      target="_blank"
    >
      {/* biome-ignore lint/performance/noImgElement: signed bridge URL */}
      <img
        alt={m.body || "Foto"}
        className={cn(
          "block h-auto bg-center bg-cover",
          m.type === "sticker"
            ? "size-32 object-contain"
            : "max-h-80 w-64 object-cover"
        )}
        decoding="async"
        height={m.type === "sticker" ? 128 : 320}
        loading="lazy"
        src={m.mediaUrl ?? undefined}
        style={poster ? { backgroundImage: `url(${poster})` } : undefined}
        width={m.type === "sticker" ? 128 : 256}
      />
    </a>
  );
}

function AudioMedia({ m }: { m: WaMessage }) {
  return (
    <div className="flex flex-col gap-1">
      {/* biome-ignore lint/a11y/useMediaCaption: voice notes have no captions */}
      <audio
        className="h-10 w-60 max-w-full"
        controls
        preload="none"
        src={m.mediaUrl ?? undefined}
      />
      {m.media?.duration ? (
        <span className="text-[11px] opacity-70">
          {m.type === "ptt" ? "Áudio" : "Música"} · {duration(m.media.duration)}
        </span>
      ) : null}
    </div>
  );
}

const UNAVAILABLE: Record<string, string> = {
  expired: "Arquivo expirado no WhatsApp",
  failed: "Não foi possível baixar o arquivo",
};

export function MessageMedia({ m }: { m: WaMessage }) {
  if (!(m.hasMedia && m.mediaUrl)) {
    return null;
  }
  const unavailable = m.mediaStatus ? UNAVAILABLE[m.mediaStatus] : undefined;
  if (unavailable) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs opacity-80 dark:bg-white/5">
        <Icon className="size-4" name="IconCircleInfo" />
        {unavailable}
        {m.media?.filename ? ` · ${m.media.filename}` : ""}
      </p>
    );
  }
  const poster = thumbUrl(m);
  if (m.type === "image" || m.type === "sticker") {
    return <ImageMedia m={m} poster={poster} />;
  }
  if (m.type === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: user videos have no captions
      <video
        className="block max-h-80 w-64 rounded-xl bg-black"
        controls
        playsInline
        poster={poster}
        preload="none"
        src={m.mediaUrl ?? undefined}
      />
    );
  }
  if (m.type === "audio" || m.type === "ptt") {
    return <AudioMedia m={m} />;
  }
  return <DocumentCard m={m} />;
}
