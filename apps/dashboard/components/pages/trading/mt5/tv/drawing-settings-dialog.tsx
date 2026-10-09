// drawing-settings-dialog.tsx — Settings dialog for chart drawings (4 tabs: Style, Text, Coordinates, Visibility)
import { useState, useRef } from "react"
import { X, Pencil } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Drawing, DrawingStyle, DrawToolType } from "./drawing-engine"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DrawingSettingsDialogProps {
  drawing: Drawing
  onUpdate: (partial: Partial<Drawing>) => void
  onClose: () => void
  className?: string
}

type TabId = "style" | "text" | "coordinates" | "visibility"

// ─── Tool labels ──────────────────────────────────────────────────────────────

const TOOL_LABEL: Record<DrawToolType, string> = {
  trendline:        "Trendline",
  ray:              "Ray",
  extendedline:     "Extended Line",
  hline:            "Horizontal Line",
  hray:             "Horizontal Ray",
  vline:            "Vertical Line",
  crossline:        "Cross Line",
  arrow:            "Arrow",
  parallel_channel: "Parallel Channel",
  rectangle:        "Rectangle",
  fibonacci:        "Fib Retracement",
  text:             "Text",
  price_label:      "Price Label",
  measure:          "Measure",
}

function getTabsForTool(type: DrawToolType): TabId[] {
  if (type === "fibonacci")                      return ["style", "coordinates", "visibility"]
  if (type === "text" || type === "price_label") return ["style", "coordinates", "visibility"]
  if (type === "vline")                          return ["style", "coordinates", "visibility"]
  return ["style", "text", "coordinates", "visibility"]
}

const TAB_LABEL: Record<TabId, string> = {
  style:       "Style",
  text:        "Text",
  coordinates: "Coordinates",
  visibility:  "Visibility",
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-xs font-mono text-foreground">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-mono text-[var(--fg-muted)] uppercase tracking-widest pt-4 pb-1.5">
      {children}
    </p>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "w-4 h-4 border border-[var(--border)] flex items-center justify-center transition-colors cursor-pointer shrink-0",
        checked ? "bg-foreground" : "bg-transparent",
      )}
    >
      {checked && (
        <svg className="w-2.5 h-2.5 text-background" fill="none" viewBox="0 0 12 12">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
        </svg>
      )}
    </button>
  )
}

function ColorSwatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <button
      onClick={() => ref.current?.click()}
      className="relative w-7 h-7 border border-[var(--border)] shrink-0 overflow-hidden cursor-pointer"
      title="Pick color"
    >
      <div className="absolute inset-0" style={{ backgroundColor: color }} />
      <input
        ref={ref}
        type="color"
        value={color.startsWith("#") ? color : "#FAFAFA"}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
      />
    </button>
  )
}

function LineStyleBtns({ value, onChange }: { value: string; onChange: (v: "solid" | "dashed" | "dotted") => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {(["solid", "dashed", "dotted"] as const).map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cn(
            "w-8 h-7 flex items-center justify-center border transition-colors cursor-pointer",
            value === s
              ? "border-foreground bg-muted"
              : "border-[var(--border)] bg-transparent hover:bg-muted/50",
          )}
          title={s}
        >
          {s === "solid"  && <div className="w-4 h-px bg-foreground" />}
          {s === "dashed" && (
            <div className="flex gap-0.5 items-center">
              <div className="w-1.5 h-px bg-foreground" />
              <div className="w-1.5 h-px bg-foreground" />
            </div>
          )}
          {s === "dotted" && (
            <div className="flex gap-0.5 items-center">
              <div className="w-1 h-1 rounded-full bg-foreground" />
              <div className="w-1 h-1 rounded-full bg-foreground" />
              <div className="w-1 h-1 rounded-full bg-foreground" />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

function LineWidthBtns({ value, onChange }: { value: number; onChange: (v: 1 | 2 | 3 | 4) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {([1, 2, 3, 4] as const).map(w => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={cn(
            "w-7 h-7 flex items-center justify-center border transition-colors cursor-pointer",
            value === w
              ? "border-foreground bg-muted"
              : "border-[var(--border)] bg-transparent hover:bg-muted/50",
          )}
          title={`${w}px`}
        >
          <div className="bg-foreground rounded-sm" style={{ width: 12, height: w }} />
        </button>
      ))}
    </div>
  )
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-8 px-2 text-xs font-mono bg-card text-foreground border border-[var(--border)] outline-none cursor-pointer"
    >
      {options.map(o => (
        <option key={o} value={o} className="bg-card text-foreground">{o}</option>
      ))}
    </select>
  )
}

function NumInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="number"
      className={cn(
        "bg-card text-foreground border border-[var(--border)] outline-none font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
      {...props}
    />
  )
}

// ─── Style Tab ────────────────────────────────────────────────────────────────

function StyleTab({
  drawing,
  color, setColor,
  lineWidth, setLineWidth,
  lineStyle, setLineStyle,
  showLabels, setShowLabels,
}: {
  drawing: Drawing
  color: string; setColor: (v: string) => void
  lineWidth: 1|2|3|4; setLineWidth: (v: 1|2|3|4) => void
  lineStyle: "solid"|"dashed"|"dotted"; setLineStyle: (v: "solid"|"dashed"|"dotted") => void
  showLabels: boolean; setShowLabels: (v: boolean) => void
}) {
  const isRect = drawing.type === "rectangle" || drawing.type === "parallel_channel"
  const [extend, setExtend] = useState("Don't extend")
  const [showMiddle, setShowMiddle] = useState(false)
  const [stats, setStats] = useState("Hidden")
  const [statsPos, setStatsPos] = useState("Right")
  const [alwaysStats, setAlwaysStats] = useState(false)

  return (
    <div>
      <Row label="Line">
        <ColorSwatch color={color} onChange={setColor} />
        <LineWidthBtns value={lineWidth} onChange={setLineWidth} />
        <LineStyleBtns value={lineStyle} onChange={setLineStyle} />
      </Row>

      {!isRect && drawing.type !== "hline" && drawing.type !== "vline" && drawing.type !== "crossline" && (
        <Row label="Extend">
          <Select value={extend} options={["Don't extend", "Right", "Left", "Both"]} onChange={setExtend} />
        </Row>
      )}

      {!isRect && (
        <div className="flex items-center gap-2.5 py-2">
          <Checkbox checked={showMiddle} onChange={setShowMiddle} />
          <span className="text-xs font-mono text-foreground">Middle point</span>
        </div>
      )}

      <div className="flex items-center gap-2.5 py-2">
        <Checkbox checked={showLabels} onChange={setShowLabels} />
        <span className="text-xs font-mono text-foreground">Price labels</span>
      </div>

      <SectionLabel>Info</SectionLabel>

      <Row label="Stats">
        <Select value={stats} options={["Hidden", "Auto", "Price offset", "% change"]} onChange={setStats} />
      </Row>

      <Row label="Stats position">
        <Select value={statsPos} options={["Left", "Right"]} onChange={setStatsPos} />
      </Row>

      <div className="flex items-center gap-2.5 py-2">
        <Checkbox checked={alwaysStats} onChange={setAlwaysStats} />
        <span className="text-xs font-mono text-foreground">Always show stats</span>
      </div>
    </div>
  )
}

// ─── Text Tab ─────────────────────────────────────────────────────────────────

function TextTab({
  textColor, setTextColor,
  fontSize, setFontSize,
  bold, setBold,
  italic, setItalic,
  text, setText,
}: {
  textColor: string; setTextColor: (v: string) => void
  fontSize: number; setFontSize: (v: number) => void
  bold: boolean; setBold: (v: boolean) => void
  italic: boolean; setItalic: (v: boolean) => void
  text: string; setText: (v: string) => void
}) {
  const SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24]
  const [alignH, setAlignH] = useState("Center")
  const [alignV, setAlignV] = useState("Middle")

  return (
    <div>
      <div className="flex items-center gap-1.5 pt-2 pb-3">
        <ColorSwatch color={textColor} onChange={setTextColor} />
        <Select
          value={String(fontSize)}
          options={SIZES.map(String)}
          onChange={v => setFontSize(Number(v))}
        />
        <button
          onClick={() => setBold(!bold)}
          className={cn(
            "w-8 h-8 border text-xs font-mono font-bold transition-colors cursor-pointer",
            bold ? "border-foreground bg-muted" : "border-[var(--border)] hover:bg-muted/50",
          )}
        >B</button>
        <button
          onClick={() => setItalic(!italic)}
          className={cn(
            "w-8 h-8 border text-xs font-mono italic transition-colors cursor-pointer",
            italic ? "border-foreground bg-muted" : "border-[var(--border)] hover:bg-muted/50",
          )}
        >I</button>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add text"
        className="w-full min-h-[96px] text-xs font-mono resize-none bg-card text-foreground border border-[var(--border)] p-2 outline-none"
      />

      <Row label="Text alignment">
        <Select value={alignV} options={["Top", "Middle", "Bottom"]} onChange={setAlignV} />
        <Select value={alignH} options={["Left", "Center", "Right"]} onChange={setAlignH} />
      </Row>
    </div>
  )
}

// ─── Coordinates Tab ──────────────────────────────────────────────────────────

function CoordinatesTab({ drawing }: { drawing: Drawing }) {
  const pts = drawing.points.slice(0, 3)
  return (
    <div className="space-y-3 pt-2">
      {pts.map((pt, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-mono text-foreground w-28 shrink-0">
            #{i + 1} (price, time)
          </span>
          <NumInput
            defaultValue={pt.price.toFixed(2)}
            className="flex-1 h-8 text-xs px-2"
          />
          <NumInput
            type="text" readOnly defaultValue={new Date(pt.index).toLocaleString()}
            className="w-40 h-8 text-xs px-2"
          />
        </div>
      ))}
    </div>
  )
}

// ─── Visibility Tab ───────────────────────────────────────────────────────────

interface VisRange { enabled: boolean; from: number; to: number }

const DEFAULT_VIS: Record<string, VisRange> = {
  Seconds: { enabled: true, from: 1, to: 59 },
  Minutes: { enabled: true, from: 1, to: 59 },
  Hours:   { enabled: true, from: 1, to: 24 },
  Days:    { enabled: true, from: 1, to: 366 },
  Weeks:   { enabled: true, from: 1, to: 52 },
  Months:  { enabled: true, from: 1, to: 12 },
}

function VisibilityTab() {
  const [ticks,  setTicks]  = useState(true)
  const [ranges, setRanges] = useState(true)
  const [vis, setVis] = useState(DEFAULT_VIS)

  function toggle(key: string) {
    setVis(prev => ({ ...prev, [key]: { ...prev[key]!, enabled: !prev[key]!.enabled } }))
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 py-2">
        <Checkbox checked={ticks} onChange={setTicks} />
        <span className="text-xs font-mono text-foreground">Ticks</span>
      </div>

      {Object.entries(vis).map(([label, v]) => (
        <div key={label} className="flex items-center gap-2 py-1.5">
          <Checkbox checked={v.enabled} onChange={() => toggle(label)} />
          <span className="text-xs font-mono text-foreground w-14 shrink-0">{label}</span>
          <NumInput
            value={v.from}
            onChange={e => setVis(prev => ({ ...prev, [label]: { ...prev[label]!, from: Number((e.target as HTMLInputElement).value) } }))}
            className="w-14 h-8 text-xs px-2"
          />
          <input
            type="range"
            min={1}
            max={v.to}
            value={v.from}
            onChange={e => setVis(prev => ({ ...prev, [label]: { ...prev[label]!, from: Number(e.target.value) } }))}
            className="flex-1 h-1 accent-foreground"
          />
          <NumInput
            value={v.to}
            onChange={e => setVis(prev => ({ ...prev, [label]: { ...prev[label]!, to: Number((e.target as HTMLInputElement).value) } }))}
            className="w-14 h-8 text-xs px-2"
          />
        </div>
      ))}

      <div className="flex items-center gap-2.5 py-2">
        <Checkbox checked={ranges} onChange={setRanges} />
        <span className="text-xs font-mono text-foreground">Ranges</span>
      </div>
    </div>
  )
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export function DrawingSettingsDialog({
  drawing,
  onUpdate,
  onClose,
  className,
}: DrawingSettingsDialogProps) {
  const tabs = getTabsForTool(drawing.type)
  const [activeTab, setActiveTab] = useState<TabId>(tabs[0]!)

  // Local state for all tabs
  const [color, setColor] = useState(drawing.style.color)
  const [lineWidth, setLineWidth] = useState(drawing.style.lineWidth)
  const [lineStyle, setLineStyle] = useState(drawing.style.lineStyle)
  const [showLabels, setShowLabels] = useState(drawing.style.showLabels)
  const [textColor, setTextColor] = useState(drawing.style.color)
  const [fontSize, setFontSize] = useState(drawing.style.fontSize)
  const [bold, setBold] = useState(drawing.style.fontBold)
  const [italic, setItalic] = useState(drawing.style.fontItalic)
  const [text, setText] = useState(drawing.label ?? "")

  function handleOk() {
    onUpdate({
      style: {
        ...drawing.style,
        color,
        lineWidth,
        lineStyle,
        showLabels,
        fontSize,
        fontBold: bold,
        fontItalic: italic,
      },
      label: text || drawing.label,
    })
    onClose()
  }

  function renderTab() {
    switch (activeTab) {
      case "style":
        return (
          <StyleTab
            drawing={drawing}
            color={color} setColor={setColor}
            lineWidth={lineWidth} setLineWidth={setLineWidth}
            lineStyle={lineStyle} setLineStyle={setLineStyle}
            showLabels={showLabels} setShowLabels={setShowLabels}
          />
        )
      case "text":
        return (
          <TextTab
            textColor={textColor} setTextColor={setTextColor}
            fontSize={fontSize} setFontSize={setFontSize}
            bold={bold} setBold={setBold}
            italic={italic} setItalic={setItalic}
            text={text} setText={setText}
          />
        )
      case "coordinates":
        return <CoordinatesTab drawing={drawing} />
      case "visibility":
        return <VisibilityTab />
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Dialog */}
      <div
        className={cn(
          "fixed z-[201] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          "bg-card border border-[var(--border)] flex flex-col shadow-2xl w-[min(380px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto",
          className,
        )}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold font-mono text-foreground">
              {TOOL_LABEL[drawing.type]}
            </h2>
            <Pencil className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
          </div>
          <button onClick={onClose} className="text-[var(--fg-muted)] hover:text-foreground transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] px-5">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-2.5 text-xs font-mono transition-colors relative cursor-pointer",
                activeTab === tab
                  ? "text-foreground"
                  : "text-[var(--fg-muted)] hover:text-foreground",
              )}
            >
              {TAB_LABEL[tab]}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <ScrollArea className="h-[280px]">
          <div className="px-5 py-1">
            {renderTab()}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
          <button className="flex items-center gap-1 h-8 px-3 border border-[var(--border)] text-xs font-mono text-foreground hover:bg-muted transition-colors cursor-pointer">
            Template
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-8 px-4 border border-[var(--border)] text-xs font-mono text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleOk}
              className="h-8 px-5 bg-accent text-white text-xs font-mono font-medium hover:bg-accent/90 transition-colors cursor-pointer"
            >
              Ok
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
