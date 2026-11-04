import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

const product = (id: string, extra: object = {}) => ({
  id,
  name: id,
  category: "Bar",
  price: 10,
  color: "#000",
  available: true,
  ...extra,
});

/** Admin (1234) and the bar "bar" with gin, tonic and a G&T recipe. */
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
      product("gin", {
        trackStock: true,
        stock: 2,
        cost: 20,
        minStock: 1,
        unit: "garrafa",
      }),
      product("tonic", { trackStock: true, stock: 10, cost: 1, minStock: 12 }),
      product("gt", { price: 12 }),
    ],
  });
  return { t, token };
}

const stockOf = async (
  t: Awaited<ReturnType<typeof setup>>["t"],
  token: string,
  id: string
) => {
  const c = await t.query(api.pos.catalog, { session: token, company: "bar" });
  return c?.products.find((p) => p.id === id);
};

describe("inventory", () => {
  it("receives a purchase with the average cost", async () => {
    const { t, token } = await setup();
    const supplierId = await t.mutation(api.inventory.saveSupplier, {
      session: token,
      company: "bar",
      name: "Farsons",
      phone: "+356 0000",
    });
    const id = await t.mutation(api.inventory.savePurchase, {
      session: token,
      company: "bar",
      supplierId,
      items: [{ productId: "gin", qty: 2, unitCost: 30 }],
    });
    await t.mutation(api.inventory.setPurchaseStatus, {
      session: token,
      id,
      status: "ordered",
    });
    await t.mutation(api.inventory.receivePurchase, {
      session: token,
      id,
      received: [{ productId: "gin", qty: 2, unitCost: 30 }],
    });
    const gin = await stockOf(t, token, "gin");
    expect(gin?.stock).toBe(4);
    expect(gin?.cost).toBe(25);
    const [p] = await t.query(api.inventory.purchases, {
      session: token,
      company: "bar",
    });
    expect(p?.status).toBe("received");
    expect(p?.supplierName).toBe("Farsons");
    await expect(
      t.mutation(api.inventory.receivePurchase, {
        session: token,
        id,
        received: [],
      })
    ).rejects.toThrow("finalizada");
  });

  it("closes a stock take and logs the differences", async () => {
    const { t, token } = await setup();
    const id = await t.mutation(api.inventory.startCount, {
      session: token,
      company: "bar",
    });
    await t.mutation(api.inventory.saveCount, {
      session: token,
      id,
      counts: [{ productId: "tonic", counted: 7 }],
    });
    const res = await t.mutation(api.inventory.closeCount, {
      session: token,
      id,
    });
    expect(res.changed).toBe(1);
    expect((await stockOf(t, token, "tonic"))?.stock).toBe(7);
    // gin was not counted: unchanged
    expect((await stockOf(t, token, "gin"))?.stock).toBe(2);
    const [c] = await t.query(api.inventory.counts, {
      session: token,
      company: "bar",
    });
    expect(c?.differences).toBe(1);
    expect(c?.diffValue).toBe(-3);
    const view = await t.query(api.inventory.overview, {
      session: token,
      company: "bar",
    });
    expect(view.lowCount).toBe(1); // tonic 7 ≤ 12
    expect(view.items.find((i) => i.id === "tonic")?.suggest).toBe(17);
  });

  it("selling a dish with a recipe uses its ingredients", async () => {
    const { t, token } = await setup();
    await t.mutation(api.inventory.saveRecipe, {
      session: token,
      productId: "gt",
      recipe: [
        { productId: "gin", qty: 0.05 },
        { productId: "tonic", qty: 1 },
      ],
    });
    const cost = await t.query(api.inventory.recipeCost, {
      session: token,
      productId: "gt",
    });
    expect(cost?.cost).toBe(2);
    await t.mutation(api.pos.createOrder, {
      session: token,
      cid: "o",
      tableId: null,
      name: "",
      company: "bar",
    });
    await t.mutation(api.pos.addItem, {
      session: token,
      orderId: "o",
      item: {
        id: "i",
        productId: "gt",
        name: "gt",
        price: 12,
        qty: 2,
        sent: false,
      },
    });
    await t.mutation(api.pos.pay, {
      session: token,
      orderId: "o",
      payment: { method: "cash", amount: 24, tip: 0 },
      day: "2026-11-04",
      hour: "21",
    });
    expect((await stockOf(t, token, "gin"))?.stock).toBeCloseTo(1.9, 4);
    expect((await stockOf(t, token, "tonic"))?.stock).toBe(8);
  });
});
