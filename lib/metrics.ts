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
/**
 * Read the mode-suffixed counters, never the unsuffixed `*_Total` ones.
 *
 * Both appear inside a Gauntlet slice and they agree in recent seasons, which
 * makes the unsuffixed names look safe. They are not: in Season 2 the same
 * slice carries kills_gm_gntgauntlet = 71 alongside Kills_Total = 10550, and
 * dmg_gm_gntgauntlet = 19921 alongside Dmg_Dealt_Total = 2648747. Using the
 * unsuffixed fields put a K/D of 319 on the board for a player with 3 matches.
 * Only the suffixed field names the mode, so only the suffixed field is safe.
 */
export function computeMetrics(slice: StatSlice): Metrics {
  const matches = num(slice, 'matches_gm_gntgauntlet');
  const wins = num(slice, 'wins_gm_gntgauntlet');
  const losses = num(slice, 'losses_gm_gntgauntlet');
  const kills = num(slice, 'kills_gm_gntgauntlet');
  const headshots = num(slice, 'hsw_gm_gntgauntlet');
  const deaths = num(slice, 'deaths_gm_gntgauntlet');
  const damage = num(slice, 'dmg_gm_gntgauntlet');
  const assists = num(slice, 'assists_gm_gntgauntlet');
  const revives = num(slice, 'revives_gm_gntgauntlet');
  const timeSec = num(slice, 'tp_gm_gntgauntlet');

  // Parent category only — it already contains fa18f / f14tomcat / su57.
  const jetSec = num(slice, 'tp_veh_air_jets');

  const minutes = timeSec / 60;
  const hours = timeSec / 3600;

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
    headshots,
    deaths,
    damage,
    assists,
    revives,
    timeSec,
    winPct: matches > 0 ? (wins / matches) * 100 : null,
    kd,
    killsPerMatch: matches > 0 ? kills / matches : null,
    kpm: minutes > 0 ? kills / minutes : null,
    dpm: minutes > 0 ? damage / minutes : null,
    revivesPerHour: hours > 0 ? revives / hours : null,
    jetPct: timeSec > 0 ? (jetSec / timeSec) * 100 : 0,
  };
}
