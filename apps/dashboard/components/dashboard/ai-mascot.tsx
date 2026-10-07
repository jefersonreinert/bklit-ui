"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The assistant's face in the Notion AI spirit: a few crisp ink lines —
 * two brows meeting on an L-shaped nose, two dot eyes — that morph between
 * expressions (idle with blinks, thinking, searching, writing), show a
 * "•••" while it ponders and sign "ℓℓ" by hand. Every pose shares the same
 * path structure so the lines glide from one to the next.
 */

interface Eye {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

interface Pose {
  leftBrow: string;
  rightBrow: string;
  nose: string;
  leftEye: Eye;
  rightEye: Eye;
}

const dot = (cx: number, cy: number, r = 0.95): Eye => ({
  cx,
  cy,
  rx: r,
  ry: r * 1.1,
});

const POSES = {
  idle: {
    leftBrow: "M15.3 10.7 C14 8.9 11.6 8.9 10.6 11.1",
    rightBrow: "M15.3 10.7 C17.6 8.5 21.1 8.6 22.5 11.6",
    nose: "M15.5 10.9 C14.8 14.2 13.8 17.6 12.6 20.9 L17.8 20.7",
    leftEye: dot(12.4, 14.2),
    rightEye: dot(19.2, 14.4),
  },
  thinking: {
    leftBrow: "M15.6 10.1 C14.4 7.6 11.7 7.4 10.3 9.6",
    rightBrow: "M15.6 10.1 C17.6 7.2 21 7.1 22.7 9.4",
    nose: "M15.8 10.3 C15.3 13.8 14.5 17.3 13.4 20.6 L18.4 20.4",
    leftEye: dot(12.4, 12.7),
    rightEye: dot(20.1, 12.9),
  },
  searching: {
    leftBrow: "M15.3 11.6 C14.1 10.4 12.3 9.6 10.2 9.5",
    rightBrow: "M15.3 11.6 C16.9 10.2 19.4 9.4 22.4 9.5",
    nose: "M15.3 11.6 C14.5 14.6 13.4 17.9 12.1 21 L17.2 20.8",
    leftEye: dot(11.4, 14.4),
    rightEye: dot(18.2, 14.6),
  },
  writeA: {
    leftBrow: "M15.2 11.2 C13.8 10.9 12.1 10.9 10.4 11.3",
    rightBrow: "M15.2 11.2 C17.1 10.9 19.6 10.9 22.2 11.4",
    nose: "M15.2 11.2 C14.5 14.4 13.5 17.7 12.3 20.9 L17.5 20.8",
    leftEye: dot(11.2, 15.2),
    rightEye: dot(18.6, 15.4),
  },
  writeB: {
    leftBrow: "M15.5 11 C14.1 10.5 12.3 10.4 10.7 10.8",
    rightBrow: "M15.5 11 C17.4 10.4 19.9 10.4 22.5 10.9",
    nose: "M15.5 11 C14.9 14.3 14 17.6 12.9 20.8 L18.1 20.7",
    leftEye: dot(11.8, 15),
    rightEye: dot(19.3, 15.2),
  },
  writeC: {
    leftBrow: "M15.8 10.9 C14.4 10.3 12.6 10.2 11 10.7",
    rightBrow: "M15.8 10.9 C17.7 10.2 20.2 10.2 22.8 10.8",
    nose: "M15.8 10.9 C15.2 14.2 14.4 17.5 13.4 20.7 L18.6 20.6",
    leftEye: dot(12.6, 15.1),
    rightEye: dot(20.1, 15.3),
  },
  writeD: {
    leftBrow: "M15.5 11.1 C14.1 10.7 12.3 10.7 10.6 11.1",
    rightBrow: "M15.5 11.1 C17.4 10.7 19.9 10.7 22.5 11.2",
    nose: "M15.5 11.1 C14.8 14.4 13.9 17.7 12.8 20.9 L18 20.8",
    leftEye: dot(11.7, 15.4),
    rightEye: dot(19.2, 15.6),
  },
  writeE: {
    leftBrow: "M15.1 11.3 C13.7 11 12 11.1 10.3 11.5",
    rightBrow: "M15.1 11.3 C17 11 19.5 11.1 22.1 11.6",
    nose: "M15.1 11.3 C14.4 14.5 13.4 17.8 12.2 21 L17.4 20.9",
    leftEye: dot(10.9, 15.3),
    rightEye: dot(18.3, 15.5),
  },
} satisfies Record<string, Pose>;

type PoseName = keyof typeof POSES;
type Step = PoseName | "dots" | "signature";

const SEQUENCE: { step: Step; ms: number }[] = [
  { step: "idle", ms: 2600 },
  { step: "thinking", ms: 1300 },
  { step: "searching", ms: 900 },
  { step: "dots", ms: 1300 },
  { step: "writeA", ms: 420 },
  { step: "writeB", ms: 420 },
  { step: "writeC", ms: 420 },
  { step: "writeD", ms: 420 },
  { step: "writeE", ms: 420 },
  { step: "signature", ms: 2200 },
];

const MORPH = { type: "spring", stiffness: 320, damping: 26 } as const;
const BLINK_RY = 0.12;

const SIGNATURE =
  "M6.8 21.4 C9.8 21.4 12.4 16 12.1 11.6 C11.9 8.9 9.7 8.9 9.6 11.6 C9.4 16.2 11.2 21.4 13.6 21.4 C16.6 21.4 19.2 16 18.9 11.6 C18.7 8.9 16.5 8.9 16.4 11.6 C16.2 16.2 18 21.4 20.4 21.4 C22.4 21.4 24 20 25.2 18.2";

function useSequence(still: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (still) {
      return;
    }
    const t = setTimeout(
      () => setIndex((i) => (i + 1) % SEQUENCE.length),
      SEQUENCE[index]?.ms ?? 1000
    );
    return () => clearTimeout(t);
  }, [index, still]);
  return still ? "idle" : (SEQUENCE[index]?.step ?? "idle");
}

/** Two quick blinks while idle. */
function useBlink(active: boolean) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!active) {
      setClosed(false);
      return;
    }
    const timers = [900, 1020, 2000, 2120].map((ms, i) =>
      setTimeout(() => setClosed(i % 2 === 0), ms)
    );
    return () => {
      for (const t of timers) {
        clearTimeout(t);
      }
    };
  }, [active]);
  return closed;
}

function EyeShape({ eye, closed }: { eye: Eye; closed: boolean }) {
  return (
    <motion.ellipse
      animate={{
        cx: eye.cx,
        cy: eye.cy,
        rx: eye.rx,
        ry: closed ? BLINK_RY : eye.ry,
      }}
      className="fill-current"
      cx={eye.cx}
      cy={eye.cy}
      initial={false}
      rx={eye.rx}
      ry={eye.ry}
      stroke="none"
      transition={closed ? { duration: 0.06 } : MORPH}
    />
  );
}

function Face({
  pose,
  blink,
  hidden,
}: {
  pose: Pose;
  blink: boolean;
  hidden: boolean;
}) {
  return (
    <motion.g
      animate={{ opacity: hidden ? 0 : 1 }}
      initial={false}
      transition={{ duration: 0.18 }}
    >
      {[pose.leftBrow, pose.rightBrow, pose.nose].map((d, i) => (
        <motion.path
          animate={{ d }}
          d={d}
          initial={false}
          key={i}
          transition={MORPH}
        />
      ))}
      <EyeShape closed={blink} eye={pose.leftEye} />
      <EyeShape closed={blink} eye={pose.rightEye} />
    </motion.g>
  );
}

function Dots() {
  return (
    <motion.g
      animate={{ opacity: 1 }}
      className="fill-current"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      stroke="none"
      transition={{ duration: 0.18 }}
    >
      {[10.5, 16, 21.5].map((cx, i) => (
        <motion.circle
          animate={{ cy: [16, 14.4, 16] }}
          cx={cx}
          cy={16}
          key={cx}
          r={1.35}
          transition={{
            duration: 0.6,
            delay: i * 0.14,
            ease: "easeInOut",
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
      ))}
    </motion.g>
  );
}

function Signature() {
  return (
    <motion.path
      animate={{ pathLength: 1, opacity: 1 }}
      d={SIGNATURE}
      exit={{ opacity: 0 }}
      initial={{ pathLength: 0, opacity: 1 }}
      transition={{
        pathLength: { duration: 1.5, ease: [0.45, 0, 0.25, 1] },
        opacity: { duration: 0.2 },
      }}
    />
  );
}

const isPose = (step: Step): step is PoseName => step in POSES;

/** The pose on screen: the current one, or the last one while overlays show. */
function useFacePose(step: Step) {
  const [last, setLast] = useState<PoseName>("idle");
  useEffect(() => {
    if (isPose(step)) {
      setLast(step);
    }
  }, [step]);
  return isPose(step) ? step : last;
}

export function AiMascot({ className }: { className?: string }) {
  const still = Boolean(useReducedMotion());
  const step = useSequence(still);
  const blink = useBlink(!still && step === "idle");
  const pose = useFacePose(step);
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "size-8 shrink-0 overflow-visible text-foreground",
        className
      )}
      viewBox="0 0 32 32"
    >
      <circle
        className="fill-card stroke-border"
        cx={16}
        cy={16}
        r={15.25}
        strokeWidth={1}
      />
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      >
        <Face blink={blink} hidden={!isPose(step)} pose={POSES[pose]} />
        <AnimatePresence initial={false}>
          {step === "dots" ? <Dots key="dots" /> : null}
          {step === "signature" ? <Signature key="signature" /> : null}
        </AnimatePresence>
      </g>
    </svg>
  );
}
