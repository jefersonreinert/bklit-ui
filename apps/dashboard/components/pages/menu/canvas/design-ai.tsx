"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/lib/icons";
import {
  applyAiEdit,
  designFromExtracted,
  imageElement,
  toAiElements,
} from "@/lib/menu-canvas/model";
import type {
  AiEdit,
  Design,
  DesignPage,
  ExtractedDesign,
} from "@/lib/menu-canvas/types";
import {
  callExtract,
  cropFraction,
  type PreparedFile,
  prepareFile,
} from "@/lib/upload";
import { cn } from "@/lib/utils";
import { transcribeClip } from "../../voice/voice-engine";
import { useUploadImage } from "./assets";

/**
 * AI in the design editor: (1) recreate a photographed menu as an
 * editable design (fonts matched to Google Fonts, logo and photos cut
 * out), (2) change anything on the page by typing or dictating.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const SUGGESTIONS = [
  "Deixe o cardápio mais elegante, estilo bistrô francês",
  "Troque todas as fontes dos pratos por uma serifada clássica",
  "Alinhe todos os preços à direita na mesma coluna",
  "Adicione um selo “Novo” ao lado do primeiro prato",
  "Use uma paleta verde-oliva e creme",
  "Crie uma seção de sobremesas com 3 pratos e preços",
];

async function requestEdit(
  design: Design,
  page: DesignPage,
  instruction: string
) {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/menu-design/edit/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        width: design.width,
        height: design.height,
        background: page.background,
        elements: toAiElements(page),
        instruction,
      }),
    });
  } catch {
    throw new Error("Sem conexão com o servidor.");
  }
  const body = (await res.json().catch(() => null)) as
    | (AiEdit & { error?: string })
    | null;
  if (!(res.ok && body)) {
    throw new Error(body?.error ?? `Falha da IA (${res.status}).`);
  }
  return body;
}

/** Records a short voice clip and returns its transcription. */
function useDictation(onText: (text: string) => void) {
  const recorder = useRef<MediaRecorder | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "transcribing">(
    "idle"
  );
  const [error, setError] = useState("");

  async function toggle() {
    if (state === "recording") {
      recorder.current?.stop();
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        for (const t of stream.getTracks()) {
          t.stop();
        }
        setState("transcribing");
        try {
          const text = await transcribeClip(
            new Blob(chunks, { type: rec.mimeType })
          );
          if (text.trim()) {
            onText(text.trim());
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Falha na transcrição.");
        } finally {
          setState("idle");
        }
      };
      recorder.current = rec;
      rec.start();
      setState("recording");
    } catch {
      setError("Microfone indisponível ou sem permissão.");
    }
  }
  return { state, error, toggle };
}

export function AiAssistant({
  design,
  page,
  onApply,
}: {
  design: Design;
  page: DesignPage;
  onApply: (next: DesignPage) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const dictation = useDictation((t) =>
    setText((prev) => (prev ? `${prev} ${t}` : t))
  );

  async function run(instruction = text) {
    const clean = instruction.trim();
    if (!clean) {
      return;
    }
    setBusy(true);
    try {
      const edit = await requestEdit(design, page, clean);
      onApply(applyAiEdit(page, edit));
      setLog((l) =>
        [{ ok: true, text: edit.message || "Feito." }, ...l].slice(0, 6)
      );
      setText("");
    } catch (e) {
      setLog((l) =>
        [
          { ok: false, text: e instanceof Error ? e.message : "Falhou." },
          ...l,
        ].slice(0, 6)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Escreva ou dite qualquer mudança: textos, fontes, cores, tamanhos,
        alinhamento, novas seções, ícones, formas. A IA altera a página atual e
        você pode desfazer (Ctrl+Z).
      </p>
      <Textarea
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            run();
          }
        }}
        placeholder="Ex.: “aumente o título, use a fonte Great Vibes e mude os preços para dourado”"
        rows={3}
        value={text}
      />
      <div className="flex gap-2">
        <Button
          aria-label={
            dictation.state === "recording" ? "Parar de gravar" : "Ditar"
          }
          disabled={busy || dictation.state === "transcribing"}
          onClick={dictation.toggle}
          variant={dictation.state === "recording" ? "destructive" : "outline"}
        >
          <Icon
            className={cn(
              "size-4",
              dictation.state === "recording" && "animate-pulse"
            )}
            name={
              dictation.state === "transcribing"
                ? "IconLoader"
                : "IconMicrophone"
            }
          />
          {dictation.state === "recording" ? "Parar" : "Ditar"}
        </Button>
        <Button
          className="flex-1"
          disabled={busy || !text.trim()}
          onClick={() => run()}
        >
          <Icon
            className={cn("size-4", busy && "animate-spin")}
            name={busy ? "IconLoader" : "IconSparklesSoft"}
          />
          {busy ? "A IA está editando…" : "Aplicar com IA"}
        </Button>
      </div>
      {dictation.error ? (
        <p className="text-destructive text-xs">{dictation.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            className="rounded-full border px-2.5 py-1 text-left text-xs hover:bg-muted"
            disabled={busy}
            key={s}
            onClick={() => run(s)}
            type="button"
          >
            {s}
          </button>
        ))}
      </div>
      {log.length ? (
        <ul className="flex flex-col gap-1 text-xs">
          {log.map((l, i) => (
            <li
              className={l.ok ? "text-muted-foreground" : "text-destructive"}
              key={`${i}-${l.text}`}
            >
              {l.ok ? "✓ " : "✕ "}
              {l.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------ recreate ------------------------------ */

/** Cuts the logo/photos the AI found out of the photos and places them. */
async function placeImages(
  design: Design,
  images: ReturnType<typeof designFromExtracted>["images"],
  files: PreparedFile[],
  upload: (src: string) => Promise<string>
) {
  for (const { pageId, regions } of images) {
    const page = design.pages.find((p) => p.id === pageId);
    for (const r of regions) {
      const photo = files[r.pageIndex]?.preview;
      if (!(page && photo)) {
        continue;
      }
      try {
        const crop = await cropFraction(
          photo,
          { x: r.box.x, y: r.box.y, width: r.box.w, height: r.box.h },
          1400
        );
        const el = imageElement({
          name: "Recorte",
          src: await upload(crop),
          fit: "contain",
          ...r.target,
        });
        // Images go behind the texts
        const idx = page.elements.findIndex((e) => e.type === "text");
        page.elements.splice(idx < 0 ? page.elements.length : idx, 0, el);
      } catch {
        // Tiny or invalid box: skip it
      }
    }
  }
}

export function RecreateDesignSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (d: Design) => void;
}) {
  const upload = useUploadImage();
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(list: FileList | null) {
    if (!list?.length) {
      return;
    }
    setError(null);
    try {
      const prepared = await Promise.all([...list].map(prepareFile));
      setFiles((prev) => [...prev, ...prepared].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arquivo inválido.");
    }
  }

  async function run() {
    setBusy("A IA está desenhando o cardápio… (1–3 minutos)");
    setError(null);
    try {
      const x = await callExtract<ExtractedDesign>("design", files, hint);
      const { design, images } = designFromExtracted(x);
      setBusy("Recortando logotipo e fotos…");
      await placeImages(design, images, files, upload);
      setFiles([]);
      setHint("");
      onCreated(design);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na leitura.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      onOpenChange={(o) => {
        if (!(o || busy)) {
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent
        className="acrylic w-full! gap-0 overflow-y-auto bg-popover sm:max-w-lg!"
        side="right"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>Recriar cardápio como design livre</SheetTitle>
          <SheetDescription>
            Tire uma foto ou envie o cardápio (imagem ou PDF). A IA redesenha
            cada página: posiciona textos, escolhe as fontes do Google mais
            parecidas, copia cores, linhas e molduras e recorta logotipo e
            fotos. Depois tudo é editável como no Canva.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-5">
          <input
            accept="image/*,application/pdf"
            className="hidden"
            multiple
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
            ref={pickRef}
            type="file"
          />
          <input
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
            ref={cameraRef}
            type="file"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={Boolean(busy)}
              onClick={() => cameraRef.current?.click()}
              variant="outline"
            >
              <Icon className="size-4" name="IconCamera1" />
              Tirar foto
            </Button>
            <Button
              disabled={Boolean(busy)}
              onClick={() => pickRef.current?.click()}
              variant="outline"
            >
              <Icon className="size-4" name="IconCloudUpload" />
              Fotos ou PDF
            </Button>
          </div>
          {files.length ? (
            <div className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <div
                  className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border bg-muted/40"
                  key={`${f.name}-${i}`}
                >
                  {f.preview ? (
                    // biome-ignore lint/performance/noImgElement: local data URL
                    <img
                      alt={f.name}
                      className="size-full object-cover"
                      height={160}
                      src={f.preview}
                      width={120}
                    />
                  ) : (
                    <Icon className="size-6" name="IconFilePdf" />
                  )}
                  <button
                    aria-label="Remover"
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                    type="button"
                  >
                    <Icon className="size-3" name="IconCrossSmall" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              Uma foto por página, reta e bem iluminada. Logos e fotos dos
              pratos são recortados das fotos (envie fotos, não PDF, para isso).
            </p>
          )}
          <Textarea
            onChange={(e) => setHint(e.target.value)}
            placeholder="Instruções opcionais (ex.: “só a primeira página”, “use fontes mais modernas”)"
            rows={2}
            value={hint}
          />
          {error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button disabled={!files.length || Boolean(busy)} onClick={run}>
            <Icon
              className={cn("size-4", busy && "animate-spin")}
              name={busy ? "IconLoader" : "IconSparklesSoft"}
            />
            {busy ?? "Recriar com IA"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
