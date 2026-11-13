"use client";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { mentioned, type PublicWine } from "@/lib/sommelier/catalog";
import { langOf, SOMMELIER_LANGS, takeSentences } from "@/lib/sommelier/prompt";
import { addFragment, LiveCall, type LiveTurn, questionTurns } from "@/lib/sommelier/live";
import { canListen, ListenError, listenOnce, Speaker } from "@/lib/sommelier/voice";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { AskAnything } from "./ask-anything";
import { LanguagePicker } from "./language-picker";
import { guestStrings } from "./sommelier-strings";

/**
 * Public page of the AI sommelier (/sommelier/?t=<token>): the guest
 * talks by voice (or types) and hears the answer. No login: the link on
 * the venue's QR code is the access.
 */

type Venue = NonNullable<FunctionReturnType<typeof api.sommelier.venue>>;
type Phase = "idle" | "listening" | "thinking" | "speaking";

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Preview of a photo the guest sent (object URL). */
  photo?: string;
}

/** Shrinks a camera photo to a JPEG the AI can read (≈1280 px, base64). */
async function shrinkPhoto(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no canvas");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.82);
  return url.slice(url.indexOf(",") + 1);
}

const SID_KEY = "casa.sommelier.sid";
const LANG_KEY = "casa.sommelier.lang";
const FREE_KEY = "casa.sommelier.handsfree";

function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: only for this visit
  }
}

function guestId() {
  const old = stored(SID_KEY);
  if (old && /^[\w-]{8,64}$/.test(old)) {
    return old;
  }
  const id = `g-${crypto.randomUUID()}`;
  store(SID_KEY, id);
  return id;
}

function firstLang() {
  const saved = stored(LANG_KEY);
  if (saved && SOMMELIER_LANGS.some((l) => l.code === saved)) {
    return saved;
  }
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return SOMMELIER_LANGS.some((l) => l.code === nav) ? nav : "en";
}

const SWATCH: Record<string, string> = {
  red: "#8e2436",
  white: "#e2cf7d",
  rose: "#eaa0ae",
  orange: "#dd8e3c",
  sparkling: "#d9cc98",
  dessert: "#a8682b",
  "": "#9a8f86",
};

const money = (n: number) =>
  `€${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function SommelierGuest() {
  const [token, setToken] = useState<string | null>(null);
  const [venue, setVenue] = useState<Venue | null | undefined>(undefined);
  const [lang, setLangState] = useState("en");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [handsFree, setHandsFreeState] = useState(true);
  const [showList, setShowList] = useState(false);

  const sid = useRef("");
  const langRef = useRef("en");
  const handsFreeRef = useRef(true);
  const turnsRef = useRef<Turn[]>([]);
  const speaker = useRef<Speaker | null>(null);
  const unlocked = useRef(false);
  const listenCtl = useRef<AbortController | null>(null);
  const askCtl = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const camera = useRef<HTMLInputElement | null>(null);
  // Live voice conversation (GPT-Live; Claude answers the wine questions)
  const call = useRef<LiveCall | null>(null);
  const liveTurns = useRef<LiveTurn[]>([]);
  const lastHeard = useRef(0);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inCall, setInCall] = useState(false);
  const [brain, setBrain] = useState("");

  const t = guestStrings(lang);
  const liveMode = useMemo(
    () => venue?.voice === "live" && LiveCall.supported(),
    [venue]
  );
  const micOk = useMemo(() => (typeof window === "undefined" ? true : canListen()), []);

  useEffect(() => {
    sid.current = guestId();
    const l = firstLang();
    langRef.current = l;
    setLangState(l);
    const free = stored(FREE_KEY) !== "0";
    handsFreeRef.current = free;
    setHandsFreeState(free);
    const tok = new URLSearchParams(window.location.search).get("t");
    setToken(tok);
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!(tok && url)) {
      setVenue(null);
      return;
    }
    new ConvexHttpClient(url)
      .query(api.sommelier.venue, { token: tok })
      .then((v) => setVenue(v))
      .catch(() => setVenue(null));
  }, []);

  useEffect(() => {
    if (!(venue && token)) {
      return;
    }
    const s = new Speaker({
      token,
      sid: sid.current,
      lang: () => {
        const l = langOf(langRef.current);
        return { code: l.code, speech: l.speech };
      },
      natural: venue.voice === "openai",
      onSpeaking: (on) =>
        setPhase((p) => (on ? "speaking" : p === "speaking" ? "idle" : p)),
    });
    speaker.current = s;
    // Voices load late on some phones
    window.speechSynthesis?.getVoices();
    return () => {
      s.stop();
      call.current?.stop();
    };
  }, [venue, token]);

  // Hang up a live call nobody is using (it is billed per minute)
  useEffect(() => {
    if (!inCall) {
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastHeard.current > 120_000 || now - started > 15 * 60_000) {
        call.current?.stop();
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [inCall]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, interim]);

  const setLang = (code: string) => {
    langRef.current = code;
    setLangState(code);
    store(LANG_KEY, code);
  };

  const setHandsFree = (on: boolean) => {
    handsFreeRef.current = on;
    setHandsFreeState(on);
    store(FREE_KEY, on ? "1" : "0");
  };

  const updateTurns = (next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
  };

  const stopAll = () => {
    call.current?.stop();
    listenCtl.current?.abort();
    askCtl.current?.abort();
    speaker.current?.stop();
  };

  const unlock = () => {
    if (!unlocked.current) {
      unlocked.current = true;
      speaker.current?.unlock();
    }
  };

  // listen() and ask() call each other (conversation mode)
  const listenRef = useRef<() => void>(() => undefined);

  const ask = useCallback(
    async (question: string, photo?: { data: string; url: string }) => {
      const text = question.trim().slice(0, 600);
      if (!(text && token)) {
        return;
      }
      stopAll();
      setNotice(null);
      setBrain("");
      const ctl = new AbortController();
      askCtl.current = ctl;
      const history: Turn[] = [
        ...turnsRef.current,
        { role: "user", content: text, photo: photo?.url },
      ];
      updateTurns([...history, { role: "assistant", content: "" }]);
      setPhase("thinking");
      const say = (s: string) => speaker.current?.say(s);
      let answer = "";
      try {
        const res = await fetch(`${BASE_PATH}/api/sommelier/`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            t: token,
            sid: sid.current,
            lang: langRef.current,
            turns: history.slice(-12).map(({ role, content }) => ({ role, content })),
            image: photo?.data,
          }),
          signal: ctl.signal,
        });
        if (!(res.ok && res.body)) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          answer = body?.error ?? guestStrings(langRef.current).error;
          updateTurns([...history, { role: "assistant", content: answer }]);
          say(answer);
        } else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let pending = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            const chunk = decoder.decode(value, { stream: true });
            answer += chunk;
            pending += chunk;
            updateTurns([...history, { role: "assistant", content: answer }]);
            const { sentences, rest } = takeSentences(pending);
            pending = rest;
            for (const s of sentences) {
              say(s);
            }
          }
          if (pending.trim()) {
            say(pending);
          }
        }
      } catch {
        if (ctl.signal.aborted) {
          return;
        }
        answer = guestStrings(langRef.current).error;
        updateTurns([...history, { role: "assistant", content: answer }]);
      }
      if (ctl.signal.aborted) {
        return;
      }
      setPhase((p) => (p === "thinking" ? "idle" : p));
      await speaker.current?.drained();
      if (!ctl.signal.aborted && handsFreeRef.current && micOk) {
        listenRef.current();
      }
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: refs only
    [token, micOk]
  );

  const listen = useCallback(async () => {
    stopAll();
    setNotice(null);
    const ctl = new AbortController();
    listenCtl.current = ctl;
    setPhase("listening");
    setInterim("");
    try {
      const text = await listenOnce(langOf(langRef.current).speech, setInterim, ctl.signal);
      setInterim("");
      if (text) {
        ask(text);
      } else {
        setPhase("idle");
      }
    } catch (err) {
      setInterim("");
      setPhase("idle");
      const s = guestStrings(langRef.current);
      const code = err instanceof ListenError ? err.code : "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        setNotice(s.micDenied);
        setTyping(true);
      } else if (code === "unsupported") {
        setNotice(s.noMic);
        setTyping(true);
      }
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: refs only
  }, [ask]);

  listenRef.current = listen;

  /** A wine question inside a live call: Claude answers, GPT-Live says it. */
  const answerLive = async (id: string) => {
    const c = call.current;
    const asked = questionTurns(liveTurns.current);
    if (!(c && token)) {
      return;
    }
    if (!asked) {
      c.note("The guest has not asked anything yet: ask what they would like.", id);
      return;
    }
    let answer = "";
    let sent = 0;
    try {
      const res = await fetch(`${BASE_PATH}/api/sommelier/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, sid: sid.current, lang: langRef.current, turns: asked }),
      });
      if (!(res.ok && res.body)) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        c.say(body?.error ?? guestStrings(langRef.current).error, id);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        answer += decoder.decode(value, { stream: true });
        // The first sentences go out early, so the voice starts sooner
        if (!sent) {
          const { sentences } = takeSentences(answer, 60);
          if (sentences.length) {
            const first = sentences.join(" ");
            sent = answer.indexOf(first) + first.length;
            c.say(`Sommelier notes (say this in your own words, names and prices exact): ${first}`, id);
          }
        }
      }
      const rest = answer.slice(sent).trim();
      if (rest) {
        c.say(sent ? rest : `Sommelier notes (say this in your own words, names and prices exact): ${rest}`, id);
      }
      setBrain(answer);
    } catch {
      c.say(guestStrings(langRef.current).error, id);
    }
  };

  const startLive = async () => {
    stopAll();
    setNotice(null);
    setPhase("thinking");
    liveTurns.current = [];
    updateTurns([]);
    setBrain("");
    const greeting = venue?.greeting || guestStrings(langRef.current).hello;
    const speaking = () => {
      setPhase("speaking");
      if (quietTimer.current) {
        clearTimeout(quietTimer.current);
      }
      quietTimer.current = setTimeout(() => setPhase((p) => (p === "speaking" ? "listening" : p)), 1200);
    };
    const c = new LiveCall({
      onReady: () => {
        lastHeard.current = Date.now();
        setPhase("listening");
        c.say(`Greet the guest now, in your own words, along the lines of: "${greeting}". Then pause and listen.`, null);
      },
      onUser: (delta) => {
        lastHeard.current = Date.now();
        liveTurns.current = addFragment(liveTurns.current, "user", delta);
        updateTurns(liveTurns.current);
      },
      onAssistant: (delta) => {
        lastHeard.current = Date.now();
        liveTurns.current = addFragment(liveTurns.current, "assistant", delta);
        updateTurns(liveTurns.current);
        speaking();
      },
      onDelegation: (id) => {
        answerLive(id);
      },
      onEnd: () => {
        if (call.current === c) {
          call.current = null;
        }
        setInCall(false);
        setPhase("idle");
      },
    });
    call.current = c;
    setInCall(true);
    try {
      const ok = await c.start(async (sdp) => {
        const res = await fetch(`${BASE_PATH}/api/sommelier/live/`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            t: token,
            sid: sid.current,
            lang: langRef.current,
            greeting: greeting.slice(0, 400),
            sdp,
          }),
        });
        if (res.status !== 200) {
          return null;
        }
        return ((await res.json()) as { sdp: string }).sdp;
      });
      if (!ok) {
        // No live voice today: tap-and-talk instead
        call.current = null;
        setInCall(false);
        setPhase("idle");
        if (micOk) {
          listen();
        } else {
          setTyping(true);
        }
      }
    } catch {
      call.current = null;
      setInCall(false);
      setPhase("idle");
      setNotice(guestStrings(langRef.current).micDenied);
      setTyping(true);
    }
  };

  const onOrb = () => {
    if (inCall) {
      call.current?.stop();
      return;
    }
    if (liveMode) {
      startLive();
      return;
    }
    unlock();
    if (!micOk) {
      setTyping(true);
      setNotice(t.noMic);
      return;
    }
    if (phase === "listening") {
      // Done talking: what was heard so far is sent
      listenCtl.current?.abort();
      return;
    }
    listen();
  };

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    unlock();
    const text = draft;
    setDraft("");
    ask(text);
  };

  const onIdea = (text: string) => {
    unlock();
    setShowList(false);
    ask(text);
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    unlock();
    try {
      const data = await shrinkPhoto(file);
      ask(t.photoAsk, { data, url: URL.createObjectURL(file) });
    } catch {
      setNotice(t.photoBad);
    }
  };

  const restart = () => {
    stopAll();
    setPhase("idle");
    updateTurns([]);
  };

  if (venue === undefined) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center">
          <span className="size-10 animate-spin rounded-full border-2 border-border border-t-(--gold)" />
        </div>
      </Shell>
    );
  }
  if (venue === null) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <GlassIcon className="size-14 text-(--gold)" />
          <p className="text-lg text-foreground/80">{t.closed}</p>
        </div>
      </Shell>
    );
  }

  const onTap = venue.wines.filter((w) => w.onTap);
  const lastAnswer = [...turns].reverse().find((x) => x.role === "assistant");
  const label =
    inCall && phase === "listening"
      ? t.liveEnd
      : inCall && phase === "thinking"
        ? t.connecting
        : phase === "listening"
      ? t.listening
      : phase === "thinking"
        ? t.thinking
        : phase === "speaking"
          ? t.speaking
          : t.tap;

  return (
    <Shell>
      <header className="flex items-center gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <Logo company={venue.company} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-(--gold) uppercase tracking-[0.18em]">
            AI Sommelier
          </p>
          <h1 className="truncate font-serif text-xl text-foreground">{venue.name}</h1>
        </div>
        <LanguagePicker onChange={setLang} value={lang} />
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-4">
        <Bubble role="assistant" text={venue.greeting || t.hello} />
        {turns.length === 0 && phase === "idle" && !inCall ? (
          <AskAnything hints={t.ideas} onClick={onOrb} title={t.askAnything} />
        ) : null}
        {turns.map((turn, i) => (
          <div key={`${i}-${turn.role}`}>
            <Bubble
              pending={turn.role === "assistant" && !turn.content}
              photo={turn.photo}
              role={turn.role}
              text={turn.content}
            />
            {turn.role === "assistant" && turn.content && turn === lastAnswer ? (
              <WineCards
                t={t}
                wines={mentioned(inCall || brain ? brain : turn.content, venue.wines).slice(0, 4)}
              />
            ) : null}
          </div>
        ))}
        {interim ? <Bubble role="user" text={interim} faded /> : null}
        {notice ? (
          <p className="mt-3 rounded-xl bg-card px-3 py-2 text-center text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <div ref={bottom} />
      </main>

      <footer className="bg-background/80 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        {typing ? (
          <form className="mb-3 flex gap-2" onSubmit={onSend}>
            <input
              className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus:border-(--gold)/60"
              enterKeyHint="send"
              maxLength={600}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.type}
              value={draft}
            />
            <button
              className="h-11 rounded-full bg-(--gold) px-4 font-medium text-(--on-gold) disabled:opacity-40"
              disabled={!draft.trim()}
              type="submit"
            >
              {t.send}
            </button>
          </form>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <div className="flex w-24 flex-col items-start gap-2">
            <div className="flex gap-2">
              <RoundButton
                active={typing}
                label={<KeyboardIcon />}
                onClick={() => setTyping((v) => !v)}
                title={t.type}
              />
              <RoundButton
                active={false}
                label={<CameraIcon />}
                onClick={() => camera.current?.click()}
                title={t.photo}
              />
              <input
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  onPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
                ref={camera}
                type="file"
              />
            </div>
            {turns.length ? (
              <button className="text-[11px] text-muted-foreground" onClick={restart} type="button">
                {t.newChat}
              </button>
            ) : null}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Orb onClick={onOrb} phase={phase} />
            <span className="text-muted-foreground text-xs">{label}</span>
          </div>
          <div className="flex w-24 flex-col items-end gap-2">
            <RoundButton
              active={showList}
              label={<GlassIcon className="size-5 text-(--gold)" />}
              onClick={() => setShowList((v) => !v)}
              title={t.onTap}
            />
            {micOk && !liveMode ? (
              <button
                className={cn(
                  "text-right text-[11px]",
                  handsFree ? "text-(--gold)" : "text-muted-foreground"
                )}
                onClick={() => setHandsFree(!handsFree)}
                type="button"
              >
                {handsFree ? "● " : "○ "}
                {t.handsFree}
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground/70 leading-tight">{t.privacy}</p>
          <ThemeToggle className="shrink-0" />
        </div>
      </footer>

      {showList ? (
        <WineList
          onAsk={(w) => onIdea(t.askAbout(w.name))}
          onClose={() => setShowList(false)}
          t={t}
          wines={onTap.length ? onTap : venue.wines}
        />
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background bg-[radial-gradient(120%_60%_at_50%_0%,rgba(217,176,108,0.16),transparent_65%)] text-foreground [--gold:#9a6f28] [--on-gold:#ffffff] dark:[--gold:#e8c48a] dark:[--on-gold:#2a1c08]">
      {children}
    </div>
  );
}

function Logo({ company }: { company: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return <GlassIcon className="size-10 text-(--gold)" />;
  }
  return (
    // biome-ignore lint/performance/noImgElement: tiny static logo
    <img
      alt=""
      className="size-11 rounded-full bg-[#faf7f0] object-contain p-1 ring-1 ring-border"
      height={44}
      onError={() => setOk(false)}
      src={`${BASE_PATH}/brands/${company}.png`}
      width={44}
    />
  );
}

function Bubble({
  role,
  text,
  pending,
  faded,
  photo,
}: {
  role: Turn["role"];
  text: string;
  pending?: boolean;
  faded?: boolean;
  photo?: string;
}) {
  const mine = role === "user";
  return (
    <div className={cn("mt-3 flex flex-col", mine ? "items-end" : "items-start")}>
      {photo ? (
        // biome-ignore lint/performance/noImgElement: local photo preview
        <img
          alt=""
          className="mb-1.5 max-h-56 max-w-[60%] rounded-2xl object-cover ring-1 ring-border"
          src={photo}
        />
      ) : null}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
          mine
            ? "rounded-br-md bg-(--gold) text-(--on-gold)"
            : "rounded-bl-md border border-border bg-card text-foreground",
          faded && "opacity-60"
        )}
      >
        {pending ? (
          <span className="inline-flex gap-1 py-1">
            <Dot delay="0ms" />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  );
}

function Orb({ phase, onClick }: { phase: Phase; onClick: () => void }) {
  const active = phase !== "idle";
  return (
    <button
      aria-label="Microphone"
      className="relative flex size-20 items-center justify-center rounded-full outline-none active:scale-95"
      onClick={onClick}
      type="button"
    >
      {phase === "listening" || phase === "speaking" ? (
        <>
          <span className="absolute inset-0 animate-ping rounded-full bg-(--gold)/25" />
          <span className="absolute -inset-2 animate-pulse rounded-full border border-(--gold)/30" />
        </>
      ) : null}
      <span
        className={cn(
          "relative flex size-20 items-center justify-center rounded-full shadow-[0_10px_40px_-10px_rgba(201,154,85,0.55)] transition-colors",
          active
            ? "bg-gradient-to-b from-[#f5e3bd] to-[#c99a55]"
            : "bg-gradient-to-b from-[#e6c88d] to-[#b0803f]"
        )}
      >
        {phase === "thinking" ? (
          <span className="size-8 animate-spin rounded-full border-[3px] border-[#2a1c08]/30 border-t-[#2a1c08]" />
        ) : phase === "speaking" ? (
          <Bars />
        ) : (
          <MicIcon />
        )}
      </span>
    </button>
  );
}

function Bars() {
  return (
    <span className="flex h-8 items-center gap-1">
      {[0, 120, 240, 360, 120].map((d, i) => (
        <span
          className="w-1.5 animate-pulse rounded-full bg-[#2a1c08]"
          key={`${i}-${d}`}
          style={{ height: `${[14, 26, 18, 28, 12][i]}px`, animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-8 text-[#2a1c08]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <rect height="12" rx="3" width="6" x="9" y="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function RoundButton({
  label,
  onClick,
  active,
  title,
}: {
  label: React.ReactNode;
  onClick: () => void;
  active: boolean;
  title: string;
}) {
  return (
    <button
      aria-label={title}
      className={cn(
        "flex size-11 items-center justify-center rounded-full border text-lg",
        active
          ? "border-(--gold)/60 bg-(--gold)/15"
          : "border-border bg-card"
      )}
      onClick={onClick}
      title={title}
      type="button"
    >
      {label}
    </button>
  );
}

type Strings = ReturnType<typeof guestStrings>;

function priceLine(w: PublicWine, t: Strings) {
  const glass = w.pours.find((p) => p.ml >= 100) ?? w.pours.at(-1);
  return [
    glass ? `${glass.ml} ml ${money(glass.price)}` : "",
    w.bottle ? `${t.bottle} ${money(w.bottle)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function WineCards({ wines, t }: { wines: PublicWine[]; t: Strings }) {
  if (!wines.length) {
    return null;
  }
  return (
    <div className="-mx-4 mt-2 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
      {wines.map((w) => (
        <div
          className="w-56 shrink-0 snap-start rounded-2xl border border-border bg-card p-3"
          key={w.id}
        >
          <div className="flex items-start gap-2">
            <span
              className="mt-1 size-3 shrink-0 rounded-full"
              style={{ background: SWATCH[w.color] ?? SWATCH[""] }}
            />
            <div className="min-w-0">
              <p className="font-medium text-sm leading-snug">{w.name}</p>
              <p className="truncate text-muted-foreground text-xs">
                {[w.grape, w.region || w.country].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          {w.onTap ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {w.pours.map((p) => (
                <span
                  className="rounded-full bg-(--gold)/15 px-2 py-0.5 text-(--gold) text-[11px]"
                  key={p.ml}
                >
                  {p.ml} ml · {money(p.price)}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground text-xs">{priceLine(w, t)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function WineList({
  wines,
  t,
  onAsk,
  onClose,
}: {
  wines: PublicWine[];
  t: Strings;
  onAsk: (w: PublicWine) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
        <h2 className="font-serif text-xl">{t.onTap}</h2>
        <button
          aria-label={t.stop}
          className="flex size-10 items-center justify-center rounded-full bg-muted text-lg"
          onClick={onClose}
          type="button"
        >
          ✕
        </button>
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {wines.map((w) => (
          <li key={w.id}>
            <button
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left active:scale-[0.99]"
              onClick={() => onAsk(w)}
              type="button"
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ background: SWATCH[w.color] ?? SWATCH[""] }}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm">{w.name}</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {[w.grape, w.country].filter(Boolean).join(" · ")}
                </span>
                <span className="block text-(--gold) text-xs">{priceLine(w, t)}</span>
              </span>
              <span className="shrink-0 rounded-full bg-(--gold) px-3 py-1 font-medium text-(--on-gold) text-xs">
                {t.ask}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Line drawing of a wine glass (replaces the emoji). */
function GlassIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <path d="M7 2.75h10c.4 2.6.5 5.4-.6 7.6A4.9 4.9 0 0 1 12 13a4.9 4.9 0 0 1-4.4-2.65C6.5 8.15 6.6 5.35 7 2.75Z" />
      <path d="M7.2 7.25c1.6-.7 3.2-.7 4.8 0s3.2.7 4.8 0" />
      <path d="M12 13v8M8.5 21.25h7" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-5 text-(--gold)"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-5 text-foreground/80"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <rect height="12" rx="2.5" width="19" x="2.5" y="6" />
      <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8" />
    </svg>
  );
}
