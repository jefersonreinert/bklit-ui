"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The assistant's face in the Notion AI spirit: a few ink lines (brows,
 * eyes, nose) in a round badge, drawn like cel animation — the line "boils"
 * a little, brows wave while thinking, eyes blink — and while writing the
 * face turns into cursive loops traced by hand. Ink follows the theme; the
 * little sprout on top is the app's clay.
 */

type Phase = "idle" | "thinking" | "writing";

const CYCLE: { phase: Phase; ms: number }[] = [
  { phase: "idle", ms: 2600 },
  { phase: "thinking", ms: 1400 },
  { phase: "writing", ms: 2600 },
];

const CLAY = "#d97757";
const LEFT_BROW = "M8.4 12.9 Q11.9 9.4 15.9 11.3";
const RIGHT_BROW = "M16.1 11.3 Q20.1 9.4 23.6 12.9";
const NOSE = "M16 11.3 C16.1 14.6 16.9 18 15.1 20.7";
const CURSIVE =
  "M6.6 21.2 C9.6 21.3 12.6 15.4 11.8 10.6 C11.2 7.6 8.8 8.9 9.4 13 C10.1 17.9 11.9 22.2 14.3 21.5 C17.1 20.7 18.9 15.3 18.1 10.6 C17.5 7.6 15.1 8.9 15.7 13 C16.4 17.9 18.2 22.2 20.6 21.5 C22.6 20.9 24.3 19.2 25.4 17.4";

function useCycle(still: boolean | null) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (still) {
      return;
    }
    const t = setTimeout(
      () => setStep((s) => (s + 1) % CYCLE.length),
      CYCLE[step]?.ms ?? 2000
    );
    return () => clearTimeout(t);
  }, [step, still]);
  return still ? "idle" : (CYCLE[step]?.phase ?? "idle");
}

function Face({ phase, still }: { phase: Phase; still: boolean }) {
  const thinking = phase === "thinking";
  const wave = (dir: 1 | -1) =>
    thinking
      ? {
          rotate: [0, -8 * dir, 6 * dir, -4 * dir, 0],
          y: [0, -0.8, 0.2, -0.5, 0],
        }
      : { rotate: 0, y: 0 };
  const waveT = { duration: 1.2, ease: "easeInOut" as const };
  return (
    <motion.g
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      initial={{ opacity: 0, scale: 0.92 }}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      transition={{ duration: 0.25 }}
    >
      <motion.path
        animate={still ? undefined : wave(1)}
        d={LEFT_BROW}
        style={{ transformBox: "fill-box", transformOrigin: "100% 100%" }}
        transition={waveT}
      />
      <motion.path
        animate={still ? undefined : wave(-1)}
        d={RIGHT_BROW}
        style={{ transformBox: "fill-box", transformOrigin: "0% 100%" }}
        transition={{ ...waveT, delay: 0.08 }}
      />
      <path d={NOSE} />
      {[11.7, 20.3].map((x) => (
        <motion.path
          animate={still ? undefined : { scaleY: [1, 1, 0.15, 1] }}
          d={`M${x} 15.2 v1.6`}
          key={x}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          transition={{
            duration: 2.6,
            times: [0, 0.86, 0.9, 0.95],
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
      ))}
    </motion.g>
  );
}

function Writing() {
  return (
    <motion.path
      animate={{ pathLength: 1, opacity: 1 }}
      d={CURSIVE}
      exit={{ opacity: 0 }}
      initial={{ pathLength: 0, opacity: 1 }}
      transition={{
        pathLength: { duration: 1.9, ease: [0.45, 0, 0.3, 1] },
        opacity: { duration: 0.25 },
      }}
    />
  );
}

export function AiMascot({ className }: { className?: string }) {
  const still = Boolean(useReducedMotion());
  const phase = useCycle(still);
  const id = useId().replace(/:/g, "");
  const boil = `ai-boil-${id}`;
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "size-8 shrink-0 overflow-visible text-foreground",
        className
      )}
      viewBox="0 0 32 32"
    >
      {/* Hand-drawn "boil": the ink line wobbles a little, 8 times a second */}
      <defs>
        <filter height="140%" id={boil} width="140%" x="-20%" y="-20%">
          <feTurbulence
            baseFrequency="0.9"
            numOctaves={1}
            result="noise"
            seed={1}
            type="fractalNoise"
          >
            {still ? null : (
              <animate
                attributeName="seed"
                calcMode="discrete"
                dur="0.375s"
                repeatCount="indefinite"
                values="1;4;7"
              />
            )}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={0.55} />
        </filter>
      </defs>

      <circle
        className="fill-card stroke-border"
        cx={16}
        cy={16}
        r={15}
        strokeWidth={1}
      />

      {/* Clay sprout on top, swaying */}
      <motion.g
        animate={still ? undefined : { rotate: [0, 8, -4, 0] }}
        style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
        transition={{
          duration: 3.2,
          ease: "easeInOut",
          repeat: Number.POSITIVE_INFINITY,
        }}
      >
        <path
          d="M16 2.2 C16.2 0.6 17.6 -0.6 19.6 -0.7 C19.4 1.2 18 2.3 16 2.2 Z"
          fill={CLAY}
        />
        <path
          d="M16 2.2 V0.4"
          fill="none"
          stroke={CLAY}
          strokeLinecap="round"
          strokeWidth={0.9}
        />
      </motion.g>

      <g
        fill="none"
        filter={still ? undefined : `url(#${boil})`}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.25}
      >
        <AnimatePresence initial={false} mode="wait">
          {phase === "writing" ? (
            <Writing key="writing" />
          ) : (
            <Face key="face" phase={phase} still={still} />
          )}
        </AnimatePresence>
      </g>
    </svg>
  );
}
