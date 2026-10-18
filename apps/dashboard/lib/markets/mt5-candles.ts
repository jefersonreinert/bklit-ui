"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  decodeArchive,
  type Interval,
  missingRanges,
  type Row,
} from "../metatrader/ohlc-archive";
import {
  appendTicks,
  mergeCandles,
  OHLC_TF_SEC,
  type OhlcCandle,
  type OhlcTf,
  type OhlcTick,
} from "../metatrader/ohlc-feed";
import {
  type Aggregator,
  type AlignOptions,
  aggregateCandles,
  createAggregator,
} from "./aggregate";
import { type CustomTf, parseTimeframe, sourceFor } from "./timeframe";

/**
 * Chart data from the CasaBrasaOHLCExport EA (convex/ohlc.ts): closed MT5
 * candles + the forming one in real time, or ticks for timeframes the MT5
 * does not have (seconds, ticks). Scrolling back loads the table, then the
 * history files, then asks the EA for what is missing.
 */

/** No envelope (heartbeats included) for this long: EA offline. */
export const OFFLINE_MS = 30_000;
const CLOSED_LIMIT = 3000;
/** Candles asked to the EA per request, and ticks window per request. */
const REQUEST_BARS = 2000;
const REQUEST_TICKS_MS = 3_600_000;
/** Ticks loaded when the chart opens (the table keeps ~2 h). */
const TICKS_WINDOW_MS = 2 * 3_600_000;
/** The live tick subscription starts this far back and rolls every minute. */
const LIVE_TICKS_MS = 30_000;

/** Platform labels whose broker symbol has another name. */
const ALIASES: Record<string, string[]> = {
  SPX500: ["US500", "SPX500", "US500.CASH", "SP500"],
  NAS100: ["USTEC", "NAS100", "US100", "NDX100"],
  US30: ["US30", "DJ30", "WS30"],
  DXY: ["DXY", "USDX", "DX"],
  USOIL: ["XTIUSD", "USOIL", "WTI", "CL"],
  UKOIL: ["XBRUSD", "UKOIL", "BRENT"],
  XAUUSD: ["XAUUSD", "GOLD"],
  XAGUSD: ["XAGUSD", "SILVER"],
  GER40: ["DE40", "GER40", "DAX40"],
  GOOGL: ["GOOGL", "GOOG"],
};

const SEPARATOR = /^[._-]/;

/** "EURUSD" matches "EURUSD", "EURUSD.m", "EURUSDm", "AAPL" matches "AAPL.NAS", "DXY" matches "DXY_Z6". */
const matches = (symbol: string, want: string) => {
  if (!symbol.startsWith(want)) {
    return false;
  }
  const rest = symbol.slice(want.length);
  return rest.length <= 4 || SEPARATOR.test(rest);
};

/** EA symbol for a platform label (exact name first, then the shortest variant). */
export function matchFeedSymbol(label: string, symbols: string[]) {
  const want = label.toUpperCase();
  const upper = symbols.map((s) => s.toUpperCase());
  for (const cand of [want, ...(ALIASES[want] ?? [])]) {
    const exact = upper.indexOf(cand);
    if (exact >= 0) {
      return symbols[exact] ?? null;
    }
  }
  for (const cand of [want, ...(ALIASES[want] ?? [])]) {
    const found = symbols
      .filter((_, i) => matches(upper[i] ?? "", cand))
      .sort((a, b) => a.length - b.length)[0];
    if (found) {
      return found;
    }
  }
  return null;
}

/** Watchlist symbols of MT5-only items ("mt5:US2000"). */
export const MT5_PREFIX = "mt5:";
export const MT5_SECTION = "MT5 (EA)";

export const rowCandle = (r: Row): OhlcCandle => ({
  time: r[0] ?? 0,
  open: r[1] ?? 0,
  high: r[2] ?? 0,
  low: r[3] ?? 0,
  close: r[4] ?? 0,
  volume: r[5] ?? 0,
  realVolume: r[6] ?? 0,
  spread: r[7] ?? 0,
});

export const rowTick = (r: Row): OhlcTick => ({
  time: r[0] ?? 0,
  bid: r[1] ?? 0,
  ask: r[2] ?? 0,
  last: r[3] ?? 0,
  volume: r[4] ?? 0,
  flags: r[5] ?? 0,
});

export interface Mt5Feed {
  account: string;
  symbol: string;
  offsetSec: number;
}

/** The terminal that sends this platform symbol, if any. */
export function useMt5Feed(label: string): Mt5Feed | null | undefined {
  const feeds = useQuery(api.ohlc.feeds, {});
  return useMemo(() => {
    if (feeds === undefined) {
      return undefined;
    }
    for (const f of feeds) {
      const symbol = matchFeedSymbol(
        label,
        f.symbols.map((s) => s.symbol)
      );
      if (symbol) {
        return { account: f.account, symbol, offsetSec: f.offsetSec };
      }
    }
    return null;
  }, [feeds, label]);
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export interface Mt5Candles {
  /** Undefined while checking whether the EA sends this symbol. */
  available: boolean | undefined;
  candles: OhlcCandle[] | null;
  digits?: number;
  online: boolean;
  /** Seconds since the last envelope from the EA. */
  silentSec: number | null;
  loadingHistory: boolean;
  /** Reached the start of the broker's history. */
  historyStart: boolean;
  /** The broker has no ticks before this time (sub-minute timeframes). */
  ticksEnd: number | null;
  error: string | null;
  loadOlder: () => void;
}

type Loader = (ctx: {
  before: number;
}) => Promise<
  | { rows: Row[]; cursor: number; done?: boolean }
  | { requestId: Id<"ohlcRequests"> }
>;

/**
 * Walks back from `cursor`: table page, history files, then a request to
 * the EA. `cursor` = everything at or after it was already explored.
 */
function useHistory(
  key: string,
  initialCursor: number | null,
  loader: Loader | null,
  onRows: (rows: Row[]) => void
) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [atStart, setAtStart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Id<"ohlcRequests"> | null>(null);
  const req = useQuery(api.ohlc.request, pending ? { id: pending } : "skip");
  const busy = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restart per series
  useEffect(() => {
    setCursor(null);
    setLoading(false);
    setAtStart(false);
    setError(null);
    setPending(null);
    busy.current = false;
  }, [key]);

  const from = cursor ?? initialCursor;
  const run = useCallback(async () => {
    if (busy.current || atStart || from === null || !loader) {
      return;
    }
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const out = await loader({ before: from });
      if ("requestId" in out) {
        setPending(out.requestId);
        return; // the request watcher continues
      }
      if (out.rows.length > 0) {
        onRows(out.rows);
      }
      setCursor(out.cursor);
      if (out.done) {
        setAtStart(true);
      }
      busy.current = false;
      setLoading(false);
    } catch (e) {
      busy.current = false;
      setLoading(false);
      setError(
        e instanceof Error ? e.message : "Falha ao carregar o histórico."
      );
    }
  }, [from, atStart, loader, onRows]);

  // The EA answered (or gave up): walk on
  useEffect(() => {
    if (!(req && pending)) {
      return;
    }
    if (req.status === "done" || req.status === "failed") {
      setPending(null);
      busy.current = false;
      setLoading(false);
      if (req.status === "failed") {
        setError(req.error ?? "O EA não enviou o histórico.");
      } else {
        run();
      }
    }
  }, [req, pending, run]);

  return {
    run,
    loading: loading || pending !== null,
    atStart,
    error,
  };
}

interface FileList {
  period: number;
  cover: number[][];
  url: string | null;
}

async function readFile(url: string): Promise<Row[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Histórico indisponível (${res.status}).`);
  }
  return decodeArchive(await res.arrayBuffer());
}

/** Candles of a custom timeframe (or a direct MT5 one) from the EA. */
export function useMt5Candles(
  label: string,
  tfId: string,
  alignUtc = false
): Mt5Candles {
  const feed = useMt5Feed(label);
  const convex = useConvex();
  const requestHistory = useMutation(api.ohlc.requestHistory);
  const tf = useMemo(() => parseTimeframe(tfId), [tfId]);
  const src = tf ? sourceFor(tf) : null;
  const srcTf: OhlcTf | null = src?.kind === "bars" ? src.tf : null;
  const ticksMode = src?.kind === "ticks";
  const account = feed?.account;
  const feedSymbol = feed?.symbol;
  const args = useMemo(
    () => (account && feedSymbol ? { account, symbol: feedSymbol } : null),
    [account, feedSymbol]
  );
  const live = useQuery(api.ohlc.live, args ?? "skip");
  const now = useNow(5000);
  const align: AlignOptions = useMemo(() => {
    const off = (feed?.offsetSec ?? 0) * 1000;
    return { offsetMs: alignUtc ? 0 : off, brokerOffsetMs: off };
  }, [feed?.offsetSec, alignUtc]);
  const price = live?.chart ?? "bid";
  const seriesKey = `${feed?.account}|${feed?.symbol}|${tfId}`;

  const bars = useBarsMode({
    enabled: !!(args && srcTf && tf),
    args,
    srcTf,
    tf,
    factor: src?.kind === "bars" ? src.factor : 1,
    forming: srcTf ? live?.bars[srcTf] : undefined,
    align,
    price,
    convex,
    requestHistory,
    seriesKey,
  });
  const ticks = useTicksMode({
    ticksEnd: live?.ticksEndMs ?? null,
    enabled: !!(args && ticksMode && tf),
    args,
    tf,
    align,
    price,
    convex,
    requestHistory,
    seriesKey,
  });
  const mode = ticksMode ? ticks : bars;

  const silentSec = live ? Math.max(0, (now - live.receivedAt) / 1000) : null;
  return {
    available: feed === undefined ? undefined : feed !== null && !!tf,
    candles: mode.candles,
    digits: live?.digits ?? undefined,
    online: silentSec !== null && silentSec * 1000 < OFFLINE_MS,
    silentSec,
    loadingHistory: mode.history.loading,
    historyStart: mode.history.atStart,
    ticksEnd: live?.ticksEndMs ?? null,
    error: tf ? mode.history.error : "Tempo gráfico inválido.",
    loadOlder: mode.history.run,
  };
}

interface ModeArgs {
  enabled: boolean;
  args: { account: string; symbol: string } | null;
  tf: CustomTf | null;
  align: AlignOptions;
  price: "bid" | "last";
  convex: ReturnType<typeof useConvex>;
  requestHistory: ReturnType<
    typeof useMutation<typeof api.ohlc.requestHistory>
  >;
  seriesKey: string;
}

/** Walks the history files back from `before`; null when a request is needed. */
async function filesBefore(
  convex: ReturnType<typeof useConvex>,
  q: {
    account: string;
    symbol: string;
    kind: "bars" | "ticks";
    tf?: string;
  },
  before: number,
  spanMs: number
): Promise<{ rows: Row[]; cursor: number } | null> {
  const files = (await convex.query(api.ohlc.archive, {
    ...q,
    before: before + 1,
    limit: 2,
  })) as FileList[];
  const want = before - spanMs;
  const cover = files.flatMap((f) => f.cover as Interval[]);
  const missing = missingRanges(cover, want, before - 1);
  if (missing.length > 0) {
    const last = missing.at(-1);
    // The newest stretch right before the cursor is not on file
    if (last && last[1] === before - 1) {
      return null;
    }
  }
  const rows: Row[] = [];
  for (const f of files) {
    if (f.url) {
      rows.push(...(await readFile(f.url)).filter((r) => (r[0] ?? 0) < before));
    }
  }
  rows.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  // Explored down to the start of the covered stretch that ends at the cursor
  let cursor = want;
  for (const [a, b] of cover) {
    if (a <= before - 1 && b >= before - 1) {
      cursor = Math.min(cursor, a);
    }
  }
  return { rows, cursor: Math.min(cursor, rows[0]?.[0] ?? cursor) };
}

function useBarsMode(
  o: ModeArgs & {
    srcTf: OhlcTf | null;
    factor: number;
    forming: Row | undefined;
  }
) {
  const closed = useQuery(
    api.ohlc.series,
    o.enabled && o.args && o.srcTf
      ? { ...o.args, tf: o.srcTf, limit: CLOSED_LIMIT }
      : "skip"
  );
  const [older, setOlder] = useState<OhlcCandle[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: new series, new history
  useEffect(() => setOlder([]), [o.seriesKey]);

  const base = useMemo(() => {
    const rows = (closed?.bars ?? []).map(rowCandle);
    return older.length > 0 ? mergeCandles(older, rows) : rows;
  }, [closed, older]);

  const agg = useMemo<Aggregator | null>(
    () =>
      o.tf && o.factor > 1
        ? createAggregator(o.tf, o.align, o.price, { candles: base })
        : null,
    [base, o.tf, o.factor, o.align, o.price]
  );

  const candles = useMemo(() => {
    if (!(o.enabled && closed)) {
      return null;
    }
    const forming = o.forming ? rowCandle(o.forming) : null;
    if (!agg) {
      return forming ? mergeCandles(base, [forming]) : base;
    }
    if (forming && !agg.addCandles([forming]) && o.tf) {
      // Rare: forming older than the closed ones (catch-up); full rebuild
      return aggregateCandles(mergeCandles(base, [forming]), o.tf, o.align);
    }
    return agg.candles.slice();
  }, [o.enabled, closed, base, agg, o.forming, o.tf, o.align]);

  const onRows = useCallback(
    (rows: Row[]) =>
      setOlder((prev) => mergeCandles(rows.map(rowCandle), prev)),
    []
  );
  const { convex, requestHistory } = o;
  const args = o.args;
  const srcTf = o.srcTf;
  const firstMs = closed?.firstMs ?? null;
  const loader = useMemo<Loader | null>(() => {
    if (!(args && srcTf)) {
      return null;
    }
    const sec = OHLC_TF_SEC[srcTf];
    const span = REQUEST_BARS * sec * 1000;
    return async ({ before }) => {
      if (firstMs !== null && before <= firstMs) {
        return { rows: [], cursor: before, done: true };
      }
      const page = await convex.query(api.ohlc.series, {
        ...args,
        tf: srcTf,
        limit: CLOSED_LIMIT,
        before,
      });
      const rows = page?.bars ?? [];
      if (rows.length > 0) {
        return { rows, cursor: rows[0]?.[0] ?? before };
      }
      const files = await filesBefore(
        convex,
        { ...args, kind: "bars", tf: srcTf },
        before,
        span
      );
      if (files) {
        return files;
      }
      const from = Math.max(firstMs ?? 0, before - span);
      const id = await requestHistory({
        ...args,
        kind: "bars",
        tf: srcTf,
        fromMs: from,
        toMs: before - 1,
      });
      return { requestId: id };
    };
  }, [args, srcTf, firstMs, convex, requestHistory]);

  const history = useHistory(
    o.seriesKey,
    base[0]?.time ?? null,
    loader,
    onRows
  );
  return { candles, history };
}

function useTicksMode(o: ModeArgs & { ticksEnd: number | null }) {
  const [liveSince, setLiveSince] = useState(() => Date.now() - LIVE_TICKS_MS);
  const [candles, setCandles] = useState<OhlcCandle[] | null>(null);
  const all = useRef<OhlcTick[]>([]);
  const agg = useRef<Aggregator | null>(null);
  const [baseReady, setBaseReady] = useState(false);
  const { convex, requestHistory, args, tf, align, price, ticksEnd } = o;

  const rebuild = useCallback(() => {
    if (!tf) {
      return;
    }
    agg.current = createAggregator(tf, align, price, { ticks: all.current });
    setCandles(agg.current.candles.slice());
  }, [tf, align, price]);

  // First load: the last ~2 hours from the table (one read, not reactive)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload per series
  useEffect(() => {
    all.current = [];
    agg.current = null;
    setCandles(null);
    setBaseReady(false);
    if (!(o.enabled && args)) {
      return;
    }
    let alive = true;
    const start = Date.now();
    setLiveSince(start - LIVE_TICKS_MS);
    convex
      .query(api.ohlc.ticks, {
        ...args,
        since: start - TICKS_WINDOW_MS,
        limit: 50_000,
      })
      .then((res) => {
        if (!alive) {
          return;
        }
        all.current = (res?.rows ?? []).map(rowTick);
        rebuild();
        setBaseReady(true);
      })
      .catch(() => {
        if (alive) {
          setCandles([]);
          setBaseReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [o.enabled, o.seriesKey]);

  // Roll the live window forward so the subscription stays small
  useEffect(() => {
    if (!o.enabled) {
      return;
    }
    const id = setInterval(
      () => setLiveSince(Date.now() - LIVE_TICKS_MS),
      60_000
    );
    return () => clearInterval(id);
  }, [o.enabled]);

  const liveTicks = useQuery(
    api.ohlc.ticks,
    o.enabled && args && baseReady
      ? { ...args, since: liveSince, limit: 20_000 }
      : "skip"
  );
  useEffect(() => {
    if (!(liveTicks && agg.current)) {
      return;
    }
    const incoming = liveTicks.rows.map(rowTick);
    const prev = all.current;
    const lastTime = prev.at(-1)?.time ?? Number.NEGATIVE_INFINITY;
    const fresh = incoming.filter((t) => t.time >= lastTime);
    const next = appendTicks(prev, fresh);
    const added = next.slice(prev.length);
    if (added.length === 0) {
      return;
    }
    all.current = next;
    if (agg.current.addTicks(added)) {
      setCandles(agg.current.candles.slice());
    } else {
      rebuild();
    }
  }, [liveTicks, rebuild]);

  const onRows = useCallback(
    (rows: Row[]) => {
      const older = rows.map(rowTick);
      const first = all.current[0]?.time ?? Number.POSITIVE_INFINITY;
      all.current = [...older.filter((t) => t.time < first), ...all.current];
      rebuild();
    },
    [rebuild]
  );

  const loader = useMemo<Loader | null>(() => {
    if (!args) {
      return null;
    }
    return async ({ before }) => {
      if (ticksEnd !== null && before <= ticksEnd) {
        return { rows: [], cursor: before, done: true };
      }
      const files = await filesBefore(
        convex,
        { ...args, kind: "ticks" },
        before,
        REQUEST_TICKS_MS
      );
      if (files) {
        return files;
      }
      const id = await requestHistory({
        ...args,
        kind: "ticks",
        fromMs: before - REQUEST_TICKS_MS,
        toMs: before - 1,
      });
      return { requestId: id };
    };
  }, [args, convex, requestHistory, ticksEnd]);

  const history = useHistory(
    o.seriesKey,
    baseReady ? (all.current[0]?.time ?? liveSince) : null,
    loader,
    onRows
  );
  return { candles: o.enabled ? candles : null, history };
}
