"use client";

import { useState } from "react";
import { usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { type PosPerm, useCan } from "./pos-auth";
import { PosSettingsCard } from "./pos-general";
import { PrintersCard } from "./pos-printers";
import { ReceiptDesigner } from "./pos-receipt-designer";
import { UsersCard } from "./pos-users";

type Section = "users" | "receipt" | "printers" | "general";

const SECTIONS: { id: Section; label: string; perm: PosPerm }[] = [
  { id: "users", label: "Usuários", perm: "users" },
  { id: "receipt", label: "Recibo e fatura", perm: "settings" },
  { id: "printers", label: "Impressoras", perm: "settings" },
  { id: "general", label: "Pagamentos", perm: "settings" },
];

export function SettingsView() {
  const data = usePos();
  const can = useCan();
  const sections = SECTIONS.filter((s) => can(s.perm));
  const [picked, setSection] = useState<Section | null>(null);
  const section = picked ?? sections[0]?.id ?? "printers";
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 pb-8">
      <div className="flex gap-1 self-start overflow-x-auto rounded-full bg-muted p-1">
        {sections.map((s) => (
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
      {section === "users" ? (
        <div className="mx-auto w-full max-w-2xl">
          <UsersCard />
        </div>
      ) : null}
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
