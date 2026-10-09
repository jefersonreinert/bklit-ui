import { type NextRequest, NextResponse } from "next/server";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

/** Last price and day change for the watchlist (Yahoo Finance chart meta). */

const SYMBOL = /^[A-Za-z0-9^=.-]{1,24}$/;
const TTL_MS = 15_000;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  Accept: "application/json",
};
const cache = new Map<string, { at: number; quote: Quote | null }>();

interface Quote {
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

interface Meta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  currency?: string;
  shortName?: string;
  longName?: string;
  priceHint?: number;
  currentTradingPeriod?: { regular?: { start: number; end: number } };
}

async function quote(symbol: string): Promise<Quote | null> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.quote;
  }
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
    { headers: HEADERS }
  ).catch(() => null);
  if (!res?.ok) {
    return hit?.quote ?? null;
  }
  const json = (await res.json()) as {
    chart?: {
      result?: {
        meta?: Meta;
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
    };
  };
  const r = json.chart?.result?.[0];
  const q = toQuote(symbol, r?.meta, r?.indicators?.quote?.[0]?.close ?? []);
  if (!q) {
    return null;
  }
  cache.set(symbol, { at: Date.now(), quote: q });
  return q;
}

interface SparkResult {
  symbol?: string;
  response?: {
    meta?: Meta;
    indicators?: { quote?: { close?: (number | null)[] }[] };
  }[];
}

function toQuote(
  symbol: string,
  m: Meta | undefined,
  closes: (number | null)[]
): Quote | null {
  const price = m?.regularMarketPrice;
  if (!(m && price)) {
    return null;
  }
  // Previous session close: second to last daily close
  const valid = closes.filter((c): c is number => c != null);
  const prevClose =
    valid.length >= 2
      ? (valid.at(-2) ?? price)
      : (m.previousClose ?? m.chartPreviousClose ?? price);
  const period = m.currentTradingPeriod?.regular;
  const now = Date.now() / 1000;
  return {
    symbol,
    price,
    prevClose,
    change: price - prevClose,
    changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    currency: m.currency ?? "",
    name: m.shortName ?? m.longName ?? symbol,
    digits: m.priceHint ?? 2,
    marketState:
      period && now >= period.start && now <= period.end ? "open" : "closed",
  };
}

/** Every symbol in one request (Yahoo "spark"); null when it fails. */
async function spark(symbols: string[]) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(",")}&range=5d&interval=1d`,
    { headers: HEADERS }
  ).catch(() => null);
  if (!res?.ok) {
    return null;
  }
  const json = (await res.json().catch(() => null)) as {
    spark?: { result?: SparkResult[] };
  } | null;
  const results = json?.spark?.result;
  if (!results) {
    return null;
  }
  const out: Quote[] = [];
  for (const r of results) {
    const first = r.response?.[0];
    const q = r.symbol
      ? toQuote(
          r.symbol,
          first?.meta,
          first?.indicators?.quote?.[0]?.close ?? []
        )
      : null;
    if (q) {
      cache.set(q.symbol, { at: Date.now(), quote: q });
      out.push(q);
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  if (!(await hasAccess(request))) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const symbols = (request.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .filter((s) => SYMBOL.test(s))
    .slice(0, 40);
  const fresh = (s: string) => {
    const hit = cache.get(s);
    return hit && Date.now() - hit.at < TTL_MS ? hit.quote : undefined;
  };
  const stale = symbols.filter((s) => fresh(s) === undefined);
  if (stale.length > 0 && !(await spark(stale))) {
    // Spark unavailable: one chart request per symbol, a few at a time
    for (let i = 0; i < stale.length; i += 4) {
      await Promise.all(stale.slice(i, i + 4).map(quote));
    }
  }
  const quotes = symbols.map((s) => cache.get(s)?.quote ?? null);
  return NextResponse.json({
    quotes: quotes.filter((q): q is Quote => q !== null),
  });
}
