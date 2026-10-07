"use client";

import { useSyncExternalStore } from "react";
import { AGENT_TEMPLATES, BLANK_DRAFT, MCP_PRESETS } from "./catalog";
import type { Agent, AgentMcpServer, AgentSubagent } from "./types";

/**
 * Agents are saved on this device (localStorage). Every write goes through
 * the actions below so open tabs stay in sync.
 */

const KEY = "cb:agents:v1";
const EMPTY: Agent[] = [];
let cache: Agent[] | null = null;
const listeners = new Set<() => void>();

function read(): Agent[] {
  if (cache) {
    return cache;
  }
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Agent[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: Agent[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or private mode: keep working in memory
  }
  for (const l of listeners) {
    l();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAgents() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function saveAgent(agent: Agent) {
  const next = { ...agent, updatedAt: Date.now() };
  const list = read();
  write(
    list.some((a) => a.id === agent.id)
      ? list.map((a) => (a.id === agent.id ? next : a))
      : [next, ...list]
  );
}

export function deleteAgent(id: string) {
  write(read().filter((a) => a.id !== id));
}

export function createAgent(templateId = "blank"): Agent {
  const template = AGENT_TEMPLATES.find((t) => t.id === templateId);
  const now = Date.now();
  const mcpServers: AgentMcpServer[] = (template?.mcp ?? []).flatMap((name) => {
    const preset = MCP_PRESETS.find((p) => p.server.name === name);
    return preset ? [{ ...preset.server, id: uid() }] : [];
  });
  const subagents: AgentSubagent[] = (template?.subagents ?? []).map((s) => ({
    ...s,
    id: uid(),
  }));
  const agent: Agent = {
    ...structuredClone(template?.draft ?? BLANK_DRAFT),
    mcpServers,
    subagents,
    id: uid(),
    createdAt: now,
    updatedAt: now,
  };
  saveAgent(agent);
  return agent;
}

export function duplicateAgent(agent: Agent): Agent {
  const now = Date.now();
  const copy: Agent = {
    ...structuredClone(agent),
    id: uid(),
    name: `${agent.name} (cópia)`,
    createdAt: now,
    updatedAt: now,
  };
  saveAgent(copy);
  return copy;
}
