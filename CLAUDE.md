# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Run Insights: Apple Watch run screenshots → `glm-4.6v` vision extraction → mandatory human review →
deterministic metrics/records/badges → `glm-5.3` narrative — plus **Nina**, a chat-tab coach who
remembers the runner and messages first. Full product framing: [`README.md`](README.md). Full
current-state architecture (data model, invariants, plan-by-plan history): `docs/architecture.md` —
treat it as authoritative over any single plan under `docs/plans/archive/`.

## Commands

```bash
npm run dev                    # next dev (also re-writes AGENTS.md's nextjs-agent-rules block — expected)
npm run build                  # next build — the real typecheck gate lives in `typecheck`, not this
npm run typecheck              # next typegen && tsc --noEmit — vitest does NOT typecheck; run this before pushing
npm run lint                   # eslint (lint:fix to auto-fix); npm run format / format:check for prettier
npm run knip                   # dead-code/unused-export sweep

npm test                       # vitest run — unit only, fake DB driver, no network, no LLM calls
npm run test:watch
npx vitest run path/to/file.test.ts             # single file
npx vitest run path/to/file.test.ts -t "name"   # single test by name

TEST_DATABASE_URL=<pooled-url> npm run test:int   # VITEST_INTEGRATION=1, real Postgres
npm run test:live                                 # LLM_LIVE_TEST=1, all live suites — costs money
npm run test:live:vision / :narrate / :nina / :nina-vision / :nina-image   # one live suite at a time

npm run db:migrate             # drizzle/ → the ONE Neon database (see Architecture below)
npm run db:generate            # after editing lib/db/schema/*.ts
npm run db:smoke                # is Neon reachable, no schema changes

npm run ci:data-layer-guard    # + ci:f08-guard, ci:openrouter-guard, ci:client-secret-guard,
                                # ci:llm-payload-guard, ci:f11-guard, ci:schema-drift-guard
npm run badges:check           # badge/record art deck parity, hashes, style-block version
npm run icon:assets            # rebuild app icons from the committed silhouette
```

CI, in order: the 7 guards above, `format:check`, `lint`, `typecheck`, `test`, `build`. All seven
guards are source scans (`readRepoCode`), not convention — they fail on the pattern itself, not on
a missing comment.

## Architecture

**One database. `.env.local`'s `DATABASE_URL` is production** — there is no dev/staging instance.
Every `db:migrate`, backfill script, and the README's own capture harness write real data; backfill
scripts default to dry-run for exactly this reason. Same for Vercel env: `ADMIN_EMAILS`, `VAPID_*`,
`AUTH_URL` are Production-scope only, so preview deploys can't serve `/admin` or push notifications.

**The run pipeline** (`docs/architecture.md` §5 has the full diagram):
`/upload` → `POST /api/extract` inserts a `pending` row and returns in <500 ms, then
`after()` runs the actual vision call in the background (`glm-4.6v`, measured 33–38 s; the
token-floor guard checks `usage.prompt_tokens ≥ 500 × imageCount` *before* trusting any field,
because the endpoint silently drops images and hallucinates otherwise) → the client polls
`GET /api/extract/[id]` → **mandatory review** at `/x/[extractionId]` (not `/r/[id]/review` — no
`runs` row exists pre-commit) → `commitExtractedRun` (runs are *born reviewed*; there is no
draft-run state) → `onRunCommitted` fires records recompute, badge evaluation, insight
invalidation, and Nina's `run_committed` trigger.

**"The LLM never computes" is the load-bearing rule**, enforced two ways:
- `lib/metrics/*` is pure TypeScript, no I/O; every number a model narrates was computed here first
  and handed over pre-formatted via `lib/format.ts` (the only formatter). Root cause: `glm-5.3`
  asked to compute aerobic decoupling itself returned the sign backwards (−14.1% vs the true
  +12.3%).
- Nina never writes SQL. `lib/nina/tools.ts` dispatches to typed handlers that import no `db`,
  `runs`, or Drizzle value; `lib/nina/gateway.ts` is the *only* file allowed to touch Postgres for
  her. `npm run ci:data-layer-guard` enforces the import boundary by grepping, not by trusting the
  comment on it.

**One chart is allowed a dual y-axis** (`/r/[id]`'s pace/HR chart) — a deliberately fenced exception
to the no-dual-axis rule, contained to one file and enforced by `ci:f08-guard` (fails the build on
a second `yAxisId` anywhere, or on Recharts imported outside `components/charts/*Inner.tsx`).

**Badge and record art is generated offline and committed** (`tools/*.py`, `.claude/skills/generate-badge/`)
— nothing in the shelf draws itself at runtime. Nina's photographs are the one *runtime* image
generation in the app, fenced to `lib/nina/` by `ci:openrouter-guard`. Current model id in code is
`qwen/qwen-image-3` / `-pro` (`lib/nina/imagerecipe.ts`, `lib/nina/imageprefs.ts`) — README.md now
documents `bytedance-seed/seedream-5-0-pro` as the intended new default; that code migration has
not landed yet, so don't assume the two agree.

**Tests run against a recording fake DB driver by default** (`environment: 'node'`, no jsdom except
`.test.tsx` files under `components/`) — real Postgres and real LLM calls are both opt-in via env
var, never accidental. The vision client is exercised with an injected `fetch`, so the token-floor
guard is tested against the measured failure body without any network call.

**Docs, in order of authority for "how does X actually work today"**: `docs/architecture.md` (current
state, wins over everything below) → `CHANGELOG.md` (release-by-release narrative) →
`docs/plans/archive/F01`–`F33` (point-in-time plans; several were superseded — architecture.md §13
says by what) → `.workflows/plan/*/` (post-F33 feature sets, mostly Nina-era).
