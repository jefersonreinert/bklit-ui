"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import {
  FilterSelect,
  rowProps,
} from "@/components/pages/beverages/bev-shared";
import { Icon } from "@/lib/icons";
import {
  type IngredientPrices,
  ingredientPrices,
  UNIT_LABEL,
} from "@/lib/invoices/prices";
import { useInvoices } from "@/lib/invoices/store";
import type { Company, Supplier } from "@/lib/invoices/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const ALL = "todas";
const PERIODS = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Último ano" },
  { value: "all", label: "Tudo" },
];

const sinceFor = (period: string) => {
  if (period === "all") {
    return undefined;
  }
  const d = new Date();
  d.setDate(d.getDate() - Number(period));
  return d.toISOString().slice(0, 10);
};

function changeClass(change: number | null) {
  if (change === null || Math.abs(change) < 0.5) {
    return "text-muted-foreground";
  }
  return change > 0 ? "text-destructive" : "text-success";
}

const formatChange = (change: number | null) =>
  change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;

function Detail({
  row,
  suppliers,
  companies,
}: {
  row: IngredientPrices;
  suppliers: Supplier[];
  companies: Company[];
}) {
  const unit = UNIT_LABEL[row.ingredient.baseUnit];
  const money = (v: number) => formatMoney(v, row.currency);
  const byCompany = companies
    .map((c) => ({
      company: c,
      last: row.points.filter((p) => p.companyId === c.id).at(-1),
    }))
    .filter((x) => x.last);
  return (
    <div className="grid gap-4 py-3 md:grid-cols-2">
      <div>
        <p className="mb-1.5 font-medium text-xs">Por fornecedor</p>
        <ul className="flex flex-col gap-1 text-xs">
          {row.bySupplier.map((q, i) => (
            <li className="flex items-center gap-2" key={q.supplierId}>
              {i === 0 ? (
                <Icon className="size-3.5 text-success" name="IconStar" />
              ) : (
                <span className="size-3.5" />
              )}
              <span className="flex-1 truncate">
                {suppliers.find((s) => s.id === q.supplierId)?.name ?? "—"}
              </span>
              <span className="tabular-nums">
                {money(q.latest)}/{unit}
              </span>
              <span className="text-muted-foreground tabular-nums">
                méd. {money(q.avg)} · {q.latestDate}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 font-medium text-xs">Último preço por empresa</p>
        <ul className="flex flex-col gap-1 text-xs">
          {byCompany.map(({ company, last }) => (
            <li className="flex items-center gap-2" key={company.id}>
              <span className="flex-1 truncate">{company.name}</span>
              <span className="tabular-nums">
                {last ? `${money(last.price)}/${unit}` : "—"}
              </span>
              <span className="truncate text-muted-foreground">
                {last?.description}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PriceRow({
  row,
  suppliers,
  companies,
  open,
  onToggle,
}: {
  row: IngredientPrices;
  suppliers: Supplier[];
  companies: Company[];
  open: boolean;
  onToggle: () => void;
}) {
  const unit = UNIT_LABEL[row.ingredient.baseUnit];
  const money = (v: number) => formatMoney(v, row.currency);
  const best = row.best;
  const bestName = suppliers.find((s) => s.id === best?.supplierId)?.name;
  return (
    <>
      <tr {...rowProps(onToggle)}>
        <td className="py-2">
          <p className="font-medium">{row.ingredient.name}</p>
          <p className="text-muted-foreground text-xs">
            {row.bySupplier.length} fornecedor(es) · {row.companies.length}{" "}
            empresa(s)
          </p>
        </td>
        <td className="py-2 text-right tabular-nums">
          {row.latest ? `${money(row.latest.price)}/${unit}` : "—"}
        </td>
        <td
          className={cn(
            "py-2 text-right tabular-nums",
            changeClass(row.change)
          )}
        >
          {formatChange(row.change)}
        </td>
        <td className="py-2 text-right tabular-nums">
          {best ? `${money(best.latest)}/${unit}` : "—"}
          <p className="truncate text-muted-foreground text-xs">{bestName}</p>
        </td>
        <td className="py-2 text-right tabular-nums">{money(row.spend)}</td>
        <td
          className={cn(
            "py-2 text-right tabular-nums",
            row.savings > 0.5 && "font-medium text-warning"
          )}
        >
          {row.savings > 0.5 ? money(row.savings) : "—"}
        </td>
      </tr>
      {open ? (
        <tr className="border-border/50 border-b bg-muted/20">
          <td className="px-2" colSpan={6}>
            <Detail companies={companies} row={row} suppliers={suppliers} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Same ingredient across suppliers and companies, per kg / L / unit. */
export function PricesTab() {
  const data = useInvoices();
  const [company, setCompany] = useState(ALL);
  const [period, setPeriod] = useState("90");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      ingredientPrices(data, {
        companyId: company === ALL ? undefined : company,
        since: sinceFor(period),
      }),
    [data, company, period]
  );
  const currency = rows[0]?.currency ?? "EUR";
  const spend = rows.reduce((n, r) => n + r.spend, 0);
  const savings = rows.reduce((n, r) => n + r.savings, 0);
  const rising = rows.filter((r) => (r.change ?? 0) > 5).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <FilterSelect
          items={[
            { value: ALL, label: "Todas as empresas" },
            ...data.companies.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={setCompany}
          value={company}
        />
        <FilterSelect items={PERIODS} onChange={setPeriod} value={period} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          icon="IconBasket1"
          label="Compras no período"
          value={formatMoney(spend, currency, 0)}
        />
        <MetricTile
          hint="Se tudo fosse comprado no fornecedor mais barato"
          icon="IconCalculator"
          label="Economia possível"
          tone={savings > 0 ? "warn" : "good"}
          value={formatMoney(savings, currency, 0)}
        />
        <MetricTile
          hint="Alta acima de 5% na última compra"
          icon="IconArrowUpRight"
          label="Preços subindo"
          tone={rising ? "bad" : "good"}
          value={String(rising)}
        />
        <MetricTile
          icon="IconChecklist"
          label="Ingredientes comparados"
          value={String(rows.length)}
        />
      </div>
      <ChartCard
        description="Preços sem IVA por kg, litro ou unidade. Toque numa linha para ver fornecedores e empresas."
        title="Comparação de preços"
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aprove notas fiscais para comparar preços.
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="py-2 text-left font-normal">Ingrediente</th>
                  <th className="py-2 text-right font-normal">Último preço</th>
                  <th className="py-2 text-right font-normal">Variação</th>
                  <th className="py-2 text-right font-normal">Melhor oferta</th>
                  <th className="py-2 text-right font-normal">Gasto</th>
                  <th className="py-2 text-right font-normal">Economia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <PriceRow
                    companies={data.companies}
                    key={r.ingredient.id}
                    onToggle={() =>
                      setOpenId(
                        openId === r.ingredient.id ? null : r.ingredient.id
                      )
                    }
                    open={openId === r.ingredient.id}
                    row={r}
                    suppliers={data.suppliers}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
