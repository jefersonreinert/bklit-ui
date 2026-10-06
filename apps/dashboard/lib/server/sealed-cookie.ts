/**
 * Encrypts small JSON payloads (OAuth tokens) for httpOnly cookies with
 * AES-256-GCM. The key is derived from CONNECTORS_SECRET (server-only env).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function connectorsSecret() {
  const secret = process.env.CONNECTORS_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

async function key() {
  const secret = connectorsSecret();
  if (!secret) {
    throw new Error("CONNECTORS_SECRET is not configured");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

const toB64Url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64url");
const fromB64Url = (text: string) =>
  new Uint8Array(Buffer.from(text, "base64url"));

export async function seal(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(value));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), data)
  );
  return `${toB64Url(iv)}.${toB64Url(cipher)}`;
}

export async function unseal<T>(sealed: string | undefined): Promise<T | null> {
  if (!sealed) {
    return null;
  }
  const [iv, cipher] = sealed.split(".");
  if (!(iv && cipher)) {
    return null;
  }
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64Url(iv) },
      await key(),
      fromB64Url(cipher)
    );
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    // Tampered, wrong secret, or rotated key → treat as absent
    return null;
  }
}

export function randomToken(bytes = 32) {
  return toB64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(verifier)
  );
  return toB64Url(new Uint8Array(digest));
}
