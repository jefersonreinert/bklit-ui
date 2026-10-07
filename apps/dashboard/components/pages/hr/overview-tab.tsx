"use client";

import { Icon } from "@/lib/icons";
import {
  Bar,
  BarChart,
  BarXAxis,
  ChartTooltip,
  ComposedChart,
  Grid,
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendValue,
  Line,
  PieCenter,
  PieChart,
  PieSlice,
  SeriesBar,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate, formatPercent } from "@/lib/format";
import {
  headcountSeries,
  hrSummary,
  overtimeBySector,
  payrollComposition,
  teamBySector,
  turnoverReasons,
  upcomingEvents,
} from "@/lib/hr-data";
import { SectionTitle } from "./hr-shared";

const eventIcon = {
  Experiência: "IconCalendarCheck",
  Férias: "IconSun",
  Aniversário: "IconGiftBox",
  Saúde: "IconShieldCheck",
  Avaliação: "IconChecklist",
} as const;

function DonutWithLegend({
  data,
  label,
  money = false,
}: {
  data: { label: string; value: number; color?: string }[];
  label: string;
  money?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex flex-col items-center gap-4">
      <PieChart
        data={data}
        hoveredIndex={hover}
        innerRadius={58}
        onHoverChange={setHover}
        size={200}
      >
        {data.map((d, i) => (
          <PieSlice index={i} key={d.label} />
        ))}
        <PieCenter
          defaultLabel={label}
          formatOptions={money ? { notation: "compact" } : undefined}
          prefix={money ? "R$ " : undefined}
        />
      </PieChart>
      <Legend
        className="w-full"
        hoveredIndex={hover}
        items={data.map((d) => ({
          label: d.label,
          value: d.value,
          color: d.color ?? "",
        }))}
        onHoverChange={setHover}
      >
        <LegendItemComponent className="flex items-center gap-3">
          <LegendMarker />
          <LegendLabel className="flex-1 text-sm" />
          <LegendValue
            className="text-sm"
            formatValue={money ? formatBRL : undefined}
            showPercentage
          />
        </LegendItemComponent>
      </Legend>
    </div>
  );
}

export function HrOverviewTab() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile
          hint="Folha total ÷ colaboradores"
          icon="IconMoneyHand"
          label="Custo per capita"
          tone="neutral"
          value={formatBRL(hrSummary.payrollPerCapita)}
        />
        <MetricTile
          hint="Sem encargos e benefícios"
          icon="IconCoins"
          label="Salário médio"
          tone="neutral"
          value={formatBRL(hrSummary.avgSalary)}
        />
        <MetricTile
          hint="Ideal para restaurantes: 25–35%"
          icon="IconPieChart2"
          label="Folha ÷ receita"
          tone={hrSummary.payrollOverRevenue <= 35 ? "good" : "warn"}
          value={formatPercent(hrSummary.payrollOverRevenue)}
        />
        <MetricTile
          hint="Média da equipe atual"
          icon="IconCalendarClock"
          label="Tempo médio de casa"
          tone="good"
          value={`${hrSummary.avgTenureYears.toFixed(1).replace(".", ",")} anos`}
        />
        <MetricTile
          hint={`Custo ${formatBRL(hrSummary.overtimeCost)} no mês`}
          icon="IconClock"
          label="Horas extras"
          tone={hrSummary.overtimeHours > 180 ? "warn" : "good"}
          value={`${hrSummary.overtimeHours} h`}
        />
        <MetricTile
          hint="Nota média da última avaliação"
          icon="IconStar"
          label="Desempenho médio"
          tone={hrSummary.avgPerformance >= 80 ? "good" : "warn"}
          value={hrSummary.avgPerformance.toFixed(0)}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Admissões e desligamentos (barras) e quadro total (linha) · 12 meses"
          title="Evolução do quadro"
        >
          <ComposedChart
            aspectRatio="2.2 / 1"
            barGap={0.25}
            data={headcountSeries}
            margin={{ top: 12, right: 40, bottom: 36, left: 36 }}
            maxBarSize={18}
          >
            <Grid horizontal />
            <SeriesBar dataKey="admissoes" fill="var(--chart-3)" radius={3} />
            <SeriesBar
              dataKey="desligamentos"
              fill="var(--chart-5)"
              radius={3}
            />
            <Line
              dataKey="headcount"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              yAxisId="right"
            />
            <YAxis yAxisId="left" />
            <YAxis orientation="right" yAxisId="right" />
            <XAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Quadro",
                  value: Number(p.headcount),
                },
                {
                  color: "var(--chart-3)",
                  label: "Admissões",
                  value: Number(p.admissoes),
                },
                {
                  color: "var(--chart-5)",
                  label: "Desligamentos",
                  value: Number(p.desligamentos),
                },
              ]}
              showCrosshair={false}
            />
          </ComposedChart>
          <Legend
            className="mt-2 flex-row flex-wrap justify-center gap-x-6 gap-y-1"
            items={[
              { label: "Quadro", value: 0, color: "var(--chart-1)" },
              { label: "Admissões", value: 0, color: "var(--chart-3)" },
              { label: "Desligamentos", value: 0, color: "var(--chart-5)" },
            ]}
          >
            <LegendItemComponent className="flex items-center gap-2">
              <LegendMarker />
              <LegendLabel className="text-xs" />
            </LegendItemComponent>
          </Legend>
        </ChartCard>

        <ChartCard
          description="Colaboradores por setor"
          title="Distribuição da equipe"
        >
          <DonutWithLegend data={teamBySector} label="Pessoas" />
        </ChartCard>
      </section>

      <SectionTitle
        description="Quanto custa a equipe e onde estão as horas extras."
        title="Custos com pessoal"
      />
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          description="Custo mensal total da folha"
          title="Composição da folha"
        >
          <DonutWithLegend data={payrollComposition} label="Folha" money />
        </ChartCard>

        <ChartCard description="Horas por setor · 6 meses" title="Horas extras">
          <BarChart
            aspectRatio="4 / 3"
            data={overtimeBySector}
            stacked
            stackGap={2}
            xDataKey="month"
          >
            <Grid horizontal />
            <Bar
              dataKey="cozinha"
              fill="var(--chart-1)"
              lineCap={3}
              stackGap={2}
            />
            <Bar
              dataKey="salao"
              fill="var(--chart-2)"
              lineCap={3}
              stackGap={2}
            />
            <Bar dataKey="bar" fill="var(--chart-3)" lineCap={3} stackGap={2} />
            <Bar
              dataKey="delivery"
              fill="var(--chart-4)"
              lineCap={3}
              stackGap={2}
            />
            <BarXAxis />
            <ChartTooltip
              rows={(p) => [
                {
                  color: "var(--chart-1)",
                  label: "Cozinha",
                  value: `${p.cozinha} h`,
                },
                {
                  color: "var(--chart-2)",
                  label: "Salão",
                  value: `${p.salao} h`,
                },
                { color: "var(--chart-3)", label: "Bar", value: `${p.bar} h` },
                {
                  color: "var(--chart-4)",
                  label: "Delivery",
                  value: `${p.delivery} h`,
                },
              ]}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2 xl:col-span-1"
          description={`Turnover ${formatPercent(hrSummary.turnover)} ao mês · 12 meses`}
          title="Motivos de desligamento"
        >
          <DonutWithLegend data={turnoverReasons} label="Saídas" />
        </ChartCard>
      </section>

      <ChartCard description="Próximos 30 dias" title="Agenda do RH">
        <ul className="grid gap-x-6 divide-y sm:grid-cols-2 sm:divide-y-0">
          {upcomingEvents.map((e) => (
            <li
              className="flex items-center gap-3 border-border/60 py-2.5 sm:border-b"
              key={`${e.title}-${e.who}`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-4" name={eventIcon[e.kind]} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{e.title}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {e.who}
                </p>
              </div>
              <Badge variant="outline">{formatDate(e.date).slice(0, 5)}</Badge>
            </li>
          ))}
        </ul>
      </ChartCard>
    </div>
  );
}
