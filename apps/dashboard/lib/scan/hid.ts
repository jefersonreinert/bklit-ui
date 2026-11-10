import { emitScan } from "./hub";

/**
 * External barcode readers (Bluetooth or USB) in HID mode behave like a
 * keyboard: they "type" the code very fast and usually press Enter. This
 * tells that burst apart from a person typing and emits it as a scan.
 * When a text field has focus the reader simply types into it (handy for
 * the barcode field); otherwise the burst is captured app-wide.
 */

export interface HidOptions {
  /** Max time between two keys of the same scan. */
  maxGapMs: number;
  minLength: number;
  /** Readers set without a suffix: end the scan after this pause. */
  idleMs: number;
}

const DEFAULTS: HidOptions = { maxGapMs: 45, minLength: 6, idleMs: 120 };

export function isEditable(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node?.tagName) {
    return false;
  }
  if (node.isContentEditable) {
    return true;
  }
  if (node.tagName === "TEXTAREA" || node.tagName === "SELECT") {
    return true;
  }
  if (node.tagName !== "INPUT") {
    return false;
  }
  const type = (node as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "range", "color"].includes(type);
}

/** Pure state machine, so it can be tested without a DOM. */
export function createHidBuffer(opts: Partial<HidOptions> = {}) {
  const o = { ...DEFAULTS, ...opts };
  let chars = "";
  let last = 0;
  return {
    /** A printable key; returns nothing. */
    key(ch: string, at: number) {
      if (chars && at - last > o.maxGapMs) {
        // A pause: whatever came before was typed by a person
        chars = "";
      }
      chars += ch;
      last = at;
    },
    /** Enter/Tab or idle: returns the code if it was a scanner burst. */
    end(at: number, idle = false): string | null {
      const code = chars;
      const gapOk = idle ? at - last >= o.idleMs : at - last <= o.maxGapMs * 2;
      chars = "";
      if (!gapOk || code.length < o.minLength) {
        return null;
      }
      return code;
    },
    get length() {
      return chars.length;
    },
    get lastAt() {
      return last;
    },
    reset() {
      chars = "";
    },
  };
}

/** Listens app-wide; returns a stop function. */
export function startHidScanner(opts: Partial<HidOptions> = {}) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const o = { ...DEFAULTS, ...opts };
  const buffer = createHidBuffer(o);
  let idle: ReturnType<typeof setTimeout> | null = null;

  const flush = (idleEnd: boolean) => {
    const code = buffer.end(performance.now(), idleEnd);
    if (code) {
      emitScan({ code, source: "hid" });
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) {
      return;
    }
    const now = performance.now();
    if (e.key === "Enter" || e.key === "Tab") {
      if (buffer.length >= o.minLength) {
        e.preventDefault();
      }
      flush(false);
      return;
    }
    if (e.key.length !== 1) {
      return;
    }
    buffer.key(e.key, now);
    if (idle) {
      clearTimeout(idle);
    }
    idle = setTimeout(() => flush(true), o.idleMs);
  };

  window.addEventListener("keydown", onKey, true);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    if (idle) {
      clearTimeout(idle);
    }
  };
}

const PREF = "casa.scan.hid";

export function hidEnabled() {
  try {
    return localStorage.getItem(PREF) !== "off";
  } catch {
    return true;
  }
}

export function setHidEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? "on" : "off");
  } catch {
    // private mode: stays on for this visit
  }
}
