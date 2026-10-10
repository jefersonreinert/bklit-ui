"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ALERT_LABEL,
  marginAlert,
  type PriceMargin,
  priceForMargin,
  priceMargin,
} from "@/lib/cellar/margins";
import { removeWine, updateWine } from "@/lib/cellar/store";
import {
  CELLAR_STYLES,
  type CellarStyle,
  type CellarWine,
  styleLabel,
} from "@/lib/cellar/types";
import { formatPct } from "@/lib/cellar/view";
import { Icon } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { FilterSelect } from "./bev-shared";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </label>
  );
}

const COMMA = /\s*,\s*/;
const DECIMAL_COMMA = ",";

export const numOrNull = (v: string) => {
  if (v.trim() === "") {
    return null;
  }
  const n = Number(v.replace(DECIMAL_COMMA, "."));
  return Number.isFinite(n) ? n : null;
};

export const splitList = (v: string) => v.split(COMMA).filter(Boolean);

function MarginColumn({
  label,
  price,
  margin,
  money,
  showMarkup,
}: {
  label: string;
  price: number | null;
  margin: PriceMargin | null;
  money: (v: number | null) => string;
  showMarkup?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold tabular-nums">
        {money(price)}{" "}
        <span className="font-normal text-muted-foreground text-xs">
          {margin ? `${money(margin.exVat)} s/ IVA` : ""}
        </span>
      </p>
      <p className="text-xs tabular-nums">
        Lucro {money(margin?.profit ?? null)} · Margem{" "}
        {formatPct(margin?.margin)}
        {showMarkup
          ? ` · Markup ${margin?.markup ? `${margin.markup}x` : "—"}`
          : ""}
      </p>
    </div>
  );
}

function MarginBox({
  wine,
  money,
  minMargin,
}: {
  wine: CellarWine;
  money: (v: number | null) => string;
  minMargin: number;
}) {
  const purchase = wine.lastPurchaseAt
    ? ` · última compra ${wine.lastPurchaseAt}${wine.lastSupplier ? ` (${wine.lastSupplier})` : ""} · ${wine.purchaseCount} compra(s)`
    : "";
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border p-3 text-sm">
      <MarginColumn
        label="Garrafa (mesa)"
        margin={priceMargin(wine.priceDineIn, wine.cost, wine.vatRate)}
        money={money}
        price={wine.priceDineIn}
        showMarkup
      />
      <MarginColumn
        label="Taça / takeaway"
        margin={priceMargin(wine.priceGlass, wine.cost, wine.vatRate)}
        money={money}
        price={wine.priceGlass}
      />
      <p className="col-span-2 text-muted-foreground text-xs">
        {wine.cost ? (
          <>
            Preço sugerido para {minMargin}% de margem:{" "}
            <span className="font-medium text-foreground">
              {money(priceForMargin(wine.cost, minMargin, wine.vatRate))}
            </span>
            {purchase}
          </>
        ) : (
          "Sem custo: aprove uma nota fiscal com este vinho (mesmo EAN ou nome) em Documentos, ou digite o custo abaixo."
        )}
      </p>
    </div>
  );
}

function NumberInput({
  value,
  onValue,
  numeric,
}: {
  value: number | null;
  onValue: (v: number | null) => void;
  numeric?: boolean;
}) {
  return (
    <Input
      inputMode={numeric ? "numeric" : "decimal"}
      onChange={(e) => onValue(numOrNull(e.target.value))}
      value={value ?? ""}
    />
  );
}

function WineForm({
  wine,
  set,
}: {
  wine: CellarWine;
  set: (patch: Partial<CellarWine>) => void;
}) {
  const text = (field: keyof CellarWine) => ({
    onChange: (e: { target: { value: string } }) =>
      set({ [field]: e.target.value } as Partial<CellarWine>),
    value: String(wine[field] ?? ""),
  });
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field className="col-span-2" label="Nome">
        <Input {...text("name")} />
      </Field>
      <Field label="Produtor">
        <Input {...text("producer")} />
      </Field>
      <Field label="Estilo">
        <FilterSelect
          className="sm:w-full"
          items={CELLAR_STYLES.map((s) => ({ value: s.value, label: s.label }))}
          onChange={(v) => set({ style: v as CellarStyle })}
          value={wine.style}
        />
      </Field>
      <Field label="Uvas (separe por vírgula)">
        <Input
          defaultValue={wine.grapes.join(", ")}
          key={`g-${wine.id}`}
          onBlur={(e) => set({ grapes: splitList(e.target.value) })}
        />
      </Field>
      <Field label="Safra">
        <NumberInput
          numeric
          onValue={(vintage) => set({ vintage })}
          value={wine.vintage}
        />
      </Field>
      <Field label="País">
        <Input {...text("country")} />
      </Field>
      <Field label="Região">
        <Input {...text("region")} />
      </Field>
      <Field label="Preço garrafa (c/ IVA)">
        <NumberInput
          onValue={(priceDineIn) => set({ priceDineIn })}
          value={wine.priceDineIn}
        />
      </Field>
      <Field label="Preço taça/takeaway (c/ IVA)">
        <NumberInput
          onValue={(priceGlass) => set({ priceGlass })}
          value={wine.priceGlass}
        />
      </Field>
      <Field label="Custo por garrafa (s/ IVA)">
        <NumberInput onValue={(cost) => set({ cost })} value={wine.cost} />
      </Field>
      <Field label="IVA %">
        <NumberInput
          onValue={(v) => set({ vatRate: v ?? 0 })}
          value={wine.vatRate}
        />
      </Field>
      <Field label="ABV %">
        <NumberInput onValue={(abv) => set({ abv })} value={wine.abv} />
      </Field>
      <Field label="Volume (ml)">
        <NumberInput
          numeric
          onValue={(v) => set({ volumeMl: v ?? 750 })}
          value={wine.volumeMl}
        />
      </Field>
      <Field label="EAN (código de barras)">
        <Input {...text("ean")} inputMode="numeric" />
      </Field>
      <Field label="Posição (tap code)">
        <Input {...text("tapCode")} />
      </Field>
      <Field className="col-span-2" label="Harmonização (separe por vírgula)">
        <Input
          defaultValue={wine.foodPairing.join(", ")}
          key={`p-${wine.id}`}
          onBlur={(e) => set({ foodPairing: splitList(e.target.value) })}
        />
      </Field>
      <Field className="col-span-2" label="Notas de degustação">
        <Textarea {...text("tastingNotes")} rows={4} />
      </Field>
      <Field className="col-span-2" label="História">
        <Textarea {...text("story")} rows={4} />
      </Field>
      <Field className="col-span-2" label="URL da foto">
        <Input {...text("imageUrl")} />
      </Field>
    </div>
  );
}

export function WineThumb({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  if (!src) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded bg-muted",
          className
        )}
      >
        <Icon className="size-3.5" name="IconGlass" />
      </span>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: bottle photos from any host or data URLs
    <img
      alt=""
      className={cn("shrink-0 object-contain", className)}
      height={64}
      loading="lazy"
      src={src}
      width={40}
    />
  );
}

export function WineSheet({
  wine,
  onClose,
  currency,
  minMargin,
}: {
  wine: CellarWine | null;
  onClose: () => void;
  currency: string;
  minMargin: number;
}) {
  const money = (v: number | null) =>
    v === null ? "—" : formatMoney(v, currency);
  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={wine !== null}
    >
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-xl!"
        side="right"
      >
        {wine ? (
          <>
            <SheetHeader className="gap-2 border-b p-5">
              <div className="flex items-center gap-3">
                <WineThumb className="h-16 w-10" src={wine.imageUrl} />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{wine.name}</SheetTitle>
                  <SheetDescription>
                    {[
                      styleLabel(wine.style),
                      wine.grapes.join(", "),
                      wine.country,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {wine.wineId ? (
                  <Badge variant="outline">{wine.wineId}</Badge>
                ) : null}
                {wine.origin.startsWith("notion:") ? (
                  <Badge variant="secondary">Notion</Badge>
                ) : null}
                <Badge variant="outline">
                  {ALERT_LABEL[marginAlert(wine, minMargin)]}
                </Badge>
              </div>
            </SheetHeader>
            <div className="flex flex-col gap-5 p-5">
              <MarginBox minMargin={minMargin} money={money} wine={wine} />
              <WineForm
                set={(patch) => updateWine(wine.id, patch)}
                wine={wine}
              />
              <div className="flex items-center justify-between rounded-xl border p-3 text-sm">
                <span>Disponível na carta</span>
                <Switch
                  checked={wine.available}
                  onCheckedChange={(available) =>
                    updateWine(wine.id, { available })
                  }
                />
              </div>
              <Button
                onClick={() => {
                  removeWine(wine.id);
                  onClose();
                }}
                variant="destructive"
              >
                <Icon className="size-4" name="IconTrashCan" />
                Remover da adega
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
