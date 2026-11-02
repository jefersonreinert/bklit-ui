"use client";

import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { appLocale } from "@/lib/i18n/locale";
import {
  type Cell,
  formatMoney,
  isEmptyValue,
  type Table,
  toTable,
} from "@/lib/metatrader/data";
import { cn } from "@/lib/utils";
import {
  TelegramProvider,
  Notice as TgNotice,
} from "../telegram/telegram-shared";

/** Convex area for the MetaTrader UI (same provider as Telegram). */
export const ConvexArea = TelegramProvider;
export const Notice = TgNotice;

export type MtStatus = NonNullable<
  FunctionReturnType<typeof api.metatrader.status>
>;
export type MtOutput = FunctionReturnType<typeof api.metatrader.call>;

/** undefined while loading, null without the panel's access code. */
export const useMtStatus = () => useQuery(api.metatrader.status, {});

const failed = (err: unknown): MtOutput => ({
  ok: false,
  value: null,
  message: err instanceof Error ? err.message : "Falhou.",
  ms: 0,
});

/** Runs one metatrader-mcp-server tool through Convex, with busy state. */
export function useMtCall() {
  const call = useAction(api.metatrader.call);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (name: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      try {
        return await call({ name, args });
      } catch (err) {
        return failed(err);
      } finally {
        setBusy(false);
      }
    },
    [call]
  );
  return { run, busy };
}

export function useMtMany() {
  const many = useAction(api.metatrader.callMany);
  return useCallback(
    async (calls: { name: string; args?: Record<string, unknown> }[]) => {
      try {
        return await many({ calls });
      } catch (err) {
        return calls.map(() => failed(err));
      }
    },
    [many]
  );
}

const MONEY_COLUMNS = new Set([
  "profit",
  "balance",
  "equity",
  "margin",
  "free_margin",
  "commission",
  "swap",
  "fee",
]);

function display(column: string, v: Cell) {
  if (v === null || v === undefined) {
    return "—";
  }
  if (typeof v === "number" && MONEY_COLUMNS.has(column)) {
    return formatMoney(v);
  }
  if (typeof v === "boolean") {
    return v ? "sim" : "não";
  }
  return String(v);
}

function tone(column: string, v: Cell) {
  if (column !== "profit" || typeof v !== "number" || v === 0) {
    return "";
  }
  return v > 0 ? "text-success" : "text-destructive";
}

/** A compact table with an optional action column (close, cancel…). */
export function DataTable({
  table,
  empty = "Sem registos.",
  actions,
  maxRows,
}: {
  table: Table;
  empty?: string;
  actions?: (row: Record<string, Cell>) => ReactNode;
  maxRows?: number;
}) {
  if (table.rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  const rows = maxRows ? table.rows.slice(-maxRows) : table.rows;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground text-xs">
          <tr>
            {table.columns.map((c) => (
              <th className="whitespace-nowrap px-2 py-1.5 text-left" key={c}>
                {c}
              </th>
            ))}
            {actions ? <th className="px-2 py-1.5" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr className="border-t" key={`${r.id ?? r.ticket ?? ""}-${i}`}>
              {table.columns.map((c) => (
                <td
                  className={cn(
                    "whitespace-nowrap px-2 py-1.5 tabular-nums",
                    tone(c, r[c] ?? null)
                  )}
                  key={c}
                >
                  {display(c, r[c] ?? null)}
                </td>
              ))}
              {actions ? (
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {actions(r)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A dict as label/value rows. */
export function RecordView({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border p-3 text-sm">
      {Object.entries(value).map(([k, v]) => (
        <div className="contents" key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-all font-mono text-xs tabular-nums">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Any tool output: message, table, record or raw text. */
export function OutputView({ out }: { out: MtOutput }) {
  const table = toTable(out.value);
  const isRecord =
    out.value !== null &&
    typeof out.value === "object" &&
    !Array.isArray(out.value);
  return (
    <div className="flex flex-col gap-2">
      {out.message ? (
        <p
          className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            out.ok
              ? "border-success/40 bg-success/10"
              : "border-destructive/40 bg-destructive/5 text-destructive"
          )}
        >
          {out.message}
        </p>
      ) : null}
      {table ? <DataTable table={table} /> : null}
      {!table && isRecord ? (
        <RecordView value={out.value as Record<string, unknown>} />
      ) : null}
      {!(table || isRecord) && out.ok && isEmptyValue(out.value) ? (
        <p className="text-muted-foreground text-sm">Sem registos.</p>
      ) : null}
      {table || isRecord || isEmptyValue(out.value) ? null : (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/30 p-3 text-xs">
          {String(out.value)}
        </pre>
      )}
      <p className="text-muted-foreground text-xs">{out.ms} ms</p>
    </div>
  );
}

/** Two taps for anything that touches the account. */
export function ConfirmButton({
  label,
  confirm,
  onConfirm,
  disabled,
  size = "sm",
  variant = "outline",
}: {
  label: ReactNode;
  confirm: string;
  onConfirm: () => void;
  disabled?: boolean;
  size?: "sm" | "xs" | "default";
  variant?: "outline" | "destructive" | "default";
}) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      disabled={disabled}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      onMouseLeave={() => setArmed(false)}
      size={size}
      variant={armed ? "destructive" : variant}
    >
      {armed ? confirm : label}
    </Button>
  );
}

export const when = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString(appLocale(), {
        dateStyle: "short",
        timeStyle: "medium",
      })
    : "—";
