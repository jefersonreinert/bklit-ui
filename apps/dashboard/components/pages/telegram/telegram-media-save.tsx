"use client";

import { useAction, useConvex } from "convex/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import {
  browserTimeZone,
  downloadUrl,
  downloadZip,
} from "@/lib/telegram/download";
import { KIND_LABEL, MEDIA_KINDS, type MediaKind } from "@/lib/telegram/media";
import { cn } from "@/lib/utils";
import { Notice } from "./telegram-shared";

/**
 * Downloading media from a conversation: one message at a time (the
 * "Baixar" button on a bubble) or every file of the chat into the gallery,
 * page by page, with an optional .zip at the end.
 */

/** Saves one message's file to the gallery, then to this device. */
export function MediaButton({
  chatId,
  messageId,
}: {
  chatId: string;
  messageId: number;
}) {
  const save = useAction(api.mtproto.saveMedia);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setState("busy");
    setError(null);
    try {
      const r = await save({
        chatId,
        messageIds: [messageId],
        tz: browserTimeZone(),
      });
      const item = r.items[0];
      if (!(r.ok && item?.url)) {
        throw new Error(r.message ?? r.skipped[0]?.reason ?? "Sem arquivo.");
      }
      await downloadUrl(item.url, item.fileName);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
      setState("error");
    }
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <Button
        disabled={state === "busy"}
        onClick={onClick}
        size="sm"
        variant="outline"
      >
        <Icon
          className="size-4"
          name={state === "busy" ? "IconLoader" : "IconArrowDown"}
        />
        {state === "done" ? "Baixado · na galeria" : "Baixar"}
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </span>
  );
}

interface Progress {
  scanned: number;
  saved: number;
  already: number;
  skipped: number;
  running: boolean;
  finished: boolean;
  error: string | null;
}

const EMPTY: Progress = {
  scanned: 0,
  saved: 0,
  already: 0,
  skipped: 0,
  running: false,
  finished: false,
  error: null,
};

function KindPicker({
  kinds,
  onChange,
  disabled,
}: {
  kinds: MediaKind[];
  onChange: (k: MediaKind[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MEDIA_KINDS.map((k) => {
        const on = kinds.includes(k);
        return (
          <button
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on ? "border-primary bg-primary/10" : "hover:bg-muted/50"
            )}
            disabled={disabled}
            key={k}
            onClick={() =>
              onChange(on ? kinds.filter((x) => x !== k) : [...kinds, k])
            }
            type="button"
          >
            {KIND_LABEL[k]}
          </button>
        );
      })}
    </div>
  );
}

/** "Salvar todas as mídias": walks the whole history into the gallery. */
export function SaveAllPanel({
  chatId,
  chatName,
  onOpenGallery,
}: {
  chatId: string;
  chatName: string;
  onOpenGallery: (chatId: string) => void;
}) {
  const save = useAction(api.mtproto.saveMedia);
  const convex = useConvex();
  const [kinds, setKinds] = useState<MediaKind[]>([
    "photo",
    "video",
    "audio",
    "voice",
    "pdf",
    "document",
  ]);
  const [p, setP] = useState<Progress>(EMPTY);
  const [zipping, setZipping] = useState<string | null>(null);
  const stop = useRef(false);

  async function start() {
    stop.current = false;
    setP({ ...EMPTY, running: true });
    let offsetId: number | undefined;
    const tz = browserTimeZone();
    for (;;) {
      const r = await save({
        chatId,
        kinds,
        tz,
        ...(offsetId ? { offsetId } : {}),
      }).catch((err: unknown) => ({
        ok: false,
        message: err instanceof Error ? err.message : "Falhou.",
        saved: 0,
        already: 0,
        skipped: [],
        scanned: 0,
        nextOffsetId: null,
        items: [],
      }));
      setP((prev) => ({
        ...prev,
        scanned: prev.scanned + r.scanned,
        saved: prev.saved + r.saved,
        already: prev.already + r.already,
        skipped: prev.skipped + r.skipped.length,
        error: r.ok ? null : (r.message ?? "Falhou."),
      }));
      if (!r.ok || r.nextOffsetId === null || stop.current) {
        break;
      }
      offsetId = r.nextOffsetId;
    }
    setP((prev) => ({ ...prev, running: false, finished: !stop.current }));
  }

  async function zipAll() {
    setZipping("Preparando…");
    try {
      const ids = await convex.query(api.tgmedia.allIds, { chatId, kinds });
      const items = await convex.query(api.tgmedia.urls, {
        ids: ids.map((i) => i.id),
      });
      await downloadZip(
        items.map((i) => ({ url: i.url, fileName: i.fileName, folder: i.day })),
        `telegram-${chatName.replace(/[^\w-]+/g, "_")}.zip`,
        (done, total) => setZipping(`Baixando ${done} de ${total}…`)
      );
      setZipping(null);
    } catch (err) {
      setZipping(null);
      setP((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Falhou.",
      }));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <p className="font-medium text-sm">
        Salvar todas as mídias desta conversa
      </p>
      <KindPicker disabled={p.running} kinds={kinds} onChange={setKinds} />
      {p.running || p.finished || p.scanned > 0 ? (
        <p className="text-muted-foreground text-xs">
          {p.scanned} mensagens lidas · {p.saved} arquivos novos · {p.already}{" "}
          já estavam na galeria
          {p.skipped ? ` · ${p.skipped} ignorados` : ""}
          {p.running ? " · trabalhando…" : ""}
          {p.finished ? " · concluído ✓" : ""}
        </p>
      ) : null}
      {p.error ? <Notice tone="error">{p.error}</Notice> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {p.running ? (
          <Button
            onClick={() => {
              stop.current = true;
            }}
            size="sm"
            variant="outline"
          >
            Parar
          </Button>
        ) : (
          <Button disabled={kinds.length === 0} onClick={start} size="sm">
            <Icon className="size-4" name="IconArrowDown" />
            {p.finished ? "Verificar de novo" : "Salvar na galeria"}
          </Button>
        )}
        <Button
          disabled={p.running || Boolean(zipping)}
          onClick={zipAll}
          size="sm"
          variant="outline"
        >
          {zipping ?? "Baixar tudo (.zip)"}
        </Button>
        <Button onClick={() => onOpenGallery(chatId)} size="sm" variant="ghost">
          Ver na galeria
        </Button>
      </div>
    </div>
  );
}
