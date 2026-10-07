"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/lib/icons";
import { readSumupResult } from "@/lib/pos/payments";
import {
  money,
  orderTotals,
  payOrder,
  updateOrder,
  usePos,
} from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { OrdersView } from "./pos-orders";
import { ProductsView } from "./pos-products";
import { RegisterView } from "./pos-register";
import { TablesView } from "./pos-tables";

export type PosTab = "register" | "tables" | "orders" | "products";

const TABS: { id: PosTab; label: string; icon: IconName }[] = [
  { id: "register", label: "Caixa", icon: "IconCalculator" },
  { id: "tables", label: "Mesas", icon: "IconTable" },
  { id: "orders", label: "Pedidos", icon: "IconReceiptBill" },
  { id: "products", label: "Produtos", icon: "IconTag" },
];

/** Result of a SumUp tap-to-pay coming back through the callback URL. */
function useSumupReturn() {
  const data = usePos();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const result = readSumupResult(window.location.search);
    if (!result) {
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    const order = data.orders.find((o) => o.id === result.orderId);
    if (result.status !== "success") {
      if (order) {
        updateOrder(order.id, { status: "open" });
      }
      setNotice("O pagamento por cartão não foi concluído na SumUp.");
      return;
    }
    if (!order) {
      setNotice(
        `Pagamento aprovado na SumUp${result.txCode ? ` (código ${result.txCode})` : ""}. Abra o pedido no app do painel e toque em “Confirmar pagamento”.`
      );
      return;
    }
    const total = orderTotals(order).total;
    const tip = order.payment?.tip ?? 0;
    payOrder(order.id, {
      method: "card",
      amount: total + tip,
      tip,
      ref: result.txCode ?? undefined,
    });
    setNotice(
      `Pedido ${order.number} pago no cartão: ${money(total + tip, data.settings.currency)}.`
    );
  }, [data.orders, data.settings.currency]);
  return { notice, dismiss: () => setNotice(null) };
}

export function PosPage() {
  const [tab, setTab] = useState<PosTab>("register");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const sumup = useSumupReturn();

  const openOrder = (id: string | null) => {
    setActiveOrderId(id);
    setTab("register");
  };

  return (
    <div className="-m-4 mb-[calc(-1rem-env(safe-area-inset-bottom))] flex h-[calc(100dvh-var(--header-h))] flex-col md:-m-6 md:mb-[calc(-1.5rem-env(safe-area-inset-bottom))]">
      <nav className="hidden shrink-0 items-center justify-center gap-1 border-b px-4 py-2 md:flex">
        {TABS.map((t) => (
          <button
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors",
              tab === t.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            )}
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            <Icon className="size-4" name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>
      {sumup.notice ? (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
          <Icon className="mt-0.5 size-4 shrink-0" name="IconCreditCard1" />
          <p className="flex-1">{sumup.notice}</p>
          <button
            aria-label="Fechar"
            className="text-muted-foreground"
            onClick={sumup.dismiss}
            type="button"
          >
            <Icon className="size-4" name="IconCrossSmall" />
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "register" ? (
          <RegisterView
            activeOrderId={activeOrderId}
            onActiveOrder={setActiveOrderId}
          />
        ) : null}
        {tab === "tables" ? <TablesView onOpenOrder={openOrder} /> : null}
        {tab === "orders" ? <OrdersView onOpenOrder={openOrder} /> : null}
        {tab === "products" ? <ProductsView /> : null}
      </div>
      <nav className="grid shrink-0 grid-cols-4 border-t bg-background/80 pb-[max(0.25rem,calc(env(safe-area-inset-bottom)-0.5rem))] backdrop-blur-xl md:hidden">
        {TABS.map((t) => (
          <button
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-xs transition-colors",
              tab === t.id ? "text-foreground" : "text-muted-foreground"
            )}
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            <Icon className="size-6" name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
