"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The assistant's little face: blinks, bobs and writes by hand — a pencil
 * traces a squiggle that appears stroke by stroke, then starts over.
 * Clay/beige from the app palette; still when reduced motion is on.
 */

const CLAY = "#d97757";
const CLAY_DARK = "#b8573a";
const INK = "#2b1d16";
const PAPER = "#f2c4a8";

const WRITE_S = 2.8;
// Handwriting squiggle sampled as points; the pencil tip follows them.
const POINTS = Array.from({ length: 9 }, (_, i) => {
  const t = i / 8;
  return { x: 5 + t * 18, y: 28.2 + Math.sin(t * Math.PI * 3) * 1.4 };
});
const SQUIGGLE = POINTS.reduce(
  (d, p, i) =>
    i === 0 ? `M${p.x} ${p.y}` : `${d} L${p.x.toFixed(2)} ${p.y.toFixed(2)}`,
  ""
);
// Write (0–70%), hold (70–88%), lift and return (88–100%)
const WRITE_TIMES = [...POINTS.map((_, i) => (i / 8) * 0.7), 0.88, 1];
const PEN_X = [...POINTS.map((p) => p.x - 5), 18, 0];
const PEN_Y = [...POINTS.map((p) => p.y - 28.2), -2.5, 0];

export function AiMascot({ className }: { className?: string }) {
  const still = useReducedMotion();
  const loop = { repeat: Number.POSITIVE_INFINITY };
  return (
    <svg
      aria-hidden="true"
      className={cn("size-7 shrink-0 overflow-visible", className)}
      viewBox="0 0 32 32"
    >
      {/* Head */}
      <motion.g
        animate={still ? undefined : { y: [0, -0.7, 0] }}
        transition={{ duration: WRITE_S / 2, ease: "easeInOut", ...loop }}
      >
        <path
          d="M16 3.5c6.6 0 10.5 4.2 10.5 9.6 0 5.5-4.3 9.2-10.5 9.2S5.5 18.6 5.5 13.1C5.5 7.7 9.4 3.5 16 3.5Z"
          fill={CLAY}
        />
        <path
          d="M16 3.5c6.6 0 10.5 4.2 10.5 9.6 0 1.4-.3 2.7-.8 3.8C24.6 11 21 7.6 15.6 7.6c-3.6 0-6.6 1.5-8.6 3.9C7.6 6.9 11 3.5 16 3.5Z"
          fill="#fff"
          opacity={0.14}
        />
        {/* Cheeks */}
        <circle cx={9.6} cy={15.4} fill={PAPER} opacity={0.55} r={1.5} />
        <circle cx={22.4} cy={15.4} fill={PAPER} opacity={0.55} r={1.5} />
        {/* Eyes looking down at the writing, blinking */}
        {[12.2, 19.8].map((cx) => (
          <motion.ellipse
            animate={still ? undefined : { scaleY: [1, 1, 0.12, 1, 1] }}
            cx={cx}
            cy={13.2}
            fill={INK}
            key={cx}
            rx={1.35}
            ry={1.75}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            transition={{
              duration: 3.4,
              times: [0, 0.82, 0.86, 0.9, 1],
              ...loop,
            }}
          />
        ))}
        <path
          d="M13.8 17.2q2.2 1.6 4.4 0"
          fill="none"
          stroke={INK}
          strokeLinecap="round"
          strokeWidth={1.1}
        />
      </motion.g>

      {/* Handwriting */}
      <motion.path
        animate={
          still
            ? undefined
            : { pathLength: [0, 1, 1, 0], opacity: [1, 1, 1, 0] }
        }
        d={SQUIGGLE}
        fill="none"
        initial={{ pathLength: still ? 1 : 0 }}
        stroke={CLAY_DARK}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.4}
        transition={{
          duration: WRITE_S,
          times: [0, 0.7, 0.88, 1],
          ease: "linear",
          ...loop,
        }}
      />

      {/* Pencil; its tip rides along the squiggle */}
      <motion.g
        animate={still ? undefined : { x: PEN_X, y: PEN_Y }}
        transition={{
          duration: WRITE_S,
          times: WRITE_TIMES,
          ease: "linear",
          ...loop,
        }}
      >
        <g transform="translate(5 28.2) rotate(-38)">
          <rect
            fill={PAPER}
            height={2.6}
            rx={0.5}
            width={8.5}
            x={1.6}
            y={-1.3}
          />
          <rect
            fill={CLAY}
            height={2.6}
            rx={0.5}
            width={1.6}
            x={8.6}
            y={-1.3}
          />
          <path d="M1.6 -1.3 L0 0 L1.6 1.3 Z" fill={INK} />
        </g>
      </motion.g>
    </svg>
  );
}
