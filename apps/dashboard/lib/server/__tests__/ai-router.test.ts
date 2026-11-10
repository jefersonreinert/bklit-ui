import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ROUTER } from "../../ai/providers-meta";
import { parseRecognition } from "../ai/recognize";
import { cooldownFor, type RouterProvider, route } from "../ai/router";
import { AiError, classifyHttp } from "../ai/types";

const providers = (over: Partial<Record<string, Partial<RouterProvider>>> = {}) =>
  (["openai", "anthropic", "xai"] as const).map((id) => ({
    id,
    enabled: true,
    model: `${id}-model`,
    key: `${id}-key`,
    ...over[id],
  }));

function fake(results: Record<string, AiError | string>) {
  const calls: string[] = [];
  const run = async (p: RouterProvider) => {
    calls.push(p.id);
    const r = results[p.id];
    if (r instanceof AiError) {
      throw r;
    }
    return r ?? "ok";
  };
  return { calls, run };
}

describe("AI fallback router", () => {
  it("uses the primary when it works", async () => {
    const f = fake({ openai: "A" });
    const out = await route(providers(), DEFAULT_ROUTER, f.run);
    assert.equal(out.ok && out.provider, "openai");
    assert.deepEqual(f.calls, ["openai"]);
  });

  it("falls back on credits, then on rate limit, in priority order", async () => {
    const f = fake({
      openai: new AiError("credits", "no credit"),
      anthropic: new AiError("rate_limit", "429"),
      xai: "G",
    });
    const out = await route(providers(), DEFAULT_ROUTER, f.run);
    assert.ok(out.ok);
    assert.equal(out.provider, "xai");
    assert.deepEqual(f.calls, ["openai", "anthropic", "xai"]);
    assert.deepEqual(
      out.attempts.map((a) => [a.provider, a.ok, a.kind]),
      [
        ["openai", false, "credits"],
        ["anthropic", false, "rate_limit"],
        ["xai", true, undefined],
      ]
    );
  });

  it("follows the configured order", async () => {
    const f = fake({});
    await route(providers(), { ...DEFAULT_ROUTER, order: ["xai", "openai", "anthropic"] }, f.run);
    assert.deepEqual(f.calls, ["xai"]);
  });

  it("does not fall back after a timeout (it may have been billed)", async () => {
    const f = fake({ openai: new AiError("timeout", "slow") });
    const out = await route(providers(), DEFAULT_ROUTER, f.run);
    assert.equal(out.ok, false);
    assert.deepEqual(f.calls, ["openai"]);
  });

  it("falls back after a timeout only when allowed", async () => {
    const f = fake({ openai: new AiError("timeout", "slow") });
    const out = await route(providers(), { ...DEFAULT_ROUTER, allowAmbiguous: true, fallbackOn: [...DEFAULT_ROUTER.fallbackOn, "timeout"] }, f.run);
    assert.ok(out.ok);
    assert.deepEqual(f.calls, ["openai", "anthropic"]);
  });

  it("stops on errors not in the trigger list (bad request)", async () => {
    const f = fake({ openai: new AiError("bad_request", "bad image") });
    const out = await route(providers(), DEFAULT_ROUTER, f.run);
    assert.equal(!out.ok && out.kind, "bad_request");
    assert.deepEqual(f.calls, ["openai"]);
  });

  it("with fallback off uses only the primary, even if it is unavailable", async () => {
    const f = fake({ openai: new AiError("unavailable", "503") });
    const off = { ...DEFAULT_ROUTER, fallbackEnabled: false };
    await route(providers(), off, f.run);
    assert.deepEqual(f.calls, ["openai"]);
    const g = fake({});
    const out = await route(providers({ openai: { key: null } }), off, g.run);
    assert.equal(out.ok, false);
    assert.deepEqual(g.calls, []);
  });

  it("skips providers without key, disabled or cooling down — without calling them", async () => {
    const f = fake({});
    const out = await route(
      providers({
        openai: { key: null },
        anthropic: { cooldownUntil: 2000 },
        xai: {},
      }),
      DEFAULT_ROUTER,
      f.run,
      { now: () => 1000 }
    );
    assert.ok(out.ok);
    assert.deepEqual(f.calls, ["xai"]);
    assert.deepEqual(out.attempts.map((a) => a.skipped ?? "called"), [
      "sem chave",
      "em pausa após erro recente",
      "called",
    ]);
  });

  it("calls each provider at most once and ends when all fail", async () => {
    const f = fake({
      openai: new AiError("unavailable", "x"),
      anthropic: new AiError("unavailable", "y"),
      xai: new AiError("unavailable", "z"),
    });
    const out = await route(providers(), DEFAULT_ROUTER, f.run);
    assert.equal(out.ok, false);
    assert.deepEqual(f.calls, ["openai", "anthropic", "xai"]);
  });

  it("explains when nothing is configured", async () => {
    const out = await route(providers({ openai: { enabled: false }, anthropic: { enabled: false }, xai: { enabled: false } }), DEFAULT_ROUTER, fake({}).run);
    assert.equal(!out.ok && out.kind, "not_configured");
  });

  it("cools providers down by error kind", () => {
    assert.equal(cooldownFor(new AiError("credits", "")), 30 * 60_000);
    assert.equal(cooldownFor(new AiError("rate_limit", "", { retryAfterMs: 20_000 })), 20_000);
    assert.equal(cooldownFor(new AiError("bad_request", "")), 0);
  });
});

describe("HTTP error classification", () => {
  it("tells credits, auth, rate limit and outages apart", () => {
    assert.equal(classifyHttp(429, "You exceeded your current quota", "insufficient_quota"), "credits");
    assert.equal(classifyHttp(429, "Rate limit reached"), "rate_limit");
    assert.equal(classifyHttp(400, "Your credit balance is too low to access the Anthropic API"), "credits");
    assert.equal(classifyHttp(402, "Payment required"), "credits");
    assert.equal(classifyHttp(401, "invalid x-api-key"), "auth");
    assert.equal(classifyHttp(400, "Incorrect API key provided"), "auth");
    assert.equal(classifyHttp(403, "Your team doesn't have any credits"), "credits");
    assert.equal(classifyHttp(404, "model: foo"), "model");
    assert.equal(classifyHttp(529, "Overloaded", "overloaded_error"), "unavailable");
    assert.equal(classifyHttp(503, "Service Unavailable"), "unavailable");
    assert.equal(classifyHttp(400, "Image too large"), "bad_request");
  });
});

describe("recognition parsing", () => {
  it("reads JSON wrapped in prose and cleans fields", () => {
    const r = parseRecognition(
      'Here: {"name":"Heineken 330 ml","brand":"Heineken","category":"Cervejas","subcategory":null,"barcode":"8 712000 900045","size":"330 ml","description":"Lager","confidence":0.92} ok'
    );
    assert.equal(r?.name, "Heineken 330 ml");
    assert.equal(r?.barcode, "8712000900045");
    assert.equal(r?.subcategory, null);
    assert.equal(r?.confidence, 0.92);
  });

  it("rejects answers without JSON", () => {
    assert.equal(parseRecognition("I cannot see a product."), null);
  });
});
