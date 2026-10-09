"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/lib/icons";
import {
  changeQty,
  money,
  orderTotals,
  sendToKitchen,
  setItemNote,
} from "@/lib/pos/store";
import type { OrderItem, PosData, PosOrder } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { lineDetail } from "./pos-modifiers";
import { TransferSheet } from "./pos-transfer";

/** "Mesa 5 · Ana", "Ana" or "Pedido #12". */
export function orderLabel(order: PosOrder, data: PosData) {
  const table = order.tableId
    ? data.areas.flatMap((a) => a.tables).find((t) => t.id === order.tableId)
    : null;
  const parts = [table ? `Mesa ${table.name}` : null, order.name || null];
  const label = parts.filter(Boolean).join(" · ");
  return label || `Pedido #${order.number}`;
}

function NoteSheet({
  item,
  onClose,
  onSave,
}: {
  item: OrderItem | null;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Sheet
      onOpenChange={(o) => (o ? setNote(item?.note ?? "") : onClose())}
      open={Boolean(item)}
    >
      <SheetContent
        className="acrylic gap-3 rounded-t-3xl bg-popover p-4 sm:mx-auto sm:max-w-lg"
        side="bottom"
      >
        <SheetTitle>Observação · {item?.name}</SheetTitle>
        <Input
          autoFocus
          defaultValue={item?.note ?? ""}
          key={item?.id}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex.: sem tomate, molho à parte…"
        />
        <Button
          className="h-11 rounded-full"
          onClick={() => {
            onSave(note);
            onClose();
          }}
        >
          Salvar observação
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export function CartPanel({
  order,
  data,
  onCheckout,
  onNew,
  onMoved,
}: {
  order: PosOrder | undefined;
  data: PosData;
  onCheckout: () => void;
  onNew: () => void;
  /** After a transfer: the order now holding the items. */
  onMoved?: (orderId: string) => void;
}) {
  const currency = data.settings.currency;
  const [noting, setNoting] = useState<OrderItem | null>(null);
  const [moving, setMoving] = useState(false);
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
  const orderId = order.id;
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
        <Button
          aria-label="Transferir mesa ou itens"
          onClick={() => setMoving(true)}
          size="sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconArrowsRepeatRightLeft" />
          Transferir
        </Button>
        <Button onClick={onNew} size="sm" variant="ghost">
          Novo
        </Button>
      </div>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto px-4">
        {order.items.map((i) => (
          <li className="flex items-center gap-2 py-2.5" key={i.id}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{i.name}</p>
              {lineDetail(i) ? (
                <p className="truncate text-[#c96442] text-xs">
                  {lineDetail(i)}
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                {money(i.price, currency)}
                {i.sent ? " · na cozinha" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {i.sent ? null : (
                <button
                  aria-label={`Observação para ${i.name}`}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full",
                    i.note
                      ? "bg-[#c96442]/15 text-[#c96442]"
                      : "text-muted-foreground"
                  )}
                  onClick={() => setNoting(i)}
                  type="button"
                >
                  <Icon className="size-4" name="IconNoteText" />
                </button>
              )}
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
      <TransferSheet
        onClose={() => setMoving(false)}
        onMoved={onMoved}
        open={moving}
        order={order}
      />
      <NoteSheet
        item={noting}
        onClose={() => setNoting(null)}
        onSave={(note) =>
          noting ? setItemNote(orderId, noting.id, note) : undefined
        }
      />
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
