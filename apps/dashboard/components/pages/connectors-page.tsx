"use client";

import { Icon, type IconName } from "@bklitui/icons";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BASE_PATH,
  type ConnectorsStatus,
  notionStartUrl,
  useConnectors,
} from "@/lib/use-connectors";
import { cn } from "@/lib/utils";

const ERRORS: Record<string, string> = {
  missing_secret:
    "Falta configurar CONNECTORS_SECRET no Vercel (um texto aleatório com 16+ caracteres). Depois faça um novo deploy.",
  notion_unavailable:
    "Não foi possível falar com o Notion agora. Tente novamente em instantes.",
  access_denied: "A conexão foi cancelada na tela do Notion.",
  expired: "A tentativa de conexão expirou. Clique em Conectar novamente.",
  state_mismatch:
    "A resposta do Notion não confere com esta sessão. Tente novamente.",
};

interface Banner {
  tone: "ok" | "error";
  text: string;
}

/** Reads ?connected= / ?error= once, then cleans the URL. */
function useRedirectBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (params.get("connected") === "notion") {
      setBanner({ tone: "ok", text: "Notion conectado com sucesso." });
    } else if (error) {
      setBanner({
        tone: "error",
        text: ERRORS[error] ?? `Não foi possível conectar (${error}).`,
      });
    }
    if (params.size > 0) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  return banner;
}

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge variant="secondary">
      <Icon name="IconCircleCheck" />
      Conectado
    </Badge>
  ) : (
    <Badge variant="outline">Não conectado</Badge>
  );
}

function NotionCard({
  status,
  onDisconnect,
}: {
  status: ConnectorsStatus | null;
  onDisconnect: () => void;
}) {
  const connected = status?.notion.connected ?? false;
  const since = status?.notion.connectedAt
    ? new Date(status.notion.connectedAt).toLocaleDateString("pt-BR")
    : null;
  let action = (
    <Button disabled size="sm" variant="outline">
      Carregando…
    </Button>
  );
  if (status && !status.available) {
    action = (
      <Button disabled size="sm" variant="outline">
        Indisponível nesta versão
      </Button>
    );
  } else if (connected) {
    action = (
      <Button onClick={onDisconnect} size="sm" variant="outline">
        Desconectar
      </Button>
    );
  } else if (status) {
    action = (
      <Button
        nativeButton={false}
        render={<a href={notionStartUrl()} />}
        size="sm"
      >
        Conectar
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-5" name="IconNotion" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            Notion
            <StatusBadge connected={connected} />
          </CardTitle>
          <CardDescription>
            Servidor MCP oficial do Notion. O assistente pode pesquisar, ler e —
            com a sua confirmação — criar ou editar páginas.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="grid gap-2 text-muted-foreground text-sm sm:grid-cols-2">
          {[
            "Buscar fichas técnicas, POPs e atas",
            "Resumir páginas e bases de dados",
            "Criar páginas (ex.: relatório do mês)",
            "Comentar e atualizar documentos",
          ].map((t) => (
            <li className="flex items-center gap-2" key={t}>
              <Icon className="size-4 shrink-0" name="IconCheckmark1Small" />
              {t}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground text-xs">
            {connected && since
              ? `Conectado em ${since}. O acesso fica salvo neste navegador.`
              : "Você escolhe no Notion quais páginas o assistente pode ver."}
          </p>
          {action}
        </div>
      </CardContent>
    </Card>
  );
}

function SoonCard({
  name,
  icon,
  description,
}: {
  name: string;
  icon: IconName;
  description: string;
}) {
  return (
    <Card className="opacity-70">
      <CardHeader className="flex flex-row items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-5" name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {name}
            <Badge variant="outline">Em breve</Badge>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

export function ConnectorsPage() {
  const { status, disconnectNotion } = useConnectors();
  const banner = useRedirectBanner();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">Conectores</h2>
          <p className="text-muted-foreground text-sm">
            Conecte suas ferramentas para o Assistente IA usar documentos e
            dados reais do restaurante.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<a href={`${BASE_PATH}/ia/`} />}
          size="sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconSparklesSoft" />
          Abrir assistente
        </Button>
      </div>

      {banner ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm",
            banner.tone === "error" &&
              "border-destructive/40 bg-destructive/5 text-destructive"
          )}
          role="status"
        >
          <Icon
            className="size-4 shrink-0"
            name={banner.tone === "ok" ? "IconCircleCheck" : "IconWarningSign"}
          />
          {banner.text}
        </div>
      ) : null}

      {status?.available && !status.configured ? (
        <div className="rounded-xl border px-4 py-3 text-muted-foreground text-sm">
          Para ativar os conectores, adicione a variável{" "}
          <code className="rounded bg-muted px-1">CONNECTORS_SECRET</code> no
          Vercel (Settings → Environment Variables) e faça um novo deploy.
        </div>
      ) : null}
      {status?.available && !status.ai ? (
        <div className="rounded-xl border px-4 py-3 text-muted-foreground text-sm">
          O assistente está em modo demonstração: adicione{" "}
          <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> no
          Vercel para o Claude usar o Notion de verdade.
        </div>
      ) : null}
      {status && !status.available ? (
        <div className="rounded-xl border px-4 py-3 text-muted-foreground text-sm">
          Esta versão estática (GitHub Pages) não tem servidor. Use a versão do
          Vercel para conectar o Notion.
        </div>
      ) : null}

      <NotionCard onDisconnect={disconnectNotion} status={status} />
      <div className="grid gap-4 md:grid-cols-2">
        <SoonCard
          description="Ler e rascunhar e-mails de fornecedores e reservas."
          icon="IconEmail1"
          name="Gmail"
        />
        <SoonCard
          description="Encontrar contratos, notas fiscais e planilhas."
          icon="IconGoogle"
          name="Google Drive"
        />
      </div>
    </div>
  );
}
