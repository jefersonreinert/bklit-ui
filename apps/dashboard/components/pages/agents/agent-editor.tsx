"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { AGENT_COLORS, AGENT_EMOJIS } from "@/lib/agents/catalog";
import { deleteAgent, duplicateAgent, saveAgent } from "@/lib/agents/store";
import type { Agent } from "@/lib/agents/types";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  ModelSection,
  PermissionsSection,
  TaskSection,
  TriggerSection,
} from "./agent-basics";
import { AgentCode } from "./agent-code";
import { McpSection, SubagentsSection } from "./agent-connections";
import { ToolsSection } from "./agent-tools";
import { Segmented } from "./agent-ui";

type View = "config" | "code";

const VIEWS: { id: View; label: string }[] = [
  { id: "config", label: "Configurar" },
  { id: "code", label: "Código do SDK" },
];

export function AgentAvatar({
  agent,
  className,
}: {
  agent: Pick<Agent, "icon" | "color">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl",
        AGENT_COLORS[agent.color % AGENT_COLORS.length],
        className
      )}
    >
      {agent.icon}
    </span>
  );
}

function LookPicker({
  agent,
  onChange,
}: {
  agent: Agent;
  onChange: (patch: Partial<Agent>) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            aria-label="Trocar ícone e cor"
            className="rounded-xl transition-transform hover:scale-105"
            type="button"
          />
        }
      >
        <AgentAvatar agent={agent} className="size-12 text-2xl" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="grid grid-cols-8 gap-1">
          {AGENT_EMOJIS.map((e) => (
            <button
              aria-label={`Ícone ${e}`}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg text-lg hover:bg-muted",
                agent.icon === e && "bg-muted"
              )}
              key={e}
              onClick={() => onChange({ icon: e })}
              type="button"
            >
              {e}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {AGENT_COLORS.map((c, i) => (
            <button
              aria-label={`Cor ${i + 1}`}
              className={cn(
                "size-7 rounded-full ring-offset-2 ring-offset-popover",
                c,
                agent.color === i && "ring-2 ring-foreground/60"
              )}
              key={c}
              onClick={() => onChange({ color: i })}
              type="button"
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Header({
  agent,
  onChange,
  onBack,
  onSelect,
}: {
  agent: Agent;
  onChange: (patch: Partial<Agent>) => void;
  onBack: () => void;
  onSelect: (id: string | null) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 md:hidden">
        <Button onClick={onBack} size="sm" type="button" variant="ghost">
          <Icon name="IconChevronLeft" />
          Agentes
        </Button>
      </div>
      <div className="flex items-start gap-3">
        <LookPicker agent={agent} onChange={onChange} />
        <div className="flex min-w-0 flex-1 flex-col">
          <input
            aria-label="Nome do agente"
            className="w-full min-w-0 bg-transparent font-semibold text-xl tracking-tight outline-none md:text-2xl"
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nome do agente"
            value={agent.name}
          />
          <input
            aria-label="Descrição do agente"
            className="w-full min-w-0 bg-transparent text-muted-foreground text-sm outline-none"
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Para que serve este agente?"
            value={agent.description}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="mr-auto flex items-center gap-2 text-sm"
          htmlFor={`${agent.id}-enabled`}
        >
          <Switch
            checked={agent.enabled}
            id={`${agent.id}-enabled`}
            onCheckedChange={(enabled) => onChange({ enabled })}
          />
          {agent.enabled ? "Ativo" : "Pausado"}
        </label>
        <Button
          onClick={() => onSelect(duplicateAgent(agent).id)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Icon name="IconSquareBehindSquare1" />
          Duplicar
        </Button>
        {confirm ? (
          <Button
            onClick={() => {
              deleteAgent(agent.id);
              onSelect(null);
            }}
            size="sm"
            type="button"
            variant="destructive"
          >
            Confirmar exclusão
          </Button>
        ) : (
          <Button
            onClick={() => setConfirm(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Icon name="IconTrashCan" />
            Excluir
          </Button>
        )}
      </div>
    </div>
  );
}

export function AgentEditor({
  agent,
  onBack,
  onSelect,
}: {
  agent: Agent;
  onBack: () => void;
  onSelect: (id: string | null) => void;
}) {
  const [view, setView] = useState<View>("config");
  const onChange = (patch: Partial<Agent>) => saveAgent({ ...agent, ...patch });
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 md:p-8">
      <Header
        agent={agent}
        key={agent.id}
        onBack={onBack}
        onChange={onChange}
        onSelect={onSelect}
      />
      <div className="sm:w-80">
        <Segmented
          label="Visualização"
          onChange={setView}
          options={VIEWS}
          value={view}
        />
      </div>
      {view === "config" ? (
        <div className="flex flex-col gap-4">
          <TaskSection agent={agent} onChange={onChange} />
          <ModelSection agent={agent} onChange={onChange} />
          <ToolsSection agent={agent} onChange={onChange} />
          <PermissionsSection agent={agent} onChange={onChange} />
          <McpSection agent={agent} onChange={onChange} />
          <SubagentsSection agent={agent} onChange={onChange} />
          <TriggerSection agent={agent} onChange={onChange} />
        </div>
      ) : (
        <AgentCode agent={agent} />
      )}
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon className="size-3.5" name="IconCheckmark1" />
        Salvo automaticamente neste dispositivo
      </p>
    </div>
  );
}
