import type { Metrics, StatSlice } from './types';

/** Jet share at or above this percent earns the ✈ badge. */
export const JET_BADGE_THRESHOLD = 10;

const num = (slice: StatSlice, key: string): number => {
  const v = slice[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/**
 * Turn one Gauntlet season slice into display metrics.
 *
 * Every rate stat returns null rather than NaN/Infinity when its denominator
 * is zero, so the UI can render an em dash instead of nonsense.
 */
export function computeMetrics(slice: StatSlice): Metrics {
  const matches = num(slice, 'matches_gm_gntgauntlet');
  const wins = num(slice, 'wins_gm_gntgauntlet');
  const losses = num(slice, 'losses_gm_gntgauntlet');
  const kills = num(slice, 'Kills_Total');
  const deaths = num(slice, 'deaths_gm_gntgauntlet');
  const damage = num(slice, 'Dmg_Dealt_Total');
  const assists = num(slice, 'Assist_Total');
  const revives = num(slice, 'Revives_Teammates_Total');
  const timeSec = num(slice, 'tp_gm_gntgauntlet');

  // Objective plays. Counted per match rather than per minute: an objective is
  // a discrete act with a fixed opportunity cost, and matches are the unit a
  // Gauntlet squad is actually scored in.
  const objActions =
    num(slice, 'obj_armed_gm_gntgauntlet') +
    num(slice, 'obj_defended_gm_gntgauntlet') +
    num(slice, 'obj_destroyed_gm_gntgauntlet') +
    num(slice, 'obj_disarmed_gm_gntgauntlet');
  const intelPickups = num(slice, 'intel_pickup_gm_gntgauntlet');

  // Parent category only — it already contains fa18f / f14tomcat / su57.
  const jetSec = num(slice, 'tp_veh_air_jets');

  const minutes = timeSec / 60;

  // Kills-as-K/D covers "played matches, died zero times" — a real, if rare,
  // outcome. It is not a substitute for missing match data: some season
  // slices (see buildBoard) carry a lifetime/legacy Kills_Total with no
  // matches/deaths/time at all, and treating that as a K/D would render an
  // absurd rate stat (thousands of "kills per death"). Require matches > 0.
  let kd: number | null;
  if (matches === 0) kd = null;
  else if (deaths > 0) kd = kills / deaths;
  else if (kills > 0) kd = kills;
  else kd = null;

  return {
    matches,
    wins,
    losses,
    kills,
    deaths,
    damage,
    assists,
    revives,
    timeSec,
    objActions,
    intelPickups,
    winPct: matches > 0 ? (wins / matches) * 100 : null,
    kd,
    kpm: minutes > 0 ? kills / minutes : null,
    dpm: minutes > 0 ? damage / minutes : null,
    objPerMatch: matches > 0 ? objActions / matches : null,
    intelPerMatch: matches > 0 ? intelPickups / matches : null,
    jetPct: timeSec > 0 ? (jetSec / timeSec) * 100 : 0,
  };
}
