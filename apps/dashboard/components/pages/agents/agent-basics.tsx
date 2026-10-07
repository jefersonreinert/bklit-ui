"use client";

import { useEffect, useId, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  CRON_PRESETS,
  EFFORTS,
  PERMISSION_MODES,
  SETTING_SOURCES,
} from "@/lib/agents/catalog";
import type {
  Agent,
  Effort,
  SystemMode,
  TriggerType,
} from "@/lib/agents/types";
import { AI_MODELS } from "@/lib/ai-models";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  Field,
  inputClass,
  Section,
  Segmented,
  textareaClass,
} from "./agent-ui";

interface Props {
  agent: Agent;
  onChange: (patch: Partial<Agent>) => void;
}

const SYSTEM_MODES: { id: SystemMode; label: string }[] = [
  { id: "preset", label: "Claude Code" },
  { id: "custom", label: "Personalizado" },
  { id: "none", label: "Nenhum" },
];

const TRIGGERS: { id: TriggerType; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "schedule", label: "Agendado" },
  { id: "webhook", label: "Webhook" },
];

const SYSTEM_HINT: Record<SystemMode, string> = {
  preset:
    "Usa o prompt do Claude Code (ferramentas, segurança, estilo) e acrescenta o texto abaixo.",
  custom: "Substitui todo o prompt de sistema pelo texto abaixo.",
  none: "Sem prompt de sistema — só a tarefa.",
};

const numberOrNull = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

/** A positive number input that keeps partial typing ("2.", "") local. */
function NumberInput({
  id,
  value,
  onChange,
  decimal,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  decimal?: boolean;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setDraft((d) => (numberOrNull(d) === value ? d : String(value ?? "")));
  }, [value]);
  return (
    <input
      className={inputClass}
      id={id}
      inputMode={decimal ? "decimal" : "numeric"}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(numberOrNull(e.target.value));
      }}
      placeholder="Sem limite"
      value={draft}
    />
  );
}

export function TaskSection({ agent, onChange }: Props) {
  const id = useId();
  return (
    <Section
      description="O que o agente deve fazer a cada execução (prompt)."
      icon="IconTarget"
      title="Tarefa"
    >
      <textarea
        aria-label="Tarefa do agente"
        className={cn(textareaClass, "min-h-28")}
        onChange={(e) => onChange({ prompt: e.target.value })}
        placeholder="Ex.: Leia os pedidos de ontem e escreva um resumo das vendas em ./resumos/hoje.md"
        value={agent.prompt}
      />
      <Field
        hint={SYSTEM_HINT[agent.systemMode]}
        htmlFor={`${id}-system`}
        label="Instruções de sistema"
      >
        <Segmented
          label="Tipo de prompt de sistema"
          onChange={(systemMode) => onChange({ systemMode })}
          options={SYSTEM_MODES}
          value={agent.systemMode}
        />
        {agent.systemMode === "none" ? null : (
          <textarea
            className={textareaClass}
            id={`${id}-system`}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            placeholder="Você é o assistente do Casa Brasa. Responda em português…"
            value={agent.systemPrompt}
          />
        )}
      </Field>
    </Section>
  );
}

export function ModelSection({ agent, onChange }: Props) {
  const id = useId();
  return (
    <Section
      description="Modelo, esforço de raciocínio e limites de cada execução."
      icon="IconSparklesSoft"
      title="Modelo e limites"
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {AI_MODELS.map((m) => (
          <button
            aria-pressed={agent.model === m.id}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
              agent.model === m.id
                ? "border-foreground/40 bg-muted"
                : "hover:bg-muted/50"
            )}
            key={m.id}
            onClick={() => onChange({ model: m.id })}
            type="button"
          >
            <span className="font-medium text-sm">{m.name}</span>
            <span className="text-muted-foreground text-xs">
              {m.description}
            </span>
          </button>
        ))}
      </div>
      <Field label="Esforço">
        <Segmented
          label="Esforço"
          onChange={(effort) => onChange({ effort: effort as Effort | "" })}
          options={EFFORTS}
          value={agent.effort}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          hint="maxTurns — vazio = sem limite"
          htmlFor={`${id}-turns`}
          label="Máximo de turnos"
        >
          <NumberInput
            id={`${id}-turns`}
            onChange={(maxTurns) => onChange({ maxTurns })}
            value={agent.maxTurns}
          />
        </Field>
        <Field
          hint="maxBudgetUsd — para ao atingir este custo"
          htmlFor={`${id}-budget`}
          label="Orçamento (US$)"
        >
          <NumberInput
            decimal
            id={`${id}-budget`}
            onChange={(maxBudgetUsd) => onChange({ maxBudgetUsd })}
            value={agent.maxBudgetUsd}
          />
        </Field>
      </div>
    </Section>
  );
}

export function PermissionsSection({ agent, onChange }: Props) {
  const id = useId();
  const toggleSource = (s: Agent["settingSources"][number]) =>
    onChange({
      settingSources: agent.settingSources.includes(s)
        ? agent.settingSources.filter((x) => x !== s)
        : [...agent.settingSources, s],
    });
  return (
    <Section
      description="Quanto o agente pode fazer sozinho (permissionMode) e onde ele trabalha."
      icon="IconShieldCheck"
      title="Permissões"
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PERMISSION_MODES.map((m) => (
          <button
            aria-pressed={agent.permissionMode === m.id}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
              agent.permissionMode === m.id
                ? "border-foreground/40 bg-muted"
                : "hover:bg-muted/50",
              m.id === "bypassPermissions" &&
                agent.permissionMode === m.id &&
                "border-rose-500/50 bg-rose-500/10"
            )}
            key={m.id}
            onClick={() => onChange({ permissionMode: m.id })}
            type="button"
          >
            <Icon className="mt-0.5 size-4 shrink-0" name={m.icon} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium text-sm">{m.label}</span>
              <span className="text-muted-foreground text-xs">
                {m.description}
              </span>
            </span>
          </button>
        ))}
      </div>
      <Field
        hint="Vazio = diretório onde o script roda"
        htmlFor={`${id}-cwd`}
        label="Pasta de trabalho (cwd)"
      >
        <input
          className={cn(inputClass, "font-mono")}
          id={`${id}-cwd`}
          onChange={(e) => onChange({ cwd: e.target.value })}
          placeholder="/srv/casa-brasa"
          value={agent.cwd}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <p className="font-medium text-xs">
          Configurações carregadas (settingSources)
        </p>
        {SETTING_SOURCES.map((s) => (
          <label
            className="flex items-center justify-between gap-3 text-sm"
            htmlFor={`${id}-${s.id}`}
            key={s.id}
          >
            <span className="text-muted-foreground">{s.label}</span>
            <Switch
              checked={agent.settingSources.includes(s.id)}
              id={`${id}-${s.id}`}
              onCheckedChange={() => toggleSource(s.id)}
              size="sm"
            />
          </label>
        ))}
      </div>
    </Section>
  );
}

export function TriggerSection({ agent, onChange }: Props) {
  const id = useId();
  const setTrigger = (patch: Partial<Agent["trigger"]>) =>
    onChange({ trigger: { ...agent.trigger, ...patch } });
  return (
    <Section
      description="Quando o agente roda automaticamente."
      icon="IconCalendarClock"
      title="Gatilho"
    >
      <Segmented
        label="Gatilho"
        onChange={(type) => setTrigger({ type })}
        options={TRIGGERS}
        value={agent.trigger.type}
      />
      {agent.trigger.type === "schedule" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                aria-pressed={agent.trigger.cron === p.cron}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  agent.trigger.cron === p.cron
                    ? "border-foreground/30 bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={p.cron}
                onClick={() => setTrigger({ cron: p.cron })}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>
          <Field
            hint="minuto hora dia mês dia-da-semana"
            htmlFor={`${id}-cron`}
            label="Expressão cron"
          >
            <input
              className={cn(inputClass, "font-mono")}
              id={`${id}-cron`}
              onChange={(e) => setTrigger({ cron: e.target.value })}
              value={agent.trigger.cron}
            />
          </Field>
        </>
      ) : null}
      {agent.trigger.type === "webhook" ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-muted-foreground text-xs">
          O agente roda quando um serviço externo (GitHub, formulário,
          pagamento) chamar o endpoint dele. A URL aparece aqui quando a
          execução de agentes estiver ativa no servidor.
        </p>
      ) : null}
    </Section>
  );
}
