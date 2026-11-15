import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

/** Admin, group "grupo" (bars a, b), gin (with a barcode) and Aperol. */
async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(api.inv.saveGroup, { session: token, key: "grupo", name: "Grupo", companies: ["a", "b"] });
  const item = (name: string, size: number, barcodes: string[] = []) =>
    t.mutation(api.inv.saveItem, {
      session: token,
      company: "a",
      name,
      category: "spirits",
      unit: "ml",
      size,
      container: "garrafa",
      barcodes,
    });
  const gin = await item("Gin Tanqueray London Dry 70cl", 700, ["5000291020706"]);
  const aperol = await item("Aperol Aperitivo 1L", 1000);
  return { t, token, gin, aperol };
}

type T = Awaited<ReturnType<typeof setup>>["t"];

const line = (o: Partial<Record<string, unknown>>) => ({
  description: "",
  code: "",
  ean: "",
  quantity: 1,
  unit: "",
  packSize: null,
  packUnit: "",
  unitPrice: null,
  vatRate: 18,
  lineTotal: null,
  ...o,
});

const invoice = (number: string, lines: ReturnType<typeof line>[], total: number | null = null) => ({
  supplier: { name: "Farsons Beverage Imports", taxId: "MT 1234-5678", address: "" },
  number,
  date: "2026-11-10",
  dueDate: "2026-12-10",
  currency: "EUR",
  subtotal: null,
  vatTotal: null,
  total,
  lines,
});

const balance = async (t: T, token: string, id: Id<"invItems">) => {
  const o = await t.query(api.inv.overview, { session: token, company: "a" });
  return o.items.find((i) => i._id === id);
};

describe("supplier invoices", () => {
  it("links lines by barcode and name, works out cases, and enters stock at net cost", async () => {
    const { t, token, gin, aperol } = await setup();
    const id = await t.mutation(api.invoices.create, {
      session: token,
      company: "a",
      files: [],
      data: invoice("F-100", [
        line({ description: "TANQUERAY GIN 6X70CL", ean: "5000291020706", quantity: 2, unit: "case", unitPrice: 84 }),
        line({ description: "APEROL APERITIVO 1L", quantity: 6, unit: "btl", unitPrice: 12, code: "AP1" }),
        line({ description: "Delivery charge", unitPrice: 5 }),
      ]),
    });
    const d = await t.query(api.invoices.detail, { session: token, id });
    const [g, a, fee] = d?.invoice.lines ?? [];
    expect([g?.itemId, g?.match, g?.perUnit, g?.net]).toEqual([gin, "ean", 4200, 168]);
    expect([a?.itemId, a?.match, a?.perUnit]).toEqual([aperol, "similar", 1000]);
    expect(fee?.skip).toBe(true);
    // The Aperol suggestion is good enough to go without a confirmation
    expect(a?.score).toBeGreaterThanOrEqual(0.85);
    await t.mutation(api.invoices.approve, { session: token, id });
    const ginNow = await balance(t, token, gin);
    // 2 cases × 6 × 700 ml = 8400 ml at 168 / 8400 = 0.02 per ml
    expect([ginNow?.qty, ginNow?.avgCost]).toEqual([8400, 0.02]);
    expect((await balance(t, token, aperol))?.qty).toBe(6000);
  });

  it("learns the supplier's code for the next invoice", async () => {
    const { t, token, aperol } = await setup();
    const first = await t.mutation(api.invoices.create, {
      session: token,
      company: "a",
      files: [],
      data: invoice("F-1", [line({ description: "APEROL 1LT", code: "AP1", quantity: 1, unitPrice: 12 })]),
    });
    await t.mutation(api.invoices.updateLine, { session: token, id: first, lineId: "l1", itemId: aperol, perUnit: 1000 });
    await t.mutation(api.invoices.approve, { session: token, id: first });
    const second = await t.mutation(api.invoices.create, {
      session: token,
      company: "b",
      files: [],
      data: invoice("F-2", [line({ description: "ITEM AP1 PROMO", code: "AP1", quantity: 3, unitPrice: 11 })]),
    });
    const d = await t.query(api.invoices.detail, { session: token, id: second });
    expect(d?.invoice.lines[0]?.match).toBe("code");
    expect(d?.invoice.lines[0]?.itemId).toBe(aperol);
  });

  it("refuses the same invoice twice and lines still open", async () => {
    const { t, token } = await setup();
    const data = invoice("F-9", [line({ description: "Mystery liquor", unitPrice: 9 })]);
    const id = await t.mutation(api.invoices.create, { session: token, company: "a", files: [], data });
    await expect(t.mutation(api.invoices.approve, { session: token, id })).rejects.toThrow(/escolha o item/);
    await t.mutation(api.invoices.updateLine, { session: token, id, lineId: "l1", skip: true });
    await t.mutation(api.invoices.approve, { session: token, id });
    const again = await t.mutation(api.invoices.create, { session: token, company: "a", files: [], data });
    await expect(t.mutation(api.invoices.approve, { session: token, id: again })).rejects.toThrow(/já foi lançado/);
  });

  it("reverses an approved invoice and takes a credit note out", async () => {
    const { t, token, aperol } = await setup();
    const id = await t.mutation(api.invoices.create, {
      session: token,
      company: "a",
      files: [],
      data: invoice("F-5", [line({ description: "Aperol Aperitivo 1L", quantity: 6, unitPrice: 12 })]),
    });
    await t.mutation(api.invoices.approve, { session: token, id });
    expect((await balance(t, token, aperol))?.qty).toBe(6000);
    await expect(t.mutation(api.invoices.cancel, { session: token, id, reason: "" })).rejects.toThrow(/motivo/);
    await t.mutation(api.invoices.cancel, { session: token, id, reason: "lançado no bar errado" });
    expect((await balance(t, token, aperol))?.qty).toBe(0);
    const credit = await t.mutation(api.invoices.create, {
      session: token,
      company: "a",
      files: [],
      data: invoice("NC-1", [line({ description: "Aperol Aperitivo 1L", quantity: 1, unitPrice: -12 })], -14.16),
    });
    const d = await t.query(api.invoices.detail, { session: token, id: credit });
    expect(d?.invoice.credit).toBe(true);
    await t.mutation(api.inv.addMove, { session: token, company: "a", itemId: aperol, kind: "opening", qty: 2000, unitCost: 0.012 });
    await t.mutation(api.invoices.approve, { session: token, id: credit });
    expect((await balance(t, token, aperol))?.qty).toBe(1000);
  });

  it("accepts the AI's whole answer (buyer, category, generic name)", async () => {
    const { t, token, aperol } = await setup();
    const full = { ...line({ description: "Aperol Aperitivo 1L", quantity: 2, unitPrice: 12 }), category: "spirits", genericName: "aperitif" };
    const data = {
      ...invoice("F-77", [full]),
      buyer: { name: "Vinomad Ltd", taxId: "MT999", address: "Valletta" },
    };
    const id = await t.mutation(api.invoices.create, { session: token, company: "a", files: [], data });
    const d = await t.query(api.invoices.detail, { session: token, id });
    expect(d?.invoice.lines[0]?.itemId).toBe(aperol);
  });

  it("finds the supplier again by VAT number", async () => {
    const { t, token } = await setup();
    const a = await t.mutation(api.invoices.create, { session: token, company: "a", files: [], data: invoice("1", []) });
    const other = invoice("2", []);
    other.supplier.name = "FARSONS LTD (Imports)";
    const b = await t.mutation(api.invoices.create, { session: token, company: "a", files: [], data: other });
    const da = await t.query(api.invoices.detail, { session: token, id: a });
    const db = await t.query(api.invoices.detail, { session: token, id: b });
    expect(db?.invoice.supplierId).toBe(da?.invoice.supplierId);
  });
});
