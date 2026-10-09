"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/lib/icons";
import {
  itemCount,
  money,
  openOrderFor,
  orderTotals,
  transferItems,
  usePos,
} from "@/lib/pos/store";
import type { PosOrder } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { lineDetail } from "./pos-modifiers";

/** Move a whole table or some items to another table (joins its order). */
export function TransferSheet({
  order,
  open,
  onClose,
  onMoved,
}: {
  order: PosOrder;
  open: boolean;
  onClose: () => void;
  onMoved?: (orderId: string) => void;
}) {
  const data = usePos();
  const [selected, setSelected] = useState<string[]>([]);
  const [areaId, setAreaId] = useState(data.areas[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const cur = data.settings.currency;
  const all = selected.length === 0 || selected.length === order.items.length;
  const area = data.areas.find((a) => a.id === areaId) ?? data.areas[0];

  const move = async (tableId: string) => {
    setBusy(true);
    const target = await transferItems(order.id, tableId, all ? [] : selected);
    setBusy(false);
    setSelected([]);
    if (target) {
      onMoved?.(target);
    }
    onClose();
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="acrylic max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl bg-popover sm:mx-auto sm:max-w-2xl"
        side="bottom"
      >
        <SheetHeader className="border-b pb-3">
          <SheetTitle>Transferir</SheetTitle>
          <p className="text-muted-foreground text-sm">
            {all
              ? "A mesa inteira vai para a mesa escolhida."
              : `${selected.length} item(ns) vão para a mesa escolhida.`}{" "}
            Se ela já tiver pedido, os itens entram nele.
          </p>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <p className="font-medium text-sm">
              Itens (nenhum marcado = todos)
            </p>
            <ul className="divide-y rounded-2xl border">
              {order.items.map((i) => {
                const on = selected.includes(i.id);
                return (
                  <li key={i.id}>
                    <button
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                      onClick={() =>
                        setSelected(
                          on
                            ? selected.filter((x) => x !== i.id)
                            : [...selected, i.id]
                        )
                      }
                      type="button"
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-md border",
                          on &&
                            "border-foreground bg-foreground text-background"
                        )}
                      >
                        {on ? (
                          <Icon className="size-3.5" name="IconCheckmark1" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {i.qty}× {i.name}
                        </span>
                        {lineDetail(i) ? (
                          <span className="block truncate text-muted-foreground text-xs">
                            {lineDetail(i)}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm tabular-nums">
                        {money(i.price * i.qty, cur)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {data.areas.length > 1 ? (
            <div className="flex gap-1 self-start rounded-full bg-muted p-1">
              {data.areas.map((a) => (
                <button
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm",
                    a.id === area?.id
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground"
                  )}
                  key={a.id}
                  onClick={() => setAreaId(a.id)}
                  type="button"
                >
                  {a.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {(area?.tables ?? []).map((t) => {
              const busyTable = openOrderFor(data, t.id);
              const here = t.id === order.tableId;
              return (
                <button
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-2xl border p-3 text-sm transition-colors disabled:opacity-40",
                    busyTable
                      ? "border-[#c96442]/40 bg-[#c96442]/10"
                      : "bg-card hover:bg-muted"
                  )}
                  disabled={here || busy}
                  key={t.id}
                  onClick={() => move(t.id)}
                  type="button"
                >
                  <span className="font-semibold text-lg">{t.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {busyTable
                      ? `${itemCount(busyTable)} itens · ${money(orderTotals(busyTable).total, cur)}`
                      : "livre"}
                  </span>
                </button>
              );
            })}
          </div>
          {busy ? (
            <div className="flex justify-center">
              <Spinner />
            </div>
          ) : null}
          <Button onClick={onClose} variant="ghost">
            Cancelar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
