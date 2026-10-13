"use client";

import { useMutation, useQuery } from "convex/react";
import { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { mt5Symbol } from "@/lib/journal/lot";
import { cn } from "@/lib/utils";
import { Notice, TelegramProvider } from "../../telegram/telegram-shared";
import { Panel, Stat } from "../journal/journal-kit";
import { money, tone } from "../journal/journal-summary";
import { OrderTicket } from "./order-ticket";
import { Positions } from "./positions";
import { LinkProvider, StatusText } from "./trade-kit";

/**
 * "Operar": lot calculator, orders and position management on the MT5
 * account, run by the TradingJournal Complete EA (v4.10). While this screen
 * is open the EA syncs every second; otherwise every 15 s.
 */

/** The EA counts as online if it synced in the last 20 s (screen open). */
const ONLINE_MS = 20_000;
/** A sync this recent means the EA is on the 1 s interval. */
const LINKED_MS = 4000;
const HEARTBEAT_MS = 30_000;

function useNow(every = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

const KIND: Record<string, string> = {
  open: "Abrir",
  close: "Fechar",
  modify: "SL/TP",
  cancel: "Cancelar",
};

function Activity({ account }: { account: string }) {
  const list = useQuery(api.eatrade.commands, { account });
  if (!list?.length) {
    return null;
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl border text-xs">
      {list.slice(0, 10).map((c) => (
        <li
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2"
          key={c.id}
        >
          <span className="text-muted-foreground tabular-nums">
            {new Date(c.createdAt).toLocaleTimeString("pt-BR")}
          </span>
          <span className="font-medium">
            {KIND[c.kind] ?? c.kind}
            {c.kind === "open"
              ? ` ${c.side === "buy" ? "compra" : "venda"} ${c.volume} ${c.symbol}`
              : ` #${c.ticket}${c.volume ? ` (${c.volume})` : ""}`}
          </span>
          <StatusText status={c.status} />
          {c.result && !c.result.ok ? (
            <span className="w-full text-[var(--down)]">
              {c.result.message}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SetupHelp({ reason }: { reason: "no-ea" | "disabled" | "demo" }) {
  return (
    <Notice>
      {reason === "no-ea" ? (
        <>
          O EA ainda não sincronizou. Instale o TradingJournal Complete{" "}
          <b>v4.10</b> (Diário → Conector → Baixar) e anexe-o a um gráfico no
          MT5. Se já está a correr, confira o <b>InpUrl</b> (URL do webhook com
          o token) e se o URL do Convex está liberado no WebRequest; os erros
          aparecem na aba Experts do MT5.
        </>
      ) : null}
      {reason === "disabled" ? (
        <>
          O EA está ligado mas não aceita ordens do painel. No MT5, abra as
          entradas do EA e ative <b>InpAllowTrading</b>. Os limites (lote
          máximo, risco máximo e só demo) também ficam nas entradas.
        </>
      ) : null}
      {reason === "demo" ? (
        <>
          Esta conta é real e o EA está em modo <b>só demo</b> (InpDemoOnly): as
          ordens do painel ficam bloqueadas.
        </>
      ) : null}
    </Notice>
  );
}

function TradeContent({ chartSymbol }: { chartSymbol: string }) {
  const session = useQuery(api.eatrade.session, {});
  const watch = useMutation(api.eatrade.watch);
  const now = useNow(1000);
  const [picked, setPicked] = useState("");

  const account = session?.account ?? "";
  const symbols = session?.symbols ?? [];
  const symbol =
    picked || mt5Symbol(chartSymbol, symbols) || symbols[0] || "EURUSD";
  const positionSymbols = useMemo(
    () => [...new Set((session?.positions ?? []).map((p) => p.symbol))],
    [session?.positions]
  );
  const watched = useMemo(
    () => [...new Set([symbol, ...positionSymbols])],
    [symbol, positionSymbols]
  );
  const watchKey = watched.join(",");

  // Tell the EA what to quote, and keep it polling fast while open
  useEffect(() => {
    if (!account) {
      return;
    }
    const beat = () => {
      watch({ account, symbols: watchKey.split(",") }).catch(() => undefined);
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [account, watchKey, watch]);

  const specs = useQuery(
    api.eatrade.specs,
    account ? { account, symbols: watched } : "skip"
  );

  if (session === undefined) {
    return <p className="p-4 text-muted-foreground text-sm">A carregar…</p>;
  }
  if (session === null) {
    return (
      <div className="p-4">
        <SetupHelp reason="no-ea" />
      </div>
    );
  }
  const online = now - session.updatedAt < ONLINE_MS;
  const linked = now - session.updatedAt < LINKED_MS;
  const { info, limits } = session;
  let blocked: "disabled" | "demo" | null = null;
  if (!limits.allowTrading) {
    blocked = "disabled";
  } else if (limits.demoOnly && !info.demo) {
    blocked = "demo";
  }
  const floating = info.equity - info.balance;

  return (
    <div className="flex flex-col gap-4 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-lg">Operar</h2>
          <p className="text-muted-foreground text-xs">
            #{session.account} · {session.server} ·{" "}
            {info.demo ? "demo" : "conta real"} · alavancagem 1:{info.leverage}
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
          {online ? "EA online" : "EA offline"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Saldo" value={`${money(info.balance)} ${info.currency}`} />
        <Stat
          className={tone(floating)}
          hint={`flutuante ${money(floating, true)}`}
          label="Equity"
          value={money(info.equity)}
        />
        <Stat label="Margem livre" value={money(info.freeMargin)} />
        <Stat
          hint={limits.demoOnly ? "só demo" : undefined}
          label="Limites do EA"
          value={`${limits.maxLot} lote · ${limits.maxRiskPct}%`}
        />
      </div>

      {blocked ? <SetupHelp reason={blocked} /> : null}
      {online ? null : (
        <Notice>
          O EA não sincroniza há mais de 20 s. Confirme que o MT5 está aberto e
          o EA anexado; as ordens enviadas agora expiram após 10 s sem serem
          executadas.
        </Notice>
      )}
      {info.tradeAllowed ? null : (
        <Notice>
          O botão <b>Algo Trading</b> do MT5 está desligado: o EA não consegue
          executar ordens.
        </Notice>
      )}

      <LinkProvider value={linked}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
          <Panel
            description="Lote pelo risco em % do saldo, com o spread e o valor do tick do MT5."
            title="Nova ordem"
          >
            <OrderTicket
              onSymbol={setPicked}
              session={session}
              spec={specs?.find((s) => s.symbol === symbol)}
              symbol={symbol}
            />
          </Panel>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title="Posições e ordens">
              <Positions session={session} specs={specs ?? []} />
            </Panel>
            <Panel
              description="Cada ordem é executada uma única vez; as que esperam mais de 10 s expiram."
              title="Atividade"
            >
              <Activity account={session.account} />
            </Panel>
          </div>
        </div>
      </LinkProvider>
    </div>
  );
}

/** Keeps a Convex error (e.g. functions not deployed yet) inside this panel. */
class TradeErrorBoundary extends Component<
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
          Não foi possível abrir o painel de operações. Se as funções do Convex
          ainda não foram publicadas (npx convex deploy), publique-as e
          recarregue a página.
        </Notice>
      </div>
    );
  }
}

export function TradePanel({ chartSymbol }: { chartSymbol: string }) {
  return (
    <div className="operar journal-palette">
      <TelegramProvider
        fallback={
          <div className="p-4">
            <Notice>
              O painel de operações usa o banco central (Convex), que não está
              configurado nesta instalação.
            </Notice>
          </div>
        }
      >
        <TradeErrorBoundary>
          <TradeContent chartSymbol={chartSymbol} />
        </TradeErrorBoundary>
      </TelegramProvider>
    </div>
  );
}
