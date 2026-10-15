"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SidebarBrand,
  SidebarFooterCard,
  SidebarNav,
  SidebarTools,
} from "./app-sidebar";
import { BrandLogo } from "./brand-logo";
import { FloatingButton } from "./floating-button";

/**
 * Phones and tablets: the menu is a floating logo button (drag it anywhere)
 * instead of a header bar, so pages use the whole screen. Tapping it opens
 * the sidebar with the pages, themes and notifications.
 */
export function FloatingMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <FloatingButton
        expanded={open}
        fallback={{ fx: 0, fy: 0 }}
        label="Abrir menu"
        onTap={() => setOpen(true)}
        size={44}
        storageKey="cb:fab:menu"
      >
        <BrandLogo className="pointer-events-none size-8 rounded-full" />
      </FloatingButton>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="acrylic w-72! gap-5 bg-sidebar p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          side="left"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">
            Páginas, tema e notificações
          </SheetDescription>
          <SidebarBrand />
          <SidebarTools onNavigate={() => setOpen(false)} />
          <SidebarNav onNavigate={() => setOpen(false)} />
          <div className="shrink-0">
            <SidebarFooterCard />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
