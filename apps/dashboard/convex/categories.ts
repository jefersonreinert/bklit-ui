import { ConvexError, v } from "convex/values";
import { type QueryCtx, mutation, query } from "./_generated/server";
import { audit, canReadPos, MAIN, requireStaff } from "./access";
import { buildTree } from "../lib/pos/categories";
import { inCompany } from "./pos";

/**
 * Category tree of a business (categories and subcategories). Products
 * keep the names in `category` / `subcategory`, so renaming here renames
 * them on every product, and names only used by products (older data)
 * still appear in the tree.
 */

const companyArg = { company: v.optional(v.string()) };
const MAX_NAME = 60;

const clean = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
const same = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

async function rowsOf(ctx: QueryCtx, company: string) {
  return await ctx.db
    .query("posCategories")
    .withIndex("by_company", (q) => q.eq("company", company))
    .take(1000);
}

function productsOf(ctx: QueryCtx, company: string) {
  return inCompany(company, (key) =>
    ctx.db
      .query("posProducts")
      .withIndex("by_company", (q) => q.eq("company", key))
      .take(3000)
  );
}

export const tree = query({
  args: { session: v.optional(v.string()), ...companyArg },
  handler: async (ctx, { session, company = MAIN }) => {
    if (!(await canReadPos(ctx, session, company))) {
      return null;
    }
    const [rows, products] = await Promise.all([
      rowsOf(ctx, company),
      productsOf(ctx, company),
    ]);
    return buildTree(rows, products);
  },
});

/** Creates or edits a category; `parent` makes it a subcategory. */
export const save = mutation({
  args: {
    session: v.string(),
    ...companyArg,
    id: v.optional(v.id("posCategories")),
    /** Current name when the row does not exist yet (name only in use). */
    from: v.optional(v.string()),
    name: v.string(),
    parent: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const company = args.company ?? MAIN;
    const user = await requireStaff(ctx, args.session, "products", company);
    const name = clean(args.name);
    const parent = args.parent ? clean(args.parent) : undefined;
    if (!name) {
      throw new ConvexError("Dê um nome à categoria.");
    }
    if (parent && same(parent, name)) {
      throw new ConvexError("A subcategoria não pode ter o nome da categoria.");
    }
    const rows = await rowsOf(ctx, company);
    const current = args.id ? rows.find((r) => r._id === args.id) : undefined;
    if (args.id && !current) {
      throw new ConvexError("Categoria não encontrada.");
    }
    const oldName = current?.name ?? (args.from ? clean(args.from) : undefined);
    const clash = rows.find(
      (r) =>
        r._id !== current?._id &&
        same(r.name, name) &&
        (r.parent ?? "") === (parent ?? "")
    );
    if (clash) {
      throw new ConvexError(`Já existe "${name}" aqui.`);
    }
    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, {
        name,
        parent,
        color: args.color,
        icon: args.icon,
        updatedAt: now,
      });
    } else {
      const siblings = rows.filter((r) => (r.parent ?? "") === (parent ?? ""));
      await ctx.db.insert("posCategories", {
        company,
        name,
        parent,
        color: args.color,
        icon: args.icon,
        sort: siblings.length ? Math.max(...siblings.map((r) => r.sort)) + 1 : 0,
        updatedAt: now,
      });
    }
    // Rename cascades to products and to the subcategories' parent
    if (oldName && !same(oldName, name)) {
      const products = await productsOf(ctx, company);
      for (const p of products) {
        if (!parent && same(p.category, oldName)) {
          await ctx.db.patch(p._id, { category: name, updatedAt: now });
        } else if (
          parent &&
          p.subcategory &&
          same(p.category, parent) &&
          same(p.subcategory, oldName)
        ) {
          await ctx.db.patch(p._id, { subcategory: name, updatedAt: now });
        }
      }
      if (!parent) {
        for (const r of rows.filter((r) => r.parent && same(r.parent, oldName))) {
          await ctx.db.patch(r._id, { parent: name, updatedAt: now });
        }
      }
      await audit(ctx, user, "Renomeou categoria", `${oldName} → ${name}`, company);
    } else if (!current) {
      await audit(ctx, user, "Criou categoria", parent ? `${parent} › ${name}` : name, company);
    }
  },
});

/**
 * Deletes a category or subcategory. Its products move to `moveTo` (a
 * category name) or, for a subcategory, stay in the parent category.
 */
export const remove = mutation({
  args: {
    session: v.string(),
    ...companyArg,
    name: v.string(),
    parent: v.optional(v.string()),
    moveTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const company = args.company ?? MAIN;
    const user = await requireStaff(ctx, args.session, "products", company);
    const rows = await rowsOf(ctx, company);
    const products = await productsOf(ctx, company);
    const now = Date.now();
    if (args.parent) {
      const parent = args.parent;
      for (const p of products) {
        if (p.subcategory && same(p.category, parent) && same(p.subcategory, args.name)) {
          await ctx.db.patch(p._id, { subcategory: undefined, updatedAt: now });
        }
      }
      for (const r of rows) {
        if (r.parent && same(r.parent, parent) && same(r.name, args.name)) {
          await ctx.db.delete(r._id);
        }
      }
      await audit(ctx, user, "Excluiu subcategoria", `${parent} › ${args.name}`, company);
      return;
    }
    const inUse = products.filter((p) => same(p.category, args.name));
    const target = args.moveTo ? clean(args.moveTo) : "";
    if (inUse.length && !target) {
      throw new ConvexError(
        `"${args.name}" tem ${inUse.length} itens. Escolha para qual categoria movê-los.`
      );
    }
    if (target && same(target, args.name)) {
      throw new ConvexError("Escolha outra categoria de destino.");
    }
    for (const p of inUse) {
      await ctx.db.patch(p._id, { category: target, subcategory: undefined, updatedAt: now });
    }
    for (const r of rows) {
      if (same(r.name, args.name) && !r.parent) {
        await ctx.db.delete(r._id);
      } else if (r.parent && same(r.parent, args.name)) {
        await ctx.db.delete(r._id);
      }
    }
    await audit(
      ctx,
      user,
      "Excluiu categoria",
      target ? `${args.name} (itens → ${target})` : args.name,
      company
    );
  },
});

/** New order of the top categories, or of one category's subcategories. */
export const reorder = mutation({
  args: {
    session: v.string(),
    ...companyArg,
    parent: v.optional(v.string()),
    names: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const company = args.company ?? MAIN;
    await requireStaff(ctx, args.session, "products", company);
    const rows = await rowsOf(ctx, company);
    const now = Date.now();
    let i = 0;
    for (const name of args.names.slice(0, 500)) {
      const row = rows.find(
        (r) => same(r.name, name) && (r.parent ?? "") === (args.parent ?? "")
      );
      if (row) {
        await ctx.db.patch(row._id, { sort: i, updatedAt: now });
      } else {
        // Name only in use by products: save it so the order sticks
        await ctx.db.insert("posCategories", {
          company,
          name: clean(name),
          parent: args.parent,
          sort: i,
          updatedAt: now,
        });
      }
      i++;
    }
  },
});
