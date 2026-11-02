"use client";

import { useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  isBuiltin,
  LANGUAGES,
  languageName,
  setLocale,
  useLocale,
  useT,
  useTranslating,
} from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Sidebar language picker: reviewed languages first, any other by AI. */
export function LanguagePicker({ onPick }: { onPick?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const translating = useTranslating();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = useMemo(
    () =>
      LANGUAGES.map((code) => {
        let english: string = code;
        try {
          english =
            new Intl.DisplayNames(["en"], { type: "language" }).of(code) ??
            code;
        } catch {
          // unknown code
        }
        return { code, name: languageName(code), english };
      }),
    []
  );
  const q = query.trim().toLowerCase();
  const shown = q
    ? list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.english.toLowerCase().includes(q) ||
          l.code === q
      )
    : list;
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label={t("Idioma")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground text-sm hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            type="button"
          />
        }
      >
        <Icon className="size-4" name="IconGlobe" />
        <span className="flex-1 truncate text-left">
          {languageName(locale)}
        </span>
        {translating ? (
          <span className="text-xs">{t("traduzindo…")}</span>
        ) : (
          <Icon className="size-4" name="IconChevronDownSmall" />
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-2xl p-2">
        <input
          aria-label={t("Buscar idioma")}
          className="mb-2 h-9 w-full rounded-lg border bg-transparent px-3 text-sm outline-none"
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Buscar idioma")}
          value={query}
        />
        <div className="max-h-72 overflow-y-auto">
          {shown.map((l) => (
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                l.code === locale && "bg-muted font-medium"
              )}
              key={l.code}
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
                onPick?.();
              }}
              type="button"
            >
              <span className="flex-1 truncate">{l.name}</span>
              <span className="text-muted-foreground text-xs">
                {isBuiltin(l.code) ? l.english : `${l.english} · IA`}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
