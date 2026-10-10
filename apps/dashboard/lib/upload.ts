"use client";

/**
 * Prepares photos and PDFs for the AI readers: photos are resized (long
 * side ≤ 2000 px, JPEG) so a phone picture is a few hundred KB, PDFs go
 * as they are. Also crops logos out of photos and makes thumbnails.
 */

export interface UploadFile {
  data: string;
  mimeType: string;
}

const MAX_SIDE = 2000;
const PDF = /\.pdf$/i;

const toBase64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Imagem inválida."));
    img.src = src;
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function draw(img: HTMLImageElement, maxSide: number, type = "image/jpeg") {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas indisponível.");
  }
  if (type === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, 0.85);
}

export interface PreparedFile extends UploadFile {
  name: string;
  /** Data URL of the resized photo (null for PDFs). */
  preview: string | null;
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  if (file.type === "application/pdf" || PDF.test(file.name)) {
    const url = await readAsDataUrl(file);
    return {
      name: file.name,
      data: toBase64(url),
      mimeType: "application/pdf",
      preview: null,
    };
  }
  const url = await readAsDataUrl(file);
  const img = await loadImage(url);
  const jpeg = draw(img, MAX_SIDE);
  return {
    name: file.name,
    data: toBase64(jpeg),
    mimeType: "image/jpeg",
    preview: jpeg,
  };
}

/** Cuts a box (fractions of the photo) out as a transparent-friendly PNG. */
export async function cropFraction(
  src: string,
  box: { x: number; y: number; width: number; height: number },
  maxSide = 480
): Promise<string> {
  const img = await loadImage(src);
  const pad = 0.01;
  const x = Math.max(0, (box.x - pad) * img.width);
  const y = Math.max(0, (box.y - pad) * img.height);
  const w = Math.min(img.width - x, (box.width + pad * 2) * img.width);
  const h = Math.min(img.height - y, (box.height + pad * 2) * img.height);
  if (w < 4 || h < 4) {
    throw new Error("Logo muito pequeno.");
  }
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas
    .getContext("2d")
    ?.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Small image (logo, bottle photo) to keep inside the synced stores. */
export async function thumbnail(
  source: Blob | Uint8Array,
  maxSide = 320,
  type: "image/png" | "image/jpeg" = "image/png"
): Promise<string> {
  const blob = source instanceof Blob ? source : new Blob([source as BlobPart]);
  const img = await loadImage(await readAsDataUrl(blob));
  return draw(img, maxSide, type);
}

export async function callExtract<T>(
  kind: "menu" | "invoice",
  files: UploadFile[],
  hint?: string
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/extract/${kind}/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({ data: f.data, mimeType: f.mimeType })),
          hint,
        }),
      }
    );
  } catch {
    throw new Error("Sem conexão com o servidor.");
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (res.status === 404 && !body) {
    throw new Error(
      "A leitura com IA precisa do servidor (Cloudflare/Vercel); esta versão estática não tem."
    );
  }
  if (!(res.ok && body)) {
    throw new Error(body?.error ?? `Falha na leitura (${res.status}).`);
  }
  return body;
}
