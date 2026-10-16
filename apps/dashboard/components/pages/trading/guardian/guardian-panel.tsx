"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Component, type ReactNode, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Notice, TelegramProvider } from "../../telegram/telegram-shared";
import { Empty, Panel, Stat } from "../journal/journal-kit";
import { money } from "../journal/journal-summary";

/**
 * "Proteção": the FTMO Risk Guardian of the EA TradingJournal FTMO Risk
 * Guardian v4.20, read-only. The EA measures the account against the FTMO
 * Maximum Daily Loss (balance at 00:00 Prague) and Maximum Loss, blocks new
 * orders and closes positions before the limits; this tab shows its state,
 * the daily history and the events it sent in each sync.
 */

/** The EA syncs every 15 s (1 s while this tab or "Operar" is open). */
const ONLINE_MS = 30_000;
const HEARTBEAT_MS = 30_000;

/** Status palette (good / warning / serious / critical), always with icon + label. */
const STATES: { label: string; color: string; icon: IconName; text: string }[] =
  [
    {
      label: "Normal",
      color: "#0ca30c",
      icon: "IconShieldCheck",
      text: "Dentro dos limites da FTMO.",
    },
    {
      label: "Alerta",
      color: "#fab219",
      icon: "IconShield",
      text: "Perto do limite: atenção ao risco.",
    },
    {
      label: "Bloqueado",
      color: "#ec835a",
      icon: "IconShieldCrossed",
      text: "Novas ordens recusadas pelo robô.",
    },
    {
      label: "Emergência",
      color: "#d03b3b",
      icon: "IconShieldCrossed",
      text: "O robô está a fechar as posições.",
    },
  ];

type StateInfo = (typeof STATES)[number];
const stateOf = (n: number): StateInfo =>
  (STATES[Math.min(3, Math.max(0, Math.round(n)))] ?? STATES[0]) as StateInfo;

const EVENT_LABEL: Record<string, string> = {
  ESTADO_NORMAL: "Situação normal",
  ESTADO_ALERTA: "Alerta de perda",
  ESTADO_BLOQUEADO: "Entradas bloqueadas",
  ESTADO_EMERGENCIA: "Emergência acionada",
  ENTRADA_RECUSADA: "Ordem recusada",
  ENTRADA_SERIA_RECUSADA: "Ordem seria recusada (só monitorando)",
  ALTERACAO_RECUSADA: "Alteração de SL recusada",
  ALTERACAO_SERIA_RECUSADA: "Alteração seria recusada (só monitorando)",
  POSICAO_ENCERRADA: "Posição fechada e confirmada",
  FECHO_REJEITADO: "Fechamento rejeitado (nova tentativa)",
  FECHO_A_CONFIRMAR: "Fechamento a confirmar",
  FALHA_PERSISTENTE: "Falha persistente no fechamento",
  PENDENTE_CANCELADA: "Ordem pendente cancelada",
  CANCELAMENTO_REJEITADO: "Cancelamento rejeitado",
  NOVO_DIA: "Novo dia FTMO (00:00 Praga)",
  REINICIO: "Proteção ativa após reinício",
  ESTADO_ILEGIVEL: "Estado ilegível: bloqueado por segurança",
  DESBLOQUEIO: "Bloqueio permanente liberado",
  SLIPPAGE: "Execução com slippage",
  REQUISICOES: "Muitas requisições no dia",
  SEM_ORCAMENTO: "Limite de requisições quase esgotado",
};

const pctText = (n: number) => `${n.toFixed(1)}%`;

function useNow(every = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

function countdown(ms: number) {
  if (ms <= 0) {
    return "agora";
  }
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}

function StateBadge({ level, large }: { level: number; large?: boolean }) {
  const s = stateOf(level);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 font-semibold",
        large ? "text-base" : "text-xs"
      )}
      style={{ borderColor: s.color }}
    >
      <Icon
        className={large ? "size-5" : "size-3.5"}
        name={s.icon}
        style={{ color: s.color }}
      />
      {s.label}
    </span>
  );
}

/** Usage of one FTMO limit, with the robot's three triggers on the track. */
function LimitMeter({
  label,
  loss,
  limit,
  use,
  warn,
  block,
  emergency,
  currency,
  children,
}: {
  label: string;
  loss: number;
  limit: number;
  use: number;
  warn: number;
  block: number;
  emergency: number;
  currency: string;
  children?: ReactNode;
}) {
  let level = 0;
  if (use >= emergency) {
    level = 3;
  } else if (use >= block) {
    level = 2;
  } else if (use >= warn) {
    level = 1;
  }
  const fill = Math.min(100, Math.max(0, use));
  const room = (limit * block) / 100 - loss;
  const marks = [
    { at: warn, text: `${warn}%` },
    { at: block, text: `${block}%` },
    { at: emergency, text: `${emergency}%` },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-sm tabular-nums">
          <b>{money(Math.max(0, loss))}</b> de {money(limit)} {currency} ·{" "}
          <b>{pctText(Math.max(0, use))}</b> do limite
        </p>
      </div>
      <div aria-hidden className="relative h-3 border bg-muted/40">
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${fill}%`, background: stateOf(level).color }}
        />
        {marks.map((m) => (
          <span
            className="absolute -inset-y-1 w-0.5 bg-foreground/70"
            key={m.text}
            style={{ left: `${m.at}%` }}
          />
        ))}
      </div>
      <div className="relative h-4 text-[10px] text-muted-foreground">
        {marks.map((m) => (
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums"
            key={m.text}
            style={{ left: `${m.at}%` }}
          >
            {m.text}
          </span>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Marcas: alerta {warn}% · bloqueio {block}% · fecha as posições{" "}
        {emergency}% · o fim da barra é o limite da FTMO.
      </p>
      <p className="text-muted-foreground text-xs tabular-nums">
        {room > 0
          ? `Folga até o bloqueio: ${money(room)} ${currency}.`
          : "Acima do gatilho de bloqueio."}
      </p>
      {children}
    </div>
  );
}

export type GuardianStatusRow = NonNullable<
  FunctionReturnType<typeof api.guardian.status>
>;
export type GuardianDay = FunctionReturnType<typeof api.guardian.days>[number];
export type GuardianEventRow = FunctionReturnType<
  typeof api.guardian.events
>[number];
type Status = GuardianStatusRow;

/** Worst daily use of each FTMO day (bars) against the robot's triggers. */
function DayHistory({
  days,
  s,
}: {
  days: GuardianDay[] | undefined;
  s: Status;
}) {
  const [hover, setHover] = useState<string | null>(null);
  if (days === undefined) {
    return <p className="text-muted-foreground text-sm">A carregar…</p>;
  }
  if (!days.length) {
    return <Empty>O histórico começa no primeiro dia com o robô ligado.</Empty>;
  }
  const rows = [...days].reverse();
  const top = Math.max(100, ...rows.map((d) => d.maxDailyUsePct));
  const y = (v: number) => `${(Math.max(0, v) / top) * 100}%`;
  const shown = rows.find((d) => d.day === hover) ?? rows.at(-1);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Pior uso do limite diário em cada dia FTMO (00:00–24:00 de Praga).
        Linhas: bloqueio {s.blockPct}% e emergência {s.emergencyPct}%.
      </p>
      <div className="relative h-40 border-b border-l">
        {[s.blockPct, s.emergencyPct, 100].map((v) => (
          <div
            className="absolute inset-x-0 border-foreground/40 border-t border-dashed"
            key={v}
            style={{ bottom: y(v) }}
          >
            <span className="absolute -top-3.5 right-0 bg-background px-1 text-[10px] text-muted-foreground">
              {v === 100 ? "limite" : `${v}%`}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-0.5 px-0.5">
          {rows.map((d) => (
            <button
              aria-label={`${d.day}: ${pctText(d.maxDailyUsePct)} do limite diário`}
              className="group relative flex h-full min-w-0 flex-1 items-end"
              key={d.day}
              onBlur={() => setHover(null)}
              onFocus={() => setHover(d.day)}
              onMouseEnter={() => setHover(d.day)}
              onMouseLeave={() => setHover(null)}
              type="button"
            >
              <span
                className={cn(
                  "w-full rounded-t-[4px]",
                  hover && hover !== d.day && "opacity-50"
                )}
                style={{
                  height: y(d.maxDailyUsePct),
                  minHeight: 2,
                  background: stateOf(d.maxState).color,
                }}
              />
            </button>
          ))}
        </div>
      </div>
      {shown ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          <b>{shown.day}</b>
          <StateBadge level={shown.maxState} />
          <span>pior uso diário {pctText(shown.maxDailyUsePct)}</span>
          <span>pior uso total {pctText(shown.maxMaxUsePct)}</span>
          <span>saldo 00:00 {money(shown.dayStartBalance)}</span>
          <span>menor equity {money(shown.minEstEquity)}</span>
          <span>
            {shown.emergencies} emergência(s) · {shown.refused} ordem(ns)
            recusada(s) · {shown.closed} fechamento(s)
          </span>
        </div>
      ) : null}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Ver tabela
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-normal">Dia</th>
                <th className="py-1 pr-3 font-normal">Estado</th>
                <th className="py-1 pr-3 font-normal">Pior diário</th>
                <th className="py-1 pr-3 font-normal">Pior total</th>
                <th className="py-1 pr-3 font-normal">Saldo 00:00</th>
                <th className="py-1 pr-3 font-normal">Menor equity</th>
                <th className="py-1 pr-3 font-normal">Emerg.</th>
                <th className="py-1 pr-3 font-normal">Recusadas</th>
                <th className="py-1 font-normal">Fechadas</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr className="border-t" key={d.day}>
                  <td className="py-1 pr-3">{d.day}</td>
                  <td className="py-1 pr-3">{stateOf(d.maxState).label}</td>
                  <td className="py-1 pr-3">{pctText(d.maxDailyUsePct)}</td>
                  <td className="py-1 pr-3">{pctText(d.maxMaxUsePct)}</td>
                  <td className="py-1 pr-3">{money(d.dayStartBalance)}</td>
                  <td className="py-1 pr-3">{money(d.minEstEquity)}</td>
                  <td className="py-1 pr-3">{d.emergencies}</td>
                  <td className="py-1 pr-3">{d.refused}</td>
                  <td className="py-1">{d.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function EventRow({ e }: { e: GuardianEventRow }) {
  return (
    <li className="flex flex-col gap-0.5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground tabular-nums">
          {new Date(e.time).toLocaleString("pt-BR")}
        </span>
        <StateBadge level={e.state} />
        <span className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</span>
        {e.symbol ? (
          <span>
            {e.symbol}
            {e.ticket ? ` #${e.ticket}` : ""}
          </span>
        ) : null}
      </div>
      {e.reason ? <p className="text-muted-foreground">{e.reason}</p> : null}
      {e.request || e.result ? (
        <p className="text-muted-foreground">
          {e.request ? `Pedido: ${e.request}` : ""}
          {e.request && e.result ? " · " : ""}
          {e.result ? `Resultado: ${e.result}` : ""}
        </p>
      ) : null}
    </li>
  );
}

function Events({ list }: { list: GuardianEventRow[] | undefined }) {
  if (list === undefined) {
    return <p className="text-muted-foreground text-sm">A carregar…</p>;
  }
  if (!list.length) {
    return (
      <Empty>Sem eventos ainda. Bloqueios e fechamentos aparecem aqui.</Empty>
    );
  }
  return (
    <ul className="flex flex-col divide-y border text-xs">
      {list.map((e) => (
        <EventRow e={e} key={e.id} />
      ))}
    </ul>
  );
}

const MAX_KIND: Record<string, string> = {
  static: "fixa (capital inicial − limite)",
  eod: "trailing pelo maior saldo de fim de dia",
  intraday: "trailing pelo maior saldo",
};

function Settings({ s }: { s: Status }) {
  const rows: [string, string][] = [
    ["Produto", s.product],
    [
      "Modo",
      s.mode === "protect"
        ? "Proteger (bloqueia e fecha)"
        : "Só monitorar (não bloqueia nem fecha)",
    ],
    ["Capital inicial", money(s.initialCapital)],
    ["Perda diária FTMO", `${s.dailyPct}% do capital = ${money(s.dailyLimit)}`],
    [
      "Perda máxima FTMO",
      `${s.maxPct}% = ${money(s.maxLimit)}, ${MAX_KIND[s.maxKind] ?? s.maxKind}`,
    ],
    [
      "Gatilhos (% do limite)",
      `alerta ${s.warnPct}% · bloqueio ${s.blockPct}% · emergência ${s.emergencyPct}%`,
    ],
    [
      "Na emergência",
      s.closeOnEmergency
        ? `fecha ${s.scope === "account" ? "todas as posições da conta" : "só as posições do EA"}`
        : "não fecha posições (só bloqueia)",
    ],
    [
      "No bloqueio",
      s.cancelPendingOnBlock
        ? "cancela ordens pendentes"
        : "mantém as pendentes",
    ],
    [
      "Pior caso antes de cada ordem",
      s.worstCaseCheck ? "ligado (todos os stops somados)" : "desligado",
    ],
    [
      "Requisições hoje",
      `${s.requestsToday} de ${s.maxRequests} (FTMO: máx. 2000)`,
    ],
    ["Versão do robô", `v${s.version}`],
  ];
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[max-content_1fr]">
      {rows.map(([k, v]) => (
        <div className="contents" key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SetupHelp() {
  return (
    <Notice>
      O robô de proteção ainda não enviou dados. Ele vem no EA{" "}
      <b>TradingJournal FTMO Risk Guardian v4.20</b> (o TradingJournal Complete
      v4.10 não tem a proteção). Anexe a v4.20 ao gráfico no lugar da v4.10 —
      nunca as duas na mesma conta — e esta aba enche no próximo sync.
    </Notice>
  );
}

function GuardianNotices({ s, online }: { s: Status; online: boolean }) {
  return (
    <>
      {online ? null : (
        <Notice>
          O robô não sincroniza há mais de 30 s: os números abaixo são os do
          último sync ({new Date(s.updatedAt).toLocaleTimeString("pt-BR")}).
          Confira se o MT5 está aberto e o EA anexado — a proteção só funciona
          com o MT5 ligado.
        </Notice>
      )}
      {s.enabled ? null : (
        <Notice>
          A proteção está <b>desligada</b> nas entradas do EA (InpG_Enabled): a
          conta não está protegida.
        </Notice>
      )}
      {s.configProblem ? (
        <Notice>
          Configuração: {s.configProblem}. Novas ordens ficam bloqueadas até
          corrigir as entradas do EA.
        </Notice>
      ) : null}
      {s.mode === "monitor" ? (
        <Notice>
          Modo <b>só monitorar</b>: o robô mede e registra, mas não bloqueia
          ordens nem fecha posições.
        </Notice>
      ) : null}
      {s.mode === "protect" && !s.closeOnEmergency ? (
        <Notice>
          O fechamento automático na emergência está desligado
          (InpG_CloseOnEmergency): o robô só bloqueia novas ordens.
        </Notice>
      ) : null}
    </>
  );
}

function Locks({ s, toReset }: { s: Status; toReset: number }) {
  if (!(s.dayLocked >= 2 || s.permLocked >= 2 || s.manualLock)) {
    return null;
  }
  return (
    <Panel title="Bloqueios ativos">
      <ul className="flex flex-col gap-2 text-xs">
        {s.dayLocked >= 2 ? (
          <li>
            <StateBadge level={s.dayLocked} /> <b>Do dia</b> — sai sozinho às
            00:00 de Praga (em {countdown(toReset)}). {s.dayReason}
          </li>
        ) : null}
        {s.permLocked >= 2 ? (
          <li>
            <StateBadge level={s.permLocked} /> <b>Permanente</b> desde{" "}
            {new Date(s.permSince).toLocaleString("pt-BR")} — só sai com o
            código de desbloqueio que aparece no log do MT5. {s.permReason}
          </li>
        ) : null}
        {s.manualLock ? (
          <li>
            <b>Manual</b> — InpG_ManualLock ligado nas entradas do EA.
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}

function GuardianContent() {
  const s = useQuery(api.guardian.status, {});
  const session = useQuery(
    api.eatrade.session,
    s ? { account: s.account } : "skip"
  );
  const watch = useMutation(api.eatrade.watch);
  const now = useNow(1000);
  const account = s?.account ?? "";
  const days = useQuery(
    api.guardian.days,
    account ? { account, limit: 30 } : "skip"
  );
  const events = useQuery(
    api.guardian.events,
    account ? { account, limit: 60 } : "skip"
  );
  const watchKey = (session?.watch ?? []).join(",");

  // Keeps the EA on the 1 s sync while this tab is open (same as "Operar")
  useEffect(() => {
    if (!account) {
      return;
    }
    const beat = () => {
      watch({ account, symbols: watchKey ? watchKey.split(",") : [] }).catch(
        () => undefined
      );
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [account, watchKey, watch]);

  if (s === undefined) {
    return <p className="p-4 text-muted-foreground text-sm">A carregar…</p>;
  }
  if (s === null) {
    return (
      <div className="p-4">
        <SetupHelp />
      </div>
    );
  }
  return (
    <GuardianView
      currency={session?.info.currency ?? ""}
      days={days}
      events={events}
      now={now}
      s={s}
    />
  );
}

/** The tab itself, from data already fetched (also used by the preview). */
export function GuardianView({
  s,
  currency,
  days,
  events,
  now,
}: {
  s: Status;
  currency: string;
  days: GuardianDay[] | undefined;
  events: GuardianEventRow[] | undefined;
  now: number;
}) {
  const online = now - s.updatedAt < ONLINE_MS;
  const st = stateOf(s.state);
  const dailyFloor = s.dayStartBalance - s.dailyLimit;
  const maxFloor = s.maxRef - s.maxLimit;
  const toReset = s.nextResetAt - now;

  return (
    <div className="flex flex-col gap-4 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-lg">Proteção FTMO</h2>
          <p className="text-muted-foreground text-xs">
            #{s.account} · {s.product} ·{" "}
            {s.mode === "protect" ? "protegendo" : "só monitorando"}
          </p>
        </div>
        <span
          className={cn(
            "border px-1.5 py-0.5 font-medium text-xs",
            online
              ? "border-[var(--up)] text-[var(--up)]"
              : "border-[var(--down)] text-[var(--down)]"
          )}
        >
          {online ? "Robô online" : "Robô offline"}
        </span>
      </div>

      <GuardianNotices online={online} s={s} />

      <section
        className="flex flex-wrap items-center gap-3 border p-3"
        style={{ borderColor: st.color }}
      >
        <StateBadge large level={s.state} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{st.text}</p>
          {s.reason ? (
            <p className="text-muted-foreground text-xs">{s.reason}</p>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Saldo às 00:00 de Praga"
          value={money(s.dayStartBalance)}
        />
        <Stat
          hint={`custos de saída ${money(s.exitCost)}`}
          label="Equity estimada"
          value={money(s.estEquity)}
        />
        <Stat
          hint="a equity não pode ficar abaixo"
          label="Piso diário"
          value={money(dailyFloor)}
        />
        <Stat hint="perda máxima" label="Piso total" value={money(maxFloor)} />
        <Stat
          label="Pior uso hoje (diário)"
          value={pctText(s.worstDailyUsePct)}
        />
        <Stat label="Pior uso (total)" value={pctText(s.worstMaxUsePct)} />
        <Stat label="Posições abertas" value={String(s.positions)} />
        <Stat
          hint={s.preReset ? "vigiando a virada" : undefined}
          label="Virada do dia FTMO"
          value={countdown(toReset)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          description="Perda do dia contra o saldo das 00:00 de Praga (com o resultado aberto e os custos de saída)."
          title="Perda diária"
        >
          <LimitMeter
            block={s.blockPct}
            currency={currency}
            emergency={s.emergencyPct}
            label="Maximum Daily Loss"
            limit={s.dailyLimit}
            loss={s.dailyLoss}
            use={s.dailyUsePct}
            warn={s.warnPct}
          >
            <p className="text-muted-foreground text-xs tabular-nums">
              Se o dia virasse agora, o prejuízo aberto (
              {money(Math.max(0, s.nextDayLoss))}) seria{" "}
              {pctText(Math.max(0, s.nextDayUsePct))} do limite do dia seguinte.
              {s.preReset
                ? " Faltam menos de 3 h para a virada: o robô já vigia este número."
                : ""}
            </p>
          </LimitMeter>
        </Panel>
        <Panel
          description={`Perda contra a referência ${MAX_KIND[s.maxKind] ?? ""} (${money(s.maxRef)}).`}
          title="Perda máxima"
        >
          <LimitMeter
            block={s.blockPct}
            currency={currency}
            emergency={s.emergencyPct}
            label="Maximum Loss"
            limit={s.maxLimit}
            loss={s.maxLoss}
            use={s.maxUsePct}
            warn={s.warnPct}
          />
        </Panel>
      </div>

      <Locks s={s} toReset={toReset} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Histórico por dia">
          <DayHistory days={days} s={s} />
        </Panel>
        <Panel title="Configuração do robô">
          <Settings s={s} />
        </Panel>
      </div>

      <Panel
        description="Tudo o que o robô fez: bloqueios, ordens recusadas, fechamentos (com confirmação) e falhas."
        title="Eventos"
      >
        <Events list={events} />
      </Panel>

      <p className="text-muted-foreground text-xs">
        O robô reduz o risco, mas não garante: gaps, slippage extremo,
        desconexão ou recusa da corretora podem impedir o fechamento a tempo, e
        ordens manuais feitas direto no MT5 não passam por ele.
      </p>
    </div>
  );
}

/** Keeps a Convex error (e.g. functions not deployed yet) inside this tab. */
class GuardianErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div className="p-4">
        <Notice>
          Não foi possível abrir a aba de proteção. Se as funções do Convex
          ainda não foram publicadas, publique-as e recarregue a página.
        </Notice>
      </div>
    );
  }
}

export function GuardianPanel() {
  return (
    <div className="operar journal-palette">
      <TelegramProvider
        fallback={
          <div className="p-4">
            <Notice>
              A aba de proteção usa o banco central (Convex), que não está
              configurado nesta instalação.
            </Notice>
          </div>
        }
      >
        <GuardianErrorBoundary>
          <GuardianContent />
        </GuardianErrorBoundary>
      </TelegramProvider>
    </div>
  );
}
