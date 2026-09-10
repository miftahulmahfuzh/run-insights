# Package: `lib/nina`

**Location**: `lib/nina`
**Last Updated**: 2026-09-10 (task `P1-NIN-A028`, phase 1 of 2 of the `nina-burst-cancel` set — the burst cancel: a send arriving between the sweep and the open in `sendNinaMessage` calls `supersedeNinaChatTurn` in `chatturn.ts`, which closes a still-thinking claim — `status='pending' AND error_code='running'`, still fresh — as `failed`/`superseded` so `openNinaChatTurn` opens a fresh turn answering the whole burst, while `chatTurnWasSuperseded` makes the superseded invocation in `runNinaBackgroundTurn` persist nothing (no bubbles, no distillation, no auto-title, no chain) and `ninaChatTurnStore.record` splits into a conditional phase-advance arm plus a metrics-only arm, so the winner advances and the loser's token usage still lands on its row; no schema change, no prompt change, no client change; previously task `P1-RI-A031`, phase 3 of 3 of the `admin-imagegen-simplify` set — the focus-card hint purge: `NinaImageFocusSpec.userSaid` and its six literal values are deleted from `NINA_IMAGE_FOCUS_SPECS` in `imageprefs.ts`, leaving `label` — the user's own focus words — the one home for them on this record, while `NINA_FOCUS_EMPHASIS` in `imagegen.ts`, which never read the member, keeps the prompt's emphasis vocabulary; previously task `P1-RI-A029`, phase 2 of 3 of the `admin-imagegen-simplify` set — the image-prompt-revision purge: `NinaImagePrefs` loses `revision` and the defaults' `revision: 0` with it, `NinaImagePrefsWrite` collapses to an alias of `NinaImagePrefs` in `imageprefs.ts`, and `writeNinaImagePrefs` in `queries.ts` is a plain whole-row upsert with no SQL-side bump; migration `drizzle/0017_retire_imageprefs_revision.sql` is committed but **NOT applied** — applying it is the post-deploy `npm run db:migrate`; previously task `P1-RI-A025`, phase 1 of 2 of the `simplify-personality-settings` set — the prompt-revision purge: `NinaTuning.revision` and the `NinaTuningWrite` alias are gone from `tuning.ts`, `writeNinaTuning` no longer computes a bump in `queries.ts`, and every turn-path `tuningRevision` field is gone with `nina_turns.tuning_revision` — `turn.ts`, `chatturn.ts`, `gateway.ts`; `NINA_PROMPT_VERSION` alone now dates an assembler change; migration `drizzle/0016_retire_tuning_revision.sql` is committed but **NOT applied** — applying it is the post-deploy `npm run db:migrate`; previously task `P1-NIN-A025`, phase 1 of 1 of the search-jump-pinpoint set — search hits deep-link through the existing `?jump=` pinpoint; previously tasks `P1-NIN-A024`, `P1-NIN-A026`, `P1-NIN-A027` and `P1-NIN-A029`, the `nina-image-generation-tab` set — `imageprefs.ts`, the body canon and the five-rung ladder in `persona.ts` / `imagegen.ts`, `input_references` plus the anchored timeout in `imagerecipe.ts` / `imagecall.ts`, `imagetest.ts`, and the retirement of `nina_tuning.wardrobe`; previously task `P1-NIN-A023`, firing a shortcut into the turn — `shortcutHits` / `shortcutBlock` and `NinaTurnResult.firedShortcutIds` in `turn.ts`, the live read and the usage bump in `actions.ts`, `NINA_PROMPT_VERSION` 5 → 6; previously `P1-DB-A004`, the shortcut matcher and its queries — `shortcuts.ts` plus five functions in `queries.ts`, both **unwired** at the time; previously `P1-RI-A023`, the composer's geometry — `composerPadBottomCss` beside `composerBottomCss` in `chatview.ts`, and in `chrome.ts` both `COMPOSER_RESTING_PX` 68 -> 60 and `controlBottomCss`'s now-gated inset; previously `P1-NIN-A022`, resending a message she never answered — `resendNinaMessage` in `actions.ts` and `canResendMessage` in `edit.ts`; `P1-NIN-A021`, the pointer opener for the message-actions sheet — `decideMessageActionTap` in `edit.ts`; `P1-NIN-A020`, the generated-selfie caption — `finishSelfie` now writes from `args.scene`; and `P1-NIN-A019`, the caption engine)
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
- **Images** — her selfies and avatars, from prompt through GitHub-Actions worker to Blob, and the
  one line she says under a photograph of herself (`caption.ts`, written from what is actually in
  the picture rather than drawn from a canned array).
- **Chat UI logic** — the pure, node-testable decisions the chat screen makes (grouping, reveal
  timing, scroll restore, reply quotes, and the full-screen chrome's geometry — where the composer
  and the two floating controls sit, as CSS lengths), kept out of the components so they can be
  tested.
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
- **`NinaTuning`** — `{ traits, relationship, dials, enabled, notes }`, all readonly.
  `enabled` is R4's per-parameter on/off map (see below). `notes` is `string` and never null; `''`
  is the one empty value. (`wardrobe` was a seventh member until F41 R3 moved it to
  `NinaImagePrefs`; a `revision` member sat beside them until the `simplify-personality-settings`
  set purged the prompt-revision mechanism — `drizzle/0016_retire_tuning_revision.sql`.)
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

**`relationship` has a toggle; `notes` deliberately does not.** `nobody` is not an off switch —
`NINA_RELATIONSHIP_BLOCKS.nobody` is four sentences of *active* instruction and the coldest setting
on the axis, so choosing it to "exclude" the parameter makes the prompt longer and changes her
behaviour. Disabling the relationship therefore means `NINA_DEFAULT_RELATIONSHIP`, whose blocks
*are* today's `NINA_IDENTITY`. `notes` is the mirror image: `''` genuinely is its absence and
already costs zero bytes, so a toggle would be a second spelling for a state the field already has.
This sentence used to name two such fields; `wardrobe` was the other, and F41 R3 moved it to
`nina_image_prefs` rather than giving it a toggle.

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
- `ninaAppearance` — the **wardrobe seam**. Returns `NINA_APPEARANCE` when the wardrobe is empty,
  otherwise swaps the outfit paragraph while keeping the face and the home ground. The wardrobe it
  reads is `nina_image_prefs.wardrobe` since F41 R3, not `nina_tuning`'s. This never reaches the
  system prompt; `system.ts` does not import it.
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
turn is always one character. `prompt_version` identifies the assembler that rendered the turn;
`nina_turns.tuning_revision`, which used to name the settings it assembled so the pair could answer
"what was she set to when she said that", is gone — the `simplify-personality-settings` set purged
the prompt-revision mechanism and `drizzle/0016_retire_tuning_revision.sql` drops the column.

**`NINA_PROMPT_VERSION` was `4` for the whole admin-responsive-nina-intimacy set; it is `6` today.**
The `3 -> 4` bump is R2: `HOW YOU TALK` gained
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
is therefore `4` for the whole admin-responsive-nina-intimacy set, bumped once, by R2.**

**Two bumps have landed since, each the single bump of its own set.** `4 -> 5` is the
nina-instructor-character set's sixth relationship and its coaching mechanics (that set's phase 3;
see *"The Instructor character"* below). **`5 -> 6` is `P1-NIN-A023`, the shortcut block — and it is
the first bump in this package's history that moved NO SYSTEM TEXT AT ALL.** `prompts/system.ts` and
`prompts/tools.ts` were not opened, `buildNinaSystemPrompt` renders version 5's exact bytes at every
tuning, and `tests/__snapshots__/nina.prompts.test.ts.snap` was deliberately **not** regenerated
because it still passes. What changed is the **assembler**: `userTurnText` in `turn.ts` gained one
conditional block fed by two new optional `NinaTurnInput` fields. The bump is still right, and this
file's own line above says why in as many words — *`NINA_PROMPT_VERSION` identifies the ASSEMBLER,
not the output*. A turn that can be sent a two-kilobyte standing directive it could never have been
sent before is exactly the kind of behaviour change `nina_turns` has to be able to date, so those
turns must be distinguishable from version 5's. The changelog
for each version lives as a comment above the constant in `prompts/index.ts`.

## The camera is a function of the tuning

**R5.** `buildNinaImagePrompt` takes an optional `NinaTuning`; absent or at `NINA_TUNING_DEFAULTS` it
renders the prompt that shipped, byte for byte, and `tests/nina.imagerecipe.test.ts` asserts both
ends of that. A non-empty image-prefs `wardrobe` replaces the canon outfit through `persona.ts`'s
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

## The camera is a function of the PREFS now (the `nina-image-generation-tab` set)

`## The camera is a function of the tuning` above describes what shipped before this set. The
picture is now driven by a second row, `nina_image_prefs`, and the tuning no longer supplies a
wardrobe at all.

### `imageprefs.ts` — the vocabulary (phase 1)

Zero imports, by rule, exactly like `tuning.ts`: `NINA_IMAGE_PROMPT_LENGTH_MIN` / `_MAX` /
`_DEFAULT` (50, the middle rung), the six focus keys `face|skin|boobs|butt|thighs|calves` with
their `NinaImageFocusSpec { key, label }` specs, the free-text bounds,
`NINA_IMAGE_REFERENCE_SOURCES` (`'none' | 'album' | 'chat'`), `NinaImageReference { source, id }`
with `''` as the empty id, `NINA_IMAGE_PREFS_DEFAULTS`, the coercers and `NinaImagePrefs`.

**The focus spec is down to `{ key, label }`.** The `admin-imagegen-simplify` set deleted the
focus spec's `userSaid`, whose only reader was the redundant panel hint that same set removed, so
`label` — the user's own focus words, sentence-cased — is now the one home for those words on this
record. The prompt's emphasis vocabulary lives in `NINA_FOCUS_EMPHASIS` (`imagegen.ts`), keyed by
`NinaImageFocusKey`, and never read `userSaid`. The free-text `NinaImageTextSpec` keeps its own
`userSaid` — a different record, deliberately left in place.

**This module is the set's authority on spelling.** `ninaPromptLengthRungFor` takes a **band
index**, so callers also import `ninaBand` from `tuning.ts` — the band vocabulary is not copied
here, and re-deriving it elsewhere is forbidden.

`readNinaImagePrefs` / `writeNinaImagePrefs` / `listNinaPhotoReferences` /
`resolveNinaPhotoReference` live in `queries.ts`. No row means the defaults. `revision`, which at
`>= 1` was the proof an operator actually saved something, is gone — the `admin-imagegen-simplify`
set purged the image-prompt-revision mechanism and `drizzle/0017_retire_imageprefs_revision.sql`
drops the column.

**The reference union contains no duplicate photograph.** `listNinaPhotoReferences` returns
`NinaPhotoRefPage { rows, total, offset, limit }` over `nina_avatars` plus **original**
`kind='generated'` chat rows, newest first, one bounded page. The chat side goes through
`generatedChatPhotoScope`, whose `isOriginalPhoto()` conjunct excludes any row with
`source_avatar_id` or `source_image_id` set, and the count shares that scope so page and total
cannot disagree. **Inlining `eq(kind, 'generated')` re-admits every reference row and fails a
source-level test** — that is how one album face would otherwise appear twice, once as its avatar
row and again as the chat row pointing at it.

### `persona.ts` and `imagegen.ts` — the body canon and the ladder (phase 2)

`NINA_BODY_SENTENCES` / `NINA_BODY` / `NINA_BODY_AVATAR` / `ninaBodyBlock`, and `NINA_APPEARANCE`
reordered **body → face → outfit**. `NINA_FACE` lost the body clause it had been carrying, and
`Lean` / `narrow shoulders` are repealed.

**The body cannot be switched off.** It is unconditional text in the subject paragraph, not a focus
option; deselecting every focus key still yields a prompt naming all four body facts, at every rung
of the ladder. A property test proves it over the full combination space rather than by example.
"Focus on" adds emphasis clauses *on top*.

`buildNinaImagePrompt` implements a five-rung length ladder (`NINA_PROMPT_RUNGS`,
`ninaPromptRung`, `NINA_PROMPT_LENGTH_FALLBACK`) keyed off `ninaBand`, the six focus clauses, and
the `VENUE:` / `TIME:` / `NOTES:` blocks. **The face/outfit cut sits at or below rung 2**, because
50 is what an operator who never opens the tab gets and a first-run prompt that dropped the face
would be a downgrade on what shipped before.

`ninaAppearance(prefs: NinaImagePrefs, detail?)` is **nominally** typed on the prefs, so a leftover
`ninaAppearance(tuning)` is a compile error rather than a silent pass. `selfiegen.ts` and
`avatargen.ts` read both rows in one `Promise.all`, which is why `avatartools.ts`, `imagetools.ts`
and `promises.ts` needed no edits at all.

### `imagerecipe.ts` / `imagecall.ts` — the reference on the wire (phase 3)

`buildImageRequestBody` gained an optional reference and emits exactly one `input_references` entry,
`{ type: 'image_url', image_url: { url } }`, in the shape the repo has a verified 200 for. **With no
reference the payload is byte-identical to what it was** — asserted against a literal, not
re-derived.

The reference is fetched from Blob and sent as a `data:` URL; a fetch failure **degrades to an
unanchored generation with a warning, never a crash**. `NinaImageJobArgs.referenceUrl` is read only
through `ninaImageReferenceUrl`.

**An anchored call costs a different timeout, and the arithmetic is asserted for both.**
`NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS = 220_000` is selected by `ninaImageCallTimeoutMs(anchored)`,
and `NINA_IMAGE_RUN_BUDGET_MS` moved `200_000 → 240_000` so an anchored attempt fits at all. The
threshold chain holds on both paths: `45 + 150 + 20 = 215` and `45 + 220 + 20 = 285`, each within
the 300 s host ceiling. A measured anchored generation took 148.9 s against the old 150 s ceiling,
so without this the feature would have aborted about half its own work.

`imagerecipe.ts` still **imports nothing** — the worker loads it by relative path under
`--experimental-strip-types`.

### `imagetest.ts` — the admin's test generation (phase 6)

`selfiegen.ts`'s sibling: cap check first, seed, prompt assembled from the **saved** prefs,
`source: 'admin'`, the reference threaded onto phase 3's `referenceUrl`, one job row, one
`fireNinaImageGeneration`, and it returns without awaiting the picture.

It uses `purpose: 'selfie'` deliberately, so `finishSelfie` writes the message + `kind: 'generated'`
image pair exactly as a chat selfie does — which *is* the "test result lands in Chat photos"
requirement, with no second writer of the invariant that a photograph always has a message. A test
therefore puts a visible bubble in the runner's chat, and `photo_only: true` on the carrier makes it
cleanly removable with the photograph. It spends one generation off `NINA_IMAGE_DAILY_CAP` **plus a
caption call**, and the panel says so before the click.

## Module map

### Chat turn pipeline
| File | Purpose |
|---|---|
| `actions.ts` | Server Actions — `sendNinaMessage`, `describeNinaImage`, `pollNinaReply`, and (since `P1-NIN-A022`) `resendNinaMessage`. The one entry point a user message goes through. Since `P1-NIN-A023` it also reads the live shortcut table (fourth entry in the turn's `Promise.all`) and bumps the fired rows fire-and-forget. Since the `nina-burst-cancel` set's phase 1 it also attempts the cancel of a still-thinking claim between the sweep and the open, and `runNinaBackgroundTurn` discards a superseded turn's answer whole. |
| `turn.ts` *(T)* | The Anthropic tool-use loop: system prompt → tool rounds → validated `send` payload, with budgets and a repair pass. Also the **one** place shortcuts are matched (`shortcutHits`, once per turn) and rendered into the user turn (`shortcutBlock`). |
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
`describe.ts` (**two** witness prompts — the runner's and, since `P1-NIN-A019`, hers — behind
`NINA_DESCRIBE_SYSTEM_PROMPTS`), `caption.ts` (`buildNinaCaptionSystemPrompt`,
`NINA_CAPTION_TOOL`, `sanitizeNinaCaption` + `NINA_CAPTION_PROMPT_VERSION`). Pure text — no I/O —
so tests can assert prompt shape without the loop.

**Three prompt files carry their own version constant, and none of them is `NINA_PROMPT_VERSION`.**
`distill.ts`, `title.ts` and now `prompts/caption.ts` are different model calls with different
system prompts on their own schedules; hers covers the system text and the schemas in
`prompts/tools.ts` only.

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
promise?"), `nags.ts` (escalation and decay), `patterns.ts` (training-pattern detection),
`shortcuts.ts` *(T)* (the whole of "did he type a code, and which" — see below; **read on every chat
turn by `turn.ts` since `P1-NIN-A023`**).

### Proactive
`proactive.ts` — `evaluateAndEmitForUser` (the cron path) and `emitRunCommitted` (fired by
`lib/review/actions.ts` right after a run is committed).

### Images
`imagerecipe.ts` (camera settings shared with the backstop worker), `imagegen.ts` (prompt text),
`imagejobs.ts` (job row lifecycle, quota, and — since R2 — the `deleted_at` predicate on every
image-row read plus `softDeleteNinaImageJob`), `imagecall.ts` (the OpenRouter image call),
`imagerun.ts` (claim → generate → store → finish, inside `after()` — and, since `P1-NIN-A020`,
caption the selfie from the scene it was asked to draw),
`imagefail.ts` (classify a failure, pick what she says — and, since `P1-NIN-A019`, pick it from the
scene-agnostic `NINA_IMAGE_CAPTION_POOL` rather than the historical set), `caption.ts` (the
`glm-5.3` call that writes the real caption from what is in the picture), `imagetools.ts` /
`avatartools.ts` (the two tool handlers and the tool sets), `avatargen.ts`, `jobview.ts` *(T)* (the
pure tracking-screen vocabulary), `jobActions.ts` (the `'use server'` mutations `/nina/jobs`'s rows
call).

The generation runs **in-platform**, on the app's own invocation, inside `after()` — Vercel Hobby +
Fluid compute is a 300 s ceiling, measured on this deployment 2026-09-06. `.github/workflows/nina-image.yml`
and `scripts/nina-image-worker.ts` survive as the **backstop** and the manual drain, not as the
generator; `imagedispatch.ts` and its `GITHUB_DISPATCH_TOKEN` are gone with the doorbell.

### Vision and intake
`vision.ts` *(T)* (`describeNinaImages(refs, { subject })` — `'runner'` by default, `'self'` for a
photograph of hers; the token floor is unmoved and computed after the prompt is chosen),
`imageTicket.ts` *(T)* (HMAC-signed carrier so a description can cross from
`describeNinaImage` to `sendNinaMessage` untrusted), `images.ts` *(T)* (the
`nina/<userId>/chat/<id>.jpg` pathname model — the builder, the ownership check, and **both** id
windows: `NINA_CHAT_ID_RE` for what the browser asks for and `NINA_CHAT_STORED_ID_RE` for what Blob
stores; zero imports by rule, because three hosts outside the package reach for `NINA_BLOB_PREFIX`),
`crop.ts` *(T)*.

### Album and attachments
`album.ts` *(T)*, `albumActions.ts`, `attach.ts` *(T)*.

### Chat UI logic (pure, node-testable)
`chatview.ts` *(T)*, `reply.ts` *(T)*, `reveal.ts` *(T)*, `scroll.ts` *(T)*, `live.ts` *(T)*,
`edit.ts` *(T)* (the edit/delete rules for one message, all three bubble gestures —
see *"Tapping a bubble opens the actions sheet"* below — **and** `canResendMessage`, R5's
his-bubbles-only gate for the sheet's third item), `chrome.ts` *(T)*.

**Two of those own `/nina`'s geometry, and they own it as strings.** `chatview.ts` carries the
composer's own box — `keyboardOverlapPx`, then the pair `composerBottomCss` (its `bottom`) and
`composerPadBottomCss` (its `padding-bottom`), which are correct only together. `chrome.ts` carries
the full-screen chrome around it: the `NinaBarState` machine (`nextBarState`, `autoHideDelayMs`,
`barToggleGlyph`), the sizing constants `CHROME_CONTROL_PX` / `CHROME_CONTROL_GAP_PX` /
`COMPOSER_RESTING_PX`, the shared `NINA_CHROME_CONTROL_CLASS`, and `controlBottomCss` for the two
floating `<`/`^` discs. They return **CSS strings rather than numbers** because every one of them
has to add `var(--safe-bottom)` — which is `env(safe-area-inset-bottom)`, readable to CSS and to
nothing else — so the arithmetic cannot be finished in JavaScript. `chrome.ts` imports
`NINA_BAR_VISIBLE_VAR` from `chatview.ts` so the two files gate on one spelling of one variable;
see the composer section below for why that single spelling is load-bearing.

### Persistence
`queries.ts` — every Drizzle query for the `nina_*` tables, including `readNinaTuning` /
`writeNinaTuning`, and — since `P1-DB-A004` — the five `nina_shortcuts` statements
(`listNinaShortcuts`, `insertNinaShortcut`, `updateNinaShortcut`, `deleteNinaShortcut`,
`bumpNinaShortcutUses`) described below.

`tuningFromRow` / `tuningToColumns` are **the one place the flat row and the nested model meet**, and
after R4 and R3 that is **thirty-eight** snake_case columns against `traits.anger` /
`dials.photoEagerness` / `enabled.flirty` — `nina_tuning` spells **thirty-nine** in all, the
thirty-ninth being `updated_at`, which nothing maps. The toggles are **seventeen nullable `boolean`
columns** (`relationship_enabled`, then one per trait and per dial). Sixteen of them arrived with
`drizzle/0006_chubby_wild_child.sql` (journal index 6, sixteen `ADD COLUMN`); phase 5's
`drizzle/0007_graceful_mercury.sql` (journal index 7 — **`drizzle/` ended at `0008` then, whose one
statement is R2's `nina_turns.deleted_at` and which is generated but NOT yet applied; it now ends at
`0012_nina_shortcuts`**) adds the
seventeenth alongside the score column, in three statements: `ADD COLUMN "horny" integer NOT NULL
DEFAULT 0`, then `ALTER COLUMN "horny" DROP DEFAULT`, then `ADD COLUMN "horny_enabled" boolean`. The
temporary default is drizzle's own way to add a `NOT NULL` column to a populated table and it is
dropped in the next statement, so the table keeps this package's rule that **no stored value carries
a SQL default** — the defaults live in `NINA_TUNING_DEFAULTS` and nowhere else. `horny_enabled` is
nullable with no default: NULL means one
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

## The caption under a photograph of hers (P1-NIN-A019, phase 1 of 4)

**The sentence the user reported was never a model output.** He uploaded a photograph of Nina
underwater in a swimsuit and she captioned it *"ini gw abis lari tadi"* — element index 2 of a
five-string hard-coded array, chosen by an FNV-1a hash of a nanoid. The multimodal call he asked for
already existed and had already run on that photo: `describeNinaImages` posted it to `glm-4.6v` in
`after()` and wrote the answer to `nina_message_images.description`, **a column which on that path
has no reader at all**. The one text the runner reads was the only text on the path no model writes.

Phase 1 was the **engine and nothing that used it** — it landed deliberately UNWIRED, because
phases 3 (`lib/admin`, the admin add path) and 4 (`lib/nina`, generated selfies) run concurrently
and both needed the engine unit-tested first, with phase 2 (`lib/db`) the carrier marker underneath
them. **Phase 4 has since wired the selfie path** (`P1-NIN-A020`, below); the admin path is
phase 3's.

### The pick pool is not the historical set (`imagefail.ts`)

`NINA_IMAGE_CAPTIONS` **still holds all five members and must never shrink**. It is an
**identifier, not a vocabulary**: `isNinaPhotoCarrierMessage` (`lib/admin/chatPhotos.ts`) asks
whether a bubble exists only to carry a photograph, and for every row written before the marker
column existed the only available answer is *"its text is one of these"*. Database rows carry all
five sentences, so deleting a member orphans every bubble holding it.

What changed is what may be **picked**:

| Export | What it is |
|---|---|
| `NINA_IMAGE_CAPTIONS` | all five, unchanged — the historical set, read as an identifier |
| `NINA_SCENE_ASSERTING_CAPTIONS` | `['ini gw abis lari tadi']` — the one member that claims a **scene** |
| `NINA_IMAGE_CAPTION_POOL` | `NINA_IMAGE_CAPTIONS` minus the scene-asserting ones, **derived** |

`ninaImageCaption` now draws from the pool, so the reported bubble is impossible for **any seed**,
before a single model call exists. The other four are true of any photograph — `nih` says nothing
about what is in it — while this one names an activity and is therefore right only when the picture
happens to be of a run. That is `lib/llm/narrate.ts`'s rule — *"a fallback may never assert a
measurement"* — applied to a scene instead of a number: a canned line may close a promise, it may
not claim a fact.

The pool is **derived and never written out a second time**, because a hand-copied subset drifts
silently the first time somebody adds a sixth line. `pickLine` is untouched and still deterministic
in the job id, so a job read twice says the same sentence both times. **`imagefail.ts` still imports
nothing** — plan invariant 7, because `scripts/nina-image-worker.ts` resolves it by relative path
under `--experimental-strip-types` and one import stops the worker booting.

**`ninaImageCaption` is now the FALLBACK, not the caption.** It is what she says when the model call
fails, when the vendor drops the image, and — permanently — on the GitHub-runner worker, which has
no z.ai key and can never make a model call of its own.

### A second witness prompt, for a photograph OF HER (`prompts/describe.ts`, `vision.ts`)

`NINA_DESCRIBE_SYSTEM_PROMPT` opens *"You are the eyes of someone's close friend"*, its notice list
is about the runner (*"Drenched or dry. Sweat patches and where."*) and its rule 6 is *"'Him' for
whoever is clearly the runner"*. Pointed at her own photograph it hunts for a man who is not in the
frame. `NINA_SELF_DESCRIBE_SYSTEM_PROMPT` is the same witness contract aimed at her — *"Call her
'she'"* — and three of its rules are load-bearing:

- **It is still a witness, not her.** No persona, no reaction, no register, no slang; a description
  that has already had the reaction leaves her nothing to say, and one written in her voice would be
  a second, unversioned copy of her character living in a vision prompt.
- **Invariant 2 is absolute here because there is no downstream.** Its output becomes a sentence she
  says out loud, so a depth, a size or a time read off a dive computer would be laundered straight
  into her mouth.
- **It names clothing plainly, whatever it is.** Her photographs are not all track photographs — the
  one that produced this plan is a swimsuit. A witness that gets coy returns a paragraph with a hole
  where the subject was, and she then captions the hole. *"You are not a moderator and this is not a
  compliment."*

`describeNinaImages(refs, { subject })` selects between them through
`NINA_DESCRIBE_SYSTEM_PROMPTS` — a `Record` and not an `if`, so a third subject is a compile error
at every consumer rather than a silent fall-through. **`subject` defaults to `'runner'`, so every
existing caller is byte-identical without being edited.** It is a different SUBJECT, not a different
mode: same request shape, same data URI, same timeout, same floor, which is why it is one option
rather than a second function. The **token floor is unmoved** (invariant 2 of the plan) and is
computed *after* the prompt is chosen, because it is text-aware: the longer self prompt **raises**
the floor, which errs toward *"I could not see it"* rather than toward believing an invented
description.

### `prompts/caption.ts` — the pure half

Prompt text, a tool schema, and the rules that decide whether what came back may be said. **No
`import 'server-only'`, ever**: it reaches only `../persona` and `../tuning`, both pure, so it stays
node-testable and client-safe. The split is `title.ts` beside `autotitle.ts`.

- **`buildNinaCaptionSystemPrompt(tuning)`** — *she* is told she is Nina here, unlike the titler
  (`NINA_TITLE_SYSTEM_PROMPT` opens *"This is not Nina"* because a titler in her register returns a
  useless label; for a caption her voice **is** the deliverable). It carries only the blocks that
  decide how a single line *sounds*: `JAKARTA_REGISTER`, `ninaManjaRegisterBlock`,
  `JAKARTA_SLANG_BLOCK`, `VOICE_EXAMPLES_BLOCK`, `ninaGirlfriendVoiceBlock`, `ninaNeverSayBlock`,
  with `renderSections`' empty-block filter inlined. **It deliberately does NOT carry**
  `ninaIdentity`, `NINA_EXPERTISE`, `NINA_NOT_A_DOCTOR`, the anger ladder, the context guide or the
  tool list: ~3,000 tokens of prompt to produce twelve words, and — the concrete failure — an
  invitation to coach, diagnose or bring up his training under a photograph of herself.
  **`buildNinaSystemPrompt` remains the only assembler of the full character, and this file must
  never grow into a second one.** The prompt also has an explicit way to **decline**, so a
  description saying *"I cannot tell"* produces a refusal rather than a confident invention.
- **`sanitizeNinaCaption(raw)`** — clean, then strip, then refuse, in that order. Cleaning first
  because every check assumes single spaces; stripping next so a refusal is about the words and not
  a wrapping quote; and **`stripEdgeDecoration` runs to a FIXED POINT** rather than once each,
  because quotes and markdown each wrap the other (`**"nih"**` as readily as `"**nih**"`) and it
  terminates because both operations only ever remove characters. Then the refusals, most absolute
  first: no letter, **any digit**, alt-text vocabulary, over the ceiling.
- **`NINA_CAPTION_MAX_CHARS = 120`, and over it the answer is REFUSED, not truncated.** The ceiling
  is not a target — the pool's longest line is 27 characters — it is the point past which the answer
  stops being a chat message and starts being the description paraphrased, which invariant 9
  forbids. Cutting a sentence in half is how a caption becomes nonsense.
- **`NINA_CAPTION_SEEN_CHARS = 900`** clamps how much of the description the prompt may see: the
  witness asks for 60-140 words, so this is a well-behaved answer with slack, and the clamp exists
  for the badly-behaved one that would otherwise crowd out the instruction.
- **`NINA_CAPTION_PROMPT_VERSION = 1`** — its own constant, on `NINA_TITLE_PROMPT_VERSION`'s
  precedent. **Bump that, never `NINA_PROMPT_VERSION`**, which scopes the system text and the
  schemas in `prompts/tools.ts` only. The tool's property `description` is part of the prompt, so an
  edit to it bumps this version.
- **`NINA_CAPTION_TOOL`** — forced (`tool_choice: { type: 'tool' }`), one required `caption` string
  with a JSON-Schema `maxLength`, and an empty string is an answer it explicitly asks for.
- **`NinaCaptionSeenKind`** — `'described'` (a witness wrote a paragraph; the admin add path) or
  `'requested'` (the photograph was made to order and this is the scene she asked for; the selfie
  path, where no witness ran and none should — paying a vision call to be told back our own prompt
  would be absurd). It changes only the sentence that introduces the observation, and getting it
  wrong is how a prompt reads a request as prose.

**Any digit refuses the whole caption**, with no carve-out. Every number that could reach a caption
comes from a photograph — a depth on a dive computer, a pace on a watch face, a size on a label —
the app computed none of them, and the witness prompt is already forbidden from reading them out. A
digit arriving here means the vision model broke rule 1 or `glm-5.3` invented one; both are the same
defect and both are unsayable. The two layers are not redundant: **the prompt stops the number being
produced, the sanitiser stops it being said.** `\p{Nd}|\p{No}`, not `[0-9]`.

The **alt-text refusal is invariant 9's enforcement**. The description is private prose written by a
witness; the caption is her sentence. When the model returns *"foto ini menunjukkan gw sedang
menyelam"* it has handed back the description in Indonesian, and the runner reads a museum label
where a message from his friend should be. The canned pool line is a worse caption and a better
message.

### `caption.ts` — the impure half

`captionNinaPhoto(request, deps?)`: **one `glm-5.3` call, parse, or `null`** — `autotitle.ts`'s
contract, *one call → parse → silence*. `captionNinaPhotoWith(client, request, { model })` is the
testable core with the client injected, no database and no environment beyond the model id; the
injection seam is declared here rather than imported from `autotitle.ts`, on that file's own ruling
that *"six lines duplicated beats a coupling"*. The tuning is passed **in** rather than fetched, so
this module holds no store import and a wardrobe saved thirty seconds ago is in the prompt.

**It never throws, and returns `null` for every failure shape** — a thrown call, a `max_tokens`
stop, no tool block, an empty string, a line tripping a refusal. Every `null` lands in the same
place, and it is a place that already exists: the caller keeps the `ninaImageCaption` line already
on the row, which is now guaranteed scene-agnostic. Nothing is persisted on a refusal, so a later
pass could try again for free. There is **no repair round trip**: a single short line cannot be
malformed in a way worth describing back, and a refused line means the fallback is correct rather
than that the model needs another go. `findCaptionBlock` **scans** the content array rather than
reading `content[0]`, because `distill.ts` recorded a `thinking` block arriving in front of the
answer.

Budgets, both measured-derived: **`NINA_CAPTION_MAX_TOKENS = 400`** (the payload is under 40 output
tokens, so everything below the ceiling is headroom for a `thinking` block nobody asked for; output
tokens are wall clock at ~26-33 ms each, and a `max_tokens` stop is treated as *no caption*) and
**`NINA_CAPTION_TIMEOUT_MS = 12_000`** (`NINA_TITLE_TIMEOUT_MS`'s number, and what leaves the
describe call whole inside one segment). `thinking: { type: 'disabled' }` is sent and **not relied
on** — a 2026-09-03 probe recorded one arriving on this endpoint with the flag set.

### The ninth guarded symbol

`scripts/check-llm-payload-boundary.mjs` names `captionNinaPhoto` and sanctions exactly three paths:
its own module (a guard that fails on the definition site forces the definition to be renamed —
`runNinaTurn`'s precedent), `lib/admin/chatPhotoActions.ts` and `lib/nina/imagerun.ts`, the two
wiring modules phases 3 and 4 will fill in. **Nine guarded symbols; the guard exits 0.** The
arithmetic behind the entry: on the admin path the caption runs *after* a `glm-4.6v` describe in the
**same `after()`** — two model calls in one segment, ~15-25 s together — and Server Actions are
dispatched one at a time per client, so an action that awaited it would make an operator wait that
long **per photo, in series**. The caption is cosmetic and the row already carries a true canned
line, so the render never has anything to wait for.

### What this phase did not touch

**Nina's system prompt is byte-for-byte unchanged.** `tests/__snapshots__/nina.prompts.test.ts.snap`,
`prompts/index.ts` and `prompts/system.ts` are untouched and **`NINA_PROMPT_VERSION` is still `4`**.
The caption prompt sits on `describe.ts`'s side of that line — a new surface, not an amendment to
hers. No migration, no schema change, no new env var, no new dependency.

## A generated selfie captions from the scene she asked for (P1-NIN-A020, phase 4 of 4)

**Same bug as the reported one, on the other path that posts a photograph of hers.** `finishSelfie`
(`imagerun.ts`) wrote `body: ninaImageCaption(jobId)` — a hash-picked draw — under a photograph
whose content the app *already knew*. `args.scene` is the prose the `generate_image` tool was told
to draw, and six lines below the caption it is written to `nina_message_images.description`. The
truth about the picture was one field away from the caption, and the caption ignored it.

The bubble's text now comes from that same scene, through
`captionNinaPhoto({ seen: args.scene, seenKind: 'requested', tuning })`.

**No vision call, ever, and that is not an omission.** `finishSelfie`'s own docstring settles it:
*"we wrote the picture, so paying a vision call to be told back our own prompt would be absurd."*
This is why `NinaCaptionSeenKind` has a `'requested'` member at all — the caption prompt is handed a
REQUEST rather than a witness's observation, and it is told which it is holding. The one thing a
witness could add is whether the generator obeyed the prompt, and this path has no budget for a
second vision call in a segment that has already spent ~78 s generating. `tests/nina.imagerun.test.ts`
asserts the absence against the **source** of `imagerun.ts` rather than against a spy: a spy on a
module this file never imports can only ever pass, so the real guarantee is that `vision.ts` is
absent from the import graph, which is a fact about the text.

**The await is allowed here where the admin path's is not.** `runNinaImageJob` is already inside
`after()` (see `fireNinaImageGeneration`) and has already spent ~78 s on the generation and a Blob
write. Nobody is holding a response open — the runner was told "dispatched" a minute and a half ago
— so a 4-8 s text call at the end is the cheapest thing in the function, and it is sequential with
the insert because the insert consumes it.

**`ninaImageCaption(jobId)` is the fallback and is unchanged.** Still deterministic in the job id,
so a row read twice says the same thing, and since phase 1 it draws from `NINA_IMAGE_CAPTION_POOL`,
which asserts nothing about the picture. That is what makes a caption failure harmless here: `null`
leaves a *true* sentence rather than the wrong one. It is also, permanently, what
`scripts/nina-image-worker.ts` says on this same path — no z.ai key, and `imagefail.ts` may import
nothing — so the two hosts still agree whenever the model call does not land. The asymmetry stated
plainly: a selfie posted by the server gets a caption about its scene, the rare one posted by the
worker gets a scene-agnostic canned line, and both are true sentences about the photograph.

**One read is wrapped, and only one.** `readNinaTuning` is a bare `db.select()` and exists in
`finishSelfie` solely to dress the caption, so a connection fault there is a *caption* problem and
degrades to `NINA_TUNING_DEFAULTS` rather than costing the photograph. The three reads above it
(`getNinaMessagesByIds`, `resolveNinaWriteSession`, `insertNinaMessages`) stay bare deliberately:
without a session or a quote target there is no correct row to write, and failing is the honest
outcome. `finishSelfie`'s throw contract is unchanged — it still throws for exactly one thing,
`insertNinaMessages` returning `[]`, and never for a caption problem.

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

`lib/nina/chatturn.ts` owns the claim's lifecycle — open, read, cancel, record, close, sweep.
`sweepStaleNinaChatTurns` closes a turn whose process died as `failed`/`stale`; it **never retries and
never writes an apology bubble**, because app-authored prose in Nina's mouth is forbidden (invariant
7). The retry is the runner's to ask for, and since `P1-NIN-A022` he has a way to ask that does not
retype his sentence — see *"Resending a message she never answered"* below. A turn whose session was deleted mid-flight abandons and closes as `'session-gone'` rather than
re-creating the orphaned memory rows the session purge just removed — that guard is the other half of
R8, and it lives here rather than in the purge because backgrounding the distillation is what
stretched the orphan window from milliseconds to as much as 240 s.

One race is accepted permanently rather than closed: `openNinaChatTurn` reads then writes, and Next
serialises Server Actions per client, so only two *different* clients within ~50 ms can collide. The
cost of a collision is one duplicate reply — both replies real, nothing fabricated, the conversation
still coherent — which is cheaper than the unique index it would take to prevent, and that index
would have been this set's only migration.

### The burst cancels the thinking turn (`P1-NIN-A028`, phase 1 of 2 of the `nina-burst-cancel` set)

A send arriving while the conversation's claim is still THINKING used to fall to the chain: the
open refused, `turnId` came back null, and the running turn answered the whole burst in one late
reply. The send path now interposes a **cancel** — `supersedeNinaChatTurn(userId, sessionId)`, STEP
1c-i in `sendNinaMessage`, placed after every refusal and after his row is committed (a cancel is a
write on somebody else's turn and must never be spent on a send that then refuses), between the
sweep and the open that needs the claim gone. It closes a claim that is `status='pending' AND
error_code='running'` and still fresh as `status='failed'` + `error_code='superseded'`
(`CHAT_TURN_REASON_SUPERSEDED` — a free-text reason on the same column the phases use; the jobs
pages never render it, because they read `kind='image'` rows only) — and the open below it then
succeeds where it would have refused: one fresh turn whose context already contains every message
of the burst, answered together.

**The cancellable window has an exact database meaning, and the function is its only authority.**
A `'persisting'` claim — the model answered, her rows are going in — is never cancelled; the
message falls back to the chain. An expired `'running'` claim is a turn PRESUMED dead, not
cancelled: its invocation may still be alive, its metrics belong on its row, an expired claim never
blocked an open, and the sweep closes it `'stale'` in its own time. The race against the turn's own
phase advance is decided inside the supersede UPDATE's own WHERE — `status`, `error_code` and the
freshness bound re-asserted there, Postgres row locking picking exactly one winner — so a lost race
is a false answer, not a corruption: it means she reached `'persisting'` between the read and the
write, which is precisely the state the chain must answer. The function never throws for a database
problem on purpose, and `sendNinaMessage` wraps it anyway: a failed cancel degrades to exactly
today's behavior, which is always safe — his message is persisted and the running turn chains onto
it.

**The superseded turn's invocation discovers it lost, and discards the answer whole.**
`chatTurnWasSuperseded(userId, turnId)` runs exactly once per turn, right after `runNinaTurn`
returns — the moment the answer exists and the cost is already spent — and answers true for EXACTLY
`failed`+`superseded`, never `'stale'`, `'crashed'`, `'ok'` or a missing row: a claim the sweep
closed `'stale'` under a turn that turned out to be alive still writes her rows, because the poll
delivers through the message predicate and the only cost is a ledger row closed before its answer
landed. A read that throws answers false too — "no supersede was PROVEN" — because one database
hiccup must not cost a whole 45-second answer; a duplicate answer is the same accepted blast radius
as `openNinaChatTurn`'s race, a lost reply is not. On true, `runNinaBackgroundTurn` exits before
the session-exists check: no bubbles, no close, no distillation, no auto-title and — a `return`
from inside the `try` falling out through the `finally` — no chain. The shortcut bump stays ABOVE
the exit, because the trigger was in his message and the payload was billed for it; `closed = true`
spares the `finally`'s idempotent close, and `failure` stays `undefined` because `'crashed'` would
be a lie.

**`ninaChatTurnStore.record` is two conditional arms, because the cancel and the phase advance race
for the same row.** Arm 1 — the advance to `'persisting'` — carries `status='pending'` in its own
WHERE and `.returning`s what it advanced, so a lost race is SEEN rather than assumed; an
unconditional UPDATE would overwrite a freshly written `superseded` reason with a phase value and
leave a closed row claiming to be mid-persist, a lie nothing downstream could read past. Arm 2 —
what the loss earns — writes the METRICS and only the metrics, its SET naming neither `status` nor
`error_code`, so a closer's reason is physically impossible to overwrite from this statement; its
WHERE is `status='failed'` rather than `error_code='superseded'` on purpose, so a `'stale'` turn
that outlived its claim and turned out to be alive still lands its usage. The money ledger stays
honest on either arm: a superseded turn's token usage still lands on the row it belongs to, and the
`superseded` reason is the only record that its answer ever existed.

**Two paths deliberately do not cancel.** `resendNinaMessage` is a recovery tool for dead turns,
not a cancel — it never calls `supersedeNinaChatTurn`, whatever the live claim's phase, and
`tests/nina.resend.test.ts` pins that against the real `actions.ts`. And there is no client change:
`ChatScreen` already allows fast re-sends and keeps polling while a claim is pending, and it
branches on none of this — the cancel-and-restart is invisible to it by design.

## Image-job tracking (`lib/nina/jobview.ts`, R1)

Every `nina_turns` row with `kind='image'` is visible at `/nina/jobs`, and one job at
`/nina/jobs/[id]` with the exact prompt as sent, the seed, the model, the attempt count, and
`cost_micro_usd` as a per-job total ("Biaya total").

`jobview.ts` is the **pure half** — the stage and error vocabulary, the elapsed and money formatting,
the `?jump=` grammar, `planJobJump`'s four outcomes, (since the job-redo set) the redo rule
`jobCanRedo` and the `NinaJobRefusal` vocabulary, and (since the search-jump set) `nextSoftNavJump`,
the one-shot rule for a `?jump=` that arrives without a remount. It holds no value import from any
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

**Since the search-jump set: two builders of that URL, two arrivals, one landing.**
`searchHitHref` (`search.ts`) delegates its message arm to `ninaJumpHref` — a sidebar search tap and
`/nina/jobs/[id]`'s "Buka chat-nya" button produce byte-identical hrefs, and a test pins the
equality, because two spellings of one grammar is how one landing breaks while the other keeps
working. In `ChatScreen` one `landOn` callback (extracted beside `measureQuoteScroll`, same
precedent) serves both arrivals: the **mount** — a cross-session search hit or the job-page button,
delivered through `jumpRef`, one-shot by construction — and a **same-session soft navigation**, where
`app/nina/page.tsx`'s session key does not change, nothing remounts, and a watcher on
`searchParams.get(JOB_JUMP_PARAM)` must notice the NEW value without firing on the mount value.
`nextSoftNavJump(prev, raw)` is that rule as a pure function; the watcher's ref is initialised to
the first render's raw value, so a deep-linked mount answers "already seen" and never double-lands
beside the `jumpRef` path. Both arrivals strip `jump` from the entry BY NAME, so `?s=` and `?at=`
survive — and the strip is what makes a repeat tap of the same hit GENUINE: the `null` render it
produces re-arms the guard. A hit whose message is older than `CHAT_HISTORY_LIMIT` degrades to the
`'quote-missing'` notice rather than the pre-search behaviour of a `?at=` mark silently failing to
restore.

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
column reads NULL and is therefore visible, which is the
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

## Tapping a bubble opens the actions sheet (R4, `P1-NIN-A021`)

`edit.ts` is the pure rule module behind editing and deleting one message: the two caps
(`EDIT_MAX_CHARS_MINE` 4000 for his, `EDIT_MAX_CHARS_HERS` 700 for hers, picked by `editCapFor`),
`canActOnMessage`, `planMessageEdit`, `describeMessageDeletion`, and the two optimistic reducers
`applyMessageEdit` / `applyMessageDeletion`. All of that shipped in `75a9c34`. **What never shipped
was a way to ask for it with a pointer**: the only openers of `MessageActionsSheet` were a left
swipe on touch (`decideMessageActionSwipe`) and an `sr-only focus:not-sr-only` button, so a mouse
user had no opener at all — while the requirement is *"user can click any bubble (his or nina's)
and choose: edit, delete"*. This phase adds the tap and **changes neither swipe by a pixel**
(set invariant 6).

### The decision is pure; the component only measures

```ts
const MESSAGE_ACTION_TAP_SLOP_PX = 10
const BUBBLE_BODY_SELECTOR = '[data-nina-bubble-body]'
const BUBBLE_INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,summary,[role="button"],…'
type ActionableMessage = Pick<EditTarget, 'id' | 'confirmed'>
function decideMessageActionTap(
  target: ActionableMessage,
  gesture: MessageActionTapGesture,
): MessageActionTapDecision   // 'actions' | 'none'
```

`MessageActionTapGesture` has seven fields and **no DOM types**: `dx`, `dy`, `touches`, `zoomScale`
measured exactly as the swipe measures them, plus three booleans the component collapses —
`startedOnBody`, `startedOnInteractive`, `textSelected`. Answering those three needs an `Element`
and a `Selection`, which this module may not name, so they arrive pre-collapsed on
`EditTarget.hasImage`'s precedent. There is **no timer anywhere in it**, which is the other half of
why this is a tap and not the long press `MessageBubble`'s header rejected.

The seven rules, in the order they matter: it started on the bubble's own prose; not on a control
inside it; no selection at either end of the interaction; `canActOnMessage` (**reused, not
restated**); one finger, counted as the maximum seen; not on a zoomed page; and no travel past the
slop in either axis. **Rule 4's refusal is silent, and that is the one place a tap and a swipe
deliberately differ** — a rejected *swipe* still answers with the `edit-unavailable` notice, because
a swipe is deliberate and a gesture that does nothing reads as a broken screen; a *tap* on the
bubble he sent one second ago is a thumb still resting where the send target was, and a notice for
it would be noise on the happy path.

`canActOnMessage` was **widened** from `EditTarget` to `ActionableMessage`, and nothing else about
it moved: a full `EditTarget` satisfies the narrow shape structurally, so its existing caller
compiles untouched while a bubble can pass the two fields it actually holds.

### The three gesture windows are disjoint by construction

| Gesture | Window on a finished drag | Owner |
|---|---|---|
| reply swipe | `dx` past **+44** (`REPLY_SWIPE_MIN_DISTANCE`) | `reply.ts` |
| actions swipe | `dx` past **−44**, same constant imported | `decideMessageActionSwipe` |
| actions tap | `abs(dx) <= 10` **and** `abs(dy) <= 10` | `decideMessageActionTap` |

The 34 px between the tap slop and either swipe threshold is a **dead band on purpose**: a drag long
enough to be ambiguous is neither gesture and does nothing at all, because the gesture that guesses
on an ambiguous input is the one that opens a delete confirmation nobody asked for. 10 is the
platforms' own answer rather than a guess — Android's `ViewConfiguration` touch slop is 8dp and
UIKit allows roughly 10pt — and `dx` is read as a **magnitude**, since a tap has no direction.
`edit.test.ts` pins the inequality *and* asserts both directions of the disjointness (every drag the
actions swipe accepts, the tap refuses, and the converse), which is how invariant 6 is enforced
mechanically rather than by promise. That file carried **64 cases, 20 of them this phase's**,
including two that assert the two selectors against what `MessageBubble` actually renders; R5 took it
to **69** with `canResendMessage`'s five.

### `MessageBubble.tsx` answers its own header rather than overruling it

That file's header rejects a tap **twice**, on the grounds that it would make the bubble itself a
button and break text selection. The objection is *answered* in three places at once, and the header
now records the answers: nothing becomes a `<button>` (a bubble **contains** buttons and cannot be
one), no `role`, no `tabIndex`, no `aria-*`, no `cursor-pointer`, no `select-none` and no
`preventDefault()` are added, and `textSelected` gives the platform's own selection gesture right of
way — a long press leaves a selection and a selection refuses the tap, so the long press needs no
rule of its own. The `sr-only focus:not-sr-only` button is still the AT opener, unmoved.

**Two input paths that cannot double-fire.** Touch is decided last in `onTouchEnd`, after the reply
check and the actions-swipe check, from three booleans recorded at `touchstart`. The mouse is
decided in `onPointerUp` on the bubble's own `<div>`, **filtered to `event.pointerType === 'mouse'`**
— `'pen'` is routed down the touch path on purpose, because iPadOS dispatches Apple Pencil as touch
events too. There is deliberately **no `onClick`** on the body, which is what makes mobile Safari's
synthetic post-`touchend` click a non-event: it has nothing to hit. Two module helpers
(`hasTextSelection`, `closestMatches`) do the measuring, a `press` ref holds the pointer path's
start, and `onPointerLeave` clears it.

**The only markup added anywhere is `data-nina-bubble-body=""`** on the bubble's inner `<div>`. The
`<li>` is a full-width flex row and the blank paper beside a bubble is not the bubble — but the
`<li>` could not simply be narrowed, because that would move the reply gesture's hit area. So the
row keeps every pixel it has (invariant 6) and the touch path asks `closest(BUBBLE_BODY_SELECTOR)`
instead. A **swipe** on the empty paper still opens the sheet exactly as it does today; only the tap
is restricted to the prose.

`components/nina/ChatScreen.tsx` needed **zero lines**: the sheet, its state and the
`edit-unavailable` notice were all already there.

## Resending a message she never answered (R5, `P1-NIN-A022`)

> *"sometimes, user chat message is left unanswered. add option to resend as well (just for user's
> bubble)"*

A background turn can die silently — the invocation is killed, the segment's ceiling cuts it off —
and `sweepStaleNinaChatTurns` closes the claim ninety seconds later. What is left is a **persisted
runner row with no answer**, and until this phase the only way to ask again was to retype the
sentence, which writes a second copy of it into the 40-row window `getNinaMessageWindow` hands her
as context on every later turn.

### `resendNinaMessage` is `sendNinaMessage` from STEP 1c onward, and nothing above it

```ts
export async function resendNinaMessage(input: { messageId: string }): Promise<ResendNinaMessageResult>
```

Every step above STEP 1c on the send path exists to turn an untrusted request into a persisted row —
validation, ticket verification, the reply target, the run, the session, the INSERT — and all of it
has already happened for this message. So the action re-derives the turn's *input* from the row
instead of from a request: `requireUserId` and `isValidId` first, one owner-scoped
`getNinaMessagesByIds` read, `sweepStaleNinaChatTurns`, `openNinaChatTurn` against the **same**
`runner_message_id` at `depth: 0`, then `startNinaBackgroundTurn` with a `NinaBackgroundTurnInput`
spelled out field by field from the row — his text, his photos' descriptions, his quote, his
attached run, `startedAtMs: Date.now()`.

**`startNinaBackgroundTurn` stayed module-private.** Nothing was exported from `actions.ts` to make
this work; the new action ships in the same module and reaches the helper directly, which is also
what keeps the budget pairing inherited rather than re-argued — a Server Action's timeout is the
invoking segment's, and `app/nina/page.tsx` carries `export const maxDuration = 300`.

### Invariant 7: there is no `insertNinaMessages` here

Not a conditional one, not a nearly-empty one. A second copy of his sentence on screen — and in the
window she reads — is a failed feature and the one failure the runner notices immediately.
`tests/nina.resend.test.ts` asserts both insert functions are never called — with `actions.ts` itself
the real module and only the edges mocked, and **before** the deferred turn is drained, because her
bubbles are the background turn's legitimate write and invariant 7 is about *this action's* body.

**No model call is added** (invariant 5): the descriptions this hands her were paid for once, by
`describeNinaImage` on the composer's upload path or by `describeNinaImages` in `after()`, so
`scripts/check-llm-payload-boundary.mjs` gains no entry and stays at nine guarded symbols. **No
DDL** (invariant 8) — phase 1 owns this set's one migration.

### Five refusals, and why `turn-live` is one of them

| `NinaResendRefusal` | When |
|---|---|
| `not-found` | malformed id, not his, or gone — "not his" and "not there" are one answer (invariant 4) |
| `not-mine` | the row is one of HERS; the sheet never offers it, and a control is not a guard |
| `empty` | no text, no photo, no run left to answer |
| `turn-live` | `openNinaChatTurn` returned `null` — a turn already owns this conversation |
| `failed` | the claim could not be opened; the row is untouched and one more tap is the recovery |

**`turn-live` is where a resend and a send part company.** On the send path a burst while she is
thinking no longer reaches this refusal at all — the burst cancel (see *"The burst cancels the
thinking turn"* above) supersedes the claim and opens fresh — so the null `turnId` left there is the
chain case, and reporting it would mark a perfectly persisted message as failed. Here there is
nothing new to persist, so a null is the *only* thing that happened, and saying so is the
difference between a runner who waits and one who taps again. A resend is a recovery tool, not a
cancel: it never calls `supersedeNinaChatTurn`, whatever the live claim's phase, and
`tests/nina.resend.test.ts` pins that.

`empty` is reachable and not by any client bug: `removeChatPhotoAction` deletes only the image row
when `isNinaPhotoCarrierMessage` is false, and that predicate is false for every runner row — so an
operator removing the photo from a caption-less message of his leaves exactly that state. It is also
the one case `canResendMessage` cannot see, because `EditTarget.hasImage` is computed off the URLs
the bubble holds. One clause per authority.

### The cursor is the NEWEST persisted `seq`, never the resent row's own

`listNinaMessagesAfter`'s predicate is `seq > afterSeq` and `pollNinaReply` returns her rows from
that set, so a cursor pointing at the resent message would re-deliver — and `planReveal` would
re-stagger — every bubble of hers already sitting between it and the client's real position. The
newest `seq` is `>=` everything the client can hold, and her answer to this resend is inserted
strictly above it.

It is read **after** the claim is open on purpose: from there to the end of the function nothing
writes to `nina_messages`, because `startNinaBackgroundTurn` only registers the turn and `after()`
does not run until the response has gone out. A failed read degrades to the resent row's own `seq`
rather than refusing, and `ChatScreen` applies the value as `Math.max(cursorRef.current, cursor)` —
which covers both that degradation and a poll landing between the server's read and the assignment,
since `awaiting` can be true while a resend is accepted.

### `imageDescriptions` is rebuilt from the row, not left `[]`

`runNinaBackgroundTurn`'s own chain passes `imageDescriptions: []` and argues the photographs reach
her through `loadNinaContext`. **They do not** — `lib/nina/gateway.ts:164` hardcodes
`imageDescriptions: []` for every window row — so `[]` here would re-answer a photo message as if
the photo were not there. This path therefore reads
`getNinaMessageImagesForMessages` (ordered by `sort_order`, the order the bubble renders them) and
substitutes `NINA_DESCRIPTION_UNAVAILABLE` for a null description, exactly as the send path does:
text, never an image part. The underlying gateway gap is real, is recorded here, and is out of scope
for this set — closing it changes what she knows in *every* conversation.

### `canResendMessage`, and the clause it deliberately does not have

```ts
export function canResendMessage(target: EditTarget): boolean   // canActOnMessage(target) && target.mine
```

Appended at the **foot** of `edit.ts`, below phase 3's `── the tap ──` section rather than beside
`canActOnMessage` where it reads better: R4's phase was rewriting that function's signature line in
the same round, and two phases editing adjacent lines of one file is a merge conflict for no gain.
`EditTarget` is still the parameter type, because this predicate reads `.mine`, which
`ActionableMessage` does not carry.

**There is no "was this answered" clause.** A client-side answered/unanswered test would be a second
authority on turn state beside `nina_turns`, which `openNinaChatTurn` already owns. Resend is
offered on every confirmed bubble of his, and the action refuses with `turn-live` when a claim is
live — refusing at the action is honest; hiding the item on a guess is not.

### The refusal is rendered in the sheet, never as a `Notice`

`MessageActionsSheet` gains a **required** `onResend: (id: string) => Promise<string | null>` —
`null` means the turn was claimed and is the cue to close, a string is the sentence to render inside
the sheet. It is required rather than optional because an optional callback defaulting to a no-op is
how a menu item comes to do nothing at all.

A string rather than the boolean its two siblings use, because a resend has a refusal that is not a
failure. And it lands in the sheet rather than in `ChatScreen`'s notice strip because that strip
renders **behind** the sheet: a notice raised from a sheet interaction is a sentence delivered to
nobody until the sheet closes. The copy still lives in `ChatScreen` (`RESEND_REFUSAL_TEXT`, beside
`NOTICE_TEXT`), so the sheet imports no Server Action and never learns the refusal vocabulary — the
same boundary `onSubmitEdit` and `onConfirmDelete` keep. The sheet's existing `pending` flag is
shared, so an edit, a delete and a resend cannot overlap.

`ChatScreen`'s `handleResendMessage` produces **the same awaiting state a send produces** — clear
the notice, raise the cursor, `setAwaiting(true)` — and nothing else: no new poll, no timer, no
second rhythm. `liveSessionId` is deliberately not adopted from the result, because the message being
resent is already in the conversation this screen is polling; a resend cannot create a session the
way a first send can.

## The composer paints to the bottom edge (`P1-RI-A023`, phase 1 of 2)

Three changes to the same bar, all of them geometry or paint, none of them touching a turn, a prompt
or a query. `/nina`'s resting state is a **hidden** tab bar, and all three defects lived in that
state — which is why they survived: the showing state was the one being reasoned about.

### R1 — the unpainted strip, and the two gates that close it

The reported bug was *"ada gap diantara chat query field dengan bagian bawah"* — a gap between the
composer and the **bottom of the screen**, not the tab-bar seam that an earlier fix had already
closed. The cause was one term on the wrong side of a multiplication. `composerBottomCss` used to
emit `calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))`: the bar clearance was gated on
the flag and the home-indicator inset was **not**, on the reasoning that "the inset is the phone's,
not the bar's, and it is there whether or not the bar is". That is true of the phone and false of
this element's offset. With the flag at 0 the offset collapsed to one inset, so the bar's bottom
edge floated an inset above the viewport and the conversation showed through the strip underneath.

The fix moves the inset **inside** the gate and gives the element a second, complementary term of
its own — `composerPadBottomCss`, a new export beside the first, wired through `ChatScreen.tsx` as
the required `padBottomCss` prop on `Composer`:

| bar state | flag | `bottom` | `padding-bottom` | where the inset is counted |
|---|---|---|---|---|
| hidden (resting, and SSR) | 0 | collapses to `0` | the resting floor (R4 below) | once, as the element's own padding |
| showing | 1 | `59px + safe-bottom` | `0` | once, in the offset |
| keyboard up | — | `<overlap>px` | `0` | not at all — the indicator is behind the keyboard |

`1 - var(--nina-bar-visible, 0)` is the complement of the gate the offset uses, so the inset is
contributed by **exactly one** of the two terms in every state. That was the invariant the old
comment was defending; it simply did not cover the state this screen rests in.

**`composerPadBottomCss` takes the overlap, not just the flag**, and that is not redundancy.
Engaging the composer *hides* the bar (`nextBarState`'s `'composer-engaged'`), so the flag is 0 with
the keyboard up and a flag-only rule would pad by the inset there — lifting the textarea a thumb's
width off the keyboard's top edge, the same class of mistake as the unpainted strip, one state over.
The overlap is the only signal that separates "resting with no bar" from "keyboard up with no bar".

`calc((59px + var(--safe-bottom)) * var(--nina-bar-visible, 0))` is valid CSS: a sum of lengths
times a plain number is a length. The multiplier form is kept for the reason it was chosen — it
holds the number 59 in the function the caller already passes it to, so the flag says one thing only
(*is the bar on screen*) and cannot disagree with `TAB_BAR_OUTER_HEIGHT_PX` about how tall the bar
is.

### R2 — 8 px shorter, across four hand-copied sites

The repo owner asked for the query field to be *"lebih kecil jadi lebih makan lesser space"*.
Vertical padding was the **only** reclaimable dimension: the textarea's `min-h-11` and every round
control in that bar are the 44 px iOS tap floor, and the 16 px font is forced by `app/globals.css`
because Safari zooms the viewport on focus below it. So `py-3` -> `py-2` and the resting height goes
68 -> 60 — the same trade `CHROME_CONTROL_PX` made when the same voice asked for the floating
controls to be "much smaller".

That number is written in **four places, and a change to any one of them changes all four**:

| Site | Form |
|---|---|
| `components/nina/Composer.tsx` | the markup — `px-5 py-2` over a `min-h-11` textarea |
| `lib/nina/chrome.ts` | `COMPOSER_RESTING_PX = 60` |
| `components/nina/ChatScreen.tsx` | `COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 60` |
| `components/ui/AppShell.tsx` | `BOTTOM_GAP.chat` = `pb-[calc(7rem+var(--safe-bottom))]` (60 + 8 + 32 + 12 = 112) |

They are hand-copied rather than imported because Tailwind cannot read a constant, and because
`ChatScreen.tsx` would otherwise pull the chrome state machine into its module graph for one number.
A stale literal in the shell is the dangerous one: it reads as *a gap under the conversation* rather
than as a bug, and has now survived review twice — once when the floating control went 44 -> 32 and
once here.

**`COMPOSER_RESTING_PX` is the content box and carries no inset.** The element's *measured* height
is 60 while the bar is showing and 60 + the resting floor (R4 below) while it is hidden, and the
constant is neither of those, because the floor is a `calc()` over `env(safe-area-inset-bottom)`
and no TypeScript number can stand for one. That distinction is the whole of the fallback argument
below.

### R3 — the floating controls' glass, verbatim

Asked for in those words: *"bikin backgroundnya frosted glass, persis kaya small buttons < and up"*.
The bar now wears `bg-card/40 backdrop-blur-md backdrop-saturate-150`, which is
`NINA_CHROME_CONTROL_CLASS`'s fill, blur and saturation exactly, in place of `bg-paper/90
backdrop-blur-md`. At 90 % opacity the blur was decorative — almost nothing showed through it — and
`backdrop-saturate-150` is what keeps the conversation's colour from going grey behind the glass,
which is the difference between frosted and merely dim.

**A hairline and not a ring**, which is the one place this departs from the discs on purpose:
`border-t border-rule/50` rather than `ring-1 ring-rule/50`. The controls are free-floating and need
an edge on all sides; this bar spans the viewport and has exactly **one** exposed edge, so a ring
would draw a hairline down both screen edges and across the bottom where there is nothing on the
other side of it. The `/50` weight carries over so the pair still reads as one system —
`border-rule` at full weight, what this had, reads as chrome rather than as glass.

### `controlBottomCss` gates its inset too — except in the fallback, deliberately

Because the inset is now *inside* the element `controlBottomCss` measures, adding it again there
would count the phone's inset twice and float the two discs one inset too high. So its inset term is
multiplied by the same `NINA_BAR_VISIBLE_VAR` — contributing when the bar is showing (where the
composer's padding is 0 and the inset rides in its offset) and nothing when the bar is hidden (where
the measurement already carries it). Same variable, same file-crossing import, so the two cannot
drift apart.

**The unmeasured branch stays ungated, and that asymmetry must not be "simplified" away.**
`ChatChrome` seeds `composerHeightPx` at `0` and measures in a passive effect, so the fallback is
what renders in the **server's HTML and on the first client paint of every conversation** — not a
hypothetical frame. There is no measurement to carry the floor there, and `COMPOSER_RESTING_PX` is
the content box, so the fallback has to supply it itself — and since R4 it supplies
`composerPadBottomCss(0)` verbatim rather than a bare `var(--safe-bottom)`, so the branch tracks
the floor's formula instead of holding a second spelling of a number this package already owns.
Gate that branch and the lane is emitted at 68 px while the composer's real top edge is at 60 px +
floor, which puts both floating discs **behind** the composer's `z-40` glass for that first paint.
The two branches emit the same length and a different inset term, on purpose; `chrome.test.ts`
asserts they differ so nobody folds them into one.

### R4 — the resting floor at 30% (+1 px), and the tab bar's captions at 50%

The repo owner looked at an XS Max and asked for two gaps to be "just 30% of the original": the
gap under the **chat query field's bottom line** (`py-2` + the whole inset = 42 px), and — on the
main tab bar, the same complaint one screen over — the height of the **captions' bottom line**
above the glass. Two numbers, two owners:

- `composerPadBottomCss` carries `max(0px, inset * 0.3 - 4.6px)` — 30% of the old gap minus the
  8 px of `py-2` the bar keeps (the top of the bar and the keyboard state share that padding),
  plus one pixel: 13.6 px under the field on an XS Max. The first cut landed at 12.6 px and the
  owner, looking at the phone, asked to raise it "sedikit (mungkin 1px)" — too tight against the
  glass. The `max()` floor keeps R1's own rule intact: the padding cannot go negative, the
  painted box still reaches the viewport's bottom edge, and glass without an inset keeps the bare
  8 px it always had — the reported gap never existed there, and the raise lives inside the
  reduction, not on top of the 8.
- `TAB_BAR_CONTENT_DROP_CSS` (in `components/ui/TabBar.tsx`) is `0 calc(min(inset, inset / 2 +
  4.75px))` — see below for how it got there.

**The tab bar's 30 % attempt never rendered vertically, and the follow-up found it.** `translate`'s
single-value form is the **X axis**, so both of the drop's spellings — the `/ 2` equalisation,
then `* 1.6` for the 30 % ask — moved the five stacks sideways: 10.5 px, then 33.6 px of
rightward drift, which the owner reported as *"bergeser ke kanan"* with a request to take the
change back. The vertical arithmetic those docstrings derived was real and never rendered. The
follow-up ask was a **50 % reduction**: a centred caption's bottom line sits `inset + 9.5` px
above the glass (43.5 px on an XS Max), half of that is 21.75, so the drop is `inset / 2 +
4.75 px` — half the inset plus half the overhang — now spelled on the Y axis explicitly, with X
pinned to `0` so the stacks stay at their cells' centres. The `min()` keeps inset-less glass at a
0 drop (no gap to halve, and the translated tap target never leaves the nav's border box). The
home-indicator geometry constant (`HOME_INDICATOR_TOP_PX`, 13 px) is deleted with the
`(inset - 13px)` formula it served — nothing measures to the pill any more.

One consumer needed the floor's *formula* rather than its old value — the fallback branch covered
above — and one consumer deliberately did not: `BOTTOM_GAP.chat` keeps its full
`var(--safe-bottom)` reservation, because the difference is breathing room under the last bubble
and the ask was about the gap under the field, not the conversation's tail.

### R5 — the compact bar: the grid is the stack, and one floor for both bars

The owner's follow-up, on the XS Max: the captions' distance was right, but the bar above them
was too tall — "check the previous commit's gap between the icons and the top line, and lower the
top line to match". That gap was 9.5 px (a centred 39 px stack in the 58 px grid, (58 - 39) / 2;
10.5 to the line with the border). Holding it AND the captions' 21.75 px pins the grid at
36.25 px — shorter than the 39 px stack itself — which paints glyph above the bar's top border on
inset-less glass, the FAB's defect in miniature. So the grid became the stack itself:

- `TAB_BAR_HEIGHT_PX` 58 -> 39, `TAB_BAR_OUTER_HEIGHT_PX` 59 -> 40. Every clearance that names
  the outer height — the composer's `bottom`, the chrome lane's `BAR_CLEARANCE_PX`,
  `ChatScreen`'s `COMPOSER_CLEARANCE_PX` — follows by import; the spellings that hardcode the
  number (`chatview.test.ts`, `chrome.test.ts`, `tabbar.geometry.test.ts`, `Composer.tsx`'s
  docstring) moved with it. `BOTTOM_GAP.tabs` keeps its 6rem deliberately (its comment's rule:
  four screens nobody complained about), and `PhotoViewer`'s 3.25rem never counted the bar — its
  arithmetic is the pager band's.
- `TAB_BAR_CONTENT_DROP_CSS` becomes `0 calc(max(0px, inset / 2 - 4.75px))`: with the grid equal
  to the stack the caption starts `inset` px up, and the same 21.75 px target is expressed as a
  drop from the stack's own flush seat. The `min()` clamp R4 carried is deleted — the translated
  tap target's bottom lands `inset / 2 + 4.75` px up, above the glass at every inset. The icons
  end with 12.25 px of air (13.25 to the line) instead of the old 9.5 (10.5): the 2.75 px is the
  price of the stack never painting outside the bar.
- `composerPadBottomCss` becomes `max(0px, inset / 2 - 3.25px)` — the captions' floor verbatim,
  which is what the owner asked: *"use the same value of the distance that no 1 use, karena saat
  ini jarak antara icons' text ke xsmax bottom screen sudah tepat"*. 21.75 px under the field on
  an XS Max (13.6 before); the keyboard and bar-shown states still carry nothing, and inset-less
  glass keeps its bare 8 px of `py-2`.
## Shortcuts — one code stands for a directive he wrote once (F36, `P1-DB-A004` + `P1-NIN-A023`, phases 1-2 of 4)

He types `🍑` and means four sentences he wrote months ago. Phase 1 shipped the **table, the matcher
and the queries, and wired none of them** — no route, no component, no prompt change. **Phase 2
(`P1-NIN-A023`) is the wiring**: a trigger in his message now carries that shortcut's whole
expansion into the user turn as an explicit directive, immediately above `HE JUST SAID:` — see
*"Phase 2 — the turn fires it"* at the end of this section. Phase
3 is the admin registry, phase 4 lifts the existing codes out of the memory ledger. The table itself
is `nina_shortcuts`; `lib/db/.workflows/package_readme.md` carries its columns, its two indexes and
why it is a table rather than more `nina_memory_facts` rows.

### `shortcuts.ts` is zero-import, and that is a load-bearing invariant

**No value import, no type import, no `server-only`, nothing from `@/lib/db/*`.** It is
`tuning.ts`'s and `images.ts`'s rule, and here it pays for **two** consumers rather than one:

- phase 3's `'use client'` table needs `NINA_TRIGGER_MAX`, `NINA_SHORTCUT_LABEL_MAX` and
  `NINA_SHORTCUT_EXPANSION_MAX` in the browser to size and cap its inputs;
- phase 4's `scripts/nina-shortcuts-import.mjs` **imports this module directly** under
  `--experimental-strip-types`, so the importer's `match_key` is computed by literally the same
  function the matcher compares against — no second implementation for the two sides to disagree
  about.

So a value import added here does not merely fatten a bundle: **it stops phase 4's script booting at
all.** `scripts/nina-memory-reap.mjs`'s header records the one case where a `.mjs` cannot import a
`.ts` — a module whose own imports are runtime values (drizzle) rather than `import type` — and zero
imports is exactly the condition that keeps this file out of it. `shortcuts.test.ts` reads this
file's own source and fails on an `import` line, so the property is checked rather than intended.
That is also why `NinaShortcutMatchable` is declared here as a plain interface instead of imported
from `lib/db/schema.ts`.

### Normalisation is five operations, in this order

`normalizeNinaTrigger` folds both the trigger and the message it is looked for in: **NFC**, then
**remove every `U+FE0F`**, then collapse whitespace runs to one space, then trim, then lowercase. It
is idempotent, so calling it on a stored `match_key` is free.

The `U+FE0F` line is the highest-value one in the file and the one a "simplification" deletes first:
`✌️` in the ledger is `U+270C U+FE0F` while the same emoji from an iOS keyboard may arrive as bare
`U+270C`, and folding the variation selector out of *both* sides is what makes those one shortcut.
**`U+200D` (zero-width joiner) is deliberately kept** — stripping it would merge `👩‍❤️‍👨` into the three
glyphs it is built from and collide two distinct shortcuts on one `match_key`. `NINA_TRIGGER_MAX =
16` exists to leave room for exactly that (the longest real trigger, `nom nom`, is 7 UTF-16 units).

### A glyph and a word need different boundary rules

`classifyNinaTrigger` returns `'word'` for a trigger containing any letter or digit and `'glyph'`
otherwise — deliberately **not** an emoji regex, because the question is not "is this an emoji" but
"can this be confused with a fragment of a word". A `'glyph'` matches anywhere (`ini🍑dong` contains
the peach and means it); a `'word'` matches only when it touches neither a letter nor a digit on
either side (`yumm` inside `yummy` is him saying a word, not using the code). Five of the
twenty-four production triggers are Latin tokens, so this is not hypothetical.

The word rule is `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` and **not `\b`**, which is an ASCII word
boundary: it would put a boundary in the middle of `plak!` and none at all around an accented
letter. The lookbehind is the one construction a runtime could refuse, so it is wrapped in a
`try` — a refusal degrades that one shortcut to "did not fire" instead of failing the turn.

### Exported API

```ts
const NINA_TRIGGER_MAX = 16                 // UTF-16 units, i.e. what zod's .max() measures
const NINA_SHORTCUT_LABEL_MAX = 80
const NINA_SHORTCUT_EXPANSION_MAX = 2000
const NINA_SHORTCUT_MAX_FIRED = 4           // fired PLUS in-play, combined
const NINA_SHORTCUT_LOOKBACK = 6            // earlier RUNNER messages scanned
const NINA_SHORTCUT_BLOCK_MAX_CHARS = 5000

function normalizeNinaTrigger(raw: string): string
function classifyNinaTrigger(normalized: string): NinaShortcutKind      // 'glyph' | 'word'
function matchNinaShortcuts(input: {
  shortcuts: readonly NinaShortcutMatchable[]
  current: string | null
  recent?: readonly string[]
}): NinaShortcutHits                                                    // { fired, inPlay }
function renderNinaShortcutBlock(hits: NinaShortcutHits | null | undefined): string | null
```

`current` is his message this turn — **nullable rather than optional**, because a proactive turn has
none. `recent` is **earlier runner messages only**, newest first: phase 2 slices it out of
`loadedContext.conversation.window` with no new query, and **Nina's own bubbles are never passed**,
because an expansion she echoed would re-fire itself forever.

`fired` is ordered by where each trigger first occurs in `current`, so the block reads in the order
he typed them; ties go to the longer key then the lower id, so the result is total and reproducible.
`inPlay` is by how recent the message was, then by offset within it. A shortcut is never in both —
`fired` wins, because the strongest signal is that he just used it. `fired` fills
`NINA_SHORTCUT_MAX_FIRED` first and `inPlay` gets what is left, which may be nothing: four codes in
one message means no still-in-play context at all, and what he just said outranks what he said three
messages ago.

### `renderNinaShortcutBlock` returns `null` only when BOTH lists are empty

Not an empty string, not a header with no body. Plan invariant 2 is that a turn in which nothing
fired carries **zero** shortcut bytes, and `null` is what lets phase 2's integration be one
`if (block != null)`.

**An in-play-only hit still renders a block**, under a `STILL IN PLAY` header — that is the whole
point of `inPlay`: one production shortcut (`🫦`) opens a mode that runs until he says `💦`, and the
instruction has to still be legible on the turn where he only says *"terusin"*. So `null` means both
lists are empty, never merely that `fired` is.

The two headers are the **only** instruction text this feature adds anywhere. There is deliberately
no section in `prompts/system.ts` telling her what a shortcut is: every word she needs travels with
the shortcut, adjacent to the expansion it governs, and costs nothing on the turns where nothing
fired. That is also why phase 2's `NINA_PROMPT_VERSION` bump (5 → 6) moved **no system text at
all**: `buildNinaSystemPrompt` is byte-identical to version 5's at every tuning and
`tests/__snapshots__/nina.prompts.test.ts.snap` passes unregenerated. What changed is the
*assembler* — `userTurnText` — and the constant identifies the assembler.

The 5000-character ceiling is enforced by **dropping whole entries from the end**, not by cutting
text, because half a directive can invert a directive (`…jangan` and `…jangan berhenti` are
opposites). Four maximal expansions are 8000 characters against a 5000 ceiling, so this path is
reachable in practice. Mid-sentence truncation survives only as the last resort for a *single* entry
over the ceiling on its own, where the alternative is a header with nothing under it.

### Nothing here throws (plan invariant 7)

Every entry point tolerates `null`, `undefined`, a wrong-typed field, a duplicate id and a
`match_key` that folds to nothing, and degrades to "nothing fired". A turn that dies because a
trigger was malformed is a turn lost to a feature that is meant to be purely additive.
`shortcuts.test.ts` is 32 tests, table-driven over **the twenty-four real production triggers**
rather than invented ones — one case walks every single one of them and asserts it fires when he
sends it alone, so a normalisation change cannot pass by breaking a trigger nobody thought to name.

### The five queries, and where `match_key` comes from

`listNinaShortcuts(userId, { onlyEnabled? })` is the registry: bare it returns every row including
the disabled ones (a disabled code must be visible to be re-enabled), and with `{ onlyEnabled: true }`
it is phase 2's every-turn read against `nina_shortcuts_user_enabled_idx`. It orders by `match_key`
then `id` — a registry is scanned by trigger, and `(user_id, match_key)` is UNIQUE, so that ordering
is total and the read is an index scan rather than a sort.

`insertNinaShortcut` **throws on a duplicate trigger, and that is the design**: Postgres `23505`
from the unique index is the authority on "this code already exists", where a pre-flight `SELECT`
would be correct until two tabs raced. The caller turns the violation into a sentence. Phase 4's
importer wants the opposite behaviour on a re-run and gets it with its own `onConflictDoNothing`,
which is why this function bakes none in.

`updateNinaShortcut` returns the **row**, not a boolean, because `match_key`, `kind` and
`updated_at` are all derived server-side and an admin table re-renders the values it did not
compute. An empty patch is a no-op returning the row unchanged rather than `null`, so "nothing to
save" and "no such shortcut" stay distinguishable. `deleteNinaShortcut` is a hard delete with no
tombstone — a deleted directive that still exists somewhere is the failure this table was built to
end — and `false` means already gone *or* never his, which are the same outcome in this file.

`bumpNinaShortcutUses(userId, ids)` is one statement, `uses = uses + 1` and `last_used_at = now()`
for every id at once. **`sendNinaMessage` calls it fire-and-forget once the turn has returned, and
the caller must `.catch()`** — that call site landed with `P1-NIN-A023`: nothing reads `uses` on the
turn path, and this is telemetry rather
than bookkeeping the conversation depends on. The increment is in SQL rather than read-then-written
because a background turn and a proactive sweep are a real concurrent pair — `upsertNinaNag`'s
`count` is the precedent.

**`match_key` and `kind` are derived inside the query layer by one private `derivedTrigger` helper,
and `NinaShortcutInsert` / `NinaShortcutPatch` have no field for either.** That is not a convention
a reviewer has to enforce: a caller *cannot* mislabel a row, and the unique index can never see an
underived key. `toShortcutRecord` is the mirror on the read side — `nina_shortcuts.kind` is untyped
`text`, so an unrecognised value is **re-derived** through `classifyNinaTrigger` rather than
rejected, invariant 7 at the one boundary where a hand-edited `'Glyph'` would first be noticed.

Three names across three layers, no duplication: `NinaShortcutRow` (the raw drizzle row in
`lib/db/schema.ts`, `kind` as bare `string`), `NinaShortcutRecord` (`queries.ts`, the same fields
with `kind` narrowed), and `NinaShortcutMatchable` (`shortcuts.ts`, the structural minimum the
matcher needs). The record is a **superset** of the matchable, deliberately: phase 2 hands the array
straight to `matchNinaShortcuts` and phase 3's table renders the extra fields, so neither needs a
mapping step.

### Phase 2 — the turn fires it (`P1-NIN-A023`)

The whole integration is **two optional input fields, one required result field, and one conditional
`parts.push`**. No new module, no new query, no new provider call, no migration.

```ts
interface NinaTurnInput {
  shortcuts?: readonly NinaShortcutMatchable[]   // what listNinaShortcuts(userId, {onlyEnabled:true}) returns
  recentRunnerTexts?: readonly string[]          // HIS earlier messages, newest first, already sliced
}
interface NinaTurnResult {
  firedShortcutIds: readonly string[]            // REQUIRED. [] on most turns.
}

function shortcutHits(input: NinaTurnInput): NinaShortcutHits   // module-private
function shortcutBlock(hits: NinaShortcutHits): string | null   // module-private
function userTurnText(input: NinaTurnInput, hits: NinaShortcutHits): string  // second parameter is new
```

**The matcher runs exactly ONCE per turn, and the place is `runNinaTurnWith`** — beside
`buildNinaSystemPrompt`, before the first model call, for the same reason: everything that defines a
turn must be fixed before the up-to-four calls it may make. The single `NinaShortcutHits` feeds
**both** `userTurnText` (which renders the block) and `firedShortcutIds` (which `actions.ts` bumps),
so the block the model was actually sent and the rows whose counter moves can never disagree. A
second match inside the action would take its own view of the window and its own idea of which
message is current, and the bug that produces — *"`/admin/shortcuts` says 🍑 fired and the prompt did
not contain it"* — is unfalsifiable from the outside. That is why the ids ride on the **result** and
are not recomputed by the caller, and why they are **not** on `NinaTurnTrace`: `nina_turns` has no
column for them, and this is a value the caller acts on rather than an audit field.

**Where the block goes, and why there.** After the attached-run block and **immediately before
`HE JUST SAID:`** — R12's rule applied to a different object. A run he attached is the *subject* of
the message; a fired shortcut is the *register* the message is in, and it is the standing
instruction his next sentence has to be read under, so she reads it before the sentence rather than
after it. `turn.test.ts` pins the three offsets in order.

**A turn that fired nothing carries ZERO shortcut bytes (invariant 2)** — no header, no empty block,
not one byte, so its user turn is byte-identical to the one this repo produced before the feature
existed. That is enforced twice: `shortcutBlock` short-circuits on empty hits in *this* file rather
than trusting a renderer in another one, and `renderNinaShortcutBlock` returns `null` rather than
`''`. It is the whole reason this is a user-turn block and not a system-prompt section — two dozen
expansions would otherwise cost several kilobytes on every turn, including all the ones where he used
none of them. `turn.test.ts` asserts it three ways: field absent, `[]`, and rows present that do not
match.

**An in-play-only hit DOES render a block** — under the `STILL IN PLAY` header — while
`firedShortcutIds` stays `[]`. Both halves are deliberate: the `🫦` mode has to still be legible on
the turn where he only says *"terusin"*, and counting it again on that turn would make
`nina_shortcuts.uses` a measure of how RECENTLY he used a code rather than how OFTEN.

**Both helpers are wrapped in `try` (invariant 7).** A malformed trigger is a row an admin typed on
his phone, not a programming error; the matcher is a pure zero-import function that is not supposed
to throw either, and this is belt to that brace. A refusal degrades to "nothing fired" with a
`console.warn`, never to a lost reply — `turn.test.ts` drives a regex-metacharacter trigger (`(([`)
through the real loop and asserts `source: 'llm'`.

**The two new fields are OPTIONAL, and that is a decision.** Contrast `tuning`, which is required
because a forgotten call site would silently ship the default character. Nothing of the kind applies
here: `proactive.ts` has no runner text at all, and the `tests/live/` and `tests/integration/`
builders exercise no shortcut — "this turn carried none" is the correct behaviour on every one of
them, so a required field would only force fixture rewrites. Absent, `[]`, and "present but nothing
matched" are the same turn.

**The action's side (`actions.ts`).** `listNinaShortcuts(userId, { onlyEnabled: true })` is a
**fourth entry in the existing three-way `Promise.all`** — one `(user_id, enabled)`-indexed read of
a table holding tens of rows, on a connection the turn is already opening, so it costs no wall clock
the turn was not already spending, and a row added on `/admin/shortcuts` fires on his very next
message with no invalidation step. **Its rejection is swallowed** (`.catch(() => [])`, invariant 7):
it is the one entry of the four that is garnish — a tuning that will not load is the wrong Nina and
a context that will not load is no turn, but a shortcut table that will not load is a turn with no
shortcut in it, which is what most turns are anyway. `recentRunnerTexts` is **derived from the
already-loaded conversation window with no new query** — three array operations over ~40 objects in
memory: filter to `role === 'runner'`, drop the message this turn is answering (a trigger in it
FIRED, and letting it also count as carried-over would bump one shortcut twice for one send),
`reverse()` to newest-first, `slice(0, NINA_SHORTCUT_LOOKBACK)`. Hers are excluded (A3) because an
expansion she echoed back would re-fire itself for as long as it stayed in the window.

The usage bump sits **above all four exits** of the send path (`session-gone`, the null payload, the
happy path, a throw), so one call site covers them: a shortcut fired the moment its expansion went
into the payload the model was billed for, and counting only the turns that survived to a bubble
would make the column a measure of Nina's uptime rather than of his habits. It is `void … .catch()`
rather than `await`, and deliberately **not** `after()` — we are already inside one, and
`tests/nina.resend.test.ts` drains that queue by hand and asserts its length, so a second entry
would change what that suite measures.

**`NINA_PROMPT_VERSION` 5 → 6 is this set's single bump, and phase 2 owns it.** No later phase may
touch the constant; two bumps would date two commits to one change. The reason it is a bump at all
despite no system text moving is in *"The prompt is a function of the tuning"* above.

## Dataflow

**A user sends Nina a message.** `Composer.tsx` may call `describeNinaImage` first → `vision.ts`
describes the upload → a signed `imageTicket` returns to the client. `describeNinaImage`
re-checks the pathname the client hands back with `isNinaChatRequestPathname` before signing
anything into that ticket, and what it is handed is the **stored** pathname — Vercel's suffix and
all — not the one the browser asked for. Then `ChatScreen.tsx` calls `sendNinaMessage`:

1. `requireUserId`, then validate body / `replyToId` / tickets.
2. Persist the user's message.
3. One `Promise.all`: `loadNinaContext` → `buildNinaContext` (memory, patterns, nags),
   `loadRunHistory`, `readNinaTuning`, and `listNinaShortcuts(userId, { onlyEnabled: true })` — the
   last one's rejection swallowed. `recentRunnerTexts` is then sliced out of the loaded window with
   no new query.
4. `runNinaTurn` with `NINA_FULL_TOOL_SET` and the prompts. `shortcutHits` matches **once**, before
   the first model call, and feeds both the user-turn block and `firedShortcutIds`. Tool rounds go
   through `dispatchNinaTool`; `generate_image` opens a job row and fires the GH-Actions worker.
5. The `send` payload is validated by `NinaSendPayloadSchema`; bubbles are written; the turn is
   recorded; `bumpNinaShortcutUses(userId, result.firedShortcutIds)` runs fire-and-forget above all
   four exits.
6. `after(...)` schedules `runTurnDistillation` → `planMemoryWrites` → `applyMemoryPlan`.
7. The client renders with `reveal.ts` timing, `chatview.ts` grouping, `reply.ts` quotes,
   `live.ts` merges, `scroll.ts` restore.

**He resends a message she never answered (R5).** A tap on his own bubble opens the sheet
(`decideMessageActionTap`), `canResendMessage` gates the item, and `resendNinaMessage` picks the send
path up at step 4 with **nothing from steps 1–2 repeated**: owner-scoped row read →
`getNinaMessageImagesForMessages` → `sweepStaleNinaChatTurns` → `openNinaChatTurn` on the same
`runner_message_id` → newest-`seq` cursor → `startNinaBackgroundTurn`. No row is written; the client
raises `cursorRef` by `Math.max` and re-enters the shipped awaiting/poll/reveal loop at step 7.

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
  `NinaAttachResult`, `ResendNinaMessageResult`) rather than throwing across the boundary.
- **`resendNinaMessage` never throws and has one refusal shape.** `resendRefused(reason)` returns
  `{ ok: false, turnId: null, cursor: null, reason }` for all five members of `NinaResendRefusal`, so
  a caller has one branch and no `undefined`; the sweep and the cursor read are both `try`/`catch`ed
  and degrade rather than losing a turn that is already claimed. `ChatScreen` treats a *thrown*
  action as `'failed'`, which is what it means: the row is untouched.
- **A failed cancel or ownership read degrades to today's behavior.** `supersedeNinaChatTurn`
  answers `false` rather than throwing for a database problem, and `sendNinaMessage` wraps it
  anyway; `chatTurnWasSuperseded` catches its own read errors and answers `false`. The worst case
  either way is the pre-feature path — the running turn chains the message, or one duplicate
  answer. Losing a whole 45-second reply is the one outcome neither may produce.
- `vision.ts` has two named error classes — `NinaVisionTokenFloorError`, `NinaVisionTransportError`.
- `imagefail.ts` classifies generation failures into `NINA_IMAGE_FAILURES` and picks what she says
  about each; a failure is a message from Nina, not a stack trace.
- **`captionNinaPhoto` never throws and returns `null` for every failure shape** — a thrown call, a
  `max_tokens` stop, no tool block, an empty string, a refused line. Even `narrativeClient()`
  throwing (it reads `@/lib/env`) is caught, because both callers run it inside `after()` where a
  rejection is a log line and nothing else. A `null` is not an error state: the row keeps the canned
  scene-agnostic caption, nothing is persisted, and a later pass could try again for free.
- `persona.ts` and `tuning.ts` define no error types and never throw.

## Gotchas

- **The tuning-aware exports currently have no importer.** `ninaIdentity`, `ninaTraitsBlock`,
  `NINA_RELATIONSHIP_BLOCKS`, `NINA_TRAIT_BANDS`, `NINA_DIAL_BANDS`, `ninaAppearance` and the rest are
  exported but unconsumed — `prompts/system.ts` still imports the pre-rendered `*_BLOCK` constants.
  **That is correct and intended**: it is what makes phase 2 shippable alone, with the tree building,
  tests passing and behaviour byte-for-byte unchanged. Phase 3 replaces those references with
  `ninaXxx(tuning)`.
- **`captionNinaPhoto` has no importer either, and for the same reason.** `P1-NIN-A019` shipped the
  engine unwired on purpose: phases 3 and 4 of that set run concurrently and both needed it
  unit-tested first. The payload-boundary guard already sanctions the two wiring modules that do not
  call it yet, so neither phase has to edit the guard and collide with the other.
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
  written inside a `.tsx` file. Same reason `jobIsOpen`, `planJobJump` and the soft-nav one-shot
  `nextSoftNavJump` are there.
- **`ChatScreen` has exactly TWO sanctioned `replaceState` writers, and never two in one commit.**
  The mount-path strip effect (deps `[]`) and the soft-nav `?jump=` watcher are the pair; two
  writers in one commit would race to decide which URL survives, and the watcher writes only in the
  commit where the navigation arrived — a commit the mount effect does not run in. A new query
  parameter belongs in the mount effect's by-name `delete` list, never in a new effect, and
  `tests/nina.chatPhoto.test.ts` counts the writers in `ChatScreen`'s source so an unsanctioned
  third fails the suite.
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
- **Never shrink `NINA_IMAGE_CAPTIONS`.** It is a historical *set* read as an identifier by
  `isNinaPhotoCarrierMessage`, not a menu. Rows in the database carry all five sentences, so
  deleting a member stops every bubble holding it being recognised as a photo carrier. What you may
  do is stop *picking* one: add it to `NINA_SCENE_ASSERTING_CAPTIONS` and
  `NINA_IMAGE_CAPTION_POOL` derives itself. Never hand-copy the pool — a copied subset drifts
  silently the first time a sixth line is added, and the test still passes.
- **`imagefail.ts` imports nothing, by hard invariant.** Not `server-only`, not `@/lib/env`, not a
  type. `scripts/nina-image-worker.ts` resolves it by relative path under
  `--experimental-strip-types`, and one import stops the worker booting.
- **`ninaImageCaption` is a fallback, not the caption.** Every degraded path lands on it — model
  failure, timeout, token floor, empty completion, and permanently the GitHub-runner worker, which
  has no z.ai key. That is why the pool must stay true of *any* photograph.
- **`prompts/caption.ts` must never grow into a second character assembler.** It carries the blocks
  that decide how one line *sounds* and nothing else; `buildNinaSystemPrompt` is the only assembler
  of the full character. Adding `ninaIdentity` there costs ~3,000 tokens to produce twelve words and
  invites her to coach or diagnose under a photograph of herself.
- **Bump `NINA_CAPTION_PROMPT_VERSION`, never `NINA_PROMPT_VERSION`.** The tool's property
  `description` is part of the prompt and counts. Hers scopes `prompts/system.ts` and
  `prompts/tools.ts` only, and a bump there would date the snapshot gate to a change that never
  touched it.
- **A caption over the ceiling is refused, not truncated**, and any digit refuses the whole caption
  with no carve-out. Both rules read as harsh and both are deliberate: half a sentence is nonsense,
  and every number that could reach a caption came from the photograph rather than from
  `lib/format.ts`.
- **`describeNinaImages`'s `subject` defaults to `'runner'`** — never make it required and never
  reorder the `Record`. It is what keeps the composer pre-pass, both avatar paths and the chat-photo
  describe byte-identical. And never move the token floor to compute before the prompt is chosen:
  it is text-aware, and the longer self prompt is *supposed* to raise it.
- **`composerBottomCss` and `composerPadBottomCss` ship as a pair.** A caller that passes one and
  not the other either leaves an unpainted strip under the composer or pads it twice, so
  `padBottomCss` is a **required** prop on `Composer` rather than an optional one. The rule they
  jointly enforce: the home-indicator inset is contributed by exactly one term in every state,
  because the offset gates on `var(--nina-bar-visible, 0)` and the padding gates on its complement
  `1 - var(--nina-bar-visible, 0)`. Both must read the **same** custom property — a padding gated on
  a variable nobody writes is a padding that is always on.
- **Never add `var(--safe-bottom)` outside the gate.** That is the exact shape of the bug `P1-RI-A023`
  fixed: an inset added beside the multiplication survives the flag going to 0, which is the state
  `/nina` rests in. `chatview.test.ts` asserts the *shape* (`not.toContain(') + var(--safe-bottom)')`)
  rather than a pixel, because the pixel is unknowable in Node.
- **`controlBottomCss`'s two branches are asymmetric on purpose.** The measured branch gates its
  inset on the bar flag; the unmeasured fallback adds it **ungated**, because `COMPOSER_RESTING_PX`
  is the content box and carries no inset of its own. That fallback is what the server renders and
  what the first client paint uses (`ChatChrome` seeds the height at 0 and measures in a passive
  effect), so gating it puts the two floating discs behind the composer's `z-40` glass. A test
  asserts the branches emit different strings so the pair cannot be folded into one.
- **60 is written in four places, none of which can import the others.** `Composer.tsx`'s `py-2`,
  `COMPOSER_RESTING_PX`, `ChatScreen.tsx`'s `COMPOSER_FALLBACK_PX`, and `BOTTOM_GAP.chat`'s
  `7rem` in `components/ui/AppShell.tsx`. Tailwind cannot read a constant. A stale literal in the
  shell reads as a gap under the conversation rather than as a bug — it has survived review twice.
  The composer's home-indicator padding is **not** in that sum and must not be added: it is the
  `var(--safe-bottom)` term the class already carries, which is why the whole thing is
  `calc(7rem+var(--safe-bottom))` and not `pb-28`.
- **No barrel.** Import the submodule, not the package.
- **`persona.ts` must stay free of `server-only` and free of I/O.** Adding either breaks the
  `/admin/nina` preview and the tests that assert rule text without a client.
- **`lib/nina/context.ts` is off-limits to every phase in this plan set** (plan invariant 3). Where
  the anger ladder needed a fix that would otherwise belong there — `nagLevel` is absent from the
  payload entirely on a quiet day — the fix is a sentence in `ninaAngerLadderBlock`.
- **Never let the tap slop and the swipe thresholds grow into each other.**
  `MESSAGE_ACTION_TAP_SLOP_PX` (10) must stay far below `REPLY_SWIPE_MIN_DISTANCE` (44), and
  `edit.test.ts` fails on both halves if it does not. Overlapping windows mean one drag that opens
  the reply composer *and* a delete confirmation; the 34 px between them is a dead band, not slack
  to be spent.
- **`edit.ts` may name no DOM type.** `vitest.config.ts` is `environment: 'node'`, so the component
  reads `closest()` and `getSelection()` and hands down collapsed booleans — the component measures,
  `lib/` decides. An `Element` or a `Selection` in one of these signatures is how the whole gesture
  layer stops being testable, and a rendered-scenario test would prove one gesture where these
  prove the gate.
- **`shortcuts.ts` may not import anything, and it is not a style preference.** Adding an import
  stops phase 4's `.mjs` importer booting under `--experimental-strip-types` and drags the module
  out of the browser bundle phase 3's `'use client'` table needs it in. `shortcuts.test.ts` reads
  the file's own source and fails on an `import` line. Corollary: `NinaShortcutMatchable` stays a
  plain interface declared there and is never replaced with an import from `lib/db/schema.ts`.
- **Do not delete the `U+FE0F` strip from `normalizeNinaTrigger`, and do not "also strip `U+200D`
  while you are there."** The first is what makes `✌️` and `✌` one shortcut; the second would merge a
  ZWJ emoji sequence into its component glyphs and collide two distinct shortcuts on one
  `match_key`. The two look like the same tidy-up and are opposites.
- **A caller may never supply `match_key` or `kind`.** They are derived from `trigger` by
  `queries.ts`'s one private helper, and the input types have no field for them — keep it that way,
  because an underived key is a key the unique index treats as a different trigger.
- **`bumpNinaShortcutUses` is telemetry: the caller must `.catch()` it.** It runs after the turn has
  returned and nothing reads `uses` on the turn path, so a rejected bump must never fail a turn.
- **`matchNinaShortcuts` runs ONCE per turn, in `runNinaTurnWith`, and nothing may run it again.**
  `actions.ts` reads `NinaTurnResult.firedShortcutIds` instead of re-matching, because a second run
  would see a slightly different window and could disagree with the block the model was sent — and
  "`/admin/shortcuts` says 🍑 fired but the prompt did not contain it" cannot be falsified from the
  outside. For the same reason the ids stay off `NinaTurnTrace`: they are acted on, not audited.
- **A turn that fired nothing must stay byte-identical to a pre-feature turn (invariant 2).** Keep
  the empty-hits short circuit in `turn.ts`'s `shortcutBlock` even though `renderNinaShortcutBlock`
  already returns `null` — the invariant is asserted against `turn.ts` and must not depend on what
  another file does with an empty argument. Do not "promote" the block into `prompts/system.ts`:
  every turn would then pay for two dozen expansions he did not use.
- **The burst cancel's three conditionals are load-bearing, and each is one "tidy-up" from a
  corruption.** `supersedeNinaChatTurn` must keep `status='pending' AND error_code='running'` (and
  the freshness bound) in its own UPDATE's WHERE — the read above it only decides whether a cancel
  is worth attempting. `ninaChatTurnStore.record`'s phase advance must stay conditional on
  `status='pending'` and its metrics-only arm must never name `status` or `error_code`, or a
  superseded reason is overwritten with a phase value and a closed row claims to be mid-persist.
  And `chatTurnWasSuperseded` must stay exactly `failed`+`superseded` — widening it to every
  non-pending state turns a slow `'stale'` turn into a silently lost reply. `chatturn.test.ts` pins
  all three against the SQL the real module generates.

## Tests

In-package: 28 colocated `*.test.ts` files over the pure modules — the twenty-eighth is
`chatturn.test.ts`, the chat claim's state machine asserted against the SQL the real module
generates (see *"The burst cancels the thinking turn"* above); the twenty-seventh, `shortcuts.test.ts`,
carries the zero-import structural guard described above.
`turn.test.ts` adds two describe blocks for `P1-NIN-A023` — *"`userTurnText` — the fired shortcut"*
(invariant 2 three ways, the in-play-only block, the full expansion, the three offsets around
`HE JUST SAID:`, a disabled row dropped at the input boundary, `recentRunnerTexts` as the only route
to history, and invariant 7 driven through the real loop with a `(([` trigger) and
*"`NinaTurnResult.firedShortcutIds`"* (`[]` with no shortcuts, only the id he typed, `[]` for
in-play-only, and the id still carried by an `unavailable` turn — the action bumps before it checks
whether she answered). `tests/nina.resend.test.ts` needed one
line: its `runNinaTurn` mock now returns `firedShortcutIds: []`, because the field is required and
the action reads its length.
Repo-level: 39 `tests/nina.*` files,
including `tests/nina.tuning.test.ts` (phase 1's model, and the band-count/rung-count coupling
asserted by length), `tests/nina.prompts.test.ts` (walks `JAKARTA_SLANG`, `ANGER_LADDER`,
`NEVER_SAY` and `VOICE_EXAMPLES` against the assembled prompt) and `tests/nina.burstCancel.test.ts`
(the burst cancel, below). `NEVER_SAY` is the *unconditional*
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

**The caption engine is tested in three files, none of which needs a client or a store.**
`tests/nina.caption.test.ts` covers the pure rules (`sanitizeNinaCaption`'s label prefix, a quote
inside a quote, control characters and zero-width invisibles, a colon that belongs to the sentence,
an ordinary word that merely *contains* a forbidden one, refusal rather than truncation over the
ceiling), `parseNinaCaption`, `buildNinaCaptionRequest` (a `null` for nothing to caption so **no
call is made**, the clamp, the instruction last, and the two `seenKind` preambles),
`buildNinaCaptionSystemPrompt` (it carries the voice blocks, it does **not** carry the full
character assembly, it gives the model a way to decline, and it has **no empty paragraph** at the
default relationship) and `captionNinaPhotoWith` against an injected client — including reading past
a `thinking` block rather than off the front of the array, and asserting the forced tool.
`tests/nina.imagefail.test.ts` pins the pool/set derivation **in both directions** — all five
captions survive because they are identifiers, every pool member is a set member, no pool member is
scene-asserting — and proves the scene-asserting line is unreachable **exhaustively over the pool**
rather than by sampling seeds, because the pool is what bounds the answer whatever `pickLine`
hashes to. It also proves every pool member is still reachable, so nothing was stranded.
`lib/nina/vision.test.ts` asserts the runner prompt is sent **byte for byte by default** and that
the self prompt **still trips** the token floor on the measured drop signature — that case must keep
failing rather than start passing, since a longer prompt raises a text-aware floor.

**The composer's geometry is tested as CSS strings, in three files that never open a browser**
(70 assertions, all passing as of `P1-RI-A023`). `lib/nina/chatview.test.ts` covers the pair:
the hidden state collapsing the whole offset to nothing, the keyboard branch as the one thing R1 did
not change, the complement gate reading the *same* variable as the offset, `'0px'` rather than a bare
`'0'` because the value goes into `style.paddingBottom`, and NaN / negative / `Infinity` overlaps all
degrading to "no keyboard" because the resting screen is the common case. `lib/nina/chrome.test.ts`
covers `controlBottomCss` in both branches — the gated inset in each bar state, a fractional
`getBoundingClientRect()` height rounded rather than emitted as `calc(60.328125px + …)`, the
fallback's **ungated** inset, and a case asserting measured and unmeasured emit *different* strings
so the asymmetry cannot be tidied into one branch. `tests/tabbar.geometry.test.ts` is the one that
ties the literal 59 back to `TAB_BAR_HEIGHT_PX` + `TAB_BAR_BORDER_PX`, end to end through the pure
function, so the composer's offset and the bar's real top edge cannot drift apart. Every one of these
asserts a **shape** rather than a rendered pixel — `var(--safe-bottom)` resolves only in a real
viewport, so the string is the whole of what is checkable in Node, and it is also exactly where the
bug lived.

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

**R5's resend is tested against the real `actions.ts`, with only the edges mocked.**
`tests/nina.resend.test.ts` (16 cases in three blocks) mocks `next/server`, `requireUserId`,
`queries` and `chatturn` — plus `load`, `gateway`, `turn`, `distill` and `autotitle` for the last
block, which drains the deferred turn — and leaves the module under test real, the arrangement
`tests/nina.jobActions.test.ts` established one feature over. Mocking the module under test would
have made every property untestable. The blocks are: **the refusals** (`requireUserId` above the
shape check, a foreign row answering exactly as one that never existed, one of hers refused although
no button offers it, an operator-emptied row, an image-only message *accepted* because an image
alone is a valid send, a live turn reported as its own outcome rather than opening a second claim,
and a claim that could not be opened writing nothing); **the claim and the cursor** (no message row
and no image row written, sweep-then-exactly-one-claim at the same `runner_message_id` and
`depth: 0`, the claim still opening when the sweep throws, the newest `seq` returned rather than the
resent row's own, the fallback to the row's own `seq` when the cursor read fails, and exactly one
background turn deferred); and **the rebuilt input** (his text, his photos' descriptions with the
`NINA_DESCRIPTION_UNAVAILABLE` substitution, his quote and his run; `runnerText` as `null` and not
`''` for a photo-only message; and the claim closing when she answers with nothing, so the poll
stops). `lib/nina/edit.test.ts` carries `canResendMessage`'s five, including the pinned *absence* of
an answered/unanswered clause and a case walking four patches to prove it never diverges from
`canActOnMessage` on one of his.

`tests/nina.jobActions.test.ts` adds the action's own two describe blocks — a malformed id bounced
before the database, a foreign job answering exactly as one that never existed, an **already-hidden**
job answering identically so a double-tap is a silent no-op, no job opened and no generation
scheduled (*"a delete is not a redo"*), and exactly one path revalidated: `/nina/jobs` and not
`/nina/about`. `tests/db.schema.nina.test.ts` holds the column — nullable `timestamp with time zone`
with no default, present on the table, and `nina_turns` still carrying exactly one index.

**The search-jump set is tested at the seams that can silently drift.** `lib/nina/search.test.ts`
asserts `searchHitHref`'s message arm IS `ninaJumpHref`'s output — one builder, not a second
spelling — and that it writes no `?at=` mark, so `saveMark` keeps its single writer.
`tests/nina.jobview.test.ts` walks `nextSoftNavJump`'s one-shot rule: an unseen value lands, the
initialised mount value does not, a `null` raw re-arms (a repeat tap is genuine, a repeat render is
not), and a value that cannot be one of our ids is refused without being retried. And
`tests/nina.chatPhoto.test.ts` counts `replaceState` in `ChatScreen`'s source — exactly two, the
sanctioned pair.

**The burst cancel is tested at two altitudes.** `lib/nina/chatturn.test.ts` asserts the claim's
state machine against the SQL the real module generates (`tests/support/fakeDb`, splitting each
UPDATE into its SET and WHERE halves): the supersede UPDATE carries `status='pending' AND
error_code='running'` and the freshness bound in its own WHERE, does not even attempt a cancel
against a `'persisting'` or expired claim, and answers `false` when it races and misses;
`record`'s arm 1 advances only a live claim to `'persisting'` and its metrics-only arm names
neither `status` nor `error_code`; and `chatTurnWasSuperseded` is true for exactly
`failed`+`superseded` — never `'stale'`, `'crashed'`, `'ok'`, or a missing row.
`tests/nina.burstCancel.test.ts` drives the real `sendNinaMessage` and `runNinaBackgroundTurn` with
only the edges mocked: the cancel lands after his row is persisted and before the claim is opened,
a WON cancel reports the NEW turn's id and defers exactly one background turn, a LOST cancel and a
FAILED cancel are both exactly today (the open refuses; the open still runs), the superseded
invocation inserts no bubble, closes nothing, starts no distillation and no chain while its
shortcut bump still fires, and an ownership read answering false persists everything exactly as
today — the regression guard for the ordinary turn. The two suites that mock `chatturn` needed the
new exports to exist: `tests/nina.resend.test.ts`'s factory mock gains `supersedeNinaChatTurn` and
`chatTurnWasSuperseded` (and one case pins that a resend never calls the first), and
`tests/nina.chatPhotoReattach.test.ts` stubs `supersedeNinaChatTurn` to `false` because the real
one would reach for its dummy `DATABASE_URL`.

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

---

## The Instructor character — a sixth relationship, and what she does with a fired pattern

`NINA_INSTRUCTOR_CHARACTER_PLAN.md`, three phases, landed 2026-09-07 as `P1-NIN-A016`,
`P1-NIN-A017` and `P1-NIN-A018`. No migration, no new table, no new column: the whole set is code.

**The relationship has six settings, not five.** `NINA_RELATIONSHIPS` gained `'instructor'` — a
professional running coach — **appended** at index 5 rather than inserted, because a coach is not on
the least-to-most-intimate axis the first five are ordered by, and appending keeps every existing
index stable. Adding a level means filling four `Record<NinaRelationship, …>` sites the compiler
enforces (`NINA_ADDRESS`, `NINA_RELATIONSHIP_BLOCKS`, `RELATIONSHIP_GLOSS`, and the token record in
`tests/nina.prompts.test.ts`) and four prose sites it cannot see (`RELATIONSHIP_NOTE`, the hardcoded
address-forms list in `prompts/distill.ts`, the `nina_tuning.relationship` docstring in
`lib/db/schema.ts`, and the level-counting comments). `RELATIONSHIP_NOTE` is `Record<string, string>`,
so it is the one site a missing entry does not break the build — `tests/admin.tuning.test.ts` asserts
a non-empty hint for every level, which is what catches it. Her address word is `"atlet"`, kept
exclusive to her by `tests/nina.tuning.test.ts`, because per-level token assertions are only worth
something if a token cannot come from another level.

**The slot vocabulary is ten keys, not nine.** `training_plan` sits fourth, directly after
`running_days`, and the adjacency is the point: those two are the pair a writer confuses.
`running_days` answers WHICH days he runs and is read back through `parseRunningDays` by the evening
cron, so a value that will not parse is refused to a ledger fact. `training_plan` answers WHAT HE
DOES on them, and nothing in the app parses it — no cron, no pattern, no trigger. Its only reader is
Nina, taking the value verbatim out of `memory.slots` on the next turn. That is why its canonicaliser
is `prose(raw, 400)` and not a parser: a parser with no consumer would buy nothing and would throw
away every legitimate phrasing it failed to read. The 400 matches both existing write caps exactly
(`NinaMemoryWriteSchema.text` and `ADMIN_SLOT_VALUE_MAX`), so it can never truncate a legal write. It
is a `replace` slot — a training week that changes is superseded, not accumulated — and `replace` is
also what keeps it an editable row at `/admin/memory`, since `buildMemoryRows` excludes
`merge`-policy keys. The slot is available at **every** relationship level, deliberately: a
best-friend Nina who knows his training plan is better at her job too. A slot only one setting can
fill is a slot the distiller never learns to write.

**The thing worth knowing about the coaching register: the monitoring already existed.**
`patterns.ts` has computed `REPEATED_HIGH_AVG_HR` and `PACE_REGRESSION` — the two examples the user
named, by name — since the Nina set. What the app did with a fired code was get *angry* about it
(`angerSourceClause`). That is the right response for a best friend and it is not what a coach does
with the same number, so **the gap was the response, not the detection**: no `PatternCode` was
coined and no proactive trigger was added. `INSTRUCTOR_COACHING` in `persona.ts` is the response — a
fired code is a working list, and every one she raises leaves the conversation with one change, one
length of time to hold it, and one field in the payload she will re-read. `proactiveTuningSuffix`
gained a gated line so an opener under `instructor` arrives as a coach's.

**All three additions are gated on `ninaActiveRelationship(tuning) === 'instructor'`** — never
`tuning.relationship`, because `enabled.relationship` is an off-switch and clearing it must degrade
her to the `best_friend` who shipped. `renderSections` drops an empty block, so the default render is
byte-identical and `tests/__snapshots__/nina.prompts.test.ts.snap` still pins its four renders
**unregenerated**. That is also why `training_plan` is spelled only inside the gated block and never
in `buildContextGuide`: an ungated byte in the `memory.slots` paragraph fails that snapshot four
times. The prompt grows 14203 → 21597 characters at `instructor` and by **zero bytes** at the
default.

**Nothing was repealed.** `NINA_NOT_A_DOCTOR`, `'the name of a medical condition'` in `NEVER_SAY`,
the arithmetic half of `NUMBERS_RULE` and the whole anger ladder are untouched at every level
*including* `instructor` — and the coaching block says the diagnosis rule is **tighter** for a coach,
with a defined substitution: when the sentence would be a verdict on his body, say what he does on
his next run instead. She prescribes training, never physiology. A professional is more careful here
than a friend, not less. Three tests assert that structurally.

Two version constants moved, one each: `NINA_DISTILL_PROMPT_VERSION` 2 → 3 (phase 1, covering both
its own edit to the librarian's prompt and phase 2's indirect change through `SLOT_VOCABULARY_BLOCK`)
and `NINA_PROMPT_VERSION` 4 → 5 (phase 3). Plans for the set are
`.workflows/plan/nina-instructor-character/phase-1.md` through `phase-3.md`.

> **The one open operator step:** select **Instructor** once at `/admin/personality` for the
> character to be reachable by a real user. Deliberately not done by any phase — `.env.local` in a
> worktree points at the **production** database, so a phase saving it would have flipped Nina's
> live relationship for real users. It is one click and reversible: `coerceNinaRelationship`
> degrades an unknown value to `best_friend` without throwing.

### Known gaps, ruled out of this set by design

- **She names a date she will look again, and nothing remembers it.** A sixth proactive trigger
  firing when a prescription's deadline arrives — with its own idempotence marker and priority slot
  — is the difference between a coach who says "six weeks" and a coach who comes back in six weeks.
  Ruled out by D5 (the existing path produces the behaviour once the register is right); the
  deadline-recall half is genuinely absent rather than deferred-and-covered.
- **`REPEATED_LATE_START`, `MISSED_USUAL_DAY` and `ACWR_SPIKE` get no bespoke prescription.** The
  block's general shape covers them; adding three paragraphs to `INSTRUCTOR_COACHING` is a one-file
  change.

**`P1-NIN-A019` is phase 1 of 4 of `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md`** — *Nina's photo
captions come from the photograph*, on `feature/nina-photo-caption-from-image` off `origin/main` @
`f839116`. It satisfies R1 and R2 and ships **the caption engine with nothing wired to it**. Its
plan file is `lib/nina/.workflows/plan/P1-NIN-A019.md`; see *"The caption under a photograph of
hers"* above.

| Phase | What | Package | Task |
|---|---|---|---|
| 1 | Her eyes for her own photo, and her voice for the caption | `lib/nina` | `P1-NIN-A019` *(this one)* |
| 2 | The carrier marker: a photo bubble free text cannot hide | `lib/db` + `lib/nina` + `lib/admin` + `scripts` | `P1-DB-A002` |
| 3 | The admin add path captions from the photograph | `lib/admin` | `P1-ADM-A000` |
| 4 | Generated selfies caption from the scene she asked for | `lib/nina` | `P1-NIN-A020` |

Phases 3 and 4 both depend on 1 and 2 and run concurrently — which is exactly why phase 1 shipped
unwired and why the payload-boundary guard's ninth entry already sanctions both wiring modules: two
phases each appending to one guard is two merge conflicts, and a window in each of them where the
new call is unguarded.

---

**`P1-NIN-A023` is phase 2 of 4 of the `nina-emoji-shortcuts` set** — *firing a shortcut into the
turn*, satisfying R2. It is the wiring phase for `P1-DB-A004`'s table, matcher and queries: five
files, no new module, no migration, no new query, no new provider call, and the set's **single**
`NINA_PROMPT_VERSION` bump (5 → 6). See *"Phase 2 — the turn fires it"* above.

| Phase | What | Package | Task |
|---|---|---|---|
| 1 | The table, the matcher and the queries, unwired | `lib/db` + `lib/nina` | `P1-DB-A004` |
| 2 | Firing a shortcut into the turn | `lib/nina` | `P1-NIN-A023` *(this one)* |
| 3 | The admin registry at `/admin/shortcuts` | `lib/admin`, `components/admin`, `app/admin` | — |
| 4 | Lifting the existing codes out of the memory ledger | `scripts` | — |

Phase 2 collected on phase 1 exactly as intended and added nothing structural of its own: the
matcher, the renderer, the two headers, the caps and the counter statement were all already there
and unit-tested, so the integration is two optional input fields, one required result field and one
conditional `parts.push`. **Deliberately untouched**, each for a stated reason:
`lib/nina/shortcuts.ts` (phase 1's surface needed no widening — `matchNinaShortcuts` already took
`current` plus `recent`), `prompts/system.ts` and `prompts/tools.ts` (the instruction text travels
with the expansion, so there is no section to add), `lib/nina/proactive.ts` (a proactive turn has no
runner text, so nothing there could ever fire), and
`tests/__snapshots__/nina.prompts.test.ts.snap` (byte-identical at every tuning — regenerating it
would have hidden that fact rather than proved it).

---

**`SEARCH_JUMP_PINPOINT_PLAN.md` is complete — phase 1 of 1 landed as `P1-NIN-A025`.** Search hits
deep-link through the existing `?jump=` pinpoint rather than a grammar of their own:
`searchHitHref`'s message arm delegates to `ninaJumpHref` (`/nina?s=<sid>&jump=<mid>`; a
session-title hit stays `/nina?s=<sid>`), and `ChatScreen` gained the soft-nav watcher so a `?jump=`
naming the session already on screen — same key, no remount — scrolls instantly, flashes the
reply-to blue ring, and strips `jump` by name so `?s=` and `?at=` survive. `nextSoftNavJump` is the
pure one-shot guard, appended to `jobview.ts`; the landing itself was extracted into one `landOn`
callback reused by both arrivals, so `measureQuoteScroll` / `flashMessage` are shared rather than
duplicated and `handleJumpToQuote`'s reply-to contract is untouched. No migration, no schema
change, no new module, no `NINA_PROMPT_VERSION` bump. The plan is
`.workflows/plan/search-jump-pinpoint/phase-1.md`; the footprint outside this package is
`components/nina/ChatScreen.tsx` and two test files.
