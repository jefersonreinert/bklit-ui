"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import {
  type PosCompany,
  sendPos,
  setCompany,
  useCompanies,
  useCompany,
  useCurrentCompany,
} from "@/lib/pos/store";
import { cn } from "@/lib/utils";

/** Each device sells for one business at a time (bars, restaurant…). */

function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("size-2.5 shrink-0 rounded-full", className)}
      style={{ background: color }}
    />
  );
}

/** Business picker in the POS header (hidden with a single business). */
export function CompanySwitcher() {
  const companies = useCompanies();
  const current = useCurrentCompany();
  const key = useCompany();
  if (!(companies && companies.length > 1 && current)) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label="Trocar de empresa"
            className="flex max-w-56 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            type="button"
          />
        }
      >
        <Dot color={current.color} />
        <span className="truncate font-medium">{current.name}</span>
        <Icon className="size-4 shrink-0" name="IconChevronDownSmall" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-3xl p-2">
        {companies.map((c) => (
          <DropdownMenuItem
            className="gap-3 rounded-xl px-3 py-2.5"
            key={c.key}
            onClick={() => setCompany(c.key)}
          >
            <Dot className="size-3" color={c.color} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-sm">
                {c.name}
              </span>
              {c.tagline ? (
                <span className="block truncate text-muted-foreground text-xs">
                  {c.tagline}
                </span>
              ) : null}
            </span>
            {c.key === key ? (
              <Icon className="size-4" name="IconCheckmark1" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

const COLORS = [
  "#c96442",
  "#7b1e2b",
  "#d4a017",
  "#2f6f5e",
  "#3b5ba5",
  "#8a4fbf",
];

function CompanyForm({
  company,
  onDone,
}: {
  company: PosCompany | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(company?.name ?? "");
  const [tagline, setTagline] = useState(company?.tagline ?? "");
  const [color, setColor] = useState(company?.color ?? "#c96442");
  const [currency, setCurrency] = useState(company?.currency ?? "EUR");
  const [wine, setWine] = useState(company?.wine ?? false);
  const [busy, setBusy] = useState(false);
  const key = company?.key ?? slug(name);
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!(name.trim() && key.length >= 2)) {
          return;
        }
        setBusy(true);
        const ok = await sendPos(api.pos.saveCompany, {
          key,
          profile: {
            name: name.trim(),
            color,
            tagline: tagline.trim() || undefined,
            wine,
          },
          currency,
        });
        setBusy(false);
        if (ok) {
          onDone();
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm" htmlFor="pco-name">
          Nome
          <Input
            id="pco-name"
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Vinomad"
            value={name}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor="pco-tagline">
          Descrição curta
          <Input
            id="pco-tagline"
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Ex.: Wine bar"
            value={tagline}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Moeda
          <select
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            onChange={(e) => setCurrency(e.target.value)}
            value={currency}
          >
            {["EUR", "USD", "BRL", "GBP"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-sm">
          Cor
          <div className="flex gap-2 pt-1">
            {COLORS.map((c) => (
              <button
                aria-label={`Cor ${c}`}
                aria-pressed={color === c}
                className={cn(
                  "size-7 rounded-full ring-offset-2 ring-offset-card",
                  color === c && "ring-2 ring-foreground"
                )}
                key={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                type="button"
              />
            ))}
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={wine}
          className="size-4 accent-foreground"
          onChange={(e) => setWine(e.target.checked)}
          type="checkbox"
        />
        Carta de vinhos (taça pelo dispenser, garrafa e estoque em garrafas)
      </label>
      <div className="flex justify-end gap-2">
        <button
          className="rounded-full px-4 py-2 text-sm hover:bg-muted"
          onClick={onDone}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="rounded-full bg-foreground px-4 py-2 text-background text-sm disabled:opacity-50"
          disabled={busy || !name.trim()}
          type="submit"
        >
          {company ? "Salvar" : "Criar empresa"}
        </button>
      </div>
    </form>
  );
}

/** Settings → Empresas: create and edit businesses (administrator). */
export function CompaniesSettings() {
  const companies = useCompanies() ?? [];
  const [editing, setEditing] = useState<PosCompany | "new" | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Empresas</h2>
          <p className="text-muted-foreground text-sm">
            Cada empresa tem cardápio, mesas, pedidos, estoque e relatórios
            próprios. Os usuários escolhem em quais trabalham.
          </p>
        </div>
        <button
          className="flex shrink-0 items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-background text-sm"
          onClick={() => setEditing("new")}
          type="button"
        >
          <Icon className="size-4" name="IconPlusSmall" />
          Nova
        </button>
      </div>
      {editing === "new" ? (
        <CompanyForm company={null} onDone={() => setEditing(null)} />
      ) : null}
      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        {companies.map((c) =>
          editing !== "new" && editing?.key === c.key ? (
            <div className="p-2" key={c.key}>
              <CompanyForm company={c} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <button
              className="flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
              key={c.key}
              onClick={() => setEditing(c)}
              type="button"
            >
              <Dot className="size-3" color={c.color} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm">{c.name}</span>
                <span className="block text-muted-foreground text-xs">
                  {[c.tagline, c.currency, c.wine ? "carta de vinhos" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <Icon
                className="size-4 text-muted-foreground"
                name="IconPencil"
              />
            </button>
          )
        )}
      </div>
    </section>
  );
}
