# Token-Maxxing Session — 2026-09-12: Nina Actions YAGNI Sweep (Premise Corrected, Module-Wide)

## 🎯 Achievement / End Result
- **Goal of the burn:** The coordinator's assigned idea, verbatim: *"YAGNI-sweep
  lib/nina/actions.ts (1667 lines) for dead/unused exports using knip. Why: never
  individually dead-code-swept; banked knip backlog (~150 unused exports concentrated in
  lib/nina) names it."* Worker mode: the idea arrived pre-chosen (one of a 5-way fan-out
  under coordinator `tokenmax-orch-2026-09-12`, no Step-4 menu).
- **The headline is a premise correction.** The fresh knip census reports **zero findings
  in `lib/nina/actions.ts` itself** — all five server actions (`sendNinaMessage`,
  `resendNinaMessage`, `pollNinaReply`, `describeNinaImage`, `findNinaDuplicateChatImage`)
  and all nine of its type exports have live consumers. What the backlog actually names is
  the **rest of lib/nina** — the largest cluster in the repo. The sweep therefore landed
  module-wide, and actions.ts was verified-and-cleared as step one rather than edited.
- **Concrete changes:** One code commit, `b533b7f` "refactor(nina): YAGNI-sweep lib/nina
  per knip census — 182 findings to zero" — 42 files changed, +159/−230, all inside
  `lib/nina/`:
  - **150 export keywords dropped** — symbols used only in-file are now package-private
    (TypeScript has no package-private export, so sibling-only use was forcing them out).
  - **19 fully-dead declarations deleted** — zero references repo-wide, including
    `NINA_NAME`, `NinaHashedUploadClaim`, `NinaImageReferenceContentType`,
    `DistilledCandidate`, `isNinaImageFocusKey`, and the `LookupRunsArgs` /
    `CompareRunsArgs` / `SaveMemoryArgs` z.infer aliases.
  - **6 dead barrel re-export lines removed** (five in `prompts/index.ts`, plus the
    `ProactiveTriggerKind` and `NagDecision` re-export lines in `proactive.ts`).
  - Plus this session doc (the branch tip after it lands).
- **Real value delivered:**
  - **The banked backlog's largest cluster is gone.** Repo census moved **150→34 unused
    exports** and **116→51 unused exported types**; `lib/nina` itself is now at **zero**
    knip findings. The remaining 34/51 sit entirely outside `lib/nina` and are the next
    sessions' backlog.
  - **A false pointer in the standing backlog corrected before it cost a future session.**
    Anyone sent at actions.ts on the old premise would have burned a session hunting
    findings that do not exist. The verified-clean verdict on its five actions and nine
    type exports is now on the record with receipts.
  - **A full trap ledger, each entry triaged and survived** (details below): a
    boundary-guard grep string, source-as-text tests, three twin-symbol pairs, four
    docstrings whose claimed consumers never existed, three frozen-at-default shims, two
    duplicate-export pairs with opposite verdicts, and dead barrel lines. The triage is
    written down so the next sweep starts from evidence instead of re-deriving it.
  - **Docstring debt retired with the code.** Several deleted exports carried false
    provenance claims ("a test passes it explicitly", "Logged, never sent", "Exported for
    a caller that wants") — the claims died with the declarations, and the record keeps
    them as a cautionary exhibit.
  - **The gates caught two real mistakes** (a wrong un-export surfaced by `tsc`, and six
    missed symbols surfaced by the knip re-run), both fixed before commit — the
    multi-gate discipline doing exactly what it is for.
  - **All gates green:** `next typegen` + `npx tsc --noEmit` exit 0; `npx vitest run`
    280 files / 5237 tests all passing; `npm run knip` reports lib/nina = 0 findings;
    prettier clean on all 42 changed files.
- **Constraint honored:** `lib/nina/.workflows/package_readme.md` untouched — the
  coordinator's explicit carve-out for this session (no readme update dispatched).
- **Branch:** `token-maxxing-2026-09-12-nina-actions-yagni` (worktree
  `tokenmax-2026-09-12-nina-actions-yagni`), code head `b533b7f`; the session-doc commit
  becomes the branch tip afterwards.
- **Merge status:** merged (commit `100c292`)
- **Approx token burn:** no meter was read; by shape a mid-to-heavy worker session,
  verification-dominant over its diff — a full knip census plus a re-run, 181 per-symbol
  word-boundary greps each requiring a read of the surrounding contract (guard scripts,
  source-as-text tests, twin definition sites, docstring claims), a 42-file edit pass, a
  tsc-driven restoration, a missed-symbol follow-up hunk, and the full gate battery
  including a git-show prettier probe. The tokens bought a corrected premise and a
  zeroed-out census, not line count. 🔥🔥

## Context & Motivation
The same-day adoption of knip (`npm run knip`, session `tokenmax-dead-export-tooling`)
had banked a repo-wide backlog of unused exports, and its largest concentration by far
was `lib/nina` — roughly 150 unused exports plus a large population of unused exported
types. The coordinator's assignment named `actions.ts` (1667 lines) as the entry point on
the theory that the backlog's biggest file in the biggest cluster must be where the
findings live.

The premise did not survive contact with the instrument. The very first step — running
the census rather than trusting the banked list — showed actions.ts producing **zero**
knip findings: its five server actions are the chat surface's actual API (imported by
route handlers and client components), and its nine type exports are all consumed. The
backlog's pointer was really a pointer at the *package*, not the file. Rather than
report a null result, the session re-scoped to what the backlog genuinely named: a
module-wide sweep of all of `lib/nina`, which at 181 candidate findings was the single
largest chunk of the repo's 150-export/116-type debt. Clearing it whole moved the repo
census by more than any other single target could.

## What We Did (blow-by-blow)
1. **Knip census first, premise checked before any edit.** `npm run knip` (knip 6.35.1,
   config `knip.ts`) over the tree. Result for the assigned file: zero findings. Result
   for the package: 181 findings (116 unused exports + 65 unused exported types), plus 1
   fixable duplicate-export pair = the 182 the commit message counts. Decision: the
   sweep's real subject is `lib/nina` module-wide; actions.ts gets a verify-and-clear
   verdict as step one.
2. **Per-symbol word-boundary grep cross-check.** All 181 lib/nina candidates grepped
   independently of knip's import graph, per the dead-export-tooling doc's
   trust-but-verify prescription (knip's one known blind spot is regex-scraped
   non-TS consumers).
3. **Per-symbol classification into three verdicts:** **un-export** (used in-file only —
   drop the `export` keyword, keep the declaration), **delete** (zero references
   anywhere), and **keep** (live consumer found, knip wrong or the consumer is a
   sanctioned seam).
4. **Trap triage — the step that took the tokens.** Every verdict that looked
   suspicious was investigated to a recorded outcome (full ledger in the next section):
   boundary-guard grep strings, source-as-text test assertions, three twin-name pairs,
   docstring claims chased to their (absent) consumers, frozen-at-default shims, two
   duplicate-export pairs resolved with opposite verdicts, and dead barrel re-export
   lines.
5. **The edit pass**, 42 files: 150 export keywords dropped, 19 declarations deleted,
   6 dead re-export lines removed.
6. **Mistake one, caught by tsc.** `SET_AVATAR_TOOL` was un-exported in
   `prompts/tools.ts` on the strength of a knip finding — but knip had flagged only the
   *barrel re-export* of the name, not the definition, and the real consumer
   `avatartools.ts` imports it directly. `tsc` failed with TS2459 (module has no exported
   member). Fix: the export was restored at the definition site while the dead barrel
   line stayed removed — the correct resolution of the original finding.
7. **Mistake two, caught by the knip re-run.** Six symbols (`NinaPhotoKind`,
   `PlannedFact`, `PlannedSlot`, `DeferredSlot`, `DemotedWrite`, and the `NagDecision`
   re-export line) were missed in the first edit pass and surfaced as still-unresolved
   findings on the re-run. Fixed in a follow-up hunk.
8. **The gate battery:** `next typegen` then `npx tsc --noEmit` exit 0; `npx vitest run`
   280 files / 5237 tests, all green; `npm run knip` — lib/nina at 0 findings, repo
   census 150→34 unused exports and 116→51 unused exported types; prettier clean on all
   42 changed files (3 needed a `--write`, see Decisions).
9. **Commit `b533b7f`** with the full trap ledger and both mistakes recorded in the
   message body, so the reasoning survives next to the diff.

## Code / Design Details
**The trap ledger — each entry checked, each verdict recorded:**

- **Boundary-guard strings.** `scripts/check-llm-payload-boundary.mjs` greps source for
  `\bdistillNinaMemory\s*\(` and keeps the definition site in its sanctioned list. The
  un-export of `distillNinaMemory` keeps the definition present, so the guard's pattern
  still matches — verified before editing, not after.
- **Source-as-text tests.** `tests/admin.imagegenTest.test.ts` asserts `not.toContain`
  against lists of admin file paths — its strings name admin files, not lib/nina, so no
  lib/nina symbol is load-bearing inside a test-file *string*.
- **Twin names (three pairs).** `WEEKDAY_ID` exists in both `context.ts` and
  `memory.ts` — `dates.ts` imports it from `'./context'`, so the context one is live and
  the memory one was the dead twin. `ProactiveTriggerKind` exists in both `system.ts`
  and `proactive.ts`; `NagDecision` in both `nags.ts` and `proactive.ts` — in each pair
  only one definition site has real importers, and the other side's re-export line was
  the dead part.
- **Claimed-consumer-absent docstrings.** Four exports documented consumers that a grep
  proved never existed: `NOOP_NOTIFIER` ("a test passes it explicitly" — no test does);
  `NINA_CAPTION_PROMPT_VERSION` ("Logged, never sent" — nothing logs it);
  `WEEKDAY_EN_SHORT` ("Exported for a caller that wants" — none ever came);
  `NINA_SELFIE_STYLE_SHORT` ("spent at rungs off/low/mid" — the rung logic doesn't use
  it). All four deleted. Lesson recorded: a docstring's claimed consumer is a hypothesis,
  not evidence.
- **Frozen-at-default shims.** `DISTILL_SYSTEM_PROMPT`, `NUMBERS_RULE`, `CONTEXT_GUIDE`
  were exported overrides nothing ever overrides — prompt assembly uses the builder
  functions, and the exported constants were defaults frozen at module load with no
  taker. Deleted.
- **Duplicate-export pairs, opposite verdicts.** The schema pair
  `NinaMemoryWriteSchema` | `SaveMemoryArgsSchema` was resolved to the *consumed* name
  (`SaveMemoryArgsSchema`): the twin was un-exported and kept in-file for its `z.infer`
  use. The turnflight pair `NINA_BACKGROUND_BUDGET_MS` | `NINA_TURN_POLL_GIVE_UP_MS`
  was deliberately **not** touched — recorded as a test-asserted invariant; consolidating
  it would have broken a test that pins both names.
- **Dead barrel lines.** `prompts/index.ts` carried five re-exports with no importers;
  `proactive.ts` carried dead re-export lines for `ProactiveTriggerKind` and
  `NagDecision`. Removed. This is the class whose mis-reading caused mistake one — a
  barrel-line finding does not indict the definition.

**Why "un-export" is a class at all:** TypeScript has no package-private visibility
between sibling modules, so any symbol shared across files within `lib/nina` had to be
`export`ed even when nothing outside the package ever imported it. Dropping the keyword
shrinks the package's public surface (what knip tracks, what a future sweep re-litigates,
what an importer outside the package may legally bind to) without touching a line of
logic. This is why the diff is +159/−230 on 42 files with zero behavior change.

**The census arithmetic, reconciled:** 150 unused exports + 116 unused exported types
before; 34 + 51 after. Deltas: 116 export findings and 65 type findings cleared in
lib/nina = the 181 grep-checked candidates; plus the 1 fixable duplicate pair = 182
findings to zero.

## Decisions & Trade-offs
- **Re-scope to module-wide instead of reporting a null result.** The assigned file was
  clean; the honest reading of the assignment's *why* ("backlog concentrated in
  lib/nina") pointed at the package. Sweeping the whole module is what the backlog
  actually asked for; stopping at "actions.ts is fine" would have left the repo's largest
  debt cluster standing behind a corrected-but-unacted-on premise.
- **Verify-and-clear rather than edit actions.ts.** A clean census is a result, and the
  temptation to find *something* in a 1667-line file was declined — the correct response
  to a clean census is a recorded verdict with receipts, not invented churn.
- **Restore the definition, remove the barrel line (mistake one).** When tsc showed
  `SET_AVATAR_TOOL` had a real direct importer, the fix was not to revert the finding —
  it was to see that knip had flagged the *barrel re-export*, not the definition, and
  apply the finding at the right layer: export stays, dead barrel line goes.
- **Keep the turnflight duplicate pair.** Two names for one constant is normally exactly
  what a duplicate-export finding exists to kill — but a test asserts both names, which
  makes the pair a pinned contract, not an accident. Un-pinning it belongs to whichever
  session next touches that test, with the test's intent in view.
- **Prettier `--write` on 3 files, with a dirty-at-HEAD probe first.** Dropping an
  `export ` keyword can let a wrapped declaration re-join under the line limit, leaving
  the file prettier-dirty through no formatting sin of its own. Before writing, each of
  the three was probed by piping its HEAD blob through prettier from inside the repo and
  confirming it was clean before the edit — so the rewrite is attributable to the edit,
  not to pre-existing drift.
- **Both mistakes recorded in the commit body.** A sweep whose gates caught two errors
  could quietly ship a narrative of perfection; the message says what was missed and what
  caught it, because the gates' catch rate is part of the evidence that the final tree is
  clean.

## Follow-ups & YAGNI notes
- **The remaining backlog is outside lib/nina.** Repo census now stands at 34 unused
  exports / 51 unused exported types, none in this package — those counts are the next
  sessions' ready-made task list, now small enough to finish in one or two sweeps.
- **Deliberately not done:** no consolidation of the turnflight duplicate pair (see
  Decisions); no restructuring of `prompts/index.ts` beyond removing its dead lines (the
  barrel's live re-exports stay until a consumer-driven reason to fold it appears); no
  readme update — `lib/nina/.workflows/package_readme.md` was an explicit carve-out this
  session, and its export tables will need a refresh pass next time it is dispatched
  since the public surface shrank by 150 keywords.
- **Recorded for the next sweep of this shape:** check the *barrel line* vs the
  *definition* separately for every name knip flags near a re-export (mistake one);
  expect the first edit pass to miss a handful of findings and let the knip re-run be the
  net (mistake two); and budget for prettier re-joins when un-exporting rather than
  deleting.
- **Docstring hygiene follow-up (un-owned):** the four false-provenance docstrings were
  all in lib/nina, but the pattern ("a test passes it explicitly" with no such test) is
  likely repo-wide. A cheap grep for consumer-claiming phrases against reality would
  find the rest.

## Appendix
- **Commit:** `b533b7f` "refactor(nina): YAGNI-sweep lib/nina per knip census — 182
  findings to zero" — 42 files, all under `lib/nina/`, +159/−230. The session-doc commit
  is the branch tip after it lands.
- **Branch / worktree:** `token-maxxing-2026-09-12-nina-actions-yagni` /
  `tokenmax-2026-09-12-nina-actions-yagni`, worker session `tokenmax-nina-actions-yagni`
  under coordinator `tokenmax-orch-2026-09-12` (a /token-maxxing 5-way fan-out).
- **Instrument:** `npm run knip` (knip 6.35.1, config `knip.ts`), cross-checked with
  per-symbol word-boundary greps over all 181 lib/nina candidates.
- **Assigned file at sweep time:** `lib/nina/actions.ts`, 1667 lines, zero knip findings
  — five server actions (`sendNinaMessage`, `resendNinaMessage`, `pollNinaReply`,
  `describeNinaImage`, `findNinaDuplicateChatImage`) and nine type exports, all with live
  consumers.
- **Census movement:** unused exports 150→34; unused exported types 116→51;
  `lib/nina` 181+1→0. The remaining 34/51 sit outside `lib/nina`.
- **Deleted declarations (19), named where the record keeps them:** `NINA_NAME`,
  `WEEKDAY_EN_SHORT`, `NINA_SELFIE_STYLE_SHORT`, `NOOP_NOTIFIER`,
  `NINA_CAPTION_PROMPT_VERSION`, `DISTILL_SYSTEM_PROMPT`, `NUMBERS_RULE`,
  `CONTEXT_GUIDE`, `NinaHashedUploadClaim`, `NinaImageReferenceContentType`,
  `DistilledCandidate`, `isNinaImageFocusKey`, the `LookupRunsArgs` / `CompareRunsArgs` /
  `SaveMemoryArgs` z.infer aliases, the `memory.ts` dead-twin `WEEKDAY_ID`, and the
  remainder of the zero-reference set from the classification pass.
- **Gates as run:** `next typegen` + `npx tsc --noEmit` exit 0; `npx vitest run` — 280
  files, 5237 tests, all passing; `npm run knip` — lib/nina 0 findings after the
  re-run-driven follow-up hunk; `prettier --check` clean on all 42 changed files (3
  `--write`d after a git-show-at-HEAD probe proved they were clean before the edit).
- **Mistakes, on the record:** (1) `SET_AVATAR_TOOL` un-exported at its definition when
  knip had flagged only its barrel re-export — `tsc` TS2459 via `avatartools.ts`'s direct
  import; export restored, barrel line kept removed. (2) Six symbols (`NinaPhotoKind`,
  `PlannedFact`, `PlannedSlot`, `DeferredSlot`, `DemotedWrite`, the `NagDecision`
  re-export) missed in the first edit pass, surfaced by the knip re-run, fixed in a
  follow-up hunk.
- **Constraint:** `lib/nina/.workflows/package_readme.md` untouched throughout
  (coordinator carve-out; no readme update dispatched for this session).
