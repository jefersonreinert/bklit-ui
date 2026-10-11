import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Round symbol marks like TradingView's watchlist: two overlapping flags
 * for currency pairs, colored badges for indices, crypto, metals, rates
 * and a letter badge for stocks.
 */

const FLAGS: Record<string, ReactNode> = {
  USD: (
    <>
      {[0, 2, 4, 6, 8, 10, 12].map((y) => (
        <rect fill="#e0484f" height="1.4" key={y} width="20" y={y * 1.55} />
      ))}
      <rect fill="#2f4f9e" height="10.8" width="10" />
      {[2, 5, 8].map((x) =>
        [2.5, 5.5, 8.5].map((y) => (
          <circle cx={x} cy={y} fill="#fff" key={`${x}-${y}`} r="0.6" />
        ))
      )}
    </>
  ),
  EUR: (
    <>
      <rect fill="#2f4aa8" height="20" width="20" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <circle
            cx={10 + Math.cos(a) * 5.5}
            cy={10 + Math.sin(a) * 5.5}
            fill="#ffd43b"
            key={a}
            r="0.9"
          />
        );
      })}
    </>
  ),
  GBP: (
    <>
      <rect fill="#2a3f8f" height="20" width="20" />
      <path d="M0 0 20 20M20 0 0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0 20 20M20 0 0 20" stroke="#d6323f" strokeWidth="1.4" />
      <path d="M10 0v20M0 10h20" stroke="#fff" strokeWidth="6" />
      <path d="M10 0v20M0 10h20" stroke="#d6323f" strokeWidth="3.4" />
    </>
  ),
  JPY: (
    <>
      <rect fill="#fff" height="20" width="20" />
      <circle cx="10" cy="10" fill="#d6323f" r="5" />
    </>
  ),
  AUD: (
    <>
      <rect fill="#273b8f" height="20" width="20" />
      <path d="M0 0 9 9M9 0 0 9" stroke="#fff" strokeWidth="2" />
      <path d="M4.5 0v9M0 4.5h9" stroke="#d6323f" strokeWidth="1.8" />
      {[
        [14, 6],
        [16, 11],
        [12, 13],
        [14, 16],
        [5, 15],
      ].map(([x, y]) => (
        <circle cx={x} cy={y} fill="#fff" key={`${x}${y}`} r="1" />
      ))}
    </>
  ),
  NZD: (
    <>
      <rect fill="#273b8f" height="20" width="20" />
      <path d="M0 0 9 9M9 0 0 9" stroke="#fff" strokeWidth="2" />
      <path d="M4.5 0v9M0 4.5h9" stroke="#d6323f" strokeWidth="1.8" />
      {[
        [14, 5],
        [16.5, 10],
        [12, 11],
        [14, 16],
      ].map(([x, y]) => (
        <circle cx={x} cy={y} fill="#d6323f" key={`${x}${y}`} r="1.1" />
      ))}
    </>
  ),
  CAD: (
    <>
      <rect fill="#fff" height="20" width="20" />
      <rect fill="#d6323f" height="20" width="5" />
      <rect fill="#d6323f" height="20" width="5" x="15" />
      <path d="M10 5l1.5 3 2-1-1 4 2 0-4 4-4-4 2 0-1-4 2 1z" fill="#d6323f" />
    </>
  ),
  CHF: (
    <>
      <rect fill="#d6323f" height="20" width="20" />
      <path d="M10 5v10M5 10h10" stroke="#fff" strokeWidth="3" />
    </>
  ),
  BRL: (
    <>
      <rect fill="#1f9a50" height="20" width="20" />
      <path d="M10 3 18 10 10 17 2 10z" fill="#ffd43b" />
      <circle cx="10" cy="10" fill="#273b8f" r="3.6" />
    </>
  ),
  CNY: (
    <>
      <rect fill="#d6323f" height="20" width="20" />
      <circle cx="6" cy="6" fill="#ffd43b" r="2" />
    </>
  ),
  MXN: (
    <>
      <rect fill="#1f9a50" height="20" width="7" />
      <rect fill="#fff" height="20" width="6" x="7" />
      <rect fill="#d6323f" height="20" width="7" x="13" />
    </>
  ),
};

function Flag({ code, className }: { code: string; className?: string }) {
  const flag = FLAGS[code];
  return (
    <span
      className={cn(
        "absolute flex size-[70%] items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-[8px] ring-2 ring-background",
        className
      )}
    >
      {flag ? (
        <svg aria-hidden="true" className="size-full" viewBox="0 0 20 20">
          {flag}
        </svg>
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

const PAIR = /^([A-Z]{3})([A-Z]{3})=X$/;
const SINGLE_PAIR = /^([A-Z]{3})=X$/;
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

/** Currencies of a Yahoo forex symbol ("EURUSD=X", "BRL=X" → USD/BRL). */
export function pairOf(symbol: string): [string, string] | null {
  const p = PAIR.exec(symbol);
  if (p?.[1] && p[2]) {
    return [p[1], p[2]];
  }
  const s = SINGLE_PAIR.exec(symbol);
  return s?.[1] ? ["USD", s[1]] : null;
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
