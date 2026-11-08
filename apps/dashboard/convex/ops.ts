import { ConvexError, v } from "convex/values";
import { TEMPLATES } from "../lib/ops/templates";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/**
 * Operations (panel only), per business: departments, checklists (forms)
 * with their fillings, and department documents (SOPs, manuals).
 */

const KEY = /^[a-z0-9-]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITEMS = 60;

function company(c: string) {
  if (!KEY.test(c)) {
    throw new ConvexError("Empresa inválida.");
  }
  return c;
}

const text = (s: string, max: number) => s.trim().slice(0, max);

async function dept(ctx: QueryCtx, id: Id<"opsDepartments">, c: string) {
  const d = await ctx.db.get(id);
  if (!d || d.company !== c) {
    throw new ConvexError("Departamento não encontrado.");
  }
  return d;
}

/** Everything of a business (null: panel locked). */
export const overview = query({
  args: { company: v.string() },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const c = company(a.company);
    const [departments, forms, documents] = await Promise.all([
      ctx.db
        .query("opsDepartments")
        .withIndex("by_company", (q) => q.eq("company", c))
        .take(100),
      ctx.db
        .query("opsForms")
        .withIndex("by_company", (q) => q.eq("company", c))
        .take(300),
      ctx.db
        .query("opsDocuments")
        .withIndex("by_company", (q) => q.eq("company", c))
        .take(300),
    ]);
    return {
      departments: departments
        .sort((x, y) => x.order - y.order || x.createdAt - y.createdAt)
        .map((d) => ({ id: d._id, name: d.name })),
      forms: forms
        .sort((x, y) => x.title.localeCompare(y.title))
        .map((f) => ({
          id: f._id,
          departmentId: f.departmentId,
          title: f.title,
          frequency: f.frequency,
          items: f.items,
          slots: f.slots ?? [],
          note: f.note ?? "",
        })),
      documents: await Promise.all(
        documents.map(async (d) => ({
          id: d._id,
          departmentId: d.departmentId,
          title: d.title,
          fileName: d.fileName,
          url: await ctx.storage.getUrl(d.storageId),
        }))
      ),
    };
  },
});

/** Adds the ready-made departments and forms that are missing. */
export const seed = mutation({
  args: { company: v.string() },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    const now = Date.now();
    const existing = await ctx.db
      .query("opsDepartments")
      .withIndex("by_company", (q) => q.eq("company", c))
      .take(100);
    const ids = new Map(existing.map((d) => [d.name, d._id]));
    const forms = await ctx.db
      .query("opsForms")
      .withIndex("by_company", (q) => q.eq("company", c))
      .take(300);
    const titles = new Set(forms.map((f) => f.title));
    let order = existing.length;
    let added = 0;
    for (const t of TEMPLATES) {
      let id = ids.get(t.department);
      if (!id) {
        id = await ctx.db.insert("opsDepartments", {
          company: c,
          name: t.department,
          order: order++,
          createdAt: now,
        });
        ids.set(t.department, id);
      }
      if (titles.has(t.title)) {
        continue;
      }
      await ctx.db.insert("opsForms", {
        company: c,
        departmentId: id,
        title: t.title,
        frequency: t.frequency,
        items: t.items.map((text, i) => ({ id: `i${i + 1}`, text })),
        slots: t.slots,
        note: t.note,
        updatedAt: now,
      });
      added += 1;
    }
    return added;
  },
});

/* ------------------------------ departments ------------------------------- */

export const saveDepartment = mutation({
  args: {
    company: v.string(),
    id: v.optional(v.id("opsDepartments")),
    name: v.string(),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    const name = text(a.name, 40);
    if (!name) {
      throw new ConvexError("Dê um nome ao departamento.");
    }
    if (a.id) {
      await dept(ctx, a.id, c);
      await ctx.db.patch(a.id, { name });
      return a.id;
    }
    const count = (
      await ctx.db
        .query("opsDepartments")
        .withIndex("by_company", (q) => q.eq("company", c))
        .take(100)
    ).length;
    return await ctx.db.insert("opsDepartments", {
      company: c,
      name,
      order: count,
      createdAt: Date.now(),
    });
  },
});

export const deleteDepartment = mutation({
  args: { company: v.string(), id: v.id("opsDepartments") },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    await dept(ctx, a.id, c);
    const used = await ctx.db
      .query("opsForms")
      .withIndex("by_department", (q) => q.eq("departmentId", a.id))
      .first();
    const docs = (
      await ctx.db
        .query("opsDocuments")
        .withIndex("by_company", (q) => q.eq("company", c))
        .take(300)
    ).some((d) => d.departmentId === a.id);
    if (used || docs) {
      throw new ConvexError(
        "Mova ou apague os formulários e documentos deste departamento antes."
      );
    }
    await ctx.db.delete(a.id);
  },
});

/* --------------------------------- forms ---------------------------------- */

export const saveForm = mutation({
  args: {
    company: v.string(),
    id: v.optional(v.id("opsForms")),
    departmentId: v.id("opsDepartments"),
    title: v.string(),
    frequency: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("log")
    ),
    items: v.array(v.object({ id: v.string(), text: v.string() })),
    slots: v.optional(v.array(v.string())),
    note: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    await dept(ctx, a.departmentId, c);
    const title = text(a.title, 80);
    const items = a.items
      .map((i) => ({ id: text(i.id, 20), text: text(i.text, 120) }))
      .filter((i) => i.id && i.text)
      .slice(0, MAX_ITEMS);
    if (!title || items.length === 0) {
      throw new ConvexError("O formulário precisa de título e itens.");
    }
    const slots =
      a.frequency === "log"
        ? (a.slots ?? [])
            .map((s) => text(s, 10))
            .filter(Boolean)
            .slice(0, 30)
        : undefined;
    if (a.frequency === "log" && !slots?.length) {
      throw new ConvexError("Informe os horários do registro.");
    }
    const fields = {
      company: c,
      departmentId: a.departmentId,
      title,
      frequency: a.frequency,
      items,
      slots,
      note: a.note ? text(a.note, 400) || undefined : undefined,
      updatedAt: Date.now(),
    };
    if (a.id) {
      const cur = await ctx.db.get(a.id);
      if (!cur || cur.company !== c) {
        throw new ConvexError("Formulário não encontrado.");
      }
      await ctx.db.replace(a.id, fields);
      return a.id;
    }
    return await ctx.db.insert("opsForms", fields);
  },
});

export const deleteForm = mutation({
  args: { company: v.string(), id: v.id("opsForms") },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const f = await ctx.db.get(a.id);
    if (!f || f.company !== company(a.company)) {
      return;
    }
    // Fillings are the record of what was done: they stay
    await ctx.db.delete(a.id);
  },
});

/* ------------------------------- fillings --------------------------------- */

export const submit = mutation({
  args: {
    company: v.string(),
    formId: v.id("opsForms"),
    by: v.string(),
    day: v.string(),
    slot: v.optional(v.string()),
    done: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    const f = await ctx.db.get(a.formId);
    if (!f || f.company !== c) {
      throw new ConvexError("Formulário não encontrado.");
    }
    const by = text(a.by, 60);
    if (!by) {
      throw new ConvexError("Quem fez? Escreva o nome.");
    }
    if (!DAY.test(a.day)) {
      throw new ConvexError("Data inválida.");
    }
    const valid = new Set(f.items.map((i) => i.id));
    return await ctx.db.insert("opsSubmissions", {
      company: c,
      formId: a.formId,
      by,
      at: Date.now(),
      day: a.day,
      slot: a.slot ? text(a.slot, 10) : undefined,
      done: [...new Set(a.done)].filter((id) => valid.has(id)),
      notes: a.notes ? text(a.notes, 600) || undefined : undefined,
    });
  },
});

/** Latest fillings of a business (with the form title and items). */
export const history = query({
  args: { company: v.string(), formId: v.optional(v.id("opsForms")) },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const c = company(a.company);
    const rows = a.formId
      ? await ctx.db
          .query("opsSubmissions")
          .withIndex("by_form_at", (q) =>
            q.eq("formId", a.formId as Id<"opsForms">)
          )
          .order("desc")
          .take(100)
      : await ctx.db
          .query("opsSubmissions")
          .withIndex("by_company_at", (q) => q.eq("company", c))
          .order("desc")
          .take(100);
    const forms = new Map<
      string,
      { title: string; items: { id: string; text: string }[] } | null
    >();
    const out: {
      id: Id<"opsSubmissions">;
      formId: Id<"opsForms">;
      title: string;
      items: { id: string; text: string }[];
      by: string;
      at: number;
      day: string;
      slot: string | null;
      done: string[];
      notes: string | null;
    }[] = [];
    for (const s of rows) {
      if (s.company !== c) {
        continue;
      }
      if (!forms.has(s.formId)) {
        const f = await ctx.db.get(s.formId);
        forms.set(s.formId, f ? { title: f.title, items: f.items } : null);
      }
      const f = forms.get(s.formId);
      out.push({
        id: s._id,
        formId: s.formId,
        title: f?.title ?? "(formulário apagado)",
        items: f?.items ?? [],
        by: s.by,
        at: s.at,
        day: s.day,
        slot: s.slot ?? null,
        done: s.done,
        notes: s.notes ?? null,
      });
    }
    return out;
  },
});

/* ------------------------------- documents -------------------------------- */

export const uploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const addDocument = mutation({
  args: {
    company: v.string(),
    departmentId: v.id("opsDepartments"),
    title: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const c = company(a.company);
    await dept(ctx, a.departmentId, c);
    return await ctx.db.insert("opsDocuments", {
      company: c,
      departmentId: a.departmentId,
      title: text(a.title, 80) || text(a.fileName, 80),
      storageId: a.storageId,
      fileName: text(a.fileName, 120),
      mimeType: text(a.mimeType, 80),
      updatedAt: Date.now(),
    });
  },
});

export const deleteDocument = mutation({
  args: { company: v.string(), id: v.id("opsDocuments") },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const d = await ctx.db.get(a.id);
    if (!d || d.company !== company(a.company)) {
      return;
    }
    await ctx.storage.delete(d.storageId).catch(() => undefined);
    await ctx.db.delete(a.id);
  },
});
