"use client";

import { ConvexError } from "convex/values";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared bits of the trading screen (order ticket and positions). */

/**
 * Whether the EA is syncing every second right now. Commands sent while it
 * is still on the slow interval could expire before it picks them up, so
 * every button that creates one waits for this.
 */
const LinkContext = createContext(false);
export const LinkProvider = LinkContext.Provider;
export const useLinked = () => useContext(LinkContext);

/** The message of a ConvexError (the server's own text), else a fallback. */
export function errorText(e: unknown) {
  if (e instanceof ConvexError) {
    return String(e.data);
  }
  return e instanceof Error && e.message
    ? "Não foi possível enviar. Tente de novo."
    : "Falhou.";
}

/** A price with the symbol's digits. */
export const priceText = (n: number, digits: number) =>
  n > 0 ? n.toFixed(Math.max(0, digits)) : "—";

export const lotText = (n: number) =>
  n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** State kept per device (last risk, SL mode, partials…). */
export function useLocal<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? ({ ...initial, ...JSON.parse(raw) } as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode: the ticket still works, it just isn't remembered
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Labelled number input that keeps what is typed (commas allowed). */
export function NumberField({
  label,
  value,
  onChange,
  step,
  suffix,
  className,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  suffix?: string;
  className?: string;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  useEffect(() => {
    // Follow outside changes without fighting what is being typed
    setText((t) =>
      Number(t.replace(",", ".")) === value ? t : String(value || "")
    );
  }, [value]);
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center rounded-md border focus-within:ring-2 focus-within:ring-ring/50">
        <input
          className="h-9 w-full min-w-0 bg-transparent px-2.5 text-sm tabular-nums outline-none"
          inputMode="decimal"
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(",", "."));
            onChange(Number.isFinite(n) ? n : 0);
          }}
          step={step}
          value={text}
        />
        {suffix ? (
          <span className="shrink-0 pr-2.5 text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** Small toggle chips (risk %, R:R, close %). */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
  format = (v) => String(v),
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  format?: (v: T) => string;
}) {
  return (
    <fieldset aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          aria-pressed={o === value}
          className={cn(
            "rounded-md border px-2 py-1 text-xs tabular-nums",
            o === value && "border-foreground bg-muted font-semibold"
          )}
          key={String(o)}
          onClick={() => onChange(o)}
          type="button"
        >
          {format(o)}
        </button>
      ))}
    </fieldset>
  );
}

/** Two-tap button for actions on the live account (no dialogs). */
export function ConfirmButton({
  children,
  armedLabel,
  onConfirm,
  disabled,
  variant = "outline",
  size = "sm",
  className,
}: {
  children: ReactNode;
  armedLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "destructive";
  size?: "sm" | "xs" | "default";
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) {
      return;
    }
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <Button
      className={className}
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      size={size}
      variant={armed ? "destructive" : variant}
    >
      {armed ? armedLabel : children}
    </Button>
  );
}

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "À espera do EA", className: "text-muted-foreground" },
  sent: { label: "No MT5…", className: "text-muted-foreground" },
  done: { label: "Executada", className: "text-[var(--up)]" },
  error: { label: "Recusada", className: "text-[var(--down)]" },
  expired: { label: "Expirou", className: "text-[var(--down)]" },
  cancelled: { label: "Cancelada", className: "text-muted-foreground" },
};

export function StatusText({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, className: "" };
  return <span className={cn("text-xs", s.className)}>{s.label}</span>;
}
