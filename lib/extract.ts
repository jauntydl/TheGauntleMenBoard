import type { RawResponse, RawPlayerIds, StatSlice } from './types';

export const GAUNTLET_MODE = 'GraniteGauntlet0';

/**
 * Flatten a raw payload into one StatSlice per season, for Gauntlet only.
 *
 * The API returns a fact table: each entry carries its dimensions in `fields`,
 * either {GameMode, Season} or {global: 'global'} for lifetime totals. We keep
 * only rows dimensioned by both GameMode === GraniteGauntlet0 and a Season.
 *
 * Values are copied verbatim. Vehicle fields nest (tp_veh_air_jets already
 * contains tp_veh_air_fa18f and friends), so summing anything here would
 * double-count.
 */
export function extractSlices(raw: RawResponse): Map<string, StatSlice> {
  const out = new Map<string, StatSlice>();
  const stats = raw.playerStats?.[0];
  if (!stats) return out;

  for (const category of stats.categories ?? []) {
    for (const field of category.catFields ?? []) {
      if (typeof field.value !== 'number') continue;

      let gameMode: string | undefined;
      let season: string | undefined;
      for (const d of field.fields ?? []) {
        if (d.name === 'GameMode') gameMode = d.value;
        else if (d.name === 'Season') season = d.value;
      }

      if (gameMode !== GAUNTLET_MODE || !season) continue;

      let slice = out.get(season);
      if (!slice) {
        slice = {};
        out.set(season, slice);
      }
      slice[field.name] = field.value;
    }
  }

  return out;
}

export function readPlayerIds(raw: RawResponse): RawPlayerIds | null {
  return raw.playerStats?.[0]?.player ?? null;
}
