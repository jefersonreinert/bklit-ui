import { type AccountStats, STAT_KEYS } from "./account";
import type { Deal, DealEntry, DealExtras, Outcome, Side } from "./metrics";

/**
 * Validates what the webhooks receive: MT5 deals from the CasaBrasaJournal
 * Expert Advisor and TradingView alert messages (JSON or plain text).
 */

export const MAX_BODY = 256_000;
export const MAX_DEALS = 500;
const MAX_TEXT = 200;
const MAX_MESSAGE = 4000;

const str = (v: unknown, max = MAX_TEXT) =>
  typeof v === "string" || typeof v === "number"
    ? String(v).trim().slice(0, max)
    : "";

const num = (v: unknown) => {
  const n =
    typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const SIDES: Record<string, Side> = {
  buy: "buy",
  sell: "sell",
  deal_type_buy: "buy",
  deal_type_sell: "sell",
  "0": "buy",
  "1": "sell",
};

const ENTRIES: Record<string, DealEntry> = {
  in: "in",
  out: "out",
  inout: "inout",
  out_by: "out_by",
  deal_entry_in: "in",
  deal_entry_out: "out",
  deal_entry_inout: "inout",
  deal_entry_out_by: "out_by",
  "0": "in",
  "1": "out",
  "2": "inout",
  "3": "out_by",
};

const DIGITS = /^\d+$/;
const DOTS = /\./g;

/** Unix seconds or ms, or an ISO/"YYYY.MM.DD HH:MM" date → ms. */
export function parseTime(v: unknown, fallback = Date.now()): number {
  if (typeof v === "number" || (typeof v === "string" && DIGITS.test(v))) {
    const n = Number(v);
    return n < 1e12 ? n * 1000 : n;
  }
  if (typeof v === "string" && v.trim()) {
    const t = Date.parse(v.trim().replace(DOTS, "-").replace(" ", "T"));
    if (Number.isFinite(t)) {
      return t;
    }
  }
  return fallback;
}

/** A finite number, or undefined when the field is absent or not a number. */
const optNum = (v: unknown) => {
  if (v === undefined || v === null || v === "") {
    return;
  }
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

const OUTCOMES = new Set<Outcome>(["win", "loss", "breakeven"]);

/** The TradingJournal Complete EA's extra fields (closing deal only). */
function extrasOf(r: Record<string, unknown>): DealExtras {
  const outcome = str(r.outcome).toLowerCase() as Outcome;
  const out: DealExtras = {
    rr: optNum(r.rr),
    riskPct: optNum(r.risk_pct),
    riskUsd: optNum(r.risk_usd),
    profitPoints: optNum(r.profit_points),
    durationSec: optNum(r.duration_sec),
    outcome: OUTCOMES.has(outcome) ? outcome : undefined,
    equityAt: optNum(r.equity),
    balanceAt: optNum(r.balance),
    accountType: str(r.account_type, 40) || undefined,
    market: str(r.market, 40) || undefined,
  };
  // Absent fields stay absent, so a re-send never erases stored ones
  for (const k of Object.keys(out) as (keyof DealExtras)[]) {
    if (out[k] === undefined) {
      delete out[k];
    }
  }
  return out;
}

/**
 * One deal, or null when it is not a trade (balance, credit, etc.) or is
 * missing the essentials.
 */
export function normalizeDeal(raw: unknown): Deal | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const side = SIDES[str(r.type ?? r.side).toLowerCase()];
  const entry = ENTRIES[str(r.entry).toLowerCase()];
  const ticket = str(r.ticket ?? r.deal);
  const symbol = str(r.symbol);
  if (!(side && entry && ticket && symbol)) {
    return null;
  }
  return {
    account: str(r.account) || "mt5",
    ticket,
    position: str(r.position ?? r.position_id) || ticket,
    symbol,
    side,
    entry,
    volume: Math.abs(num(r.volume)),
    price: num(r.price),
    sl: num(r.sl),
    tp: num(r.tp),
    profit: num(r.profit),
    commission: num(r.commission),
    swap: num(r.swap),
    fee: num(r.fee),
    magic: Math.trunc(num(r.magic)),
    comment: str(r.comment),
    time: parseTime(r.time_msc ?? r.time),
    ...extrasOf(r),
  };
}

/** Body of POST /journal/mt5: one deal, {deals:[…]} or an array. */
export function dealsFromBody(body: unknown): Deal[] {
  const list = Array.isArray(body)
    ? body
    : ((body as { deals?: unknown[] } | null)?.deals ?? [body]);
  return list
    .slice(0, MAX_DEALS)
    .map(normalizeDeal)
    .filter((d): d is Deal => d !== null);
}

export interface StatsPayload {
  account: string;
  server: string;
  name: string;
  holder: string;
  currency: string;
  accountType: string;
  /** Broker server time of the snapshot (ms). */
  serverTime: number;
  stats: AccountStats;
}

/**
 * Body of POST /journal/mt5/stats: only the known fields, numbers made
 * finite (else 0), strings cut. Null without an account.
 */
export function statsFromBody(
  body: unknown,
  now = Date.now()
): StatsPayload | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const b = body as Record<string, unknown>;
  const account = str(b.account, 40);
  if (!account) {
    return null;
  }
  const raw =
    b.stats && typeof b.stats === "object"
      ? (b.stats as Record<string, unknown>)
      : {};
  const stats = Object.fromEntries(
    STAT_KEYS.map((k) => [k, num(raw[k])])
  ) as AccountStats;
  return {
    account,
    server: str(b.server, 80),
    name: str(b.name, 80),
    holder: str(b.holder, 80),
    currency: str(b.currency, 10),
    accountType: str(b.account_type, 40),
    serverTime: b.time === undefined ? now : parseTime(b.time, now),
    stats,
  };
}

export interface Signal {
  ticker: string;
  action: string;
  price: number | null;
  qty: number | null;
  position: string;
  interval: string;
  strategy: string;
  message: string;
  /** When TradingView says it fired (ms). */
  time: number;
}

const ACTION = /\b(buy|sell|long|short|close|exit|tp|sl)\b/i;
const TICKERS = /\b[A-Z][A-Z0-9.!:_-]{2,20}\b/g;
const ACTION_WORD = /^(BUY|SELL|LONG|SHORT|CLOSE|EXIT|TP|SL)$/;
const PRICE = /(?:@|price[:=]?)\s*(\d+(?:[.,]\d+)?)/i;

/**
 * A TradingView alert: our JSON template ({{ticker}}, {{strategy.order.*}})
 * or any text such as "BUY EURUSD @ 1.0850".
 */
export function parseSignal(text: string, now = Date.now()): Signal {
  const raw = text.slice(0, MAX_MESSAGE);
  let j: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      j = parsed as Record<string, unknown>;
    }
  } catch {
    j = null;
  }
  if (j) {
    const price = num(j.price ?? j.close);
    const qty = num(j.contracts ?? j.qty ?? j.quantity);
    return {
      ticker: str(j.ticker ?? j.symbol),
      action: str(j.action ?? j.side ?? j.order).toLowerCase(),
      price: price || null,
      qty: qty || null,
      position: str(j.position ?? j.market_position).toLowerCase(),
      interval: str(j.interval),
      strategy: str(j.strategy),
      message: str(j.message ?? j.comment, MAX_MESSAGE),
      time: parseTime(j.time ?? j.timenow, now),
    };
  }
  const price = PRICE.exec(raw)?.[1];
  return {
    ticker:
      [...raw.matchAll(TICKERS)]
        .map((m) => m[0])
        .find((w) => !ACTION_WORD.test(w)) ?? "",
    action: (ACTION.exec(raw)?.[1] ?? "").toLowerCase(),
    price: price ? num(price) : null,
    qty: null,
    position: "",
    interval: "",
    strategy: "",
    message: raw,
    time: now,
  };
}

/** Template to paste in TradingView's alert "Message" box. */
export const TV_ALERT_TEMPLATE = `{
  "ticker": "{{ticker}}",
  "exchange": "{{exchange}}",
  "action": "{{strategy.order.action}}",
  "contracts": "{{strategy.order.contracts}}",
  "price": "{{close}}",
  "position": "{{strategy.market_position}}",
  "interval": "{{interval}}",
  "strategy": "Minha estratégia",
  "message": "{{strategy.order.comment}}",
  "time": "{{timenow}}"
}`;

/** Constant-time compare for the webhook token. */
export function sameToken(a: string, b: string) {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff += a.charCodeAt(i) === b.charCodeAt(i) ? 0 : 1;
  }
  return diff === 0;
}
