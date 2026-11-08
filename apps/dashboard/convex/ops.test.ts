import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../lib/ops/templates";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

describe("Operations", () => {
  it("is panel only and seeds departments and forms once", async () => {
    const t = convexTest(schema, modules);
    const p = t.withIdentity(panel);
    expect(await t.query(api.ops.overview, { company: "the-brew" })).toBeNull();
    await expect(
      t.mutation(api.ops.seed, { company: "the-brew" })
    ).rejects.toThrow();

    expect(await p.mutation(api.ops.seed, { company: "the-brew" })).toBe(
      TEMPLATES.length
    );
    expect(await p.mutation(api.ops.seed, { company: "the-brew" })).toBe(0);
    const o = await p.query(api.ops.overview, { company: "the-brew" });
    expect(o?.departments.map((d) => d.name)).toEqual([
      "Toilets",
      "Kitchen",
      "Bar",
      "Floor",
      "Management",
    ]);
    expect(o?.forms).toHaveLength(TEMPLATES.length);
    // Each business has its own
    const other = await p.query(api.ops.overview, { company: "vinomad" });
    expect(other?.forms).toHaveLength(0);
  });

  it("records a filling and keeps it after the form is deleted", async () => {
    const t = convexTest(schema, modules);
    const p = t.withIdentity(panel);
    await p.mutation(api.ops.seed, { company: "ribs-house" });
    const o = await p.query(api.ops.overview, { company: "ribs-house" });
    const log = o?.forms.find((f) => f.frequency === "log");
    if (!log) {
      throw new Error("no log form");
    }
    await p.mutation(api.ops.submit, {
      company: "ribs-house",
      formId: log.id,
      by: "Ana",
      day: "2026-11-08",
      slot: "20:00",
      done: ["i1", "i2", "nope"],
      notes: "Out of soap",
    });
    await expect(
      p.mutation(api.ops.submit, {
        company: "vinomad",
        formId: log.id,
        by: "Ana",
        day: "2026-11-08",
        done: [],
      })
    ).rejects.toThrow("não encontrado");
    await p.mutation(api.ops.deleteForm, { company: "ribs-house", id: log.id });
    const h = await p.query(api.ops.history, { company: "ribs-house" });
    expect(h?.[0]).toMatchObject({
      by: "Ana",
      slot: "20:00",
      done: ["i1", "i2"],
      title: "(formulário apagado)",
    });
  });

  it("will not delete a department that still has forms", async () => {
    const t = convexTest(schema, modules);
    const p = t.withIdentity(panel);
    await p.mutation(api.ops.seed, { company: "the-brew" });
    const o = await p.query(api.ops.overview, { company: "the-brew" });
    const bar = o?.departments.find((d) => d.name === "Bar");
    if (!bar) {
      throw new Error("no bar");
    }
    await expect(
      p.mutation(api.ops.deleteDepartment, { company: "the-brew", id: bar.id })
    ).rejects.toThrow("Mova ou apague");
    const empty = await p.mutation(api.ops.saveDepartment, {
      company: "the-brew",
      name: "Events",
    });
    await p.mutation(api.ops.deleteDepartment, {
      company: "the-brew",
      id: empty,
    });
  });
});
