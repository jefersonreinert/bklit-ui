"use client";

import { useMemo } from "react";
import type { Candle } from "@/components/pages/trading/mt5/engine/ChartEngine";
import type { OhlcCandle } from "../metatrader/ohlc-feed";
import { aggregateCandles } from "./aggregate";
import { type Mt5Candles, useMt5Candles } from "./mt5-candles";
import { type CustomTf, MINUTE, parseTimeframe } from "./timeframe";
import {
  type FeedSource,
  isPresetTf,
  type Timeframe,
  useCandles,
} from "./trading";

/**
 * Candles for the chart from the best source: the MT5 EA when it sends this
 * symbol (any timeframe, real time), otherwise Yahoo/Binance (the standard
 * timeframes, and custom whole minutes/hours/days built from them).
 */

const YAHOO_BASES: [Timeframe, number][] = [
  ["1h", 60 * MINUTE],
  ["30m", 30 * MINUTE],
  ["15m", 15 * MINUTE],
  ["5m", 5 * MINUTE],
  ["1m", MINUTE],
];

/** Yahoo/Binance candles a custom timeframe can be built from (null: none). */
export function webBaseFor(tf: CustomTf): Timeframe | null {
  switch (tf.unit) {
    case "s":
    case "T":
      return null;
    case "M":
      return "M";
    case "W":
      return "W";
    case "D":
      return "D";
    default:
      return YAHOO_BASES.find(([, ms]) => tf.ms % ms === 0)?.[0] ?? null;
  }
}

const UTC = { offsetMs: 0, brokerOffsetMs: 0 };
const noop = () => undefined;

export interface ChartFeed {
  candles: Candle[] | null;
  error: string | null;
  digits?: number;
  source: FeedSource;
  reload: () => void;
  /** EA status when the candles come from MT5. */
  ea: Mt5Candles | null;
  loadOlder: () => void;
}

/**
 * Yahoo/Binance candles for a timeframe (custom whole minutes/hours/days
 * built from the standard ones). `eaPending`: still checking the EA.
 */
function useWebFeed(
  symbol: string,
  tfId: string,
  enabled: boolean,
  eaPending: boolean
): ChartFeed {
  const tf = useMemo(() => parseTimeframe(tfId), [tfId]);
  const base = tf ? webBaseFor(tf) : null;
  const preset = isPresetTf(tfId) ? tfId : base;
  const web = useCandles(symbol, preset ?? "1m", enabled && preset !== null);

  const webCandles = useMemo(() => {
    if (!(web.candles && tf) || isPresetTf(tfId)) {
      return web.candles;
    }
    const src = web.candles.map(
      (c): OhlcCandle => ({ volume: 0, realVolume: 0, spread: 0, ...c })
    );
    return aggregateCandles(src, tf, UTC);
  }, [web.candles, tf, tfId]);

  if (!tf) {
    return {
      ...web,
      error: "Tempo gráfico inválido.",
      ea: null,
      loadOlder: noop,
    };
  }
  if (preset === null) {
    return {
      candles: eaPending ? null : [],
      error: eaPending
        ? null
        : "Tempos em segundos e por ticks precisam do EA MT5 (CasaBrasaOHLCExport) enviando este ativo.",
      digits: undefined,
      source: "mt5",
      reload: noop,
      ea: null,
      loadOlder: noop,
    };
  }
  return { ...web, candles: webCandles, ea: null, loadOlder: noop };
}

/** Without the panel database (Convex): Yahoo/Binance only. */
export function useWebChartCandles(symbol: string, tfId: string): ChartFeed {
  return useWebFeed(symbol, tfId, true, false);
}

/** EA first, Yahoo/Binance otherwise. Must run under a ConvexProvider. */
export function useChartCandles(
  symbol: string,
  label: string,
  tfId: string,
  alignUtc = false
): ChartFeed {
  const ea = useMt5Candles(label, tfId, alignUtc);
  const fromEa = ea.available === true;
  const web = useWebFeed(symbol, tfId, !fromEa, ea.available === undefined);
  if (!fromEa) {
    return web;
  }
  return {
    candles: ea.candles,
    error: ea.candles?.length ? null : ea.error,
    digits: ea.digits,
    source: "mt5",
    reload: noop,
    ea,
    loadOlder: ea.loadOlder,
  };
}
