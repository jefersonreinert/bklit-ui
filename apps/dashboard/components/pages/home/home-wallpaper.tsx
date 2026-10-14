"use client";

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { setDim, setWallpaper, useHome, type Wallpaper } from "@/lib/home";
import { Icon } from "@/lib/icons";
import { convexClient, useSyncStatus } from "@/lib/sync/convex-client";
import { cn } from "@/lib/utils";

/** Videos bigger than this are refused (they would load slowly). */
const MAX_VIDEO_MB = 150;
const MAX_IMAGE_MB = 30;

const AURORA = [
  "radial-gradient(60% 50% at 18% 22%, rgb(217 119 87 / 0.55), transparent 62%)",
  "radial-gradient(48% 42% at 82% 28%, rgb(106 155 204 / 0.32), transparent 60%)",
  "radial-gradient(55% 50% at 62% 88%, rgb(212 162 127 / 0.42), transparent 62%)",
  "radial-gradient(40% 40% at 8% 90%, rgb(120 140 93 / 0.3), transparent 60%)",
].join(", ");

/** Default wallpaper: a slow glow in the brand colors. */
export function Aurora({ className }: { className?: string }) {
  const still = useReducedMotion();
  return (
    <motion.div
      animate={
        still ? undefined : { backgroundPosition: ["0% 0%", "100% 100%"] }
      }
      className={cn("bg-[#141413]", className)}
      style={{ backgroundImage: AURORA, backgroundSize: "160% 160%" }}
      transition={{
        duration: 28,
        ease: "easeInOut",
        repeat: Number.POSITIVE_INFINITY,
        repeatType: "reverse",
      }}
    />
  );
}

/** The wallpaper behind the home screen: photo, video or the default glow. */
export function WallpaperLayer() {
  const { wallpaper, dim } = useHome();
  // The file whose pixels are on screen (fades in once loaded)
  const [shown, setShown] = useState<string | null>(null);
  const ready = Boolean(wallpaper && shown === wallpaper.url);
  const loaded = () => setShown(wallpaper?.url ?? null);

  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden">
      <Aurora className="absolute inset-0" />
      {wallpaper?.kind === "video" ? (
        <video
          autoPlay
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-1000",
            ready ? "opacity-100" : "opacity-0"
          )}
          key={wallpaper.url}
          loop
          muted
          onCanPlay={loaded}
          playsInline
          src={wallpaper.url}
        />
      ) : null}
      {wallpaper?.kind === "image" ? (
        // biome-ignore lint/performance/noImgElement: user-uploaded file from Convex storage
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad only fades the photo in
        <img
          alt=""
          className={cn(
            "absolute inset-0 size-full scale-105 object-cover transition-[opacity,transform] duration-1000",
            ready ? "scale-100 opacity-100" : "opacity-0"
          )}
          height={1080}
          key={wallpaper.url}
          onLoad={loaded}
          src={wallpaper.url}
          width={1920}
        />
      ) : null}
      <div
        className="absolute inset-0 bg-black transition-opacity"
        style={{ opacity: wallpaper ? dim : 0 }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/40 to-transparent" />
    </div>
  );
}

/** Uploads with progress (fetch has no upload progress). */
function upload(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const { storageId } = JSON.parse(xhr.responseText) as {
          storageId: string;
        };
        if (xhr.status < 300 && storageId) {
          resolve(storageId);
          return;
        }
      } catch {
        // fall through
      }
      reject(new Error("O envio falhou."));
    };
    xhr.onerror = () => reject(new Error("Sem conexão."));
    xhr.send(file);
  });
}

async function saveWallpaper(
  file: File,
  onProgress: (pct: number) => void
): Promise<Wallpaper> {
  const client = convexClient();
  if (!client) {
    throw new Error("O banco de dados não está configurado.");
  }
  const kind = file.type.startsWith("video/") ? "video" : "image";
  const limit = kind === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (file.size > limit * 1024 * 1024) {
    throw new Error(
      `Arquivo grande demais (máximo ${limit} MB para ${kind === "video" ? "vídeo" : "foto"}).`
    );
  }
  const uploadUrl = await client.mutation(api.home.generateUploadUrl, {});
  const storageId = await upload(uploadUrl, file, onProgress);
  const saved = await client.mutation(api.home.setWallpaper, {
    storageId: storageId as Id<"_storage">,
    kind,
  });
  if (!saved.ok) {
    throw new Error(saved.error);
  }
  return { url: saved.url, storageId: saved.storageId, kind: saved.kind };
}

function Preview({ wallpaper }: { wallpaper: Wallpaper | null }) {
  if (!wallpaper) {
    return (
      <div className="relative size-full">
        <Aurora className="absolute inset-0" />
        <span className="absolute bottom-3 left-3 text-white/80 text-xs">
          Padrão
        </span>
      </div>
    );
  }
  return wallpaper.kind === "video" ? (
    <video
      autoPlay
      className="size-full object-cover"
      loop
      muted
      playsInline
      src={wallpaper.url}
    />
  ) : (
    // biome-ignore lint/performance/noImgElement: user-uploaded file
    <img
      alt=""
      className="size-full object-cover"
      height={500}
      src={wallpaper.url}
      width={800}
    />
  );
}

/** Choose a photo or video, darken it, or go back to the default. */
export function WallpaperPanel() {
  const { wallpaper, dim } = useHome();
  const sync = useSyncStatus();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setError(null);
    setProgress(0);
    try {
      setWallpaper(await saveWallpaper(file, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setProgress(null);
      if (input.current) {
        input.current.value = "";
      }
    }
  };

  const reset = async () => {
    setWallpaper(null);
    await convexClient()
      ?.mutation(api.home.removeWallpaper, {})
      .catch(() => null);
  };

  let action: ReactNode = (
    <>
      <Icon className="size-4" name="IconCloudUpload" />
      Escolher foto ou vídeo
    </>
  );
  if (progress !== null) {
    action = (
      <>
        <Spinner />
        Enviando… {progress}%
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl ring-1 ring-white/15">
        <Preview wallpaper={wallpaper} />
        <div
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: wallpaper ? dim : 0 }}
        />
        {wallpaper ? (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-white text-xs backdrop-blur">
            <Icon
              className="size-3.5"
              name={wallpaper.kind === "video" ? "IconVideo" : "IconImages1"}
            />
            {wallpaper.kind === "video" ? "Vídeo" : "Foto"}
          </span>
        ) : null}
      </div>

      <input
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
        ref={input}
        type="file"
      />
      <button
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white font-medium text-black text-sm transition active:scale-[0.98] disabled:opacity-60"
        disabled={progress !== null || sync === "off"}
        onClick={() => input.current?.click()}
        type="button"
      >
        {action}
      </button>
      {progress === null ? null : (
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-white transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <p className="text-white/50 text-xs">
        Foto até {MAX_IMAGE_MB} MB ou vídeo até {MAX_VIDEO_MB} MB. O vídeo toca
        sem som e em loop. Fica salvo para todos os seus aparelhos.
      </p>
      {error ? <p className="text-rose-300 text-sm">{error}</p> : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span>Escurecer</span>
          <span className="text-white/60 tabular-nums">
            {Math.round(dim * 100)}%
          </span>
        </div>
        <input
          aria-label="Escurecer o papel de parede"
          className="w-full accent-white"
          max={80}
          min={0}
          onChange={(e) => setDim(Number(e.target.value) / 100)}
          step={5}
          type="range"
          value={Math.round(dim * 100)}
        />
      </div>

      {wallpaper ? (
        <button
          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-white/10 text-sm ring-1 ring-white/15 hover:bg-white/15"
          onClick={reset}
          type="button"
        >
          <Icon className="size-4" name="IconTrashCan" />
          Voltar ao padrão
        </button>
      ) : null}
    </div>
  );
}
