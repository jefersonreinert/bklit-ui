"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { FullPage } from "@/components/dashboard/full-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { newRequestId } from "@/lib/ai/client";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import type { LskCheck, LskFloor } from "@/lib/lightspeed/k-series";
import { fold } from "@/lib/pos/categories";
import { money, sendPos, useCompany, usePos, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { useCan } from "./pos-auth";

/**
 * Lightspeed mode, part 2: controlling the Lightspeed POS from the app.
 * Orders on tables (new or added to an open check), closing checks with
 * a payment, back-office items, stock driven by Lightspeed sales, and the
 * activity log with each send's confirmation from the POS.
 */

const num = (v: string) => Number(v.replace(",", "."));
const fix2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");

const STATUS: Record<string, { label: string; tone: string }> = {
  sending: { label: "Enviando…", tone: "bg-muted text-muted-foreground" },
  sent: { label: "Aguardando o POS", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  done: { label: "Confirmado", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Falhou", tone: "bg-destructive/10 text-destructive" },
};

/** The latest send, shown on top of every Lightspeed screen. */
export function LastOp() {
  const company = useCompany();
  const ops = usePosQuery(api.lightspeedops.ops, { company });
  const last = ops?.[0];
  const [hidden, setHidden] = useState<string | null>(null);
  if (!last || hidden === last.id || Date.now() - last.updatedAt > 10 * 60_000) {
    return null;
  }
  const s = STATUS[last.status] ?? STATUS.sending;
  return (
    <div className="flex items-start gap-2 rounded-2xl border bg-card px-3 py-2 text-sm" role="status">
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", s?.tone)}>{s?.label}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{last.summary}</span>
        {last.result && last.status !== "sending" ? (
          <span className="block truncate text-muted-foreground text-xs">{last.result}</span>
        ) : null}
      </span>
      <button aria-label="Fechar" onClick={() => setHidden(last.id)} type="button">
        <Icon className="size-4" name="IconCrossSmall" />
      </button>
    </div>
  );
}

/* --------------------------------- tables --------------------------------- */

export function TablesControl() {
  const company = useCompany();
  const cur = usePos().settings.currency;
  const data = usePosQuery(api.lightspeed.floor, { company });
  const [open, setOpen] = useState<{ table: string; check: LskCheck | null } | null>(null);
  if (data === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (!data) {
    return null;
  }
  const byTable = new Map(data.checks.filter((c) => c.table !== null).map((c) => [c.table, c]));
  const loose = data.checks.filter((c) => c.table === null);
  const live = open?.check ? (data.checks.find((c) => c.id === open.check?.id) ?? open.check) : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        {data.checks.length} contas abertas · em aberto{" "}
        {money(data.checks.reduce((a, c) => a + c.total - c.paid, 0), cur)} · toque numa mesa para pedir ou fechar
      </p>
      {(data.floors as LskFloor[]).map((f) => (
        <section className="flex flex-col gap-2" key={f.id}>
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{f.name}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {f.tables.map((t) => {
              const c = byTable.get(t.number) ?? null;
              return (
                <button
                  className={cn(
                    "flex min-h-20 flex-col justify-between rounded-2xl border p-2 text-left active:scale-[0.98]",
                    c ? "border-primary/40 bg-primary/10" : "bg-card"
                  )}
                  key={t.id}
                  onClick={() => setOpen({ table: String(t.number || t.name), check: c })}
                  type="button"
                >
                  <span className="flex items-center justify-between font-semibold text-sm">
                    {t.number || t.name}
                    <span className="font-normal text-muted-foreground text-xs">{t.seats}p</span>
                  </span>
                  {c ? (
                    <span className="text-xs">
                      <b className="tabular-nums">{money(c.total - c.paid, cur)}</b>
                      <span className="block truncate text-muted-foreground">{c.staff || "—"}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">livre</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {loose.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Contas sem mesa</h3>
          <ul className="divide-y rounded-2xl border bg-card text-sm">
            {loose.map((c) => (
              <li key={c.id}>
                <button
                  className="flex w-full justify-between gap-3 px-3 py-2.5 text-left"
                  onClick={() => setOpen({ table: "", check: c })}
                  type="button"
                >
                  <span className="truncate">#{c.number} {c.name}</span>
                  <span className="tabular-nums">{money(c.total - c.paid, cur)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.floors.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">Nenhuma planta sincronizada.</p>
      ) : null}
      <TableScreen check={live} onClose={() => setOpen(null)} open={open !== null} table={open?.table ?? ""} />
    </div>
  );
}

function TableScreen({
  open,
  table,
  check,
  onClose,
}: {
  open: boolean;
  table: string;
  check: LskCheck | null;
  onClose: () => void;
}) {
  const cur = usePos().settings.currency;
  const can = useCan();
  const [composing, setComposing] = useState(false);
  const due = check ? Math.max(0, check.total - check.paid) : 0;
  return (
    <FullPage
      backLabel="Mesas"
      onClose={onClose}
      open={open}
      subtitle={check ? `${check.covers || "?"} pax · ${check.staff || "—"}` : "Livre"}
      title={table ? `Mesa ${table}` : check ? `Conta #${check.number}` : ""}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-10">
        <LastOp />
        {check ? (
          <section className="flex flex-col gap-2">
            <ul className="divide-y rounded-2xl border bg-card text-sm">
              {check.items.map((i, n) => (
                <li className="flex justify-between gap-3 px-3 py-2" key={`${i.name}-${n}`}>
                  <span className="truncate">
                    {Math.round(i.qty * 100) / 100} × {i.name}
                  </span>
                  <span className="tabular-nums">{money(i.amount, cur)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between px-1 text-sm">
              <span>Total {check.paid ? `(pago ${money(check.paid, cur)})` : ""}</span>
              <b className="tabular-nums">{money(due, cur)}</b>
            </p>
            <p className="text-muted-foreground text-xs">
              Aberta {check.openedAt ? new Date(check.openedAt).toLocaleTimeString(appLocale(), { hour: "2-digit", minute: "2-digit" }) : ""}
            </p>
          </section>
        ) : (
          <p className="text-muted-foreground text-sm">Mesa livre no Lightspeed.</p>
        )}
        {can(["orders"]) ? (
          <Button className="h-12" onClick={() => setComposing(true)}>
            <Icon className="size-4" name="IconPlusSmall" />
            {check ? "Adicionar itens" : "Abrir pedido nesta mesa"}
          </Button>
        ) : null}
        {check?.identifier && due > 0 && can(["charge"]) ? (
          <PayForm check={check} due={due} table={table} />
        ) : null}
        {check && !check.identifier ? (
          <p className="text-muted-foreground text-xs">
            Esta conta ainda não tem identificador da API; para adicionar itens ou pagar, aguarde a próxima sincronização.
          </p>
        ) : null}
      </div>
      <Composer
        account={check?.identifier || undefined}
        onClose={() => setComposing(false)}
        open={composing}
        table={table}
      />
    </FullPage>
  );
}

function PayForm({ check, due, table }: { check: LskCheck; due: number; table: string }) {
  const company = useCompany();
  const cur = usePos().settings.currency;
  const opts = usePosQuery(api.lightspeedops.options, { company });
  const methods = useMemo(() => opts?.paymentMethods ?? [], [opts]);
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState(fix2(due));
  const [tip, setTip] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setAmount(fix2(due)), [due]);
  useEffect(() => {
    if (!method && methods[0]) {
      setMethod(methods[0].code);
    }
  }, [method, methods]);
  const a = num(amount);
  const t = tip ? num(tip) : 0;
  const valid = method && a > 0 && Number.isFinite(t) && t >= 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) {
      return;
    }
    setBusy(true);
    await sendPos(api.lightspeedops.payCheck, {
      company,
      ref: newRequestId(),
      account: check.identifier,
      table: table || undefined,
      method,
      amount: a,
      tip: t,
    });
    setBusy(false);
  };
  return (
    <form className="flex flex-col gap-3 rounded-2xl border bg-card p-3" onSubmit={submit}>
      <p className="font-semibold text-sm">Fechar conta</p>
      {methods.length === 0 ? (
        <p className="text-muted-foreground text-xs">Formas de pagamento ainda não sincronizadas.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <button
              aria-pressed={method === m.code}
              className={cn("h-10 rounded-full px-3.5 text-sm", method === m.code ? "bg-foreground text-background" : "bg-muted")}
              key={m.code}
              onClick={() => setMethod(m.code)}
              type="button"
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm" htmlFor="lsk-pay-amount">
          Valor
          <Input className="h-11 text-base tabular-nums" id="lsk-pay-amount" inputMode="decimal" onChange={(e) => setAmount(e.target.value)} value={amount} />
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor="lsk-pay-tip">
          Gorjeta
          <Input className="h-11 text-base tabular-nums" id="lsk-pay-tip" inputMode="decimal" onChange={(e) => setTip(e.target.value)} placeholder="0,00" value={tip} />
        </label>
      </div>
      <Button className="h-12" disabled={!valid || busy} type="submit">
        {busy ? "Enviando…" : `Pagar ${money(a + (t || 0), cur)} no Lightspeed`}
      </Button>
      <p className="text-muted-foreground text-xs">
        {a < due ? "Pagamento parcial: a conta continua aberta pelo restante." : "Cobrindo o total, a conta fecha no Lightspeed."}
      </p>
    </form>
  );
}

function Composer({
  open,
  onClose,
  table,
  account,
}: {
  open: boolean;
  onClose: () => void;
  table: string;
  account?: string;
}) {
  const company = useCompany();
  const cur = usePos().settings.currency;
  const menu = usePosQuery(api.lightspeed.menu, { company });
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Map<string, { sku: string; name: string; price: number; qty: number }>>(new Map());
  const [covers, setCovers] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setCart(new Map());
      setQ("");
      setNote("");
      setCovers("");
    }
  }, [open]);
  const f = fold(q.trim());
  const shown = useMemo(
    () => (menu ?? []).filter((i) => i.sku && (!f || fold(`${i.name} ${i.sku} ${i.group}`).includes(f))),
    [menu, f]
  );
  const groups = [...new Set(shown.map((i) => i.group))];
  const add = (i: { sku: string; name: string; price: number }, d: number) =>
    setCart((c) => {
      const next = new Map(c);
      const qty = (next.get(i.sku)?.qty ?? 0) + d;
      if (qty <= 0) {
        next.delete(i.sku);
      } else {
        next.set(i.sku, { ...i, qty });
      }
      return next;
    });
  const lines = [...cart.values()];
  const total = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const send = async () => {
    setBusy(true);
    const res = await sendPos(api.lightspeedops.sendOrder, {
      company,
      ref: newRequestId(),
      table: table || undefined,
      account,
      covers: covers ? Number(covers) : undefined,
      note: note.trim() || undefined,
      items: lines.map((l) => ({ sku: l.sku, qty: l.qty, name: l.name, price: l.price })),
    });
    setBusy(false);
    if (res) {
      onClose();
    }
  };
  return (
    <FullPage
      backLabel="Mesa"
      footer={
        <Button className="h-12 w-full text-base" disabled={!count || busy} onClick={send}>
          {busy ? "Enviando…" : count ? `Enviar ${count} ${count === 1 ? "item" : "itens"} · ${money(total, cur)}` : "Escolha os itens"}
        </Button>
      }
      onClose={onClose}
      open={open}
      subtitle={account ? "Adicionar à conta aberta" : "Novo pedido no Lightspeed"}
      title={table ? `Mesa ${table}` : "Pedido"}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4 pb-10">
        <Input
          aria-label="Buscar no cardápio"
          className="h-11 text-base sm:text-sm"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar item…"
          type="search"
          value={q}
        />
        {lines.length ? (
          <ul className="divide-y rounded-2xl border border-primary/30 bg-primary/5 text-sm">
            {lines.map((l) => (
              <li className="flex items-center gap-2 px-3 py-1.5" key={l.sku}>
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <button aria-label={`Menos ${l.name}`} className="flex size-9 items-center justify-center rounded-full bg-background" onClick={() => add(l, -1)} type="button">
                  −
                </button>
                <span className="w-6 text-center tabular-nums">{l.qty}</span>
                <button aria-label={`Mais ${l.name}`} className="flex size-9 items-center justify-center rounded-full bg-background" onClick={() => add(l, 1)} type="button">
                  +
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {account ? null : (
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Input aria-label="Pessoas" className="h-11 text-base" inputMode="numeric" onChange={(e) => setCovers(e.target.value.replace(/\D/g, ""))} placeholder="Pessoas" value={covers} />
            <Input aria-label="Observação para a cozinha" className="h-11 text-base sm:text-sm" maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" value={note} />
          </div>
        )}
        {menu === undefined ? <p className="text-muted-foreground text-sm">Carregando cardápio…</p> : null}
        {menu && !menu.length ? <p className="text-muted-foreground text-sm">Cardápio do Lightspeed ainda não sincronizado.</p> : null}
        {groups.map((g) => (
          <section className="flex flex-col gap-2" key={g}>
            <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{g}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {shown
                .filter((i) => i.group === g)
                .map((i) => {
                  const inCart = cart.get(i.sku)?.qty ?? 0;
                  return (
                    <button
                      className={cn(
                        "flex min-h-16 flex-col justify-between rounded-2xl border p-2.5 text-left active:scale-[0.98]",
                        inCart ? "border-primary bg-primary/10" : "bg-card"
                      )}
                      key={i._id}
                      onClick={() => add(i, 1)}
                      type="button"
                    >
                      <span className="line-clamp-2 text-sm">{i.name}</span>
                      <span className="flex items-center justify-between text-xs">
                        <span className="tabular-nums">{money(i.price, cur)}</span>
                        {inCart ? <b>× {inCart}</b> : i.modifierGroups ? <span className="text-muted-foreground">opções no POS</span> : null}
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </FullPage>
  );
}

/* ---------------------------------- items --------------------------------- */

type CatalogItem = NonNullable<ReturnType<typeof useCatalog>>[number];
const useCatalog = () => usePosQuery(api.lightspeedops.catalog, { company: useCompany() });

export function ItemsControl() {
  const cur = usePos().settings.currency;
  const can = useCan();
  const items = useCatalog();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<CatalogItem | "new" | null>(null);
  if (items === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  const f = fold(q.trim());
  const shown = (items ?? []).filter((i) => !f || fold(`${i.name} ${i.sku} ${i.barcode ?? ""} ${i.group ?? ""}`).includes(f));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          aria-label="Buscar itens do Lightspeed"
          className="h-11 flex-1 text-base sm:text-sm"
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar em ${items?.length ?? 0} itens…`}
          type="search"
          value={q}
        />
        {can(["products"]) ? (
          <Button aria-label="Novo item no Lightspeed" className="h-11" onClick={() => setEdit("new")}>
            <Icon className="size-5" name="IconPlusSmall" />
            <span className="hidden sm:inline">Novo item</span>
          </Button>
        ) : null}
      </div>
      <ul className="divide-y rounded-2xl border bg-card">
        {shown.slice(0, 300).map((i) => (
          <li key={i._id}>
            <button
              className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left disabled:cursor-default"
              disabled={!can(["products"])}
              onClick={() => setEdit(i)}
              type="button"
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[15px]", !i.active && "text-muted-foreground line-through")}>{i.name}</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {[i.group, i.sku && `SKU ${i.sku}`, i.barcode, i.cost !== undefined ? `custo ${money(i.cost, cur)}` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{money(i.price, cur)}</span>
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <p className="py-6 text-center text-muted-foreground text-sm">Nenhum item.</p> : null}
      <ItemEditor item={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function ItemEditor({ item, onClose }: { item: CatalogItem | "new" | null; onClose: () => void }) {
  const company = useCompany();
  const opts = usePosQuery(api.lightspeedops.options, { company });
  const groups = useMemo(() => opts?.accountingGroups ?? [], [opts]);
  const isNew = item === "new";
  const base = item && item !== "new" ? item : null;
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [active, setActive] = useState(true);
  const [groupId, setGroupId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(base?.name ?? "");
    setSku(base?.sku ?? "");
    setBarcode(base?.barcode ?? "");
    setPrice(base ? fix2(base.price) : "");
    setCost(base?.cost === undefined ? "" : fix2(base.cost));
    setActive(base?.active ?? true);
    setGroupId(base?.groupId ?? "");
  }, [base]);
  useEffect(() => {
    if (groupId === "" && groups[0]) {
      setGroupId(groups[0].id);
    }
  }, [groupId, groups]);
  const p = num(price);
  const c = cost ? num(cost) : undefined;
  const valid =
    Boolean(name.trim()) &&
    Number.isFinite(p) &&
    p >= 0 &&
    (c === undefined || Number.isFinite(c)) &&
    typeof groupId === "number" &&
    Boolean(isNew || sku.trim());
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || typeof groupId !== "number") {
      return;
    }
    setBusy(true);
    const res = await sendPos(api.lightspeedops.saveItem, {
      company,
      ref: newRequestId(),
      itemId: base?.itemId,
      name,
      sku,
      barcode: barcode || undefined,
      price: p,
      cost: c,
      active,
      groupId,
    });
    setBusy(false);
    if (res) {
      onClose();
    }
  };
  return (
    <FullPage
      backLabel="Itens"
      footer={
        <Button className="h-12 w-full text-base" disabled={!valid || busy} form="lsk-item-form" type="submit">
          {busy ? "Enviando…" : isNew ? "Criar no Lightspeed" : "Salvar no Lightspeed"}
        </Button>
      }
      onClose={onClose}
      open={item !== null}
      subtitle="Item do back office do Lightspeed"
      title={isNew ? "Novo item" : (base?.name ?? "")}
    >
      <form className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4 pb-10" id="lsk-item-form" onSubmit={save}>
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="lsk-i-name">
          Nome
          <Input className="h-11 text-base" id="lsk-i-name" maxLength={80} onChange={(e) => setName(e.target.value)} value={name} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="lsk-i-sku">
            SKU
            <Input className="h-11 font-mono text-base" id="lsk-i-sku" onChange={(e) => setSku(e.target.value)} value={sku} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="lsk-i-bar">
            Código de barras
            <Input className="h-11 font-mono text-base" id="lsk-i-bar" inputMode="numeric" onChange={(e) => setBarcode(e.target.value)} value={barcode} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="lsk-i-price">
            Preço
            <Input className="h-11 text-base tabular-nums" id="lsk-i-price" inputMode="decimal" onChange={(e) => setPrice(e.target.value)} placeholder="0,00" value={price} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="lsk-i-cost">
            Custo
            <Input className="h-11 text-base tabular-nums" id="lsk-i-cost" inputMode="decimal" onChange={(e) => setCost(e.target.value)} placeholder="0,00" value={cost} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="lsk-i-group">
          Grupo contábil
          <select
            className="h-11 rounded-lg border bg-background px-3 text-base"
            id="lsk-i-group"
            onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}
            value={groupId}
          >
            {groups.length ? null : <option value="">Grupos ainda não sincronizados</option>}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <span className="flex items-center justify-between text-sm">
          Ativo no POS
          <Switch aria-label="Ativo no POS" checked={active} onCheckedChange={setActive} />
        </span>
        <p className="text-muted-foreground text-xs">
          Em que tela do POS o item aparece continua sendo definido no back office do Lightspeed: a API não organiza as telas.
        </p>
      </form>
    </FullPage>
  );
}

/* ---------------------------------- stock --------------------------------- */

export function StockControl({ onImport }: { onImport: () => void }) {
  const company = useCompany();
  const can = useCan();
  const opts = usePosQuery(api.lightspeedops.options, { company });
  if (!opts) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Baixar estoque com as vendas do Lightspeed</p>
          <p className="text-muted-foreground text-xs">
            Cada venda fechada no Lightspeed tira do estoque do sistema independente o produto com o mesmo SKU (e os
            ingredientes da ficha técnica). Vendas anuladas devolvem. Vale para vendas sincronizadas depois de ligar.
          </p>
        </div>
        <Switch
          aria-label="Baixar estoque com as vendas do Lightspeed"
          checked={opts.stockFromSales}
          disabled={!can(["stock"])}
          onCheckedChange={(on) => sendPos(api.lightspeedops.setStockFromSales, { company, on })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border bg-card p-3">
          <p className="text-muted-foreground text-xs">Itens com SKU no Lightspeed</p>
          <p className="font-semibold text-lg tabular-nums">{opts.skus}</p>
        </div>
        <div className="rounded-2xl border bg-card p-3">
          <p className="text-muted-foreground text-xs">Sem produto no sistema independente</p>
          <p className={cn("font-semibold text-lg tabular-nums", opts.unmatched && "text-amber-600")}>{opts.unmatched}</p>
        </div>
      </div>
      {opts.unmatched ? (
        <Button onClick={onImport} variant="outline">
          Copiar o cardápio para criar os que faltam
        </Button>
      ) : null}
      <p className="text-muted-foreground text-xs">
        A API da Lightspeed K-Series não tem estoque: compras, contagens, fornecedores e fichas técnicas ficam no módulo
        Estoque do modo Independente, e as vendas do Lightspeed passam a baixá-lo automaticamente.
      </p>
    </div>
  );
}

/* -------------------------------- activity -------------------------------- */

export function ActivityControl() {
  const company = useCompany();
  const can = useCan();
  const ops = usePosQuery(api.lightspeedops.ops, { company });
  const [message, setMessage] = useState("");
  const [printer, setPrinter] = useState(false);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      return;
    }
    const res = await sendPos(api.lightspeedops.printMessage, { company, ref: newRequestId(), message, toPrinter: printer });
    if (res) {
      setMessage("");
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {can(["orders"]) ? (
        <form className="flex flex-col gap-2 rounded-2xl border bg-card p-3" onSubmit={send}>
          <p className="font-medium text-sm">Mensagem para o POS</p>
          <Input
            aria-label="Mensagem para a tela do POS"
            className="h-11 text-base sm:text-sm"
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex.: Mesa 12 pediu a conta"
            value={message}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              <Switch aria-label="Também imprimir" checked={printer} onCheckedChange={setPrinter} />
              Também imprimir
            </span>
            <Button disabled={!message.trim()} type="submit">
              Enviar
            </Button>
          </div>
        </form>
      ) : null}
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Enviados ao Lightspeed</h3>
        {ops?.length ? (
          <ul className="divide-y rounded-2xl border bg-card text-sm">
            {ops.map((o) => {
              const s = STATUS[o.status] ?? STATUS.sending;
              return (
                <li className="flex flex-col gap-1 px-3 py-2" key={o.id}>
                  <div className="flex items-center gap-2">
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", s?.tone)}>{s?.label}</span>
                    <span className="min-w-0 flex-1 truncate">{o.summary}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {new Date(o.createdAt).toLocaleString(appLocale(), { dateStyle: "short", timeStyle: "short" })} · {o.by}
                    {o.result ? ` · ${o.result}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Nada enviado ainda.</p>
        )}
      </section>
    </div>
  );
}
