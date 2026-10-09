"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";

/**
 * Camera QR reader (back camera). iOS Safari has no BarcodeDetector, so
 * frames are decoded with jsQR, a few times per second.
 */
export function QrScanner({
  onCode,
  paused = false,
}: {
  onCode: (text: string) => void;
  paused?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef("");
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (paused) {
      return;
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let alive = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        const { default: jsQR } = await import("jsqr");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const el = video.current;
        if (!(alive && el && ctx)) {
          return;
        }
        el.srcObject = stream;
        await el.play();
        timer = setInterval(() => {
          if (!el.videoWidth) {
            return;
          }
          const scale = Math.min(1, 640 / el.videoWidth);
          canvas.width = Math.round(el.videoWidth * scale);
          canvas.height = Math.round(el.videoHeight * scale);
          ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height, {
            inversionAttempts: "dontInvert",
          });
          if (hit?.data && hit.data !== last.current) {
            last.current = hit.data;
            navigator.vibrate?.(60);
            onCodeRef.current(hit.data);
            setTimeout(() => {
              last.current = "";
            }, 2500);
          }
        }, 250);
      } catch {
        setError(
          "Não consegui abrir a câmera. Permita o acesso à câmera para este site nos ajustes do Safari."
        );
      }
    })();
    return () => {
      alive = false;
      if (timer) {
        clearInterval(timer);
      }
      for (const t of stream?.getTracks() ?? []) {
        t.stop();
      }
    };
  }, [paused]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-black">
      <video className="size-full object-cover" muted playsInline ref={video} />
      <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white">
          <Icon className="size-8" name="IconCameraOff" />
          {error}
        </div>
      ) : null}
    </div>
  );
}
