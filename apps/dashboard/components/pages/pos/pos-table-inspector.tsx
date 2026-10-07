"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/lib/icons";
import { TABLE_COLORS } from "@/lib/pos/seed";
import type { FloorArea, PosTable, TableShape } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

const FLOOR_W = 1000;
const FLOOR_H = 700;
const MIN = 60;
const MAX = 400;

const SHAPES: { id: TableShape; label: string }[] = [
  { id: "round", label: "Redonda" },
  { id: "square", label: "Quadrada" },
  { id: "rect", label: "Retangular" },
];

function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="flex items-center gap-1">
        <button
          aria-label={`Diminuir ${label}`}
          className="flex size-8 items-center justify-center rounded-full bg-muted disabled:opacity-40"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          type="button"
        >
          <Icon className="size-4" name="IconMinusSmall" />
        </button>
        <span className="w-10 text-center text-sm tabular-nums">{value}</span>
        <button
          aria-label={`Aumentar ${label}`}
          className="flex size-8 items-center justify-center rounded-full bg-muted disabled:opacity-40"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          type="button"
        >
          <Icon className="size-4" name="IconPlusSmall" />
        </button>
      </div>
    </div>
  );
}

function AreaSettings({
  area,
  canDelete,
  onPatch,
  onDelete,
}: {
  area: FloorArea;
  canDelete: boolean;
  onPatch: (patch: Partial<FloorArea>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
      <p className="font-semibold text-sm">Área</p>
      <Input
        aria-label="Nome da área"
        onChange={(e) => onPatch({ name: e.target.value })}
        value={area.name}
      />
      <p className="text-muted-foreground text-xs">
        {area.tables.length} mesas ·{" "}
        {area.tables.reduce((a, t) => a + t.seats, 0)} lugares. Toque numa mesa
        para editar.
      </p>
      {canDelete ? (
        <Button onClick={onDelete} size="sm" variant="ghost">
          <Icon className="size-4" name="IconTrashCan" />
          Excluir área
        </Button>
      ) : null}
    </div>
  );
}

export function TableInspector({
  area,
  table,
  canDeleteArea,
  onPatchTable,
  onPatchArea,
  onDeleteTable,
  onDeleteArea,
  onDuplicate,
}: {
  area: FloorArea;
  table: PosTable | null;
  canDeleteArea: boolean;
  onPatchTable: (id: string, patch: Partial<PosTable>) => void;
  onPatchArea: (patch: Partial<FloorArea>) => void;
  onDeleteTable: (id: string) => void;
  onDeleteArea: () => void;
  onDuplicate: (t: PosTable) => void;
}) {
  if (!table) {
    return (
      <AreaSettings
        area={area}
        canDelete={canDeleteArea}
        onDelete={onDeleteArea}
        onPatch={onPatchArea}
      />
    );
  }
  const patch = (p: Partial<PosTable>) => onPatchTable(table.id, p);
  const resize = (w: number, h: number) =>
    patch({
      w,
      h,
      x: Math.min(table.x, FLOOR_W - w),
      y: Math.min(table.y, FLOOR_H - h),
    });

  return (
    <div className="flex flex-col gap-4 rounded-3xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 font-semibold text-sm">Mesa</p>
        <Button
          aria-label="Duplicar mesa"
          onClick={() => onDuplicate(table)}
          size="icon-sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconSquareBehindSquare1" />
        </Button>
        <Button
          aria-label="Excluir mesa"
          onClick={() => onDeleteTable(table.id)}
          size="icon-sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconTrashCan" />
        </Button>
      </div>
      <Input
        aria-label="Nome da mesa"
        onChange={(e) => patch({ name: e.target.value })}
        value={table.name}
      />
      <Stepper
        label="Lugares"
        max={30}
        min={1}
        onChange={(seats) => patch({ seats })}
        value={table.seats}
      />
      <div className="grid grid-cols-3 gap-1.5">
        {SHAPES.map((s) => (
          <button
            className={cn(
              "rounded-xl border px-2 py-2 text-xs transition-colors",
              table.shape === s.id ? "border-foreground bg-muted" : "bg-card"
            )}
            key={s.id}
            onClick={() => {
              const square = s.id !== "rect";
              const side = Math.max(table.w, table.h);
              patch({ shape: s.id });
              if (square && table.w !== table.h) {
                resize(Math.min(side, 200), Math.min(side, 200));
              }
            }}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-sm">Cor</span>
        <div className="flex flex-wrap gap-2">
          {TABLE_COLORS.map((c) => (
            <button
              aria-label={`Cor ${c}`}
              className={cn(
                "size-8 rounded-full border-2 transition-transform",
                table.color === c
                  ? "scale-110 border-foreground"
                  : "border-black/10"
              )}
              key={c}
              onClick={() => patch({ color: c })}
              style={{ background: c }}
              type="button"
            />
          ))}
          <label
            className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-black/10 bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]"
            title="Outra cor"
          >
            <input
              aria-label="Escolher outra cor"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => patch({ color: e.target.value })}
              type="color"
              value={table.color}
            />
          </label>
        </div>
      </div>
      <Stepper
        label="Largura"
        max={MAX}
        min={MIN}
        onChange={(w) => resize(w, table.shape === "rect" ? table.h : w)}
        step={10}
        value={table.w}
      />
      {table.shape === "rect" ? (
        <Stepper
          label="Altura"
          max={MAX}
          min={MIN}
          onChange={(h) => resize(table.w, h)}
          step={10}
          value={table.h}
        />
      ) : null}
      {table.shape === "rect" ? (
        <Button
          onClick={() => resize(table.h, table.w)}
          size="sm"
          variant="outline"
        >
          <Icon className="size-4" name="IconRotate" />
          Girar 90°
        </Button>
      ) : null}
    </div>
  );
}
