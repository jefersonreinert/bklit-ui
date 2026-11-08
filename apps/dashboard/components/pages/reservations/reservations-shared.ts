import type { Source, Status } from "@/lib/reservations/engine";

/** Labels and colours shared by the reservation screens. */

export const VENUE_NAMES: Record<string, string> = {
  "the-brew": "The Brew",
  "ribs-house": "Ribs House",
  vinomad: "Vinomad",
  main: "Casa Brasa",
};

export const VENUE_KEYS = ["the-brew", "ribs-house", "vinomad", "main"];

export const SOURCE_META: Record<Source, { label: string; dot: string }> = {
  website: { label: "Site", dot: "bg-sky-500" },
  instagram: { label: "Instagram", dot: "bg-pink-500" },
  facebook: { label: "Facebook", dot: "bg-indigo-500" },
  whatsapp: { label: "WhatsApp", dot: "bg-emerald-500" },
  google: { label: "Google", dot: "bg-amber-500" },
  phone: { label: "Telefone", dot: "bg-slate-500" },
  walkin: { label: "Walk-in", dot: "bg-teal-500" },
  manual: { label: "Manual", dot: "bg-zinc-400" },
};

export const STATUS_META: Record<Status, { label: string; tone: string }> = {
  pending: {
    label: "Pendente",
    tone: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
  confirmed: {
    label: "Confirmada",
    tone: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  },
  seated: {
    label: "Sentada",
    tone: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  },
  completed: { label: "Concluída", tone: "bg-muted text-muted-foreground" },
  cancelled: {
    label: "Cancelada",
    tone: "bg-muted text-muted-foreground line-through",
  },
  no_show: {
    label: "No-show",
    tone: "bg-destructive/15 text-destructive",
  },
};

export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Local date YYYY-MM-DD. */
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftDay(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

export function prettyDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const CONVEX_PREFIX = /^.*ConvexError: /;

/** Readable message of a failed mutation. */
export function errText(err: unknown, fallback = "Falhou.") {
  return err instanceof Error
    ? err.message.replace(CONVEX_PREFIX, "")
    : fallback;
}
