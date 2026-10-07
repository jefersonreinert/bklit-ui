"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AGENT_COLORS } from "@/lib/agents/catalog";
import { deleteAgent, duplicateAgent, saveAgent } from "@/lib/agents/store";
import type { Agent } from "@/lib/agents/types";
import { Icon } from "@/lib/icons";
import { isLogo } from "@/lib/notes/svgl";
import { cn } from "@/lib/utils";
import { AssetPicker } from "../notes/note-assets";
import { NoteIcon } from "../notes/note-hero";
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

const DEFAULT_ICON = "🤖";

/** Agent icon: emoji on its color, or a library image / svgl logo. */
export function AgentAvatar({
  agent,
  className,
}: {
  agent: Pick<Agent, "icon" | "color">;
  className?: string;
}) {
  const emoji = !(agent.icon.startsWith("att:") || isLogo(agent.icon));
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
        emoji
          ? AGENT_COLORS[agent.color % AGENT_COLORS.length]
          : "border bg-background",
        className
      )}
    >
      <NoteIcon
        className={emoji ? undefined : "size-[0.95em]"}
        icon={agent.icon || DEFAULT_ICON}
      />
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
    <AssetPicker
      hasValue={agent.icon !== DEFAULT_ICON}
      mode="icon"
      onPick={(icon) => onChange({ icon: icon ?? DEFAULT_ICON })}
    >
      <button
        aria-label="Trocar ícone do agente"
        className="rounded-xl transition-transform hover:scale-105"
        type="button"
      >
        <AgentAvatar agent={agent} className="size-12 text-2xl" />
      </button>
    </AssetPicker>
  );
}

/** Background tint behind emoji icons. */
function ColorPicker({
  agent,
  onChange,
}: {
  agent: Agent;
  onChange: (patch: Partial<Agent>) => void;
}) {
  return (
    <fieldset
      aria-label="Cor do ícone"
      className="m-0 flex items-center gap-1.5 border-0 p-0"
    >
      {AGENT_COLORS.map((c, i) => (
        <button
          aria-label={`Cor ${i + 1}`}
          aria-pressed={agent.color === i}
          className={cn(
            "size-5 rounded-full ring-offset-2 ring-offset-background",
            c,
            agent.color === i && "ring-2 ring-foreground/50"
          )}
          key={c}
          onClick={() => onChange({ color: i })}
          type="button"
        />
      ))}
    </fieldset>
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
          {agent.icon.startsWith("att:") || isLogo(agent.icon) ? null : (
            <div className="mt-2">
              <ColorPicker agent={agent} onChange={onChange} />
            </div>
          )}
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
