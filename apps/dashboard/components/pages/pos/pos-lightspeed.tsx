"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { appLocale } from "@/lib/i18n/locale";
import { Icon } from "@/lib/icons";
import { fold } from "@/lib/pos/categories";
import { money, sendPos, useCompany, usePos, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";
import { useCan } from "./pos-auth";

/**
 * POS "Lightspeed" mode: the same app reading the business's Lightspeed
 * K-Series POS (synced every 10 minutes): today's sales, receipts, open
 * checks on the floor plan and the menu. Read-only; the menu and tables
 * can be copied into the independent system.
 */

export type PosMode = "own" | "lightspeed";

const MODE_KEY = "casa.pos.mode";
const listeners = new Set<() => void>();

function readMode(company: string): PosMode {
  try {
    const all = JSON.parse(localStorage.getItem(MODE_KEY) ?? "{}") as Record<string, PosMode>;
    return all[company] === "lightspeed" ? "lightspeed" : "own";
  } catch {
    return "own";
  }
}

export function setPosMode(company: string, mode: PosMode) {
  try {
    const all = JSON.parse(localStorage.getItem(MODE_KEY) ?? "{}") as Record<string, PosMode>;
    all[company] = mode;
    localStorage.setItem(MODE_KEY, JSON.stringify(all));
  } catch {
    // private mode: only this visit
  }
  for (const l of listeners) {
    l();
  }
}

export function usePosMode(company: string): PosMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => readMode(company),
    () => "own"
  );
}

/** The Lightspeed location linked to the open business (null = none). */
export function useLightspeedLink() {
  const company = useCompany();
  return usePosQuery(api.lightspeed.link, { company });
}

export function ModeSwitch() {
  const company = useCompany();
  const link = useLightspeedLink();
  const mode = usePosMode(company);
  if (!link) {
    return null;
  }
  const item = (m: PosMode, label: string) => (
    <button
      aria-pressed={mode === m}
      className={cn(
        "rounded-full px-3 py-1 text-xs transition-colors",
        mode === m ? "bg-foreground text-background" : "text-muted-foreground"
      )}
      onClick={() => setPosMode(company, m)}
      type="button"
    >
      {label}
    </button>
  );
  return (
    <div aria-label="Modo do POS" className="flex shrink-0 rounded-full border bg-card p-0.5" role="group">
      {item("own", "Independente")}
      {item("lightspeed", "Lightspeed")}
    </div>
  );
}

const ago = (t: number | null) => {
  if (!t) {
    return "ainda não sincronizado";
  }
  const min = Math.round((Date.now() - t) / 60_000);
  return min < 1 ? "agora" : min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
};

type Tab = "today" | "receipts" | "tables" | "menu" | "import";

const TABS: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { id: "today", label: "Vendas", icon: "IconChart1" },
  { id: "receipts", label: "Recibos", icon: "IconReceiptBill" },
  { id: "tables", label: "Mesas", icon: "IconTable" },
  { id: "menu", label: "Cardápio", icon: "IconTag" },
  { id: "import", label: "Importar", icon: "IconArrowInbox" },
];

export function LightspeedApp() {
  const link = useLightspeedLink();
  const [tab, setTab] = useState<Tab>("today");
  if (!link) {
    return null;
  }
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-8">
      <div className="flex items-start gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/5 px-3 py-2.5 text-sm">
        <Icon className="mt-0.5 size-4 shrink-0 text-sky-600" name="IconChainLink1" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            Lightspeed · {link.name}
            <span className="font-normal text-muted-foreground"> ({link.businessName})</span>
          </p>
          <p className="text-muted-foreground text-xs">
            Somente leitura · vendas {ago(link.salesAt)} · contas abertas {ago(link.checksAt)}
          </p>
          {link.error ? <p className="text-destructive text-xs">{link.error}</p> : null}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto rounded-full border bg-card p-1 [scrollbar-width:none]">
        {TABS.map((t) => (
          <button
            aria-pressed={tab === t.id}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
              tab === t.id ? "bg-foreground text-background" : "text-muted-foreground"
            )}
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            <Icon className="size-4" name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "today" ? <Sales /> : null}
      {tab === "receipts" ? <Receipts /> : null}
      {tab === "tables" ? <Tables /> : null}
      {tab === "menu" ? <Menu /> : null}
      {tab === "import" ? <Import /> : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-semibold text-lg tabular-nums">{value}</span>
    </div>
  );
}

const PERIODS = [
  { id: "today", label: "Hoje", days: 0 },
  { id: "7d", label: "7 dias", days: 6 },
  { id: "30d", label: "30 dias", days: 29 },
] as const;

function Sales() {
  const company = useCompany();
  const cur = usePos().settings.currency;
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("today");
  const range = useMemo(() => {
    const p = PERIODS.find((x) => x.id === period) ?? PERIODS[0];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - p.days);
    // Rounded to the minute so the query is not re-sent every render
    return { from: start.getTime(), to: Math.ceil(Date.now() / 60_000) * 60_000 + 86_400_000 };
  }, [period]);
  const ov = usePosQuery(api.lightspeed.overview, { company, ...range });
  const offset = -new Date().getTimezoneOffset() / 60;
  const hours = ov
    ? ov.hoursUtc.map((_, h) => ov.hoursUtc[(((h - offset) % 24) + 24) % 24] ?? 0)
    : [];
  const peak = Math.max(1, ...hours);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            aria-pressed={period === p.id}
            className={cn("h-9 rounded-full px-3.5 text-sm", period === p.id ? "bg-foreground text-background" : "bg-muted")}
            key={p.id}
            onClick={() => setPeriod(p.id)}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>
      {ov === undefined ? <p className="text-muted-foreground text-sm">Carregando…</p> : null}
      {ov ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Vendas" value={money(ov.total, cur)} />
            <Tile label="Recibos" value={String(ov.receipts)} />
            <Tile label="Ticket médio" value={money(ov.average, cur)} />
            <Tile label="Gorjetas" value={money(ov.tips, cur)} />
          </div>
          <section className="rounded-2xl border bg-card p-3">
            <h3 className="mb-2 font-semibold text-sm">Vendas por hora</h3>
            <div aria-hidden className="flex h-24 items-end gap-0.5">
              {hours.map((v, h) => (
                <div className="flex flex-1 flex-col items-center gap-1" key={h} title={`${h}h: ${money(v, cur)}`}>
                  <div className="w-full rounded-t bg-primary/70" style={{ height: `${(v / peak) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0h</span>
              <span>6h</span>
              <span>12h</span>
              <span>18h</span>
              <span>23h</span>
            </div>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <List rows={ov.payments.map((p) => [p.name, money(p.amount, cur)])} title="Pagamentos" />
            <List rows={ov.groups.map((g) => [g.name, money(g.amount, cur)])} title="Grupos" />
          </div>
          <List
            rows={ov.top.map((i) => [`${i.name} × ${Math.round(i.qty * 100) / 100}`, money(i.total, cur)])}
            title="Mais vendidos"
          />
        </>
      ) : null}
    </div>
  );
}

function List({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
      {rows.length ? (
        <ul className="divide-y rounded-2xl border bg-card text-sm">
          {rows.map(([a, b]) => (
            <li className="flex items-center justify-between gap-3 px-3 py-2" key={a}>
              <span className="min-w-0 truncate">{a}</span>
              <span className="shrink-0 tabular-nums">{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Sem dados no período.</p>
      )}
    </section>
  );
}

function Receipts() {
  const company = useCompany();
  const cur = usePos().settings.currency;
  const [before, setBefore] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const list = usePosQuery(api.lightspeed.receipts, { company, before, limit: 50 });
  if (list === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (!list?.length) {
    return <p className="py-8 text-center text-muted-foreground text-sm">Nenhum recibo sincronizado.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-2xl border bg-card">
        {list.map((r) => (
          <li key={r.receiptId}>
            <button
              aria-expanded={open === r.receiptId}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
              onClick={() => setOpen(open === r.receiptId ? null : r.receiptId)}
              type="button"
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", r.cancelled && "line-through")}>
                  {r.table ? `Mesa ${r.table}` : "Balcão"} · {r.staff || "—"}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {new Date(r.closedAt).toLocaleString(appLocale(), { dateStyle: "short", timeStyle: "short" })} ·{" "}
                  {r.payments.map((p) => p.name).join(", ") || "—"}
                </span>
              </span>
              <span className="tabular-nums">{money(r.total, cur)}</span>
            </button>
            {open === r.receiptId ? (
              <ul className="border-t bg-muted/30 px-4 py-2 text-sm">
                {r.lines.map((l, i) => (
                  <li className="flex justify-between gap-3 py-0.5" key={`${l.sku}-${i}`}>
                    <span className="truncate">
                      {Math.round(l.qty * 100) / 100} × {l.name}
                    </span>
                    <span className="tabular-nums">{money(l.total, cur)}</span>
                  </li>
                ))}
                {r.tips ? (
                  <li className="flex justify-between py-0.5 text-muted-foreground">
                    <span>Gorjeta</span>
                    <span className="tabular-nums">{money(r.tips, cur)}</span>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {list.length === 50 ? (
        <Button onClick={() => setBefore(list.at(-1)?.closedAt)} variant="outline">
          Mais antigos
        </Button>
      ) : null}
      {before ? (
        <Button onClick={() => setBefore(undefined)} variant="ghost">
          Voltar aos mais recentes
        </Button>
      ) : null}
    </div>
  );
}

function Tables() {
  const company = useCompany();
  const cur = usePos().settings.currency;
  const data = usePosQuery(api.lightspeed.floor, { company });
  if (data === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (!data) {
    return null;
  }
  const byTable = new Map(data.checks.filter((c) => c.table !== null).map((c) => [c.table, c]));
  const loose = data.checks.filter((c) => c.table === null);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        {data.checks.length} contas abertas · total{" "}
        {money(data.checks.reduce((a, c) => a + c.total - c.paid, 0), cur)}
      </p>
      {data.floors.map((f) => (
        <section className="flex flex-col gap-2" key={f.id}>
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{f.name}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {f.tables.map((t) => {
              const c = byTable.get(t.number);
              return (
                <div
                  className={cn(
                    "flex min-h-20 flex-col justify-between rounded-2xl border p-2",
                    c ? "border-primary/40 bg-primary/10" : "bg-card"
                  )}
                  key={t.id}
                >
                  <span className="flex items-center justify-between font-semibold text-sm">
                    {t.number || t.name}
                    <span className="font-normal text-muted-foreground text-xs">{t.seats}p</span>
                  </span>
                  {c ? (
                    <span className="text-xs">
                      <b className="tabular-nums">{money(c.total - c.paid, cur)}</b>
                      <span className="block truncate text-muted-foreground">
                        {c.staff} · {c.covers || "?"} pax
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">livre</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {loose.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Sem mesa</h3>
          <ul className="divide-y rounded-2xl border bg-card text-sm">
            {loose.map((c) => (
              <li className="flex justify-between gap-3 px-3 py-2" key={c.id}>
                <span className="truncate">#{c.number} {c.name}</span>
                <span className="tabular-nums">{money(c.total - c.paid, cur)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.floors.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">Nenhuma planta sincronizada.</p>
      ) : null}
    </div>
  );
}

function Menu() {
  const company = useCompany();
  const cur = usePos().settings.currency;
  const items = usePosQuery(api.lightspeed.menu, { company });
  const [q, setQ] = useState("");
  if (items === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (!items?.length) {
    return <p className="py-8 text-center text-muted-foreground text-sm">Cardápio ainda não sincronizado.</p>;
  }
  const f = fold(q.trim());
  const shown = items.filter((i) => !f || fold(`${i.name} ${i.sku} ${i.group} ${i.subgroup ?? ""}`).includes(f));
  const groups = [...new Set(shown.map((i) => i.group))];
  return (
    <div className="flex flex-col gap-4">
      <Input
        aria-label="Buscar no cardápio do Lightspeed"
        className="h-11 text-base sm:text-sm"
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Buscar em ${items.length} itens…`}
        type="search"
        value={q}
      />
      {groups.map((g) => (
        <section className="flex flex-col gap-2" key={g}>
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{g}</h3>
          <ul className="divide-y rounded-2xl border bg-card text-sm">
            {shown
              .filter((i) => i.group === g)
              .map((i) => (
                <li className="flex items-center justify-between gap-3 px-3 py-2" key={i._id}>
                  <span className="min-w-0">
                    <span className="block truncate">{i.name}</span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {[i.subgroup, i.sku && `SKU ${i.sku}`, i.modifierGroups ? `${i.modifierGroups} opções` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{money(i.price, cur)}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Import() {
  const company = useCompany();
  const can = useCan();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "menu" | "floor">(null);
  const run = async (kind: "menu" | "floor") => {
    setBusy(kind);
    setMsg(null);
    const res =
      kind === "menu"
        ? await sendPos(api.lightspeed.importMenu, { company })
        : await sendPos(api.lightspeed.importFloor, { company });
    setBusy(null);
    if (res && "created" in res) {
      setMsg(`Cardápio copiado: ${res.created} itens novos, ${res.updated} atualizados.`);
    } else if (res && "added" in res) {
      setMsg(`Mesas copiadas: ${res.floors} plantas, ${res.added} mesas novas (áreas “LS · …”).`);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Copia dados do Lightspeed para o seu sistema independente deste bar. Nada é
        apagado: itens com o mesmo SKU (ou nome) têm preço e categoria atualizados,
        mantendo estoque e custo; mesas entram em áreas “LS · …” e as que já
        existem não mudam de lugar.
      </p>
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
        <p className="font-medium text-sm">Cardápio → Itens</p>
        <p className="text-muted-foreground text-xs">Telas viram categorias e sub-telas viram subcategorias.</p>
        <Button disabled={busy !== null || !can(["products"])} onClick={() => run("menu")}>
          {busy === "menu" ? "Copiando…" : "Copiar cardápio"}
        </Button>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
        <p className="font-medium text-sm">Plantas → Mesas (POS e Reservas)</p>
        <p className="text-muted-foreground text-xs">A API não informa a posição das mesas: elas entram em grade, e você ajusta no editor.</p>
        <Button disabled={busy !== null || !can(["tables"])} onClick={() => run("floor")} variant="outline">
          {busy === "floor" ? "Copiando…" : "Copiar mesas"}
        </Button>
      </div>
      {msg ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
