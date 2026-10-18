import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mt5Equivalent,
  parseTimeframe,
  sourceFor,
  tfLabel,
} from "../timeframe";

const tf = (text: string) => {
  const parsed = parseTimeframe(text);
  if (!parsed) {
    throw new Error(`invalid timeframe ${text}`);
  }
  return parsed;
};

describe("parseTimeframe", () => {
  it("reads seconds, minutes, hours, days, weeks, months and ticks", () => {
    assert.deepEqual(tf("2s"), { id: "2s", unit: "s", n: 2, ms: 2000 });
    assert.deepEqual(tf("7m"), { id: "7m", unit: "m", n: 7, ms: 420_000 });
    assert.deepEqual(tf("3H"), { id: "3h", unit: "h", n: 3, ms: 10_800_000 });
    assert.equal(tf("2d").id, "2D");
    assert.equal(tf("D").id, "1D");
    assert.equal(tf("1W").id, "1W");
    assert.equal(tf("M").id, "1M");
    assert.deepEqual(tf("100T"), { id: "100T", unit: "T", n: 100, ms: 0 });
  });

  it("reads MT5 names", () => {
    assert.equal(tf("M15").id, "15m");
    assert.equal(tf("h4").id, "4h");
    assert.equal(tf("D1").id, "1D");
    assert.equal(tf("MN1").id, "1M");
  });

  it("rejects invalid text and values out of range", () => {
    for (const bad of ["", "0s", "x", "5x", "1.5m", "-2s", "M7", "2 seconds"]) {
      assert.equal(parseTimeframe(bad), null, bad);
    }
    assert.ok(parseTimeframe("1s"));
    assert.ok(parseTimeframe("365D"));
    assert.equal(parseTimeframe("400D"), null);
    assert.ok(parseTimeframe("100000T"));
    assert.equal(parseTimeframe("100001T"), null);
  });

  it("labels hours and weeks like the platform", () => {
    assert.equal(tfLabel(tf("4h")), "4H");
    assert.equal(tfLabel(tf("1W")), "1S");
  });
});

describe("sourceFor", () => {
  const cases: [string, string][] = [
    ["2s", "ticks"],
    ["90s", "ticks"],
    ["100T", "ticks"],
    ["7m", "M1×7"],
    ["45m", "M15×3"],
    ["90m", "M30×3"],
    ["2h", "H2×1"],
    ["3h", "H3×1"],
    ["2D", "D1×2"],
    ["5m", "M5×1"],
    ["2W", "W1×2"],
    ["3M", "MN1×3"],
  ];
  for (const [text, want] of cases) {
    it(`${text} → ${want}`, () => {
      const s = sourceFor(tf(text));
      assert.equal(s.kind === "ticks" ? "ticks" : `${s.tf}×${s.factor}`, want);
    });
  }

  it("knows which ones are exactly an MT5 timeframe", () => {
    assert.equal(mt5Equivalent(tf("M5")), "M5");
    assert.equal(mt5Equivalent(tf("1D")), "D1");
    assert.equal(mt5Equivalent(tf("7m")), null);
  });
});
