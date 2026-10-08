"use client";

import { useState } from "react";
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
import { Icon } from "@/lib/icons";
import {
  deleteOrder,
  itemCount,
  money,
  orderTotals,
  payOrder,
  updateOrder,
  useClosedOrders,
  usePos,
} from "@/lib/pos/store";
import type {
  OrderStatus,
  PaymentMethod,
  PosData,
  PosOrder,
} from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { orderLabel } from "./pos-cart";
import { ReceiptSheet } from "./pos-receipt";

type Filter = "open" | "paying" | "paid" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Abertos" },
  { id: "paying", label: "Aguardando" },
  { id: "paid", label: "Pagos" },
  { id: "all", label: "Todos" },
];

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  open: { label: "Aberto", className: "bg-[#c96442]/15 text-[#c96442]" },
  paying: {
    label: "Aguardando pagamento",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  paid: {
    label: "Pago",
    className: "bg-[#3d7a5f]/15 text-[#3d7a5f] dark:text-emerald-300",
  },
  void: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

const METHOD: Record<PaymentMethod, string> = {
  card: "Cartão (aproximação)",
  qr: "QR code SumUp",
  cash: "Dinheiro",
  link: "Link de pagamento",
  other: "Outro meio",
};

const time = (ts: number) =>
  new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function isToday(ts: number) {
  return new Date(ts).toDateString() === new Date().toDateString();
}

function Summary({ data }: { data: PosData }) {
  const paidToday = data.orders.filter(
    (o) => o.status === "paid" && o.payment && isToday(o.payment.at)
  );
  const sales = paidToday.reduce((a, o) => a + (o.payment?.amount ?? 0), 0);
  const open = data.orders.filter(
    (o) => o.status === "open" || o.status === "paying"
  );
  const cur = data.settings.currency;
  const tiles = [
    { label: "Vendas hoje", value: money(sales, cur) },
    { label: "Pedidos pagos hoje", value: String(paidToday.length) },
    {
      label: "Ticket médio",
      value: money(paidToday.length ? sales / paidToday.length : 0, cur),
    },
    { label: "Em aberto", value: String(open.length) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <div className="rounded-2xl border bg-card p-3" key={t.label}>
          <p className="text-muted-foreground text-xs">{t.label}</p>
          <p className="font-semibold text-xl tabular-nums">{t.value}</p>
        </div>
      ))}
    </div>
  );
}

function ReceiptButton({ order }: { order: PosOrder }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon className="size-4" name="IconPrinter" />
        Recibo · imprimir ou PDF
      </Button>
      <ReceiptSheet
        onClose={() => setOpen(false)}
        order={open ? order : null}
      />
    </>
  );
}

function OrderDetail({
  order,
  data,
  onClose,
  onOpenOrder,
}: {
  order: PosOrder;
  data: PosData;
  onClose: () => void;
  onOpenOrder: (id: string) => void;
}) {
  const cur = data.settings.currency;
  const t = orderTotals(order);
  const active = order.status === "open" || order.status === "paying";
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-md!"
        side="right"
      >
        <SheetHeader className="gap-2 border-b p-5">
          <SheetTitle>{orderLabel(order, data)}</SheetTitle>
          <SheetDescription>
            Pedido #{order.number} · aberto {time(order.createdAt)}
          </SheetDescription>
          <span
            className={cn(
              "w-fit rounded-full px-2.5 py-1 text-xs",
              STATUS[order.status].className
            )}
          >
            {STATUS[order.status].label}
          </span>
        </SheetHeader>
        <ul className="divide-y px-5">
          {order.items.map((i) => (
            <li
              className="flex justify-between gap-2 py-2.5 text-sm"
              key={i.id}
            >
              <span>
                {i.qty}× {i.name}
              </span>
              <span className="tabular-nums">
                {money(i.price * i.qty, cur)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t px-5 py-3 text-sm">
          {order.taxRate ? (
            <div className="flex justify-between text-muted-foreground">
              <span>Taxa {order.taxRate}%</span>
              <span>{money(t.tax, cur)}</span>
            </div>
          ) : null}
          {order.payment?.tip ? (
            <div className="flex justify-between text-muted-foreground">
              <span>Gorjeta</span>
              <span>{money(order.payment.tip, cur)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span>
            <span className="tabular-nums">
              {money(order.payment?.amount ?? t.total, cur)}
            </span>
          </div>
          {order.payment && order.status === "paid" ? (
            <p className="text-muted-foreground text-xs">
              {METHOD[order.payment.method]} · {time(order.payment.at)}
              {order.payment.ref ? ` · ${order.payment.ref}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 border-t p-5">
          {order.status === "paying" ? (
            <>
              <p className="text-muted-foreground text-xs">
                O cartão foi enviado para o app da SumUp. Confirme quando a
                cobrança aparecer como aprovada.
              </p>
              <Button
                onClick={() => {
                  payOrder(order.id, {
                    method: "card",
                    amount: order.payment?.amount ?? t.total,
                    tip: order.payment?.tip ?? 0,
                  });
                  onClose();
                }}
              >
                Confirmar pagamento
              </Button>
              <Button
                onClick={() => updateOrder(order.id, { status: "open" })}
                variant="outline"
              >
                Pagamento não aprovado
              </Button>
            </>
          ) : null}
          {active ? (
            <Button
              onClick={() => {
                onOpenOrder(order.id);
                onClose();
              }}
              variant={order.status === "paying" ? "ghost" : "default"}
            >
              <Icon className="size-4" name="IconCalculator" />
              Abrir no caixa
            </Button>
          ) : null}
          {order.status === "paid" ? <ReceiptButton order={order} /> : null}
          {active ? (
            <Button
              onClick={() => {
                updateOrder(order.id, { status: "void" });
                onClose();
              }}
              variant="ghost"
            >
              Cancelar pedido
            </Button>
          ) : (
            <Button
              onClick={() => {
                deleteOrder(order.id);
                onClose();
              }}
              variant="ghost"
            >
              <Icon className="size-4" name="IconTrashCan" />
              Excluir do histórico
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function OrdersView({
  onOpenOrder,
}: {
  onOpenOrder: (id: string) => void;
}) {
  const data = usePos();
  useClosedOrders();
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const list = data.orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      (!q ||
        orderLabel(o, data).toLowerCase().includes(q) ||
        String(o.number).includes(q))
  );
  const selected = data.orders.find((o) => o.id === selectedId);
  const cur = data.settings.currency;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-4 pb-8">
      <Summary data={data} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                filter === f.id ? "bg-card shadow-sm" : "text-muted-foreground"
              )}
              key={f.id}
              onClick={() => setFilter(f.id)}
              type="button"
            >
              {f.label}
            </button>
          ))}
        </div>
        <Input
          className="min-w-40 flex-1"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar mesa, nome ou número…"
          value={query}
        />
      </div>
      <ul className="flex flex-col gap-2">
        {list.map((o) => (
          <li key={o.id}>
            <button
              className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-muted"
              onClick={() => setSelectedId(o.id)}
              type="button"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted font-semibold text-sm">
                #{o.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {orderLabel(o, data)}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {itemCount(o)} itens · {time(o.updatedAt)}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="font-semibold tabular-nums">
                  {money(o.payment?.amount ?? orderTotals(o).total, cur)}
                </span>
                <Badge
                  className={cn("border-0", STATUS[o.status].className)}
                  variant="outline"
                >
                  {STATUS[o.status].label}
                </Badge>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground text-sm">
          Nenhum pedido aqui.
        </p>
      ) : null}
      {selected ? (
        <OrderDetail
          data={data}
          onClose={() => setSelectedId(null)}
          onOpenOrder={onOpenOrder}
          order={selected}
        />
      ) : null}
    </div>
  );
}
