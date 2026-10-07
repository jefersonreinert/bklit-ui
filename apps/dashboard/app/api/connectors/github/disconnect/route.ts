import { NextResponse } from "next/server";
import { GITHUB_COOKIE } from "@/lib/server/github-connector";

export const dynamic = "force-dynamic";

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(GITHUB_COOKIE);
  return res;
}
