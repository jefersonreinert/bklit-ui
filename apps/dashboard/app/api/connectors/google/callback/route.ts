import { type NextRequest, NextResponse } from "next/server";
import {
  finishGoogleAuthorization,
  GOOGLE_COOKIE,
  GOOGLE_PENDING_COOKIE,
  sealGoogleConnection,
} from "@/lib/server/google-connector";
import { basePath, cookieOptions } from "@/lib/server/notion-connector";

export const dynamic = "force-dynamic";

/** OAuth redirect target: exchanges the code and stores the sealed tokens. */
export async function GET(request: NextRequest) {
  const fallback = `${basePath()}/conectores/`;
  try {
    const { connection, returnTo } = await finishGoogleAuthorization(request);
    const url = new URL(returnTo || fallback, request.nextUrl.origin);
    url.searchParams.set("connected", "google");
    const res = NextResponse.redirect(url);
    const sealed = await sealGoogleConnection(connection);
    res.cookies.set(
      GOOGLE_COOKIE,
      sealed.value,
      cookieOptions(request, sealed.maxAge)
    );
    res.cookies.delete(GOOGLE_PENDING_COOKIE);
    return res;
  } catch (error) {
    const url = new URL(fallback, request.nextUrl.origin);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "failed"
    );
    const res = NextResponse.redirect(url);
    res.cookies.delete(GOOGLE_PENDING_COOKIE);
    return res;
  }
}
