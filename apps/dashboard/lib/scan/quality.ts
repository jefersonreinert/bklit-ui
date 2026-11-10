/**
 * Real-time image quality of the scan area, computed on the device from a
 * small grayscale crop (no network, a few ms per frame): light, glare,
 * contrast, focus (sharpness) and how much the area looks like a 1D
 * barcode. `assess` turns those numbers plus the decoder's result into
 * one state and a message for the scan screen.
 */

export interface FrameStats {
  /** Mean brightness 0–1. */
  luma: number;
  /** Standard deviation of brightness 0–1. */
  contrast: number;
  /** Edge strength relative to contrast (higher = sharper). */
  sharpness: number;
  /** Share of blown-out pixels 0–1. */
  glare: number;
  /** Bar-like texture: gradients mostly in one direction (≥ 1). */
  barness: number;
  /** Bar texture reaches the left/right edge of the area (code cut). */
  edgeBars: boolean;
}

/** RGBA → luma (Rec. 601), into a reused buffer. */
export function toGray(
  rgba: ArrayLike<number>,
  out: Uint8Array = new Uint8Array(rgba.length / 4)
): Uint8Array {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] =
      ((rgba[i] as number) * 77 +
        (rgba[i + 1] as number) * 150 +
        (rgba[i + 2] as number) * 29) >>
      8;
  }
  return out;
}

export function analyze(gray: ArrayLike<number>, w: number, h: number): FrameStats {
  const n = w * h;
  let sum = 0;
  let sq = 0;
  let blown = 0;
  for (let i = 0; i < n; i++) {
    const v = gray[i] as number;
    sum += v;
    sq += v * v;
    if (v >= 250) {
      blown++;
    }
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sq / n - mean * mean));

  // Laplacian (focus) and directional gradients (bar texture), skipping
  // the 1px border. Sampled every other row/column: plenty for 320px.
  let lap = 0;
  let gx = 0;
  let gy = 0;
  let count = 0;
  const strip = Math.max(2, Math.floor(w * 0.08));
  let leftX = 0;
  let rightX = 0;
  let centerX = 0;
  let leftN = 0;
  let rightN = 0;
  let centerN = 0;
  for (let y = 1; y < h - 1; y += 2) {
    const row = y * w;
    for (let x = 1; x < w - 1; x += 2) {
      const i = row + x;
      const c = gray[i] as number;
      const l = gray[i - 1] as number;
      const r = gray[i + 1] as number;
      const u = gray[i - w] as number;
      const d = gray[i + w] as number;
      lap += Math.abs(4 * c - l - r - u - d);
      const dx = Math.abs(r - l);
      gx += dx;
      gy += Math.abs(d - u);
      count++;
      if (x < strip) {
        leftX += dx;
        leftN++;
      } else if (x >= w - strip) {
        rightX += dx;
        rightN++;
      } else {
        centerX += dx;
        centerN++;
      }
    }
  }
  const lapMean = count ? lap / count : 0;
  const barness = (Math.max(gx, gy) + 1) / (Math.min(gx, gy) + 1);
  const center = centerN ? centerX / centerN : 0;
  const edge = Math.max(leftN ? leftX / leftN : 0, rightN ? rightX / rightN : 0);
  return {
    luma: mean / 255,
    contrast: std / 128,
    sharpness: lapMean / (std + 8),
    glare: blown / n,
    barness,
    edgeBars: gx > gy && center > 6 && edge > center * 0.75,
  };
}

/** Exponential smoothing so the indicators do not flicker. */
export function smooth(prev: FrameStats | null, next: FrameStats, k = 0.35): FrameStats {
  if (!prev) {
    return next;
  }
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    luma: mix(prev.luma, next.luma),
    contrast: mix(prev.contrast, next.contrast),
    sharpness: mix(prev.sharpness, next.sharpness),
    glare: mix(prev.glare, next.glare),
    barness: mix(prev.barness, next.barness),
    edgeBars: next.edgeBars,
  };
}

/** Thresholds, tuned on 320 px crops of iPhone frames. */
export const LIMITS = {
  dark: 0.16,
  dim: 0.24,
  glare: 0.1,
  lowContrast: 0.12,
  sharp: 0.55,
  blurry: 0.32,
  bars: 1.6,
};

export type ScanState =
  | "starting"
  | "dark"
  | "glare"
  | "searching"
  | "blurry"
  | "cut"
  | "partial"
  | "far"
  | "detected"
  | "ready";

export type Check = "ok" | "warn" | "bad";

export interface Assessment {
  state: ScanState;
  message: string;
  checks: { focus: Check; light: Check; framing: Check; readable: Check };
}

export interface DecodeHint {
  /** A valid code was read in this frame. */
  decoded: boolean;
  /** A symbol was found but could not be decoded (checksum, damage). */
  failed: boolean;
  /** Decoded symbol width relative to the scan area (0–1). */
  width?: number;
  /** Frames in a row with bar texture but no read. */
  misses?: number;
}

export const MESSAGES: Record<ScanState, string> = {
  starting: "Abrindo a câmera…",
  dark: "Iluminação insuficiente.",
  glare: "Reflexo forte. Incline um pouco o produto.",
  searching: "Posicione o código dentro da área de leitura.",
  blurry: "Imagem desfocada. Ajuste o foco.",
  cut: "O código está cortado. Afaste um pouco o telefone.",
  partial: "Código parcialmente oculto ou danificado.",
  far: "Aproxime o código da câmera.",
  detected: "Código detectado!",
  ready: "Imagem nítida. Pronto para capturar.",
};

export function assess(s: FrameStats | null, hint: DecodeHint): Assessment {
  if (!s) {
    return {
      state: "starting",
      message: MESSAGES.starting,
      checks: { focus: "warn", light: "warn", framing: "warn", readable: "warn" },
    };
  }
  const light: Check =
    s.luma < LIMITS.dark || s.glare > LIMITS.glare
      ? "bad"
      : s.luma < LIMITS.dim
        ? "warn"
        : "ok";
  const focus: Check =
    s.sharpness >= LIMITS.sharp ? "ok" : s.sharpness >= LIMITS.blurry ? "warn" : "bad";
  const bars = s.barness >= LIMITS.bars && s.contrast >= LIMITS.lowContrast;
  const far = hint.decoded && hint.width !== undefined && hint.width < 0.3;
  const framing: Check = hint.decoded
    ? far
      ? "warn"
      : "ok"
    : s.edgeBars
      ? "bad"
      : bars
        ? "warn"
        : "bad";
  const readable: Check = hint.decoded ? "ok" : hint.failed || bars ? "warn" : "bad";
  const checks = { focus, light, framing, readable };
  const out = (state: ScanState): Assessment => ({
    state,
    message: MESSAGES[state],
    checks,
  });

  // A valid read wins: the decoder is the final judge of legibility
  if (hint.decoded) {
    return out(far ? "far" : "detected");
  }
  if (s.luma < LIMITS.dark) {
    return out("dark");
  }
  if (s.glare > LIMITS.glare) {
    return out("glare");
  }
  if (hint.failed) {
    return out(focus === "bad" ? "blurry" : "partial");
  }
  if (bars) {
    if (focus === "bad") {
      return out("blurry");
    }
    if (s.edgeBars) {
      return out("cut");
    }
    if (focus !== "ok") {
      return out("blurry");
    }
    // Sharp bars that keep failing to read: something covers the code
    return out((hint.misses ?? 0) > 8 ? "partial" : "ready");
  }
  if (focus === "ok" && light === "ok") {
    return out("ready");
  }
  return out("searching");
}
