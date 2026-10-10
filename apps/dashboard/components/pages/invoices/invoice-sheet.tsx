"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { FilterSelect } from "@/components/pages/beverages/bev-shared";
import { Field, numOrNull } from "@/components/pages/beverages/wine-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Icon } from "@/lib/icons";
import { basePrice, rankIngredients } from "@/lib/invoices/match";
import { UNIT_LABEL } from "@/lib/invoices/prices";
import {
  approveInvoice,
  removeInvoice,
  updateInvoice,
  updateLine,
  useInvoices,
} from "@/lib/invoices/store";
import type {
  Company,
  Ingredient,
  Invoice,
  InvoiceLine,
} from "@/lib/invoices/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const NEW = "__new__";

const MATCH_LABEL: Record<NonNullable<InvoiceLine["match"]>, string> = {
  ean: "EAN",
  alias: "nome conhecido",
  similar: "parecido",
  manual: "manual",
  new: "novo",
};

function ingredientOptions(line: InvoiceLine, ingredients: Ingredient[]) {
  const ranked = rankIngredients(line, ingredients, 4);
  const rankedIds = new Set(ranked.map((r) => r.ingredient.id));
  return [
    {
      value: NEW,
      label: `+ Novo: ${line.genericName || line.description}`,
    },
    ...ranked.map((r) => ({
      value: r.ingredient.id,
      label: `${r.ingredient.name} (${Math.round(r.score * 100)}%)`,
    })),
    ...ingredients
      .filter((i) => !rankedIds.has(i.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => ({ value: i.id, label: i.name })),
  ];
}

function LineRow({
  invoice,
  line,
  ingredients,
}: {
  invoice: Invoice;
  line: InvoiceLine;
  ingredients: Ingredient[];
}) {
  const set = (patch: Partial<InvoiceLine>) =>
    updateLine(invoice.id, line.id, patch);
  const unit = basePrice(line);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{line.description}</p>
          <p className="text-muted-foreground text-xs">
            {[line.code, line.ean, line.category].filter(Boolean).join(" · ")}
          </p>
        </div>
        {line.match ? (
          <Badge variant={line.match === "new" ? "outline" : "secondary"}>
            {MATCH_LABEL[line.match]}
          </Badge>
        ) : null}
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-xs">
        <Field label={"Qtd"}>
          <Input
            className="h-8"
            inputMode="decimal"
            onChange={(e) => set({ quantity: numOrNull(e.target.value) ?? 0 })}
            value={line.quantity}
          />
        </Field>
        <Field label={`Conteúdo (${UNIT_LABEL[line.baseUnit]})`}>
          <Input
            className="h-8"
            inputMode="decimal"
            onChange={(e) => set({ packSize: numOrNull(e.target.value) ?? 1 })}
            value={line.packSize}
          />
        </Field>
        <Field label={"Preço un. s/ IVA"}>
          <Input
            className="h-8"
            inputMode="decimal"
            onChange={(e) => set({ unitPrice: numOrNull(e.target.value) ?? 0 })}
            value={line.unitPrice}
          />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">
            Por {UNIT_LABEL[line.baseUnit]}
          </span>
          <span className="flex h-8 items-center font-medium tabular-nums">
            {unit === null ? "—" : formatMoney(unit, invoice.currency)}
          </span>
        </div>
      </div>
      <FilterSelect
        className="sm:w-full"
        items={ingredientOptions(line, ingredients)}
        onChange={(v) =>
          set(
            v === NEW
              ? { ingredientId: null, match: "new" }
              : { ingredientId: v, match: "manual", score: 1 }
          )
        }
        value={line.ingredientId ?? NEW}
      />
    </div>
  );
}

function HeaderFields({
  invoice,
  companies,
}: {
  invoice: Invoice;
  companies: Company[];
}) {
  const company = companies.find((c) => c.id === invoice.companyId);
  return (
    <div className="grid grid-cols-2 gap-2">
      <FilterSelect
        className="sm:w-full"
        items={companies.map((c) => ({ value: c.id, label: c.name }))}
        onChange={(companyId) =>
          updateInvoice(invoice.id, {
            companyId,
            locationId:
              companies.find((c) => c.id === companyId)?.locations[0]?.id ?? "",
          })
        }
        value={invoice.companyId}
      />
      <FilterSelect
        className="sm:w-full"
        items={(company?.locations ?? []).map((l) => ({
          value: l.id,
          label: l.name,
        }))}
        onChange={(locationId) => updateInvoice(invoice.id, { locationId })}
        value={invoice.locationId}
      />
      <Input
        aria-label="Número"
        onChange={(e) => updateInvoice(invoice.id, { number: e.target.value })}
        value={invoice.number}
      />
      <Input
        aria-label="Data"
        onChange={(e) => updateInvoice(invoice.id, { date: e.target.value })}
        type="date"
        value={invoice.date}
      />
    </div>
  );
}

export function InvoiceSheet({
  invoiceId,
  onClose,
}: {
  invoiceId: string | null;
  onClose: () => void;
}) {
  const data = useInvoices();
  const [notice, setNotice] = useState<string | null>(null);
  const invoice = data.invoices.find((i) => i.id === invoiceId) ?? null;
  const supplier = data.suppliers.find((s) => s.id === invoice?.supplierId);
  const money = (v: number) => formatMoney(v, invoice?.currency ?? "EUR");

  function approve() {
    if (!invoice) {
      return;
    }
    const { winesUpdated } = approveInvoice(invoice.id);
    setNotice(
      winesUpdated
        ? `Aprovada. Custo de ${winesUpdated} vinho(s) atualizado na Adega.`
        : "Aprovada. Ingredientes e preços atualizados."
    );
  }

  return (
    <Sheet
      onOpenChange={(o) => {
        if (!o) {
          setNotice(null);
          onClose();
        }
      }}
      open={invoice !== null}
    >
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-2xl!"
        side="right"
      >
        {invoice ? (
          <>
            <SheetHeader className="gap-2 border-b p-5">
              <SheetTitle>{supplier?.name ?? "Fornecedor"}</SheetTitle>
              <SheetDescription>
                Nota {invoice.number || "s/n"} · {invoice.date} · total{" "}
                {money(invoice.total)} ({money(invoice.subtotal)} + IVA{" "}
                {money(invoice.vatTotal)})
              </SheetDescription>
              <HeaderFields companies={data.companies} invoice={invoice} />
            </SheetHeader>
            <div className="flex flex-col gap-3 p-5">
              <p className="text-muted-foreground text-xs">
                Confira o ingrediente de cada linha. Nomes diferentes do mesmo
                produto (marcas, idiomas, embalagens) devem apontar para o mesmo
                ingrediente — assim os preços se comparam entre fornecedores e
                empresas.
              </p>
              {invoice.lines.map((line) => (
                <LineRow
                  ingredients={data.ingredients}
                  invoice={invoice}
                  key={line.id}
                  line={line}
                />
              ))}
              {notice ? (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  {notice}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={approve}>
                  <Icon className="size-4" name="IconCheckmark1" />
                  {invoice.status === "approved"
                    ? "Aprovar de novo"
                    : "Aprovar nota"}
                </Button>
                <span
                  className={cn(
                    "text-xs",
                    invoice.status === "approved"
                      ? "text-success"
                      : "text-warning"
                  )}
                >
                  {invoice.status === "approved" ? "Aprovada" : "Em revisão"}
                </span>
                <div className="ml-auto">
                  <ConfirmButton
                    confirmLabel="Apagar nota?"
                    label="Apagar"
                    onConfirm={() => {
                      removeInvoice(invoice.id);
                      onClose();
                    }}
                  />
                </div>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
