# Token-Maxxing Session — 2026-09-12: Docs Nina Persona Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** Audit `docs/nina/persona.md` — the 29.8KB prose design doc
  that calls itself "the canon" — for staleness and duplication against the actual
  implementation (`lib/nina/persona.ts` and friends), then compact and correct it.
  The premise: a prose design doc this large drifts from the code it describes, and
  a doc that claims canonical status must be trustworthy as ground truth.
- **Concrete changes:**
  - Commit `69fe78c` — `docs/nina/persona.md`: ten corrections, one file,
    +51/−37. The doc's spine survived the audit; what fell were the pieces two
    later plan sets had silently outdated plus a handful of self-abridged
    paraphrases and rotted pinned values.
  - This session doc + its `README.md` index row, committed on the branch.
- **Real value delivered:**
  - **The canon is true again.** Two plan sets (`nina-instructor-character` with
    the R3 horny trait, plus a settings-simplification set) had landed without
    touching the doc. A reader trusting it would have learned a five-level
    relationship ladder that is actually six, a body-repeal of three traits that
    is actually four, a trait-defaults list missing one of seven, a verbosity
    mechanism the code explicitly *declined* to build, and version constants
    pinned two majors stale.
  - **The headline fix is a whole missing persona:** the Instructor — a sixth
    relationship level present in code as `NINA_RELATIONSHIPS`/`NINA_ADDRESS`/
    `NINA_RELATIONSHIP_BLOCKS`, `INSTRUCTOR_COACHING`, `ninaInstructorCoachingBlock`
    and `isInstructor` — was absent from the doc entirely. Now it has the level
    table row, the address table row (`atlet`), and a paragraph on the gated
    coaching block.
  - **Drift made detectable, not just fixed:** the three appearance paragraphs are
    now copied *verbatim* from `NINA_BODY_SENTENCES`/`NINA_FACE`/
    `NINA_DEFAULT_OUTFIT` (exact match verified by script) instead of abridged
    paraphrase — so the next divergence is a diffable fact, not a slow rot nobody
    notices.
  - **Net compaction where the doc had redundant narration:** a post-table
    paragraph that re-narrated F34 row 8 was deleted, its one non-redundant fact
    folded into the row itself.
  - **The negative result is on record:** voice examples, the anger ladder with
    its floor/ceiling bands, the trait/dial tables, the defaults contract, and
    all twelve F34 repeal sites were verified claim-by-claim and *held* — future
    sessions should not re-audit those parts from scratch.
- **Branch:** `token-maxxing-2026-09-12-docs-nina-persona-audit`
- **Merge status:** on branch — worker session of coordinator
  `tokenmax-orch-2026-09-12` (slug `docs-nina-persona-audit`); landing to `main`
  is the coordinator's job. The doc itself is committed on the branch by this
  session before reporting.
- **Approx token burn:** moderate-high — both files read in full (a 29.8KB prose
  doc plus `persona.ts`), then every file-path, constant, table and count claim
  the doc makes verified against ~15 implementation files across `lib/nina`,
  `prompts/*`, `db schema`/`drizzle/`, `app/admin/*` and git history, plus a
  script check for the verbatim appearance paragraphs. 🔥

## Context & Motivation
This was a **worker session** under the day's orchestrator
(`tokenmax-orch-2026-09-12`), assigned one idea from the coordinator's menu rather
than picking from a cold read.

The idea's rationale: `docs/nina/persona.md` is the largest prose design doc in
the repo and the only one that calls itself canon. Its size is exactly what makes
it dangerous — every plan set that touches Nina's personality (new relationship
levels, new traits, simplified settings) risks landing code without walking back
through 30KB of prose to update the sentences that describe it. That had
demonstrably happened: the audit found the drift, it was not hypothetical.

The mandate had two halves: **correct** (make every claim match the tree) and
**compact** (the audit was allowed to cut redundancy found along the way). The
success criterion was that a reader could take the doc as ground truth about
`lib/nina/persona.ts` and be right.

## What We Did (blow-by-blow)

### Phase 1 — read the two sources in full
1. **Read `docs/nina/persona.md` end to end** — voice examples, relationship
   ladder, trait tables, dial tables, defaults contract, the appearance
   paragraphs, the F34 repeal table, the file map, the version-constants
   paragraph, the status line.
2. **Read `lib/nina/persona.ts` in full** as the primary counterpart, then
   treated every other file the doc names as a claim to verify.

### Phase 2 — verify every claim against the tree
3. **Cross-checked each file-path, constant, table and count claim** the doc
   makes against: `lib/nina/tuning.ts`, `lib/nina/prompts/system.ts`,
   `prompts/tools.ts`, `prompts/distill.ts`, `prompts/index.ts`,
   `lib/nina/queries.ts`, `db schema.ts`, `drizzle/`,
   `app/admin/*`, `components/admin/CharacterPanel.tsx`,
   `lib/nina/proactive.ts`, `patterns.ts`, `imagegen.ts`, and `git log` for
   which plan set landed what.
4. **Scored the spine: accurate.** The voice examples, the anger ladder with its
   floor/ceiling bands, the trait/dial tables, the defaults contract, and all
   twelve F34 repeal sites all checked out. The drift was concentrated where the
   later plan sets had landed.

### Phase 3 — ten corrections, committed (`69fe78c`)
5. **The Instructor (correction 1, the big one).** Code has a sixth relationship
   level; the doc said "Five levels" and said nothing else about it. Added:
   the level table row, the address table row (`atlet`), and a paragraph on the
   gated coaching block — `INSTRUCTOR_COACHING` /
   `ninaInstructorCoachingBlock` / `isInstructor` — including its editorial
   rules (prescribes training, never physiology; one change, one deadline, one
   re-read) and that `NINA_NOT_A_DOCTOR` tightens it.
6. **The body repeal is four traits, not three (correction 2, in two places).**
   `BODY_REPEALED_BY` is flirty/steamy/concerned/horny; the doc named three —
   once in the "What she never says" bullet and once in F34 row 4. Both fixed.
7. **`horny` added to the trait-defaults enumeration (correction 3).** It
   defaults to 0 and was simply missing; the `off` list is seven traits now.
8. **The three appearance paragraphs restored to verbatim (correction 4).** They
   had abridged themselves into drift against
   `NINA_BODY_SENTENCES`/`NINA_FACE`/`NINA_DEFAULT_OUTFIT`; now copied word for
   word, with the attribution "phase 12 sends that text" re-pointed at
   `lib/nina/imagegen.ts`. Exact match verified by script.
9. **The verbosity mechanism corrected (correction 5).** The doc's settings row
   claimed the dial "tunes SEND_TOOL's bubbles description" — `prompts/tools.ts`
   records that tuning as *proposed and explicitly DECLINED*. What the dial
   actually varies is OUTPUT_RULE's preference line; the 1–4 bubble cap never
   moves.
10. **Version constants unpinned (correction 6).** The paragraph pinned
    `NINA_PROMPT_VERSION "2 -> 3"` (now 7) and `NINA_DISTILL_PROMPT_VERSION
    "1 -> 2"` (now 3). Rewritten to state the durable fact — chat prompt and
    distill prompt have *separate* version constants — and to stop tracking
    values that rot within days.
11. **File map row rewritten (correction 7).** It still listed "the revision on
    `nina_turns`" — a write-time revision counter the
    simplify-personality-settings set purged.
12. **F34 row 3 re-counted (correction 8).** "Five per-relationship rules" → one
    rule per relationship in `NINA_ADDRESS` — five at repeal time, six since the
    Instructor set.
13. **F34 row 8 absorbed its own narrator (correction 9).** The row's Now cell
    now carries the one thing the post-table paragraph added ("one repeal, one
    list, three places it lands"); the paragraph's arithmetic half stays
    unconditional in the row, and the paragraph itself is deleted. Net
    compaction.
14. **Status line (correction 10).** "draft" → "living canon" — the doc has been
    amended by multiple landing sets; it is not a draft.

## Code / Design Details

**The drift pattern worth naming.** Every correction except 9 and 10 traces to
the same mechanism: a plan set landed a code change whose *documentation
obligation* lived 30KB away in a prose file the set's diff never touched. The
Instructor set added a level, an address, and a coaching block; the horny-trait
amendment added a default and a repeal trait; the settings-simplification set
deleted the revision counter and declined a tool-description tuning. None of the
three sets edited `persona.md`. A "canon" doc that no landing set is obligated
to update is a snapshot, not canon — hence the audit idea, and hence correction
4's design choice below.

**Verbatim-over-paraphrase for the appearance paragraphs.** Before, the doc
paraphrased the three appearance constants, and the paraphrase had drifted. The
fix copies the constants' sentences exactly:

- `NINA_BODY_SENTENCES` → the body paragraph
- `NINA_FACE` → the face paragraph
- `NINA_DEFAULT_OUTFIT` → the outfit paragraph

with an `EXACT MATCH` script check run over the result. The point is not this
particular wording — it is that after this change, drift between doc and code is
mechanically detectable (a diff of two strings) instead of requiring a human to
notice an abridgement stopped matching. The attribution also moved from a
phase-plan reference ("phase 12 sends that text") to the file that actually
sends it (`lib/nina/imagegen.ts`), since phase numbers rot and file paths are
grep-able.

**Declined ≠ implemented — the verbosity row.** The pre-audit doc claimed the
verbosity dial "tunes SEND_TOOL's bubbles description". `prompts/tools.ts`
contains the record that this was *proposed and declined*. The shipped mechanism
is narrower: the dial varies OUTPUT_RULE's preference line only, and the 1–4
bubble cap is fixed. A doc describing a declined design as shipped is worse than
a stale number — it tells a reader a control exists that does not.

**Version constants: state the split, not the values.** The old paragraph read
as a changelog (`NINA_PROMPT_VERSION "2 -> 3"`); reality is 7 and 3 for the two
constants respectively. Any pinned value in prose goes stale at the next bump.
The rewritten paragraph pins only the invariant: there are two separate version
constants, one per prompt family, and they bump independently.

## Decisions & Trade-offs

- **Doc-only scope; code comments left as-is.** Two stale `/admin/nina` comments
  in `lib/nina/persona.ts` and `lib/nina/prompts/system.ts` were found and
  deliberately not fixed — the card was a doc audit, and mixing a code-comment
  commit into a doc-correctness commit muddies both. Recorded as a follow-up.
- **The repeal-3 docstring's "FIVE rules" left alone.** `persona.ts`'s
  repeal-3 docstring still says "FIVE rules, one per relationship" — now six
  since the Instructor set. Left deliberately: it narrates the repeal as
  *history* (what was true when F34 row 3 landed), not as a current-state
  claim, and rewriting history-narration every time the count moves makes the
  docstring a maintenance burden. The doc's *current-state* table is what
  carries the live count.
- **Compaction by deletion of redundant narration, not by shrinking content.**
  The one paragraph deleted (post-F34 table) was redundant with a table cell it
  sat beneath; its unique fact moved *into* the cell first. Nothing was cut for
  brevity's sake — the doc's job is to be complete and true, and 29.8KB of true
  beats 25KB of mostly-true.
- **Values unpinned in prose even though they are easy to look up.** The
  trade-off is the doc is slightly less self-contained (you must open `tuning.ts`
  for the current numbers); the win is the paragraph can never again be wrong.
  For a doc whose failure mode was "wrong", never-wrong-but-quietly-abstract is
  the right side.

## Follow-ups & YAGNI notes

- **`/admin/nina` code comments (small, untouched).** `lib/nina/persona.ts` and
  `lib/nina/prompts/system.ts` both carry comments saying the assembled
  prompt/preview renders at `/admin/nina`; the panel moved to `/admin/personality`
  (commit `2363785`). The doc is corrected; the code comments are not. A
  comment-only cleanup commit would close it.
- **`persona.ts` repeal-3 docstring count.** Still says "FIVE rules, one per
  relationship" (six since the Instructor set). Left as historical narrative on
  purpose — but if a future session disagrees with that reading, it is a
  one-line edit.
- **Candidate follow-up session (named in the assignment's spirit):** the same
  claim-by-claim audit for `lib/nina/prompts/system.ts` against *its own* doc
  comments — the same drift mechanism (later sets landing without updating
  nearby prose) demonstrably operates there, as the `/admin/nina` comment shows.
- **Mechanism follow-up, if the drift recurs:** the root cause is that no plan
  set's definition of done includes "update `docs/nina/persona.md`". A standing
  note in the doc's header naming the constants it mirrors (and that they are
  verbatim copies) would give the next landing set a grep-able obligation.

## Appendix

**Work commit (on `token-maxxing-2026-09-12-docs-nina-persona-audit`):**
```
69fe78c  docs(nina): persona.md audit — sync the canon doc to the shipped canon
         docs/nina/persona.md | 88 ++++++++++++++++++++++----------------------
         1 file changed, 51 insertions(+), 37 deletions(-)
```
HEAD at work-report time: `69fe78c`; this doc and its index row are committed on
top by the session itself before sending its DONE report.

**Files the doc's claims were verified against:**
`lib/nina/persona.ts`, `lib/nina/tuning.ts`, `lib/nina/prompts/system.ts`,
`lib/nina/prompts/tools.ts`, `lib/nina/prompts/distill.ts`,
`lib/nina/prompts/index.ts`, `lib/nina/queries.ts`, `lib/nina/proactive.ts`,
`lib/nina/patterns.ts`, `lib/nina/imagegen.ts`, the db `schema.ts` and
`drizzle/` migrations, `app/admin/*`, `components/admin/CharacterPanel.tsx`,
plus `git log` to attribute each divergence to its landing plan set.

**Verification method, in one line per step:**
1. Read the doc and `persona.ts` in full before verifying anything.
2. For each file-path claim: does the path exist; for each constant claim: does
   the name exist and does its value/shape match.
3. For each table and count claim: recount from the source of truth in code
   (`NINA_RELATIONSHIPS`, `NINA_ADDRESS`, `BODY_REPEALED_BY`, the trait
   defaults), never from the doc's own arithmetic.
4. For mechanism claims (the verbosity dial), check the code's own
   proposal/decline record, not just current behavior.
5. For verbatim copies: script-verified `EXACT MATCH` between doc text and the
   constant's string.

**Audit outcome as a scorecard:** twelve F34 repeal sites, voice examples,
anger ladder + floor/ceiling bands, trait/dial tables, defaults contract — all
verified accurate (the negative result). Ten corrections landed, all traced to
two un-updated plan sets plus self-abridged paraphrase and pinned values.
