"use client";

import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBackLayer } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon, type IconName } from "@/lib/icons";
import { checksumOk, type Detection, decode, preloadDecoder } from "@/lib/scan/decoder";
import { emitScan, type ScanSource } from "@/lib/scan/hub";
import {
  type Assessment,
  analyze,
  assess,
  type Check,
  type FrameStats,
  smooth,
  toGray,
} from "@/lib/scan/quality";
import { cn } from "@/lib/utils";

/**
 * Full-screen iPhone camera scanner. Everything runs on the phone: the
 * code is decoded with ZXing (WebAssembly) and the image quality (focus,
 * light, framing, legibility) is measured on every frame, so the screen
 * says what to fix before the user even presses the shutter. The shutter
 * takes a full-resolution photo, decodes it again more thoroughly and can
 * hand it to AI recognition.
 */

export interface ScanResult {
  code: string;
  format?: string;
  source: ScanSource;
}

export interface PhotoResult {
  /** JPEG data URL, max 1600 px. */
  dataUrl: string;
  code: string | null;
  format?: string;
}

/** Scan area as a share of the preview (centered). */
const ROI = { w: 0.82, h: 0.34 };
const ANALYZE_W = 320;
const DECODE_W = 720;
const PHOTO_MAX = 1600;

interface Live {
  assessment: Assessment;
  code: string | null;
  format?: string;
}

const START: Live = {
  assessment: assess(null, { decoded: false, failed: false }),
  code: null,
};

function checkColor(c: Check) {
  return c === "ok" ? "bg-emerald-400" : c === "warn" ? "bg-amber-400" : "bg-rose-500";
}

function frameColor(a: Assessment) {
  if (a.state === "detected") {
    return "border-emerald-400";
  }
  if (a.state === "ready") {
    return "border-white";
  }
  if (a.state === "dark" || a.state === "glare" || a.state === "blurry") {
    return "border-amber-400";
  }
  if (a.state === "partial" || a.state === "cut" || a.state === "far") {
    return "border-amber-300";
  }
  return "border-white/70";
}

/** Maps the on-screen scan area to video pixels (object-fit: cover). */
function roiInVideo(el: HTMLVideoElement) {
  const vw = el.videoWidth;
  const vh = el.videoHeight;
  const cw = el.clientWidth;
  const ch = el.clientHeight;
  const scale = Math.max(cw / vw, ch / vh);
  const dispW = vw * scale;
  const dispH = vh * scale;
  const offX = (dispW - cw) / 2;
  const offY = (dispH - ch) / 2;
  const boxW = cw * ROI.w;
  const boxH = Math.min(ch * ROI.h, boxW * 0.62);
  const x = (cw - boxW) / 2;
  const y = (ch - boxH) / 2;
  return {
    sx: Math.max(0, (x + offX) / scale),
    sy: Math.max(0, (y + offY) / scale),
    sw: Math.min(vw, boxW / scale),
    sh: Math.min(vh, boxH / scale),
  };
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return;
    }
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1760;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => ctx.close();
  } catch {
    // no audio: fine
  }
  navigator.vibrate?.(40);
}

export function BarcodeScanner({
  open,
  onClose,
  onCode,
  onPhoto,
  title = "Escanear código",
  photoLabel = "Reconhecer com IA",
}: {
  open: boolean;
  onClose: () => void;
  /** A confirmed code (camera, photo or typed). */
  onCode: (result: ScanResult) => void;
  /** Photo taken with the shutter (for AI recognition). */
  onPhoto?: (photo: PhotoResult) => void;
  title?: string;
  photoLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return null;
  }
  return createPortal(
    <AnimatePresence>
      {open ? (
        <ScannerLayer
          onClose={onClose}
          onCode={onCode}
          onPhoto={onPhoto}
          photoLabel={photoLabel}
          title={title}
        />
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

function ScannerLayer({
  onClose,
  onCode,
  onPhoto,
  title,
  photoLabel,
}: {
  onClose: () => void;
  onCode: (result: ScanResult) => void;
  onPhoto?: (photo: PhotoResult) => void;
  title: string;
  photoLabel: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [live, setLive] = useState<Live>(START);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({
    supported: false,
    on: false,
  });
  const [photo, setPhoto] = useState<PhotoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [confirmed, setConfirmed] = useState<ScanResult | null>(null);
  const paused = useRef(false);
  paused.current = Boolean(photo || confirmed);

  // Back gesture / Esc close the camera like any full page
  useBackLayer(onClose);

  // Camera + analysis loop
  useEffect(() => {
    preloadDecoder();
    let alive = true;
    let raf = 0;
    let stats: FrameStats | null = null;
    let decoding = false;
    let lastAnalyze = 0;
    let lastRead: { code: string; at: number } | null = null;
    let lastHint = { decoded: false, failed: false, width: undefined as number | undefined };
    let misses = 0;
    const roi = document.createElement("canvas");
    const roiCtx = roi.getContext("2d", { willReadFrequently: true });
    const small = document.createElement("canvas");
    const smallCtx = small.getContext("2d", { willReadFrequently: true });
    let gray: Uint8Array = new Uint8Array(0);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const el = video.current;
      if (!(el?.videoWidth && roiCtx && smallCtx) || paused.current) {
        return;
      }
      if (now - lastAnalyze < 90) {
        return;
      }
      lastAnalyze = now;
      const r = roiInVideo(el);
      // Quality on a small crop
      small.width = ANALYZE_W;
      small.height = Math.max(1, Math.round((ANALYZE_W * r.sh) / r.sw));
      smallCtx.drawImage(el, r.sx, r.sy, r.sw, r.sh, 0, 0, small.width, small.height);
      const px = smallCtx.getImageData(0, 0, small.width, small.height);
      if (gray.length !== px.width * px.height) {
        gray = new Uint8Array(px.width * px.height);
      }
      stats = smooth(stats, analyze(toGray(px.data, gray), px.width, px.height));
      const barsSeen = stats.barness >= 1.6;
      misses = lastHint.decoded || !barsSeen ? 0 : misses + 1;
      const assessment = assess(stats, { ...lastHint, misses });
      setLive((prev) =>
        prev.assessment.state === assessment.state &&
        prev.assessment.checks.focus === assessment.checks.focus &&
        prev.assessment.checks.light === assessment.checks.light &&
        prev.assessment.checks.framing === assessment.checks.framing &&
        prev.assessment.checks.readable === assessment.checks.readable &&
        prev.code === (lastHint.decoded ? (lastRead?.code ?? null) : prev.code)
          ? prev
          : {
              assessment,
              code: lastHint.decoded ? (lastRead?.code ?? null) : prev.code,
              format: prev.format,
            }
      );
      // Decode the crop at a higher resolution (never two at once)
      if (decoding) {
        return;
      }
      decoding = true;
      roi.width = Math.min(DECODE_W, Math.round(r.sw));
      roi.height = Math.max(1, Math.round((roi.width * r.sh) / r.sw));
      roiCtx.drawImage(el, r.sx, r.sy, r.sw, r.sh, 0, 0, roi.width, roi.height);
      const img = roiCtx.getImageData(0, 0, roi.width, roi.height);
      decode(img, false)
        .then((found: Detection[]) => {
          if (!alive) {
            return;
          }
          const hit = found.find((d) => d.valid && checksumOk(d.text, d.format));
          lastHint = {
            decoded: Boolean(hit),
            failed: !hit && found.length > 0,
            width: hit ? hit.box.w / roi.width : undefined,
          };
          if (!hit) {
            return;
          }
          const t = performance.now();
          // Same value twice in a row: no misreads
          if (lastRead?.code === hit.text && t - lastRead.at < 1500) {
            if (!paused.current) {
              beep();
              setLive((p) => ({ ...p, code: hit.text, format: hit.format }));
              setConfirmed({ code: hit.text, format: hit.format, source: "camera" });
            }
          }
          lastRead = { code: hit.text, at: t };
        })
        .catch((err) => {
          console.error("[scan] decode failed", err);
        })
        .finally(() => {
          decoding = false;
        });
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador não dá acesso à câmera. Use “Escolher foto”.");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!alive) {
          for (const t of s.getTracks()) {
            t.stop();
          }
          return;
        }
        stream.current = s;
        const track = s.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          torch?: boolean;
          focusMode?: string[];
        };
        if (caps.focusMode?.includes("continuous")) {
          await track
            ?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
            .catch(() => undefined);
        }
        setTorch({ supported: Boolean(caps.torch), on: false });
        const el = video.current;
        if (el) {
          el.srcObject = s;
          await el.play().catch(() => undefined);
        }
        raf = requestAnimationFrame(tick);
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setError(
          name === "NotAllowedError"
            ? "Sem permissão para a câmera. Permita o acesso nos ajustes do Safari (aA → Ajustes do site → Câmera)."
            : "Não consegui abrir a câmera. Use “Escolher foto” ou digite o código."
        );
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      for (const t of stream.current?.getTracks() ?? []) {
        t.stop();
      }
      stream.current = null;
    };
  }, []);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) {
      return;
    }
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  const finishPhoto = useCallback(async (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return;
    }
    const found = await decode(ctx.getImageData(0, 0, canvas.width, canvas.height), true).catch(
      () => [] as Detection[]
    );
    const hit = found.find((d) => d.valid && checksumOk(d.text, d.format));
    setPhoto({
      dataUrl: canvas.toDataURL("image/jpeg", 0.85),
      code: hit?.text ?? null,
      format: hit?.format,
    });
    if (hit) {
      beep();
    }
  }, []);

  const capture = async () => {
    const el = video.current;
    if (!el?.videoWidth || busy) {
      return;
    }
    setBusy(true);
    try {
      const scale = Math.min(1, PHOTO_MAX / Math.max(el.videoWidth, el.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(el.videoWidth * scale);
      canvas.height = Math.round(el.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(el, 0, 0, canvas.width, canvas.height);
      await finishPhoto(canvas);
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, PHOTO_MAX / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      await finishPhoto(canvas);
    } catch {
      setError("Não consegui abrir essa foto.");
    } finally {
      setBusy(false);
    }
  };

  const accept = (r: ScanResult) => {
    emitScan(r);
    onCode(r);
  };

  const a = live.assessment;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-label={title}
      aria-modal="true"
      className="dark fixed inset-0 z-[60] flex flex-col bg-black text-white"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
      transition={{ duration: 0.2 }}
    >
      {/* Preview */}
      <video
        aria-hidden
        className="absolute inset-0 size-full object-cover"
        muted
        playsInline
        ref={video}
      />
      {photo ? (
        // biome-ignore lint/performance/noImgElement: local data URL
        // eslint-disable-next-line @next/next/no-img-element -- local data URL
        <img alt="Foto capturada" className="absolute inset-0 size-full bg-black object-contain" src={photo.dataUrl} />
      ) : null}

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
        <RoundButton icon="IconCrossMedium" label="Fechar" onClick={onClose} />
        <p className="truncate font-semibold text-[15px]">{title}</p>
        {torch.supported && !photo ? (
          <RoundButton
            active={torch.on}
            icon="IconLightning"
            label={torch.on ? "Desligar lanterna" : "Ligar lanterna"}
            onClick={toggleTorch}
          />
        ) : (
          <span className="size-11" />
        )}
      </div>

      {/* Scan area + guidance */}
      {photo ? null : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "relative rounded-3xl border-[3px] shadow-[0_0_0_200vmax_rgba(0,0,0,0.45)] transition-colors duration-200",
              frameColor(a)
            )}
            style={{
              width: `${ROI.w * 100}%`,
              height: `min(${ROI.h * 100}%, calc(${ROI.w * 100}vw * 0.62))`,
            }}
          >
            {a.state === "detected" || confirmed ? null : (
              <motion.span
                animate={{ top: ["12%", "88%", "12%"] }}
                className="absolute inset-x-4 h-0.5 rounded bg-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.9)]"
                transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              />
            )}
            {live.code ? (
              <span className="-translate-x-1/2 absolute bottom-3 left-1/2 rounded-full bg-black/70 px-3 py-1 font-mono text-emerald-300 text-sm tabular-nums tracking-wider">
                {live.code}
              </span>
            ) : null}
          </div>
        </div>
      )}

      <div className="relative z-10 mt-auto flex flex-col gap-3 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-4 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error ? (
          <p className="rounded-2xl bg-rose-500/20 px-3 py-2 text-center text-rose-100 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {photo ? (
          <PhotoPanel
            onAccept={() =>
              photo.code && accept({ code: photo.code, format: photo.format, source: "photo" })
            }
            onAi={onPhoto ? () => onPhoto(photo) : undefined}
            onRetake={() => setPhoto(null)}
            photo={photo}
            photoLabel={photoLabel}
          />
        ) : confirmed ? (
          <div className="flex flex-col gap-3 rounded-3xl bg-white/10 p-4 backdrop-blur-xl" role="status">
            <p className="flex items-center gap-2 font-semibold text-emerald-300">
              <Icon className="size-5" name="IconCheckCircle2" />
              Código detectado!
            </p>
            <p className="font-mono text-2xl tabular-nums tracking-wider">{confirmed.code}</p>
            <p className="text-white/60 text-xs">{confirmed.format}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="h-12 bg-white/15 text-white hover:bg-white/25"
                onClick={() => {
                  setConfirmed(null);
                  setLive(START);
                }}
                variant="ghost"
              >
                Ler outro
              </Button>
              <Button className="h-12" onClick={() => accept(confirmed)}>
                Usar código
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div aria-live="polite" className="text-center">
              <p
                className={cn(
                  "font-medium text-[15px]",
                  a.state === "detected" && "text-emerald-300",
                  (a.state === "dark" || a.state === "blurry" || a.state === "glare") &&
                    "text-amber-200"
                )}
              >
                {a.message}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-[11px]">
              <Indicator check={a.checks.focus} label="Nitidez" />
              <Indicator check={a.checks.light} label="Luz" />
              <Indicator check={a.checks.framing} label="Enquadre" />
              <Indicator check={a.checks.readable} label="Leitura" />
            </div>
            <div className="flex items-center justify-between gap-4 pt-1">
              <label className="flex size-12 cursor-pointer items-center justify-center rounded-full bg-white/15 active:bg-white/25">
                <Icon className="size-6" name="IconImages1" />
                <span className="sr-only">Escolher foto</span>
                <input
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    pickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  type="file"
                />
              </label>
              <button
                aria-label="Tirar foto"
                className={cn(
                  "flex size-[76px] items-center justify-center rounded-full border-4 transition-colors active:scale-95",
                  a.state === "ready" || a.state === "detected"
                    ? "border-emerald-400"
                    : "border-white"
                )}
                disabled={busy || Boolean(error && !video.current?.videoWidth)}
                onClick={capture}
                type="button"
              >
                <span className={cn("size-[60px] rounded-full bg-white", busy && "animate-pulse")} />
              </button>
              <form
                className="contents"
                onSubmit={(e) => {
                  e.preventDefault();
                  const code = typed.trim();
                  if (code) {
                    accept({ code, source: "manual" });
                  }
                }}
              >
                <TypeCode onChange={setTyped} value={typed} />
              </form>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function RoundButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-11 items-center justify-center rounded-full backdrop-blur-xl active:scale-95",
        active ? "bg-amber-300 text-black" : "bg-white/15"
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-5" name={icon} />
    </button>
  );
}

function Indicator({ label, check }: { label: string; check: Check }) {
  const text = check === "ok" ? "bom" : check === "warn" ? "atenção" : "ruim";
  return (
    <span className="flex items-center justify-center gap-1.5 rounded-full bg-white/10 px-2 py-1.5">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full transition-colors", checkColor(check))} />
      <span className="truncate">{label}</span>
      <span className="sr-only">: {text}</span>
    </span>
  );
}

function TypeCode({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        aria-label="Digitar código"
        className="flex size-12 items-center justify-center rounded-full bg-white/15 active:bg-white/25"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Icon className="size-6" name="IconPencil" />
      </button>
    );
  }
  return (
    <div className="absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex gap-2 rounded-2xl bg-neutral-900 p-2">
      <Input
        autoFocus
        className="h-11 flex-1 border-white/20 bg-transparent text-base text-white"
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite o código"
        value={value}
      />
      <Button className="h-11" type="submit">
        OK
      </Button>
      <Button className="h-11 text-white" onClick={() => setOpen(false)} type="button" variant="ghost">
        <Icon className="size-4" name="IconCrossSmall" />
      </Button>
    </div>
  );
}

function PhotoPanel({
  photo,
  onRetake,
  onAccept,
  onAi,
  photoLabel,
}: {
  photo: PhotoResult;
  onRetake: () => void;
  onAccept: () => void;
  onAi?: () => void;
  photoLabel: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-white/10 p-4 backdrop-blur-xl" role="status">
      {photo.code ? (
        <>
          <p className="flex items-center gap-2 font-semibold text-emerald-300">
            <Icon className="size-5" name="IconCheckCircle2" />
            Código detectado na foto
          </p>
          <p className="font-mono text-2xl tabular-nums tracking-wider">{photo.code}</p>
        </>
      ) : (
        <p className="text-sm text-white/80">
          Nenhum código legível nesta foto.
          {onAi ? " A IA pode identificar o produto pela imagem." : ""}
        </p>
      )}
      <div className={cn("grid gap-2", onAi && photo.code ? "grid-cols-3" : "grid-cols-2")}>
        <Button className="h-12 bg-white/15 text-white hover:bg-white/25" onClick={onRetake} variant="ghost">
          Tirar outra
        </Button>
        {photo.code ? (
          <Button className="h-12" onClick={onAccept}>
            Usar código
          </Button>
        ) : null}
        {onAi ? (
          <Button
            className={cn("h-12", photo.code && "bg-white/15 text-white hover:bg-white/25")}
            onClick={onAi}
            variant={photo.code ? "ghost" : "default"}
          >
            <Icon className="size-4" name="IconSparkle" />
            <span className="truncate">{photo.code ? "IA" : photoLabel}</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
