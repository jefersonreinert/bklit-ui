"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { DrawToolType } from "./mt5/tv/drawing-engine";
import { DRAWING_ICONS } from "./mt5/tv/drawing-icons";

export const TOOLS: { type: DrawToolType; label: string; icon: string }[] = [
  { type: "trendline", label: "Linha de tendência", icon: "Trend Line" },
  { type: "ray", label: "Raio", icon: "Ray" },
  { type: "extendedline", label: "Linha estendida", icon: "Extended Line" },
  { type: "hline", label: "Linha horizontal", icon: "Horizontal Line" },
  { type: "hray", label: "Raio horizontal", icon: "Horizontal Ray" },
  { type: "vline", label: "Linha vertical", icon: "Vertical Line" },
  { type: "crossline", label: "Cruz", icon: "Cross Line" },
  { type: "arrow", label: "Seta", icon: "Arrow" },
  {
    type: "parallel_channel",
    label: "Canal paralelo",
    icon: "Parallel Channel",
  },
  { type: "rectangle", label: "Retângulo", icon: "Rectangle" },
  { type: "fibonacci", label: "Fibonacci", icon: "Fib Retracement" },
  { type: "measure", label: "Medir", icon: "Price Range" },
  { type: "text", label: "Texto", icon: "Text" },
  { type: "price_label", label: "Etiqueta de preço", icon: "Price Label" },
];

/** Tool name in Portuguese. */
export const toolLabel = (type: DrawToolType) =>
  TOOLS.find((t) => t.type === type)?.label ?? type;

interface ToolActions {
  active: DrawToolType | null;
  onPick: (t: DrawToolType | null) => void;
  hidden: boolean;
  onToggleHidden: () => void;
  onClear: () => void;
  count: number;
}

/** Desktop: vertical toolbar on the chart's left edge. */
export function ToolRail({
  active,
  onPick,
  hidden,
  onToggleHidden,
  onClear,
  count,
}: ToolActions) {
  return (
    <div className="no-scrollbar hidden w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r py-1.5 md:flex">
      <RailButton
        active={active === null}
        label="Cursor"
        onClick={() => onPick(null)}
      >
        <Icon className="size-[18px]" name="IconCursor1" />
      </RailButton>
      <span className="my-1 h-px w-6 bg-border" />
      {TOOLS.map((t) => (
        <RailButton
          active={active === t.type}
          key={t.type}
          label={t.label}
          onClick={() => onPick(active === t.type ? null : t.type)}
        >
          {DRAWING_ICONS[t.icon]}
        </RailButton>
      ))}
      <span className="my-1 h-px w-6 bg-border" />
      <RailButton
        active={hidden}
        disabled={count === 0}
        label={hidden ? "Mostrar desenhos" : "Ocultar desenhos"}
        onClick={onToggleHidden}
      >
        <Icon
          className="size-[18px]"
          name={hidden ? "IconEyeClosed" : "IconEyeOpen"}
        />
      </RailButton>
      <RailButton
        disabled={count === 0}
        label="Apagar todos os desenhos"
        onClick={onClear}
      >
        <Icon className="size-[18px]" name="IconTrashCan" />
      </RailButton>
    </div>
  );
}

function RailButton({
  active,
  label,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 [&>svg]:size-[18px]",
        active &&
          "bg-[#2962ff]/12 text-[#2962ff] hover:bg-[#2962ff]/18 hover:text-[#2962ff]"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

/** Mobile: tools in a bottom sheet. */
export function ToolsSheet({
  open,
  onClose,
  ...actions
}: ToolActions & { open: boolean; onClose: () => void }) {
  const pick = (t: DrawToolType | null) => {
    actions.onPick(t);
    onClose();
  };
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open={open}>
      <SheetContent
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)] md:mx-auto md:max-w-lg"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>Ferramentas de desenho</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-4 gap-1 px-3 pb-3">
          {TOOLS.map((t) => (
            <button
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-center text-[11px] text-muted-foreground leading-tight active:bg-muted [&>span>svg]:size-6",
                actions.active === t.type && "bg-[#2962ff]/12 text-[#2962ff]"
              )}
              key={t.type}
              onClick={() => pick(t.type)}
              type="button"
            >
              <span>{DRAWING_ICONS[t.icon]}</span>
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <button
            className="flex items-center justify-center gap-2 rounded-xl bg-muted py-3 text-sm disabled:opacity-40"
            disabled={actions.count === 0}
            onClick={() => {
              actions.onToggleHidden();
              onClose();
            }}
            type="button"
          >
            <Icon
              className="size-4"
              name={actions.hidden ? "IconEyeOpen" : "IconEyeClosed"}
            />
            {actions.hidden ? "Mostrar" : "Ocultar"} desenhos
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-xl bg-muted py-3 text-destructive text-sm disabled:opacity-40"
            disabled={actions.count === 0}
            onClick={() => {
              actions.onClear();
              onClose();
            }}
            type="button"
          >
            <Icon className="size-4" name="IconTrashCan" />
            Apagar todos ({actions.count})
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
