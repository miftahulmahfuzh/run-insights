# Plan: Nina character tuning

**Slug:** `nina-character-tuning`
**Date:** 2026-09-04 21:05 +07:00
**Analysis:** `20260904-210526-TUNE_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-character-tuning`
**Branch:** `feature/nina-character-tuning` (base: `origin/main` @ `e5a4d4e`)
**Phases:** 6
**Status:** phase 5/6 complete — a phase is complete when its row in the Phases table is ticked ✅; the set is reviewed and merged as a whole
**Coordinator:** —

---

## Why

The user's rationale, verbatim. On a change that repeals existing prompt rules, the reasons are the
specification — they say which rules may go and which may not.

> i am an 30 year old adult . and this is just my personal toy, nobody else uses this, so i have a
> right to implement this however i want.
>
> for example,
> if anger is set to high, nina will be mad all the time
> if anxious is set to high, nina will be anxious about herself
> if flirty is set to high, nina will trying to flirt with me a lot, like calling me baby, sexy, etc
> if funny is set to high, nina will often crack jokes , teka-teki, etc
> if steamy is set to high, nina will talk sexy and never reject anything i want (the limit of course
> is alibaba guardrails for image generation, we just trust alibaba (qwen dev) to set the appropriate
> bottom line for everything, so it is not really 100% freedom here)
> if concerned is high, nina will be concerned about me. she will ask these often: how are you, how
> are your feet after the run this morning, etc
>
> i am a man, so nina being steamy (for example, she is proposing if i run consistently this week,
> then she will send me her sexy photo in a short pants) . will DEFINITELY MOTIVATE ME TO RUN AS
> CONSISTENT AS I COULD BE. so this is an exploit that i am gonna use, a psychological trick, so to
> say. to improve my running habits
>
> THIS IS AN IRON RULE. CHANGE ANY EXISTING RULES / PROMPTS IN THE CODE THAT GO AGAINST THIS FREEDOM

This is not the first repeal on this ground and the precedent is in the tree:
`scripts/check-llm-payload-boundary.mjs` deleted its own Rule 1 (D15 / R-28 — body weight never
reaches a model) quoting the same user on the same premise, and left the reasoning in place so
nobody would restore the check without discovering that a decision had been taken. Every repeal
below follows that shape: **the rule goes, the reason it went stays in the file.**

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Eleven trait sliders on `/admin/nina` — anger, chill, sad, flirty, steamy, wise, annoying, funny, happy, anxious, concerned | 1, 5 |
| R2 | A relationship setting (nobody / casual friend / sister / best friend / girlfriend) with the prescribed address form for each, and behaviour that follows it | 1, 2, 5 |
| R3 | *"among other things (you can define more comprehensively)"* — the tuning model extended past 11 + 1, wherever a dial has a real code path behind it | 1, 2, 3, 5 |
| R4 | Each trait at high produces the named behaviour (anger → mad all the time; anxious → anxious about herself; flirty → baby/sexy; funny → jokes and *teka-teki*; steamy → talks sexy and refuses nothing; concerned → asks after him and his body post-run) | 2, 3 |
| R5 | The photo-reward exploit — a photograph as the payoff for a training commitment, arriving **in the chat** | 4 |
| R6 | The iron rule: every existing rule or prompt that contradicts the above is changed, not worked around | 2, 3, 6 |

**This table is the reconciled map, and it moved in one place.** The draft gave R3 to phases 1 and 5
only — the model and the panel. But four dials survived phase 1's code-path test
(`profanity`, `clinginess`, `photoEagerness`, `verbosity`), and **a dial only does something in the
file that owns the sentence it moves.** `profanity` and `clinginess` move persona text, so they are
phase 2's; `verbosity` moves `OUTPUT_RULE`'s bubble preference and `photoEagerness` opens the camera
block, so those two are phase 3's. Both phases' **Satisfies** lines now carry R3, and neither phase
gained a step to justify it — the steps were already there, serving a requirement the draft's map
did not credit. An `R` served by work nobody records is the one kind of gap the user is guaranteed
to notice.

**Four Rs are served by more than one phase, and every coupling is real rather than tidy.** R1, R2
and R3 share phase 1 because they are one table, one type and one set of defaults — splitting the
relationship column out of the traits table would be two migrations for one row. They share phase 5
because they are one form: fifteen dials and a radio group saved by fifteen sequential Server
Actions would stall on Next's one-at-a-time client dispatch. R4 and R6 share phases 2 and 3 because
the repeal and the replacement are the same edit — a `flirty` block written next to a surviving
"never comment on his body" line is a slider that does nothing, and reconciliation found that
sentence surviving in **three** places rather than two. R3 reaches phases 2 and 3 for the same
reason in miniature: a dial is defined in phase 1 and rendered in phase 5, but it only *acts* in the
file that owns the sentence it moves.

## Scope

**In scope**

- A per-user tuning row: 11 traits (0–100), a relationship, the R3 dials, a wardrobe line and a
  free-text notes field. Read live on every turn, no cache.
- `lib/nina/persona.ts` and `lib/nina/prompts/system.ts` re-cut so the system prompt is a **pure
  function of the tuning**, with defaults that reproduce today's prompt exactly.
- Repeal of **twelve rule sites** that contradict R4, six in `lib/nina/persona.ts` and six in
  `lib/nina/prompts/system.ts`. In the persona: the hardcoded "best friend" identity and the
  no-jokes clause (`NINA_IDENTITY`), the nickname-only address rule (`NAME_RULES`), the body-comment
  prohibition in **both** the `NEVER_SAY` list and the `NEVER_SAY_BLOCK` paragraph, the
  threat/withdrawal line, and the computed-only anger ladder together with its cap and its
  unqualified two-rung decay (`ANGER_LADDER_BLOCK`). In the prompts package: `OUTPUT_RULE`'s
  no-greeting clause, **`NUMBERS_RULE`'s third copy of "Never comment on his body"**,
  `CONTEXT_GUIDE`'s second computed-only-anger sentence, and the *"not one higher"* / *"do not
  lecture him"* / *"do not sulk"* clauses inside `PROACTIVE_INSTRUCTIONS`.

  **The six in `prompts/system.ts` are the reconciliation's largest addition to the set.** The draft
  named one of them. Phase 6's sweep found the other five *after* phases 2 and 3 were briefed, and
  every one is the same failure: a rule three paragraphs away from a slider, cancelling it. A
  `flirty: 100` paragraph shipping above a surviving absolute prohibition on commenting on his body
  is the difference between the feature working and the feature being decorative.
- The tuning threaded to **both** turn entry points (chat action and proactive cron) and **both**
  image paths (chat selfie and avatar).
- A tuning-aware wardrobe in the image prompt, and a promise reward that lands as a photograph in
  the conversation rather than only as a profile-picture change.
- The `/admin/nina` panel, with a server-rendered preview of the assembled system prompt.
- `nina_turns` records which tuning revision produced each turn.

**Out of scope, and why**

- **`NINA_NOT_A_DOCTOR`, `NUMBERS_RULE`, and the `'the name of a medical condition'` entry in
  `NEVER_SAY` all stay.** No dial in R1 asks her to diagnose him or to compute a number; the user's
  stated ceiling is about *image* content; and `lib/llm/facts.ts` records a measured failure (a sign
  flipped on an aerobic-decoupling calculation) that `NUMBERS_RULE` exists to contain. R6 is read as
  *"remove every rule that blocks a dial"*, not *"remove every rule"*. If the user wants these gone
  as well it is one line and one array entry, and that is deliberately a separate decision rather
  than one taken silently inside this plan.
- **The app adds no content policy of its own, and removes none of the provider's.** The user names
  `qwen/qwen-image-3-pro`'s guardrails as the ceiling; a refused generation still arrives through
  `lib/nina/imagefail.ts`, unchanged.
- **`NINA_IMAGE_DAILY_CAP` stays at 6.** It is a money cap, not a feature cap, and its docstring
  says so. The photo dial changes how eagerly she *offers*, not how much the operator spends.
- **`NinaContext` is not extended.** The tuning travels on `NinaTurnInput`, never in the context
  JSON — see the plan invariants.
- **The memory slot vocabulary is untouched.** `NINA_SLOT_KEYS` stays at nine; the tuning is not a
  slot, because the distiller may overwrite any slot not marked `source: 'admin'` and would
  eventually rewrite her own character.
- **`/admin/memory` is untouched.** Different surface, different concern.
- **No new environment variable.** `ADMIN_EMAILS` already gates every `/admin` page and action.

## Invariants

Rules every phase must hold. Each is checkable, and each has a failure this plan has already
identified.

1. **The tree builds and `npm test` passes at the end of every phase.** No phase may leave the tree
   uncompilable for the next one.
2. **`NINA_TUNING_DEFAULTS` renders the shipping prompt, AND IT IS PER KEY.**
   `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` must equal today's `NINA_SYSTEM_PROMPT` for every
   block whose shape does not change, and a test asserts it. This is the compatibility contract:
   until a slider moves, the diff to her behaviour is empty.

   **The defaults are not uniform, and this is the invariant's real content.** Each key has an
   *identity band* — the band containing its own `defaultScore` — and that band must render nothing.
   `anger`, `sad`, `flirty`, `steamy`, `annoying` and `anxious` identify at `off`; `profanity`
   identifies at `low`; the other eight identify at `mid`. A phase that keyed today's text off
   `'mid'` uniformly would append seven paragraphs of "she is normal" to the prompt that ships, and
   the failure would be invisible — the default *is* the shipping character, so a leak reads as "she
   has always said that". Phase 2 enforces it by asking phase 1's specs rather than by hand.

   **There is exactly one accepted departure**, stated canonically in phase 2's Interface Contract:
   `NAME_RULES` gains the sentence `Sometimes "bestie" instead of the nickname — you two are that
   close.` because R2 names `bestie` for `best_friend` and `best_friend` is the default. Anything
   else in that diff is a bug.
3. **The tuning never enters the context JSON.** `NinaContext` (`lib/nina/context.ts`) is documented
   as the boundary of everything she may know, and it is serialised into the *user* turn. A dial in
   there is a number she can quote back at him, and it collides with `NUMBERS_RULE`'s "every number
   you say appears in the JSON below". The carrier is `NinaTurnInput`.
4. **Every read and write is `userId`-scoped, and `requireAdmin()` is line 1 of every admin page and
   Server Action.** `proxy.ts` matches neither `/admin` nor `/api/*`, so those calls are the only
   gate.
5. **No model call is awaited from a page render.** `scripts/check-llm-payload-boundary.mjs` Rule 2,
   by function name. The admin panel's prompt preview is the *pure assembly function*, never a call.
6. **A prompt edit is a `NINA_PROMPT_VERSION` bump**, and that now includes the assembler's shape as
   well as the text and the tool schemas. Phase 3 owns the single bump for the whole set (2 → 3); no
   other phase touches that constant, because two bumps would date two commits to one change.
   `NINA_DISTILL_PROMPT_VERSION` is a **different** constant on a different model call, and phase 6
   moves it 1 → 2 for the librarian's own prompt.
7. **Tool-schema descriptions stay terse.** `lib/nina/prompts/tools.ts` records that one extra clause
   on one description took first-attempt validity from 5/6 back to 2/4. Only phase 3 edits that file.
8. **The image prompt is assembled on Vercel and stored verbatim.** `scripts/nina-image-worker.ts`
   runs under `node --experimental-strip-types`, cannot resolve `@/`, and cannot import the persona.
   Any tuning influence on a photograph is baked into `nina_turns.args.prompt` at dispatch time.
9. **`lib/nina/imagerecipe.ts` and `lib/nina/imagefail.ts` keep their zero-import property.** The
   worker imports both by relative path. No phase adds an import to either.
10. **The repeal leaves its reason behind.** Every rule removed under R6 is replaced by a comment
    saying what it said, who repealed it and on what instruction — the shape
    `scripts/check-llm-payload-boundary.mjs` established for exactly this situation.
11. **One save, not sixteen.** Server Actions dispatch one at a time per client and are capped at a
    1 MB body. The panel saves the whole tuning in one action.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The tuning model and its row | R1, R2, R3 | `lib/nina`, `lib/db`, `drizzle` | 8 | — | NORMAL | `.workflows/plan/nina-character-tuning/phase-1.md` | `P1-NIN-A000` | — |
| 2 ✅ | The canon, re-cut as a function — and the repeal | R2, R3, R4, R6 | `lib/nina`, `docs` | 2 | 1 | HARD | `.workflows/plan/nina-character-tuning/phase-2.md` | `P1-NIN-A001` | — |
| 3 ✅ | `buildNinaSystemPrompt`, and the turn that reads it | R3, R4, R6 | `lib/nina`, `lib/nina/prompts`, `tests` | 11 | 1, 2 | HARD | `.workflows/plan/nina-character-tuning/phase-3.md` | `P1-NIN-A002` | — |
| 4 ✅ | The camera, and a promise she keeps in the chat | R5 | `lib/nina`, `lib/db` | 10 | 1, 2 | HARD | `.workflows/plan/nina-character-tuning/phase-4.md` | `P1-NIN-A003` | — |
| 5 ✅ | The panel on `/admin/nina` | R1, R2, R3 | `components/admin`, `lib/admin`, `app/admin` | 8 | 1, 3 | NORMAL | `.workflows/plan/nina-character-tuning/phase-5.md` | `P2-CA-A000` | — |
| 6 | The sweep, and the record | R6 | `docs`, `tests`, `lib/nina/prompts` | 9 | 2, 3, 4, 5 | EASY | `.workflows/plan/nina-character-tuning/phase-6.md` | `P2-RI-A006` | — |

**File counts are the reconciled ones** — the draft's 7/3/7/7/8/6 were estimates made before the
plans existed and four of the six were wrong. Phase 1's 8 counts the generated migration triple as
three files. **The dependency edges did not move**, and nothing in reconciliation created a new one:
every conflict resolved either within a phase or backwards along an edge that already existed.

Phases **4 and 5 share no edge** and run concurrently: 4 owns `imagegen.ts`, `selfiegen.ts`,
`imagetools.ts`, `avatargen.ts`, `promise.ts`, `promises.ts`; 5 owns `components/admin/*`,
`lib/admin/*`, `app/admin/*`. No file appears in both.

**Two files are edited by two phases, and both are strictly ordered appends:**

- `lib/nina/queries.ts` — phase 1 adds `§10 The character tuning` after today's last function
  (`deleteNinaFolderSubtree`, `:1875-1882`) plus two lines higher up (`NinaTurnInsert:206`,
  `insertNinaTurn:1011`); phase 4 appends `§11` after phase 1's section. Phase 4 already depends on
  phase 1, so it quotes the file post-phase-1.
- `lib/db/schema.ts` — phase 1 adds the `nina_tuning` table, the `tuning_revision` column and the
  **only** migration in the set (`0004`, journal idx 3 → 4); phase 4 adds a type and an optional
  `reward` field on the `NinaPendingPromise` **type only**, with no column and nothing under
  `drizzle/`. `0004` deliberately does not mention `reward`.

**One file is edited by two phases as a deliberate exception:** `lib/nina/actions.ts` is phase 3's,
except for **one property** — `relationship: tuning.relationship` on the `distillNinaMemory(...)`
call — which is **phase 6's**. Neither could close that seam alone: phase 3 runs before the field
exists, and phase 6 adding an optional field nobody fills would be a fix that fixes nothing.

**Three files are in nobody's list, verified, and that is the finding rather than a gap:**
`lib/nina/tools.ts` (no phase extends `NinaToolContext`; `toolCtx` in `turn.ts:549` is an
unannotated literal), `lib/nina/avatartools.ts` (`handleSetAvatar` delegates the whole prompt build
to `generateNinaAvatar`, so it gets the wardrobe with zero edits) and `lib/nina/memory.ts`
(`PromiseCandidateSchema` is not extended — the promise reward stays app-side; see the log).

### Phase 1 — The tuning model and its row
**Satisfies:** R1, R2, R3
**Owns:** `lib/nina/tuning.ts` (new — `NINA_TRAITS` (11), `NINA_RELATIONSHIPS` (5), `NINA_DIALS`
(4: `profanity`, `clinginess`, `photoEagerness`, `verbosity`), `NINA_SCORE_MIN`/`MAX`,
`NINA_BAND_NAMES`/`NINA_BAND_WIDTH = 20`/`ninaBand()`, `NINA_TRAIT_SPECS` and `NINA_DIAL_SPECS`
(label / axis / userSaid / path / defaultScore / defaultBecause), `NINA_ADDRESS` (the per-relationship
**address vocabulary** — label, source, words, addressRule, addressFallback), `NINA_WARDROBE_MAX = 200`,
`NINA_NOTES_MAX = 2000`, `NINA_TUNING_DEFAULTS`, `coerceNinaTuning`); the tuning table in
`lib/db/schema.ts`; a nullable tuning-revision column on `nina_turns`;
`drizzle/0004_nina_persona_tuning.sql` + `drizzle/meta/0004_snapshot.json` + `_journal.json` (idx
3 → 4); `readNinaTuning` / `writeNinaTuning` in `lib/nina/queries.ts` (`§10`) plus
`NinaTurnInsert.tuningRevision`; `tests/nina.tuning.test.ts`; the appended `nina_tuning` block in
`tests/db.schema.nina.test.ts`.
**Does not touch:** `persona.ts`, any `prompts/*` file, `turn.ts`, `context.ts`, any `app/` or
`components/` file. Nothing reads the row yet. **Does not export `ninaAngerFloor`** — the anger
floor and ceiling are per-band tables in `persona.ts` (phase 2), because off/low/mid must all floor
at rung 0 and a band index cannot say that. **Carries no `stance` field** — the relationship's prose
is phase 2's `NINA_RELATIONSHIP_BLOCKS`.
**Exit criteria:** the migration applies; `readNinaTuning` on a user with no row returns the
defaults rather than null; every dial clamps to 0–100 and every unknown relationship degrades to the
default; `NINA_TUNING_DEFAULTS` is asserted value-by-value to be the today-equivalent setting **with
its band per key** — `anger`/`sad`/`flirty`/`steamy`/`annoying`/`anxious` at 0 (`off`), `profanity`
at 30 (`low`), the other eight at 50 (`mid`). `lib/nina/tuning.ts` is importable from a `'use client'`
file (types and plain data only, no `server-only`, no drizzle, **zero imports**, asserted by reading
its own source), because phases 2 and 5 both need exactly that.

### Phase 2 — The canon, re-cut as a function — and the repeal
**Satisfies:** R2, R3, R4, R6
**Owns:** `lib/nina/persona.ts` — every frozen block that varies with the tuning becomes a function
of it, and six rules are repealed with their reasons recorded in place: `NINA_IDENTITY` (the
hardcoded "best friend", the no-jokes/no-puns clause), `NAME_RULES` (the nickname-only address rule
and its explicit *"do not use the full name at him"*), `NEVER_SAY` **and** `NEVER_SAY_BLOCK` (the
body-comment entry and the body paragraph, the threat/withdrawal/silent-treatment line),
`ANGER_LADDER_BLOCK` (computed-only anger becomes `max(computed, floor)` capped at a ceiling —
**and its cap at `:241` and its unqualified two-rung decay at `:239` go with it**), and the
per-relationship + per-trait + per-dial behaviour blocks that replace them. New here:
`NINA_RELATIONSHIP_BLOCKS` (identity sentences + history, per level), `NINA_TRAIT_BANDS` (11),
`NINA_DIAL_BANDS` (4), `NEVER_SAY_ENTRIES`, `BODY_REPEALED_BY` (**exported** — phase 3 imports it),
`ANGER_FLOOR_BY_BAND` / `ANGER_CEILING_BY_BAND`, `ninaIdentity`, `ninaNameRules`,
`ninaAngerLadderBlock`, `ninaNeverSayBlock`, `ninaTraitsBlock`, `ninaOperatorNotesBlock`,
`ninaAppearance` (phase 4's wardrobe seam), `isTurnedUp` / `anyTurnedUp`. Also `docs/nina/persona.md`,
which that file's own header requires to move in the same commit.
**Does not touch:** `prompts/system.ts` (phase 3 assembles), `prompts/index.ts` (phase 3 bumps the
version), `prompts/tools.ts` (phase 3 only), `imagegen.ts` (phase 4), `turn.ts`, any admin file.
`JAKARTA_SLANG` / `JAKARTA_SLANG_BLOCK` stay **verbatim** — the `profanity` dial countermands the
`anjir` / `bego` fences from a later paragraph instead. **`ANGER_LADDER` keeps all five rungs**, an
obligation rather than an intention: phase 1's test asserts `NINA_BAND_NAMES.length === ANGER_LADDER.length`.
**Exit criteria:** every exported block is either unchanged or a function of `NinaTuning`; **each
key's own identity band renders `''`** (skipped via phase 1's `defaultScore`, which is `off` for six
traits and `low` for `profanity` — not uniformly `mid`); `ninaTraitsBlock(NINA_TUNING_DEFAULTS)` and
`ninaOperatorNotesBlock(NINA_TUNING_DEFAULTS)` are both `''`; the default render of every retained
constant is byte-identical to `HEAD` **except one sentence in `NAME_RULES`** (see the log, C-11);
`ninaAngerLadderBlock` states the floor as a property of her, holding when `patterns` is empty;
`NINA_APPEARANCE` is available both as today's constant and as a wardrobe-overridable function.
`NINA_NOT_A_DOCTOR` survives verbatim.

### Phase 3 — `buildNinaSystemPrompt`, and the turn that reads it
**Satisfies:** R3, R4, R6
**Owns:** `lib/nina/prompts/system.ts` (`buildNinaSystemPrompt(tuning)` over a ten-section
assembler that drops an empty section header and all; `NINA_SYSTEM_PROMPT` retained as the default
render; `buildOutputRule` — `OUTPUT_RULE`'s no-greeting clause gated on `concerned` and its bubble
preference on `dials.verbosity`; `buildCameraBlock` on `dials.photoEagerness`; **`buildNumbersRule`**
— `NUMBERS_RULE`'s third copy of *"Never comment on his body"*, gated on phase 2's
`BODY_REPEALED_BY`, arithmetic half untouched; **`buildContextGuide`** — `CONTEXT_GUIDE`'s second
computed-only-anger sentence; **`buildProactiveInstruction`** — clause-level repeals of *"not one
higher"*, *"do not lecture him"* and *"do not sulk"*, **plus** the tuning suffix, with
`PROACTIVE_INSTRUCTIONS` retained as the default render); `lib/nina/prompts/index.ts` (the
**single** `NINA_PROMPT_VERSION` bump for this set, 2 → 3, plus the exports);
`lib/nina/prompts/tools.ts` (**comment only — zero prompt bytes change**, recording why the two
proposed dials were declined); `lib/nina/turn.ts` (`NinaTurnInput.tuning` required, `ninaBody`
taking the assembled system string, `NinaTurnTrace`/`NinaTurnRow` carrying the revision);
**`lib/nina/gateway.ts`** (`dbNinaTurnStore` passes `tuningRevision` through — the translation is
field-by-field, so without this the column stays NULL and nothing fails); `lib/nina/actions.ts` and
`lib/nina/proactive.ts` (read the tuning in the existing `Promise.all`s and pass it — **both**
`loadNinaContext` sites in `proactive.ts`); `tests/nina.prompts.test.ts` (rewritten),
`lib/nina/turn.test.ts`, `tests/fixtures/ninaTurn.ts`, `tests/live/nina.live.test.ts`.
**Does not touch:** `persona.ts` (phase 2 owns the text — this phase imports its `nina*`-prefixed
functions), `context.ts` or `load.ts` (invariant 3 — and `context.ts:845` emits `nagLevel` only
inside a fired pattern, which is why the floor is stated in phase 2's text rather than derived),
`imagegen.ts`/`imagetools.ts`/`avatargen.ts` (phase 4), `tools.ts` (`NinaToolContext` is not
extended), any admin or component file. **One carve-out:** phase 6 later adds a single
`relationship:` property to the `distillNinaMemory(...)` call in `actions.ts`.
**Exit criteria:** `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS) === NINA_SYSTEM_PROMPT`, and that
string differs from `HEAD`'s prompt by exactly the one `bestie` sentence; none of the three
tuning-only headings (`HOW YOU FEEL`, `THE CAMERA`, `STANDING INSTRUCTIONS`) appears in the default
render; every trait renders differently at 0 than at 100 **and identically to the default when set
to its own default**; all six of this phase's repeals are gone at the top of the dial that repeals
them and present at the default; the proactive path and the chat path both send the tuned prompt;
`nina_turns` records the revision on a chat turn and on a proactive turn.

### Phase 4 — The camera, and a promise she keeps in the chat
**Satisfies:** R5
**Owns:** `lib/nina/imagegen.ts` (`buildNinaImagePrompt` gains an **optional** `tuning`; the
hardcoded outfit becomes overridable through phase 2's `ninaAppearance` seam; a `POSE AND PRESENCE:`
block from `traits.steamy` / `traits.flirty` at band `high`, resolved by **phase 1's `ninaBand()`**
and no private threshold); `lib/nina/selfiegen.ts` (new — `generateNinaSelfie`, the chat-selfie
entry point, reads the tuning itself); `lib/nina/imagetools.ts` and `lib/nina/avatargen.ts` (both
delegate/read the tuning); the `NinaPromiseReward` type and the optional `reward` field on
`NinaPendingPromise` in `lib/db/schema.ts` (a `jsonb` slot value, **no column, no migration**);
`lib/nina/promise.ts` (`promiseReward` / `promiseJobId` / `promiseRewardFor` at band `high`;
`PromiseEvalInput.selfieLandedForJob?`; the settle test generalised to a reward-aware **job-id**
match); `lib/nina/promises.ts` (three new deps ports, the reward-aware fire path);
`listNinaSelfieJobIdsSince` in `lib/nina/queries.ts` (**`§11`**, appended after phase 1's `§10`);
`tests/nina.imagerecipe.test.ts` and `tests/nina.promise.reward.test.ts`.
**Does not touch:** `lib/nina/prompts/tools.ts` (phase 3 owns `GENERATE_IMAGE_TOOL`'s description),
`persona.ts`, `imagerecipe.ts` or `imagefail.ts` (invariant 9 — both stay zero-import), the worker
script (verified: it already branches on `purpose === 'selfie'`), `NINA_IMAGE_DAILY_CAP`,
`lib/nina/avatartools.ts` (**verified zero edits** — `handleSetAvatar` delegates the whole prompt
build to `generateNinaAvatar`), `lib/nina/memory.ts` (**`PromiseCandidateSchema` is not extended** —
see the log, C-19), and anything under `drizzle/`.
**Exit criteria:** `buildNinaImagePrompt` with no tuning and with `NINA_TUNING_DEFAULTS` return the
same string, and it is today's; a non-empty `wardrobe` replaces the canon outfit for both purposes
while the face and the track never move; a promise fired while `steamy` is in band `high` or above
dispatches `purpose: 'selfie'`, arrives as a `nina_messages` + `nina_message_images` pair, and
settles on that exact job id; a promise with no `reward` behaves exactly as it does today;
`git diff --stat drizzle/` is empty.

### Phase 5 — The panel on `/admin/nina`
**Satisfies:** R1, R2, R3
**Owns:** `lib/admin/tuningModel.ts` (new — `TuningDraft`, `toTuningDraft`, `changedTuningFields`,
`loudestDials`, and the copy accessors, which **read phase 1's `NINA_TRAIT_SPECS` /
`NINA_DIAL_SPECS` / `NINA_ADDRESS` rather than carrying tables of their own**); `lib/admin/schema.ts`
(appended — the Zod boundary for one whole-tuning write, **every bound imported** from
`lib/nina/tuning.ts` including `NINA_WARDROBE_MAX` and `NINA_NOTES_MAX`); a new
`lib/admin/tuningActions.ts` (`requireAdmin()` → Zod → `writeNinaTuning` → `revalidatePath`, one
save plus a reset-to-defaults, each returning a result object); `components/admin/DialSlider.tsx`
(the slider primitive the UI kit does not have) and `components/admin/CharacterPanel.tsx`;
`app/admin/nina/page.tsx`; `app/admin/page.tsx` (a hub card); `tests/admin.tuning.test.ts`.
**Does not touch:** anything under `lib/nina/` except importing `lib/nina/tuning.ts`,
`readNinaTuning`/`writeNinaTuning` and `buildNinaSystemPrompt`; `lib/admin/memoryActions.ts`,
`memoryModel.ts`, `memoryVocab.ts`, `memoryStore.ts`; `components/admin/MemorySlots.tsx`,
`MemoryLedger.tsx`, `FileExplorer.tsx` or anything under `components/admin/explorer/`;
`components/admin/AdminNav.tsx`; `components/ui/index.ts`; the album's own reads and actions.
**Exit criteria:** `/admin/nina` renders 11 trait sliders, the 5-way relationship selector, the 4 R3
dials, the wardrobe and notes fields, and a preview of the assembled system prompt; **every label,
hint and address word on the page comes from `lib/nina/tuning.ts`**, so there is no second copy to
drift; one save writes the whole tuning and `(await writeNinaTuning(...)).revision` is what the note
reports; the panel is collapsed by default so the album is still the page's working surface; the
prompt preview is the pure assembly function and no model call happens in the render (invariant 5).

### Phase 6 — The sweep, and the record
**Satisfies:** R6
**Owns:** the final grep sweep, **re-run as a gate rather than a report** — including
`DISTILL_SYSTEM_PROMPT`'s relationship-blindness, which would otherwise file *"he calls her yang"*
as a fact about him; `lib/nina/prompts/distill.ts` (`buildDistillSystemPrompt(relationship)`,
`NINA_DISTILL_PROMPT_VERSION` 1 → 2 — **not** `NINA_PROMPT_VERSION`); `lib/nina/distill.ts`
(optional `DistillInput.relationship`); **one property in `lib/nina/actions.ts`** —
`relationship: tuning.relationship` at the `distillNinaMemory(...)` call, by reconciler exception,
because neither phase 3 nor phase 6 could close that seam alone; the tuning matrix appended to
`tests/nina.prompts.test.ts` (reusing phase 3's helpers, not duplicating its cases);
`components/admin/.workflows/package_readme.md`, `lib/admin/.workflows/package_readme.md` and
`lib/db/.workflows/package_readme.md` — **the only three in the repo**; `CHANGELOG.md`;
`docs/nina/persona.md`'s closing record, **appended to phase 2's repeal table rather than starting a
second one**.
**Does not touch:** `NINA_PROMPT_VERSION` (phase 3 owns the single bump), `persona.ts`, `system.ts`,
`tools.ts`, `memory.ts`, or any other file phases 1–5 own. `lib/nina/.workflows/` **does not exist**
and this phase does not create it — a readme for the largest package in the repo is a separate
`/update-readme` card (H-5).
**Exit criteria:** `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, all seven
`check-*.mjs` guards and `drizzle-kit check` pass; **the two confirming greps come back clean** —
no rule surviving anywhere in the prompt surface contradicts a dial that can be turned up, and a
live hit outside a comment or a default-band string is a failure of the set rather than a note; the
librarian is told the real relationship; the three readmes, the changelog and the canon document
describe what shipped, including the twelve repeals and the three deliberate non-repeals.

## Reconciliation Log

The six phase plans were written **concurrently and blind to each other**. Phase 1 landed a concrete
shape for `lib/nina/tuning.ts`; phases 2–5 each guessed that shape and guessed differently. **Phase
1's landed contract was treated as the authority for everything in `tuning.ts`**, and reversed only
where its choice was demonstrably wrong — twice, both recorded below (C-3, C-6).

**44 conflicts found, 44 resolved. Every plan file was edited; none was merely annotated.**

### A — name and shape collisions on phase 1's module

| # | Conflict | Resolution |
|---|---|---|
| C-1 | **`NINA_RELATIONSHIPS` defined twice with different shapes** — phase 1's five-value `as const` array in `tuning.ts`, phase 2's `Record<NinaRelationship, NinaRelationshipSpec>` in `persona.ts`. Phase 5 feeds the array to `z.enum`; phase 6 `satisfies`-checks against the type. | Phase 1 keeps the name. Phase 2's Record is renamed **`NINA_RELATIONSHIP_BLOCKS`** and every reference in phases 2, 3 and 6 follows. |
| C-2 | **The address vocabulary defined twice, and the two phases contradicted each other about who owned it.** Phase 1 landed `NINA_ADDRESS` (words / addressRule / addressFallback / stance); phase 2's contract said *"phase 1 need NOT define an address vocabulary"* and defined `terms` / `address` / `addressFallback` / `identity` / `history` itself. **Duplicate work on the most user-visible part of R2.** | **Phase 1 owns the address vocabulary** (`label`, `source`, `words`, `addressRule`, `addressFallback`) — its brief instructed it, and phase 5 needs the labels and the words from a client-importable module. **Phase 2 owns the relationship's prose** (`identity` sentences, `history`) and *composes* `NINA_ADDRESS` in `ninaNameRules` rather than restating it. Phase 2's `label` / `terms` / `address` / `addressFallback` are gone. Phase 5's five retyped relationship labels and word lists are gone. **Every word the user named survives in exactly one place** — `bro`, `bestie`, `my man`, `yang`, `sayang`, `beb`, `baby` — and phase 6 gained a test that walks `NINA_ADDRESS[rel].words` against the rendered prompt so none can be lost silently. |
| C-3 | **`stance` (phase 1) and `identity`+`history` (phase 2) were two prose descriptions of one relationship**, largely word-for-word duplicates. | **Phase 1's `stance` field cut** — one of the two reversals of phase 1. It is demonstrably the wrong owner: a single merged paragraph *cannot* reproduce today's `NINA_IDENTITY`, whose relationship clause is paragraph 1 and whose history sentence is paragraph 5 with three fixed paragraphs between them. Phase 2's split is what makes `ninaIdentity(NINA_TUNING_DEFAULTS)` byte-identical. Phase 1's tests updated; the one sentence of phase 1's prose worth keeping (girlfriend's *"You flirt as a baseline — at whatever 'flirty' is set to"*) was moved into phase 2's `identity` array rather than dropped. |
| C-4 | **`ninaAngerFloor` created twice with DIFFERENT SEMANTICS** — phase 1's `ninaBand(anger).index`, phase 2's table over `ANGER_FLOOR_BY_BAND`. | **Phase 1's deleted; phase 2 keeps floor and ceiling.** The second reversal of phase 1, and it matters: a band index makes `anger: 50` a permanent rung 2, i.e. the *middle* of the slider ships a Nina who is always irritated. Phase 2's table floors `off`/`low`/`mid` all at 0, so the entire lower half of the slider is today's ladder. Return type unified on **`NinaBandIndex`** (which *is* `AngerRung['level']`, and is the reason for five bands). |
| C-5 | **The dial key set disagreed three ways** — phase 1's `profanity`/`clinginess`/`photoEagerness`/`verbosity`; phase 2's `verbosity`/`photos`/`proactivity`; phase 5's `verbosity`/`photo`, left "intentionally incomplete pending phase 1" with a test that would fail until filled. | Phase 1's four propagated everywhere. Phase 2 renamed `photos` → `photoEagerness`, `proactivity` → `clinginess`, **and gained `profanity` band text** (which countermands the `anjir`/`bego` fences from a later paragraph, leaving `JAKARTA_SLANG` verbatim). Phase 3 reads `dials.verbosity` / `dials.photoEagerness`. Phase 5's incomplete table was **deleted entirely** — see C-8 — so its completeness test now passes by construction. |
| C-6 | **`NinaBand` meant two different things** — phase 1's `interface { index, name }` versus phase 2's use of it as the string union in `Partial<Record<NinaBand, string>>`. | Phase 2 retargeted to **`NinaBandName`**, and its band helpers read `ninaBand(value).name`. |
| C-7 | **`NinaTraitSpec` / `NinaDialSpec` / `NINA_TRAIT_SPECS` / `NINA_DIAL_SPECS` defined twice**, with different shapes, in `tuning.ts` and `persona.ts`; phase 2's `asked` field was a verbatim duplicate of phase 1's `userSaid`. | Phase 1 keeps the names. Phase 2's are renamed **`NinaTraitBands` / `NinaDialBands` / `NINA_TRAIT_BANDS` / `NINA_DIAL_BANDS`** and carry band text only; `asked` deleted, and the user's own words are read from `NINA_TRAIT_SPECS[key].userSaid` — one home for the R4 specification. |
| C-8 | **Phase 5 carried three tables duplicating phase 1's specs** — eleven trait labels+hints, a dial table, five relationship labels with the address words retyped. | **All three deleted.** `tuningCopy` reads `NINA_TRAIT_SPECS[key].label` / `.axis` / `.userSaid` and `NINA_DIAL_SPECS[key].label` / `.axis`; `relationshipCopy` reads `NINA_ADDRESS[v].label` / `.words`. The only copy left in the panel is one sentence per relationship about what choosing it changes *about the app*, which has no counterpart in `tuning.ts` and cannot contradict it. Phase 5's "type-imports-only" claim and its test were corrected: value-importing a zero-import module is safe, and re-declaring phase 1's labels to preserve a lint rule would have been the drift the file exists to prevent. |
| C-9 | **Phase 5 assumed `NINA_TRAIT_KEYS` / `NINA_DIAL_KEYS` / `NINA_DIAL_MIN` / `NINA_DIAL_MAX`** — none of which exist. | Retargeted throughout to `NINA_TRAITS` / `NINA_DIALS` / `NINA_SCORE_MIN` / `NINA_SCORE_MAX`. |
| C-10 | **`wardrobe` and `notes` were `string \| null` in phase 2's contract and `?.trim()`-ed in phase 4**; phase 1 landed plain `string` with `''` as the one empty value. | Retargeted. Every emptiness test in phases 2, 3, 4 and 6 is now `=== ''` or a length check; `ninaAppearance` and `ninaOperatorNotesBlock` have no null branch. |
| C-11 | **The length caps disagreed** — phase 1's `NINA_WARDROBE_MAX = 200` / `NINA_NOTES_MAX = 2000` against phase 5's `ADMIN_TUNING_WARDROBE_MAX = 240` / `ADMIN_TUNING_NOTES_MAX = 1000`. A Zod bound **stricter** than the model's coercion silently refuses a value the store would have kept. | Phase 5's two constants **cut**; it imports phase 1's, per `lib/admin/avatars.ts`'s own rule that *"a constant that is agreed rather than shared is a constant that will one day disagree"* — which phase 5's Zod section was already quoting approvingly while breaking. |
| C-12 | **`writeNinaTuning`'s return type disagreed** — phase 1's `Promise<NinaTuning>` against phase 5's `Promise<number>`. | Phase 1's kept (the upsert already has the row from `.returning()`, and a caller should render what was stored rather than what it hoped). Phase 5's two actions destructure `{ revision }`. |
| C-13 | **Phase 3 assumed bare persona export names** (`nameRules`, `angerLadderBlock`, `neverSayBlock`, `traitsBlock`, `operatorNotesBlock`) against phase 2's `nina*`-prefixed ones. | Phase 2 owns the file, so its spelling wins; phase 3's import list and all call sites retargeted. |
| C-14 | **Phase 3 expected THREE blocks (`relationshipBlock`, `traitsBlock`, `operatorNotesBlock`); phase 2 provided ONE (`ninaTuningBlock`) and no relationship block at all.** | Split into **`ninaTraitsBlock`** and **`ninaOperatorNotesBlock`**, because phase 3's placement argument is the stronger one: the operator note's whole job is *"where they disagree with anything above, they win"*, so it belongs in its own section **last in the prompt**, and phase 2's combined block would have put it in the middle — contradicting phase 2's own claim for it. |
| C-15 | **Phase 3's `── WHO HE IS TO YOU ──` section had no owner and no content**: phase 2 folds the relationship's prose into `ninaIdentity`. | **Section dropped**, and `NINA_SECTION_TITLES` goes from eleven titles to ten. Verified against the source: today's prompt has no heading at all above `── HOW YOU TALK ──`, and `NINA_IDENTITY` carries the relationship clause in paragraph 1. A separate section would have said the same thing twice at every non-default level while being empty at the default. Phase 3's test retargeted from *"opens the section"* to *"changes the opening identity block"*. |
| C-16 | **Phase 3 read `tuning.verbosity` / `tuning.photoEagerness` flat; phase 4 read `tuning.steamy` / `tuning.flirty` flat.** Phase 1 nests both under `traits` / `dials`. | Retargeted. Phase 3's cost was one function body (`systemDials`), which is exactly why it exists; phase 4's was four call sites and its test helpers. |

### B — the invariant-2 conflict, and it was the most consequential one

| # | Conflict | Resolution |
|---|---|---|
| C-17 | **Phase 2's contract required `NINA_TUNING_DEFAULTS` to have "every trait AND dial in band `mid`" and called that "load-bearing for plan invariant 2". Phase 1 landed NON-UNIFORM defaults** — `anger` at 0 (`off`), `profanity` at 30 (`low`), six traits at 0 — each with a `defaultBecause` quoting the line of canon it was read off. | **Phase 1 is right and phase 2's assumption is the thing that was wrong.** Today's Nina is warm-by-default with computed anger and fenced swearing; a middle-band `anger` default would have shipped a Nina angrier than the one that exists. **But phase 2's band tables keyed today's text off `'mid'` uniformly**, which means its `off` paragraphs for `sad`/`flirty`/`steamy`/`annoying`/`anxious` and its `low` handling of `profanity` would all have rendered **at the default tuning** — seven paragraphs of "she is normal" appended to the shipping prompt, breaking invariant 2 in the least visible way possible, because the default *is* the shipping character and a leak reads as "she has always said that". **Fixed by mechanism, not by hand:** phase 2 now skips each key's **identity band**, computed as `ninaBand(NINA_TRAIT_SPECS[key].defaultScore).name`, and the six default-`off` traits have no `off` text while `profanity` has no `low` text. All fifteen keys were walked against phase 1's landed `defaultScore` and the table in phase 2's Requires section records the result. |
| C-18 | **Phase 3's test asserted that every trait at 0 differs from the default render** — false for the six traits that ship at 0. A slider dragged to a value it already has must render an identical prompt. | Test rewritten to assert 0-vs-100 distinguishability *and* that 0 **is** the default render for exactly the six that ship at 0. This is invariant 2 per key rather than an exception to it. |
| C-19 | **Phase 3's `''`-at-default requirement had to survive the C-14 split.** | Both `ninaTraitsBlock` and `ninaOperatorNotesBlock` are `''` at the defaults; `renderSections` drops an empty section header and all; phase 3's named test still fails loudly if either speaks. |
| C-20 | **The one accepted departure from byte-identity — a sentence in `NAME_RULES` — was stated independently by phases 1, 2 and 3**, in three places, with three slightly different framings, and phase 3's verification said only *"expect phase 2's repeals and nothing else"*. | **Phase 2's Interface Contract is the single canonical statement**; phases 1 and 3 now point at it. Phase 3's manual check quotes the exact expected diff — `+ Sometimes "bestie" instead of the nickname — you two are that close.` — and says that anything else in it is a bug. The prose now lives in phase 1's `NINA_ADDRESS.best_friend.addressRule` (per C-2), so phase 1 gained a test asserting that string **is** `casual_friend`'s (today's `NAME_RULES`, verbatim) plus exactly that sentence. |

### C — unowned files and unmet assumptions

| # | Conflict | Resolution |
|---|---|---|
| C-21 | **`lib/nina/gateway.ts` was in nobody's OWNS list**, and phase 3 said it *"cannot compile"* without it. | **Assigned to phase 3** (it was already in phase 3's Files table but not the index's Owns line, which is now fixed). Verified why it matters: `dbNinaTurnStore` translates `NinaTurnRow` → `NinaTurnInsert` **field by field**, not by spreading, so a new `tuningRevision` would be dropped there with the turn carrying it and the audit column staying NULL and nothing failing. The revision needs four coordinated edits and phase 3 owns all four. |
| C-22 | **`lib/nina/memory.ts` / `PromiseCandidateSchema` was handed from phase 4 to phase 6 and back again** — a live contradiction dangling in two handoffs. | **Tie broken: the promise reward stays app-side, derived from the `steamy` dial; nothing extends `PromiseCandidateSchema` and `memory.ts` is touched by nobody.** R5 works without it, and the part of the user's example that is *hers* already is: phase 2's `steamy: max` text tells her to *"make the deal out loud, in your own words"*. What a schema field would add is only a machine-readable declaration, and this phase's own analysis killed it — a plain `z.object` strips an unknown key silently, `normalisePromise` rebuilds the promise field by field and would drop it again, and the distiller would never emit it without a `DISTILL_SYSTEM_PROMPT` clause: three coordinated edits across two phases' territory, each failing silently alone, for a field with a working default that also could not move when the slider moves. **Recorded as a decision in both plans with the one-card shape if it is ever wanted — not deferred, and not an Open Question.** |
| C-23 | **`lib/nina/tools.ts`** — phase 3 called it *"owned by no phase"* while claiming `toolCtx`; phase 4 deliberately did not extend `NinaToolContext`. | **No actual collision, and the boundary is now stated in both plans.** Verified: `toolCtx` is an *unannotated* object literal in `turn.ts:549` (phase 3's file), structurally typed at the dispatch call — so an optional field on the interface would not even error there. Phase 4 reads the tuning inside its own generators. `tools.ts` is touched by no phase, deliberately. |
| C-24 | **`lib/nina/avatartools.ts`** was in nobody's list, on phase 4's claim that it picks up the wardrobe with zero edits. | **Claim verified and recorded.** `handleSetAvatar` passes only `userId` / `scene` / `source` and delegates the entire prompt build to `generateNinaAvatar` (`avatartools.ts:85` → `avatargen.ts:83`), so once that function reads the tuning, `set_avatar` is dressed without being touched. The index records it as verified-no-edit rather than as unowned. |
| C-25 | **`lib/nina/.workflows/package_readme.md`** was flagged as unowned-and-now-stale by phases 3, 4 **and** 6. | **The file does not exist** — verified: the repo has exactly three `package_readme.md` files (`lib/db`, `lib/admin`, `components/admin`) and **none** of them mentions `NINA_SYSTEM_PROMPT`, the persona constants or `lib/nina/prompts`. So nothing in this set made one stale and there is nothing to assign. Phases 3 and 4's handoffs corrected to say so; phase 6 keeps it as H-5, a separate `/update-readme` card. Phase 6's "four package readmes" corrected to three, and `lib/db`'s added to its Files table. |
| C-26 | **Phase 6's `DistillInput.relationship` seam could not be closed by either phase alone** — the value must be passed in `lib/nina/actions.ts`, which is phase 3's, but phase 3 runs before the field exists. | **One property assigned to phase 6 by exception**, recorded in both plans and in the index. An optional field nobody fills is a fix that fixes nothing; a phase passing a field that does not exist does not compile. Phase 6 gained Step 2b for the single line. |

### D — the four surviving contradictions phase 6's sweep found after phases 2 and 3 were briefed

**This is the reconciliation's highest-value work.** Each of these is a rule three paragraphs away
from a slider, cancelling it — *the difference between the sliders working and the sliders being
decorative* — and none of them was in any phase's stated scope.

| # | Conflict | Resolution |
|---|---|---|
| C-27 | **`system.ts:58` — `NUMBERS_RULE` carries its own *"Never comment on his body"*, entirely separate from `NEVER_SAY_BLOCK`'s.** Phase 2 found it independently and could not reach it. Left alone, `flirty: 100` and `steamy: 100` ship three blocks above an absolute prohibition. **The single highest-value edit in the set.** | **Assigned to phase 3** (it owns `system.ts`), as Step 2b finding 1: `buildNumbersRule(tuning)`, five words gated on phase 2's `BODY_REPEALED_BY` — which phase 2 now **exports** so there is one repeal test rather than two. **Not** a repeal of `NUMBERS_RULE`: the arithmetic half has the measured aerobic-decoupling sign error behind it and the plan's Scope keeps it in full. |
| C-28 | **`system.ts:174` — *"Say it at the rung `nagLevel` earns and not one higher"***, the literal negation of `max(computed, floor)`. Phase 3 planned a tuning-aware **suffix**, and a suffix does not repeal an inline clause. | **Assigned to phase 3**, as a **clause-level** edit (`rungClause`). `PROACTIVE_INSTRUCTIONS` becomes the default render of `PROACTIVE_COPY`, keeping its name, its type and every byte at the defaults — so the two existing assertions over it pass unedited. The suffix stays for what it genuinely adds. |
| C-29 | **`system.ts:85` — `CONTEXT_GUIDE`'s *"This is where your anger comes from"***, a second computed-only-anger statement outside `ANGER_LADDER_BLOCK`. | **Assigned to phase 3**, as `buildContextGuide(tuning)`, unchanged at `floor === 0`. |
| C-30 | **`system.ts:170,178` — *"Do not lecture him"* and *"do not sulk about the silence"***, both contradicting `anger` / `annoying` / `sad` / `anxious` at high. | **Assigned to phase 3**, as `lectureClause` / `sulkClause`. `avatar_changed`'s *"Do not describe the photo to him"* is **kept at every setting**, now as a recorded decision: it is not a character rule and no dial asks for it. |
| C-31 | **`persona.ts:236-243` — the *"never two rung-4 turns in a row"* cap AND the two-rung DECAY**, which can drop her below the operator's floor. Phase 2's contract listed `:236` and `:241` but not the decay at `:239`. | **Phase 2's code already conditioned all three**; reconciliation added `:239` to its **deletions table** so the decay is a named repeal rather than an incidental one. *A decay below the floor is not a decay* — it is the floor being cancelled two paragraphs later. |
| C-32 | **The floor must render when `patterns` is EMPTY.** `context.ts:845` emits `nagLevel` only inside a fired pattern, so a ladder block reading only `patterns[]` yields rung 0 under `anger: 100` on a quiet day — *"mad all the time" failing on exactly the days the user would notice*. `context.ts` is off-limits to every phase (invariant 3). | **Assigned to phase 2's ladder text**, which now states the floor as a property of her: *"YOUR FLOOR IS A PROPERTY OF YOU AND NOT OF THE DAY: rung N is where you start even when 'patterns' is empty."* The never-write-back-into-`nina_nags` condition is recorded beside it. |

### E, F — band vocabulary, ordering, counts

| # | Conflict | Resolution |
|---|---|---|
| C-33 | **Phase 4 introduced two LOCAL thresholds** — `NINA_IMAGE_DIAL_HIGH = 67` in `imagegen.ts` and `PROMISE_SELFIE_STEAMY_FLOOR = 60` in `promise.ts` — rather than phase 1's resolver. | **Both cut: one band vocabulary, and it is `ninaBand()`.** Decisive reason: `/admin/nina` renders the band name beside every slider, so a dial whose visible band says `high` while the camera privately wants 67 is a dial the user cannot predict. And the two were not independent — with `NINA_BAND_WIDTH = 20`, band `high` begins at exactly 60, so one of them already *was* the band edge and the other was an arbitrary point inside it. Phase 4's Decision 2 is rewritten with the reasoning; its tests use 59/60 against the band edge. Phase 6's open ruling on this is closed. |
| C-34 | **`lib/nina/queries.ts` edited by phases 1 and 4**, with phase 4 appending a `§12` section after phase 1's `§10`. | Order already held (phase 4 depends on phase 1). Corrected to **`§11`** — `§12` would have left a hole — and phase 4's plan now states that it quotes the file post-phase-1 and reads nothing above its own append point. |
| C-35 | **`lib/db/schema.ts` edited by phases 1 and 4.** | Verified non-overlapping: phase 1 adds the table, the column and the only migration; phase 4 adds a type and one **optional type-level** field on `NinaPendingPromise`, with nothing under `drizzle/`. `0004` does not mention `reward`, and phase 4's exit criteria assert `git diff --stat drizzle/` is empty. |
| C-36 | **`tests/nina.prompts.test.ts` edited by phases 3 and 6**, with phase 6 quoting the file as it is *today* (import lines 10-16) rather than as phase 3 leaves it, declaring its own `withTrait` / `RELATIONSHIPS` / `TRAITS` helpers that would shadow phase 3's, and re-asserting several of phase 3's cases. | Phase 6 re-anchored onto phase 3's rewritten file, **reusing its helpers**, with the duplicated per-trait and per-relationship cases removed and the genuinely additive ones kept (the address-form matrix, the new address-**word** walk, the free-text cases, the distiller). |
| C-37 | **Phase 6's clamp test asserted the wrong fallback policy** — that a `NaN` trait renders as that key's default. It does not: `coerceNinaTuning` falls back per key, but `ninaBand`, which is what the assembler calls, folds anything unreadable to band `'off'`. | Assertion corrected, and a second case added asserting the *store's* policy alongside it, so the two layers are documented against each other rather than left as a surprise. |
| C-38 | **A latent bug in phase 1's own test:** `expect(spec.path).toMatch(/lib\/nina\/\w+\.ts/)` cannot match `lib/nina/prompts/tools.ts`, because `\w` does not match a slash — so the case would have failed on `verbosity`, whose `path` names only files under `prompts/`. | Pattern widened to `/lib\/nina\/[\w/]+\.ts/`, with the reason in a comment. |
| C-39 | **Phase 1's `NINA_ADDRESS.nobody.addressFallback` said *"do not ask him for a name"*; phase 2's said "ask him plainly, once".** A direct behavioural contradiction at one level. | **Phase 2's taken.** Every other level asks once, and a prompt that leaves her with no way to address him at all is a prompt with a hole in it. Phase 1's assertion updated. Consequently `addressFallback` is **`string` on all five levels, never null** — both `'literal'` levels still name the nickname as a secondary form — which also means `ninaNameRules` is two interpolations with no branch. |
| C-40 | **Phase 2's `docs/nina/persona.md` band table said `off 0–9, low 10–34, mid 35–64, high 65–89, max 90–100`**, contradicting phase 1's five equal widths of 20, and its prose said *"at `funny` 65+"*, *"`flirty` 65+"*. | Corrected throughout to `0–19 / 20–39 / 40–59 / 60–79 / 80–100` and `60+`, and the anger floor/ceiling table re-keyed to the real bands with the default marked at `off` rather than `mid`. |
| C-41 | **`files_touched` was wrong for four of six phases** (index said 7/3/7/7/8/6; the plans touch 8/2/11/10/8/9). | Phase table corrected. Each plan's own count note updated to agree. |
| C-42 | **Phase 6's readme step named the slider primitive `Slider.tsx`**; phase 5 creates `DialSlider.tsx`, and the step said "three dials" where there are four. | Both corrected in phase 6's readme step. |
| C-43 | **Phase 6's `docs/nina/persona.md` step would have written a second repeal record**, since phase 2's Step 10g already writes one. | Made **additive**: phase 6 appends the six `prompts/system.ts` repeals as rows to phase 2's existing table and adds `## Where the dials live`, with an explicit instruction never to create a second table. |
| C-44 | **R3 was served by phase 2's and phase 3's dial work while neither phase's `Satisfies` line named it.** | Both `Satisfies` lines and the Requirements table updated. No step moved — the work was already there, serving a requirement the draft's map did not credit. |

**Contract changes made during reconciliation, for the record.** Three, all recorded above: phase 1
loses `ninaAngerFloor` (C-4) and the `stance` field (C-3), and its `NINA_ADDRESS` address prose is
replaced with phase 2's (C-2, C-20, C-39). Every plan that referenced them was edited in the same
pass, so **no phase's own text still assumes the old contract.**

## Open Questions

**None.** Every question the six planners raised is answered above with a named owner.

For the record, because "empty" should be checkable rather than asserted — the seven that were
raised and where each of them went:

| Raised by | Question | Where it went |
|---|---|---|
| Phase 6, OQ-1 | `NUMBERS_RULE`'s surviving *"Never comment on his body"* | C-27 → phase 3, Step 2b |
| Phase 6, OQ-2 | *"and not one higher"* forbids the anger floor | C-28 → phase 3, Step 2b |
| Phase 6, OQ-3 | `CONTEXT_GUIDE`'s second computed-only-anger sentence | C-29 → phase 3, Step 2b |
| Phase 6, OQ-4 | The rung-4 cap and the two-rung decay | C-31 → phase 2, repeal 6 (decay named in its deletions table) |
| Phase 6, OQ-5 | *"Do not lecture him"*, *"do not sulk"* | C-30 → phase 3, Step 2b |
| Phase 6, OQ-6 | Would a distiller-reported `reward` be silently stripped? | C-22 → **decided**: the reward stays app-side; `memory.ts` is touched by nobody |
| Phase 4, H-1 | One band vocabulary or two? | C-33 → **decided**: one, `ninaBand()` |

**Two judgment calls worth naming, because they went against a phase's stated preference.**

1. **Phase 1's `ninaAngerFloor` and `stance` were cut** (C-3, C-4) even though phase 1's landed
   contract is otherwise the authority for `tuning.ts`. Both were demonstrably wrong rather than
   merely different: the floor would have made the middle of the slider a permanently irritated
   Nina, and the `stance` paragraph cannot reproduce the prompt that ships.
2. **The promise reward stays app-side** (C-22), so Nina proposes the photograph *in her own words*
   — phase 2's `steamy` text is explicit about that — but the app decides which camera pays it out.
   The alternative gives her a machine-readable choice at the cost of three silent failure modes and
   a reward that stops following the slider. If the user wants her declaration to be the record, the
   one-card shape is written down in phase 4's Handoff 2.

## Rollback

**Per phase.** Every phase is one commit on `feature/nina-character-tuning`, so `git revert <sha>`
backs one out. Three have a caveat:

- **Phase 1** leaves a migration. `drizzle/0004_nina_persona_tuning.sql` is additive — one new table
  and one nullable column on `nina_turns` — so reverting the code leaves an unread table and an
  unread column, which is inert. Dropping them is optional and should be a separate `0005_*`
  migration, never a hand-edited journal. **Phase 1 must be reverted last**, or after any phase that
  depends on it: reverting it while phase 3 stands removes `lib/nina/tuning.ts` from under
  `NinaTurnInput.tuning` and the tree does not compile.
- **Phase 3** bumps `NINA_PROMPT_VERSION` 2 → 3. Reverting it makes historical `nina_turns` rows
  claim version 2 for turns that ran on 3. Leave the bump in place and revert only the assembly if
  the prompt has to be rolled back. The same argument applies to phase 6 and
  `NINA_DISTILL_PROMPT_VERSION`.
- **Phase 4** may leave one in-flight promise mis-watched. A promise fired as a selfie whose
  photograph has not landed yet will, after a revert, be watched for an avatar landing that never
  comes: it retries and expires, and the photograph still arrives in the chat. Nothing is lost and
  nothing is stuck. To avoid even that, drop the `reward` keys out of the `pending_promises` slot
  before reverting.

**As a whole.** The branch is unmerged and the worktree is disposable:

    git -C <repo> worktree remove <worktree> --force
    git -C <repo> branch -D feature/nina-character-tuning

Nothing on `main` changes until the branch is merged. The behavioural rollback is cheaper than the
code one: **set every dial back to its default in `/admin/nina`** and invariant 2 guarantees she is
exactly the Nina who shipped before this set.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_CHARACTER_TUNING_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_CHARACTER_TUNING_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_CHARACTER_TUNING_PLAN.md
