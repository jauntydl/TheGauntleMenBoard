/**
 * The smallest GitHub client that can read a file and push a multi-file commit.
 *
 * The board has no database on purpose: roster.json in git already is the
 * store, and git gives us history, blame and a one-click revert for free. A
 * self-serve signup therefore writes by committing, the same way the daily
 * build does — the only difference is who triggered it.
 *
 * Writes go through the Git Data API rather than the Contents API because a
 * signup touches several files at once (roster plus every season file it
 * changes), and Contents can only write one file per commit. Several commits
 * would mean several Vercel deploys and a window where the roster names a
 * player the board does not have.
 */

const API = 'https://api.github.com';

export type RepoConfig = {
  /** owner/repo, e.g. jauntydl/GauntleMenLeague */
  repo: string;
  branch: string;
  token: string;
};

export type Deps = { fetch?: typeof fetch };

/** A file to write, as its repo path and full new contents. */
export type FileWrite = { path: string; content: string };

/** The ref moved under us — someone else committed first. Retryable. */
export class RefMovedError extends Error {
  constructor() {
    super('The branch moved while this commit was being prepared');
    this.name = 'RefMovedError';
  }
}

/**
 * Read config from the environment, or return null when it is not set.
 *
 * Null rather than a throw so the route can answer "signups are not
 * configured" with a 503 instead of a stack trace, which is the honest
 * description of a deployment missing its token.
 */
export function readConfig(env: Record<string, string | undefined> = process.env): RepoConfig | null {
  const { GITHUB_TOKEN, GITHUB_REPO } = env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) return null;
  return { token: GITHUB_TOKEN, repo: GITHUB_REPO, branch: env.GITHUB_BRANCH || 'main' };
}

async function gh(
  cfg: RepoConfig,
  path: string,
  init: RequestInit,
  deps: Deps,
): Promise<unknown> {
  const doFetch = deps.fetch ?? fetch;
  const res = await doFetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${cfg.token}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    // GitHub answers a lost race with 409 on the blob/tree calls and 422 on
    // the ref update; both mean the same thing to a caller that must retry.
    if (res.status === 409 || res.status === 422) throw new RefMovedError();
    const body = await res.text();
    throw new Error(`GitHub ${init.method ?? 'GET'} ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Read a file's contents at the tip of the configured branch.
 *
 * Deliberately not the copy bundled into the deployment: that one is a
 * snapshot from build time, and two signups a minute apart would both write
 * on top of it, the second silently erasing the first.
 */
export async function readFile(cfg: RepoConfig, path: string, deps: Deps = {}): Promise<string> {
  const body = (await gh(
    cfg,
    `/repos/${cfg.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(cfg.branch)}`,
    { method: 'GET' },
    deps,
  )) as { content?: string; encoding?: string };

  if (typeof body.content !== 'string') throw new Error(`No content returned for ${path}`);
  // The API base64-encodes with newlines every 60 chars, which atob rejects.
  return Buffer.from(body.content.replace(/\n/g, ''), 'base64').toString('utf8');
}

/**
 * Commit several files as one change on top of the branch's current tip.
 *
 * Throws RefMovedError if the branch advanced between reading the tip and
 * updating it, so the caller can re-read and retry rather than force-push
 * over whoever got there first.
 */
export async function commitFiles(
  cfg: RepoConfig,
  files: FileWrite[],
  message: string,
  deps: Deps = {},
): Promise<string> {
  const ref = (await gh(
    cfg,
    `/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`,
    { method: 'GET' },
    deps,
  )) as { object: { sha: string } };
  const parent = ref.object.sha;

  const commit = (await gh(cfg, `/repos/${cfg.repo}/git/commits/${parent}`, { method: 'GET' }, deps)) as {
    tree: { sha: string };
  };

  const tree = (await gh(
    cfg,
    `/repos/${cfg.repo}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
      }),
    },
    deps,
  )) as { sha: string };

  const created = (await gh(
    cfg,
    `/repos/${cfg.repo}/git/commits`,
    { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }) },
    deps,
  )) as { sha: string };

  // force stays false: a rejected update means a concurrent write we must
  // merge with, never one to overwrite.
  await gh(
    cfg,
    `/repos/${cfg.repo}/git/refs/heads/${encodeURIComponent(cfg.branch)}`,
    { method: 'PATCH', body: JSON.stringify({ sha: created.sha, force: false }) },
    deps,
  );

  return created.sha;
}
