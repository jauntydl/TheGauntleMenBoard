import { describe, it, expect } from 'vitest';
import { computeMetrics, JET_BADGE_THRESHOLD } from './metrics';
import type { StatSlice } from './types';

// Real Season 4 Gauntlet data for EA ID "pkidarkpki"
const darkSlice: StatSlice = {
  matches_gm_gntgauntlet: 50,
  wins_gm_gntgauntlet: 29,
  losses_gm_gntgauntlet: 21,
  deaths_gm_gntgauntlet: 406,
  tp_gm_gntgauntlet: 54973,
  kills_gm_gntgauntlet: 1162,
  dmg_gm_gntgauntlet: 385901,
  assists_gm_gntgauntlet: 278,
  revives_gm_gntgauntlet: 140,
  tp_veh_air_jets: 8132,
};

// Real Season 4 Gauntlet data for EA ID "CHASEXRYAN" (no jet time)
const chaseSlice: StatSlice = {
  matches_gm_gntgauntlet: 45,
  wins_gm_gntgauntlet: 35,
  losses_gm_gntgauntlet: 10,
  deaths_gm_gntgauntlet: 375,
  tp_gm_gntgauntlet: 64573,
  kills_gm_gntgauntlet: 839,
  dmg_gm_gntgauntlet: 155538,
  assists_gm_gntgauntlet: 449,
  revives_gm_gntgauntlet: 115,
};

describe('computeMetrics', () => {
  it('computes rate stats for a jet-heavy player', () => {
    const m = computeMetrics(darkSlice);
    expect(m.matches).toBe(50);
    expect(m.wins).toBe(29);
    expect(m.losses).toBe(21);
    expect(m.winPct).toBeCloseTo(58.0, 4);
    expect(m.kd).toBeCloseTo(2.8620689655, 6);
    expect(m.kpm).toBeCloseTo(1.2682589635, 6);
    expect(m.dpm).toBeCloseTo(421.1896749313, 4);
    expect(m.jetPct).toBeCloseTo(14.7927164244, 6);
  });

  it('computes rate stats for an infantry player', () => {
    const m = computeMetrics(chaseSlice);
    expect(m.winPct).toBeCloseTo(77.7777777778, 6);
    expect(m.kd).toBeCloseTo(2.2373333333, 6);
    expect(m.kpm).toBeCloseTo(0.7795827978, 6);
    expect(m.dpm).toBeCloseTo(144.5229430257, 4);
    expect(m.jetPct).toBe(0);
    expect(m.revives).toBe(115);
    expect(m.assists).toBe(449);
  });

  it('treats missing fields as zero', () => {
    const m = computeMetrics({});
    expect(m.matches).toBe(0);
    expect(m.kills).toBe(0);
    expect(m.jetPct).toBe(0);
  });

  it('returns null winPct when there are no matches', () => {
    expect(computeMetrics({ kills_gm_gntgauntlet: 5 }).winPct).toBeNull();
  });

  it('uses kills as K/D when deaths is zero', () => {
    const m = computeMetrics({ kills_gm_gntgauntlet: 7, deaths_gm_gntgauntlet: 0, matches_gm_gntgauntlet: 3 });
    expect(m.kd).toBe(7);
  });

  it('returns null K/D when there are no kills and no deaths', () => {
    expect(computeMetrics({ matches_gm_gntgauntlet: 3 }).kd).toBeNull();
  });

  it('returns null K/D for a slice with kills but no match data at all', () => {
    // Real shape of a pre-per-mode-counter season slice (see buildBoard):
    // DICE added the _gm_gntgauntlet counters after Season 1, so an old
    // season carries a lifetime-scoped Kills_Total with no matches, deaths,
    // or time at all. Treating that kill count as a K/D would render an
    // absurd rate (e.g. "8299.00") instead of recognizing there's no
    // measurable play to attribute it to.
    expect(computeMetrics({ kills_gm_gntgauntlet: 8299 }).kd).toBeNull();
  });

  it('returns null rate stats when time played is zero', () => {
    const m = computeMetrics({ kills_gm_gntgauntlet: 10, dmg_gm_gntgauntlet: 100, tp_gm_gntgauntlet: 0 });
    expect(m.kpm).toBeNull();
    expect(m.dpm).toBeNull();
  });

  it('never produces NaN or Infinity', () => {
    for (const v of Object.values(computeMetrics({}))) {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('reads only the parent jet field, never summing children', () => {
    const m = computeMetrics({
      tp_gm_gntgauntlet: 10000,
      tp_veh_air_jets: 1000,
      tp_veh_air_fa18f: 900,
    });
    expect(m.jetPct).toBeCloseTo(10, 6);
  });

  // Real Season 2 data for EA ID "Excited_Pianist": the slice carries BOTH
  // the mode counter and a far larger unsuffixed rollup. Reading the rollup
  // produced a K/D of 202.88 from 4 matches on the live board.
  it('ignores the unsuffixed rollup when a mode counter is present', () => {
    const m = computeMetrics({
      matches_gm_gntgauntlet: 4,
      wins_gm_gntgauntlet: 4,
      deaths_gm_gntgauntlet: 52,
      tp_gm_gntgauntlet: 6158,
      kills_gm_gntgauntlet: 71,
      dmg_gm_gntgauntlet: 19921,
      Kills_Total: 10550,
      Dmg_Dealt_Total: 2648747,
    });
    expect(m.kills).toBe(71);
    expect(m.damage).toBe(19921);
    expect(m.kd).toBeCloseTo(71 / 52, 6);
    expect(m.kd).toBeLessThan(2);
  });

  it('rates revives per hour, not per match or in total', () => {
    // Real Season 4 data: 140 revives over 54973s (15.27h).
    const m = computeMetrics(darkSlice);
    expect(m.revives).toBe(140);
    expect(m.revivesPerHour).toBeCloseTo(140 / (54973 / 3600), 6);
  });

  it('returns null revives per hour when no time was played', () => {
    expect(computeMetrics({ revives_gm_gntgauntlet: 9 }).revivesPerHour).toBeNull();
  });

  it('exposes the badge threshold', () => {
    expect(JET_BADGE_THRESHOLD).toBe(10);
  });
});
