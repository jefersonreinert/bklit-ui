"use client";

import {
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendValue,
  PieCenter,
  PieChart,
  type PieData,
  PieSlice,
} from "@bklitui/ui/charts";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { palette } from "@/lib/data";
import { formatBRL, formatBRLCents, formatPercent } from "@/lib/format";
import { type Dish, dishCmv, dishCost, dishMargin } from "@/lib/menu-data";

const sliceColors = [
  palette.brasa,
  palette.teal,
  palette.amber,
  palette.violet,
  palette.green,
  palette.stone,
];

export function MenuRecipesTab({
  items,
  onUpdate,
}: {
  items: Dish[];
  onUpdate: (id: string, patch: Partial<Dish>) => void;
}) {
  const [dishId, setDishId] = useState(items[0]?.id ?? "");
  const [targetCmv, setTargetCmv] = useState(30);
  const [hover, setHover] = useState<number | null>(null);
  const dish = items.find((d) => d.id === dishId) ?? items[0];

  const composition: PieData[] = useMemo(
    () =>
      (dish?.ingredients ?? []).map((i, idx) => ({
        label: i.name,
        value: Math.round(i.qty * i.unitCost * 100) / 100,
        color: sliceColors[idx % sliceColors.length],
      })),
    [dish]
  );

  if (!dish) {
    return null;
  }

  const cost = dishCost(dish);
  const cmv = dishCmv(dish);
  const suggested = Math.ceil(cost / (targetCmv / 100));
  const markup = dish.price / cost;
  const dishItems = items.map((d) => ({ value: d.id, label: d.name }));

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          items={dishItems}
          onValueChange={(v) => setDishId(String(v))}
          value={dish.id}
        >
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dishItems.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-sm">
          {dish.description}
        </span>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          hint="Soma dos insumos da ficha"
          icon="IconReceiptBill"
          label="Custo do prato"
          tone="neutral"
          value={formatBRLCents(cost)}
        />
        <MetricTile
          hint="Ideal 28–35%"
          icon="IconPieChart2"
          label="CMV"
          tone={cmv <= 35 ? "good" : "warn"}
          value={formatPercent(cmv)}
        />
        <MetricTile
          hint="Preço − custo"
          icon="IconCoins"
          label="Margem por prato"
          tone="good"
          value={formatBRLCents(dishMargin(dish))}
        />
        <MetricTile
          hint="Preço ÷ custo · ideal ≥ 3x"
          icon="IconChartCompare"
          label="Markup"
          tone={markup >= 3 ? "good" : "warn"}
          value={`${markup.toFixed(2).replace(".", ",")}x`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Quantidades por porção e custo unitário"
          title="Ficha técnica"
        >
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="py-2 text-left font-normal">Insumo</th>
                  <th className="py-2 text-right font-normal">Quantidade</th>
                  <th className="py-2 text-right font-normal">Custo unit.</th>
                  <th className="py-2 text-right font-normal">Custo</th>
                  <th className="py-2 text-right font-normal">% do prato</th>
                </tr>
              </thead>
              <tbody>
                {dish.ingredients.map((i) => {
                  const c = i.qty * i.unitCost;
                  return (
                    <tr className="border-border/50 border-b" key={i.name}>
                      <td className="py-2 font-medium">{i.name}</td>
                      <td className="py-2 text-right tabular-nums">
                        {i.qty} {i.unit}
                      </td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums">
                        {i.unit === "un"
                          ? formatBRLCents(i.unitCost)
                          : `${formatBRLCents(i.unitCost * 1000)}/${i.unit === "g" ? "kg" : "L"}`}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatBRLCents(c)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums">
                        {formatPercent((c / cost) * 100)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-medium">
                  <td className="py-2">Custo total</td>
                  <td />
                  <td />
                  <td className="py-2 text-right tabular-nums">
                    {formatBRLCents(cost)}
                  </td>
                  <td className="py-2 text-right tabular-nums">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          description="Participação de cada insumo no custo"
          title="Composição do custo"
        >
          <div className="flex flex-col items-center gap-4">
            <PieChart
              data={composition}
              hoveredIndex={hover}
              innerRadius={56}
              onHoverChange={setHover}
              size={200}
            >
              {composition.map((c, i) => (
                <PieSlice index={i} key={c.label} />
              ))}
              <PieCenter
                defaultLabel="Custo"
                formatOptions={{
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                }}
                prefix="R$ "
              />
            </PieChart>
            <Legend
              className="w-full"
              hoveredIndex={hover}
              items={composition.map((c) => ({
                label: c.label,
                value: c.value,
                color: c.color ?? "",
              }))}
              onHoverChange={setHover}
            >
              <LegendItemComponent className="flex items-center gap-3">
                <LegendMarker />
                <LegendLabel className="flex-1 text-sm" />
                <LegendValue
                  className="text-sm"
                  formatValue={formatBRLCents}
                  showPercentage
                />
              </LegendItemComponent>
            </Legend>
          </div>
        </ChartCard>
      </section>

      <ChartCard
        description="Arraste para definir o CMV desejado e veja o preço sugerido"
        title="Simulador de preço"
      >
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span>CMV alvo</span>
              <span className="font-semibold tabular-nums">{targetCmv}%</span>
            </div>
            <Slider
              max={45}
              min={20}
              onValueChange={(v) =>
                setTargetCmv(Array.isArray(v) ? (v[0] ?? 30) : v)
              }
              step={1}
              value={targetCmv}
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>20% (premium)</span>
              <span>45% (popular)</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 rounded-xl bg-muted/60 p-4 md:min-w-64">
            <span className="text-muted-foreground text-xs">
              Preço atual {formatBRL(dish.price)}
            </span>
            <span className="font-semibold text-3xl tabular-nums tracking-tight">
              {formatBRL(suggested)}
            </span>
            <span className="text-muted-foreground text-xs">
              {suggested > dish.price ? "+" : ""}
              {formatPercent(((suggested - dish.price) / dish.price) * 100)} vs.
              atual
            </span>
            <button
              className="mt-1 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs"
              onClick={() => onUpdate(dish.id, { price: suggested })}
              type="button"
            >
              Aplicar preço sugerido
            </button>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
