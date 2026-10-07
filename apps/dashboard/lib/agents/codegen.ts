import type { Agent, AgentMcpServer, AgentSubagent } from "./types";

/**
 * Turns a saved agent into a runnable Claude Agent SDK script, in
 * TypeScript (`@anthropic-ai/claude-agent-sdk`) or Python
 * (`claude-agent-sdk`). Values are kept in a small neutral tree and then
 * printed in each language's syntax.
 */

interface EnvString {
  env: string;
}
interface Call {
  call: string;
  args: Record<string, Val>;
}
type Val =
  | string
  | number
  | boolean
  | Val[]
  | EnvString
  | Call
  | { [key: string]: Val };

/** [TypeScript key, Python key, value] */
type Entry = [string, string, Val];

const ENV_VAR = /\$\{(\w+)\}/;
const ENV_VARS = /\$\{(\w+)\}/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const DIACRITICS = /[̀-ͯ]/g;
const HEADER_LINE = /^([^:]+):\s*(.*)$/;
const WHITESPACE = /\s+/;
const BACKTICK = /[`\\]|\$\{/g;
const TRIPLE_QUOTE = /\\|"""/g;
const BRACES = /[{}]/g;
const DOUBLED_VAR = /\{\{(\w+)\}\}/g;

export function slug(name: string, fallback = "agent") {
  return (
    name
      .normalize("NFD")
      .replace(DIACRITICS, "")
      .toLowerCase()
      .replace(NON_SLUG, "-")
      .replace(EDGE_DASHES, "") || fallback
  );
}

const isEnv = (v: Val): v is EnvString =>
  typeof v === "object" && v !== null && "env" in v;
const isCall = (v: Val): v is Call =>
  typeof v === "object" && v !== null && "call" in v;

function text(value: string): Val {
  return ENV_VAR.test(value) ? { env: value } : value;
}

/* ------------------------------ option tree ------------------------------ */

function headers(raw: string): Record<string, Val> {
  const out: Record<string, Val> = {};
  for (const line of raw.split("\n")) {
    const m = HEADER_LINE.exec(line.trim());
    if (m?.[1]) {
      out[m[1].trim()] = text(m[2] ?? "");
    }
  }
  return out;
}

function mcpServer(s: AgentMcpServer): Val {
  if (s.type === "stdio") {
    const args = s.args.trim() ? s.args.trim().split(WHITESPACE) : [];
    return {
      type: "stdio",
      command: s.command,
      ...(args.length ? { args } : {}),
    };
  }
  const h = headers(s.headers);
  return {
    type: s.type,
    url: s.url,
    ...(Object.keys(h).length ? { headers: h } : {}),
  };
}

function subagent(s: AgentSubagent): Call {
  return {
    call: "AgentDefinition",
    args: {
      description: s.description,
      prompt: s.prompt,
      ...(s.tools.length ? { tools: s.tools } : {}),
      ...(s.model ? { model: s.model } : {}),
    },
  };
}

function allowed(agent: Agent) {
  const list = [...agent.allowedTools];
  for (const s of agent.mcpServers) {
    if (s.autoApprove) {
      list.push(`mcp__${slug(s.name, "server")}__*`);
    }
  }
  const needsAgent =
    agent.subagents.length > 0 && !agent.disallowedTools.includes("Agent");
  if (needsAgent) {
    list.push("Agent");
  }
  return [...new Set(list)];
}

function systemPrompt(agent: Agent): Val | null {
  if (agent.systemMode === "none") {
    return null;
  }
  if (agent.systemMode === "custom") {
    return agent.systemPrompt;
  }
  return {
    type: "preset",
    preset: "claude_code",
    ...(agent.systemPrompt.trim() ? { append: agent.systemPrompt } : {}),
  };
}

function limits(agent: Agent): Entry[] {
  const out: Entry[] = [];
  if (agent.permissionMode !== "default") {
    out.push(["permissionMode", "permission_mode", agent.permissionMode]);
  }
  if (agent.maxTurns) {
    out.push(["maxTurns", "max_turns", agent.maxTurns]);
  }
  if (agent.maxBudgetUsd) {
    out.push(["maxBudgetUsd", "max_budget_usd", agent.maxBudgetUsd]);
  }
  if (agent.effort) {
    out.push(["effort", "effort", agent.effort]);
  }
  return out;
}

function connections(agent: Agent): Entry[] {
  const out: Entry[] = [];
  if (agent.cwd.trim()) {
    out.push(["cwd", "cwd", agent.cwd.trim()]);
  }
  if (agent.settingSources.length < 3) {
    out.push(["settingSources", "setting_sources", agent.settingSources]);
  }
  if (agent.mcpServers.length) {
    out.push([
      "mcpServers",
      "mcp_servers",
      Object.fromEntries(
        agent.mcpServers.map((s) => [slug(s.name, "server"), mcpServer(s)])
      ),
    ]);
  }
  if (agent.subagents.length) {
    out.push([
      "agents",
      "agents",
      Object.fromEntries(
        agent.subagents.map((s) => [slug(s.name, "subagent"), subagent(s)])
      ),
    ]);
  }
  return out;
}

function options(agent: Agent): Entry[] {
  const out: Entry[] = [];
  if (agent.model) {
    out.push(["model", "model", agent.model]);
  }
  const sp = systemPrompt(agent);
  if (sp !== null) {
    out.push(["systemPrompt", "system_prompt", sp]);
  }
  const tools = allowed(agent);
  if (tools.length) {
    out.push(["allowedTools", "allowed_tools", tools]);
  }
  if (agent.disallowedTools.length) {
    out.push(["disallowedTools", "disallowed_tools", agent.disallowedTools]);
  }
  return [...out, ...limits(agent), ...connections(agent)];
}

function triggerNote(agent: Agent) {
  if (agent.trigger.type === "schedule") {
    return `Agendado (cron): ${agent.trigger.cron}`;
  }
  if (agent.trigger.type === "webhook") {
    return "Disparado por webhook";
  }
  return "Execução manual";
}

function usesEnv(v: Val): boolean {
  if (isEnv(v)) {
    return true;
  }
  if (Array.isArray(v)) {
    return v.some(usesEnv);
  }
  if (isCall(v)) {
    return Object.values(v.args).some(usesEnv);
  }
  if (typeof v === "object" && v !== null) {
    return Object.values(v).some(usesEnv);
  }
  return false;
}

/* ------------------------------- TypeScript ------------------------------ */

const pad = (n: number) => "  ".repeat(n);

function tsString(s: string) {
  if (!s.includes("\n")) {
    return JSON.stringify(s);
  }
  return `\`${s.replace(BACKTICK, (m) => `\\${m}`)}\``;
}

function tsKey(k: string) {
  return IDENTIFIER.test(k) ? k : JSON.stringify(k);
}

function tsObject(obj: Record<string, Val>, depth: number): string {
  const entries = Object.entries(obj);
  if (!entries.length) {
    return "{}";
  }
  const body = entries
    .map(([k, v]) => `${pad(depth + 1)}${tsKey(k)}: ${ts(v, depth + 1)},`)
    .join("\n");
  return `{\n${body}\n${pad(depth)}}`;
}

function ts(v: Val, depth: number): string {
  if (typeof v === "string") {
    return tsString(v);
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (isEnv(v)) {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: emits a JS template literal
    return `\`${v.env.replace(ENV_VARS, "${process.env.$1}")}\``;
  }
  if (Array.isArray(v)) {
    const flat = `[${v.map((x) => ts(x, depth)).join(", ")}]`;
    return flat.length < 60
      ? flat
      : `[\n${v.map((x) => `${pad(depth + 1)}${ts(x, depth + 1)},`).join("\n")}\n${pad(depth)}]`;
  }
  if (isCall(v)) {
    return tsObject(v.args, depth);
  }
  return tsObject(v, depth);
}

export function toTypeScript(agent: Agent) {
  const opts: Record<string, Val> = {};
  for (const [k, , v] of options(agent)) {
    opts[k] = v;
  }
  if (agent.permissionMode === "bypassPermissions") {
    opts.allowDangerouslySkipPermissions = true;
  }
  const header = [
    "/**",
    ` * ${agent.name}${agent.description ? ` — ${agent.description}` : ""}`,
    ` * ${triggerNote(agent)}`,
    " * Requer ANTHROPIC_API_KEY no ambiente.",
    " */",
  ].join("\n");
  return `import { query } from "@anthropic-ai/claude-agent-sdk";

${header}
for await (const message of query({
  prompt: ${ts(agent.prompt || "Descreva a tarefa do agente aqui.", 1)},
  options: ${tsObject(opts, 1)},
})) {
  if (message.type === "result") {
    console.log(
      message.subtype === "success" ? message.result : \`Erro: \${message.subtype}\`
    );
  }
}
`;
}

/* --------------------------------- Python -------------------------------- */

const pyPad = (n: number) => "    ".repeat(n);

function pyString(s: string) {
  if (!s.includes("\n")) {
    return JSON.stringify(s);
  }
  return `"""${s.replace(TRIPLE_QUOTE, (m) => (m === "\\" ? "\\\\" : '\\"""'))}"""`;
}

function pyEnv(template: string) {
  const body = template
    .replace(BRACES, (m) => m + m)
    .replace(DOUBLED_VAR, "{$1}")
    .replace(ENV_VARS, "{os.environ['$1']}");
  return `f${JSON.stringify(body)}`;
}

function pyArgs(args: Record<string, Val>, depth: number) {
  return Object.entries(args)
    .map(([k, v]) => `${pyPad(depth + 1)}${k}=${py(v, depth + 1)},`)
    .join("\n");
}

function pyDict(obj: Record<string, Val>, depth: number): string {
  const entries = Object.entries(obj);
  if (!entries.length) {
    return "{}";
  }
  const body = entries
    .map(
      ([k, v]) =>
        `${pyPad(depth + 1)}${JSON.stringify(k)}: ${py(v, depth + 1)},`
    )
    .join("\n");
  return `{\n${body}\n${pyPad(depth)}}`;
}

function py(v: Val, depth: number): string {
  if (typeof v === "string") {
    return pyString(v);
  }
  if (typeof v === "boolean") {
    return v ? "True" : "False";
  }
  if (typeof v === "number") {
    return String(v);
  }
  if (isEnv(v)) {
    return pyEnv(v.env);
  }
  if (Array.isArray(v)) {
    const flat = `[${v.map((x) => py(x, depth)).join(", ")}]`;
    return flat.length < 60
      ? flat
      : `[\n${v.map((x) => `${pyPad(depth + 1)}${py(x, depth + 1)},`).join("\n")}\n${pyPad(depth)}]`;
  }
  if (isCall(v)) {
    return `${v.call}(\n${pyArgs(v.args, depth)}\n${pyPad(depth)})`;
  }
  return pyDict(v, depth);
}

export function toPython(agent: Agent) {
  const entries = options(agent);
  const args: Record<string, Val> = {};
  for (const [, k, v] of entries) {
    args[k] = v;
  }
  const imports = ["ClaudeAgentOptions", "ResultMessage", "query"];
  if (agent.subagents.length) {
    imports.unshift("AgentDefinition");
  }
  const needsOs = entries.some(([, , v]) => usesEnv(v));
  const prompt = py(agent.prompt || "Descreva a tarefa do agente aqui.", 2);
  return `import asyncio
${needsOs ? "import os\n" : ""}
from claude_agent_sdk import ${imports.join(", ")}

# ${agent.name}${agent.description ? ` — ${agent.description}` : ""}
# ${triggerNote(agent)}
# Requer ANTHROPIC_API_KEY no ambiente.


async def main():
    options = ClaudeAgentOptions(
${pyArgs(args, 1)}
    )
    async for message in query(
        prompt=${prompt},
        options=options,
    ):
        if isinstance(message, ResultMessage):
            print(message.result if message.subtype == "success" else f"Erro: {message.subtype}")


asyncio.run(main())
`;
}

/* ---------------------------------- JSON --------------------------------- */

export function toJson(agent: Agent) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = agent;
  return `${JSON.stringify(rest, null, 2)}\n`;
}
