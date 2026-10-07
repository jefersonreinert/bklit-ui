"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { CameraSheet, useDictation } from "@/components/pages/ai/attachments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CodeSessionSummary } from "@/lib/code/types";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type CodeMode = CodeSessionSummary["mode"];

export interface ImagePayload {
  mediaType: string;
  data: string;
  preview: string;
}

export const MODES: {
  id: CodeMode;
  label: string;
  hint: string;
  icon: IconName;
}[] = [
  {
    id: "auto",
    label: "Auto",
    hint: "Um classificador aprova as ações seguras",
    icon: "IconSparklesSoft",
  },
  {
    id: "acceptEdits",
    label: "Aceitar edições",
    hint: "Edita arquivos sozinho; comandos pedem aprovação",
    icon: "IconPencil",
  },
  {
    id: "plan",
    label: "Planejar",
    hint: "Só investiga e propõe um plano, sem alterar nada",
    icon: "IconChecklist",
  },
];

const CLAY = "#d97757";
const ROUND =
  "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors";
const SOFT = "bg-muted/70 text-foreground hover:bg-muted";
const MAX_SIDE = 1600;

/** Photo → downscaled JPEG/PNG base64 (keeps uploads small). */
export async function toImagePayload(
  file: File | string
): Promise<ImagePayload> {
  const src = typeof file === "string" ? file : URL.createObjectURL(file);
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = typeof file !== "string" && file.type === "image/png";
  const mediaType = png ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(mediaType, 0.85);
  if (typeof file !== "string") {
    URL.revokeObjectURL(src);
  }
  return {
    mediaType,
    data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    preview: dataUrl,
  };
}

export function ModeMenu({
  mode,
  onMode,
  disabled,
}: {
  mode: CodeMode;
  onMode: (m: CodeMode) => void;
  disabled?: boolean;
}) {
  const current = MODES.find((m) => m.id === mode) ?? MODES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <button
            className="flex h-10 items-center gap-1.5 rounded-full bg-muted/70 px-3.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            type="button"
          />
        }
      >
        <Icon className="size-4" name={current?.icon ?? "IconSparklesSoft"} />
        {current?.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {MODES.map((m) => (
          <DropdownMenuItem
            className="items-start gap-3 py-2"
            key={m.id}
            onClick={() => onMode(m.id)}
          >
            <Icon className="mt-0.5 size-4" name={m.icon} />
            <span className="flex flex-1 flex-col">
              <span className="font-medium">{m.label}</span>
              <span className="text-muted-foreground text-xs">{m.hint}</span>
            </span>
            {m.id === mode ? (
              <Icon className="mt-0.5 size-4" name="IconCheckmark1" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Previews({
  images,
  onRemove,
}: {
  images: ImagePayload[];
  onRemove: (i: number) => void;
}) {
  if (!images.length) {
    return null;
  }
  return (
    <div className="flex gap-2 overflow-x-auto px-1 pt-1">
      {images.map((img, i) => (
        <div className="relative shrink-0" key={img.preview.slice(-40)}>
          {/* biome-ignore lint/performance/noImgElement: local data URL */}
          <img
            alt="Anexo"
            className="size-16 rounded-xl border object-cover"
            height={64}
            src={img.preview}
            width={64}
          />
          <button
            aria-label="Remover anexo"
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow"
            onClick={() => onRemove(i)}
            type="button"
          >
            <Icon className="size-3" name="IconCrossSmall" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** The session's message box: text, photos, dictation, mode and send/stop. */
export function CodeComposer({
  placeholder,
  mode,
  onMode,
  modeLocked,
  working,
  onSend,
  onStop,
  autoFocus,
  children,
}: {
  placeholder: string;
  mode: CodeMode;
  onMode: (m: CodeMode) => void;
  modeLocked?: boolean;
  working?: boolean;
  onSend: (text: string, images: ImagePayload[]) => Promise<boolean>;
  onStop?: () => void;
  autoFocus?: boolean;
  children?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImagePayload[]>([]);
  const [sending, setSending] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation((t) =>
    setText((d) => (d.trim() ? `${d.trimEnd()} ${t}` : t))
  );
  const ready = Boolean(text.trim() || images.length) && !sending;

  useEffect(() => {
    if (autoFocus) {
      area.current?.focus();
    }
  }, [autoFocus]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!ready) {
      return;
    }
    dictation.stop();
    setSending(true);
    if (await onSend(text.trim(), images)) {
      setText("");
      setImages([]);
    }
    setSending(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  const addFiles = async (files: FileList | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    const next = await Promise.all(list.slice(0, 4).map(toImagePayload));
    setImages((cur) => [...cur, ...next].slice(0, 4));
  };

  return (
    <>
      <form
        className="acrylic flex flex-col gap-2 rounded-[28px] border bg-card p-2.5 shadow-sm transition-shadow focus-within:shadow-md"
        onSubmit={submit}
      >
        {children}
        <Previews
          images={images}
          onRemove={(i) => setImages((cur) => cur.filter((_, j) => j !== i))}
        />
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
          aria-label="Mensagem para o Claude"
          className="field-sizing-content max-h-48 min-h-11 w-full resize-none bg-transparent px-3 pt-2 text-[17px] leading-relaxed outline-none placeholder:text-muted-foreground"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          ref={area}
          rows={1}
          value={text}
        />
        <div className="flex items-center gap-1.5">
          <input
            accept="image/*"
            className="sr-only"
            multiple
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            ref={fileInput}
            tabIndex={-1}
            type="file"
          />
          <button
            aria-label="Anexar fotos"
            className={cn(ROUND, SOFT)}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            <Icon className="size-5" name="IconPlusLarge" />
          </button>
          <button
            aria-label="Abrir a câmera"
            className={cn(ROUND, SOFT, "hidden sm:flex")}
            onClick={() => setCameraOpen(true)}
            type="button"
          >
            <Icon className="size-5" name="IconCamera1" />
          </button>
          <ModeMenu disabled={modeLocked} mode={mode} onMode={onMode} />
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
            {working && !ready && onStop ? (
              <button
                aria-label="Interromper"
                className={cn(ROUND, "bg-foreground text-background")}
                onClick={onStop}
                type="button"
              >
                <Icon className="size-4" name="IconStop" />
              </button>
            ) : (
              <button
                aria-label="Enviar"
                className={cn(ROUND, "text-white disabled:opacity-40")}
                disabled={!ready}
                style={{ backgroundColor: CLAY }}
                type="submit"
              >
                <Icon className="size-5" name="IconArrowUp" />
              </button>
            )}
          </div>
        </div>
      </form>
      {cameraOpen ? (
        <CameraSheet
          onCapture={async (a) => {
            const img = await toImagePayload(a.full ?? a.thumb);
            setImages((cur) => [...cur, img].slice(0, 4));
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      ) : null}
    </>
  );
}
