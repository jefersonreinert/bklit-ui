import { ConvexError, v } from "convex/values";
import {
  ACTIVE,
  bookingRef,
  type Status,
  STATUSES,
} from "../lib/reservations/engine";
import {
  areaFor,
  autoMap,
  createBody,
  errorOf,
  isTableoEnv,
  type LocalBooking,
  localParts,
  mergeStatus,
  parseAreas,
  parseBooking,
  patchBody,
  posTablesOf,
  serviceDate,
  sourceFromTableo,
  statusCall,
  statusFromEvent,
  TABLEO_ENVS,
  TABLEO_EVENTS,
  type TableoArea,
  type TableoBooking,
  type TableoEnv,
  tableoTablesOf,
  furthest,
  verifyTableoSignature,
} from "../lib/reservations/tableo";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  type ActionCtx,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { canReadPos, requireStaff } from "./access";
import { upsertGuest } from "./guests";
import { isPanel, requirePanel } from "./lib";
import {
  changeStatus,
  PREFIX,
  settingsOf,
  tablesOf,
  view,
} from "./reservations";

/**
 * Tableo (tableo.com) two-way sync of a venue's reservations.
 *
 * - Tableo → app in real time: Tableo calls /tableo/webhook?k=… for every
 *   booking event; the delivery is checked with the webhook secret
 *   (Tableo-Signature HMAC, 5-minute replay window), deduplicated by
 *   X-Webhook-Id and applied at once, then re-read from the API a few
 *   seconds later (retries may arrive out of order).
 * - Safety net: every 10 minutes yesterday→tomorrow is pulled, and every
 *   night the next 60 days.
 * - App → Tableo (when "enviar" is on): bookings created, edited or moved
 *   to another status in the panel or the POS are sent through the API.
 * The restaurant token stays on the server; the browser never sees it.
 */

const KEY = /^[a-z0-9-]{1,40}$/;
const TRAILING_SLASH = /\/$/;
const BLANK = /\s/;
const HOOK_KEY = /^[a-f0-9]{64}$/;
const SITE = () =>
  (
    process.env.CONVEX_SITE_URL ?? "https://site.reinert1996.duckdns.org"
  ).replace(TRAILING_SLASH, "");
const hookUrl = (key: string) => `${SITE()}/tableo/webhook?k=${key}`;
const HOOK_PATH = "/tableo/webhook";

/** Days pulled after connecting and every night. */
const FULL_DAYS = 60;
/** Dates read per pull run (each one is a request). */
const DATES_PER_RUN = 15;
const REFRESH_DELAY_MS = 3000;
const MAX_ATTEMPTS = 3;

const TZ = "Europe/Malta";

function company(c: string) {
  if (!KEY.test(c)) {
    throw new ConvexError("Empresa inválida.");
  }
  return c;
}

const linkOfCompany = (ctx: QueryCtx, c: string) =>
  ctx.db
    .query("tableoLinks")
    .withIndex("by_company", (q) => q.eq("company", c))
    .unique();

function randomKey(n = 32) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function uuid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${randomKey(8)}-${randomKey(4)}-${randomKey(4)}`;
  }
}

/** YYYY-MM-DD plus n days. */
function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const todayIn = (tz?: string) =>
  localParts(new Date().toISOString(), tz ?? TZ)?.date ??
  new Date().toISOString().slice(0, 10);

const cleanPhone = (p?: string) => p?.replace(/[^\d+]/g, "") || undefined;

/* ------------------------------- API calls -------------------------------- */

class TableoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Link = Pick<Doc<"tableoLinks">, "env" | "token">;

async function call(
  link: Link,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  idempotency?: string
): Promise<Record<string, unknown>> {
  const env = (isTableoEnv(link.env) ? link.env : "production") as TableoEnv;
  const res = await fetch(`${TABLEO_ENVS[env].url}/api/restaurant${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${link.token}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new TableoError(
      res.status,
      errorOf(res.status, json ?? { message: text.slice(0, 200) })
    );
  }
  if (json === null && text.trimStart().startsWith("<")) {
    throw new TableoError(
      res.status,
      "Tableo respondeu HTML (token ou URL errados)."
    );
  }
  return (json ?? {}) as Record<string, unknown>;
}

/** Drops undefined fields (Convex values cannot hold them). */
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const msg = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).slice(0, 300);

/* ------------------------------ applying data ----------------------------- */

const STATUS_PT: Record<Status, string> = {
  pending: "pendente",
  confirmed: "confirmada",
  seated: "sentada",
  completed: "concluída",
  cancelled: "cancelada",
  no_show: "no-show",
};

/** A booking made here that Tableo now reports (sent but not yet linked). */
async function unlinkedTwin(
  ctx: MutationCtx,
  c: string,
  date: string,
  b: TableoBooking
) {
  const day = await ctx.db
    .query("reservations")
    .withIndex("by_company_date", (q) => q.eq("company", c).eq("date", date))
    .take(1000);
  const name = b.name.toLowerCase();
  return (
    day.find(
      (r) =>
        r.tableoId === undefined &&
        r.time === b.time &&
        r.party === b.party &&
        r.name.toLowerCase() === name &&
        Date.now() - r.createdAt < 15 * 60_000
    ) ?? null
  );
}

/**
 * Writes a Tableo booking into the app (insert or update). Never queues a
 * send back to Tableo, so webhooks cannot loop.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one booking, field by field
async function applyBooking(
  ctx: MutationCtx,
  link: Doc<"tableoLinks">,
  b: TableoBooking,
  hint: Status | null
) {
  const c = link.company;
  const s = await settingsOf(ctx, c);
  const date = serviceDate(s, b.date, b.time);
  const row =
    (await ctx.db
      .query("reservations")
      .withIndex("by_tableo", (q) => q.eq("company", c).eq("tableoId", b.id))
      .first()) ?? (await unlinkedTwin(ctx, c, date, b));
  const map = (link.tableMap ?? {}) as Record<string, string>;
  const mapped = posTablesOf(b.tables, map);
  const incoming = hint ? furthest(b.status, hint) : b.status;
  const now = Date.now();
  const phone = cleanPhone(b.phone);
  const name = b.blocked
    ? `Bloqueio${b.comment ? `: ${b.comment}` : ""}`.slice(0, 80)
    : (b.name || "Cliente Tableo").slice(0, 80);
  const common = {
    name,
    phone: b.blocked ? undefined : phone,
    email: b.blocked ? undefined : b.email,
    date,
    time: b.time,
    duration: b.duration,
    party: b.blocked ? 0 : b.party,
    requests: b.blocked ? undefined : b.comment?.slice(0, 600),
    notes: b.privateComment?.slice(0, 600),
    occasion: b.tags.join(", ").slice(0, 60) || undefined,
    tableoId: b.id,
    tableoRef: b.ref,
    tableoTables: b.tables.map((t) => t.name),
    tableoChannel: b.channel,
    tableoSyncedAt: now,
    blocked: b.blocked || undefined,
  };
  if (!row) {
    const customer = phone
      ? await ctx.db
          .query("posCustomers")
          .withIndex("by_phone", (q) => q.eq("phone", phone))
          .first()
      : null;
    const vip = b.vip || (customer?.vip ?? 0) > 0;
    const guestId = b.blocked
      ? undefined
      : await upsertGuest(ctx, { name, phone, email: b.email, vip });
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
    const id = await ctx.db.insert("reservations", {
      company: c,
      ref,
      ...common,
      tables: mapped,
      source: b.blocked ? "tableo" : sourceFromTableo(b.channel),
      status: incoming,
      vip: vip || undefined,
      customerId: customer?._id,
      guestId,
      createdAt: now,
      updatedAt: now,
      log: [
        {
          at: now,
          by: "Tableo",
          what: `Recebida do Tableo (${b.ref}${b.channel ? `, ${b.channel}` : ""})`,
        },
      ],
    });
    return id;
  }
  // Tables: Tableo's linked tables; keep ours when Tableo has none yet
  let tables = row.tables;
  if (mapped.length) {
    tables = mapped;
  } else if (b.tables.length) {
    tables = [];
  }
  const status = mergeStatus(row.status as Status, incoming);
  const changes: string[] = [];
  if (row.date !== date || row.time !== b.time) {
    changes.push(`horário ${row.date} ${row.time} → ${date} ${b.time}`);
  }
  if (row.party !== common.party) {
    changes.push(`pessoas ${row.party} → ${common.party}`);
  }
  if (row.tables.join() !== tables.join()) {
    changes.push("mesa alterada");
  }
  if (row.status !== status) {
    changes.push(STATUS_PT[status]);
  }
  if (row.name !== name || (row.phone ?? "") !== (common.phone ?? "")) {
    changes.push("cliente");
  }
  if ((row.requests ?? "") !== (common.requests ?? "")) {
    changes.push("pedidos");
  }
  await ctx.db.patch(row._id, {
    ...common,
    tables,
    status,
    updatedAt: changes.length ? now : row.updatedAt,
    log: changes.length
      ? [
          ...row.log,
          { at: now, by: "Tableo", what: `Tableo: ${changes.join("; ")}` },
        ].slice(-50)
      : row.log,
  });
  return row._id;
}

/* ------------------------------ panel screens ----------------------------- */

const linkView = (l: Doc<"tableoLinks">) => ({
  env: l.env as TableoEnv,
  tokenEnd: l.token.slice(-4),
  state: l.state,
  restaurantName: l.restaurantName ?? null,
  restaurantId: l.restaurantId ?? null,
  timezone: l.timezone ?? null,
  webhook: Boolean(l.webhookId && l.secret),
  webhookUrl: hookUrl(l.hookKey),
  push: l.push,
  areas: (l.areas ?? []) as TableoArea[],
  tableMap: (l.tableMap ?? {}) as Record<string, string>,
  defaultArea: l.defaultArea ?? null,
  lastError: l.lastError ?? null,
  lastPull: l.lastPull ?? null,
  lastEvent: l.lastEvent ?? null,
});

/** Connection, table links and the latest activity of a venue. */
export const status = query({
  args: { company: v.string() },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const c = company(a.company);
    const [link, tables, events] = await Promise.all([
      linkOfCompany(ctx, c),
      tablesOf(ctx, c),
      ctx.db
        .query("tableoEvents")
        .withIndex("by_company_at", (q) => q.eq("company", c))
        .order("desc")
        .take(25),
    ]);
    const synced = link
      ? (
          await ctx.db
            .query("reservations")
            .withIndex("by_company_date", (q) =>
              q.eq("company", c).gte("date", todayIn(link.timezone))
            )
            .take(2000)
        ).filter((r) => r.tableoId !== undefined)
      : [];
    return {
      link: link ? linkView(link) : null,
      posTables: tables,
      upcoming: synced.length,
      failed: synced.filter((r) => r.tableoError).length,
      events: events.map((e) => ({
        id: e._id,
        kind: e.kind,
        ok: e.ok,
        note: e.note ?? "",
        at: e.at,
      })),
    };
  },
});

/** Saves the token and starts the setup (check, areas, webhook, first pull). */
export const connect = mutation({
  args: {
    company: v.string(),
    env: v.string(),
    token: v.string(),
    push: v.boolean(),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    const token = a.token.trim();
    if (!isTableoEnv(a.env)) {
      throw new ConvexError("Ambiente inválido.");
    }
    if (token.length < 20 || token.length > 400 || BLANK.test(token)) {
      throw new ConvexError("Cole o token inteiro gerado no Tableo.");
    }
    const now = Date.now();
    const old = await linkOfCompany(ctx, c);
    if (old) {
      // Remove the old webhook with the old token before switching
      if (old.webhookId) {
        await ctx.scheduler.runAfter(0, internal.tableo.dropWebhook, {
          env: old.env,
          token: old.token,
          webhookId: old.webhookId,
        });
      }
      await ctx.db.patch(old._id, {
        env: a.env,
        token,
        hookKey: randomKey(),
        webhookId: undefined,
        secret: undefined,
        push: a.push,
        state: "connecting",
        lastError: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("tableoLinks", {
        company: c,
        env: a.env,
        token,
        hookKey: randomKey(),
        areas: [],
        tableMap: {},
        push: a.push,
        state: "connecting",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.tableo.setup, { company: c });
  },
});

export const saveOptions = mutation({
  args: {
    company: v.string(),
    push: v.boolean(),
    defaultArea: v.optional(v.number()),
    tableMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    const link = await linkOfCompany(ctx, c);
    if (!link) {
      throw new ConvexError("Tableo não conectado.");
    }
    const areas = (link.areas ?? []) as TableoArea[];
    const known = new Set(
      areas.flatMap((x) => x.tables.map((t) => String(t.id)))
    );
    const pos = new Set((await tablesOf(ctx, c)).map((t) => t.id));
    const map: Record<string, string> = {};
    const used = new Set<string>();
    for (const [k, val] of Object.entries(a.tableMap)) {
      if (known.has(k) && pos.has(val) && !used.has(val)) {
        map[k] = val;
        used.add(val);
      }
    }
    if (
      a.defaultArea !== undefined &&
      !areas.some((x) => x.id === a.defaultArea)
    ) {
      throw new ConvexError("Área inválida.");
    }
    await ctx.db.patch(link._id, {
      push: a.push,
      defaultArea: a.defaultArea,
      tableMap: map,
      updatedAt: Date.now(),
    });
    // Re-read bookings so their tables follow the new links
    if (link.state === "active") {
      await ctx.scheduler.runAfter(0, internal.tableo.pull, {
        company: c,
        from: addDays(todayIn(link.timezone), -1),
        days: 8,
      });
    }
  },
});

/** Re-reads areas, checks the webhook and pulls the next 60 days. */
export const syncNow = mutation({
  args: { company: v.string() },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    const link = await linkOfCompany(ctx, c);
    if (!link) {
      throw new ConvexError("Tableo não conectado.");
    }
    await ctx.db.patch(link._id, { state: "connecting", lastError: undefined });
    await ctx.scheduler.runAfter(0, internal.tableo.setup, { company: c });
  },
});

/** Asks Tableo for a signed webhook.ping to our URL. */
export const testWebhook = mutation({
  args: { company: v.string() },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const link = await linkOfCompany(ctx, company(a.company));
    if (!link?.webhookId) {
      throw new ConvexError("Webhook ainda não registrado.");
    }
    await ctx.scheduler.runAfter(0, internal.tableo.pingWebhook, {
      company: link.company,
    });
  },
});

/** Unlinks the venue (bookings stay; the webhook at Tableo is removed). */
export const disconnect = mutation({
  args: { company: v.string() },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const link = await linkOfCompany(ctx, company(a.company));
    if (!link) {
      return;
    }
    if (link.webhookId) {
      await ctx.scheduler.runAfter(0, internal.tableo.dropWebhook, {
        env: link.env,
        token: link.token,
        webhookId: link.webhookId,
      });
    }
    await ctx.db.delete(link._id);
  },
});

/** Sends a booking again after a failure. */
export const retry = mutation({
  args: { id: v.id("reservations") },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const r = await ctx.db.get(a.id);
    if (!r) {
      throw new ConvexError("Reserva não encontrada.");
    }
    await ctx.scheduler.runAfter(0, internal.tableo.push, {
      id: r._id,
      op: "save",
    });
  },
});

/* ---------------------------------- POS ----------------------------------- */

/** Bookings of a service date for the POS floor (POS session or panel). */
export const posDay = query({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    date: v.string(),
  },
  handler: async (ctx, a) => {
    const c = company(a.company);
    if (!(await canReadPos(ctx, a.session, c))) {
      return null;
    }
    const rows = await ctx.db
      .query("reservations")
      .withIndex("by_company_date", (q) =>
        q.eq("company", c).eq("date", a.date)
      )
      .take(1000);
    const link = await linkOfCompany(ctx, c);
    return {
      tableo: link?.state === "active",
      reservations: rows
        .filter((r) => r.status !== "cancelled")
        .map(view)
        .sort((x, y) => x.time.localeCompare(y.time)),
    };
  },
});

/** POS: guest arrived (seats the booking, checks in at Tableo). */
export const posSetStatus = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    id: v.id("reservations"),
    status: v.string(),
  },
  handler: async (ctx, a) => {
    const c = company(a.company);
    const user = await requireStaff(ctx, a.session, undefined, c);
    const r = await ctx.db.get(a.id);
    if (!r || r.company !== c) {
      throw new ConvexError("Reserva não encontrada.");
    }
    const next = a.status as Status;
    if (
      !(
        STATUSES.includes(next) &&
        ["seated", "completed", "no_show", "confirmed"].includes(next)
      )
    ) {
      throw new ConvexError("Status inválido.");
    }
    await changeStatus(ctx, r, next, `POS · ${user.name}`);
  },
});

/** POS: moves a booking to other tables (same day). */
export const posMoveTables = mutation({
  args: {
    session: v.string(),
    company: v.string(),
    id: v.id("reservations"),
    tables: v.array(v.string()),
  },
  handler: async (ctx, a) => {
    const c = company(a.company);
    const user = await requireStaff(ctx, a.session, undefined, c);
    const r = await ctx.db.get(a.id);
    if (!r || r.company !== c) {
      throw new ConvexError("Reserva não encontrada.");
    }
    const known = new Set((await tablesOf(ctx, c)).map((t) => t.id));
    const tables = [...new Set(a.tables)].filter((t) => known.has(t));
    const now = Date.now();
    await ctx.db.patch(r._id, {
      tables,
      updatedAt: now,
      log: [
        ...r.log,
        { at: now, by: `POS · ${user.name}`, what: "mesa alterada" },
      ].slice(-50),
    });
    const link = await linkOfCompany(ctx, c);
    if (link?.push && link.state === "active") {
      await ctx.scheduler.runAfter(0, internal.tableo.push, {
        id: r._id,
        op: "save",
      });
    }
  },
});

/* ------------------------------ internal data ----------------------------- */

export const linkOf = internalQuery({
  args: { company: v.string() },
  handler: (ctx, a) => linkOfCompany(ctx, a.company),
});

export const linkByHook = internalQuery({
  args: { key: v.string() },
  handler: (ctx, a) =>
    ctx.db
      .query("tableoLinks")
      .withIndex("by_hook", (q) => q.eq("hookKey", a.key))
      .unique(),
});

export const activeLinks = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("tableoLinks").take(50))
      .filter((l) => l.state === "active")
      .map((l) => ({ company: l.company, timezone: l.timezone })),
});

export const pushData = internalQuery({
  args: { id: v.id("reservations") },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r) {
      return null;
    }
    const link = await linkOfCompany(ctx, r.company);
    return link ? { r, link } : null;
  },
});

const linkPatch = v.object({
  state: v.optional(v.string()),
  lastError: v.optional(v.union(v.string(), v.null())),
  lastPull: v.optional(v.number()),
  restaurantName: v.optional(v.string()),
  restaurantId: v.optional(v.number()),
  timezone: v.optional(v.string()),
  defaultDuration: v.optional(v.number()),
  webhookId: v.optional(v.number()),
  secret: v.optional(v.string()),
  areas: v.optional(v.any()),
});

export const saveLink = internalMutation({
  args: { company: v.string(), patch: linkPatch },
  handler: async (ctx, a) => {
    const link = await linkOfCompany(ctx, a.company);
    if (!link) {
      return;
    }
    const { lastError, areas, ...rest } = a.patch;
    const patch: Partial<Doc<"tableoLinks">> = {
      ...rest,
      updatedAt: Date.now(),
    };
    if (lastError !== undefined) {
      patch.lastError = lastError ?? undefined;
    }
    if (areas !== undefined) {
      patch.areas = areas;
      // Link Tableo tables to POS tables by name (keeps manual links)
      const pos = await tablesOf(ctx, a.company);
      patch.tableMap = autoMap(
        areas as TableoArea[],
        pos,
        (link.tableMap ?? {}) as Record<string, string>
      );
      const ids = (areas as TableoArea[]).map((x) => x.id);
      if (link.defaultArea === undefined || !ids.includes(link.defaultArea)) {
        patch.defaultArea = ids[0];
      }
    }
    await ctx.db.patch(link._id, patch);
  },
});

export const note = internalMutation({
  args: {
    company: v.string(),
    kind: v.string(),
    ok: v.boolean(),
    note: v.optional(v.string()),
    bookingId: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("tableoEvents", {
      ...a,
      eventId: "",
      note: a.note?.slice(0, 300),
      at: Date.now(),
    });
  },
});

const bookingV = v.any();

/** A webhook delivery: dedupe, log, apply, then re-read it from the API. */
export const receive = internalMutation({
  args: {
    company: v.string(),
    eventId: v.string(),
    kind: v.string(),
    booking: v.optional(bookingV),
  },
  handler: async (ctx, a) => {
    const link = await linkOfCompany(ctx, a.company);
    if (!link) {
      return "unlinked";
    }
    if (a.eventId) {
      const seen = await ctx.db
        .query("tableoEvents")
        .withIndex("by_event", (q) => q.eq("eventId", a.eventId))
        .first();
      if (seen) {
        return "duplicate";
      }
    }
    const b = (a.booking ?? null) as TableoBooking | null;
    const now = Date.now();
    await ctx.db.insert("tableoEvents", {
      company: a.company,
      eventId: a.eventId,
      kind: a.kind,
      ok: true,
      note: b
        ? `${b.ref} · ${b.name || "—"} · ${b.date} ${b.time} · ${b.party}p`
        : undefined,
      bookingId: b?.id,
      at: now,
    });
    await ctx.db.patch(link._id, { lastEvent: now });
    if (b && link.state === "active") {
      await applyBooking(ctx, link, b, statusFromEvent(a.kind));
      await ctx.scheduler.runAfter(REFRESH_DELAY_MS, internal.tableo.refresh, {
        company: a.company,
        tableoId: b.id,
      });
    }
    return "ok";
  },
});

/**
 * Bookings read from the API. Returns the Tableo ids we hold on those dates
 * that the list did not include (they are re-read one by one).
 */
export const applyMany = internalMutation({
  args: {
    company: v.string(),
    dates: v.array(v.string()),
    bookings: v.array(bookingV),
  },
  handler: async (ctx, a) => {
    const link = await linkOfCompany(ctx, a.company);
    if (!link) {
      return [];
    }
    const got = new Set<number>();
    for (const raw of a.bookings) {
      const b = raw as TableoBooking;
      got.add(b.id);
      await applyBooking(ctx, link, b, null);
    }
    const missing: number[] = [];
    for (const date of a.dates) {
      const rows = await ctx.db
        .query("reservations")
        .withIndex("by_company_date", (q) =>
          q.eq("company", a.company).eq("date", date)
        )
        .take(1000);
      for (const r of rows) {
        if (
          r.tableoId !== undefined &&
          !got.has(r.tableoId) &&
          ACTIVE.includes(r.status as Status)
        ) {
          missing.push(r.tableoId);
        }
      }
    }
    return missing;
  },
});

/** Tableo no longer has the booking: cancel ours. */
export const gone = internalMutation({
  args: { company: v.string(), tableoId: v.number() },
  handler: async (ctx, a) => {
    const r = await ctx.db
      .query("reservations")
      .withIndex("by_tableo", (q) =>
        q.eq("company", a.company).eq("tableoId", a.tableoId)
      )
      .first();
    if (!r || r.status === "cancelled") {
      return;
    }
    const now = Date.now();
    await ctx.db.patch(r._id, {
      status: "cancelled",
      updatedAt: now,
      log: [
        ...r.log,
        { at: now, by: "Tableo", what: "Não existe mais no Tableo: cancelada" },
      ].slice(-50),
    });
  },
});

/** A booking sent from here got its Tableo id (merges a webhook twin). */
export const linked = internalMutation({
  args: { id: v.id("reservations"), tableoId: v.number(), ref: v.string() },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r) {
      return;
    }
    const twins = await ctx.db
      .query("reservations")
      .withIndex("by_tableo", (q) =>
        q.eq("company", r.company).eq("tableoId", a.tableoId)
      )
      .take(5);
    for (const t of twins) {
      if (t._id !== r._id && Date.now() - t.createdAt < 15 * 60_000) {
        await ctx.db.delete(t._id);
      }
    }
    const now = Date.now();
    await ctx.db.patch(r._id, {
      tableoId: a.tableoId,
      tableoRef: a.ref,
      tableoSyncedAt: now,
      tableoError: undefined,
      log: [
        ...r.log,
        { at: now, by: "Tableo", what: `Enviada ao Tableo (${a.ref})` },
      ].slice(-50),
    });
  },
});

export const pushed = internalMutation({
  args: {
    id: v.id("reservations"),
    error: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.id);
    if (!r) {
      return;
    }
    await ctx.db.patch(r._id, {
      tableoError: a.error,
      tableoSyncedAt: a.error ? r.tableoSyncedAt : Date.now(),
    });
    if (a.error) {
      await ctx.db.insert("tableoEvents", {
        company: r.company,
        eventId: "",
        kind: "envio",
        ok: false,
        note: `${r.ref} · ${r.name}: ${a.error}`.slice(0, 300),
        bookingId: r.tableoId,
        at: Date.now(),
      });
    }
  },
});

/* --------------------------------- actions -------------------------------- */

async function requireLink(ctx: ActionCtx, c: string) {
  const link = await ctx.runQuery(internal.tableo.linkOf, { company: c });
  if (!link) {
    throw new Error("Tableo não conectado.");
  }
  return link;
}

const parseOpts = (l: Doc<"tableoLinks">) => ({
  timeZone: l.timezone ?? TZ,
  defaultDuration: l.defaultDuration,
});

/** Checks the token, loads settings and areas, registers our webhook. */
export const setup = internalAction({
  args: { company: v.string() },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one API exchange, step by step
  handler: async (ctx, a) => {
    const link = await requireLink(ctx, a.company);
    try {
      const settings = await call(link, "GET", "/settings");
      const sd = (settings.data ?? {}) as Record<string, unknown>;
      const meta = (settings.meta ?? {}) as Record<string, unknown>;
      const areas = parseAreas(
        await call(link, "GET", "/dining-areas-with-tables")
      );
      const hours = Number(sd.default_booking_duration_hours);
      // Our webhook: keep it when Tableo still has it, else create it
      const url = hookUrl(link.hookKey);
      const list = await call(link, "GET", "/webhooks");
      const hooks = (Array.isArray(list.data) ? list.data : []) as {
        id: number;
        url: string;
        secret?: string;
        events?: string[];
      }[];
      let webhookId: number | undefined;
      let secret: string | undefined;
      for (const h of hooks) {
        if (h.url === url && h.secret) {
          webhookId = h.id;
          secret = h.secret;
        } else if (h.url?.startsWith(`${SITE()}${HOOK_PATH}`)) {
          // An older webhook of ours (previous key): remove it
          await call(link, "DELETE", `/webhooks/${h.id}`).catch(() => null);
        }
      }
      if (webhookId === undefined) {
        const made = await call(link, "POST", "/webhooks", {
          url,
          events: TABLEO_EVENTS,
        });
        const d = (made.data ?? {}) as { id?: number; secret?: string };
        if (!(d.id && d.secret)) {
          throw new Error("Tableo não devolveu o segredo do webhook.");
        }
        webhookId = d.id;
        secret = d.secret;
      }
      await ctx.runMutation(internal.tableo.saveLink, {
        company: a.company,
        patch: {
          state: "active",
          lastError: null,
          restaurantName:
            typeof sd.restaurant_name === "string"
              ? sd.restaurant_name
              : undefined,
          restaurantId:
            typeof meta.restaurant_id === "number"
              ? meta.restaurant_id
              : undefined,
          timezone: typeof sd.timezone === "string" ? sd.timezone : undefined,
          defaultDuration:
            Number.isFinite(hours) && hours > 0
              ? Math.round(hours * 60)
              : undefined,
          webhookId,
          secret,
          areas,
        },
      });
      await ctx.runMutation(internal.tableo.note, {
        company: a.company,
        kind: "conexão",
        ok: true,
        note: `${String(sd.restaurant_name ?? "Restaurante")}: ${areas.length} áreas, ${areas.reduce((n, x) => n + x.tables.length, 0)} mesas, webhook ativo`,
      });
      const tz = typeof sd.timezone === "string" ? sd.timezone : link.timezone;
      await ctx.scheduler.runAfter(0, internal.tableo.pull, {
        company: a.company,
        from: addDays(todayIn(tz), -1),
        days: FULL_DAYS + 1,
      });
    } catch (e) {
      await ctx.runMutation(internal.tableo.saveLink, {
        company: a.company,
        patch: { state: "error", lastError: msg(e) },
      });
      await ctx.runMutation(internal.tableo.note, {
        company: a.company,
        kind: "conexão",
        ok: false,
        note: msg(e),
      });
    }
  },
});

/** Reads bookings date by date (continues itself in batches). */
export const pull = internalAction({
  args: { company: v.string(), from: v.string(), days: v.number() },
  handler: async (ctx, a) => {
    const link = await ctx.runQuery(internal.tableo.linkOf, {
      company: a.company,
    });
    if (!link || link.state !== "active") {
      return;
    }
    const n = Math.max(1, Math.min(a.days, DATES_PER_RUN));
    const dates = Array.from({ length: n }, (_, i) => addDays(a.from, i));
    const bookings: TableoBooking[] = [];
    try {
      for (const date of dates) {
        const res = await call(link, "GET", `/bookings?date=${date}`);
        for (const raw of Array.isArray(res.data) ? res.data : []) {
          const b = parseBooking(raw, parseOpts(link));
          if (b) {
            bookings.push(b);
          }
        }
      }
      const missing = await ctx.runMutation(internal.tableo.applyMany, {
        company: a.company,
        dates,
        bookings: plain(bookings),
      });
      for (const id of missing.slice(0, 30)) {
        await ctx.scheduler.runAfter(0, internal.tableo.refresh, {
          company: a.company,
          tableoId: id,
        });
      }
      await ctx.runMutation(internal.tableo.saveLink, {
        company: a.company,
        patch: { lastPull: Date.now(), lastError: null },
      });
      if (a.days > n) {
        await ctx.scheduler.runAfter(15_000, internal.tableo.pull, {
          company: a.company,
          from: addDays(a.from, n),
          days: a.days - n,
        });
      }
    } catch (e) {
      const status = e instanceof TableoError ? e.status : 0;
      await ctx.runMutation(internal.tableo.saveLink, {
        company: a.company,
        patch: {
          lastError: msg(e),
          ...(status === 401 ? { state: "error" } : {}),
        },
      });
      await ctx.runMutation(internal.tableo.note, {
        company: a.company,
        kind: "leitura",
        ok: false,
        note: msg(e),
      });
    }
  },
});

/** Re-reads one booking (after a webhook, or when a list missed it). */
export const refresh = internalAction({
  args: { company: v.string(), tableoId: v.number() },
  handler: async (ctx, a) => {
    const link = await ctx.runQuery(internal.tableo.linkOf, {
      company: a.company,
    });
    if (!link || link.state !== "active") {
      return;
    }
    try {
      const res = await call(link, "GET", `/bookings/${a.tableoId}`);
      const b = parseBooking(res.data, parseOpts(link));
      if (b) {
        await ctx.runMutation(internal.tableo.applyMany, {
          company: a.company,
          dates: [],
          bookings: [plain(b)],
        });
      }
    } catch (e) {
      if (e instanceof TableoError && e.status === 404) {
        await ctx.runMutation(internal.tableo.gone, a);
        return;
      }
      await ctx.runMutation(internal.tableo.note, {
        company: a.company,
        kind: "leitura",
        ok: false,
        note: `#${a.tableoId}: ${msg(e)}`,
        bookingId: a.tableoId,
      });
    }
  },
});

const localOf = (r: Doc<"reservations">): LocalBooking => ({
  name: r.name,
  phone: r.phone,
  email: r.email,
  date: r.date,
  time: r.time,
  duration: r.duration,
  party: r.party,
  requests: r.requests,
  notes: r.notes,
});

/** Sends a booking made or changed here to Tableo. */
export const push = internalAction({
  args: {
    id: v.id("reservations"),
    op: v.union(v.literal("save"), v.literal("status")),
    prev: v.optional(v.string()),
    attempt: v.optional(v.number()),
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one API exchange, step by step
  handler: async (ctx, a) => {
    const data = await ctx.runQuery(internal.tableo.pushData, { id: a.id });
    if (!data) {
      return;
    }
    const { r, link } = data;
    if (!(link.push && link.state === "active") || r.blocked) {
      return;
    }
    const map = (link.tableMap ?? {}) as Record<string, string>;
    const areas = (link.areas ?? []) as TableoArea[];
    const tableIds = tableoTablesOf(r.tables, map);
    const status = r.status as Status;
    try {
      let tid = r.tableoId;
      if (tid === undefined) {
        // Only live bookings are created at Tableo
        if (!ACTIVE.includes(status)) {
          return;
        }
        const area = areaFor(tableIds, areas, link.defaultArea);
        if (area === undefined) {
          throw new Error(
            "Sem área do Tableo: toque em Sincronizar nas configurações."
          );
        }
        const made = await call(
          link,
          "POST",
          "/bookings",
          createBody(localOf(r), area),
          `cb-${r._id}`.slice(0, 64).replace(/[^a-zA-Z0-9-]/g, "")
        );
        const b = parseBooking(made.data, parseOpts(link));
        if (!b) {
          throw new Error("Tableo não devolveu a reserva criada.");
        }
        tid = b.id;
        await ctx.runMutation(internal.tableo.linked, {
          id: r._id,
          tableoId: tid,
          ref: b.ref,
        });
        // Tables, length and private notes are set with an edit
        await call(
          link,
          "PATCH",
          `/bookings/${tid}`,
          patchBody(localOf(r), { tableIds }),
          uuid()
        );
        if (status === "seated") {
          await call(link, "POST", `/bookings/${tid}/check-in`);
        }
      } else if (a.op === "save") {
        if (ACTIVE.includes(status)) {
          await call(
            link,
            "PATCH",
            `/bookings/${tid}`,
            patchBody(localOf(r), { tableIds }),
            uuid()
          );
        }
      } else {
        const prev = (
          STATUSES.includes(a.prev as Status) ? a.prev : "confirmed"
        ) as Status;
        const step = statusCall(status, prev);
        if (step) {
          await call(link, "POST", `/bookings/${tid}/${step.path}`, step.body);
        }
      }
      await ctx.runMutation(internal.tableo.pushed, { id: r._id });
    } catch (e) {
      const attempt = a.attempt ?? 1;
      if (
        e instanceof TableoError &&
        (e.status === 429 || e.status >= 500) &&
        attempt < MAX_ATTEMPTS
      ) {
        await ctx.scheduler.runAfter(attempt * 60_000, internal.tableo.push, {
          ...a,
          attempt: attempt + 1,
        });
        return;
      }
      await ctx.runMutation(internal.tableo.pushed, {
        id: r._id,
        error: msg(e),
      });
    }
  },
});

export const pingWebhook = internalAction({
  args: { company: v.string() },
  handler: async (ctx, a) => {
    const link = await requireLink(ctx, a.company);
    try {
      await call(link, "POST", `/webhooks/${link.webhookId}/test`);
      await ctx.runMutation(internal.tableo.note, {
        company: a.company,
        kind: "teste",
        ok: true,
        note: "Tableo enviou um webhook.ping (deve aparecer aqui em segundos)",
      });
    } catch (e) {
      await ctx.runMutation(internal.tableo.note, {
        company: a.company,
        kind: "teste",
        ok: false,
        note: msg(e),
      });
    }
  },
});

export const dropWebhook = internalAction({
  args: { env: v.string(), token: v.string(), webhookId: v.number() },
  handler: async (_ctx, a) => {
    await call(a, "DELETE", `/webhooks/${a.webhookId}`).catch(() => null);
  },
});

/** Every 10 minutes: yesterday, today and tomorrow of each linked venue. */
export const pullRecent = internalAction({
  args: {},
  handler: async (ctx) => {
    for (const l of await ctx.runQuery(internal.tableo.activeLinks, {})) {
      await ctx.scheduler.runAfter(0, internal.tableo.pull, {
        company: l.company,
        from: addDays(todayIn(l.timezone), -1),
        days: 3,
      });
    }
  },
});

/** Every night: the next 60 days of each linked venue. */
export const pullFull = internalAction({
  args: {},
  handler: async (ctx) => {
    for (const l of await ctx.runQuery(internal.tableo.activeLinks, {})) {
      await ctx.scheduler.runAfter(0, internal.tableo.pull, {
        company: l.company,
        from: todayIn(l.timezone),
        days: FULL_DAYS,
      });
    }
  },
});

/* --------------------------------- webhook -------------------------------- */

const MAX_BODY = 512_000;

/** POST /tableo/webhook?k=… (Tableo booking events). */
export const webhook = httpAction(async (ctx, req) => {
  const key = new URL(req.url).searchParams.get("k") ?? "";
  if (!HOOK_KEY.test(key)) {
    return new Response("not found", { status: 404 });
  }
  const body = await req.text();
  if (body.length > MAX_BODY) {
    return new Response("too large", { status: 413 });
  }
  const link = await ctx.runQuery(internal.tableo.linkByHook, { key });
  if (!link?.secret) {
    return new Response("not found", { status: 404 });
  }
  const ok = await verifyTableoSignature({
    body,
    secret: link.secret,
    header: req.headers.get("Tableo-Signature"),
    legacy: req.headers.get("X-Webhook-Signature"),
  });
  if (!ok) {
    await ctx.runMutation(internal.tableo.note, {
      company: link.company,
      kind: "webhook",
      ok: false,
      note: "Assinatura inválida ou expirada: entrega recusada",
    });
    return new Response("invalid signature", { status: 401 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const kind =
    req.headers.get("X-Webhook-Event") ??
    (typeof payload.event === "string" ? payload.event : "evento");
  const eventId =
    req.headers.get("X-Webhook-Id") ??
    (typeof payload.id === "string" || typeof payload.id === "number"
      ? String(payload.id)
      : "");
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const booking = data.booking
    ? parseBooking(data.booking, parseOpts(link))
    : null;
  await ctx.runMutation(internal.tableo.receive, {
    company: link.company,
    eventId: eventId.slice(0, 120),
    kind: kind.slice(0, 60),
    booking: booking ? plain(booking) : undefined,
  });
  return new Response("ok", { status: 200 });
});
