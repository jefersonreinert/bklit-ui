"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRepos } from "@/lib/code/client";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Bottom sheet listing the GitHub repos the token can reach. */
export function RepoPicker({
  open,
  selected,
  onClose,
  onChange,
}: {
  open: boolean;
  selected: string[];
  onClose: () => void;
  onChange: (repos: string[]) => void;
}) {
  const { data, error } = useRepos(open);
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((r) => r.fullName.toLowerCase().includes(q));
  }, [data, query]);
  const toggle = (name: string) =>
    onChange(
      selected.includes(name)
        ? selected.filter((r) => r !== name)
        : [...selected, name]
    );
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="max-h-[85dvh] gap-0 rounded-t-3xl md:mx-auto md:max-w-lg"
        side="bottom"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle>Repositórios</SheetTitle>
          <input
            aria-label="Buscar repositório"
            className="mt-2 h-10 w-full rounded-full border bg-background px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            value={query}
          />
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {error ? (
            <p className="p-4 text-destructive text-sm">{error.message}</p>
          ) : null}
          {data || error ? null : (
            <p className="p-4 text-muted-foreground text-sm">Carregando…</p>
          )}
          {list.map((r) => {
            const on = selected.includes(r.fullName);
            return (
              <button
                aria-pressed={on}
                className="flex items-start gap-3 rounded-xl p-3 text-left hover:bg-muted"
                key={r.fullName}
                onClick={() => toggle(r.fullName)}
                type="button"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border",
                    on && "border-foreground bg-foreground text-background"
                  )}
                >
                  {on ? (
                    <Icon className="size-3.5" name="IconCheckmark1" />
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 truncate font-medium text-sm">
                    {r.fullName}
                    {r.private ? (
                      <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                        privado
                      </span>
                    ) : null}
                  </span>
                  {r.description ? (
                    <span className="line-clamp-1 text-muted-foreground text-xs">
                      {r.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="border-t p-3">
          <Button className="h-11 w-full rounded-full" onClick={onClose}>
            Pronto ({selected.length})
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
