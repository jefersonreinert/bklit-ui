"use client";

import { type PointerEvent, useId, useMemo, useState } from "react";
import type { HistoryPoint, RangeId } from "@/lib/markets/history";
import { formatPx } from "@/lib/markets/trading";

/**
 * TradingView-style overview chart: area line of closes, dashed previous
 * close (1D) or period start, and a finger/mouse scrubber with price and
 * date.
 */

const W = 600;
const H = 260;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;
const PAD_LEFT = 44;

function when(t: number, range: RangeId) {
  const d = new Date(t);
  if (range === "1D" || range === "5D") {
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function axisLabel(t: number, range: RangeId) {
  const d = new Date(t);
  if (range === "1D") {
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (range === "5D" || range === "1M") {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }
  if (range === "5Y" || range === "ALL") {
    return String(d.getFullYear());
  }
  return d.toLocaleDateString("pt-BR", { month: "short" });
}

/** ~4 nice price levels inside [min, max]. */
function ticks(min: number, max: number) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    out.push(v);
  }
  return out;
}

function anchorFor(i: number) {
  if (i === 0) {
    return "start";
  }
  return i === 4 ? "end" : "middle";
}

export function RangeChart({
  points,
  baseline,
  range,
  digits,
  up,
}: {
  points: HistoryPoint[];
  baseline: number | null;
  range: RangeId;
  digits: number;
  up: boolean;
}) {
  const gradient = useId();
  const [hover, setHover] = useState<number | null>(null);
  const geo = useMemo(() => {
    const closes = points.map((p) => p.c);
    let min = Math.min(...closes, baseline ?? Number.POSITIVE_INFINITY);
    let max = Math.max(...closes, baseline ?? Number.NEGATIVE_INFINITY);
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.01 || 1;
    min -= pad;
    max += pad;
    const x = (i: number) =>
      PAD_LEFT + (i / Math.max(1, points.length - 1)) * (W - PAD_LEFT - 4);
    const y = (v: number) =>
      PAD_TOP + (1 - (v - min) / (max - min)) * (H - PAD_TOP - PAD_BOTTOM);
    const line = points
      .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.c).toFixed(1)}`)
      .join("");
    const area = `${line}L${x(points.length - 1).toFixed(1)} ${H - PAD_BOTTOM}L${x(0).toFixed(1)} ${H - PAD_BOTTOM}Z`;
    const labels = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const i = Math.round(f * (points.length - 1));
      return { x: x(i), text: points[i] ? axisLabel(points[i].t, range) : "" };
    });
    return { x, y, line, area, levels: ticks(min, max), labels };
  }, [points, baseline, range]);

  if (points.length < 2) {
    return null;
  }
  const color = up ? "var(--up)" : "var(--down)";
  const last = points.length - 1;
  const at = hover ?? last;
  const p = points[at];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - box.left) / box.width) * W;
    const f = (fx - PAD_LEFT) / (W - PAD_LEFT - 4);
    setHover(Math.max(0, Math.min(last, Math.round(f * last))));
  };

  return (
    <div className="relative select-none">
      <div className="pointer-events-none absolute top-0 left-12 z-10 flex gap-2 text-[11px] text-muted-foreground">
        {hover !== null && p ? (
          <>
            <span className="font-medium text-foreground tabular-nums">
              {formatPx(p.c, digits)}
            </span>
            <span>{when(p.t, range)}</span>
          </>
        ) : null}
      </div>
      <svg
        aria-label="Gráfico do período"
        className="h-56 w-full touch-pan-y md:h-64"
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        onPointerMove={onMove}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse") {
            setHover(null);
          }
        }}
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${W} ${H}`}
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {geo.levels.map((v) => (
          <text
            className="fill-muted-foreground text-[13px]"
            key={v}
            x={2}
            y={geo.y(v) + 4}
          >
            {formatPx(v, digits > 2 ? Math.min(digits, 4) : 0)}
          </text>
        ))}
        {baseline == null ? null : (
          <line
            stroke="currentColor"
            strokeDasharray="5 5"
            strokeOpacity="0.45"
            x1={PAD_LEFT}
            x2={W}
            y1={geo.y(baseline)}
            y2={geo.y(baseline)}
          />
        )}
        <path d={geo.area} fill={`url(#${gradient})`} />
        <path
          d={geo.line}
          fill="none"
          stroke={color}
          strokeLinejoin="round"
          strokeWidth="2.2"
          vectorEffect="non-scaling-stroke"
        />
        {p ? (
          <>
            {hover === null ? null : (
              <line
                stroke="currentColor"
                strokeOpacity="0.35"
                x1={geo.x(at)}
                x2={geo.x(at)}
                y1={PAD_TOP}
                y2={H - PAD_BOTTOM}
              />
            )}
            <circle cx={geo.x(at)} cy={geo.y(p.c)} fill={color} r="5" />
          </>
        ) : null}
        {geo.labels.map((l, i) => (
          <text
            className="fill-muted-foreground text-[13px]"
            key={`${l.text}-${l.x}`}
            textAnchor={anchorFor(i)}
            x={l.x}
            y={H - 6}
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
