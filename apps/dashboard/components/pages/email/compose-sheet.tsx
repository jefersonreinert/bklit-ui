"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/lib/icons";
import type { MailDraftInput } from "@/lib/mail-types";

export interface ComposeState extends MailDraftInput {
  title: string;
}

export const EMPTY_COMPOSE: ComposeState = {
  title: "Novo e-mail",
  to: "",
  cc: "",
  subject: "",
  body: "",
};

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const LIST_SEPARATOR = /[,;]/;
const ANGLE = /<([^>]+)>/;

/** Accepts "a@x.com, Nome <b@y.com>". */
function validRecipients(value: string) {
  const parts = value
    .split(LIST_SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    parts.length > 0 && parts.every((p) => EMAIL.test(ANGLE.exec(p)?.[1] ?? p))
  );
}

export function ComposeSheet({
  open,
  initial,
  demo,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  initial: ComposeState;
  demo: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (input: MailDraftInput, asDraft: boolean) => Promise<void>;
}) {
  const [form, setForm] = useState<ComposeState>(initial);
  const [showCc, setShowCc] = useState(false);
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setShowCc(Boolean(initial.cc));
      setError(null);
    }
  }, [open, initial]);

  const set = (key: keyof ComposeState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (asDraft: boolean) => {
    if (!validRecipients(form.to)) {
      setError("Informe pelo menos um destinatário válido.");
      return;
    }
    if (form.cc && !validRecipients(form.cc)) {
      setError("Confira os e-mails em Cc.");
      return;
    }
    setBusy(asDraft ? "draft" : "send");
    setError(null);
    try {
      const { title: _title, ...input } = form;
      await onSend(input, asDraft);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full! max-w-full! gap-0 bg-background p-0 sm:max-w-xl! md:w-[560px]!"
        side="right"
      >
        <div className="flex h-12 shrink-0 items-center border-b px-4 pr-12">
          <SheetTitle className="font-medium text-sm">{form.title}</SheetTitle>
          {demo ? (
            <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
              Exemplo — não envia de verdade
            </span>
          ) : null}
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="flex items-center gap-2 border-b px-4">
            <label
              className="w-12 text-muted-foreground text-sm"
              htmlFor="mail-to"
            >
              Para
            </label>
            <Input
              autoComplete="email"
              className="border-0 bg-transparent! px-0 shadow-none focus-visible:ring-0"
              id="mail-to"
              inputMode="email"
              onChange={(e) => set("to")(e.target.value)}
              placeholder="nome@empresa.com"
              value={form.to}
            />
            {showCc ? null : (
              <button
                className="text-muted-foreground text-xs hover:text-foreground"
                onClick={() => setShowCc(true)}
                type="button"
              >
                Cc
              </button>
            )}
          </div>
          {showCc ? (
            <div className="flex items-center gap-2 border-b px-4">
              <label
                className="w-12 text-muted-foreground text-sm"
                htmlFor="mail-cc"
              >
                Cc
              </label>
              <Input
                className="border-0 bg-transparent! px-0 shadow-none focus-visible:ring-0"
                id="mail-cc"
                inputMode="email"
                onChange={(e) => set("cc")(e.target.value)}
                value={form.cc ?? ""}
              />
            </div>
          ) : null}
          <div className="flex items-center gap-2 border-b px-4">
            <label
              className="w-12 text-muted-foreground text-sm"
              htmlFor="mail-subject"
            >
              Assunto
            </label>
            <Input
              className="border-0 bg-transparent! px-0 shadow-none focus-visible:ring-0"
              id="mail-subject"
              onChange={(e) => set("subject")(e.target.value)}
              value={form.subject}
            />
          </div>
          <Textarea
            aria-label="Mensagem"
            className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent! p-4 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
            onChange={(e) => set("body")(e.target.value)}
            placeholder="Escreva sua mensagem…"
            value={form.body}
          />
          {error ? (
            <p className="px-4 pb-2 text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2 border-t p-3">
            <Button disabled={busy !== null} type="submit">
              <Icon className="size-4" name="IconPaperPlane" />
              {busy === "send" ? "Enviando…" : "Enviar"}
            </Button>
            <Button
              disabled={busy !== null}
              onClick={() => submit(true)}
              type="button"
              variant="outline"
            >
              {busy === "draft" ? "Salvando…" : "Salvar rascunho"}
            </Button>
            <Button
              aria-label="Descartar"
              className="ml-auto"
              onClick={() => onOpenChange(false)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Icon className="size-4" name="IconTrashCan" />
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
