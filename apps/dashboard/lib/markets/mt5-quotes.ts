"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { MT5_PREFIX, MT5_SECTION, matchFeedSymbol } from "./mt5-candles";
import type { Quote, WatchItem } from "./trading";

/**
 * Watchlist prices straight from the MT5 EA (convex ohlc.quotes): every
 * symbol the terminal sends replaces the Yahoo quote of its watchlist item,
 * and symbols that are not in the watchlist show up in an "MT5 (EA)"
 * section, so every asset the EA exports is on the platform.
 */

export interface EaQuote {
  symbol: string;
  digits: number;
  bid: number;
  ask: number;
  tickMs: number;
  prevClose: number | null;
}

export function toQuote(symbol: string, name: string, q: EaQuote): Quote {
  const prev = q.prevClose ?? q.bid;
  const change = q.bid - prev;
  return {
    symbol,
    price: q.bid,
    prevClose: prev,
    change,
    changePct: prev ? (change / prev) * 100 : 0,
    currency: "",
    name,
    digits: q.digits,
    marketState: "MT5",
  };
}

/** EA quotes over the watchlist + the EA symbols that are not in it. */
export function mergeEaQuotes(
  items: WatchItem[],
  base: Record<string, Quote>,
  ea: EaQuote[]
) {
  const quotes = { ...base };
  const names = ea.map((q) => q.symbol);
  const used = new Set<string>();
  for (const item of items) {
    const sym = item.symbol.startsWith(MT5_PREFIX)
      ? item.symbol.slice(MT5_PREFIX.length)
      : matchFeedSymbol(item.label, names);
    const q = sym ? ea.find((e) => e.symbol === sym) : undefined;
    if (q && sym) {
      used.add(sym);
      quotes[item.symbol] = toQuote(item.symbol, item.name, q);
    }
  }
  const extra: WatchItem[] = [];
  for (const q of ea) {
    if (used.has(q.symbol)) {
      continue;
    }
    const symbol = `${MT5_PREFIX}${q.symbol}`;
    extra.push({
      symbol,
      label: q.symbol,
      name: q.symbol,
      section: MT5_SECTION,
    });
    quotes[symbol] = toQuote(symbol, q.symbol, q);
  }
  return { quotes, extra };
}

/** Live EA quotes (needs a ConvexProvider). */
export function useEaQuotes(): EaQuote[] {
  const res = useQuery(api.ohlc.quotes, {});
  return useMemo(() => res?.quotes ?? [], [res]);
}
