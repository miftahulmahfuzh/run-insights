# Phase 1: The sixth character, and the 3x2 grid

**Plan set:** `NINA_INSTRUCTOR_CHARACTER_PLAN.md`
**Analysis:** `20260907-075444-INST_code_analyzer.md`
**Satisfies:** R1 (*"a nice 3 columns x 2 rows"*), R2 (*"add a new character: Instructor"* — a professional, knowledgeable coach whose objective is his running getting faster)
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina` (plus `lib/admin`, `components/admin`, `lib/db`)

---

## Goal

`NINA_RELATIONSHIPS` gains a sixth member, `'instructor'`, and every one of its readers — the four
the compiler enforces and the four it cannot see — is filled in. Selecting **Instructor** on
`/admin/personality` and saving produces a prompt in which Nina is a professional running coach who
prescribes training, calls him by his nickname and *"atlet"*, and never reads a number as a symptom.
The character grid renders six cards as a rectangle rather than a ragged 3 + 2, with equal-height
rows from `sm` up. The five existing levels render byte for byte, the frozen snapshot passes
**unregenerated**, and `NINA_DEFAULT_RELATIONSHIP` is still `best_friend`.

The coaching *mechanics* — what she does with a fired `REPEATED_HIGH_AVG_HR`, the training schedule,
the proactive suffix — are not here. Phase 3 adds them on top of the identity this phase writes.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts.

**Creates:**

- `NINA_RELATIONSHIPS[5] === 'instructor'` (`lib/nina/tuning.ts:321-329`) — the exact spelling is
  `'instructor'`, lowercase, no underscore, **appended at index 5** (decision D1). `NinaRelationship`
  widens to six members derived from the array; `isNinaRelationship('instructor')` becomes true and
  `z.enum(NINA_RELATIONSHIPS)` in `lib/admin/schema.ts:465` accepts it **with no edit there**.
- `NINA_ADDRESS.instructor` (`lib/nina/tuning.ts`, appended after `girlfriend`) —
  `source: 'nickname'`, `words: ['atlet']`, non-empty `addressRule` and `addressFallback`, no
  `stance` field.
- `NINA_RELATIONSHIP_BLOCKS.instructor` (`lib/nina/persona.ts`, appended after `girlfriend`) — a
  six-sentence `identity` array and a one-string `history`.
- `RELATIONSHIP_NOTE.instructor` (`lib/admin/tuningModel.ts`).
- `RELATIONSHIP_GLOSS.instructor` (`lib/nina/prompts/distill.ts`).

**The address token phase 3 and the tests may rely on:** **`atlet`**. It appears nowhere else in the
repo (verified: `grep -rn atlet lib/ components/ tests/ app/` is empty) and appears in no other
level's `NINA_ADDRESS` entry or `NINA_RELATIONSHIP_BLOCKS` entry. It is the token added to the
`Record<NinaRelationship, string>` at `tests/nina.prompts.test.ts:520`, and
`tests/nina.tuning.test.ts` gains a case that keeps it exclusive.

**Deletes:** nothing.

**Renames:** nothing. **In particular the `it(...)` title at `tests/nina.prompts.test.ts:220` is NOT
renamed** — see Step 10; it is the snapshot key.

**Value changes:**

- `NINA_DISTILL_PROMPT_VERSION` `2` -> `3` (`lib/nina/prompts/distill.ts:21`). **This is the single
  librarian-prompt bump for the whole set and it is this phase's alone** — reconciliation decision
  **D6**. It is a *different* constant from `NINA_PROMPT_VERSION` (which is phase 3's, `4` -> `5`,
  and which this phase does not touch). Step 5d is the edit. Phase 2 changes the same rendered
  librarian prompt indirectly through `SLOT_VOCABULARY_BLOCK` and **must not also bump it**; the
  whole set merges as one branch, so one bump covers both edits.

**Signature changes:** none. `ninaIdentity`, `ninaNameRules`, `coerceNinaRelationship`,
`ninaActiveRelationship`, `buildDistillSystemPrompt` and `relationshipCopy` all keep their
signatures and their bodies; they index records that gained a key.

**Reworded prose (the compiler cannot check any of these):**

| Site | What becomes false without the edit |
|---|---|
| `lib/nina/tuning.ts:44` | *"`NINA_SLOT_KEYS` stays at nine"* would read as a prohibition against phase 2's tenth slot |
| `lib/nina/tuning.ts:318` | *"The five levels, in the order the user wrote them"* |
| `lib/nina/tuning.ts:352` | *"all five rules lean on a nullable field"* |
| `lib/nina/persona.ts:541` | *"Empty at four of the five levels"* (the manja register) |
| `lib/nina/persona.ts:587` | *"never null on any of the five levels"* |
| `lib/nina/prompts/distill.ts:41` | *"the only thing that matters — the five keys"* |
| `lib/nina/prompts/distill.ts:105` | the hardcoded prose list of address forms the librarian is shown |
| `lib/db/schema.ts:1686` | the `nina_tuning.relationship` union, spelled out |

**Requires (from earlier phases):** nothing. This phase runs first or concurrently with phase 2.

**Leaves alone (owned by others):**

- `lib/nina/memory.ts`, `lib/admin/memoryVocab.ts`, the `memory.slots` paragraph of
  `buildContextGuide` — **phase 2**. This phase only reworks the *comment* at `tuning.ts:44` that
  phase 2's tenth slot would otherwise be read as violating; it adds no slot key.
- `lib/nina/prompts/system.ts` (all of it, including the `"patterns"` paragraph and
  `angerSourceClause`), `lib/nina/prompts/index.ts`, `NINA_PROMPT_VERSION` (stays **4**), the
  instructor's coaching block — **phase 3**.
- `NINA_NOT_A_DOCTOR` (`lib/nina/persona.ts:403`), `NEVER_SAY`, `ANGER_FLOOR_BY_BAND` /
  `ANGER_CEILING_BY_BAND`, `lib/nina/patterns.ts`, `lib/nina/proactive.ts`, `lib/nina/context.ts`,
  `lib/nina/prompts/tools.ts`, `drizzle/` — nobody's, this set.
- `lib/admin/schema.ts` — **no relationship edit is needed or made here**: `z.enum(NINA_RELATIONSHIPS)`
  at `:465` reads the array and widens for free. Phase 2 owns a *comment-only* edit to the
  `slotKeySchema` docstring at `:107` (the slot count), so this phase must leave that file out of its
  diff entirely.
- `NINA_DEFAULT_RELATIONSHIP` — unchanged, `best_friend`.
- `tests/__snapshots__/nina.prompts.test.ts.snap` — **not one byte changes**. `vitest -u` is
  forbidden.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/tuning.ts` | modify | append `'instructor'` (`:321`); append `NINA_ADDRESS.instructor` (`:441`); reword three comments (`:44`, `:318`, `:352`) |
| `lib/nina/persona.ts` | modify | append `NINA_RELATIONSHIP_BLOCKS.instructor` (`:305`); reword two comments (`:541`, `:587`) |
| `lib/admin/tuningModel.ts` | modify | `RELATIONSHIP_NOTE.instructor` (`:172`) |
| `lib/nina/prompts/distill.ts` | modify | `RELATIONSHIP_GLOSS.instructor` (`:50`); the docstring at `:41`; the prose address list at `:105`; **`NINA_DISTILL_PROMPT_VERSION` `2` -> `3` (`:21`) — D6** |
| `lib/db/schema.ts` | modify | the `relationship` docstring union (`:1686`) |
| `components/admin/CharacterPanel.tsx` | modify | one class string (`:265`) plus the comment explaining it |
| `tests/nina.tuning.test.ts` | modify | the exact array (`:159`), the per-level address assertions (`:176`, `:188`), one new exclusivity case |
| `tests/admin.tuning.test.ts` | modify | `toHaveLength(5)` -> `6` (`:105`) and the case title |
| `tests/nina.prompts.test.ts` | modify | exclude `instructor` from the snapshot guard **body only** (`:220`); the token record (`:520`); two new instructor cases; two "five" titles |

Nine files. **No file is shared with phase 2** (verified by the reconciler: phase 2's six files are
`lib/nina/memory.ts`, `lib/admin/memoryVocab.ts`, `lib/admin/memoryModel.ts`, `lib/admin/schema.ts`
and its two memory test files, and none of them appears above).

Two files are shared with **phase 3**, which depends on this phase and therefore lands after it:
`lib/nina/persona.ts` (phase 3 appends a *different* export — the coaching block — and edits
*different* comments) and `tests/nina.prompts.test.ts` (phase 3 appends a new `describe` and two
import names; it edits none of the cases this phase touches). Both overlaps are append-only in
distinct regions. The consequence for phase 3 is the line drift named in Handoffs.

---

## Implementation Steps

### Step 1: Append `'instructor'` to the union, and retell the order story

**File:** `lib/nina/tuning.ts:317-327`

**Change:** the array gains a sixth entry and the docstring stops claiming five. D1's reasoning goes
into the file, because the next reader will ask why a coach sits after a girlfriend on an axis
labelled "least-to-most intimate".

**Code** — replace lines 317-327 (the docstring through `] as const`) with:

```ts
/**
 * **Six levels. The first five are the ones the user wrote, in his order**, which is also
 * least-to-most intimate. Snake case because the value goes into a `text` column and into a radio
 * group's `value`.
 *
 * `'instructor'` is APPENDED, and it is deliberately NOT on that axis: a coach is neither more nor
 * less intimate than a girlfriend, so no insertion point among the five is more truthful than the
 * end. Appending also keeps every existing index stable and leaves the panel's reading order
 * sensible — row 1 is nobody / casual friend / sister, row 2 is best friend / girlfriend /
 * instructor. She is a PROFESSIONAL relation rather than a personal one, and
 * `NINA_RELATIONSHIP_BLOCKS.instructor` in `lib/nina/persona.ts` is where that is said in prose.
 */
export const NINA_RELATIONSHIPS = [
  'nobody',
  'casual_friend',
  'sister',
  'best_friend',
  'girlfriend',
  'instructor',
] as const
```

**Impact:** `NinaRelationship` widens. Four sites stop compiling until Steps 2-5 land:
`NINA_ADDRESS`, `NINA_RELATIONSHIP_BLOCKS`, `RELATIONSHIP_GLOSS` (via `satisfies`) and the token
record in `tests/nina.prompts.test.ts`. `RELATIONSHIP_NOTE` is `Record<string, string>` and does
**not** fail the build — Step 4 is the one an implementer can forget, which is why
`tests/admin.tuning.test.ts` asserts a non-empty hint for every level.

---

### Step 2: `NINA_ADDRESS.instructor` — what she calls him as a coach

**File:** `lib/nina/tuning.ts:441` (insert a new entry between the closing `},` of `girlfriend` and
the `}` that closes `NINA_ADDRESS`)

**The design call, stated.** `source: 'nickname'` with one literal coach word in `words`. That is
exactly `best_friend`'s shape (`source: 'nickname'`, `words: ['bestie']`) and it is right for a
coach: a professional uses a person's name, not a pet name and not a full legal name — the full name
is `nobody`'s whole definition and must stay distinctive to it. The literal word is **`atlet`**,
which is what an Indonesian trainer actually calls the person they train, and which cannot plausibly
appear in another level's block. `nickname` was rejected as the *token* for the prompt test because
`casual_friend` already owns it.

**Register.** She stays in Jakarta Indonesian and stays on `lo`/`gw`.
`JAKARTA_REGISTER` (`lib/nina/persona.ts:464`) says *"Second person is 'lo' (sometimes 'lu'). Never
'kamu'. Never 'Anda'."* at **every** level, and `tests/nina.prompts.test.ts` asserts it. Professional
here means competent and direct, **not** formal pronouns.

**Code:**

```ts
  instructor: {
    relationship: 'instructor',
    label: 'Instructor',
    source: 'nickname',
    words: ['atlet'],
    addressRule:
      '"runner.nickname" is what you call him, the way a coach uses a name: at the start of a verdict or an instruction, once, and not in every line. "atlet" is the other thing you call him, and it is the coach word — you reach for it when you are setting the week, handing him a session, or telling him what a number means. "oke atlet, minggu ini kita turunin dulu intensitasnya". No pet names and no endearments at this level; those belong to a different relationship with him.',
    addressFallback:
      'If "runner.nickname" is null it costs you little, because "atlet" covers it. Ask him once, plainly, the way you would ask a new client at the clinic: "gw catet lo sebagai siapa nih?" Do not invent a nickname from "runner.fullName" and do not use the full name at him.',
  },
```

Both strings are apostrophe-free on purpose, so prettier keeps them single-quoted with no escapes,
matching the other five entries.

**Impact:** `ninaNameRules(tuning)` (`persona.ts:583`) composes these two verbatim with no branch —
`addressFallback` is non-empty, which is what `tests/nina.tuning.test.ts:188` requires of every
level. `NINA_ADDRESS` compiles again. `relationshipCopy('instructor').label` becomes `'Instructor'`
and its hint gains the `atlet. ` prefix, with no edit to `relationshipCopy`.

---

### Step 3: `NINA_RELATIONSHIP_BLOCKS.instructor` — who she is

**File:** `lib/nina/persona.ts:305` (insert between the closing `},` of `girlfriend` and the `}` that
closes `NINA_RELATIONSHIP_BLOCKS`)

**What this block does and does not carry.** It is who she *is*: professional, credentialed, and
pointed at his performance. The gift the analysis found is promoted rather than restated —
`NINA_WHERE_SHE_LIVES` already tells her, at every level, *"You work at a sports clinic as a
physiotherapist and strength coach, which is why you know what you know."* Sentence 3 turns that
standing credential into the reason the conversation exists, and claims nothing new about her.

It carries **no coaching mechanics**: no `patterns`, no `PatternCode`, no schedule, no prescription
for a high average HR. Those are phase 3's and phase 2's. It reads complete without them, and
sentence 4 is the hook they hang on.

Sentence 4 is decision **D4** in her voice, and it is written as a *positive* statement of her remit
rather than a second copy of `NINA_NOT_A_DOCTOR` — that guardrail already forbids the diagnosis and
is unedited, and duplicating a rule is exactly what invariant 4 forbids.

**Code:**

```ts
  instructor: {
    relationship: 'instructor',
    identity: [
      'You are his running coach. This is a professional relationship and not a friendship with training in it: he is the runner, you are the one who trains him, and the point of every conversation is that he runs better than he did last month.',
      'His performance is your job and you treat it as a job. You say so when the work lands, you say what went wrong when it does not — once, plainly — and then you say what happens next.',
      'You know what you are talking about and you sound like it. The physiotherapy and the strength work at the clinic are not background colour here: they are the reason he is asking you instead of the internet. Answer with the confidence of somebody who does this for a living, and say plainly when something is outside what you know.',
      'What you prescribe is training — sessions, paces, weeks, rest. You do not read his numbers as symptoms and you are not a clinician at him; a number that worries you is a reason to change the training, and changing the training is where you take it.',
      'Closeness is not what this is. The teasing, the sulking and the family bluntness are not yours; being direct is. This is what happened, this is why, this is what we do about it.',
      'You do not dig into his life for its own sake. What he tells you about work, sleep or stress matters because it lands on his training, and that is the reason you ask about it.',
    ],
    history:
      'You have been coaching him a while and you talk like somebody who has watched the training happen. You are not meeting him for the first time unless the conversation you are handed is empty.',
  },
```

**Impact:** `ninaIdentity(withRelationship('instructor'))` renders paragraph 1 as
`NINA_PREAMBLE + ' ' + identity.join(' ')` and the last paragraph as `history`, with the three fixed
paragraphs in between untouched. `best_friend`'s entry is not read, not moved and not reformatted, so
`ninaIdentity(NINA_TUNING_DEFAULTS)` is byte-identical.

**Checked against the leak assertions.** None of these sentences contains `sayaangg`, `"manja"`,
`"imut"` or any `GIRLFRIEND_VOICE_EXAMPLES` line, so `tests/nina.prompts.test.ts:621` (which iterates
every non-`girlfriend` level, now including `instructor`) stays green with no edit. None contains
`atlet` either — the coach word reaches the render through `ninaNameRules`, from one home.

---

### Step 4: `RELATIONSHIP_NOTE.instructor` — the panel's hint

**File:** `lib/admin/tuningModel.ts:172` (append after the `girlfriend` line, inside
`RELATIONSHIP_NOTE`)

**Code:**

```ts
  instructor:
    'Professional. She coaches, and your running getting faster is the point of the conversation.',
```

Pre-broken across two lines because the single-line form is 108 columns and prettier's `printWidth`
is 100. `relationshipCopy('instructor')` then yields
`hint === 'atlet. Professional. She coaches, and your running getting faster is the point of the conversation.'`
— the words come from `NINA_ADDRESS[value].words`, joined, never retyped here.

**Impact:** this record is `Record<string, string>`, so **the build does not catch a missing entry**;
`tests/admin.tuning.test.ts` (Step 9) is what does.

---

### Step 5: the distiller — the gloss, and the prose list it cannot typecheck

**File:** `lib/nina/prompts/distill.ts`

**5a — `RELATIONSHIP_GLOSS.instructor` (`:50`).** Append after the `girlfriend` entry, before
`} as const satisfies Record<NinaRelationship, string>`:

```ts
  instructor: 'his running coach, who uses his nickname and calls him "atlet"',
```

**5b — the docstring at `:41`.** Replace:

```
 * on the only thing that matters — the five keys — and the words themselves are quoted from
```

with:

```
 * on the only thing that matters — the six keys — and the words themselves are quoted from
```

**5c — the hardcoded prose list at `:105`, the failure the compiler cannot see.** Inside the
`WHAT THE TWO OF THEM CALL EACH OTHER` paragraph, replace the fragment:

```
a full name, a nickname, "bro", "bestie", or "yang" / "sayang" / "beb" / "baby".
```

with:

```
a full name, a nickname, "bro", "bestie", "yang" / "sayang" / "beb" / "baby", or "atlet".
```

The order follows `NINA_RELATIONSHIPS`, so `'atlet'` goes last exactly as `'instructor'` does.

**Impact:** the librarian is told the sixth register exists, so it does not file *"he is called
atlet"* as a standing biographical fact about him — the quiet failure named in the analysis's
Entry Point D. `DISTILL_SYSTEM_PROMPT` is `buildDistillSystemPrompt(NINA_TUNING_DEFAULTS.relationship)`
and its bytes **do** change here, by one clause in 5c. That is intended and unguarded: no snapshot
covers the distiller prompt, and `NINA_DISTILL_PROMPT_VERSION` is a different constant from
`NINA_PROMPT_VERSION` — which is why 5d bumps it and why that bump is **not** the one invariant 6
counts.

**5d — `NINA_DISTILL_PROMPT_VERSION` `2` -> `3` (`:12-21`). Reconciliation decision D6: this phase
owns the set's single librarian bump.**

The constant's own docstring is the rule: *"Bumped by hand whenever the text or the tool schema below
changes."* 5c changes that text. Phase 2's tenth slot changes the *same* rendered prompt indirectly
(one more `SLOT_VOCABULARY_BLOCK` line, one more `slotKey` tool-enum member) but does not edit this
file. The version identifies the librarian prompt **as it ships**, and the whole set merges as one
branch, so **one** bump covers both edits and it belongs to the phase that already owns this file's
bytes. Phase 2 must not also bump it; phase 3 does not touch `distill.ts` at all. Note the docstring
already draws the line this decision follows: this constant *"covers the librarian, which is a
different model call with a different system prompt, and it moves on its own schedule"* — so index
invariant 6, which fixes exactly one `NINA_PROMPT_VERSION` bump in phase 3, does not reach it.

**Code** — replace lines 12-21 (the docstring through the constant) with:

```ts
/**
 * Bumped by hand whenever the text or the tool schema below changes. Logged, never sent.
 *
 * 3 — the nina-instructor-character set. The librarian was told the sixth relationship exists:
 * `RELATIONSHIP_GLOSS.instructor` is a new gloss it can be handed, and the hardcoded address-forms
 * list below gained `"atlet"` so the coach word is read as REGISTER and not filed as a standing
 * fact about him. The same set's tenth memory slot (`training_plan`) reaches this prompt without an
 * edit here, through `SLOT_VOCABULARY_BLOCK` and the `slotKey` enum — **this single bump covers
 * both**, because the set merges as one branch and this constant identifies the prompt as it ships.
 *
 * 2 — the librarian was told what the relationship is, and told that the couple's own register is
 * not a fact about him. **This constant is not `NINA_PROMPT_VERSION`**: that one covers Nina's own
 * voice and her tool schemas and is bumped exactly once per plan set, by the phase that edits
 * `prompts/system.ts`. This one covers the librarian, which is a different model call with a
 * different system prompt, and it moves on its own schedule.
 */
export const NINA_DISTILL_PROMPT_VERSION = 3
```

**Impact:** logging only — the constant is *"logged, never sent"* and nothing asserts its value in
`tests/` (verified). A missed bump is a logging inaccuracy rather than a red build, which is exactly
why it needed assigning rather than leaving to whoever noticed.

---

### Step 6: the schema docstring

**File:** `lib/db/schema.ts:1685-1686`

**Change:** the `nina_tuning.relationship` docstring spells the union out in prose. It is a
documentation site that goes stale silently, and the column itself is unchanged `text` — **no
migration, no `.$type<>()`, no `drizzle/` file.**

**Code** — replace:

```ts
  /**
   * `NinaRelationship` from `lib/nina/tuning.ts` — one of `'nobody' | 'casual_friend' | 'sister' |
   * 'best_friend' | 'girlfriend'`. Untyped `text` on purpose; see the header.
   */
  relationship: text('relationship').notNull(),
```

with:

```ts
  /**
   * `NinaRelationship` from `lib/nina/tuning.ts` — one of `'nobody' | 'casual_friend' | 'sister' |
   * 'best_friend' | 'girlfriend' | 'instructor'`. Untyped `text` on purpose; see the header.
   */
  relationship: text('relationship').notNull(),
```

**Impact:** documentation only. An existing row reading `'instructor'` after a revert degrades
through `coerceNinaRelationship` to `best_friend` without throwing, which is why the column is
untyped in the first place.

---

### Step 7: the two comments that would misdirect the other phases

**7a — `lib/nina/tuning.ts:43-46`, the one phase 2 must not read as a prohibition.**

Replace:

```ts
 * ── WHY THIS IS NOT A MEMORY SLOT ─────────────────────────────────────────────────────────────
 * `NINA_SLOT_KEYS` stays at nine. `lib/nina/prompts/distill.ts` may overwrite any slot not marked
 * `source: 'admin'`, so a tuning in a slot is a character the distiller eventually rewrites — and
 * `buildSlotCards` would render fifteen integers as free-text prose.
```

with:

```ts
 * ── WHY THIS IS NOT A MEMORY SLOT ─────────────────────────────────────────────────────────────
 * **This is an argument about THE TUNING; it is not a cap on `NINA_SLOT_KEYS`.**
 * `lib/nina/prompts/distill.ts` may overwrite any slot not marked `source: 'admin'`, so a tuning
 * in a slot is a character the distiller eventually rewrites — and `buildSlotCards` would render
 * fifteen integers as free-text prose. Neither reason bears on a PROSE slot the distiller is
 * supposed to write, so how many keys `lib/nina/memory.ts` declares is that file's decision and
 * not a rule this comment gets to make.
```

The `── ` heading line is copied unchanged, character for character, so the box stays aligned. Every
new line is under 100 columns and none begins with `import`, which
`tests/nina.tuning.test.ts:573-577` scans this file's raw source for.

**7b — `lib/nina/tuning.ts:352`.** Replace:

```
 * `addressRule`, so all five rules lean on a nullable field somewhere and a prompt that tells her
```

with:

```
 * `addressRule`, so all six rules lean on a nullable field somewhere and a prompt that tells her
```

Still true: `instructor` is `source: 'nickname'` and leans on `RunnerFacts.nickname`, which is
nullable, and it states a fallback. The sentence above it — *"The two `'literal'` levels"* — is also
still true: `sister` and `girlfriend` remain the only two.

---

### Step 8: two comments in `persona.ts` that count the levels

**8a — `lib/nina/persona.ts:541`.** Replace:

```
 * Empty at four of the five levels, and `renderSections` in `lib/nina/prompts/system.ts` drops an
```

with:

```
 * Empty at five of the six levels, and `renderSections` in `lib/nina/prompts/system.ts` drops an
```

**8b — `lib/nina/persona.ts:587`.** Replace:

```
   * of the five levels, so there is no branch here: two paragraphs, always.
```

with:

```
   * of the six levels, so there is no branch here: two paragraphs, always.
```

**Impact:** comments only. `ninaManjaRegisterBlock` still returns `''` unless `isGirlfriend(tuning)`,
so the instructor gets no manja register and none of the other five changes.

Deliberately **not** touched, because each is a historical statement that was true when written and
whose rewrite would erase a recorded decision: `persona.ts:169` (*"of the five settings
unreachable"*), `persona.ts:183` (*"R2's five address forms"*), `persona.ts:176` (*"girlfriend's is
six"*), and `distill.ts:63-70` (*"true of exactly one of the five settings"*).

---

### Step 9: R1 — equal-height cells, so six cards read as a rectangle

**File:** `components/admin/CharacterPanel.tsx:265`

**What is actually ragged, verified rather than assumed.** The analysis reads
`flex items-start gap-2 rounded-card bg-paper-2 p-3` on the `<label>` and concludes *"a cell is
exactly as tall as its own hint and adjacent cells in a row do not match."* **The second half of
that is not what the CSS does, and the fix follows from the correction:**

- `items-start` is on the **label**, which is `display: flex`. It sets that label's *own*
  `align-items`, which aligns the radio `<input>` against the text `<span>` **inside** the card. It
  has no effect on how the label is aligned in its grid area.
- The grid container declares no `align-items`, so it is `normal`, which for grid items **behaves as
  `stretch`**. Every label has `height: auto` and no auto margins, so each one already stretches to
  its row's height. **Within a row, the cards are already equal.**
- What is *not* equal is **row to row.** No `grid-template-rows` and no `grid-auto-rows` are
  declared, so the implicit rows are sized `auto` — each row is as tall as its own tallest hint, and
  `relationshipCopy` hints vary by roughly 3x. Two rows of three with one visibly taller than the
  other is precisely the "not a rectangle" the user is looking at.

**The fix.** `auto-rows-fr`. Verified against this repo's actual Tailwind (**v4.3.3**) by compiling
it: it emits `grid-auto-rows: minmax(0, 1fr)`. In a grid container whose block size is indefinite,
CSS Grid §12.7 resolves the flex fraction as the maximum over *"each grid item that crosses a
flexible track"* of that item's max-content contribution — so every implicit row becomes the height
of the tallest card, and nothing overflows despite the `0` minimum.

Scoped to `sm:` and up. Below `sm` the grid is one column, where there is no rectangle to make and
equal rows would only pad the short cards with whitespace on a phone.

Per **D2 the breakpoints do not move**: `AdminNav` is `lg:sticky` in this grid's first column, so
three cards are ~250 px wide at `lg` and ~340 px at `xl`, and dropping `xl` to `lg` would buy the
shape and lose the legibility.

**Change:** exact before and after, both in prettier-canonical class order (verified by running
`prettier --write` on both strings — neither is reordered):

```
before:  grid gap-2 sm:grid-cols-2 xl:grid-cols-3
after:   grid gap-2 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3
```

**Code** — replace line 265:

```tsx
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
```

with:

```tsx
          {/* R1 — "to make it a nice 3 columns x 2 rows". The BREAKPOINTS do not move (index
              decision D2: `AdminNav` is `lg:sticky` in this grid's first column, so three cards
              only have legible room from `xl`). What was ragged is ROW-TO-ROW height. Grid items
              already stretch inside their own row — the container's `align-items` is `normal`,
              which behaves as `stretch` for grid items, and the label's `items-start` below is
              the LABEL's own flex axis, aligning the radio against the text rather than the card
              against its cell. But the implicit rows are `auto`, so the row holding the longest
              hint is taller than the other, and `relationshipCopy`'s hints vary by about 3x.
              `auto-rows-fr` is `grid-auto-rows: minmax(0, 1fr)`, and in a grid whose height is
              indefinite an `fr` row resolves to the largest max-content contribution of the items
              crossing it — so every row becomes the height of the tallest card and six cards read
              as a rectangle. Left off below `sm`, where one column has no rectangle to make and
              equal rows would only pad the short cards. */}
          <div className="grid gap-2 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3">
```

**Do not add `h-full` to the `<label>`.** It is redundant — the grid item already stretches — and it
invites the next reader to believe the stretch came from there.

**Impact:** six cards, 1-across on a phone, 2 x 3 from 640 px, **3 x 2 from 1280 px**, with every row
the same height at both multi-column breakpoints. No test asserts this class string (verified: the
only class-string source scans in `tests/` are `tabbar.geometry.test.ts` and `admin.shell.test.ts`,
neither of which reads `CharacterPanel.tsx`), and `tests/admin.tuning.test.ts`'s structural cases on
`PANEL` only assert `'use client'` and the absence of server-only imports.

---

### Step 10: `tests/nina.prompts.test.ts` — the snapshot guard, and the instructor's own cases

**File:** `tests/nina.prompts.test.ts`

**10a — the frozen snapshot guard (`:220-228`). THE TITLE MUST NOT CHANGE.**

The snapshot key in `tests/__snapshots__/nina.prompts.test.ts.snap:3` is, verbatim:

```
buildNinaSystemPrompt — the default tuning is the shipping prompt > renders the four non-girlfriend relationships exactly as origin/main did 1
```

Renaming the `it(...)` orphans that key: vitest would find no snapshot under the new name and write a
fresh one, which is `vitest -u` by another route and loses the invariant two plan sets stand on. **So
only the loop body changes.** There is exactly one `exports[...]` entry in the whole snapshot file
(verified), and after this edit `renders` still has the same four keys with the same four values, so
the file is untouched.

Replace lines 220-228 with:

```ts
  it('renders the four non-girlfriend relationships exactly as origin/main did', () => {
    const renders: Record<string, string> = {}
    for (const relationship of RELATIONSHIPS) {
      /* TWO LEVELS ARE EXCLUDED BY NAME, and the exclusion is the point. `girlfriend` has its own
       * register; `instructor` is the sixth level the nina-instructor-character set appended. The
       * snapshot was written about the OTHER FOUR, and `toHaveLength(4)` is what stops a seventh
       * level from quietly joining the guarded set — it fails on the count before it fails on the
       * bytes, which is the loud failure. Adding a level is NEVER a reason to regenerate this
       * snapshot: its title is the snapshot's key, so renaming this case would orphan the stored
       * value and write a new one. Leave both alone. */
      if (relationship === 'girlfriend' || relationship === 'instructor') continue
      renders[relationship] = buildNinaSystemPrompt(withRelationship(relationship))
    }
    expect(Object.keys(renders)).toHaveLength(4)
    expect(renders).toMatchSnapshot()
  })
```

**10b — the token record (`:518-526`).** `Record<NinaRelationship, string>` is compiler-enforced.
Replace:

```ts
    const token: Record<NinaRelationship, string> = {
      nobody: 'fullName',
      casual_friend: 'nickname',
      sister: 'bro',
      best_friend: 'bestie',
      girlfriend: 'sayang',
    }
```

with:

```ts
    const token: Record<NinaRelationship, string> = {
      nobody: 'fullName',
      casual_friend: 'nickname',
      sister: 'bro',
      best_friend: 'bestie',
      girlfriend: 'sayang',
      /* The coach word, and it is exclusive to her: nothing else in `NINA_ADDRESS` or in
       * `NINA_RELATIONSHIP_BLOCKS` says "atlet", which is what makes this a real assertion rather
       * than one satisfied by the shared paragraphs. `tests/nina.tuning.test.ts` keeps it that
       * way. `'nickname'` would have been the honest primary source here and is deliberately not
       * used — `casual_friend` already owns that token. */
      instructor: 'atlet',
    }
```

**10c — two titles that count, neither of them a snapshot key.**

- `:499` — `'renders all five relationships without throwing, and none is empty'` becomes
  `'renders all six relationships without throwing, and none is empty'`.
- `:759` — `'gives all five relationships a distinguishable librarian prompt'` becomes
  `'gives all six relationships a distinguishable librarian prompt'`.

Both bodies already read `RELATIONSHIPS.length`, so no assertion changes. The distinctness cases at
`:513` and `:761` now demand six distinct renders each, which Steps 2, 3 and 5a supply.

**10d — two new cases**, appended inside
`describe('buildNinaSystemPrompt — the relationship matrix (R2)', ...)` (after the case ending at
`:555`):

```ts
  it('makes the instructor a professional coach whose subject is his performance', () => {
    /* R2, as an assertion: "nina act as a professional and knowledgeable instructor in which her
     * primary objective is to improve the performance of miftah's running". The coaching
     * MECHANICS — what she does with a fired pattern, the training schedule — are phase 3's and
     * phase 2's and are deliberately NOT asserted here; this case is about who she IS. */
    const instructor = buildNinaSystemPrompt(withRelationship('instructor'))
    expect(instructor).toContain('You are his running coach')
    expect(instructor).toContain('This is a professional relationship')
    expect(instructor).toContain('atlet')
    /* Her credential is not a new claim: `NINA_WHERE_SHE_LIVES` has said it at every level since
     * before the tuning existed. The instructor block PROMOTES it, and this is the proof both
     * halves reached the same render. */
    expect(instructor).toContain('physiotherapist and strength coach')
    /* Decision D4: she prescribes TRAINING, never physiology — and the guardrail that makes that
     * a rule rather than a preference is still in her prompt at this level, unedited. */
    expect(instructor).toContain('What you prescribe is training')
    expect(instructor).toContain('You are not his doctor and you never diagnose')
  })

  it('keeps the coach register off the five personal levels', () => {
    /* Invariant 1 as containment, at the level the frozen snapshot cannot report readably: when
     * this fails it names WHICH level leaked and WHAT. */
    for (const relationship of RELATIONSHIPS) {
      if (relationship === 'instructor') continue
      const render = buildNinaSystemPrompt(withRelationship(relationship))
      expect(render, `${relationship} leaked "atlet"`).not.toContain('atlet')
      expect(render, `${relationship} leaked the coach block`).not.toContain(
        'You are his running coach',
      )
    }
  })
```

**Impact:** `tests/nina.prompts.test.ts:869` (*"turns the relationship off to best_friend"*) already
iterates `NINA_RELATIONSHIPS` and needs **no edit**: with `enabled.relationship: false`,
`ninaActiveRelationship` returns `NINA_DEFAULT_RELATIONSHIP`, so `instructor` renders `DEFAULT_RENDER`
for free. That is a real check of invariant 2 and it comes at no cost.

---

### Step 11: `tests/nina.tuning.test.ts` — the array, the vocabulary, and the token's exclusivity

**File:** `tests/nina.tuning.test.ts`

**11a — the describe title (`:157`) and the exact-array case (`:158-166`).** Replace:

```ts
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
```

with:

```ts
describe('the six relationships and their address vocabulary (R2)', () => {
  it('are the five the user named, least to most intimate, plus the appended instructor', () => {
    /* `'instructor'` is APPENDED, not inserted (index decision D1): a coach is not on the
     * intimacy axis at all, so appending keeps all five existing indices stable and leaves the
     * "in the order the user wrote them" story true of the five it was written about. The literal
     * array stays a literal so that adding a seventh level is an explicit decision made here. */
    expect(NINA_RELATIONSHIPS).toEqual([
      'nobody',
      'casual_friend',
      'sister',
      'best_friend',
      'girlfriend',
      'instructor',
    ])
  })
```

**11b — the per-level address forms (`:176-181`).** Append two lines inside that case, after the
`girlfriend` assertion:

```ts
    /* The sixth is not one of the user's five, so its source is a design call rather than a
     * transcription: a coach uses a NAME, so `nickname` — the full name is `nobody`'s whole
     * definition and the pet names are `girlfriend`'s — plus one literal coach word. */
    expect(NINA_ADDRESS.instructor.source).toBe('nickname')
    expect(NINA_ADDRESS.instructor.words).toEqual(['atlet'])
```

**11c — the fallback case (`:183-196`).** Append one line after the two existing
`toContain` assertions:

```ts
    expect(NINA_ADDRESS.instructor.addressFallback).toContain('gw catet lo sebagai siapa nih?')
```

The `for (const relationship of NINA_RELATIONSHIPS)` loop above it already covers `instructor` for
the non-empty check, and the `no stance field` loop at `:200` already covers it too — both pick the
new member up with no edit.

**11d — one new case**, appended after the case that ends at `:219` (the `NAME_RULES` verbatim one)
and before `'degrades an unknown relationship to the default'`:

```ts
  it('keeps "atlet" exclusive to the instructor, because a shared token is not a test', () => {
    /* `tests/nina.prompts.test.ts`'s token record asserts that each level's render NAMES its own
     * address form, and that assertion is only worth anything if the token cannot come from
     * somewhere else. `'atlet'` was chosen for the instructor for exactly that reason, and this
     * is what stops a later edit from sprinkling it into another level's rule. */
    expect(NINA_ADDRESS.instructor.words).toEqual(['atlet'])
    for (const relationship of NINA_RELATIONSHIPS) {
      if (relationship === 'instructor') continue
      const vocabulary = NINA_ADDRESS[relationship]
      expect(vocabulary.words, relationship).not.toContain('atlet')
      expect(vocabulary.addressRule, relationship).not.toContain('atlet')
      expect(vocabulary.addressFallback, relationship).not.toContain('atlet')
    }
  })
```

**Impact:** `:222-228` (the coercion case) and `:337` (`NINA_RELATIONSHIPS).toContain(...)`) pick the
new member up with no edit. `:565-589` — the zero-imports source scan — still passes: Step 7's
comment lines contain no line matching `/^\s*import\s/`, and the code-with-comments-stripped checks
for `server-only` and `@/lib/db` are unaffected.

---

### Step 12: `tests/admin.tuning.test.ts` — the count

**File:** `tests/admin.tuning.test.ts:104-105`

Replace:

```ts
  it('names the address form for all five relationships', () => {
    expect(NINA_RELATIONSHIPS).toHaveLength(5)
```

with:

```ts
  it('names the address form for all six relationships', () => {
    /* Six since the instructor landed. `RELATIONSHIP_NOTE` is `Record<string, string>` and is
     * therefore the ONE relationship site the compiler does not enforce, so this literal count
     * plus the non-empty hint below is the whole safety net for it. Keep the literal a literal:
     * `NINA_RELATIONSHIPS.length` would be a tautology. */
    expect(NINA_RELATIONSHIPS).toHaveLength(6)
```

**Impact:** the loop that follows asserts `hasRelationshipCopy(value)` and a non-empty
`relationshipCopy(value).hint` for every level, which is what catches a forgotten Step 4.

---

## Verification

**Prerequisite — already satisfied, corrected by the reconciler.** This worktree now has
`node_modules` installed **and** `.env.local` in place (the 14-var `lib/env.ts` check passes), so
there is **no install step**. The earlier "this worktree has no `node_modules`, run `npm ci` first"
instruction was true when this plan was written and is false now; do not run it.

**The baseline this phase is measured against:** on `feature/nina-instructor-character` before any
phase lands, `npx vitest run` is green at **145 test files, 2834 tests**. After this phase the file
count is unchanged and the test count rises by the four cases Steps 10d and 11d add.

**Build:**

```
npx tsc --noEmit
```

A pass is **zero output**. Before Steps 2, 3, 5a and 10b land, expect exactly four families of
`TS2741`/`TS2739` ("property 'instructor' is missing") at `NINA_ADDRESS`,
`NINA_RELATIONSHIP_BLOCKS`, `RELATIONSHIP_GLOSS` and the token record. That is the safety net working
— an implementer who sees a fifth site should stop and check whether it belongs to another phase.

**Tests, targeted first:**

```
npx vitest run tests/nina.tuning.test.ts tests/admin.tuning.test.ts tests/nina.prompts.test.ts
```

A pass looks like three files green with **no snapshot line at all** in the summary. Specifically:

- **`1 snapshot`** written, updated, obsolete, or removed is a **FAILURE of this phase**, not a
  fixture to accept. Check `git status tests/__snapshots__/` — it must be clean.
- `renders the four non-girlfriend relationships exactly as origin/main did` must pass on the stored
  value. If it reports a missing snapshot, the title was changed; restore it.
- **Never run `vitest -u`.** If a diff appears, something rendered outside the `instructor` branch.

**Then the whole suite:**

```
npx vitest run
```

Green, and `git diff --stat tests/__snapshots__/nina.prompts.test.ts.snap` empty.

**Lint and format:**

```
npx prettier --check components/admin/CharacterPanel.tsx lib/nina/tuning.ts lib/nina/persona.ts lib/admin/tuningModel.ts lib/nina/prompts/distill.ts
npx next lint
```

The prettier check matters for Step 9: `prettier-plugin-tailwindcss` sorts class strings, and
`grid gap-2 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3` was confirmed to survive the sorter
unchanged.

**Manual check — R1, from a local production build, not a Vercel preview.** A preview cannot serve
`/admin` (`ADMIN_EMAILS`, `VAPID_*` and `AUTH_URL` are Production-scope only):

```
npm run build && npm run start
```

Then open `/admin/personality` and, in the **Relationship** fieldset:

1. At a viewport ≥ 1280 px: **six cards, three across, two down.** The two rows are the same height
   — compare the bottom edges of the `bg-paper-2` backgrounds, not the text.
2. At 640-1023 px: 2 x 3, all three rows the same height.
3. Below 640 px: one column, cards sized to their own content (no padding added) — that is the
   `sm:` scoping working as intended.
4. Card 6 reads **Instructor** with the hint *"atlet. Professional. She coaches, and your running
   getting faster is the point of the conversation."*, and **card 4, Best friend, still carries the
   `default` badge.**
5. Select **Instructor**, Save, and read the prompt preview on the same page: paragraph 1 opens
   *"You are Nina. ... You are his running coach."*, the address rules name `atlet`, and
   `WHAT YOU NEVER SAY` / the not-a-doctor block are unchanged.
6. Select **Best friend** again and Save: the preview returns to the shipping prompt exactly.

**Exit criteria:**

- `npx tsc --noEmit` clean; `npx vitest run` green — **145 test files**, at least the baseline's
  2834 tests, and `tests/__snapshots__/nina.prompts.test.ts.snap` byte-identical to `f839116`.
- `NINA_RELATIONSHIPS.length === 6`, last member `'instructor'`;
  `NINA_DEFAULT_RELATIONSHIP === 'best_friend'`; `NINA_PROMPT_VERSION === 4` (phase 3 owns that bump).
- **`NINA_DISTILL_PROMPT_VERSION === 3`** (D6) — exactly one occurrence of
  `export const NINA_DISTILL_PROMPT_VERSION = 3` in `lib/nina/prompts/distill.ts`, with the
  changelog paragraph above it. Confirm with
  `grep -n 'NINA_DISTILL_PROMPT_VERSION =' lib/nina/prompts/distill.ts`.
- All four `Record<NinaRelationship, …>` sites carry an `instructor` entry — `NINA_ADDRESS`
  (`tuning.ts:391`), `NINA_RELATIONSHIP_BLOCKS` (`persona.ts:206`), `RELATIONSHIP_GLOSS`
  (`distill.ts:51`, via `satisfies`) and the token record (`tests/nina.prompts.test.ts:520`) — and
  all four prose sites the compiler cannot see are edited: `RELATIONSHIP_NOTE`, `distill.ts:105`,
  `db/schema.ts:1686`, `tuning.ts:44`.
- `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS) === NINA_SYSTEM_PROMPT` — asserted at
  `tests/nina.prompts.test.ts:~640`.
- Six cards render 3 x 2 at `xl` with rows of equal height, and the sixth is a professional coach
  whose stated objective is his running performance.
- No file listed under **Leaves alone** appears in `git diff --name-only`.

---

## Handoffs

**To phase 2 (a schedule she can keep).**
- Step 7a is the whole of this phase's involvement with the slots: the `tuning.ts:44` comment now
  says explicitly that the key count is `memory.ts`'s decision. Phase 2 does not need to edit that
  comment again, and it does not need to touch anything relationship-shaped.
- `NINA_SLOT_KEYS` is still nine when this phase lands.
- **`NINA_DISTILL_PROMPT_VERSION` is bumped `2` -> `3` here (Step 5d, D6). Phase 2 must not bump it
  again**, even though its tenth slot changes the same rendered librarian prompt through
  `SLOT_VOCABULARY_BLOCK`. One bump covers both edits; the changelog paragraph Step 5d writes says
  so in as many words, so a phase-2 session that reads the file finds its own change already
  accounted for.
- **`lib/admin/schema.ts` stays out of this phase's diff.** The Zod enum needs no edit; phase 2 owns
  the comment-only slot-count edit at `:107`.

**To phase 3 (the coaching register and the insight path).**

- **Phase 3 lands after this phase, and this phase shifts line numbers in two files phase 3 also
  edits** — `lib/nina/persona.ts` (Step 3 appends ~13 lines inside `NINA_RELATIONSHIP_BLOCKS` at
  `:305`) and `tests/nina.prompts.test.ts` (Steps 10a/10b/10d add ~50 lines below `:220`). Phase 3's
  plan quotes pre-change line numbers for its own insertion points; it must locate them by **anchor
  text** (`ninaGirlfriendVoiceBlock`'s closing brace before the anger-ladder banner; the `})` that
  closes the girlfriend-register describe) rather than by the numbers, which will have moved.
- `'instructor'` is the exact spelling to gate on, and `ninaActiveRelationship(tuning) === 'instructor'`
  is the right predicate — **not** `tuning.relationship`, so that R4's off-switch still degrades to
  `best_friend` and contributes zero bytes. `isGirlfriend` at `persona.ts` is the shape to copy.
- **`atlet`** is the reserved coach word, and `tests/nina.tuning.test.ts` (Step 11d) asserts no other
  level uses it. Phase 3's coaching block may use it freely; the other five levels may not.
- The identity block deliberately stops at *"a number that worries you is a reason to change the
  training, and changing the training is where you take it."* That sentence is the hook: phase 3's
  block says **which** numbers and **what** the change is. It should not restate the sentence.
- `NINA_NOT_A_DOCTOR` is unedited and renders at `instructor` — asserted in Step 10d, so phase 3
  inherits a test that fails if the guardrail is softened for the coach.
- Phase 3's per-level absence assertions can reuse Step 10d's `keeps the coach register off the five
  personal levels` shape, and should add its own tokens rather than widening that case.

**Left on the table, deliberately.**
- Four historical comments that say "five" and are being left alone on purpose: `persona.ts:169`,
  `persona.ts:176`, `persona.ts:183`, `distill.ts:63-70`. Each records a decision taken when there
  were five levels; rewriting them would erase the record, not update it.
- The hint-length spread that makes the cells uneven in the first place (`nobody`'s note is ~110
  chars, `sister`'s ~40) is not equalised. Equal cells solve the geometry; shortening the notes is a
  copy edit nobody asked for.
- No `AdminNav` or breakpoint change (D2), no `grid-cols` at `lg`.

---

## Rollback

`git revert` the single commit. Afterwards:

- `NINA_RELATIONSHIPS` is five members again and the four `Record` sites shrink with it — the build
  is consistent because every site was added and removed together.
- Any `nina_tuning` row already saved as `'instructor'` becomes an unknown value.
  `coerceNinaRelationship` degrades it to `best_friend` without throwing and
  `readNinaTuning` coerces before anything renders, so the operator sees **Best friend** selected on
  the next page load and one Save re-canonicalises the row. This is exactly why the column is
  untyped `text` and why no migration exists to undo.
- `tests/__snapshots__/nina.prompts.test.ts.snap` was never modified, so nothing to restore.
- The grid returns to `grid gap-2 sm:grid-cols-2 xl:grid-cols-3` and to five cards in a 3 + 2.
- Phase 3 does **not** survive this revert (it gates on the union member) and must be reverted first
  or together. Phase 2 is independent and survives.
