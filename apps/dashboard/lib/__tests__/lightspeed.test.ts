import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flattenMenu, gridTables, parseSale, parseTokens } from "../lightspeed/k-series";

describe("Lightspeed K-Series parsers", () => {
  it("reads tokens (25 min access, offline refresh)", () => {
    const t = parseTokens({ access_token: "a", refresh_token: "r", expires_in: 1500, refresh_expires_in: 0 }, 1000);
    assert.equal(t.accessExpiresAt, 1000 + 1_500_000);
    assert.equal(t.refreshExpiresAt, 0);
    assert.throws(() => parseTokens({}, 0));
  });

  it("flattens nested menu screens and skips sub-items", () => {
    const items = flattenMenu({
      menuName: "M",
      menuEntryGroups: [
        { "@type": "group", name: "Beer", menuEntry: [
          { "@type": "menuItem", productName: "IPA", productPrice: 5, sku: "1" },
          { "@type": "menuItem", productName: "Extra shot", productPrice: 1, sku: "2", asSubItem: true },
          { "@type": "group", name: "Draft", menuEntry: [{ "@type": "menuItem", productName: "Lager", productPrice: 4, sku: "3" }] },
        ] },
      ],
    });
    assert.deepEqual(items.map((i) => [i.name, i.group, i.subgroup]), [["IPA", "Beer", undefined], ["Lager", "Beer", "Draft"]]);
  });

  it("parses string amounts of a sale", () => {
    const s = parseSale({ receiptId: "R", timeClosed: "2026-01-01T10:00:00Z", salesLines: [{ name: "X", quantity: "1.5", totalNetAmountWithTax: "3.30" }], payments: [{ code: "CASH", netAmountWithTax: "3.30", tip: "0.20" }] });
    assert.equal(s?.total, 3.3);
    assert.equal(s?.tips, 0.2);
    assert.equal(s?.lines[0]?.qty, 1.5);
    assert.equal(parseSale({ receiptId: "" }), null);
  });

  it("lays tables inside the floor", () => {
    const g = gridTables(Array.from({ length: 30 }, (_, i) => ({ id: String(i), number: i + 1, name: "", seats: 2 })), "x");
    for (const t of g) {
      assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= 1000 && t.y + t.h <= 700, JSON.stringify(t));
    }
  });
});
