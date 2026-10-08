"use client";

import { useSyncExternalStore } from "react";
import { categorize, txnId } from "./categorize";
import { parseCsv } from "./parse-csv";
import { parsePdfItems, pdfItems } from "./parse-pdf";
import type { ImportedFile, ParseResult, Txn } from "./types";

/**
 * Personal statements stay on this device (localStorage): bank data never
 * leaves the browser. Re-importing the same statement only adds new lines.
 */

const KEY = "cb:personal-finance:v1";
const PDF_EXT = /\.pdf$/i;

export interface FinanceData {
  txns: Txn[];
  files: ImportedFile[];
}

const EMPTY: FinanceData = { txns: [], files: [] };
let cache: FinanceData | null = null;

// Another tab or the Convex sync rewrote the store: drop the cached copy
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = null;
    }
  });
}
const listeners = new Set<() => void>();

function read(): FinanceData {
  if (cache) {
    return cache;
  }
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as FinanceData) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: FinanceData) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota or private mode: keep the data for this session only
  }
  for (const l of listeners) {
    l();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePersonalFinance() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

async function parseFile(file: File): Promise<ParseResult> {
  if (file.type === "application/pdf" || PDF_EXT.test(file.name)) {
    return parsePdfItems(await pdfItems(file));
  }
  return parseCsv(await file.text());
}

/** A pending line that now shows up completed (same day, amount, text). */
const pendingKey = (t: Pick<Txn, "date" | "amount" | "description">) =>
  `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase()}`;

export interface ImportOutcome {
  name: string;
  added: number;
  duplicates: number;
  error?: string;
}

export async function importStatement(file: File): Promise<ImportOutcome> {
  let parsed: ParseResult;
  try {
    parsed = await parseFile(file);
  } catch (err) {
    return {
      name: file.name,
      added: 0,
      duplicates: 0,
      error: err instanceof Error ? err.message : "Arquivo não reconhecido.",
    };
  }
  if (parsed.txns.length === 0) {
    return {
      name: file.name,
      added: 0,
      duplicates: 0,
      error: "Nenhuma transação encontrada no arquivo.",
    };
  }
  const current = read();
  const ids = new Set(current.txns.map((t) => t.id));
  const fresh: Txn[] = [];
  for (const t of parsed.txns) {
    const id = txnId(t);
    if (!ids.has(id)) {
      ids.add(id);
      fresh.push({ ...t, id, ...categorize(t), source: file.name });
    }
  }
  const completed = new Set(
    fresh.filter((t) => !t.pending).map((t) => pendingKey(t))
  );
  const kept = current.txns.filter(
    (t) => !(t.pending && completed.has(pendingKey(t)))
  );
  const format = PDF_EXT.test(file.name) ? "pdf" : "csv";
  write({
    txns: [...kept, ...fresh],
    files: [
      ...current.files.filter((f) => f.name !== file.name),
      {
        name: file.name,
        importedAt: Date.now(),
        count: parsed.txns.length,
        format,
        bank: parsed.bank,
      },
    ],
  });
  return {
    name: file.name,
    added: fresh.length,
    duplicates: parsed.txns.length - fresh.length,
  };
}

export function removeStatement(name: string) {
  const current = read();
  write({
    txns: current.txns.filter((t) => t.source !== name),
    files: current.files.filter((f) => f.name !== name),
  });
}

export function clearPersonalFinance() {
  write(EMPTY);
}

/** Manual re-categorization of one line (kept across re-imports). */
export function setCategory(id: string, category: Txn["category"]) {
  const current = read();
  write({
    ...current,
    txns: current.txns.map((t) =>
      t.id === id ? { ...t, category, internal: category === "poupanca" } : t
    ),
  });
}
