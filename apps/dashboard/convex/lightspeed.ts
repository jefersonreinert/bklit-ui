import { ConvexError, v } from "convex/values";
import {
  authorizeUrl,
  flattenMenu,
  gridTables,
  isLskEnv,
  LSK_ENVS,
  type LskEnv,
  parseBusinesses,
  parseChecks,
  parseFloors,
  parseSale,
  parseTokens,
  tileColor,
  type LskSale,
} from "../lib/lightspeed/k-series";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  type ActionCtx,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { audit, canReadPos, MAIN, meta, requireStaff } from "./access";
import { isPanel } from "./lib";
import { inCompany } from "./pos";

/**
 * Lightspeed mode: the app connected to the Lightspeed Restaurant
 * K-Series POS. OAuth (authorization code + rotating refresh token) and a
 * sync every 10 minutes mirror, per linked location, the menu, floor
 * plans, open checks and closed sales. The POS shows them read-only in
 * "Lightspeed" mode, and the menu and floor can be imported into the
 * independent system. Nothing is ever written to Lightspeed.
 */

const KEY = "main";
const SITE = () =>
  (process.env.CONVEX_SITE_URL ?? "https://site.reinert1996.duckdns.org").replace(/\/$/, "");
export const redirectUri = () => `${SITE()}/lightspeed/callback`;

/** First sync reaches this far back. */
const FIRST_SYNC_DAYS = 30;
/** Re-read the last hour each run (late receipts, edits). */
const SALES_OVERLAP_MS = 60 * 60_000;
const MAX_PAGES = 30;

async function requirePanel(ctx: Pick<QueryCtx, "auth">) {
  if (!(await isPanel(ctx))) {
    throw new ConvexError("Entre com o código de acesso do painel.");
  }
}

const authRow = (ctx: QueryCtx) =>
  ctx.db
    .query("lskAuth")
    .withIndex("by_key", (q) => q.eq("key", KEY))
    .unique();

const locationOf = (ctx: QueryCtx, company: string) =>
  ctx.db
    .query("lskLocations")
    .withIndex("by_company", (q) => q.eq("company", company))
    .first();

/* ------------------------------ panel settings ---------------------------- */

export const status = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const a = await authRow(ctx);
    const locations = await ctx.db.query("lskLocations").take(100);
    const companies = (await ctx.db.query("posMeta").take(50)).map((m) => ({
      key: m.key,
      name:
        ((m.profile ?? {}) as { name?: string }).name ??
        (m.key === MAIN ? "Casa Brasa" : m.key),
    }));
    return {
      env: (a?.env ?? "trial") as LskEnv,
      hasClient: Boolean(a?.clientId && a.clientSecret),
      clientIdHint: a?.clientId ? `${a.clientId.slice(0, 6)}…` : null,
      connected: Boolean(a?.refreshToken),
      connectedAt: a?.connectedAt ?? null,
      scope: a?.scope ?? "",
      error: a?.error ?? null,
      lastSyncAt: a?.lastSyncAt ?? null,
      syncError: a?.syncError ?? null,
      redirectUri: redirectUri(),
      portal: LSK_ENVS[(a?.env ?? "trial") as LskEnv]?.portal ?? LSK_ENVS.trial.portal,
      companies,
      locations: locations.map((l) => ({
        locationId: l.locationId,
        name: l.name,
        businessName: l.businessName,
        company: l.company ?? null,
        enabled: l.enabled,
        salesAt: l.salesAt ?? null,
        error: l.error ?? null,
      })),
    };
  },
});

export const configure = mutation({
  args: {
    env: v.string(),
    clientId: v.string(),
    /** Empty keeps the saved secret. */
    clientSecret: v.string(),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    if (!isLskEnv(a.env)) {
      throw new ConvexError("Ambiente inválido.");
    }
    const clientId = a.clientId.trim();
    const secret = a.clientSecret.trim();
    if (!/^[\w.-]{3,200}$/.test(clientId)) {
      throw new ConvexError("Client ID inválido.");
    }
    const row = await authRow(ctx);
    if (!(secret || row?.clientSecret)) {
      throw new ConvexError("Informe o Client Secret.");
    }
    const changed = !row || row.env !== a.env || row.clientId !== clientId || Boolean(secret);
    const doc = {
      key: KEY,
      env: a.env,
      clientId,
      clientSecret: secret || (row?.clientSecret ?? ""),
      updatedAt: Date.now(),
      // New credentials need a new authorization
      ...(changed
        ? {
            accessToken: undefined,
            refreshToken: undefined,
            accessExpiresAt: undefined,
            refreshExpiresAt: undefined,
            connectedAt: undefined,
            error: undefined,
          }
        : {}),
    };
    if (row) {
      await ctx.db.patch(row._id, doc);
    } else {
      await ctx.db.insert("lskAuth", doc);
    }
  },
});

/** Returns the Lightspeed login URL; the callback comes back to returnTo. */
export const startAuth = mutation({
  args: { returnTo: v.string() },
  handler: async (ctx, { returnTo }) => {
    await requirePanel(ctx);
    const a = await authRow(ctx);
    if (!(a?.clientId && a.clientSecret && isLskEnv(a.env))) {
      throw new ConvexError("Salve o Client ID e o Client Secret primeiro.");
    }
    let back: URL;
    try {
      back = new URL(returnTo);
    } catch {
      throw new ConvexError("Endereço de retorno inválido.");
    }
    if (back.protocol !== "https:" && back.hostname !== "localhost") {
      throw new ConvexError("O retorno precisa ser https.");
    }
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const now = Date.now();
    await ctx.db.insert("lskStates", { state, returnTo: back.toString(), createdAt: now });
    // Old states (> 1 h) go away
    for (const s of await ctx.db.query("lskStates").take(50)) {
      if (now - s.createdAt > 3_600_000) {
        await ctx.db.delete(s._id);
      }
    }
    return authorizeUrl(a.env, a.clientId, redirectUri(), state);
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const a = await authRow(ctx);
    if (a) {
      await ctx.db.patch(a._id, {
        accessToken: undefined,
        refreshToken: undefined,
        accessExpiresAt: undefined,
        refreshExpiresAt: undefined,
        connectedAt: undefined,
        error: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});

export const mapLocation = mutation({
  args: {
    locationId: v.number(),
    company: v.union(v.string(), v.null()),
    enabled: v.boolean(),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const loc = await ctx.db
      .query("lskLocations")
      .withIndex("by_location", (q) => q.eq("locationId", a.locationId))
      .unique();
    if (!loc) {
      throw new ConvexError("Local não encontrado.");
    }
    if (a.company) {
      if (!(await meta(ctx, a.company))) {
        throw new ConvexError("Empresa não encontrada.");
      }
      const other = await locationOf(ctx, a.company);
      if (other && other._id !== loc._id) {
        throw new ConvexError(`Essa empresa já está ligada a "${other.name}".`);
      }
    }
    await ctx.db.patch(loc._id, {
      company: a.company ?? undefined,
      enabled: a.enabled && Boolean(a.company),
      updatedAt: Date.now(),
    });
    if (a.enabled && a.company) {
      await ctx.scheduler.runAfter(0, internal.lightspeed.syncLocation, {
        locationId: a.locationId,
      });
    }
  },
});

export const syncNow = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    await ctx.scheduler.runAfter(0, internal.lightspeed.syncAll, {});
  },
});

/* --------------------------------- OAuth ---------------------------------- */

export const authInternal = internalQuery({
  args: {},
  handler: async (ctx) => await authRow(ctx),
});

export const takeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const s = await ctx.db
      .query("lskStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();
    if (!s) {
      return null;
    }
    await ctx.db.delete(s._id);
    return Date.now() - s.createdAt < 15 * 60_000 ? s.returnTo : null;
  },
});

const tokenFields = {
  accessToken: v.string(),
  refreshToken: v.string(),
  accessExpiresAt: v.number(),
  refreshExpiresAt: v.number(),
  scope: v.string(),
};

export const saveTokens = internalMutation({
  args: { ...tokenFields, connected: v.optional(v.boolean()) },
  handler: async (ctx, { connected, ...t }) => {
    const a = await authRow(ctx);
    if (!a) {
      return;
    }
    await ctx.db.patch(a._id, {
      ...t,
      lockUntil: undefined,
      error: undefined,
      ...(connected ? { connectedAt: Date.now() } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** Only one refresh at a time: refresh tokens are single use. */
export const tryLock = internalMutation({
  args: {},
  handler: async (ctx) => {
    const a = await authRow(ctx);
    const now = Date.now();
    if (!a || (a.lockUntil && a.lockUntil > now)) {
      return false;
    }
    await ctx.db.patch(a._id, { lockUntil: now + 20_000 });
    return true;
  },
});

export const authFailed = internalMutation({
  args: { error: v.string(), drop: v.boolean() },
  handler: async (ctx, { error, drop }) => {
    const a = await authRow(ctx);
    if (!a) {
      return;
    }
    await ctx.db.patch(a._id, {
      error: error.slice(0, 300),
      lockUntil: undefined,
      ...(drop
        ? { accessToken: undefined, refreshToken: undefined, connectedAt: undefined }
        : {}),
      updatedAt: Date.now(),
    });
  },
});

async function tokenRequest(env: LskEnv, clientId: string, secret: string, body: URLSearchParams) {
  const res = await fetch(`${LSK_ENVS[env].auth}/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = String(data.error_description ?? data.error ?? `HTTP ${res.status}`);
    const err = new Error(msg) as Error & { invalidGrant?: boolean };
    err.invalidGrant = data.error === "invalid_grant" || res.status === 401;
    throw err;
  }
  return parseTokens(data, Date.now());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A valid access token, refreshing (once, under a lock) when needed. */
async function accessToken(ctx: ActionCtx, force = false): Promise<{ token: string; env: LskEnv }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const a = await ctx.runQuery(internal.lightspeed.authInternal, {});
    if (!(a?.refreshToken && isLskEnv(a.env))) {
      throw new Error("Lightspeed não conectado.");
    }
    if (!force && a.accessToken && (a.accessExpiresAt ?? 0) - Date.now() > 60_000) {
      return { token: a.accessToken, env: a.env };
    }
    if (await ctx.runMutation(internal.lightspeed.tryLock, {})) {
      try {
        const t = await tokenRequest(
          a.env,
          a.clientId,
          a.clientSecret,
          new URLSearchParams({ grant_type: "refresh_token", refresh_token: a.refreshToken })
        );
        await ctx.runMutation(internal.lightspeed.saveTokens, t);
        return { token: t.accessToken, env: a.env };
      } catch (err) {
        const e = err as Error & { invalidGrant?: boolean };
        await ctx.runMutation(internal.lightspeed.authFailed, {
          error: e.invalidGrant
            ? "A autorização expirou. Clique em Conectar com Lightspeed de novo."
            : `Falha ao renovar o acesso: ${e.message}`,
          drop: Boolean(e.invalidGrant),
        });
        throw err;
      }
    }
    force = false;
    // Someone else is refreshing: wait for the new token
    await sleep(1500);
  }
  throw new Error("Não consegui renovar o acesso ao Lightspeed.");
}

async function lskGet(ctx: ActionCtx, path: string, query: Record<string, string> = {}) {
  let auth = await accessToken(ctx);
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = new URL(`${LSK_ENVS[auth.env].api}${path}`);
    for (const [k, val] of Object.entries(query)) {
      if (val) {
        url.searchParams.set(k, val);
      }
    }
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${auth.token}`, accept: "application/json" },
    });
    if (res.status === 401 && attempt === 0) {
      auth = await accessToken(ctx, true);
      continue;
    }
    if (res.status === 429 && attempt < 2) {
      const wait = Math.min(15_000, (Number(res.headers.get("retry-after")) || 3) * 1000);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`Lightspeed ${res.status} em ${path}${text ? `: ${text}` : ""}`);
    }
    return (await res.json()) as unknown;
  }
  throw new Error(`Lightspeed não respondeu em ${path}.`);
}

/** GET /lightspeed/callback (registered as the redirect URI). */
export const callback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const returnTo = state ? await ctx.runMutation(internal.lightspeed.takeState, { state }) : null;
  const back = (result: string) => {
    const target = new URL(returnTo ?? "https://casa-brasa.casabrasa.workers.dev/configuracoes");
    target.searchParams.set("lightspeed", result);
    return new Response(null, { status: 302, headers: { location: target.toString() } });
  };
  if (!returnTo) {
    return new Response("Pedido de autorização expirado. Volte ao app e tente de novo.", {
      status: 400,
    });
  }
  if (url.searchParams.get("error") || !code) {
    return back("denied");
  }
  const a = await ctx.runQuery(internal.lightspeed.authInternal, {});
  if (!(a && isLskEnv(a.env))) {
    return back("error");
  }
  try {
    const t = await tokenRequest(
      a.env,
      a.clientId,
      a.clientSecret,
      new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri() })
    );
    await ctx.runMutation(internal.lightspeed.saveTokens, { ...t, connected: true });
    await ctx.scheduler.runAfter(0, internal.lightspeed.syncAll, {});
    return back("ok");
  } catch (err) {
    await ctx.runMutation(internal.lightspeed.authFailed, {
      error: `Falha na autorização: ${(err as Error).message}`,
      drop: true,
    });
    return back("error");
  }
});

/* ---------------------------------- sync ---------------------------------- */

export const upsertLocations = internalMutation({
  args: {
    locations: v.array(
      v.object({
        businessId: v.number(),
        businessName: v.string(),
        locationId: v.number(),
        name: v.string(),
      })
    ),
  },
  handler: async (ctx, { locations }) => {
    const now = Date.now();
    for (const l of locations) {
      const row = await ctx.db
        .query("lskLocations")
        .withIndex("by_location", (q) => q.eq("locationId", l.locationId))
        .unique();
      if (row) {
        await ctx.db.patch(row._id, { ...l, updatedAt: now });
      } else {
        await ctx.db.insert("lskLocations", { ...l, enabled: false, updatedAt: now });
      }
    }
  },
});

export const syncState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const locations = await ctx.db.query("lskLocations").take(100);
    return locations.filter((l) => l.enabled && l.company).map((l) => l.locationId);
  },
});

export const locationInternal = internalQuery({
  args: { locationId: v.number() },
  handler: async (ctx, { locationId }) =>
    await ctx.db
      .query("lskLocations")
      .withIndex("by_location", (q) => q.eq("locationId", locationId))
      .unique(),
});

const itemV = v.object({
  sku: v.string(),
  name: v.string(),
  price: v.number(),
  group: v.string(),
  subgroup: v.optional(v.string()),
  color: v.optional(v.string()),
  taxPct: v.optional(v.number()),
  menu: v.string(),
  modifierGroups: v.number(),
});

export const saveMenu = internalMutation({
  args: { locationId: v.number(), items: v.array(itemV) },
  handler: async (ctx, { locationId, items }) => {
    const old = await ctx.db
      .query("lskItems")
      .withIndex("by_location", (q) => q.eq("locationId", locationId))
      .take(5000);
    for (const o of old) {
      await ctx.db.delete(o._id);
    }
    for (const i of items.slice(0, 5000)) {
      await ctx.db.insert("lskItems", { ...i, locationId });
    }
    await patchLocation(ctx, locationId, { menuAt: Date.now() });
  },
});

export const saveFloor = internalMutation({
  args: { locationId: v.number(), floors: v.any(), checks: v.any(), floorsOk: v.boolean() },
  handler: async (ctx, { locationId, floors, checks, floorsOk }) => {
    const row = await ctx.db
      .query("lskFloors")
      .withIndex("by_location", (q) => q.eq("locationId", locationId))
      .unique();
    const now = Date.now();
    const doc = {
      locationId,
      floors: floorsOk ? floors : (row?.floors ?? []),
      checks,
      floorsAt: floorsOk ? now : (row?.floorsAt ?? 0),
      checksAt: now,
    };
    if (row) {
      await ctx.db.patch(row._id, doc);
    } else {
      await ctx.db.insert("lskFloors", doc);
    }
    await patchLocation(ctx, locationId, { checksAt: now, ...(floorsOk ? { floorAt: now } : {}) });
  },
});

const saleV = v.object({
  receiptId: v.string(),
  closedAt: v.number(),
  openedAt: v.number(),
  cancelled: v.boolean(),
  table: v.string(),
  covers: v.number(),
  staff: v.string(),
  total: v.number(),
  tax: v.number(),
  tips: v.number(),
  payments: v.array(
    v.object({ code: v.string(), name: v.string(), amount: v.number(), tip: v.number() })
  ),
  lines: v.array(
    v.object({ sku: v.string(), name: v.string(), qty: v.number(), total: v.number(), group: v.string() })
  ),
});

export const saveSales = internalMutation({
  args: { locationId: v.number(), sales: v.array(saleV), cursor: v.optional(v.number()) },
  handler: async (ctx, { locationId, sales, cursor }) => {
    for (const s of sales) {
      const row = await ctx.db
        .query("lskSales")
        .withIndex("by_receipt", (q) => q.eq("locationId", locationId).eq("receiptId", s.receiptId))
        .unique();
      if (row) {
        await ctx.db.replace(row._id, { ...s, locationId });
      } else {
        await ctx.db.insert("lskSales", { ...s, locationId });
      }
    }
    await patchLocation(ctx, locationId, {
      salesAt: Date.now(),
      ...(cursor ? { salesCursor: cursor } : {}),
    });
  },
});

export const locationError = internalMutation({
  args: { locationId: v.number(), error: v.union(v.string(), v.null()) },
  handler: async (ctx, { locationId, error }) => {
    await patchLocation(ctx, locationId, { error: error?.slice(0, 300) ?? undefined });
  },
});

export const syncDone = internalMutation({
  args: { error: v.union(v.string(), v.null()) },
  handler: async (ctx, { error }) => {
    const a = await authRow(ctx);
    if (a) {
      await ctx.db.patch(a._id, {
        lastSyncAt: Date.now(),
        syncError: error?.slice(0, 300) ?? undefined,
      });
    }
  },
});

async function patchLocation(
  ctx: { db: import("./_generated/server").MutationCtx["db"] },
  locationId: number,
  patch: Partial<Doc<"lskLocations">>
) {
  const row = await ctx.db
    .query("lskLocations")
    .withIndex("by_location", (q) => q.eq("locationId", locationId))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, patch);
  }
}

export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const a = await ctx.runQuery(internal.lightspeed.authInternal, {});
    if (!a?.refreshToken) {
      return;
    }
    try {
      const businesses = await lskGet(ctx, "/o/op/data/businesses");
      await ctx.runMutation(internal.lightspeed.upsertLocations, {
        locations: parseBusinesses(businesses),
      });
    } catch (err) {
      await ctx.runMutation(internal.lightspeed.syncDone, { error: (err as Error).message });
      return;
    }
    const ids = await ctx.runQuery(internal.lightspeed.syncState, {});
    let failed: string | null = null;
    for (const locationId of ids) {
      try {
        await syncOne(ctx, locationId);
      } catch (err) {
        failed = (err as Error).message;
      }
    }
    await ctx.runMutation(internal.lightspeed.syncDone, { error: failed });
  },
});

export const syncLocation = internalAction({
  args: { locationId: v.number() },
  handler: async (ctx, { locationId }) => {
    await syncOne(ctx, locationId);
  },
});

async function syncOne(ctx: ActionCtx, locationId: number) {
  const loc = await ctx.runQuery(internal.lightspeed.locationInternal, { locationId });
  if (!loc?.enabled) {
    return;
  }
  const id = String(locationId);
  const errors: string[] = [];
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      errors.push(`${name}: ${(err as Error).message}`);
    }
  };

  // Menu: every menu of the location, flattened (first place of a SKU wins)
  const menuEvery = 6 * 60 * 60_000;
  if (!loc.menuAt || Date.now() - loc.menuAt > menuEvery) {
    await step("cardápio", async () => {
      const list = (await lskGet(ctx, "/o/op/1/menu/list", { businessLocationId: id })) as {
        ikentooMenuId?: number;
      }[];
      const items = [];
      const seen = new Set<string>();
      for (const m of (Array.isArray(list) ? list : []).slice(0, 10)) {
        if (!m.ikentooMenuId) {
          continue;
        }
        const menu = await lskGet(ctx, `/o/op/2/menu/load/${m.ikentooMenuId}`, {
          businessLocationId: id,
        });
        for (const i of flattenMenu(menu)) {
          const k = i.sku || i.name;
          if (!seen.has(k)) {
            seen.add(k);
            items.push(i);
          }
        }
      }
      await ctx.runMutation(internal.lightspeed.saveMenu, { locationId, items });
    });
  }

  // Floor plans (hourly) and open checks (every run)
  await step("mesas", async () => {
    const floorsDue = !loc.floorAt || Date.now() - loc.floorAt > 60 * 60_000;
    const floors = floorsDue
      ? parseFloors(
          await lskGet(ctx, `/o/op/data/${id}/floorplans`, { expandTables: "true" })
        )
      : [];
    const checks = parseChecks(
      await lskGet(ctx, "/o/op/1/order/table/getCheck", { businessLocationId: id })
    );
    await ctx.runMutation(internal.lightspeed.saveFloor, {
      locationId,
      floors,
      checks,
      floorsOk: floorsDue,
    });
  });

  // Closed sales since the cursor (paginated)
  await step("vendas", async () => {
    const from = Math.max(
      Date.now() - 365 * 86_400_000 + 3_600_000,
      (loc.salesCursor ?? Date.now() - FIRST_SYNC_DAYS * 86_400_000) - SALES_OVERLAP_MS
    );
    let token = "";
    let newest = loc.salesCursor ?? 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = (await lskGet(ctx, `/f/v2/business-location/${id}/sales`, {
        from: new Date(from).toISOString(),
        pageSize: "100",
        include: "payments,staff,table",
        nextPageToken: token,
      })) as { sales?: unknown[]; nextPageToken?: string };
      const sales = (data.sales ?? []).map(parseSale).filter((s): s is LskSale => s !== null);
      for (const s of sales) {
        newest = Math.max(newest, s.closedAt);
      }
      token = data.nextPageToken ?? "";
      await ctx.runMutation(internal.lightspeed.saveSales, {
        locationId,
        sales,
        // Move the cursor only when the whole range was read
        cursor: token ? undefined : newest || Date.now(),
      });
      if (!token) {
        break;
      }
    }
  });

  await ctx.runMutation(internal.lightspeed.locationError, {
    locationId,
    error: errors.length ? errors.join(" · ") : null,
  });
  if (errors.length) {
    throw new Error(`${loc.name}: ${errors.join(" · ")}`);
  }
}

/* ------------------------ Lightspeed mode in the POS ----------------------- */

async function linked(ctx: QueryCtx, session: string | undefined, company: string) {
  if (!(await canReadPos(ctx, session, company))) {
    return null;
  }
  const loc = await locationOf(ctx, company);
  return loc?.enabled ? loc : null;
}

export const link = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const loc = await linked(ctx, session, company);
    if (!loc) {
      return null;
    }
    const a = await authRow(ctx);
    return {
      locationId: loc.locationId,
      name: loc.name,
      businessName: loc.businessName,
      connected: Boolean(a?.refreshToken),
      error: loc.error ?? a?.error ?? null,
      salesAt: loc.salesAt ?? null,
      checksAt: loc.checksAt ?? null,
      menuAt: loc.menuAt ?? null,
    };
  },
});

/** Sales summary between two instants (the phone sends local day bounds). */
export const overview = query({
  args: { session: v.optional(v.string()), company: v.string(), from: v.number(), to: v.number() },
  handler: async (ctx, { session, company, from, to }) => {
    const loc = await linked(ctx, session, company);
    if (!loc) {
      return null;
    }
    const sales = (
      await ctx.db
        .query("lskSales")
        .withIndex("by_location_closed", (q) =>
          q.eq("locationId", loc.locationId).gte("closedAt", from).lt("closedAt", to)
        )
        .take(5000)
    ).filter((s) => !s.cancelled);
    const payments = new Map<string, number>();
    const items = new Map<string, { name: string; qty: number; total: number }>();
    const groups = new Map<string, number>();
    const hours = Array.from({ length: 24 }, () => 0);
    let total = 0;
    let tips = 0;
    let covers = 0;
    for (const s of sales) {
      total += s.total;
      tips += s.tips;
      covers += s.covers;
      const h = new Date(s.closedAt).getUTCHours();
      hours[h] = (hours[h] ?? 0) + s.total;
      for (const p of s.payments) {
        payments.set(p.name || p.code, (payments.get(p.name || p.code) ?? 0) + p.amount);
      }
      for (const l of s.lines) {
        const k = l.sku || l.name;
        const it = items.get(k) ?? { name: l.name, qty: 0, total: 0 };
        it.qty += l.qty;
        it.total += l.total;
        items.set(k, it);
        groups.set(l.group || "Outros", (groups.get(l.group || "Outros") ?? 0) + l.total);
      }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      receipts: sales.length,
      total: r2(total),
      tips: r2(tips),
      covers,
      average: sales.length ? r2(total / sales.length) : 0,
      payments: [...payments].map(([name, amount]) => ({ name, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
      groups: [...groups].map(([name, amount]) => ({ name, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
      top: [...items.values()].sort((a, b) => b.total - a.total).slice(0, 15).map((i) => ({ ...i, total: r2(i.total) })),
      hoursUtc: hours.map(r2),
    };
  },
});

export const receipts = query({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { session, company, before, limit = 50 }) => {
    const loc = await linked(ctx, session, company);
    if (!loc) {
      return null;
    }
    return await ctx.db
      .query("lskSales")
      .withIndex("by_location_closed", (q) =>
        q.eq("locationId", loc.locationId).lt("closedAt", before ?? Number.MAX_SAFE_INTEGER)
      )
      .order("desc")
      .take(Math.min(limit, 100));
  },
});

export const menu = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const loc = await linked(ctx, session, company);
    if (!loc) {
      return null;
    }
    return await ctx.db
      .query("lskItems")
      .withIndex("by_location", (q) => q.eq("locationId", loc.locationId))
      .take(5000);
  },
});

export const floor = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const loc = await linked(ctx, session, company);
    if (!loc) {
      return null;
    }
    const row = await ctx.db
      .query("lskFloors")
      .withIndex("by_location", (q) => q.eq("locationId", loc.locationId))
      .unique();
    return {
      floors: (row?.floors ?? []) as ReturnType<typeof parseFloors>,
      checks: (row?.checks ?? []) as ReturnType<typeof parseChecks>,
      checksAt: row?.checksAt ?? null,
    };
  },
});

/* ------------------- import into the independent system ------------------- */

/**
 * Copies the Lightspeed menu into the business's own products: matched by
 * SKU (then by name); price, category (screen) and subcategory
 * (sub-screen) are updated, stock and cost are kept, nothing is deleted.
 */
export const importMenu = mutation({
  args: { session: v.string(), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const user = await requireStaff(ctx, session, "products", company);
    const loc = await locationOf(ctx, company);
    if (!loc) {
      throw new ConvexError("Empresa sem local do Lightspeed ligado.");
    }
    const items = await ctx.db
      .query("lskItems")
      .withIndex("by_location", (q) => q.eq("locationId", loc.locationId))
      .take(5000);
    if (!items.length) {
      throw new ConvexError("O cardápio do Lightspeed ainda não foi sincronizado.");
    }
    const products = await inCompany(company, (key) =>
      ctx.db
        .query("posProducts")
        .withIndex("by_company", (q) => q.eq("company", key))
        .take(5000)
    );
    const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku as string, p]));
    const byName = new Map(products.map((p) => [p.name.toLocaleLowerCase(), p]));
    let created = 0;
    let updated = 0;
    const now = Date.now();
    for (const i of items) {
      const match = (i.sku && bySku.get(i.sku)) || byName.get(i.name.toLocaleLowerCase());
      const fields = {
        name: i.name.slice(0, 80),
        category: i.group.slice(0, 60) || "Outros",
        subcategory: i.subgroup?.slice(0, 60),
        price: Math.round(i.price * 100) / 100,
        sku: i.sku || undefined,
      };
      if (match) {
        await ctx.db.patch(match._id, { ...fields, updatedAt: now });
        updated++;
      } else {
        await ctx.db.insert("posProducts", {
          ...fields,
          cid: `lsk-${loc.locationId}-${i.sku || created}`,
          color: tileColor(i.color, "#c96442"),
          available: true,
          unit: "un",
          trackStock: false,
          company,
          updatedAt: now,
        });
        created++;
      }
    }
    await audit(ctx, user, "Importou cardápio do Lightspeed", `${created} novos, ${updated} atualizados`, company);
    return { created, updated };
  },
});

/**
 * Copies Lightspeed floor plans into the POS map as areas "LS · <floor>".
 * Tables already imported keep their position (only name and seats are
 * updated); nothing is removed.
 */
export const importFloor = mutation({
  args: { session: v.string(), company: v.string() },
  handler: async (ctx, { session, company }) => {
    const user = await requireStaff(ctx, session, "tables", company);
    const loc = await locationOf(ctx, company);
    const m = await meta(ctx, company);
    if (!(loc && m)) {
      throw new ConvexError("Empresa sem local do Lightspeed ligado.");
    }
    const row = await ctx.db
      .query("lskFloors")
      .withIndex("by_location", (q) => q.eq("locationId", loc.locationId))
      .unique();
    const floors = (row?.floors ?? []) as ReturnType<typeof parseFloors>;
    if (!floors.length) {
      throw new ConvexError("As mesas do Lightspeed ainda não foram sincronizadas.");
    }
    type Area = { id: string; name: string; tables: { id: string; name: string; seats: number }[] };
    const areas = [...((m.areas ?? []) as Area[])];
    let added = 0;
    for (const f of floors) {
      const areaId = `lsk-${f.id}`;
      const grid = gridTables(f.tables, `lsk-${loc.locationId}`);
      const current = areas.find((a) => a.id === areaId);
      if (!current) {
        areas.push({ id: areaId, name: `LS · ${f.name}`.slice(0, 40), tables: grid });
        added += grid.length;
        continue;
      }
      for (const t of grid) {
        const old = current.tables.find((x) => x.id === t.id);
        if (old) {
          old.name = t.name;
          old.seats = t.seats;
        } else {
          current.tables.push(t);
          added++;
        }
      }
    }
    await ctx.db.patch(m._id, { areas });
    await audit(ctx, user, "Importou mesas do Lightspeed", `${floors.length} plantas, ${added} mesas novas`, company);
    return { floors: floors.length, added };
  },
});
