import { Badge } from "@/components/ui/badge";
import type { EmployeeStatus } from "@/lib/hr-data";
import { initials } from "@/lib/hr-data";
import { cn } from "@/lib/utils";

const statusVariant: Record<
  EmployeeStatus,
  "outline" | "secondary" | "default" | "destructive"
> = {
  Ativo: "outline",
  Férias: "secondary",
  Experiência: "default",
  Afastado: "destructive",
  "Aviso prévio": "destructive",
};

export function StatusBadge({ status }: { status: EmployeeStatus }) {
  return <Badge variant={statusVariant[status]}>{status}</Badge>;
}

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs ring-1 ring-border",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Inline 0–100 score bar. */
export function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--chart-1)] dark:bg-foreground"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">
        {value}
      </span>
    </div>
  );
}

export function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 pt-2">
      <h3 className="font-semibold text-base tracking-tight">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
