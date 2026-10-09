// drawing-properties-bar.tsx — Quick edit toolbar shown when a drawing is selected
import { useRef } from "react"
import { Bold, Italic, Copy, Trash2, Settings, Lock, Unlock, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Drawing, DrawingStyle } from "./drawing-engine"

interface Props {
  drawing: Drawing
  onStyleUpdate: (style: Partial<DrawingStyle>) => void
  onDrawingUpdate: (partial: Partial<Drawing>) => void
  onClone: () => void
  onDelete: () => void
  onSettings: () => void
  style?: React.CSSProperties
  className?: string
}

const LINE_WIDTHS = [1, 2, 3, 4] as const
const TEXT_TYPES = new Set(["text", "price_label"])
const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24]

function Sep() {
  return <div className="w-px h-5 bg-[var(--border)] mx-0.5 shrink-0" />
}

function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "w-7 h-7 flex items-center justify-center shrink-0 transition-colors cursor-pointer",
        active
          ? "bg-muted text-foreground"
          : "text-[var(--fg-muted)] hover:text-foreground hover:bg-muted/50"
      )}
    >
      {children}
    </button>
  )
}

export function DrawingPropertiesBar({
  drawing,
  onStyleUpdate,
  onDrawingUpdate,
  onClone,
  onDelete,
  onSettings,
  style: posStyle,
  className,
}: Props) {
  const colorRef = useRef<HTMLInputElement>(null)
  const s = drawing.style
  const isText = TEXT_TYPES.has(drawing.type)

  return (
    <div
      style={posStyle}
      className={cn(
        "absolute z-[60] flex items-center bg-card border border-[var(--border)] rounded shadow-2xl select-none",
        className,
      )}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Color picker ──────────────────────────────────────────────── */}
      <button
        title="Color"
        onClick={() => colorRef.current?.click()}
        className="w-7 h-7 flex items-center justify-center hover:bg-muted/50 transition-colors relative shrink-0 cursor-pointer"
      >
        <div
          className="w-4 h-4 rounded-sm border border-[var(--border)]/50"
          style={{ backgroundColor: s.color }}
        />
        <input
          ref={colorRef}
          type="color"
          value={s.color.startsWith("#") ? s.color : "#FAFAFA"}
          onChange={e => onStyleUpdate({ color: e.target.value })}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </button>

      <Sep />

      {/* ── Line width ────────────────────────────────────────────────── */}
      {LINE_WIDTHS.map(w => (
        <Btn
          key={w}
          active={s.lineWidth === w}
          onClick={() => onStyleUpdate({ lineWidth: w })}
          title={`${w}px`}
        >
          <div
            className="bg-current rounded-sm"
            style={{ width: 14, height: w }}
          />
        </Btn>
      ))}

      <Sep />

      {/* ── Line style ────────────────────────────────────────────────── */}
      <Btn
        active={s.lineStyle === "solid"}
        onClick={() => onStyleUpdate({ lineStyle: "solid" })}
        title="Solid"
      >
        <div className="w-4 h-px bg-current" />
      </Btn>
      <Btn
        active={s.lineStyle === "dashed"}
        onClick={() => onStyleUpdate({ lineStyle: "dashed" })}
        title="Dashed"
      >
        <div className="flex gap-0.5 items-center">
          <div className="w-2 h-px bg-current" />
          <div className="w-2 h-px bg-current" />
        </div>
      </Btn>
      <Btn
        active={s.lineStyle === "dotted"}
        onClick={() => onStyleUpdate({ lineStyle: "dotted" })}
        title="Dotted"
      >
        <div className="flex gap-0.5 items-center">
          <div className="w-1 h-1 rounded-full bg-current" />
          <div className="w-1 h-1 rounded-full bg-current" />
          <div className="w-1 h-1 rounded-full bg-current" />
        </div>
      </Btn>

      {/* ── Text options ──────────────────────────────────────────────── */}
      {isText && (
        <>
          <Sep />
          <Btn
            active={s.fontBold}
            onClick={() => onStyleUpdate({ fontBold: !s.fontBold })}
            title="Bold"
          >
            <Bold className="w-3 h-3" />
          </Btn>
          <Btn
            active={s.fontItalic}
            onClick={() => onStyleUpdate({ fontItalic: !s.fontItalic })}
            title="Italic"
          >
            <Italic className="w-3 h-3" />
          </Btn>
          <select
            value={s.fontSize}
            onChange={e => onStyleUpdate({ fontSize: Number(e.target.value) })}
            className="h-7 px-1 text-[11px] font-mono bg-transparent text-[var(--fg-muted)] border-0 outline-none hover:text-foreground cursor-pointer shrink-0"
          >
            {FONT_SIZES.map(sz => (
              <option key={sz} value={sz} className="bg-card text-foreground">
                {sz}
              </option>
            ))}
          </select>
        </>
      )}

      <Sep />

      {/* ── Labels toggle ─────────────────────────────────────────────── */}
      <Btn
        active={s.showLabels}
        onClick={() => onStyleUpdate({ showLabels: !s.showLabels })}
        title="Show labels"
      >
        <span className="text-[9px] font-mono font-bold leading-none">Lbl</span>
      </Btn>

      <Sep />

      {/* ── Visibility ────────────────────────────────────────────────── */}
      <Btn
        active={drawing.visible}
        onClick={() => onDrawingUpdate({ visible: !drawing.visible })}
        title={drawing.visible ? "Hide" : "Show"}
      >
        {drawing.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      </Btn>

      {/* ── Lock ──────────────────────────────────────────────────────── */}
      <Btn
        active={drawing.locked}
        onClick={() => onDrawingUpdate({ locked: !drawing.locked })}
        title={drawing.locked ? "Unlock" : "Lock"}
      >
        {drawing.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
      </Btn>

      <Sep />

      {/* ── Settings ──────────────────────────────────────────────────── */}
      <Btn onClick={onSettings} title="Settings">
        <Settings className="w-3 h-3" />
      </Btn>

      {/* ── Clone ─────────────────────────────────────────────────────── */}
      <Btn onClick={onClone} title="Clone">
        <Copy className="w-3 h-3" />
      </Btn>

      {/* ── Delete ────────────────────────────────────────────────────── */}
      <Btn onClick={onDelete} title="Delete">
        <Trash2 className="w-3 h-3" />
      </Btn>
    </div>
  )
}
