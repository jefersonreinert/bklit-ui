"use client";

import { useCallback, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import { convexClient } from "@/lib/sync/convex-client";
import { EN } from "./en";
import { ES } from "./es";
import { IT } from "./it";
import { SOURCE, shownLocale } from "./locale";
import { MT } from "./mt";

/**
 * App language. The interface is written in Portuguese; the Portuguese text
 * is the key of every translation. The whole app is covered:
 *
 * - catalog.json lists every interface text of the code
 *   (scripts/i18n-extract.mjs);
 * - each language is translated by AI once (app/api/i18n) and kept in Convex
 *   for every device (i18n.dict), plus a copy on this device;
 * - en/es/it/mt also have reviewed texts that win over the AI ones;
 * - dom.ts swaps the texts on screen; t()/tx() cover texts with {values}.
 */

export type Dict = Record<string, string>;

const BUILTIN: Record<string, Dict> = { en: EN, es: ES, it: IT, mt: MT };
export { SOURCE };

/** Languages offered in the picker (BCP 47), most spoken first. */
export const LANGUAGES = [
  "pt",
  "en",
  "es",
  "it",
  "mt",
  "fr",
  "de",
  "zh",
  "hi",
  "ar",
  "bn",
  "ru",
  "ja",
  "pa",
  "tr",
  "ko",
  "vi",
  "id",
  "ur",
  "fa",
  "pl",
  "uk",
  "nl",
  "ro",
  "el",
  "cs",
  "sv",
  "hu",
  "da",
  "fi",
  "no",
  "he",
  "th",
  "ms",
  "tl",
  "sw",
  "bg",
  "hr",
  "sr",
  "sk",
  "sl",
  "lt",
  "lv",
  "et",
  "sq",
  "mk",
  "bs",
  "is",
  "ga",
  "cy",
  "eu",
  "ca",
  "gl",
  "af",
  "am",
  "az",
  "be",
  "hy",
  "ka",
  "kk",
  "uz",
  "ky",
  "mn",
  "ne",
  "si",
  "ta",
  "te",
  "kn",
  "ml",
  "mr",
  "gu",
  "km",
  "lo",
  "my",
  "ha",
  "yo",
  "ig",
  "zu",
  "xh",
  "so",
  "rw",
  "mg",
  "ps",
  "ku",
  "lb",
  "fy",
  "eo",
  "la",
] as const;

const RTL = new Set(["ar", "he", "fa", "ur", "ps", "ku"]);

/** Languages with reviewed texts (the rest of the app comes from AI). */
export const isBuiltin = (code: string) => code === SOURCE || code in BUILTIN;

/** Language name in its own language ("Deutsch", "日本語"). */
export function languageName(code: string) {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}

/* --------------------------------- state --------------------------------- */

const LOCALE_KEY = "cb:locale";
const cacheKey = (code: string) => `cb:i18n2:${code}`;

let locale: string | undefined;
/** AI translations of the current language (Convex + this device). */
let remote = new Map<string, string>();
/** Translation progress of the current language (null when complete). */
let progress: { done: number; total: number } | null = null;
let stopRemote: (() => void) | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  for (const l of listeners) {
    l();
  }
}

export function subscribeI18n(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function readCache(code: string) {
  try {
    const pairs = JSON.parse(
      localStorage.getItem(cacheKey(code)) ?? "[]"
    ) as string[][];
    return new Map(pairs.map(([k, t]) => [k ?? "", t ?? ""]));
  } catch {
    return new Map<string, string>();
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function writeCache(code: string) {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(cacheKey(code), JSON.stringify([...remote]));
    } catch {
      // storage full: Convex still has it
    }
  }, 1000);
}

function applyDocument(code: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = code;
    document.documentElement.dir = RTL.has(code) ? "rtl" : "ltr";
  }
}

/** Loads the language's translations and fills in what is missing. */
function load(code: string) {
  stopRemote?.();
  stopRemote = null;
  remote = code === SOURCE ? new Map() : readCache(code);
  progress = null;
  if (code === SOURCE || typeof window === "undefined") {
    return;
  }
  const client = convexClient();
  if (client) {
    const watch = client.watchQuery(api.i18n.dict, { locale: code });
    let first = true;
    const push = () => {
      let pairs: string[][] | undefined;
      try {
        pairs = watch.localQueryResult();
      } catch {
        pairs = undefined;
      }
      if (pairs === undefined || locale !== code) {
        return;
      }
      for (const [k, t] of pairs) {
        if (k && t) {
          remote.set(k, t);
        }
      }
      writeCache(code);
      emit();
      if (first) {
        first = false;
        fillMissing(code);
      }
    };
    stopRemote = watch.onUpdate(push);
    push();
  } else {
    fillMissing(code);
  }
}

export function getLocale() {
  if (locale === undefined) {
    try {
      locale = localStorage.getItem(LOCALE_KEY) ?? SOURCE;
    } catch {
      locale = SOURCE;
    }
    applyDocument(locale);
    load(locale);
  }
  return locale;
}

export function setLocale(code: string) {
  if (code === locale) {
    return;
  }
  locale = code;
  try {
    localStorage.setItem(LOCALE_KEY, code);
  } catch {
    // private mode
  }
  applyDocument(code);
  load(code);
  emit();
}

export function useLocale() {
  return useSyncExternalStore(subscribeI18n, getLocale, () => SOURCE);
}

/** Share of the app already translated while the AI works (0–1), or null. */
export function useTranslating() {
  return useSyncExternalStore(
    subscribeI18n,
    () => (progress ? progress.done / Math.max(1, progress.total) : null),
    () => null
  );
}

/** Changes whenever translations arrive (for the screen translator). */
export const i18nVersion = () => version;

/* ------------------------------ translation ------------------------------ */

function fill(text: string, vars?: Record<string, string | number>) {
  if (!vars) {
    return text;
  }
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m
  );
}

/** The translation of a Portuguese text, or undefined when unknown. */
export function lookup(text: string, code = shownLocale()): string | undefined {
  if (code === SOURCE) {
    return undefined;
  }
  return (
    BUILTIN[code]?.[text] ??
    (code === locale ? remote.get(text) : undefined) ??
    (code === "en" ? undefined : EN[text])
  );
}

/** Translates a Portuguese text to a language (default: on screen). */
export function translate(
  text: string,
  vars?: Record<string, string | number>,
  code = getLocale()
) {
  return fill(lookup(text, code) ?? text, vars);
}

export { appLocale, setShownLocale, shownLocale } from "./locale";

/**
 * tx("Caixa") outside hooks: the language on screen. I18nRoot remounts
 * the app when the language changes, so plain calls stay current.
 */
export const tx = (text: string, vars?: Record<string, string | number>) =>
  translate(text, vars, shownLocale());

/** t("Caixa"), t("{n} itens", { n: 3 }) in the current language. */
export function useT() {
  const code = useLocale();
  useSyncExternalStore(subscribeI18n, i18nVersion, () => 0);
  return useCallback(
    (text: string, vars?: Record<string, string | number>) =>
      translate(text, vars, code),
    // biome-ignore lint/correctness/useExhaustiveDependencies: new translations re-render through the store
    [code]
  );
}

/* ------------------------------- AI filling ------------------------------ */

const BATCH = 100;
const PARALLEL = 3;
let filling: string | null = null;

/** Asks the server to translate the texts this language still lacks. */
async function fillMissing(code: string) {
  if (filling === code) {
    return;
  }
  filling = code;
  try {
    const { default: catalog } = (await import("./catalog.json")) as {
      default: string[];
    };
    const reviewed = BUILTIN[code] ?? {};
    const missing = catalog.filter((k) => !(k in reviewed || remote.has(k)));
    if (missing.length === 0) {
      return;
    }
    progress = { done: catalog.length - missing.length, total: catalog.length };
    emit();
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += BATCH) {
      batches.push(missing.slice(i, i + BATCH));
    }
    const worker = async () => {
      for (let batch = batches.shift(); batch; batch = batches.shift()) {
        if (locale !== code) {
          return;
        }
        const res = await fetch("/api/i18n", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale: code, texts: batch }),
        }).catch(() => null);
        if (!res?.ok) {
          continue;
        }
        const { translations } = (await res.json()) as {
          translations: Record<string, string>;
        };
        if (locale !== code) {
          return;
        }
        for (const [k, t] of Object.entries(translations)) {
          remote.set(k, t);
        }
        if (progress) {
          progress.done += batch.length;
        }
        writeCache(code);
        emit();
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
  } finally {
    if (filling === code) {
      filling = null;
      progress = null;
      emit();
    }
  }
}
