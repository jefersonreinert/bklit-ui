"use client";

/**
 * What the app agent sees and does on screen: a compact list of the
 * interactive elements of the page (with ids it can point at), and the
 * actions a person would take — click, type, press keys, scroll — done
 * with a visible cursor so the user can follow along.
 */

export interface AgentElement {
  id: number;
  role: string;
  label: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  offscreen?: boolean;
}

export interface PageSnapshot {
  path: string;
  title: string;
  text: string;
  elements: AgentElement[];
}

const INTERACTIVE = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "textarea",
  "select",
  "summary",
  "[contenteditable=true]",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="combobox"]',
].join(",");

const MAX_ELEMENTS = 120;
const MAX_TEXT = 1800;
const SPACES = /\s+/g;

/** The agent's own panel and cursor are not part of the page it reads. */
const AGENT_UI = "[data-agent-ui]";

let registry = new Map<number, HTMLElement>();

const clean = (s: string | null | undefined, max = 90) =>
  (s ?? "").replace(SPACES, " ").trim().slice(0, max);

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) {
    return false;
  }
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

function roleOf(el: HTMLElement) {
  const role = el.getAttribute("role");
  if (role) {
    return role;
  }
  const tag = el.tagName.toLowerCase();
  if (tag === "a") {
    return "link";
  }
  if (tag === "input") {
    const type = (el as HTMLInputElement).type;
    return type === "checkbox" || type === "radio" ? type : `input:${type}`;
  }
  if (el.isContentEditable) {
    return "editor";
  }
  return tag;
}

function labelOf(el: HTMLElement) {
  const by = el.getAttribute("aria-labelledby");
  const labelled = by
    ? by
        .split(" ")
        .map((id) => document.getElementById(id)?.innerText ?? "")
        .join(" ")
    : "";
  const input = el as HTMLInputElement;
  const fromLabel = input.labels?.[0]?.innerText;
  return clean(
    el.getAttribute("aria-label") ||
      labelled ||
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA"
        ? ""
        : el.innerText) ||
      fromLabel ||
      input.placeholder ||
      el.getAttribute("title") ||
      el.querySelector("img")?.getAttribute("alt") ||
      input.name ||
      (el.tagName === "A" ? (el as HTMLAnchorElement).pathname : "")
  );
}

function currentValue(el: HTMLElement): string | undefined {
  if (el instanceof HTMLInputElement) {
    if (el.type === "password") {
      return el.value ? "••••" : "";
    }
    if (el.type === "checkbox" || el.type === "radio") {
      return undefined;
    }
    return clean(el.value, 120);
  }
  if (el instanceof HTMLTextAreaElement) {
    return clean(el.value, 200);
  }
  if (el instanceof HTMLSelectElement) {
    return clean(el.selectedOptions[0]?.text, 60);
  }
  if (el.isContentEditable) {
    return clean(el.innerText, 200);
  }
  return undefined;
}

function isChecked(el: HTMLElement) {
  if (
    el instanceof HTMLInputElement &&
    (el.type === "checkbox" || el.type === "radio")
  ) {
    return el.checked || undefined;
  }
  const on = ["aria-checked", "aria-pressed", "aria-selected"].some(
    (a) => el.getAttribute(a) === "true"
  );
  return on || undefined;
}

/** Reads the page: interactive elements (on screen first) and its text. */
export function snapshot(): PageSnapshot {
  registry = new Map();
  const all = [...document.querySelectorAll<HTMLElement>(INTERACTIVE)].filter(
    (el) => !el.closest(AGENT_UI) && visible(el)
  );
  const vh = window.innerHeight;
  const onScreen = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh;
  };
  all.sort((a, b) => Number(onScreen(b)) - Number(onScreen(a)));
  const elements: AgentElement[] = [];
  for (const el of all) {
    if (elements.length >= MAX_ELEMENTS) {
      break;
    }
    const label = labelOf(el);
    const value = currentValue(el);
    if (!(label || value !== undefined)) {
      continue;
    }
    const id = elements.length + 1;
    registry.set(id, el);
    const checked = isChecked(el);
    elements.push({
      id,
      role: roleOf(el),
      label,
      ...(value === undefined ? {} : { value }),
      ...(checked ? { checked } : {}),
      ...((el as HTMLButtonElement).disabled ? { disabled: true } : {}),
      ...(onScreen(el) ? {} : { offscreen: true }),
    });
  }
  const main = document.querySelector("main") ?? document.body;
  const clone = main.cloneNode(true) as HTMLElement;
  for (const ui of clone.querySelectorAll(AGENT_UI)) {
    ui.remove();
  }
  const dialogs = [...document.querySelectorAll<HTMLElement>("[role=dialog]")]
    .filter((d) => !d.closest(AGENT_UI))
    .map((d) => d.innerText)
    .join("\n");
  return {
    path: window.location.pathname,
    title: document.title,
    text: clean(`${dialogs}\n${clone.innerText}`, MAX_TEXT),
    elements,
  };
}

export const elementById = (id: number) => registry.get(id) ?? null;

/* -------------------------------- actions -------------------------------- */

/** No cursor: a short outline on the element, without scrolling the page
 * unless the element is out of sight (no jumps, no zoom). */
function reveal(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) {
    el.scrollIntoView({ block: "center", behavior: "instant" });
  }
  const prev = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  el.style.outline = "2px solid #c96442";
  el.style.outlineOffset = "2px";
  setTimeout(() => {
    el.style.outline = prev;
    el.style.outlineOffset = prevOffset;
  }, 350);
  const after = el.getBoundingClientRect();
  return {
    x: after.left + Math.min(after.width / 2, 40),
    y: after.top + after.height / 2,
  };
}

/** On phones focusing a field pops the keyboard up: the agent types
 * without it. */
const touch = () => window.matchMedia("(pointer: coarse)").matches;

function focus(el: HTMLElement) {
  if (!touch()) {
    el.focus({ preventScroll: true });
  }
}

/** Kept for callers; there is no cursor any more. */
export function hideCursor() {
  // nothing to hide
}

export function click(el: HTMLElement) {
  const { x, y } = reveal(el);
  const common = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    button: 0,
  };
  el.dispatchEvent(
    new PointerEvent("pointerdown", { ...common, pointerType: "mouse" })
  );
  el.dispatchEvent(new MouseEvent("mousedown", common));
  focus(el);
  el.dispatchEvent(
    new PointerEvent("pointerup", { ...common, pointerType: "mouse" })
  );
  el.dispatchEvent(new MouseEvent("mouseup", common));
  el.click();
}

/** Sets a value the way React notices (the native setter + input event). */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function type(el: HTMLElement, text: string, clear = true) {
  reveal(el);
  focus(el);
  if (el instanceof HTMLSelectElement) {
    const option = [...el.options].find(
      (o) =>
        o.text.toLowerCase().includes(text.toLowerCase()) || o.value === text
    );
    if (option) {
      el.value = option.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, (clear ? "" : el.value) + text);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (el.isContentEditable) {
    if (clear) {
      document.execCommand("selectAll");
    }
    document.execCommand("insertText", false, text);
  }
}

export function press(key: string, target?: HTMLElement | null) {
  const el =
    target ?? (document.activeElement as HTMLElement | null) ?? document.body;
  const init = { key, code: key, bubbles: true, cancelable: true };
  const allowed = el.dispatchEvent(new KeyboardEvent("keydown", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));
  if (key === "Enter" && allowed) {
    const form = (el as HTMLInputElement).form;
    if (form) {
      form.requestSubmit();
    }
  }
  if (key === "Escape") {
    document.dispatchEvent(new KeyboardEvent("keydown", init));
  }
}

export function scroll(direction: "up" | "down") {
  const main = document.querySelector("main");
  const amount =
    Math.round(window.innerHeight * 0.7) * (direction === "up" ? -1 : 1);
  // Pages scroll either the window or an inner container
  const scroller = [...document.querySelectorAll<HTMLElement>("main *")].find(
    (el) =>
      el.scrollHeight > el.clientHeight + 40 &&
      ["auto", "scroll"].includes(getComputedStyle(el).overflowY) &&
      el.getBoundingClientRect().height > window.innerHeight * 0.4
  );
  (scroller ?? main ?? document.scrollingElement)?.scrollBy({
    top: amount,
    behavior: "instant",
  });
  window.scrollBy({ top: amount, behavior: "instant" });
}
