"use client";

import {
  byCategory,
  external,
  inRange,
  summarize,
} from "@/lib/personal-finance/analytics";
import type { Txn } from "@/lib/personal-finance/types";
import { orderTotals } from "@/lib/pos/store";
import type { PosData } from "@/lib/pos/types";

/**
 * A compact, plain-text snapshot of what the panel knows on this device
 * (POS, personal finances, notes), handed to the AI as context so it can
 * write about the real numbers. Kept short to save tokens.
 */

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const eur = (n: number) =>
  n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

function posBlock() {
  const pos = readJson<PosData>("cb:pos:v1");
  if (!pos?.orders?.length) {
    return null;
  }
  const since = Date.now() - 7 * 86_400_000;
  const week = pos.orders.filter((o) => o.createdAt >= since);
  const paid = week.filter((o) => o.status === "paid");
  const total = paid.reduce((s, o) => s + orderTotals(o).total, 0);
  const open = pos.orders.filter(
    (o) => o.status === "open" || o.status === "paying"
  ).length;
  const best = new Map<string, number>();
  for (const o of paid) {
    for (const i of o.items) {
      best.set(i.name, (best.get(i.name) ?? 0) + i.qty);
    }
  }
  const top = [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n, q]) => `${n} (${q})`)
    .join(", ");
  return `POS (últimos 7 dias): ${paid.length} pedidos pagos, total ${eur(total)}, ${open} pedidos em aberto agora.${top ? ` Mais vendidos: ${top}.` : ""}`;
}

function financeBlock() {
  const data = readJson<{ txns: Txn[] }>("cb:personal-finance:v1");
  if (!data?.txns?.length) {
    return null;
  }
  const month = inRange(data.txns, "mes");
  const s = summarize(data.txns, month);
  const cats = byCategory(external(month))
    .slice(0, 5)
    .map((c) => `${c.label} ${eur(c.value)}`)
    .join(", ");
  return `Finanças pessoais (mês atual): entradas ${eur(s.entradas)}, saídas ${eur(s.saidas)}, resultado ${eur(s.resultado)}${s.conta === null ? "" : `, saldo da conta ${eur(s.conta)}`}.${cats ? ` Maiores gastos: ${cats}.` : ""}`;
}

export function panelSnapshot(noteTitles: string[] = []) {
  const blocks = [posBlock(), financeBlock()];
  if (noteTitles.length) {
    blocks.push(`Notas existentes: ${noteTitles.slice(0, 60).join(" · ")}`);
  }
  const text = blocks.filter(Boolean).join("\n");
  return text ? `Dados do painel neste aparelho:\n${text}` : "";
}
