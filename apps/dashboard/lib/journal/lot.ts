/**
 * Lot calculator for orders sent to MT5 through the TradingJournal
 * Complete EA. Every number of the symbol comes from the terminal (EA v4.10
 * sync): tick size and value in the account currency, volume limits, stop
 * level and the live bid/ask.
 *
 * The risk of a buy is measured from the ask to the stop (the stop fires on
 * the bid), and of a sell from the bid, so the spread is already included.
 */

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop";

export interface SymbolSpec {
  symbol: string;
  digits: number;
  point: number;
  tickSize: number;
  /** Value of one tick for 1 lot, in the account currency (loss side). */
  tickValue: number;
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  /** Minimum distance of SL/TP from the price, in points. */
  stopsLevel: number;
}

export interface Quote {
  bid: number;
  ask: number;
}

const EPS = 1e-9;

const decimalsOf = (step: number) => {
  const s = String(step);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
};

/** A price rounded to the symbol's tick size and digits. */
export function roundPrice(price: number, spec: SymbolSpec) {
  const tick = spec.tickSize > 0 ? spec.tickSize : spec.point;
  const rounded = tick > 0 ? Math.round(price / tick) * tick : price;
  return Number(rounded.toFixed(spec.digits));
}

/**
 * A volume rounded DOWN to the step and capped at the maximum; 0 when it
 * is under the minimum (the order would risk more than asked).
 */
export function roundVolume(volume: number, spec: SymbolSpec) {
  const step = spec.volumeStep > 0 ? spec.volumeStep : 0.01;
  const steps = Math.floor(volume / step + EPS);
  const v = Number(
    Math.min(steps * step, spec.volumeMax || Number.POSITIVE_INFINITY).toFixed(
      decimalsOf(step)
    )
  );
  return v + EPS < spec.volumeMin ? 0 : v;
}

/** One pip: 10 points on 3/5-digit symbols, else one point. */
export const pipSize = (spec: SymbolSpec) =>
  spec.digits === 3 || spec.digits === 5 ? spec.point * 10 : spec.point;

/** Where a market order fills: the ask for a buy, the bid for a sell. */
export const marketPrice = (side: Side, q: Quote) =>
  side === "buy" ? q.ask : q.bid;

/** Money lost per lot from `entry` to `sl` (plus a round-turn commission). */
export function riskPerLot(
  spec: SymbolSpec,
  entry: number,
  sl: number,
  commissionPerLot = 0
) {
  if (spec.tickSize <= 0 || spec.tickValue <= 0) {
    return 0;
  }
  const ticks = Math.abs(entry - sl) / spec.tickSize;
  return ticks * spec.tickValue + Math.max(0, commissionPerLot);
}

/** A price `pips` away from `from`, against (sl) or for (tp) the trade. */
export function offsetPrice(
  side: Side,
  from: number,
  pips: number,
  spec: SymbolSpec,
  kind: "sl" | "tp"
) {
  const dir = (side === "buy") === (kind === "tp") ? 1 : -1;
  return roundPrice(from + dir * pips * pipSize(spec), spec);
}

/** Take profit at `r` times the risk distance. */
export function tpForR(
  side: Side,
  entry: number,
  sl: number,
  r: number,
  spec: SymbolSpec
) {
  const dist = Math.abs(entry - sl) * r;
  return roundPrice(side === "buy" ? entry + dist : entry - dist, spec);
}

/** Distance from `entry` to `price` in pips. */
export const pipsBetween = (entry: number, price: number, spec: SymbolSpec) =>
  Math.abs(entry - price) / pipSize(spec);

export interface LotInput {
  balance: number;
  /** Risk per trade in percent of the balance (1 = 1 %). */
  riskPct: number;
  entry: number;
  sl: number;
  spec: SymbolSpec;
  commissionPerLot?: number;
}

export interface LotResult {
  lot: number;
  /** What the chosen % of the balance allows. */
  riskTarget: number;
  /** What the rounded lot really risks. */
  risk: number;
  riskPct: number;
  slPips: number;
  slPoints: number;
}

/** The biggest lot whose loss at the stop stays within the risk %. */
export function lotForRisk(i: LotInput): LotResult {
  const riskTarget = Math.max(0, (i.balance * i.riskPct) / 100);
  const perLot = riskPerLot(i.spec, i.entry, i.sl, i.commissionPerLot);
  const lot = perLot > 0 ? roundVolume(riskTarget / perLot, i.spec) : 0;
  const risk = lot * perLot;
  return {
    lot,
    riskTarget,
    risk,
    riskPct: i.balance > 0 ? (risk / i.balance) * 100 : 0,
    slPips: pipsBetween(i.entry, i.sl, i.spec),
    slPoints: i.spec.point > 0 ? Math.abs(i.entry - i.sl) / i.spec.point : 0,
  };
}

/** Partial take profit: close `pct` % of the initial volume at `r` R. */
export interface PartialLevel {
  r: number;
  pct: number;
}

export interface PartialTarget {
  price: number;
  pct: number;
  /** Volume closed at this level (rounded to the step; the rest stays). */
  volume: number;
}

/**
 * Prices and volumes of the partial levels. A level whose volume rounds
 * under the minimum is dropped; the percentages never add up past 100.
 */
export function partialTargets(
  side: Side,
  entry: number,
  sl: number,
  lot: number,
  levels: PartialLevel[],
  spec: SymbolSpec
): PartialTarget[] {
  const out: PartialTarget[] = [];
  let left = lot;
  let used = 0;
  for (const l of [...levels].sort((a, b) => a.r - b.r)) {
    const pct = Math.min(l.pct, 100 - used);
    if (pct <= 0 || l.r <= 0) {
      continue;
    }
    const volume = Math.min(roundVolume((lot * pct) / 100, spec), left);
    if (volume <= 0) {
      continue;
    }
    out.push({ price: tpForR(side, entry, sl, l.r, spec), pct, volume });
    left = Number((left - volume).toFixed(decimalsOf(spec.volumeStep || 0.01)));
    used += pct;
  }
  return out;
}

export interface OrderCheck {
  ok: boolean;
  errors: string[];
}

interface OrderDraft {
  side: Side;
  type: OrderType;
  entry: number;
  sl: number;
  tp: number;
  lot: number;
  quote: Quote;
  spec: SymbolSpec;
}

function lotErrors(o: OrderDraft) {
  if (o.lot <= 0) {
    return [
      `O lote fica abaixo do mínimo do ativo (${o.spec.volumeMin}). Aumente o risco ou aproxime o stop.`,
    ];
  }
  return o.lot > o.spec.volumeMax
    ? [`O lote passa do máximo do ativo (${o.spec.volumeMax}).`]
    : [];
}

function stopErrors(o: OrderDraft) {
  if (o.sl <= 0) {
    return ["Defina um stop loss."];
  }
  const buy = o.side === "buy";
  if (buy ? o.sl >= o.entry : o.sl <= o.entry) {
    return [
      buy
        ? "Numa compra o stop fica abaixo da entrada."
        : "Numa venda o stop fica acima da entrada.",
    ];
  }
  const minDist = o.spec.stopsLevel * o.spec.point;
  return Math.abs(o.entry - o.sl) + EPS < minDist
    ? [
        `O stop está mais perto do que o mínimo da corretora (${o.spec.stopsLevel} pontos).`,
      ]
    : [];
}

function targetErrors(o: OrderDraft) {
  const buy = o.side === "buy";
  if (o.tp > 0 && (buy ? o.tp <= o.entry : o.tp >= o.entry)) {
    return [
      buy
        ? "Numa compra o take profit fica acima da entrada."
        : "Numa venda o take profit fica abaixo da entrada.",
    ];
  }
  return [];
}

/** Buy limit / sell stop below the price; buy stop / sell limit above. */
function pendingErrors(o: OrderDraft) {
  if (o.type === "market") {
    return [];
  }
  const above = o.entry > marketPrice(o.side, o.quote);
  const wantsAbove = (o.side === "buy") === (o.type === "stop");
  if (above === wantsAbove) {
    return [];
  }
  const kind = o.type === "limit" ? "limit" : "stop";
  const sideText = o.side === "buy" ? "compra" : "venda";
  return [
    `Uma ordem ${kind} de ${sideText} fica ${wantsAbove ? "acima" : "abaixo"} do preço atual.`,
  ];
}

/** What the broker would reject (or what makes no sense) before sending. */
export function checkOrder(o: OrderDraft): OrderCheck {
  const errors = [
    ...lotErrors(o),
    ...stopErrors(o),
    ...targetErrors(o),
    ...pendingErrors(o),
  ];
  return { ok: errors.length === 0, errors };
}

const FUTURES: Record<string, string[]> = {
  "GC=F": ["XAUUSD", "GOLD"],
  "SI=F": ["XAGUSD", "SILVER"],
  "CL=F": ["XTIUSD", "USOIL", "WTI"],
  "BZ=F": ["XBRUSD", "UKOIL", "BRENT"],
  "^NDX": ["NAS100", "USTEC", "US100"],
  "^GSPC": ["US500", "SPX500"],
  "^DJI": ["US30", "DJ30"],
  "^GDAXI": ["DE40", "GER40", "DAX"],
};

/**
 * The MT5 name of a chart symbol (Yahoo style: EURUSD=X, GC=F, BTC-USD),
 * among the terminal's symbols, accepting broker suffixes (EURUSD.a).
 */
export function mt5Symbol(chart: string, symbols: string[]) {
  const up = chart.toUpperCase();
  const names = FUTURES[up] ?? [up.replace("=X", "").replace("-", "")];
  for (const name of names) {
    const exact = symbols.find((s) => s.toUpperCase() === name);
    if (exact) {
      return exact;
    }
    const suffixed = symbols.find((s) => s.toUpperCase().startsWith(name));
    if (suffixed) {
      return suffixed;
    }
  }
  return null;
}
