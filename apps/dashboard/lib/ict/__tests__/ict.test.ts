import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { alertReasons } from "../alerts";
import {
  ANALYSIS_SCHEMA,
  analyzePost,
  GrokError,
  parseAnalysis,
  pickModel,
} from "../grok";
import { DEFAULT_ALERT_RULES, type XPost } from "../types";
import {
  type FetchFn,
  fetchTimeline,
  idGreater,
  resolveUser,
  XApiError,
} from "../x-client";

const SOURCE_FILE = /\.(tsx?|jsx?)$/;
const SERVER_ENV = /process\.env\.(?!NEXT_PUBLIC_)/;
const KEY_LITERAL = /Bearer\s+[A-Za-z0-9%_-]{20,}|xai-[A-Za-z0-9]{20,}/;
const PANEL_CHECK = /requirePanel|isPanel/;
const PUBLIC_FN =
  /export const (\w+) = (query|mutation)\(\{[\s\S]*?handler: async \(ctx[^)]*\) => \{\n([\s\S]*?)\n/g;

/** Fake fetch: answers by URL substring, records every call. */
function mockFetch(
  routes: [string, (url: string) => Response][]
): FetchFn & { calls: string[] } {
  const calls: string[] = [];
  const fn = ((url: string) => {
    calls.push(url);
    const route = routes.find(([part]) => url.includes(part));
    if (!route) {
      return Promise.reject(new Error(`unexpected request ${url}`));
    }
    return Promise.resolve(route[1](url));
  }) as FetchFn & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const noSleep = { sleep: async () => undefined };

const tweet = (id: string, text = `post ${id}`) => ({
  id,
  text,
  author_id: "42",
  created_at: "2026-10-01T12:00:00.000Z",
});

const VALID = {
  language: "en",
  summary_pt: "Resumo",
  main_message: "Mensagem",
  category: "Liquidity",
  concepts: [{ name: "Fair Value Gap", explanation_pt: "Desequilíbrio" }],
  instruments: ["ES"],
  sessions: [],
  price_levels: [],
  events: [],
  relevance: "high",
  relevance_reason: "Conceito central",
  key_points: ["a"],
  facts: ["b"],
  interpretation: "c",
  uncertainties: [],
  insufficient_data: false,
};

describe("X API client", () => {
  it("resolves the username to the numeric user id", async () => {
    const f = mockFetch([
      [
        "/users/by/username/I_Am_The_ICT",
        () =>
          json({
            data: { id: "123456", name: "ICT", username: "I_Am_The_ICT" },
          }),
      ],
    ]);
    const user = await resolveUser("I_Am_The_ICT", "token", {
      fetch: f,
      ...noSleep,
    });
    assert.equal(user.id, "123456");
  });

  it("collects posts across pages, oldest first, without duplicates", async () => {
    const f = mockFetch([
      [
        "pagination_token=p2",
        () => json({ data: [tweet("98"), tweet("99")], meta: {} }),
      ],
      [
        "/users/123/tweets",
        () =>
          json({
            data: [tweet("101"), tweet("100"), tweet("99")],
            meta: { next_token: "p2" },
          }),
      ],
    ]);
    const r = await fetchTimeline("123", "I_Am_The_ICT", "t", {
      fetch: f,
      sinceId: "97",
      ...noSleep,
    });
    assert.deepEqual(
      r.posts.map((p) => p.postId),
      ["98", "99", "100", "101"]
    );
    assert.equal(r.newestId, "101");
    assert.equal(r.nextToken, null);
    assert.ok(f.calls[0]?.includes("since_id=97"));
  });

  it("keeps the full text of long posts and the original object", async () => {
    const long = {
      ...tweet("5", "short…"),
      note_tweet: { text: "the whole long post" },
    };
    const f = mockFetch([["/tweets", () => json({ data: [long] })]]);
    const r = await fetchTimeline("1", "I_Am_The_ICT", "t", {
      fetch: f,
      ...noSleep,
    });
    assert.equal(r.posts[0]?.text, "the whole long post");
    assert.deepEqual(JSON.parse(r.posts[0]?.raw ?? "{}"), long);
    assert.equal(r.posts[0]?.url, "https://x.com/I_Am_The_ICT/status/5");
  });

  it("returns a resume token when the gap is longer than maxPages", async () => {
    const f = mockFetch([
      [
        "/tweets",
        () => json({ data: [tweet("7")], meta: { next_token: "more" } }),
      ],
    ]);
    const r = await fetchTimeline("1", "u", "t", {
      fetch: f,
      maxPages: 1,
      ...noSleep,
    });
    assert.equal(r.nextToken, "more");
    const f2 = mockFetch([
      ["pagination_token=more", () => json({ data: [tweet("6")] })],
    ]);
    const r2 = await fetchTimeline("1", "u", "t", {
      fetch: f2,
      startToken: "more",
      ...noSleep,
    });
    assert.deepEqual(
      r2.posts.map((p) => p.postId),
      ["6"]
    );
  });

  it("reports rate limits with the reset time and does not retry them", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const f = mockFetch([
      ["/tweets", () => json({}, 429, { "x-rate-limit-reset": String(reset) })],
    ]);
    await assert.rejects(
      fetchTimeline("1", "u", "t", { fetch: f, ...noSleep }),
      (e: unknown) =>
        e instanceof XApiError &&
        e.kind === "rate_limit" &&
        e.resetAt === reset * 1000
    );
    assert.equal(f.calls.length, 1);
  });

  it("classifies authentication failures", async () => {
    const f = mockFetch([
      ["/users/by", () => json({ title: "Unauthorized" }, 401)],
    ]);
    await assert.rejects(
      resolveUser("x", "bad", { fetch: f, ...noSleep }),
      (e: unknown) => e instanceof XApiError && e.kind === "auth"
    );
  });

  it("retries temporary failures with backoff, then succeeds", async () => {
    let n = 0;
    const f = mockFetch([
      [
        "/users/by",
        () =>
          ++n < 3
            ? json({}, 503)
            : json({ data: { id: "9", name: "a", username: "a" } }),
      ],
    ]);
    const user = await resolveUser("a", "t", { fetch: f, ...noSleep });
    assert.equal(user.id, "9");
    assert.equal(f.calls.length, 3);
  });

  it("compares 64-bit post ids as strings", () => {
    assert.ok(idGreater("1846000000000000001", "1846000000000000000"));
    assert.ok(idGreater("10000000000000000000", "9999999999999999999"));
    assert.ok(!idGreater("5", "40"));
  });
});

const post: XPost = {
  postId: "1",
  authorId: "42",
  username: "I_Am_The_ICT",
  text: "Look for the FVG after the London open",
  createdAt: Date.parse("2026-10-01T12:00:00Z"),
  url: "https://x.com/I_Am_The_ICT/status/1",
  references: [],
  media: [],
  urls: [],
  raw: "{}",
};

describe("Grok analysis", () => {
  it("accepts a valid structured reply", () => {
    const r = parseAnalysis(JSON.stringify(VALID));
    assert.equal(r.category, "Liquidity");
    assert.equal(r.relevance, "high");
    assert.equal(r.concepts[0]?.name, "Fair Value Gap");
  });

  it("maps unknown categories to Other", () => {
    assert.equal(
      parseAnalysis(JSON.stringify({ ...VALID, category: "Crypto" })).category,
      "Other"
    );
  });

  it("rejects invalid JSON and wrong fields as retryable errors", () => {
    for (const bad of [
      "not json",
      JSON.stringify({ ...VALID, relevance: "huge" }),
      JSON.stringify({ ...VALID, instruments: "ES" }),
      JSON.stringify({ ...VALID, summary_pt: "" }),
    ]) {
      assert.throws(
        () => parseAnalysis(bad),
        (e: unknown) => e instanceof GrokError && e.retryable
      );
    }
  });

  it("sends the post with the JSON schema and parses the answer", async () => {
    let body: Record<string, unknown> = {};
    const f = ((_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Promise.resolve(
        json({
          model: "grok-x",
          choices: [{ message: { content: JSON.stringify(VALID) } }],
        })
      );
    }) as FetchFn;
    const out = await analyzePost(post, "key", "grok-x", f);
    assert.equal(out.model, "grok-x");
    assert.equal(out.result.summary_pt, "Resumo");
    const format = body.response_format as { json_schema: { schema: unknown } };
    assert.deepEqual(format.json_schema.schema, ANALYSIS_SCHEMA);
    const messages = body.messages as { content: string }[];
    assert.ok(messages[1]?.content.includes(post.text));
  });

  it("marks rate limits and outages as retryable, bad keys as final", async () => {
    const reply = (status: number) =>
      (() => Promise.resolve(json({ error: "x" }, status))) as FetchFn;
    await assert.rejects(
      analyzePost(post, "k", "m", reply(429)),
      (e: unknown) => e instanceof GrokError && e.retryable
    );
    await assert.rejects(
      analyzePost(post, "k", "m", reply(500)),
      (e: unknown) => e instanceof GrokError && e.retryable
    );
    await assert.rejects(
      analyzePost(post, "k", "m", reply(401)),
      (e: unknown) => e instanceof GrokError && !e.retryable
    );
  });

  it("picks a Grok model the key actually has", () => {
    assert.equal(
      pickModel(["grok-2-image", "grok-3-mini", "grok-3"]),
      "grok-3"
    );
    assert.equal(pickModel(["grok-2-vision", "grok-2-1212"]), "grok-2-1212");
    assert.equal(pickModel(["other"]), null);
    assert.equal(pickModel(["grok-3"], "grok-custom"), "grok-custom");
  });
});

describe("alerts", () => {
  it("fires on keywords before analysis and on relevance after it", () => {
    const rules = {
      ...DEFAULT_ALERT_RULES,
      keywords: ["london"],
      minRelevance: "high" as const,
    };
    assert.deepEqual(alertReasons(rules, { text: "London open" }), [
      "Palavra-chave: london",
    ]);
    const after = alertReasons(rules, {
      text: "London open",
      analysis: { category: "Liquidity", relevance: "high", concepts: ["FVG"] },
    });
    assert.ok(after.includes("Relevância high"));
  });

  it("matches categories and concepts, and stays quiet otherwise", () => {
    const rules = {
      ...DEFAULT_ALERT_RULES,
      minRelevance: null,
      categories: ["Liquidity"],
      concepts: ["fair value"],
    };
    const analysis = {
      category: "Liquidity",
      relevance: "low" as const,
      concepts: ["Fair Value Gap"],
    };
    assert.equal(alertReasons(rules, { text: "", analysis }).length, 2);
    assert.equal(
      alertReasons(
        { ...rules, categories: [], concepts: [] },
        { text: "", analysis }
      ).length,
      0
    );
  });
});

describe("security", () => {
  it("keeps API keys out of browser code", () => {
    const root = join(import.meta.dirname, "../../..");
    const browserDirs = ["components/pages/ict", "app/ict"].map((d) =>
      join(root, d)
    );
    for (const dir of browserDirs) {
      for (const file of readdirSync(dir, { recursive: true }) as string[]) {
        if (!SOURCE_FILE.test(file)) {
          continue;
        }
        const src = readFileSync(join(dir, file), "utf8");
        // Naming the variables in help text is fine; reading them is not
        assert.ok(!SERVER_ENV.test(src), `${file} reads a server env var`);
        assert.ok(!KEY_LITERAL.test(src), `${file} has a key`);
      }
    }
  });

  it("protects every public Convex function with the panel token", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../../../convex/ict.ts"),
      "utf8"
    );
    const publicFns = [...src.matchAll(PUBLIC_FN)];
    assert.ok(publicFns.length >= 8);
    for (const [, name, , firstLine] of publicFns) {
      assert.ok(PANEL_CHECK.test(firstLine ?? ""), `${name} is not protected`);
    }
  });
});
