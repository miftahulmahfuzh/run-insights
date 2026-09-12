# Token-Maxxing Session — 2026-09-12: Nina Persona & Prompts YAGNI Sweep

## 🎯 Achievement / End Result
- **Goal of the burn:** The coordinator's assigned idea (worker in the
  `tokenmax-orch-2026-09-12` fan-out, slug `nina-persona-comments`): *"YAGNI-sweep
  `lib/nina/persona.ts` and `lib/nina/prompts/` for dead exports and stale doc comments
  (e.g. 'FIVE rules' now six, prompt-preview route moved to /admin/personality)."* The
  premise: these two files had never been dead-code-swept even though the rest of
  `lib/nina` had gotten attention (its readme compaction and its queries.ts YAGNI closure
  both landed earlier), and the knip backlog adopted the same day was concentrated in
  `lib/nina`. One hard constraint was handed down with the assignment: **do not touch
  `lib/nina/.workflows/package_readme.md`** — sibling sessions were active in `lib/nina`
  the same day.
- **Concrete changes:** Two commits on the branch, exactly the two assigned targets and
  nothing else:
  - `c048108` — refactor(nina): YAGNI-sweep persona.ts — `lib/nina/persona.ts` +57/−103
    (160 changed lines): seven dead exports deleted, thirteen values and five types
    un-exported, and the file's stale census and route comments corrected.
  - `f7d50e7` — refactor(nina): YAGNI-sweep prompts/ — 25+/46− across all six files in
    `lib/nina/prompts/` (`caption.ts` 10/11, `describe.ts` 2/2, `distill.ts` 3/9,
    `index.ts` 0/6, `system.ts` 10/16, `tools.ts` 0/2): five dead exports deleted, four
    symbols un-exported, six dead barrel re-exports dropped, and the stale route/count
    comments fixed.
- **Real value delivered:**
  - **The measured headline: knip's repo-wide unused-exports count dropped 150 → 114**,
    and both assigned targets now report **zero** findings — `persona.ts` and `prompts/`
    are off the backlog permanently, not queued for a re-sweep.
  - **Twelve genuinely dead exports deleted** after a zero-importer grep proof for each
    (details below), including several whose own docstrings were the lie — `NEVER_SAY`
    claimed "tests walk this array" (no test ever did), `NINA_CAPTION_PROMPT_VERSION`
    claimed "Logged, never sent" (it was never wired into any log), and
    `DISTILL_SYSTEM_PROMPT` claimed "every existing importer keeps compiling" when no
    importer was left.
  - **Twenty-three symbols un-exported** (18 in `persona.ts` — 13 values + 5 types — plus
    2 in `system.ts`, and one each in `caption.ts`, `describe.ts`, `distill.ts`): all
    used in-file only, so they keep working but stop posing as public API. This is the
    distinction knip doesn't make for you — deletions vs un-exports was decided by
    in-file usage, not by which knip section the finding appeared in.
  - **The barrel got honest.** `prompts/index.ts` lost six dead re-exports
    (`LANGUAGE_RULE`, `NUMBERS_RULE`, `CONTEXT_GUIDE`, `buildCameraBlock`,
    `NINA_TOOL_NAMES`, `SET_AVATAR_TOOL`) — the last of those is a real export that stays
    (`avatartools` imports the tool itself from `./tools`), only its phantom re-export
    died.
  - **Thirteen-plus stale doc comments corrected** — the drift class the coordinator
    specifically called: the "FIVE rules, one per relationship" comment that has been
    wrong since the instructor relationship landed (now SIX), the "/admin/nina"
    prompt-preview route that moved to `/admin/personality`, a band census that predated
    R3's `horny` band, "ELEVEN traits" that are now twelve, a "twenty names" count now
    twenty-one, and brittle `:403`/`:391`-style line references that were already off.
  - **Prompt bytes proven unchanged.** `NINA_PROMPT_VERSION` was deliberately **not**
    bumped: no system text and no tool schema moved (dead constants and comments only),
    and the proof is mechanical — the four-render snapshot test passes **unregenerated**,
    which can only happen if the assembled prompts are byte-identical.
  - **All gates green** (details in Appendix): typecheck clean after `next typegen`;
    targeted vitest over the seven nearest test files 362/362; the full sweep's only six
    failures are the documented parallel-load race-simulation flake, each passing under
    `--no-file-parallelism`.
- **Branch:** `token-maxxing-2026-09-12-nina-persona-comments` (worktree
  `tokenmax-2026-09-12-nina-persona-comments`), two commits `c048108` + `f7d50e7` on top
  of `b39c6e5`.
- **Merge status:** on branch, **not merged — awaiting coordinator landing**. Worker mode:
  this session reports to coordinator `tokenmax-orch-2026-09-12`, which owns the merge.
- **Approx token burn:** no meter was read; by shape a mid-weight worker session whose
  spend is audit-dominant over a modest diff — two knip passes (the first silently
  truncated, see the gotcha), ~36 findings each individually cross-checked by
  word-boundary grep across the whole repo including non-TS scrape-contract files,
  thirteen-plus comment corrections each requiring re-derivation of the *current* truth
  (band census, trait count, relationship count, the actual prompt-preview importer),
  the full gate battery, and this doc. The tokens bought verdicts with receipts, not line
  count. 🔥🔥

## Context & Motivation
`lib/nina` is the repo's largest and most personality-laden package, and until this week
it had never had a systematic dead-code pass. Earlier 2026-09-11/12 sessions had chipped
at it — `lib-nina-queries-yagni` removed its one dead query export, and the package's
readme got the campaign's most aggressive compaction — but `persona.ts` (the ~1500-line
persona definition) and the whole `prompts/` directory (the system-prompt assembler and
per-surface prompt builders) had been skipped by every prior sweep. The same-day knip
adoption (`npm run knip`, by session `dead-export-tooling`) turned "is anything here
dead?" from a hand-rolled grep/AST expedition into one command, and the resulting backlog
showed the unswept concentration was exactly here.

This was a **worker session** in the day's coordinator fan-out, so there was no Step-4
idea menu — the assignment arrived pre-chosen, scoped to exactly two targets, with two
guardrails: the `/admin/personality` route move (the prompt-preview UI no longer lives at
`/admin/nina`) was called out as a known-stale comment class to hunt, and
`lib/nina/.workflows/package_readme.md` was off-limits because sibling sessions in the
same fan-out were active in `lib/nina` the same day and that file is the shared resource
most prone to add/add collisions.

## What We Did (blow-by-blow)
1. **Knip census — and the first gotcha.** The first `npm run knip` run piped through
   `tail -120` cut off the entire "Unused exports (150)" section — only the exported-types
   section survived the tail, which read like a clean-ish report until cross-checked
   against the section header that *did* say 150. Rerun with `--include exports` revealed
   the full value list. Lesson recorded: knip's output sections are long enough to
   out-tail a casual pipe; read sections by name, not by tail position.
2. **Per-finding grep cross-check.** Every knip finding in the two targets was
   word-boundary-grepped independently before touching, including non-TS files
   (`.md`, `.mjs`) for the regex-scrape contract class that is knip's known blind spot.
   **None found in scope** — the documented `EXTRACTION_SHAPE` false positive lives in
   `lib/llm/prompts/extraction.ts`, outside this session's two targets, and was left
   alone. Prose-only mentions (a comment naming a symbol nothing imports) were counted
   as zero importers, per the dead-export-sweep playbook.
3. **`persona.ts` sweep (`c048108`).** Seven deletions, eighteen un-exports, and the
   comment-correction pass:
   - **Deleted (zero importers anywhere, prose mentions only):** `NINA_IDENTITY`,
     `NAME_RULES`, `ANGER_LADDER_BLOCK`, `NEVER_SAY_BLOCK` — the four "default render
     under the name system.ts imports" constants, a lie since the tuning set made
     `system.ts` import the build functions directly; `NEVER_SAY` (derived array whose
     "tests walk this array" docstring was false); `NINA_NAME`; and `ninaBodyBlock`
     (imagegen's rung table slices `NINA_BODY_SENTENCES` itself and repairs empties in
     `ninaAppearance` — the helper had no reader).
   - **Un-exported (used in-file only):** `isTurnedUp`, `NINA_RELATIONSHIP_BLOCKS`,
     `NINA_DEFAULT_OUTFIT`, `NINA_OUTFIT_SUFFIX`, `NINA_APPEARANCE_FULL_DETAIL`,
     `isGirlfriend`, `ANGER_FLOOR_BY_BAND`, `ANGER_CEILING_BY_BAND`, `THREAT_REPEALED_BY`,
     `NEVER_SAY_ENTRIES`, `ninaNeverSay`, `NINA_TRAIT_BANDS`, `NINA_DIAL_BANDS`, plus
     types `NinaRelationshipSpec`, `AngerRungName`, `NeverSayEntry`, `NinaTraitBands`,
     `NinaDialBands`.
   - **Comments:** "FIVE rules, one per relationship" → SIX (the instructor relationship
     landed); "Empty at the other four levels" → five; the header and `identityBandOf`
     band census now include R3's `horny` in the off-band list, fifteen → sixteen
     hand-checked band decisions; the export-rationale sentences rewritten where the
     export itself was the lie (`isTurnedUp`, `isGirlfriend`, and `isInstructor` — the
     last kept its export, only its rationale was false); the header's array-walk claim
     now names the arrays `tests/nina.prompts.test.ts` actually walks; two `/admin/nina`
     prompt-preview citations → `/admin/personality`.
4. **`prompts/` sweep (`f7d50e7`).** Per file:
   - `system.ts`: deleted `NUMBERS_RULE` and `CONTEXT_GUIDE` (dead default renders — the
     assembler calls `buildNumbersRule`/`buildContextGuide` directly); un-exported
     `LANGUAGE_RULE` and `buildCameraBlock`; "ELEVEN traits" → TWELVE; "twenty names /
     system.ts:1-21" → twenty-one with the brittle line range dropped; one `/admin/nina`
     citation fixed; "four of the five relationships" → five of the six.
   - `caption.ts`: deleted `NINA_CAPTION_PROMPT_VERSION` — declared "Logged, never sent"
     but never wired into any log (the **titler's** version *is* logged, by
     `autotitle.ts`; caption's never was); un-exported `NINA_CAPTION_SEEN_CHARS`; the
     header now says to reintroduce the version constant **together with its consumer**;
     one `/admin/nina` citation fixed and one "four of the five relationships" → five of
     the six.
   - `distill.ts`: deleted `DISTILL_SYSTEM_PROMPT` ("every existing importer keeps
     compiling" had no importers left; `buildDistillSystemPrompt` is the live path);
     un-exported `SLOT_VOCABULARY_BLOCK`; `/admin/nina` citation fixed.
   - `describe.ts`: un-exported `NINA_DESCRIBE_REQUEST_TEXT_MANY`; `/admin/nina`
     citation fixed.
   - `tools.ts`: deleted `NINA_TOOL_NAMES` (derived array with no reader).
   - `index.ts`: the six dead re-exports above dropped — file now re-exports only what
     someone actually imports through the barrel.
5. **Gates.** `npm run typecheck` (next typegen + `tsc --noEmit`) green; targeted vitest
   over the seven nearest test files 362/362; full sweep assessed for collateral (see
   Appendix — the six reds are all pre-existing parallel-load flakes in files that don't
   import anything touched); knip re-run confirming the assigned targets at zero.

## Code / Design Details
**The deletion-vs-un-export rule, applied:** knip reports "unused exports" as one undifferentiated
list, but the two remedies mean different things. A symbol with **zero references
anywhere** (not even in its own file) is dead weight — deleted. A symbol whose only
references are **inside its own file** is alive but over-exposed — un-exported, shrinking
the module's public surface without losing behavior. Applying in-file usage as the
criterion kept `ANGER_FLOOR_BY_BAND` (the band math reads it locally) while deleting
`ANGER_LADDER_BLOCK` (nothing reads it anywhere), even though knip flagged both in the
same section.

**The `NINA_PROMPT_VERSION` proof:** the strongest guarantee this sweep changed no model
behavior is negative and mechanical. The repo's four-render snapshot test pins the exact
assembled prompt bytes; it passed **without regenerating the snapshots**. Had any live
system text or tool schema moved — even a reordered key — the snapshot would have failed
and forced a version bump plus regeneration. It didn't fire, so the sweep's entire diff
is provably inert at the model boundary.

**The comment-correction class, exemplified.** Before/after shape of the fixes (persona.ts,
abridged):

- `"FIVE rules, one per relationship"` → `"SIX rules, one per relationship"` — the
  instructor relationship landed in the tuning set; the count comment never followed.
- `"Empty at the other four levels"` → five — same drift, arithmetic dependent on the
  rule count above.
- Band census: fifteen → **sixteen** hand-checked band decisions, and the off-band list
  now includes R3's `horny` — a whole band missing from the census comment.
- `"ELEVEN traits"` → TWELVE; `"twenty names (system.ts:1-21)"` → twenty-one, and the
  `:1-21` line range dropped entirely — line-pinned citations rot the fastest, so two
  more (`NINA_NOT_A_DOCTOR :403`, `NINA_EXPERTISE :391`) were dropped rather than
  re-pinned.

**The route-move corrections.** The prompt-preview UI lives at `app/admin/personality/page.tsx`
now; `app/admin/nina` is the album/file manager alone. Four stale prompt-preview
citations to `/admin/nina` across `persona.ts`, `system.ts`, `describe.ts`,
`distill.ts` and `caption.ts` now point at `/admin/personality` — the class the
coordinator predicted when assigning.

**Barrel hygiene.** `prompts/index.ts` before: re-exported six symbols nobody imported
through it (including `SET_AVATAR_TOOL`, whose real importer `avatartools` goes to
`./tools` directly). After: only consumed re-exports remain. A barrel that re-exports
dead names isn't just noise — it makes the *next* sweep's dead-symbol grep hit the
barrel, the definition, and the consumer as three separate sites to disambiguate.

## Decisions & Trade-offs
- **Deletions vs un-exports decided by in-file usage, not knip's section** (above).
  Consequence: the diff has two shapes — hard deletions for the provably unread, and
  `export` keyword removals for the merely private — and a future reader can tell which
  remedy each finding got from the diff alone.
- **`NINA_PROMPT_VERSION` NOT bumped.** Tempting to treat any touch of `prompts/` as a
  prompt change; it isn't. No system text and no tool schema moved, and the unregenerated
  snapshot pass proves prompt bytes are identical. Bumping would have been pure
  version inflation and would have forced a snapshot regeneration for zero behavior
  change.
- **Scope discipline held against knip's wider list.** Knip also flags duplicate exports
  in `schema.ts`/`turnflight.ts` and backlog in `context.ts`/`imagegen.ts` and elsewhere
  in `lib/nina` — all left for sibling sessions or a second sweep wave. The assignment
  was two targets; `lib/nina` had multiple sessions active the same day, and sweeping
  past the boundary is how two workers rewrite the same file. One known residue was
  accepted and recorded rather than fixed out of scope: `imagegen.ts:198` prose still
  names the deleted `ninaBodyBlock`.
- **`package_readme.md` untouched** per the assignment constraint, even though the sweep
  changed facts a readme might state (export surface, symbol inventory). The sibling
  readme sessions own that file today; a one-day-stale readme is cheaper than an add/add
  collision.
- **Drift noted, not fixed, where a fix would be a prompt edit:** the `usual_running_days`
  example in `prompts/tools.ts` slotKey descriptions is likely outside the closed slot
  vocabulary (persona.ts's own comment says so) — but correcting it changes prompt bytes,
  which requires a `NINA_PROMPT_VERSION` bump and snapshot regen. Not a YAGNI sweep's
  call. Same for `system.ts`'s "the other thirteen vary CHARACTER text" arithmetic, which
  is ambiguous under the sixteen-key census but not demonstrably false — left as-is.

## Follow-ups & YAGNI notes
- **The knip backlog remains in `lib/nina` OUTSIDE these two files:** `context.ts` types,
  `imagegen.ts` consts, `distill.ts` timing consts, `proactive.ts`, `memory.ts`,
  `search.ts`, `vision.ts`, plus the duplicate-export pairs —
  `NinaMemoryWriteSchema|SaveMemoryArgsSchema` in `schema.ts` and
  `NINA_BACKGROUND_BUDGET_MS|NINA_TURN_POLL_GIVE_UP_MS` in `turnflight.ts`. That is a
  second sweep wave (or sibling assignments), not this one.
- **`imagegen.ts:198` prose still names the deleted `ninaBodyBlock`** — a dangling
  comment reference, out of scope today, one-line fix for the next toucher of that file.
- **`lib/nina/caption.ts` never logs a prompt version.** If caption tracing ever matters,
  reintroduce `NINA_CAPTION_PROMPT_VERSION` together with its consumer (the log call) —
  the file's header now says exactly that, so the next sweep doesn't re-delete a
  reintroduced constant as "dead".
- **The `usual_running_days` slotKey example** (above) is a deliberate leave-alone: it is
  a prompt edit wearing a comment-edit costume, and prompt edits carry the version-bump
  + snapshot-regen tax.
- **`system.ts`'s "other thirteen" arithmetic** is ambiguous under the sixteen-key census
  — left as-is because it is not demonstrably false, and a YAGNI sweep should not trade a
  possibly-wrong number for a definitely-debated one.

## Appendix
- **Commits:** `c048108` refactor(nina): YAGNI-sweep persona.ts — dead exports and stale
  doc comments (1 file: `lib/nina/persona.ts` +57/−103); `f7d50e7` refactor(nina):
  YAGNI-sweep prompts/ — dead re-exports, unconsumed constants, stale comments (6 files,
  +25/−46: `caption.ts` 10/11, `describe.ts` 2/2, `distill.ts` 3/9, `index.ts` 0/6,
  `system.ts` 10/16, `tools.ts` 0/2). Branch base `b39c6e5`; head `f7d50e7`.
- **Branch:** `token-maxxing-2026-09-12-nina-persona-comments`, worktree
  `tokenmax-2026-09-12-nina-persona-comments`. NOT merged — worker reports to coordinator
  `tokenmax-orch-2026-09-12`, which owns merges.
- **Knip numbers:** unused exports 150 → 114 repo-wide (36 findings resolved by this
  sweep across the deletions, un-exports, and the barrel re-export removals); findings
  attributable to `persona.ts` + `prompts/` now zero.
- **Gates as run:**
  - `npm run typecheck` (next typegen + `tsc --noEmit`) — green.
  - Targeted vitest, 7 files: `nina.prompts`, `nina.tuning`, `nina.caption`,
    `nina.distill`, `nina.imagerecipe`, `nina.context`, `admin.tuning` — 362/362 green.
    The four-render prompt snapshot passed **unregenerated**, proving prompt bytes
    unchanged.
  - Full sweep 5231/5237 — the 6 failures are ALL in race-simulation files
    (`admin.imageGenActions`, `nina.burstCancel`, `nina.chatDedupe`,
    `nina.chatPhotoReattach`, `nina.turnrevive`, `SelectionPane`) that import nothing
    this sweep touched; all 6 pass 75/75 under `--no-file-parallelism` — the documented
    parallel-load flake, reproduced on clean HEAD in prior sessions.
- **Gotcha of the day:** the first `npm run knip` run piped through `tail -120` cut off
  the entire "Unused exports (150)" section — only the types section showed. Rerun with
  `--include exports` surfaced the value list. Read knip's sections by name, never by
  tail position.
- **Scope boundary held:** knip's remaining `lib/nina` findings (context/imagegen/
  distill/proactive/memory/search/vision, the schema.ts and turnflight.ts duplicate
  pairs) untouched for siblings/future waves; `lib/nina/.workflows/package_readme.md`
  untouched per assignment constraint; `lib/llm/prompts/extraction.ts`'s documented
  `EXTRACTION_SHAPE` knip false positive untouched (outside scope).
