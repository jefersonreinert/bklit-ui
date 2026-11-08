import { ConvexError, v } from "convex/values";
import {
  ACTIVE,
  type Booking,
  bookingRef,
  check,
  DEFAULT_SETTINGS,
  isDate,
  isTime,
  problemText,
  SOURCES,
  type Source,
  STATUSES,
  type Status,
  slots,
  suggestTables,
  type TableInfo,
  type VenueSettings,
} from "../lib/reservations/engine";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { meta } from "./access";
import { upsertGuest } from "./guests";
import { isPanel, requirePanel } from "./lib";

/**
 * Reservation engine (panel): venue settings, availability and bookings
 * from every channel. Each create/update runs as one Convex transaction
 * that re-reads the day's bookings, so two requests can never take the
 * same table at the same time (the losing one is retried and refused).
 */

const KEY = /^[a-z0-9-]{1,40}$/;
export const PREFIX: Record<string, string> = {
  "the-brew": "TB",
  "ribs-house": "RH",
  vinomad: "VN",
  main: "CB",
};

function company(c: string) {
  if (!KEY.test(c)) {
    throw new ConvexError("Empresa inválida.");
  }
  return c;
}

export async function settingsOf(
  ctx: QueryCtx,
  c: string
): Promise<VenueSettings> {
  const row = await ctx.db
    .query("resVenues")
    .withIndex("by_company", (q) => q.eq("company", c))
    .unique();
  return {
    ...DEFAULT_SETTINGS,
    ...((row?.settings ?? {}) as Partial<VenueSettings>),
  };
}

/** The venue's tables from its POS floor plan. */
export async function tablesOf(ctx: QueryCtx, c: string): Promise<TableInfo[]> {
  const m = await meta(ctx, c);
  const areas = (m?.areas ?? []) as {
    name: string;
    tables: { id: string; name: string; seats: number }[];
  }[];
  return areas.flatMap((a) =>
    (a.tables ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      seats: t.seats,
      area: a.name,
    }))
  );
}

const dayOf = (ctx: QueryCtx, c: string, date: string) =>
  ctx.db
    .query("reservations")
    .withIndex("by_company_date", (q) => q.eq("company", c).eq("date", date))
    .take(1000);

const asBooking = (r: Doc<"reservations">): Booking => ({
  id: r._id,
  date: r.date,
  time: r.time,
  duration: r.duration,
  party: r.party,
  tables: r.tables,
  status: r.status as Status,
});

const view = (r: Doc<"reservations">) => ({
  id: r._id,
  company: r.company,
  ref: r.ref,
  name: r.name,
  phone: r.phone ?? "",
  email: r.email ?? "",
  date: r.date,
  time: r.time,
  duration: r.duration,
  party: r.party,
  tables: r.tables,
  source: r.source as Source,
  status: r.status as Status,
  requests: r.requests ?? "",
  notes: r.notes ?? "",
  occasion: r.occasion ?? "",
  vip: Boolean(r.vip),
  event: Boolean(r.event),
  customerId: r.customerId ?? null,
  guestId: r.guestId ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  log: r.log,
});

/* -------------------------------- settings -------------------------------- */

export const venue = query({
  args: { company: v.string() },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const c = company(a.company);
    const [settings, tables, m] = await Promise.all([
      settingsOf(ctx, c),
      tablesOf(ctx, c),
      meta(ctx, c),
    ]);
    // Floor plan drawing (POS units: 1000 × 700 per area)
    const floor = (
      (m?.areas ?? []) as {
        id: string;
        name: string;
        tables: {
          id: string;
          name: string;
          seats: number;
          x: number;
          y: number;
          w: number;
          h: number;
          shape: string;
        }[];
      }[]
    ).map((area) => ({
      id: area.id,
      name: area.name,
      tables: (area.tables ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        seats: t.seats,
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
        round: t.shape === "round",
      })),
    }));
    return { settings, tables, floor };
  },
});

const hoursV = v.array(
  v.object({ closed: v.boolean(), open: v.string(), close: v.string() })
);

export const saveSettings = mutation({
  args: {
    company: v.string(),
    hours: hoursV,
    interval: v.number(),
    duration: v.number(),
    lastBooking: v.number(),
    minParty: v.number(),
    maxParty: v.number(),
    maxCovers: v.number(),
    online: v.boolean(),
    confirmOnline: v.boolean(),
    conditions: v.string(),
  },
  handler: async (ctx, { company: raw, ...s }) => {
    await requirePanel(ctx);
    const c = company(raw);
    const int = (n: number, lo: number, hi: number) =>
      Number.isInteger(n) && n >= lo && n <= hi;
    if (
      s.hours.length !== 7 ||
      s.hours.some((h) => !(h.closed || (isTime(h.open) && isTime(h.close)))) ||
      ![10, 15, 20, 30, 60].includes(s.interval) ||
      !int(s.duration, 15, 480) ||
      !int(s.lastBooking, 0, 300) ||
      !int(s.minParty, 1, 50) ||
      !int(s.maxParty, s.minParty, 300) ||
      !int(s.maxCovers, 0, 2000)
    ) {
      throw new ConvexError("Configuração inválida.");
    }
    const settings: VenueSettings = {
      ...s,
      conditions: s.conditions.trim().slice(0, 600),
    };
    const row = await ctx.db
      .query("resVenues")
      .withIndex("by_company", (q) => q.eq("company", c))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { settings, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("resVenues", {
        company: c,
        settings,
        updatedAt: Date.now(),
      });
    }
  },
});

/* ------------------------------ availability ------------------------------ */

export const availability = query({
  args: {
    company: v.string(),
    date: v.string(),
    party: v.number(),
    duration: v.optional(v.number()),
    excludeId: v.optional(v.id("reservations")),
  },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const c = company(a.company);
    if (!(isDate(a.date) && a.party >= 1)) {
      return [];
    }
    const [s, tables, day] = await Promise.all([
      settingsOf(ctx, c),
      tablesOf(ctx, c),
      dayOf(ctx, c, a.date),
    ]);
    const others = day.filter((r) => r._id !== a.excludeId).map(asBooking);
    return slots(s, a.date, a.party, others, tables, a.duration ?? s.duration);
  },
});

/** Every booking of a date (one venue or all), with the floor plans. */
export const day = query({
  args: { company: v.string(), date: v.string() },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    if (!isDate(a.date)) {
      throw new ConvexError("Data inválida.");
    }
    const all = a.company === "all";
    const rows = all
      ? await ctx.db
          .query("reservations")
          .withIndex("by_date", (q) => q.eq("date", a.date))
          .take(3000)
      : await dayOf(ctx, company(a.company), a.date);
    const companies = all
      ? [...new Set(rows.map((r) => r.company))]
      : [a.company];
    const tables: Record<string, TableInfo[]> = {};
    for (const c of companies) {
      tables[c] = await tablesOf(ctx, c);
    }
    // Guest badges: visits and no-shows across every venue
    const guests: Record<string, { visits: number; noShows: number }> = {};
    for (const id of new Set(rows.map((r) => r.guestId).filter(Boolean))) {
      const hist = await ctx.db
        .query("reservations")
        .withIndex("by_guest", (q) => q.eq("guestId", id))
        .take(300);
      guests[id as string] = {
        visits: hist.filter((h) => ["seated", "completed"].includes(h.status))
          .length,
        noShows: hist.filter((h) => h.status === "no_show").length,
      };
    }
    return {
      reservations: rows
        .map(view)
        .sort(
          (x, y) => x.time.localeCompare(y.time) || x.createdAt - y.createdAt
        ),
      tables,
      guests,
    };
  },
});

/** Bookings between two dates (inclusive, at most 62 days). */
export const range = query({
  args: { company: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    if (!(isDate(a.from) && isDate(a.to)) || a.to < a.from) {
      throw new ConvexError("Período inválido.");
    }
    const days = (Date.parse(a.to) - Date.parse(a.from)) / 86_400_000;
    if (days > 62) {
      throw new ConvexError("Período longo demais.");
    }
    const rows =
      a.company === "all"
        ? await ctx.db
            .query("reservations")
            .withIndex("by_date", (q) =>
              q.gte("date", a.from).lte("date", a.to)
            )
            .take(8000)
        : await ctx.db
            .query("reservations")
            .withIndex("by_company_date", (q) =>
              q
                .eq("company", company(a.company))
                .gte("date", a.from)
                .lte("date", a.to)
            )
            .take(8000);
    return rows
      .map((r) => ({
        id: r._id,
        company: r.company,
        name: r.name,
        date: r.date,
        time: r.time,
        party: r.party,
        status: r.status as Status,
        source: r.source as Source,
        vip: Boolean(r.vip),
      }))
      .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  },
});

/* ------------------------------- bookings --------------------------------- */

const fields = {
  name: v.string(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  date: v.string(),
  time: v.string(),
  duration: v.optional(v.number()),
  party: v.number(),
  tables: v.optional(v.array(v.string())),
  requests: v.optional(v.string()),
  notes: v.optional(v.string()),
  occasion: v.optional(v.string()),
  vip: v.optional(v.boolean()),
  event: v.optional(v.boolean()),
  /** Staff may book outside hours, party limits or capacity. */
  override: v.optional(v.boolean()),
  /** Pick the best free table(s) when none are given. */
  autoTable: v.optional(v.boolean()),
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (s: string | undefined, max: number) => {
  const t = s?.trim().slice(0, max);
  return t ? t : undefined;
};

function clean(a: {
  name: string;
  phone?: string;
  email?: string;
  date: string;
  time: string;
  party: number;
}) {
  const name = text(a.name, 80);
  if (!name) {
    throw new ConvexError("Nome do cliente é obrigatório.");
  }
  if (!(isDate(a.date) && isTime(a.time))) {
    throw new ConvexError("Data ou hora inválida.");
  }
  if (!(Number.isInteger(a.party) && a.party >= 1 && a.party <= 500)) {
    throw new ConvexError("Número de pessoas inválido.");
  }
  const email = text(a.email, 120)?.toLowerCase();
  if (email && !EMAIL.test(email)) {
    throw new ConvexError("E-mail inválido.");
  }
  const phone = text(a.phone, 30)?.replace(/[^\d+]/g, "");
  return { name, email, phone: phone || undefined };
}

async function customerFor(ctx: QueryCtx, phone: string | undefined) {
  if (!phone) {
    return null;
  }
  return await ctx.db
    .query("posCustomers")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .first();
}

function refuse(problems: ReturnType<typeof check>) {
  if (problems.length) {
    throw new ConvexError(problems.map(problemText).join(" "));
  }
}

export const create = mutation({
  args: { company: v.string(), source: v.string(), ...fields },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    if (!SOURCES.includes(a.source as Source)) {
      throw new ConvexError("Origem inválida.");
    }
    const who = clean(a);
    const [s, tables, day] = await Promise.all([
      settingsOf(ctx, c),
      tablesOf(ctx, c),
      dayOf(ctx, c, a.date),
    ]);
    const known = new Set(tables.map((t) => t.id));
    const others = day.map(asBooking);
    const b: Booking = {
      date: a.date,
      time: a.time,
      duration: Math.min(
        480,
        Math.max(15, Math.round(a.duration ?? s.duration))
      ),
      party: a.party,
      tables: [...new Set(a.tables ?? [])].filter((t) => known.has(t)),
      status: a.source === "walkin" ? "seated" : "confirmed",
    };
    if (!b.tables.length && a.autoTable) {
      b.tables = suggestTables(s, b, others, tables);
    }
    const walkin = a.source === "walkin";
    refuse(check(s, b, others, tables, { override: a.override || walkin }));
    const online = [
      "website",
      "instagram",
      "facebook",
      "whatsapp",
      "google",
    ].includes(a.source);
    let status: Status = online && s.confirmOnline ? "pending" : "confirmed";
    if (walkin) {
      status = "seated";
    }
    const customer = await customerFor(ctx, who.phone);
    const guestId = await upsertGuest(ctx, {
      ...who,
      vip: a.vip || (customer?.vip ?? 0) > 0,
    });
    // Unique reference (retry on the rare collision)
    let ref = bookingRef(PREFIX[c] ?? "RS", Math.random);
    for (let i = 0; i < 5; i++) {
      const taken = await ctx.db
        .query("reservations")
        .withIndex("by_ref", (q) => q.eq("ref", ref))
        .first();
      if (!taken) {
        break;
      }
      ref = bookingRef(PREFIX[c] ?? "RS", Math.random);
    }
    const now = Date.now();
    const id = await ctx.db.insert("reservations", {
      company: c,
      ref,
      ...who,
      date: b.date,
      time: b.time,
      duration: b.duration,
      party: b.party,
      tables: b.tables,
      source: a.source,
      status,
      requests: text(a.requests, 600),
      notes: text(a.notes, 600),
      occasion: text(a.occasion, 60),
      vip: a.vip || (customer?.vip ?? 0) > 0 || undefined,
      event: a.event || undefined,
      customerId: customer?._id,
      guestId,
      createdAt: now,
      updatedAt: now,
      log: [{ at: now, by: "Painel", what: `Criada (${a.source})` }],
    });
    return { id, ref };
  },
});

export const update = mutation({
  args: { id: v.id("reservations"), ...fields },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const r = await ctx.db.get(a.id);
    if (!r) {
      throw new ConvexError("Reserva não encontrada.");
    }
    const who = clean(a);
    const [s, tables, day] = await Promise.all([
      settingsOf(ctx, r.company),
      tablesOf(ctx, r.company),
      dayOf(ctx, r.company, a.date),
    ]);
    const known = new Set(tables.map((t) => t.id));
    const others = day.filter((x) => x._id !== r._id).map(asBooking);
    const b: Booking = {
      date: a.date,
      time: a.time,
      duration: Math.min(
        480,
        Math.max(15, Math.round(a.duration ?? r.duration))
      ),
      party: a.party,
      tables: [...new Set(a.tables ?? [])].filter((t) => known.has(t)),
      status: r.status as Status,
    };
    if (!b.tables.length && a.autoTable) {
      b.tables = suggestTables(s, b, others, tables);
    }
    if (ACTIVE.includes(b.status)) {
      refuse(
        check(s, b, others, tables, {
          override: a.override || r.source === "walkin",
        })
      );
    }
    const changes: string[] = [];
    if (r.date !== b.date || r.time !== b.time) {
      changes.push(`horário ${r.date} ${r.time} → ${b.date} ${b.time}`);
    }
    if (r.party !== b.party) {
      changes.push(`pessoas ${r.party} → ${b.party}`);
    }
    if (r.tables.join() !== b.tables.join()) {
      changes.push("mesa alterada");
    }
    const now = Date.now();
    const guestId =
      who.phone !== r.phone || who.email !== r.email || !r.guestId
        ? await upsertGuest(ctx, { ...who, vip: a.vip })
        : r.guestId;
    await ctx.db.patch(r._id, {
      ...who,
      guestId,
      date: b.date,
      time: b.time,
      duration: b.duration,
      party: b.party,
      tables: b.tables,
      requests: text(a.requests, 600),
      notes: text(a.notes, 600),
      occasion: text(a.occasion, 60),
      vip: a.vip || undefined,
      event: a.event || undefined,
      updatedAt: now,
      log: [
        ...r.log,
        {
          at: now,
          by: "Painel",
          what: changes.length ? `Editada: ${changes.join("; ")}` : "Editada",
        },
      ].slice(-50),
    });
  },
});

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  seated: "Sentada",
  completed: "Concluída",
  cancelled: "Cancelada",
  no_show: "No-show",
};

export const setStatus = mutation({
  args: { id: v.id("reservations"), status: v.string() },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const r = await ctx.db.get(a.id);
    if (!r) {
      throw new ConvexError("Reserva não encontrada.");
    }
    if (!STATUSES.includes(a.status as Status)) {
      throw new ConvexError("Status inválido.");
    }
    const next = a.status as Status;
    // Re-activating a booking must not double book its table
    if (
      ACTIVE.includes(next) &&
      !ACTIVE.includes(r.status as Status) &&
      r.tables.length
    ) {
      const [s, tables, day] = await Promise.all([
        settingsOf(ctx, r.company),
        tablesOf(ctx, r.company),
        dayOf(ctx, r.company, r.date),
      ]);
      const others = day.filter((x) => x._id !== r._id).map(asBooking);
      refuse(
        check(s, { ...asBooking(r), status: next }, others, tables, {
          override: true,
        })
      );
    }
    const now = Date.now();
    await ctx.db.patch(r._id, {
      status: next,
      updatedAt: now,
      log: [
        ...r.log,
        { at: now, by: "Painel", what: STATUS_LABEL[next] },
      ].slice(-50),
    });
  },
});

/** Find bookings by reference, name or phone (one venue or all). */
export const search = query({
  args: { company: v.string(), q: v.string() },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const q = a.q.trim();
    if (q.length < 2) {
      return [];
    }
    const byRef = await ctx.db
      .query("reservations")
      .withIndex("by_ref", (x) => x.eq("ref", q.toUpperCase()))
      .take(5);
    const digits = q.replace(/[^\d+]/g, "");
    const byPhone =
      digits.length >= 6
        ? await ctx.db
            .query("reservations")
            .withIndex("by_phone", (x) => x.eq("phone", digits))
            .take(50)
        : [];
    const recent = await ctx.db.query("reservations").order("desc").take(800);
    const name = q.toLowerCase();
    const byName = recent.filter((r) => r.name.toLowerCase().includes(name));
    const seen = new Set<Id<"reservations">>();
    return [...byRef, ...byPhone, ...byName]
      .filter((r) => {
        if (
          seen.has(r._id) ||
          (a.company !== "all" && r.company !== a.company)
        ) {
          return false;
        }
        seen.add(r._id);
        return true;
      })
      .slice(0, 40)
      .map(view);
  },
});
