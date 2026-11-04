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
}

interface Plan {
  thought: string;
  actions: Action[];
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
      await wait(1200 * attempt);
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
      return (await res.json()) as Plan;
    }
  }
  return null;
}

const quote = (s: string, max = 40) =>
  `“${s.length > max ? `${s.slice(0, max)}…` : s}”`;

async function waitForPath(from: string, to: string) {
  for (let i = 0; i < 60 && window.location.pathname === from; i++) {
    await wait(50);
  }
  // The new page renders its controls right after the route changes
  await wait(
    window.location.pathname.replace(TRAILING_SLASHES, "") === to ? 450 : 150
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
      click(target);
      await wait(250);
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
      type(target, text);
      if (a.submit) {
        await wait(60);
        press("Enter", target);
      }
      await wait(a.submit ? 250 : 40);
      return {
        label: `Digitando ${quote(text)}${a.submit ? " e enviando" : ""}`,
        ok: true,
        result: a.submit ? "typed and pressed Enter" : "typed",
      };
    }
    case "press": {
      const key = a.key ?? "Enter";
      press(key, target);
      await wait(200);
      return { label: `Tecla ${key}`, ok: true, result: `pressed ${key}` };
    }
    case "scroll": {
      scroll(a.direction ?? "down");
      await wait(150);
      return {
        label:
          a.direction === "up" ? "Rolando para cima" : "Rolando para baixo",
        ok: true,
        result: "scrolled",
      };
    }
    default: {
      await wait(700);
      return { label: "Esperando a página", ok: true, result: "waited" };
    }
  }
}

const finish = (
  status: "done" | "asking",
  thought: string,
  message: string
) => {
  set({
    status,
    message,
    steps: [
      ...state.steps,
      {
        thought,
        label: status === "done" ? "Concluído" : "Pergunta",
        ok: true,
      },
    ],
  });
};

const summary = (a: Action) =>
  `${a.type}${a.id ? ` #${a.id}` : ""}${a.path ? ` ${a.path}` : ""}${a.text ? ` ${JSON.stringify(a.text)}` : ""}${a.key ? ` ${a.key}` : ""}`;

/** Does the plan's actions in order; false when it had to stop early. */
async function runPlan(id: number, plan: Plan, page: PageSnapshot) {
  const start = window.location.pathname;
  for (const action of plan.actions) {
    if (id !== run) {
      return false;
    }
    if (action.type === "done" || action.type === "ask") {
      finish(
        action.type === "done" ? "done" : "asking",
        plan.thought,
        plan.message ?? (action.type === "done" ? "Pronto." : "")
      );
      return false;
    }
    const steps = [
      ...state.steps,
      { thought: plan.thought, label: "…", ok: null },
    ];
    set({ steps });
    let done: { label: string; ok: boolean; result: string };
    try {
      done = await perform(action, page);
    } catch {
      done = { label: "Ação", ok: false, result: "failed" };
    }
    history.push({ action: summary(action), result: done.result });
    set({
      steps: [
        ...steps.slice(0, -1),
        { thought: plan.thought, label: done.label, ok: done.ok },
      ],
    });
    // Ids belong to the screen that was read: a new page or a failure
    // means reading it again
    if (!done.ok || window.location.pathname !== start) {
      return true;
    }
  }
  return true;
}

async function loop(id: number) {
  for (let step = 0; step < MAX_STEPS; step++) {
    if (id !== run) {
      return;
    }
    const page = snapshot();
    const plan = await ask(state.goal, page);
    if (id !== run) {
      return;
    }
    if (plan === "locked") {
      set({ status: "locked", message: null });
      return;
    }
    if (!plan?.actions?.length) {
      set({
        status: "error",
        message: "A IA não respondeu. Tente de novo em instantes.",
      });
      return;
    }
    if (!(await runPlan(id, plan, page))) {
      return;
    }
  }
  set({
    status: "done",
    message: "Parei depois de 30 rodadas. Quer que eu continue?",
  });
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
