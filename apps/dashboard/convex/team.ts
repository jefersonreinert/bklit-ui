import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { audit, companyOf, MAIN, requireStaff, worksIn } from "./access";

/**
 * Team of each business: the weekly rota (shifts) and the time clock
 * (punches). Every POS user is an employee; "team" lets a manager plan
 * shifts, see pay and fix punches. Everyone sees the rota of the
 * businesses they work in and clocks in and out with their own PIN.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const canManage = (user: Doc<"posUsers">) =>
  user.perms.includes("team") || user.perms.includes("users");

function checkDay(day: string) {
  if (!DAY.test(day)) {
    throw new ConvexError("Data inválida.");
  }
}

function checkTime(time: string) {
  if (!TIME.test(time)) {
    throw new ConvexError("Horário inválido (use HH:MM).");
  }
}

/** Adds days to a YYYY-MM-DD string (UTC math, no time zone drift). */
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function member(ctx: QueryCtx, userId: Id<"posUsers">, company: string) {
  const user = await ctx.db.get(userId);
  if (!(user?.active && worksIn(user, company))) {
    throw new ConvexError("Essa pessoa não trabalha nesta empresa.");
  }
  return user;
}

/* -------------------------------- queries -------------------------------- */

/** Rota, punches and (for managers) pay and sales of a period. */
export const week = query({
  args: {
    session: v.optional(v.string()),
    company: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { session, company = MAIN, from, to }) => {
    const me = await requireStaff(ctx, session, ["orders", "team"], company);
    const manager = canManage(me);
    const users = (await ctx.db.query("posUsers").take(500)).filter(
      (u) => u.active && worksIn(u, company)
    );
    const [shifts, punches] = await Promise.all([
      ctx.db
        .query("staffShifts")
        .withIndex("by_company_date", (q) =>
          q.eq("company", company).gte("date", from).lte("date", to)
        )
        .take(3000),
      ctx.db
        .query("staffPunches")
        .withIndex("by_company_date", (q) =>
          q.eq("company", company).gte("date", from).lte("date", to)
        )
        .take(3000),
    ]);
    let sales: { day: string; sales: number }[] = [];
    if (manager) {
      const days = [
        ...(await ctx.db
          .query("posDaily")
          .withIndex("by_company_day", (q) =>
            q.eq("company", company).gte("day", from).lte("day", to)
          )
          .take(60)),
        ...(company === MAIN
          ? await ctx.db
              .query("posDaily")
              .withIndex("by_company_day", (q) =>
                q.eq("company", undefined).gte("day", from).lte("day", to)
              )
              .take(60)
          : []),
      ];
      sales = days.map((d) => ({ day: d.day, sales: d.sales }));
    }
    return {
      me: me._id,
      manager,
      staff: users
        .map((u) => ({
          id: u._id,
          name: u.name,
          color: u.color,
          jobTitle: u.jobTitle ?? null,
          hourlyRate: manager ? (u.hourlyRate ?? null) : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      shifts: shifts.map((s) => ({
        id: s._id,
        userId: s.userId,
        date: s.date,
        start: s.start,
        end: s.end,
        note: s.note ?? null,
      })),
      punches: punches
        .filter((p) => manager || p.userId === me._id)
        .map((p) => ({
          id: p._id,
          userId: p.userId,
          date: p.date,
          in: p.in,
          out: p.out,
        })),
      sales,
    };
  },
});

/** This user's open punch (in any business), or null. */
export const clock = query({
  args: { session: v.optional(v.string()) },
  handler: async (ctx, { session }) => {
    const me = await requireStaff(ctx, session);
    const open = await openPunch(ctx, me._id);
    return open
      ? { id: open._id, company: open.company, in: open.in, date: open.date }
      : null;
  },
});

async function openPunch(ctx: QueryCtx, userId: Id<"posUsers">) {
  const last = await ctx.db
    .query("staffPunches")
    .withIndex("by_user_in", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  return last && last.out === null ? last : null;
}

/* ---------------------------------- rota --------------------------------- */

export const saveShift = mutation({
  args: {
    session: v.string(),
    company: v.optional(v.string()),
    id: v.optional(v.id("staffShifts")),
    userId: v.id("posUsers"),
    date: v.string(),
    start: v.string(),
    end: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { session, company = MAIN, id, note, ...shift }) => {
    await requireStaff(ctx, session, "team", company);
    checkDay(shift.date);
    checkTime(shift.start);
    checkTime(shift.end);
    await member(ctx, shift.userId, company);
    const doc = {
      ...shift,
      company,
      note: note?.trim().slice(0, 120) || undefined,
      updatedAt: Date.now(),
    };
    if (id) {
      const current = await ctx.db.get(id);
      if (!current || current.company !== company) {
        throw new ConvexError("Turno não encontrado.");
      }
      await ctx.db.replace(id, doc);
      return id;
    }
    return await ctx.db.insert("staffShifts", doc);
  },
});

export const deleteShift = mutation({
  args: { session: v.string(), id: v.id("staffShifts") },
  handler: async (ctx, { session, id }) => {
    const shift = await ctx.db.get(id);
    if (!shift) {
      return;
    }
    await requireStaff(ctx, session, "team", shift.company);
    await ctx.db.delete(id);
  },
});

/** Copies a week's shifts (7 days from `from`) to the week starting `to`. */
export const copyWeek = mutation({
  args: {
    session: v.string(),
    company: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { session, company = MAIN, from, to }) => {
    const user = await requireStaff(ctx, session, "team", company);
    checkDay(from);
    checkDay(to);
    const range = (start: string) =>
      ctx.db
        .query("staffShifts")
        .withIndex("by_company_date", (q) =>
          q
            .eq("company", company)
            .gte("date", start)
            .lte("date", addDays(start, 6))
        )
        .take(2000);
    const [source, target] = await Promise.all([range(from), range(to)]);
    const offset = Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000
    );
    const taken = new Set(
      target.map((s) => `${s.userId}|${s.date}|${s.start}`)
    );
    let copied = 0;
    for (const s of source) {
      const date = addDays(s.date, offset);
      if (taken.has(`${s.userId}|${date}|${s.start}`)) {
        continue;
      }
      await ctx.db.insert("staffShifts", {
        company,
        userId: s.userId,
        date,
        start: s.start,
        end: s.end,
        note: s.note,
        updatedAt: Date.now(),
      });
      copied++;
    }
    await audit(
      ctx,
      user,
      "Copiou escala",
      `${from} → ${to}: ${copied}`,
      company
    );
    return copied;
  },
});

/* ------------------------------- time clock ------------------------------ */

export const clockIn = mutation({
  args: {
    session: v.string(),
    company: v.optional(v.string()),
    date: v.string(),
    device: v.optional(v.string()),
  },
  handler: async (ctx, { session, company = MAIN, date, device }) => {
    const me = await requireStaff(ctx, session, undefined, company);
    checkDay(date);
    if (await openPunch(ctx, me._id)) {
      throw new ConvexError("Você já está com o ponto aberto.");
    }
    return await ctx.db.insert("staffPunches", {
      company,
      userId: me._id,
      in: Date.now(),
      out: null,
      date,
      device: device?.slice(0, 80),
    });
  },
});

export const clockOut = mutation({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const me = await requireStaff(ctx, session);
    const open = await openPunch(ctx, me._id);
    if (!open) {
      throw new ConvexError("Seu ponto não está aberto.");
    }
    await ctx.db.patch(open._id, { out: Date.now() });
  },
});

/** A manager corrects a punch (forgot to clock out, wrong time…). */
export const fixPunch = mutation({
  args: {
    session: v.string(),
    id: v.id("staffPunches"),
    in: v.number(),
    out: v.union(v.number(), v.null()),
    remove: v.optional(v.boolean()),
  },
  handler: async (ctx, { session, id, remove, ...times }) => {
    const punch = await ctx.db.get(id);
    if (!punch) {
      throw new ConvexError("Registro não encontrado.");
    }
    const user = await requireStaff(ctx, session, "team", companyOf(punch));
    if (remove) {
      await ctx.db.delete(id);
      await audit(ctx, user, "Apagou ponto", "", punch.company);
      return;
    }
    if (times.out !== null && times.out <= times.in) {
      throw new ConvexError("A saída precisa ser depois da entrada.");
    }
    await ctx.db.patch(id, times);
    await audit(ctx, user, "Corrigiu ponto", "", punch.company);
  },
});
