"use client";

import { useEffect, useState } from "react";
import { StippleArt } from "./stipple";

/**
 * The empty-chat hero of the sommelier page: stippled wine drawings in
 * the style of the house menu, the dust flowing from one to the next,
 * with "ask anything" decoding itself out of random glyphs and hint
 * questions typed underneath. Tapping it starts talking.
 */

const GLYPHS = "!<>-_\\/[]{}=+*^?#~:;";

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
  const [clock, setClock] = useState(0);

  useEffect(() => {
    if (reduced) {
      return;
    }
    const begin = performance.now();
    // The texts only need ~15 updates a second
    const timer = setInterval(() => setClock((performance.now() - begin) / 1000), 66);
    return () => clearInterval(timer);
  }, [reduced]);

  // Title: decode in 1.2 s, hold, re-decode every 9 s
  const heading = reduced ? title : scramble(title, (clock % 9) / 1.2);
  // Hints: typed one by one, 4.5 s each
  const hint = hints.length ? (hints[Math.floor(clock / 4.5) % hints.length] ?? "") : "";
  const typed = reduced ? hint : hint.slice(0, Math.floor(((clock % 4.5) / 2.2) * hint.length));

  return (
    <button
      className="m-auto flex w-full flex-col items-center gap-3 py-4 outline-none"
      onClick={onClick}
      type="button"
    >
      <StippleArt className="h-72 w-72" />
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
