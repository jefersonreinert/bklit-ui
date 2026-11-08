"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { appLocale } from "@/lib/i18n/locale";
import { sendPos, useCompany, usePosQuery } from "@/lib/pos/store";

/**
 * Read-only POS API: keys and how to use them. The key is made here with the
 * browser's crypto and only its SHA-256 goes to the server, so it is shown
 * once and cannot be recovered.
 */

const TRAILING_SLASH = /\/$/;
const PLUS = /\+/g;
const SLASH = /\//g;
const PADDING = /=+$/;

/** HTTP actions URL (self-hosted or Convex Cloud). */
function apiBase() {
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (site) {
    return site.replace(TRAILING_SLASH, "");
  }
  return (process.env.NEXT_PUBLIC_CONVEX_URL ?? "")
    .replace(".convex.cloud", ".convex.site")
    .replace(TRAILING_SLASH, "");
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(PLUS, "-")
    .replace(SLASH, "_")
    .replace(PADDING, "");
  return `cb_live_${b64}`;
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const when = (ms?: number) =>
  ms
    ? new Date(ms).toLocaleString(appLocale(), {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "nunca";

interface KeyRow {
  id: Id<"posApiKeys">;
  name: string;
  prefix: string;
  createdAt: number;
  createdBy: string;
  lastUsedAt?: number;
}

function Keys() {
  const company = useCompany();
  const list = usePosQuery(api.posapi.keys, { company }) as
    | KeyRow[]
    | null
    | undefined;
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<Id<"posApiKeys"> | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const key = newKey();
    await sendPos(api.posapi.createKey, {
      company,
      name: name.trim() || "Chave",
      prefix: key.slice(0, 14),
      hash: await sha256(key),
    });
    setBusy(false);
    setName("");
    setCopied(false);
    setFresh(key);
  };

  const copy = async () => {
    if (fresh) {
      await navigator.clipboard.writeText(fresh).catch(() => null);
      setCopied(true);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl border bg-card p-4">
      <div>
        <p className="font-semibold">Chaves de acesso</p>
        <p className="text-muted-foreground text-sm">
          Uma chave por pessoa ou sistema (ex.: “Contador”, “Excel”). A chave só
          lê dados desta empresa; não altera nada.
        </p>
      </div>
      <form className="flex gap-2" onSubmit={create}>
        <Input
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da chave (ex.: Contador)"
          value={name}
        />
        <Button disabled={busy} type="submit">
          {busy ? "Criando…" : "Criar chave"}
        </Button>
      </form>
      {fresh ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">
            Copie agora: esta chave não aparece de novo.
          </p>
          <code className="break-all rounded-lg bg-background p-2 text-xs">
            {fresh}
          </code>
          <div className="flex gap-2">
            <Button onClick={copy} size="sm">
              {copied ? "Copiada" : "Copiar"}
            </Button>
            <Button onClick={() => setFresh(null)} size="sm" variant="outline">
              Já guardei
            </Button>
          </div>
        </div>
      ) : null}
      {list === undefined ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : null}
      {list === null ? (
        <p className="text-muted-foreground text-sm">
          Seu usuário não pode gerenciar chaves.
        </p>
      ) : null}
      {list?.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma chave ainda.</p>
      ) : null}
      {list?.length ? (
        <ul className="flex flex-col divide-y rounded-2xl border">
          {list.map((k) => (
            <li className="flex items-center gap-3 p-3" key={k.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{k.name}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {k.prefix}… · criada {when(k.createdAt)} por {k.createdBy} ·
                  último uso {when(k.lastUsedAt)}
                </p>
              </div>
              {revoking === k.id ? (
                <div className="flex gap-1.5">
                  <Button
                    onClick={() => {
                      setRevoking(null);
                      sendPos(api.posapi.revokeKey, { id: k.id });
                    }}
                    size="sm"
                    variant="destructive"
                  >
                    Confirmar
                  </Button>
                  <Button
                    onClick={() => setRevoking(null)}
                    size="sm"
                    variant="ghost"
                  >
                    Não
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setRevoking(k.id)}
                  size="sm"
                  variant="outline"
                >
                  Revogar
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const ENDPOINTS: { path: string; what: string; example: string }[] = [
  {
    path: "/api/v1/orders?from=2026-11-01&to=2026-11-07",
    what: "Recibos pagos e cancelados no período (máx. 93 dias): itens, total, IVA, líquido, gorjeta, pagamento, número fiscal e operador. Datas são dias de Malta; também aceita ISO 8601.",
    example: `{
  "business": "Casa Brasa Ltd", "vat_no": "MT12345678", "exo_no": "",
  "currency": "EUR", "count": 1,
  "orders": [{
    "order_no": 412, "fiscal_receipt_no": 1024, "status": "paid",
    "closed_at": "2026-11-07T21:14:03.000Z",
    "items": [{ "name": "Caipirinha", "qty": 2, "unit_price": 9, "total": 18 }],
    "total": 18, "vat_rate": 18, "vat": 2.75, "net": 15.25, "tip": 2,
    "payment": { "method": "card", "amount": 20, "ref": "TX4F9K2" },
    "closed_by": "Ana"
  }]
}`,
  },
  {
    path: "/api/v1/daily?from=2026-11-01&to=2026-11-07",
    what: "Totais por dia: vendas com IVA, IVA, líquido, taxa de serviço, gorjetas, custo e formas de pagamento.",
    example: `{
  "currency": "EUR", "vat_rate": 18,
  "days": [{ "day": "2026-11-07", "orders": 63, "gross_sales": 1840.5,
    "vat": 280.75, "net": 1559.75, "tips": 96, "payment_methods": { "card": 1510.5, "cash": 330 } }]
}`,
  },
  {
    path: "/api/v1/products",
    what: "Cardápio: nome, categoria, preço, disponível, SKU, código de barras e estoque.",
    example: `{ "currency": "EUR", "count": 1,
  "products": [{ "id": "caipirinha", "name": "Caipirinha", "category": "Bar",
    "price": 9, "available": true, "sku": null, "barcode": null, "stock": null }] }`,
  },
];

function Docs() {
  const base = apiBase();
  return (
    <section className="flex flex-col gap-4 rounded-3xl border bg-card p-4">
      <div>
        <p className="font-semibold">Como usar</p>
        <p className="text-muted-foreground text-sm">
          Envie a chave no cabeçalho <code>Authorization</code>. Todas as
          respostas são JSON. Chave errada ou revogada: erro 401.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground text-xs">Endereço base</span>
        <code className="break-all rounded-lg bg-muted p-2 text-xs">
          {base || "(banco de dados não configurado)"}
        </code>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
        {`curl "${base}/api/v1/orders?from=2026-11-01&to=2026-11-07" \\
  -H "Authorization: Bearer cb_live_…"`}
      </pre>
      <ul className="flex flex-col gap-3">
        {ENDPOINTS.map((e) => (
          <li className="flex flex-col gap-1.5" key={e.path}>
            <code className="break-all font-semibold text-xs">
              GET {e.path}
            </code>
            <p className="text-muted-foreground text-xs">{e.what}</p>
            <details>
              <summary className="cursor-pointer text-xs">
                Exemplo de resposta
              </summary>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-3 text-[11px]">
                {e.example}
              </pre>
            </details>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Guarde a chave como uma senha. Se ela vazar, revogue e crie outra.
      </p>
    </section>
  );
}

export function PosApiSettings() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Keys />
      <Docs />
    </div>
  );
}
