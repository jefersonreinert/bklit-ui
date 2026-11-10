"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * A full-screen page pushed over the app (like an iPhone navigation
 * push), instead of a sheet or modal. It slides in from the right, has a
 * back button, and joins the browser history: the iPhone back swipe, the
 * Android back button and Esc all close the top page. Pages can stack.
 */

const stack: { id: string; close: () => void; closedByHistory?: boolean }[] = [];
let locked = 0;
/** history.back() calls we made ourselves (their popstate is ignored). */
let ownBacks = 0;
let listening = false;

function listen() {
  if (listening) {
    return;
  }
  listening = true;
  window.addEventListener("popstate", () => {
    if (ownBacks > 0) {
      ownBacks--;
      return;
    }
    // Back gesture: close only the top page
    const top = stack.at(-1);
    if (top) {
      top.closedByHistory = true;
      top.close();
    }
  });
}

function lockScroll(on: boolean) {
  locked += on ? 1 : -1;
  document.documentElement.style.overflow = locked > 0 ? "hidden" : "";
}

/**
 * Joins the shared back stack while mounted: adds a history entry, closes
 * on the back gesture / Esc (top layer only), locks page scroll and gives
 * focus back to the opener. Used by FullPage and the camera scanner.
 */
export function useBackLayer(onClose: () => void, onOpen?: () => void) {
  const id = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    listen();
    const entry = { id, close: () => onCloseRef.current() } as (typeof stack)[number];
    stack.push(entry);
    lockScroll(true);
    window.history.pushState({ ...window.history.state, fullPage: id }, "");
    const opener = document.activeElement as HTMLElement | null;
    onOpenRef.current?.();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack.at(-1) === entry && !e.defaultPrevented) {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = stack.indexOf(entry);
      if (i >= 0) {
        stack.splice(i, 1);
      }
      lockScroll(false);
      // Closed by a button: drop the history entry we added
      if (!entry.closedByHistory && window.history.state?.fullPage === id) {
        ownBacks++;
        window.history.back();
      }
      opener?.focus?.({ preventScroll: true });
    };
  }, [id]);
}

export function FullPage({
  open,
  onClose,
  title,
  subtitle,
  actions,
  footer,
  backLabel = "Voltar",
  children,
  className,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  backLabel?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return null;
  }
  return createPortal(
    <AnimatePresence>
      {open ? (
        <PageLayer
          actions={actions}
          backLabel={backLabel}
          bodyClassName={bodyClassName}
          className={className}
          footer={footer}
          onClose={onClose}
          subtitle={subtitle}
          title={title}
        >
          {children}
        </PageLayer>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

function PageLayer({
  onClose,
  title,
  subtitle,
  actions,
  footer,
  backLabel,
  children,
  className,
  bodyClassName,
}: {
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  backLabel: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  useBackLayer(onClose, () => heading.current?.focus({ preventScroll: true }));

  return (
    <motion.div
      animate={{ x: 0, opacity: 1 }}
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-background text-foreground",
        className
      )}
      exit={reduce ? { opacity: 0 } : { x: "100%" }}
      initial={reduce ? { opacity: 0 } : { x: "100%" }}
      role="dialog"
      transition={{ type: "tween", ease: [0.32, 0.72, 0, 1], duration: 0.32 }}
    >
      <header className="shrink-0 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2">
          <button
            className="flex min-h-11 items-center gap-0.5 justify-self-start rounded-lg px-2 text-primary text-[15px] active:opacity-60"
            onClick={onClose}
            type="button"
          >
            <Icon className="size-5" name="IconChevronLeft" />
            <span className="max-w-[28vw] truncate">{backLabel}</span>
          </button>
          <div className="min-w-0 max-w-[52vw] text-center">
            <h2
              className="truncate font-semibold text-[15px] outline-none"
              id={`${id}-title`}
              ref={heading}
              tabIndex={-1}
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="truncate text-muted-foreground text-xs">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1 justify-self-end">{actions}</div>
        </div>
      </header>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          bodyClassName
        )}
      >
        {children}
      </div>
      {footer ? (
        <footer className="shrink-0 border-t bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          {footer}
        </footer>
      ) : null}
    </motion.div>
  );
}
