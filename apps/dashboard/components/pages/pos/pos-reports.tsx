"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  BarXAxis,
  ChartTooltip,
  Grid,
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendValue,
  LinearGradient,
  PieCenter,
  PieChart,
  PieSlice,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { curveMonotoneX } from "@visx/curve";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Icon, type IconName } from "@/lib/icons";
import {
  byCategory,
  byHour,
  byMethod,
  periodFor,
  productStats,
  series,
  summary,
} from "@/lib/pos/analytics";
import { isLowStock, money, usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";

type PeriodId = "today" | "7d" | "30d" | "month";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "month", label: "Este mês" },
];

const SLICE_COLORS = [
  "#c96442",
  "#d4a27f",
  "#5c3d2e",
  "#3d7a5f",
  "#4a6fa5",
  "#8e5ea2",
  "#8a7560",
  "#b03a2e",
];

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: IconName;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon className="size-3.5" name={icon} />
        {label}
      </span>
      <span className="font-semibold text-xl tabular-nums">{value}</span>
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </div>
  );
}

function Donut({
  title,
  data,
  currency,
}: {
  title: string;
  data: { label: string; value: number }[];
  currency: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const slices = data.slice(0, 8).map((d, i) => ({
    ...d,
    id: d.label,
    color: SLICE_COLORS[i % SLICE_COLORS.length] ?? "#c96442",
  }));
  return (
    <ChartCard title={title}>
      {slices.length ? (
        <div className="flex flex-col items-center gap-4">
          <PieChart
            data={slices}
            hoveredIndex={hover}
            innerRadius={58}
            onHoverChange={setHover}
            size={200}
          >
            {slices.map((s, i) => (
              <PieSlice index={i} key={s.id} />
            ))}
            <PieCenter
              defaultLabel="Total"
              formatOptions={{
                style: "currency",
                currency,
                notation: "compact",
                maximumFractionDigits: 1,
              }}
            />
          </PieChart>
          <Legend
            className="w-full"
            hoveredIndex={hover}
            items={slices}
            onHoverChange={setHover}
          >
            <LegendItemComponent className="flex items-center gap-3">
              <LegendMarker />
              <LegendLabel className="flex-1 text-sm" />
              <LegendValue
                className="text-sm"
                formatValue={(v) => money(v, currency)}
                showPercentage
              />
            </LegendItemComponent>
          </Legend>
        </div>
      ) : (
        <Empty />
      )}
    </ChartCard>
  );
}

function Empty() {
  return (
    <p className="py-10 text-center text-muted-foreground text-sm">
      Sem vendas no período.
    </p>
  );
}

export function ReportsView() {
  const data = usePos();
  const [periodId, setPeriodId] = useState<PeriodId>("7d");
  const cur = data.settings.currency;
  const r = useMemo(() => {
    const p = periodFor(periodId);
    const stats = productStats(data, p);
    return {
      sum: summary(data, p),
      series: series(data, p),
      stats,
      categories: byCategory(stats),
      methods: byMethod(data, p),
      hours: byHour(data, p),
    };
  }, [data, periodId]);
  const low = data.products.filter(isLowStock);
  const hourly = periodId === "today";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 pb-8">
      <div className="flex gap-1 self-start rounded-full bg-muted p-1">
        {PERIODS.map((p) => (
          <button
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm",
              periodId === p.id
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            )}
            key={p.id}
            onClick={() => setPeriodId(p.id)}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi
          hint={`${r.sum.orders} pedidos`}
          icon="IconCoins"
          label="Faturamento"
          value={money(r.sum.sales, cur)}
        />
        <Kpi
          hint={`Margem ${Math.round(r.sum.margin)}%`}
          icon="IconTrending1"
          label="Lucro bruto"
          value={money(r.sum.profit, cur)}
        />
        <Kpi
          hint={`${r.sum.items} itens vendidos`}
          icon="IconReceiptBill"
          label="Ticket médio"
          value={money(r.sum.ticket, cur)}
        />
        <Kpi
          hint={`Gorjetas ${money(r.sum.tips, cur)}`}
          icon="IconBox2"
          label="Custo das vendas"
          value={money(r.sum.cost, cur)}
        />
      </div>

      <ChartCard
        description={hourly ? "Por hora" : "Por dia"}
        title="Vendas e lucro"
      >
        {r.sum.orders ? (
          <AreaChart
            aspectRatio="2.4 / 1"
            data={r.series}
            margin={{ top: 12, right: 12, bottom: 36, left: 56 }}
          >
            <LinearGradient
              from="#c96442"
              fromOpacity={0.35}
              id="pos-sales"
              to="#c96442"
              toOpacity={0}
            />
            <LinearGradient
              from="#3d7a5f"
              fromOpacity={0.3}
              id="pos-profit"
              to="#3d7a5f"
              toOpacity={0}
            />
            <Grid horizontal />
            <Area
              curve={curveMonotoneX}
              dataKey="sales"
              fill="url(#pos-sales)"
              fillOpacity={1}
              stroke="#c96442"
              strokeWidth={2}
            />
            <Area
              curve={curveMonotoneX}
              dataKey="profit"
              fill="url(#pos-profit)"
              fillOpacity={1}
              stroke="#3d7a5f"
              strokeWidth={2}
            />
            <YAxis formatValue={(v) => money(v, cur)} />
            <XAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "#c96442",
                  label: "Vendas",
                  value: money(Number(p.sales), cur),
                },
                {
                  color: "#3d7a5f",
                  label: "Lucro",
                  value: money(Number(p.profit), cur),
                },
              ]}
            />
          </AreaChart>
        ) : (
          <Empty />
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Donut
          currency={cur}
          data={r.categories}
          title="Vendas por categoria"
        />
        <Donut currency={cur} data={r.methods} title="Formas de pagamento" />
      </div>

      {r.hours.length > 1 ? (
        <ChartCard
          description="Quando o movimento é maior"
          title="Vendas por horário"
        >
          <BarChart
            aspectRatio="2.8 / 1"
            barGap={0.3}
            data={r.hours}
            margin={{ left: 56 }}
            xDataKey="hour"
          >
            <Grid horizontal />
            <Bar dataKey="sales" fill="#c96442" lineCap={4} />
            <YAxis formatValue={(v) => money(v, cur)} />
            <BarXAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "#c96442",
                  label: "Vendas",
                  value: money(Number(p.sales), cur),
                },
              ]}
              showCrosshair={false}
            />
          </BarChart>
        </ChartCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <ChartCard title="Produtos mais vendidos">
          {r.stats.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr className="text-left">
                    <th className="py-2 font-normal">Produto</th>
                    <th className="py-2 text-right font-normal">Qtd.</th>
                    <th className="py-2 text-right font-normal">Faturou</th>
                    <th className="py-2 text-right font-normal">Lucro</th>
                    <th className="py-2 text-right font-normal">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {r.stats.slice(0, 15).map((s) => (
                    <tr key={s.id}>
                      <td className="max-w-48 truncate py-2">{s.name}</td>
                      <td className="py-2 text-right tabular-nums">
                        {Math.round(s.qty * 100) / 100}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {money(s.revenue, cur)}
                      </td>
                      <td className="py-2 text-right text-[#3d7a5f] tabular-nums">
                        {money(s.profit, cur)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {s.revenue
                          ? `${Math.round((s.profit / s.revenue) * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
        </ChartCard>
        <ChartCard title="Repor estoque">
          {low.length ? (
            <ul className="divide-y text-sm">
              {low.map((p) => (
                <li className="flex justify-between py-2" key={p.id}>
                  <span className="truncate">{p.name}</span>
                  <span className="text-destructive tabular-nums">
                    {Math.round((p.stock ?? 0) * 100) / 100} {p.unit || "un"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-muted-foreground text-sm">
              Nada abaixo do mínimo.
            </p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
