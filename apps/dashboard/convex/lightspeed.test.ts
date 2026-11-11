import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

// Shapes from the K-Series OpenAPI (api-docs.lsk.lightspeed.app/source.json)
const BUSINESSES = [{ id: 7, name: "Vinomad Ltd", businessLocations: [{ id: 4242, name: "Vinomad Sliema" }] }];
const MENUS = [{ menuName: "Main", ikentooMenuId: 11 }];
const MENU = {
  menuName: "Main",
  menuEntryGroups: [
    {
      "@type": "group",
      id: "1",
      name: "Wines",
      menuEntry: [
        { "@type": "menuItem", productName: "Merlot glass", productPrice: 6.5, sku: "W1", color: "red" },
        {
          "@type": "group",
          id: "2",
          name: "Sparkling",
          menuEntry: [{ "@type": "menuItem", productName: "Prosecco", productPrice: 7, sku: "W2" }],
        },
      ],
    },
    { "@type": "group", id: "3", name: "Food", menuEntry: [{ "@type": "menuItem", productName: "Olives", productPrice: 4, sku: "F1" }] },
  ],
};
const FLOORS = [
  { id: 900, name: "Terrace", tables: [
    { id: "t1", number: 1, defaultClientCount: 4, active: true },
    { id: "t2", number: 2, defaultClientCount: 2, active: true },
    { id: "t3", number: 3, defaultClientCount: 2, active: false },
  ] },
];
const CHECKS = [
  { uuid: "c1", number: 31, tableNumber: 1, clientCount: 3, currentAmount: 19.5, paidAmount: 0, staffName: "Ana", openDate: "2026-11-10T19:00:00Z", salesEntries: [{ itemName: "Merlot glass", quantity: 3, amountWithTax: 19.5, active: true }] },
];
const SALE = (id: string, at: string, total: string) => ({
  receiptId: id,
  timeClosed: at,
  timeOfOpening: at,
  cancelled: false,
  tableName: "1",
  nbCovers: 2,
  ownerName: "Ana",
  salesLines: [
    { id: "l1", name: "Merlot glass", sku: "W1", quantity: "2", totalNetAmountWithTax: total, taxAmount: "1.50", accountingGroup: { name: "Wine" } },
    { id: "l2", parentLineId: "l1", name: "Ice", sku: "M1", quantity: "1", totalNetAmountWithTax: "0" },
  ],
  payments: [{ code: "CARD", description: "Card", netAmountWithTax: total, tip: "1.00" }],
});

function fakeLightspeed() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.pathname.endsWith("/token")) {
        const body = String(init?.body);
        expect(String((init?.headers as Record<string, string>).authorization)).toMatch(/^Basic /);
        return json({
          access_token: `acc-${calls.length}`,
          refresh_token: body.includes("refresh_token=") ? `ref-${calls.length}` : "ref-1",
          expires_in: 1500,
          refresh_expires_in: 0,
          scope: "orders-api financial-api",
        });
      }
      if (url.pathname === "/o/op/data/businesses") return json(BUSINESSES);
      if (url.pathname === "/items/v1/items") return json([]);
      if (url.pathname.startsWith("/f/finance/")) return json({});
      if (url.pathname.startsWith("/o/wh/1/webhook")) return json({});
      if (url.pathname === "/o/op/1/menu/list") return json(MENUS);
      if (url.pathname === "/o/op/2/menu/load/11") return json(MENU);
      if (url.pathname === "/o/op/data/4242/floorplans") return json(FLOORS);
      if (url.pathname === "/o/op/1/order/table/getCheck") return json(CHECKS);
      if (url.pathname === "/f/v2/business-location/4242/sales") {
        return url.searchParams.get("nextPageToken")
          ? json({ sales: [SALE("R2", "2026-11-10T21:00:00Z", "13.00")] })
          : json({ sales: [SALE("R1", "2026-11-10T20:00:00Z", "13.00")], nextPageToken: "p2" });
      }
      return json({ error: "not found" }, 404);
    })
  );
  return calls;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(internal.pos.importMenu, {
    company: "vinomad",
    currency: "EUR",
    profile: { name: "Vinomad", color: "#000" },
    products: [{ id: "old", name: "Olives", category: "Petiscos", price: 3.5, color: "#000", available: true }],
  });
  return { t, session: token };
}

describe("Lightspeed mode", () => {
  it("keeps secrets server-side and builds the OAuth URL", async () => {
    const { t } = await setup();
    const p = t.withIdentity(panel);
    await p.mutation(api.lightspeed.configure, { env: "trial", clientId: "casa-brasa", clientSecret: "s3cret" });
    const st = await p.query(api.lightspeed.status, {});
    expect(st?.hasClient).toBe(true);
    expect(JSON.stringify(st)).not.toContain("s3cret");
    const url = new URL(await p.mutation(api.lightspeed.startAuth, { returnTo: "https://app.test/configuracoes" }));
    expect(url.origin).toBe("https://auth.lsk-demo.app");
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/lightspeed\/callback$/);
    // Browsers without the panel code get nothing
    expect(await t.query(api.lightspeed.status, {})).toBeNull();
  });

  it("connects, syncs a linked location and imports menu and tables", async () => {
    vi.useFakeTimers();
    const calls = fakeLightspeed();
    const { t, session } = await setup();
    const p = t.withIdentity(panel);
    await p.mutation(api.lightspeed.configure, { env: "trial", clientId: "casa-brasa", clientSecret: "s3cret" });
    const auth = new URL(await p.mutation(api.lightspeed.startAuth, { returnTo: "https://app.test/configuracoes" }));
    const res = await t.fetch(`/lightspeed/callback?code=abc&state=${auth.searchParams.get("state")}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("lightspeed=ok");
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    let st = await p.query(api.lightspeed.status, {});
    expect(st?.connected).toBe(true);
    expect(st?.locations).toEqual([expect.objectContaining({ locationId: 4242, company: null })]);

    await p.mutation(api.lightspeed.mapLocation, { locationId: 4242, company: "vinomad", enabled: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    st = await p.query(api.lightspeed.status, {});
    expect(st?.locations[0]?.error).toBeNull();

    const link = await t.query(api.lightspeed.link, { session, company: "vinomad" });
    expect(link?.name).toBe("Vinomad Sliema");
    const menu = await t.query(api.lightspeed.menu, { session, company: "vinomad" });
    expect(menu?.map((i) => [i.name, i.group, i.subgroup ?? null])).toEqual([
      ["Merlot glass", "Wines", null],
      ["Prosecco", "Wines", "Sparkling"],
      ["Olives", "Food", null],
    ]);
    const floor = await t.query(api.lightspeed.floor, { session, company: "vinomad" });
    expect(floor?.floors[0]?.tables).toHaveLength(2);
    expect(floor?.checks[0]).toMatchObject({ table: 1, total: 19.5 });
    // Both pages of sales; modifier lines are not double counted
    const ov = await t.query(api.lightspeed.overview, { session, company: "vinomad", from: 0, to: Date.now() });
    expect(ov).toMatchObject({ receipts: 2, total: 26, tips: 2, covers: 4 });
    expect(ov?.top[0]).toMatchObject({ name: "Merlot glass", qty: 4 });

    const imported = await t.mutation(api.lightspeed.importMenu, { session, company: "vinomad" });
    expect(imported).toEqual({ created: 2, updated: 1 });
    const tables = await t.mutation(api.lightspeed.importFloor, { session, company: "vinomad" });
    expect(tables).toEqual({ floors: 1, added: 2 });
    // Importing again adds nothing
    expect(await t.mutation(api.lightspeed.importFloor, { session, company: "vinomad" })).toEqual({ floors: 1, added: 0 });
    expect(calls.filter((c) => c.endsWith("/token"))).toHaveLength(1);
  });

  it("refuses a callback with an unknown state", async () => {
    const { t } = await setup();
    const res = await t.fetch("/lightspeed/callback?code=abc&state=nope");
    expect(res.status).toBe(400);
  });
});
