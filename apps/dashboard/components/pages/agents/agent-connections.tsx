"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  MCP_PRESETS,
  SUBAGENT_MODELS,
  SUBAGENT_TOOLS,
} from "@/lib/agents/catalog";
import { slug } from "@/lib/agents/codegen";
import { uid } from "@/lib/agents/store";
import type {
  Agent,
  AgentMcpServer,
  AgentSubagent,
  McpType,
} from "@/lib/agents/types";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  Field,
  inputClass,
  Section,
  Segmented,
  textareaClass,
} from "./agent-ui";

type Patch = (patch: Partial<Agent>) => void;

const MCP_TYPES: { id: McpType; label: string }[] = [
  { id: "http", label: "HTTP" },
  { id: "sse", label: "SSE" },
  { id: "stdio", label: "stdio" },
];

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      onClick={onClick}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <Icon className="size-4" name="IconTrashCan" />
    </Button>
  );
}

/* ---------------------------------- MCP ---------------------------------- */

function McpCard({
  server,
  onChange,
  onRemove,
}: {
  server: AgentMcpServer;
  onChange: (s: AgentMcpServer) => void;
  onRemove: () => void;
}) {
  const id = server.id;
  const set = (patch: Partial<AgentMcpServer>) =>
    onChange({ ...server, ...patch });
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Nome do servidor"
          className={cn(
            inputClass,
            "w-auto min-w-0 flex-[1_1_10rem] font-mono"
          )}
          onChange={(e) => set({ name: e.target.value })}
          value={server.name}
        />
        <div className="flex-[1_1_11rem] sm:max-w-48">
          <Segmented
            label="Transporte"
            onChange={(type) => set({ type })}
            options={MCP_TYPES}
            value={server.type}
          />
        </div>
        <RemoveButton label="Remover servidor" onClick={onRemove} />
      </div>
      {server.type === "stdio" ? (
        <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
          <Field htmlFor={`${id}-cmd`} label="Comando">
            <input
              className={cn(inputClass, "font-mono")}
              id={`${id}-cmd`}
              onChange={(e) => set({ command: e.target.value })}
              value={server.command}
            />
          </Field>
          <Field htmlFor={`${id}-args`} label="Argumentos">
            <input
              className={cn(inputClass, "font-mono")}
              id={`${id}-args`}
              onChange={(e) => set({ args: e.target.value })}
              value={server.args}
            />
          </Field>
        </div>
      ) : (
        <>
          <Field htmlFor={`${id}-url`} label="URL">
            <input
              className={cn(inputClass, "font-mono")}
              id={`${id}-url`}
              onChange={(e) => set({ url: e.target.value })}
              value={server.url}
            />
          </Field>
          <Field
            hint="Um por linha. ${VAR} lê a variável de ambiente — nunca cole tokens aqui."
            htmlFor={`${id}-headers`}
            label="Cabeçalhos"
          >
            <textarea
              className={cn(textareaClass, "min-h-12 font-mono text-xs")}
              id={`${id}-headers`}
              onChange={(e) => set({ headers: e.target.value })}
              placeholder="Authorization: Bearer ${TOKEN}"
              value={server.headers}
            />
          </Field>
        </>
      )}
      <label
        className="flex items-center justify-between gap-3 text-xs"
        htmlFor={`${id}-auto`}
      >
        <span>
          Aprovar todas as ferramentas{" "}
          <code className="text-muted-foreground">
            mcp__{slug(server.name, "server")}__*
          </code>
        </span>
        <Switch
          checked={server.autoApprove}
          id={`${id}-auto`}
          onCheckedChange={(autoApprove) => set({ autoApprove })}
          size="sm"
        />
      </label>
    </div>
  );
}

export function McpSection({
  agent,
  onChange,
}: {
  agent: Agent;
  onChange: Patch;
}) {
  const servers = agent.mcpServers;
  const replace = (next: AgentMcpServer) =>
    onChange({
      mcpServers: servers.map((s) => (s.id === next.id ? next : s)),
    });
  return (
    <Section
      description="Conecte ferramentas externas via Model Context Protocol (mcpServers)."
      icon="IconConnectors1"
      title="Servidores MCP"
    >
      {servers.map((s) => (
        <McpCard
          key={s.id}
          onChange={replace}
          onRemove={() =>
            onChange({ mcpServers: servers.filter((x) => x.id !== s.id) })
          }
          server={s}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        {MCP_PRESETS.map((p) => (
          <Button
            key={p.label}
            onClick={() =>
              onChange({
                mcpServers: [...servers, { ...p.server, id: uid() }],
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <Icon name={p.icon} />
            {p.label}
          </Button>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------- subagents ------------------------------- */

function SubagentCard({
  sub,
  onChange,
  onRemove,
}: {
  sub: AgentSubagent;
  onChange: (s: AgentSubagent) => void;
  onRemove: () => void;
}) {
  const id = sub.id;
  const set = (patch: Partial<AgentSubagent>) => onChange({ ...sub, ...patch });
  const toggleTool = (name: string) =>
    set({
      tools: sub.tools.includes(name)
        ? sub.tools.filter((t) => t !== name)
        : [...sub.tools, name],
    });
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Nome do subagente"
          className={cn(
            inputClass,
            "w-auto min-w-0 flex-[1_1_10rem] font-mono"
          )}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="code-reviewer"
          value={sub.name}
        />
        <select
          aria-label="Modelo do subagente"
          className={cn(inputClass, "w-auto flex-[1_1_8rem] sm:max-w-44")}
          onChange={(e) => set({ model: e.target.value })}
          value={sub.model}
        >
          {SUBAGENT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <RemoveButton label="Remover subagente" onClick={onRemove} />
      </div>
      <Field
        hint="O agente principal usa isto para decidir quando delegar."
        htmlFor={`${id}-desc`}
        label="Quando usar"
      >
        <input
          className={inputClass}
          id={`${id}-desc`}
          onChange={(e) => set({ description: e.target.value })}
          value={sub.description}
        />
      </Field>
      <Field htmlFor={`${id}-prompt`} label="Instruções">
        <textarea
          className={textareaClass}
          id={`${id}-prompt`}
          onChange={(e) => set({ prompt: e.target.value })}
          value={sub.prompt}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <p className="font-medium text-xs">
          Ferramentas{" "}
          <span className="font-normal text-muted-foreground">
            {sub.tools.length ? "" : "(herda todas)"}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUBAGENT_TOOLS.map((name) => (
            <button
              aria-pressed={sub.tools.includes(name)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors",
                sub.tools.includes(name)
                  ? "border-foreground/30 bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
              key={name}
              onClick={() => toggleTool(name)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SubagentsSection({
  agent,
  onChange,
}: {
  agent: Agent;
  onChange: Patch;
}) {
  const subs = agent.subagents;
  const add = () =>
    onChange({
      subagents: [
        ...subs,
        {
          id: uid(),
          name: `subagente-${subs.length + 1}`,
          description: "",
          prompt: "",
          tools: ["Read", "Grep", "Glob"],
          model: "inherit",
        },
      ],
    });
  return (
    <Section
      action={
        <Button onClick={add} size="sm" type="button" variant="outline">
          <Icon name="IconPlusSmall" />
          Subagente
        </Button>
      }
      description="Especialistas que o agente chama pela ferramenta Agent, cada um com contexto próprio."
      icon="IconAgentNetwork"
      title="Subagentes"
    >
      {subs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum subagente. Adicione um para dividir tarefas (ex.: revisor,
          pesquisador, verificador).
        </p>
      ) : null}
      {subs.map((s) => (
        <SubagentCard
          key={s.id}
          onChange={(next) =>
            onChange({
              subagents: subs.map((x) => (x.id === next.id ? next : x)),
            })
          }
          onRemove={() =>
            onChange({ subagents: subs.filter((x) => x.id !== s.id) })
          }
          sub={s}
        />
      ))}
    </Section>
  );
}
