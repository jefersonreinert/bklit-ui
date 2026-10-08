"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Icon, type IconName } from "@/lib/icons";
import { periodFor, productStats, usePosDaily } from "@/lib/pos/analytics";
import { TILE_COLORS } from "@/lib/pos/seed";
import {
  isLowStock,
  marginOf,
  money,
  saveProduct,
  uid,
  usePos,
} from "@/lib/pos/store";
import type { PosProduct } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { ProductForm } from "./pos-product-form";

type Filter = "all" | "low" | "nocost" | "off";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "low", label: "Estoque baixo" },
  { id: "nocost", label: "Sem custo" },
  { id: "off", label: "Indisponíveis" },
];

type Sort = "name" | "sales" | "margin" | "stock";

const SORTS: { id: Sort; label: string }[] = [
  { id: "name", label: "Nome" },
  { id: "sales", label: "Mais vendidos" },
  { id: "margin", label: "Margem" },
  { id: "stock", label: "Estoque" },
];

function Kpi({
  icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone?: "bad";
  onClick?: () => void;
}) {
  return (
    <button
      className="flex flex-col gap-1 rounded-2xl border bg-card p-3 text-left disabled:cursor-default"
      disabled={!onClick}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon className="size-3.5" name={icon} />
        {label}
      </span>
      <span
        className={cn(
          "font-semibold text-lg tabular-nums",
          tone === "bad" && "text-destructive"
        )}
      >
        {value}
      </span>
    </button>
  );
}

const matches = (p: PosProduct, f: Filter) => {
  if (f === "low") {
    return isLowStock(p);
  }
  if (f === "nocost") {
    return p.cost === undefined;
  }
  if (f === "off") {
    return !p.available;
  }
  return true;
};

function StockBadge({ p }: { p: PosProduct }) {
  if (!p.trackStock) {
    return null;
  }
  const low = isLowStock(p);
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs tabular-nums",
        low
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      )}
    >
      {Math.round((p.stock ?? 0) * 100) / 100} {p.unit || "un"}
    </span>
  );
}

function ProductRow({
  p,
  sold,
  currency,
  onOpen,
}: {
  p: PosProduct;
  sold: number;
  currency: string;
  onOpen: () => void;
}) {
  const margin = marginOf(p);
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ background: p.color }}
      />
      <button
        className="min-w-0 flex-1 text-left"
        onClick={onOpen}
        type="button"
      >
        <span
          className={cn(
            "flex items-center gap-2 text-sm",
            !p.available && "text-muted-foreground line-through"
          )}
        >
          <span className="truncate">{p.name}</span>
          <StockBadge p={p} />
        </span>
        <span className="block text-muted-foreground text-xs tabular-nums">
          {money(p.price, currency)}
          {p.cost === undefined
            ? " · sem custo"
            : ` · custo ${money(p.cost, currency)}`}
          {margin === null ? "" : ` · ${Math.round(margin)}%`}
          {sold ? ` · ${sold} vendidos` : ""}
        </span>
      </button>
      <Switch
        aria-label={`${p.name} disponível`}
        checked={p.available}
        onCheckedChange={(available) => saveProduct({ ...p, available })}
      />
    </li>
  );
}

export function ProductsView() {
  const data = usePos();
  const [editing, setEditing] = useState<PosProduct | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const cur = data.settings.currency;
  const categories = useMemo(
    () => [...new Set(data.products.map((p) => p.category))],
    [data.products]
  );
  const period = useMemo(() => periodFor("30d"), []);
  const days = usePosDaily(period);
  const sold = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of productStats(days ?? [])) {
      map.set(s.id, s.qty);
    }
    return map;
  }, [days]);

  const kpis = useMemo(() => {
    const tracked = data.products.filter((p) => p.trackStock);
    const withCost = data.products.filter((p) => marginOf(p) !== null);
    return {
      active: data.products.filter((p) => p.available).length,
      stockValue: tracked.reduce(
        (a, p) => a + Math.max(0, p.stock ?? 0) * (p.cost ?? 0),
        0
      ),
      low: tracked.filter(isLowStock).length,
      margin: withCost.length
        ? withCost.reduce((a, p) => a + (marginOf(p) ?? 0), 0) / withCost.length
        : 0,
    };
  }, [data.products]);

  const q = query.trim().toLowerCase();
  const list = data.products
    .filter(
      (p) =>
        matches(p, filter) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.includes(q))
    )
    .sort((a, b) => {
      if (sort === "sales") {
        return (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0);
      }
      if (sort === "margin") {
        return (marginOf(b) ?? -999) - (marginOf(a) ?? -999);
      }
      if (sort === "stock") {
        return (
          (a.stock ?? Number.POSITIVE_INFINITY) -
          (b.stock ?? Number.POSITIVE_INFINITY)
        );
      }
      return a.name.localeCompare(b.name);
    });
  const grouped = sort === "name";

  const row = (p: PosProduct) => (
    <ProductRow
      currency={cur}
      key={p.id}
      onOpen={() => setEditing(p)}
      p={p}
      sold={sold.get(p.id) ?? 0}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-8">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi
          icon="IconTag"
          label="Produtos ativos"
          value={String(kpis.active)}
        />
        <Kpi
          icon="IconBox2"
          label="Valor em estoque"
          value={money(kpis.stockValue, cur)}
        />
        <Kpi
          icon="IconExclamationTriangle"
          label="Estoque baixo"
          onClick={() => setFilter("low")}
          tone={kpis.low ? "bad" : undefined}
          value={String(kpis.low)}
        />
        <Kpi
          icon="IconCoins"
          label="Margem média"
          value={`${Math.round(kpis.margin)}%`}
        />
      </div>
      <div className="flex gap-2">
        <Input
          className="flex-1"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, SKU ou código…"
          value={query}
        />
        <Button
          onClick={() =>
            setEditing({
              id: uid(),
              name: "",
              category: categories[0] ?? "Outros",
              price: 0,
              color: TILE_COLORS[0] ?? "#c96442",
              available: true,
              unit: "un",
              trackStock: false,
            })
          }
        >
          <Icon className="size-4" name="IconPlusSmall" />
          <span className="hidden sm:inline">Novo produto</span>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              filter === f.id ? "bg-foreground text-background" : "bg-muted"
            )}
            key={f.id}
            onClick={() => setFilter(f.id)}
            type="button"
          >
            {f.label}
          </button>
        ))}
        <select
          aria-label="Ordenar"
          className="ml-auto h-8 rounded-full border bg-transparent px-3 text-sm"
          onChange={(e) => setSort(e.target.value as Sort)}
          value={sort}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          Nenhum produto aqui.
        </p>
      ) : null}
      {grouped ? (
        categories.map((c) => {
          const items = list.filter((p) => p.category === c);
          return items.length ? (
            <section className="flex flex-col gap-2" key={c}>
              <h3 className="font-semibold text-muted-foreground text-sm">
                {c}
              </h3>
              <ul className="divide-y rounded-2xl border bg-card">
                {items.map(row)}
              </ul>
            </section>
          ) : null;
        })
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">{list.map(row)}</ul>
      )}
      {editing ? (
        <ProductForm
          categories={categories}
          onClose={() => setEditing(null)}
          product={editing}
        />
      ) : null}
    </div>
  );
}
