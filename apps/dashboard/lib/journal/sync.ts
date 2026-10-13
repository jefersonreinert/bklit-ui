/**
 * Trading from the panel through the TradingJournal Complete EA (v4.10).
 *
 * The EA cannot receive connections, so it polls: POST /journal/mt5/sync
 * sends the terminal state (account, positions, pending orders, quotes,
 * symbol specs, partial plans, results of executed commands) and the
 * answer carries the symbols to quote and the commands to execute.
 *
 * The answer is plain text, one item per line, easy to read in MQL5:
 *
 *   next_ms=1000
 *   watch=EURUSD,XAUUSD
 *   cmd=<id>\t<kind>\t<symbol>\t<side>\t<type>\t<volume>\t<price>\t<sl>\t<tp>\t<ticket>\t<age_ms>\t<partials>\t<be>\t<comment>
 *
 * `partials` is "price@volume,price@volume"; `age_ms` lets the EA drop a
 * command that arrived late without trusting either clock.
 */

import type { SymbolSpec } from "./lot";

export const MAX_WATCH = 20;
const MAX_ITEMS = 200;
const MAX_TEXT = 60;

const str = (v: unknown, max = MAX_TEXT) =>
  typeof v === "string" || typeof v === "number"
    ? String(v).trim().slice(0, max)
    : "";

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const bool = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v
        .slice(0, MAX_ITEMS)
        .filter(
          (x): x is Record<string, unknown> => !!x && typeof x === "object"
        )
    : [];

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

export interface AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  currency: string;
  /** The terminal's "Algo Trading" and the account allow trading. */
  tradeAllowed: boolean;
  demo: boolean;
}

/** The EA's own safety switches (inputs). */
export interface TradeLimits {
  allowTrading: boolean;
  maxLot: number;
  maxRiskPct: number;
  demoOnly: boolean;
  requireSl: boolean;
}

export interface Position {
  ticket: string;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  priceOpen: number;
  priceCurrent: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  /** Broker server time (ms). */
  time: number;
  magic: number;
  comment: string;
}

export interface PendingOrder {
  ticket: string;
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "stop";
  volume: number;
  price: number;
  sl: number;
  tp: number;
  time: number;
}

export interface LiveQuote {
  symbol: string;
  bid: number;
  ask: number;
  /** Points. */
  spread: number;
  /** Live tick value (account currency, 1 lot, loss side). */
  tickValue: number;
  /** Margin for 1 lot (account currency). */
  marginBuy: number;
  marginSell: number;
  time: number;
}

export interface PartialPlan {
  ticket: string;
  breakeven: boolean;
  levels: { price: number; volume: number; done: boolean }[];
}

export interface CommandResult {
  id: string;
  ok: boolean;
  retcode: number;
  message: string;
  ticket: string;
  price: number;
  volume: number;
}

export interface SyncPayload {
  account: string;
  server: string;
  info: AccountInfo;
  limits: TradeLimits;
  positions: Position[];
  orders: PendingOrder[];
  quotes: LiveQuote[];
  specs: SymbolSpec[];
  /** Market Watch symbols (sent at start and every few minutes). */
  symbols: string[] | null;
  plans: PartialPlan[];
  results: CommandResult[];
}

const side = (v: unknown): "buy" | "sell" =>
  str(v).toLowerCase().startsWith("sell") ? "sell" : "buy";

/** Body of POST /journal/mt5/sync; null without an account. */
export function syncFromBody(body: unknown): SyncPayload | null {
  const b = obj(body);
  const account = str(b.account, 40);
  if (!account) {
    return null;
  }
  const info = obj(b.info);
  const limits = obj(b.limits);
  return {
    account,
    server: str(b.server, 80),
    info: {
      balance: num(info.balance),
      equity: num(info.equity),
      margin: num(info.margin),
      freeMargin: num(info.free_margin),
      leverage: num(info.leverage),
      currency: str(info.currency, 10),
      tradeAllowed: bool(info.trade_allowed),
      demo: bool(info.demo),
    },
    limits: {
      allowTrading: bool(limits.allow_trading),
      maxLot: num(limits.max_lot),
      maxRiskPct: num(limits.max_risk_pct),
      demoOnly: bool(limits.demo_only),
      requireSl: bool(limits.require_sl),
    },
    positions: list(b.positions).map((p) => ({
      ticket: str(p.ticket),
      symbol: str(p.symbol),
      side: side(p.type),
      volume: num(p.volume),
      priceOpen: num(p.price_open),
      priceCurrent: num(p.price_current),
      sl: num(p.sl),
      tp: num(p.tp),
      profit: num(p.profit),
      swap: num(p.swap),
      time: num(p.time_msc),
      magic: num(p.magic),
      comment: str(p.comment),
    })),
    orders: list(b.orders).map((o) => ({
      ticket: str(o.ticket),
      symbol: str(o.symbol),
      side: side(o.type),
      type: str(o.type).toLowerCase().includes("stop") ? "stop" : "limit",
      volume: num(o.volume),
      price: num(o.price),
      sl: num(o.sl),
      tp: num(o.tp),
      time: num(o.time_msc),
    })),
    quotes: list(b.quotes).map((q) => ({
      symbol: str(q.symbol),
      bid: num(q.bid),
      ask: num(q.ask),
      spread: num(q.spread),
      tickValue: num(q.tick_value),
      marginBuy: num(q.margin_buy),
      marginSell: num(q.margin_sell),
      time: num(q.time_msc),
    })),
    specs: list(b.specs)
      .map((s) => ({
        symbol: str(s.symbol),
        digits: num(s.digits),
        point: num(s.point),
        tickSize: num(s.tick_size),
        tickValue: num(s.tick_value),
        contractSize: num(s.contract_size),
        volumeMin: num(s.volume_min),
        volumeMax: num(s.volume_max),
        volumeStep: num(s.volume_step),
        stopsLevel: num(s.stops_level),
      }))
      .filter((s) => s.symbol),
    symbols: Array.isArray(b.symbols)
      ? b.symbols
          .slice(0, 2000)
          .map((s) => str(s, 40))
          .filter(Boolean)
      : null,
    plans: list(b.plans).map((p) => ({
      ticket: str(p.ticket),
      breakeven: bool(p.be),
      levels: list(p.levels).map((l) => ({
        price: num(l.price),
        volume: num(l.volume),
        done: bool(l.done),
      })),
    })),
    results: list(b.results)
      .map((r) => ({
        id: str(r.id, 64),
        ok: bool(r.ok),
        retcode: num(r.retcode),
        message: str(r.message, 200),
        ticket: str(r.ticket),
        price: num(r.price),
        volume: num(r.volume),
      }))
      .filter((r) => r.id),
  };
}

export type CommandKind = "open" | "close" | "modify" | "cancel";

export interface Command {
  id: string;
  kind: CommandKind;
  symbol?: string;
  side?: "buy" | "sell";
  orderType?: "market" | "limit" | "stop";
  volume?: number;
  price?: number;
  sl?: number;
  tp?: number;
  ticket?: string;
  partials?: { price: number; volume: number }[];
  breakeven?: boolean;
  comment?: string;
  createdAt: number;
}

const BREAKS = /[\t\r\n]/g;

/** Tabs and line breaks would break the line protocol. */
const clean = (s: string | undefined) => (s ?? "").replace(BREAKS, " ");

/** MT5 keeps 31 characters of an order comment. */
export const orderComment = (s: string | undefined) => clean(s).slice(0, 31);

/** One `cmd=` line of the sync answer. */
export function commandLine(c: Command, now: number) {
  const fields = [
    c.id,
    c.kind,
    c.symbol ?? "",
    c.side ?? "",
    c.orderType ?? "",
    String(c.volume ?? 0),
    String(c.price ?? 0),
    String(c.sl ?? 0),
    String(c.tp ?? 0),
    c.ticket ?? "",
    String(Math.max(0, now - c.createdAt)),
    (c.partials ?? []).map((p) => `${p.price}@${p.volume}`).join(","),
    c.breakeven ? "1" : "0",
    orderComment(c.comment),
  ];
  return `cmd=${fields.map(clean).join("\t")}`;
}

/** The whole sync answer. */
export function syncResponse(
  nextMs: number,
  watch: string[],
  commands: Command[],
  now: number
) {
  return [
    `next_ms=${Math.round(nextMs)}`,
    `watch=${watch.slice(0, MAX_WATCH).map(clean).join(",")}`,
    ...commands.map((c) => commandLine(c, now)),
    "",
  ].join("\n");
}

/** Fast polling while the panel is open or a command is in flight. */
export const FAST_MS = 1000;
export const IDLE_MS = 15_000;
/** The panel counts as open this long after its last heartbeat. */
export const PANEL_TTL = 90_000;
/** Commands older than this are expired, never executed. */
export const COMMAND_TTL = 10_000;

export function nextInterval(
  now: number,
  panelSeenAt: number | undefined,
  inFlight: number
) {
  return inFlight > 0 || (panelSeenAt ?? 0) > now - PANEL_TTL
    ? FAST_MS
    : IDLE_MS;
}
