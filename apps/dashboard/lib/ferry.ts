/**
 * Ferry Sliema ↔ Bugibba (Malta). The timetable depends on the month in
 * Malta: March to October uses the summer table below. The winter table
 * (November to February) has not been published here yet.
 */

export type FerryRoute = "sliema-bugibba" | "bugibba-sliema";

export interface FerryTrip {
  depart: string;
  arrive: string;
}

export interface FerryTimetable {
  id: "summer";
  label: string;
  /** Months it applies to, 1–12. */
  months: number[];
  trips: Record<FerryRoute, FerryTrip[]>;
}

export const FERRY_TZ = "Europe/Malta";

export const ROUTES: { id: FerryRoute; from: string; to: string }[] = [
  { id: "sliema-bugibba", from: "Sliema", to: "Bugibba" },
  { id: "bugibba-sliema", from: "Bugibba", to: "Sliema" },
];

const trips = (pairs: [string, string][]): FerryTrip[] =>
  pairs.map(([depart, arrive]) => ({ depart, arrive }));

export const TIMETABLES: FerryTimetable[] = [
  {
    id: "summer",
    label: "Março a outubro",
    months: [3, 4, 5, 6, 7, 8, 9, 10],
    trips: {
      "sliema-bugibba": trips([
        ["05:45", "06:15"],
        ["06:45", "07:15"],
        ["08:45", "09:15"],
        ["09:45", "10:15"],
        ["11:45", "12:15"],
        ["13:45", "14:15"],
        ["15:45", "16:15"],
        ["16:45", "17:15"],
        ["18:45", "19:15"],
        ["19:45", "20:15"],
        ["22:00", "22:30"],
      ]),
      "bugibba-sliema": trips([
        ["06:00", "06:30"],
        ["08:00", "08:30"],
        ["09:00", "09:30"],
        ["11:00", "11:30"],
        ["12:00", "12:30"],
        ["14:00", "14:30"],
        ["16:00", "16:30"],
        ["18:00", "18:30"],
        ["19:00", "19:30"],
        ["21:00", "21:30"],
        ["22:00", "22:30"],
      ]),
    },
  },
];

/** Month (1–12) and minutes since midnight in Malta. */
export function maltaNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FERRY_TZ,
    month: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { month: get("month"), minutes: get("hour") * 60 + get("minute") };
}

/** The timetable for a month (1–12), or null when none is published. */
export const timetableFor = (month: number) =>
  TIMETABLES.find((t) => t.months.includes(month)) ?? null;

export const toMinutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Index of the next departure at `minutes`, or -1 after the last one. */
export const nextTrip = (list: FerryTrip[], minutes: number) =>
  list.findIndex((t) => toMinutes(t.depart) >= minutes);
