import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

const line = (description: string, quantity: number, unitPrice: number) => ({
  description,
  code: "",
  ean: "",
  quantity,
  unit: "case",
  packSize: null,
  packUnit: "",
  unitPrice,
  vatRate: 18,
  lineTotal: null,
});

const invoice = (number: string, lines: ReturnType<typeof line>[]) => ({
  supplier: { name: "Farsons", taxId: "MT1", address: "" },
  number,
  date: "2026-11-10",
  dueDate: "",
  currency: "EUR",
  subtotal: null,
  vatTotal: null,
  total: null,
  lines,
});

/**
 * Bars a and b; gin 70 cl with a minimum of one bottle in a, bought once
 * from Farsons in cases of 6 (that invoice teaches the pack and cost).
 */
async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(api.inv.saveGroup, { session: token, key: "grupo", name: "Grupo", companies: ["a", "b"] });
  const gin = await t.mutation(api.inv.saveItem, {
    session: token,
    company: "a",
    name: "Gin Tanqueray 70cl",
    category: "spirits",
    unit: "ml",
    size: 700,
    container: "garrafa",
    barcodes: [],
    min: 700,
  });
  const inv = await t.mutation(api.invoices.create, {
    session: token,
    company: "a",
    files: [],
    data: invoice("F-1", [line("TANQUERAY GIN 6X70CL", 1, 84)]),
  });
  await t.mutation(api.invoices.approve, { session: token, id: inv });
  return { t, token, gin };
}

describe("purchasing", () => {
  it("suggests whole cases from the usual supplier, from daily usage", async () => {
    const { t, token, gin } = await setup();
    // 3500 ml used (waste counts as usage): 125 ml/day over 28 days
    await t.mutation(api.inv.addMove, { session: token, company: "a", itemId: gin, kind: "waste", qty: 3500, note: "teste" });
    const s = await t.query(api.orders.suggestions, { session: token, company: "a" });
    const g = s.groups[0];
    expect([g?.supplier, g?.coverDays]).toEqual(["Farsons", 7]);
    // 125 × 7 + 700 minimum = 1575; has 700 → one case of 6 (4200 ml) at €84
    expect(g?.lines[0]).toMatchObject({ itemId: gin, onHand: 700, perDay: 125, target: 1575, packs: 1, perUnit: 4200, packCost: 84 });
  });

  it("suggests a transfer from a bar with spare stock", async () => {
    const { t, token, gin } = await setup();
    await t.mutation(api.inv.addMove, { session: token, company: "a", itemId: gin, kind: "waste", qty: 3500, note: "teste" });
    await t.mutation(api.inv.addMove, { session: token, company: "b", itemId: gin, kind: "opening", qty: 4200, unitCost: 0.02 });
    const s = await t.query(api.orders.suggestions, { session: token, company: "a" });
    expect(s.transfers).toEqual([
      expect.objectContaining({ itemId: gin, from: "b", qty: 700 }),
    ]);
  });

  it("counts what is on order, and an approved invoice receives the sent order", async () => {
    const { t, token, gin } = await setup();
    await t.mutation(api.inv.addMove, { session: token, company: "a", itemId: gin, kind: "waste", qty: 3500, note: "teste" });
    const s = await t.query(api.orders.suggestions, { session: token, company: "a" });
    const g = s.groups[0];
    const id = await t.mutation(api.orders.createOrder, {
      session: token,
      company: "a",
      supplierId: g?.supplierId as never,
      lines: (g?.lines ?? []).map((l) => ({ itemId: l.itemId, packs: l.packs, perUnit: l.perUnit, packCost: l.packCost ?? 0 })),
    });
    expect((await t.query(api.orders.suggestions, { session: token, company: "a" })).groups).toEqual([]);
    await t.mutation(api.orders.setOrderStatus, { session: token, id, status: "sent" });
    await expect(t.mutation(api.orders.updateOrder, { session: token, id, lines: [] })).rejects.toThrow(/rascunhos/);
    const next = await t.mutation(api.invoices.create, {
      session: token,
      company: "a",
      files: [],
      data: invoice("F-2", [line("TANQUERAY GIN 6X70CL", 2, 84)]),
    });
    const ctx = await t.query(api.invoices.agentContext, { session: token, id: next });
    expect(ctx.openOrders[0]?.lines[0]).toMatchObject({ itemId: gin, packs: 1, perUnit: 4200 });
    await t.mutation(api.invoices.approve, { session: token, id: next });
    const orders = await t.query(api.orders.orders, { session: token, company: "a" });
    expect([orders[0]?.status, orders[0]?.invoiceId]).toEqual(["received", next]);
  });

  it("edits a supplier's contacts and delivery cycle", async () => {
    const { t, token } = await setup();
    const [s] = await t.query(api.orders.suppliers, { session: token, company: "a" });
    await t.mutation(api.orders.saveSupplier, {
      session: token,
      company: "a",
      id: s?._id,
      name: "Farsons",
      phone: "+356 2138 1111",
      email: "orders@farsons.test",
      coverDays: 14,
    });
    const [after] = await t.query(api.orders.suppliers, { session: token, company: "a" });
    expect([after?.phone, after?.coverDays]).toEqual(["+356 2138 1111", 14]);
  });
});
