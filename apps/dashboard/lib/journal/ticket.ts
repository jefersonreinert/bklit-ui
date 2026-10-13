import {
  checkOrder,
  type LotResult,
  lotForRisk,
  marketPrice,
  type OrderType,
  offsetPrice,
  type PartialLevel,
  type PartialTarget,
  partialTargets,
  type Quote,
  riskPerLot,
  type Side,
  type SymbolSpec,
  tpForR,
} from "./lot";

/**
 * The order ticket of the trading screen, as one pure computation: from the
 * choices (side, type, risk %, stop and target modes, partials) and the
 * terminal data (spec, live quote, balance, EA limits) to the lot, prices,
 * partials, margin and every reason not to send.
 */

export interface TicketPrefs {
  riskPct: number;
  slMode: "pips" | "price";
  slPips: number;
  tpMode: "rr" | "price" | "none";
  rr: number;
  commission: number;
  partialsOn: boolean;
  levels: PartialLevel[];
  breakeven: boolean;
}

export interface TicketInput {
  prefs: TicketPrefs;
  side: Side;
  type: OrderType;
  /** Price of a pending order. */
  pendingPrice: number;
  slPrice: number;
  tpPrice: number;
  spec: SymbolSpec;
  quote: Quote & {
    tickValue: number;
    marginBuy: number;
    marginSell: number;
  };
  balance: number;
  limits: { maxLot: number; maxRiskPct: number };
}

export interface Ticket {
  /** The spec with the live tick value (it follows the price on crosses). */
  live: SymbolSpec;
  entry: number;
  sl: number;
  tp: number;
  lot: LotResult;
  targets: PartialTarget[];
  errors: string[];
  margin: number;
  /** Money at the take profit (0 without one). */
  reward: number;
}

function stopFor(i: TicketInput, entry: number, live: SymbolSpec) {
  return i.prefs.slMode === "pips"
    ? offsetPrice(i.side, entry, i.prefs.slPips, live, "sl")
    : i.slPrice;
}

function targetFor(
  i: TicketInput,
  entry: number,
  sl: number,
  live: SymbolSpec
) {
  if (i.prefs.tpMode === "rr") {
    return sl > 0 ? tpForR(i.side, entry, sl, i.prefs.rr, live) : 0;
  }
  return i.prefs.tpMode === "price" ? i.tpPrice : 0;
}

/** The EA's own limits, checked before the server and the EA do it. */
function limitErrors(i: TicketInput, lot: number) {
  const errors: string[] = [];
  const { maxRiskPct, maxLot } = i.limits;
  if (maxRiskPct > 0 && i.prefs.riskPct > maxRiskPct) {
    errors.push(`O EA permite no máximo ${maxRiskPct} % de risco.`);
  }
  if (maxLot > 0 && lot > maxLot) {
    errors.push(`O lote passa do máximo do EA (${maxLot}).`);
  }
  return errors;
}

/** Null until there is a quote (and a price for a pending order). */
export function computeTicket(i: TicketInput): Ticket | null {
  if (!(i.quote.bid > 0)) {
    return null;
  }
  const live = { ...i.spec, tickValue: i.quote.tickValue || i.spec.tickValue };
  const entry =
    i.type === "market" ? marketPrice(i.side, i.quote) : i.pendingPrice;
  if (!(entry > 0)) {
    return null;
  }
  const sl = stopFor(i, entry, live);
  const tp = targetFor(i, entry, sl, live);
  const lot = lotForRisk({
    balance: i.balance,
    riskPct: i.prefs.riskPct,
    entry,
    sl,
    spec: live,
    commissionPerLot: i.prefs.commission,
  });
  const targets =
    i.prefs.partialsOn && sl > 0
      ? partialTargets(i.side, entry, sl, lot.lot, i.prefs.levels, live)
      : [];
  const check = checkOrder({
    side: i.side,
    type: i.type,
    entry,
    sl,
    tp,
    lot: lot.lot,
    quote: i.quote,
    spec: live,
  });
  const perLotMargin =
    i.side === "buy" ? i.quote.marginBuy : i.quote.marginSell;
  return {
    live,
    entry,
    sl,
    tp,
    lot,
    targets,
    errors: [...check.errors, ...limitErrors(i, lot.lot)],
    margin: lot.lot * perLotMargin,
    reward: tp > 0 ? riskPerLot(live, entry, tp) * lot.lot : 0,
  };
}
