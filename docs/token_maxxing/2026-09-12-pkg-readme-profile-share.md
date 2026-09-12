# Token-Maxxing Session — 2026-09-12: Profile/Share Package Readme & Drift Closure

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `pkg-readme-profile-share`) pre-assigned one idea
  by the coordinator (`tokenmax-orch-2026-09-12` — a coordinated fan-out; the idea came from the
  assignment, not a solo menu), in two parts: (1) write ONE combined
  `package_readme.md` for the four-directory estate `lib/profile` + `lib/share` +
  `components/profile` + `components/share` — none of which had any `.workflows/` at all before
  today; and (2) while touching components/share's copy, close the open follow-up from
  `ui-share-polish`: import the existing `PHOTO_ZOOM_HINT` constant into
  `components/review/ScreenshotStrip.tsx` instead of the hardcoded `'tap to zoom'` string
  literal, so the copy/component drift that session flagged (but deliberately did not fix)
  becomes structurally impossible.
- **Concrete changes:** two commits on the worker branch, +379/−4 across 3 files —
  - `6b5cd47` — "refactor(review): render PHOTO_ZOOM_HINT in SheetSource, not a duplicate
    literal" (2 files, +5/−4): `components/review/ScreenshotStrip.tsx` imports
    `PHOTO_ZOOM_HINT` from `@/lib/share/copy` and renders it at the former hardcoded literal in
    `SheetSource`'s header line; `lib/share/copy.ts`'s keep-in-sync warning paragraph rewritten
    as a construction note — exactly the shrink `ui-share-polish` asked for.
  - `c0883b4` — "docs(profile,share): combined package_readme for the four-directory estate"
    (1 file, +374): NEW `lib/share/.workflows/package_readme.md`.
- **Real value delivered:**
  - The drift class is closed by construction, not discipline: `'tap to zoom'` now appears
    exactly once in the repo (its `lib/share/copy.ts:91` definition — verified by grep), and the
    doc comment that carried a MANUAL "keep this worded identically" obligation —
    identical-by-discipline, which is how drift happens — now states the rendering is shared
    "by construction — there is no second string left to drift."
  - The estate has its first map: a 374-line readme covering all four directories with 12
    estate-wide invariants written once, module API notes grounded in a full same-day read of
    all 17 estate files (~2,506 lines) plus `ScreenshotStrip.tsx`, and a reverse-dependency
    table built from repo-wide greps — every volatile count stamped with its 2026-09-12
    measure date.
  - The readme opens with a written contract to the next readme-updater: this file covers all
    four dirs, update it, don't create a sibling; split only when the estate genuinely splits,
    along the profile/share seam.
  - Two of the readme's own draft claims were self-caught and corrected during verification
    (see Decisions) — the reverse-dependency tests row initially over-counted estate importers
    9 vs the measured 4, and badge/record counts were re-derived from the catalogs rather than
    trusted from doc comments.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-profile-share`
- **Merge status:** merged (commit `a2bc44f`)
- **Approx token burn:** ~1M (est.), and the burn's *character* is the point: it went into the
  READING (all 17 estate files + ScreenshotStrip in full before documenting; both same-day
  session docs' follow-ups read; reverse-dep greps; claim-by-claim verification of the readme
  against the tree) rather than into diff volume — 374 of the session's 379 added lines are the
  documentation itself. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed a
pre-assigned idea. This worker's assignment paired a gap with a debt:

- **The gap**: the 2026-09-12 package-readme campaign (root, lib/admin, lib/db, lib/nina,
  components/nina, components/admin — seven files verified/compacted that day) had skipped the
  four-directory profile/share estate entirely, because there was nothing to compact: no
  directory had a `.workflows/`, so no readme existed. Writing one from zero is a different job
  from verifying one — every claim has to be derived from the tree rather than checked against
  an earlier draft.
- **The debt**: the same-day `ui-share-polish` session had found that `SheetSource` in
  `components/review/ScreenshotStrip.tsx` renders a byte-identical twin of
  `lib/share/copy.ts`'s `PHOTO_ZOOM_HINT`, and that `copy.ts`'s doc comment carried the
  keep-in-sync obligation as prose: *"Worded identically to the hint `SheetSource` … already
  shows, so the two places a screenshot can be tapped teach the same gesture in the same words
  rather than each inventing a phrasing."* That session deliberately stopped short of the
  component edit (a render path is collision territory in a fan-out) and recorded the real
  guarantee — importing the constant — as the follow-up, in its own words: *"the comment's
  warning could then shrink to a note,"* left as *"first candidate for whatever session next
  touches components/review render code."* This session is that session.

The pairing is natural: the copy-constants discipline is one of the estate's own invariants
("owner-vs-public copy", "catalog-copy-verbatim", each string defined once in `lib/share/copy.ts`)
— a readme that documents the discipline while its one violation still exists would be
embarrassing, so the code fix landed first (`6b5cd47`) and the readme's copy-constants invariant
describes a world with zero exceptions (`c0883b4`).

## What We Did (blow-by-blow)
1. **Read the follow-ups before touching anything.** Both same-day session docs whose tails
   pointed here were read in full — `ui-share-polish` (the deferred import, the exact shrink
   language for the comment) and `profile-share-yagni` (the estate census the readme's totals
   cite, its no-`.workflows/` verification, and its do-not-reflag list).
2. **Read the entire estate before writing a word.** All 17 estate files
   (`lib/profile` ×3, `components/profile` ×3, `lib/share` ×7, `components/share` ×4 — ~2,506
   lines) plus the readme's newest consumer `components/review/ScreenshotStrip.tsx`, in full.
   The module API notes and the invariant list are grounded in that read, not in symbol-name
   greps.
3. **Landed the drift closure first** (`6b5cd47`, 2 files, +5/−4):
   - `components/review/ScreenshotStrip.tsx`: `import { PHOTO_ZOOM_HINT } from '@/lib/share/copy'`
     and `<span className="text-[10px] font-medium text-ink-3">{PHOTO_ZOOM_HINT}</span>` replacing
     `<span className="text-[10px] font-medium text-ink-3">tap to zoom</span>` in `SheetSource`'s
     header line.
   - `lib/share/copy.ts`: the `PHOTO_ZOOM_HINT` doc comment's warning paragraph
     ("Worded identically to the hint `SheetSource` … already shows, so the two places … rather
     than each inventing a phrasing") rewritten as the construction note
     `ui-share-polish` specified: *"`SheetSource` in `components/review/ScreenshotStrip.tsx`
     renders this same constant, so the two places a screenshot can be tapped teach the same
     gesture in the same words by construction — there is no second string left to drift."*
4. **Wrote the combined readme** (`c0883b4`, 1 file, +374): NEW
   `lib/share/.workflows/package_readme.md` — placement decision below. Contents: the opening
   one-file contract blockquote; an Overview framing the estate as two feature pairs sharing one
   discipline (profile = who the runner is; share = what a stranger may see) built as a pure
   decision core with a thin I/O rim; **12 estate-wide invariants written once**; per-module API
   notes; the reverse-dependency table; and a Notes section carrying the yagni session's
   do-not-reflag list.
5. **Verified the readme claim-by-claim against the tree before committing.** Reverse-dep table
   built from repo-wide greps run this day: `app/robots.ts` and `app/admin/nina/page.tsx` import
   only `shareOrigin`; `app/r/[id]` imports `shareUrl` plus all three `components/share`
   components; `app/(public)/s/[token]` imports `readSharedRun` + `SHARE_OG_IMAGE*` + the
   `SharedPhotoView` type; `components/review` is the estate copy module's newest consumer since
   `6b5cd47`. Badge and record counts verified against the catalogs themselves
   (`lib/badges/catalog.ts`: 22 `badge(...)` entries; `lib/records/catalog.ts`: 11 `key:` rows),
   not trusted from doc comments.
6. **Gates, all green:**
   - `npx next typegen` then `npx tsc --noEmit` — exit 0.
   - `npx eslint` + `npx prettier --check` on both touched code files — clean; prettier on the
     new readme — clean.
   - Post-fix greps: `'tap to zoom'` appears ONLY as `lib/share/copy.ts:91`'s definition (the
     literal is gone from render code); `PHOTO_ZOOM_HINT` has exactly 2 consumer files
     (`PhotoInclusionList`, `ScreenshotStrip`).
   - `npx vitest run` on 16 suites (all `review.*`, `share.actions/bundle/config/project/rotate`,
     `profile.schema`, `badges.render`, `admin.shareToNina`): **319/319 passed**.
     `db.queries.*` suites deliberately NOT run — the diff touches no database code, and the
     repo has one production database.
7. **Committed both commits on the worker branch and stopped** — no merge, no push; the
   coordinator lands worker branches.

## Code / Design Details

**The before/after that matters** (`lib/share/copy.ts`, the comment shrink):

```diff
- * Worded identically to the hint `SheetSource` in `components/review/ScreenshotStrip.tsx` already
- * shows, so the two places a screenshot can be tapped teach the same gesture in the same words
- * rather than each inventing a phrasing. It sits on the status line because that line is already
+ * `SheetSource` in `components/review/ScreenshotStrip.tsx` renders this same constant, so the two
+ * places a screenshot can be tapped teach the same gesture in the same words by construction —
+ * there is no second string left to drift. It sits on the status line because that line is already
```

and the render side (`components/review/ScreenshotStrip.tsx`, `SheetSource`'s header line):

```diff
-          <span className="text-[10px] font-medium text-ink-3">tap to zoom</span>
+          <span className="text-[10px] font-medium text-ink-3">{PHOTO_ZOOM_HINT}</span>
```

**The readme's opening contract** (the blockquote a future readme-updater hits first):

> **IF YOU CAME LOOKING FOR A PER-DIRECTORY README, THIS IS IT.** One file deliberately covers
> all four directories; update THIS file and do not create a sibling under
> `lib/profile/.workflows/`, `components/profile/.workflows/`, or
> `components/share/.workflows/`. The estate is small (17 files, 2,506 lines at the 2026-09-12
> audit) … If a future split of this estate ever becomes real (a directory growing past ~10
> modules, or a third consumer of `lib/share` appearing outside these features), split the
> readme then — along the profile/share seam, not per directory.

**The 12 estate-wide invariants, written once** (spanning the directories, which is the reason
one file beats four): INVARIANT A/B; the two-narrowings rule; named-fields-no-spreads;
hand-written view types; owner-vs-public copy; catalog-copy-verbatim; URL-held panel selection;
R-15 rotate-not-proxy; the pure/server-only triad; R-27-by-omission; sanity-not-coaching; and
the copy-constants discipline — which as of `6b5cd47` has zero exceptions.

**Volatile counts, stamped with their 2026-09-12 measure date** per the volatile-numbers rule:
17 files / 2,506 lines; 68→61 export sites (cited FROM the same-day yagni audit, with the
citation named, not re-measured badly); 22/22 copy constants consumed; 22 badges; 11 records;
319 tests passing across the 16 run suites today.

## Decisions & Trade-offs
- **ONE file at `lib/share/.workflows/package_readme.md`, not four siblings.** None of the four
  dirs had a `.workflows/` at all before today (verified by the same-day
  `profile-share-yagni` audit). `lib/share` chosen as home because it is the estate's hub —
  the copy/config discipline lives there, and it is the most-imported of the four. Four
  per-directory readmes would be four half-empty files, and the rules that matter span the
  directories, so a rule documented four times would drift four ways.
- **The one-file contract is written INTO the file**, not left as session-doc folklore: the
  readme opens by telling the next readme-updater to update it and not create a sibling, and
  pre-answers "when may you split?" (only when the estate genuinely splits — a directory
  growing past ~10 modules, or a third `lib/share` consumer outside these features — and then
  along the profile/share seam, not per directory).
- **Cite big numbers, don't re-derive them badly.** The estate totals (17/2,506/68→61) are
  cited FROM the same-day yagni audit — measured hours earlier by a session whose whole job was
  the census — rather than re-counted with a worse method; the counts this session COULD check
  cheaply and authoritatively (badges, records, copy constants, tests) were measured directly
  against the catalogs and the suite run.
- **Two of the readme's own draft claims were self-caught and corrected** (worth recording as
  the verification culture, not despite it):
  - The reverse-dep tests row initially listed **9 suites as estate importers** — grep showed
    only **4 import estate modules directly** (`profile.schema`, `share.project`,
    `share.config`, `badges.render`); the others exercise the estate through collaborators.
    The row was corrected to the measured 4 before commit.
  - Badge/record counts were **verified against `lib/badges/catalog.ts` (22 `badge(...)`
    entries) and `lib/records/catalog.ts` (11 keys)** rather than trusted from doc comments —
    the same measure-don't-trust rule the readme itself preaches.
- **The code fix landed before the doc** so the readme's copy-constants invariant describes a
  world with zero exceptions. Landing the readme first would have meant documenting a discipline
  with a known live violation, then fixing it after — doc and tree out of sync for the
  lifetime of one commit interval.
- **Scope discipline on tests**: 16 targeted suites rather than the full sweep — the diff is
  one render-path constant swap plus a new markdown file; the 16 cover the review render path,
  the whole share surface, profile schema, badges rendering, and the admin share-to-Nina action.
  `db.queries.*` deliberately not run: no database code touched, and the repo's one database is
  production.

## Follow-ups & YAGNI notes
- **The ShareButton/ShareLinkPanel consolidation candidate** (near-identical select-on-focus
  link inputs, named by the yagni audit) is now ALSO recorded in the readme's Notes, so it
  survives without anyone finding this session doc.
- **The readme's Notes section carries the yagni session's do-not-reflag list** —
  `SHARE_SHOWS_*` test-pinned, `avgHrPctMax` exported-for-test, `profileWriteSchema` test-only
  decision — so a future sweep starts there instead of re-litigating recorded keeps.
- **The combined readme is discoverable only from `lib/share`.** That is the accepted cost of
  one-file placement, and the failure signal is defined in advance: if a future session's
  readme-updater creates a per-dir sibling in one of the other three directories, that is the
  one-file contract failing — reconcile by merging the sibling's content in and deleting it,
  not by letting both live.
- **The yagni audit's split triggers are now the readme's own.** A directory growing past ~10
  modules, or a third `lib/share` consumer appearing outside these features, is when the
  profile/share seam split becomes real — the readme states this so the decision doesn't depend
  on anyone remembering this session.

## Appendix

**Files touched:**
```
components/review/ScreenshotStrip.tsx |  3 ++-
lib/share/copy.ts                     |  6 +++---
lib/share/.workflows/package_readme.md | 374 ++++++++++++++++++++++++++++++++++++++++++
3 files changed, 379 insertions(+), 4 deletions(-)
```
(two commits: `6b5cd47` +5/−4, `c0883b4` +374)

**Verification performed:** `npx next typegen` + `npx tsc --noEmit` exit 0; `npx eslint` +
`npx prettier --check` clean on both touched code files and prettier clean on the new readme;
post-fix greps — `'tap to zoom'` only at `lib/share/copy.ts:91` (definition), `PHOTO_ZOOM_HINT`
exactly 2 consumer files (`PhotoInclusionList`, `ScreenshotStrip`); `npx vitest run` on 16
suites → 319/319 passed (db.queries.* deliberately skipped — no DB code touched, one production
database); badge count measured against `lib/badges/catalog.ts` (22 `badge(...)` entries), record
count against `lib/records/catalog.ts` (11 `key:` rows); reverse-dep table from repo-wide greps
of every estate import site.

**Git evidence chain:** `ui-share-polish` session doc (found the literal twin, deferred the
import with the exact "shrink to a note" language this session executed);
`profile-share-yagni` session doc + its commit `8527ba8` (the estate census the readme cites;
verified no `.workflows/` existed in any of the four dirs); `6b5cd47` (drift closure);
`c0883b4` (the readme); readme header states it was grounded against the tree at `6b5cd47`.

**Session identity:** worker session `pkg-readme-profile-share`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-pkg-readme-profile-share`; final commit `c0883b4`; merged
(commit `a2bc44f`).
