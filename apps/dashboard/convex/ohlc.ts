import { type Infer, v } from "convex/values";
import {
  type ArchiveKind,
  appendRows,
  decodeArchive,
  encodeArchive,
  type Interval,
  mergeIntervals,
  type Row,
  replaceRows,
  splitByPeriod,
  upsertRows,
} from "../lib/metatrader/ohlc-archive";
import {
  isOhlcTf,
  OHLC_TF_SEC,
  type OhlcCandle,
  type OhlcFeed,
  type OhlcTick,
} from "../lib/metatrader/ohlc-feed";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

/**
 * OHLC feed of the CasaBrasaOHLCExport EA (POST /ohlc/mt5 in http.ts).
 *
 * Storage, chosen for cost (every write and every reactive re-read counts):
 * - ohlcLive: one small row per symbol with the forming candle of every
 *   timeframe. The EA rewrites it up to twice a second; the chart
 *   subscribes to it for real time.
 * - ohlcBars: closed candles only (written once per candle close), the
 *   newest OHLC_KEEP_BARS (5000) of each series.
 * - ohlcTicks: ticks in 10-second blocks, one row per block (a POST appends
 *   to one or two small rows), kept for OHLC_TICK_WINDOW_MS (2 h).
 * - ohlcArchive + File Storage: everything older, gzip files per month
 *   (candles) or day (ticks). The cron moves aged rows there; history the
 *   EA sends (backfill, on-demand requests) goes straight there.
 * - ohlcRequests: history the chart asked for, handed to the EA in the
 *   webhook answer and closed when the EA reports the end.
 *
 * Open like the rest of Gráficos → Operar (prices are not private); the
 * webhook needs the journal token.
 */

const positive = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
/** Closed candles kept in the table per series (the rest goes to files). */
export const keepBars = () => positive(process.env.OHLC_KEEP_BARS, 5000);
/** Tick blocks kept in the table (the rest goes to files). */
export const tickWindowMs = () =>
  positive(process.env.OHLC_TICK_WINDOW_MS, 2 * 3_600_000);

export const TICK_BLOCK_MS = 10_000;
/** A request with no sign of life from the EA for this long fails. */
export const REQUEST_TTL = 60_000;
const MAX_HANDED = 5;
/** Candles moved to files per series per cron run. */
const COMPACT_BARS = 4000;
const MAX_QUERY_BARS = 5000;
const MAX_QUERY_TICKS = 50_000;
/** Largest request: candles and ticks (one day). */
const MAX_REQUEST_BARS = 100_000;
const MAX_REQUEST_TICKS_MS = 86_400_000;

const chart = v.union(v.literal("bid"), v.literal("last"));
const kind = v.union(v.literal("bars"), v.literal("ticks"));
const row = v.array(v.number());

const seriesArg = v.object({
  symbol: v.string(),
  tf: v.string(),
  digits: v.number(),
  firstMs: v.optional(v.number()),
  bars: v.array(row),
});
const ticksArg = v.object({
  symbol: v.string(),
  digits: v.number(),
  chart,
  rows: v.array(row),
});
const ingestArgs = {
  account: v.string(),
  server: v.string(),
  broker: v.string(),
  offsetSec: v.number(),
  seq: v.number(),
  sentMs: v.number(),
  now: v.number(),
  series: v.array(seriesArg),
  ticks: v.array(ticksArg),
  request: v.optional(
    v.object({
      id: v.string(),
      done: v.boolean(),
      error: v.optional(v.string()),
      firstMs: v.optional(v.number()),
      ticksEndMs: v.optional(v.number()),
    })
  ),
};
const ingestValidator = v.object(ingestArgs);
type IngestArgs = Infer<typeof ingestValidator>;

export const barRow = (c: OhlcCandle): Row => [
  c.time,
  c.open,
  c.high,
  c.low,
  c.close,
  c.volume,
  c.realVolume,
  c.spread,
];

export const tickRow = (t: OhlcTick): Row => [
  t.time,
  t.bid,
  t.ask,
  t.last,
  t.volume,
  t.flags,
];

/* ------------------------------- webhook -------------------------------- */

export interface HandedRequest {
  id: string;
  kind: "bars" | "ticks";
  symbol: string;
  tf?: string;
  from_ms: number;
  to_ms: number;
}

/** History (backfill, catch-up, requests) goes straight to the files. */
async function archiveHistory(ctx: ActionCtx, feed: OhlcFeed) {
  for (const s of feed.series) {
    const from = s.fromMs ?? s.bars[0]?.time;
    const to = s.toMs ?? s.bars.at(-1)?.time;
    if (from !== undefined && to !== undefined) {
      await archiveBlock(ctx, {
        account: feed.account,
        kind: "bars",
        symbol: s.symbol,
        tf: s.tf,
        pieces: [{ rows: s.bars.map(barRow), from, to }],
      });
    }
  }
  for (const t of feed.ticks) {
    const from = t.fromMs ?? t.rows[0]?.time;
    const to = t.toMs ?? t.rows.at(-1)?.time;
    if (from !== undefined && to !== undefined) {
      await archiveBlock(ctx, {
        account: feed.account,
        kind: "ticks",
        symbol: t.symbol,
        tf: "",
        pieces: [{ rows: t.rows.map(tickRow), from, to }],
      });
    }
  }
}

const requestOf = (feed: OhlcFeed): IngestArgs["request"] =>
  feed.requestId
    ? {
        id: feed.requestId,
        done: feed.done === true,
        ...(feed.error ? { error: feed.error } : {}),
        ...(feed.firstMs === undefined ? {} : { firstMs: feed.firstMs }),
        ...(feed.ticksEndMs === undefined
          ? {}
          : { ticksEndMs: feed.ticksEndMs }),
      }
    : undefined;

/** Mutation arguments: live rows only when the envelope is not history. */
function ingestArgsOf(
  feed: OhlcFeed,
  history: boolean,
  now: number
): IngestArgs {
  const request = requestOf(feed);
  return {
    account: feed.account,
    server: feed.server,
    broker: feed.broker,
    offsetSec: feed.offsetSec,
    seq: feed.seq,
    sentMs: feed.sentMs,
    now,
    series: feed.series.map((s) => ({
      symbol: s.symbol,
      tf: s.tf,
      digits: s.digits,
      ...(s.firstMs === undefined ? {} : { firstMs: s.firstMs }),
      bars: history ? [] : s.bars.map(barRow),
    })),
    ticks: feed.ticks.map((t) => ({
      symbol: t.symbol,
      digits: t.digits,
      chart: t.chart,
      rows: history ? [] : t.rows.map(tickRow),
    })),
    ...(request ? { request } : {}),
  };
}

/**
 * Stores one envelope and returns the answer for the EA. Live data goes to
 * the tables; history (backfill, catch-up, requests) to the files. Only
 * returns after everything is stored: the EA advances on a 2xx.
 */
export async function ingestOhlc(ctx: ActionCtx, feed: OhlcFeed, now: number) {
  const history = feed.type === "history" || feed.requestId !== undefined;
  if (history) {
    await archiveHistory(ctx, feed);
  }
  return await ctx.runMutation(
    internal.ohlc.ingest,
    ingestArgsOf(feed, history, now)
  );
}

async function seriesOf(
  ctx: QueryCtx,
  account: string,
  symbol: string,
  tf: string
) {
  return await ctx.db
    .query("ohlcSeries")
    .withIndex("by_series", (q) =>
      q.eq("account", account).eq("symbol", symbol).eq("tf", tf)
    )
    .unique();
}

async function liveOf(ctx: QueryCtx, account: string, symbol: string) {
  return await ctx.db
    .query("ohlcLive")
    .withIndex("by_account_symbol", (q) =>
      q.eq("account", account).eq("symbol", symbol)
    )
    .unique();
}

const sameRow = (a: Row | undefined, b: Row) =>
  !!a && a.length === b.length && a.every((x, i) => x === b[i]);

const barFields = (r: Row) => ({
  o: r[1] ?? 0,
  h: r[2] ?? 0,
  l: r[3] ?? 0,
  c: r[4] ?? 0,
  tv: r[5] ?? 0,
  rv: r[6] ?? 0,
  sp: r[7] ?? 0,
});

const docRow = (b: Doc<"ohlcBars">): Row => [
  b.time,
  b.o,
  b.h,
  b.l,
  b.c,
  b.tv,
  b.rv,
  b.sp,
];

/** Upserts closed candles (one range read per series). */
async function upsertBars(
  ctx: MutationCtx,
  key: { account: string; symbol: string; tf: string },
  rows: Row[],
  firstMs: number | undefined
) {
  const meta = await seriesOf(ctx, key.account, key.symbol, key.tf);
  if (rows.length === 0) {
    if (meta && firstMs !== undefined && meta.firstMs !== firstMs) {
      await ctx.db.patch(meta._id, { firstMs });
    }
    return;
  }
  const times = rows.map((r) => r[0] ?? 0);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const existing = new Map<number, Doc<"ohlcBars">>();
  const docs = await ctx.db
    .query("ohlcBars")
    .withIndex("by_series_time", (q) =>
      q
        .eq("account", key.account)
        .eq("symbol", key.symbol)
        .eq("tf", key.tf)
        .gte("time", min)
        .lte("time", max)
    )
    .collect();
  for (const d of docs) {
    existing.set(d.time, d);
  }
  let added = 0;
  for (const r of rows) {
    const time = r[0] ?? 0;
    const doc = existing.get(time);
    if (!doc) {
      await ctx.db.insert("ohlcBars", { ...key, time, ...barFields(r) });
      added++;
    } else if (!sameRow(docRow(doc), r)) {
      await ctx.db.patch(doc._id, barFields(r));
    }
  }
  if (meta) {
    await ctx.db.patch(meta._id, {
      count: meta.count + added,
      oldest: Math.min(meta.oldest, min),
      newest: Math.max(meta.newest, max),
      ...(firstMs === undefined ? {} : { firstMs }),
    });
  } else {
    await ctx.db.insert("ohlcSeries", {
      ...key,
      count: added,
      oldest: min,
      newest: max,
      ...(firstMs === undefined ? {} : { firstMs }),
    });
  }
}

/** Appends live ticks to their 10-second blocks. */
async function appendTicks(
  ctx: MutationCtx,
  account: string,
  symbol: string,
  rows: Row[]
) {
  const blocks = new Map<number, Row[]>();
  for (const r of rows) {
    const b = Math.floor((r[0] ?? 0) / TICK_BLOCK_MS) * TICK_BLOCK_MS;
    const list = blocks.get(b) ?? [];
    list.push(r);
    blocks.set(b, list);
  }
  for (const [time, list] of blocks) {
    const doc = await ctx.db
      .query("ohlcTicks")
      .withIndex("by_symbol_time", (q) =>
        q.eq("account", account).eq("symbol", symbol).eq("time", time)
      )
      .unique();
    const merged = appendRows(doc?.rows ?? [], list);
    const first = merged[0]?.[0] ?? time;
    const last = merged.at(-1)?.[0] ?? time;
    if (doc) {
      if (merged.length !== doc.rows.length) {
        await ctx.db.patch(doc._id, { rows: merged, first, last });
      }
    } else {
      await ctx.db.insert("ohlcTicks", {
        account,
        symbol,
        time,
        first,
        last,
        rows: merged,
      });
    }
  }
}

/** Fails requests with no sign of life; hands pending ones to the EA. */
async function takeRequests(ctx: MutationCtx, account: string, now: number) {
  const active = [
    ...(await ctx.db
      .query("ohlcRequests")
      .withIndex("by_account_status", (q) =>
        q.eq("account", account).eq("status", "taken")
      )
      .collect()),
    ...(await ctx.db
      .query("ohlcRequests")
      .withIndex("by_account_status", (q) =>
        q.eq("account", account).eq("status", "pending")
      )
      .collect()),
  ];
  const handed: HandedRequest[] = [];
  let open = 0;
  for (const r of active.sort((a, b) => a.createdAt - b.createdAt)) {
    if (now - r.activeAt > REQUEST_TTL) {
      await ctx.db.patch(r._id, {
        status: "failed",
        error: "O EA não respondeu a tempo.",
      });
      continue;
    }
    open++;
    if (r.status === "pending" && handed.length < MAX_HANDED) {
      await ctx.db.patch(r._id, { status: "taken", activeAt: now });
      handed.push({
        id: r._id,
        kind: r.kind,
        symbol: r.symbol,
        ...(r.kind === "bars" ? { tf: r.tf } : {}),
        from_ms: r.fromMs,
        to_ms: r.toMs,
      });
    }
  }
  // While history is on its way, the EA checks back every second
  return { requests: handed, ...(open > 0 ? { next_ms: 1000 } : {}) };
}

/** Progress or end of an on-demand request. */
async function noteRequest(
  ctx: MutationCtx,
  account: string,
  req: NonNullable<IngestArgs["request"]>,
  now: number
) {
  const id = ctx.db.normalizeId("ohlcRequests", req.id);
  const doc = id ? await ctx.db.get(id) : null;
  if (!doc || doc.account !== account) {
    return;
  }
  if (req.firstMs !== undefined && doc.kind === "bars") {
    await upsertBars(
      ctx,
      { account, symbol: doc.symbol, tf: doc.tf },
      [],
      req.firstMs
    );
  }
  if (req.ticksEndMs !== undefined) {
    const live = await liveOf(ctx, account, doc.symbol);
    if (live) {
      await ctx.db.patch(live._id, { ticksEndMs: req.ticksEndMs });
    }
  }
  if (doc.status === "done" || doc.status === "failed") {
    return;
  }
  if (!req.done) {
    await ctx.db.patch(doc._id, { activeAt: now, chunks: doc.chunks + 1 });
    return;
  }
  await ctx.db.patch(doc._id, {
    activeAt: now,
    status: req.error ? "failed" : "done",
    ...(req.error ? { error: req.error } : {}),
  });
}

interface SymbolInfo {
  symbol: string;
  digits: number;
  chart: "bid" | "last";
}

/** Terminal status (online badge) and the symbols it sends. */
async function saveFeedStatus(ctx: MutationCtx, a: IngestArgs) {
  const feed = await ctx.db
    .query("ohlcFeeds")
    .withIndex("by_account", (q) => q.eq("account", a.account))
    .unique();
  const symbols = new Map<string, SymbolInfo>();
  for (const s of feed?.symbols ?? []) {
    symbols.set(s.symbol, s);
  }
  for (const t of a.ticks) {
    symbols.set(t.symbol, {
      symbol: t.symbol,
      digits: t.digits,
      chart: t.chart,
    });
  }
  for (const s of a.series) {
    const chart = symbols.get(s.symbol)?.chart ?? "bid";
    symbols.set(s.symbol, { symbol: s.symbol, digits: s.digits, chart });
  }
  const status = {
    server: a.server,
    broker: a.broker,
    offsetSec: a.offsetSec,
    seq: a.seq,
    sentMs: a.sentMs,
    receivedAt: a.now,
    symbols: [...symbols.values()],
  };
  if (feed) {
    await ctx.db.patch(feed._id, status);
  } else {
    await ctx.db.insert("ohlcFeeds", { account: a.account, ...status });
  }
  return symbols;
}

/**
 * Closed candles of a live block: all but the last (the forming one), plus
 * the previous forming candle when it closed without being re-sent. A block
 * older than the forming candle is all closed history.
 */
export function splitForming(bars: Row[], prev: Row | undefined) {
  const lastBar = bars.at(-1);
  if (!lastBar) {
    return { closed: [], forming: prev };
  }
  const t = lastBar[0] ?? 0;
  if (prev && t < (prev[0] ?? 0)) {
    return { closed: bars, forming: prev };
  }
  const closed = bars.slice(0, -1);
  const prevClosed =
    prev && (prev[0] ?? 0) < t && !bars.some((b) => b[0] === prev[0]);
  return { closed: prevClosed ? [prev, ...closed] : closed, forming: lastBar };
}

/** Forming candles of each symbol, written once per envelope. */
async function saveLive(
  ctx: MutationCtx,
  a: IngestArgs,
  symbols: Map<string, SymbolInfo>
) {
  const bySymbol = new Map<string, IngestArgs["series"]>();
  for (const s of a.series) {
    bySymbol.set(s.symbol, [...(bySymbol.get(s.symbol) ?? []), s]);
  }
  for (const [symbol, list] of bySymbol) {
    const doc = await liveOf(ctx, a.account, symbol);
    const map: Record<string, Row> = { ...(doc?.bars ?? {}) };
    for (const s of list) {
      const { closed, forming } = splitForming(s.bars, map[s.tf]);
      if (forming) {
        map[s.tf] = forming;
      }
      const key = { account: a.account, symbol, tf: s.tf };
      await upsertBars(ctx, key, closed, s.firstMs);
    }
    if (!list.some((s) => s.bars.length > 0)) {
      continue;
    }
    const info = symbols.get(symbol);
    const fields = {
      bars: map,
      updatedAt: a.now,
      digits: info?.digits ?? doc?.digits ?? 5,
      chart: info?.chart ?? doc?.chart ?? "bid",
    };
    if (doc) {
      await ctx.db.patch(doc._id, fields);
    } else {
      await ctx.db.insert("ohlcLive", {
        account: a.account,
        symbol,
        ...fields,
      });
    }
  }
}

export const ingest = internalMutation({
  args: ingestArgs,
  handler: async (ctx, a) => {
    const symbols = await saveFeedStatus(ctx, a);
    await saveLive(ctx, a, symbols);
    for (const t of a.ticks) {
      if (t.rows.length > 0) {
        await appendTicks(ctx, a.account, t.symbol, t.rows);
      }
    }
    if (a.request) {
      await noteRequest(ctx, a.account, a.request, a.now);
    }
    return await takeRequests(ctx, a.account, a.now);
  },
});

/* -------------------------------- files --------------------------------- */

interface Piece {
  rows: Row[];
  from: number;
  to: number;
}

/**
 * Merges blocks into the period files: candles are upserted by time;
 * ticks replace their whole [from, to] (the EA's block is complete there).
 */
export async function archiveBlock(
  ctx: ActionCtx,
  a: {
    account: string;
    kind: ArchiveKind;
    symbol: string;
    tf: string;
    pieces: Piece[];
  }
) {
  const byPeriod = new Map<number, Piece[]>();
  for (const p of a.pieces) {
    for (const [period, part] of splitByPeriod(a.kind, p.rows, p.from, p.to)) {
      const list = byPeriod.get(period) ?? [];
      list.push(part);
      byPeriod.set(period, list);
    }
  }
  for (const [period, pieces] of byPeriod) {
    await mergeFile(
      ctx,
      { account: a.account, kind: a.kind, symbol: a.symbol, tf: a.tf, period },
      pieces
    );
  }
}

const archiveKey = {
  account: v.string(),
  kind,
  symbol: v.string(),
  tf: v.string(),
  period: v.number(),
};
const archiveKeyValidator = v.object(archiveKey);
type ArchiveKey = Infer<typeof archiveKeyValidator>;

async function readArchive(ctx: ActionCtx, file: Id<"_storage"> | undefined) {
  if (!file) {
    return [];
  }
  const blob = await ctx.storage.get(file);
  return blob ? decodeArchive(await blob.arrayBuffer()) : [];
}

/** Candles are upserted by time; ticks replace their whole range. */
const applyPieces = (kind: ArchiveKind, rows: Row[], pieces: Piece[]) =>
  pieces.reduce(
    (acc, p) =>
      kind === "bars"
        ? upsertRows(acc, p.rows)
        : replaceRows(acc, p.rows, p.from, p.to),
    rows
  );

async function mergeFile(ctx: ActionCtx, key: ArchiveKey, pieces: Piece[]) {
  const hasRows = pieces.some((p) => p.rows.length > 0);
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = await ctx.runQuery(internal.ohlc.archiveDoc, key);
    const before = await readArchive(ctx, doc?.file);
    const rows = applyPieces(key.kind, before, pieces);
    const changed = !doc || hasRows || rows.length !== before.length;
    const file =
      changed && rows.length > 0
        ? await ctx.storage.store(
            new Blob([encodeArchive(rows) as BlobPart], {
              type: "application/gzip",
            })
          )
        : doc?.file;
    const ok = await ctx.runMutation(internal.ohlc.commitArchive, {
      ...key,
      version: doc?.version ?? 0,
      ...(file ? { file } : {}),
      count: rows.length,
      cover: pieces.map((p) => [p.from, p.to]),
    });
    if (ok) {
      return;
    }
    // Someone else wrote this file meanwhile: drop ours and merge again
    if (file && file !== doc?.file) {
      await ctx.storage.delete(file);
    }
  }
  throw new Error("archive_conflict");
}

export const archiveDoc = internalQuery({
  args: archiveKey,
  handler: async (ctx, k) =>
    await ctx.db
      .query("ohlcArchive")
      .withIndex("by_key", (q) =>
        q
          .eq("account", k.account)
          .eq("kind", k.kind)
          .eq("symbol", k.symbol)
          .eq("tf", k.tf)
          .eq("period", k.period)
      )
      .unique(),
});

/** Optimistic commit: false when the file changed since it was read. */
export const commitArchive = internalMutation({
  args: {
    ...archiveKey,
    version: v.number(),
    file: v.optional(v.id("_storage")),
    count: v.number(),
    cover: v.array(v.array(v.number())),
  },
  handler: async (ctx, a) => {
    const doc = await ctx.db
      .query("ohlcArchive")
      .withIndex("by_key", (q) =>
        q
          .eq("account", a.account)
          .eq("kind", a.kind)
          .eq("symbol", a.symbol)
          .eq("tf", a.tf)
          .eq("period", a.period)
      )
      .unique();
    if ((doc?.version ?? 0) !== a.version) {
      return false;
    }
    const cover = mergeIntervals([
      ...((doc?.cover ?? []) as Interval[]),
      ...(a.cover as Interval[]),
    ]);
    if (doc) {
      await ctx.db.patch(doc._id, {
        file: a.file,
        count: a.count,
        cover,
        version: doc.version + 1,
      });
      if (doc.file && doc.file !== a.file) {
        await ctx.storage.delete(doc.file);
      }
    } else {
      await ctx.db.insert("ohlcArchive", {
        account: a.account,
        kind: a.kind,
        symbol: a.symbol,
        tf: a.tf,
        period: a.period,
        ...(a.file ? { file: a.file } : {}),
        count: a.count,
        cover,
        version: 1,
      });
    }
    return true;
  },
});

/* --------------------------- cron: compaction --------------------------- */

export const seriesOverLimit = internalQuery({
  args: { over: v.number() },
  handler: async (ctx, a) =>
    await ctx.db
      .query("ohlcSeries")
      .withIndex("by_count", (q) => q.gt("count", a.over))
      .take(20),
});

export const oldestBars = internalQuery({
  args: {
    account: v.string(),
    symbol: v.string(),
    tf: v.string(),
    n: v.number(),
  },
  handler: async (ctx, a) => {
    const docs = await ctx.db
      .query("ohlcBars")
      .withIndex("by_series_time", (q) =>
        q.eq("account", a.account).eq("symbol", a.symbol).eq("tf", a.tf)
      )
      .take(a.n);
    return { ids: docs.map((d) => d._id), rows: docs.map(docRow) };
  },
});

export const dropBars = internalMutation({
  args: { series: v.id("ohlcSeries"), ids: v.array(v.id("ohlcBars")) },
  handler: async (ctx, a) => {
    let removed = 0;
    for (const id of a.ids) {
      if (await ctx.db.get(id)) {
        await ctx.db.delete(id);
        removed++;
      }
    }
    const meta = await ctx.db.get(a.series);
    if (!meta) {
      return;
    }
    const oldest = await ctx.db
      .query("ohlcBars")
      .withIndex("by_series_time", (q) =>
        q
          .eq("account", meta.account)
          .eq("symbol", meta.symbol)
          .eq("tf", meta.tf)
      )
      .first();
    await ctx.db.patch(meta._id, {
      count: Math.max(0, meta.count - removed),
      oldest: oldest?.time ?? meta.newest,
    });
  },
});

export const oldTickBlocks = internalQuery({
  args: { before: v.number(), limit: v.number() },
  handler: async (ctx, a) =>
    await ctx.db
      .query("ohlcTicks")
      .withIndex("by_time", (q) => q.lt("time", a.before))
      .take(a.limit),
});

export const dropTicks = internalMutation({
  args: { ids: v.array(v.id("ohlcTicks")) },
  handler: async (ctx, a) => {
    for (const id of a.ids) {
      if (await ctx.db.get(id)) {
        await ctx.db.delete(id);
      }
    }
  },
});

export const dropOldRequests = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, a) => {
    for (const status of ["pending", "taken"] as const) {
      const rows = await ctx.db
        .query("ohlcRequests")
        .filter((q) => q.eq(q.field("status"), status))
        .take(500);
      for (const r of rows) {
        if (a.now - r.activeAt > REQUEST_TTL) {
          await ctx.db.patch(r._id, {
            status: "failed",
            error: "O EA não respondeu a tempo.",
          });
        }
      }
    }
    const old = await ctx.db
      .query("ohlcRequests")
      .filter((q) => q.lt(q.field("activeAt"), a.now - 86_400_000))
      .take(500);
    for (const r of old) {
      await ctx.db.delete(r._id);
    }
  },
});

/**
 * Every 10 minutes: candles beyond OHLC_KEEP_BARS and tick blocks older
 * than OHLC_TICK_WINDOW_MS move to the gzip files; stale requests fail.
 */
export const compact = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const keep = keepBars();
    for (const s of await ctx.runQuery(internal.ohlc.seriesOverLimit, {
      over: keep,
    })) {
      const n = Math.min(s.count - keep, COMPACT_BARS);
      const { ids, rows } = await ctx.runQuery(internal.ohlc.oldestBars, {
        account: s.account,
        symbol: s.symbol,
        tf: s.tf,
        n,
      });
      const from = rows[0]?.[0];
      const to = rows.at(-1)?.[0];
      if (from === undefined || to === undefined) {
        continue;
      }
      await archiveBlock(ctx, {
        account: s.account,
        kind: "bars",
        symbol: s.symbol,
        tf: s.tf,
        pieces: [{ rows, from, to }],
      });
      await ctx.runMutation(internal.ohlc.dropBars, { series: s._id, ids });
    }
    const blocks = await ctx.runQuery(internal.ohlc.oldTickBlocks, {
      before: now - tickWindowMs(),
      limit: 360,
    });
    const groups = new Map<string, Doc<"ohlcTicks">[]>();
    for (const b of blocks) {
      const k = `${b.account}\u0000${b.symbol}`;
      groups.set(k, [...(groups.get(k) ?? []), b]);
    }
    for (const list of groups.values()) {
      const first = list[0];
      if (!first) {
        continue;
      }
      // Each block is complete between its first and last tick
      await archiveBlock(ctx, {
        account: first.account,
        kind: "ticks",
        symbol: first.symbol,
        tf: "",
        pieces: list.map((b) => ({ rows: b.rows, from: b.first, to: b.last })),
      });
      await ctx.runMutation(internal.ohlc.dropTicks, {
        ids: list.map((b) => b._id),
      });
    }
    await ctx.runMutation(internal.ohlc.dropOldRequests, { now });
  },
});

/* -------------------------------- chart --------------------------------- */

/** The terminal sending this symbol (the given account, or the latest one). */
async function feedFor(ctx: QueryCtx, account?: string, symbol?: string) {
  if (account) {
    return await ctx.db
      .query("ohlcFeeds")
      .withIndex("by_account", (q) => q.eq("account", account))
      .unique();
  }
  const all = (await ctx.db.query("ohlcFeeds").take(50)).sort(
    (a, b) => b.receivedAt - a.receivedAt
  );
  return (
    (symbol && all.find((f) => f.symbols.some((s) => s.symbol === symbol))) ||
    all[0] ||
    null
  );
}

/** Terminals sending prices (for the source picker and the online badge). */
export const feeds = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("ohlcFeeds").take(50))
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .map((f) => ({
        account: f.account,
        server: f.server,
        broker: f.broker,
        offsetSec: f.offsetSec,
        sentMs: f.sentMs,
        receivedAt: f.receivedAt,
        symbols: f.symbols,
      })),
});

/** Forming candles of a symbol + feed status (re-runs on every EA send). */
export const live = query({
  args: { account: v.optional(v.string()), symbol: v.string() },
  handler: async (ctx, a) => {
    const feed = await feedFor(ctx, a.account, a.symbol);
    if (!feed) {
      return null;
    }
    const row = await liveOf(ctx, feed.account, a.symbol);
    return {
      account: feed.account,
      offsetSec: feed.offsetSec,
      sentMs: feed.sentMs,
      receivedAt: feed.receivedAt,
      digits: row?.digits ?? null,
      chart: row?.chart ?? "bid",
      ticksEndMs: row?.ticksEndMs ?? null,
      bars: row?.bars ?? {},
    };
  },
});

/** Closed candles of a series, newest `limit` before `before` (oldest first). */
export const series = query({
  args: {
    account: v.optional(v.string()),
    symbol: v.string(),
    tf: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const feed = await feedFor(ctx, a.account, a.symbol);
    if (!(feed && isOhlcTf(a.tf))) {
      return null;
    }
    const limit = Math.max(1, Math.min(a.limit ?? 1000, MAX_QUERY_BARS));
    const docs = await ctx.db
      .query("ohlcBars")
      .withIndex("by_series_time", (q) => {
        const s = q
          .eq("account", feed.account)
          .eq("symbol", a.symbol)
          .eq("tf", a.tf);
        return a.before === undefined ? s : s.lt("time", a.before);
      })
      .order("desc")
      .take(limit);
    const meta = await seriesOf(ctx, feed.account, a.symbol, a.tf);
    return {
      account: feed.account,
      bars: docs.reverse().map(docRow),
      firstMs: meta?.firstMs ?? null,
      oldest: meta?.oldest ?? null,
    };
  },
});

/** Recent ticks since `since` (oldest first). */
export const ticks = query({
  args: {
    account: v.optional(v.string()),
    symbol: v.string(),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const feed = await feedFor(ctx, a.account, a.symbol);
    if (!feed) {
      return null;
    }
    const limit = Math.max(1, Math.min(a.limit ?? 20_000, MAX_QUERY_TICKS));
    const start = Math.floor(a.since / TICK_BLOCK_MS) * TICK_BLOCK_MS;
    const blocks = await ctx.db
      .query("ohlcTicks")
      .withIndex("by_symbol_time", (q) =>
        q.eq("account", feed.account).eq("symbol", a.symbol).gte("time", start)
      )
      .take(1000);
    const rows: Row[] = [];
    for (const b of blocks) {
      for (const r of b.rows) {
        if ((r[0] ?? 0) >= a.since && rows.length < limit) {
          rows.push(r);
        }
      }
    }
    return {
      account: feed.account,
      rows,
      oldest: blocks[0]?.first ?? null,
    };
  },
});

/** History files before `before` (newest first) with download URLs. */
export const archive = query({
  args: {
    account: v.optional(v.string()),
    kind,
    symbol: v.string(),
    tf: v.optional(v.string()),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const feed = await feedFor(ctx, a.account, a.symbol);
    if (!feed) {
      return [];
    }
    const tf = a.kind === "ticks" ? "" : (a.tf ?? "");
    const docs = await ctx.db
      .query("ohlcArchive")
      .withIndex("by_key", (q) => {
        const s = q
          .eq("account", feed.account)
          .eq("kind", a.kind)
          .eq("symbol", a.symbol)
          .eq("tf", tf);
        return a.before === undefined ? s : s.lt("period", a.before);
      })
      .order("desc")
      .take(Math.max(1, Math.min(a.limit ?? 6, 24)));
    return await Promise.all(
      docs.map(async (d) => ({
        period: d.period,
        count: d.count,
        cover: d.cover,
        version: d.version,
        url: d.file ? await ctx.storage.getUrl(d.file) : null,
      }))
    );
  },
});

/** Open requests of a symbol ("carregando histórico…") and the last failure. */
export const requests = query({
  args: { account: v.optional(v.string()), symbol: v.string() },
  handler: async (ctx, a) => {
    const feed = await feedFor(ctx, a.account, a.symbol);
    if (!feed) {
      return [];
    }
    const rows: Doc<"ohlcRequests">[] = [];
    for (const k of ["bars", "ticks"] as const) {
      for (const status of ["pending", "taken"] as const) {
        rows.push(
          ...(await ctx.db
            .query("ohlcRequests")
            .withIndex("by_series", (q) =>
              q.eq("account", feed.account).eq("kind", k).eq("symbol", a.symbol)
            )
            .filter((q) => q.eq(q.field("status"), status))
            .take(20))
        );
      }
    }
    return rows.map((r) => ({
      id: r._id,
      kind: r.kind,
      tf: r.tf,
      fromMs: r.fromMs,
      toMs: r.toMs,
      status: r.status,
      chunks: r.chunks,
      activeAt: r.activeAt,
    }));
  },
});

/** State of one request (the chart waits for done/failed). */
export const request = query({
  args: { id: v.id("ohlcRequests") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    return r
      ? {
          status: r.status,
          chunks: r.chunks,
          error: r.error ?? null,
          activeAt: r.activeAt,
        }
      : null;
  },
});

/**
 * Asks the EA for history (the chart scrolled back past its data). The same
 * stretch is never asked twice while a request is open; one that got no
 * answer for REQUEST_TTL fails, so it can be asked again.
 */
export const requestHistory = mutation({
  args: {
    account: v.string(),
    kind,
    symbol: v.string(),
    tf: v.optional(v.string()),
    fromMs: v.number(),
    toMs: v.number(),
  },
  handler: async (ctx, a): Promise<Id<"ohlcRequests">> => {
    const tf = a.kind === "bars" ? (a.tf ?? "") : "";
    if (a.kind === "bars" && !isOhlcTf(tf)) {
      throw new Error("Tempo gráfico inválido.");
    }
    if (!(Number.isFinite(a.fromMs) && a.toMs >= a.fromMs)) {
      throw new Error("Intervalo inválido.");
    }
    const span =
      a.kind === "bars"
        ? (a.toMs - a.fromMs) /
          (OHLC_TF_SEC[tf as keyof typeof OHLC_TF_SEC] * 1000)
        : a.toMs - a.fromMs;
    if (span > (a.kind === "bars" ? MAX_REQUEST_BARS : MAX_REQUEST_TICKS_MS)) {
      throw new Error("Intervalo grande demais para um pedido.");
    }
    const now = Date.now();
    for (const status of ["pending", "taken"] as const) {
      const open = await ctx.db
        .query("ohlcRequests")
        .withIndex("by_series", (q) =>
          q
            .eq("account", a.account)
            .eq("kind", a.kind)
            .eq("symbol", a.symbol)
            .eq("tf", tf)
            .eq("status", status)
        )
        .collect();
      for (const r of open) {
        if (now - r.activeAt > REQUEST_TTL) {
          await ctx.db.patch(r._id, {
            status: "failed",
            error: "O EA não respondeu a tempo.",
          });
        } else if (r.fromMs <= a.toMs && a.fromMs <= r.toMs) {
          return r._id;
        }
      }
    }
    return await ctx.db.insert("ohlcRequests", {
      account: a.account,
      kind: a.kind,
      symbol: a.symbol,
      tf,
      fromMs: a.fromMs,
      toMs: a.toMs,
      status: "pending",
      createdAt: now,
      activeAt: now,
      chunks: 0,
    });
  },
});
