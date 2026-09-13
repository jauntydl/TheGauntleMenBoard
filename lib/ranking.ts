import type { BoardRow } from './types';

/** Players below this many matches are shown as Provisional, not ranked. */
export const MIN_MATCHES = 10;

/** Nulls sort last regardless of direction. */
const desc = (a: number | null, b: number | null): number => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
};

const byStanding = (a: BoardRow, b: BoardRow): number =>
  desc(a.winPct, b.winPct) || desc(a.matches, b.matches) || desc(a.kd, b.kd);

/**
 * Split rows into the ranked board and the provisional section, sorting both
 * by Win % descending. Returns new objects; the input is never mutated.
 */
export function rankPlayers(rows: BoardRow[]): { ranked: BoardRow[]; provisional: BoardRow[] } {
  const eligible: BoardRow[] = [];
  const provisional: BoardRow[] = [];

  for (const r of rows) {
    (r.matches >= MIN_MATCHES ? eligible : provisional).push({ ...r, rank: null });
  }

  eligible.sort(byStanding);
  provisional.sort(byStanding);

  return {
    ranked: eligible.map((r, i) => ({ ...r, rank: i + 1 })),
    provisional,
  };
}
