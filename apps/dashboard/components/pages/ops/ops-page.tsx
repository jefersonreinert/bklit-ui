"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { PanelUnlock } from "@/components/dashboard/panel-unlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { savePdf } from "@/lib/hr/contract-pdf";
import { blankSheetPdf, fillingPdf, kitPdf, VENUES } from "@/lib/ops/sheet-pdf";
import { FREQUENCY_LABEL, type Frequency } from "@/lib/ops/templates";
import { cn } from "@/lib/utils";
import { Notice, TelegramProvider } from "../telegram/telegram-shared";

/**
 * Operations: per venue, departments, cleaning and closing checklists
 * (filled in the app or printed with the venue's colour logo), their
 * history, and department documents.
 */

type Overview = NonNullable<FunctionReturnType<typeof api.ops.overview>>;
type Form = Overview["forms"][number];
type Dept = Overview["departments"][number];

const COMPANIES = ["the-brew", "ribs-house", "vinomad", "main"] as const;
const today = () => new Date().toISOString().slice(0, 10);
const fileName = (s: string) =>
  `${s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.pdf`;

export function OpsPage() {
  return (
    <TelegramProvider
      fallback={
        <Notice>
          Operations usa o banco central do painel, indisponível agora.
        </Notice>
      }
    >
      <Ops />
    </TelegramProvider>
  );
}

type Tab = "forms" | "history" | "docs" | "depts";

function Ops() {
  const [company, setCompany] = useState<string>("the-brew");
  const [tab, setTab] = useState<Tab>("forms");
  const data = useQuery(api.ops.overview, { company });
  if (data === null) {
    return <PanelUnlock what="usar Operations" />;
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h2 className="font-semibold text-xl">Operations</h2>
        <p className="text-muted-foreground text-sm">
          Checklists de limpeza e fechamento, departamentos e documentos de cada
          bar. Preencha no app ou imprima em PDF com o logo do bar.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {COMPANIES.map((c) => (
          <button
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              company === c
                ? "border-foreground bg-foreground text-background"
                : "hover:bg-muted"
            )}
            key={c}
            onClick={() => setCompany(c)}
            type="button"
          >
            {VENUES[c]?.name ?? c}
          </button>
        ))}
      </div>
      <Tabs onValueChange={(v) => setTab(v as Tab)} value={tab}>
        <TabsList>
          <TabsTrigger value="forms">Formulários</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
          <TabsTrigger value="depts">Departamentos</TabsTrigger>
        </TabsList>
      </Tabs>
      {data === undefined ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : (
        <>
          {tab === "forms" ? <FormsTab company={company} data={data} /> : null}
          {tab === "history" ? (
            <HistoryTab company={company} data={data} />
          ) : null}
          {tab === "docs" ? <DocsTab company={company} data={data} /> : null}
          {tab === "depts" ? <DeptsTab company={company} data={data} /> : null}
        </>
      )}
    </div>
  );
}

/* --------------------------------- forms ---------------------------------- */

function deptName(data: Overview, id: Id<"opsDepartments">) {
  return data.departments.find((d) => d.id === id)?.name ?? "";
}

function FormsTab({ company, data }: { company: string; data: Overview }) {
  const seed = useMutation(api.ops.seed);
  const [filling, setFilling] = useState<Form | null>(null);
  const [editing, setEditing] = useState<Form | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const venue = VENUES[company] ?? { name: company, accent: "#333" };

  const print = async (f: Form) => {
    setBusy(f.id);
    try {
      const blob = await blankSheetPdf(
        { ...f, department: deptName(data, f.departmentId) },
        venue
      );
      await savePdf(blob, fileName(`${venue.name} ${f.title}`));
    } finally {
      setBusy(null);
    }
  };

  const printKit = async () => {
    setBusy("kit");
    try {
      const sections = data.departments.map((d) => ({
        department: d.name,
        forms: data.forms
          .filter((f) => f.departmentId === d.id)
          .map((f) => ({ ...f, department: d.name })),
      }));
      await savePdf(
        await kitPdf(sections, venue),
        fileName(`${venue.name} operations kit`)
      );
    } finally {
      setBusy(null);
    }
  };

  if (data.forms.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-4">
        <p className="text-sm">
          Nenhum formulário em {venue.name} ainda. Crie os modelos prontos
          (banheiros, cozinha, bar, salão e fechamentos do gerente) e depois
          ajuste como quiser.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => seed({ company })}>
            Criar modelos prontos
          </Button>
          {data.departments.length ? (
            <Button onClick={() => setEditing("new")} variant="outline">
              Formulário em branco
            </Button>
          ) : null}
        </div>
        {editing ? (
          <FormEditor
            company={company}
            data={data}
            form={null}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing("new")} size="sm">
          Novo formulário
        </Button>
        <Button
          disabled={busy === "kit"}
          onClick={printKit}
          size="sm"
          variant="outline"
        >
          {busy === "kit" ? "Montando o kit…" : "Kit completo (PDF)"}
        </Button>
        <Button onClick={() => seed({ company })} size="sm" variant="ghost">
          Adicionar modelos que faltam
        </Button>
      </div>
      {data.departments.map((d) => {
        const forms = data.forms.filter((f) => f.departmentId === d.id);
        if (forms.length === 0) {
          return null;
        }
        return (
          <section className="flex flex-col gap-2" key={d.id}>
            <p className="font-semibold">{d.name}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {forms.map((f) => (
                <div
                  className="flex flex-col gap-2 rounded-2xl border bg-card p-3"
                  key={f.id}
                >
                  <div>
                    <p className="font-medium text-sm">{f.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {FREQUENCY_LABEL[f.frequency]} · {f.items.length} itens
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setFilling(f)} size="sm">
                      Preencher
                    </Button>
                    <Button
                      disabled={busy === f.id}
                      onClick={() => print(f)}
                      size="sm"
                      variant="outline"
                    >
                      {busy === f.id ? "Gerando…" : "PDF para imprimir"}
                    </Button>
                    <Button
                      onClick={() => setEditing(f)}
                      size="sm"
                      variant="ghost"
                    >
                      Editar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {filling ? (
        <FillSheet
          company={company}
          form={filling}
          onClose={() => setFilling(null)}
        />
      ) : null}
      {editing ? (
        <FormEditor
          company={company}
          data={data}
          form={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

const NAME_KEY = "ops:by";
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

function FillSheet({
  company,
  form,
  onClose,
}: {
  company: string;
  form: Form;
  onClose: () => void;
}) {
  const submit = useMutation(api.ops.submit);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [by, setBy] = useState(readName);
  const [day, setDay] = useState(today);
  const [slot, setSlot] = useState(() => {
    const h = `${String(new Date().getHours()).padStart(2, "0")}:00`;
    return form.slots.includes(h) ? h : (form.slots[0] ?? "");
  });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(done);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setDone(next);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await submit({
        company,
        formId: form.id,
        by,
        day,
        slot: form.frequency === "log" ? slot : undefined,
        done: [...done],
        notes: notes || undefined,
      });
      try {
        localStorage.setItem(NAME_KEY, by);
      } catch {
        // private mode
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não salvou.");
    }
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{form.title}</SheetTitle>
          <SheetDescription>{FREQUENCY_LABEL[form.frequency]}</SheetDescription>
        </SheetHeader>
        {saved ? (
          <div className="flex flex-col gap-3 p-5">
            <p className="rounded-xl bg-emerald-500/10 p-3 text-sm">
              Salvo: {done.size} de {form.items.length} itens feitos.
            </p>
            <Button onClick={onClose}>Fechar</Button>
          </div>
        ) : (
          <form className="flex flex-col gap-4 p-5" onSubmit={save}>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm" htmlFor="op-day">
                Data
                <Input
                  id="op-day"
                  onChange={(e) => setDay(e.target.value)}
                  type="date"
                  value={day}
                />
              </label>
              {form.frequency === "log" ? (
                <label
                  className="flex flex-col gap-1 text-sm"
                  htmlFor="op-slot"
                >
                  Horário
                  <select
                    className="h-9 rounded-md border bg-transparent px-2"
                    id="op-slot"
                    onChange={(e) => setSlot(e.target.value)}
                    value={slot}
                  >
                    {form.slots.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <ul className="flex flex-col divide-y rounded-2xl border">
              {form.items.map((it) => (
                <li key={it.id}>
                  <label className="flex items-start gap-3 p-3 text-sm">
                    <input
                      checked={done.has(it.id)}
                      className="mt-0.5 size-5"
                      onChange={() => toggle(it.id)}
                      type="checkbox"
                    />
                    {it.text}
                  </label>
                </li>
              ))}
            </ul>
            <Button
              onClick={() => setDone(new Set(form.items.map((i) => i.id)))}
              size="sm"
              type="button"
              variant="ghost"
            >
              Marcar tudo
            </Button>
            <label className="flex flex-col gap-1 text-sm" htmlFor="op-by">
              Quem fez
              <Input
                id="op-by"
                onChange={(e) => setBy(e.target.value)}
                placeholder="Nome"
                value={by}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm" htmlFor="op-notes">
              Observações (opcional)
              <textarea
                className="min-h-20 rounded-md border bg-transparent p-2"
                id="op-notes"
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: acabou o sabonete, torneira pingando…"
                value={notes}
              />
            </label>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <Button type="submit">Salvar</Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

const ITEM_ID = /^i(\d+)$/;

/** Items from text lines, keeping the ids of lines that already existed. */
function itemsFrom(lines: string[], old: Form["items"]) {
  let next = Math.max(
    0,
    ...old.map((i) => Number(ITEM_ID.exec(i.id)?.[1] ?? 0))
  );
  return lines.map((text) => {
    const same = old.find((i) => i.text === text);
    if (same) {
      return same;
    }
    next += 1;
    return { id: `i${next}`, text };
  });
}

function FormEditor({
  company,
  data,
  form,
  onClose,
}: {
  company: string;
  data: Overview;
  form: Form | null;
  onClose: () => void;
}) {
  const save = useMutation(api.ops.saveForm);
  const remove = useMutation(api.ops.deleteForm);
  const [title, setTitle] = useState(form?.title ?? "");
  const [departmentId, setDept] = useState<string>(
    form?.departmentId ?? data.departments[0]?.id ?? ""
  );
  const [frequency, setFrequency] = useState<Frequency>(
    form?.frequency ?? "daily"
  );
  const [items, setItems] = useState(
    (form?.items ?? []).map((i) => i.text).join("\n")
  );
  const [slots, setSlots] = useState((form?.slots ?? []).join(", "));
  const [note, setNote] = useState(form?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const lines = items
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      await save({
        company,
        id: form?.id,
        departmentId: departmentId as Id<"opsDepartments">,
        title,
        frequency,
        items: itemsFrom(lines, form?.items ?? []),
        slots:
          frequency === "log"
            ? slots
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        note,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não salvou.");
    }
  };

  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>
            {form ? "Editar formulário" : "Novo formulário"}
          </SheetTitle>
          <SheetDescription>
            Um item por linha. Os textos saem no PDF.
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-col gap-4 p-5 text-sm" onSubmit={submit}>
          <label className="flex flex-col gap-1" htmlFor="fe-title">
            Título
            <Input
              id="fe-title"
              onChange={(e) => setTitle(e.target.value)}
              value={title}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1" htmlFor="fe-dept">
              Departamento
              <select
                className="h-9 rounded-md border bg-transparent px-2"
                id="fe-dept"
                onChange={(e) => setDept(e.target.value)}
                value={departmentId}
              >
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1" htmlFor="fe-freq">
              Frequência
              <select
                className="h-9 rounded-md border bg-transparent px-2"
                id="fe-freq"
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                value={frequency}
              >
                {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1" htmlFor="fe-items">
            Itens (um por linha)
            <textarea
              className="min-h-48 rounded-md border bg-transparent p-2"
              id="fe-items"
              onChange={(e) => setItems(e.target.value)}
              value={items}
            />
          </label>
          {frequency === "log" ? (
            <label className="flex flex-col gap-1" htmlFor="fe-slots">
              Horários (separados por vírgula)
              <Input
                id="fe-slots"
                onChange={(e) => setSlots(e.target.value)}
                placeholder="10:00, 11:00, 12:00"
                value={slots}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1" htmlFor="fe-note">
            Instrução no rodapé (opcional)
            <Input
              id="fe-note"
              onChange={(e) => setNote(e.target.value)}
              value={note}
            />
          </label>
          {error ? <p className="text-destructive">{error}</p> : null}
          <Button type="submit">Salvar</Button>
          {form ? (
            <Button
              onClick={async () => {
                if (confirm) {
                  await remove({ company, id: form.id });
                  onClose();
                }
                setConfirm(true);
              }}
              type="button"
              variant={confirm ? "destructive" : "ghost"}
            >
              {confirm
                ? "Toque de novo para apagar (o histórico fica)"
                : "Apagar formulário"}
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------- history --------------------------------- */

function HistoryTab({ company, data }: { company: string; data: Overview }) {
  const rows = useQuery(api.ops.history, { company });
  const [open, setOpen] = useState<string | null>(null);
  const venue = VENUES[company] ?? { name: company, accent: "#333" };
  const deptOf = useMemo(() => {
    const m = new Map(
      data.forms.map((f) => [f.id as string, deptName(data, f.departmentId)])
    );
    return (formId: string) => m.get(formId) ?? "";
  }, [data]);
  if (!rows) {
    return <p className="text-muted-foreground text-sm">Carregando…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum formulário preenchido ainda.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {rows.map((s) => {
        const total = s.items.length;
        const missing = s.items.filter((i) => !s.done.includes(i.id));
        return (
          <li className="p-3 text-sm" key={s.id}>
            <button
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setOpen(open === s.id ? null : s.id)}
              type="button"
            >
              <span>
                <span className="block font-medium">{s.title}</span>
                <span className="block text-muted-foreground text-xs">
                  {s.day}
                  {s.slot ? ` ${s.slot}` : ""} · {s.by}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs",
                  missing.length
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                )}
              >
                {s.done.length}/{total}
              </span>
            </button>
            {open === s.id ? (
              <div className="mt-2 flex flex-col gap-2">
                {missing.length ? (
                  <p className="text-amber-800 dark:text-amber-200">
                    Não feito: {missing.map((m) => m.text).join("; ")}
                  </p>
                ) : null}
                {s.notes ? (
                  <p className="text-muted-foreground">Obs.: {s.notes}</p>
                ) : null}
                <Button
                  className="self-start"
                  onClick={async () =>
                    savePdf(
                      await fillingPdf(s, venue, deptOf(s.formId)),
                      fileName(`${s.title} ${s.day}`)
                    )
                  }
                  size="sm"
                  variant="outline"
                >
                  PDF deste registro
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------- documents -------------------------------- */

function DocsTab({ company, data }: { company: string; data: Overview }) {
  const uploadUrl = useMutation(api.ops.uploadUrl);
  const add = useMutation(api.ops.addDocument);
  const remove = useMutation(api.ops.deleteDocument);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dept, setDept] = useState<string>(data.departments[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!(file && dept)) {
      setStatus("Escolha o departamento e o arquivo.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setStatus("Arquivo maior que 20 MB.");
      return;
    }
    setStatus("Enviando…");
    try {
      const mimeType = file.type || "application/octet-stream";
      const res = await fetch(await uploadUrl({}), {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await add({
        company,
        departmentId: dept as Id<"opsDepartments">,
        title: title || file.name,
        storageId,
        fileName: file.name,
        mimeType,
      });
      setTitle("");
      if (fileRef.current) {
        fileRef.current.value = "";
      }
      setStatus("Enviado.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falhou.");
    }
  };

  if (data.departments.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Crie um departamento primeiro.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2 rounded-2xl border bg-card p-3 text-sm"
        onSubmit={upload}
      >
        <p className="font-medium">Adicionar documento</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            aria-label="Departamento"
            className="h-9 rounded-md border bg-transparent px-2"
            onChange={(e) => setDept(e.target.value)}
            value={dept}
          >
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Input
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (ex.: Manual de alergênicos)"
            value={title}
          />
        </div>
        <input
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
          ref={fileRef}
          type="file"
        />
        <div className="flex items-center gap-3">
          <Button size="sm" type="submit">
            Enviar
          </Button>
          {status ? (
            <span className="text-muted-foreground">{status}</span>
          ) : null}
        </div>
      </form>
      {data.departments.map((d) => {
        const docs = data.documents.filter((x) => x.departmentId === d.id);
        if (docs.length === 0) {
          return null;
        }
        return (
          <section className="flex flex-col gap-2" key={d.id}>
            <p className="font-semibold">{d.name}</p>
            <ul className="divide-y rounded-2xl border bg-card">
              {docs.map((doc) => (
                <li
                  className="flex items-center gap-2 p-3 text-sm"
                  key={doc.id}
                >
                  <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                  {doc.url ? (
                    <a
                      className="underline"
                      href={doc.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Abrir
                    </a>
                  ) : null}
                  <Button
                    onClick={() => {
                      if (confirm === doc.id) {
                        remove({ company, id: doc.id });
                        setConfirm(null);
                      } else {
                        setConfirm(doc.id);
                      }
                    }}
                    size="sm"
                    variant={confirm === doc.id ? "destructive" : "ghost"}
                  >
                    {confirm === doc.id ? "Confirmar" : "Apagar"}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------ departments ------------------------------- */

function DeptRow({ company, d }: { company: string; d: Dept }) {
  const save = useMutation(api.ops.saveDepartment);
  const remove = useMutation(api.ops.deleteDepartment);
  const [name, setName] = useState(d.name);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex flex-col gap-1 p-3">
      <div className="flex items-center gap-2">
        <Input onChange={(e) => setName(e.target.value)} value={name} />
        <Button
          disabled={name.trim() === d.name || !name.trim()}
          onClick={() => save({ company, id: d.id, name })}
          size="sm"
          variant="outline"
        >
          Renomear
        </Button>
        <Button
          onClick={async () => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            setError(null);
            try {
              await remove({ company, id: d.id });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Falhou.");
              setConfirm(false);
            }
          }}
          size="sm"
          variant={confirm ? "destructive" : "ghost"}
        >
          {confirm ? "Confirmar" : "Apagar"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </li>
  );
}

function DeptsTab({ company, data }: { company: string; data: Overview }) {
  const save = useMutation(api.ops.saveDepartment);
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim()) {
            await save({ company, name });
            setName("");
          }
        }}
      >
        <Input
          onChange={(e) => setName(e.target.value)}
          placeholder="Novo departamento (ex.: Events)"
          value={name}
        />
        <Button type="submit">Adicionar</Button>
      </form>
      <ul className="divide-y rounded-2xl border bg-card text-sm">
        {data.departments.map((d) => (
          <DeptRow company={company} d={d} key={d.id} />
        ))}
      </ul>
    </div>
  );
}
