import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { MAX_BODY } from "../lib/journal/ingest";
import heartbeat from "../lib/metatrader/__tests__/fixtures/ohlc-heartbeat.json";
import history from "../lib/metatrader/__tests__/fixtures/ohlc-history.json";
import snapshot from "../lib/metatrader/__tests__/fixtures/ohlc-snapshot.json";
import ticks from "../lib/metatrader/__tests__/fixtures/ohlc-ticks.json";
import { decodeArchive } from "../lib/metatrader/ohlc-archive";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

// Envelopes written by the EA itself (mql5/tests/OhlcExportSelfTest.mq5)
const FIXTURES: Record<string, unknown> = {
  heartbeat,
  history,
  snapshot,
  ticks,
};
const fixture = (name: string) =>
  structuredClone(FIXTURES[name]) as Record<string, unknown>;

const T = Date.UTC(2026, 9, 14, 9, 0, 0);
const bar = (t: number, close: number) => [t, 1, 2, 0.5, close, 3, 0, 1];

const envelope = (over: Record<string, unknown>) => ({
  ...fixture("heartbeat"),
  ...over,
});

async function setup() {
  const t = convexTest(schema, modules);
  const token = await t
    .withIdentity(panel)
    .mutation(api.journal.ensureToken, {});
  const post = async (body: unknown, auth: "query" | "header" = "query") => {
    const res = await t.fetch(
      auth === "query" ? `/ohlc/mt5?token=${token}` : "/ohlc/mt5",
      {
        method: "POST",
        headers: auth === "header" ? { "X-Feed-Token": token } : {},
        body: typeof body === "string" ? body : JSON.stringify(body),
      }
    );
    return {
      status: res.status,
      body: (await res.json()) as {
        ok: boolean;
        requests?: { id: string; kind: string; tf?: string }[];
        next_ms?: number;
      },
    };
  };
  const bars = (tf: string) =>
    t.run((ctx) =>
      ctx.db
        .query("ohlcBars")
        .filter((q) => q.eq(q.field("tf"), tf))
        .collect()
    );
  return { t, post, bars };
}

describe("POST /ohlc/mt5", () => {
  it("requires the token (query or X-Feed-Token) and a valid feed", async () => {
    const { t, post } = await setup();
    const bad = await t.fetch("/ohlc/mt5?token=x", {
      method: "POST",
      body: JSON.stringify(fixture("heartbeat")),
    });
    expect(bad.status).toBe(401);
    expect((await post(fixture("heartbeat"), "header")).status).toBe(200);
    expect((await post({ v: 1, source: "other" })).status).toBe(400);
    expect((await post("{nope")).status).toBe(400);
    const big = JSON.stringify({ pad: "x".repeat(MAX_BODY) });
    expect((await post(big)).status).toBe(413);
  });

  it("keeps the forming candle live and closed candles in the table", async () => {
    const { t, post, bars } = await setup();
    expect((await post(fixture("snapshot"))).status).toBe(200);
    // Snapshot: 3 M1 candles → 2 closed + 1 forming
    expect((await bars("M1")).map((b) => b.time)).toEqual([T, T + 60_000]);
    const live = await t.query(api.ohlc.live, { symbol: "EURUSD" });
    expect(live?.bars.M1?.[0]).toBe(T + 120_000);
    expect(live?.offsetSec).toBe(10_800);

    // Update of the forming candle, then a new candle that the EA sends
    // alone: the previous forming candle is stored as closed
    await post(
      envelope({
        type: "update",
        seq: 5,
        series: [{ symbol: "EURUSD", tf: "M1", bars: [bar(T + 120_000, 1.3)] }],
      })
    );
    await post(
      envelope({
        type: "update",
        seq: 6,
        series: [{ symbol: "EURUSD", tf: "M1", bars: [bar(T + 180_000, 1.4)] }],
      })
    );
    const stored = await bars("M1");
    expect(stored.map((b) => [b.time, b.c])).toEqual([
      [T, 1.160_08],
      [T + 60_000, 1.160_19],
      [T + 120_000, 1.3],
    ]);
    const series = await t.query(api.ohlc.series, {
      symbol: "EURUSD",
      tf: "M1",
    });
    expect(series?.bars.length).toBe(3);
    const feeds = await t.query(api.ohlc.feeds, {});
    expect(feeds[0]?.symbols.map((s) => s.symbol).sort()).toEqual([
      "EURUSD",
      "XAUUSD",
    ]);
  });

  it("stores ticks in 10-second blocks without repeating a re-sent POST", async () => {
    const { t, post } = await setup();
    await post(fixture("ticks"));
    await post(fixture("ticks"));
    const res = await t.query(api.ohlc.ticks, {
      symbol: "EURUSD",
      since: T,
    });
    expect(res?.rows.length).toBe(5);
    expect(res?.rows[0]).toEqual([T + 120, 1.160_01, 1.160_03, 0, 0, 6]);
  });
});

describe("history requests", () => {
  it("hands each request once, archives the answer and closes it", async () => {
    const { t, post } = await setup();
    await post(fixture("snapshot"));
    const ask = {
      account: "12345",
      kind: "bars" as const,
      symbol: "EURUSD",
      tf: "M1",
      fromMs: T,
      toMs: T + 179_000,
    };
    const id = await t.mutation(api.ohlc.requestHistory, ask);
    // The same stretch is not asked twice
    expect(await t.mutation(api.ohlc.requestHistory, ask)).toBe(id);

    const first = await post(fixture("heartbeat"));
    expect(first.body.requests?.map((r) => [r.id, r.tf])).toEqual([[id, "M1"]]);
    expect(first.body.next_ms).toBe(1000);
    const again = await post(fixture("heartbeat"));
    expect(again.body.requests).toEqual([]);

    // The EA answers with history (request_id) and then "done"
    await post({ ...fixture("history"), request_id: id });
    expect((await t.query(api.ohlc.request, { id }))?.chunks).toBe(1);
    const done = await post(
      envelope({
        type: "history",
        request_id: id,
        done: true,
        first_ms: Date.UTC(2010, 0, 3, 21),
      })
    );
    expect(done.body.next_ms).toBeUndefined();
    expect((await t.query(api.ohlc.request, { id }))?.status).toBe("done");

    const files = await t.query(api.ohlc.archive, {
      kind: "bars",
      symbol: "EURUSD",
      tf: "M1",
    });
    expect(files.length).toBe(1);
    expect(files[0]?.cover).toEqual([[T, T + 179_000]]);
    const rows = await t.run(async (ctx) => {
      const doc = await ctx.db.query("ohlcArchive").first();
      const blob = doc?.file ? await ctx.storage.get(doc.file) : null;
      return blob ? decodeArchive(await blob.arrayBuffer()) : [];
    });
    expect(rows.map((r) => r[0])).toEqual([T, T + 60_000, T + 120_000]);
    const series = await t.query(api.ohlc.series, {
      symbol: "EURUSD",
      tf: "M1",
    });
    expect(series?.firstMs).toBe(Date.UTC(2010, 0, 3, 21));
  });

  it("fails requests without an answer so they can be asked again", async () => {
    vi.useFakeTimers();
    try {
      const { t, post } = await setup();
      await post(fixture("heartbeat"));
      const ask = {
        account: "12345",
        kind: "ticks" as const,
        symbol: "EURUSD",
        fromMs: T,
        toMs: T + 3_600_000,
      };
      const id = await t.mutation(api.ohlc.requestHistory, ask);
      vi.advanceTimersByTime(61_000);
      const second = await t.mutation(api.ohlc.requestHistory, ask);
      expect(second).not.toBe(id);
      expect((await t.query(api.ohlc.request, { id }))?.status).toBe("failed");
      await expect(
        t.mutation(api.ohlc.requestHistory, {
          ...ask,
          toMs: T + 3 * 86_400_000,
        })
      ).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("compaction", () => {
  it("moves old tick blocks and extra candles to the history files", async () => {
    vi.stubEnv("OHLC_KEEP_BARS", "2");
    try {
      const { t, post, bars } = await setup();
      await post(fixture("ticks"));
      const series = Array.from({ length: 6 }, (_, i) =>
        bar(T + i * 60_000, 1 + i / 10)
      );
      await post(
        envelope({
          type: "snapshot",
          series: [{ symbol: "EURUSD", tf: "M1", bars: series }],
        })
      );
      expect((await bars("M1")).length).toBe(5);
      await t.action(internal.ohlc.compact, {});
      // 5 closed candles, keep 2: the 3 oldest went to the month file
      expect((await bars("M1")).map((b) => b.time)).toEqual([
        T + 180_000,
        T + 240_000,
      ]);
      const tickBlocks = await t.run((ctx) =>
        ctx.db.query("ohlcTicks").collect()
      );
      expect(tickBlocks.length).toBe(0);
      const files = await t.run((ctx) => ctx.db.query("ohlcArchive").collect());
      expect(
        files
          .map((f) => [f.kind, f.count])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      ).toEqual([
        ["bars", 3],
        ["ticks", 5],
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
