// lib/ranking.test.ts
import { describe, it, expect } from 'vitest';
import { rankPlayers, MIN_MATCHES } from './ranking';
import type { BoardRow } from './types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
  matches: 50, wins: 25, losses: 25, kills: 100, headshots: 25, deaths: 50, damage: 1000,
  assists: 0, revives: 0, timeSec: 6000,
  winPct: 50, kd: 2, killsPerMatch: 5, kpm: 1, dpm: 10, revivesPerHour: 3, sniperPct: 20, autoPct: 75, jetPct: 0, rank: null,
  ...over,
});

describe('rankPlayers', () => {
  it('uses a floor of 10 matches', () => {
    expect(MIN_MATCHES).toBe(30);
  });

  it('sorts by win percent descending', () => {
    const { ranked } = rankPlayers([
      row({ eaId: 'low', winPct: 40 }),
      row({ eaId: 'high', winPct: 80 }),
      row({ eaId: 'mid', winPct: 60 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['high', 'mid', 'low']);
  });

  it('assigns ranks starting at 1', () => {
    const { ranked } = rankPlayers([row({ eaId: 'a', winPct: 80 }), row({ eaId: 'b', winPct: 40 })]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('moves under-floor players to provisional', () => {
    const { ranked, provisional } = rankPlayers([
      row({ eaId: 'veteran', matches: MIN_MATCHES }),
      row({ eaId: 'rookie', matches: MIN_MATCHES - 1 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['veteran']);
    expect(provisional.map((r) => r.eaId)).toEqual(['rookie']);
  });

  it('leaves provisional ranks null', () => {
    const { provisional } = rankPlayers([row({ eaId: 'rookie', matches: 3 })]);
    expect(provisional[0].rank).toBeNull();
  });

  it('breaks win-percent ties by matches, then K/D', () => {
    const { ranked } = rankPlayers([
      row({ eaId: 'fewer', winPct: 50, matches: 40, kd: 3 }),
      row({ eaId: 'more', winPct: 50, matches: 80, kd: 1 }),
      row({ eaId: 'tiebreak', winPct: 50, matches: 40, kd: 5 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['more', 'tiebreak', 'fewer']);
  });

  it('sorts null win percent last', () => {
    const { ranked } = rankPlayers([
      row({ eaId: 'none', winPct: null }),
      row({ eaId: 'some', winPct: 10 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['some', 'none']);
  });

  it('does not mutate its input', () => {
    const input = [row({ eaId: 'a', winPct: 10 }), row({ eaId: 'b', winPct: 90 })];
    rankPlayers(input);
    expect(input.map((r) => r.eaId)).toEqual(['a', 'b']);
    expect(input[0].rank).toBeNull();
  });

  it('handles an empty roster', () => {
    expect(rankPlayers([])).toEqual({ ranked: [], provisional: [] });
  });
});
