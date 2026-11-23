import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

/** Admin, group "grupo" with bars a and b, a gin item and a product in each bar. */
async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(api.inv.saveGroup, {
    session: token,
    key: "grupo",
    name: "Grupo",
    companies: ["a", "b"],
  });
  const itemId = await t.mutation(api.inv.saveItem, {
    session: token,
    company: "a",
    name: "Gin Tanqueray",
    category: "spirits",
    unit: "ml",
    size: 700,
    container: "garrafa",
    barcodes: [],
  });
  await t.run(async (ctx) => {
    for (const [company, cid, name] of [
      ["a", "a-gin", "Gin Tanqueray"],
      ["b", "b-gin", "GIN TANQUERAY"],
      ["a", "a-vodka", "Vodka Absolut"],
    ]) {
      await ctx.db.insert("posProducts", {
        cid: cid as string,
        name: name as string,
        category: "Gin",
        price: 8,
        color: "#000",
        available: true,
        company,
        updatedAt: 0,
      });
    }
  });
  return { t, token, itemId: itemId as Id<"invItems"> };
}

type T = Awaited<ReturnType<typeof setup>>["t"];

const store = (t: T, type = "image/webp") =>
  t.run((ctx) => ctx.storage.store(new Blob(["x"], { type })));

const product = (t: T, cid: string) =>
  t.run((ctx) =>
    ctx.db
      .query("posProducts")
      .withIndex("by_cid", (q) => q.eq("cid", cid))
      .unique()
  );

describe("product photos and logos", () => {
  it("goes on the same-name products of every bar and the stock item", async () => {
    const { t, token, itemId } = await setup();
    const file = await store(t);
    const r = await t.mutation(api.media.attach, {
      session: token,
      company: "a",
      target: "product",
      id: "a-gin",
      kind: "image",
      storageId: file,
    });
    expect(r).toMatchObject({ products: 2, items: 1 });
    expect(r.url).toBeTruthy();
    expect((await product(t, "b-gin"))?.image).toBe(r.url);
    expect((await product(t, "a-vodka"))?.image).toBeUndefined();
    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item?.imageId).toBe(file);
    // The item screen shows it too
    const o = await t.query(api.inv.overview, { session: token, company: "a" });
    expect(o.items.find((i) => i._id === itemId)?.image).toBe(r.url);
  });

  it("replaces and removes, deleting files nobody uses", async () => {
    const { t, token, itemId } = await setup();
    const first = await store(t, "image/png");
    await t.mutation(api.media.attach, {
      session: token,
      company: "a",
      target: "item",
      id: itemId,
      kind: "logo",
      storageId: first,
    });
    expect((await product(t, "a-gin"))?.logoId).toBe(first);
    const second = await store(t, "image/png");
    await t.mutation(api.media.attach, {
      session: token,
      company: "b",
      target: "product",
      id: "b-gin",
      kind: "logo",
      storageId: second,
    });
    expect((await product(t, "a-gin"))?.logoId).toBe(second);
    expect(await t.run((ctx) => ctx.storage.getUrl(first))).toBeNull();
    await t.mutation(api.media.attach, {
      session: token,
      company: "a",
      target: "product",
      id: "a-gin",
      kind: "logo",
    });
    expect((await product(t, "b-gin"))?.logo).toBeUndefined();
    expect(await t.run((ctx) => ctx.storage.getUrl(second))).toBeNull();
  });

  it("only POS staff may upload", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(api.media.uploadUrl, { company: "a" })
    ).rejects.toThrow();
  });
});
