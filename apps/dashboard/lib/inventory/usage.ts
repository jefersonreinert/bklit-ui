/**
 * Sales → stock usage, as pure functions (convex/sales.ts and tests):
 * what one sold portion takes from stock (through preps, with losses),
 * and reading a sales export (CSV) from Lightspeed or a spreadsheet.
 */

import { type CostRecipe, grossQty, RecipeCycleError } from "./costing";

/**
 * Stock taken by selling `qty` portions of a recipe: item id → base
 * units, losses included, preps opened up to their own ingredients.
 */
export function expandRecipe(
  recipe: CostRecipe,
  qty: number,
  recipes: Map<string, CostRecipe>,
  out = new Map<string, number>(),
  stack: string[] = []
) {
  if (stack.includes(recipe.id)) {
    throw new RecipeCycleError([...stack, recipe.id]);
  }
  const path = [...stack, recipe.id];
  for (const line of recipe.lines) {
    const used = grossQty(line) * qty;
    if (line.itemId) {
      out.set(line.itemId, round((out.get(line.itemId) ?? 0) + used));
    } else if (line.prepId) {
      const prep = recipes.get(line.prepId);
      if (prep && prep.yieldQty > 0) {
        expandRecipe(prep, used / prep.yieldQty, recipes, out, path);
      }
    }
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/* ---------------------------------- CSV ---------------------------------- */

/** Splits CSV text (comma, semicolon or tab; quoted fields) into rows. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].reduce((best, s) =>
    first.split(s).length > first.split(best).length ? s : best
  , ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") {
        i++;
      }
      row.push(field.trim());
      if (row.some((f) => f !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((f) => f !== "")) {
    rows.push(row);
  }
  return rows;
}

export interface SalesColumns {
  sku: number;
  name: number;
  qty: number;
}

const HEAD = {
  sku: /^(sku|plu|code|codigo|código|item ?code|article ?number|product ?code|id)$/i,
  name: /^(name|product|item|description|descrição|nome|produto|article|product ?name|item ?name)$/i,
  qty: /^(qty|quantity|quantidade|qtd|sold|items ?sold|count|amount sold|units|# sold|number sold)$/i,
};

/** Finds the SKU, name and quantity columns from the header row. */
export function detectColumns(header: string[]): SalesColumns | null {
  const find = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const cols = { sku: find(HEAD.sku), name: find(HEAD.name), qty: find(HEAD.qty) };
  return cols.qty >= 0 && (cols.name >= 0 || cols.sku >= 0) ? cols : null;
}

/** "1.234,5" or "1,234.5" or "3" → number. */
export function parseNumber(s: string) {
  const t = s.replace(/[^\d,.-]/g, "");
  if (!t) {
    return Number.NaN;
  }
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  const normalized =
    lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  return Number(normalized);
}

const TOTAL = /^(total|totals|grand total|subtotal|totale|totaal)$/i;

export interface SoldLine {
  sku: string;
  name: string;
  qty: number;
}

/** Sales lines of an export; rows without a quantity are left out. */
export function salesFromCsv(text: string): { lines: SoldLine[]; columns: SalesColumns | null } {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => detectColumns(r) !== null);
  if (headerAt < 0) {
    return { lines: [], columns: null };
  }
  const columns = detectColumns(rows[headerAt] ?? []) as SalesColumns;
  const lines: SoldLine[] = [];
  for (const r of rows.slice(headerAt + 1)) {
    const qty = parseNumber(r[columns.qty] ?? "");
    const name = columns.name >= 0 ? (r[columns.name] ?? "") : "";
    const sku = columns.sku >= 0 ? (r[columns.sku] ?? "") : "";
    if (!(Number.isFinite(qty) && qty !== 0) || !(name || sku)) {
      continue;
    }
    if (TOTAL.test(name.trim()) || TOTAL.test(sku.trim())) {
      continue;
    }
    lines.push({ sku: sku.trim(), name: name.trim(), qty });
  }
  return { lines, columns };
}
