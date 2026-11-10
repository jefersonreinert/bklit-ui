"use client";

import { useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import {
  money,
  sendPos,
  useCompany,
  usePos,
  usePosQuery,
} from "@/lib/pos/store";
import type { PosProduct } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

/**
 * Inventory (like Lightspeed's Inventory add-on): overview with stock value
 * and what is running low, purchase orders to suppliers (receiving adds
 * the stock at average cost), stock takes with a discrepancy report,
 * recipes (technical sheets) and the log of every movement.
 */

type Section =
  | "overview"
  | "purchases"
  | "suppliers"
  | "counts"
  | "recipes"
  | "moves";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "purchases", label: "Compras" },
  { id: "suppliers", label: "Fornecedores" },
  { id: "counts", label: "Contagem" },
  { id: "recipes", label: "Fichas técnicas" },
  { id: "moves", label: "Movimentos" },
];

const CARD = "rounded-2xl border bg-card p-4";
const SELECT = "h-9 w-full rounded-lg border bg-background px-2 text-sm";

const n = (v: number) =>
  new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 3 }).format(v);
const dateText = (t: number) =>
  new Date(t).toLocaleString(appLocale(), {
    dateStyle: "short",
    timeStyle: "short",
  });

function useMoney() {
  const { settings } = usePos();
  return (v: number) => money(v, settings.currency);
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className={CARD}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "mt-1 font-semibold text-xl tabular-nums",
          tone === "warn" && "text-destructive"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  );
}

/** A product search box that returns the chosen product. */
function ProductPicker({
  products,
  onPick,
  placeholder = "Adicionar produto…",
}: {
  products: PosProduct[];
  onPick: (p: PosProduct) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? products.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 8)
      : [];
  }, [q, products]);
  return (
    <div className="relative">
      <Input
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        value={q}
      />
      {hits.length ? (
        <div className="absolute inset-x-0 top-10 z-10 max-h-64 overflow-auto rounded-xl border bg-popover p-1 shadow-lg">
          {hits.map((p) => (
            <button
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              key={p.id}
              onClick={() => {
                onPick(p);
                setQ("");
              }}
              type="button"
            >
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {p.category}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------- overview ------------------------------- */

function Overview({ onReorder }: { onReorder: () => void }) {
  const company = useCompany();
  const fmt = useMoney();
  const data = usePosQuery(api.inventory.overview, { company });
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [busy, setBusy] = useState(false);
  if (data === undefined) {
    return <Loading />;
  }
  if (!data) {
    return null;
  }
  const s = q.trim().toLowerCase();
  const rows = data.items.filter(
    (r) =>
      (!onlyLow || r.low) &&
      (!s || `${r.name} ${r.category}`.toLowerCase().includes(s))
  );
  const reorder = async () => {
    const items = data.items
      .filter((r) => r.suggest > 0)
      .map((r) => ({ productId: r.id, qty: r.suggest, unitCost: r.cost }));
    if (!items.length) {
      return;
    }
    setBusy(true);
    const id = await sendPos(api.inventory.savePurchase, { company, items });
    setBusy(false);
    if (id) {
      onReorder();
    }
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Valor do estoque (custo)" value={fmt(data.totalValue)} />
        <Tile label="Produtos controlados" value={String(data.items.length)} />
        <Tile
          label="Acabando (no mínimo ou abaixo)"
          tone={data.lowCount ? "warn" : undefined}
          value={String(data.lowCount)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar produto…"
          value={q}
        />
        <Button
          onClick={() => setOnlyLow((v) => !v)}
          size="sm"
          variant={onlyLow ? "default" : "outline"}
        >
          Só acabando
        </Button>
        <Button
          disabled={busy || data.lowCount === 0}
          onClick={reorder}
          size="sm"
          variant="secondary"
        >
          <Icon className="size-4" name="IconArchive" />
          Criar compra com os sugeridos
        </Button>
      </div>
      {data.items.length === 0 ? (
        <p className={cn(CARD, "text-muted-foreground text-sm")}>
          Nenhum produto com controle de estoque. Ative “Controlar estoque” em
          Produtos, ou receba uma compra — os produtos comprados passam a ser
          controlados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2 text-right">Estoque</th>
                <th className="px-3 py-2 text-right">Mínimo</th>
                <th className="px-3 py-2 text-right">Custo</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-right">Comprar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr className="border-t" key={r.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {r.category}
                    </p>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      r.low && "font-semibold text-destructive"
                    )}
                  >
                    {n(r.stock)} {r.unit}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                    {n(r.minStock)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(r.cost)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(r.value)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.suggest ? n(r.suggest) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- suppliers ------------------------------ */

interface Supplier {
  id: Id<"posSuppliers">;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

function SupplierForm({
  supplier,
  onClose,
}: {
  supplier: Supplier | "new";
  onClose: () => void;
}) {
  const company = useCompany();
  const cur = supplier === "new" ? null : supplier;
  const [f, setF] = useState({
    name: cur?.name ?? "",
    contact: cur?.contact ?? "",
    phone: cur?.phone ?? "",
    email: cur?.email ?? "",
    notes: cur?.notes ?? "",
  });
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div className="block space-y-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Input
        aria-label={label}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        type={type}
        value={f[k]}
      />
    </div>
  );
  const save = async () => {
    const id = await sendPos(api.inventory.saveSupplier, {
      company,
      ...(cur ? { id: cur.id } : {}),
      ...f,
    });
    if (id) {
      onClose();
    }
  };
  return (
    <div className="space-y-3 p-4">
      {field("name", "Nome")}
      {field("contact", "Contato (pessoa)")}
      {field("phone", "Telefone / WhatsApp", "tel")}
      {field("email", "E-mail", "email")}
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">Observações</span>
        <textarea
          className="min-h-20 w-full rounded-lg border bg-background p-2 text-sm"
          onChange={(e) => setF({ ...f, notes: e.target.value })}
          value={f.notes}
        />
      </label>
      <div className="flex gap-2">
        <Button disabled={!f.name.trim()} onClick={save}>
          Salvar
        </Button>
        {cur ? (
          <Button
            onClick={async () => {
              await sendPos(api.inventory.removeSupplier, { id: cur.id });
              onClose();
            }}
            variant="ghost"
          >
            Remover
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Suppliers() {
  const company = useCompany();
  const list = usePosQuery(api.inventory.suppliers, { company });
  const [edit, setEdit] = useState<Supplier | "new" | null>(null);
  if (list === undefined) {
    return <Loading />;
  }
  return (
    <div className="space-y-3">
      <Button onClick={() => setEdit("new")} size="sm">
        <Icon className="size-4" name="IconPlusLarge" />
        Novo fornecedor
      </Button>
      {list?.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <button
              className={cn(CARD, "text-left hover:bg-muted/40")}
              key={s.id}
              onClick={() => setEdit(s)}
              type="button"
            >
              <p className="font-medium">{s.name}</p>
              <p className="text-muted-foreground text-xs">
                {[s.contact, s.phone, s.email].filter(Boolean).join(" · ") ||
                  "Sem contato"}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <p className={cn(CARD, "text-muted-foreground text-sm")}>
          Cadastre os seus fornecedores (bebidas, carnes, hortifrúti…) para
          fazer pedidos de compra.
        </p>
      )}
      <FullPage
        backLabel="Estoque"
        onClose={() => setEdit(null)}
        open={edit !== null}
        title={edit === "new" ? "Novo fornecedor" : "Fornecedor"}
      >
        <div className="mx-auto w-full max-w-2xl p-4 pb-10">
        {edit ? (
          <SupplierForm onClose={() => setEdit(null)} supplier={edit} />
        ) : null}
        </div>
      </FullPage>
    </div>
  );
}

/* -------------------------------- purchases ------------------------------ */

type Purchase = NonNullable<
  ReturnType<typeof usePosQuery<typeof api.inventory.purchases>>
>[number];

const STATUS: Record<Purchase["status"], { label: string; tone: string }> = {
  draft: { label: "Rascunho", tone: "bg-muted text-muted-foreground" },
  ordered: { label: "Pedido enviado", tone: "bg-amber-500/15 text-amber-600" },
  received: { label: "Recebida", tone: "bg-emerald-500/15 text-emerald-600" },
  cancelled: { label: "Cancelada", tone: "bg-destructive/10 text-destructive" },
};

interface Line {
  productId: string;
  name: string;
  qty: number;
  unitCost: number;
}

function orderText(p: Purchase, business: string) {
  const lines = p.items.map((i) => `• ${n(i.qty)} × ${i.name}`).join("\n");
  return `Olá! Pedido #${p.number} de ${business}:\n\n${lines}\n\nObrigado!`;
}

function PurchaseEditor({
  purchase,
  suppliers,
  onClose,
}: {
  purchase: Purchase | null;
  suppliers: Supplier[];
  onClose: () => void;
}) {
  const company = useCompany();
  const { products, receipt } = usePos();
  const fmt = useMoney();
  const editable = !purchase || purchase.status === "draft";
  const receiving = purchase?.status === "ordered";
  const [supplierId, setSupplierId] = useState<string>(
    purchase?.supplierId ?? ""
  );
  const [note, setNote] = useState(purchase?.note ?? "");
  const [lines, setLines] = useState<Line[]>(
    purchase?.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      qty: i.received ?? i.qty,
      unitCost: i.unitCost,
    })) ?? []
  );
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const supplier = suppliers.find((s) => s.id === supplierId);

  const set = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = (p: PosProduct) =>
    setLines((ls) =>
      ls.some((l) => l.productId === p.id)
        ? ls
        : [
            ...ls,
            { productId: p.id, name: p.name, qty: 1, unitCost: p.cost ?? 0 },
          ]
    );
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok !== undefined) {
      onClose();
    }
  };
  const save = (thenOrder: boolean) =>
    run(async () => {
      const id = await sendPos(api.inventory.savePurchase, {
        company,
        ...(purchase ? { id: purchase.id } : {}),
        ...(supplierId ? { supplierId: supplierId as Id<"posSuppliers"> } : {}),
        items: lines.map(({ productId, qty, unitCost }) => ({
          productId,
          qty,
          unitCost,
        })),
        note,
      });
      if (id && thenOrder) {
        return await sendPos(api.inventory.setPurchaseStatus, {
          id,
          status: "ordered",
        });
      }
      return id;
    });

  return (
    <div className="space-y-3 p-4">
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">Fornecedor</span>
        <select
          className={SELECT}
          disabled={!editable}
          onChange={(e) => setSupplierId(e.target.value)}
          value={supplierId}
        >
          <option value="">Sem fornecedor</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {editable ? <ProductPicker onPick={add} products={products} /> : null}
      {receiving ? (
        <p className="rounded-xl bg-muted/60 p-2 text-xs">
          Confira o que chegou: ajuste as quantidades e os custos e toque em
          Receber. O estoque e o custo médio são atualizados.
        </p>
      ) : null}
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div className="flex items-center gap-2" key={l.productId}>
            <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
            <Input
              aria-label="Quantidade"
              className="w-20 text-right"
              disabled={!(editable || receiving)}
              inputMode="decimal"
              onChange={(e) => set(i, { qty: Number(e.target.value) || 0 })}
              type="number"
              value={l.qty}
            />
            <Input
              aria-label="Custo unitário"
              className="w-24 text-right"
              disabled={!(editable || receiving)}
              inputMode="decimal"
              onChange={(e) =>
                set(i, { unitCost: Number(e.target.value) || 0 })
              }
              step="0.01"
              type="number"
              value={l.unitCost}
            />
            {editable ? (
              <button
                aria-label="Tirar"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                type="button"
              >
                <Icon className="size-4" name="IconCrossMedium" />
              </button>
            ) : null}
          </div>
        ))}
        {lines.length ? (
          <p className="text-right font-medium text-sm">Total {fmt(total)}</p>
        ) : null}
      </div>
      <textarea
        className="min-h-16 w-full rounded-lg border bg-background p-2 text-sm"
        disabled={!editable}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Observações (entrega, pagamento…)"
        value={note}
      />
      <div className="flex flex-wrap gap-2">
        {editable ? (
          <>
            <Button disabled={busy || !lines.length} onClick={() => save(true)}>
              Salvar e marcar como pedido
            </Button>
            <Button
              disabled={busy || !lines.length}
              onClick={() => save(false)}
              variant="outline"
            >
              Salvar rascunho
            </Button>
          </>
        ) : null}
        {receiving && purchase ? (
          <Button
            disabled={busy}
            onClick={() =>
              run(() =>
                sendPos(api.inventory.receivePurchase, {
                  id: purchase.id,
                  received: lines.map(({ productId, qty, unitCost }) => ({
                    productId,
                    qty,
                    unitCost,
                  })),
                }).then((r) => (r === undefined ? null : true))
              )
            }
          >
            <Icon className="size-4" name="IconCheckmark1" />
            Receber no estoque
          </Button>
        ) : null}
        {purchase && purchase.status !== "draft" && supplier?.phone ? (
          <Button
            onClick={() =>
              window.open(
                `https://wa.me/${supplier.phone?.replace(/\D/g, "")}?text=${encodeURIComponent(orderText(purchase, receipt.businessName))}`,
                "_blank"
              )
            }
            variant="outline"
          >
            Enviar por WhatsApp
          </Button>
        ) : null}
        {purchase && purchase.status !== "draft" && supplier?.email ? (
          <Button
            onClick={() =>
              window.open(
                `mailto:${supplier.email}?subject=${encodeURIComponent(`Pedido #${purchase.number}`)}&body=${encodeURIComponent(orderText(purchase, receipt.businessName))}`
              )
            }
            variant="outline"
          >
            Enviar por e-mail
          </Button>
        ) : null}
        {purchase &&
        (purchase.status === "draft" || purchase.status === "ordered") ? (
          <Button
            disabled={busy}
            onClick={() =>
              run(() =>
                sendPos(api.inventory.setPurchaseStatus, {
                  id: purchase.id,
                  status: "cancelled",
                }).then((r) => (r === undefined ? null : true))
              )
            }
            variant="ghost"
          >
            Cancelar compra
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Purchases() {
  const company = useCompany();
  const fmt = useMoney();
  const list = usePosQuery(api.inventory.purchases, { company });
  const suppliers = usePosQuery(api.inventory.suppliers, { company }) ?? [];
  const [open, setOpen] = useState<Purchase | "new" | null>(null);
  if (list === undefined) {
    return <Loading />;
  }
  return (
    <div className="space-y-3">
      <Button onClick={() => setOpen("new")} size="sm">
        <Icon className="size-4" name="IconPlusLarge" />
        Nova compra
      </Button>
      {list?.length ? (
        <div className="space-y-2">
          {list.map((p) => (
            <button
              className={cn(
                CARD,
                "flex w-full items-center gap-3 text-left hover:bg-muted/40"
              )}
              key={p.id}
              onClick={() => setOpen(p)}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  #{p.number} · {p.supplierName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {p.items.length} itens · {dateText(p.createdAt)} ·{" "}
                  {p.createdBy}
                </p>
              </div>
              <span className="tabular-nums">{fmt(p.total)}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs",
                  STATUS[p.status].tone
                )}
              >
                {STATUS[p.status].label}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className={cn(CARD, "text-muted-foreground text-sm")}>
          Nenhuma compra ainda. Crie um pedido para um fornecedor; quando a
          mercadoria chegar, toque em Receber para lançar no estoque.
        </p>
      )}
      <FullPage
        backLabel="Estoque"
        onClose={() => setOpen(null)}
        open={open !== null}
        title={open === "new" || open === null
                ? "Nova compra"
                : `Compra #${open.number} · ${STATUS[open.status].label}`}
      >
        <div className="mx-auto w-full max-w-2xl p-4 pb-10">
        {open ? (
          <PurchaseEditor
            onClose={() => setOpen(null)}
            purchase={open === "new" ? null : open}
            suppliers={suppliers}
          />
        ) : null}
        </div>
      </FullPage>
    </div>
  );
}

/* ------------------------------- stock takes ----------------------------- */

type Count = NonNullable<
  ReturnType<typeof usePosQuery<typeof api.inventory.counts>>
>[number];

function CountSheet({ count, onClose }: { count: Count; onClose: () => void }) {
  const fmt = useMoney();
  const open = count.status === "open";
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      count.items.map((i) => [
        i.productId,
        i.counted === null ? "" : String(i.counted),
      ])
    )
  );
  const [blind, setBlind] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const entries = () =>
    count.items.map((i) => {
      const raw = values[i.productId]?.trim() ?? "";
      return {
        productId: i.productId,
        counted: raw === "" ? null : Number(raw.replace(",", ".")),
      };
    });
  const save = async () => {
    setBusy(true);
    await sendPos(api.inventory.saveCount, { id: count.id, counts: entries() });
    setBusy(false);
  };
  const close = async () => {
    setBusy(true);
    await sendPos(api.inventory.saveCount, { id: count.id, counts: entries() });
    const res = await sendPos(api.inventory.closeCount, { id: count.id });
    setBusy(false);
    if (res) {
      onClose();
    }
  };
  const s = q.trim().toLowerCase();
  const items = count.items.filter(
    (i) => !s || `${i.name} ${i.category}`.toLowerCase().includes(s)
  );
  return (
    <div className="space-y-3 p-4">
      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-[14rem]"
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            value={q}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              checked={blind}
              onChange={(e) => setBlind(e.target.checked)}
              type="checkbox"
            />
            Contagem às cegas (esconde o estoque do sistema)
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Contados" value={String(count.countedItems)} />
          <Tile label="Com diferença" value={String(count.differences)} />
          <Tile
            label="Diferença em valor"
            tone={count.diffValue < 0 ? "warn" : undefined}
            value={fmt(count.diffValue)}
          />
        </div>
      )}
      <div className="divide-y rounded-2xl border">
        {items.map((i) => {
          const raw = values[i.productId] ?? "";
          const counted = raw === "" ? null : Number(raw.replace(",", "."));
          const diff = counted === null ? null : counted - i.expected;
          return (
            <div
              className="flex items-center gap-2 px-3 py-2"
              key={i.productId}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{i.name}</p>
                <p className="text-muted-foreground text-xs">
                  {i.category}
                  {open && blind
                    ? ""
                    : ` · sistema ${n(i.expected)} ${i.unit ?? ""}`}
                </p>
              </div>
              {!(open && blind) && diff !== null && diff !== 0 ? (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    diff < 0 ? "text-destructive" : "text-emerald-600"
                  )}
                >
                  {diff > 0 ? "+" : ""}
                  {n(diff)}
                </span>
              ) : null}
              <Input
                aria-label={`Contado: ${i.name}`}
                className="w-24 text-right"
                disabled={!open}
                inputMode="decimal"
                onChange={(e) =>
                  setValues((v) => ({ ...v, [i.productId]: e.target.value }))
                }
                placeholder="—"
                value={raw}
              />
            </div>
          );
        })}
      </div>
      {open ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={save} variant="outline">
            Salvar progresso
          </Button>
          <Button disabled={busy} onClick={close}>
            Fechar contagem e ajustar estoque
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              await sendPos(api.inventory.deleteCount, { id: count.id });
              onClose();
            }}
            variant="ghost"
          >
            Descartar
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Fechada em {count.closedAt ? dateText(count.closedAt) : "—"} por{" "}
          {count.closedBy}. Os produtos contados receberam a quantidade contada.
        </p>
      )}
    </div>
  );
}

function Counts() {
  const company = useCompany();
  const fmt = useMoney();
  const { products } = usePos();
  const list = usePosQuery(api.inventory.counts, { company });
  const [openId, setOpenId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const categories = useMemo(
    () =>
      [
        ...new Set(products.filter((p) => p.trackStock).map((p) => p.category)),
      ].sort(),
    [products]
  );
  if (list === undefined) {
    return <Loading />;
  }
  const open = list?.find((c) => c.id === openId) ?? null;
  const start = async () => {
    const id = await sendPos(api.inventory.startCount, {
      company,
      ...(category ? { category } : {}),
    });
    if (id) {
      setOpenId(id);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={cn(SELECT, "w-auto")}
          onChange={(e) => setCategory(e.target.value)}
          value={category}
        >
          <option value="">Todos os produtos controlados</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button onClick={start} size="sm">
          <Icon className="size-4" name="IconPlusLarge" />
          Nova contagem
        </Button>
      </div>
      {list?.length ? (
        <div className="space-y-2">
          {list.map((c) => (
            <button
              className={cn(
                CARD,
                "flex w-full items-center gap-3 text-left hover:bg-muted/40"
              )}
              key={c.id}
              onClick={() => setOpenId(c.id)}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  #{c.number} · {c.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {c.countedItems}/{c.items.length} contados ·{" "}
                  {dateText(c.createdAt)} · {c.createdBy}
                </p>
              </div>
              {c.status === "closed" ? (
                <span
                  className={cn(
                    "text-sm tabular-nums",
                    c.diffValue < 0 && "text-destructive"
                  )}
                >
                  {fmt(c.diffValue)}
                </span>
              ) : null}
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs",
                  c.status === "open"
                    ? "bg-amber-500/15 text-amber-600"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {c.status === "open" ? "Em andamento" : "Fechada"}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className={cn(CARD, "text-muted-foreground text-sm")}>
          Faça a contagem do estoque (stock take): conte o que tem na
          prateleira, e o sistema ajusta e mostra as diferenças em quantidade e
          em dinheiro.
        </p>
      )}
      <FullPage
        backLabel="Estoque"
        onClose={() => setOpenId(null)}
        open={open !== null}
        title={open ? `Contagem #${open.number} · ${open.name}` : ""}
      >
        <div className="mx-auto w-full max-w-2xl p-4 pb-10">
        {open ? (
          <CountSheet
            count={open}
            key={open.id}
            onClose={() => setOpenId(null)}
          />
        ) : null}
        </div>
      </FullPage>
    </div>
  );
}

/* --------------------------------- recipes ------------------------------- */

function RecipeEditor({
  product,
  onClose,
}: {
  product: PosProduct;
  onClose: () => void;
}) {
  const { products } = usePos();
  const fmt = useMoney();
  const cost = usePosQuery(api.inventory.recipeCost, { productId: product.id });
  const byId = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );
  const [lines, setLines] = useState(
    (product.recipe ?? []).map((r) => ({ ...r }))
  );
  const total = lines.reduce(
    (s, l) => s + (byId.get(l.productId)?.cost ?? 0) * l.qty,
    0
  );
  const margin =
    product.price > 0 ? ((product.price - total) / product.price) * 100 : null;
  const save = async () => {
    const r = await sendPos(api.inventory.saveRecipe, {
      productId: product.id,
      recipe: lines,
    });
    if (r !== undefined) {
      onClose();
    }
  };
  return (
    <div className="space-y-3 p-4">
      <p className="text-muted-foreground text-sm">
        Cada venda de <b>{product.name}</b> dá baixa nestes ingredientes (os que
        têm controle de estoque). Use a unidade do ingrediente: 0,05 de uma
        garrafa = 37,5 ml de 750 ml.
      </p>
      <ProductPicker
        onPick={(p) =>
          setLines((ls) =>
            ls.some((l) => l.productId === p.id) || p.id === product.id
              ? ls
              : [...ls, { productId: p.id, qty: 1 }]
          )
        }
        placeholder="Adicionar ingrediente…"
        products={products}
      />
      <div className="space-y-2">
        {lines.map((l, i) => {
          const ing = byId.get(l.productId);
          return (
            <div className="flex items-center gap-2" key={l.productId}>
              <span className="min-w-0 flex-1 truncate text-sm">
                {ing?.name ?? l.productId}
                <span className="text-muted-foreground text-xs">
                  {" "}
                  · {ing?.unit ?? "un"}
                  {ing?.trackStock ? "" : " (sem controle de estoque)"}
                </span>
              </span>
              <Input
                aria-label="Quantidade"
                className="w-24 text-right"
                inputMode="decimal"
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((x, j) =>
                      j === i ? { ...x, qty: Number(e.target.value) || 0 } : x
                    )
                  )
                }
                step="0.01"
                type="number"
                value={l.qty}
              />
              <span className="w-20 text-right text-muted-foreground text-xs tabular-nums">
                {fmt((ing?.cost ?? 0) * l.qty)}
              </span>
              <button
                aria-label="Tirar"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                type="button"
              >
                <Icon className="size-4" name="IconCrossMedium" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Custo" value={fmt(total)} />
        <Tile label="Preço" value={fmt(product.price)} />
        <Tile
          label="Margem"
          tone={margin !== null && margin < 60 ? "warn" : undefined}
          value={margin === null ? "—" : `${margin.toFixed(0)}%`}
        />
      </div>
      {cost === undefined ? null : null}
      <Button onClick={save}>Salvar ficha técnica</Button>
    </div>
  );
}

function Recipes() {
  const { products } = usePos();
  const fmt = useMoney();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<PosProduct | null>(null);
  const byId = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );
  const s = q.trim().toLowerCase();
  const list = products
    .filter((p) => !(p.trackStock || p.wine))
    .filter((p) => !s || `${p.name} ${p.category}`.toLowerCase().includes(s))
    .sort(
      (a, b) =>
        Number(Boolean(b.recipe?.length)) - Number(Boolean(a.recipe?.length))
    )
    .slice(0, 120);
  const costOf = (p: PosProduct) =>
    (p.recipe ?? []).reduce(
      (sum, r) => sum + (byId.get(r.productId)?.cost ?? 0) * r.qty,
      0
    );
  return (
    <div className="space-y-3">
      <Input
        className="max-w-xs"
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar prato ou drink…"
        value={q}
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const c = costOf(p);
          const has = Boolean(p.recipe?.length);
          return (
            <button
              className={cn(CARD, "text-left hover:bg-muted/40")}
              key={p.id}
              onClick={() => setEdit(p)}
              type="button"
            >
              <p className="truncate font-medium">{p.name}</p>
              <p className="text-muted-foreground text-xs">
                {has
                  ? `${p.recipe?.length} ingredientes · custo ${fmt(c)} · margem ${p.price > 0 ? (((p.price - c) / p.price) * 100).toFixed(0) : "—"}%`
                  : "Sem ficha técnica"}
              </p>
            </button>
          );
        })}
      </div>
      <FullPage
        backLabel="Estoque"
        onClose={() => setEdit(null)}
        open={edit !== null}
        title={`Ficha técnica · ${edit?.name ?? ""}`}
      >
        <div className="mx-auto w-full max-w-2xl p-4 pb-10">
        {edit ? (
          <RecipeEditor
            key={edit.id}
            onClose={() => setEdit(null)}
            product={edit}
          />
        ) : null}
        </div>
      </FullPage>
    </div>
  );
}

/* -------------------------------- movements ------------------------------ */

const KIND: Record<string, string> = {
  sale: "Venda",
  purchase: "Compra",
  adjust: "Ajuste",
  waste: "Perda",
  count: "Contagem",
};

function Moves() {
  const company = useCompany();
  const list = usePosQuery(api.inventory.movements, { company });
  if (list === undefined) {
    return <Loading />;
  }
  if (!list?.length) {
    return (
      <p className={cn(CARD, "text-muted-foreground text-sm")}>
        Nenhum movimento ainda.
      </p>
    );
  }
  return (
    <div className="divide-y rounded-2xl border">
      {list.map((m) => (
        <div className="flex items-center gap-3 px-3 py-2 text-sm" key={m.id}>
          <span className="w-20 shrink-0 text-muted-foreground text-xs">
            {KIND[m.kind] ?? m.kind}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate">{m.product}</p>
            <p className="truncate text-muted-foreground text-xs">
              {[dateText(m.at), m.userName, m.note].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span
            className={cn(
              "tabular-nums",
              m.qty < 0 ? "text-destructive" : "text-emerald-600"
            )}
          >
            {m.qty > 0 ? "+" : ""}
            {n(m.qty)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StockView() {
  const [section, setSection] = useState<Section>("overview");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-full border bg-card p-1">
        {SECTIONS.map((s) => (
          <button
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors",
              section === s.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={s.id}
            onClick={() => setSection(s.id)}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "overview" ? (
        <Overview onReorder={() => setSection("purchases")} />
      ) : null}
      {section === "purchases" ? <Purchases /> : null}
      {section === "suppliers" ? <Suppliers /> : null}
      {section === "counts" ? <Counts /> : null}
      {section === "recipes" ? <Recipes /> : null}
      {section === "moves" ? <Moves /> : null}
    </div>
  );
}
