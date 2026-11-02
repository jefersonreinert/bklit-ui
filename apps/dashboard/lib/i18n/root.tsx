"use client";

import { Fragment, type ReactNode, useEffect, useState } from "react";
import { SOURCE, setShownLocale, useLocale } from ".";

/**
 * Renders the app in the chosen language. The server and the first client
 * render use Portuguese (same HTML, no hydration mismatch); then the app
 * remounts in the device's language, and again on every change.
 */
export function I18nRoot({ children }: { children: ReactNode }) {
  const code = useLocale();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const active = ready ? code : SOURCE;
  setShownLocale(active);
  return <Fragment key={active}>{children}</Fragment>;
}
