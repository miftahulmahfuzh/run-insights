# Token-Maxxing Session — 2026-09-13: Nina Memory Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `nina-memory-audit`) in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`), pre-assigned one idea verbatim, no
  menu of candidates offered: deeply read `lib/nina/memory.ts` (1270 lines) end to end,
  YAGNI-hunt dead code/speculative branches/doc drift, refactor only on genuine
  mixed-concerns or duplicated logic (never on line-count alone), and if no such issue
  exists, raise test coverage on uncovered branches instead.
- **Concrete changes:** one commit, `7290dfe` — *"refactor(nina): audit memory.ts —
  dedupe promise quote-verification, cover 8 dead branches"* — 2 files, +106/−4:
  `lib/nina/memory.ts` (+4/−4, collapsing a duplicated `verifyQuote` call into a single
  partitioning loop) and `tests/nina.memory.test.ts` (+102, eight new tests).
- **Real value delivered:**
  - **Found and fixed the one genuine duplicated-logic bug the task's bar allowed:**
    `planMemoryWrites` §7 step 4 called `verifyQuote` twice per promise candidate — once
    inside a `.filter()` to build the verified list, once more in a separate loop over the
    same source array to find the unverified ones for demoted/fact bookkeeping. Collapsed
    to one pass that partitions verified/unverified in a single loop — same behavior,
    half the `verifyQuote` calls, no behavior change.
  - **Confirmed the file has no dead exports and no doc drift.** Every exported symbol
    (types, functions, constants) was checked for a real reader in production code or
    tests; none came back unused. Specific doc claims — including the file's own
    commentary on task #135 having removed a confidence-score gate in favor of
    quote-verification alone — were checked against `git log` and an existing test that
    documents that exact reversal, and held up.
  - **Declined to split the file.** 1270 lines earned their size: it is one cohesive
    concern (the distillation half of Nina's memory system — slot/fact tables, the closed
    10-key slot vocabulary, weekday/work-hours/nickname parsing, the quote-verification
    gate, pending-promise merging, and the single `planMemoryWrites` decision function).
    No mixed-concerns seam existed to justify a split, and the task explicitly forbade
    splitting on line-count alone.
  - **Closed 5 real, previously-zero branch-coverage gaps in `planMemoryWrites`,** per the
    task's own fallback instruction, adding 8 tests: the entire `distilled.nickname`
    confirmation channel (3 sub-branches: promote on verified quote, demote on
    canonicalise failure, demote on unverified quote — none tested before); a `kind:
    'slot'` memoryWrite with an unrecognized slotKey (the unknown-key demotion path for
    structured writes, distinct from the distiller's own); a plain `kind: 'fact'`
    memoryWrite (straight to a ledger fact, no slot, no demotion); a promise candidate
    whose quote fails verification; and the case where every promise candidate restates an
    already-open pending promise, so nothing is written at all.
  - **Verified clean at every gate:** full suite `npm test` — 332 files, 5751 tests, all
    passing; `npm run typecheck` (`next typegen` + `tsc --noEmit`) clean; `prettier
    --check` and `eslint` clean on both changed files.
- **Branch:** `token-maxxing-2026-09-13-nina-memory-audit`
- **Merge status:** on branch, not merged — this is a WORKER session in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`); the coordinator owns merging worker
  branches to main, not the worker itself.
- **Approx token burn:** moderate — a genuine full end-to-end read of a 1270-line file,
  a repo-wide usage check of every exported symbol, a git-history verification of one
  doc claim (task #135), branch-level coverage analysis of a single dense function
  against a 106-test suite, and a full-repo test/typecheck/lint gate pass. 🔥

## Context & Motivation
This was a WORKER session in the 2026-09-13 token-maxxing fan-out, coordinated by
`tokenmax-orch-2026-09-13`. Unlike a solo session that generates its own menu of candidate
ideas, this worker received one idea pre-assigned by the coordinator verbatim: deeply
read `lib/nina/memory.ts` end to end, on the stated premise that it is the largest file
in `lib/nina` "not touched by any prior token-maxxing session."

That premise was slightly imprecise, on the record: `docs/token_maxxing/2026-09-12-nina-memory-prefs-yagni.md`
had already run a **knip-driven export-surface sweep** over this exact file the day
before, deleting 3 dead symbols and un-exporting 14 more. What that prior session did
*not* do — and what this task explicitly asked for — was a deep, whole-file behavioral
read: tracing `planMemoryWrites`' internal control flow, checking doc comments against
git history, and auditing branch-level test coverage rather than export-level usage.
The two sessions are complementary, not duplicated: the 2026-09-12 sweep answered "is
every export used by *something*"; this session answered "is the logic inside the
surviving exports correct, undrifted, and actually exercised by a test." That the deep
read turned up zero further dead exports is itself a confirmation that the prior sweep's
work held — nothing regrew in the intervening day.

## What We Did (blow-by-blow)
1. **Read `lib/nina/memory.ts` in full, all 1270 lines, before touching anything.**
   Built a mental map of the file's structure: two Postgres tables it wraps
   (`nina_memory_slots` — one row per user, overwritten in place as "current state";
   `nina_memory_facts` — an append-only ledger, never overwritten), a closed 10-key slot
   vocabulary (no eleventh key can ever be written — anything else is demoted to a plain
   fact), weekday/work-hours/nickname parsing helpers, the `verifyQuote` gate (the file's
   own comments record that task #135 removed a confidence-score gate that used to run
   alongside quote-verification — quote-verification is now the *only* gate), pending-
   promise merge logic, and `planMemoryWrites` — the single function that decides, given
   a distilled turn, exactly what gets written to the slots table, the facts ledger, or
   demoted to nothing.
2. **Checked every exported symbol for a real reader.** Went through each exported type,
   function, and constant and grepped the rest of the repo (production code and every
   test file) for an actual consumer. Every export came back used somewhere — no
   unused-export or unused-type finding survived from this pass, consistent with the
   prior day's knip sweep having already removed or un-exported everything that wasn't.
3. **Checked doc comments against ground truth instead of assuming them accurate.** The
   file's comments are unusually extensive and narrate their own history (e.g. the task
   #135 removal of a confidence-score gate). Rather than take that at face value, checked
   it against `git log` for the actual commit that removed the confidence gate, and
   against an existing test in the suite that documents that exact reversal. Both
   confirmed the comment's claim; no doc drift found anywhere in the file.
4. **Applied the task's refactor bar strictly.** The task said: only split or refactor on
   genuine mixed-concerns or duplicated logic, never on line-count alone. Read the file
   specifically looking for either signal. Found no mixed-concerns seam — every piece of
   the file (tables, parsers, quote gate, promise merge, `planMemoryWrites`) is part of
   one cohesive distillation concern, not several concerns sharing a file by accident. Did
   find one genuine duplicated-logic instance: in `planMemoryWrites` §7 step 4, the
   promise-candidate handling called `verifyQuote(candidate.quote, input.runnerText)`
   twice per candidate on the exact same input — once inside a `.filter()` predicate to
   build the array of verified candidates, and again inside a separate `for` loop over
   `input.distilled?.promises ?? []` (the same source array) to find the ones that
   *didn't* verify, for demotion and fact-ledger bookkeeping.
5. **Fixed the duplication with a single-pass partition, not a file split.** Rewrote the
   two-pass filter+loop as one loop that pushes each candidate into either
   `promiseCandidates` (verified) or performs the demote/`addFact` bookkeeping
   (unverified), calling `verifyQuote` exactly once per candidate. No behavior change —
   same verified list, same demotions, same facts — just one evaluation of the gate
   instead of two.
6. **Followed the task's explicit fallback instruction** ("if no such issue exists,
   instead raise test coverage on any uncovered branches") even though a fix *was* found,
   because the task's coverage clause was unconditional on top of the refactor clause, and
   `planMemoryWrites` — the file's single most consequential function — was worth a real
   branch audit regardless. Read `planMemoryWrites` branch by branch against the existing
   106 tests spread across `tests/nina.memory.test.ts`, `tests/nina.distill.test.ts`, and
   `tests/admin.memory.test.ts`, and found 5 branches with zero coverage:
   - The entire `distilled.nickname` channel (R7's confirmation path): 3 sub-branches —
     promote to the nickname slot when the quote verifies, demote when canonicalising the
     nickname fails, demote when the quote itself doesn't verify — none exercised by any
     existing test.
   - A `memoryWrite` with `kind: 'slot'` but a `slotKey` outside the closed 10-key
     vocabulary — the unknown-key demotion path for a *caller's own* structured write
     (distinct from the distiller's own unknown-key handling, which *was* covered).
   - A plain `kind: 'fact'` memoryWrite — goes straight to the ledger as a fact, with no
     slot write and no demotion logic in play at all.
   - A promise candidate whose quote fails `verifyQuote` — demoted, and recorded as a
     fact.
   - The case where every promise candidate in a turn restates an already-open pending
     promise — no slot growth happens and nothing new gets written.
7. **Added 8 new tests** to `tests/nina.memory.test.ts` covering all 5 gaps (some gaps
   needed two tests/assertions to pin distinct sub-branches, e.g. the nickname channel's
   three outcomes).
8. **Ran the full verification battery before committing:** `npm test` — 332 files, 5751
   tests, all passing; `npm run typecheck` (`next typegen` + `tsc --noEmit`) clean;
   `prettier --check` and `eslint` clean on both changed files.
9. **Committed as `7290dfe`.** One commit, both files, on
   `token-maxxing-2026-09-13-nina-memory-audit`. Did not merge or push — worker session,
   coordinator's job.

## Code / Design Details

**The duplicated-logic fix** (the file's own §7 step 4, before → after):

```ts
// before: verifyQuote runs twice per candidate over the same array
const promiseCandidates = (input.distilled?.promises ?? []).filter((candidate) =>
  verifyQuote(candidate.quote, input.runnerText),
)
for (const candidate of input.distilled?.promises ?? []) {
  if (!verifyQuote(candidate.quote, input.runnerText)) {
    demoted.push({ key: 'pending_promises', reason: 'unverified-quote' })
    addFact('other', candidate.text)
  }
}
```

```ts
// after: one loop, one verifyQuote call per candidate, same outcome either branch
const promiseCandidates: PromiseCandidate[] = []
for (const candidate of input.distilled?.promises ?? []) {
  if (verifyQuote(candidate.quote, input.runnerText)) {
    promiseCandidates.push(candidate)
  } else {
    demoted.push({ key: 'pending_promises', reason: 'unverified-quote' })
    addFact('other', candidate.text)
  }
}
```

The diff is small (`+4/−4`) by design — this is exactly the shape of fix the task
authorized ("only refactor if you find genuine mixed-concerns or duplicated logic"),
not an excuse to touch anything else in the function.

**The file's own architecture, as confirmed by the read** (for future sweepers):
`nina_memory_slots` holds one overwritten row per user across a closed 10-key
vocabulary; `nina_memory_facts` is an append-only ledger for everything that doesn't fit
a slot or fails verification; `verifyQuote` is, since task #135, the *only* gate a
promise or nickname candidate must pass to be promoted — there is no longer a
confidence-score threshold running alongside it; and `planMemoryWrites` is the single
call site that turns a turn's distilled output plus any structured `memoryWrite`s into
slot writes, facts, and demotions.

## Decisions & Trade-offs
- **Did not split the file despite its 1270-line size**, because the task explicitly
  forbade splitting on line-count alone and no mixed-concerns seam was found — the file
  is genuinely one cohesive concern (memory distillation), and a line-count-only split
  would have produced no real improvement in reviewability or testability, just more
  files to keep synchronized.
- **Fixed the duplication surgically rather than restructuring `planMemoryWrites`
  further.** The bug was narrowly scoped (one redundant gate evaluation in one step of
  one function); the fix stayed exactly that scoped rather than opportunistically
  reshaping neighboring logic.
- **Pursued the coverage fallback in addition to, not instead of, the duplication fix.**
  The task's fallback clause was phrased as an alternative to refactoring ("if no such
  issue exists, instead..."), but `planMemoryWrites`' branch coverage was worth auditing
  regardless of whether the duplication fix already satisfied the task's letter — it's
  the file's single highest-stakes function, and it had five genuinely untested branches.
- **Did not correct the coordinator's "never touched by any prior token-maxxing session"
  framing in the commit message**, since the 2026-09-12 sweep operated at a different
  level (export usage, not internal logic/branch coverage) and the substance of the
  assigned task — a deep behavioral read — genuinely had not been done before. Noted the
  distinction here instead, for anyone cross-referencing both docs.

## Follow-ups & YAGNI notes
- **Deliberately not done:** no file split (no qualifying reason); no rewording of any
  doc comment (none were found to have drifted); no touching of `imageprefs.ts` or any
  other `lib/nina` module (out of this task's scope — `memory.ts` only); no merge to
  main (worker session; coordinator's job).
- **For a future sweeper:** the 8 new tests close the 5 known gaps in `planMemoryWrites`
  found by this session's manual branch walk; a from-scratch coverage-tool run (e.g.
  `vitest --coverage` scoped to this file) was not performed and could still surface
  smaller gaps this manual audit missed.

## Appendix

**Commit on this branch (worker, not yet merged):**
```
7290dfe refactor(nina): audit memory.ts — dedupe promise quote-verification, cover 8 dead branches
```
2 files changed, 106 insertions(+), 4 deletions(-): `lib/nina/memory.ts` (+4/−4),
`tests/nina.memory.test.ts` (+102).

**Verification performed:** `npm test` — 332 files, 5751 tests, all passing; `npm run
typecheck` (`next typegen` + `tsc --noEmit`) clean; `prettier --check` and `eslint`
clean on `lib/nina/memory.ts` and `tests/nina.memory.test.ts`.

**Session identity:** worker session `nina-memory-audit`, spawned by coordinator
`tokenmax-orch-2026-09-13`; branch `token-maxxing-2026-09-13-nina-memory-audit`;
worktree `/home/miftah/.worktrees/run-insights/tokenmax-2026-09-13-nina-memory-audit`;
commit `7290dfe`; not merged — the coordinator lands worker branches.

**Related sessions:** `2026-09-12-nina-memory-prefs-yagni.md` (the prior day's
knip-driven export-surface sweep of this same file plus `imageprefs.ts`, which this
session's zero-new-dead-exports finding confirms held); the same day's sibling worker
`2026-09-13-nina-turnflight-yagni.md` (concurrent fan-out member under the same
`tokenmax-orch-2026-09-13` coordinator, working `components/nina`/`lib/nina/turnflight.ts`).
