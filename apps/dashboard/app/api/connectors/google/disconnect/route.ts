import { type NextRequest, NextResponse } from "next/server";
import { GOOGLE_COOKIE, revokeGoogle } from "@/lib/server/google-connector";

export const dynamic = "force-dynamic";

/** Revokes the grant at Google and forgets it in this browser. */
export async function POST(request: NextRequest) {
  await revokeGoogle(request);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(GOOGLE_COOKIE);
  return res;
}
