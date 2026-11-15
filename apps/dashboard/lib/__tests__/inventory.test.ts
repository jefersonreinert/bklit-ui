import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  averageCost,
  contentOfWeight,
  countedQty,
  densityOf,
  describeQty,
} from "../inventory/units";

const gin = { unit: "ml" as const, size: 700, emptyG: 500, fullG: 1150, abv: 43 };

describe("inventory units", () => {
  it("weighs a bottle against its own empty and full weights", () => {
    assert.deepEqual(contentOfWeight(825, gin), { qty: 350, estimated: false });
    assert.deepEqual(contentOfWeight(500, gin), { qty: 0, estimated: false });
    // A heavier reading (wet bottle) never counts more than full
    assert.deepEqual(contentOfWeight(1200, gin), { qty: 700, estimated: false });
    assert.deepEqual(contentOfWeight(400, gin), { qty: 0, estimated: false });
  });

  it("estimates with the density when only the empty weight is known", () => {
    const r = contentOfWeight(800, { ...gin, fullG: undefined });
    assert.equal(r?.estimated, true);
    // 300 g of 43% spirit ≈ 300 / 0.9097 ≈ 329.8 ml
    assert.ok(r && Math.abs(r.qty - 329.8) < 0.5);
    assert.equal(contentOfWeight(800, { ...gin, emptyG: undefined }), null);
    assert.ok(Math.abs(densityOf(40) - 0.916) < 0.001);
  });

  it("adds full containers, weighed bottles and loose quantity", () => {
    assert.deepEqual(countedQty({ full: 3, weights: [825, 1150], loose: 25 }, gin), {
      qty: 3 * 700 + 350 + 700 + 25,
      estimated: false,
    });
    assert.throws(
      () => countedQty({ full: 0, weights: [800], loose: 0 }, { ...gin, emptyG: undefined }),
      /NO_PROFILE/
    );
    assert.throws(() => countedQty({ full: -1, weights: [], loose: 0 }, gin), /NEGATIVE/);
    assert.deepEqual(countedQty({ full: 6, weights: [], loose: 0 }, { unit: "un", size: 1 }), {
      qty: 6,
      estimated: false,
    });
  });

  it("keeps a weighted average cost", () => {
    assert.equal(averageCost(700, 0.03, 700, 0.05), 0.04);
    assert.equal(averageCost(0, 0, 4200, 0.02), 0.02);
    // Negative stock does not drag the new cost
    assert.equal(averageCost(-100, 0.03, 700, 0.05), 0.05);
    assert.equal(averageCost(700, 0.03, 0, 0.05), 0.03);
  });

  it("reads quantities the way people count them", () => {
    const p = { ...gin, container: "garrafa" };
    assert.equal(describeQty(1750, p), "2 garrafas + 350 ml");
    assert.equal(describeQty(700, p), "1 garrafa");
    assert.equal(describeQty(300, p), "300 ml");
    assert.equal(describeQty(-1400, p), "−2 garrafas");
    assert.equal(describeQty(12, { unit: "un", size: 1, container: "lata" }), "12 un");
  });
});
