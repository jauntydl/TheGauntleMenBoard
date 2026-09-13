# GauntleMen League — Handoff

**Last updated:** 2026-09-13
**Branch:** `main` — 35 commits, pushed to `github.com/jauntydl/TheGauntleMenBoard` (public)
**Remote:** `origin` = `git@github.com-P:jauntydl/TheGauntleMenBoard.git` — uses the **personal**
SSH identity (`~/.ssh/id_personal`) via the `github.com-P` host alias, not the default work key
**State:** 118 tests passing · `tsc --noEmit` clean · `npm run build` succeeds · final whole-branch review clean

Read this first, then `docs/superpowers/specs/2026-09-12-gauntlet-leaderboard-design.md` for the
binding design. The spec carries the API facts; this file carries the *state* and
the decisions that aren't obvious from the code.

---

## What it is

A shareable web leaderboard ranking a ~300 person Battlefield 6 community on
**Gauntlet** performance, by season, on skill-based rate stats.

```
GitHub Action (daily cron)
  → scripts/build.ts: resolve ids → 3 bulk calls → extract → compute → rank
  → commits data/*.json
  → push triggers Vercel redeploy
  → Next.js App Router + MUI renders from the committed JSON
```

No database. No runtime writes. **No upstream API call at request time** — the
data is committed, so a page load can never hit the free community API.

It currently renders real members:

| | Player | M | W–L | Win % | K/D | |
|---|---|---|---|---|---|---|
| #1 | Noxious (`CHASEXRYAN`) | 49 | 39–10 | 79.59% | 2.36 | |
| #2 | Dark (`pkidarkpki`) | 50 | 29–21 | 58.0% | 2.86 | ✈ 14.79% |
| #3 | herky (`IHerkyI`) | 277 | 133–144 | 48.01% | 1.94 | |

---

## Pick up here — next steps in priority order

### 1. Deploy to Vercel
The code is on GitHub; nothing is deployed yet. Import the repo at
[vercel.com/new](https://vercel.com/new) and accept the detected Next.js
defaults — no env vars, no secrets, nothing to configure.

**Check this first:** GitHub → Settings → Actions → General → Workflow
permissions must be **Read and write**. The daily job commits refreshed data
back to the repo; if the token is read-only (the default on some accounts) the
job runs, fetches, and fails at the commit step every day.

The daily workflow is now live on a 09:00 UTC cron, so it will start hitting
the API and committing on its own. `workflow_dispatch` lets you trigger one
manually from the Actions tab to confirm the loop works end to end.

### 2. Seed the real roster
`roster.json` holds **4 members** — a dev roster, not the community. The parser
exists and is tested against the real channel format:

```bash
npm run roster:parse -- intros.txt   # writes roster.json, refuses to overwrite
```

Dump `#introductions` to `intros.txt` first. The parser normalises the messy
variants (`PS`/`PC`/`pc`, `Both`/`BOTH`/`(Gauntlet/REDSEC)`) and prints anything
it couldn't parse for manual fixing. Afterwards `roster.json` is hand-edited by
commit; the build only ever writes back `personaId`/`nucleusId` as a cache.

**Scale is untested.** Nothing has run against 300 members. The batching (128
per call) and pagination (100-row page size) are correct by construction but
unobserved at that size.

### 3. Verify phone width on a real device
The board hides secondary columns under 600px via `columnVisibilityModel`, which
is the correct API (it removes columns from DataGrid's own width computation —
CSS `display:none` does not, and that was a real bug that got fixed). There is a
test proving the columns are removed. But **jsdom lays out no scrollbars**, so
nothing in this repo can prove 400px is scroll-free. Needs 30 seconds on a phone.

### 4. Sanity-check `IHerkyI`
277 Gauntlet matches sits oddly against their "low xp but decent at BR"
self-description. The API confirms the EA ID resolves to an account whose name
matches exactly, so it's probably just modesty — but you'd know.

### 5. Optional follow-ups (deferred, all low-risk)
- No unit test for `validateRoster` in `scripts/build.ts` (small, pure, verified by inspection).
- `lib/data.ts` uses `as unknown as BoardFile`, bypassing structural checks on the generated JSON.
- Per-season `data/season*.json` files are written for git-diff readability but read by nothing.
- `daily.yml` uses a bare `git push` with no retry; a concurrent push loses that day's refresh (rerun manually).
- The 28 commits lack `Co-Authored-By` trailers — deliberate, see Decisions.

---

## Hard-won API facts

Full detail in the spec. The ones that cost real time to discover:

- **Gauntlet is `GraniteGauntlet0`.** Season 4's "Gauntlet: Fighter Sweep"
  (jets-only, ended 2026-09-15) shares the same bucket and cannot be separated
  at match granularity — hence the ✈ badge rather than silent filtering.
- **Bulk responses come back out of request order.** Players must be matched by
  `personaId`, never by index. There is a test that fails under index-matching.
- **Vehicle fields nest** — `tp_veh_air_jets` already contains its per-airframe
  children. Summing double-counts (would turn 14.8% jet share into 27.2%).
- **`Kills_Total` is mode-scoped, not season-wide.** Challenged in final review;
  disproved empirically (13 distinct values across 13 modes in one season).
- **Per-mode counters didn't exist before Season 3.** Seasons 1–2 carry kills
  but no matches/deaths/time, so no rate stat is computable. Those slices are
  omitted — without the rule the board showed "8,299 kills in 0 matches".
- **A member who goes private still returns a valid `player` block with no
  `catFields`.** "A response came back" is not proof of readable data.
- **The `platform` field is inert** — every value returns identical data.
- **Resolution is flaky**, not permanent. Members who 404 one day resolve the
  next once DICE indexes them. Cached ids mean a member resolves only once.

**Be a polite consumer.** gametools.network is free, donation-funded, and
unofficial. Daily cadence only. Consider
[sponsoring them](https://github.com/sponsors/community-network).

---

## Decisions worth not re-litigating

| Decision | Why |
|---|---|
| Rank on **Win %**, not score | Rate stats over volume, so newer members can compete |
| **10-match floor**, Provisional shown not hidden | Stops a 3-match fluke topping the board; hiding people hurts morale |
| ✈ badge instead of excluding jet players | The two Gauntlet variants can't be separated; be honest rather than fabricate a split |
| **No filters at all** (2026-09-13) | Region / platform / main-mode chips were removed at the user's request — the board is Gauntlet-only, so slicing by community metadata added confusion rather than signal (three chip rows made it easy to accidentally hide most of the board). `region`, `platform` and `mainMode` are still parsed into `roster.json` and carried on each row, so re-adding a filter later is cheap. This retired an earlier decision about resetting filters on season switch |
| `getRowId` = `eaId`, not a composite | `eaId` is the roster key; a duplicate should throw loudly, not be papered over |
| GitHub Actions, not Vercel Cron | Committing each run gives free **git snapshot history**, which is what makes a rolling-form board possible later with no redesign. Vercel Hobby caps cron at daily anyway |
| Retry only 5xx + transport errors | 422 is what this API returns for a malformed bulk body — masking it behind retries turns an instant diagnosable failure into a slow confusing one |
| No `Co-Authored-By` trailers | The commit SHAs were the session's compaction-recovery map; rewriting 28 commits to add a trailer would have invalidated all of them |

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally |
| `npm test` | 118 tests |
| `npm run build` | Production build |
| `npm run data` | Refresh `data/` from the API — **makes live network calls** |
| `npm run data:dry` | Same, writes nothing |
| `npm run roster:parse -- intros.txt` | One-off roster seeding |

---

## Architecture notes for whoever picks this up

- **`lib/` is framework-free** — no Next.js, no `node:fs` — so it unit-tests
  without a harness. `lib/data.ts` is the one deliberate exception: it statically
  imports the generated JSON, which is what bundles the data for deployment.
- **`buildBoard` is pure.** Network and filesystem live only in `scripts/build.ts`.
- **The build is idempotent.** It compares everything except `meta.builtAt` and
  leaves `data/` untouched when nothing changed, so a quiet day produces no commit
  and no redeploy. Season keys are naturally sorted (`Season2` before `Season10`)
  because `JSON.stringify` comparison is key-order sensitive.
- **`vitest.setup.ts` polyfills are load-bearing.** MUI X DataGrid virtualises
  rows; jsdom reports every element as 0×0 and has no `ResizeObserver` or
  `matchMedia`. Remove them and every table test fails to find elements.
