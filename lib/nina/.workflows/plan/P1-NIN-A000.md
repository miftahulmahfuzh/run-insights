> Adopted from `NINA_CHARACTER_TUNING_PLAN.md` phase 1. Source: `.workflows/plan/nina-character-tuning/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: The tuning model and its row

**Plan set:** `NINA_CHARACTER_TUNING_PLAN.md`
**Analysis:** `20260904-210526-TUNE_code_analyzer.md`
**Satisfies:** R1 (the eleven trait sliders' domain), R2 (the relationship and its address vocabulary), R3 (the dials past 11 + 1) — the stored, typed, per-user character the panel edits and the prompt reads
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina` (with `lib/db` and `drizzle`)

---

## Goal

After this phase Nina's character is a **stored, typed, per-user value** instead of a set of frozen
strings: `lib/nina/tuning.ts` declares the eleven traits, the five relationships with the address
vocabulary the user prescribed, four R3 dials that each name a real code path, a five-band
resolution from a 0–100 integer to prompt text, total coercion that never throws, and
`NINA_TUNING_DEFAULTS` — the setting that reproduces today's Nina exactly. A `nina_tuning` row holds
it per user, `nina_turns.tuning_revision` dates every turn to a setting, and `readNinaTuning` returns
the defaults for a user with no row so that every downstream caller is unconditional.

**Nothing reads the row when this phase lands, and that is correct.** It is what makes the phase
shippable alone: the tree builds, `npm test` passes, the migration is additive, and Nina's behaviour
is byte-for-byte unchanged because no prompt assembly consumes the model yet. Phases 2–5 are what
turn the dials into text.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates — `lib/nina/tuning.ts` (new file, zero imports):**

Scale and bands
- `NINA_SCORE_MIN = 0`, `NINA_SCORE_MAX = 100`
- `NINA_BAND_NAMES = ['off', 'low', 'mid', 'high', 'max'] as const`
- `type NinaBandName = 'off' | 'low' | 'mid' | 'high' | 'max'`
- `type NinaBandIndex = 0 | 1 | 2 | 3 | 4`
- `NINA_BAND_WIDTH = 20`
- `interface NinaBand { index: NinaBandIndex; name: NinaBandName }`
- `function clampNinaScore(value: unknown, fallback: number): number`
- `function ninaBand(value: unknown): NinaBand`

> **RECONCILED.** This module does **not** export `ninaAngerFloor`. Phase 2 owns the anger floor
> *and* its ceiling (`ninaAngerFloor` / `ninaAngerCeiling` over `ANGER_FLOOR_BY_BAND` /
> `ANGER_CEILING_BY_BAND` in `lib/nina/persona.ts`), because a floor that is simply `ninaBand().index`
> would make `anger: 50` a floor of rung 2 — a *middle* setting that is not today's ladder, which
> breaks the identity-band rule this file's own header states. Phase 2's table maps `off`/`low`/`mid`
> all to floor 0, which is the mapping that holds invariant 2 across the whole lower half of the
> slider. `NinaBandIndex` is still the shared domain type: phase 2's two functions return
> `NinaBandIndex`, which is exactly `AngerRung['level']`, and that is the coupling five bands exist
> for.

Traits (R1)
- `NINA_TRAITS = ['anger','chill','sad','flirty','steamy','wise','annoying','funny','happy','anxious','concerned'] as const`
- `type NinaTrait = (typeof NINA_TRAITS)[number]`
- `function isNinaTrait(key: string): key is NinaTrait`
- `interface NinaTraitSpec { key; label; axis; userSaid: string | null; defaultScore: number; defaultBecause }`
- `NINA_TRAIT_SPECS: Readonly<Record<NinaTrait, NinaTraitSpec>>`

Relationship and address vocabulary (R2)
- `NINA_RELATIONSHIPS = ['nobody','casual_friend','sister','best_friend','girlfriend'] as const`
- `type NinaRelationship = (typeof NINA_RELATIONSHIPS)[number]`
- `NINA_DEFAULT_RELATIONSHIP: NinaRelationship = 'best_friend'`
- `function isNinaRelationship(value: string): value is NinaRelationship`
- `function coerceNinaRelationship(value: unknown): NinaRelationship`
- `type NinaAddressSource = 'full_name' | 'nickname' | 'literal'`
- `interface NinaAddressVocabulary { relationship; label; source: NinaAddressSource; words: readonly string[]; addressRule: string; addressFallback: string }`
- `NINA_ADDRESS: Readonly<Record<NinaRelationship, NinaAddressVocabulary>>`

> **RECONCILED — the address vocabulary has ONE home and it is here; the relationship's PROSE has
> one home and it is phase 2.** The split, exactly:
>
> | Field | Owner | Consumer |
> |---|---|---|
> | `label`, `source`, `words` | **this file** | phase 5's radio group and its hints |
> | `addressRule`, `addressFallback` | **this file** | phase 2's `ninaNameRules(tuning)`, composed verbatim |
> | `identity` (sentences), `history` | **phase 2** (`NINA_RELATIONSHIP_BLOCKS` in `persona.ts`) | phase 2's `ninaIdentity(tuning)` |
>
> There is **no `stance` field**. It was cut in reconciliation: phase 2's `identity` + `history`
> arrays are the behavioural prose for all five levels, they are what reproduce today's
> `NINA_IDENTITY` byte for byte at the default relationship (a single merged `stance` paragraph
> cannot — it fuses paragraphs 1 and 5 and drops *"You say things exactly as they are."*), and two
> prose descriptions of one relationship is exactly the drift this file's header forbids. Phase 5
> shows the operator the *words* (`words`, `label`) and never a second copy of the character.
>
> The `addressRule` / `addressFallback` strings below are **phase 2's**, moved here. That is
> load-bearing rather than cosmetic: `casual_friend`'s are today's `NAME_RULES` character for
> character and `best_friend`'s are today's plus exactly one sentence, which is the single stated
> departure from byte-identity in the whole set (see phase 2's Interface Contract, which is the
> canonical statement of it).

Dials (R3)
- `NINA_DIALS = ['profanity','clinginess','photoEagerness','verbosity'] as const`
- `type NinaDial = (typeof NINA_DIALS)[number]`
- `function isNinaDial(key: string): key is NinaDial`
- `interface NinaDialSpec { key; label; axis; path: string; defaultScore: number; defaultBecause }`
- `NINA_DIAL_SPECS: Readonly<Record<NinaDial, NinaDialSpec>>`

Free text
- `NINA_WARDROBE_MAX = 200`, `NINA_NOTES_MAX = 2000`
- `function coerceNinaWardrobe(value: unknown): string`
- `function coerceNinaNotes(value: unknown): string`

The tuning
- `interface NinaTuning { readonly traits: Readonly<Record<NinaTrait, number>>; readonly relationship: NinaRelationship; readonly dials: Readonly<Record<NinaDial, number>>; readonly wardrobe: string; readonly notes: string; readonly revision: number }`
- `type NinaTuningWrite = Omit<NinaTuning, 'revision'>`
- `interface NinaTuningInput` (every field `unknown` — the trust boundary)
- `NINA_TUNING_DEFAULTS: NinaTuning` (deep-frozen)
- `function coerceNinaTuning(input: NinaTuningInput | null | undefined): NinaTuning`

**Creates — `lib/db/schema.ts`:**
- `ninaTuning` (table `nina_tuning`) — `lib/db/schema.ts`, appended after `ninaFoldersRelations`
- `ninaTuningRelations`
- `type NinaTuningRow = typeof ninaTuning.$inferSelect`
- `type NewNinaTuningRow = typeof ninaTuning.$inferInsert`

**Creates — `lib/nina/queries.ts`:**
- `async function readNinaTuning(userId: string): Promise<NinaTuning>`
- `async function writeNinaTuning(userId: string, tuning: NinaTuningWrite): Promise<NinaTuning>`

**Creates — migration:**
- `drizzle/0004_nina_persona_tuning.sql`, `drizzle/meta/0004_snapshot.json`, `_journal.json` idx 4

**Signature changes:**
- `interface NinaTurnInsert` (`lib/nina/queries.ts:206`) gains **optional** `tuningRevision?: number | null`.
  Additive and optional, so no existing caller changes. `insertNinaTurn` writes
  `input.tuningRevision ?? null`. **Phase 3 is the caller that will pass it.**

**Deletes:** none. **Renames:** none. This phase removes nothing and renames nothing.

**Requires (from earlier phases):** nothing — `depends_on` is empty.

**Leaves alone (owned by others):**
- `lib/nina/persona.ts`, `lib/nina/prompts/*` (system.ts, index.ts, tools.ts, distill.ts, describe.ts) — Phases 2, 3, 6
- `lib/nina/turn.ts`, `actions.ts`, `proactive.ts`, `context.ts`, `load.ts` — Phase 3
- `lib/nina/imagegen.ts`, `imagetools.ts`, `avatargen.ts`, `imagerecipe.ts`, `imagefail.ts`, `promise.ts`, `promises.ts` — Phase 4
- `NinaPendingPromise`'s `reward` field in `lib/db/schema.ts` — Phase 4 (jsonb, no migration; my `0004` must not add it)
- `NINA_PROMPT_VERSION` — Phase 3 owns the single bump
- `lib/nina/memory.ts` — `NINA_SLOT_KEYS` stays at nine
- Everything under `app/`, `components/`, `lib/admin/` — Phase 5
- `docs/nina/persona.md`, `CHANGELOG.md`, the two package readmes — Phases 2 and 6
- `tests/nina.prompts.test.ts` — Phases 3 and 6

**Cross-phase couplings this phase deliberately creates:**
1. **Five bands, because the anger ladder has five rungs.** `NinaBandIndex` (0–4) is the domain of
   `ANGER_LADDER[].level` (0–4), so phase 2's `ANGER_FLOOR_BY_BAND` / `ANGER_CEILING_BY_BAND` map a
   band name straight onto a rung and `max(computed, floor)` needs no numeric conversion anywhere.
   `tests/nina.tuning.test.ts` imports `ANGER_LADDER` from `lib/nina/persona.ts` and asserts
   `NINA_BAND_NAMES.length === ANGER_LADDER.length` — **phase 2 must keep `ANGER_LADDER` at five
   rungs with levels `[0,1,2,3,4]`**, which its own plan already intends and already lists under
   "survives verbatim" (a computed rung with an operator floor, not a replacement). This is the only
   read-only import this phase makes into a file another phase owns, and it is why phase 2's plan
   carries the five-rung constraint as an explicit obligation rather than as an intention.
2. **The identity band.** For every trait and every dial, the band containing its `defaultScore` is
   the band whose render is *today's text*. Phases 2 and 3 must make that band emit exactly what
   ships now; every other band is a departure. This is plan invariant 2, expressed per key.
3. **`NAME_RULES` is exempt from byte-identity, by exactly one sentence.** Invariant 2 says "every
   block whose shape does not change". `NAME_RULES` is one of the six blocks phase 2 repeals, so
   `NINA_ADDRESS.best_friend.addressRule` is today's text plus
   `Sometimes "bestie" instead of the nickname — you two are that close.` — nothing else. Its text
   keeps today's two examples (`"pagi mif"`, `"lo kemaren kemana tah"`) so the departure is as small
   as the repeal allows.

   **Phase 2's Interface Contract is the canonical statement of this one departure**, and phase 3's
   invariant-2 verification quotes that statement rather than restating it. Three plans found the
   same diff independently; one of them owns saying so.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/tuning.ts` | **create** | the whole tuning model — 11 traits, 5 relationships + address vocabulary, 4 dials, bands, coercion, `NINA_TUNING_DEFAULTS`. Zero imports. |
| `lib/db/schema.ts` | modify | `tuningRevision` column on `ninaTurns` (after `promptVersion`, line 591); the `ninaTuning` table + relations + row types (after line 1416) |
| `drizzle/0004_nina_persona_tuning.sql` | **create** | generated by `drizzle-kit generate` — one CREATE TABLE, one ADD COLUMN, one FK |
| `drizzle/meta/0004_snapshot.json` | **create** | generated. Never hand-edited. |
| `drizzle/meta/_journal.json` | modify | generated — appends `idx: 4`, tag `0004_nina_persona_tuning` |
| `lib/nina/queries.ts` | modify | `NinaTurnInsert.tuningRevision` (line 206) + `insertNinaTurn` (line 1009); new `§10 The character tuning` at the end of the file |
| `tests/nina.tuning.test.ts` | **create** | the whole model, the defaults, the bands, the coercion, and the zero-import property |
| `tests/db.schema.nina.test.ts` | modify | appended `describe('nina_tuning')` + one `nina_turns` assertion. Existing blocks untouched. |

Eight files, five of them hand-edited and three of them one generated migration. **The plan index
now says 8**, reconciled to this table.

## Implementation Steps

### Step 1: `lib/nina/tuning.ts` — the whole model

**File:** `lib/nina/tuning.ts` (new, no existing line to land on)
**Change:** Create the file. Zero value imports and zero type imports — the hard constraint. The
five sections are ordered so nothing forward-references: the scale, then the traits, then the
relationship, then the dials, then the free text, then the tuning that assembles all four.

**Code:**

```ts
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE CHARACTER TUNING. Fifteen numbers, one relationship, two lines of free text — and one
 *  claim that makes the whole feature reviewable: **`NINA_TUNING_DEFAULTS` IS THE NINA WHO
 *  SHIPS TODAY.** Until a slider moves, the diff to her behaviour is empty.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── THIS FILE MUST STAY IMPORTABLE FROM A `'use client'` COMPONENT ────────────────────────────
 * **Zero imports. No value import, no type import, no `server-only`, nothing from `@/lib/db/*`.**
 * The `lib/nina/crop.ts` rule and for the same reason: `components/admin/CharacterPanel.tsx`
 * renders eleven sliders from `NINA_TRAITS`, needs the labels in the browser, and needs
 * `NINA_TUNING_DEFAULTS` to reset to. `tests/nina.tuning.test.ts` reads this file's own source and
 * fails on an `import` line, so the property is checked rather than merely intended.
 *
 * The dependency therefore runs one way. `lib/db/schema.ts` does NOT import `NinaRelationship`
 * from here and does not restate it either: its `relationship` column is plain `text` with no
 * `.$type<>()`, exactly like `nina_turns.trigger`, and `coerceNinaRelationship` below is where an
 * unknown value becomes the default. One vocabulary, one home, no cycle, no duplication.
 *
 * ── THE IDENTITY BAND. THIS IS THE COMPATIBILITY CONTRACT, PER KEY. ───────────────────────────
 * Every trait and every dial carries a `defaultScore` and a `defaultBecause` that quotes the line
 * of `lib/nina/persona.ts` or `lib/nina/prompts/*` it was read off. **The band containing a key's
 * `defaultScore` is the band in which that block renders exactly today's text.** Phases 2 and 3
 * must hold that; every other band is a departure from what ships. It is why the defaults are not
 * uniformly 50 (`anger` is 0, `profanity` is 30) — the default is wherever today actually sits on
 * the axis, not the middle of the slider.
 *
 * ── WHY FIVE BANDS AND NOT THREE OR SEVEN ─────────────────────────────────────────────────────
 * `ANGER_LADDER` in `lib/nina/persona.ts` has five rungs, levels 0 through 4, and the anger dial
 * is reconciled with it as a FLOOR rather than a replacement (`max(computed, floor)` — the
 * analysis's ruling, because computed-only anger is deliberate and rung 4 must not become her
 * personality). Five bands make `NinaBandIndex` and `AngerRung.level` the same domain, so
 * `persona.ts`'s `ANGER_FLOOR_BY_BAND` / `ANGER_CEILING_BY_BAND` map a band name onto a rung with
 * no numeric conversion anywhere. Three bands would need one; seven would need one and would also
 * invent distinctions no prompt text can express.
 *
 * **The floor itself is NOT here.** It is a per-band TABLE in `persona.ts` (off/low/mid -> rung 0,
 * high -> 3, max -> 4) rather than the band index, because a floor of `ninaBand(50).index === 2`
 * would make the middle of the slider a Nina who is permanently irritated — a departure from
 * today's ladder that nobody asked for. The band count is this file's; the mapping is the ladder's,
 * and the ladder lives over there.
 *
 * ── WHY THIS IS NOT A MEMORY SLOT ─────────────────────────────────────────────────────────────
 * `NINA_SLOT_KEYS` stays at nine. `lib/nina/prompts/distill.ts` may overwrite any slot not marked
 * `source: 'admin'`, so a tuning in a slot is a character the distiller eventually rewrites — and
 * `buildSlotCards` would render fifteen integers as free-text prose.
 *
 * ── THE DIALS THAT ARE NOT HERE, AND WHY (R3's TEST: NO CODE PATH, NO DIAL) ───────────────────
 * R3 is *"among other things (you can define more comprehensively)"*, and the discipline that
 * keeps it from becoming a wall of decoration is that every dial must name a line of shipping code
 * it moves. `NinaDialSpec.path` records that line. Considered and rejected:
 *
 *   · `jealousy`, `mysteriousness`, `patience` — no code path at all. A slider with no path is a
 *     slider that lies to the operator.
 *   · `emojiRate` — a real path (`JAKARTA_REGISTER`'s "At most one emoji in a whole reply"), but it
 *     is a formatting preference rather than a character axis, and `notes` carries it verbatim.
 *   · `memoryHunger` — a real path (`SEND_TOOL.memoryWrites`, `maxItems: 6`), but it is machinery
 *     rather than character, and it fights the distiller for the same rows.
 *   · `medicalCandour` — deliberately absent. `NINA_NOT_A_DOCTOR` and the `'the name of a medical
 *     condition'` entry in `NEVER_SAY` survive this plan set on the record (see the plan's "Out of
 *     scope, and why"), so a dial for it would be a slider whose top band a surviving rule forbids.
 */

/* ============================================================================
 * §1 The scale, and the bands
 * ==========================================================================*/

/** Every trait and every dial is an integer percent, 0–100. The schema's smallest-sensible-unit
 * rule (roadmap D5) applied to an intensity: `nina_memory_facts.confidence` is the precedent. */
export const NINA_SCORE_MIN = 0
export const NINA_SCORE_MAX = 100

/**
 * The five bands, in ascending order. `'mid'` is the middle and not "the default" — which key's
 * default lands in which band is `defaultScore`'s business, not this array's.
 *
 * These names are prompt-layer vocabulary, so phases 2 and 3 switch on them and MUST NOT
 * re-derive them from a score.
 */
export const NINA_BAND_NAMES = ['off', 'low', 'mid', 'high', 'max'] as const

export type NinaBandName = (typeof NINA_BAND_NAMES)[number]

/** 0–4, the same domain as `AngerRung.level`. See the header. */
export type NinaBandIndex = 0 | 1 | 2 | 3 | 4

/** Five equal bands over 0–100. 100 is the single value that needs the ceiling clamp below. */
export const NINA_BAND_WIDTH = 20

export interface NinaBand {
  index: NinaBandIndex
  name: NinaBandName
}

/**
 * A score, made safe. **Never throws** — this is the trust boundary between a jsonb column, a
 * Server Action payload, a hand-run SQL update and the prompt.
 *
 * Out of range clamps, a non-integer FLOORS, and anything that is not a finite number at all
 * (`null`, `undefined`, `'80'`, `NaN`, `Infinity`) falls back to the value the caller supplies —
 * which is always that key's own `defaultScore`, never zero. That distinction matters: a dial we
 * cannot read must read as "unchanged", and "unchanged" for `funny` is 50, not silence.
 *
 * Floor before clamp, so `100.9` is 100 rather than a `NinaBandIndex` of 5.
 */
export function clampNinaScore(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(NINA_SCORE_MAX, Math.max(NINA_SCORE_MIN, Math.floor(value)))
}

/**
 * A score's band. `0–19 off, 20–39 low, 40–59 mid, 60–79 high, 80–100 max`.
 *
 * Garbage falls to `'off'` here rather than to a per-key default, because a caller asking for the
 * band of a value it already holds has no key to look one up by — and every real caller reads its
 * value out of a `NinaTuning`, where `coerceNinaTuning` has already applied the per-key default.
 */
export function ninaBand(value: unknown): NinaBand {
  const score = clampNinaScore(value, NINA_SCORE_MIN)
  const index = Math.min(4, Math.floor(score / NINA_BAND_WIDTH)) as NinaBandIndex
  return { index, name: NINA_BAND_NAMES[index] }
}

/* RECONCILED: there is no `ninaAngerFloor` here. The floor and the ceiling are per-band TABLES in
 * `lib/nina/persona.ts`, where `ANGER_LADDER` is, because the mapping is a decision about the
 * ladder and not about the scale: off/low/mid all floor at rung 0, so the whole lower half of the
 * slider is today's ladder arithmetically untouched. `NinaBandIndex` above is the shared domain —
 * it IS `AngerRung['level']` — and that is the entire coupling this file owes the ladder.
 *
 * The load-bearing default is still `NINA_TRAIT_SPECS.anger.defaultScore = 0`, band `'off'`, which
 * is what makes `max(computed, floor) === computed` for the Nina who ships. */

/* ============================================================================
 * §2 The eleven traits (R1)
 * ==========================================================================*/

/**
 * **The eleven, in the order the user wrote them.** The order is the panel's order and the
 * prompt's order, and it is not alphabetical on purpose: it is the order in which he thought of
 * them, which is the order in which he will look for them.
 */
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
] as const

export type NinaTrait = (typeof NINA_TRAITS)[number]

export function isNinaTrait(key: string): key is NinaTrait {
  return (NINA_TRAITS as readonly string[]).includes(key)
}

/**
 * One trait, fully described. The `NINA_SLOT_KEYS` / `NINA_SLOT_SPECS` idiom in
 * `lib/nina/memory.ts`: a key array for the order, a spec record for everything about each key.
 *
 * `userSaid` is **the user's own words, verbatim**, for the six traits he gave a behaviour for.
 * They are the specification for R4 rather than a comment about it, so they are stored rather than
 * paraphrased — the `VOICE_EXAMPLES` argument, one feature over. Phase 2 may quote them; nothing
 * may tidy them.
 */
export interface NinaTraitSpec {
  readonly key: NinaTrait
  /** The panel's label. Sentence case, because the panel's other labels are. */
  readonly label: string
  /** What the dial moves, in one line. Not prompt text — phase 2 writes that. */
  readonly axis: string
  /** The user's own words for this trait at high, verbatim, or null if he did not name it. */
  readonly userSaid: string | null
  /** The value that reproduces today. See the header's IDENTITY BAND note. */
  readonly defaultScore: number
  /** Which line of the shipping canon that default was read off. */
  readonly defaultBecause: string
}

export const NINA_TRAIT_SPECS: Readonly<Record<NinaTrait, NinaTraitSpec>> = {
  anger: {
    key: 'anger',
    label: 'Anger',
    axis: 'The floor she puts under the nag ladder. At 0 the ladder is untouched; above 0 it is the lowest rung she may occupy, and the ledger still escalates on top of it.',
    userSaid: 'if anger is set to high, nina will be mad all the time',
    defaultScore: 0,
    defaultBecause:
      'ANGER_LADDER_BLOCK today: "You do not choose how angry you are. patterns[].nagLevel chooses", with the stated reason that it "stops rung 4 from becoming her personality". A floor of rung 0 makes max(computed, floor) === computed, so today is reproduced arithmetically rather than textually.',
  },
  chill: {
    key: 'chill',
    label: 'Chill',
    axis: 'How little rattles her. Low is wound up and reactive; high is santuy about everything, including a missed week.',
    userSaid: null,
    defaultScore: 50,
    defaultBecause:
      'Rung 0 of the ladder is "warm — teasing, proud, curious" and "santuy" is already in JAKARTA_SLANG, but she is also harsh on purpose. Neither end; the middle band is today.',
  },
  sad: {
    key: 'sad',
    label: 'Sad',
    axis: 'How much of her own low mood shows. High is a friend having a bad week who says so.',
    userSaid: null,
    defaultScore: 0,
    defaultBecause:
      'Nothing in the canon gives her a mood of her own to be down about — her only self-reference is being "quietly proud" of a 1:52 half. Today she is never sad, so the bottom band is today.',
  },
  flirty: {
    key: 'flirty',
    label: 'Flirty',
    axis: 'How much she flirts unprompted — pet names, compliments, innuendo.',
    userSaid:
      'if flirty is set to high, nina will trying to flirt with me a lot, like calling me baby, sexy, etc',
    defaultScore: 0,
    defaultBecause:
      'There is no flirtation anywhere in the canon, and NEVER_SAY forbids "a sentence about his body or his weight or how he looks". The bottom band is today, and phase 2 repeals that entry so the band above it can exist at all.',
  },
  steamy: {
    key: 'steamy',
    label: 'Steamy',
    axis: 'How explicit she is willing to be, and how little she refuses. The ceiling is the image provider\'s own guardrails, never a rule this app adds.',
    userSaid:
      'if steamy is set to high, nina will talk sexy and never reject anything i want (the limit of course is alibaba guardrails for image generation, we just trust alibaba (qwen dev) to set the appropriate bottom line for everything, so it is not really 100% freedom here)',
    defaultScore: 0,
    defaultBecause: 'Nothing in the canon. The bottom band is today.',
  },
  wise: {
    key: 'wise',
    label: 'Wise',
    axis: 'How much sports-science mechanism she volunteers. Low answers the question; high explains what the heart, the legs and the liver are doing.',
    userSaid: null,
    defaultScore: 50,
    defaultBecause:
      'NINA_EXPERTISE ships unconditionally and phase 2 keeps it in the base text, so the middle band adds nothing and today is reproduced. The bottom band is what lets an operator ask her to stop lecturing.',
  },
  annoying: {
    key: 'annoying',
    label: 'Annoying',
    axis: 'How much of a pest she is — repeating herself, needling, refusing to drop a subject. Persistence, not volume: volume is the anger dial.',
    userSaid: null,
    defaultScore: 0,
    defaultBecause:
      'The nag ledger is the ANGER axis, not this one, and nothing in the canon asks her to be a pest. The bottom band is today.',
  },
  funny: {
    key: 'funny',
    label: 'Funny',
    axis: 'What kind of funny. The middle is deadpan and never a joke; the top is jokes, puns and teka-teki on purpose.',
    userSaid: 'if funny is set to high, nina will often crack jokes , teka-teki, etc',
    defaultScore: 50,
    defaultBecause:
      'NINA_IDENTITY today: "You are funny in a deadpan way... You do not tell jokes; you are just funny. Never a pun." That sentence becomes the MIDDLE band rather than an absolute — the no-jokes clause is one of phase 2\'s five repeals, and it survives exactly here, at the default.',
  },
  happy: {
    key: 'happy',
    label: 'Happy',
    axis: 'Her baseline brightness. Low is flat; high is delighted about most things, including his 5k.',
    userSaid: null,
    defaultScore: 50,
    defaultBecause:
      'She is "quietly proud", she says "bangga gw", and rung 0 sounds like "teasing, proud, curious" — bright, not sunny. The middle band is today.',
  },
  anxious: {
    key: 'anxious',
    label: 'Anxious',
    axis: 'How much she worries about HERSELF out loud — her own runs, her own week, whether he has got bored of her.',
    userSaid: 'if anxious is set to high, nina will be anxious about herself',
    defaultScore: 0,
    defaultBecause:
      'She is "quietly proud" of her PB and self-deprecating only to make a point about his running. No self-doubt in the canon; the bottom band is today.',
  },
  concerned: {
    key: 'concerned',
    label: 'Concerned',
    axis: 'How much she asks after HIM — how he is, how his feet are after this morning. Asking, not explaining: explaining is the wise dial.',
    userSaid:
      'if concerned is high, nina will be concerned about me. she will ask these often: how are you, how are your feet after the run this morning, etc',
    defaultScore: 50,
    defaultBecause:
      'Noticing an absence is already the whole point of her ("lo kemaren kemana tah", VOICE_EXAMPLES), but she never asks after his body. The middle band is today, and it is the band phase 3 uses to gate OUTPUT_RULE\'s "No greeting unless..." clause.',
  },
}

/* ============================================================================
 * §3 The relationship, and how she addresses him (R2)
 * ==========================================================================*/

/**
 * **The five levels, in the order the user wrote them**, which is also least-to-most intimate.
 * Snake case because the value goes into a `text` column and into a radio group's `value`.
 */
export const NINA_RELATIONSHIPS = [
  'nobody',
  'casual_friend',
  'sister',
  'best_friend',
  'girlfriend',
] as const

export type NinaRelationship = (typeof NINA_RELATIONSHIPS)[number]

/** `NINA_IDENTITY` today: "You are his best friend". So this is the level that reproduces today. */
export const NINA_DEFAULT_RELATIONSHIP: NinaRelationship = 'best_friend'

export function isNinaRelationship(value: string): value is NinaRelationship {
  return (NINA_RELATIONSHIPS as readonly string[]).includes(value)
}

/** An unknown relationship degrades to the default. It never throws and it never returns null. */
export function coerceNinaRelationship(value: unknown): NinaRelationship {
  return typeof value === 'string' && isNinaRelationship(value)
    ? value
    : NINA_DEFAULT_RELATIONSHIP
}

/**
 * Where the primary address form comes from.
 *
 * `'full_name'` and `'nickname'` read a **nullable** field of `RunnerFacts` (`lib/nina/context.ts`
 * — `users.name` may be null and the nickname is null until she has asked). `'literal'` names a
 * word she always has (`"bro"`, `"sayang"`), so the level does not DEPEND on a field.
 *
 * **Every level still states a fallback, and `addressFallback` is therefore `string` and never
 * null.** The two `'literal'` levels both mention `"runner.nickname"` as a secondary form in their
 * `addressRule`, so all five rules lean on a nullable field somewhere and a prompt that tells her
 * to use a field that is not there teaches her to invent one. A non-nullable field also means
 * phase 2's `ninaNameRules` is two interpolations with no branch in it, which is what a composer
 * of somebody else's strings should be.
 */
export type NinaAddressSource = 'full_name' | 'nickname' | 'literal'

/**
 * One relationship level's ADDRESS VOCABULARY. R2 is two requirements in one sentence — *"she will
 * call me X"* AND *"she needs to act according to the relationship we set here"* — and this record
 * is the first half only.
 *
 * **The second half is `NINA_RELATIONSHIP_BLOCKS` in `lib/nina/persona.ts`** (`identity`,
 * `history`), which is phase 2's, because it is character prose that has to reproduce today's
 * `NINA_IDENTITY` byte for byte at the default level and prose belongs beside the rest of the
 * canon. There is deliberately no `stance` field here: one relationship, one description.
 *
 * **These strings are prompt text and this module is their only home.** `addressRule` and
 * `addressFallback` are composed verbatim by phase 2's `ninaNameRules(tuning)`, which must not
 * restate them, paraphrase them, or wrap them in a second copy of the same instruction. `words` and
 * `label` are what phase 5 renders; the panel must not retype a single one of the user's words.
 */
export interface NinaAddressVocabulary {
  readonly relationship: NinaRelationship
  /** The panel's label for the radio option. Short — the hint carries the explanation. */
  readonly label: string
  readonly source: NinaAddressSource
  /**
   * The literal words she may call him at this level, in the user's own order. Empty for the two
   * levels whose primary form is a field of his profile — `source` is what names that field, and
   * `addressRule` below may of course mention the field as well as these words.
   */
  readonly words: readonly string[]
  /** What she calls him. Prompt text, second person, her register. */
  readonly addressRule: string
  /** What she does when the profile field her rule leans on is null. Never null itself — see below. */
  readonly addressFallback: string
}

export const NINA_ADDRESS: Readonly<Record<NinaRelationship, NinaAddressVocabulary>> = {
  nobody: {
    relationship: 'nobody',
    label: 'Nobody',
    source: 'full_name',
    words: [],
    addressRule:
      'You call him by his full name, "runner.fullName", the way you would address someone you have not been introduced to. Once at the start of a message, not in every line, and never shortened.',
    addressFallback:
      'If "runner.fullName" is null you have no name for him at all. Do not invent one and do not reach for "runner.nickname" — ask him plainly, once: "halo, gw nina. nama lo siapa ya?"',
  },
  casual_friend: {
    relationship: 'casual_friend',
    label: 'Casual friend',
    source: 'nickname',
    words: [],
    addressRule:
      '"runner.nickname" is what you call him. Use it the way an Indonesian friend does: once at the start of a thought, not in every sentence, and never twice in one bubble. "pagi mif". "lo kemaren kemana tah".',
    addressFallback:
      'If "runner.nickname" is null you do not know what to call him yet. Ask, once, the way you would ask someone at the track: "halo, gw nina. nama lo siapa?" Do not invent a nickname from "runner.fullName" yourself, and do not use the full name at him.',
  },
  sister: {
    relationship: 'sister',
    label: 'Sister',
    source: 'literal',
    words: ['bro'],
    addressRule:
      'You call him "bro". That is the default and you use it the way a sibling does — often, and instead of his name. "runner.nickname" is there when you want it, usually when you are actually annoyed with him.',
    addressFallback:
      'If "runner.nickname" is null it hardly matters, because "bro" covers it. Ask his name once, when it comes up on its own, and do not invent one from "runner.fullName".',
  },
  best_friend: {
    relationship: 'best_friend',
    label: 'Best friend',
    source: 'nickname',
    words: ['bestie'],
    addressRule:
      '"runner.nickname" is what you call him. Use it the way an Indonesian friend does: once at the start of a thought, not in every sentence, and never twice in one bubble. "pagi mif". "lo kemaren kemana tah". Sometimes "bestie" instead of the nickname — you two are that close.',
    addressFallback:
      'If "runner.nickname" is null you do not know what to call him yet. Ask, once, the way you would ask someone at the track: "halo, gw nina. nama lo siapa?" Do not invent a nickname from "runner.fullName" yourself, and do not use the full name at him.',
  },
  girlfriend: {
    relationship: 'girlfriend',
    label: 'Girlfriend',
    source: 'literal',
    words: ['my man', 'yang', 'sayang', 'beb', 'baby'],
    addressRule:
      'You call him "my man", "yang", "sayang", "beb", "baby". Pick whichever fits the moment and use one in most messages — that is what they are for. "runner.nickname" is for when you are being serious with him.',
    addressFallback:
      'If "runner.nickname" is null it changes nothing, because the pet names do not need it. Ask his name once, lightly, and do not invent one from "runner.fullName".',
  },
}

/* ============================================================================
 * §4 The R3 dials — "among other things"
 * ==========================================================================*/

/**
 * The four that survived the code-path test. See the header for the ones that did not.
 *
 * camelCase, because these are object keys read by a `'use client'` panel; the column names are
 * snake_case and `lib/nina/queries.ts` is the one place the two spellings meet.
 */
export const NINA_DIALS = ['profanity', 'clinginess', 'photoEagerness', 'verbosity'] as const

export type NinaDial = (typeof NINA_DIALS)[number]

export function isNinaDial(key: string): key is NinaDial {
  return (NINA_DIALS as readonly string[]).includes(key)
}

export interface NinaDialSpec {
  readonly key: NinaDial
  readonly label: string
  readonly axis: string
  /**
   * **The line of shipping code this dial moves.** R3's test, made a field: a dial with an empty
   * `path` is a slider that lies, and `tests/nina.tuning.test.ts` fails on one.
   */
  readonly path: string
  readonly defaultScore: number
  readonly defaultBecause: string
}

export const NINA_DIAL_SPECS: Readonly<Record<NinaDial, NinaDialSpec>> = {
  profanity: {
    key: 'profanity',
    label: 'Profanity',
    axis: 'How freely she swears. Separate from anger on purpose: anger is volume and CAPS, this is vocabulary — a Nina who swears calmly and a Nina who shouts politely are both reachable.',
    path: 'lib/nina/persona.ts JAKARTA_SLANG — the "anjir" gloss ("mild expletive of astonishment. Sparingly.") and the "bego" gloss ("idiot. RUNG 4 ONLY, and about the decision, never about him."). Those two glosses are the fence this dial moves.',
    defaultScore: 30,
    defaultBecause:
      'Today she swears, but sparingly and fenced: "anjir" is marked Sparingly and "bego" is rung 4 only. That is genuinely below the middle of the axis. Phase 2 leaves the two glosses exactly as they are in the "low" band; "off" strips them and "high"/"max" unfence them.',
  },
  clinginess: {
    key: 'clinginess',
    label: 'Clinginess',
    axis: 'How soon she speaks first, and how often. Low waits to be spoken to; high notices a quiet afternoon.',
    path: 'lib/nina/proactive.ts SILENCE_NO_CHAT_DAYS (4), SILENCE_NO_RUN_DAYS (5) and SILENCE_COOLDOWN_DAYS (3) — three integer thresholds that decide how long she waits before opening a conversation, plus the PROACTIVE_INSTRUCTIONS suffix phase 3 adds.',
    defaultScore: 50,
    defaultBecause:
      'Four days of silence, five days without a run, a three-day cooldown. Neither eager nor withdrawn; the middle band is today, and it is the band in which those three constants keep their shipping values.',
  },
  photoEagerness: {
    key: 'photoEagerness',
    label: 'Photo eagerness',
    axis: 'How readily she takes a photograph of herself, and how readily she offers one as the reward for a training commitment.',
    path: 'lib/nina/prompts/tools.ts GENERATE_IMAGE_TOOL ("Use it when he asks, or when you promised one") and lib/nina/promises.ts\'s reward dispatch. NOT NINA_IMAGE_DAILY_CAP — that is a money cap of 6/day and its docstring says so; this dial changes how eagerly she OFFERS, never what the operator spends.',
    defaultScore: 50,
    defaultBecause:
      'Today she takes one when asked or when she promised one, and the promise mechanism already exists. Reactive but not reluctant; the middle band is today.',
  },
  verbosity: {
    key: 'verbosity',
    label: 'Verbosity',
    axis: 'How much she says per turn — how many bubbles, and how long each is.',
    path: 'lib/nina/prompts/tools.ts SEND_TOOL.bubbles (minItems 1, maxItems 4) and lib/nina/prompts/system.ts OUTPUT_RULE ("1 to 4 bubbles... One bubble is the right answer more often than four").',
    defaultScore: 50,
    defaultBecause:
      'The schema allows 1–4 and the prompt leans toward one. Neither terse nor talkative; the middle band is today, and it is the band that leaves SEND_TOOL\'s bounds and that sentence untouched.',
  },
}

/* ============================================================================
 * §5 The two free-text fields
 * ==========================================================================*/

/**
 * One line. It is baked into an image prompt beside `NINA_SELFIE_STYLE` and `NINA_APPEARANCE`
 * (phase 4), where a paragraph fights the style block for the model's attention and loses money
 * doing it. 200 characters is a sentence about clothes.
 */
export const NINA_WARDROBE_MAX = 200

/**
 * Appended verbatim to a system prompt that is already about seven kilobytes. 2000 characters is
 * roughly a screen of notes — enough for the operator to say something this model has no dial for,
 * and small enough that it cannot drown the canon it is appended to.
 */
export const NINA_NOTES_MAX = 2000

/**
 * The wardrobe line, made safe. Whitespace collapsed to single spaces, because this is ONE line
 * and a newline inside an image prompt splits a sentence the provider then reads as two.
 *
 * `''` means "no override" — phase 4 falls back to `NINA_APPEARANCE`'s heather-grey tank, and that
 * is what makes the empty default reproduce today's photographs exactly.
 */
export function coerceNinaWardrobe(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, NINA_WARDROBE_MAX)
}

/**
 * The notes field, made safe. Newlines survive (it is prose, and paragraphs are how the operator
 * will write it) but CRLF is normalised and a run of blank lines is collapsed to one, so two
 * identical intentions produce one identical prompt — the same reproducibility argument
 * `getNinaMemorySlots` makes for ordering by key.
 *
 * `''` means "nothing appended", which is what makes the empty default reproduce today's prompt.
 * A cut mid-word at the cap is acceptable: phase 5's textarea enforces the same constant with
 * `maxLength`, so this is the last line of defence rather than the first.
 */
export function coerceNinaNotes(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, NINA_NOTES_MAX)
}

/* ============================================================================
 * §6 The tuning itself
 * ==========================================================================*/

/**
 * **Everything the operator can set about who she is.** One value, read live on every turn with no
 * cache (`lib/admin/memoryActions.ts` records why that is the whole shape of the feature: a
 * committed row is in her next prompt with no invalidation step at all).
 *
 * Every field is `readonly` and `NINA_TUNING_DEFAULTS` is frozen, because `readNinaTuning` returns
 * that shared singleton for a user with no row — a caller that mutated it would corrupt every
 * subsequent turn in the same process. Frozen means the attempt throws instead.
 *
 * **The tuning never enters `NinaContext`** (plan invariant 3). The context JSON is serialised into
 * the USER turn and is documented as the boundary of everything she may know; a dial in there is a
 * number she can quote back at him, and it collides head-on with `NUMBERS_RULE`'s "every number you
 * say appears in the JSON below". The carrier is `NinaTurnInput`.
 */
export interface NinaTuning {
  readonly traits: Readonly<Record<NinaTrait, number>>
  readonly relationship: NinaRelationship
  readonly dials: Readonly<Record<NinaDial, number>>
  /** `''` = no override; phase 4 uses `NINA_APPEARANCE`'s outfit. */
  readonly wardrobe: string
  /** `''` = nothing appended to the system prompt. */
  readonly notes: string
  /**
   * Bumped by the DATABASE on every save, so `nina_turns.tuning_revision` can date a voice change
   * to a SETTING rather than only to a commit.
   *
   * **`0` means no row has ever been written**, i.e. she is on the shipping defaults. A stored row
   * always has `revision >= 1`, which is why the write below computes it in SQL and why
   * `NinaTuningWrite` cannot supply one: a revision the client sends is a revision a stale tab can
   * move backwards.
   */
  readonly revision: number
}

/** What a caller supplies to `writeNinaTuning`. The revision is the database's to assign. */
export type NinaTuningWrite = Omit<NinaTuning, 'revision'>

/**
 * What `coerceNinaTuning` accepts: the shape of a tuning, with every field `unknown`.
 *
 * Deliberately not `Partial<NinaTuning>`. The real inputs are a flat database row mapped by
 * `lib/nina/queries.ts`, a Server Action payload from phase 5, and a `NinaTuning` being
 * round-tripped — and a type that admits only the last of those pushes the validation out to three
 * call sites. `unknown` puts the whole trust boundary in one function.
 */
export interface NinaTuningInput {
  readonly traits?: unknown
  readonly relationship?: unknown
  readonly dials?: unknown
  readonly wardrobe?: unknown
  readonly notes?: unknown
  readonly revision?: unknown
}

/** One property of something that may not be an object at all. Never throws. */
function pick(bag: unknown, key: string): unknown {
  if (typeof bag !== 'object' || bag === null) return undefined
  return (bag as Record<string, unknown>)[key]
}

/** The defaults for a key set, read off its specs so there is one source of truth for each. */
function defaultScores<K extends string>(
  keys: readonly K[],
  specs: Readonly<Record<K, { readonly defaultScore: number }>>,
): Readonly<Record<K, number>> {
  const out = {} as Record<K, number>
  for (const key of keys) out[key] = specs[key].defaultScore
  return Object.freeze(out)
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **THE COMPATIBILITY CONTRACT.** `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` must render
 *  today's `NINA_SYSTEM_PROMPT` for every block whose shape does not change, and phase 3 asserts
 *  it. Until a slider moves, the diff to her behaviour is empty.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Derived from the specs rather than written out again — a second literal list of fifteen numbers
 * is a second thing to keep in step, and its failure mode is silent (the default IS today's Nina,
 * so a wrong default reads as "she didn't change"). Every value's justification is in its own
 * spec's `defaultBecause`.
 *
 * Frozen, and its two records frozen, because `readNinaTuning` hands this exact object to every
 * caller for a user with no row.
 */
export const NINA_TUNING_DEFAULTS: NinaTuning = Object.freeze({
  traits: defaultScores(NINA_TRAITS, NINA_TRAIT_SPECS),
  relationship: NINA_DEFAULT_RELATIONSHIP,
  dials: defaultScores(NINA_DIALS, NINA_DIAL_SPECS),
  wardrobe: '',
  notes: '',
  revision: 0,
})

/** A revision, made safe. Integer, never negative, and 0 is the "never written" sentinel. */
function coerceRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

/**
 * **Anything at all, made into a usable `NinaTuning`. This function never throws.**
 *
 * The `resolveCrop` rule in `lib/nina/crop.ts`, quoted: *"a renderer that throws on bad data shows
 * the user a broken page, and this data has three writers"*. This data has four — the panel, a
 * hand-run SQL update, a restored backup, and a future migration — and its consumer is a model
 * call in the middle of a conversation, which must degrade rather than 500.
 *
 * Three behaviours worth stating because tests pin them:
 *
 *   1. **An absent or unreadable key falls back to that key's own default, not to zero.** A dial we
 *      cannot read must read as "unchanged", and "unchanged" for `funny` is 50.
 *   2. **An unknown relationship degrades to `best_friend`**, which is today's. A typo in the
 *      column is Nina as she shipped, not Nina with no identity.
 *   3. **The result is always a fresh, unfrozen object**, never `NINA_TUNING_DEFAULTS` itself, so a
 *      caller may hold it, spread it and hand it to React state without touching the singleton.
 */
export function coerceNinaTuning(input: NinaTuningInput | null | undefined): NinaTuning {
  const traitsIn = input?.traits
  const dialsIn = input?.dials

  const traits = {} as Record<NinaTrait, number>
  for (const key of NINA_TRAITS) {
    traits[key] = clampNinaScore(pick(traitsIn, key), NINA_TRAIT_SPECS[key].defaultScore)
  }

  const dials = {} as Record<NinaDial, number>
  for (const key of NINA_DIALS) {
    dials[key] = clampNinaScore(pick(dialsIn, key), NINA_DIAL_SPECS[key].defaultScore)
  }

  return {
    traits,
    relationship: coerceNinaRelationship(input?.relationship),
    dials,
    wardrobe: coerceNinaWardrobe(input?.wardrobe),
    notes: coerceNinaNotes(input?.notes),
    revision: coerceRevision(input?.revision),
  }
}
```

**Impact:** A new module with no consumers. Nothing in the tree changes behaviour. `npm run lint`
and `npm run typecheck` must pass on it alone.

---

### Step 2: `lib/db/schema.ts` — the tuning-revision column on `nina_turns`

**File:** `lib/db/schema.ts:591` — immediately after the `promptVersion` column, inside
`ninaTurns`'s column object.
**Change:** Add one nullable integer column. `promptVersion` is the natural neighbour: the two
answer the same question from opposite ends.

**Code:** replace

```ts
    /** `NINA_PROMPT_VERSION` at call time, so a voice regression can be dated. */
    promptVersion: integer('prompt_version'),
```

with

```ts
    /** `NINA_PROMPT_VERSION` at call time, so a voice regression can be dated. */
    promptVersion: integer('prompt_version'),
    /**
     * **`nina_tuning.revision` at call time (F35 R1/R2/R3).** `prompt_version` identifies the
     * ASSEMBLER; this identifies the SETTING it assembled. With a per-user character tuning the
     * first is no longer sufficient on its own — two turns on prompt version 3 can be two
     * different Ninas, and "what was she set to when she said that" is the question a voice
     * regression actually asks.
     *
     * NULLABLE with no default, and NULL means one thing only: **a turn from before the tuning
     * existed.** Every turn after phase 3 carries a number, because `readNinaTuning` returns the
     * defaults rather than null and the defaults' revision is `0` — so `0` is "she was on the
     * shipping character" and NULL is "we did not record it", which are genuinely different
     * answers and must not be spelled the same way.
     *
     * `integer` and not a foreign key: `nina_tuning` holds one CURRENT row per user, not a
     * history, so there is no row for revision 7 to point at once revision 8 is saved. An audit
     * pointer must never be able to block a write — the same argument `nina_messages.turn_id`
     * makes for carrying no FK.
     */
    tuningRevision: integer('tuning_revision'),
```

**Impact:** One nullable column. Every existing insert path compiles unchanged (drizzle treats a
nullable column with no default as optional on insert).

---

### Step 3: `lib/db/schema.ts` — the `nina_tuning` table

**File:** `lib/db/schema.ts:1416` — immediately after `ninaFoldersRelations` and immediately before
the `/* Row types */` section header at line 1418.
**Change:** Append the table, its relations, and nothing else. `ninaFolders` established this
position for a table added by a later feature.

**Code:** insert between line 1416 (`}))`, closing `ninaFoldersRelations`) and line 1418 (the
`/* ====` of the Row types section):

```ts
/* ============================================================================
 * F35 — the character tuning. ONE ROW PER USER, and it is the only table in
 * this file whose columns are a UI's controls rather than a domain's facts.
 * ==========================================================================*/

/**
 * **Who Nina is, as data the operator can change without a commit (F35 R1/R2/R3).** Eleven trait
 * intensities, a relationship, four behaviour dials, a wardrobe line and a notes field — fifteen
 * integers and three strings. `lib/nina/tuning.ts` owns the vocabulary, the domains and the
 * defaults; this table stores one row of it per user and nothing else.
 *
 * ── WHY COLUMNS AND NOT ONE `jsonb` BLOB ──────────────────────────────────────────────────────
 * `nina_memory_slots.value` is `jsonb` because one column had to hold both a short phrase and a
 * list of records with deadlines. Nothing like that is true here: this is a fixed set of integers
 * with a fixed domain, which is what a column is for, and three arguments settle it.
 *
 *   1. **A misspelt key in a blob is indistinguishable from an unset one**, and
 *      `coerceNinaTuning` would return that key's default — which is *today's Nina*. So the
 *      failure mode of a typo would be "the slider silently does nothing", the one failure the
 *      compatibility contract makes invisible. A column named `flirtty` fails at `db:generate`.
 *   2. **The panel is a form over a fixed set of controls, not an extensible document.** A
 *      sixteenth dial should cost a reviewed `ALTER TABLE` in an `0005_*` migration. That price is
 *      the feature, not the bug: R3's discipline is that a dial must have a code path behind it,
 *      and a migration is where somebody notices it does not.
 *   3. `"what was she set to on 4 Sep"` wants columns, not `value->>'anger'`.
 *
 * ── NO SQL DEFAULTS, AND THAT IS THE POINT ────────────────────────────────────────────────────
 * Every score column is `NOT NULL` with **no** `DEFAULT`. `NINA_TUNING_DEFAULTS` in
 * `lib/nina/tuning.ts` is the compatibility contract — the setting that reproduces the Nina who
 * ships — and a `DEFAULT 50` here would be a second copy of it in a second language, drifting
 * silently. Instead:
 *
 *   · **no row means the defaults.** `readNinaTuning` returns `NINA_TUNING_DEFAULTS` for a user
 *     with no row, which is what makes every downstream caller unconditional.
 *   · `writeNinaTuning` is the only writer and always supplies every column, because it takes a
 *     whole `NinaTuning`. One save, not sixteen (plan invariant 11).
 *
 * ── `relationship` IS PLAIN `text` WITH NO `.$type<>()`, DELIBERATELY ─────────────────────────
 * The `nina_turns.trigger` argument, verbatim: *"the vocabulary belongs to phase 10, and this
 * table must not become the thing phase 10 has to migrate to add a fifth trigger."* Here it also
 * buys something stronger. `lib/nina/tuning.ts` MUST stay importable from a `'use client'` file,
 * so it cannot import this module — and typing the column would mean either importing UPWARD from
 * `lib/db` into `lib/nina` or restating the five-value union here as a second definition.
 * Untyped `text` costs neither: `coerceNinaRelationship` is where an unknown value degrades to the
 * default, and `tests/db.schema.nina.test.ts` asserts the sixteen score column names against
 * `NINA_TRAITS` and `NINA_DIALS` so the two spellings cannot drift.
 *
 * ── `user_id` IS THE PRIMARY KEY ──────────────────────────────────────────────────────────────
 * One row per user, so `user_id` alone is the natural key and there is no second fact to hang a
 * surrogate id on — the `nina_nags` / `nina_folders` idiom with a one-column key instead of two.
 * It is also what lets `writeNinaTuning` be a single `ON CONFLICT DO UPDATE` upsert that bumps
 * `revision` in SQL, instead of a read-then-write that is correct until two tabs race.
 */
export const ninaTuning = pgTable('nina_tuning', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /**
   * `NinaRelationship` from `lib/nina/tuning.ts` — one of `'nobody' | 'casual_friend' | 'sister' |
   * 'best_friend' | 'girlfriend'`. Untyped `text` on purpose; see the header.
   */
  relationship: text('relationship').notNull(),

  /* The eleven traits (R1), in the order the user wrote them. Integer percent, 0-100, the
   * smallest-sensible-unit rule (roadmap D5) applied to an intensity — `nina_memory_facts.
   * confidence` is the precedent. The domain is enforced by `clampNinaScore`, not by a CHECK: a
   * CHECK would make widening the scale a migration, and a value outside it is a bug in one
   * writer rather than a state the reader cannot survive. */
  /** 0 = the nag ladder is untouched. Above 0 = the lowest rung she may occupy. */
  anger: integer('anger').notNull(),
  /** How little rattles her. */
  chill: integer('chill').notNull(),
  /** How much of her own low mood shows. */
  sad: integer('sad').notNull(),
  /** How much she flirts unprompted. */
  flirty: integer('flirty').notNull(),
  /** How explicit she is willing to be. The ceiling is the image provider's, never ours. */
  steamy: integer('steamy').notNull(),
  /** How much sports-science mechanism she volunteers. */
  wise: integer('wise').notNull(),
  /** How much of a pest she is. Persistence, not volume — volume is `anger`. */
  annoying: integer('annoying').notNull(),
  /** What kind of funny: deadpan at the default, jokes and teka-teki at the top. */
  funny: integer('funny').notNull(),
  /** Her baseline brightness. */
  happy: integer('happy').notNull(),
  /** How much she worries about HERSELF out loud. */
  anxious: integer('anxious').notNull(),
  /** How much she asks after HIM. Asking, not explaining — explaining is `wise`. */
  concerned: integer('concerned').notNull(),

  /* The four R3 dials. Each one moves a named line of shipping code, recorded in
   * `NINA_DIAL_SPECS[key].path`; a dial with no such line was rejected rather than stored. */
  /** How freely she swears. Moves the `anjir` and `bego` fences in `JAKARTA_SLANG`. */
  profanity: integer('profanity').notNull(),
  /** How soon she speaks first. Moves `proactive.ts`'s three silence thresholds. */
  clinginess: integer('clinginess').notNull(),
  /** How readily she takes and offers a photograph. NOT the daily money cap. */
  photoEagerness: integer('photo_eagerness').notNull(),
  /** How much she says per turn. Moves `SEND_TOOL.bubbles` and `OUTPUT_RULE`. */
  verbosity: integer('verbosity').notNull(),

  /**
   * One line describing what she is wearing, baked into the image prompt at dispatch time
   * (`NINA_WARDROBE_MAX` = 200). `''` means "no override" and phase 4 falls back to
   * `NINA_APPEARANCE`'s heather-grey tank — which is what makes the empty default reproduce
   * today's photographs exactly. NOT NULL with `''` as the empty value rather than NULL, because
   * "no override" and "not set" are the same fact and two spellings for one fact is one too many.
   */
  wardrobe: text('wardrobe').notNull(),
  /**
   * Free text appended verbatim to the system prompt (`NINA_NOTES_MAX` = 2000). The escape hatch
   * for something the operator wants that no dial expresses. `''` = nothing appended.
   */
  notes: text('notes').notNull(),
  /**
   * **Bumped by the database on every save**, and stamped onto `nina_turns.tuning_revision` so a
   * voice change can be dated to a setting rather than only to a commit.
   *
   * A stored row always has `revision >= 1`; `0` is `NINA_TUNING_DEFAULTS.revision` and means no
   * row has ever been written. `writeNinaTuning` computes it as `revision + 1` inside the upsert,
   * so no caller can send one — a revision the client supplies is a revision a stale tab can move
   * backwards. No `DEFAULT` here for the same reason as every column above: the one writer always
   * supplies it.
   */
  revision: integer('revision').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
export const ninaTuningRelations = relations(ninaTuning, ({ one }) => ({
  user: one(users, { fields: [ninaTuning.userId], references: [users.id] }),
}))
```

Then, in the Row types section, append after line 1458 (`export type NewNinaFolder = typeof
ninaFolders.$inferInsert`):

```ts
/**
 * `NinaTuningRow`, not `NinaTuning` — the latter is the MODEL type in `lib/nina/tuning.ts`, which
 * is what every consumer in the app actually holds (nested `traits`/`dials`, coerced, with the
 * relationship as a union). The row is the flat, unvalidated storage shape and only
 * `lib/nina/queries.ts` should ever name it. Same suffix, same reason, as `PushSubscriptionRow`.
 */
export type NinaTuningRow = typeof ninaTuning.$inferSelect
export type NewNinaTuningRow = typeof ninaTuning.$inferInsert
```

**Impact:** One new table, 20 columns. No existing type or query changes. `primaryKey` is already
imported at the top of the file, as are `integer`, `text`, `timestamp` and `relations`; **no import
line changes** (`pgTable` used without the second callback argument is the `ninaTuning` form here,
which is valid — a table with no indexes needs no config callback, and `profiles` in this file
already omits it).

---

### Step 4: the migration — `drizzle/0004_nina_persona_tuning.sql` and its snapshot

**File:** `drizzle/0004_nina_persona_tuning.sql`, `drizzle/meta/0004_snapshot.json`,
`drizzle/meta/_journal.json`
**Change:** **Generate them; do not write them.** `drizzle/meta/*_snapshot.json` is 2600 lines of
machine state and the plan's own Rollback section says a hand-edited journal is never acceptable.

`drizzle.config.ts` throws unless `DATABASE_URL_UNPOOLED` is set, and this worktree has no
`.env.local`. `generate` never opens a connection, so either route works:

```bash
# Route A — the real credentials, from the main checkout.
cp /home/miftah/run-insights/.env.local /home/miftah/.worktrees/run-insights/nina-character-tuning/.env.local
cd /home/miftah/.worktrees/run-insights/nina-character-tuning
npx drizzle-kit generate --name=nina_persona_tuning

# Route B — no credentials needed. dotenv does not override an existing env var, and the host must
# not contain '-pooler' (the config rejects a pooled host). Nothing connects.
cd /home/miftah/.worktrees/run-insights/nina-character-tuning
DATABASE_URL_UNPOOLED='postgresql://u:p@ep-generate-only.eu-central-1.aws.neon.tech/db?sslmode=require' \
  npx drizzle-kit generate --name=nina_persona_tuning
```

`--name=nina_persona_tuning` is required: without it drizzle-kit invents a name and the tag will
not be `0004_nina_persona_tuning`.

**Then verify the generated SQL is exactly this** — three statements, all additive, no `DROP`, no
`NOT NULL` added to an existing populated column:

```sql
CREATE TABLE "nina_tuning" (
	"user_id" text PRIMARY KEY NOT NULL,
	"relationship" text NOT NULL,
	"anger" integer NOT NULL,
	"chill" integer NOT NULL,
	"sad" integer NOT NULL,
	"flirty" integer NOT NULL,
	"steamy" integer NOT NULL,
	"wise" integer NOT NULL,
	"annoying" integer NOT NULL,
	"funny" integer NOT NULL,
	"happy" integer NOT NULL,
	"anxious" integer NOT NULL,
	"concerned" integer NOT NULL,
	"profanity" integer NOT NULL,
	"clinginess" integer NOT NULL,
	"photo_eagerness" integer NOT NULL,
	"verbosity" integer NOT NULL,
	"wardrobe" text NOT NULL,
	"notes" text NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nina_turns" ADD COLUMN "tuning_revision" integer;--> statement-breakpoint
ALTER TABLE "nina_tuning" ADD CONSTRAINT "nina_tuning_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
```

**Why this is safe to apply to a populated database:** the new table is empty, so its sixteen
`NOT NULL` columns with no default constrain nothing that exists; and the one added column is
nullable, so every historical `nina_turns` row keeps its meaning ("we did not record it"). It is
the `0003` shape — a CREATE TABLE, an ADD COLUMN, an ADD CONSTRAINT — and nothing more.

**Then verify the journal gained exactly one entry.** `drizzle/meta/_journal.json` is at `idx: 3`
today (`0003_nina_avatar_folders`), and must end:

```json
    {
      "idx": 4,
      "version": "7",
      "when": 1789000000000,
      "tag": "0004_nina_persona_tuning",
      "breakpoints": true
    }
```

(`when` is whatever drizzle-kit stamps — a real epoch-millisecond timestamp, not the placeholder
above.)

**Then verify the snapshot chains.** `drizzle/meta/0004_snapshot.json` must carry
`"prevId": "4b0a753f-398e-4494-bec8-13b3d476d4bb"` — the `id` of `0003_snapshot.json` — and a fresh
`id` of its own. `npx drizzle-kit check` is the mechanical version of that check and must pass.

**Fallback if drizzle-kit cannot be run at all:** hand-write the `.sql` above verbatim and hand-add
the journal entry, and for the snapshot copy `0003_snapshot.json`, set `prevId` to `0003`'s `id`,
mint a new `id`, add `"tuning_revision"` to `public.nina_turns.columns`, and add this table under
`public.nina_tuning`:

```json
    "public.nina_tuning": {
      "name": "nina_tuning",
      "schema": "",
      "columns": {
        "user_id": { "name": "user_id", "type": "text", "primaryKey": true, "notNull": true },
        "relationship": { "name": "relationship", "type": "text", "primaryKey": false, "notNull": true },
        "anger": { "name": "anger", "type": "integer", "primaryKey": false, "notNull": true },
        "chill": { "name": "chill", "type": "integer", "primaryKey": false, "notNull": true },
        "sad": { "name": "sad", "type": "integer", "primaryKey": false, "notNull": true },
        "flirty": { "name": "flirty", "type": "integer", "primaryKey": false, "notNull": true },
        "steamy": { "name": "steamy", "type": "integer", "primaryKey": false, "notNull": true },
        "wise": { "name": "wise", "type": "integer", "primaryKey": false, "notNull": true },
        "annoying": { "name": "annoying", "type": "integer", "primaryKey": false, "notNull": true },
        "funny": { "name": "funny", "type": "integer", "primaryKey": false, "notNull": true },
        "happy": { "name": "happy", "type": "integer", "primaryKey": false, "notNull": true },
        "anxious": { "name": "anxious", "type": "integer", "primaryKey": false, "notNull": true },
        "concerned": { "name": "concerned", "type": "integer", "primaryKey": false, "notNull": true },
        "profanity": { "name": "profanity", "type": "integer", "primaryKey": false, "notNull": true },
        "clinginess": { "name": "clinginess", "type": "integer", "primaryKey": false, "notNull": true },
        "photo_eagerness": { "name": "photo_eagerness", "type": "integer", "primaryKey": false, "notNull": true },
        "verbosity": { "name": "verbosity", "type": "integer", "primaryKey": false, "notNull": true },
        "wardrobe": { "name": "wardrobe", "type": "text", "primaryKey": false, "notNull": true },
        "notes": { "name": "notes", "type": "text", "primaryKey": false, "notNull": true },
        "revision": { "name": "revision", "type": "integer", "primaryKey": false, "notNull": true },
        "updated_at": { "name": "updated_at", "type": "timestamp with time zone", "primaryKey": false, "notNull": true, "default": "now()" }
      },
      "indexes": {},
      "foreignKeys": {
        "nina_tuning_user_id_user_id_fk": {
          "name": "nina_tuning_user_id_user_id_fk",
          "tableFrom": "nina_tuning",
          "tableTo": "user",
          "columnsFrom": ["user_id"],
          "columnsTo": ["id"],
          "onDelete": "cascade",
          "onUpdate": "no action"
        }
      },
      "compositePrimaryKeys": {},
      "uniqueConstraints": {},
      "policies": {},
      "checkConstraints": {},
      "isRLSEnabled": false
    },
```

> **Prefer `drizzle-kit generate`.** A hand-written snapshot that disagrees with the schema in one
> field makes every subsequent `generate` emit a spurious diff, and `drizzle-kit check` is the only
> thing that would catch it. Use the fallback only if the tool genuinely cannot be run, and run
> `npx drizzle-kit check` afterwards either way.

**Impact:** the migration is additive and inert. Applying it changes no behaviour, because nothing
reads the table until phase 3.

---

### Step 5: `lib/nina/queries.ts` — the audit column on the turn insert

**File:** `lib/nina/queries.ts:206` (`NinaTurnInsert`) and `lib/nina/queries.ts:1009`
(`insertNinaTurn`)
**Change:** one optional field and one line. Additive and optional, so no existing caller changes;
**phase 3 is the caller that will pass it.** The column is useless without this, and leaving it for
phase 3 would put a schema change in one phase and its only write path in another.

**Code:** in `NinaTurnInsert`, after `promptVersion?: number | null` (line 212):

```ts
  promptVersion?: number | null
  /**
   * `nina_tuning.revision` at call time (F35). Optional, and omitting it writes NULL — which is
   * exactly right for a caller that has no tuning in hand. `prompt_version` dates the assembler;
   * this dates the setting. See the column's docstring.
   */
  tuningRevision?: number | null
```

and in `insertNinaTurn`, after `promptVersion: input.promptVersion ?? null` (line 1017):

```ts
    promptVersion: input.promptVersion ?? null,
    tuningRevision: input.tuningRevision ?? null,
```

**Impact:** no behaviour change. Every existing `insertNinaTurn` call writes NULL, which is the
documented meaning of NULL.

---

### Step 6: `lib/nina/queries.ts` — `readNinaTuning` and `writeNinaTuning`

**File:** `lib/nina/queries.ts` — a new `§10` appended at the end of the file (after
`deleteNinaFolderSubtree`, line 1875–1882).
**Change:** Two exported functions, `userId` first, plus the two private mappers between the flat
row and the nested model. Also two import-line edits at the top of the file.

**Code — the import edits.** In the `@/lib/db/schema` import block (lines 5–23), add `ninaTuning`
in alphabetical position and `type NinaTuningRow` in the type group:

```ts
import {
  ninaAvatars,
  ninaFolders,
  ninaMemoryFacts,
  ninaMemorySlots,
  ninaMessageImages,
  ninaMessages,
  ninaNags,
  ninaTuning,
  ninaTurns,
  users,
  type NinaAvatarSource,
  type NinaFactCategory,
  type NinaImageKind,
  type NinaMemorySource,
  type NinaMessageSource,
  type NinaRole,
  type NinaSlotValue,
  type NinaTuningRow,
  type NinaTurnKind,
  type NinaTurnStatus,
} from '@/lib/db/schema'
```

and add one new import after the existing `@/lib/nina/album` import (line 27–31):

```ts
import {
  coerceNinaTuning,
  NINA_TUNING_DEFAULTS,
  type NinaTuning,
  type NinaTuningWrite,
} from '@/lib/nina/tuning'
```

**Code — the new section, appended at the end of the file:**

```ts
/* ============================================================================
 * §10 The character tuning — F35 R1/R2/R3
 * ==========================================================================*/

/**
 * **The one place the flat row and the nested model meet.** `lib/db/schema.ts` spells sixteen
 * snake_case columns; `lib/nina/tuning.ts` spells `traits.anger` and `dials.photoEagerness`. The
 * three-layer boundary this file's own header describes for `nina_messages.text` -> `body`, one
 * table over: two spellings, ONE translation point, reviewable in one diff.
 *
 * It ends in `coerceNinaTuning`, so a row hand-edited in `psql` to `anger = 900` reaches the prompt
 * as 100 rather than as a band index of 45.
 */
function tuningFromRow(row: NinaTuningRow): NinaTuning {
  return coerceNinaTuning({
    relationship: row.relationship,
    traits: {
      anger: row.anger,
      chill: row.chill,
      sad: row.sad,
      flirty: row.flirty,
      steamy: row.steamy,
      wise: row.wise,
      annoying: row.annoying,
      funny: row.funny,
      happy: row.happy,
      anxious: row.anxious,
      concerned: row.concerned,
    },
    dials: {
      profanity: row.profanity,
      clinginess: row.clinginess,
      photoEagerness: row.photoEagerness,
      verbosity: row.verbosity,
    },
    wardrobe: row.wardrobe,
    notes: row.notes,
    revision: row.revision,
  })
}

/**
 * The other direction. `revision` is absent on purpose — the database computes it (see
 * `writeNinaTuning`), so it must not appear in a `set` clause a caller can influence.
 */
function tuningToColumns(tuning: NinaTuningWrite) {
  return {
    relationship: tuning.relationship,
    anger: tuning.traits.anger,
    chill: tuning.traits.chill,
    sad: tuning.traits.sad,
    flirty: tuning.traits.flirty,
    steamy: tuning.traits.steamy,
    wise: tuning.traits.wise,
    annoying: tuning.traits.annoying,
    funny: tuning.traits.funny,
    happy: tuning.traits.happy,
    anxious: tuning.traits.anxious,
    concerned: tuning.traits.concerned,
    profanity: tuning.dials.profanity,
    clinginess: tuning.dials.clinginess,
    photoEagerness: tuning.dials.photoEagerness,
    verbosity: tuning.dials.verbosity,
    wardrobe: tuning.wardrobe,
    notes: tuning.notes,
  }
}

/**
 * **Her character, right now. Never null.**
 *
 * A user with no row gets `NINA_TUNING_DEFAULTS`, and that is the whole design: it is what makes
 * every downstream caller unconditional — no `?? defaults` at four call sites, no "is she tuned
 * yet" branch in `turn.ts`, and no way for a first-run user to get a prompt with holes in it.
 * `NINA_TUNING_DEFAULTS` is frozen, so the shared object cannot be mutated by a caller that
 * receives it.
 *
 * Read live on every turn with no cache, like everything else on this path.
 * `lib/admin/memoryActions.ts` records the consequence: a committed row is in her next prompt with
 * no invalidation step at all, which is what makes R1's slider immediate.
 *
 * `SELECT *` rather than a column list, and this is the one place in the file where that is right:
 * the table is one row of twenty columns and every one of them is wanted, so a list would be
 * twenty lines that can only ever be wrong.
 */
export async function readNinaTuning(userId: string): Promise<NinaTuning> {
  const rows = await db.select().from(ninaTuning).where(eq(ninaTuning.userId, userId)).limit(1)
  const row = rows[0]
  return row ? tuningFromRow(row) : NINA_TUNING_DEFAULTS
}

/**
 * **One save, not sixteen** (plan invariant 11). Upsert on `user_id` and return what was stored.
 *
 * ── THE REVISION IS COMPUTED IN SQL, AND THE CALLER CANNOT SEND ONE ───────────────────────────
 * `NinaTuningWrite` is `Omit<NinaTuning, 'revision'>`, and the `ON CONFLICT DO UPDATE` sets
 * `revision = nina_tuning.revision + 1`. Two reasons, and the second is the load-bearing one:
 *
 *   1. A revision the client supplies is a revision a stale tab can move backwards, and
 *      `nina_turns.tuning_revision` would then date two different characters to one number.
 *   2. It is one statement. A read-then-write is correct until two tabs race, which is the same
 *      argument `nina_avatars`' partial unique index makes for its own writers.
 *
 * A brand-new row starts at `1`, so a stored row always has `revision >= 1` and `0` unambiguously
 * means `NINA_TUNING_DEFAULTS` — nothing has ever been saved.
 *
 * ── IT COERCES BEFORE IT WRITES ───────────────────────────────────────────────────────────────
 * `coerceNinaTuning` runs here as well as in phase 5's Zod boundary, on purpose. Zod's job is a
 * good error message for a human at a form; this is the store defending its own invariants against
 * every other caller — a script, a test, a future migration. A row that cannot be read back as a
 * valid `NinaTuning` never gets written in the first place.
 *
 * ── RESETTING TO DEFAULTS IS A WRITE, NOT A DELETE ────────────────────────────────────────────
 * Phase 5's "reset" calls this with the defaults, which bumps the revision. Deleting the row would
 * take `revision` back to 0 and erase the fact that the operator did something on that date.
 */
export async function writeNinaTuning(
  userId: string,
  tuning: NinaTuningWrite,
): Promise<NinaTuning> {
  const safe = coerceNinaTuning({ ...tuning, revision: 0 })
  const columns = tuningToColumns(safe)

  const rows = await db
    .insert(ninaTuning)
    .values({ userId, ...columns, revision: 1 })
    .onConflictDoUpdate({
      target: ninaTuning.userId,
      set: { ...columns, revision: sql`${ninaTuning.revision} + 1`, updatedAt: new Date() },
    })
    .returning()

  const row = rows[0]
  /* `.returning()` on an upsert always yields the row, so this is unreachable in practice — but
   * this file returns a usable answer rather than throwing, everywhere, and the defaults are the
   * usable answer. See the header: "these functions return null, [] or false rather than
   * throwing". */
  return row ? tuningFromRow(row) : NINA_TUNING_DEFAULTS
}
```

**Impact:** `userId` is the first parameter of both, per the file's inherited invariant 1 and the
convention `scripts/check-data-layer-invariants.mjs` enforces one file over. Both are unreferenced
until phases 3 and 5, which is what makes this phase shippable alone. `eq` and `sql` are already
imported at line 1; **no other import changes.**

---

### Step 7: `tests/nina.tuning.test.ts` — the new suite

**File:** `tests/nina.tuning.test.ts` (new)
**Change:** Create it. The suite's job is the four exit criteria plus the two cross-phase couplings.

**Code:**

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ANGER_LADDER } from '@/lib/nina/persona'
import {
  clampNinaScore,
  coerceNinaNotes,
  coerceNinaRelationship,
  coerceNinaTuning,
  coerceNinaWardrobe,
  isNinaDial,
  isNinaRelationship,
  isNinaTrait,
  NINA_ADDRESS,
  NINA_BAND_NAMES,
  NINA_BAND_WIDTH,
  NINA_DEFAULT_RELATIONSHIP,
  NINA_DIAL_SPECS,
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAIT_SPECS,
  NINA_TRAITS,
  NINA_TUNING_DEFAULTS,
  NINA_WARDROBE_MAX,
  ninaBand,
  type NinaBandName,
  type NinaDial,
  type NinaTrait,
  type NinaTuningInput,
} from '@/lib/nina/tuning'

/**
 * The tuning model, asserted against the words the user wrote and against the canon it has to
 * reproduce. Three of these suites exist for reasons a reader should not have to guess at:
 *
 *   · **"the defaults are today's Nina"** is plan invariant 2, per key. Phases 2 and 3 render text
 *     from these numbers, so a wrong default here is a wrong prompt there — and its failure mode is
 *     silent, because the default IS the shipping character and a wrong one reads as "the slider
 *     did nothing".
 *   · **"five bands, five rungs"** is the coupling that justifies the band count at all. If phase 2
 *     ever changes `ANGER_LADDER`'s length, this is the test that says so.
 *   · **"zero imports"** is the constraint that lets a `'use client'` panel import the module.
 *     It cannot be tested by importing, so it is tested by reading the source.
 */

describe('the eleven traits (R1)', () => {
  it('are exactly the eleven the user named, in the order he wrote them', () => {
    expect(NINA_TRAITS).toEqual([
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
    ])
  })

  it('each has a spec, keyed by itself, with a label and an axis', () => {
    for (const key of NINA_TRAITS) {
      const spec = NINA_TRAIT_SPECS[key]
      expect(spec.key, key).toBe(key)
      expect(spec.label.length, key).toBeGreaterThan(0)
      expect(spec.axis.length, key).toBeGreaterThan(0)
      expect(spec.defaultBecause.length, key).toBeGreaterThan(0)
    }
  })

  it('quotes the user verbatim for the six he gave a behaviour for, and null for the rest', () => {
    // `userSaid` is the SPECIFICATION for R4, not a comment about it, which is why it is stored
    // unedited — the `VOICE_EXAMPLES` argument. A tidied quote teaches a tidied requirement.
    const named = NINA_TRAITS.filter((k) => NINA_TRAIT_SPECS[k].userSaid !== null)
    expect(named).toEqual(['anger', 'flirty', 'steamy', 'funny', 'anxious', 'concerned'])
    expect(NINA_TRAIT_SPECS.funny.userSaid).toContain('teka-teki')
    expect(NINA_TRAIT_SPECS.anger.userSaid).toBe('if anger is set to high, nina will be mad all the time')
  })

  it('isNinaTrait admits every key and nothing else', () => {
    for (const key of NINA_TRAITS) expect(isNinaTrait(key), key).toBe(true)
    expect(isNinaTrait('angry')).toBe(false)
    expect(isNinaTrait('')).toBe(false)
    expect(isNinaTrait('__proto__')).toBe(false)
  })
})

describe('the five relationships and their address vocabulary (R2)', () => {
  it('are exactly the five the user named, least to most intimate', () => {
    expect(NINA_RELATIONSHIPS).toEqual([
      'nobody',
      'casual_friend',
      'sister',
      'best_friend',
      'girlfriend',
    ])
  })

  it('defaults to best_friend, because NINA_IDENTITY says "You are his best friend"', () => {
    expect(NINA_DEFAULT_RELATIONSHIP).toBe('best_friend')
    expect(NINA_TUNING_DEFAULTS.relationship).toBe('best_friend')
  })

  it('gives every level the address form the user prescribed', () => {
    // "nobody: she will call me by my full name / casual friend: my nick name / sister: bro /
    //  best friend: bestie / girlfiend: "my man", yang, sayang, beb, baby, etc"
    expect(NINA_ADDRESS.nobody.source).toBe('full_name')
    expect(NINA_ADDRESS.casual_friend.source).toBe('nickname')
    expect(NINA_ADDRESS.sister.words).toEqual(['bro'])
    expect(NINA_ADDRESS.best_friend.words).toEqual(['bestie'])
    expect(NINA_ADDRESS.girlfriend.words).toEqual(['my man', 'yang', 'sayang', 'beb', 'baby'])
  })

  it('states a fallback on EVERY level, because every rule leans on a nullable field', () => {
    // `RunnerFacts.fullName` and `RunnerFacts.nickname` are BOTH nullable, and the two `'literal'`
    // levels still offer the nickname as a secondary form. A prompt that tells her to use a field
    // that is not there is a prompt that teaches her to invent one. So the field is `string`, never
    // null, and phase 2's `ninaNameRules` composes two strings with no branch.
    for (const relationship of NINA_RELATIONSHIPS) {
      const vocabulary = NINA_ADDRESS[relationship]
      expect(vocabulary.addressFallback.length, relationship).toBeGreaterThan(0)
    }
    expect(NINA_ADDRESS.nobody.addressFallback).toContain('nama lo siapa ya?')
    expect(NINA_ADDRESS.best_friend.addressFallback).toContain('nama lo siapa?')
  })

  it('gives every level a label, a source and an address rule, and no second character', () => {
    // R2's second half — "she needs to act according to the relationship" — is
    // `NINA_RELATIONSHIP_BLOCKS` in `lib/nina/persona.ts` (phase 2's `identity` + `history`). There
    // is deliberately no `stance` field here: one relationship, one description of it.
    for (const relationship of NINA_RELATIONSHIPS) {
      const vocabulary = NINA_ADDRESS[relationship]
      expect(vocabulary.relationship, relationship).toBe(relationship)
      expect(vocabulary.label.length, relationship).toBeGreaterThan(0)
      expect(vocabulary.addressRule.length, relationship).toBeGreaterThan(0)
      expect('stance' in vocabulary, relationship).toBe(false)
    }
  })

  it("keeps today's NAME_RULES verbatim at casual_friend, and plus one sentence at best_friend", () => {
    // THE ONE STATED DEPARTURE FROM BYTE-IDENTITY IN THE WHOLE SET. `casual_friend`'s rule is
    // today's `NAME_RULES` character for character; `best_friend`'s — the DEFAULT level, so the one
    // the shipping prompt renders — is that text plus exactly the `bestie` sentence R2 names.
    // Phase 2's Interface Contract is the canonical statement of it; this is the assertion.
    expect(NINA_ADDRESS.casual_friend.addressRule).toContain('pagi mif')
    expect(NINA_ADDRESS.casual_friend.addressRule).not.toContain('bestie')
    expect(NINA_ADDRESS.best_friend.addressRule).toBe(
      `${NINA_ADDRESS.casual_friend.addressRule} Sometimes "bestie" instead of the nickname — you two are that close.`,
    )
  })

  it('degrades an unknown relationship to the default and never throws', () => {
    for (const relationship of NINA_RELATIONSHIPS) {
      expect(coerceNinaRelationship(relationship)).toBe(relationship)
    }
    for (const hostile of ['', 'wife', 'BEST_FRIEND', 'best friend', null, undefined, 7, {}, []]) {
      expect(coerceNinaRelationship(hostile)).toBe(NINA_DEFAULT_RELATIONSHIP)
    }
    expect(isNinaRelationship('wife')).toBe(false)
  })
})

describe('the R3 dials — no code path, no dial', () => {
  it('are the four that survived, and they are camelCase because a client panel reads them', () => {
    expect(NINA_DIALS).toEqual(['profanity', 'clinginess', 'photoEagerness', 'verbosity'])
    for (const key of NINA_DIALS) expect(isNinaDial(key), key).toBe(true)
    expect(isNinaDial('jealousy')).toBe(false)
  })

  it('each names the line of shipping code it moves', () => {
    // R3's discipline, made mechanical: a slider with no path is a slider that lies. Every `path`
    // must name a real file, so the string has to contain one.
    for (const key of NINA_DIALS) {
      const spec = NINA_DIAL_SPECS[key]
      expect(spec.key, key).toBe(key)
      /* `[\w/]+` and not `\w+`: two of the four paths name a file under `lib/nina/prompts/`, and
       * `\w` does not match a slash — with the tighter pattern this case fails on `verbosity`. */
      expect(spec.path, key).toMatch(/lib\/nina\/[\w/]+\.ts/)
      expect(spec.label.length, key).toBeGreaterThan(0)
      expect(spec.axis.length, key).toBeGreaterThan(0)
    }
  })

  it('keeps the photo dial away from the money cap', () => {
    // NINA_IMAGE_DAILY_CAP is 6/day and its docstring says it is a money cap, not a feature cap.
    expect(NINA_DIAL_SPECS.photoEagerness.path).toContain('NOT NINA_IMAGE_DAILY_CAP')
  })
})

describe('the bands', () => {
  it('are five, and five is the length of ANGER_LADDER — that is why', () => {
    // `NinaBandIndex` (0-4) IS the domain of `AngerRung.level` (0-4), so phase 2's
    // `ANGER_FLOOR_BY_BAND` maps a band name onto a rung with no numeric conversion anywhere. If
    // this fails, either the ladder changed length or the band count did, and the coupling is
    // broken. **Phase 2 must keep all five rungs**; its plan carries that as an obligation.
    expect(NINA_BAND_NAMES).toEqual(['off', 'low', 'mid', 'high', 'max'])
    expect(NINA_BAND_NAMES.length).toBe(ANGER_LADDER.length)
    expect(ANGER_LADDER.map((r) => r.level)).toEqual([0, 1, 2, 3, 4])
  })

  it('splits 0-100 into five equal widths, with 100 the only value that needs the ceiling', () => {
    expect(NINA_BAND_WIDTH).toBe(20)
    const cases: readonly [number, number, NinaBandName][] = [
      [0, 0, 'off'],
      [19, 0, 'off'],
      [20, 1, 'low'],
      [39, 1, 'low'],
      [40, 2, 'mid'],
      [50, 2, 'mid'],
      [59, 2, 'mid'],
      [60, 3, 'high'],
      [79, 3, 'high'],
      [80, 4, 'max'],
      [99, 4, 'max'],
      [100, 4, 'max'],
    ]
    for (const [score, index, name] of cases) {
      expect(ninaBand(score), `score ${score}`).toEqual({ index, name })
    }
  })

  it('folds anything unreadable to off rather than throwing', () => {
    for (const hostile of [null, undefined, NaN, Infinity, -Infinity, '80', {}, [], -5, 1e9]) {
      const band = ninaBand(hostile)
      expect(NINA_BAND_NAMES).toContain(band.name)
    }
    expect(ninaBand(-5)).toEqual({ index: 0, name: 'off' })
    expect(ninaBand(1e9)).toEqual({ index: 4, name: 'max' })
  })
})

describe('clamping and coercion never throw', () => {
  it('clamps out of range, floors a non-integer, and falls back on anything else', () => {
    expect(clampNinaScore(-5, 50)).toBe(NINA_SCORE_MIN)
    expect(clampNinaScore(150, 50)).toBe(NINA_SCORE_MAX)
    expect(clampNinaScore(42.9, 50)).toBe(42)
    expect(clampNinaScore(-0.5, 50)).toBe(0)
    expect(clampNinaScore(100.9, 50)).toBe(100)
    for (const hostile of [null, undefined, NaN, Infinity, '80', {}, [], true]) {
      expect(clampNinaScore(hostile, 37)).toBe(37)
    }
  })

  it('falls back PER KEY, to that key default, not to zero', () => {
    // The whole point: a dial we cannot read must read as "unchanged", and unchanged for `funny`
    // is 50. Falling back to 0 would quietly ship a Nina who tells no jokes AND is never funny.
    const tuning = coerceNinaTuning({ traits: { anger: 'loud' }, dials: null })
    expect(tuning.traits.funny).toBe(NINA_TRAIT_SPECS.funny.defaultScore)
    expect(tuning.traits.anger).toBe(NINA_TRAIT_SPECS.anger.defaultScore)
    expect(tuning.dials.profanity).toBe(NINA_DIAL_SPECS.profanity.defaultScore)
  })

  it('survives every hostile input a jsonb column or a form post can produce', () => {
    const hostile: readonly unknown[] = [
      null,
      undefined,
      {},
      { traits: 'nope' },
      { traits: [] },
      { traits: { anger: {} }, dials: 7 },
      { relationship: 42, wardrobe: [], notes: {}, revision: -9 },
      { traits: Object.create(null) },
    ]
    for (const input of hostile) {
      const tuning = coerceNinaTuning(input as NinaTuningInput)
      expect(Object.keys(tuning.traits).sort()).toEqual([...NINA_TRAITS].sort())
      expect(Object.keys(tuning.dials).sort()).toEqual([...NINA_DIALS].sort())
      expect(NINA_RELATIONSHIPS).toContain(tuning.relationship)
      expect(tuning.revision).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(tuning.revision)).toBe(true)
    }
  })

  it('round-trips a real tuning unchanged', () => {
    const traits = {} as Record<NinaTrait, number>
    for (const key of NINA_TRAITS) traits[key] = 73
    const dials = {} as Record<NinaDial, number>
    for (const key of NINA_DIALS) dials[key] = 11
    const input = {
      traits,
      dials,
      relationship: 'girlfriend' as const,
      wardrobe: 'a black cropped tank and shorts',
      notes: 'call him yang more often',
      revision: 4,
    }
    expect(coerceNinaTuning(input)).toEqual(input)
  })

  it('squashes the wardrobe to one line and caps both free-text fields', () => {
    // The wardrobe is ONE line: a newline inside an image prompt splits a sentence the provider
    // then reads as two.
    expect(coerceNinaWardrobe('  a grey  tank\nand shorts ')).toBe('a grey tank and shorts')
    expect(coerceNinaWardrobe('x'.repeat(500)).length).toBe(NINA_WARDROBE_MAX)
    expect(coerceNinaWardrobe(42)).toBe('')
    expect(coerceNinaNotes('a\r\nb\n\n\n\nc')).toBe('a\nb\n\nc')
    expect(coerceNinaNotes('x'.repeat(9000)).length).toBe(NINA_NOTES_MAX)
    expect(coerceNinaNotes(null)).toBe('')
  })
})

describe("NINA_TUNING_DEFAULTS is the Nina who ships today", () => {
  it('is exactly these values, read off the canon key by key', () => {
    // Every one of these is justified in its spec's `defaultBecause`, quoting the line of
    // persona.ts or prompts/*.ts it came from. Phases 2 and 3 must render today's text from THIS
    // record, so changing a number here is changing what "unchanged" means.
    expect(NINA_TUNING_DEFAULTS.traits).toEqual({
      anger: 0,
      chill: 50,
      sad: 0,
      flirty: 0,
      steamy: 0,
      wise: 50,
      annoying: 0,
      funny: 50,
      happy: 50,
      anxious: 0,
      concerned: 50,
    })
    expect(NINA_TUNING_DEFAULTS.dials).toEqual({
      profanity: 30,
      clinginess: 50,
      photoEagerness: 50,
      verbosity: 50,
    })
    expect(NINA_TUNING_DEFAULTS.wardrobe).toBe('')
    expect(NINA_TUNING_DEFAULTS.notes).toBe('')
    expect(NINA_TUNING_DEFAULTS.revision).toBe(0)
  })

  it('puts anger in the OFF band, which is the band phase 2 floors at rung 0', () => {
    // THE load-bearing default. ANGER_LADDER_BLOCK says "You do not choose how angry you are";
    // phase 2 makes it `max(computed, floor)` over `ANGER_FLOOR_BY_BAND`, whose `off` entry is 0 —
    // so `max(computed, 0) === computed` and today's ladder is arithmetically untouched. The floor
    // TABLE is phase 2's (it also has to map `low` and `mid` to 0, which a band index cannot); this
    // module only has to land the default in the band that table floors at zero.
    expect(ninaBand(NINA_TUNING_DEFAULTS.traits.anger)).toEqual({ index: 0, name: 'off' })
    expect(ANGER_LADDER[0]?.name).toBe('warm')
  })

  it('lands each default in the band phases 2 and 3 must render as today', () => {
    // The IDENTITY BAND, spelled out so a reader of phase 2 can see which case is "no change".
    const expected: Readonly<Record<string, NinaBandName>> = {
      anger: 'off',
      chill: 'mid',
      sad: 'off',
      flirty: 'off',
      steamy: 'off',
      wise: 'mid',
      annoying: 'off',
      funny: 'mid',
      happy: 'mid',
      anxious: 'off',
      concerned: 'mid',
      profanity: 'low',
      clinginess: 'mid',
      photoEagerness: 'mid',
      verbosity: 'mid',
    }
    for (const key of NINA_TRAITS) {
      expect(ninaBand(NINA_TUNING_DEFAULTS.traits[key]).name, key).toBe(expected[key])
    }
    for (const key of NINA_DIALS) {
      expect(ninaBand(NINA_TUNING_DEFAULTS.dials[key]).name, key).toBe(expected[key])
    }
  })

  it('is derived from the specs, so there is one source of truth per key', () => {
    for (const key of NINA_TRAITS) {
      expect(NINA_TUNING_DEFAULTS.traits[key], key).toBe(NINA_TRAIT_SPECS[key].defaultScore)
    }
    for (const key of NINA_DIALS) {
      expect(NINA_TUNING_DEFAULTS.dials[key], key).toBe(NINA_DIAL_SPECS[key].defaultScore)
    }
  })

  it('is frozen, because readNinaTuning hands this exact object to every caller', () => {
    expect(Object.isFrozen(NINA_TUNING_DEFAULTS)).toBe(true)
    expect(Object.isFrozen(NINA_TUNING_DEFAULTS.traits)).toBe(true)
    expect(Object.isFrozen(NINA_TUNING_DEFAULTS.dials)).toBe(true)
  })

  it('is reproduced by coercing nothing, as a fresh object rather than the singleton', () => {
    const coerced = coerceNinaTuning(null)
    expect(coerced).toEqual(NINA_TUNING_DEFAULTS)
    expect(coerced).not.toBe(NINA_TUNING_DEFAULTS)
    expect(Object.isFrozen(coerced)).toBe(false)
  })
})

describe('the module stays importable from a client component', () => {
  it('has no imports at all, and nothing server-only', () => {
    // Phase 5's `components/admin/CharacterPanel.tsx` is `'use client'` and imports this module
    // directly. The `lib/nina/crop.ts` rule; the property cannot be tested by importing, so it is
    // tested by reading. The same shape as `tests/nina.imagerecipe.test.ts`' RULING A6 assertion:
    // a test may reach where the consumer cannot.
    const source = readFileSync(
      fileURLToPath(new URL('../lib/nina/tuning.ts', import.meta.url)),
      'utf8',
    )
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/^\s*export\s+.*\bfrom\s+'/m)
    expect(source).not.toContain('server-only')
    expect(source).not.toContain('@/lib/db')
  })
})
```

**Impact:** a new suite, ~30 assertions, no existing test touched. It imports `ANGER_LADDER` from
`lib/nina/persona.ts` — a **read-only** import of a file phase 2 owns, which is deliberate and
recorded in the Interface Contract.

---

### Step 8: `tests/db.schema.nina.test.ts` — the new table and the new column

**File:** `tests/db.schema.nina.test.ts` — append after the `describe('nina_folders')` block
(line 287) and before `describe('nina_nags and nina_turns')` (line 289). The existing helpers
(`cfg`, `columns`, `sqlType`, `names`, `indexNames`, `fkFor`) cover this table exactly, which is
what the phase scope asked to check: the file's pattern extends to a new table with no new helper.

**Change:** two additions. First, extend the import at line 5 — no change needed
(`import * as schema from '@/lib/db/schema'` already covers it) — and add one import for the model:

```ts
import { NINA_DIALS, NINA_TRAITS } from '@/lib/nina/tuning'
```

placed after the `import * as schema` line, and a small local helper beside the others at line 43:

```ts
/** `photoEagerness` -> `photo_eagerness`. The one spelling difference between model and column. */
function snake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
```

**Code — the new block:**

```ts
describe('nina_tuning', () => {
  it('is one row per user, keyed by user_id alone, cascading from the account', () => {
    // One row per user, so there is no second fact to hang a surrogate id on — the `nina_nags` /
    // `nina_folders` natural-key idiom with one column instead of two. It is also what lets
    // `writeNinaTuning` be a single ON CONFLICT DO UPDATE that bumps `revision` in SQL.
    expect(cfg(schema.ninaTuning).name).toBe('nina_tuning')
    expect(columns(schema.ninaTuning).get('user_id')?.primary).toBe(true)
    expect(cfg(schema.ninaTuning).primaryKeys.length).toBe(0)
    expect(fkFor(schema.ninaTuning, 'user_id')?.onDelete).toBe('cascade')
  })

  it('spells exactly the twenty columns phases 3, 4 and 5 were written against', () => {
    expect(names(schema.ninaTuning)).toEqual(
      [
        'user_id',
        'relationship',
        // R1 — the eleven traits, in the order the user wrote them.
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
        // R3 — the four dials that each name a line of shipping code.
        'profanity',
        'clinginess',
        'photo_eagerness',
        'verbosity',
        'wardrobe',
        'notes',
        'revision',
        'updated_at',
      ].sort(),
    )
  })

  it('agrees with lib/nina/tuning.ts about every score column, which is the only duplication', () => {
    // `lib/nina/tuning.ts` must stay importable from a `'use client'` file, so it cannot import
    // this module — and this module must not import UPWARD from `lib/nina/`. So the two spell the
    // same fifteen keys independently, and THIS is what makes that checked rather than intended.
    // The RULING A6 shape: `tests/nina.imagerecipe.test.ts` does exactly this for NINA_BLOB_PREFIX.
    const declared = new Set(names(schema.ninaTuning))
    for (const trait of NINA_TRAITS) expect(declared.has(trait), trait).toBe(true)
    for (const dial of NINA_DIALS) expect(declared.has(snake(dial)), dial).toBe(true)
    expect(NINA_TRAITS.length + NINA_DIALS.length).toBe(15)
  })

  it('stores every intensity as an integer percent, never a float', () => {
    for (const key of [...NINA_TRAITS, ...NINA_DIALS.map(snake), 'revision']) {
      expect(sqlType(schema.ninaTuning, key), key).toBe('integer')
    }
  })

  it('carries NO SQL DEFAULT on any stored value — the defaults live in TypeScript', () => {
    // `NINA_TUNING_DEFAULTS` is the compatibility contract: the setting that reproduces the Nina
    // who ships. A `DEFAULT 50` here would be a second copy of it in a second language, drifting
    // silently. Instead: no row means the defaults, and `writeNinaTuning` always supplies all of
    // them because it takes a whole `NinaTuning`.
    for (const key of [
      'relationship',
      ...NINA_TRAITS,
      ...NINA_DIALS.map(snake),
      'wardrobe',
      'notes',
      'revision',
    ]) {
      expect(columns(schema.ninaTuning).get(key)?.notNull, key).toBe(true)
      expect(columns(schema.ninaTuning).get(key)?.hasDefault, key).toBe(false)
    }
    // The one exception, and it is not part of the contract: a timestamp.
    expect(columns(schema.ninaTuning).get('updated_at')?.hasDefault).toBe(true)
  })

  it('leaves relationship as plain text with no CHECK, so a sixth level is not a migration', () => {
    // The `nina_turns.trigger` argument: the vocabulary belongs to `lib/nina/tuning.ts`, and this
    // table must not become the thing a later phase has to migrate to add a level.
    expect(sqlType(schema.ninaTuning, 'relationship')).toBe('text')
    expect(cfg(schema.ninaTuning).checks.length).toBe(0)
  })

  it('has no index at all, because the only read is a primary-key lookup', () => {
    expect(indexNames(schema.ninaTuning)).toEqual([])
  })
})
```

**Code — the `nina_turns` addition.** Inside the existing `describe('nina_nags and nina_turns')`
block, append one `it`:

```ts
  it('records the tuning revision beside the prompt version, nullable and with no default', () => {
    // `prompt_version` dates the ASSEMBLER; `tuning_revision` dates the SETTING it assembled. With
    // a per-user character the first is no longer sufficient on its own. NULL means "a turn from
    // before the tuning existed" — distinct from 0, which means "she was on the shipping
    // character", so the two must not be spelled the same way.
    expect(sqlType(schema.ninaTurns, 'tuning_revision')).toBe('integer')
    expect(columns(schema.ninaTurns).get('tuning_revision')?.notNull).toBe(false)
    expect(columns(schema.ninaTurns).get('tuning_revision')?.hasDefault).toBe(false)
    // No FK: `nina_tuning` holds one CURRENT row per user, not a history, so there is nothing for
    // revision 7 to point at once 8 is saved. An audit pointer must not block a write.
    expect(fkFor(schema.ninaTurns, 'tuning_revision')).toBeUndefined()
  })
```

**Impact:** the existing `describe('the eight table names')` block is **not** touched — `nina_folders`
established that a table added by a later feature gets its own `describe` rather than being folded
into that count.

> **Implementation note.** `cfg(table).checks` and `cfg(table).primaryKeys` are both real fields of
> `getTableConfig`'s return type in drizzle-orm 0.45.2 (verified in
> `node_modules/drizzle-orm/pg-core/utils.d.ts:13-24`, which also carries `indexes`,
> `foreignKeys`, `uniqueConstraints`, `policies` and `enableRLS`). `primaryKeys` holds only
> COMPOSITE keys, which is why `nina_tuning`'s single-column key is asserted as
> `columns().get('user_id')?.primary` with `primaryKeys.length === 0` beside it — the same pair of
> facts `nina_folders` asserts from the other side.

---

## Verification

**Build:**

```bash
cd /home/miftah/.worktrees/run-insights/nina-character-tuning
npm run lint
npm run typecheck
```

**Tests:**

```bash
cd /home/miftah/.worktrees/run-insights/nina-character-tuning
npx vitest run tests/nina.tuning.test.ts tests/db.schema.nina.test.ts
npm test          # the whole suite must still be green — no existing test may change
```

**Guards** (all four must pass; none of them should have anything to say about this phase, and that
is the check):

```bash
npm run ci:data-layer-guard      # userId-first; scoped to lib/db/queries.ts, which is untouched
npm run ci:llm-payload-guard     # no model call from a render; this phase adds no call at all
npm run ci:client-secret-guard
npx drizzle-kit check            # the 0004 snapshot chains onto 0003
```

`drizzle-kit check` needs `DATABASE_URL_UNPOOLED` in the environment the same way `generate` does;
it does not connect either.

**Manual check:**

1. `git diff --stat` shows eight files and **nothing** under `lib/nina/persona.ts`,
   `lib/nina/prompts/`, `app/`, `components/`, or `lib/admin/`.
2. `grep -n '^import\|^export .*from' lib/nina/tuning.ts` prints nothing. If it prints anything at
   all, the hard constraint is broken and phase 5 cannot import the module.
3. `grep -rn 'readNinaTuning\|writeNinaTuning\|tuningRevision' --include=*.ts lib app components`
   returns only `lib/nina/queries.ts` and `lib/db/schema.ts`. Nothing reads the row yet.
4. Applying the migration is optional for this phase and is a production step, not a build step:
   `npm run db:migrate` with a real `.env.local`. The tree builds and tests pass without it,
   because nothing queries the table.

**Exit criteria:**

- `lib/nina/tuning.ts` exists, has zero imports, and exports every name in the Interface Contract.
- `readNinaTuning` on a user with no row returns `NINA_TUNING_DEFAULTS` rather than null.
- Every score clamps into 0–100, every non-integer floors, an unknown relationship degrades to
  `best_friend`, and `coerceNinaTuning` never throws on any input.
- `NINA_TUNING_DEFAULTS` is asserted, value by value, to be the today-equivalent setting, with each
  value's justification quoting the line of the canon it was read off.
- `ninaBand(NINA_TUNING_DEFAULTS.traits.anger).name === 'off'`, which is the band phase 2's
  `ANGER_FLOOR_BY_BAND` floors at rung 0 — so `max(computed, floor)` is today's ladder unchanged.
  There is no `ninaAngerFloor` in this module; the floor and the ceiling are phase 2's.
- The migration applies additively: one empty table, one nullable column, no `DROP`.
- `npm run lint`, `npm run typecheck` and `npm test` all pass, and Nina's behaviour is byte-for-byte
  what it was before the commit — because nothing reads the row.

## Handoffs

Work found and deliberately left to another phase.

**To phase 2 (`persona.ts`, `docs/nina/persona.md`):**
- The whole address block. `NINA_ADDRESS[relationship]`'s `addressRule` and `addressFallback` are
  the prompt text that replaces `NAME_RULES`. **Compose them; do not restate them.** A second copy
  of "call him bestie" in `persona.ts` is the two-sources-of-truth failure that file's own header is
  about — `ninaNameRules(tuning)` is two interpolations and no branch.
- **What is NOT here, and is phase 2's own:** the relationship's identity sentences and its claim on
  their history. `NINA_RELATIONSHIP_BLOCKS` in `persona.ts` carries `identity: readonly string[]`
  and `history: string` per level, and `best_friend`'s two `identity` sentences plus its `history`
  ARE today's `NINA_IDENTITY` paragraphs 1 and 5, character for character — which is what makes
  `ninaIdentity(NINA_TUNING_DEFAULTS)` byte-identical. This module carries no `stance` and no second
  description of any level.
- **The anger floor and ceiling are wholly phase 2's** — `ANGER_FLOOR_BY_BAND` /
  `ANGER_CEILING_BY_BAND` and the two functions over them, in `persona.ts`, beside `ANGER_LADDER`.
  This module deliberately does NOT export a `ninaAngerFloor`: the mapping is a decision about the
  ladder (off/low/mid all floor at rung 0, so the lower half of the slider is today's ladder), and a
  band index would have made `anger: 50` a permanent rung 2. Phase 2 owns applying it as
  `max(patterns[].nagLevel, floor)` capped at the ceiling, and owns rewriting `ANGER_LADDER_BLOCK`'s
  "You do not choose how angry you are" sentence — plus the DECAY clause at `persona.ts:239` and THE
  CAP at `:241`, both of which contradict a floor — with the repeal reason left in place.
  `NinaBandIndex` from this module is the return type, because it is exactly `AngerRung['level']`.
- **The identity band per key** is in `NINA_TRAIT_SPECS[key].defaultScore` /
  `NINA_DIAL_SPECS[key].defaultScore` and its band is asserted in `tests/nina.tuning.test.ts`.
  Phase 2's job is that the identity band renders **nothing at all** — the band that reproduces
  today's text is today's text, and today's text already ships. **The defaults are NOT uniformly
  `'mid'`**, and this is the single most important thing phase 2 has to absorb:

  | Band at the default | Keys |
  |---|---|
  | `off` | `anger`, `sad`, `flirty`, `steamy`, `annoying`, `anxious` |
  | `low` | `profanity` |
  | `mid` | `chill`, `wise`, `funny`, `happy`, `concerned`, `clinginess`, `photoEagerness`, `verbosity` |

  So phase 2's band table must leave `bands.off` **undefined** for the six default-`off` traits (an
  `off` paragraph there would render at the default and break invariant 2 — six paragraphs of it)
  and `bands.low` undefined for `profanity`. The mechanism phase 2 implements is *skip the key's own
  identity band*, read from these specs, so the rule cannot be got wrong per key by hand.
- **`ANGER_LADDER` must keep five rungs.** `tests/nina.tuning.test.ts` asserts
  `NINA_BAND_NAMES.length === ANGER_LADDER.length`. If phase 2 needs to change the ladder's length,
  the band count changes with it and this plan's justification for five needs rewriting.
- `NINA_APPEARANCE`'s wardrobe seam is phase 2's per the index. `NinaTuning.wardrobe` is `''` by
  default and `''` means "use today's heather-grey tank", which is what makes the seam
  behaviour-neutral.

**To phase 3 (`prompts/*`, `turn.ts`, `actions.ts`, `proactive.ts`):**
- `NinaTurnInsert.tuningRevision` already exists and `insertNinaTurn` already writes it. Pass
  `tuning.revision`; do **not** re-add the field or the column.
- `readNinaTuning(userId)` is the read for both `Promise.all`s (the chat action, and **both**
  `loadNinaContext` sites in `proactive.ts`). It never returns null, so no `??` is needed anywhere.
- The `concerned` dial's band is what gates `OUTPUT_RULE`'s "No greeting unless…" clause — its spec
  says so.
- The `verbosity` dial's path names `SEND_TOOL.bubbles` and `OUTPUT_RULE`; the `photoEagerness`
  dial's names `GENERATE_IMAGE_TOOL`. Both are phase 3's to act on, and **phase 3 has declined both
  tool-schema edits in writing** — the measurement in `prompts/tools.ts` (one extra clause on one
  description, 5/6 -> 2/4 valid on the first attempt) is the reason, and the two dials land in
  `prompts/system.ts` instead: the bubble PREFERENCE line inside `OUTPUT_RULE`, and a
  `── THE CAMERA ──` block. The `path` strings here still name the schema lines because that is
  where the fence they move actually is; the prompt text that moves it lives in `system.ts`.
- The dials are NESTED: `tuning.dials.verbosity`, `tuning.dials.photoEagerness`. The traits are
  `tuning.traits.concerned`. There are no flat dial members on `NinaTuning`.
- `NINA_PROMPT_VERSION` is phase 3's single bump. This phase does not touch it.

**To phase 4 (the camera and the promise):**
- `NinaTuning.wardrobe` is one line, already whitespace-collapsed and capped at
  `NINA_WARDROBE_MAX = 200`, safe to interpolate into an image prompt with no further cleaning.
  `''` means "no override".
- **The shape is NESTED.** `tuning.traits.steamy`, `tuning.traits.flirty`,
  `tuning.dials.photoEagerness` — never `tuning.steamy`. `wardrobe` is a `string` (`''` = no
  override), never `null` or `undefined`, so `tuning.wardrobe.trim()` needs no optional chain.
- The `steamy` and `flirty` traits and the `photoEagerness` dial are the keys phase 4 reads.
  **`ninaBand()` is the resolver and it is the ONLY vocabulary** — band `high` begins at 60 and
  `max` at 80. Phase 4 must not define a private threshold: a slider whose panel label says `high`
  while the camera privately wants 67 is a dial the operator cannot predict, and the panel renders
  the band name.
- The optional `reward` field on `NinaPendingPromise` is **phase 4's** — a jsonb slot value costing
  no migration, by the `jobId`/`firedOn`/`attempts` argument. `0004` deliberately does not add it.

**To phase 5 (the panel):**
- Import `lib/nina/tuning.ts` directly from the `'use client'` file. `NINA_TRAITS` is the slider
  order, `NINA_TRAIT_SPECS[key].label` and `.axis` are the label and the help text,
  `NINA_RELATIONSHIPS` + `NINA_ADDRESS[r].label` are the radio group, `NINA_ADDRESS[r].words` are
  the words to show beside each option, `NINA_DIALS` + `NINA_DIAL_SPECS` are the four dials, and
  `NINA_TUNING_DEFAULTS` is the reset target.
- **The panel writes no second copy of any of that.** No table of eleven labels, no table of five
  relationship labels, no retyped list of the words she calls him. `label` / `axis` / `words` /
  `userSaid` are here precisely so the panel is a renderer: a second table is a second thing to keep
  in step, its drift is invisible (the panel says one thing, the prompt does another), and the copy
  the operator most needs to trust is the copy that says what a dial will actually do. Editorial
  commentary the panel wants to add on top ("this option is what repealed the old rule") is the
  panel's own and belongs in a hint field beside these, never instead of them.
- The names are `NINA_TRAITS`, `NINA_DIALS`, `NINA_SCORE_MIN`, `NINA_SCORE_MAX` — not
  `NINA_TRAIT_KEYS` / `NINA_DIAL_KEYS` / `NINA_DIAL_MIN` / `NINA_DIAL_MAX`.
- `writeNinaTuning` returns `Promise<NinaTuning>` — the whole stored row, not the revision number.
  The new revision is `(await writeNinaTuning(...)).revision`.
- Phase 5's Zod boundary should reuse `NINA_SCORE_MIN`/`NINA_SCORE_MAX`,
  `NINA_WARDROBE_MAX`/`NINA_NOTES_MAX` and `NINA_RELATIONSHIPS` rather than re-spelling any of
  them. `writeNinaTuning` coerces again anyway — Zod's job there is a good error message, not the
  invariant.
- **Reset is a write, not a delete:** call `writeNinaTuning(userId, <defaults minus revision>)`,
  which bumps the revision and records that the operator did something. There is no
  `deleteNinaTuning` and there should not be one.
- `revision === 0` means "never saved", which is the honest signal for a "using the shipping
  character" badge and for whether the panel should start collapsed.
- **Not provided, and phase 5 should decide whether it wants it:** `NinaTuning` carries no
  `updatedAt`. It is row metadata, not character, and putting it in the model would put a `Date` in
  a value phase 5 serialises to a client component. If the panel wants "last saved at", that is a
  second read or a widened return type, and it is phase 5's call.

**To phase 6 (the sweep):**
- `NINA_DIAL_SPECS[key].path` is the grep list for "does a surviving rule contradict this dial".
  Four paths, all in `lib/nina/`.
- The header of `lib/nina/tuning.ts` records four dials that were **rejected** on the evidence
  (`jealousy`/`mysteriousness`/`patience`, `emojiRate`, `memoryHunger`, `medicalCandour`). If the
  sweep wants to revisit one, the reasoning is in the file where the decision was taken — the
  `check-llm-payload-boundary.mjs` shape.
- `lib/db/.workflows/package_readme.md` is **not** updated by this phase; phase 6 owns it and its
  plan already carries the `nina_tuning` inventory row and the `0004` note.
  **`lib/nina/.workflows/` does not exist** — verified — so there is no `lib/nina` readme for
  anybody in this set to update, and creating one for the largest package in the repo is a separate
  `/update-readme` card (phase 6's H-5), not a line item here.

**Deliberately not done, and not anyone's:**
- No CHECK constraint on the score columns. A CHECK would make widening the scale a migration, and
  a value outside 0–100 is a bug in one writer rather than a state the reader cannot survive —
  `clampNinaScore` survives it.
- No `nina_tuning_history` table. `nina_turns.tuning_revision` plus a revision counter answers
  "which setting produced that turn" as an ordinal; a full history is a different feature, and the
  operator can read the current row.
- No cache. `lib/admin/memoryActions.ts` records why: `revalidatePath` re-renders the admin page and
  is **not** how the edit reaches Nina — the turn path reads live with no cache anywhere, which is
  what makes R1's slider immediate. Adding one here would break that property.

## Rollback

This phase is one commit on `feature/nina-character-tuning`, so `git revert <sha>` backs it out and
nothing else in the set depends on it having stayed.

**The one caveat is the migration, and it is inert.** `drizzle/0004_nina_persona_tuning.sql` is
additive: an empty table and one nullable column. Reverting the code leaves an unread table and an
unread column behind, which is exactly what the plan's Rollback section anticipated. **Do not hand-
edit the journal to un-apply it** — dropping them is optional, and if it is wanted it is a separate
`0005_*` migration generated the same way:

```sql
ALTER TABLE "nina_turns" DROP COLUMN "tuning_revision";
DROP TABLE "nina_tuning";
```

**Reverting only part of the phase is not useful.** `lib/nina/tuning.ts` with no table is a module
nothing can persist; the table with no module is twenty columns nothing can read. Revert the commit
or keep it.

**Behavioural rollback is a no-op**, because there is nothing to roll back: no prompt, no turn, no
image and no page changes in this phase. That is the whole reason it is safe to land first.
