"use client";

import { type PointerEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { TABLE_COLORS } from "@/lib/pos/seed";
import {
  createOrder,
  money,
  openOrderFor,
  orderTotals,
  saveAreas,
  uid,
  usePos,
} from "@/lib/pos/store";
import type { FloorArea, PosData, PosTable, TableShape } from "@/lib/pos/types";
import { cn } from "@/lib/utils";
import { useCan } from "./pos-auth";
import { TableInspector } from "./pos-table-inspector";

export const FLOOR_W = 1000;
export const FLOOR_H = 700;
const GRID = 10;

const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

function minutesSince(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60_000);
  return m < 60
    ? `${m} min`
    : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

function TableShapeView({
  table,
  data,
  editing,
  selected,
  onPointerDown,
  onClick,
}: {
  table: PosTable;
  data: PosData;
  editing: boolean;
  selected: boolean;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}) {
  const order = openOrderFor(data, table.id);
  const busy = Boolean(order) && !editing;
  return (
    <button
      className={cn(
        "absolute flex touch-none select-none flex-col items-center justify-center gap-0.5 border-2 text-center text-stone-800 shadow-sm transition-shadow",
        table.shape === "round" ? "rounded-full" : "rounded-[min(16px,14%)]",
        editing ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        selected
          ? "border-foreground ring-4 ring-foreground/15"
          : "border-black/10",
        busy && "border-[#c96442] ring-4 ring-[#c96442]/25"
      )}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{
        left: `${(table.x / FLOOR_W) * 100}%`,
        top: `${(table.y / FLOOR_H) * 100}%`,
        width: `${(table.w / FLOOR_W) * 100}%`,
        height: `${(table.h / FLOOR_H) * 100}%`,
        background: table.color,
      }}
      type="button"
    >
      <span className="font-semibold text-sm leading-none sm:text-lg">
        {table.name}
      </span>
      {order ? (
        <span className="text-[10px] tabular-nums leading-tight sm:text-xs">
          {money(orderTotals(order).total, data.settings.currency)}
          <span className="hidden sm:block">
            {minutesSince(order.createdAt)}
          </span>
        </span>
      ) : (
        <span className="flex items-center gap-0.5 text-[10px] opacity-70 sm:text-xs">
          <Icon className="size-3" name="IconChair" />
          {table.seats}
        </span>
      )}
    </button>
  );
}

function useFloorDrag(
  floor: React.RefObject<HTMLDivElement | null>,
  onMove: (id: string, x: number, y: number) => void
) {
  const drag = useRef<{
    id: string;
    px: number;
    py: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const start = (e: PointerEvent<HTMLButtonElement>, t: PosTable) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: t.id,
      px: e.clientX,
      py: e.clientY,
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
    };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const rect = floor.current?.getBoundingClientRect();
    if (!(d && rect)) {
      return;
    }
    const dx = ((e.clientX - d.px) * FLOOR_W) / rect.width;
    const dy = ((e.clientY - d.py) * FLOOR_H) / rect.height;
    onMove(
      d.id,
      clamp(snap(d.x + dx), 0, FLOOR_W - d.w),
      clamp(snap(d.y + dy), 0, FLOOR_H - d.h)
    );
  };
  const end = () => {
    drag.current = null;
  };
  return { start, move, end };
}

const NEW_SIZES: Record<TableShape, [number, number]> = {
  round: [110, 110],
  square: [110, 110],
  rect: [190, 110],
};

const NEW_SEATS: Record<TableShape, number> = { round: 2, square: 4, rect: 6 };

export function TablesView({
  onOpenOrder,
}: {
  onOpenOrder: (id: string) => void;
}) {
  const data = usePos();
  const [areaId, setAreaId] = useState(data.areas[0]?.id ?? "");
  const [draft, setDraft] = useState<FloorArea[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const floor = useRef<HTMLDivElement>(null);
  const editing = draft !== null;
  const can = useCan();
  const areas = draft ?? data.areas;
  const area = areas.find((a) => a.id === areaId) ?? areas[0];

  const patchTable = (id: string, patch: Partial<PosTable>) =>
    setDraft((d) =>
      (d ?? []).map((a) => ({
        ...a,
        tables: a.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }))
    );
  const patchArea = (id: string, patch: Partial<FloorArea>) =>
    setDraft((d) =>
      (d ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  const dragger = useFloorDrag(floor, (id, x, y) => patchTable(id, { x, y }));

  const openTable = (t: PosTable) => {
    const existing = openOrderFor(data, t.id);
    onOpenOrder(existing ? existing.id : createOrder({ tableId: t.id }).id);
  };

  const addTable = (shape: TableShape) => {
    if (!area) {
      return;
    }
    const names = areas.flatMap((a) => a.tables.map((t) => Number(t.name)));
    const next = Math.max(0, ...names.filter(Number.isFinite)) + 1;
    const [w, h] = NEW_SIZES[shape];
    const table: PosTable = {
      id: uid(),
      name: String(next),
      x: snap((FLOOR_W - w) / 2),
      y: snap((FLOOR_H - h) / 2),
      w,
      h,
      shape,
      seats: NEW_SEATS[shape],
      color: TABLE_COLORS[0] ?? "#e8dccb",
    };
    patchArea(area.id, { tables: [...area.tables, table] });
    setSelectedId(table.id);
  };

  const addArea = () => {
    const created: FloorArea = {
      id: uid(),
      name: `Área ${areas.length + 1}`,
      tables: [],
    };
    setDraft((d) => [...(d ?? []), created]);
    setAreaId(created.id);
    setSelectedId(null);
  };

  const selected = area?.tables.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 basis-full gap-1.5 overflow-x-auto px-1 sm:basis-auto">
          {areas.map((a) => (
            <button
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors",
                a.id === area?.id
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card"
              )}
              key={a.id}
              onClick={() => {
                setAreaId(a.id);
                setSelectedId(null);
              }}
              type="button"
            >
              {a.name}
            </button>
          ))}
          {editing ? (
            <button
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-sm"
              onClick={addArea}
              type="button"
            >
              <Icon className="size-4" name="IconPlusSmall" />
              Área
            </button>
          ) : null}
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setDraft(null);
                setSelectedId(null);
              }}
              variant="ghost"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                saveAreas(areas);
                setDraft(null);
                setSelectedId(null);
              }}
            >
              <Icon className="size-4" name="IconCheckmark1" />
              Salvar layout
            </Button>
          </div>
        ) : null}
        {!editing && can("tables") ? (
          <Button
            onClick={() => setDraft(structuredClone(data.areas))}
            variant="outline"
          >
            <Icon className="size-4" name="IconPencil" />
            Editar layout
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Adicionar mesa:</span>
          {(
            [
              ["round", "Redonda"],
              ["square", "Quadrada"],
              ["rect", "Retangular"],
            ] as const
          ).map(([shape, label]) => (
            <Button
              key={shape}
              onClick={() => addTable(shape)}
              size="sm"
              variant="outline"
            >
              <span
                className={cn(
                  "inline-block border-2 border-current",
                  shape === "round" && "size-3.5 rounded-full",
                  shape === "square" && "size-3.5 rounded-[3px]",
                  shape === "rect" && "h-3 w-5 rounded-[3px]"
                )}
              />
              {label}
            </Button>
          ))}
          <span className="text-muted-foreground text-xs">
            Arraste as mesas para mover · toque para editar
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <div
          className={cn(
            "relative aspect-[10/7] w-full overflow-hidden rounded-3xl border bg-card",
            editing &&
              "bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] bg-size-[20px_20px]"
          )}
          onPointerCancel={dragger.end}
          onPointerMove={editing ? dragger.move : undefined}
          onPointerUp={dragger.end}
          ref={floor}
        >
          {area?.tables.map((t) => (
            <TableShapeView
              data={data}
              editing={editing}
              key={t.id}
              onClick={() => (editing ? setSelectedId(t.id) : openTable(t))}
              onPointerDown={
                editing
                  ? (e) => {
                      setSelectedId(t.id);
                      dragger.start(e, t);
                    }
                  : undefined
              }
              selected={editing && t.id === selectedId}
              table={t}
            />
          ))}
          {area && area.tables.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              {editing
                ? "Adicione mesas acima."
                : "Nenhuma mesa. Toque em Editar layout."}
            </p>
          ) : null}
        </div>

        {editing && area ? (
          <TableInspector
            area={area}
            canDeleteArea={areas.length > 1}
            onDeleteArea={() => {
              setDraft((d) => (d ?? []).filter((a) => a.id !== area.id));
              setAreaId(areas.find((a) => a.id !== area.id)?.id ?? "");
              setSelectedId(null);
            }}
            onDeleteTable={(id) => {
              patchArea(area.id, {
                tables: area.tables.filter((t) => t.id !== id),
              });
              setSelectedId(null);
            }}
            onDuplicate={(t) => {
              const copy = {
                ...t,
                id: uid(),
                name: `${t.name}b`,
                x: clamp(t.x + 30, 0, FLOOR_W - t.w),
                y: clamp(t.y + 30, 0, FLOOR_H - t.h),
              };
              patchArea(area.id, { tables: [...area.tables, copy] });
              setSelectedId(copy.id);
            }}
            onPatchArea={(patch) => patchArea(area.id, patch)}
            onPatchTable={patchTable}
            table={selected}
          />
        ) : (
          <TablesLegend data={data} />
        )}
      </div>
    </div>
  );
}

function TablesLegend({ data }: { data: PosData }) {
  const all = data.areas.flatMap((a) => a.tables);
  const busy = all.filter((t) => openOrderFor(data, t.id));
  const open = busy.reduce((sum, t) => {
    const o = openOrderFor(data, t.id);
    return sum + (o ? orderTotals(o).total : 0);
  }, 0);
  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4 text-sm">
      <p className="font-semibold">Agora</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-muted/60 p-3">
          <p className="text-muted-foreground text-xs">Mesas ocupadas</p>
          <p className="font-semibold text-xl">
            {busy.length}/{all.length}
          </p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-3">
          <p className="text-muted-foreground text-xs">Em aberto</p>
          <p className="font-semibold text-xl tabular-nums">
            {money(open, data.settings.currency)}
          </p>
        </div>
      </div>
      <p className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="size-3 rounded-full border-2 border-[#c96442]" />
        Mesa com pedido aberto — toque para abrir no caixa
      </p>
    </div>
  );
}
