import type { NextRequest } from "next/server";
import { basePath, cookieOptions } from "./notion-connector";
import { pkceChallenge, randomToken, seal, unseal } from "./sealed-cookie";

/**
 * Google OAuth 2.0 (web client + PKCE) for Gmail and Drive. Tokens live in an
 * encrypted httpOnly cookie, like the Notion connection. Needs
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from a Google Cloud OAuth client.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  // Read, label, draft and send (no permanent delete)
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/drive.readonly",
  // Your channel, playlists (incl. private), subscriptions and likes
  "https://www.googleapis.com/auth/youtube.readonly",
];

export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

export const GOOGLE_COOKIE = "cb_conn_google";
export const GOOGLE_PENDING_COOKIE = "cb_oauth_google";
const CONNECTION_MAX_AGE = 60 * 60 * 24 * 180;
const PENDING_MAX_AGE = 60 * 10;

export interface GoogleConnection {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms. */
  expiresAt: number;
  email: string;
  name: string | null;
  connectedAt: number;
  /** Scopes the user actually granted (older connections: undefined). */
  scopes?: string[];
}

export const hasScope = (c: GoogleConnection | null, scope: string) =>
  Boolean(c?.scopes?.includes(scope));

interface PendingAuth {
  state: string;
  verifier: string;
  redirectUri: string;
  returnTo: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function requireConfig() {
  const config = googleConfig();
  if (!config) {
    throw new Error("missing_google_client");
  }
  return config;
}

export function googleCallbackUri(request: NextRequest) {
  return `${request.nextUrl.origin}${basePath()}/api/connectors/google/callback/`;
}

export async function startGoogleAuthorization(
  request: NextRequest,
  returnTo: string
) {
  const { clientId } = requireConfig();
  const redirectUri = googleCallbackUri(request);
  const state = randomToken(16);
  const verifier = randomToken(48);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  // offline + consent → Google always returns a refresh token
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");

  const pending: PendingAuth = { state, verifier, redirectUri, returnTo };
  return {
    authorizeUrl: url.toString(),
    pendingCookie: await seal(pending),
    pendingMaxAge: PENDING_MAX_AGE,
  };
}

class GoogleTokenError extends Error {
  readonly code: string | undefined;
  constructor(status: number, code?: string) {
    super(`Google token request failed (${status}${code ? `: ${code}` : ""})`);
    this.code = code;
  }
}

async function tokenRequest(params: Record<string, string>) {
  const { clientId, clientSecret } = requireConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new GoogleTokenError(res.status, body.error);
  }
  return (await res.json()) as TokenResponse;
}

export async function finishGoogleAuthorization(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const pending = await unseal<PendingAuth>(
    request.cookies.get(GOOGLE_PENDING_COOKIE)?.value
  );
  if (!pending) {
    throw new Error("expired");
  }
  if (params.get("error")) {
    throw new Error(params.get("error") ?? "denied");
  }
  const code = params.get("code");
  if (!code || params.get("state") !== pending.state) {
    throw new Error("state_mismatch");
  }
  const token = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier,
  });
  const scopes = (params.get("scope") ?? "").split(" ");
  if (!scopes.some((s) => GOOGLE_SCOPES.slice(3).includes(s))) {
    // The user unticked every service on the consent screen
    throw new Error("missing_scopes");
  }
  const info = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = info.ok
    ? ((await info.json()) as { email?: string; name?: string })
    : {};
  const connection: GoogleConnection = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: Date.now() + token.expires_in * 1000,
    email: profile.email ?? "",
    name: profile.name ?? null,
    connectedAt: Date.now(),
    scopes,
  };
  return { connection, returnTo: pending.returnTo };
}

export function readGoogleConnection(request: NextRequest) {
  return unseal<GoogleConnection>(request.cookies.get(GOOGLE_COOKIE)?.value);
}

export async function sealGoogleConnection(connection: GoogleConnection) {
  return { value: await seal(connection), maxAge: CONNECTION_MAX_AGE };
}

export function googleCookieHeader(
  request: NextRequest,
  sealed: { value: string; maxAge: number } | null
) {
  const opts = cookieOptions(request, sealed?.maxAge ?? 0);
  return `${GOOGLE_COOKIE}=${sealed?.value ?? ""}; Path=${opts.path}; Max-Age=${opts.maxAge}; HttpOnly; SameSite=Lax${opts.secure ? "; Secure" : ""}`;
}

export type GoogleSession =
  | {
      status: "ok";
      token: string;
      updated: GoogleConnection | null;
      email: string;
      /** The login includes YouTube (youtube.readonly). */
      youtube: boolean;
    }
  | { status: "none" }
  | { status: "revoked" }
  | { status: "unavailable" };

/** Returns a usable access token, refreshing it a minute before expiry. */
export async function googleSession(
  request: NextRequest
): Promise<GoogleSession> {
  if (!googleConfig()) {
    return { status: "none" };
  }
  const connection = await readGoogleConnection(request);
  if (!connection) {
    return { status: "none" };
  }
  if (connection.expiresAt - Date.now() > 60_000) {
    return {
      status: "ok",
      token: connection.accessToken,
      updated: null,
      email: connection.email,
      youtube: hasScope(connection, YOUTUBE_SCOPE),
    };
  }
  if (!connection.refreshToken) {
    return { status: "revoked" };
  }
  try {
    const token = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    });
    const updated: GoogleConnection = {
      ...connection,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? connection.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    return {
      status: "ok",
      token: updated.accessToken,
      updated,
      email: updated.email,
      youtube: hasScope(updated, YOUTUBE_SCOPE),
    };
  } catch (error) {
    return error instanceof GoogleTokenError && error.code === "invalid_grant"
      ? { status: "revoked" }
      : { status: "unavailable" };
  }
}

export async function revokeGoogle(request: NextRequest) {
  const connection = await readGoogleConnection(request);
  const token = connection?.refreshToken ?? connection?.accessToken;
  if (token) {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }).catch(() => undefined);
  }
}
