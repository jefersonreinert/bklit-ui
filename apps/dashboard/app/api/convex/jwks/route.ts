import { NextResponse } from "next/server";
import { publicJwks } from "@/lib/server/panel-jwt";

/** Public keys Convex uses to verify the panel's tokens. */
export function GET() {
  return NextResponse.json(publicJwks(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
