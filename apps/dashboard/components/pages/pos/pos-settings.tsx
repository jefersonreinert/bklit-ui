"use client";

import { useState } from "react";
import { usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { PosSettingsCard } from "./pos-general";
import { PrintersCard } from "./pos-printers";
import { ReceiptDesigner } from "./pos-receipt-designer";

type Section = "receipt" | "printers" | "general";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "receipt", label: "Recibo e fatura" },
  { id: "printers", label: "Impressoras" },
  { id: "general", label: "Pagamentos" },
];

export function SettingsView({ initial = "receipt" }: { initial?: Section }) {
  const data = usePos();
  const [section, setSection] = useState<Section>(initial);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 pb-8">
      <div className="flex gap-1 self-start overflow-x-auto rounded-full bg-muted p-1">
        {SECTIONS.map((s) => (
          <button
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm",
              section === s.id
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            )}
            key={s.id}
            onClick={() => setSection(s.id)}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "receipt" ? <ReceiptDesigner /> : null}
      {section === "printers" ? (
        <div className="mx-auto w-full max-w-2xl">
          <PrintersCard />
        </div>
      ) : null}
      {section === "general" ? (
        <div className="mx-auto w-full max-w-2xl">
          <PosSettingsCard settings={data.settings} />
        </div>
      ) : null}
    </div>
  );
}
