"use client";

import {
  Bar,
  BarChart,
  BarYAxis,
  ChartTooltip,
  ComposedChart,
  FunnelChart,
  Gauge,
  Grid,
  HeatmapCells,
  HeatmapChart,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendProgress,
  LegendValue,
  Line,
  LinearGradient,
  LiveLine,
  LiveLineChart,
  type LiveLinePoint,
  LiveXAxis,
  LiveYAxis,
  Ring,
  RingCenter,
  RingChart,
  SeriesBar,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  customerFunnel,
  dailySales,
  monthlyGoals,
  overviewStats,
  recentOrders,
  topDishes,
  weeklyTrafficHeatmap,
} from "@/lib/data";
import {
  formatBRL,
  formatBRLCents,
  formatCompact,
  formatInt,
} from "@/lib/format";
import { Icon } from "@/lib/icons";

/**
 * The Dashboard's charts, shared by the overview page and the home screen
 * widgets. Each one renders only the chart (the card around it is the
 * caller's).
 */

export type SalesDay = (typeof dailySales)[number];

const orderStatusVariant = {
  Pago: "outline",
  "A caminho": "secondary",
  "Na cozinha": "default",
  Cancelado: "destructive",
} as const;

/** Simulated live "pedidos por minuto" stream. */
export function useLiveOrders() {
  const [data, setData] = useState<LiveLinePoint[]>([]);
  const [value, setValue] = useState(12);
  const ref = useRef(12);

  useEffect(() => {
    const now = Date.now() / 1000;
    let v = 12;
    const seed: LiveLinePoint[] = [];
    for (let i = 40; i > 0; i--) {
      v = Math.max(2, v + (Math.random() - 0.48) * 2);
      seed.push({ time: now - i, value: Math.round(v * 10) / 10 });
    }
    ref.current = v;
    setData(seed);
    setValue(v);

    const id = setInterval(() => {
      ref.current = Math.min(
        30,
        Math.max(2, ref.current + (Math.random() - 0.48) * 2)
      );
      const next = Math.round(ref.current * 10) / 10;
      const t = Date.now() / 1000;
      setData((prev) => [
        ...prev.filter((p) => p.time >= t - 60),
        { time: t, value: next },
      ]);
      setValue(next);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return { data, value };
}

export function dayGreeting() {
  const h = new Date().getHours();
  if (h < 12) {
    return "Bom dia";
  }
  return h < 18 ? "Boa tarde" : "Boa noite";
}

export function OccupancyGauge({ height = 150 }: { height?: number }) {
  return (
    <Gauge
      centerValue={overviewStats.occupancy}
      className="mx-auto"
      defaultLabel="ocupadas"
      height={height}
      inactiveFillOpacity={0.3}
      suffix="%"
      value={overviewStats.occupancy}
      width={(height * 26) / 15}
    />
  );
}

export function DailySalesChart({
  series = dailySales,
}: {
  series?: SalesDay[];
}) {
  return (
    <ComposedChart
      aspectRatio="2 / 1"
      barGap={0.2}
      data={series}
      margin={{ top: 8, right: 56, bottom: 36, left: 48 }}
      maxBarSize={28}
    >
      <Grid horizontal />
      <SeriesBar dataKey="orders" fill="var(--chart-4)" radius={4} />
      <Line dataKey="revenue" stroke="var(--chart-1)" yAxisId="right" />
      <YAxis yAxisId="left" />
      <YAxis
        formatValue={(v) => `${formatCompact(v / 1000)}k`}
        orientation="right"
        yAxisId="right"
      />
      <ChartTooltip
        rows={(p) => [
          {
            color: "var(--chart-1)",
            label: "Faturamento",
            value: formatBRL(Number(p.revenue)),
          },
          {
            color: "var(--chart-4)",
            label: "Pedidos",
            value: formatInt(Number(p.orders)),
          },
        ]}
        showCrosshair={false}
      />
      <XAxis numTicks={6} />
    </ComposedChart>
  );
}

export function GoalsRing({ size = 200 }: { size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex flex-col items-center gap-4">
      <RingChart
        data={monthlyGoals}
        hoveredIndex={hover}
        onHoverChange={setHover}
        ringGap={6}
        size={size}
        strokeWidth={12}
      >
        {monthlyGoals.map((g, i) => (
          <Ring index={i} key={g.label} />
        ))}
        <RingCenter defaultLabel="Realizado" prefix="R$ " suffix=" mil" />
      </RingChart>
      <Legend
        className="w-full"
        hoveredIndex={hover}
        items={monthlyGoals.map((g) => ({
          label: g.label,
          value: g.value,
          maxValue: g.maxValue,
          color: g.color ?? "",
        }))}
        onHoverChange={setHover}
      >
        <LegendItemComponent className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1">
          <LegendMarker />
          <LegendLabel />
          <LegendValue showPercentage />
          <div className="col-span-full">
            <LegendProgress />
          </div>
        </LegendItemComponent>
      </Legend>
    </div>
  );
}

export function TrafficHeatmap() {
  return (
    <div className="flex flex-col gap-3 overflow-x-auto">
      <HeatmapChart
        className="w-full min-w-[560px]"
        data={weeklyTrafficHeatmap}
        gap={3}
        layout="fluid"
        margin={{ top: 24, right: 8, bottom: 8, left: 36 }}
      >
        <HeatmapCells cornerRadius={3} />
        <HeatmapXAxis />
        <HeatmapYAxis labelFormat="initial" tickFilter="odd" />
        <HeatmapTooltip />
      </HeatmapChart>
      <HeatmapLegend align="end" gap={3} />
    </div>
  );
}

export function LiveOrdersChart({ height = 240 }: { height?: number }) {
  const live = useLiveOrders();
  return (
    <LiveLineChart
      data={live.data}
      margin={{ top: 16, right: 16, bottom: 32, left: 40 }}
      style={{ height }}
      value={live.value}
      window={40}
    >
      <LiveLine
        dataKey="value"
        formatValue={(v) => v.toFixed(1)}
        stroke="var(--chart-1)"
      />
      <LiveXAxis />
      <LiveYAxis formatValue={(v) => v.toFixed(0)} position="left" />
    </LiveLineChart>
  );
}

export function CustomerFunnel() {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <FunnelChart
        className="max-h-[260px]"
        color="var(--chart-1)"
        data={customerFunnel}
        hoveredIndex={hover}
        layers={3}
        onHoverChange={setHover}
        orientation="horizontal"
        showLabels={false}
      />
      <Legend
        className="flex-row flex-wrap justify-center gap-x-4 gap-y-1"
        hoveredIndex={hover}
        items={customerFunnel.map((s) => ({
          label: s.label,
          value: s.value,
          color: "var(--chart-1)",
        }))}
        onHoverChange={setHover}
      >
        <LegendItemComponent className="flex items-center gap-1.5">
          <LegendLabel className="text-xs" />
          <LegendValue className="text-xs" />
        </LegendItemComponent>
      </Legend>
    </div>
  );
}

export function TopDishesChart({ id = "top-dishes" }: { id?: string }) {
  return (
    <BarChart
      aspectRatio="4 / 3"
      data={topDishes}
      margin={{ left: 84 }}
      orientation="horizontal"
      xDataKey="dish"
    >
      <LinearGradient
        from="var(--chart-1)"
        id={`${id}-gradient`}
        to="var(--chart-4)"
        vertical={false}
      />
      <Grid fadeVertical horizontal={false} vertical />
      <Bar dataKey="sales" fill={`url(#${id}-gradient)`} lineCap={4} />
      <BarYAxis />
      <ChartTooltip showCrosshair={false} />
    </BarChart>
  );
}

export function RecentOrdersList({ limit }: { limit?: number }) {
  return (
    <ul className="flex flex-col divide-y">
      {recentOrders.slice(0, limit).map((o) => (
        <li className="flex items-center gap-3 py-2.5" key={o.id}>
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <Icon
              className="size-4"
              name={o.table === "Delivery" ? "IconTruck" : "IconForkKnife"}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">
              {o.id} · {o.table}
            </p>
            <p className="text-muted-foreground text-xs">
              {o.items} {o.items === 1 ? "item" : "itens"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-medium text-sm tabular-nums">
              {formatBRLCents(o.total)}
            </span>
            <Badge variant={orderStatusVariant[o.status]}>{o.status}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
