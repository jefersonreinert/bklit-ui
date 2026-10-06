"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import {
  GLASSES_PER_BOTTLE,
  type Wine,
  type WineStyle,
  wineCmv,
  wineGlassCmv,
  wineGlassCost,
  wineMarkup,
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
const STYLES: WineStyle[] = [
  "Tinto",
  "Branco",
  "Rosé",
  "Espumante",
  "Sobremesa",
];

export function WinesTab({
  wines,
  onUpdate,
}: {
  wines: Wine[];
  onUpdate: (id: string, patch: Partial<Wine>) => void;
}) {
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState(ALL);
  const [country, setCountry] = useState(ALL);
  const [service, setService] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const countries = useMemo(
    () => [...new Set(wines.map((w) => w.country))].sort(),
    [wines]
  );
  const filtered = useMemo(() => {
    const q = normalize(query);
    return wines.filter(
      (w) =>
        (style === ALL || w.style === style) &&
        (country === ALL || w.country === country) &&
        (service === ALL ||
          (service === "taca"
            ? w.glassPrice !== null
            : w.glassPrice === null)) &&
        (q === "" ||
          normalize(
            `${w.name} ${w.producer} ${w.region} ${w.grapes.join(" ")}`
          ).includes(q))
    );
  }, [wines, query, style, country, service]);

  const selected = wines.find((w) => w.id === selectedId) ?? null;
  const cellarValue = filtered.reduce((a, w) => a + w.stock * w.bottleCost, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          onChange={setQuery}
          placeholder="Buscar vinho, produtor, uva ou região"
          value={query}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Todos os estilos" },
            ...STYLES.map((s) => ({ value: s, label: s })),
          ]}
          onChange={setStyle}
          value={style}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Todos os países" },
            ...countries.map((c) => ({ value: c, label: c })),
          ]}
          onChange={setCountry}
          value={country}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Garrafa e taça" },
            { value: "taca", label: "Vende em taça" },
            { value: "garrafa", label: "Só garrafa" },
          ]}
          onChange={setService}
          value={service}
        />
      </div>

      <ChartCard
        description={`${filtered.length} rótulos · adega avaliada em ${formatBRL(cellarValue)} (custo)`}
        title="Carta de vinhos"
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Vinho</th>
                <th className="py-2 text-left font-normal">Estilo · uvas</th>
                <th className="py-2 text-left font-normal">Origem</th>
                <th className="py-2 text-right font-normal">Custo</th>
                <th className="py-2 text-right font-normal">Garrafa</th>
                <th className="py-2 text-right font-normal">CMV</th>
                <th className="py-2 text-right font-normal">Taça</th>
                <th className="py-2 text-right font-normal">CMV taça</th>
                <th className="py-2 pl-4 text-left font-normal">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} {...rowProps(() => setSelectedId(w.id))}>
                  <td className="py-2">
                    <p className="font-medium">
                      {w.name}{" "}
                      {w.vintage ? (
                        <span className="text-muted-foreground">
                          {w.vintage}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {w.producer}
                    </p>
                  </td>
                  <td className="py-2">
                    <Badge variant="secondary">{w.style}</Badge>
                    <p className="mt-0.5 max-w-48 truncate text-muted-foreground text-xs">
                      {w.grapes.join(", ")}
                    </p>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {w.country}
                    <span className="block text-xs">{w.region}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatBRL(w.bottleCost)}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {formatBRL(w.bottlePrice)}
                  </td>
                  <td className="py-2 text-right">
                    <CmvValue kind="vinho" value={wineCmv(w)} />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {w.glassPrice ? formatBRL(w.glassPrice) : "—"}
                  </td>
                  <td className="py-2 text-right">
                    <CmvValue kind="vinho" value={wineGlassCmv(w)} />
                  </td>
                  <td className="py-2 pl-4">
                    <div className="flex items-center gap-2">
                      <StockBar min={w.min} par={w.par} stock={w.stock} />
                      <StockBadge min={w.min} stock={w.stock} />
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
              <Badge variant="secondary">{selected.style}</Badge>
              <Badge variant="outline">{selected.body}</Badge>
              <Badge variant="outline">{selected.sweetness}</Badge>
              {selected.score ? (
                <Badge variant="outline">{selected.score} pts</Badge>
              ) : null}
              <Badge variant="outline">{selected.id}</Badge>
            </>
          ) : null
        }
        kind="vinho"
        onClose={() => setSelectedId(null)}
        open={selected !== null}
        subtitle={
          selected
            ? `${selected.producer} · ${selected.region}, ${selected.country}`
            : ""
        }
        title={
          selected
            ? `${selected.name}${selected.vintage ? ` ${selected.vintage}` : ""}`
            : ""
        }
      >
        {selected ? (
          <>
            <AvailabilityRow
              available={selected.available}
              onChange={(v) => onUpdate(selected.id, { available: v })}
            />
            <div>
              <p className="mb-2 font-medium text-sm">Ficha do vinho</p>
              <SpecGrid
                specs={[
                  ["Uvas", selected.grapes.join(", ")],
                  ["Safra", selected.vintage ?? "Não safrado (NV)"],
                  ["Teor alcoólico", `${selected.abv}%`],
                  ["Volume", `${selected.volumeMl} ml`],
                  ["Temperatura de serviço", selected.serviceTemp],
                  ["Decantação", selected.decant ?? "Não necessária"],
                  ["Localização", selected.location],
                  ["Fornecedor", selected.supplier],
                ]}
              />
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <p className="font-medium">Notas de degustação</p>
              <p className="text-muted-foreground">{selected.tastingNotes}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {selected.pairing.map((p) => (
                  <Badge key={p} variant="outline">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 font-medium text-sm">Custo e margem</p>
              <SpecGrid
                specs={[
                  [
                    "CMV garrafa",
                    <CmvValue key="c" kind="vinho" value={wineCmv(selected)} />,
                  ],
                  [
                    "Markup",
                    `${wineMarkup(selected).toFixed(2).replace(".", ",")}x`,
                  ],
                  [
                    "Lucro por garrafa",
                    formatBRL(selected.bottlePrice - selected.bottleCost),
                  ],
                  [
                    `Custo da taça (1/${GLASSES_PER_BOTTLE})`,
                    formatBRLCents(wineGlassCost(selected)),
                  ],
                  [
                    "CMV taça",
                    <CmvValue
                      key="t"
                      kind="vinho"
                      value={wineGlassCmv(selected)}
                    />,
                  ],
                  [
                    "Lucro no mês",
                    formatBRL(
                      selected.sales *
                        (selected.bottlePrice - selected.bottleCost) +
                        (selected.glassPrice
                          ? selected.glassesSold *
                            (selected.glassPrice - wineGlassCost(selected))
                          : 0)
                    ),
                  ],
                ]}
              />
              <p className="mt-2 text-muted-foreground text-xs">
                {selected.sales} garrafas e {selected.glassesSold} taças
                vendidas no mês.
              </p>
            </div>
            <div>
              <p className="mb-2 font-medium text-sm">
                Editar preços e estoque
              </p>
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
                    key: "bottlePrice",
                    label: "Preço garrafa",
                    value: selected.bottlePrice,
                    step: 1,
                    suffix: "R$",
                  },
                  {
                    key: "glassPrice",
                    label: "Preço taça",
                    value: selected.glassPrice ?? 0,
                    step: 1,
                    suffix: "0 = não vende",
                  },
                  {
                    key: "stock",
                    label: "Estoque",
                    value: selected.stock,
                    suffix: "gfa",
                  },
                  { key: "par", label: "Estoque ideal", value: selected.par },
                  {
                    key: "min",
                    label: "Ponto de reposição",
                    value: selected.min,
                  },
                ]}
                onChange={(key, value) =>
                  onUpdate(selected.id, {
                    [key]: key === "glassPrice" && value === 0 ? null : value,
                  } as Partial<Wine>)
                }
              />
            </div>
          </>
        ) : null}
      </ItemSheet>
    </div>
  );
}
