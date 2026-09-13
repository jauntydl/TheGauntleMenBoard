import { describe, it, expect } from 'vitest';
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
