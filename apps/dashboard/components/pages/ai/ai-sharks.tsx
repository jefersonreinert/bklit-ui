"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { OceanEngine, type SharkSpec } from "@/lib/ascii-sharks";

/**
 * ASCII sharks swimming behind the Assistente IA welcome screen
 * (stackedlol/ascii-sharks, MIT, vendored in lib/ascii-sharks). Purely
 * decorative: the canvas ignores clicks (the fish still flee the cursor),
 * keeps a calm pool in the middle for the greeting, and blends into the
 * page (screen on dark, multiply on light). Reduced motion = still frame.
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

function Ocean({ theme }: { theme: "dark" | "light" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    const engine = new OceanEngine(canvas, SHARKS, { theme, contain: true });
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
  const dark = resolvedTheme !== "light";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{
        mixBlendMode: dark ? "screen" : "multiply",
        opacity: dark ? 0.75 : 0.4,
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
