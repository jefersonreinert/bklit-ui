import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const tweet = (id: string, text = `post ${id}`) => ({
  id,
  text,
  author_id: "77",
  created_at: new Date(Date.now() - 60_000).toISOString(),
});

const ANALYSIS = {
  language: "en",
  summary_pt: "Resumo em português",
  main_message: "Mensagem",
  category: "Liquidity",
  concepts: [{ name: "Fair Value Gap", explanation_pt: "Desequilíbrio" }],
  instruments: [],
  sessions: [],
  price_levels: [],
  events: [],
  relevance: "high",
  relevance_reason: "x",
  key_points: [],
  facts: [],
  interpretation: "",
  uncertainties: [],
  insufficient_data: false,
};

/** Fake X + xAI APIs; `timeline` decides what the next timeline call returns. */
function apis(timeline: (url: string) => Response, grok?: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/users/by/username/")) {
      return json({
        data: { id: "77", name: "ICT", username: "I_Am_The_ICT" },
      });
    }
    if (url.includes("/users/77/tweets")) {
      return timeline(url);
    }
    if (url.includes("api.x.ai/v1/chat/completions")) {
      return (
        grok?.() ??
        json({
          model: "grok-test",
          choices: [{ message: { content: JSON.stringify(ANALYSIS) } }],
        })
      );
    }
    throw new Error(`unexpected ${url}`);
  });
  return calls;
}

const panel = { subject: "panel", issuer: "test" };

beforeEach(() => {
  vi.useFakeTimers();
  process.env.X_BEARER_TOKEN = "test-bearer";
  process.env.XAI_API_KEY = "test-xai";
  process.env.XAI_MODEL = "grok-test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const name of ["X_BEARER_TOKEN", "XAI_API_KEY", "XAI_MODEL"]) {
    Reflect.deleteProperty(process.env, name);
  }
});

async function overview(t: ReturnType<typeof convexTest>) {
  const o = await t.withIdentity(panel).query(api.ict.overview, {});
  if (!o) {
    throw new Error("no overview");
  }
  return o;
}

describe("ICT monitor backend", () => {
  it("collects, stores and analyses new posts, and the feed shows them", async () => {
    const t = convexTest(schema, modules);
    const calls = apis(() =>
      json({ data: [tweet("102"), tweet("101")], meta: {} })
    );
    await t.action(internal.ict.tick, { force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const o = await overview(t);
    expect(o.counts.total).toBe(2);
    expect(o.counts.unanalyzed).toBe(0);
    expect(o.state?.status).toBe("idle");
    expect(o.latest?.postId).toBe("102");
    expect(o.latest?.analysis.result?.summary_pt).toBe("Resumo em português");
    expect(calls.filter((c) => c.includes("/users/by/username/")).length).toBe(
      1
    );

    const feed = await t
      .withIdentity(panel)
      .query(api.ict.feed, { paginationOpts: { numItems: 10, cursor: null } });
    expect(feed.page.map((p) => p.postId)).toEqual(["102", "101"]);
    // Original text untouched and separate from the analysis
    expect(feed.page[0]?.text).toBe("post 102");
  });

  it("never stores the same post twice and resumes from since_id", async () => {
    const t = convexTest(schema, modules);
    const calls = apis(() => json({ data: [tweet("201"), tweet("200")] }));
    await t.action(internal.ict.tick, { force: true });
    await t.action(internal.ict.tick, { force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const o = await overview(t);
    expect(o.counts.total).toBe(2);
    const second = calls.filter((c) => c.includes("/tweets"))[1];
    expect(second).toContain("since_id=201");
  });

  it("continues an interrupted pagination on the next run before moving the cursor", async () => {
    const t = convexTest(schema, modules);
    // First run: history
    apis(() => json({ data: [tweet("300")] }));
    await t.action(internal.ict.tick, { force: true });
    // Long gap: 5 full pages, then more
    let page = 0;
    const calls = apis((url) => {
      if (url.includes("pagination_token=resume")) {
        return json({ data: [tweet("301")] });
      }
      page++;
      return json({
        data: [tweet(String(400 - page))],
        meta: { next_token: page >= 5 ? "resume" : `p${page}` },
      });
    });
    await t.action(internal.ict.tick, { force: true });
    await t.action(internal.ict.tick, { force: true });
    const last = calls.filter((c) => c.includes("/tweets")).at(-1) ?? "";
    expect(last).toContain("pagination_token=resume");
    expect(last).toContain("since_id=300");
    await t.action(internal.ict.tick, { force: true });
    const after = calls.filter((c) => c.includes("/tweets")).at(-1) ?? "";
    expect(after).toContain("since_id=399");
  });

  it("records rate limits and waits for the reset before calling again", async () => {
    const t = convexTest(schema, modules);
    const reset = Math.floor(Date.now() / 1000) + 900;
    const calls = apis(() =>
      json({}, 429, { "x-rate-limit-reset": String(reset) })
    );
    await t.action(internal.ict.tick, { force: true });
    const o = await overview(t);
    expect(o.state?.status).toBe("rate_limited");
    expect(o.state?.nextAllowedAt).toBe(reset * 1000);
    const before = calls.length;
    await t.action(internal.ict.tick, {}); // cron run: not allowed yet
    expect(calls.length).toBe(before);
  });

  it("reports authentication errors without pretending to be operational", async () => {
    const t = convexTest(schema, modules);
    vi.stubGlobal("fetch", () =>
      Promise.resolve(json({ title: "Unauthorized" }, 401))
    );
    await t.action(internal.ict.tick, { force: true });
    const o = await overview(t);
    expect(o.state?.status).toBe("auth_error");
    expect(o.state?.lastSuccessAt).toBeNull();
    const d = await t.withIdentity(panel).query(api.ict.diagnostics, {});
    expect(d?.x).toBe("auth_error");
    expect(JSON.stringify(d)).not.toContain("test-bearer");
  });

  it("keeps the post when the Grok analysis fails or is invalid", async () => {
    const t = convexTest(schema, modules);
    apis(
      () => json({ data: [tweet("500")] }),
      () => json({ choices: [{ message: { content: "not json" } }] })
    );
    await t.action(internal.ict.tick, { force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const o = await overview(t);
    expect(o.counts.total).toBe(1);
    expect(o.counts.failed).toBe(1);
    expect(o.latest?.text).toBe("post 500");
    expect(o.latest?.analysis.result).toBeNull();
  });

  it("does not call Grok when AI is off or nothing is new", async () => {
    const t = convexTest(schema, modules);
    const calls = apis(() => json({ meta: { result_count: 0 } }));
    await t
      .withIdentity(panel)
      .mutation(api.ict.updateSettings, { aiEnabled: false });
    await t.action(internal.ict.tick, { force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.some((c) => c.includes("api.x.ai"))).toBe(false);
  });

  it("searches the original text and the AI summary, and filters by category", async () => {
    const t = convexTest(schema, modules);
    apis(() => json({ data: [tweet("600", "Watch the London killzone")] }));
    await t.action(internal.ict.tick, { force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const q = t.withIdentity(panel);
    expect((await q.query(api.ict.search, { text: "killzone" })).length).toBe(
      1
    );
    expect((await q.query(api.ict.search, { text: "português" })).length).toBe(
      1
    );
    const byCat = await q.query(api.ict.feed, {
      paginationOpts: { numItems: 10, cursor: null },
      category: "Liquidity",
    });
    expect(byCat.page.length).toBe(1);
    const other = await q.query(api.ict.feed, {
      paginationOpts: { numItems: 10, cursor: null },
      category: "Announcement",
    });
    expect(other.page.length).toBe(0);
  });

  it("raises one alert per post from the configured rules", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(panel).mutation(api.ict.updateSettings, {
      alertRules: {
        newPost: true,
        categories: ["Liquidity"],
        keywords: [],
        concepts: [],
        minRelevance: "high",
      },
    });
    apis(() => json({ data: [tweet("700")] }));
    await t.action(internal.ict.tick, { force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const o = await overview(t);
    expect(o.alerts.length).toBe(1);
    expect(o.alerts[0]?.reasons).toEqual(
      expect.arrayContaining([
        "Nova publicação",
        "Categoria: Liquidity",
        "Relevância high",
      ])
    );
  });

  it("rejects every panel function without the access token", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.ict.overview, {})).toBeNull();
    await expect(
      t.query(api.ict.feed, { paginationOpts: { numItems: 5, cursor: null } })
    ).rejects.toThrow("Unauthenticated");
    await expect(
      t.mutation(api.ict.updateSettings, { enabled: false })
    ).rejects.toThrow();
    await expect(t.mutation(api.ict.syncNow, {})).rejects.toThrow();
    await expect(
      t.mutation(api.ict.reanalyze, { postId: "1" })
    ).rejects.toThrow();
  });

  it("uses keys saved in the panel and never returns them", async () => {
    for (const name of ["X_BEARER_TOKEN", "XAI_API_KEY", "XAI_MODEL"]) {
      Reflect.deleteProperty(process.env, name);
    }
    const t = convexTest(schema, modules);
    const before = await overview(t);
    expect(before.configured.x).toBe(false);
    const calls = apis(() => json({ data: [tweet("800")] }));
    const r = await t.withIdentity(panel).action(api.ict.saveKeys, {
      xBearer: " panel-bearer-1234 \n",
      xaiKey: "xai-panelkey-9876",
      xaiModel: "grok-test",
    });
    expect(r.ok).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const o = await overview(t);
    expect(o.configured).toMatchObject({
      x: true,
      grok: true,
      xSource: "panel",
      xHint: "…1234",
    });
    expect(JSON.stringify(o)).not.toContain("panel-bearer");
    expect(JSON.stringify(o)).not.toContain("xai-panelkey");
    expect(o.counts.total).toBe(1);
    expect(o.counts.unanalyzed).toBe(0);
    expect(calls.some((c) => c.includes("/tweets"))).toBe(true);
  });

  it("exchanges an X API key and secret for a bearer token", async () => {
    for (const name of ["X_BEARER_TOKEN", "XAI_API_KEY"]) {
      Reflect.deleteProperty(process.env, name);
    }
    const t = convexTest(schema, modules);
    vi.stubGlobal("fetch", (input: string | URL) =>
      String(input).includes("oauth2/token")
        ? Promise.resolve(
            json({ token_type: "bearer", access_token: "from-keys-abcd" })
          )
        : Promise.resolve(json({ data: [] }))
    );
    const r = await t.withIdentity(panel).action(api.ict.saveKeys, {
      xApiKey: "key",
      xApiSecret: "secret",
    });
    expect(r.ok).toBe(true);
    expect((await overview(t)).configured.xHint).toBe("…abcd");
  });

  it("refuses key changes and tests without the panel token", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.ict.saveKeys, { xBearer: "x" })
    ).rejects.toThrow();
    await expect(t.action(api.ict.testKeys, {})).rejects.toThrow();
  });

  it("pauses collection when monitoring is turned off", async () => {
    const t = convexTest(schema, modules);
    const calls = apis(() => json({ data: [] }));
    await t
      .withIdentity(panel)
      .mutation(api.ict.updateSettings, { enabled: false });
    await t.action(internal.ict.tick, {});
    expect(calls.length).toBe(0);
    expect((await overview(t)).state?.status).toBe("paused");
  });
});
