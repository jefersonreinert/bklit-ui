/**
 * FTMO Risk Guardian (EA TradingJournal FTMO Risk Guardian v4.20).
 *
 * The EA adds an optional `guardian` object to POST /journal/mt5/sync with
 * the protection state (daily and maximum loss against the FTMO limits) and
 * the events not yet delivered (blocks, refused orders, confirmed closes).
 * EAs without it (v4.10) keep working: the field is simply absent.
 */

export const GUARDIAN_STATES = [
  "NORMAL",
  "ALERTA",
  "BLOQUEADO",
  "EMERGENCIA",
] as const;

export interface GuardianEvent {
  /** Unique per EA (UTC seconds, sequence and microseconds). */
  eid: string;
  /** UTC (ms). */
  time: number;
  kind: string;
  state: number;
  reason: string;
  symbol: string;
  ticket: string;
  request: string;
  result: string;
  dailyUsePct: number;
  maxUsePct: number;
  estEquity: number;
}

export interface GuardianStatus {
  enabled: boolean;
  version: string;
  mode: "protect" | "monitor";
  product: string;
  /** 0 normal, 1 alerta, 2 bloqueado, 3 emergência. */
  state: number;
  reason: string;
  initialCapital: number;
  dailyPct: number;
  maxPct: number;
  maxKind: "static" | "eod" | "intraday";
  balance: number;
  equity: number;
  /** Equity minus the exit costs not booked yet (commission, slippage). */
  estEquity: number;
  exitCost: number;
  /** Balance at 00:00 Prague (the FTMO daily reference). */
  dayStartBalance: number;
  dailyLoss: number;
  dailyLimit: number;
  dailyUsePct: number;
  /** Loss of the next day if the 00:00 reset happened now. */
  nextDayLoss: number;
  nextDayUsePct: number;
  preReset: boolean;
  /** Next 00:00 Prague, UTC (ms). */
  nextResetAt: number;
  maxRef: number;
  maxLoss: number;
  maxLimit: number;
  maxUsePct: number;
  worstDailyUsePct: number;
  worstMaxUsePct: number;
  warnPct: number;
  blockPct: number;
  emergencyPct: number;
  dayLocked: number;
  dayReason: string;
  permLocked: number;
  permReason: string;
  permSince: number;
  configProblem: string;
  manualLock: boolean;
  scope: "account" | "managed";
  closeOnEmergency: boolean;
  cancelPendingOnBlock: boolean;
  worstCaseCheck: boolean;
  requestsToday: number;
  maxRequests: number;
  positions: number;
  /** FTMO day (00:00–24:00 Prague), YYYY-MM-DD; "" if unknown. */
  pragueDay: string;
}

export interface GuardianPayload {
  status: GuardianStatus;
  events: GuardianEvent[];
}

const MAX_EVENTS = 50;

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

const str = (v: unknown, max = 300) =>
  typeof v === "string" || typeof v === "number"
    ? String(v).trim().slice(0, max)
    : "";

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const bool = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

const level = (v: unknown) => Math.min(3, Math.max(0, Math.round(num(v))));

/** 20261016 → "2026-10-16". */
export function pragueDayOf(key: unknown): string {
  const k = Math.round(num(key));
  if (k < 19_700_101 || k > 99_991_231) {
    return "";
  }
  const s = String(k);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** The `guardian` object of a sync body; null when the EA does not send it. */
export function guardianFromBody(value: unknown): GuardianPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const g = obj(value);
  const kind = str(g.max_kind);
  const status: GuardianStatus = {
    enabled: bool(g.enabled),
    version: str(g.version, 20),
    mode: str(g.mode) === "monitor" ? "monitor" : "protect",
    product: str(g.product, 120),
    state: level(g.state),
    reason: str(g.reason, 400),
    initialCapital: num(g.initial_capital),
    dailyPct: num(g.daily_pct),
    maxPct: num(g.max_pct),
    maxKind: kind === "eod" || kind === "intraday" ? kind : "static",
    balance: num(g.balance),
    equity: num(g.equity),
    estEquity: num(g.est_equity),
    exitCost: num(g.exit_cost),
    dayStartBalance: num(g.day_start_balance),
    dailyLoss: num(g.daily_loss),
    dailyLimit: num(g.daily_limit),
    dailyUsePct: num(g.daily_use_pct),
    nextDayLoss: num(g.next_day_loss),
    nextDayUsePct: num(g.next_day_use_pct),
    preReset: bool(g.pre_reset),
    nextResetAt: num(g.next_reset_ms),
    maxRef: num(g.max_ref),
    maxLoss: num(g.max_loss),
    maxLimit: num(g.max_limit),
    maxUsePct: num(g.max_use_pct),
    worstDailyUsePct: num(g.worst_daily_use_pct),
    worstMaxUsePct: num(g.worst_max_use_pct),
    warnPct: num(g.warn_pct),
    blockPct: num(g.block_pct),
    emergencyPct: num(g.emergency_pct),
    dayLocked: level(g.day_locked),
    dayReason: str(g.day_reason, 400),
    permLocked: level(g.perm_locked),
    permReason: str(g.perm_reason, 400),
    permSince: num(g.perm_since_ms),
    configProblem: str(g.config_problem, 300),
    manualLock: bool(g.manual_lock),
    scope: str(g.scope) === "managed" ? "managed" : "account",
    closeOnEmergency: bool(g.close_on_emergency),
    cancelPendingOnBlock: bool(g.cancel_pending_on_block),
    worstCaseCheck: bool(g.worst_case_check),
    requestsToday: num(g.requests_today),
    maxRequests: num(g.max_requests),
    positions: num(g.positions),
    pragueDay: pragueDayOf(g.prague_day),
  };
  const events = (Array.isArray(g.events) ? g.events : [])
    .slice(0, MAX_EVENTS)
    .map(obj)
    .map((e) => ({
      eid: str(e.id, 64),
      time: num(e.time_ms),
      kind: str(e.kind, 40),
      state: level(e.state),
      reason: str(e.reason, 300),
      symbol: str(e.symbol, 40),
      ticket: str(e.ticket, 30),
      request: str(e.request, 120),
      result: str(e.result, 120),
      dailyUsePct: num(e.daily_use_pct),
      maxUsePct: num(e.max_use_pct),
      estEquity: num(e.est_equity),
    }))
    .filter((e) => e.eid && e.kind);
  return { status, events };
}

/** Event kinds counted in the daily history. */
export const COUNTED = {
  emergencies: "ESTADO_EMERGENCIA",
  blocks: "ESTADO_BLOQUEADO",
  refused: "ENTRADA_RECUSADA",
  closed: "POSICAO_ENCERRADA",
} as const;
