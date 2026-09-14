export type RawDimension = { name: string; value?: string };
export type RawField = { name: string; value?: number; fields?: RawDimension[] };
export type RawCategory = { catName: string; catFields: RawField[] };
export type RawPlayerIds = { nucleusId: string; personaId: string; platformId: number };
export type RawPlayerStats = { player: RawPlayerIds; categories: RawCategory[] };
export type RawResponse = { playerStats: RawPlayerStats[] };

/** A flat map of stat name -> value for one GameMode x Season slice. */
export type StatSlice = Record<string, number>;

export type MainMode = 'gauntlet' | 'redsec' | 'both' | 'unknown';

export type RosterEntry = {
  eaId: string;
  displayName: string;
  platform: string;
  region: string;
  mainMode: MainMode;
  /** Cached by the build. The only fields the build may write back. */
  personaId?: string;
  nucleusId?: string;
};

export type Metrics = {
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  /** Headshot kills. From hsw_gm_gntgauntlet — kills_Headshots_Total is a
   *  rollup that reads 1512 against 9 in a Season 2 slice. */
  headshots: number;
  deaths: number;
  damage: number;
  assists: number;
  revives: number;
  timeSec: number;
  /** null when the denominator is zero; the UI renders these as an em dash. */
  winPct: number | null;
  kd: number | null;
  /** Kills per match. Distinct from kpm, which is per minute. */
  killsPerMatch: number | null;
  kpm: number | null;
  dpm: number | null;
  /** Per hour, not per minute: revives are rare enough that a per-minute rate
   *  reads as 0.0x for everyone. */
  revivesPerHour: number | null;
  jetPct: number;
};

export type BoardRow = Metrics & {
  eaId: string;
  displayName: string;
  platform: string;
  region: string;
  mainMode: MainMode;
  rank: number | null;
};

export type UnresolvedEntry = {
  eaId: string;
  displayName: string;
  /**
   * 'not_found' — never resolved (no cached ids; privacy off, or a bad EA ID).
   * 'no_data' — was resolved before, but no response came back this run for
   * that persona (most often privacy was turned back off after resolving).
   */
  reason: 'not_found' | 'no_data';
};

export type BoardFile = {
  meta: { currentSeason: string; seasons: string[]; builtAt: string };
  seasons: Record<string, BoardRow[]>;
  provisional: Record<string, BoardRow[]>;
  unresolved: UnresolvedEntry[];
};
