import { type NextRequest, NextResponse } from "next/server";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

/** Symbol search (Yahoo Finance): stocks, ETFs, indices, forex, futures, crypto. */

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  quoteType?: string;
  typeDisp?: string;
}

export async function GET(request: NextRequest) {
  if (!(await hasAccess(request))) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  if (!q) {
    return NextResponse.json({ results: [] });
  }
  const res = await fetch(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
        Accept: "application/json",
      },
    }
  ).catch(() => null);
  if (!res?.ok) {
    return NextResponse.json(
      { error: "Busca indisponível.", results: [] },
      { status: 502 }
    );
  }
  const json = (await res.json()) as { quotes?: YahooQuote[] };
  const results = (json.quotes ?? [])
    .filter((x) => x.symbol)
    .map((x) => ({
      symbol: x.symbol as string,
      name: x.shortname ?? x.longname ?? x.symbol ?? "",
      exchange: x.exchDisp ?? "",
      type: x.typeDisp ?? x.quoteType ?? "",
    }));
  return NextResponse.json({ results });
}
