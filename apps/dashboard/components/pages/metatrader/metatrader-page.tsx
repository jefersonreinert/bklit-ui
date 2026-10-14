"use client";

import { useMutation } from "convex/react";
import { type ReactNode, useState } from "react";
import { PanelUnlock } from "@/components/dashboard/panel-unlock";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { MT_TOOLS } from "@/lib/metatrader/catalog";
import { BASE_PATH } from "../telegram/telegram-shared";
import { MtDashboard } from "./mt-dashboard";
import { MtHistory } from "./mt-history";
import { MtMarket } from "./mt-market";
import { MtQuotes } from "./mt-quotes";
import {
  ConvexArea,
  type MtStatus,
  Notice,
  useMtStatus,
  when,
} from "./mt-shared";
import { MtTools } from "./mt-tools";
import { MtTrade } from "./mt-trade";

type Tab =
  | "dashboard"
  | "trade"
  | "market"
  | "history"
  | "quotes"
  | "tools"
  | "log";

const TABS: { value: Tab; label: string }[] = [
  { value: "dashboard", label: "Conta" },
  { value: "trade", label: "Negociar" },
  { value: "market", label: "Mercado" },
  { value: "history", label: "Histórico" },
  { value: "quotes", label: "Cotações" },
  { value: "tools", label: `Ferramentas (${MT_TOOLS.length})` },
  { value: "log", label: "Registo" },
];

function Log({ status }: { status: MtStatus }) {
  const clear = useMutation(api.metatrader.clearLog);
  if (status.recent.length === 0) {
    return <p className="text-muted-foreground text-sm">Sem chamadas ainda.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y rounded-xl border text-sm">
        {status.recent.map((c) => (
          <li
            className="flex flex-wrap items-baseline gap-x-2 px-3 py-2"
            key={c.id}
          >
            <span className={c.ok ? "text-success" : "text-destructive"}>
              {c.ok ? "✓" : "✗"}
            </span>
            <span className="font-mono">{c.tool}</span>
            {c.args ? (
              <span className="font-mono text-muted-foreground text-xs">
                {c.args}
              </span>
            ) : null}
            <span className="ml-auto text-muted-foreground text-xs">
              {c.source === "assistant" ? "assistente" : "painel"} · {c.ms} ms ·{" "}
              {when(c.at)}
            </span>
            {c.error ? (
              <span className="w-full text-muted-foreground text-xs">
                {c.error}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <Button
        className="self-end"
        onClick={() => clear({})}
        size="sm"
        variant="ghost"
      >
        Limpar registo
      </Button>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="flex flex-col items-start gap-3">
      <Notice>
        O MetaTrader ainda não está ligado. Rode o metatrader-mcp-server no
        PC/VPS com o MT5 e indique o endereço em Conectores → MetaTrader.
      </Notice>
      <Button
        nativeButton={false}
        render={<a href={`${BASE_PATH}/conectores/`} />}
        size="sm"
      >
        Ir para Conectores
      </Button>
    </div>
  );
}

function Workspace() {
  const status = useMtStatus();
  const [tab, setTab] = useState<Tab>("dashboard");
  if (status === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (status === null) {
    return <PanelUnlock what="usar o MetaTrader" />;
  }
  if (!status.configured) {
    return <NotConfigured />;
  }
  const views: Record<Tab, ReactNode> = {
    dashboard: <MtDashboard canTrade={status.allowTrading} />,
    trade: <MtTrade canTrade={status.allowTrading} />,
    market: <MtMarket hasRest={Boolean(status.restUrl)} />,
    history: <MtHistory />,
    quotes: <MtQuotes url={status.quoteUrl} />,
    tools: (
      <MtTools
        canTrade={status.allowTrading}
        serverTools={status.serverTools}
      />
    ),
    log: <Log status={status} />,
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar max-w-full overflow-x-auto">
          <Tabs onValueChange={(v) => setTab(v as Tab)} value={tab}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <p className="text-muted-foreground text-xs">
          {status.url ? new URL(status.url).host : ""}
          {status.lastError ? " · último erro registado" : ""}
        </p>
      </div>
      {views[tab]}
    </div>
  );
}

export function MetatraderPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <ConvexArea
        fallback={
          <Notice>
            O MetaTrader usa o banco central do painel (Convex), que não está
            configurado nesta instalação.
          </Notice>
        }
      >
        <Workspace />
      </ConvexArea>
    </div>
  );
}
