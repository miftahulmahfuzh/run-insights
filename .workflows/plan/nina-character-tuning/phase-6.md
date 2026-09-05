# Phase 6: The sweep, and the record

**Plan set:** `NINA_CHARACTER_TUNING_PLAN.md`
**Analysis:** `20260904-210526-TUNE_code_analyzer.md`
**Satisfies:** R6 — the iron rule, made true as a property of the whole codebase rather than of five
files, and written down so the next reader knows a decision was taken.
**Depends on:** Phase 2, Phase 3, Phase 4, Phase 5
**Difficulty:** EASY
**Package:** `lib/nina/prompts` (the code edits), plus `docs`, `tests`, and the repo's three package
readmes

---

## Goal

After this phase, no instruction anywhere in this codebase that reaches a model forbids something a
dial can now ask for — and that is a *swept* claim, established by the reproducible grep checklist
in this file rather than by anyone's memory of phases 2 and 3. The distiller stops being
relationship-blind, so a girlfriend tuning does not leave *"he calls her yang"* filed as a standing
fact about the runner. The four package readmes, `CHANGELOG.md` and `docs/nina/persona.md` describe
what shipped and on whose instruction, and `tests/nina.prompts.test.ts` covers the full tuning
matrix rather than only the default render phase 3 needed to land.

**The sweep was already run while this plan was written.** Section *The sweep — findings* below is
a record of real findings at real line numbers, not a procedure for the implementer to discover
them. The implementer re-runs the commands to confirm nothing moved, then makes the four edits this
phase owns and files the five findings it may not touch.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing.

**Renames:** nothing.

**Creates:**
- `buildDistillSystemPrompt(relationship)` (`lib/nina/prompts/distill.ts`) — a pure function of the
  relationship. `DISTILL_SYSTEM_PROMPT` is **retained** as its default render, so every existing
  importer compiles untouched.
- `RELATIONSHIP_GLOSS` (`lib/nina/prompts/distill.ts`) — module-private, not exported.
- `DistillInput.relationship?: NinaRelationship` (`lib/nina/distill.ts`) — **optional**, defaulting
  to `NINA_TUNING_DEFAULTS.relationship`, so no existing call site changes.

**Signature changes:**
- `lib/nina/actions.ts` — **one property added to the `distillNinaMemory(...)` call inside
  `after()`**: `relationship: tuning.relationship`. **By reconciler exception**, because the file is
  phase 3's and the seam cannot be closed from either side alone: phase 3 cannot pass a field that
  does not exist yet, and an optional field nobody fills is a fix that fixes nothing. Phase 3 already
  reads the tuning in that function's `Promise.all`, so the value is in scope and this is literally
  one line. Nothing else in `actions.ts` is touched, and phase 3's plan records the exception too.
- `NINA_DISTILL_PROMPT_VERSION` 1 -> 2 (`lib/nina/prompts/distill.ts:12`). **This is NOT
  `NINA_PROMPT_VERSION`.** It is the distiller's own constant, it lives in a file this phase owns,
  and its docstring requires the bump: *"Bumped by hand whenever the text or the tool schema below
  changes."* Phase 3's single `NINA_PROMPT_VERSION` bump in `lib/nina/prompts/index.ts` is
  untouched by this phase.
- `distillBody(model, messages)` -> `distillBody(model, messages, relationship)`
  (`lib/nina/distill.ts`) — module-private, two call sites, both in `distillWith`.

**Requires (from earlier phases):**
- `NINA_TUNING_DEFAULTS` and the `NinaRelationship` type exported from `lib/nina/tuning.ts`, with
  no `server-only` and no drizzle import (Phase 1 — its stated exit criterion).
- `buildNinaSystemPrompt` exported from `lib/nina/prompts` (Phase 3).
- `NINA_PROMPT_VERSION` already bumped to 3 by Phase 3 (this phase asserts only that it is a
  positive integer, exactly as the existing test does).
- Phase 2 has repealed `NEVER_SAY`'s body entry, `NAME_RULES`'s nickname-only rule, the no-jokes
  clause in `NINA_IDENTITY`, `NEVER_SAY_BLOCK`'s threat/withdrawal line, and made the anger rung a
  floor over the computed value.

**Leaves alone (owned by others):**
- `lib/nina/prompts/index.ts` and `NINA_PROMPT_VERSION` (Phase 3 — the single bump for this set).
- `lib/nina/persona.ts`, `lib/nina/prompts/system.ts`, `lib/nina/prompts/tools.ts`,
  `lib/nina/turn.ts`, `lib/nina/proactive.ts` (Phases 2, 3). **`lib/nina/actions.ts` is phase 3's
  except for the single `relationship:` property named above** — one line, at one call site, by
  reconciler exception.
- `lib/nina/tuning.ts`, `lib/nina/queries.ts`, `lib/db/schema.ts`, `drizzle/*` (Phase 1).
- `lib/nina/imagegen.ts`, `imagetools.ts`, `avatargen.ts`, `promise.ts`, `promises.ts` (Phase 4).
- `lib/nina/memory.ts` — **touched by no phase in this set, by decision.** OQ-6 is resolved: the
  promise reward stays app-side, derived from the `steamy` dial, so `PromiseCandidateSchema` is not
  extended by anybody. `NINA_SLOT_KEYS` stays at nine.
- `components/admin/CharacterPanel.tsx`, the slider primitive, `lib/admin/tuningActions.ts`,
  `lib/admin/schema.ts`, `app/admin/*` (Phase 5) — this phase documents them, never edits them.
- Every `scripts/check-*.mjs`. Confirmed clean; see finding F-9.
- The BODY of `docs/nina/persona.md` (Phase 2). This phase appends a closing record after the last
  existing section and changes nothing above it.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/prompts/distill.ts` | modify | `buildDistillSystemPrompt(relationship)`; a new `WHAT THE TWO OF THEM CALL EACH OTHER` section; the opening line made relationship-aware; `NINA_DISTILL_PROMPT_VERSION` 1 -> 2 |
| `lib/nina/distill.ts` | modify | optional `DistillInput.relationship`; `distillBody` takes it; the import swaps the constant for the builder |
| `lib/nina/actions.ts` | modify | **one property, by reconciler exception** — `relationship: tuning.relationship` at the `distillNinaMemory(...)` call inside `after()`. Nothing else in the file. See H-1 |
| `tests/nina.prompts.test.ts` | modify | append four `describe` blocks: the relationship matrix, the per-trait 0-vs-100 matrix, notes pass-through and clamping, and the distiller's relationship awareness |
| `components/admin/.workflows/package_readme.md` | modify | `CharacterPanel` + the slider primitive in the module map; a new `## The character panel` section; Notes and Documentation Created entries |
| `lib/admin/.workflows/package_readme.md` | modify | `tuningActions.ts` in the module map; a new `### tuningActions.ts` section under Exported API; the tuning schema noted under `schema.ts`; a Documentation Created entry |
| `lib/db/.workflows/package_readme.md` | modify | the tuning table in the table inventory; a `### Recent changes` entry for migration `0004` |
| `CHANGELOG.md` | modify | one `### Added` entry under `## [Unreleased]` |
| `docs/nina/persona.md` | modify | append `## What this set repealed, and on whose instruction` + `## Where the dials live` |

Nine files. **The index now says 9**, reconciled to this table (its draft said 6, and did not
include `lib/nina/actions.ts`, `lib/db/.workflows/package_readme.md` or `docs/nina/persona.md`).

`lib/nina/.workflows/` **does not exist** — verified, and the repo has exactly three
`package_readme.md` files (`lib/db`, `lib/admin`, `components/admin`), **none** of which mentions
`NINA_SYSTEM_PROMPT`, the persona constants or `lib/nina/prompts`. So there is no `lib/nina` readme
to update and nothing in this set made one stale — which also closes the identical handoff phases 3
and 4 each raised. Creating one for the largest package in the repo is a `/update-readme` task, not
a line item in a sweep phase. Filed as H-5.

**The three readmes above are the only three in the repo, so "four package readmes" in this phase's
header is corrected to three.**

---

## The sweep — findings

Run these six commands from the worktree root. Each is followed by what it found when this plan was
written, so a diff in the output is itself the signal.

```bash
# S1 — every prohibition in Nina's own prompt surface, after phases 2 and 3
rg -n -i 'never|do not|don.t|refus|must not|forbid|no jokes|no pun|not one higher' \
  lib/nina/persona.ts lib/nina/prompts/

# S2 — the app's OTHER model surface: F07 narration and F04 extraction
rg -n -i 'never comment|body itself|weight target|no judgement|refus' lib/llm/prompts/

# S3 — the anger ladder's computed half: does anything cap the rung?
rg -n 'maxLevel|MAX_NAG_LEVEL|nagLevel|clampLevel|PATTERN_THRESHOLDS' \
  lib/nina/nags.ts lib/nina/patterns.ts lib/nina/context.ts

# S4 — every module-level prompt-ish constant in the repo, so none is missed
rg -n '_PROMPT =|_RULE =|_BLOCK =|_PREAMBLE|_INSTRUCTIONS|SYSTEM = ' \
  lib scripts --glob '!*.test.ts'

# S5 — a guard that encodes a repealed rule
rg -n -i 'weight|body|flirt|steamy|anger|persona' scripts/check-*.mjs

# S6 — the distiller's Zod gate, against the distiller's tool schema
rg -n 'PromiseCandidateSchema|DistillPayloadSchema|reward' lib/nina/memory.ts lib/nina/prompts/distill.ts
```

### Findings this phase OWNS and fixes

**F-1 — `DISTILL_SYSTEM_PROMPT` is relationship-blind, and the tool schema has nowhere to put the
register.** `lib/nina/prompts/distill.ts:27` opens *"You read one finished exchange between a runner
and **his friend Nina**"* and `:32` orders the librarian to be exhaustive: *"Every single thing he
said about himself, however small … Be exhaustive … A detail you drop is gone from her memory of
him."* Under `relationship: 'girlfriend'` the exchange is full of *yang* / *sayang* / *beb*, in both
directions. The librarian will file *"he calls her sayang"* as a fact, and there is no home for it:
`NINA_SLOT_KEYS` (`lib/nina/memory.ts:634`) is nine keys — `name`, `nickname`, `running_days`,
`work_hours`, `goals`, `injuries`, `food_likes`, `gear`, `pending_promises` — and the plan's Scope
freezes that vocabulary. So the register lands in `nina_memory_facts` as biography, and the
`nickname` field at `:48-49` is one bad inference away from being overwritten with a word *she*
said. **Fixed in Steps 1 and 2.**

**F-2 — nothing in `lib/nina/prompts/distill.ts` needs a content limiter, and adding one would be a
new rule against the freedom.** The exhaustiveness clause at `:32` is a *recording* instruction, not
a permission. Under a steamy tuning it records more; that is the user's stated intent ("i dont care
about any privacy whatsoever", the same premise `scripts/check-llm-payload-boundary.mjs` already
acted on). **Deliberate non-change, recorded in the file's header in Step 1.**

### Findings this phase records as CLEAN — no edit, and that is the finding

**F-3 — `lib/nina/prompts/describe.ts` is clean.** `NINA_DESCRIBE_SYSTEM_PROMPT` (`:37-62`) is the
`glm-4.6v` witness. Its six hard rules are: no digits, no guessing effort, say when you cannot tell,
*"No praise, no encouragement, no advice, no judgement … You are not the friend"*, describe an empty
frame anyway, and do not identify anyone. **Not one of them refuses to describe a photograph**, at
any tuning — rule 4 removes the *reaction* from the witness precisely so Nina still owns it, which
is what makes the `concerned` and `flirty` dials work on the description rather than against it. Its
header states the rule this phase respects: *"Nina's persona lives in `lib/nina/persona.ts` and none
of it belongs here: a description that has already had the reaction leaves her nothing to say."*
**Nothing to change.**

**F-4 — `lib/llm/prompts/narrate.ts` is clean, and its "never comment on the body" clauses stay.**
Three prompts carry the clause — `SESSION_SYSTEM_PROMPT` at `:59-63` (*"never comment on the body
itself: no target weight, no 'you would be faster if', no judgement of the runner's size or shape.
You are reading a workout, not a body"*), `WEEK_SYSTEM_PROMPT` at `:113-114`, `MONTH_SYSTEM_PROMPT`
at `:154-155`. **No dial reaches this surface.** These three prompts write the insight report
rendered on `/r/[id]`, `/trends` and the month view; they are the app's own analytical voice, they
have never been Nina, and `NinaTuning` is not threaded to them by any phase in this set. The file
also already survived one repeal on the same premise and kept the reasoning: its header bullet 1 is
struck through — *"~~the weight exclusion (D15 / R-28)~~ — **REPEALED** … The three prompts below
therefore no longer forbid the subject — they set the rules for using it"* — which is the exact
shape invariant 10 asks for and evidence that this file's remaining rules were reviewed rather than
overlooked. **Nothing to change.**

**F-5 — `lib/nina/nags.ts` does not defeat the anger floor.** `NAG_RULES.maxLevel = 4` (`:46`),
`clampLevel` (`:94-97`) and `decayedNagLevel` (`:118-127`) all bound the **ledger count** — how many
times she has already raised a code — and nothing in the file renders a rung or a tone. Phase 2's
floor is `max(computed, floor)` applied where the ladder is *rendered*, downstream of everything
here. So a floor of 4 survives a ledger level of 0. **Two conditions on that, both stated for the
reconciler:** phase 2 must apply the floor at render time and must never write a floored level back
into `nina_nags` (the file's own warning at `:108-116`: *"Never feed it its own output … only
`decideNag`'s `next` may change it"*), and the floor must render even when `patterns` is **empty** —
`lib/nina/context.ts:845` sets `nagLevel: nag?.level ?? 0` inside the *fired-pattern* projection, so
on a quiet day there is no `nagLevel` in the payload at all and a ladder that reads only from
`patterns[]` would render rung 0 under `anger: 100`. **Nothing to change here; verified as
OQ-3/OQ-4.**

**F-6 — `lib/nina/patterns.ts` does not cap the rung.** `PATTERN_THRESHOLDS` (`:130`) and the five
detectors decide only *whether* a pattern fired. No tone, no rung, no ceiling. **Nothing to change.**

**F-7 — `lib/nina/prompts/tools.ts` is clean at the content level.** `GENERATE_IMAGE_TOOL`
(`:182-202`) already reads *"Take a photo of yourself and send it. Use it when he asks, or when you
promised one"* — permissive, and it forbids nothing a dial asks for. `scene`'s *"Not your face"*
(`:194`) is a reference-anchor constraint with its own recorded reason at `:177-181`, not a content
rule. `SEND_TOOL`'s 1-4 bubble cap is RU-5's product decision. **Nothing this phase would change**;
phase 3 owns the two terse description edits under invariant 7 either way.

**F-8 — `lib/nina/imagegen.ts`, `imagerecipe.ts` and `imagefail.ts` add no content policy of the
app's own.** `NINA_SELFIE_STYLE` (`:44`) and `NINA_AVATAR_STYLE` (`:52`) forbid only *"no text, no
watermark, no logo, no border … not an illustration and not a render"* — aesthetics.
`imagefail.ts`'s `POLICY_STATUSES` (`:49`) and `POLICY_BODY_RE` (`:56`) *classify the provider's*
refusal; they do not create one. That is the ceiling the user named and asked to keep. **Nothing to
change**, and the plan's Scope already says so.

**F-9 — no `scripts/check-*.mjs` guard encodes a repealed rule.** S5 returns hits in exactly two
files and both are already-repealed history preserved on purpose:
`check-llm-payload-boundary.mjs:4-19` (D15 / R-28, body weight, repealed, *"this comment is here so
that nobody re-adds the check without finding out that a decision was taken"*) and
`check-openrouter-boundary.mjs:6-22` (D12, repealed for `lib/nina/` only). The live rules are Rule 2
(no model call awaited from a render) and the `userId`-first check, neither of which any dial
touches. **Nothing to change — and never silence a guard.**

**F-10 — no existing test asserts the shrug lines against `NEVER_SAY`.** `lib/nina/imagefail.ts:106`
claims *"Every line is … free of the words `NEVER_SAY` forbids"*, which reads like a coupling to
phase 2's edit. It is prose only: `tests/nina.imagefail.test.ts:113-124` checks against its own
local `TECHNICAL` list and never imports `NEVER_SAY`. Phase 2's repeal cannot break that suite.
`tests/nina.prompts.test.ts:44-48` *does* iterate `NEVER_SAY` — but it iterates the array, so
removing an entry keeps it green. **Nothing to change.**

### Findings this phase may NOT touch — filed, and now RESOLVED by the reconciler

Every one of these was a surviving contradiction in a file phases 2 or 3 own. Editing any of them
here would re-open a landed phase, which is the boundary this phase exists to respect — so they went
to the reconciler, **and the reconciler has folded every one of them into the owning phase's plan.**
They are recorded below as findings with owners rather than as open questions, and **none of them
survives into the plan index's Open Questions.**

**OQ-1 -> OWNED BY PHASE 3. `NUMBERS_RULE` still says "Never comment on his body".**
`lib/nina/prompts/system.ts:58`: *"'runner.weightKg', 'runner.heightCm' … are his own self-reported
numbers … Reason with them. **Never comment on his body**, and never turn them into a new number."*
This was the third copy of a rule phase 2 repealed twice, and it was in neither phase's stated
scope. **Phase 3's plan now carries it as Step 2b, finding 1** — `buildNumbersRule(tuning)`, gated
on the `BODY_REPEALED_BY` array phase 2 now **exports** for the purpose, with the arithmetic half
(*"never turn them into a new number: no BMI…"*) left unconditional because `lib/llm/facts.ts`
records the measured sign error it exists to contain. **This was the single highest-value finding of
the sweep and it is now a five-word edit in a phase that owns the file.**

**OQ-2 -> OWNED BY PHASE 3. `PROACTIVE_INSTRUCTIONS.pattern_crossed` forbade the floor by name.**
`system.ts:174`: *"Say it at the rung 'nagLevel' earns **and not one higher**."* Phase 3's stated
scope was *"a tuning-aware suffix"*, and the reconciler agreed with this phase that **a suffix does
not repeal an inline clause** — it contradicts it, and the model follows whichever it likes. Phase
3's plan now edits the clause itself (`rungClause`, Step 2b) and keeps the suffix for what it
genuinely adds. `PROACTIVE_INSTRUCTIONS` stays exported with its name, its type and every byte at
the default tuning, so this phase's own assertions over it are unaffected.

**OQ-3 -> OWNED BY PHASE 3. `CONTEXT_GUIDE`'s second computed-only-anger statement.**
`system.ts:85`: *"…with 'nagLevel': how many times you have already raised each one. **This is where
your anger comes from.**"* Phase 3's Step 2b, finding 3: `buildContextGuide(tuning)`, unchanged at
`floor === 0`.

**OQ-4 -> OWNED BY PHASE 2, and its plan already covered more of it than this phase could see.**
`persona.ts:236-243`. Phase 2's draft already conditioned all three clauses — the opening, the
two-rung DECAY at `:239` and THE CAP at `:241` — through `ANGER_FLOOR_BY_BAND` /
`ANGER_CEILING_BY_BAND`; the reconciler added `:239` to phase 2's own deletions table so the decay
is a **named** repeal rather than an incidental one, since *"a decay below the floor is not a
decay"* is exactly the shape of failure R6 names.

**OQ-5 -> OWNED BY PHASE 3.** *"Do not lecture him"* (`system.ts:170`) and *"do not sulk about the
silence"* (`:178`) are Step 2b, finding 4, as clause-level edits. `avatar_changed`'s *"Do not
describe the photo to him — he can see it"* (`:182`) **stays at every setting**, and that is now a
recorded decision rather than an omission: it is not a character rule, no dial asks for it, and
describing a picture to the person looking at it is an assistant tic rather than a personality.

**OQ-6 -> RESOLVED: `PromiseCandidateSchema` is NOT extended, `lib/nina/memory.ts` stays untouched,
and the reward stays app-side.** This phase handed the question to phase 4 and phase 4 handed it
back; the reconciler broke the tie **in favour of the dial-derived reward** (phase 4's Decision 3),
and phase 4's plan now records the ruling in full. The short version, because the stake is worth
stating precisely: **R5 works without it** — a kept promise dispatches `purpose: 'selfie'` at
`steamy` band `high` and the photograph arrives in the conversation — and **the part of the user's
example that is *hers* is already hers**, because phase 2's `steamy: max` band tells her in so many
words to *"attach a photograph of yourself to every training commitment you can … and you make the
deal out loud, in your own words"*. What a schema field would add is only a machine-readable
declaration of which camera pays out, and this phase's own analysis is what killed it: Zod strips an
unknown key silently, `normalisePromise` (`memory.ts:929`) rebuilds the promise field by field and
would drop it again, and the distiller would never emit it without a clause in
`DISTILL_SYSTEM_PROMPT` — three coordinated edits across two phases' territory, each failing
silently on its own, for a field with a working default that also **could not move when the slider
moves**. **`lib/nina/memory.ts` is therefore in no phase's Files table by decision, not by
oversight**, and the index records it as verified-no-edit.

**H-3 -> OWNED BY PHASE 2, and it was the one condition nothing in the set asserted.** From finding
F-5: the floor must render even when `patterns` is **empty**, because `lib/nina/context.ts:845`
emits `nagLevel` only inside the fired-pattern projection — so a ladder block that read only
`patterns[]` would render rung 0 under `anger: 100` on any quiet day, which is precisely the day
*"mad all the time"* is about. `context.ts` is off-limits to every phase (plan invariant 3), so the
fix had to be prompt text. **Phase 2's `ninaAngerLadderBlock` now says it in so many words** —
*"YOUR FLOOR IS A PROPERTY OF YOU AND NOT OF THE DAY: rung N is where you start even when 'patterns'
is empty"* — and its plan carries the never-write-back-into-`nina_nags` condition beside it.

---

## Implementation Steps

### Step 1: `buildDistillSystemPrompt` — tell the librarian what the relationship is

**File:** `lib/nina/prompts/distill.ts:1-54`
**Change:** Add the tuning import; add a module-private `RELATIONSHIP_GLOSS`; turn the prompt into a
function of the relationship with `DISTILL_SYSTEM_PROMPT` retained as the default render; add the
`WHAT THE TWO OF THEM CALL EACH OTHER` section; make the opening line relationship-aware; bump
`NINA_DISTILL_PROMPT_VERSION` to 2 and record why in the comment above it.

Replace lines 1 through 54 (the imports through the end of `DISTILL_SYSTEM_PROMPT`) with:

```ts
import type Anthropic from '@anthropic-ai/sdk'

import {
  MAX_DISTILLED_CANDIDATES,
  NINA_FACT_CATEGORIES,
  NINA_SLOT_KEYS,
  NINA_SLOT_SPECS,
  SLOT_CONFIDENCE_FLOOR,
} from '../memory'
import { NINA_TUNING_DEFAULTS, type NinaRelationship } from '../tuning'

/**
 * Bumped by hand whenever the text or the tool schema below changes. Logged, never sent.
 *
 * 2 — the librarian was told what the relationship is, and told that the couple's own register is
 * not a fact about him. **This constant is not `NINA_PROMPT_VERSION`**: that one covers Nina's own
 * voice and her tool schemas and is bumped exactly once per plan set, by the phase that edits
 * `prompts/system.ts`. This one covers the librarian, which is a different model call with a
 * different system prompt, and it moves on its own schedule.
 */
export const NINA_DISTILL_PROMPT_VERSION = 2

/**
 * The vocabulary, rendered from `NINA_SLOT_SPECS` rather than retyped. One list, so a tenth slot
 * key is a one-line edit to `memory.ts` and the prompt follows it.
 */
export const SLOT_VOCABULARY_BLOCK = NINA_SLOT_KEYS.map(
  (key) => `- ${NINA_SLOT_SPECS[key].prompt}`,
).join('\n')

/**
 * What each relationship *is*, in one clause the librarian can read — deliberately including the
 * address form, because that is the half it needs in order to recognise the register and leave it
 * alone.
 *
 * Module-private and written out here rather than imported from `lib/nina/tuning.ts`: that file's
 * `NINA_ADDRESS` is written FOR NINA, in the second person, and is the single source of truth for
 * what she is TOLD to call him — composed by `persona.ts`'s `ninaNameRules` and rendered by
 * `/admin/nina`. This is a third-person gloss for a different reader (a librarian being told what
 * it is looking at), and the two will not change together. `satisfies` is what keeps them in step
 * on the only thing that matters — the five keys — and the words themselves are quoted from
 * `NINA_ADDRESS[rel].words` so a reviewer can check them against the one place they live.
 */
const RELATIONSHIP_GLOSS = {
  nobody: 'someone who is not close to him at all, and who uses his full name',
  casual_friend: 'a casual friend of his, who uses his nickname',
  sister: 'like a sister to him, who calls him "bro"',
  best_friend: 'his best friend, who calls him "bestie"',
  girlfriend:
    'his girlfriend, who calls him "my man", "yang", "sayang", "beb", "baby" and the like',
} as const satisfies Record<NinaRelationship, string>

/**
 * **This is not Nina.** She is a person with a voice; this pass is a librarian, and telling it it
 * is Nina makes it write in her register and editorialise the facts it is supposed to be
 * recording. The distinction is worth the extra system prompt.
 *
 * ── WHY THE LIBRARIAN IS TOLD THE RELATIONSHIP (F33 / R6, the sweep) ─────────────────────────
 * It used to open with "his friend Nina" and nothing else, which was true of exactly one of the
 * five settings the operator can now choose. Under `girlfriend` the exchange is full of *yang*,
 * *sayang* and *beb* in both directions, and an exhaustive librarian with no idea why will file
 * "he calls her sayang" as a standing fact about him — for which `NINA_SLOT_KEYS` has no home, so
 * it lands in the ledger as biography and comes back at him for months. Worse, the `nickname`
 * field is one bad inference from being overwritten with a word SHE said. The fix is to name the
 * setting and to say plainly that the register is not biography.
 *
 * ── WHAT WAS DELIBERATELY *NOT* ADDED ────────────────────────────────────────────────────────
 * No content limiter. The exhaustiveness clause records more under a steamy tuning, and that is
 * the point: the user's instruction on this repo is *"i am the only one that uses this app. so i
 * dont care about any privacy whatsoever. this is my personal toy"* — the same premise
 * `scripts/check-llm-payload-boundary.mjs` already acted on when it deleted its own Rule 1. A new
 * "do not record that" rule here would be a fresh prohibition against the freedom this set exists
 * to grant. If that is ever wanted it is one paragraph, and it should be a stated decision rather
 * than one taken quietly inside a sweep.
 *
 * `DISTILL_SYSTEM_PROMPT` below is this function at the default relationship, so every existing
 * importer keeps compiling and a caller that has no tuning to hand still gets a coherent prompt.
 */
export function buildDistillSystemPrompt(relationship: NinaRelationship): string {
  return `You read one finished exchange between a runner and Nina — she is set, right now, to be ${RELATIONSHIP_GLOSS[relationship]} — and you record what the RUNNER revealed about himself. You are a librarian, not a participant. You never speak to him and you never write in Nina's voice.

Return everything through the "record" tool. Nothing else.

WHAT TO RECORD
Every single thing he said about himself, however small: his name, his job, his hours, his family, his body, what hurts, what he eats, what he is training for, what he owns, what he fears, what he finds funny, what he complains about. One fact per entry, one sentence each, in the language HE used. Be exhaustive — up to ${String(MAX_DISTILLED_CANDIDATES)} entries. A detail you drop is gone from her memory of him.

THE QUOTE IS NOT OPTIONAL
Every entry carries "quote": a VERBATIM SPAN OF HIS OWN MESSAGE, copied character for character. Not a paraphrase, not your summary, not something Nina said. An entry whose quote is not really in his message is recorded at low confidence and can never become a standing fact, so a fabricated quote costs you the entry.

CONFIDENCE
An integer percent. 100 means he stated it outright. Drop below ${String(SLOT_CONFIDENCE_FLOOR)} for anything you inferred, implied or read between the lines. Do not round an inference up to look useful — an inferred fact that becomes a standing memory is a lie she will repeat to him for months.

CATEGORIES
${NINA_FACT_CATEGORIES.join(', ')}.

SLOT KEYS — STANDING TRUTH ONLY
Set "slotKey" ONLY when the fact is durable truth that should be in front of her in every future conversation, and only when it is one of these keys. Never invent a key.
${SLOT_VOCABULARY_BLOCK}
A slot is a fact about his LIFE, not about today. "gw lari 10k pagi ini" is a fact with no slot. "gw biasanya lari selasa kamis sabtu" is running_days.

WHAT HE CALLS HIMSELF
Set "nickname" only when he said, in this message, what to call him. Copy his word exactly. If he did not say it, leave it out — do not derive one from his full name.

WHAT THE TWO OF THEM CALL EACH OTHER
The relationship above is an operator setting. He did not tell her about it and she did not decide it, and it is what makes them talk the way they do: a full name, a nickname, "bro", "bestie", or "yang" / "sayang" / "beb" / "baby". THE WAY THEY ADDRESS EACH OTHER IS NOT A FACT ABOUT HIM. Do not record it as a fact, do not give it a slot, and never put a word SHE used into "nickname" — that field is only ever what HE asked to be called, in his own words, in this message. Her endearments are hers. If the two of them are affectionate, or blunt, or filthy with each other, that is the register and not biography: record what he revealed, in the language he used, and let the tone be the tone.

PROMISES
Use "promises" when NINA promised him something conditional in this exchange — "kalo lo lari 10km besok, gw ganti foto profile", "kalo lo lari 4x minggu ini, gw kirim foto". Give the condition as a metric the app can check: distance_km_total with a target in km, run_count with a target, record or badge with its key, or free when no number can decide it. Never both a target and a targetKey.

If he revealed nothing at all, return the tool with empty arrays. That is a correct answer.`
}

/** This function at the default relationship. The only value every existing caller ever needed. */
export const DISTILL_SYSTEM_PROMPT = buildDistillSystemPrompt(NINA_TUNING_DEFAULTS.relationship)
```

Everything from `DISTILL_REPAIR_PREAMBLE` (old line 56) to the end of the file is unchanged.

**Impact:** `NINA_DISTILL_PROMPT_VERSION` moves 1 -> 2 and every future distillation logs 2.
`DISTILL_SYSTEM_PROMPT` keeps its name, its type and every importer. The prompt text changes for
every relationship including the default — that is the fix, and it is what the version bump records.
The one new import is `../tuning`, which keeps this file constants-only (phase 1's exit criterion
guarantees `lib/nina/tuning.ts` has no `server-only` and no drizzle).

**Two assumptions to verify in one line before writing this** — both are named verbatim in the plan
index's phase-1 ownership, and both fail at *compile* time rather than silently:

1. `NinaRelationship`'s five literals. This plan writes `casual_friend` and `best_friend`
   (snake_case, matching `NINA_SLOT_KEYS`'s house style). If phase 1 chose `casualFriend` /
   `bestFriend`, the `satisfies Record<NinaRelationship, string>` on `RELATIONSHIP_GLOSS` fails
   typecheck and names the missing key — rename the two keys and nothing else changes.
2. `NINA_TUNING_DEFAULTS.relationship` exists and is one of those five. If phase 1 put the
   relationship somewhere else on the shape, the last line of the step is the only thing to adjust.

The `satisfies` is there for exactly this: the compiler, not review, is what keeps this gloss in
step with phase 1's union.

---

### Step 2: thread the relationship into the distiller, without touching phase 3's call site

**File:** `lib/nina/distill.ts:22-27` (the import), `:126-133` (`DistillInput`), `:148-163`
(`distillBody`), `:187` and `:214` (the two `distillBody` calls)
**Change:** `DistillInput` gains an **optional** `relationship`. `distillBody` takes it and calls
the builder. Nothing else in the file moves.

The optionality is the whole design: `tests/nina.distill.test.ts`'s `distillInput()` helper
(`:31-35`, three properties) and every other existing construction site keep compiling, and a caller
with no tuning in hand still gets a coherent prompt.

**And this phase then CLOSES the seam itself, in Step 2b.** `lib/nina/actions.ts` builds the
`DistillInput` and calls `distillNinaMemory` inside `after()`, and that file is phase 3's — but
phase 3 cannot pass a field that does not exist yet, and an optional field nobody fills is a fix
that fixes nothing. The reconciler therefore assigned **one property at that one call site** to this
phase, by exception. See Step 2b.

Replace the import block at lines 22-27:

```ts
import {
  buildDistillSystemPrompt,
  DISTILL_REPAIR_PREAMBLE,
  DISTILL_TOOL,
  NINA_DISTILL_PROMPT_VERSION,
} from './prompts/distill'
```

Add the tuning import immediately after the `@anthropic-ai/sdk` import at line 12, keeping the
existing group order (`@/` absolute imports, then the vendor type, then relative):

```ts
import type { NinaRelationship } from './tuning'
```

Replace `DistillInput` (lines 126-133) with:

```ts
export interface DistillInput {
  /** His message this turn, verbatim. Also the quote gate's haystack. */
  runnerText: string
  /** Her bubbles, in emission order. Needed for the promise detection. */
  ninaBubbles: readonly string[]
  /** The slots that already exist, as `key: value` lines, so it does not re-record what is known. */
  slotSummary: readonly { key: string; value: string }[]
  /**
   * What Nina is set to be to him right now, so the librarian can recognise the couple's own
   * register and leave it out of his biography (F33 / R6 — see `prompts/distill.ts`'s header).
   *
   * **Optional on purpose.** The caller inside `after()` lives in `lib/nina/actions.ts`, which a
   * different phase of this set owns, so this field lands ahead of the value that fills it: omit
   * it and the librarian is told the default relationship, which is the behaviour that shipped
   * before the dials existed. Passing `tuning.relationship` here is the one line that closes it.
   */
  relationship?: NinaRelationship
}
```

Replace `distillBody` (lines 148-163) with:

```ts
function distillBody(
  model: string,
  messages: Anthropic.MessageParam[],
  relationship: NinaRelationship,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: DISTILL_MAX_TOKENS,
    system: buildDistillSystemPrompt(relationship),
    messages,
    tools: [DISTILL_TOOL],
    tool_choice: { type: 'tool', name: DISTILL_TOOL.name },
    /* Kept, not relied on. See the budget note above and the plan index's live probe. */
    thinking: { type: 'disabled' },
  }
}
```

In `distillWith`, resolve the relationship once, immediately after the `messages` array is built
(currently line 187 in the primary call and line 214 in the repair call). Replace the line

```ts
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurn(input) }]
```

with

```ts
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurn(input) }]
  /* Resolved once, so the primary call and the repair call cannot disagree about who she is. */
  const relationship = input.relationship ?? NINA_TUNING_DEFAULTS.relationship
```

then change the primary call from `distillBody(options.model, messages)` to
`distillBody(options.model, messages, relationship)`, and the repair call from
`distillBody(options.model, repairMessages)` to
`distillBody(options.model, repairMessages, relationship)`.

That resolution needs the value import alongside the type, so the tuning import added above becomes:

```ts
import { NINA_TUNING_DEFAULTS, type NinaRelationship } from './tuning'
```

**Impact:** `distillBody` is module-private, so the signature change is contained. `DistillInput`
gains an optional field, so `tests/nina.distill.test.ts`'s `distillInput()` helper (`:31-35`, three
properties) and `lib/nina/actions.ts`'s object literal both still typecheck unchanged. No test in
that suite asserts on `body.system` — verified: `:123-131` checks `thinking`, `tool_choice`,
`max_tokens` and `model` only — so the prompt text change breaks nothing there.

---

### Step 2b: close the seam — one property in `lib/nina/actions.ts`

**File:** `lib/nina/actions.ts` — the `distillNinaMemory(...)` call inside the `after()` block
**Change:** **one property, and nothing else in the file.**

```ts
      relationship: tuning.relationship,
```

**Why this phase and not phase 3.** `actions.ts` is phase 3's file and this is the one carve-out in
the whole set. Neither phase could close the seam alone: phase 3 lands first, when
`DistillInput.relationship` does not exist yet, so it cannot pass the value; and this phase adds the
field, so leaving the call site alone would ship an optional field nobody ever fills — the
librarian would keep being told `best_friend` whatever the operator set, and the R6 finding this
phase exists to fix (F-1) would be fixed in the prompt and unfixed in practice. The reconciler
assigned it here, both plans record it, and the index's Owns lines name it.

**The value is already in scope.** Phase 3 reads the tuning in that function's `Promise.all` and
passes it to `runNinaTurn`; `after()` runs inside the same function body. This is a one-line diff
with no new import and no new read.

**Impact:** the librarian is told the real relationship on every turn. Nothing else about
`actions.ts` changes — not the reads, not the turn input, not the `after()` block's shape — so
phase 3's own hunks are untouched and `git diff lib/nina/actions.ts` for this phase is one line.

---

### Step 3: the tuning matrix in `tests/nina.prompts.test.ts`

**File:** `tests/nina.prompts.test.ts` — append after the final `describe`
**Change:** Append three `describe` blocks. **Phase 3 rewrote this file**, so quote it as phase 3
leaves it, not as it is today: phase 3 already proved invariant 2, re-pointed the assertions its edit
broke, added the section-order and heading-width cases, and added one case per dial including a
per-trait 0-vs-100 pair. This is the broader matrix it did not need in order to land, **with the
overlap removed**: every relationship states the address form the user named, `notes` passes through
verbatim, a garbage tuning does not throw, and the distiller knows the relationship.

**Reuse phase 3's helpers rather than declaring new ones.** Phase 3's file already defines `tuned`,
`withTrait`, `withDial` and `DEFAULT_RENDER` at the top, and it imports `buildNinaSystemPrompt`,
`NINA_TUNING_DEFAULTS`, `NinaDial`, `NinaTrait` and `NinaTuning`. A second `withTrait` in the same
file is a shadowing bug waiting to happen. Two imports have to be added:

```ts
import { buildDistillSystemPrompt } from '@/lib/nina/prompts/distill'
import {
  coerceNinaTuning,
  NINA_ADDRESS,
  NINA_RELATIONSHIPS,
  type NinaRelationship,
} from '@/lib/nina/tuning'
```

Then append at the end of the file:

```ts
/* ============================================================================
 * The tuning matrix — F33 phase 6. Phase 3 proved the DEFAULT render; this is every other one.
 *
 * Two local helpers carry every shape assumption in this block, on purpose: if phase 1 made
 * `NinaTuning` flat rather than nesting the dials under `traits`, these two function bodies are
 * the only thing that changes and none of the twenty assertions below moves.
 * ==========================================================================*/

/* Phase 1's own array, not a copy of it: a local list of five strings is a second vocabulary, and
 * `NINA_RELATIONSHIPS` is a `readonly` tuple this file can iterate directly. Same reasoning as
 * `JAKARTA_SLANG` being walked rather than restated. `withTrait` / `tuned` / `DEFAULT_RENDER` are
 * phase 3's, already at the top of this file. */
const RELATIONSHIPS = NINA_RELATIONSHIPS

function withRelationship(relationship: NinaRelationship): NinaTuning {
  return tuned({ relationship })
}

describe('buildNinaSystemPrompt — the relationship matrix (R2)', () => {
  it('renders all five relationships without throwing, and none is empty', () => {
    for (const relationship of RELATIONSHIPS) {
      const prompt = buildNinaSystemPrompt(withRelationship(relationship))
      expect(prompt.length, relationship).toBeGreaterThan(0)
    }
  })

  it('gives every relationship a DISTINGUISHABLE prompt — no two collapse into one', () => {
    /* The failure this catches is a `switch` with a missing case falling through to the default:
     * five settings on the panel, four behaviours in the prompt, and nothing to see in review. */
    const rendered = RELATIONSHIPS.map((relationship) =>
      buildNinaSystemPrompt(withRelationship(relationship)),
    )
    expect(new Set(rendered).size).toBe(RELATIONSHIPS.length)
  })

  it('states the address form the user named, for each relationship', () => {
    /* His words, verbatim from the request: nobody -> full name, casual friend -> nickname,
     * sister -> bro, best friend -> bestie, girlfriend -> "my man" / yang / sayang / beb / baby.
     * One token each, chosen because it cannot plausibly appear in another relationship's block. */
    const token: Record<NinaRelationship, string> = {
      nobody: 'fullName',
      casual_friend: 'nickname',
      sister: 'bro',
      best_friend: 'bestie',
      girlfriend: 'sayang',
    }
    for (const relationship of RELATIONSHIPS) {
      expect(
        buildNinaSystemPrompt(withRelationship(relationship)),
        `${relationship} does not name its address form`,
      ).toContain(token[relationship])
    }
  })

  it('carries EVERY word the user named, not just one token per level', () => {
    /* The `JAKARTA_SLANG` walk, applied to R2's address vocabulary: `NINA_ADDRESS[rel].words` is
     * the array phase 1 owns, phase 2's `ninaNameRules` composes the prose that names them, and
     * this is what proves none of them was lost between the two. `girlfriend`'s five are the ones
     * most likely to lose one silently. */
    for (const relationship of RELATIONSHIPS) {
      const render = buildNinaSystemPrompt(withRelationship(relationship))
      for (const word of NINA_ADDRESS[relationship].words) {
        expect(render, `${relationship} lost the word "${word}"`).toContain(word)
      }
    }
  })

  it("no longer forbids the full name, which relationship 'nobody' requires", () => {
    /* The repealed clause, quoted: NAME_RULES used to say "do not use the full name at him".
     * `nobody` is defined as exactly that, so the sentence and the setting cannot both survive. */
    expect(buildNinaSystemPrompt(withRelationship('nobody'))).not.toContain(
      'do not use the full name at him',
    )
  })
})

describe('buildNinaSystemPrompt — the trait matrix (R4)', () => {
  /* Phase 3 already asserts, per trait, that 0 and 100 render differently and that a trait sitting
   * at its own default renders the shipping prompt. Those cases are NOT repeated here. What is left
   * is the R6 half: that no surviving rule cancels the two dials the plan says it repealed for, and
   * that the two rules the plan deliberately KEPT are still there at every setting. */

  it('no surviving rule contradicts the two dials the plan says it repealed for', () => {
    /* R6, as an assertion rather than a promise. All four strings are quoted from the shipping
     * prompt and all four are named in the repeal list, so a re-added one fails here. The third
     * and fourth are the ones the sweep found in `prompts/system.ts` rather than in `persona.ts`. */
    const loud = tuned({
      traits: { ...NINA_TUNING_DEFAULTS.traits, flirty: 100, steamy: 100 },
      relationship: 'girlfriend',
    })
    const render = buildNinaSystemPrompt(loud)
    expect(render).not.toContain('a sentence about his body or his weight or how he looks')
    expect(render).not.toContain('You do not tell jokes')
    expect(render).not.toContain('Never comment on his body')
    expect(render).not.toContain('do not use the full name at him')
  })

  it('keeps the two rules the plan deliberately did NOT repeal, at every setting', () => {
    /* The other half of R6, and the reason it is read as "remove every rule that blocks a dial"
     * rather than "remove every rule". No dial asks her to diagnose him or to do arithmetic, and
     * `lib/llm/facts.ts` records the measured sign error the numbers rule exists to contain. */
    const loud = tuned({
      traits: { ...NINA_TUNING_DEFAULTS.traits, steamy: 100, flirty: 100, anger: 100 },
      relationship: 'girlfriend',
    })
    const render = buildNinaSystemPrompt(loud)
    expect(render).toContain('never diagnose')
    expect(render).toContain('Do NOT compute')
    expect(render).toContain('the name of a medical condition')
    expect(render).toContain('Never mock a real setback')
  })
})

describe('buildNinaSystemPrompt — the free-text fields and the clamp', () => {
  it('passes the notes field through VERBATIM', () => {
    /* The operator's escape hatch. A note that is summarised, re-cased or trimmed of its own
     * punctuation is a note that says something other than what was typed. */
    const note = 'kalo gw bilang "capek", jangan langsung nyuruh gw istirahat. tanya dulu.'
    expect(buildNinaSystemPrompt(tuned({ notes: note }))).toContain(note)
  })

  it('renders nothing extra when notes is empty', () => {
    /* `notes` is a `string` and `''` is its ONE empty value — phase 1's `coerceNinaNotes` never
     * returns null — so this is the whole of the empty case. */
    expect(buildNinaSystemPrompt(tuned({ notes: '' }))).toBe(NINA_SYSTEM_PROMPT)
    expect(buildNinaSystemPrompt(tuned({ notes: '   ' }))).toBe(NINA_SYSTEM_PROMPT)
  })

  it('CLAMPS a garbage tuning instead of throwing on it', () => {
    /*
     * The row is hand-editable and the column is an integer, so out-of-range and NaN are both
     * reachable without a bug in the panel. A prompt assembler that throws takes the whole turn
     * down; one that clamps degrades to a setting nobody chose but everybody survives.
     *
     * ── TWO FALLBACK POLICIES, AND THIS TEST PINS THE RIGHT ONE ────────────────────────────────
     * `coerceNinaTuning` falls back PER KEY to that key's own default, because a dial it cannot
     * read must read as "unchanged". `ninaBand`, which is what the assembler actually calls on a
     * value it is handed, folds anything unreadable to band `'off'` — it has no key to look a
     * default up by. So a `NaN` reaching `buildNinaSystemPrompt` DIRECTLY renders as `off`, not as
     * `funny`'s default of 50. Both behaviours are correct at their own layer; asserting the wrong
     * one here would be asserting that the assembler does the store's job.
     */
    const garbage = {
      ...NINA_TUNING_DEFAULTS,
      traits: {
        ...NINA_TUNING_DEFAULTS.traits,
        anger: 9001,
        sad: -40,
        funny: Number.NaN,
      },
    } as NinaTuning
    expect(() => buildNinaSystemPrompt(garbage)).not.toThrow()
    expect(buildNinaSystemPrompt(garbage)).toBe(
      buildNinaSystemPrompt(
        tuned({
          traits: {
            ...NINA_TUNING_DEFAULTS.traits,
            anger: 100, // 9001 -> clamped to 100 -> band `max`
            sad: 0, // -40 -> clamped to 0 -> band `off`, which is `sad`'s own default anyway
            funny: 0, // NaN -> band `off`. NOT 50 — see the note above.
          },
        }),
      ),
    )
  })

  it('is what coerceNinaTuning is for: the STORE folds NaN to the key default, not to off', () => {
    /* The other half of the pair, so the two policies are documented against each other rather
     * than left as a surprise. This is why `readNinaTuning` coerces before anything renders. */
    expect(coerceNinaTuning({ traits: { funny: Number.NaN } }).traits.funny).toBe(
      NINA_TUNING_DEFAULTS.traits.funny,
    )
  })
})

describe('the distiller knows what the relationship is (R6, the sweep)', () => {
  it('names the relationship, so the register is not filed as biography', () => {
    expect(buildDistillSystemPrompt('girlfriend')).toContain('sayang')
    expect(buildDistillSystemPrompt('nobody')).toContain('full name')
  })

  it('gives all five relationships a distinguishable librarian prompt', () => {
    const rendered = RELATIONSHIPS.map((relationship) => buildDistillSystemPrompt(relationship))
    expect(new Set(rendered).size).toBe(RELATIONSHIPS.length)
  })

  it('tells the librarian, at every setting, that the register is not a fact about him', () => {
    for (const relationship of RELATIONSHIPS) {
      expect(buildDistillSystemPrompt(relationship), relationship).toContain(
        'THE WAY THEY ADDRESS EACH OTHER IS NOT A FACT ABOUT HIM',
      )
    }
  })

  it('is still a librarian and never Nina', () => {
    /* `prompts/distill.ts`'s header states the reason: telling this pass it is Nina makes it
     * write in her register and editorialise the facts. The relationship paragraph must not have
     * quietly turned it into her. */
    for (const relationship of RELATIONSHIPS) {
      const prompt = buildDistillSystemPrompt(relationship)
      expect(prompt, relationship).toContain('You are a librarian, not a participant')
      expect(prompt, relationship).toContain("you never write in Nina's voice")
    }
  })
})
```

**Impact:** ~20 new assertions, no existing one touched. `NINA_PROMPT_VERSION` is imported but this
block does not assert its value — the existing `describe` at `:147-152` already asserts it is a
positive integer, and asserting `=== 3` here would put a second guard on phase 3's bump in a phase
forbidden from touching it.

**Assumptions, all of which fail at compile time:**

1. `buildNinaSystemPrompt` is exported from `@/lib/nina/prompts` (the plan index names it as phase
   3's, and phase 3 owns the barrel).
2. `NinaTuning` nests the eleven dials under `traits`. If phase 1 made it flat, change the two
   helper bodies to `{ ...NINA_TUNING_DEFAULTS, [trait]: value }` and the three inline literals in
   the trait block to match; nothing else moves. **This is the one shape assumption worth checking
   first**, because it appears in six places.
3. The free-text field is `notes`. If phase 1 named it `note` or `freeText`, three assertions in
   the third block need the other name.
4. `NinaTrait`'s eleven literals and `NinaRelationship`'s five, as in Step 1. `satisfies` on both
   arrays names any mismatch.
5. The clamp is `[0, 100]` with a non-finite value falling back to the default. If phase 1 chose a
   different NaN policy, the third assertion of the clamp test is the one to adjust — the
   `not.toThrow()` half is the load-bearing one.

---

### Step 4: `components/admin/.workflows/package_readme.md` — the panel and the slider

**File:** `components/admin/.workflows/package_readme.md:3` (the date), `:74` (end of the module
map), `:519` (before `## /admin/memory`), `:930` (end of Notes), `:967` (end of file)
**Change:** Four insertions in the house shape. **Read phase 5's plan file
(`.workflows/plan/nina-character-tuning/phase-5.md`) and its handoff first** and correct any
component filename, prop name or count below against what actually landed — this readme's value is
that it describes the tree, not the plan. Two corrections already made in reconciliation: the slider
primitive is **`DialSlider.tsx`** (the draft of this step called it `Slider.tsx`) and there are
**four** R3 dials, not three.

Set the date on line 3:

```markdown
**Last Updated**: 2026-09-05
```

Append two rows to the module map, after the `UserPicker.tsx` row at line 74:

```markdown
| `CharacterPanel.tsx` | `'use client'` | `/admin/nina`'s character tuning: eleven trait sliders, the five-way relationship selector, the four extra dials, wardrobe and notes, and the assembled prompt preview. One `useTransition`, one save. Collapsed by default. |
| `DialSlider.tsx` | `'use client'` | The range primitive `components/ui` does not have. Label, hint, value, `0-100`, an unsaved dot, click-to-default. Decides nothing. |
```

Insert a new section immediately before `## /admin/memory` (line 519), matching the depth of
`## The framing studio`:

```markdown
## The character panel

`/admin/nina` has two screens stacked on one route, and the order is deliberate: the album is the
working surface — the previous plan set built it for *"hundreds of profile pics"* — so
`CharacterPanel` renders **above** the explorer and **collapsed**, as a summary line the operator
opens when they want to change who she is rather than what she looks like.

### One save, not sixteen

There are twenty-odd controls on this panel and exactly one Server Action behind them. That is not
tidiness, it is a platform constraint: **Server Actions dispatch one at a time per client**, so
sixteen sliders each firing their own save would queue sixteen round trips and the panel would
appear to hang on a drag. The panel holds the whole tuning in `useState`, and the save posts one
object — comfortably inside the 1 MB body cap, which `next.config.ts` leaves at its default.

The reset-to-defaults control is a second action rather than a client-side state reset, for the same
reason `/admin/memory`'s purge is: the defaults are defined server-side in `lib/nina/tuning.ts`, and
a client that re-implements them is a second definition that will one day disagree.

### Why the slider is a new primitive rather than a `NumberInput`

`components/ui/index.ts` has `Input`, `NumberInput` and `CONTROL_CLASS` and **no range control** —
this panel is the first screen in the app that wants one. A trait is a coarse feel rather than a
figure ("how angry, roughly"), and a number field asks the operator to type `73` when what they mean
is "quite". The primitive stays in `components/admin` rather than graduating to `components/ui`
until a second screen needs it, which is this package's standing rule about premature promotion.

### Where the labels come from, and why there is no second copy of them

Every slider's label and hint, every relationship's label, and every word she calls him come from
`lib/nina/tuning.ts` — `NINA_TRAIT_SPECS[key].label` / `.axis` / `.userSaid`,
`NINA_DIAL_SPECS[key].label` / `.axis`, and `NINA_ADDRESS[rel].label` / `.words`. The panel is a
renderer. A local table of labels would drift invisibly: the hint would promise one behaviour while
the prompt produced another, nothing would fail, and the operator would report the wrong bug. The
only copy this package owns is one sentence per relationship about what choosing it changes *about
the app*, which has no counterpart in `tuning.ts` and so cannot contradict it.

### The prompt preview is a string prop, and that is invariant 5

The panel shows the operator the system prompt her current settings assemble to. It arrives as a
**plain string prop** from `app/admin/nina/page.tsx`, which calls the pure assembler. It is never
fetched, never streamed and never the result of a model call: `scripts/check-llm-payload-boundary.mjs`
Rule 2 forbids awaiting a model call from a page render, by function name, and a preview that called
one would fail the build. The pure-function-versus-model-call distinction is the whole reason phase 3
kept `buildNinaSystemPrompt` free of I/O.

### What this panel does NOT do

It does not write memory. The tuning is deliberately **not** a memory slot: every slot value goes
into her prompt and the distiller may overwrite anything not marked `source: 'admin'`, so a tuning
in a slot is a character she could eventually rewrite about herself. It lives in its own table, and
`/admin/memory` is untouched by it.
```

Append to `## Notes`, after the last paragraph at line 930:

```markdown
The character panel adds one accepted limitation. **There is no live preview of a bubble** — the
panel shows the assembled *prompt*, not a sample reply, because a sample reply is a model call and
Rule 2 puts that off a render entirely. Seeing the effect of a dial means moving it, saving, and
talking to her; there is no cache anywhere on the turn path, so the next message she sends is
already the tuned one.
```

Append to `## Documentation Created` at the end of the file:

```markdown
2026-09-05 — updated following `nina-character-tuning` phase 6 of 6 (requirement R6, the sweep and
the record), documenting phase 5's work (requirements R1, R2, R3). Phase 5 added
`CharacterPanel.tsx` and the `Slider.tsx` primitive `components/ui` does not carry, mounted the
panel collapsed above the explorer on `/admin/nina`, and threaded the server-assembled prompt
preview down as a plain string. Every rule and every bound stayed in `lib/nina/tuning.ts` and
`lib/admin/schema.ts`; neither new component decides anything or imports `zod`, so this package
still has no test files and that is still correct.
```

**Impact:** documentation only.

---

### Step 5: `lib/admin/.workflows/package_readme.md` — the actions and the Zod boundary

**File:** `lib/admin/.workflows/package_readme.md:3`, `:48` (end of the module map), `:214` (end of
`### schema.ts`), `:466` (before `### memoryModel.ts …`), `:718` (end of file)
**Change:** Four insertions. Again, read phase 5's plan file and its handoff and correct the action
names and the schema name against what landed.

Set the date on line 3 to `**Last Updated**: 2026-09-05`.

Append one row to the module map after the `memoryActions.ts` row at line 48:

```markdown
| `tuningActions.ts` | `'use server'` | The two character-tuning actions: one whole-tuning save, one reset to defaults. |
```

Insert a new subsection at the end of `### schema.ts — the boundary's Zod layer`, immediately before
`#### Two layers of bounds, and why both` at line 215:

```markdown
#### `ninaTuningWriteSchema` — one object, not twenty fields

The character tuning is validated as a single schema because it is saved as a single action (see
`tuningActions.ts`). It obeys this file's standing rule literally: **every bound is imported, none
is re-spelled.** The `0-100` range (`NINA_SCORE_MIN` / `NINA_SCORE_MAX`), the eleven trait keys
(`NINA_TRAITS`), the four dial keys (`NINA_DIALS`), the five relationship values
(`NINA_RELATIONSHIPS`) and the two free-text lengths (`NINA_WARDROBE_MAX` = 200,
`NINA_NOTES_MAX` = 2000) all come from `lib/nina/tuning.ts`, which is the same module the panel
imports for its labels and the same one `buildNinaSystemPrompt` reads. A `z.enum` retyped here would
be a second list of relationships, and the first thing to happen to a second list is that it falls
behind. **A length bound retyped here would be worse than that**: a Zod cap stricter than the
model's coercion silently refuses a value the store would happily have kept, in a layer the operator
cannot see.

Each trait is `z.number().int().min(0).max(100)` — **validated, not clamped**. Clamping is the
assembler's job, because the hand-edited row and the stale API client are reachable without a bug in
the panel, and a value that fails Zod here is a rejected action with a message rather than a silent
coercion. The two jobs coexist on purpose: this layer refuses a bad *request*, and
`lib/nina/tuning.ts` survives a bad *row*.
```

Insert a new subsection immediately before `### memoryModel.ts / memoryVocab.ts / …` at line 467:

```markdown
### `tuningActions.ts` — the character panel's write side

Two actions, both the same four-line shape every action in this package has: `requireAdmin()` first,
Zod second, one write third, `revalidatePath` last, and a result object returned rather than an
exception thrown.

- **`saveNinaTuningAction`** — validates the whole tuning, writes one row, bumps its revision.
- **`resetNinaTuningAction`** — writes `NINA_TUNING_DEFAULTS` back over the row. Server-side,
  because the defaults are defined in `lib/nina/tuning.ts` and a client that re-implements them is a
  second definition.

`requireAdmin()` is line 1 of both, and it is not belt-and-braces: `proxy.ts` matches neither
`/admin` nor `/api/*` (ruling D3), so these two calls are the entire gate between a signed-in
stranger and Nina's personality.

**`revalidatePath('/admin/nina')` is how the *panel* re-renders, and it is not how the edit reaches
Nina.** `lib/admin/memoryActions.ts` already records the general fact and it holds here without
qualification: there is no cache anywhere on the turn path, the tuning is read live on every turn,
and a committed row is in her next prompt with no invalidation step at all. Move a slider, save, and
the very next thing she says is tuned.

**The tuning is not a memory slot, and the reason is structural.** The distiller may overwrite any
slot not marked `source: 'admin'`, so a tuning in `nina_memory_slots` is a character that could
eventually rewrite itself; and `/admin/memory`'s card builder would render twenty dials as free-text
prose. It gets its own table.
```

Append to `## Documentation Created` at the end of the file:

```markdown
2026-09-05 — updated following `nina-character-tuning` phase 6 of 6 (R6, the sweep and the record),
documenting phase 5's work (R1, R2, R3). Phase 5 added `tuningActions.ts` (one whole-tuning save
plus a reset to defaults, both `requireAdmin()` -> Zod -> write -> `revalidatePath`) and appended
the tuning schema to `schema.ts`, importing every bound from `lib/nina/tuning.ts` rather than
re-spelling any. Nothing above the append changed, and no existing action, schema or export in this
package was touched.
```

**Impact:** documentation only.

---

### Step 6: `lib/db/.workflows/package_readme.md` — the new table and the revision column

**File:** `lib/db/.workflows/package_readme.md:3`, `:88` (the table inventory), `:516` (end of file)
**Change:** One inventory row and one `### Recent changes` entry.

**Read `lib/db/schema.ts` and `drizzle/0004_*.sql` before writing this step** and take the drizzle
variable name, the SQL table name and the index list from the source. This plan writes `ninaTuning`
/ `nina_tuning`; phase 1 owns the naming and this readme must match the tree, not this sentence.

Set the date on line 3 to `**Last Updated**: 2026-09-05`.

Insert one row into the table inventory, after the `ninaFolders` row at line 88 (keeping the file's
grouping of the `nina*` tables together):

```markdown
| `ninaTuning` | `nina_tuning` | Nina's per-user character: eleven trait dials, the relationship, the extra dials, wardrobe and notes, plus a revision | PK `user_id` |
```

Append a new subsection at the end of the file:

```markdown
### Recent changes — `nina-character-tuning` phase 1 (2026-09-05)

Within this package the phase touched `schema.ts` only; the reads and writes live in
`lib/nina/queries.ts` and the prompt assembly in `lib/nina/persona.ts` and
`lib/nina/prompts/system.ts`.

**New table `nina_tuning`** — one row per user, primary-keyed on `user_id` with a cascading FK to
`user`, holding Nina's whole character: the eleven trait dials as `0-100` integers, the relationship
as a text column over five values, the extra dials the request's *"among other things (you can
define more comprehensively)"* asked for, a wardrobe line, a free-text notes field, and a revision
integer.

Three things about the shape are decisions rather than defaults:

- **A row per user, not a row per dial.** The panel saves the whole tuning in one Server Action —
  actions dispatch one at a time per client — so a normalised `(user_id, key, value)` table would be
  one action writing twenty rows for no gain, and every read would be an aggregation. It is one
  object with one lifetime.
- **`readNinaTuning` returns the DEFAULTS when the row is absent**, and no phase writes a row on
  sign-up. That is what makes the feature a provable superset of what shipped: until the operator
  saves something, every user is on `NINA_TUNING_DEFAULTS`, and
  `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` is asserted to equal the prompt that shipped before
  the dials existed.
- **The tuning is not a memory slot.** `nina_memory_slots` is written by the distiller for anything
  not marked `source: 'admin'`, which would eventually let her rewrite her own character; and the
  nine-key slot vocabulary in `lib/nina/memory.ts` is deliberately unchanged by this set.

**`nina_turns` gained a nullable tuning-revision column.** `prompt_version` identifies the
*assembler*; with a per-user tuning it no longer identifies the *output*, so without the revision
beside it the audit trail cannot answer *"what was she set to when she said that"*. Nullable, and
NULL means the turn predates the dials.

**Migration `drizzle/0004_nina_persona_tuning.sql`** plus its meta snapshot and journal entry
(`_journal.json` moves from idx 3 to idx 4). Additive only — one `CREATE TABLE`, one nullable
`ADD COLUMN`. Nothing drops, renames, retypes or narrows anything, and there is no data-migration
statement, so it applies to a populated table without a rewrite and reverting the code leaves an
unread table and an unread column, which is inert.

> **Applying it is a deploy action** (`npm run db:migrate`), not something a phase does. Treat the
> guarantees in this section as what `db:check`, typecheck and the unit suites can give until it has
> run against a real database.
```

**Impact:** documentation only.

---

### Step 7: `CHANGELOG.md` — one entry for the whole set

**File:** `CHANGELOG.md:12` (immediately after `## [Unreleased]`, before the existing `### Changed`)
**Change:** Insert an `### Added` section. Keep a Changelog orders `Added` before `Changed`, and the
existing `### Changed` block stays exactly where it is, below the insertion.

One entry for the set, not six for the phases — the changelog records what a user got, and a phase
boundary is not a thing a user got.

```markdown
### Added

- **Nina's character is now tunable, per user, from `/admin/nina`.** Eleven trait sliders — anger,
  chill, sad, flirty, steamy, wise, annoying, funny, happy, anxious, concerned — plus a
  relationship setting (nobody / casual friend / sister / best friend / girlfriend) that decides
  what she calls him and how she behaves, a wardrobe line that reaches the camera, and a free-text
  note. Her system prompt used to be one frozen `const`; it is now a pure function of a stored row,
  read live on every turn with no cache anywhere on that path, so moving a slider changes the very
  next thing she says. **The defaults reproduce the prompt that shipped before this, character for
  character, and a test asserts it** — until a slider moves, the diff to her behaviour is empty.
  A promise she makes can now pay out as a photograph *in the conversation* rather than only as a
  profile-picture change, which is the feature the user asked for by name: *"she is proposing if i
  run consistently this week, then she will send me her sexy photo … will DEFINITELY MOTIVATE ME TO
  RUN AS CONSISTENT AS I COULD BE."*

  **Twelve prompt rule sites were repealed to make the dials real, and each one left its reason
  behind in the file it was removed from.** The hardcoded "best friend" identity and the
  no-jokes/no-puns clause, the nickname-only address rule and its explicit *"do not use the full
  name at him"*, **all three** copies of the prohibition on commenting on his body (two in the
  persona, one buried in the numbers rule), the prohibition on threats or withdrawal, the
  no-greeting clause, the three inline clauses that told her not to lecture him, not to sulk and to
  stay at the rung the ledger earned "and not one higher", and computed-only anger —
  which becomes a computed rung with an operator-set floor, `max(computed, floor)`, so the
  ledger-driven escalation still works on top of a baseline the operator chose. This follows the
  precedent already in the tree: `scripts/check-llm-payload-boundary.mjs` deleted its own Rule 1 on
  the same instruction from the same user (*"this is my personal toy"*) and kept the reasoning in
  place so nobody would restore the check without discovering that a decision had been taken.

  **What was deliberately NOT repealed**, because no dial asks for it: the not-a-doctor rule, the
  arithmetic rule (`lib/llm/facts.ts` records a measured sign error it exists to contain), and the
  medical-condition entry in the never-say list. The app also adds no content policy of its own and
  removes none of the image provider's — the user named `qwen/qwen-image-3-pro`'s guardrails as the
  ceiling, and a refused generation still arrives as her own apology, unchanged.
```

**Impact:** documentation only. Nothing under `## [v0.1.0]` is touched.

---

### Step 8: the closing record in `docs/nina/persona.md`

**File:** `docs/nina/persona.md` — append after the last line of the last section
(`## What she looks like`, currently ending at `:145`)
**Change:** Append two sections. **Phase 2 owns the body of this document** and will have rewritten
everything above; this step appends only, so it survives whatever shape phase 2 left.

**RECONCILED — phase 2 DOES write the repeal record, so this step is ADDITIVE, not a second copy.**
Phase 2's Step 10g appends `## What F34 repealed, and on whose instruction` covering its own six
repeals in `persona.ts`, plus `## The tuning`, `### The eleven traits`, `### The relationship` and
`### The other settings (R3)`. **Do not write a second repeal table.** This step's job is the two
things phase 2 could not know:

1. **Six more repeals, in `lib/nina/prompts/system.ts`, which is phase 3's file** — the four the
   sweep found (`NUMBERS_RULE`'s body clause, `CONTEXT_GUIDE`'s anger sentence, and the "not one
   higher" / "do not lecture" / "do not sulk" clauses inside `PROACTIVE_INSTRUCTIONS`) plus
   `OUTPUT_RULE`'s no-greeting clause. **Append these as rows to phase 2's existing table**, in its
   existing shape, rather than starting a new one.
2. **`## Where the dials live`**, which spans every phase and so belongs to the phase that runs last.

If phase 2's table is not there when this step runs — phase 2 did not land, or landed differently —
write the whole record here instead and say so in the commit message. **What must never happen is
two tables**, because the two will disagree and the document is the intent.

```markdown
---

## What this set repealed, and on whose instruction

The `nina-character-tuning` set (F33 follow-on, requirements R1-R6) turned everything above from a
set of frozen constants into a pure function of a stored per-user row. **Twelve rule sites** that contradicted a dial were repealed rather than worked around — six in
`lib/nina/persona.ts` and six in `lib/nina/prompts/system.ts` — on this instruction, quoted verbatim:

> i am an 30 year old adult . and this is just my personal toy, nobody else uses this, so i have a
> right to implement this however i want.
>
> THIS IS AN IRON RULE. CHANGE ANY EXISTING RULES / PROMPTS IN THE CODE THAT GO AGAINST THIS FREEDOM

| What it said | Where it lived | Why it had to go |
|---|---|---|
| *"You are his best friend"*, hardcoded | `NINA_IDENTITY` | The relationship is one of five settings now, and `nobody` and `girlfriend` are both in the list |
| *"You do not tell jokes; you are just funny. Never a pun."* | `NINA_IDENTITY` | `funny` at high is *"often crack jokes, teka-teki, etc"* — his words |
| *"do not use the full name at him"* | `NAME_RULES` | `relationship: 'nobody'` is defined as exactly that |
| *"a sentence about his body or his weight or how he looks"* | `NEVER_SAY` | `flirty` at high is *"calling me baby, sexy, etc"* |
| *"Never comment on his body. His weight and height are in your context…"* | `NEVER_SAY_BLOCK` | the same, in the paragraph rather than the list |
| *"Never a threat, never withdrawing the friendship, never the silent treatment."* | `NEVER_SAY_BLOCK` | `anger` at high is *"mad all the time"* |
| *"You do not choose how angry you are."*, THE CAP, and the unqualified two-rung DECAY | `ANGER_LADDER_BLOCK` | Anger became a **floor and a ceiling**, not a replacement — see below. A cap that forbids two rung-4 turns in a row, and a decay that drops her below her own floor, are both "mad all the time" being cancelled three lines later |
| *"No greeting unless the conversation is empty or he has been gone for days."* | `OUTPUT_RULE` | `concerned` at high is *"how are you, how are your feet after the run this morning"* |
| *"Reason with them. **Never comment on his body**, and never turn them…"* | `NUMBERS_RULE` | **The third copy of the body rule**, and the one that would have cancelled `flirty` from three blocks away. Only the five words went; the arithmetic half of the sentence stays |
| *"This is where your anger comes from."* | `CONTEXT_GUIDE` | A second computed-only-anger statement. With a floor set, her anger comes from two places, and the one this named is absent on a quiet day |
| *"Say it at the rung 'nagLevel' earns **and not one higher**."* | `PROACTIVE_INSTRUCTIONS.pattern_crossed` | The literal negation of `max(computed, floor)` |
| *"Do not lecture him"* / *"do not sulk about the silence"* | `PROACTIVE_INSTRUCTIONS.missed_usual_day`, `.silence` | Against `anger` / `annoying` and `sad` / `anxious` at the top |

**One prohibition in that file was reviewed and KEPT**: `avatar_changed`'s *"Do not describe the
photo to him — he can see it"*. It is not a character rule, no dial asks for it, and describing a
picture to the person looking at it is an assistant tic rather than a personality.

**Anger is the one that was reconciled rather than repealed.** The ladder still computes a rung from
`patterns[].nagLevel`, because the reason for that is still true — it is what stops rung 4 from
becoming her personality when nobody asked for it. The dial sets the **lowest rung she may occupy**,
and she uses `max(computed, floor)`. So the ledger-driven escalation works on top of a baseline the
operator chose, and an operator who wants her furious all the time can have that by choosing it.

**Three rules were deliberately kept, and this is the record of that decision too.** The
not-a-doctor rule, the arithmetic rule, and the medical-condition entry in the never-say list all
survive verbatim. No dial asks her to diagnose him or to compute a number; the user's stated ceiling
is about *image* content; and `lib/llm/facts.ts` records a measured failure — a sign flipped on an
aerobic-decoupling calculation — that the arithmetic rule exists to contain. R6 is read as *"remove
every rule that blocks a dial"*, not *"remove every rule"*. If the user wants these gone as well it
is one line and one array entry, and that is deliberately a separate decision.

**The app adds no content policy of its own and removes none of the provider's.** The user named
`qwen/qwen-image-3-pro`'s guardrails as the ceiling: *"we just trust alibaba (qwen dev) to set the
appropriate bottom line for everything, so it is not really 100% freedom here."* A refused
generation still arrives as her own apology through `lib/nina/imagefail.ts`, unchanged.

Every repeal above left a comment in the file it was removed from, saying what the rule said, who
repealed it and on what instruction. That is the shape
`scripts/check-llm-payload-boundary.mjs` established when it deleted its own Rule 1 on the same
premise: **the rule goes, the reason it went stays**, so nobody restores it without first
discovering that a decision was taken.

## Where the dials live

| Concern | File |
|---|---|
| The shape, the defaults, the clamp, the address vocabulary | `lib/nina/tuning.ts` |
| The row, and the revision on `nina_turns` | `lib/db/schema.ts`, `drizzle/0004_nina_persona_tuning.sql` |
| Reading and writing it | `readNinaTuning` / `writeNinaTuning`, `lib/nina/queries.ts` |
| The canon as a function of it | `lib/nina/persona.ts` |
| The assembled system prompt | `buildNinaSystemPrompt`, `lib/nina/prompts/system.ts` |
| The librarian's half — it is told the relationship, so the couple's register is not filed as biography | `buildDistillSystemPrompt`, `lib/nina/prompts/distill.ts` |
| The wardrobe that reaches the camera | `lib/nina/imagegen.ts` |
| The panel | `components/admin/CharacterPanel.tsx`, `lib/admin/tuningActions.ts` |

**The behavioural rollback is cheaper than the code one.** Set every dial back to its default on
`/admin/nina` and she is exactly the Nina who shipped before this set — that is what the defaults
contract, and the test behind it, are for.
```

**Impact:** documentation only. This document's own header rule (*"fix the file, then fix this
document, in one commit"*) is satisfied by phase 2 for the body; this is the set's closing record.

---

## Verification

**Step 0 — the worktree has no `node_modules`.** Confirmed: `ls node_modules` in
`/home/miftah/.worktrees/run-insights/nina-character-tuning` fails. Nothing below runs until:

```bash
npm ci
```

**Build:**

```bash
npm run lint
npm run typecheck        # next typegen && tsc --noEmit
npm run build            # the panel is a real page; typecheck alone does not prove it renders
```

**Tests:**

```bash
npm test                 # vitest run — excludes tests/integration/** and tests/live/**
```

**The full gate — every guard, exactly as `package.json` spells the scripts:**

```bash
npm run ci:openrouter-guard      # node scripts/check-openrouter-boundary.mjs
npm run ci:data-layer-guard      # node scripts/check-data-layer-invariants.mjs
npm run ci:client-secret-guard   # node scripts/check-client-secret-boundary.mjs
npm run ci:f08-guard             # node scripts/check-f08-boundaries.mjs
npm run ci:llm-payload-guard     # node scripts/check-llm-payload-boundary.mjs
npm run ci:f11-guard             # node scripts/check-f11-share-boundaries.mjs
npm run badges:check             # node scripts/check-badge-art.mjs
```

That is the complete set. `package.json` defines exactly seven `check-*.mjs` runners and the list
above is all seven — the phase brief's list matched them one for one, with `badges:check` being the
badge-art guard under its non-`ci:` name. Two more are worth running because this set adds a
migration:

```bash
npm run db:check                 # drizzle-kit check — the journal and the snapshots agree
npm run format:check             # prettier --check . — the readmes and the changelog are in scope
```

`npm run db:migrate` is **not** part of this gate. Applying a migration is a deploy action.

**The sweep, re-run as the gate's last step.** All six commands from *The sweep — findings* above,
with the recorded findings as the expected output. The two that must come back **empty** are the
proof of R6:

```bash
# nothing in Nina's own prompt surface still forbids a body comment
rg -n 'Never comment on his body|sentence about his body' lib/nina/

# nothing still tells her she does not choose her own anger
rg -n 'You do not choose how angry you are|not one higher|This is where your anger comes from' lib/nina/
```

**Both must come back CLEAN except for comment text**, and that is what reconciliation changed:
OQ-1, OQ-2 and OQ-3 are now phase 3's Step 2b, so by the time this phase runs those rules are gone
from the *rule* text and present only in the *comments* that record what they said and who repealed
them (plan invariant 10). A live hit outside a comment or a default-band string means an earlier
phase did not land its half — and catching that is what this phase is for: the sweep is a gate on
the whole set, not a report about it.

**Manual check:** open `/admin/nina`, set `relationship: 'girlfriend'` and `steamy: 100`, save, and
read the prompt preview end to end looking for a sentence that forbids what the two settings ask
for. The preview exists for exactly this and it costs nothing, because it is the pure assembly
function and not a model call.

**Exit criteria:**

1. `lib/nina/prompts/distill.ts` names the relationship and states that the couple's register is
   not a fact about him; `NINA_DISTILL_PROMPT_VERSION` is 2; `NINA_PROMPT_VERSION` in
   `lib/nina/prompts/index.ts` is untouched by this phase's diff.
2. `tests/nina.prompts.test.ts` proves, per relationship and per trait, that every setting reaches
   the prompt and that no two settings collapse into one render.
3. Every command in the gate above passes.
4. The sweep has been re-run and **every finding of it is fixed** — the two greps under
   Verification return only comment text and default-band strings. All six findings the draft filed
   as Open Questions were folded into the owning phase's plan during reconciliation, so this phase
   *confirms* rather than files. **A surviving contradiction is now a failure of this phase**, and a
   genuinely NEW one found by the re-run is the one thing worth stopping the set for.
5. The three readmes, `CHANGELOG.md` and `docs/nina/persona.md` describe what shipped, including
   the repeals and the three deliberate non-repeals.
6. `lib/nina/actions.ts` passes `relationship: tuning.relationship` to `distillNinaMemory`, so the
   librarian is told the real relationship rather than the default one.

## Handoffs

**H-1 — CLOSED: the one line in `lib/nina/actions.ts` is THIS PHASE'S, by reconciler exception.**
`DistillInput.relationship` is optional and defaults to `NINA_TUNING_DEFAULTS.relationship`, so
until the caller passes the real value the librarian is told the default relationship whatever the
operator set — and an optional field nobody fills is a fix that fixes nothing. The reconciler
assigned this phase **one property at one call site**: `relationship: tuning.relationship` on the
`distillNinaMemory(...)` call inside `after()`. Phase 3 already reads the tuning in that function's
`Promise.all`, so the value is in scope, and phase 3 could not have written it — the field does not
exist until this phase lands. It is in this phase's Files table and Interface Contract, and phase
3's plan records the carve-out from the other side.

**H-2 — CLOSED: OQ-1 through OQ-5 are now steps in the plans that own the files.** All four
`prompts/system.ts` findings are **phase 3's Step 2b** (`buildNumbersRule`, `buildContextGuide`,
`rungClause`, `lectureClause`, `sulkClause`); the `persona.ts` finding is **phase 2's repeal 6**,
whose deletions table now names the DECAY clause at `:239` alongside the opening at `:236` and THE
CAP at `:241`. This phase's job is unchanged and is now sharper: **re-run the sweep and confirm they
landed.** The two greps under Verification are what confirm it, and unlike the draft they are now
expected to come back clean.

**H-3 — CLOSED: both conditions on the anger floor are in phase 2's plan.** The floor is applied at
render time and never written back into `nina_nags` (that file's own warning at `:108-116`), and
`ninaAngerLadderBlock` now states the floor as a property of her — *"YOUR FLOOR IS A PROPERTY OF YOU
AND NOT OF THE DAY … even when 'patterns' is empty"* — because `lib/nina/context.ts:845` emits
`nagLevel` only inside a fired pattern and `context.ts` is off-limits to every phase (invariant 3).
A floor that read only `patterns[]` would render rung 0 under `anger: 100` on any quiet day, which is
precisely the day *"mad all the time"* is about. This was the finding most likely to have shipped as
"the dial works except on the days I would notice".

**H-4 — CLOSED: `PromiseCandidateSchema` is not extended and `lib/nina/memory.ts` is touched by
nobody.** The reward stays app-side, derived from the `steamy` dial at fire time. See OQ-6 above for
the full ruling, and phase 4's Handoff 2 for the one-card shape if her-own-choice is ever wanted.

**H-5 — `lib/nina/` has no package readme, and this phase does not create one.** There is no
`lib/nina/.workflows/` directory. `lib/nina` is now the largest and most decision-dense package in
the repo — the persona, the assembler, the turn, the tools, the camera, the promise mechanism, the
memory vocabulary — and it deserves one. That is a `/update-readme` task with its own card, not a
line item inside a sweep phase.

**H-6 — no drive-by cleanups were taken.** Two were seen and left: `lib/nina/imagefail.ts:106`
claims its lines are *"free of the words `NEVER_SAY` forbids"* when the test actually checks a local
`TECHNICAL` list (harmless, and `imagefail.ts` must stay zero-import under invariant 9); and
`components/admin/SelectionPane.tsx`'s `SEAM — PHASE 7` comment block describes work that is
finished, as the album readme's own Notes already says. Neither is this set's business.

## Rollback

This phase is one commit on `feature/nina-character-tuning`, and `git revert <sha>` backs it out
whole with no ordering caveat: it adds no migration, bumps no `NINA_PROMPT_VERSION`, and deletes no
symbol.

Reverting it restores `DISTILL_SYSTEM_PROMPT` to a plain constant and puts
`NINA_DISTILL_PROMPT_VERSION` back to 1, which makes historical rows claim version 1 for
distillations that ran on 2 — the same objection the plan index raises about phase 3's bump, and the
same answer: leave the version constant and revert only the text if the librarian prompt has to go
back.

The four readmes, the changelog and the canon document have no runtime effect, so reverting them
costs only the record. Reverting the test file loses the tuning matrix and nothing else — the
assertions it adds are all new; not one existing assertion was re-pointed by this phase.
