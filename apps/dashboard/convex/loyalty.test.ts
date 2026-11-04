import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

const product = (id: string, extra: object = {}) => ({
  id,
  name: id,
  category: "Coffee",
  price: 3,
  color: "#000",
  available: true,
  ...extra,
});

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
      product("espresso"),
      product("burger", { category: "Food", price: 20 }),
    ],
  });
  let n = 0;
  const order = async (
    items: { productId: string; price: number; qty: number }[]
  ) => {
    const cid = `o${++n}`;
    await t.mutation(api.pos.createOrder, {
      session: token,
      cid,
      tableId: null,
      name: "",
      company: "bar",
    });
    for (const [k, i] of items.entries()) {
      await t.mutation(api.pos.addItem, {
        session: token,
        orderId: cid,
        item: { id: `${cid}-${k}`, name: i.productId, sent: false, ...i },
      });
    }
    return cid;
  };
  const pay = (cid: string, amount: number) =>
    t.mutation(api.pos.pay, {
      session: token,
      orderId: cid,
      payment: { method: "cash", amount, tip: 0 },
      day: "2026-11-04",
      hour: "12",
    });
  const lines = async (cid: string) => {
    const open = await t.query(api.pos.openOrders, {
      session: token,
      company: "bar",
    });
    return open?.find((o) => o.id === cid)?.items ?? [];
  };
  return { t, token, order, pay, lines };
}

describe("loyalty", () => {
  it("finds customers and gives VIP discounts", async () => {
    const { t, token, order, lines } = await setup();
    const id = await t.mutation(api.loyalty.saveCustomer, {
      session: token,
      name: "Maria Borg",
      phone: "+356 9912 3456",
      vip: 10,
    });
    const byPhone = await t.query(api.loyalty.searchCustomers, {
      session: token,
      q: "35699123456",
    });
    expect(byPhone.map((c) => c.name)).toEqual(["Maria Borg"]);
    await expect(
      t.mutation(api.loyalty.saveCustomer, {
        session: token,
        name: "Outra",
        phone: "35699123456",
      })
    ).rejects.toThrow("Maria Borg");
    const cid = await order([{ productId: "burger", price: 20, qty: 1 }]);
    await t.mutation(api.loyalty.attachCustomer, {
      session: token,
      orderId: cid,
      customerId: id,
    });
    const vip = (await lines(cid)).find((i) => i.id.startsWith("vip:"));
    expect(vip?.price).toBe(-2);
  });

  it("stamps a punch card and redeems the reward", async () => {
    const { t, token, order, pay, lines } = await setup();
    const customerId = await t.mutation(api.loyalty.saveCustomer, {
      session: token,
      name: "João",
    });
    const programId = await t.mutation(api.loyalty.saveProgram, {
      session: token,
      company: "bar",
      name: "Café",
      categories: ["Coffee"],
      productIds: [],
      stamps: 5,
      reward: "free",
      rewardValue: 0,
      active: true,
    });
    const first = await order([{ productId: "espresso", price: 3, qty: 5 }]);
    await t.mutation(api.loyalty.attachCustomer, {
      session: token,
      orderId: first,
      customerId,
    });
    await pay(first, 15);
    const second = await order([{ productId: "espresso", price: 3, qty: 1 }]);
    await t.mutation(api.loyalty.attachCustomer, {
      session: token,
      orderId: second,
      customerId,
    });
    const off = await t.mutation(api.loyalty.redeemReward, {
      session: token,
      orderId: second,
      programId,
    });
    expect(off).toBe(3);
    expect((await lines(second)).some((i) => i.id.startsWith("reward:"))).toBe(
      true
    );
    await pay(second, 0);
    const c = await t.query(api.loyalty.customer, {
      session: token,
      id: customerId,
    });
    // 5 stamps − 5 used + 1 earned
    expect(c?.programs[0]?.count).toBe(1);
    expect(c?.visits).toBe(2);
    expect(c?.spent).toBe(15);
    expect(c?.orders).toHaveLength(2);
  });

  it("sells, activates and spends a gift card", async () => {
    const { t, token, order, pay } = await setup();
    const sale = await order([]);
    const code = await t.mutation(api.loyalty.sellGiftCard, {
      session: token,
      orderId: sale,
      amount: 50,
    });
    let g = await t.query(api.loyalty.giftLookup, { session: token, code });
    expect(g?.active).toBe(false);
    await pay(sale, 50);
    g = await t.query(api.loyalty.giftLookup, { session: token, code });
    expect(g?.active).toBe(true);
    const dinner = await order([{ productId: "burger", price: 20, qty: 1 }]);
    const used = await t.mutation(api.loyalty.redeemGiftCard, {
      session: token,
      orderId: dinner,
      code: code.toLowerCase(),
    });
    expect(used).toEqual({ used: 20, left: 30 });
    await pay(dinner, 0);
    g = await t.query(api.loyalty.giftLookup, { session: token, code });
    expect(g?.balance).toBe(30);
    // Gift card sales are not counted as the customer's spending
    const days = await t.query(api.pos.daily, {
      session: token,
      from: "2026-11-04",
      to: "2026-11-04",
      company: "bar",
    });
    expect(days.length).toBe(1);
  });

  it("does not let a card pay twice its balance", async () => {
    const { t, token, order, pay } = await setup();
    const sale = await order([]);
    const code = await t.mutation(api.loyalty.sellGiftCard, {
      session: token,
      orderId: sale,
      amount: 20,
    });
    await pay(sale, 20);
    const a = await order([{ productId: "burger", price: 20, qty: 1 }]);
    const b = await order([{ productId: "burger", price: 20, qty: 1 }]);
    await t.mutation(api.loyalty.redeemGiftCard, {
      session: token,
      orderId: a,
      code,
    });
    await t.mutation(api.loyalty.redeemGiftCard, {
      session: token,
      orderId: b,
      code,
    });
    await pay(a, 0);
    await expect(pay(b, 0)).rejects.toThrow("sem saldo");
  });
});
