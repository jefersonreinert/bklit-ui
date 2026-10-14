"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useSyncExternalStore } from "react";
import { AppHeader } from "@/components/dashboard/app-header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { ClientOnly } from "@/components/dashboard/client-only";
import { InstallHint } from "@/components/dashboard/install-hint";
import { normalizePath } from "@/lib/nav";

const noop = () => () => undefined;

/** `?embed` in the URL: the page is shown inside a home screen widget. */
function useEmbedded() {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).has("embed"),
    () => false
  );
}

/**
 * The panel's frame (sidebar, header). The home screen (/) is full screen
 * with its own wallpaper, and pages embedded in a widget show only their
 * content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const path = normalizePath(usePathname());
  const embedded = useEmbedded();

  if (path === "/") {
    return (
      <ClientOnly fallback={<div className="min-h-dvh bg-[#141413]" />}>
        {children}
      </ClientOnly>
    );
  }
  if (embedded) {
    return (
      <main className="min-h-dvh p-3">
        <ClientOnly>{children}</ClientOnly>
      </main>
    );
  }
  return (
    <div className="relative flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
        <InstallHint />
        <AppHeader />
        <main className="flex-1 p-4 md:p-6">
          <ClientOnly>{children}</ClientOnly>
        </main>
      </div>
    </div>
  );
}
