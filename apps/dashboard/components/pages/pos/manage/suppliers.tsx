"use client";

import { useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCompany, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { SupplierEditor } from "../inventory/purchasing";
import { CARD, num, Tag, useMoney } from "../inventory/shared";

/**
 * Suppliers of the group: contacts and cover days, what the app learned
 * each one sells (from approved invoices, with the last price) and their
 * invoices in this bar.
 */
export function SuppliersSection() {
  const company = useCompany();
  const list = usePosQuery(api.orders.suppliers, { company });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Id<"invSuppliers"> | null>(null);
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = (list ?? []).filter((s) => !q || `${s.name} ${s.email ?? ""} ${s.taxId ?? ""}`.toLowerCase().includes(q));
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input onChange={(e) => setQuery(e.target.value)} placeholder="Buscar fornecedor" value={query} />
        <Button onClick={() => setAdding(true)}>Novo fornecedor</Button>
      </div>
      {shown.length ? (
        <ul className="divide-y rounded-2xl border bg-card">
          {shown.map((s) => (
            <li key={s._id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40" onClick={() => setOpen(s._id)} type="button">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{s.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {[s.phone, s.email, s.taxId ? `VAT ${s.taxId}` : ""].filter(Boolean).join(" · ") || "sem contato"}
                  </p>
                </div>
                <Tag tone="muted">{s.coverDays ?? 7} dias</Tag>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>
          {list === undefined
            ? "Carregando…"
            : "Nenhum fornecedor ainda. Eles aparecem sozinhos quando um invoice é lido, ou crie aqui."}
        </p>
      )}
      {open ? <SupplierPage id={open} onClose={() => setOpen(null)} /> : null}
      {adding ? <SupplierEditor onClose={() => setAdding(false)} supplier={null} /> : null}
    </div>
  );
}

function SupplierPage({ id, onClose }: { id: Id<"invSuppliers">; onClose: () => void }) {
  const company = useCompany();
  const d = usePosQuery(api.orders.supplierDetail, { company, id });
  const money = useMoney();
  const [editing, setEditing] = useState(false);
  const s = d?.supplier;
  return (
    <FullPage onClose={onClose} open title={s?.name ?? "Fornecedor"}>
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        {d === undefined ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : d === null || !s ? (
          <p className="text-muted-foreground text-sm">Fornecedor não encontrado.</p>
        ) : (
          <>
            <section className={cn(CARD, "space-y-1")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p>{s.phone || "sem telefone"}</p>
                  <p>{s.email || "sem email"}</p>
                  {s.taxId ? <p className="text-muted-foreground">VAT {s.taxId}</p> : null}
                  {s.note ? <p className="text-muted-foreground">{s.note}</p> : null}
                  <p className="text-muted-foreground">Cobertura de {s.coverDays ?? 7} dias por pedido</p>
                </div>
                <Button onClick={() => setEditing(true)} size="sm" variant="outline">
                  Editar
                </Button>
              </div>
            </section>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border bg-card p-3">
                <p className="text-muted-foreground text-xs">Comprado este ano</p>
                <p className="font-semibold text-lg tabular-nums">{money(d.spentYear)}</p>
              </div>
              <div className="rounded-2xl border bg-card p-3">
                <p className="text-muted-foreground text-xs">A pagar</p>
                <p className="font-semibold text-lg tabular-nums">{money(d.unpaid)}</p>
              </div>
            </div>
            <section className={CARD}>
              <p className="pb-2 font-medium text-sm">O que fornece ({d.items.length})</p>
              {d.items.length ? (
                <ul className="divide-y text-sm">
                  {d.items.map((i) => (
                    <li className="flex items-center gap-2 py-2" key={i.itemId}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{i.name}</p>
                        <p className="truncate text-muted-foreground text-xs">
                          no invoice: {i.alias}
                          {i.code ? ` · cód. ${i.code}` : ""}
                        </p>
                      </div>
                      <span className="tabular-nums">{money(i.unitCost)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Aparece aqui depois do primeiro invoice aprovado.</p>
              )}
            </section>
            <section className={CARD}>
              <p className="pb-2 font-medium text-sm">Invoices neste bar</p>
              {d.invoices.length ? (
                <ul className="divide-y text-sm">
                  {d.invoices.map((x) => (
                    <li className="flex items-center gap-2 py-2" key={x.id}>
                      <span className="min-w-0 flex-1 truncate">
                        #{x.number} · {x.date}
                      </span>
                      {x.status === "review" ? <Tag tone="warn">para aprovar</Tag> : x.paid ? <Tag tone="muted">pago</Tag> : <Tag>a pagar</Tag>}
                      <span className="tabular-nums">{money(x.total)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Nenhum invoice ainda.</p>
              )}
              <p className="pt-2 text-muted-foreground text-xs">{num(d.invoices.length, 0)} mais recentes</p>
            </section>
          </>
        )}
      </div>
      {editing && s ? <SupplierEditor onClose={() => setEditing(false)} supplier={s} /> : null}
    </FullPage>
  );
}
