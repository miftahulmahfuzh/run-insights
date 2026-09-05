# Package: `lib/nina`

**Location**: `lib/nina`
**Last Updated**: 2026-09-05
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
- **Eleven traits** (`NINA_TRAITS`: anger, chill, sad, flirty, steamy, wise, annoying, funny, happy,
  anxious, concerned) with `NINA_TRAIT_SPECS` carrying each key's `defaultScore` and the user's own
  words for it.
- **Five relationships** (`NINA_RELATIONSHIPS`: nobody, casual_friend, sister, best_friend,
  girlfriend), default `best_friend`, with `NINA_ADDRESS[rel]` owning what she *calls* him — the
  address rule, the fallback, the words, and the panel label. That record lives in `tuning.ts` and
  not in `persona.ts` precisely so `/admin/nina` can render the vocabulary without importing the
  canon.
- **Four dials** (`NINA_DIALS`: profanity, clinginess, photoEagerness, verbosity), each naming a real
  code path.
- **`NinaTuning`** — `{ traits, relationship, dials, wardrobe, notes, revision }`, all readonly.
  `wardrobe` and `notes` are `string` and never null; `''` is the one empty value. `revision` is the
  database's to assign, and `0` means *no row has ever been written*.
- **`NINA_TUNING_DEFAULTS`** — frozen, and the setting that reproduces today's Nina exactly.
- **`coerceNinaTuning`** — total, never throws, always returns a fresh unfrozen object. An
  unreadable key falls back to *that key's own default*, not to zero; an unknown relationship
  degrades to `best_friend`.

**The defaults are not uniform, and that matters everywhere below.** `anger`, `sad`, `flirty`,
`steamy`, `annoying` and `anxious` default to **0** (`off`); `profanity` defaults to **30** (`low`);
the other eight default to **50** (`mid`). They were read off the canon rather than set to the middle
of the slider, because a uniform 50 would have shipped a Nina angrier and filthier than the one that
exists.

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

`low` is left undefined on every trait, and `mid` on the six that identify at `off`. A default-`off`
trait is therefore today's Nina from 0 to 59 and speaks from 60 up — which is the shape every one of
the user's own sentences asked in (*"if X is set to high"*).

## Exported API — `persona.ts`

### Data tables (walkable, and walked by tests)

| Export | Shape | Purpose |
|---|---|---|
| `NINA_RELATIONSHIP_BLOCKS` | `Record<NinaRelationship, NinaRelationshipSpec>` | Who she *is* at each level. `identity` is an **array of sentences** (not one paragraph) so `best_friend`'s entry can be exactly the two sentences that shipped while `girlfriend`'s is six, with no entry a special case. `history` is how much shared past she may claim. |
| `NINA_TRAIT_BANDS` | `readonly NinaTraitBands[]` | Per-trait, per-band prompt paragraphs. `bands` is `Partial<Record<NinaBandName, string>>`; the key's own identity band is deliberately absent. |
| `NINA_DIAL_BANDS` | `readonly NinaDialBands[]` | The same for the four R3 dials. |
| `NEVER_SAY_ENTRIES` | `readonly NeverSayEntry[]` | The thirteen sentences that break the illusion, each with `repealedBy: readonly NinaTrait[] \| null`. Order is the order they reach the prompt. |
| `NEVER_SAY` | `readonly string[]` | The twelve entries **no dial can repeal** (`repealedBy === null`). |
| `BODY_REPEALED_BY` | `['flirty','steamy','concerned']` | **Exported for phase 3.** The one list for all three places the body rule is stated. |
| `THREAT_REPEALED_BY` | `['anger','annoying','sad']` | Repeals the threat/withdrawal clause. |
| `ANGER_LADDER` | `readonly AngerRung[]` | Five rungs, `level` 0–4, same domain as `NinaBandIndex`. |
| `ANGER_FLOOR_BY_BAND` | `Record<NinaBandName, NinaBandIndex>` | `off/low/mid → 0`, `high → 3`, `max → 4`. |
| `ANGER_CEILING_BY_BAND` | `Record<NinaBandName, NinaBandIndex>` | `off → 4`, `low → 3`, `mid/high/max → 4`. See the deviation note below. |
| `JAKARTA_SLANG`, `VOICE_EXAMPLES` | arrays | Data behind `JAKARTA_SLANG_BLOCK` / `VOICE_EXAMPLES_BLOCK`, which are `.map().join()` over them. |

`anger` is in `NINA_TRAIT_BANDS` with **empty bands**, on purpose: its entire effect is the floor and
ceiling inside `ninaAngerLadderBlock`, and a paragraph saying "you are angry all the time" beside a
block saying "your floor is rung 4" would be two sources of truth for one rung. The entry stays in the
array so a walk covers all eleven sliders.

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

### Band predicates

```ts
function isTurnedUp(tuning: NinaTuning, trait: NinaTrait): boolean   // band is 'high' or 'max' (score >= 60)
function anyTurnedUp(tuning: NinaTuning, traits: readonly NinaTrait[]): boolean
```

Both **exported**, because phase 3 needs the same test for `NUMBERS_RULE`'s surviving body clause in
`prompts/system.ts`. A second definition of "turned up" is how the two halves of one repeal come to
disagree.

### Default-render constants (the compatibility surface)

`NINA_IDENTITY`, `NAME_RULES`, `ANGER_LADDER_BLOCK`, `NEVER_SAY_BLOCK` are each
`ninaXxx(NINA_TUNING_DEFAULTS)`. Unchanged constants: `NINA_NAME`, `NINA_FACE`,
`NINA_DEFAULT_OUTFIT`, `NINA_APPEARANCE`, `NINA_EXPERTISE`, `NINA_NOT_A_DOCTOR`,
`JAKARTA_SLANG_BLOCK`, `JAKARTA_REGISTER`, `ENGLISH_REGISTER`, `VOICE_EXAMPLES_BLOCK`.

## The contract this phase established

1. **Every export is either unchanged or a function of `NinaTuning`.** Nothing reads a raw score; the
   two functions `traitBand` / `dialBand` are the only places the *shape* of `NinaTuning` is read, so
   a change to how the tuning is stored is a two-line change rather than a forty-line one.
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
`imagerecipe.ts` (camera settings shared with the worker), `imagegen.ts` (prompt text),
`imagejobs.ts` (job row lifecycle and quota), `imagedispatch.ts` (fires the GH-Actions workflow),
`imagefail.ts` (classify a failure, pick what she says), `imagetools.ts` / `avatartools.ts` (the two
tool handlers and the tool sets), `avatargen.ts`.

### Vision and intake
`vision.ts` *(T)*, `imageTicket.ts` *(T)* (HMAC-signed carrier so a description can cross from
`describeNinaImage` to `sendNinaMessage` untrusted), `images.ts` *(T)*, `crop.ts` *(T)*.

### Album and attachments
`album.ts` *(T)*, `albumActions.ts`, `attach.ts` *(T)*.

### Chat UI logic (pure, node-testable)
`chatview.ts` *(T)*, `reply.ts` *(T)*, `reveal.ts` *(T)*, `scroll.ts` *(T)*, `live.ts` *(T)*.

### Persistence
`queries.ts` — every Drizzle query for the `nina_*` tables, including `readNinaTuning` /
`writeNinaTuning`.

*(T)* = has a colocated `*.test.ts`.

## Dataflow

**A user sends Nina a message.** `Composer.tsx` may call `describeNinaImage` first → `vision.ts`
describes the upload → a signed `imageTicket` returns to the client. Then `ChatScreen.tsx` calls
`sendNinaMessage`:

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
`imagejobs.ts`), `next/server`'s `after()`, `server-only` (a side-effect guard in 13 server modules),
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
- **The identity band is not always `mid`.** Testing `band === 'mid'` instead of
  `atTraitIdentityBand` would emit seven paragraphs at the default tuning. Always ask phase 1's specs.
- **Contradictory dials are the operator's problem, not the prompt's.** `anger: 100` with
  `chill: 100` puts both paragraphs in and the model blends them. There is deliberately no
  arbitration: sixteen dials is 120 pairwise rules, and every one would be a rule that quietly
  cancels a slider. `/admin/nina` renders the assembled prompt, so the operator reads the
  contradiction they wrote and moves a slider — that feedback loop *is* the arbitration.
- **Three blocks are arrays with a derived paragraph** (`JAKARTA_SLANG`, `ANGER_LADDER`,
  `NEVER_SAY_ENTRIES`), and so are the three new tables. A paragraph that restates a list is a second
  source of truth for the list, and the failure is silent. Keep them walkable —
  `tests/nina.prompts.test.ts` walks them to prove every entry reached the prompt.
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
default.

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
