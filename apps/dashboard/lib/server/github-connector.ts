import type { NextRequest } from "next/server";
import { seal, unseal } from "./sealed-cookie";

/**
 * GitHub through its official remote MCP server. The person pastes a
 * personal access token once; it stays encrypted in an httpOnly cookie and
 * only travels to GitHub's MCP server (via the Claude API MCP connector).
 */

export const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/";
export const GITHUB_COOKIE = "cb_conn_github";
const MAX_AGE = 60 * 60 * 24 * 365;

export interface GithubConnection {
  token: string;
  login: string;
  name: string | null;
  connectedAt: number;
}

export function readGithubConnection(request: NextRequest) {
  return unseal<GithubConnection>(request.cookies.get(GITHUB_COOKIE)?.value);
}

export async function sealGithubConnection(connection: GithubConnection) {
  return { value: await seal(connection), maxAge: MAX_AGE };
}

type Check =
  | { ok: true; login: string; name: string | null }
  | { ok: false; error: string };

/** Confirms the token works and returns whose account it is. */
export async function checkGithubToken(token: string): Promise<Check> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "casa-brasa-dashboard",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (res.status === 401) {
      return { ok: false, error: "Token inválido ou expirado." };
    }
    if (!res.ok) {
      return { ok: false, error: `O GitHub recusou o token (${res.status}).` };
    }
    const user = (await res.json()) as { login?: string; name?: string | null };
    return user.login
      ? { ok: true, login: user.login, name: user.name ?? null }
      : { ok: false, error: "Não consegui ler a conta do token." };
  } catch {
    return { ok: false, error: "Não consegui falar com o GitHub agora." };
  }
}
