"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPreferences } from "@/lib/preferences";
import {
  askAssistant,
  ClipRecorder,
  keepAwake,
  Listener,
  speak,
  speechSupported,
  stopSpeaking,
  transcribeClip,
  type VoiceTurn,
} from "./voice-engine";

export type VoiceMode = "conversa" | "notas";
export type VoiceEngine = "iphone" | "gemini";
export type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceLine {
  id: string;
  at: number;
  who: "me" | "ai";
  text: string;
}

export interface VoiceSummary {
  at: number;
  text: string;
}

export interface VoiceSession {
  id: string;
  startedAt: number;
  mode: VoiceMode;
  lines: VoiceLine[];
  summaries: VoiceSummary[];
}

const SESSIONS_KEY = "casa-brasa-voice-sessions";
/** Silence that ends a spoken turn in Conversa mode. */
const TURN_PAUSE_MS = 1600;
const NOTES_CLIP_SECONDS = 15;
const CONVERSA_CLIP_SECONDS = 60;
const MAX_HISTORY = 20;

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function loadSessions(): VoiceSession[] {
  try {
    return JSON.parse(
      localStorage.getItem(SESSIONS_KEY) ?? "[]"
    ) as VoiceSession[];
  } catch {
    return [];
  }
}

function saveSession(session: VoiceSession) {
  if (session.lines.length === 0) {
    return;
  }
  try {
    const others = loadSessions().filter((s) => s.id !== session.id);
    localStorage.setItem(
      SESSIONS_KEY,
      JSON.stringify([session, ...others].slice(0, MAX_HISTORY))
    );
  } catch {
    // storage full — the current session still shows on screen
  }
}

export function deleteSession(id: string) {
  try {
    localStorage.setItem(
      SESSIONS_KEY,
      JSON.stringify(loadSessions().filter((s) => s.id !== id))
    );
  } catch {
    // ignore
  }
}

export function sessionText(s: VoiceSession) {
  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const lines = s.lines.map(
    (l) => `[${time(l.at)}] ${l.who === "ai" ? "Assistente" : "Eu"}: ${l.text}`
  );
  const sums = s.summaries.map(
    (x) => `\n--- Resumo ${time(x.at)} ---\n${x.text}`
  );
  return `Sessão de voz — ${new Date(s.startedAt).toLocaleString("pt-BR")}\n\n${lines.join("\n")}${sums.join("\n")}`;
}

const SUMMARY_PROMPT =
  "Abaixo está a transcrição automática do meu microfone. Resuma em português, em tópicos curtos: 1) pontos principais, 2) decisões, 3) tarefas e responsáveis (se citados), 4) números citados. Seja fiel ao que foi dito.\n\n";

export function useVoice(opts: {
  mode: VoiceMode;
  engine: VoiceEngine;
  model: string;
  speakReplies: boolean;
  autoSummaryMin: number;
}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<VoiceSession>(() => ({
    id: uid(),
    startedAt: Date.now(),
    mode: opts.mode,
    lines: [],
    summaries: [],
  }));
  const [recording, setRecording] = useState(false);

  const active = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const listener = useRef<Listener | null>(null);
  const recorder = useRef<ClipRecorder | null>(null);
  const pending = useRef("");
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useRef<{ release(): Promise<void> } | null>(null);
  const clipQueue = useRef<Promise<void>>(Promise.resolve());
  const summarizedUpTo = useRef(0);
  const abort = useRef<AbortController | null>(null);

  const update = useCallback((fn: (s: VoiceSession) => VoiceSession) => {
    setSession((prev) => {
      const next = fn(prev);
      saveSession(next);
      return next;
    });
  }, []);

  const addLine = useCallback(
    (who: VoiceLine["who"], text: string) =>
      update((s) => ({
        ...s,
        lines: [...s.lines, { id: uid(), at: Date.now(), who, text }],
      })),
    [update]
  );

  const user = () => {
    const p = getPreferences();
    return { name: p.name, role: p.role };
  };

  /* ------------------------------ conversa ------------------------------ */

  const resumeListening = useCallback(() => {
    if (!active.current) {
      setStatus("idle");
      return;
    }
    setStatus("listening");
    if (optsRef.current.engine === "iphone") {
      listener.current?.start();
    }
  }, []);

  const sendTurn = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content) {
        return;
      }
      listener.current?.stop();
      addLine("me", content);
      setStatus("thinking");
      const history: VoiceTurn[] = [
        ...sessionRef.current.lines.slice(-16).map((l) => ({
          role: (l.who === "ai" ? "assistant" : "user") as VoiceTurn["role"],
          content: l.text,
        })),
        { role: "user", content },
      ];
      abort.current = new AbortController();
      try {
        const reply = await askAssistant({
          messages: history,
          model: optsRef.current.model,
          style: "voice",
          user: user(),
          signal: abort.current.signal,
        });
        addLine("ai", reply || "(sem resposta)");
        if (optsRef.current.speakReplies && active.current) {
          setStatus("speaking");
          await speak(reply);
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError(
            e instanceof Error ? e.message : "Erro ao falar com o assistente"
          );
        }
      } finally {
        resumeListening();
      }
    },
    [addLine, resumeListening]
  );

  /* -------------------------------- notas ------------------------------- */

  const summarize = useCallback(
    async (all = false) => {
      const lines = sessionRef.current.lines;
      const from = all ? 0 : summarizedUpTo.current;
      const slice = lines.slice(from).filter((l) => l.who === "me");
      if (slice.length === 0) {
        return;
      }
      summarizedUpTo.current = lines.length;
      try {
        const text = await askAssistant({
          messages: [
            {
              role: "user",
              content: SUMMARY_PROMPT + slice.map((l) => l.text).join("\n"),
            },
          ],
          model: optsRef.current.model,
          style: "notes",
          user: user(),
        });
        update((s) => ({
          ...s,
          summaries: [...s.summaries, { at: Date.now(), text }],
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao resumir");
      }
    },
    [update]
  );

  const ask = useCallback(
    async (question: string) => {
      const transcript = sessionRef.current.lines
        .filter((l) => l.who === "me")
        .map((l) => l.text)
        .join("\n");
      const text = await askAssistant({
        messages: [
          {
            role: "user",
            content: `Transcrição do microfone até agora:\n${transcript}\n\nPergunta: ${question}`,
          },
        ],
        model: optsRef.current.model,
        style: "notes",
        user: user(),
      });
      update((s) => ({
        ...s,
        summaries: [
          ...s.summaries,
          { at: Date.now(), text: `❓ ${question}\n\n${text}` },
        ],
      }));
    },
    [update]
  );

  /* ---------------------------- engine wiring --------------------------- */

  const onFinal = useCallback(
    (text: string) => {
      if (optsRef.current.mode === "notas") {
        addLine("me", text);
        return;
      }
      pending.current = `${pending.current} ${text}`.trim();
      if (pauseTimer.current) {
        clearTimeout(pauseTimer.current);
      }
      pauseTimer.current = setTimeout(() => {
        const turn = pending.current;
        pending.current = "";
        sendTurn(turn);
      }, TURN_PAUSE_MS);
    },
    [addLine, sendTurn]
  );

  const onClip = useCallback(
    (blob: Blob) => {
      // Transcribe clips one at a time so lines stay in order
      clipQueue.current = clipQueue.current.then(async () => {
        try {
          const text = await transcribeClip(blob);
          if (!text) {
            return;
          }
          if (optsRef.current.mode === "notas") {
            addLine("me", text);
          } else {
            await sendTurn(text);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao transcrever");
        }
      });
    },
    [addLine, sendTurn]
  );

  const start = useCallback(async () => {
    setError(null);
    active.current = true;
    stopSpeaking();
    wake.current = await keepAwake();
    const { engine, mode } = optsRef.current;
    if (engine === "iphone" && speechSupported()) {
      listener.current = new Listener({
        onInterim: setInterim,
        onFinal,
        onError: setError,
      });
      listener.current.start();
      setStatus("listening");
      return;
    }
    if (mode === "notas") {
      try {
        recorder.current = new ClipRecorder(NOTES_CLIP_SECONDS, onClip);
        await recorder.current.start();
        setRecording(true);
        setStatus("listening");
      } catch {
        setError("Permita o microfone para começar.");
        active.current = false;
      }
      return;
    }
    // Conversa + Gemini: push-to-talk (talk() starts/ends each turn)
    setStatus("listening");
  }, [onClip, onFinal]);

  /** Gemini Conversa: first tap records, second tap sends. */
  const talk = useCallback(async () => {
    if (recording) {
      recorder.current?.stop();
      recorder.current = null;
      setRecording(false);
      return;
    }
    try {
      recorder.current = new ClipRecorder(CONVERSA_CLIP_SECONDS, onClip);
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError("Permita o microfone para falar.");
    }
  }, [onClip, recording]);

  const stop = useCallback(() => {
    active.current = false;
    listener.current?.stop();
    listener.current = null;
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
    abort.current?.abort();
    stopSpeaking();
    if (pauseTimer.current) {
      clearTimeout(pauseTimer.current);
    }
    if (pending.current && optsRef.current.mode === "notas") {
      addLine("me", pending.current);
    }
    pending.current = "";
    setInterim("");
    wake.current?.release().catch(() => undefined);
    wake.current = null;
    setStatus("idle");
  }, [addLine]);

  const newSession = useCallback(() => {
    stop();
    summarizedUpTo.current = 0;
    setSession({
      id: uid(),
      startedAt: Date.now(),
      mode: optsRef.current.mode,
      lines: [],
      summaries: [],
    });
  }, [stop]);

  // iOS drops the mic (and wake lock) when the app goes to the background
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || !active.current) {
        return;
      }
      wake.current = await keepAwake();
      if (
        optsRef.current.engine === "iphone" &&
        listener.current &&
        !listener.current.active
      ) {
        listener.current.start();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Automatic summaries in Notas mode
  useEffect(() => {
    if (status === "idle" || opts.mode !== "notas" || !opts.autoSummaryMin) {
      return;
    }
    const t = setInterval(() => summarize(false), opts.autoSummaryMin * 60_000);
    return () => clearInterval(t);
  }, [status, opts.mode, opts.autoSummaryMin, summarize]);

  useEffect(() => () => stop(), [stop]);

  return {
    status,
    interim,
    error,
    session,
    recording,
    start,
    stop,
    talk,
    summarize,
    ask,
    newSession,
    clearError: () => setError(null),
  };
}
