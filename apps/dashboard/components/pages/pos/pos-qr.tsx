"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { encode } from "uqr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/lib/icons";
import type { PosOrder } from "@/lib/pos/types";

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api`;
const POLL_MS = 3000;

/** Crisp SVG QR code (quiet zone included). */
export function QrCode({
  value,
  size = 232,
  label = "QR code de pagamento",
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const { data, size: n } = encode(value, { ecc: "M", border: 2 });
  let path = "";
  data.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) {
        path += `M${x} ${y}h1v1h-1z`;
      }
    });
  });
  return (
    <svg
      aria-label={label}
      className="rounded-2xl bg-white p-1"
      height={size}
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${n} ${n}`}
      width={size}
    >
      <path d={path} fill="#111" />
    </svg>
  );
}

/** Whether the server has a SumUp API key (shows the QR method). */
export function useSumupQrAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    fetch(`${API}/pos/checkout/`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((b: { available?: boolean }) => setAvailable(Boolean(b.available)))
      .catch(() => setAvailable(false));
  }, []);
  return available;
}

type State =
  | { kind: "loading" }
  | { kind: "locked" }
  | { kind: "error"; message: string }
  | { kind: "ready"; id: string; url: string }
  | { kind: "expired" };

function Unlock({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API}/whatsapp/unlock/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    if (res?.ok) {
      onDone();
    } else {
      setError("Código incorreto.");
    }
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <p className="text-center text-muted-foreground text-sm">
        Digite o código de acesso do painel (o mesmo do WhatsApp) para cobrar
        pela SumUp neste aparelho.
      </p>
      <Input
        aria-label="Código de acesso"
        autoComplete="off"
        onChange={(e) => setCode(e.target.value)}
        type="password"
        value={code}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button className="h-11 rounded-full" disabled={!code} type="submit">
        Desbloquear
      </Button>
    </form>
  );
}

export function SumupQrStep({
  order,
  amount,
  currency,
  onPaid,
}: {
  order: Pick<PosOrder, "id" | "number" | "name">;
  amount: number;
  currency: string;
  onPaid: (txCode: string | null) => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const create = useCallback(async () => {
    setState({ kind: "loading" });
    const res = await fetch(`${API}/pos/checkout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        currency,
        reference: `${order.id}-${Date.now().toString(36)}`,
        description: order.name
          ? `Pedido ${order.number} · ${order.name}`
          : `Pedido ${order.number}`,
      }),
    }).catch(() => null);
    if (res?.status === 401) {
      setState({ kind: "locked" });
      return;
    }
    const body = (await res?.json().catch(() => ({}))) as {
      id?: string;
      url?: string;
      error?: string;
    };
    if (res?.ok && body.id && body.url) {
      setState({ kind: "ready", id: body.id, url: body.url });
    } else {
      setState({
        kind: "error",
        message: body?.error ?? "Não consegui falar com a SumUp.",
      });
    }
  }, [amount, currency, order.id, order.name, order.number]);

  useEffect(() => {
    create();
  }, [create]);

  // Poll the checkout until it is paid (or expires)
  const readyId = state.kind === "ready" ? state.id : null;
  useEffect(() => {
    if (!readyId) {
      return;
    }
    const timer = setInterval(async () => {
      const res = await fetch(`${API}/pos/checkout/${readyId}/`, {
        cache: "no-store",
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as {
        status?: string;
        txCode?: string | null;
      } | null;
      if (body?.status === "PAID") {
        clearInterval(timer);
        onPaid(body.txCode ?? null);
      } else if (body?.status === "EXPIRED" || body?.status === "FAILED") {
        clearInterval(timer);
        setState({ kind: "expired" });
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [readyId, onPaid]);

  if (state.kind === "locked") {
    return <Unlock onDone={create} />;
  }
  if (state.kind === "loading") {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
        <Spinner className="size-6" />
        Criando a cobrança na SumUp…
      </div>
    );
  }
  if (state.kind === "error" || state.kind === "expired") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center text-sm">
        <p className="text-destructive">
          {state.kind === "error"
            ? state.message
            : "O QR code expirou ou o pagamento falhou."}
        </p>
        <Button onClick={create} variant="outline">
          Gerar novo QR code
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <QrCode value={state.url} />
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <Spinner className="size-3.5" />
        Aguardando o cliente pagar…
      </p>
      <p className="max-w-xs text-center text-muted-foreground text-xs">
        O cliente aponta a câmera e paga no celular dele com cartão, Apple Pay
        ou Google Pay. O pedido fecha sozinho quando a SumUp confirmar.
      </p>
      <div className="flex w-full gap-2">
        <Button
          className="h-11 flex-1 rounded-full"
          onClick={() => window.open(state.url, "_blank", "noopener")}
          variant="outline"
        >
          <Icon className="size-4" name="IconArrowUpRight" />
          Abrir página
        </Button>
        <Button
          className="h-11 flex-1 rounded-full"
          onClick={() =>
            navigator.share
              ? navigator
                  .share({ title: `Pedido ${order.number}`, url: state.url })
                  .catch(() => null)
              : navigator.clipboard?.writeText(state.url)
          }
          variant="outline"
        >
          <Icon className="size-4" name="IconPaperPlane" />
          Enviar link
        </Button>
      </div>
    </div>
  );
}
