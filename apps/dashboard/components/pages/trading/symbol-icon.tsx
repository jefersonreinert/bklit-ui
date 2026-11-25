import { cn } from "@/lib/utils";

/**
 * Round symbol marks like TradingView's watchlist: two overlapping round
 * country flags for currency pairs, colored badges for indices, crypto, metals, rates,
 * real logos for the big stocks and a letter badge for the rest.
 */

/**
 * Currency → round country flag in /public/flags (circle-flags, MIT, the
 * same set as the country pickers). EUR uses the EU flag.
 */
export const CURRENCY_FLAGS: Record<string, string> = {
  USD: "us",
  EUR: "eu",
  GBP: "gb",
  JPY: "jp",
  AUD: "au",
  NZD: "nz",
  CAD: "ca",
  CHF: "ch",
  CNY: "cn",
  CNH: "cn",
  HKD: "hk",
  SGD: "sg",
  SEK: "se",
  NOK: "no",
  DKK: "dk",
  ISK: "is",
  PLN: "pl",
  HUF: "hu",
  CZK: "cz",
  RON: "ro",
  BGN: "bg",
  TRY: "tr",
  RUB: "ru",
  ILS: "il",
  ZAR: "za",
  MXN: "mx",
  BRL: "br",
  ARS: "ar",
  CLP: "cl",
  COP: "co",
  PEN: "pe",
  INR: "in",
  KRW: "kr",
  TWD: "tw",
  THB: "th",
  IDR: "id",
  MYR: "my",
  PHP: "ph",
  VND: "vn",
  SAR: "sa",
  AED: "ae",
  QAR: "qa",
  KWD: "kw",
  EGP: "eg",
  NGN: "ng",
  KES: "ke",
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function Flag({ code, className }: { code: string; className?: string }) {
  const country = CURRENCY_FLAGS[code];
  return (
    <span
      className={cn(
        "absolute flex size-[70%] items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-[8px] ring-2 ring-background",
        className
      )}
    >
      {country ? (
        // biome-ignore lint/performance/noImgElement: static SVG flag
        <img
          alt=""
          className="size-full"
          decoding="async"
          height={32}
          loading="lazy"
          src={`${BASE_PATH}/flags/${country}.svg`}
          width={32}
        />
      ) : (
        code
      )}
    </span>
  );
}

interface Badge {
  bg: string;
  text: string;
  fg?: string;
}

const BADGES: Record<string, Badge> = {
  "DX-Y.NYB": { bg: "#2e7d5b", text: "$" },
  "^GSPC": { bg: "#c62834", text: "500" },
  "ES=F": { bg: "#c62834", text: "500" },
  "^NDX": { bg: "#2b8cad", text: "100" },
  "NQ=F": { bg: "#2b8cad", text: "100" },
  "^IXIC": { bg: "#2b8cad", text: "N" },
  "^DJI": { bg: "#3ba4d8", text: "30" },
  "YM=F": { bg: "#3ba4d8", text: "30" },
  "^RUT": { bg: "#5b1a3a", text: "2000" },
  "^NYA": { bg: "#4cb6e6", text: "NY" },
  "^BVSP": { bg: "#1f9a50", text: "B3" },
  "^GDAXI": { bg: "#222", text: "DAX" },
  "^FTSE": { bg: "#2a3f8f", text: "UK" },
  "^N225": { bg: "#c62834", text: "225" },
  "^VIX": { bg: "#7a5af8", text: "VIX" },
  "BTC-USD": { bg: "#f7931a", text: "₿" },
  "ETH-USD": { bg: "#627eea", text: "Ξ" },
  "SOL-USD": { bg: "#14b8a6", text: "S" },
  "XRP-USD": { bg: "#23292f", text: "X" },
  "BNB-USD": { bg: "#f0b90b", text: "B" },
  "DOGE-USD": { bg: "#c2a633", text: "Ð" },
  "GC=F": { bg: "#d4a72c", text: "Au" },
  "SI=F": { bg: "#a7a9b4", text: "Ag" },
  "CL=F": { bg: "#262626", text: "OIL" },
  "BZ=F": { bg: "#262626", text: "BR" },
  "NG=F": { bg: "#3b82f6", text: "GAS" },
  "HG=F": { bg: "#b87333", text: "Cu" },
};

/**
 * Stocks with a real logo in public/logos/stocks (TradingView-style square
 * marks, cropped to a circle here). Others keep the colored letter badge.
 */
export const STOCK_LOGOS = new Set([
  "AAPL",
  "ABBV",
  "ADBE",
  "AMD",
  "AMZN",
  "AVGO",
  "AXP",
  "BA",
  "BAC",
  "BRK-B",
  "CAT",
  "COST",
  "CRM",
  "CSCO",
  "CVX",
  "DIS",
  "GOOGL",
  "GS",
  "HD",
  "IBM",
  "INTC",
  "JNJ",
  "JPM",
  "KO",
  "LLY",
  "MA",
  "MCD",
  "META",
  "MRK",
  "MSFT",
  "NFLX",
  "NKE",
  "NVDA",
  "ORCL",
  "PEP",
  "PFE",
  "PG",
  "PYPL",
  "QCOM",
  "SBUX",
  "T",
  "TSLA",
  "TXN",
  "UBER",
  "UNH",
  "V",
  "VZ",
  "WFC",
  "WMT",
  "XOM",
]);

export function stockLogoSrc(symbol: string) {
  return STOCK_LOGOS.has(symbol)
    ? `${BASE_PATH}/logos/stocks/${symbol}.svg`
    : null;
}

const PAIR = /^([A-Z]{3})([A-Z]{3})=X$/;
const SINGLE_PAIR = /^([A-Z]{3})=X$/;
/** MT5 names: "mt5:EURUSD", broker suffixes like "EURUSD.r" or "EURUSDm". */
const MT5_PAIR = /^(?:MT5:)?([A-Z]{3})([A-Z]{3})(?:[^A-Z].*|M|PRO)?$/;
const RATE = /^\^(IRX|FVX|TNX|TYX)$/;
const STOCK_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#0891b2",
  "#16a34a",
  "#4f46e5",
  "#b45309",
];

function hashColor(s: string) {
  let h = 0;
  for (const ch of s) {
    h = (h * 31 + ch.charCodeAt(0)) % 2_147_483_647;
  }
  return STOCK_COLORS[h % STOCK_COLORS.length] ?? "#2563eb";
}

/**
 * Currencies of a forex symbol: Yahoo ("EURUSD=X", "BRL=X" → USD/BRL) or
 * MT5 ("mt5:GBPJPY"), when both sides are known currencies.
 */
export function pairOf(symbol: string): [string, string] | null {
  const p = PAIR.exec(symbol);
  if (p?.[1] && p[2]) {
    return [p[1], p[2]];
  }
  const s = SINGLE_PAIR.exec(symbol);
  if (s?.[1]) {
    return ["USD", s[1]];
  }
  const m = MT5_PAIR.exec(symbol.toUpperCase());
  return m?.[1] && m[2] && CURRENCY_FLAGS[m[1]] && CURRENCY_FLAGS[m[2]]
    ? [m[1], m[2]]
    : null;
}

export function SymbolIcon({
  symbol,
  label,
  className,
}: {
  symbol: string;
  label: string;
  className?: string;
}) {
  const box = cn("relative inline-flex size-10 shrink-0", className);
  const pair = pairOf(symbol);
  if (pair) {
    return (
      <span aria-hidden="true" className={box}>
        <Flag className="top-0 right-0" code={pair[1]} />
        <Flag className="bottom-0 left-0" code={pair[0]} />
      </span>
    );
  }
  if (RATE.test(symbol)) {
    return (
      <span aria-hidden="true" className={box}>
        <Flag className="inset-0 size-full ring-0" code="USD" />
      </span>
    );
  }
  const logo = stockLogoSrc(symbol);
  if (logo) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          box,
          "overflow-hidden rounded-full bg-muted ring-1 ring-border"
        )}
      >
        {/* biome-ignore lint/performance/noImgElement: static SVG logo */}
        <img
          alt=""
          className="size-full"
          decoding="async"
          height={56}
          loading="lazy"
          src={logo}
          width={56}
        />
      </span>
    );
  }
  const badge = BADGES[symbol];
  const text = badge?.text ?? label.slice(0, label.length > 4 ? 1 : 2);
  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "items-center justify-center rounded-full font-bold text-white",
        text.length > 2 ? "text-[10px]" : "text-sm"
      )}
      style={{ background: badge?.bg ?? hashColor(symbol) }}
    >
      {text}
    </span>
  );
}
