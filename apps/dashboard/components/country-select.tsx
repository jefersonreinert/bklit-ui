"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type Country,
  countries,
  findCountry,
  matchCountry,
  WINE_COUNTRIES,
} from "@/lib/countries";
import { useLocale } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";

/**
 * Country picker with round flags and search (in the style of
 * shadcn-country-dropdown; flags from circle-flags, MIT, in /public/flags).
 * The value is the country's English short name ("France"); names show in
 * the app language. Older values ("USA") are recognised.
 */

export function Flag({ code, size = 20 }: { code: string; size?: number }) {
  return (
    // biome-ignore lint/performance/noImgElement: tiny static SVG
    <img
      alt=""
      className="shrink-0 rounded-full"
      height={size}
      loading="lazy"
      src={`${BASE_PATH}/flags/${code}.svg`}
      width={size}
    />
  );
}

/** Flag of a saved country value (nothing when unknown). */
export function CountryFlag({
  value,
  size = 16,
}: {
  value?: string;
  size?: number;
}) {
  const locale = useLocale();
  const c = findCountry(value, locale);
  return c ? (
    <span className="inline-flex shrink-0" title={c.label}>
      <Flag code={c.code} size={size} />
    </span>
  ) : null;
}

function Row({
  c,
  selected,
  onPick,
}: {
  c: Country;
  selected: boolean;
  onPick: (c: Country) => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
        selected && "bg-muted"
      )}
      onClick={() => onPick(c)}
      type="button"
    >
      <Flag code={c.code} />
      <span className="min-w-0 flex-1 truncate">{c.label}</span>
      {selected ? (
        <Icon className="size-4 shrink-0" name="IconCheckmark1" />
      ) : null}
    </button>
  );
}

export function CountrySelect({
  value,
  onChange,
  id,
  placeholder = "Escolher país",
  wine = false,
  className,
}: {
  /** English short name (or an older spelling). */
  value?: string;
  onChange: (value: string | undefined) => void;
  id?: string;
  placeholder?: string;
  /** Wine countries first. */
  wine?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const all = useMemo(() => countries(locale), [locale]);
  const current = findCountry(value, locale);
  const hits = all.filter((c) => matchCountry(c, query));
  const top =
    wine && !query
      ? WINE_COUNTRIES.map((code) => all.find((c) => c.code === code))
          .filter((c): c is Country => Boolean(c))
          .sort((a, b) => a.label.localeCompare(b.label, locale))
      : [];
  const pick = (c: Country | undefined) => {
    onChange(c?.value);
    setOpen(false);
    setQuery("");
  };
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        className={cn(
          "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-transparent px-3 text-left text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className
        )}
        id={id}
      >
        {current ? <Flag code={current.code} /> : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !(current || value) && "text-muted-foreground"
          )}
        >
          {current?.label ?? value ?? placeholder}
        </span>
        <Icon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          name="IconChevronBottom"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-1 p-1.5">
        <Input
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar país…"
          value={query}
        />
        <div className="max-h-72 overflow-y-auto overscroll-contain">
          {value ? (
            <button
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-muted"
              onClick={() => pick(undefined)}
              type="button"
            >
              <Icon className="size-5" name="IconCrossSmall" />
              Sem país
            </button>
          ) : null}
          {top.length ? (
            <>
              <p className="px-2 pt-1.5 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                Países do vinho
              </p>
              {top.map((c) => (
                <Row
                  c={c}
                  key={`top-${c.code}`}
                  onPick={pick}
                  selected={c.code === current?.code}
                />
              ))}
              <p className="px-2 pt-2.5 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                Todos
              </p>
            </>
          ) : null}
          {hits.map((c) => (
            <Row
              c={c}
              key={c.code}
              onPick={pick}
              selected={c.code === current?.code}
            />
          ))}
          {hits.length ? null : (
            <p className="px-2 py-3 text-center text-muted-foreground text-sm">
              Nenhum país encontrado.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
