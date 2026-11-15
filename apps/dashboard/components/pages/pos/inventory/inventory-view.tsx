"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useCompany } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { CountSection } from "./count";
import { ItemsSection } from "./items";
import { MovesSection } from "./moves";
import { SetupSection } from "./setup";
import { CARD, useOverview } from "./shared";

/**
 * Stock control of the bar (one ledger for the group): items, stock
 * takes with a scale, movements and setup. Works the same whether the
 * bar sells with this app's POS or with Lightspeed.
 */

type Section = "items" | "count" | "moves" | "setup";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "items", label: "Itens" },
  { id: "count", label: "Contagem" },
  { id: "moves", label: "Movimentos" },
  { id: "setup", label: "Ajustes" },
];

export function InventoryView() {
  const company = useCompany();
  const data = useOverview(company);
  const [section, setSection] = useState<Section>("items");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 p-3 sm:p-4">
      <nav className="flex gap-1 overflow-x-auto rounded-full border bg-card p-1 [scrollbar-width:none]">
        {SECTIONS.map((s) => (
          <button
            aria-pressed={section === s.id}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm",
              section === s.id ? "bg-foreground text-background" : "text-muted-foreground"
            )}
            key={s.id}
            onClick={() => setSection(s.id)}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </nav>
      {data === undefined ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : data === null ? (
        <p className={cn(CARD, "text-sm")}>Sem acesso ao estoque deste bar.</p>
      ) : (
        <>
          {section === "items" ? <ItemsSection data={data} /> : null}
          {section === "count" ? <CountSection data={data} /> : null}
          {section === "moves" ? <MovesSection data={data} /> : null}
          {section === "setup" ? <SetupSection data={data} /> : null}
        </>
      )}
    </div>
  );
}
