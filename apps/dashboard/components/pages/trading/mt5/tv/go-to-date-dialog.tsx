import { useState } from "react";
import { X, CalendarDays } from "lucide-react";

interface GoToDateDialogProps {
  open: boolean;
  onClose: () => void;
  onGoTo: (date: Date) => void;
}

export function GoToDateDialog({ open, onClose, onGoTo }: GoToDateDialogProps) {
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [timeStr, setTimeStr] = useState("09:00");

  if (!open) return null;

  const handleGo = () => {
    const date = new Date(`${dateStr}T${timeStr}:00`);
    if (!isNaN(date.getTime())) {
      onGoTo(date);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleGo();
    if (e.key === "Escape") onClose();
  };

  // Quick presets
  const presets = [
    { label: "Today", fn: () => new Date() },
    { label: "1W ago", fn: () => { const d = new Date(); d.setDate(d.getDate() - 7); return d; } },
    { label: "1M ago", fn: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; } },
    { label: "3M ago", fn: () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d; } },
  ];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-[var(--border)] rounded-sm shadow-2xl w-[min(320px,calc(100vw-24px))] animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold font-mono text-foreground">Go to Date</span>
          </div>
          <button onClick={onClose} className="text-[var(--fg-muted)] hover:text-foreground transition-colors cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="flex-1 h-8 px-2 text-xs font-mono bg-background border border-[var(--border)] text-foreground rounded-sm outline-none focus:border-accent cursor-pointer"
              autoFocus
            />
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="w-24 h-8 px-2 text-xs font-mono bg-background border border-[var(--border)] text-foreground rounded-sm outline-none focus:border-accent cursor-pointer"
            />
          </div>

          {/* Quick presets */}
          <div className="flex gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  const d = p.fn();
                  onGoTo(d);
                  onClose();
                }}
                className="flex-1 h-7 text-[10px] font-bold font-mono border border-[var(--border)] text-[var(--fg-muted)] hover:text-foreground hover:border-foreground rounded-sm transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="h-7 px-3 text-xs font-mono font-bold border border-[var(--border)] text-foreground hover:bg-muted rounded-sm cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGo}
            className="h-7 px-4 text-xs font-mono font-bold bg-foreground text-background hover:opacity-90 rounded-sm cursor-pointer transition-colors"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}
