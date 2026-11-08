"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useState } from "react";
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
import type { Status } from "@/lib/reservations/engine";
import { cn } from "@/lib/utils";
import { errText, STATUS_META, VENUE_NAMES } from "./reservations-shared";

/**
 * Guests of every venue: visits, no-shows, favourite venue, VIP, notes and
 * GDPR tools (marketing consent with its date, export, erasure).
 */

type Guest = NonNullable<FunctionReturnType<typeof api.guests.get>>;

export function GuestsView() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Id<"resGuests"> | null>(null);
  const list = useQuery(api.guests.list, { q: q || undefined });
  return (
    <div className="flex flex-col gap-3">
      <Input
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar cliente por nome, telefone ou e-mail…"
        value={q}
      />
      <p className="text-muted-foreground text-xs">
        Clientes criados automaticamente pelas reservas (telefone ou e-mail),
        compartilhados entre os bares.
      </p>
      {list === undefined ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : null}
      {list?.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 text-center text-muted-foreground text-sm">
          Nenhum cliente ainda.
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {(list ?? []).map((g) => (
          <button
            className="flex flex-col gap-1 rounded-2xl border bg-card p-3 text-left text-sm hover:bg-muted/50"
            key={g.id}
            onClick={() => setOpen(g.id)}
            type="button"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">
                {g.vip ? "★ " : ""}
                {g.name}
              </span>
              {g.noShows ? (
                <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-destructive text-xs">
                  {g.noShows} no-show
                </span>
              ) : null}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {[g.phone, g.email].filter(Boolean).join(" · ")}
            </span>
            <span className="text-xs">
              {g.visits} visita{g.visits === 1 ? "" : "s"} · {g.bookings}{" "}
              reserva{g.bookings === 1 ? "" : "s"}
              {g.lastVisit ? ` · última ${g.lastVisit}` : ""}
              {g.favourite
                ? ` · ${VENUE_NAMES[g.favourite] ?? g.favourite}`
                : ""}
            </span>
          </button>
        ))}
      </div>
      {open ? <GuestSheet id={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function GuestSheet({
  id,
  onClose,
}: {
  id: Id<"resGuests">;
  onClose: () => void;
}) {
  const g = useQuery(api.guests.get, { id });
  return (
    <Sheet onOpenChange={(o) => (o ? null : onClose())} open>
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{g?.name ?? "Cliente"}</SheetTitle>
          <SheetDescription>
            Ficha do cliente em todos os bares
          </SheetDescription>
        </SheetHeader>
        {g ? (
          <GuestBody g={g} key={g.id} onClose={onClose} />
        ) : (
          <p className="p-5 text-muted-foreground text-sm">Carregando…</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/60 p-2.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("font-semibold", tone)}>{value}</p>
    </div>
  );
}

function GuestBody({ g, onClose }: { g: Guest; onClose: () => void }) {
  const save = useMutation(api.guests.save);
  const forget = useMutation(api.guests.forget);
  const convex = useConvex();
  const [f, setF] = useState({
    name: g.name,
    phone: g.phone,
    email: g.email,
    vip: g.vip,
    tags: g.tags.join(", "),
    preferences: g.preferences,
    occasions: g.occasions,
    notes: g.notes,
    marketing: g.marketing,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("Salvando…");
    try {
      await save({
        id: g.id,
        ...f,
        phone: f.phone || undefined,
        email: f.email || undefined,
        tags: f.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setStatus("Salvo.");
    } catch (err) {
      setStatus(errText(err, "Não salvou."));
    }
  };

  const exportJson = async () => {
    const data = await convex.query(api.guests.exportData, { id: g.id });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `guest-${g.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const field = (k: keyof typeof f, label: string, ph = "") => (
    <label className="flex flex-col gap-1" htmlFor={`g-${k}`}>
      {label}
      <Input
        id={`g-${k}`}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        placeholder={ph}
        value={String(f[k])}
      />
    </label>
  );

  const s = g.stats;
  return (
    <div className="flex flex-col gap-5 p-5 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Visitas" value={s.visits} />
        <Stat label="Reservas" value={s.bookings} />
        <Stat
          label="No-shows"
          tone={s.noShows ? "text-destructive" : undefined}
          value={s.noShows}
        />
        <Stat label="Cancelamentos" value={s.cancellations} />
        <Stat label="Grupo médio" value={s.avgParty} />
        <Stat
          label="Bar preferido"
          value={s.favourite ? (VENUE_NAMES[s.favourite] ?? s.favourite) : "—"}
        />
      </div>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        {field("name", "Nome")}
        <div className="grid grid-cols-2 gap-2">
          {field("phone", "Telefone")}
          {field("email", "E-mail")}
        </div>
        {field(
          "preferences",
          "Preferências",
          "Mesa no terraço, sem glúten, gosta de Negroni…"
        )}
        {field(
          "occasions",
          "Ocasiões especiais",
          "Aniversário 14/03, casamento 02/09"
        )}
        {field("tags", "Etiquetas (vírgula)", "regular, influencer, empresa")}
        {field("notes", "Notas internas")}
        <label className="flex items-center gap-2">
          <input
            checked={f.vip}
            onChange={(e) => setF({ ...f, vip: e.target.checked })}
            type="checkbox"
          />
          Cliente VIP
        </label>
        <label className="flex items-start gap-2">
          <input
            checked={f.marketing}
            className="mt-1"
            onChange={(e) => setF({ ...f, marketing: e.target.checked })}
            type="checkbox"
          />
          <span>
            Aceita receber ofertas e novidades (consentimento GDPR)
            {g.consentAt ? (
              <span className="block text-muted-foreground text-xs">
                Registrado em {new Date(g.consentAt).toLocaleString("pt-PT")}
              </span>
            ) : null}
          </span>
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit">Salvar</Button>
          {status ? (
            <span className="text-muted-foreground">{status}</span>
          ) : null}
        </div>
      </form>
      <section className="flex flex-col gap-1.5">
        <p className="font-semibold">Histórico</p>
        {g.history.map((h) => (
          <div
            className="flex items-center justify-between gap-2 border-b py-1.5 text-xs"
            key={h.id}
          >
            <span>
              {h.date} {h.time} · {VENUE_NAMES[h.company] ?? h.company} ·{" "}
              {h.party} pax
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5",
                STATUS_META[h.status as Status]?.tone
              )}
            >
              {STATUS_META[h.status as Status]?.label ?? h.status}
            </span>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-2 rounded-2xl border p-3">
        <p className="font-semibold">Dados pessoais (GDPR)</p>
        <p className="text-muted-foreground text-xs">
          Exporte tudo o que temos sobre o cliente, ou apague a pedido dele: a
          ficha é excluída e as reservas ficam anônimas para os relatórios.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson} size="sm" variant="outline">
            Exportar dados
          </Button>
          <Button
            onClick={async () => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              await forget({ id: g.id });
              onClose();
            }}
            size="sm"
            variant={confirm ? "destructive" : "ghost"}
          >
            {confirm
              ? "Toque de novo: apagar para sempre"
              : "Apagar dados do cliente"}
          </Button>
        </div>
      </section>
    </div>
  );
}
