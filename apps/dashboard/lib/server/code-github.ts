import type { CodeRepo } from "@/lib/code/types";

/** GitHub REST calls for the Code page, with the GitHub connector's token. */

const REPO = /^[\w.-]+\/[\w.-]+$/;
const BRANCH = /^[\w./-]+$/;

export const isRepoName = (s: string) => REPO.test(s);
export const isBranchName = (s: string) => BRANCH.test(s) && !s.includes("..");

function gh(token: string, path: string, init?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "casa-brasa-dashboard",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
}

interface GhRepo {
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  pushed_at: string | null;
}

export async function listRepos(token: string): Promise<CodeRepo[]> {
  const res = await gh(
    token,
    "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member"
  );
  if (!res.ok) {
    throw new Error(
      `O GitHub recusou a lista de repositórios (${res.status}).`
    );
  }
  const list = (await res.json()) as GhRepo[];
  return list.map((r) => ({
    fullName: r.full_name,
    private: r.private,
    description: r.description,
    defaultBranch: r.default_branch,
    pushedAt: r.pushed_at,
  }));
}

/** Opens a PR from `branch` into the repository's default branch. */
export async function openPullRequest(
  token: string,
  input: { repo: string; branch: string; title: string; body: string }
) {
  const info = await gh(token, `/repos/${input.repo}`);
  if (!info.ok) {
    throw new Error(`Repositório não encontrado (${info.status}).`);
  }
  const { default_branch } = (await info.json()) as GhRepo;
  const res = await gh(token, `/repos/${input.repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.branch,
      base: default_branch,
    }),
  });
  const data = (await res.json()) as {
    html_url?: string;
    message?: string;
    errors?: { message?: string }[];
  };
  if (!res.ok) {
    const detail = data.errors?.[0]?.message ?? data.message ?? res.status;
    throw new Error(`Não consegui abrir o PR: ${detail}`);
  }
  return { url: data.html_url ?? "" };
}

export async function listBranches(token: string, repo: string) {
  const res = await gh(token, `/repos/${repo}/branches?per_page=100`);
  if (!res.ok) {
    throw new Error(`Não consegui listar os branches (${res.status}).`);
  }
  const list = (await res.json()) as { name: string }[];
  return list.map((b) => b.name);
}
