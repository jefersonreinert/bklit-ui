"use client";

import { Fragment, type ReactNode, useEffect, useState } from "react";
import { SOURCE, setShownLocale, subscribeI18n, useLocale } from ".";
import { translateScreen } from "./dom";

/**
 * Renders the app in the chosen language. The server and the first client
 * render use Portuguese (same HTML, no hydration mismatch); then the app
 * remounts in the device's language, and again on every change. The screen
 * translator covers every interface text; new AI translations re-scan it.
 */
export function I18nRoot({ children }: { children: ReactNode }) {
  const code = useLocale();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const active = ready ? code : SOURCE;
  setShownLocale(active);
  useEffect(() => {
    if (active === SOURCE) {
      return;
    }
    const screen = translateScreen();
    const stop = subscribeI18n(screen.rescan);
    return () => {
      stop();
      screen.stop();
    };
  }, [active]);
  return <Fragment key={active}>{children}</Fragment>;
}
