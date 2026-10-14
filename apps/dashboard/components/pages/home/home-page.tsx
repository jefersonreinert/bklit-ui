"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { BrandLogo } from "@/components/dashboard/brand-logo";
import { dayGreeting } from "@/components/pages/overview-sections";
import {
  addWidget,
  type HomeWidget,
  moveWidget,
  removeWidget,
  resizeWidget,
  SIZE_CLASS,
  SIZE_LABEL,
  toggleDock,
  useHome,
  WIDGET_CATALOG,
  type WidgetInfo,
  widgetInfo,
} from "@/lib/home";
import { Icon, type IconName } from "@/lib/icons";
import { navItems } from "@/lib/nav";
import { firstName, usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { WallpaperLayer, WallpaperPanel } from "./home-wallpaper";
import { AppIcon, useNow, WidgetView } from "./home-widgets";

/**
 * Home screen (/): the app opens here. A photo or video wallpaper, the
 * time, and widgets from any page, arranged by the user. The panel
 * (sidebar, header) is one tap away.
 */

type Panel = "wallpaper" | "gallery" | "apps" | null;

const fullDate = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const PAGES = navItems.filter((n) => n.href !== "/");

function GlassButton({
  icon,
  label,
  onClick,
  active,
  showLabel,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  showLabel?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex h-10 items-center gap-2 rounded-full px-3 text-sm ring-1 backdrop-blur-xl transition active:scale-95",
        active
          ? "bg-white text-black ring-white"
          : "bg-black/25 text-white ring-white/15 hover:bg-black/40"
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="size-4" name={icon} />
      {showLabel ? <span className="hidden sm:inline">{label}</span> : null}
    </button>
  );
}

/** Centered panel over the home screen (not a side sheet). */
function Overlay({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        animate={{ opacity: 1, y: 0, scale: 1 }}
        aria-label={title}
        aria-modal="true"
        className={cn(
          "flex max-h-[min(88dvh,820px)] w-full flex-col overflow-hidden rounded-[32px] bg-neutral-900/80 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-2xl",
          wide ? "max-w-3xl" : "max-w-md"
        )}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
          <button
            aria-label="Fechar"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            onClick={onClose}
            type="button"
          >
            <Icon className="size-5" name="IconCrossSmall" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}

/* --------------------------------- gallery -------------------------------- */

const GROUPS: WidgetInfo["group"][] = [
  "Dia a dia",
  "Restaurante",
  "Dashboard",
  "Apps",
];

function GalleryItem({ info, onAdd }: { info: WidgetInfo; onAdd: () => void }) {
  return (
    <button
      className="group flex items-start gap-3 rounded-2xl bg-white/5 p-3 text-left ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.99]"
      onClick={onAdd}
      type="button"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#d97757] to-[#a8492b] shadow-lg">
        <Icon className="size-5" name={info.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-sm">{info.name}</span>
        <span className="block text-white/55 text-xs">{info.description}</span>
      </span>
      <Icon
        className="mt-3 size-5 shrink-0 text-white/40 group-hover:text-white"
        name="IconPlusSmall"
      />
    </button>
  );
}

function Gallery({ onDone }: { onDone: () => void }) {
  const [picking, setPicking] = useState(false);
  const { dock } = useHome();

  if (picking) {
    return (
      <div className="flex flex-col gap-3">
        <button
          className="flex items-center gap-1 self-start text-sm text-white/70 hover:text-white"
          onClick={() => setPicking(false)}
          type="button"
        >
          <Icon className="size-4" name="IconChevronLeft" />
          Voltar
        </button>
        <p className="text-sm text-white/70">
          Escolha a página que vai aparecer inteira dentro do widget.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAGES.map((p) => (
            <button
              className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 text-left ring-1 ring-white/10 hover:bg-white/10"
              key={p.href}
              onClick={() => {
                addWidget("pagina", p.href);
                onDone();
              }}
              type="button"
            >
              <Icon className="size-5 shrink-0" name={p.icon} />
              <span className="min-w-0">
                <span className="block truncate font-medium text-sm">
                  {p.label}
                </span>
                <span className="block truncate text-white/50 text-xs">
                  {p.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((g) => (
        <section className="flex flex-col gap-2" key={g}>
          <h3 className="font-semibold text-white/50 text-xs uppercase tracking-[0.14em]">
            {g}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {WIDGET_CATALOG.filter((w) => w.group === g).map((w) => (
              <GalleryItem
                info={w}
                key={w.type}
                onAdd={() => {
                  if (w.type === "pagina") {
                    setPicking(true);
                    return;
                  }
                  addWidget(w.type);
                  onDone();
                }}
              />
            ))}
          </div>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold text-white/50 text-xs uppercase tracking-[0.14em]">
          Dock
        </h3>
        <p className="text-white/55 text-xs">
          Toque para pôr ou tirar a página da barra de baixo.
        </p>
        <div className="flex flex-wrap gap-2">
          {PAGES.map((p) => {
            const on = dock.includes(p.href);
            return (
              <button
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 transition",
                  on
                    ? "bg-white text-black ring-white"
                    : "bg-white/5 text-white/80 ring-white/15 hover:bg-white/10"
                )}
                key={p.href}
                onClick={() => toggleDock(p.href)}
                type="button"
              >
                <Icon className="size-3.5" name={p.icon} />
                {p.label}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* --------------------------------- widgets -------------------------------- */

function EditBar({
  widget,
  first,
  last,
}: {
  widget: HomeWidget;
  first: boolean;
  last: boolean;
}) {
  const info = widgetInfo(widget.type);
  const button =
    "flex size-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30";
  return (
    <div className="absolute inset-x-2 top-2 z-10 flex items-center justify-between gap-1 rounded-full bg-black/60 p-1 ring-1 ring-white/15 backdrop-blur-xl">
      <div className="flex gap-1">
        <button
          aria-label="Mover para trás"
          className={button}
          disabled={first}
          onClick={() => moveWidget(widget.id, -1)}
          type="button"
        >
          <Icon className="size-4" name="IconArrowLeft" />
        </button>
        <button
          aria-label="Mover para frente"
          className={button}
          disabled={last}
          onClick={() => moveWidget(widget.id, 1)}
          type="button"
        >
          <Icon className="size-4" name="IconArrowRight" />
        </button>
      </div>
      {(info?.sizes.length ?? 0) > 1 ? (
        <button
          className="flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs hover:bg-white/25"
          onClick={() => resizeWidget(widget.id)}
          type="button"
        >
          <Icon className="size-3.5" name="IconExpand" />
          {SIZE_LABEL[widget.size]}
        </button>
      ) : null}
      <button
        aria-label="Remover widget"
        className={cn(button, "bg-rose-500/80 hover:bg-rose-500")}
        onClick={() => removeWidget(widget.id)}
        type="button"
      >
        <Icon className="size-4" name="IconCrossSmall" />
      </button>
    </div>
  );
}

function WidgetGrid({
  editing,
  onAdd,
}: {
  editing: boolean;
  onAdd: () => void;
}) {
  const { widgets } = useHome();
  return (
    <section className="grid grid-flow-row-dense grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <AnimatePresence initial={false}>
        {widgets.map((w, i) => (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className={cn("relative", SIZE_CLASS[w.size])}
            exit={{ opacity: 0, scale: 0.9 }}
            initial={{ opacity: 0, scale: 0.94 }}
            key={w.id}
            layout
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            <div
              className={cn(
                "h-full transition-transform",
                editing && "pointer-events-none scale-[0.97] select-none"
              )}
            >
              <WidgetView widget={w} />
            </div>
            {editing ? (
              <EditBar
                first={i === 0}
                last={i === widgets.length - 1}
                widget={w}
              />
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
      {editing || !widgets.length ? (
        <motion.button
          animate={{ opacity: 1 }}
          className="col-span-2 flex min-h-40 flex-col items-center justify-center gap-2 rounded-[28px] border-2 border-white/25 border-dashed text-white/80 transition hover:border-white/50 hover:bg-white/5 md:col-span-1"
          initial={{ opacity: 0 }}
          layout
          onClick={onAdd}
          type="button"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-white/15">
            <Icon className="size-6" name="IconPlusSmall" />
          </span>
          <span className="font-medium text-sm">Adicionar widget</span>
        </motion.button>
      ) : null}
    </section>
  );
}

/* ---------------------------------- page ---------------------------------- */

function Hero() {
  const now = useNow(5000);
  const profile = usePreferences();
  if (!now) {
    return <div className="h-56" />;
  }
  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center py-10 text-center text-white md:py-16"
      initial={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <p className="font-medium text-sm text-white/75 first-letter:uppercase md:text-base">
        {fullDate.format(now)}
      </p>
      <h1 className="font-extralight text-[clamp(5rem,22vw,11rem)] tabular-nums leading-none tracking-[-0.06em] drop-shadow-[0_4px_40px_rgba(0,0,0,0.35)]">
        {time}
      </h1>
      <p className="mt-2 text-lg text-white/85 md:text-xl">
        {dayGreeting()}, {firstName(profile.name)}
      </p>
    </motion.section>
  );
}

function Dock({ onApps }: { onApps: () => void }) {
  const { dock } = useHome();
  return (
    <nav
      aria-label="Dock"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex max-w-full items-end gap-1 overflow-x-auto rounded-[30px] bg-white/10 p-2 ring-1 ring-white/20 backdrop-blur-2xl backdrop-saturate-150 [scrollbar-width:none]">
        {dock.map((h) => (
          <div className="flex w-11 shrink-0 justify-center sm:w-12" key={h}>
            <AppIcon href={h} showLabel={false} />
          </div>
        ))}
        <span className="mx-1 h-10 w-px shrink-0 self-center bg-white/20" />
        <button
          aria-label="Todos os apps"
          className="flex size-11 shrink-0 items-center justify-center rounded-[22%] bg-white/15 text-white ring-1 ring-white/20 transition hover:bg-white/25 active:scale-95 sm:size-12"
          onClick={onApps}
          type="button"
        >
          <Icon className="size-6" name="IconApps" />
        </button>
      </div>
    </nav>
  );
}

export function HomePage() {
  const [panel, setPanel] = useState<Panel>(null);
  const [editing, setEditing] = useState(false);
  const close = () => setPanel(null);

  return (
    <div className="dark relative min-h-dvh overflow-x-hidden text-white">
      <WallpaperLayer />

      <header className="relative z-30 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
        <Link
          className="flex items-center gap-2 rounded-full bg-black/25 py-1.5 pr-3 pl-1.5 ring-1 ring-white/15 backdrop-blur-xl"
          href="/dashboard"
        >
          <BrandLogo className="size-7" />
          <span className="font-medium text-sm">Abrir painel</span>
        </Link>
        <div className="flex items-center gap-2">
          <GlassButton
            icon="IconWallpaper"
            label="Papel de parede"
            onClick={() => setPanel("wallpaper")}
            showLabel
          />
          <GlassButton
            active={editing}
            icon={editing ? "IconCheckmark1" : "IconPencil"}
            label={editing ? "Concluir" : "Personalizar"}
            onClick={() => setEditing((e) => !e)}
            showLabel
          />
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-4 pb-36 md:px-8">
        <Hero />
        <WidgetGrid editing={editing} onAdd={() => setPanel("gallery")} />
      </main>

      <Dock onApps={() => setPanel("apps")} />

      <AnimatePresence>
        {panel === "wallpaper" ? (
          <Overlay key="wallpaper" onClose={close} title="Papel de parede">
            <WallpaperPanel />
          </Overlay>
        ) : null}
        {panel === "gallery" ? (
          <Overlay key="gallery" onClose={close} title="Adicionar widget" wide>
            <Gallery onDone={close} />
          </Overlay>
        ) : null}
        {panel === "apps" ? (
          <Overlay key="apps" onClose={close} title="Apps" wide>
            <div className="grid grid-cols-4 justify-items-center gap-x-2 gap-y-5 sm:grid-cols-6">
              {PAGES.map((p) => (
                <AppIcon href={p.href} key={p.href} size="lg" />
              ))}
            </div>
          </Overlay>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
