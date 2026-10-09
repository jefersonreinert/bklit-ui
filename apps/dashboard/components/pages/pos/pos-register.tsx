"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/lib/icons";
import {
  addCustomAmount,
  addProduct,
  createOrder,
  itemCount,
  money,
  orderTotals,
  sendToKitchen,
  updateOrder,
  usePos,
} from "@/lib/pos/store";
import type { PosData, PosOrder, PosProduct } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { useCan } from "./pos-auth";
import { CartPanel, orderLabel } from "./pos-cart";
import { CheckoutSheet } from "./pos-checkout";
import { activeGroups, ModifierSheet } from "./pos-modifiers";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "back"];
const MAX_CENTS = 9_999_999;

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button
          aria-label={
            { "+": "Adicionar valor", back: "Apagar" }[k] ?? `Número ${k}`
          }
          className="flex h-16 items-center justify-center rounded-2xl bg-card text-3xl shadow-xs transition-colors active:bg-muted sm:h-20"
          key={k}
          onClick={() => onKey(k)}
          type="button"
        >
          {k === "+" ? (
            <Icon className="size-7 text-[#6f8fcf]" name="IconPlusLarge" />
          ) : null}
          {k === "back" ? (
            <Icon
              className="size-7 text-destructive/70"
              name="IconArrowLeftX"
            />
          ) : null}
          {k === "+" || k === "back" ? null : k}
        </button>
      ))}
    </div>
  );
}

function ProductGrid({
  products,
  currency,
  onPick,
}: {
  products: PosProduct[];
  currency: string;
  onPick: (p: PosProduct) => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))],
    [products]
  );
  const q = query.trim().toLowerCase();
  const list = products.filter(
    (p) =>
      p.available &&
      (!category || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q))
  );
  return (
    <div className="flex flex-col gap-3">
      <Input
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar produto…"
        value={query}
      />
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[null, ...categories].map((c) => (
          <button
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
              category === c
                ? "border-foreground bg-foreground text-background"
                : "bg-card hover:bg-muted"
            )}
            key={c ?? "all"}
            onClick={() => setCategory(c)}
            type="button"
          >
            {c ?? "Todos"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {list.map((p) => (
          <button
            className="flex min-h-20 flex-col justify-between gap-2 rounded-2xl border-l-4 bg-card p-3 text-left shadow-xs transition-colors active:bg-muted"
            key={p.id}
            onClick={() => onPick(p)}
            style={{ borderLeftColor: p.color }}
            type="button"
          >
            <span className="line-clamp-2 font-medium text-sm leading-snug">
              {p.name}
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">
              {money(p.price, currency)}
            </span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          Nenhum produto. Cadastre em Produtos.
        </p>
      ) : null}
    </div>
  );
}

function useRegister(
  activeOrderId: string | null,
  onActiveOrder: (id: string | null) => void
) {
  const data = usePos();
  const order = data.orders.find(
    (o) =>
      o.id === activeOrderId && (o.status === "open" || o.status === "paying")
  );
  const ensureOrder = () => {
    if (order) {
      return order.id;
    }
    const created = createOrder({});
    onActiveOrder(created.id);
    return created.id;
  };
  return { data, order, ensureOrder };
}

function AmountHeader({
  order,
  data,
  cents,
  onName,
}: {
  order: PosOrder | undefined;
  data: PosData;
  cents: number;
  onName: (name: string) => void;
}) {
  const currency = data.settings.currency;
  const orderTotal = order ? orderTotals(order).total : 0;
  const shown = cents > 0 ? cents / 100 : orderTotal;
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <Input
        aria-label="Nome da comanda"
        className="h-9 max-w-64 border-none bg-transparent text-center text-base shadow-none focus-visible:ring-0"
        onChange={(e) => onName(e.target.value)}
        placeholder={order ? orderLabel(order, data) : "Nome da comanda"}
        value={order?.name ?? ""}
      />
      <p
        className={cn(
          "font-semibold text-5xl tabular-nums tracking-tight sm:text-6xl",
          cents > 0 ? "" : "text-foreground/90"
        )}
      >
        {money(shown, currency)}
      </p>
      <p className="h-4 text-muted-foreground text-xs">
        {cents > 0 ? "Toque + para adicionar ao pedido" : null}
      </p>
    </div>
  );
}

export function RegisterView({
  activeOrderId,
  onActiveOrder,
}: {
  activeOrderId: string | null;
  onActiveOrder: (id: string | null) => void;
}) {
  const { data, order, ensureOrder } = useRegister(
    activeOrderId,
    onActiveOrder
  );
  const [mode, setMode] = useState<"products" | "keypad">("products");
  const [cents, setCents] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<PosProduct | null>(null);
  const currency = data.settings.currency;

  const addTyped = () => {
    if (cents > 0) {
      addCustomAmount(ensureOrder(), cents / 100, "Valor avulso");
      setCents(0);
    }
  };
  const onKey = (k: string) => {
    if (k === "+") {
      addTyped();
    } else if (k === "back") {
      setCents((c) => Math.floor(c / 10));
    } else {
      setCents((c) => Math.min(MAX_CENTS, c * 10 + Number(k)));
    }
  };
  const startCheckout = () => {
    const id = ensureOrder();
    if (cents > 0) {
      addCustomAmount(id, cents / 100, "Valor avulso");
      setCents(0);
    }
    setCartOpen(false);
    setCheckoutId(id);
  };
  // Looked up by id so the "paid" confirmation stays after the order closes
  const checkoutOrder = data.orders.find((o) => o.id === checkoutId);
  const toggleTax = () => {
    const id = ensureOrder();
    const current = data.orders.find((o) => o.id === id);
    updateOrder(id, {
      taxRate: current?.taxRate ? 0 : data.settings.taxRate,
    });
  };

  const total = order ? orderTotals(order).total : 0;
  const count = order ? itemCount(order) : 0;
  const can = useCan();
  const canCharge = can("charge") && (total > 0 || cents > 0);
  const cart = (
    <CartPanel
      data={data}
      onCheckout={startCheckout}
      onMoved={(id) => onActiveOrder(id)}
      onNew={() => {
        onActiveOrder(null);
        setCartOpen(false);
      }}
      order={order}
    />
  );

  return (
    <div className="mx-auto grid h-full w-full max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_380px]">
      <div className="flex min-w-0 flex-col gap-4 pb-28 lg:pb-4">
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-muted p-1">
            {(
              [
                ["products", "IconListBullets", "Produtos"],
                ["keypad", "IconCalculator", "Teclado"],
              ] as const
            ).map(([m, icon, label]) => (
              <button
                aria-label={label}
                aria-pressed={mode === m}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full transition-colors",
                  mode === m ? "bg-card shadow-sm" : "text-muted-foreground"
                )}
                key={m}
                onClick={() => setMode(m)}
                type="button"
              >
                <Icon className="size-5" name={icon} />
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors",
                order?.taxRate ? "bg-foreground text-background" : "bg-muted"
              )}
              onClick={toggleTax}
              type="button"
            >
              <Icon className="size-4" name="IconPlusSmall" />
              Taxa {data.settings.taxRate}%
            </button>
          </div>
        </div>
        <AmountHeader
          cents={cents}
          data={data}
          onName={(name) => updateOrder(ensureOrder(), { name })}
          order={order}
        />
        {mode === "keypad" ? (
          <Keypad onKey={onKey} />
        ) : (
          <ProductGrid
            currency={currency}
            onPick={(p) =>
              activeGroups(p).length
                ? setChoosing(p)
                : addProduct(ensureOrder(), p)
            }
            products={data.products}
          />
        )}
      </div>

      <aside className="hidden min-h-0 lg:flex">{cart}</aside>

      {/* Phone: action bar like a handheld register */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+max(0.25rem,env(safe-area-inset-bottom)-0.5rem))] z-20 flex items-center gap-3 px-4 pb-2 md:bottom-4 lg:hidden">
        <button
          aria-label="Enviar para a cozinha"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-sm disabled:opacity-50"
          disabled={!order?.items.some((i) => !i.sent)}
          onClick={() => order && sendToKitchen(order.id)}
          type="button"
        >
          <Icon className="size-6" name="IconFire2" />
        </button>
        <button
          className="h-14 flex-1 rounded-full bg-foreground font-medium text-background text-lg shadow-sm transition-opacity disabled:bg-muted-foreground/40"
          disabled={!canCharge}
          onClick={startCheckout}
          type="button"
        >
          Cobrar {money(total + cents / 100, currency)}
        </button>
        <button
          aria-label="Ver pedido"
          className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-muted shadow-sm"
          onClick={() => setCartOpen(true)}
          type="button"
        >
          <Icon className="size-6" name="IconBasket1" />
          {count > 0 ? (
            <span className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-[#c96442] font-medium text-white text-xs">
              {count}
            </span>
          ) : null}
        </button>
      </div>

      <Sheet onOpenChange={setCartOpen} open={cartOpen}>
        <SheetContent className="max-h-[85dvh] rounded-t-3xl p-0" side="bottom">
          <SheetTitle className="sr-only">Pedido</SheetTitle>
          {cart}
        </SheetContent>
      </Sheet>
      <ModifierSheet
        currency={currency}
        onAdd={(extra) => {
          if (choosing) {
            addProduct(ensureOrder(), choosing, extra);
          }
        }}
        onClose={() => setChoosing(null)}
        product={choosing}
      />
      {checkoutOrder ? (
        <CheckoutSheet
          data={data}
          onClose={() => setCheckoutId(null)}
          onDone={() => {
            setCheckoutId(null);
            onActiveOrder(null);
          }}
          open
          order={checkoutOrder}
        />
      ) : null}
    </div>
  );
}
