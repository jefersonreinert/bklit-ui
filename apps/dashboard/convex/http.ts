import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import {
  cashFromBody,
  dealsFromBody,
  MAX_BODY,
  offsetFromBody,
  parseSignal,
  sameToken,
  statsFromBody,
} from "../lib/journal/ingest";
import { syncFromBody, syncResponse } from "../lib/journal/sync";
import { parseOhlcFeed } from "../lib/metatrader/ohlc-feed";
import { internal } from "./_generated/api";
import { type ActionCtx, httpAction } from "./_generated/server";
import { syncArgs } from "./eatrade";
import { callback as lightspeedCallback } from "./lightspeed";
import { webhook as lightspeedWebhook } from "./lightspeedops";
import { ingestOhlc } from "./ohlc";

/**
 * Always-on webhooks of the trading journal (https://<deployment>.convex.site):
 *
 * - POST /journal/mt5?token=…          deals (and balance operations) from
 *                                       the MT5 EAs
 * - POST /journal/mt5/stats?token=…    account statistics (TradingJournal
 *                                       Complete EA, Golden Bullet)
 * - POST /journal/mt5/sync?token=…     terminal state in, queued orders out
 *                                       (EA v4.10, trading from the panel)
 * - POST /journal/tradingview?token=…  TradingView alert messages
 * - POST /ohlc/mt5?token=…             candles and ticks from the
 *                                       CasaBrasaOHLCExport EA (convex/ohlc.ts)
 *
 * TradingView cannot send headers, so the token goes in the URL; the EA
 * may also send it as X-Journal-Token.
 */

const http = httpRouter();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function authorized(ctx: ActionCtx, request: Request) {
  const expected = await ctx.runQuery(internal.journal.tokenFor, {});
  const given =
    new URL(request.url).searchParams.get("token") ??
    request.headers.get("x-journal-token") ??
    "";
  return Boolean(expected) && sameToken(given, expected ?? "");
}

async function readText(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY) {
    throw new Error("too_large");
  }
  return text;
}

/** Parsed JSON body, or the error response (413 too_large / 400 bad_json). */
async function readJson(
  request: Request
): Promise<{ body: unknown } | { error: Response }> {
  try {
    return { body: JSON.parse(await readText(request)) };
  } catch (err) {
    const big = err instanceof Error && err.message === "too_large";
    return {
      error: json(
        { ok: false, error: big ? "too_large" : "bad_json" },
        big ? 413 : 400
      ),
    };
  }
}

http.route({
  path: "/journal/mt5",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(ctx, request))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const read = await readJson(request);
    if ("error" in read) {
      return read.error;
    }
    const { body } = read;
    const deals = dealsFromBody(body);
    const cash = cashFromBody(body);
    const offsetMs = offsetFromBody(body);
    const b = (body ?? {}) as Record<string, unknown>;
    const login =
      typeof b.account === "string" || typeof b.account === "number"
        ? String(b.account)
        : "";
    const added = await ctx.runMutation(internal.journal.ingestDeals, {
      deals,
      cash,
      account: login
        ? {
            login,
            server: String(b.server ?? "").slice(0, 80),
            name: String(b.name ?? b.broker ?? "").slice(0, 80),
            ...(offsetMs === undefined ? {} : { offsetMs }),
          }
        : undefined,
    });
    return json({
      ok: true,
      received: deals.length,
      added,
      cash: cash.length,
    });
  }),
});

http.route({
  path: "/journal/mt5/stats",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(ctx, request))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const read = await readJson(request);
    if ("error" in read) {
      return read.error;
    }
    const payload = statsFromBody(read.body);
    if (!payload) {
      return json({ ok: false, error: "missing_account" }, 400);
    }
    await ctx.runMutation(internal.journal.ingestStats, payload);
    return json({ ok: true });
  }),
});

http.route({
  path: "/journal/mt5/sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(ctx, request))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const read = await readJson(request);
    if ("error" in read) {
      return read.error;
    }
    const payload = syncFromBody(read.body);
    if (!payload) {
      return json({ ok: false, error: "missing_account" }, 400);
    }
    const out = await ctx.runMutation(
      internal.eatrade.sync,
      syncArgs(payload, Date.now())
    );
    // Plain text: one item per line, simple to read in MQL5
    return new Response(
      syncResponse(out.nextMs, out.watch, out.commands, out.now),
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }),
});

http.route({
  path: "/journal/tradingview",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(ctx, request))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    let text: string;
    try {
      text = await readText(request);
    } catch {
      return json({ ok: false, error: "too_large" }, 413);
    }
    if (!text.trim()) {
      return json({ ok: false, error: "empty" }, 400);
    }
    await ctx.runMutation(internal.journal.ingestSignal, parseSignal(text));
    return json({ ok: true });
  }),
});

/** Same journal token, sent as ?token= or X-Feed-Token (OHLC export EA). */
async function feedAuthorized(ctx: ActionCtx, request: Request) {
  const expected = await ctx.runQuery(internal.journal.tokenFor, {});
  const given =
    new URL(request.url).searchParams.get("token") ??
    request.headers.get("x-feed-token") ??
    "";
  return Boolean(expected) && sameToken(given, expected ?? "");
}

http.route({
  path: "/ohlc/mt5",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await feedAuthorized(ctx, request))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const read = await readJson(request);
    if ("error" in read) {
      return read.error;
    }
    const feed = parseOhlcFeed(read.body);
    if (!feed) {
      return json({ ok: false, error: "bad_feed" }, 400);
    }
    // Answers only after storing: the EA advances its state on a 2xx
    const out = await ingestOhlc(ctx, feed, Date.now());
    return json({ ok: true, ...out });
  }),
});

/** Health check for the EA's "test connection" and uptime monitors. */
http.route({
  path: "/journal/ping",
  method: "GET",
  handler: httpAction(async (ctx, request) =>
    (await authorized(ctx, request))
      ? json({ ok: true, time: Date.now() })
      : json({ ok: false, error: "unauthorized" }, 401)
  ),
});

/**
 * POST /winemonitor/sync (header x-wm-token: $WINEMONITOR_TOKEN)
 * Snapshot of the Wine Monitor portal from services/wine-monitor-sync.
 */
http.route({
  path: "/winemonitor/sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.WINEMONITOR_TOKEN ?? "";
    const given = request.headers.get("x-wm-token") ?? "";
    if (!(expected && sameToken(given, expected))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const text = await request.text();
    if (text.length > 4_000_000) {
      return json({ ok: false, error: "too_large" }, 413);
    }
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(text);
    } catch {
      return json({ ok: false, error: "bad_json" }, 400);
    }
    const list = (k: string) => (Array.isArray(b[k]) ? (b[k] as never[]) : []);
    const company = typeof b.company === "string" ? b.company : "";
    const takenAt = Number(b.takenAt);
    if (!(company && Number.isFinite(takenAt))) {
      return json({ ok: false, error: "bad_snapshot" }, 400);
    }
    try {
      const result = await ctx.runMutation(internal.winemonitor.ingest, {
        company,
        takenAt,
        ms: Number(b.ms) || 0,
        node: b.node ?? null,
        dispensers: list("dispensers"),
        positions: list("positions"),
        wines: list("wines"),
        cards: list("cards"),
        sales: list("sales"),
        salesFrom: Number(b.salesFrom) || takenAt - 86_400_000,
        credits: list("credits"),
        changes: list("changes"),
      });
      return json({ ok: true, ...result });
    } catch (err) {
      return json(
        { ok: false, error: err instanceof Error ? err.message : "failed" },
        400
      );
    }
  }),
});

/* ------------------------------ POS read API ------------------------------ */
// GET /api/v1/{orders,daily,products,me} with "Authorization: Bearer <key>"
// (keys: POS → Configurações → API). Read-only; see convex/posapi.ts.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 3_600_000;
const MAX_RANGE = 93 * 24 * HOUR;

/** Last Sunday of a month at 01:00 UTC (EU summer time switch). */
function lastSunday(year: number, month: number) {
  const end = new Date(Date.UTC(year, month + 1, 0, 1));
  end.setUTCDate(end.getUTCDate() - end.getUTCDay());
  return end.getTime();
}

/** Malta's UTC offset in hours at a UTC instant (CET/CEST). */
function maltaOffset(ms: number) {
  const y = new Date(ms).getUTCFullYear();
  return ms >= lastSunday(y, 2) && ms < lastSunday(y, 9) ? 2 : 1;
}

/** "2026-11-08" → Malta midnight; anything else is parsed as a timestamp. */
function instant(value: string | null, endOfDay = false) {
  if (!value) {
    return null;
  }
  if (DAY.test(value)) {
    const [y = 0, m = 1, d = 1] = value.split("-").map(Number);
    const utc = Date.UTC(y, m - 1, d + (endOfDay ? 1 : 0));
    return utc - maltaOffset(utc) * HOUR;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const BEARER = /^Bearer\s+(\S+)$/i;

async function apiKey(ctx: ActionCtx, request: Request) {
  const key = BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!key || key.length > 200) {
    return null;
  }
  const found = await ctx.runQuery(internal.posapi.keyByHash, {
    hash: await sha256(key),
  });
  if (found && Date.now() - (found.lastUsedAt ?? 0) > 5 * 60_000) {
    await ctx.runMutation(internal.posapi.touchKey, { id: found.id });
  }
  return found;
}

function posRoute(
  path: string,
  run: (
    ctx: ActionCtx,
    company: string,
    params: URLSearchParams
  ) => Promise<Response>
) {
  http.route({
    path,
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const key = await apiKey(ctx, request);
      if (!key) {
        return json({ error: "unauthorized" }, 401);
      }
      return await run(ctx, key.company, new URL(request.url).searchParams);
    }),
  });
}

posRoute("/api/v1/me", async (_ctx, company) => json({ company }));

posRoute("/api/v1/orders", async (ctx, company, params) => {
  const from = instant(params.get("from"));
  const to = instant(params.get("to"), true);
  if (from === null || to === null || to <= from) {
    return json(
      { error: "from and to are required (YYYY-MM-DD or ISO 8601)" },
      400
    );
  }
  if (to - from > MAX_RANGE) {
    return json({ error: "range too long (max 93 days)" }, 400);
  }
  const body = await ctx.runQuery(internal.posapi.orders, {
    company,
    from,
    to,
  });
  return json({
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    ...body,
  });
});

posRoute("/api/v1/daily", async (ctx, company, params) => {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? from;
  if (!(DAY.test(from) && DAY.test(to)) || to < from) {
    return json({ error: "from and to are required (YYYY-MM-DD)" }, 400);
  }
  return json(await ctx.runQuery(internal.posapi.daily, { company, from, to }));
});

posRoute("/api/v1/products", async (ctx, company) =>
  json(await ctx.runQuery(internal.posapi.products, { company }))
);

/* --------------------------- contract signature --------------------------- */
// POST /hr/sign {token, name, signature, agree} from the public signing page
// (/assinar/?t=…, another origin); records the signer's IP and browser.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

http.route({
  path: "/hr/sign",
  method: "OPTIONS",
  handler: httpAction(
    async () => new Response(null, { status: 204, headers: CORS })
  ),
});

http.route({
  path: "/hr/sign",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, "content-type": "application/json" },
      });
    const raw = await request.text();
    if (raw.length > 300_000) {
      return reply({ error: "too large" }, 413);
    }
    let body: {
      token?: unknown;
      name?: unknown;
      signature?: unknown;
      agree?: unknown;
    };
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: "invalid body" }, 400);
    }
    if (
      body.agree !== true ||
      typeof body.token !== "string" ||
      typeof body.name !== "string" ||
      typeof body.signature !== "string"
    ) {
      return reply({ error: "Confirme que leu e aceita o contrato." }, 400);
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "";
    try {
      await ctx.runMutation(internal.contracts.signByToken, {
        token: body.token,
        name: body.name,
        signature: body.signature,
        ip,
        agent: request.headers.get("user-agent") ?? "",
      });
    } catch (err) {
      const msg =
        err instanceof ConvexError && typeof err.data === "string"
          ? err.data
          : "Não foi possível assinar.";
      return reply({ error: msg }, 400);
    }
    return reply({ ok: true });
  }),
});

/** Lightspeed K-Series OAuth redirect (convex/lightspeed.ts). */
http.route({
  path: "/lightspeed/callback",
  method: "GET",
  handler: lightspeedCallback,
});

/** Lightspeed order/payment confirmations (convex/lightspeedops.ts). */
http.route({
  path: "/lightspeed/webhook",
  method: "POST",
  handler: lightspeedWebhook,
});

export default http;
