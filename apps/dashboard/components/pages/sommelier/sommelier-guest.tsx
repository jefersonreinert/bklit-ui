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
import { StippleArt } from "./stipple";
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

export function SommelierGuest() {
  const [token, setToken] = useState<string | null>(null);
  const [venue, setVenue] = useState<Venue | null | undefined>(undefined);
  const [lang, setLangState] = useState("en");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [holding, setHoldingState] = useState(false);
  const [showList, setShowList] = useState(false);

  const sid = useRef("");
  const langRef = useRef("en");
  const holdingRef = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const speaker = useRef<Speaker | null>(null);
  const unlocked = useRef(false);
  const listenCtl = useRef<AbortController | null>(null);
  const askCtl = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const camera = useRef<HTMLInputElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
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

  const setHolding = (on: boolean) => {
    holdingRef.current = on;
    setHoldingState(on);
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
      // Push-to-talk only: the mic never opens by itself (noisy bar)
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
      const text = await listenOnce(langOf(langRef.current).speech, setInterim, ctl.signal, true);
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
        field.current?.focus();
      } else if (code === "unsupported") {
        setNotice(s.noMic);
        field.current?.focus();
      }
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: refs only
  }, [ask]);


  /** A wine question inside a live call: Claude answers, GPT-Live says it. */
  const answerLive = async (id: string | null, image?: string) => {
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
        body: JSON.stringify({
          t: token,
          sid: sid.current,
          lang: langRef.current,
          turns: asked,
          image,
        }),
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
            c.say(`Sommelier notes (say this briefly, add nothing, wine names exact): ${first}`, id);
          }
        }
      }
      const rest = answer.slice(sent).trim();
      if (rest) {
        c.say(sent ? rest : `Sommelier notes (say this briefly, add nothing, wine names exact): ${rest}`, id);
      }
      setBrain(answer);
    } catch {
      c.say(guestStrings(langRef.current).error, id);
    }
  };

  /** A photo inside a live call: the voice says it is looking, Claude reads it. */
  const showPhoto = (photo: { data: string; url: string }) => {
    liveTurns.current = [
      ...liveTurns.current,
      { role: "user", content: guestStrings(langRef.current).photoAsk, photo: photo.url },
    ];
    updateTurns(liveTurns.current);
  };

  const photoLive = (photo: { data: string; url: string }, shown = false) => {
    const c = call.current;
    if (!c) {
      return;
    }
    lastHeard.current = Date.now();
    if (!shown) {
      showPhoto(photo);
    }
    setBrain("");
    c.say(
      "The guest just sent you a photo of a wine. In a few words, say you are looking at the label. Then wait for the sommelier notes about it.",
      null
    );
    answerLive(null, photo.data);
  };

  const startLive = async (photo?: { data: string; url: string }) => {
    stopAll();
    setNotice(null);
    setPhase("thinking");
    liveTurns.current = [];
    updateTurns([]);
    setBrain("");
    if (photo) {
      showPhoto(photo);
    }
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
        // Still holding since the tap that started the call
        c.setMic(holdingRef.current);
        if (photo) {
          photoLive(photo, true);
        } else {
          c.say(`Greet the guest now, in your own words, along the lines of: "${greeting}". Then pause and listen.`, null);
        }
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
        if (photo) {
          updateTurns([]);
          ask(guestStrings(langRef.current).photoAsk, photo);
        } else if (micOk) {
          listen();
        } else {
          field.current?.focus();
        }
      }
    } catch {
      call.current = null;
      setInCall(false);
      setPhase("idle");
      setNotice(guestStrings(langRef.current).micDenied);
      field.current?.focus();
      if (photo) {
        // No microphone: the answer still comes, read aloud
        updateTurns([]);
        ask(guestStrings(langRef.current).photoAsk, photo);
      }
    }
  };

  /**
   * Push-to-talk: the mic only hears the guest while they hold the
   * button, so the talk around them in the bar is not picked up.
   */
  const onPressStart = () => {
    unlock();
    setHolding(true);
    if (liveMode) {
      if (inCall && call.current) {
        call.current.setMic(true);
        setPhase("listening");
      } else if (!inCall) {
        startLive();
      }
      return;
    }
    if (!micOk) {
      field.current?.focus();
      setNotice(t.noMic);
      return;
    }
    listen();
  };

  const onPressEnd = () => {
    if (!holdingRef.current) {
      return;
    }
    setHolding(false);
    if (liveMode) {
      call.current?.setMic(false);
      setPhase((p) => (p === "listening" ? "idle" : p));
      return;
    }
    // Let go: what was heard is sent
    listenCtl.current?.abort();
  };

  const endCall = () => call.current?.stop();

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    unlock();
    const text = draft.trim().slice(0, 600);
    if (!text) {
      return;
    }
    setDraft("");
    field.current?.blur();
    if (inCall && call.current) {
      // Typed inside a live call: Claude answers, the voice says it
      lastHeard.current = Date.now();
      liveTurns.current = [...liveTurns.current, { role: "user", content: text }];
      updateTurns(liveTurns.current);
      setBrain("");
      answerLive(null);
      return;
    }
    ask(text);
  };

  /** Typing while the mic listens: stop listening (bar noise). */
  const onFieldFocus = () => {
    if (phase === "listening" && !inCall) {
      listenCtl.current?.abort();
      setInterim("");
      setPhase("idle");
    }
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
      const photo = { data: await shrinkPhoto(file), url: URL.createObjectURL(file) };
      // Live voice venues: the answer comes as a spoken conversation
      if (inCall && call.current) {
        photoLive(photo);
      } else if (liveMode) {
        startLive(photo);
      } else {
        ask(t.photoAsk, photo);
      }
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
  const label = holding ? t.release : talkLabel(t, phase, inCall);

  return (
    <Shell>
      <header className="flex items-center gap-2.5 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-1.5">
        <Logo company={venue.company} />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="truncate font-serif text-lg text-foreground leading-tight">{venue.name}</h1>
          <span className="shrink-0 text-(--gold) text-[9px] uppercase tracking-[0.18em]">AI Sommelier</span>
        </div>
        <button
          aria-label={t.onTap}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border",
            showList ? "border-(--gold)/60 bg-(--gold)/15" : "border-border bg-card"
          )}
          onClick={() => setShowList((v) => !v)}
          title={t.onTap}
          type="button"
        >
          <GlassIcon className="size-[18px] text-(--gold)" />
        </button>
        <LanguagePicker onChange={setLang} value={lang}>
          <ThemeToggle className="w-full justify-between [&>button]:flex-1 [&>button]:justify-center" />
          {turns.length ? (
            <button className="block text-muted-foreground text-xs" onClick={restart} type="button">
              ↺ {t.newChat}
            </button>
          ) : null}
          <p className="text-[10px] text-muted-foreground/70 leading-snug">{t.privacy}</p>
        </LanguagePicker>
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto px-4 pb-4">
        {turns.length === 0 && phase === "idle" && !inCall ? (
          <AskAnything hints={t.ideas} onClick={() => field.current?.focus()} title={t.askAnything} />
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

      <footer className="space-y-2.5 bg-background/80 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <form className="relative" onSubmit={onSend}>
          <input
            aria-label={t.type}
            className="h-12 w-full rounded-full border border-border bg-card pr-14 pl-5 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus:border-(--gold)/60"
            enterKeyHint="send"
            maxLength={600}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={onFieldFocus}
            placeholder={t.type}
            ref={field}
            value={draft}
          />
          <button
            aria-label={t.send}
            className="absolute top-1.5 right-1.5 flex size-9 items-center justify-center rounded-full bg-(--gold) text-(--on-gold) transition-opacity disabled:opacity-30"
            disabled={!draft.trim()}
            type="submit"
          >
            <SendIcon />
          </button>
        </form>
        <div className="flex gap-2.5">
          {inCall ? (
            <button
              aria-label={t.endCall}
              className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground/80"
              onClick={endCall}
              title={t.endCall}
              type="button"
            >
              ✕
            </button>
          ) : null}
          <TalkButton
            holding={holding}
            label={label}
            onEnd={onPressEnd}
            onStart={onPressStart}
            phase={phase}
          />
          <button
            aria-label={t.photo}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card font-medium text-foreground text-sm active:scale-[0.98]",
              inCall ? "w-12 shrink-0" : "min-w-0 flex-1 px-3"
            )}
            onClick={() => camera.current?.click()}
            type="button"
          >
            <CameraIcon />
            {inCall ? null : <span className="truncate">{t.photoBtn}</span>}
          </button>
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
    <div className="relative isolate flex h-dvh flex-col overflow-hidden bg-background bg-[radial-gradient(120%_60%_at_50%_0%,rgba(217,176,108,0.16),transparent_65%)] text-foreground [--gold:#9a6f28] [--on-gold:#ffffff] dark:[--gold:#e8c48a] dark:[--on-gold:#2a1c08]">
      <StippleArt
        className="pointer-events-none absolute top-[12%] -right-[30%] -z-10 h-[78vh] w-[78vh] max-w-none"
        dots={20_000}
        fps={30}
        grain={1.2}
        hold={6}
        morph={3}
        opacity={0.13}
        start={2}
      />
      {children}
    </div>
  );
}

function Logo({ company }: { company: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return <GlassIcon className="size-9 text-(--gold)" />;
  }
  return (
    // biome-ignore lint/performance/noImgElement: tiny static logo
    <img
      alt=""
      className="size-9 rounded-full bg-[#faf7f0] object-contain p-0.5 ring-1 ring-border"
      height={36}
      onError={() => setOk(false)}
      src={`${BASE_PATH}/brands/${company}.png`}
      width={36}
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

function talkLabel(t: Strings, phase: Phase, inCall: boolean) {
  if (inCall && phase === "thinking") {
    return t.connecting;
  }
  switch (phase) {
    case "listening":
      return inCall ? t.talk : t.listening;
    case "thinking":
      return t.thinking;
    case "speaking":
      return t.speaking;
    default:
      return t.talk;
  }
}

/** Talk: same size as the photo button, the text field sits above both. */
/** Hold to talk, let go to send (pointer and keyboard). */
function TalkButton({
  phase,
  label,
  holding,
  onStart,
  onEnd,
}: {
  phase: Phase;
  label: string;
  holding: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  const live = holding || phase === "speaking";
  return (
    <button
      aria-label={label}
      aria-pressed={holding}
      className={cn(
        "relative flex h-12 min-w-0 flex-1 touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-b from-[#e6c88d] to-[#b0803f] px-3 font-medium text-[#2a1c08] text-sm shadow-[0_8px_30px_-12px_rgba(201,154,85,0.7)] transition-transform [-webkit-touch-callout:none]",
        holding && "scale-[1.04] ring-4 ring-(--gold)/30"
      )}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          onStart();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          onEnd();
        }
      }}
      onPointerCancel={onEnd}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart();
      }}
      onPointerUp={onEnd}
      type="button"
    >
      {live ? <span className="absolute inset-0 animate-pulse bg-white/20" /> : null}
      {phase === "thinking" ? (
        <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-[#2a1c08]/30 border-t-[#2a1c08]" />
      ) : phase === "speaking" ? (
        <Bars />
      ) : (
        <MicIcon />
      )}
      <span className="relative truncate">{label}</span>
    </button>
  );
}

function Bars() {
  return (
    <span className="relative flex h-5 shrink-0 items-center gap-0.5">
      {[0, 120, 240, 360, 120].map((d, i) => (
        <span
          className="w-1 animate-pulse rounded-full bg-[#2a1c08]"
          key={`${i}-${d}`}
          style={{ height: `${[8, 16, 11, 18, 7][i]}px`, animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      className="relative size-5 shrink-0 text-[#2a1c08]"
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

type Strings = ReturnType<typeof guestStrings>;

/** How the wine is served (sizes, bottle), never the price. */
function serveLine(w: PublicWine, t: Strings) {
  return [w.sizes.length ? `${w.sizes.join(" · ")} ml` : "", w.bottle ? t.bottle : ""]
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
              {w.sizes.map((ml) => (
                <span
                  className="rounded-full bg-(--gold)/15 px-2 py-0.5 text-(--gold) text-[11px]"
                  key={ml}
                >
                  {ml} ml
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground text-xs">{serveLine(w, t)}</p>
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
                <span className="block text-(--gold) text-xs">{serveLine(w, t)}</span>
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

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.2}
      viewBox="0 0 24 24"
    >
      <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
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
