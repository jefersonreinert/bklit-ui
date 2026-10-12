"use client";

import {
  ChartMarkers,
  ChartTooltip,
  Grid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "@bklitui/ui/charts";
import { curveMonotoneX } from "@visx/curve";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  ACCOUNT_TYPE_LABEL,
  balanceCurve,
  type CashRow,
  cashFlows,
  eaOffline,
  type HistoryPoint,
} from "@/lib/journal/account";
import type { Trade } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";
import { axisMoney, Panel, pct, Stat } from "./journal-kit";
import { money, tone } from "./journal-summary";

/**
 * "Conta MT5": what only the terminal knows, sent by the TradingJournal
 * Complete EA (POST /journal/mt5/stats): balance, equity, margin, deposits,
 * targets, today/week/month on the server clock, the real balance × equity
 * curve and a check of the EA's totals against the stored deals.
 */

type Row = NonNullable<
  FunctionReturnType<typeof api.journal.accountStats>
>[number];

const YEAR = 365 * 86_400_000;

function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

function ago(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 1) {
    return "agora mesmo";
  }
  if (m < 60) {
    return `há ${m} min`;
  }
  const h = Math.round(m / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

/** Weekly/monthly target: reached, in progress or negative period. */
function Target({
  label,
  target,
  progress,
  result,
  start,
  targetPct,
  currency,
}: {
  label: string;
  target: number;
  progress: number;
  result: number;
  start: number;
  targetPct: number;
  currency: string;
}) {
  const hit = progress >= 1;
  const negative = result < 0;
  let status = `${pct(progress)} da meta`;
  if (hit) {
    status = "Meta batida";
  } else if (negative) {
    status = "Período negativo";
  }
  return (
    <div className="flex flex-col gap-1.5 border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-sm">{label}</p>
        <span
          className={cn(
            "text-xs",
            hit && "font-semibold text-[var(--up)]",
            negative && "text-[var(--down)]",
            !(hit || negative) && "text-muted-foreground"
          )}
        >
          {status}
        </span>
      </div>
      <div
        aria-label={`${label}: ${pct(progress)}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(progress * 100)}
        className="h-2.5 overflow-hidden bg-muted"
        role="progressbar"
      >
        <span
          className="block h-full"
          style={{
            width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
            background: negative ? "var(--down)" : "var(--up)",
            opacity: hit ? 1 : 0.75,
          }}
        />
      </div>
      <p className="text-muted-foreground text-xs tabular-nums">
        <span className={tone(result)}>{money(result, true)}</span> de{" "}
        {money(target)} {currency} ({pct(targetPct, 1)}) · início {money(start)}
      </p>
    </div>
  );
}

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
});

interface Marker {
  date: Date;
  icon: string;
  title: string;
  description: string;
  color: string;
}

const cashMarker = (time: number, amount: number): Marker => ({
  date: new Date(time),
  icon: amount > 0 ? "+" : "−",
  title: `${amount > 0 ? "Depósito" : "Levantamento"} ${money(Math.abs(amount))}`,
  description: shortDate.format(new Date(time)),
  color: amount > 0 ? "var(--up)" : "var(--down)",
});

/** Balance (and equity, when known) over time, with deposit markers. */
function BalanceChart({
  data,
  markers,
  empty,
}: {
  data: { date: Date; balance: number; equity?: number }[];
  markers: Marker[];
  empty: string;
}) {
  const withEquity = data.some((d) => d.equity !== undefined);
  if (data.length < 2) {
    return (
      <p className="flex h-32 items-center justify-center border border-dashed text-center text-muted-foreground text-sm">
        {empty}
      </p>
    );
  }
  return (
    <LineChart
      aspectRatio="5 / 2"
      data={data}
      margin={{ top: 12, right: 12, bottom: 32, left: 56 }}
    >
      <Grid horizontal />
      <Line
        curve={curveMonotoneX}
        dataKey="balance"
        stroke="var(--up)"
        strokeWidth={2}
      />
      {withEquity ? (
        <Line
          curve={curveMonotoneX}
          dataKey="equity"
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
        />
      ) : null}
      {markers.length ? <ChartMarkers items={markers} size={20} /> : null}
      <YAxis formatValue={axisMoney} />
      <XAxis />
      <ChartTooltip
        rows={(p) => [
          {
            color: "var(--up)",
            label: "Saldo",
            value: money(Number(p.balance)),
          },
          ...(withEquity
            ? [
                {
                  color: "var(--muted-foreground)",
                  label: "Equity",
                  value: money(Number(p.equity)),
                },
              ]
            : []),
        ]}
      />
    </LineChart>
  );
}

/**
 * The real balance curve: rebuilt from the deposits, withdrawals and
 * trades of the EA v4.01; else the EA's daily balance × equity snapshots.
 */
function AccountCurve({
  account,
  balance,
  trades,
  now,
}: {
  account: string;
  balance: number;
  trades: Trade[];
  now: number;
}) {
  const cash = useQuery(api.journal.cash, { account });
  const history = useQuery(api.journal.statsHistory, {
    account,
    from: now - YEAR,
  });
  const curve = useMemo(
    () => (cash?.length ? balanceCurve(trades, cash as CashRow[]) : null),
    [cash, trades]
  );
  if (curve) {
    const last = curve.at(-1)?.balance ?? 0;
    // Entry commissions of open positions are already off the balance
    const gap = Math.abs(last - balance);
    return (
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">Saldo real da conta</p>
        <p className="text-muted-foreground text-xs">
          Reconstruído desde o primeiro depósito com os depósitos, levantamentos
          e todas as operações fechadas enviadas pelo EA.
        </p>
        <p
          className={cn(
            "text-xs tabular-nums",
            gap <= 1 ? "text-muted-foreground" : "text-[var(--down)]"
          )}
        >
          {gap <= 1
            ? `✓ Bate com o saldo do MT5 (${money(balance)}).`
            : `Saldo reconstruído ${money(last)} · MT5 ${money(balance)}: faltam negócios ou depósitos (diferença ${money(last - balance, true)}).`}
        </p>
        <BalanceChart
          data={curve.map((p) => ({
            date: new Date(p.time),
            balance: p.balance,
          }))}
          empty="A curva aparece com o primeiro depósito e a primeira operação."
          markers={(cash ?? []).map((c) => cashMarker(c.time, c.amount))}
        />
      </div>
    );
  }
  const points = (history ?? []) as HistoryPoint[];
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium text-sm">Saldo × equity</p>
      <p className="text-muted-foreground text-xs">
        Um ponto por dia das estatísticas do EA. Atualize o EA para a v4.01 para
        ver a curva completa desde o primeiro depósito.
      </p>
      <BalanceChart
        data={points.map((p) => ({
          date: new Date(p.time),
          balance: p.balance,
          equity: p.equity,
        }))}
        empty="A curva de saldo aparece a partir de dois dias de estatísticas do EA."
        markers={cashFlows(points).map((f) => cashMarker(f.time, f.amount))}
      />
    </div>
  );
}

function Check({ account }: { account: string }) {
  const check = useQuery(api.journal.accountCheck, { account });
  if (!check) {
    return null;
  }
  if (check.issues.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        ✓ Sincronizado com o MT5: as {check.panel.trades} operações fechadas e o
        lucro líquido batem com o EA.
      </p>
    );
  }
  return (
    <div
      className="border border-[var(--down)] border-dashed p-2 text-xs"
      role="status"
    >
      <p className="font-medium">Verificação: o EA e o painel divergem</p>
      {check.issues.map((i) => (
        <p className="tabular-nums" key={i.field}>
          {i.field === "trades"
            ? `Operações fechadas: EA ${i.ea} · painel ${i.panel}`
            : `Lucro líquido: EA ${money(i.ea, true)} · painel ${money(i.panel, true)}`}
        </p>
      ))}
      <p className="text-muted-foreground">
        Faltam negócios no painel (ou o EA enviou só uma parte do histórico).
        Remova e volte a anexar o EA com “Todo o histórico” para reenviar: o
        painel ignora o que já tem. EAs anteriores à v4.01 contam cada saída
        parcial como uma operação.
      </p>
    </div>
  );
}

function AccountBody({
  row,
  now,
  trades,
}: {
  row: Row;
  now: number;
  trades: Trade[];
}) {
  const s = row.stats;
  const offline = eaOffline(row.receivedAt, now);
  const c = row.currency;
  const growth = s.initialDeposit
    ? (s.balance + s.withdrawal - s.initialDeposit) / s.initialDeposit
    : null;
  const floating = s.equity - s.balance;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          className={cn(
            "border px-1.5 py-0.5 font-medium",
            offline
              ? "border-[var(--down)] text-[var(--down)]"
              : "border-[var(--up)] text-[var(--up)]"
          )}
        >
          {offline ? "EA offline" : "EA online"}
        </span>
        <span className="text-muted-foreground">
          Atualizado {ago(now - row.receivedAt)}
        </span>
        <span className="text-muted-foreground">
          {[
            row.holder,
            row.server,
            ACCOUNT_TYPE_LABEL[row.accountType] ?? row.accountType,
            c,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Saldo" value={`${money(s.balance)} ${c}`} />
        <Stat
          className={tone(floating)}
          hint={`flutuante ${money(floating, true)}`}
          label="Equity"
          value={money(s.equity)}
        />
        <Stat label="Margem livre" value={money(s.freeMargin)} />
        <Stat label="Depósito inicial" value={money(s.initialDeposit)} />
        <Stat label="Levantamentos" value={money(s.withdrawal)} />
        <Stat
          className={tone(growth ?? 0)}
          hint="sobre o depósito"
          label="Crescimento"
          value={growth === null ? "—" : pct(growth, 1)}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat
          className={tone(s.dailyProfit)}
          hint={`${pct(s.dailyDrawdown, 2)} do saldo inicial do dia`}
          label="Hoje (servidor)"
          value={money(s.dailyProfit, true)}
        />
        <Stat
          className={tone(s.weeklyProfit)}
          label="Semana"
          value={money(s.weeklyProfit, true)}
        />
        <Stat
          className={tone(s.monthlyProfit)}
          label="Mês"
          value={money(s.monthlyProfit, true)}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Target
          currency={c}
          label="Meta semanal"
          progress={s.weeklyTargetProgress}
          result={s.weeklyProfit}
          start={s.startingWeeklyEquity}
          target={s.weeklyTarget}
          targetPct={s.weeklyTargetPct}
        />
        <Target
          currency={c}
          label="Meta mensal"
          progress={s.monthlyTargetProgress}
          result={s.monthlyProfit}
          start={s.startingMonthlyEquity}
          target={s.monthlyTarget}
          targetPct={s.monthlyTargetPct}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Segundo o EA: {s.totalTrades} saídas · acerto {pct(s.winRate)} · PF{" "}
        {s.profitFactor.toFixed(2)} · recovery {s.recoveryFactor.toFixed(2)} ·
        Sharpe/trade {s.sharpeRatio.toFixed(2)} · sequências {s.maxConWins}{" "}
        ganhos / {s.maxConLosses} perdas.
      </p>
      <Check account={row.account} />
      <AccountCurve
        account={row.account}
        balance={s.balance}
        now={now}
        trades={trades}
      />
    </div>
  );
}

/**
 * Card at the top of the summary for the account chosen in the journal
 * filter; hidden until the EA sends its statistics, and when the filter
 * adds up several accounts.
 */
export function JournalAccount({
  account,
  trades,
}: {
  account: string;
  /** Every trade of the account (any period), for the balance curve. */
  trades: Trade[];
}) {
  const rows = useQuery(
    api.journal.accountStats,
    account ? { account } : "skip"
  );
  const now = useNow();
  const row = rows?.[0];
  if (!row) {
    return null;
  }
  return (
    <Panel
      action={
        <span className="text-muted-foreground text-xs">#{row.account}</span>
      }
      description="Dados do terminal enviados pelo EA TradingJournal Complete."
      title="Conta MT5"
    >
      <AccountBody now={now} row={row} trades={trades} />
    </Panel>
  );
}
