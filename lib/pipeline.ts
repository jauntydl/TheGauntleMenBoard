import type { BoardFile, BoardRow, RawResponse, RosterEntry, UnresolvedEntry } from './types';
import { extractSlices, readPlayerIds } from './extract';
import { computeMetrics } from './metrics';
import { rankPlayers } from './ranking';
import type { BulkPlayer } from './gametools';

/**
 * Build a bulk-API entry from a resolved roster member.
 *
 * The upstream API currently ignores this field (verified live: the same
 * player returns identical data tagged 'pc', 'ps', 'xbox', 'steam', or
 * even 'unknown'), but we still send the member's real platform rather than
 * a hardcoded one, so a future tightening on their end doesn't silently
 * start returning wrong or empty data for non-pc members.
 */
export function toBulkPlayer(entry: RosterEntry): BulkPlayer | null {
  if (!entry.personaId || !entry.nucleusId) return null;
  return { player_id: entry.personaId, user_id: entry.nucleusId, platform: entry.platform };
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
    // rankPlayers' sort is stable but not fully ordered (ties fall through to
    // insertion order), and insertion order here is bulk-API response order,
    // which is documented-unstable. Sort by eaId first so tied rows land in
    // the same place on every run, keeping the daily build idempotent.
    const sorted = [...rows].sort((a, b) => a.eaId.localeCompare(b.eaId));
    const split = rankPlayers(sorted);
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

  // seasons[currentSeason] is seeded above, so this is never empty.
  const seasonNames = Object.keys(seasons).sort();

  return {
    meta: {
      currentSeason,
      seasons: seasonNames,
      builtAt: now.toISOString(),
    },
    seasons,
    provisional,
    unresolved,
  };
}
