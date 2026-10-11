import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const panel = { subject: "panel", issuer: "https://panel.test" };

describe("documents files", () => {
  it("needs the panel token", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.files.list, {})).toBeNull();
    await expect(
      t.mutation(api.files.createFolder, { name: "x" })
    ).rejects.toThrow("Unauthenticated");
  });

  it("creates, renames, nests and lists folders and sheets", async () => {
    const t = convexTest(schema, modules).withIdentity(panel);
    const docs = await t.mutation(api.files.createFolder, { name: "Pessoal" });
    const ids = await t.mutation(api.files.createFolder, {
      name: "Identidade",
      parentId: docs,
    });
    await t.mutation(api.files.updateFolder, { id: ids, name: "RG / CPF" });
    const sheet = await t.mutation(api.files.createSheet, {
      name: "Recibo",
      folderId: ids,
      text: "# Farmácia\nTotal: 12,50",
    });
    const root = await t.query(api.files.list, {});
    expect(root?.folders.map((f) => f.name)).toEqual(["Pessoal"]);
    expect(root?.folders[0]?.count).toBe(1);
    const inner = await t.query(api.files.list, { folderId: ids });
    expect(inner?.path.map((p) => p.name)).toEqual(["Pessoal", "RG - CPF"]);
    expect(inner?.files[0]?.kind).toBe("sheet");
    const found = await t.query(api.files.search, { q: "farmácia" });
    expect(found?.map((f) => f.id)).toEqual([sheet]);
    const file = await t.query(api.files.getFile, { id: sheet });
    expect(file?.text).toContain("Total");
  });

  it("refuses moving a folder into itself and deletes whole trees", async () => {
    const t = convexTest(schema, modules).withIdentity(panel);
    const a = await t.mutation(api.files.createFolder, { name: "A" });
    const b = await t.mutation(api.files.createFolder, {
      name: "B",
      parentId: a,
    });
    await expect(
      t.mutation(api.files.updateFolder, { id: a, parentId: b })
    ).rejects.toThrow("dentro dela mesma");
    await t.mutation(api.files.createSheet, {
      name: "nota",
      folderId: b,
      text: "x",
    });
    await t.mutation(api.files.deleteFolder, { id: a });
    const root = await t.query(api.files.list, {});
    expect(root?.folders).toHaveLength(0);
    expect(await t.query(api.files.search, { q: "nota" })).toHaveLength(0);
  });
});
