import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dateKey,
  monthGrid,
  nextShift,
  shiftMinutes,
  shiftState,
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
