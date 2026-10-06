import { NextResponse } from "next/server";
import { CONNECTION_COOKIE } from "@/lib/server/notion-connector";

export const dynamic = "force-dynamic";

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(CONNECTION_COOKIE);
  return res;
}
