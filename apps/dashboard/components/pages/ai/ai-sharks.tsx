"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { OceanEngine, type SharkSpec } from "@/lib/ascii-sharks";

/**
 * ASCII sharks swimming behind the Assistente IA welcome screen
 * (stackedlol/ascii-sharks, MIT, vendored unchanged in lib/ascii-sharks).
 * Purely decorative: the canvas ignores clicks (the fish still flee the
 * cursor), keeps a calm pool in the middle for the greeting and follows the
 * app theme (dark = black stage palette; beige and light = paper palette).
 * Reduced motion = one still frame.
 */

/** The upstream chat hero cast. */
const SHARKS: SharkSpec[] = [
  { kind: "whale", size: 1.05 },
  { kind: "greathammer", size: 0.95 },
  { kind: "whale", size: 0.88 },
  { kind: "thresher", size: 0.85 },
  { kind: "hammerhead", size: 0.85 },
  { kind: "tiger", size: 0.78 },
  { kind: "hammerhead", size: 0.76 },
];

/** Internals of the upstream renderer we adjust from outside. */
interface RendererInternals {
  palette: { bg: string };
  bg: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  paintBackground: () => void;
  render: (world: unknown, dt: number) => void;
}

/**
 * Upstream paints its own black/paper stage on an opaque canvas. Here the
 * canvas is transparent and every frame is cleared, so the app's own
 * background (dark glow, beige, light) shows through unchanged.
 */
function seeThrough(engine: OceanEngine) {
  const r = engine.renderer as unknown as RendererInternals;
  r.palette = { ...r.palette, bg: "rgba(0,0,0,0)" };
  const paint = r.paintBackground.bind(r);
  r.paintBackground = () => {
    const g = r.bg.getContext("2d");
    g?.setTransform(1, 0, 0, 1, 0, 0);
    g?.clearRect(0, 0, r.bg.width, r.bg.height);
    paint();
  };
  r.paintBackground();
  const draw = r.render.bind(r);
  r.render = (world, dt) => {
    r.ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.ctx.clearRect(0, 0, r.ctx.canvas.width, r.ctx.canvas.height);
    draw(world, dt);
  };
}

function Ocean({ theme }: { theme: "dark" | "light" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    // The engine asks for an opaque context; taking a transparent one first
    // makes it reuse this one
    canvas.getContext("2d", { alpha: true });
    const engine = new OceanEngine(canvas, SHARKS, { theme, contain: true });
    seeThrough(engine);
    return () => engine.destroy();
  }, [theme]);
  return (
    <canvas
      className="block size-full"
      ref={ref}
      style={{
        fontFamily: "var(--font-geist-mono, ui-monospace), Menlo, monospace",
      }}
    />
  );
}

export function AiSharks() {
  const { resolvedTheme } = useTheme();
  // Three app themes: dark uses the black-stage colours, beige and light the paper ones
  const dark = resolvedTheme === "dark";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{
        opacity: dark ? 0.6 : 0.45,
        // Fade the edges into the page
        maskImage:
          "radial-gradient(ellipse 75% 70% at 50% 50%, black 55%, transparent 100%)",
      }}
    >
      {resolvedTheme ? (
        <Ocean key={dark ? "dark" : "light"} theme={dark ? "dark" : "light"} />
      ) : null}
    </div>
  );
}
