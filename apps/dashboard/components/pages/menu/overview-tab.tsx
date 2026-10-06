"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  BarXAxis,
  BarYAxis,
  buildArcs,
  ChartTooltip,
  Gauge,
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
  RadarArea,
  RadarAxis,
  RadarChart,
  RadarGrid,
  RadarLabels,
  SunburstBreadcrumb,
  SunburstCenter,
  SunburstChart,
  SunburstHint,
  SunburstLabels,
  SunburstSegment,
  useSunburstBreadcrumbItems,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { curveMonotoneX } from "@visx/curve";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { formatBRL, formatPercent } from "@/lib/format";
import {
  cmvByCategory,
  dailyItems,
  menuSummary,
  revenueByCategory,
  reviewMetrics,
  reviewScores,
  salesByShift,
  salesSunburst,
  topMarginDishes,
} from "@/lib/menu-data";

function SunburstDrill() {
  const { items, zoomTo } = useSunburstBreadcrumbItems();
  return (
    <BreadcrumbList>
      {items.map((item, index) => (
        <span className="contents" key={item.id}>
          {index > 0 ? <BreadcrumbSeparator /> : null}
          <BreadcrumbItem>
            {item.isCurrent ? (
              <BreadcrumbPage>{item.label}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink
                render={
                  <button onClick={() => zoomTo(item.id)} type="button" />
                }
              >
                {item.label}
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
        </span>
      ))}
    </BreadcrumbList>
  );
}

const shiftKeys = [
  { key: "entradas", label: "Entradas", color: "var(--chart-4)" },
  { key: "principais", label: "Principais", color: "var(--chart-1)" },
  { key: "massas", label: "Massas", color: "var(--chart-2)" },
  { key: "sobremesas", label: "Sobremesas", color: "var(--chart-3)" },
  { key: "bebidas", label: "Bebidas", color: "var(--chart-5)" },
] as const;

export function MenuOverviewTab() {
  const { arcs, rootId } = useMemo(() => buildArcs(salesSunburst), []);
  const [focusId, setFocusId] = useState(rootId);
  const [pieHover, setPieHover] = useState<number | null>(null);
  const [radarHover, setRadarHover] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-4 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-3"
          description="Unidades vendidas no mês · clique numa categoria para aprofundar"
          title="Vendas por categoria e prato"
        >
          <div className="flex justify-center overflow-hidden">
            <SunburstChart
              className="mx-auto max-w-full"
              data={salesSunburst}
              focusId={focusId}
              onFocusChange={setFocusId}
              size={380}
            >
              <SunburstBreadcrumb>
                <SunburstDrill />
              </SunburstBreadcrumb>
              {arcs.map((arc) => (
                <SunburstSegment index={arc.arcIndex} key={arc.id} />
              ))}
              <SunburstCenter />
              <SunburstLabels />
              <SunburstHint>
                {({ hoveredArc, focus }) => {
                  if (hoveredArc) {
                    return hoveredArc.trail.join("  ›  ");
                  }
                  return focus.depth === 0
                    ? "Toque numa fatia para aprofundar · passe o mouse para detalhes"
                    : "Toque no centro para voltar";
                }}
              </SunburstHint>
            </SunburstChart>
          </div>
        </ChartCard>

        <ChartCard
          className="xl:col-span-2"
          description="Faturamento do mês por categoria"
          title="Receita por categoria"
        >
          <div className="flex flex-col items-center gap-4">
            <PieChart
              data={revenueByCategory}
              hoveredIndex={pieHover}
              innerRadius={60}
              onHoverChange={setPieHover}
              size={210}
            >
              {revenueByCategory.map((c, i) => (
                <PieSlice index={i} key={c.label} />
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
              items={revenueByCategory.map((c) => ({
                label: c.label,
                value: c.value,
                color: c.color ?? "",
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

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Itens vendidos por dia · 30 dias"
          title="Pratos x bebidas"
        >
          <AreaChart
            aspectRatio="2.4 / 1"
            data={dailyItems}
            margin={{ top: 12, right: 12, bottom: 36, left: 40 }}
          >
            <LinearGradient
              from="var(--chart-1)"
              fromOpacity={0.35}
              id="menu-dishes"
              to="var(--chart-1)"
              toOpacity={0}
            />
            <LinearGradient
              from="var(--chart-4)"
              fromOpacity={0.3}
              id="menu-drinks"
              to="var(--chart-4)"
              toOpacity={0}
            />
            <Grid horizontal />
            <Area
              curve={curveMonotoneX}
              dataKey="bebidas"
              fill="url(#menu-drinks)"
              fillOpacity={1}
              stroke="var(--chart-4)"
              strokeWidth={2}
            />
            <Area
              curve={curveMonotoneX}
              dataKey="pratos"
              fill="url(#menu-dishes)"
              fillOpacity={1}
              stroke="var(--chart-1)"
              strokeWidth={2}
            />
            <YAxis />
            <XAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Pratos",
                  value: Number(p.pratos),
                },
                {
                  color: "var(--chart-4)",
                  label: "Bebidas",
                  value: Number(p.bebidas),
                },
              ]}
            />
          </AreaChart>
        </ChartCard>

        <ChartCard
          description="Custo ponderado pelas vendas · meta 30%"
          title="CMV do cardápio"
        >
          <div className="flex flex-col items-center gap-3">
            <Gauge
              centerValue={Math.round(menuSummary.weightedCmv * 10) / 10}
              className="mx-auto"
              defaultLabel="custo ÷ preço"
              formatOptions={{ maximumFractionDigits: 1 }}
              height={160}
              inactiveFillOpacity={0.3}
              suffix="%"
              value={(menuSummary.weightedCmv / 50) * 100}
              width={270}
            />
            <BarChart
              aspectRatio="2 / 1"
              data={cmvByCategory}
              xDataKey="categoria"
            >
              <Grid horizontal />
              <Bar dataKey="cmv" fill="var(--chart-1)" lineCap={4} />
              <BarXAxis />
              <ChartTooltip
                rows={(p) => [
                  {
                    color: "var(--chart-1)",
                    label: "CMV",
                    value: formatPercent(Number(p.cmv)),
                  },
                ]}
                showCrosshair={false}
              />
            </BarChart>
          </div>
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          description="Média diária de itens por turno"
          title="Vendas por turno"
        >
          <BarChart
            aspectRatio="4 / 3"
            data={salesByShift}
            stacked
            stackGap={2}
            xDataKey="turno"
          >
            <Grid horizontal />
            {shiftKeys.map((k) => (
              <Bar
                dataKey={k.key}
                fill={k.color}
                key={k.key}
                lineCap={3}
                stackGap={2}
              />
            ))}
            <BarXAxis />
            <ChartTooltip
              rows={(p) =>
                shiftKeys.map((k) => ({
                  color: k.color,
                  label: k.label,
                  value: Number(p[k.key]),
                }))
              }
            />
          </BarChart>
          <Legend
            className="mt-2 flex-row flex-wrap justify-center gap-x-4 gap-y-1"
            items={shiftKeys.map((k) => ({
              label: k.label,
              value: 0,
              color: k.color,
            }))}
          >
            <LegendItemComponent className="flex items-center gap-1.5">
              <LegendMarker />
              <LegendLabel className="text-xs" />
            </LegendItemComponent>
          </Legend>
        </ChartCard>

        <ChartCard
          description="Preço − custo da ficha técnica (R$)"
          title="Maior margem por prato"
        >
          <BarChart
            aspectRatio="4 / 3"
            data={topMarginDishes}
            margin={{ left: 84 }}
            orientation="horizontal"
            xDataKey="prato"
          >
            <LinearGradient
              from="var(--chart-1)"
              id="menu-margin"
              to="var(--chart-3)"
              vertical={false}
            />
            <Grid fadeVertical horizontal={false} vertical />
            <Bar dataKey="margem" fill="url(#menu-margin)" lineCap={4} />
            <BarYAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Margem",
                  value: formatBRL(Number(p.margem)),
                },
              ]}
              showCrosshair={false}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2 xl:col-span-1"
          description={`Notas dos clientes (0–100) · ${menuSummary.totalReviews} avaliações`}
          title="Avaliações por critério"
        >
          <div className="flex flex-col items-center gap-3">
            <RadarChart
              data={reviewScores}
              hoveredIndex={radarHover}
              metrics={reviewMetrics}
              onHoverChange={setRadarHover}
              size={260}
            >
              <RadarGrid showLabels={false} />
              <RadarAxis />
              <RadarLabels fontSize={11} interactive />
              {reviewScores.map((r, i) => (
                <RadarArea index={i} key={r.label} />
              ))}
            </RadarChart>
            <Legend
              className="flex-row flex-wrap justify-center gap-x-4 gap-y-1"
              hoveredIndex={radarHover}
              items={reviewScores.map((r) => ({
                label: r.label,
                value: 0,
                color: r.color ?? "",
              }))}
              onHoverChange={setRadarHover}
            >
              <LegendItemComponent className="flex items-center gap-1.5">
                <LegendMarker />
                <LegendLabel className="text-xs" />
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}
