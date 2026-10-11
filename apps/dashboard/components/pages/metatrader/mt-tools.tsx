"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  findMtTool,
  MT_MODULES,
  MT_TOOLS,
  type MtTool,
  TIER_LABEL,
} from "@/lib/metatrader/catalog";
import { cn } from "@/lib/utils";
import {
  type FormValues,
  missingRequired,
  ToolForm,
} from "../telegram/tool-form";
import {
  ConfirmButton,
  type MtOutput,
  Notice,
  OutputView,
  useMtCall,
} from "./mt-shared";

/** Every tool of metatrader-mcp-server with a generated form. */

const TIER_TONE = {
  read: "secondary",
  trade: "outline",
  bulk: "destructive",
} as const;

function extraTool(name: string): MtTool {
  return {
    name,
    module: "market",
    tier: "trade",
    description:
      "Ferramenta que o servidor expõe e o painel ainda não conhece (argumentos em JSON).",
    inputSchema: { type: "object", properties: {} },
  };
}

export function MtTools({
  serverTools,
  canTrade,
}: {
  serverTools: string[] | null;
  canTrade: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("get_account_info");
  const [values, setValues] = useState<FormValues>({});
  const [rawArgs, setRawArgs] = useState("{}");
  const [formError, setFormError] = useState<string | null>(null);
  const [out, setOut] = useState<MtOutput | null>(null);
  const { run, busy } = useMtCall();

  const all = useMemo(
    () => [
      ...MT_TOOLS,
      ...(serverTools ?? []).filter((n) => !findMtTool(n)).map(extraTool),
    ],
    [serverTools]
  );
  const q = query.trim().toLowerCase();
  const groups = MT_MODULES.map((m) => ({
    ...m,
    tools: all.filter(
      (t) =>
        t.module === m.key &&
        (!q || t.name.includes(q) || t.description.toLowerCase().includes(q))
    ),
  })).filter((g) => g.tools.length > 0);
  const tool = all.find((t) => t.name === selected) ?? MT_TOOLS[0];
  if (!tool) {
    return null;
  }
  const isExtra = !findMtTool(tool.name);
  const missing = missingRequired(tool.inputSchema, values);
  const notOnServer =
    serverTools && !tool.rest && !serverTools.includes(tool.name);

  const execute = async () => {
    let args: Record<string, unknown> = values;
    if (isExtra) {
      try {
        args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
      } catch {
        setFormError("JSON inválido.");
        return;
      }
    }
    setFormError(null);
    setOut(await run(tool.name, args));
  };

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <div className="flex flex-col gap-2">
        <Input
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Procurar em ${all.length} ferramentas`}
          value={query}
        />
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {g.label}
              </p>
              <ul className="flex flex-col">
                {g.tools.map((t) => (
                  <li key={t.name}>
                    <button
                      className={cn(
                        "w-full truncate rounded-md px-2 py-1 text-left font-mono text-xs hover:bg-muted",
                        selected === t.name && "bg-primary/10 text-primary"
                      )}
                      onClick={() => {
                        setSelected(t.name);
                        setValues({});
                        setOut(null);
                      }}
                      type="button"
                    >
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-mono font-semibold">{tool.name}</h3>
          <Badge variant={TIER_TONE[tool.tier]}>{TIER_LABEL[tool.tier]}</Badge>
          {tool.rest ? <Badge variant="outline">API HTTP</Badge> : null}
        </div>
        <p className="text-muted-foreground text-sm">{tool.description}</p>
        {notOnServer ? (
          <Notice tone="error">
            O servidor ligado não lista esta ferramenta (versão diferente?).
          </Notice>
        ) : null}
        {tool.tier !== "read" && !canTrade ? (
          <Notice>Negociação desligada em Conectores → MetaTrader.</Notice>
        ) : null}
        {isExtra ? (
          <textarea
            className="min-h-24 rounded-xl border bg-background p-2 font-mono text-xs"
            onChange={(e) => setRawArgs(e.target.value)}
            value={rawArgs}
          />
        ) : (
          <ToolForm
            onChange={setValues}
            onError={setFormError}
            schema={tool.inputSchema}
            values={values}
          />
        )}
        {formError ? <Notice tone="error">{formError}</Notice> : null}
        <div className="flex gap-2">
          {tool.tier === "read" ? (
            <Button
              disabled={busy || missing.length > 0}
              onClick={execute}
              size="sm"
            >
              {busy ? "A executar…" : "Executar"}
            </Button>
          ) : (
            <ConfirmButton
              confirm={`Confirmar ${tool.name}`}
              disabled={busy || missing.length > 0}
              label={busy ? "A executar…" : "Executar"}
              onConfirm={execute}
              variant="default"
            />
          )}
          {missing.length > 0 ? (
            <span className="self-center text-muted-foreground text-xs">
              Falta: {missing.join(", ")}
            </span>
          ) : null}
        </div>
        {out ? <OutputView out={out} /> : null}
      </div>
    </div>
  );
}
