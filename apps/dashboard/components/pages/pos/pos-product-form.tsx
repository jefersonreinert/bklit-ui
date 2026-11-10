"use client";

import { type ReactNode, useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { CategoryNode } from "@/lib/pos/categories";
import { api } from "@/convex/_generated/api";
import {
  AI_PROVIDERS,
  type AiProviderId,
  type RecognizedProduct,
} from "@/lib/ai/providers-meta";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import { periodFor, productStats, usePosDaily } from "@/lib/pos/analytics";
import { TILE_COLORS } from "@/lib/pos/seed";
import {
  deleteProduct,
  marginOf,
  money,
  moveStock,
  saveProduct,
  useCurrentCompany,
  usePos,
  usePosQuery,
} from "@/lib/pos/store";
import type { PosProduct, StockMove, StockMoveKind } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { cleanModifiers, ModifiersEditor } from "./pos-modifiers";
import { WineEditor } from "./pos-wine";
import { BarcodeScanner } from "./scan/barcode-scanner";

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
  const moves = (usePosQuery(api.pos.stockMoves, { productId: product.id }) ??
    []) as StockMove[];
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
                  {new Date(m.at).toLocaleString(appLocale(), {
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
  const period = useMemo(() => periodFor("30d"), []);
  const days = usePosDaily(period);
  const stat = useMemo(
    () => productStats(days ?? []).find((s) => s.id === product.id),
    [days, product.id]
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

/** Native select (the iPhone shows its wheel picker). */
const SELECT =
  "h-10 w-full rounded-lg border bg-background px-3 text-base sm:text-sm";
const NEW = "__new__";

function CategoryFields({
  p,
  tree,
  onChange,
}: {
  p: PosProduct;
  tree: CategoryNode[];
  onChange: (patch: Partial<PosProduct>) => void;
}) {
  const known = tree.some((c) => c.name === p.category);
  const [typingCat, setTypingCat] = useState(tree.length === 0);
  const node = tree.find((c) => c.name === p.category);
  const subs = node?.subs ?? [];
  const subKnown = !p.subcategory || subs.some((s) => s.name === p.subcategory);
  const [typingSub, setTypingSub] = useState(false);
  const catOptions = known || !p.category ? tree.map((c) => c.name) : [p.category, ...tree.map((c) => c.name)];
  const subOptions = subKnown || !p.subcategory ? subs.map((s) => s.name) : [p.subcategory, ...subs.map((s) => s.name)];
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-cat">
        Categoria
        {typingCat ? (
          <Input
            autoFocus={tree.length > 0}
            id="ppf-cat"
            onBlur={() => p.category && setTypingCat(false)}
            onChange={(e) => onChange({ category: e.target.value, subcategory: undefined })}
            placeholder="Ex.: Cervejas"
            value={p.category}
          />
        ) : (
          <select
            className={SELECT}
            id="ppf-cat"
            onChange={(e) => {
              if (e.target.value === NEW) {
                setTypingCat(true);
                onChange({ category: "", subcategory: undefined });
              } else {
                onChange({ category: e.target.value, subcategory: undefined });
              }
            }}
            value={p.category}
          >
            {catOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={NEW}>+ Nova categoria…</option>
          </select>
        )}
      </label>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-sub">
        Subcategoria
        {typingSub ? (
          <Input
            autoFocus
            id="ppf-sub"
            onBlur={() => setTypingSub(false)}
            onChange={(e) => onChange({ subcategory: e.target.value || undefined })}
            placeholder="Ex.: IPA"
            value={p.subcategory ?? ""}
          />
        ) : (
          <select
            className={SELECT}
            id="ppf-sub"
            onChange={(e) => {
              if (e.target.value === NEW) {
                setTypingSub(true);
                onChange({ subcategory: undefined });
              } else {
                onChange({ subcategory: e.target.value || undefined });
              }
            }}
            value={p.subcategory ?? ""}
          >
            <option value="">Nenhuma</option>
            {subOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={NEW}>+ Nova subcategoria…</option>
          </select>
        )}
      </label>
    </div>
  );
}

function AiNote({ ai }: { ai: AiSuggestion }) {
  const meta = ai.provider ? AI_PROVIDERS[ai.provider] : null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" name="IconSparkle" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Preenchido pela IA{meta ? ` · ${meta.product}` : ""}
          {ai.cached ? " (resultado já pago, reutilizado)" : ""}
        </p>
        <p className="text-muted-foreground text-xs">
          Confiança {Math.round(ai.product.confidence * 100)}%
          {ai.product.brand ? ` · ${ai.product.brand}` : ""}
          {ai.product.size ? ` · ${ai.product.size}` : ""}. Confira antes de salvar.
        </p>
        {ai.switched ? (
          <p className="mt-1 text-amber-700 text-xs dark:text-amber-300">
            O provedor principal falhou; a resposta veio de {meta?.label ?? "outro provedor"}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface AiSuggestion {
  product: RecognizedProduct;
  provider?: AiProviderId;
  cached?: boolean;
  switched?: boolean;
}

/**
 * The item page: a full screen (not a sheet) with every field of the
 * product, the category tree pickers, barcode scanning and, for new
 * items, what the AI recognized from the photo.
 */
export function ProductForm({
  product,
  tree,
  ai,
  onClose,
}: {
  product: PosProduct | null;
  tree: CategoryNode[];
  ai?: AiSuggestion | null;
  onClose: () => void;
}) {
  const data = usePos();
  const isNew = product ? !data.products.some((x) => x.id === product.id) : false;
  return (
    <FullPage
      backLabel="Itens"
      footer={
        product ? (
          <Button className="h-12 w-full text-base" form="pos-product-form" type="submit">
            {isNew ? "Criar item" : "Salvar alterações"}
          </Button>
        ) : null
      }
      onClose={onClose}
      open={product !== null}
      subtitle={
        product && !isNew
          ? [product.category, product.subcategory].filter(Boolean).join(" › ")
          : undefined
      }
      title={product ? (isNew ? "Novo item" : product.name || "Item") : ""}
    >
      {product ? (
        <ProductEditor ai={ai} key={product.id} onClose={onClose} product={product} tree={tree} />
      ) : null}
    </FullPage>
  );
}

function ProductEditor({
  product,
  tree,
  ai,
  onClose,
}: {
  product: PosProduct;
  tree: CategoryNode[];
  ai?: AiSuggestion | null;
  onClose: () => void;
}) {
  const data = usePos();
  const company = useCurrentCompany();
  const cur = data.settings.currency;
  const [p, setP] = useState(product);
  const [price, setPrice] = useState(
    product.price ? money2(product.price) : ""
  );
  const [cost, setCost] = useState(money2(product.cost));
  const [stock, setStock] = useState(fix(product.stock ?? 0));
  const [minStock, setMinStock] = useState(fix(product.minStock ?? 0));
  const [scanning, setScanning] = useState(false);
  const value = num(price);
  const costValue = cost ? num(cost) : undefined;
  const valid =
    p.name.trim() &&
    Number.isFinite(value) &&
    value >= 0 &&
    (costValue === undefined || Number.isFinite(costValue));
  const isNew = !data.products.some((x) => x.id === product.id);
  const barcode = p.barcode?.trim();
  const duplicate = barcode
    ? data.products.find((x) => x.id !== p.id && x.barcode?.trim() === barcode)
    : undefined;

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
      subcategory: p.subcategory?.trim() || undefined,
      barcode: barcode || undefined,
      price: value,
      cost: costValue,
      // Stock is edited here only for new products; later through movements
      stock: isNew ? num(stock) || 0 : (live?.stock ?? p.stock),
      minStock: num(minStock) || 0,
      modifiers: cleanModifiers(p.modifiers ?? []),
      wine: p.wine
        ? { ...p.wine, pours: p.wine.pours.filter((x) => x.ml > 0) }
        : undefined,
    });
    onClose();
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
        <form className="flex flex-col gap-4 p-4" id="pos-product-form" onSubmit={submit}>
          {ai && isNew ? <AiNote ai={ai} /> : null}
          <Group title="Item">
            <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-1">
              Nome
              <Input
                autoFocus={isNew && !p.name}
                id="ppf-1"
                onChange={(e) => setP({ ...p, name: e.target.value })}
                value={p.name}
              />
            </label>
            <CategoryFields onChange={(patch) => setP({ ...p, ...patch })} p={p} tree={tree} />
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
            <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-5">
              Código de barras
              <span className="flex gap-2">
                <Input
                  className="flex-1 font-mono tabular-nums"
                  id="ppf-5"
                  inputMode="numeric"
                  onChange={(e) => setP({ ...p, barcode: e.target.value })}
                  placeholder="Escaneie ou digite"
                  value={p.barcode ?? ""}
                />
                <Button
                  aria-label="Escanear com a câmera"
                  className="h-10 shrink-0"
                  onClick={() => setScanning(true)}
                  type="button"
                  variant="outline"
                >
                  <Icon className="size-4" name="IconBarcode" />
                  <span className="hidden sm:inline">Escanear</span>
                </Button>
              </span>
              {duplicate ? (
                <span className="text-destructive text-xs" role="alert">
                  Este código já está em “{duplicate.name}”.
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">
                  Também funciona com leitor Bluetooth/USB: toque no campo e leia o código.
                </span>
              )}
            </label>
            {p.description !== undefined || isNew ? (
              <label className="flex flex-col gap-1.5 text-sm" htmlFor="ppf-desc">
                Descrição
                <Input
                  id="ppf-desc"
                  onChange={(e) => setP({ ...p, description: e.target.value || undefined })}
                  value={p.description ?? ""}
                />
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {TILE_COLORS.map((c) => (
                <button
                  aria-label={`Cor ${c}`}
                  aria-pressed={p.color === c}
                  className={cn(
                    "size-8 rounded-full border-2",
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

          {p.wine || company?.wine ? (
            <Group title="Vinho">
              <WineEditor
                onChange={(wine) =>
                  setP({
                    ...p,
                    wine,
                    unit: wine ? "garrafa" : p.unit,
                  })
                }
                value={p.wine}
              />
            </Group>
          ) : null}

          <Group title="Opções (steps)">
            <ModifiersEditor
              onChange={(modifiers) => setP({ ...p, modifiers })}
              value={p.modifiers ?? []}
            />
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

        </form>
        {isNew ? null : <ProductExtras onClose={onClose} product={p} />}
      <BarcodeScanner
        onClose={() => setScanning(false)}
        onCode={(r) => {
          setP((cur) => ({ ...cur, barcode: r.code }));
          setScanning(false);
        }}
        open={scanning}
        title="Código do item"
      />
    </div>
  );
}
