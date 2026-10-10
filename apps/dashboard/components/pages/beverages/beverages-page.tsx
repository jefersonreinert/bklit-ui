"use client";

import { useCallback, useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type BeverageKind,
  type BeverageState,
  type Cocktail,
  dailyBeverageRevenue,
  initialBeverageState,
  initialMovements,
  inventoryRows,
  type Movement,
  menuLines,
} from "@/lib/beverage-data";
import { brlFormatOptions, formatBRL, formatPercent } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { BeersTab, SoftDrinksTab } from "./beers-tab";
import { CartaTab } from "./carta-tab";
import { CellarTab } from "./cellar-tab";
import { CocktailsTab } from "./cocktails-tab";
import { InventoryTab } from "./inventory-tab";
import { BeverageOverviewTab } from "./overview-tab";
import { SpiritsTab } from "./spirits-tab";
import { WinesTab } from "./wines-tab";

const TABS = [
  { value: "geral", label: "Visão geral", icon: "IconChart3" },
  { value: "adega", label: "Adega (Notion)", icon: "IconGlass" },
  { value: "vinhos", label: "Vinhos", icon: "IconGlass" },
  { value: "destilados", label: "Destilados", icon: "IconBottle" },
  { value: "cervejas", label: "Cervejas", icon: "IconBeer" },
  { value: "coqueteis", label: "Coquetéis", icon: "IconCocktail" },
  { value: "sem-alcool", label: "Sem álcool", icon: "IconGlassWater" },
  { value: "inventario", label: "Inventário", icon: "IconBarcode" },
  { value: "carta", label: "Carta completa", icon: "IconPrinter" },
] as const;

type ListKey = keyof BeverageState;

const kindToList: Record<
  Exclude<BeverageKind, "coquetel">,
  Exclude<ListKey, "cocktails">
> = {
  vinho: "wines",
  destilado: "spirits",
  cerveja: "beers",
  "sem-alcool": "softDrinks",
};

const revenueSeries = dailyBeverageRevenue.map((d) => ({
  date: d.date,
  receita: d.vinhos + d.coqueteis + d.cervejas + d.destilados,
}));

export function BeveragesPage() {
  const [tab, setTab] = useState<string>("geral");
  const [state, setState] = useState<BeverageState>(initialBeverageState);
  const [movements, setMovements] = useState<Movement[]>(initialMovements);

  const update = useCallback(
    <K extends ListKey>(key: K) =>
      (id: string, patch: Partial<BeverageState[K][number]>) =>
        setState((prev) => ({
          ...prev,
          [key]: (prev[key] as BeverageState[K][number][]).map((item) =>
            item.id === id ? { ...item, ...patch } : item
          ),
        })),
    []
  );

  const setStock = useCallback(
    (kind: BeverageKind, id: string, stock: number) => {
      if (kind === "coquetel") {
        return;
      }
      const key = kindToList[kind];
      setState((prev) => ({
        ...prev,
        [key]: (prev[key] as { id: string; stock: number }[]).map((item) =>
          item.id === id ? { ...item, stock } : item
        ),
      }));
    },
    []
  );

  const addCocktail = (c: Cocktail) => {
    setState((prev) => ({ ...prev, cocktails: [c, ...prev.cocktails] }));
  };

  const lines = useMemo(() => menuLines(state), [state]);
  const inventory = useMemo(() => inventoryRows(state), [state]);

  const revenue = lines.reduce((a, l) => a + l.revenue, 0);
  const profit = lines.reduce((a, l) => a + l.profit, 0);
  const stockValue = inventory.reduce((a, r) => a + r.stock * r.unitCost, 0);
  const lowCount = inventory.filter((r) => r.stock <= r.min).length;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            Carta de bebidas
          </h2>
          <p className="text-muted-foreground text-sm">
            Vinhos, destilados, cervejas e coquetéis com fichas técnicas,
            inventário, custo e margem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setTab("inventario")} variant="outline">
            <Icon className="size-4" name="IconBarcode" />
            Inventário
          </Button>
          <Button onClick={() => setTab("coqueteis")}>
            <Icon className="size-4" name="IconCocktail" />
            Coquetéis
          </Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
        <KpiCard
          dataKey="receita"
          formatOptions={brlFormatOptions}
          icon="IconDrink"
          label="Receita de bebidas no mês"
          series={revenueSeries}
          title="Faturamento"
          trend={6.8}
          value={Math.round(revenue)}
        />
        <MetricTile
          className="justify-between"
          hint={`Lucro bruto ${formatBRL(profit)} no mês`}
          icon="IconPieChart2"
          label="CMV médio de bebidas"
          tone={(1 - profit / revenue) * 100 <= 28 ? "good" : "warn"}
          value={formatPercent((1 - profit / revenue) * 100)}
        >
          <p className="text-muted-foreground text-xs">
            Margem bruta {formatPercent((profit / revenue) * 100)}
          </p>
        </MetricTile>
        <MetricTile
          className="justify-between"
          hint={`${inventory.length} itens controlados`}
          icon="IconMoneybag"
          label="Valor em estoque"
          tone="neutral"
          value={formatBRL(stockValue)}
        >
          <p className="text-muted-foreground text-xs">
            Giro estimado{" "}
            {((revenue - profit) / stockValue).toFixed(1).replace(".", ",")}x ao
            mês
          </p>
        </MetricTile>
        <MetricTile
          className="justify-between"
          hint={`${lines.length} itens na carta · ${lines.filter((l) => !l.available).length} em falta`}
          icon="IconWarningSign"
          label="Reposição"
          tone={lowCount > 0 ? "bad" : "good"}
          value={`${lowCount} abaixo do mínimo`}
        >
          <button
            className="text-left text-muted-foreground text-xs underline-offset-2 hover:underline"
            onClick={() => setTab("inventario")}
            type="button"
          >
            Ver sugestão de compra →
          </button>
        </MetricTile>
      </section>

      <Tabs onValueChange={(v) => setTab(String(v))} value={tab}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0 print:hidden">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                <Icon className="size-3.5" name={t.icon} />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent className="pt-4" value="geral">
          <BeverageOverviewTab inventory={inventory} lines={lines} />
        </TabsContent>
        <TabsContent className="pt-4" value="adega">
          <CellarTab />
        </TabsContent>
        <TabsContent className="pt-4" value="vinhos">
          <WinesTab onUpdate={update("wines")} wines={state.wines} />
        </TabsContent>
        <TabsContent className="pt-4" value="destilados">
          <SpiritsTab onUpdate={update("spirits")} spirits={state.spirits} />
        </TabsContent>
        <TabsContent className="pt-4" value="cervejas">
          <BeersTab beers={state.beers} onUpdate={update("beers")} />
        </TabsContent>
        <TabsContent className="pt-4" value="coqueteis">
          <CocktailsTab
            cocktails={state.cocktails}
            onCreate={addCocktail}
            onUpdate={update("cocktails")}
            spirits={state.spirits}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="sem-alcool">
          <SoftDrinksTab
            items={state.softDrinks}
            onUpdate={update("softDrinks")}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="inventario">
          <InventoryTab
            movements={movements}
            onMovement={(m) => setMovements((prev) => [m, ...prev])}
            onSetStock={setStock}
            rows={inventory}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="carta">
          <CartaTab lines={lines} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
