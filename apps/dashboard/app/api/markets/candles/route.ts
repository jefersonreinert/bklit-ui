import { type NextRequest, NextResponse } from "next/server";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

/**
 * OHLC candles from Yahoo Finance (forex, gold, indices, stocks, crypto).
 * Crypto in real time comes straight from Binance in the browser.
 */

const INTERVALS: Record<string, { interval: string; range: string }> = {
  "1m": { interval: "1m", range: "5d" },
  "2m": { interval: "2m", range: "30d" },
  "5m": { interval: "5m", range: "30d" },
  "15m": { interval: "15m", range: "60d" },
  "30m": { interval: "30m", range: "60d" },
  "1h": { interval: "60m", range: "730d" },
  "4h": { interval: "60m", range: "730d" },
  D: { interval: "1d", range: "10y" },
  W: { interval: "1wk", range: "max" },
  M: { interval: "1mo", range: "max" },
};
const SYMBOL = /^[A-Za-z0-9^=.-]{1,24}$/;
const TTL_MS = 4000;
// 4h is built from 1h candles: the live window must cover a whole 4h bucket
const LONG_LIVE = new Set(["4h", "D", "W", "M"]);
const cache = new Map<string, { at: number; body: unknown }>();

interface YahooChart {
  chart?: {
    result?: {
      meta?: Record<string, unknown>;
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
      };
    }[];
    error?: { description?: string } | null;
  };
}

function toCandles(json: YahooChart) {
  const r = json.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  const t = r?.timestamp ?? [];
  const out: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[] = [];
  t.forEach((ts, i) => {
    const o = q?.open?.[i];
    const h = q?.high?.[i];
    const l = q?.low?.[i];
    const c = q?.close?.[i];
    if (o != null && h != null && l != null && c != null) {
      out.push({
        time: ts * 1000,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: q?.volume?.[i] ?? 0,
      });
    }
  });
  return { candles: out, meta: r?.meta ?? {} };
}

export async function GET(request: NextRequest) {
  if (!(await hasAccess(request))) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const symbol = request.nextUrl.searchParams.get("symbol") ?? "";
  const tf = request.nextUrl.searchParams.get("tf") ?? "1h";
  const live = request.nextUrl.searchParams.get("live") === "1";
  const spec = INTERVALS[tf];
  if (!(SYMBOL.test(symbol) && spec)) {
    return NextResponse.json(
      { error: "Ativo ou intervalo inválido." },
      { status: 400 }
    );
  }
  // Live polls only need the last day
  let range = spec.range;
  if (live) {
    range = LONG_LIVE.has(tf) ? "5d" : "1d";
  }
  const key = `${symbol}:${spec.interval}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.body);
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${spec.interval}&range=${range}&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
      Accept: "application/json",
    },
  }).catch(() => null);
  if (!res?.ok) {
    return NextResponse.json(
      { error: `Sem dados do Yahoo Finance (${res?.status ?? "rede"}).` },
      { status: 502 }
    );
  }
  const body = toCandles((await res.json()) as YahooChart);
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, max-age=5" },
  });
}
