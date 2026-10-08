"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { timeAgo } from "@/lib/code/client";
import {
  type FiredSession,
  fireRoutine,
  forgetFired,
  type RoutineInfo,
} from "@/lib/code/routines";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ClawdWalker } from "./clawd";
import { CodeComposer, type ImagePayload } from "./code-composer";

/** Subscription mode: real Claude Code cloud sessions fired from routines. */

export const ROUTINE_PROMPT =
  "Execute a tarefa descrita no bloco routine-fire-payload nos repositórios desta rotina. Trabalhe num branch claude/…, rode os testes, faça commit e push, e abra um pull request quando a tarefa estiver pronta. Responda em português.";

const fireUrl = (id: string) =>
  `https://api.anthropic.com/v1/claude_code/routines/${id}/fire`;

const TOKEN_ERROR = "Token da rotina";

const FIELD =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

export function RoutineSheet({
  open,
  routines,
  onClose,
  onAdd,
  onRemove,
  prefill,
}: {
  open: boolean;
  prefill?: RoutineInfo | null;
  routines: RoutineInfo[];
  onClose: () => void;
  onAdd: (name: string, url: string, token: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const tokenRef = useRef<HTMLInputElement>(null);
  const update = (r: RoutineInfo) => {
    setName(r.name);
    setUrl(fireUrl(r.id));
    setToken("");
    tokenRef.current?.focus();
  };
  useEffect(() => {
    if (open && prefill) {
      setName(prefill.name);
      setUrl(fireUrl(prefill.id));
      setToken("");
    }
  }, [open, prefill]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onAdd(name, url, token);
      setName("");
      setUrl("");
      setToken("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
    }
  };
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-3xl md:mx-auto md:max-w-lg"
        side="bottom"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle>
            {prefill ? "Atualizar token" : "Conectar assinatura"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
          {prefill ? (
            <p className="rounded-xl bg-muted/60 p-3 text-muted-foreground">
              Em claude.ai/code/routines, abra “{prefill.name}” → editar → API →{" "}
              <b className="text-foreground">Regenerate token</b>. Cole o token
              novo abaixo (a URL já está preenchida).
            </p>
          ) : null}
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted-foreground">
            <li>
              Abra{" "}
              <a
                className="text-foreground underline"
                href="https://claude.ai/code/routines"
                rel="noopener"
                target="_blank"
              >
                claude.ai/code/routines
              </a>{" "}
              e toque em <b className="text-foreground">New routine</b>.
            </li>
            <li>
              Escolha os repositórios e cole estas instruções:
              <button
                className="mt-1.5 block w-full rounded-xl border bg-muted/50 p-2.5 text-left text-foreground text-xs"
                onClick={() => {
                  navigator.clipboard
                    .writeText(ROUTINE_PROMPT)
                    .then(() => setCopied(true))
                    .catch(() => null);
                }}
                type="button"
              >
                {ROUTINE_PROMPT}
                <span className="mt-1 block text-muted-foreground">
                  {copied ? "Copiado ✓" : "Toque para copiar"}
                </span>
              </button>
            </li>
            <li>
              Em <b className="text-foreground">Select a trigger</b>, escolha{" "}
              <b className="text-foreground">API</b> e salve. Depois, em API,
              copie a URL e toque em{" "}
              <b className="text-foreground">Generate token</b>.
            </li>
            <li>Cole a URL e o token aqui embaixo.</li>
          </ol>
          <form className="flex flex-col gap-2" onSubmit={save}>
            <input
              aria-label="Nome da rotina"
              className={FIELD}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome (ex.: bklit-ui)"
              value={name}
            />
            <input
              aria-label="URL da API da rotina"
              autoCapitalize="off"
              className={cn(FIELD, "font-mono text-xs")}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire"
              value={url}
            />
            <input
              aria-label="Token da rotina"
              autoCapitalize="off"
              autoComplete="off"
              className={cn(FIELD, "font-mono text-xs")}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk-ant-oat01-…"
              ref={tokenRef}
              type="password"
              value={token}
            />
            {error ? <p className="text-destructive text-xs">{error}</p> : null}
            <Button
              className="h-11 rounded-full"
              disabled={!(url && token)}
              type="submit"
            >
              Salvar rotina
            </Button>
          </form>
          {routines.length ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-muted-foreground text-xs">
                Rotinas conectadas
              </p>
              {routines.map((r) => (
                <div
                  className="flex items-center gap-2 rounded-xl border px-3 py-2"
                  key={r.id}
                >
                  <Icon className="size-4" name="IconCloud" />
                  <span className="flex-1 truncate">{r.name}</span>
                  <Button
                    className="rounded-full"
                    onClick={() => update(r)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Atualizar token
                  </Button>
                  {r.server ? null : (
                    <Button
                      aria-label={`Remover ${r.name}`}
                      onClick={() => onRemove(r.id)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Icon className="size-4" name="IconTrashCan" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            As sessões usam a sua assinatura do Claude (sem créditos de API) e
            aparecem também no app do Claude, na aba Code. O token fica
            criptografado neste aparelho.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function FiredRow({ s }: { s: FiredSession }) {
  return (
    <div className="group flex items-start gap-4 rounded-2xl px-3 py-3 hover:bg-muted/60">
      <a
        className="flex min-w-0 flex-1 items-start gap-4"
        href={s.url}
        rel="noopener"
        target="_blank"
      >
        <span className="pt-0.5">
          <Icon className="size-6 shrink-0 text-[#d97757]" name="IconCloud" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[17px]">{s.title}</span>
          <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <span className="truncate">
              Claude Code · {s.routine} ·{" "}
              {timeAgo(new Date(s.createdAt).toISOString())}
            </span>
            <Icon className="size-4 shrink-0" name="IconArrowUpRight" />
          </span>
        </span>
      </a>
      <button
        aria-label="Remover da lista"
        className="rounded-full p-1.5 text-muted-foreground opacity-60 hover:bg-muted group-hover:opacity-100"
        onClick={() => forgetFired(s.sessionId)}
        type="button"
      >
        <Icon className="size-4" name="IconCrossSmall" />
      </button>
    </div>
  );
}

export type Engine = { kind: "api" } | { kind: "routine"; id: string };

export function EngineBar({
  routines,
  value,
  onChange,
  onConnect,
}: {
  routines: RoutineInfo[];
  value: Engine;
  onChange: (e: Engine) => void;
  onConnect: () => void;
}) {
  const chip = (active: boolean) =>
    cn(
      "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
      active
        ? "border-foreground/40 bg-foreground text-background"
        : "bg-background hover:bg-muted"
    );
  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {routines.map((r) => (
        <button
          className={chip(value.kind === "routine" && value.id === r.id)}
          key={r.id}
          onClick={() => onChange({ kind: "routine", id: r.id })}
          type="button"
        >
          <Icon className="size-4" name="IconCloud" />
          {r.name}
        </button>
      ))}
      <button
        className={chip(value.kind === "api")}
        onClick={() => onChange({ kind: "api" })}
        type="button"
      >
        <Icon className="size-4" name="IconCodeAssistant" />
        API
      </button>
      <button className={chip(false)} onClick={onConnect} type="button">
        <Icon className="size-4" name="IconPlusSmall" />
        {routines.length ? "Rotina" : "Usar minha assinatura"}
      </button>
    </div>
  );
}

/** New task on a routine: starts a real Claude Code session in the cloud. */
export function RoutineSession({
  routine,
  engineBar,
  onBack,
  onReconnect,
}: {
  routine: RoutineInfo;
  engineBar: React.ReactNode;
  onBack: () => void;
  onReconnect: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fired, setFired] = useState<FiredSession | null>(null);
  const start = async (text: string, images: ImagePayload[]) => {
    setError(null);
    setFired(null);
    if (!text) {
      setError(
        images.length
          ? "Fotos não vão pelas rotinas; descreva a tarefa em texto."
          : "Descreva a tarefa."
      );
      return false;
    }
    try {
      setFired(await fireRoutine(routine, text));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
      return false;
    }
  };
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Button
          aria-label="Voltar"
          className="rounded-full"
          onClick={onBack}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon className="size-5" name="IconChevronLeft" />
        </Button>
        <h2 className="font-semibold">Nova sessão</h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden p-5">
        <ClawdWalker />
        {fired ? (
          <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border bg-card p-5 text-center">
            <p className="font-medium">Sessão criada no Claude Code ✓</p>
            <p className="text-muted-foreground text-sm">
              O Claude já está trabalhando na nuvem. Acompanhe, responda e crie
              o PR pelo app do Claude.
            </p>
            <a
              className="flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-background"
              href={fired.url}
              rel="noopener"
              target="_blank"
            >
              Abrir no Claude
              <Icon className="size-4" name="IconArrowUpRight" />
            </a>
          </div>
        ) : null}
      </div>
      <div className="mx-auto w-full max-w-3xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex flex-col gap-2">
          {engineBar}
          <p className="px-1 text-muted-foreground text-xs">
            Roda pela sua assinatura do Claude, nos repositórios e com o modelo
            da rotina “{routine.name}”.
          </p>
        </div>
        {error ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-2">
            <p className="text-destructive text-sm">{error}</p>
            {error.startsWith(TOKEN_ERROR) ? (
              <Button
                className="rounded-full"
                onClick={onReconnect}
                size="sm"
                type="button"
              >
                Atualizar token
              </Button>
            ) : null}
          </div>
        ) : null}
        <CodeComposer
          autoFocus
          hideMode
          mode="auto"
          onMode={() => null}
          onSend={start}
          placeholder="Descreva a tarefa…"
        />
      </div>
    </div>
  );
}
