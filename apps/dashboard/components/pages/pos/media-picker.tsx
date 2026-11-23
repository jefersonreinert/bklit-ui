"use client";

import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Icon } from "@/lib/icons";
import { errorText, getSession, sendPos } from "@/lib/pos/store";
import { convexClient } from "@/lib/sync/convex-client";
import { cn } from "@/lib/utils";

/**
 * Bottle photo and brand logo of a POS product or stock item. The picture
 * is shrunk in the browser (photos 1200 px, logos 600 px, WebP/PNG), sent
 * straight to Convex storage and attached to the product, the stock item
 * and every same-name product of the group's bars (convex/media.ts).
 */

type Kind = "image" | "logo";

const MAX_SIDE: Record<Kind, number> = { image: 1200, logo: 600 };

/** Shrinks a picture; keeps transparency (logos) as WebP or PNG. */
async function shrink(file: File, kind: Kind): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_SIDE[kind] / Math.max(bitmap.width, bitmap.height)
  );
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) {
    return file;
  }
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality)
    );
  // WebP keeps transparency and is small; Safari may hand back PNG instead
  const webp = await encode("image/webp", 0.88);
  if (webp && webp.type === "image/webp") {
    return webp;
  }
  if (kind === "logo") {
    return (await encode("image/png")) ?? file;
  }
  return (await encode("image/jpeg", 0.88)) ?? file;
}

function Slot({
  kind,
  url,
  disabled,
  onPick,
  onRemove,
  onClean,
  busy,
}: {
  kind: Kind;
  url?: string;
  disabled: boolean;
  busy: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  onClean: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const label =
    kind === "image" ? "Foto da garrafa / produto" : "Logo da marca";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <button
        className={cn(
          "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border bg-muted/40 transition-colors hover:bg-muted",
          kind === "logo" && "aspect-[4/3]",
          url
            ? "border-solid bg-[conic-gradient(var(--muted)_25%,transparent_0_50%,var(--muted)_0_75%,transparent_0)] bg-[length:16px_16px]"
            : "border-dashed",
          disabled && "opacity-50"
        )}
        disabled={disabled || Boolean(busy)}
        onClick={() => input.current?.click()}
        type="button"
      >
        {url ? (
          // biome-ignore lint/performance/noImgElement: storage URL, any size
          <img
            alt={label}
            height={400}
            width={400}
            className={cn(
              "size-full",
              kind === "image" ? "object-contain p-2" : "object-contain p-4"
            )}
            src={url}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 px-2 text-center text-muted-foreground text-xs">
            <Icon
              className="size-6"
              name={kind === "image" ? "IconBottle" : "IconSparklesSoft"}
            />
            {busy ?? "Toque para enviar"}
          </span>
        )}
        {busy && url ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70 px-2 text-center text-xs">
            {busy}
          </span>
        ) : null}
      </button>
      <input
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) {
            onPick(file);
          }
        }}
        ref={input}
        type="file"
      />
      {url && !disabled ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <button
            className="flex items-center gap-1 font-medium underline"
            disabled={Boolean(busy)}
            onClick={onClean}
            type="button"
          >
            <Icon className="size-3.5" name="IconSparklesSoft" />
            Remover fundo
          </button>
          <button
            className="text-muted-foreground underline"
            disabled={Boolean(busy)}
            onClick={() => input.current?.click()}
            type="button"
          >
            Trocar
          </button>
          <button
            className="text-destructive underline"
            disabled={Boolean(busy)}
            onClick={onRemove}
            type="button"
          >
            Remover
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function MediaPicker({
  company,
  target,
  id,
  image,
  logo,
  disabled,
  note,
}: {
  company: string;
  target: "product" | "item";
  /** POS product id (cid) or stock item id; empty while not saved yet. */
  id: string;
  image?: string;
  logo?: string;
  disabled?: boolean;
  note?: string;
}) {
  const [busy, setBusy] = useState<{ kind: Kind; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<{ image?: string; logo?: string }>({});
  const urlOf = (kind: Kind) => {
    if (kind in shown) {
      return shown[kind];
    }
    return kind === "image" ? image : logo;
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: shrink, upload and attach in one go
  const put = async (kind: Kind, file: File | null) => {
    setError(null);
    setBusy({ kind, text: file ? "Enviando…" : "Removendo…" });
    try {
      let storageId: string | undefined;
      if (file) {
        if (!file.type.startsWith("image/")) {
          throw new Error("Escolha uma imagem (JPG, PNG, WebP ou HEIC).");
        }
        const blob = await shrink(file, kind);
        const url = await sendPos(api.media.uploadUrl, { company });
        if (!url) {
          throw new Error("Sem permissão para enviar imagens.");
        }
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": blob.type || file.type },
          body: blob,
        });
        if (!res.ok) {
          throw new Error("O envio falhou. Tente de novo.");
        }
        storageId = ((await res.json()) as { storageId: string }).storageId;
      }
      const done = await sendPos(api.media.attach, {
        company,
        target,
        id,
        kind,
        storageId: storageId as Id<"_storage"> | undefined,
      });
      if (done) {
        setShown((s) => ({ ...s, [kind]: done.url ?? undefined }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  /** Transparent background (self-hosted rembg, convex/media.ts). */
  const clean = async (kind: Kind) => {
    setError(null);
    setBusy({ kind, text: "Removendo o fundo… (alguns segundos)" });
    try {
      const client = convexClient();
      if (!client) {
        throw new Error("Sem conexão com o servidor.");
      }
      const r = await client.action(api.media.removeBackground, {
        session: getSession() ?? undefined,
        company,
        target,
        id,
        kind,
      });
      setShown((s) => ({ ...s, [kind]: r.url ?? undefined }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const off = disabled || !id;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        {(["image", "logo"] as const).map((kind) => (
          <Slot
            busy={busy?.kind === kind ? busy.text : null}
            disabled={off}
            key={kind}
            kind={kind}
            onPick={(f) => put(kind, f)}
            onClean={() => clean(kind)}
            onRemove={() => put(kind, null)}
            url={urlOf(kind)}
          />
        ))}
      </div>
      {id ? null : (
        <p className="text-muted-foreground text-xs">
          Salve primeiro; depois envie a foto e o logo.
        </p>
      )}
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

/** Small square thumbnail for lists (photo, else logo, else nothing). */
export function MediaThumb({
  image,
  logo,
  className,
}: {
  image?: string;
  logo?: string;
  className?: string;
}) {
  const src = image || logo;
  if (!src) {
    return null;
  }
  return (
    // biome-ignore lint/performance/noImgElement: storage URL, any size
    <img
      alt=""
      height={48}
      width={48}
      className={cn(
        "shrink-0 rounded-lg bg-muted/40 object-contain",
        className
      )}
      loading="lazy"
      src={src}
    />
  );
}
