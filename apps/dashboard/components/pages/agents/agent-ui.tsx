"use client";

import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Small building blocks shared by the agent editor sections. */

export function Section({
  title,
  description,
  icon,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon: IconName;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 md:p-5">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description ? (
            <p className="text-muted-foreground text-xs">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="font-medium text-xs" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 flex w-full min-w-0 flex-wrap gap-1 rounded-xl border-0 bg-muted p-1"
    >
      {options.map((o) => (
        <button
          aria-pressed={value === o.id}
          className={cn(
            "flex-auto whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition-colors",
            value === o.id
              ? "bg-background font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          key={o.id}
          onClick={() => onChange(o.id)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

export const inputClass =
  "h-9 w-full min-w-0 rounded-lg border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

export const textareaClass =
  "field-sizing-content min-h-24 w-full min-w-0 resize-none rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

/** Lines of a textarea ⇄ string[] (empty lines dropped). */
export const toLines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
