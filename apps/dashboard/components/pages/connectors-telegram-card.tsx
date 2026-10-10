"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { ServiceTile } from "@/components/dashboard/service-logos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { TG_PACKAGE_VERSION, TG_TOOLS } from "@/lib/telegram/catalog";
import { TelegramLogin } from "./telegram/telegram-login";
import {
  BASE_PATH,
  Notice,
  TelegramProvider,
  type TgStatus,
  useRunTool,
  useTelegramStatus,
} from "./telegram/telegram-shared";

const FEATURES = [
  "Ler, buscar e responder conversas, grupos e canais",
  "Enviar arquivos, fotos, áudios, enquetes e mensagens agendadas",
  "Contatos, reações, figurinhas, stories, pastas e tópicos",
  "Administração de grupos, estatísticas, Business e privacidade",
];

const OPT_INS = [
  { key: "stars", label: "Stars e presentes" },
  { key: "group-calls", label: "Chamadas em grupo" },
  { key: "quick-replies", label: "Respostas rápidas (Business)" },
];

const when = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

function Settings({ status }: { status: TgStatus }) {
  const update = useMutation(api.telegram.updateSettings);
  const toggleOptIn = (key: string, on: boolean) =>
    update({
      optIn: on
        ? [...status.optIn, key]
        : status.optIn.filter((g) => g !== key),
    });
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <span className="flex items-start gap-3 text-sm">
        <Switch
          aria-label="Assistente pode enviar e alterar"
          checked={status.assistantWrites}
          onCheckedChange={(assistantWrites) => update({ assistantWrites })}
        />
        <span>
          <b>Assistente pode enviar e alterar</b>
          <span className="block text-muted-foreground text-xs">
            Desligado, o Assistente IA só lê (conversas, buscas, perfis).
            Ligado, ele pode enviar, editar e apagar — sempre pedindo
            confirmação no chat.
          </span>
        </span>
      </span>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-3">
        {OPT_INS.map((o) => (
          <span className="flex items-center gap-2 text-sm" key={o.key}>
            <Switch
              aria-label={o.label}
              checked={status.optIn.includes(o.key)}
              onCheckedChange={(on) => toggleOptIn(o.key, on)}
            />
            {o.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Recent({ status }: { status: TgStatus }) {
  if (status.recent.length === 0) {
    return null;
  }
  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        Atividade recente ({status.recent.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {status.recent.map((c) => (
          <li className="flex flex-wrap gap-x-2" key={c.id}>
            <span className={c.ok ? "text-success" : "text-destructive"}>
              {c.ok ? "✓" : "✗"}
            </span>
            <span className="font-mono">{c.tool}</span>
            <span className="text-muted-foreground">
              {c.source === "assistant" ? "assistente" : c.source} ·{" "}
              {when(c.at)}
            </span>
            {c.error ? (
              <span className="w-full text-muted-foreground">{c.error}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Connected({ status }: { status: TgStatus }) {
  const logout = useAction(api.mtproto.logout);
  const { run, busy } = useRunTool();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [armed, setArmed] = useState(false);
  const me = status.me;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Conectado como <b>{me?.name}</b>
        {me?.username ? ` (@${me.username})` : ""}
        {me?.phone
          ? ` · ${me.phone.slice(0, 3)} •••• ${me.phone.slice(-4)}`
          : ""}{" "}
        <span className="text-muted-foreground">
          desde {when(status.connectedAt)}
        </span>
      </p>
      <Settings status={status} />
      {message ? (
        <Notice tone={message.ok ? "ok" : "error"}>{message.text}</Notice>
      ) : null}
      <Recent status={status} />
      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button
          disabled={busy}
          onClick={async () => {
            const out = await run("telegram-status");
            setMessage({ ok: out.ok, text: out.text });
          }}
          size="sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconShieldCheck" />
          {busy ? "Testando…" : "Testar conexão"}
        </Button>
        <Button
          onClick={async () => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            const r = await logout({});
            setMessage({ ok: r.ok, text: r.message });
          }}
          onMouseLeave={() => setArmed(false)}
          size="sm"
          variant={armed ? "destructive" : "outline"}
        >
          {armed ? "Toque de novo para desconectar" : "Desconectar"}
        </Button>
        <Button
          nativeButton={false}
          render={<a href={`${BASE_PATH}/telegram/`} />}
          size="sm"
        >
          <Icon className="size-4" name="IconTelegram" />
          Abrir Telegram
        </Button>
      </div>
    </div>
  );
}

function Body() {
  const status = useTelegramStatus();
  if (status === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (status === null) {
    return (
      <Notice>
        Desbloqueie o painel com o código de acesso (WhatsApp, POS ou Code) para
        conectar o Telegram.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {status.connected ? (
        <Connected status={status} />
      ) : (
        <TelegramLogin status={status} />
      )}
      {!status.connected && status.lastError ? (
        <p className="text-muted-foreground text-xs">
          Último erro: {status.lastError}
        </p>
      ) : null}
    </div>
  );
}

function Header({ connected }: { connected: boolean | null }) {
  return (
    <CardHeader className="flex flex-row items-start gap-3">
      <ServiceTile brand="telegram" />
      <div className="min-w-0 flex-1">
        <CardTitle className="flex flex-wrap items-center gap-2">
          Telegram
          {connected ? (
            <Badge variant="secondary">
              <Icon name="IconCircleCheck" />
              Conectado
            </Badge>
          ) : (
            <Badge variant="outline">Não conectado</Badge>
          )}
        </CardTitle>
        <CardDescription>
          A sua conta pessoal do Telegram (MTProto, como o mcp-telegram):{" "}
          {TG_TOOLS.length} ferramentas no painel e no Assistente IA. Não é um
          bot: age como você, então respeite os termos do Telegram.
        </CardDescription>
      </div>
    </CardHeader>
  );
}

function LiveCard() {
  const status = useTelegramStatus();
  return (
    <Card>
      <Header connected={Boolean(status?.connected)} />
      <CardContent className="flex flex-col gap-4">
        <ul className="grid gap-2 text-muted-foreground text-sm sm:grid-cols-2">
          {FEATURES.map((t) => (
            <li className="flex items-center gap-2" key={t}>
              <Icon className="size-4 shrink-0" name="IconCheckmark1Small" />
              {t}
            </li>
          ))}
        </ul>
        <Body />
        <p className="text-muted-foreground text-xs">
          Ferramentas de @overpod/mcp-telegram v{TG_PACKAGE_VERSION}. A sessão
          fica só no servidor (Convex); encerre quando quiser em Telegram →
          Configurações → Dispositivos.
        </p>
      </CardContent>
    </Card>
  );
}

export function TelegramCard() {
  return (
    <TelegramProvider
      fallback={
        <Card>
          <Header connected={null} />
          <CardContent>
            <Notice>
              O Telegram usa o banco central do painel (Convex), que não está
              configurado nesta instalação.
            </Notice>
          </CardContent>
        </Card>
      }
    >
      <LiveCard />
    </TelegramProvider>
  );
}
