# Changelog

All notable changes to Run Insights are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Feature codes (`F01`–`F28`) refer to the plan files in [`docs/plans/`](docs/plans/). Ruling codes
(`R-nn`) refer to [`RECONCILIATION_v0.1.0.md`](RECONCILIATION_v0.1.0.md), which supersedes any
individual plan file.

## [Unreleased]

### Changed

- **The session narrative now reads the runner's recent history (F28).** It used to see three
  aggregate scalars over the trailing 28 days and no other run at all, and the 22 Aug 2026
  narrative spent three of its four prose fields on one of them — "on a once-a-week schedule",
  "with only one run per week", "at roughly one run per week". The payload now carries the last
  eight reviewed runs before this one, each with its date, the gap in days, and how hard it was,
  so the model can tell a third consecutive hard effort from the first in a month. The session
  prompt gained the rules that go with it: `runsPerWeek` is an average over a window and not a
  schedule, cite it at most once, and no two parts of the report may lean on the same piece of
  context. Every existing session insight re-narrates once, by design.

## [v0.1.0] - 2026-08-22

The first release. Screenshot an Apple Watch run, a vision model reads it, and you get
coaching-grade analysis of that run, that week, and that month. Feature-complete at **F11**;
sixteen more features landed on top of it, mostly the kind found only by using the thing on a
phone.

90 commits, 601 files, 1,199 unit tests. Live at **[runins.site](https://runins.site)**.

### Added

**Foundation and data (F01–F03)**

- Next.js 16 App Router skeleton on Vercel, with a Zod-validated server-only environment contract
  (`lib/env.ts`) that fails the build rather than a request, a Neon smoke test, a health route, and
  CI.
- Drizzle schema for all 14 tables against Neon Postgres, the migration applied, and every query
  ownership-scoped — with a CI guard on the two invariants so an unscoped query cannot land.
- `lib/id.ts` and `lib/date/ranges.ts`, both dependency-free.
- Auth.js v5 with Google sign-in, the profile, `/onboarding`, and one HRmax resolver rather than a
  formula scattered across call sites.

**Ingest and review — the project (F04–F05)**

- `/upload` takes one to three screenshots, labels each one by which screen it came from, compresses
  client-side, and stores to Vercel Blob. Which screen a number came from is what decides whether
  the model is allowed to have read it at all.
- One vision call to `glm-4.6v` on z.ai's OpenAI-shaped coding endpoint, behind a **token-floor
  guard**: the Anthropic-compatible endpoint accepts image blocks, returns HTTP 200, and silently
  drops the image, so a `prompt_tokens` count below the floor is treated as a dropped image rather
  than a confident answer.
- The review screen at `/r/[id]/review`. **Nothing is saved until you confirm.** Every field stays
  editable, the date is a stated guess when the screenshot carries no year, and corrections are
  persisted alongside the extraction rather than overwriting it.
- Four quantities that must agree by arithmetic, checked on screen, with the banner naming which
  block disagrees.
- The wall between a model's guess and a stored fact (F05): a provenance rule enforced in code, not
  convention.

**Numbers, views and prose (F06–F08)**

- Every metric computed in TypeScript — decoupling, zone share, cadence fade, fast start, splits —
  with recompute-on-change, plus a records shelf that can forget a record when the run behind it
  changes.
- The three screens (`/`, `/r/[id]`, `/trends`), the splits table, the zone bar, and the weekly and
  monthly graphs.
- One dual-axis pace + heart-rate chart, allowed to break the rules, that argues its case
  underneath. Up is faster, everywhere; `*` marks the partial final kilometre.
- Session, week and month insights from `glm-5.3`, with a tool schema that keeps its own contract,
  Zod validation with repair, `facts_hash` caching, and a cron refresh. The coach reads only
  numbers the app handed it.

**Badges, records and sharing (F09–F13, F25–F27)**

- 22 badges evaluated only against numbers a human signed off, and a shelf that prints locked ones
  with their progress instead of a silhouette.
- The badge-art skill (`.claude/skills/generate-badge/`) with its parsed style contract, all 22
  embroidered patches, and `tools/check_badge_art.py` — a checker that refuses to trust its own
  numbers. Art is generated offline and committed; nothing generates images at runtime.
- Ten personal-record patches on their own deck, with derivatives, a manifest and an observed twill
  band.
- An award ledger with one row per earn, so the primary key does the counting; a detail panel for
  every patch; and an earn count that expands to every date it was earned.
- Sharing: one link, no account needed, and a revoke that reaches the images too.

**Polish found on a phone (F14–F24)**

- Mobile keyboards that can actually type a colon, and a mask that can be emptied.
- The screenshot gallery: one overlay, a swipe that comes round, and a tile told its own width.
- The detail panel's open state as a history entry, so the back gesture closes the panel instead of
  leaving the page.
- Reduced-motion escape for the pulse animation.

**Repo and tooling**

- A README a visitor can actually see, and the Playwright harness that photographs it (F19) —
  including the hero GIF, timelapsed 8× over a real 33–38 s read.
- A reaper for Vercel Blob objects nothing points at, plus the skill that knows what "nothing"
  means.
- PWA install and a home-screen icon that is an icon rather than a letter, rebuildable from the
  committed silhouette without another paid image call.
- `research/`: the live feasibility harness and the 108-field fixture, with `score.mjs` running in
  CI.

### Changed

- The v2 design tokens are wired into the app, and R-41..R-46 reconcile that revamp with the
  shipped architecture.
- One z.ai credential now serves both LLM endpoints. `LLM_VISION_API_KEY` was deleted deliberately:
  a second variable holding a duplicate of the first is a credential-rotation bug waiting to happen
  (R-40). Do not reintroduce it.
- The pace/HR axis stops shouting over itself past 20 splits.
- Badge copy says each number once, and the panel says no date at all where a date would be a
  guess.
- Feature plans are numbered by claim rather than by `F<N+1>`, which is not race-safe when plans are
  written in parallel.
- npm is pinned to 12.0.1 in CI so `npm ci` survives the esbuild aix entry.

### Fixed

- The picker that uploaded everything twice, and a purity decision that moved out of the component
  and into `lib/`.
- The upload-kind toggle that disabled itself once all three screens were picked.
- Three splits columns that had no space between them.
- The review sheet that re-focused itself on every keystroke.
- The record panel's fourth line disappearing, and a period badge that did not say it was a period.
- The back-swipe that closed the whole list instead of the panel.
- A badge backfill that let a day become a `Date`, and a count threshold crossed mid-run that the
  award now names.
- Badge art: a twill check measuring the patch rather than the cloth (so it called the cloth pale),
  a check comparing a hexagon's bounding box against a shield's, an anchor demoted to a ruler, and
  an addendum deleted because it made the model ignore the scene.
- Cloth that runs to the edge, and two seams that had no colour.

### Known gaps

- **The twill note and the centring note** live in the records deck's sidecars rather than in
  `style.md`, because F25 §4 measured that the style block cannot be added to. Both need per-patch
  tuning today — three keys use a middle wording, because the strongest wording pushed
  `longest_distance` and `fastest_km_split` under check 3's brightness floor. A future v3 that
  regenerates both decks should absorb them into the block.
- The live vision suite is opt-in and costs money. It last scored **108/108 three runs running**,
  median 38 s — but every run still goes through a human on the review screen before anything is
  stored.
- `npm test` never touches a database and never calls an LLM. Integration and live suites are
  excluded unless `VITEST_INTEGRATION=1` / `LLM_LIVE_TEST=1` are set, so a green `npm test` is not a
  statement about Postgres or about the model.

[v0.1.0]: https://github.com/miftahulmahfuzh/run-insights/releases/tag/v0.1.0
