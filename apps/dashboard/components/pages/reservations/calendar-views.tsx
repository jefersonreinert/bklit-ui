"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Status } from "@/lib/reservations/engine";
import { cn } from "@/lib/utils";
import {
  localDay,
  STATUS_META,
  shiftDay,
  VENUE_NAMES,
  WEEKDAYS,
} from "./reservations-shared";

/**
 * Week (seven columns of bookings) and month (heat grid of covers) views.
 * Tapping a day opens it in the day view.
 */

const DOT: Record<Status, string> = {
  pending: "bg-amber-500",
  confirmed: "bg-sky-500",
  seated: "bg-emerald-500",
  completed: "bg-zinc-400",
  cancelled: "bg-zinc-300",
  no_show: "bg-red-500",
};

const live = (s: Status) => s !== "cancelled" && s !== "no_show";

/** Monday of the week of a date. */
export function mondayOf(day: string) {
  const d = new Date(`${day}T12:00:00`);
  return shiftDay(day, -((d.getDay() + 6) % 7));
}

export function WeekView({
  company,
  date,
  onPick,
}: {
  company: string;
  date: string;
  onPick: (day: string) => void;
}) {
  const from = mondayOf(date);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(from, i));
  const rows = useQuery(api.reservations.range, {
    company,
    from,
    to: days[6] ?? from,
  });
  const today = localDay();
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="grid min-w-[56rem] grid-cols-7 gap-2">
        {days.map((d, i) => {
          const list = (rows ?? []).filter((r) => r.date === d);
          const covers = list
            .filter((r) => live(r.status))
            .reduce((a, r) => a + r.party, 0);
          return (
            <div
              className={cn(
                "flex min-h-64 flex-col gap-1.5 rounded-2xl border bg-card p-2",
                d === today && "border-foreground/40"
              )}
              key={d}
            >
              <button
                className="flex items-baseline justify-between px-1 text-left"
                onClick={() => onPick(d)}
                type="button"
              >
                <span className="font-semibold text-sm">
                  {WEEKDAYS[i]} {Number(d.slice(8))}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {covers} pax
                </span>
              </button>
              {list.map((r) => (
                <button
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg bg-muted/60 px-2 py-1 text-left text-xs hover:bg-muted",
                    !live(r.status) && "line-through opacity-50"
                  )}
                  key={r.id}
                  onClick={() => onPick(d)}
                  title={`${STATUS_META[r.status].label}${company === "all" ? ` · ${VENUE_NAMES[r.company] ?? r.company}` : ""}`}
                  type="button"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      DOT[r.status]
                    )}
                  />
                  <span className="tabular-nums">{r.time}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.vip ? "★ " : ""}
                    {r.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {r.party}
                  </span>
                </button>
              ))}
              {rows && list.length === 0 ? (
                <p className="px-1 text-muted-foreground text-xs">—</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonthView({
  company,
  date,
  onPick,
}: {
  company: string;
  date: string;
  onPick: (day: string) => void;
}) {
  const first = `${date.slice(0, 7)}-01`;
  const d0 = new Date(`${first}T12:00:00`);
  const last = localDay(new Date(d0.getFullYear(), d0.getMonth() + 1, 0, 12));
  const rows = useQuery(api.reservations.range, {
    company,
    from: first,
    to: last,
  });
  const lead = (d0.getDay() + 6) % 7;
  const count = Number(last.slice(8));
  const byDay = new Map<string, { n: number; covers: number }>();
  for (const r of rows ?? []) {
    if (!live(r.status)) {
      continue;
    }
    const cur = byDay.get(r.date) ?? { n: 0, covers: 0 };
    byDay.set(r.date, { n: cur.n + 1, covers: cur.covers + r.party });
  }
  const max = Math.max(1, ...[...byDay.values()].map((v) => v.covers));
  const today = localDay();
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5 text-center text-muted-foreground text-xs">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: empty leading cells
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = `${date.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`;
          const v = byDay.get(day);
          const heat = v ? 0.12 + (v.covers / max) * 0.5 : 0;
          return (
            <button
              className={cn(
                "flex aspect-square flex-col items-start justify-between rounded-xl border p-1.5 text-left sm:p-2",
                day === today && "border-foreground/50"
              )}
              key={day}
              onClick={() => onPick(day)}
              style={{
                background: v
                  ? `color-mix(in oklab, var(--primary) ${Math.round(heat * 100)}%, transparent)`
                  : undefined,
              }}
              type="button"
            >
              <span className="font-semibold text-xs sm:text-sm">{i + 1}</span>
              {v ? (
                <span className="text-[10px] leading-tight sm:text-xs">
                  {v.n} res.
                  <br />
                  {v.covers} pax
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
