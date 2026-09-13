import type { BoardFile, BoardRow, RawResponse, RosterEntry, UnresolvedEntry } from './types';
import { extractSlices, readPlayerIds } from './extract';
import { computeMetrics } from './metrics';
import { rankPlayers } from './ranking';
import type { BulkPlayer } from './gametools';

/** Build a bulk-API entry from a resolved roster member. */
export function toBulkPlayer(entry: RosterEntry): BulkPlayer | null {
  if (!entry.personaId || !entry.nucleusId) return null;
  return { player_id: entry.personaId, user_id: entry.nucleusId, platform: 'pc' };
}

/**
 * Assemble the board from a roster and the raw responses fetched for it.
 *
 * Pure: no network, no filesystem. Each raw response is matched back to its
 * roster member by personaId.
 */
export function buildBoard(
  roster: RosterEntry[],
  responses: RawResponse[],
  currentSeason: string,
  now: Date = new Date(),
): BoardFile {
  const byPersona = new Map(roster.filter((r) => r.personaId).map((r) => [r.personaId!, r]));

  const rowsBySeason = new Map<string, BoardRow[]>();

  // A raw response may contain several players when it came from a bulk batch.
  const singles: RawResponse[] = [];
  for (const res of responses) {
    for (const ps of res.playerStats ?? []) singles.push({ playerStats: [ps] });
  }

  for (const single of singles) {
    const ids = readPlayerIds(single);
    const member = ids ? byPersona.get(ids.personaId) : undefined;
    if (!member) continue;

    for (const [season, slice] of extractSlices(single)) {
      const row: BoardRow = {
        ...computeMetrics(slice),
        eaId: member.eaId,
        displayName: member.displayName,
        platform: member.platform,
        region: member.region,
        mainMode: member.mainMode,
        rank: null,
      };
      const list = rowsBySeason.get(season) ?? [];
      list.push(row);
      rowsBySeason.set(season, list);
    }
  }

  const seasons: Record<string, BoardRow[]> = {};
  const provisional: Record<string, BoardRow[]> = {};
  for (const [season, rows] of rowsBySeason) {
    const split = rankPlayers(rows);
    seasons[season] = split.ranked;
    provisional[season] = split.provisional;
  }

  // The current season must always be a valid key, so the board renders an
  // empty state rather than 404ing on the day a new season starts.
  seasons[currentSeason] ??= [];
  provisional[currentSeason] ??= [];

  const unresolved: UnresolvedEntry[] = roster
    .filter((r) => !r.personaId || !r.nucleusId)
    .map((r) => ({ eaId: r.eaId, displayName: r.displayName, reason: 'not_found' as const }));

  const seasonNames = Object.keys(seasons).sort();

  return {
    meta: {
      currentSeason,
      seasons: seasonNames.length ? seasonNames : [currentSeason],
      builtAt: now.toISOString(),
    },
    seasons,
    provisional,
    unresolved,
  };
}
