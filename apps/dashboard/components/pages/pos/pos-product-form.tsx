"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/lib/icons";
import { periodFor, productStats } from "@/lib/pos/analytics";
import { TILE_COLORS } from "@/lib/pos/seed";
import {
  deleteProduct,
  marginOf,
  money,
  moveStock,
  saveProduct,
  usePos,
} from "@/lib/pos/store";
import type { PosProduct, StockMoveKind } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

const UNITS = ["un", "kg", "g", "L", "ml", "garrafa", "lata", "dose", "porção"];

const num = (v: string) => Number(v.replace(",", "."));
/** Number for an input or label, with a decimal comma. */
const fix = (v: number | undefined) =>
  v === undefined || Number.isNaN(v)
    ? ""
    : String(Math.round(v * 100) / 100).replace(".", ",");
const money2 = (v: number | undefined) =>
  v === undefined ? "" : v.toFixed(2).replace(".", ",");

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <legend className="sr-only">{title}</legend>
      <p className="font-semibold text-sm">{title}</p>
      {children}
    </fieldset>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "font-semibold tabular-nums",
          tone === "good" && "text-[#3d7a5f]",
          tone === "bad" && "text-destructive"
        )}
      >
        {value}
      </p>
    </div>
  );
}

const MOVE_KINDS: { id: StockMoveKind; label: string }[] = [
  { id: "purchase", label: "Entrada" },
  { id: "adjust", label: "Contagem" },
  { id: "waste", label: "Perda" },
];

const KIND_LABEL: Record<StockMoveKind, string> = {
  sale: "Venda",
  purchase: "Entrada",
  adjust: "Ajuste",
  waste: "Perda",
};

function StockPanel({ product }: { product: PosProduct }) {
  const data = usePos();
  const [kind, setKind] = useState<StockMoveKind>("purchase");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(money2(product.cost));
  const [note, setNote] = useState("");
  const live = data.products.find((p) => p.id === product.id) ?? product;
  const moves = data.stockMoves
    .filter((m) => m.productId === product.id)
    .slice(0, 12);
  const n = num(qty);
  const valid = Number.isFinite(n) && (kind === "adjust" ? n >= 0 : n > 0);
  const apply = () => {
    if (!valid) {
      return;
    }
    let delta = n;
    if (kind === "adjust") {
      delta = n - (live.stock ?? 0);
    } else if (kind === "waste") {
      delta = -n;
    }
    const unitCost = num(cost);
    moveStock({
      productId: product.id,
      qty: delta,
      kind,
      unitCost:
        kind === "purchase" && Number.isFinite(unitCost) && cost
          ? unitCost
          : undefined,
      note: note.trim() || undefined,
    });
    setQty("");
    setNote("");
  };
  const unit = live.unit || "un";
  return (
    <Group title="Movimentar estoque">
      <p className="text-sm">
        Em estoque agora:{" "}
        <b className="tabular-nums">
          {fix(live.stock ?? 0)} {unit}
        </b>
      </p>
      <div className="flex rounded-full bg-muted p-1">
        {MOVE_KINDS.map((k) => (
          <button
            aria-pressed={kind === k.id}
            className={cn(
              "flex-1 rounded-full py-1.5 text-sm",
              kind === k.id
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            )}
            key={k.id}
            onClick={() => setKind(k.id)}
            type="button"
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          aria-label="Quantidade"
          inputMode="decimal"
          onChange={(e) => setQty(e.target.value)}
          placeholder={
            kind === "adjust" ? `Contei (${unit})` : `Qtd. (${unit})`
          }
          value={qty}
        />
        {kind === "purchase" ? (
          <Input
            aria-label="Custo unitário"
            inputMode="decimal"
            onChange={(e) => setCost(e.target.value)}
            placeholder="Custo unit."
            value={cost}
          />
        ) : (
          <Input
            aria-label="Observação"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo"
            value={note}
          />
        )}
      </div>
      <Button disabled={!valid} onClick={apply} type="button" variant="outline">
        Registrar {MOVE_KINDS.find((k) => k.id === kind)?.label.toLowerCase()}
      </Button>
      {kind === "purchase" ? (
        <p className="text-muted-foreground text-xs">
          O custo do produto é atualizado pela média ponderada.
        </p>
      ) : null}
      {moves.length ? (
        <ul className="divide-y text-sm">
          {moves.map((m) => (
            <li className="flex items-center justify-between py-1.5" key={m.id}>
              <span>
                {KIND_LABEL[m.kind]}
                <span className="text-muted-foreground text-xs">
                  {" "}
                  ·{" "}
                  {new Date(m.at).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  m.qty < 0 ? "text-destructive" : "text-[#3d7a5f]"
                )}
              >
                {m.qty > 0 ? "+" : ""}
                {fix(m.qty)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Group>
  );
}

function SalesPanel({
  product,
  currency,
}: {
  product: PosProduct;
  currency: string;
}) {
  const data = usePos();
  const stat = useMemo(
    () => productStats(data, periodFor("30d")).find((s) => s.id === product.id),
    [data, product.id]
  );
  return (
    <Group title="Últimos 30 dias">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Vendidos" value={fix(stat?.qty ?? 0)} />
        <Stat label="Faturou" value={money(stat?.revenue ?? 0, currency)} />
        <Stat
          label="Lucro"
          tone="good"
          value={money(stat?.profit ?? 0, currency)}
        />
      </div>
    </Group>
  );
}

function PriceStats({
  price,
  cost,
  currency,
}: {
  price: number;
  cost: number | undefined;
  currency: string;
}) {
  if (cost === undefined) {
    return (
      <p className="text-muted-foreground text-xs">
        Informe o custo para ver lucro, margem e markup.
      </p>
    );
  }
  const margin = marginOf({ price, cost });
  const markup = cost > 0 ? ((price - cost) / cost) * 100 : null;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat
        label="Lucro/un"
        tone={price - cost < 0 ? "bad" : "good"}
        value={money(price - cost, currency)}
      />
      <Stat
        label="Margem"
        tone={margin !== null && margin < 30 ? "bad" : undefined}
        value={margin === null ? "—" : `${Math.round(margin)}%`}
      />
      <Stat
        label="Markup"
        value={markup === null ? "—" : `${Math.round(markup)}%`}
      />
    </div>
  );
}

function ProductExtras({
  product,
  onClose,
}: {
  product: PosProduct;
  onClose: () => void;
}) {
  const data = usePos();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const live = data.products.find((x) => x.id === product.id) ?? product;
  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      {live.trackStock ? <StockPanel product={live} /> : null}
      <SalesPanel currency={data.settings.currency} product={live} />
      <Button
        onClick={() => {
          if (confirmDelete) {
            deleteProduct(product.id);
            onClose();
          }
          setConfirmDelete(true);
        }}
        type="button"
        variant={confirmDelete ? "destructive" : "ghost"}
      >
        <Icon className="size-4" name="IconTrashCan" />
        {confirmDelete ? "Toque de novo para excluir" : "Excluir produto"}
      </Button>
    </div>
  );
}

export function ProductForm({
  product,
  categories,
  onClose,
}: {
  product: PosProduct;
  categories: string[];
  onClose: () => void;
}) {
  const data = usePos();
  const cur = data.settings.currency;
  const [p, setP] = useState(product);
  const [price, setPrice] = useState(
    product.price ? money2(product.price) : ""
  );
  const [cost, setCost] = useState(money2(product.cost));
  const [stock, setStock] = useState(fix(product.stock ?? 0));
  const [minStock, setMinStock] = useState(fix(product.minStock ?? 0));
  const value = num(price);
  const costValue = cost ? num(cost) : undefined;
  const valid =
    p.name.trim() &&
    Number.isFinite(value) &&
    value >= 0 &&
    (costValue === undefined || Number.isFinite(costValue));
  const isNew = !data.products.some((x) => x.id === product.id);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      return;
    }
    const live = data.products.find((x) => x.id === p.id);
    saveProduct({
      ...p,
      name: p.name.trim(),
      category: p.category.trim() || "Outros",
      price: value,
      cost: costValue,
      // Stock is edited here only for new products; later through movements
      stock: isNew ? num(stock) || 0 : (live?.stock ?? p.stock),
      minStock: num(minStock) || 0,
    });
    onClose();
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{isNew ? "Novo produto" : p.name}</SheetTitle>
        </SheetHeader>
        <form className="flex flex-col gap-4 p-4" onSubmit={submit}>
          <Group title="Produto">
            <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-1">
              Nome
              <Input
                autoFocus={isNew}
                id="ppf-1"
                onChange={(e) => setP({ ...p, name: e.target.value })}
                value={p.name}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-2">
                Categoria
                <Input
                  id="ppf-2"
                  list="pos-categories"
                  onChange={(e) => setP({ ...p, category: e.target.value })}
                  value={p.category}
                />
                <datalist id="pos-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-3">
                Unidade
                <Input
                  id="ppf-3"
                  list="pos-units"
                  onChange={(e) => setP({ ...p, unit: e.target.value })}
                  value={p.unit ?? "un"}
                />
                <datalist id="pos-units">
                  {UNITS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-4">
                Código (SKU)
                <Input
                  autoCapitalize="characters"
                  id="ppf-4"
                  onChange={(e) => setP({ ...p, sku: e.target.value })}
                  value={p.sku ?? ""}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-5">
                Código de barras
                <Input
                  id="ppf-5"
                  inputMode="numeric"
                  onChange={(e) => setP({ ...p, barcode: e.target.value })}
                  value={p.barcode ?? ""}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {TILE_COLORS.map((c) => (
                <button
                  aria-label={`Cor ${c}`}
                  className={cn(
                    "size-7 rounded-full border-2",
                    p.color === c
                      ? "scale-110 border-foreground"
                      : "border-transparent"
                  )}
                  key={c}
                  onClick={() => setP({ ...p, color: c })}
                  style={{ background: c }}
                  type="button"
                />
              ))}
            </div>
            <span className="flex items-center justify-between text-sm">
              Disponível no caixa
              <Switch
                aria-label="Disponível no caixa"
                checked={p.available}
                onCheckedChange={(available) => setP({ ...p, available })}
              />
            </span>
          </Group>

          <Group title="Preço e custo">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-6">
                Preço de venda
                <Input
                  id="ppf-6"
                  inputMode="decimal"
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                  value={price}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-7">
                Custo
                <Input
                  id="ppf-7"
                  inputMode="decimal"
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0,00"
                  value={cost}
                />
              </label>
            </div>
            <PriceStats cost={costValue} currency={cur} price={value} />
          </Group>

          <Group title="Estoque">
            <span className="flex items-center justify-between text-sm">
              Controlar estoque
              <Switch
                aria-label="Controlar estoque"
                checked={Boolean(p.trackStock)}
                onCheckedChange={(trackStock) => setP({ ...p, trackStock })}
              />
            </span>
            {p.trackStock ? (
              <div className="grid grid-cols-2 gap-3">
                {isNew ? (
                  <label
                    className="flex flex-col gap-1.5 text-sm"
                    htmlFor="ppf-8"
                  >
                    Estoque inicial
                    <Input
                      id="ppf-8"
                      inputMode="decimal"
                      onChange={(e) => setStock(e.target.value)}
                      value={stock}
                    />
                  </label>
                ) : null}
                <label
                  className="flex flex-col gap-1.5 text-sm"
                  htmlFor="ppf-9"
                >
                  Avisar abaixo de
                  <Input
                    id="ppf-9"
                    inputMode="decimal"
                    onChange={(e) => setMinStock(e.target.value)}
                    value={minStock}
                  />
                </label>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Ligado, cada venda desconta do estoque e você vê alertas de
                estoque baixo.
              </p>
            )}
          </Group>

          <Button className="h-11" disabled={!valid} type="submit">
            Salvar
          </Button>
        </form>
        {isNew ? null : <ProductExtras onClose={onClose} product={p} />}
      </SheetContent>
    </Sheet>
  );
}
