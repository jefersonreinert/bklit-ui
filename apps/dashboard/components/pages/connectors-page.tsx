"use client";

import { Icon } from "@bklitui/icons";
import { useEffect, useState } from "react";
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
import {
  BASE_PATH,
  type ConnectorsStatus,
  googleStartUrl,
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
    "A resposta do serviço não confere com esta sessão. Tente novamente.",
  missing_google_client:
    "Falta configurar GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Vercel (veja o passo a passo no card do Google).",
  missing_scopes:
    "Marque as permissões do Gmail e do Drive na tela do Google para o painel funcionar.",
};

const CONNECTED: Record<string, string> = {
  notion: "Notion conectado com sucesso.",
  google: "Google conectado: Gmail e Drive já estão disponíveis.",
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
    const connected = CONNECTED[params.get("connected") ?? ""];
    if (connected) {
      setBanner({ tone: "ok", text: connected });
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
        <ServiceTile brand="notion" />
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
              : "Sem token nem integração: basta entrar com a sua conta. O assistente vê o mesmo que você vê no Notion."}
          </p>
          {action}
        </div>
      </CardContent>
    </Card>
  );
}

function GoogleSetupSteps() {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground text-sm">
      <li>
        Em <span className="text-foreground">console.cloud.google.com</span>,
        crie um projeto e ative a <b>Gmail API</b> e a <b>Google Drive API</b>.
      </li>
      <li>
        Em <b>Google Auth Platform</b>, configure a tela de consentimento
        (Externo) e adicione o seu e-mail como <b>usuário de teste</b>.
      </li>
      <li>
        Crie um <b>ID do cliente OAuth</b> do tipo &quot;Aplicativo da Web&quot;
        com este URI de redirecionamento:
        <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-foreground text-xs">
          {typeof window === "undefined"
            ? "/api/connectors/google/callback/"
            : `${window.location.origin}${BASE_PATH}/api/connectors/google/callback/`}
        </code>
      </li>
      <li>
        No Vercel, adicione <code>GOOGLE_CLIENT_ID</code> e{" "}
        <code>GOOGLE_CLIENT_SECRET</code> e faça um novo deploy.
      </li>
    </ol>
  );
}

function GoogleCard({
  status,
  onDisconnect,
}: {
  status: ConnectorsStatus | null;
  onDisconnect: () => void;
}) {
  const google = status?.google;
  const connected = google?.connected ?? false;
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
  } else if (google && !google.available) {
    action = (
      <Button disabled size="sm" variant="outline">
        Configuração pendente
      </Button>
    );
  } else if (status) {
    action = (
      <Button
        nativeButton={false}
        render={<a href={googleStartUrl()} />}
        size="sm"
      >
        Conectar com Google
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <span className="flex shrink-0 -space-x-2">
          <ServiceTile brand="gmail" />
          <ServiceTile brand="drive" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            Gmail e Google Drive
            <StatusBadge connected={connected} />
          </CardTitle>
          <CardDescription>
            Um login do Google libera a página E-mail e dá ao assistente acesso
            ao Gmail (ler e criar rascunhos) e ao Drive (somente leitura).
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="grid gap-2 text-muted-foreground text-sm sm:grid-cols-2">
          {[
            "Ler, responder e enviar e-mails na página E-mail",
            "Assistente resume e-mails de fornecedores e reservas",
            "Assistente escreve rascunhos — você revisa e envia",
            "Buscar contratos, planilhas e notas fiscais no Drive",
          ].map((t) => (
            <li className="flex items-center gap-2" key={t}>
              <Icon className="size-4 shrink-0" name="IconCheckmark1Small" />
              {t}
            </li>
          ))}
        </ul>
        {google && !google.available && status?.available ? (
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="mb-2 font-medium text-sm">
              Configuração única no Google Cloud
            </p>
            <GoogleSetupSteps />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground text-xs">
            {connected
              ? `Conectado como ${google?.email ?? "sua conta"}. O acesso fica salvo neste navegador.`
              : "Você vai escolher a conta e confirmar as permissões na tela do Google."}
          </p>
          {action}
        </div>
      </CardContent>
    </Card>
  );
}

function YoutubeCard({ status }: { status: ConnectorsStatus | null }) {
  const yt = status?.youtube;
  const ready = yt?.available ?? false;
  let state = "Configuração pendente";
  if (ready) {
    state = yt?.transcripts
      ? "Ativo com transcrição"
      : "Ativo (sem transcrição)";
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <ServiceTile brand="youtube" />
        <div className="min-w-0 flex-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            YouTube
            <Badge variant={ready ? "secondary" : "outline"}>{state}</Badge>
          </CardTitle>
          <CardDescription>
            Pesquisa vídeos de qualquer canal, detalhes, duração, playlists
            completas e comentários. Não precisa de login: usa a chave do
            servidor.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
        {ready && !yt?.transcripts ? (
          <p>
            Para a <b>transcrição completa</b>, crie uma chave em{" "}
            <span className="text-foreground">
              aistudio.google.com → Get API key
            </span>{" "}
            e adicione <code>GEMINI_API_KEY</code> no Vercel.
          </p>
        ) : null}
        {ready ? null : (
          <p>
            Adicione <code>YOUTUBE_API_KEY</code> (YouTube Data API v3) no
            Vercel e faça um novo deploy.
          </p>
        )}
        <p>
          {status?.google.youtube
            ? `Conta do YouTube conectada (${status.google.email ?? "Google"}): playlists privadas, inscrições e curtidos liberados.`
            : "Opcional: conecte a sua conta pelo login do Google para ver suas playlists privadas, inscrições e vídeos curtidos."}
        </p>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          {ready && !status?.google.youtube && status?.google.available ? (
            <Button
              nativeButton={false}
              render={<a href={googleStartUrl(`${BASE_PATH}/youtube/`)} />}
              size="sm"
            >
              Conectar conta do YouTube
            </Button>
          ) : null}
          <Button
            disabled={!ready}
            nativeButton={false}
            render={<a href={`${BASE_PATH}/youtube/`} />}
            size="sm"
            variant="outline"
          >
            Abrir YouTube
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WhatsappCard({ status }: { status: ConnectorsStatus | null }) {
  const wa = status?.whatsapp;
  const ready = wa?.available ?? false;
  let state = "Configuração pendente";
  if (ready) {
    state = wa?.unlocked ? "Liberado neste aparelho" : "Configurado";
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <ServiceTile brand="whatsapp" />
        <div className="min-w-0 flex-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            WhatsApp
            <Badge variant={ready ? "secondary" : "outline"}>{state}</Badge>
          </CardTitle>
          <CardDescription>
            Seu WhatsApp como aparelho conectado (whatsapp-web.js), rodando num
            servidor gratuito do Hugging Face. Leia e responda conversas no app;
            o assistente pode ler e resumir (não envia nada sozinho).
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
        {ready ? null : (
          <p>
            Falta configurar o servidor gratuito no Hugging Face (Space Docker
            com <code>services/whatsapp-bridge</code>) e adicionar{" "}
            <code>WHATSAPP_BRIDGE_URL</code>,{" "}
            <code>WHATSAPP_BRIDGE_SECRET</code> e{" "}
            <code>WHATSAPP_ACCESS_CODE</code> no Vercel.
          </p>
        )}
        <p>
          Não é oficial: o WhatsApp pode restringir contas que automatizam
          mensagens. Aqui só é enviado o que você digita.
        </p>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button
            disabled={!ready}
            nativeButton={false}
            render={<a href={`${BASE_PATH}/whatsapp/`} />}
            size="sm"
          >
            Abrir WhatsApp
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ConnectorsPage() {
  const { status, disconnectNotion, disconnectGoogle } = useConnectors();
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
          Vercel para o Claude usar os conectores de verdade.
        </div>
      ) : null}
      {status && !status.available ? (
        <div className="rounded-xl border px-4 py-3 text-muted-foreground text-sm">
          Esta versão estática (GitHub Pages) não tem servidor. Use a versão do
          Vercel para usar os conectores.
        </div>
      ) : null}

      <NotionCard onDisconnect={disconnectNotion} status={status} />
      <GoogleCard onDisconnect={disconnectGoogle} status={status} />
      <YoutubeCard status={status} />
      <WhatsappCard status={status} />
    </div>
  );
}
