"use client";

import {
  Legend,
  LegendItemComponent,
  LegendLabel,
  LegendMarker,
  LegendProgress,
  LegendValue,
  PieCenter,
  PieChart,
  PieSlice,
  RadarArea,
  RadarAxis,
  RadarChart,
  RadarGrid,
  RadarLabels,
  Ring,
  RingChart,
} from "@bklitui/ui/charts";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import type { api } from "@/convex/_generated/api";
import { ACCOUNT_TYPE_LABEL, MARKET_LABEL } from "@/lib/journal/account";
import {
  type GroupRow,
  groupBy,
  groupByTag,
  macroOf,
} from "@/lib/journal/analytics";
import type { Trade } from "@/lib/journal/metrics";
import {
  NOTE_FIELD_LABEL,
  NOTE_FIELDS,
  type NoteField,
  type NoteOptions,
} from "@/lib/journal/note-fields";
import {
  colorAt,
  DOWN,
  Empty,
  GroupTable,
  Panel,
  pct,
  UP,
  WinLossBars,
} from "./journal-kit";
import { money } from "./journal-summary";

/** Ativos e modelos: where the money comes from and which setups work. */

export type NoteRow = NonNullable<
  FunctionReturnType<typeof api.journal.notes>
>[number];

/** Rows of one structured note field, in the order of its options. */
function noteGroups(
  trades: Trade[],
  notes: Map<string, NoteRow>,
  field: NoteField,
  options: string[]
) {
  const fieldOf = (t: Trade) => {
    const v = notes.get(t.key)?.[field]?.trim();
    if (v) {
      return v;
    }
    // Entry macro is automatic unless the note overrides it
    return field === "macro" ? macroOf(t.openTime) : null;
  };
  const rows = groupBy(trades, fieldOf);
  const rank = (k: string) => {
    const i = options.indexOf(k);
    return i < 0 ? options.length : i;
  };
  return rows.sort((a, b) => rank(a.key) - rank(b.key));
}

function NoteBreakdowns({
  trades,
  notes,
  options,
}: {
  trades: Trade[];
  notes: NoteRow[];
  options: NoteOptions;
}) {
  const groups = useMemo(() => {
    const byKey = new Map(notes.map((n) => [n.key, n]));
    return NOTE_FIELDS.map((f) => ({
      field: f,
      rows: noteGroups(trades, byKey, f, options[f]),
    }));
  }, [trades, notes, options]);
  const filled = groups.filter((g) => g.rows.length > 0);
  if (filled.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {filled.map((g) => (
        <Panel
          description={
            g.field === "macro"
              ? "Pela hora de entrada em Nova York (ou o valor da nota)."
              : "Preenchido nas notas das operações."
          }
          key={g.field}
          title={`Por ${NOTE_FIELD_LABEL[g.field]}`}
        >
          <GroupTable
            first={NOTE_FIELD_LABEL[g.field]}
            keepOrder
            rows={g.rows}
          />
        </Panel>
      ))}
    </div>
  );
}

const MAX_SLICES = 6;

function AssetDonut({ rows }: { rows: GroupRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const winners = rows.filter((r) => r.grossProfit > 0);
  const top = winners.slice(0, MAX_SLICES - 1);
  const rest = winners.slice(MAX_SLICES - 1);
  const data = [
    ...top.map((r, i) => ({
      label: r.label,
      value: r.grossProfit,
      color: colorAt(i),
    })),
    ...(rest.length
      ? [
          {
            label: `Outros (${rest.length})`,
            value: rest.reduce((a, r) => a + r.grossProfit, 0),
            color: "var(--muted-foreground)",
          },
        ]
      : []),
  ];
  if (data.length === 0) {
    return <Empty>Nenhum ativo com ganhos ainda.</Empty>;
  }
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <PieChart
        data={data}
        hoveredIndex={hover}
        innerRadius={58}
        onHoverChange={setHover}
        size={200}
      >
        {data.map((d, i) => (
          <PieSlice index={i} key={d.label} />
        ))}
        <PieCenter
          defaultLabel="Ganhos"
          formatOptions={{ notation: "compact" }}
        />
      </PieChart>
      <Legend
        className="w-full"
        hoveredIndex={hover}
        items={data}
        onHoverChange={setHover}
      >
        <LegendItemComponent className="flex items-center gap-3">
          <LegendMarker />
          <LegendLabel className="flex-1 text-sm" />
          <LegendValue
            className="text-sm"
            formatValue={(v) => money(v)}
            showPercentage
          />
        </LegendItemComponent>
      </Legend>
    </div>
  );
}

/** Each model's profile normalized to 0-100 against the best model. */
function ModelRadar({ rows }: { rows: GroupRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const models = rows.filter((r) => r.trades > 0).slice(0, 4);
  if (models.length === 0) {
    return <Empty>Defina o setup nas notas das operações.</Empty>;
  }
  const maxOf = (f: (r: GroupRow) => number) =>
    Math.max(...models.map(f), 1e-9);
  const pf = (r: GroupRow) => Math.min(r.profitFactor ?? 4, 4);
  const payoff = (r: GroupRow) =>
    r.avgLoss < 0 ? Math.min(r.avgWin / -r.avgLoss, 5) : 0;
  const exp = (r: GroupRow) => Math.max(r.expectancy, 0);
  const metrics = [
    { key: "winRate", label: "Acerto" },
    { key: "pf", label: "Profit factor" },
    { key: "payoff", label: "Payoff" },
    { key: "exp", label: "Expectativa" },
    { key: "freq", label: "Frequência" },
  ];
  const data = models.map((r, i) => ({
    label: r.label,
    color: colorAt(i),
    values: {
      winRate: Math.max(4, r.winRate * 100),
      pf: Math.max(4, (pf(r) / maxOf(pf)) * 100),
      payoff: Math.max(4, (payoff(r) / maxOf(payoff)) * 100),
      exp: Math.max(4, (exp(r) / maxOf(exp)) * 100),
      freq: Math.max(4, (r.trades / maxOf((x) => x.trades)) * 100),
    },
  }));
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
      <RadarChart
        data={data}
        hoveredIndex={hover}
        levels={4}
        metrics={metrics}
        onHoverChange={setHover}
        size={290}
      >
        <RadarGrid showLabels={false} />
        <RadarAxis />
        <RadarLabels fontSize={11} interactive offset={18} />
        {data.map((d, i) => (
          <RadarArea index={i} key={d.label} />
        ))}
      </RadarChart>
      <Legend
        className="w-full"
        hoveredIndex={hover}
        items={models.map((r, i) => ({
          label: r.label,
          value: r.winRate * 100,
          maxValue: 100,
          color: colorAt(i),
        }))}
        onHoverChange={setHover}
        title="Acerto por modelo"
      >
        <LegendItemComponent className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1">
          <LegendMarker />
          <LegendLabel className="truncate text-sm" />
          <LegendValue
            className="text-sm"
            formatValue={(v) => `${v.toFixed(0)}%`}
          />
          <div className="col-span-full">
            <LegendProgress />
          </div>
        </LegendItemComponent>
      </Legend>
    </div>
  );
}

function SideRings({ rows }: { rows: GroupRow[] }) {
  const data = rows.map((r) => ({
    label: `${r.label} · ${r.trades}`,
    value: Math.round(r.winRate * 1000) / 10,
    maxValue: 100,
    color: r.key === "Compra" ? UP : DOWN,
  }));
  const total = rows.reduce((a, r) => a + r.trades, 0);
  const wins = rows.reduce((a, r) => a + r.wins, 0);
  if (total === 0) {
    return <Empty>Sem operações fechadas.</Empty>;
  }
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0">
        <RingChart data={data} ringGap={8} size={190} strokeWidth={14}>
          {data.map((d, i) => (
            <Ring index={i} key={d.label} />
          ))}
        </RingChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-semibold text-2xl tabular-nums">
            {pct(wins / total)}
          </span>
          <span className="text-muted-foreground text-xs">acerto geral</span>
        </div>
      </div>
      <div className="grid w-full gap-2">
        {rows.map((r) => (
          <div className="rounded-xl border px-3 py-2 text-sm" key={r.key}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.label}</span>
              <span className="tabular-nums">{money(r.net, true)}</span>
            </div>
            <p className="text-muted-foreground text-xs tabular-nums">
              {r.trades} ops · {pct(r.winRate)} acerto · PF{" "}
              {r.profitFactor === null ? "∞" : r.profitFactor.toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JournalBreakdown({
  trades,
  modelOf,
  tags,
  notes,
  options,
}: {
  trades: Trade[];
  modelOf: (t: Trade) => string;
  tags: Map<string, string[]>;
  notes: NoteRow[];
  options: NoteOptions;
}) {
  const market = useMemo(
    () =>
      groupBy(trades, (t) => t.market, {
        labelOf: (k) => MARKET_LABEL[k] ?? k,
      }),
    [trades]
  );
  const accountType = useMemo(
    () =>
      groupBy(trades, (t) => t.accountType, {
        labelOf: (k) => ACCOUNT_TYPE_LABEL[k] ?? k,
      }),
    [trades]
  );
  const symbol = useMemo(() => groupBy(trades, (t) => t.symbol), [trades]);
  const model = useMemo(() => groupBy(trades, modelOf), [trades, modelOf]);
  const side = useMemo(
    () =>
      groupBy(trades, (t) => (t.side === "buy" ? "Compra" : "Venda"), {
        order: ["Compra", "Venda"],
      }),
    [trades]
  );
  const tag = useMemo(() => groupByTag(trades, tags), [trades, tags]);
  const account = useMemo(() => groupBy(trades, (t) => t.account), [trades]);
  if (symbol.length === 0) {
    return <Empty>Sem operações fechadas neste filtro.</Empty>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          description="Participação de cada ativo nos ganhos brutos."
          title="De onde vem o lucro"
        >
          <AssetDonut rows={symbol} />
        </Panel>
        <Panel
          description="Ganhos contra perdas por ativo."
          title="Ativos: ganhos × perdas"
        >
          <WinLossBars rows={symbol.slice(0, 12)} />
        </Panel>
      </div>
      <Panel title="Por ativo">
        <GroupTable first="Ativo" rows={symbol} />
      </Panel>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel description="Do EA, ou deduzido do símbolo." title="Por mercado">
          <GroupTable first="Mercado" rows={market} />
        </Panel>
        <Panel
          description="Tipo de conta escolhido no EA TradingJournal Complete."
          title="Por tipo de conta"
        >
          {accountType.length ? (
            <GroupTable first="Tipo" rows={accountType} />
          ) : (
            <Empty>O EA simples não envia o tipo de conta.</Empty>
          )}
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          description="Perfil dos 4 modelos com mais lucro (o melhor de cada eixo = 100). O modelo vem do setup da nota, do comentário da ordem ou do magic do EA."
          title="Modelos de operação"
        >
          <ModelRadar rows={model} />
        </Panel>
        <Panel
          description="Taxa de acerto e resultado por direção."
          title="Compra × venda"
        >
          <SideRings rows={side} />
        </Panel>
      </div>
      <Panel title="Por modelo de operação">
        <GroupTable first="Modelo" rows={model} />
      </Panel>
      {tag.length > 0 ? (
        <Panel
          description="Uma operação conta em cada tag da nota."
          title="Por tag"
        >
          <GroupTable first="Tag" rows={tag} />
        </Panel>
      ) : null}
      <NoteBreakdowns notes={notes} options={options} trades={trades} />
      {account.length > 1 ? (
        <Panel title="Por conta">
          <GroupTable first="Conta" rows={account} />
        </Panel>
      ) : null}
    </div>
  );
}
