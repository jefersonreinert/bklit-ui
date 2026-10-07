/** Shapes shared by the Code page and its API routes. */

export type CodePhase =
  | "needs_input"
  | "review"
  | "working"
  | "completed"
  | "archived";

export interface CodeSessionSummary {
  id: string;
  title: string;
  phase: CodePhase;
  stopReason: string | null;
  repos: string[];
  model: string | null;
  mode: "auto" | "acceptEdits" | "plan";
  /** repo → branch the session started from (when not the default). */
  branches: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  costUsd: number;
}

export type CodeItem =
  | { kind: "user"; id: string; text: string; images: number }
  | { kind: "agent"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      summary: string;
      pending: boolean;
      result: string | null;
      isError: boolean;
    }
  | {
      kind: "result";
      id: string;
      toolUseId: string;
      text: string;
      isError: boolean;
    }
  | { kind: "error"; id: string; text: string }
  | { kind: "status"; id: string; text: string };

export interface CodeSessionDetail extends CodeSessionSummary {
  items: CodeItem[];
}

export interface CodeRepo {
  fullName: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  pushedAt: string | null;
}

export interface CodeStatus {
  configured: boolean;
  locked: boolean;
  unlocked: boolean;
  github: string | null;
}
