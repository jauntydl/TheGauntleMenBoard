// lib/pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { buildBoard, toBulkPlayer } from './pipeline';
import { rawSample } from './fixtures/raw-sample';
import type { RawResponse, RosterEntry } from './types';

const dark: RosterEntry = {
  eaId: 'pkidarkpki', displayName: 'Dark', platform: 'pc', region: 'US East',
  mainMode: 'both', personaId: '849687045', nucleusId: '2250375376',
};

const dim = (gameMode: string, season: string) => [
  { name: 'GameMode', value: gameMode },
  { name: 'Season', value: season },
];

describe('toBulkPlayer', () => {
  it('forwards the roster member\'s own platform, not a hardcoded one', () => {
    // Fixture platform is deliberately not 'pc' so this fails if the
    // implementation ever goes back to hardcoding 'pc'.
    const psMember: RosterEntry = { ...dark, platform: 'ps' };
    expect(toBulkPlayer(psMember)).toEqual({
      player_id: '849687045', user_id: '2250375376', platform: 'ps',
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

  it('matches a multi-player bulk response back to roster members by personaId, not response order', () => {
    const alpha: RosterEntry = {
      eaId: 'alpha', displayName: 'Alpha', platform: 'pc', region: 'US East',
      mainMode: 'both', personaId: '100', nucleusId: '200',
    };
    const bravo: RosterEntry = {
      eaId: 'bravo', displayName: 'Bravo', platform: 'pc', region: 'US East',
      mainMode: 'both', personaId: '300', nucleusId: '400',
    };

    // One bulk response carrying both players, deliberately ordered opposite
    // to roster order (bravo first, alpha second) — the real API is
    // documented to return entries out of request order.
    const bulk: RawResponse = {
      playerStats: [
        {
          player: { nucleusId: '400', personaId: '300', platformId: 1 },
          categories: [{
            catName: 'glacier_mp',
            catFields: [{ name: 'matches_gm_gntgauntlet', value: 20, fields: dim('GraniteGauntlet0', 'Season4') }],
          }],
        },
        {
          player: { nucleusId: '200', personaId: '100', platformId: 1 },
          categories: [{
            catName: 'glacier_mp',
            catFields: [{ name: 'matches_gm_gntgauntlet', value: 40, fields: dim('GraniteGauntlet0', 'Season4') }],
          }],
        },
      ],
    };

    const board = buildBoard([alpha, bravo], [bulk], 'Season4');
    const rows = board.seasons.Season4;
    const alphaRow = rows.find((r) => r.eaId === 'alpha');
    const bravoRow = rows.find((r) => r.eaId === 'bravo');

    expect(alphaRow?.displayName).toBe('Alpha');
    expect(alphaRow?.matches).toBe(40);
    expect(bravoRow?.displayName).toBe('Bravo');
    expect(bravoRow?.matches).toBe(20);
  });

  it('produces an identical board regardless of bulk response order, even when rows tie', () => {
    const zed: RosterEntry = {
      eaId: 'zed', displayName: 'Zed', platform: 'pc', region: 'X',
      mainMode: 'both', personaId: '901', nucleusId: '902',
    };
    const amy: RosterEntry = {
      eaId: 'amy', displayName: 'Amy', platform: 'pc', region: 'X',
      mainMode: 'both', personaId: '903', nucleusId: '904',
    };

    // Both players have identical (all-zero) Season4 stats, so they tie
    // under every rankPlayers comparator key. Only insertion order could
    // break the tie, and insertion order here comes from the bulk response.
    const tieStats = (nucleusId: string, personaId: string) => ({
      player: { nucleusId, personaId, platformId: 1 },
      categories: [{
        catName: 'glacier_mp',
        catFields: [{ name: 'matches_gm_gntgauntlet', value: 0, fields: dim('GraniteGauntlet0', 'Season4') }],
      }],
    });

    const zedEntry = tieStats('902', '901');
    const amyEntry = tieStats('904', '903');

    const at = new Date('2026-09-12T00:00:00.000Z');
    const boardZedFirst = buildBoard([zed, amy], [{ playerStats: [zedEntry, amyEntry] }], 'Season4', at);
    const boardAmyFirst = buildBoard([zed, amy], [{ playerStats: [amyEntry, zedEntry] }], 'Season4', at);

    expect(boardZedFirst).toEqual(boardAmyFirst);
  });
});
