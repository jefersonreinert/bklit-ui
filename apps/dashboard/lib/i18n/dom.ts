"use client";

import { lookup } from ".";

/**
 * Translates the interface on screen: every text node and label attribute
 * whose text is a known interface text (catalog.json) is swapped for its
 * translation. Only the text of existing nodes changes, never the nodes, so
 * React keeps working. User content (notes, names typed by people) is not
 * in the catalog and stays as written. Mark an area with translate="no" to
 * leave it alone.
 */

const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const SKIP = new Set([
  "SCRIPT",
  "STYLE",
  "CODE",
  "PRE",
  "TEXTAREA",
  "NOSCRIPT",
]);
const SPACES = /\s+/g;

/** Original Portuguese and what we wrote, to tell our changes from React's. */
interface Swap {
  pt: string;
  out: string;
}
const written = new WeakMap<Node, Swap>();
const writtenAttr = new WeakMap<Element, Map<string, Swap>>();

function skipped(el: Element | null) {
  for (let e = el; e; e = e.parentElement) {
    if (
      SKIP.has(e.tagName) ||
      e.getAttribute("translate") === "no" ||
      (e as HTMLElement).isContentEditable
    ) {
      return true;
    }
  }
  return false;
}

/** The translation of a text keeping its surrounding spaces. */
function convert(value: string) {
  const key = value.replace(SPACES, " ").trim();
  if (key.length < 2) {
    return null;
  }
  const out = lookup(key);
  if (!out || out === key) {
    return null;
  }
  const lead = value.match(/^\s*/)?.[0] ?? "";
  const trail = value.match(/\s*$/)?.[0] ?? "";
  return lead + out + trail;
}

function textNode(node: Text) {
  const value = node.nodeValue ?? "";
  const mine = written.get(node);
  // Ours: translate again from the Portuguese (a better text may have come)
  const source = mine?.out === value ? mine.pt : value;
  if (skipped(node.parentElement)) {
    return;
  }
  const out = convert(source);
  if (out !== null && out !== value) {
    written.set(node, { pt: source, out });
    node.nodeValue = out;
  }
}

function attributes(el: Element) {
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (!value) {
      continue;
    }
    const mine = writtenAttr.get(el);
    const swap = mine?.get(name);
    const source = swap?.out === value ? swap.pt : value;
    const out = convert(source);
    if (out !== null && out !== value) {
      const map = mine ?? new Map<string, Swap>();
      map.set(name, { pt: source, out });
      writtenAttr.set(el, map);
      el.setAttribute(name, out);
    }
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    textNode(root as Text);
    return;
  }
  if (!(root instanceof Element) || skipped(root)) {
    return;
  }
  attributes(root);
  const tree = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (n) =>
        n instanceof Element && SKIP.has(n.tagName)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    }
  );
  for (let n = tree.nextNode(); n; n = tree.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      textNode(n as Text);
    } else {
      attributes(n as Element);
    }
  }
}

/** Starts translating the page; returns stop() and rescan(). */
export function translateScreen() {
  const pending = new Set<Node>();
  let frame = 0;
  const flush = () => {
    frame = 0;
    for (const n of pending) {
      if (n.isConnected) {
        walk(n);
      }
    }
    pending.clear();
  };
  const queue = (n: Node) => {
    pending.add(n);
    if (!frame) {
      frame = requestAnimationFrame(flush);
    }
  };
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") {
        for (const n of r.addedNodes) {
          queue(n);
        }
      } else {
        queue(r.target);
      }
    }
  });
  walk(document.body);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
  return {
    stop: () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    },
    rescan: () => queue(document.body),
  };
}
