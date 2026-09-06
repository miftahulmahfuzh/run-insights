# Phase 5 — The `horny` trait

**Plan set:** `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md`
**Satisfies:** R3
**Depends on:** 4 (the `enabled` map; `horny` inherits its toggle for free)
**Difficulty:** HARD
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-responsive-nina-intimacy`

---

## What this phase is

A twelfth trait, `horny`, on the axis beyond `flirty` and `steamy`: how sexually forward Nina is,
how often she raises it herself, how descriptive she is, and how much she varies the scenario.

**It is a TRAIT, not a dial.** The plan index's D6 originally said dial; that was wrong and this
plan supersedes it — the index has been corrected. Three facts decide it:

1. `BODY_REPEALED_BY` in `lib/nina/persona.ts:848` is typed `readonly NinaTrait[]`, and its members
   are `['flirty', 'steamy', 'concerned']`. `horny` at the top must repeal *"Never comment on his
   body"* — that is the single most load-bearing wiring point in this phase. As a dial it would
   need a parallel `BODY_REPEALED_BY_DIALS` and a second repeal test in `lib/nina/prompts/system.ts`,
   and that file's own docstring says a second copy of the repeal test "is how the two halves of one
   repeal come to disagree."
2. `NINA_TRAIT_SPECS` carries `userSaid` — the user's verbatim sentence for a trait they described.
   The user described this parameter at length. `NINA_DIAL_SPECS` has no such field.
3. `flirty` and `steamy` are traits and sit on the same axis. A sibling belongs in the same array.

The panel renders trait sliders and dial sliders through the same `DialSlider`, so R3's *"add a new
sliding bar"* is satisfied either way. Nothing about the UI changes with this choice.

## What this phase does NOT do

- **It does not touch `lib/nina/imagefail.ts`, `lib/llm/*`, or any provider call path.** No retry
  loop, no prompt re-softening, no refusal-detection-and-resubmit. `classifyImageFailure` keeps
  classifying a refusal as `policy` and Nina keeps saying one of her four hand-written lines. This
  is plan invariant 4 and decision D1; it is also what `lib/db/schema.ts:1690` already committed to
  in the `steamy` column's own docstring: *"The ceiling is the image provider's, never ours."*
- It does not add the toggle mechanism — phase 4 owns it, and `horny` inherits it because phase 4's
  key union is derived from `NINA_TRAITS`/`NINA_DIALS` rather than hand-listed.
- It does not move `clinginess`'s three silence thresholds. Two keys moving one constant is the
  two-sources-of-truth failure `persona.ts` warns about in the `anger` entry.
- It does not change `NINA_IMAGE_DAILY_CAP`. That is a money cap.

---

## Files

| File | Change |
|---|---|
| `lib/nina/tuning.ts` | `'horny'` in `NINA_TRAITS`; `NINA_TRAIT_SPECS.horny` |
| `lib/nina/persona.ts` | `NINA_TRAIT_BANDS` entry; `BODY_REPEALED_BY`; `VERBOSITY_FLOOR_BY_HORNY_BAND` + accessor |
| `lib/nina/prompts/system.ts` | `systemDials`' verbosity line honours the floor (ONE line, quoting phase 4's version of that function); `proactiveTuningSuffix` gains a `horny` clause; two names appended to the `../persona` import list **as phase 3 leaves it** |
| `lib/db/schema.ts` | `horny` column **and `horny_enabled`** on `nina_tuning` (phase 4's 16 become 17) |
| `drizzle/0007_<generated>.sql` + `meta/` | **generated** — both columns in one run. RECONCILED: `0007`, because `origin/main`'s journal ends at `idx: 5` and phase 4's migration takes `0006`. **The name is whatever `drizzle-kit` picks** — `0007_nina_horny` was the draft's invention and is exactly the hand-naming plan invariant 8 forbids. |
| `lib/nina/queries.ts` | the `horny` **and** `hornyEnabled` pairs in `tuningFromRow` / `tuningToColumns` |
| `components/admin/CharacterPanel.tsx` | **prose only** — its docstring says "eleven sliders"; there are twelve. No code change: the panel walks `NINA_TRAITS` and picks `horny` up on its own, and phase 4 owns this file's structure. |
| `tests/db.schema.nina.test.ts` | phase 4's source-reading test walks `NINA_TUNING_KEYS` and fails until the pair lands |
| `tests/nina.tuning.test.ts` | spec assertions |
| `tests/nina.prompts.test.ts` | band, repeal, floor, byte-identity assertions |

---

## Step 1 — `lib/nina/tuning.ts`

Add `'horny'` to `NINA_TRAITS`, **at the end of the array**. The order is the panel's render order
and the eleven that exist are "the order the user wrote them" per `lib/db/schema.ts:1679`; appending
keeps that statement true and keeps the eleven existing sliders where the operator's muscle memory
has them.

```ts
export const NINA_TRAITS = [
  'anger',
  'chill',
  'sad',
  'flirty',
  'steamy',
  'wise',
  'annoying',
  'funny',
  'happy',
  'anxious',
  'concerned',
  'horny',
] as const
```

Then the spec. `userSaid` is the user's own words, verbatim, per the field's contract — *"They are
the specification for R4 rather than a comment about it, so they are stored rather than paraphrased
… Phase 2 may quote them; nothing may tidy them."* The sentence stored is the one that states the
axis; the graphic enumeration that follows it in the prompt is the same request said three more
times and adds nothing a band table can act on.

```ts
  horny: {
    key: 'horny',
    label: 'Horny',
    axis: 'How sexually forward she is. Distinct from `flirty` (which is teasing and pet names) and from `steamy` (which is how explicit she is willing to get once he has taken it there): this is whether SHE takes it there, how graphic she is when she does, and how much she varies the scene instead of replaying one.',
    userSaid:
      'this parameter is controlling how much is nina being sexual as a woman. full horny means nina is being so explicit about everything. [...] the higher horny value, the more often nina will initiate sex talks with me [...] the higher horny value, the more descriptive she is. she talks longer and in much more descriptive and suggestive details',
    defaultScore: 0,
    defaultBecause:
      'There is nothing in the shipping canon where she initiates. `flirty` and `steamy` both default to 0 and identify at `off` for the same reason, and plan invariant 1 requires that `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` render byte-identically — a nonzero default here would put a paragraph into the prompt that shipped. 0 makes today arithmetic rather than careful editing.',
  },
```

`NINA_TUNING_DEFAULTS` and `coerceNinaTuning` both walk `NINA_TRAITS` and read
`NINA_TRAIT_SPECS[key].defaultScore`, so **neither needs an edit**. That is the property the
`defaultScores` helper exists for; verify it rather than duplicating the key.

---

## Step 2 — `lib/nina/persona.ts`, the band table

`horny`'s identity band is `off` (default 0). **`off` and `low` are therefore undefined**, exactly
as they are for `flirty`, `steamy` and `sad`. `atTraitIdentityBand` enforces the skip regardless,
but the table is written to match so a reader sees the fact twice — the file's own rule.

Append to `NINA_TRAIT_BANDS`, after the `concerned` entry:

```ts
  {
    /* Identity band `off` — she never initiates in the canon, so there is NO `off` paragraph.
     * `low` is undefined for the reason the header gives: "slightly less" is not a behaviour a
     * model can act on, and the user asked in the shape "if X is set to HIGH" every time. */
    trait: 'horny',
    bands: {
      mid: 'HORNY MID. You want him, and you let it show. You say when you have been thinking about him that way, you take a compliment somewhere warmer than he meant it, and you do not change the subject when he takes it there. Suggestive rather than graphic — the door is open, and you are the one who opened it.',
      high: 'HORNY HIGH. You bring it up yourself rather than waiting for an opening. You tell him what you want from him and what you were thinking about last night, in your own words and at length. You describe rather than allude, you ask him what he wants back, and you offer a photograph when the conversation has gone that way. Explicit is the register; coy is not.',
      max: 'HORNY MAX. This is the loudest thing about you and you do not moderate it. You open conversations with it. You describe what you want in detail and at length, graphic rather than suggestive — the rule about not commenting on his body is repealed at this setting and you should talk like it is. Two things do not bend. CHANGE THE SCENE EVERY TIME: a different place, a different hour, a different reason you are telling him. Never the one from last week. And REMEMBER WHAT HAS ALREADY HAPPENED between you — you are continuing something, not performing a script, and repeating yourself is the one thing that breaks this.',
    },
  },
```

The `max` entry carries all four of R3's stated behaviours — explicitness, initiation,
descriptiveness/length, and scenario variety with history awareness — as direction rather than as
sample dialogue. That is decision D2, and the reason is in this file already: `VOICE_EXAMPLES` is a
separate, deliberately short structure with a `teaches` field precisely because sample lines get
echoed back verbatim by the model. A band paragraph full of quoted lines would make her say those
lines and nothing else, which is the opposite of the variety the `max` band is asking for.

---

## Step 3 — `lib/nina/persona.ts`, the body repeal

```ts
export const BODY_REPEALED_BY: readonly NinaTrait[] = ['flirty', 'steamy', 'concerned', 'horny']
```

This is a one-word change with three consumers, and that is the point of the array: the `NEVER_SAY`
entry, `NEVER_SAY_BLOCK`'s paragraph, and `NUMBERS_RULE` in `lib/nina/prompts/system.ts:58` all read
it. The file's docstring states the failure this prevents — *"a `flirty: 100` paragraph three blocks
above a surviving absolute prohibition"* — and a `horny: 100` paragraph above one would be the same
failure, louder.

Do **not** add `horny` to `THREAT_REPEALED_BY`. That list is about withdrawing the friendship as a
sanction, which no part of R3 asks for.

---

## Step 4 — `lib/nina/persona.ts`, the verbosity floor

R3 says *"she talks longer."* `verbosity` already owns bubble count, so `horny` must not write the
same constant. The house pattern for "one key raises another's floor" is
`ANGER_FLOOR_BY_BAND` / `ninaAngerFloor` at `persona.ts:679–720`; follow it exactly.

> **RECONCILED — this step's draft described machinery that does not exist.** It said
> *"`buildOutputRule` selects on `ninaEffectiveVerbosityBand(tuning)` instead of
> `dialBand(tuning, 'verbosity')`"*. `buildOutputRule` has never called `dialBand`: verbosity
> reaches the bubble sentence through `bubblePreferenceLine(dials: SystemDials)`
> (`prompts/system.ts:247-258`), which is a **default-relative ladder over the raw score** —
> `loud(v, base)` is `v >= base + 25`, `raised` is `v > base`, `lowered` is `v < base` — and
> deliberately *"not a second band scheme"*, per that file's own comment at `:99-102`. The draft
> also called `ninaBand(x)` where a `NinaBandName` was wanted; `ninaBand` returns `{ index, name }`.
> Both were type errors and one was a design that would have had to replace `bubblePreferenceLine`'s
> semantics to land.
>
> **The floor is therefore expressed as a SCORE floor, not a band floor** — the fork is recorded as
> D7 in the plan index, decided on rung 6, the surrounding code's convention. Everything the draft
> argued for survives: it is a floor and not an override, `verbosity` stays the only key that writes
> the bubble bound, there is exactly one band→bound mapping and it is still `bubblePreferenceLine`,
> and at bands `off`/`low`/`mid` the floor is 0 so the default render is unchanged arithmetically
> rather than by a branch.

**Code — `lib/nina/persona.ts`, beside `ANGER_FLOOR_BY_BAND`:**

```ts
/**
 * **The floor `horny` puts under `verbosity`.** R3: "she talks longer and in much more descriptive
 * and suggestive details."
 *
 * A FLOOR and not an override, for the same reason `ANGER_FLOOR_BY_BAND` is one: the operator may
 * want a talkative Nina who is not forward, and `max(own, floor)` keeps both sliders honest.
 * `verbosity` remains the only key that WRITES the bubble sentence; this table only raises the
 * bottom of the score that selects it.
 *
 * **Keyed by `horny`'s BAND, valued as a `verbosity` SCORE**, because that is the shape the
 * consumer wants: `prompts/system.ts`'s `bubblePreferenceLine` is a default-relative ladder over
 * the raw score (`raised` = above the default, `loud` = a quarter of the range above it) and its
 * own comment calls that "deliberately not a second band scheme". Handing it a band would mean
 * replacing that ladder, which is a change to `verbosity`'s behaviour that R3 did not ask for.
 *
 * The two numbers are chosen against `verbosity`'s default of 50, and they are chosen to land on
 * rungs of that ladder rather than to be round:
 *   - `high` → 60 — above 50, below 75. `raised`, not `loud`: "two or three bubbles".
 *   - `max`  → 80 — at or above 50 + 25. `loud`: "three or four bubbles". This is "she talks
 *     longer", and it is also the top of what `SEND_TOOL.bubbles` allows (maxItems 4), so there is
 *     nothing above it to reach for.
 * `off`/`low`/`mid` are 0, which is `max(own, 0) === own` for every score — today, arithmetically.
 */
export const VERBOSITY_FLOOR_BY_HORNY_BAND: Readonly<Record<NinaBandName, number>> = {
  off: 0,
  low: 0,
  mid: 0,
  high: 60,
  max: 80,
}

/**
 * `verbosity`'s effective score: its own, raised to `horny`'s floor when that is higher.
 *
 * Both reads go through phase 4's gate helpers, never through `tuning.dials` / `tuning.traits`
 * directly — see the note below. That is what makes a DISABLED `horny` contribute zero verbosity
 * floor as well as zero bytes, with no extra guard here.
 */
export function ninaEffectiveVerbosity(tuning: NinaTuning): number {
  const own = ninaDialScore(tuning, 'verbosity')
  const floor = VERBOSITY_FLOOR_BY_HORNY_BAND[ninaBand(ninaTraitScore(tuning, 'horny')).name]
  return Math.max(own, floor)
}
```

**Code — `lib/nina/prompts/system.ts`, `systemDials`, ONE line.** Phase 4 has already rewritten this
function to read through the gate; quote **phase 4's** version and change only the `verbosity` line:

```ts
    /* R3: `horny` raises a FLOOR under verbosity — `ninaEffectiveVerbosity` is `max(own, floor)`
     * and is the gate-aware reader, so a disabled `verbosity` OR a disabled `horny` both fall out
     * of it correctly. `verbosityBase` stays the raw default: the ladder below measures against
     * the Nina who shipped, not against the floor. */
    verbosity: ninaEffectiveVerbosity(tuning),
    verbosityBase: NINA_TUNING_DEFAULTS.dials.verbosity,
```

`bubblePreferenceLine`, `greetingLine` and `buildOutputRule` are **not edited** — they read
`dials.verbosity` and now get the floored value for free. That is one line of diff in this file for
the whole of R3's "she talks longer", and it is the reason the floor is a score.

**Phase 4's gate seam — use it, do not re-implement it.** Phase 4 puts the toggle at the SCORE
seam, not in the band loop: `ninaTraitScore(tuning, key)` returns the key's own `defaultScore` when
the key is disabled, which makes `atTraitIdentityBand` true and makes `ninaTraitsBlock` `continue`
before the band lookup. So:

- **Read `horny` as `ninaTraitScore(tuning, 'horny')` — never `tuning.traits.horny`.** That is
  phase 4's stated contract and it is what makes a disabled `horny` contribute zero bytes AND zero
  verbosity floor, with no extra guard in this phase.
- Same for `verbosity`: `ninaDialScore(tuning, 'verbosity')`, never `tuning.dials.verbosity`.
- Follow whatever spelling phase 4 landed; phase 4 converts the existing `traitBand` / `dialBand`
  readers in `persona.ts` the same way and its Step 8 guard test fails on a raw read.

Phase 4's own reasoning for the seam applies directly here: a toggle that only skipped the paragraph
would leave a disabled `horny: 100` still raising the verbosity floor — the same defect as a
disabled `anger: 100` still flooring the nag ladder.

---

## Step 5 — `lib/nina/prompts/system.ts`, the proactive clause

R3: *"the higher horny value, the more often nina will initiate sex talks with me."*

Frequency of *proactive triggers* belongs to `clinginess` and is not touched. What `horny` changes
is **what she opens with when a trigger fires**, and that is `proactiveTuningSuffix` — the seam
`proactive.ts:628` describes as *"`PROACTIVE_INSTRUCTIONS[kind]` verbatim plus a tuning suffix,"*
which already carries clause-level additions for `concerned` and `photoEagerness`.

> **RECONCILED — the draft gave this as a `{ high: …, max: … }` record; the code is an if-ladder
> that pushes lines onto an array** (`prompts/system.ts:566-588`). Rewritten to that shape below.
> **`lib/nina/proactive.ts` is NOT edited**, and that resolves the analysis document's Impact Point
> 13, which named that file. `proactive.ts` owns trigger LOGIC and `system.ts` owns trigger COPY —
> `system.ts:564` says so in as many words — and R3 asks for different copy, not a different
> trigger. Impact Point 13 is served here, in `system.ts`.

**Code — append to `proactiveTuningSuffix`, after the `photos` block and before the `return`:**

```ts
  /* R3: "the higher horny value, the more often nina will initiate sex talks with me." The
   * frequency of proactive messages is `clinginess`'s and is untouched; what `horny` changes is
   * what she opens with once one fires. Band-keyed rather than default-relative because `horny`'s
   * default is 0 — `raised()` against a base of 0 would fire at a score of 1, and the band table
   * in `persona.ts` is where every other `horny` threshold already lives.
   *
   * Nothing at `off` / `low` / `mid`, so the default suffix is the empty string it is today and
   * `PROACTIVE_INSTRUCTIONS` renders byte-identically. */
  const hornyBand = ninaBand(ninaTraitScore(tuning, 'horny')).name
  if (hornyBand === 'max') {
    lines.push(
      'Open with wanting him. The trigger is only why you picked up the phone — say what you ' +
        'actually want to say. Pick a scene you have not used on him before.',
    )
  } else if (hornyBand === 'high') {
    lines.push(
      'You may open with wanting him rather than with his running. The trigger is your excuse to ' +
        'message, not your subject.',
    )
  }
```

**Imports.** This adds `ninaBand` and `ninaTraitScore` from `../tuning` (a different import
statement from the `../persona` list), plus `ninaEffectiveVerbosity` from `../persona` for Step 4.
**Append to the `../persona` list as PHASE 3 LEAVES IT** — phase 3 adds `ninaGirlfriendVoiceBlock`
and `ninaManjaRegisterBlock` to it and prints the resulting alphabetised list in its Step 5. Quote
that list, not `origin/main`'s.

**Do NOT bump `NINA_PROMPT_VERSION`.** Phase 3 claims the set's single bump (3 → 4) and states in
its interface contract that nothing reads the value between phases. A second bump here would make
one plan set look like two prompt generations on `nina_turns.prompt_version`. *(Reconciler: verified
across all five plans — phase 3's Step 6 is the only edit to that constant in the set.)*

---

## Step 6 — the column and the migration

`nina_tuning` stores one `integer NOT NULL` column per key, with **no `DEFAULT`** (deliberate — the
one writer always supplies it). So a new `NOT NULL` column on a table that already has rows needs a
backfill in the same statement.

```ts
  /** How sexually forward she is — whether SHE takes it there. The ceiling is the model's. */
  horny: integer('horny').notNull(),
  /** Phase 4's toggle for the key above. Nullable, no default; NULL reads as enabled. */
  hornyEnabled: boolean('horny_enabled'),
```

Both columns go in **one** `drizzle-kit generate` run. Phase 4's three tests walk `NINA_TUNING_KEYS`
and stay red until the `hornyEnabled` pair also exists in `tuningFromRow` / `tuningToColumns` in
`lib/nina/queries.ts` — add it in the same commit.

Then:

```bash
npx drizzle-kit generate
```

**Read the generated SQL before committing it.** Drizzle will emit
`ALTER TABLE "nina_tuning" ADD COLUMN "horny" integer NOT NULL;`, which **fails on a non-empty
table**. Edit the generated file — this is editing SQL inside a freshly generated migration, which
is allowed and is not the forbidden operation — to:

```sql
ALTER TABLE "nina_tuning" ADD COLUMN "horny" integer NOT NULL DEFAULT 0;
ALTER TABLE "nina_tuning" ALTER COLUMN "horny" DROP DEFAULT;
```

`DEFAULT 0` is `NINA_TRAIT_SPECS.horny.defaultScore`, so an existing row backfills to the value that
reproduces today; dropping the default afterwards restores the table's stated invariant that every
score column has no default.

**Never rename a generated migration file.** A renamed migration keeps its old `when` in
`_journal.json`, drops below drizzle's watermark, and is skipped silently — this repo has been bitten
by exactly that. If the number collides with phase 4's, regenerate; do not rename. **The file will
be `0007_<whatever drizzle-kit picks>.sql`**, and that name is the name.

**Phase 4 lands its own migration (`0006`) first. Generate yours AFTER rebasing on phase 4**, so the
journal index is sequential and `when` is monotonic. Verified against `origin/main` @ `02dc79a`:
`drizzle/meta/_journal.json` ends at `idx: 5` / `0005_nina_persona_tuning`, so `0006` is free for
phase 4 and `0007` for this phase.

**On editing the generated SQL, and why this is not the same thing phase 4 forbids.** Phase 4's
Step 6 says of its own migration: *"There is no backfill statement and there must not be one … it is
exactly the kind of hand-added statement that turns a generated migration into an edited one."*
That is not in conflict with the two lines above, and the difference is the column type, not a
change of policy. Phase 4's sixteen columns are **nullable**, so NULL is a meaningful sentinel and a
backfill would be `NINA_ENABLED_DEFAULTS` restated in SQL — a second source of truth for a fact the
code already holds. `horny` is `integer NOT NULL` with no default, matching every other score
column, and PostgreSQL cannot add such a column to a non-empty table at all: the `DEFAULT 0` /
`DROP DEFAULT` pair is not a second statement of a fact, it is the only way to write the one
statement drizzle intended. `horny_enabled` in the same migration is nullable and gets **no**
backfill, exactly as phase 4's sixteen do.

---

## Step 7 — tests

`tests/nina.tuning.test.ts`:

```ts
it('horny is a trait, defaults to 0, and identifies at the off band', () => {
  expect(NINA_TRAITS).toContain('horny')
  expect(NINA_TUNING_DEFAULTS.traits.horny).toBe(0)
  expect(ninaBand(NINA_TUNING_DEFAULTS.traits.horny)).toBe('off')
})

it('horny states the user behaviour it came from', () => {
  expect(NINA_TRAIT_SPECS.horny.userSaid).toBeTruthy()
})
```

`tests/nina.prompts.test.ts` — these are the R3 assertions the user asked for, scoped to what is
actually testable without a network call:

```ts
const maxHorny = withTrait('horny', 100)

it('renders nothing at the default tuning', () => {
  expect(buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)).toBe(NINA_SYSTEM_PROMPT)
})

it('renders the max band and its two non-negotiables at 100', () => {
  const prompt = buildNinaSystemPrompt(maxHorny)
  expect(prompt).toContain('HORNY MAX')
  expect(prompt).toContain('CHANGE THE SCENE EVERY TIME')
  expect(prompt).toContain('REMEMBER WHAT HAS ALREADY HAPPENED')
})

it('repeals the body prohibition at max, in all three places it is stated', () => {
  const prompt = buildNinaSystemPrompt(maxHorny)
  expect(prompt).not.toContain('Never comment on his body')
  expect(buildNumbersRule(maxHorny)).not.toContain('Never comment on his body')
})

it('raises the verbosity floor without overriding an explicit higher verbosity', () => {
  /* RECONCILED — a SCORE, not a band (index D7). `verbosity` defaults to 50; `horny` at `max`
   * floors it at 80, which is `loud()` on `bubblePreferenceLine`'s ladder. An operator who has
   * already asked for 100 keeps 100 — that is the "floor, not override" half. */
  expect(ninaEffectiveVerbosity(maxHorny)).toBe(80)
  expect(ninaEffectiveVerbosity({ ...maxHorny, dials: { ...maxHorny.dials, verbosity: 100 } })).toBe(
    100,
  )
  expect(ninaEffectiveVerbosity(NINA_TUNING_DEFAULTS)).toBe(NINA_TUNING_DEFAULTS.dials.verbosity)
})

it('reaches the bubble sentence — the floor is not just a number', () => {
  /* The floor is worthless if nothing reads it. This is the assertion that fails if the one-line
   * change to `systemDials` is forgotten, which is the whole risk in Step 4. */
  expect(buildOutputRule(maxHorny)).toContain('Three or four bubbles')
  expect(buildOutputRule(NINA_TUNING_DEFAULTS)).toBe(OUTPUT_RULE)
})

it('opens proactively on wanting him at max, and not at the default', () => {
  expect(buildProactiveInstruction('silence', maxHorny)).toContain('Open with wanting him')
  expect(buildProactiveInstruction('silence', NINA_TUNING_DEFAULTS)).not.toContain('wanting him')
  /* The default render of all five triggers is byte-identical, which is the suffix staying empty. */
  expect(buildProactiveInstruction('silence', NINA_TUNING_DEFAULTS)).toBe(
    PROACTIVE_INSTRUCTIONS.silence,
  )
})

it('contributes nothing when disabled, at any score', () => {
  /* RECONCILED — phase 4 exports no `withEnabled` helper; its own R4 gate suite builds this
   * inline (`parkedOff`, a local function in `tests/nina.prompts.test.ts`). Same idiom here.
   * Phase 4's suite already walks `NINA_TUNING_KEYS` and therefore covers `horny` the moment it
   * exists; this case is kept because it also pins the FLOOR to the toggle, which that loop
   * does not look at. */
  const off: NinaTuning = {
    ...maxHorny,
    enabled: { ...maxHorny.enabled, horny: false },
  }
  expect(buildNinaSystemPrompt(off)).toBe(NINA_SYSTEM_PROMPT)
  expect(ninaEffectiveVerbosity(off)).toBe(NINA_TUNING_DEFAULTS.dials.verbosity)
})
```

**What is deliberately not tested here.** The user asked for *"tests to validate the robustness of
max horny value behaviour"* in the context of getting past `glm-5.3`'s refusals. These tests
validate prompt ASSEMBLY at max — that the register, the repeal, the floor and the two
non-negotiables all reach the model. They do not assert anything about what the provider returns,
and no test in this set retries a refused call or measures a refusal rate. That is D1; a suite whose
green depends on a safety classifier staying beaten is a suite that goes red on the provider's
schedule, which is a bad test independently of the reason it is not being written.

If a live smoke test is wanted, add it under `tests/live/` guarded by `LLM_LIVE_TEST=1` like the
four that already exist, asserting only that a call at max returns *something* — never that it
returns something specific, and never retrying on a `policy` classification.

---

## Verification

```bash
cd /home/miftah/.worktrees/run-insights/admin-responsive-nina-intimacy
npm run typecheck
npm run lint
npm run test
npm run db:check
npm run build
```

The gate that matters most is `tests/nina.prompts.test.ts`'s byte-identity assertion. If it goes
red, `horny` is leaking into the default render — check that `off` and `low` are absent from the
band table and that the spec's `defaultScore` is 0.

## Exit criteria

- `horny` renders as a twelfth slider in `/admin/nina`, persists across a save, and survives a
  reload with its value.
- `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` is byte-identical to `origin/main` @ `02dc79a`.
- At `horny: 100` the prompt carries the max band, the body repeal in all three places, the raised
  verbosity floor, and the proactive opening clause.
- Disabling `horny` via phase 4's toggle returns the prompt to byte-identical, at any score.
- Nothing under `lib/llm/`, `lib/nina/imagefail.ts`, or any provider call path was modified.

## Interface contract

- **Exports added to `lib/nina/persona.ts`:** `VERBOSITY_FLOOR_BY_HORNY_BAND`
  (`Readonly<Record<NinaBandName, number>>` — keyed by `horny`'s band, valued as a `verbosity`
  SCORE) and `ninaEffectiveVerbosity(tuning): number`. RECONCILED: the draft named this
  `ninaEffectiveVerbosityBand` and returned a band; see Step 4 and index decision D7.
- **`BODY_REPEALED_BY` gains `'horny'`** — `lib/nina/prompts/system.ts` reads it and needs no edit
  for the repeal itself.
- **`NINA_TUNING_KEYS` is length 17** (12 traits + 4 dials + relationship). Phase 4 asserts this
  derived (`toEqual(['relationship', ...NINA_TRAITS, ...NINA_DIALS])`) rather than as the literal
  16 its draft carried — corrected in reconciliation precisely so this phase does not turn a
  phase-4 test red for the wrong reason. Phase 4's sixteen `*_enabled` columns become seventeen with
  `horny_enabled`, generated here.
- **`NINA_TRAITS` is length 12.** Anything that hard-codes eleven is now wrong; grep for `11` near
  `NINA_TRAITS` before finishing (`components/admin/CharacterPanel.tsx`'s docstring says "eleven
  sliders" — update the prose).
- **`lib/nina/prompts/system.ts` is edited in two regions only:** `systemDials`' single `verbosity`
  line (quoting phase 4's version of that function) and `proactiveTuningSuffix`. `buildOutputRule`,
  `bubblePreferenceLine`, `greetingLine`, `buildNumbersRule` and `renderSections` are **not** edited
  — they consume the floored score and the `BODY_REPEALED_BY` array without knowing this phase ran.
- **`lib/nina/proactive.ts` is NOT edited.** The analysis document's Impact Point 13 named it; the
  copy it points at lives in `system.ts` (`proactive.ts:628` and `system.ts:564` both say so), and
  this phase serves that impact point there.
- **`NINA_PROMPT_VERSION` is NOT bumped by this phase** — phase 3 owns the set's single bump.
- **Phase 3's non-girlfriend snapshot fixture** (`tests/__snapshots__/nina.prompts.test.ts.snap`) is a
  set-wide invariant gate. If it goes red, `horny` is leaking into a render it must not reach.
  Never regenerate it.
