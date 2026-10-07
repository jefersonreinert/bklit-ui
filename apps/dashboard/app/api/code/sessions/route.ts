import type { NextRequest } from "next/server";
import { parseImages, parseRepos } from "@/lib/server/code-input";
import { guarded } from "@/lib/server/code-route";
import {
  createSession,
  isMode,
  listSessions,
} from "@/lib/server/code-sessions";

export const dynamic = "force-dynamic";

const MAX_REPOS = 5;

export function GET(request: NextRequest) {
  return guarded(request, ({ client }) => listSessions(client));
}

/** Starts a cloud session with the selected repositories cloned. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return guarded(request, ({ client, githubToken }) => {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const repos = parseRepos(body.repos);
    if (!prompt) {
      throw new Error("Descreva a tarefa.");
    }
    if (repos.length === 0 || repos.length > MAX_REPOS) {
      throw new Error(`Escolha de 1 a ${MAX_REPOS} repositórios.`);
    }
    if (!githubToken) {
      throw new Error("Conecte o GitHub em Conectores primeiro.");
    }
    const budget = Number(body.budgetUsd);
    return createSession(client, {
      prompt: prompt.slice(0, 20_000),
      repos,
      model: body.model,
      mode: isMode(body.mode) ? body.mode : "auto",
      images: parseImages(body.images),
      budgetUsd: budget > 0 && budget <= 500 ? budget : null,
      githubToken,
    });
  });
}
