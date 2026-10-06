"use client";

import { Icon } from "@bklitui/icons";
import { type FormEvent, useMemo, useState } from "react";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, formatBRLCents, formatPercent } from "@/lib/format";
import {
  CATEGORIES,
  type Category,
  type Dish,
  dishCmv,
  dishCost,
  dishMargin,
} from "@/lib/menu-data";
import { cn } from "@/lib/utils";

const ALL = "todas";
const categoryItems = [
  { value: ALL, label: "Todas as categorias" },
  ...CATEGORIES.map((c) => ({ value: c, label: c })),
];
const sortItems = [
  { value: "vendas", label: "Mais vendidos" },
  { value: "margem", label: "Maior margem" },
  { value: "cmv", label: "Maior CMV" },
  { value: "avaliacao", label: "Melhor avaliados" },
];

type SortKey = "vendas" | "margem" | "cmv" | "avaliacao";

const sorters: Record<SortKey, (a: Dish, b: Dish) => number> = {
  vendas: (a, b) => b.sales - a.sales,
  margem: (a, b) => dishMargin(b) - dishMargin(a),
  cmv: (a, b) => dishCmv(b) - dishCmv(a),
  avaliacao: (a, b) => b.rating - a.rating,
};

function cmvTone(cmv: number) {
  if (cmv <= 30) {
    return "text-success";
  }
  return cmv <= 38 ? "text-warning" : "text-destructive";
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1 text-xs">
      <Icon className="size-3.5" name="IconStar" />
      <span className="font-medium tabular-nums">
        {value.toFixed(1).replace(".", ",")}
      </span>
    </span>
  );
}

function DishCard({
  dish,
  onToggle,
  onOpen,
}: {
  dish: Dish;
  onToggle: (available: boolean) => void;
  onOpen: () => void;
}) {
  const cmv = dishCmv(dish);
  const trend = ((dish.sales - dish.prevSales) / dish.prevSales) * 100;
  return (
    <Card
      className={cn(
        "min-w-0 gap-3 px-4 py-4 transition-opacity",
        !dish.available && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 text-left" onClick={onOpen} type="button">
          <p className="truncate font-medium hover:underline">{dish.name}</p>
          <p className="line-clamp-2 text-muted-foreground text-xs">
            {dish.description}
          </p>
        </button>
        <Switch
          aria-label={dish.available ? "Disponível" : "Indisponível"}
          checked={dish.available}
          onCheckedChange={onToggle}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{dish.category}</Badge>
        {dish.tags.map((t) => (
          <Badge key={t} variant="outline">
            {t}
          </Badge>
        ))}
        {dish.available ? null : <Badge variant="destructive">Em falta</Badge>}
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-2.5 text-xs">
        <div>
          <p className="text-muted-foreground">Preço</p>
          <p className="font-semibold text-sm tabular-nums">
            {formatBRL(dish.price)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Custo</p>
          <p className="font-medium text-sm tabular-nums">
            {formatBRLCents(dishCost(dish))}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">CMV</p>
          <p className={cn("font-medium text-sm tabular-nums", cmvTone(cmv))}>
            {formatPercent(cmv)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
        <span className="flex items-center gap-3">
          <Stars value={dish.rating} />
          <span className="flex items-center gap-1">
            <Icon className="size-3.5" name="IconClock" />
            {dish.prepMinutes} min
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{dish.sales} vend.</span>
          <TrendBadge value={trend} />
        </span>
      </div>
    </Card>
  );
}

function DishSheet({
  dish,
  onClose,
  onUpdate,
}: {
  dish: Dish | null;
  onClose: () => void;
  onUpdate: (patch: Partial<Dish>) => void;
}) {
  const cost = dish ? dishCost(dish) : 0;
  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={dish !== null}
    >
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        {dish ? (
          <>
            <SheetHeader className="gap-2 border-b p-5">
              <SheetTitle>{dish.name}</SheetTitle>
              <SheetDescription>{dish.description}</SheetDescription>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{dish.category}</Badge>
                <Badge variant="outline">{dish.id}</Badge>
                <Badge variant="outline">
                  {dish.prepMinutes} min de preparo
                </Badge>
              </div>
            </SheetHeader>
            <div className="flex flex-col gap-5 p-5">
              <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3">
                <div>
                  <p className="font-medium text-sm">Disponível no cardápio</p>
                  <p className="text-muted-foreground text-xs">
                    Desative quando faltar insumo
                  </p>
                </div>
                <Switch
                  checked={dish.available}
                  onCheckedChange={(v) => onUpdate({ available: v })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dish-price">Preço de venda (R$)</Label>
                <Input
                  id="dish-price"
                  inputMode="decimal"
                  min={0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v > 0) {
                      onUpdate({ price: v });
                    }
                  }}
                  step="0.5"
                  type="number"
                  value={dish.price}
                />
                <p className="text-muted-foreground text-xs">
                  CMV {formatPercent(dishCmv(dish))} · margem{" "}
                  {formatBRLCents(dishMargin(dish))} por prato
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-sm">Ficha técnica</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="py-1.5 text-left font-normal">Insumo</th>
                      <th className="py-1.5 text-right font-normal">Qtd.</th>
                      <th className="py-1.5 text-right font-normal">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dish.ingredients.map((i) => (
                      <tr className="border-border/50 border-b" key={i.name}>
                        <td className="py-1.5">{i.name}</td>
                        <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                          {i.qty} {i.unit}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatBRLCents(i.qty * i.unitCost)}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-medium">
                      <td className="py-1.5">Total</td>
                      <td />
                      <td className="py-1.5 text-right tabular-nums">
                        {formatBRLCents(cost)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Vendas no mês", `${dish.sales}`],
                  ["Mês anterior", `${dish.prevSales}`],
                  [
                    "Avaliação",
                    `${dish.rating.toFixed(1).replace(".", ",")} (${dish.reviews})`,
                  ],
                  ["Receita no mês", formatBRL(dish.sales * dish.price)],
                ].map(([k, v]) => (
                  <div className="rounded-lg bg-muted/60 p-3" key={k}>
                    <dt className="text-muted-foreground text-xs">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function NewDishSheet({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (dish: Dish) => void;
}) {
  const [category, setCategory] = useState<Category>("Principais");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const price = Number(form.get("price") ?? 0);
    const cost = Number(form.get("cost") ?? 0);
    if (!name || price <= 0) {
      return;
    }
    onCreate({
      id: `P${Math.floor(100 + Math.random() * 899)}`,
      name,
      category,
      description: String(form.get("description") ?? ""),
      price,
      sales: 0,
      prevSales: 1,
      rating: 0,
      reviews: 0,
      prepMinutes: Number(form.get("prep") ?? 15) || 15,
      available: true,
      tags: ["Novidade"],
      ingredients: [
        {
          name: "Custo estimado",
          qty: 1,
          unit: "un",
          unitCost: cost > 0 ? cost : 0,
        },
      ],
    });
    event.currentTarget.reset();
    onOpenChange(false);
  };

  const field = "flex flex-col gap-1.5";
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Novo prato</SheetTitle>
          <SheetDescription>
            O prato entra no cardápio como “Novidade”.
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4 p-5" onSubmit={submit}>
          <div className={field}>
            <Label htmlFor="dish-name">Nome</Label>
            <Input
              id="dish-name"
              name="name"
              placeholder="Ex.: Arroz de pato"
              required
            />
          </div>
          <div className={field}>
            <Label htmlFor="dish-desc">Descrição</Label>
            <Textarea
              id="dish-desc"
              name="description"
              placeholder="Ingredientes e acompanhamentos"
            />
          </div>
          <div className={field}>
            <Label>Categoria</Label>
            <Select
              items={CATEGORIES.map((c) => ({ value: c, label: c }))}
              onValueChange={(v) => setCategory(v as Category)}
              value={category}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className={field}>
              <Label htmlFor="dish-new-price">Preço</Label>
              <Input
                id="dish-new-price"
                inputMode="decimal"
                min={1}
                name="price"
                required
                step="0.5"
                type="number"
              />
            </div>
            <div className={field}>
              <Label htmlFor="dish-cost">Custo</Label>
              <Input
                id="dish-cost"
                inputMode="decimal"
                min={0}
                name="cost"
                step="0.5"
                type="number"
              />
            </div>
            <div className={field}>
              <Label htmlFor="dish-prep">Preparo</Label>
              <Input
                defaultValue={15}
                id="dish-prep"
                inputMode="numeric"
                min={1}
                name="prep"
                type="number"
              />
            </div>
          </div>
          <div className="mt-auto flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button className="flex-1" type="submit">
              <Icon className="size-4" name="IconPlusMedium" />
              Adicionar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function MenuItemsTab({
  items,
  onUpdate,
}: {
  items: Dish[];
  onUpdate: (id: string, patch: Partial<Dish>) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [sort, setSort] = useState<SortKey>("vendas");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items
      .filter(
        (d) =>
          (category === ALL || d.category === category) &&
          (q === "" || `${d.name} ${d.description}`.toLowerCase().includes(q))
      )
      .sort(sorters[sort]);
  }, [items, query, category, sort]);

  const selected = items.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            name="IconSearchMenu"
          />
          <Input
            aria-label="Buscar prato"
            className="pl-8"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar prato ou ingrediente"
            value={query}
          />
        </div>
        <Select
          items={categoryItems}
          onValueChange={(v) => setCategory(String(v))}
          value={category}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryItems.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={sortItems}
          onValueChange={(v) => setSort(v as SortKey)}
          value={sort}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortItems.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-muted-foreground text-xs">
        {filtered.length} pratos · {filtered.filter((d) => !d.available).length}{" "}
        em falta · use o interruptor para tirar do cardápio
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((d) => (
          <DishCard
            dish={d}
            key={d.id}
            onOpen={() => setSelectedId(d.id)}
            onToggle={(available) => onUpdate(d.id, { available })}
          />
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground text-sm">
          Nenhum prato encontrado.
        </p>
      ) : null}

      <DishSheet
        dish={selected}
        onClose={() => setSelectedId(null)}
        onUpdate={(patch) => {
          if (selected) {
            onUpdate(selected.id, patch);
          }
        }}
      />
    </div>
  );
}
