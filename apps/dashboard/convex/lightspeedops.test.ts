import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

type Call = { method: string; path: string; body: Record<string, unknown> | null };

function fakeLightspeed(opts: { sales?: unknown[] } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body =
        init?.body && typeof init.body === "string" && init.body.startsWith("{")
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;
      calls.push({ method, path: url.pathname, body });
      const json = (b: unknown, status = 200) =>
        new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      const p = url.pathname;
      if (p.endsWith("/token")) {
        return json({ access_token: "acc", refresh_token: "ref", expires_in: 1500, refresh_expires_in: 0 });
      }
      if (p === "/o/op/data/businesses") return json([{ id: 1, name: "Biz", businessLocations: [{ id: 55, name: "Bar" }] }]);
      if (p === "/o/op/1/menu/list") return json([]);
      if (p === "/items/v1/items" && method === "GET") {
        return json([
          { id: 901, name: "Gin & Tonic", sku: "GT", itemType: "ITEM", prices: [{ amount: 9 }], costPrice: 2, accountingGroup: { id: 3, name: "Drinks" } },
          { id: 902, name: "Ice", sku: "ICE", itemType: "MODIFIER" },
        ]);
      }
      if (p === "/f/finance/55/paymentMethods") return json({ _embedded: { paymentMethodList: [{ code: "CASH", name: "Cash" }, { code: "CARD", name: "Card" }] } });
      if (p === "/f/finance/55/accountingGroups") return json({ _embedded: { accountingGroupList: [{ accountingGroupId: 3, name: "Drinks" }] } });
      if (p === "/o/wh/1/webhook" || p.startsWith("/o/wh/1/webhook/")) return json({});
      if (p === "/o/op/data/55/floorplans") return json([]);
      if (p === "/o/op/1/order/table/getCheck") return json([]);
      if (p === "/f/v2/business-location/55/sales") return json({ sales: opts.sales ?? [] });
      if (p === "/o/op/1/order/local" || p === "/o/op/1/pay") return json({ status: "OK" });
      if (p === "/o/op/1/printMsg") return json({});
      if (p === "/items/v1/items" && method === "POST") return json({ id: 999 }, 201);
      if (p.startsWith("/items/v1/items/") && method === "PUT") return json({});
      return json({ error: "nope" }, 404);
    })
  );
  return calls;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function connected(opts: { sales?: unknown[] } = {}) {
  vi.useFakeTimers();
  const calls = fakeLightspeed(opts);
  const t = convexTest(schema, modules);
  const p = t.withIdentity(panel);
  const { token: session } = await p.mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(internal.pos.importMenu, {
    company: "bar",
    currency: "EUR",
    profile: { name: "Bar", color: "#000" },
    products: [
      { id: "gin", name: "Gin", category: "Stock", price: 0, color: "#000", available: false, trackStock: true, stock: 10, unit: "dose" },
      { id: "gt", name: "Gin & Tonic", category: "Drinks", price: 9, color: "#000", available: true, sku: "GT", recipe: [{ productId: "gin", qty: 2 }] },
    ],
  });
  await p.mutation(api.lightspeed.configure, { env: "trial", clientId: "cb-client", clientSecret: "s3cret" });
  const auth = new URL(await p.mutation(api.lightspeed.startAuth, { returnTo: "https://app.test/configuracoes" }));
  await t.fetch(`/lightspeed/callback?code=x&state=${auth.searchParams.get("state")}`);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await p.mutation(api.lightspeed.mapLocation, { locationId: 55, company: "bar", enabled: true });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, p, session, calls };
}

const secretOf = (calls: Call[]) => {
  const put = calls.find((c) => c.method === "PUT" && c.path === "/o/wh/1/webhook");
  return new URL(String(put?.body?.url)).searchParams.get("k") ?? "";
};

describe("Lightspeed control (part 2)", () => {
  it("syncs editable items, payment methods and registers the webhook", async () => {
    const { t, session, calls } = await connected();
    const opts = await t.query(api.lightspeedops.options, { session, company: "bar" });
    expect(opts).toMatchObject({ webhook: true, skus: 1, unmatched: 0 });
    expect(opts?.paymentMethods.map((m) => m.code)).toEqual(["CASH", "CARD"]);
    const cat = await t.query(api.lightspeedops.catalog, { session, company: "bar" });
    expect(cat?.map((i) => [i.itemId, i.name, i.price, i.cost])).toEqual([[901, "Gin & Tonic", 9, 2]]);
    expect(secretOf(calls)).toHaveLength(48);
  });

  it("sends an order once, then the POS confirms it via webhook", async () => {
    const { t, session, calls } = await connected();
    const send = () =>
      t.mutation(api.lightspeedops.sendOrder, {
        session,
        company: "bar",
        ref: "order-0001-abcd",
        table: "12",
        covers: 2,
        items: [{ sku: "GT", qty: 2, name: "Gin & Tonic", price: 9 }],
      });
    await send();
    await send(); // double tap: same reference
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const orders = calls.filter((c) => c.path === "/o/op/1/order/local");
    expect(orders).toHaveLength(1);
    expect(orders[0]?.body).toMatchObject({
      businessLocationId: 55,
      thirdPartyReference: "order-0001-abcd",
      endpointId: "casa-brasa",
      tableNumber: "12",
      clientCount: 2,
      items: [{ sku: "GT", quantity: 2 }],
    });
    let ops = await t.query(api.lightspeedops.ops, { session, company: "bar" });
    expect(ops?.[0]).toMatchObject({ kind: "order", status: "sent" });

    // Bad secret is refused; the right one confirms
    expect((await t.fetch("/lightspeed/webhook?k=wrong", { method: "POST", body: "{}" })).status).toBe(403);
    const res = await t.fetch(`/lightspeed/webhook?k=${secretOf(calls)}`, {
      method: "POST",
      body: JSON.stringify({ thirdPartyReference: "order-0001-abcd", status: "SUCCESS", businessLocationId: 55, ikentooAccountIdentifier: "A12.3" }),
    });
    expect(res.status).toBe(200);
    ops = await t.query(api.lightspeedops.ops, { session, company: "bar" });
    expect(ops?.[0]).toMatchObject({ status: "done", result: "Confirmado pelo POS." });
  });

  it("closes a check with a payment and reports a refusal", async () => {
    const { t, session, calls } = await connected();
    await t.mutation(api.lightspeedops.payCheck, {
      session, company: "bar", ref: "pay-0001-abcd", account: "A12.3", table: "12", method: "CARD", amount: 18, tip: 2,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.find((c) => c.path === "/o/op/1/pay")?.body).toMatchObject({
      iKaccountIdentifier: "A12.3", paymentMethod: "CARD", paymentAmount: 18, tipAmount: 2, endpointId: "casa-brasa",
    });
    await t.fetch(`/lightspeed/webhook?k=${secretOf(calls)}`, {
      method: "POST",
      body: JSON.stringify({ thirdPartyReference: "pay-0001-abcd", status: "FAILURE", errors: { account: { type: "OVERPAID" } } }),
    });
    const ops = await t.query(api.lightspeedops.ops, { session, company: "bar" });
    expect(ops?.[0]?.result).toContain("OVERPAID");
    await expect(
      t.mutation(api.lightspeedops.payCheck, { session, company: "bar", ref: "pay-0002-abcd", account: "A1", method: "BITCOIN", amount: 5, tip: 0 })
    ).rejects.toThrow();
  });

  it("creates and edits back-office items and sends messages", async () => {
    const { t, session, calls } = await connected();
    await t.mutation(api.lightspeedops.saveItem, {
      session, company: "bar", ref: "item-0001-abcd", itemId: 901, name: "Gin Tonic", sku: "GT", price: 9.5, cost: 2.2, active: true, groupId: 3,
    });
    await t.mutation(api.lightspeedops.printMessage, { session, company: "bar", ref: "msg-0001-abcd", message: "Mesa 12 pediu a conta", toPrinter: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.find((c) => c.method === "PUT" && c.path === "/items/v1/items/901")?.body).toMatchObject({
      name: "Gin Tonic", defaultPrice: 9.5, costPrice: 2.2, accountingGroupId: 3, businessLocationId: 55,
    });
    expect(calls.find((c) => c.path === "/o/op/1/printMsg")?.body).toEqual({ message: "Mesa 12 pediu a conta", alsoToPrinter: true });
  });

  it("takes stock out of the own inventory for each Lightspeed sale (recipes too)", async () => {
    const sale = {
      receiptId: "R1",
      timeClosed: new Date().toISOString(),
      salesLines: [{ id: "1", name: "Gin & Tonic", sku: "GT", quantity: "3", totalNetAmountWithTax: "27" }],
      payments: [],
    };
    const { t, session } = await connected({ sales: [sale] });
    // Sales synced before switching on do not count
    await t.mutation(api.lightspeedops.setStockFromSales, { session, company: "bar", on: true });
    await t.mutation(internal.lightspeed.saveSales, {
      locationId: 55,
      sales: [{ receiptId: "R2", closedAt: Date.now(), openedAt: Date.now(), cancelled: false, table: "", covers: 0, staff: "", total: 9, tax: 0, tips: 0, payments: [], lines: [{ sku: "GT", name: "Gin & Tonic", qty: 1, total: 9, group: "" }] }],
    });
    const gin = await t.run(async (ctx) =>
      ctx.db.query("posProducts").withIndex("by_cid", (q) => q.eq("cid", "gin")).unique()
    );
    expect(gin?.stock).toBe(8);
    // Voided later: stock comes back
    await t.mutation(internal.lightspeed.saveSales, {
      locationId: 55,
      sales: [{ receiptId: "R2", closedAt: Date.now(), openedAt: Date.now(), cancelled: true, table: "", covers: 0, staff: "", total: 9, tax: 0, tips: 0, payments: [], lines: [{ sku: "GT", name: "Gin & Tonic", qty: 1, total: 9, group: "" }] }],
    });
    const back = await t.run(async (ctx) =>
      ctx.db.query("posProducts").withIndex("by_cid", (q) => q.eq("cid", "gin")).unique()
    );
    expect(back?.stock).toBe(10);
  });
});
