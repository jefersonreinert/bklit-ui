"use client";

import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { describeQty } from "@/lib/inventory/units";
import { sendPos, useCompanies, useCompany, useCurrentCompany, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { CARD, dateText, Field, type InvItem, type InvOverview, NumberInput, num, Pill, Tag, useMoney } from "./shared";

/**
 * Purchasing: what to order from each supplier (from daily usage, cover
 * days, minimum and par), what another bar of the group can send instead,
 * purchase orders sent by WhatsApp or email, and the suppliers' contacts.
 */

type View = "suggest" | "orders";
type Suggest = FunctionReturnType<typeof api.orders.suggestions>;
type Order = Doc<"invOrders">;

/** "caixa de 6" when a pack is whole containers, else its content. */
function packText(perUnit: number, item: Pick<InvItem, "unit" | "size" | "container">) {
  if (item.unit === "un") {
    return perUnit > 1 ? `pack de ${num(perUnit)}` : "unidade";
  }
  const n = perUnit / item.size;
  if (Math.abs(n - 1) < 1e-6) {
    return item.container;
  }
  if (Math.abs(n - Math.round(n)) < 1e-6) {
    return `caixa de ${Math.round(n)}`;
  }
  return `${num(perUnit)} ${item.unit}`;
}

export function PurchasingSection({ data }: { data: InvOverview }) {
  const [view, setView] = useState<View>("suggest");
  const [open, setOpen] = useState<Id<"invOrders"> | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <Pill active={view === "suggest"} onClick={() => setView("suggest")}>
          Sugestões
        </Pill>
        <Pill active={view === "orders"} onClick={() => setView("orders")}>
          Pedidos
        </Pill>
      </div>
      {view === "suggest" ? (
        <Suggestions
          data={data}
          onCreated={(id) => {
            setView("orders");
            setOpen(id);
          }}
        />
      ) : null}
      {view === "orders" ? <Orders onOpen={setOpen} /> : null}
      {open ? <OrderDetail data={data} id={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function Suggestions({ data, onCreated }: { data: InvOverview; onCreated: (id: Id<"invOrders">) => void }) {
  const company = useCompany();
  const companies = useCompanies();
  const fmt = useMoney();
  const s = usePosQuery(api.orders.suggestions, { company });
  const suppliers = usePosQuery(api.orders.suppliers, { company });
  const [packs, setPacks] = useState<Record<string, number | undefined>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const items = useMemo(() => new Map(data.items.map((i) => [i._id as string, i])), [data.items]);
  const nameOf = (key: string) => companies?.find((c) => c.key === key)?.name ?? key;

  if (s === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const create = async (g: Suggest["groups"][number], key: string) => {
    const supplierId = (g.supplierId ?? chosen[key]) as Id<"invSuppliers"> | undefined;
    if (!supplierId) {
      return;
    }
    setBusy(true);
    const id = await sendPos(api.orders.createOrder, {
      company,
      supplierId,
      lines: g.lines.map((l) => ({
        itemId: l.itemId,
        packs: packs[`${key}:${l.itemId}`] ?? l.packs,
        perUnit: l.perUnit,
        packCost: l.packCost ?? 0,
      })),
    });
    setBusy(false);
    if (id) {
      onCreated(id);
    }
  };
  const transfer = async (t: Suggest["transfers"][number]) => {
    const ok = await sendPos(api.inv.transfer, { from: t.from, to: company, itemId: t.itemId, qty: t.qty, note: "sugestão de compras" });
    if (ok !== undefined) {
      setMoved((m) => new Set(m).add(`${t.from}:${t.itemId}`));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Pelo consumo médio dos últimos {s?.usageDays ?? 28} dias (vendas e perdas), o estoque deve durar
        os dias de cobertura de cada fornecedor (padrão 7), mais o mínimo do item, e nunca menos que o
        ideal. Já conta o que está em pedidos abertos. Arredondado para a embalagem do fornecedor.
      </p>
      {s?.transfers.length ? (
        <div className={cn(CARD, "space-y-2")}>
          <p className="font-medium">Antes de comprar: outro bar tem sobrando</p>
          <ul className="divide-y">
            {s.transfers.map((t) => {
              const done = moved.has(`${t.from}:${t.itemId}`);
              return (
                <li className="flex items-center justify-between gap-3 py-2 text-sm" key={`${t.from}:${t.itemId}`}>
                  <span>
                    {t.name}: {describeQty(t.qty, t)} do {nameOf(t.from)}
                  </span>
                  <Button disabled={done} onClick={() => transfer(t)} size="sm" variant="outline">
                    {done ? "Transferido" : "Transferir"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {s?.groups.length ? (
        s.groups.map((g) => {
          const key = g.supplierId ?? "none";
          const total = g.lines.reduce((sum, l) => sum + (l.packCost ?? 0) * (packs[`${key}:${l.itemId}`] ?? l.packs), 0);
          return (
            <div className={cn(CARD, "space-y-3")} key={key}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{g.supplier ?? "Sem fornecedor ainda"}</p>
                  <p className="text-muted-foreground text-xs">
                    {g.supplier ? `cobertura ${g.coverDays} dias` : "Itens nunca comprados por invoice: escolha de quem pedir"}
                    {total > 0 ? ` · estimado ${fmt(total)} sem IVA` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {g.supplierId ? null : (
                    <select
                      className="h-9 rounded-lg border bg-background px-2 text-sm"
                      onChange={(e) => setChosen((c) => ({ ...c, [key]: e.target.value }))}
                      value={chosen[key] ?? ""}
                    >
                      <option value="">Fornecedor…</option>
                      {(suppliers ?? []).map((x) => (
                        <option key={x._id} value={x._id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button disabled={busy || (!g.supplierId && !chosen[key])} onClick={() => create(g, key)} size="sm">
                    Criar pedido
                  </Button>
                </div>
              </div>
              <ul className="divide-y">
                {g.lines.map((l) => {
                  const item = items.get(l.itemId);
                  return (
                    <li className="flex flex-wrap items-center gap-3 py-2" key={l.itemId}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{l.name}</p>
                        <p className="text-muted-foreground text-xs">
                          tem {describeQty(l.onHand, l)}
                          {l.onOrder ? ` · pedido ${describeQty(l.onOrder, l)}` : ""}
                          {l.perDay ? ` · usa ${describeQty(l.perDay, l)}/dia` : ""}
                          {l.daysLeft !== null ? ` · dura ${num(l.daysLeft, 1)} dias` : ""}
                        </p>
                      </div>
                      {l.daysLeft !== null && l.daysLeft < 2 ? <Tag tone="warn">acabando</Tag> : null}
                      <NumberInput
                        className="h-9 w-16 text-right"
                        onChange={(v) => setPacks((p) => ({ ...p, [`${key}:${l.itemId}`]: v ?? 0 }))}
                        value={packs[`${key}:${l.itemId}`] ?? l.packs}
                      />
                      <span className="w-24 text-muted-foreground text-xs">
                        {item ? packText(l.perUnit, item) : ""}
                        {l.packCost ? ` · ${fmt(l.packCost)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      ) : (
        <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>
          Nada para pedir agora. As sugestões aparecem quando o consumo (vendas e perdas) ou o mínimo/ideal
          dos itens pedirem.
        </p>
      )}
    </div>
  );
}

const STATUS: Record<Order["status"], { label: string; tone?: "warn" | "muted" }> = {
  draft: { label: "rascunho", tone: "warn" },
  sent: { label: "enviado", tone: "muted" },
  received: { label: "recebido", tone: "muted" },
  cancelled: { label: "cancelado", tone: "muted" },
};

function Orders({ onOpen }: { onOpen: (id: Id<"invOrders">) => void }) {
  const company = useCompany();
  const fmt = useMoney();
  const list = usePosQuery(api.orders.orders, { company });
  if (list === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  return list?.length ? (
    <ul className="divide-y rounded-2xl border bg-card">
      {list.map((o) => {
        const total = o.lines.reduce((s, l) => s + l.packCost * l.packs, 0);
        return (
          <li key={o._id}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40" onClick={() => onOpen(o._id)} type="button">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                  #{o.number} · {o.supplierName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {dateText(o.createdAt)} · {o.lines.length} itens {o.deliveryDate ? `· entrega ${o.deliveryDate}` : ""}
                </p>
              </div>
              <Tag tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Tag>
              {total ? <span className="text-sm tabular-nums">{fmt(total)}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  ) : (
    <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>Nenhum pedido ainda. Crie a partir das sugestões.</p>
  );
}

function OrderDetail({ id, data, onClose }: { id: Id<"invOrders">; data: InvOverview; onClose: () => void }) {
  const company = useCompany();
  const bar = useCurrentCompany();
  const fmt = useMoney();
  const list = usePosQuery(api.orders.orders, { company });
  const suppliers = usePosQuery(api.orders.suppliers, { company });
  const order = list?.find((o) => o._id === id);
  const items = useMemo(() => new Map(data.items.map((i) => [i._id as string, i])), [data.items]);
  const [packs, setPacks] = useState<Record<string, number | undefined>>({});
  const [delivery, setDelivery] = useState<string | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);
  if (!order) {
    return (
      <FullPage onClose={onClose} open title="Pedido">
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </FullPage>
    );
  }
  const supplier = suppliers?.find((s) => s._id === order.supplierId);
  const draft = order.status === "draft";
  const lines = order.lines.map((l) => ({ ...l, packs: packs[l.itemId] ?? l.packs }));
  const deliveryDate = delivery ?? order.deliveryDate ?? "";
  const orderNote = note ?? order.note ?? "";
  const total = lines.reduce((s, l) => s + l.packCost * l.packs, 0);

  const text = [
    `Hello ${supplier?.name ?? order.supplierName},`,
    "",
    `Please find our order #${order.number} for ${bar?.name ?? company}${deliveryDate ? `, delivery on ${deliveryDate}` : ""}:`,
    ...lines
      .filter((l) => l.packs > 0)
      .map((l) => {
        const item = items.get(l.itemId);
        const pack = item ? packText(l.perUnit, item).replace("caixa de", "case of").replace("garrafa", "bottle").replace("unidade", "unit") : "";
        return `- ${num(l.packs)} × ${item?.name ?? "item"}${pack ? ` (${pack})` : ""}`;
      }),
    ...(orderNote ? ["", orderNote] : []),
    "",
    "Thank you.",
  ].join("\n");

  const save = () =>
    sendPos(api.orders.updateOrder, {
      id,
      lines: lines.map(({ itemId, packs: p, perUnit, packCost }) => ({ itemId, packs: p, perUnit, packCost })),
      note: orderNote,
      deliveryDate: deliveryDate || undefined,
    });
  const status = (s: "sent" | "received" | "cancelled") => sendPos(api.orders.setOrderStatus, { id, status: s });
  const phone = (supplier?.phone ?? "").replace(/\D/g, "");
  const send = async (how: "whatsapp" | "email" | "copy") => {
    if (draft) {
      await save();
    }
    if (how === "whatsapp") {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
    } else if (how === "email") {
      window.location.href = `mailto:${supplier?.email ?? ""}?subject=${encodeURIComponent(`Order #${order.number} – ${bar?.name ?? company}`)}&body=${encodeURIComponent(text)}`;
    } else {
      await navigator.clipboard.writeText(text).catch(() => undefined);
    }
  };

  return (
    <FullPage
      footer={
        <div className="flex flex-wrap gap-2">
          {draft || order.status === "sent" ? (
            <Button onClick={() => status("cancelled")} variant="outline">
              Cancelar pedido
            </Button>
          ) : null}
          {draft ? (
            <Button className="flex-1" onClick={async () => { await save(); await status("sent"); }}>
              Marcar como enviado
            </Button>
          ) : null}
          {order.status === "sent" ? (
            <Button className="flex-1" onClick={() => status("received")} variant="outline">
              Recebido (sem invoice ainda)
            </Button>
          ) : null}
        </div>
      }
      onClose={onClose}
      open
      subtitle={`${STATUS[order.status].label}${total ? ` · estimado ${fmt(total)} sem IVA` : ""}`}
      title={`Pedido #${order.number} · ${order.supplierName}`}
    >
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <ul className={cn(CARD, "divide-y")}>
          {lines.map((l) => {
            const item = items.get(l.itemId);
            return (
              <li className="flex items-center gap-3 py-2" key={l.itemId}>
                <span className="min-w-0 flex-1 text-sm">{item?.name ?? "Item"}</span>
                {draft ? (
                  <NumberInput className="h-9 w-16 text-right" onChange={(v) => setPacks((p) => ({ ...p, [l.itemId]: v ?? 0 }))} value={l.packs} />
                ) : (
                  <span className="text-sm tabular-nums">{num(l.packs)}</span>
                )}
                <span className="w-28 text-muted-foreground text-xs">
                  {item ? packText(l.perUnit, item) : ""}
                  {l.packCost ? ` · ${fmt(l.packCost)}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
        {draft ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entrega">
              <Input onChange={(e) => setDelivery(e.target.value)} type="date" value={deliveryDate} />
            </Field>
            <Field label="Observação para o fornecedor">
              <Input onChange={(e) => setNote(e.target.value)} value={orderNote} />
            </Field>
          </div>
        ) : null}
        <div className={cn(CARD, "space-y-2")}>
          <p className="font-medium text-sm">Mensagem para o fornecedor</p>
          <Textarea readOnly rows={Math.min(14, text.split("\n").length + 1)} value={text} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!phone} onClick={() => send("whatsapp")} size="sm" variant="outline">
              WhatsApp
            </Button>
            <Button disabled={!supplier?.email} onClick={() => send("email")} size="sm" variant="outline">
              Email
            </Button>
            <Button onClick={() => send("copy")} size="sm" variant="outline">
              Copiar
            </Button>
          </div>
          {!(phone || supplier?.email) ? (
            <p className="text-muted-foreground text-xs">Cadastre o telefone ou email do fornecedor em Fornecedores.</p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Quando o invoice deste fornecedor for aprovado, o pedido enviado fica como recebido, e o agente de
            invoices compara o que foi pedido com o que foi cobrado.
          </p>
        </div>
      </div>
    </FullPage>
  );
}

export function SupplierEditor({ supplier, onClose }: { supplier: Doc<"invSuppliers"> | null; onClose: () => void }) {
  const company = useCompany();
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [cover, setCover] = useState<number | undefined>(supplier?.coverDays ?? 7);
  const [note, setNote] = useState(supplier?.note ?? "");
  const [taxId, setTaxId] = useState(supplier?.taxId ?? "");
  const save = async () => {
    const id = await sendPos(api.orders.saveSupplier, { company, id: supplier?._id, name, phone, email, coverDays: cover, note, taxId });
    if (id) {
      onClose();
    }
  };
  return (
    <FullPage
      footer={
        <Button className="w-full" disabled={!name.trim()} onClick={save}>
          Salvar fornecedor
        </Button>
      }
      onClose={onClose}
      open
      title={supplier ? supplier.name : "Novo fornecedor"}
    >
      <div className="mx-auto max-w-md space-y-3 p-4">
        <Field label="Nome">
          <Input onChange={(e) => setName(e.target.value)} value={name} />
        </Field>
        <Field hint="Com o código do país, para o WhatsApp (ex.: +356 2138 0000)." label="Telefone / WhatsApp">
          <Input inputMode="tel" onChange={(e) => setPhone(e.target.value)} value={phone} />
        </Field>
        <Field label="Email de pedidos">
          <Input inputMode="email" onChange={(e) => setEmail(e.target.value)} value={email} />
        </Field>
        <Field hint="Quantos dias cada pedido deve durar: intervalo entre entregas + prazo de entrega." label="Dias de cobertura">
          <NumberInput onChange={setCover} value={cover} />
        </Field>
        <Field label="VAT / NIF">
          <Input onChange={(e) => setTaxId(e.target.value)} value={taxId} />
        </Field>
        <Field label="Observações (contato, horário de pedido)">
          <Input onChange={(e) => setNote(e.target.value)} value={note} />
        </Field>
      </div>
    </FullPage>
  );
}

