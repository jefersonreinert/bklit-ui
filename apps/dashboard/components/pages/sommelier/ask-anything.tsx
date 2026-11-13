"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The empty-chat hero of the sommelier page: a glossy 3D bunch of grapes
 * (canvas, perspective, light and shadow) slowly turning, with "ask
 * anything" decoding itself out of random glyphs and hint questions
 * typed underneath. Tapping it starts talking.
 */

const GLYPHS = "!<>-_\\/[]{}=+*^?#~:;";

interface Ball {
  x: number;
  y: number;
  z: number;
  r: number;
  stem: boolean;
}

/** Grapes in rings that narrow downwards, and a curved stem on top. */
function bunch(): Ball[] {
  const balls: Ball[] = [];
  const rings: [y: number, radius: number, count: number, turn: number][] = [
    [0.62, 0.52, 6, 0],
    [0.62, 0, 1, 0],
    [0.3, 0.5, 6, 0.5],
    [0.3, 0, 1, 0],
    [-0.02, 0.42, 5, 0.2],
    [-0.33, 0.3, 4, 0.7],
    [-0.62, 0.16, 3, 0.1],
    [-0.88, 0, 1, 0],
  ];
  for (const [y, radius, count, turn] of rings) {
    for (let i = 0; i < count; i++) {
      const a = ((i + turn) / count) * Math.PI * 2;
      balls.push({
        x: Math.cos(a) * radius,
        y: y + Math.sin(a * 3) * 0.03,
        z: Math.sin(a) * radius,
        r: 0.25,
        stem: false,
      });
    }
  }
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    balls.push({
      x: Math.sin(s * 1.6) * 0.18,
      y: 0.82 + s * 0.42,
      z: 0,
      r: 0.06 - s * 0.015,
      stem: true,
    });
  }
  return balls;
}

const PURPLE = ["#f6cfe2", "#b4508a", "#6a1d4c", "#2b0820"] as const;

/** One frame: the turning bunch drawn with depth, light and shadow. */
function draw(ctx: CanvasRenderingContext2D, balls: Ball[], t: number, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const yaw = t * 0.5;
  const tilt = 0.32 + Math.sin(t * 0.7) * 0.06;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const bob = Math.sin(t * 1.2) * 0.04;
  const unit = Math.min(w, h) * 0.32;
  const ox = w / 2;
  const oy = h * 0.56;
  const camera = 4.5;
  const project = (b: Ball) => {
    const x = b.x * cy + b.z * sy;
    const z0 = -b.x * sy + b.z * cy;
    const y = b.y * ct - z0 * st + bob;
    const z = b.y * st + z0 * ct;
    const k = camera / (camera - z);
    return { sx: ox + x * unit * k, sy: oy - y * unit * k, z, r: b.r * unit * k, stem: b.stem };
  };
  const placed = balls.map(project);

  // Soft shadow on the "table"
  const shadowY = h * 0.93;
  const g = ctx.createRadialGradient(ox, shadowY, 0, ox, shadowY, unit * 0.75);
  g.addColorStop(0, `rgba(20, 4, 14, ${0.32 - bob})`);
  g.addColorStop(1, "rgba(20, 4, 14, 0)");
  ctx.save();
  ctx.scale(1, 0.22);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ox, shadowY / 0.22, unit * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Stem: a curved woody line through its points
  const stem = placed.filter((p) => p.stem);
  if (stem.length > 1) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#8a6a2e";
    ctx.lineWidth = Math.max(2, (stem[0]?.r ?? 3) * 1.6);
    ctx.beginPath();
    stem.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
    ctx.stroke();
    // A gold leaf that flips as the bunch turns
    const base = stem[Math.floor(stem.length * 0.55)];
    if (base) {
      ctx.save();
      ctx.translate(base.sx, base.sy);
      ctx.rotate(-0.5);
      ctx.scale(Math.max(0.12, Math.abs(cy)), 1);
      const L = unit * 0.42;
      const lg = ctx.createLinearGradient(0, 0, L, 0);
      lg.addColorStop(0, cy > 0 ? "#e6c88d" : "#b0803f");
      lg.addColorStop(1, cy > 0 ? "#b0803f" : "#7a5622");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(L * 0.3, -L * 0.45, L * 0.8, -L * 0.35, L, 0);
      ctx.bezierCurveTo(L * 0.8, L * 0.35, L * 0.3, L * 0.45, 0, 0);
      ctx.fill();
      ctx.strokeStyle = "rgba(60, 40, 10, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(L * 0.92, 0);
      for (const f of [0.3, 0.55, 0.75]) {
        ctx.moveTo(L * f, 0);
        ctx.lineTo(L * (f + 0.12), -L * 0.16);
        ctx.moveTo(L * f, 0);
        ctx.lineTo(L * (f + 0.12), L * 0.16);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // Grapes, far to near
  const grapes = placed.filter((p) => !p.stem).sort((a, b) => a.z - b.z);
  for (const p of grapes) {
    const lx = p.sx - p.r * 0.38;
    const ly = p.sy - p.r * 0.42;
    const body = ctx.createRadialGradient(lx, ly, p.r * 0.05, p.sx, p.sy, p.r);
    body.addColorStop(0, PURPLE[0]);
    body.addColorStop(0.28, PURPLE[1]);
    body.addColorStop(0.78, PURPLE[2]);
    body.addColorStop(1, PURPLE[3]);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
    ctx.fill();
    // Farther grapes sit in shade
    const shade = Math.max(0, Math.min(0.5, (0.35 - p.z) * 0.45));
    if (shade > 0.01) {
      ctx.fillStyle = `rgba(18, 2, 12, ${shade})`;
      ctx.fill();
    }
    // Glossy highlight
    const spec = ctx.createRadialGradient(lx, ly, 0, lx, ly, p.r * 0.32);
    spec.addColorStop(0, "rgba(255, 255, 255, 0.85)");
    spec.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(lx, ly, p.r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // Gold rim light from behind
    ctx.strokeStyle = "rgba(232, 196, 138, 0.28)";
    ctx.lineWidth = Math.max(1, p.r * 0.06);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, p.r * 0.97, 0.15 * Math.PI, 0.65 * Math.PI);
    ctx.stroke();
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Text that resolves out of random glyphs, left to right. */
function scramble(text: string, progress: number) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    const at = i / Math.max(1, text.length);
    if (ch === " " || progress >= at + 0.15) {
      out += ch;
    } else if (progress >= at - 0.25) {
      out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    } else {
      out += " ";
    }
  }
  return out;
}

export function AskAnything({
  title,
  hints,
  onClick,
}: {
  title: string;
  hints: string[];
  onClick: () => void;
}) {
  const reduced = useReducedMotion();
  const balls = useMemo(bunch, []);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!(el && ctx)) {
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth;
    const h = el.clientHeight;
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduced) {
      draw(ctx, balls, 0.8, w, h);
      return;
    }
    let raf = 0;
    let lastText = 0;
    const begin = performance.now();
    const tick = (now: number) => {
      const s = (now - begin) / 1000;
      draw(ctx, balls, 0.8 + s, w, h);
      // The texts only need ~15 updates a second
      if (now - lastText > 66) {
        lastText = now;
        setClock(s);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, balls]);

  // Title: decode in 1.2 s, hold, re-decode every 9 s
  const heading = reduced ? title : scramble(title, (clock % 9) / 1.2);
  // Hints: typed one by one, 4.5 s each
  const hint = hints.length ? (hints[Math.floor(clock / 4.5) % hints.length] ?? "") : "";
  const typed = reduced ? hint : hint.slice(0, Math.floor(((clock % 4.5) / 2.2) * hint.length));

  return (
    <button
      className="mx-auto mt-4 flex w-full flex-col items-center gap-3 outline-none"
      onClick={onClick}
      type="button"
    >
      <canvas aria-hidden="true" className="h-56 w-56" ref={canvas} />
      <span className="font-mono text-(--gold) text-lg uppercase tracking-[0.3em]">
        <span className="sr-only">{title}</span>
        <span aria-hidden="true">{heading}</span>
      </span>
      <span aria-hidden="true" className="h-5 font-mono text-muted-foreground text-xs">
        {typed}
        <span className="ml-0.5 inline-block w-[0.6em] animate-pulse bg-(--gold)/70">&nbsp;</span>
      </span>
    </button>
  );
}
