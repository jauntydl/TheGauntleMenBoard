# GauntletTracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shareable web leaderboard ranking a ~300 person Battlefield 6 community on Gauntlet performance, by season, on skill-based rate stats.

**Architecture:** A framework-free `lib/` does all data work (gametools client, slice extraction, metrics, ranking) and is imported by both a daily Node build script and Next.js API routes. A GitHub Action runs the build daily, commits the generated JSON, and the push triggers a Vercel redeploy. Next.js App Router + MUI renders the board from those committed files. No database, no runtime writes, no gametools calls at request time.

**Tech Stack:** Next.js (App Router) · TypeScript · MUI v7 + DataGrid · Vitest + React Testing Library · tsx · GitHub Actions · Vercel

**Spec:** `docs/superpowers/specs/2026-09-12-gauntlet-leaderboard-design.md`

## Global Constraints

- **API base:** `https://api.gametools.network` — unauthenticated. Never send an API key or the user's email.
- **Gauntlet mode id:** `GraniteGauntlet0` (exact string, case-sensitive).
- **Bulk batch size:** 128 players maximum per `POST /bf6/multiple/?raw=true` call.
- **Bulk request body:** a JSON **array** of `{"player_id": personaId, "user_id": nucleusId, "platform": "pc"}`. Sending an object instead of an array returns HTTP 422.
- **Vehicle fields nest.** `tp_veh_air_jets` already includes `tp_veh_air_fa18f`, `tp_veh_air_f14tomcat`, `tp_veh_air_su57`. Read the parent only; never sum parent and children.
- **Season filtering is client-side.** The API's `filter` param only honours the `global` scope; season scopes return zeros. Always fetch `raw=true` and group locally.
- **Minimum matches to be ranked:** 10. Below that → Provisional section, not hidden.
- **Jet badge threshold:** jet % ≥ 10.
- **Default board sort:** Win % descending.
- **Language:** TypeScript throughout (`.ts`/`.tsx`). This supersedes the `.mjs` filenames in the spec; `lib/` stays free of Next.js and `fs` imports so it unit-tests without a framework harness.
- **Never fail the build for unresolved members.** A 404 on a player is expected data, not an error.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/types.ts` | Shared types for raw payloads, roster, board rows |
| `lib/extract.ts` | `catFields` → `GraniteGauntlet0 × Season` slices |
| `lib/metrics.ts` | Rate-stat math, denominator guards, jet % |
| `lib/ranking.ts` | Sort, match floor, ranked/provisional split |
| `lib/gametools.ts` | API client: current season, resolve, bulk fetch, retry |
| `lib/data.ts` | App-side reader over the generated `data/board.json` |
| `scripts/build.ts` | Daily pipeline orchestration |
| `scripts/parse-intros.ts` | One-off Discord `#introductions` → `roster.json` |
| `app/layout.tsx` | MUI App Router cache provider + theme |
| `app/page.tsx` | Board page |
| `app/not-listed/page.tsx` | "Why am I not listed?" |
| `app/api/{leaderboard,unresolved,meta}/route.ts` | Read-only JSON endpoints |
| `components/LeaderboardTable.tsx` | MUI DataGrid board + jet badge |
| `components/SeasonTabs.tsx` | Season switcher |
| `components/FilterChips.tsx` | Region / platform / main-mode filters |
| `.github/workflows/daily.yml` | Daily cron → build → commit |

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.mts`, `vitest.setup.ts`
- Test: `lib/sanity.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` and `npm run dev`; all later tasks assume Vitest with `globals: true` and a `jsdom` environment.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "gauntlet-tracker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "data": "tsx scripts/build.ts",
    "data:dry": "tsx scripts/build.ts --dry-run",
    "roster:parse": "tsx scripts/parse-intros.ts"
  },
  "dependencies": {
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.0",
    "@mui/material": "^7.0.0",
    "@mui/material-nextjs": "^7.0.0",
    "@mui/x-data-grid": "^7.0.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 4: Create `vitest.config.mts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(process.cwd()) },
  },
});
```

- [ ] **Step 5: Create `vitest.setup.ts`**

The polyfills below are **required**, not optional. MUI X DataGrid virtualises
its rows: in jsdom it sees a zero-width, zero-height container, renders no rows
at all, and every table test in Tasks 10 and 12 fails with "unable to find
element". jsdom also has no `ResizeObserver`, which DataGrid constructs on
mount. Do not remove these.

```ts
import '@testing-library/jest-dom/vitest';

// jsdom ships no ResizeObserver; MUI X DataGrid constructs one on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom reports every element as 0x0, so DataGrid virtualises all rows away.
// Give layout a non-zero viewport so rows actually render.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  value: 1024,
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  value: 768,
});
Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => ({
    width: 1024, height: 768, top: 0, left: 0, bottom: 768, right: 1024,
    x: 0, y: 0, toJSON: () => {},
  }),
});
```

- [ ] **Step 6: Write the sanity test**

```ts
// lib/sanity.test.ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs TypeScript tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install and run**

Run: `npm install && npm test`
Expected: PASS, 1 test.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs vitest.config.mts vitest.setup.ts lib/sanity.test.ts
git commit -m "chore: scaffold Next.js + MUI + Vitest"
```

---

### Task 2: Types and Gauntlet slice extraction

**Files:**
- Create: `lib/types.ts`, `lib/extract.ts`, `lib/fixtures/raw-sample.ts`
- Test: `lib/extract.test.ts`
- Delete: `lib/sanity.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `GAUNTLET_MODE = 'GraniteGauntlet0'`
  - `extractSlices(raw: RawResponse): Map<string, StatSlice>` — season name → flat `Record<string, number>`
  - `readPlayerIds(raw: RawResponse): RawPlayerIds | null`
  - Types `RawResponse`, `RawPlayerStats`, `RawField`, `StatSlice`, `RosterEntry`, `BoardRow`

- [ ] **Step 1: Create `lib/types.ts`**

```ts
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
```

- [ ] **Step 2: Create the fixture**

This mirrors the real API structure exactly, trimmed to what the tests need. Note `tp_veh_air_fa18f` is deliberately present alongside its parent `tp_veh_air_jets` so the no-double-counting test is meaningful.

```ts
// lib/fixtures/raw-sample.ts
import type { RawResponse } from '../types';

const dim = (gameMode: string, season: string) => [
  { name: 'GameMode', value: gameMode },
  { name: 'Season', value: season },
];

/** Mirrors api.gametools.network /bf6/multiple/?raw=true, trimmed. */
export const rawSample: RawResponse = {
  playerStats: [
    {
      player: { nucleusId: '2250375376', personaId: '849687045', platformId: 1 },
      categories: [
        {
          catName: 'glacier_mp',
          catFields: [
            // --- Gauntlet, Season4 ---
            { name: 'matches_gm_gntgauntlet', value: 50, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'wins_gm_gntgauntlet', value: 29, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'losses_gm_gntgauntlet', value: 21, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'deaths_gm_gntgauntlet', value: 406, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'tp_gm_gntgauntlet', value: 54973, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'Kills_Total', value: 1162, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'Dmg_Dealt_Total', value: 385901, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'Assist_Total', value: 278, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'Revives_Teammates_Total', value: 140, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'tp_veh_air_jets', value: 8132, fields: dim('GraniteGauntlet0', 'Season4') },
            { name: 'tp_veh_air_fa18f', value: 6841, fields: dim('GraniteGauntlet0', 'Season4') },
            // --- Gauntlet, Season3 ---
            { name: 'matches_gm_gntgauntlet', value: 34, fields: dim('GraniteGauntlet0', 'Season3') },
            { name: 'Kills_Total', value: 824, fields: dim('GraniteGauntlet0', 'Season3') },
            // --- a different mode, must be ignored ---
            { name: 'Kills_Total', value: 9999, fields: dim('Conquest0', 'Season4') },
            // --- lifetime/global row, must be ignored ---
            { name: 'Kills_Total', value: 12345, fields: [{ name: 'global', value: 'global' }] },
            // --- a field with no value, must be ignored ---
            { name: 'broken_field', fields: dim('GraniteGauntlet0', 'Season4') },
          ],
        },
      ],
    },
  ],
};
```

- [ ] **Step 3: Write the failing tests**

```ts
// lib/extract.test.ts
import { describe, it, expect } from 'vitest';
import { extractSlices, readPlayerIds, GAUNTLET_MODE } from './extract';
import { rawSample } from './fixtures/raw-sample';

describe('extractSlices', () => {
  it('uses the exact Gauntlet mode id', () => {
    expect(GAUNTLET_MODE).toBe('GraniteGauntlet0');
  });

  it('groups Gauntlet stats by season', () => {
    const slices = extractSlices(rawSample);
    expect([...slices.keys()].sort()).toEqual(['Season3', 'Season4']);
  });

  it('extracts the Season4 values', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    expect(s4.matches_gm_gntgauntlet).toBe(50);
    expect(s4.wins_gm_gntgauntlet).toBe(29);
    expect(s4.deaths_gm_gntgauntlet).toBe(406);
    expect(s4.Kills_Total).toBe(1162);
  });

  it('ignores other game modes', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    expect(s4.Kills_Total).not.toBe(9999);
  });

  it('ignores global/lifetime rows', () => {
    const slices = extractSlices(rawSample);
    expect(slices.has('global')).toBe(false);
    expect([...slices.keys()]).not.toContain(undefined as unknown as string);
  });

  it('does not double-count nested vehicle fields', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    // parent is read verbatim; the child is NOT added into it
    expect(s4.tp_veh_air_jets).toBe(8132);
    expect(s4.tp_veh_air_fa18f).toBe(6841);
  });

  it('skips fields with no value', () => {
    const s4 = extractSlices(rawSample).get('Season4')!;
    expect(s4.broken_field).toBeUndefined();
  });

  it('returns an empty map for an empty payload', () => {
    expect(extractSlices({ playerStats: [] }).size).toBe(0);
  });
});

describe('readPlayerIds', () => {
  it('reads persona and nucleus ids', () => {
    expect(readPlayerIds(rawSample)).toEqual({
      nucleusId: '2250375376',
      personaId: '849687045',
      platformId: 1,
    });
  });

  it('returns null when absent', () => {
    expect(readPlayerIds({ playerStats: [] })).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run lib/extract.test.ts`
Expected: FAIL — cannot resolve `./extract`.

- [ ] **Step 5: Implement `lib/extract.ts`**

```ts
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/extract.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Remove the sanity test and commit**

```bash
rm lib/sanity.test.ts
git add lib/types.ts lib/extract.ts lib/extract.test.ts lib/fixtures/raw-sample.ts
git rm --cached lib/sanity.test.ts 2>/dev/null || true
git add -A
git commit -m "feat: extract Gauntlet stat slices by season"
```

---

### Task 3: Metrics

**Files:**
- Create: `lib/metrics.ts`
- Test: `lib/metrics.test.ts`

**Interfaces:**
- Consumes: `StatSlice`, `Metrics` from `lib/types.ts`
- Produces:
  - `computeMetrics(slice: StatSlice): Metrics`
  - `JET_BADGE_THRESHOLD = 10`

Expected values below are real, taken from live API responses for two community members in Season 4. Do not change them.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/metrics.test.ts
import { describe, it, expect } from 'vitest';
import { computeMetrics, JET_BADGE_THRESHOLD } from './metrics';
import type { StatSlice } from './types';

// Real Season 4 Gauntlet data for EA ID "pkidarkpki"
const darkSlice: StatSlice = {
  matches_gm_gntgauntlet: 50,
  wins_gm_gntgauntlet: 29,
  losses_gm_gntgauntlet: 21,
  deaths_gm_gntgauntlet: 406,
  tp_gm_gntgauntlet: 54973,
  Kills_Total: 1162,
  Dmg_Dealt_Total: 385901,
  Assist_Total: 278,
  Revives_Teammates_Total: 140,
  tp_veh_air_jets: 8132,
};

// Real Season 4 Gauntlet data for EA ID "CHASEXRYAN" (no jet time)
const chaseSlice: StatSlice = {
  matches_gm_gntgauntlet: 45,
  wins_gm_gntgauntlet: 35,
  losses_gm_gntgauntlet: 10,
  deaths_gm_gntgauntlet: 375,
  tp_gm_gntgauntlet: 64573,
  Kills_Total: 839,
  Dmg_Dealt_Total: 155538,
  Assist_Total: 449,
  Revives_Teammates_Total: 115,
};

describe('computeMetrics', () => {
  it('computes rate stats for a jet-heavy player', () => {
    const m = computeMetrics(darkSlice);
    expect(m.matches).toBe(50);
    expect(m.wins).toBe(29);
    expect(m.losses).toBe(21);
    expect(m.winPct).toBeCloseTo(58.0, 4);
    expect(m.kd).toBeCloseTo(2.8620689655, 6);
    expect(m.kpm).toBeCloseTo(1.2682589635, 6);
    expect(m.dpm).toBeCloseTo(421.1896749313, 4);
    expect(m.jetPct).toBeCloseTo(14.7927164244, 6);
  });

  it('computes rate stats for an infantry player', () => {
    const m = computeMetrics(chaseSlice);
    expect(m.winPct).toBeCloseTo(77.7777777778, 6);
    expect(m.kd).toBeCloseTo(2.2373333333, 6);
    expect(m.kpm).toBeCloseTo(0.7795827978, 6);
    expect(m.dpm).toBeCloseTo(144.5229430257, 4);
    expect(m.jetPct).toBe(0);
    expect(m.revives).toBe(115);
    expect(m.assists).toBe(449);
  });

  it('treats missing fields as zero', () => {
    const m = computeMetrics({});
    expect(m.matches).toBe(0);
    expect(m.kills).toBe(0);
    expect(m.jetPct).toBe(0);
  });

  it('returns null winPct when there are no matches', () => {
    expect(computeMetrics({ Kills_Total: 5 }).winPct).toBeNull();
  });

  it('uses kills as K/D when deaths is zero', () => {
    const m = computeMetrics({ Kills_Total: 7, deaths_gm_gntgauntlet: 0 });
    expect(m.kd).toBe(7);
  });

  it('returns null K/D when there are no kills and no deaths', () => {
    expect(computeMetrics({ matches_gm_gntgauntlet: 3 }).kd).toBeNull();
  });

  it('returns null rate stats when time played is zero', () => {
    const m = computeMetrics({ Kills_Total: 10, Dmg_Dealt_Total: 100, tp_gm_gntgauntlet: 0 });
    expect(m.kpm).toBeNull();
    expect(m.dpm).toBeNull();
  });

  it('never produces NaN or Infinity', () => {
    for (const v of Object.values(computeMetrics({}))) {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('reads only the parent jet field, never summing children', () => {
    const m = computeMetrics({
      tp_gm_gntgauntlet: 10000,
      tp_veh_air_jets: 1000,
      tp_veh_air_fa18f: 900,
    });
    expect(m.jetPct).toBeCloseTo(10, 6);
  });

  it('exposes the badge threshold', () => {
    expect(JET_BADGE_THRESHOLD).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/metrics.test.ts`
Expected: FAIL — cannot resolve `./metrics`.

- [ ] **Step 3: Implement `lib/metrics.ts`**

```ts
import type { Metrics, StatSlice } from './types';

/** Jet share at or above this percent earns the ✈ badge. */
export const JET_BADGE_THRESHOLD = 10;

const num = (slice: StatSlice, key: string): number => {
  const v = slice[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/**
 * Turn one Gauntlet season slice into display metrics.
 *
 * Every rate stat returns null rather than NaN/Infinity when its denominator
 * is zero, so the UI can render an em dash instead of nonsense.
 */
export function computeMetrics(slice: StatSlice): Metrics {
  const matches = num(slice, 'matches_gm_gntgauntlet');
  const wins = num(slice, 'wins_gm_gntgauntlet');
  const losses = num(slice, 'losses_gm_gntgauntlet');
  const kills = num(slice, 'Kills_Total');
  const deaths = num(slice, 'deaths_gm_gntgauntlet');
  const damage = num(slice, 'Dmg_Dealt_Total');
  const assists = num(slice, 'Assist_Total');
  const revives = num(slice, 'Revives_Teammates_Total');
  const timeSec = num(slice, 'tp_gm_gntgauntlet');

  // Parent category only — it already contains fa18f / f14tomcat / su57.
  const jetSec = num(slice, 'tp_veh_air_jets');

  const minutes = timeSec / 60;

  let kd: number | null;
  if (deaths > 0) kd = kills / deaths;
  else if (kills > 0) kd = kills;
  else kd = null;

  return {
    matches,
    wins,
    losses,
    kills,
    deaths,
    damage,
    assists,
    revives,
    timeSec,
    winPct: matches > 0 ? (wins / matches) * 100 : null,
    kd,
    kpm: minutes > 0 ? kills / minutes : null,
    dpm: minutes > 0 ? damage / minutes : null,
    jetPct: timeSec > 0 ? (jetSec / timeSec) * 100 : 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/metrics.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/metrics.ts lib/metrics.test.ts
git commit -m "feat: compute Gauntlet rate stats with denominator guards"
```

---

### Task 4: Ranking, match floor, provisional split

**Files:**
- Create: `lib/ranking.ts`
- Test: `lib/ranking.test.ts`

**Interfaces:**
- Consumes: `BoardRow` from `lib/types.ts`
- Produces:
  - `MIN_MATCHES = 10`
  - `rankPlayers(rows: BoardRow[]): { ranked: BoardRow[]; provisional: BoardRow[] }`

Ranked rows are sorted Win % descending, tie-broken by matches descending then K/D descending, and are assigned `rank` starting at 1. Provisional rows (under the floor) keep `rank: null` and are sorted the same way.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/ranking.test.ts
import { describe, it, expect } from 'vitest';
import { rankPlayers, MIN_MATCHES } from './ranking';
import type { BoardRow } from './types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
  matches: 20, wins: 10, losses: 10, kills: 100, deaths: 50, damage: 1000,
  assists: 0, revives: 0, timeSec: 6000,
  winPct: 50, kd: 2, kpm: 1, dpm: 10, jetPct: 0, rank: null,
  ...over,
});

describe('rankPlayers', () => {
  it('uses a floor of 10 matches', () => {
    expect(MIN_MATCHES).toBe(10);
  });

  it('sorts by win percent descending', () => {
    const { ranked } = rankPlayers([
      row({ eaId: 'low', winPct: 40 }),
      row({ eaId: 'high', winPct: 80 }),
      row({ eaId: 'mid', winPct: 60 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['high', 'mid', 'low']);
  });

  it('assigns ranks starting at 1', () => {
    const { ranked } = rankPlayers([row({ eaId: 'a', winPct: 80 }), row({ eaId: 'b', winPct: 40 })]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('moves under-floor players to provisional', () => {
    const { ranked, provisional } = rankPlayers([
      row({ eaId: 'veteran', matches: 10 }),
      row({ eaId: 'rookie', matches: 9 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['veteran']);
    expect(provisional.map((r) => r.eaId)).toEqual(['rookie']);
  });

  it('leaves provisional ranks null', () => {
    const { provisional } = rankPlayers([row({ eaId: 'rookie', matches: 3 })]);
    expect(provisional[0].rank).toBeNull();
  });

  it('breaks win-percent ties by matches, then K/D', () => {
    const { ranked } = rankPlayers([
      row({ eaId: 'fewer', winPct: 50, matches: 20, kd: 3 }),
      row({ eaId: 'more', winPct: 50, matches: 40, kd: 1 }),
      row({ eaId: 'tiebreak', winPct: 50, matches: 20, kd: 5 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['more', 'tiebreak', 'fewer']);
  });

  it('sorts null win percent last', () => {
    const { ranked } = rankPlayers([
      row({ eaId: 'none', winPct: null }),
      row({ eaId: 'some', winPct: 10 }),
    ]);
    expect(ranked.map((r) => r.eaId)).toEqual(['some', 'none']);
  });

  it('does not mutate its input', () => {
    const input = [row({ eaId: 'a', winPct: 10 }), row({ eaId: 'b', winPct: 90 })];
    rankPlayers(input);
    expect(input.map((r) => r.eaId)).toEqual(['a', 'b']);
    expect(input[0].rank).toBeNull();
  });

  it('handles an empty roster', () => {
    expect(rankPlayers([])).toEqual({ ranked: [], provisional: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ranking.test.ts`
Expected: FAIL — cannot resolve `./ranking`.

- [ ] **Step 3: Implement `lib/ranking.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/ranking.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ranking.ts lib/ranking.test.ts
git commit -m "feat: rank players by win percent with a provisional floor"
```

---

### Task 5: Gametools API client

**Files:**
- Create: `lib/gametools.ts`
- Test: `lib/gametools.test.ts`

**Interfaces:**
- Consumes: `RawResponse`, `RawPlayerIds` from `lib/types.ts`; `readPlayerIds` from `lib/extract.ts`
- Produces:
  - `API_BASE`, `BATCH_SIZE = 128`
  - `fetchCurrentSeason(deps?): Promise<string>`
  - `resolvePlayer(eaId: string, deps?): Promise<RawPlayerIds | null>`
  - `fetchBulk(players: BulkPlayer[], deps?): Promise<RawResponse[]>`
  - `type BulkPlayer = { player_id: string; user_id: string; platform: string }`
  - `type Deps = { fetchImpl?: typeof fetch; retries?: number; sleep?: (ms: number) => Promise<void> }`

All network functions take an injectable `fetchImpl` so tests never hit the network.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/gametools.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchCurrentSeason, resolvePlayer, fetchBulk, chunk, BATCH_SIZE, API_BASE } from './gametools';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const noSleep = () => Promise.resolve();

describe('constants', () => {
  it('targets the gametools API', () => {
    expect(API_BASE).toBe('https://api.gametools.network');
  });
  it('batches at the documented maximum', () => {
    expect(BATCH_SIZE).toBe(128);
  });
});

describe('chunk', () => {
  it('splits into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns nothing for an empty list', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('fetchCurrentSeason', () => {
  it('returns the active season name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ events: [
        { name: 'Season3', active: false },
        { name: 'Season4', active: true },
        { name: 'BP04', active: true },
      ] }),
    );
    await expect(fetchCurrentSeason({ fetchImpl, sleep: noSleep })).resolves.toBe('Season4');
  });

  it('ignores active non-season events', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ events: [{ name: 'BP04', active: true }, { name: 'Season2', active: true }] }),
    );
    await expect(fetchCurrentSeason({ fetchImpl, sleep: noSleep })).resolves.toBe('Season2');
  });

  it('throws when no active season exists', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ events: [] }));
    await expect(fetchCurrentSeason({ fetchImpl, sleep: noSleep })).rejects.toThrow(/active season/i);
  });
});

describe('resolvePlayer', () => {
  it('returns ids for a known player', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ playerStats: [{ player: { nucleusId: '1', personaId: '2', platformId: 1 }, categories: [] }] }),
    );
    await expect(resolvePlayer('pkidarkpki', { fetchImpl, sleep: noSleep })).resolves.toEqual({
      nucleusId: '1', personaId: '2', platformId: 1,
    });
  });

  it('returns null on 404 without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ errors: ['Player not found'] }, 404));
    await expect(resolvePlayer('ghost', { fetchImpl, sleep: noSleep })).resolves.toBeNull();
  });

  it('does not retry a 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 404));
    await resolvePlayer('ghost', { fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('requests raw data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    await resolvePlayer('someone', { fetchImpl, sleep: noSleep });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('raw=true');
  });

  it('retries a 500 then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({ playerStats: [{ player: { nucleusId: '9', personaId: '8', platformId: 1 }, categories: [] }] }));
    await expect(resolvePlayer('flaky', { fetchImpl, sleep: noSleep })).resolves.toEqual({
      nucleusId: '9', personaId: '8', platformId: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 500));
    await expect(resolvePlayer('down', { fetchImpl, retries: 2, sleep: noSleep })).rejects.toThrow(/500/);
  });
});

describe('fetchBulk', () => {
  const player = { player_id: '2', user_id: '1', platform: 'pc' };

  it('posts a JSON array body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    await fetchBulk([player], { fetchImpl, sleep: noSleep });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual([player]);
  });

  it('splits into batches of 128', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    const many = Array.from({ length: 300 }, () => player);
    await fetchBulk(many, { fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('returns one response per batch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ playerStats: [] }));
    const results = await fetchBulk([player, player], { fetchImpl, sleep: noSleep });
    expect(results).toHaveLength(1);
  });

  it('makes no request for an empty list', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchBulk([], { fetchImpl, sleep: noSleep })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/gametools.test.ts`
Expected: FAIL — cannot resolve `./gametools`.

- [ ] **Step 3: Implement `lib/gametools.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/gametools.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/gametools.ts lib/gametools.test.ts
git commit -m "feat: add gametools API client with batching and retry"
```

---

### Task 6: Roster seeding from Discord introductions

**Files:**
- Create: `scripts/parse-intros.ts`, `lib/parse-intros.ts`
- Test: `lib/parse-intros.test.ts`

**Interfaces:**
- Consumes: `RosterEntry`, `MainMode` from `lib/types.ts`
- Produces: `parseIntros(text: string): { entries: RosterEntry[]; failures: string[] }`

The real channel text is inconsistent — `PS` / `PC` / `pc`, and Main Mode appears as `Both`, `BOTH`, `(Gauntlet/REDSEC)`, and freeform like `(Gauntlet, low xp but decent at BR)`. The parser normalises what it can and reports the rest for manual fixing. Posts are separated by blank lines.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/parse-intros.test.ts
import { describe, it, expect } from 'vitest';
import { parseIntros } from './parse-intros';

// Verbatim shapes from the community's #introductions channel.
const sample = `
Preferred name: Kathem
EA ID: kathemkh9
Platform: PS
Region: NA West
Main Mode: (Gauntlet/REDSEC)
Microphone: Yes

Preferred name: Dark
EA ID: pkidarkpki
Platform: PC
Region: US East
Main mode (Gauntlet / REDSEC / Both): Both
Microphone (Yes / No): Yes

Preferred name: herky
EA ID: IHerkyI
Platform: pc
Region: Central
Main mode (Gauntlet, low xp but decent at BR):
Microphone (Yes / No): duhhh

Preferred name: Noxious
EA ID: CHASEXRYAN
Platform: PC
Region: NA West
Main mode (Gauntlet / REDSEC / Both): BOTH
Microphone (Yes / No): YES
`;

describe('parseIntros', () => {
  it('parses every well-formed post', () => {
    expect(parseIntros(sample).entries).toHaveLength(4);
  });

  it('extracts EA IDs verbatim, preserving case', () => {
    expect(parseIntros(sample).entries.map((e) => e.eaId)).toEqual([
      'kathemkh9', 'pkidarkpki', 'IHerkyI', 'CHASEXRYAN',
    ]);
  });

  it('keeps the preferred name as the display name', () => {
    expect(parseIntros(sample).entries[0].displayName).toBe('Kathem');
  });

  it('normalises platform casing', () => {
    expect(parseIntros(sample).entries.map((e) => e.platform)).toEqual(['ps', 'pc', 'pc', 'pc']);
  });

  it('normalises main mode regardless of label wording or case', () => {
    expect(parseIntros(sample).entries.map((e) => e.mainMode)).toEqual([
      'both', 'both', 'gauntlet', 'both',
    ]);
  });

  it('preserves region text', () => {
    expect(parseIntros(sample).entries[1].region).toBe('US East');
  });

  it('reports posts with no EA ID as failures', () => {
    const result = parseIntros('Preferred name: Ghost\nPlatform: PC');
    expect(result.entries).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('Ghost');
  });

  it('defaults unknown main mode to unknown', () => {
    const result = parseIntros('Preferred name: A\nEA ID: aaa\nPlatform: PC');
    expect(result.entries[0].mainMode).toBe('unknown');
  });

  it('falls back to the EA ID when no preferred name is given', () => {
    expect(parseIntros('EA ID: solo').entries[0].displayName).toBe('solo');
  });

  it('does not emit resolution ids', () => {
    const entry = parseIntros(sample).entries[0];
    expect(entry.personaId).toBeUndefined();
    expect(entry.nucleusId).toBeUndefined();
  });

  it('handles empty input', () => {
    expect(parseIntros('')).toEqual({ entries: [], failures: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/parse-intros.test.ts`
Expected: FAIL — cannot resolve `./parse-intros`.

- [ ] **Step 3: Implement `lib/parse-intros.ts`**

```ts
import type { MainMode, RosterEntry } from './types';

/** Match "Label ...anything...: value", tolerating the parenthesised variants. */
const field = (labelPattern: string, block: string): string | null => {
  const re = new RegExp(`^\\s*${labelPattern}[^:\\n]*:\\s*(.*)$`, 'im');
  const m = block.match(re);
  const value = m?.[1]?.trim();
  return value ? value : null;
};

const normaliseMode = (raw: string | null): MainMode => {
  if (!raw) return 'unknown';
  const t = raw.toLowerCase();
  const hasGauntlet = t.includes('gauntlet');
  const hasRedsec = t.includes('redsec') || t.includes('br');
  if (t.includes('both')) return 'both';
  if (hasGauntlet && hasRedsec) return 'both';
  if (hasGauntlet) return 'gauntlet';
  if (hasRedsec) return 'redsec';
  return 'unknown';
};

/**
 * Parse the community's #introductions channel into roster entries.
 *
 * One-off seeding tool, not part of the daily build. Posts are separated by
 * blank lines. Anything unparseable is reported rather than silently dropped.
 */
export function parseIntros(text: string): { entries: RosterEntry[]; failures: string[] } {
  const entries: RosterEntry[] = [];
  const failures: string[] = [];

  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const eaId = field('EA\\s*ID', block);
    if (!eaId) {
      failures.push(block.replace(/\s+/g, ' ').slice(0, 120));
      continue;
    }

    // "Main Mode:" and "Main mode (Gauntlet / REDSEC / Both):" both appear.
    const modeRaw = field('Main\\s*Mode', block);

    entries.push({
      eaId,
      displayName: field('Preferred\\s*name', block) ?? eaId,
      platform: (field('Platform', block) ?? '').toLowerCase() || 'unknown',
      region: field('Region', block) ?? 'unknown',
      // The label itself can carry the answer, e.g. "(Gauntlet, low xp...)".
      mainMode: normaliseMode(modeRaw ?? block.match(/^\s*Main\s*Mode[^\n]*/im)?.[0] ?? null),
    });
  }

  return { entries, failures };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/parse-intros.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Create the CLI wrapper `scripts/parse-intros.ts`**

```ts
#!/usr/bin/env tsx
/**
 * Seed roster.json from a dump of the Discord #introductions channel.
 *
 *   npm run roster:parse -- intros.txt
 *
 * Writes roster.json and prints anything it could not parse. Run once; after
 * that roster.json is the source of truth, edited by commit.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseIntros } from '../lib/parse-intros';

const input = process.argv[2];
if (!input) {
  console.error('usage: npm run roster:parse -- <intros.txt>');
  process.exit(1);
}

const { entries, failures } = parseIntros(readFileSync(input, 'utf8'));

if (existsSync('roster.json')) {
  console.error('roster.json already exists — refusing to overwrite it.');
  process.exit(1);
}

writeFileSync('roster.json', JSON.stringify(entries, null, 2) + '\n');
console.log(`Wrote roster.json with ${entries.length} members.`);

if (failures.length) {
  console.warn(`\n${failures.length} post(s) could not be parsed — add these by hand:`);
  for (const f of failures) console.warn(`  - ${f}`);
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/parse-intros.ts lib/parse-intros.test.ts scripts/parse-intros.ts
git commit -m "feat: seed roster from Discord introductions"
```

---

### Task 7: Daily build pipeline

**Files:**
- Create: `lib/pipeline.ts`, `scripts/build.ts`, `roster.json`
- Test: `lib/pipeline.test.ts`

**Interfaces:**
- Consumes: `extractSlices`, `computeMetrics`, `rankPlayers`, `fetchBulk`, `resolvePlayer`, `fetchCurrentSeason`
- Produces: `buildBoard(roster, rawResponses, currentSeason): BoardFile` — pure, no I/O, so it is fully unit-testable. `scripts/build.ts` supplies the I/O.

`buildBoard` is deliberately pure: the network and filesystem live only in `scripts/build.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { buildBoard, toBulkPlayer } from './pipeline';
import { rawSample } from './fixtures/raw-sample';
import type { RosterEntry } from './types';

const dark: RosterEntry = {
  eaId: 'pkidarkpki', displayName: 'Dark', platform: 'pc', region: 'US East',
  mainMode: 'both', personaId: '849687045', nucleusId: '2250375376',
};

describe('toBulkPlayer', () => {
  it('maps personaId to player_id and nucleusId to user_id', () => {
    expect(toBulkPlayer(dark)).toEqual({
      player_id: '849687045', user_id: '2250375376', platform: 'pc',
    });
  });

  it('returns null when ids are missing', () => {
    expect(toBulkPlayer({ ...dark, personaId: undefined })).toBeNull();
  });
});

describe('buildBoard', () => {
  it('produces a row per season the player has Gauntlet data for', () => {
    const board = buildBoard([dark], [rawSample], 'Season4');
    expect(Object.keys(board.seasons).sort()).toEqual(['Season3', 'Season4']);
  });

  it('carries roster identity onto the row', () => {
    const board = buildBoard([dark], [rawSample], 'Season4');
    const row = board.seasons.Season4[0];
    expect(row.displayName).toBe('Dark');
    expect(row.region).toBe('US East');
    expect(row.eaId).toBe('pkidarkpki');
  });

  it('computes metrics for the season row', () => {
    const row = buildBoard([dark], [rawSample], 'Season4').seasons.Season4[0];
    expect(row.matches).toBe(50);
    expect(row.winPct).toBeCloseTo(58.0, 4);
    expect(row.jetPct).toBeCloseTo(14.7927164244, 6);
  });

  it('puts under-floor players in provisional', () => {
    // Season3 in the fixture has 34 matches -> ranked; force a small one.
    const board = buildBoard([dark], [rawSample], 'Season4');
    expect(board.seasons.Season4[0].rank).toBe(1);
    expect(board.provisional.Season4).toEqual([]);
  });

  it('records meta with the current season', () => {
    const board = buildBoard([dark], [rawSample], 'Season4');
    expect(board.meta.currentSeason).toBe('Season4');
    expect(board.meta.seasons).toContain('Season4');
    expect(typeof board.meta.builtAt).toBe('string');
  });

  it('lists roster members with no ids as unresolved', () => {
    const ghost: RosterEntry = {
      eaId: 'kathemkh9', displayName: 'Kathem', platform: 'ps',
      region: 'NA West', mainMode: 'both',
    };
    const board = buildBoard([ghost], [rawSample], 'Season4');
    expect(board.unresolved).toEqual([
      { eaId: 'kathemkh9', displayName: 'Kathem', reason: 'not_found' },
    ]);
  });

  it('omits members who resolved but never played Gauntlet', () => {
    const other: RosterEntry = { ...dark, eaId: 'other', personaId: '1', nucleusId: '2' };
    const board = buildBoard([other], [rawSample], 'Season4');
    expect(board.seasons.Season4 ?? []).toEqual([]);
    expect(board.unresolved).toEqual([]);
  });

  it('always includes the current season, even with no data', () => {
    const board = buildBoard([], [], 'Season4');
    expect(board.seasons.Season4).toEqual([]);
    expect(board.provisional.Season4).toEqual([]);
    expect(board.unresolved).toEqual([]);
  });

  it('omits builtAt drift by accepting an injected clock', () => {
    const at = new Date('2026-09-12T00:00:00.000Z');
    expect(buildBoard([], [], 'Season4', at).meta.builtAt).toBe('2026-09-12T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/pipeline.test.ts`
Expected: FAIL — cannot resolve `./pipeline`.

- [ ] **Step 3: Implement `lib/pipeline.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/pipeline.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Create a starter `roster.json`**

Two verified-resolvable members plus two known-unresolvable ones, so the first real run exercises both paths.

```json
[
  {
    "eaId": "pkidarkpki",
    "displayName": "Dark",
    "platform": "pc",
    "region": "US East",
    "mainMode": "both"
  },
  {
    "eaId": "CHASEXRYAN",
    "displayName": "Noxious",
    "platform": "pc",
    "region": "NA West",
    "mainMode": "both"
  },
  {
    "eaId": "kathemkh9",
    "displayName": "Kathem",
    "platform": "ps",
    "region": "NA West",
    "mainMode": "both"
  },
  {
    "eaId": "IHerkyI",
    "displayName": "herky",
    "platform": "pc",
    "region": "Central",
    "mainMode": "gauntlet"
  }
]
```

- [ ] **Step 6: Implement `scripts/build.ts`**

```ts
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
```

- [ ] **Step 7: Verify against the live API**

Run: `npm run data:dry`
Expected: prints the current season, warns `unresolved: kathemkh9` and `unresolved: IHerkyI`, reports ranked/provisional counts for the current season, and writes nothing.

- [ ] **Step 8: Generate real data and commit**

```bash
npm run data
npm test
git add lib/pipeline.ts lib/pipeline.test.ts scripts/build.ts roster.json data/
git commit -m "feat: add daily build pipeline"
```

---

### Task 8: App shell with MUI App Router setup

**Files:**
- Create: `app/layout.tsx`, `app/theme.ts`, `lib/data.ts`
- Test: `lib/data.test.ts`

**Interfaces:**
- Consumes: `data/board.json` (generated in Task 7), `BoardFile` from `lib/types.ts`
- Produces:
  - `getBoard(): BoardFile`
  - `getSeason(season?: string): { season: string; ranked: BoardRow[]; provisional: BoardRow[] } | null`
  - `getMeta()`, `getUnresolved()`

`AppRouterCacheProvider` must wrap the app before any MUI component renders, or SSR hydration mismatches appear. Do this now, not later.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/data.test.ts
import { describe, it, expect } from 'vitest';
import { getBoard, getSeason, getMeta, getUnresolved } from './data';

describe('data accessors', () => {
  it('loads the generated board', () => {
    expect(getBoard().meta.currentSeason).toMatch(/^Season\d+$/);
  });

  it('defaults to the current season', () => {
    expect(getSeason()!.season).toBe(getMeta().currentSeason);
  });

  it('returns null for an unknown season', () => {
    expect(getSeason('Season99')).toBeNull();
  });

  it('exposes meta', () => {
    const meta = getMeta();
    expect(Array.isArray(meta.seasons)).toBe(true);
    expect(typeof meta.builtAt).toBe('string');
  });

  it('exposes unresolved members', () => {
    expect(Array.isArray(getUnresolved())).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/data.test.ts`
Expected: FAIL — cannot resolve `./data`.

- [ ] **Step 3: Implement `lib/data.ts`**

```ts
import boardJson from '../data/board.json';
import type { BoardFile, BoardRow } from './types';

/**
 * Read the board generated by the daily build.
 *
 * Statically imported so Vercel bundles it — API routes must never touch the
 * filesystem or call gametools at request time.
 */
export function getBoard(): BoardFile {
  return boardJson as unknown as BoardFile;
}

export function getMeta() {
  return getBoard().meta;
}

export function getUnresolved() {
  return getBoard().unresolved;
}

export function getSeason(
  season?: string,
): { season: string; ranked: BoardRow[]; provisional: BoardRow[] } | null {
  const board = getBoard();
  const key = season ?? board.meta.currentSeason;
  const ranked = board.seasons[key];
  if (!ranked) return null;
  return { season: key, ranked, provisional: board.provisional[key] ?? [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/data.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Create `app/theme.ts`**

```ts
'use client';
import { createTheme } from '@mui/material/styles';

/** Dark theme — this is a gaming community board, viewed mostly at night. */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0e1116', paper: '#161b22' },
    primary: { main: '#ff6b35' },
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
});
```

- [ ] **Step 6: Create `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './theme';

export const metadata: Metadata = {
  title: 'Gauntlet Tracker',
  description: 'Battlefield 6 Gauntlet leaderboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Must wrap everything: MUI needs its Emotion cache for App Router SSR. */}
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/data.ts lib/data.test.ts app/layout.tsx app/theme.ts
git commit -m "feat: add app shell with MUI App Router cache provider"
```

---

### Task 9: API routes

**Files:**
- Create: `app/api/leaderboard/route.ts`, `app/api/meta/route.ts`, `app/api/unresolved/route.ts`
- Test: `app/api/routes.test.ts`

**Interfaces:**
- Consumes: `getSeason`, `getMeta`, `getUnresolved` from `lib/data.ts`
- Produces: three `GET` handlers, each `(req: Request) => Response`

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/routes.test.ts
import { describe, it, expect } from 'vitest';
import { GET as leaderboard } from './leaderboard/route';
import { GET as meta } from './meta/route';
import { GET as unresolved } from './unresolved/route';
import { getMeta } from '@/lib/data';

describe('GET /api/leaderboard', () => {
  it('defaults to the current season', async () => {
    const res = await leaderboard(new Request('http://x/api/leaderboard'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.season).toBe(getMeta().currentSeason);
    expect(Array.isArray(body.ranked)).toBe(true);
    expect(Array.isArray(body.provisional)).toBe(true);
  });

  it('accepts an explicit season', async () => {
    const current = getMeta().currentSeason;
    const res = await leaderboard(new Request(`http://x/api/leaderboard?season=${current}`));
    expect((await res.json()).season).toBe(current);
  });

  it('404s an unknown season instead of returning an empty board', async () => {
    const res = await leaderboard(new Request('http://x/api/leaderboard?season=Season99'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });
});

describe('GET /api/meta', () => {
  it('returns season metadata', async () => {
    const body = await (await meta()).json();
    expect(body.currentSeason).toMatch(/^Season\d+$/);
    expect(Array.isArray(body.seasons)).toBe(true);
  });
});

describe('GET /api/unresolved', () => {
  it('returns a list', async () => {
    expect(Array.isArray(await (await unresolved()).json())).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/routes.test.ts`
Expected: FAIL — cannot resolve `./leaderboard/route`.

- [ ] **Step 3: Implement the three routes**

```ts
// app/api/leaderboard/route.ts
import { getSeason } from '@/lib/data';

export function GET(req: Request): Response {
  const season = new URL(req.url).searchParams.get('season') ?? undefined;
  const result = getSeason(season);

  if (!result) {
    return Response.json({ error: `Unknown season: ${season}` }, { status: 404 });
  }
  return Response.json(result);
}
```

```ts
// app/api/meta/route.ts
import { getMeta } from '@/lib/data';

export function GET(): Response {
  return Response.json(getMeta());
}
```

```ts
// app/api/unresolved/route.ts
import { getUnresolved } from '@/lib/data';

export function GET(): Response {
  return Response.json(getUnresolved());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/routes.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/
git commit -m "feat: add read-only leaderboard API routes"
```

---

### Task 10: Leaderboard table

**Files:**
- Create: `components/LeaderboardTable.tsx`
- Test: `components/LeaderboardTable.test.tsx`

**Interfaces:**
- Consumes: `BoardRow` from `lib/types.ts`, `JET_BADGE_THRESHOLD` from `lib/metrics.ts`
- Produces: `<LeaderboardTable rows={BoardRow[]} provisional?: boolean />`
- Also produces the formatters later tasks reuse: `fmtPct`, `fmtNum`, `fmtHours`

- [ ] **Step 1: Write the failing tests**

```tsx
// components/LeaderboardTable.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeaderboardTable, fmtPct, fmtNum, fmtHours } from './LeaderboardTable';
import type { BoardRow } from '@/lib/types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA', mainMode: 'gauntlet',
  matches: 20, wins: 10, losses: 10, kills: 100, deaths: 50, damage: 1000,
  assists: 0, revives: 0, timeSec: 3600,
  winPct: 50, kd: 2, kpm: 1, dpm: 10, jetPct: 0, rank: 1,
  ...over,
});

describe('formatters', () => {
  it('formats percentages to one decimal', () => {
    expect(fmtPct(77.7777)).toBe('77.8%');
  });
  it('renders an em dash for null', () => {
    expect(fmtPct(null)).toBe('—');
    expect(fmtNum(null, 2)).toBe('—');
  });
  it('formats hours', () => {
    expect(fmtHours(3600)).toBe('1.0h');
  });
});

describe('LeaderboardTable', () => {
  it('renders a row per player', () => {
    render(<LeaderboardTable rows={[row({ displayName: 'Dark' }), row({ displayName: 'Noxious', rank: 2 })]} />);
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('Noxious')).toBeInTheDocument();
  });

  it('shows the jet badge at or above the threshold', () => {
    render(<LeaderboardTable rows={[row({ displayName: 'Jetty', jetPct: 14.8 })]} />);
    expect(screen.getByLabelText(/jet/i)).toBeInTheDocument();
  });

  it('hides the jet badge below the threshold', () => {
    render(<LeaderboardTable rows={[row({ displayName: 'Grunt', jetPct: 9.9 })]} />);
    expect(screen.queryByLabelText(/jet/i)).not.toBeInTheDocument();
  });

  it('renders an em dash for null rate stats', () => {
    render(<LeaderboardTable rows={[row({ displayName: 'Empty', kd: null, kpm: null })]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows a rank in ranked mode', () => {
    render(<LeaderboardTable rows={[row({ rank: 3 })]} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an em dash for rank in provisional mode', () => {
    render(<LeaderboardTable rows={[row({ rank: null })]} provisional />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders an empty-state message with no rows', () => {
    render(<LeaderboardTable rows={[]} />);
    expect(screen.getByText(/no players/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/LeaderboardTable.test.tsx`
Expected: FAIL — cannot resolve `./LeaderboardTable`.

- [ ] **Step 3: Implement `components/LeaderboardTable.tsx`**

```tsx
'use client';

import * as React from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { BoardRow } from '@/lib/types';
import { JET_BADGE_THRESHOLD } from '@/lib/metrics';

const DASH = '—';

export const fmtPct = (v: number | null): string => (v === null ? DASH : `${v.toFixed(1)}%`);
export const fmtNum = (v: number | null, digits = 2): string => (v === null ? DASH : v.toFixed(digits));
export const fmtHours = (sec: number): string => `${(sec / 3600).toFixed(1)}h`;

export function LeaderboardTable({
  rows,
  provisional = false,
}: {
  rows: BoardRow[];
  provisional?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Typography sx={{ py: 4, opacity: 0.7 }}>
        No players to show for this season yet.
      </Typography>
    );
  }

  const columns: GridColDef<BoardRow>[] = [
    {
      field: 'rank',
      headerName: '#',
      width: 64,
      renderCell: (p) => (p.row.rank === null ? DASH : p.row.rank),
    },
    {
      field: 'displayName',
      headerName: 'Player',
      flex: 1,
      minWidth: 140,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <span>{p.row.displayName}</span>
          {p.row.jetPct >= JET_BADGE_THRESHOLD && (
            <Tooltip title={`${p.row.jetPct.toFixed(1)}% of Gauntlet time flown in jets`}>
              <Chip label="✈" size="small" aria-label="jet-heavy player" />
            </Tooltip>
          )}
        </Box>
      ),
    },
    { field: 'matches', headerName: 'M', width: 70 },
    {
      field: 'record',
      headerName: 'W–L',
      width: 90,
      valueGetter: (_v, r) => `${r.wins}–${r.losses}`,
    },
    { field: 'winPct', headerName: 'Win %', width: 90, renderCell: (p) => fmtPct(p.row.winPct) },
    { field: 'kd', headerName: 'K/D', width: 80, renderCell: (p) => fmtNum(p.row.kd) },
    { field: 'kpm', headerName: 'KPM', width: 80, renderCell: (p) => fmtNum(p.row.kpm) },
    { field: 'dpm', headerName: 'DPM', width: 90, renderCell: (p) => fmtNum(p.row.dpm, 0) },
    { field: 'revives', headerName: 'Revives', width: 90 },
    { field: 'timeSec', headerName: 'Time', width: 90, renderCell: (p) => fmtHours(p.row.timeSec) },
  ];

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      getRowId={(r) => r.eaId}
      disableRowSelectionOnClick
      density="compact"
      hideFooter={rows.length <= 100}
      // Win % descending is the agreed default ordering.
      initialState={{ sorting: { sortModel: [{ field: 'winPct', sort: 'desc' }] } }}
      sx={{
        opacity: provisional ? 0.75 : 1,
        border: 0,
        // Keep the board usable at ~400px: drop secondary columns on phones.
        '@media (max-width: 600px)': {
          '& [data-field="dpm"], & [data-field="revives"], & [data-field="timeSec"], & [data-field="kpm"]':
            { display: 'none' },
        },
      }}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/LeaderboardTable.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add components/LeaderboardTable.tsx components/LeaderboardTable.test.tsx
git commit -m "feat: add leaderboard table with jet badge"
```

---

### Task 11: Filters

**Files:**
- Create: `components/FilterChips.tsx`
- Test: `components/FilterChips.test.tsx`

**Interfaces:**
- Consumes: `BoardRow` from `lib/types.ts`
- Produces:
  - `filterRows(rows, f: ActiveFilters): BoardRow[]`
  - `<FilterChips rows value onChange />`
  - `type ActiveFilters = { region: string | null; platform: string | null; mainMode: string | null }`
  - `EMPTY_FILTERS: ActiveFilters`

- [ ] **Step 1: Write the failing tests**

```tsx
// components/FilterChips.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChips, filterRows, EMPTY_FILTERS } from './FilterChips';
import type { BoardRow } from '@/lib/types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA West', mainMode: 'gauntlet',
  matches: 20, wins: 10, losses: 10, kills: 100, deaths: 50, damage: 1000,
  assists: 0, revives: 0, timeSec: 3600,
  winPct: 50, kd: 2, kpm: 1, dpm: 10, jetPct: 0, rank: 1,
  ...over,
});

const rows = [
  row({ eaId: 'a', region: 'NA West', platform: 'pc', mainMode: 'gauntlet' }),
  row({ eaId: 'b', region: 'US East', platform: 'ps', mainMode: 'both' }),
];

describe('filterRows', () => {
  it('returns everything with no filters', () => {
    expect(filterRows(rows, EMPTY_FILTERS)).toHaveLength(2);
  });
  it('filters by region', () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, region: 'US East' }).map((r) => r.eaId)).toEqual(['b']);
  });
  it('filters by platform', () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, platform: 'pc' }).map((r) => r.eaId)).toEqual(['a']);
  });
  it('filters by main mode', () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, mainMode: 'both' }).map((r) => r.eaId)).toEqual(['b']);
  });
  it('combines filters', () => {
    expect(filterRows(rows, { region: 'NA West', platform: 'ps', mainMode: null })).toHaveLength(0);
  });
});

describe('FilterChips', () => {
  it('renders a chip per distinct value', () => {
    render(<FilterChips rows={rows} value={EMPTY_FILTERS} onChange={() => {}} />);
    expect(screen.getByText('NA West')).toBeInTheDocument();
    expect(screen.getByText('US East')).toBeInTheDocument();
  });

  it('reports a selection', async () => {
    const onChange = vi.fn();
    render(<FilterChips rows={rows} value={EMPTY_FILTERS} onChange={onChange} />);
    await userEvent.click(screen.getByText('US East'));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, region: 'US East' });
  });

  it('toggles an active filter off', async () => {
    const onChange = vi.fn();
    render(<FilterChips rows={rows} value={{ ...EMPTY_FILTERS, region: 'US East' }} onChange={onChange} />);
    await userEvent.click(screen.getByText('US East'));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/FilterChips.test.tsx`
Expected: FAIL — cannot resolve `./FilterChips`.

- [ ] **Step 3: Implement `components/FilterChips.tsx`**

```tsx
'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { BoardRow } from '@/lib/types';

export type ActiveFilters = {
  region: string | null;
  platform: string | null;
  mainMode: string | null;
};

export const EMPTY_FILTERS: ActiveFilters = { region: null, platform: null, mainMode: null };

export function filterRows(rows: BoardRow[], f: ActiveFilters): BoardRow[] {
  return rows.filter(
    (r) =>
      (f.region === null || r.region === f.region) &&
      (f.platform === null || r.platform === f.platform) &&
      (f.mainMode === null || r.mainMode === f.mainMode),
  );
}

const distinct = (rows: BoardRow[], key: keyof ActiveFilters): string[] =>
  [...new Set(rows.map((r) => String(r[key as keyof BoardRow])))].sort();

export function FilterChips({
  rows,
  value,
  onChange,
}: {
  rows: BoardRow[];
  value: ActiveFilters;
  onChange: (next: ActiveFilters) => void;
}) {
  const groups: { key: keyof ActiveFilters; label: string }[] = [
    { key: 'region', label: 'Region' },
    { key: 'platform', label: 'Platform' },
    { key: 'mainMode', label: 'Main mode' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
      {groups.map(({ key, label }) => (
        <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ minWidth: 80, opacity: 0.7 }}>
            {label}
          </Typography>
          {distinct(rows, key).map((option) => (
            <Chip
              key={option}
              label={option}
              size="small"
              color={value[key] === option ? 'primary' : 'default'}
              variant={value[key] === option ? 'filled' : 'outlined'}
              // Clicking the active chip clears that filter.
              onClick={() => onChange({ ...value, [key]: value[key] === option ? null : option })}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/FilterChips.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add components/FilterChips.tsx components/FilterChips.test.tsx
git commit -m "feat: add region, platform and main-mode filters"
```

---

### Task 12: Board page with season tabs

**Files:**
- Create: `app/page.tsx`, `components/BoardView.tsx`
- Test: `components/BoardView.test.tsx`

**Interfaces:**
- Consumes: `LeaderboardTable`, `FilterChips`, `filterRows`, `EMPTY_FILTERS`, `BoardFile`
- Produces: `<BoardView board={BoardFile} />` (client) and the server page that feeds it

- [ ] **Step 1: Write the failing tests**

```tsx
// components/BoardView.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardView } from './BoardView';
import type { BoardFile, BoardRow } from '@/lib/types';

const row = (over: Partial<BoardRow>): BoardRow => ({
  eaId: 'x', displayName: 'X', platform: 'pc', region: 'NA West', mainMode: 'gauntlet',
  matches: 20, wins: 10, losses: 10, kills: 100, deaths: 50, damage: 1000,
  assists: 0, revives: 0, timeSec: 3600,
  winPct: 50, kd: 2, kpm: 1, dpm: 10, jetPct: 0, rank: 1,
  ...over,
});

const board: BoardFile = {
  meta: { currentSeason: 'Season4', seasons: ['Season3', 'Season4'], builtAt: '2026-09-12T00:00:00.000Z' },
  seasons: {
    Season4: [row({ eaId: 'now', displayName: 'Current' })],
    Season3: [row({ eaId: 'old', displayName: 'Archived' })],
  },
  provisional: { Season4: [row({ eaId: 'rk', displayName: 'Rookie', matches: 3, rank: null })], Season3: [] },
  unresolved: [],
};

describe('BoardView', () => {
  it('opens on the current season', () => {
    render(<BoardView board={board} />);
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('renders a tab per season', () => {
    render(<BoardView board={board} />);
    expect(screen.getByRole('tab', { name: /Season4/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Season3/ })).toBeInTheDocument();
  });

  it('switches seasons', async () => {
    render(<BoardView board={board} />);
    await userEvent.click(screen.getByRole('tab', { name: /Season3/ }));
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('shows the provisional section', () => {
    render(<BoardView board={board} />);
    expect(screen.getByText(/provisional/i)).toBeInTheDocument();
    expect(screen.getByText('Rookie')).toBeInTheDocument();
  });

  it('links to the not-listed page', () => {
    render(<BoardView board={board} />);
    expect(screen.getByRole('link', { name: /not listed/i })).toHaveAttribute('href', '/not-listed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/BoardView.test.tsx`
Expected: FAIL — cannot resolve `./BoardView`.

- [ ] **Step 3: Implement `components/BoardView.tsx`**

```tsx
'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { LeaderboardTable } from './LeaderboardTable';
import { FilterChips, filterRows, EMPTY_FILTERS, type ActiveFilters } from './FilterChips';
import { MIN_MATCHES } from '@/lib/ranking';
import type { BoardFile } from '@/lib/types';

export function BoardView({ board }: { board: BoardFile }) {
  const [season, setSeason] = React.useState(board.meta.currentSeason);
  const [filters, setFilters] = React.useState<ActiveFilters>(EMPTY_FILTERS);

  const ranked = board.seasons[season] ?? [];
  const provisional = board.provisional[season] ?? [];

  const visibleRanked = filterRows(ranked, filters);
  const visibleProvisional = filterRows(provisional, filters);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Gauntlet Tracker
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>
        Battlefield 6 Gauntlet standings · updated{' '}
        {new Date(board.meta.builtAt).toLocaleDateString()}
      </Typography>

      <Tabs
        value={season}
        onChange={(_e, v: string) => setSeason(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2 }}
      >
        {board.meta.seasons.map((s) => (
          <Tab
            key={s}
            value={s}
            label={s === board.meta.currentSeason ? `${s} (current)` : s}
          />
        ))}
      </Tabs>

      <FilterChips rows={ranked.concat(provisional)} value={filters} onChange={setFilters} />

      <LeaderboardTable rows={visibleRanked} />

      {visibleProvisional.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" component="h2">
            Provisional
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.7, mb: 1 }}>
            Fewer than {MIN_MATCHES} matches this season — not yet ranked.
          </Typography>
          <LeaderboardTable rows={visibleProvisional} provisional />
        </Box>
      )}

      <Box sx={{ mt: 4 }}>
        <Link href="/not-listed">Not listed? Here&apos;s why →</Link>
      </Box>
    </Container>
  );
}
```

- [ ] **Step 4: Implement `app/page.tsx`**

```tsx
import { getBoard } from '@/lib/data';
import { BoardView } from '@/components/BoardView';

// Data changes once a day, so there is nothing to render per-request.
export const revalidate = 3600;

export default function Page() {
  return <BoardView board={getBoard()} />;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run components/BoardView.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Verify the app renders**

Run: `npm run dev` then open `http://localhost:3000`
Expected: the board lists the resolvable roster members for the current season, with season tabs and filters.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx components/BoardView.tsx components/BoardView.test.tsx
git commit -m "feat: add board page with season tabs and filters"
```

---

### Task 13: "Why am I not listed?" page

**Files:**
- Create: `app/not-listed/page.tsx`, `components/NotListed.tsx`
- Test: `components/NotListed.test.tsx`

**Interfaces:**
- Consumes: `UnresolvedEntry` from `lib/types.ts`, `getUnresolved` from `lib/data.ts`
- Produces: `<NotListed entries={UnresolvedEntry[]} />`

- [ ] **Step 1: Write the failing tests**

```tsx
// components/NotListed.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotListed } from './NotListed';

describe('NotListed', () => {
  const entries = [
    { eaId: 'kathemkh9', displayName: 'Kathem', reason: 'not_found' as const },
    { eaId: 'IHerkyI', displayName: 'herky', reason: 'not_found' as const },
  ];

  it('lists every unresolved member', () => {
    render(<NotListed entries={entries} />);
    expect(screen.getByText(/kathemkh9/)).toBeInTheDocument();
    expect(screen.getByText(/IHerkyI/)).toBeInTheDocument();
  });

  it('explains the privacy fix', () => {
    render(<NotListed entries={entries} />);
    expect(screen.getByText(/Everyone/)).toBeInTheDocument();
  });

  it('links back to the board', () => {
    render(<NotListed entries={entries} />);
    expect(screen.getByRole('link', { name: /board/i })).toHaveAttribute('href', '/');
  });

  it('reports when nobody is missing', () => {
    render(<NotListed entries={[]} />);
    expect(screen.getByText(/everyone on the roster/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/NotListed.test.tsx`
Expected: FAIL — cannot resolve `./NotListed`.

- [ ] **Step 3: Implement `components/NotListed.tsx`**

```tsx
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { UnresolvedEntry } from '@/lib/types';

export function NotListed({ entries }: { entries: UnresolvedEntry[] }) {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Why am I not listed?
      </Typography>

      <Typography sx={{ mb: 2 }}>
        Battlefield 6 only shares your stats if you allow it. If your in-game privacy
        is not set to <strong>Everyone</strong>, nothing can read your Gauntlet stats —
        not this board, not any tracker.
      </Typography>

      <Typography sx={{ mb: 2 }}>
        To fix it: open Battlefield 6 → Settings → Privacy, set your stats visibility
        to <strong>Everyone</strong>, then play a match. DICE can take a while to
        publish the change, so give it a day or two before worrying.
      </Typography>

      <Typography sx={{ mb: 2 }}>
        Also double-check the EA ID you posted in <code>#introductions</code> matches
        your account exactly — it is case-sensitive, and capital <code>I</code> and
        lowercase <code>l</code> are easy to mix up.
      </Typography>

      {entries.length === 0 ? (
        <Typography sx={{ mt: 3 }}>
          Everyone on the roster is currently resolving. Nothing to fix.
        </Typography>
      ) : (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" component="h2">
            Currently unreadable ({entries.length})
          </Typography>
          <List dense>
            {entries.map((e) => (
              <ListItem key={e.eaId} disableGutters>
                <ListItemText primary={e.displayName} secondary={`EA ID: ${e.eaId}`} />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      <Box sx={{ mt: 4 }}>
        <Link href="/">← Back to the board</Link>
      </Box>
    </Container>
  );
}
```

- [ ] **Step 4: Implement `app/not-listed/page.tsx`**

```tsx
import { getUnresolved } from '@/lib/data';
import { NotListed } from '@/components/NotListed';

export const revalidate = 3600;

export default function Page() {
  return <NotListed entries={getUnresolved()} />;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run components/NotListed.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add app/not-listed/ components/NotListed.tsx components/NotListed.test.tsx
git commit -m "feat: add 'why am I not listed' page"
```

---

### Task 14: Daily GitHub Action and README

**Files:**
- Create: `.github/workflows/daily.yml`, `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: `npm run data`, `npm test`
- Produces: a committed daily refresh that triggers Vercel redeploys

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npx tsc --noEmit
      - run: npm run build
```

- [ ] **Step 2: Create `.github/workflows/daily.yml`**

```yaml
name: Daily stats refresh

on:
  schedule:
    # 09:00 UTC daily. gametools caches upstream for 10 minutes, so exact
    # timing does not matter — only that we call it once a day.
    - cron: '0 9 * * *'
  workflow_dispatch:

permissions:
  # Only needs to push the regenerated data. No API keys: gametools is
  # unauthenticated, so this workflow has no secrets.
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - run: npm ci

      - name: Fetch Gauntlet stats
        run: npm run data

      - name: Commit if anything changed
        run: |
          git config user.name "gauntlet-tracker-bot"
          git config user.email "actions@github.com"
          git add data/ roster.json
          if git diff --staged --quiet; then
            echo "No changes today."
            exit 0
          fi
          git commit -m "chore: daily stats refresh $(date -u +%Y-%m-%d)"
          git push
```

- [ ] **Step 3: Create `README.md`**

````markdown
# Gauntlet Tracker

A Battlefield 6 **Gauntlet** leaderboard for our community, ranked by season on
skill-based rate stats.

## How it works

A GitHub Action runs daily, fetches Gauntlet stats for everyone in
`roster.json` from [gametools.network](https://api.gametools.network), and
commits the result to `data/`. That push triggers a Vercel redeploy, and the
Next.js app serves the committed JSON. There is no database and no API call at
page-load time.

## Ranking

Ranked on **Win %** (descending), tie-broken by matches then K/D. You need at
least **10 matches** in a season to be ranked; below that you appear under
*Provisional*.

A ✈ badge means 10%+ of that player's Gauntlet time was flown in jets. Season 4's
"Gauntlet: Fighter Sweep" event shares a stats bucket with normal Gauntlet, so
the badge flags it rather than hiding it.

## Not showing up?

Set your in-game stats privacy to **Everyone**. See `/not-listed`.

## Adding a member

Edit `roster.json` and commit:

```json
{
  "eaId": "theirEaId",
  "displayName": "Their name",
  "platform": "pc",
  "region": "NA West",
  "mainMode": "gauntlet"
}
```

The next daily run resolves their ids and caches them back into the file. To
seed from a Discord dump instead: `npm run roster:parse -- intros.txt`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally |
| `npm test` | Run the test suite |
| `npm run data` | Refresh `data/` from the API |
| `npm run data:dry` | Same, but write nothing |

## A note on the data source

gametools.network is a free, community-run, reverse-engineered API. It is not
affiliated with EA, and EA publishes no public Battlefield stats API. Be a
polite consumer: keep the refresh to once a day. Consider
[sponsoring them](https://github.com/sponsors/community-network).
````

- [ ] **Step 4: Verify the workflows are valid and the suite is green**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass, no type errors, production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add .github/ README.md
git commit -m "ci: add daily refresh and CI workflows"
```

- [ ] **Step 6: Deploy**

Push to GitHub, import the repo at [vercel.com/new](https://vercel.com/new), accept
the detected Next.js defaults, and deploy. Then run the `Daily stats refresh`
workflow once via **Actions → Run workflow** to confirm the commit-and-redeploy
loop works end to end.

---

## Notes for the implementer

- **`lib/` must not import Next.js or `node:fs`.** It is shared by the build
  script, the API routes, and the tests. `lib/data.ts` is the one exception: it
  statically imports the generated JSON, which is how the data reaches Vercel
  without filesystem access.
- **Task 7 must run before Task 8.** `lib/data.ts` imports `data/board.json`,
  which does not exist until the first build. If you need to work out of order,
  commit a `data/board.json` containing
  `{"meta":{"currentSeason":"Season4","seasons":["Season4"],"builtAt":"1970-01-01T00:00:00.000Z"},"seasons":{},"provisional":{},"unresolved":[]}`.
- **Do not hardcode the season.** It comes from `/bf6/gameevents/`. Season 5
  will arrive without warning.
- **Expect roughly half the roster to be unresolvable** at first. That is the
  in-game privacy setting, not a bug in the code.
- **A failed fetch must never publish a broken board.** `scripts/build.ts` exits
  non-zero when the pipeline itself fails, which fails the workflow step before
  the commit step runs — so the previously committed `data/` stays live. Do not
  "fix" this by catching errors around the write.
- **Unresolved members are not failures.** `resolvePlayer` returns `null` on 404
  and the build logs a warning and carries on. Only transport errors and 5xx
  after retries abort the run.
