/**
 * Monthly hours and gross pay from the POS time clock, following the
 * overtime rules for bars and restaurants in S.L. 452.66 paragraph 22:
 * (a) hours beyond 8 a day, Monday to Saturday, at time-and-a-half;
 * (b) all hours on Sundays and public holidays at double-time;
 * (c) weekly hours beyond the contract's normal hours (excluding those
 *     already paid under (a) and (b)) at time-and-a-half.
 * Gross only: tax (FSS) and social security are left to the payroll.
 */

export interface PaySettings {
  /** Normal hours per week before overtime. */
  weeklyHours: number;
  /** Normal hours per day (Monday to Saturday) before overtime. */
  dailyHours?: number;
  overtime: number;
  sunday: number;
  holiday: number;
}

export const DEFAULT_PAY: PaySettings = {
  weeklyHours: 40,
  dailyHours: 8,
  overtime: 1.5,
  sunday: 2,
  holiday: 2,
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Easter Sunday (Gregorian, anonymous algorithm) as YYYY-MM-DD. */
export function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(Date.UTC(year, month - 1, day));
}

/** Malta's 14 public holidays of a year: date → name. */
export function maltaHolidays(year: number) {
  const fixed: [string, string][] = [
    ["01-01", "New Year's Day"],
    ["02-10", "St Paul's Shipwreck"],
    ["03-19", "St Joseph"],
    ["03-31", "Freedom Day"],
    ["05-01", "Worker's Day"],
    ["06-07", "Sette Giugno"],
    ["06-29", "St Peter and St Paul"],
    ["08-15", "Assumption"],
    ["09-08", "Victory Day"],
    ["09-21", "Independence Day"],
    ["12-08", "Immaculate Conception"],
    ["12-13", "Republic Day"],
    ["12-25", "Christmas Day"],
  ];
  const out = new Map(fixed.map(([d, n]) => [`${year}-${d}`, n]));
  out.set(iso(utc(easter(year)) - 2 * DAY_MS), "Good Friday");
  return out;
}

export interface PunchIn {
  in: number;
  out: number | null;
  /** Local day of the clock-in (YYYY-MM-DD). */
  date: string;
}

export interface PayInput {
  /** YYYY-MM. Punches may start up to 6 days earlier (to close the week). */
  month: string;
  punches: PunchIn[];
  payType: "hourly" | "monthly";
  hourlyRate?: number;
  monthlySalary?: number;
  /** Manual corrections in hours (+/-), paid at the plain rate. */
  adjustHours: number;
}

export interface DayLine {
  date: string;
  hours: number;
  overtime: number;
  kind: "normal" | "sunday" | "holiday";
  holiday?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Monday (YYYY-MM-DD) of the week of a day. */
function weekOf(day: string) {
  const t = utc(day);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return iso(t - dow * DAY_MS);
}

function holidaysAround(month: string) {
  const holidays = new Map<string, string>();
  const year = Number(month.slice(0, 4));
  for (const y of [year - 1, year]) {
    for (const [d, n] of maltaHolidays(y)) {
      holidays.set(d, n);
    }
  }
  return holidays;
}

/** Hours per local day from closed punches, and how many are still open. */
function hoursPerDay(punches: PunchIn[]) {
  const perDay = new Map<string, number>();
  let open = 0;
  for (const p of punches) {
    if (p.out === null) {
      open += 1;
      continue;
    }
    const h = Math.max(0, (p.out - p.in) / HOUR_MS);
    perDay.set(p.date, (perDay.get(p.date) ?? 0) + h);
  }
  return { perDay, open };
}

function kindOf(date: string, holiday: string | undefined): DayLine["kind"] {
  if (holiday) {
    return "holiday";
  }
  return new Date(utc(date)).getUTCDay() === 0 ? "sunday" : "normal";
}

/**
 * The month's days in order with their overtime: daily excess first, then
 * weekly excess; Sundays and holidays are paid apart and not counted.
 */
function dayLines(input: PayInput, s: PaySettings) {
  const holidays = holidaysAround(input.month);
  const { perDay, open } = hoursPerDay(input.punches);
  const daily = s.dailyHours ?? 8;
  const days: DayLine[] = [];
  const weekTotal = new Map<string, number>();
  for (const date of [...perDay.keys()].sort()) {
    const hours = perDay.get(date) ?? 0;
    const holiday = holidays.get(date);
    const kind = kindOf(date, holiday);
    let overtime = 0;
    if (kind === "normal") {
      const dayExtra = Math.max(0, hours - daily);
      const counted = hours - dayExtra;
      const week = weekOf(date);
      const before = weekTotal.get(week) ?? 0;
      weekTotal.set(week, before + counted);
      const weekExtra = Math.max(
        0,
        Math.min(counted, before + counted - s.weeklyHours)
      );
      overtime = dayExtra + weekExtra;
    }
    if (date.startsWith(input.month)) {
      days.push({
        date,
        hours: r2(hours),
        overtime: r2(overtime),
        kind,
        holiday,
      });
    }
  }
  return { days, open };
}

const MULT: Record<DayLine["kind"], (s: PaySettings) => number> = {
  normal: () => 1,
  sunday: (s) => s.sunday,
  holiday: (s) => s.holiday,
};

/**
 * Pay of one day. A monthly salary covers the normal Monday–Saturday
 * hours; overtime and every Sunday or holiday hour are paid on top.
 */
function dayPay(d: DayLine, rate: number, monthly: boolean, s: PaySettings) {
  if (d.kind !== "normal") {
    return d.hours * rate * MULT[d.kind](s);
  }
  const normal = d.hours - d.overtime;
  return (monthly ? 0 : normal * rate) + d.overtime * rate * s.overtime;
}

export function payFor(input: PayInput, s: PaySettings = DEFAULT_PAY) {
  const { days, open } = dayLines(input, s);
  const monthly = input.payType === "monthly";
  const weeklyRate =
    input.monthlySalary && s.weeklyHours
      ? (input.monthlySalary * 12) / 52 / s.weeklyHours
      : 0;
  const rate = input.hourlyRate || weeklyRate;
  const sum = (f: (d: DayLine) => number) => days.reduce((a, d) => a + f(d), 0);
  const pay = sum((d) => dayPay(d, rate, monthly, s));
  const base = monthly ? (input.monthlySalary ?? 0) : 0;
  const adjust = input.adjustHours * rate;
  return {
    days,
    open,
    rate: r2(rate),
    hours: r2(sum((d) => d.hours) + input.adjustHours),
    overtime: r2(sum((d) => d.overtime)),
    sunday: r2(sum((d) => (d.kind === "sunday" ? d.hours : 0))),
    holiday: r2(sum((d) => (d.kind === "holiday" ? d.hours : 0))),
    adjustHours: r2(input.adjustHours),
    base: r2(base),
    extras: r2(monthly ? pay + adjust : 0),
    gross: r2(base + pay + adjust),
  };
}

/** First day of the month and the day after its last (YYYY-MM-DD). */
export function monthRange(month: string) {
  const [y = 0, m = 1] = month.split("-").map(Number);
  return {
    first: iso(Date.UTC(y, m - 1, 1)),
    next: iso(Date.UTC(y, m, 1)),
    /** 6 days before, so the first week's overtime counts earlier days. */
    weekStart: iso(Date.UTC(y, m - 1, 1) - 6 * DAY_MS),
  };
}
