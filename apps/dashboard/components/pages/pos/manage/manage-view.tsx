"use client";

import { type ReactNode, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Icon, type IconName } from "@/lib/icons";
import { useCompany } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { CountSection } from "../inventory/count";
import { InvoicesSection } from "../inventory/invoices";
import { ItemsSection } from "../inventory/items";
import { MovesSection } from "../inventory/moves";
import { PurchasingSection } from "../inventory/purchasing";
import { RecipesSection } from "../inventory/recipes";
import { RolloutSection } from "../inventory/rollout";
import { SalesSection, VarianceSection } from "../inventory/sales";
import { SetupSection } from "../inventory/setup";
import { CARD, type InvOverview, useOverview } from "../inventory/shared";
import { useCan } from "../pos-auth";
import { ProductsView } from "../pos-products";
import { CocktailsSection } from "./cocktails";
import { PanelSection } from "./panel";
import { SuppliersSection } from "./suppliers";

/**
 * Gestão: everything behind the counter in one place — what is sold
 * (products), what is bought and counted (items), how one becomes the
 * other (technical sheets), who sells it (suppliers), buying, invoices,
 * counts and the reports. The panel lists what still needs someone.
 */

export type ManageSection =
  | "panel"
  | "products"
  | "items"
  | "recipes"
  | "cocktails"
  | "suppliers"
  | "purchasing"
  | "invoices"
  | "count"
  | "moves"
  | "sales"
  | "variance"
  | "rollout"
  | "setup";

type Entry = { id: ManageSection; label: string; icon: IconName; stock?: boolean };

const GROUPS: { title: string; entries: Entry[] }[] = [
  { title: "Visão geral", entries: [{ id: "panel", label: "Painel", icon: "IconLayoutDashboard", stock: true }] },
  {
    title: "Cadastros",
    entries: [
      { id: "products", label: "Produtos", icon: "IconTag" },
      { id: "items", label: "Itens de estoque", icon: "IconBox2", stock: true },
      { id: "recipes", label: "Fichas técnicas", icon: "IconCocktail", stock: true },
      { id: "cocktails", label: "Cocktails", icon: "IconCocktail" },
      { id: "suppliers", label: "Fornecedores", icon: "IconTruck", stock: true },
    ],
  },
  {
    title: "Compras",
    entries: [
      { id: "purchasing", label: "Pedidos", icon: "IconChecklist", stock: true },
      { id: "invoices", label: "Invoices", icon: "IconReceiptBill", stock: true },
    ],
  },
  {
    title: "Estoque",
    entries: [
      { id: "count", label: "Contagem", icon: "IconBarcode", stock: true },
      { id: "moves", label: "Movimentos", icon: "IconArrowsRepeat", stock: true },
    ],
  },
  {
    title: "Análise",
    entries: [
      { id: "sales", label: "Vendas", icon: "IconLineChart2", stock: true },
      { id: "variance", label: "Variância", icon: "IconChartCompare", stock: true },
    ],
  },
  {
    title: "Configuração",
    entries: [
      { id: "rollout", label: "Implantação", icon: "IconChecklist", stock: true },
      { id: "setup", label: "Ajustes", icon: "IconSettingsGear1", stock: true },
    ],
  },
];

export function ManageView({ products = true }: { products?: boolean }) {
  const can = useCan();
  const company = useCompany();
  const canStock = can(["stock"]);
  const data = useOverview(company);
  const groups = GROUPS.map((g) => ({
    ...g,
    entries: g.entries.filter((e) => (e.id === "products" ? products && can(["products", "stock"]) : !e.stock || canStock)),
  })).filter((g) => g.entries.length);
  const all = groups.flatMap((g) => g.entries);
  const [picked, setPicked] = useState<ManageSection>(canStock ? "panel" : "products");
  const section = all.some((e) => e.id === picked) ? picked : (all[0]?.id ?? "products");

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Desktop: grouped side menu. Phone: one scrolling row of chips. */}
      <aside className="hidden w-56 shrink-0 border-r p-3 md:block">
        <nav className="sticky top-3 space-y-4">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-2 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">{g.title}</p>
              {g.entries.map((e) => (
                <button
                  aria-current={section === e.id ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                    section === e.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                  )}
                  key={e.id}
                  onClick={() => setPicked(e.id)}
                  type="button"
                >
                  <Icon className="size-4" name={e.icon} />
                  {e.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 [scrollbar-width:none] md:hidden">
        {all.map((e) => (
          <button
            aria-pressed={section === e.id}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
              section === e.id ? "bg-foreground text-background" : "text-muted-foreground"
            )}
            key={e.id}
            onClick={() => setPicked(e.id)}
            type="button"
          >
            <Icon className="size-4" name={e.icon} />
            {e.label}
          </button>
        ))}
      </nav>
      <main className="min-w-0 flex-1">
        {section === "products" ? (
          <ProductsView />
        ) : section === "cocktails" ? (
          <CocktailsSection />
        ) : (
          <StockSection data={data}>
            {(d) => (
              <>
                {section === "panel" ? <PanelSection onOpen={setPicked} /> : null}
                {section === "items" ? <ItemsSection data={d} /> : null}
                {section === "recipes" ? <RecipesSection data={d} /> : null}
                {section === "suppliers" ? <SuppliersSection /> : null}
                {section === "purchasing" ? <PurchasingSection data={d} /> : null}
                {section === "invoices" ? <InvoicesSection data={d} /> : null}
                {section === "count" ? <CountSection data={d} /> : null}
                {section === "moves" ? <MovesSection data={d} /> : null}
                {section === "sales" ? <SalesSection data={d} /> : null}
                {section === "variance" ? <VarianceSection /> : null}
                {section === "rollout" ? <RolloutSection /> : null}
                {section === "setup" ? <SetupSection data={d} /> : null}
              </>
            )}
          </StockSection>
        )}
      </main>
    </div>
  );
}

function StockSection({ data, children }: { data: InvOverview | null | undefined; children: (d: InvOverview) => ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 p-3 sm:p-4">
      {data === undefined ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : data === null ? (
        <p className={cn(CARD, "text-sm")}>Sem acesso ao estoque deste bar.</p>
      ) : (
        children(data)
      )}
    </div>
  );
}
