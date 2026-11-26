"use client";

import type { FunctionReturnType } from "convex/server";
import { useMemo, useRef, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Icon } from "@/lib/icons";
import type { ExtractedInvoice } from "@/lib/invoices/types";
import { BASE_PATH } from "@/lib/use-connectors";
import { getSession, sendPos, useCompany, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { DigitalInvoice, OriginalFiles } from "./invoice-digital";
import {
  CARD,
  Field,
  type InvItem,
  type InvOverview,
  NumberInput,
  num,
  Pill,
  Tag,
  useMoney,
} from "./shared";

/**
 * Supplier invoices: photograph or upload the invoice, the AI reads it and
 * links each line to a stock item; the reviewer fixes what is yellow and
 * approves, and the stock comes in at the net cost. Nothing enters the
 * stock before approval.
 */

type Line = Doc<"invInvoices">["lines"][number];
type Filter = "review" | "approved" | "all";

const MATCH_LABEL: Record<Line["match"], string> = {
  ean: "código de barras",
  code: "código do fornecedor",
  alias: "aprendido",
  similar: "sugestão",
  manual: "escolhido",
  none: "sem item",
};

/** Photos shrink to a sharp JPEG (≈2000 px) before going to the AI. */
async function prepare(file: File): Promise<{ data: string; mimeType: string }> {
  const asBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  if (file.type === "application/pdf") {
    return { data: await asBase64(file), mimeType: "application/pdf" };
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { data: url.slice(url.indexOf(",") + 1), mimeType: "image/jpeg" };
}

/** Only the fields the server takes, whatever else the AI returned. */
function toInvoiceArgs(d: ExtractedInvoice) {
  const party = (p: ExtractedInvoice["supplier"] | undefined) => ({
    name: p?.name ?? "",
    taxId: p?.taxId ?? "",
    address: p?.address ?? "",
  });
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
  return {
    supplier: party(d.supplier),
    number: d.number ?? "",
    date: d.date ?? "",
    dueDate: d.dueDate ?? "",
    currency: d.currency ?? "",
    subtotal: num(d.subtotal),
    vatTotal: num(d.vatTotal),
    total: num(d.total),
    lines: (d.lines ?? []).map((l) => ({
      description: l.description ?? "",
      code: l.code ?? "",
      ean: l.ean ?? "",
      quantity: num(l.quantity),
      unit: l.unit ?? "",
      packSize: num(l.packSize),
      packUnit: l.packUnit ?? "",
      unitPrice: num(l.unitPrice),
      vatRate: num(l.vatRate),
      lineTotal: num(l.lineTotal),
    })),
  };
}

export function InvoicesSection({ data }: { data: InvOverview }) {
  const company = useCompany();
  const fmt = useMoney();
  const list = usePosQuery(api.invoices.list, { company });
  const [filter, setFilter] = useState<Filter>("review");
  const [open, setOpen] = useState<Id<"invInvoices"> | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  const read = async (files: File[]) => {
    if (!files.length) {
      return;
    }
    setError(null);
    try {
      setStep("Preparando o arquivo…");
      const prepared = await Promise.all(files.slice(0, 8).map(prepare));
      setStep("A IA está lendo o invoice…");
      const res = await fetch(`${BASE_PATH}/api/inv/read`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-pos-session": getSession() ?? "" },
        body: JSON.stringify({ company, files: prepared }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Não consegui ler o invoice.");
      }
      setStep("Guardando o original…");
      const stored: { id: Id<"_storage">; name: string; type: string }[] = [];
      for (const f of files.slice(0, 8)) {
        const url = await sendPos(api.invoices.uploadUrl, { company });
        if (!url) {
          break;
        }
        const up = await fetch(url, { method: "POST", headers: { "Content-Type": f.type }, body: f });
        const { storageId } = (await up.json()) as { storageId: Id<"_storage"> };
        stored.push({ id: storageId, name: f.name.slice(0, 80), type: f.type });
      }
      setStep("Ligando as linhas aos itens…");
      const id = await sendPos(api.invoices.create, { company, data: toInvoiceArgs(body), files: stored });
      if (id) {
        setOpen(id);
        setFilter("review");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler.");
    } finally {
      setStep(null);
      if (picker.current) {
        picker.current.value = "";
      }
    }
  };

  const rows = (list ?? []).filter((i) =>
    filter === "all" ? true : filter === "review" ? i.status === "review" : i.status === "approved"
  );
  const toReview = (list ?? []).filter((i) => i.status === "review").length;

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-3")}>
        <div>
          <p className="font-medium">Invoices de fornecedores</p>
          <p className="text-muted-foreground text-sm">
            Foto ou PDF. A IA lê, liga cada linha a um item e calcula o custo; o estoque só entra
            quando você aprovar.
          </p>
        </div>
        <Button disabled={Boolean(step)} onClick={() => picker.current?.click()}>
          <Icon className="size-4" name="IconPlusLarge" />
          Novo invoice
        </Button>
        <input
          accept="image/*,application/pdf"
          className="hidden"
          multiple
          onChange={(e) => read([...(e.target.files ?? [])])}
          ref={picker}
          type="file"
        />
      </div>
      {step ? (
        <p className={cn(CARD, "flex items-center gap-2 text-sm")}>
          <Spinner /> {step}
        </p>
      ) : null}
      {error ? <p className={cn(CARD, "text-destructive text-sm")}>{error}</p> : null}

      <div className="flex gap-1.5">
        <Pill active={filter === "review"} onClick={() => setFilter("review")}>
          Para revisar{toReview ? ` (${toReview})` : ""}
        </Pill>
        <Pill active={filter === "approved"} onClick={() => setFilter("approved")}>
          Aprovados
        </Pill>
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          Todos
        </Pill>
      </div>

      {list === undefined ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : rows.length ? (
        <ul className="divide-y rounded-2xl border bg-card">
          {rows.map((i) => (
            <li key={i._id}>
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                onClick={() => setOpen(i._id)}
                type="button"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {i.supplierName} {i.number ? `· ${i.number}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Tag tone="muted">{i.date}</Tag>
                    {i.status === "review" ? (
                      <Tag tone={i.open ? "warn" : "muted"}>
                        {i.open ? `${i.open} linha(s) para resolver` : "pronto para aprovar"}
                      </Tag>
                    ) : null}
                    {i.status === "void" ? <Tag tone="warn">cancelado</Tag> : null}
                    {i.credit ? <Tag tone="muted">nota de crédito</Tag> : null}
                    {i.status === "approved" ? <Tag tone={i.paidAt ? "muted" : "warn"}>{i.paidAt ? "pago" : "a pagar"}</Tag> : null}
                  </div>
                </div>
                <p className="shrink-0 font-medium text-sm tabular-nums">{fmt(i.total)}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(CARD, "text-center text-muted-foreground text-sm")}>Nenhum invoice aqui.</p>
      )}

      {open ? <InvoiceDetail data={data} id={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

type View = "review" | "digital" | "original";

const VIEWS: { id: View; label: string }[] = [
  { id: "review", label: "Revisão" },
  { id: "digital", label: "Digitalizada" },
  { id: "original", label: "Original" },
];

function InvoiceDetail({
  id,
  data,
  onClose,
}: {
  id: Id<"invInvoices">;
  data: InvOverview;
  onClose: () => void;
}) {
  const fmt = useMoney();
  const d = usePosQuery(api.invoices.detail, { id });
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View | null>(null);
  if (!d) {
    return (
      <FullPage onClose={onClose} open title="Invoice">
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </FullPage>
    );
  }
  const inv = d.invoice;
  const review = inv.status === "review";
  const open = inv.lines.filter((l) => !l.skip && !(l.itemId && l.perUnit > 0)).length;
  // To review it opens on the work view; once done, on the clean copy
  const shown: View = view ?? (review ? "review" : "digital");

  const approve = async () => {
    setBusy(true);
    const n = await sendPos(api.invoices.approve, { id });
    setBusy(false);
    if (n !== undefined) {
      onClose();
    }
  };
  const cancel = async () => {
    const reason = window.prompt(
      inv.status === "approved"
        ? "Cancelar e estornar do estoque. Motivo:"
        : "Descartar este invoice. Motivo:"
    );
    if (reason?.trim()) {
      await sendPos(api.invoices.cancel, { id, reason });
      onClose();
    }
  };

  return (
    <FullPage
      footer={
        <div className="flex flex-wrap gap-2">
          {inv.status !== "void" ? (
            <Button onClick={cancel} variant="outline">
              {inv.status === "approved" ? "Estornar" : "Descartar"}
            </Button>
          ) : null}
          {inv.status === "approved" ? (
            <Button
              className="flex-1"
              onClick={() => sendPos(api.invoices.setPaid, { id, paid: !inv.paidAt })}
              variant={inv.paidAt ? "outline" : "default"}
            >
              {inv.paidAt ? "Marcar como não pago" : "Marcar como pago"}
            </Button>
          ) : null}
          {review ? (
            <Button className="flex-1" disabled={busy || open > 0 || Boolean(d.duplicate)} onClick={approve}>
              {open ? `Resolva ${open} linha(s)` : "Aprovar e dar entrada no estoque"}
            </Button>
          ) : null}
        </div>
      }
      onClose={onClose}
      open
      subtitle={`${inv.date} · ${fmt(inv.total)}${inv.status === "approved" ? ` · aprovado por ${inv.approvedBy}` : ""}`}
      title={`${inv.supplierName} ${inv.number}`}
    >
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {d.duplicate ? (
          <p className={cn(CARD, "text-destructive text-sm")}>
            Já existe um invoice deste fornecedor com o número {inv.number} ({d.duplicate.date}). Não
            dá para lançar duas vezes.
          </p>
        ) : null}
        <div className="flex gap-1.5 overflow-x-auto">
          {VIEWS.map((v) => (
            <Pill active={shown === v.id} key={v.id} onClick={() => setView(v.id)}>
              {v.id === "review" && !review ? "Detalhes" : v.label}
            </Pill>
          ))}
        </div>
        {shown === "digital" ? (
          <DigitalInvoice d={d} items={data.items} marks={review} />
        ) : shown === "original" ? (
          <OriginalFiles files={d.files} />
        ) : (
          <>
            {review || inv.review ? <AgentPanel d={d} data={data} editable={review} /> : null}
            <Header d={d} editable={review} />
            <div className="space-y-2">
              <p className="font-medium text-sm">Linhas ({inv.lines.length})</p>
              {inv.lines.map((l) => (
                <LineCard
                  cost={l.itemId ? d.costs[l.itemId] : undefined}
                  editable={review}
                  invoiceId={id}
                  items={data.items}
                  key={l.id}
                  line={l}
                  seeCosts={data.seeCosts}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </FullPage>
  );
}

type Detail = NonNullable<FunctionReturnType<typeof api.invoices.detail>>;

function Header({ d, editable }: { d: Detail; editable: boolean }) {
  const inv = d.invoice;
  const [supplierId, setSupplierId] = useState<string>(inv.supplierId);
  const [newSupplier, setNewSupplier] = useState("");
  const [number, setNumber] = useState(inv.number);
  const [date, setDate] = useState(inv.date);
  const [dueDate, setDueDate] = useState(inv.dueDate ?? "");
  const [total, setTotal] = useState<number | undefined>(inv.total);
  const [vat, setVat] = useState<number | undefined>(inv.vat);
  const [subtotal, setSubtotal] = useState<number | undefined>(inv.subtotal);
  const [credit, setCredit] = useState(inv.credit);
  const [saved, setSaved] = useState(false);
  const fmt = useMoney();
  const linesNet = inv.lines.reduce((s, l) => s + l.net, 0);
  if (!editable) {
    return (
      <div className={cn(CARD, "grid grid-cols-2 gap-2 text-sm sm:grid-cols-4")}>
        <p>
          <span className="block text-muted-foreground text-xs">Vencimento</span>
          {inv.dueDate ?? "—"}
        </p>
        <p>
          <span className="block text-muted-foreground text-xs">Sem IVA</span>
          {fmt(inv.subtotal)}
        </p>
        <p>
          <span className="block text-muted-foreground text-xs">IVA</span>
          {fmt(inv.vat)}
        </p>
        <p>
          <span className="block text-muted-foreground text-xs">Total</span>
          {fmt(inv.total)}
        </p>
      </div>
    );
  }
  const save = async () => {
    const ok = await sendPos(api.invoices.updateHeader, {
      id: inv._id,
      number,
      date,
      dueDate: dueDate || undefined,
      credit,
      subtotal: subtotal ?? 0,
      vat: vat ?? 0,
      total: total ?? 0,
      supplierId: supplierId === "new" ? undefined : (supplierId as Id<"invSuppliers">),
      supplierName: supplierId === "new" ? newSupplier : undefined,
    });
    setSaved(ok !== undefined);
  };
  return (
    <div className={cn(CARD, "space-y-3")}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fornecedor">
          <select
            className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
            onChange={(e) => setSupplierId(e.target.value)}
            value={supplierId}
          >
            {d.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="new">Outro fornecedor…</option>
          </select>
        </Field>
        {supplierId === "new" ? (
          <Field label="Nome do fornecedor">
            <Input onChange={(e) => setNewSupplier(e.target.value)} value={newSupplier} />
          </Field>
        ) : (
          <Field label="Número">
            <Input onChange={(e) => setNumber(e.target.value)} value={number} />
          </Field>
        )}
        <Field label="Data">
          <Input onChange={(e) => setDate(e.target.value)} type="date" value={date} />
        </Field>
        <Field label="Vencimento">
          <Input onChange={(e) => setDueDate(e.target.value)} type="date" value={dueDate} />
        </Field>
        <Field label="Sem IVA">
          <NumberInput onChange={setSubtotal} value={subtotal} />
        </Field>
        <Field label="IVA">
          <NumberInput onChange={setVat} value={vat} />
        </Field>
        <Field hint={`Soma das linhas sem IVA: ${fmt(linesNet)}`} label="Total">
          <NumberInput onChange={setTotal} value={total} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input checked={credit} onChange={(e) => setCredit(e.target.checked)} type="checkbox" />
          Nota de crédito (devolução)
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} size="sm" variant="outline">
          Salvar cabeçalho
        </Button>
        {saved ? <span className="text-muted-foreground text-sm">Salvo.</span> : null}
      </div>
    </div>
  );
}

function LineCard({
  line,
  items,
  invoiceId,
  editable,
  cost,
  seeCosts,
}: {
  line: Line;
  items: InvItem[];
  invoiceId: Id<"invInvoices">;
  editable: boolean;
  cost: number | undefined;
  seeCosts: boolean;
}) {
  const fmt = useMoney();
  const item = items.find((i) => i._id === line.itemId);
  const [picking, setPicking] = useState(false);
  const update = (patch: {
    itemId?: Id<"invItems"> | null;
    perUnit?: number;
    quantity?: number;
    net?: number;
    skip?: boolean;
  }) => sendPos(api.invoices.updateLine, { id: invoiceId, lineId: line.id, ...patch });

  const total = line.quantity * line.perUnit;
  const perContainer = item && total > 0 ? (line.net / total) * (item.unit === "un" ? 1 : item.size) : 0;
  const rise = cost && total > 0 ? (line.net / total - cost) / cost : 0;
  const unsure = line.match === "similar" && line.score < 0.85;
  const ok = line.skip || (item && line.perUnit > 0 && !unsure);

  return (
    <div className={cn(CARD, "space-y-2", line.skip && "opacity-60", !ok && editable && "border-amber-400")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{line.description}</p>
          <p className="text-muted-foreground text-xs">
            {num(line.quantity)} {line.unit || "un"}
            {line.code ? ` · cód. ${line.code}` : ""}
            {line.ean ? ` · EAN ${line.ean}` : ""}
          </p>
        </div>
        <p className="shrink-0 font-medium text-sm tabular-nums">{fmt(line.net)}</p>
      </div>

      {line.skip ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Não é estoque (frete, depósito, serviço)</span>
          {editable ? (
            <button className="underline" onClick={() => update({ skip: false })} type="button">
              É estoque
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {item ? (
              <span className="rounded-lg bg-muted px-2.5 py-1.5 text-sm">{item.name}</span>
            ) : (
              <span className="text-amber-600 text-sm dark:text-amber-400">Sem item de estoque</span>
            )}
            <Tag tone={unsure || !item ? "warn" : "muted"}>
              {MATCH_LABEL[line.match]}
              {line.match === "similar" ? ` ${Math.round(line.score * 100)}%` : ""}
            </Tag>
            {editable ? (
              <>
                {unsure && item ? (
                  <Button onClick={() => update({ itemId: item._id })} size="sm">
                    Confirmar
                  </Button>
                ) : null}
                <Button onClick={() => setPicking(true)} size="sm" variant="outline">
                  {item ? "Trocar" : "Escolher item"}
                </Button>
                <Button onClick={() => update({ skip: true })} size="sm" variant="ghost">
                  Não é estoque
                </Button>
              </>
            ) : null}
          </div>
          {item ? (
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <Field label={`1 ${line.unit || "un"} da nota =`}>
                {editable ? (
                  <div className="flex items-center gap-2">
                    <NumberInput
                      className="h-9 w-28"
                      onChange={(v) => (v !== undefined && v >= 0 ? update({ perUnit: v }) : undefined)}
                      value={line.perUnit || undefined}
                    />
                    <span>{item.unit}</span>
                  </div>
                ) : (
                  <span>
                    {num(line.perUnit)} {item.unit}
                  </span>
                )}
              </Field>
              {item.unit !== "un" && line.perUnit > 0 ? (
                <span className="pb-2 text-muted-foreground">
                  = {num(line.perUnit / item.size)} {item.container}(s)
                </span>
              ) : null}
              {seeCosts && perContainer > 0 ? (
                <span className="pb-2">
                  {fmt(perContainer)} por {item.unit === "un" ? "unidade" : item.container}
                  {rise > 0.02 ? (
                    <span className="ml-1 text-destructive">▲ {Math.round(rise * 100)}% acima do custo atual</span>
                  ) : null}
                  {rise < -0.02 ? (
                    <span className="ml-1 text-emerald-600">▼ {Math.round(-rise * 100)}%</span>
                  ) : null}
                </span>
              ) : null}
            </div>
          ) : null}
          {editable ? (
            <div className="grid grid-cols-2 gap-3 sm:w-80">
              <Field label="Quantidade">
                <NumberInput
                  className="h-9"
                  onChange={(v) => (v !== undefined && v > 0 ? update({ quantity: v }) : undefined)}
                  value={line.quantity}
                />
              </Field>
              <Field label="Valor sem IVA">
                <NumberInput
                  className="h-9"
                  onChange={(v) => (v !== undefined ? update({ net: v }) : undefined)}
                  value={line.net}
                />
              </Field>
            </div>
          ) : null}
        </>
      )}
      {picking ? (
        <ItemPicker
          items={items}
          onClose={() => setPicking(false)}
          onPick={(i) => {
            setPicking(false);
            void update({ itemId: i._id });
          }}
          query={line.description}
        />
      ) : null}
    </div>
  );
}

function ItemPicker({
  items,
  query,
  onPick,
  onClose,
}: {
  items: InvItem[];
  query: string;
  onPick: (i: InvItem) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter((i) => i.active && (!s || i.name.toLowerCase().includes(s)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [q, items]);
  return (
    <FullPage onClose={onClose} open subtitle={query} title="Qual item de estoque é este?">
      <div className="mx-auto max-w-xl space-y-2 p-4">
        <Input autoFocus onChange={(e) => setQ(e.target.value)} placeholder="Buscar item…" value={q} />
        <ul className="divide-y rounded-2xl border bg-card">
          {hits.map((i) => (
            <li key={i._id}>
              <button className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted/40" onClick={() => onPick(i)} type="button">
                {i.name}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Não está na lista? Crie o item na aba Itens e volte aqui.
        </p>
      </div>
    </FullPage>
  );
}

type Finding = NonNullable<Detail["invoice"]["review"]>["findings"][number];

const LEVEL: Record<Finding["level"], { label: string; tone: string }> = {
  error: { label: "Erro", tone: "border-destructive/40 bg-destructive/5 text-destructive" },
  warn: { label: "Atenção", tone: "border-amber-400/50 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" },
  info: { label: "Info", tone: "border-border bg-muted/40 text-foreground" },
};

/**
 * The invoice agent: Claude reads the original next to the catalog and
 * this supplier's history, links the lines, fixes the header and lists
 * what a manager must look at. It never approves.
 */
function AgentPanel({ d, data, editable }: { d: Detail; data: InvOverview; editable: boolean }) {
  const company = useCompany();
  const inv = d.invoice;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/inv/agent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-pos-session": getSession() ?? "" },
        body: JSON.stringify({ id: inv._id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "O agente falhou.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "O agente falhou.");
    } finally {
      setRunning(false);
    }
  };
  const [applied, setApplied] = useState<Set<number>>(new Set());
  /** New item (if any) → linked to its line → sheets of the products that use it. */
  const apply = async (f: Finding, index: number) => {
    const line = inv.lines.find((l) => l.id === f.lineId);
    let itemId = line?.itemId ?? null;
    if (f.newItem && f.lineId) {
      const created = await sendPos(api.inv.saveItem, {
        company,
        name: f.newItem.name,
        category: f.newItem.category,
        unit: f.newItem.unit,
        size: f.newItem.size,
        container: f.newItem.container,
        barcodes: [],
      });
      if (!created) {
        return;
      }
      itemId = created;
      await sendPos(api.invoices.updateLine, { id: inv._id, lineId: f.lineId, itemId: created, skip: false });
    }
    if (itemId) {
      for (const u of f.uses ?? []) {
        await sendPos(api.recipes.addUse, { company, productId: u.productId, itemId, qty: u.qty });
      }
    }
    setApplied((s) => new Set(s).add(index));
  };
  const unitOf = (f: Finding) =>
    f.newItem?.unit ?? data.items.find((i) => i._id === inv.lines.find((l) => l.id === f.lineId)?.itemId)?.unit ?? "";
  const lineName = (id?: string) => inv.lines.find((l) => l.id === id)?.description;
  const order: Finding["level"][] = ["error", "warn", "info"];
  const findings = [...(inv.review?.findings ?? [])].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));

  return (
    <div className={cn(CARD, "space-y-3")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Agente de invoices</p>
          <p className="text-muted-foreground text-sm">
            Confere o original com o catálogo e o histórico do fornecedor, liga as linhas, acerta o
            cabeçalho e aponta duplicados, contas, IVA e preços. Você continua aprovando.
          </p>
        </div>
        {editable ? (
          <Button disabled={running} onClick={run}>
            {running ? "Conferindo…" : inv.review ? "Conferir de novo" : "Conferir com o agente"}
          </Button>
        ) : null}
      </div>
      {running ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner /> O agente está lendo o invoice e conferindo linha por linha. Pode levar 1 a 2 minutos.
        </p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {inv.review && !running ? (
        <>
          <p className="whitespace-pre-wrap text-sm">{inv.review.summary}</p>
          {findings.length ? (
            <ul className="space-y-2">
              {findings.map((f, i) => (
                <li className={cn("rounded-xl border px-3 py-2 text-sm", LEVEL[f.level].tone)} key={`${i}-${f.text.slice(0, 20)}`}>
                  <span className="font-medium">{LEVEL[f.level].label}</span>
                  {f.lineId ? <span className="opacity-80"> · {lineName(f.lineId)}</span> : null}
                  <span className="block">{f.text}</span>
                  {f.uses?.length ? (
                    <span className="mt-1 block text-xs opacity-90">
                      Fichas: {f.uses.map((u) => `${u.product} = ${num(u.qty)} ${unitOf(f)}`).join(" · ")}
                    </span>
                  ) : null}
                  {editable && f.lineId && (f.newItem || f.uses?.length) ? (
                    <Button className="mt-2" disabled={applied.has(i)} onClick={() => apply(f, i)} size="sm" variant="outline">
                      {applied.has(i)
                        ? "Feito"
                        : f.newItem
                          ? `Criar “${f.newItem.name}”${f.uses?.length ? `, ligar e criar ${f.uses.length} ficha(s)` : " e ligar"}`
                          : `Criar ${f.uses?.length} ficha(s)`}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Conferido em {new Date(inv.review.at).toLocaleString()} por {inv.review.by}
            {inv.review.inputTokens ? ` · ${num((inv.review.inputTokens + (inv.review.outputTokens ?? 0)) / 1000, 0)} mil tokens` : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
