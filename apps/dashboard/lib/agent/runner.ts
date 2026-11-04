"use client";

import { useSyncExternalStore } from "react";
import { shownLocale } from "@/lib/i18n/locale";
import { getSession } from "@/lib/pos/store";
import {
  click,
  elementById,
  hideCursor,
  type PageSnapshot,
  press,
  scroll,
  snapshot,
  type,
} from "./dom";

/**
 * The app agent's loop, kept outside React so it carries on while it moves
 * between pages: read the screen → ask /api/agent for one action → do it
 * visibly → repeat, until the request is done or it needs to ask.
 */

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/agent/`;
const MAX_STEPS = 30;

export type AgentStatus =
  | "idle"
  | "running"
  | "asking"
  | "done"
  | "error"
  | "locked";

export interface AgentStep {
  thought: string;
  label: string;
  ok: boolean | null;
}

export interface AgentState {
  status: AgentStatus;
  goal: string;
  steps: AgentStep[];
  message: string | null;
}

interface Action {
  thought: string;
  type:
    | "navigate"
    | "click"
    | "type"
    | "press"
    | "scroll"
    | "wait"
    | "done"
    | "ask";
  id: number | null;
  text: string | null;
  path: string | null;
  key: string | null;
  submit: boolean | null;
  direction: "up" | "down" | null;
  message: string | null;
}

let state: AgentState = { status: "idle", goal: "", steps: [], message: null };
let history: { action: string; result: string }[] = [];
let run = 0;
const listeners = new Set<() => void>();

function set(next: Partial<AgentState>) {
  state = { ...state, ...next };
  for (const l of listeners) {
    l();
  }
}

export function useAgent() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => state
  );
}

/** Set by the dock (Next's router); plain navigation as a fallback. */
let navigator: (path: string) => void = (path) => {
  window.location.assign(path);
};
export function setNavigator(fn: (path: string) => void) {
  navigator = fn;
}

const TRAILING_SLASHES = /\/+$/;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function languageName() {
  const code = shownLocale();
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(
        code === "pt" ? "pt-BR" : code
      ) ?? "Brazilian Portuguese"
    );
  } catch {
    return "Brazilian Portuguese";
  }
}

async function ask(goal: string, page: PageSnapshot) {
  const session = getSession();
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) {
      await wait(2500 * attempt);
    }
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(session ? { "x-pos-session": session } : {}),
      },
      body: JSON.stringify({ goal, page, history, language: languageName() }),
    }).catch(() => null);
    if (res?.status === 401) {
      return "locked" as const;
    }
    if (res?.ok) {
      return (await res.json()) as Action;
    }
  }
  return null;
}

const quote = (s: string, max = 40) =>
  `“${s.length > max ? `${s.slice(0, max)}…` : s}”`;

async function waitForPath(from: string, to: string) {
  for (let i = 0; i < 25 && window.location.pathname === from; i++) {
    await wait(120);
  }
  await wait(
    window.location.pathname.replace(TRAILING_SLASHES, "") === to ? 1200 : 400
  );
}

/** Does one action; returns the label shown and the result for the AI. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one case per action type
async function perform(a: Action, page: PageSnapshot) {
  const target = a.id ? elementById(a.id) : null;
  const name = a.id
    ? (page.elements.find((e) => e.id === a.id)?.label ?? `#${a.id}`)
    : "";
  switch (a.type) {
    case "navigate": {
      const path = (a.path ?? "").trim();
      if (!path.startsWith("/")) {
        return { label: "Abrir página", ok: false, result: "invalid path" };
      }
      const from = window.location.pathname;
      navigator(path);
      await waitForPath(from, path.replace(TRAILING_SLASHES, ""));
      return {
        label: `Abrindo ${path}`,
        ok: true,
        result: `now on ${window.location.pathname}`,
      };
    }
    case "click": {
      if (!target) {
        return {
          label: `Clicar em ${quote(name)}`,
          ok: false,
          result: "element not found",
        };
      }
      await click(target);
      await wait(900);
      return {
        label: `Clicando em ${quote(name)}`,
        ok: true,
        result: "clicked",
      };
    }
    case "type": {
      if (!target) {
        return { label: "Digitar", ok: false, result: "element not found" };
      }
      const text = a.text ?? "";
      await type(target, text);
      if (a.submit) {
        await wait(200);
        press("Enter", target);
      }
      await wait(700);
      return {
        label: `Digitando ${quote(text)}${a.submit ? " e enviando" : ""}`,
        ok: true,
        result: a.submit ? "typed and pressed Enter" : "typed",
      };
    }
    case "press": {
      const key = a.key ?? "Enter";
      press(key, target);
      await wait(700);
      return { label: `Tecla ${key}`, ok: true, result: `pressed ${key}` };
    }
    case "scroll": {
      scroll(a.direction ?? "down");
      await wait(800);
      return {
        label:
          a.direction === "up" ? "Rolando para cima" : "Rolando para baixo",
        ok: true,
        result: "scrolled",
      };
    }
    default: {
      await wait(1500);
      return { label: "Esperando a página", ok: true, result: "waited" };
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the read → ask → act loop with its exits
async function loop(id: number) {
  for (let step = 0; step < MAX_STEPS; step++) {
    if (id !== run) {
      return;
    }
    const page = snapshot();
    const action = await ask(state.goal, page);
    if (id !== run) {
      return;
    }
    if (action === "locked") {
      set({ status: "locked", message: null });
      hideCursor();
      return;
    }
    if (!action) {
      set({
        status: "error",
        message: "A IA não respondeu. Tente de novo em instantes.",
      });
      hideCursor();
      return;
    }
    if (action.type === "done" || action.type === "ask") {
      set({
        status: action.type === "done" ? "done" : "asking",
        message: action.message ?? (action.type === "done" ? "Pronto." : ""),
        steps: [
          ...state.steps,
          {
            thought: action.thought,
            label: action.type === "done" ? "Concluído" : "Pergunta",
            ok: true,
          },
        ],
      });
      hideCursor();
      return;
    }
    const steps = [
      ...state.steps,
      { thought: action.thought, label: "…", ok: null },
    ];
    set({ steps });
    let done: { label: string; ok: boolean; result: string };
    try {
      done = await perform(action, page);
    } catch {
      done = { label: "Ação", ok: false, result: "failed" };
    }
    history.push({
      action: `${action.type}${action.id ? ` #${action.id}` : ""}${action.path ? ` ${action.path}` : ""}${action.text ? ` ${JSON.stringify(action.text)}` : ""}${action.key ? ` ${action.key}` : ""}`,
      result: done.result,
    });
    if (id !== run) {
      return;
    }
    set({
      steps: [
        ...steps.slice(0, -1),
        { thought: action.thought, label: done.label, ok: done.ok },
      ],
    });
  }
  set({
    status: "done",
    message: "Parei depois de 30 passos. Quer que eu continue?",
  });
  hideCursor();
}

/** Starts a new request (or answers the agent's question). */
export function startAgent(text: string) {
  const goal = text.trim();
  if (!goal) {
    return;
  }
  if (state.status === "asking" && state.goal) {
    history.push({ action: "asked the owner", result: `he answered: ${goal}` });
    set({ status: "running", message: null });
  } else {
    history = [];
    set({ status: "running", goal, steps: [], message: null });
  }
  run++;
  loop(run);
}

export function stopAgent() {
  run++;
  hideCursor();
  if (state.status === "running") {
    set({ status: "idle", message: "Parado." });
  }
}

export function resetAgent() {
  run++;
  history = [];
  hideCursor();
  set({ status: "idle", goal: "", steps: [], message: null });
}

/** After the PIN: carries on with the same request. */
export function resumeAgent() {
  if (state.goal) {
    set({ status: "running", message: null });
    run++;
    loop(run);
  }
}
