"use client";

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useFloatingPosition } from "@/components/dashboard/floating-button";
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
/** Size (px) of the round floating button. */
const FAB = 52;
const ICON_KEY = "cb:agent:icon";
const ICON_EVENT = "cb:agent-icon";

/** The user's own picture for the button (per device), or null. */
function readIcon(): string | null {
  try {
    return localStorage.getItem(ICON_KEY);
  } catch {
    return null;
  }
}

function subscribeIcon(cb: () => void) {
  window.addEventListener(ICON_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(ICON_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function useAgentIcon() {
  return useSyncExternalStore(subscribeIcon, readIcon, () => null);
}

function storeIcon(value: string | null) {
  try {
    if (value) {
      localStorage.setItem(ICON_KEY, value);
    } else {
      localStorage.removeItem(ICON_KEY);
    }
  } catch {
    // private mode: the picture just isn't remembered
  }
  window.dispatchEvent(new Event(ICON_EVENT));
}

/** Crops the photo to a centered square and shrinks it to 160 px. */
function squareThumb(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        160,
        160
      );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

/** The button face: the user's picture or the sparkle on clay. */
function AgentFace({ icon, small }: { icon: string | null; small?: boolean }) {
  if (icon) {
    return (
      <span
        aria-hidden
        className="pointer-events-none size-full rounded-full bg-center bg-cover"
        style={{ backgroundImage: `url("${icon}")` }}
      />
    );
  }
  return (
    <Icon className={small ? "size-4" : "size-6"} name="IconSparklesSoft" />
  );
}

/** Lets the user pick a photo from the phone for the button, or remove it. */
function IconPicker({ icon }: { icon: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs">
      <span className="flex-1 text-muted-foreground">
        Ícone do botão (arraste o botão para qualquer lugar da tela)
      </span>
      <Button
        onClick={() => input.current?.click()}
        size="sm"
        variant="outline"
      >
        <Icon className="size-4" name="IconImages1" />
        Trocar
      </Button>
      {icon ? (
        <Button onClick={() => storeIcon(null)} size="sm" variant="ghost">
          Padrão
        </Button>
      ) : null}
      <input
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) {
            return;
          }
          setError(null);
          try {
            storeIcon(await squareThumb(file));
          } catch {
            setError("Não consegui abrir essa imagem.");
          }
        }}
        ref={input}
        type="file"
      />
      {error ? <p className="w-full text-destructive">{error}</p> : null}
    </div>
  );
}

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
  const icon = useAgentIcon();
  const [showPicker, setShowPicker] = useState(false);
  // Starts at the right edge, a bit above the middle (clear of tab bars)
  const fab = useFloatingPosition("cb:fab:agent", { fx: 1, fy: 0.62 }, FAB);

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
    if (!fab.pos) {
      return null;
    }
    return (
      <button
        aria-label="Agente do app"
        className={cn(
          "fixed z-[70] flex touch-none select-none items-center justify-center overflow-hidden rounded-full text-white shadow-black/30 shadow-xl transition-transform [-webkit-touch-callout:none] print:hidden",
          fab.dragging ? "scale-110 cursor-grabbing" : "active:scale-95",
          icon ? "border-2 border-white/80" : ""
        )}
        data-agent-ui="button"
        onClick={() => {
          if (!fab.consumeDrag()) {
            setOpen(true);
          }
        }}
        style={{
          left: fab.pos.x,
          top: fab.pos.y,
          width: FAB,
          height: FAB,
          backgroundColor: icon ? undefined : CLAY,
        }}
        title="Agente · arraste para mover"
        type="button"
        {...fab.handlers}
      >
        <AgentFace icon={icon} />
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
        <button
          aria-label="Trocar o ícone do agente"
          className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-white"
          onClick={() => setShowPicker((v) => !v)}
          style={icon ? undefined : { backgroundColor: CLAY }}
          type="button"
        >
          <AgentFace icon={icon} small />
        </button>
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
          aria-label="Trocar o ícone do botão"
          aria-pressed={showPicker}
          className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
          onClick={() => setShowPicker((v) => !v)}
          type="button"
        >
          <Icon className="size-4" name="IconImages1" />
        </button>
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
        {showPicker ? <IconPicker icon={icon} /> : null}
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
