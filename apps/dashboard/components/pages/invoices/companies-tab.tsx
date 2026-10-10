"use client";

import { ChartCard } from "@/components/dashboard/chart-card";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Field } from "@/components/pages/beverages/wine-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/lib/icons";
import {
  newCompany,
  removeCompany,
  renameSupplier,
  saveCompany,
  useInvoices,
} from "@/lib/invoices/store";
import type { Company } from "@/lib/invoices/types";
import { uid } from "@/lib/local-store";

function CompanyCard({ company }: { company: Company }) {
  const set = (patch: Partial<Company>) =>
    saveCompany({ ...company, ...patch });
  const setLocation = (id: string, name: string) =>
    set({
      locations: company.locations.map((l) =>
        l.id === id ? { ...l, name } : l
      ),
    });
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Empresa">
          <Input
            onChange={(e) => set({ name: e.target.value })}
            value={company.name}
          />
        </Field>
        <Field label="NIF / VAT / CNPJ">
          <Input
            onChange={(e) => set({ taxId: e.target.value })}
            value={company.taxId}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">Locais / unidades</span>
        {company.locations.map((l) => (
          <div className="flex items-center gap-2" key={l.id}>
            <Input
              aria-label="Nome do local"
              className="h-8"
              onChange={(e) => setLocation(l.id, e.target.value)}
              value={l.name}
            />
            {company.locations.length > 1 ? (
              <ConfirmButton
                confirmLabel="Remover?"
                onConfirm={() =>
                  set({
                    locations: company.locations.filter((x) => x.id !== l.id),
                  })
                }
              />
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              set({
                locations: [
                  ...company.locations,
                  { id: uid("loc"), name: "Novo local" },
                ],
              })
            }
            size="sm"
            variant="outline"
          >
            <Icon className="size-4" name="IconPlusSmall" />
            Local
          </Button>
          <ConfirmButton
            confirmLabel="Apagar empresa?"
            label="Apagar empresa"
            onConfirm={() => removeCompany(company.id)}
          />
        </div>
      </div>
    </div>
  );
}

/** Companies of the group with their locations, and the supplier names. */
export function CompaniesTab() {
  const { companies, suppliers, invoices } = useInvoices();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Cada nota fiscal fica ligada a uma empresa e a um local. A empresa é
          reconhecida sozinha pelo NIF/nome do comprador impresso na nota.
        </p>
        <Button onClick={() => saveCompany(newCompany("Nova empresa"))}>
          <Icon className="size-4" name="IconPlusSmall" />
          Empresa
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {companies.map((c) => (
          <CompanyCard company={c} key={c.id} />
        ))}
      </div>
      {suppliers.length ? (
        <ChartCard
          description="Nomes como aparecem nos relatórios; criados a partir das notas."
          title="Fornecedores"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {suppliers.map((s) => (
              <div className="flex items-center gap-2" key={s.id}>
                <Input
                  aria-label="Fornecedor"
                  className="h-8"
                  onChange={(e) => renameSupplier(s.id, e.target.value)}
                  value={s.name}
                />
                <span className="shrink-0 text-muted-foreground text-xs">
                  {invoices.filter((i) => i.supplierId === s.id).length} notas
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      ) : null}
    </div>
  );
}
