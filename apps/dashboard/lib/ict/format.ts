const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDateTime = (ms: number | null | undefined) =>
  ms ? dateTime.format(ms) : "—";

/** "há 5 min", "há 3 h", "há 2 dias". */
export function timeAgo(ms: number | null | undefined, now = Date.now()) {
  if (!ms) {
    return "nunca";
  }
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) {
    return "agora";
  }
  const m = Math.round(s / 60);
  if (m < 60) {
    return `há ${m} min`;
  }
  const h = Math.round(m / 60);
  if (h < 48) {
    return `há ${h} h`;
  }
  return `há ${Math.round(h / 24)} dias`;
}

export const PERIODS = [
  { value: "all", label: "Todo o período", ms: 0 },
  { value: "24h", label: "Últimas 24 h", ms: 86_400_000 },
  { value: "7d", label: "Últimos 7 dias", ms: 7 * 86_400_000 },
  { value: "30d", label: "Últimos 30 dias", ms: 30 * 86_400_000 },
  { value: "365d", label: "Último ano", ms: 365 * 86_400_000 },
] as const;
