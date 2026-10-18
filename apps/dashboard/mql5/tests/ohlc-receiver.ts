/**
 * Test receiver for the CasaBrasaOHLCExport EA (end-to-end test, local).
 *
 *   node --import tsx mql5/tests/ohlc-receiver.ts [port] [out-dir]
 *
 * Validates every POST with parseOhlcFeed, keeps candles and ticks in an
 * OhlcStore and appends each envelope to <out-dir>/feed.jsonl and a one-line
 * summary to <out-dir>/log.txt. Control endpoints (GET):
 *   /__down?sec=60     answers 503 for that long (EA re-sends what it missed)
 *   /__request?kind=bars&symbol=EURUSD&tf=M1&from_ms=…&to_ms=…   queue a request
 *   /__state           counts per series / symbol, seq gaps
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import {
  applyOhlcFeed,
  createOhlcStore,
  parseOhlcFeed,
} from "../../lib/metatrader/ohlc-feed";

const port = Number(process.argv[2] ?? 8787);
const out = process.argv[3] ?? "ohlc-e2e";
mkdirSync(out, { recursive: true });
const store = createOhlcStore();
let downUntil = 0;
let nextId = 1;
const queue: Record<string, unknown>[] = [];

const log = (line: string) => {
  appendFileSync(join(out, "log.txt"), `${new Date().toISOString()} ${line}\n`);
};

const state = () => ({
  account: store.account,
  lastSeq: store.lastSeq,
  missedSeq: store.missedSeq,
  series: Object.fromEntries([...store.series].map(([k, v]) => [k, v.length])),
  ticks: Object.fromEntries([...store.ticks].map(([k, v]) => [k, v.length])),
});

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && url.pathname === "/__down") {
    downUntil = Date.now() + Number(url.searchParams.get("sec") ?? 60) * 1000;
    log(`DOWN until ${new Date(downUntil).toISOString()}`);
    return send(200, { downUntil });
  }
  if (req.method === "GET" && url.pathname === "/__request") {
    const p = url.searchParams;
    const r = {
      id: `req${nextId++}`,
      kind: p.get("kind") ?? "bars",
      symbol: p.get("symbol") ?? "EURUSD",
      ...(p.get("tf") ? { tf: p.get("tf") } : {}),
      from_ms: Number(p.get("from_ms")),
      to_ms: Number(p.get("to_ms")),
    };
    queue.push(r);
    log(`REQUEST ${JSON.stringify(r)}`);
    return send(200, r);
  }
  if (req.method === "GET" && url.pathname === "/__state") {
    writeFileSync(join(out, "state.json"), JSON.stringify(state(), null, 1));
    return send(200, state());
  }
  let raw = "";
  req.on("data", (c: Buffer) => {
    raw += c.toString("utf8");
  });
  req.on("end", () => {
    if (Date.now() < downUntil) {
      log("503 (down)");
      return send(503, { ok: false, error: "down" });
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      log(`400 bad json (${raw.length} bytes)`);
      return send(400, { ok: false, error: "bad_json" });
    }
    const feed = parseOhlcFeed(body);
    if (!feed) {
      log(`400 bad feed ${raw.slice(0, 200)}`);
      return send(400, { ok: false, error: "bad_feed" });
    }
    applyOhlcFeed(store, feed);
    appendFileSync(join(out, "feed.jsonl"), `${raw}\n`);
    const bars = feed.series.reduce((n, s) => n + s.bars.length, 0);
    const ticks = feed.ticks.reduce((n, t) => n + t.rows.length, 0);
    log(
      `${feed.type} seq=${feed.seq} series=${feed.series.length} bars=${bars} ticks=${ticks}` +
        `${feed.requestId ? ` req=${feed.requestId}` : ""}${feed.done ? " DONE" : ""}` +
        `${feed.error ? ` error=${feed.error}` : ""} bytes=${raw.length} lag=${Date.now() - feed.sentMs}ms`
    );
    const handed = queue.splice(0, queue.length);
    send(200, {
      ok: true,
      requests: handed,
      ...(handed.length > 0 ? { next_ms: 1000 } : {}),
    });
  });
}).listen(port, "127.0.0.1", () => log(`listening on ${port}`));
