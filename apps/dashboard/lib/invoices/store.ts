"use client";

import { cellarStore, recordWinePurchase } from "@/lib/cellar/store";
import type { CellarWine } from "@/lib/cellar/types";
import { createLocalStore, uid } from "@/lib/local-store";
import { round2 } from "@/lib/money";
import {
  AUTO_LINK,
  normalizeName,
  rankIngredients,
  similarity,
  toBase,
} from "./match";
import {
  type Company,
  EMPTY_INVOICES,
  type ExtractedInvoice,
  type Ingredient,
  type Invoice,
  type InvoiceData,
  type InvoiceLine,
} from "./types";

export const invoiceStore = createLocalStore<InvoiceData>(
  "cb:invoices:v1",
  EMPTY_INVOICES
);

export const useInvoices = invoiceStore.use;

const same = (a: string, b: string) =>
  normalizeName(a) === normalizeName(b) && normalizeName(a) !== "";
const digits = (s: string) => s.replace(/\W/g, "").toUpperCase();

/* ------------------------------- Companies ------------------------------ */

export function saveCompany(company: Company) {
  invoiceStore.update((prev) => {
    const exists = prev.companies.some((c) => c.id === company.id);
    return {
      ...prev,
      companies: exists
        ? prev.companies.map((c) => (c.id === company.id ? company : c))
        : [...prev.companies, company],
    };
  });
}

export function removeCompany(id: string) {
  invoiceStore.update((prev) => ({
    ...prev,
    companies: prev.companies.filter((c) => c.id !== id),
  }));
}

export function newCompany(name = "", taxId = ""): Company {
  return {
    id: uid("co"),
    name,
    taxId,
    locations: [{ id: uid("loc"), name: "Principal" }],
  };
}

/** The company an invoice was billed to, by tax id or name. */
export function findCompany(
  data: InvoiceData,
  buyer: ExtractedInvoice["buyer"]
) {
  const tax = digits(buyer.taxId);
  return (
    data.companies.find((c) => tax && digits(c.taxId) === tax) ??
    data.companies.find((c) => same(c.name, buyer.name)) ??
    null
  );
}

/* ------------------------------- Suppliers ------------------------------ */

function ensureSupplier(data: InvoiceData, name: string, taxId: string) {
  const tax = digits(taxId);
  const found =
    data.suppliers.find((s) => tax && digits(s.taxId) === tax) ??
    data.suppliers.find((s) => same(s.name, name));
  if (found) {
    return { data, id: found.id };
  }
  const supplier = { id: uid("sup"), name: name || "Fornecedor", taxId };
  return {
    data: { ...data, suppliers: [...data.suppliers, supplier] },
    id: supplier.id,
  };
}

export function renameSupplier(id: string, name: string) {
  invoiceStore.update((prev) => ({
    ...prev,
    suppliers: prev.suppliers.map((s) => (s.id === id ? { ...s, name } : s)),
  }));
}

/* -------------------------------- Invoices ------------------------------ */

function lineFrom(
  l: ExtractedInvoice["lines"][number],
  ingredients: Ingredient[]
): InvoiceLine {
  const { baseUnit, factor } = toBase(
    l.packUnit || l.unit,
    l.packUnit ? l.packSize : null
  );
  const quantity = l.quantity ?? 1;
  const unitPrice =
    l.unitPrice ??
    (l.lineTotal !== null && quantity ? round2(l.lineTotal / quantity) : 0);
  const line: InvoiceLine = {
    id: uid("ln"),
    description: l.description,
    code: l.code,
    ean: l.ean.replace(/\D/g, ""),
    quantity,
    unit: l.unit,
    packSize: factor,
    baseUnit,
    unitPrice,
    vatRate: l.vatRate ?? 0,
    lineTotal: l.lineTotal ?? round2(unitPrice * quantity),
    category: l.category || "other",
    genericName: l.genericName,
    ingredientId: null,
    match: null,
    score: 0,
  };
  const [best] = rankIngredients(line, ingredients, 1);
  if (best && (best.via !== "similar" || best.score >= AUTO_LINK)) {
    line.ingredientId = best.ingredient.id;
    line.match = best.via;
    line.score = best.score;
  } else {
    line.match = "new";
    line.score = best?.score ?? 0;
  }
  return line;
}

export function addExtractedInvoice(
  extracted: ExtractedInvoice,
  companyId: string,
  locationId: string,
  fileName: string
): string {
  let id = "";
  invoiceStore.update((prev) => {
    const sup = ensureSupplier(
      prev,
      extracted.supplier.name,
      extracted.supplier.taxId
    );
    const lines = extracted.lines
      .filter((l) => l.description.trim())
      .map((l) => lineFrom(l, sup.data.ingredients));
    const subtotal =
      extracted.subtotal ?? round2(lines.reduce((n, l) => n + l.lineTotal, 0));
    const invoice: Invoice = {
      id: uid("inv"),
      companyId,
      locationId,
      supplierId: sup.id,
      number: extracted.number,
      date: extracted.date || new Date().toISOString().slice(0, 10),
      dueDate: extracted.dueDate,
      currency: extracted.currency || "EUR",
      subtotal,
      vatTotal: extracted.vatTotal ?? 0,
      total: extracted.total ?? subtotal + (extracted.vatTotal ?? 0),
      lines,
      fileName,
      status: "review",
      createdAt: Date.now(),
    };
    id = invoice.id;
    return { ...sup.data, invoices: [invoice, ...sup.data.invoices] };
  });
  return id;
}

/** An invoice with the same supplier, number and date is already saved. */
export function findDuplicate(
  data: InvoiceData,
  extracted: ExtractedInvoice
): Invoice | null {
  return (
    data.invoices.find((inv) => {
      const sup = data.suppliers.find((s) => s.id === inv.supplierId);
      return (
        inv.number &&
        inv.number === extracted.number &&
        inv.date === extracted.date &&
        sup &&
        (same(sup.name, extracted.supplier.name) ||
          (sup.taxId && digits(sup.taxId) === digits(extracted.supplier.taxId)))
      );
    }) ?? null
  );
}

export function updateInvoice(id: string, patch: Partial<Invoice>) {
  invoiceStore.update((prev) => ({
    ...prev,
    invoices: prev.invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  }));
}

export function updateLine(
  invoiceId: string,
  lineId: string,
  patch: Partial<InvoiceLine>
) {
  invoiceStore.update((prev) => ({
    ...prev,
    invoices: prev.invoices.map((inv) =>
      inv.id === invoiceId
        ? {
            ...inv,
            lines: inv.lines.map((l) =>
              l.id === lineId ? { ...l, ...patch } : l
            ),
          }
        : inv
    ),
  }));
}

export function removeInvoice(id: string) {
  invoiceStore.update((prev) => ({
    ...prev,
    invoices: prev.invoices.filter((i) => i.id !== id),
  }));
}

/** Learns names and barcodes so the next invoice links on its own. */
function learn(ing: Ingredient, line: InvoiceLine): Ingredient {
  const aliases = new Set(ing.aliases);
  for (const name of [line.description, line.genericName]) {
    const k = normalizeName(name);
    if (k) {
      aliases.add(k);
    }
  }
  const eans = new Set(ing.eans);
  if (line.ean) {
    eans.add(line.ean);
  }
  return { ...ing, aliases: [...aliases], eans: [...eans] };
}

/** Gives every line an ingredient, creating new ones for unknown lines. */
function linkAll(lines: InvoiceLine[], ingredients: Ingredient[]) {
  return lines.map((line) => {
    let idx = line.ingredientId
      ? ingredients.findIndex((i) => i.id === line.ingredientId)
      : -1;
    if (idx === -1) {
      const name = line.genericName || line.description;
      ingredients.push({
        id: uid("ing"),
        name: name.charAt(0).toUpperCase() + name.slice(1),
        category: line.category,
        baseUnit: line.baseUnit,
        aliases: [],
        eans: [],
      });
      idx = ingredients.length - 1;
    }
    const learned = learn(ingredients[idx] as Ingredient, line);
    ingredients[idx] = learned;
    return {
      ...line,
      ingredientId: learned.id,
      match: line.match === "new" ? ("manual" as const) : line.match,
    };
  });
}

/** The cellar wine an invoice line bought: linked, same EAN or same name. */
function wineFor(
  line: InvoiceLine,
  ing: Ingredient | undefined,
  wines: CellarWine[]
) {
  const linked = ing?.wineId ? wines.find((w) => w.id === ing.wineId) : null;
  if (linked) {
    return linked;
  }
  const byEan = line.ean ? wines.find((w) => w.ean === line.ean) : null;
  if (byEan || line.category !== "wine") {
    return byEan ?? null;
  }
  const name = normalizeName(line.genericName || line.description);
  return (
    wines.find((w) => similarity(name, normalizeName(w.name)) >= AUTO_LINK) ??
    null
  );
}

/** One invoiced unit may be a case of bottles (packSize in litres). */
const bottlesIn = (line: InvoiceLine, wine: CellarWine) =>
  line.baseUnit === "l" && line.packSize > 0 && wine.volumeMl > 0
    ? Math.max(1, Math.round((line.packSize * 1000) / wine.volumeMl))
    : 1;

interface Purchase {
  wineId: string;
  cost: number;
  date: string;
  supplier: string;
}

/**
 * Approves an invoice: lines without an ingredient become new ones, every
 * linked ingredient learns the names used here, and wine lines update the
 * bottle cost in the cellar (margins recalculate from it).
 */
export function approveInvoice(id: string): { winesUpdated: number } {
  const purchases: Purchase[] = [];
  let again = false;
  invoiceStore.update((prev) => {
    const invoice = prev.invoices.find((i) => i.id === id);
    if (!invoice) {
      return prev;
    }
    again = invoice.status === "approved";
    const ingredients = [...prev.ingredients];
    const lines = linkAll(invoice.lines, ingredients);
    const supplier =
      prev.suppliers.find((s) => s.id === invoice.supplierId)?.name ?? "";
    const wines = cellarStore.get().wines;
    for (const line of lines) {
      const k = ingredients.findIndex((i) => i.id === line.ingredientId);
      const ing = ingredients[k];
      const wine = wineFor(line, ing, wines);
      if (!(wine && line.unitPrice > 0)) {
        continue;
      }
      purchases.push({
        wineId: wine.id,
        cost: line.unitPrice / bottlesIn(line, wine),
        date: invoice.date,
        supplier,
      });
      if (ing && !ing.wineId) {
        ingredients[k] = { ...ing, wineId: wine.id, category: "wine" };
      }
    }
    return {
      ...prev,
      ingredients,
      invoices: prev.invoices.map((i) =>
        i.id === id ? { ...i, lines, status: "approved" as const } : i
      ),
    };
  });
  for (const p of purchases) {
    recordWinePurchase(p.wineId, p.cost, p.date, p.supplier, !again);
  }
  return { winesUpdated: purchases.length };
}

/* ------------------------------ Ingredients ----------------------------- */

export function updateIngredient(id: string, patch: Partial<Ingredient>) {
  invoiceStore.update((prev) => ({
    ...prev,
    ingredients: prev.ingredients.map((i) =>
      i.id === id ? { ...i, ...patch } : i
    ),
  }));
}

export function addIngredient(name: string, category = "other"): string {
  const ing: Ingredient = {
    id: uid("ing"),
    name,
    category,
    baseUnit: "kg",
    aliases: [normalizeName(name)].filter(Boolean),
    eans: [],
  };
  invoiceStore.update((prev) => ({
    ...prev,
    ingredients: [...prev.ingredients, ing],
  }));
  return ing.id;
}

/** Joins two ingredients that are the same product; `dropId` goes away. */
export function mergeIngredients(keepId: string, dropId: string) {
  invoiceStore.update((prev) => {
    const keep = prev.ingredients.find((i) => i.id === keepId);
    const drop = prev.ingredients.find((i) => i.id === dropId);
    if (!(keep && drop) || keepId === dropId) {
      return prev;
    }
    const merged: Ingredient = {
      ...keep,
      aliases: [
        ...new Set([
          ...keep.aliases,
          ...drop.aliases,
          normalizeName(drop.name),
        ]),
      ].filter(Boolean),
      eans: [...new Set([...keep.eans, ...drop.eans])],
      wineId: keep.wineId ?? drop.wineId,
    };
    return {
      ...prev,
      ingredients: prev.ingredients
        .filter((i) => i.id !== dropId)
        .map((i) => (i.id === keepId ? merged : i)),
      invoices: prev.invoices.map((inv) => ({
        ...inv,
        lines: inv.lines.map((l) =>
          l.ingredientId === dropId ? { ...l, ingredientId: keepId } : l
        ),
      })),
    };
  });
}

export function removeIngredient(id: string) {
  invoiceStore.update((prev) => ({
    ...prev,
    ingredients: prev.ingredients.filter((i) => i.id !== id),
    invoices: prev.invoices.map((inv) => ({
      ...inv,
      lines: inv.lines.map((l) =>
        l.ingredientId === id ? { ...l, ingredientId: null, match: "new" } : l
      ),
    })),
  }));
}
