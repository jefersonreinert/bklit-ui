import { type NextRequest, NextResponse } from "next/server";
import { isRange, parseYahooChart, YAHOO_RANGE } from "@/lib/markets/history";

export const dynamic = "force-dynamic";

/** Price history for one range of the symbol overview (Yahoo Finance). */

const SYMBOL = /^[A-Za-z0-9^=.-]{1,24}$/;
const TTL_MS = 20_000;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  Accept: "application/json",
};
const cache = new Map<string, { at: number; body: unknown }>();

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") ?? "";
  const range = request.nextUrl.searchParams.get("range") ?? "1D";
  if (!(SYMBOL.test(symbol) && isRange(range))) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const key = `${symbol}|${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.body);
  }
  const { range: r, interval } = YAHOO_RANGE[range];
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${r}&interval=${interval}&includePrePost=false`,
    { headers: HEADERS }
  ).catch(() => null);
  if (!res?.ok) {
    return hit
      ? NextResponse.json(hit.body)
      : NextResponse.json(
          { error: "Sem dados do Yahoo Finance agora." },
          { status: 502 }
        );
  }
  const body = parseYahooChart(await res.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: "Ativo sem dados." }, { status: 404 });
  }
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, max-age=15" },
  });
}
