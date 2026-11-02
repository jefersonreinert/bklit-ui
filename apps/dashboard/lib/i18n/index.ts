"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EN } from "./en";
import { ES } from "./es";
import { IT } from "./it";
import { MT } from "./mt";

/**
 * App language. Texts are written in Portuguese in the code and wrapped in
 * t("…"): the Portuguese text is the key. English, Spanish, Italian and
 * Maltese have reviewed dictionaries; any other language is translated by
 * AI once (from English) and kept on this device.
 */

export type Dict = Record<string, string>;

const BUILTIN: Record<string, Dict> = { en: EN, es: ES, it: IT, mt: MT };
export const SOURCE = "pt";

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
const cacheKey = (code: string) => `cb:i18n:${code}`;

let locale: string | undefined;
let aiDict: Dict = {};
let translating = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    l();
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function readCache(code: string): Dict {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(code)) ?? "{}") as Dict;
  } catch {
    return {};
  }
}

function applyDocument(code: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = code;
    document.documentElement.dir = RTL.has(code) ? "rtl" : "ltr";
  }
}

export function getLocale() {
  if (locale === undefined) {
    try {
      locale = localStorage.getItem(LOCALE_KEY) ?? SOURCE;
    } catch {
      locale = SOURCE;
    }
    if (!isBuiltin(locale)) {
      aiDict = readCache(locale);
      ensureTranslated(locale);
    }
    applyDocument(locale);
  }
  return locale;
}

export function setLocale(code: string) {
  locale = code;
  try {
    localStorage.setItem(LOCALE_KEY, code);
  } catch {
    // private mode
  }
  aiDict = isBuiltin(code) ? {} : readCache(code);
  applyDocument(code);
  emit();
  if (!isBuiltin(code)) {
    ensureTranslated(code);
  }
}

export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => SOURCE);
}

/** True while an AI translation is being downloaded. */
export function useTranslating() {
  return useSyncExternalStore(
    subscribe,
    () => translating,
    () => false
  );
}

/* ------------------------------ translation ------------------------------ */

function fill(text: string, vars?: Record<string, string | number>) {
  if (!vars) {
    return text;
  }
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m
  );
}

/** Translates a Portuguese text to the current language. */
export function translate(
  text: string,
  vars?: Record<string, string | number>,
  code = getLocale()
) {
  if (code === SOURCE) {
    return fill(text, vars);
  }
  const dict = BUILTIN[code] ?? aiDict;
  return fill(dict[text] ?? EN[text] ?? text, vars);
}

/** Language the screen is showing (set by I18nRoot after hydration). */
let shown = SOURCE;
export const setShownLocale = (code: string) => {
  shown = code;
};

/**
 * tx("Caixa") outside hooks: the language on screen. I18nRoot remounts
 * the app when the language changes, so plain calls stay current.
 */
export const tx = (text: string, vars?: Record<string, string | number>) =>
  translate(text, vars, shown);

/** t("Caixa"), t("{n} itens", { n: 3 }) in the current language. */
export function useT() {
  const code = useLocale();
  return useCallback(
    (text: string, vars?: Record<string, string | number>) =>
      translate(text, vars, code),
    [code]
  );
}

const BATCH = 120;

/** Downloads the AI translation of every known text (once per device). */
async function ensureTranslated(code: string) {
  if (translating || typeof window === "undefined") {
    return;
  }
  const missing = Object.keys(EN).filter((k) => !(k in aiDict));
  if (missing.length === 0) {
    return;
  }
  translating = true;
  emit();
  try {
    for (let i = 0; i < missing.length; i += BATCH) {
      const keys = missing.slice(i, i + BATCH);
      const res = await fetch("/api/i18n", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale: code,
          texts: keys.map((k) => ({ id: k, en: EN[k] })),
        }),
      });
      if (!res.ok) {
        break;
      }
      const { translations } = (await res.json()) as {
        translations: Record<string, string>;
      };
      if (locale !== code) {
        return;
      }
      aiDict = { ...aiDict, ...translations };
      try {
        localStorage.setItem(cacheKey(code), JSON.stringify(aiDict));
      } catch {
        // storage full: keep it in memory
      }
      emit();
    }
  } catch {
    // offline: English is shown for the missing texts
  } finally {
    translating = false;
    emit();
  }
}
