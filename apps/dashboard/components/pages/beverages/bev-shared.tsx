"use client";

import { Icon } from "@bklitui/icons";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  type BeverageKind,
  cmvTargets,
  cmvTone,
  kindIcon,
} from "@/lib/beverage-data";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const toneClass = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
} as const;

/** CMV / pour cost value colored against the category benchmark. */
export function CmvValue({
  kind,
  value,
  className,
}: {
  kind: BeverageKind;
  value: number | null;
  className?: string;
}) {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        toneClass[cmvTone(kind, value)],
        className
      )}
      title={`Meta ≤ ${cmvTargets[kind]}%`}
    >
      {formatPercent(value)}
    </span>
  );
}

export function StockBar({
  stock,
  par,
  min,
}: {
  stock: number;
  par: number;
  min: number;
}) {
  if (par <= 0) {
    return (
      <span className="text-muted-foreground text-xs">Produção diária</span>
    );
  }
  const pct = Math.min(100, (stock / par) * 100);
  const low = stock <= min;
  return (
    <div className="flex min-w-24 items-center gap-2">
      <div className="relative h-1.5 w-16 overflow-visible rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            low ? "bg-destructive" : "bg-[var(--chart-1)] dark:bg-foreground"
          )}
          style={{ width: `${pct}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute -top-0.5 h-2.5 w-px bg-foreground/50"
          style={{ left: `${(min / par) * 100}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs tabular-nums",
          low && "font-medium text-destructive"
        )}
      >
        {stock}/{par}
      </span>
    </div>
  );
}

export function StockBadge({ stock, min }: { stock: number; min: number }) {
  if (stock <= 0) {
    return <Badge variant="destructive">Zerado</Badge>;
  }
  if (stock <= min) {
    return <Badge variant="destructive">Repor</Badge>;
  }
  return null;
}

export function SpecGrid({ specs }: { specs: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 text-sm">
      {specs.map(([k, v]) => (
        <div className="rounded-lg bg-muted/60 p-2.5" key={k}>
          <dt className="text-muted-foreground text-xs">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface NumberField {
  key: string;
  label: string;
  value: number;
  step?: number;
  suffix?: string;
}

/** Editable numeric fields (prices, costs, stock) that update on change. */
export function EditFields({
  fields,
  onChange,
}: {
  fields: NumberField[];
  onChange: (key: string, value: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((f) => (
        <div className="flex flex-col gap-1.5" key={f.key}>
          <Label htmlFor={`edit-${f.key}`}>
            {f.label}
            {f.suffix ? (
              <span className="text-muted-foreground"> ({f.suffix})</span>
            ) : null}
          </Label>
          <Input
            id={`edit-${f.key}`}
            inputMode="decimal"
            min={0}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0) {
                onChange(f.key, v);
              }
            }}
            step={f.step ?? 1}
            type="number"
            value={f.value}
          />
        </div>
      ))}
    </div>
  );
}

export function AvailabilityRow({
  available,
  onChange,
}: {
  available: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3">
      <div>
        <p className="font-medium text-sm">Disponível na carta</p>
        <p className="text-muted-foreground text-xs">
          Desative para ocultar do cardápio
        </p>
      </div>
      <Switch checked={available} onCheckedChange={onChange} />
    </div>
  );
}

/** Right-side sheet used by every beverage detail view. */
export function ItemSheet({
  open,
  onClose,
  kind,
  title,
  subtitle,
  badges,
  children,
}: {
  open: boolean;
  onClose: () => void;
  kind: BeverageKind;
  title: string;
  subtitle: string;
  badges?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet
      onOpenChange={(o) => {
        if (!o) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="gap-2 border-b p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Icon className="size-5" name={kindIcon[kind]} />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate">{title}</SheetTitle>
              <SheetDescription className="truncate">
                {subtitle}
              </SheetDescription>
            </div>
          </div>
          {badges ? (
            <div className="flex flex-wrap gap-1.5">{badges}</div>
          ) : null}
        </SheetHeader>
        <div className="flex flex-col gap-5 p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterSelect({
  items,
  value,
  onChange,
  className,
}: {
  items: FilterOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Select
      items={items}
      onValueChange={(v) => onChange(String(v))}
      value={value}
    >
      <SelectTrigger className={cn("w-full sm:w-44", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1">
      <Icon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        name="IconSearchMenu"
      />
      <Input
        aria-label={placeholder}
        className="pl-8"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

export function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Clickable table row with keyboard support. */
export function rowProps(onOpen: () => void) {
  return {
    className:
      "cursor-pointer border-border/50 border-b transition-colors last:border-0 hover:bg-muted/50",
    onClick: onOpen,
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onOpen();
      }
    },
    tabIndex: 0,
  };
}
