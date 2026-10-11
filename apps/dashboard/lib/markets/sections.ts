/**
 * Watchlist sections like TradingView (Índices, Forex, Commodities…):
 * defaults, a guess for symbols added without one, and the migration of
 * lists saved before sections existed.
 */

export interface SectionedItem {
  symbol: string;
  label: string;
  name: string;
  section?: string;
  /** Red flag, like TradingView's flagged symbols. */
  flag?: boolean;
}

export const SECTION_INDICES = "Índices";
export const SECTION_FOREX = "Forex";
export const SECTION_COMMODITIES = "Commodities";
export const SECTION_RATES = "Juros";
export const SECTION_CRYPTO = "Cripto";
export const SECTION_STOCKS = "Ações";
export const SECTION_OTHER = "Outros";

export const DEFAULT_SECTIONS = [
  SECTION_INDICES,
  SECTION_FOREX,
  SECTION_COMMODITIES,
  SECTION_RATES,
  SECTION_CRYPTO,
  SECTION_STOCKS,
];

const it = (
  symbol: string,
  label: string,
  name: string,
  section: string
): SectionedItem => ({ symbol, label, name, section });

export const DEFAULT_ITEMS: SectionedItem[] = [
  it("DX-Y.NYB", "DXY", "Índice do Dólar (DXY)", SECTION_INDICES),
  it("^GSPC", "SPX500", "S&P 500", SECTION_INDICES),
  it("^NDX", "NAS100", "Nasdaq 100", SECTION_INDICES),
  it("^DJI", "US30", "Dow Jones Industrial", SECTION_INDICES),
  it("^BVSP", "IBOV", "Ibovespa", SECTION_INDICES),
  it("EURUSD=X", "EURUSD", "Euro / Dólar", SECTION_FOREX),
  it("GBPUSD=X", "GBPUSD", "Libra / Dólar", SECTION_FOREX),
  it("AUDUSD=X", "AUDUSD", "Dólar australiano / Dólar", SECTION_FOREX),
  it("NZDUSD=X", "NZDUSD", "Dólar neozelandês / Dólar", SECTION_FOREX),
  it("USDJPY=X", "USDJPY", "Dólar / Iene", SECTION_FOREX),
  it("CAD=X", "USDCAD", "Dólar / Dólar canadense", SECTION_FOREX),
  it("BRL=X", "USDBRL", "Dólar / Real", SECTION_FOREX),
  it("GC=F", "XAUUSD", "Ouro", SECTION_COMMODITIES),
  it("SI=F", "XAGUSD", "Prata", SECTION_COMMODITIES),
  it("CL=F", "USOIL", "Petróleo WTI", SECTION_COMMODITIES),
  it("^FVX", "US05Y", "Juros EUA 5 anos", SECTION_RATES),
  it("^TNX", "US10Y", "Juros EUA 10 anos", SECTION_RATES),
  it("^TYX", "US30Y", "Juros EUA 30 anos", SECTION_RATES),
  it("BTC-USD", "BTCUSD", "Bitcoin", SECTION_CRYPTO),
  it("ETH-USD", "ETHUSD", "Ethereum", SECTION_CRYPTO),
  it("AAPL", "AAPL", "Apple", SECTION_STOCKS),
  it("NVDA", "NVDA", "NVIDIA", SECTION_STOCKS),
  it("TSLA", "TSLA", "Tesla", SECTION_STOCKS),
];

const RATE = /^\^(IRX|FVX|TNX|TYX)$/;
const FUTURE = /=F$/;
const PAIR = /=X$/;
const CRYPTO = /-USD$|-USDT$|-BTC$/;
const INDEX = /^\^|^DX-Y/;

/** Where a symbol goes when nobody chose a section. */
export function guessSection(symbol: string, type?: string) {
  const t = type?.toUpperCase() ?? "";
  if (RATE.test(symbol)) {
    return SECTION_RATES;
  }
  if (PAIR.test(symbol) || t === "CURRENCY") {
    return SECTION_FOREX;
  }
  if (CRYPTO.test(symbol) || t === "CRYPTOCURRENCY") {
    return SECTION_CRYPTO;
  }
  if (FUTURE.test(symbol) || t === "FUTURE") {
    return SECTION_COMMODITIES;
  }
  if (INDEX.test(symbol) || t === "INDEX") {
    return SECTION_INDICES;
  }
  if (t === "EQUITY" || t === "ETF" || t === "" || t === "MUTUALFUND") {
    return SECTION_STOCKS;
  }
  return SECTION_OTHER;
}

/** Gives every item a section and lists every section that has items. */
export function normalizeSections<T extends SectionedItem>(
  items: T[],
  sections: string[] | undefined
) {
  const withSection = items.map((i) =>
    i.section ? i : { ...i, section: guessSection(i.symbol) }
  );
  const order = [...(sections ?? DEFAULT_SECTIONS)];
  for (const i of withSection) {
    if (i.section && !order.includes(i.section)) {
      order.push(i.section);
    }
  }
  return { items: withSection, sections: order };
}

/** Items grouped in section order (empty sections included). */
export function groupBySection<T extends SectionedItem>(
  items: T[],
  sections: string[]
) {
  return sections.map((name) => ({
    name,
    items: items.filter((i) => (i.section ?? SECTION_OTHER) === name),
  }));
}

/**
 * Splits a formatted price so the last digit can be drawn smaller, like
 * TradingView's fractional pips ("1.12005" → "1.1200" + "5"). Only for
 * 3- and 5-decimal quotes (forex).
 */
export function splitPips(formatted: string, digits: number) {
  if (digits !== 3 && digits !== 5) {
    return { main: formatted, pip: "" };
  }
  return { main: formatted.slice(0, -1), pip: formatted.slice(-1) };
}
