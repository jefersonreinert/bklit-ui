"use client";

import { Icon } from "@/lib/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipRecorder,
  Listener,
  speechSupported,
  transcribeClip,
} from "@/components/pages/voice/voice-engine";
import { cn } from "@/lib/utils";

/**
 * Assistant composer extras: photos/images, a live camera and real-time
 * dictation from the microphone.
 */

export interface ImageAttachment {
  id: string;
  /** Small JPEG kept with the conversation (localStorage). */
  thumb: string;
  /** Full-size JPEG (≤ 1568 px, what Claude reads); kept in memory only. */
  full?: string;
}

const FULL_PX = 1568;
const THUMB_PX = 320;
export const MAX_ATTACHMENTS = 6;

const DATA_URL_TYPE = /^data:(image\/[a-z+]+);base64$/;

const newId = () => Math.random().toString(36).slice(2, 10);

function drawScaled(
  source: CanvasImageSource,
  width: number,
  height: number,
  max: number,
  quality: number
) {
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas unavailable");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function fromSource(
  source: CanvasImageSource,
  width: number,
  height: number
): ImageAttachment {
  return {
    id: newId(),
    full: drawScaled(source, width, height, FULL_PX, 0.85),
    thumb: drawScaled(source, width, height, THUMB_PX, 0.7),
  };
}

/** Any image the browser can decode (incl. iPhone HEIC) → JPEG attachment. */
export async function imageFromFile(file: File): Promise<ImageAttachment> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return fromSource(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `data:image/jpeg;base64,...` → API image source. */
export function toApiImage(dataUrl: string) {
  const [head, data = ""] = dataUrl.split(",");
  const media = head?.match(DATA_URL_TYPE)?.[1] ?? "image/jpeg";
  return { media_type: media, data };
}

export function AttachmentStrip({
  items,
  onRemove,
}: {
  items: ImageAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="flex gap-2 overflow-x-auto px-1 pt-1">
      {items.map((a) => (
        <div className="relative shrink-0" key={a.id}>
          {/* biome-ignore lint/performance/noImgElement: local data URL */}
          <img
            alt="Imagem anexada"
            className="size-16 rounded-xl border object-cover"
            height={64}
            src={a.thumb}
            width={64}
          />
          <button
            aria-label="Remover imagem"
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow"
            onClick={() => onRemove(a.id)}
            type="button"
          >
            <Icon className="size-3" name="IconCrossSmall" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- camera -------------------------------- */

export function CameraSheet({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (a: ImageAttachment) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          for (const t of s.getTracks()) {
            t.stop();
          }
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => null);
        }
      })
      .catch(() =>
        setError(
          "Não consegui abrir a câmera. Permita o acesso em Ajustes → Safari → Câmera."
        )
      );
    return () => {
      cancelled = true;
      for (const t of stream?.getTracks() ?? []) {
        t.stop();
      }
    };
  }, [facing]);

  const capture = () => {
    const v = video.current;
    if (!(v?.videoWidth && v.videoHeight)) {
      return;
    }
    onCapture(fromSource(v, v.videoWidth, v.videoHeight));
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between p-3 text-white">
        <button
          aria-label="Fechar câmera"
          className="flex size-10 items-center justify-center rounded-full bg-white/10"
          onClick={onClose}
          type="button"
        >
          <Icon className="size-5" name="IconCrossMedium" />
        </button>
        <span className="text-sm opacity-80">
          Toque no botão para fotografar
        </span>
        <button
          aria-label="Trocar câmera"
          className="flex size-10 items-center justify-center rounded-full bg-white/10"
          onClick={() =>
            setFacing((f) => (f === "user" ? "environment" : "user"))
          }
          type="button"
        >
          <Icon className="size-5" name="IconArrowsRepeat" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="max-w-xs text-center text-sm text-white/80">{error}</p>
        ) : (
          <video
            className={cn(
              "max-h-full max-w-full object-contain",
              facing === "user" && "-scale-x-100"
            )}
            muted
            playsInline
            ref={video}
          />
        )}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-white transition-opacity duration-150",
            flash ? "opacity-70" : "opacity-0"
          )}
        />
      </div>
      <div className="flex items-center justify-center gap-6 pt-4">
        <button
          aria-label="Tirar foto"
          className="size-18 rounded-full border-4 border-white bg-white/90 transition-transform active:scale-95 disabled:opacity-40"
          disabled={Boolean(error)}
          onClick={capture}
          type="button"
        />
        <button
          className="absolute right-6 rounded-full bg-white px-4 py-2 font-medium text-black text-sm"
          onClick={onClose}
          type="button"
        >
          Concluir
        </button>
      </div>
    </div>
  );
}

/* ------------------------------- dictation ------------------------------- */

/**
 * Real-time dictation: the iPhone's speech recognition (live words), or
 * Gemini transcription in short clips when the browser has none.
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listener = useRef<Listener | null>(null);
  const recorder = useRef<ClipRecorder | null>(null);
  const emit = useRef(onText);
  emit.current = onText;

  const stop = useCallback(() => {
    listener.current?.stop();
    listener.current = null;
    recorder.current?.stop();
    recorder.current = null;
    setInterim("");
    setListening(false);
  }, []);

  const start = useCallback(() => {
    setError(null);
    if (speechSupported()) {
      const l = new Listener({
        onInterim: setInterim,
        onFinal: (t) => emit.current(t),
        onError: (m) => {
          setError(m);
          if (!l.active) {
            setListening(false);
          }
        },
      });
      listener.current = l;
      l.start();
    } else {
      const r = new ClipRecorder(4, async (blob) => {
        setInterim("Transcrevendo…");
        try {
          const text = (await transcribeClip(blob)).trim();
          if (text) {
            emit.current(text);
          }
        } catch {
          setError("Não consegui transcrever o áudio.");
        } finally {
          setInterim("");
        }
      });
      recorder.current = r;
      r.start().catch(() => {
        setError("Permita o microfone para ditar.");
        stop();
      });
    }
    setListening(true);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return {
    listening,
    interim,
    error,
    toggle: () => (listening ? stop() : start()),
    stop,
  };
}
