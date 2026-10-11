import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findMtTool,
  isoDay,
  isTradeTool,
  MT_TOOLS,
  normalizeArgs,
} from "../catalog";
import { isEmptyValue, parseCsv, sumColumn, toTable } from "../data";
import { parseSse, toolValue } from "../mcp";

describe("catalog", () => {
  it("mirrors the server's tools with unique names", () => {
    const names = MT_TOOLS.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
    for (const name of [
      "get_account_info",
      "place_market_order",
      "close_all_losing_positions",
      "cancel_pending_orders_by_symbol",
      "get_deals",
    ]) {
      assert.ok(findMtTool(name), name);
    }
  });

  it("marks only reads as safe", () => {
    assert.equal(isTradeTool("get_all_positions"), false);
    assert.equal(isTradeTool("close_position"), true);
    assert.equal(isTradeTool("unknown_tool"), true);
  });

  it("normalizes ids, numbers and sides", () => {
    const tool = findMtTool("place_pending_order");
    assert.deepEqual(
      normalizeArgs(tool, {
        symbol: "EURUSD",
        volume: "0,05",
        type: "buy",
        price: "1.1",
        stop_loss: "",
      }),
      { symbol: "EURUSD", volume: 0.05, type: "BUY", price: 1.1 }
    );
    assert.deepEqual(
      normalizeArgs(findMtTool("close_position"), { id: "123" }),
      {
        id: 123,
      }
    );
  });

  it("builds REST dates", () => {
    assert.equal(isoDay("2026-01-02", "00:00:00"), "2026-01-02T00:00:00");
    assert.equal(isoDay("2026-01-02 10:30", "x"), "2026-01-02T10:30");
  });
});

describe("pandas CSV", () => {
  it("drops the index column and types cells", () => {
    const t = parseCsv(
      ',id,symbol,type,volume,profit\n0,123,EURUSD,BUY,0.1,12.5\n1,124,"GBP,USD",SELL,0.2,-3\n'
    );
    assert.deepEqual(t.columns, ["id", "symbol", "type", "volume", "profit"]);
    assert.equal(t.rows[1]?.symbol, "GBP,USD");
    assert.equal(sumColumn(t, "profit"), 9.5);
  });

  it("recognizes empty answers and lists", () => {
    assert.equal(isEmptyValue("Empty DataFrame\nColumns: []"), true);
    assert.equal(isEmptyValue([]), true);
    assert.deepEqual(toTable(["EURUSD", "GBPUSD"])?.rows, [
      { valor: "EURUSD" },
      { valor: "GBPUSD" },
    ]);
  });
});

describe("MCP wire format", () => {
  it("parses SSE events", () => {
    const ev = parseSse(
      'event: endpoint\ndata: /messages/?session_id=1\n\nevent: message\ndata: {"a":1}\n\n'
    );
    assert.deepEqual(ev, [
      { event: "endpoint", data: "/messages/?session_id=1" },
      { event: "message", data: '{"a":1}' },
    ]);
  });

  it("reads tool values from text, lists and structured content", () => {
    assert.deepEqual(
      toolValue({ content: [{ type: "text", text: '{"balance":10}' }] }),
      { ok: true, value: { balance: 10 } }
    );
    assert.deepEqual(
      toolValue({
        content: [
          { type: "text", text: "EURUSD" },
          { type: "text", text: "GBPUSD" },
        ],
      }).value,
      ["EURUSD", "GBPUSD"]
    );
    assert.deepEqual(
      toolValue({ structuredContent: { result: [1] } }).value,
      [1]
    );
    assert.equal(
      toolValue({
        content: [{ type: "text", text: '{"error":true,"message":"x"}' }],
      }).ok,
      false
    );
    assert.equal(toolValue({ isError: true, content: [] }).ok, false);
  });
});
