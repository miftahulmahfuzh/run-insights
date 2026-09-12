# Token-Maxxing Session — 2026-09-12: Scripts Package-Readme Verification Pass

> **A coordinator-assigned worker session under `tokenmax-orch-2026-09-12`** —
> the **seventh and last** of the day's seven package-readme passes. The
> six-worker fan-out took the root readme plus the five sub-package readmes
> (`lib/nina`, `lib/db`, `lib/admin`, `components/admin`, `components/nina`)
> and deliberately left `scripts/` for its own pass. The idea was
> pre-assigned rather than self-picked, and — unlike the six siblings, which
> shrank 1000–3700-line docs down to 557–890 — this target was **born
> compact**: 226 lines, written the day before. So the mandate resolved to
> the compaction *discipline* rather than the shrinking: **verify every
> claim against the tree**, and close the set.

## 🎯 Achievement / End Result

- **Goal of the burn:** (assignment, verbatim) "Compact
  `scripts/.workflows/package_readme.md`, the last of 7 package_readme.md
  files not yet compacted in the 2026-09-12 pkg-readme-\* trilogy — closes
  the set for consistency across all packages." The compact-half of that
  mandate turned out to be already satisfied by the 2026-09-11 session that
  wrote the file; the verify-half was not — and the verify-half is where the
  value was.
- **Concrete changes:** one commit, `e8d5f48` — *"docs(scripts): verification
  pass on package_readme — every claim re-checked, 7 corrections"* —
  **1 file changed, 55 insertions(+), 27 deletions(-); the file went
  226 → 254 lines (net +28)**. `npx prettier --check` passes on it.
  Docs-only diff: no test, typecheck, or migration surface touched.
- **Real value delivered:**
  - **The set is closed.** All seven `package_readme.md` files now carry a
    same-week verification pass. This was not ceremonial: the sixth
    sibling's own follow-up section had asked for exactly this pass, and
    the root sibling's doc had recorded that `scripts/package_readme.md`
    "(226 lines, freshly expanded the day before) had no worker and did not
    need one" — half right, as it turns out. It did not need a *shrinking*
    worker. It needed a verification worker.
  - **Four real drifts found and fixed — seven corrections, five themes.**
    The headline: the doc's citation of the perceptual twin-gate constants'
    second home was **pointing at the wrong file**. It said the constants
    live in `nina-dedupe-plan.mjs` AND `lib/nina/perceptualSign.ts`; they
    actually live in **`lib/nina/perceptual.ts`** (the write-time twin
    check, born `2df323f`) — `perceptualSign.ts` is the *signer* and never
    held them, proven by `git log -S PERCEPTUAL_MAX_DHASH --` against that
    path returning **empty**. A wrong "these must move together" citation
    is worse than none: the next loosening would have edited a file that
    silently would not propagate.
  - **The client-secret guard's exemption list grew a third member the doc
    had never heard of**: `lib/nina/vision.test.ts` (added same-day in
    `78f1a9c` — a colocated test's dummy-key default that broke
    `ci:client-secret-guard` on every push until exempted). The doc also
    over-claimed "`NEXT_PUBLIC_` nowhere at all"; it is now scoped to
    app/lib/components — where the guard actually scans.
  - **The data-layer guard's allowlist is named in full.** "getRunByShareToken
    remains the ONLY unscoped read" mirrored the guard's own success line,
    but the guard's allowlist holds **three** names; the doc now also names
    `isUniqueViolation` (pure predicate) and `listActiveUserIds` (F07 cron,
    ids only), so doc and source can be compared without a puzzle.
  - **The openrouter guard's prose-defense recorded with both its
    mechanisms.** Its grep is scoped to source extensions (2026-09-12,
    after an adopted plan copy under `lib/db/.workflows/plan/` tripped the
    bare grep by mentioning the name in prose). The doc now records this
    instance of the prose-defense law and states the law's **two** actual
    mechanisms — comment stripping OR extension scoping — instead of one.
  - **Precision fixes:** `seed-demo.mjs`'s npm entries spelled as the three
    that actually exist (`capture:seed` / `capture:purge` /
    `capture:status`); the worker's hosting workflow named
    (`.github/workflows/nina-image.yml`); and a **Notes section added**
    carrying the one-paragraph-per-wave anti-re-inflation policy
    (transplanted from the root readme's rule) plus the doc's history
    (2026-09-11 origin, 2026-09-12 pass).
  - **The audit's other half is a long verified-true ledger** (below): 22
    npm-script mappings, every guard rule, every flag default, every dated
    production measurement, both backfills, the capture toolkit's numbers —
    all re-checked and left standing. A verification pass that only reports
    its corrections overstates its own drift rate.
  - **Two meta-lessons recorded for the next pass:** a `head -12` truncation
    nearly wrote off a *true* claim (verification greps need `grep -c` or
    no head), and `git log -S` works as a one-command negative proof ("was
    the constant ever in that file? — no").
- **Branch:** `token-maxxing-2026-09-12-scripts-readme-compact`
  (coordinator-assigned worker worktree).
- **Merge status:** merged (commit `ce484ff`)
- **Approx token burn:** moderate — the doc itself is small (226 lines), but
  it was read against its entire enforcement surface: all seven CI guards
  in full rather than grepped, every npm mapping, every flag default, every
  cited commit, plus a both-way file inventory. Small target, wide
  cross-check. 🔥

## Context & Motivation

The 2026-09-12 pkg-readme campaign ("trilogy" is a misnomer that stuck — it
was one fan-out, six workers) shrank the repo's six largest
`package_readme.md` files in parallel, each session compacting *and*
verifying. `scripts/` was deliberately left out of that fan-out, for a
reason the root worker wrote down: the directory's readme had been expanded
from 7 to 226 lines only the day before (2026-09-11, commit `b049bb7`, the
scripts-package-hygiene session — the same session that reconstructed
P1-SC-A000's closure and measured the dedupe state), so it was the one
readme in the repo that could not plausibly be bloated yet.

But "not bloated" and "not stale" are different claims, and the second one
was untested. The file's subject is the most enforcement-dense directory in
the repo — seven `check-*.mjs` CI guards live there — and guard prose is
the densest claim surface a readme can carry: every exemption list, every
allowlist, every "must move together" pairing is a statement about source
that can drift the day after it is written. In fact one of the drifts this
pass found had been introduced *that same morning* (`78f1a9c` adding the
third client-secret exemption): a day-old doc was already one exemption
behind the guard it documents.

The coordinator assigned this as the seventh and closing worker. The
stale-claim harvest, not the line count, was the value from the start —
which is good, because the line count went **up**.

## What We Did (blow-by-blow)

1. **Read the target and named the shape difference.** 226 lines against
   siblings that went 3767 → 557, 1950 → 1291, 1300 → 890, 1359 → 769,
   1098 → 657, 1017 → 713. The honest comparison is not line count; it is
   whether every line is true. That reframe — corrections, not shrinking —
   drove everything after it.

2. **Read all seven `check-*.mjs` CI guards in full, not grepped.** Guard
   entries make the densest claims in the doc, and a grep proves a name
   exists, not that the doc's description of the *rule* matches the rule.
   Reading them whole is what surfaced the third client-secret exemption,
   the three-name data-layer allowlist, and the openrouter guard's
   extension scoping — none of which a name-grep would have flagged, since
   every name in the doc does exist.

3. **Checked every npm-script mapping against `package.json`:** 22
   mappings, all verified, plus two "no npm entry" negative claims —
   negatives checked as claims in their own right, not skipped.

4. **Reconciled the file inventory both ways:** every file the doc names
   exists (no ghost citations), and all **27** files under `scripts/` +
   `scripts/capture/` are documented (no undocumented files). One pass in
   each direction; either one alone can miss its half of the failure mode.

5. **Grepped every flag default, named constant, quoted number, and cited
   commit.** Flag defaults (`--min-age-hours` 24, `--allow-empty-db`,
   `--delete`), the capture toolkit's numbers (27 specs, 26+1 runs,
   390x844, the 8 MB budget that FAILS, 15/17 FKs, dithering dropped ~20%,
   `mpdecimate` kept, 560px/q80), and commit citations resolved via
   `git cat-file -t c2c2ca5` (the dedupe `--apply` landing the doc hangs
   its "has been run" claim on).

6. **Re-proved the negative claims.** `grep` for `@/scripts` imports across
   `lib/ app/ components/` returned empty — "nothing here is imported by
   the app" stands. `ls scripts/*.ts` shows the worker as the only `.ts`.
   `.github/workflows/nina-image.yml` exists — the GitHub-Actions hosting
   claim is real. (This last one was a precision fix: the doc named no
   workflow file at all.)

7. **Spot-checked the zero-import rule on all five named lib modules.**
   Exactly one (`lib/records/catalog.ts`) imports anything — a type-only
   import, which is precisely what the strip-types rule allows. The rule's
   five worked examples all hold.

8. **Dated the one drift where provenance mattered, with a negative
   proof.** `git log -S PERCEPTUAL_MAX_DHASH -- lib/nina/perceptualSign.ts`
   is **empty** — the constant was never in that file, at any commit. That
   single command converted a maybe-drift ("the doc might be out of date")
   into a definite citation fix ("the doc named the wrong sibling, and
   always had"), and it is why the correction could also record the lib
   side's fifth constant (`PERCEPTUAL_MAX_SIG16`) that the sweep side
   lacks — the "must move together" pairing needed its true other member
   named, not just the false one struck.

9. **Hit the pass's own near-miss, and recorded it.** The first grep of
   `nina-memory-reap.mjs` for `replyToId` showed no hit — because
   `head -12` truncated before section 4 where it lives. The doc's
   "reported-but-never-deleted" claim was true all along; only the grep's
   window was wrong. Corrected method (count, don't sample) applied to the
   remaining greps; lesson written down in Follow-ups.

10. **Applied the seven corrections and added the Notes section**, kept
    every verified-true claim standing, ran `npx prettier --check` (passes),
    and committed as `e8d5f48` with the correction list spelled out in the
    body so the pass is auditable from the commit message alone.

## Code / Design Details

**The corrections, before → after:**

| # | Doc said | Tree says |
|---|----------|-----------|
| 1 | Raw `process.env.<SECRET>` exempt in exactly two files (`lib/env.ts`, `lib/db/index.ts`) | **Three** — `lib/nina/vision.test.ts` joined same-day (`78f1a9c`, a colocated test's dummy-key default that broke `ci:client-secret-guard` on every push until exempted) |
| 2 | `NEXT_PUBLIC_` appears "nowhere at all" | Scoped claim: nowhere in **app/lib/components** — the directories the guard actually scans |
| 3 | Twin-gate constants live in `nina-dedupe-plan.mjs` **and `lib/nina/perceptualSign.ts`** | They live in `nina-dedupe-plan.mjs` **and `lib/nina/perceptual.ts`** (the write-time twin check, born `2df323f`); `perceptualSign.ts` is the signer and never held them (`git log -S` empty); the lib side carries a fifth constant, `PERCEPTUAL_MAX_SIG16`, the sweep side lacks |
| 4 | "`getRunByShareToken` remains the ONLY unscoped read" | The allowlist holds **three** names; the doc now names `isUniqueViolation` (pure predicate) and `listActiveUserIds` (F07 cron, ids only) beside it |
| 5 | (openrouter guard described by name-grep behavior alone) | The grep is **scoped to source extensions** (2026-09-12, after an adopted plan copy under `lib/db/.workflows/plan/` tripped the bare grep by mentioning the name in prose); the prose-defense law's **two** mechanisms — comment stripping OR extension scoping — both stated |
| 6 | `seed-demo.mjs`'s npm entries loosely implied | The three that exist, spelled: `capture:seed` / `capture:purge` / `capture:status` |
| 7 | Worker's hosting unnamed; no policy note | `.github/workflows/nina-image.yml` named; **Notes section added** — one-paragraph-per-wave policy (transplanted from the root readme's anti-re-inflation rule) + doc history (2026-09-11 origin `b049bb7`, 2026-09-12 pass `e8d5f48`) |

**Correction 3 is the one with teeth.** The twin-gate constants
(`PERCEPTUAL_MAX_DHASH` and friends) are documented in the dedupe plan
script and in *one* lib file, with an explicit "these must move together"
contract — loosen one side, you must loosen the other or the write-time
check and the sweep check diverge. The doc named the wrong lib file. The
failure it would have caused is silent by construction: the edit lands, the
named file contains a similarly-shaped constant block (the signer does
carry hash-adjacent code), prettier passes, nothing breaks — and the real
sibling keeps the old threshold. `git log -S` is what made the fix
confident rather than plausible: an empty history for the constant in the
cited path means the doc was wrong on the day it was written, not merely
overtaken by events. The lib side's fifth constant
(`PERCEPTUAL_MAX_SIG16`) is now recorded too, because the true pairing is
*asymmetric* — a fact the old text could not express, since it thought the
pairing was a different pair.

**Correction 5's law is worth restating, because the readme now carries it
as a rule with two arms:** string guards that scan for a name must defend
against prose that mentions the name — either by stripping comments (the
`docs(scripts)`-style commit bodies are full of identifier mentions) or by
scoping the grep to source extensions. The openrouter guard now does the
second, after an adopted plan copy under `lib/db/.workflows/plan/` tripped
the bare grep by discussing the guard in prose. The doc previously stated
only one mechanism, which would have sent the next guard-author to add
comment-stripping to a guard that deliberately doesn't use it.

**The audit method, as a reusable table** (the repeatable part of this
session — each claim class gets a method suited to it, and the methods that
read whole files are reserved for the claim classes that need them):

| Claim class | Method | Found |
|-------------|--------|-------|
| CI-guard rules (densest prose) | Read all seven `check-*.mjs` **in full** | corrections 1, 4, 5 |
| npm-script mappings | `package.json` diff-by-eye, 22 + 2 negatives | correction 6 |
| File inventory | Both directions: doc→disk and disk→doc (27 files) | correction 7 (workflow file) |
| Flag defaults / constants / numbers | Targeted greps in defining source | all held |
| Cited commits | `git cat-file -t` | `c2c2ca5` held |
| Negative claims | Re-run the proof, don't trust the prose | all held |
| Zero-import rule | Spot-check every named example (5 lib modules) | held (1 type-only import) |
| "Was it ever there?" | `git log -S <const> -- <path>` | correction 3 |

**The verified-true ledger** (the audit's other half — recorded so the next
pass doesn't re-litigate): all 22 npm-script mappings; every guard rule —
f08's single-waiver anchor `PaceHrChartInner.tsx`, f11's closed four-file
route set and its loading.tsx ancestor check, llm-payload's exactly-nine
entry points, badge-art's §1 guard reuse / decks.json from decks.py /
SHA-256 manifest checks / empty-deck pass; every flag default
(`--min-age-hours` 24, `--allow-empty-db`, `--delete`); the memory-reap
replyToId-reported-never-deleted claim; the shortcuts grammars and the
`🫦` row; profpic's un-current-first partial-unique-index order; both
backfills' key claims; the capture toolkit's numbers (27 specs, 26+1 runs,
390x844, the 8 MB budget that FAILS, 15/17 FKs, dithering dropped ~20%,
`mpdecimate` kept, 560px/q80); db-smoke's two branches; vercel-env-push's
branch-positional trap; and every dated production measurement, kept honest
by its date stamp (48/52, 17, 25/3, 78.2 s).

## Decisions & Trade-offs

- **Corrections over shrinking — the file got *longer*.** +28 net lines on
  a session assigned as a "compaction." The alternative (forcing the file
  down to match the siblings' deltas) would have meant cutting verified
  content to hit a number. The doc was born at the right size; it was not
  born entirely right. The siblings shrank because they had twelve-entry
  changelogs and per-phase narratives; this file never did — its 2026-09-11
  author already followed the discipline. The set-closure value was real
  regardless: the sixth sibling's follow-up asked for exactly this pass.
- **The verified-true ledger lives in this session doc, not the readme.**
  The readme stays lean recurring context; a per-claim audit table is
  evidence, not context — loading it on every scripts task would re-inflate
  the doc by another form. The commit message carries the corrections; this
  doc carries the ledger.
- **Name the law's both mechanisms, not the one this guard uses.** For the
  prose-defense rule (correction 5), the cheap edit was to describe the
  openrouter guard's own scoping and stop. That would leave the doc
  implying comment-stripping isn't part of the same law — and some guards
  in the repo do strip comments. Two sentences instead of one; the doc now
  teaches the rule, not the instance.
- **Dated production measurements left untouched.** The 48/52, 17, 25/3,
  and 78.2 s numbers carry their measure dates, which makes them honest —
  re-measuring them would mean production reads from a docs worker, which
  buy nothing and risk touching the one database. The date stamps are the
  mechanism that made skipping them correct rather than lazy.
- **No drive-by code changes.** As with the sibling passes, the audit found
  drift in the *doc*, not bugs in the *code* — the guards, scripts, and
  constants in source are internally consistent (the vision.test.ts
  exemption was the guard's own deliberate same-day fix, not a defect).
  Nothing outside `scripts/.workflows/package_readme.md` was touched.

## Follow-ups & YAGNI notes

- **A future pass could re-check the dated production measurements**
  (48/52 hashed, 17 repointed, 25/3 shortcuts, 78.2 s) — deliberately not
  done today. They are stamped, so they are honest today; when a stamp goes
  stale, the stamp says so. Production reads from a docs worker buy
  nothing.
- **Verification greps need `grep -c` or no head — never `head -N`.** The
  pass's one near-miss: the first `replyToId` grep on `nina-memory-reap.mjs`
  showed no hit because `head -12` cut off before section 4, which would
  have written off a true claim as drift. This is the same failure mode the
  repo already learned with inventory greps (the `head` cutoff that dropped
  a live ref); now it has a second, verification-shaped instance on record.
  The fix is mechanical: count matches, or read whole.
- **`git log -S` as a negative-proof tool is a keeper.** One command
  settled "was the constant ever in that file?" (no — empty history),
  converting a maybe-drift into a definite citation fix and dating the
  error to the doc's authorship rather than to subsequent drift. Any
  future "which file does this really live in?" dispute should start there
  before anyone edits either candidate.
- **"Compact" is not always the job** — a note for future idea generation
  in this series. A freshly-written doc still deserves a worker; its
  mandate just resolves to verification, and the honest direction can be
  +28 lines. The set-closure framing ("all seven carry a same-week pass")
  was the real deliverable and should be named as such when a series like
  this ends, rather than forcing every closing member into the series'
  original shape.
- **The lib-side twin-gate asymmetry is now load-bearing doc.**
  `PERCEPTUAL_MAX_SIG16` existing only in `lib/nina/perceptual.ts` is a
  fact someone will eventually want to either fix (add it to the sweep
  side) or ratify (say why the sweep doesn't need it). Today's pass
  recorded the asymmetry; deciding it is a code change and out of scope for
  a docs worker.

## Appendix

**Commit (on `token-maxxing-2026-09-12-scripts-readme-compact`):**

```
e8d5f48 docs(scripts): verification pass on package_readme — every claim re-checked, 7 corrections

 scripts/.workflows/package_readme.md | 82 ++++++++++++++++++++++++------------
 1 file changed, 55 insertions(+), 27 deletions(-)
```

(226 → 254 lines. Arithmetic note, measured from the tree rather than
asserted: 226 + 55 − 27 = **254** — the "+16 to 242" figure that circulated
in the session handoff was drift in the handoff itself, caught by running
`wc -l` on both sides of the commit before writing this doc. Same lesson
the readme itself teaches: measure, stamp, don't restate.)

**Key commands run this session:**

```bash
# guards read in full (not grepped) — the seven check-*.mjs
# npm mappings checked against package.json (22 + 2 negatives)
grep -rn '@/scripts' lib/ app/ components/        # empty — the isolation claim
ls scripts/*.ts                                    # worker only — the .ts claim
ls .github/workflows/nina-image.yml                # exists — hosting claim
git cat-file -t c2c2ca5                            # cited commit resolves
git log -S PERCEPTUAL_MAX_DHASH -- lib/nina/perceptualSign.ts
                                                   # EMPTY — constants never lived there
npx prettier --check scripts/.workflows/package_readme.md   # passes
```

**Provenance of the audited file:** written 2026-09-11 as commit `b049bb7`
(the scripts-package-hygiene session expanded it 7 → 226 lines), verified
2026-09-12 as commit `e8d5f48` (this pass). Both are recorded in the
readme's new Notes section so the doc's own history no longer lives only
in git.

**Series context:** siblings and their docs — root (`2026-09-12-pkg-readme-root.md`),
`lib/db` (`2026-09-12-pkg-readme-lib-db.md`), `lib/admin`
(`2026-09-12-pkg-readme-lib-admin.md`), `components/admin`
(`2026-09-12-pkg-readme-admin-cmp.md`), `lib/nina`
(`2026-09-12-pkg-readme-nina-lib.md`), `components/nina`
(`2026-09-12-pkg-readme-nina-cmp.md`). With this pass, all seven
`package_readme.md` files carry a same-week verification pass; the series
is closed.
