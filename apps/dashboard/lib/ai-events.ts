/** Newline-delimited JSON events streamed by /api/chat to the chat UI. */
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; server: string; name: string }
  | { type: "tool_done"; error: boolean }
  | { type: "notice"; text: string };
