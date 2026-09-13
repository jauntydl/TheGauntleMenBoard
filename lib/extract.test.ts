import { describe, it, expect } from 'vitest';
import { extractSlices, readPlayerIds, GAUNTLET_MODE } from './extract';
import { rawSample } from './fixtures/raw-sample';

describe('extractSlices', () => {
  it('uses the exact Gauntlet mode id', () => {
    expect(GAUNTLET_MODE).toBe('GraniteGauntlet0');
  });

  it('groups Gauntlet stats by season', () => {
    const slices = extractSlices(rawSample);
    expect([...slices.keys()].sort()).toEqual(['Season3', 'Season4']);
  });

  it('extracts the Season4 values', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    expect(s4.matches_gm_gntgauntlet).toBe(50);
    expect(s4.wins_gm_gntgauntlet).toBe(29);
    expect(s4.deaths_gm_gntgauntlet).toBe(406);
    expect(s4.Kills_Total).toBe(1162);
  });

  it('ignores other game modes', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    expect(s4.Kills_Total).not.toBe(9999);
  });

  it('ignores global/lifetime rows', () => {
    const slices = extractSlices(rawSample);
    expect(slices.has('global')).toBe(false);
    expect([...slices.keys()]).not.toContain(undefined as unknown as string);
  });

  it('does not double-count nested vehicle fields', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    // parent is read verbatim; the child is NOT added into it
    expect(s4.tp_veh_air_jets).toBe(8132);
    expect(s4.tp_veh_air_fa18f).toBe(6841);
  });

  it('skips fields with no value', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    expect(s4.broken_field).toBeUndefined();
  });

  it('returns an empty map for an empty payload', () => {
    expect(extractSlices({ playerStats: [] }).size).toBe(0);
  });
});

describe('readPlayerIds', () => {
  it('reads persona and nucleus ids', () => {
    expect(readPlayerIds(rawSample)).toEqual({
      nucleusId: '2250375376',
      personaId: '849687045',
      platformId: 1,
    });
  });

  it('returns null when absent', () => {
    expect(readPlayerIds({ playerStats: [] })).toBeNull();
  });
});
