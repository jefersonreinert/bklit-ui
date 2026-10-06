import { type NextRequest, NextResponse } from "next/server";
import {
  basePath,
  CONNECTION_COOKIE,
  cookieOptions,
  finishAuthorization,
  PENDING_COOKIE,
  sealConnection,
} from "@/lib/server/notion-connector";

export const dynamic = "force-dynamic";

/** OAuth redirect target: exchanges the code and stores the sealed tokens. */
export async function GET(request: NextRequest) {
  const fallback = `${basePath()}/conectores/`;
  try {
    const { connection, returnTo } = await finishAuthorization(request);
    const url = new URL(returnTo || fallback, request.nextUrl.origin);
    url.searchParams.set("connected", "notion");
    const res = NextResponse.redirect(url);
    const sealed = await sealConnection(connection);
    res.cookies.set(
      CONNECTION_COOKIE,
      sealed.value,
      cookieOptions(request, sealed.maxAge)
    );
    res.cookies.delete(PENDING_COOKIE);
    return res;
  } catch (error) {
    const url = new URL(fallback, request.nextUrl.origin);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "failed"
    );
    const res = NextResponse.redirect(url);
    res.cookies.delete(PENDING_COOKIE);
    return res;
  }
}
