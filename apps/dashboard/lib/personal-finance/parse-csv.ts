import type { ParseResult, TxnKind } from "./types";

/**
 * CSV statements: Revolut's export, plus a generic mapping by header names
 * (date / description / amount or debit+credit / balance), PT or EN.
 */

const SEPARATORS = [",", ";", "\t"];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const BR_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/;
const NON_NUMERIC = /[^\d,.-]/g;
const QUOTE = '"';

/** RFC 4180-ish line splitter (quotes, escaped quotes). */
function splitLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === QUOTE && line[i + 1] === QUOTE) {
        cur += QUOTE;
        i++;
      } else if (ch === QUOTE) {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === QUOTE) {
      quoted = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** "1.234,56" / "1,234.56" / "-12.5" → number. */
export function parseAmount(raw: string): number {
  const v = raw.replace(NON_NUMERIC, "");
  if (!v) {
    return 0;
  }
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  let normalized = v;
  if (lastComma > lastDot) {
    normalized = v.replaceAll(".", "").replace(",", ".");
  } else {
    normalized = v.replaceAll(",", "");
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function parseDate(raw: string): string | null {
  const iso = raw.match(ISO_DATE);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const br = raw.match(BR_DATE);
  if (br) {
    const year = br[3]?.length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2]?.padStart(2, "0")}-${br[1]?.padStart(2, "0")}`;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const REVOLUT_KIND: Record<string, TxnKind> = {
  "card payment": "card",
  transfer: "transfer",
  exchange: "exchange",
  atm: "atm",
  topup: "topup",
  fee: "fee",
  "card refund": "card",
};

const pick = (headers: string[], names: RegExp) =>
  headers.findIndex((h) => names.test(h));

const BOM = /^\uFEFF/;
const NEWLINE = /\r?\n/;
const H_DATE = /^(data|date|data lan|dt|transaction date|booking date)/;
const H_DESC =
  /(description|descri|hist[oó]rico|memo|estabelecimento|details|payee|lan[cç]amento)/;
const H_AMOUNT = /^(amount|valor|value|quantia|montante)/;
const H_DEBIT = /(d[eé]bito|debit|sa[ií]da|money out|withdrawal)/;
const H_CREDIT = /(cr[eé]dito|credit|entrada|money in|deposit)/;
const H_FEE = /^(fee|tarifa|taxa)/;
const H_CURRENCY = /^(currency|moeda)/;
const H_BALANCE = /(balance|saldo)/;
const H_TYPE = /^(type|tipo)/;
const H_PRODUCT = /^product/;
const H_STATE = /^(state|status|situa)/;
const DEBIT_TYPE = /d[eé]bito|debit/;
const SKIPPED_STATE = /revert|declin|fail/;

type Draft = ParseResult["txns"][number];
type Columns = ReturnType<typeof columnsOf>;

function separatorOf(first: string) {
  return (
    SEPARATORS.map((s) => [s, first.split(s).length] as const).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] ?? ","
  );
}

function columnsOf(headers: string[], isRevolut: boolean) {
  return {
    date: isRevolut ? headers.indexOf("completed date") : pick(headers, H_DATE),
    started: isRevolut ? headers.indexOf("started date") : -1,
    desc: pick(headers, H_DESC),
    amount: pick(headers, H_AMOUNT),
    debit: pick(headers, H_DEBIT),
    credit: pick(headers, H_CREDIT),
    fee: pick(headers, H_FEE),
    currency: pick(headers, H_CURRENCY),
    balance: pick(headers, H_BALANCE),
    type: pick(headers, H_TYPE),
    product: pick(headers, H_PRODUCT),
    state: pick(headers, H_STATE),
  };
}

function signedAmount(
  r: string[],
  col: Columns,
  typeRaw: string,
  isRevolut: boolean
) {
  if (col.amount < 0) {
    return (
      parseAmount(r[col.credit] ?? "") -
      Math.abs(parseAmount(r[col.debit] ?? ""))
    );
  }
  const amount = parseAmount(r[col.amount] ?? "");
  // Some banks export positive values with a "Débito" type column
  return !isRevolut && DEBIT_TYPE.test(typeRaw) && amount > 0
    ? -amount
    : amount;
}

function rowToTxn(r: string[], col: Columns, isRevolut: boolean): Draft | null {
  const date = parseDate(r[col.date] ?? "") ?? parseDate(r[col.started] ?? "");
  const state = (r[col.state] ?? "").toLowerCase();
  if (!date || SKIPPED_STATE.test(state)) {
    return null;
  }
  const typeRaw = (r[col.type] ?? "").toLowerCase();
  const balance = r[col.balance];
  return {
    date,
    description: r[col.desc] || "Sem descrição",
    amount: signedAmount(r, col, typeRaw, isRevolut),
    fee: Math.abs(parseAmount(r[col.fee] ?? "")),
    currency: (r[col.currency] || "").toUpperCase() || "EUR",
    balance: balance ? parseAmount(balance) : null,
    kind:
      REVOLUT_KIND[typeRaw] ??
      (typeRaw.includes("transf") ? "transfer" : "other"),
    account:
      (r[col.product] ?? "").toLowerCase() === "savings" ? "pocket" : "main",
    pending: state === "pending",
  };
}

export function parseCsv(text: string): ParseResult {
  const lines = text
    .replace(BOM, "")
    .split(NEWLINE)
    .filter((l) => l.trim());
  const first = lines[0] ?? "";
  const sep = separatorOf(first);
  const headers = splitLine(first, sep).map((h) => h.toLowerCase());
  const isRevolut =
    headers.includes("started date") && headers.includes("product");
  const col = columnsOf(headers, isRevolut);
  if (col.desc < 0 || (col.amount < 0 && col.debit < 0 && col.credit < 0)) {
    throw new Error(
      "Não reconheci as colunas do CSV (preciso de descrição e valor)."
    );
  }
  const txns: Draft[] = [];
  for (const line of lines.slice(1)) {
    const t = rowToTxn(splitLine(line, sep), col, isRevolut);
    if (t) {
      txns.push(t);
    }
  }
  const currency = txns[0]?.currency ?? "EUR";
  return { txns, bank: isRevolut ? "Revolut" : "CSV", currency };
}
