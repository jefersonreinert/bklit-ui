/**
 * Fetching public web pages for the in-app browser and news (only after the
 * panel's access code, never private network addresses).
 */

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i;

export function publicUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (!(u.protocol === "https:" || u.protocol === "http:")) {
      return null;
    }
    if (PRIVATE_HOST.test(u.hostname)) {
      return null;
    }
    return u;
  } catch {
    return null;
  }
}

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function fetchPublic(url: URL, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

const WS = /\s+/;
const FRAME_ANCESTORS = /frame-ancestors\s+([^;]+)/i;

/** Whether the site lets other pages show it inside a frame. */
export function embeddable(headers: Headers, finalUrl: URL) {
  if (finalUrl.protocol !== "https:") {
    return false;
  }
  const xfo = headers.get("x-frame-options")?.toLowerCase() ?? "";
  if (xfo.includes("deny") || xfo.includes("sameorigin")) {
    return false;
  }
  const csp = headers.get("content-security-policy") ?? "";
  const fa = FRAME_ANCESTORS.exec(csp)?.[1]?.trim();
  if (fa && !fa.split(WS).includes("*")) {
    return false;
  }
  return true;
}
