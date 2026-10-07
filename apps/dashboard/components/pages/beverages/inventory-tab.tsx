"use client";

import { Icon } from "@/lib/icons";
import { type FormEvent, useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type BeverageKind,
  type InventoryRow,
  kindLabel,
  type Movement,
  type MovementType,
} from "@/lib/beverage-data";
import { formatBRL, formatBRLCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FilterSelect, normalize, SearchInput, StockBar } from "./bev-shared";

const ALL = "todos";
const MOVEMENT_TYPES: MovementType[] = ["Entrada", "Saída", "Perda", "Ajuste"];

const movementVariant: Record<
  MovementType,
  "outline" | "secondary" | "destructive" | "default"
> = {
  Entrada: "outline",
  Saída: "secondary",
  Perda: "destructive",
  Ajuste: "default",
};

function downloadCsv(rows: InventoryRow[]) {
  const header = [
    "Código",
    "Tipo",
    "Item",
    "Detalhe",
    "Unidade",
    "Estoque",
    "Ideal",
    "Mínimo",
    "Custo unitário",
    "Valor em estoque",
    "Local",
    "Fornecedor",
  ];
  const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.id,
      kindLabel[r.kind],
      r.name,
      r.detail,
      r.unit,
      r.stock,
      r.par,
      r.min,
      r.unitCost.toFixed(2).replace(".", ","),
      (r.stock * r.unitCost).toFixed(2).replace(".", ","),
      r.location,
      r.supplier,
    ]
      .map(csvCell)
      .join(";")
  );
  // BOM so Excel opens accents correctly
  const blob = new Blob(
    [`﻿${[header.map(csvCell).join(";"), ...lines].join("\n")}`],
    {
      type: "text/csv;charset=utf-8",
    }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inventario-bebidas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function InventoryTab({
  rows,
  movements,
  onSetStock,
  onMovement,
}: {
  rows: InventoryRow[];
  movements: Movement[];
  onSetStock: (kind: BeverageKind, id: string, stock: number) => void;
  onMovement: (m: Movement) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState(ALL);
  const [onlyLow, setOnlyLow] = useState(ALL);
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [movItem, setMovItem] = useState(rows[0]?.id ?? "");
  const [movType, setMovType] = useState<MovementType>("Entrada");
  const [lastCount, setLastCount] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return rows.filter(
      (r) =>
        (kind === ALL || r.kind === kind) &&
        (onlyLow === ALL || r.stock <= r.min) &&
        (q === "" ||
          normalize(`${r.name} ${r.detail} ${r.supplier} ${r.id}`).includes(q))
    );
  }, [rows, query, kind, onlyLow]);

  const totalValue = rows.reduce((a, r) => a + r.stock * r.unitCost, 0);
  const low = rows.filter((r) => r.stock <= r.min);
  const parValue = rows.reduce((a, r) => a + r.par * r.unitCost, 0);

  const variances = filtered
    .filter((r) => counts[r.id] !== undefined && counts[r.id] !== r.stock)
    .map((r) => ({ row: r, diff: (counts[r.id] ?? r.stock) - r.stock }));
  const varianceValue = variances.reduce(
    (a, v) => a + v.diff * v.row.unitCost,
    0
  );

  const reorder = useMemo(() => {
    const bySupplier = new Map<string, { row: InventoryRow; qty: number }[]>();
    for (const r of rows) {
      if (r.stock <= r.min && r.par > 0) {
        const list = bySupplier.get(r.supplier) ?? [];
        list.push({ row: r, qty: r.par - r.stock });
        bySupplier.set(r.supplier, list);
      }
    }
    return [...bySupplier.entries()].map(([supplier, items]) => ({
      supplier,
      items,
      total: items.reduce((a, i) => a + i.qty * i.row.unitCost, 0),
    }));
  }, [rows]);

  const confirmCount = () => {
    const now = new Date();
    for (const v of variances) {
      onSetStock(v.row.kind, v.row.id, v.row.stock + v.diff);
      onMovement({
        id: `M${now.getTime()}-${v.row.id}`,
        date: now,
        type: "Ajuste",
        itemId: v.row.id,
        itemName: v.row.name,
        qty: v.diff,
        note: "Contagem física",
      });
    }
    setLastCount(
      variances.length === 0
        ? "Contagem confirmada sem divergências."
        : `${variances.length} ajuste(s) aplicados · diferença de ${formatBRL(varianceValue)}.`
    );
    setCounts({});
    setCounting(false);
  };

  const submitMovement = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const qty = Math.abs(Number(form.get("qty") ?? 0));
    const row = rows.find((r) => r.id === movItem);
    if (!(row && qty)) {
      return;
    }
    const signed = movType === "Entrada" ? qty : -qty;
    const nextStock =
      movType === "Ajuste" ? qty : Math.max(0, row.stock + signed);
    onSetStock(row.kind, row.id, nextStock);
    onMovement({
      id: `M${Date.now()}`,
      date: new Date(),
      type: movType,
      itemId: row.id,
      itemName: row.name,
      qty: movType === "Ajuste" ? nextStock - row.stock : signed,
      note: String(form.get("note") ?? ""),
    });
    e.currentTarget.reset();
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          hint="Custo de tudo que está no estoque"
          icon="IconMoneybag"
          label="Valor do estoque"
          tone="neutral"
          value={formatBRL(totalValue)}
        />
        <MetricTile
          hint={`Estoque ideal vale ${formatBRL(parValue)}`}
          icon="IconChartCompare"
          label="Cobertura do ideal"
          tone={totalValue / parValue >= 0.8 ? "good" : "warn"}
          value={`${Math.round((totalValue / parValue) * 100)}%`}
        />
        <MetricTile
          hint="No ponto de reposição ou abaixo"
          icon="IconWarningSign"
          label="Abaixo do mínimo"
          tone={low.length > 0 ? "bad" : "good"}
          value={`${low.length} itens`}
        />
        <MetricTile
          hint="Contados no inventário"
          icon="IconBarcode"
          label="SKUs controlados"
          tone="neutral"
          value={String(rows.length)}
        />
      </section>

      {lastCount ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-success" name="IconCheckCircle2" />
            {lastCount}
          </span>
          <Button onClick={() => setLastCount(null)} size="xs" variant="ghost">
            Fechar
          </Button>
        </div>
      ) : null}

      <ChartCard
        action={
          <div className="flex gap-2">
            <Button
              onClick={() => downloadCsv(filtered)}
              size="sm"
              variant="outline"
            >
              <Icon className="size-4" name="IconFileDownload" />
              CSV
            </Button>
            {counting ? (
              <>
                <Button
                  onClick={() => {
                    setCounting(false);
                    setCounts({});
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Cancelar
                </Button>
                <Button onClick={confirmCount} size="sm">
                  Confirmar contagem
                </Button>
              </>
            ) : (
              <Button onClick={() => setCounting(true)} size="sm">
                <Icon className="size-4" name="IconChecklist" />
                Iniciar contagem
              </Button>
            )}
          </div>
        }
        description={
          counting
            ? `Digite a quantidade física · ${variances.length} divergência(s) · ${formatBRL(varianceValue)}`
            : "Todos os itens contáveis de bebidas"
        }
        title="Inventário"
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <SearchInput
            onChange={setQuery}
            placeholder="Buscar item, fornecedor ou código"
            value={query}
          />
          <FilterSelect
            items={[
              { value: ALL, label: "Todos os tipos" },
              ...(Object.keys(kindLabel) as BeverageKind[])
                .filter((k) => k !== "coquetel")
                .map((k) => ({ value: k, label: kindLabel[k] })),
            ]}
            onChange={setKind}
            value={kind}
          />
          <FilterSelect
            items={[
              { value: ALL, label: "Todos os níveis" },
              { value: "low", label: "Abaixo do mínimo" },
            ]}
            onChange={setOnlyLow}
            value={onlyLow}
          />
        </div>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Item</th>
                <th className="py-2 text-left font-normal">Tipo</th>
                <th className="py-2 text-left font-normal">Local</th>
                <th className="py-2 text-left font-normal">Sistema</th>
                {counting ? (
                  <th className="py-2 text-left font-normal">Contagem</th>
                ) : null}
                {counting ? (
                  <th className="py-2 text-right font-normal">Diferença</th>
                ) : null}
                <th className="py-2 text-right font-normal">Custo un.</th>
                <th className="py-2 text-right font-normal">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const counted = counts[r.id];
                const diff = counted === undefined ? 0 : counted - r.stock;
                return (
                  <tr
                    className="border-border/50 border-b last:border-0"
                    key={r.id}
                  >
                    <td className="py-2">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {r.id} · {r.detail}
                      </p>
                    </td>
                    <td className="py-2">
                      <Badge variant="secondary">{kindLabel[r.kind]}</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {r.location}
                    </td>
                    <td className="py-2">
                      <StockBar min={r.min} par={r.par} stock={r.stock} />
                    </td>
                    {counting ? (
                      <td className="py-2">
                        <Input
                          aria-label={`Contagem de ${r.name}`}
                          className="h-8 w-20"
                          inputMode="numeric"
                          min={0}
                          onChange={(e) =>
                            setCounts((prev) => ({
                              ...prev,
                              [r.id]: Number(e.target.value) || 0,
                            }))
                          }
                          placeholder={String(r.stock)}
                          type="number"
                          value={counted ?? ""}
                        />
                      </td>
                    ) : null}
                    {counting ? (
                      <td
                        className={cn(
                          "py-2 text-right tabular-nums",
                          diff < 0 && "text-destructive",
                          diff > 0 && "text-success"
                        )}
                      >
                        {counted === undefined
                          ? "—"
                          : `${diff > 0 ? "+" : ""}${diff} ${r.unit}`}
                      </td>
                    ) : null}
                    <td className="py-2 text-right tabular-nums">
                      {formatBRLCents(r.unitCost)}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatBRL(r.stock * r.unitCost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          description="Entrada de nota, saída para outro bar, quebra ou ajuste"
          title="Registrar movimentação"
        >
          <form className="flex flex-col gap-3" onSubmit={submitMovement}>
            <div className="flex flex-col gap-1.5">
              <Label>Item</Label>
              <FilterSelect
                className="sm:w-full"
                items={rows.map((r) => ({
                  value: r.id,
                  label: `${r.name} (${r.stock} ${r.unit})`,
                }))}
                onChange={setMovItem}
                value={movItem}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <FilterSelect
                  className="sm:w-full"
                  items={MOVEMENT_TYPES.map((t) => ({
                    value: t,
                    label: t === "Ajuste" ? "Ajuste (define total)" : t,
                  }))}
                  onChange={(v) => setMovType(v as MovementType)}
                  value={movType}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mov-qty">Quantidade</Label>
                <Input
                  id="mov-qty"
                  inputMode="numeric"
                  min={0}
                  name="qty"
                  required
                  type="number"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mov-note">Observação</Label>
              <Input
                id="mov-note"
                name="note"
                placeholder="Ex.: NF 1234 · fornecedor"
              />
            </div>
            <Button type="submit">
              <Icon className="size-4" name="IconCheckCircle2" />
              Registrar
            </Button>
          </form>
        </ChartCard>

        <ChartCard
          description="Últimos lançamentos de estoque"
          title="Movimentações"
        >
          <ul className="flex max-h-[360px] flex-col divide-y overflow-y-auto">
            {movements.map((m) => (
              <li className="flex items-center gap-3 py-2" key={m.id}>
                <Badge variant={movementVariant[m.type]}>{m.type}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{m.itemName}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    {m.date.toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {m.note ? ` · ${m.note}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-medium text-sm tabular-nums",
                    m.qty < 0 && "text-destructive"
                  )}
                >
                  {m.qty > 0 ? "+" : ""}
                  {m.qty}
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard
          description="Repõe até o estoque ideal, agrupado por fornecedor"
          title="Sugestão de compra"
        >
          {reorder.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum item precisa de reposição.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {reorder.map((g) => (
                <div className="flex flex-col gap-1" key={g.supplier}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{g.supplier}</span>
                    <span className="tabular-nums">{formatBRL(g.total)}</span>
                  </div>
                  {g.items.map((i) => (
                    <div
                      className="flex items-center justify-between text-muted-foreground text-xs"
                      key={i.row.id}
                    >
                      <span className="truncate">{i.row.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {i.qty} {i.row.unit}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-3 font-medium text-sm">
                <span>Total do pedido</span>
                <span className="tabular-nums">
                  {formatBRL(reorder.reduce((a, g) => a + g.total, 0))}
                </span>
              </div>
            </div>
          )}
        </ChartCard>
      </section>
    </div>
  );
}
