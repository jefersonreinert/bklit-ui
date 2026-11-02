"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Icon } from "@/lib/icons";
import {
  isLowStock,
  money,
  moveStock,
  saveProduct,
  usePos,
  type WineServe,
  wineLine,
} from "@/lib/pos/store";
import type { PosProduct, WineInfo } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { useCan } from "./pos-auth";

/**
 * Wine bar: glasses poured from the bottle (dispenser), the bottle at the
 * table or to take away. Stock is counted in bottles; a glass takes its
 * share (125 ml of 750 ml = 1/6 bottle).
 */

export const WINE_COLORS: Record<string, { label: string; swatch: string }> = {
  red: { label: "Tinto", swatch: "#7b1e2b" },
  white: { label: "Branco", swatch: "#e6d27a" },
  rose: { label: "Rosé", swatch: "#e79aa8" },
  orange: { label: "Laranja", swatch: "#d98b3a" },
  sparkling: { label: "Espumante", swatch: "#cbbf8f" },
  dessert: { label: "Sobremesa", swatch: "#a4652a" },
};

export const wineColor = (color: string) =>
  WINE_COLORS[color] ?? { label: color, swatch: "#888" };

/** Bottles with one decimal ("2,5 garrafas"). */
export function bottles(n: number) {
  const v = Math.round(n * 10) / 10;
  return `${v.toLocaleString("pt-BR")} ${Math.abs(v) === 1 ? "garrafa" : "garrafas"}`;
}

/** Glass sizes, bottle and takeaway of a wine, in the order shown. */
export function serves(p: PosProduct): WineServe[] {
  const pours = [...(p.wine?.pours ?? [])]
    .filter((x) => x.price > 0)
    .sort((a, b) => a.ml - b.ml)
    .map((x) => x.ml);
  return [
    ...pours,
    ...(p.price > 0 ? (["bottle"] as const) : []),
    ...(p.wine?.takeaway ? (["takeaway"] as const) : []),
  ];
}

const serveLabel = (serve: WineServe) => {
  if (serve === "bottle") {
    return "Garrafa na mesa";
  }
  if (serve === "takeaway") {
    return "Garrafa para levar";
  }
  return serve <= 50 ? `Prova ${serve} ml` : `Taça ${serve} ml`;
};

/** Picks how to serve a wine in the register. */
export function WineSheet({
  product,
  currency,
  onClose,
  onPick,
}: {
  product: PosProduct | null;
  currency: string;
  onClose: () => void;
  onPick: (serve: WineServe) => void;
}) {
  const wine = product?.wine;
  const color = wine ? wineColor(wine.color) : null;
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={Boolean(product)}>
      <SheetContent
        className="acrylic max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl bg-popover sm:mx-auto sm:max-w-lg"
        side="bottom"
      >
        <SheetHeader className="border-b pb-3">
          <SheetTitle className="flex items-center gap-2">
            {color ? (
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ background: color.swatch }}
              />
            ) : null}
            {product?.name}
          </SheetTitle>
          <p className="text-muted-foreground text-sm">
            {[
              color?.label,
              wine?.country,
              wine?.grape,
              wine?.vintage,
              wine?.tap ? `torneira ${wine.tap}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {product?.trackStock ? (
            <p
              className={cn(
                "text-xs",
                isLowStock(product)
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              Estoque: {bottles(product.stock ?? 0)}
            </p>
          ) : null}
        </SheetHeader>
        <div className="grid grid-cols-2 gap-2 p-4">
          {product
            ? serves(product).map((serve) => {
                const line = wineLine(product, serve);
                return (
                  <button
                    className="flex min-h-20 flex-col justify-between gap-1 rounded-2xl border bg-card p-3 text-left transition-colors active:bg-muted"
                    key={String(serve)}
                    onClick={() => {
                      onPick(serve);
                      onClose();
                    }}
                    type="button"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-sm">
                      <Icon
                        className="size-4 text-muted-foreground"
                        name={
                          typeof serve === "number" ? "IconGlass" : "IconBottle"
                        }
                      />
                      {serveLabel(serve)}
                    </span>
                    <span className="text-lg tabular-nums">
                      {money(line.price, currency)}
                    </span>
                  </button>
                );
              })
            : null}
          {product && serves(product).length === 0 ? (
            <p className="col-span-2 py-6 text-center text-muted-foreground text-sm">
              Sem preço cadastrado. Defina em Vinhos ou Produtos.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Wines tab ------------------------------- */

function StockEntry({ product }: { product: PosProduct }) {
  const [value, setValue] = useState("");
  const qty = Number(value.replace(",", "."));
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (qty > 0) {
          moveStock({
            productId: product.id,
            qty,
            kind: "purchase",
            note: "Entrada de garrafas",
          });
          setValue("");
        }
      }}
    >
      <Input
        aria-label={`Garrafas recebidas de ${product.name}`}
        className="h-8 w-16 text-right"
        inputMode="decimal"
        onChange={(e) => setValue(e.target.value)}
        placeholder="+0"
        value={value}
      />
      <button
        aria-label="Lançar entrada"
        className="flex size-8 items-center justify-center rounded-lg bg-muted disabled:opacity-40"
        disabled={!(qty > 0)}
        type="submit"
      >
        <Icon className="size-4" name="IconPlusSmall" />
      </button>
    </form>
  );
}

export function WinesView() {
  const data = usePos();
  const can = useCan();
  const currency = data.settings.currency;
  const [color, setColor] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const wines = useMemo(
    () =>
      data.products
        .filter((p) => p.wine)
        .sort(
          (a, b) =>
            (a.wine?.country ?? "").localeCompare(b.wine?.country ?? "") ||
            a.name.localeCompare(b.name)
        ),
    [data.products]
  );
  const countries = useMemo(
    () =>
      [...new Set(wines.map((w) => w.wine?.country ?? ""))]
        .filter(Boolean)
        .sort(),
    [wines]
  );
  const colors = useMemo(
    () => [...new Set(wines.map((w) => w.wine?.color ?? ""))].filter(Boolean),
    [wines]
  );
  const q = query.trim().toLowerCase();
  const list = wines.filter(
    (w) =>
      (!color || w.wine?.color === color) &&
      (!country || w.wine?.country === country) &&
      (!q ||
        [w.name, w.wine?.grape, w.wine?.tap, w.wine?.region]
          .filter(Boolean)
          .some((t) => String(t).toLowerCase().includes(q)))
  );
  const tracked = wines.filter((w) => w.trackStock);
  const totalBottles = tracked.reduce(
    (a, w) => a + Math.max(0, w.stock ?? 0),
    0
  );
  const stockValue = tracked.reduce(
    (a, w) => a + Math.max(0, w.stock ?? 0) * (w.cost ?? 0),
    0
  );
  const low = tracked.filter(isLowStock).length;
  const canStock = can(["stock"]);
  const canEdit = can(["products", "stock"]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Rótulos", value: String(wines.length) },
          { label: "Garrafas em estoque", value: bottles(totalBottles) },
          { label: "Valor do estoque", value: money(stockValue, currency) },
          {
            label: "Estoque baixo",
            value: String(low),
            warn: low > 0,
          },
        ].map((s) => (
          <div className="rounded-2xl border bg-card p-3" key={s.label}>
            <p className="text-muted-foreground text-xs">{s.label}</p>
            <p
              className={cn(
                "mt-1 font-medium text-lg tabular-nums",
                s.warn && "text-destructive"
              )}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="sm:max-w-xs"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar vinho, uva ou torneira…"
          value={query}
        />
        <select
          aria-label="País"
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          onChange={(e) => setCountry(e.target.value || null)}
          value={country ?? ""}
        >
          <option value="">Todos os países</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[null, ...colors].map((c) => (
          <button
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              color === c
                ? "border-foreground bg-foreground text-background"
                : "bg-card hover:bg-muted"
            )}
            key={c ?? "all"}
            onClick={() => setColor(c)}
            type="button"
          >
            {c ? (
              <span
                className="size-2.5 rounded-full"
                style={{ background: wineColor(c).swatch }}
              />
            ) : null}
            {c
              ? `${wineColor(c).label} (${wines.filter((w) => w.wine?.color === c).length})`
              : `Todos (${wines.length})`}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-muted-foreground text-xs">
            <tr className="border-b">
              <th className="px-3 py-2 font-normal">Vinho</th>
              <th className="px-3 py-2 font-normal">Torneira</th>
              <th className="px-3 py-2 text-right font-normal">Taça</th>
              <th className="px-3 py-2 text-right font-normal">Garrafa</th>
              <th className="px-3 py-2 text-right font-normal">Levar</th>
              <th className="px-3 py-2 text-right font-normal">Estoque</th>
              {canStock ? (
                <th className="px-3 py-2 text-right font-normal">Entrada</th>
              ) : null}
              <th className="px-3 py-2 text-right font-normal">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {list.map((w) => {
              const wine = w.wine;
              const glass = [...(wine?.pours ?? [])].sort(
                (a, b) => b.ml - a.ml
              )[0];
              return (
                <tr className="border-b last:border-0" key={w.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          background: wineColor(wine?.color ?? "").swatch,
                        }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{w.name}</p>
                        <p className="truncate text-muted-foreground text-xs">
                          {[wine?.country, wine?.grape, wine?.vintage]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {wine?.tap ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {glass?.price
                      ? `${money(glass.price, currency)} · ${glass.ml} ml`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {w.price ? money(w.price, currency) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {wine?.takeaway ? money(wine.takeaway, currency) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      isLowStock(w) && "text-destructive"
                    )}
                  >
                    {w.trackStock ? bottles(w.stock ?? 0) : "—"}
                  </td>
                  {canStock ? (
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <StockEntry product={w} />
                      </div>
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-right">
                    <input
                      aria-label={`${w.name} disponível`}
                      checked={w.available}
                      className="size-4 accent-foreground"
                      disabled={!canEdit}
                      onChange={(e) =>
                        saveProduct({ ...w, available: e.target.checked })
                      }
                      type="checkbox"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            Nenhum vinho com esses filtros.
          </p>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        Os preços, a uva e as doses de cada vinho se editam em Produtos. Cada
        taça vendida desconta a sua parte da garrafa no estoque.
      </p>
    </div>
  );
}

/* ------------------------------ product form ----------------------------- */

const NEW_WINE: WineInfo = {
  color: "red",
  bottleMl: 750,
  pours: [
    { ml: 25, price: 0 },
    { ml: 75, price: 0 },
    { ml: 125, price: 0 },
  ],
};

const toNum = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Wine details in the product form (price field = bottle at the table). */
export function WineEditor({
  value,
  onChange,
}: {
  value: WineInfo | undefined;
  onChange: (wine: WineInfo | undefined) => void;
}) {
  if (!value) {
    return (
      <button
        className="self-start rounded-full bg-muted px-3 py-1.5 text-sm"
        onClick={() => onChange(NEW_WINE)}
        type="button"
      >
        É um vinho (vender em taça e garrafa)
      </button>
    );
  }
  const set = (patch: Partial<WineInfo>) => onChange({ ...value, ...patch });
  const text = (
    label: string,
    key: "country" | "region" | "grape" | "producer" | "vintage" | "tap"
  ) => (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={`wine-${key}`}>
      {label}
      <Input
        id={`wine-${key}`}
        onChange={(e) => set({ [key]: e.target.value || undefined })}
        value={value[key] ?? ""}
      />
    </label>
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        O preço de venda acima é a garrafa na mesa. O estoque conta garrafas;
        cada taça desconta a sua parte.
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(WINE_COLORS).map(([key, c]) => (
          <button
            aria-pressed={value.color === key}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
              value.color === key ? "bg-foreground text-background" : "bg-muted"
            )}
            key={key}
            onClick={() => set({ color: key })}
            type="button"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ background: c.swatch }}
            />
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {text("País", "country")}
        {text("Região", "region")}
        {text("Uva", "grape")}
        {text("Produtor", "producer")}
        {text("Safra", "vintage")}
        {text("Torneira do dispenser", "tap")}
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="wine-ml">
          Garrafa (ml)
          <Input
            id="wine-ml"
            inputMode="numeric"
            onChange={(e) => set({ bottleMl: toNum(e.target.value) || 750 })}
            value={String(value.bottleMl)}
          />
        </label>
        <label
          className="flex flex-col gap-1.5 text-sm"
          htmlFor="wine-takeaway"
        >
          Garrafa para levar
          <Input
            id="wine-takeaway"
            inputMode="decimal"
            onChange={(e) =>
              set({ takeaway: toNum(e.target.value) || undefined })
            }
            placeholder="0,00"
            value={value.takeaway ? String(value.takeaway) : ""}
          />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm">Doses (taça)</p>
        {value.pours.map((pour, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: pours have no id and are edited in place
          <div className="flex items-center gap-2" key={i}>
            <Input
              aria-label="Mililitros"
              className="w-24"
              inputMode="numeric"
              onChange={(e) =>
                set({
                  pours: value.pours.map((x, j) =>
                    j === i ? { ...x, ml: toNum(e.target.value) } : x
                  ),
                })
              }
              value={String(pour.ml)}
            />
            <span className="text-muted-foreground text-sm">ml por</span>
            <Input
              aria-label="Preço da dose"
              className="w-28"
              inputMode="decimal"
              onChange={(e) =>
                set({
                  pours: value.pours.map((x, j) =>
                    j === i ? { ...x, price: toNum(e.target.value) } : x
                  ),
                })
              }
              placeholder="0,00"
              value={pour.price ? String(pour.price) : ""}
            />
            <button
              aria-label="Remover dose"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              onClick={() =>
                set({ pours: value.pours.filter((_, j) => j !== i) })
              }
              type="button"
            >
              <Icon className="size-4" name="IconCrossSmall" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <button
            className="rounded-full bg-muted px-3 py-1.5 text-sm"
            onClick={() =>
              set({ pours: [...value.pours, { ml: 150, price: 0 }] })
            }
            type="button"
          >
            + dose
          </button>
          <button
            className="rounded-full px-3 py-1.5 text-muted-foreground text-sm hover:bg-muted"
            onClick={() => onChange(undefined)}
            type="button"
          >
            Não é vinho
          </button>
        </div>
      </div>
    </div>
  );
}
