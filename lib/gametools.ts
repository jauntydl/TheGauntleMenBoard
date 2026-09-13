import type { RawPlayerIds, RawResponse } from './types';
import { readPlayerIds } from './extract';

export const API_BASE = 'https://api.gametools.network';

/** The API documents a hard maximum of 128 players per bulk call. */
export const BATCH_SIZE = 128;

export type BulkPlayer = { player_id: string; user_id: string; platform: string };

export type Deps = {
  fetchImpl?: typeof fetch;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Fetch with retry on transport errors and 5xx. A 404 is returned to the
 * caller untouched — for this API it means "no such player", which is data,
 * not a failure.
 */
async function request(url: string, init: RequestInit, deps: Deps): Promise<Response> {
  const doFetch = deps.fetchImpl ?? fetch;
  const retries = deps.retries ?? 3;
  const sleep = deps.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await doFetch(url, init);
      if (res.status === 404 || res.ok) return res;
      lastError = new Error(`${init.method ?? 'GET'} ${url} failed: HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries) await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Read the current season id from the live game events feed. Never hardcode it. */
export async function fetchCurrentSeason(deps: Deps = {}): Promise<string> {
  const res = await request(`${API_BASE}/bf6/gameevents/`, { method: 'GET' }, deps);
  const body = (await res.json()) as { events?: { name?: string; active?: boolean }[] };
  const season = body.events?.find((e) => e.active && /^Season\d+$/.test(e.name ?? ''));
  if (!season?.name) throw new Error('No active season found in /bf6/gameevents/');
  return season.name;
}

/** Resolve an EA ID to its persona/nucleus ids. Returns null when unknown. */
export async function resolvePlayer(eaId: string, deps: Deps = {}): Promise<RawPlayerIds | null> {
  const url = `${API_BASE}/bf6/stats/?name=${encodeURIComponent(eaId)}&raw=true`;
  const res = await request(url, { method: 'GET', headers: { accept: 'application/json' } }, deps);
  if (res.status === 404) return null;
  return readPlayerIds((await res.json()) as RawResponse);
}

/** Fetch raw stats for many players, batched at BATCH_SIZE. */
export async function fetchBulk(players: BulkPlayer[], deps: Deps = {}): Promise<RawResponse[]> {
  const out: RawResponse[] = [];
  for (const batch of chunk(players, BATCH_SIZE)) {
    const res = await request(
      `${API_BASE}/bf6/multiple/?raw=true`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch), // MUST be an array; an object returns 422
      },
      deps,
    );
    out.push((await res.json()) as RawResponse);
  }
  return out;
}
