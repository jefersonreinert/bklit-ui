"use client";

import { useMemo, useState } from "react";
import { SearchInput } from "@/components/pages/beverages/bev-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { TG_TOOLS } from "@/lib/telegram/catalog";
import {
  isOptInGroup,
  PANEL_ONLY_TOOLS,
  TG_MODULES,
  type TgTool,
  TIER_LABEL,
  type ToolOutput,
} from "@/lib/telegram/core";
import { cn } from "@/lib/utils";
import { Notice, ToolResultView, useRunTool } from "./telegram-shared";
import { type FormValues, missingRequired, ToolForm } from "./tool-form";

/** Every tool of mcp-telegram, searchable, with a generated form. */

const TOOLS = TG_TOOLS.filter((t) => !PANEL_ONLY_TOOLS.has(t.name));

const TIER_TONE = {
  "read-only": "secondary",
  write: "outline",
  destructive: "destructive",
} as const;

function ToolList({
  query,
  selected,
  onSelect,
  optIn,
}: {
  query: string;
  selected: string | null;
  onSelect: (name: string) => void;
  optIn: string[];
}) {
  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      TG_MODULES.map((m) => ({
        ...m,
        tools: TOOLS.filter(
          (t) =>
            t.module === m.key &&
            (!q ||
              t.name.includes(q) ||
              t.description.toLowerCase().includes(q) ||
              m.label.toLowerCase().includes(q))
        ),
      })).filter((g) => g.tools.length > 0),
    [q]
  );
  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {g.label}
            {isOptInGroup(g.key) && !optIn.includes(g.key)
              ? " · desligado"
              : ""}
          </p>
          <ul className="flex flex-col">
            {g.tools.map((t) => (
              <li key={t.name}>
                <button
                  className={cn(
                    "w-full truncate rounded-md px-2 py-1 text-left font-mono text-xs hover:bg-muted",
                    selected === t.name && "bg-primary/10 text-primary"
                  )}
                  onClick={() => onSelect(t.name)}
                  type="button"
                >
                  {t.name.replace("telegram-", "")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nada encontrado.</p>
      ) : null}
    </div>
  );
}

function runLabel(armed: boolean, busy: boolean) {
  if (armed) {
    return "Toque de novo para confirmar";
  }
  return busy ? "Executando…" : "Executar";
}

function ToolRunner({ tool }: { tool: TgTool }) {
  const { run, busy } = useRunTool();
  const [values, setValues] = useState<FormValues>({});
  const [out, setOut] = useState<ToolOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const missing = missingRequired(tool.inputSchema, values);
  const destructive = tool.tier === "destructive";

  async function onRun() {
    if (destructive && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setError(null);
    setOut(await run(tool.name, values));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="flex flex-wrap items-center gap-2 font-mono font-semibold">
          {tool.name}
          <Badge variant={TIER_TONE[tool.tier]}>{TIER_LABEL[tool.tier]}</Badge>
        </p>
        <p className="mt-1 text-muted-foreground text-sm">{tool.description}</p>
      </div>
      <ToolForm
        onChange={setValues}
        onError={setError}
        schema={tool.inputSchema}
        values={values}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {missing.length > 0 ? (
          <span className="text-muted-foreground text-xs">
            Falta: {missing.join(", ")}
          </span>
        ) : null}
        <Button
          disabled={busy || missing.length > 0}
          onClick={onRun}
          onMouseLeave={() => setArmed(false)}
          variant={armed ? "destructive" : "default"}
        >
          <Icon
            className="size-4"
            name={busy ? "IconLoader" : "IconArrowRight"}
          />
          {runLabel(armed, busy)}
        </Button>
      </div>
      {out ? <ToolResultView out={out} /> : null}
    </div>
  );
}

export function ToolExplorer({ optIn }: { optIn: string[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(
    "telegram-list-chats"
  );
  const tool = TOOLS.find((t) => t.name === selected);
  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <div className="flex flex-col gap-2">
        <SearchInput
          onChange={setQuery}
          placeholder={`Buscar em ${TOOLS.length} ferramentas`}
          value={query}
        />
        <ToolList
          onSelect={setSelected}
          optIn={optIn}
          query={query}
          selected={selected}
        />
      </div>
      <div className="min-w-0 rounded-xl border p-4">
        {tool ? (
          <ToolRunner key={tool.name} tool={tool} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Escolha uma ferramenta.
          </p>
        )}
      </div>
    </div>
  );
}
