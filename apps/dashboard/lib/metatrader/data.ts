import { appLocale } from "@/lib/i18n/locale";
/**
 * Shapes the server's answers for tables: most tools return pandas
 * `DataFrame.to_csv()` text (first column is the unnamed index), some a
 * dict or a list.
 */

export type Cell = string | number | boolean | null;

export interface Table {
  columns: string[];
  rows: Record<string, Cell>[];
}

const NUMERIC = /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i;
const NEWLINE = /\r?\n/;

function cell(raw: string): Cell {
  const v = raw.trim();
  if (v === "") {
    return null;
  }
  if (NUMERIC.test(v)) {
    return Number(v);
  }
  if (v === "True" || v === "False") {
    return v === "True";
  }
  return v;
}

/** One CSV line, honoring quotes ("a,b" and "" escapes). */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string): Table {
  const lines = text.split(NEWLINE).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { columns: [], rows: [] };
  }
  const header = splitLine(lines[0] as string);
  // pandas writes the index as an unnamed first column
  const skipIndex = header[0]?.trim() === "";
  const columns = (skipIndex ? header.slice(1) : header).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const values = skipIndex ? cells.slice(1) : cells;
    const row: Record<string, Cell> = {};
    columns.forEach((c, i) => {
      row[c] = cell(values[i] ?? "");
    });
    return row;
  });
  return { columns, rows };
}

const looksLikeCsv = (s: string) => s.includes(",") && s.includes("\n");

/** Any tool value as a table, or null when it is a single record/text. */
export function toTable(value: unknown): Table | null {
  if (typeof value === "string") {
    return looksLikeCsv(value) ? parseCsv(value) : null;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
      const columns = [
        ...new Set(value.flatMap((v) => Object.keys(v as object))),
      ];
      return { columns, rows: value as Record<string, Cell>[] };
    }
    return {
      columns: ["valor"],
      rows: value.map((v) => ({ valor: v as Cell })),
    };
  }
  return null;
}

/** "Empty DataFrame…" / "[]" / "" all mean no rows. */
export function isEmptyValue(value: unknown) {
  if (value == null || value === "") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return typeof value === "string" && value.startsWith("Empty DataFrame");
}

export function sumColumn(table: Table, column: string) {
  return table.rows.reduce((acc, r) => {
    const v = r[column];
    return acc + (typeof v === "number" ? v : 0);
  }, 0);
}

/** First column that exists, for brokers/versions naming things apart. */
export function pick(table: Table, ...names: string[]) {
  return names.find((n) => table.columns.includes(n)) ?? null;
}

export function formatMoney(value: unknown, currency = "") {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  const text = n.toLocaleString(appLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${text} ${currency}` : text;
}

export function formatSigned(value: unknown, currency = "") {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return `${n > 0 ? "+" : ""}${formatMoney(n, currency)}`;
}
