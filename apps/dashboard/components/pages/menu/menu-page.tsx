"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brlFormatOptions, formatPercent } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { type Dish, dailyItems, dishes, menuSummary } from "@/lib/menu-data";
import { MenuEngineeringTab } from "./engineering-tab";
import { MenuItemsTab, NewDishSheet } from "./items-tab";
import { MenuOverviewTab } from "./overview-tab";
import { MenuRecipesTab } from "./recipes-tab";
import { MenuStockTab } from "./stock-tab";

const TABS = [
  { value: "geral", label: "Visão geral" },
  { value: "itens", label: "Itens do cardápio" },
  { value: "engenharia", label: "Engenharia de cardápio" },
  { value: "fichas", label: "Fichas técnicas" },
  { value: "estoque", label: "Estoque" },
] as const;

const itemsSeries = dailyItems.map((d) => ({
  date: d.date,
  itens: d.pratos + d.bebidas,
  ticket: Math.round(
    menuSummary.avgTicketPerItem * (0.94 + (d.pratos % 13) / 100)
  ),
}));

export function MenuPage() {
  const [tab, setTab] = useState<string>("geral");
  const [items, setItems] = useState<Dish[]>(dishes);
  const [newOpen, setNewOpen] = useState(false);

  const update = (id: string, patch: Partial<Dish>) =>
    setItems((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const active = useMemo(
    () => items.filter((d) => d.available).length,
    [items]
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            Gestão do cardápio
          </h2>
          <p className="text-muted-foreground text-sm">
            Vendas, rentabilidade por prato, fichas técnicas e insumos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Icon className="size-4" name="IconFilePdf" />
            Cardápio PDF
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Icon className="size-4" name="IconPlusMedium" />
            Novo prato
          </Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          dataKey="itens"
          icon="IconForkKnife"
          label="Itens vendidos no mês"
          series={itemsSeries}
          title="Vendas"
          trend={menuSummary.salesTrend}
          value={menuSummary.totalSales}
        />
        <KpiCard
          color="var(--kpi-2)"
          dataKey="ticket"
          formatOptions={brlFormatOptions}
          icon="IconReceiptBill"
          label="Preço médio por item vendido"
          series={itemsSeries}
          title="Ticket por item"
          trend={2.4}
          value={Math.round(menuSummary.avgTicketPerItem)}
        />
        <MetricTile
          className="justify-between"
          hint={`${menuSummary.best.sales} vendas no mês · ${menuSummary.best.category}`}
          icon="IconStar"
          label="Campeão de vendas"
          tone="good"
          value={menuSummary.best.name}
        >
          <p className="text-muted-foreground text-xs">
            Nota média do cardápio{" "}
            <span className="font-medium text-foreground">
              {menuSummary.avgRating.toFixed(2).replace(".", ",")}
            </span>{" "}
            · {menuSummary.totalReviews} avaliações
          </p>
        </MetricTile>
        <MetricTile
          className="justify-between"
          hint={`CMV ponderado ${formatPercent(menuSummary.weightedCmv)} · preparo médio ${Math.round(menuSummary.avgPrep)} min`}
          icon="IconChecklist"
          label="Itens ativos"
          tone={items.length - active > 0 ? "warn" : "good"}
          value={`${active} de ${items.length}`}
        >
          <p className="text-muted-foreground text-xs">
            {items.length - active > 0
              ? `${items.length - active} em falta agora`
              : "Todos disponíveis"}
          </p>
        </MetricTile>
      </section>

      <Tabs onValueChange={(v) => setTab(String(v))} value={tab}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent className="pt-4" value="geral">
          <MenuOverviewTab />
        </TabsContent>
        <TabsContent className="pt-4" value="itens">
          <MenuItemsTab items={items} onUpdate={update} />
        </TabsContent>
        <TabsContent className="pt-4" value="engenharia">
          <MenuEngineeringTab items={items} />
        </TabsContent>
        <TabsContent className="pt-4" value="fichas">
          <MenuRecipesTab items={items} onUpdate={update} />
        </TabsContent>
        <TabsContent className="pt-4" value="estoque">
          <MenuStockTab />
        </TabsContent>
      </Tabs>

      <NewDishSheet
        onCreate={(d) => {
          setItems((prev) => [d, ...prev]);
          setTab("itens");
        }}
        onOpenChange={setNewOpen}
        open={newOpen}
      />
    </div>
  );
}
