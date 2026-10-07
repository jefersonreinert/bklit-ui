"use client";

import { type FormEvent, useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type Cocktail,
  type CocktailIngredient,
  cmvTargets,
  cocktailAbv,
  cocktailCmv,
  cocktailCost,
  type Spirit,
  spiritCostPerMl,
} from "@/lib/beverage-data";
import { formatBRL, formatBRLCents, formatPercent } from "@/lib/format";
import { Icon } from "@/lib/icons";
import {
  AvailabilityRow,
  CmvValue,
  EditFields,
  FilterSelect,
  ItemSheet,
  normalize,
  SearchInput,
  SpecGrid,
} from "./bev-shared";

const ALL = "todos";
const FAMILIES: Cocktail["family"][] = [
  "Clássico",
  "Autoral",
  "Tiki",
  "Sem álcool",
];
const METHODS: Cocktail["method"][] = [
  "Batido",
  "Mexido",
  "Montado",
  "Macerado",
];

function ingredientCost(i: CocktailIngredient, spirits: Spirit[]) {
  if (i.spiritId && i.ml) {
    const s = spirits.find((x) => x.id === i.spiritId);
    return s ? spiritCostPerMl(s) * i.ml : 0;
  }
  return i.cost ?? 0;
}

function RecipeTable({
  cocktail,
  spirits,
}: {
  cocktail: Pick<Cocktail, "ingredients">;
  spirits: Spirit[];
}) {
  const total = cocktail.ingredients.reduce(
    (a, i) => a + ingredientCost(i, spirits),
    0
  );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-muted-foreground text-xs">
          <th className="py-1.5 text-left font-normal">Ingrediente</th>
          <th className="py-1.5 text-right font-normal">Medida</th>
          <th className="py-1.5 text-right font-normal">Custo</th>
        </tr>
      </thead>
      <tbody>
        {cocktail.ingredients.map((i) => {
          const s = i.spiritId
            ? spirits.find((x) => x.id === i.spiritId)
            : undefined;
          return (
            <tr
              className="border-border/50 border-b"
              key={`${i.name}-${i.spiritId ?? ""}`}
            >
              <td className="py-1.5">
                {s ? s.name : i.name}
                {s ? (
                  <span className="block text-muted-foreground text-xs">
                    {s.category} · estoque
                  </span>
                ) : null}
              </td>
              <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                {i.ml ? `${i.ml} ml` : "—"}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {formatBRLCents(ingredientCost(i, spirits))}
              </td>
            </tr>
          );
        })}
        <tr className="font-medium">
          <td className="py-1.5">Custo total</td>
          <td />
          <td className="py-1.5 text-right tabular-nums">
            {formatBRLCents(total)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

interface DraftRow {
  key: number;
  spiritId: string;
  ml: number;
  name: string;
  cost: number;
}

function CocktailBuilder({
  open,
  onOpenChange,
  spirits,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spirits: Spirit[];
  onCreate: (c: Cocktail) => void;
}) {
  const [rows, setRows] = useState<DraftRow[]>([
    { key: 1, spiritId: spirits[0]?.id ?? "", ml: 50, name: "", cost: 0 },
    { key: 2, spiritId: "", ml: 0, name: "Suco de limão", cost: 0.8 },
  ]);
  const [price, setPrice] = useState(38);
  const [family, setFamily] = useState<Cocktail["family"]>("Autoral");
  const [method, setMethod] = useState<Cocktail["method"]>("Batido");

  const ingredients: CocktailIngredient[] = rows
    .filter((r) => r.spiritId || r.name)
    .map((r) =>
      r.spiritId
        ? {
            spiritId: r.spiritId,
            name: spirits.find((s) => s.id === r.spiritId)?.name ?? "",
            ml: r.ml,
          }
        : { name: r.name, cost: r.cost }
    );
  const draft: Cocktail = {
    id: "draft",
    kind: "coquetel",
    name: "",
    family,
    method,
    glass: "",
    garnish: "",
    ice: "",
    prepMinutes: 4,
    ingredients,
    price,
    sales: 0,
    description: "",
    available: true,
  };
  const cost = cocktailCost(draft, spirits);
  const target = cmvTargets.coquetel;
  const suggested = Math.ceil(cost / (target / 100));

  const spiritItems = [
    { value: "", label: "Outro (fruta, xarope…)" },
    ...spirits.map((s) => ({
      value: s.id,
      label: `${s.name} · ${formatBRLCents(spiritCostPerMl(s) * 10)}/10 ml`,
    })),
  ];

  const setRow = (key: number, patch: Partial<DraftRow>) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name || ingredients.length === 0) {
      return;
    }
    onCreate({
      ...draft,
      id: `K${Math.floor(100 + Math.random() * 899)}`,
      name,
      glass: String(form.get("glass") ?? "") || "Coupe",
      garnish: String(form.get("garnish") ?? "") || "—",
      ice: method === "Batido" ? "Batido no gelo" : "Cubos",
      description: String(form.get("description") ?? ""),
    });
    onOpenChange(false);
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-xl!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Criar coquetel</SheetTitle>
          <SheetDescription>
            Ingredientes do estoque usam o custo real por ml · meta de CMV{" "}
            {target}%
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-col gap-4 p-5" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="ck-name">Nome</Label>
              <Input
                id="ck-name"
                name="name"
                placeholder="Ex.: Brasa Sour"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Família</Label>
              <FilterSelect
                className="sm:w-full"
                items={FAMILIES.map((f) => ({ value: f, label: f }))}
                onChange={(v) => setFamily(v as Cocktail["family"])}
                value={family}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Método</Label>
              <FilterSelect
                className="sm:w-full"
                items={METHODS.map((m) => ({ value: m, label: m }))}
                onChange={(v) => setMethod(v as Cocktail["method"])}
                value={method}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ck-glass">Copo</Label>
              <Input id="ck-glass" name="glass" placeholder="Coupe" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ck-garnish">Guarnição</Label>
              <Input
                id="ck-garnish"
                name="garnish"
                placeholder="Casca de limão"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="font-medium text-sm">Receita</p>
            {rows.map((r) => (
              <div
                className="grid grid-cols-[1fr_90px_auto] items-end gap-2"
                key={r.key}
              >
                <div className="flex flex-col gap-1.5">
                  <FilterSelect
                    className="sm:w-full"
                    items={spiritItems}
                    onChange={(v) =>
                      setRow(r.key, { spiritId: v, ml: v ? r.ml || 50 : 0 })
                    }
                    value={r.spiritId}
                  />
                  {r.spiritId ? null : (
                    <Input
                      aria-label="Nome do ingrediente"
                      onChange={(e) => setRow(r.key, { name: e.target.value })}
                      placeholder="Ingrediente"
                      value={r.name}
                    />
                  )}
                </div>
                {r.spiritId ? (
                  <Input
                    aria-label="Mililitros"
                    min={0}
                    onChange={(e) =>
                      setRow(r.key, { ml: Number(e.target.value) || 0 })
                    }
                    placeholder="ml"
                    step={5}
                    type="number"
                    value={r.ml}
                  />
                ) : (
                  <Input
                    aria-label="Custo (R$)"
                    min={0}
                    onChange={(e) =>
                      setRow(r.key, { cost: Number(e.target.value) || 0 })
                    }
                    placeholder="R$"
                    step={0.1}
                    type="number"
                    value={r.cost}
                  />
                )}
                <Button
                  aria-label="Remover ingrediente"
                  onClick={() =>
                    setRows((prev) => prev.filter((x) => x.key !== r.key))
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Icon className="size-4" name="IconCrossSmall" />
                </Button>
              </div>
            ))}
            <Button
              onClick={() =>
                setRows((prev) => [
                  ...prev,
                  { key: Date.now(), spiritId: "", ml: 0, name: "", cost: 0 },
                ])
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <Icon className="size-4" name="IconPlusMedium" />
              Adicionar ingrediente
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground text-xs">Custo</p>
              <p className="font-semibold tabular-nums">
                {formatBRLCents(cost)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">CMV</p>
              <CmvValue
                kind="coquetel"
                value={price > 0 ? (cost / price) * 100 : null}
              />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Teor aprox.</p>
              <p className="font-medium tabular-nums">
                {formatPercent(cocktailAbv(draft, spirits))}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Preço sugerido</p>
              <button
                className="font-semibold tabular-nums underline-offset-2 hover:underline"
                onClick={() => setPrice(suggested)}
                type="button"
              >
                {formatBRL(suggested)}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ck-price">Preço de venda (R$)</Label>
            <Input
              id="ck-price"
              min={1}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              step={1}
              type="number"
              value={price}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ck-desc">Descrição na carta</Label>
            <Input
              id="ck-desc"
              name="description"
              placeholder="Ingredientes em destaque"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button className="flex-1" type="submit">
              <Icon className="size-4" name="IconCocktail" />
              Salvar na carta
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function CocktailsTab({
  cocktails,
  spirits,
  onUpdate,
  onCreate,
}: {
  cocktails: Cocktail[];
  spirits: Spirit[];
  onUpdate: (id: string, patch: Partial<Cocktail>) => void;
  onCreate: (c: Cocktail) => void;
}) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return cocktails.filter(
      (c) =>
        (family === ALL || c.family === family) &&
        (q === "" || normalize(`${c.name} ${c.description}`).includes(q))
    );
  }, [cocktails, query, family]);
  const selected = cocktails.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput
          onChange={setQuery}
          placeholder="Buscar coquetel ou ingrediente"
          value={query}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Todas as famílias" },
            ...FAMILIES.map((f) => ({ value: f, label: f })),
          ]}
          onChange={setFamily}
          value={family}
        />
        <Button onClick={() => setBuilderOpen(true)}>
          <Icon className="size-4" name="IconPlusMedium" />
          Criar coquetel
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => {
          const cost = cocktailCost(c, spirits);
          return (
            <Card className="min-w-0 gap-3 px-4 py-4" key={c.id}>
              <button
                className="text-left"
                onClick={() => setSelectedId(c.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium hover:underline">{c.name}</p>
                  <Badge variant="secondary">{c.family}</Badge>
                </div>
                <p className="line-clamp-2 text-muted-foreground text-xs">
                  {c.description}
                </p>
              </button>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge variant="outline">{c.method}</Badge>
                <Badge variant="outline">{c.glass}</Badge>
                <Badge variant="outline">
                  {formatPercent(cocktailAbv(c, spirits), 0)} ABV
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-2.5 text-xs">
                <div>
                  <p className="text-muted-foreground">Preço</p>
                  <p className="font-semibold text-sm tabular-nums">
                    {formatBRL(c.price)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Custo</p>
                  <p className="font-medium text-sm tabular-nums">
                    {formatBRLCents(cost)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">CMV</p>
                  <CmvValue
                    className="text-sm"
                    kind="coquetel"
                    value={cocktailCmv(c, spirits)}
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                {c.sales} vendidos · lucro no mês{" "}
                {formatBRL(c.sales * (c.price - cost))}
              </p>
            </Card>
          );
        })}
      </div>

      <ChartCard
        description="Custo dos destilados vem do estoque (custo da garrafa ÷ ml)"
        title="Resumo de margem"
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Coquetel</th>
                <th className="py-2 text-right font-normal">Custo</th>
                <th className="py-2 text-right font-normal">Preço</th>
                <th className="py-2 text-right font-normal">CMV</th>
                <th className="py-2 text-right font-normal">Lucro un.</th>
                <th className="py-2 text-right font-normal">Vendas</th>
                <th className="py-2 text-right font-normal">Lucro mês</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered]
                .sort(
                  (a, b) =>
                    b.sales * (b.price - cocktailCost(b, spirits)) -
                    a.sales * (a.price - cocktailCost(a, spirits))
                )
                .map((c) => {
                  const cost = cocktailCost(c, spirits);
                  return (
                    <tr
                      className="border-border/50 border-b last:border-0"
                      key={c.id}
                    >
                      <td className="py-2 font-medium">{c.name}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatBRLCents(cost)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatBRL(c.price)}
                      </td>
                      <td className="py-2 text-right">
                        <CmvValue
                          kind="coquetel"
                          value={cocktailCmv(c, spirits)}
                        />
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatBRLCents(c.price - cost)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {c.sales}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {formatBRL(c.sales * (c.price - cost))}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ItemSheet
        badges={
          selected ? (
            <>
              <Badge variant="secondary">{selected.family}</Badge>
              <Badge variant="outline">{selected.method}</Badge>
              <Badge variant="outline">{selected.prepMinutes} min</Badge>
            </>
          ) : null
        }
        kind="coquetel"
        onClose={() => setSelectedId(null)}
        open={selected !== null}
        subtitle={selected?.description ?? ""}
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
                ["Copo", selected.glass],
                ["Gelo", selected.ice],
                ["Guarnição", selected.garnish],
                [
                  "Teor aproximado",
                  formatPercent(cocktailAbv(selected, spirits)),
                ],
              ]}
            />
            <div>
              <p className="mb-2 font-medium text-sm">Ficha técnica</p>
              <RecipeTable cocktail={selected} spirits={spirits} />
            </div>
            <SpecGrid
              specs={[
                [
                  "CMV",
                  <CmvValue
                    key="c"
                    kind="coquetel"
                    value={cocktailCmv(selected, spirits)}
                  />,
                ],
                [
                  "Lucro por drink",
                  formatBRLCents(
                    selected.price - cocktailCost(selected, spirits)
                  ),
                ],
                [
                  "Preço p/ CMV 22%",
                  formatBRL(Math.ceil(cocktailCost(selected, spirits) / 0.22)),
                ],
                ["Vendas no mês", selected.sales],
              ]}
            />
            <EditFields
              fields={[
                {
                  key: "price",
                  label: "Preço de venda",
                  value: selected.price,
                  step: 1,
                  suffix: "R$",
                },
              ]}
              onChange={(key, v) =>
                onUpdate(selected.id, { [key]: v } as Partial<Cocktail>)
              }
            />
          </>
        ) : null}
      </ItemSheet>

      <CocktailBuilder
        onCreate={onCreate}
        onOpenChange={setBuilderOpen}
        open={builderOpen}
        spirits={spirits}
      />
    </div>
  );
}
