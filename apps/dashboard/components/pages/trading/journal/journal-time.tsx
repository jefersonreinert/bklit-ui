"use client";

import { Ring, RingChart } from "@bklitui/ui/charts";
import { useMemo, useState } from "react";
import {
  type GroupRow,
  groupings,
  HOURS,
  SESSIONS,
  type TimeZoneId,
  WEEKDAYS,
  weekHourMatrix,
} from "@/lib/journal/analytics";
import type { Trade } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";
import {
  type BarMode,
  colorAt,
  Empty,
  GroupTable,
  Panel,
  pct,
  Segmented,
  WinLossBars,
} from "./journal-kit";
import { money, tone } from "./journal-summary";

/** Horários: sessions, ICT kill zones, hour, minute, weekday and duration. */

const MODES: { id: BarMode; label: string }[] = [
  { id: "money", label: "Valor" },
  { id: "count", label: "Quantidade" },
];

const KZ_SUFFIX = /\s*(?:KZ\s*)?\(.*\)$/;

const TZ_NAME: Record<TimeZoneId, string> = {
  local: "horário local",
  "America/New_York": "horário de Nova York",
  UTC: "UTC",
};

/** "NY AM KZ (07-10)" → "NY AM" for the bar axis. */
const shortZone = (key: string) =>
  key.replace(KZ_SUFFIX, "").replace("Fora de kill zone", "Fora");

function SessionRings({ rows }: { rows: GroupRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const active = rows.filter((r) => r.trades > 0);
  if (active.length === 0) {
    return <Empty>Sem operações fechadas.</Empty>;
  }
  const data = active.map((r) => ({
    label: r.label,
    value: Math.round(r.winRate * 1000) / 10,
    maxValue: 100,
    color: colorAt(SESSIONS.indexOf(r.key)),
  }));
  const best = [...active].sort((a, b) => b.net - a.net)[0];
  const shown = hover === null ? null : active[hover];
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0">
        <RingChart
          data={data}
          hoveredIndex={hover}
          onHoverChange={setHover}
          ringGap={6}
          size={200}
          strokeWidth={12}
        >
          {data.map((d, i) => (
            <Ring index={i} key={d.label} />
          ))}
        </RingChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
          <span className="font-semibold text-xl tabular-nums">
            {pct((shown ?? best)?.winRate ?? 0)}
          </span>
          <span className="text-muted-foreground text-xs leading-tight">
            {shown ? shown.label : `melhor: ${best?.label}`}
          </span>
        </div>
      </div>
      <ul className="grid w-full gap-1.5 text-sm">
        {active.map((r, i) => (
          <li key={r.key}>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left",
                hover === i && "bg-muted"
              )}
              onBlur={() => setHover(null)}
              onFocus={() => setHover(i)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              type="button"
            >
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: data[i]?.color }}
              />
              <span className="flex-1 truncate">{r.label}</span>
              <span className="hidden shrink-0 text-muted-foreground text-xs tabular-nums sm:inline">
                {r.trades} · {pct(r.winRate)}
              </span>
              <span
                className={cn(
                  "shrink-0 text-right text-xs tabular-nums",
                  tone(r.net)
                )}
              >
                {money(r.net, true)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function cellColor(net: number, max: number) {
  if (net === 0) {
    return;
  }
  const alpha = Math.round(18 + (Math.abs(net) / max) * 62);
  const color = net > 0 ? "var(--up)" : "var(--down)";
  return `color-mix(in oklab, ${color} ${alpha}%, transparent)`;
}

/** Weekday × hour grid colored by net result (green profit, red loss). */
function WeekHourGrid({ trades, tz }: { trades: Trade[]; tz: TimeZoneId }) {
  const grid = useMemo(() => weekHourMatrix(trades, tz), [trades, tz]);
  const max = Math.max(
    1,
    ...grid.flatMap((row) => row.map((c) => Math.abs(c.net)))
  );
  return (
    <div className="-mx-1 overflow-x-auto">
      <div
        className="grid min-w-[640px] gap-[3px] text-[10px]"
        style={{ gridTemplateColumns: "2.25rem repeat(24, minmax(0, 1fr))" }}
      >
        <span />
        {HOURS.map((h) => (
          <span className="text-center text-muted-foreground" key={h}>
            {Number(h) % 3 === 0 ? h : ""}
          </span>
        ))}
        {WEEKDAYS.map((d, wi) => (
          <div className="contents" key={d}>
            <span className="self-center text-muted-foreground">{d}</span>
            {HOURS.map((h, hi) => {
              const c = grid[wi]?.[hi] ?? { net: 0, trades: 0, wins: 0 };
              return (
                <span
                  className={cn(
                    "aspect-square rounded-[3px]",
                    c.trades === 0 && "bg-muted/60"
                  )}
                  key={h}
                  style={{ backgroundColor: cellColor(c.net, max) }}
                  title={
                    c.trades
                      ? `${d} ${h}h · ${c.trades} ops · ${pct(c.wins / c.trades)} · ${money(c.net, true)}`
                      : `${d} ${h}h · sem operações`
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <span>Prejuízo</span>
        {[-1, -0.5, 0, 0.5, 1].map((x) => (
          <span
            className={cn("size-3 rounded-[3px]", x === 0 && "bg-muted/60")}
            key={x}
            style={{ backgroundColor: cellColor(x * max, max) }}
          />
        ))}
        <span>Lucro</span>
      </div>
    </div>
  );
}

export function JournalTime({
  trades,
  tz,
  modelOf,
}: {
  trades: Trade[];
  tz: TimeZoneId;
  modelOf: (t: Trade) => string;
}) {
  const [mode, setMode] = useState<BarMode>("money");
  const g = useMemo(
    () => groupings(trades, tz, modelOf),
    [trades, tz, modelOf]
  );
  if (!g.hour.some((r) => r.trades > 0)) {
    return <Empty>Sem operações fechadas neste filtro.</Empty>;
  }
  const bestHour = [...g.hour].sort((a, b) => b.net - a.net)[0];
  const worstHour = [...g.hour].sort((a, b) => a.net - b.net)[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Sessões e kill zones sempre pelo relógio de Nova York; hora, minuto e
          dia da semana pelo {TZ_NAME[tz]}. Melhor hora:{" "}
          <span className="font-medium text-foreground">
            {bestHour?.label}h ({money(bestHour?.net ?? 0, true)})
          </span>
          {" · "}pior:{" "}
          <span className="font-medium text-foreground">
            {worstHour?.label}h ({money(worstHour?.net ?? 0, true)})
          </span>
        </p>
        <Segmented
          label="Barras"
          onChange={setMode}
          options={MODES}
          value={mode}
        />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          description="Ásia 19-03 · Londres 03-08 · sobreposição 08-12 · Nova York 12-17 (NY)."
          title="Sessões"
        >
          <SessionRings rows={g.session} />
        </Panel>
        <Panel
          description="Janelas ICT em horário de Nova York, incluindo o Silver Bullet 10-11."
          title="Kill zones"
        >
          <WinLossBars
            mode={mode}
            rows={g.killZone.map((r) => ({ ...r, label: shortZone(r.key) }))}
          />
        </Panel>
      </div>
      <Panel title="Por sessão e kill zone">
        <div className="flex flex-col gap-4">
          <GroupTable first="Sessão" keepOrder rows={g.session} />
          <GroupTable first="Kill zone" keepOrder rows={g.killZone} />
        </div>
      </Panel>
      <Panel
        description={`Hora de abertura (${TZ_NAME[tz]}).`}
        title="Por hora do dia"
      >
        <WinLossBars aspect="3 / 1" mode={mode} rows={g.hour} />
      </Panel>
      <Panel
        description="Onde estão o lucro e o prejuízo em cada hora de cada dia (passe o mouse nas células)."
        title="Mapa semana × hora"
      >
        <WeekHourGrid trades={trades} tz={tz} />
      </Panel>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          description="Minuto de entrada dentro da hora, em blocos de 5 min."
          title="Por minuto"
        >
          <WinLossBars mode={mode} rows={g.minute} />
        </Panel>
        <Panel
          description="Dia da semana da abertura."
          title="Por dia da semana"
        >
          <WinLossBars mode={mode} rows={g.weekday} />
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          description="Quanto tempo a posição ficou aberta."
          title="Por duração"
        >
          <WinLossBars mode={mode} rows={g.duration} />
        </Panel>
        <Panel title="Tabela por hora">
          <GroupTable first="Hora" keepOrder rows={g.hour} />
        </Panel>
      </div>
      <Panel title="Tabelas por minuto, dia e duração">
        <div className="flex flex-col gap-4">
          <GroupTable first="Minuto" keepOrder rows={g.minute} />
          <GroupTable first="Dia" keepOrder rows={g.weekday} />
          <GroupTable first="Duração" keepOrder rows={g.duration} />
        </div>
      </Panel>
    </div>
  );
}
