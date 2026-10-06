import { type NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_PENDING_COOKIE,
  googleConfig,
  startGoogleAuthorization,
} from "@/lib/server/google-connector";
import { basePath, cookieOptions } from "@/lib/server/notion-connector";
import { safeReturnTo } from "@/lib/server/return-to";
import { connectorsSecret } from "@/lib/server/sealed-cookie";

export const dynamic = "force-dynamic";

/** Redirects the browser to Google's consent screen (Gmail + Drive). */
export async function GET(request: NextRequest) {
  const back = new URL(`${basePath()}/conectores/`, request.nextUrl.origin);
  if (!connectorsSecret()) {
    back.searchParams.set("error", "missing_secret");
    return NextResponse.redirect(back);
  }
  if (!googleConfig()) {
    back.searchParams.set("error", "missing_google_client");
    return NextResponse.redirect(back);
  }
  const { authorizeUrl, pendingCookie, pendingMaxAge } =
    await startGoogleAuthorization(
      request,
      safeReturnTo(request.nextUrl.searchParams.get("returnTo"), back.pathname)
    );
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(
    GOOGLE_PENDING_COOKIE,
    pendingCookie,
    cookieOptions(request, pendingMaxAge)
  );
  return res;
}
