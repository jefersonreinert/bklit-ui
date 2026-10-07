"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A pixel-art crab in the spirit of Clawd, Claude Code's terminal mascot:
 * an orange block with dark eyes, side claws and four little legs. It walks
 * back and forth along a floor, turning around at each end, hops now and
 * then and blinks.
 */

const ORANGE = "#d97757";
const EYE = "#141413";
const LOOP = Number.POSITIVE_INFINITY;

function Legs({ still, delay }: { still: boolean; delay: number }) {
  return (
    <motion.g
      animate={still ? undefined : { y: [0, -0.9, 0] }}
      transition={{ duration: 0.36, delay, repeat: LOOP, ease: "easeInOut" }}
    >
      {[0, 5].map((dx) => (
        <rect
          fill={ORANGE}
          height={2}
          key={dx}
          width={1}
          x={(delay ? 4 : 2) + dx}
          y={5}
        />
      ))}
    </motion.g>
  );
}

function Body({ still }: { still: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="block h-auto w-full overflow-visible"
      shapeRendering="crispEdges"
      viewBox="0 0 12 7"
    >
      <Legs delay={0} still={still} />
      <Legs delay={0.18} still={still} />
      <motion.g
        animate={still ? undefined : { y: [0, -0.35, 0] }}
        transition={{ duration: 0.18, repeat: LOOP, ease: "easeInOut" }}
      >
        <rect fill={ORANGE} height={2} width={12} x={0} y={2} />
        <rect fill={ORANGE} height={5} width={10} x={1} y={0} />
        <motion.g
          animate={still ? undefined : { scaleY: [1, 1, 0.15, 1, 1] }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          transition={{
            duration: 3.4,
            repeat: LOOP,
            times: [0, 0.9, 0.93, 0.96, 1],
          }}
        >
          <rect fill={EYE} height={2} width={1} x={3} y={1} />
          <rect fill={EYE} height={2} width={1} x={8} y={1} />
        </motion.g>
      </motion.g>
    </svg>
  );
}

export function ClawdWalker({ className }: { className?: string }) {
  const still = Boolean(useReducedMotion());
  return (
    <div
      aria-hidden="true"
      className={cn("relative h-44 w-80 max-w-full overflow-hidden", className)}
    >
      <div className="absolute inset-x-6 bottom-3 border-foreground/15 border-b-2 border-dashed" />
      <motion.div
        animate={
          still
            ? undefined
            : {
                x: ["-100px", "100px", "100px", "-100px", "-100px"],
                scaleX: [1, 1, -1, -1, 1],
              }
        }
        className="absolute bottom-4 left-1/2 -ml-14 w-28"
        transition={{
          duration: 9,
          repeat: LOOP,
          ease: "linear",
          times: [0, 0.48, 0.5, 0.98, 1],
        }}
      >
        <motion.div
          animate={
            still
              ? undefined
              : {
                  y: [0, 0, 3, -48, 0, 2, 0],
                  scaleY: [1, 1, 0.82, 1.08, 1, 0.88, 1],
                }
          }
          style={{ transformOrigin: "50% 100%" }}
          transition={{
            duration: 3,
            repeat: LOOP,
            ease: "easeOut",
            times: [0, 0.62, 0.68, 0.8, 0.92, 0.96, 1],
          }}
        >
          <Body still={still} />
        </motion.div>
      </motion.div>
    </div>
  );
}
