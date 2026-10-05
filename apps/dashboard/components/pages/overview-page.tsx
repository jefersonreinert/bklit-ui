"use client";

import { Icon } from "@bklitui/icons";
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
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  brlFormatOptions,
  formatBRL,
  formatBRLCents,
  formatCompact,
  formatInt,
} from "@/lib/format";

const orderStatusVariant = {
  Pago: "outline",
  "A caminho": "secondary",
  "Na cozinha": "default",
  Cancelado: "destructive",
} as const;

const channelItems = [
  { value: "all", label: "Todos os canais" },
  { value: "salao", label: "Salão" },
  { value: "delivery", label: "Delivery" },
];

/** Simulated live "pedidos por minuto" stream. */
function useLiveOrders() {
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

export function OverviewPage() {
  const [period, setPeriod] = useState("30d");
  const [goalHover, setGoalHover] = useState<number | null>(null);
  const [funnelHover, setFunnelHover] = useState<number | null>(null);
  const live = useLiveOrders();

  const series = period === "7d" ? dailySales.slice(-7) : dailySales;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            Bom dia, Gabriela 👋
          </h2>
          <p className="text-muted-foreground text-sm">
            Veja como o restaurante está performando.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs onValueChange={(v) => setPeriod(String(v))} value={period}>
            <TabsList>
              <TabsTrigger value="7d">7 dias</TabsTrigger>
              <TabsTrigger value="30d">30 dias</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline">
            <Icon className="size-4" name="IconFileDownload" />
            Exportar
          </Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          dataKey="revenue"
          formatOptions={brlFormatOptions}
          icon="IconCoins"
          label="Faturamento no período"
          series={series}
          title="Faturamento"
          trend={overviewStats.revenueTrend}
          value={series.reduce((a, d) => a + d.revenue, 0)}
        />
        <KpiCard
          dataKey="orders"
          icon="IconReceiptBill"
          label="Pedidos no período"
          series={series}
          title="Pedidos"
          trend={overviewStats.ordersTrend}
          value={series.reduce((a, d) => a + d.orders, 0)}
        />
        <KpiCard
          dataKey="ticket"
          formatOptions={brlFormatOptions}
          icon="IconMoneyHand"
          label="Ticket médio"
          series={series}
          title="Ticket médio"
          trend={overviewStats.ticketTrend}
          value={overviewStats.ticket}
        />
        <ChartCard
          action={<Badge variant="secondary">Hoje</Badge>}
          className="gap-2"
          title="Ocupação do salão"
        >
          <Gauge
            centerValue={overviewStats.occupancy}
            className="mx-auto"
            defaultLabel="ocupadas"
            height={150}
            inactiveFillOpacity={0.3}
            suffix="%"
            value={overviewStats.occupancy}
            width={260}
          />
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          action={
            <Select defaultValue="all" items={channelItems}>
              <SelectTrigger className="w-36" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                <SelectItem value="salao">Salão</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>
          }
          className="xl:col-span-2"
          description="Pedidos (barras) e faturamento diário (linha)"
          title="Vendas diárias"
        >
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
                  color: "var(--chart-2)",
                  label: "Pedidos",
                  value: formatInt(Number(p.orders)),
                },
              ]}
              showCrosshair={false}
            />
            <XAxis numTicks={6} />
          </ComposedChart>
        </ChartCard>

        <ChartCard
          description="Progresso das metas de outubro (R$ mil)"
          title="Metas do mês"
        >
          <div className="flex flex-col items-center gap-4">
            <RingChart
              data={monthlyGoals}
              hoveredIndex={goalHover}
              onHoverChange={setGoalHover}
              ringGap={6}
              size={200}
              strokeWidth={12}
            >
              {monthlyGoals.map((g, i) => (
                <Ring index={i} key={g.label} />
              ))}
              <RingCenter defaultLabel="Realizado" prefix="R$ " suffix=" mil" />
            </RingChart>
            <Legend
              className="w-full"
              hoveredIndex={goalHover}
              items={monthlyGoals.map((g) => ({
                label: g.label,
                value: g.value,
                maxValue: g.maxValue,
                color: g.color ?? "",
              }))}
              onHoverChange={setGoalHover}
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
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Intensidade de clientes por dia nos últimos 6 meses"
          title="Movimento do salão"
        >
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
        </ChartCard>

        <ChartCard
          action={
            <Badge className="gap-1.5" variant="outline">
              <span className="size-1.5 animate-pulse rounded-full bg-success" />
              Ao vivo
            </Badge>
          }
          description="Pedidos por minuto (cozinha)"
          title="Fluxo em tempo real"
        >
          <LiveLineChart
            data={live.data}
            margin={{ top: 16, right: 16, bottom: 32, left: 40 }}
            style={{ height: 240 }}
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
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          description="Da visita no app à avaliação 5★"
          title="Jornada do cliente"
        >
          <div className="flex flex-col gap-3">
            <FunnelChart
              className="max-h-[260px]"
              color="var(--chart-1)"
              data={customerFunnel}
              hoveredIndex={funnelHover}
              layers={3}
              onHoverChange={setFunnelHover}
              orientation="horizontal"
              showLabels={false}
            />
            <Legend
              className="flex-row flex-wrap justify-center gap-x-4 gap-y-1"
              hoveredIndex={funnelHover}
              items={customerFunnel.map((s) => ({
                label: s.label,
                value: s.value,
                color: "var(--chart-1)",
              }))}
              onHoverChange={setFunnelHover}
            >
              <LegendItemComponent className="flex items-center gap-1.5">
                <LegendLabel className="text-xs" />
                <LegendValue className="text-xs" />
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>

        <ChartCard
          description="Unidades vendidas no mês"
          title="Pratos mais vendidos"
        >
          <BarChart
            aspectRatio="4 / 3"
            data={topDishes}
            margin={{ left: 84 }}
            orientation="horizontal"
            xDataKey="dish"
          >
            <LinearGradient
              from="var(--chart-1)"
              id="top-dishes-gradient"
              to="var(--chart-3)"
              vertical={false}
            />
            <Grid fadeVertical horizontal={false} vertical />
            <Bar dataKey="sales" fill="url(#top-dishes-gradient)" lineCap={4} />
            <BarYAxis />
            <ChartTooltip showCrosshair={false} />
          </BarChart>
        </ChartCard>

        <ChartCard
          action={
            <Button size="sm" variant="ghost">
              Ver todos
            </Button>
          }
          className="lg:col-span-2 xl:col-span-1"
          description="Últimos pedidos registrados"
          title="Pedidos recentes"
        >
          <ul className="flex flex-col divide-y">
            {recentOrders.map((o) => (
              <li className="flex items-center gap-3 py-2.5" key={o.id}>
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                  <Icon
                    className="size-4"
                    name={
                      o.table === "Delivery" ? "IconTruck" : "IconForkKnife"
                    }
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
                  <Badge variant={orderStatusVariant[o.status]}>
                    {o.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </ChartCard>
      </section>
    </div>
  );
}
