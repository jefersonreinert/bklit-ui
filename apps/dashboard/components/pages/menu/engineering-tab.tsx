"use client";

import { Icon, type IconName } from "@/lib/icons";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatBRL, formatPercent } from "@/lib/format";
import {
  type Dish,
  menuEngineering,
  type Quadrant,
  quadrantInfo,
} from "@/lib/menu-data";
import { cn } from "@/lib/utils";

const quadrantIcon: Record<Quadrant, IconName> = {
  Estrela: "IconStar",
  "Burro de carga": "IconTruck",
  "Quebra-cabeça": "IconSearchIntelligence",
  Abacaxi: "IconWarningSign",
};

/** Plot position inside the matrix, 0–100 on each axis. */
function scale(value: number, min: number, max: number) {
  if (max === min) {
    return 50;
  }
  return 6 + ((value - min) / (max - min)) * 88;
}

export function MenuEngineeringTab({ items }: { items: Dish[] }) {
  const rows = useMemo(() => menuEngineering(items), [items]);
  const [hover, setHover] = useState<string | null>(null);

  const sales = rows.map((r) => r.dish.sales);
  const margins = rows.map((r) => r.margin);
  const minS = Math.min(...sales);
  const maxS = Math.max(...sales);
  const minM = Math.min(...margins);
  const maxM = Math.max(...margins);
  const threshold = rows[0]?.popularityThreshold ?? 0;
  const avgMargin = rows[0]?.avgMargin ?? 0;
  const xLine = scale(threshold, minS, maxS);
  const yLine = scale(avgMargin, minM, maxM);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section className="grid gap-4 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-3"
          description={`Popularidade (vendas) × margem por prato · linhas = margem média ${formatBRL(avgMargin)} e 70% da participação média`}
          title="Matriz de engenharia de cardápio"
        >
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border bg-muted/30 sm:aspect-[4/3]">
            {/* quadrant labels */}
            <span className="absolute top-2 left-3 text-[11px] text-muted-foreground">
              Quebra-cabeça
            </span>
            <span className="absolute top-2 right-3 text-[11px] text-muted-foreground">
              Estrela
            </span>
            <span className="absolute bottom-2 left-3 text-[11px] text-muted-foreground">
              Abacaxi
            </span>
            <span className="absolute right-3 bottom-2 text-[11px] text-muted-foreground">
              Burro de carga
            </span>
            {/* guide lines */}
            <div
              className="absolute inset-y-0 border-foreground/25 border-l border-dashed"
              style={{ left: `${xLine}%` }}
            />
            <div
              className="absolute inset-x-0 border-foreground/25 border-t border-dashed"
              style={{ bottom: `${yLine}%` }}
            />
            {/* dots */}
            {rows.map((r) => {
              const active = hover === r.dish.id;
              return (
                <button
                  aria-label={`${r.dish.name}: ${r.dish.sales} vendas, margem ${formatBRL(r.margin)}`}
                  className={cn(
                    "group absolute -translate-x-1/2 translate-y-1/2 rounded-full transition-transform",
                    active ? "z-10 scale-125" : "hover:scale-125"
                  )}
                  key={r.dish.id}
                  onBlur={() => setHover(null)}
                  onFocus={() => setHover(r.dish.id)}
                  onMouseEnter={() => setHover(r.dish.id)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    left: `${scale(r.dish.sales, minS, maxS)}%`,
                    bottom: `${scale(r.margin, minM, maxM)}%`,
                  }}
                  type="button"
                >
                  <span
                    className={cn(
                      "block size-3.5 rounded-full ring-2 ring-background",
                      r.quadrant === "Estrela" &&
                        "bg-[var(--series-1)] dark:bg-foreground",
                      r.quadrant === "Burro de carga" && "bg-[var(--series-3)]",
                      r.quadrant === "Quebra-cabeça" && "bg-[var(--series-4)]",
                      r.quadrant === "Abacaxi" && "bg-[var(--series-5)]",
                      !r.dish.available && "opacity-40"
                    )}
                  />
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md ring-1 ring-border",
                      active ? "block" : "hidden"
                    )}
                  >
                    <span className="font-medium">{r.dish.name}</span> ·{" "}
                    {r.dish.sales} vend. · {formatBRL(r.margin)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-right text-[11px] text-muted-foreground">
            ↑ margem por prato · popularidade (vendas no mês) →
          </p>
        </ChartCard>

        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-1">
          {(
            [
              "Estrela",
              "Burro de carga",
              "Quebra-cabeça",
              "Abacaxi",
            ] as Quadrant[]
          ).map((q) => {
            const list = rows.filter((r) => r.quadrant === q);
            return (
              <Card className="gap-2 px-4 py-3.5" key={q} size="sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <Icon className="size-4" name={quadrantIcon[q]} />
                    {q}
                  </span>
                  <Badge variant="outline">{list.length}</Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {quadrantInfo[q].description} →{" "}
                  <span className="text-foreground">
                    {quadrantInfo[q].action}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {list.map((r) => (
                    <Badge
                      className="cursor-default"
                      key={r.dish.id}
                      onMouseEnter={() => setHover(r.dish.id)}
                      onMouseLeave={() => setHover(null)}
                      variant="secondary"
                    >
                      {r.dish.name}
                    </Badge>
                  ))}
                  {list.length === 0 ? (
                    <span className="text-muted-foreground text-xs">
                      Nenhum prato
                    </span>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <ChartCard
        description="Classificação completa · ordenada por participação nas vendas"
        title="Análise por prato"
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Prato</th>
                <th className="py-2 text-right font-normal">Vendas</th>
                <th className="py-2 text-right font-normal">Mix %</th>
                <th className="py-2 text-right font-normal">Margem un.</th>
                <th className="py-2 text-right font-normal">Margem total</th>
                <th className="py-2 text-right font-normal">Classe</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => b.share - a.share)
                .map((r) => (
                  <tr
                    className={cn(
                      "border-border/50 border-b last:border-0",
                      hover === r.dish.id && "bg-muted/50"
                    )}
                    key={r.dish.id}
                    onMouseEnter={() => setHover(r.dish.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <td className="py-2">
                      <span className="font-medium">{r.dish.name}</span>
                      <span className="ml-2 text-muted-foreground text-xs">
                        {r.dish.category}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.dish.sales}
                    </td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">
                      {formatPercent(r.share)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatBRL(r.margin)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatBRL(r.margin * r.dish.sales)}
                    </td>
                    <td className="py-2 text-right">
                      <Badge
                        variant={
                          r.quadrant === "Abacaxi" ? "destructive" : "outline"
                        }
                      >
                        {r.quadrant}
                      </Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
