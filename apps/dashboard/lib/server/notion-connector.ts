import type { NextRequest } from "next/server";
import { pkceChallenge, randomToken, seal, unseal } from "./sealed-cookie";

/**
 * OAuth 2.1 (PKCE, public client + dynamic client registration) against the
 * official Notion MCP server, and helpers to keep the resulting tokens in an
 * encrypted httpOnly cookie. Endpoints come from
 * https://mcp.notion.com/.well-known/oauth-authorization-server.
 */

export const NOTION_MCP_URL = "https://mcp.notion.com/mcp";
const ISSUER = "https://mcp.notion.com";
const AUTHORIZE_URL = `${ISSUER}/authorize`;
const TOKEN_URL = `${ISSUER}/token`;
const REGISTER_URL = `${ISSUER}/register`;

export const CONNECTION_COOKIE = "cb_conn_notion";
export const PENDING_COOKIE = "cb_oauth_notion";
const CONNECTION_MAX_AGE = 60 * 60 * 24 * 180; // Notion refresh tokens live up to 180 days
const PENDING_MAX_AGE = 60 * 10; // 10 minutes to finish the consent screen

export interface NotionConnection {
  clientId: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms. */
  expiresAt: number | null;
  connectedAt: number;
}

interface PendingAuth {
  state: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
  returnTo: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export function basePath() {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

export function callbackUri(request: NextRequest) {
  return `${request.nextUrl.origin}${basePath()}/api/connectors/notion/callback/`;
}

export function cookieOptions(request: NextRequest, maxAge: number) {
  return {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

async function registerClient(redirectUri: string) {
  const res = await fetch(REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Casa Brasa — Painel de gestão",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!res.ok) {
    throw new Error(`Notion client registration failed (${res.status})`);
  }
  const body = (await res.json()) as { client_id?: string };
  if (!body.client_id) {
    throw new Error("Notion registration returned no client_id");
  }
  return body.client_id;
}

/** Builds the consent URL and the sealed pending-auth cookie value. */
export async function startAuthorization(
  request: NextRequest,
  returnTo: string
) {
  const redirectUri = callbackUri(request);
  // Reuse a client registered for this same origin when we already have one
  const existing = await readConnection(request);
  const clientId =
    existing && existing.redirectUri === redirectUri
      ? existing.clientId
      : await registerClient(redirectUri);

  const state = randomToken(16);
  const verifier = randomToken(48);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", NOTION_MCP_URL);
  url.searchParams.set("prompt", "consent");

  const pending: PendingAuth = {
    state,
    verifier,
    clientId,
    redirectUri,
    returnTo,
  };
  return {
    authorizeUrl: url.toString(),
    pendingCookie: await seal(pending),
    pendingMaxAge: PENDING_MAX_AGE,
  };
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new TokenError(res.status, body.error);
  }
  return (await res.json()) as TokenResponse;
}

class TokenError extends Error {
  readonly code: string | undefined;
  constructor(status: number, code?: string) {
    super(`Notion token request failed (${status}${code ? `: ${code}` : ""})`);
    this.code = code;
  }
}

export type FreshToken =
  | { status: "ok"; token: string; updated: NotionConnection | null }
  | { status: "none" }
  /** Grant is dead (revoked/expired): the cookie must be cleared. */
  | { status: "revoked" }
  /** Transient failure: skip Notion this turn, keep the cookie. */
  | { status: "unavailable" };

function toConnection(
  token: TokenResponse,
  clientId: string,
  redirectUri: string,
  previous?: NotionConnection | null
): NotionConnection {
  return {
    clientId,
    redirectUri,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    connectedAt: previous?.connectedAt ?? Date.now(),
  };
}

/** Validates the callback, exchanges the code and returns the connection. */
export async function finishAuthorization(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const pending = await unseal<PendingAuth>(
    request.cookies.get(PENDING_COOKIE)?.value
  );
  const code = params.get("code");
  const iss = params.get("iss");
  if (!pending) {
    throw new Error("expired");
  }
  if (params.get("error")) {
    throw new Error(params.get("error") ?? "denied");
  }
  if (!code || params.get("state") !== pending.state) {
    throw new Error("state_mismatch");
  }
  if (iss && iss !== ISSUER) {
    throw new Error("issuer_mismatch");
  }
  const token = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.verifier,
    resource: NOTION_MCP_URL,
  });
  return {
    connection: toConnection(token, pending.clientId, pending.redirectUri),
    returnTo: pending.returnTo,
  };
}

export function readConnection(request: NextRequest) {
  return unseal<NotionConnection>(
    request.cookies.get(CONNECTION_COOKIE)?.value
  );
}

export async function sealConnection(connection: NotionConnection) {
  return { value: await seal(connection), maxAge: CONNECTION_MAX_AGE };
}

/**
 * Returns a usable access token, refreshing it when it expires within the
 * next minute. Notion rotates the refresh token on every refresh, so the
 * caller must persist `updated`, and must clear the cookie on "revoked"
 * (replaying a retired refresh token makes Notion revoke the whole grant).
 */
export async function ensureFreshToken(
  request: NextRequest
): Promise<FreshToken> {
  const connection = await readConnection(request);
  if (!connection) {
    return { status: "none" };
  }
  const expiring =
    connection.expiresAt !== null && connection.expiresAt - Date.now() < 60_000;
  if (!expiring) {
    return { status: "ok", token: connection.accessToken, updated: null };
  }
  if (!connection.refreshToken) {
    return { status: "revoked" };
  }
  try {
    const token = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
      client_id: connection.clientId,
      resource: NOTION_MCP_URL,
    });
    const updated = toConnection(
      token,
      connection.clientId,
      connection.redirectUri,
      connection
    );
    return { status: "ok", token: updated.accessToken, updated };
  } catch (error) {
    return error instanceof TokenError && error.code === "invalid_grant"
      ? { status: "revoked" }
      : { status: "unavailable" };
  }
}
