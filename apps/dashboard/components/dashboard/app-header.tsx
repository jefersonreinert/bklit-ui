"use client";

import { Icon } from "@bklitui/icons";
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
import { SidebarBrand, SidebarFooterCard, SidebarNav } from "./app-sidebar";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader() {
  const pathname = normalizePath(usePathname());
  const current =
    navItems.find((i) => i.href === pathname) ?? (navItems[0] as NavItem);
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/30 px-4 backdrop-blur-xl md:px-6">
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
          <Icon className="size-5" name="IconSidebar" />
        </SheetTrigger>
        <SheetContent
          className="acrylic w-72! gap-6 bg-sidebar p-4"
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
          {current.label}
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
      <div className="hidden size-8 items-center justify-center rounded-full bg-muted font-medium text-xs sm:flex">
        GR
      </div>
    </header>
  );
}
