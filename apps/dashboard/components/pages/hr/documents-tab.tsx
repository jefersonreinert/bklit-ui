"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { PanelUnlock } from "@/components/dashboard/panel-unlock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type DocKind,
  type DocStatus,
  docStatus,
  kindsFor,
  type Origin,
} from "@/lib/hr/malta-documents";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Notice, TelegramProvider } from "../telegram/telegram-shared";
import { ContractsPanel } from "./contracts-panel";

/**
 * Team documents for working legally in Malta: EU or not, the checklist
 * that follows from it, files and expiry dates (Single Permit first).
 */

type Row = NonNullable<FunctionReturnType<typeof api.hr.employees>>[number];

const today = () => new Date().toISOString().slice(0, 10);

const STATUS: Record<DocStatus, { label: string; tone: string }> = {
  ok: {
    label: "Em dia",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  missing: { label: "Falta", tone: "bg-destructive/10 text-destructive" },
  expiring: {
    label: "Vence logo",
    tone: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
  expired: { label: "Vencido", tone: "bg-destructive/15 text-destructive" },
};

const ORIGIN_LABEL: Record<Origin, string> = {
  eu: "UE / EEE / Suíça",
  "non-eu": "Fora da UE",
};

function summary(row: Row, now: string) {
  if (!row.origin) {
    return { missing: 0, expiring: 0, expired: 0, unset: true };
  }
  const c = { missing: 0, expiring: 0, expired: 0, unset: false };
  for (const k of kindsFor(row.origin)) {
    const doc = row.docs.find((d) => d.kind === k.id);
    const s = docStatus(doc, now);
    if (s === "expired" || s === "expiring") {
      c[s] += 1;
    } else if (s === "missing" && k.required) {
      c.missing += 1;
    }
  }
  // Extra documents (e.g. "other") can also expire
  for (const d of row.docs.filter((x) => x.kind === "other")) {
    const s = docStatus(d, now);
    if (s === "expired" || s === "expiring") {
      c[s] += 1;
    }
  }
  return c;
}

function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs", tone)}>
      {children}
    </span>
  );
}

function Chips({ s }: { s: ReturnType<typeof summary> }) {
  const fine = !(s.unset || s.expired || s.expiring || s.missing);
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {s.unset ? (
        <Badge variant="outline">Definir UE / fora da UE</Badge>
      ) : null}
      {s.expired ? (
        <Chip tone={STATUS.expired.tone}>
          {s.expired} vencido{s.expired > 1 ? "s" : ""}
        </Chip>
      ) : null}
      {s.expiring ? (
        <Chip tone={STATUS.expiring.tone}>
          {s.expiring} vence{s.expiring > 1 ? "m" : ""} logo
        </Chip>
      ) : null}
      {s.missing ? (
        <Chip tone={STATUS.missing.tone}>{s.missing} faltando</Chip>
      ) : null}
      {fine ? <Chip tone={STATUS.ok.tone}>Completo</Chip> : null}
    </span>
  );
}

/** The tab needs the panel's Convex client (the HR page has no provider). */
export function HrDocumentsTab() {
  return (
    <TelegramProvider
      fallback={
        <Notice>
          Os documentos usam o banco central do painel (Convex), que não está
          disponível agora.
        </Notice>
      }
    >
      <DocumentsTab />
    </TelegramProvider>
  );
}

function DocumentsTab() {
  const rows = useQuery(api.hr.employees, {});
  const [open, setOpen] = useState<Id<"posUsers"> | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const now = today();

  if (rows === null) {
    return <PanelUnlock what="ver os documentos da equipe" />;
  }
  if (rows === undefined) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  const list = rows
    .filter((r) => showInactive || r.active)
    .sort((a, b) => a.name.localeCompare(b.name));
  const alerts = list
    .map((r) => ({ r, s: summary(r, now) }))
    .filter(({ s }) => s.expired || s.expiring || s.missing || s.unset);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border bg-card p-4 text-sm">
        <p className="font-medium">Documentos para trabalhar em Malta</p>
        <p className="text-muted-foreground">
          Marque cada pessoa como UE ou fora da UE; a lista de documentos muda
          sozinha. Avisamos {60} dias antes de vencer. Os dados ficam só neste
          painel.
        </p>
        {alerts.length ? (
          <p className="mt-2 font-medium text-amber-700 dark:text-amber-300">
            {alerts.length}{" "}
            {alerts.length === 1 ? "pessoa precisa" : "pessoas precisam"} de
            atenção.
          </p>
        ) : (
          <p className="mt-2 text-emerald-700 dark:text-emerald-300">
            Tudo em dia.
          </p>
        )}
      </div>

      <ul className="divide-y rounded-2xl border bg-card">
        {list.map((r) => {
          const s = summary(r, now);
          return (
            <li key={r.id}>
              <button
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
                onClick={() => setOpen(r.id)}
                type="button"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-sm">
                  {r.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {r.name}
                    {r.active ? "" : " (inativo)"}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {[
                      r.jobTitle || r.role,
                      r.origin ? ORIGIN_LABEL[r.origin] : null,
                      r.nationality,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <Chips s={s} />
              </button>
            </li>
          );
        })}
      </ul>
      <label className="flex items-center gap-2 text-muted-foreground text-sm">
        <input
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          type="checkbox"
        />
        Mostrar inativos
      </label>
      <p className="text-muted-foreground text-xs">
        Novos funcionários são criados em POS → Configurações → Usuários.
      </p>
      {open ? (
        <EmployeeSheet onClose={() => setOpen(null)} userId={open} />
      ) : null}
    </div>
  );
}

/* ---------------------------------- sheet --------------------------------- */

function EmployeeSheet({
  userId,
  onClose,
}: {
  userId: Id<"posUsers">;
  onClose: () => void;
}) {
  const data = useQuery(api.hr.employee, { userId });
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-xl!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{data?.name ?? "Funcionário"}</SheetTitle>
          <SheetDescription>Ficha de RH e documentos</SheetDescription>
        </SheetHeader>
        {data ? (
          <div className="flex flex-col gap-6 p-5">
            <ProfileForm data={data} key={data.profile?.updatedAt ?? 0} />
            {data.profile ? (
              <ContractsPanel startDate={data.startDate} userId={data.id} />
            ) : null}
            {data.profile ? (
              <DocList data={data} origin={data.profile.origin} />
            ) : (
              <p className="rounded-xl bg-muted p-3 text-sm">
                Salve a ficha (UE ou fora da UE) para ver a lista de documentos.
              </p>
            )}
          </div>
        ) : (
          <p className="p-5 text-muted-foreground text-sm">Carregando…</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

type Employee = NonNullable<FunctionReturnType<typeof api.hr.employee>>;

const COMPANIES = [
  { id: "the-brew", name: "The Brew" },
  { id: "ribs-house", name: "Ribs House" },
  { id: "vinomad", name: "Vinomad" },
  { id: "main", name: "Casa Brasa" },
];

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>
      {label}
      {children}
    </label>
  );
}

function ProfileForm({ data }: { data: Employee }) {
  const save = useMutation(api.hr.saveProfile);
  const p = data.profile;
  const [f, setF] = useState({
    origin: (p?.origin ?? "") as Origin | "",
    nationality: p?.nationality ?? "",
    gender: p?.gender ?? "",
    birthDate: p?.birthDate ?? "",
    address: p?.address ?? "",
    idNumber: p?.idNumber ?? "",
    passportNumber: p?.passportNumber ?? "",
    tin: p?.tin ?? "",
    ssn: p?.ssn ?? "",
    iban: p?.iban ?? "",
    payType: p?.payType ?? "hourly",
    monthlySalary: p?.monthlySalary ? String(p.monthlySalary) : "",
    hourlyRate: data.hourlyRate ? String(data.hourlyRate) : "",
    jobTitle: data.jobTitle ?? "",
    startDate: data.startDate ?? "",
    workplace: p?.workplace ?? "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const num = (s: string) => {
    const n = Number(s.replace(",", "."));
    return s.trim() && Number.isFinite(n) ? n : undefined;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.origin) {
      setStatus("Escolha UE ou fora da UE.");
      return;
    }
    setStatus("Salvando…");
    try {
      await save({
        userId: data.id,
        origin: f.origin,
        nationality: f.nationality,
        gender: f.gender,
        birthDate: f.birthDate,
        address: f.address,
        idNumber: f.idNumber,
        passportNumber: f.passportNumber,
        tin: f.tin,
        ssn: f.ssn,
        iban: f.iban,
        payType: f.payType,
        monthlySalary: num(f.monthlySalary),
        hourlyRate: num(f.hourlyRate),
        jobTitle: f.jobTitle,
        startDate: f.startDate,
        workplace: f.workplace,
      });
      setStatus("Salvo.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Não salvou.");
    }
  };

  const text = (k: keyof typeof f, id: string, label: string, ph = "") => (
    <Field id={id} label={label}>
      <Input
        id={id}
        onChange={(e) => set(k)(e.target.value)}
        placeholder={ph}
        value={f[k]}
      />
    </Field>
  );

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col gap-1.5 text-sm">
        Cidadania
        <div className="grid grid-cols-2 gap-2">
          {(["eu", "non-eu"] as const).map((o) => (
            <button
              aria-pressed={f.origin === o}
              className={cn(
                "rounded-xl border p-3 text-left text-sm",
                f.origin === o
                  ? "border-foreground bg-muted"
                  : "hover:bg-muted/60"
              )}
              key={o}
              onClick={() => setF({ ...f, origin: o })}
              type="button"
            >
              <span className="block font-medium">{ORIGIN_LABEL[o]}</span>
              <span className="block text-muted-foreground text-xs">
                {o === "eu"
                  ? "Trabalha livremente em Malta"
                  : "Precisa de Single Permit, Skills Pass…"}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {text("nationality", "hr-nat", "Nacionalidade", "Ex.: Brazilian")}
        <Field id="hr-gender" label="Gênero (exigido no contrato)">
          <select
            className="h-9 rounded-md border bg-transparent px-2"
            id="hr-gender"
            onChange={(e) => set("gender")(e.target.value)}
            value={f.gender}
          >
            <option value="">—</option>
            <option value="Male">Masculino</option>
            <option value="Female">Feminino</option>
            <option value="Non-binary">Outro</option>
          </select>
        </Field>
        <Field id="hr-birth" label="Data de nascimento">
          <Input
            id="hr-birth"
            onChange={(e) => set("birthDate")(e.target.value)}
            type="date"
            value={f.birthDate}
          />
        </Field>
        {text("passportNumber", "hr-pass", "Nº do passaporte")}
        {text("idNumber", "hr-id", "Nº do ID / residence card")}
        {text("tin", "hr-tin", "Nº fiscal (TIN)")}
        {text("ssn", "hr-ssn", "Nº Segurança Social")}
      </div>
      {text("address", "hr-addr", "Endereço em Malta")}
      {text("iban", "hr-iban", "IBAN", "MT…")}
      <div className="grid gap-3 sm:grid-cols-2">
        {text("jobTitle", "hr-job", "Função", "Ex.: Bartender")}
        <Field id="hr-start" label="Início no emprego">
          <Input
            id="hr-start"
            onChange={(e) => set("startDate")(e.target.value)}
            type="date"
            value={f.startDate}
          />
        </Field>
        <Field id="hr-place" label="Local de trabalho">
          <select
            className="h-9 rounded-md border bg-transparent px-2"
            id="hr-place"
            onChange={(e) => set("workplace")(e.target.value)}
            value={f.workplace}
          >
            <option value="">—</option>
            {COMPANIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="hr-pay" label="Forma de pagamento">
          <select
            className="h-9 rounded-md border bg-transparent px-2"
            id="hr-pay"
            onChange={(e) => set("payType")(e.target.value)}
            value={f.payType}
          >
            <option value="hourly">Por hora (ponto)</option>
            <option value="monthly">Salário mensal + extras</option>
          </select>
        </Field>
        {f.payType === "monthly"
          ? text("monthlySalary", "hr-salary", "Salário bruto mensal (€)")
          : null}
        {text(
          "hourlyRate",
          "hr-rate",
          f.payType === "monthly"
            ? "Valor da hora extra base (€)"
            : "Valor da hora (€)"
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit">Salvar ficha</Button>
        {status ? (
          <span className="text-muted-foreground text-sm">{status}</span>
        ) : null}
      </div>
    </form>
  );
}

/* -------------------------------- documents ------------------------------- */

type DocRow = Employee["docs"][number];

function DocList({ data, origin }: { data: Employee; origin: Origin }) {
  const now = today();
  const kinds = kindsFor(origin);
  const others = data.docs.filter((d) => d.kind === "other");
  return (
    <section className="flex flex-col gap-2">
      <p className="font-semibold">Documentos · {ORIGIN_LABEL[origin]}</p>
      <ul className="flex flex-col gap-2">
        {kinds
          .filter((k) => k.id !== "other")
          .map((k) => {
            const doc = data.docs.find((d) => d.kind === k.id);
            return (
              <DocItem
                doc={doc}
                key={k.id}
                kind={k}
                now={now}
                userId={data.id}
              />
            );
          })}
        {others.map((d) => (
          <DocItem
            doc={d}
            key={d.id}
            kind={kinds.find((k) => k.id === "other") as DocKind}
            now={now}
            userId={data.id}
          />
        ))}
        <DocItem
          doc={undefined}
          key={`new-other-${others.length}`}
          kind={kinds.find((k) => k.id === "other") as DocKind}
          now={now}
          userId={data.id}
        />
      </ul>
    </section>
  );
}

interface FileRef {
  storageId: Id<"_storage">;
  name: string;
  mimeType: string;
}

const MAX_FILE = 15 * 1024 * 1024;

/** Uploads a picked file to Convex storage. */
async function sendFile(
  picked: File,
  uploadUrl: () => Promise<string>
): Promise<FileRef> {
  if (picked.size > MAX_FILE) {
    throw new Error("Arquivo maior que 15 MB.");
  }
  const mimeType = picked.type || "application/octet-stream";
  const res = await fetch(await uploadUrl(), {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: picked,
  });
  if (!res.ok) {
    throw new Error(`Falha no envio (${res.status}).`);
  }
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return { storageId, name: picked.name, mimeType };
}

function docLine(doc: DocRow | undefined, hint: string) {
  if (!doc) {
    return hint;
  }
  const parts = [
    doc.number ? `Nº ${doc.number}` : null,
    doc.expiresAt ? `vence ${doc.expiresAt}` : null,
    doc.fileName,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sem arquivo";
}

function DocItem({
  kind,
  doc,
  now,
  userId,
}: {
  kind: DocKind;
  doc: DocRow | undefined;
  now: string;
  userId: Id<"posUsers">;
}) {
  const [editing, setEditing] = useState(false);
  const status = useMemo(
    () => docStatus(doc && { ...doc, hasFile: Boolean(doc.url) }, now),
    [doc, now]
  );
  const isOther = kind.id === "other";
  if (isOther && !(doc || editing)) {
    return (
      <li>
        <Button onClick={() => setEditing(true)} size="sm" variant="outline">
          <Icon className="size-4" name="IconPlusSmall" />
          Outro documento
        </Button>
      </li>
    );
  }
  const optional = status === "missing" && !kind.required;
  return (
    <li className="rounded-2xl border p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">
            {isOther ? doc?.label || "Outro documento" : kind.label}
            {kind.required ? null : (
              <span className="font-normal text-muted-foreground">
                {" "}
                · opcional
              </span>
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {docLine(doc, kind.hint)}
          </p>
        </div>
        <Chip
          tone={
            optional ? "bg-muted text-muted-foreground" : STATUS[status].tone
          }
        >
          {optional ? "—" : STATUS[status].label}
        </Chip>
      </div>
      {editing ? (
        <DocForm
          doc={doc}
          kind={kind}
          onDone={() => setEditing(false)}
          userId={userId}
        />
      ) : (
        <DocActions doc={doc} onEdit={() => setEditing(true)} />
      )}
    </li>
  );
}

function DocForm({
  kind,
  doc,
  userId,
  onDone,
}: {
  kind: DocKind;
  doc: DocRow | undefined;
  userId: Id<"posUsers">;
  onDone: () => void;
}) {
  const uploadUrl = useMutation(api.hr.uploadUrl);
  const saveDoc = useMutation(api.hr.saveDocument);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: doc?.label ?? "",
    number: doc?.number ?? "",
    expiresAt: doc?.expiresAt ?? "",
    note: doc?.note ?? "",
  });
  const isOther = kind.id === "other";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const picked = fileRef.current?.files?.[0];
      const file = picked
        ? await sendFile(picked, () => uploadUrl({}))
        : undefined;
      await saveDoc({
        id: doc?.id,
        userId,
        kind: kind.id,
        label: isOther ? form.label : undefined,
        number: form.number,
        expiresAt: kind.expires ? form.expiresAt : undefined,
        note: form.note,
        file,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não salvou.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mt-3 flex flex-col gap-2" onSubmit={submit}>
      {isOther ? (
        <Input
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Nome do documento"
          value={form.label}
        />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          onChange={(e) => setForm({ ...form, number: e.target.value })}
          placeholder="Número (opcional)"
          value={form.number}
        />
        {kind.expires ? (
          <Input
            aria-label="Vence em"
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            type="date"
            value={form.expiresAt}
          />
        ) : null}
      </div>
      <input
        accept="image/*,application/pdf"
        className="text-sm"
        ref={fileRef}
        type="file"
      />
      <Input
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        placeholder="Observação (opcional)"
        value={form.note}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="flex gap-2">
        <Button disabled={busy} size="sm" type="submit">
          {busy ? "Salvando…" : "Salvar"}
        </Button>
        <Button onClick={onDone} size="sm" type="button" variant="ghost">
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function DocActions({
  doc,
  onEdit,
}: {
  doc: DocRow | undefined;
  onEdit: () => void;
}) {
  const remove = useMutation(api.hr.deleteDocument);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button onClick={onEdit} size="sm" variant="outline">
        {doc ? "Editar" : "Adicionar"}
      </Button>
      {doc?.url ? (
        <a
          className="inline-flex h-8 items-center rounded-md border px-3 text-sm"
          href={doc.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Ver arquivo
        </a>
      ) : null}
      {doc ? (
        <Button
          onClick={() => {
            if (confirmDelete) {
              remove({ id: doc.id });
            }
            setConfirmDelete(!confirmDelete);
          }}
          size="sm"
          variant={confirmDelete ? "destructive" : "ghost"}
        >
          <Icon className="size-4" name="IconTrashCan" />
          {confirmDelete ? "Toque de novo para apagar" : "Apagar"}
        </Button>
      ) : null}
    </div>
  );
}
