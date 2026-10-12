import { httpRouter } from "convex/server";
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
import { internal } from "./_generated/api";
import { type ActionCtx, httpAction } from "./_generated/server";
import { syncArgs } from "./eatrade";

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

export default http;
