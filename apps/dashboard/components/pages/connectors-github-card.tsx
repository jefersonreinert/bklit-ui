"use client";

import { type FormEvent, useState } from "react";
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
import { Icon } from "@/lib/icons";
import type { ConnectorsStatus } from "@/lib/use-connectors";

/** Classic token with the scopes the assistant needs, pre-filled. */
const NEW_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,workflow,read:org,gist&description=Casa%20Brasa%20%E2%80%94%20Assistente%20IA";

const CAN_DO = [
  "Ler código, buscar arquivos e explicar repositórios",
  "Criar e responder issues e pull requests",
  "Criar branches, commits e editar arquivos",
  "Ver e reexecutar o GitHub Actions",
];

function ConnectForm({
  onConnect,
}: {
  onConnect: (token: string) => Promise<string | null>;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      return;
    }
    setBusy(true);
    const problem = await onConnect(token.trim());
    setBusy(false);
    setError(problem);
    if (!problem) {
      setToken("");
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground text-sm">
        <li>
          Abra{" "}
          <a
            className="font-medium text-foreground underline underline-offset-2"
            href={NEW_TOKEN_URL}
            rel="noopener"
            target="_blank"
          >
            gerar token no GitHub
          </a>{" "}
          (as permissões já vêm marcadas).
        </li>
        <li>Escolha a validade, toque em “Generate token” e copie.</li>
        <li>Cole aqui embaixo e toque em Conectar.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Token do GitHub"
          autoComplete="off"
          className="min-w-56 flex-1 font-mono"
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_… ou github_pat_…"
          spellCheck={false}
          type="password"
          value={token}
        />
        <Button disabled={busy || !token.trim()} type="submit">
          {busy ? "Verificando…" : "Conectar"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}

export function GithubCard({
  status,
  onConnect,
  onDisconnect,
}: {
  status: ConnectorsStatus | null;
  onConnect: (token: string) => Promise<string | null>;
  onDisconnect: () => void;
}) {
  const connected = status?.github?.connected ?? false;
  const since = status?.github?.connectedAt
    ? new Date(status.github.connectedAt).toLocaleDateString("pt-BR")
    : null;
  const ready = Boolean(status?.available && status.configured);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <ServiceTile brand="github" />
        <div className="min-w-0 flex-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            GitHub
            {connected ? (
              <Badge variant="secondary">
                <Icon name="IconCircleCheck" />@{status?.github.login}
              </Badge>
            ) : (
              <Badge variant="outline">Não conectado</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Servidor MCP oficial do GitHub. O assistente trabalha nos seus
            repositórios — e pede confirmação antes de alterar qualquer coisa.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="grid gap-2 text-muted-foreground text-sm sm:grid-cols-2">
          {CAN_DO.map((t) => (
            <li className="flex items-center gap-2" key={t}>
              <Icon className="size-4 shrink-0" name="IconCheckmark1Small" />
              {t}
            </li>
          ))}
        </ul>
        <div className="border-t pt-4">
          {connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                {since ? `Conectado em ${since}. ` : ""}O token fica
                criptografado neste navegador e só é enviado ao GitHub.
              </p>
              <Button onClick={onDisconnect} size="sm" variant="outline">
                Desconectar
              </Button>
            </div>
          ) : null}
          {!connected && ready ? <ConnectForm onConnect={onConnect} /> : null}
          {connected || ready ? null : (
            <p className="text-muted-foreground text-xs">
              {status ? "Indisponível nesta versão." : "Carregando…"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
