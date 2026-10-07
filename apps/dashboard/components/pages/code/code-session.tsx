"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AiMascot } from "@/components/dashboard/ai-mascot";
import { Markdown } from "@/components/pages/ai/markdown";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AI_MODELS } from "@/lib/ai-models";
import {
  PHASES,
  post,
  pushedBranches,
  stripBranches,
  useSession,
} from "@/lib/code/client";
import type { CodeItem, CodeSessionSummary } from "@/lib/code/types";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  CodeComposer,
  type CodeMode,
  type ImagePayload,
} from "./code-composer";

type ToolItem = Extract<CodeItem, { kind: "tool" }>;

const TOOL_ICONS: Record<string, IconName> = {
  bash: "IconConsole",
  read: "IconFileText",
  write: "IconPencil",
  edit: "IconPencil",
  glob: "IconMagnifyingGlass",
  grep: "IconMagnifyingGlass",
};

const modelName = (id: string | null) =>
  AI_MODELS.find((m) => m.id === id)?.name.replace("Claude ", "") ?? "";

function ToolRow({
  item,
  onDecide,
}: {
  item: ToolItem;
  onDecide: (allow: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card/60",
        item.pending && "border-amber-500/50 bg-amber-500/5"
      )}
    >
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
        disabled={!item.result}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Icon
          className={cn(
            "size-4 shrink-0 text-muted-foreground",
            item.isError && "text-destructive"
          )}
          name={TOOL_ICONS[item.name] ?? "IconSettingsGear1"}
        />
        <span className="shrink-0 font-medium text-sm capitalize">
          {item.name}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
          {item.summary}
        </span>
        {item.result ? (
          <Icon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
            name="IconChevronDownSmall"
          />
        ) : null}
      </button>
      {open && item.result ? (
        <pre className="max-h-72 overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed">
          {item.result}
        </pre>
      ) : null}
      {item.pending ? (
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
          <span className="mr-auto text-sm">O Claude quer rodar isso.</span>
          <Button
            onClick={() => onDecide(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Negar
          </Button>
          <Button onClick={() => onDecide(true)} size="sm" type="button">
            Permitir
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PullRequestCard({
  repo,
  branch,
  title,
}: {
  repo: string;
  branch: string;
  title: string;
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "done"; url: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const open = async () => {
    setState({ kind: "busy" });
    try {
      const pr = await post<{ url: string }>("pr/", {
        repo,
        branch,
        title,
        body: "Aberto pelo painel Casa Brasa (sessão do Claude na nuvem).",
      });
      setState({ kind: "done", url: pr.url });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Falhou.",
      });
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3">
      <Icon className="size-5" name="IconBranch" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-sm">{branch}</span>
        <span className="truncate text-muted-foreground text-xs">{repo}</span>
      </span>
      {state.kind === "done" ? (
        <a
          className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-background text-sm"
          href={state.url}
          rel="noopener"
          target="_blank"
        >
          <Icon className="size-4" name="IconPullRequest" />
          Ver PR
        </a>
      ) : (
        <Button
          disabled={state.kind === "busy"}
          onClick={open}
          size="sm"
          type="button"
        >
          <Icon name="IconPullRequest" />
          {state.kind === "busy" ? "Abrindo…" : "Criar pull request"}
        </Button>
      )}
      {state.kind === "error" ? (
        <p className="w-full text-destructive text-xs">{state.message}</p>
      ) : null}
    </div>
  );
}

function Item({
  item,
  onDecide,
}: {
  item: CodeItem;
  onDecide: (id: string, allow: boolean) => void;
}) {
  switch (item.kind) {
    case "user":
      return (
        <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-3xl bg-muted px-4 py-2.5 text-[15px]">
          {item.images ? (
            <span className="mb-1 flex items-center gap-1 text-muted-foreground text-xs">
              <Icon className="size-3.5" name="IconImages1" />
              {item.images} {item.images === 1 ? "imagem" : "imagens"}
            </span>
          ) : null}
          {item.text}
        </div>
      );
    case "agent":
      return (
        <div className="text-[15px] leading-relaxed">
          <Markdown text={stripBranches(item.text)} />
        </div>
      );
    case "tool":
      return (
        <ToolRow item={item} onDecide={(allow) => onDecide(item.id, allow)} />
      );
    case "error":
      return (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive text-sm">
          {item.text}
        </p>
      );
    case "status":
      return (
        <p className="text-center text-muted-foreground text-xs">{item.text}</p>
      );
    default:
      return null;
  }
}

function SessionMenu({
  session,
  onChanged,
  onRename,
  onDelete,
}: {
  session: CodeSessionSummary;
  onChanged: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const act = async (action: string, extra?: object) => {
    await post(`sessions/${session.id}/`, { action, ...extra }).catch(
      () => null
    );
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Mais opções"
            className="rounded-full"
            size="icon"
            variant="ghost"
          />
        }
      >
        <Icon className="size-5" name="IconDotGrid1x3Horizontal" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRename}>Renomear</DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            window.open(
              `https://platform.claude.com/workspaces/default/sessions/${session.id}`,
              "_blank",
              "noopener"
            )
          }
        >
          Abrir no Console
        </DropdownMenuItem>
        {session.phase === "archived" ? null : (
          <DropdownMenuItem
            onClick={async () => {
              await act("archive");
              onChanged();
            }}
          >
            Arquivar
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} variant="destructive">
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SessionView({
  summary,
  onBack,
  onChanged,
  onGone,
}: {
  summary: CodeSessionSummary;
  onBack: () => void;
  onChanged: () => void;
  onGone: () => void;
}) {
  const busy = summary.phase === "working";
  const { data, error, reload } = useSession(summary.id, busy);
  const session = data ?? { ...summary, items: [] as CodeItem[] };
  const [sendError, setSendError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const count = session.items.length;

  useEffect(() => {
    if (count) {
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [count]);

  const branches = useMemo(
    () =>
      pushedBranches(
        session.items.flatMap((i) => (i.kind === "agent" ? [i.text] : []))
      ),
    [session.items]
  );

  const act = async (body: object) => {
    setSendError(null);
    try {
      await post(`sessions/${summary.id}/`, body);
      reload();
      onChanged();
      return true;
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Falhou.");
      return false;
    }
  };
  const send = (text: string, images: ImagePayload[]) =>
    act({
      action: "message",
      text,
      images: images.map(({ mediaType, data: d }) => ({ mediaType, data: d })),
    });
  const setMode = (mode: CodeMode) => act({ action: "mode", mode });
  const approvePlan = async () => {
    if (await setMode("auto")) {
      await send("Plano aprovado. Pode implementar.", []);
    }
  };
  const working = session.phase === "working";
  const repoLine = session.repos
    .map((r) => (session.branches[r] ? `${r}@${session.branches[r]}` : r))
    .join(", ");

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          aria-label="Voltar"
          className="rounded-full md:hidden"
          onClick={onBack}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon className="size-5" name="IconChevronLeft" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col text-center md:text-left">
          {renaming ? (
            <input
              aria-label="Nome da sessão"
              className="w-full rounded-lg border bg-background px-2 py-1 font-semibold outline-none"
              defaultValue={session.title}
              onBlur={() => setRenaming(false)}
              onKeyDown={async (e) => {
                if (e.key === "Escape") {
                  setRenaming(false);
                }
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  const title = e.currentTarget.value;
                  setRenaming(false);
                  await act({ action: "rename", title });
                }
              }}
              ref={(el) => el?.focus()}
            />
          ) : (
            <h2 className="truncate font-semibold">{session.title}</h2>
          )}
          <p className="truncate text-muted-foreground text-xs">
            {repoLine} · {modelName(session.model)} ·{" "}
            {PHASES[session.phase].line}
            {session.costUsd ? ` · US$ ${session.costUsd.toFixed(2)}` : ""}
          </p>
        </div>
        <SessionMenu
          onChanged={onChanged}
          onDelete={() => setConfirmDelete(true)}
          onRename={() => setRenaming(true)}
          session={session}
        />
      </header>
      {confirmDelete ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-destructive/5 px-4 py-2 text-sm">
          <span className="mr-auto">Excluir a sessão e todo o histórico?</span>
          <Button
            onClick={() => setConfirmDelete(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              if (await act({ action: "delete" })) {
                onGone();
              }
            }}
            size="sm"
            type="button"
            variant="destructive"
          >
            Excluir
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
          {error ? (
            <p className="text-destructive text-sm">{error.message}</p>
          ) : null}
          {session.items.map((item) => (
            <Item
              item={item}
              key={item.id}
              onDecide={(id, allow) =>
                act({ action: "confirm", toolUseId: id, allow })
              }
            />
          ))}
          {working ? (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <AiMascot className="size-7" />
              Trabalhando…
            </p>
          ) : null}
          {branches.map((b) => (
            <PullRequestCard
              branch={b.branch}
              key={`${b.repo}#${b.branch}`}
              repo={b.repo}
              title={session.title}
            />
          ))}
          {session.mode === "plan" && session.phase === "review" ? (
            <Button
              className="h-11 self-start rounded-full"
              onClick={approvePlan}
              type="button"
            >
              <Icon name="IconCheckmark1" />
              Aprovar plano e implementar
            </Button>
          ) : null}
          <div ref={bottom} />
        </div>
      </div>
      {session.phase === "archived" || session.phase === "completed" ? (
        <p className="p-4 text-center text-muted-foreground text-sm">
          Sessão {session.phase === "archived" ? "arquivada" : "encerrada"} —
          somente leitura.
        </p>
      ) : (
        <div className="mx-auto w-full max-w-3xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {sendError ? (
            <p className="mb-2 px-2 text-destructive text-sm">{sendError}</p>
          ) : null}
          <CodeComposer
            mode={session.mode}
            modeLocked={working}
            onMode={setMode}
            onSend={send}
            onStop={() => act({ action: "interrupt" })}
            placeholder="Responda ou mude a direção…"
            working={working}
          />
        </div>
      )}
    </div>
  );
}
