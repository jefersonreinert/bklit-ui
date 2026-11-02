"use client";

import createGlobe from "cobe";
import { useEffect, useMemo, useRef, useState } from "react";
import { appLocale } from "@/lib/i18n/locale";
import { type EconEvent, flag, IMPACT_LABEL } from "@/lib/markets/calendar";
import { cn } from "@/lib/utils";

/**
 * Animated globe of the economic calendar (cobe, WebGL): every currency
 * with events is a marker on its financial center, sized by how many
 * high-impact releases it has. Drag to spin; pick a currency to fly to
 * it and see its next releases. Beige paper look, Kraft markers.
 */

/** Financial center of each currency [lat, lng]. */
const CENTERS: Record<string, { city: string; at: [number, number] }> = {
  USD: { city: "Nova York", at: [40.71, -74.01] },
  EUR: { city: "Frankfurt", at: [50.11, 8.68] },
  GBP: { city: "Londres", at: [51.51, -0.13] },
  JPY: { city: "Tóquio", at: [35.68, 139.69] },
  CNY: { city: "Pequim", at: [39.9, 116.4] },
  BRL: { city: "São Paulo", at: [-23.55, -46.63] },
  CAD: { city: "Ottawa", at: [45.42, -75.7] },
  AUD: { city: "Sydney", at: [-33.87, 151.21] },
  NZD: { city: "Wellington", at: [-41.29, 174.78] },
  CHF: { city: "Zurique", at: [47.38, 8.54] },
  MXN: { city: "Cidade do México", at: [19.43, -99.13] },
  INR: { city: "Mumbai", at: [19.08, 72.88] },
  KRW: { city: "Seul", at: [37.57, 126.98] },
  ZAR: { city: "Joanesburgo", at: [-26.2, 28.05] },
  RUB: { city: "Moscou", at: [55.76, 37.62] },
  TRY: { city: "Istambul", at: [41.01, 28.98] },
  SEK: { city: "Estocolmo", at: [59.33, 18.07] },
  NOK: { city: "Oslo", at: [59.91, 10.75] },
  SGD: { city: "Singapura", at: [1.35, 103.82] },
  HKD: { city: "Hong Kong", at: [22.32, 114.17] },
};

/** Colors of the reference: beige paper, ink dots, Kraft markers. */
const BEIGE: [number, number, number] = [0.91, 0.875, 0.81];
const GLOW: [number, number, number] = [0.94, 0.91, 0.85];
const KRAFT: [number, number, number] = [0.8, 0.47, 0.36];
const INK: [number, number, number] = [0.29, 0.26, 0.24];

const TAU = Math.PI * 2;

/** Rotation (phi, theta) that brings a [lat, lng] to the front. */
function focusOf([lat, lng]: [number, number]) {
  return {
    phi: Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2),
    theta: (lat * Math.PI) / 180,
  };
}

/** Shortest way around the circle from `a` to `b`. */
const angleTo = (a: number, b: number) => {
  const d = ((((b - a) % TAU) + TAU * 1.5) % TAU) - TAU / 2;
  return a + d;
};

interface CurrencyStat {
  currency: string;
  total: number;
  high: number;
  next: EconEvent | undefined;
}

function useStats(events: EconEvent[]) {
  return useMemo(() => {
    const now = Date.now();
    const map = new Map<string, CurrencyStat>();
    for (const e of events) {
      if (!CENTERS[e.currency]) {
        continue;
      }
      const s = map.get(e.currency) ?? {
        currency: e.currency,
        total: 0,
        high: 0,
        next: undefined,
      };
      s.total += 1;
      s.high += e.impact === "high" ? 1 : 0;
      const t = new Date(e.time).getTime();
      if (
        t > now &&
        (!s.next || t < new Date(s.next.time).getTime()) &&
        e.impact !== "low"
      ) {
        s.next = e;
      }
      map.set(e.currency, s);
    }
    return [...map.values()].sort(
      (a, b) => b.high - a.high || b.total - a.total
    );
  }, [events]);
}

function GlobeCanvas({
  stats,
  focus,
}: {
  stats: CurrencyStat[];
  focus: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    phi: number;
    theta: number;
  } | null>(null);
  const view = useRef({ phi: 0, theta: 0.25, targetPhi: 0, targetTheta: 0.25 });
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);

  const markers = useMemo(() => {
    const max = Math.max(1, ...stats.map((s) => s.high + s.total / 4));
    return stats.map((s) => ({
      location: CENTERS[s.currency]?.at ?? [0, 0],
      size: 0.03 + 0.07 * ((s.high + s.total / 4) / max),
      color: s.currency === focus ? INK : KRAFT,
    }));
  }, [stats, focus]);

  const arcs = useMemo(() => {
    const from = focus ? CENTERS[focus]?.at : undefined;
    if (!from) {
      return [];
    }
    return stats
      .filter((s) => s.currency !== focus)
      .slice(0, 8)
      .map((s) => ({ from, to: CENTERS[s.currency]?.at ?? from }));
  }, [stats, focus]);

  const initial = useRef({ markers, arcs });
  useEffect(() => {
    globeRef.current?.update({ markers, arcs });
  }, [markers, arcs]);

  // Fly to the chosen currency
  useEffect(() => {
    const at = focus ? CENTERS[focus]?.at : undefined;
    if (!at) {
      return;
    }
    const v = view.current;
    const f = focusOf(at);
    v.targetPhi = angleTo(v.phi, f.phi);
    v.targetTheta = Math.max(-0.9, Math.min(0.9, f.theta));
  }, [focus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!(canvas && box)) {
      return;
    }
    let width = box.offsetWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: width * dpr,
      height: width * dpr,
      phi: view.current.phi,
      theta: view.current.theta,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 24_000,
      mapBrightness: 5,
      mapBaseBrightness: 0,
      baseColor: BEIGE,
      markerColor: KRAFT,
      glowColor: GLOW,
      markers: initial.current.markers,
      arcs: initial.current.arcs,
      arcColor: KRAFT,
      arcWidth: 0.6,
      arcHeight: 0.25,
      markerElevation: 0.02,
      opacity: 0.95,
    });
    globeRef.current = globe;
    const ro = new ResizeObserver(() => {
      width = box.offsetWidth;
      globe.update({ width: width * dpr, height: width * dpr });
    });
    ro.observe(box);
    let raf = 0;
    const tick = () => {
      const v = view.current;
      if (!(drag.current || focusRef.current || reduce)) {
        v.targetPhi += 0.0025;
      }
      v.phi += (v.targetPhi - v.phi) * 0.08;
      v.theta += (v.targetTheta - v.theta) * 0.08;
      globe.update({ phi: v.phi, theta: v.theta });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    canvas.style.opacity = "1";
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      globe.destroy();
      globeRef.current = null;
    };
  }, []);

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[560px]"
      ref={boxRef}
    >
      <canvas
        aria-label="Globo com os países que têm eventos econômicos"
        className="size-full cursor-grab opacity-0 transition-opacity duration-700 active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            phi: view.current.targetPhi,
            theta: view.current.targetTheta,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) {
            return;
          }
          const size = boxRef.current?.offsetWidth ?? 400;
          view.current.targetPhi = d.phi + ((e.clientX - d.x) / size) * Math.PI;
          view.current.targetTheta = Math.max(
            -0.9,
            Math.min(0.9, d.theta + ((e.clientY - d.y) / size) * Math.PI * 0.6)
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        ref={canvasRef}
        role="img"
        style={{ touchAction: "none" }}
      />
    </div>
  );
}

const when = (e: EconEvent) =>
  e.allDay
    ? new Date(e.time).toLocaleDateString(appLocale(), {
        weekday: "short",
        day: "numeric",
      })
    : new Date(e.time).toLocaleString(appLocale(), {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

export function EconGlobe({
  events,
  onPickCurrency,
  onOpenEvent,
}: {
  events: EconEvent[];
  onPickCurrency: (currency: string) => void;
  onOpenEvent: (e: EconEvent) => void;
}) {
  const stats = useStats(events);
  const [focus, setFocus] = useState<string | null>(null);
  const picked = stats.find((s) => s.currency === focus);
  const upcoming = useMemo(
    () =>
      focus
        ? events
            .filter(
              (e) =>
                e.currency === focus && new Date(e.time).getTime() > Date.now()
            )
            .slice(0, 5)
        : [],
    [events, focus]
  );

  return (
    <div className="relative flex min-h-full flex-col items-center overflow-hidden bg-[#e9e0cf] px-4 pt-8 pb-6 text-[#2f2a25]">
      <p className="font-mono text-[#2f2a25]/80 text-sm tracking-wide">
        Calendário <span className="font-serif text-xl">econômico</span>
      </p>
      <p className="mt-1 text-[#2f2a25]/60 text-xs">
        {stats.length} economias · arraste para girar · toque numa moeda
      </p>
      <span
        aria-hidden
        className="mt-3 block h-6 w-3 animate-pulse bg-[#2f2a25]"
      />

      <div className="mt-2 w-full">
        <GlobeCanvas focus={focus} stats={stats} />
      </div>

      <div className="relative z-10 -mt-6 flex w-full max-w-xl flex-wrap justify-center gap-1.5">
        {stats.map((s) => (
          <button
            className={cn(
              "flex items-center gap-1.5 border border-[#2f2a25]/20 px-2.5 py-1 font-mono text-xs transition-colors",
              focus === s.currency
                ? "bg-[#2f2a25] text-[#e9e0cf]"
                : "bg-[#e9e0cf]/80 hover:bg-[#2f2a25]/10"
            )}
            key={s.currency}
            onClick={() => setFocus(focus === s.currency ? null : s.currency)}
            type="button"
          >
            {flag(s.currency)} {s.currency}
            <span className="opacity-60">{s.total}</span>
            {s.high ? <span className="text-[#b5532f]">●{s.high}</span> : null}
          </button>
        ))}
      </div>

      {picked ? (
        <div className="relative z-10 mt-4 w-full max-w-xl border border-[#2f2a25]/20 bg-[#f1ebdf] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-serif text-lg">
              {flag(picked.currency)} {CENTERS[picked.currency]?.city}
            </p>
            <p className="font-mono text-[#2f2a25]/70 text-xs">
              {picked.total} eventos · {picked.high} de alto impacto
            </p>
          </div>
          {upcoming.length ? (
            <ul className="mt-2 divide-y divide-[#2f2a25]/10">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <button
                    className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:opacity-80"
                    onClick={() => onOpenEvent(e)}
                    type="button"
                  >
                    <span className="w-20 shrink-0 font-mono text-[#2f2a25]/60 text-xs">
                      {when(e)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    <span className="shrink-0 text-[#2f2a25]/60 text-[11px]">
                      {IMPACT_LABEL[e.impact]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[#2f2a25]/60 text-sm">
              Sem próximos eventos neste período.
            </p>
          )}
          <button
            className="mt-3 border border-[#2f2a25] px-3 py-1.5 font-mono text-xs hover:bg-[#2f2a25] hover:text-[#e9e0cf]"
            onClick={() => onPickCurrency(picked.currency)}
            type="button"
          >
            Filtrar o calendário por {picked.currency}
          </button>
        </div>
      ) : null}
    </div>
  );
}
