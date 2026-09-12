# GauntletTracker — Community Gauntlet Leaderboard

**Date:** 2026-09-12
**Status:** Approved design, ready for implementation planning

## Goal

A shareable web leaderboard ranking a ~200–300 person Battlefield 6 community on
**Gauntlet** performance, by season, using skill-based rate stats.

## Data Source

`https://api.gametools.network` — free, unauthenticated, community-run
(Community Network) reverse-engineered proxy over EA/DICE's internal backend.
No API key, no auth, no published rate limits. Responses carry
`cache-control: public, max-age=600`.

EA publishes **no** public Battlefield stats API, and tracker.gg explicitly
forbids scraping. Gametools is the only viable free source.

### Verified facts

Everything below was confirmed against live API responses on 2026-09-12.

- **Gauntlet mode id:** `GraniteGauntlet0` (the formatted API calls it
  `gm_gntgauntlet`).
- **Gauntlet is live** in the current season. Quest definitions on the current
  patch `001.004.002.000` include `GraniteGauntlet0` on 1751 quests, 57 of them
  Gauntlet-exclusive, with squad-elimination mechanics
  (`SQUAD_WIPE_ENEMY_GAUNTLET`, `GAUNTLET_KILL_HVT`, `GAUNTLET_BEACONS`,
  `GAUNTLET_CIRCUIT_CAPTURE_CONSOLES`, `ROUNDS_PLAYED_GAUNTLET`). Community
  members have live Season 4 Gauntlet stats.
- **Stats are season-dimensioned.** `GET /bf6/stats/?name=<eaid>&raw=true`
  returns `playerStats[0].categories[0].catFields[]`, each entry
  `{name, value, fields: [{name, value}]}` where the `fields` are dimensions:
  `GameMode` + `Season`, or `{global, global}` for lifetime totals.
- **Season values:** `Season1`..`Season4`, plus `PLACEHOLDER`. Season 4 is
  current. `/bf6/gameevents/` reports the active season
  (`{"name": "Season4", "active": true}`) — the build must read current season
  from here, never hardcode it.
- **Bulk fetch works with raw data.** `POST /bf6/multiple/?raw=true` accepts up
  to **128 players per call** and returns the same season-dimensioned
  `playerStats` structure. A 2.87 MB JSON body transfers as **148 KB gzipped**.
  ~300 members = **3 calls per refresh**.
- **Bulk request body:** a JSON array of
  `{"player_id": <personaId>, "user_id": <nucleusId>, "platform": "pc"}`.
  Both ids come from `playerStats[0].player` (`personaId`, `nucleusId`) in any
  single-player raw response. Platform is display-only for BF6 — the API treats
  ea/xbox/psn/steam/epic identically for stats.
- **No player discovery.** `/bf6/player/` returns `{"results": []}` for every
  query. There is no global BF6 leaderboard endpoint. A roster is mandatory —
  which suits a known community.
- **Season filtering must be done client-side.** The `filter` parameter only
  honours the `global` scope; `{"scopes":[{"category":"Season","name":"Season1"}]}`
  returns all zeros. Per-season numbers require `raw=true` plus our own
  aggregation.

### Gauntlet stat fields

Within a `GraniteGauntlet0 × SeasonN` slice, mode-scoped fields use a
`_gm_gntgauntlet` suffix:

| Field | Meaning |
|---|---|
| `matches_gm_gntgauntlet` | matches played |
| `wins_gm_gntgauntlet` | wins |
| `losses_gm_gntgauntlet` | losses |
| `deaths_gm_gntgauntlet` | deaths |
| `tp_gm_gntgauntlet` | time played, seconds |
| `Kills_Total` | kills (already slice-scoped) |
| `Dmg_Dealt_Total` | damage |
| `Assist_Total` | assists |
| `Revives_Teammates_Total` | revives |
| `twoplace_gm_gntgauntlet` / `thirdplace_gm_gntgauntlet` | 2nd / 3rd place finishes |
| `winstreak_gauntlet_last` | last win streak |
| `tp_veh_air_jets` | time in jets (used for the jet badge) |

**Vehicle fields nest.** `tp_veh_air_jets` is a parent that already includes
`tp_veh_air_fa18f`, `tp_veh_air_f14tomcat`, `tp_veh_air_su57` (verified:
812 + 6841 + 479 = 8132). Summing parent and children double-counts — use the
parent only.

## Ranking Model

Rate stats, so newer members can compete with grinders.

| Metric | Formula |
|---|---|
| Win % (**default sort**) | `wins / matches × 100` |
| K/D | `Kills_Total / deaths` |
| KPM | `Kills_Total / (tp / 60)` |
| DPM | `Dmg_Dealt_Total / (tp / 60)` |
| Jet % | `tp_veh_air_jets / tp_gm_gntgauntlet × 100` |

Board columns: Rank, Player, Matches, W–L, Win %, K/D, KPM, DPM, Revives, Time.
All sortable. Default sort **Win %** descending — it rewards Gauntlet objective
play over raw fragging.

**Minimum 10 matches** to be ranked. Players below the floor appear in a
separate "Provisional" section below the main board rather than being hidden.

Guard every denominator: a player with `matches > 0` but `tp = 0`, or `deaths = 0`,
must not produce `Infinity` or `NaN`. Use kills as K/D when deaths is 0, and
render rate stats as `—` when time played is 0.

### Jet contamination

Season 4's "Gauntlet: Fighter Sweep" (jets-only limited-time event, Top Gun,
2026-08-18 → 2026-09-15) writes to the **same** `GraniteGauntlet0` bucket as
infantry squad-elimination Gauntlet. Verified by stat signature — the same
player shows 76 nonzero jet/air fields vs 3 infantry fields in Season 4, versus
12 jet vs 53 infantry in Season 1.

The two variants **cannot be separated** at match granularity; they share the
mode id. Rather than fabricate a split, the board is honest about it: players
with **jet % ≥ 10** get a ✈ badge with the percentage on hover. No exclusion,
no silent filtering. Bounded to Season 4.

## Architecture

**Next.js (App Router) + MUI**, deployed on Vercel's free tier. Data is produced
by a daily GitHub Action and committed to the repo; the push triggers a Vercel
redeploy, and Next.js API routes serve the committed JSON.

No database and no runtime writes. The Action — not Vercel Cron — owns the
refresh, because committing each run preserves **git snapshot history**, which
is what makes a rolling-form board possible later at no cost. Vercel's Hobby
tier caps cron at once per day regardless, so moving the schedule there would
buy nothing.

```
roster.json                     # source of truth: community members
scripts/build.mjs               # resolve → fetch → extract → compute → write
scripts/parse-intros.mjs        # one-off: Discord #introductions → roster.json
lib/gametools.mjs               # API client: resolve, bulk fetch, retry
lib/extract.mjs                 # catFields → GraniteGauntlet0 × Season slices
lib/metrics.mjs                 # rate-stat math, denominator guards, jet %
.github/workflows/daily.yml     # cron: runs build, commits output
data/season1..4.json            # generated board data (committed each run)
data/unresolved.json            # members whose stats can't be read
data/meta.json                  # current season id, build timestamp
app/page.tsx                    # the board
app/not-listed/page.tsx         # "Why am I not listed?"
app/api/leaderboard/route.ts    # ?season=4
app/api/unresolved/route.ts
app/api/meta/route.ts
components/                     # MUI board, filters, badges
tests/                          # unit tests + fixtures
```

`lib/` is deliberately shared: the same extraction and metric code runs in the
build script and is importable by API routes and tests. It must stay free of
both Next.js and filesystem imports so it can be unit-tested in isolation.

### Daily build

1. Read `roster.json`.
2. Determine current season from `/bf6/gameevents/` (`active: true`).
3. For members missing cached `personaId`/`nucleusId`, resolve via
   `GET /bf6/stats/?name=<eaid>&raw=true`. A 404 marks the member unresolved.
   Resolved ids are written back into `roster.json` as a cache, so subsequent
   builds skip resolution. These two fields are the **only** part of
   `roster.json` the build may modify; every other field is human-authored and
   must be preserved verbatim.
4. Fetch stats in batches of 128 via `POST /bf6/multiple/?raw=true`.
5. Filter `catFields` to `GameMode == GraniteGauntlet0`, group by `Season`.
6. Compute metrics and write **one file per season present in the data** —
   `data/season1.json` … `data/season4.json` — not just the current season. A
   single raw payload contains every season, so archived boards cost nothing
   extra and are rebuilt each run. Also write `data/unresolved.json` and a
   `data/meta.json` recording the current season id and the build timestamp.
7. Commit the changed files. The push triggers a Vercel redeploy. Committing
   each run yields free snapshot history, which later enables a rolling-form
   board with no redesign.

The Action needs only `contents: write` permission — no secrets, no API keys,
since gametools is unauthenticated. It must exit non-zero only on a genuine
pipeline failure, never because individual members were unresolved.

### API routes

Thin readers over the committed JSON — no gametools calls at request time, so a
page load can never hit the upstream API.

| Route | Returns |
|---|---|
| `GET /api/leaderboard?season=<n>` | ranked rows for that season; defaults to current |
| `GET /api/unresolved` | members whose stats can't be read |
| `GET /api/meta` | current season id, build timestamp, season list |

An unknown or unavailable `season` returns 404 with a JSON error body, not an
empty board.

### Front end

Next.js App Router with MUI. MUI requires the Emotion cache provider setup for
App Router SSR — configure this first, as retrofitting it causes hydration
mismatches.

- **Board** — MUI `DataGrid` for the ranked table. Chosen over a hand-rolled
  table because it handles 300 rows, column sorting, and responsive behaviour
  natively. Default sort Win % descending.
- **Season tabs** — MUI `Tabs`, current season plus archived finished seasons,
  driven by `/api/meta`.
- **Filters** — MUI `Chip` filters for region, platform, and main mode, sourced
  from roster fields.
- **Jet badge** — a ✈ `Chip` on rows with jet % ≥ 10, percentage in a `Tooltip`.
- **Provisional section** — a second `DataGrid` below the main board for
  under-floor players, visually de-emphasised but not hidden.
- **"Why am I not listed?"** — its own page driven by `/api/unresolved`.

Pages use static generation with revalidation; the data only changes once a day,
so nothing needs to render per-request.

**Mobile is a first-class target** — people will open this from Discord on a
phone. The board must stay usable at ~400px: hide secondary columns at narrow
widths rather than forcing a horizontal scroll of the whole page.

## Roster

Seeded by parsing the community's `#introductions` channel, whose posts follow a
loose template:

```
Preferred name: Kathem
EA ID: kathemkh9
Platform: PS
Region: NA West
Main Mode: (Gauntlet/REDSEC)
Microphone: Yes
```

The format varies in practice — `PS` / `PC` / `pc`, and Main Mode appears as
`Both`, `BOTH`, `(Gauntlet/REDSEC)`, and freeform text like
`(Gauntlet, low xp but decent at BR)`. The parser is a **one-off seeding tool**,
not part of the daily build; it normalises what it can and reports anything it
cannot parse for manual fixing. `roster.json` is the source of truth afterwards,
edited by commit.

Roster entry:

```json
{
  "eaId": "pkidarkpki",
  "displayName": "Dark",
  "platform": "pc",
  "region": "US East",
  "mainMode": "both",
  "personaId": "849687045",
  "nucleusId": "2250375376"
}
```

### Unresolved members

A material share of members will not resolve. In a 4-member sample, **2 of 4
returned 404** under every spelling and platform variant
(`kathemkh9`, `IHerkyI`) — the cause is the in-game privacy setting, not typos.

This is expected, not an error. Unresolved members are written to
`data/unresolved.json` and surfaced on a "Why am I not listed?" page explaining
the fix: set in-game stats privacy to **Everyone**, then allow time for DICE to
propagate. This pre-empts the most common support question.

## Error Handling

- **404 on a member** → mark unresolved, continue. Never fail the build.
- **Batch call fails** → retry with backoff; on repeated failure, keep the
  previous `data/<season>.json` rather than publishing a broken board.
- **Member has no Gauntlet slice this season** → omit from the board (they
  simply haven't played it), distinct from unresolved.
- **Zero denominators** → render `—`, never `NaN` or `Infinity`.
- The build is idempotent: re-running produces identical output for identical
  input, so a no-op day produces no commit churn.

## Testing

- **Extractor** — unit tests against saved fixtures of real API payloads,
  asserting the correct `GraniteGauntlet0 × Season` slice is selected, and that
  nested vehicle fields are not double-counted.
- **Metric math** — verified against hand-computed values from real members.
  `CHASEXRYAN` Season 4: 45 matches, 35W–10L, 77.8% win, 2.24 K/D, 0.78 KPM.
  `pkidarkpki` Season 4: 50 matches, 29W–21L, 58.0% win, 2.86 K/D, 1.27 KPM,
  14.8% jet.
- **Denominator guards** — explicit cases for zero deaths, zero time, zero
  matches.
- **Roster parser** — tested against the real intro text, including the known
  malformed variants.
- **API routes** — asserting shape, the `season` default, and that an unknown
  season 404s rather than returning an empty board.
- **Components** — React Testing Library on the board: default sort is Win %,
  the jet badge appears only at ≥10%, and under-floor players render in the
  Provisional section rather than the main board.
- **`--dry-run`** on the build script so a full run can be verified without
  committing.

Runner is **Vitest** for both `lib/` units and components. `lib/` carries no
Next.js or filesystem imports, so it tests without any framework harness.

## Out of Scope

Deliberately excluded to keep the first version small:

- Self-serve signup, accounts, any login
- Rolling-window / last-30-days board (snapshot history accrues from day one,
  so this can be added later without redesign)
- Per-player detail pages, weapon and class breakdowns
- Discord bot
- Non-Gauntlet modes
- Live/on-demand refresh — daily is the agreed cadence

## Risks

- **Gametools is unofficial.** EA can break it without notice. It is
  donation-funded; be a polite consumer — daily cadence, no hammering.
- **Gauntlet is partly event-driven.** Variants rotate and share one mode id.
  The board may need per-season interpretation.
- **Privacy-gated members** limit coverage in a way the project cannot fix.
