import type { NextRequest } from "next/server";

/** Hash of the guest's network address: limits without keeping the IP. */
export async function guestIp(request: NextRequest) {
  const raw =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`sommelier:${raw}`)
  );
  return Buffer.from(digest).toString("hex").slice(0, 24);
}
