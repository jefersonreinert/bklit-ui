import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { CHUNKS, chunkOf } from "./i18n";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "i18n", issuer: "https://panel.test" };

describe("shared interface translations", () => {
  it("keeps translations with accents for every device", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(panel).mutation(api.i18n.save, {
      locale: "de",
      pairs: [
        ["Caixa", "Kasse"],
        ["Ações rápidas", "Schnellaktionen"],
      ],
    });
    await t.withIdentity(panel).mutation(api.i18n.save, {
      locale: "de",
      pairs: [["Caixa", "Kassa"]],
    });
    const pairs = await t.query(api.i18n.dict, { locale: "de" });
    expect(new Map(pairs.map(([k, v]) => [k, v]))).toEqual(
      new Map([
        ["Caixa", "Kassa"],
        ["Ações rápidas", "Schnellaktionen"],
      ])
    );
    expect(await t.query(api.i18n.dict, { locale: "fr" })).toEqual([]);
  });

  it("only lets the panel server write", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.i18n.save, { locale: "de", pairs: [["Caixa", "x"]] })
    ).rejects.toThrow();
  });

  it("spreads keys over the chunks", () => {
    const used = new Set(
      Array.from({ length: 500 }, (_, i) => chunkOf(`texto ${i}`))
    );
    expect(used.size).toBe(CHUNKS);
  });
});
