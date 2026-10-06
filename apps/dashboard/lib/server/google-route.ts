import type { NextRequest } from "next/server";
import { GoogleApiError } from "./gmail";
import {
  googleCookieHeader,
  googleSession,
  sealGoogleConnection,
} from "./google-connector";
import { connectorsSecret } from "./sealed-cookie";

/**
 * Runs a Gmail/Drive handler with a fresh Google token and turns the result
 * into JSON, persisting refreshed tokens and clearing revoked ones.
 */
export async function withGoogle(
  request: NextRequest,
  handler: (token: string) => Promise<unknown>
) {
  const session = connectorsSecret()
    ? await googleSession(request)
    : ({ status: "none" } as const);
  if (session.status !== "ok") {
    const res = Response.json(
      {
        error:
          session.status === "unavailable" ? "unavailable" : "not_connected",
      },
      { status: session.status === "unavailable" ? 503 : 401 }
    );
    if (session.status === "revoked") {
      res.headers.append("Set-Cookie", googleCookieHeader(request, null));
    }
    return res;
  }
  let res: Response;
  try {
    res = Response.json(await handler(session.token), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof GoogleApiError ? error.status : 500;
    res = Response.json(
      { error: error instanceof Error ? error.message : "failed" },
      { status: status === 401 ? 401 : status }
    );
  }
  if (session.updated) {
    res.headers.append(
      "Set-Cookie",
      googleCookieHeader(request, await sealGoogleConnection(session.updated))
    );
  }
  return res;
}
