"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import {
  FilterSelect,
  normalize,
  SearchInput,
} from "@/components/pages/beverages/bev-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCellar } from "@/lib/cellar/store";
import { Icon } from "@/lib/icons";
import { duplicateCandidates } from "@/lib/invoices/match";
import {
  mergeIngredients,
  removeIngredient,
  updateIngredient,
  useInvoices,
} from "@/lib/invoices/store";
import {
  type BaseUnit,
  categoryLabel,
  INGREDIENT_CATEGORIES,
  type Ingredient,
} from "@/lib/invoices/types";

const ALL = "todas";
const NONE = "__none__";

function Duplicates({ ingredients }: { ingredients: Ingredient[] }) {
  const pairs = useMemo(
    () => duplicateCandidates(ingredients).slice(0, 12),
    [ingredients]
  );
  if (pairs.length === 0) {
    return null;
  }
  return (
    <ChartCard
      description="Nomes diferentes que parecem o mesmo produto. Juntar mantém o primeiro e passa todas as compras para ele."
      title="Possíveis duplicados"
    >
      <ul className="flex flex-col gap-2">
        {pairs.map(({ a, b, score }) => (
          <li
            className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            key={`${a.id}-${b.id}`}
          >
            <span className="font-medium">{a.name}</span>
            <Icon className="size-3.5" name="IconArrowsRepeatRightLeft" />
            <span className="font-medium">{b.name}</span>
            <span className="text-muted-foreground text-xs">
              {Math.round(score * 100)}% parecidos
            </span>
            <div className="ml-auto flex gap-1.5">
              <Button
                onClick={() => mergeIngredients(a.id, b.id)}
                size="xs"
                variant="outline"
              >
                Juntar em “{a.name}”
              </Button>
              <Button
                onClick={() => mergeIngredients(b.id, a.id)}
                size="xs"
                variant="ghost"
              >
                em “{b.name}”
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

function IngredientRow({
  ing,
  ingredients,
  wines,
  usage,
}: {
  ing: Ingredient;
  ingredients: Ingredient[];
  wines: { id: string; name: string }[];
  usage: number;
}) {
  const set = (patch: Partial<Ingredient>) => updateIngredient(ing.id, patch);
  return (
    <tr className="border-border/50 border-b align-top last:border-0">
      <td className="py-2 pr-2">
        <Input
          aria-label="Nome do ingrediente"
          className="h-8 font-medium"
          onChange={(e) => set({ name: e.target.value })}
          value={ing.name}
        />
        <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
          {ing.aliases.length} nome(s) aprendido(s)
          {ing.aliases.length ? `: ${ing.aliases.slice(0, 4).join(" · ")}` : ""}
          {ing.eans.length ? ` · EAN ${ing.eans.join(", ")}` : ""}
        </p>
      </td>
      <td className="py-2 pr-2">
        <FilterSelect
          className="sm:w-36"
          items={INGREDIENT_CATEGORIES.map((c) => ({
            value: c.value,
            label: c.label,
          }))}
          onChange={(category) => set({ category })}
          value={ing.category}
        />
      </td>
      <td className="py-2 pr-2">
        <FilterSelect
          className="sm:w-20"
          items={[
            { value: "kg", label: "kg" },
            { value: "l", label: "L" },
            { value: "un", label: "un" },
          ]}
          onChange={(v) => set({ baseUnit: v as BaseUnit })}
          value={ing.baseUnit}
        />
      </td>
      <td className="py-2 pr-2">
        {ing.category === "wine" ? (
          <FilterSelect
            className="sm:w-44"
            items={[
              { value: NONE, label: "Vinho da Adega…" },
              ...wines.map((w) => ({ value: w.id, label: w.name })),
            ]}
            onChange={(v) => set({ wineId: v === NONE ? undefined : v })}
            value={ing.wineId ?? NONE}
          />
        ) : (
          <FilterSelect
            className="sm:w-44"
            items={[
              { value: NONE, label: "Juntar com…" },
              ...ingredients
                .filter((i) => i.id !== ing.id)
                .map((i) => ({ value: i.id, label: i.name })),
            ]}
            onChange={(v) => {
              if (v !== NONE) {
                mergeIngredients(v, ing.id);
              }
            }}
            value={NONE}
          />
        )}
      </td>
      <td className="py-2 text-right text-muted-foreground text-xs tabular-nums">
        {usage}
      </td>
      <td className="py-2 pl-2 text-right">
        <ConfirmButton
          confirmLabel="Apagar?"
          onConfirm={() => removeIngredient(ing.id)}
        />
      </td>
    </tr>
  );
}

/**
 * The canonical ingredient catalog shared by every company: each one
 * learns the names and barcodes used by each supplier.
 */
export function IngredientsTab() {
  const { ingredients, invoices } = useInvoices();
  const { wines } = useCellar();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      for (const l of inv.lines) {
        if (l.ingredientId) {
          map.set(l.ingredientId, (map.get(l.ingredientId) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [invoices]);

  const list = useMemo(() => {
    const q = normalize(query);
    return ingredients
      .filter(
        (i) =>
          (category === ALL || i.category === category) &&
          (!q || normalize(`${i.name} ${i.aliases.join(" ")}`).includes(q))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients, query, category]);

  if (ingredients.length === 0) {
    return (
      <ChartCard
        description="Os ingredientes são criados quando você aprova a primeira nota fiscal."
        title="Nenhum ingrediente ainda"
      >
        <p className="text-muted-foreground text-sm">
          Lance uma nota na aba Notas fiscais.
        </p>
      </ChartCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Duplicates ingredients={ingredients} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput
          onChange={setQuery}
          placeholder="Buscar ingrediente ou nome usado na nota"
          value={query}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Todas as categorias" },
            ...INGREDIENT_CATEGORIES.map((c) => ({
              value: c.value,
              label: c.label,
            })),
          ]}
          onChange={setCategory}
          value={category}
        />
      </div>
      <ChartCard
        description={`${list.length} de ${ingredients.length} · ${categoryLabel(category === ALL ? "" : category) || "todas as categorias"}`}
        title="Catálogo de ingredientes"
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Ingrediente</th>
                <th className="py-2 text-left font-normal">Categoria</th>
                <th className="py-2 text-left font-normal">Unidade</th>
                <th className="py-2 text-left font-normal">Vínculo</th>
                <th className="py-2 text-right font-normal">Linhas</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((ing) => (
                <IngredientRow
                  ing={ing}
                  ingredients={ingredients}
                  key={ing.id}
                  usage={usage.get(ing.id) ?? 0}
                  wines={wines}
                />
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
