"use client";

import { type ReactNode, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SOMMELIER_LANGS } from "@/lib/sommelier/prompt";
import { BASE_PATH } from "@/lib/use-connectors";
import { cn } from "@/lib/utils";

/**
 * Language picker of the sommelier page with round flags (the
 * circle-flags artwork, served from /flags), in the style of
 * shadcn-country-dropdown.
 */

export function CircleFlag({ country, size = 20 }: { country: string; size?: number }) {
  return (
    // biome-ignore lint/performance/noImgElement: tiny static SVG
    <img
      alt=""
      className="shrink-0 rounded-full"
      height={size}
      src={`${BASE_PATH}/flags/${country}.svg`}
      width={size}
    />
  );
}

export function LanguagePicker({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Page settings shown under the languages (theme, modes…). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = SOMMELIER_LANGS.find((l) => l.code === value) ?? { code: "en", country: "gb" };
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label="Language"
        className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card pr-2.5 pl-1.5 text-foreground text-sm outline-none hover:bg-card/80 focus-visible:ring-2 focus-visible:ring-(--gold)/50"
      >
        <CircleFlag country={current.country} size={22} />
        <span className="font-medium text-xs uppercase tracking-wide">{current.code}</span>
        <svg
          aria-hidden="true"
          className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-60 gap-0 bg-background p-1 [--gold:#9a6f28] dark:[--gold:#e8c48a]"
      >
        {SOMMELIER_LANGS.map((l) => (
          <button
            className={cn(
              "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent",
              l.code === value && "bg-accent/60"
            )}
            key={l.code}
            onClick={() => {
              onChange(l.code);
              setOpen(false);
            }}
            type="button"
          >
            <CircleFlag country={l.country} />
            <span className="flex-1">{l.label}</span>
            {l.code === value ? (
              <svg
                aria-hidden="true"
                className="size-4 text-(--gold)"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : null}
          </button>
        ))}
        {children ? <div className="mt-1 space-y-2 border-border border-t px-2 pt-2.5 pb-1.5">{children}</div> : null}
      </PopoverContent>
    </Popover>
  );
}
