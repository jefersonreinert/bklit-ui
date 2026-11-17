import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

/** Admin (1234), the group "grupo" with bars "a" and "b", and a waiter. */
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
  await t.mutation(api.staff.save, {
    session: token,
    name: "Waiter",
    role: "waiter",
    perms: ["orders"],
    color: "#000",
    active: true,
    pin: "5555",
  });
  const waiter = await t.mutation(api.staff.login, { pin: "5555", device: "w" });
  return { t, token, waiter: "token" in waiter ? (waiter.token as string) : "" };
}

type T = Awaited<ReturnType<typeof setup>>["t"];

const gin = (t: T, token: string, extra: object = {}) =>
  t.mutation(api.inv.saveItem, {
    session: token,
    company: "a",
    name: "Gin Tanqueray 70cl",
    category: "spirits",
    unit: "ml",
    size: 700,
    container: "garrafa",
    barcodes: ["5000291020706"],
    emptyG: 500,
    fullG: 1150,
    abv: 43,
    ...extra,
  });

const balance = async (t: T, token: string, company: string, id: Id<"invItems">) => {
  const o = await t.query(api.inv.overview, { session: token, company });
  return o.items.find((i) => i._id === id);
};

const ledgerSum = async (t: T, token: string, company: string, id: Id<"invItems">) => {
  const rows = await t.query(api.inv.moves, { session: token, company, itemId: id });
  return Math.round(rows.reduce((s, r) => s + r.qty, 0) * 1000) / 1000;
};

describe("inventory ledger", () => {
  it("shares the catalog in the group, balances per bar", async () => {
    const { t, token } = await setup();
    const id = await gin(t, token);
    const a = await t.query(api.inv.overview, { session: token, company: "a" });
    const b = await t.query(api.inv.overview, { session: token, company: "b" });
    expect(a.items.map((i) => i._id)).toEqual([id]);
    expect(b.items.map((i) => i._id)).toEqual([id]);
    expect(b.items[0]?.qty).toBe(0);
  });

  it("counts full bottles plus weighed open ones and closes into the ledger", async () => {
    const { t, token } = await setup();
    const id = await gin(t, token, { avgCost: 0.04 });
    const countId = await t.mutation(api.inv.startCount, { session: token, company: "a" });
    const line = await t.mutation(api.inv.saveCountLine, {
      session: token,
      countId,
      itemId: id,
      full: 2,
      weights: [825],
      loose: 0,
    });
    // 2 × 700 + (825 − 500) / (1150 − 500) × 700 = 1400 + 350
    expect(line).toEqual({ qty: 1750, estimated: false });
    const closed = await t.mutation(api.inv.closeCount, { session: token, countId });
    expect(closed).toEqual({ items: 1, value: 70, diffValue: 70 });
    expect((await balance(t, token, "a", id))?.qty).toBe(1750);
    expect(await ledgerSum(t, token, "a", id)).toBe(1750);
    // A second count corrects to the new reality with the difference only
    const second = await t.mutation(api.inv.startCount, { session: token, company: "a" });
    await t.mutation(api.inv.saveCountLine, {
      session: token,
      countId: second,
      itemId: id,
      full: 1,
      weights: [],
      loose: 0,
    });
    await t.mutation(api.inv.closeCount, { session: token, countId: second });
    expect((await balance(t, token, "a", id))?.qty).toBe(700);
    expect(await ledgerSum(t, token, "a", id)).toBe(700);
    await expect(
      t.mutation(api.inv.closeCount, { session: token, countId: second })
    ).rejects.toThrow();
  });

  it("adds up the same item counted in two areas", async () => {
    const { t, token } = await setup();
    const id = await gin(t, token);
    const bar = await t.mutation(api.inv.saveArea, { session: token, company: "a", name: "Back bar" });
    const cellar = await t.mutation(api.inv.saveArea, { session: token, company: "a", name: "Adega" });
    const countId = await t.mutation(api.inv.startCount, { session: token, company: "a" });
    for (const areaId of [bar, cellar]) {
      await t.mutation(api.inv.saveCountLine, {
        session: token,
        countId,
        itemId: id,
        areaId,
        full: 1,
        weights: [],
        loose: 0,
      });
    }
    await t.mutation(api.inv.closeCount, { session: token, countId });
    expect((await balance(t, token, "a", id))?.qty).toBe(1400);
  });

  it("refuses a weight without a bottle profile", async () => {
    const { t, token } = await setup();
    const id = await gin(t, token, { emptyG: undefined, fullG: undefined, barcodes: [] });
    const countId = await t.mutation(api.inv.startCount, { session: token, company: "a" });
    await expect(
      t.mutation(api.inv.saveCountLine, {
        session: token,
        countId,
        itemId: id,
        full: 0,
        weights: [800],
        loose: 0,
      })
    ).rejects.toThrow(/garrafa vazia/);
  });

  it("keeps a weighted average cost and transfers at cost", async () => {
    const { t, token } = await setup();
    const id = await gin(t, token);
    for (const unitCost of [0.03, 0.05]) {
      await t.mutation(api.inv.addMove, {
        session: token,
        company: "a",
        itemId: id,
        kind: "opening",
        qty: 700,
        unitCost,
      });
    }
    expect((await balance(t, token, "a", id))?.avgCost).toBe(0.04);
    await t.mutation(api.inv.transfer, {
      session: token,
      from: "a",
      to: "b",
      itemId: id,
      qty: 700,
    });
    const a = await balance(t, token, "a", id);
    const b = await balance(t, token, "b", id);
    expect([a?.qty, b?.qty, b?.avgCost]).toEqual([700, 700, 0.04]);
    expect(await ledgerSum(t, token, "a", id)).toBe(700);
    expect(await ledgerSum(t, token, "b", id)).toBe(700);
  });

  it("needs a reason for waste and takes it out", async () => {
    const { t, token } = await setup();
    const id = await gin(t, token);
    await t.mutation(api.inv.addMove, { session: token, company: "a", itemId: id, kind: "opening", qty: 700 });
    await expect(
      t.mutation(api.inv.addMove, { session: token, company: "a", itemId: id, kind: "waste", qty: 50 })
    ).rejects.toThrow(/motivo/);
    await t.mutation(api.inv.addMove, {
      session: token,
      company: "a",
      itemId: id,
      kind: "waste",
      qty: 50,
      note: "garrafa quebrada",
    });
    expect((await balance(t, token, "a", id))?.qty).toBe(650);
  });

  it("finds items by barcode and keeps codes unique in the group", async () => {
    const { t, token } = await setup();
    const id = await gin(t, token);
    expect(
      await t.query(api.inv.byBarcode, { session: token, company: "b", code: "5000291020706" })
    ).toBe(id);
    await expect(
      t.mutation(api.inv.saveItem, {
        session: token,
        company: "a",
        name: "Outro gin",
        category: "spirits",
        unit: "ml",
        size: 700,
        container: "garrafa",
        barcodes: ["5000291020706"],
      })
    ).rejects.toThrow(/já é do item/);
  });

  it("keeps a bar in one group only", async () => {
    const { t, token } = await setup();
    await expect(
      t.mutation(api.inv.saveGroup, { session: token, key: "outro", name: "Outro", companies: ["b"] })
    ).rejects.toThrow(/outro grupo/);
  });

  it("does not let a waiter count or see stock", async () => {
    const { t, token, waiter } = await setup();
    await gin(t, token);
    await expect(t.query(api.inv.overview, { session: waiter, company: "a" })).rejects.toThrow();
    await expect(t.mutation(api.inv.startCount, { session: waiter, company: "a" })).rejects.toThrow();
  });

  it("admin import creates items and fixes the unit only while an item has no movement", async () => {
    const { t, token } = await setup();
    const loose = await gin(t, token, { name: "Jameson", unit: "un", size: 1, container: "un", barcodes: [] });
    const moved = await gin(t, token, { name: "Bombay", unit: "un", size: 1, container: "un", barcodes: [] });
    await t.mutation(api.inv.addMove, { session: token, company: "a", itemId: moved, kind: "opening", qty: 2 });
    const bottle = { category: "spirits", unit: "ml" as const, size: 700, container: "garrafa" };
    const res = await t.mutation(internal.inv.upsertItems, {
      company: "a",
      items: [
        { name: "Jameson", ...bottle },
        { name: "Bombay", ...bottle },
        { name: "Monin Vanilla", ...bottle, category: "mixer" },
      ],
    });
    expect(res).toEqual({ created: 1, updated: 1, same: 0, locked: ["Bombay"] });
    const o = await t.query(api.inv.overview, { session: token, company: "a" });
    const by = (id: string) => o.items.find((i) => i._id === id);
    expect(by(loose)).toMatchObject({ unit: "ml", size: 700, container: "garrafa" });
    expect(by(moved)).toMatchObject({ unit: "un", size: 1, container: "garrafa" });
    const again = await t.mutation(internal.inv.upsertItems, { company: "a", items: [{ name: "Monin Vanilla", ...bottle, category: "mixer" }] });
    expect(again).toMatchObject({ created: 0, same: 1 });
  });

  it("admin adds codes to items by name and never moves a code from another item", async () => {
    const { t, token } = await setup();
    const a = await gin(t, token, { name: "Jameson", barcodes: [] });
    await gin(t, token, { name: "Bombay", barcodes: ["111"] });
    const res = await t.mutation(internal.inv.addBarcodes, {
      company: "a",
      rows: [
        { name: "Jameson", code: "5011007003005" },
        { name: "Jameson", code: "111" },
        { name: "Nope", code: "222" },
      ],
    });
    expect(res).toEqual({ added: 1, had: 0, noItem: ["Nope"], taken: ["Jameson: 111"] });
    const o = await t.query(api.inv.overview, { session: token, company: "a" });
    expect(o.items.find((i) => i._id === a)?.barcodes).toEqual(["5011007003005"]);
  });
});
