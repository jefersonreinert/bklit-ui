import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import floor from "../scripts/pos-floors/vinomad.json";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

async function setup() {
  const t = convexTest(schema, modules);
  await t
    .withIdentity(panel)
    .mutation(api.staff.setup, { name: "Admin", pin: "1234", device: "t" });
  await t.mutation(internal.pos.importMenu, {
    company: "vinomad",
    currency: "EUR",
    profile: { name: "Vinomad", color: "#000" },
    products: [],
  });
  return t;
}

type Areas = (typeof floor)["areas"];

describe("floor plan (Vinomad)", () => {
  it("applies the three areas in order and the reservations see every table", async () => {
    const t = await setup();
    const res = await t.mutation(internal.pos.setFloor, {
      company: "vinomad",
      areas: floor.areas as never,
    });
    expect(res).toEqual({ areas: 3, tables: 48 });
    const venue = await t.withIdentity(panel).query(api.reservations.venue, {
      company: "vinomad",
    });
    expect(venue?.floor.map((a) => a.name)).toEqual(["Beer Garden", "Inside", "Upstairs"]);
    expect(venue?.tables).toHaveLength(48);
    const t1 = venue?.floor[1]?.tables.find((x) => x.name === "1");
    expect(t1).toMatchObject({ seats: 4, round: true });
    const t78 = venue?.tables.find((x) => x.name === "78");
    expect(t78).toMatchObject({ seats: 6, area: "Upstairs" });
  });

  it("refuses repeated ids and tables outside the area", async () => {
    const t = await setup();
    const a = (floor.areas as Areas)[0];
    const one = a?.tables[0];
    await expect(
      t.mutation(internal.pos.setFloor, {
        company: "vinomad",
        areas: [{ ...a, tables: [one, one] }] as never,
      })
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.pos.setFloor, {
        company: "vinomad",
        areas: [{ ...a, tables: [{ ...one, x: 950 }] }] as never,
      })
    ).rejects.toThrow();
  });
});
