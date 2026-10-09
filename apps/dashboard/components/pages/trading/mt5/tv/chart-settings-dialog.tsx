"use client"

import { useState } from "react"
import { X, ChevronDown } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ChartSettings } from "../engine/ChartEngine"

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "symbol" | "status-line" | "scales" | "canvas" | "trading" | "alerts" | "events"

const TABS: { id: Tab; label: string }[] = [
  { id: "symbol",      label: "Symbol" },
  { id: "status-line", label: "Status line" },
  { id: "scales",      label: "Scales and lines" },
  { id: "canvas",      label: "Canvas" },
  { id: "trading",     label: "Trading" },
  { id: "alerts",      label: "Alerts" },
  { id: "events",      label: "Events" },
]

// ─── Small UI atoms ──────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-xs font-mono text-foreground">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-mono text-[var(--fg-muted)] uppercase tracking-widest pt-4 pb-1">
      {children}
    </p>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "w-4 h-4 border border-[var(--border)] flex items-center justify-center transition-colors cursor-pointer",
        checked ? "bg-foreground" : "bg-transparent"
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

function Select({ value, options, onChange }: { value: string; options: string[], onChange?: (v: string) => void }) {
  return (
    <div className="relative flex items-center">
      <select 
        value={value} 
        onChange={(e) => onChange?.(e.target.value)}
        className="appearance-none flex items-center gap-1.5 h-7 px-2.5 border border-[var(--border)] bg-transparent text-xs font-mono text-foreground hover:bg-muted/50 transition-colors min-w-[140px] pr-8 cursor-pointer outline-none"
      >
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <ChevronDown className="w-3 h-3 text-[var(--fg-muted)] absolute right-2.5 pointer-events-none" />
    </div>
  )
}

function ColorInput({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  return (
    <input 
      type="color" 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      className="w-7 h-7 p-0 border border-[var(--border)] bg-transparent cursor-pointer rounded-sm overflow-hidden block"
    />
  )
}

// ─── Tab content ─────────────────────────────────────────────────────────────

function SymbolTab({ settings, onUpdate }: { settings: ChartSettings, onUpdate: (s: Partial<ChartSettings>) => void }) {
  const [bodyUp, setBodyUp] = useState(true)
  const [bordersUp, setBordersUp] = useState(true)
  const [wickUp, setWickUp] = useState(true)
  return (
    <div>
      <SectionLabel>Candles</SectionLabel>
      <Row label="Color bars based on previous close">
        <Checkbox checked={false} onChange={() => {}} />
      </Row>
      <div className="py-1 space-y-2">
        <div className="flex items-center gap-3">
          <Checkbox checked={bodyUp} onChange={setBodyUp} />
          <span className="text-xs font-mono text-foreground w-16">Body</span>
          <ColorInput value={settings.bodyUp} onChange={(v) => onUpdate({ bodyUp: v })} />
          <ColorInput value={settings.bodyDown} onChange={(v) => onUpdate({ bodyDown: v })} />
        </div>
        <div className="flex items-center gap-3">
          <Checkbox checked={bordersUp} onChange={setBordersUp} />
          <span className="text-xs font-mono text-foreground w-16">Borders</span>
          <ColorInput value={settings.borderUp || settings.bodyUp} onChange={(v) => onUpdate({ borderUp: v })} />
          <ColorInput value={settings.borderDown || settings.bodyDown} onChange={(v) => onUpdate({ borderDown: v })} />
        </div>
        <div className="flex items-center gap-3">
          <Checkbox checked={wickUp} onChange={setWickUp} />
          <span className="text-xs font-mono text-foreground w-16">Wick</span>
          <ColorInput value={settings.wickUp || settings.bodyUp} onChange={(v) => onUpdate({ wickUp: v })} />
          <ColorInput value={settings.wickDown || settings.bodyDown} onChange={(v) => onUpdate({ wickDown: v })} />
        </div>
      </div>
      <SectionLabel>Data Modification</SectionLabel>
      <Row label="Precision">
        <Select value={settings.precision < 0 ? "Default" : settings.precision.toString()} options={["Default", "0", "1", "2", "3", "4", "5", "6", "7", "8"]} onChange={(v) => { const n = parseInt(v); onUpdate({ precision: Number.isNaN(n) ? -1 : n }) }} />
      </Row>
      <Row label="Timezone">
        <Select value={settings.timezone} options={[
          "Local",
          "(UTC+0) Lisbon",
          "(UTC-5) New York",
          "(UTC-6) Chicago",
          "(UTC-3) Sao Paulo",
          "(UTC+0) London",
          "(UTC+9) Tokyo",
        ]} onChange={(v) => onUpdate({ timezone: v })} />
      </Row>
    </div>
  )
}

function StatusLineTab() {
  const [logo, setLogo] = useState(true)
  const [title, setTitle] = useState(true)
  const [openMarket, setOpenMarket] = useState(true)
  const [chartValues, setChartValues] = useState(true)
  const [barChange, setBarChange] = useState(true)
  const [volume, setVolume] = useState(false)
  const [lastDay, setLastDay] = useState(false)
  const [titles, setTitles] = useState(true)
  const [inputs, setInputs] = useState(true)
  const [values, setValues] = useState(true)
  return (
    <div>
      <SectionLabel>Symbol</SectionLabel>
      {[
        { label: "Logo",                  c: logo,        s: setLogo },
        { label: "Title",                 c: title,       s: setTitle },
        { label: "Open market status",    c: openMarket,  s: setOpenMarket },
        { label: "Chart values",          c: chartValues, s: setChartValues },
        { label: "Bar change values",     c: barChange,   s: setBarChange },
        { label: "Volume",                c: volume,      s: setVolume },
        { label: "Last day change values",c: lastDay,     s: setLastDay },
      ].map(({ label, c, s }) => (
        <Row key={label} label={label}><Checkbox checked={c} onChange={s} /></Row>
      ))}
      <SectionLabel>Indicators</SectionLabel>
      {[
        { label: "Titles",  c: titles, s: setTitles },
        { label: "Inputs",  c: inputs, s: setInputs },
        { label: "Values",  c: values, s: setValues },
      ].map(({ label, c, s }) => (
        <Row key={label} label={label}><Checkbox checked={c} onChange={s} /></Row>
      ))}
    </div>
  )
}

function ScalesTab() {
  return (
    <div>
      <SectionLabel>Price Scale</SectionLabel>
      <Row label="Currency and Unit">
        <Select value="Always visible" options={["Always visible", "Never", "On hover"]} />
      </Row>
      <Row label="Scale modes (A and L)">
        <Select value="Visible on mouse over" options={["Visible on mouse over", "Always", "Never"]} />
      </Row>
      <Row label="Lock price to bar ratio">
        <Checkbox checked={false} onChange={() => {}} />
      </Row>
      <Row label="Scales placement">
        <Select value="Auto" options={["Auto", "Left", "Right"]} />
      </Row>
      <SectionLabel>Price Labels & Lines</SectionLabel>
      {["No overlapping labels", "Plus button", "Countdown to bar close"].map((l) => (
        <Row key={l} label={l}><Checkbox checked={true} onChange={() => {}} /></Row>
      ))}
      <SectionLabel>Time Scale</SectionLabel>
      <Row label="Day of week on labels"><Checkbox checked={true} onChange={() => {}} /></Row>
      <Row label="Date format">
        <Select value="Mon 29 Sep '97" options={["Mon 29 Sep '97", "29 Sep 97", "09/29/97"]} />
      </Row>
      <Row label="Time hours format">
        <Select value="24-hours" options={["24-hours", "12-hours"]} />
      </Row>
    </div>
  )
}

function CanvasTab({ settings, onUpdate }: { settings: ChartSettings, onUpdate: (s: Partial<ChartSettings>) => void }) {
  return (
    <div>
      <SectionLabel>Chart Basic Styles</SectionLabel>
      <Row label="Background">
        <Select value="Solid" options={["Solid", "Gradient"]} onChange={() => {}} />
        <ColorInput value={settings.background} onChange={(v) => onUpdate({ background: v })} />
      </Row>
      <Row label="Grid lines">
        <Select value={settings.gridEnabled ? "Both" : "None"} options={["None", "Both", "Horizontal", "Vertical"]} onChange={(v) => onUpdate({ gridEnabled: v !== "None" })} />
        <ColorInput value={settings.gridColor} onChange={(v) => onUpdate({ gridColor: v })} />
      </Row>
      <Row label="Crosshair">
        <div className="flex items-center gap-1 h-7 px-2 border border-[var(--border)] cursor-pointer">
          <div className="w-4 h-4 bg-muted" />
          <span className="text-[10px] font-mono text-[var(--fg-muted)]">----</span>
        </div>
      </Row>
      <SectionLabel>Scales</SectionLabel>
      <Row label="Text">
        <div className="w-7 h-7 border border-[var(--border)] bg-muted cursor-pointer" />
        <Select value="12" options={["10", "11", "12", "13", "14"]} />
      </Row>
      <SectionLabel>Margins</SectionLabel>
      <Row label="Top">
        <div className="flex items-center gap-1">
          <input defaultValue="10" className="w-14 h-7 border border-[var(--border)] bg-transparent px-2 text-xs font-mono text-foreground text-right outline-none" />
          <span className="text-xs font-mono text-[var(--fg-muted)]">%</span>
        </div>
      </Row>
      <Row label="Bottom">
        <div className="flex items-center gap-1">
          <input defaultValue="8" className="w-14 h-7 border border-[var(--border)] bg-transparent px-2 text-xs font-mono text-foreground text-right outline-none" />
          <span className="text-xs font-mono text-[var(--fg-muted)]">%</span>
        </div>
      </Row>
      <Row label="Right">
        <div className="flex items-center gap-1">
          <input defaultValue="10" className="w-14 h-7 border border-[var(--border)] bg-transparent px-2 text-xs font-mono text-foreground text-right outline-none" />
          <span className="text-xs font-mono text-[var(--fg-muted)]">bars</span>
        </div>
      </Row>
    </div>
  )
}

function TradingTab() {
  const [buySell, setBuySell] = useState(true)
  const [oneClick, setOneClick] = useState(false)
  const [sound, setSound] = useState(false)
  const [positions, setPositions] = useState(true)
  const [pnl, setPnl] = useState(true)
  const [execMarks, setExecMarks] = useState(true)
  return (
    <div>
      <SectionLabel>General</SectionLabel>
      <Row label="Buy/sell buttons"><Checkbox checked={buySell} onChange={setBuySell} /></Row>
      <p className="text-[10px] font-mono text-[var(--fg-muted)]/60 -mt-1 mb-2">
        Displays buy and sell buttons directly on the chart
      </p>
      <Row label="One-click trading"><Checkbox checked={oneClick} onChange={setOneClick} /></Row>
      <p className="text-[10px] font-mono text-[var(--fg-muted)]/60 -mt-1 mb-2">
        Instantly place, edit, cancel orders or close positions without confirmation
      </p>
      <Row label="Execution sound"><Checkbox checked={sound} onChange={setSound} /></Row>
      <SectionLabel>Appearance</SectionLabel>
      <Row label="Positions and orders"><Checkbox checked={positions} onChange={setPositions} /></Row>
      <Row label="Profit and loss value"><Checkbox checked={pnl} onChange={setPnl} /></Row>
      <Row label="Execution marks"><Checkbox checked={execMarks} onChange={setExecMarks} /></Row>
    </div>
  )
}

function AlertsTab() {
  const [alertLines, setAlertLines] = useState(true)
  const [onlyActive, setOnlyActive] = useState(true)
  const [alertVol, setAlertVol] = useState(true)
  const [autoHide, setAutoHide] = useState(true)
  return (
    <div>
      <SectionLabel>Chart Line Visibility</SectionLabel>
      <Row label="Alert lines"><Checkbox checked={alertLines} onChange={setAlertLines} /></Row>
      <Row label="Only active alerts"><Checkbox checked={onlyActive} onChange={setOnlyActive} /></Row>
      <SectionLabel>Notifications</SectionLabel>
      <Row label="Alert volume"><Checkbox checked={alertVol} onChange={setAlertVol} /></Row>
      <Row label="Automatically hide toasts"><Checkbox checked={autoHide} onChange={setAutoHide} /></Row>
    </div>
  )
}

function EventsTab() {
  const [ideas, setIdeas] = useState(false)
  const [breaks, setBreaks] = useState(false)
  const [economic, setEconomic] = useState(true)
  const [news, setNews] = useState(true)
  const [notif, setNotif] = useState(false)
  return (
    <div>
      <SectionLabel>Events</SectionLabel>
      <Row label="Ideas"><Checkbox checked={ideas} onChange={setIdeas} /></Row>
      <Row label="Session breaks"><Checkbox checked={breaks} onChange={setBreaks} /></Row>
      <Row label="Economic events"><Checkbox checked={economic} onChange={setEconomic} /></Row>
      {economic && (
        <div className="ml-6">
          <Row label="Only future events"><Checkbox checked={true} onChange={() => {}} /></Row>
          <Row label="Events breaks"><Checkbox checked={false} onChange={() => {}} /></Row>
        </div>
      )}
      <Row label="Latest news"><Checkbox checked={news} onChange={setNews} /></Row>
      <Row label="News notification"><Checkbox checked={notif} onChange={setNotif} /></Row>
    </div>
  )
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export interface ChartSettingsDialogProps {
  open?: boolean
  onClose?: () => void
  defaultTab?: Tab
  className?: string
  settings: ChartSettings
  onUpdate: (s: Partial<ChartSettings>) => void
}

export function ChartSettingsDialog({
  open = true,
  onClose,
  defaultTab = "symbol",
  className,
  settings,
  onUpdate
}: ChartSettingsDialogProps) {
  const [tab, setTab] = useState<Tab>(defaultTab)

  if (!open) return null

  const renderContent = () => {
    switch (tab) {
      case "symbol":      return <SymbolTab settings={settings} onUpdate={onUpdate} />;
      case "status-line": return <StatusLineTab />;
      case "scales":      return <ScalesTab />;
      case "canvas":      return <CanvasTab settings={settings} onUpdate={onUpdate} />;
      case "trading":     return <TradingTab />;
      case "alerts":      return <AlertsTab />;
      case "events":      return <EventsTab />;
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-hidden">
      <div className={cn("bg-card border border-[var(--border)] w-full max-w-[680px] max-h-[calc(100dvh-2rem)] flex flex-col shadow-2xl rounded-sm animate-in fade-in zoom-in duration-200", className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold font-mono text-foreground">Settings</h2>
          <button onClick={onClose}
            className="text-[var(--fg-muted)] hover:text-foreground transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
          {/* Sidebar nav */}
          <nav className="flex sm:block w-full sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-[var(--border)] sm:py-2 overflow-x-auto sm:overflow-y-auto no-scrollbar">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  "whitespace-nowrap sm:w-full text-left px-4 py-2.5 text-xs font-mono transition-colors cursor-pointer",
                  tab === t.id
                    ? "bg-muted text-foreground font-medium"
                    : "text-[var(--fg-muted)] hover:text-foreground hover:bg-muted/50"
                )}>
                {t.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <ScrollArea className="h-[55dvh] sm:h-[440px] flex-1 bg-background">
            <div className="px-6 py-2">
              {renderContent()}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
          <button className="flex items-center gap-1 h-8 px-3 border border-[var(--border)] text-xs font-mono text-foreground hover:bg-muted transition-colors cursor-pointer">
            Template <ChevronDown className="w-3 h-3" />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="h-8 px-4 border border-[var(--border)] text-xs font-mono text-foreground hover:bg-muted transition-colors cursor-pointer">
              Cancel
            </button>
            <button onClick={onClose} className="h-8 px-5 bg-foreground text-background text-xs font-mono font-medium hover:bg-foreground/90 transition-colors cursor-pointer">
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
