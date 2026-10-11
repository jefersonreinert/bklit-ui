import { httpRouter } from "convex/server";
import {
  dealsFromBody,
  MAX_BODY,
  parseSignal,
  sameToken,
} from "../lib/journal/ingest";
import { internal } from "./_generated/api";
import { type ActionCtx, httpAction } from "./_generated/server";

/**
 * Always-on webhooks of the trading journal (https://<deployment>.convex.site):
 *
 * - POST /journal/mt5?token=…          deals from the CasaBrasaJournal EA
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

http.route({
  path: "/journal/mt5",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(ctx, request))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    let body: unknown;
    try {
      body = JSON.parse(await readText(request));
    } catch (err) {
      const big = err instanceof Error && err.message === "too_large";
      return json(
        { ok: false, error: big ? "too_large" : "bad_json" },
        big ? 413 : 400
      );
    }
    const deals = dealsFromBody(body);
    const b = (body ?? {}) as Record<string, unknown>;
    const login =
      typeof b.account === "string" || typeof b.account === "number"
        ? String(b.account)
        : "";
    const added = await ctx.runMutation(internal.journal.ingestDeals, {
      deals,
      account: login
        ? {
            login,
            server: String(b.server ?? "").slice(0, 80),
            name: String(b.name ?? b.broker ?? "").slice(0, 80),
          }
        : undefined,
    });
    return json({ ok: true, received: deals.length, added });
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
