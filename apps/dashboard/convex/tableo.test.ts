import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/reservations/engine";
import {
  autoMap,
  createBody,
  localParts,
  mergeStatus,
  parseBooking,
  patchBody,
  posTablesOf,
  serviceDate,
  signTableo,
  statusCall,
  statusFromTableo,
  tableKey,
  tableoTablesOf,
  verifyTableoSignature,
} from "../lib/reservations/tableo";
import { api } from "./_generated/api";
import { finishTableBooking } from "./reservations";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };
const SECRET = "whsec_test_secret";
const HOOK = "a".repeat(64);

/** Example booking of the Tableo docs (Show Booking). */
const SAMPLE = {
  id: 123,
  reference: "API-ABC123",
  status: "confirmed",
  fsm_status: "accepted",
  date: "2026-11-13T19:00:00+01:00",
  end_time: "2026-11-13T21:00:00+01:00",
  adults: 4,
  children: 1,
  comment: "Window seat",
  private_comment: "VIP guest",
  dining_area: { id: 10, name: "Main Hall" },
  tables: [{ id: 1, name: "T1", min_covers: 2, max_covers: 4 }],
  patron: {
    id: 456,
    name: "John Doe",
    email: "John@Example.com",
    mobile_number: "+35612345678",
    tags: { is_vip: true },
  },
  booking_tags: [{ id: 1, name: "Birthday", icon: "cake" }],
  booking_source: { id: 3, name: "Online Widget" },
};

describe("Tableo helpers", () => {
  it("reads a booking in the venue's time zone", () => {
    const b = parseBooking(SAMPLE, { timeZone: "Europe/Malta" });
    expect(b).toMatchObject({
      id: 123,
      ref: "API-ABC123",
      status: "confirmed",
      date: "2026-11-13",
      time: "19:00",
      duration: 120,
      party: 5,
      name: "John Doe",
      email: "john@example.com",
      phone: "+35612345678",
      areaId: 10,
      vip: true,
      tags: ["Birthday"],
      channel: "Online Widget",
    });
    expect(localParts("2026-11-13T18:00:00Z", "Europe/Malta")).toEqual({
      date: "2026-11-13",
      time: "19:00",
    });
    // No offset: the wall clock as written
    expect(localParts("2026-11-13T19:00:00", "Europe/Malta")?.time).toBe(
      "19:00"
    );
  });

  it("maps Tableo statuses", () => {
    expect(statusFromTableo("accepted")).toBe("confirmed");
    expect(statusFromTableo("arrived_in_service")).toBe("seated");
    expect(statusFromTableo("no-show")).toBe("no_show");
    expect(statusFromTableo("rejected")).toBe("cancelled");
    expect(statusFromTableo("pending")).toBe("pending");
    // Tableo never moves a seated/finished table back; cancellations win
    expect(mergeStatus("seated", "confirmed")).toBe("seated");
    expect(mergeStatus("completed", "seated")).toBe("completed");
    expect(mergeStatus("seated", "cancelled")).toBe("cancelled");
    expect(mergeStatus("confirmed", "seated")).toBe("seated");
  });

  it("keeps late-night bookings on the service date", () => {
    // Friday 2026-11-13 is open until 01:00
    expect(serviceDate(DEFAULT_SETTINGS, "2026-11-14", "00:30")).toBe(
      "2026-11-13"
    );
    expect(serviceDate(DEFAULT_SETTINGS, "2026-11-14", "13:00")).toBe(
      "2026-11-14"
    );
  });

  it("links tables by name and back", () => {
    expect(tableKey("T01")).toBe("1");
    expect(tableKey("Mesa 12")).toBe("12");
    expect(tableKey("Table 3")).toBe("3");
    const areas = [
      {
        id: 10,
        name: "Inside",
        tables: [
          { id: 1, name: "T1", min: 2, max: 4 },
          { id: 2, name: "T2", min: 2, max: 2 },
          { id: 3, name: "Bar 1", min: 1, max: 2 },
        ],
      },
    ];
    const pos = [
      { id: "p1", name: "1", area: "Inside" },
      { id: "p2", name: "2", area: "Inside" },
    ];
    const map = autoMap(areas, pos, { "3": "p2" });
    // Manual link kept, so T2 cannot take p2 again
    expect(map).toEqual({ "1": "p1", "3": "p2" });
    expect(posTablesOf([{ id: 1 }, { id: 9 }], map)).toEqual(["p1"]);
    expect(tableoTablesOf(["p2", "zz"], map)).toEqual([3]);
  });

  it("builds request bodies", () => {
    const local = {
      name: "Ana Maria Silva",
      phone: "+35699990000",
      email: "ana@x.mt",
      date: "2026-11-13",
      time: "20:00",
      duration: 90,
      party: 3,
      requests: "Cadeira de bebé",
    };
    expect(createBody(local, 10)).toEqual({
      date: "2026-11-13T20:00:00",
      adults: 3,
      children: 0,
      dining_area_id: 10,
      comment: "Cadeira de bebé",
      patron: {
        first_name: "Ana",
        last_name: "Maria Silva",
        email: "ana@x.mt",
        mobile_number: "+35699990000",
        mobile_prefix: "+356",
      },
    });
    expect(patchBody(local, { tableIds: [1, 3] })).toMatchObject({
      booking_date: "2026-11-13",
      booking_time: "20:00",
      duration: 90,
      table_ids: [1, 3],
    });
    expect(statusCall("seated", "confirmed")).toEqual({ path: "check-in" });
    expect(statusCall("confirmed", "pending")?.body).toEqual({
      status: "accepted",
    });
    expect(statusCall("completed", "seated")).toBeNull();
  });

  it("verifies Tableo signatures", async () => {
    const body = '{"id":"evt_1"}';
    const t = 1_800_000_000;
    const v1 = await signTableo(SECRET, `${t}.${body}`);
    const header = `t=${t},v1=${v1}`;
    expect(
      await verifyTableoSignature({
        body,
        secret: SECRET,
        header,
        nowSec: t + 10,
      })
    ).toBe(true);
    // Replay outside 5 minutes, wrong secret, edited body
    expect(
      await verifyTableoSignature({
        body,
        secret: SECRET,
        header,
        nowSec: t + 400,
      })
    ).toBe(false);
    expect(
      await verifyTableoSignature({ body, secret: "x", header, nowSec: t })
    ).toBe(false);
    expect(
      await verifyTableoSignature({
        body: `${body} `,
        secret: SECRET,
        header,
        nowSec: t,
      })
    ).toBe(false);
    const legacy = `sha256=${await signTableo(SECRET, body)}`;
    expect(await verifyTableoSignature({ body, secret: SECRET, legacy })).toBe(
      true
    );
  });
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("posMeta", {
      key: "the-brew",
      areas: [
        {
          id: "a",
          name: "Main Hall",
          tables: [
            {
              id: "p1",
              name: "1",
              seats: 4,
              x: 0,
              y: 0,
              w: 1,
              h: 1,
              shape: "square",
              color: "#000",
            },
          ],
        },
      ],
      settings: {},
      receipt: {},
      nextOrderNumber: 1,
    });
    await ctx.db.insert("tableoLinks", {
      company: "the-brew",
      env: "sandbox",
      token: "t".repeat(40),
      hookKey: HOOK,
      webhookId: 1,
      secret: SECRET,
      areas: [
        {
          id: 10,
          name: "Main Hall",
          tables: [{ id: 1, name: "T1", min: 2, max: 4 }],
        },
      ],
      tableMap: { "1": "p1" },
      push: false,
      state: "active",
      timezone: "Europe/Malta",
      createdAt: 0,
      updatedAt: 0,
    });
  });
  return t;
}

async function deliver(
  t: Awaited<ReturnType<typeof setup>>,
  event: string,
  booking: unknown,
  id: string,
  secret = SECRET
) {
  const body = JSON.stringify({ id, event, data: { booking } });
  const ts = Math.floor(Date.now() / 1000);
  const v1 = await signTableo(secret, `${ts}.${body}`);
  return await t.fetch(`/tableo/webhook?k=${HOOK}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Tableo-Signature": `t=${ts},v1=${v1}`,
      "X-Webhook-Id": id,
      "X-Webhook-Event": event,
    },
    body,
  });
}

describe("Tableo webhook", () => {
  it("creates, updates and cancels a booking in real time", async () => {
    const t = await setup();
    const p = t.withIdentity(panel);
    expect((await deliver(t, "booking.created", SAMPLE, "evt_1")).status).toBe(
      200
    );
    let day = await p.query(api.reservations.day, {
      company: "the-brew",
      date: "2026-11-13",
    });
    expect(day?.reservations).toHaveLength(1);
    expect(day?.reservations[0]).toMatchObject({
      name: "John Doe",
      time: "19:00",
      party: 5,
      tables: ["p1"],
      status: "confirmed",
      source: "tableo",
      tableoRef: "API-ABC123",
      vip: true,
    });
    // Same delivery again (at-least-once): ignored
    await deliver(t, "booking.created", SAMPLE, "evt_1");
    // Moved to 20:30 for 6 people
    const moved = {
      ...SAMPLE,
      date: "2026-11-13T20:30:00+01:00",
      end_time: "2026-11-13T22:30:00+01:00",
      adults: 6,
      children: 0,
    };
    await deliver(t, "booking.updated", moved, "evt_2");
    // Seated event, then a cancellation
    await deliver(
      t,
      "booking.seated",
      { ...moved, status: "arrived" },
      "evt_3"
    );
    day = await p.query(api.reservations.day, {
      company: "the-brew",
      date: "2026-11-13",
    });
    expect(day?.reservations).toHaveLength(1);
    expect(day?.reservations[0]).toMatchObject({
      time: "20:30",
      party: 6,
      status: "seated",
    });
    await deliver(
      t,
      "booking.cancelled",
      { ...SAMPLE, status: "cancelled" },
      "evt_4"
    );
    day = await p.query(api.reservations.day, {
      company: "the-brew",
      date: "2026-11-13",
    });
    expect(day?.reservations[0]?.status).toBe("cancelled");
    const status = await p.query(api.tableo.status, { company: "the-brew" });
    expect(
      status?.events.filter((e) => e.kind.startsWith("booking."))
    ).toHaveLength(4);
    // The token never reaches the browser
    expect(JSON.stringify(status)).not.toContain("tttttttt");
    expect(JSON.stringify(status)).not.toContain(SECRET);
  });

  it("refuses unsigned or forged deliveries", async () => {
    const t = await setup();
    expect(
      (await deliver(t, "booking.created", SAMPLE, "e1", "wrong")).status
    ).toBe(401);
    const res = await t.fetch(`/tableo/webhook?k=${"b".repeat(64)}`, {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(404);
    const day = await t.withIdentity(panel).query(api.reservations.day, {
      company: "the-brew",
      date: "2026-11-13",
    });
    expect(day?.reservations).toHaveLength(0);
  });

  it("finishes the booking when the POS closes the table", async () => {
    const t = await setup();
    await deliver(t, "booking.seated", { ...SAMPLE, status: "arrived" }, "e1");
    await t.run(async (ctx) => {
      await finishTableBooking(
        ctx,
        "the-brew",
        "p1",
        "2026-11-13",
        "POS · Ana"
      );
    });
    const day = await t.withIdentity(panel).query(api.reservations.day, {
      company: "the-brew",
      date: "2026-11-13",
    });
    expect(day?.reservations[0]?.status).toBe("completed");
  });
});
