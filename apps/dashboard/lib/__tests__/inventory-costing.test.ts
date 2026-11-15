import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CostRecipe,
  grossMargin,
  grossQty,
  netOfVat,
  RecipeCycleError,
  recipeCost,
  suggestedPrice,
} from "../inventory/costing";

// Cost per ml: gin 0.04, Campari 0.025, vermouth 0.015, sugar 0.002 per g
const costs: Record<string, number> = { gin: 0.04, campari: 0.025, vermouth: 0.015, sugar: 0.002 };
const itemCost = (id: string) => costs[id] ?? null;

const syrup: CostRecipe = {
  id: "syrup",
  yieldQty: 1500, // 1 kg sugar + 1 l water ≈ 1.5 l
  lines: [{ itemId: "sugar", qty: 1000, waste: 0 }],
};
const negroni: CostRecipe = {
  id: "negroni",
  yieldQty: 1,
  lines: [
    { itemId: "gin", qty: 30, waste: 0 },
    { itemId: "campari", qty: 30, waste: 0 },
    { itemId: "vermouth", qty: 30, waste: 0 },
  ],
};

describe("recipe costing", () => {
  it("adds up the ingredients", () => {
    const r = recipeCost(negroni, new Map(), itemCost);
    // 30 × (0.04 + 0.025 + 0.015) = 2.40
    assert.equal(r.cost, 2.4);
    assert.deepEqual(r.lineCosts, [1.2, 0.75, 0.45]);
    assert.deepEqual(r.missing, []);
  });

  it("counts the loss on top of what is used", () => {
    assert.equal(grossQty({ qty: 300, waste: 0.25 }), 400);
    const steak: CostRecipe = { id: "s", yieldQty: 1, lines: [{ itemId: "gin", qty: 300, waste: 0.25 }] };
    assert.equal(recipeCost(steak, new Map(), itemCost).cost, 16);
  });

  it("costs a prep per unit of its yield", () => {
    const sour: CostRecipe = {
      id: "sour",
      yieldQty: 1,
      lines: [
        { itemId: "gin", qty: 50, waste: 0 },
        { prepId: "syrup", qty: 15, waste: 0 },
      ],
    };
    const r = recipeCost(sour, new Map([["syrup", syrup]]), itemCost);
    // syrup: 2.00 / 1500 ml × 15 ml = 0.02; gin 2.00
    assert.equal(r.cost, 2.02);
  });

  it("reports ingredients without a cost and loops between preps", () => {
    const r = recipeCost(
      { id: "x", yieldQty: 1, lines: [{ itemId: "lime", qty: 1, waste: 0 }, { itemId: "gin", qty: 10, waste: 0 }] },
      new Map(),
      itemCost
    );
    assert.deepEqual([r.cost, r.missing, r.lineCosts[0]], [0.4, ["lime"], null]);
    const a: CostRecipe = { id: "a", yieldQty: 1, lines: [{ prepId: "b", qty: 1, waste: 0 }] };
    const b: CostRecipe = { id: "b", yieldQty: 1, lines: [{ prepId: "a", qty: 1, waste: 0 }] };
    assert.throws(() => recipeCost(a, new Map([["a", a], ["b", b]]), itemCost), RecipeCycleError);
  });

  it("works out margin and a suggested menu price with VAT", () => {
    assert.equal(netOfVat(11.8, 18), 10);
    // €11.80 with 18% VAT = €10 net; cost 2.40 → 76% margin
    assert.equal(grossMargin(11.8, 18, 2.4), 0.76);
    assert.equal(grossMargin(0, 18, 2.4), null);
    // 2.40 / (1 − 0.8) × 1.18 = 14.16 → 14.50
    assert.equal(suggestedPrice(2.4, 0.8, 18), 14.5);
    // 0.50 / 0.2 × 1.18 = 2.95 → 3.00 (steps of 0.10 below €5)
    assert.equal(suggestedPrice(0.5, 0.8, 18), 3);
    assert.equal(suggestedPrice(0, 0.8, 18), null);
  });
});
