"use client";

import { createLocalStore } from "@/lib/local-store";

/**
 * Work timetable: shifts by day, at one of the company's places. Kept in
 * localStorage and mirrored to Convex (SYNCED_KEYS) so every device sees it.
 */

export interface WorkPlace {
  id: string;
  name: string;
}

export interface WorkShift {
  id: string;
  /** YYYY-MM-DD, local date. */
  date: string;
  /** HH:MM */
  start: string;
  /** HH:MM; earlier than start means the shift ends the next day. */
  end: string;
  place: string;
  note?: string;
}

export interface WorkSchedule {
  places: WorkPlace[];
  shifts: WorkShift[];
}

export const DEFAULT_PLACES: WorkPlace[] = [
  { id: "p1", name: "Local 1" },
  { id: "p2", name: "Local 2" },
  { id: "p3", name: "Local 3" },
];

/** One color per place: the panel's clay, kraft and manilla tones. */
export const PLACE_COLORS = ["#d97757", "#d4a27f", "#ebdbbc"];

export const workStore = createLocalStore<WorkSchedule>("cb:work-schedule:v1", {
  places: DEFAULT_PLACES,
  shifts: [],
});

const pad = (n: number) => String(n).padStart(2, "0");

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromKey = (key: string) => {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const toMinutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Shift length in minutes (overnight shifts wrap past midnight). */
export const shiftMinutes = (s: Pick<WorkShift, "start" | "end">) => {
  const diff = toMinutes(s.end) - toMinutes(s.start);
  return diff > 0 ? diff : diff + 24 * 60;
};

export const formatHours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export const shiftsOn = (shifts: WorkShift[], key: string) =>
  shifts
    .filter((s) => s.date === key)
    .sort((a, b) => a.start.localeCompare(b.start));

/** Monday of the week containing `d`. */
export function weekStart(d: Date) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

export const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** 6×7 grid of days (Monday first) covering the month of `d`. */
export function monthGrid(d: Date) {
  const first = weekStart(new Date(d.getFullYear(), d.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export type ShiftState = "before" | "now" | "after";

/** Where `minutes` (since midnight of the shift's date) falls. */
export function shiftState(s: WorkShift, minutes: number): ShiftState {
  const start = toMinutes(s.start);
  if (minutes < start) {
    return "before";
  }
  return minutes < start + shiftMinutes(s) ? "now" : "after";
}

/** The next shift that has not ended yet, from `now`. */
export function nextShift(shifts: WorkShift[], now: Date) {
  const today = dateKey(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    [...shifts]
      .filter(
        (s) =>
          s.date > today ||
          (s.date === today && shiftState(s, minutes) !== "after")
      )
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
      )[0] ?? null
  );
}

export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
