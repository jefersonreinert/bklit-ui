"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AI_MODELS, DEFAULT_MODEL } from "@/lib/ai-models";
import { codeFetch, post } from "@/lib/code/client";
import type { CodeSessionSummary } from "@/lib/code/types";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ClawdWalker } from "./clawd";
import {
  CodeComposer,
  type CodeMode,
  type ImagePayload,
} from "./code-composer";
import { ConnectGithub } from "./code-setup";

const BUDGETS = [
  { value: 0, label: "Sem limite" },
  { value: 2, label: "US$ 2" },
  { value: 5, label: "US$ 5" },
  { value: 20, label: "US$ 20" },
];

const SELECT =
  "h-9 rounded-full border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

function BranchSelect({
  repo,
  value,
  onChange,
}: {
  repo: string;
  value: string;
  onChange: (b: string) => void;
}) {
  const [branches, setBranches] = useState<string[] | null>(null);
  useEffect(() => {
    codeFetch<string[]>(`repos/?branches=${encodeURIComponent(repo)}`)
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [repo]);
  return (
    <select
      aria-label={`Branch de ${repo}`}
      className={cn(SELECT, "max-w-40")}
      onChange={(e) => onChange(e.target.value)}
      value={value}
    >
      <option value="">Branch padrão</option>
      {(branches ?? []).map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
    </select>
  );
}

export function NewSession({
  repos,
  github,
  onPickRepos,
  onCreated,
  onBack,
}: {
  repos: string[];
  github: string | null;
  onPickRepos: () => void;
  onCreated: (s: CodeSessionSummary) => void;
  onBack: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(repos.slice(0, 1));
  const [branches, setBranches] = useState<Record<string, string>>({});
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [mode, setMode] = useState<CodeMode>("auto");
  const [budget, setBudget] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setChosen((c) => {
      const kept = c.filter((r) => repos.includes(r));
      return kept.length ? kept : repos.slice(0, 1);
    });
  }, [repos]);

  const toggle = (r: string) =>
    setChosen((c) => (c.includes(r) ? c.filter((x) => x !== r) : [...c, r]));

  const start = async (text: string, images: ImagePayload[]) => {
    if (!chosen.length) {
      setError("Escolha pelo menos um repositório.");
      return false;
    }
    setError(null);
    setStarting(true);
    try {
      const session = await post<CodeSessionSummary>("sessions/", {
        prompt: text || "Veja a imagem.",
        repos: chosen.map((repo) => ({ repo, branch: branches[repo] || null })),
        model,
        mode,
        budgetUsd: budget || null,
        images: images.map(({ mediaType, data }) => ({ mediaType, data })),
      });
      onCreated(session);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar.");
      return false;
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Button
          aria-label="Voltar"
          className="rounded-full"
          onClick={onBack}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon className="size-5" name="IconChevronLeft" />
        </Button>
        <h2 className="font-semibold">Nova sessão</h2>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5">
        <ClawdWalker />
      </div>
      <div className="mx-auto w-full max-w-3xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex flex-col gap-2">
          {repos.map((r) => (
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border bg-card py-1 pr-1 pl-3.5 transition-opacity",
                chosen.includes(r) ? "" : "opacity-55"
              )}
              key={r}
            >
              <button
                aria-pressed={chosen.includes(r)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                onClick={() => toggle(r)}
                type="button"
              >
                <Icon
                  className="size-4 shrink-0"
                  name={chosen.includes(r) ? "IconCheckCircle2" : "IconGithub"}
                />
                <span className="truncate">{r}</span>
              </button>
              {chosen.includes(r) ? (
                <BranchSelect
                  onChange={(b) => setBranches((cur) => ({ ...cur, [r]: b }))}
                  repo={r}
                  value={branches[r] ?? ""}
                />
              ) : null}
            </div>
          ))}
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {github ? (
              <button
                className={cn(SELECT, "flex shrink-0 items-center gap-1.5")}
                onClick={onPickRepos}
                type="button"
              >
                <Icon className="size-4" name="IconPlusSmall" />
                {repos.length ? "Repositórios" : "Adicionar repositório"}
              </button>
            ) : (
              <ConnectGithub />
            )}
            <select
              aria-label="Modelo"
              className={cn(SELECT, "shrink-0")}
              onChange={(e) => setModel(e.target.value)}
              value={model}
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name.replace("Claude ", "")}
                </option>
              ))}
            </select>
            <select
              aria-label="Limite de gasto"
              className={cn(SELECT, "shrink-0")}
              onChange={(e) => setBudget(Number(e.target.value))}
              value={budget}
            >
              {BUDGETS.map((b) => (
                <option key={b.value} value={b.value}>
                  Limite: {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? (
          <p className="mb-2 px-2 text-destructive text-sm">{error}</p>
        ) : null}
        <CodeComposer
          autoFocus
          mode={mode}
          onMode={setMode}
          onSend={start}
          placeholder={starting ? "Iniciando…" : "Descreva a tarefa…"}
        />
      </div>
    </div>
  );
}
