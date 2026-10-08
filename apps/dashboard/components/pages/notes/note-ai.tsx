"use client";

import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useState } from "react";
import { AiMascot } from "@/components/dashboard/ai-mascot";
import type { WriteMode, WriterState } from "@/lib/ai/live-writer";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Floating "write with AI" bar for a note: prompt, quick asks, live status. */

const QUICK: { label: string; prompt: string; mode: WriteMode }[] = [
  {
    label: "Continuar escrevendo",
    prompt: "Continue a nota de forma natural.",
    mode: "append",
  },
  {
    label: "Resumir",
    prompt: "Escreva um resumo curto da nota em tópicos.",
    mode: "append",
  },
  {
    label: "Organizar",
    prompt:
      "Reorganize toda a nota com títulos, tópicos e uma tabela quando fizer sentido, sem perder informação.",
    mode: "replace",
  },
  {
    label: "Vendas da semana",
    prompt:
      "Escreva um relatório das vendas da semana com os números do POS, um gráfico e 3 recomendações.",
    mode: "append",
  },
  {
    label: "E-mails de hoje",
    prompt:
      "Leia meus e-mails de hoje no Gmail e escreva um resumo com o que precisa de resposta.",
    mode: "append",
  },
  {
    label: "Minhas finanças",
    prompt:
      "Analise minhas finanças pessoais deste mês e escreva um resumo com gráfico por categoria.",
    mode: "append",
  },
];

const CLAY = "#d97757";

function statusText(state: WriterState) {
  if (state.status === "thinking") {
    return state.tool ? `Consultando ${state.tool}…` : "Pensando…";
  }
  if (state.status === "writing") {
    return state.tool ? `Consultando ${state.tool}…` : "Escrevendo…";
  }
  return "";
}

export function NoteAiBar({
  state,
  onStart,
  onStop,
}: {
  state: WriterState;
  onStart: (instruction: string, mode: WriteMode) => void;
  onStop: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<WriteMode>("append");
  const busy = state.status === "thinking" || state.status === "writing";
  // Errors reopen the box so the message is visible
  useEffect(() => {
    if (state.status === "error") {
      setOpen(true);
    }
  }, [state.status]);
  const run = (instruction: string, m: WriteMode) => {
    setOpen(false);
    onStart(instruction, m);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) {
      return;
    }
    run(text.trim(), mode);
    setText("");
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <AnimatePresence initial={false} mode="wait">
        {busy ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto flex items-center gap-3 rounded-full border bg-popover py-1.5 pr-1.5 pl-2 shadow-lg backdrop-blur-xl"
            exit={{ opacity: 0, y: 8 }}
            initial={{ opacity: 0, y: 8 }}
            key="busy"
          >
            <AiMascot className="size-8" />
            <span className="text-sm">{statusText(state)}</span>
            <button
              aria-label="Parar"
              className="flex size-9 items-center justify-center rounded-full bg-foreground text-background"
              onClick={onStop}
              type="button"
            >
              <Icon className="size-4" name="IconStop" />
            </button>
          </motion.div>
        ) : null}
        {!busy && open ? (
          <motion.form
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-[28px] border bg-popover p-2.5 shadow-2xl backdrop-blur-xl"
            exit={{ opacity: 0, y: 8 }}
            initial={{ opacity: 0, y: 8 }}
            key="form"
            onSubmit={submit}
          >
            {state.status === "error" ? (
              <p className="px-2 pt-1 text-destructive text-sm">
                {state.message}
              </p>
            ) : null}
            <div className="flex gap-1.5 overflow-x-auto px-1 pt-1 pb-0.5">
              {QUICK.map((q) => (
                <button
                  className="shrink-0 rounded-full border bg-background px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                  key={q.label}
                  onClick={() => run(q.prompt, q.mode)}
                  type="button"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <textarea
              aria-label="Pedido para a IA"
              className="field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent px-3 pt-1 text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Peça para a IA escrever, resumir, buscar nos e-mails…"
              ref={(el) => el?.focus()}
              rows={1}
              value={text}
            />
            <div className="flex items-center gap-1.5">
              <button
                aria-label="Fechar"
                className="flex size-9 items-center justify-center rounded-full bg-muted/70 hover:bg-muted"
                onClick={() => setOpen(false)}
                type="button"
              >
                <Icon className="size-4" name="IconCrossSmall" />
              </button>
              <div className="flex rounded-full bg-muted/70 p-0.5 text-xs">
                {(
                  [
                    ["append", "Acrescentar"],
                    ["replace", "Reescrever"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    aria-pressed={mode === id}
                    className={cn(
                      "rounded-full px-3 py-1.5",
                      mode === id
                        ? "bg-card shadow-sm"
                        : "text-muted-foreground"
                    )}
                    key={id}
                    onClick={() => setMode(id)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                aria-label="Escrever"
                className="ml-auto flex size-10 items-center justify-center rounded-full text-white disabled:opacity-40"
                disabled={!text.trim()}
                style={{ backgroundColor: CLAY }}
                type="submit"
              >
                <Icon className="size-5" name="IconArrowUp" />
              </button>
            </div>
          </motion.form>
        ) : null}
        {busy || open ? null : (
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full border bg-popover py-1.5 pr-4 pl-1.5 text-sm shadow-lg backdrop-blur-xl transition-transform active:scale-95"
            exit={{ opacity: 0, y: 8 }}
            initial={{ opacity: 0, y: 8 }}
            key="pill"
            onClick={() => setOpen(true)}
            type="button"
          >
            <AiMascot className="size-8" />
            Escrever com IA
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Blinking caret drawn after the live text. */
export function LiveCaret() {
  return (
    <motion.span
      animate={{ opacity: [1, 1, 0, 0] }}
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1.1em] w-[3px] translate-y-[3px] rounded-full"
      style={{ backgroundColor: CLAY }}
      transition={{
        duration: 0.9,
        repeat: Number.POSITIVE_INFINITY,
        times: [0, 0.5, 0.5, 1],
      }}
    />
  );
}
