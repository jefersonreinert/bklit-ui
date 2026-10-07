import type { NextRequest } from "next/server";
import type { CodeStatus } from "@/lib/code/types";
import { json } from "@/lib/server/code-route";
import { readGithubConnection } from "@/lib/server/github-connector";
import { hasAccess, isLocked } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

/** What the Code page needs before it can start sessions. */
export async function GET(request: NextRequest) {
  const github = await readGithubConnection(request);
  const status: CodeStatus = {
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    locked: isLocked(),
    unlocked: await hasAccess(request),
    github: github?.login ?? null,
  };
  return json(status);
}
