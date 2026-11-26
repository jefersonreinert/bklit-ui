import { ConvexError, v } from "convex/values";
import {
  AUTO_SCORE,
  bestByName,
  lineNet,
  normalizeName,
  perUnitGuess,
} from "../lib/inventory/match";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { audit, meta, requireStaff } from "./access";
import { invInvoiceReview } from "./schema";
import { groupOf, post } from "./inv";

/**
 * Supplier invoices → stock. A photo or PDF is read by AI on the app
 * server (/api/inv/read), then create() links every line to a stock item
 * (barcode, the supplier's code, what earlier invoices taught, or the
 * closest name) and works out how many ml/g/un one invoiced unit holds.
 * After the review, approve() writes one purchase per line to the ledger
 * (net cost, without VAT: it moves the average cost) and learns the links
 * for the next invoice. Nothing enters the stock before approval.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clean = (s: unknown, max = 160) =>
  (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim().slice(0, max);
const numOrNull = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? n : null;
const digits = (s: string) => s.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
const NOT_STOCK = /\b(delivery|transport|freight|shipping|deposit|frete|entrega|consegna|trasporto|service charge|surcharge|fuel)\b/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINES = 200;

type Line = Doc<"invInvoices">["lines"][number];

const groupKey = async (ctx: QueryCtx, company: string) =>
  (await groupOf(ctx, company))?.key ?? company;

async function invoiceFor(ctx: QueryCtx, id: Id<"invInvoices">) {
  const inv = await ctx.db.get(id);
  if (!inv) {
    throw new ConvexError("Invoice não encontrado.");
  }
  return inv;
}

/* ------------------------------ reading -------------------------------- */

/** The app server asks this before spending AI on a file. */
export const canRead = query({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    try {
      await requireStaff(ctx, session, "stock", company);
      return true;
    } catch {
      return false;
    }
  },
});

export const uploadUrl = mutation({
  args: { session: v.optional(v.string()), company: v.string() },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, "stock", company);
    return await ctx.storage.generateUploadUrl();
  },
});

/** What /api/inv/read returns (lib/invoices/types ExtractedInvoice). */
const extracted = v.object({
  supplier: v.object({ name: v.string(), taxId: v.string(), address: v.string() }),
  // The AI also returns these; kept optional so its full answer is accepted
  buyer: v.optional(v.object({ name: v.string(), taxId: v.string(), address: v.string() })),
  number: v.string(),
  date: v.string(),
  dueDate: v.string(),
  currency: v.string(),
  subtotal: v.union(v.number(), v.null()),
  vatTotal: v.union(v.number(), v.null()),
  total: v.union(v.number(), v.null()),
  lines: v.array(
    v.object({
      description: v.string(),
      code: v.string(),
      ean: v.string(),
      quantity: v.union(v.number(), v.null()),
      unit: v.string(),
      packSize: v.union(v.number(), v.null()),
      packUnit: v.string(),
      unitPrice: v.union(v.number(), v.null()),
      vatRate: v.union(v.number(), v.null()),
      lineTotal: v.union(v.number(), v.null()),
      category: v.optional(v.string()),
      genericName: v.optional(v.string()),
    })
  ),
});

async function findSupplier(
  ctx: MutationCtx,
  group: string,
  name: string,
  taxId: string
) {
  const tax = digits(taxId);
  if (tax) {
    const byTax = await ctx.db
      .query("invSuppliers")
      .withIndex("by_tax", (q) => q.eq("group", group).eq("taxId", tax))
      .first();
    if (byTax) {
      return byTax;
    }
  }
  const key = normalizeName(name) || "fornecedor";
  const byName = await ctx.db
    .query("invSuppliers")
    .withIndex("by_group", (q) => q.eq("group", group).eq("key", key))
    .first();
  if (byName) {
    if (tax && !byName.taxId) {
      await ctx.db.patch(byName._id, { taxId: tax });
    }
    return byName;
  }
  const id = await ctx.db.insert("invSuppliers", {
    group,
    name: clean(name, 80) || "Fornecedor",
    key,
    taxId: tax || undefined,
    active: true,
    createdAt: Date.now(),
  });
  return (await ctx.db.get(id)) as Doc<"invSuppliers">;
}

/** Links one line to a stock item and its unit conversion. */
async function linkLine(
  ctx: QueryCtx,
  group: string,
  supplierId: Id<"invSuppliers">,
  items: Doc<"invItems">[],
  line: Line
): Promise<Line> {
  const byId = (id: Id<"invItems">) => items.find((i) => i._id === id);
  const take = (
    item: Doc<"invItems">,
    match: Line["match"],
    score: number,
    perUnit?: number
  ): Line => ({
    ...line,
    itemId: item._id,
    match,
    score,
    perUnit: perUnit ?? perUnitGuess(line, item) ?? 0,
  });
  if (line.ean) {
    const hit = await ctx.db
      .query("invBarcodes")
      .withIndex("by_code", (q) => q.eq("group", group).eq("code", line.ean))
      .first();
    const item = hit ? byId(hit.itemId) : undefined;
    if (item) {
      return take(item, "ean", 1);
    }
  }
  if (line.code) {
    const known = await ctx.db
      .query("invSupplierItems")
      .withIndex("by_code", (q) => q.eq("supplierId", supplierId).eq("code", line.code))
      .first();
    const item = known ? byId(known.itemId) : undefined;
    if (known && item) {
      return take(item, "code", 1, known.perUnit);
    }
  }
  const alias = normalizeName(line.description);
  if (alias) {
    const known = await ctx.db
      .query("invSupplierItems")
      .withIndex("by_alias", (q) => q.eq("supplierId", supplierId).eq("alias", alias))
      .first();
    const item = known ? byId(known.itemId) : undefined;
    if (known && item) {
      return take(item, "alias", 1, known.perUnit);
    }
  }
  const best = bestByName(
    line.description,
    items.map((i) => ({ id: i._id, name: i.name }))
  );
  const item = best ? byId(best.item.id as Id<"invItems">) : undefined;
  if (best && item) {
    return take(item, "similar", Math.round(best.score * 100) / 100);
  }
  return line;
}

async function groupItems(ctx: QueryCtx, group: string) {
  return (
    await ctx.db
      .query("invItems")
      .withIndex("by_group", (q) => q.eq("group", group))
      .take(2000)
  ).filter((i) => i.active);
}

/**
 * Saves an invoice read by AI, every line linked as well as possible,
 * for review. A second copy of the same supplier invoice is refused.
 */
export const create = mutation({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
    data: extracted,
    files: v.array(v.object({ id: v.id("_storage"), name: v.string(), type: v.string() })),
  },
  handler: async (ctx, { session, company, data, files }) => {
    const user = await requireStaff(ctx, session, "stock", company);
    const group = await groupKey(ctx, company);
    const supplier = await findSupplier(ctx, group, data.supplier.name, data.supplier.taxId);
    const number = clean(data.number, 40);
    const items = await groupItems(ctx, group);
    const lines: Line[] = [];
    for (const [i, l] of data.lines.slice(0, MAX_LINES).entries()) {
      const quantity = numOrNull(l.quantity) ?? 1;
      const base: Line = {
        id: `l${i + 1}`,
        description: clean(l.description, 200),
        code: clean(l.code, 40),
        ean: digits(l.ean).slice(0, 20),
        quantity,
        unit: clean(l.unit, 20),
        packSize: numOrNull(l.packSize),
        packUnit: clean(l.packUnit, 10),
        unitPrice: numOrNull(l.unitPrice),
        vatRate: numOrNull(l.vatRate),
        net: lineNet({
          quantity,
          unitPrice: numOrNull(l.unitPrice),
          lineTotal: numOrNull(l.lineTotal),
          vatRate: numOrNull(l.vatRate),
        }),
        itemId: null,
        perUnit: 0,
        match: "none",
        score: 0,
        skip: false,
      };
      if (!base.description) {
        continue;
      }
      const linked = await linkLine(ctx, group, supplier._id, items, base);
      lines.push({
        ...linked,
        skip: linked.itemId === null && NOT_STOCK.test(base.description),
      });
    }
    const subtotal = numOrNull(data.subtotal) ?? r2(lines.reduce((s, l) => s + l.net, 0));
    const vat = numOrNull(data.vatTotal) ?? 0;
    const total = numOrNull(data.total) ?? r2(subtotal + vat);
    const id = await ctx.db.insert("invInvoices", {
      company,
      supplierId: supplier._id,
      supplierName: supplier.name,
      number,
      date: DATE.test(data.date) ? data.date : new Date().toISOString().slice(0, 10),
      dueDate: DATE.test(data.dueDate) ? data.dueDate : undefined,
      currency: clean(data.currency, 3).toUpperCase() || "EUR",
      subtotal: r2(subtotal),
      vat: r2(vat),
      total: r2(total),
      credit: total < 0,
      status: "review",
      files: files.slice(0, 12),
      lines,
      createdAt: Date.now(),
      createdBy: user.name,
    });
    await audit(ctx, user, "Invoice lido", `${supplier.name} ${number}`, company);
    return id;
  },
});

/* ------------------------------- reads ---------------------------------- */

export const list = query({
  args: {
    session: v.optional(v.string()),
    company: v.string(),
  },
  handler: async (ctx, { session, company }) => {
    await requireStaff(ctx, session, ["stock", "reports"], company);
    const rows = await ctx.db
      .query("invInvoices")
      .withIndex("by_company", (q) => q.eq("company", company))
      .order("desc")
      .take(300);
    return rows.map(({ lines, files, ...inv }) => ({
      ...inv,
      lineCount: lines.length,
      open: lines.filter((l) => !l.skip && !(l.itemId && l.perUnit > 0)).length,
      hasFile: files.length > 0,
    }));
  },
});

/** Another live invoice with the same supplier and number. */
async function duplicateOf(ctx: QueryCtx, inv: Doc<"invInvoices">) {
  if (!inv.number) {
    return null;
  }
  const same = await ctx.db
    .query("invInvoices")
    .withIndex("by_supplier_number", (q) =>
      q.eq("supplierId", inv.supplierId).eq("number", inv.number)
    )
    .take(10);
  return same.find((x) => x._id !== inv._id && x.status !== "void") ?? null;
}

export const detail = query({
  args: { session: v.optional(v.string()), id: v.id("invInvoices") },
  handler: async (ctx, { session, id }) => {
    const inv = await ctx.db.get(id);
    if (!inv) {
      return null;
    }
    await requireStaff(ctx, session, ["stock", "reports"], inv.company);
    const files = await Promise.all(
      inv.files.map(async (f) => ({ ...f, url: await ctx.storage.getUrl(f.id) }))
    );
    // Current average cost per base unit of each linked item, to show rises
    const costs: Record<string, number> = {};
    for (const l of inv.lines) {
      if (l.itemId && costs[l.itemId] === undefined) {
        const row = await ctx.db
          .query("invStock")
          .withIndex("by_item", (q) => q.eq("itemId", l.itemId as Id<"invItems">).eq("company", inv.company))
          .unique();
        costs[l.itemId] = row?.avgCost ?? 0;
      }
    }
    const dup = await duplicateOf(ctx, inv);
    const group = await groupKey(ctx, inv.company);
    const suppliers = await ctx.db
      .query("invSuppliers")
      .withIndex("by_group", (q) => q.eq("group", group))
      .take(500);
    // Letterheads for the digital copy: the supplier and the buying bar
    const sup = await ctx.db.get(inv.supplierId);
    const m = await meta(ctx, inv.company);
    const r = (m?.receipt ?? {}) as Partial<
      Record<"businessName" | "legalName" | "taxId" | "address" | "phone" | "email" | "logo", string>
    >;
    const p = (m?.profile ?? {}) as { name?: string; color?: string };
    return {
      invoice: inv,
      files,
      costs,
      parties: {
        supplier: {
          name: sup?.name ?? inv.supplierName,
          taxId: sup?.taxId ?? "",
          email: sup?.email ?? "",
          phone: sup?.phone ?? "",
        },
        buyer: {
          name: p.name || r.businessName || "",
          legalName: r.legalName ?? "",
          taxId: r.taxId ?? "",
          address: r.address ?? "",
          phone: r.phone ?? "",
          email: r.email ?? "",
          logo: r.logo ?? "",
          color: p.color || "#c96442",
        },
      },
      duplicate: dup ? { id: dup._id, status: dup.status, date: dup.date } : null,
      suppliers: suppliers.filter((s) => s.active).map((s) => ({ id: s._id, name: s.name })),
    };
  },
});

/* ------------------------------- review --------------------------------- */

async function editable(ctx: QueryCtx, session: string | undefined, id: Id<"invInvoices">) {
  const inv = await invoiceFor(ctx, id);
  const user = await requireStaff(ctx, session, "stock", inv.company);
  if (inv.status !== "review") {
    throw new ConvexError("Este invoice já foi aprovado ou cancelado.");
  }
  return { inv, user };
}

export const updateHeader = mutation({
  args: {
    session: v.optional(v.string()),
    id: v.id("invInvoices"),
    number: v.string(),
    date: v.string(),
    dueDate: v.optional(v.string()),
    credit: v.boolean(),
    subtotal: v.number(),
    vat: v.number(),
    total: v.number(),
    note: v.optional(v.string()),
    /** Another supplier of the group, or a new supplier's name. */
    supplierId: v.optional(v.id("invSuppliers")),
    supplierName: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const { inv } = await editable(ctx, a.session, a.id);
    const group = await groupKey(ctx, inv.company);
    let supplier: Doc<"invSuppliers"> | null = null;
    if (a.supplierId && a.supplierId !== inv.supplierId) {
      supplier = await ctx.db.get(a.supplierId);
      if (supplier?.group !== group) {
        throw new ConvexError("Fornecedor não encontrado.");
      }
    } else if (clean(a.supplierName) && clean(a.supplierName) !== inv.supplierName) {
      supplier = await findSupplier(ctx, group, clean(a.supplierName), "");
    }
    if (!DATE.test(a.date)) {
      throw new ConvexError("Data inválida.");
    }
    await ctx.db.patch(a.id, {
      number: clean(a.number, 40),
      date: a.date,
      dueDate: a.dueDate && DATE.test(a.dueDate) ? a.dueDate : undefined,
      credit: a.credit,
      subtotal: r2(a.subtotal),
      vat: r2(a.vat),
      total: r2(a.total),
      note: clean(a.note, 300) || undefined,
      ...(supplier ? { supplierId: supplier._id, supplierName: supplier.name } : {}),
    });
  },
});

/** Changes one line: its item, conversion, quantity, net cost or skip. */
export const updateLine = mutation({
  args: {
    session: v.optional(v.string()),
    id: v.id("invInvoices"),
    lineId: v.string(),
    itemId: v.optional(v.union(v.id("invItems"), v.null())),
    perUnit: v.optional(v.number()),
    quantity: v.optional(v.number()),
    net: v.optional(v.number()),
    skip: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const { inv } = await editable(ctx, a.session, a.id);
    const group = await groupKey(ctx, inv.company);
    const lines = [...inv.lines];
    const i = lines.findIndex((l) => l.id === a.lineId);
    const line = lines.at(i);
    if (i < 0 || !line) {
      throw new ConvexError("Linha não encontrada.");
    }
    const next: Line = { ...line };
    if (a.itemId !== undefined) {
      if (a.itemId) {
        const item = await ctx.db.get(a.itemId);
        if (item?.group !== group) {
          throw new ConvexError("Item não encontrado.");
        }
        next.itemId = item._id;
        if (a.perUnit === undefined && item._id !== line.itemId) {
          next.perUnit = perUnitGuess(line, item) ?? 0;
        }
      } else {
        next.itemId = null;
      }
      next.match = "manual";
      next.score = 1;
    }
    if (a.perUnit !== undefined) {
      if (!(a.perUnit >= 0)) {
        throw new ConvexError("Conversão inválida.");
      }
      next.perUnit = r3(a.perUnit);
      if (next.itemId) {
        next.match = "manual";
        next.score = 1;
      }
    }
    if (a.quantity !== undefined) {
      next.quantity = r3(a.quantity);
    }
    if (a.net !== undefined) {
      next.net = r2(a.net);
    }
    if (a.skip !== undefined) {
      next.skip = a.skip;
    }
    lines[i] = next;
    await ctx.db.patch(a.id, { lines });
  },
});

/** Problems that stop an approval, in words for the reviewer. */
export function approvalProblems(lines: Line[]) {
  const problems: string[] = [];
  for (const l of lines) {
    if (l.skip) {
      continue;
    }
    if (!l.itemId) {
      problems.push(`“${l.description}”: escolha o item de estoque ou marque como “não é estoque”.`);
    } else if (!(l.perUnit > 0)) {
      problems.push(`“${l.description}”: diga quanto vem em cada unidade da nota.`);
    } else if (l.match === "similar" && l.score < AUTO_SCORE) {
      problems.push(`“${l.description}”: confirme o item sugerido.`);
    } else if (!(l.quantity > 0)) {
      problems.push(`“${l.description}”: quantidade inválida.`);
    }
  }
  return problems;
}

/**
 * Approves an invoice: each stock line becomes a purchase in the ledger
 * (a credit note takes it out), at the line's net cost per base unit;
 * the links are learned for the next invoice from this supplier.
 */
export const approve = mutation({
  args: { session: v.optional(v.string()), id: v.id("invInvoices") },
  handler: async (ctx, { session, id }) => {
    const { inv, user } = await editable(ctx, session, id);
    const dup = await duplicateOf(ctx, inv);
    if (dup) {
      throw new ConvexError(`Este invoice já foi lançado (${inv.supplierName} ${inv.number}).`);
    }
    const problems = approvalProblems(inv.lines);
    if (problems.length) {
      throw new ConvexError(problems.slice(0, 3).join(" "));
    }
    const now = Date.now();
    const sign = inv.credit ? -1 : 1;
    let posted = 0;
    for (const l of inv.lines) {
      if (l.skip || !l.itemId) {
        continue;
      }
      const qty = r3(l.quantity * l.perUnit);
      const unitCost = qty > 0 ? Math.abs(l.net) / qty : 0;
      const done = await post(ctx, {
        company: inv.company,
        itemId: l.itemId,
        kind: "purchase",
        qty: sign * qty,
        unitCost,
        ref: `inv:${id}:${l.id}`,
        note: `${inv.credit ? "Nota de crédito" : "Invoice"} ${inv.supplierName} ${inv.number}`.trim(),
        userName: user.name,
        at: now,
      });
      if (done) {
        posted++;
      }
      await learn(ctx, inv.supplierId, l, unitCost, now);
    }
    await ctx.db.patch(id, { status: "approved", approvedAt: now, approvedBy: user.name });
    // The supplier's open order in this bar is now received (by this invoice)
    const open = (
      await ctx.db
        .query("invOrders")
        .withIndex("by_supplier", (q) => q.eq("supplierId", inv.supplierId).eq("status", "sent"))
        .take(20)
    )
      .filter((o) => o.company === inv.company)
      .sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))[0];
    if (open && !inv.credit) {
      await ctx.db.patch(open._id, { status: "received", receivedAt: now, invoiceId: id });
    }
    await audit(ctx, user, "Invoice aprovado", `${inv.supplierName} ${inv.number}: ${posted} linhas`, inv.company);
    return posted;
  },
});

async function learn(
  ctx: MutationCtx,
  supplierId: Id<"invSuppliers">,
  l: Line,
  unitCost: number,
  at: number
) {
  if (!l.itemId) {
    return;
  }
  const alias = normalizeName(l.description);
  const known = l.code
    ? await ctx.db
        .query("invSupplierItems")
        .withIndex("by_code", (q) => q.eq("supplierId", supplierId).eq("code", l.code))
        .first()
    : await ctx.db
        .query("invSupplierItems")
        .withIndex("by_alias", (q) => q.eq("supplierId", supplierId).eq("alias", alias))
        .first();
  const doc = {
    supplierId,
    code: l.code || undefined,
    alias,
    itemId: l.itemId,
    perUnit: l.perUnit,
    lastCost: Math.round(unitCost * 1e6) / 1e6,
    lastAt: at,
  };
  if (known) {
    await ctx.db.patch(known._id, doc);
  } else {
    await ctx.db.insert("invSupplierItems", doc);
  }
  // A barcode printed on the invoice joins the item, when free
  if (l.ean) {
    const item = await ctx.db.get(l.itemId);
    if (item && !item.barcodes.includes(l.ean)) {
      const taken = await ctx.db
        .query("invBarcodes")
        .withIndex("by_code", (q) => q.eq("group", item.group).eq("code", l.ean))
        .first();
      if (!taken) {
        await ctx.db.insert("invBarcodes", { group: item.group, code: l.ean, itemId: item._id });
        await ctx.db.patch(item._id, { barcodes: [...item.barcodes, l.ean] });
      }
    }
  }
}

/**
 * Cancels an invoice. A reviewed one is just dropped; an approved one is
 * reversed in the ledger (its purchases taken back out).
 */
export const cancel = mutation({
  args: { session: v.optional(v.string()), id: v.id("invInvoices"), reason: v.string() },
  handler: async (ctx, { session, id, reason }) => {
    const inv = await invoiceFor(ctx, id);
    const user = await requireStaff(ctx, session, "stock", inv.company);
    if (inv.status === "void") {
      return;
    }
    if (!clean(reason)) {
      throw new ConvexError("Diga o motivo.");
    }
    const now = Date.now();
    if (inv.status === "approved") {
      const sign = inv.credit ? 1 : -1;
      for (const l of inv.lines) {
        if (l.skip || !l.itemId) {
          continue;
        }
        const qty = r3(l.quantity * l.perUnit);
        await post(ctx, {
          company: inv.company,
          itemId: l.itemId,
          kind: "purchase",
          qty: sign * qty,
          unitCost: qty > 0 ? Math.abs(l.net) / qty : 0,
          ref: `inv:${id}:${l.id}:void`,
          note: `Estorno ${inv.supplierName} ${inv.number}: ${clean(reason, 100)}`,
          userName: user.name,
          at: now,
        });
      }
    }
    await ctx.db.patch(id, {
      status: "void",
      voidedAt: now,
      voidedBy: user.name,
      note: clean(reason, 300),
    });
    await audit(ctx, user, "Invoice cancelado", `${inv.supplierName} ${inv.number}: ${clean(reason, 100)}`, inv.company);
  },
});

export const setPaid = mutation({
  args: { session: v.optional(v.string()), id: v.id("invInvoices"), paid: v.boolean() },
  handler: async (ctx, { session, id, paid }) => {
    const inv = await invoiceFor(ctx, id);
    await requireStaff(ctx, session, "stock", inv.company);
    await ctx.db.patch(id, { paidAt: paid ? Date.now() : undefined });
  },
});

/* ------------------------------ the agent -------------------------------- */

/**
 * Everything the invoice agent needs in one read: the invoice, the bar's
 * stock catalog with costs, this supplier's last approved invoices (what
 * each line was linked to, the conversion and the cost per base unit),
 * and other invoices that could be the same one.
 */
export const agentContext = query({
  args: { session: v.optional(v.string()), id: v.id("invInvoices") },
  handler: async (ctx, { session, id }) => {
    const inv = await invoiceFor(ctx, id);
    await requireStaff(ctx, session, "stock", inv.company);
    const group = await groupKey(ctx, inv.company);
    const [items, stock, history] = await Promise.all([
      groupItems(ctx, group),
      ctx.db
        .query("invStock")
        .withIndex("by_company", (q) => q.eq("company", inv.company))
        .take(2000),
      ctx.db
        .query("invInvoices")
        .withIndex("by_supplier_number", (q) => q.eq("supplierId", inv.supplierId))
        .take(200),
    ]);
    const cost = new Map(stock.map((s) => [s.itemId as string, s.avgCost]));
    const name = new Map(items.map((i) => [i._id as string, i.name]));
    const others = history.filter((h) => h._id !== id && h.status !== "void");
    const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
    const duplicates = others
      .filter(
        (h) =>
          (inv.number && h.number === inv.number) ||
          (Math.abs(h.total - inv.total) < 0.01 && Math.abs(day(h.date) - day(inv.date)) <= 10)
      )
      .map((h) => ({ id: h._id, number: h.number, date: h.date, total: h.total, status: h.status }));
    const past = others
      .filter((h) => h.status === "approved")
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .map((h) => ({
        number: h.number,
        date: h.date,
        total: h.total,
        lines: h.lines
          .filter((l) => !l.skip && l.itemId)
          .map((l) => {
            const qty = l.quantity * l.perUnit;
            return {
              description: l.description,
              code: l.code,
              item: name.get(l.itemId as string) ?? "",
              itemId: l.itemId,
              unit: l.unit,
              perUnit: l.perUnit,
              costPerBase: qty > 0 ? Math.round((Math.abs(l.net) / qty) * 1e6) / 1e6 : null,
            };
          }),
      }));
    const orders = (
      await Promise.all(
        (["sent", "draft"] as const).map((status) =>
          ctx.db
            .query("invOrders")
            .withIndex("by_supplier", (q) => q.eq("supplierId", inv.supplierId).eq("status", status))
            .take(10)
        )
      )
    )
      .flat()
      .filter((o) => o.company === inv.company)
      .map((o) => ({
        number: o.number,
        status: o.status,
        sentAt: o.sentAt ? new Date(o.sentAt).toISOString().slice(0, 10) : null,
        lines: o.lines.map((l) => ({
          itemId: l.itemId,
          item: name.get(l.itemId as string) ?? "",
          packs: l.packs,
          perUnit: l.perUnit,
          expectedPackCost: l.packCost || null,
        })),
      }));
    // The bar's menu (Lightspeed or this app's POS), with what each product
    // already takes from stock, so the agent can say which products use
    // a new item ("Small Still Water" = 1 bottle of 275 ml water)
    const [products, links, recipes] = await Promise.all([
      ctx.db
        .query("posProducts")
        .withIndex("by_company", (q) => q.eq("company", inv.company))
        .take(1500),
      ctx.db
        .query("invRecipePrices")
        .withIndex("by_company", (q) => q.eq("company", inv.company))
        .take(2000),
      ctx.db
        .query("invRecipes")
        .withIndex("by_group", (q) => q.eq("group", group))
        .take(2000),
    ]);
    const recipeOf = new Map(links.filter((l) => l.productId).map((l) => [l.productId as string, l.recipeId as string]));
    const recipeById = new Map(recipes.map((r) => [r._id as string, r]));
    const menu = products
      .filter((p) => p.available)
      .map((p) => {
        const r = recipeById.get(recipeOf.get(p.cid) ?? "");
        return {
          productId: p.cid,
          name: p.name,
          department: [p.category, p.subcategory].filter(Boolean).join(" › "),
          price: p.price,
          uses: r
            ? r.lines
                .filter((l) => l.itemId)
                .map((l) => ({ item: name.get(l.itemId as string) ?? "", qty: l.qty }))
            : [],
        };
      });
    return {
      menu,
      openOrders: orders,
      invoice: {
        id: inv._id,
        supplier: inv.supplierName,
        number: inv.number,
        date: inv.date,
        dueDate: inv.dueDate ?? "",
        currency: inv.currency,
        subtotal: inv.subtotal,
        vat: inv.vat,
        total: inv.total,
        credit: inv.credit,
        status: inv.status,
        lines: inv.lines,
      },
      files: await Promise.all(inv.files.map(async (f) => ({ type: f.type, url: await ctx.storage.getUrl(f.id) }))),
      items: items.map((i) => ({
        id: i._id,
        name: i.name,
        category: i.category,
        unit: i.unit,
        size: i.size,
        container: i.container,
        barcodes: i.barcodes,
        costPerBase: cost.get(i._id) ?? 0,
      })),
      past,
      duplicates,
    };
  },
});

/** Saves the agent's conclusion on the invoice (shown to the reviewer). */
export const saveReview = mutation({
  args: { session: v.optional(v.string()), id: v.id("invInvoices"), review: invInvoiceReview },
  handler: async (ctx, { session, id, review }) => {
    const inv = await invoiceFor(ctx, id);
    const user = await requireStaff(ctx, session, "stock", inv.company);
    await ctx.db.patch(id, {
      review: {
        ...review,
        by: user.name,
        summary: review.summary.slice(0, 2000),
        findings: review.findings.slice(0, 60).map((f) => ({ ...f, text: f.text.slice(0, 500) })),
      },
    });
    await audit(ctx, user, "Invoice conferido pelo agente", `${inv.supplierName} ${inv.number}`, inv.company);
  },
});
