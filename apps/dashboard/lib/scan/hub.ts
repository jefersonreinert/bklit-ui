/**
 * Every barcode source (iPhone camera, Bluetooth/USB HID reader, a future
 * native shell) emits into this hub; screens subscribe once and do not
 * care where the code came from. Sources are independent: the camera
 * works without a reader and the reader without the camera.
 */

export type ScanSource = "camera" | "photo" | "hid" | "native" | "manual";

export interface ScanEvent {
  code: string;
  format?: string;
  source: ScanSource;
  at: number;
}

type Listener = (e: ScanEvent) => void;

const listeners = new Set<Listener>();

export function emitScan(e: Omit<ScanEvent, "at">) {
  const event = { ...e, code: e.code.trim(), at: Date.now() };
  if (!event.code) {
    return;
  }
  for (const l of [...listeners]) {
    try {
      l(event);
    } catch (err) {
      console.error("[scan] listener failed", err);
    }
  }
}

export function onScan(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
