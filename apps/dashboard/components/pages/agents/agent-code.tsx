"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { slug, toJson, toPython, toTypeScript } from "@/lib/agents/codegen";
import type { Agent } from "@/lib/agents/types";
import { Icon } from "@/lib/icons";
import { Segmented } from "./agent-ui";

type Lang = "ts" | "py" | "json";

const LANGS: { id: Lang; label: string }[] = [
  { id: "ts", label: "TypeScript" },
  { id: "py", label: "Python" },
  { id: "json", label: "JSON" },
];

const INSTALL: Record<Lang, string> = {
  ts: "npm install @anthropic-ai/claude-agent-sdk && npx tsx agent.ts",
  py: "pip install claude-agent-sdk && python agent.py",
  json: "Configuração salva — importe no seu servidor de agentes.",
};

export function AgentCode({ agent }: { agent: Agent }) {
  const [lang, setLang] = useState<Lang>("ts");
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => {
    if (lang === "py") {
      return toPython(agent);
    }
    return lang === "json" ? toJson(agent) : toTypeScript(agent);
  }, [agent, lang]);
  const file = `${slug(agent.name)}.${lang}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the user can still select the text
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <Segmented
            label="Linguagem"
            onChange={setLang}
            options={LANGS}
            value={lang}
          />
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={copy} size="sm" type="button" variant="outline">
            <Icon
              name={copied ? "IconCheckmark1" : "IconSquareBehindSquare1"}
            />
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button onClick={download} size="sm" type="button" variant="outline">
            <Icon name="IconArrowDown" />
            Baixar
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-2 text-muted-foreground text-xs">
          <Icon className="size-3.5" name="IconCode" />
          <span className="font-mono">{file}</span>
        </div>
        <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-[12px] leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
      <p className="flex items-start gap-2 text-muted-foreground text-xs">
        <Icon className="mt-0.5 size-3.5 shrink-0" name="IconConsole" />
        <code className="break-all">{INSTALL[lang]}</code>
      </p>
    </div>
  );
}
