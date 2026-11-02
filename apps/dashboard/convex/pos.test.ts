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

/** POS with an admin (PIN 1234), the first business and a wine bar. */
async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(api.pos.bootstrap, {
    session: token,
    products: [product("caipirinha")],
    areas: [],
    settings: { currency: "EUR" },
    receipt: {},
    nextOrderNumber: 1,
  });
  await t.mutation(internal.pos.importMenu, {
    company: "vinomad",
    currency: "EUR",
    profile: { name: "Vinomad", color: "#7b1e2b", wine: true },
    products: [
      product("norton", {
        price: 36,
        trackStock: true,
        stock: 2,
        wine: {
          color: "white",
          bottleMl: 750,
          takeaway: 21,
          pours: [{ ml: 125, price: 6.5 }],
        },
      }),
    ],
  });
  return { t, token };
}

describe("POS businesses", () => {
  it("keeps each business's menu apart (old products stay in main)", async () => {
    const { t, token } = await setup();
    const main = await t.query(api.pos.catalog, { session: token });
    const wine = await t.query(api.pos.catalog, {
      session: token,
      company: "vinomad",
    });
    expect(main?.products.map((p) => p.id)).toEqual(["caipirinha"]);
    expect(wine?.products.map((p) => p.id)).toEqual(["norton"]);
    const list = await t.query(api.pos.companies, { session: token });
    expect(list?.map((c) => c.key)).toEqual(["main", "vinomad"]);
    expect(list?.[1]).toMatchObject({ name: "Vinomad", wine: true });
  });

  it("numbers orders per business and lists them apart", async () => {
    const { t, token } = await setup();
    const a = await t.mutation(api.pos.createOrder, {
      session: token,
      cid: "a",
      tableId: null,
      name: "",
    });
    const b = await t.mutation(api.pos.createOrder, {
      session: token,
      cid: "b",
      tableId: null,
      name: "",
      company: "vinomad",
    });
    expect([a, b]).toEqual([1, 1]);
    const open = await t.query(api.pos.openOrders, {
      session: token,
      company: "vinomad",
    });
    expect(open?.map((o) => o.id)).toEqual(["b"]);
  });

  it("blocks a user from a business they don't work in", async () => {
    const { t, token } = await setup();
    await t.mutation(api.staff.save, {
      session: token,
      name: "Ana",
      role: "waiter",
      perms: [],
      color: "#111",
      active: true,
      pin: "5555",
      companies: ["main"],
    });
    const ana = await t.mutation(api.staff.login, { pin: "5555", device: "t" });
    if (!ana.token) {
      throw new Error("login failed");
    }
    expect(
      await t.query(api.pos.catalog, { session: ana.token, company: "vinomad" })
    ).toBeNull();
    await expect(
      t.mutation(api.pos.createOrder, {
        session: ana.token,
        cid: "x",
        tableId: null,
        name: "",
        company: "vinomad",
      })
    ).rejects.toThrow("POS_FORBIDDEN");
    const list = await t.query(api.pos.companies, { session: ana.token });
    expect(list?.map((c) => c.key)).toEqual(["main"]);
  });

  it("takes a glass's share of the bottle out of stock", async () => {
    const { t, token } = await setup();
    await t.mutation(api.pos.createOrder, {
      session: token,
      cid: "o",
      tableId: null,
      name: "",
      company: "vinomad",
    });
    await t.mutation(api.pos.addItem, {
      session: token,
      orderId: "o",
      item: {
        id: "i1",
        productId: "norton",
        name: "norton · 125 ml",
        price: 6.5,
        qty: 2,
        sent: false,
        portion: 1 / 6,
      },
    });
    await t.mutation(api.pos.pay, {
      session: token,
      orderId: "o",
      payment: { method: "cash", amount: 13, tip: 0 },
      day: "2026-11-02",
      hour: "20",
    });
    const wine = await t.query(api.pos.catalog, {
      session: token,
      company: "vinomad",
    });
    expect(wine?.products[0]?.stock).toBeCloseTo(2 - 2 / 6, 3);
    const days = await t.query(api.pos.daily, {
      session: token,
      from: "2026-11-01",
      to: "2026-11-03",
      company: "vinomad",
    });
    expect(days.map((d) => d.sales)).toEqual([13]);
    const mainDays = await t.query(api.pos.daily, {
      session: token,
      from: "2026-11-01",
      to: "2026-11-03",
    });
    expect(mainDays).toEqual([]);
  });
});
