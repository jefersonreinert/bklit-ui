"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AGENT_TEMPLATES, PERMISSION_MODES } from "@/lib/agents/catalog";
import { createAgent, useAgents } from "@/lib/agents/store";
import type { Agent } from "@/lib/agents/types";
import { AI_MODELS } from "@/lib/ai-models";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { AgentAvatar, AgentEditor } from "./agent-editor";

const TRIGGER_LABEL: Record<
  Agent["trigger"]["type"],
  { label: string; icon: IconName }
> = {
  manual: { label: "Manual", icon: "IconPlay" },
  schedule: { label: "Agendado", icon: "IconCalendarClock" },
  webhook: { label: "Webhook", icon: "IconLightning" },
};

const modelName = (id: string) =>
  AI_MODELS.find((m) => m.id === id)?.name.replace("Claude ", "") ?? id;

function AgentRow({
  agent,
  active,
  onOpen,
}: {
  agent: Agent;
  active: boolean;
  onOpen: () => void;
}) {
  const trigger = TRIGGER_LABEL[agent.trigger.type];
  return (
    <button
      className={cn(
        "flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60"
      )}
      onClick={onOpen}
      type="button"
    >
      <AgentAvatar agent={agent} className="size-10 text-xl" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">
            {agent.name || "Sem nome"}
          </span>
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              agent.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
            )}
          />
        </span>
        <span className="line-clamp-1 text-muted-foreground text-xs">
          {agent.description || agent.prompt || "Sem descrição"}
        </span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Icon className="size-3" name={trigger.icon} />
            {trigger.label}
          </span>
          <span>{modelName(agent.model)}</span>
          {agent.subagents.length ? (
            <span className="flex items-center gap-1">
              <Icon className="size-3" name="IconAgentNetwork" />
              {agent.subagents.length}
            </span>
          ) : null}
          {agent.mcpServers.length ? (
            <span className="flex items-center gap-1">
              <Icon className="size-3" name="IconConnectors1" />
              {agent.mcpServers.length}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function Templates({
  onCreate,
  compact,
}: {
  onCreate: (templateId: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
      {AGENT_TEMPLATES.map((t) => (
        <button
          className="flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/60"
          key={t.id}
          onClick={() => onCreate(t.id)}
          type="button"
        >
          <AgentAvatar agent={t.draft} className="size-9 text-lg" />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium text-sm">{t.title}</span>
            <span className="text-muted-foreground text-xs">{t.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: (id: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-10">
      <div className="flex flex-col gap-2">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted">
          <Icon className="size-6" name="IconAgents" />
        </span>
        <h1 className="font-semibold text-2xl tracking-tight">Agentes</h1>
        <p className="text-muted-foreground text-sm">
          Crie agentes automáticos com tarefa, ferramentas, permissões,
          servidores MCP, subagentes e gatilho. Cada agente vira opções do{" "}
          <code className="text-foreground">query()</code> do Claude Agent SDK,
          prontas para rodar no seu servidor.
        </p>
      </div>
      <Templates onCreate={onCreate} />
      <div className="flex flex-col gap-1 rounded-xl bg-muted/60 p-3 text-muted-foreground text-xs">
        <p className="font-medium text-foreground">Modos de permissão</p>
        {PERMISSION_MODES.map((m) => (
          <p key={m.id}>
            <span className="font-mono text-foreground">{m.id}</span> —{" "}
            {m.description}
          </p>
        ))}
      </div>
    </div>
  );
}

export function AgentsPage() {
  const agents = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [picking, setPicking] = useState(false);
  const sorted = [...agents].sort((a, b) => b.updatedAt - a.updatedAt);
  const selected = agents.find((a) => a.id === selectedId) ?? null;

  // Desktop opens the most recent agent by default
  const firstId = sorted[0]?.id;
  useEffect(() => {
    if (
      !selectedId &&
      firstId &&
      window.matchMedia("(min-width: 768px)").matches
    ) {
      setSelectedId(firstId);
    }
  }, [selectedId, firstId]);

  const select = (id: string | null) => {
    setSelectedId(id);
    setMobileEditor(Boolean(id));
    setPicking(false);
  };
  const create = (templateId: string) => select(createAgent(templateId).id);

  if (agents.length === 0) {
    return <EmptyState onCreate={create} />;
  }

  return (
    <div className="-m-4 mb-[calc(-1rem-env(safe-area-inset-bottom))] flex h-[calc(100dvh-var(--header-h))] md:-m-6 md:mb-[calc(-1.5rem-env(safe-area-inset-bottom))]">
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-r md:w-80",
          mobileEditor && "hidden md:flex"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h1 className="font-semibold">Agentes</h1>
            <p className="text-muted-foreground text-xs">
              {agents.length} {agents.length === 1 ? "agente" : "agentes"} ·{" "}
              {agents.filter((a) => a.enabled).length} ativos
            </p>
          </div>
          <Button
            aria-expanded={picking}
            onClick={() => setPicking((p) => !p)}
            size="sm"
            type="button"
          >
            <Icon name={picking ? "IconCrossSmall" : "IconPlusSmall"} />
            {picking ? "Fechar" : "Novo"}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {picking ? (
            <div className="flex flex-col gap-2 p-1">
              <p className="px-1 text-muted-foreground text-xs">
                Começar a partir de
              </p>
              <Templates compact onCreate={create} />
            </div>
          ) : (
            sorted.map((a) => (
              <AgentRow
                active={a.id === selectedId}
                agent={a}
                key={a.id}
                onOpen={() => select(a.id)}
              />
            ))
          )}
        </div>
      </aside>
      <main
        className={cn(
          "min-w-0 flex-1 overflow-y-auto",
          !mobileEditor && "hidden md:block"
        )}
      >
        {selected ? (
          <AgentEditor
            agent={selected}
            key={selected.id}
            onBack={() => setMobileEditor(false)}
            onSelect={select}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Selecione um agente
          </div>
        )}
      </main>
    </div>
  );
}
