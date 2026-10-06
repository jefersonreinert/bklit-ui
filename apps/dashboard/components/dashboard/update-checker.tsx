"use client";

import { useEffect } from "react";

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/version/`;
const TRIED_KEY = "casa-brasa-reloaded-for";
const EVERY_MS = 10 * 60 * 1000;

/**
 * The Home Screen app can stay open for days with an old version in memory.
 * When it comes back to the foreground (and every 10 min) it asks the server
 * for the live build and reloads once if a newer one was deployed.
 */
export function UpdateChecker() {
  useEffect(() => {
    if (BUILD === "dev") {
      return;
    }
    const check = async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      try {
        const res = await fetch(API, { cache: "no-store" });
        if (!res.ok) {
          return;
        }
        const { build } = (await res.json()) as { build: string };
        // One reload per new build, so a stale CDN copy can't loop
        if (build !== BUILD && sessionStorage.getItem(TRIED_KEY) !== build) {
          sessionStorage.setItem(TRIED_KEY, build);
          window.location.reload();
        }
      } catch {
        // offline — try again later
      }
    };
    check();
    const timer = setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
