import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("removes the background with the rembg service", async () => {
    const { t, token } = await setup();
    const photo = await store(t, "image/jpeg");
    await t.mutation(api.media.attach, {
      session: token,
      company: "a",
      target: "product",
      id: "a-gin",
      kind: "image",
      storageId: photo,
    });
    process.env.REMBG_URL = "https://rembg.test/remove";
    process.env.REMBG_KEY = "k";
    const calls: { url: string; key: string | null }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push({ url, key: new Headers(init.headers).get("X-Key") });
      return Promise.resolve(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        })
      );
    });
    const r = await t.action(api.media.removeBackground, {
      session: token,
      company: "a",
      target: "product",
      id: "a-gin",
      kind: "image",
    });
    expect(calls).toEqual([{ url: "https://rembg.test/remove", key: "k" }]);
    const p = await product(t, "b-gin");
    expect(p?.image).toBe(r.url);
    expect(p?.imageId).not.toBe(photo);
    // The original photo is no longer used: deleted
    expect(await t.run((ctx) => ctx.storage.getUrl(photo))).toBeNull();
    // No photo yet: nothing to clean
    await expect(
      t.action(api.media.removeBackground, {
        session: token,
        company: "a",
        target: "product",
        id: "a-vodka",
        kind: "image",
      })
    ).rejects.toThrow("primeiro");
  });

  it("keeps one alcohol % per bottle across item and products", async () => {
    const { t, token, itemId } = await setup();
    const cur = await product(t, "a-gin");
    if (!cur) {
      return;
    }
    const { _id, _creationTime, cid, company, updatedAt, ...rest } = cur;
    await t.mutation(api.pos.saveProduct, {
      session: token,
      company: "a",
      product: { ...rest, id: cid, abv: 43.1 },
    });
    expect((await product(t, "b-gin"))?.abv).toBe(43.1);
    expect((await t.run((ctx) => ctx.db.get(itemId)))?.abv).toBe(43.1);
    expect((await product(t, "a-vodka"))?.abv).toBeUndefined();
    // Saving without abv keeps it; 0 clears it everywhere
    await t.mutation(api.pos.saveProduct, {
      session: token,
      company: "a",
      product: { ...rest, id: cid, price: 9 },
    });
    expect((await product(t, "a-gin"))?.abv).toBe(43.1);
    await t.mutation(api.pos.saveProduct, {
      session: token,
      company: "a",
      product: { ...rest, id: cid, abv: 0 },
    });
    expect((await product(t, "b-gin"))?.abv).toBeUndefined();
    // The stock item sets it too
    await t.mutation(api.inv.saveItem, {
      session: token,
      company: "a",
      id: itemId,
      name: "Gin Tanqueray",
      category: "spirits",
      unit: "ml",
      size: 700,
      container: "garrafa",
      barcodes: [],
      abv: 47.3,
    });
    expect((await product(t, "a-gin"))?.abv).toBe(47.3);
    expect((await product(t, "b-gin"))?.abv).toBe(47.3);
  });

  it("keeps one country per bottle across item and products", async () => {
    const { t, token, itemId } = await setup();
    // Country set on the stock item → the gin products of both bars
    await t.mutation(api.inv.saveItem, {
      session: token,
      company: "a",
      id: itemId,
      name: "Gin Tanqueray",
      category: "spirits",
      unit: "ml",
      size: 700,
      container: "garrafa",
      barcodes: [],
      country: "United Kingdom",
    });
    expect((await product(t, "a-gin"))?.country).toBe("United Kingdom");
    expect((await product(t, "b-gin"))?.country).toBe("United Kingdom");
    expect((await product(t, "a-vodka"))?.country).toBeUndefined();
    // A wine product: wine.country follows, and the item too
    const cur = await product(t, "b-gin");
    if (!cur) {
      return;
    }
    const { _id, _creationTime, cid, company, updatedAt, ...rest } = cur;
    await t.mutation(api.pos.saveProduct, {
      session: token,
      company: "b",
      product: {
        ...rest,
        id: cid,
        country: "",
        wine: { color: "red", bottleMl: 750, pours: [], country: "France" },
      },
    });
    const wine = await product(t, "b-gin");
    expect(wine?.country).toBe("France");
    expect(wine?.wine?.country).toBe("France");
    expect((await t.run((ctx) => ctx.db.get(itemId)))?.country).toBe("France");
    expect((await product(t, "a-gin"))?.country).toBe("France");
    // Saving without touching the country keeps it
    const again = await product(t, "a-gin");
    if (!again) {
      return;
    }
    const {
      _id: _a,
      _creationTime: _b,
      cid: id2,
      company: _c,
      updatedAt: _d,
      country: _e,
      ...plain
    } = again;
    await t.mutation(api.pos.saveProduct, {
      session: token,
      company: "a",
      product: { ...plain, id: id2, price: 9 },
    });
    expect((await product(t, "a-gin"))?.country).toBe("France");
  });
});
