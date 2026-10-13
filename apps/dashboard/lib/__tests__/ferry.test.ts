import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maltaNow, nextTrip, TIMETABLES, timetableFor } from "../ferry";

describe("ferry timetable", () => {
  it("uses the summer table from March to October only", () => {
    assert.equal(timetableFor(3)?.id, "summer");
    assert.equal(timetableFor(10)?.id, "summer");
    assert.equal(timetableFor(11), null);
    assert.equal(timetableFor(2), null);
  });

  it("reads month and time in Malta, not UTC", () => {
    // 31 Oct 23:30 UTC is already 1 Nov 00:30 in Malta (CET, UTC+1)
    const now = maltaNow(new Date("2026-10-31T23:30:00Z"));
    assert.deepEqual(now, { month: 11, minutes: 30 });
  });

  it("finds the next departure", () => {
    const list = TIMETABLES[0]?.trips["sliema-bugibba"] ?? [];
    assert.equal(nextTrip(list, 0), 0);
    assert.equal(list[nextTrip(list, 6 * 60)]?.depart, "06:45");
    assert.equal(list[nextTrip(list, 22 * 60)]?.depart, "22:00");
    assert.equal(nextTrip(list, 22 * 60 + 1), -1);
  });
});
