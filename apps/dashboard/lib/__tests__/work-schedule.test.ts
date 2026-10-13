import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dateKey,
  monthGrid,
  monthReport,
  nextShift,
  openPunch,
  punchMinutes,
  reportCSV,
  shiftMinutes,
  shiftState,
  type WorkPunch,
  type WorkShift,
  weekStart,
} from "../work-schedule";

const shift = (date: string, start: string, end: string): WorkShift => ({
  id: `${date}-${start}`,
  date,
  start,
  end,
  place: "p1",
});

describe("work schedule", () => {
  it("measures normal and overnight shifts", () => {
    assert.equal(shiftMinutes({ start: "09:00", end: "17:30" }), 510);
    assert.equal(shiftMinutes({ start: "22:00", end: "06:00" }), 480);
  });

  it("starts weeks on Monday and fills a 6-week month grid", () => {
    // 2026-10-13 is a Tuesday
    assert.equal(dateKey(weekStart(new Date(2026, 9, 13))), "2026-10-12");
    const grid = monthGrid(new Date(2026, 9, 13));
    assert.equal(grid.length, 42);
    assert.equal(dateKey(grid[0] ?? new Date()), "2026-09-28");
  });

  it("knows if a shift is ahead, running or done", () => {
    const s = shift("2026-10-13", "09:00", "17:00");
    assert.equal(shiftState(s, 8 * 60), "before");
    assert.equal(shiftState(s, 12 * 60), "now");
    assert.equal(shiftState(s, 17 * 60), "after");
  });

  it("finds the next shift that has not ended", () => {
    const list = [
      shift("2026-10-14", "10:00", "18:00"),
      shift("2026-10-13", "09:00", "12:00"),
      shift("2026-10-13", "14:00", "20:00"),
    ];
    const now = new Date(2026, 9, 13, 13, 0);
    assert.equal(nextShift(list, now)?.start, "14:00");
    const late = new Date(2026, 9, 13, 21, 0);
    assert.equal(nextShift(list, late)?.date, "2026-10-14");
  });
});

describe("time clock", () => {
  const places = [
    { id: "p1", name: "Sliema" },
    { id: "p2", name: "St Julian's, Bay" },
    { id: "p3", name: "Valletta" },
  ];
  const punch = (
    date: string,
    inAt: string,
    out: string | null,
    place: string
  ): WorkPunch => ({ id: `${date}-${inAt}`, date, in: inAt, out, place });

  it("counts an open punch up to now", () => {
    const p = punch("2026-10-13", "09:00", null, "p1");
    assert.equal(punchMinutes(p, new Date(2026, 9, 13, 11, 30)), 150);
    assert.equal(openPunch([p])?.id, p.id);
  });

  it("totals the month per place, days and hours", () => {
    const list = [
      punch("2026-10-01", "09:00", "17:00", "p1"),
      punch("2026-10-01", "18:00", "22:00", "p2"),
      punch("2026-10-02", "22:00", "06:00", "p1"),
      punch("2026-09-30", "09:00", "17:00", "p1"),
      punch("2026-10-03", "09:00", null, "p3"),
    ];
    const r = monthReport(list, places, "2026-10");
    assert.equal(r.rows.length, 3);
    assert.equal(r.days, 2);
    assert.equal(r.minutes, (8 + 4 + 8) * 60);
    assert.deepEqual(
      r.byPlace.map((t) => [t.place.id, t.days, t.minutes]),
      [
        ["p1", 2, 960],
        ["p2", 1, 240],
        ["p3", 0, 0],
      ]
    );
    const csv = reportCSV(r, places);
    assert.ok(csv.includes('2026-10-01,"St Julian\'s, Bay",18:00,22:00,4.00'));
    assert.ok(csv.includes("Total,2,20.00"));
  });
});
