import { parseAmount } from "./parse-csv";
import type { ParseResult, TxnKind } from "./types";

/**
 * PDF statements (Revolut layout; similar tables from other banks work if
 * they have date / description / money out / money in / balance columns).
 * Works on positioned text items, so it runs on pdf.js output in the
 * browser and in tests alike.
 */

export interface PdfItem {
  str: string;
  x: number;
  y: number;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  fev: "02",
  mar: "03",
  apr: "04",
  abr: "04",
  may: "05",
  mai: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  ago: "08",
  sep: "09",
  set: "09",
  oct: "10",
  out: "10",
  nov: "11",
  dec: "12",
  dez: "12",
};
const EN_DATE = /^([A-Z][a-z]{2})\.? (\d{1,2}), (\d{4})$/;
const PT_DATE = /^(\d{1,2}) de ([a-zç]{3})[a-zç]*\.? de (\d{4})$/i;
const MONEY = /^-?(?:[€$£R]|R\$|US\$)\s?-?[\d.,]+$|^-?[\d.,]+\s?(?:€|EUR|BRL)$/;
const CURRENCY_SIGN = /R\$|€|\$|£/;
const LINE_TOLERANCE = 2.5;
const H_OUT = /^(money out|sa[ií]das?|d[eé]bitos?)$/i;
const H_IN = /^(money in|entradas?|cr[eé]ditos?)$/i;
const H_BALANCE = /^(balance|saldo)$/i;
const POCKET_SECTION = /(pocket|savings|vault|cofrinho|poupan).*transa/;
const MAIN_SECTION = /transactions from|transa[cç][oõ]es/;
const K_EXCHANGE = /^exchanged|^c[aâ]mbio/i;
const K_ATM = /cash withdrawal|saque/i;
const K_TOPUP = /top-?up|recarga/i;
const K_CARD = /card:|cart[aã]o:/i;
const K_TRANSFER = /^(transfer|payment from|international transfer|pix|ted)/i;
const FEE = /fee:\s*([€$£]|R\$)?\s?([\d.,]+)/i;
const REVOLUT = /revolut/i;
const BRL_STATEMENT = /^BRL Statement/i;
const FOOTER = /^page \d+ of \d+|©/i;

function toDate(text: string) {
  const en = text.match(EN_DATE);
  const pt = en ? null : text.match(PT_DATE);
  const m = en ?? pt;
  if (!m) {
    return null;
  }
  const [day, mon, year] = en ? [m[2], m[1], m[3]] : [m[1], m[2], m[3]];
  const month = MONTHS[(mon ?? "").slice(0, 3).toLowerCase()];
  return month ? `${year}-${month}-${day?.padStart(2, "0")}` : null;
}

/** Items of one page → lines (top to bottom), items left to right. */
function toLines(items: PdfItem[]) {
  const sorted = [...items]
    .filter((i) => i.str.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfItem[][] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs((line[0]?.y ?? 0) - item.y) <= LINE_TOLERANCE) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x));
}

interface Columns {
  out: number;
  in: number;
  balance: number | null;
}

function headerColumns(line: PdfItem[]): Columns | null {
  const find = (re: RegExp) => line.find((i) => re.test(i.str.trim()))?.x;
  const out = find(H_OUT);
  const inn = find(H_IN);
  if (out === undefined || inn === undefined) {
    return null;
  }
  return { out, in: inn, balance: find(H_BALANCE) ?? null };
}

interface Section {
  account: "main" | "pocket";
  pending: boolean;
}

function sectionOf(text: string, current: Section): Section {
  const t = text.toLowerCase();
  if (t.startsWith("pending from") || t.startsWith("pendente")) {
    return { account: "main", pending: true };
  }
  if (POCKET_SECTION.test(t)) {
    return { account: "pocket", pending: false };
  }
  if (MAIN_SECTION.test(t)) {
    return { account: "main", pending: false };
  }
  return current;
}

function kindOf(description: string, details: string): TxnKind {
  if (K_EXCHANGE.test(description)) {
    return "exchange";
  }
  if (K_ATM.test(description)) {
    return "atm";
  }
  if (K_TOPUP.test(description)) {
    return "topup";
  }
  if (K_CARD.test(details)) {
    return "card";
  }
  if (K_TRANSFER.test(description)) {
    return "transfer";
  }
  return "other";
}

/** Column whose header starts closest to the left of x. */
function columnAt(x: number, cols: Columns): "out" | "in" | "balance" | null {
  const starts: ["out" | "in" | "balance", number][] = [
    ["out", cols.out],
    ["in", cols.in],
    ...(cols.balance === null
      ? []
      : ([["balance", cols.balance]] as ["balance", number][])),
  ];
  let best: "out" | "in" | "balance" | null = null;
  let bestX = Number.NEGATIVE_INFINITY;
  for (const [name, start] of starts) {
    if (x >= start - 25 && start > bestX) {
      best = name;
      bestX = start;
    }
  }
  return best;
}

type Draft = ParseResult["txns"][number];
const COLUMN_SLACK = 25;

/** Kind and fee from the detail lines under a transaction. */
function finish(txn: Draft, detailLines: string[]): Draft {
  const details = detailLines.join(" ");
  const out = { ...txn, kind: kindOf(txn.description, details) };
  const fee = details.match(FEE);
  if (fee?.[2] && out.amount !== 0) {
    // The PDF shows amounts net of fees (out incl. fee, in minus fee);
    // keep the gross amount + fee, like the CSV export
    out.fee = parseAmount(fee[2]);
    out.amount += out.fee;
  }
  return out;
}

/** Money columns of a dated line → signed amount and balance. */
function amounts(line: PdfItem[], cols: Columns) {
  let amount = 0;
  let balance: number | null = null;
  let euro = false;
  for (const m of line.filter((i) => MONEY.test(i.str.trim()))) {
    const where = columnAt(m.x, cols);
    const value = parseAmount(m.str);
    if (where === "out" && amount === 0) {
      amount = -Math.abs(value);
    } else if (where === "in" && amount === 0) {
      amount = Math.abs(value);
    } else if (where === "balance") {
      balance = value;
    }
    euro ||= m.str.match(CURRENCY_SIGN)?.[0] === "€";
  }
  return { amount, balance, euro };
}

function dated(
  date: string,
  line: PdfItem[],
  cols: Columns,
  section: Section,
  currency: string
): Draft {
  const { amount, balance } = amounts(line, cols);
  const description = line
    .slice(1)
    .filter((i) => i.x < cols.out - COLUMN_SLACK && !MONEY.test(i.str.trim()))
    .map((i) => i.str)
    .join(" ")
    .trim();
  return {
    date,
    description: description || "Sem descrição",
    amount,
    fee: 0,
    currency,
    balance: section.pending ? null : balance,
    kind: "other",
    account: section.account,
    pending: section.pending,
  };
}

class PdfReader {
  txns: Draft[] = [];
  cols: Columns | null = null;
  section: Section = { account: "main", pending: false };
  currency = "EUR";
  bank = "PDF";
  open: { txn: Draft; details: string[] } | null = null;

  close() {
    if (this.open) {
      this.txns.push(finish(this.open.txn, this.open.details));
      this.open = null;
    }
  }

  meta(text: string) {
    if (REVOLUT.test(text)) {
      this.bank = "Revolut";
    }
    if (BRL_STATEMENT.test(text)) {
      this.currency = "BRL";
    }
    const next = sectionOf(text, this.section);
    if (next !== this.section) {
      this.close();
      this.section = next;
    }
  }

  line(line: PdfItem[]) {
    const text = line
      .map((i) => i.str)
      .join(" ")
      .trim();
    this.meta(text);
    const header = headerColumns(line);
    if (header) {
      this.close();
      this.cols = header;
      return;
    }
    const cols = this.cols;
    if (!cols) {
      return;
    }
    const date = toDate(line[0]?.str.trim() ?? "");
    if (date) {
      this.close();
      if (amounts(line, cols).euro) {
        this.currency = "EUR";
      }
      this.open = {
        txn: dated(date, line, cols, this.section, this.currency),
        details: [],
      };
      return;
    }
    if (this.open) {
      // Detail lines (To:, Card:, Fee:, FX rate) belong to the open line
      const detail = line
        .filter((i) => i.x < cols.out - COLUMN_SLACK)
        .map((i) => i.str)
        .join(" ");
      if (detail) {
        this.open.details.push(detail);
      }
      if (FOOTER.test(text)) {
        this.close();
      }
    }
  }
}

export function parsePdfItems(pages: PdfItem[][]): ParseResult {
  const reader = new PdfReader();
  for (const items of pages) {
    for (const line of toLines(items)) {
      reader.line(line);
    }
  }
  reader.close();
  return {
    txns: reader.txns.filter((t) => t.amount !== 0),
    bank: reader.bank,
    currency: reader.currency,
  };
}

/** Same version as the pdfjs-dist dev dependency (used for types). */
const PDFJS_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build";

/** Browser: PDF file → positioned text items per page (pdf.js). */
export async function pdfItems(file: File): Promise<PdfItem[][]> {
  // Loaded from the CDN only when a PDF is imported: keeps ~400 KB of pdf.js
  // out of the server bundle (it never runs there) and out of the app
  const pdfjs = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ `${PDFJS_CDN}/pdf.min.mjs`
  )) as typeof import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise;
  const pages: PdfItem[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .filter(
          (i): i is { str: string; transform: number[] } & typeof i =>
            "str" in i
        )
        .map((i) => ({
          str: i.str,
          x: i.transform[4] ?? 0,
          y: i.transform[5] ?? 0,
        }))
    );
  }
  return pages;
}
