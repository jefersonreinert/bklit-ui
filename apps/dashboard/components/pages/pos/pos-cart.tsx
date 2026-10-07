"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { changeQty, money, orderTotals, sendToKitchen } from "@/lib/pos/store";
import type { PosData, PosOrder } from "@/lib/pos/types";

/** "Mesa 5 · Ana", "Ana" or "Pedido #12". */
export function orderLabel(order: PosOrder, data: PosData) {
  const table = order.tableId
    ? data.areas.flatMap((a) => a.tables).find((t) => t.id === order.tableId)
    : null;
  const parts = [table ? `Mesa ${table.name}` : null, order.name || null];
  const label = parts.filter(Boolean).join(" · ");
  return label || `Pedido #${order.number}`;
}

export function CartPanel({
  order,
  data,
  onCheckout,
  onNew,
}: {
  order: PosOrder | undefined;
  data: PosData;
  onCheckout: () => void;
  onNew: () => void;
}) {
  const currency = data.settings.currency;
  if (!order || order.items.length === 0) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        <Icon className="size-8" name="IconBasket1" />
        {order ? orderLabel(order, data) : "Pedido vazio"}
        <span>Toque nos produtos ou digite um valor.</span>
      </div>
    );
  }
  const t = orderTotals(order);
  const pending = order.items.some((i) => !i.sent);
  return (
    <div className="flex max-h-full w-full flex-col overflow-hidden rounded-3xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{orderLabel(order, data)}</p>
          <p className="text-muted-foreground text-xs">
            Pedido #{order.number}
            {order.status === "paying" ? " · aguardando pagamento" : ""}
          </p>
        </div>
        <Button onClick={onNew} size="sm" variant="ghost">
          Novo
        </Button>
      </div>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto px-4">
        {order.items.map((i) => (
          <li className="flex items-center gap-2 py-2.5" key={i.id}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{i.name}</p>
              <p className="text-muted-foreground text-xs">
                {money(i.price, currency)}
                {i.sent ? " · na cozinha" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label={`Menos ${i.name}`}
                className="flex size-8 items-center justify-center rounded-full bg-muted"
                onClick={() => changeQty(order.id, i.id, -1)}
                type="button"
              >
                <Icon className="size-4" name="IconMinusSmall" />
              </button>
              <span className="w-6 text-center text-sm tabular-nums">
                {i.qty}
              </span>
              <button
                aria-label={`Mais ${i.name}`}
                className="flex size-8 items-center justify-center rounded-full bg-muted"
                onClick={() => changeQty(order.id, i.id, 1)}
                type="button"
              >
                <Icon className="size-4" name="IconPlusSmall" />
              </button>
            </div>
            <span className="w-20 text-right font-medium text-sm tabular-nums">
              {money(i.price * i.qty, currency)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 border-t px-4 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(t.subtotal, currency)}</span>
        </div>
        {order.taxRate ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Taxa {order.taxRate}%</span>
            <span className="tabular-nums">{money(t.tax, currency)}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-semibold text-base">
          <span>Total</span>
          <span className="tabular-nums">{money(t.total, currency)}</span>
        </div>
      </div>
      <div className="flex gap-2 border-t p-3">
        <Button
          className="h-12 rounded-full"
          disabled={!pending}
          onClick={() => sendToKitchen(order.id)}
          variant="outline"
        >
          <Icon className="size-5" name="IconFire2" />
          Cozinha
        </Button>
        <Button
          className="h-12 flex-1 rounded-full text-base"
          onClick={onCheckout}
        >
          Cobrar {money(t.total, currency)}
        </Button>
      </div>
    </div>
  );
}
