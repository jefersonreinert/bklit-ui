"use client";

import { useEffect, useRef } from "react";
import { BASE_PATH } from "@/lib/use-connectors";

/**
 * Stippled wine illustrations in the style of the house menu (dusty-rose
 * grain on paper), made of thousands of dots that drift like dust from
 * one drawing to the next. The drawings are density maps in
 * public/sommelier-art (white = ink): the hand holding grapes comes from
 * the printed menu itself, the others were made in the same style.
 */

const ART = ["hand-grapes", "glass-hand", "pour", "vine", "cheers"];

const TAU = Math.PI * 2;
const MASK = 256;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** N dots spread over a drawing, denser where the ink is darker. */
function sample(img: HTMLImageElement, n: number, rand: () => number): [number, number][] {
  const cv = document.createElement("canvas");
  cv.width = MASK;
  cv.height = MASK;
  const c = cv.getContext("2d", { willReadFrequently: true });
  if (!c) {
    return [];
  }
  // Fit the drawing in the square, centred
  const scale = Math.min(MASK / img.width, MASK / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  c.drawImage(img, (MASK - w) / 2, (MASK - h) / 2, w, h);
  const data = c.getImageData(0, 0, MASK, MASK).data;
  const cum = new Float32Array(MASK * MASK);
  let total = 0;
  for (let i = 0; i < MASK * MASK; i++) {
    const v = (data[i * 4] ?? 0) / 255;
    total += v ** 1.25;
    cum[i] = total;
  }
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const r = rand() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cum[mid] ?? 0) < r) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    out.push([((lo % MASK) + rand()) / MASK, (Math.floor(lo / MASK) + rand()) / MASK]);
  }
  // Ordered top to bottom, so the dust flows in layers between drawings
  return out.sort((a, b) => a[1] + a[0] * 0.3 - (b[1] + b[0] * 0.3));
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The menu's dusty rose, from deep to light. */
const TONES = ["#8f4f48", "#a8645b", "#bb7a70", "#cf978c"];

interface Particle {
  x: number;
  y: number;
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  size: number;
  tone: number;
  seed: number;
}

export function StippleArt({
  className,
  dots = 18_000,
  grain = 0.85,
  hold = 4.5,
  morph = 2.2,
  start = 0,
  opacity = 1,
  fps = 60,
}: {
  className?: string;
  dots?: number;
  /** Dot size in CSS pixels. */
  grain?: number;
  /** Seconds each drawing stays. */
  hold?: number;
  /** Seconds the dust takes to become the next drawing. */
  morph?: number;
  /** First drawing (so two instances show different ones). */
  start?: number;
  opacity?: number;
  /** Frame cap (the faint background needs fewer). */
  fps?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!(el && ctx)) {
      return;
    }
    let raf = 0;
    let stopped = false;
    let w = 0;
    let h = 0;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    Promise.all(ART.map((a) => loadImage(`${BASE_PATH}/sommelier-art/${a}.png`)))
      .then((imgs) => {
        if (stopped) {
          return;
        }
        const rand = seeded(7 + start * 31);
        const shapes = imgs.map((img) => sample(img, dots, rand));
        let shape = start % shapes.length;
        const ps: Particle[] = (shapes[shape] ?? []).map(([x, y]) => ({
          // The first drawing gathers out of a loose cloud
          x,
          y,
          ox: 0.5 + (rand() - 0.5) * 1.2,
          oy: 0.5 + (rand() - 0.5) * 1.2,
          tx: x,
          ty: y,
          size: 0.75 + rand() * 0.6,
          tone: Math.floor(rand() * TONES.length),
          seed: rand() * TAU,
        }));

        const paint = (t: number, k: number) => {
          ctx.clearRect(0, 0, w, h);
          const side = Math.min(w, h);
          const ox = (w - side) / 2;
          const oy = (h - side) / 2;
          for (let tone = 0; tone < TONES.length; tone++) {
            ctx.fillStyle = TONES[tone] ?? "#a8645b";
            ctx.globalAlpha = opacity * (0.95 - tone * 0.12);
            for (const p of ps) {
              if (p.tone !== tone) {
                continue;
              }
              // Each dot leaves a little later than the one above it
              const local = Math.min(1, Math.max(0, k * 1.6 - p.oy * 0.6));
              const e = ease(local);
              const swirl = Math.sin(local * Math.PI) * 0.05;
              p.x = p.ox + (p.tx - p.ox) * e + Math.cos(p.seed + t) * swirl;
              p.y = p.oy + (p.ty - p.oy) * e + Math.sin(p.seed * 1.3 + t) * swirl;
              // A slight breathing grain while it holds
              const jx = Math.cos(p.seed + t * 0.9) * 0.0012;
              const jy = Math.sin(p.seed * 2 + t * 0.7) * 0.0012;
              const s = p.size * grain;
              ctx.fillRect(ox + (p.x + jx) * side, oy + (p.y + jy) * side, s, s);
            }
          }
          ctx.globalAlpha = 1;
        };

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          for (const p of ps) {
            p.ox = p.tx;
            p.oy = p.ty;
          }
          paint(0, 0);
          return;
        }

        let moving = true;
        let phaseStart = performance.now();
        let last = 0;
        const frame = 1000 / fps - 2;
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          if (now - last < frame) {
            return;
          }
          last = now;
          const s = (now - phaseStart) / 1000;
          if (!moving && s > hold) {
            // Next drawing: the dust sets off towards it
            shape = (shape + 1) % shapes.length;
            const next = shapes[shape] ?? [];
            ps.forEach((p, i) => {
              p.ox = p.x;
              p.oy = p.y;
              p.tx = next[i]?.[0] ?? p.x;
              p.ty = next[i]?.[1] ?? p.y;
            });
            moving = true;
            phaseStart = now;
          } else if (moving && s > morph) {
            for (const p of ps) {
              p.ox = p.tx;
              p.oy = p.ty;
            }
            moving = false;
            phaseStart = now;
          }
          const k = moving ? Math.min(1, (now - phaseStart) / 1000 / morph) : 0;
          paint(now / 1000, k);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => undefined);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [dots, grain, hold, morph, start, opacity, fps]);

  return <canvas aria-hidden="true" className={className} ref={ref} />;
}
