"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import {
  type Spirit,
  type SpiritCategory,
  spiritBottleRevenue,
  spiritCostPerMl,
  spiritDoseCost,
  spiritDoses,
  spiritPourCost,
} from "@/lib/beverage-data";
import { formatBRL, formatBRLCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AvailabilityRow,
  CmvValue,
  EditFields,
  FilterSelect,
  ItemSheet,
  normalize,
  rowProps,
  SearchInput,
  SpecGrid,
  StockBadge,
  StockBar,
} from "./bev-shared";

const ALL = "todos";

function OpenBottle({ level }: { level: number }) {
  return (
    <span
      className="flex items-center gap-1.5"
      title={`Garrafa aberta: ${level}%`}
    >
      <span className="relative h-5 w-2.5 overflow-hidden rounded-sm border border-foreground/40">
        <span
          className={cn(
            "absolute inset-x-0 bottom-0",
            level < 25
              ? "bg-destructive"
              : "bg-[var(--chart-1)] dark:bg-foreground"
          )}
          style={{ height: `${level}%` }}
        />
      </span>
      <span className="text-xs tabular-nums">{level}%</span>
    </span>
  );
}

export function SpiritsTab({
  spirits,
  onUpdate,
}: {
  spirits: Spirit[];
  onUpdate: (id: string, patch: Partial<Spirit>) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const categories = useMemo(
    () =>
      [...new Set(spirits.map((s) => s.category))].sort() as SpiritCategory[],
    [spirits]
  );
  const filtered = useMemo(() => {
    const q = normalize(query);
    return spirits.filter(
      (s) =>
        (category === ALL || s.category === category) &&
        (q === "" || normalize(`${s.name} ${s.brand} ${s.origin}`).includes(q))
    );
  }, [spirits, query, category]);

  const selected = spirits.find((s) => s.id === selectedId) ?? null;
  const value = filtered.reduce(
    (a, s) => a + s.stock * s.bottleCost + (s.openLevel / 100) * s.bottleCost,
    0
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput
          onChange={setQuery}
          placeholder="Buscar destilado, marca ou origem"
          value={query}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Todas as categorias" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          onChange={setCategory}
          value={category}
        />
      </div>

      <ChartCard
        description={`${filtered.length} rótulos · back bar avaliado em ${formatBRL(value)} (custo, incluindo garrafas abertas)`}
        title="Destilados e licores"
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Rótulo</th>
                <th className="py-2 text-left font-normal">Categoria</th>
                <th className="py-2 text-right font-normal">Garrafa</th>
                <th className="py-2 text-right font-normal">Doses</th>
                <th className="py-2 text-right font-normal">Custo dose</th>
                <th className="py-2 text-right font-normal">Preço dose</th>
                <th className="py-2 text-right font-normal">Pour cost</th>
                <th className="py-2 pl-4 text-left font-normal">Aberta</th>
                <th className="py-2 text-left font-normal">Fechadas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} {...rowProps(() => setSelectedId(s.id))}>
                  <td className="py-2">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {s.origin} · {s.abv}% · {s.volumeMl} ml
                      {s.age ? ` · ${s.age}` : ""}
                    </p>
                  </td>
                  <td className="py-2">
                    <Badge variant="secondary">{s.category}</Badge>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatBRL(s.bottleCost)}
                  </td>
                  <td className="py-2 text-right text-muted-foreground tabular-nums">
                    {spiritDoses(s)} × {s.doseMl} ml
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatBRLCents(spiritDoseCost(s))}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {formatBRL(s.dosePrice)}
                  </td>
                  <td className="py-2 text-right">
                    <CmvValue kind="destilado" value={spiritPourCost(s)} />
                  </td>
                  <td className="py-2 pl-4">
                    <OpenBottle level={s.openLevel} />
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <StockBar min={s.min} par={s.par} stock={s.stock} />
                      <StockBadge min={s.min} stock={s.stock} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ItemSheet
        badges={
          selected ? (
            <>
              <Badge variant="secondary">{selected.category}</Badge>
              <Badge variant="outline">{selected.abv}% ABV</Badge>
              {selected.age ? (
                <Badge variant="outline">{selected.age}</Badge>
              ) : null}
              <Badge variant="outline">{selected.id}</Badge>
            </>
          ) : null
        }
        kind="destilado"
        onClose={() => setSelectedId(null)}
        open={selected !== null}
        subtitle={selected ? `${selected.brand} · ${selected.origin}` : ""}
        title={selected?.name ?? ""}
      >
        {selected ? (
          <>
            <AvailabilityRow
              available={selected.available}
              onChange={(v) => onUpdate(selected.id, { available: v })}
            />
            <div>
              <p className="mb-2 font-medium text-sm">Especificações</p>
              <SpecGrid
                specs={[
                  ["Volume da garrafa", `${selected.volumeMl} ml`],
                  ["Teor alcoólico", `${selected.abv}%`],
                  ["Envelhecimento", selected.age ?? "Não envelhecido"],
                  ["Dose padrão", `${selected.doseMl} ml`],
                  [
                    "Garrafa aberta",
                    <OpenBottle key="o" level={selected.openLevel} />,
                  ],
                  ["Fornecedor", selected.supplier],
                ]}
              />
              <p className="mt-2 text-muted-foreground text-sm">
                {selected.tastingNotes}
              </p>
            </div>
            <div>
              <p className="mb-2 font-medium text-sm">Custo e margem</p>
              <SpecGrid
                specs={[
                  ["Custo por ml", formatBRLCents(spiritCostPerMl(selected))],
                  ["Custo da dose", formatBRLCents(spiritDoseCost(selected))],
                  [
                    "Pour cost",
                    <CmvValue
                      key="p"
                      kind="destilado"
                      value={spiritPourCost(selected)}
                    />,
                  ],
                  ["Doses por garrafa", spiritDoses(selected)],
                  [
                    "Receita por garrafa",
                    formatBRL(spiritBottleRevenue(selected)),
                  ],
                  [
                    "Lucro por garrafa",
                    formatBRL(
                      spiritBottleRevenue(selected) - selected.bottleCost
                    ),
                  ],
                ]}
              />
              <p className="mt-2 text-muted-foreground text-xs">
                {selected.sales} doses no mês (puras + em coquetéis). Meta de
                pour cost para destilados: até 20%.
              </p>
            </div>
            <div>
              <p className="mb-2 font-medium text-sm">Editar</p>
              <EditFields
                fields={[
                  {
                    key: "bottleCost",
                    label: "Custo garrafa",
                    value: selected.bottleCost,
                    step: 0.5,
                    suffix: "R$",
                  },
                  {
                    key: "dosePrice",
                    label: "Preço dose",
                    value: selected.dosePrice,
                    step: 1,
                    suffix: "R$",
                  },
                  {
                    key: "doseMl",
                    label: "Dose",
                    value: selected.doseMl,
                    step: 5,
                    suffix: "ml",
                  },
                  {
                    key: "openLevel",
                    label: "Nível garrafa aberta",
                    value: selected.openLevel,
                    step: 5,
                    suffix: "%",
                  },
                  {
                    key: "stock",
                    label: "Garrafas fechadas",
                    value: selected.stock,
                  },
                  { key: "par", label: "Estoque ideal", value: selected.par },
                ]}
                onChange={(key, v) =>
                  onUpdate(selected.id, {
                    [key]: key === "openLevel" ? Math.min(100, v) : v,
                  } as Partial<Spirit>)
                }
              />
            </div>
          </>
        ) : null}
      </ItemSheet>
    </div>
  );
}
