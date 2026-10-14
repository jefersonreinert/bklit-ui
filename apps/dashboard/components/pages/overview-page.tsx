"use client";

import { useState } from "react";
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
import { dailySales, overviewStats } from "@/lib/data";
import { brlFormatOptions } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { firstName, usePreferences } from "@/lib/preferences";
import {
  CustomerFunnel,
  DailySalesChart,
  dayGreeting,
  GoalsRing,
  LiveOrdersChart,
  OccupancyGauge,
  RecentOrdersList,
  TopDishesChart,
  TrafficHeatmap,
} from "./overview-sections";

const channelItems = [
  { value: "all", label: "Todos os canais" },
  { value: "salao", label: "Salão" },
  { value: "delivery", label: "Delivery" },
];

export function OverviewPage() {
  const [period, setPeriod] = useState("30d");

  const series = period === "7d" ? dailySales.slice(-7) : dailySales;
  const profile = usePreferences();

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            {dayGreeting()}, {firstName(profile.name)} 👋
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
          color="var(--kpi-2)"
          dataKey="orders"
          icon="IconReceiptBill"
          label="Pedidos no período"
          series={series}
          title="Pedidos"
          trend={overviewStats.ordersTrend}
          value={series.reduce((a, d) => a + d.orders, 0)}
        />
        <KpiCard
          color="var(--kpi-3)"
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
          <OccupancyGauge />
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
          <DailySalesChart series={series} />
        </ChartCard>

        <ChartCard
          description="Progresso das metas de outubro (R$ mil)"
          title="Metas do mês"
        >
          <GoalsRing />
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Intensidade de clientes por dia nos últimos 6 meses"
          title="Movimento do salão"
        >
          <TrafficHeatmap />
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
          <LiveOrdersChart />
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          description="Da visita no app à avaliação 5★"
          title="Jornada do cliente"
        >
          <CustomerFunnel />
        </ChartCard>

        <ChartCard
          description="Unidades vendidas no mês"
          title="Pratos mais vendidos"
        >
          <TopDishesChart />
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
          <RecentOrdersList />
        </ChartCard>
      </section>
    </div>
  );
}
