import { describe, it, expect, vi } from 'vitest';
import { fetchCurrentSeason, resolvePlayer, fetchBulk, chunk, BATCH_SIZE, API_BASE } from './gametools';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const noSleep = () => Promise.resolve();

describe('constants', () => {
  it('targets the gametools API', () => {
    expect(API_BASE).toBe('https://api.gametools.network');
  });
  it('batches at the documented maximum', () => {
    expect(BATCH_SIZE).toBe(128);
  });
});

describe('chunk', () => {
  it('splits into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns nothing for an empty list', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('fetchCurrentSeason', () => {
  it('returns the active season name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ events: [
        { name: 'Season3', active: false },
        { name: 'Season4', active: true },
        { name: 'BP04', active: true },
      ] }),
    );
    await expect(fetchCurrentSeason({ fetchImpl, sleep: noSleep })).resolves.toBe('Season4');
  });

  it('ignores active non-season events', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ events: [{ name: 'BP04', active: true }, { name: 'Season2', active: true }] }),
    );
    await expect(fetchCurrentSeason({ fetchImpl, sleep: noSleep })).resolves.toBe('Season2');
  });

  it('throws when no active season exists', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ events: [] }));
    await expect(fetchCurrentSeason({ fetchImpl, sleep: noSleep })).rejects.toThrow(/active season/i);
  });
});

describe('resolvePlayer', () => {
  it('returns ids for a known player', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ playerStats: [{ player: { nucleusId: '1', personaId: '2', platformId: 1 }, categories: [] }] }),
    );
    await expect(resolvePlayer('pkidarkpki', { fetchImpl, sleep: noSleep })).resolves.toEqual({
      nucleusId: '1', personaId: '2', platformId: 1,
    });
  });

  it('returns null on 404 without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ errors: ['Player not found'] }, 404));
    await expect(resolvePlayer('ghost', { fetchImpl, sleep: noSleep })).resolves.toBeNull();
  });

  it('does not retry a 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 404));
    await resolvePlayer('ghost', { fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('requests raw data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    await resolvePlayer('someone', { fetchImpl, sleep: noSleep });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('raw=true');
  });

  it('retries a 500 then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({ playerStats: [{ player: { nucleusId: '9', personaId: '8', platformId: 1 }, categories: [] }] }));
    await expect(resolvePlayer('flaky', { fetchImpl, sleep: noSleep })).resolves.toEqual({
      nucleusId: '9', personaId: '8', platformId: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 500));
    await expect(resolvePlayer('down', { fetchImpl, retries: 2, sleep: noSleep })).rejects.toThrow(/500/);
  });

  it('does not retry a 422', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 422));
    await expect(resolvePlayer('bad', { fetchImpl, sleep: noSleep })).rejects.toThrow(/422/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('fetchBulk', () => {
  const player = { player_id: '2', user_id: '1', platform: 'pc' };

  it('posts a JSON array body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    await fetchBulk([player], { fetchImpl, sleep: noSleep });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual([player]);
  });

  it('splits into batches of 128', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(json({ playerStats: [] })));
    const many = Array.from({ length: 300 }, () => player);
    await fetchBulk(many, { fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('returns one response per batch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    const results = await fetchBulk([player, player], { fetchImpl, sleep: noSleep });
    expect(results).toHaveLength(1);
  });

  it('makes no request for an empty list', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchBulk([], { fetchImpl, sleep: noSleep })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
