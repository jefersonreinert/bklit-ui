"use client";

import { api } from "@/convex/_generated/api";
import { Icon, type IconName } from "@/lib/icons";
import { useCompany, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { CARD, num, useMoney } from "../inventory/shared";
import type { ManageSection } from "./manage-view";

/** What still needs someone in this bar, each card opening its screen. */
export function PanelSection({ onOpen }: { onOpen: (s: ManageSection) => void }) {
  const company = useCompany();
  const p = usePosQuery(api.inv.pending, { company });
  const money = useMoney();
  if (!p) {
    return <p className={cn(CARD, "text-muted-foreground text-sm")}>Carregando…</p>;
  }
  const cards: {
    key: string;
    tone: "bad" | "warn" | "info";
    icon: IconName;
    title: string;
    hint: string;
    count: number;
    names: string[];
    open: ManageSection;
    action: string;
  }[] = [
    {
      key: "free",
      tone: "bad",
      icon: "IconTag",
      title: "À venda por €0",
      hint: "Disponíveis no POS sem preço: dê o preço ou deixe indisponível.",
      count: p.free.count,
      names: p.free.list.map((x) => x.name),
      open: "products",
      action: "Abrir produtos",
    },
    {
      key: "invoices",
      tone: "warn",
      icon: "IconReceiptBill",
      title: "Invoices para aprovar",
      hint: "Aprovar lança a compra no estoque e atualiza o custo.",
      count: p.invoices.count,
      names: p.invoices.list.map((x) => `${x.supplier} #${x.number} · ${money(x.total)}`),
      open: "invoices",
      action: "Abrir invoices",
    },
    {
      key: "low",
      tone: "warn",
      icon: "IconClockAlert",
      title: "Abaixo do mínimo",
      hint: "Itens com saldo menor que o mínimo definido.",
      count: p.low.count,
      names: p.low.list.map((x) => x.name),
      open: "purchasing",
      action: "Ver pedidos",
    },
    {
      key: "noSheet",
      tone: "warn",
      icon: "IconCocktail",
      title: "Cocktails sem ficha",
      hint: "Sem ficha técnica, a venda não baixa o estoque.",
      count: p.noSheet.count,
      names: p.noSheet.list.map((x) => x.name),
      open: "recipes",
      action: "Abrir fichas",
    },
    {
      key: "noPrice",
      tone: "info",
      icon: "IconTag",
      title: "Produtos sem preço",
      hint: "Estão indisponíveis até receberem preço.",
      count: p.noPrice.count,
      names: p.noPrice.list.map((x) => x.name),
      open: "products",
      action: "Abrir produtos",
    },
    {
      key: "noCode",
      tone: "info",
      icon: "IconBarcode",
      title: "Garrafas sem código de barras",
      hint: "Escaneie em Itens (ou em Produtos: o código vai para os dois).",
      count: p.noCode.count,
      names: p.noCode.list.map((x) => x.name),
      open: "items",
      action: "Abrir itens",
    },
  ];
  const open = cards.filter((c) => c.count > 0);
  const tone = {
    bad: "border-red-500/40 bg-red-500/5",
    warn: "border-amber-500/40 bg-amber-500/5",
    info: "",
  } as const;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Produtos" value={num(p.totals.products, 0)} />
        <Kpi label="Itens de estoque" value={num(p.totals.items, 0)} />
        <Kpi label="Produtos com ficha" value={num(p.totals.sheets, 0)} />
        <Kpi label="Itens nunca contados" value={num(p.totals.neverCounted, 0)} />
      </div>
      {open.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {open.map((c) => (
            <section className={cn(CARD, "space-y-2", tone[c.tone])} key={c.key}>
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 size-4 shrink-0" name={c.icon} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">
                    {c.title} <span className="tabular-nums">· {c.count}</span>
                  </p>
                  <p className="text-muted-foreground text-xs">{c.hint}</p>
                </div>
              </div>
              <p className="line-clamp-3 text-muted-foreground text-xs">
                {c.names.slice(0, 8).join(", ")}
                {c.count > 8 ? ` e mais ${c.count - 8}` : ""}
              </p>
              <button className="font-medium text-sm underline-offset-4 hover:underline" onClick={() => c.open && onOpen(c.open)} type="button">
                {c.action} →
              </button>
            </section>
          ))}
        </div>
      ) : (
        <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>Nada pendente neste bar.</p>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-semibold text-lg tabular-nums">{value}</span>
    </div>
  );
}
