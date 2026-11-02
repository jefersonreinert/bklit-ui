"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelUnlock } from "@/components/dashboard/panel-unlock";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { appLocale } from "@/lib/i18n/locale";
import { modelResolver, type TimeZoneId } from "@/lib/journal/analytics";
import {
  buildTrades,
  computeStats,
  type Stats,
  type Trade,
} from "@/lib/journal/metrics";
import type { NoteOptions } from "@/lib/journal/note-fields";
import { cn } from "@/lib/utils";
import { Notice, TelegramProvider } from "../../telegram/telegram-shared";
import { JournalAccount } from "./journal-account";
import { JournalBreakdown, type NoteRow } from "./journal-breakdown";
import { JournalConnector } from "./journal-connector";
import { JournalData, JournalDemoNotice } from "./journal-data";
import { JournalDistribution } from "./journal-distribution";
import { Segmented } from "./journal-kit";
import { JournalPerformance } from "./journal-performance";
import { JournalPeriods } from "./journal-periods";
import { JournalSummary, money, tone } from "./journal-summary";
import { JournalTime } from "./journal-time";
import { JournalTrades, type SignalRow } from "./journal-trades";

/**
 * Trading journal inside Gráficos: MT5 operations sent by the EA,
 * TradingView alerts, metrics, notes, and the connector setup.
 */

export type JournalTab =
  | "summary"
  | "performance"
  | "periods"
  | "breakdown"
  | "time"
  | "distribution"
  | "trades"
  | "signals"
  | "connector";
type Tab = JournalTab;
type Period = "7" | "30" | "90" | "ytd" | "all";

const DAY = 86_400_000;
/** Account filter value that adds up every account. */
const ALL_ACCOUNTS = "*";
const PERIODS: { id: Period; label: string }[] = [
  { id: "7", label: "7 d" },
  { id: "30", label: "30 d" },
  { id: "90", label: "90 d" },
  { id: "ytd", label: "Ano" },
  { id: "all", label: "Tudo" },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Resumo" },
  { id: "performance", label: "Desempenho" },
  { id: "periods", label: "Períodos" },
  { id: "breakdown", label: "Ativos e modelos" },
  { id: "time", label: "Horários" },
  { id: "distribution", label: "Distribuição" },
  { id: "trades", label: "Operações" },
  { id: "signals", label: "Sinais TV" },
  { id: "connector", label: "Conector" },
];

/** Tabs that read the filtered trades. */
const FILTERED = new Set<Tab>([
  "summary",
  "performance",
  "periods",
  "breakdown",
  "time",
  "distribution",
  "trades",
]);

/** Tabs whose buckets depend on the clock. */
const ZONED = new Set<Tab>(["performance", "periods", "time"]);

const ZONES: { id: TimeZoneId; label: string }[] = [
  { id: "local", label: "Local" },
  { id: "America/New_York", label: "Nova York" },
  { id: "UTC", label: "UTC" },
];

function since(p: Period) {
  if (p === "all") {
    return 0;
  }
  if (p === "ytd") {
    return new Date(new Date().getFullYear(), 0, 1).getTime();
  }
  return Date.now() - Number(p) * DAY;
}

function Signals({ signals }: { signals: SignalRow[] }) {
  const remove = useMutation(api.journal.deleteSignal);
  if (signals.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        Nenhum alerta recebido. Configure o webhook do TradingView na aba
        Conector.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl border text-sm">
      {signals.map((s) => (
        <li
          className="flex flex-wrap items-baseline gap-x-2 px-3 py-2"
          key={s.id}
        >
          <span className="font-semibold">{s.ticker || "—"}</span>
          <span
            className={cn(
              "font-medium text-xs uppercase",
              s.action.includes("buy") || s.action.includes("long")
                ? "text-[var(--up)]"
                : "text-[var(--down)]"
            )}
          >
            {s.action || "alerta"}
          </span>
          {s.price ? <span className="tabular-nums">@ {s.price}</span> : null}
          {s.qty ? (
            <span className="text-muted-foreground text-xs">× {s.qty}</span>
          ) : null}
          {s.interval ? (
            <span className="text-muted-foreground text-xs">{s.interval}</span>
          ) : null}
          <span className="ml-auto text-muted-foreground text-xs">
            {new Date(s.receivedAt).toLocaleString(appLocale(), {
              dateStyle: "short",
              timeStyle: "medium",
            })}
          </span>
          <button
            aria-label="Apagar alerta"
            className="text-muted-foreground text-xs hover:text-foreground"
            onClick={() => remove({ id: s.id })}
            type="button"
          >
            ✕
          </button>
          {s.strategy || s.message ? (
            <span className="w-full break-words text-muted-foreground text-xs">
              {[s.strategy, s.message].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Filters({
  period,
  onPeriod,
  accounts,
  account,
  onAccount,
  symbols,
  symbol,
  onSymbol,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  accounts: { login: string; label: string }[];
  account: string;
  onAccount: (a: string) => void;
  symbols: string[];
  symbol: string;
  onSymbol: (s: string) => void;
}) {
  const select = "h-8 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border p-0.5">
        {PERIODS.map((p) => (
          <button
            className={cn(
              "rounded-md px-2.5 py-1 text-xs",
              period === p.id && "bg-muted font-semibold"
            )}
            key={p.id}
            onClick={() => onPeriod(p.id)}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>
      {accounts.length > 1 ? (
        <select
          aria-label="Conta"
          className={select}
          onChange={(e) => onAccount(e.target.value)}
          value={account}
        >
          {accounts.map((a) => (
            <option key={a.login} value={a.login}>
              {a.label}
            </option>
          ))}
          <option value={ALL_ACCOUNTS}>Todas as contas (somadas)</option>
        </select>
      ) : null}
      <select
        aria-label="Ativo"
        className={select}
        onChange={(e) => onSymbol(e.target.value)}
        value={symbol}
      >
        <option value="">Todos os ativos</option>
        {symbols.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

function Analysis({
  tab,
  trades,
  stats,
  open,
  tz,
  modelOf,
  tags,
  account,
  accountTrades,
  notes,
  options,
}: {
  tab: Tab;
  trades: Trade[];
  /** Every trade of the chosen account, any period (balance curve). */
  accountTrades: Trade[];
  stats: Stats;
  open: number;
  tz: TimeZoneId;
  modelOf: (t: Trade) => string;
  tags: Map<string, string[]>;
  account: string;
  notes: NoteRow[];
  options: NoteOptions;
}) {
  switch (tab) {
    case "summary":
      return (
        <>
          <JournalAccount account={account} trades={accountTrades} />
          <JournalSummary currency="" open={open} stats={stats} />
        </>
      );
    case "performance":
      return <JournalPerformance trades={trades} tz={tz} />;
    case "periods":
      return <JournalPeriods trades={trades} tz={tz} />;
    case "breakdown":
      return (
        <JournalBreakdown
          modelOf={modelOf}
          notes={notes}
          options={options}
          tags={tags}
          trades={trades}
        />
      );
    case "time":
      return <JournalTime modelOf={modelOf} trades={trades} tz={tz} />;
    case "distribution":
      return <JournalDistribution stats={stats} trades={trades} />;
    default:
      return null;
  }
}

type KnownAccounts = FunctionReturnType<typeof api.journal.accounts>;

/**
 * The account filter: accounts the EA reported (most recently active
 * first) plus any other found in the deals, fictitious data of older
 * versions last. One real account at a time, never mixed by default: the
 * chosen one, else the one the EA sent data for most recently.
 */
function useAccountChoice(
  known: KnownAccounts | undefined,
  allTrades: Trade[],
  account: string
) {
  const accounts = useMemo(() => {
    const list = (known ?? []).map((a) => ({
      login: a.login,
      label: a.demo
        ? `${a.login} · fictícia`
        : [a.login, a.server].filter(Boolean).join(" · "),
      demo: a.demo,
    }));
    for (const login of new Set(allTrades.map((t) => t.account))) {
      if (!list.some((a) => a.login === login)) {
        list.push({ login, label: login, demo: login === "DEMO" });
      }
    }
    return [...list.filter((a) => !a.demo), ...list.filter((a) => a.demo)];
  }, [known, allTrades]);
  const selected = account || accounts.find((a) => !a.demo)?.login || "";
  const all = selected === ALL_ACCOUNTS;
  const inAccount = useCallback(
    (t: Trade) => all || t.account === selected,
    [all, selected]
  );
  return {
    accounts,
    selected,
    /** The account of the "Conta MT5" card; empty when adding them up. */
    single: all ? "" : selected,
    inAccount,
  };
}

export function JournalContent({ initialTab }: { initialTab: Tab }) {
  const settings = useQuery(api.journal.settings, {});
  const ensureToken = useMutation(api.journal.ensureToken);
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  // "Tudo" by default: the same totals as the MT5 history of the account
  const [period, setPeriod] = useState<Period>("all");
  const [account, setAccount] = useState("");
  const [symbol, setSymbol] = useState("");
  const [tz, setTz] = useState<TimeZoneId>("local");
  const from = useMemo(() => since(period), [period]);
  // The whole history: the period only filters what is shown, so positions
  // opened earlier, the balance curve and the totals stay complete
  const deals = useQuery(api.journal.deals, {});
  const signals = useQuery(api.journal.signals, { limit: 500 });
  const notes = useQuery(api.journal.notes, {});
  const known = useQuery(api.journal.accounts, {});

  useEffect(() => {
    if (settings?.panel && !settings.token) {
      ensureToken({});
    }
  }, [settings, ensureToken]);

  const allTrades = useMemo(() => buildTrades(deals ?? []), [deals]);
  const { accounts, selected, single, inAccount } = useAccountChoice(
    known,
    allTrades,
    account
  );
  const symbols = useMemo(
    () => [...new Set(allTrades.map((t) => t.symbol))].sort(),
    [allTrades]
  );
  const trades = useMemo(
    () =>
      allTrades.filter(
        (t) =>
          (t.closeTime ?? t.openTime) >= from &&
          inAccount(t) &&
          (!symbol || t.symbol === symbol)
      ),
    [allTrades, from, inAccount, symbol]
  );
  const accountTrades = useMemo(
    () => allTrades.filter((t) => t.account === selected),
    [allTrades, selected]
  );
  const stats = useMemo(() => computeStats(trades), [trades]);
  const { modelOf, tags } = useMemo(() => {
    const setups = new Map<string, string>();
    const tagMap = new Map<string, string[]>();
    for (const n of notes ?? []) {
      if (n.setup) {
        setups.set(n.key, n.setup);
      }
      if (n.tags?.length) {
        tagMap.set(n.key, n.tags);
      }
    }
    return { modelOf: modelResolver(setups), tags: tagMap };
  }, [notes]);

  if (settings === undefined) {
    return <p className="p-4 text-muted-foreground text-sm">Carregando…</p>;
  }
  if (settings === null) {
    return (
      <div className="p-4">
        <PanelUnlock what="ver o diário de trading" />
      </div>
    );
  }
  const open = trades.filter((t) => t.closeTime === null).length;
  return (
    <div className="journal-palette flex flex-col gap-4 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-lg">Diário de trading</h2>
          <p className={cn("text-sm tabular-nums", tone(stats.net))}>
            {money(stats.net, true)} · {stats.trades} operações ·{" "}
            {(stats.winRate * 100).toFixed(0)}% acerto
          </p>
        </div>
      </div>
      <JournalDemoNotice />
      <Tabs onValueChange={(v) => setTab(v as Tab)} value={tab}>
        <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {FILTERED.has(tab) ? (
        <div className="flex flex-wrap items-center gap-2">
          <Filters
            account={selected}
            accounts={accounts}
            onAccount={setAccount}
            onPeriod={setPeriod}
            onSymbol={setSymbol}
            period={period}
            symbol={symbol}
            symbols={symbols}
          />
          {ZONED.has(tab) ? (
            <Segmented
              label="Fuso horário"
              onChange={setTz}
              options={ZONES}
              value={tz}
            />
          ) : null}
        </div>
      ) : null}
      {deals === undefined && tab !== "connector" ? (
        <p className="text-muted-foreground text-sm">A carregar operações…</p>
      ) : null}
      {deals && allTrades.length === 0 && FILTERED.has(tab) ? (
        <JournalData />
      ) : null}
      {deals ? (
        <Analysis
          account={single}
          accountTrades={accountTrades}
          modelOf={modelOf}
          notes={notes ?? []}
          open={open}
          options={settings.noteOptions}
          stats={stats}
          tab={tab}
          tags={tags}
          trades={trades}
          tz={tz}
        />
      ) : null}
      {tab === "trades" && deals ? (
        <JournalTrades
          notes={notes ?? []}
          options={settings.noteOptions}
          signals={signals ?? []}
          trades={trades}
        />
      ) : null}
      {tab === "signals" ? <Signals signals={signals ?? []} /> : null}
      {tab === "connector" ? <JournalConnector settings={settings} /> : null}
      {tab === "connector" ? <JournalData /> : null}
    </div>
  );
}

export function JournalPanel({ initialTab = "summary" }: { initialTab?: Tab }) {
  return (
    <TelegramProvider
      fallback={
        <div className="p-4">
          <Notice>
            O diário usa o banco central do painel (Convex), que não está
            configurado nesta instalação.
          </Notice>
        </div>
      }
    >
      <JournalContent initialTab={initialTab} />
    </TelegramProvider>
  );
}
