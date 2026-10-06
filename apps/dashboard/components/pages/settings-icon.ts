import { IMAGE_SIZES, type ImageKind } from "@/lib/settings-types";

/** Center-crops the image to a square and renders it as PNG at each size. */
export async function imagePngs(
  file: File,
  kind: ImageKind
): Promise<Record<number, string>> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight) || 512;
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const out: Record<number, string> = {};
    for (const size of IMAGE_SIZES[kind]) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("canvas unavailable");
      }
      if (kind === "icon") {
        // iOS icons have no transparency: fill behind transparent images
        ctx.fillStyle = "#141413";
        ctx.fillRect(0, 0, size, size);
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      out[size] = canvas.toDataURL("image/png");
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
