"use client";

import { printTicket } from "./print";
import { itemDetail } from "./receipt";
import { posUserName } from "./store";
import type { OrderItem, PosData, PosOrder, PrinterConfig } from "./types";

/**
 * Routes the items being sent to their stations: each kitchen/bar printer
 * gets only the categories it handles (food to the kitchen, drinks to the
 * bar…). A printer with no categories gets everything.
 */

export function routeItems(
  data: PosData,
  items: OrderItem[]
): { printer: PrinterConfig; items: OrderItem[] }[] {
  const categoryOf = (i: OrderItem) =>
    data.products.find((p) => p.id === i.productId)?.category ?? "Avulso";
  return data.printers
    .filter((p) => p.kitchen && p.kind === "epos")
    .map((printer) => ({
      printer,
      items: items.filter(
        (i) =>
          !printer.categories?.length ||
          printer.categories.includes(categoryOf(i))
      ),
    }))
    .filter((r) => r.items.length > 0);
}

function tableLabel(data: PosData, order: PosOrder) {
  const t = order.tableId
    ? data.areas.flatMap((a) => a.tables).find((x) => x.id === order.tableId)
    : undefined;
  return t ? `Mesa ${t.name}` : "";
}

export async function printKitchen(
  data: PosData,
  order: PosOrder,
  items: OrderItem[]
) {
  const routes = routeItems(data, items);
  const results = await Promise.allSettled(
    routes.map(({ printer, items: list }) =>
      printTicket(
        printer,
        {
          station: printer.name,
          number: order.number,
          table: tableLabel(data, order),
          customer: order.name,
          user: posUserName(),
          date: new Date(),
          lines: list.map((i) => ({
            qty: i.qty,
            name: i.name,
            detail: itemDetail(i),
          })),
        },
        data.receipt
      )
    )
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed && failed.status === "rejected") {
    throw failed.reason;
  }
  return routes.length;
}
