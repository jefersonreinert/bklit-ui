import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayKey, reorder, transferSuggestion } from "../inventory/reorder";

describe("reorder", () => {
  it("orders enough for the cover days plus the minimum, in whole cases", () => {
    // 300 ml/day × 7 days + 700 min = 2800; has 700 → needs 2100 → a case of 6 × 700
    const r = reorder({ onHand: 700, onOrder: 0, perDay: 300, coverDays: 7, min: 700, pack: 4200 });
    assert.deepEqual(r, { target: 2800, packs: 1, qty: 4200, daysLeft: 2.3 });
  });

  it("counts what is on order and orders nothing when covered", () => {
    const r = reorder({ onHand: 700, onOrder: 4200, perDay: 300, coverDays: 7, min: 700, pack: 4200 });
    assert.equal(r.packs, 0);
  });

  it("keeps the par level even without sales", () => {
    const r = reorder({ onHand: 0, onOrder: 0, perDay: 0, coverDays: 7, par: 1400, pack: 700 });
    assert.deepEqual([r.packs, r.daysLeft], [2, null]);
    assert.equal(reorder({ onHand: 0, onOrder: 0, perDay: 0, coverDays: 7, pack: 700 }).packs, 0);
  });

  it("ignores a shortfall smaller than a tenth of a pack", () => {
    assert.equal(reorder({ onHand: 2750, onOrder: 0, perDay: 400, coverDays: 7, pack: 4200 }).packs, 0);
    // Negative stock (sales before a count) counts as nothing
    assert.equal(reorder({ onHand: -500, onOrder: 0, perDay: 100, coverDays: 7, pack: 700 }).packs, 1);
  });

  it("suggests transfers that leave the source covered", () => {
    // Source has 3500, needs 1400 → 2100 spare; destination misses 1500 → 2 bottles
    assert.equal(transferSuggestion({ onHand: 3500, target: 1400 }, { onHand: 100, target: 1600, onOrder: 0 }, 700), 1400);
    assert.equal(transferSuggestion({ onHand: 1000, target: 1400 }, { onHand: 0, target: 700, onOrder: 0 }, 700), 0);
  });

  it("keys days in UTC", () => {
    assert.equal(dayKey(Date.parse("2026-11-15T23:30:00Z")), "2026-11-15");
  });
});
