"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Notice } from "./mt-shared";

/**
 * Live ticks from metatrader-quote-server (WebSocket): "connected" with the
 * symbol list, then "tick" messages with bid/ask/spread/volume, and
 * "error" per symbol. The browser connects straight to the server.
 */

interface Tick {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  volume: number;
  time: string;
  dir: -1 | 0 | 1;
}

type QuoteMessage =
  | { type: "connected"; symbols: string[]; poll_interval_ms: number }
  | ({ type: "tick" } & Omit<Tick, "dir">)
  | { type: "error"; symbol: string; message: string };

const RETRY_MS = 3000;

export function MtQuotes({ url }: { url: string | null }) {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [symbols, setSymbols] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"off" | "connecting" | "open" | "closed">(
    "off"
  );
  const [on, setOn] = useState(true);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!(url && on)) {
      return;
    }
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const connect = () => {
      setState("connecting");
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => setState("open");
      ws.onclose = () => {
        setState("closed");
        if (!stopped) {
          retry = setTimeout(connect, RETRY_MS);
        }
      };
      ws.onmessage = (e) => {
        let msg: QuoteMessage;
        try {
          msg = JSON.parse(String(e.data)) as QuoteMessage;
        } catch {
          return;
        }
        if (msg.type === "connected") {
          setSymbols(msg.symbols);
        } else if (msg.type === "error") {
          setErrors((prev) => ({ ...prev, [msg.symbol]: msg.message }));
        } else if (msg.type === "tick") {
          setTicks((prev) => {
            const old = prev[msg.symbol];
            const dir = old ? Math.sign(msg.bid - old.bid) : 0;
            return {
              ...prev,
              [msg.symbol]: { ...msg, dir: dir as Tick["dir"] },
            };
          });
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retry) {
        clearTimeout(retry);
      }
      socket.current?.close();
      setState("off");
    };
  }, [url, on]);

  if (!url) {
    return (
      <Notice>
        Para cotações ao vivo, rode o metatrader-quote-server no PC/VPS e
        indique o endereço wss:// em Conectores → MetaTrader.
      </Notice>
    );
  }
  const rows = (symbols.length ? symbols : Object.keys(ticks)).map(
    (s) => [s, ticks[s]] as const
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span
            className={cn(
              "mr-2 inline-block size-2 rounded-full",
              state === "open" ? "bg-success" : "bg-muted-foreground"
            )}
          />
          {state === "open" ? "Ligado" : null}
          {state === "connecting" ? "A ligar…" : null}
          {state === "closed" ? "Desligado, a tentar de novo…" : null}
          {state === "off" ? "Parado" : null}
        </p>
        <Button onClick={() => setOn((v) => !v)} size="sm" variant="outline">
          {on ? "Parar" : "Ligar"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              {["Símbolo", "Bid", "Ask", "Spread", "Volume", "Hora"].map(
                (h) => (
                  <th className="px-2 py-1.5 text-left" key={h}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(([s, t]) => (
              <tr className="border-t" key={s}>
                <td className="px-2 py-1.5 font-semibold">{s}</td>
                <td
                  className={cn(
                    "px-2 py-1.5 tabular-nums",
                    t?.dir === 1 && "text-success",
                    t?.dir === -1 && "text-destructive"
                  )}
                >
                  {t?.bid ?? "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{t?.ask ?? "—"}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {t ? Number(t.spread.toPrecision(4)) : "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{t?.volume ?? "—"}</td>
                <td className="px-2 py-1.5 text-muted-foreground text-xs">
                  {t
                    ? new Date(t.time).toLocaleTimeString("pt-BR")
                    : (errors[s] ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
