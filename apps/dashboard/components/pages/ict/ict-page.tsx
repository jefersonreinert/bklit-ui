"use client";

import { ConvexProvider, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import {
  MetricTile,
  type MetricTone,
} from "@/components/dashboard/metric-tile";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { formatDateTime, timeAgo } from "@/lib/ict/format";
import { ICT_ACCOUNT, type MonitorStatus, STATUS_LABEL } from "@/lib/ict/types";
import { convexClient, useSyncStatus } from "@/lib/sync/convex-client";
import { cn } from "@/lib/utils";
import { IctFeed } from "./ict-feed";
import { IctSettingsSheet } from "./ict-settings";
import type { FeedPost } from "./post-card";

type Overview = NonNullable<FunctionReturnType<typeof api.ict.overview>>;
type Diagnostics = NonNullable<FunctionReturnType<typeof api.ict.diagnostics>>;

const STATUS_TONE: Record<MonitorStatus, string> = {
  idle: "bg-success",
  syncing: "bg-primary animate-pulse",
  paused: "bg-muted-foreground",
  auth_error: "bg-destructive",
  rate_limited: "bg-warning",
  unavailable: "bg-warning",
  not_configured: "bg-destructive",
  error: "bg-destructive",
};

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <ChartCard description={text} title={title}>
      <span />
    </ChartCard>
  );
}

function StatusLine({ o }: { o: Overview }) {
  const status = (o.state?.status ??
    (o.configured.x ? "idle" : "not_configured")) as MonitorStatus;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <span
          className={cn(
            "size-2 rounded-full",
            STATUS_TONE[status] ?? "bg-muted"
          )}
        />
        {STATUS_LABEL[status] ?? status}
      </span>
      <span title={formatDateTime(o.state?.lastSuccessAt)}>
        Última sincronização: {timeAgo(o.state?.lastSuccessAt)}
      </span>
      <span title={formatDateTime(o.state?.lastPostAt)}>
        Última publicação: {timeAgo(o.state?.lastPostAt)}
      </span>
      {o.state?.lastErrorAt ? (
        <span className="text-destructive" title={o.state.lastError ?? ""}>
          Última falha: {timeAgo(o.state.lastErrorAt)}
        </span>
      ) : null}
    </div>
  );
}

function Controls({ o, onSettings }: { o: Overview; onSettings: () => void }) {
  const update = useMutation(api.ict.updateSettings);
  const syncNow = useMutation(api.ict.syncNow);
  const analyzePending = useMutation(api.ict.analyzePending);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-2 text-sm">
        <Switch
          aria-label="Monitorização"
          checked={o.settings.enabled}
          onCheckedChange={(enabled) => update({ enabled })}
        />
        Monitorização
      </span>
      <span className="flex items-center gap-2 text-sm">
        <Switch
          aria-label="Análise por IA"
          checked={o.settings.aiEnabled}
          onCheckedChange={(aiEnabled) => update({ aiEnabled })}
        />
        Análise por IA
      </span>
      <Button
        disabled={busy || o.state?.status === "syncing"}
        onClick={async () => {
          setBusy(true);
          await syncNow({}).finally(() => setBusy(false));
        }}
        size="sm"
        variant="outline"
      >
        <Icon className="size-4" name="IconArrowRotateClockwise" />
        Atualizar agora
      </Button>
      {o.counts.unanalyzed && o.settings.aiEnabled ? (
        <Button onClick={() => analyzePending({})} size="sm" variant="ghost">
          <Icon className="size-4" name="IconSparklesSoft" />
          Analisar pendentes
        </Button>
      ) : null}
      <Button onClick={onSettings} size="sm" variant="ghost">
        <Icon className="size-4" name="IconSettingsGear1" />
        Configurar
      </Button>
    </div>
  );
}

function xTone(o: Overview): MetricTone {
  if (!o.configured.x) {
    return "bad";
  }
  const s = o.state?.status;
  if (s === "auth_error" || s === "error") {
    return "bad";
  }
  if (s === "rate_limited" || s === "unavailable") {
    return "warn";
  }
  return o.state?.lastSuccessAt ? "good" : "neutral";
}

function grokTone(o: Overview, d: Diagnostics | null | undefined): MetricTone {
  if (!o.configured.grok) {
    return "bad";
  }
  return d?.grok === "recent_errors" ? "warn" : "good";
}

function Kpis({ o, d }: { o: Overview; d: Diagnostics | null | undefined }) {
  const xLabel = o.configured.x
    ? (STATUS_LABEL[o.state?.status as MonitorStatus] ??
      "A aguardar 1ª sincronização")
    : "Não configurada";
  let grokLabel = "Não configurada";
  if (o.configured.grok) {
    grokLabel = d?.grok === "recent_errors" ? "Erros recentes" : "Ligada";
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <MetricTile
        icon="IconNewspaper"
        label="Publicações guardadas"
        value={String(o.counts.total)}
      />
      <MetricTile
        icon="IconClock"
        label="Últimas 24 h"
        value={String(o.counts.last24h)}
      />
      <MetricTile
        hint={o.counts.failed ? `${o.counts.failed} falharam` : undefined}
        icon="IconSparklesSoft"
        label="Por analisar"
        tone={o.counts.unanalyzed ? "warn" : "good"}
        value={String(o.counts.unanalyzed)}
      />
      <MetricTile
        icon="IconStar"
        label="Importantes"
        value={String(o.counts.important)}
      />
      <MetricTile
        hint={
          o.state?.rateRemaining !== null &&
          o.state?.rateRemaining !== undefined
            ? `${o.state.rateRemaining} pedidos restantes na janela`
            : undefined
        }
        icon="IconGlobe"
        label="API do X"
        tone={xTone(o)}
        value={xLabel}
      />
      <MetricTile
        hint={o.state?.grokModel ?? undefined}
        icon="IconAgents"
        label="Grok (xAI)"
        tone={grokTone(o, d)}
        value={grokLabel}
      />
    </div>
  );
}

const DIAG_TEXT: Record<string, string> = {
  ok: "OK",
  never_ran: "Ainda não executou",
  late: "Atrasado — o agendador do Convex pode estar parado",
  not_configured: "Chave não configurada no Convex",
  recent_errors: "Erros na última hora",
};

function DiagnosticsCard({ d }: { d: Diagnostics }) {
  const rows: [string, string][] = [
    ["Base de dados (Convex)", DIAG_TEXT[d.database] ?? d.database],
    ["Serviço agendado (cron)", DIAG_TEXT[d.scheduler] ?? d.scheduler],
    ["API do X", DIAG_TEXT[d.x] ?? STATUS_LABEL[d.x as MonitorStatus] ?? d.x],
    ["Grok (xAI)", DIAG_TEXT[d.grok] ?? d.grok],
  ];
  return (
    <ChartCard
      description="Onde está o problema, quando houver."
      title="Diagnóstico"
    >
      <dl className="flex flex-col gap-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div className="flex justify-between gap-3" key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {d.lastError ? (
        <p className="mt-3 break-words text-destructive text-xs">
          X: {d.lastError}
        </p>
      ) : null}
      {d.lastGrokError ? (
        <p className="mt-1 break-words text-destructive text-xs">
          Grok: {d.lastGrokError}
        </p>
      ) : null}
    </ChartCard>
  );
}

function AlertsCard({ o }: { o: Overview }) {
  const markRead = useMutation(api.ict.markAlertsRead);
  const unread = o.alerts.filter((a) => !a.read).length;
  return (
    <ChartCard
      action={
        unread ? (
          <Button onClick={() => markRead({})} size="xs" variant="ghost">
            Marcar lidos
          </Button>
        ) : undefined
      }
      description={unread ? `${unread} por ler` : "Sem alertas novos"}
      title="Alertas"
    >
      {o.alerts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Defina os critérios em Configurar (palavras-chave, conceitos,
          categorias ou relevância).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {o.alerts.slice(0, 8).map((a) => (
            <li className={cn("text-sm", a.read && "opacity-60")} key={a.id}>
              <p className="line-clamp-2">{a.excerpt}</p>
              <p className="text-muted-foreground text-xs">
                {a.reasons.join(" · ")} · {timeAgo(a.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

function Monitor() {
  const o = useQuery(api.ict.overview);
  const d = useQuery(api.ict.diagnostics);
  const [settings, setSettings] = useState(false);

  if (o === undefined) {
    return <Notice text="A ligar à base de dados…" title="A carregar" />;
  }
  if (o === null) {
    return (
      <Notice
        text="Desbloqueie o painel com o código de acesso (WhatsApp, POS ou Code) para ver o monitor."
        title="Painel bloqueado"
      />
    );
  }
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-xl tracking-tight">
              ICT Monitor
            </h2>
            <p className="text-muted-foreground text-sm">
              {ICT_ACCOUNT.name} ·{" "}
              <a
                className="underline-offset-2 hover:underline"
                href={ICT_ACCOUNT.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                @{ICT_ACCOUNT.username}
              </a>
            </p>
          </div>
          <Controls o={o} onSettings={() => setSettings(true)} />
        </div>
        <StatusLine o={o} />
        {o.configured.x ? null : (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            A chave da API do X ainda não foi configurada no servidor (variável{" "}
            <code>X_BEARER_TOKEN</code> no Convex). Nada é recolhido até lá.
          </p>
        )}
        {o.configured.grok ? null : (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            A análise por IA precisa da variável <code>XAI_API_KEY</code> no
            Convex. As publicações são guardadas na mesma.
          </p>
        )}
      </div>

      <Kpis d={d} o={o} />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <IctFeed
            hasPosts={o.counts.total > 0}
            interests={o.settings.interests}
            latestId={(o.latest as FeedPost | null)?.postId ?? null}
          />
        </div>
        <div className="flex flex-col gap-4">
          <AlertsCard o={o} />
          {d ? <DiagnosticsCard d={d} /> : null}
          {o.state?.syncs ? (
            <p className="text-muted-foreground text-xs">
              {o.state.syncs} sincronizações · {o.state.analysesDone} análises ·{" "}
              {o.state.analysesFailed} falhas de análise
            </p>
          ) : null}
        </div>
      </div>

      <IctSettingsSheet
        onClose={() => setSettings(false)}
        open={settings}
        settings={o.settings}
      />
    </div>
  );
}

/**
 * The Inner Circle Trader monitor. Everything comes from Convex: the
 * cron collects and analyses on the server, this page only subscribes,
 * so new posts appear here without reloading.
 */
export function IctPage() {
  const status = useSyncStatus();
  const client = convexClient();
  if (!client || status === "off") {
    return (
      <Notice
        text="Este monitor usa a base de dados do painel (Convex), que não está configurada nesta instalação."
        title="ICT Monitor indisponível"
      />
    );
  }
  return (
    <ConvexProvider client={client}>
      <Monitor />
    </ConvexProvider>
  );
}
