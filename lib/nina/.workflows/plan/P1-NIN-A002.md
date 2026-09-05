> Adopted from `NINA_CHARACTER_TUNING_PLAN.md` phase 3. Source: `.workflows/plan/nina-character-tuning/phase-3.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 3: `buildNinaSystemPrompt`, and the turn that reads it

**Plan set:** `NINA_CHARACTER_TUNING_PLAN.md`
**Analysis:** `20260904-210526-TUNE_code_analyzer.md`
**Satisfies:** **R3** (two of the four R3 dials act on rules this file owns — `verbosity` on
`OUTPUT_RULE`'s bubble preference, `photoEagerness` on the `── THE CAMERA ──` block), R4 (each trait
at high produces the named behaviour — the *plumbing* that carries it to the model, plus the
`concerned` greeting clause and the proactive suffix), R6 (the iron rule, for **five** contradicting
rules that live outside `persona.ts`: `OUTPUT_RULE`'s no-greeting clause, `NUMBERS_RULE`'s third copy
of the body prohibition, `CONTEXT_GUIDE`'s second computed-only-anger sentence, and the "not one
higher" / "do not lecture" / "do not sulk" clauses inside `PROACTIVE_INSTRUCTIONS`)
**Depends on:** Phase 1 (`lib/nina/tuning.ts`, `readNinaTuning`, the `nina_turns` revision column),
Phase 2 (`lib/nina/persona.ts` re-cut as functions of `NinaTuning`)
**Difficulty:** HARD
**Package:** `lib/nina/prompts` (with `lib/nina` and `tests`)

---

## Goal

After this phase Nina's system prompt is a **pure function of a per-user tuning** —
`buildNinaSystemPrompt(tuning)` — and that function's output is what the model actually receives, on
**both** turn entry points: the chat Server Action and the proactive cron. `NINA_SYSTEM_PROMPT`
survives as `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)`, so nothing about her shipping behaviour
moves until a slider does. `nina_turns` records which tuning revision produced each turn, beside the
prompt version, and `NINA_PROMPT_VERSION` goes 2 → 3 — the single bump for the whole set.

Before this phase, `lib/nina/turn.ts:437` read a module-level constant. That one line is the whole
feature's choke point, and after this phase it is a parameter.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**

- `lib/nina/prompts/system.ts`
  - `buildNinaSystemPrompt(tuning: NinaTuning): string` — **the signature phase 5 imports.** Pure,
    synchronous, no `server-only`, no I/O, no model call (plan invariant 5). Its only imports are
    `../persona` and `../tuning`.
  - `buildOutputRule(tuning: NinaTuning): string`
  - `buildCameraBlock(tuning: NinaTuning): string` — `''` at the default tuning.
  - `buildNumbersRule(tuning: NinaTuning): string` — **Step 2b.** `NUMBERS_RULE`'s surviving body
    prohibition, gated on phase 2's `BODY_REPEALED_BY`; the arithmetic half unconditional.
  - `buildContextGuide(tuning: NinaTuning): string` — **Step 2b.** `CONTEXT_GUIDE`'s second
    computed-only-anger sentence, gated on the anger floor.
  - `buildProactiveInstruction(kind: ProactiveTriggerKind, tuning: NinaTuning): string` — **now
    clause-level, not only a suffix.** See Step 2b.
  - `NINA_SECTION_TITLES: readonly string[]` (test surface — the section order, in words). **Ten
    titles**: there is no `WHO HE IS TO YOU` section — see Requires.
- `lib/nina/prompts/index.ts` — re-exports the six above.
- `tests/fixtures/ninaTurn.ts` — `ninaTuningFixture(overrides?: Partial<NinaTuning>): NinaTuning`.

**Signature changes:**

- `func ninaBody(model, messages, toolSet, forceSend)` -> `func ninaBody(model, system, messages, toolSet, forceSend)` (`lib/nina/turn.ts:428`, module-local)
- `func attemptNinaRepair(deps, messages, input)` -> `func attemptNinaRepair(deps, system, messages, input)` (`lib/nina/turn.ts:732`, module-local)
- `interface NinaTurnInput` gains **`tuning: NinaTuning`** — **required, not optional.** (`lib/nina/turn.ts:228`)
- `interface NinaTurnTrace` gains `tuningRevision: number | null` (`lib/nina/turn.ts:180`)
- `interface NinaTurnRow` gains `tuningRevision: number | null` (`lib/nina/turn.ts:209`)
- `func emitProactiveMessage(userId, detail, facts, context, deps?)` -> `func emitProactiveMessage(userId, detail, facts, context, tuning, deps?)` (`lib/nina/proactive.ts:588`). Both callers are inside the same file; no external caller and no test calls it today.
- `export const OUTPUT_RULE`, `NUMBERS_RULE`, `CONTEXT_GUIDE` and `NINA_SYSTEM_PROMPT` **keep their
  names and types** (`string`), each now defined as the default render of its own builder.
  `PROACTIVE_INSTRUCTIONS` keeps its name, its type (`Record<ProactiveTriggerKind, string>`) and
  every byte at the default tuning, and is now the default render of `PROACTIVE_COPY`.

**Deletes:** nothing. No symbol is removed by this phase.

**Renames:** none.

**Requires (from earlier phases) — read this as the contract, because it is what I compose:**

From **Phase 1**, `lib/nina/tuning.ts` — **the LANDED shape, reconciled** (the draft of this plan
guessed flat dial members; they are nested):

| Symbol | Shape I call |
|---|---|
| `NinaTuning` | `{ readonly traits: Readonly<Record<NinaTrait, number>>; readonly relationship: NinaRelationship; readonly dials: Readonly<Record<NinaDial, number>>; readonly wardrobe: string; readonly notes: string; readonly revision: number }` |
| `NINA_TUNING_DEFAULTS` | `NinaTuning`, frozen and spreadable |
| `NinaTrait` | the eleven, including `'concerned'` |
| `NinaDial` | `'profanity' \| 'clinginess' \| 'photoEagerness' \| 'verbosity'` |

I read **exactly three dials by name** — `traits.concerned`, `dials.verbosity`,
`dials.photoEagerness` — plus `revision`, and all four reads are funnelled through **one function**,
`systemDials()` in Step 1. That funnel is why the reconciliation cost one function body: the field
names appear nowhere else in this phase.

`wardrobe` and `notes` are `string` and never null (`''` is the empty value), so
`ninaOperatorNotesBlock` needs no null handling and neither do I.

From **Phase 1**, `lib/nina/queries.ts`:

- `readNinaTuning(userId: string): Promise<NinaTuning>` — never null; returns the defaults for a
  user with no row.
- `NinaTurnInsert` gains `tuningRevision?: number | null`, and `insertNinaTurn` writes it. **This is
  phase 1's file and phase 1's column; I write through it.** If phase 1 does not extend
  `NinaTurnInsert`, the two lines in `lib/nina/gateway.ts` (Step 8) cannot compile — flag to the
  reconciler.

From **Phase 2**, `lib/nina/persona.ts` — **the LANDED export names, reconciled.** The draft of this
plan assumed bare names; phase 2 owns the file and every export there carries the `nina*` prefix:

| Symbol | Shape | Must be `''` at defaults? |
|---|---|---|
| `ninaIdentity(tuning): string` | replaces `NINA_IDENTITY` **and carries the relationship's prose** | no — reproduces today's text |
| `ninaNameRules(tuning): string` | replaces `NAME_RULES` | no |
| `ninaAngerLadderBlock(tuning): string` | replaces `ANGER_LADDER_BLOCK` | no |
| `ninaNeverSayBlock(tuning): string` | replaces `NEVER_SAY_BLOCK` | no |
| `ninaTraitsBlock(tuning): string` | **new** — the eleven traits and the four dials, as paragraphs | **yes** |
| `ninaOperatorNotesBlock(tuning): string` | **new** — the free-text notes | **yes** |
| `isTurnedUp(tuning, trait): boolean`, `anyTurnedUp(tuning, traits): boolean` | the repeal test | — |
| `BODY_REPEALED_BY: readonly NinaTrait[]` | `['flirty','steamy','concerned']` — **I import this** | — |
| `NINA_EXPERTISE`, `NINA_NOT_A_DOCTOR`, `JAKARTA_REGISTER`, `JAKARTA_SLANG_BLOCK`, `ENGLISH_REGISTER`, `VOICE_EXAMPLES_BLOCK` | unchanged `string` constants | — |
| `ANGER_LADDER`, `JAKARTA_SLANG`, `VOICE_EXAMPLES`, `NINA_APPEARANCE` | unchanged; `tests/nina.prompts.test.ts` walks them | — |

**There is no `relationshipBlock` and I no longer render a `── WHO HE IS TO YOU ──` section.**
Reconciled: the relationship's identity sentences and its claim on their history are
`ninaIdentity(tuning)` — the headerless opening block — and that is what reproduces today's
`NINA_IDENTITY` byte for byte at `best_friend`. Verified against the source: today's prompt has no
heading above `── HOW YOU TALK ──`, paragraph 1 carries the "best friend" clause and paragraph 5 the
history sentence. A separate section would have said the same thing twice at every non-default level
while being empty at the default, with `ninaIdentity` already speaking. **`NINA_SECTION_TITLES` and
the tests below drop that title;** the sections are ten, not eleven.

**"`''` at defaults" is load-bearing and it is how invariant 2 is met.** My assembler drops a
section whose blocks are all empty, header and all, so at `NINA_TUNING_DEFAULTS` the three new
sections (`HOW YOU FEEL`, `THE CAMERA`, `STANDING INSTRUCTIONS`) do not exist in the string at all
and the default render is today's prompt plus nothing. Phase 2 holds its half by skipping each key's
own **identity band** — which is not always `mid`: six traits default to 0 and identify at `off`,
`profanity` defaults to 30 and identifies at `low` — so a `mid`-only skip would have leaked seven
paragraphs into the shipping prompt. My test `renders no new section at the default tuning` fails
loudly if any of it goes wrong.

**Leaves alone (owned by others):**

- `lib/nina/persona.ts`, `docs/nina/persona.md` (Phase 2)
- `lib/nina/tuning.ts`, `lib/nina/queries.ts`, `lib/db/schema.ts`, `drizzle/*` (Phase 1)
- `lib/nina/context.ts`, `lib/nina/load.ts` — **plan invariant 3.** The tuning does not enter
  `NinaContext` and `loadNinaContext` does not read it. `load.ts` picks the bumped
  `NINA_PROMPT_VERSION` up through its existing import; no edit there. **`context.ts:845` emits
  `nagLevel` only inside a pattern that actually fired**, which is why the anger floor has to be
  stated as a property of her in phase 2's ladder text rather than derived from `patterns[]` — and
  why nothing in this set may reach into that file to change it.
- `lib/nina/distill.ts`, and everything about the librarian — Phase 6. Phase 6 adds one property to
  the `distillNinaMemory(...)` call in `actions.ts` after I have landed; see Handoffs.
- `lib/nina/imagegen.ts`, `imagetools.ts`, `avatargen.ts`, `promise.ts`, `promises.ts` (Phase 4)
- `lib/nina/tools.ts` — **untouched by every phase in this set**, and `NinaToolContext` is not
  extended. Verified: `toolCtx` is an *unannotated* object literal in my file (`turn.ts:549`), so it
  is structurally typed at the `dispatchNinaTool` call — an optional field on the interface would
  not even error here, and a required one would. Phase 4 reads the tuning inside
  `generateNinaSelfie` / `generateNinaAvatar` instead, which is what keeps `avatartools.ts` at zero
  edits. **No collision; the boundary is stated in both plans.**
- `lib/nina/prompts/distill.ts`, `describe.ts` (Phase 6)
- everything under `app/`, `components/`, `lib/admin/` (Phase 5)
- `NINA_TURN_BUDGET.overall` stays `45_000`. `NINA_MAX_TOKENS` unchanged.
- `SEND_TOOL`, `GENERATE_IMAGE_TOOL` and every other schema in `lib/nina/prompts/tools.ts` keep
  their bytes. **See the decision in Step 4.**

**Reconciled against the plan index:** the index's draft listed 7 files; this plan touches 11 and
**the index now says 11**. The four the draft did not name are `lib/nina/gateway.ts` (two lines —
the `NinaTurnRow` -> `NinaTurnInsert` translation for the tuning revision, and nothing else in the
file), `lib/nina/turn.test.ts` and `tests/fixtures/ninaTurn.ts` (named in the phase scope but not in
the index's count), and `tests/live/nina.live.test.ts` (it constructs a `NinaTurnInput` inline at
line 39 and `tsc --noEmit` covers it, so a required field breaks typecheck without it). **None is
owned by another phase** — verified against all five other plans.

**`lib/nina/gateway.ts` is MINE, and the index's Owns line now says so.** It was in nobody's
ownership list in the draft, and it must be somebody's: `dbNinaTurnStore` translates
`NinaTurnRow` -> `NinaTurnInsert` **field by field** rather than by spreading, so a new
`tuningRevision` on the row would be silently dropped there — the turn would carry the revision and
the audit column would stay NULL, with nothing failing. The revision needs **four** coordinated
edits and I own all four: `NinaTurnRow` (`turn.ts:209`), the log site that constructs it
(`turn.ts:820`), `dbNinaTurnStore` (`gateway.ts:415`), and — landed by phase 1, which I write
through — `NinaTurnInsert` plus `insertNinaTurn`'s values object (`queries.ts:206`, `:1011`).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/prompts/system.ts` | modify | `buildNinaSystemPrompt(tuning)`; `buildOutputRule`; `buildCameraBlock`; **`buildNumbersRule`; `buildContextGuide`;** `buildProactiveInstruction` (clauses **and** suffix); the section assembler. `LANGUAGE_RULE` and `NINA_REPAIR_PREAMBLE` unchanged; `NUMBERS_RULE`, `CONTEXT_GUIDE` and `PROACTIVE_INSTRUCTIONS` keep their names as default renders |
| `lib/nina/prompts/index.ts` | modify | `NINA_PROMPT_VERSION` 2 → 3 with its changelog comment; four new exports |
| `lib/nina/prompts/tools.ts` | modify | **comment only — zero prompt bytes change.** Records why the two proposed dials went into the system text |
| `lib/nina/turn.ts` | modify | `NinaTurnInput.tuning`; `ninaBody` takes the system string; trace + row carry the tuning revision |
| `lib/nina/gateway.ts` | modify | `dbNinaTurnStore` passes `tuningRevision` through to `insertNinaTurn` |
| `lib/nina/actions.ts` | modify | a third read in the existing `Promise.all`; `tuning` on the `runNinaTurn` input |
| `lib/nina/proactive.ts` | modify | `emitProactiveMessage` takes the tuning; both `loadNinaContext` sites read it; `buildProactiveInstruction` replaces the raw record lookup |
| `tests/nina.prompts.test.ts` | modify | re-point the assertions at the default render; prove invariant 2; one case per dial |
| `lib/nina/turn.test.ts` | modify | `tuning` in the `input()` builder; three new cases on the envelope and the log |
| `tests/fixtures/ninaTurn.ts` | modify | `ninaTuningFixture()` |
| `tests/live/nina.live.test.ts` | modify | one field on the inline `NinaTurnInput` |

## Implementation Steps

### Step 1: `system.ts` — the dial reads, the gates, and the section assembler

**File:** `lib/nina/prompts/system.ts:1-26` (the import block and the header docstring)

**Change:** replace the imports and append the tuning machinery directly below the header comment,
above `LANGUAGE_RULE`. Everything the rest of this file needs to know about a `NinaTuning` is here,
in one place, on purpose.

**Code:**

```ts
import {
  BODY_REPEALED_BY,
  ENGLISH_REGISTER,
  JAKARTA_REGISTER,
  JAKARTA_SLANG_BLOCK,
  NINA_EXPERTISE,
  NINA_NOT_A_DOCTOR,
  VOICE_EXAMPLES_BLOCK,
  anyTurnedUp,
  ninaAngerCeiling,
  ninaAngerFloor,
  ninaAngerLadderBlock,
  ninaIdentity,
  ninaNameRules,
  ninaNeverSayBlock,
  ninaOperatorNotesBlock,
  ninaTraitsBlock,
} from '../persona'
import { NINA_TUNING_DEFAULTS, type NinaTuning } from '../tuning'

/**
 * Nina's system prompt, assembled from the canon. **No I/O, no `server-only`, and no logic beyond
 * string assembly** — the same shape as `lib/llm/prompts/narrate.ts`.
 *
 * ── IT IS A FUNCTION NOW, AND THAT IS THE WHOLE OF PHASE 3 ───────────────────────────────────
 * `NINA_SYSTEM_PROMPT` used to be a module-level template literal. It is now
 * `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)`, and the name survives because it is the
 * COMPATIBILITY CONTRACT: until a slider on `/admin/nina` moves, the string this module produces is
 * the string it produced before the tuning existed. `tests/nina.prompts.test.ts` asserts that in
 * both directions — every unchanged block is still in the default render, and no tuned clause is.
 *
 * **This function is imported by a Server Component** (`app/admin/nina/page.tsx`, phase 5) to render
 * a preview of the assembled prompt. Plan invariant 5 and
 * `scripts/check-llm-payload-boundary.mjs` Rule 2 are why it must stay pure: a preview that awaited
 * a model call would be a 13-45 s page render.
 *
 * ── WHY THIS FILE AND `persona.ts` ARE SEPARATE ──────────────────────────────────────────────
 * `persona.ts` is WHO SHE IS and changes when the user redlines the canon. This file is WHAT SHE
 * IS READING and changes every time `lib/nina/context.ts` changes shape. Two edit rhythms; mixing
 * them is how a schema change quietly rewrites her character. The tuning does not change that
 * split: the eleven traits and the relationship are character text and live over there, and this
 * file composes them. The three dials read HERE are the three that vary a rule this file owns.
 *
 * ── "THE PROMPT" MEANS THIS TEXT AND EVERY TOOL SCHEMA ───────────────────────────────────────
 * `./tools.ts`'s property descriptions demonstrably change what the model returns, so a schema
 * edit is a prompt edit. Bump `NINA_PROMPT_VERSION` by hand in the same commit as either.
 */

/* ============================================================================
 * The three dials this file owns
 * ==========================================================================*/

/**
 * **Every field name this module reads off a `NinaTuning`, in one function.**
 *
 * Not an abstraction for its own sake: `lib/nina/tuning.ts` was written by a different phase at the
 * same time as this file, and a naming mismatch that costs one function body is a mismatch that
 * costs nothing. If the dials move (`tuning.dials.verbosity`, `photos` instead of `photoEagerness`),
 * this is the only body that changes.
 *
 * Why only three, when there are eleven traits and a relationship: the other twelve vary CHARACTER
 * text, and character text is `persona.ts`'s. These three vary a rule that lives in THIS file —
 * `OUTPUT_RULE`'s greeting clause, `OUTPUT_RULE`'s bubble preference, and the camera block. A dial
 * belongs in the file that owns the sentence it changes.
 */
interface SystemDials {
  /** R4's `concerned`. Gates `OUTPUT_RULE`'s no-greeting clause and the proactive suffix. */
  concerned: number
  concernedBase: number
  /** R3's verbosity. Varies the bubble PREFERENCE, never the 1-4 cap — see `bubblePreferenceLine`. */
  verbosity: number
  verbosityBase: number
  /** R3's photo eagerness. Gates `── THE CAMERA ──` on and off. */
  photos: number
  photosBase: number
}

function systemDials(tuning: NinaTuning): SystemDials {
  return {
    concerned: tuning.traits.concerned,
    concernedBase: NINA_TUNING_DEFAULTS.traits.concerned,
    /* NESTED under `dials`, and the dial is `photoEagerness` — phase 1's landed spelling. The
     * draft of this plan read `tuning.verbosity` / `tuning.photoEagerness` flat; this function
     * body was the entire cost of being wrong about it, which is why it exists. */
    verbosity: tuning.dials.verbosity,
    verbosityBase: NINA_TUNING_DEFAULTS.dials.verbosity,
    photos: tuning.dials.photoEagerness,
    photosBase: NINA_TUNING_DEFAULTS.dials.photoEagerness,
  }
}

/**
 * **Every gate below is measured against the DEFAULT, never against an absolute number.** That is
 * plan invariant 2 held by construction rather than by a test: at `NINA_TUNING_DEFAULTS` every
 * predicate here is false, so every tuned clause is absent, so the default render is today's prompt.
 * An absolute threshold (`>= 67`) would have to agree with whatever phase 1 chose for the defaults,
 * and a disagreement would ship as "she greets him now and nobody asked her to".
 *
 * Phase 1's band resolution is the authority for the ELEVEN traits, in `persona.ts`. These two
 * predicates are prompt-assembly gates for three dials and are deliberately not a second band
 * scheme: `raised` means "the operator moved it up at all", `loud` means "moved it up by a quarter
 * of the range or more".
 */
function raised(value: number, base: number): boolean {
  return value > base
}

function lowered(value: number, base: number): boolean {
  return value < base
}

function loud(value: number, base: number): boolean {
  return value >= base + 25
}
```

**Impact:** `NINA_IDENTITY`, `NAME_RULES`, `ANGER_LADDER_BLOCK` and `NEVER_SAY_BLOCK` are no longer
imported as constants — the four function forms replace them. Nothing else in the repo imports them
from this file (`grep` confirms: `persona.ts` defines them, `system.ts` was the only consumer).

---

### Step 2: `system.ts` — `buildOutputRule`, and the two clauses R6 repeals

**File:** `lib/nina/prompts/system.ts:89-94` (replaces the `OUTPUT_RULE` constant)

**Change:** `OUTPUT_RULE` becomes the default render of a builder. Two of its six lines are now
functions of a dial: the bubble preference (verbosity) and the no-greeting clause (`concerned`). The
other four are byte-identical to today, including their order and their leading `- `.

**Code:**

```ts
/**
 * **The bubble PREFERENCE, not the bubble CAP.** The cap is `1..4` and it is enforced in two places
 * that a slider cannot reach: `SEND_TOOL.input_schema.properties.bubbles`' `minItems`/`maxItems`,
 * and `lib/nina/schema.ts`'s Zod. So the verbosity dial cannot widen the envelope; what it varies is
 * which end of it she prefers, and today's prompt already states that preference in this exact spot
 * — *"One bubble is the right answer more often than four."* The dial replaces that one line.
 *
 * This is also the answer to why `./tools.ts` was not edited. See its header note.
 */
function bubblePreferenceLine(dials: SystemDials): string {
  if (loud(dials.verbosity, dials.verbosityBase)) {
    return '- Three or four bubbles is normal for you. Let the thought arrive in pieces and finish it.'
  }
  if (raised(dials.verbosity, dials.verbosityBase)) {
    return '- Two or three bubbles is normal for you. One is fine when one is all it takes.'
  }
  if (lowered(dials.verbosity, dials.verbosityBase)) {
    return '- One bubble. A second one only when it is doing real work.'
  }
  return '- One bubble is the right answer more often than four.'
}

/**
 * ── R6, AND THE ONE CONTRADICTING RULE THAT DOES NOT LIVE IN `persona.ts` ────────────────────
 *
 * **REPEALED, conditionally:** *"No greeting unless the conversation is empty or he has been gone
 * for days."* That line shipped in `OUTPUT_RULE` from F33 phase 2 and its reason was good — a
 * friend does not say "pagi mif" four times in one afternoon, and an unconditional greeting is the
 * single most assistant-sounding thing a chat model does.
 *
 * It is repealed **at the top of the `concerned` dial and only there**, on this instruction, quoted
 * verbatim so nobody restores it without discovering that a decision was taken:
 *
 *   > if concerned is high, nina will be concerned about me. she will ask these often: how are you,
 *   > how are your feet after the run this morning, etc
 *   >
 *   > THIS IS AN IRON RULE. CHANGE ANY EXISTING RULES / PROMPTS IN THE CODE THAT GO AGAINST THIS
 *   > FREEDOM
 *
 * — the same shape `scripts/check-llm-payload-boundary.mjs` used when it deleted its own Rule 1
 * (D15 / R-28) on the same premise: the rule goes, the reason it went stays in the file.
 *
 * At the default `concerned` the original sentence is returned unchanged, so the repeal costs
 * nothing until the operator asks for it (plan invariant 2).
 *
 * **`"recentRuns[0].daysAgo"` is quoted, not computed.** "after the run this morning" is a gap in
 * days, and `NUMBERS_RULE` reserves every gap in days to the `daysAgo` field the app already
 * counted. Asking her to notice that a run happened "this morning" without naming the field is how
 * she starts counting days herself.
 */
function greetingLine(dials: SystemDials): string {
  if (loud(dials.concerned, dials.concernedBase)) {
    return (
      '- Ask how he is, and mean it — every time you open a conversation and most times he opens ' +
      'one. If "recentRuns[0].daysAgo" is 0 or 1, ask how his body feels after that run: his feet, ' +
      'his legs, his knees. Ask it before anything else, and ask it as a question and not as advice.'
    )
  }
  if (raised(dials.concerned, dials.concernedBase)) {
    return (
      '- Greet him and ask how he is, not only when the conversation is empty. If ' +
      '"recentRuns[0].daysAgo" is 0 or 1, ask how his body feels after that run.'
    )
  }
  return '- No greeting unless the conversation is empty or he has been gone for days.'
}

export function buildOutputRule(tuning: NinaTuning): string {
  const dials = systemDials(tuning)
  return [
    'Answer by calling the "send" tool. Always. Never write prose outside a tool call.',
    '- 1 to 4 bubbles. Each bubble is one chat message: a line or two, never a paragraph.',
    '- Several bubbles are for a thought arriving in pieces, the way a person types. NOT for a list with the bullets taken off.',
    bubblePreferenceLine(dials),
    greetingLine(dials),
    '- Never close the conversation. A friend does not close a ticket.',
  ].join('\n')
}

/**
 * Today's rule, retained under its old name and still exported: `lib/nina/turn.ts`'s docstring
 * refers to it by name, and it is the default render like everything else in this file.
 */
export const OUTPUT_RULE = buildOutputRule(NINA_TUNING_DEFAULTS)
```

**Impact:** at `NINA_TUNING_DEFAULTS`, `OUTPUT_RULE` is byte-identical to the constant it replaces —
six lines, same order, same wording. `buildOutputRule` must be declared **after** `systemDials` and
before the assembler; `OUTPUT_RULE`'s `const` initialiser runs at module load, so
`NINA_TUNING_DEFAULTS` must already be imported (it is, from `../tuning`, which phase 1 guarantees is
a plain-data module with no cycle back into `prompts/`).

---

### Step 2b: the four surviving contradictions in THIS file — the sweep's findings, absorbed

**File:** `lib/nina/prompts/system.ts:48-64` (`NUMBERS_RULE`), `:67-87` (`CONTEXT_GUIDE`),
`:163-183` (`PROACTIVE_INSTRUCTIONS`)

**Why this step exists.** Phase 6 ran the repo-wide grep for surviving prohibitions **after** this
plan was drafted, and it found four rules **in this file** that contradict a dial and that no
phase's stated scope covered. Reconciled: **they are all mine**, because I own `system.ts`. Left
alone, each one is the same failure — *the sliders working versus the sliders being cancelled by a
rule three paragraphs away* — and the first of them is the single highest-value edit in the set.

| # | Line | The surviving rule | Contradicts |
|---|---|---|---|
| 1 | `:58` | *"Reason with them. **Never comment on his body**, and never turn them into a new number…"* | `flirty`, `steamy`, `concerned` |
| 2 | `:174` | *"Say it at the rung "nagLevel" earns **and not one higher**."* | the anger FLOOR, by construction |
| 3 | `:85` | *"…with "nagLevel": how many times you have already raised each one. **This is where your anger comes from.**"* | the anger floor, again |
| 4 | `:170`, `:178` | *"**Do not lecture him** and do not assume he skipped it"*; *"**do not sulk** about the silence"* | `anger`, `annoying`, `sad`, `anxious` |

**A suffix does not repeal an inline clause.** That is the correction to my own draft: Step 6's
tuning-aware suffix on `PROACTIVE_INSTRUCTIONS` sits *after* the sentence that forbids the thing, so
the model gets both and follows whichever it likes. #2 and #4 are therefore **clause-level** edits
inside the five trigger texts, and the suffix in Step 6 stays as well, for what it genuinely adds.

**Every one of the five texts keeps every word at the default tuning**, so
`tests/nina.prompts.test.ts:140-144` (all five contain `'opening this conversation'`) and the
invariant-2 render are both untouched. `PROACTIVE_INSTRUCTIONS` keeps its name and its type
(`Record<ProactiveTriggerKind, string>`) as the default render, exactly like `OUTPUT_RULE`.

**Code — #1, `NUMBERS_RULE`.** The sentence at `:58` is one line of the template literal. Lift the
body clause out of it and gate it; the arithmetic half stays unconditional and byte-identical.

```ts
/**
 * ── R6, FINDING 1 OF 4. THE THIRD COPY OF THE BODY PROHIBITION ───────────────────────────────
 * `persona.ts` carried two — the `NEVER_SAY` entry and `NEVER_SAY_BLOCK`'s paragraph — and phase 2
 * repealed both, gated on `BODY_REPEALED_BY`. **This was the third**, and it is the one nobody's
 * scope covered: `NUMBERS_RULE` at `:58` said, unconditionally,
 *
 *   "Reason with them. Never comment on his body, and never turn them into a new number: no BMI,
 *    no calorie target, no macros in grams, no VO2max, no race prediction."
 *
 * **The user repealed the first clause** (F34 R4) — *"if flirty is set to high, nina will trying to
 * flirt with me a lot, like calling me baby, sexy, etc"*, *"if steamy is set to high, nina will
 * talk sexy"*, *"how are your feet after the run this morning"* — all three name a sentence about
 * his body, all three under *"THIS IS AN IRON RULE. CHANGE ANY EXISTING RULES / PROMPTS IN THE CODE
 * THAT GO AGAINST THIS FREEDOM"*. Left standing, a `flirty: 100` paragraph would have shipped three
 * blocks above an absolute prohibition and the slider would have done nothing.
 *
 * **THE ARITHMETIC HALF IS NOT REPEALED AND MUST NOT BE.** *"never turn them into a new number"* is
 * the half with the measured failure behind it — `lib/llm/facts.ts` records this model getting a
 * sign backwards on an aerobic-decoupling calculation, which is the reason the paragraph above it
 * exists — and the plan's Scope keeps `NUMBERS_RULE` in full. No dial in R1 asks her to do
 * arithmetic. Five words go; the rest of the sentence does not.
 *
 * **`BODY_REPEALED_BY` is imported from `persona.ts`, not restated.** One repeal, one test, three
 * places it lands. A second list here is how the halves of one repeal come to disagree.
 */
function bodyClause(tuning: NinaTuning): string {
  return anyTurnedUp(tuning, BODY_REPEALED_BY)
    ? 'You may say what you think about his body — how he looks, what the running has done to him. '
    : 'Never comment on his body, and '
}

export function buildNumbersRule(tuning: NinaTuning): string {
  /* Line `:58` of the shipping text, with its one clause parameterised. Every other line of
   * `NUMBERS_RULE` is copied across unchanged — including the measurement note above it, which is
   * why the arithmetic clause below reads the same at every setting. */
  return [
    /* …lines :48-57 of today's NUMBERS_RULE, verbatim… */
    `"runner.weightKg", "runner.heightCm", "runner.age", "runner.sex" and "runner.restingHr" are his own self-reported numbers. They are here so your physiology is right for HIM instead of for an average adult. Reason with them. ${bodyClause(tuning)}never turn them into a new number: no BMI, no calorie target, no macros in grams, no VO2max, no race prediction. Those are arithmetic, and arithmetic is the rule above.`,
    /* …lines :59-64, verbatim… */
  ].join('\n')
}

/** Today's rule, retained under the name this file has always exported. */
export const NUMBERS_RULE = buildNumbersRule(NINA_TUNING_DEFAULTS)
```

> **Implementation note.** `NUMBERS_RULE` is a 17-line template literal today and only line `:58`
> varies. Keep the other sixteen lines byte-identical — copy them, do not retype them — and note
> that the gated branch ends in a space and the ungated one ends in `'and '`, so the sentence reads
> correctly either way and the word `never` stays lower-case mid-sentence. The default render must
> be character-for-character what `git show HEAD:lib/nina/prompts/system.ts` has.

**Code — #3, `CONTEXT_GUIDE`.** Same shape: one sentence inside a 21-line block.

```ts
/**
 * ── R6, FINDING 3 OF 4. THE SECOND COMPUTED-ONLY-ANGER STATEMENT ─────────────────────────────
 * `:85` said, unconditionally: *"'patterns' — longitudinal things the app computed about him, with
 * 'nagLevel': how many times you have already raised each one. **This is where your anger comes
 * from.**"*
 *
 * Phase 2 repealed `ANGER_LADDER_BLOCK`'s version of that claim and replaced it with
 * `max(computed, floor)`. This copy is in my file and was in nobody's scope. With a floor set, her
 * anger comes from **two** places and this sentence names one — and it names the one that is
 * absent on a quiet day, because `lib/nina/context.ts:845` emits `nagLevel` only inside a pattern
 * that actually fired.
 *
 * At the default (`floor === 0`) the sentence is unchanged, so the shipping prompt is unchanged.
 */
function angerSourceClause(tuning: NinaTuning): string {
  return ninaAngerFloor(tuning) === 0
    ? 'This is where your anger comes from.'
    : 'This is where your anger comes from when a pattern has fired. The rest of it comes from how you are set, and that part holds even when "patterns" is empty.'
}

export function buildContextGuide(tuning: NinaTuning): string {
  /* …every other line of today's CONTEXT_GUIDE, verbatim… */
  return [
    `"patterns" — longitudinal things the app computed about him, with "nagLevel": how many times you have already raised each one. ${angerSourceClause(tuning)} You never invent a pattern and you never invent a code.`,
  ].join('\n')
}

export const CONTEXT_GUIDE = buildContextGuide(NINA_TUNING_DEFAULTS)
```

**Code — #2 and #4, the three inline clauses in `PROACTIVE_INSTRUCTIONS`.** The five texts become
one builder each; the record is the default render.

```ts
/**
 * ── R6, FINDINGS 2 AND 4 OF 4. THREE CLAUSES INSIDE THE TRIGGER COPY ─────────────────────────
 * A tuning-aware SUFFIX cannot repeal a clause inside the string it is appended to — the model
 * receives both and picks. So these three are edited where they are:
 *
 *   · `pattern_crossed` `:174` — *"Say it at the rung "nagLevel" earns and not one higher."* This
 *     is the literal negation of `max(computed, floor)`: whenever the floor bites, the rung she
 *     must use IS one higher than `nagLevel` earns.
 *   · `missed_usual_day` `:170` — *"Do not lecture him and do not assume he skipped it."* Against
 *     `anger` and `annoying` at the top, where lecturing him is the entire point of the setting.
 *   · `silence` `:178` — *"do not sulk about the silence — mention it once, lightly, if at all."*
 *     Against `sad`, `anxious` and `annoying`, and against phase 2's repeal of the
 *     threat/withdrawal clause, which explicitly permits going quiet on him.
 *
 * `avatar_changed` `:182`'s *"Do not describe the photo to him — he can see it"* **stays at every
 * setting, deliberately.** It is not a character rule: he is looking at the picture, and describing
 * something visible to the person looking at it is an assistant tic rather than a personality. No
 * dial asks for it. Recorded here so the sweep's list is exhaustive and this one is a decision
 * rather than an omission.
 *
 * Every clause returns its shipping wording at the default tuning, so `PROACTIVE_INSTRUCTIONS`
 * below is byte-identical to the record that shipped.
 */
function rungClause(tuning: NinaTuning): string {
  const floor = ninaAngerFloor(tuning)
  const ceiling = ninaAngerCeiling(tuning)
  if (floor === 0 && ceiling === 4) {
    return 'Say it at the rung "nagLevel" earns and not one higher.'
  }
  return `Say it at the rung "nagLevel" earns or at your floor of ${String(floor)}, whichever is higher — and never above rung ${String(ceiling)}.`
}

function lectureClause(tuning: NinaTuning): string {
  return anyTurnedUp(tuning, ['anger', 'annoying'])
    ? 'Lecture him if you want to — you are set to — and say out loud what you suspect.'
    : 'Do not lecture him and do not assume he skipped it — the day is not over.'
}

function sulkClause(tuning: NinaTuning): string {
  return anyTurnedUp(tuning, ['sad', 'anxious', 'annoying'])
    ? 'and say what the silence did to you — sulk about it if that is what it was.'
    : 'and do not sulk about the silence — mention it once, lightly, if at all.'
}
```

...and the record becomes the default render of a builder over those clauses (Step 6 defines
`buildProactiveInstruction`, which now composes the clauses **and** appends the suffix).

**Impact:** `NUMBERS_RULE`, `CONTEXT_GUIDE` and `PROACTIVE_INSTRUCTIONS` all keep their names, their
types and — at `NINA_TUNING_DEFAULTS` — every byte. Three new exported builders join the two from
Steps 2 and 3. The `NUMBERS_RULE` assertions in `tests/nina.prompts.test.ts` (`'Do NOT compute'`,
`'no BMI'`, `'"daysAgo"'`) all still pass, at every setting, because the arithmetic half never moves.

---

### Step 3: `system.ts` — the camera block, the assembler, and `buildNinaSystemPrompt`

**File:** `lib/nina/prompts/system.ts:96-129` (replaces the `NINA_SYSTEM_PROMPT` template literal)

**Change:** the assembly at line 96 becomes a table of sections rendered by a function that **drops
an empty section, header and all**. Its five existing headers and their order survive; four new
sections are added, all four empty at the default tuning.

**Code:**

```ts
/**
 * The photo dial, as prompt text rather than as a tool description.
 *
 * `GENERATE_IMAGE_TOOL.description` already says WHEN to reach for the camera — *"Use it when he
 * asks, or when you promised one"* — and `./tools.ts` records, with a measurement, that adding one
 * more clause to one description took first-attempt validity from 5/6 back to 2/4. Eagerness is a
 * third occasion, which is exactly that shape. So it lands here, where an occasion costs nothing.
 *
 * Empty at the default tuning, so the section disappears entirely and invariant 2 holds.
 */
export function buildCameraBlock(tuning: NinaTuning): string {
  const dials = systemDials(tuning)
  if (!raised(dials.photos, dials.photosBase)) return ''

  const lines = [
    'You have a camera and you like using it. Call "generate_image" when a photo answers him better than a sentence would, and offer one before he asks for it.',
  ]
  if (loud(dials.photos, dials.photosBase)) {
    lines.push(
      'Offer one the moment there is a reason to: a run he just finished, where you are right now, something he said he wanted to see.',
    )
  }
  return lines.join('\n')
}

/**
 * One band of the prompt: a rule heading and the blocks under it.
 *
 * **A section whose blocks are ALL empty is not rendered, and neither is its heading.** That is the
 * mechanism behind plan invariant 2 — the four tuning-only sections below return `''` at
 * `NINA_TUNING_DEFAULTS`, so the default render is today's prompt and not today's prompt with four
 * empty headings in it. A heading with nothing under it is also actively harmful: it tells the model
 * a category exists and then says nothing about it.
 */
interface PromptSection {
  /** `null` for the opening blocks, which are who she is and carry no heading. */
  header: string | null
  /** Rendered in order, joined by a blank line. Empty entries are dropped. */
  blocks: readonly string[]
}

/** The rule headings, in words. `tests/nina.prompts.test.ts` asserts the order against this. */
export const NINA_SECTION_TITLES: readonly string[] = [
  'HOW YOU TALK',
  'EXACTLY HOW YOU SOUND',
  'HOW YOU FEEL',
  'WHEN YOU GET ANGRY',
  'WHAT YOU NEVER SAY',
  'THE NUMBERS',
  'THE CAMERA',
  'WHAT YOU ARE READING',
  'HOW YOU ANSWER',
  'STANDING INSTRUCTIONS',
]

/**
 * `── TITLE ─────…` padded to 80 columns, which is what the five headings written by hand in F33
 * phase 2 are. Computed rather than copied so a new heading cannot be three dashes short of the
 * others, and `tests/nina.prompts.test.ts` asserts the width so a mistake here fails a test instead
 * of drifting into the prompt.
 */
const HEADER_WIDTH = 80

function sectionHeader(title: string): string {
  const prefix = `── ${title} `
  return prefix + '─'.repeat(Math.max(HEADER_WIDTH - prefix.length, 3))
}

function renderSections(sections: readonly PromptSection[]): string {
  const rendered: string[] = []
  for (const section of sections) {
    const blocks = section.blocks.map((block) => block.trim()).filter((block) => block !== '')
    if (blocks.length === 0) continue
    const body = blocks.join('\n\n')
    rendered.push(section.header == null ? body : `${section.header}\n${body}`)
  }
  return rendered.join('\n\n')
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE ASSEMBLER. One pure function of one `NinaTuning`, and the single reason this whole plan
 *  set has an effect: `lib/nina/turn.ts` passes its return value as `system` on every model call.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── THE ORDER IS ARGUED, NOT INHERITED ───────────────────────────────────────────────────────
 * F33 phase 2's five headings keep their places and their relative order. The four new sections
 * were each placed for a reason:
 *
 *   (no relationship section) `ninaIdentity(tuning)` is the headerless opening block and it
 *                         already carries who he is to her, which is where today's prompt carries
 *                         it too. `ninaNameRules(tuning)` — what she CALLS him — then arrives
 *                         downstream of it, inside HOW YOU TALK, exactly as it does today.
 *   HOW YOU FEEL          immediately before WHEN YOU GET ANGRY, because the anger dial is one of
 *                         the eleven and phase 2's ladder reads it as a FLOOR on the computed rung.
 *                         The floor and the ladder have to be readable together.
 *   THE CAMERA            after THE NUMBERS and before WHAT YOU ARE READING: it is an instruction
 *                         about a tool, and it belongs with the other mechanics rather than in the
 *                         middle of her character.
 *   STANDING INSTRUCTIONS last, and last on purpose. It is the operator's free text, and on this
 *                         endpoint a later instruction wins a contradiction with an earlier one.
 *                         The one field whose whole job is "override the above" goes at the bottom.
 *
 * ── WHAT IS *NOT* IN HERE ────────────────────────────────────────────────────────────────────
 * No dial, no slider value, no revision number, no band name. **Plan invariant 3 is about the
 * context JSON and this is the system prompt, but the same argument bites twice:** a number in
 * either one is a number she can quote back at him ("gw disetel 87 flirty"), and `NUMBERS_RULE`
 * three sections up says every number she says appears in the JSON below. The tuning reaches her as
 * BEHAVIOUR, in words, and never as a setting.
 *
 * **Two of the blocks above are now builders that were constants**: `buildNumbersRule` and
 * `buildContextGuide` (Step 2b). Both return today's text at the default tuning; both carry one
 * sentence that a dial repeals, and both had to change because a rule that survives inside a block
 * three sections away cancels the slider just as effectively as one in `persona.ts` would.
 */
export function buildNinaSystemPrompt(tuning: NinaTuning): string {
  return renderSections([
    /* Headerless, exactly as today: the shipping prompt has no heading above `── HOW YOU TALK ──`.
     * `ninaIdentity` carries the relationship's prose, which is why there is no separate
     * relationship section — see the Interface Contract. */
    { header: null, blocks: [ninaIdentity(tuning), NINA_EXPERTISE, NINA_NOT_A_DOCTOR] },
    {
      header: sectionHeader('HOW YOU TALK'),
      blocks: [
        LANGUAGE_RULE,
        JAKARTA_REGISTER,
        JAKARTA_SLANG_BLOCK,
        ENGLISH_REGISTER,
        ninaNameRules(tuning),
      ],
    },
    { header: sectionHeader('EXACTLY HOW YOU SOUND'), blocks: [VOICE_EXAMPLES_BLOCK] },
    { header: sectionHeader('HOW YOU FEEL'), blocks: [ninaTraitsBlock(tuning)] },
    { header: sectionHeader('WHEN YOU GET ANGRY'), blocks: [ninaAngerLadderBlock(tuning)] },
    { header: sectionHeader('WHAT YOU NEVER SAY'), blocks: [ninaNeverSayBlock(tuning)] },
    { header: sectionHeader('THE NUMBERS'), blocks: [buildNumbersRule(tuning)] },
    { header: sectionHeader('THE CAMERA'), blocks: [buildCameraBlock(tuning)] },
    { header: sectionHeader('WHAT YOU ARE READING'), blocks: [buildContextGuide(tuning)] },
    { header: sectionHeader('HOW YOU ANSWER'), blocks: [buildOutputRule(tuning)] },
    { header: sectionHeader('STANDING INSTRUCTIONS'), blocks: [ninaOperatorNotesBlock(tuning)] },
  ])
}

/**
 * **The compatibility contract, and the name four other modules and one test file already use.**
 * Plan invariant 2: this is what the app sent before the tuning existed, and it is what it sends
 * until a slider moves. Not deleted, not deprecated — a per-user feature whose default is "exactly
 * what shipped" needs a name for "exactly what shipped".
 */
export const NINA_SYSTEM_PROMPT = buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)
```

**Impact:** the five existing headings are now generated by `sectionHeader`. If the padding is off by
one column, the new render differs from today's in five places — the width assertion in Step 9 is
what catches it. `LANGUAGE_RULE`, `NUMBERS_RULE` and `CONTEXT_GUIDE` are unchanged and are declared
above this point in the file, so no reordering is needed.

---

### Step 4: `tools.ts` — the decision, and no change to a single prompt byte

**File:** `lib/nina/prompts/tools.ts:6-23` (the header docstring; append the block below to it)

**Change:** **No schema, no description and no `NINA_TOOLS` entry is edited.** The phase scope
proposed two edits — `SEND_TOOL.…bubbles.description` under the verbosity dial and
`GENERATE_IMAGE_TOOL.description` under the photo dial — and both are declined, in writing, in the
file that recorded the measurement. The comment is the deliverable.

**Code:**

```ts
/**
 * ── THE TWO TUNING DIALS THAT WERE PROPOSED FOR THIS FILE, AND WHY THEY ARE NOT HERE ─────────
 * The nina-character-tuning set (phase 3) proposed exactly two edits below: the verbosity dial on
 * `SEND_TOOL.input_schema.properties.bubbles.description`, and the photo-eagerness dial on
 * `GENERATE_IMAGE_TOOL.description`. **Both were declined. Neither description changed.** Four
 * reasons, in the order they decided it:
 *
 * 1. THE MEASUREMENT ABOVE IS THE WHOLE ARGUMENT. One extra clause on one description took the
 *    same schema from 5/6 to 2/4 valid on the first attempt. A description that varies with a
 *    slider is not one extra clause; it is a family of clauses, none of which can be measured
 *    before it ships, on an app with one user and no eval harness. The cost of getting it wrong is
 *    a dropped reply in her voice — the most expensive failure this feature has.
 * 2. THE VERBOSITY DIAL CANNOT MOVE WHAT THIS DESCRIPTION SAYS. `bubbles`' description states the
 *    CAP — `1-4` — and the cap is `minItems`/`maxItems` here plus `lib/nina/schema.ts`'s Zod.
 *    No slider may widen it. What the dial actually varies is the PREFERENCE, and the preference
 *    already lives in `OUTPUT_RULE` ("One bubble is the right answer more often than four"), where
 *    it has worked since F33 phase 2. The dial went where the sentence it changes already was.
 * 3. `GENERATE_IMAGE_TOOL`'s description states the OCCASIONS to call it — "when he asks, or when
 *    you promised one". Eagerness is a third occasion, which is precisely the "one extra clause"
 *    shape reason 1 measured. `prompts/system.ts`'s `── THE CAMERA ──` block carries it instead,
 *    and only when the dial is off its default.
 * 4. A DESCRIPTION THAT READS A TUNING MAKES `NINA_TOOLS` A BUILDER. It is a
 *    `readonly Anthropic.Tool[]` constant, and three module-level tool sets are derived from it at
 *    load — `NINA_CORE_TOOL_SET` (`lib/nina/tools.ts`), `NINA_CHAT_TOOL_SET`
 *    (`lib/nina/imagetools.ts`), `NINA_FULL_TOOL_SET` (`lib/nina/avatartools.ts`) — plus
 *    `NinaTurnDeps.toolSet` and the walk in `tests/nina.prompts.test.ts`. Per-turn tool sets are a
 *    five-file refactor across three owners, to carry two sentences that have a better home.
 *
 * THE COUNTER-ARGUMENT, STATED SO IT IS NOT LOST: the measurement above also says a hard rule in
 * the SYSTEM prompt scored 1/4 — *"the prompt is the wrong lever"*. It is, for FORMAT: for getting
 * a schema-valid tool call out of this endpoint, the descriptions are the lever and nothing else
 * is. Both dials here are CONTENT — how many bubbles she prefers, how readily she reaches for the
 * camera — and content is what the system prompt has always carried. The measurement does not
 * reach them.
 *
 * `NINA_PROMPT_VERSION` still went 2 -> 3 in that set, because `prompts/system.ts` changed shape.
 * Nothing in THIS file did.
 */
```

**Impact:** `tests/nina.prompts.test.ts:101-126` (the schema walk, the six-name assertion, the
`1..4` cap assertion) all keep passing with no edit. Phase 6's sweep must not "finish" this edit —
see Handoffs.

---

### Step 5: `index.ts` — the single version bump for the whole set

**File:** `lib/nina/prompts/index.ts:10-23`

**Change:** append a changelog comment in the file's existing convention, bump the constant, and add
the four new exports.

**Code:**

```ts
/* 2 — F33 phase 13 appended the `avatar` paragraph to `CONTEXT_GUIDE` (R25). No tool schema
 * moved; `SET_AVATAR_TOOL` was already declared here and is only now dispatched. */
/* 3 — the nina-character-tuning set. `NINA_SYSTEM_PROMPT` became
 * `buildNinaSystemPrompt(tuning)` and every character block in `../persona.ts` became a function
 * of a `NinaTuning`; the constant survives as the default render. `OUTPUT_RULE`'s no-greeting
 * clause is now gated on the `concerned` dial and its bubble preference on `verbosity`, and three
 * sections — HOW YOU FEEL, THE CAMERA, STANDING INSTRUCTIONS — render only when a dial is off its
 * default. Four rules IN THIS PACKAGE that contradicted a dial were repealed with their reasons
 * left in place: `NUMBERS_RULE`'s "Never comment on his body" (the third copy of a rule
 * `persona.ts` repealed twice), `CONTEXT_GUIDE`'s "This is where your anger comes from", and the
 * "not one higher" / "do not lecture him" / "do not sulk" clauses inside
 * `PROACTIVE_INSTRUCTIONS` — which is why the record is now a default render and not a constant.
 * `buildProactiveInstruction` composes those clauses and appends a tuning suffix. **NO TOOL SCHEMA
 * MOVED** — see `./tools.ts`'s note on the two dials that were proposed for it and declined. This
 * is the SINGLE bump for the whole set: phase 3 owns it and no other phase touches this constant,
 * because two bumps would date two commits to one change. */
export const NINA_PROMPT_VERSION = 3

export {
  LANGUAGE_RULE,
  NINA_REPAIR_PREAMBLE,
  NINA_SECTION_TITLES,
  NINA_SYSTEM_PROMPT,
  NUMBERS_RULE,
  CONTEXT_GUIDE,
  OUTPUT_RULE,
  PROACTIVE_INSTRUCTIONS,
  buildCameraBlock,
  buildContextGuide,
  buildNinaSystemPrompt,
  buildNumbersRule,
  buildOutputRule,
  buildProactiveInstruction,
  type ProactiveTriggerKind,
} from './system'

export {
  COMPARE_RUNS_TOOL,
  GENERATE_IMAGE_TOOL,
  LOOKUP_RUNS_TOOL,
  NINA_TOOL_NAMES,
  NINA_TOOLS,
  SAVE_MEMORY_TOOL,
  SEND_TOOL,
  SET_AVATAR_TOOL,
} from './tools'
```

**Impact:** `lib/nina/load.ts:266` stamps the new value onto `NinaContext.promptVersion` with no
edit, so `nina_turns.prompt_version` reads 3 from the first turn after this lands. Historical rows
keep 2, which is the point of the constant.

---

### Step 6: `system.ts` — the proactive suffix

**File:** `lib/nina/prompts/system.ts:163-183` (replaces the `PROACTIVE_INSTRUCTIONS` record)

**Change:** the five texts become five functions of the tuning — carrying Step 2b's three
parameterised clauses — and `PROACTIVE_INSTRUCTIONS` becomes their default render, keeping its name
and its type. Plus one tuning-aware suffix, appended to whichever trigger fired.

**The suffix alone was not enough, and that is the correction to this plan's draft.** Three of the
five texts contain a rule that a dial repeals (Step 2b, findings 2 and 4), and a suffix appended
after such a sentence contradicts it rather than replacing it. So: clauses for the repeals, a suffix
for the additions. `tests/nina.prompts.test.ts:140-144` asserts all five contain
`'opening this conversation'` — that phrase is in the unchanged first paragraph of every one of the
five, so it cannot break.

**Code:**

```ts
/**
 * The tuning's effect on an OPENING turn, as one suffix.
 *
 * ── WHY A SUFFIX AND NOT FIVE TUNED TRIGGER TEXTS ────────────────────────────────────────────
 * Five variants is five places to forget one, and the failure is silent: a dial that reaches four
 * of her five openings is a dial the operator will describe as "sometimes working".
 * `tests/nina.prompts.test.ts` asserts that every one of the five still contains "opening this
 * conversation"; with a suffix that assertion cannot break, because the five strings are untouched.
 *
 * ── WHY THIS TURN NEEDS ITS OWN CLAUSE AT ALL ────────────────────────────────────────────────
 * `buildNinaSystemPrompt`'s greeting line already covers the `concerned` dial. A proactive turn is
 * the one turn where it is load-bearing: nobody said anything, so there is no message to react to,
 * and *"how are you"* is the entire content of the opening rather than a courtesy in front of one.
 * The user's own example is this turn — *"how are your feet after the run this morning"*.
 *
 * Empty at the default tuning, and the caller appends nothing when it is empty (invariant 2).
 *
 * **Phase 10 of the previous set owns trigger LOGIC; this file owns trigger COPY.** This is copy.
 */
function proactiveTuningSuffix(tuning: NinaTuning): string {
  const dials = systemDials(tuning)
  const lines: string[] = []

  if (loud(dials.concerned, dials.concernedBase)) {
    lines.push(
      'Before anything else, ask how he is. If "recentRuns[0].daysAgo" is 0 or 1, ask how his ' +
        'body feels after that run — his feet, his legs — and let that be the whole bubble ' +
        'instead of moving on to your own point.',
    )
  } else if (raised(dials.concerned, dials.concernedBase)) {
    lines.push('Ask how he is somewhere in this, not only about the running.')
  }

  if (loud(dials.photos, dials.photosBase)) {
    lines.push(
      'A photo is a fine way to open this one. Call "generate_image" if one would land better ' +
        'than a sentence.',
    )
  }

  return lines.join('\n')
}

/**
 * What `lib/nina/proactive.ts` sends: the trigger's own copy, with the three inline clauses Step 2b
 * parameterised, plus the tuning suffix when there is one.
 *
 * **Two mechanisms, and both are needed.** The clauses (`rungClause`, `lectureClause`,
 * `sulkClause`) REPEAL rules that live inside the trigger text — a suffix cannot do that, because
 * the model receives the prohibition and the permission and picks. The suffix ADDS an instruction
 * that no existing sentence contradicts. Step 2b's finding is what separates them.
 *
 * At `NINA_TUNING_DEFAULTS` every clause returns its shipping wording and the suffix is empty, so
 * this returns the exact string that shipped — which is what `PROACTIVE_INSTRUCTIONS` below is.
 */
const PROACTIVE_COPY: Record<ProactiveTriggerKind, (tuning: NinaTuning) => string> = {
  run_committed: () => `He just finished a run and it is now recorded — it is "recentRuns[0]". You are opening this conversation, he did not ask you anything.

React to THAT run. If it took a record or earned a badge, that is the thing to lead with. If a flag on it is worth a word, say it. If it is just a run, say what you actually noticed. Ask him one thing the numbers cannot tell you — and only if "recentRuns[0].intent" is null, because a non-null intent means he already answered why.`,

  missed_usual_day: (tuning) => `Today is one of the days "memory.slots" says he usually runs, and there is no run on record for it yet. You are opening this conversation.

Ask, the way a friend asks: "jadi ga lari selasa ini?" One bubble. ${lectureClause(tuning)}`,

  pattern_crossed: (tuning) => `A pattern in "patterns" just crossed a line. You are opening this conversation.

${rungClause(tuning)} Name the pattern, quote its value exactly as the JSON spells it, and if "nagLevel" is 1 or more then say plainly that you have told him this before — because you have.`,

  silence: (tuning) => `He has not said anything for "conversation.daysSinceRunnerSpoke" days. You are opening this conversation.

Say something a friend would actually say after that long. Do not open with a training question, do not open with a metric, ${sulkClause(tuning)}`,

  avatar_changed: () => `Your profile picture has just changed. You are opening this conversation.

Mention it in passing, the way someone does when they change their picture. One bubble. Do not describe the photo to him — he can see it.`,
}

export function buildProactiveInstruction(
  kind: ProactiveTriggerKind,
  tuning: NinaTuning,
): string {
  const base = PROACTIVE_COPY[kind](tuning)
  const suffix = proactiveTuningSuffix(tuning)
  return suffix === '' ? base : `${base}\n\n${suffix}`
}

/**
 * The five trigger texts at the default tuning, under the name and the type this file has always
 * exported (`Record<ProactiveTriggerKind, string>`). Byte-identical to the record that shipped, and
 * `tests/nina.prompts.test.ts`'s two existing assertions over it — five keys, and
 * `'opening this conversation'` in every value — pass unedited.
 */
export const PROACTIVE_INSTRUCTIONS: Record<ProactiveTriggerKind, string> = {
  run_committed: PROACTIVE_COPY.run_committed(NINA_TUNING_DEFAULTS),
  missed_usual_day: PROACTIVE_COPY.missed_usual_day(NINA_TUNING_DEFAULTS),
  pattern_crossed: PROACTIVE_COPY.pattern_crossed(NINA_TUNING_DEFAULTS),
  silence: PROACTIVE_COPY.silence(NINA_TUNING_DEFAULTS),
  avatar_changed: PROACTIVE_COPY.avatar_changed(NINA_TUNING_DEFAULTS),
}
```

**Impact:** `PROACTIVE_INSTRUCTIONS` stays exported and stays a `Record<ProactiveTriggerKind,
string>`; `scripts/nina-profpic.mjs:91` refers to `PROACTIVE_INSTRUCTIONS.avatar_changed` in a
comment only and needs nothing.

---

### Step 7: `turn.ts` — the tuning on the input, the system string on the body

**File:** `lib/nina/turn.ts:8` (import), `:180-188` (`NinaTurnTrace`), `:209-222` (`NinaTurnRow`),
`:228-276` (`NinaTurnInput`), `:428-443` (`ninaBody`), `:529-536` (the trace), `:586-589` (the call),
`:622-626` (the repair call), `:732-748` (`attemptNinaRepair`), `:818-832` (the log)

**Change:** nine edits, none of which touches a measured behaviour. `findSendBlock` and
`findToolUses` keep scanning, `thinking: { type: 'disabled' }` stays on every body,
`tool_choice`'s two forms are unchanged, and `NINA_TURN_BUDGET.overall` stays at 45 s.

**Code — the import at line 8:**

```ts
import { NINA_REPAIR_PREAMBLE, SEND_TOOL, buildNinaSystemPrompt } from './prompts'
```

**Code — a new import beside the others (after `./schema`, keeping the alphabetical grouping):**

```ts
import type { NinaTuning } from './tuning'
```

**Code — `NinaTurnTrace` (replaces lines 180-188):**

```ts
export interface NinaTurnTrace {
  model: string
  promptVersion: number
  /**
   * `NinaTuning.revision` at call time. **Beside `promptVersion` because neither answers the
   * question alone.** `NINA_PROMPT_VERSION` now identifies the ASSEMBLER, not the output: with a
   * per-user tuning, two turns on version 3 can have been produced by two different Ninas. This is
   * what lets "what was she set to when she said that" be answered from the audit table.
   *
   * Nullable because `lib/nina/queries.ts`'s column is, and it is nullable there because rows
   * written before this set exist and must not claim a revision they never had.
   */
  tuningRevision: number | null
  /** Tool rounds actually completed. 0 for a turn she answered straight away. */
  rounds: number
  /** Every tool name dispatched, in order. A dropped sibling call is prefixed `dropped:`. */
  toolCalls: string[]
  latencyMs: number
}
```

**Code — `NinaTurnRow` (replaces lines 209-222):**

```ts
export interface NinaTurnRow {
  model: string
  promptVersion: number
  /** `NinaTuning.revision` at call time. See `NinaTurnTrace`'s note. */
  tuningRevision: number | null
  /** Which mechanism produced the reply. NOT the `status` column — see `dbNinaTurnStore`. */
  source: NinaTurnSource
  /**
   * Comma-joined `trace.toolCalls`. `''` when she called none — ruling (b)'s evidence, and the
   * reason phase 1's column is `text` and not an `integer` count.
   */
  toolCalls: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}
```

**Code — the new field on `NinaTurnInput`, inserted immediately after `context` (line 231) so the
two per-turn data carriers are adjacent:**

```ts
  /**
   * **The tuning, and it is on the INPUT rather than on `NinaContext` or on `NinaTurnDeps`.**
   * Plan invariant 3, and the file's own existing distinction, twice over:
   *
   *   - NOT `NinaContext`. That object is serialised into the USER turn as JSON, and it is
   *     documented as the boundary of everything she may know. A dial in there is a number she can
   *     quote back at him — "gw disetel 87 flirty" — and it collides head-on with `NUMBERS_RULE`,
   *     whose whole content is "every number you say appears in the JSON below". The tuning reaches
   *     her as behaviour in the SYSTEM prompt and never as a value.
   *   - NOT `NinaTurnDeps`. Deps are MACHINERY — a client, a model id, a gateway, a store, all the
   *     same for every user. The tuning is PER-USER DATA, which is the same line this file already
   *     draws between `context` (input) and `gateway` (deps).
   *
   * **Required, not optional.** An optional field defaulting to `NINA_TUNING_DEFAULTS` inside the
   * loop would mean a forgotten call site ships the DEFAULT character and nothing fails — which is
   * precisely the bug the plan set names: a tuning threaded through the chat action alone leaves
   * her proactive messages in the default character, and that is the exact behaviour the
   * `concerned` dial exists to change. Required makes the compiler the guard, and there are only
   * two production call sites plus three test builders to satisfy.
   */
  tuning: NinaTuning
```

**Code — `ninaBody` (replaces lines 428-443; the docstring above it, lines 376-427, is unchanged and
stays):**

```ts
function ninaBody(
  model: string,
  system: string,
  messages: Anthropic.MessageParam[],
  toolSet: NinaToolSet,
  forceSend: boolean,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: NINA_MAX_TOKENS,
    /*
     * **ASSEMBLED, NOT READ.** This was `NINA_SYSTEM_PROMPT` — a module-level constant — until the
     * nina-character-tuning set, and it was the single line the whole character tuning had to pass
     * through. `system` is `buildNinaSystemPrompt(input.tuning)`, computed ONCE per turn by the
     * caller: see `runNinaTurnWith`'s note on why once and not per call.
     *
     * `system` is second in the parameter list to match this object's own field order, so a reader
     * comparing the call to the envelope is not reordering two strings in their head.
     */
    system,
    messages,
    tools: forceSend ? [SEND_TOOL] : [...toolSet.tools],
    tool_choice: forceSend ? { type: 'tool', name: SEND_TOOL.name } : { type: 'any' },
    thinking: { type: 'disabled' },
  }
}
```

**Code — `runNinaTurnWith`'s preamble (replaces lines 529-536):**

```ts
  const usage: NinaTurnUsage = { inputTokens: 0, outputTokens: 0 }

  /*
   * ── ASSEMBLED ONCE PER TURN, AND THAT IS A CORRECTNESS PROPERTY, NOT A MICRO-OPTIMISATION ───
   * A turn makes up to four model calls (primary, two continuations, one repair). Building the
   * prompt inside `ninaBody` would re-run a ~10 KB string concat on each of them, which is cheap
   * and irrelevant; what is NOT irrelevant is that all four calls of one turn must carry the SAME
   * character. `buildNinaSystemPrompt` is pure, so a per-call build would in fact be identical
   * today — but `input.tuning` is read live from the database on every turn with no cache
   * anywhere on this path, and the moment anything re-reads it mid-turn, a slider moved between
   * call 1 and call 2 would split one turn between two Ninas. One string, computed here, removes
   * that possibility by construction.
   */
  const system = buildNinaSystemPrompt(input.tuning)

  const trace: NinaTurnTrace = {
    model: deps.model,
    promptVersion: input.context.promptVersion,
    tuningRevision: input.tuning.revision,
    rounds: 0,
    toolCalls: [],
    latencyMs: 0,
  }
```

**Code — the primary/continuation call (replaces lines 586-589):**

```ts
      message = await deps.client.messages.create(
        ninaBody(deps.model, system, messages, deps.toolSet, forceSend),
        { timeout: Math.min(ceiling, Math.max(remaining(), 1)) },
      )
```

**Code — the repair call (replaces lines 622-626):**

```ts
      const repaired = await attemptNinaRepair(deps, system, messages, {
        malformed: send.input,
        issues: describeNinaIssues(parsed.error),
        timeoutMs: Math.min(NINA_TURN_BUDGET.repair, remaining()),
      })
```

**Code — `attemptNinaRepair`'s signature and its one body line (replaces lines 732-748; the
docstring above it, lines 718-731, is unchanged and stays):**

```ts
async function attemptNinaRepair(
  deps: NinaTurnDeps,
  /** The same assembled prompt the failing call carried. A repair under a different character is a
   * second reply from a second person, and "reuse exactly what you already had" would be a lie. */
  system: string,
  messages: readonly Anthropic.MessageParam[],
  input: { malformed: unknown; issues: string; timeoutMs: number },
): Promise<{ payload: NinaSendPayload; usage: NinaTurnUsage } | null> {
  const repairMessages: Anthropic.MessageParam[] = [
    ...messages,
    { role: 'assistant', content: JSON.stringify(input.malformed) },
    { role: 'user', content: NINA_REPAIR_PREAMBLE + input.issues },
  ]

  let second: Anthropic.Message
  try {
    second = await deps.client.messages.create(
      ninaBody(deps.model, system, repairMessages, deps.toolSet, true),
      { timeout: Math.max(input.timeoutMs, 1) },
    )
  } catch (cause) {
    logNinaFailure('repair', cause)
    return null
  }
```

**Code — the log in `runNinaTurn` (replaces lines 820-828):**

```ts
      await deps.store.record(input.userId, {
        model: result.trace.model,
        promptVersion: result.trace.promptVersion,
        tuningRevision: result.trace.tuningRevision,
        source: result.source,
        toolCalls: result.trace.toolCalls.join(','),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.trace.latencyMs,
      })
```

**Impact:** `NINA_SYSTEM_PROMPT` is no longer imported by this file. Every other exported symbol
keeps its name, so `scripts/check-llm-payload-boundary.mjs`'s literal grep for `runNinaTurn` still
guards. `productionDeps()` is untouched — the tuning is not a dep.

---

### Step 8: `gateway.ts` — the revision reaches the row

**File:** `lib/nina/gateway.ts:413-429`

**Change:** one field through the `NinaTurnRow` → `NinaTurnInsert` translation. This file is the only
place the two shapes meet, which is why the field lands here and not in `turn.ts`.

**Code:**

```ts
export const dbNinaTurnStore: NinaTurnStore = {
  async record(userId: string, row: NinaTurnRow): Promise<void> {
    await insertNinaTurn(userId, {
      kind: 'chat',
      trigger: null,
      model: row.model,
      promptVersion: row.promptVersion,
      /* The nina-character-tuning set. `prompt_version` identifies the ASSEMBLER and this
       * identifies the SETTINGS it assembled, which is the pair needed to answer "what was she set
       * to when she said that". Nullable, because rows written before that set have no answer. */
      tuningRevision: row.tuningRevision,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      /* Comma-joined names, `''` when none — ruling (b)'s evidence, and the reason phase 1's
       * column is `text NOT NULL DEFAULT ''` rather than an `integer` count. */
      toolCalls: row.toolCalls,
      latencyMs: row.latencyMs,
      status: STATUS_BY_SOURCE[row.source],
      errorCode: row.source === 'unavailable' ? 'unavailable' : null,
    })
  },
}
```

**Impact:** depends on phase 1 having added `tuningRevision?: number | null` to `NinaTurnInsert` and
written it in `insertNinaTurn`. Nothing else in the file changes; the image-job path
(`openNinaImageJob`) passes no `tuningRevision` and gets `null`, which is correct — an image job is
not a turn with a character.

---

### Step 9: `actions.ts` — a third read in the existing `Promise.all`

**File:** `lib/nina/actions.ts:22` (import) and `:485-489`, plus one line in the `runNinaTurn` input
at `:530`

**Change:** add the tuning read to the two-read `Promise.all` at 486 — a third concurrent read on the
same connection costs no extra wall clock — and pass it.

**Code — the import (line 22's group; `readNinaTuning` is alphabetically first):**

```ts
import {
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessagesByIds,
  insertNinaMessageImages,
  insertNinaMessages,
  readNinaTuning,
} from './queries'
```

**Code — the reads (replaces lines 485-489):**

```ts
  const [context, history, tuning] = await Promise.all([
    loadNinaContext(userId, dbNinaSourceGateway),
    dbNinaToolGateway.loadRunHistory(userId),
    /*
     * THE TUNING, read LIVE on every turn with no cache — which is what makes a slider on
     * `/admin/nina` immediate. `lib/admin/memoryActions.ts` already records the same property for
     * the memory slots: `revalidatePath` re-renders the admin page and is not how the edit reaches
     * Nina; a committed row is in her next prompt with no invalidation step at all.
     *
     * Third in an existing `Promise.all` on purpose. It is one indexed single-row read against a
     * connection this turn is opening anyway, so it costs no extra wall clock against the two reads
     * beside it — and the 45 s budget above has no room for a fourth sequential round trip.
     */
    readNinaTuning(userId),
  ])
```

**Code — the turn input (insert immediately after `context,` in the object at line 532):**

```ts
      /* Plan invariant 3: on the INPUT, never on the context. A dial inside the context JSON is a
       * number she can quote back at him and it collides with `NUMBERS_RULE`. */
      tuning,
```

**Impact:** the `Promise.all` destructure widens from two to three; nothing else in the 813-line file
changes. `runTurnDistillation` in the `after()` block uses `DISTILL_SYSTEM_PROMPT` and is phase 6's —
untouched.

---

### Step 10: `proactive.ts` — the tuning at BOTH `loadNinaContext` sites

**File:** `lib/nina/proactive.ts:14` (import), `:588-612` (`emitProactiveMessage`), `:698-720`
(`emitRunCommitted`), `:740-753` (`evaluateAndEmitForUser`)

**Change:** `emitProactiveMessage` takes the tuning as a parameter and both callers read it beside
their `loadNinaContext` call. `deps.runTurn` stays injectable — the whole point of taking the tuning
as an argument rather than reading it inside is that this function stays drivable from a test with a
fake `runTurn` and an explicit tuning, with no database.

**Code — the imports (replaces line 14, and adds one):**

```ts
import { buildProactiveInstruction, type ProactiveTriggerKind } from './prompts'
```

...and in the `./queries` import group (lines 15-22), add `readNinaTuning`:

```ts
import {
  getNinaNags,
  getUnannouncedCurrentNinaAvatar,
  hasProactiveMessageForRun,
  insertNinaMessages,
  markNinaAvatarAnnounced,
  readNinaTuning,
  upsertNinaNag,
} from './queries'
```

...and a type import beside `./context`'s (after line 9):

```ts
import type { NinaTuning } from './tuning'
```

**Code — `emitProactiveMessage`'s signature and the two lines inside it that change (replaces lines
588-612; the docstring above, lines 570-587, is unchanged):**

```ts
export async function emitProactiveMessage(
  userId: string,
  detail: ProactiveDetail,
  facts: ProactiveFacts,
  context: NinaContext,
  /**
   * **Passed in, not read here.** Both callers already open a connection for `loadNinaContext`, so
   * reading it there costs nothing extra and keeps this function a function of its arguments plus
   * `deps.runTurn` — which is what makes it drivable from a test with no database and no model.
   *
   * A proactive turn is the reason this parameter exists at all. A tuning threaded through the chat
   * action alone would leave every message she OPENS in the default character, and the opening is
   * exactly what the `concerned` dial is about.
   */
  tuning: NinaTuning,
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())
  /* PHASE 11 LANDED. Was `NOOP_NOTIFIER`; the seam is now wired to the real Web Push sender.
   * `NOOP_NOTIFIER` is still exported and is still what a test passes explicitly, which is why it
   * is not deleted. `pushNotifier` never throws: with no VAPID in the environment `sendNinaPush`
   * catches `pushEnv()` and returns `skipped` before touching the database, so a suite with
   * neither keys nor a network keeps passing against the real sender. */
  const notify = deps.notify ?? pushNotifier
  const runTurn = deps.runTurn ?? runNinaTurn

  /* `buildProactiveInstruction` is `PROACTIVE_INSTRUCTIONS[kind]` verbatim plus a tuning suffix,
   * and it appends nothing at the default tuning. The trigger BLOCK below it is this module's — the
   * split stated in the header holds: that file owns the copy, this one owns when and which. */
  const proactive = `${buildProactiveInstruction(detail.kind, tuning)}\n\n${triggerBlock(detail)}`

  /* The tools need the reviewed history, exactly as a chat turn does — she may look a run up
   * while reacting to another one. One query, the same one `sendNinaMessage` makes. */
  const history = await dbNinaToolGateway.loadRunHistory(userId)

  const result = await runTurn({
    userId,
    context,
    tuning,
    /* No runner message precedes a proactive turn. `runnerText: null` makes the user turn omit
     * the "HE JUST SAID" block rather than emit an empty one, and `sourceMessageId: null` means a
     * memory write distilled from this turn has nothing of his to point at — because there is
     * nothing of his. She is allowed to speak twice in a row; that is what a trigger IS. */
    history,
    sourceMessageId: null,
    runnerText: null,
    proactive,
  })
```

**Code — `emitRunCommitted`'s body (replaces lines 715-732, from the `loadNinaContext` call to the
`return`):**

```ts
  /* Site 1 of 2. The tuning read joins the context read rather than following it: both are one
   * round trip on a connection this pass is opening anyway, and `loadProactiveFacts` below needs
   * the context, so it cannot join them. */
  const [context, tuning] = await Promise.all([
    loadNinaContext(input.userId, dbNinaSourceGateway, at),
    readNinaTuning(input.userId),
  ])
  const facts = await loadProactiveFacts(input.userId, context, at)

  return emitProactiveMessage(
    input.userId,
    {
      kind: 'run_committed',
      runId: input.runId,
      occurredOn: input.occurredOn,
      recordKeys: input.recordKeys,
      badgeKeys: input.badgeKeys,
    },
    facts,
    context,
    tuning,
    deps,
  )
}
```

**Code — `evaluateAndEmitForUser`'s body (replaces lines 740-754):**

```ts
export async function evaluateAndEmitForUser(
  userId: string,
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())
  const at = now()

  /* Site 2 of 2. Both sites read it, because BOTH are turns she opens, and the whole argument for
   * the `concerned` dial is about the turns she opens. */
  const [context, tuning] = await Promise.all([
    loadNinaContext(userId, dbNinaSourceGateway, at),
    readNinaTuning(userId),
  ])
  const facts = await loadProactiveFacts(userId, context, at)

  const decision = decideProactive(facts)
  if (!decision.fire) return NOT_EMITTED(decision.reason)

  return emitProactiveMessage(userId, decision.detail, facts, context, tuning, deps)
}
```

**Impact:** `PROACTIVE_INSTRUCTIONS` is no longer imported here; the two docstring references to it
(lines 31 and 170) are prose and stay accurate. `emitProactiveMessage`'s signature widens, and both
callers are in this file — `grep` confirms no external caller and no test calls it directly
(`tests/nina.proactive.test.ts` imports only the pure decision functions;
`tests/nina.cron.test.ts` mocks the whole module).

The tuning read is **not** added as a `ProactiveDeps` port. Both call sites already await
`loadNinaContext` and `loadProactiveFacts` against the real database, so neither is unit-testable
today and a third port would buy nothing; `emitProactiveMessage`, which IS testable, receives the
tuning as an argument.

---

### Step 11: `tests/fixtures/ninaTurn.ts` — one tuning fixture

**File:** `tests/fixtures/ninaTurn.ts:11` (the type import) and after `runHistoryFixture` (line 49)

**Change:** one helper. `tests/fixtures/ninaContext.ts` needs **no change** — plan invariant 3 keeps
the tuning out of `NinaContext`, and the fact that the context fixture compiles untouched is itself
evidence the invariant held.

**Code — the import:**

```ts
import { NINA_TUNING_DEFAULTS, type NinaTuning } from '@/lib/nina/tuning'
```

**Code — the helper, after `runHistoryFixture`:**

```ts
/**
 * The default tuning, spreadably overridable. **The default and not a random setting**, because
 * plan invariant 2 makes the defaults the thing every other test is implicitly asserting against:
 * a fixture that shipped a tuned Nina would make every unrelated turn test a test of the tuning.
 *
 * Overriding a single trait needs the nested spread, which is deliberate — `traits` is a full
 * record and a partial one would be a tuning with holes in it:
 *
 *     ninaTuningFixture({ traits: { ...NINA_TUNING_DEFAULTS.traits, concerned: 100 } })
 */
export function ninaTuningFixture(overrides: Partial<NinaTuning> = {}): NinaTuning {
  return { ...NINA_TUNING_DEFAULTS, ...overrides }
}
```

**Impact:** phases 4 and 5 get a fixture they would otherwise each write.

---

### Step 12: `lib/nina/turn.test.ts` — the input builder, and three new cases

**File:** `lib/nina/turn.test.ts:1-38` (imports and the `input()` builder), plus three cases

**Change:** the builder gains `tuning`, and three cases cover what the phase actually added. Every
existing case keeps passing untouched, which is the point.

**Code — the fixture import (replaces lines 1-14's list, adding one name):**

```ts
import {
  fakeToolGateway,
  fakeTurnDeps,
  fakeTurnStore,
  ninaContextFixture,
  ninaTuningFixture,
  proseMessage,
  runHistoryFixture,
  scriptedClient,
  sendMessage,
  thinkingOnlyMessage,
  toolUseMessage,
  truncatedMessage,
  withLeadingThinking,
} from '@/tests/fixtures/ninaTurn'
```

**Code — two more imports beside the existing ones (lines 17 and 26):**

```ts
import { NINA_SYSTEM_PROMPT, buildNinaSystemPrompt, LOOKUP_RUNS_TOOL, SEND_TOOL } from './prompts'
import { NINA_TUNING_DEFAULTS } from './tuning'
```

**Code — the builder (replaces lines 28-38):**

```ts
function input(overrides: Partial<NinaTurnInput> = {}): NinaTurnInput {
  return {
    userId: 'u1',
    context: ninaContextFixture(),
    /* Required on the input, not optional with a default inside the loop — see the field's own
     * note. A test that forgets it does not compile, which is the guarantee. */
    tuning: ninaTuningFixture(),
    history: runHistoryFixture(),
    sourceMessageId: 'm1',
    runnerText: 'lari gw kemaren gimana menurut lo?',
    ...overrides,
  }
}

/** A tuning with one trait at the top of its range. */
function tunedInput(overrides: Partial<NinaTurnInput> = {}): NinaTurnInput {
  return input({
    tuning: ninaTuningFixture({
      traits: { ...NINA_TUNING_DEFAULTS.traits, concerned: 100 },
    }),
    ...overrides,
  })
}
```

**Code — the three new cases, appended to the `runNinaTurnWith — the request envelope` describe
block (after line 379's case, inside the same block):**

```ts
  /*
   * ── THE ONE LINE THE WHOLE CHARACTER TUNING PASSES THROUGH ──────────────────────────────────
   * `system` was a module-level constant until the nina-character-tuning set. If this assertion
   * ever passes with the DEFAULT prompt on a tuned input, every slider on `/admin/nina` is
   * decorative and nothing else in the suite would notice.
   */
  it('sends the ASSEMBLED prompt for this input, not the module constant', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    const turn = tunedInput()
    await runNinaTurnWith(fakeTurnDeps(client), turn)
    expect(client.calls[0]!.system).toBe(buildNinaSystemPrompt(turn.tuning))
    expect(client.calls[0]!.system).not.toBe(NINA_SYSTEM_PROMPT)
  })

  it('sends the DEFAULT prompt for a default tuning — invariant 2, at the call site', async () => {
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurnWith(fakeTurnDeps(client), input())
    expect(client.calls[0]!.system).toBe(NINA_SYSTEM_PROMPT)
  })

  /*
   * One turn is one character. Built once outside the loop precisely so a re-read cannot split a
   * turn between two Ninas — the repair call included, since a repair under a different prompt is
   * a second reply from a second person.
   */
  it('sends the SAME system prompt on all three calls of one turn, repair included', async () => {
    const day = runHistoryFixture().runs[0]!.occurredOn
    const client = scriptedClient([
      toolUseMessage(LOOKUP_RUNS_TOOL.name, { dates: [day] }),
      sendMessage({ bubbles: [] }),
      sendMessage(GOOD),
    ])
    await runNinaTurnWith(fakeTurnDeps(client), tunedInput())
    expect(client.calls).toHaveLength(3)
    const systems = new Set(client.calls.map((body) => body.system))
    expect(systems.size).toBe(1)
  })
```

**Code — one new case, appended to the `runNinaTurn — the log` describe block:**

```ts
  it('records the tuning revision beside the prompt version', async () => {
    const store = fakeTurnStore()
    const client = scriptedClient([sendMessage(GOOD)])
    await runNinaTurn(
      input({ tuning: ninaTuningFixture({ revision: 7 }) }),
      fakeTurnDeps(client, { store }),
    )
    expect(store.rows[0]!.tuningRevision).toBe(7)
    expect(store.rows[0]!.promptVersion).toBe(ninaContextFixture().promptVersion)
  })
```

**Impact:** none of the 40-odd existing cases changes. `client.calls[0]!.system` is typed
`string | Anthropic.TextBlockParam[]`; `toBe` against a string is fine, and `new Set(...)` over the
union is fine.

---

### Step 13: `tests/live/nina.live.test.ts` — one field

**File:** `tests/live/nina.live.test.ts:39-45`

**Change:** the inline `NinaTurnInput` gains `tuning`. Excluded from `npm test`, but `tsconfig.json`
includes `**/*.ts`, so `npm run typecheck` fails without it.

**Code:**

```ts
    const result = await runNinaTurnWith(fakeTurnDeps(ninaClient(), { model: ninaModel() }), {
      userId: 'live',
      context: ninaContextFixture(),
      /* The DEFAULT tuning: this case is measuring the endpoint's tool loop, not the character. */
      tuning: ninaTuningFixture(),
      history: runHistoryFixture(),
      sourceMessageId: null,
      runnerText: 'na, coba compare run gw tanggal 3 vs 1 bulan ini',
    })
```

...and `ninaTuningFixture` joins that file's existing `@/tests/fixtures/ninaTurn` import.

**Impact:** typecheck only. The live suite still costs money and still runs only under
`LLM_LIVE_TEST=1`.

---

### Step 14: `tests/nina.prompts.test.ts` — re-point, and prove both halves of invariant 2

**File:** `tests/nina.prompts.test.ts` — whole file

**Change:** the fifteen existing cases stay, three of them re-pointed to be independent of phase 2's
internal shape; four new describe blocks prove the assembler, invariant 2 in both directions, and one
case per dial.

**Why the three are re-pointed, and how far:** the `NEVER_SAY` walk (44-48) asserts that every entry
of a flat exported array reached the prompt. Phase 2 repeals two of those entries under R6 — the
body-comment line and the threat/withdrawal line — and whether a repealed entry returns at a *low*
`flirty` is phase 2's decision, taken concurrently with this plan. So the walk is re-pointed at the
entries **no dial can repeal**, named explicitly, with the plan's own out-of-scope list as the
authority. The anger-ladder walk (38-42) reads the `ANGER_LADDER` data array, which phase 2 keeps
(only `ANGER_LADDER_BLOCK` becomes a function) — kept as-is. `'not an assistant'` (80-82) is kept:
no dial in R1 asks her to become one.

**Code — the whole file:**

```ts
import { describe, expect, it } from 'vitest'

import {
  ANGER_LADDER,
  JAKARTA_SLANG,
  NINA_APPEARANCE,
  VOICE_EXAMPLES,
} from '@/lib/nina/persona'
import {
  NINA_PROMPT_VERSION,
  NINA_SECTION_TITLES,
  NINA_SYSTEM_PROMPT,
  NINA_TOOLS,
  PROACTIVE_INSTRUCTIONS,
  SEND_TOOL,
  buildNinaSystemPrompt,
  buildProactiveInstruction,
} from '@/lib/nina/prompts'
import {
  NINA_TUNING_DEFAULTS,
  type NinaDial,
  type NinaTrait,
  type NinaTuning,
} from '@/lib/nina/tuning'

/**
 * The prompt is a deliverable, so it gets a test. Not a test of taste — a test that every piece
 * of the canon actually reached the string that gets sent, that no schema lost the property
 * descriptions the 2026-08-21 measurement bought, and (since the nina-character-tuning set) that
 * the DEFAULT tuning still produces the prompt that shipped before any of it existed.
 */

/** The default tuning with named overrides. */
function tuned(overrides: Partial<NinaTuning>): NinaTuning {
  return { ...NINA_TUNING_DEFAULTS, ...overrides }
}

/** One trait moved, everything else at its default. */
function withTrait(key: NinaTrait, value: number): NinaTuning {
  return tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, [key]: value } })
}

/** One dial moved. The dials are NESTED under `dials` — phase 1's landed shape. */
function withDial(key: NinaDial, value: number): NinaTuning {
  return tuned({ dials: { ...NINA_TUNING_DEFAULTS.dials, [key]: value } })
}

const DEFAULT_RENDER = buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)

describe('NINA_SYSTEM_PROMPT — the canon reached the prompt', () => {
  it('carries every slang term, so adding a word to the array is the only edit needed', () => {
    for (const entry of JAKARTA_SLANG) {
      expect(NINA_SYSTEM_PROMPT).toContain(entry.term)
    }
  })

  it("carries all five of the user's own example lines, verbatim", () => {
    expect(VOICE_EXAMPLES).toHaveLength(5)
    for (const example of VOICE_EXAMPLES) {
      expect(NINA_SYSTEM_PROMPT).toContain(example.line)
    }
  })

  it('carries every rung of the anger ladder', () => {
    for (const rung of ANGER_LADDER) {
      expect(NINA_SYSTEM_PROMPT).toContain(rung.name)
    }
  })

  /*
   * RE-POINTED by the nina-character-tuning set. This was a walk over the whole `NEVER_SAY` array.
   * Two of its entries — the body-comment line and the threat/withdrawal line — are repealed under
   * R6, so a walk over the array would assert that a repealed rule is still in the prompt. What is
   * asserted instead is the entries NO dial can repeal, which the plan's own "Out of scope" section
   * names: the assistant-voice phrases, the bulleted list, and the medical condition. If phase 2
   * kept a tuning-aware selector over the array, phase 6 may restore the walk against THAT.
   */
  it('still forbids the assistant voice, the bulleted list and the medical claim', () => {
    for (const phrase of [
      'As an AI',
      "I'm sorry to hear that",
      'Is there anything else I can help you with?',
      'Ada lagi yang bisa gw bantu?',
      'Great job!',
      'a bulleted or numbered list of any kind',
      'a disclaimer paragraph',
      'the name of a medical condition',
    ]) {
      expect(NINA_SYSTEM_PROMPT).toContain(phrase)
    }
  })

  it('forbids "lo" being replaced by formal Indonesian (R2)', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('Never "kamu"')
    expect(NINA_SYSTEM_PROMPT).toContain('Never "Anda"')
  })

  it('states the arithmetic prohibition and names its consequence', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('Do NOT compute')
    expect(NINA_SYSTEM_PROMPT).toContain('no BMI')
    expect(NINA_SYSTEM_PROMPT).toContain('"daysAgo"')
  })

  it('spells the pace example exactly as formatPace does, with no escape character', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('7\'22"/km')
    expect(NINA_SYSTEM_PROMPT).not.toContain('\\"/km')
  })

  it("labels the runner's note as his words rather than as data (R6)", () => {
    expect(NINA_SYSTEM_PROMPT).toContain('HIS OWN WORDS')
  })

  it('keeps the not-a-doctor rule AND permits her own hyperbole', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('never diagnose')
    expect(NINA_SYSTEM_PROMPT).toContain('JANTUNG LO BAKAL PECAH TAH')
  })

  it('describes her face, so phase 12 has one source for it', () => {
    expect(NINA_APPEARANCE).toContain('ponytail')
    expect(NINA_APPEARANCE).toContain('heather-grey racerback tank')
  })

  it('never claims she is an assistant', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('not an assistant')
  })
})

/**
 * ── PLAN INVARIANT 2, IN BOTH DIRECTIONS ─────────────────────────────────────────────────────
 * "`NINA_TUNING_DEFAULTS` renders the shipping prompt." One direction is that everything which used
 * to be there still is; the other, which is the one that actually catches a mistake, is that
 * NOTHING NEW is there. A tuned clause leaking into the default render is a character change nobody
 * asked for, and it would pass every containment assertion above.
 */
describe('buildNinaSystemPrompt — the default tuning is the shipping prompt', () => {
  it('IS what NINA_SYSTEM_PROMPT is', () => {
    expect(DEFAULT_RENDER).toBe(NINA_SYSTEM_PROMPT)
  })

  it('renders no tuning-only section at the default tuning', () => {
    for (const title of ['HOW YOU FEEL', 'THE CAMERA', 'STANDING INSTRUCTIONS']) {
      expect(DEFAULT_RENDER).not.toContain(`── ${title} `)
    }
  })

  /*
   * ── THE FOUR REPEALS IN THIS PACKAGE, AT THE DEFAULT ────────────────────────────────────────
   * Step 2b removed four surviving prohibitions, and every one of them must still be present at
   * the default tuning — that is what "the defaults are the Nina who shipped" means. The tuned
   * halves are asserted in the per-dial block below.
   */
  it('keeps all four of this package\'s own repealed rules at the default tuning', () => {
    expect(DEFAULT_RENDER).toContain('Never comment on his body, and never turn them into a new number')
    expect(DEFAULT_RENDER).toContain('This is where your anger comes from.')
    expect(PROACTIVE_INSTRUCTIONS.pattern_crossed).toContain(
      'Say it at the rung "nagLevel" earns and not one higher.',
    )
    expect(PROACTIVE_INSTRUCTIONS.missed_usual_day).toContain('Do not lecture him')
    expect(PROACTIVE_INSTRUCTIONS.silence).toContain('do not sulk about the silence')
  })

  it("keeps OUTPUT_RULE's original greeting and bubble-preference lines", () => {
    expect(DEFAULT_RENDER).toContain(
      '- No greeting unless the conversation is empty or he has been gone for days.',
    )
    expect(DEFAULT_RENDER).toContain('- One bubble is the right answer more often than four.')
    expect(DEFAULT_RENDER).toContain('- Never close the conversation. A friend does not close a ticket.')
  })

  it("carries F33's five original headings, in their original order", () => {
    const original = [
      'HOW YOU TALK',
      'EXACTLY HOW YOU SOUND',
      'WHEN YOU GET ANGRY',
      'WHAT YOU NEVER SAY',
      'THE NUMBERS',
      'WHAT YOU ARE READING',
      'HOW YOU ANSWER',
    ]
    let cursor = -1
    for (const title of original) {
      const at = DEFAULT_RENDER.indexOf(`── ${title} `)
      expect(at, `${title} is missing from the default render`).toBeGreaterThan(cursor)
      cursor = at
    }
  })

  /*
   * The five headings F33 phase 2 wrote by hand are 80 columns wide. `sectionHeader` computes them
   * now, so an off-by-one in that helper would silently reflow every rule heading in the prompt.
   */
  it('pads every heading to 80 columns', () => {
    const headings = DEFAULT_RENDER.split('\n').filter((line) => line.startsWith('── '))
    expect(headings.length).toBeGreaterThan(0)
    for (const line of headings) {
      expect(line, line).toHaveLength(80)
      expect(line).toMatch(/^── [A-Z ]+ ─+$/)
    }
  })

  it('declares its section order, so a new section is a deliberate edit', () => {
    expect(NINA_SECTION_TITLES).toEqual([
      'HOW YOU TALK',
      'EXACTLY HOW YOU SOUND',
      'HOW YOU FEEL',
      'WHEN YOU GET ANGRY',
      'WHAT YOU NEVER SAY',
      'THE NUMBERS',
      'THE CAMERA',
      'WHAT YOU ARE READING',
      'HOW YOU ANSWER',
      'STANDING INSTRUCTIONS',
    ])
  })
})

/**
 * ── R4, PER DIAL ─────────────────────────────────────────────────────────────────────────────
 * "Every dial at 100 puts identifiable text in the prompt, and a test proves it per dial."
 *
 * For the three dials THIS file's module owns, the identifiable text is asserted literally. For the
 * eleven traits and the relationship, whose words `lib/nina/persona.ts` owns and which were written
 * concurrently with this test, the assertion is that the render CHANGES and GROWS — which is
 * exactly the property that fails when a dial is wired to nothing. Phase 6 tightens these to the
 * literal words once phase 2's text is in the tree.
 */
describe('buildNinaSystemPrompt — every dial reaches the prompt', () => {
  it('gives each of the eleven traits at 100 text of its own', () => {
    for (const key of Object.keys(NINA_TUNING_DEFAULTS.traits) as NinaTrait[]) {
      const render = buildNinaSystemPrompt(withTrait(key, 100))
      expect(render, `${key} at 100 changed nothing`).not.toBe(DEFAULT_RENDER)
      expect(render.length, `${key} at 100 added no text`).toBeGreaterThan(DEFAULT_RENDER.length)
    }
  })

  it('distinguishes 0 from 100 for every trait, and 0 IS the default for the six that ship at 0', () => {
    /*
     * CORRECTED IN RECONCILIATION. The draft of this case asserted that every trait at 0 differs
     * from the default render — which is false for six of the eleven, because phase 1's defaults
     * are not uniform: `anger`, `sad`, `flirty`, `steamy`, `annoying` and `anxious` ship at **0**,
     * so a slider dragged to 0 is a slider that has not moved and the render must be identical.
     * That is invariant 2, not a gap: the assertion below is the one that actually has teeth.
     */
    for (const key of Object.keys(NINA_TUNING_DEFAULTS.traits) as NinaTrait[]) {
      const low = buildNinaSystemPrompt(withTrait(key, 0))
      const high = buildNinaSystemPrompt(withTrait(key, 100))
      expect(low, `${key} renders identically at 0 and at 100`).not.toBe(high)

      const shipsAtZero = NINA_TUNING_DEFAULTS.traits[key] === 0
      if (shipsAtZero) {
        expect(low, `${key} ships at 0, so 0 must be the shipping prompt`).toBe(DEFAULT_RENDER)
      } else {
        expect(low, `${key} at 0 changed nothing`).not.toBe(DEFAULT_RENDER)
      }
    }
  })

  it('changes the opening identity block for every non-default relationship', () => {
    /* There is no relationship SECTION — `ninaIdentity` is the headerless opening block, which is
     * where today's prompt carries who he is to her. What a non-default level changes is that
     * block's text, and phase 6's matrix tightens this to the address form each level names. */
    const others = (['nobody', 'casual_friend', 'sister', 'best_friend', 'girlfriend'] as const).filter(
      (value) => value !== NINA_TUNING_DEFAULTS.relationship,
    )
    for (const relationship of others) {
      const render = buildNinaSystemPrompt(tuned({ relationship }))
      expect(render, relationship).not.toBe(DEFAULT_RENDER)
      expect(render, relationship).not.toContain('── WHO HE IS TO YOU ')
    }
  })

  it('repeals THIS package\'s three body/anger prohibitions when the dials ask (R6)', () => {
    /* Step 2b, asserted. The five words in `NUMBERS_RULE` are the highest-value edit in the set:
     * without them a `flirty: 100` paragraph ships three blocks above an absolute prohibition. */
    const body = buildNinaSystemPrompt(withTrait('flirty', 100))
    expect(body).not.toContain('Never comment on his body')
    expect(body).toContain('You may say what you think about his body')
    /* And the half that never lifts, because `lib/llm/facts.ts` records the sign error it contains. */
    expect(body).toContain('never turn them into a new number: no BMI')

    const furious = withTrait('anger', 100)
    const angry = buildNinaSystemPrompt(furious)
    expect(angry).not.toContain('This is where your anger comes from.')
    /* The floor has to hold on a quiet day: `context.ts` emits `nagLevel` only inside a pattern
     * that fired, so "mad all the time" is decided by this sentence. */
    expect(angry).toContain('even when "patterns" is empty')
    expect(buildProactiveInstruction('pattern_crossed', furious)).not.toContain('and not one higher')
    expect(buildProactiveInstruction('silence', withTrait('sad', 100))).not.toContain('do not sulk')
    expect(buildProactiveInstruction('missed_usual_day', withTrait('annoying', 100))).not.toContain(
      'Do not lecture him',
    )
  })

  it('repeals the no-greeting clause at the top of the concerned dial (R6)', () => {
    const render = buildNinaSystemPrompt(withTrait('concerned', 100))
    expect(render).not.toContain(
      '- No greeting unless the conversation is empty or he has been gone for days.',
    )
    expect(render).toContain('Ask how he is, and mean it')
    expect(render).toContain('ask how his body feels after that run')
  })

  it('moves the bubble preference with the verbosity dial, and never the 1-4 cap', () => {
    const loud = buildNinaSystemPrompt(withDial('verbosity', 100))
    expect(loud).toContain('Three or four bubbles is normal for you')
    expect(loud).not.toContain('- One bubble is the right answer more often than four.')

    const quiet = buildNinaSystemPrompt(withDial('verbosity', 0))
    expect(quiet).toContain('- One bubble. A second one only when it is doing real work.')

    /* The cap is the schema's, and no dial may move it. */
    for (const render of [loud, quiet, DEFAULT_RENDER]) {
      expect(render).toContain('- 1 to 4 bubbles.')
    }
  })

  it('opens the CAMERA section with the photo dial and closes it at the default', () => {
    const eager = buildNinaSystemPrompt(withDial('photoEagerness', 100))
    expect(eager).toContain('── THE CAMERA ')
    expect(eager).toContain('generate_image')
    expect(DEFAULT_RENDER).not.toContain('── THE CAMERA ')
  })

  it('puts the operator notes last, so they can override what is above them', () => {
    const render = buildNinaSystemPrompt(tuned({ notes: 'she calls him kapten on a Friday' }))
    expect(render).toContain('she calls him kapten on a Friday')
    expect(render.indexOf('── STANDING INSTRUCTIONS ')).toBeGreaterThan(
      render.indexOf('── HOW YOU ANSWER '),
    )
  })
})

describe('the tool schemas', () => {
  it('gives EVERY property a description — the 2026-08-21 measurement, not a convention', () => {
    const walk = (schema: Record<string, unknown>, path: string): void => {
      const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
      if (properties != null) {
        for (const [name, property] of Object.entries(properties)) {
          expect(property.description, `${path}.${name} has no description`).toBeTruthy()
          walk(property, `${path}.${name}`)
        }
      }
      const items = schema.items as Record<string, unknown> | undefined
      if (items != null) {
        expect(items.description, `${path}[] has no description`).toBeTruthy()
        walk(items, `${path}[]`)
      }
    }
    for (const tool of NINA_TOOLS) {
      expect(tool.description).toBeTruthy()
      walk(tool.input_schema as unknown as Record<string, unknown>, tool.name)
    }
  })

  it('defines the six tools phases 3, 12 and 13 expect, under these exact names', () => {
    expect(NINA_TOOLS.map((t) => t.name)).toEqual([
      'send',
      'lookup_runs',
      'compare_runs',
      'save_memory',
      'generate_image',
      'set_avatar',
    ])
  })

  it('caps the reply at 1-4 bubbles, as RU-5 chose', () => {
    const bubbles = (
      SEND_TOOL.input_schema as unknown as {
        properties: Record<string, Record<string, unknown>>
      }
    ).properties.bubbles!
    expect(bubbles.minItems).toBe(1)
    expect(bubbles.maxItems).toBe(4)
  })

  /*
   * The nina-character-tuning set proposed two tuning-aware descriptions here and declined both —
   * see `lib/nina/prompts/tools.ts`'s header. This case is what makes the decision durable: the
   * tool set stays a CONSTANT, so nothing about it can depend on a per-user setting.
   */
  it('stays a constant array — no tool schema depends on a tuning', () => {
    expect(Array.isArray(NINA_TOOLS)).toBe(true)
    expect(SEND_TOOL.description).toBe('Send your reply. Always answer with this tool.')
  })
})

describe('PROACTIVE_INSTRUCTIONS', () => {
  it("covers all four RU-15 triggers plus RU-17's avatar change", () => {
    expect(Object.keys(PROACTIVE_INSTRUCTIONS).sort()).toEqual([
      'avatar_changed',
      'missed_usual_day',
      'pattern_crossed',
      'run_committed',
      'silence',
    ])
  })

  it('tells her in every case that she is opening the conversation', () => {
    for (const text of Object.values(PROACTIVE_INSTRUCTIONS)) {
      expect(text).toContain('opening this conversation')
    }
  })

  it('appends nothing at the default tuning', () => {
    for (const kind of Object.keys(PROACTIVE_INSTRUCTIONS) as Array<
      keyof typeof PROACTIVE_INSTRUCTIONS
    >) {
      expect(buildProactiveInstruction(kind, NINA_TUNING_DEFAULTS)).toBe(
        PROACTIVE_INSTRUCTIONS[kind],
      )
    }
  })

  it('appends the concerned suffix to ALL FIVE, and keeps their own words', () => {
    const tuning = withTrait('concerned', 100)
    for (const kind of Object.keys(PROACTIVE_INSTRUCTIONS) as Array<
      keyof typeof PROACTIVE_INSTRUCTIONS
    >) {
      const text = buildProactiveInstruction(kind, tuning)
      expect(text, kind).toContain('opening this conversation')
      expect(text, kind).toContain('Before anything else, ask how he is.')
      expect(text, kind).toContain(PROACTIVE_INSTRUCTIONS[kind])
    }
  })
})

describe('NINA_PROMPT_VERSION', () => {
  it('exists and is a positive integer, so nina_turns can record it', () => {
    expect(Number.isInteger(NINA_PROMPT_VERSION)).toBe(true)
    expect(NINA_PROMPT_VERSION).toBeGreaterThan(0)
  })

  /* The prompt changed shape in the nina-character-tuning set, so the constant had to move. This
   * asserts the bump landed; the changelog comment above the constant says what it covers. */
  it('was bumped for the character tuning', () => {
    expect(NINA_PROMPT_VERSION).toBeGreaterThanOrEqual(3)
  })
})
```

**Impact:** `NEVER_SAY` is no longer imported here, which removes this test's dependency on the shape
phase 2 chooses for that array. Two assumptions about phase 1's vocabulary are load-bearing in this
file and nowhere else: the five `NinaRelationship` string values, and the fields `verbosity`,
`photoEagerness`, `notes`, `revision`. If any differs, this file and `systemDials()` are the only two
places to fix.

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck` — this is the real gate for the phase, because `NinaTurnInput.tuning`
being required means every construction site must have been found. Five exist: `lib/nina/actions.ts`,
`lib/nina/proactive.ts`, `lib/nina/turn.test.ts`, `tests/live/nina.live.test.ts`, and the fixture.
**Lint:** `npm run lint`
**Tests:** `npm test` — and specifically `npx vitest run tests/nina.prompts.test.ts lib/nina/turn.test.ts`
**Guards:** `npm run ci:llm-payload-guard` and `npm run ci:data-layer-guard`. The first matters:
`buildNinaSystemPrompt` must NOT need an entry in its `GUARDED_CALLS` table, because it is pure — if
it ever awaits anything, phase 5's Server-Component preview becomes a 13-45 s page render.

**Manual check — the default render, byte for byte. THIS IS THE REAL GATE.** Before the first edit,
capture what ships:

```
git -C <worktree> stash list >/dev/null   # ensure a clean tree first
npx tsx -e "import {NINA_SYSTEM_PROMPT} from './lib/nina/prompts';process.stdout.write(NINA_SYSTEM_PROMPT)" > /tmp/nina-prompt-v2.txt
```

After the phase, re-run it into `/tmp/nina-prompt-v3.txt` and `diff` the two.

**The expected diff is ONE ADDED SENTENCE, and nothing else:**

```
+ Sometimes "bestie" instead of the nickname — you two are that close.
```

inside `NAME_RULES`. That is the whole stated departure from byte-identity in the set — R2 names
`bestie` for `best_friend`, `best_friend` is the default relationship, and `NAME_RULES` is one of
phase 2's repeals so its shape changes by definition. **Phase 2's Interface Contract is the
canonical statement of it**; phase 1's contract and this check both point there rather than each
asserting their own version of it.

Anything else in that diff is a bug in this phase or in phase 2: no reflowed heading, no lost blank
line, no reordered block, no new heading, no changed clause in `NUMBERS_RULE`, `CONTEXT_GUIDE` or any
of the five trigger texts. **A one-column heading change or a doubled blank line is the failure mode
of Step 3's assembler and it does not fail any test on its own** — the seven shipping headings are
all exactly 80 characters wide (verified), which is what the width assertion pins.

**Manual check — it reaches the model.** With a tuning row saved at `concerned: 100`, send one chat
message and read `nina_turns` for that turn: `prompt_version` is 3 and `tuning_revision` is the row's
revision. Then run the cron path (`/api/cron/nina`) and confirm the proactive turn wrote the same
revision — a null there with a non-null on the chat turn means Step 10 was missed on one of its two
sites, which is the specific bug this phase exists to avoid.

**Exit criteria:**

1. `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS) === NINA_SYSTEM_PROMPT`, and the default render
   contains none of the three tuning-only headings (`HOW YOU FEEL`, `THE CAMERA`,
   `STANDING INSTRUCTIONS`). The default render differs from `git show HEAD`'s prompt by exactly the
   one `bestie` sentence.
2. Each of the eleven traits renders differently at 0 than at 100; each non-default relationship,
   `dials.verbosity` at both ends, `dials.photoEagerness` at 100 and a non-empty `notes` all change
   the render; and a test proves each one. **A trait dragged to its own default does NOT change the
   render** — six of the eleven ship at 0 — and the same test asserts that, because it is invariant
   2 per key rather than an exception to it.
3. `lib/nina/turn.ts` contains no reference to `NINA_SYSTEM_PROMPT`; the system string on every
   model call of a turn is the same assembled string.
4. Both the chat action and **both** proactive entry points read the tuning and pass it.
5. `nina_turns` carries the tuning revision beside the prompt version, for a chat turn and for a
   proactive turn.
6. `NINA_PROMPT_VERSION === 3`, with its changelog comment, and no other phase in the set has
   touched that constant.
7. No byte of `lib/nina/prompts/tools.ts`'s schemas changed; `NINA_TOOLS` is still a constant array.
8. All four of Step 2b's surviving prohibitions are gone at the top of the dial that repeals them,
   and all four are still present at the default tuning. `rg -n 'Never comment on his body' lib/nina/`
   returns only comment text and the default-band string.
9. `lib/nina/gateway.ts`'s `dbNinaTurnStore` passes `tuningRevision` through, so a chat turn and a
   proactive turn both write a non-NULL `nina_turns.tuning_revision`.
8. `npm run lint`, `npm run typecheck`, `npm test`, `npm run ci:llm-payload-guard` all pass.

## Handoffs

**To Phase 2 (`lib/nina/persona.ts`) — RECONCILED, and the checklist is now a match rather than a
request.** Phase 2's landed names are in my Requires table and my imports and call sites use them.
The three properties I still depend on, in order of blast radius:

1. `ninaTraitsBlock` and `ninaOperatorNotesBlock` **must return `''` at `NINA_TUNING_DEFAULTS`**, by
   skipping each key's own identity band — which is `off` for six traits and `low` for `profanity`,
   not `mid`. Prose there breaks plan invariant 2 and my test says so by name.
2. The unchanged constants keep their names.
3. Every function form is `(tuning: NinaTuning) => string`.
4. **`BODY_REPEALED_BY` is exported**, because Step 2b imports it rather than restating the repeal
   test for `NUMBERS_RULE`. Phase 2's contract now lists it as exported for that purpose.

**To Phase 2 — the `concerned` overlap, resolved: three clauses, three different jobs.** I write
`OUTPUT_RULE`'s greeting line (how she *answers*) and the proactive suffix (one *opening* turn).
Phase 2's `ninaTraitsBlock` writes the third, about what she *asks after* — its `concerned: high`
band is *"kaki lo gimana abis lari pagi ini?"*, which is a subject, not a format. Read together they
compose rather than repeat, and none of them contradicts another. Phase 6's matrix walks all three
in one render, which is the check.

**To Phase 4 (the camera) — three things.**

1. **`NinaToolContext` does not gain the tuning, and neither does `turn.ts`'s `toolCtx` — AGREED,
   and this is now the stated boundary in both plans.** `lib/nina/tools.ts` is touched by no phase
   in this set and `toolCtx` is in my file, so a `ctx.tuning` field would be a two-owner edit for
   one field. Phase 4 reads it inside its own generators instead — `generateNinaSelfie` and
   `generateNinaAvatar` — which is also what keeps `lib/nina/avatartools.ts` at **zero edits**
   (verified: `handleSetAvatar` passes only `userId` / `scene` / `source` and delegates the whole
   prompt build to `generateNinaAvatar`). No collision.
2. **R5 needs no new prompt copy from me, and I have not written any.** `GENERATE_IMAGE_TOOL`'s
   description already says *"Use it when he asks, or when you promised one"*, which is the
   photo-as-reward occasion; and `SET_AVATAR_TOOL`'s says *"when a promise you made has come true"*.
   My `── THE CAMERA ──` block is scoped to eagerness (R4's dial) and says nothing about promises,
   because R5 is yours and is not in my `satisfies`. If your work does need a reward-offer clause in
   the system text, it lands in `buildCameraBlock` — which I shaped as a line list precisely so one
   more line is a one-line change — and it comes back through this file, not through `tools.ts`.
3. `NINA_APPEARANCE` is untouched here; the wardrobe seam is between you and phase 2.

**To Phase 5 (the admin panel).** `buildNinaSystemPrompt(tuning: NinaTuning): string` is exported
from both `@/lib/nina/prompts` and `@/lib/nina/prompts/system`. Pure, synchronous, no `server-only`,
no database, no model call — safe to call in a Server Component's render, which is plan invariant 5
and `check-llm-payload-boundary.mjs` Rule 2. It is **not** safe in a `'use client'` file, because the
barrel re-exports `./tools`, which type-imports `@anthropic-ai/sdk`; render the preview on the server
and pass the string down, as the phase index already says. `NINA_SECTION_TITLES` is exported if the
panel wants to render the preview with collapsible sections.

**To Phase 6 (the sweep) — and one thing phase 6 takes FROM me, by exception.**

**`lib/nina/actions.ts` gets one property from phase 6, and that is deliberate.** Phase 6 makes
`DistillInput.relationship` optional so the librarian stops filing *"he calls her sayang"* as a fact
about him, and the value has to be passed at the `distillNinaMemory(...)` call inside `after()` —
which is in **my** file. I cannot pass a field that does not exist yet (phase 6 runs after me), and
phase 6 cannot leave the seam open (an optional field nobody fills is a fix that does not fix
anything). So the index gives phase 6 that **one property, at that one call site**, and nothing else
in `actions.ts`. The `tuning` I read in the `Promise.all` is already in scope there, so it is
literally `relationship: tuning.relationship`. Recorded in both plans and in the index's Owns lines.

**`tests/nina.prompts.test.ts` is mine first and phase 6's second.** I rewrite the file; phase 6
appends its matrix to what I leave. Phase 6's plan quotes the *post-rewrite* file, reuses my `tuned`
/ `withTrait` / `withDial` helpers rather than declaring its own, and does not re-assert what I
already assert (the per-relationship distinguishability and the per-trait 0-vs-100 pair are mine;
the per-relationship ADDRESS FORM and the distiller are phase 6's).

**Four things I left.**

1. **Do not "finish" the two declined edits in `lib/nina/prompts/tools.ts`.** The header records the
   decision and the measurement it rests on. If the sweep concludes the dials belong there after
   all, that is a new card with a live-measurement plan, not a tidy-up.
2. **Do not touch `NINA_PROMPT_VERSION`.** It is 3, bumped here, once, for the whole set.
3. **A byte-exact snapshot of the default render.** I asserted containment and "no new section at
   defaults" rather than equality with a committed copy of the v2 text, because phase 2's repeal
   semantics — whether a repealed `NEVER_SAY` entry returns at a low `flirty` — were being decided
   concurrently and a byte-exact fixture written against a guess would have left the tree red for
   somebody else. Once phase 2 has landed, a `toMatchSnapshot()` on
   `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` is cheap and is the right long-term guard.
4. **Tighten the per-dial tests to literal words.** My eleven-trait cases assert "the render changed
   and grew". With phase 2's text in the tree they should assert the actual sentence each dial adds,
   and the `NEVER_SAY` walk can be restored against whatever selector phase 2 exports.

**Not done, and reconciled to a fact rather than a handoff: `lib/nina/.workflows/` DOES NOT
EXIST.** Verified — the repo has exactly three `package_readme.md` files (`lib/db`, `lib/admin`,
`components/admin`) and **none of them mentions `NINA_SYSTEM_PROMPT`, the persona constants or
`lib/nina/prompts` at all**. So there is no stale readme for this phase to have made stale, and
nothing for the set to update. Writing one for the largest package in the repo is a `/update-readme`
card of its own — phase 6's H-5, and it stays out of this set.

## Rollback

One commit on `feature/nina-character-tuning`, so `git revert <sha>` backs it out — with one caveat
the plan index already states and one it does not.

**The stated one:** reverting puts `NINA_PROMPT_VERSION` back to 2, which makes historical
`nina_turns` rows claim version 2 for turns that ran on 3. If only the assembly has to go, revert
Steps 1-3, 6, 7, 9, 10 and **leave Step 5's bump in place** — a version that only ever moves forward
is worth more than a version that is accurate about a reverted commit.

**The one it does not:** this revert must happen **before or together with** phase 1's, never after.
Reverting phase 3 alone leaves `readNinaTuning` unread and the `nina_turns.tuning_revision` column
unwritten, which is inert and fine. Reverting phase 1 while this phase stands removes
`lib/nina/tuning.ts` from under `NinaTurnInput.tuning` and the tree does not compile.

**The behavioural rollback is cheaper than either, and it is the one to reach for first:** set every
dial back to its default on `/admin/nina`. Plan invariant 2 and the tests in Step 14 are the
guarantee that this makes her exactly the Nina who shipped before the set — no deploy, no revert, no
migration.
