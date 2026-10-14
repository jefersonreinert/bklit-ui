"use client";

import type { CSSProperties } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PLACE_COLORS,
  type PlaceKind,
  type WorkPlace,
} from "@/lib/work-schedule";

/** Line icons in the panel's style (24px grid, 1.5 stroke, round caps). */
const PATHS: Record<PlaceKind, React.ReactNode> = {
  // Wine glass
  wine: (
    <>
      <path d="M7.5 3.75h9l-.6 5.1a3.9 3.9 0 0 1-7.8 0z" />
      <path d="M7.9 7.25h8.2" />
      <path d="M12 12.75v6.5" />
      <path d="M8.75 20.25h6.5" />
    </>
  ),
  // Pig (side view)
  pig: (
    <>
      <path d="M5.25 11.25a5.25 4.5 0 0 1 10.5-2.5h1.5l1.5-1.5v2.6a4.4 4.4 0 0 1 1.5 2.4h1v2.5h-1.4a5 5 0 0 1-2.1 2.4v2.1h-2.25l-.5-1.4a6.6 6.6 0 0 1-3.4 0l-.5 1.4H8.85v-2.4a4.6 4.6 0 0 1-3.6-3.9" />
      <path d="M5.25 11.25c-1.2 0-1.8.7-1.8 1.4s.6 1.2 1.3 1.1" />
      <path d="M16.5 11.4h.01" strokeWidth={2.2} />
    </>
  ),
  // Beer mug
  beer: (
    <>
      <path d="M5.75 8.25h9.5v10.5a1.5 1.5 0 0 1-1.5 1.5h-6.5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M15.25 10.25h1.75a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2h-1.75" />
      <path d="M5.75 8.25a2.25 2.25 0 0 1 1.5-4 2.6 2.6 0 0 1 4.5 0 2.25 2.25 0 0 1 3.5 4" />
      <path d="M9 11.75v5.25M12 11.75v5.25" />
    </>
  ),
};

export function PlaceIcon({
  kind,
  className,
  style,
}: {
  kind: PlaceKind;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      style={style}
      viewBox="0 0 24 24"
    >
      {PATHS[kind]}
    </svg>
  );
}

/** A place's icon in its color. */
export function PlaceMark({
  places,
  id,
  className,
}: {
  places: WorkPlace[];
  id: string;
  className?: string;
}) {
  const i = places.findIndex((p) => p.id === id);
  const place = places[i];
  if (!place) {
    return (
      <span className="inline-block size-2.5 shrink-0 rounded-full bg-muted-foreground" />
    );
  }
  return (
    <PlaceIcon
      className={className}
      kind={place.kind}
      style={{ color: PLACE_COLORS[i] }}
    />
  );
}

/** Dropdown of the company's places, each with its icon. */
export function PlaceSelect({
  places,
  value,
  onChange,
  className,
  label = "Local",
}: {
  places: WorkPlace[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  label?: string;
}) {
  const items = places.map((p) => ({ value: p.id, label: p.name }));
  return (
    <Select
      items={items}
      onValueChange={(v) => {
        if (typeof v === "string") {
          onChange(v);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label={label} className={cn("w-full", className)}>
        <SelectValue>
          {(v: string) => (
            <span className="flex min-w-0 items-center gap-2">
              <PlaceMark id={v} places={places} />
              <span className="truncate">
                {places.find((p) => p.id === v)?.name ?? "Escolha"}
              </span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {places.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <PlaceMark className="size-5" id={p.id} places={places} />
            <span className="flex flex-col">
              <span>{p.name}</span>
              <span className="text-muted-foreground text-xs">{p.area}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
