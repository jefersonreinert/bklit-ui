/**
 * An automatic agent, shaped after the Claude Agent SDK `query()` options
 * (code.claude.com/docs/en/agent-sdk). Each field maps to one option so the
 * saved config can be handed to the SDK as-is when agents run server-side.
 */

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type SettingSource = "user" | "project" | "local";

/** How the system prompt is built: Claude Code's preset (+ append), custom, or none. */
export type SystemMode = "preset" | "custom" | "none";

export type TriggerType = "manual" | "schedule" | "webhook";

export interface AgentTrigger {
  type: TriggerType;
  /** 5-field cron expression, used when type is "schedule". */
  cron: string;
}

export type McpType = "http" | "sse" | "stdio";

export interface AgentMcpServer {
  id: string;
  name: string;
  type: McpType;
  /** http / sse */
  url: string;
  /** "Header: value" per line; ${VAR} reads an environment variable. */
  headers: string;
  /** stdio */
  command: string;
  args: string;
  /** Adds `mcp__<name>__*` to allowedTools. */
  autoApprove: boolean;
}

export interface AgentSubagent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  /** Empty = inherit every tool available to subagents. */
  tools: string[];
  /** "" = SDK default; "inherit" or an alias / model ID. */
  model: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: number;
  enabled: boolean;
  /** The task sent as `prompt`. */
  prompt: string;
  systemMode: SystemMode;
  systemPrompt: string;
  model: string;
  effort: Effort | "";
  maxTurns: number | null;
  maxBudgetUsd: number | null;
  permissionMode: PermissionMode;
  allowedTools: string[];
  disallowedTools: string[];
  settingSources: SettingSource[];
  cwd: string;
  mcpServers: AgentMcpServer[];
  subagents: AgentSubagent[];
  trigger: AgentTrigger;
  createdAt: number;
  updatedAt: number;
}
