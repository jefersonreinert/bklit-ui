"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { PanelUnlock } from "@/components/dashboard/panel-unlock";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { MT_TOOLS } from "@/lib/metatrader/catalog";
import {
  ConvexArea,
  type MtStatus,
  Notice,
  useMtStatus,
  when,
} from "./metatrader/mt-shared";
import { BASE_PATH } from "./telegram/telegram-shared";

/**
 * MetaTrader 5 through github.com/jefersonreinert/metatrader-mcp-server:
 * the server runs next to the MT5 terminal (Windows PC/VPS); here goes its
 * address, the proxy's auth headers and the trading switches.
 */

const FEATURES = [
  "Conta: saldo, capital, margem, alavancagem",
  "Ordens a mercado e pendentes, SL/TP, fechar e cancelar",
  "Preços, velas, símbolos e histórico de negócios/ordens",
  "Cotações ao vivo (WebSocket) e Assistente IA",
];

type Transport = "streamable-http" | "sse";

function ConfigForm({
  status,
  onSaved,
}: {
  status: MtStatus;
  onSaved: () => void;
}) {
  const save = useMutation(api.metatrader.saveConfig);
  const [url, setUrl] = useState(status.url ?? "");
  const [transport, setTransport] = useState<Transport>(status.transport);
  const [headers, setHeaders] = useState("");
  const [keepHeaders, setKeepHeaders] = useState(status.headerNames.length > 0);
  const [restUrl, setRestUrl] = useState(status.restUrl ?? "");
  const [quoteUrl, setQuoteUrl] = useState(status.quoteUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onUrl = (v: string) => {
    setUrl(v);
    if (v.trim().endsWith("/sse")) {
      setTransport("sse");
    } else if (v.trim().endsWith("/mcp")) {
      setTransport("streamable-http");
    }
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await save({
            url,
            transport,
            headers: keepHeaders ? null : headers,
            restUrl,
            quoteUrl,
          });
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falhou.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Servidor MCP</span>
        <Input
          aria-label="Endereço do servidor MCP"
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://mt5.seudominio.com/mcp"
          required
          value={url}
        />
        <span className="text-muted-foreground text-xs">
          …/mcp com <code>--transport streamable-http</code> (recomendado) ou
          …/sse com o padrão do servidor.
        </span>
      </div>
      <div className="flex gap-1 rounded-lg border p-0.5 text-sm">
        {(["streamable-http", "sse"] as const).map((t) => (
          <button
            className={`flex-1 rounded-md px-2 py-1 ${transport === t ? "bg-muted font-semibold" : ""}`}
            key={t}
            onClick={() => setTransport(t)}
            type="button"
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Cabeçalhos de autenticação</span>
        {keepHeaders ? (
          <span className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            Guardados no servidor: {status.headerNames.join(", ")}
            <Button
              onClick={() => setKeepHeaders(false)}
              size="xs"
              type="button"
              variant="ghost"
            >
              Trocar
            </Button>
          </span>
        ) : (
          <>
            <Textarea
              className="font-mono text-xs"
              onChange={(e) => setHeaders(e.target.value)}
              placeholder={
                "Authorization: Bearer …\nCF-Access-Client-Id: …\nCF-Access-Client-Secret: …"
              }
              rows={3}
              value={headers}
            />
            <span className="text-muted-foreground text-xs">
              Um por linha. O servidor MCP não tem autenticação própria: ponha-o
              atrás de um proxy (Cloudflare Tunnel + Access, Caddy, nginx) e
              coloque aqui o que ele exige. Ficam só no servidor (Convex).
            </span>
          </>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Opcional: API HTTP e cotações ao vivo
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span>API HTTP (metatrader-http-server)</span>
            <Input
              aria-label="Endereço da API HTTP"
              onChange={(e) => setRestUrl(e.target.value)}
              placeholder="https://mt5-api.seudominio.com"
              value={restUrl}
            />
            <span className="text-muted-foreground text-xs">
              Para velas por datas e detalhes do símbolo (só existem na API
              HTTP). Usa os mesmos cabeçalhos.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span>Cotações (metatrader-quote-server)</span>
            <Input
              aria-label="Endereço das cotações"
              onChange={(e) => setQuoteUrl(e.target.value)}
              placeholder="wss://mt5-quotes.seudominio.com"
              value={quoteUrl}
            />
            <span className="text-muted-foreground text-xs">
              O navegador liga-se direto (wss://); cabeçalhos não se aplicam.
            </span>
          </div>
        </div>
      </details>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button className="self-end" disabled={saving} size="sm" type="submit">
        {saving ? "A guardar…" : "Guardar"}
      </Button>
    </form>
  );
}

function Switches({ status }: { status: MtStatus }) {
  const set = useMutation(api.metatrader.setTrading);
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3 text-sm">
      <span className="flex items-start gap-3">
        <Switch
          aria-label="Permitir ordens pelo painel"
          checked={status.allowTrading}
          onCheckedChange={(allowTrading) => set({ allowTrading })}
        />
        <span>
          <b>Permitir ordens pelo painel</b>
          <span className="block text-muted-foreground text-xs">
            Abrir, modificar, fechar e cancelar na página MetaTrader (cada ordem
            pede confirmação). Desligado, só consulta.
          </span>
        </span>
      </span>
      <span className="flex items-start gap-3 border-t pt-3">
        <Switch
          aria-label="Assistente pode negociar"
          checked={status.assistantTrading}
          onCheckedChange={(assistantTrading) => set({ assistantTrading })}
        />
        <span>
          <b>Assistente IA pode negociar</b>
          <span className="block text-muted-foreground text-xs">
            Como a skill do repositório: o assistente executa ordens quando você
            pede. Desligado, ele só consulta a conta e o mercado.
          </span>
        </span>
      </span>
    </div>
  );
}

function Configured({ status }: { status: MtStatus }) {
  const test = useAction(api.metatrader.test);
  const disconnect = useMutation(api.metatrader.disconnect);
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  if (editing) {
    return <ConfigForm onSaved={() => setEditing(false)} status={status} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="break-all text-sm">
        <b>{status.url}</b>{" "}
        <span className="text-muted-foreground">
          ({status.transport}
          {status.headerNames.length
            ? ` · ${status.headerNames.length} cabeçalho(s)`
            : " · sem autenticação"}
          )
        </span>
      </p>
      <p className="text-muted-foreground text-xs">
        Última resposta: {when(status.lastOkAt)}
        {status.serverTools
          ? ` · ${status.serverTools.length} ferramentas no servidor`
          : ""}
        {status.lastError ? ` · último erro: ${status.lastError}` : ""}
      </p>
      <Switches status={status} />
      {message ? (
        <Notice tone={message.ok ? "ok" : "error"}>{message.text}</Notice>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            const r = await test({});
            setTesting(false);
            const notes = [
              r.message,
              r.missing.length ? `Em falta: ${r.missing.join(", ")}.` : "",
              r.extra.length ? `Extras: ${r.extra.join(", ")}.` : "",
            ].filter(Boolean);
            setMessage({ ok: r.ok, text: notes.join(" ") });
          }}
          size="sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconShieldCheck" />
          {testing ? "Testando…" : "Testar conexão"}
        </Button>
        <Button onClick={() => setEditing(true)} size="sm" variant="ghost">
          Editar
        </Button>
        <Button
          onClick={async () => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            await disconnect({});
          }}
          onMouseLeave={() => setArmed(false)}
          size="sm"
          variant={armed ? "destructive" : "outline"}
        >
          {armed ? "Toque de novo para remover" : "Remover"}
        </Button>
        <Button
          nativeButton={false}
          render={<a href={`${BASE_PATH}/metatrader/`} />}
          size="sm"
        >
          <Icon className="size-4" name="IconChart1" />
          Abrir MetaTrader
        </Button>
      </div>
    </div>
  );
}

function Body() {
  const status = useMtStatus();
  if (status === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (status === null) {
    return <PanelUnlock what="ligar o MetaTrader" />;
  }
  return status.configured ? (
    <Configured status={status} />
  ) : (
    <ConfigForm onSaved={() => undefined} status={status} />
  );
}

function Header({ connected }: { connected: boolean | null }) {
  return (
    <CardHeader className="flex flex-row items-start gap-3">
      <ServiceTile brand="metatrader" />
      <div className="min-w-0 flex-1">
        <CardTitle className="flex flex-wrap items-center gap-2">
          MetaTrader 5
          {connected ? (
            <Badge variant="secondary">
              <Icon name="IconCircleCheck" />
              Configurado
            </Badge>
          ) : (
            <Badge variant="outline">Não configurado</Badge>
          )}
        </CardTitle>
        <CardDescription>
          A sua conta MT5 pelo metatrader-mcp-server: {MT_TOOLS.length}{" "}
          ferramentas no painel e no Assistente IA. O servidor roda no seu
          PC/VPS Windows junto do terminal MT5.
        </CardDescription>
      </div>
    </CardHeader>
  );
}

function Setup() {
  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Como ligar (no PC/VPS com o MT5)
      </summary>
      <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
        <li>
          No MT5: Ferramentas → Opções → Expert Advisors → marque “Permitir
          negociação algorítmica”.
        </li>
        <li>
          Instale: <code>pip install metatrader-mcp-server "mcp&lt;2"</code> (o
          servidor ainda não funciona com o mcp 2.x).
        </li>
        <li>
          Rode:{" "}
          <code>
            metatrader-mcp-server --login … --password … --server … --transport
            streamable-http --host 127.0.0.1 --port 8080
          </code>
        </li>
        <li>
          Exponha com HTTPS e autenticação, ex.:{" "}
          <code>cloudflared tunnel --url http://127.0.0.1:8080</code> +
          Cloudflare Access (token de serviço) e cole os cabeçalhos acima.
        </li>
        <li>
          Opcional: <code>metatrader-http-server</code> (velas por datas) e{" "}
          <code>metatrader-quote-server</code> (cotações ao vivo).
        </li>
      </ol>
    </details>
  );
}

function LiveCard() {
  const status = useMtStatus();
  return (
    <Card>
      <Header connected={Boolean(status?.configured)} />
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
        <Setup />
        <p className="text-muted-foreground text-xs">
          Negociar envolve risco de perda. O login e a senha do MT5 ficam só no
          seu PC/VPS; aqui guarda-se apenas o endereço e os cabeçalhos do proxy.
        </p>
      </CardContent>
    </Card>
  );
}

export function MetatraderCard() {
  return (
    <ConvexArea
      fallback={
        <Card>
          <Header connected={null} />
          <CardContent>
            <Notice>
              O MetaTrader usa o banco central do painel (Convex), que não está
              configurado nesta instalação.
            </Notice>
          </CardContent>
        </Card>
      }
    >
      <LiveCard />
    </ConvexArea>
  );
}
