import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

/** Bars a and b in a group; gin, Campari, vermouth, sugar with costs in a. */
async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(api.inv.saveGroup, { session: token, key: "grupo", name: "Grupo", companies: ["bar", "pub"] });
  const item = (name: string, unit: "ml" | "g", size: number, containerCost: number) =>
    t.mutation(api.inv.saveItem, {
      session: token,
      company: "bar",
      name,
      category: "spirits",
      unit,
      size,
      container: "garrafa",
      barcodes: [],
      avgCost: containerCost / size,
    });
  const gin = await item("Gin", "ml", 700, 28);
  const campari = await item("Campari", "ml", 1000, 25);
  const vermouth = await item("Vermouth", "ml", 1000, 15);
  const sugar = await item("Açúcar", "g", 1000, 2);
  await t.mutation(internal.pos.importMenu, {
    company: "bar",
    currency: "EUR",
    profile: { name: "A", color: "#000" },
    products: [
      { id: "negroni", name: "Negroni", category: "Classic Cocktails", price: 11.8, color: "#000", available: true },
      { id: "sour", name: "Gin Sour", category: "Classic Cocktails", price: 10, color: "#000", available: true },
    ],
  });
  return { t, token, gin, campari, vermouth, sugar };
}

const find = async (t: Awaited<ReturnType<typeof setup>>["t"], token: string, company: string, name: string) => {
  const l = await t.query(api.recipes.list, { session: token, company });
  return l.recipes.find((r) => r.name === name);
};

describe("technical sheets", () => {
  it("costs a menu recipe from the bar's average costs and gives the margin", async () => {
    const { t, token, gin, campari, vermouth } = await setup();
    await t.mutation(api.recipes.fromMenu, { session: token, company: "bar", productIds: ["negroni"] });
    const stub = await find(t, token, "bar", "Negroni");
    expect([stub?.category, stub?.productId, stub?.price]).toEqual(["cocktail", "negroni", 11.8]);
    await t.mutation(api.recipes.save, {
      session: token,
      company: "bar",
      id: stub?._id,
      name: "Negroni",
      kind: "menu",
      category: "cocktail",
      yieldQty: 1,
      yieldUnit: "un",
      lines: [
        { itemId: gin, qty: 30, waste: 0 },
        { itemId: campari, qty: 30, waste: 0 },
        { itemId: vermouth, qty: 30, waste: 0 },
      ],
    });
    const r = await find(t, token, "bar", "Negroni");
    // 30 × (0.04 + 0.025 + 0.015) = 2.40; €11.80 incl. 18% VAT = €10 → 76%
    expect([r?.cost, r?.gp, r?.target, r?.suggested]).toEqual([2.4, 0.76, 0.8, 14.5]);
    // Bar b has no costs yet: same recipe, cost unknown
    const inB = await find(t, token, "pub", "Negroni");
    expect([inB?.cost, inB?.missing.length, inB?.price]).toEqual([0, 3, null]);
  });

  it("uses preps as ingredients and refuses loops", async () => {
    const { t, token, gin, sugar } = await setup();
    const syrup = await t.mutation(api.recipes.save, {
      session: token,
      company: "bar",
      name: "Xarope simples",
      kind: "prep",
      category: "other",
      yieldQty: 1500,
      yieldUnit: "ml",
      lines: [{ itemId: sugar, qty: 1000, waste: 0 }],
    });
    await t.mutation(api.recipes.save, {
      session: token,
      company: "bar",
      name: "Gin Sour",
      kind: "menu",
      category: "cocktail",
      yieldQty: 1,
      yieldUnit: "un",
      lines: [
        { itemId: gin, qty: 50, waste: 0 },
        { prepId: syrup, qty: 15, waste: 0 },
      ],
    });
    expect((await find(t, token, "bar", "Gin Sour"))?.cost).toBe(2.02);
    const other = await t.mutation(api.recipes.save, {
      session: token,
      company: "bar",
      name: "Batch",
      kind: "prep",
      category: "other",
      yieldQty: 100,
      yieldUnit: "ml",
      lines: [{ prepId: syrup, qty: 10, waste: 0 }],
    });
    await expect(
      t.mutation(api.recipes.save, {
        session: token,
        company: "bar",
        id: syrup,
        name: "Xarope simples",
        kind: "prep",
        category: "other",
        yieldQty: 1500,
        yieldUnit: "ml",
        lines: [{ prepId: other, qty: 5, waste: 0 }],
      })
    ).rejects.toThrow(/a si mesmo/);
    await expect(
      t.mutation(api.recipes.setActive, { session: token, company: "bar", id: syrup, active: false })
    ).rejects.toThrow(/usado em/);
  });

  it("links one product to one recipe only, and takes a manual price", async () => {
    const { t, token } = await setup();
    await t.mutation(api.recipes.fromMenu, { session: token, company: "bar", productIds: ["negroni", "sour"] });
    const negroni = await find(t, token, "bar", "Negroni");
    const sour = await find(t, token, "bar", "Gin Sour");
    await expect(
      t.mutation(api.recipes.setPrice, { session: token, company: "bar", recipeId: sour?._id as never, productId: "negroni" })
    ).rejects.toThrow(/já está na ficha/);
    await t.mutation(api.recipes.setPrice, {
      session: token,
      company: "bar",
      recipeId: negroni?._id as never,
      productId: null,
      price: 12.5,
    });
    expect((await find(t, token, "bar", "Negroni"))?.price).toBe(12.5);
  });
});
