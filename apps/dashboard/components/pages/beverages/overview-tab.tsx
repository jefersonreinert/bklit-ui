"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  BarXAxis,
  BarYAxis,
  ChartTooltip,
  Grid,
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendProgress,
  LegendValue,
  LinearGradient,
  PieCenter,
  PieChart,
  type PieData,
  PieSlice,
  Ring,
  RingCenter,
  RingChart,
  type RingData,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { curveMonotoneX } from "@visx/curve";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import {
  type BeverageKind,
  cmvTargets,
  dailyBeverageRevenue,
  type InventoryRow,
  kindLabel,
  type MenuLine,
} from "@/lib/beverage-data";
import { palette } from "@/lib/data";
import { formatBRL, formatCompact, formatPercent } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { CmvValue } from "./bev-shared";

const KINDS: BeverageKind[] = [
  "vinho",
  "coquetel",
  "cerveja",
  "destilado",
  "sem-alcool",
];
const kindColor: Record<BeverageKind, string> = {
  vinho: palette.brasa,
  coquetel: palette.teal,
  cerveja: palette.amber,
  destilado: palette.violet,
  "sem-alcool": palette.green,
};

const areaSeries = [
  { key: "vinhos", label: "Vinhos", color: "var(--chart-1)" },
  { key: "coqueteis", label: "Coquetéis", color: "var(--chart-2)" },
  { key: "cervejas", label: "Cervejas", color: "var(--chart-3)" },
  { key: "destilados", label: "Destilados", color: "var(--chart-4)" },
] as const;

export function BeverageOverviewTab({
  lines,
  inventory,
}: {
  lines: MenuLine[];
  inventory: InventoryRow[];
}) {
  const [pieHover, setPieHover] = useState<number | null>(null);
  const [ringHover, setRingHover] = useState<number | null>(null);

  const revenueByKind: PieData[] = useMemo(
    () =>
      KINDS.map((k) => ({
        label: kindLabel[k],
        value: Math.round(
          lines.filter((l) => l.kind === k).reduce((a, l) => a + l.revenue, 0)
        ),
        color: kindColor[k],
      })),
    [lines]
  );

  const cmvByKind = useMemo(
    () =>
      KINDS.map((k) => {
        const items = lines.filter((l) => l.kind === k);
        const revenue = items.reduce((a, l) => a + l.revenue, 0);
        const profit = items.reduce((a, l) => a + l.profit, 0);
        return {
          tipo: kindLabel[k].replace("Sem álcool", "S/ álcool"),
          real:
            revenue === 0
              ? 0
              : Math.round(((revenue - profit) / revenue) * 1000) / 10,
          meta: cmvTargets[k],
        };
      }),
    [lines]
  );

  const topProfit = useMemo(
    () =>
      [...lines]
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 8)
        .map((l) => ({
          item: l.name.split(" ").slice(0, 2).join(" "),
          lucro: Math.round(l.profit),
        })),
    [lines]
  );

  const stockTotal = inventory.reduce((a, r) => a + r.stock * r.unitCost, 0);
  const stockRing: RingData[] = (
    ["vinho", "destilado", "cerveja", "sem-alcool"] as BeverageKind[]
  ).map((k) => ({
    label: kindLabel[k],
    value: Math.round(
      inventory
        .filter((r) => r.kind === k)
        .reduce((a, r) => a + r.stock * r.unitCost, 0)
    ),
    maxValue: Math.round(stockTotal),
    color: kindColor[k],
  }));

  const overTarget = lines
    .filter((l) => l.cmv > cmvTargets[l.kind])
    .sort((a, b) => b.cmv - cmvTargets[b.kind] - (a.cmv - cmvTargets[a.kind]))
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Faturamento diário por tipo · 30 dias"
          title="Receita de bebidas"
        >
          <AreaChart
            aspectRatio="2.4 / 1"
            data={dailyBeverageRevenue}
            margin={{ top: 12, right: 12, bottom: 36, left: 44 }}
          >
            {areaSeries.map((s) => (
              <LinearGradient
                from={s.color}
                fromOpacity={0.28}
                id={`bev-${s.key}`}
                key={s.key}
                to={s.color}
                toOpacity={0}
              />
            ))}
            <Grid horizontal />
            {areaSeries.map((s) => (
              <Area
                curve={curveMonotoneX}
                dataKey={s.key}
                fill={`url(#bev-${s.key})`}
                fillOpacity={1}
                key={s.key}
                stroke={s.color}
                strokeWidth={2}
              />
            ))}
            <YAxis formatValue={(v) => `${formatCompact(v / 1000)}k`} />
            <XAxis />
            <ChartTooltip
              rows={(p) =>
                areaSeries.map((s) => ({
                  color: s.color,
                  label: s.label,
                  value: formatBRL(Number(p[s.key])),
                }))
              }
            />
          </AreaChart>
          <Legend
            className="mt-2 flex-row flex-wrap justify-center gap-x-5 gap-y-1"
            items={areaSeries.map((s) => ({
              label: s.label,
              value: 0,
              color: s.color,
            }))}
          >
            <LegendItemComponent className="flex items-center gap-1.5">
              <LegendMarker />
              <LegendLabel className="text-xs" />
            </LegendItemComponent>
          </Legend>
        </ChartCard>

        <ChartCard description="Faturamento do mês" title="Mix de receita">
          <div className="flex flex-col items-center gap-4">
            <PieChart
              data={revenueByKind}
              hoveredIndex={pieHover}
              innerRadius={58}
              onHoverChange={setPieHover}
              size={200}
            >
              {revenueByKind.map((r, i) => (
                <PieSlice index={i} key={r.label} />
              ))}
              <PieCenter
                defaultLabel="Receita"
                formatOptions={{ notation: "compact" }}
                prefix="R$ "
              />
            </PieChart>
            <Legend
              className="w-full"
              hoveredIndex={pieHover}
              items={revenueByKind.map((r) => ({
                label: r.label,
                value: r.value,
                color: r.color ?? "",
              }))}
              onHoverChange={setPieHover}
            >
              <LegendItemComponent className="flex items-center gap-3">
                <LegendMarker />
                <LegendLabel className="flex-1 text-sm" />
                <LegendValue
                  className="text-sm"
                  formatValue={formatBRL}
                  showPercentage
                />
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          description="CMV ponderado real x meta de mercado (%)"
          title="CMV por tipo"
        >
          <BarChart
            aspectRatio="4 / 3"
            barGap={0.25}
            data={cmvByKind}
            xDataKey="tipo"
          >
            <Grid horizontal />
            <Bar dataKey="real" fill="var(--chart-1)" lineCap={4} />
            <Bar dataKey="meta" fill="var(--chart-4)" lineCap={4} />
            <BarXAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Real",
                  value: formatPercent(Number(p.real)),
                },
                {
                  color: "var(--chart-4)",
                  label: "Meta",
                  value: formatPercent(Number(p.meta), 0),
                },
              ]}
              showCrosshair={false}
            />
          </BarChart>
          <Legend
            className="mt-2 flex-row justify-center gap-5"
            items={[
              { label: "Real", value: 0, color: "var(--chart-1)" },
              { label: "Meta", value: 0, color: "var(--chart-4)" },
            ]}
          >
            <LegendItemComponent className="flex items-center gap-1.5">
              <LegendMarker />
              <LegendLabel className="text-xs" />
            </LegendItemComponent>
          </Legend>
        </ChartCard>

        <ChartCard
          description="Lucro bruto no mês (R$)"
          title="Itens mais lucrativos"
        >
          <BarChart
            aspectRatio="4 / 3"
            data={topProfit}
            margin={{ left: 84 }}
            orientation="horizontal"
            xDataKey="item"
          >
            <LinearGradient
              from="var(--chart-1)"
              id="bev-profit"
              to="var(--chart-3)"
              vertical={false}
            />
            <Grid fadeVertical horizontal={false} vertical />
            <Bar dataKey="lucro" fill="url(#bev-profit)" lineCap={4} />
            <BarYAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Lucro",
                  value: formatBRL(Number(p.lucro)),
                },
              ]}
              showCrosshair={false}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2 xl:col-span-1"
          description="Capital parado por tipo (custo)"
          title="Valor em estoque"
        >
          <div className="flex flex-col items-center gap-4">
            <RingChart
              data={stockRing}
              hoveredIndex={ringHover}
              onHoverChange={setRingHover}
              ringGap={6}
              size={200}
              strokeWidth={12}
            >
              {stockRing.map((r, i) => (
                <Ring index={i} key={r.label} />
              ))}
              <RingCenter
                defaultLabel="Estoque"
                formatOptions={{ notation: "compact" }}
                prefix="R$ "
              />
            </RingChart>
            <Legend
              className="w-full"
              hoveredIndex={ringHover}
              items={stockRing.map((r) => ({
                label: r.label,
                value: r.value,
                maxValue: r.maxValue,
                color: r.color ?? "",
              }))}
              onHoverChange={setRingHover}
            >
              <LegendItemComponent className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1">
                <LegendMarker />
                <LegendLabel className="text-sm" />
                <LegendValue
                  className="text-sm"
                  formatValue={formatBRL}
                  showPercentage
                />
                <div className="col-span-full">
                  <LegendProgress />
                </div>
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>
      </section>

      <ChartCard
        description="Itens com CMV acima da meta da categoria e o preço que corrigiria"
        title="Atenção à margem"
      >
        {overTarget.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todos os itens estão dentro da meta. 🎉
          </p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {overTarget.map((l) => (
              <li
                className="flex items-center gap-3 border-border/50 border-b py-2.5"
                key={l.id}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4" name="IconWarningSign" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{l.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {kindLabel[l.kind]} · meta {cmvTargets[l.kind]}% · hoje{" "}
                    <CmvValue kind={l.kind} value={l.cmv} />
                  </p>
                </div>
                <Badge variant="outline">
                  {formatBRL(Math.ceil(l.cost / (cmvTargets[l.kind] / 100)))}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}
