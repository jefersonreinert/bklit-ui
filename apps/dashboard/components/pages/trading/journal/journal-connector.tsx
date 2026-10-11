"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { TV_ALERT_TEMPLATE } from "@/lib/journal/ingest";
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

export function JournalConnector({ settings }: { settings: Settings }) {
  const rotate = useMutation(api.journal.rotateToken);
  const removeAccount = useMutation(api.journal.deleteAccount);
  const [armed, setArmed] = useState(false);
  const base = siteUrl();
  const token = settings.token ?? "";
  const mt5Url = `${base}/journal/mt5?token=${token}`;
  const tvUrl = `${base}/journal/tradingview?token=${token}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border p-3 text-sm">
          <p className="font-medium">MetaTrader 5</p>
          <p className="text-muted-foreground text-xs">
            Último envio: {when(settings.lastMt5At)}
          </p>
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
        <Step n={1} title="MT5 → Diário (todas as operações, automático)">
          <p className="text-muted-foreground">
            No VPS com o MT5: baixe o EA, copie-o para{" "}
            <code>Arquivo → Abrir pasta de dados → MQL5/Experts</code>, compile
            no MetaEditor (F7) e arraste-o para um gráfico qualquer. Ele envia o
            histórico dos últimos 90 dias e depois cada negócio em tempo real,
            inclusive os copiados do TradingView pelo tv2mt5.
          </p>
          <Button
            className="self-start"
            nativeButton={false}
            render={
              <a download href={`${BASE_PATH}/journal/CasaBrasaJournal.mq5`} />
            }
            size="sm"
          >
            <Icon className="size-4" name="IconArrowDown" />
            Baixar CasaBrasaJournal.mq5
          </Button>
          <p className="text-muted-foreground">
            Em <b>Ferramentas → Opções → Expert Advisors</b>, marque “Permitir
            WebRequest para os URLs listados” e adicione:
          </p>
          <Copy label="URL permitido" value={base} />
          <Copy label="InpUrl do EA (webhook MT5)" value={mt5Url} />
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
      <p className="text-muted-foreground text-xs">
        Os URLs contêm o seu token secreto: não os partilhe. Os endpoints ficam
        ativos 24 h no Convex, sem servidor próprio.
      </p>
    </div>
  );
}
