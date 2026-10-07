"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IconName } from "@/lib/icons";
import type {
  CodePhase,
  CodeRepo,
  CodeSessionDetail,
  CodeSessionSummary,
  CodeStatus,
} from "./types";

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api`;

export class CodeApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function codeFetch<T>(path: string, init?: RequestInit) {
  const res = await fetch(`${API}/code/${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new CodeApiError(data.error ?? `Erro ${res.status}`, res.status);
  }
  return data as T;
}

export const post = <T>(path: string, body: unknown) =>
  codeFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export async function unlock(code: string) {
  const res = await fetch(`${API}/whatsapp/unlock/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

/** Polls `path` every `ms` while the tab is visible; `ms` null pauses. */
function usePolled<T>(path: string | null, ms: number | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<CodeApiError | null>(null);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) {
      return;
    }
    try {
      const next = await codeFetch<T>(path);
      if (alive.current) {
        setData(next);
        setError(null);
      }
    } catch (err) {
      if (alive.current) {
        setError(
          err instanceof CodeApiError
            ? err
            : new CodeApiError("Falha de rede", 0)
        );
      }
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    setData(null);
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!(path && ms)) {
      return;
    }
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        load();
      }
    }, ms);
    return () => clearInterval(t);
  }, [path, ms, load]);

  return { data, error, reload: load };
}

export const useCodeStatus = () => usePolled<CodeStatus>("status/", null);

export function useSessions(enabled: boolean) {
  return usePolled<CodeSessionSummary[]>(enabled ? "sessions/" : null, 8000);
}

export function useSession(id: string | null, busy: boolean) {
  return usePolled<CodeSessionDetail>(
    id ? `sessions/${id}/` : null,
    busy ? 2500 : 10_000
  );
}

export function useRepos(enabled: boolean) {
  return usePolled<CodeRepo[]>(enabled ? "repos/" : null, null);
}

/* ------------------------------ labels/looks ----------------------------- */

export const PHASES: Record<
  CodePhase,
  { label: string; line: string; icon: IconName }
> = {
  needs_input: {
    label: "Precisa de você",
    line: "Aguardando você",
    icon: "IconHand5Finger",
  },
  review: {
    label: "Pronto para revisão",
    line: "Pronto para revisão",
    icon: "IconEyeOpen",
  },
  working: { label: "Trabalhando", line: "Trabalhando…", icon: "IconLoader" },
  completed: {
    label: "Concluídas",
    line: "Concluída",
    icon: "IconCheckCircle2",
  },
  archived: { label: "Arquivadas", line: "Arquivada", icon: "IconArchive1" },
};

const BRANCH_LINE = /^BRANCH:\s*([\w.-]+\/[\w.-]+)\s+(\S+)\s*$/gm;

/** Branches the agent reported pushing (`BRANCH: owner/repo branch`). */
export function pushedBranches(texts: string[]) {
  const found = new Map<string, { repo: string; branch: string }>();
  for (const t of texts) {
    for (const m of t.matchAll(BRANCH_LINE)) {
      if (m[1] && m[2]) {
        found.set(`${m[1]}#${m[2]}`, { repo: m[1], branch: m[2] });
      }
    }
  }
  return [...found.values()];
}

/** Agent text without the machine-readable BRANCH lines. */
export const stripBranches = (text: string) =>
  text.replace(BRANCH_LINE, "").trimEnd();

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) {
    return "agora";
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)} min`;
  }
  if (s < 86_400) {
    return `${Math.floor(s / 3600)} h`;
  }
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
  });
}

/* ---------------------------- selected repos ----------------------------- */

const REPOS_KEY = "cb:code:repos";

export function readSavedRepos(): string[] {
  try {
    const raw = localStorage.getItem(REPOS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveRepos(repos: string[]) {
  try {
    localStorage.setItem(REPOS_KEY, JSON.stringify(repos));
  } catch {
    // Private mode: selection lasts for this visit only
  }
}
