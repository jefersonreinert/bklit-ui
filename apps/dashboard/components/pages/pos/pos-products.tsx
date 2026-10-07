"use client";

import { useMemo, useState } from "react";
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
import { TILE_COLORS } from "@/lib/pos/seed";
import {
  deleteProduct,
  money,
  resetPos,
  saveProduct,
  saveSettings,
  uid,
  usePos,
} from "@/lib/pos/store";
import type { PosProduct, PosSettings } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

const CURRENCIES = ["EUR", "BRL", "USD", "GBP"];

function ProductForm({
  product,
  categories,
  onClose,
}: {
  product: PosProduct;
  categories: string[];
  onClose: () => void;
}) {
  const [p, setP] = useState(product);
  const [price, setPrice] = useState(
    product.price ? product.price.toFixed(2) : ""
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const value = Number(price.replace(",", "."));
  const valid = p.name.trim() && Number.isFinite(value) && value >= 0;
  const isNew = !product.name;
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{isNew ? "Novo produto" : "Editar produto"}</SheetTitle>
        </SheetHeader>
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              saveProduct({
                ...p,
                name: p.name.trim(),
                category: p.category.trim() || "Outros",
                price: value,
              });
              onClose();
            }
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-name">
            Nome
            <Input
              autoFocus
              id="pos-name"
              onChange={(e) => setP({ ...p, name: e.target.value })}
              value={p.name}
            />
          </label>
          <label
            className="flex flex-col gap-1.5 text-sm"
            htmlFor="pos-category"
          >
            Categoria
            <Input
              id="pos-category"
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
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-price">
            Preço
            <Input
              id="pos-price"
              inputMode="decimal"
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
              value={price}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            Cor do botão
            <div className="flex flex-wrap gap-2">
              {TILE_COLORS.map((c) => (
                <button
                  aria-label={`Cor ${c}`}
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
          </div>
          <span className="flex items-center justify-between text-sm">
            Disponível no caixa
            <Switch
              aria-label="Disponível no caixa"
              checked={p.available}
              onCheckedChange={(available) => setP({ ...p, available })}
            />
          </span>
          <Button className="h-11" disabled={!valid} type="submit">
            Salvar
          </Button>
          {isNew ? null : (
            <Button
              onClick={() => {
                if (confirmDelete) {
                  deleteProduct(p.id);
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
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function PosSettingsCard({ settings }: { settings: PosSettings }) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="flex flex-col gap-4 rounded-3xl border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="size-4" name="IconSettingsGear1" />
        Configurações do POS
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-currency">
          Moeda
          <select
            className="h-9 rounded-md border bg-transparent px-2"
            id="pos-currency"
            onChange={(e) => saveSettings({ currency: e.target.value })}
            value={settings.currency}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-tax">
          Taxa de serviço (%)
          <Input
            id="pos-tax"
            inputMode="decimal"
            onChange={(e) =>
              saveSettings({
                taxRate: Number(e.target.value.replace(",", ".")) || 0,
              })
            }
            value={String(settings.taxRate)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-sumup">
        Chave de afiliado SumUp (cartão por aproximação)
        <Input
          autoComplete="off"
          id="pos-sumup"
          onChange={(e) =>
            saveSettings({ sumupAffiliateKey: e.target.value.trim() })
          }
          placeholder="Gere em me.sumup.com → Developers"
          value={settings.sumupAffiliateKey}
        />
        <span className="text-muted-foreground text-xs">
          Com o app SumUp instalado e o Tap to Pay ativado, o botão “Cartão por
          aproximação” abre a cobrança no telefone e volta com o resultado.
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="pos-link">
        Link de pagamento
        <Input
          autoComplete="off"
          id="pos-link"
          onChange={(e) => saveSettings({ paymentLink: e.target.value.trim() })}
          placeholder="https://… use {amount} e {ref}"
          value={settings.paymentLink}
        />
        <span className="text-muted-foreground text-xs">
          Ex.: um link de pagamento do Stripe, SumUp ou Revolut. {"{amount}"}{" "}
          vira o valor e {"{ref}"} o número do pedido.
        </span>
      </label>
      <Button
        className="self-start"
        onClick={() => {
          if (confirmReset) {
            resetPos();
          }
          setConfirmReset(!confirmReset);
        }}
        size="sm"
        variant={confirmReset ? "destructive" : "ghost"}
      >
        {confirmReset
          ? "Toque de novo: apaga pedidos, mesas e produtos"
          : "Restaurar dados de exemplo"}
      </Button>
    </div>
  );
}

export function ProductsView() {
  const data = usePos();
  const [editing, setEditing] = useState<PosProduct | null>(null);
  const [query, setQuery] = useState("");
  const categories = useMemo(
    () => [...new Set(data.products.map((p) => p.category))],
    [data.products]
  );
  const q = query.trim().toLowerCase();
  const cur = data.settings.currency;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-8">
      <div className="flex gap-2">
        <Input
          className="flex-1"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar produto…"
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
            })
          }
        >
          <Icon className="size-4" name="IconPlusSmall" />
          Novo produto
        </Button>
      </div>
      {categories.map((c) => {
        const list = data.products.filter(
          (p) => p.category === c && (!q || p.name.toLowerCase().includes(q))
        );
        if (list.length === 0) {
          return null;
        }
        return (
          <section className="flex flex-col gap-2" key={c}>
            <h3 className="font-semibold text-muted-foreground text-sm">{c}</h3>
            <ul className="divide-y rounded-2xl border bg-card">
              {list.map((p) => (
                <li className="flex items-center gap-3 px-3 py-2.5" key={p.id}>
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setEditing(p)}
                    type="button"
                  >
                    <span
                      className={cn(
                        "block truncate text-sm",
                        !p.available && "text-muted-foreground line-through"
                      )}
                    >
                      {p.name}
                    </span>
                    <span className="block text-muted-foreground text-xs tabular-nums">
                      {money(p.price, cur)}
                    </span>
                  </button>
                  <Switch
                    aria-label={`${p.name} disponível`}
                    checked={p.available}
                    onCheckedChange={(available) =>
                      saveProduct({ ...p, available })
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <PosSettingsCard settings={data.settings} />
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
