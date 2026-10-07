"use client";

import { Icon } from "@/lib/icons";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { CameraSheet, useDictation } from "@/components/pages/ai/attachments";
import { cn } from "@/lib/utils";

const CLAY = "#d97757";
const ROUND =
  "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors";
const SOFT = "bg-muted/70 text-foreground hover:bg-muted";

/** Camera shot (JPEG data URL) → File for the WhatsApp upload. */
async function dataUrlToFile(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
}

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");
  useEffect(() => {
    if (!isImage) {
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImage]);

  const remove = (
    <button
      aria-label="Remover anexo"
      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow"
      onClick={onRemove}
      type="button"
    >
      <Icon className="size-3" name="IconCrossSmall" />
    </button>
  );
  return (
    <div className="flex px-1 pt-1">
      <div className="relative">
        {isImage && url ? (
          // biome-ignore lint/performance/noImgElement: local object URL
          <img
            alt="Anexo"
            className="size-16 rounded-xl border object-cover"
            height={64}
            src={url}
            width={64}
          />
        ) : (
          <div className="flex h-16 max-w-64 items-center gap-2 rounded-xl border bg-muted/40 px-3 text-sm">
            <Icon className="size-5 shrink-0" name="IconFileText" />
            <span className="min-w-0 truncate">{file.name}</span>
          </div>
        )}
        {remove}
      </div>
    </div>
  );
}

/** Message box with the assistant's look: text on top, actions below. */
export function WaComposer({
  onSend,
}: {
  onSend: (text: string, file: File | null) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dictation = useDictation((t) =>
    setText((d) => (d.trim() ? `${d.trimEnd()} ${t}` : t))
  );
  const ready = Boolean(text.trim() || file) && !sending;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!ready) {
      return;
    }
    dictation.stop();
    setSending(true);
    if (await onSend(text.trim(), file)) {
      setText("");
      setFile(null);
    }
    setSending(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <form
        className="acrylic flex flex-col gap-2 rounded-[28px] border bg-card p-2.5 shadow-sm transition-shadow focus-within:shadow-md"
        onSubmit={submit}
      >
        {file ? (
          <FilePreview file={file} onRemove={() => setFile(null)} />
        ) : null}
        {dictation.listening ? (
          <p className="flex items-center gap-2 px-1.5 text-muted-foreground text-xs">
            <span
              className="size-2 animate-pulse rounded-full"
              style={{ backgroundColor: CLAY }}
            />
            {dictation.interim || "Ouvindo… fale normalmente"}
          </p>
        ) : null}
        {dictation.error ? (
          <p className="px-1.5 text-destructive text-xs">{dictation.error}</p>
        ) : null}
        <textarea
          aria-label="Mensagem"
          className="field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent px-3 pt-2 text-[17px] leading-relaxed outline-none placeholder:text-muted-foreground"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={file ? "Legenda (opcional)" : "Mensagem"}
          rows={1}
          value={text}
        />
        <div className="flex items-center gap-1.5">
          <input
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
            ref={fileInput}
            tabIndex={-1}
            type="file"
          />
          <button
            aria-label="Anexar foto ou arquivo"
            className={cn(ROUND, SOFT)}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            <Icon className="size-5" name="IconPlusLarge" />
          </button>
          <button
            aria-label="Abrir a câmera"
            className={cn(ROUND, SOFT)}
            onClick={() => setCameraOpen(true)}
            type="button"
          >
            <Icon className="size-5" name="IconCamera1" />
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              aria-label={
                dictation.listening ? "Parar o ditado" : "Ditar pelo microfone"
              }
              aria-pressed={dictation.listening}
              className={cn(
                ROUND,
                dictation.listening ? "animate-pulse text-white" : SOFT
              )}
              onClick={dictation.toggle}
              style={
                dictation.listening ? { backgroundColor: CLAY } : undefined
              }
              type="button"
            >
              <Icon className="size-5" name="IconMicrophone" />
            </button>
            <button
              aria-label="Enviar"
              className={cn(
                ROUND,
                "bg-foreground text-background disabled:opacity-40"
              )}
              disabled={!ready}
              type="submit"
            >
              <Icon className="size-5" name="IconArrowUp" />
            </button>
          </div>
        </div>
      </form>
      {cameraOpen ? (
        <CameraSheet
          onCapture={async (a) => {
            setFile(await dataUrlToFile(a.full ?? a.thumb));
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      ) : null}
    </>
  );
}
