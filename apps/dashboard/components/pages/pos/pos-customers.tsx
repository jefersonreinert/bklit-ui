"use client";

import { useMemo, useState } from "react";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import type { PosOrder } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { useCan } from "./pos-auth";
import { QrCode } from "./pos-qr";
import { QrScanner } from "./pos-scanner";

/**
 * Guest book and loyalty (Lightspeed Loyalty): customers shared by every
 * business, VIP discounts, punch cards and gift cards with a balance.
 * - CustomerButton: pick the order's customer in the cart (VIP discount,
 *   stamps, rewards);
 * - GiftCardStep: pay with, sell or top up a gift card at checkout;
 * - CustomersView: the "Clientes" tab.
 */

type CustomerId = Id<"posCustomers">;
type Customer = NonNullable<
  ReturnType<typeof usePosQuery<typeof api.loyalty.searchCustomers>>
>[number];

const CARD = "rounded-2xl border bg-card p-4";
const SELECT = "h-9 w-full rounded-lg border bg-background px-2 text-sm";

const dateText = (t: number) =>
  new Date(t).toLocaleDateString(appLocale(), { dateStyle: "medium" });

function useMoney() {
  const { settings } = usePos();
  return (v: number) => money(v, settings.currency);
}

function Loading() {
  return (
    <div className="flex justify-center py-8">
      <Spinner />
    </div>
  );
}

/* ------------------------------ customer form ---------------------------- */

function CustomerForm({
  customer,
  onSaved,
}: {
  customer: Partial<Customer> | null;
  onSaved: (id: CustomerId) => void;
}) {
  const can = useCan();
  const [f, setF] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    birthday: customer?.birthday ?? "",
    notes: customer?.notes ?? "",
    tags: (customer?.tags ?? []).join(", "),
    vip: String(customer?.vip ?? 0),
    optIn: customer?.optIn ?? false,
  });
  const [busy, setBusy] = useState(false);
  const field = (
    k: "name" | "phone" | "email" | "birthday",
    label: string,
    type = "text"
  ) => (
    <div className="space-y-1 text-sm">
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
    setBusy(true);
    const id = await sendPos(api.loyalty.saveCustomer, {
      ...(customer?.id ? { id: customer.id } : {}),
      name: f.name,
      phone: f.phone,
      email: f.email,
      birthday: f.birthday,
      notes: f.notes,
      tags: f.tags.split(","),
      vip: Number(f.vip) || 0,
      optIn: f.optIn,
    });
    setBusy(false);
    if (id) {
      onSaved(id);
    }
  };
  return (
    <div className="space-y-3">
      {field("name", "Nome")}
      <div className="grid grid-cols-2 gap-2">
        {field("phone", "Telefone", "tel")}
        {field("birthday", "Aniversário", "date")}
      </div>
      {field("email", "E-mail", "email")}
      <div className="space-y-1 text-sm">
        <span className="text-muted-foreground text-xs">
          Etiquetas (separadas por vírgula)
        </span>
        <Input
          aria-label="Etiquetas"
          onChange={(e) => setF({ ...f, tags: e.target.value })}
          placeholder="vegano, mesa da janela, alergia a nozes"
          value={f.tags}
        />
      </div>
      {can(["settings", "reports"]) ? (
        <div className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">
            Cartão VIP — desconto em todos os pedidos (%)
          </span>
          <Input
            aria-label="Desconto VIP"
            inputMode="numeric"
            max={100}
            min={0}
            onChange={(e) => setF({ ...f, vip: e.target.value })}
            type="number"
            value={f.vip}
          />
        </div>
      ) : null}
      <textarea
        aria-label="Observações"
        className="min-h-16 w-full rounded-lg border bg-background p-2 text-sm"
        onChange={(e) => setF({ ...f, notes: e.target.value })}
        placeholder="Observações (preferências, alergias…)"
        value={f.notes}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={f.optIn}
          onChange={(e) => setF({ ...f, optIn: e.target.checked })}
          type="checkbox"
        />
        Aceita receber ofertas (GDPR)
      </label>
      <Button disabled={busy || !f.name.trim()} onClick={save}>
        Salvar cliente
      </Button>
    </div>
  );
}

/* ---------------------------- customer details --------------------------- */

function CustomerDetails({
  id,
  onClose,
}: {
  id: CustomerId;
  onClose: () => void;
}) {
  const fmt = useMoney();
  const can = useCan();
  const { receipt } = usePos();
  const c = usePosQuery(api.loyalty.customer, { id });
  const [editing, setEditing] = useState(false);
  if (c === undefined) {
    return <Loading />;
  }
  if (!c) {
    return <p className="p-4 text-sm">Cliente não encontrado.</p>;
  }
  if (editing) {
    return (
      <div className="p-4">
        <CustomerForm customer={c} onSaved={() => setEditing(false)} />
      </div>
    );
  }
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-4">
        <QrCode
          label="Cartão do cliente"
          size={112}
          value={`CB-CUST:${c.code}`}
        />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-lg">{c.name}</p>
          <p className="text-muted-foreground text-sm">
            {[c.phone, c.email].filter(Boolean).join(" · ") || "Sem contato"}
          </p>
          <p className="font-mono text-xs tracking-widest">{c.code}</p>
          {c.vip ? (
            <span className="inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 text-xs">
              VIP {c.vip}%
            </span>
          ) : null}
          {c.tags.map((t) => (
            <span
              className="mr-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs"
              key={t}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className={CARD}>
          <p className="text-muted-foreground text-xs">Visitas</p>
          <p className="font-semibold text-lg">{c.visits}</p>
        </div>
        <div className={CARD}>
          <p className="text-muted-foreground text-xs">Gastou</p>
          <p className="font-semibold text-lg">{fmt(c.spent)}</p>
        </div>
        <div className={CARD}>
          <p className="text-muted-foreground text-xs">Média</p>
          <p className="font-semibold text-lg">
            {fmt(c.visits ? c.spent / c.visits : 0)}
          </p>
        </div>
      </div>
      {c.programs.length ? (
        <div className="space-y-2">
          <p className="font-medium text-sm">Cartões de selos</p>
          {c.programs.map((p) => (
            <Stamps
              count={p.count}
              key={p.programId}
              name={p.name}
              stamps={p.stamps}
            />
          ))}
        </div>
      ) : null}
      {c.gifts.length ? (
        <div className="space-y-1">
          <p className="font-medium text-sm">Gift cards</p>
          {c.gifts.map((g) => (
            <p className="text-sm" key={g.code}>
              <span className="font-mono">{g.code}</span> · saldo{" "}
              {fmt(g.balance)}
            </p>
          ))}
        </div>
      ) : null}
      {c.notes ? (
        <p className="whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-sm">
          {c.notes}
        </p>
      ) : null}
      <div className="space-y-2">
        <p className="font-medium text-sm">Últimos pedidos</p>
        {c.orders.length ? (
          c.orders.map((o) => (
            <div className="rounded-xl border p-2 text-sm" key={o.id}>
              <div className="flex justify-between">
                <span>
                  #{o.number} · {dateText(o.closedAt)}
                </span>
                <span className="tabular-nums">{fmt(o.total)}</span>
              </div>
              <p className="truncate text-muted-foreground text-xs">
                {o.items.join(", ")}
              </p>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">Nenhum pedido ainda.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing(true)} variant="outline">
          Editar
        </Button>
        {c.phone ? (
          <Button
            onClick={() =>
              window.open(
                `https://wa.me/${c.phone}?text=${encodeURIComponent(`Olá ${c.name.split(" ")[0]}! Aqui é do ${receipt.businessName}. O seu cartão de cliente: ${c.code}`)}`,
                "_blank"
              )
            }
            variant="outline"
          >
            Enviar cartão por WhatsApp
          </Button>
        ) : null}
        {can(["settings", "reports"]) ? (
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            Apagar (GDPR)
            <ConfirmButton
              confirmLabel="Toque de novo para apagar"
              label={`Apagar ${c.name}`}
              onConfirm={async () => {
                await sendPos(api.loyalty.deleteCustomer, { id });
                onClose();
              }}
            />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Stamps({
  name,
  count,
  stamps,
}: {
  name: string;
  count: number;
  stamps: number;
}) {
  const shown = Math.min(count, stamps);
  return (
    <div className="rounded-xl border p-2">
      <div className="mb-1.5 flex justify-between text-sm">
        <span>{name}</span>
        <span className="text-muted-foreground text-xs">
          {count >= stamps ? "Prêmio disponível!" : `${count}/${stamps}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: stamps }, (_, i) => (
          <span
            className={cn(
              "size-4 rounded-full border-2",
              i < shown
                ? "border-[#c96442] bg-[#c96442]"
                : "border-muted-foreground/30"
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed slots
            key={i}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ search / pick ---------------------------- */

function CustomerSearch({ onPick }: { onPick: (c: Customer) => void }) {
  const [q, setQ] = useState("");
  const [scan, setScan] = useState(false);
  const [creating, setCreating] = useState(false);
  const list = usePosQuery(api.loyalty.searchCustomers, { q });
  if (creating) {
    return (
      <CustomerForm
        customer={{ name: q }}
        onSaved={(id) => {
          setCreating(false);
          onPick({ id, name: q } as Customer);
        }}
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome, telefone, e-mail ou código do cartão"
          value={q}
        />
        <Button
          aria-label="Ler cartão"
          onClick={() => setScan((s) => !s)}
          variant={scan ? "default" : "outline"}
        >
          <Icon className="size-4" name="IconQrCode" />
        </Button>
      </div>
      {scan ? (
        <QrScanner
          onCode={(text) => {
            setScan(false);
            setQ(text);
          }}
        />
      ) : null}
      {list === undefined ? <Loading /> : null}
      <div className="space-y-1">
        {(list ?? []).map((c) => (
          <button
            className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left hover:bg-muted/50"
            key={c.id}
            onClick={() => onPick(c)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-sm">
                {c.name}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {[c.phone, c.email, `${c.visits} visitas`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {c.vip ? (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 text-xs">
                VIP {c.vip}%
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <Button
        className="w-full"
        onClick={() => setCreating(true)}
        variant="outline"
      >
        <Icon className="size-4" name="IconPlusLarge" />
        Novo cliente{q.trim() ? `: ${q.trim()}` : ""}
      </Button>
    </div>
  );
}

/** The order's customer, in the cart header. */
export function CustomerButton({ order }: { order: PosOrder }) {
  const [open, setOpen] = useState(false);
  const customerId = order.customerId as CustomerId | undefined;
  const attach = (id: CustomerId | null) =>
    sendPos(api.loyalty.attachCustomer, { orderId: order.id, customerId: id });
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant={customerId ? "secondary" : "ghost"}
      >
        <Icon className="size-4" name="IconPeople" />
        <span className="max-w-24 truncate">
          {order.customerName ?? "Cliente"}
        </span>
      </Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Cliente do pedido #{order.number}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-4">
            {customerId ? (
              <AttachedCustomer
                id={customerId}
                key={customerId}
                onRemove={() => attach(null)}
                orderId={order.id}
              />
            ) : (
              <CustomerSearch onPick={(picked) => attach(picked.id)} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function AttachedCustomer({
  id,
  orderId,
  onRemove,
}: {
  id: CustomerId;
  orderId: string;
  onRemove: () => void;
}) {
  const company = useCompany();
  const c = usePosQuery(api.loyalty.customer, { id });
  const [msg, setMsg] = useState<string | null>(null);
  if (c === undefined) {
    return <Loading />;
  }
  if (!c) {
    return (
      <Button className="w-full" onClick={onRemove} variant="ghost">
        Tirar cliente do pedido
      </Button>
    );
  }
  const programs = c.programs.filter((p) => p.company === company);
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <p className="font-semibold">{c.name}</p>
        <p className="text-muted-foreground text-xs">
          {c.visits} visitas · {c.vip ? `VIP ${c.vip}% aplicado` : "sem VIP"}
        </p>
        {c.notes ? <p className="mt-2 text-sm">{c.notes}</p> : null}
        {c.tags.length ? (
          <p className="mt-1 text-muted-foreground text-xs">
            {c.tags.join(" · ")}
          </p>
        ) : null}
      </div>
      {programs.map((p) => (
        <div className="space-y-2" key={p.programId}>
          <Stamps count={p.count} name={p.name} stamps={p.stamps} />
          {p.count >= p.stamps ? (
            <Button
              className="w-full"
              onClick={async () => {
                const off = await sendPos(api.loyalty.redeemReward, {
                  orderId,
                  programId: p.programId as Id<"posPunchPrograms">,
                });
                if (off !== undefined) {
                  setMsg("Prêmio adicionado ao pedido.");
                }
              }}
            >
              Usar prêmio: {p.name}
            </Button>
          ) : null}
        </div>
      ))}
      {msg ? <p className="text-sm">{msg}</p> : null}
      <Button className="w-full" onClick={onRemove} variant="ghost">
        Tirar cliente do pedido
      </Button>
    </div>
  );
}

/* ------------------------------- gift cards ------------------------------ */

/** Checkout step: pay with, sell or top up a gift card. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: three small modes of one step
export function GiftCardStep({
  order,
  onDone,
}: {
  order: PosOrder;
  onDone: () => void;
}) {
  const fmt = useMoney();
  const [mode, setMode] = useState<"pay" | "sell" | "topup">("pay");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [scan, setScan] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const found = usePosQuery(api.loyalty.giftLookup, {
    code: code.trim().length >= 6 ? code : "-",
  });
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    return r;
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-full border p-1">
        {(
          [
            ["pay", "Pagar com"],
            ["sell", "Vender"],
            ["topup", "Recarregar"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-sm",
              mode === id
                ? "bg-foreground text-background"
                : "text-muted-foreground"
            )}
            key={id}
            onClick={() => {
              setMode(id);
              setMsg(null);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {mode !== "sell" ? (
        <>
          <div className="flex gap-2">
            <Input
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código do gift card"
              value={code}
            />
            <Button
              aria-label="Ler QR"
              onClick={() => setScan((s) => !s)}
              variant={scan ? "default" : "outline"}
            >
              <Icon className="size-4" name="IconQrCode" />
            </Button>
          </div>
          {scan ? (
            <QrScanner
              onCode={(t) => {
                setScan(false);
                setCode(t);
              }}
            />
          ) : null}
          {found ? (
            <p className={cn("text-sm", found.problem && "text-destructive")}>
              {found.problem ?? `${found.label} · saldo ${fmt(found.balance)}`}
            </p>
          ) : null}
          {found === null && code.trim().length >= 6 ? (
            <p className="text-destructive text-sm">
              Gift card não encontrado.
            </p>
          ) : null}
        </>
      ) : null}
      {mode !== "pay" ? (
        <Input
          inputMode="decimal"
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Valor"
          type="number"
          value={amount}
        />
      ) : null}
      {mode === "pay" ? (
        <Button
          className="h-12 rounded-full"
          disabled={busy || !found || Boolean(found.problem)}
          onClick={() =>
            run(async () => {
              const r = await sendPos(api.loyalty.redeemGiftCard, {
                orderId: order.id,
                code,
              });
              if (r) {
                setMsg(`Usado ${fmt(r.used)} · fica ${fmt(r.left)} no cartão.`);
                setTimeout(onDone, 900);
              }
            })
          }
        >
          Usar o saldo no pedido
        </Button>
      ) : null}
      {mode === "sell" ? (
        <Button
          className="h-12 rounded-full"
          disabled={busy || !(Number(amount) > 0)}
          onClick={() =>
            run(async () => {
              const c = await sendPos(api.loyalty.sellGiftCard, {
                orderId: order.id,
                amount: Number(amount),
              });
              if (c) {
                setMsg(
                  `Gift card ${c} adicionado ao pedido. Ele é ativado quando o pedido for pago.`
                );
                setCode(c);
              }
            })
          }
        >
          Adicionar gift card ao pedido
        </Button>
      ) : null}
      {mode === "topup" ? (
        <Button
          className="h-12 rounded-full"
          disabled={busy || !found?.active || !(Number(amount) > 0)}
          onClick={() =>
            run(async () => {
              const r = await sendPos(api.loyalty.topUpGiftCard, {
                orderId: order.id,
                code,
                amount: Number(amount),
              });
              if (r !== undefined) {
                setMsg(
                  "Recarga adicionada ao pedido (entra no saldo quando pago)."
                );
              }
            })
          }
        >
          Adicionar recarga ao pedido
        </Button>
      ) : null}
      {mode === "sell" && msg && code ? (
        <div className="flex flex-col items-center gap-2">
          <QrCode label="Gift card" size={160} value={`CB-GIFT:${code}`} />
          <p className="font-mono text-sm tracking-widest">{code}</p>
        </div>
      ) : null}
      {msg ? <p className="text-center text-sm">{msg}</p> : null}
      <Button onClick={onDone} variant="ghost">
        Voltar
      </Button>
    </div>
  );
}

/* --------------------------------- programs ------------------------------ */

type Program = NonNullable<
  ReturnType<typeof usePosQuery<typeof api.loyalty.programs>>
>[number];

function ProgramForm({
  program,
  onClose,
}: {
  program: Program | null;
  onClose: () => void;
}) {
  const company = useCompany();
  const { products } = usePos();
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products]
  );
  const [f, setF] = useState({
    name: program?.name ?? "",
    categories: program?.categories ?? [],
    stamps: String(program?.stamps ?? 10),
    reward: program?.reward ?? ("free" as "free" | "amount"),
    rewardValue: String(program?.rewardValue ?? 0),
    active: program?.active ?? true,
  });
  const toggle = (c: string) =>
    setF({
      ...f,
      categories: f.categories.includes(c)
        ? f.categories.filter((x) => x !== c)
        : [...f.categories, c],
    });
  const save = async () => {
    const id = await sendPos(api.loyalty.saveProgram, {
      company,
      ...(program ? { id: program.id } : {}),
      name: f.name,
      categories: f.categories,
      productIds: program?.productIds ?? [],
      stamps: Number(f.stamps) || 0,
      reward: f.reward,
      rewardValue: Number(f.rewardValue) || 0,
      active: f.active,
    });
    if (id) {
      onClose();
    }
  };
  return (
    <div className="space-y-3 p-4">
      <Input
        aria-label="Nome"
        onChange={(e) => setF({ ...f, name: e.target.value })}
        placeholder="Nome (ex.: Cartão do café)"
        value={f.name}
      />
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">
          Categorias que ganham selo (1 selo por item)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                f.categories.includes(c) &&
                  "border-foreground bg-foreground text-background"
              )}
              key={c}
              onClick={() => toggle(c)}
              type="button"
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">
            Selos para o prêmio
          </span>
          <Input
            aria-label="Selos"
            inputMode="numeric"
            onChange={(e) => setF({ ...f, stamps: e.target.value })}
            type="number"
            value={f.stamps}
          />
        </div>
        <div className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">Prêmio</span>
          <select
            aria-label="Prêmio"
            className={SELECT}
            onChange={(e) =>
              setF({ ...f, reward: e.target.value as "free" | "amount" })
            }
            value={f.reward}
          >
            <option value="free">Item grátis (o mais barato do cartão)</option>
            <option value="amount">Desconto em valor</option>
          </select>
        </div>
      </div>
      {f.reward === "amount" ? (
        <Input
          aria-label="Valor do desconto"
          inputMode="decimal"
          onChange={(e) => setF({ ...f, rewardValue: e.target.value })}
          placeholder="Valor do desconto"
          type="number"
          value={f.rewardValue}
        />
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={f.active}
          onChange={(e) => setF({ ...f, active: e.target.checked })}
          type="checkbox"
        />
        Ativo
      </label>
      <Button onClick={save}>Salvar cartão de selos</Button>
    </div>
  );
}

function Programs() {
  const company = useCompany();
  const list = usePosQuery(api.loyalty.programs, { company });
  const [edit, setEdit] = useState<Program | "new" | null>(null);
  if (list === undefined) {
    return <Loading />;
  }
  return (
    <div className="space-y-3">
      <Button onClick={() => setEdit("new")} size="sm">
        <Icon className="size-4" name="IconPlusLarge" />
        Novo cartão de selos
      </Button>
      {list?.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {list.map((p) => (
            <button
              className={cn(
                CARD,
                "text-left hover:bg-muted/40",
                !p.active && "opacity-60"
              )}
              key={p.id}
              onClick={() => setEdit(p)}
              type="button"
            >
              <p className="font-medium">{p.name}</p>
              <p className="text-muted-foreground text-xs">
                {p.stamps} selos ·{" "}
                {p.reward === "free"
                  ? "item grátis"
                  : `desconto de ${p.rewardValue}`}{" "}
                · {p.categories.join(", ")}
                {p.active ? "" : " · inativo"}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <p className={cn(CARD, "text-muted-foreground text-sm")}>
          Crie um cartão de selos: por exemplo, a cada 10 cafés o próximo é
          grátis. Os selos entram sozinhos quando o pedido do cliente é pago.
        </p>
      )}
      <Sheet onOpenChange={(o) => !o && setEdit(null)} open={edit !== null}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Cartão de selos</SheetTitle>
          </SheetHeader>
          {edit ? (
            <ProgramForm
              onClose={() => setEdit(null)}
              program={edit === "new" ? null : edit}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function GiftCards() {
  const fmt = useMoney();
  const list = usePosQuery(api.loyalty.giftCards, {});
  if (list === undefined) {
    return <Loading />;
  }
  if (!list?.length) {
    return (
      <p className={cn(CARD, "text-muted-foreground text-sm")}>
        Nenhum gift card ainda. Venda um no fechamento do pedido (Gift card →
        Vender): ele é ativado quando o pedido é pago e vale em todos os bares.
      </p>
    );
  }
  const outstanding = list
    .filter((g) => g.active)
    .reduce((s, g) => s + g.balance, 0);
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Saldo em aberto (dívida com clientes): <b>{fmt(outstanding)}</b>
      </p>
      <div className="divide-y rounded-2xl border">
        {list.map((g) => (
          <div className="flex items-center gap-3 px-3 py-2 text-sm" key={g.id}>
            <span className="font-mono">{g.code}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
              {g.label} · vendido {dateText(g.createdAt)} · {g.history.length}{" "}
              movimentos
            </span>
            <span className="tabular-nums">
              {fmt(g.balance)} / {fmt(g.initial)}
            </span>
            {g.active ? null : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                aguardando pagamento
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- view --------------------------------- */

function Customers() {
  const [q, setQ] = useState("");
  const list = usePosQuery(api.loyalty.searchCustomers, { q });
  const [open, setOpen] = useState<CustomerId | "new" | null>(null);
  const fmt = useMoney();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, telefone, e-mail ou cartão"
          value={q}
        />
        <Button onClick={() => setOpen("new")} size="sm">
          <Icon className="size-4" name="IconPlusLarge" />
          Novo cliente
        </Button>
      </div>
      {list === undefined ? <Loading /> : null}
      {list?.length === 0 ? (
        <p className={cn(CARD, "text-muted-foreground text-sm")}>
          {q
            ? "Ninguém encontrado."
            : "O livro de clientes é compartilhado por todos os bares. Escolha o cliente no pedido (botão Cliente) para somar visitas, gastos e selos."}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(list ?? []).map((c) => (
          <button
            className={cn(CARD, "text-left hover:bg-muted/40")}
            key={c.id}
            onClick={() => setOpen(c.id)}
            type="button"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-medium">{c.name}</p>
              {c.vip ? (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 text-xs">
                  VIP {c.vip}%
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              {c.visits} visitas · {fmt(c.spent)}
              {c.lastVisit ? ` · última ${dateText(c.lastVisit)}` : ""}
            </p>
          </button>
        ))}
      </div>
      <Sheet onOpenChange={(o) => !o && setOpen(null)} open={open !== null}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {open === "new" ? "Novo cliente" : "Cliente"}
            </SheetTitle>
          </SheetHeader>
          {open === "new" ? (
            <div className="p-4">
              <CustomerForm customer={null} onSaved={(id) => setOpen(id)} />
            </div>
          ) : null}
          {open && open !== "new" ? (
            <CustomerDetails
              id={open}
              key={open}
              onClose={() => setOpen(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const SECTIONS = [
  { id: "customers", label: "Clientes" },
  { id: "programs", label: "Cartão de selos" },
  { id: "gifts", label: "Gift cards" },
] as const;

export function CustomersView() {
  const [section, setSection] =
    useState<(typeof SECTIONS)[number]["id"]>("customers");
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
      {section === "customers" ? <Customers /> : null}
      {section === "programs" ? <Programs /> : null}
      {section === "gifts" ? <GiftCards /> : null}
    </div>
  );
}
