/**
 * Explore tab (TradingView's "Explore"): curated symbols per category and
 * the intraday spark lines drawn on their cards.
 */

export interface ExploreItem {
  symbol: string;
  label: string;
  name: string;
}

export interface ExploreCategory {
  id: string;
  label: string;
  items: ExploreItem[];
}

const e = (symbol: string, label: string, name: string): ExploreItem => ({
  symbol,
  label,
  name,
});

export const EXPLORE: ExploreCategory[] = [
  {
    id: "indices",
    label: "Índices",
    items: [
      e("^GSPC", "SPX", "S&P 500"),
      e("^DJI", "DJI", "Dow 30"),
      e("^IXIC", "IXIC", "Nasdaq Composite"),
      e("^NDX", "NDX", "Nasdaq 100"),
      e("^RUT", "RUT", "US 2000 small cap"),
      e("^NYA", "NYA", "NYSE Composite"),
      e("^BVSP", "IBOV", "Ibovespa"),
      e("^GDAXI", "DAX", "DAX"),
      e("^FTSE", "UKX", "FTSE 100"),
      e("^N225", "NI225", "Nikkei 225"),
    ],
  },
  {
    id: "stocks",
    label: "Ações EUA",
    // The 50 biggest and best-known US companies (all have logos)
    items: [
      e("AAPL", "AAPL", "Apple"),
      e("MSFT", "MSFT", "Microsoft"),
      e("NVDA", "NVDA", "NVIDIA"),
      e("AMZN", "AMZN", "Amazon"),
      e("GOOGL", "GOOGL", "Alphabet (Google)"),
      e("META", "META", "Meta"),
      e("TSLA", "TSLA", "Tesla"),
      e("AVGO", "AVGO", "Broadcom"),
      e("BRK-B", "BRK.B", "Berkshire Hathaway"),
      e("JPM", "JPM", "JPMorgan Chase"),
      e("LLY", "LLY", "Eli Lilly"),
      e("V", "V", "Visa"),
      e("MA", "MA", "Mastercard"),
      e("UNH", "UNH", "UnitedHealth"),
      e("XOM", "XOM", "ExxonMobil"),
      e("WMT", "WMT", "Walmart"),
      e("JNJ", "JNJ", "Johnson & Johnson"),
      e("PG", "PG", "Procter & Gamble"),
      e("HD", "HD", "Home Depot"),
      e("COST", "COST", "Costco"),
      e("ORCL", "ORCL", "Oracle"),
      e("NFLX", "NFLX", "Netflix"),
      e("ABBV", "ABBV", "AbbVie"),
      e("BAC", "BAC", "Bank of America"),
      e("KO", "KO", "Coca-Cola"),
      e("PEP", "PEP", "PepsiCo"),
      e("CVX", "CVX", "Chevron"),
      e("MRK", "MRK", "Merck"),
      e("ADBE", "ADBE", "Adobe"),
      e("CRM", "CRM", "Salesforce"),
      e("AMD", "AMD", "AMD"),
      e("INTC", "INTC", "Intel"),
      e("CSCO", "CSCO", "Cisco"),
      e("MCD", "MCD", "McDonald's"),
      e("DIS", "DIS", "Disney"),
      e("NKE", "NKE", "Nike"),
      e("IBM", "IBM", "IBM"),
      e("QCOM", "QCOM", "Qualcomm"),
      e("TXN", "TXN", "Texas Instruments"),
      e("GS", "GS", "Goldman Sachs"),
      e("CAT", "CAT", "Caterpillar"),
      e("BA", "BA", "Boeing"),
      e("PFE", "PFE", "Pfizer"),
      e("T", "T", "AT&T"),
      e("VZ", "VZ", "Verizon"),
      e("WFC", "WFC", "Wells Fargo"),
      e("AXP", "AXP", "American Express"),
      e("SBUX", "SBUX", "Starbucks"),
      e("PYPL", "PYPL", "PayPal"),
      e("UBER", "UBER", "Uber"),
    ],
  },
  {
    id: "stocks-br",
    label: "Brasil",
    items: [
      e("PETR4.SA", "PETR4", "Petrobras"),
      e("VALE3.SA", "VALE3", "Vale"),
      e("ITUB4.SA", "ITUB4", "Itaú"),
    ],
  },
  {
    id: "crypto",
    label: "Cripto",
    items: [
      e("BTC-USD", "BTCUSD", "Bitcoin"),
      e("ETH-USD", "ETHUSD", "Ethereum"),
      e("SOL-USD", "SOLUSD", "Solana"),
      e("XRP-USD", "XRPUSD", "XRP"),
      e("BNB-USD", "BNBUSD", "BNB"),
      e("DOGE-USD", "DOGEUSD", "Dogecoin"),
    ],
  },
  {
    id: "futures",
    label: "Futuros",
    items: [
      e("ES=F", "ES1!", "E-mini S&P 500"),
      e("NQ=F", "NQ1!", "E-mini Nasdaq-100"),
      e("YM=F", "YM1!", "E-mini Dow"),
      e("GC=F", "GC1!", "Ouro"),
      e("SI=F", "SI1!", "Prata"),
      e("CL=F", "CL1!", "Petróleo WTI"),
      e("NG=F", "NG1!", "Gás natural"),
      e("HG=F", "HG1!", "Cobre"),
    ],
  },
  {
    id: "forex",
    label: "Forex",
    items: [
      e("EURUSD=X", "EURUSD", "Euro / Dólar"),
      e("GBPUSD=X", "GBPUSD", "Libra / Dólar"),
      e("USDJPY=X", "USDJPY", "Dólar / Iene"),
      e("AUDUSD=X", "AUDUSD", "Dólar australiano / Dólar"),
      e("CAD=X", "USDCAD", "Dólar / Dólar canadense"),
      e("CHF=X", "USDCHF", "Dólar / Franco suíço"),
      e("BRL=X", "USDBRL", "Dólar / Real"),
      e("DX-Y.NYB", "DXY", "Índice do Dólar"),
    ],
  },
  {
    id: "bonds",
    label: "Juros",
    items: [
      e("^IRX", "US03MY", "EUA 3 meses"),
      e("^FVX", "US05Y", "EUA 5 anos"),
      e("^TNX", "US10Y", "EUA 10 anos"),
      e("^TYX", "US30Y", "EUA 30 anos"),
    ],
  },
];

export interface Spark {
  symbol: string;
  closes: number[];
  price: number | null;
  prevClose: number | null;
  currency: string;
}

interface YahooSpark {
  symbol?: string;
  response?: {
    meta?: {
      regularMarketPrice?: number;
      chartPreviousClose?: number;
      previousClose?: number;
      currency?: string;
    };
    indicators?: { quote?: { close?: (number | null)[] }[] };
  }[];
}

/** Yahoo's v7 spark answer → one line per symbol. */
export function parseSpark(json: unknown): Spark[] {
  const results =
    (json as { spark?: { result?: YahooSpark[] } })?.spark?.result ?? [];
  const out: Spark[] = [];
  for (const r of results) {
    const first = r.response?.[0];
    if (!(r.symbol && first)) {
      continue;
    }
    const closes = (first.indicators?.quote?.[0]?.close ?? []).filter(
      (c): c is number => typeof c === "number"
    );
    const m = first.meta ?? {};
    out.push({
      symbol: r.symbol,
      closes,
      price: m.regularMarketPrice ?? closes.at(-1) ?? null,
      prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
      currency: m.currency ?? "",
    });
  }
  return out;
}

/** Day change from the previous close (null when unknown). */
export function sparkChange(s: Spark) {
  if (s.price == null || !s.prevClose) {
    return null;
  }
  return ((s.price - s.prevClose) / s.prevClose) * 100;
}
