import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };
const router = { subject: "ai-router", issuer: "https://panel.test" };

const product = (id: string, extra: object = {}) => ({
  id,
  name: id,
  category: "Cervejas",
  price: 5,
  color: "#000",
  available: true,
  ...extra,
});

async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(internal.pos.importMenu, {
    company: "bar",
    currency: "EUR",
    profile: { name: "Bar", color: "#000" },
    products: [
      product("ipa", { subcategory: "IPA" }),
      product("lager"),
      product("chips", { category: "Petiscos" }),
    ],
  });
  return { t, session: token };
}

describe("categories", () => {
  it("builds the tree and renames on every item", async () => {
    const { t, session } = await setup();
    await t.mutation(api.categories.save, { session, company: "bar", name: "Lager", parent: "Cervejas" });
    let tree = await t.query(api.categories.tree, { session, company: "bar" });
    expect(tree?.map((c) => c.name)).toEqual(["Cervejas", "Petiscos"]);
    expect(tree?.[0]?.subs.map((s) => s.name)).toEqual(["Lager", "IPA"]);

    await t.mutation(api.categories.save, { session, company: "bar", from: "Cervejas", name: "Beers" });
    tree = await t.query(api.categories.tree, { session, company: "bar" });
    expect(tree?.[0]?.name).toBe("Beers");
    expect(tree?.[0]?.count).toBe(2);
    expect(tree?.[0]?.subs.map((s) => s.name)).toContain("Lager");
  });

  it("deletes a category only after choosing where its items go", async () => {
    const { t, session } = await setup();
    await expect(
      t.mutation(api.categories.remove, { session, company: "bar", name: "Petiscos" })
    ).rejects.toThrow();
    await t.mutation(api.categories.remove, { session, company: "bar", name: "Petiscos", moveTo: "Cervejas" });
    const tree = await t.query(api.categories.tree, { session, company: "bar" });
    expect(tree?.map((c) => [c.name, c.count])).toEqual([["Cervejas", 3]]);
  });

  it("removes a subcategory and keeps its items in the category", async () => {
    const { t, session } = await setup();
    await t.mutation(api.categories.remove, { session, company: "bar", name: "IPA", parent: "Cervejas" });
    const tree = await t.query(api.categories.tree, { session, company: "bar" });
    expect(tree?.[0]?.subs).toEqual([]);
    expect(tree?.[0]?.count).toBe(2);
  });
});

describe("AI router storage", () => {
  it("is closed to browsers (panel tokens) and open to the server", async () => {
    const t = convexTest(schema, modules);
    await expect(t.withIdentity(panel).query(api.ai.config, {})).rejects.toThrow();
    const cfg = await t.withIdentity(router).query(api.ai.config, {});
    expect(cfg.providers).toEqual([]);
  });

  it("de-duplicates requests: same id or same image is not called twice", async () => {
    const t = convexTest(schema, modules).withIdentity(router);
    const first = await t.mutation(api.ai.claim, { requestId: "r1", hash: "h", task: "x", dedupeMs: 60_000 });
    expect(first.state).toBe("new");
    // Double tap while running
    expect((await t.mutation(api.ai.claim, { requestId: "r1", hash: "h", task: "x", dedupeMs: 60_000 })).state).toBe("running");
    await t.mutation(api.ai.finish, {
      requestId: "r1",
      ok: true,
      provider: "openai",
      model: "m",
      attempts: [{ provider: "openai", model: "m", ok: true, ms: 10 }],
      result: "{}",
    });
    // Same photo, new request: served from the log
    const again = await t.mutation(api.ai.claim, { requestId: "r2", hash: "h", task: "x", dedupeMs: 60_000 });
    expect(again.state).toBe("done");
  });
});
