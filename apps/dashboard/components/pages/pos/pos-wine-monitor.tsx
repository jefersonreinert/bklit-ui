"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useT } from "@/lib/i18n";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import { money, useCompany, usePos, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";

/**
 * Wine Monitor: a read-only mirror of the By The Glass dispensers' portal
 * (Wine Monitor Online), refreshed every 15 minutes by
 * services/wine-monitor-sync. Machines with the ml left in every bottle,
 * pours, wines, cards and the activity log. Nothing here changes the
 * machines: prices, bottles and cards are still managed in the portal.
 */

type Triple = [number | null, number | null, number | null];

interface Dispenser {
  code: string;
  name: string;
  model?: string;
  positions: number;
  valid: boolean;
  lastSeen?: number;
}

interface Position {
  dispenser: string;
  position: number;
  sku?: string;
  wine?: string;
  variety?: string;
  changedAt?: number;
  calibration?: number;
  residueMl: number;
  prices: Triple;
  doses: Triple;
}

interface Wine {
  valid: boolean;
  name: string;
  sku?: string;
  description?: string;
  vintage?: string;
  producer?: string;
  origin?: string;
  variety?: string;
  title1?: string;
  title2?: string;
  volumeMl?: number;
  lifespanDays?: number;
  doses: Triple;
  minResidueMl?: number;
  prices: Triple;
}

interface Card {
  cardId: string;
  kind: "credit" | "debit";
  valid: boolean;
  branch?: string;
  clientId?: string;
  firstName?: string;
  surname?: string;
  label?: string;
  email?: string;
  discount: number;
  balance: number;
  limit?: number;
  lastAt?: number;
}

type Section = "machines" | "sales" | "wines" | "cards" | "activity";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "machines", label: "Máquinas" },
  { id: "sales", label: "Vendas" },
  { id: "wines", label: "Vinhos" },
  { id: "cards", label: "Cartões" },
  { id: "activity", label: "Atividade" },
];

const CARD = "rounded-2xl border bg-card p-4";
const BOTTLE_ML = 750;
/** A bottle is "running out" below a medium glass plus a small one. */
const LOW_ML = 150;
const STALE_MS = 40 * 60_000;

const n = (v: number) =>
  new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 1 }).format(v);
const dateText = (t: number) =>
  new Date(t).toLocaleString(appLocale(), {
    dateStyle: "short",
    timeStyle: "short",
  });
const ago = (t: number) => {
  const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (min < 1) {
    return "agora";
  }
  if (min < 60) {
    return `há ${min} min`;
  }
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : dateText(t);
};
const startOfDay = (daysAgo = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
};

function useMoney() {
  const { settings } = usePos();
  return (v: number) => money(v, settings.currency);
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
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
      {hint ? (
        <p className="mt-0.5 text-muted-foreground text-xs">{hint}</p>
      ) : null}
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

function Empty({ text }: { text: string }) {
  return (
    <div
      className={cn(CARD, "py-10 text-center text-muted-foreground text-sm")}
    >
      {text}
    </div>
  );
}

function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Icon
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        name="IconMagnifyingGlass"
      />
      <Input
        className="pl-9"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

function Pills<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const tr = useT();
  return (
    <div className="flex w-max gap-1 rounded-full border bg-card p-1">
      {items.map((s) => (
        <button
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors",
            value === s.id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
          key={s.id}
          onClick={() => onChange(s.id)}
          type="button"
        >
          {tr(s.label)}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- machines ------------------------------- */

function useWmState() {
  const company = useCompany();
  return usePosQuery(api.winemonitor.state, { company }) as
    | {
        takenAt: number;
        syncedAt: number;
        node: Record<string, string | undefined> | null;
        dispensers: Dispenser[];
        positions: Position[];
        wines: Wine[];
      }
    | null
    | undefined;
}

function seenText(online: boolean, lastSeen?: number) {
  if (online) {
    return "online";
  }
  return lastSeen ? `visto ${dateText(lastSeen)}` : "sem sinal";
}

function BottleTile({ p, volume }: { p: Position; volume: number }) {
  const pct = Math.max(0, Math.min(1, p.residueMl / volume));
  const low = p.wine && p.residueMl < LOW_ML;
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border p-2.5",
        low && "border-destructive/50 bg-destructive/5"
      )}
      title={p.wine ?? ""}
    >
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="font-medium text-muted-foreground tabular-nums">
          #{p.position}
        </span>
        <span
          className={cn(
            "font-semibold tabular-nums",
            low && "text-destructive"
          )}
        >
          {n(p.residueMl)} ml
        </span>
      </div>
      <p className="line-clamp-2 min-h-[2lh] text-xs leading-tight">
        {p.wine ?? "—"}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            low ? "bg-destructive" : "bg-foreground/70"
          )}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

function Machines() {
  const state = useWmState();
  const company = useCompany();
  const todayFrom = useMemo(() => startOfDay(), []);
  const today = usePosQuery(api.winemonitor.sales, {
    company,
    from: todayFrom,
  });
  const fmt = useMoney();
  const [onlyLow, setOnlyLow] = useState(false);

  if (state === undefined) {
    return <Loading />;
  }
  if (state === null) {
    return (
      <Empty text="Ainda não chegou nenhum dado do Wine Monitor. A sincronização roda a cada 15 minutos." />
    );
  }
  const volumeOf = new Map(
    state.wines.map((w) => [w.sku ?? w.name, w.volumeMl ?? BOTTLE_ML])
  );
  const low = state.positions.filter((p) => p.wine && p.residueMl < LOW_ML);
  const totalMl = state.positions.reduce((s, p) => s + p.residueMl, 0);
  const revenue = (today ?? []).reduce((s, r) => s + r.price, 0);
  const stale = Date.now() - state.takenAt > STALE_MS;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          hint={`${state.positions.length} posições`}
          label="Vinho nas máquinas"
          value={`${n(totalMl / 1000)} L`}
        />
        <Tile
          hint={`abaixo de ${LOW_ML} ml`}
          label="Garrafas acabando"
          tone={low.length ? "warn" : undefined}
          value={String(low.length)}
        />
        <Tile
          hint={`${today?.length ?? 0} doses`}
          label="Vendas hoje"
          value={today === undefined ? "…" : fmt(revenue)}
        />
        <Tile
          hint={dateText(state.takenAt)}
          label="Sincronizado"
          tone={stale ? "warn" : undefined}
          value={ago(state.takenAt)}
        />
      </div>

      <label className="flex w-max items-center gap-2 text-sm">
        <input
          checked={onlyLow}
          onChange={(e) => setOnlyLow(e.target.checked)}
          type="checkbox"
        />
        Mostrar só garrafas acabando
      </label>

      {state.dispensers.map((d) => {
        const ps = state.positions
          .filter((p) => p.dispenser === d.name)
          .filter((p) => !onlyLow || (p.wine && p.residueMl < LOW_ML))
          .sort((a, b) => a.position - b.position);
        if (onlyLow && !ps.length) {
          return null;
        }
        const online =
          d.lastSeen !== undefined && state.takenAt - d.lastSeen < 15 * 60_000;
        return (
          <section className={CARD} key={d.code}>
            <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Icon className="size-4" name="IconBottle" />
              <h3 className="font-semibold">{d.name}</h3>
              <span className="text-muted-foreground text-xs">
                {d.model} · {d.positions} posições · nº {d.code}
              </span>
              <span
                className={cn(
                  "ml-auto flex items-center gap-1.5 text-xs",
                  online ? "text-emerald-600" : "text-destructive"
                )}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    online ? "bg-emerald-500" : "bg-destructive"
                  )}
                />
                {seenText(online, d.lastSeen)}
              </span>
            </header>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {ps.map((p) => (
                <BottleTile
                  key={`${p.dispenser}-${p.position}`}
                  p={p}
                  volume={volumeOf.get(p.sku ?? p.wine ?? "") ?? BOTTLE_ML}
                />
              ))}
            </div>
          </section>
        );
      })}

      {state.node ? (
        <p className="text-muted-foreground text-xs">
          Central Wine Monitor: {state.node.version} · CPU {state.node.cpu} ·
          RAM {state.node.ram} · disco {state.node.hdd}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------- sales -------------------------------- */

type Range = "today" | "yesterday" | "7d" | "30d";
const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
];

function rangeOf(r: Range): { from: number; to?: number } {
  if (r === "today") {
    return { from: startOfDay() };
  }
  if (r === "yesterday") {
    return { from: startOfDay(1), to: startOfDay() };
  }
  return { from: startOfDay(r === "7d" ? 6 : 29) };
}

function Sales() {
  const company = useCompany();
  const fmt = useMoney();
  const [range, setRange] = useState<Range>("today");
  const [view, setView] = useState<"wines" | "machines" | "pours">("wines");
  const args = useMemo(() => rangeOf(range), [range]);
  const rows = usePosQuery(api.winemonitor.sales, { company, ...args });

  const byWine = useMemo(() => {
    const m = new Map<
      string,
      {
        wine: string;
        sku?: string;
        doses: Map<number, number>;
        ml: number;
        total: number;
      }
    >();
    for (const r of rows ?? []) {
      const k = r.sku ?? r.wine;
      const e = m.get(k) ?? {
        wine: r.wine,
        sku: r.sku,
        doses: new Map(),
        ml: 0,
        total: 0,
      };
      e.doses.set(r.ml, (e.doses.get(r.ml) ?? 0) + 1);
      e.ml += r.ml;
      e.total += r.price;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const byMachine = useMemo(() => {
    const m = new Map<string, { pours: number; ml: number; total: number }>();
    for (const r of rows ?? []) {
      const e = m.get(r.dispenser) ?? { pours: 0, ml: 0, total: 0 };
      e.pours++;
      e.ml += r.ml;
      e.total += r.price;
      m.set(r.dispenser, e);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  const total = (rows ?? []).reduce((s, r) => s + r.price, 0);
  const ml = (rows ?? []).reduce((s, r) => s + r.ml, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pills items={RANGES} onChange={setRange} value={range} />
        <Pills
          items={[
            { id: "wines", label: "Por vinho" },
            { id: "machines", label: "Por máquina" },
            { id: "pours", label: "Doses" },
          ]}
          onChange={setView}
          value={view}
        />
      </div>
      {rows === undefined ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Faturamento" value={fmt(total)} />
            <Tile label="Doses" value={String(rows?.length ?? 0)} />
            <Tile label="Vinho servido" value={`${n(ml / 1000)} L`} />
            <Tile
              label="Ticket médio por dose"
              value={rows?.length ? fmt(total / rows.length) : "—"}
            />
          </div>
          {rows?.length ? null : (
            <Empty text="Nenhuma dose neste período. O histórico começa a ser guardado a partir da primeira sincronização." />
          )}
          {rows?.length && view === "wines" ? (
            <div className={cn(CARD, "overflow-x-auto p-0")}>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr className="border-b text-left">
                    <th className="px-4 py-2 font-medium">Vinho</th>
                    <th className="px-2 py-2 font-medium">Doses</th>
                    <th className="px-2 py-2 text-right font-medium">ml</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byWine.map((w) => (
                    <tr
                      className="border-b last:border-0"
                      key={w.sku ?? w.wine}
                    >
                      <td className="px-4 py-2">
                        {w.wine}
                        {w.sku ? (
                          <span className="ml-1 text-muted-foreground text-xs">
                            #{w.sku}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground text-xs">
                        {[...w.doses.entries()]
                          .sort((a, b) => a[0] - b[0])
                          .map(([d, c]) => `${c}× ${d} ml`)
                          .join(" · ")}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {n(w.ml)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {fmt(w.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {rows?.length && view === "machines" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {byMachine.map(([name, e]) => (
                <div className={CARD} key={name}>
                  <p className="font-semibold">{name}</p>
                  <p className="mt-1 font-semibold text-xl tabular-nums">
                    {fmt(e.total)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {e.pours} doses · {n(e.ml / 1000)} L
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {rows?.length && view === "pours" ? (
            <div className={cn(CARD, "overflow-x-auto p-0")}>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr className="border-b text-left">
                    <th className="px-4 py-2 font-medium">Quando</th>
                    <th className="px-2 py-2 font-medium">Vinho</th>
                    <th className="px-2 py-2 font-medium">Máquina</th>
                    <th className="px-2 py-2 font-medium">Cartão</th>
                    <th className="px-2 py-2 text-right font-medium">ml</th>
                    <th className="px-4 py-2 text-right font-medium">Preço</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((r, i) => (
                    <tr
                      className="border-b last:border-0"
                      key={`${r.at}-${r.dispenser}-${i}`}
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                        {dateText(r.at)}
                      </td>
                      <td className="px-2 py-2">{r.wine}</td>
                      <td className="whitespace-nowrap px-2 py-2">
                        {r.dispenser}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {r.cardId ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.ml}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmt(r.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* --------------------------------- wines -------------------------------- */

function Wines() {
  const state = useWmState();
  const fmt = useMoney();
  const [q, setQ] = useState("");
  if (state === undefined) {
    return <Loading />;
  }
  if (state === null) {
    return <Empty text="Ainda não chegou nenhum dado do Wine Monitor." />;
  }
  const where = new Map<string, Position[]>();
  for (const p of state.positions) {
    const k = p.sku ?? p.wine ?? "";
    where.set(k, [...(where.get(k) ?? []), p]);
  }
  const s = q.trim().toLowerCase();
  const list = state.wines
    .filter((w) =>
      s
        ? [w.name, w.sku, w.producer, w.origin, w.variety, w.description]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(s)
        : true
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const loaded = state.wines.filter((w) => where.has(w.sku ?? w.name)).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Vinhos cadastrados" value={String(state.wines.length)} />
        <Tile label="Nas máquinas agora" value={String(loaded)} />
      </div>
      <Search
        onChange={setQ}
        placeholder="Buscar vinho, produtor, país, uva…"
        value={q}
      />
      <div className={cn(CARD, "overflow-x-auto p-0")}>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-b text-left">
              <th className="px-4 py-2 font-medium">Vinho</th>
              <th className="px-2 py-2 font-medium">Origem</th>
              <th className="px-2 py-2 text-right font-medium">
                Doses e preços
              </th>
              <th className="px-4 py-2 font-medium">Na máquina</th>
            </tr>
          </thead>
          <tbody>
            {list.map((w) => {
              const at = where.get(w.sku ?? w.name) ?? [];
              return (
                <tr
                  className={cn(
                    "border-b last:border-0",
                    !w.valid && "opacity-50"
                  )}
                  key={`${w.sku}-${w.name}`}
                >
                  <td className="px-4 py-2">
                    <p className="font-medium">{w.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        w.sku ? `#${w.sku}` : null,
                        w.variety ?? w.description,
                        w.vintage,
                        w.producer,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {w.origin ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums">
                    {[0, 1, 2]
                      .filter((i) => w.doses[i] && w.prices[i])
                      .map((i) => `${w.doses[i]} ml ${fmt(w.prices[i] ?? 0)}`)
                      .join(" · ")}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {at.length
                      ? at.map((p) => (
                          <span
                            className={cn(
                              "mr-1 inline-block whitespace-nowrap rounded-full border px-2 py-0.5",
                              p.residueMl < LOW_ML &&
                                "border-destructive/50 text-destructive"
                            )}
                            key={`${p.dispenser}-${p.position}`}
                          >
                            {p.dispenser} #{p.position} · {p.residueMl} ml
                          </span>
                        ))
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------- cards -------------------------------- */

type CardFilter = "all" | "credit" | "debit" | "balance";

function matchesKind(c: Card, kind: CardFilter) {
  if (kind === "all") {
    return true;
  }
  if (kind === "balance") {
    return c.balance !== 0;
  }
  return c.kind === kind;
}

function Cards() {
  const company = useCompany();
  const data = usePosQuery(api.winemonitor.cards, { company }) as
    | { updatedAt: number; cards: Card[] }
    | null
    | undefined;
  const fmt = useMoney();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CardFilter>("balance");
  if (data === undefined) {
    return <Loading />;
  }
  if (data === null) {
    return <Empty text="Ainda não chegou nenhum dado do Wine Monitor." />;
  }
  const credit = data.cards.filter((c) => c.kind === "credit");
  const debit = data.cards.filter((c) => c.kind === "debit");
  const prepaid = credit.reduce((s, c) => s + c.balance, 0);
  const s = q.trim().toLowerCase();
  const list = data.cards
    .filter((c) => matchesKind(c, kind))
    .filter((c) =>
      s
        ? [c.cardId, c.clientId, c.firstName, c.surname, c.email, c.label]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(s)
        : true
    )
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          hint={`${credit.filter((c) => c.balance > 0).length} com saldo`}
          label="Cartões pré-pagos"
          value={String(credit.length)}
        />
        <Tile
          hint="dinheiro já recebido, ainda não consumido"
          label="Saldo em cartões"
          value={fmt(prepaid)}
        />
        <Tile
          hint="conta aberta com limite"
          label="Cartões de débito"
          value={String(debit.length)}
        />
        <Tile
          hint={dateText(data.updatedAt)}
          label="Atualizado"
          value={ago(data.updatedAt)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Pills
          items={[
            { id: "balance", label: "Com saldo" },
            { id: "credit", label: "Pré-pagos" },
            { id: "debit", label: "Débito" },
            { id: "all", label: "Todos" },
          ]}
          onChange={setKind}
          value={kind}
        />
        <div className="min-w-56 flex-1">
          <Search
            onChange={setQ}
            placeholder="Buscar nº do cartão, cliente, mesa…"
            value={q}
          />
        </div>
      </div>
      <div className={cn(CARD, "overflow-x-auto p-0")}>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-b text-left">
              <th className="px-4 py-2 font-medium">Cartão</th>
              <th className="px-2 py-2 font-medium">Tipo</th>
              <th className="px-2 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 400).map((c) => (
              <tr
                className={cn(
                  "border-b last:border-0",
                  !c.valid && "opacity-50"
                )}
                key={c.cardId}
              >
                <td className="px-4 py-2 font-mono text-xs">
                  {c.cardId}
                  {c.label ? (
                    <span className="ml-2 rounded-full border px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
                      {c.label}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  {c.kind === "debit" ? "Débito" : "Pré-pago"}
                  {c.discount ? ` · ${c.discount}% desc.` : ""}
                </td>
                <td className="px-2 py-2">
                  {[c.firstName, c.surname].filter(Boolean).join(" ") ||
                    c.clientId ||
                    "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <span className="font-medium">{fmt(c.balance)}</span>
                  {c.limit ? (
                    <span className="block text-muted-foreground text-xs">
                      limite {fmt(c.limit)}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > 400 ? (
          <p className="px-4 py-2 text-muted-foreground text-xs">
            Mostrando 400 de {list.length}. Use a busca para achar um cartão.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------- activity ------------------------------ */

function Activity() {
  const company = useCompany();
  const data = usePosQuery(api.winemonitor.activity, { company });
  const fmt = useMoney();
  if (data === undefined) {
    return <Loading />;
  }
  if (!data) {
    return <Empty text="Ainda não chegou nenhum dado do Wine Monitor." />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={cn(CARD, "p-0")}>
        <h3 className="border-b px-4 py-3 font-semibold">
          Recargas e acertos de cartão
        </h3>
        {data.credits.length ? (
          <ul className="divide-y text-sm">
            {data.credits.map((c) => (
              <li className="flex items-center gap-3 px-4 py-2" key={c.record}>
                <Icon
                  className="size-4 shrink-0 text-muted-foreground"
                  name="IconCreditCard1"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs">{c.cardId ?? "—"}</p>
                  <p className="text-muted-foreground text-xs">
                    {dateText(c.at)}
                    {c.source ? ` · ${c.source}` : ""} · {fmt(c.oldValue)} →{" "}
                    {fmt(c.newValue)}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    c.diff >= 0 ? "text-emerald-600" : "text-destructive"
                  )}
                >
                  {c.diff >= 0 ? "+" : ""}
                  {fmt(c.diff)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-muted-foreground text-sm">
            Nada ainda.
          </p>
        )}
      </section>
      <section className={cn(CARD, "p-0")}>
        <h3 className="border-b px-4 py-3 font-semibold">
          Trocas e ajustes de garrafa
        </h3>
        {data.changes.length ? (
          <ul className="divide-y text-sm">
            {data.changes.map((c) => (
              <li
                className="flex items-center gap-3 px-4 py-2"
                key={`${c.kind}-${c.dispenser}-${c.position}-${c.at}`}
              >
                <Icon
                  className="size-4 shrink-0 text-muted-foreground"
                  name={c.kind === "change" ? "IconBottle" : "IconDrop"}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{c.wine}</p>
                  <p className="text-muted-foreground text-xs">
                    {dateText(c.at)} · {c.dispenser} #{c.position} ·{" "}
                    {c.kind === "change" ? "garrafa trocada" : "ajuste"}
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs tabular-nums">
                  {c.oldMl} → {c.newMl} ml
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-muted-foreground text-sm">
            Nada ainda.
          </p>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------- view -------------------------------- */

export function WineMonitorView() {
  const [section, setSection] = useState<Section>("machines");
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto">
          <Pills items={SECTIONS} onChange={setSection} value={section} />
        </div>
        <p className="text-muted-foreground text-xs">
          Espelho do Wine Monitor (By The Glass), atualizado a cada 15 min ·
          somente leitura
        </p>
      </div>
      {section === "machines" ? <Machines /> : null}
      {section === "sales" ? <Sales /> : null}
      {section === "wines" ? <Wines /> : null}
      {section === "cards" ? <Cards /> : null}
      {section === "activity" ? <Activity /> : null}
    </div>
  );
}
