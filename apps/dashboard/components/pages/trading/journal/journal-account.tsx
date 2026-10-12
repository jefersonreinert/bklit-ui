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
  cashFlows,
  eaOffline,
  type HistoryPoint,
} from "@/lib/journal/account";
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

/** Real balance and equity (daily snapshots), deposits and withdrawals. */
function BalanceChart({ points }: { points: HistoryPoint[] }) {
  const data = useMemo(
    () =>
      points.map((p) => ({
        date: new Date(p.time),
        balance: p.balance,
        equity: p.equity,
      })),
    [points]
  );
  const markers = useMemo(
    () =>
      cashFlows(points).map((f) => ({
        date: new Date(f.time),
        icon: f.amount > 0 ? "+" : "−",
        title: `${f.amount > 0 ? "Depósito" : "Levantamento"} ${money(Math.abs(f.amount))}`,
        description: shortDate.format(new Date(f.time)),
        color: f.amount > 0 ? "var(--up)" : "var(--down)",
      })),
    [points]
  );
  if (data.length < 2) {
    return (
      <p className="flex h-32 items-center justify-center border border-dashed text-center text-muted-foreground text-sm">
        A curva de saldo aparece a partir de dois dias de estatísticas do EA.
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
      <Line
        curve={curveMonotoneX}
        dataKey="equity"
        stroke="var(--muted-foreground)"
        strokeWidth={1.5}
      />
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
          {
            color: "var(--muted-foreground)",
            label: "Equity",
            value: money(Number(p.equity)),
          },
        ]}
      />
    </LineChart>
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
        ✓ Os totais do EA batem com as {check.panel.trades} saídas guardadas no
        painel.
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
            ? `Saídas: EA ${i.ea} · painel ${i.panel}`
            : `Lucro líquido: EA ${money(i.ea, true)} · painel ${money(i.panel, true)}`}
        </p>
      ))}
      <p className="text-muted-foreground">
        Faltam negócios no painel (ou o EA enviou só uma parte do histórico).
        Reinicie o EA com “Todo o histórico” para reenviar.
      </p>
    </div>
  );
}

function AccountBody({ row, now }: { row: Row; now: number }) {
  const s = row.stats;
  const history = useQuery(api.journal.statsHistory, {
    account: row.account,
    from: now - YEAR,
  });
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
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">Saldo × equity</p>
        <p className="text-muted-foreground text-xs">
          Um ponto por dia (hora do servidor). Inclui depósitos e levantamentos,
          que a curva de capital das operações não mostra.
        </p>
        {history ? <BalanceChart points={history} /> : null}
      </div>
    </div>
  );
}

/** Card at the top of the summary; hidden until the EA sends statistics. */
export function JournalAccount({ account }: { account: string }) {
  const rows = useQuery(api.journal.accountStats, {});
  const now = useNow();
  const [picked, setPicked] = useState("");
  if (!rows?.length) {
    return null;
  }
  const row =
    rows.find((r) => r.account === (picked || account)) ?? (rows[0] as Row);
  return (
    <Panel
      action={
        rows.length > 1 ? (
          <select
            aria-label="Conta MT5"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            onChange={(e) => setPicked(e.target.value)}
            value={row.account}
          >
            {rows.map((r) => (
              <option key={r.account} value={r.account}>
                {r.account} · {r.server}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted-foreground text-xs">#{row.account}</span>
        )
      }
      description="Dados do terminal enviados pelo EA TradingJournal Complete."
      title="Conta MT5"
    >
      <AccountBody now={now} row={row} />
    </Panel>
  );
}
