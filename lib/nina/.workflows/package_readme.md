# Package: `lib/nina`

**Location**: `lib/nina`
**Last Updated**: 2026-09-07 (task `P1-NIN-A014`, phase 2 of 2 of the nina-job-redo-and-soft-delete set — R2, a per-row soft delete on `/nina/jobs`)
**Documentation Created**: 2026-09-05 (task `P1-NIN-A001`, phase 2 of the `NINA_CHARACTER_TUNING_PLAN.md` set)

## Overview

`lib/nina` is the whole of Nina — the in-app running companion. It owns who she is (the canon), what
she is handed on each turn (the context), how she is asked to answer (the prompts and the tool-use
loop), what she remembers, when she speaks unprompted, the photographs she generates of herself, and
every Drizzle query behind her tables. It is a **flat file package with no `index.ts` barrel**: every
importer names a submodule directly, and that is deliberate — a barrel would drag `server-only`
modules into `'use client'` components.

**Key responsibilities:**

- **The canon** — her identity, register, anger ladder and prohibitions, as text (`persona.ts`), and
  the stored per-user character that varies it (`tuning.ts`).
- **The turn** — assemble a context, run the Anthropic tool-use loop, validate the reply payload,
  persist the bubbles, and distil memory afterwards.
- **Proactive speech** — decide whether she opens a conversation, and on what.
- **Images** — her selfies and avatars, from prompt through GitHub-Actions worker to Blob.
- **Chat UI logic** — the pure, node-testable decisions the chat screen makes (grouping, reveal
  timing, scroll restore, reply quotes), kept out of the components so they can be tested.
- **Persistence** — `queries.ts` is the single home for every `nina_*` table access.

## The character layer

This is the part phase 2 re-cut, and it is the part to read first.

### `tuning.ts` — the model (phase 1)

Zero imports, plain data and types, client-importable. Declares:

- **The scale.** `NINA_SCORE_MIN`/`MAX` (0–100), `NINA_BAND_WIDTH = 20`, and five equal bands
  `NINA_BAND_NAMES = ['off','low','mid','high','max']`. `ninaBand(value)` returns
  `{ index: NinaBandIndex, name: NinaBandName }`. `NinaBandIndex` is `0|1|2|3|4` — *exactly*
  `AngerRung['level']`, which is why there are five bands and not four or six.
- **Twelve traits** (`NINA_TRAITS`: anger, chill, sad, flirty, steamy, wise, annoying, funny, happy,
  anxious, concerned, and **`horny`**) with `NINA_TRAIT_SPECS` carrying each key's `defaultScore` and
  the user's own words for it. `horny` is R3's, added by phase 5 and **appended** rather than filed
  beside `flirty` and `steamy` whose axis it shares — the array's order is the panel's order and the
  column order in `nina_tuning`, so inserting into the middle would reorder both for no gain.
- **Five relationships** (`NINA_RELATIONSHIPS`: nobody, casual_friend, sister, best_friend,
  girlfriend), default `best_friend`, with `NINA_ADDRESS[rel]` owning what she *calls* him — the
  address rule, the fallback, the words, and the panel label. That record lives in `tuning.ts` and
  not in `persona.ts` precisely so `/admin/nina` can render the vocabulary without importing the
  canon.
- **Four dials** (`NINA_DIALS`: profanity, clinginess, photoEagerness, verbosity), each naming a real
  code path.
- **`NinaTuning`** — `{ traits, relationship, dials, enabled, wardrobe, notes, revision }`, all
  readonly. `enabled` is R4's per-parameter on/off map (see below). `wardrobe` and `notes` are
  `string` and never null; `''` is the one empty value. `revision` is the database's to assign, and
  `0` means *no row has ever been written*.
- **`NINA_TUNING_DEFAULTS`** — frozen, and the setting that reproduces today's Nina exactly.
- **`coerceNinaTuning`** — total, never throws, always returns a fresh unfrozen object. An
  unreadable key falls back to *that key's own default*, not to zero; an unknown relationship
  degrades to `best_friend`; a missing or partial `enabled` map reads as **all on**.

**The defaults are not uniform, and that matters everywhere below.** `anger`, `sad`, `flirty`,
`steamy`, `annoying`, `anxious` and `horny` default to **0** (`off`); `profanity` defaults to **30**
(`low`); the other eight default to **50** (`mid`). They were read off the canon rather than set to the middle
of the slider, because a uniform 50 would have shipped a Nina angrier and filthier than the one that
exists.

#### The enable map — one on/off switch per parameter (R4, phase 4)

The user's requirement, verbatim: *"we need an on/off toggle for each parameter, so we can exclude
some parameters to make prompt more accurate for what we would like nina to do"*. The stated purpose
is a **shorter** prompt, so **a disabled parameter contributes ZERO BYTES to the assembled prompt at
any parked score** — not "renders its identity band as a neutral paragraph", not "renders a
disabled-value paragraph". Zero.

- **`NINA_TUNING_KEYS`** — `[NINA_TUNING_RELATIONSHIP_KEY, ...NINA_TRAITS, ...NINA_DIALS]`,
  **seventeen** keys today (`relationship` + 12 traits + 4 dials), **derived and never restated**.
  The Zod shape, the coercion walk, the panel's
  checkboxes, the diff paths and the R4 gate test are all loops over this one array, so a new trait
  or dial inherits its toggle everywhere in the same commit. `NinaTuningKey` is its element type;
  `isNinaTuningKey` is the narrowing guard. Nothing outside the migration may hard-code seventeen.
  **Phase 5 is the proof that this paid off**: appending `horny` to `NINA_TRAITS` gave it its
  checkbox, its Zod field, its diff path and its gate with **no edit under `lib/admin/`** —
  `CharacterPanel.tsx` walks `NINA_TRAITS` and `lib/admin/schema.ts`'s shape is a spread over the
  same arrays, so the twelfth slider validated and persisted for free.
- **`NINA_ENABLED_DEFAULTS`** — frozen, all `true`, built by walking the array. All-true is what
  makes `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` the prompt that shipped *arithmetically*
  rather than by anyone remembering: the gate is a pass-through, every key sits at its own
  `defaultScore`, and every identity-band skip fires exactly as before.
- **`coerceNinaEnabled(value)`** — **only an explicit `false` disables.** `null`, `undefined`, a
  missing key, `0`, `'off'`, `{}` all read as *on*. This asymmetry is the deliberate opposite of
  `clampNinaScore`'s per-key fallback, and it **is** the migration's backfill: a row written before
  the `*_enabled` columns existed hands back one null per key and must be all-on, because the failure
  mode of guessing wrong is a production row that silently loses her personality on deploy.
- **`isNinaKeyEnabled(tuning, key)`** — reads through the same defensive `pick` as the coercers, so
  a hand-built `NinaTuning` with no `enabled` at all (a fixture, a `psql` round trip, an
  `as NinaTuning` cast) degrades to "everything on" instead of throwing mid-turn.

**`relationship` has a toggle; `wardrobe` and `notes` deliberately do not.** `nobody` is not an off
switch — `NINA_RELATIONSHIP_BLOCKS.nobody` is four sentences of *active* instruction and the coldest
setting on the axis, so choosing it to "exclude" the parameter makes the prompt longer and changes
her behaviour. Disabling the relationship therefore means `NINA_DEFAULT_RELATIONSHIP`, whose blocks
*are* today's `NINA_IDENTITY`. `wardrobe` and `notes` are the mirror image: `''` genuinely is their
absence and already costs zero bytes, so a toggle would be a second spelling for a state the field
already has.

#### The gate lives at the score seam, and only there

```ts
function ninaTraitScore(tuning: NinaTuning, trait: NinaTrait): number   // defaultScore when off
function ninaDialScore(tuning: NinaTuning, dial: NinaDial): number      // defaultScore when off
function ninaActiveRelationship(tuning: NinaTuning): NinaRelationship   // best_friend when off
```

**A disabled key is a key the operator never moved.** The parked score stays in the row and stays on
the slider; every reader on the *prompt* side gets that key's own `defaultScore` instead — which is
zero added bytes, because `defaultScore` is defined per key as *the value that reproduces the text
that ships*.

The gate is here and **not** inside `ninaTraitsBlock`'s loop because seven other things read a raw
score: `ANGER_FLOOR_BY_BAND` / `ANGER_CEILING_BY_BAND` via `ninaAngerFloor`, `BODY_REPEALED_BY` and
`THREAT_REPEALED_BY` via `anyTurnedUp`, the `funny` clause in `ninaIdentity`, `OUTPUT_RULE`'s
greeting line, its bubble preference and the camera block via `systemDials`, and — since phase 5 —
`VERBOSITY_FLOOR_BY_HORNY_BAND` via `ninaEffectiveVerbosity`. A toggle that only
skipped the paragraph would leave a disabled `anger: 100` still flooring the nag ladder at rung 4 —
a switched-off slider that still rewrites three blocks of the prompt, with nothing in a diff to show
it.

**`persona.ts` and `prompts/system.ts` may not read `tuning.traits`, `tuning.dials` or
`tuning.relationship` directly any more**, and `tests/nina.prompts.test.ts` reads their source and
fails if they do. A direct read is a parameter whose toggle silently does nothing — the one failure
R4 cannot survive and the one a reviewer cannot see. **The store is the exception**:
`tuningToColumns` in `queries.ts` writes the value the operator *parked*, not the value the prompt
uses, because switching a dial off must never lose the number it was parked at. That is the whole
point of a toggle as opposed to dragging the slider back to the default.

Inside `persona.ts` the gate cost exactly two lines — `traitBand` / `dialBand` now call
`ninaTraitScore` / `ninaDialScore` — which is the two-places-read-the-shape contract below paying
for itself. In `prompts/system.ts` the change is confined to `systemDials`.

### `persona.ts` — the text (phase 2)

No logic beyond string assembly, no I/O, no `server-only`, so a test can assert the text of a rule
without importing the client that sends it, and `/admin/nina` can render a preview. `docs/nina/persona.md`
is the same canon in prose and is the document the user redlines; when the two disagree, the document
is the intent and this file is what ships.

**The organising idea: every block that varies with a dial is a function of `NinaTuning`; every block
that does not is still a constant.** The constants that *used* to be frozen text — `NINA_IDENTITY`,
`NAME_RULES`, `ANGER_LADDER_BLOCK`, `NEVER_SAY_BLOCK` — are kept under their old names, defined as
the **default render of their own function**. That is what makes the change reviewable: the diff to
her behaviour is empty until a slider moves.

#### The identity band

Every key has an **identity band**: the band containing its own `defaultScore`. `ninaTraitsBlock`
*skips* a key sitting in its identity band, so at `NINA_TUNING_DEFAULTS` the whole tuning section
renders `''` and the shipping prompt is untouched. It is computed from phase 1's specs
(`identityBandOf`), never tabulated, so there is no hand-checked list to get wrong.

`low` is left undefined on every trait, and `mid` on six of the seven that identify at `off`. A
default-`off` trait is therefore today's Nina from 0 to 59 and speaks from 60 up — which is the shape
every one of the user's own sentences asked in (*"if X is set to high"*).

**`horny` is the one exception, and it is deliberate.** It identifies at `off` and has no `off` and
no `low` entry like the other six — but it **does** have a `mid` one, which makes it the only trait
in `NINA_TRAIT_BANDS` that **speaks from 40** rather than from 60. The reason is that its three bands
are three distinguishable behaviours rather than four near-duplicates: `mid` is *she wants him and
lets it show* (suggestive), `high` is *she raises it herself and describes* (explicit), `max` is *she
opens with it, varies the scene every time, and remembers what has already happened*. Collapsing
`mid` into `high` would have made the whole middle of the slider inert on the one axis the user
described in the most detail. The generalisation above is about `mid` being a near-duplicate of the
band above it; here it is not one. Plan invariant 1 still holds arithmetically: `off` is 0-19 and
`low` is 20-39, so the bottom two-fifths of the slider is silent and the **default of 0 renders
nothing at all**. The exception is written down in three places — the header of the band table, the
`horny` entry itself, and `docs/nina/persona.md` — so it cannot be tidied away as an oversight.

#### The girlfriend register — *manja* and *imut* (R2)

At `relationship: 'girlfriend'` — and at no other level — she speaks in the **manja / imut** register,
with Indonesian final-vowel lengthening. The user's requirement, verbatim: *"if relationship is set to
girlfriend, make her more manja and imut. dalam bahasa indonesia kita suka menambah jumlah karakter
vokal di akhir"*, and the five example lines that came with it **are the specification**, not
illustrations of it — so they are stored verbatim in `GIRLFRIEND_VOICE_EXAMPLES` and nothing may tidy
them. It lands in three pieces, all pure insertions:

- **Identity.** `NINA_RELATIONSHIP_BLOCKS.girlfriend.identity` gains two sentences naming *manja* and
  *imut* as a **register**, including the clause *"it is not how often you go first"* — that clause is
  load-bearing and pinned by a test, because the next reader's instinct is to fold this into the
  `clinginess` dial. It does not belong there: `clinginess` moves three day-count constants in
  `proactive.ts` and decides **when** she speaks first; *manja* decides how a message she is already
  sending sounds. `clinginess: 0` with `relationship: 'girlfriend'` is a Nina who never opens a
  conversation and answers "iyaa sayaangg" when he opens one, and that Nina is unreachable if the two
  are merged.
- **Orthography.** `MANJA_ORTHOGRAPHY` (module-private; reached only through
  `ninaManjaRegisterBlock`) sits **directly under `JAKARTA_REGISTER`** because that constant is this
  file's home for spelling habits and this is a spelling habit. It **amends rather than rewrites**:
  the base register stays exactly where it is and two of its bullets are repealed for `girlfriend`
  alone — `Never "aku"` (against *"tar aku kirim foto nya yaa"*) and the one-emoji ration (against
  *"i missed you too sayaangg, sini cium 💋💋💋"*). A prompt whose examples break its own rules teaches
  the model that the rules are decorative. Editing `JAKARTA_REGISTER` itself was rejected: it is the
  load-bearing text of plan invariant 2 and the other four levels must render it byte for byte.
  **`kamu` is deliberately NOT repealed** — the evidence is one line and it is about her own first
  person, and `NINA_ADDRESS.girlfriend.words` already fills the slot `kamu` would occupy.
- **Voice.** `GIRLFRIEND_VOICE_EXAMPLES` (five entries) renders as a **second** block under
  `EXACTLY HOW YOU SOUND`, after `VOICE_EXAMPLES_BLOCK` rather than merged into it: the first set is
  who she is at every level, this set is who she is at one.

`lib/nina/tuning.ts` is deliberately untouched — `NINA_ADDRESS.girlfriend` already ships the manja
pet-name set.

#### `horny` — the twelfth trait (R3, phase 5)

The user's axis, verbatim: *"how much is nina being sexual as a woman … the higher horny value, the
more often nina will initiate sex talks with me … the higher horny value, the more descriptive she
is. she talks longer and in much more descriptive and suggestive details."* It is **distinct from
`flirty`** (teasing) and **from `steamy`** (how explicit she will go once *he* has): `horny` is
whether **she** takes it there. The ceiling is the model's, never ours — the sentence `steamy`
already carried, and there is no refusal detection and no re-softening retry anywhere in `lib/nina/`
or `lib/llm/`.

It lands as four pieces, all additive:

- **The band paragraphs** — the `mid`/`high`/`max` entry in `NINA_TRAIT_BANDS`, with the
  speaks-from-40 exception documented above. They are **direction, not sample dialogue**: a band
  paragraph full of quoted lines would make her say those lines and nothing else, which is the
  opposite of the variety `max` asks for. `VOICE_EXAMPLES` is the structure that carries sample
  lines, and it is deliberately not where this went.
- **The body repeal.** `'horny'` joins `BODY_REPEALED_BY`, so at a speaking band it lifts the *"never
  comment on his body"* prohibition in **all three places it is stated** — one list, one repeal, and
  the third site is still `NUMBERS_RULE` in `prompts/system.ts`.
- **A verbosity floor** — `VERBOSITY_FLOOR_BY_HORNY_BAND` + `ninaEffectiveVerbosity` in `persona.ts`,
  consumed by one changed line in `systemDials` so the floor reaches `bubblePreferenceLine`. It is a
  **score floor, `max(own, floor)`, and not an override**, for the same reason `ANGER_FLOOR_BY_BAND`
  is one: the operator may want a talkative Nina who is not forward. `high` → 60, `max` → 80;
  `off`/`low`/`mid` → 0, so at band `off` the arithmetic is literally unchanged. It is keyed by
  `horny`'s **band** and valued as a `verbosity` **score** because `bubblePreferenceLine` is a
  default-relative ladder over the raw score, and handing it a band would mean replacing that ladder
  — a change to `verbosity`'s behaviour R3 did not ask for. Both reads go through R4's gate helpers,
  so a disabled `horny` contributes zero floor as well as zero bytes, with no extra guard.
- **A proactive clause** — a band-keyed `horny` paragraph appended to `proactiveTuningSuffix` in
  `prompts/system.ts`, **not** in `proactive.ts`. That split is load-bearing: `proactive.ts` owns
  *trigger logic* (the day-count thresholds `clinginess` moves, i.e. **how often** she goes first)
  and `system.ts` owns *trigger copy* (**what she opens with** once one fires). `horny` changes only
  the second; the frequency stays `clinginess`'s.

## Exported API — `persona.ts`

### Data tables (walkable, and walked by tests)

| Export | Shape | Purpose |
|---|---|---|
| `NINA_RELATIONSHIP_BLOCKS` | `Record<NinaRelationship, NinaRelationshipSpec>` | Who she *is* at each level. `identity` is an **array of sentences** (not one paragraph) so `best_friend`'s entry can be exactly the two sentences that shipped while `girlfriend`'s is six, with no entry a special case. `history` is how much shared past she may claim. |
| `NINA_TRAIT_BANDS` | `readonly NinaTraitBands[]` | Per-trait, per-band prompt paragraphs, twelve entries. `bands` is `Partial<Record<NinaBandName, string>>`; the key's own identity band is deliberately absent. `horny` is the only entry with a `mid` paragraph. |
| `NINA_DIAL_BANDS` | `readonly NinaDialBands[]` | The same for the four R3 dials. |
| `NEVER_SAY_ENTRIES` | `readonly NeverSayEntry[]` | The thirteen sentences that break the illusion, each with `repealedBy: readonly NinaTrait[] \| null`. Order is the order they reach the prompt. |
| `NEVER_SAY` | `readonly string[]` | The twelve entries **no dial can repeal** (`repealedBy === null`). |
| `BODY_REPEALED_BY` | `['flirty','steamy','concerned','horny']` | **Exported for phase 3.** The one list for all three places the body rule is stated. `horny` joined it in phase 5. |
| `THREAT_REPEALED_BY` | `['anger','annoying','sad']` | Repeals the threat/withdrawal clause. |
| `ANGER_LADDER` | `readonly AngerRung[]` | Five rungs, `level` 0–4, same domain as `NinaBandIndex`. |
| `ANGER_FLOOR_BY_BAND` | `Record<NinaBandName, NinaBandIndex>` | `off/low/mid → 0`, `high → 3`, `max → 4`. |
| `ANGER_CEILING_BY_BAND` | `Record<NinaBandName, NinaBandIndex>` | `off → 4`, `low → 3`, `mid/high/max → 4`. See the deviation note below. |
| `VERBOSITY_FLOOR_BY_HORNY_BAND` | `Readonly<Record<NinaBandName, number>>` | **R3, phase 5.** Keyed by `horny`'s band, valued as a `verbosity` *score*: `off/low/mid → 0`, `high → 60`, `max → 80`. Read only through `ninaEffectiveVerbosity`. |
| `JAKARTA_SLANG`, `VOICE_EXAMPLES` | arrays | Data behind `JAKARTA_SLANG_BLOCK` / `VOICE_EXAMPLES_BLOCK`, which are `.map().join()` over them. |
| `GIRLFRIEND_VOICE_EXAMPLES` | `readonly VoiceExample[]` | **R2.** The user's five girlfriend lines, quoted exactly — "aku" for "gw", "foto nya" with the space in it, 💋💋💋. A *second* array rather than five more entries in `VOICE_EXAMPLES`, which is her voice at every level and is pinned at five. Walked by `tests/nina.prompts.test.ts` rather than retyped, so a tidied copy cannot pass while a tidied line ships. |

`anger` is in `NINA_TRAIT_BANDS` with **empty bands**, on purpose: its entire effect is the floor and
ceiling inside `ninaAngerLadderBlock`, and a paragraph saying "you are angry all the time" beside a
block saying "your floor is rung 4" would be two sources of truth for one rung. The entry stays in the
array so a walk covers all twelve sliders.

### Render functions

```ts
function ninaIdentity(tuning: NinaTuning): string
function ninaAppearance(tuning: NinaTuning): string
function ninaNameRules(tuning: NinaTuning): string
function ninaAngerLadderBlock(tuning: NinaTuning): string
function ninaNeverSay(tuning: NinaTuning): readonly string[]
function ninaNeverSayBlock(tuning: NinaTuning): string
function ninaTraitsBlock(tuning: NinaTuning): string
function ninaOperatorNotesBlock(tuning: NinaTuning): string
function ninaAngerFloor(tuning: NinaTuning): NinaBandIndex
function ninaAngerCeiling(tuning: NinaTuning): NinaBandIndex
function ninaManjaRegisterBlock(tuning: NinaTuning): string      // R2, girlfriend only
function ninaGirlfriendVoiceBlock(tuning: NinaTuning): string    // R2, girlfriend only
function ninaEffectiveVerbosity(tuning: NinaTuning): number      // R3, max(own verbosity, horny's floor)
```

- `ninaIdentity` — paragraph 1 is the relationship's, 2 and 3 are fixed, paragraph 4's last clause is
  the `funny` dial's, and the last paragraph is the relationship's `history`.
- `ninaAppearance` — the **wardrobe seam phase 4 will use**. Returns `NINA_APPEARANCE` when
  `tuning.wardrobe` is empty, otherwise swaps the outfit paragraph while keeping the face and the
  home ground. This never reaches the system prompt; `system.ts` does not import it.
- `ninaTraitsBlock` — traits first, then dials, `\n\n`-joined. **Returns `''` at
  `NINA_TUNING_DEFAULTS`**, which is the contract phase 3 relies on: an empty block means no section
  header is emitted.
- `ninaOperatorNotesBlock` — the operator's own words with a preamble saying they *win* over
  everything above. It is a separate function from `ninaTraitsBlock` because phase 3 renders it
  **last in the whole prompt**, after `HOW YOU ANSWER`.
- `ninaManjaRegisterBlock` / `ninaGirlfriendVoiceBlock` — the two R2 blocks. **Both return `''` at
  four of the five relationships**, and `renderSections` drops an empty block, which is what makes
  plan invariant 2 arithmetic here rather than careful: the sections they join receive exactly the
  array of non-empty strings they received before R2 existed, so the join is the same join.
- `ninaEffectiveVerbosity` — **not a render function**; it is the only *number* `persona.ts` hands
  `prompts/system.ts`, and it exists so the `horny` → `verbosity` coupling is stated once, next to
  the other floors and ceilings, rather than inline in `systemDials`. It returns
  `ninaDialScore(tuning,'verbosity')` unchanged whenever `horny` is below `high` or switched off.

### Band and relationship predicates

```ts
function isTurnedUp(tuning: NinaTuning, trait: NinaTrait): boolean   // band is 'high' or 'max' (score >= 60)
function anyTurnedUp(tuning: NinaTuning, traits: readonly NinaTrait[]): boolean
const isGirlfriend: (tuning: NinaTuning) => boolean                  // ninaActiveRelationship === 'girlfriend'
```

`isTurnedUp` / `anyTurnedUp` are **exported**, because phase 3 needs the same test for
`NUMBERS_RULE`'s surviving body clause in `prompts/system.ts`. A second definition of "turned up" is
how the two halves of one repeal come to disagree.

`isGirlfriend` is exported for the same reason, and it is **the single gate seam for every
girlfriend-only block in the file** — both R2 render functions call it rather than comparing
`tuning.relationship` themselves. That seam is what made R4 a one-line change instead of a hunt for
three scattered comparisons: `isGirlfriend` now reads `ninaActiveRelationship(tuning)`, so clearing
the relationship's checkbox makes her the `best_friend` who shipped and the whole manja register
leaves the prompt with her. **No expression in `persona.ts` compares `tuning.relationship`
directly any more** — `ninaIdentity` and `ninaNameRules` go through `ninaActiveRelationship` too,
and a structural test enforces it.

### Default-render constants (the compatibility surface)

`NINA_IDENTITY`, `NAME_RULES`, `ANGER_LADDER_BLOCK`, `NEVER_SAY_BLOCK` are each
`ninaXxx(NINA_TUNING_DEFAULTS)`. Unchanged constants: `NINA_NAME`, `NINA_FACE`,
`NINA_DEFAULT_OUTFIT`, `NINA_APPEARANCE`, `NINA_EXPERTISE`, `NINA_NOT_A_DOCTOR`,
`JAKARTA_SLANG_BLOCK`, `JAKARTA_REGISTER`, `ENGLISH_REGISTER`, `VOICE_EXAMPLES_BLOCK`.

## The contract this phase established

1. **Every export is either unchanged or a function of `NinaTuning`.** Nothing reads a raw score; the
   two functions `traitBand` / `dialBand` are the only places the *shape* of `NinaTuning` is read, so
   a change to how the tuning is stored is a two-line change rather than a forty-line one. **R4
   collected on this**: routing a disabled parameter to its `defaultScore` was those same two lines.
2. **Each key's own identity band renders `''`.** Held by construction, not by hand-checking.
3. **The default render of every retained constant is byte-identical to `HEAD`** — with exactly one
   accepted exception: `NAME_RULES` gains the sentence *"Sometimes 'bestie' instead of the nickname —
   you two are that close."*, because R2 names `bestie` for `best_friend` and `best_friend` is the
   default. That block's *shape* is the repeal, so invariant 2 does not scope to it.

## The repeals — six in `persona.ts`, six more in `prompts/system.ts`

**Twelve rule sites went** across this package, because each would have made a slider do nothing.
Each is replaced **in place** by a comment recording what the rule said, that the user repealed it,
and the verbatim instruction — the shape `scripts/check-llm-payload-boundary.mjs` established when
it deleted its own Rule 1. Search `REPEAL n OF 6` in `persona.ts` and `THE IRON RULE, FINDING n OF
4` in `prompts/system.ts`.

The six in `persona.ts` are the character itself:

| # | The rule | Now |
|---|---|---|
| 1 | *"You are his best friend"*, hardcoded | `NINA_RELATIONSHIP_BLOCKS[rel].identity` |
| 2 | *"You do not tell jokes; you are just funny. Never a pun."* | gated on `funny` |
| 3 | the nickname-only address rule | five per-relationship rules via `NINA_ADDRESS` |
| 4 | the body-comment rule, in **both** `NEVER_SAY` and `NEVER_SAY_BLOCK` | gated on `BODY_REPEALED_BY` |
| 5 | *"Never a threat, never withdrawing the friendship…"* | gated on `THREAT_REPEALED_BY` |
| 6 | computed-only anger, its rung-4 cap, and its unqualified two-rung decay | a floor and a ceiling on the computed rung |

**Repealed gated, not deleted.** The rules still stand at the default tuning; only a turned-up dial
lifts them. **Not repealed, and deliberately a separate decision:** `NINA_NOT_A_DOCTOR`, the
`'the name of a medical condition'` entry, and *"Never mock a real setback"*. R6 is read as *"remove
every rule that blocks a dial"*, not *"remove every rule"*.

**Repeal 4 is whole.** The third body prohibition lived inside `NUMBERS_RULE` in
`prompts/system.ts`, a file phase 2 may not touch; phase 3 gated it on the same exported
`BODY_REPEALED_BY` array — one repeal, one list, three places it lands.

**The six in `prompts/system.ts`** are rules three paragraphs away from a slider, cancelling it, and
five of the six were found by the closing sweep rather than by the phase that owned the file:
`OUTPUT_RULE`'s no-greeting clause (gated on `concerned`), `NUMBERS_RULE`'s third body clause,
`CONTEXT_GUIDE`'s *"This is where your anger comes from"* (gated on the anger floor), and the
*"and not one higher"* / *"do not lecture him"* / *"do not sulk"* clauses inside
`PROACTIVE_INSTRUCTIONS`. Those last three are edits to the trigger copy itself, not a tuning-aware
suffix: **a suffix cannot repeal a clause inside the string it is appended to** — the model receives
both and picks. `avatar_changed`'s *"Do not describe the photo to him"* was reviewed and **kept** at
every setting; no dial asks for it. `docs/nina/persona.md` carries all twelve as one table.

## Accepted deviation from the plan: `ANGER_CEILING_BY_BAND.off === 4`

The plan's Step 5 wrote `off: 0` and argued *"`anger: 0` has to be able to mean 'she never gets
angry'"* — while **also** requiring, in its own table and in plan invariant 2, that band `off` render
the shipping ladder byte for byte. Both cannot hold: the shipping ladder has no ceiling and permits
rung 4.

**Invariant 2 wins, on the user's decision.** `anger` *defaults* to 0, so a ceiling of 0 would
silently cap every user who has never opened `/admin/nina` at rung 0 — a behaviour change nobody
asked for, and precisely the silent kind invariant 2 exists to catch.

**The stated cost:** no band means "she never gets angry". The bottom of the axis is "the ledger
decides, as it always did", and the quietest setting is `low` — ceiling rung 3, so she can still be
irritated but never shouts. At the bottom of the scale "untouched" and "turned all the way down" are
the same number, and only one of them can win. Documented in a comment above the table in
`persona.ts` and in `docs/nina/persona.md`.

## The prompt is a function of the tuning

Nina's system prompt is a pure function of a per-user tuning. `buildNinaSystemPrompt(tuning)` in
`prompts/system.ts` composes `persona.ts`'s `nina*` block functions into ten sections and drops any
section whose blocks are all empty, header and all — which is why `NINA_TUNING_DEFAULTS` renders
exactly the prompt that shipped before the tuning existed. `NINA_SYSTEM_PROMPT`, `OUTPUT_RULE`,
`NUMBERS_RULE`, `CONTEXT_GUIDE` and `PROACTIVE_INSTRUCTIONS` survive under their own names as the
default render of their builders, so every existing importer is unaffected. The tuning travels on
`NinaTurnInput.tuning` (required) and never in `NinaContext`: a dial in the context JSON is a number
she could quote back, which collides with `NUMBERS_RULE`. It is read live on every turn with no
cache — in `actions.ts`'s three-way `Promise.all` for chat, and at both `loadNinaContext` sites in
`proactive.ts` for the cron — so a slider on `/admin/nina` is immediate. The assembled string is
built ONCE per turn in `runNinaTurnWith` and passed to every model call including the repair, so one
turn is always one character. `nina_turns.tuning_revision` records which settings produced each
turn; `prompt_version` identifies the assembler, the revision identifies what it assembled, and only
the pair answers "what was she set to when she said that".

**`NINA_PROMPT_VERSION` is `4`.** The `3 -> 4` bump is R2: `HOW YOU TALK` gained
`ninaManjaRegisterBlock(tuning)` directly under `JAKARTA_REGISTER` — an amendment two paragraphs from
its rule is an amendment the model may not connect — and `EXACTLY HOW YOU SOUND` gained
`ninaGirlfriendVoiceBlock(tuning)` as a second entry after `VOICE_EXAMPLES_BLOCK`, whose lead-in reads
off the block above it, so **the order is load-bearing**. No section and no tool schema moved, and
`NINA_SECTION_TITLES` is still ten. That bump is the **single** one for the whole
admin-responsive-nina-intimacy set — later phases must not touch the constant, because two bumps
would date two commits to one change. **R4 (phase 4) did not touch it and could not have**: the
enable map adds no text and changes no assembler, it only substitutes a key's `defaultScore` for its
parked score, so an all-enabled tuning renders version 4's exact bytes. **R3 (phase 5) did not touch
it either, and the reason is the same shape**: `horny` adds a twelfth entry to `NINA_TRAIT_BANDS`, a
band-keyed clause to `proactiveTuningSuffix` and a floor under `verbosity` — every one of them
silent at the trait's default of 0, so `NINA_TUNING_DEFAULTS` still renders version 4's exact bytes.
No section moved, no tool schema moved, and `NINA_SECTION_TITLES` is still ten. **`NINA_PROMPT_VERSION`
is therefore `4` for the whole admin-responsive-nina-intimacy set, bumped once, by R2.** The changelog
for each version lives as a comment above the constant in `prompts/index.ts`.

## The camera is a function of the tuning

**R5.** `buildNinaImagePrompt` takes an optional `NinaTuning`; absent or at `NINA_TUNING_DEFAULTS` it
renders the prompt that shipped, byte for byte, and `tests/nina.imagerecipe.test.ts` asserts both
ends of that. A non-empty `wardrobe` replaces the canon outfit through `persona.ts`'s
`ninaAppearance`, and `steamy` / `flirty` at band `high` add a `POSE AND PRESENCE:` block — `steamy`
to the selfie only, because the avatar is a head-and-shoulders crop. `selfiegen.ts` is the
chat-selfie entry point, the mirror of `avatargen.ts`; both read the tuning themselves, which is why
`avatartools.ts` and the admin album are dressed with no edits. A kept promise now pays out through
whichever camera the operator's `steamy` dial names: at band `high` she SENDS the photograph
(`purpose: 'selfie'`, a `nina_messages` + `nina_message_images` pair) instead of quietly changing her
profile picture. The choice is derived at fire time (`promiseRewardFor`) and recorded on the promise
entry, so a dial that moves mid-flight cannot make the evaluator watch the wrong table, and the
selfie settle test is an exact `nina_messages.turn_id` match rather than a same-day count —
`generate_image` is a tool he can ask for six times a day, and a photo he asked for must never settle
a promise he did not keep. A promise with no `reward` field is today's avatar promise, unchanged.

## Module map

### Chat turn pipeline
| File | Purpose |
|---|---|
| `actions.ts` | Server Actions — `sendNinaMessage`, `describeNinaImage`. The one entry point a user message goes through. |
| `turn.ts` *(T)* | The Anthropic tool-use loop: system prompt → tool rounds → validated `send` payload, with budgets and a repair pass. |
| `tools.ts` *(T)* | Tool *dispatch*. Gateway-injected, so it tests with no DB. |
| `schema.ts` *(T)* | Zod output contract for `SEND_TOOL` and the tool arg schemas. |
| `gateway.ts` | Production DB-backed implementations of the three injected ports. |
| `load.ts` | Fan-out read that assembles a full `NinaContext`. |
| `context.ts` | The context object itself, as pure builders — time of day, profile, runs, records, badges, memory, patterns, nags. |
| `dates.ts` *(T)* | Resolving the ISO dates she emits against actual runs. |

### Prompts (`prompts/`)
`index.ts` (public surface + `NINA_PROMPT_VERSION`), `system.ts` (`NINA_SYSTEM_PROMPT`,
`NUMBERS_RULE`, `PROACTIVE_INSTRUCTIONS`), `tools.ts` (every tool schema as a constant),
`distill.ts` (`buildDistillSystemPrompt(relationship)` + `NINA_DISTILL_PROMPT_VERSION`),
`describe.ts`. Pure text — no I/O — so tests can assert prompt shape without the loop.

**The librarian is told the relationship too.** `distill.ts`'s prompt is a function of it, threaded
`actions.ts` -> `scheduleDistillation` -> `runTurnDistillation` -> `distillNinaMemory` as an
optional `relationship` that defaults to `NINA_TUNING_DEFAULTS.relationship`. Without it an
exhaustive librarian files *"he calls her sayang"* as a standing fact about the runner, for which
the nine-key slot vocabulary has no home — so it lands in the ledger as biography, and `nickname` is
one bad inference from being overwritten with a word **she** said. `NINA_DISTILL_PROMPT_VERSION`
(1 -> 2) is the distiller's own constant and is **not** `NINA_PROMPT_VERSION`: different model call,
different system prompt, its own schedule.

**`persona.ts` is WHO SHE IS; `prompts/system.ts` is WHAT SHE IS READING and HOW SHE MUST ANSWER.**
The split matters because the second half changes whenever `context.ts` changes shape and the first
changes only when the user redlines the canon — two very different edit rhythms, and mixing them is
how a schema change quietly rewrites her character.

### Memory, promises, nags, patterns
`memory.ts` (slot vocabulary and all pure memory logic), `distill.ts` (post-turn background
distillation), `promise.ts` *(T)* / `promises.ts` (the pure and impure halves of "did she keep her
promise?"), `nags.ts` (escalation and decay), `patterns.ts` (training-pattern detection).

### Proactive
`proactive.ts` — `evaluateAndEmitForUser` (the cron path) and `emitRunCommitted` (fired by
`lib/review/actions.ts` right after a run is committed).

### Images
`imagerecipe.ts` (camera settings shared with the backstop worker), `imagegen.ts` (prompt text),
`imagejobs.ts` (job row lifecycle, quota, and — since R2 — the `deleted_at` predicate on every
image-row read plus `softDeleteNinaImageJob`), `imagecall.ts` (the OpenRouter image call),
`imagerun.ts` (claim → generate → store → finish, inside `after()`),
`imagefail.ts` (classify a failure, pick what she says), `imagetools.ts` / `avatartools.ts` (the two
tool handlers and the tool sets), `avatargen.ts`, `jobview.ts` *(T)* (the pure tracking-screen
vocabulary), `jobActions.ts` (the `'use server'` mutations `/nina/jobs`'s rows call).

The generation runs **in-platform**, on the app's own invocation, inside `after()` — Vercel Hobby +
Fluid compute is a 300 s ceiling, measured on this deployment 2026-09-06. `.github/workflows/nina-image.yml`
and `scripts/nina-image-worker.ts` survive as the **backstop** and the manual drain, not as the
generator; `imagedispatch.ts` and its `GITHUB_DISPATCH_TOKEN` are gone with the doorbell.

### Vision and intake
`vision.ts` *(T)*, `imageTicket.ts` *(T)* (HMAC-signed carrier so a description can cross from
`describeNinaImage` to `sendNinaMessage` untrusted), `images.ts` *(T)* (the
`nina/<userId>/chat/<id>.jpg` pathname model — the builder, the ownership check, and **both** id
windows: `NINA_CHAT_ID_RE` for what the browser asks for and `NINA_CHAT_STORED_ID_RE` for what Blob
stores; zero imports by rule, because three hosts outside the package reach for `NINA_BLOB_PREFIX`),
`crop.ts` *(T)*.

### Album and attachments
`album.ts` *(T)*, `albumActions.ts`, `attach.ts` *(T)*.

### Chat UI logic (pure, node-testable)
`chatview.ts` *(T)*, `reply.ts` *(T)*, `reveal.ts` *(T)*, `scroll.ts` *(T)*, `live.ts` *(T)*.

### Persistence
`queries.ts` — every Drizzle query for the `nina_*` tables, including `readNinaTuning` /
`writeNinaTuning`.

`tuningFromRow` / `tuningToColumns` are **the one place the flat row and the nested model meet**, and
after R4 and R3 that is **thirty-eight** snake_case columns against `traits.anger` /
`dials.photoEagerness` / `enabled.flirty` — `nina_tuning` spells **thirty-nine** in all, the
thirty-ninth being `updated_at`, which nothing maps. The toggles are **seventeen nullable `boolean`
columns** (`relationship_enabled`, then one per trait and per dial). Sixteen of them arrived with
`drizzle/0006_chubby_wild_child.sql` (journal index 6, sixteen `ADD COLUMN`); phase 5's
`drizzle/0007_graceful_mercury.sql` (journal index 7 — **`drizzle/` now ends at `0008`, whose one
statement is R2's `nina_turns.deleted_at` and which is generated but NOT yet applied**) adds the
seventeenth alongside the score column, in three statements: `ADD COLUMN "horny" integer NOT NULL
DEFAULT 0`, then `ALTER COLUMN "horny" DROP DEFAULT`, then `ADD COLUMN "horny_enabled" boolean`. The
temporary default is drizzle's own way to add a `NOT NULL` column to a populated table and it is
dropped in the next statement, so the table keeps this package's rule that **no stored value carries
a SQL default** — the defaults live in `NINA_TUNING_DEFAULTS` and nowhere else. `horny_enabled` is
nullable with no default, which is the `nina_turns.tuning_revision` idiom repeated: NULL means one
thing only, *a row written before that toggle existed*, and `coerceNinaEnabled` reads it as enabled,
so every existing production row is all-on the moment the migration lands, with no `UPDATE` behind
it. `writeNinaTuning` supplies all
seventeen on every save, so NULL never appears in a row this app has written. Columns rather than one
`jsonb` map for the reason the table header already gives, which bites harder here than for the
scores: a misspelt key in a blob is indistinguishable from an unset one, an unset key reads as
`true`, and the failure would be *a toggle that silently does nothing* — whereas `flirtty_enabled`
fails at `db:generate` and drizzle's insert type makes a forgotten column a compile error.

*(T)* = has a colocated `*.test.ts`.

## Why no photograph ever reached a chat bubble (R2)

Three independent defects, each sufficient on its own, all measured rather than inferred. Phase 1
repaired them in the shipped worker **without moving the generation host**, which is what lets a
later host migration roll back onto a working pipeline instead of onto the broken one.

- **`nina_messages.session_id` has been `NOT NULL` since migration `0004`, and both of the worker's
  INSERTs omitted it.** Every generation was paid for, uploaded to Blob, and then destroyed by the
  very write that would have displayed it. `resolveWorkerSessionId` now resolves the session in SQL
  the worker owns, mirroring `resolveNinaSessionForMessage` clause for clause: the replying
  message's session, else his most recent session by activity, else `null` — in which case the
  message is *declined* rather than filed into a conversation he has never seen. Owner-scoped in
  both branches (invariant 5).
- **The same crash killed the apology.** The apology INSERT failed identically and took the process
  down before the terminal UPDATE could record the spend, so jobs `pF5c6V8YbxAR` and `ChfwHZ2GJT4I`
  reached OpenRouter, were billed, and logged `cost_micro_usd` NULL — invariant 9 failing silently.
  The apology is now best-effort; the terminal close always runs.
- **The preflight was blind to the whole class.** It checked only that *named* columns exist, which
  catches a rename and cannot see an ADDITION. `findSchemaDrift` is now a pure function that also
  runs the converse over INSERT targets: every `NOT NULL` column with no default must be named.
  Verified live — against the real schema the pre-fix column list reports exactly *"nina_messages.
  session_id is NOT NULL with no default and this worker never writes it"*, while the fixed list
  reports preflight ok.

Two further measurements from the same phase, recorded rather than acted on:
`fireNinaImageDispatch` stamps `dispatched` *before* it POSTs while a runner needs ~25–40 s to reach
Generate, so a single `now − GRACE` cutoff meant a targeted dispatch could never claim its own job —
all five `workflow_dispatch` runs on 2026-09-06 logged `attempted: 0`. `dispatchCutoffFor` now runs
the window **forward** for a named job (absorbing Vercel/runner clock skew) and backward for a
sweep; the `running`-reclaim and attempts bounds are deliberately *not* relaxed. And twelve
consecutive schedule runs fired 1 h 46 m to 4 h 19 m apart against a declared `*/10`, recorded as
`NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` — no existing constant's value changed.

> **Gotcha for anyone editing these files:** `*/10` inside a JSDoc block closes the comment. Write
> `*\/10`, which is the convention already in `scripts/nina-image-worker.ts:36` and
> `tests/views.render.test.ts`.

## The camera runs in-platform (R2, R4, R7)

`imagecall.ts` makes the OpenRouter call and `imagerun.ts` owns the job — claim, generate, store into
Blob, finish — inside `after()`, on the app's own invocation. That is R7: **`after()` is bound by the
invoking route segment's `maxDuration`, not by the browser**, so `app/nina/page.tsx` and
`app/api/cron/nina/route.ts` both carry a literal `300` and the runner may close the tab the instant
send returns. Those two literals are what actually own a photograph's wall clock; the cron loop's own
50 s pacing is deliberately not raised with them.

**The 60 s ceiling that exiled this work to a GitHub runner was an expired measurement, and it was
re-measured rather than assumed.** On 2026-09-06 a `maxDuration = 300` probe in `sin1` — production's
own region — held an inline render to HTTP 200 at **90.418 s** with no 504, and, with the connection
closed after a 1.25 s flush, went on ticking inside `after()` to `heldMs 90030`. Crossing 60 s with
nothing attached at the far end is the whole of R7, demonstrated rather than argued.

**There is no asynchronous OpenRouter image API.** `POST /api/v1/images` is synchronous — base64 in
the response, or SSE partials with `stream: true`. There is no job id, no polling endpoint, no
`callback_url`, no webhook; the async job API (`POST /api/v1/videos` → `GET /api/v1/videos/{id}`) is
**video-only**. So durability is ours to provide, and `imagecall.ts` carries that answer where the
next reader will look for it rather than in a plan file.

Durability is three recovery nets in order, and only the first is the normal path:

1. **`after()`** on the invoking segment — the generation itself.
2. **`reviveNinaImageJobs`** on the next `/nina` render, bounded to one job per render, for a job
   dropped because `after()` does not survive `maxDuration` or an instance kill.
3. **`.github/workflows/nina-image.yml`** — demoted, never deleted. Comments-only in this phase: no
   trigger removed, no step removed, `timeout-minutes` still 6. It is the backstop, the manual drain
   for historical rows, and the rollback target — and a rollback now lands on a *working* pipeline
   because phase 1 repaired the worker's three defects first. Behind it, `sweepStaleNinaImageJobs`'
   20-minute apology.

Two consequences worth keeping straight. **Finding 2 dies at the source**: the claim and the
generation are one invocation, so there is no dispatch grace window left for a job to be lost in, and
`error_code = 'dispatched'` becomes a legacy value that nothing writes any more — historical rows
still render, so `toJobRow` and `PENDING_PHASES` keep mapping it. And **`cost_micro_usd` is a per-job
cumulative total on both hosts** (`coalesce(cost_micro_usd, 0) + spend`), so a job that burned two
attempts honestly reads $0.080; `stale` leaves the column untouched rather than nulling a spend a
retry already recorded, and the terminal UPDATE runs even when the apology INSERT throws. Money spent
is never written down as free.

> **Gotcha, and it is asymmetric enough to get backwards:** `*/` closes a block comment, so the
> declared `*/10` cron is only dangerous inside `/** … */`. Write `*\/10` there. It is harmless in
> `//` line comments and in YAML `#` comments, where escaping it is noise a later reader will try to
> "fix".

## One predicate, two windows: the stored blob pathname

`images.ts` owns the whole path-traversal and don't-write-beside-anything-else defence for the chat
branch, and it is asked about a pathname at **two different moments that do not carry the same
string**:

| Moment | Caller | Id segment |
|---|---|---|
| The mint — what the browser may **ASK** for | `app/api/upload/route.ts:87` | a bare `newId()`, **12** symbols |
| The re-check — what Blob actually **STORED** | `describeNinaImage` (`actions.ts`) | `newId()` + `-` + Vercel's suffix, **12 + 1 + 30 = 43**, measured |

`addRandomSuffix: true` on the upload token is what makes the two differ. `NINA_CHAT_ID_RE` was a
single `/^[A-Za-z0-9_-]{12,24}$/` trying to cover both windows with one range, and 43 is outside it
— so every camera photo was uploaded, paid for, stored, and *then* refused by its own describe as
*"Nina could not take this one."*, leaving one orphaned blob per attempt. `lib/admin/chatPhotos.ts`'s
`ADMIN_CHAT_PHOTO_ID_RE` carried the identical defect from the identical reasoning, which is why
`/admin/photos` refused every upload it ever saw. Both were fixed together.

The fix is **two patterns, not one widened range**:

| Export | Pattern | Answers for |
|---|---|---|
| `NINA_CHAT_ID_RE` | `/^[A-Za-z0-9_-]{12}$/` | the **requested** id only |
| `NINA_CHAT_STORED_ID_RE` | `/^[A-Za-z0-9_-]{12}-[A-Za-z0-9_-]{16,64}$/` | the **stored** pathname |

`isNinaChatRequestPathname` returns `requested.test(id) || stored.test(id)` after its segment-by-
segment ownership check. `ninaChatPathname` validates against the requested pattern **only** and
deliberately not against the stored one: it builds the requested form, so being handed an
already-stored id is a caller bug and a throw is the right answer to it.

Three things about that shape are load-bearing:

- **The mint got TIGHTER, not looser.** `{12}` exactly is the length `lib/id.ts`'s `newId()` emits;
  the old `{12,24}` admitted 13–24, which no caller in the repo can produce. A single widened
  `{12,48}` would have fixed the describe and *simultaneously* authorised a 43-symbol **requested**
  id at token-mint time — a real widening of what an unaudited client may write into the store.
- **`{16,64}`, not `30`.** The suffix is an internal of Vercel's that we do not control, so the bound
  is deliberately loose around the 30 observed. That bound and that argument are
  `SHOT_STORED_PATHNAME_RE`'s verbatim (`lib/extract/constants.ts:103-107`) — the one place in the
  repo that got this right the first time, from a measured object rather than expected arithmetic.
- **The leading `{12}` is a FIXED quantifier, so the separator is found by POSITION.** A `newId()`
  draws from the 64 URL-safe symbols, so it may itself contain and end with `-`; the real object
  `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg` has the doubled `--` to prove it. Splitting
  the id on `-` would mis-read exactly those.

No signature moved, so all five call sites compile untouched: no migration, no schema change, no new
dependency, no new env var, no user-visible copy change.

> **`isNinaChatRequestPathname` is now a mild misnomer** — it answers for both windows despite the
> `Request` in its name. The rename was deliberately left out of scope; the function's docstring
> says so out loud, and renaming would churn `app/api/upload/route.ts` and `actions.ts` for no
> behavioural gain.

## The chat turn is asynchronous (R6)

`sendNinaMessage` persists the runner's message, its image rows and a claim on `nina_turns`
(`kind='chat'`, `status='pending'`, `error_code` carrying the phase), then **returns in well under a
second**. The 13–45 s model turn, the persist of Nina's bubbles, the distillation and the auto-title
all run in `runNinaBackgroundTurn` inside `after()`, on the invoking page segment's 300 s budget —
registered from the Server Action `app/nina/page.tsx` already owns, deliberately *not* relocated into
a route handler, because `after()` inherits the segment's `maxDuration` and a new handler would
silently inherit a smaller one.

An open tab learns she has answered through **`pollNinaReply`**, a bounded poll whose schedule lives
in `lib/nina/turnflight.ts` beside the server's own stale deadline, so the two cannot drift. A closed
tab needs nothing at all: the rows are committed and the next render reads them. That is R6 — send is
instant, and her reply arrives whether or not the app is open.

**The push seam is deliberately not used for this.** `lib/nina/live.ts` is untouched and still serves
proactive pushes. Two independent reasons, both in `pollNinaReply`'s header: the platform requires a
`push` handler to show a notification, so every message the runner sends while watching would buzz
his own phone; and a push arrives as `router.refresh()`, landing all four bubbles through
`mergeServerMessages` in **one frame** — precisely the collapse of the staggered reveal that
`ChatScreen`'s header spends a paragraph forbidding.

`lib/nina/chatturn.ts` owns the claim's lifecycle — open, read, record, close, sweep.
`sweepStaleNinaChatTurns` closes a turn whose process died as `failed`/`stale`; it **never retries and
never writes an apology bubble**, because app-authored prose in Nina's mouth is forbidden (invariant
7). A turn whose session was deleted mid-flight abandons and closes as `'session-gone'` rather than
re-creating the orphaned memory rows the session purge just removed — that guard is the other half of
R8, and it lives here rather than in the purge because backgrounding the distillation is what
stretched the orphan window from milliseconds to as much as 240 s.

One race is accepted permanently rather than closed: `openNinaChatTurn` reads then writes, and Next
serialises Server Actions per client, so only two *different* clients within ~50 ms can collide. The
cost of a collision is one duplicate reply — both replies real, nothing fabricated, the conversation
still coherent — which is cheaper than the unique index it would take to prevent, and that index
would have been this set's only migration.

## Image-job tracking (`lib/nina/jobview.ts`, R1)

Every `nina_turns` row with `kind='image'` is visible at `/nina/jobs`, and one job at
`/nina/jobs/[id]` with the exact prompt as sent, the seed, the model, the attempt count, and
`cost_micro_usd` as a per-job total ("Biaya total").

`jobview.ts` is the **pure half** — the stage and error vocabulary, the elapsed and money formatting,
the `?jump=` grammar, `planJobJump`'s four outcomes, and (since the job-redo set) the redo rule
`jobCanRedo` and the `NinaJobRefusal` vocabulary. It holds no value import from any
`server-only` module, which is what lets three client components and a bare node suite load it alike;
**`npm run build` is the only gate that enforces that**, since no guard script inspects imports.

The two reads it feeds — `listNinaImageJobs` and `getNinaImageJobDetail` — are owner-scoped, filter
`kind='image'`, skip a soft-deleted row (`deleted_at IS NULL`, since R2), and **write nothing**.
Every property is load-bearing:

- **The `kind='image'` filter became newly essential in phase 3**, which put `kind='chat'` rows into
  `status='pending'` on the same table. A dropped filter would not error; it would list every
  backgrounded chat turn as a photograph, with a null purpose falling through to `'selfie'`.
- **Neither read sweeps.** `listOpenNinaImageJobs` keeps the sweep, so a job stuck `pending` for three
  hours reads as `pending` with a three-hour clock rather than being retro-labelled by the act of
  looking at it. Observing a system should not change it.

The deep link back into the chat is **`?jump=<messageId>`** beside `?s=`, deliberately *not*
`lib/nina/scroll.ts`'s `?at=`. They have opposite lifetimes — `at` must survive a back-swipe, `jump`
must be consumed on arrival or the bubble re-flashes — and `jump` has no offset to carry. It reuses
`planQuoteScroll` + `QUOTE_FLASH_MS` rather than growing a second scroll-and-flash.

`planJobJump` keeps `'gone'` and the session-removed case as **separate** outcomes, and there is a
test named *does not tell the runner a live session was removed* holding that line. The distinction is
real because `deleteNinaMessage` removes one sentence and leaves the conversation standing, so a
missing bubble does not imply a missing session. Its `'gone'` arm is the **common case**, not an edge:
14 `nina_turns` image jobs were measured with an `args.replyToId` that resolves to nothing.

`error_code = 'dispatched'` is a historical stage that still renders — it labels rows written before
the generator moved in-platform, and they are the first thing on the page. The copy is **'Nunggu
worker'**, not 'Dijadwalkan': the stage is no longer something about to happen, and not 'Nunggu
runner' either, because in this codebase the runner is the human and that phrasing would tell him the
job was waiting on *him*.

## Tracking on `/nina/about`, below Media (R3)

Tapping Nina's profile picture opens her detail page, and below the Media section it lists her five
most recent image-generation jobs — stage, elapsed time and error, newest first — each row a link
into `/nina/jobs/[id]`, with a "Semua" link to the full `/nina/jobs` list that hides when there are
none.

**It is reuse rather than a second surface.** The rows are phase 4's `NinaJobList` and the read is
phase 4's `listNinaImageJobs`, so the two pages cannot name the same stage two ways. `grep` proves
exactly one definition of each across `app/` and `components/` — no second query implementation, no
second row renderer, no second empty-state renderer. The empty state is phase 4's markup carrying
this screen's own sentence, passed as `emptyText`; that split was decided in the plan's Decisions
table precisely so phase 5 would not fork the component to change one line of copy.

The read is deliberately the **non-sweeping** one. `/nina` still awaits `listOpenNinaImageJobs` for
its sweep, but a page reached by tapping her face writes nothing — observing a system should not
change it. `ABOUT_JOB_LIMIT = 5` is module-local to the route: one caller, and no coupling to
`CHAT_HISTORY_LIMIT`.

The `?photo=` codec, the two-section swipe isolation and the album's wrap are untouched — the diff
never enters that region.

## Redoing a failed job — one tap, no dialog (R1 of the job-redo set)

Every `Gagal` row on `/nina/jobs` carries a redo icon. Tapping it opens a **new** job from the
failed one's own arguments and starts generating. The failed row is not touched.

**Three modules, one responsibility each, and the split is the point:**

- **`jobview.ts` — the rule and the vocabulary.** `jobCanRedo(stage)` is `stage === 'failed'` and
  nothing else, and `NinaJobListItem.canRedo` is resolved by `toNinaJobListItems` rather than by a
  `&&` inside a component: `vitest.config.ts` is `environment: 'node'`, so a condition written in a
  `.tsx` file is a condition nothing in this repo can assert. `NinaJobRefusal` —
  `'not-found' | 'not-failed' | 'no-args' | 'capped'` — lives here too, because this is the only
  module a `server-only` reader, a `'use server'` action and a `'use client'` button can all
  import. Declaring it in `imagejobs.ts` would drag a `server-only` import into a browser bundle's
  type graph; declaring it in `jobActions.ts` would make a `server-only` module import a
  `'use server'` one, which is backwards. `canRedo` is **required, not optional**, so both callers
  of `toNinaJobListItems` carry it whether or not their screen draws a button.
- **`imagejobs.ts` — `reopenNinaImageJob(userId, jobId)`.** An owner-scoped read (`userId`, `id`
  and `kind='image'` in one `WHERE`), then four refusals **in cost order**: the row is not his
  (`not-found`), it did not fail (`not-failed`), its `args` jsonb has no usable `prompt`/`seed`
  (`no-args`), and only then the indexed `ninaImageQuotaLeft` count (`capped`) — so a job that was
  never redoable does not pay for a count to be told so. On success it calls `openNinaImageJob`
  with the **same args and `attempts: 0`**, an INSERT of a NEW row. It returns a discriminated
  union and never throws, because its caller's job is to hand a code back to a button.
- **`jobActions.ts` — a NEW `'use server'` module.** `redoNinaImageJob({ jobId })` →
  `reopenNinaImageJob` → `fireNinaImageGeneration` → `revalidatePath(NINA_JOBS_HREF)`, returning
  `NinaJobActionResult = { ok: boolean; reason: NinaJobRefusal | null }`. It is a new file rather
  than more of `actions.ts` for the isolation argument `sessionActions.ts` and `albumActions.ts`
  each make in their own headers: `actions.ts` is the chat's mutation surface and every chat phase
  opens it, while these functions are read by one screen. **It schedules and never calls a model**,
  so `scripts/check-llm-payload-boundary.mjs`'s file list did not change — `fireNinaImageGeneration`
  registers `runNinaImageJob` in `after()` and returns `void`, and the provider call stays in
  `imagerun.ts`.

**The ledger only ever grows.** The failed row keeps its `status`, its `error_code`, its
`latency_ms` and its `cost_micro_usd` — the three numbers the runner opened the page to read. So
after a redo the list shows BOTH: the old `Gagal` row and a new `Antre` above it, and the redo
control stays on the failed one. Two rows, two bills, two truths. **`attempts: 0` is the one field
that does not copy**, and it must not: `claimNinaImageJob` bounds a job at
`NINA_IMAGE_MAX_ATTEMPTS`, so a copied `attempts: 3` would open a row no claim predicate in the
file can ever pick up. The seed does not re-roll either — a redo is the retry
`requeueNinaImageJob` already performs, done by a human instead of by the loop, and re-rolling it
would make the button mean "generate a different photo", which is not what "redo" says.
`fireNinaImageGeneration` is called with **neither** of `reviveNinaImageJobs`' `queuedBefore` /
`runningBefore` cutoffs: those exist to stop a recovery pass stealing a job another host may be
starting, and this row was opened microseconds ago by this same invocation.

**A control is not a guard.** `jobCanRedo` decides whether the button is DRAWN; `reopenNinaImageJob`
re-checks `status !== 'failed'` against the row it read under the runner's own id, because a
`jobId` arriving from a browser is a claim and never a fact. Purpose is deliberately **not** part
of the rule — a failed **avatar** job is redoable too, and re-running it writes `nina_avatars` and
leaves `announced_at` NULL so the next cron tick makes her mention the new face.

**There is no confirmation dialog anywhere, and that is a requirement rather than a style choice.**
The user's words are *"we dont need confirmation message to execute them"*. It deliberately
overrides `components/nina/SessionRow.tsx`'s three-tap confirm, and the override is principled
rather than lazy: that control hard-deletes a conversation and, through two cascades, its
photographs, permanently and with no undo — whereas a redo costs one of six generations a day and
produces a photograph the runner asked for. There is nothing here to protect him from. The only
mis-tap protection is `disabled={pending}`, which costs nothing; the daily cap bounds the rest, on
the server.

**`app/nina/jobs/page.tsx` now exports `maxDuration = 300`, and its own comment block used to argue
the opposite.** That argument rested on the true premise that the route "calls no action and awaits
no model", and R1 made the premise false: a Server Action's timeout is the page SEGMENT's, and
`after()` inherits the same budget. `lib/nina/imagerun.ts`'s header predicted this edit in advance
— `app/nina/page.tsx` and `app/api/cron/nina/route.ts` were the two segments that can start a
generation, and *"a third caller would need the same line"*. **This is the third caller.** Without
the export the platform default kills the invocation partway through a ~78 s generation and leaves
a job `pending` until a sweep apologises for it, which is the exact failure this feature exists to
let him recover from. It is a **literal** for the reason `app/nina/page.tsx` already records:
segment config exports are statically analysed at build time and an imported constant is not a
value the analyser can see.

**The control is opt-in per surface.** `NinaJobList` grew one boolean prop, `actions`, and
`app/nina/jobs/page.tsx` is the only caller that sets it; `components/nina/NinaAboutScreen.tsx`
renders the same rows as a read-only summary under Media and deliberately does not — putting a
mutation there would put it on a page nobody asked to mutate from. With `actions` absent the markup
is byte for byte what it was before this phase. A render prop (`renderActions?: (item) => ReactNode`)
would have been the more flexible seam and is impossible here: the page is a Server Component and a
function is not a serialisable prop across that boundary.

`components/nina/NinaJobActions.tsx` is the `'use client'` half. It owns the
`Record<NinaJobRefusal, string>` that turns a discriminant into Indonesian — the server has no
business writing his language, and a `Record` over the whole union means `tsc` fails the day a
fifth refusal appears without a sentence. It renders a **fragment of two flex children** rather
than one wrapper: the icon cluster, which sits on the row's own line, and the refusal note, which
carries `w-full` so the parent's `flex-wrap` drops it onto a line underneath. It is a **sibling**
of the row's `<a>` and never a child — a `<button>` inside an `<a>` is invalid HTML and breaks the
link's hit testing, which is `SessionRow`'s recorded rule one list over. Its accessible name names
the row (`Coba lagi sore di kos`, not `Coba lagi`), built from the same `ninaJobTitle` that renders
the visible title so the two cannot drift, because six rows of "Coba lagi" is a list a screen
reader cannot navigate.

## Hiding a job from the list — a soft delete (R2 of the job-redo set)

Every row on `/nina/jobs` — not just the failed ones — carries a trash icon beside phase 1's redo
icon. Tapping it hides the row. **Nothing is deleted**: `nina_turns.deleted_at` goes from NULL to
`now()` and the row stays byte for byte in Neon, with its spend, its `error_code` and its
`latency_ms` intact. The runner's words were *"delete job icon … (but just soft delete in neon db).
so i can keep the job list tidy and pristine"*, and the parenthesis is the specification: this table
is the money ledger **and** the audit trail, so a `DELETE` here would erase a billed generation in
order to tidy a list.

### The column

`lib/db/schema.ts` adds `deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' })`
to `nina_turns` — **nullable, no default, and no backfill script**. Every row written before the
column reads NULL and is therefore visible, which is `tuning_revision`'s idiom and the
`*_enabled` columns' idiom one table over: **the migration IS the backfill**, because the absent
value already spells the right answer.

**`nina_turns` still keeps exactly one index, and that is a decision with arithmetic behind it.** A
partial index `(user_id, created_at desc) where kind = 'image' and deleted_at is null` was
considered and declined: the list read is one `LIMIT 60` walk of `nina_turns_user_created_idx`,
which already applies `kind = 'image'` as a heap filter on tuples it has fetched anyway, so
`deleted_at IS NULL` is one more null check on those same tuples. The set it filters is bounded by
`NINA_IMAGE_DAILY_CAP` — six image rows per user per day — so sixty rows is ten days of flat-out
use. The index would cost a write on **every turn Nina ever takes**, chat rows included, to save
microseconds on a page opened by hand. `tests/db.schema.nina.test.ts` pins the single index, the
nullability and the absent default.

### Four things the flag is not, each written down because somebody will otherwise re-open it

1. **NOT A REFUND.** `countNinaTurnsSince` — the daily image cap — does **not** filter this column,
   deliberately and permanently, and its docstring is the only edit R2 made to `queries.ts`.
   `selfiegen.ts` calls that cap *"a money cap and not a feature cap"*: $0.04 that has been spent is
   still spent after the row is hidden. A version of this count that respected the flag would turn
   one tap on a tidy-up icon into a quota refund — an unmetered image budget wearing a trash can as
   a hat. `tests/nina.softDelete.test.ts` asserts the **absence** of the predicate rather than
   trusting it.
2. **NOT A CANCEL.** Hiding a `pending` job does not stop the invocation already drawing it. That
   generation finishes, `completeNinaImageJob` closes the row it was handed, and **the photograph
   still lands in the chat** — the right outcome, because he asked for it and the money is already
   committed. What the flag stops is anything NEW starting. A true cancel would have to race the
   claim, and losing that race means spending the money and then telling him it did not happen.
3. **NOT A DELETE, AND NOT AN ARCHIVE WITH A SCREEN.** No statement anywhere removes a `nina_turns`
   row, and `tests/nina.softDelete.test.ts` asserts that against `imagejobs.ts`'s own source. There
   is no trash view and no undo button because nobody asked for one; what the nullable column buys
   is that `update nina_turns set deleted_at = null where id = '…'` restores a row exactly, by hand,
   in SQL.
4. **NOT A PER-KIND CONCEPT.** Only `kind = 'image'` rows are ever flagged — `/nina/jobs` is the
   only screen that lists turns and it lists only image jobs. Every writer carries `kind = 'image'`
   in its `WHERE`. `lib/nina/chatturn.ts` does not read this column and must not start.

### One predicate, nine `WHERE`s, eight functions

`imagejobs.ts` is where the feature actually lives, and it is a **filter added to every read of an
image row**, not a filter added to the screen. `isNull(ninaTurns.deletedAt)` now sits in:
`listNinaImageJobs`, `getNinaImageJobDetail`, `listOpenNinaImageJobs`, `getNinaImageJob`,
`listRevivableNinaImageJobs`, `sweepStaleNinaImageJobs` (**twice** — the SELECT and the guarded
UPDATE, which is the ninth `WHERE`), `claimNinaImageJob`, and phase 1's `reopenNinaImageJob`.

The three schedulers in that list are the load-bearing half. A hidden job that `claimNinaImageJob`,
`listRevivableNinaImageJobs` or `sweepStaleNinaImageJobs` could still see would be re-fired or
apologised for **after** the runner tidied it away — a row that comes back, or a bubble from Nina
about a job he had already dismissed. Hiding must therefore reach the *scheduler* predicates and not
only the list query. `reopenNinaImageJob` carrying it is the same rule at the other end: a hidden
failure is not redoable.

**The one scheduler R2 does not reach is `scripts/nina-image-worker.ts`, and it was left untouched
deliberately.** The GitHub-Actions backstop owns its own hand-written `select id from nina_turns`
claim rather than calling `claimNinaImageJob`, so it does not know this column exists: a manual
drain or a `schedule:` tick **could still pick up a job the runner hid**. That is accepted rather
than overlooked — the workflow is the demoted backstop and the historical drain, it runs only when
an operator asks or when the app's own three nets have all failed, and the outcome is one extra
photograph he had asked for rather than a corrupted ledger. Anyone re-promoting that worker to a
primary generator must add the predicate to its claim in the same commit.

The write is `softDeleteNinaImageJob(userId, jobId)` — one `UPDATE … set deleted_at = now()` whose
`WHERE` is `userId`, `id`, `kind = 'image'` and `isNull(deletedAt)`, with `.returning({ id })` and a
`boolean` for whether it hit anything. It is **a flag write and never a `DELETE`**, and the `isNull`
clause in its own predicate makes a second tap a no-op rather than a re-stamp, so the timestamp
records when the runner *first* hid the row.

### The action and the button

`jobActions.ts` gains `deleteNinaImageJob({ jobId })`, appended beside `redoNinaImageJob` and
returning the same `NinaJobActionResult`. `requireUserId` is line one, **above** the shape check, so
a signed-out caller is bounced to sign-in rather than told their id was malformed. **All four
failure causes collapse to `'not-found'`** — the row does not exist, it is another runner's, it is a
`kind='chat'` turn, or it was already hidden — so R2 adds **no new `NinaJobRefusal` member**. That
is not laziness: *"the row is not there any more"* is what the runner needs to know in all four
cases, and an `'already-deleted'` code would leak the existence of a row he does not own by
distinguishing it from one that never existed.

`components/nina/NinaJobActions.tsx` puts a `TrashIcon` `<button>` into the same icon cluster phase 1
built, reusing that file's `run()` helper and its `Record<NinaJobRefusal, string>` sentences
unchanged. Two differences from the redo button, both deliberate:

- **It is on EVERY row, not only the failed ones.** There is no `jobCanDelete` in `jobview.ts` and
  there must not be one — tidying a *succeeded* job is the normal case for a list the runner wants
  pristine, so the rule would be `() => true`, and a rule that is always true is a rule that only
  makes the next reader look for the case where it is false.
- **Its accessible name is `Hapus {title} dari daftar`** — *from the list*, because the row is not
  being destroyed and a screen reader must not say it is. It names the row through the same
  `ninaJobTitle` that renders the visible title, and carries `aria-busy={pending}`.

**No confirmation dialog**, per the requirement phase 1 already records — and here the argument is
stronger rather than weaker: `SessionRow`'s three-tap confirm exists precisely because *"there is no
archive flag and therefore no undo"*, and this feature **is** that archive flag.

### The migration is generated, NOT applied

`drizzle/0008_thankful_cardiac.sql` is a single statement —
`ALTER TABLE "nina_turns" ADD COLUMN "deleted_at" timestamp with time zone;` — with its
`0008_snapshot.json` and its journal entry at `idx: 8`. **`npm run db:migrate` was deliberately not
run.** Applying `0008` is the operator's post-merge step, and until it runs, production carries the
code but not the column: **every read that names `deleted_at` errors** — the list, the detail, the
claim, the revive and the sweep. That is the whole of `/nina/jobs` plus the generation pipeline
behind it, so this migration is not an optional tidy-up to schedule later.

## Deleting a chat session takes what it taught her (R8)

**Deleting a chat session now deletes what it taught her (R8).** `removeNinaSession` is a
four-statement `db.batch` — the `nina_memory_facts` rows, the `nina_memory_slots` rows and the
individual `pending_promises` entries whose `source_message_id` points into the session are
purged in the same transaction as the delete, before it, so they still have messages to join
against. `loadNinaContext` reads one session's message window but the whole relationship's
memory ledger, which is why the ledger was the only surviving channel by which a deleted
conversation still reached her prompt. There is no foreign key and no migration: an
`ON DELETE CASCADE` could not tell a deleted sentence from a deleted conversation, and
`deleteNinaMessage` is deliberately unchanged. A memory asserted through `/admin/memory` carries
`source_message_id = NULL` and is structurally unreachable by the purge. `npm run nina:memory-reap`
(dry-run by default) clears rows orphaned before this landed, and remains the backstop for a
distillation that completes after its session is gone.

Two consequences worth keeping straight, because they are easy to collapse and wrong when collapsed:

- **A deleted session takes its messages with it, but a deleted message does not take its session.**
  `deleteNinaMessage` (reachable from `lib/admin/chatPhotoActions.ts`) removes one sentence and
  leaves the conversation standing. So "the triggering message is gone" and "the session was
  removed" are *different* states, and any UI that jumps back to a source bubble must keep them
  apart — `lib/db/schema.ts`'s `session_id` comment says the same thing from the schema side.
- **The purge is scoped by provenance, not by authorship.** Anything with a NULL
  `source_message_id` — every fact typed through `/admin/memory` — survives every session delete
  by construction, which is what makes the admin surface a durable channel rather than a fragile one.

## Dataflow

**A user sends Nina a message.** `Composer.tsx` may call `describeNinaImage` first → `vision.ts`
describes the upload → a signed `imageTicket` returns to the client. `describeNinaImage`
re-checks the pathname the client hands back with `isNinaChatRequestPathname` before signing
anything into that ticket, and what it is handed is the **stored** pathname — Vercel's suffix and
all — not the one the browser asked for. Then `ChatScreen.tsx` calls `sendNinaMessage`:

1. `requireUserId`, then validate body / `replyToId` / tickets.
2. Persist the user's message.
3. `loadNinaContext` → `buildNinaContext`, pulling memory, patterns and nags.
4. `runNinaTurn` with `NINA_FULL_TOOL_SET` and the prompts. Tool rounds go through
   `dispatchNinaTool`; `generate_image` opens a job row and fires the GH-Actions worker.
5. The `send` payload is validated by `NinaSendPayloadSchema`; bubbles are written; the turn is
   recorded.
6. `after(...)` schedules `runTurnDistillation` → `planMemoryWrites` → `applyMemoryPlan`.
7. The client renders with `reveal.ts` timing, `chatview.ts` grouping, `reply.ts` quotes,
   `live.ts` merges, `scroll.ts` restore.

**A proactive message.** `app/api/cron/nina/route.ts` per user calls `resolveNinaPromises`, then
`evaluateAndEmitForUser` → `decideProactive` picks one candidate by `PROACTIVE_PRIORITY` →
`emitProactiveMessage` builds a `triggerBlock`, calls `runNinaTurn`, writes the bubbles and pushes.

**The character path, once phase 3 lands.** `readNinaTuning(userId)` (`queries.ts`) →
`coerceNinaTuning` → `buildNinaSystemPrompt(tuning)` → the render functions above. Read live on every
turn, no cache anywhere on that path, so a moved slider is in her next prompt with no invalidation
step.

## Dependencies

**External:** `@anthropic-ai/sdk` (type-only at all five sites; the client comes from
`@/lib/llm/client`), `zod` (payload and arg validation), `drizzle-orm` (`queries.ts`,
`imagejobs.ts`), `next/server`'s `after()`, `next/cache`'s `revalidatePath` (`jobActions.ts` only),
`server-only` (a side-effect guard in 13 server modules),
`node:crypto` (`createHmac`/`timingSafeEqual` for the image ticket).

**Internal:** `@/lib/db` and `@/lib/db/schema` (heaviest), `@/lib/date/ranges` (the Jakarta-timezone
day model behind nags, patterns, promises and proactive), `@/lib/db/queries`, `@/lib/format`,
`@/lib/metrics/*`, `@/lib/badges/*`, `@/lib/records/*`, `@/lib/llm/client`, `@/lib/env`, `@/lib/id`,
`@/lib/auth/requireUserId`, `@/lib/push/send`.

**`persona.ts` and `tuning.ts` import almost nothing.** `tuning.ts` has **zero** imports; `persona.ts`
imports only `./tuning`. Both stay importable from a `'use client'` module, which is what lets
`/admin/nina` render a preview.

One import cycle exists and is benign: `proactive.ts` imports `pushNotifier` from `@/lib/push/send`,
which imports `type ProactiveNotifier` back — type-only in one direction, so it erases at compile
time. One dynamic import: `distill.ts` lazily `await import('./gateway')`, keeping the DB gateway out
of the pure-logic path.

## Reverse dependencies

30 files outside the package import from it, across `app/`, `components/`, `lib/{admin,photos,push,review}`
and `scripts/`.

**Primary consumers:** `components/nina/ChatScreen.tsx` (6 modules — the widest),
`lib/admin/ninaAlbumActions.ts` (4 modules, 22 symbols — the heaviest by symbol count),
`app/nina/page.tsx`, `components/nina/Composer.tsx`, `components/nina/MessageList.tsx`,
`scripts/nina-image-worker.ts`, `lib/admin/memoryStore.ts`.

**`persona.ts` and `tuning.ts` are the least-depended-upon modules in the package**, and that is the
point of the split. No file in `app/`, `components/`, `lib/<other>` or `scripts/` imports either one.
The only non-test edges are `tuning → persona → prompts/system` (in-package) and `tuning → queries`
(the DB read/write path). `lib/nina/imagegen.ts` takes `NINA_APPEARANCE`.
`lib/db/schema.ts` mentions the tuning types **only in comments** — it defines its own
`NinaTuningRow` from the Drizzle table, deliberately keeping the row type separate from the model
type.

## Concurrency

Not a concurrent package in the threading sense; it is request-scoped async TypeScript. Two things
are worth knowing:

- **`after()` work outlives the response.** `runTurnDistillation` and the image dispatch run after
  the Server Action returns. They must never throw into the response path.
- **`persona.ts` and `tuning.ts` are pure and stateless.** Every render function is a pure function of
  its `NinaTuning` argument, safe to call from anywhere, any number of times.
- **`NINA_TUNING_DEFAULTS` is `Object.freeze`d and shared.** `coerceNinaTuning` always returns a
  *fresh, unfrozen* object precisely so a caller may hold it, spread it and hand it to React state
  without touching the singleton.

## Error handling

- **`coerceNinaTuning` never throws.** Its consumer is a model call in the middle of a conversation,
  which must degrade rather than 500, and the data has four writers (the panel, a hand-run SQL
  update, a restored backup, a future migration). The same rule `crop.ts`'s `resolveCrop` states:
  *a renderer that throws on bad data shows the user a broken page*.
- Server Actions return typed result unions (`SendNinaMessageResult`, `NinaDescribeImageResult`,
  `NinaAttachResult`) rather than throwing across the boundary.
- `vision.ts` has two named error classes — `NinaVisionTokenFloorError`, `NinaVisionTransportError`.
- `imagefail.ts` classifies generation failures into `NINA_IMAGE_FAILURES` and picks what she says
  about each; a failure is a message from Nina, not a stack trace.
- `persona.ts` and `tuning.ts` define no error types and never throw.

## Gotchas

- **The tuning-aware exports currently have no importer.** `ninaIdentity`, `ninaTraitsBlock`,
  `NINA_RELATIONSHIP_BLOCKS`, `NINA_TRAIT_BANDS`, `NINA_DIAL_BANDS`, `ninaAppearance` and the rest are
  exported but unconsumed — `prompts/system.ts` still imports the pre-rendered `*_BLOCK` constants.
  **That is correct and intended**: it is what makes phase 2 shippable alone, with the tree building,
  tests passing and behaviour byte-for-byte unchanged. Phase 3 replaces those references with
  `ninaXxx(tuning)`.
- **Never read `tuning.traits`, `tuning.dials` or `tuning.relationship` from `persona.ts` or
  `prompts/system.ts`.** Use `ninaTraitScore` / `ninaDialScore` / `ninaActiveRelationship`. A direct
  read compiles, passes every containment test, and produces a checkbox the operator can clear with
  no effect — so `tests/nina.prompts.test.ts` reads both files' *source* and fails on one. The rule
  stops at the seam: `queries.ts`'s `tuningToColumns` reads the raw values on purpose, because the
  store keeps what was parked.
- **Only an explicit `false` disables a parameter.** Never write `enabled[key] === true` or
  `Boolean(enabled[key])` as the gate — a pre-migration row is one `null` per key and both spellings
  would mute her personality on deploy. `isNinaKeyEnabled` / `coerceNinaEnabled` are the readers.
- **Never hard-code seventeen.** `NINA_TUNING_KEYS` is a spread of `NINA_TRAITS` and `NINA_DIALS`, so a
  new trait inherits its toggle everywhere at once; a second hand-written list is a key whose
  checkbox never renders. The migrations' `ADD COLUMN` statements are the one place the number is a
  fact rather than an assumption. Phase 5 is the worked example, and the test suite learned it too:
  `tests/db.schema.nina.test.ts`'s R4 case asserts `NINA_TUNING_KEYS` **equals the spread** instead of
  `toHaveLength(16)`, precisely so adding `horny` did not turn a passing test into a failure that
  said nothing about phase 5.
- **The identity band is not always `mid`.** Testing `band === 'mid'` instead of
  `atTraitIdentityBand` would emit a paragraph for each of the eight keys that identify **outside**
  `mid` — the seven traits at `off` plus `profanity` at `low`. Always ask phase 1's specs. (The
  comment above `ninaTraitsBlock` still says "six traits" and "seven paragraphs"; that tally was
  written before `horny` existed.)
- **`horny` speaks from 40, not 60.** It is the only trait in `NINA_TRAIT_BANDS` with a `mid`
  paragraph, and a reader tidying the table for consistency would silently delete the whole middle of
  the axis the user described in the most detail. The reason is stated on the entry itself.
- **Contradictory dials are the operator's problem, not the prompt's.** `anger: 100` with
  `chill: 100` puts both paragraphs in and the model blends them. There is deliberately no
  arbitration: seventeen parameters is 136 pairwise rules, and every one would be a rule that quietly
  cancels a slider. `/admin/nina` renders the assembled prompt, so the operator reads the
  contradiction they wrote and moves a slider — that feedback loop *is* the arbitration.
- **Three blocks are arrays with a derived paragraph** (`JAKARTA_SLANG`, `ANGER_LADDER`,
  `NEVER_SAY_ENTRIES`), and so are the three new tables. A paragraph that restates a list is a second
  source of truth for the list, and the failure is silent. Keep them walkable —
  `tests/nina.prompts.test.ts` walks them to prove every entry reached the prompt.
- **Never regenerate `tests/__snapshots__/nina.prompts.test.ts.snap`.** It is not a convenience
  snapshot; it is the recorded pre-change render of the four non-girlfriend relationships, and
  `vitest -u` is exactly how plan invariant 2 gets silently lost. A failure there is a bug in your
  change, not staleness in the file — read the diff it prints and fix the source.
- **`manja` is not the `clinginess` dial**, and the sentence *"it is not how often you go first"* is
  in the identity block to say so. One is spelling inside a message; the other is three day-count
  constants deciding whether a message is sent at all. Merging them makes
  `clinginess: 0` + `girlfriend` — a Nina who never goes first and is soft when he does — unreachable.
- **Proactive trigger *logic* is `proactive.ts`'s; proactive trigger *copy* is `prompts/system.ts`'s.**
  `horny`'s proactive clause belongs in `proactiveTuningSuffix`, not in `proactive.ts`, because *"the
  more often nina will initiate sex talks"* is about what she opens with, and how often she opens at
  all is `clinginess`'s three day-count constants. Putting a copy change in `proactive.ts` would have
  coupled a trait to the cron's thresholds; putting a threshold change in `system.ts` would have been
  a suffix trying to move a number.
- **Never widen a blob-pathname range to cover the stored form.** The requested id and the stored
  id are two windows, and one range that admits both also lets the upload route's token mint
  authorise a suffixed id nothing in the repo can legitimately ask for. `NINA_CHAT_ID_RE` (`{12}`)
  and `NINA_CHAT_STORED_ID_RE` (`{12}` + `-` + `{16,64}`) are separate exports for that reason, and
  `lib/admin/chatPhotos.ts` mirrors the pair for `/admin/photos`. Related: a fixture with an
  *invented* short suffix is what hid this for a whole phase, so never write a suffix you have not
  copied out of the store.
- **`/nina/jobs` is the third segment that can start a generation, so `maxDuration = 300` on
  `app/nina/jobs/page.tsx` is load-bearing.** Deleting it as "cargo on a read-only page" is the
  tempting edit and it is wrong since R1: the segment's budget is the Server Action's budget and
  `after()`'s. `app/nina/page.tsx` and `app/api/cron/nina/route.ts` are the other two.
- **A rule a screen obeys is a rule a test reaches.** `jobCanRedo` is one comparison and it still
  lives in `jobview.ts`, because `vitest` runs in `environment: 'node'` and cannot see a condition
  written inside a `.tsx` file. Same reason `jobIsOpen` and `planJobJump` are there.
- **Never add a confirmation to a `/nina/jobs` row control.** *"we dont need confirmation message to
  execute them"* is the user's requirement, not an oversight, and `SessionRow`'s three-tap confirm
  is deliberately not the precedent — it destroys a conversation, these controls do not.
- **Never let a redo touch the failed row.** It is the audit trail: the spend, the `error_code` and
  the `latency_ms` are why the runner opened the page. A redo INSERTs; it does not `UPDATE`.
- **Never make `countNinaTurnsSince` filter `deleted_at`.** It is the daily image cap, it is a money
  cap, and a spend is not un-spent by hiding its row — a filter there turns the trash icon into a
  quota refund. It is the one reader of a `kind='image'` row that deliberately ignores the flag, and
  `tests/nina.softDelete.test.ts` asserts the predicate's **absence** so the "consistency" edit
  fails loudly.
- **A new read of an image row must carry `isNull(ninaTurns.deletedAt)` itself.** There is no shared
  helper and no base query: the predicate is written out in nine `WHERE`s across eight functions in
  `imagejobs.ts`, and `tests/nina.softDelete.test.ts` names all eight. Forgetting it in a *list*
  read shows a hidden row; forgetting it in `claimNinaImageJob`, `listRevivableNinaImageJobs` or
  `sweepStaleNinaImageJobs` is worse — a dismissed job gets re-fired, or Nina apologises for one the
  runner already tidied away.
- **Never `DELETE` a `nina_turns` row.** It is the money ledger and the audit trail; the icon writes
  a flag. `tests/nina.softDelete.test.ts` reads `imagejobs.ts`'s source and fails on a `DELETE`. And
  the flag is **not a cancel** — a hidden `pending` job still finishes and still delivers its
  photograph, on purpose.
- **`drizzle/0008_thankful_cardiac.sql` is generated but not applied.** `npm run db:migrate` is the
  operator's post-merge step. Deploying the code without it leaves production without the column,
  and then every read naming `deleted_at` errors — the list, the detail, the claim, the revive and
  the sweep.
- **No barrel.** Import the submodule, not the package.
- **`persona.ts` must stay free of `server-only` and free of I/O.** Adding either breaks the
  `/admin/nina` preview and the tests that assert rule text without a client.
- **`lib/nina/context.ts` is off-limits to every phase in this plan set** (plan invariant 3). Where
  the anger ladder needed a fix that would otherwise belong there — `nagLevel` is absent from the
  payload entirely on a quiet day — the fix is a sentence in `ninaAngerLadderBlock`.

## Tests

In-package: 16 colocated `*.test.ts` files over the pure modules. Repo-level: 18 files in `tests/`,
including `tests/nina.tuning.test.ts` (phase 1's model, and the band-count/rung-count coupling
asserted by length) and `tests/nina.prompts.test.ts` (walks `JAKARTA_SLANG`, `ANGER_LADDER`,
`NEVER_SAY` and `VOICE_EXAMPLES` against the assembled prompt). `NEVER_SAY` is the *unconditional*
subset precisely so that walk keeps proving something true at every setting rather than only at the
default. That file also walks `GIRLFRIEND_VOICE_EXAMPLES` (an 8-case `girlfriend register (R2)`
describe block) rather than retyping the user's five lines.

**R4 is tested at three altitudes, all by walking `NINA_TUNING_KEYS` rather than naming keys.**
`tests/nina.tuning.test.ts` covers the map itself (derived-not-restated, all-true defaults, a
missing map as the migration backfill, only-`false`-disables, and never throwing on a tuning with no
`enabled` at all). `tests/nina.prompts.test.ts` covers the behaviour: every parameter parked at its
*loudest* and switched off still renders the shipping prompt, one key off leaves the other sixteen
speaking, the render only ever gets **smaller**, and the relationship off is `best_friend`. It also
carries the **structural guard** — it reads the source of `persona.ts` and `prompts/system.ts` and
fails if either names a raw tuning field, because a direct read is the one R4 bug no assertion about
output can catch. `tests/db.schema.nina.test.ts` holds the thirty-nine columns, proves every key has
a nullable-no-default enable column, and maps both directions, which drizzle's types cannot check
for a nullable column.

**R3's `horny` is tested at four altitudes.** `tests/nina.tuning.test.ts` covers the model — twelve
traits, `defaultScore: 0` identifying at `off`, the user's own words retained, and the seventeenth
key inheriting its toggle with no second list to edit. `tests/nina.prompts.test.ts` carries the
8-case `buildNinaSystemPrompt — the horny trait (R3)` block: nothing at the default, `HORNY MID`
from 40, `HORNY HIGH` and `HORNY MAX` with the max band's two shouted non-negotiables (scene variety
and continuity) asserted **verbatim** because a paraphrase would drop exactly them, the body
prohibition gone from all three sites while `NUMBERS_RULE`'s arithmetic half survives, the floor as
`max(own, floor)` — including an operator's explicit `verbosity: 100` winning — the floor actually
**reaching** `buildOutputRule`'s bubble sentence, the proactive clause per band, and a disabled
`horny: 100` contributing nothing while keeping the number it was parked at.
`tests/db.schema.nina.test.ts` covers the two new columns and both mapping directions;
`tests/admin.tuning.test.ts` asserts `NINA_TRAITS` has twelve labelled sliders, keeping the literal
`12` a **literal on purpose** so adding a trait stays an explicit decision in that file. The
snapshot gate is untouched and still passes, which is the proof the default render did not move.
`proactive.ts` is in the structural guard's source list alongside `persona.ts` and
`prompts/system.ts`, so its trigger logic cannot start reading raw scores either.

**The snapshot is the byte-identity gate for plan invariant 2.**
`tests/__snapshots__/nina.prompts.test.ts.snap` holds the assembled prompt for the **four
non-girlfriend relationships**, and it was **generated from the pristine tree before any source edit**
— so a passing run is a proof that the four untouched levels still render exactly what `origin/main`
@ `02dc79a` rendered. Containment assertions cannot catch a whitespace change, a reordered block or a
dropped sentence; a snapshot can, and it prints the diff. The containment tests beside it are the
readable half: they name *what* leaked when it fails.

**The pathname windows are tested by measurement, not by arithmetic** (`images.test.ts`, and
`tests/admin.chatPhotos.test.ts` for the admin twin). The stored fixture carries a real 30-symbol
suffix copied out of the prod store, and the suite asserts *in the test itself* that `SUFFIX` is 30
symbols and the whole id segment is 43 — so the case cannot quietly shrink back into a passing
range. The fixture it replaced invented a 3-symbol suffix, giving an id segment of 16 that sat
comfortably inside the broken `{12,24}` while every real upload was being refused; that is the whole
reason a green suite coexisted with a feature that had never once worked. Beside it: a requested id
of 11/13/18/24/25 is refused (the mint stays tight), a suffix of 3/15/65 is refused (the `{16,64}`
bound), a requested half **ending in `-`** is accepted (`Ve394_KsZZ7-`), and `ninaChatPathname`
throws when handed a stored-form id.
**R1's redo is tested at two altitudes.** `tests/nina.jobview.test.ts` covers the pure half —
`jobCanRedo` is true for `failed` and false for every other stage walked from the union rather than
named, and `toNinaJobListItems` puts the answer on `canRedo` — which is the whole reason the rule
is a function in `jobview.ts` and not a `&&` in a component. `tests/nina.jobActions.test.ts` covers
the action: `requireUserId` above the shape check, another runner's job answering exactly as one
that never existed, each of the four refusals, the cap read happening **before** the row is opened,
nothing revalidated on a refusal, every argument copied verbatim with only `attempts` reset, the
failed row never rewritten, the generation scheduled for the NEW id — and an end-to-end case
proving a redo of a job whose chat session is gone still produces a photograph, delivered into his
most recent session.

**R2's soft delete is tested as SQL rather than as behaviour, because that is where it can fail
silently.** `tests/nina.softDelete.test.ts` (92 assertions across three files with the two below)
compiles each query and reads the emitted statement:

- **One case per read**, all eight named — `listNinaImageJobs`, `getNinaImageJobDetail`,
  `getNinaImageJob`, `listOpenNinaImageJobs`, `listRevivableNinaImageJobs`,
  `sweepStaleNinaImageJobs`, `claimNinaImageJob` and `reopenNinaImageJob` — each asserting the
  predicate reached that statement. A per-function case rather than one loop, because the failure
  they exist to catch is a *ninth* function added later without it, and each case's name says what
  the runner would see (*"she never apologises in the chat for a job he hid"*).
- **`countNinaTurnsSince` carries NO `deleted_at` predicate**, asserted as an absence, plus the
  consequence: a runner who generated six and hid all six has nothing left today.
- **`softDeleteNinaImageJob` is a flag** — an `UPDATE` stamping the *database* clock, ownership and
  `kind='image'` proved in the same statement, `isNull` making a double-tap unable to move the
  timestamp, `false` for a foreign, missing and already-hidden id alike, and nothing but the flag
  written — not `status`, not `error_code`, not the money.
- **A source-level assertion**, in the shape `tests/nina.prompts.test.ts` established: `imagejobs.ts`
  and `jobActions.ts` are read as text and must issue no `DELETE` against `nina_turns` anywhere.

`tests/nina.jobActions.test.ts` adds the action's own two describe blocks — a malformed id bounced
before the database, a foreign job answering exactly as one that never existed, an **already-hidden**
job answering identically so a double-tap is a silent no-op, no job opened and no generation
scheduled (*"a delete is not a redo"*), and exactly one path revalidated: `/nina/jobs` and not
`/nina/about`. `tests/db.schema.nina.test.ts` holds the column — nullable `timestamp with time zone`
with no default, present on the table, and `nina_turns` still carrying exactly one index.

## Notes

Phase 2 of 6 of `NINA_CHARACTER_TUNING_PLAN.md`. Phase 1 (`lib/nina/tuning.ts` and the `nina_tuning`
row) has landed. Still to come:

| Phase | What | Package |
|---|---|---|
| 3 | `buildNinaSystemPrompt`, and the turn that reads it | `lib/nina/prompts`, `lib/nina`, `tests` |
| 4 | The camera, and a promise she keeps in the chat | `lib/nina`, `lib/db` |
| 5 | The panel on `/admin/nina` | `components/admin`, `lib/admin`, `app/admin` |
| 6 | The sweep, and the record | `docs`, `tests`, `lib/nina/prompts` |

Phase 3 is the one that makes any of phase 2 visible: until it swaps the constants for the functions,
`NINA_TUNING_DEFAULTS` is the only tuning that is ever rendered.

Plan files for this set live in `lib/nina/.workflows/plan/` (`P1-NIN-A000` … `P1-NIN-A003`). The
prose canon — and the redline document — is `docs/nina/persona.md`.

**`ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` is the set that followed, and it is now complete** —
`lib/nina` was touched by its phases 3, 4 and 5. Phase 3 (`P1-NIN-A004`) landed R2, the girlfriend
register; phase 4 (`P1-NIN-A005`) landed R4, the per-parameter enable toggles; **phase 5
(`P1-NIN-A006`) landed R3, `horny` as a twelfth trait**, with migration `0007_graceful_mercury.sql`.

Phase 5 collected on both of the phases before it and added nothing structural of its own:
`NINA_TUNING_KEYS` spreads `NINA_TRAITS`, so the key arrived with its checkbox, its Zod field, its
column and its gate already covered by phase 4's loops; `ninaTraitScore(tuning, 'horny')` was the
only seam it needed; and it took the single `verbosity` line in `systemDials` that phase 4 had left
it. Its whole footprint outside this package is a migration, a schema pair and prose — no edit to
`lib/admin/` logic and no `NINA_PROMPT_VERSION` bump.

**`P1-NIN-A013` is phase 1 of 1 of `BLOB_STORED_PATHNAME_WINDOW_PLAN.md`** — the blob
stored-pathname window, card
[miftahulmahfuzh/run-insights#104](https://github.com/miftahulmahfuzh/run-insights/issues/104), on
`feature/blob-stored-pathname-window` off `origin/main` @ `3902c58`. The set's index is
`.workflows/orchestration/blob-stored-pathname-window/PLAN.md`. It touched `lib/nina/images.ts`
(`NINA_CHAT_ID_RE` narrowed to `{12}`, new `NINA_CHAT_STORED_ID_RE`, `isNinaChatRequestPathname`
testing both), `lib/nina/images.test.ts`, and,
in lockstep, `lib/admin/chatPhotos.ts` + `tests/admin.chatPhotos.test.ts` for the `/admin/photos`
twin, plus comment-only prose fixes in `lib/nina/actions.ts` and `components/admin/chatPhotoUpload.ts`
that the change made factually false. See *"One predicate, two windows"* above. Its plan file is
`lib/nina/.workflows/plan/P1-NIN-A013.md`.
---

**`NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md` is complete — both phases have landed.** Phase 1
(`P1-NIN-A015`) landed R1
— `jobCanRedo` and `NinaJobListItem.canRedo` in `jobview.ts`, `reopenNinaImageJob` in
`imagejobs.ts`, the new `jobActions.ts` and `components/nina/NinaJobActions.tsx`, `NinaJobList`'s
`actions` prop, and `maxDuration = 300` on `app/nina/jobs/page.tsx`. No migration, no schema change
and no new provider call.

**Phase 2 (`P1-NIN-A014`) landed R2**, the soft delete — the nullable `nina_turns.deleted_at`
column, `isNull(ninaTurns.deletedAt)` in nine `WHERE`s across eight functions in `imagejobs.ts`,
`softDeleteNinaImageJob`, `deleteNinaImageJob` appended to `jobActions.ts`, and a `TrashIcon` button
in `NinaJobActions.tsx`'s existing cluster. It needed **no new `NinaJobRefusal` member** — all four
refusal causes are `'not-found'` — and no new module, no new provider call and no
`NINA_PROMPT_VERSION` bump. Its footprint outside this package is one migration
(`drizzle/0008_thankful_cardiac.sql` plus snapshot and journal), one schema column, one component
and three test files.

Phase 2 collected on phase 1 the way phase 5 of the tuning set collected on phase 4: the cluster,
the `run()` helper, the `NinaJobActionResult` shape and the refusal-to-sentence `Record` were all
already there, so the second button is a button and not a surface. **Deliberately untouched by
phase 2**, and each for a stated reason: `jobview.ts` (there is no `jobCanDelete` rule to hold),
`components/nina/NinaJobList.tsx` and `app/nina/jobs/page.tsx` (phase 1's `actions` prop and
`maxDuration = 300` already carry it), `components/nina/NinaAboutScreen.tsx` (a read-only summary
gets no mutation), `lib/nina/imagerun.ts` (a claimed job finishes — hiding is not cancelling), and
`scripts/nina-image-worker.ts` (the backstop's own SQL claim, per the note in the R2 section above).

Plans for the set are `lib/nina/.workflows/plan/P1-NIN-A015.md` and `P1-NIN-A014.md`.

> **The one open operator step:** `npm run db:migrate` to apply `0008`. It was deliberately not run
> during the task, and the code does not work without it.
