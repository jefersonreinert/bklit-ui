"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import {
  FilterSelect,
  normalize,
  rowProps,
  SearchInput,
} from "@/components/pages/beverages/bev-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/lib/icons";
import { useInvoices } from "@/lib/invoices/store";
import type { Invoice, InvoiceData } from "@/lib/invoices/types";
import { formatMoney } from "@/lib/money";
import { CompaniesTab } from "./companies-tab";
import { IngredientsTab } from "./ingredients-tab";
import { InvoiceSheet } from "./invoice-sheet";
import { PricesTab } from "./prices-tab";
import { UploadSheet } from "./upload-sheet";

const ALL = "todas";

const TABS = [
  { value: "notas", label: "Notas fiscais" },
  { value: "precos", label: "Comparar preços" },
  { value: "ingredientes", label: "Ingredientes" },
  { value: "empresas", label: "Empresas e locais" },
] as const;

function names(data: InvoiceData, inv: Invoice) {
  const company = data.companies.find((c) => c.id === inv.companyId);
  return {
    supplier: data.suppliers.find((s) => s.id === inv.supplierId)?.name ?? "—",
    company: company?.name ?? "—",
    location: company?.locations.find((l) => l.id === inv.locationId)?.name,
  };
}

function InvoiceList({
  data,
  onOpen,
}: {
  data: InvoiceData;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState(ALL);
  const list = useMemo(() => {
    const q = normalize(query);
    return data.invoices
      .filter((inv) => company === ALL || inv.companyId === company)
      .filter((inv) => {
        if (!q) {
          return true;
        }
        const n = names(data, inv);
        return normalize(
          `${n.supplier} ${inv.number} ${inv.lines.map((l) => l.description).join(" ")}`
        ).includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, query, company]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput
          onChange={setQuery}
          placeholder="Buscar fornecedor, número ou produto"
          value={query}
        />
        <FilterSelect
          items={[
            { value: ALL, label: "Todas as empresas" },
            ...data.companies.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={setCompany}
          value={company}
        />
      </div>
      <ChartCard
        description={`${list.length} nota(s)`}
        title="Notas de entrada"
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-left font-normal">Data</th>
                <th className="py-2 text-left font-normal">Fornecedor</th>
                <th className="py-2 text-left font-normal">Empresa · local</th>
                <th className="py-2 text-right font-normal">Linhas</th>
                <th className="py-2 text-right font-normal">Total</th>
                <th className="py-2 pl-4 text-left font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => {
                const n = names(data, inv);
                const pending = inv.lines.filter((l) => !l.ingredientId).length;
                return (
                  <tr key={inv.id} {...rowProps(() => onOpen(inv.id))}>
                    <td className="py-2 tabular-nums">{inv.date}</td>
                    <td className="py-2">
                      <p className="font-medium">{n.supplier}</p>
                      <p className="text-muted-foreground text-xs">
                        {inv.number || "s/n"}
                      </p>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {[n.company, n.location].filter(Boolean).join(" · ")}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {inv.lines.length}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(inv.total, inv.currency)}
                    </td>
                    <td className="py-2 pl-4">
                      {inv.status === "approved" ? (
                        <Badge variant="secondary">Aprovada</Badge>
                      ) : (
                        <Badge variant="outline">
                          Revisar{pending ? ` · ${pending} novos` : ""}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

/**
 * Documentos → supplier invoices of every company and location: read by
 * AI from photos/PDFs, lines linked to one shared ingredient catalog,
 * prices compared across suppliers, wine costs sent to the cellar.
 */
export function InvoicesPage() {
  const data = useInvoices();
  const [tab, setTab] = useState<string>("notas");
  const [upload, setUpload] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const review = data.invoices.filter((i) => i.status === "review").length;
  const month = new Date().toISOString().slice(0, 7);
  const monthTotal = data.invoices
    .filter((i) => i.date.startsWith(month))
    .reduce((n, i) => n + i.subtotal, 0);
  const currency = data.invoices[0]?.currency ?? "EUR";

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            Notas fiscais de entrada
          </h2>
          <p className="text-muted-foreground text-sm">
            Invoices de todas as empresas e locais, ingredientes unificados e
            comparação de preços entre fornecedores.
          </p>
        </div>
        <Button onClick={() => setUpload(true)}>
          <Icon className="size-4" name="IconScanCode" />
          Lançar nota
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          icon="IconReceiptBill"
          label="Notas lançadas"
          value={String(data.invoices.length)}
        />
        <MetricTile
          icon="IconChecklist"
          label="Para revisar"
          tone={review ? "warn" : "good"}
          value={String(review)}
        />
        <MetricTile
          hint="Sem IVA"
          icon="IconBasket1"
          label="Compras no mês"
          value={formatMoney(monthTotal, currency, 0)}
        />
        <MetricTile
          hint={`${data.suppliers.length} fornecedores · ${data.companies.length} empresas`}
          icon="IconBarcode"
          label="Ingredientes"
          value={String(data.ingredients.length)}
        />
      </section>

      <Tabs onValueChange={(v) => setTab(String(v))} value={tab}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent className="pt-4" value="notas">
          {data.invoices.length ? (
            <InvoiceList data={data} onOpen={setOpenId} />
          ) : (
            <ChartCard
              description="Fotografe ou envie o PDF de uma nota fiscal / invoice de fornecedor. A IA lê fornecedor, comprador, data e cada linha."
              title="Nenhuma nota ainda"
            >
              <Button onClick={() => setUpload(true)}>
                <Icon className="size-4" name="IconScanCode" />
                Lançar a primeira nota
              </Button>
            </ChartCard>
          )}
        </TabsContent>
        <TabsContent className="pt-4" value="precos">
          <PricesTab />
        </TabsContent>
        <TabsContent className="pt-4" value="ingredientes">
          <IngredientsTab />
        </TabsContent>
        <TabsContent className="pt-4" value="empresas">
          <CompaniesTab />
        </TabsContent>
      </Tabs>

      <UploadSheet
        onClose={() => setUpload(false)}
        onCreated={(id) => {
          setUpload(false);
          setTab("notas");
          setOpenId(id);
        }}
        open={upload}
      />
      <InvoiceSheet invoiceId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
