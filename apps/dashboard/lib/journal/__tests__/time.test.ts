import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { offsetAt, offsetFromSeconds, toUtc, usDst } from "../time";

const H = 3_600_000;

describe("broker clock → UTC", () => {
  it("knows US daylight saving time", () => {
    assert.equal(usDst(Date.UTC(2026, 6, 1)), true);
    assert.equal(usDst(Date.UTC(2026, 0, 15)), false);
    // 2026: 8 March 07:00 UTC to 1 November 06:00 UTC
    assert.equal(usDst(Date.UTC(2026, 2, 8, 6, 59)), false);
    assert.equal(usDst(Date.UTC(2026, 2, 8, 7)), true);
    assert.equal(usDst(Date.UTC(2026, 10, 1, 5, 59)), true);
    assert.equal(usDst(Date.UTC(2026, 10, 1, 6)), false);
  });

  it("New York close: +3 h in summer, +2 h in winter", () => {
    const now = Date.UTC(2026, 9, 12, 19); // October, US DST on
    assert.equal(offsetAt(Date.UTC(2026, 6, 1), 3 * H, now), 3 * H);
    assert.equal(offsetAt(Date.UTC(2026, 0, 15), 3 * H, now), 2 * H);
  });

  it("keeps any other offset constant", () => {
    const now = Date.UTC(2026, 9, 12, 19);
    assert.equal(offsetAt(Date.UTC(2026, 0, 15), 0, now), 0);
    assert.equal(offsetAt(Date.UTC(2026, 0, 15), 2 * H, now), 2 * H);
  });

  it("converts the IC Markets test trade (20:08 server = 17:08 UTC)", () => {
    const now = Date.UTC(2026, 9, 12, 17, 10);
    const server = Date.UTC(2026, 9, 12, 20, 8, 44);
    assert.equal(toUtc(server, 3 * H, now), Date.UTC(2026, 9, 12, 17, 8, 44));
    // A January deal of the same broker is two hours ahead of UTC
    const jan = Date.UTC(2026, 0, 15, 10);
    assert.equal(toUtc(jan, 3 * H, now), Date.UTC(2026, 0, 15, 8));
  });

  it("leaves times alone when the offset is unknown", () => {
    assert.equal(toUtc(123, undefined), 123);
    assert.equal(toUtc(123, 0), 123);
  });

  it("reads server_offset_sec", () => {
    assert.equal(offsetFromSeconds(10_800), 3 * H);
    assert.equal(offsetFromSeconds("7199"), 2 * H);
    assert.equal(offsetFromSeconds(undefined), undefined);
    assert.equal(offsetFromSeconds("x"), undefined);
    assert.equal(offsetFromSeconds(99 * 3600), undefined);
  });
});
