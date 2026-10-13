import { type NextRequest, NextResponse } from "next/server";
import { parseSpark, type Spark } from "@/lib/markets/explore";

export const dynamic = "force-dynamic";

/** Intraday lines for the Explore cards (Yahoo Finance spark, batched). */

const SYMBOL = /^[A-Za-z0-9^=.-]{1,24}$/;
const TTL_MS = 60_000;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  Accept: "application/json",
};
const cache = new Map<string, { at: number; spark: Spark }>();
const BATCH = 20;

async function fetchBatch(symbols: string[]) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(",")}&range=1d&interval=15m`,
    { headers: HEADERS }
  ).catch(() => null);
  if (!res?.ok) {
    return [];
  }
  return parseSpark(await res.json().catch(() => null));
}

export async function GET(request: NextRequest) {
  const symbols = (request.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .filter((s) => SYMBOL.test(s))
    .slice(0, 40);
  const now = Date.now();
  const stale = symbols.filter((s) => {
    const hit = cache.get(s);
    return !hit || now - hit.at > TTL_MS;
  });
  for (let i = 0; i < stale.length; i += BATCH) {
    for (const s of await fetchBatch(stale.slice(i, i + BATCH))) {
      cache.set(s.symbol, { at: now, spark: s });
    }
  }
  const sparks = symbols
    .map((s) => cache.get(s)?.spark)
    .filter((s): s is Spark => Boolean(s));
  return NextResponse.json(
    { sparks },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}
