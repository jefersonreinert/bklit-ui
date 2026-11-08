/**
 * Reservation engine (pure, shared by the server and the screens):
 * opening hours, bookable slots, overlaps, covers capacity and table
 * suggestions. Times are local to the venue ("HH:MM"); a service day that
 * runs past midnight (e.g. 12:00–01:00) keeps its late times on the same
 * service date by adding 24 h to them.
 */

export type Source =
  | "website"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "google"
  | "phone"
  | "walkin"
  | "manual";

export type Status =
  | "pending"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
  | "no_show";

export const SOURCES: Source[] = [
  "website",
  "instagram",
  "facebook",
  "whatsapp",
  "google",
  "phone",
  "walkin",
  "manual",
];

export const STATUSES: Status[] = [
  "pending",
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "no_show",
];

/** Statuses that hold a table and count towards capacity. */
export const ACTIVE: Status[] = ["pending", "confirmed", "seated"];

export interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}

export interface VenueSettings {
  /** Monday first (index 0 = Monday … 6 = Sunday). */
  hours: DayHours[];
  /** Minutes between bookable start times. */
  interval: number;
  /** Default length of a reservation in minutes. */
  duration: number;
  /** Last booking this many minutes before closing. */
  lastBooking: number;
  minParty: number;
  maxParty: number;
  /** Guests seated at the same time (0 = no limit). */
  maxCovers: number;
  /** Online bookings accepted (website, messaging, Google). */
  online: boolean;
  /** Online requests start as "pending" until staff confirm. */
  confirmOnline: boolean;
  /** Text shown to guests (deposits, dress code, terrace…). */
  conditions: string;
}

const DAY = (open: string, close: string): DayHours => ({
  closed: false,
  open,
  close,
});

export const DEFAULT_SETTINGS: VenueSettings = {
  hours: [
    DAY("12:00", "23:30"),
    DAY("12:00", "23:30"),
    DAY("12:00", "23:30"),
    DAY("12:00", "23:30"),
    DAY("12:00", "01:00"),
    DAY("12:00", "01:00"),
    DAY("12:00", "23:30"),
  ],
  interval: 15,
  duration: 120,
  lastBooking: 60,
  minParty: 1,
  maxParty: 12,
  maxCovers: 0,
  online: true,
  confirmOnline: false,
  conditions: "",
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isTime = (t: string) => TIME.test(t);
export const isDate = (d: string) => DATE.test(d);

export function toMin(t: string) {
  const m = TIME.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

export function toTime(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Index of the weekday, Monday = 0. */
export function weekday(date: string) {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

/** Opening window of a service date in minutes (close may pass 1440). */
export function openWindow(s: VenueSettings, date: string) {
  const h = s.hours[weekday(date)];
  if (!h || h.closed || !(isTime(h.open) && isTime(h.close))) {
    return null;
  }
  const open = toMin(h.open);
  let close = toMin(h.close);
  if (close <= open) {
    close += 1440;
  }
  return { open, close };
}

/** Minutes of a time on its service date (late times after midnight). */
export function serviceMin(s: VenueSettings, date: string, time: string) {
  const w = openWindow(s, date);
  const t = toMin(time);
  if (w && t < w.open && t + 1440 <= w.close) {
    return t + 1440;
  }
  return t;
}

export interface Booking {
  id?: string;
  date: string;
  time: string;
  duration: number;
  party: number;
  tables: string[];
  status: Status;
}

const range = (s: VenueSettings, b: Booking) => {
  const start = serviceMin(s, b.date, b.time);
  return { start, end: start + b.duration };
};

const overlaps = (
  a: { start: number; end: number },
  b: { start: number; end: number }
) => a.start < b.end && b.start < a.end;

/** Highest number of guests seated at once during [start, end). */
function peakCovers(
  s: VenueSettings,
  others: Booking[],
  r: { start: number; end: number }
) {
  const live = others
    .filter((o) => ACTIVE.includes(o.status))
    .map((o) => ({ ...range(s, o), party: o.party }))
    .filter((o) => overlaps(o, r));
  const points = [r.start, ...live.map((o) => o.start)].filter(
    (p) => p >= r.start && p < r.end
  );
  let peak = 0;
  for (const p of points) {
    const at = live
      .filter((o) => o.start <= p && p < o.end)
      .reduce((a, o) => a + o.party, 0);
    peak = Math.max(peak, at);
  }
  return peak;
}

export type Problem =
  | { code: "closed" }
  | { code: "outside_hours"; open: string; last: string }
  | { code: "party"; min: number; max: number }
  | { code: "capacity"; free: number }
  | { code: "table_taken"; table: string }
  | { code: "table_small"; seats: number };

export interface TableInfo {
  id: string;
  name: string;
  seats: number;
  area: string;
}

/**
 * Checks a booking against the venue rules and the other bookings of the
 * day. Staff may override hours, party size and capacity (walk-ins, large
 * groups); a table that is already taken can never be double booked.
 */
/** Hours, party size and covers capacity (what staff may override). */
function ruleProblems(
  s: VenueSettings,
  b: Booking,
  others: Booking[],
  r: { start: number; end: number }
): Problem[] {
  const problems: Problem[] = [];
  const w = openWindow(s, b.date);
  if (!w) {
    problems.push({ code: "closed" });
  } else if (r.start < w.open || r.start > w.close - s.lastBooking) {
    problems.push({
      code: "outside_hours",
      open: toTime(w.open),
      last: toTime(w.close - s.lastBooking),
    });
  }
  if (b.party < s.minParty || b.party > s.maxParty) {
    problems.push({ code: "party", min: s.minParty, max: s.maxParty });
  }
  if (s.maxCovers > 0) {
    const peak = peakCovers(s, others, r);
    if (peak + b.party > s.maxCovers) {
      problems.push({
        code: "capacity",
        free: Math.max(0, s.maxCovers - peak),
      });
    }
  }
  return problems;
}

/** Tables already taken during the booking (never overridable). */
function tableProblems(
  s: VenueSettings,
  b: Booking,
  others: Booking[],
  tables: TableInfo[],
  r: { start: number; end: number }
): Problem[] {
  const live = others.filter((o) => ACTIVE.includes(o.status));
  return b.tables
    .filter((t) =>
      live.some((o) => o.tables.includes(t) && overlaps(range(s, o), r))
    )
    .map((t) => ({
      code: "table_taken" as const,
      table: tables.find((x) => x.id === t)?.name ?? t,
    }));
}

/**
 * Checks a booking against the venue rules and the other bookings of the
 * day. Staff may override hours, party size and capacity (walk-ins, large
 * groups); a table that is already taken can never be double booked.
 */
export function check(
  s: VenueSettings,
  b: Booking,
  others: Booking[],
  tables: TableInfo[],
  opts: { override?: boolean } = {}
): Problem[] {
  const r = range(s, b);
  const problems = [
    ...(opts.override ? [] : ruleProblems(s, b, others, r)),
    ...tableProblems(s, b, others, tables, r),
  ];
  if (b.tables.length && !opts.override) {
    const seats = b.tables.reduce(
      (a, t) => a + (tables.find((x) => x.id === t)?.seats ?? 0),
      0
    );
    if (seats < b.party) {
      problems.push({ code: "table_small", seats });
    }
  }
  return problems;
}

/** Tables free for the whole booking window. */
export function freeTables(
  s: VenueSettings,
  b: Booking,
  others: Booking[],
  tables: TableInfo[]
) {
  const r = range(s, b);
  const live = others.filter((o) => ACTIVE.includes(o.status));
  return tables.filter(
    (t) =>
      !live.some((o) => o.tables.includes(t.id) && overlaps(range(s, o), r))
  );
}

/**
 * Best table(s) for a party: the smallest single table that fits, or the
 * two tables of the same area with the fewest spare seats (combined).
 */
export function suggestTables(
  s: VenueSettings,
  b: Booking,
  others: Booking[],
  tables: TableInfo[]
) {
  const free = freeTables(s, b, others, tables);
  const single = free
    .filter((t) => t.seats >= b.party)
    .sort((x, y) => x.seats - y.seats)[0];
  if (single) {
    return [single.id];
  }
  let best: { ids: string[]; spare: number } | null = null;
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i];
      const c = free[j];
      if (!(a && c) || a.area !== c.area) {
        continue;
      }
      const spare = a.seats + c.seats - b.party;
      if (spare >= 0 && (!best || spare < best.spare)) {
        best = { ids: [a.id, c.id], spare };
      }
    }
  }
  return best?.ids ?? [];
}

/** Bookable start times of a date for a party, with what blocks each. */
export function slots(
  s: VenueSettings,
  date: string,
  party: number,
  others: Booking[],
  tables: TableInfo[],
  duration = s.duration
) {
  const w = openWindow(s, date);
  if (!w) {
    return [];
  }
  const out: { time: string; ok: boolean; tables: string[] }[] = [];
  for (let m = w.open; m <= w.close - s.lastBooking; m += s.interval) {
    const b: Booking = {
      date,
      time: toTime(m),
      duration,
      party,
      tables: [],
      status: "confirmed",
    };
    const problems = check(s, b, others, tables);
    // With a floor plan, a slot is only offered if some table fits
    const pick = tables.length ? suggestTables(s, b, others, tables) : [];
    out.push({
      time: b.time,
      ok: problems.length === 0 && (tables.length === 0 || pick.length > 0),
      tables: pick,
    });
  }
  return out;
}

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short booking reference, e.g. "BR-7K3QX" (prefix per venue). */
export function bookingRef(prefix: string, random: () => number) {
  let s = "";
  for (let i = 0; i < 5; i++) {
    s += REF_CHARS[Math.floor(random() * REF_CHARS.length)];
  }
  return `${prefix}-${s}`;
}

export function problemText(p: Problem) {
  switch (p.code) {
    case "closed":
      return "O bar está fechado neste dia.";
    case "outside_hours":
      return `Fora do horário de reservas (${p.open} às ${p.last}).`;
    case "party":
      return `Grupo fora do limite (${p.min} a ${p.max} pessoas).`;
    case "capacity":
      return `Sem capacidade neste horário (restam ${p.free} lugares).`;
    case "table_taken":
      return `A mesa ${p.table} já está reservada neste horário.`;
    case "table_small":
      return `As mesas escolhidas têm só ${p.seats} lugares.`;
    default:
      return "Reserva inválida.";
  }
}
