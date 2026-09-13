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
  deaths: number;
  damage: number;
  assists: number;
  revives: number;
  timeSec: number;
  /** null when the denominator is zero; the UI renders these as an em dash. */
  winPct: number | null;
  kd: number | null;
  kpm: number | null;
  dpm: number | null;
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
  reason: 'not_found';
};

export type BoardFile = {
  meta: { currentSeason: string; seasons: string[]; builtAt: string };
  seasons: Record<string, BoardRow[]>;
  provisional: Record<string, BoardRow[]>;
  unresolved: UnresolvedEntry[];
};
