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
  Kills_Total: 1162,
  Dmg_Dealt_Total: 385901,
  Assist_Total: 278,
  Revives_Teammates_Total: 140,
  tp_veh_air_jets: 8132,
  obj_armed_gm_gntgauntlet: 14,
  obj_defended_gm_gntgauntlet: 33,
  obj_destroyed_gm_gntgauntlet: 8,
  obj_disarmed_gm_gntgauntlet: 0,
  intel_pickup_gm_gntgauntlet: 19,
};

// Real Season 4 Gauntlet data for EA ID "CHASEXRYAN" (no jet time)
const chaseSlice: StatSlice = {
  matches_gm_gntgauntlet: 45,
  wins_gm_gntgauntlet: 35,
  losses_gm_gntgauntlet: 10,
  deaths_gm_gntgauntlet: 375,
  tp_gm_gntgauntlet: 64573,
  Kills_Total: 839,
  Dmg_Dealt_Total: 155538,
  Assist_Total: 449,
  Revives_Teammates_Total: 115,
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
    expect(computeMetrics({ Kills_Total: 5 }).winPct).toBeNull();
  });

  it('uses kills as K/D when deaths is zero', () => {
    const m = computeMetrics({ Kills_Total: 7, deaths_gm_gntgauntlet: 0, matches_gm_gntgauntlet: 3 });
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
    expect(computeMetrics({ Kills_Total: 8299 }).kd).toBeNull();
  });

  it('returns null rate stats when time played is zero', () => {
    const m = computeMetrics({ Kills_Total: 10, Dmg_Dealt_Total: 100, tp_gm_gntgauntlet: 0 });
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

  it('counts objective plays and rates them per match', () => {
    const m = computeMetrics(darkSlice);
    // 14 armed + 33 defended + 8 destroyed + 0 disarmed
    expect(m.objActions).toBe(55);
    expect(m.intelPickups).toBe(19);
    expect(m.objPerMatch).toBeCloseTo(55 / 50, 6);
    expect(m.intelPerMatch).toBeCloseTo(19 / 50, 6);
  });

  it('returns null objective rates when there are no matches', () => {
    // The API exposes no objective score, only these actions; with no match
    // count there is nothing to rate them against.
    const m = computeMetrics({ obj_armed_gm_gntgauntlet: 5 });
    expect(m.objActions).toBe(5);
    expect(m.objPerMatch).toBeNull();
    expect(m.intelPerMatch).toBeNull();
  });

  it('exposes the badge threshold', () => {
    expect(JET_BADGE_THRESHOLD).toBe(10);
  });
});
