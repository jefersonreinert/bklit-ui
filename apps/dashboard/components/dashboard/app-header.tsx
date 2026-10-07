"use client";

import { Icon } from "@/lib/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TODAY } from "@/lib/data";
import { type NavItem, navItems, normalizePath } from "@/lib/nav";
import { usePreferences } from "@/lib/preferences";
import { AnthropicWordmark } from "./anthropic-wordmark";
import { SidebarBrand, SidebarFooterCard, SidebarNav } from "./app-sidebar";
import { BrandLogo } from "./brand-logo";
import { ProfileAvatar } from "./profile-avatar";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader() {
  const pathname = normalizePath(usePathname());
  const current =
    navItems.find((i) => i.href === pathname) ?? (navItems[0] as NavItem);
  const [open, setOpen] = useState(false);
  const prefs = usePreferences();

  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-h)] items-center gap-3 border-b bg-background/30 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:px-6 print:hidden">
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetTrigger
          render={
            <Button
              aria-label="Abrir menu"
              className="lg:hidden"
              size="icon"
              variant="ghost"
            />
          }
        >
          <BrandLogo className="size-8" />
        </SheetTrigger>
        <SheetContent
          className="acrylic w-72! gap-6 bg-sidebar p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          side="left"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarBrand />
          <SidebarNav onNavigate={() => setOpen(false)} />
          <div className="mt-auto">
            <SidebarFooterCard />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate font-semibold text-base leading-tight">
          {current.href === "/ia" ? (
            <>
              <span className="sr-only">{current.label}</span>
              <AnthropicWordmark className="h-3.5 md:h-4" />
            </>
          ) : (
            current.label
          )}
        </h1>
        <p className="hidden truncate text-muted-foreground text-xs sm:block">
          {current.description} ·{" "}
          {TODAY.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      <ThemeToggle />
      <Button
        aria-label="Notificações"
        className="relative"
        size="icon"
        variant="ghost"
      >
        <Icon className="size-4" name="IconBell" />
        <span className="absolute top-2 right-2 size-2 rounded-full bg-foreground" />
      </Button>
      <Link
        aria-label={`Configurações de ${prefs.name}`}
        className="hidden rounded-full transition-opacity hover:opacity-80 sm:flex"
        href="/configuracoes"
        title={`${prefs.name} · Configurações`}
      >
        <ProfileAvatar fallbackClassName="text-xs" />
      </Link>
    </header>
  );
}
