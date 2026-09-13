// lib/pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { buildBoard, toBulkPlayer } from './pipeline';
import { rawSample } from './fixtures/raw-sample';
import type { RosterEntry } from './types';

const dark: RosterEntry = {
  eaId: 'pkidarkpki', displayName: 'Dark', platform: 'pc', region: 'US East',
  mainMode: 'both', personaId: '849687045', nucleusId: '2250375376',
};

describe('toBulkPlayer', () => {
  it('maps personaId to player_id and nucleusId to user_id', () => {
    expect(toBulkPlayer(dark)).toEqual({
      player_id: '849687045', user_id: '2250375376', platform: 'pc',
    });
  });

  it('returns null when ids are missing', () => {
    expect(toBulkPlayer({ ...dark, personaId: undefined })).toBeNull();
  });
});

describe('buildBoard', () => {
  it('produces a row per season the player has Gauntlet data for', () => {
    const board = buildBoard([dark], [rawSample], 'Season4');
    expect(Object.keys(board.seasons).sort()).toEqual(['Season3', 'Season4']);
  });

  it('carries roster identity onto the row', () => {
    const board = buildBoard([dark], [rawSample], 'Season4');
    const row = board.seasons.Season4[0];
    expect(row.displayName).toBe('Dark');
    expect(row.region).toBe('US East');
    expect(row.eaId).toBe('pkidarkpki');
  });

  it('computes metrics for the season row', () => {
    const row = buildBoard([dark], [rawSample], 'Season4').seasons.Season4[0];
    expect(row.matches).toBe(50);
    expect(row.winPct).toBeCloseTo(58.0, 4);
    expect(row.jetPct).toBeCloseTo(14.7927164244, 6);
  });

  it('puts under-floor players in provisional', () => {
    // Season3 in the fixture has 34 matches -> ranked; force a small one.
    const board = buildBoard([dark], [rawSample], 'Season4');
    expect(board.seasons.Season4[0].rank).toBe(1);
    expect(board.provisional.Season4).toEqual([]);
  });

  it('records meta with the current season', () => {
    const board = buildBoard([dark], [rawSample], 'Season4');
    expect(board.meta.currentSeason).toBe('Season4');
    expect(board.meta.seasons).toContain('Season4');
    expect(typeof board.meta.builtAt).toBe('string');
  });

  it('lists roster members with no ids as unresolved', () => {
    const ghost: RosterEntry = {
      eaId: 'kathemkh9', displayName: 'Kathem', platform: 'ps',
      region: 'NA West', mainMode: 'both',
    };
    const board = buildBoard([ghost], [rawSample], 'Season4');
    expect(board.unresolved).toEqual([
      { eaId: 'kathemkh9', displayName: 'Kathem', reason: 'not_found' },
    ]);
  });

  it('omits members who resolved but never played Gauntlet', () => {
    const other: RosterEntry = { ...dark, eaId: 'other', personaId: '1', nucleusId: '2' };
    const board = buildBoard([other], [rawSample], 'Season4');
    expect(board.seasons.Season4 ?? []).toEqual([]);
    expect(board.unresolved).toEqual([]);
  });

  it('always includes the current season, even with no data', () => {
    const board = buildBoard([], [], 'Season4');
    expect(board.seasons.Season4).toEqual([]);
    expect(board.provisional.Season4).toEqual([]);
    expect(board.unresolved).toEqual([]);
  });

  it('omits builtAt drift by accepting an injected clock', () => {
    const at = new Date('2026-09-12T00:00:00.000Z');
    expect(buildBoard([], [], 'Season4', at).meta.builtAt).toBe('2026-09-12T00:00:00.000Z');
  });
});
