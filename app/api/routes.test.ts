import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reset as resetLimit, LIMIT } from '@/lib/ratelimit';
import { GET as leaderboard } from './leaderboard/route';
import { GET as meta } from './meta/route';
import { GET as unresolved } from './unresolved/route';
import { getMeta } from '@/lib/data';

describe('GET /api/leaderboard', () => {
  it('defaults to the current season', async () => {
    const res = await leaderboard(new Request('http://x/api/leaderboard'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.season).toBe(getMeta().currentSeason);
    expect(Array.isArray(body.ranked)).toBe(true);
    expect(Array.isArray(body.provisional)).toBe(true);
  });

  it('accepts an explicit season', async () => {
    const current = getMeta().currentSeason;
    const res = await leaderboard(new Request(`http://x/api/leaderboard?season=${current}`));
    expect((await res.json()).season).toBe(current);
  });

  it('accepts the numeric form the spec documents (?season=4)', async () => {
    const current = getMeta().currentSeason;
    const numeric = current.replace(/^Season/, '');
    const res = await leaderboard(new Request(`http://x/api/leaderboard?season=${numeric}`));
    expect(res.status).toBe(200);
    expect((await res.json()).season).toBe(current);
  });

  it('404s an unknown season instead of returning an empty board', async () => {
    const res = await leaderboard(new Request('http://x/api/leaderboard?season=Season99'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });
});

describe('GET /api/meta', () => {
  it('returns season metadata', async () => {
    const body = await (await meta()).json();
    expect(body.currentSeason).toMatch(/^Season\d+$/);
    expect(Array.isArray(body.seasons)).toBe(true);
  });
});

describe('GET /api/unresolved', () => {
  it('returns a list', async () => {
    expect(Array.isArray(await (await unresolved()).json())).toBe(true);
  });
});

describe('POST /api/join', () => {
  const post = async (body: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import('./join/route');
    return POST(
      new Request('http://x/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  };

  beforeEach(() => {
    resetLimit();
    vi.unstubAllEnvs();
  });

  it('refuses signups when the deployment has no GitHub token', async () => {
    // Nothing else may run first: without a token there is nowhere to write,
    // so the honest answer is "not configured", not a failed commit.
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GITHUB_REPO', '');
    const res = await post({ eaId: 'Somebody' });
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe('unconfigured');
  });

  it('rejects a malformed EA ID before it reaches the network', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubEnv('GITHUB_REPO', 'o/r');
    const res = await post({ eaId: 'no' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('invalid');
  });

  it('rejects a body that is not JSON', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubEnv('GITHUB_REPO', 'o/r');
    const res = await post('not json at all');
    expect(res.status).toBe(400);
  });

  it('rate-limits a single caller and says when to come back', async () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubEnv('GITHUB_REPO', 'o/r');
    const ip = { 'x-forwarded-for': '9.9.9.9' };
    for (let i = 0; i < LIMIT; i++) await post({ eaId: 'bad' }, ip);
    const res = await post({ eaId: 'bad' }, ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});
