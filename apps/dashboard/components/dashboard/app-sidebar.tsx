"use client";

import { Icon } from "@/lib/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { documentStats, RESTAURANT_NAME } from "@/lib/data";
import { navItems, normalizePath } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";

export function SidebarBrand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <BrandLogo className="size-9" />
      <div className="flex flex-col leading-tight">
        <span className="font-semibold">{RESTAURANT_NAME}</span>
        <span className="text-muted-foreground text-xs">
          Gestão do restaurante
        </span>
      </div>
    </div>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = normalizePath(usePathname());

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1">
      <span className="px-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        Menu
      </span>
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            )}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <Icon
              className={cn("size-4", active && "text-brand")}
              name={item.icon}
            />
            <span className="flex-1">{item.label}</span>
            {item.href === "/documentos" && documentStats.expired > 0 ? (
              <Badge variant="destructive">{documentStats.expired}</Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarFooterCard() {
  return (
    <div className="rounded-xl border bg-card p-3 text-xs">
      <div className="mb-1 flex items-center gap-2 font-medium text-sm">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        Aberto agora
      </div>
      <p className="text-muted-foreground">Serviço do jantar · 18h – 23h30</p>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="acrylic sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 lg:flex print:hidden">
      <SidebarBrand />
      <SidebarNav />
      <div className="mt-auto">
        <SidebarFooterCard />
      </div>
    </aside>
  );
}
