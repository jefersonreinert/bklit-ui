"use client";

import { Icon } from "@/lib/icons";
import { useEffect, useState } from "react";

const DISMISS_KEY = "casa-brasa-install-hint";
const IOS = /iPhone|iPad|iPod/;

/** True when opened from the Home Screen (no Safari toolbars). */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Safari always shows its address bar on web pages; only the Home Screen
 * app hides it. On iPhone Safari this explains how to install.
 */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // ignore
    }
    setShow(IOS.test(navigator.userAgent) && !isStandalone() && !dismissed);
  }, []);

  if (!show) {
    return null;
  }
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };
  return (
    <div className="flex items-start gap-3 border-b bg-card px-4 py-3 text-sm print:hidden">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
        <Icon className="size-4" name="IconArrowUpRight" />
      </span>
      <p className="min-w-0 flex-1 text-muted-foreground">
        <b className="text-foreground">Instale o app</b> para abrir em tela
        cheia, sem a barra do Safari: toque em{" "}
        <b className="text-foreground">Compartilhar</b> (o quadrado com a seta)
        e depois em{" "}
        <b className="text-foreground">Adicionar à Tela de Início</b>.
      </p>
      <button
        aria-label="Fechar aviso"
        className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        onClick={close}
        type="button"
      >
        <Icon className="size-4" name="IconCrossSmall" />
      </button>
    </div>
  );
}
