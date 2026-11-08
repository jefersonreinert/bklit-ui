import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  serviceMin,
  slots,
  suggestTables,
  type TableInfo,
} from "../lib/reservations/engine";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };
const REF = /^TB-[A-Z2-9]{5}$/;

const TABLES: TableInfo[] = [
  { id: "t2", name: "2", seats: 2, area: "Inside" },
  { id: "t4", name: "4", seats: 4, area: "Inside" },
  { id: "t4b", name: "5", seats: 4, area: "Inside" },
];

/** A venue with a small floor plan in the POS. */
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("posMeta", {
      key: "the-brew",
      areas: [
        {
          id: "a",
          name: "Inside",
          tables: TABLES.map((x) => ({
            ...x,
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            shape: "square",
            color: "#000",
          })),
        },
      ],
      settings: {},
      receipt: {},
      nextOrderNumber: 1,
    });
  });
  return { t, p: t.withIdentity(panel) };
}

// 2026-11-13 is a Friday (open 12:00–01:00 by default)
const base = {
  company: "the-brew",
  source: "phone",
  name: "Ana Silva",
  phone: "+356 9999 0000",
  date: "2026-11-13",
  time: "20:00",
  party: 2,
};

describe("Reservation engine", () => {
  it("keeps late-night times on the same service day", () => {
    expect(serviceMin(DEFAULT_SETTINGS, "2026-11-13", "00:30")).toBe(1470);
    expect(serviceMin(DEFAULT_SETTINGS, "2026-11-13", "12:00")).toBe(720);
  });

  it("offers slots only while a table fits", () => {
    const s = slots(DEFAULT_SETTINGS, "2026-11-13", 6, [], TABLES);
    // 6 people → 2 + 4 seats combined (no spare seat), not 4 + 4
    expect(s[0]).toMatchObject({ time: "12:00", ok: true });
    expect(s[0]?.tables.sort()).toEqual(["t2", "t4"]);
    expect(s.at(-1)?.time).toBe("00:00");
  });

  it("suggests the smallest table that fits", () => {
    const b = {
      date: "2026-11-13",
      time: "20:00",
      duration: 120,
      party: 3,
      tables: [],
      status: "confirmed" as const,
    };
    expect(suggestTables(DEFAULT_SETTINGS, b, [], TABLES)).toEqual(["t4"]);
  });
});

describe("Reservations", () => {
  it("never double books a table", async () => {
    const { p } = await setup();
    await p.mutation(api.reservations.create, { ...base, tables: ["t2"] });
    await expect(
      p.mutation(api.reservations.create, {
        ...base,
        time: "21:00",
        name: "Bruno",
        tables: ["t2"],
      })
    ).rejects.toThrow("já está reservada");
    // Staff override does not allow it either
    await expect(
      p.mutation(api.reservations.create, {
        ...base,
        time: "21:00",
        name: "Bruno",
        tables: ["t2"],
        override: true,
      })
    ).rejects.toThrow("já está reservada");
    // After the first one ends (20:00 + 2 h) the table is free
    await p.mutation(api.reservations.create, {
      ...base,
      time: "22:00",
      name: "Carla",
      tables: ["t2"],
    });
  });

  it("frees the table on cancel and blocks re-activation if taken", async () => {
    const { p } = await setup();
    const a = await p.mutation(api.reservations.create, {
      ...base,
      tables: ["t2"],
    });
    await p.mutation(api.reservations.setStatus, {
      id: a.id,
      status: "cancelled",
    });
    await p.mutation(api.reservations.create, {
      ...base,
      name: "Bruno",
      tables: ["t2"],
    });
    await expect(
      p.mutation(api.reservations.setStatus, { id: a.id, status: "confirmed" })
    ).rejects.toThrow("já está reservada");
  });

  it("checks hours and party size, unless staff override", async () => {
    const { p } = await setup();
    await expect(
      p.mutation(api.reservations.create, { ...base, time: "10:00" })
    ).rejects.toThrow("Fora do horário");
    await expect(
      p.mutation(api.reservations.create, { ...base, party: 40 })
    ).rejects.toThrow("Grupo fora do limite");
    const big = await p.mutation(api.reservations.create, {
      ...base,
      party: 40,
      override: true,
      event: true,
    });
    expect(big.ref).toMatch(REF);
  });

  it("auto-assigns a table, records the source and lists the day", async () => {
    const { t, p } = await setup();
    expect(
      await t.query(api.reservations.day, {
        company: "the-brew",
        date: base.date,
      })
    ).toBeNull();
    await p.mutation(api.reservations.create, {
      ...base,
      party: 3,
      source: "whatsapp",
      autoTable: true,
    });
    const day = await p.query(api.reservations.day, {
      company: "all",
      date: base.date,
    });
    expect(day?.reservations[0]).toMatchObject({
      tables: ["t4"],
      source: "whatsapp",
      status: "confirmed",
      phone: "+35699990000",
    });
    const found = await p.query(api.reservations.search, {
      company: "all",
      q: "ana",
    });
    expect(found).toHaveLength(1);
  });

  it("enforces the covers limit", async () => {
    const { p } = await setup();
    await p.mutation(api.reservations.saveSettings, {
      company: "the-brew",
      ...DEFAULT_SETTINGS,
      maxCovers: 5,
    });
    await p.mutation(api.reservations.create, { ...base, party: 4 });
    await expect(
      p.mutation(api.reservations.create, { ...base, time: "21:00", party: 2 })
    ).rejects.toThrow("Sem capacidade");
  });

  it("starts online requests as pending when confirmation is required", async () => {
    const { p } = await setup();
    await p.mutation(api.reservations.saveSettings, {
      company: "the-brew",
      ...DEFAULT_SETTINGS,
      confirmOnline: true,
    });
    await p.mutation(api.reservations.create, { ...base, source: "website" });
    const day = await p.query(api.reservations.day, {
      company: "the-brew",
      date: base.date,
    });
    expect(day?.reservations[0]?.status).toBe("pending");
  });
});

describe("Guests CRM", () => {
  it("builds one guest across venues with visits and no-shows", async () => {
    const { t, p } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("posMeta", {
        key: "vinomad",
        areas: [],
        settings: {},
        receipt: {},
        nextOrderNumber: 1,
      });
    });
    const a = await p.mutation(api.reservations.create, { ...base });
    await p.mutation(api.reservations.create, {
      ...base,
      company: "vinomad",
      date: "2026-11-14",
    });
    const c = await p.mutation(api.reservations.create, {
      ...base,
      date: "2026-11-20",
      email: "ANA@mail.com",
    });
    await p.mutation(api.reservations.setStatus, {
      id: a.id,
      status: "completed",
    });
    await p.mutation(api.reservations.setStatus, {
      id: c.id,
      status: "no_show",
    });

    const list = await p.query(api.guests.list, {});
    expect(list).toHaveLength(1);
    expect(list?.[0]).toMatchObject({
      bookings: 3,
      visits: 1,
      noShows: 1,
      favourite: "the-brew",
    });

    const known = await p.query(api.guests.byContact, {
      phone: "+356 9999 0000",
    });
    expect(known).toMatchObject({
      name: "Ana Silva",
      email: "ana@mail.com",
      visits: 1,
    });

    const day = await p.query(api.reservations.day, {
      company: "the-brew",
      date: base.date,
    });
    const gid = day?.reservations[0]?.guestId as string;
    expect(day?.guests[gid]).toEqual({ visits: 1, noShows: 1 });

    const week = await p.query(api.reservations.range, {
      company: "all",
      from: "2026-11-13",
      to: "2026-11-19",
    });
    expect(week?.map((r) => r.date)).toEqual(["2026-11-13", "2026-11-14"]);
  });

  it("records consent, exports and erases a guest (GDPR)", async () => {
    const { p } = await setup();
    await p.mutation(api.reservations.create, {
      ...base,
      requests: "Nut allergy",
    });
    const [g] = (await p.query(api.guests.list, {})) ?? [];
    if (!g) {
      throw new Error("no guest");
    }
    await p.mutation(api.guests.save, {
      id: g.id,
      name: "Ana Silva",
      phone: g.phone,
      vip: true,
      tags: ["regular"],
      marketing: true,
    });
    const full = await p.query(api.guests.get, { id: g.id });
    expect(full?.consentAt).toBeTypeOf("number");
    const dump = await p.query(api.guests.exportData, { id: g.id });
    expect(dump?.reservations[0]).toMatchObject({ requests: "Nut allergy" });

    expect(await p.mutation(api.guests.forget, { id: g.id })).toBe(1);
    expect(await p.query(api.guests.list, {})).toHaveLength(0);
    const day = await p.query(api.reservations.day, {
      company: "the-brew",
      date: base.date,
    });
    expect(day?.reservations[0]).toMatchObject({
      name: "Guest (data erased)",
      phone: "",
      requests: "",
      guestId: null,
    });
  });
});
