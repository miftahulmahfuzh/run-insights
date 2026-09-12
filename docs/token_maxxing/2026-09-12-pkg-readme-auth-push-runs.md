# Token-Maxxing Session — 2026-09-12: Auth/Push/Runs/Trends Package Readme (Combined Cluster)

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `pkg-readme-auth-push-runs`) pre-assigned one
  idea by the coordinator (`tokenmax-orch-2026-09-12`), verbatim: *"Write one combined
  package_readme.md for lib/auth, lib/push, lib/runs, and components/trends+auth+push+runs —
  all six were swept together in one prior session (auth-push-runs-trends-yagni) and share
  one natural doc scope, but none has a package_readme.md yet."* The seven directories
  (`lib/auth`, `lib/push`, `lib/runs`, `components/auth`, `components/push`,
  `components/runs`, `components/trends` — 22 files, 1,994 lines at measurement) form the
  app's sign-in → runs → intent → trends → push vertical slice; the same-day YAGNI session
  had swept them together, and none carried a package_readme.
- **Concrete changes:** 1 file, +658, one commit (`f268e07`) —
  `lib/auth/.workflows/package_readme.md`, the first package_readme the cluster has ever
  had, anchored at `lib/auth` as the cluster's dependency root and covering all seven
  directories in one doc.
- **Real value delivered:**
  - The first map of the app's auth/push/runs/trends slice, written claim-by-claim from
    full reads of all 22 source files (plus the co-located `lib/push/payload.test.ts` so
    test coverage could be stated honestly) — not assembled from grep triage.
  - A **measured reverse-dependency census** that pins the cluster's seams with numbers:
    `lib/auth/requireUserId` has **34 importer files** (the app-wide boundary: 19 app
    routes/pages, 2 components, 13 lib action modules incl. `lib/admin/requireAdmin`);
    `lib/push/send` has **exactly 1** (`lib/nina/proactive.ts` — the notifier seam, and the
    cluster's single back-edge, `type-only`); `lib/runs/actions` exactly 1 (`IntentChips`);
    `components/trends` exactly 1 page; and `lib/push/payload` shows zero `@/` importers
    because its consumers import relatively in-package — by design, since the payload module
    must stay importable by the service worker's kept-in-step twin.
  - The load-bearing rules written down where the next editor will trip over them: the
    boundary's two rules (call `requireUserId` first, never bare try/catch it; route
    handlers use `requireUserIdApi` + `unauthorizedJson`), the push wire contract (v1,
    kept-in-step service-worker constants), the **pruning rule (404/410 terminal ONLY —
    401/403 deliberately retryable, because a rotated VAPID key must not prune the
    subscription table)**, the subscription store's userId-first scoping and soft-vs-hard
    delete, the sender's never-throw seam, the component state machines
    (`PushSetupCard`'s support states, the `NEXT_PUBLIC_` prop resolution,
    `IntentChips`' `useOptimistic`), a cross-package flows diagram, and a do-not gotchas
    list.
  - **The context-loss incident, recorded honestly** (below): the worker was launched, did
    its rename (W1), lost its entire conversation context, and went idle WITHOUT doing any
    work; the coordinator pinged twice (~25 min apart) before the recovery. The recovery
    method — derive true state from git alone — is the session's durable lesson.
  - Volatile numbers (34 importers, 1,994 lines) stamped with their measure date per the
    `package-readme-volatile-numbers-rot` rule; the readme's header line 6 says the counts
    were "read and measured from the tree on this date".
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-auth-push-runs`
- **Merge status:** merged (commit `63025d7`)
- **Approx token burn:** ~200k 🔥 (22 full file reads, the census greps, a 658-line doc
  written claim-by-claim from the reads, and the prettier + guard verification).

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed
one pre-assigned idea. Earlier the same day, the `auth-push-runs-trends-yagni` worker had
swept these same seven directories together for dead code — they are small, intertwined,
and form one vertical slice (sign in, see your runs, tag an intent, compare trends, get
pushed when Nina has something to say). That sweep removed dead surface but wrote no map;
and unlike `lib/db`, `lib/nina`, `lib/admin` and the rest of the day's readme targets, the
cluster had never had a package_readme at all. One doc rather than seven was the assignment's
own call: the directories "share one natural doc scope", and the flow that makes the slice
worth documenting (sign-in boundary → run list → intent write → trends read → push send)
crosses the directory lines constantly.

This session is also the day's context-loss case study: it was launched, made its first
move, and then lost everything — with the actual work entirely undone, discovered only
because worker state is reconstructible from git.

## What We Did (blow-by-blow)
1. **The context-loss incident.** The worker session was launched by the coordinator,
   performed its rename step (W1), and then lost its entire conversation context — going
   idle without doing any of the task. The coordinator pinged twice, ~25 minutes apart,
   with no response. The recovery: **derive true state from git before claiming anything**.
   `git log origin/main..HEAD` was empty — zero commits on the branch; there was no session
   doc in `docs/token_maxxing/`; there was no package_readme anywhere in the seven
   directories. Conclusion: "not started" — reported honestly to the coordinator, and then
   the whole task was executed in the recovered session. The lesson cuts two ways, and both
   are the reason worker mode is shaped the way it is: (a) a token-maxxing worker's state is
   reconstructible entirely from git + the docs tree — which is exactly why worker mode
   forbids merging and keeps the coordinator as the one session holding intent, so a lost
   worker costs nothing but its own tokens; and (b) when re-entering a lost session, check
   branch-unique commits and the docs index before claiming anything — "I was launched"
   carries no information about what happened after.
2. **Read all 22 source files in full** — the house style for readme work: full reads, not
   grep triage — plus the co-located `lib/push/payload.test.ts`, so the doc could state test
   coverage honestly instead of guessing.
3. **Read the format exemplar and the scope's prior session:** `lib/admin`'s
   package_readme for structure, and the `auth-push-runs-trends-yagni` session doc for the
   scope's recent history (what that sweep had already removed, so the new doc wouldn't
   document ghosts).
4. **Measured a reverse-dependency census.** Grepped for the `@/` specifier across `app/`,
   `components/`, `lib/`, `tests/`, `scripts/`, plus the root `auth.ts` / `auth.config.ts` /
   `proxy.ts` — with `.workflows/` plan copies **excluded**, per the
   `adopted-plan-copies-trip-string-guards` rule (adopted plan copies live INSIDE `lib/`,
   so a filesystem grep scans their prose and invents importers). Headline numbers, as
   landed in the readme's Reverse dependencies table:
   - `lib/auth/requireUserId` — **34** importer files; the app-wide boundary (19 app
     routes/pages, 2 components — `NinaUnreadBadge`, `PushSetup` — 13 lib action modules
     incl. `lib/admin/requireAdmin` for `UnauthorizedError`).
   - `lib/push/send` — **1**: `lib/nina/proactive.ts`, the notifier seam (which also makes
     the cluster's single back-edge, `type-only`).
   - `lib/runs/actions` — **1**: `IntentChips`.
   - `components/trends` — **1** page.
   - `lib/push/payload` — **0** `@/` importers, and that is the design, not a gap: its
     consumers import relatively in-package so the module stays service-worker-importable.
5. **Wrote the combined doc** at `lib/auth/.workflows/package_readme.md` (658 lines),
   anchored at `lib/auth` as the cluster's dependency root. Sections as landed: Why one doc
   for seven directories · Scope map · The boundary (`requireUserId` flavours and their two
   rules) · `lib/push` end-to-end (payload wire contract + pruning rule, the subscription
   store, the sender, the three writes a runner can cause) · `lib/runs/actions` (one
   mutation, one column) · the four component directories and their state machines ·
   Internal architecture (the cross-package flows diagram) · Dependencies · Reverse
   dependencies · Concurrency · Error handling · Usage (adding a protected surface; adding
   a push-adjacent behaviour) · Gotchas (the do-not list) · Notes.
6. **Gates.** `prettier --check` clean on the new file. Then
   `npm run ci:client-secret-guard` — run **deliberately before committing**, because the
   doc's gotchas prose contains the literal `NEXT_PUBLIC_` and the guard scans `lib/`; it
   exits 0 positive-controlled, because the guard's `SOURCE_GLOBS` already excludes `.md`
   (its own header cites the `lib/db/.workflows/package_readme.md` precedent). No code was
   touched, so `tsc`/`vitest` were not run — there is no compile surface in this diff.
7. **Committed as `f268e07`** ("docs(auth): first package_readme — the auth/push/runs/trends
   cluster", 1 file, +658) on the worker branch and stopped — no merge, no push; the
   coordinator lands worker branches. This session doc + index row are the second commit.

## Code / Design Details

**The readme's shape** (headings as landed; 658 lines):

```
# Package: auth · push · runs · trends (the user cluster)
## Why one doc for seven directories
## Scope map
## The boundary: `lib/auth/requireUserId.ts`
  ### `lib/auth/actions.ts` — sign in/out as Server Actions
  ### `lib/auth/safeNext.ts` — the open-redirect guard
## `lib/push` — Web Push, end to end
  ### `payload.ts` — the wire contract and the pruning rule (pure, no `server-only`)
  ### `queries.ts` — the whole read/write surface of `push_subscriptions`
  ### `send.ts` — the one place this app talks to a push service
  ### `actions.ts` — the three writes a runner can cause
## `lib/runs/actions.ts` — one mutation, one column
## `components/auth` — the sign-in surface
## `components/push` — the push control
## `components/runs` — the `/` list and the run detail's honest marks
## `components/trends` — the comparative screen
## Internal architecture — the cluster's flows
## Dependencies (Internal / External)
## Reverse dependencies
## Concurrency
## Error handling
## Usage (adding a protected surface / a push-adjacent behaviour)
## Gotchas — the do-not list
## Notes
```

**The two rules of the boundary**, as the doc states them: `requireUserId()` for pages and
Server Actions (Next serialises the `redirect('/')` back to the client router) — call it
first, line one, never inside a bare try/catch; `requireUserIdApi()` + `unauthorizedJson()`
for route handlers (throws `UnauthorizedError` instead of redirecting). Both exits of the
signed-out path are control flow, which is why the bare try/catch ban exists.

**The pruning rule** — the doc's highest-stakes gotcha:

> **Pruning is 404/410 and nothing else** (RFC 8030 §7.3 — permanent by specification). …
> **401/403 stay retryable** — a rotated VAPID key must not prune the table.

The paired do-not: "Do not add 401/403 to the terminal status codes. Rotated-VAPID would
prune every [subscription]."

**The seam numbers** (Reverse dependencies, as landed):

```
| `lib/auth/requireUserId` | 34 | The app-wide boundary: 19 app routes/pages, 2 components
                                 (`NinaUnreadBadge`, `PushSetup`), 13 lib action modules
                                 incl. `lib/admin/requireAdmin` (for `UnauthorizedError`). |
| `lib/push/send`          | 1  | `lib/nina/proactive.ts` — the notifier seam. |
```

with `lib/push/payload`'s zero explained rather than left to look dead: consumers import
relatively in-package (by design, for service-worker importability).

**The one back-edge**, drawn in the flows diagram: `lib/nina/proactive.ts ── pushNotifier
── sendNinaPush`, with `send.ts`'s import of `@/lib/nina/proactive` kept **type-only** so
the cycle never becomes a runtime one.

**Volatile numbers stamped**: the header's scope line ends "(22 files, 1,994 lines at
measurement)" with the measure date in the same breath; the 34-importer figure lives in the
table with its census method described — so a future re-measure starts from a date and a
method, not from a number to be trusted.

## Decisions & Trade-offs
- **One doc for seven directories, anchored at the dependency root.** `lib/auth` is where
  everything enters (the boundary), so the doc anchors there and reads outward through the
  slice. Cost: `components/trends` sits further from the anchor than a per-directory doc
  would put it. Benefit: the flows that give the slice its shape (sign-in → runs → intent →
  trends → push) are documented as flows, not scattered across seven files that each
  describe only their own segment — and a context-loader hands one packet, not seven.
- **Excluded `.workflows/` plan copies from the census greps.** The
  `adopted-plan-copies-trip-string-guards` rule exists precisely because
  `{pkg}/.workflows/plan/` sits inside `lib/` and filesystem greps scan its prose. Without
  the exclusion, the 34-importer count would have counted plan-copy mentions of
  `requireUserId` as importers.
- **Ran `ci:client-secret-guard` before committing, on purpose.** The natural instinct with
  a docs-only diff is "no code changed, skip the guards" — but this doc's prose deliberately
  contains the literal `NEXT_PUBLIC_` (the gotcha that forbids it) while living inside the
  directory the guard scans. Verifying the guard's exit 0 *before* the commit converts a
  would-be post-merge CI surprise into a checked fact — and records, in the doc, that the
  guard's `SOURCE_GLOBS` excludes `.md` (its own header cites the `lib/db` package_readme
  precedent), so future doc authors in this cluster know prose-literals are safe without
  re-testing it from scratch.
- **Full reads over grep triage.** 22 files at ~90 lines average is cheap to read and
  expensive to mis-summarize; the readme's claims (state machines, the soft-vs-hard delete
  split, the `useOptimistic` chip flow) are the kind a grep-based summary flattens into
  wrongness.
- **No code touched — `tsc`/`vitest` not run.** A deliberate scope line, stated in the
  commit-adjacent record: the diff's only compile surface is a markdown file; running the
  type gate would have been theatre.
- **Honest reporting of zero progress.** The recovered session reported "not started"
  rather than reconstructing a plausible half-done narrative from the coordinator's pings —
  the git evidence (empty branch, no doc, no readme) is unambiguous, and a fabricated
  progress claim is the one thing a lost session can still get wrong after recovery.

## Follow-ups & YAGNI notes
- **The `NEXT_PUBLIC_` prohibition is prose-enforced here; the guard is the mechanism.** The
  gotcha names the rule and the guard enforces it; if the guard's globs ever change, the
  prose-literals safety this doc relies on changes with it. The `lib/db` precedent cited in
  the guard's header is the thing to keep in step.
- **The counts will drift.** 34 importers, 1 importer, 1 page, 22 files / 1,994 lines — all
  stamped with the 2026-09-12 measure date per `package-readme-volatile-numbers-rot`. The
  next session touching the cluster should re-measure from the date, not trust the number.
- **No session-level code follow-ups were opened.** The prior
  `auth-push-runs-trends-yagni` sweep already harvested the cluster's dead surface the same
  day; this session was a map, and the map's gaps (if any) are for the next reader to name
  against the tree.
- **Worker-mode hygiene held:** no merge, no push — the DONE report to coordinator
  `tokenmax-orch-2026-09-12` carries the slug, branch, commit and doc path after this doc
  lands.

## Appendix

**Files touched:**
```
lib/auth/.workflows/package_readme.md | 658 ++++++++++++++++++++++++++++++++++
1 file changed, 658 insertions(+)
```
(second commit of the session: this doc + the `docs/token_maxxing/README.md` index row,
both by explicit pathspec)

**Verification performed:** `git log origin/main..HEAD` (empty → the honest "not started"
recovery verdict; after the work commit, exactly one commit ahead); full reads of all 22
cluster files + `lib/push/payload.test.ts`; `@/`-specifier census across `app/`,
`components/`, `lib/`, `tests/`, `scripts/` + root `auth.ts`/`auth.config.ts`/`proxy.ts`
with `.workflows/` excluded; `npx prettier --check` clean on the new file;
`npm run ci:client-secret-guard` positive-controlled exit 0 before committing.

**Git evidence chain:** the empty pre-work `origin/main..HEAD` (the context-loss incident's
ground truth); `04e79fe` (the same-day `auth-push-runs-trends-yagni` sweep whose scope this
doc inherits); `f268e07` (this session's readme commit).

**Session identity:** worker session `pkg-readme-auth-push-runs`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-pkg-readme-auth-push-runs`; work commit `f268e07`; merged
(commit `63025d7`).
