/**
 * Phone "scanner": loads a camera photo, rotates it, applies a document
 * filter and exports a compressed JPEG. Pure canvas, runs in the browser.
 */

export type ScanFilter = "original" | "document" | "gray" | "bright";

export const SCAN_FILTERS: { id: ScanFilter; label: string }[] = [
  { id: "document", label: "Documento" },
  { id: "original", label: "Original" },
  { id: "gray", label: "Cinza" },
  { id: "bright", label: "Realçado" },
];

const MAX_SIDE = 2200;
const JPEG_QUALITY = 0.85;

export interface ScanPage {
  id: string;
  /** Object URL of the photo as taken. */
  src: string;
  rotation: 0 | 90 | 180 | 270;
  filter: ScanFilter;
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não consegui abrir a imagem."));
    img.src = src;
  });
}

/** Luma 0-255 of an RGB pixel (BT.601). */
export const luma = (r: number, g: number, b: number) =>
  0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Stretches the tones between the 5th and 95th percentile and whitens the
 * paper: what makes a phone photo look like a scan.
 */
export function documentLevels(lumas: Uint8ClampedArray | number[]) {
  const hist = new Array<number>(256).fill(0);
  for (const l of lumas) {
    hist[Math.round(l)] = (hist[Math.round(l)] ?? 0) + 1;
  }
  const total = lumas.length || 1;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i] ?? 0;
    if (acc / total < 0.05) {
      lo = i;
    }
    if (acc / total < 0.95) {
      hi = i;
    }
  }
  if (hi - lo < 16) {
    return { lo: 0, hi: 255 };
  }
  return { lo, hi };
}

function applyFilter(data: Uint8ClampedArray, filter: ScanFilter) {
  if (filter === "original") {
    return;
  }
  const lumas = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    lumas[j] = luma(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
  }
  const { lo, hi } = documentLevels(lumas);
  const scale = 255 / (hi - lo);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const l = lumas[j] ?? 0;
    if (filter === "gray") {
      data[i] = l;
      data[i + 1] = l;
      data[i + 2] = l;
    } else if (filter === "document") {
      // Levels + a gentle curve: paper → white, ink → dark
      const v = Math.min(255, Math.max(0, (l - lo) * scale));
      const out = v > 200 ? 255 : v * 0.9;
      data[i] = out;
      data[i + 1] = out;
      data[i + 2] = out;
    } else {
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] ?? 0;
        data[i + c] = Math.min(255, Math.max(0, (v - lo) * scale));
      }
    }
  }
}

/** Draws one page with its rotation and filter; returns a JPEG blob. */
export async function renderPage(page: ScanPage): Promise<Blob> {
  const img = await loadImage(page.src);
  const fit = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * fit);
  const h = Math.round(img.height * fit);
  const turned = page.rotation === 90 || page.rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = turned ? h : w;
  canvas.height = turned ? w : h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas indisponível.");
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((page.rotation * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyFilter(pixels.data, page.filter);
  ctx.putImageData(pixels, 0, 0);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem."))),
      "image/jpeg",
      JPEG_QUALITY
    )
  );
}

export function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Falha ao ler a imagem."));
    r.readAsDataURL(blob);
  });
}

/** One PDF with a page per scan (A4-ish, image fitted). */
export async function pagesToPdf(blobs: Blob[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const blob of blobs) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const landscape = img.width > img.height;
      const orientation = landscape ? "landscape" : "portrait";
      if (pdf) {
        pdf.addPage("a4", orientation);
      } else {
        pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
      }
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const fit = Math.min(pw / img.width, ph / img.height);
      const w = img.width * fit;
      const h = img.height * fit;
      pdf.addImage(img, "JPEG", (pw - w) / 2, (ph - h) / 2, w, h);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!pdf) {
    throw new Error("Nenhuma página.");
  }
  return pdf.output("blob");
}
