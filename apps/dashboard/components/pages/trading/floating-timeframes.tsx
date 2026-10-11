"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";
import { TIMEFRAMES, type Timeframe } from "@/lib/markets/trading";
import { cn } from "@/lib/utils";

/**
 * Minimal timeframe picker floating over the chart: a small chip with the
 * current timeframe that expands into the full list. Drag it anywhere on
 * the chart; the spot is remembered on this device.
 */

const POS_KEY = "cb:trading:tf-pos";
/** Pointer travel (px) before a press becomes a drag instead of a tap. */
const DRAG_PX = 5;

interface Pos {
  /** Fractions of the chart box, so the chip survives resizes. */
  x: number;
  y: number;
}

const DEFAULT_POS: Pos = { x: 0.02, y: 0.06 };

function readPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    const p = raw ? (JSON.parse(raw) as Pos) : null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      return p;
    }
  } catch {
    // Storage unavailable: use the default spot.
  }
  return DEFAULT_POS;
}

function savePos(p: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    // Not critical.
  }
}

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

export function FloatingTimeframes({
  tf,
  onTf,
}: {
  tf: Timeframe;
  onTf: (tf: Timeframe) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    from: Pos;
    moved: boolean;
  } | null>(null);
  const [pos, setPos] = useState<Pos>(DEFAULT_POS);
  const [open, setOpen] = useState(false);

  useEffect(() => setPos(readPos()), []);

  const parentSize = () => {
    const parent = box.current?.parentElement;
    const self = box.current;
    if (!(parent && self)) {
      return null;
    }
    return {
      w: Math.max(1, parent.clientWidth - self.offsetWidth),
      h: Math.max(1, parent.clientHeight - self.offsetHeight),
    };
  };

  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      from: pos,
      moved: false,
    };
  };

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const size = parentSize();
    if (!(d && size)) {
      return;
    }
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) {
      return;
    }
    d.moved = true;
    setPos({
      x: clamp(d.from.x + dx / size.w),
      y: clamp(d.from.y + dy / size.h),
    });
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) {
      return;
    }
    if (d.moved) {
      setPos((p) => {
        savePos(p);
        return p;
      });
    } else {
      setOpen((o) => !o);
    }
  };

  const current = TIMEFRAMES.find((t) => t.id === tf);
  // Open the list towards the free side of the chart.
  const right = pos.x > 0.5;

  return (
    <div
      className="absolute z-20 flex items-center gap-px"
      ref={box}
      style={{
        // left/top x% of the chart minus x% of the chip keeps it inside.
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: `translate(${-pos.x * 100}%, ${-pos.y * 100}%)`,
        flexDirection: right ? "row-reverse" : "row",
      }}
    >
      <button
        aria-expanded={open}
        aria-label={`Tempo gráfico: ${current?.name ?? tf}. Toque para mudar, arraste para mover`}
        className="h-7 cursor-grab touch-none select-none border bg-background/85 px-2.5 font-semibold text-[12px] shadow-sm backdrop-blur active:cursor-grabbing"
        onPointerCancel={onUp}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        type="button"
      >
        {current?.label ?? tf}
      </button>
      {open ? (
        <div className="no-scrollbar flex max-w-[calc(100vw-6rem)] overflow-x-auto border bg-background/85 shadow-sm backdrop-blur">
          {TIMEFRAMES.map((t) => (
            <button
              className={cn(
                "h-[26px] shrink-0 px-2 text-[12px] text-muted-foreground hover:text-foreground",
                t.id === tf && "font-semibold text-foreground"
              )}
              key={t.id}
              onClick={() => {
                onTf(t.id);
                setOpen(false);
              }}
              title={t.name}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
