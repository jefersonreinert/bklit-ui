import type { NextRequest } from "next/server";
import {
  isBranchName,
  isRepoName,
  openPullRequest,
} from "@/lib/server/code-github";
import { guarded } from "@/lib/server/code-route";

export const dynamic = "force-dynamic";

/** Opens a pull request for a branch an agent pushed. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return guarded(request, ({ githubToken }) => {
    const repo = String(body.repo ?? "");
    const branch = String(body.branch ?? "");
    if (!(isRepoName(repo) && isBranchName(branch))) {
      throw new Error("Repositório ou branch inválido.");
    }
    if (!githubToken) {
      throw new Error("Conecte o GitHub em Conectores primeiro.");
    }
    return openPullRequest(githubToken, {
      repo,
      branch,
      title: String(body.title ?? branch).slice(0, 200),
      body: String(body.body ?? "").slice(0, 20_000),
    });
  });
}
