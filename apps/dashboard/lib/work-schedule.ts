"use client";

import { createLocalStore } from "@/lib/local-store";

/**
 * Work timetable: shifts by day, at one of the company's places. Kept in
 * localStorage and mirrored to Convex (SYNCED_KEYS) so every device sees it.
 */

export type PlaceKind = "wine" | "pig" | "beer";

export interface WorkPlace {
  id: string;
  name: string;
  /** Short name for tables on small screens. */
  short: string;
  /** Neighbourhood, shown under the name. */
  area: string;
  /** What the venue is best known for: picks its icon. */
  kind: PlaceKind;
  /** Lower-case words that identify it on a rota. */
  keywords: string[];
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

/** Time clock entry: when you actually started and finished work. */
export interface WorkPunch {
  id: string;
  /** YYYY-MM-DD of the clock-in. */
  date: string;
  /** HH:MM */
  in: string;
  /** HH:MM, or null while still working. Earlier than `in` = next day. */
  out: string | null;
  place: string;
}

export interface WorkSchedule {
  shifts: WorkShift[];
  punches: WorkPunch[];
  /** How your name can appear in the company's rota. */
  aliases: string[];
}

export const DEFAULT_ALIASES = ["Jeferson", "Jefferson", "Jeff", "Jef"];

/** The company's three venues (fixed; ids kept from the first version). */
export const PLACES: WorkPlace[] = [
  {
    id: "p1",
    name: "VINOMAD",
    short: "VINOMAD",
    area: "Valletta Waterfront",
    kind: "wine",
    keywords: ["vinomad"],
  },
  {
    id: "p2",
    name: "Ribs House by The Brew",
    short: "Ribs House",
    area: "Naxxar",
    kind: "pig",
    keywords: ["ribs house", "ribs"],
  },
  {
    id: "p3",
    name: "The Brew Grill & Brewery",
    short: "The Brew",
    area: "Sliema",
    kind: "beer",
    keywords: ["the brew", "brew grill", "brewery", "brew"],
  },
];

/** One color per place (same order as PLACES): clay, kraft, manilla. */
export const PLACE_COLORS = ["#d97757", "#d4a27f", "#ebdbbc"];

export const workStore = createLocalStore<WorkSchedule>("cb:work-schedule:v1", {
  shifts: [],
  punches: [],
  aliases: DEFAULT_ALIASES,
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

/* ------------------------------ time clock ------------------------------- */

export const clockTime = (d: Date) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const openPunch = (punches: WorkPunch[]) =>
  punches.find((p) => p.out === null) ?? null;

/** Worked minutes; an open punch counts up to `now`. */
export function punchMinutes(p: WorkPunch, now?: Date) {
  if (p.out) {
    return shiftMinutes({ start: p.in, end: p.out });
  }
  if (!now) {
    return 0;
  }
  const start = fromKey(p.date);
  const [h = 0, m = 0] = p.in.split(":").map(Number);
  start.setHours(h, m);
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60_000));
}

/** YYYY-MM */
export const monthKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export interface PlaceTotal {
  place: WorkPlace;
  days: number;
  minutes: number;
}

/** Closed punches of a month, with totals per place (for the payslip). */
export function monthReport(
  punches: WorkPunch[],
  places: WorkPlace[],
  month: string
) {
  const rows = punches
    .filter((p) => p.out !== null && p.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date) || a.in.localeCompare(b.in));
  const byPlace: PlaceTotal[] = places.map((place) => {
    const mine = rows.filter((r) => r.place === place.id);
    return {
      place,
      days: new Set(mine.map((r) => r.date)).size,
      minutes: mine.reduce((sum, r) => sum + punchMinutes(r), 0),
    };
  });
  return {
    rows,
    byPlace,
    days: new Set(rows.map((r) => r.date)).size,
    minutes: rows.reduce((sum, r) => sum + punchMinutes(r), 0),
  };
}

const CSV_SPECIAL = /[",\n]/;
const QUOTE = /"/g;

const hoursDecimal = (minutes: number) => (minutes / 60).toFixed(2);

/** CSV for the company: one line per entry, then totals per place. */
export function reportCSV(
  report: ReturnType<typeof monthReport>,
  places: WorkPlace[]
) {
  const name = (id: string) => places.find((p) => p.id === id)?.name ?? "";
  const esc = (v: string) =>
    CSV_SPECIAL.test(v) ? `"${v.replace(QUOTE, '""')}"` : v;
  const lines = [
    "Data,Local,Entrada,Saída,Horas",
    ...report.rows.map((r) =>
      [
        r.date,
        esc(name(r.place)),
        r.in,
        r.out ?? "",
        hoursDecimal(punchMinutes(r)),
      ].join(",")
    ),
    "",
    "Local,Dias,Horas",
    ...report.byPlace.map((t) =>
      [esc(t.place.name), String(t.days), hoursDecimal(t.minutes)].join(",")
    ),
    ["Total", String(report.days), hoursDecimal(report.minutes)].join(","),
  ];
  return `${lines.join("\n")}\n`;
}

/** Plain-text summary to paste in a message or e-mail. */
export function reportText(
  report: ReturnType<typeof monthReport>,
  places: WorkPlace[],
  title: string
) {
  const name = (id: string) => places.find((p) => p.id === id)?.name ?? "";
  return [
    title,
    "",
    ...report.rows.map(
      (r) =>
        `${r.date} · ${name(r.place)} · ${r.in}–${r.out} · ${formatHours(punchMinutes(r))}`
    ),
    "",
    ...report.byPlace
      .filter((t) => t.days > 0)
      .map(
        (t) =>
          `${t.place.name}: ${t.days} ${t.days === 1 ? "dia" : "dias"}, ${formatHours(t.minutes)}`
      ),
    `Total: ${report.days} ${report.days === 1 ? "dia" : "dias"}, ${formatHours(report.minutes)}`,
  ].join("\n");
}

/* ---------------------------- rota import -------------------------------- */

const CSV_CELL = /[",\n]/;

/** Spreadsheet rows (from an .xlsx) as CSV text for the AI reader. */
export function rowsToCSV(rows: unknown[][]) {
  const cell = (v: unknown) => {
    let text = "";
    if (v instanceof Date) {
      text = Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
    } else if (v !== null && v !== undefined) {
      text = String(v);
    }
    return CSV_CELL.test(text) ? `"${text.replace(QUOTE, '""')}"` : text;
  };
  return rows
    .filter((r) => r.some((v) => v !== null && v !== undefined && v !== ""))
    .map((r) => r.map(cell).join(","))
    .join("\n");
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;

/** Normalises "9:00" → "09:00"; anything else → "". */
export const cleanTime = (t: string) =>
  TIME.test(t.trim()) ? t.trim().padStart(5, "0") : "";

export const isDateKey = (d: string) => DATE_KEY.test(d);

/** Place whose name or keywords match what the AI read on the rota. */
export function matchPlace(places: WorkPlace[], guess: string) {
  const g = guess.trim().toLowerCase();
  if (!g) {
    return null;
  }
  // Full name first (the longest wins: "Ribs House by The Brew" vs "The
  // Brew"), then keywords in PLACES order (Ribs House before The Brew).
  const byName = places
    .filter((p) => g.includes(p.name.trim().toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  return (
    byName ?? places.find((p) => p.keywords.some((k) => g.includes(k))) ?? null
  );
}
