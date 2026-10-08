"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/lib/icons";
import { readSumupResult } from "@/lib/pos/payments";
import {
  clearPosError,
  money,
  orderTotals,
  payOrder,
  updateOrder,
  usePos,
  usePosError,
} from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { PosGate, type PosPerm, UserChip, useCan } from "./pos-auth";
import { OrdersView } from "./pos-orders";
import { ProductsView } from "./pos-products";
import { RegisterView } from "./pos-register";
import { ReportsView } from "./pos-reports";
import { SettingsView } from "./pos-settings";
import { TablesView } from "./pos-tables";

export type PosTab =
  | "register"
  | "tables"
  | "orders"
  | "products"
  | "reports"
  | "settings";

const TABS: { id: PosTab; label: string; icon: IconName; perm: PosPerm[] }[] = [
  { id: "register", label: "Caixa", icon: "IconCalculator", perm: ["orders"] },
  {
    id: "tables",
    label: "Mesas",
    icon: "IconTable",
    perm: ["orders", "tables"],
  },
  {
    id: "orders",
    label: "Pedidos",
    icon: "IconReceiptBill",
    perm: ["orders", "history"],
  },
  {
    id: "products",
    label: "Produtos",
    icon: "IconTag",
    perm: ["products", "stock"],
  },
  { id: "reports", label: "Relatórios", icon: "IconChart1", perm: ["reports"] },
  {
    id: "settings",
    label: "Ajustes",
    icon: "IconSettingsGear1",
    perm: ["settings", "users"],
  },
];

function ErrorBanner() {
  const error = usePosError();
  useEffect(() => {
    if (!error) {
      return;
    }
    const t = setTimeout(clearPosError, 6000);
    return () => clearTimeout(t);
  }, [error]);
  if (!error) {
    return null;
  }
  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
      <Icon className="mt-0.5 size-4 shrink-0" name="IconExclamationTriangle" />
      <p className="flex-1">{error}</p>
      <button aria-label="Fechar" onClick={clearPosError} type="button">
        <Icon className="size-4" name="IconCrossSmall" />
      </button>
    </div>
  );
}

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
  return (
    <PosGate>
      <PosApp />
    </PosGate>
  );
}

function PosApp() {
  const can = useCan();
  const tabs = TABS.filter((t) => can(t.perm));
  const [picked, setTab] = useState<PosTab>("register");
  const tab = tabs.some((t) => t.id === picked)
    ? picked
    : (tabs[0]?.id ?? "register");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const sumup = useSumupReturn();

  const openOrder = (id: string | null) => {
    setActiveOrderId(id);
    setTab("register");
  };

  return (
    <div className="-m-4 mb-[calc(-1rem-env(safe-area-inset-bottom))] flex h-[calc(100dvh-var(--header-h))] flex-col md:-m-6 md:mb-[calc(-1.5rem-env(safe-area-inset-bottom))]">
      <nav className="hidden shrink-0 items-center justify-center gap-1 border-b px-4 py-2 md:flex">
        {tabs.map((t) => (
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
        <span className="ml-3 border-l pl-3">
          <UserChip />
        </span>
      </nav>
      <div className="flex shrink-0 justify-end border-b px-3 py-1.5 md:hidden">
        <UserChip />
      </div>
      <ErrorBanner />
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
        {tab === "reports" ? <ReportsView /> : null}
        {tab === "settings" ? <SettingsView /> : null}
      </div>
      <nav
        className="grid shrink-0 border-t bg-background/80 pb-[max(0.25rem,calc(env(safe-area-inset-bottom)-0.5rem))] backdrop-blur-xl md:hidden"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        }}
      >
        {tabs.map((t) => (
          <button
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-[10px] transition-colors",
              tab === t.id ? "text-foreground" : "text-muted-foreground"
            )}
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            <Icon className="size-5" name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
