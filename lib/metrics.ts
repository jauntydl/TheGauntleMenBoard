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
/** Kills by weapon class. These are NOT mode-suffixed — see sniperPct. */
const AUTO_CLASSES = ['ar', 'crb', 'smg', 'mg'] as const;
const PRECISION_CLASSES = ['snp', 'dmr'] as const;
const OTHER_CLASSES = ['sg', 'pst'] as const;

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

  // Objective plays. Gauntlet eliminates squads on objective points, so this
  // feeds the rating even though it is not shown as its own column.
  const objActions =
    num(slice, 'obj_armed_gm_gntgauntlet') +
    num(slice, 'obj_defended_gm_gntgauntlet') +
    num(slice, 'obj_destroyed_gm_gntgauntlet') +
    num(slice, 'obj_disarmed_gm_gntgauntlet');

  // Playstyle, as a share of weapon kills rather than of all kills: melee,
  // grenades, gadgets and vehicles account for the rest, so weapon classes
  // reliably total only 85-93% of a player's kills.
  //
  // These fields are NOT mode-suffixed, so they carry the same rollup hazard
  // as Kills_Total: a Season 2 slice sums 8721 weapon kills against a mode
  // count of 71. When the sum exceeds the mode count the fields are a rollup
  // for some wider scope and the mix is meaningless, so report null.
  const classKills = (cls: readonly string[]): number =>
    cls.reduce((t, c) => t + num(slice, `kills_${c}_total`), 0);
  const autoKills = classKills(AUTO_CLASSES);
  const precisionKills = classKills(PRECISION_CLASSES);
  const weaponKills = autoKills + precisionKills + classKills(OTHER_CLASSES);
  const weaponMixTrusted = weaponKills > 0 && kills > 0 && weaponKills <= kills * 1.1;

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
    objPerMatch: matches > 0 ? objActions / matches : null,
    revivesPerHour: hours > 0 ? revives / hours : null,
    // Both filled in by rateAll once the whole field is known.
    rating: null,
    standouts: [],
    sniperPct: weaponMixTrusted ? (precisionKills / weaponKills) * 100 : null,
    autoPct: weaponMixTrusted ? (autoKills / weaponKills) * 100 : null,
    // Counts as well as shares, and behind the same guard: an untrusted
    // rollup is no more usable as a total than it is as a proportion.
    sniperKills: weaponMixTrusted ? precisionKills : null,
    autoKills: weaponMixTrusted ? autoKills : null,
    // Per match rather than raw totals, for the same reason every other rate
    // on the board is: a season total mostly measures who played the most.
    sniperPerMatch: weaponMixTrusted && matches > 0 ? precisionKills / matches : null,
    autoPerMatch: weaponMixTrusted && matches > 0 ? autoKills / matches : null,
    jetPct: timeSec > 0 ? (jetSec / timeSec) * 100 : 0,
  };
}
