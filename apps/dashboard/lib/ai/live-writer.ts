"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStreamEvent } from "@/lib/ai-events";
import { DEFAULT_MODEL } from "@/lib/ai-models";
import { panelSnapshot } from "./panel-context";

/**
 * Streams Claude's text straight into a note and reveals it letter by
 * letter (a steady typewriter that catches up when chunks arrive in
 * bursts), saving as it goes so other tabs/devices follow along live.
 */

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat/`;
const SAVE_EVERY_MS = 350;
const MAX_NOTE_CONTEXT = 6000;

export type WriteMode = "append" | "replace";

export type WriterState =
  | { status: "idle" }
  | { status: "thinking"; tool: string | null }
  | { status: "writing"; tool: string | null }
  | { status: "error"; message: string };

const TOOL_LABELS: Record<string, string> = {
  gmail: "Gmail",
  google: "Google",
  drive: "Drive",
  notion: "Notion",
  github: "GitHub",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  painel: "dados do painel",
};

export const toolLabel = (server: string) => TOOL_LABELS[server] ?? server;

function buildPrompt(input: {
  title: string;
  content: string;
  instruction: string;
  mode: WriteMode;
  titles: string[];
}) {
  const current = input.content.trim()
    ? input.content.slice(-MAX_NOTE_CONTEXT)
    : "(vazia)";
  const snapshot = panelSnapshot(input.titles.filter((t) => t !== input.title));
  return [
    `Nota: "${input.title || "Sem título"}"`,
    `Conteúdo atual da nota:\n<<<\n${current}\n>>>`,
    snapshot,
    input.mode === "replace"
      ? "Escreva o novo conteúdo completo da nota (ele substitui o atual)."
      : "Escreva apenas o trecho novo que continua a nota a partir do fim.",
    `Pedido: ${input.instruction}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: ChatStreamEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const drain = (final: boolean) => {
    const lines = buffer.split("\n");
    buffer = final ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (line.trim()) {
        try {
          onEvent(JSON.parse(line) as ChatStreamEvent);
        } catch {
          // Ignore a malformed line
        }
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    drain(false);
  }
  drain(true);
}

export function useLiveWriter(onSave: (content: string) => void) {
  const [state, setState] = useState<WriterState>({ status: "idle" });
  const [live, setLive] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const save = useRef(onSave);
  save.current = onSave;

  useEffect(() => () => abort.current?.abort(), []);

  const stop = useCallback(() => abort.current?.abort(), []);

  const start = useCallback(
    async (input: {
      title: string;
      content: string;
      instruction: string;
      mode: WriteMode;
      titles: string[];
      connectors: string[];
      model?: string;
    }) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      let base = "";
      if (input.mode === "append" && input.content.trim()) {
        base = `${input.content.trimEnd()}\n\n`;
      }
      let received = "";
      let shown = 0;
      let streamDone = false;
      let lastSave = 0;
      let tool: string | null = null;
      setLive(base);
      setState({ status: "thinking", tool: null });

      const finish = (text: string) => {
        save.current(text);
        setLive(null);
      };

      // Typewriter: reveal at a steady pace, faster when far behind
      const tick = (now: number) => {
        if (shown < received.length) {
          const behind = received.length - shown;
          shown += Math.max(1, Math.ceil(behind / 28));
          const text = base + received.slice(0, shown);
          setLive(text);
          if (now - lastSave > SAVE_EVERY_MS) {
            lastSave = now;
            save.current(text);
          }
        }
        if (streamDone && shown >= received.length) {
          finish(base + received);
          return;
        }
        requestAnimationFrame(tick);
      };

      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: input.model ?? DEFAULT_MODEL,
            style: "write",
            connectors: input.connectors,
            messages: [{ role: "user", content: buildPrompt(input) }],
          }),
        });
        if (!(res.ok && res.body)) {
          const message =
            res.status === 503
              ? "A IA não está configurada no servidor (ANTHROPIC_API_KEY)."
              : `A IA respondeu com erro ${res.status}.`;
          setLive(null);
          setState({ status: "error", message });
          return;
        }
        requestAnimationFrame(tick);
        await readEvents(res.body, (e) => {
          if (e.type === "text") {
            received += e.text;
            setState({ status: "writing", tool });
          } else if (e.type === "tool") {
            tool = toolLabel(e.server);
            setState((s) =>
              s.status === "writing"
                ? { status: "writing", tool }
                : { status: "thinking", tool }
            );
          } else if (e.type === "tool_done") {
            tool = null;
          } else if (e.type === "fallback") {
            setState({
              status: "error",
              message:
                "Sua conta da API está sem créditos. Compre créditos em platform.claude.com → Plans & Billing.",
            });
          }
        });
        streamDone = true;
        setState((s) => (s.status === "error" ? s : { status: "idle" }));
      } catch (err) {
        streamDone = true;
        const aborted =
          err instanceof DOMException && err.name === "AbortError";
        // Keep what was already written when the person stops
        received = received.slice(0, shown);
        setState(
          aborted
            ? { status: "idle" }
            : { status: "error", message: "Falha de conexão com a IA." }
        );
        if (!received) {
          setLive(null);
        }
      }
    },
    []
  );

  return { state, live, start, stop };
}
