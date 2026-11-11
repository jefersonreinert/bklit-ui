"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { Icon, type IconName } from "@/lib/icons";
import { readSumupResult } from "@/lib/pos/payments";
import {
  clearPosError,
  money,
  orderTotals,
  payOrder,
  updateOrder,
  useCurrentCompany,
  usePos,
  usePosError,
} from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { PosGate, type PosPerm, UserChip, useCan } from "./pos-auth";
import { CompanySwitcher } from "./pos-company";
import { CustomersView } from "./pos-customers";
import {
  LightspeedApp,
  ModeSwitch,
  useLightspeedLink,
  usePosMode,
} from "./pos-lightspeed";
import { OrdersView } from "./pos-orders";
import { ProductsView } from "./pos-products";
import { RegisterView } from "./pos-register";
import { ReportsView } from "./pos-reports";
import { SettingsView } from "./pos-settings";
import { StockView } from "./pos-stock";
import { TablesView } from "./pos-tables";
import { TeamView } from "./pos-team";
import { VouchersView } from "./pos-vouchers";
import { WinesView } from "./pos-wine";
import { WineMonitorView } from "./pos-wine-monitor";

export type PosTab =
  | "register"
  | "tables"
  | "orders"
  | "wines"
  | "winemonitor"
  | "team"
  | "products"
  | "stock"
  | "customers"
  | "reports"
  | "vouchers"
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
    id: "wines",
    label: "Vinhos",
    icon: "IconGlass",
    perm: ["orders", "products", "stock"],
  },
  {
    id: "winemonitor",
    label: "Wine Monitor",
    icon: "IconBottle",
    perm: ["products", "stock", "reports"],
  },
  {
    id: "team",
    label: "Equipe",
    icon: "IconUserGroup",
    perm: ["orders", "team"],
  },
  {
    id: "products",
    label: "Produtos",
    icon: "IconTag",
    perm: ["products", "stock"],
  },
  {
    id: "stock",
    label: "Estoque",
    icon: "IconArchive",
    perm: ["stock"],
  },
  {
    id: "customers",
    label: "Clientes",
    icon: "IconPeople",
    perm: ["orders", "charge"],
  },
  { id: "reports", label: "Relatórios", icon: "IconChart1", perm: ["reports"] },
  {
    id: "vouchers",
    label: "Vouchers",
    icon: "IconGiftcard",
    perm: ["settings", "charge"],
  },
  {
    id: "settings",
    label: "Ajustes",
    icon: "IconSettingsGear1",
    perm: ["settings", "users"],
  },
];

/** How many tabs fit in the phone bar; the rest go under "Mais". */
const BAR_SLOTS = 4;

/**
 * Phone tab bar: a few fixed tabs plus "Mais", which opens a grid with
 * every module. The open tab always shows in the bar, so the user sees
 * where they are. Fixed height and one-line labels: nothing overlaps.
 */
function MobileTabBar({
  tabs,
  tab,
  onPick,
}: {
  tabs: typeof TABS;
  tab: PosTab;
  onPick: (t: PosTab) => void;
}) {
  const tr = useT();
  const [more, setMore] = useState(false);
  const fits = tabs.length <= BAR_SLOTS + 1;
  let bar = fits ? tabs : tabs.slice(0, BAR_SLOTS);
  const current = tabs.find((t) => t.id === tab);
  if (!(fits || bar.some((t) => t.id === tab)) && current) {
    bar = [...bar.slice(0, BAR_SLOTS - 1), current];
  }
  const item = (active: boolean) =>
    cn(
      "flex h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none transition-colors",
      active ? "text-foreground" : "text-muted-foreground"
    );

  return (
    <>
      <nav
        className="grid shrink-0 border-t bg-background/80 pb-[max(0.25rem,calc(env(safe-area-inset-bottom)-0.5rem))] backdrop-blur-xl md:hidden"
        style={{
          gridTemplateColumns: `repeat(${bar.length + (fits ? 0 : 1)}, minmax(0, 1fr))`,
        }}
      >
        {bar.map((t) => (
          <button
            className={item(tab === t.id)}
            key={t.id}
            onClick={() => onPick(t.id)}
            type="button"
          >
            <Icon className="size-6 shrink-0" name={t.icon} />
            <span className="max-w-full truncate">{tr(t.label)}</span>
          </button>
        ))}
        {fits ? null : (
          <button
            aria-expanded={more}
            className={item(more)}
            onClick={() => setMore(true)}
            type="button"
          >
            <Icon className="size-6 shrink-0" name="IconApps" />
            <span>{tr("Mais")}</span>
          </button>
        )}
      </nav>
      <Sheet onOpenChange={setMore} open={more}>
        <SheetContent
          className="rounded-t-3xl px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          side="bottom"
        >
          <SheetTitle>{tr("Módulos")}</SheetTitle>
          <SheetDescription className="sr-only">
            {tr("Todos os módulos do POS")}
          </SheetDescription>
          <div className="grid grid-cols-4 gap-2">
            {tabs.map((t) => (
              <button
                className={cn(
                  "flex min-w-0 flex-col items-center gap-2 rounded-2xl px-1 py-3 text-xs transition-colors",
                  tab === t.id
                    ? "bg-foreground text-background"
                    : "bg-muted/60 text-foreground active:bg-muted"
                )}
                key={t.id}
                onClick={() => {
                  onPick(t.id);
                  setMore(false);
                }}
                type="button"
              >
                <Icon className="size-6 shrink-0" name={t.icon} />
                <span className="w-full truncate text-center">
                  {tr(t.label)}
                </span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

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
  const tr = useT();
  const can = useCan();
  const company = useCurrentCompany();
  const link = useLightspeedLink();
  const lightspeed = usePosMode(company?.key ?? "main") === "lightspeed" && Boolean(link);
  const tabs = TABS.filter(
    (t) =>
      can(t.perm) &&
      ((t.id !== "wines" && t.id !== "winemonitor") || company?.wine)
  );
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
      {/* Company and user stay put; the tabs scroll sideways when they
          don't fit (no more overlap with the sidebar) */}
      <nav className="hidden shrink-0 items-center gap-2 border-b px-4 py-2 md:flex">
        <span className="flex shrink-0 items-center gap-2">
          <CompanySwitcher />
          <ModeSwitch />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className={cn("mx-auto flex w-max items-center gap-1", lightspeed && "hidden")}>
            {tabs.map((t) => (
              <button
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors",
                  tab === t.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                )}
                key={t.id}
                onClick={() => setTab(t.id)}
                type="button"
              >
                <Icon className="size-4" name={t.icon} />
                {tr(t.label)}
              </button>
            ))}
          </div>
        </div>
        <span className="shrink-0 border-l pl-3">
          <UserChip />
        </span>
      </nav>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5 md:hidden">
        <CompanySwitcher />
        <ModeSwitch />
        <span className="ml-auto">
          <UserChip />
        </span>
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
        {lightspeed ? (
          <LightspeedApp />
        ) : (
          <>
          {tab === "register" ? (
            <RegisterView
              activeOrderId={activeOrderId}
              onActiveOrder={setActiveOrderId}
            />
          ) : null}
          {tab === "tables" ? <TablesView onOpenOrder={openOrder} /> : null}
          {tab === "orders" ? <OrdersView onOpenOrder={openOrder} /> : null}
          {tab === "wines" ? <WinesView /> : null}
          {tab === "winemonitor" ? <WineMonitorView /> : null}
          {tab === "team" ? <TeamView /> : null}
          {tab === "products" ? <ProductsView /> : null}
          {tab === "stock" ? <StockView /> : null}
          {tab === "customers" ? <CustomersView /> : null}
          {tab === "reports" ? <ReportsView /> : null}
          {tab === "vouchers" ? <VouchersView /> : null}
          {tab === "settings" ? <SettingsView /> : null}
          </>
        )}
      </div>
      {lightspeed ? null : (
        <MobileTabBar onPick={setTab} tab={tab} tabs={tabs} />
      )}
    </div>
  );
}
