import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  CURRENCY_FLAGS,
  pairOf,
} from "../../../components/pages/trading/symbol-icon";

describe("forex flags", () => {
  it("reads Yahoo and MT5 pairs", () => {
    assert.deepEqual(pairOf("EURUSD=X"), ["EUR", "USD"]);
    assert.deepEqual(pairOf("BRL=X"), ["USD", "BRL"]);
    assert.deepEqual(pairOf("mt5:GBPJPY"), ["GBP", "JPY"]);
    assert.deepEqual(pairOf("mt5:EURUSD.r"), ["EUR", "USD"]);
    assert.deepEqual(pairOf("mt5:AUDCADm"), ["AUD", "CAD"]);
    assert.equal(pairOf("mt5:XAUUSD"), null);
    assert.equal(pairOf("mt5:US500"), null);
    assert.equal(pairOf("AAPL"), null);
  });

  it("has a round flag file for every currency", () => {
    for (const code of Object.values(CURRENCY_FLAGS)) {
      assert.ok(
        existsSync(
          join(import.meta.dirname, "../../../public/flags", `${code}.svg`)
        ),
        code
      );
    }
  });
});
