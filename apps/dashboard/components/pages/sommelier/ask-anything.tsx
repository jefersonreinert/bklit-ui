"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The empty-chat hero of the sommelier page: an ASCII wine glass whose
 * wine swirls, and "ask anything" decoding itself out of random glyphs,
 * with hint questions typed underneath. Tapping it starts talking.
 */

const COLS = 34;
const ROWS = 14;
const CX = 16.5;
/** Half width of the bowl per row (rim at row 0, stem below row 8). */
const BOWL = [10, 11, 11.5, 11.5, 11, 10, 8.5, 6.5, 3.5];
const LEVEL = 3.2;
const RAMP = ".:-=+*#%";
const GLYPHS = "!<>-_\\/[]{}=+*^?#~:;";

type Cell = [kind: "o" | "w" | "s" | "b" | " ", ch: string];

function frame(t: number): Cell[][] {
  const rows: Cell[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < COLS; x++) {
      row.push([" ", " "]);
    }
    rows.push(row);
  }
  const put = (x: number, y: number, kind: Cell[0], ch: string) => {
    const cell = rows[y]?.[x];
    if (cell) {
      cell[0] = kind;
      cell[1] = ch;
    }
  };

  BOWL.forEach((hw, y) => {
    const left = Math.round(CX - hw);
    const right = Math.round(CX + hw);
    if (y === 0) {
      for (let x = left; x <= right; x++) {
        put(x, y, "o", x === left || x === right ? "." : "-");
      }
      return;
    }
    const narrowing = y >= 5;
    put(left, y, "o", narrowing ? "\\" : "|");
    put(right, y, "o", narrowing ? "/" : "|");
    for (let x = left + 1; x < right; x++) {
      // The wine's surface swirls; deeper wine is denser
      const surface = LEVEL + Math.sin(x * 0.45 + t * 2.2) * 0.55 + Math.sin(x * 0.17 - t * 1.3) * 0.35;
      if (y < surface - 0.5) {
        // Light on the glass, now and then
        const glint = Math.sin(x * 1.7 + y * 2.3 + t * 1.1);
        if (glint > 0.985) {
          put(x, y, "s", "*");
        }
        continue;
      }
      if (y < surface + 0.5) {
        put(x, y, "w", Math.sin(x * 0.9 + t * 4) > 0 ? "~" : "-");
        continue;
      }
      const depth = (y - surface) / (BOWL.length - surface);
      const shimmer = Math.sin(x * 0.7 + y * 1.3 + t * 3) * 0.18;
      const i = Math.max(0, Math.min(RAMP.length - 1, Math.floor((depth + 0.25 + shimmer) * RAMP.length)));
      put(x, y, "w", RAMP[i] ?? ".");
    }
  });

  // Bubbles rising through the wine
  for (let k = 0; k < 3; k++) {
    const speed = 0.6 + k * 0.25;
    const life = ((t * speed + k * 1.7) % 4) / 4;
    const y = Math.round(BOWL.length - 1 - life * (BOWL.length - LEVEL - 1));
    const hw = BOWL[y] ?? 4;
    const x = Math.round(CX + Math.sin(k * 2.1 + t * 0.8) * (hw - 3));
    if (y > LEVEL + 0.6) {
      put(x, y, "b", life > 0.6 ? "o" : ".");
    }
  }

  // Stem and foot
  for (let y = BOWL.length; y < ROWS - 1; y++) {
    put(Math.floor(CX), y, "o", "|");
    put(Math.ceil(CX), y, "o", "|");
  }
  const foot = "'-.______.-'";
  const start = Math.round(CX - foot.length / 2 + 0.5);
  for (let i = 0; i < foot.length; i++) {
    put(start + i, ROWS - 1, "o", foot[i] ?? " ");
  }
  return rows;
}

const KIND_CLASS: Record<Cell[0], string> = {
  o: "text-foreground/35",
  w: "text-(--gold)",
  s: "text-(--gold)/80",
  b: "text-foreground/60",
  " ": "",
};

function Row({ cells }: { cells: Cell[] }) {
  // Runs of the same kind share one span
  const runs: { kind: Cell[0]; text: string }[] = [];
  for (const [kind, ch] of cells) {
    const last = runs.at(-1);
    if (last && last.kind === kind) {
      last.text += ch;
    } else {
      runs.push({ kind, text: ch });
    }
  }
  return (
    <div>
      {runs.map((r, i) => (
        <span className={KIND_CLASS[r.kind]} key={`${i}-${r.kind}`}>
          {r.text}
        </span>
      ))}
    </div>
  );
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
  const [t, setT] = useState(0);
  const begin = useRef(0);

  useEffect(() => {
    if (reduced) {
      setT(1.2);
      return;
    }
    let raf = 0;
    let last = 0;
    begin.current = performance.now();
    const tick = (now: number) => {
      // ~15 fps is plenty for ASCII and kind to phone batteries
      if (now - last > 66) {
        last = now;
        setT((now - begin.current) / 1000);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const rows = frame(t);
  // Title: decode in 1.2 s, hold, re-decode every 9 s
  const cycle = reduced ? 9 : t % 9;
  const heading = scramble(title, cycle / 1.2);
  // Hints: typed one by one, 4.5 s each
  const hint = hints.length ? hints[Math.floor(t / 4.5) % hints.length] ?? "" : "";
  const typed = reduced ? hint : hint.slice(0, Math.floor(((t % 4.5) / 2.2) * hint.length));

  return (
    <button
      className="mx-auto mt-6 flex w-full flex-col items-center gap-4 outline-none"
      onClick={onClick}
      type="button"
    >
      <pre
        aria-hidden="true"
        className="select-none font-mono text-[11px] leading-[1.15] sm:text-[12px]"
      >
        {rows.map((r, y) => (
          <Row cells={r} key={y} />
        ))}
      </pre>
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
