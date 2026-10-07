"use client";

import { Icon } from "@/lib/icons";
import type { SaveResult } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<SaveResult, string> = {
  cloud: "Salvo — vale para todos os seus aparelhos",
  device: "Salvo neste aparelho",
  error: "Não foi possível salvar no servidor. Tente de novo.",
};

export function SaveStatus({
  status,
}: {
  status: SaveResult | "saving" | null;
}) {
  if (!status || status === "saving") {
    return null;
  }
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-sm",
        status === "error" ? "text-destructive" : "text-muted-foreground"
      )}
      role="status"
    >
      <Icon
        className="size-4 shrink-0"
        name={status === "error" ? "IconCircleInfo" : "IconCheckmark1"}
      />
      {STATUS_TEXT[status]}
    </span>
  );
}
