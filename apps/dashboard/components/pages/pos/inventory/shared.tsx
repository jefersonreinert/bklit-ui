"use client";

import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { appLocale } from "@/lib/i18n/locale";
import { describeQty } from "@/lib/inventory/units";
import { money, usePos, usePosQuery } from "@/lib/pos/store";
import { cn } from "@/lib/utils";

/** Shared pieces of the inventory screens (catalog, counts, ledger). */

export type InvOverview = FunctionReturnType<typeof api.inv.overview>;
export type InvItem = InvOverview["items"][number];
export type InvArea = InvOverview["areas"][number];

export const CARD = "rounded-2xl border bg-card p-4";
export const SELECT = "h-10 w-full rounded-lg border bg-background px-2 text-sm";

export function useOverview(company: string) {
  return usePosQuery(api.inv.overview, { company });
}

export function useMoney() {
  const { settings } = usePos();
  return (v: number) => money(v, settings.currency);
}

export const num = (v: number, digits = 2) =>
  new Intl.NumberFormat(appLocale(), { maximumFractionDigits: digits }).format(v);

export const qtyText = (qty: number, item: InvItem) => describeQty(qty, item);

export const dateText = (t: number) =>
  new Date(t).toLocaleString(appLocale(), { dateStyle: "short", timeStyle: "short" });

/** Text input for a number; empty = undefined. Keeps what is being typed. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => {
    const parsed = Number(text.replace(",", "."));
    if (value === undefined ? text !== "" : parsed !== value) {
      setText(value === undefined ? "" : String(value));
    }
    // Only follow outside changes, not each keystroke
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  }, [value]);
  return (
    <Input
      autoFocus={autoFocus}
      className={cn("tabular-nums", className)}
      inputMode="decimal"
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = Number(t.replace(",", "."));
        onChange(t.trim() === "" || !Number.isFinite(n) ? undefined : n);
      }}
      placeholder={placeholder}
      value={text}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-medium text-sm">{label}</span>
      {children}
      {hint ? <span className="block text-muted-foreground text-xs">{hint}</span> : null}
    </label>
  );
}

export function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Menos"
        className="flex size-11 items-center justify-center rounded-full border bg-background text-xl disabled:opacity-30"
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        type="button"
      >
        −
      </button>
      <NumberInput
        className="h-11 w-20 text-center text-lg"
        onChange={(v) => onChange(Math.max(0, v ?? 0))}
        value={value}
      />
      <button
        aria-label="Mais"
        className="flex size-11 items-center justify-center rounded-full border bg-background text-xl"
        onClick={() => onChange(value + 1)}
        type="button"
      >
        +
      </button>
    </div>
  );
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm",
        active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** Small tag on an item row (no bottle profile, below minimum…). */
export function Tag({ tone, children }: { tone?: "warn" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px]",
        tone === "warn"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}
