# Token-Maxxing Session — 2026-09-12: Nina Memory/ImagePrefs YAGNI Sweep

## 🎯 Achievement / End Result
- **Goal of the burn:** The coordinator's assigned idea (worker session of orchestration
  run `tokenmax-orch-2026-09-12`, pre-assigned — no Step-4 menu): *"YAGNI-sweep
  `lib/nina/memory.ts` and `lib/nina/imageprefs.ts` for dead/unused exports. Why: neither
  has been swept despite the package readme/queries.ts getting attention."* In other
  words, close the last two unswept corners of the repo's most-audited package: `lib/nina`
  had received a queries.ts dead-export sweep, an 85% readme compaction, and a todos
  archive across 2026-09-11/12 — but its two largest internal modules had never once had
  their export surface examined.
- **Concrete changes:** One commit, `d05505f` — *"yagni(nina): sweep dead exports from
  memory.ts and imageprefs.ts"* — exactly 2 files, +17/−34, and not a line of behavior
  change:
  - **3 symbols deleted outright** (zero readers anywhere, own file included):
    `WEEKDAY_EN_SHORT` (memory.ts — its own doc-comment admitted it was speculative:
    *"Exported for a caller that wants the English rendering; nothing in this phase uses
    it"*), `DistilledCandidate` (memory.ts — a `z.infer` alias with no consumer), and
    `isNinaImageFocusKey` (imageprefs.ts — a type-guard with no internal or external
    caller).
  - **17 symbols un-exported to module-private**, each still genuinely used inside its own
    file: memory.ts lost `export` on `isoToJsWeekday`, `WEEKDAY_ID`,
    `NICKNAME_CANDIDATE_LIMIT`, `FIRST_CONVERSATION_MESSAGE_LIMIT`, `FACT_TEXT_MAX`,
    `DistilledCandidateSchema`, `PromiseCandidateSchema`, `MAX_PENDING_PROMISES`,
    `MAX_PLANNED_FACTS`, `SlotWritePolicy`, `PlannedFact`, `PlannedSlot`, `DeferredSlot`,
    `DemotedWrite` (14); imageprefs.ts on `NINA_IMAGE_REFERENCE_ID_RE`,
    `NinaImageReferenceSource`, `NinaPhotoRefSource` (3).
- **Real value delivered:**
  - **The public API of both modules is now exactly the set of names another module is
    allowed to know.** Before the sweep, memory.ts exported 14 symbols that only its own
    internals read — caps, schemas, write-policy types, planner row shapes — each one a
    false invitation to depend on it and each one a refactor-visibility lie (a "public"
    constant that no external file can ever reference). After: knip reports **zero rows**
    for both files.
  - **Every one of the 20 knip flags was cross-checked before being believed** — the
    dead-export-tooling discipline, applied: word-boundary greps over all source *including
    tests read as text* (the regex-scrape-consumer class knip structurally cannot see), a
    dynamic-import probe, and explicit exclusion of the `lib/nina/.workflows/plan/` prose
    copies that sit *inside* `lib/` and would false-positive any filesystem grep.
  - **One real verifier trap caught and dodged:** `lib/nina/context.ts` exports a
    *different* `WEEKDAY_ID` (an as-const string array, imported by `lib/nina/dates.ts`).
    A naive grep for consumers of memory.ts's `WEEKDAY_ID` would have "found" that import
    and kept memory.ts's Record-typed twin exported forever. Twin names are not consumers.
  - **All prose mentions elsewhere left true.** `load.ts`, `turnrun.ts`, `promise.ts`,
    `admin/memoryModel.ts`, and `admin/imageGenModel.ts` cite these symbols' *values and
    caps in comments* — none imports them — so every one of those comments still tells the
    truth post-sweep, verified rather than assumed.
  - **Tests untouched and tests green:** no test imported *or* source-scraped any flagged
    symbol. 317/317 across 12 targeted suites; typecheck clean; the full-sweep's 2 reds
    reproduced as the documented MemoryTable parallel-load flake, not this diff.
  - **`lib/nina/.workflows/package_readme.md` untouched** — the assignment explicitly
    forbade touching it, and it was not touched (last commit to touch it remains
    `0d7ac9d`, from before this session; this session's commit contains exactly the two
    source files).
- **Branch:** `token-maxxing-2026-09-12-nina-memory-prefs-yagni` (worktree
  `tokenmax-2026-09-12-nina-memory-prefs-yagni`), head `d05505f`.
- **Merge status:** on branch, **NOT merged — awaiting coordinator landing**. The worker
  does not merge to main; coordinator `tokenmax-orch-2026-09-12` owns merges (the worker
  reports DONE and stops).
- **Approx token burn:** no meter was read; by shape a mid-weight worker session whose
  spend is verification-dominant over a small diff — a full knip pass, 20 per-symbol
  cross-checks each requiring a separate grep strategy (prose copies excluded, twin names
  disambiguated, tests read as text), five files of prose-mention auditing, a 12-suite
  targeted battery, one full-sweep run plus a flake reproduction, and a commit message
  that records every verdict by name. The tokens bought the right to delete, not lines.
  🔥🔥

## Context & Motivation
The 2026-09-11/12 dead-code campaign had already swept most of the repo, and `lib/nina` —
the package with the repo's most heavy prior attention — was paradoxically incomplete:
`lib/nina/queries.ts` got its dead-export removal on 2026-09-11 (*"Finally closed the
repo's most-deferred cleanup"*), the package's readme was compacted 85% the same day, and
its todo ledger archived — but `memory.ts` and `imageprefs.ts`, the two largest and most
internal modules, had never had a single sweep pass over their export surface. They fell
through because earlier sweeps predated same-day knip adoption (commit `4f4fa3f`, session
`tokenmax-dead-export-tooling`) and were hand-rolled per-package passes that scoped by
package or directory, not by module.

This was a **worker session** (fan-out under coordinator `tokenmax-orch-2026-09-12`), so
the idea arrived pre-assigned with no menu. The coordinator's pick was the natural next
consumer of the new instrument: knip turns a two-module export census into one command,
and the two modules were the highest-value unswept surface left in the package — memory.ts
holds Nina's fact/promise distillation schemas and slot-write policy types, imageprefs.ts
holds her photo-reference contract, exactly the kind of file where speculative exports
accumulate because every phase of a plan "might" want them.

## What We Did (blow-by-blow)
1. **Knip census.** `npm run knip` flagged **20 rows across the two files**: 14 unused
   exports and 6 unused exported types. This number is the whole session's raw material —
   and, per the adopted discipline, the beginning of the work, not the end.
2. **Per-flag cross-check.** Every flag was believed only after its own verification:
   word-boundary greps over all source with tests read as text (the scrape-consumer class
   knip cannot see — the exact blind spot the dead-export-tooling doc records), a
   dynamic-import probe (no `import()` anywhere reaches either module by these names), and
   — critical for `lib/nina` specifically — the `lib/nina/.workflows/plan/` directory
   excluded from the greps, because the adopted plan copies sit *inside* `lib/` and their
   prose quotes these symbol names constantly. Grepping them as text would have made every
   dead symbol look alive.
3. **The twin-name trap.** `WEEKDAY_ID` produced the session's one genuine catch:
   `lib/nina/context.ts` exports its own `WEEKDAY_ID` — an `as const` **array** of
   Indonesian day names — which `lib/nina/dates.ts` imports. That import chain is real,
   but it is a consumer of *context.ts's* array, not of *memory.ts's*
   `Readonly<Record<IsoWeekday, string>>`. Same name, different type, different module,
   different owner. Verdict: memory.ts's copy has no consumers; the demotion stands. Had
   the grep been trusted raw, the twin's import would have kept a dead export on life
   support.
4. **Verdicts, symbol by symbol.** The 20 flags split by a single rule — *zero readers
   anywhere (own file included) → delete; readers only inside its own file → un-export*:
   - **Deleted (3):** `WEEKDAY_EN_SHORT` — seven lines of English day names whose own
     comment confessed no caller existed; `DistilledCandidate` — a `z.infer` type alias
     whose underlying schema was the thing actually used; `isNinaImageFocusKey` — a
     type-guard function with no caller in any file, test, or script.
   - **Un-exported (17):** the full list in the Achievement block. Each retains every
     other character of its definition — the diff is literally `export const X` → `const X`
     and `export type X` → `type X` — because each is load-bearing *within* its module:
     the caps (`FACT_TEXT_MAX`, `MAX_PENDING_PROMISES`, `MAX_PLANNED_FACTS`,
     `NICKNAME_CANDIDATE_LIMIT`, `FIRST_CONVERSATION_MESSAGE_LIMIT`) are enforced by the
     in-file zod schemas and merge functions; the schemas (`DistilledCandidateSchema`,
     `PromiseCandidateSchema`) are the distill path's parsers; the types
     (`SlotWritePolicy`, `PlannedFact`, `PlannedSlot`, `DeferredSlot`, `DemotedWrite`,
     `NinaImageReferenceSource`, `NinaPhotoRefSource`) are the internal signatures of the
     merge/planner/reference machinery; `isoToJsWeekday` and
     `NINA_IMAGE_REFERENCE_ID_RE` are the in-file helpers their exported siblings call.
5. **Prose-mention audit.** Five files mention these symbols' names in comments —
   `load.ts`, `turnrun.ts`, `promise.ts`, `admin/memoryModel.ts`,
   `admin/imageGenModel.ts`. Each mention cites a *value or cap* ("the 400-char fact
   cap", "twelve pending promises"), never an import. Read each; all five remain true
   after the sweep. No doc rewording needed — and the package readme was off-limits by
   assignment anyway (it was not touched).
6. **Test blast-radius check.** No test file imports any flagged symbol, and — the subtler
   half — no test source-scrapes either file's text for these names. Tests are untouched
   by the commit, verified rather than hoped.
7. **Gates.** In order: knip re-run → zero rows for both files; `npx tsc --noEmit` →
   clean (vitest does not typecheck; next build would); targeted vitest over the 12
   relevant suites (`nina.memory`, `nina.imageprefs`, `nina.distill`, `admin.memory`,
   `admin.memoryActions`, `nina.photoRefs`, `admin.imageGenActions`,
   `nina.promise.reward`, `nina.cron`, `nina.gateway.patterns`, `nina.context`,
   `ImageGenPanel`) → **317/317 green**; full sweep → 5235/5237 with the 2 reds in
   `components/admin/MemoryTable.test.tsx` — reproduced 20/20 twice under
   `--no-file-parallelism`, matching the documented parallel-load flake exactly
   (varying-count full-sweep reds, clean under serial), i.e. pre-existing and not this
   diff.
8. **Commit and stop.** `d05505f`, 2 files, +17/−34, message recording all 20 verdicts by
   name. Not merged — the coordinator owns landing; worker reports DONE.

## Code / Design Details
The entire diff is demotion and deletion; here is its whole vocabulary, three shapes:

**Shape 1 — delete a self-confessed speculative export** (memory.ts, 11 lines gone):

```diff
-/** Exported for a caller that wants the English rendering; nothing in this phase uses it. */
-export const WEEKDAY_EN_SHORT: Readonly<Record<IsoWeekday, string>> = {
-  1: 'Mon',
-  2: 'Tue',
-  ...
-}
```

The doc-comment is the YAGNI autopsy: it was exported *for a caller that never came*. This
is the classic shape of plan-phase over-export — the phase built both renderings, shipped
one, and left the other public on spec.

**Shape 2 — demote an in-file load-bearing constant/type** (the 17, one line each):

```diff
-export const FACT_TEXT_MAX = 400
+const FACT_TEXT_MAX = 400
```
```diff
-export type SlotWritePolicy = 'replace' | 'merge'
+type SlotWritePolicy = 'replace' | 'merge'
```

Nothing else changes. The value keeps its comment, its position, and every in-file use
(schema enforcement, merge logic). The only observable difference at the module boundary
is that `import { FACT_TEXT_MAX } from '@/lib/nina/memory'` stops compiling — which is
the point: it never worked at runtime for an external caller to *need*, and now the type
system says so too.

**Shape 3 — a guard with zero callers** (imageprefs.ts):

```diff
-export function isNinaImageFocusKey(key: string): key is NinaImageFocusKey {
-  return (NINA_IMAGE_FOCUS_KEYS as readonly string[]).includes(key)
-}
```

A textbook speculative utility: written alongside `NINA_IMAGE_FOCUS_KEYS` because a guard
"completes" the pair, never called anywhere — not by `coerceNinaImageText` (which does its
own narrowing), not by any component, not by tests.

**A derived-type demotion chain worth noting:** in imageprefs.ts, `NinaImageReferenceSource`
was an unused *exported* type, and `NinaPhotoRefSource` was defined as
`Exclude<NinaImageReferenceSource, 'none'>`. Demoting the first to module-private let the
second demote too — the internal derivation survives intact, and the module's exported
surface keeps only what the reference-grid contract actually crosses the boundary
(`NINA_IMAGE_REFERENCE_SOURCES`, `NINA_IMAGE_REFERENCE_ID_MAX`, the coerce/parse
functions, the photo-ref row and page types).

**Why un-export instead of delete for the 17:** because "no external consumers" and "dead"
are different verdicts. These 17 are the module's skeleton — caps the schemas read, types
the merge functions sign, helpers the parsers call. Deleting them would mean inlining
literals into single call sites and anonymizing the merge machinery's vocabulary; the
correct minimal move is to stop *advertising* them. Public-API shrinkage with zero
behavior delta is the cheapest possible correctness-preserving diff.

## Decisions & Trade-offs
- **Believe nothing raw — including the instrument.** knip's 20 flags were the session's
  input, not its output. Each verdict carries its own grep receipt, because the tool has
  three documented classes of wrong answer that all fire in this exact directory:
  regex-scrape consumers it cannot see (checked — none), plan-copy prose inside `lib/`
  that would false-positive any filesystem grep (excluded from every grep), and twin
  names in sibling modules that *look* like consumers (found one — `WEEKDAY_ID` — and
  dodged it).
- **The delete/un-export rule is mechanical, not vibes:** zero readers anywhere → delete;
  readers only in-file → un-export. Mechanical rules are what make a sweep reviewable —
  the reviewer can re-derive every verdict from the rule plus a grep instead of trusting
  judgment.
- **Leave all five prose-mention files untouched.** The mentions cite values and caps
  ("400", "twelve"), not imports, so the sweep cannot falsify them. Rewording true
  comments to say the same thing would be churn; the audit exists to *confirm* they stay
  true, which it did.
- **Honor the assignment's hard constraint:** `lib/nina/.workflows/package_readme.md` was
  explicitly forbidden. It was not read-modify-written, not reformatted, not touched —
  the commit contains exactly `lib/nina/memory.ts` and `lib/nina/imageprefs.ts`, and the
  readme's last-touching commit remains `0d7ac9d` (pre-session).
- **Scope discipline on the knip backlog.** Repo-wide, knip still reports roughly 150
  unused exports and ~116 unused exported types across *other* files; per `knip.ts`'s own
  comment those are the triaged backlog for future YAGNI sessions. This sweep took its
  two assigned files and nothing else — a scoped worker session that had started
  "fixing" the backlog would have been a different, unbounded session.
- **Flake attribution before blame.** The full-sweep's 2 reds arrived in
  `MemoryTable.test.tsx`, a file this diff never touched. Per the standing discipline the
  reds were reproduced on the basis of the documented signature (varying counts under
  parallel load, 20/20 twice under `--no-file-parallelism`) and attributed to the known
  flake rather than laundered into the commit message as "tests green (with known
  failures)" without the receipt.

## Follow-ups & YAGNI notes
- **The repo-wide knip backlog is standing work:** ~150 unused exports + ~116 unused
  exported types across other files, deliberately untouched here, triaged as future
  YAGNI-session material per the `knip.ts` comment. Any future sweep should start from
  `npm run knip` and re-apply this session's cross-check discipline.
- **The `WEEKDAY_ID` twin is a standing confusion hazard, documented but not unified.**
  memory.ts's `Readonly<Record<IsoWeekday, string>>` and context.ts's `as const` array
  share a name and a domain (Indonesian day names) but not a type or a purpose. Unifying
  them was considered and rejected: the array serves ordered iteration in context, the
  record serves lookup by ISO weekday in memory — merging them would couple two modules
  for cosmetics. If a third `WEEKDAY_ID` ever appears, this note is the prior art.
- **Deliberately not done:** no behavior changes of any kind (the sweep's mandate was
  surface, not semantics); no re-export barrel introduction ("cleaner imports" would have
  re-widened exactly the surface this shrank); no readme updates (forbidden for the
  package readme; no other doc's claims were falsified — verified, not assumed).
- **Test-pin invariants survived intact:** the exported surface that remains (schemas,
  caps like `MAX_DISTILLED_CANDIDATES`, merge functions, photo-ref contract types) is
  exactly what external modules and tests actually import — nothing that remains is
  speculative, and nothing that was removed was pinned.

## Appendix
- **Commit:** `d05505f` — *"yagni(nina): sweep dead exports from memory.ts and
  imageprefs.ts"* — 2 files, +17/−34 (`lib/nina/memory.ts` 41 hunks-of-demotions incl.
  the 11-line `WEEKDAY_EN_SHORT` deletion; `lib/nina/imageprefs.ts` 10 lines net
  removed). Branch `token-maxxing-2026-09-12-nina-memory-prefs-yagni`, worktree
  `tokenmax-2026-09-12-nina-memory-prefs-yagni`, head `d05505f` on top of `b39c6e5`.
  **Not merged** — coordinator `tokenmax-orch-2026-09-12` owns landing.
- **The 20 knip flags** = 14 unused exports + 6 unused exported types. Disposition:
  3 deleted (`WEEKDAY_EN_SHORT`, `DistilledCandidate`, `isNinaImageFocusKey`), 17
  un-exported (14 in memory.ts: `isoToJsWeekday`, `WEEKDAY_ID`,
  `NICKNAME_CANDIDATE_LIMIT`, `FIRST_CONVERSATION_MESSAGE_LIMIT`, `FACT_TEXT_MAX`,
  `DistilledCandidateSchema`, `PromiseCandidateSchema`, `MAX_PENDING_PROMISES`,
  `MAX_PLANNED_FACTS`, `SlotWritePolicy`, `PlannedFact`, `PlannedSlot`, `DeferredSlot`,
  `DemotedWrite`; 3 in imageprefs.ts: `NINA_IMAGE_REFERENCE_ID_RE`,
  `NinaImageReferenceSource`, `NinaPhotoRefSource`). 3 + 17 = 20 — every flag
  dispositioned, none deferred.
- **Gates as run:** `npm run knip` → zero rows for both files post-sweep; `npx tsc
  --noEmit` → clean; targeted vitest (12 files: nina.memory, nina.imageprefs,
  nina.distill, admin.memory, admin.memoryActions, nina.photoRefs,
  admin.imageGenActions, nina.promise.reward, nina.cron, nina.gateway.patterns,
  nina.context, ImageGenPanel) → 317/317; full sweep 5235/5237 with the 2 reds
  reproduced as the MemoryTable parallel-load flake (20/20 twice under
  `--no-file-parallelism`).
- **Cross-check method, for the next sweeper:** word-boundary grep per symbol over all
  source with `--include` for source extensions (never bare-text over `lib/`, because
  `{pkg}/.workflows/plan/` prose copies quote these names and would false-positive);
  tests included as text (scrape-consumer class); dynamic-import probe for each name;
  twin-name disambiguation where a symbol name exists in more than one module
  (`WEEKDAY_ID`: memory.ts Record vs context.ts as-const array).
- **Prose mentions verified true, untouched:** `lib/nina/load.ts`, `lib/nina/turnrun.ts`,
  `lib/nina/promise.ts`, `lib/admin/memoryModel.ts`, `lib/admin/imageGenModel.ts` — all
  cite values/caps in comments, none imports any flagged symbol.
- **Hard constraint honored:** `lib/nina/.workflows/package_readme.md` untouched (last
  touched by `0d7ac9d`, pre-session; not in this commit's file list).
- **Related sessions:** `2026-09-12-dead-export-tooling` (knip adoption — this session
  is a direct consumer of that instrument); `2026-09-11-lib-nina-queries-yagni` (the
  queries.ts sweep that made these two files the package's last unswept modules);
  `2026-09-12-pkg-readme-nina-lib` (the 85% readme compaction that explains the
  package's prior attention).
