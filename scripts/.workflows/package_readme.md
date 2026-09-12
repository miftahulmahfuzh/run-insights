# Package: scripts

**Location**: `scripts`
**Last Updated**: 2026-09-12 (verification pass — every claim re-checked against the tree; see
Notes for the documentation history)

## Overview

`scripts/` is operational code, not app code: the ops and maintenance commands that read or write
production data and Blob storage, the CI boundary guards, Nina's off-platform image-generation
worker, and the capture toolkit that photographs the app for the README. Nothing here is imported
by the app, and none of it runs under `npm test`. The reverse is deliberate in three cases —
`nina-dedupe-plan.mjs`, `nina-image-worker.ts` and `nina-shortcuts-import.mjs` are importable BY
the test suite (`tests/nina.dedupeMedia.test.ts`, `tests/nina.imageworker.test.ts`,
`tests/nina.shortcutsImport.test.ts`), which is why each separates its pure, judgment-bearing half
from its I/O half.

**The standing rules of the directory** — each script's header restates the ones it lives by:

1. **Dry run is the default; the write flag writes.** Every script that can destroy data prints a
   full report and writes nothing with no flag. The write flag is `--apply` (or `--delete` in
   `blob-reap.mjs`). A dry run that proposes nothing is the expected steady state, not a malfunction.
2. **NOT A TEST.** Anything that touches the real database, the real Blob store or real money says
   so in its header and is never part of `npm test`.
3. **`DATABASE_URL` IS PRODUCTION.** There is one database in this repo (`.env.local`'s
   `DATABASE_URL` is the instance production reads). Every number a script prints is a production
   number and every `--apply` is a production write. Read the dry run before applying. Always.
4. **The `lib/` import rule.** A script may import a `lib/*.ts` module only when stripping its
   types leaves no runtime dependency and no `@/` alias — the zero-import modules
   (`lib/id.ts`, `lib/nina/shortcuts.ts`, `lib/records/catalog.ts`, `lib/nina/imagerecipe.ts`,
   `lib/photos/contentHash.ts`, …) — run under
   `node --experimental-strip-types --no-warnings`. Importing the real module instead of copying
   it is the whole point: the copy is always the one that drifts. What can NEVER be imported is
   `lib/db/*`, `lib/env.ts`, or anything `server-only`-sealed; so scripts open their own SQL with
   `@neondatabase/serverless`, read `process.env` and validate by hand, and
   `nina-image-worker.ts` adds an `information_schema` preflight that turns column drift into a
   loud failure on the next run instead of a silent one at 3am.
5. **Dates are `::text`, never a JS `Date`.** The driver returns a `date` column as a `Date` at
   LOCAL midnight, and the round trip can land on the adjacent day from a different timezone.
   `backfill-badge-run-ids.mjs`'s header documents this at length; the rule is repo-wide
   (`DateISO` is a string everywhere in `lib/`) and scripts are not exempt.
6. **Guards: fix the code, never silence the check.**

Package bookkeeping lives beside this file: `.workflows/todos.md` (the task ledger, package code
SC) and `.workflows/plan/` (adopted phase plans).

## Ops & maintenance — dry-run by default, `--apply` writes

### `blob-reap.mjs` — `npm run blob:reap`
Reaps Vercel Blob objects nothing in the database references, under `shots/` and `nina/`. Counts
REFERENCES per blob — the union of every declared reference site plus a defensive sweep of the
untyped jsonb columns (`nina_turns.args`, `nina_memory_slots.value`) — never row counts, because
one blob can legitimately be named by two rows (`attachExisting`). Deletes only at refCount 0 and
past `--min-age-hours` (default 24). A per-prefix interlock REFUSES when the database names zero
blobs under a non-empty prefix — the signature of a wrong `DATABASE_URL` — unless
`--allow-empty-db`. The write flag is `--delete`.

### `nina-dedupe-media.mjs` — `npm run nina:dedupe-media`
The Nina Media dedupe sweep, in ordered passes: hash-fill `content_hash` for every row (originals
AND references — the reference's own bytes must be measured, not presumed); verify gates that
re-fetch and re-hash stored hashes and stored perceptual signatures before trusting them; signing
of originals that lack one (64-bit dHash + 16x16 grayscale mean-abs, via `sharp`); then the merge
— byte-identical groups and perceptual twins at conservative gates, loser row repointed to the
keeper, loser blob released only after a live re-check of the reference gate (err toward keep).
Idempotent: a second `--apply` finds nothing to do. `--apply` runs HAVE happened against
production (measured 2026-09-11: 48/52 rows hashed, 17 rows repointed, releases recorded in git —
e.g. `c2c2ca5`), and it stays safe to re-run after any future drift. All judgment lives in
`nina-dedupe-plan.mjs`.

### `nina-dedupe-plan.mjs` — no npm entry (imported)
The pure half of the sweep: grouping by `(user_id, content_hash)`, keeper election, the ordered op
list, and the perceptual twin gates. No database, no Blob client, no env — every input is an
argument — which is what lets `tests/nina.dedupeMedia.test.ts` hold the merge rules against
measured production groups. The twin-gate constants exist in BOTH this file and
`lib/nina/perceptual.ts` — the write-time twin check, which adds `PERCEPTUAL_MAX_SIG16` of its
own — and must move together (the move-BOTH rule); read this file's header before loosening either
number.

### `nina-memory-reap.mjs` — `npm run nina:memory-reap`
Deletes distilled memory rows — `nina_memory_facts`, `nina_memory_slots`, entries inside
`pending_promises` — whose `source_message_id` no longer resolves: the backlog from before
`removeNinaSession` purged in-transaction, plus the standing backstop for the distillation race.
The predicate is a bare anti-join against `nina_messages`; admin-typed rows (NULL source) are
structurally unreachable, and there is no time bound or heuristic. `nina_turns` with dangling
`replyToId` are REPORTED and never deleted — invariant 9: a removed conversation does not un-spend
its tokens.

### `nina-shortcuts-import.mjs` — `npm run nina:shortcuts-import`
Lifts shortcut-shaped rows out of `nina_memory_facts` into `nina_shortcuts`. Recognises the four
prose grammars the owner writes shortcuts in (A `nina bilang`, B `nina bakal`, C `<T>artinya`,
D `<T>ini posisi`), tried in order, first CLEAN parse winning — the `🫦` row has A's shape up to
the verb and only B reads it correctly. It imports `normalizeNinaTrigger`/`classifyNinaTrigger`
from `lib/nina/shortcuts.ts` instead of copying them, so the `match_key` it writes is by
construction what the runtime matcher compares against (the test asserts function identity as the
anti-drift guard). `--prune` is only valid with `--apply` and deletes only by
`nina_memory_facts.id`, only after a byte-identical expansion is confirmed present in
`nina_shortcuts`. The job is DONE on production: measured 2026-09-11, `nina_shortcuts` holds 25
rows and `nina_memory_facts` 3 — the original 28, conserved.

### `backfill-record-keys.mjs` — `npm run records:backfill`
Run ONCE, right after a new catalog key ships: inserts the `records` rows users would already hold
had they committed a run since. Computes candidates from the real `lib/records/catalog.ts`
(imported, not restated), writes insert-only with `on conflict do nothing`, and never deletes or
updates — deliberately NOT the app's wholesale replace. Keys it cannot honestly supply
(`fastest_km_split`, `best_paced_run`) exclude themselves through their own null-requiring
qualifiers and are reported under `needsFullRecompute`.

### `backfill-badge-run-ids.mjs` — `npm run badges:backfill-runs`
Fills `run_id` on the pre-round-3 badge awards written with NULL. The run is recovered EXACTLY
from `earned_on` (always the committing run's own `occurred_on`); a day holding two reviewed runs
is left alone under `ambiguous` rather than guessed, because a date that opens the WRONG run is
the app lying about the runner's history. Session awards are never touched.

### `nina-profpic.mjs` — `npm run nina:profpic`
Replaces Nina's profile picture in production from a local image: uploads the Blob, un-currents
the old avatar row and inserts the new one in ONE transaction (un-current FIRST — the partial
unique index is why the order is not stylistic), pokes the proactive cron entry point, and
re-seeds `assets/nina/_anchor.png` in the working tree (kept only as the seed for the deferred
consistent-face feature; RU-18 dropped reference-based generation, so the anchor affects no
generation today). She announces the change herself via `source = 'operator'` — a laptop script
must never be a second author of Nina's voice.

### `f04-e2e-probe.mjs` — no npm entry
Proves the ASSEMBLED extraction pipeline against the real world — real Blob PUT, real `glm-4.6v`
call with the production prompt, real Zod validation, real terminal `extractions` row — the one
thing the unit suite's injected fakes cannot prove. Creates a throwaway user and deletes it
afterwards (the cascade cleans everything; `--keep` to inspect). Deliberately asserts NO
extraction accuracy — only that every seam holds. Spends real money.

## The image worker

### `nina-image-worker.ts` — `npm run nina:worker` / `npm run nina:worker:dry`
Nina's camera, off-platform (RU-19/RU-20): shipping generation measured 78.2 s against Vercel
Hobby's 60 s cap, so GitHub Actions hosts the worker (`.github/workflows/nina-image.yml`). `--job
<id>` runs one job (the `workflow_dispatch` path); no flag drains up to `NINA_IMAGE_SWEEP_BUDGET`
actionable jobs (the `schedule:` backstop for a lost dispatch). Imports the zero-import lib
modules so the payload shape, pathname convention and thresholds are not duplicated; writes its
own SQL and validates env by hand, with the `information_schema` preflight as the drift alarm.
`main()` runs only when this file is the process entry point, which is what lets the test drive
`parseArgv` and `generate` with no network. The only `.ts` in the directory, and the precedent for
the strip-types import rule.

## CI boundary guards

Each is a grep-shaped assertion with a real exit code, wired into CI via the `ci:*` / `badges:check`
npm scripts. Shared law: guards police CODE, not prose — by stripping comments before matching, or
by scoping the grep to source extensions (both rules earned the hard way, after prose that merely
MENTIONED a name turned a guard red) — and the fix is always in the code, never in the check.

- `check-data-layer-invariants.mjs` (`ci:data-layer-guard`) — `extractions` stays append-only (the
  model's wrongness is the signal that tightens the prompt), and `getRunByShareToken` remains the
  only unscoped READ of user data in `lib/db/queries.ts` — the guard's allowlist also holds
  `isUniqueViolation` (a pure predicate over an error object) and `listActiveUserIds` (F07's cron,
  ids only), each documented at its definition.
- `check-openrouter-boundary.mjs` (`ci:openrouter-guard`) — `OPENROUTER_API_KEY` may appear only
  in `lib/nina/` and `lib/env.ts` (RU-2's narrowed boundary: runtime image generation is Nina-only,
  badge/record art stays offline). The grep is scoped to source extensions (2026-09-12, after an
  adopted plan copy under `lib/db/.workflows/plan/` tripped the bare grep by mentioning the name
  in prose). Exported as well as run; `check-badge-art.mjs` imports it rather than keeping a
  second copy of a security grep.
- `check-client-secret-boundary.mjs` (`ci:client-secret-guard`) — no secret name in a `'use
  client'` module, no raw `process.env.<SECRET>` outside `lib/env.ts`, `lib/db/index.ts` and
  `lib/nina/vision.test.ts` (a colocated test's dummy-key default; exempted 2026-09-12 in
  `78f1a9c` after breaking the guard on every push), and `NEXT_PUBLIC_` nowhere in `app/`, `lib/`
  or `components/`.
- `check-f08-boundaries.mjs` (`ci:f08-guard`) — Recharts is imported only from
  `components/charts/*Inner.tsx`; exactly one file carries the dual-y-axis waiver; no chart or
  screen hand-rolls a unit outside `lib/format.ts`.
- `check-f11-share-boundaries.mjs` (`ci:f11-guard`) — the public `/s/[token]` route's negatives:
  no second page under it (exactly four files: page, layout, not-found, copy), no analytics EVER
  (the pathname is the bearer token), owner-side share components never leave the authenticated
  tree, nobody re-derives an HR denominator, and no Suspense boundary above the token page (a
  `loading.tsx` turns every `notFound()` into a 200).
- `check-llm-payload-boundary.mjs` (`ci:llm-payload-guard`) — a model call is never awaited from a
  page render. Nine named entry points, each documented in the file with its measured latency and
  the correct fire shape (client event handler, or `after()` inside the route segment).
- `check-badge-art.mjs` (`badges:check`) — executable assertions for the badge and record decks:
  the key boundary (§1 reuses the openrouter guard), the style contract's parity with the catalogs
  (`tools/decks.json`, serialised from `tools/decks.py`), and manifest-vs-disk SHA checks that are
  what license `next.config.ts` to serve `/badges/*` as `immutable`. Passes on an empty deck BY
  DESIGN and reports which of its three states (no masters / some / all) it is in.

## Build-time wiring

- `copy-image-compression-worker.mjs` — runs from `predev` and `prebuild`; copies
  `browser-image-compression`'s UMD bundle into the gitignored `public/vendor/` so the
  compression worker `importScripts()` our own origin instead of a jsDelivr CDN URL (uptime, CSP,
  and the cellular connection the 560w/q80 recipe exists to spare).
- `gen-og-default.mjs` (`og:default`) — writes `public/og-default.png` byte-by-byte (raw RGB rows,
  one zlib deflate, hand-rolled PNG chunks) from the design tokens. One flat, numberless preview
  for every share link, COMMITTED rather than dynamic: Meta caches scraped previews beyond
  `revokeShareLink`'s reach, so per-run images would leak numbers revocation cannot follow.

## Capture toolkit (`capture/`) — the README's screenshots and GIFs

F19's pipeline. Not part of `npm test`: it writes the real database and, on the Nina pass, spends
real money on a real generation.

- `dataset.mjs` — 27 run specs built into `ExtractedSession` payloads that pass all four of the
  review screen's consistency checks — the green banner is what lets `shoot.mjs` commit 26 runs
  one tap each. NOTHING here invents a metric: the payload is transcribed-screenshot-shaped input,
  and the app computes every derived number at commit.
- `seed-demo.mjs` (`capture:seed` / `capture:purge` / `capture:status`) — seeds the `demo-*` user
  the README's screenshots show: one user, profile, three Blob objects, 26 extractions with
  photos — and deliberately NO runs, splits, zones, records or badges, which only the app's own
  commit path may write. `--purge` deletes the user row and prints counts back (15 of the 17 FKs
  cascade, so that one delete is the whole cleanup).
- `session-cookie.mjs` — mints the demo user's Auth.js session cookie for headless capture.
  Possible, and not a back door, because strategy `jwt` means the session IS the cookie and
  anything holding `AUTH_SECRET` can mint one; `token.sub` is the one contract that matters.
- `shoot.mjs` (`capture:shoot`) — drives the real app in Playwright: a COMMIT pass (clicks
  Confirm & save, so `commitReviewAction` writes runs, records and badges), a NINA pass (scripted
  runner lines; every bubble of hers is the model's actual reply and her photo a real OpenRouter
  generation — no fake Nina messages, ever), STILLS at 390x844 (a phone's shape, not `fullPage`
  diagrams), and GIFS via webm recording. `--only` re-shoots named artifacts; the per-GIF byte
  shares of `docs/media/`'s 8 MB budget live here.
- `webm-to-gif.mjs` — ffmpeg two-pass palette GIF encoding with a byte budget that FAILS rather
  than warns, walking an explicit quality ladder and printing which rung it landed on. Dithering
  was dropped on measurement (~20% smaller, no banding on this flat design); `mpdecimate` kept.

## Everything else

- `db-smoke.mjs` (`db:smoke`) — Neon connectivity smoke test. Warns when the runtime-pooled URL
  lacks `-pooler`, and hard-fails `--unpooled` when handed a pooler host (heavy ops need the
  direct string).
- `shipped-image-recipe.py` — regenerates the committed
  `research/fixtures/screenshots/shipped/` JPEGs at the production upload recipe (560 px short
  edge, quality 80) in Pillow, because the real compressor runs in a browser Web Worker and cannot
  be invoked from a shell. Not the production path — a documented, re-runnable recipe for a
  committed artefact.
- `vercel-env-push.sh` — pushes `.env.local` into Vercel's environment variables (dry run by
  default, `--apply` to send). Exists because both naive approaches fail: quoted values keep their
  quotes, and `vercel env add KEY production preview` treats the third positional as a git BRANCH.
  Values go over stdin, `--sensitive` where Vercel allows it, and `AUTH_URL` is production-only at
  the canonical origin.

## Notes

**Recent changes** — one paragraph per landing wave; no per-phase entries. Durable statements
live in the body sections and in each script's own header; narrative lives in git history, which
is complete and ordered and costs a session no context to load.

- **2026-09-12 — verification pass** (token-maxxing worker `scripts-readme-compact`, closing the
  day's seven-readme set): every npm-script mapping, file-inventory entry, guard rule, flag
  default and negative claim re-checked against the tree. Corrected: the client-secret raw-read
  exemptions are now THREE (`lib/nina/vision.test.ts`, `78f1a9c`); the twin-gate constants'
  second home is `lib/nina/perceptual.ts`, not the signer `perceptualSign.ts` (which never held
  them — `git log -S` proves it); the data-layer allowlist wording; the guards' two prose-defense
  mechanisms (comment stripping vs source-extension scoping); `seed-demo.mjs`'s npm entries; and
  the worker's workflow file is now named. "Nothing here is imported by the app" re-proved by
  grep over `lib/`, `app/`, `components/`.
- **2026-09-11 — file written** (`b049bb7`) mapping the package after P1-SC-A000's bookkeeping
  closed out. Dated measurements in this file (the dedupe sweep's 48/52 and 17, the shortcuts'
  25/3, the worker's 78.2 s) are production measurements from that date, stamped as such.
