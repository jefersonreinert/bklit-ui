"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * Charts (NumberFlow, live streams, locale formatting) render client-side only
 * so the static GitHub Pages export never hits hydration mismatches.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        aria-busy="true"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 8 }, (_, i) => (
          <div
            className="acrylic h-40 animate-pulse rounded-xl bg-card ring-1 ring-foreground/10"
            key={i}
          />
        ))}
      </div>
    );
  }
  return children;
}
