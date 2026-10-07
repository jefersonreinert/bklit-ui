"use client";

import { motion } from "motion/react";
import type { Note } from "@/lib/notes/types";

const SIZE = 220;
const C = SIZE / 2;
const RING = 70;
/** Room for labels left and right of the ring. */
const PAD = 70;

/** The open note in the middle, its linked notes on a ring around it. */
export function NoteRadial({
  note,
  linked,
  onOpen,
}: {
  note: Note;
  linked: Note[];
  onOpen: (n: Note) => void;
}) {
  const shown = linked.slice(0, 12);
  const points = shown.map((n, i) => {
    const angle = (i / Math.max(shown.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      n,
      x: C + Math.cos(angle) * RING,
      y: C + Math.sin(angle) * RING,
      angle,
    };
  });
  return (
    <svg
      aria-label={`Conexões de ${note.title}`}
      className="mx-auto block w-full overflow-visible text-foreground"
      role="img"
      viewBox={`${-PAD} 0 ${SIZE + PAD * 2} ${SIZE}`}
    >
      <circle
        className="text-border"
        cx={C}
        cy={C}
        fill="none"
        r={RING}
        stroke="currentColor"
        strokeDasharray="2 4"
      />
      {points.map((p, i) => (
        <motion.line
          animate={{ pathLength: 1, opacity: 0.5 }}
          initial={{ pathLength: 0, opacity: 0 }}
          key={`l-${note.id}-${p.n.id}`}
          stroke="#d97757"
          strokeWidth={1}
          transition={{ delay: 0.1 + i * 0.04, duration: 0.5 }}
          x1={C}
          x2={p.x}
          y1={C}
          y2={p.y}
        />
      ))}
      {points.map((p, i) => {
        const right = Math.cos(p.angle) >= 0;
        return (
          <motion.g
            animate={{ opacity: 1, scale: 1 }}
            className="cursor-pointer"
            initial={{ opacity: 0, scale: 0 }}
            key={`n-${note.id}-${p.n.id}`}
            onClick={() => onOpen(p.n)}
            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            transition={{
              delay: 0.2 + i * 0.05,
              type: "spring",
              stiffness: 260,
              damping: 18,
            }}
          >
            <circle cx={p.x} cy={p.y} fill="#9cc46b" r={7} />
            <circle
              cx={p.x}
              cy={p.y}
              fill="none"
              opacity={0.35}
              r={11}
              stroke="#9cc46b"
            />
            <text
              className="fill-current text-[9px]"
              dominantBaseline="middle"
              opacity={0.75}
              textAnchor={right ? "start" : "end"}
              x={p.x + (right ? 15 : -15)}
              y={p.y}
            >
              {p.n.title.length > 18 ? `${p.n.title.slice(0, 17)}…` : p.n.title}
            </text>
          </motion.g>
        );
      })}
      <motion.circle
        animate={{ scale: [1, 1.08, 1] }}
        cx={C}
        cy={C}
        fill="#d97757"
        r={13}
        style={{ transformOrigin: `${C}px ${C}px` }}
        transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY }}
      />
      <circle cx={C} cy={C} fill="none" opacity={0.3} r={20} stroke="#d97757" />
      {shown.length === 0 ? (
        <text
          className="fill-current text-[9px]"
          opacity={0.6}
          textAnchor="middle"
          x={C}
          y={C + 36}
        >
          Sem conexões ainda
        </text>
      ) : null}
    </svg>
  );
}
