"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { documentStats, RESTAURANT_NAME } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { navItemFor, navItems, normalizePath } from "@/lib/nav";
import { usePreferences } from "@/lib/preferences";
import { useSyncStatus } from "@/lib/sync/convex-client";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import { LanguagePicker } from "./language-picker";
import { ProfileAvatar } from "./profile-avatar";
import { ThemeToggle } from "./theme-toggle";

export function SidebarBrand() {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-2">
      <BrandLogo className="size-9" />
      <div className="flex flex-col leading-tight">
        <span className="font-semibold">{RESTAURANT_NAME}</span>
        <span className="text-muted-foreground text-xs">
          {t("Gestão do restaurante")}
        </span>
      </div>
    </div>
  );
}

/** Theme, notifications and profile (they used to be in the top bar). */
export function SidebarTools({ onNavigate }: { onNavigate?: () => void }) {
  const prefs = usePreferences();
  const t = useT();
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle className="flex-1 justify-between [&>button]:flex-1 [&>button]:justify-center [&_span]:hidden" />
        <button
          aria-label={t("Notificações")}
          className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          type="button"
        >
          <Icon className="size-4" name="IconBell" />
          <span className="absolute top-2 right-2 size-2 rounded-full bg-foreground" />
        </button>
        <Link
          aria-label={`Configurações de ${prefs.name}`}
          className="flex shrink-0 rounded-full transition-opacity hover:opacity-80"
          href="/configuracoes"
          onClick={onNavigate}
          title={`${prefs.name} · Configurações`}
        >
          <ProfileAvatar fallbackClassName="text-xs" />
        </Link>
      </div>
      <LanguagePicker onPick={onNavigate} />
    </div>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = normalizePath(usePathname());
  const t = useT();

  return (
    <nav
      aria-label={t("Navegação principal")}
      className="-mx-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2"
    >
      <span className="px-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {t("Menu")}
      </span>
      {navItems.map((item) => {
        const active = navItemFor(pathname)?.href === item.href;
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
            <span className="flex-1">{t(item.label)}</span>
            {item.href === "/documentos" && documentStats.expired > 0 ? (
              <Badge variant="destructive">{documentStats.expired}</Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

const SYNC_LABEL = {
  synced: "Sincronizado (Convex)",
  connecting: "Conectando ao Convex…",
  locked: "Sincronização bloqueada: digite o código de acesso",
} as const;

/** Whether this device is syncing with the central database. */
function SyncBadge() {
  const status = useSyncStatus();
  const t = useT();
  if (status === "off") {
    return null;
  }
  return (
    <p className="mt-2 flex items-center gap-1.5 border-t pt-2 text-muted-foreground">
      <Icon
        className={cn("size-3.5", status === "synced" && "text-success")}
        name={status === "synced" ? "IconCloudCheck" : "IconCloud"}
      />
      {t(SYNC_LABEL[status])}
    </p>
  );
}

export function SidebarFooterCard() {
  const t = useT();
  return (
    <div className="rounded-xl border bg-card p-3 text-xs">
      <div className="mb-1 flex items-center gap-2 font-medium text-sm">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        {t("Aberto agora")}
      </div>
      <p className="text-muted-foreground">
        {t("Serviço do jantar")} · 18h – 23h30
      </p>
      <SyncBadge />
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="acrylic sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 lg:flex print:hidden">
      <SidebarBrand />
      <SidebarTools />
      <SidebarNav />
      <div className="shrink-0">
        <SidebarFooterCard />
      </div>
    </aside>
  );
}
