# Token-Maxxing Session — 2026-09-13: Nina ImagePrefs/Tuning Doc-Drift & Dead-Code Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `nina-imageprefs-tuning`) in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`), pre-assigned one idea verbatim with no
  menu of candidates offered: deeply read `lib/nina/imageprefs.ts` (978 lines) and
  `lib/nina/tuning.ts` (880 lines) for dead code and doc drift, with a specific instruction to
  cross-check `tuning.ts`'s instructor-persona comments (`ninaActiveRelationship`) against the
  now-fully-landed nina-instructor-character set, since `imageprefs.ts` had never been audited
  at all.
- **Concrete changes:** one commit already on this branch, `09e99cb` ("docs(nina): fix
  imageprefs.ts doc-drift left by phase 7's wardrobe retire") — 2 files changed, 16
  insertions, 13 deletions, comment-only. Fixed four spots in `lib/nina/imageprefs.ts` and
  `tests/nina.imageprefs.test.ts` that still named the deleted `NINA_WARDROBE_MAX` constant
  and `coerceNinaWardrobe` function (including a phantom `lib/nina/tuning.ts:684-689`
  line-range citation into code that no longer exists) as if they were still live in
  `lib/nina/tuning.ts`.
- **Real value delivered:**
  - **Found and fixed real, verified doc drift that the assigned idea's hunch about
    `tuning.ts` didn't actually predict** — the drift was in `imageprefs.ts`, the file
    explicitly flagged as "never audited," not in `tuning.ts`, the file flagged as the likely
    drift site. `git log -S NINA_WARDROBE_MAX -- lib/nina/tuning.ts` pinned the exact origin:
    commit `b7a1233` ("refactor(nina): retire nina_tuning.wardrobe (phase 7)", 2026-09-08, 5
    days before this session) deleted both symbols from `tuning.ts` when the
    `nina_tuning.wardrobe` column moved to `nina_image_prefs.wardrobe` — but that commit's diff
    never touched `imageprefs.ts`, so its comments describing the field "moving house" kept
    citing the now-dead symbol and a line range that no longer exists, for five days straight.
  - **Correctly reported a null result on the assigned idea's actual named hypothesis** rather
    than manufacturing a finding to justify the session: every load-bearing cross-file citation
    in `tuning.ts` (`ANGER_LADDER`, `ANGER_FLOOR_BY_BAND`/`ANGER_CEILING_BY_BAND`,
    `NINA_RELATIONSHIP_BLOCKS`, `BODY_REPEALED_BY`/`THREAT_REPEALED_BY`, `NINA_NOT_A_DOCTOR`,
    `NEVER_SAY`, `JAKARTA_SLANG`/`JAKARTA_REGISTER`, `NINA_EXPERTISE`, and the instructor-gate
    `ninaActiveRelationship`) still holds after the 2026-09-12 `persona.ts` barrel split and
    the nina-instructor-character set's landing. The split kept `persona.ts` a pure re-export
    barrel specifically so these citations wouldn't rot, and `instructor.ts` correctly gates
    through `ninaActiveRelationship(tuning) === 'instructor'` rather than reading
    `tuning.relationship` directly — matching `tuning.ts`'s own R4 enable-map discipline. This
    negative result is reported as the finding it is, not hidden because it wasn't a bug.
  - **A fourth drift spot caught in the tests, not just the source**: a comment in
    `tests/nina.imageprefs.test.ts` described the wardrobe-column retirement in future tense
    ("which phase 7 deletes") five days after phase 7 had already landed — the kind of doc rot
    that a source-only grep would miss.
  - **A clean dead-code sweep across both files**, cross-checked two ways: manual call-site
    greps for every exported symbol in `tuning.ts` and `imageprefs.ts` (roughly 30 symbols
    total, spanning validators, coercers, band/dial scoring, and the photo-ref/template/focus
    spec surfaces of `imageprefs.ts`), and `npm run knip` — the repo's adopted dead-export
    instrument per prior sessions' convention — which reported zero findings touching either
    file. The net finding: the repo's own discipline (R4's enable-map spread, R10's derived key
    lists, the 2026-09-12 knip sweep) is actually preventing dead exports here, not just
    claiming to.
- **Branch:** `token-maxxing-2026-09-13-nina-imageprefs-tuning`
- **Merge status:** on branch, not merged — this is a WORKER session in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`); the coordinator owns merging worker
  branches to main, not the worker itself.
- **Approx token burn:** moderate — two full-file deep reads (881 + 979 lines) plus their
  cross-referenced modules (`persona.ts` barrel and its 9-file split, `lib/db/schema/nina/config.ts`),
  a `git log -S` history reconstruction to pin the drift's exact origin commit, a call-site
  grep sweep across roughly 30 exported symbols, a `knip` cross-check, and three full
  verification gates (vitest, prettier, tsc). 🔥

## Context & Motivation
This was a WORKER session in the 2026-09-13 token-maxxing fan-out, coordinated by
`tokenmax-orch-2026-09-13`. Unlike a solo session that generates its own menu of candidate
ideas, this worker received one idea pre-assigned by the coordinator verbatim: deeply audit
`lib/nina/imageprefs.ts` and `lib/nina/tuning.ts` for dead code and doc drift, with a specific
lead to chase — `tuning.ts` gates the instructor persona via `ninaActiveRelationship`, and the
nina-instructor-character set (which touched `tuning.ts` per its own phase-1 plan) had just
fully landed, making `tuning.ts` a plausible doc-drift site sitting at the center of a
recently-landed feature. `imageprefs.ts` was flagged separately as never having been audited
at all.

The coordinator's framing put the suspicion on `tuning.ts` specifically because of the
instructor-persona landing. That hypothesis turned out to be false on inspection — but the
session didn't stop at "hypothesis not confirmed, nothing to report." It kept reading, and the
drift it actually found was real, just not where the assigned idea's hunch pointed: in
`imageprefs.ts`, in comments describing a field (`wardrobe`) that had migrated from
`nina_tuning` to `nina_image_prefs` five days earlier in an unrelated phase-7 commit that never
touched the file whose comments described the move.

## What We Did (blow-by-blow)
1. **Read both files in full**: `lib/nina/tuning.ts` (881 lines) and `lib/nina/imageprefs.ts`
   (979 lines), plus their cross-referenced modules — `lib/nina/persona.ts` (now a pure
   re-export barrel, split into `lib/nina/persona/{anger,appearance,bands,identity,instructor,
   never-say,tuning-blocks,verbosity,voice}.ts` on 2026-09-12) and `lib/db/schema/nina/config.ts`
   (to confirm the current home of the fields these files reference).
2. **Verified every load-bearing cross-file citation in `tuning.ts`** against the current
   tree: `ANGER_LADDER`, `ANGER_FLOOR_BY_BAND`/`ANGER_CEILING_BY_BAND`,
   `NINA_RELATIONSHIP_BLOCKS`, `BODY_REPEALED_BY`/`THREAT_REPEALED_BY`, `NINA_NOT_A_DOCTOR`,
   `NEVER_SAY`, `JAKARTA_SLANG`/`JAKARTA_REGISTER`, `NINA_EXPERTISE`, and the instructor-gate
   `ninaActiveRelationship` as consumed by `lib/nina/persona/instructor.ts`'s `isInstructor`,
   `INSTRUCTOR_COACHING`, and `ninaInstructorCoachingBlock`. Confirmed `instructor.ts` gates
   through `ninaActiveRelationship(tuning) === 'instructor'` rather than reading
   `tuning.relationship` directly — the same enable-map discipline `tuning.ts` itself follows
   (its R4 rule). Conclusion: none of `tuning.ts`'s instructor-relevant documentation is stale.
   This null result is reported as the finding it is, not discarded for not being a bug.
3. **Found genuine, verified doc drift in `lib/nina/imageprefs.ts` instead** — three
   docstrings there still named `NINA_WARDROBE_MAX` and `coerceNinaWardrobe` as if they were
   live symbols in `lib/nina/tuning.ts`, including a phantom line-range citation
   `lib/nina/tuning.ts:684-689` pointing at code that no longer exists there.
4. **Pinned the drift's exact origin** via `git log -S NINA_WARDROBE_MAX -- lib/nina/tuning.ts`:
   commit `b7a1233` ("refactor(nina): retire nina_tuning.wardrobe (phase 7)", 2026-09-08, five
   days before this session) deleted both `NINA_WARDROBE_MAX` and `coerceNinaWardrobe` from
   `tuning.ts` as part of retiring the `nina_tuning.wardrobe` column — the field moved to
   `nina_image_prefs.wardrobe`, confirmed present in `lib/db/schema/nina/config.ts`. That
   commit's diff never touched `imageprefs.ts`, so `imageprefs.ts`'s own comments describing
   the field "moving house" there kept citing the now-dead source symbol and a line range that
   no longer resolves to anything, for five days.
5. **Found a fourth drift spot in the test suite**: a comment in
   `tests/nina.imageprefs.test.ts` described the same phase-7 deletion in future tense
   ("which phase 7 deletes") — five days after it had already happened.
6. **Fixed all four spots** — comment-only changes, reworded to past tense, the dead
   `NINA_WARDROBE_MAX` name-drop and phantom line-range replaced with either a prose
   description of the retired constant's argument or a `git log -S NINA_WARDROBE_MAX`
   provenance citation. No behavior change.
7. **Ran a dead-code hunt across both files' exported surface**: grepped call-sites for every
   exported symbol in `tuning.ts` (`isNinaTrait`, `isNinaRelationship`, `isNinaDial`,
   `isNinaTuningKey`, `NINA_ADDRESS`, `NinaAddressVocabulary`/`Source`,
   `NINA_TUNING_RELATIONSHIP_KEY`, `NINA_ENABLED_DEFAULTS`, `ninaDialScore`/`ninaTraitScore`/
   `ninaActiveRelationship`, `NINA_BAND_WIDTH`, `NinaBand`, `isNinaKeyEnabled`,
   `coerceNinaEnabled`) and `imageprefs.ts` (`NINA_IMAGE_REFERENCE_ID_MAX`,
   `NinaPhotoRefPage`/`Bounds`, `ninaPhotoRefBounds`, `mergeNinaPhotoRefs`,
   `NinaImageTextSpec`, `NINA_IMAGE_TEXT_SPECS`, `NinaImageModelSpec`,
   `NINA_IMAGE_MODEL_SPECS`, `NINA_IMAGE_TEMPLATE_REQUIRED_KEYS`, `validateNinaImageTemplate`,
   `coerceNinaImageTemplate`, `NinaImagePrefsWrite`, `NINA_IMAGE_WARDROBE_MAX`,
   `NINA_PHOTO_REF_PAGE_SIZE`/`SCAN_MAX`, `NinaImageFocusSpec`, `NINA_IMAGE_FOCUS_SPECS`,
   `ninaImageFocusKeysOn`). Every symbol had at least one real caller outside its own file and
   its own test.
8. **Cross-checked with `npm run knip`**, this repo's adopted dead-export instrument per prior
   session convention — zero findings touching either `tuning.ts` or `imageprefs.ts`. Net
   finding: no dead code in either file.
9. **Ran the full verification gate**: `npx vitest run tests/nina.imageprefs.test.ts
   tests/nina.tuning.test.ts` — 2 files, 89 tests, all passing; `npx prettier --check` on the
   two changed files — clean; `npx tsc --noEmit -p .` — only pre-existing, unrelated errors
   (missing Next.js `PageProps`/`LayoutProps` typegen in `app/**`, a known symlinked-
   `node_modules` artifact per this repo's prior sessions, nowhere near `lib/nina/*`).
10. **Committed the fix as `09e99cb`** ("docs(nina): fix imageprefs.ts doc-drift left by
    phase 7's wardrobe retire").

## Code / Design Details
The drift pattern was a classic "the code moved, the comment describing the move didn't":
phase 7 (`b7a1233`) deleted `NINA_WARDROBE_MAX`/`coerceNinaWardrobe` from `tuning.ts` as the
*source* of a field retirement, but the *destination* file's comments — written earlier to
describe where the field was headed — kept citing the source symbol by name and by line range
after the source itself stopped existing. This is a variant of doc drift that a same-file
"does this comment still describe the code around it" check would never catch, because the
stale comment and the code it describes now live in *different* files, and only the deleting
commit's diff would reveal the mismatch — which is exactly why `git log -S` (pickaxe search)
was the right tool to pin it, rather than a plain grep for the dead name (which finds the
*symptom* but not the *when* or the *why*).

The fourth spot — the test file's future-tense comment — is a reminder that doc drift audits
should sweep test comments alongside source comments; a phase-completion comment written
correctly in the plan-in-progress tense becomes silently wrong the moment the phase lands, and
nothing except a reader (or an audit like this one) will ever notice.

## Decisions & Trade-offs
- **Reported the assigned idea's named hypothesis (`tuning.ts` doc drift from the instructor
  landing) as a null result rather than searching harder for a finding to justify it.** The
  session had a specific lead to chase and it came up clean — every citation checked out. That
  negative result is stated plainly rather than papered over, since a false "found drift" would
  have been worse than an honest "didn't find any here."
- **Followed the drift where the evidence actually led (`imageprefs.ts`) rather than confining
  the session to the file the assigned idea's hunch pointed at (`tuning.ts`).** The assignment's
  own text flagged `imageprefs.ts` as "never audited," which is exactly where the real,
  five-day-old drift was sitting.
- **Fixed the drift with a prose description or a `git log -S` citation, not by inventing a new
  fake line-range.** A dangling line-range citation into deleted code is worse than no citation
  at all; the fix either describes the retired constant's argument in prose or points to the
  git history command that recovers its provenance, both of which stay accurate regardless of
  future line shuffles.
- **Comment-only changes — no behavior change, no test logic change** beyond the one comment
  fixed in the test file. This keeps the fix low-risk and easy for the coordinator to review
  and merge without re-deriving behavior correctness.
- **Did not touch `tuning.ts` at all**, since nothing in it was actually stale — resisting the
  pull to "do something" to the file the assigned idea specifically named.

## Follow-ups & YAGNI notes
- **Deliberately NOT done:** no changes to `lib/nina/tuning.ts` (nothing stale found there); no
  removal of any exported symbol from either file (both dead-code sweeps came back clean); no
  merge to main (worker session; coordinator's job); no additional commits beyond the one
  doc-drift fix already on the branch.
- **A general pattern worth naming for future audits:** a field/constant "moving house" between
  two files is a doc-drift risk specifically in the *destination* file's comments, not just the
  source file the retiring commit touches — because the retiring commit's diff, by definition,
  never lands in the file whose comments describe the move. A future doc-drift sweep after any
  column/field migration should check both ends, not just the file that got the deletion.

## Appendix

**Commit on this branch (worker, not yet merged):**
```
09e99cb docs(nina): fix imageprefs.ts doc-drift left by phase 7's wardrobe retire
```
2 files changed, 16 insertions(+), 13 deletions(-): `lib/nina/imageprefs.ts`,
`tests/nina.imageprefs.test.ts`.

**Verification performed:** `npx vitest run tests/nina.imageprefs.test.ts
tests/nina.tuning.test.ts` — 2 files, 89 tests, all passing; `npx prettier --check` on the two
changed files — clean; `npx tsc --noEmit -p .` — only pre-existing unrelated `app/**` typegen
errors, none touching `lib/nina/*`; `npm run knip` — zero findings touching either audited
file; manual call-site greps across roughly 30 exported symbols spanning both files, each with
at least one real external caller and its own test coverage.

**Origin commit for the drift, recovered via pickaxe search:** `git log -S NINA_WARDROBE_MAX --
lib/nina/tuning.ts` → `b7a1233` ("refactor(nina): retire nina_tuning.wardrobe (phase 7)",
2026-09-08).

**Session identity:** worker session `nina-imageprefs-tuning`, spawned by coordinator
`tokenmax-orch-2026-09-13`; branch `token-maxxing-2026-09-13-nina-imageprefs-tuning`; worktree
`/home/miftah/.worktrees/run-insights/tokenmax-2026-09-13-nina-imageprefs-tuning`; commit
`09e99cb`; not merged — the coordinator lands worker branches.

**Related sessions:** `2026-09-12-nina-persona-split.md` (the persona.ts monolith split into
9 modules behind a barrel, whose barrel-integrity this session's citation check depended on);
the nina-instructor-character plan set (whose phase-1 landing motivated the assigned idea's
`tuning.ts` hypothesis, which this session checked and found accurate); the same day's sibling
worker `2026-09-13-nina-turnflight-yagni.md` (a concurrent `lib/nina`/`components/nina` worker
under the same `tokenmax-orch-2026-09-13` coordinator).
