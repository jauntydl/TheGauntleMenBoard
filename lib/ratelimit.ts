/**
 * A best-effort in-memory rate limiter.
 *
 * Deliberately not a durable one. Signups are open to anyone, but every
 * accepted signup must resolve against EA, must not already be on the board,
 * and lands as a reviewable commit — so the worst an abuser achieves is
 * adding real Battlefield players, and you revert the commit. What this
 * guards is the free gametools API behind us and the deploy queue in front,
 * both of which only care about bursts.
 *
 * Serverless instances come and go, so a determined attacker who spreads
 * requests across cold starts gets more than `limit`. Anything stronger would
 * mean the database this project exists without.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Requests allowed per key per window. */
export const LIMIT = 5;
export const WINDOW_MS = 60 * 60 * 1000;

/**
 * Record a hit and say whether it is allowed.
 *
 * `retryAfterSec` is only meaningful when allowed is false.
 */
export function take(
  key: string,
  now: number = Date.now(),
  limit: number = LIMIT,
  windowMs: number = WINDOW_MS,
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  // Opportunistic sweep: the map would otherwise hold every IP seen since the
  // instance started, and nothing else ever visits these entries again.
  if (buckets.size > 1000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };
  bucket.count++;
  buckets.set(key, bucket);

  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Test seam: forget every bucket. */
export function reset(): void {
  buckets.clear();
}

/**
 * The caller's IP as far as we can tell.
 *
 * Vercel sets x-forwarded-for and strips any client-supplied copy, so its
 * first entry is trustworthy there. Falls back to a single shared bucket
 * rather than to no limit at all: one shared limit degrades a burst for
 * everyone, while no limit degrades the upstream API for everyone.
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}
