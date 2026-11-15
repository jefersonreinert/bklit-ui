import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

const product = (id: string, name: string) => ({
  id,
  name,
  category: "Cocktails",
  price: 11.8,
  color: "#000",
  available: true,
});

/**
 * Bars "vino" (set up: areas, a Negroni sheet linked to its menu) and
 * "brew" (nothing yet; sells a "NEGRONI" and an "Aperol Spritz").
 */
async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(api.inv.saveGroup, { session: token, key: "grupo", name: "Grupo", companies: ["vino", "brew"] });
  const gin = await t.mutation(api.inv.saveItem, {
    session: token,
    company: "vino",
    name: "Gin",
    category: "spirits",
    unit: "ml",
    size: 700,
    container: "garrafa",
    barcodes: [],
  });
  await t.mutation(api.inv.saveArea, { session: token, company: "vino", name: "Back bar", items: [gin] });
  await t.mutation(api.inv.saveArea, { session: token, company: "vino", name: "Adega" });
  for (const [company, products] of [
    ["vino", [product("v-neg", "Negroni")]],
    ["brew", [product("b-neg", "NEGRONI"), product("b-ap", "Aperol Spritz")]],
  ] as const) {
    await t.mutation(internal.pos.importMenu, {
      company,
      currency: "EUR",
      profile: { name: company, color: "#000" },
      products: [...products],
    });
  }
  await t.mutation(api.recipes.fromMenu, { session: token, company: "vino", productIds: ["v-neg"] });
  return { t, token, gin };
}

describe("rollout", () => {
  it("shows each bar's checklist and next step", async () => {
    const { t, token } = await setup();
    const s = await t.query(api.rollout.status, { session: token, company: "vino" });
    const vino = s.bars.find((b) => b.company === "vino");
    const brew = s.bars.find((b) => b.company === "brew");
    expect(vino?.steps.find((x) => x.key === "areas")?.done).toBe(true);
    expect(vino?.steps.find((x) => x.key === "recipes")?.detail).toBe("1 de 1 produtos (100%)");
    expect(vino?.next?.key).toBe("opening");
    expect(brew?.next?.key).toBe("areas");
  });

  it("copies areas with their shelf order, once", async () => {
    const { t, token, gin } = await setup();
    expect(await t.mutation(api.rollout.copyAreas, { session: token, from: "vino", to: "brew" })).toBe(2);
    expect(await t.mutation(api.rollout.copyAreas, { session: token, from: "vino", to: "brew" })).toBe(0);
    const o = await t.query(api.inv.overview, { session: token, company: "brew" });
    expect(o.areas.map((a) => [a.name, a.items])).toEqual([
      ["Back bar", [gin]],
      ["Adega", []],
    ]);
  });

  it("links another bar's products to the group's sheets by name", async () => {
    const { t, token } = await setup();
    const matches = await t.query(api.rollout.recipeLinks, { session: token, company: "brew" });
    expect(matches.map((m) => [m.product, m.recipe])).toEqual([["NEGRONI", "Negroni"]]);
    const n = await t.mutation(api.rollout.applyRecipeLinks, {
      session: token,
      company: "brew",
      links: matches.map((m) => ({ productId: m.productId, recipeId: m.recipeId })),
    });
    expect(n).toBe(1);
    const list = await t.query(api.recipes.list, { session: token, company: "brew" });
    expect(list.recipes.find((r) => r.name === "Negroni")?.productId).toBe("b-neg");
    // Vino keeps its own link
    const vino = await t.query(api.recipes.list, { session: token, company: "vino" });
    expect(vino.recipes.find((r) => r.name === "Negroni")?.productId).toBe("v-neg");
    expect(await t.query(api.rollout.recipeLinks, { session: token, company: "brew" })).toEqual([]);
  });
});
