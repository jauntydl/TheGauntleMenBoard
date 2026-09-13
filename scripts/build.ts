#!/usr/bin/env tsx
/**
 * Daily build: resolve roster ids, fetch Gauntlet stats, write data/.
 *
 *   npm run data          # write files
 *   npm run data:dry      # compute and report, write nothing
 *
 * Never exits non-zero because individual members were unresolved — that is
 * expected data (their in-game stats privacy is not set to Everyone).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fetchCurrentSeason, resolvePlayer, fetchBulk } from '../lib/gametools';
import { buildBoard, toBulkPlayer } from '../lib/pipeline';
import type { BoardFile, RosterEntry } from '../lib/types';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const roster: RosterEntry[] = JSON.parse(readFileSync('roster.json', 'utf8'));
  console.log(`Roster: ${roster.length} members`);

  const currentSeason = await fetchCurrentSeason();
  console.log(`Current season: ${currentSeason}`);

  // Resolve only members we have not already cached ids for.
  let resolvedCount = 0;
  for (const member of roster) {
    if (member.personaId && member.nucleusId) continue;
    const ids = await resolvePlayer(member.eaId);
    if (ids) {
      member.personaId = ids.personaId;
      member.nucleusId = ids.nucleusId;
      resolvedCount++;
    } else {
      console.warn(`  unresolved: ${member.eaId}`);
    }
  }
  console.log(`Resolved ${resolvedCount} new member(s)`);

  const bulk = roster.map(toBulkPlayer).filter((p): p is NonNullable<typeof p> => p !== null);
  console.log(`Fetching stats for ${bulk.length} resolved member(s)`);
  const responses = await fetchBulk(bulk);

  const board = buildBoard(roster, responses, currentSeason);

  const ranked = board.seasons[currentSeason]?.length ?? 0;
  const prov = board.provisional[currentSeason]?.length ?? 0;
  console.log(`${currentSeason}: ${ranked} ranked, ${prov} provisional, ${board.unresolved.length} unresolved`);

  if (dryRun) {
    console.log('--dry-run: no files written');
    return;
  }

  // Persist newly resolved ids first, so the cache is kept even on a day when
  // no stat moved. These two fields are the only part of roster.json the build
  // may modify; every other field is human-authored.
  if (resolvedCount > 0) {
    writeFileSync('roster.json', JSON.stringify(roster, null, 2) + '\n');
    console.log('Cached newly resolved ids into roster.json');
  }

  // Idempotence: builtAt changes on every run, so comparing whole files would
  // produce a commit every day even when no stat moved. Compare everything
  // except builtAt, and leave the files alone when nothing else changed.
  const stripClock = (b: BoardFile) => JSON.stringify({ ...b, meta: { ...b.meta, builtAt: '' } });
  if (existsSync('data/board.json')) {
    const previous: BoardFile = JSON.parse(readFileSync('data/board.json', 'utf8'));
    if (stripClock(previous) === stripClock(board)) {
      console.log('No stat changes since the last run — leaving data/ untouched.');
      return;
    }
  }

  mkdirSync('data', { recursive: true });

  // Single app-facing artifact: API routes import this statically, so no
  // filesystem access is needed at request time on Vercel.
  writeFileSync('data/board.json', JSON.stringify(board, null, 2) + '\n');

  // Per-season files as well, so day-to-day diffs stay readable in git history.
  for (const [season, rows] of Object.entries(board.seasons)) {
    writeFileSync(
      `data/${season.toLowerCase()}.json`,
      JSON.stringify({ season, rows, provisional: board.provisional[season] ?? [] }, null, 2) + '\n',
    );
  }
  writeFileSync('data/unresolved.json', JSON.stringify(board.unresolved, null, 2) + '\n');

  console.log('Wrote data/board.json and per-season files');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
