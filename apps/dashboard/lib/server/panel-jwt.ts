/**
 * Short-lived ES256 JWTs that let this browser (after the access code) and
 * the server's AI tools talk to Convex. The private key is a JWK in
 * PANEL_JWT_PRIVATE_KEY; Convex verifies with the public half served at
 * /api/convex/jwks/.
 */

const KID = "panel-1";
const TRAILING_SLASHES = /\/+$/;
const PLUS = /\+/g;
const SLASH = /\//g;
const PADDING = /=+$/;
const TTL_SECONDS = 60 * 60;

interface EcJwk extends JsonWebKey {
  d?: string;
}

function privateJwk(): EcJwk | null {
  const raw = process.env.PANEL_JWT_PRIVATE_KEY;
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as EcJwk;
  } catch {
    return null;
  }
}

export const panelIssuer = () =>
  process.env.PANEL_AUTH_ISSUER?.replace(TRAILING_SLASHES, "") ?? null;

export const convexUrl = () =>
  process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? null;

export function panelAuthConfigured() {
  return Boolean(privateJwk() && panelIssuer() && convexUrl());
}

export function publicJwks() {
  const jwk = privateJwk();
  if (!jwk) {
    return { keys: [] };
  }
  const { d: _d, key_ops: _ops, ext: _ext, ...pub } = jwk;
  return { keys: [{ ...pub, kid: KID, alg: "ES256", use: "sig" }] };
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(PLUS, "-")
    .replace(SLASH, "_")
    .replace(PADDING, "");

const encodeJson = (value: unknown) =>
  b64url(new TextEncoder().encode(JSON.stringify(value)));

export async function signPanelToken(subject = "panel") {
  const jwk = privateJwk();
  const iss = panelIssuer();
  if (!(jwk && iss)) {
    return null;
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "ES256", kid: KID, typ: "JWT" });
  const payload = encodeJson({
    iss,
    sub: subject,
    aud: "casa-brasa",
    iat: now,
    exp: now + TTL_SECONDS,
  });
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return {
    token: `${header}.${payload}.${b64url(signature)}`,
    expiresAt: (now + TTL_SECONDS) * 1000,
  };
}
