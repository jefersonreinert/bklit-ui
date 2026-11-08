"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildContract } from "@/lib/hr/contract";
import { contractPdf, savePdf } from "@/lib/hr/contract-pdf";
import { cn } from "@/lib/utils";
import { SignaturePad } from "./signature-pad";

/**
 * Contracts of one employee: generate from the HR file, read, sign for the
 * company, send the signing link (WhatsApp / copy) and get the signed PDF.
 */

type Contract = NonNullable<
  FunctionReturnType<typeof api.contracts.list>
>[number];

const STATUS: Record<Contract["status"], { label: string; tone: string }> = {
  draft: { label: "Rascunho", tone: "bg-muted text-muted-foreground" },
  sent: {
    label: "Aguardando o funcionário",
    tone: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
  signed: {
    label: "Assinado",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  void: {
    label: "Cancelado",
    tone: "bg-muted text-muted-foreground line-through",
  },
};

const when = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString("pt-PT", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";

/** The public signing link of a contract. */
function signLink(token: string) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${base}/assinar/?t=${token}`;
}

export function ContractsPanel({
  userId,
  startDate,
}: {
  userId: Id<"posUsers">;
  startDate?: string;
}) {
  const list = useQuery(api.contracts.list, { userId });
  const settings = useQuery(api.payroll.settings, {});
  const [creating, setCreating] = useState(false);
  if (!(list && settings)) {
    return null;
  }
  const active = list.filter((c) => c.status !== "void");
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Contratos</p>
        {creating ? null : (
          <Button onClick={() => setCreating(true)} size="sm">
            Gerar contrato
          </Button>
        )}
      </div>
      {settings.signatory ? null : (
        <p className="rounded-xl bg-amber-500/10 p-3 text-amber-800 text-sm dark:text-amber-200">
          Falta o nome de quem assina pela empresa: RH → Horas & pagamento →
          Configurações do RH.
        </p>
      )}
      {creating ? (
        <CreateForm
          defaults={{
            startDate: startDate ?? new Date().toISOString().slice(0, 10),
            probationMonths: settings.probationMonths,
            weeklyHours: settings.weeklyHours,
          }}
          onDone={() => setCreating(false)}
          userId={userId}
        />
      ) : null}
      {active.length === 0 && !creating ? (
        <p className="text-muted-foreground text-sm">Nenhum contrato ainda.</p>
      ) : null}
      {list.map((c) => (
        <ContractCard c={c} key={c.id} userId={userId} />
      ))}
    </section>
  );
}

function CreateForm({
  userId,
  defaults,
  onDone,
}: {
  userId: Id<"posUsers">;
  defaults: { startDate: string; probationMonths: number; weeklyHours: number };
  onDone: () => void;
}) {
  const create = useMutation(api.contracts.create);
  const [f, setF] = useState({
    startDate: defaults.startDate,
    endDate: "",
    probationMonths: String(defaults.probationMonths),
    weeklyHours: String(defaults.weeklyHours),
  });
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await create({
        userId,
        startDate: f.startDate,
        endDate: f.endDate || undefined,
        probationMonths: Number(f.probationMonths),
        weeklyHours: Number(f.weeklyHours.replace(",", ".")),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não gerou.");
    }
  };
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border p-3 text-sm"
      onSubmit={submit}
    >
      <p className="text-muted-foreground text-xs">
        Usa os dados da ficha (nome, documento, endereço, função, local,
        pagamento) e das configurações do RH. Salve a ficha antes se mudou algo.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1" htmlFor="ct-start">
          Início
          <Input
            id="ct-start"
            onChange={(e) => setF({ ...f, startDate: e.target.value })}
            type="date"
            value={f.startDate}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor="ct-end">
          Término (vazio = indeterminado)
          <Input
            id="ct-end"
            onChange={(e) => setF({ ...f, endDate: e.target.value })}
            type="date"
            value={f.endDate}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor="ct-prob">
          Experiência (meses)
          <Input
            id="ct-prob"
            inputMode="numeric"
            onChange={(e) => setF({ ...f, probationMonths: e.target.value })}
            value={f.probationMonths}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor="ct-hours">
          Horas por semana
          <Input
            id="ct-hours"
            inputMode="decimal"
            onChange={(e) => setF({ ...f, weeklyHours: e.target.value })}
            value={f.weeklyHours}
          />
        </label>
      </div>
      {error ? <p className="text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Gerar
        </Button>
        <Button onClick={onDone} size="sm" type="button" variant="ghost">
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ContractText({ c }: { c: Contract }) {
  const doc = buildContract(c.fields);
  return (
    <div className="max-h-96 overflow-y-auto rounded-xl bg-white p-4 font-serif text-[13px] text-black leading-relaxed">
      <p className="mb-3 text-center font-bold">{doc.title}</p>
      {doc.parties.map((p) => (
        <p className="mb-2" key={p}>
          {p}
        </p>
      ))}
      {doc.sections.map((s) => (
        <div className="mt-3" key={s.heading}>
          <p className="font-bold">{s.heading}</p>
          {s.paragraphs.map((p) => (
            <p className="mb-1.5" key={p}>
              {p}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function ContractCard({ c, userId }: { c: Contract; userId: Id<"posUsers"> }) {
  const [reading, setReading] = useState(c.status === "draft");
  const s = STATUS[c.status];
  const title = c.fields.endDate
    ? `${c.fields.startDate} → ${c.fields.endDate}`
    : `Desde ${c.fields.startDate} · indeterminado`;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {c.fields.jobTitle || "Contrato"} · {c.fields.workplace.name}
          </p>
          <p className="text-muted-foreground text-xs">
            {title} · criado {when(c.createdAt)}
          </p>
        </div>
        <span
          className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", s.tone)}
        >
          {s.label}
        </span>
      </div>
      {c.status === "void" ? null : (
        <Button
          className="self-start"
          onClick={() => setReading(!reading)}
          size="sm"
          variant="ghost"
        >
          {reading ? "Esconder texto" : "Ler contrato"}
        </Button>
      )}
      {reading && c.status !== "void" ? <ContractText c={c} /> : null}
      {c.status === "draft" ? <DraftActions c={c} /> : null}
      {c.status === "sent" ? <SentActions c={c} /> : null}
      {c.status === "signed" ? <SignedActions c={c} userId={userId} /> : null}
    </div>
  );
}

function DraftActions({ c }: { c: Contract }) {
  const sign = useMutation(api.contracts.signAsEmployer);
  const send = useMutation(api.contracts.send);
  const cancel = useMutation(api.contracts.cancel);
  const [sig, setSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (f: () => Promise<unknown>) => {
    setError(null);
    try {
      await f();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {c.employerSignature ? (
        <p className="text-emerald-700 dark:text-emerald-300">
          Assinado pela empresa em {when(c.employerSignedAt)}.
        </p>
      ) : (
        <>
          <p className="font-medium">Assinatura da empresa</p>
          <SignaturePad onChange={setSig} />
          <Button
            disabled={!sig}
            onClick={() => run(() => sign({ id: c.id, signature: sig ?? "" }))}
            size="sm"
          >
            Assinar pela empresa
          </Button>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!c.employerSignature}
          onClick={() => run(() => send({ id: c.id }))}
          size="sm"
        >
          Enviar para o funcionário assinar
        </Button>
        <Button
          onClick={() => run(() => cancel({ id: c.id }))}
          size="sm"
          variant="ghost"
        >
          Descartar
        </Button>
      </div>
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}

function SentActions({ c }: { c: Contract }) {
  const cancel = useMutation(api.contracts.cancel);
  const [copied, setCopied] = useState(false);
  const link = c.token ? signLink(c.token) : "";
  const message = `Olá ${c.fields.employee.name.split(" ")[0]}, segue o seu contrato de trabalho com ${c.fields.employer.name} para ler e assinar: ${link}`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        Link pessoal: quem tiver o link pode assinar. Envie só para o
        funcionário.
      </p>
      <code className="break-all rounded-lg bg-muted p-2 text-xs">{link}</code>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => null);
            setCopied(true);
          }}
          size="sm"
          variant="outline"
        >
          {copied ? "Copiado" : "Copiar link"}
        </Button>
        <a
          className="inline-flex h-8 items-center rounded-md border px-3 text-sm"
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          Enviar por WhatsApp
        </a>
        <Button onClick={() => cancel({ id: c.id })} size="sm" variant="ghost">
          Cancelar contrato
        </Button>
      </div>
    </div>
  );
}

function SignedActions({ c, userId }: { c: Contract; userId: Id<"posUsers"> }) {
  const uploadUrl = useMutation(api.hr.uploadUrl);
  const saveDoc = useMutation(api.hr.saveDocument);
  const [status, setStatus] = useState<string | null>(null);
  const name = `contract-${c.fields.employee.name.replace(/\s+/g, "-")}-${c.fields.startDate}.pdf`;

  const keep = async () => {
    setStatus("Salvando…");
    try {
      const blob = await contractPdf(c);
      const res = await fetch(await uploadUrl({}), {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: blob,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await saveDoc({
        userId,
        kind: "contract",
        expiresAt: c.fields.endDate,
        note: `SHA-256 ${c.hash.slice(0, 16)}…`,
        file: { storageId, name, mimeType: "application/pdf" },
      });
      setStatus("Salvo em Documentos → Contrato.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Não salvou.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-emerald-700 dark:text-emerald-300">
        Assinado por {c.employeeName} em {when(c.employeeSignedAt)}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => savePdf(await contractPdf(c), name)}
          size="sm"
        >
          Baixar PDF assinado
        </Button>
        <Button onClick={keep} size="sm" variant="outline">
          Guardar nos documentos
        </Button>
      </div>
      {status ? (
        <p className="text-muted-foreground text-xs">{status}</p>
      ) : null}
    </div>
  );
}
