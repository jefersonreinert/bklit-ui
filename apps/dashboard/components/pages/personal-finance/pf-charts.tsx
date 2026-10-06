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
  LegendValue,
  LinearGradient,
  PieCenter,
  PieChart,
  PieSlice,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { curveMonotoneX, curveStepAfter } from "@visx/curve";
import { useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import type {
  balanceSeries,
  byCategory,
  byWeekday,
  monthly,
  topMerchants,
} from "@/lib/personal-finance/analytics";
import { money, moneyAxis } from "@/lib/personal-finance/format";

function SeriesLegend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <Legend
      className="mt-2 flex-row justify-center gap-6"
      items={items.map((i) => ({ ...i, value: 0 }))}
    >
      <LegendItemComponent className="flex items-center gap-2">
        <LegendMarker />
        <LegendLabel className="text-xs" />
      </LegendItemComponent>
    </Legend>
  );
}

export function MonthlyChart({
  data,
  currency,
}: {
  data: ReturnType<typeof monthly>;
  currency: string;
}) {
  return (
    <ChartCard
      className="xl:col-span-2"
      description="Dinheiro que entrou x que saiu, sem contar cofrinhos"
      title="Entradas x saídas por mês"
    >
      <BarChart
        aspectRatio="2.2 / 1"
        barGap={0.25}
        data={data}
        margin={{ left: 56 }}
        xDataKey="month"
      >
        <Grid horizontal />
        <Bar dataKey="entradas" fill="var(--pf-in)" lineCap={4} />
        <Bar dataKey="saidas" fill="var(--pf-out)" lineCap={4} />
        <YAxis formatValue={(v) => moneyAxis(v, currency)} />
        <BarXAxis />
        <ChartTooltip
          rows={(p) => [
            {
              color: "var(--pf-in)",
              label: "Entradas",
              value: money(Number(p.entradas), currency),
            },
            {
              color: "var(--pf-out)",
              label: "Saídas",
              value: money(Number(p.saidas), currency),
            },
            {
              color: "var(--pf-in)",
              label: "Resultado",
              value: money(Number(p.entradas) - Number(p.saidas), currency),
            },
          ]}
          showCrosshair={false}
        />
      </BarChart>
      <SeriesLegend
        items={[
          { label: "Entradas", color: "var(--pf-in)" },
          { label: "Saídas", color: "var(--pf-out)" },
        ]}
      />
    </ChartCard>
  );
}

export function CategoryChart({
  data,
  currency,
}: {
  data: ReturnType<typeof byCategory>;
  currency: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const slices = data.slice(0, 8);
  return (
    <ChartCard description="Saídas no período" title="Gastos por categoria">
      <div className="flex flex-col items-center gap-4">
        <PieChart
          data={slices}
          hoveredIndex={hover}
          innerRadius={62}
          onHoverChange={setHover}
          size={220}
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
          items={slices.map((s) => ({
            label: s.label,
            value: s.value,
            color: s.color,
          }))}
          onHoverChange={setHover}
        >
          <LegendItemComponent className="flex items-center gap-3">
            <LegendMarker />
            <LegendLabel className="flex-1 text-sm" />
            <LegendValue
              className="text-sm"
              formatValue={(v) => money(v, currency, 0)}
              showPercentage
            />
          </LegendItemComponent>
        </Legend>
      </div>
    </ChartCard>
  );
}

export function BalanceChart({
  data,
  currency,
}: {
  data: ReturnType<typeof balanceSeries>;
  currency: string;
}) {
  const hasPockets = data.some((d) => d.cofrinhos !== 0);
  return (
    <ChartCard
      className="xl:col-span-2"
      description="Saldo no fim de cada dia"
      title="Evolução do saldo"
    >
      <AreaChart
        aspectRatio="2.2 / 1"
        data={data}
        margin={{ top: 12, right: 12, bottom: 36, left: 56 }}
      >
        <LinearGradient
          from="var(--pf-in)"
          fromOpacity={0.35}
          id="pf-balance"
          to="var(--pf-in)"
          toOpacity={0}
        />
        <LinearGradient
          from="var(--pf-alt)"
          fromOpacity={0.3}
          id="pf-pockets"
          to="var(--pf-alt)"
          toOpacity={0}
        />
        <Grid horizontal />
        <Area
          curve={curveStepAfter}
          dataKey="conta"
          fill="url(#pf-balance)"
          fillOpacity={1}
          stroke="var(--pf-in)"
          strokeWidth={2}
        />
        {hasPockets ? (
          <Area
            curve={curveMonotoneX}
            dashArray="4 4"
            dataKey="cofrinhos"
            fill="url(#pf-pockets)"
            fillOpacity={1}
            stroke="var(--pf-alt)"
            strokeWidth={2}
          />
        ) : null}
        <YAxis formatValue={(v) => moneyAxis(v, currency)} />
        <XAxis />
        <ChartTooltip
          rows={(p) => [
            {
              color: "var(--pf-in)",
              label: "Conta",
              value: money(Number(p.conta), currency),
            },
            ...(hasPockets
              ? [
                  {
                    color: "var(--pf-alt)",
                    label: "Cofrinhos",
                    value: money(Number(p.cofrinhos), currency),
                  },
                ]
              : []),
          ]}
        />
      </AreaChart>
      <SeriesLegend
        items={[
          { label: "Conta", color: "var(--pf-in)" },
          ...(hasPockets
            ? [{ label: "Cofrinhos", color: "var(--pf-alt)" }]
            : []),
        ]}
      />
    </ChartCard>
  );
}

export function MerchantsChart({
  data,
  currency,
}: {
  data: ReturnType<typeof topMerchants>;
  currency: string;
}) {
  return (
    <ChartCard
      description="Maiores destinos do dinheiro"
      title="Onde mais gasto"
    >
      <BarChart
        aspectRatio="4 / 3"
        data={data}
        margin={{ left: 168 }}
        orientation="horizontal"
        xDataKey="label"
      >
        <LinearGradient
          from="var(--pf-out)"
          id="pf-merchants"
          to="var(--pf-alt)"
          vertical={false}
        />
        <Grid fadeVertical horizontal={false} vertical />
        <Bar dataKey="value" fill="url(#pf-merchants)" lineCap={4} />
        <BarYAxis />
        <ChartTooltip
          rows={(p) => [
            {
              color: "var(--pf-out)",
              label: `${p.count} pagamentos`,
              value: money(Number(p.value), currency),
            },
          ]}
          showCrosshair={false}
        />
      </BarChart>
    </ChartCard>
  );
}

export function WeekdayChart({
  data,
  currency,
}: {
  data: ReturnType<typeof byWeekday>;
  currency: string;
}) {
  return (
    <ChartCard
      description="Média de gastos por semana"
      title="Gastos por dia da semana"
    >
      <BarChart aspectRatio="4 / 3" data={data} xDataKey="dia">
        <Grid horizontal />
        <Bar dataKey="valor" fill="var(--pf-out)" lineCap={4} />
        <BarXAxis />
        <ChartTooltip
          rows={(p) => [
            {
              color: "var(--pf-out)",
              label: "Média",
              value: money(Number(p.valor), currency),
            },
          ]}
          showCrosshair={false}
        />
      </BarChart>
    </ChartCard>
  );
}
