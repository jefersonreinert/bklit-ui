"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import {
  ACTIVE,
  openWindow,
  type Status,
  serviceMin,
  toTime,
} from "@/lib/reservations/engine";
import { cn } from "@/lib/utils";
import type { Reservation } from "./booking-sheet";
import { localDay, STATUS_META } from "./reservations-shared";

/**
 * The venue's floor plan (from the POS) with each table coloured by the
 * booking that holds it at the chosen time. Tap an occupied table to open
 * its booking, a free one to book it.
 */

const FILL: Record<Status, string> = {
  pending: "bg-amber-400/80 text-amber-950 border-amber-500",
  confirmed: "bg-sky-500/80 text-white border-sky-600",
  seated: "bg-emerald-500/85 text-white border-emerald-600",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-muted text-muted-foreground",
};

const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export function FloorView({
  company,
  date,
  onOpen,
  onBook,
}: {
  company: string;
  date: string;
  onOpen: (b: Reservation) => void;
  onBook: (time: string, tableId: string) => void;
}) {
  const venue = useQuery(api.reservations.venue, { company });
  const day = useQuery(api.reservations.day, { company, date });
  const [areaId, setArea] = useState<string | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  if (!(venue && day)) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  const w = openWindow(venue.settings, date);
  if (!w) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground text-sm">
        Fechado neste dia.
      </p>
    );
  }
  if (venue.floor.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground text-sm">
        Este bar ainda não tem mapa de mesas. Desenhe em POS → Mesas.
      </p>
    );
  }
  const isToday = date === localDay();
  const now = nowMin() < w.open ? nowMin() + 1440 : nowMin();
  const fallback =
    isToday && now >= w.open && now <= w.close ? now : w.open + 7 * 60;
  const at = Math.min(w.close, Math.max(w.open, minute ?? fallback));
  const area = venue.floor.find((a) => a.id === areaId) ?? venue.floor[0];
  const live = day.reservations.filter((r) => ACTIVE.includes(r.status));
  const holding = (tableId: string) =>
    live.find((r) => {
      if (!r.tables.includes(tableId)) {
        return false;
      }
      const start = serviceMin(venue.settings, r.date, r.time);
      return start <= at && at < start + r.duration;
    });
  const nextFor = (tableId: string) =>
    live
      .filter((r) => r.tables.includes(tableId))
      .map((r) => ({ r, start: serviceMin(venue.settings, r.date, r.time) }))
      .filter((x) => x.start > at && x.start - at <= 120)
      .sort((x, y) => x.start - y.start)[0]?.r;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {venue.floor.map((a) => (
          <button
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              area?.id === a.id
                ? "border-foreground bg-foreground text-background"
                : "hover:bg-muted"
            )}
            key={a.id}
            onClick={() => setArea(a.id)}
            type="button"
          >
            {a.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
        <span className="w-12 font-semibold tabular-nums">{toTime(at)}</span>
        <input
          aria-label="Horário"
          className="flex-1"
          max={w.close}
          min={w.open}
          onChange={(e) => setMinute(Number(e.target.value))}
          step={15}
          type="range"
          value={at}
        />
        {isToday ? (
          <Button onClick={() => setMinute(null)} size="sm" variant="outline">
            Agora
          </Button>
        ) : null}
      </div>
      <div
        className="relative w-full overflow-hidden rounded-2xl border bg-muted/30"
        style={{ aspectRatio: "1000 / 700" }}
      >
        {(area?.tables ?? []).map((t) => {
          const r = holding(t.id);
          const next = r ? undefined : nextFor(t.id);
          return (
            <button
              className={cn(
                "absolute flex flex-col items-center justify-center overflow-hidden border text-center shadow-sm transition",
                t.round ? "rounded-full" : "rounded-xl",
                r ? FILL[r.status] : "bg-card hover:bg-muted"
              )}
              key={t.id}
              onClick={() => (r ? onOpen(r) : onBook(toTime(at), t.id))}
              style={{
                left: `${(t.x / 1000) * 100}%`,
                top: `${(t.y / 700) * 100}%`,
                width: `${(t.w / 1000) * 100}%`,
                height: `${(t.h / 700) * 100}%`,
              }}
              title={
                r
                  ? `${r.name} · ${r.party} pax · ${r.time}`
                  : `Mesa ${t.name} livre`
              }
              type="button"
            >
              <span className="font-semibold text-[11px] leading-none sm:text-sm">
                {t.name}
              </span>
              <span className="hidden truncate px-1 text-[10px] leading-tight sm:block">
                {r ? `${r.party} · ${r.name.split(" ")[0]}` : `${t.seats} lug.`}
              </span>
              {next ? (
                <span className="hidden text-[9px] text-muted-foreground leading-tight sm:block">
                  às {next.time}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded border bg-card" /> Livre
        </span>
        {(["pending", "confirmed", "seated"] as Status[]).map((s) => (
          <span className="flex items-center gap-1.5" key={s}>
            <span className={cn("size-3 rounded border", FILL[s])} />{" "}
            {STATUS_META[s].label}
          </span>
        ))}
        <span>· "às 21:00" = próxima reserva em até 2 h</span>
      </div>
    </div>
  );
}
