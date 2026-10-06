const DAY = 24 * 60 * 60 * 1000;
const WORDS = /\s+/;
const NON_LETTERS = /[^\p{L}\s]/gu;

export function listDate(ms: number, now = Date.now()) {
  const d = new Date(ms);
  if (now - ms < DAY && new Date(now).getDate() === d.getDate()) {
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (d.getFullYear() === new Date(now).getFullYear()) {
    return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("pt-BR");
}

export const fullDate = (ms: number) =>
  new Date(ms).toLocaleString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function initials(name: string) {
  const parts = name.replace(NON_LETTERS, " ").trim().split(WORDS);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export function quote(text: string, from: string, ms: number) {
  const lines = text.split("\n").map((l) => `> ${l}`);
  return `\n\nEm ${fullDate(ms)}, ${from} escreveu:\n${lines.join("\n")}`;
}

export const withPrefix = (prefix: string, subject: string) =>
  subject.toLowerCase().startsWith(prefix.toLowerCase())
    ? subject
    : `${prefix} ${subject}`;

/** Plain text of a message for quoting (HTML-only e-mails included). */
export function plainText(text: string, html: string | null) {
  if (text.trim() || !html) {
    return text;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.innerText || doc.body.textContent || "").trim();
}
