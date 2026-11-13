"use client";

import { useEffect, useRef } from "react";

/**
 * Stippled wine illustrations in the style of the house menu: grainy
 * dusty-rose silhouettes (a hand holding grapes, a glass, a pour…) made
 * of thousands of dots. The dots drift like dust from one drawing to the
 * next. Used as the empty-chat hero and as a faint page background.
 */

type Draw = (c: CanvasRenderingContext2D) => void;

const TAU = Math.PI * 2;

function line(c: CanvasRenderingContext2D, pts: number[], width: number) {
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(pts[0] ?? 0, pts[1] ?? 0);
  for (let i = 2; i < pts.length; i += 2) {
    c.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
  }
  c.stroke();
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

/** Grapes in rows narrowing downwards; (x, y) is the top centre. */
function grapes(c: CanvasRenderingContext2D, x: number, y: number, r: number, rows = [4, 5, 4, 3, 2, 1]) {
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const gx = x + (i - (n - 1) / 2) * r * 1.75 + Math.sin(row * 3 + i) * r * 0.15;
      const gy = y + row * r * 1.55 + Math.cos(row + i * 2) * r * 0.12;
      c.globalAlpha = 0.72 + ((row * 7 + i * 3) % 5) * 0.07;
      dot(c, gx, gy, r);
      // A light rim, so each grape reads as its own sphere
      c.save();
      c.globalCompositeOperation = "destination-out";
      c.globalAlpha = 0.7;
      c.lineWidth = r * 0.26;
      c.beginPath();
      c.arc(gx, gy, r * 0.92, 0.6 * Math.PI, 1.9 * Math.PI);
      c.stroke();
      c.globalAlpha = 0.35;
      dot(c, gx - r * 0.35, gy - r * 0.35, r * 0.25);
      c.restore();
    }
  });
  c.globalAlpha = 1;
}

/** A stemmed glass, wine up to `fill` (0–1 of the bowl). */
function glass(c: CanvasRenderingContext2D, x: number, y: number, s: number, fill = 0.45) {
  const bowl = new Path2D();
  bowl.moveTo(x - 15 * s, y);
  bowl.lineTo(x + 15 * s, y);
  bowl.bezierCurveTo(x + 18 * s, y + 22 * s, x + 12 * s, y + 34 * s, x, y + 35 * s);
  bowl.bezierCurveTo(x - 12 * s, y + 34 * s, x - 18 * s, y + 22 * s, x - 15 * s, y);
  c.globalAlpha = 0.28;
  c.fill(bowl);
  c.save();
  c.clip(bowl);
  c.globalAlpha = 1;
  c.fillRect(x - 20 * s, y + 35 * s * (1 - fill), 40 * s, 40 * s);
  c.restore();
  c.globalAlpha = 0.9;
  c.fillRect(x - 1.1 * s, y + 34 * s, 2.2 * s, 22 * s);
  c.beginPath();
  c.ellipse(x, y + 57 * s, 11 * s, 2.6 * s, 0, 0, TAU);
  c.fill();
  c.globalAlpha = 1;
}

/** A forearm reaching in from a corner, ending in a pinching hand. */
function hand(c: CanvasRenderingContext2D, from: [number, number], to: [number, number], s = 1) {
  const [fx, fy] = from;
  const [tx, ty] = to;
  c.globalAlpha = 0.62;
  c.lineWidth = 17 * s;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(fx, fy);
  c.quadraticCurveTo((fx + tx) / 2 + 8 * s, fy + (ty - fy) * 0.15, tx + 4 * s, ty - 6 * s);
  c.stroke();
  c.globalAlpha = 1;
  c.beginPath();
  c.ellipse(tx, ty, 10 * s, 8 * s, -0.6, 0, TAU);
  c.fill();
  // Thumb and index finger pinching
  line(c, [tx - 6 * s, ty + 2 * s, tx - 5 * s, ty + 10 * s], 4.4 * s);
  line(c, [tx + 3 * s, ty + 4 * s, tx - 3 * s, ty + 12 * s], 4.4 * s);
  line(c, [tx + 8 * s, ty + 1 * s, tx + 6 * s, ty + 9 * s], 4 * s);
  // Light gaps between the fingers
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.globalAlpha = 0.8;
  line(c, [tx - 2 * s, ty + 5 * s, tx - 4.4 * s, ty + 11 * s], 1.2 * s);
  line(c, [tx + 5.6 * s, ty + 4 * s, tx + 3.4 * s, ty + 10 * s], 1.1 * s);
  c.restore();
}

const CONCEPTS: Draw[] = [
  // A hand holding a bunch of grapes by the stem (the menu's picture)
  (c) => {
    hand(c, [118, -6], [54, 30], 1.15);
    line(c, [49, 43, 48, 50, 45, 57], 1.8);
    line(c, [48, 50, 54, 56], 1.4);
    grapes(c, 48, 61, 5, [4, 5, 4, 3, 2, 1]);
  },
  // A glass of red, half full
  (c) => {
    glass(c, 50, 16, 1.2, 0.5);
  },
  // A bottle pouring into a glass
  (c) => {
    c.save();
    c.translate(36, 22);
    c.rotate(-2.2);
    c.globalAlpha = 0.9;
    c.beginPath();
    c.roundRect(-8, 0, 16, 34, 4);
    c.fill();
    c.beginPath();
    c.moveTo(-8, 2);
    c.quadraticCurveTo(0, -12, 8, 2);
    c.fill();
    c.fillRect(-3, -22, 6, 16);
    c.restore();
    c.globalAlpha = 0.7;
    line(c, [53, 36, 56, 48, 57, 60], 1.6);
    c.globalAlpha = 1;
    glass(c, 58, 56, 0.75, 0.35);
  },
  // A vine leaf with its veins
  (c) => {
    c.save();
    c.translate(50, 48);
    dot(c, 0, 0, 20);
    for (const a of [-90, -35, -145, 15, 165]) {
      const r = (a * Math.PI) / 180;
      dot(c, Math.cos(r) * 20, Math.sin(r) * 20, 13);
    }
    c.globalCompositeOperation = "destination-out";
    c.globalAlpha = 0.75;
    for (const a of [-90, -35, -145, 15, 165]) {
      const r = (a * Math.PI) / 180;
      line(c, [0, 8, Math.cos(r) * 30, Math.sin(r) * 30], 1.4);
    }
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    line(c, [0, 14, 2, 26, 6, 36], 2);
    c.restore();
  },
  // Two glasses: cheers
  (c) => {
    c.save();
    c.translate(38, 26);
    c.rotate(0.28);
    glass(c, 0, 0, 0.9, 0.55);
    c.restore();
    c.save();
    c.translate(62, 26);
    c.rotate(-0.28);
    glass(c, 0, 0, 0.9, 0.4);
    c.restore();
    c.globalAlpha = 0.7;
    line(c, [50, 8, 50, 2], 1.2);
    line(c, [44, 10, 40, 5], 1.2);
    line(c, [56, 10, 60, 5], 1.2);
    c.globalAlpha = 1;
  },
  // An oak barrel
  (c) => {
    const body = new Path2D();
    body.moveTo(30, 20);
    body.quadraticCurveTo(50, 14, 70, 20);
    body.quadraticCurveTo(80, 50, 70, 80);
    body.quadraticCurveTo(50, 86, 30, 80);
    body.quadraticCurveTo(20, 50, 30, 20);
    c.globalAlpha = 0.8;
    c.fill(body);
    c.globalAlpha = 1;
    c.save();
    c.clip(body);
    for (const y of [30, 70]) {
      c.fillRect(0, y - 2.5, 100, 5);
    }
    c.globalCompositeOperation = "destination-out";
    c.globalAlpha = 0.5;
    for (const x of [40, 50, 60]) {
      line(c, [x, 10, x + (x - 50) * 0.3, 90], 0.9);
    }
    c.restore();
  },
  // A big bunch with a leaf and a curling tendril
  (c) => {
    line(c, [50, 12, 50, 24], 2.2);
    c.globalAlpha = 0.75;
    c.save();
    c.translate(63, 18);
    c.rotate(0.4);
    dot(c, 0, 0, 9);
    dot(c, -7, -5, 6);
    dot(c, 7, -5, 6);
    c.restore();
    c.globalAlpha = 1;
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(38, 18, 5, 0, 4.8);
    c.stroke();
    grapes(c, 50, 30, 5.6, [5, 5, 4, 4, 3, 2, 1]);
  },
  // A hand raising a glass by the stem
  (c) => {
    glass(c, 46, 10, 1, 0.5);
    hand(c, [100, 106], [49, 52], 0.9);
  },
];

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

const MASK = 200;

/** N dots spread over a drawing, denser where it is darker. */
function sample(drawing: Draw, n: number, rand: () => number): [number, number][] {
  const cv = document.createElement("canvas");
  cv.width = MASK;
  cv.height = MASK;
  const c = cv.getContext("2d", { willReadFrequently: true });
  if (!c) {
    return [];
  }
  c.scale(MASK / 100, MASK / 100);
  // Soft edges: the dots thin out at the border, like a printed stipple
  c.filter = "blur(2px)";
  c.fillStyle = "#000";
  c.strokeStyle = "#000";
  drawing(c);
  const data = c.getImageData(0, 0, MASK, MASK).data;
  const cum = new Float32Array(MASK * MASK);
  let total = 0;
  for (let i = 0; i < MASK * MASK; i++) {
    const a = (data[i * 4 + 3] ?? 0) / 255;
    const x = i % MASK;
    const y = Math.floor(i / MASK);
    // Like the print: grainier towards the lower left
    const light = 0.6 + 0.4 * ((x - y + MASK) / (2 * MASK));
    total += a ** 1.6 * light;
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

const TONES = ["#b06f66", "#c4877c", "#9c5a52", "#d3a096"];

export function StippleArt({
  className,
  dots = 9000,
  grain = 1.1,
  hold = 4.2,
  morph = 2.2,
  start = 0,
  opacity = 1,
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
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!(el && ctx)) {
      return;
    }
    const rand = seeded(7 + start * 31);
    const shapes = CONCEPTS.map((d) => sample(d, dots, rand));
    const first = shapes[start % shapes.length] ?? [];
    const ps: Particle[] = first.map(([x, y]) => ({
      x,
      y,
      ox: x,
      oy: y,
      tx: x,
      ty: y,
      size: 0.7 + rand() * 0.6,
      tone: Math.floor(rand() * TONES.length),
      seed: rand() * TAU,
    }));

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

    const paint = (t: number, k: number) => {
      ctx.clearRect(0, 0, w, h);
      const side = Math.min(w, h);
      const ox = (w - side) / 2;
      const oy = (h - side) / 2;
      for (let tone = 0; tone < TONES.length; tone++) {
        ctx.fillStyle = TONES[tone] ?? "#b06f66";
        ctx.globalAlpha = opacity * (0.6 + tone * 0.12);
        for (const p of ps) {
          if (p.tone !== tone) {
            continue;
          }
          // Each dot leaves a little later than the one above it
          const local = Math.min(1, Math.max(0, k * 1.6 - p.oy * 0.6));
          const e = ease(local);
          const swirl = Math.sin(local * Math.PI) * 0.06;
          p.x = p.ox + (p.tx - p.ox) * e + Math.cos(p.seed + t) * swirl;
          p.y = p.oy + (p.ty - p.oy) * e + Math.sin(p.seed * 1.3 + t) * swirl;
          // A slight breathing grain while it holds
          const jx = Math.cos(p.seed + t * 0.9) * 0.0016;
          const jy = Math.sin(p.seed * 2 + t * 0.7) * 0.0016;
          const s = p.size * grain;
          ctx.fillRect(ox + (p.x + jx) * side, oy + (p.y + jy) * side, s, s);
        }
      }
      ctx.globalAlpha = 1;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(0, 0);
      return () => ro.disconnect();
    }

    let raf = 0;
    let shape = start % shapes.length;
    let phaseStart = performance.now();
    let moving = false;
    const tick = (now: number) => {
      const s = (now - phaseStart) / 1000;
      if (!moving && s > hold) {
        // Next drawing: the dust sets off towards it
        shape = (shape + 1) % shapes.length;
        const next = shapes[shape] ?? [];
        ps.forEach((p, i) => {
          p.ox = p.x;
          p.oy = p.y;
          const target = next[i];
          p.tx = target?.[0] ?? p.x;
          p.ty = target?.[1] ?? p.y;
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
      const k = moving ? Math.min(1, ((now - phaseStart) / 1000 / morph)) : 0;
      paint(now / 1000, k);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [dots, grain, hold, morph, start, opacity]);

  return <canvas aria-hidden="true" className={className} ref={ref} />;
}
