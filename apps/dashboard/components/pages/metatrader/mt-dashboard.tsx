"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/lib/icons";
import {
  type Cell,
  formatMoney,
  formatSigned,
  pick,
  sumColumn,
  type Table,
  toTable,
} from "@/lib/metatrader/data";
import { cn } from "@/lib/utils";
import {
  ConfirmButton,
  DataTable,
  type MtOutput,
  Notice,
  OutputView,
  useMtCall,
  useMtMany,
} from "./mt-shared";

/**
 * The skill's "Account Dashboard": get_account_info, get_all_positions and
 * get_all_pending_orders together, with every close/cancel/modify tool on
 * the rows and the bulk tools below.
 */

interface Account {
  balance?: number;
  equity?: number;
  profit?: number;
  margin_level?: number;
  free_margin?: number;
  account_type?: string;
  leverage?: number;
  currency?: string;
}

const REFRESH_MS = 15_000;
const EMPTY: Table = { columns: [], rows: [] };

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("font-semibold text-lg tabular-nums", className)}>
        {value}
      </p>
    </div>
  );
}

function AccountCards({ a }: { a: Account }) {
  const cur = a.currency ?? "";
  const profit = a.profit ?? 0;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Saldo" value={formatMoney(a.balance, cur)} />
      <Stat label="Capital (equity)" value={formatMoney(a.equity, cur)} />
      <Stat
        className={cn(
          profit > 0 && "text-success",
          profit < 0 && "text-destructive"
        )}
        label="Lucro aberto"
        value={formatSigned(profit, cur)}
      />
      <Stat label="Margem livre" value={formatMoney(a.free_margin, cur)} />
      <Stat
        label="Nível de margem"
        value={a.margin_level ? `${formatMoney(a.margin_level)}%` : "—"}
      />
      <Stat label="Alavancagem" value={a.leverage ? `1:${a.leverage}` : "—"} />
      <Stat label="Tipo" value={a.account_type ?? "—"} />
      <Stat label="Moeda" value={cur || "—"} />
    </div>
  );
}

/** Inline SL/TP (and price for pending orders) editor for one row. */
function ModifyRow({
  id,
  pending,
  onDone,
}: {
  id: Cell;
  pending: boolean;
  onDone: (out: MtOutput) => void;
}) {
  const { run, busy } = useMtCall();
  const [price, setPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {pending ? (
        <Input
          aria-label="Preço"
          className="h-7 w-24"
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Preço"
          value={price}
        />
      ) : null}
      <Input
        aria-label="Stop loss"
        className="h-7 w-24"
        onChange={(e) => setSl(e.target.value)}
        placeholder="SL"
        value={sl}
      />
      <Input
        aria-label="Take profit"
        className="h-7 w-24"
        onChange={(e) => setTp(e.target.value)}
        placeholder="TP"
        value={tp}
      />
      <ConfirmButton
        confirm="Confirmar"
        disabled={busy || !(price || sl || tp)}
        label="Salvar"
        onConfirm={async () =>
          onDone(
            await run(pending ? "modify_pending_order" : "modify_position", {
              id,
              ...(pending ? { price } : {}),
              stop_loss: sl,
              take_profit: tp,
            })
          )
        }
        size="xs"
      />
    </div>
  );
}

function RowActions({
  row,
  pending,
  idColumn,
  onResult,
}: {
  row: Record<string, Cell>;
  pending: boolean;
  idColumn: string;
  onResult: (out: MtOutput) => void;
}) {
  const { run, busy } = useMtCall();
  const [editing, setEditing] = useState(false);
  const id = row[idColumn] ?? null;
  if (editing) {
    return (
      <ModifyRow
        id={id}
        onDone={(out) => {
          setEditing(false);
          onResult(out);
        }}
        pending={pending}
      />
    );
  }
  return (
    <div className="flex justify-end gap-1">
      <Button onClick={() => setEditing(true)} size="xs" variant="ghost">
        SL/TP
      </Button>
      <ConfirmButton
        confirm={pending ? "Cancelar?" : "Fechar?"}
        disabled={busy || id === null}
        label={pending ? "Cancelar" : "Fechar"}
        onConfirm={async () =>
          onResult(
            await run(pending ? "cancel_pending_order" : "close_position", {
              id,
            })
          )
        }
        size="xs"
      />
    </div>
  );
}

function BulkActions({
  pending,
  onResult,
}: {
  pending: boolean;
  onResult: (out: MtOutput) => void;
}) {
  const { run, busy } = useMtCall();
  const [symbol, setSymbol] = useState("");
  const go = async (name: string, args: Record<string, unknown> = {}) =>
    onResult(await run(name, args));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending ? (
        <ConfirmButton
          confirm="Cancelar todas?"
          disabled={busy}
          label="Cancelar todas"
          onConfirm={() => go("cancel_all_pending_orders")}
        />
      ) : (
        <>
          <ConfirmButton
            confirm="Fechar todas?"
            disabled={busy}
            label="Fechar todas"
            onConfirm={() => go("close_all_positions")}
          />
          <ConfirmButton
            confirm="Fechar lucrativas?"
            disabled={busy}
            label="Fechar lucrativas"
            onConfirm={() => go("close_all_profitable_positions")}
          />
          <ConfirmButton
            confirm="Fechar perdedoras?"
            disabled={busy}
            label="Fechar perdedoras"
            onConfirm={() => go("close_all_losing_positions")}
          />
        </>
      )}
      <span className="flex items-center gap-1">
        <Input
          aria-label="Símbolo"
          className="h-8 w-28"
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Símbolo"
          value={symbol}
        />
        <ConfirmButton
          confirm="Confirmar"
          disabled={busy || !symbol}
          label={pending ? "Cancelar do símbolo" : "Fechar do símbolo"}
          onConfirm={() =>
            go(
              pending
                ? "cancel_pending_orders_by_symbol"
                : "close_all_positions_by_symbol",
              { symbol }
            )
          }
        />
      </span>
    </div>
  );
}

function Section({
  title,
  table,
  pending,
  currency,
  onResult,
}: {
  title: string;
  table: Table;
  pending: boolean;
  currency: string;
  onResult: (out: MtOutput) => void;
}) {
  const idColumn = pick(table, "id", "ticket", "order") ?? "id";
  const profit = pick(table, "profit");
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {title} ({table.rows.length})
        </h3>
        {profit && table.rows.length > 0 ? (
          <span
            className={cn(
              "text-sm tabular-nums",
              sumColumn(table, profit) >= 0
                ? "text-success"
                : "text-destructive"
            )}
          >
            Total: {formatSigned(sumColumn(table, profit), currency)}
          </span>
        ) : null}
      </div>
      <DataTable
        actions={(row) => (
          <RowActions
            idColumn={idColumn}
            onResult={onResult}
            pending={pending}
            row={row}
          />
        )}
        empty={pending ? "Sem ordens pendentes." : "Sem posições abertas."}
        table={table}
      />
      <BulkActions onResult={onResult} pending={pending} />
    </section>
  );
}

export function MtDashboard({ canTrade }: { canTrade: boolean }) {
  const many = useMtMany();
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Table>(EMPTY);
  const [pendingOrders, setPendingOrders] = useState<Table>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<MtOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);

  const load = useCallback(async () => {
    const [a, p, o] = await many([
      { name: "get_account_info" },
      { name: "get_all_positions" },
      { name: "get_all_pending_orders" },
    ]);
    setLoading(false);
    const failed = [a, p, o].find((x) => x && !x.ok);
    setError(failed?.message ?? null);
    if (a?.ok) {
      setAccount(a.value as Account);
    }
    if (p?.ok) {
      setPositions(toTable(p.value) ?? EMPTY);
    }
    if (o?.ok) {
      setPendingOrders(toTable(o.value) ?? EMPTY);
    }
  }, [many]);

  useEffect(() => {
    load();
    if (!auto) {
      return;
    }
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, auto]);

  const onResult = (out: MtOutput) => {
    setLast(out);
    load();
  };
  const currency = account?.currency ?? "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">Visão geral da conta</h2>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setAuto((v) => !v)}
            size="sm"
            variant={auto ? "secondary" : "ghost"}
          >
            {auto ? "Atualização automática ligada" : "Atualização automática"}
          </Button>
          <Button onClick={load} size="sm" variant="outline">
            <Icon className="size-4" name="IconArrowRotateClockwise" />
            Atualizar
          </Button>
        </div>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {canTrade ? null : (
        <Notice>
          Ordens, fechos e cancelamentos estão desligados. Ligue "Permitir
          ordens pelo painel" em Conectores → MetaTrader.
        </Notice>
      )}
      {loading && !account ? (
        <p className="text-muted-foreground text-sm">A ligar ao MT5…</p>
      ) : null}
      {account ? <AccountCards a={account} /> : null}
      {last ? <OutputView out={last} /> : null}
      <Section
        currency={currency}
        onResult={onResult}
        pending={false}
        table={positions}
        title="Posições abertas"
      />
      <Section
        currency={currency}
        onResult={onResult}
        pending
        table={pendingOrders}
        title="Ordens pendentes"
      />
    </div>
  );
}
