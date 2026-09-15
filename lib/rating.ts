import type { BoardRow } from './types';

/**
 * How much each metric contributes to the overall rating.
 *
 * Gauntlet eliminates squads on objective points rather than kills, so a
 * rating that ignored objectives would misread the mode. Winning still
 * dominates because it is the actual goal; everything else describes how.
 */
export const RATING_WEIGHTS = {
  winPct: 0.4,
  objPerMatch: 0.15,
  kd: 0.15,
  killsPerMatch: 0.12,
  dpm: 0.1,
  revivesPerHour: 0.08,
} as const;

export type RatedMetric = keyof typeof RATING_WEIGHTS;

/**
 * Where `value` sits in `population`, 0-100.
 *
 * Uses midrank for ties — everyone level on a metric gets the same percentile
 * rather than an arbitrary winner decided by array order. A population of one
 * scores 50: with nobody to compare against, the honest answer is "average",
 * not "best".
 */
export function percentile(population: number[], value: number): number {
  if (population.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const p of population) {
    if (p < value) below++;
    else if (p === value) equal++;
  }
  return ((below + equal / 2) / population.length) * 100;
}

/**
 * Score every row against the others, 0-100.
 *
 * Percentiles rather than a fixed-points formula: the metrics have wildly
 * different units (a 3.0 K/D and 420 DPM are not comparable), and any
 * coefficient that made them comparable would be invented and need retuning
 * whenever the field changes. A percentile needs no constant and stays
 * meaningful as the population grows.
 *
 * A metric that is null for a player is dropped and the remaining weights are
 * renormalised, so missing data never reads as a bad score.
 */
export function rateAll(rows: BoardRow[]): BoardRow[] {
  const metrics = Object.keys(RATING_WEIGHTS) as RatedMetric[];

  // One population per metric, holding only the players who have that value.
  const populations = new Map<RatedMetric, number[]>(
    metrics.map((m) => [
      m,
      rows.map((r) => r[m]).filter((v): v is number => v !== null && Number.isFinite(v)),
    ]),
  );

  return rows.map((row) => {
    let weighted = 0;
    let weightUsed = 0;

    for (const m of metrics) {
      const value = row[m];
      if (value === null || !Number.isFinite(value)) continue;
      const weight = RATING_WEIGHTS[m];
      weighted += percentile(populations.get(m) ?? [], value) * weight;
      weightUsed += weight;
    }

    // Rounded here rather than in the pipeline: rating is produced after the
    // pipeline's rounding pass, so an unrounded value would reach the
    // committed board as 79.95652173913044.
    const rating = weightUsed > 0 ? Math.round((weighted / weightUsed) * 100) / 100 : null;
    return { ...row, rating };
  });
}
