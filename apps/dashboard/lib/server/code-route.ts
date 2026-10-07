import type Anthropic from "@anthropic-ai/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, codeClient } from "./code-sessions";
import { readGithubConnection } from "./github-connector";
import { hasAccess } from "./whatsapp";

/**
 * Shared guard for /api/code/*: needs ANTHROPIC_API_KEY on the server and
 * the panel's access cookie (same code as WhatsApp/POS), since sessions
 * spend API credits and act on GitHub.
 */

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

interface Ctx {
  client: Anthropic;
  githubToken: string | null;
}

export async function guarded(
  request: NextRequest,
  run: (ctx: Ctx) => Promise<unknown>
) {
  const client = codeClient();
  if (!client) {
    return json({ error: "not_configured" }, 503);
  }
  if (!(await hasAccess(request))) {
    return json({ error: "locked" }, 401);
  }
  const github = await readGithubConnection(request);
  try {
    return json(await run({ client, githubToken: github?.token ?? null }));
  } catch (err) {
    const { status, message } = apiError(err);
    return json({ error: message }, status);
  }
}
