import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { conform, GroqError, groqJson } from "../groq-json";

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    total: { anyOf: [{ type: "number" }, { type: "null" }] },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, qty: { type: "number" } },
      },
    },
  },
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(replies: { status: number; body: unknown }[]) {
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = ((_url: unknown, init?: { body?: string }) => {
    calls.push(JSON.parse(init?.body ?? "{}"));
    const r = replies.shift() ?? { status: 500, body: {} };
    return Promise.resolve(
      new Response(JSON.stringify(r.body), { status: r.status })
    );
  }) as typeof fetch;
  return calls;
}

const formatOf = (call?: Record<string, unknown>) =>
  (call?.response_format as { type?: string } | undefined)?.type;

const ok = (content: unknown) => ({
  status: 200,
  body: {
    choices: [
      { message: { content: JSON.stringify(content) }, finish_reason: "stop" },
    ],
  },
});

describe("Groq fallback for structured reading", () => {
  it("fills the reply to the schema", () => {
    assert.deepEqual(
      conform(SCHEMA, { title: 3, lines: [{ name: "x", qty: "2", extra: 1 }] }),
      { title: "3", total: null, lines: [{ name: "x", qty: 2 }] }
    );
  });

  it("asks for page images instead of PDFs", async () => {
    process.env.GROQ_API_KEY = "k";
    await assert.rejects(
      groqJson([{ data: "x", mimeType: "application/pdf" }], "p", SCHEMA),
      (e: unknown) => e instanceof GroqError && e.code === "needs_images"
    );
  });

  it("uses a vision model, falls back to JSON mode and to the next model", async () => {
    process.env.GROQ_API_KEY = "k";
    const calls = mockFetch([
      {
        status: 400,
        body: {
          error: { message: "response_format json_schema not supported" },
        },
      },
      { status: 429, body: { error: { message: "rate limit" } } },
      ok({ title: "Nota", total: "12.5", lines: [] }),
    ]);
    const out = await groqJson<{ title: string; total: number }>(
      [{ data: "abc", mimeType: "image/jpeg" }],
      "read",
      SCHEMA
    );
    assert.equal(out.title, "Nota");
    assert.equal(out.total, 12.5);
    assert.equal(calls.length, 3);
    assert.equal(formatOf(calls[0]), "json_schema");
    assert.equal(formatOf(calls[1]), "json_object");
    assert.notEqual(calls[2]?.model, calls[0]?.model);
    const messages = calls[0]?.messages as
      | { content: { type: string }[] }[]
      | undefined;
    const content = messages?.[0]?.content;
    assert.equal(content?.[0]?.type, "image_url");
  });

  it("uses a text model when there are no files", async () => {
    process.env.GROQ_API_KEY = "k";
    const calls = mockFetch([ok({ title: "ok" })]);
    await groqJson([], "edit", SCHEMA);
    assert.equal(calls[0]?.model, "openai/gpt-oss-120b");
  });
});
