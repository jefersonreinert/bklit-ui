import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };
const T0 = Date.parse("2026-11-10T12:00:00Z");

/**
 * Bar "bar" (group with "pub"): gin 700 ml and Campari, 10 bottles of gin
 * and 5 of Campari, a Negroni sheet (30 + 30 ml) linked to the POS
 * product "negroni" (SKU N1, as imported from Lightspeed).
 */
async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(api.inv.saveGroup, { session: token, key: "grupo", name: "Grupo", companies: ["bar", "pub"] });
  const item = (name: string, size: number) =>
    t.mutation(api.inv.saveItem, {
      session: token,
      company: "bar",
      name,
      category: "spirits",
      unit: "ml",
      size,
      container: "garrafa",
      barcodes: [],
    });
  const gin = await item("Gin", 700);
  const campari = await item("Campari", 1000);
  const wine = await item("Marsovin 1919 White", 750);
  for (const [id, qty] of [[gin, 7000], [campari, 5000], [wine, 7500]] as const) {
    await t.mutation(api.inv.addMove, { session: token, company: "bar", itemId: id, kind: "opening", qty, unitCost: 0.04 });
  }
  await t.mutation(internal.pos.importMenu, {
    company: "bar",
    currency: "EUR",
    profile: { name: "Bar", color: "#000" },
    products: [
      { id: "negroni", name: "Negroni", category: "Classic Cocktails", price: 11.8, color: "#000", available: true, sku: "N1" },
      { id: "water", name: "Water", category: "Soft", price: 2, color: "#000", available: true },
    ],
  });
  await t.mutation(api.recipes.fromMenu, { session: token, company: "bar", productIds: ["negroni"] });
  const list = await t.query(api.recipes.list, { session: token, company: "bar" });
  const negroni = list.recipes.find((r) => r.name === "Negroni")?._id as Id<"invRecipes">;
  await t.mutation(api.recipes.save, {
    session: token,
    company: "bar",
    id: negroni,
    name: "Negroni",
    kind: "menu",
    category: "cocktail",
    yieldQty: 1,
    yieldUnit: "un",
    lines: [
      { itemId: gin, qty: 30, waste: 0 },
      { itemId: campari, qty: 30, waste: 0 },
    ],
  });
  // First run starts the cursors "now" (no backfill)
  vi.setSystemTime(T0);
  await t.mutation(internal.sales.run, { company: "bar" });
  return { t, token, gin, campari, wine, negroni };
}

type T = Awaited<ReturnType<typeof setup>>["t"];

const qtyOf = async (t: T, token: string, id: Id<"invItems">) => {
  const o = await t.query(api.inv.overview, { session: token, company: "bar" });
  return o.items.find((i) => i._id === id)?.qty;
};

const order = (t: T, cid: string, qty: number, at: number, status: "paid" | "void" = "paid") =>
  t.run(async (ctx) =>
    ctx.db.insert("posOrders", {
      cid,
      number: 1,
      tableId: null,
      name: cid,
      items: [
        { id: "i1", productId: "negroni", name: "Negroni", price: 11.8, qty, sent: true },
        { id: "i2", productId: "water", name: "Water", price: 2, qty: 1, sent: true },
      ],
      taxRate: 0,
      status,
      createdAt: at,
      updatedAt: at,
      closedAt: at,
      company: "bar",
    })
  );

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("sales → stock", () => {
  it("takes a POS sale through its sheet once, and gives a voided one back", async () => {
    const { t, token, gin, campari } = await setup();
    const id = await order(t, "o1", 2, T0 + 60_000);
    vi.setSystemTime(T0 + 120_000);
    await t.mutation(internal.sales.run, { company: "bar" });
    await t.mutation(internal.sales.run, { company: "bar" });
    expect([await qtyOf(t, token, gin), await qtyOf(t, token, campari)]).toEqual([6940, 4940]);
    await t.run(async (ctx) => ctx.db.patch(id, { status: "void" }));
    await t.mutation(internal.sales.run, { company: "bar" });
    expect(await qtyOf(t, token, gin)).toBe(7000);
    // Water has no sheet: listed as sold without one
    const st = await t.query(api.sales.status, { session: token, company: "bar" });
    expect(st.missing.map((m) => m.name)).toEqual([]);
  });

  it("lists what sold without a sheet", async () => {
    const { t, token } = await setup();
    await order(t, "o2", 1, T0 + 60_000);
    vi.setSystemTime(T0 + 120_000);
    const st = await t.query(api.sales.status, { session: token, company: "bar" });
    expect(st.missing).toEqual([{ source: "pos", key: "water", name: "Water", qty: 1 }]);
  });

  it("takes Lightspeed receipts by SKU and gives cancelled ones back", async () => {
    const { t, token, gin } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("lskLocations", {
        locationId: 7,
        businessId: 1,
        businessName: "B",
        name: "Bar",
        company: "bar",
        enabled: true,
        updatedAt: T0,
      });
    });
    const receipt = (id: string, cancelled: boolean) => ({
      locationId: 7,
      receiptId: id,
      closedAt: T0 + 60_000,
      openedAt: T0,
      cancelled,
      table: "1",
      covers: 1,
      staff: "x",
      total: 23.6,
      tax: 0,
      tips: 0,
      payments: [],
      lines: [{ sku: "N1", name: "NEGRONI", qty: 2, total: 23.6, group: "Cocktails" }],
    });
    const rid = await t.run(async (ctx) => ctx.db.insert("lskSales", receipt("r1", false)));
    vi.setSystemTime(T0 + 120_000);
    await t.mutation(internal.sales.run, { company: "bar" });
    expect(await qtyOf(t, token, gin)).toBe(6940);
    await t.run(async (ctx) => ctx.db.replace(rid, receipt("r1", true)));
    await t.mutation(internal.sales.run, { company: "bar" });
    expect(await qtyOf(t, token, gin)).toBe(7000);
  });

  it("takes dispenser pours in ml once linked, and catches up in batches", async () => {
    const { t, token, wine } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 200; i++) {
        await ctx.db.insert("wmSales", {
          company: "bar",
          at: T0 + 60_000 + i * 1000,
          dispenser: "Disp 3.2",
          wine: "MARSOVIN 1919 WHITE",
          sku: "51",
          ml: 25,
          price: 1.5,
          discount: 0,
        });
      }
    });
    vi.setSystemTime(T0 + 600_000);
    await t.mutation(api.sales.link, {
      session: token,
      company: "bar",
      source: "wm",
      key: "51",
      name: "MARSOVIN 1919 WHITE",
      itemId: wine,
    });
    await t.mutation(internal.sales.run, { company: "bar" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    // 200 pours × 25 ml
    expect(await qtyOf(t, token, wine)).toBe(2500);
  });

  it("imports a sales file and posts the rest after linking", async () => {
    const { t, token, gin, negroni } = await setup();
    const r = await t.mutation(api.sales.importCsv, {
      session: token,
      company: "bar",
      date: "2026-11-09",
      fileName: "sales.csv",
      lines: [
        { sku: "N1", name: "Negroni", qty: 10 },
        { sku: "", name: "Negroni Sbagliato", qty: 2 },
      ],
    });
    expect(r).toEqual({ posted: 1, missing: ["Negroni Sbagliato"] });
    expect(await qtyOf(t, token, gin)).toBe(6700);
    await t.mutation(api.sales.link, {
      session: token,
      company: "bar",
      source: "csv",
      key: "negroni sbagliato",
      name: "Negroni Sbagliato",
      recipeId: negroni,
    });
    const imports = await t.query(api.sales.imports, { session: token, company: "bar" });
    const again = await t.mutation(api.sales.postImport, { session: token, id: imports[0]?._id as never });
    expect(again).toEqual({ posted: 2, missing: [] });
    expect(await qtyOf(t, token, gin)).toBe(6640);
  });

  it("shows the variance a count finds after sales", async () => {
    const { t, token, gin } = await setup();
    const count = async (ml: number, at: number) => {
      vi.setSystemTime(at);
      const id = await t.mutation(api.inv.startCount, { session: token, company: "bar" });
      await t.mutation(api.inv.saveCountLine, { session: token, countId: id, itemId: gin, full: 0, weights: [], loose: ml });
      await t.mutation(api.inv.closeCount, { session: token, countId: id });
      return id;
    };
    await count(7000, T0 + 1000);
    await order(t, "o3", 10, T0 + 60_000);
    vi.setSystemTime(T0 + 120_000);
    await t.mutation(internal.sales.run, { company: "bar" });
    // Sheets say 300 ml of gin went; the bottles say 400 ml
    const closing = await count(6600, T0 + 200_000);
    const v = await t.query(api.sales.variance, { session: token, company: "bar", countId: closing });
    const row = v.rows.find((r) => r.itemId === gin);
    expect([row?.usage, row?.variance, row?.pct]).toEqual([300, -100, -1 / 3]);
    expect(row?.varianceValue).toBe(-4);
  });
});
