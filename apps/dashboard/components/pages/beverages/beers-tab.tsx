"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import {
  type Beer,
  beerCmv,
  beerServeCost,
  type SoftDrink,
  softCmv,
} from "@/lib/beverage-data";
import { formatBRL, formatBRLCents } from "@/lib/format";
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

export function BeersTab({
  beers,
  onUpdate,
}: {
  beers: Beer[];
  onUpdate: (id: string, patch: Partial<Beer>) => void;
}) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return beers.filter(
      (b) =>
        (format === ALL || b.format === format) &&
        (q === "" || normalize(`${b.name} ${b.brewery} ${b.style}`).includes(q))
    );
  }, [beers, query, format]);
  const selected = beers.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput
          onChange={setQuery}
          placeholder="Buscar cerveja, cervejaria ou estilo"
          value={query}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Todos os formatos" },
            { value: "Chope", label: "Chope" },
            { value: "Garrafa", label: "Garrafa" },
            { value: "Lata", label: "Lata" },
          ]}
          onChange={setFormat}
          value={format}
        />
      </div>
      <ChartCard
        description="Chope: custo por copo considera 8% de perda na linha"
        title="Cervejas"
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Cerveja</th>
                <th className="py-2 text-left font-normal">Estilo</th>
                <th className="py-2 text-right font-normal">ABV · IBU</th>
                <th className="py-2 text-left font-normal">Formato</th>
                <th className="py-2 text-right font-normal">Custo serv.</th>
                <th className="py-2 text-right font-normal">Preço</th>
                <th className="py-2 text-right font-normal">CMV</th>
                <th className="py-2 pl-4 text-left font-normal">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} {...rowProps(() => setSelectedId(b.id))}>
                  <td className="py-2">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {b.brewery} · {b.origin}
                    </p>
                  </td>
                  <td className="py-2 text-muted-foreground">{b.style}</td>
                  <td className="py-2 text-right tabular-nums">
                    {b.abv}% · {b.ibu}
                  </td>
                  <td className="py-2">
                    <Badge variant="secondary">
                      {b.format} {b.serveMl} ml
                    </Badge>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatBRLCents(beerServeCost(b))}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {formatBRL(b.price)}
                  </td>
                  <td className="py-2 text-right">
                    <CmvValue kind="cerveja" value={beerCmv(b)} />
                  </td>
                  <td className="py-2 pl-4">
                    <div className="flex items-center gap-2">
                      <StockBar min={b.min} par={b.par} stock={b.stock} />
                      <StockBadge min={b.min} stock={b.stock} />
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
              <Badge variant="secondary">{selected.format}</Badge>
              <Badge variant="outline">{selected.abv}% ABV</Badge>
              <Badge variant="outline">{selected.ibu} IBU</Badge>
            </>
          ) : null
        }
        kind="cerveja"
        onClose={() => setSelectedId(null)}
        open={selected !== null}
        subtitle={selected ? `${selected.brewery} · ${selected.style}` : ""}
        title={selected?.name ?? ""}
      >
        {selected ? (
          <>
            <AvailabilityRow
              available={selected.available}
              onChange={(v) => onUpdate(selected.id, { available: v })}
            />
            <SpecGrid
              specs={[
                ["Estilo", selected.style],
                ["Origem", selected.origin],
                ["Serviço", `${selected.serveMl} ml · ${selected.serviceTemp}`],
                [
                  "Unidade de estoque",
                  selected.kegLiters
                    ? `Barril ${selected.kegLiters} L`
                    : `${selected.format} ${selected.serveMl} ml`,
                ],
                ["Custo por serviço", formatBRLCents(beerServeCost(selected))],
                [
                  "CMV",
                  <CmvValue key="c" kind="cerveja" value={beerCmv(selected)} />,
                ],
                [
                  selected.kegLiters ? "Copos por barril" : "Lucro por unidade",
                  selected.kegLiters
                    ? Math.floor(
                        (selected.kegLiters * 1000 * 0.92) / selected.serveMl
                      )
                    : formatBRL(selected.price - selected.unitCost),
                ],
                ["Vendas no mês", selected.sales],
              ]}
            />
            <p className="text-muted-foreground text-sm">
              {selected.tastingNotes}
            </p>
            <EditFields
              fields={[
                {
                  key: "unitCost",
                  label: selected.kegLiters
                    ? "Custo do barril"
                    : "Custo unitário",
                  value: selected.unitCost,
                  step: 0.1,
                  suffix: "R$",
                },
                {
                  key: "price",
                  label: "Preço de venda",
                  value: selected.price,
                  step: 1,
                  suffix: "R$",
                },
                { key: "stock", label: "Estoque", value: selected.stock },
                { key: "par", label: "Estoque ideal", value: selected.par },
              ]}
              onChange={(key, v) =>
                onUpdate(selected.id, { [key]: v } as Partial<Beer>)
              }
            />
          </>
        ) : null}
      </ItemSheet>
    </div>
  );
}

export function SoftDrinksTab({
  items,
  onUpdate,
}: {
  items: SoftDrink[];
  onUpdate: (id: string, patch: Partial<SoftDrink>) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((n) => n.id === selectedId) ?? null;
  return (
    <div className="flex flex-col gap-4">
      <ChartCard
        description="Águas, refrigerantes, sucos, cafés e chás"
        title="Bebidas sem álcool"
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Item</th>
                <th className="py-2 text-left font-normal">Categoria</th>
                <th className="py-2 text-right font-normal">Custo</th>
                <th className="py-2 text-right font-normal">Preço</th>
                <th className="py-2 text-right font-normal">CMV</th>
                <th className="py-2 text-right font-normal">Vendas</th>
                <th className="py-2 pl-4 text-left font-normal">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id} {...rowProps(() => setSelectedId(n.id))}>
                  <td className="py-2">
                    <p className="font-medium">{n.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {n.volumeMl} ml
                    </p>
                  </td>
                  <td className="py-2">
                    <Badge variant="secondary">{n.category}</Badge>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatBRLCents(n.unitCost)}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {formatBRL(n.price)}
                  </td>
                  <td className="py-2 text-right">
                    <CmvValue kind="sem-alcool" value={softCmv(n)} />
                  </td>
                  <td className="py-2 text-right tabular-nums">{n.sales}</td>
                  <td className="py-2 pl-4">
                    <StockBar min={n.min} par={n.par} stock={n.stock} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <ItemSheet
        kind="sem-alcool"
        onClose={() => setSelectedId(null)}
        open={selected !== null}
        subtitle={
          selected ? `${selected.category} · ${selected.volumeMl} ml` : ""
        }
        title={selected?.name ?? ""}
      >
        {selected ? (
          <>
            <AvailabilityRow
              available={selected.available}
              onChange={(v) => onUpdate(selected.id, { available: v })}
            />
            <SpecGrid
              specs={[
                [
                  "CMV",
                  <CmvValue
                    key="c"
                    kind="sem-alcool"
                    value={softCmv(selected)}
                  />,
                ],
                [
                  "Lucro por unidade",
                  formatBRL(selected.price - selected.unitCost),
                ],
                ["Fornecedor", selected.supplier],
                ["Local", selected.location],
              ]}
            />
            <EditFields
              fields={[
                {
                  key: "unitCost",
                  label: "Custo",
                  value: selected.unitCost,
                  step: 0.1,
                  suffix: "R$",
                },
                {
                  key: "price",
                  label: "Preço",
                  value: selected.price,
                  step: 0.5,
                  suffix: "R$",
                },
                { key: "stock", label: "Estoque", value: selected.stock },
                { key: "par", label: "Estoque ideal", value: selected.par },
              ]}
              onChange={(key, v) =>
                onUpdate(selected.id, { [key]: v } as Partial<SoftDrink>)
              }
            />
          </>
        ) : null}
      </ItemSheet>
    </div>
  );
}
