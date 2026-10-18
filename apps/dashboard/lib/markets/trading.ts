"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  Candle,
  ChartSettings,
} from "@/components/pages/trading/mt5/engine/ChartEngine";
import type { Drawing } from "@/components/pages/trading/mt5/tv/drawing-engine";
import {
  DEFAULT_ITEMS,
  DEFAULT_SECTIONS,
  guessSection,
  normalizeSections,
  SECTION_OTHER,
} from "./sections";
import { parseTimeframe, tfLabel, tfName } from "./timeframe";

/**
 * Charting platform: watchlist, chart settings and drawings (saved on the
 * device and synced through lib/sync/stores.ts), candles from Yahoo Finance
 * (polled) or Binance (WebSocket, crypto in real time).
 */

export interface WatchItem {
  symbol: string;
  /** Short ticker shown in lists ("EURUSD", "XAUUSD"…). */
  label: string;
  name: string;
  /** Watchlist section ("Índices", "Forex"…). */
  section?: string;
  /** Flagged (red flag, like TradingView). */
  flag?: boolean;
}

export interface TradingData {
  watchlist: WatchItem[];
  /** Section order of the watchlist. */
  sections: string[];
  symbol: string;
  /** A Timeframe or a custom one ("2s", "7m", "100T"; see timeframe.ts). */
  tf: string;
  /** Custom timeframes saved next to the standard ones. */
  tfFavorites?: string[];
  /** Custom intraday candles start at UTC midnight instead of the broker's. */
  tfAlignUtc?: boolean;
  settings: ChartSettings;
  drawings: Record<string, Drawing[]>;
  /** Candle palette the saved colors belong to (see CANDLE_PALETTE). */
  palette?: number;
}

export type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "D"
  | "W"
  | "M";

export const TIMEFRAMES: { id: Timeframe; label: string; name: string }[] = [
  { id: "1m", label: "1m", name: "1 minuto" },
  { id: "5m", label: "5m", name: "5 minutos" },
  { id: "15m", label: "15m", name: "15 minutos" },
  { id: "30m", label: "30m", name: "30 minutos" },
  { id: "1h", label: "1H", name: "1 hora" },
  { id: "4h", label: "4H", name: "4 horas" },
  { id: "D", label: "1D", name: "Diário" },
  { id: "W", label: "1S", name: "Semanal" },
  { id: "M", label: "1M", name: "Mensal" },
];

export const isPresetTf = (tf: string): tf is Timeframe =>
  TIMEFRAMES.some((t) => t.id === tf);

export interface TfOption {
  id: string;
  label: string;
  name: string;
  custom: boolean;
}

/** Standard timeframes followed by the saved custom ones. */
export function tfOptions(favorites: string[] = []): TfOption[] {
  const out: TfOption[] = TIMEFRAMES.map((t) => ({ ...t, custom: false }));
  for (const id of favorites) {
    const tf = parseTimeframe(id);
    if (tf && !out.some((o) => o.id === tf.id)) {
      out.push({
        id: tf.id,
        label: tfLabel(tf),
        name: tfName(tf),
        custom: true,
      });
    }
  }
  return out;
}

/** Label of any timeframe id (standard or custom). */
export function tfDisplay(id: string) {
  const preset = TIMEFRAMES.find((t) => t.id === id);
  if (preset) {
    return preset.label;
  }
  const tf = parseTimeframe(id);
  return tf ? tfLabel(tf) : id;
}

export const TRADING_KEY = "cb:trading:v1";

const DEFAULT_WATCHLIST: WatchItem[] = DEFAULT_ITEMS;

/** Candles: Manilla up, Kraft down, black borders and wicks. */
export const CANDLE_COLORS = {
  bodyUp: "#EBDBBC",
  bodyDown: "#D4A27F",
  wickUp: "#000000",
  wickDown: "#000000",
  borderUp: "#000000",
  borderDown: "#000000",
} as const;

/** Bump to replace saved candle colors with CANDLE_COLORS once. */
const CANDLE_PALETTE = 1;

export const DEFAULT_CHART: ChartSettings = {
  ...CANDLE_COLORS,
  gridEnabled: true,
  gridColor: "#888888",
  background: "transparent",
  /** -1 = automatic, from the instrument. */
  precision: -1,
  timezone: "Local",
};

const DEFAULT_DATA: TradingData = {
  watchlist: DEFAULT_WATCHLIST,
  sections: DEFAULT_SECTIONS,
  symbol: "EURUSD=X",
  tf: "15m",
  settings: DEFAULT_CHART,
  drawings: {},
  palette: CANDLE_PALETTE,
};

/* --------------------------------- Store --------------------------------- */

let cache: TradingData | null = null;
const listeners = new Set<() => void>();

function read(): TradingData {
  if (cache) {
    return cache;
  }
  try {
    const raw = localStorage.getItem(TRADING_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<TradingData>) : {};
    const { items, sections } = normalizeSections(
      saved.watchlist ?? DEFAULT_WATCHLIST,
      saved.sections
    );
    cache = {
      ...DEFAULT_DATA,
      ...saved,
      watchlist: items,
      sections,
      settings: {
        ...DEFAULT_CHART,
        ...saved.settings,
        ...(saved.palette === CANDLE_PALETTE ? {} : CANDLE_COLORS),
      },
      palette: CANDLE_PALETTE,
    };
  } catch {
    cache = DEFAULT_DATA;
  }
  return cache;
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TRADING_KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function updateTrading(fn: (d: TradingData) => TradingData) {
  cache = fn(read());
  for (const l of listeners) {
    l();
  }
  // Drawings change on every drag frame: write at most a few times a second
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  const next = cache;
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(TRADING_KEY, JSON.stringify(next));
    } catch {
      // private mode
    }
  }, 300);
}

export const useTrading = () =>
  useSyncExternalStore(subscribe, read, () => DEFAULT_DATA);

export function setSymbol(symbol: string) {
  updateTrading((d) => ({ ...d, symbol }));
}

export function addTfFavorite(id: string) {
  updateTrading((d) => {
    const list = d.tfFavorites ?? [];
    return list.includes(id) ? d : { ...d, tfFavorites: [...list, id] };
  });
}

export function removeTfFavorite(id: string) {
  updateTrading((d) => ({
    ...d,
    tfFavorites: (d.tfFavorites ?? []).filter((f) => f !== id),
    tf: d.tf === id ? "15m" : d.tf,
  }));
}

export function setTfAlignUtc(utc: boolean) {
  updateTrading((d) => ({ ...d, tfAlignUtc: utc }));
}

export function setTimeframe(tf: string) {
  updateTrading((d) => ({ ...d, tf }));
}

export function updateSettings(s: Partial<ChartSettings>) {
  updateTrading((d) => ({ ...d, settings: { ...d.settings, ...s } }));
}

export function resetSettings() {
  updateTrading((d) => ({ ...d, settings: DEFAULT_CHART }));
}

export function setDrawings(symbol: string, drawings: Drawing[]) {
  updateTrading((d) => ({
    ...d,
    drawings: { ...d.drawings, [symbol]: drawings },
  }));
}

export function addToWatchlist(w: WatchItem, type?: string) {
  updateTrading((d) => {
    if (d.watchlist.some((x) => x.symbol === w.symbol)) {
      return d;
    }
    const section = w.section ?? guessSection(w.symbol, type);
    return {
      ...d,
      watchlist: [...d.watchlist, { ...w, section }],
      sections: d.sections.includes(section)
        ? d.sections
        : [...d.sections, section],
    };
  });
}

export function setItemSection(symbol: string, section: string) {
  updateTrading((d) => ({
    ...d,
    watchlist: d.watchlist.map((x) =>
      x.symbol === symbol ? { ...x, section } : x
    ),
  }));
}

export function toggleFlag(symbol: string) {
  updateTrading((d) => ({
    ...d,
    watchlist: d.watchlist.map((x) =>
      x.symbol === symbol ? { ...x, flag: !x.flag } : x
    ),
  }));
}

export function addSection(name: string) {
  const clean = name.trim().slice(0, 40);
  updateTrading((d) =>
    !clean || d.sections.includes(clean)
      ? d
      : { ...d, sections: [...d.sections, clean] }
  );
}

export function renameSection(from: string, to: string) {
  const clean = to.trim().slice(0, 40);
  updateTrading((d) => {
    if (!clean || d.sections.includes(clean)) {
      return d;
    }
    return {
      ...d,
      sections: d.sections.map((s) => (s === from ? clean : s)),
      watchlist: d.watchlist.map((x) =>
        x.section === from ? { ...x, section: clean } : x
      ),
    };
  });
}

/** Deletes a section; its symbols go to "Outros". */
export function removeSection(name: string) {
  updateTrading((d) => {
    const moved = d.watchlist.some((x) => x.section === name);
    const sections = d.sections.filter((s) => s !== name);
    return {
      ...d,
      sections:
        moved && !sections.includes(SECTION_OTHER)
          ? [...sections, SECTION_OTHER]
          : sections,
      watchlist: d.watchlist.map((x) =>
        x.section === name ? { ...x, section: SECTION_OTHER } : x
      ),
    };
  });
}

export function moveSection(name: string, dir: -1 | 1) {
  updateTrading((d) => {
    const list = [...d.sections];
    const i = list.indexOf(name);
    const j = i + dir;
    const a = list[i];
    const b = list[j];
    if (!(a && b)) {
      return d;
    }
    list[i] = b;
    list[j] = a;
    return { ...d, sections: list };
  });
}

/** Back to the default TradingView-like list (keeps chart settings). */
export function resetWatchlist() {
  updateTrading((d) => ({
    ...d,
    watchlist: DEFAULT_WATCHLIST,
    sections: DEFAULT_SECTIONS,
  }));
}

export function removeFromWatchlist(symbol: string) {
  updateTrading((d) => ({
    ...d,
    watchlist: d.watchlist.filter((x) => x.symbol !== symbol),
  }));
}

/** Moves a symbol up/down among the symbols of its own section. */
export function moveInWatchlist(symbol: string, dir: -1 | 1) {
  updateTrading((d) => {
    const list = [...d.watchlist];
    const i = list.findIndex((x) => x.symbol === symbol);
    const section = list[i]?.section;
    let j = i + dir;
    while (list[j] && list[j]?.section !== section) {
      j += dir;
    }
    const a = list[i];
    const b = list[j];
    if (!(a && b)) {
      return d;
    }
    list[i] = b;
    list[j] = a;
    return { ...d, watchlist: list };
  });
}

/** Short ticker from a Yahoo symbol ("EURUSD=X" → "EURUSD", "BTC-USD" → "BTCUSD"). */
export function labelOf(symbol: string) {
  const known = DEFAULT_ITEMS.find((i) => i.symbol === symbol);
  if (known) {
    return known.label;
  }
  return symbol
    .replace("=X", "")
    .replace("=F", "")
    .replace("^", "")
    .replace("-", "");
}

/* --------------------------------- Data ---------------------------------- */

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/markets`;

const H4 = 4 * 3_600_000;

/** 1h candles → 4h candles (UTC aligned). */
function to4h(candles: Candle[]) {
  const out: Candle[] = [];
  for (const c of candles) {
    const t = Math.floor(c.time / H4) * H4;
    const last = out.at(-1);
    if (last && last.time === t) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
    } else {
      out.push({ ...c, time: t });
    }
  }
  return out;
}

/** New candles replace the ones with the same time and extend the series. */
function merge(prev: Candle[], fresh: Candle[]) {
  const last = prev.at(-1);
  if (!last) {
    return fresh;
  }
  const add = fresh.filter((c) => c.time >= last.time);
  if (add.length === 0) {
    return prev;
  }
  const next = prev.slice(0, -1);
  for (const c of add) {
    const tail = next.at(-1);
    if (tail && tail.time === c.time) {
      next[next.length - 1] = c;
    } else if (!tail || c.time > tail.time) {
      next.push(c);
    }
  }
  return next;
}

const CRYPTO = /^([A-Z0-9]{2,10})-USD$/;
const BINANCE_TF: Record<Timeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  D: "1d",
  W: "1w",
  M: "1M",
};

type BinanceKline = [number, string, string, string, string, ...unknown[]];

const fromBinance = (k: BinanceKline): Candle => ({
  time: k[0],
  open: Number(k[1]),
  high: Number(k[2]),
  low: Number(k[3]),
  close: Number(k[4]),
});

async function binanceHistory(pair: string, tf: Timeframe) {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${BINANCE_TF[tf]}&limit=1000`
  );
  if (!res.ok) {
    throw new Error(`Binance ${res.status}`);
  }
  return ((await res.json()) as BinanceKline[]).map(fromBinance);
}

async function yahoo(symbol: string, tf: Timeframe, live: boolean) {
  const res = await fetch(
    `${API}/candles/?symbol=${encodeURIComponent(symbol)}&tf=${tf}${live ? "&live=1" : ""}`,
    { cache: "no-store" }
  );
  if (res.status === 401) {
    throw new Error("locked");
  }
  const data = (await res.json()) as {
    candles?: Candle[];
    meta?: { priceHint?: number };
    error?: string;
  };
  if (!(res.ok && data.candles)) {
    throw new Error(data.error ?? "Sem dados.");
  }
  const candles = tf === "4h" ? to4h(data.candles) : data.candles;
  return { candles, digits: data.meta?.priceHint };
}

/** Decimals for a symbol at a price (forex quotes with 5/3 like MT5). */
export function autoDigits(symbol: string, price: number, hint?: number) {
  if (symbol.endsWith("=X")) {
    return price < 20 ? 5 : 3;
  }
  if (CRYPTO.test(symbol) && price < 10) {
    return 4;
  }
  return Math.max(2, hint ?? 2);
}

export type FeedSource = "binance" | "yahoo" | "mt5";

/** Candle series with live updates. */
export function useCandles(symbol: string, tf: Timeframe, enabled = true) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [digits, setDigits] = useState<number | undefined>(undefined);
  const [source, setSource] = useState<FeedSource>("yahoo");
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce re-runs the load (reload)
  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    setCandles(null);
    setError(null);
    if (!enabled) {
      return;
    }

    const startYahooPoll = () => {
      const intraday = !(tf === "D" || tf === "W" || tf === "M");
      poll = setInterval(
        async () => {
          if (document.hidden) {
            return;
          }
          try {
            const { candles: fresh } = await yahoo(symbol, tf, true);
            if (alive) {
              setCandles((prev) => (prev ? merge(prev, fresh) : fresh));
            }
          } catch {
            // keep the last data; next tick retries
          }
        },
        intraday ? 5000 : 30_000
      );
    };

    const startBinance = async (pair: string) => {
      const history = await binanceHistory(pair, tf);
      if (!alive) {
        return;
      }
      setCandles(history);
      setSource("binance");
      ws = new WebSocket(
        `wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@kline_${BINANCE_TF[tf]}`
      );
      ws.onmessage = (e) => {
        const k = (
          JSON.parse(String(e.data)) as {
            k?: { t: number; o: string; h: string; l: string; c: string };
          }
        ).k;
        if (!k) {
          return;
        }
        const c: Candle = {
          time: k.t,
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
        };
        setCandles((prev) => (prev ? merge(prev, [c]) : [c]));
      };
    };

    const startYahoo = async () => {
      const { candles: history, digits: hint } = await yahoo(symbol, tf, false);
      if (!alive) {
        return;
      }
      setCandles(history);
      setDigits(hint);
      setSource("yahoo");
      startYahooPoll();
    };

    (async () => {
      const crypto = CRYPTO.exec(symbol);
      try {
        if (crypto) {
          try {
            await startBinance(`${crypto[1]}USDT`);
            return;
          } catch {
            // Binance blocked or pair missing: fall back to Yahoo
          }
        }
        await startYahoo();
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Sem conexão.");
          setCandles([]);
        }
      }
    })();

    return () => {
      alive = false;
      ws?.close();
      if (poll) {
        clearInterval(poll);
      }
    };
  }, [symbol, tf, nonce, enabled]);

  return { candles, error, digits, source, reload };
}

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  currency: string;
  name: string;
  digits: number;
  marketState: string;
}

/** Watchlist prices, refreshed every 20 seconds. */
export function useQuotes(symbols: string[]) {
  const key = symbols.join(",");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [locked, setLocked] = useState(false);
  const load = useCallback(async () => {
    if (!key || document.hidden) {
      return;
    }
    try {
      const res = await fetch(
        `${API}/quotes/?symbols=${encodeURIComponent(key)}`,
        {
          cache: "no-store",
        }
      );
      if (res.status === 401) {
        setLocked(true);
        return;
      }
      const data = (await res.json()) as { quotes: Quote[] };
      setLocked(false);
      setQuotes((prev) => {
        const next = { ...prev };
        for (const q of data.quotes) {
          next[q.symbol] = q;
        }
        return next;
      });
    } catch {
      // offline: keep the last prices
    }
  }, [key]);
  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);
  return { quotes, locked, reload: load };
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

/** Symbol search with a short debounce. */
export function useSymbolSearch(q: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setResults([]);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/search/?q=${encodeURIComponent(text)}`);
        const data = (await res.json()) as { results?: SearchResult[] };
        if (n === seq.current) {
          setResults(data.results ?? []);
        }
      } catch {
        if (n === seq.current) {
          setResults([]);
        }
      } finally {
        if (n === seq.current) {
          setLoading(false);
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return { results, loading };
}

/** Price with fixed decimals and thousands separators. */
export function formatPx(v: number, digits: number) {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
