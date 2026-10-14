"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { PanelUnlock } from "@/components/dashboard/panel-unlock";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { TV_ALERT_TEMPLATE } from "@/lib/journal/ingest";
import {
  NOTE_FIELD_LABEL,
  NOTE_FIELDS,
  type NoteField,
} from "@/lib/journal/note-fields";
import { BASE_PATH } from "../../telegram/telegram-shared";

/**
 * TradingView ↔ MetaTrader connector setup: the always-on webhook URLs
 * (Convex HTTP), the MT5 Expert Advisor and the TradingView alert template.
 */

type Settings = NonNullable<FunctionReturnType<typeof api.journal.settings>>;

/** https://x.convex.cloud → https://x.convex.site (HTTP actions). */
const TRAILING_SLASH = /\/$/;

export function siteUrl() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  return url
    .replace(".convex.cloud", ".convex.site")
    .replace(TRAILING_SLASH, "");
}

const when = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "nunca";

function Copy({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-sm">{label}</span>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-lg border bg-muted/30 px-2 py-1.5 text-xs">
          {value}
        </code>
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
          size="sm"
          variant="outline"
        >
          {done ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background text-xs">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

function RemoveAccount({
  login,
  onRemove,
}: {
  login: string;
  onRemove: () => void;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onRemove();
      }}
      onMouseLeave={() => setArmed(false)}
      size="sm"
      variant={armed ? "destructive" : "ghost"}
    >
      {armed
        ? `Toque de novo: apaga as operações da conta ${login}`
        : `Apagar conta ${login}`}
    </Button>
  );
}

/** Editable option lists of the structured note fields (one per line). */
function NoteOptionsEditor({ settings }: { settings: Settings }) {
  const save = useMutation(api.journal.saveNoteOptions);
  const [field, setField] = useState<NoteField>("psychology");
  const [text, setText] = useState(settings.noteOptions[field].join("\n"));
  const [saved, setSaved] = useState(false);
  return (
    <section className="flex flex-col gap-2 border p-3 text-sm">
      <p className="font-medium">Campos das notas (como no Notion)</p>
      <p className="text-muted-foreground text-xs">
        Opções de Bias, Trade type, Entry timeframe, Entry macro, News impact e
        Psychology no editor de notas. Uma opção por linha.
      </p>
      <select
        aria-label="Campo"
        className="h-8 w-fit border bg-background px-2"
        onChange={(e) => {
          const f = e.target.value as NoteField;
          setField(f);
          setText(settings.noteOptions[f].join("\n"));
          setSaved(false);
        }}
        value={field}
      >
        {NOTE_FIELDS.map((f) => (
          <option key={f} value={f}>
            {NOTE_FIELD_LABEL[f]}
          </option>
        ))}
      </select>
      <textarea
        aria-label={`Opções de ${NOTE_FIELD_LABEL[field]}`}
        className="min-h-32 border bg-background p-2 font-mono text-xs"
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        value={text}
      />
      <div className="flex items-center gap-2">
        <Button
          onClick={async () => {
            await save({ field, options: text.split("\n") });
            setSaved(true);
          }}
          size="sm"
        >
          Guardar opções
        </Button>
        <Button
          onClick={async () => {
            await save({ field, options: [] });
            setSaved(false);
          }}
          size="sm"
          variant="ghost"
        >
          Repor padrão
        </Button>
        {saved ? (
          <span className="text-muted-foreground text-xs">Guardado</span>
        ) : null}
      </div>
    </section>
  );
}

/** Last statistics received from the TradingJournal Complete EA, per account. */
function StatsStatus() {
  const rows = useQuery(api.journal.accountStats, {});
  if (!rows?.length) {
    return (
      <p className="text-muted-foreground text-xs">
        Estatísticas da conta: nenhuma ainda (só o EA TradingJournal Complete as
        envia).
      </p>
    );
  }
  return (
    <>
      {rows.map((r) => (
        <p className="text-muted-foreground text-xs" key={r.account}>
          Estatísticas da conta {r.account}: {when(r.receivedAt)}
        </p>
      ))}
    </>
  );
}

export function JournalConnector({ settings }: { settings: Settings }) {
  const rotate = useMutation(api.journal.rotateToken);
  const removeAccount = useMutation(api.journal.deleteAccount);
  const [armed, setArmed] = useState(false);
  const base = siteUrl();
  const token = settings.token ?? "";
  const mt5Url = `${base}/journal/mt5?token=${token}`;
  const tvUrl = `${base}/journal/tradingview?token=${token}`;
  // The token is the connectors' secret: only after the access code
  if (!settings.panel) {
    return <PanelUnlock what="ver o token e os links dos conectores" />;
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border p-3 text-sm">
          <p className="font-medium">MetaTrader 5</p>
          <p className="text-muted-foreground text-xs">
            Último negócio ou estatística: {when(settings.lastMt5At)}
          </p>
          <StatsStatus />
          {settings.accounts.map((a) => (
            <p
              className="mt-1 flex items-center justify-between gap-2 text-xs"
              key={a.login}
            >
              <span>
                Conta {a.login} · {a.server} {a.name ? `· ${a.name}` : ""}
              </span>
            </p>
          ))}
        </div>
        <div className="rounded-xl border p-3 text-sm">
          <p className="font-medium">TradingView</p>
          <p className="text-muted-foreground text-xs">
            Último alerta: {when(settings.lastTvAt)}
          </p>
        </div>
      </div>

      <ol className="flex flex-col gap-5">
        <Step n={1} title="MT5 → Diário (EA TradingJournal Complete)">
          <p className="text-muted-foreground">
            O EA recomendado (Golden Bullet v4) envia o histórico e cada negócio
            em tempo real, com R:R planejado, risco, pontos, duração e mercado.
            A cada 5 min envia também saldo, equity, margem, depósitos, metas
            semanal e mensal: é o card “Conta MT5” do Resumo.
          </p>
          <ol className="ml-4 list-decimal text-muted-foreground">
            <li>
              Baixe o .zip e copie a pasta <code>MQL5</code> para a pasta de
              dados do terminal (<b>Arquivo → Abrir pasta de dados</b>),
              juntando-a à que já existe.
            </li>
            <li>
              No MetaEditor, abra{" "}
              <code>Experts/Golden Bullet/TradingJournal_Complete.mq5</code> e
              compile (F7).
            </li>
            <li>
              Em <b>Ferramentas → Opções → Expert Advisors</b>, marque “Permitir
              WebRequest para os URLs listados” e adicione o URL permitido
              abaixo.
            </li>
            <li>
              Arraste o EA para um gráfico, cole o webhook MT5 em{" "}
              <code>InpUrl</code> e escolha o tipo de conta e as metas.
            </li>
          </ol>
          <Button
            className="self-start"
            nativeButton={false}
            render={
              <a
                download
                href={`${BASE_PATH}/journal/GoldenBullet-TradingJournal-MT5.zip`}
              />
            }
            size="sm"
          >
            <Icon className="size-4" name="IconArrowDown" />
            Baixar TradingJournal Complete (.zip)
          </Button>
          <Copy label="URL permitido" value={base} />
          <Copy label="InpUrl do EA (webhook MT5)" value={mt5Url} />
          <details className="text-muted-foreground">
            <summary className="cursor-pointer">
              Versão simples (um ficheiro, só negócios)
            </summary>
            <p className="mt-2">
              O CasaBrasaJournal.mq5 envia só os negócios dos últimos 90 dias e
              os novos em tempo real, sem estatísticas da conta. Usa o mesmo
              InpUrl. Não ligue os dois EAs na mesma conta.
            </p>
            <Button
              className="mt-2"
              nativeButton={false}
              render={
                <a
                  download
                  href={`${BASE_PATH}/journal/CasaBrasaJournal.mq5`}
                />
              }
              size="sm"
              variant="outline"
            >
              <Icon className="size-4" name="IconArrowDown" />
              Baixar CasaBrasaJournal.mq5
            </Button>
          </details>
        </Step>
        <Step n={2} title="TradingView → Diário (alertas e sinais)">
          <p className="text-muted-foreground">
            Num alerta (de estratégia ou de indicador), ative <b>Webhook URL</b>{" "}
            em Notificações e cole o endereço abaixo. No campo Mensagem use o
            modelo; texto livre como “BUY EURUSD @ 1.085” também é aceite. Os
            webhooks do TradingView exigem um plano pago.
          </p>
          <Copy label="Webhook URL" value={tvUrl} />
          <Copy label="Mensagem do alerta" value={TV_ALERT_TEMPLATE} />
        </Step>
        <Step n={3} title="Copiar ordens do TradingView para o MT5 (opcional)">
          <p className="text-muted-foreground">
            Para que as ordens dadas no TradingView sejam executadas no MT5, use
            o{" "}
            <a
              className="underline"
              href="https://github.com/abhidp/tradingview-to-metatrader5"
              rel="noreferrer"
              target="_blank"
            >
              tradingview-to-metatrader5
            </a>{" "}
            no mesmo VPS Windows (proxy local + MT5). Com o EA ligado, tudo o
            que ele executar entra no diário sozinho.
          </p>
        </Step>
      </ol>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          onClick={async () => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            await rotate({});
          }}
          onMouseLeave={() => setArmed(false)}
          size="sm"
          variant={armed ? "destructive" : "outline"}
        >
          {armed
            ? "Toque de novo: os URLs antigos deixam de funcionar"
            : "Gerar novo token"}
        </Button>
        {settings.accounts.map((a) => (
          <RemoveAccount
            key={a.login}
            login={a.login}
            onRemove={() => removeAccount({ account: a.login })}
          />
        ))}
      </div>
      <NoteOptionsEditor settings={settings} />
      <p className="text-muted-foreground text-xs">
        Os URLs contêm o seu token secreto: não os partilhe. Os endpoints ficam
        ativos 24 h no Convex, sem servidor próprio.
      </p>
    </div>
  );
}
