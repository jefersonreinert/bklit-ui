"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useDictation } from "@/components/pages/ai/attachments";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import {
  resetAgent,
  resumeAgent,
  setNavigator,
  startAgent,
  stopAgent,
  useAgent,
} from "@/lib/agent/runner";
import { Icon } from "@/lib/icons";
import { setSession } from "@/lib/pos/store";
import { convexClient } from "@/lib/sync/convex-client";
import { cn } from "@/lib/utils";

/**
 * "Agente": a floating button on every page. Say or type what you want
 * ("abra o WhatsApp e mande … para o João") and it uses the app for you,
 * live: it moves between pages, clicks and types with a visible cursor.
 */

const CLAY = "#c96442";

const SUGGESTIONS = [
  "Abra o WhatsApp e me diga quem mandou a última mensagem",
  "Abra o POS do Atlas e mostre os gins London Dry",
  "Abra o Navegador no site atlasbar.sg",
];

function PinPad({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    const client = convexClient();
    if (!client) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await client.mutation(api.staff.login, {
        pin: value,
        device: "Agente do app",
      });
      if ("token" in res && res.token) {
        setSession(res.token);
        onDone();
      } else if ("error" in res && res.error === "locked") {
        setError("Muitas tentativas. Espere alguns minutos.");
      } else {
        setError("PIN incorreto.");
      }
    } catch {
      setError("Não consegui conferir o PIN.");
    } finally {
      setBusy(false);
      setPin("");
    }
  };

  const press = (d: string) => {
    if (busy) {
      return;
    }
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      submit(next);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <p className="text-muted-foreground text-sm">
        Digite o seu PIN de administrador do POS para o agente usar o app.
      </p>
      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            className={cn(
              "size-3 rounded-full border-2 border-foreground/60",
              i < pin.length && "bg-foreground"
            )}
            key={i}
          />
        ))}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <div className="grid w-full grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d) =>
          d ? (
            <Button
              className="h-11 text-base"
              disabled={busy}
              key={d}
              onClick={() =>
                d === "⌫" ? setPin((p) => p.slice(0, -1)) : press(d)
              }
              variant={d === "⌫" ? "ghost" : "outline"}
            >
              {d}
            </Button>
          ) : (
            <span key="blank" />
          )
        )}
      </div>
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: three states of one floating panel
export function AgentDock() {
  const router = useRouter();
  const agent = useAgent();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [byVoice, setByVoice] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNavigator((path) => router.push(path));
  }, [router]);

  const dictation = useDictation((text) => {
    dictation.stop();
    setByVoice(true);
    setDraft("");
    startAgent(text);
  });

  // Reads the answer aloud when the request came by voice
  useEffect(() => {
    if (
      byVoice &&
      (agent.status === "done" || agent.status === "asking") &&
      agent.message &&
      "speechSynthesis" in window
    ) {
      const u = new SpeechSynthesisUtterance(agent.message);
      u.lang = document.documentElement.lang || "pt-BR";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  }, [agent.status, agent.message, byVoice]);

  // Watching: the panel folds into a small card while it works and opens
  // again when it is done, asks something or needs the PIN
  const status = agent.status;
  const prevStatus = useRef(status);
  useEffect(() => {
    if (status === "running") {
      setOpen(false);
    } else if (prevStatus.current === "running") {
      setOpen(true);
    }
    prevStatus.current = status;
  }, [status]);

  // Follows the newest step
  const stepCount = agent.steps.length;
  useEffect(() => {
    if (stepCount) {
      list.current?.scrollTo({ top: list.current.scrollHeight });
    }
  }, [stepCount]);

  const running = agent.status === "running";
  const send = () => {
    if (draft.trim()) {
      setByVoice(false);
      startAgent(draft);
      setDraft("");
    }
  };
  const last = agent.steps.at(-1);

  // While working: a small card so the page stays visible
  if (running && !open) {
    return (
      <div
        className="acrylic fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[70] flex w-[min(360px,calc(100vw-2rem))] items-center gap-3 rounded-2xl border bg-card/90 p-3 shadow-xl backdrop-blur-xl"
        data-agent-ui="dock"
      >
        <span
          className="size-2.5 shrink-0 animate-pulse rounded-full"
          style={{ backgroundColor: CLAY }}
        />
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => setOpen(true)}
          type="button"
        >
          <p className="truncate font-medium text-sm">
            {last?.label === "…" ? last.thought : (last?.label ?? "Pensando…")}
          </p>
          <p className="truncate text-muted-foreground text-xs">{agent.goal}</p>
        </button>
        <Button onClick={stopAgent} size="sm" variant="destructive">
          <Icon className="size-4" name="IconStop" />
          Parar
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        aria-label="Agente do app"
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[70] flex h-12 items-center gap-2 rounded-full px-4 font-medium text-sm text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
        data-agent-ui="button"
        onClick={() => setOpen(true)}
        style={{ backgroundColor: CLAY }}
        type="button"
      >
        <Icon className="size-5" name="IconSparklesSoft" />
        Agente
      </button>
    );
  }

  let body: ReactNode;
  if (agent.status === "locked") {
    body = <PinPad onDone={resumeAgent} />;
  } else if (agent.steps.length === 0 && !running) {
    body = (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          Fale ou escreva o que quer fazer. Eu abro as páginas, clico e digito —
          você acompanha tudo na tela.
        </p>
        {SUGGESTIONS.map((s) => (
          <button
            className="block w-full rounded-xl border px-3 py-2 text-left text-xs hover:bg-muted"
            key={s}
            onClick={() => {
              setByVoice(false);
              startAgent(s);
            }}
            type="button"
          >
            {s}
          </button>
        ))}
      </div>
    );
  } else {
    body = (
      <>
        <p className="rounded-xl bg-muted/60 px-3 py-2 font-medium text-sm">
          {agent.goal}
        </p>
        {agent.steps.map((s, i) => (
          <div
            className="flex gap-2 text-sm"
            // biome-ignore lint/suspicious/noArrayIndexKey: steps only grow
            key={i}
          >
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                s.ok === null && "animate-pulse",
                s.ok === false ? "bg-destructive" : ""
              )}
              style={s.ok === false ? undefined : { backgroundColor: CLAY }}
            />
            <div className="min-w-0">
              <p>{s.label === "…" ? "Fazendo…" : s.label}</p>
              <p className="text-muted-foreground text-xs">{s.thought}</p>
            </div>
          </div>
        ))}
        {running ? (
          <p className="animate-pulse text-muted-foreground text-xs">
            Pensando no próximo passo…
          </p>
        ) : null}
        {agent.message ? (
          <p
            className={cn(
              "rounded-xl border px-3 py-2 text-sm",
              agent.status === "error" &&
                "border-destructive/40 text-destructive"
            )}
          >
            {agent.message}
          </p>
        ) : null}
      </>
    );
  }
  let placeholder = "O que você quer fazer?";
  if (dictation.listening) {
    placeholder = dictation.interim || "Ouvindo… fale normalmente";
  } else if (agent.status === "asking") {
    placeholder = "Responda ao agente…";
  }

  return (
    <div
      className="acrylic fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[70] flex max-h-[min(640px,calc(100dvh-2rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border bg-card/95 shadow-2xl backdrop-blur-xl"
      data-agent-ui="panel"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span
          className="flex size-7 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: CLAY }}
        >
          <Icon className="size-4" name="IconSparklesSoft" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Agente do app</p>
          <p className="truncate text-muted-foreground text-xs">
            Usa o Casa Brasa por você, ao vivo
          </p>
        </div>
        {agent.steps.length && !running ? (
          <Button onClick={resetAgent} size="sm" variant="ghost">
            Novo
          </Button>
        ) : null}
        <button
          aria-label="Minimizar"
          className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
          onClick={() => setOpen(false)}
          type="button"
        >
          <Icon className="size-4 -rotate-90" name="IconChevronLeft" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4" ref={list}>
        {body}
      </div>

      <div className="border-t p-3">
        {running ? (
          <Button className="w-full" onClick={stopAgent} variant="destructive">
            <Icon className="size-4" name="IconStop" />
            Parar o agente
          </Button>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border bg-background px-3 py-2 text-base outline-none md:text-sm"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder}
              rows={1}
              value={draft}
            />
            <button
              aria-label={dictation.listening ? "Parar de ouvir" : "Falar"}
              aria-pressed={dictation.listening}
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
                dictation.listening
                  ? "animate-pulse text-white"
                  : "bg-muted text-foreground hover:bg-muted/70"
              )}
              onClick={dictation.toggle}
              style={
                dictation.listening ? { backgroundColor: CLAY } : undefined
              }
              type="button"
            >
              <Icon className="size-5" name="IconMicrophone" />
            </button>
            <button
              aria-label="Executar"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
              disabled={!draft.trim()}
              onClick={send}
              style={{ backgroundColor: CLAY }}
              type="button"
            >
              <Icon className="size-5" name="IconArrowUp" />
            </button>
          </div>
        )}
        {dictation.error ? (
          <p className="mt-1 text-destructive text-xs">{dictation.error}</p>
        ) : null}
      </div>
    </div>
  );
}
