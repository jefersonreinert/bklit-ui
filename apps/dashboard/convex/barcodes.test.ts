import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

/** Bar "vino" with two dispenser wines; one already in the catalog. */
async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(api.inv.saveGroup, { session: token, key: "grupo", name: "Grupo", companies: ["vino"] });
  const greco = await t.mutation(api.inv.saveItem, {
    session: token,
    company: "vino",
    name: "Di Majo Norante Greco",
    category: "wine",
    unit: "ml",
    size: 750,
    container: "garrafa",
    barcodes: [],
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("wmState", {
      company: "vino",
      takenAt: 1,
      syncedAt: 1,
      ms: 1,
      node: {},
      dispensers: [],
      positions: [],
      wines: [
        { sku: "48", name: "DI MAJO NORANTE GRECO", producer: "FARSNS", title2: "GRECO", origin: "ITALY", volumeMl: 750 },
        { sku: "95", name: "MAS AMIEL", producer: "XYZ", title2: "GRENACHE", origin: "FRANCE", volumeMl: 500 },
        // The portal reuses SKUs across different wines
        { sku: "48", name: "CARUSU ROSSO", title2: "NERELLO MASCALESE", volumeMl: 750 },
      ],
    });
  });
  return { t, token, greco };
}

describe("dispenser wine barcodes", () => {
  it("lists the wines with their catalog item by name", async () => {
    const { t, token, greco } = await setup();
    const rows = await t.query(api.barcodes.context, { session: token, company: "vino" });
    expect(rows.map((r) => [r.sku, r.itemId, r.linked])).toEqual([
      ["48:carusu rosso", null, false],
      ["48:di majo norante greco", greco, false],
      ["95:mas amiel", null, false],
    ]);
  });

  it("drops codes with a wrong check digit and keeps the good ones for review", async () => {
    const { t, token } = await setup();
    await t.mutation(api.barcodes.saveFinds, {
      session: token,
      company: "vino",
      finds: [
        { sku: "48:di majo norante greco", gtin: "4006381333932", confidence: 0.9 },
        { sku: "95:mas amiel", gtin: "3281540031113", source: "https://example.test", confidence: 0.7 },
      ],
    });
    const rows = await t.query(api.barcodes.context, { session: token, company: "vino" });
    expect(rows.map((r) => [r.find?.status, r.find?.gtin])).toEqual([
      [undefined, undefined],
      ["notfound", null],
      ["found", "3281540031113"],
    ]);
  });

  it("accepting puts the code on the item, creates it when missing, and links the dispenser", async () => {
    const { t, token, greco } = await setup();
    await t.mutation(api.barcodes.accept, { session: token, company: "vino", sku: "48:di majo norante greco", gtin: "4006381333931" });
    const newItem = await t.mutation(api.barcodes.accept, { session: token, company: "vino", sku: "95:mas amiel", gtin: "3281540031113" });
    const o = await t.query(api.inv.overview, { session: token, company: "vino" });
    expect(o.items.find((i) => i._id === greco)?.barcodes).toEqual(["4006381333931"]);
    expect(o.items.find((i) => i._id === newItem)).toMatchObject({ name: "MAS AMIEL", size: 500, unit: "ml", barcodes: ["3281540031113"] });
    expect(await t.query(api.inv.byBarcode, { session: token, company: "vino", code: "3281540031113" })).toBe(newItem);
    // The pours of both wines now take stock from these items
    const links = await t.run(async (ctx) => ctx.db.query("invSaleLinks").collect());
    expect(links.map((l) => [l.source, l.key, l.itemId])).toEqual([
      ["wm", "48:di majo norante greco", greco],
      ["wm", "95:mas amiel", newItem],
    ]);
    // A wrong code is refused; a scanned one is taken as read
    await expect(
      t.mutation(api.barcodes.accept, { session: token, company: "vino", sku: "48:di majo norante greco", gtin: "123" })
    ).rejects.toThrow(/inválido/);
    await t.mutation(api.barcodes.accept, { session: token, company: "vino", sku: "48:di majo norante greco", gtin: "INT-0048", scanned: true });
    const after = await t.query(api.inv.overview, { session: token, company: "vino" });
    expect(after.items.find((i) => i._id === greco)?.barcodes).toEqual(["4006381333931", "INT-0048"]);
  });

  it("uses the finder's choice of the same wine in the catalog", async () => {
    const { t, token } = await setup();
    const bin = await t.mutation(api.inv.saveItem, {
      session: token,
      company: "vino",
      name: "Mas Amiel Maury Grenat 50cl",
      category: "wine",
      unit: "ml",
      size: 500,
      container: "garrafa",
      barcodes: [],
    });
    const rows = await t.query(api.barcodes.context, { session: token, company: "vino" });
    expect(rows.find((r) => r.sku === "95:mas amiel")?.candidates.map((c) => c.id)).toContain(bin);
    await t.mutation(api.barcodes.saveFinds, {
      session: token,
      company: "vino",
      finds: [{ sku: "95:mas amiel", gtin: "3281540031113", itemId: bin, confidence: 0.92 }],
    });
    const item = await t.mutation(api.barcodes.accept, { session: token, company: "vino", sku: "95:mas amiel", gtin: "3281540031113" });
    expect(item).toBe(bin);
  });

  it("links dispenser wines to items by name, creating the missing ones with their code", async () => {
    const { t, token, greco } = await setup();
    const res = await t.mutation(internal.barcodes.linkWines, {
      company: "vino",
      rows: [
        { sku: "48:di majo norante greco", item: "Di Majo Norante Greco" },
        { sku: "95:mas amiel", item: "Mas Amiel", gtin: "9311789000732" },
        { sku: "48:carusu rosso", item: "Carusu Rosso", gtin: "9311789000732" },
        { sku: "1:nope", item: "Nope" },
      ],
    });
    expect(res).toMatchObject({ linked: 3, created: 2, codes: 1, missing: ["1:nope"] });
    expect(res.skipped).toEqual(["Carusu Rosso: 9311789000732"]);
    const rows = await t.query(api.barcodes.context, { session: token, company: "vino" });
    expect(rows.every((r) => r.linked)).toBe(true);
    expect(rows.find((r) => r.sku === "48:di majo norante greco")?.itemId).toBe(greco);
    const amiel = rows.find((r) => r.sku === "95:mas amiel");
    expect(amiel?.barcodes).toEqual(["9311789000732"]);
    // Running it again changes nothing
    const again = await t.mutation(internal.barcodes.linkWines, {
      company: "vino",
      rows: [{ sku: "95:mas amiel", item: "Mas Amiel", gtin: "9311789000732" }],
    });
    expect(again).toMatchObject({ linked: 1, created: 0, codes: 0 });
  });
});
