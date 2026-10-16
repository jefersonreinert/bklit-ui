import { ConvexError, type Infer, v } from "convex/values";
import { marketPrice, riskPerLot, type SymbolSpec } from "../lib/journal/lot";
import {
  COMMAND_TTL,
  type Command,
  MAX_WATCH,
  nextInterval,
  orderComment,
  type SyncPayload,
} from "../lib/journal/sync";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { saveGuardian } from "./guardian";
import {
  eaSessionFields,
  guardianEventFields,
  guardianStatusFields,
  symbolSpecFields,
} from "./schema";

/**
 * Trading from the panel through the TradingJournal Complete EA (v4.10):
 * the EA syncs its terminal state every second while the trading screen is
 * open (POST /journal/mt5/sync in http.ts) and runs the commands queued
 * here. Orders can only be created by the unlocked panel; the webhook token
 * only lets the EA read its own queue and report results. The EA applies
 * its own limits again before executing anything.
 */

const side = v.union(v.literal("buy"), v.literal("sell"));
const MAX_COMMANDS = 10;
/** A command the EA took but never answered is reported as failed. */
const ANSWER_TTL = 60_000;
/** Risk check tolerance (the panel rounds with the price of the moment). */
const RISK_SLACK = 0.05;

async function sessionOf(ctx: QueryCtx, account: string) {
  return await ctx.db
    .query("eaSessions")
    .withIndex("by_account", (q) => q.eq("account", account))
    .unique();
}

async function specOf(ctx: QueryCtx, account: string, symbol: string) {
  return await ctx.db
    .query("eaSymbols")
    .withIndex("by_account_symbol", (q) =>
      q.eq("account", account).eq("symbol", symbol)
    )
    .unique();
}

const fail = (message: string) => {
  throw new ConvexError(message);
};

/** The session of an account that the EA reports as able to trade. */
async function tradableSession(ctx: MutationCtx, account: string) {
  const s = await sessionOf(ctx, account);
  if (!s) {
    return fail(
      "O EA desta conta ainda não sincronizou (versão 4.10 ou mais recente)."
    );
  }
  if (!s.limits.allowTrading) {
    return fail(
      "O EA não aceita ordens do painel. No MT5, ative InpAllowTrading nas entradas do EA."
    );
  }
  if (s.limits.demoOnly && !s.info.demo) {
    return fail("O EA está em modo só demo (InpDemoOnly) e esta conta é real.");
  }
  return s;
}

async function queue(
  ctx: MutationCtx,
  account: string,
  c: Omit<
    Doc<"eaCommands">,
    "_id" | "_creationTime" | "account" | "status" | "createdAt"
  >
): Promise<Id<"eaCommands">> {
  const active = [
    ...(await ctx.db
      .query("eaCommands")
      .withIndex("by_account_status", (q) =>
        q.eq("account", account).eq("status", "pending")
      )
      .take(MAX_COMMANDS + 1)),
  ];
  if (active.length >= MAX_COMMANDS) {
    return fail(
      "Há demasiadas ordens à espera do EA. Aguarde alguns segundos."
    );
  }
  return await ctx.db.insert("eaCommands", {
    ...c,
    comment: orderComment(c.comment),
    account,
    status: "pending",
    createdAt: Date.now(),
  });
}

/* --------------------------------- panel --------------------------------- */

// Open by choice of the owner: no access code for Gráficos → Operar. The EA
// inputs (allow trading, demo only, max lot and risk, SL) still apply.

/** Live state of an account (or the most recently synced one). */
export const session = query({
  args: { account: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const rows = a.account
      ? [await sessionOf(ctx, a.account)].filter((r) => r !== null)
      : await ctx.db.query("eaSessions").collect();
    const row = rows.sort((x, y) => y.updatedAt - x.updatedAt)[0];
    if (!row) {
      return null;
    }
    return {
      account: row.account,
      server: row.server,
      updatedAt: row.updatedAt,
      watch: row.watch,
      symbols: row.symbols,
      info: row.info,
      limits: row.limits,
      positions: row.positions,
      orders: row.orders,
      quotes: row.quotes,
      plans: row.plans,
      accounts: rows.map((r) => r.account),
    };
  },
});

/** Specifications of the account's symbols (only the watched ones). */
export const specs = query({
  args: { account: v.string(), symbols: v.array(v.string()) },
  handler: async (ctx, a) => {
    const out: SymbolSpec[] = [];
    for (const symbol of a.symbols.slice(0, MAX_WATCH)) {
      const s = await specOf(ctx, a.account, symbol);
      if (s) {
        out.push({
          symbol: s.symbol,
          digits: s.digits,
          point: s.point,
          tickSize: s.tickSize,
          tickValue: s.tickValue,
          contractSize: s.contractSize,
          volumeMin: s.volumeMin,
          volumeMax: s.volumeMax,
          volumeStep: s.volumeStep,
          stopsLevel: s.stopsLevel,
        });
      }
    }
    return out;
  },
});

/** Recent commands of the account, newest first. */
export const commands = query({
  args: { account: v.string() },
  handler: async (ctx, a) => {
    const rows = await ctx.db
      .query("eaCommands")
      .withIndex("by_account_created", (q) => q.eq("account", a.account))
      .order("desc")
      .take(30);
    return rows.map((c) => ({
      id: c._id,
      kind: c.kind,
      symbol: c.symbol,
      side: c.side,
      volume: c.volume,
      ticket: c.ticket,
      status: c.status,
      createdAt: c.createdAt,
      result: c.result,
    }));
  },
});

/**
 * The trading screen is open: quote these symbols and poll every second.
 * Called when the symbol changes and as a heartbeat every 30 s.
 */
export const watch = mutation({
  args: { account: v.string(), symbols: v.array(v.string()) },
  handler: async (ctx, a) => {
    const s = await sessionOf(ctx, a.account);
    if (!s) {
      return;
    }
    const symbols = [
      ...new Set(a.symbols.map((x) => x.trim()).filter(Boolean)),
    ].slice(0, MAX_WATCH);
    await ctx.db.patch(s._id, { watch: symbols, panelSeenAt: Date.now() });
  },
});

interface OrderArgs {
  account: string;
  symbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop";
  volume: number;
  price?: number;
  sl: number;
  partials?: { price: number; volume: number }[];
}

/** The EA's limits on the order itself (lot, stop, price, partials). */
function orderError(s: Doc<"eaSessions">, a: OrderArgs) {
  if (!(a.volume > 0)) {
    return "Lote inválido.";
  }
  if (s.limits.maxLot > 0 && a.volume > s.limits.maxLot + 1e-9) {
    return `O lote passa do máximo do EA (${s.limits.maxLot}).`;
  }
  if (s.limits.requireSl && !(a.sl > 0)) {
    return "O EA exige stop loss em todas as ordens.";
  }
  if (a.orderType !== "market" && !(a.price && a.price > 0)) {
    return "Defina o preço da ordem pendente.";
  }
  const partialVolume = (a.partials ?? []).reduce((x, p) => x + p.volume, 0);
  return partialVolume > a.volume + 1e-9
    ? "Os parciais somam mais do que o lote."
    : null;
}

/** The same risk check the EA does, with the latest quote. */
async function riskError(ctx: QueryCtx, s: Doc<"eaSessions">, a: OrderArgs) {
  const spec = await specOf(ctx, a.account, a.symbol);
  const quote = s.quotes.find((q) => q.symbol === a.symbol);
  if (!(spec && quote && a.sl > 0 && s.limits.maxRiskPct > 0)) {
    return null;
  }
  const entry =
    a.orderType === "market" ? marketPrice(a.side, quote) : (a.price ?? 0);
  const lossPerLot = riskPerLot(
    { ...spec, tickValue: quote.tickValue || spec.tickValue },
    entry,
    a.sl
  );
  const balance = s.info.balance;
  const riskPct = balance > 0 ? ((lossPerLot * a.volume) / balance) * 100 : 0;
  return riskPct > s.limits.maxRiskPct + RISK_SLACK
    ? `Esta ordem arrisca ${riskPct.toFixed(2)} % do saldo; o EA permite no máximo ${s.limits.maxRiskPct} %.`
    : null;
}

/** New order: market or pending, with SL/TP, partials and breakeven. */
export const sendOrder = mutation({
  args: {
    account: v.string(),
    symbol: v.string(),
    side,
    orderType: v.union(
      v.literal("market"),
      v.literal("limit"),
      v.literal("stop")
    ),
    volume: v.number(),
    price: v.optional(v.number()),
    sl: v.number(),
    tp: v.number(),
    partials: v.optional(
      v.array(v.object({ price: v.number(), volume: v.number() }))
    ),
    breakeven: v.optional(v.boolean()),
    comment: v.optional(v.string()),
    riskPct: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const s = await tradableSession(ctx, a.account);
    const partials = (a.partials ?? []).filter((p) => p.volume > 0);
    const problem =
      orderError(s, { ...a, partials }) ?? (await riskError(ctx, s, a));
    if (problem) {
      return fail(problem);
    }
    return await queue(ctx, a.account, {
      kind: "open",
      symbol: a.symbol,
      side: a.side,
      orderType: a.orderType,
      volume: a.volume,
      price: a.orderType === "market" ? 0 : a.price,
      sl: a.sl,
      tp: a.tp,
      partials,
      breakeven: a.breakeven ?? false,
      comment: a.comment,
      riskPct: a.riskPct,
    });
  },
});

/** Close a position (all of it, or `volume` lots: a manual partial). */
export const closePosition = mutation({
  args: {
    account: v.string(),
    ticket: v.string(),
    volume: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const s = await tradableSession(ctx, a.account);
    const pos = s.positions.find((p) => p.ticket === a.ticket);
    if (!pos) {
      return fail("Posição não encontrada (pode já estar fechada).");
    }
    return await queue(ctx, a.account, {
      kind: "close",
      ticket: a.ticket,
      symbol: pos.symbol,
      volume: a.volume && a.volume < pos.volume ? a.volume : 0,
    });
  },
});

/** Move the SL/TP of a position or pending order (0 removes it). */
export const modify = mutation({
  args: {
    account: v.string(),
    ticket: v.string(),
    sl: v.number(),
    tp: v.number(),
  },
  handler: async (ctx, a) => {
    const s = await tradableSession(ctx, a.account);
    const target =
      s.positions.find((p) => p.ticket === a.ticket) ??
      s.orders.find((o) => o.ticket === a.ticket);
    if (!target) {
      return fail("Posição ou ordem não encontrada.");
    }
    if (s.limits.requireSl && !(a.sl > 0)) {
      return fail("O EA exige stop loss: não é possível removê-lo.");
    }
    return await queue(ctx, a.account, {
      kind: "modify",
      ticket: a.ticket,
      symbol: target.symbol,
      sl: a.sl,
      tp: a.tp,
    });
  },
});

/** Delete a pending order. */
export const cancelOrder = mutation({
  args: { account: v.string(), ticket: v.string() },
  handler: async (ctx, a) => {
    const s = await tradableSession(ctx, a.account);
    const order = s.orders.find((o) => o.ticket === a.ticket);
    if (!order) {
      return fail("Ordem pendente não encontrada.");
    }
    return await queue(ctx, a.account, {
      kind: "cancel",
      ticket: a.ticket,
      symbol: order.symbol,
    });
  },
});

/** Withdraw a command the EA has not picked up yet. */
export const cancelCommand = mutation({
  args: { id: v.id("eaCommands") },
  handler: async (ctx, a) => {
    const c = await ctx.db.get(a.id);
    if (c?.status === "pending") {
      await ctx.db.patch(a.id, { status: "cancelled", doneAt: Date.now() });
    }
  },
});

/* --------------------------------- webhook ------------------------------- */

const syncValue = v.object({
  ...eaSessionFields,
  specs: v.array(
    v.object(
      Object.fromEntries(
        Object.entries(symbolSpecFields).filter(
          ([k]) => k !== "account" && k !== "updatedAt"
        )
      ) as Omit<typeof symbolSpecFields, "account" | "updatedAt">
    )
  ),
  results: v.array(
    v.object({
      id: v.string(),
      ok: v.boolean(),
      retcode: v.number(),
      message: v.string(),
      ticket: v.string(),
      price: v.number(),
      volume: v.number(),
    })
  ),
  hasSymbols: v.boolean(),
  /** FTMO Risk Guardian (EA v4.20 only). */
  guardian: v.optional(
    v.object({
      status: v.object(guardianStatusFields),
      events: v.array(v.object(guardianEventFields)),
    })
  ),
});

/** Payload of the sync mutation, built in http.ts from syncFromBody. */
export function syncArgs(p: SyncPayload, now: number): SyncArgs {
  return {
    account: p.account,
    server: p.server,
    updatedAt: now,
    watch: [],
    symbols: p.symbols ?? [],
    hasSymbols: p.symbols !== null,
    info: p.info,
    limits: p.limits,
    positions: p.positions,
    orders: p.orders,
    quotes: p.quotes,
    plans: p.plans,
    specs: p.specs,
    results: p.results,
    ...(p.guardian ? { guardian: p.guardian } : {}),
  };
}

type SyncArgs = Infer<typeof syncValue>;

/** Results of executed commands: done or error, with the MT5 answer. */
async function applyResults(
  ctx: MutationCtx,
  account: string,
  results: SyncArgs["results"],
  now: number
) {
  for (const r of results) {
    const id = ctx.db.normalizeId("eaCommands", r.id);
    const c = id ? await ctx.db.get(id) : null;
    if (c && c.account === account && c.status !== "done") {
      await ctx.db.patch(c._id, {
        status: r.ok ? "done" : "error",
        doneAt: now,
        result: {
          ok: r.ok,
          retcode: r.retcode,
          message: r.message,
          ticket: r.ticket,
          price: r.price,
          volume: r.volume,
        },
      });
    }
  }
}

async function upsertSpecs(
  ctx: MutationCtx,
  account: string,
  specList: SyncArgs["specs"],
  now: number
) {
  for (const sp of specList) {
    const existing = await specOf(ctx, account, sp.symbol);
    const row = { ...sp, account, updatedAt: now };
    if (existing) {
      await ctx.db.replace(existing._id, row);
    } else {
      await ctx.db.insert("eaSymbols", row);
    }
  }
}

/** Stores the terminal state; keeps what the panel set (watch, heartbeat). */
async function upsertSession(ctx: MutationCtx, a: SyncArgs) {
  const existing = await sessionOf(ctx, a.account);
  const row: Omit<Doc<"eaSessions">, "_id" | "_creationTime"> = {
    account: a.account,
    server: a.server,
    updatedAt: a.updatedAt,
    info: a.info,
    limits: a.limits,
    positions: a.positions,
    orders: a.orders,
    quotes: a.quotes,
    plans: a.plans,
    watch: existing?.watch ?? [],
    panelSeenAt: existing?.panelSeenAt,
    symbols: a.hasSymbols ? a.symbols : (existing?.symbols ?? []),
  };
  if (existing) {
    await ctx.db.replace(existing._id, row);
  } else {
    await ctx.db.insert("eaSessions", row);
  }
  return row;
}

const commandOf = (c: Doc<"eaCommands">): Command => ({
  id: c._id,
  kind: c.kind,
  symbol: c.symbol,
  side: c.side,
  orderType: c.orderType,
  volume: c.volume,
  price: c.price,
  sl: c.sl,
  tp: c.tp,
  ticket: c.ticket,
  partials: c.partials,
  breakeven: c.breakeven,
  comment: c.comment,
  createdAt: c.createdAt,
});

/** Pending commands for the EA, each handed over once; late ones expire. */
async function takePending(ctx: MutationCtx, account: string, now: number) {
  const pending = await ctx.db
    .query("eaCommands")
    .withIndex("by_account_status", (q) =>
      q.eq("account", account).eq("status", "pending")
    )
    .take(MAX_COMMANDS);
  const out: Command[] = [];
  for (const c of pending) {
    if (now - c.createdAt > COMMAND_TTL) {
      await ctx.db.patch(c._id, { status: "expired", doneAt: now });
    } else {
      await ctx.db.patch(c._id, { status: "sent", sentAt: now });
      out.push(commandOf(c));
    }
  }
  return out;
}

const NO_ANSWER = {
  ok: false,
  retcode: 0,
  message: "O EA não respondeu. Confira no MT5 se a ordem foi executada.",
  ticket: "",
  price: 0,
  volume: 0,
};

/** Commands the EA holds; the ones never answered become errors. */
async function countInFlight(ctx: MutationCtx, account: string, now: number) {
  const sent = await ctx.db
    .query("eaCommands")
    .withIndex("by_account_status", (q) =>
      q.eq("account", account).eq("status", "sent")
    )
    .take(MAX_COMMANDS);
  let inFlight = 0;
  for (const c of sent) {
    if (now - (c.sentAt ?? c.createdAt) > ANSWER_TTL) {
      await ctx.db.patch(c._id, {
        status: "error",
        doneAt: now,
        result: NO_ANSWER,
      });
    } else {
      inFlight += 1;
    }
  }
  return inFlight;
}

/**
 * One EA sync: stores the terminal state, the results and the specs, and
 * hands over the pending commands (each one only once; late ones expire).
 */
export const sync = internalMutation({
  args: syncValue,
  handler: async (ctx, a) => {
    const now = Date.now();
    await applyResults(ctx, a.account, a.results, now);
    await upsertSpecs(ctx, a.account, a.specs, now);
    const row = await upsertSession(ctx, a);
    if (a.guardian) {
      await saveGuardian(ctx, a.account, a.guardian, now);
    }
    const commands = await takePending(ctx, a.account, now);
    const inFlight = await countInFlight(ctx, a.account, now);
    return {
      nextMs: nextInterval(now, row.panelSeenAt, inFlight),
      watch: row.watch,
      commands,
      now,
    };
  },
});
