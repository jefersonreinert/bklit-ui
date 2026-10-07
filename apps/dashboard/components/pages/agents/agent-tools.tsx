"use client";

import { useEffect, useId, useState } from "react";
import { TOOL_GROUPS, TOOL_NAMES } from "@/lib/agents/catalog";
import type { Agent } from "@/lib/agents/types";
import { cn } from "@/lib/utils";
import { Field, Section, textareaClass, toLines } from "./agent-ui";

type ToolState = "allow" | "ask" | "deny";

const STATES: Record<
  ToolState,
  { label: string; next: ToolState; className: string }
> = {
  allow: {
    label: "Liberado",
    next: "deny",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  deny: {
    label: "Bloqueado",
    next: "ask",
    className:
      "border-rose-500/40 bg-rose-500/10 text-rose-700 line-through decoration-rose-500/50 dark:text-rose-300",
  },
  ask: {
    label: "Pergunta",
    next: "allow",
    className: "border-border bg-background text-muted-foreground",
  },
};

function stateOf(agent: Agent, name: string): ToolState {
  if (agent.allowedTools.includes(name)) {
    return "allow";
  }
  if (agent.disallowedTools.includes(name)) {
    return "deny";
  }
  return "ask";
}

/** A textarea of one rule per line, committed on blur. */
export function LinesInput({
  id,
  value,
  onCommit,
  placeholder,
}: {
  id: string;
  value: string[];
  onCommit: (lines: string[]) => void;
  placeholder: string;
}) {
  const joined = value.join("\n");
  const [draft, setDraft] = useState(joined);
  useEffect(() => setDraft(joined), [joined]);
  return (
    <textarea
      className={cn(textareaClass, "min-h-16 font-mono text-xs")}
      id={id}
      onBlur={() => onCommit(toLines(draft))}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder}
      value={draft}
    />
  );
}

export function ToolsSection({
  agent,
  onChange,
}: {
  agent: Agent;
  onChange: (patch: Partial<Agent>) => void;
}) {
  const ids = useId();
  const setState = (name: string, state: ToolState) => {
    const allowed = agent.allowedTools.filter((t) => t !== name);
    const denied = agent.disallowedTools.filter((t) => t !== name);
    onChange({
      allowedTools: state === "allow" ? [...allowed, name] : allowed,
      disallowedTools: state === "deny" ? [...denied, name] : denied,
    });
  };
  const extraAllowed = agent.allowedTools.filter(
    (t) => !TOOL_NAMES.includes(t)
  );
  const extraDenied = agent.disallowedTools.filter(
    (t) => !TOOL_NAMES.includes(t)
  );
  return (
    <Section
      description="Toque para alternar: liberado (sem pedir), pergunta, bloqueado. Viram allowedTools e disallowedTools."
      icon="IconSettingsSliderHor"
      title="Ferramentas"
    >
      {TOOL_GROUPS.map((group) => (
        <div className="flex flex-col gap-2" key={group.label}>
          <p className="text-muted-foreground text-xs">{group.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {group.tools.map((tool) => {
              const state = stateOf(agent, tool.name);
              const s = STATES[state];
              return (
                <button
                  aria-label={`${tool.name}: ${s.label}`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                    s.className
                  )}
                  key={tool.name}
                  onClick={() => setState(tool.name, s.next)}
                  title={`${tool.label} — ${s.label}`}
                  type="button"
                >
                  <span className="font-medium font-mono">{tool.name}</span>
                  <span className="opacity-70">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          hint="Uma regra por linha, ex.: Bash(npm run *), Edit(/src/**)"
          htmlFor={`${ids}-allow`}
          label="Regras liberadas extras"
        >
          <LinesInput
            id={`${ids}-allow`}
            onCommit={(lines) =>
              onChange({
                allowedTools: [
                  ...agent.allowedTools.filter((t) => TOOL_NAMES.includes(t)),
                  ...lines,
                ],
              })
            }
            placeholder="Bash(git status)"
            value={extraAllowed}
          />
        </Field>
        <Field
          hint="Ex.: Read(./.env), mcp__github__delete_file"
          htmlFor={`${ids}-deny`}
          label="Regras bloqueadas extras"
        >
          <LinesInput
            id={`${ids}-deny`}
            onCommit={(lines) =>
              onChange({
                disallowedTools: [
                  ...agent.disallowedTools.filter((t) =>
                    TOOL_NAMES.includes(t)
                  ),
                  ...lines,
                ],
              })
            }
            placeholder="Bash(rm *)"
            value={extraDenied}
          />
        </Field>
      </div>
    </Section>
  );
}
