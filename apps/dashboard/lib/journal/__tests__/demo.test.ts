import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupBy, sessionOf } from "../analytics";
import { DEMO_ACCOUNT, demoDeals, demoNotes, demoSignals } from "../demo";
import { buildTrades, computeStats } from "../metrics";

const NOW = Date.UTC(2026, 9, 11, 12);

describe("demo journal data", () => {
  it("is deterministic and builds closed trades with stops", () => {
    const deals = demoDeals(NOW);
    assert.deepEqual(deals, demoDeals(NOW));
    assert.ok(deals.length > 400);
    assert.ok(deals.every((d) => d.account === DEMO_ACCOUNT && d.time < NOW));
    const trades = buildTrades(deals);
    assert.equal(trades.length * 2, deals.length);
    assert.ok(trades.every((t) => t.closeTime !== null && t.r !== null));
    const s = computeStats(trades);
    assert.ok(s.net > 0 && s.winRate > 0.4 && s.winRate < 0.7);
  });

  it("spreads trades over models, sessions and months", () => {
    const trades = buildTrades(demoDeals(NOW));
    assert.ok(groupBy(trades, (t) => t.comment || `EA ${t.magic}`).length >= 5);
    assert.ok(groupBy(trades, (t) => sessionOf(t.openTime)).length >= 4);
    const months = new Set(
      trades.map((t) => new Date(t.openTime).getUTCMonth())
    );
    assert.equal(months.size, 12);
  });

  it("adds notes and TradingView alerts tied to the demo", () => {
    const notes = demoNotes(NOW);
    assert.ok(notes.length > 50);
    assert.ok(notes.every((n) => n.key.startsWith(`${DEMO_ACCOUNT}:`)));
    assert.equal(demoSignals(NOW).length, 25);
  });
});
