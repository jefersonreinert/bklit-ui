import { ConvexError, v } from "convex/values";
import { DEFAULT_PAY, monthRange } from "../lib/hr/pay";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/**
 * HR settings, monthly hours and pay approval (panel only). The pay itself
 * is computed by lib/hr/pay.ts from the POS time clock (staffPunches), the
 * same code on every screen; here are the inputs and the approvals.
 */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const KEY = "main";

export const DEFAULT_SETTINGS = {
  employerName: "Tolok (Malta) Limited",
  regNo: "C 72800",
  employerAddress: "74, The Brew, The Strand, Sliema, Malta",
  signatory: "",
  signatoryTitle: "",
  ...DEFAULT_PAY,
  probationMonths: 6,
};

export async function hrSettings(ctx: QueryCtx) {
  const row = await ctx.db
    .query("hrSettings")
    .withIndex("by_key", (q) => q.eq("key", KEY))
    .unique();
  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }
  const { _id, _creationTime, key, updatedAt, ...s } = row;
  return s;
}

export const settings = query({
  args: {},
  handler: async (ctx) => ((await isPanel(ctx)) ? await hrSettings(ctx) : null),
});

const between = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) && n >= lo && n <= hi;

export const saveSettings = mutation({
  args: {
    employerName: v.string(),
    regNo: v.string(),
    employerAddress: v.string(),
    signatory: v.string(),
    signatoryTitle: v.string(),
    weeklyHours: v.number(),
    overtime: v.number(),
    sunday: v.number(),
    holiday: v.number(),
    probationMonths: v.number(),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    if (
      !(
        between(a.weeklyHours, 1, 60) &&
        between(a.overtime, 1, 3) &&
        between(a.sunday, 1, 3) &&
        between(a.holiday, 1, 3) &&
        between(a.probationMonths, 0, 12)
      )
    ) {
      throw new ConvexError("Valor fora do limite.");
    }
    const text = (s: string, max = 120) => s.trim().slice(0, max);
    const row = {
      key: KEY,
      employerName: text(a.employerName),
      regNo: text(a.regNo, 30),
      employerAddress: text(a.employerAddress, 200),
      signatory: text(a.signatory, 80),
      signatoryTitle: text(a.signatoryTitle, 80),
      weeklyHours: a.weeklyHours,
      overtime: a.overtime,
      sunday: a.sunday,
      holiday: a.holiday,
      probationMonths: Math.round(a.probationMonths),
      updatedAt: Date.now(),
    };
    const current = await ctx.db
      .query("hrSettings")
      .withIndex("by_key", (q) => q.eq("key", KEY))
      .unique();
    if (current) {
      await ctx.db.replace(current._id, row);
    } else {
      await ctx.db.insert("hrSettings", row);
    }
  },
});

/* --------------------------------- month --------------------------------- */

function checkMonth(month: string) {
  if (!MONTH.test(month)) {
    throw new ConvexError("Mês inválido (use AAAA-MM).");
  }
}

const runOf = (ctx: QueryCtx, userId: Id<"posUsers">, month: string) =>
  ctx.db
    .query("hrPayruns")
    .withIndex("by_user_month", (q) =>
      q.eq("userId", userId).eq("month", month)
    )
    .unique();

/** Everyone's punches of a month (plus the days that close its first week). */
export const month = query({
  args: { month: v.string() },
  handler: async (ctx, { month: m }) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    checkMonth(m);
    const { weekStart, next } = monthRange(m);
    // Clock-ins happen at most a day before their local date (time zones)
    const from = Date.parse(`${weekStart}T00:00:00Z`) - 86_400_000;
    const to = Date.parse(`${next}T00:00:00Z`) + 86_400_000;
    const users = await ctx.db.query("posUsers").take(500);
    const rows = await Promise.all(
      users.map(async (u) => {
        const [punches, profile, run] = await Promise.all([
          ctx.db
            .query("staffPunches")
            .withIndex("by_user_in", (q) =>
              q.eq("userId", u._id).gte("in", from).lt("in", to)
            )
            .take(1000),
          ctx.db
            .query("hrProfiles")
            .withIndex("by_user", (q) => q.eq("userId", u._id))
            .unique(),
          runOf(ctx, u._id, m),
        ]);
        const inRange = punches.filter(
          (p) => p.date >= weekStart && p.date < next
        );
        return {
          id: u._id,
          name: u.name,
          active: u.active,
          jobTitle: u.jobTitle,
          hourlyRate: u.hourlyRate,
          payType: profile?.payType ?? "hourly",
          monthlySalary: profile?.monthlySalary,
          punches: inRange.map((p) => ({
            id: p._id,
            in: p.in,
            out: p.out,
            date: p.date,
            company: p.company,
          })),
          adjustments: run?.adjustments ?? [],
          approvedAt: run?.approvedAt,
          approvedHours: run?.approvedHours,
          approvedGross: run?.approvedGross,
        };
      })
    );
    return rows.filter((r) => r.active || r.punches.length || r.approvedAt);
  },
});

async function upsertRun(
  ctx: MutationCtx,
  userId: Id<"posUsers">,
  month: string,
  patch: (run: Doc<"hrPayruns"> | null) => Partial<Doc<"hrPayruns">>
) {
  const run = await runOf(ctx, userId, month);
  if (run) {
    await ctx.db.patch(run._id, patch(run));
  } else {
    await ctx.db.insert("hrPayruns", {
      userId,
      month,
      adjustments: [],
      ...patch(null),
    });
  }
}

const notApproved = (run: Doc<"hrPayruns"> | null) => {
  if (run?.approvedAt) {
    throw new ConvexError("Mês já aprovado: reabra para mudar.");
  }
};

export const addAdjustment = mutation({
  args: {
    userId: v.id("posUsers"),
    month: v.string(),
    hours: v.number(),
    note: v.string(),
  },
  handler: async (ctx, { userId, month: m, hours, note }) => {
    await requirePanel(ctx);
    checkMonth(m);
    if (!between(hours, -200, 200) || hours === 0) {
      throw new ConvexError("Horas inválidas.");
    }
    const text = note.trim().slice(0, 140);
    if (!text) {
      throw new ConvexError("Escreva o motivo do ajuste.");
    }
    await upsertRun(ctx, userId, m, (run) => {
      notApproved(run);
      return {
        adjustments: [
          ...(run?.adjustments ?? []),
          { hours: Math.round(hours * 100) / 100, note: text, at: Date.now() },
        ],
      };
    });
  },
});

export const removeAdjustment = mutation({
  args: { userId: v.id("posUsers"), month: v.string(), at: v.number() },
  handler: async (ctx, { userId, month: m, at }) => {
    await requirePanel(ctx);
    await upsertRun(ctx, userId, m, (run) => {
      notApproved(run);
      return {
        adjustments: (run?.adjustments ?? []).filter((a) => a.at !== at),
      };
    });
  },
});

export const approve = mutation({
  args: {
    userId: v.id("posUsers"),
    month: v.string(),
    hours: v.number(),
    gross: v.number(),
  },
  handler: async (ctx, { userId, month: m, hours, gross }) => {
    await requirePanel(ctx);
    checkMonth(m);
    await upsertRun(ctx, userId, m, () => ({
      approvedAt: Date.now(),
      approvedHours: hours,
      approvedGross: gross,
    }));
  },
});

export const reopen = mutation({
  args: { userId: v.id("posUsers"), month: v.string() },
  handler: async (ctx, { userId, month: m }) => {
    await requirePanel(ctx);
    await upsertRun(ctx, userId, m, () => ({
      approvedAt: undefined,
      approvedHours: undefined,
      approvedGross: undefined,
    }));
  },
});
