"use client";

import { motion, useAnimationControls } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Dock, DockIcon } from "@/components/ui/dock";
import { moveDock, setPageIcon, toggleDock, useHome } from "@/lib/home";
import { Icon } from "@/lib/icons";
import { navItemFor } from "@/lib/nav";
import { loadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { AppGlyph } from "./home-widgets";

/**
 * The home screen dock: the user's pages as app icons that grow under the
 * pointer (like macOS), bounce when opened and, while customizing, open an
 * editor to upload a photo or logo as the page's icon.
 */

/** Magnify only where there is a real pointer (not on touch screens). */
function useCanHover() {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setHover(mq.matches);
    const on = () => setHover(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return hover;
}

/** One page in the dock: opens it (with a bounce) or, editing, its icon. */
function DockApp({
  href,
  editing,
  onEdit,
}: {
  href: string;
  editing: boolean;
  onEdit: (href: string) => void;
}) {
  const bounce = useAnimationControls();
  const item = navItemFor(href);
  if (!item) {
    return null;
  }
  const glyph = (
    <AppGlyph className="size-full shadow-black/40 shadow-xl" href={href} />
  );
  return (
    <>
      {editing ? null : (
        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/70 px-2.5 py-1 text-white text-xs opacity-0 ring-1 ring-white/15 backdrop-blur-xl transition-opacity group-hover:opacity-100">
          {item.label}
        </span>
      )}
      <motion.div
        animate={bounce}
        className="size-full"
        whileTap={{ scale: 0.9 }}
      >
        {editing ? (
          <motion.button
            animate={{ rotate: [-2.5, 2.5, -2.5] }}
            aria-label={`Editar ícone: ${item.label}`}
            className="relative block size-full"
            onClick={() => onEdit(href)}
            transition={{
              duration: 0.3,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
            type="button"
          >
            {glyph}
            <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-white text-black shadow-lg">
              <Icon className="size-3" name="IconPencil" />
            </span>
          </motion.button>
        ) : (
          <Link
            aria-label={item.label}
            className="block size-full"
            href={href}
            onClick={() => {
              bounce.start({
                y: [0, -16, 0, -5, 0],
                transition: { duration: 0.6, ease: "easeOut" },
              });
            }}
          >
            {glyph}
          </Link>
        )}
      </motion.div>
    </>
  );
}

export function HomeDock({
  editing,
  onApps,
  onEdit,
  onAdd,
}: {
  editing: boolean;
  onApps: () => void;
  onEdit: (href: string) => void;
  onAdd: () => void;
}) {
  const { dock } = useHome();
  const canHover = useCanHover();
  const size = canHover ? 48 : 42;
  // No magnification while editing or on touch screens
  const magnification = canHover && !editing ? 76 : size;
  const icon = "group relative rounded-none";

  return (
    <nav
      aria-label="Dock"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className="pointer-events-auto max-w-full"
        initial={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <Dock
          className={cn(
            "mt-0 gap-1.5 rounded-[24px] border-white/20 bg-white/10 px-2 pb-2 backdrop-blur-2xl backdrop-saturate-150 sm:gap-2",
            canHover ? "h-[66px]" : "h-[60px]"
          )}
          direction="bottom"
          distance={150}
          magnification={magnification}
        >
          {dock.map((h) => (
            <DockIcon className={icon} key={h} size={size}>
              <DockApp editing={editing} href={h} onEdit={onEdit} />
            </DockIcon>
          ))}
          <span className="mx-0.5 mb-1 h-9 w-px shrink-0 self-end bg-white/25" />
          <DockIcon className={icon} size={size}>
            {editing ? (
              <motion.button
                aria-label="Adicionar ao dock"
                className="flex size-full items-center justify-center rounded-[22%] border-2 border-white/40 border-dashed text-white hover:bg-white/10"
                onClick={onAdd}
                type="button"
                whileTap={{ scale: 0.9 }}
              >
                <Icon className="size-6" name="IconPlusSmall" />
              </motion.button>
            ) : (
              <motion.button
                aria-label="Todos os apps"
                className="flex size-full items-center justify-center rounded-[22%] bg-white/15 text-white ring-1 ring-white/20 hover:bg-white/25"
                onClick={onApps}
                type="button"
                whileTap={{ scale: 0.9 }}
              >
                <Icon className="size-[45%]" name="IconApps" />
              </motion.button>
            )}
          </DockIcon>
        </Dock>
      </motion.div>
    </nav>
  );
}

/* ------------------------------ icon editor ------------------------------- */

const ICON_PX = 160;

/** Square crop of a photo or logo, small enough to sync (data URL). */
async function iconFromFile(file: File) {
  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const g = canvas.getContext("2d");
    if (!g) {
      throw new Error("Não consegui ler a imagem.");
    }
    const scale = Math.max(ICON_PX / img.width, ICON_PX / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, (ICON_PX - w) / 2, (ICON_PX - h) / 2, w, h);
    // WebP keeps logos transparent and photos small; PNG where unsupported
    const webp = canvas.toDataURL("image/webp", 0.9);
    return webp.startsWith("data:image/webp")
      ? webp
      : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function IconEditor({
  href,
  onDone,
}: {
  href: string;
  onDone: () => void;
}) {
  const { icons, dock } = useHome();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const item = navItemFor(href);
  if (!item) {
    return null;
  }
  const i = dock.indexOf(href);

  const pick = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      setPageIcon(href, await iconFromFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Imagem inválida.");
    } finally {
      setBusy(false);
      if (input.current) {
        input.current.value = "";
      }
    }
  };

  const row =
    "flex h-11 items-center justify-center gap-2 rounded-2xl bg-white/10 text-sm ring-1 ring-white/15 hover:bg-white/15 disabled:opacity-40";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <motion.div
          animate={{ scale: 1, rotate: 0 }}
          className="size-24 shrink-0"
          initial={{ scale: 0.8, rotate: -6 }}
          key={icons[href] ?? "default"}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
        >
          <AppGlyph className="size-full" href={href} />
        </motion.div>
        <div className="min-w-0">
          <p className="font-semibold text-lg">{item.label}</p>
          <p className="text-sm text-white/60">{item.description}</p>
        </div>
      </div>

      <input
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
        ref={input}
        type="file"
      />
      <button
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white font-medium text-black text-sm transition active:scale-[0.98] disabled:opacity-60"
        disabled={busy}
        onClick={() => input.current?.click()}
        type="button"
      >
        <Icon className="size-4" name="IconCloudUpload" />
        {busy ? "Preparando…" : "Carregar foto ou logo"}
      </button>
      <p className="text-white/50 text-xs">
        A imagem é cortada em quadrado e fica salva para todos os seus
        aparelhos. Logos com fundo transparente ficam ótimos.
      </p>
      {error ? <p className="text-rose-300 text-sm">{error}</p> : null}

      {icons[href] ? (
        <button
          className={row}
          onClick={() => setPageIcon(href, null)}
          type="button"
        >
          <Icon className="size-4" name="IconArrowLeft" />
          Voltar ao ícone padrão
        </button>
      ) : null}

      {i >= 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            className={row}
            disabled={i === 0}
            onClick={() => moveDock(href, -1)}
            type="button"
          >
            <Icon className="size-4" name="IconChevronLeft" />
            Mover para a esquerda
          </button>
          <button
            className={row}
            disabled={i === dock.length - 1}
            onClick={() => moveDock(href, 1)}
            type="button"
          >
            Mover para a direita
            <Icon className="size-4" name="IconChevronRight" />
          </button>
        </div>
      ) : null}

      <button
        className={cn(row, "text-rose-200")}
        onClick={() => {
          toggleDock(href);
          onDone();
        }}
        type="button"
      >
        <Icon className="size-4" name="IconTrashCan" />
        {i >= 0 ? "Tirar do dock" : "Pôr no dock"}
      </button>
    </div>
  );
}
