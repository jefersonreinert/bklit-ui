/**
 * On-device barcode decoding. ZXing compiled to WebAssembly runs in the
 * browser (iPhone Safari has no BarcodeDetector), self-hosted from
 * /vendor/zxing so it works offline and calls no external service.
 * A native wrapper app can later register its own engine (Apple Vision)
 * with `setNativeDecoder` and every screen uses it unchanged.
 */

export interface Detection {
  text: string;
  format: string;
  /** Checksum and structure passed. */
  valid: boolean;
  error?: string;
  /** Bounding box in the image's pixels. */
  box: { x: number; y: number; w: number; h: number };
}

export type Decoder = (image: ImageData, thorough: boolean) => Promise<Detection[]>;

const FORMATS = [
  "EAN13",
  "EAN8",
  "UPCA",
  "UPCE",
  "Code128",
  "Code39",
  "Code93",
  "ITF",
  "Codabar",
  "DataBar",
  "QRCode",
  "DataMatrix",
] as const;

let native: Decoder | null = null;

/** Lets a native shell (Vision/AVFoundation) take over decoding. */
export function setNativeDecoder(decoder: Decoder | null) {
  native = decoder;
}

let zxing: Promise<typeof import("zxing-wasm/reader")> | null = null;

function loadZxing() {
  if (!zxing) {
    zxing = import("zxing-wasm/reader").then((m) => {
      m.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? `/vendor/zxing/${path}` : prefix + path,
        },
      });
      return m;
    });
    zxing.catch(() => {
      zxing = null;
    });
  }
  return zxing;
}

/** Starts downloading the engine early (e.g. when the scan page opens). */
export function preloadDecoder() {
  loadZxing().catch(() => undefined);
}

const boxOf = (p: {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}) => {
  const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x];
  const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

export async function decode(image: ImageData, thorough = false): Promise<Detection[]> {
  if (native) {
    return native(image, thorough);
  }
  const m = await loadZxing();
  const results = await m.readBarcodes(image, {
    formats: [...FORMATS],
    tryHarder: thorough,
    tryRotate: true,
    tryInvert: thorough,
    tryDownscale: true,
    maxNumberOfSymbols: thorough ? 4 : 1,
    returnErrors: true,
  });
  return results
    .filter((r) => r.isValid || r.error)
    .map((r) => ({
      text: r.text,
      format: r.format,
      valid: r.isValid && Boolean(r.text),
      error: r.error || undefined,
      box: boxOf(r.position),
    }));
}

/** EAN/UPC check digit (GS1 mod 10). Other formats: true. */
export function checksumOk(code: string, format: string) {
  if (!/^(EAN|UPC)/i.test(format)) {
    return true;
  }
  if (!/^\d{8,14}$/.test(code)) {
    return false;
  }
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  const sum = digits
    .reverse()
    .reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
