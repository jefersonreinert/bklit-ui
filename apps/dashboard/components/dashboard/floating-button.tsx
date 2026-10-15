"use client";

import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

/**
 * A round button that floats over the page and can be dragged anywhere on
 * the screen with a finger; it stays where it is dropped (saved per device).
 * A tap (no drag) runs `onTap`. Used on phones instead of the top header and
 * bottom tab bars, so pages get the whole screen.
 */

const MARGIN = 8;
/** Finger travel (px) before a touch counts as a drag instead of a tap. */
const DRAG_SLOP = 6;
const MOVED = "cb:floating-moved";

export interface FloatPos {
  /** Left edge as a fraction (0–1) of the free horizontal space. */
  fx: number;
  /** Top edge as a fraction (0–1) of the free vertical space. */
  fy: number;
}

interface Insets {
  top: number;
  bottom: number;
}

/** The iPhone status bar / home indicator areas, read from CSS env(). */
function safeInsets(): Insets {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: Number.parseFloat(style.paddingTop) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
  };
  probe.remove();
  return insets;
}

/** The area the button may occupy, given its size. */
function bounds(size: number, insets: Insets) {
  const minX = MARGIN;
  const minY = insets.top + MARGIN;
  const maxX = Math.max(minX, window.innerWidth - size - MARGIN);
  const maxY = Math.max(
    minY,
    window.innerHeight - size - MARGIN - insets.bottom
  );
  return { minX, minY, maxX, maxY };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Pixel position from a saved fraction (and back), clamped to the screen. */
export function toPixels(pos: FloatPos, size: number, insets: Insets) {
  const b = bounds(size, insets);
  return {
    x: b.minX + clamp(pos.fx, 0, 1) * (b.maxX - b.minX),
    y: b.minY + clamp(pos.fy, 0, 1) * (b.maxY - b.minY),
  };
}

export function toFraction(
  x: number,
  y: number,
  size: number,
  insets: Insets
): FloatPos {
  const b = bounds(size, insets);
  return {
    fx: b.maxX > b.minX ? clamp((x - b.minX) / (b.maxX - b.minX), 0, 1) : 0,
    fy: b.maxY > b.minY ? clamp((y - b.minY) / (b.maxY - b.minY), 0, 1) : 0,
  };
}

function load(key: string, fallback: FloatPos): FloatPos {
  try {
    const saved = JSON.parse(
      localStorage.getItem(key) ?? "null"
    ) as Partial<FloatPos> | null;
    if (
      saved &&
      typeof saved.fx === "number" &&
      typeof saved.fy === "number" &&
      Number.isFinite(saved.fx) &&
      Number.isFinite(saved.fy)
    ) {
      return { fx: clamp(saved.fx, 0, 1), fy: clamp(saved.fy, 0, 1) };
    }
  } catch {
    // private mode or bad JSON: use the default spot
  }
  return fallback;
}

function save(key: string, pos: FloatPos) {
  try {
    localStorage.setItem(key, JSON.stringify(pos));
  } catch {
    // private mode: the position just isn't remembered
  }
}

/**
 * Position state of a draggable floating button. Returns where it is (px),
 * the pointer handlers and whether the last gesture was a drag.
 */
export function useFloatingPosition(
  storageKey: string,
  fallback: FloatPos,
  size: number
) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const insets = useRef<Insets>({ top: 0, bottom: 0 });
  const frac = useRef<FloatPos>(fallback);
  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  /** Set when a drag just ended, so the click that follows is ignored. */
  const dragged = useRef(false);

  const fallbackX = fallback.fx;
  const fallbackY = fallback.fy;
  useEffect(() => {
    insets.current = safeInsets();
    frac.current = load(storageKey, { fx: fallbackX, fy: fallbackY });
    const place = () => setPos(toPixels(frac.current, size, insets.current));
    place();
    // Keep the same relative spot when the phone rotates
    const onResize = () => {
      insets.current = safeInsets();
      place();
    };
    // Another copy of the same button (e.g. on a hidden tab) was moved
    const onMoved = (e: Event) => {
      if ((e as CustomEvent<string>).detail === storageKey) {
        frac.current = load(storageKey, frac.current);
        place();
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener(MOVED, onMoved);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener(MOVED, onMoved);
    };
  }, [storageKey, fallbackX, fallbackY, size]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!pos || (e.pointerType === "mouse" && e.button !== 0)) {
        return;
      }
      gesture.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) {
        return;
      }
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_SLOP) {
        return;
      }
      if (!g.moved) {
        g.moved = true;
        setDragging(true);
      }
      const b = bounds(size, insets.current);
      const next = {
        x: clamp(g.originX + dx, b.minX, b.maxX),
        y: clamp(g.originY + dy, b.minY, b.maxY),
      };
      last.current = next;
      setPos(next);
    },
    [size]
  );

  const finish = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) {
        return;
      }
      gesture.current = null;
      if (!g.moved) {
        return;
      }
      dragged.current = true;
      setDragging(false);
      const p = last.current;
      if (p) {
        frac.current = toFraction(p.x, p.y, size, insets.current);
        save(storageKey, frac.current);
        window.dispatchEvent(new CustomEvent(MOVED, { detail: storageKey }));
      }
    },
    [size, storageKey]
  );

  /** True (once) when the click being handled ended a drag. */
  const consumeDrag = useCallback(() => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }, []);

  return {
    pos,
    dragging,
    consumeDrag,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}

export function FloatingButton({
  storageKey,
  fallback,
  size = 48,
  label,
  onTap,
  className,
  children,
  expanded,
  panel,
}: {
  /** localStorage key where the dropped position is remembered. */
  storageKey: string;
  /** Where it starts before the user moves it. */
  fallback: FloatPos;
  size?: number;
  label: string;
  onTap: () => void;
  className?: string;
  children: ReactNode;
  /** For a button that opens a menu: whether it is open. */
  expanded?: boolean;
  /**
   * Content shown next to the button (e.g. its menu), given which way it
   * should open so it stays on screen.
   */
  panel?: (side: { below: boolean; right: boolean }) => ReactNode;
}) {
  const { pos, dragging, consumeDrag, handlers } = useFloatingPosition(
    storageKey,
    fallback,
    size
  );
  if (!pos) {
    return null;
  }
  const style: CSSProperties = {
    left: pos.x,
    top: pos.y,
    width: size,
    height: size,
  };
  // Open the panel toward the larger free area
  const below = pos.y + size / 2 < window.innerHeight / 2;
  const right = pos.x + size / 2 < window.innerWidth / 2;

  return (
    <div className="fixed z-50 print:hidden" style={style}>
      <button
        aria-expanded={expanded}
        aria-label={label}
        className={cn(
          "flex size-full touch-none select-none items-center justify-center rounded-full border bg-background/75 text-foreground shadow-black/25 shadow-lg backdrop-blur-xl transition-transform [-webkit-touch-callout:none]",
          dragging ? "scale-110 cursor-grabbing" : "active:scale-95",
          className
        )}
        onClick={() => {
          if (!consumeDrag()) {
            onTap();
          }
        }}
        title={`${label} · arraste para mover`}
        type="button"
        {...handlers}
      >
        {children}
      </button>
      {panel && !dragging ? panel({ below, right }) : null}
    </div>
  );
}
