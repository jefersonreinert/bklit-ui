import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CostRecipe } from "../inventory/costing";
import { detectColumns, expandRecipe, parseCsv, parseNumber, salesFromCsv } from "../inventory/usage";

const syrup: CostRecipe = { id: "syrup", yieldQty: 1500, lines: [{ itemId: "sugar", qty: 1000, waste: 0 }] };
const sour: CostRecipe = {
  id: "sour",
  yieldQty: 1,
  lines: [
    { itemId: "gin", qty: 50, waste: 0 },
    { prepId: "syrup", qty: 15, waste: 0 },
    { itemId: "lemon", qty: 30, waste: 0.25 },
  ],
};

describe("sales usage", () => {
  it("opens a sale into stock items, through preps and losses", () => {
    const used = expandRecipe(sour, 3, new Map([["syrup", syrup]]));
    assert.deepEqual(Object.fromEntries(used), {
      gin: 150,
      sugar: 30, // 3 × 15 ml of syrup = 45 ml → 45 / 1500 × 1000 g
      lemon: 120, // 3 × 30 / 0.75
    });
  });

  it("reads CSV with any separator and quotes", () => {
    assert.deepEqual(parseCsv('a;b\n"x;1";2\r\n'), [["a", "b"], ["x;1", "2"]]);
    assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
    assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  });

  it("finds the columns and the sold lines of an export", () => {
    assert.deepEqual(detectColumns(["SKU", "Product name", "Quantity", "Revenue"]), { sku: 0, name: 1, qty: 2 });
    assert.equal(detectColumns(["Date", "Total"]), null);
    const csv = [
      "Sales by product,,,",
      "SKU,Product,Qty,Revenue",
      "N1,Negroni,12,141.60",
      "AP,Aperol Spritz,\"1,5\",10",
      "Total,,13.5,151.6",
      "X,Water,0,0",
    ].join("\n");
    const r = salesFromCsv(csv);
    assert.deepEqual(r.lines, [
      { sku: "N1", name: "Negroni", qty: 12 },
      { sku: "AP", name: "Aperol Spritz", qty: 1.5 },
    ]);
  });

  it("reads numbers written the European or the English way", () => {
    assert.equal(parseNumber("1.234,5"), 1234.5);
    assert.equal(parseNumber("1,234.5"), 1234.5);
    assert.equal(parseNumber("€ 12"), 12);
    assert.ok(Number.isNaN(parseNumber("")));
  });
});
