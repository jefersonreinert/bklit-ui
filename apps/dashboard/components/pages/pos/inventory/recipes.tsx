"use client";

import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type CostRecipe,
  DEFAULT_TARGETS,
  grossMargin,
  RECIPE_CATEGORIES,
  recipeCost,
  suggestedPrice,
} from "@/lib/inventory/costing";
import type { InvUnit } from "@/lib/inventory/units";
import { sendPos, useCompany, usePos, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import {
  CARD,
  Field,
  type InvOverview,
  NumberInput,
  num,
  Pill,
  SELECT,
  Tag,
  useMoney,
} from "./shared";

/**
 * Technical sheets: what goes in each drink and dish, its cost (live from
 * the bar's average costs, so an invoice that raises a price shows here
 * at once), the margin on the menu price and a suggested price. Preps
 * (syrups, sauces, batches) are recipes used inside other recipes.
 */

type RecipeList = FunctionReturnType<typeof api.recipes.list>;
type Recipe = RecipeList["recipes"][number];
type Kind = "menu" | "prep";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const catLabel = (c: string) => RECIPE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

function gpTone(gp: number | null, target: number) {
  if (gp === null) {
    return "text-muted-foreground";
  }
  if (gp < target - 0.05) {
    return "text-destructive";
  }
  return gp < target ? "text-amber-600 dark:text-amber-400" : "text-emerald-600";
}

export function RecipesSection({ data }: { data: InvOverview }) {
  const company = useCompany();
  const fmt = useMoney();
  const list = usePosQuery(api.recipes.list, { company });
  const [kind, setKind] = useState<Kind>("menu");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Recipe | Kind | null>(null);
  const [importing, setImporting] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list?.recipes ?? [])
      .filter((r) => r.active && r.kind === kind && (!cat || r.category === cat))
      .filter((r) => !s || r.name.toLowerCase().includes(s))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list, kind, cat, q]);

  if (list === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const menu = (list?.recipes ?? []).filter((r) => r.active && r.kind === "menu");
  const empty = menu.filter((r) => !r.lines.length).length;
  const below = menu.filter((r) => r.gp !== null && r.gp < r.target).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className={CARD}>
          <p className="text-muted-foreground text-xs">Fichas do cardápio</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">{menu.length}</p>
        </div>
        <div className={CARD}>
          <p className="text-muted-foreground text-xs">Sem ingredientes ainda</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">{empty}</p>
        </div>
        {list?.seeCosts ? (
          <div className={CARD}>
            <p className="text-muted-foreground text-xs">Abaixo da margem alvo</p>
            <p className="mt-1 font-semibold text-destructive text-xl tabular-nums">{below}</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-0 flex-1"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar ficha…"
          value={q}
        />
        <Button onClick={() => setEditing(kind)}>{kind === "menu" ? "Nova ficha" : "Novo preparo"}</Button>
        <Button onClick={() => setImporting(true)} variant="outline">
          Criar do cardápio
        </Button>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
        <Pill active={kind === "menu"} onClick={() => setKind("menu")}>
          Cardápio
        </Pill>
        <Pill active={kind === "prep"} onClick={() => setKind("prep")}>
          Preparos
        </Pill>
        <span className="mx-1 w-px shrink-0 bg-border" />
        <Pill active={!cat} onClick={() => setCat("")}>
          Todas
        </Pill>
        {RECIPE_CATEGORIES.map((c) => (
          <Pill active={cat === c.value} key={c.value} onClick={() => setCat(c.value)}>
            {c.label}
          </Pill>
        ))}
      </div>

      {rows.length ? (
        <ul className="divide-y rounded-2xl border bg-card">
          {rows.map((r) => (
            <li key={r._id}>
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                onClick={() => setEditing(r)}
                type="button"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{r.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Tag tone="muted">{catLabel(r.category)}</Tag>
                    {!r.lines.length ? <Tag tone="warn">sem ingredientes</Tag> : null}
                    {r.missing.length ? <Tag tone="warn">{r.missing.length} sem custo</Tag> : null}
                    {r.kind === "menu" && !r.productId && r.price === null ? (
                      <Tag tone="muted">sem preço</Tag>
                    ) : null}
                  </div>
                </div>
                {list?.seeCosts ? (
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    <p>
                      {r.cost !== null ? fmt(r.cost) : "—"}
                      {r.kind === "menu" && r.price !== null ? (
                        <span className="text-muted-foreground"> / {fmt(r.price)}</span>
                      ) : null}
                    </p>
                    {r.kind === "menu" ? (
                      <p className={cn("font-medium text-xs", gpTone(r.gp, r.target))}>
                        margem {pct(r.gp)} · alvo {pct(r.target)}
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        rende {num(r.yieldQty)} {r.yieldUnit}
                      </p>
                    )}
                  </div>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>
          {kind === "menu"
            ? "Nenhuma ficha ainda. Use “Criar do cardápio” para começar pelos produtos do POS."
            : "Nenhum preparo ainda (xaropes, molhos, batches)."}
        </p>
      )}

      {editing && list ? (
        <RecipeEditor
          data={data}
          kind={typeof editing === "string" ? editing : editing.kind}
          list={list}
          onClose={() => setEditing(null)}
          recipe={typeof editing === "string" ? null : editing}
        />
      ) : null}
      {importing && list ? (
        <FromMenu list={list} onClose={() => setImporting(false)} />
      ) : null}
    </div>
  );
}

interface DraftLine {
  itemId?: Id<"invItems">;
  prepId?: Id<"invRecipes">;
  qty: number | undefined;
  /** Percent typed (10 = 10%). */
  waste: number | undefined;
}

function RecipeEditor({
  recipe,
  kind,
  data,
  list,
  onClose,
}: {
  recipe: Recipe | null;
  kind: Kind;
  data: InvOverview;
  list: RecipeList;
  onClose: () => void;
}) {
  const company = useCompany();
  const fmt = useMoney();
  const { products } = usePos();
  const [name, setName] = useState(recipe?.name ?? "");
  const [category, setCategory] = useState(recipe?.category ?? (kind === "prep" ? "other" : "cocktail"));
  const [yieldQty, setYieldQty] = useState<number | undefined>(recipe?.yieldQty ?? (kind === "prep" ? 1000 : 1));
  const [yieldUnit, setYieldUnit] = useState<InvUnit>(recipe?.yieldUnit ?? "ml");
  const [lines, setLines] = useState<DraftLine[]>(
    recipe?.lines.map((l) => ({ ...l, waste: Math.round(l.waste * 100) || undefined })) ?? []
  );
  const [target, setTarget] = useState<number | undefined>(
    recipe?.targetGp !== undefined ? Math.round(recipe.targetGp * 100) : undefined
  );
  const [method, setMethod] = useState(recipe?.method ?? "");
  const [glass, setGlass] = useState(recipe?.glass ?? "");
  const [garnish, setGarnish] = useState(recipe?.garnish ?? "");
  const [productId, setProductId] = useState<string>(recipe?.productId ?? "");
  const [price, setPrice] = useState<number | undefined>(
    recipe && !recipe.productId && recipe.price !== null ? recipe.price : undefined
  );
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => new Map(data.items.map((i) => [i._id as string, i])), [data.items]);
  const preps = useMemo(
    () => list.recipes.filter((r) => r.kind === "prep" && r.active && r._id !== recipe?._id),
    [list, recipe]
  );
  const prepById = useMemo(() => new Map(list.recipes.map((r) => [r._id as string, r])), [list]);

  // Live cost with what is on screen
  const draft: CostRecipe = {
    id: recipe?._id ?? "draft",
    yieldQty: kind === "menu" ? 1 : (yieldQty ?? 0),
    lines: lines
      .filter((l) => (l.qty ?? 0) > 0)
      .map((l) => ({ itemId: l.itemId, prepId: l.prepId, qty: l.qty ?? 0, waste: (l.waste ?? 0) / 100 })),
  };
  const map = new Map<string, CostRecipe>(
    list.recipes.map((r) => [r._id as string, { id: r._id, yieldQty: r.yieldQty, lines: r.lines }])
  );
  let live: ReturnType<typeof recipeCost> | null = null;
  try {
    live = recipeCost(draft, map, (id) => items.get(id)?.avgCost ?? null);
  } catch {
    live = null;
  }
  const product = products.find((p) => p.id === productId);
  const menuPrice = product?.price ?? price ?? null;
  const targetGp = (target ?? Math.round((DEFAULT_TARGETS[category] ?? 0.7) * 100)) / 100;
  const gp = live && menuPrice !== null ? grossMargin(menuPrice, list.vatRate, live.cost) : null;
  const suggestion = live ? suggestedPrice(live.cost, targetGp, list.vatRate) : null;

  const unitOf = (l: DraftLine) =>
    l.itemId ? (items.get(l.itemId)?.unit ?? "") : l.prepId ? (prepById.get(l.prepId)?.yieldUnit ?? "") : "";
  const nameOf = (l: DraftLine) =>
    l.itemId ? (items.get(l.itemId)?.name ?? "Item") : l.prepId ? (prepById.get(l.prepId)?.name ?? "Preparo") : "";

  const save = async () => {
    setBusy(true);
    const id = await sendPos(api.recipes.save, {
      company,
      id: recipe?._id,
      name,
      kind,
      category,
      yieldQty: kind === "menu" ? 1 : (yieldQty ?? 0),
      yieldUnit: kind === "menu" ? "un" : yieldUnit,
      lines: lines
        .filter((l) => (l.qty ?? 0) > 0)
        .map((l) => ({ itemId: l.itemId, prepId: l.prepId, qty: l.qty ?? 0, waste: (l.waste ?? 0) / 100 })),
      targetGp: target !== undefined ? target / 100 : undefined,
      method,
      glass,
      garnish,
    });
    if (id && kind === "menu") {
      await sendPos(api.recipes.setPrice, {
        company,
        recipeId: id,
        productId: productId || null,
        price: productId ? null : (price ?? null),
      });
    }
    setBusy(false);
    if (id) {
      onClose();
    }
  };

  const archive = async () => {
    if (recipe) {
      const ok = await sendPos(api.recipes.setActive, { company, id: recipe._id, active: false });
      if (ok !== undefined) {
        onClose();
      }
    }
  };

  return (
    <FullPage
      footer={
        <div className="flex gap-2">
          {recipe ? (
            <Button onClick={archive} variant="outline">
              Arquivar
            </Button>
          ) : null}
          <Button className="flex-1" disabled={busy || !name.trim()} onClick={save}>
            Salvar ficha
          </Button>
        </div>
      }
      onClose={onClose}
      open
      subtitle={kind === "prep" ? "Preparo (usado dentro de outras fichas)" : "Item do cardápio, 1 porção"}
      title={recipe ? recipe.name : kind === "prep" ? "Novo preparo" : "Nova ficha"}
    >
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <Input autoFocus={!recipe} onChange={(e) => setName(e.target.value)} value={name} />
          </Field>
          <Field label="Categoria">
            <select className={SELECT} onChange={(e) => setCategory(e.target.value)} value={category}>
              {RECIPE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          {kind === "prep" ? (
            <>
              <Field label="Rende">
                <NumberInput onChange={setYieldQty} value={yieldQty} />
              </Field>
              <Field label="Unidade">
                <select className={SELECT} onChange={(e) => setYieldUnit(e.target.value as InvUnit)} value={yieldUnit}>
                  <option value="ml">ml</option>
                  <option value="g">g</option>
                  <option value="un">unidades</option>
                </select>
              </Field>
            </>
          ) : null}
        </div>

        <div className={cn(CARD, "space-y-2")}>
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">Ingredientes</p>
            {live && list.seeCosts ? (
              <p className="font-semibold text-sm tabular-nums">
                Custo {fmt(live.cost)}
                {kind === "prep" && (yieldQty ?? 0) > 0 ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {fmt((live.cost / (yieldQty ?? 1)) * (yieldUnit === "un" ? 1 : 1000))} por{" "}
                    {yieldUnit === "un" ? "un" : yieldUnit === "ml" ? "litro" : "kg"}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          {lines.length ? (
            <ul className="divide-y">
              {lines.map((l, i) => (
                <li className="flex flex-wrap items-center gap-2 py-2" key={`${l.itemId ?? l.prepId}-${i}`}>
                  <span className="min-w-0 flex-1 text-sm">
                    {nameOf(l)}
                    {l.prepId ? <Tag tone="muted">preparo</Tag> : null}
                  </span>
                  <NumberInput
                    className="h-9 w-20 text-right"
                    onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
                    value={l.qty}
                  />
                  <span className="w-6 text-muted-foreground text-xs">{unitOf(l)}</span>
                  <NumberInput
                    className="h-9 w-16 text-right"
                    onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, waste: v } : x)))}
                    placeholder="perda"
                    value={l.waste}
                  />
                  <span className="text-muted-foreground text-xs">%</span>
                  {list.seeCosts ? (
                    <span className="w-16 text-right text-sm tabular-nums">
                      {live?.lineCosts[i] !== undefined && live.lineCosts[i] !== null
                        ? fmt(live.lineCosts[i] ?? 0)
                        : <span className="text-amber-600">sem custo</span>}
                    </span>
                  ) : null}
                  <button
                    aria-label="Remover ingrediente"
                    className="px-1 text-muted-foreground"
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    type="button"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Nenhum ingrediente ainda.</p>
          )}
          <Button onClick={() => setAdding(true)} size="sm" variant="outline">
            + Ingrediente
          </Button>
          <p className="text-muted-foreground text-xs">
            Quantidade em ml, g ou unidades. Perda = o que se perde (limpeza da carne, derramado).
          </p>
        </div>

        {kind === "menu" ? (
          <div className={cn(CARD, "space-y-3")}>
            <p className="font-medium text-sm">Preço e margem neste bar</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Produto do POS">
                <select className={SELECT} onChange={(e) => setProductId(e.target.value)} value={productId}>
                  <option value="">Nenhum (preço manual)</option>
                  {products
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              {productId ? (
                <Field label="Preço (com IVA)">
                  <p className="h-10 py-2 text-sm tabular-nums">{fmt(product?.price ?? 0)}</p>
                </Field>
              ) : (
                <Field label="Preço (com IVA)">
                  <NumberInput onChange={setPrice} value={price} />
                </Field>
              )}
              <Field label="Margem alvo (%)">
                <NumberInput
                  onChange={setTarget}
                  placeholder={String(Math.round((DEFAULT_TARGETS[category] ?? 0.7) * 100))}
                  value={target}
                />
              </Field>
              {list.seeCosts ? (
                <div className="space-y-1 text-sm">
                  <p>
                    Margem:{" "}
                    <span className={cn("font-semibold", gpTone(gp, targetGp))}>{pct(gp)}</span>
                  </p>
                  {suggestion ? (
                    <p className="text-muted-foreground">
                      Preço para {Math.round(targetGp * 100)}%: <span className="text-foreground">{fmt(suggestion)}</span>
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">IVA {num(list.vatRate)}% incluído no preço</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={cn(CARD, "space-y-3")}>
          <p className="font-medium text-sm">Preparo</p>
          {kind === "menu" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Copo / prato">
                <Input onChange={(e) => setGlass(e.target.value)} placeholder="Rocks, coupe, prato raso" value={glass} />
              </Field>
              <Field label="Guarnição">
                <Input onChange={(e) => setGarnish(e.target.value)} value={garnish} />
              </Field>
            </div>
          ) : null}
          <Field label="Modo de preparo">
            <Textarea onChange={(e) => setMethod(e.target.value)} rows={4} value={method} />
          </Field>
        </div>
      </div>
      {adding ? (
        <IngredientPicker
          data={data}
          onClose={() => setAdding(false)}
          onPick={(pick) => {
            setAdding(false);
            setLines((ls) => [...ls, { ...pick, qty: undefined, waste: undefined }]);
          }}
          preps={preps}
        />
      ) : null}
    </FullPage>
  );
}

function IngredientPicker({
  data,
  preps,
  onPick,
  onClose,
}: {
  data: InvOverview;
  preps: Recipe[];
  onPick: (p: { itemId?: Id<"invItems">; prepId?: Id<"invRecipes"> }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const items = data.items
    .filter((i) => i.active && (!s || i.name.toLowerCase().includes(s)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50);
  const ps = preps.filter((p) => !s || p.name.toLowerCase().includes(s)).slice(0, 20);
  return (
    <FullPage onClose={onClose} open title="Adicionar ingrediente">
      <div className="mx-auto max-w-xl space-y-2 p-4">
        <Input autoFocus onChange={(e) => setQ(e.target.value)} placeholder="Buscar item ou preparo…" value={q} />
        {ps.length ? (
          <ul className="divide-y rounded-2xl border bg-card">
            {ps.map((p) => (
              <li key={p._id}>
                <button className="w-full px-4 py-2.5 text-left text-sm" onClick={() => onPick({ prepId: p._id })} type="button">
                  {p.name} <Tag tone="muted">preparo</Tag>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="divide-y rounded-2xl border bg-card">
          {items.map((i) => (
            <li key={i._id}>
              <button className="w-full px-4 py-2.5 text-left text-sm" onClick={() => onPick({ itemId: i._id })} type="button">
                {i.name} <span className="text-muted-foreground text-xs">({i.unit})</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">Não está na lista? Crie o item na aba Itens.</p>
      </div>
    </FullPage>
  );
}

/** POS products without a technical sheet become empty sheets linked to them. */
function FromMenu({ list, onClose }: { list: RecipeList; onClose: () => void }) {
  const company = useCompany();
  const { products } = usePos();
  const linked = new Set(list.recipes.map((r) => r.productId).filter(Boolean));
  const candidates = products
    .filter((p) => !linked.has(p.id))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(candidates.map((p) => p.id)));
  const [q, setQ] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = candidates.filter((p) =>
    `${p.name} ${p.category}`.toLowerCase().includes(q.trim().toLowerCase())
  );
  const run = async () => {
    setBusy(true);
    const n = await sendPos(api.recipes.fromMenu, { company, productIds: [...picked] });
    setBusy(false);
    if (n !== undefined) {
      setDone(n);
    }
  };
  return (
    <FullPage
      footer={
        done === null ? (
          <Button className="w-full" disabled={busy || !picked.size} onClick={run}>
            Criar {picked.size} fichas
          </Button>
        ) : (
          <Button className="w-full" onClick={onClose}>
            Pronto
          </Button>
        )
      }
      onClose={onClose}
      open
      subtitle="Cada produto vira uma ficha vazia já ligada a ele (preço do POS). Depois é só colocar os ingredientes."
      title="Criar fichas do cardápio"
    >
      <div className="mx-auto max-w-xl space-y-3 p-4">
        {done !== null ? (
          <p className={cn(CARD, "text-sm")}>{done} fichas criadas. Abra cada uma e coloque os ingredientes.</p>
        ) : (
          <>
            <Input onChange={(e) => setQ(e.target.value)} placeholder="Filtrar…" value={q} />
            <div className="flex gap-3 text-sm">
              <button className="underline" onClick={() => setPicked(new Set(shown.map((p) => p.id)))} type="button">
                Marcar todos
              </button>
              <button className="underline" onClick={() => setPicked(new Set())} type="button">
                Desmarcar
              </button>
            </div>
            <ul className="divide-y rounded-2xl border bg-card">
              {shown.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-3 px-4 py-2.5">
                    <input
                      checked={picked.has(p.id)}
                      onChange={() =>
                        setPicked((s) => {
                          const next = new Set(s);
                          if (next.has(p.id)) {
                            next.delete(p.id);
                          } else {
                            next.add(p.id);
                          }
                          return next;
                        })
                      }
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="block text-muted-foreground text-xs">{p.category}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </FullPage>
  );
}
