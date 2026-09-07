# Code Analysis: the Instructor character (a sixth relationship level)

**Type:** Feature Implementation
**Date:** 2026-09-07 07:54:44 +07
**Session ID:** 20260907-075444-INST
**Plan:** `NINA_INSTRUCTOR_CHARACTER_PLAN.md` (3 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-instructor-character`, branch `feature/nina-instructor-character` (base `origin/main` @ `f839116`)

---

## User Input

### Original User Request

Verbatim, the whole prompt after the command:

```
to make it a nice 3 columns x 2 rows , add a new character: Instructor . nina act as a
professional and knowledgeable instructor in which her primary objective is to improve the
performance of miftah's running. she will set up schedules, she will proactively monitor his
performance and give insights into what should he do (e.g: what should he do to reduce his
average high heart rate during run, what should he do to increase his average running pace,
and so on)
```

### User-Provided Context

None beyond the prose. No error messages, no logs, no constraints stated separately.

### User-Provided Files

None. No `@` file was marked.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | *"to make it a nice 3 columns x 2 rows"* — the character picker on `/admin/personality` reads as a clean 3-across, 2-down grid instead of a ragged 3 + 2 |
| R2 | *"add a new character: Instructor"* — a sixth selectable character, and *"nina act as a professional and knowledgeable instructor in which her primary objective is to improve the performance of miftah's running"* |
| R3 | *"she will set up schedules, she will proactively monitor his performance and give insights into what should he do"* (with the two named examples: reduce a high average heart rate, increase average pace) |

**On the R1/R2 split, and why they are two Rs and not one.** They are separable as *statements* — one
is about geometry, one is about a character — but they are not separable as *shipped work*: the grid
reads 3x2 only because a sixth card exists, and a sixth card lands in a ragged grid unless the cells
are squared up. The plan index records the coupling rather than pretending it away; both are phase 1.

**On R2 vs R3.** R2 is the character *existing* — the union member, the address vocabulary, the
identity prose, the panel copy, the distiller gloss, and every test that counts the levels. R3 is what
she *does* with it — the schedule she can keep, and the insight she draws from numbers the app already
computes. Those are different files, different kinds of change, and one can ship green without the
other, which is why they are different phases.

### The one word in the request that needed interpretation, and how it was read

**"character."** The `/admin/personality` page has two things a reader might call a character: the
panel's `<h2>` is literally *"Her character"* (the whole tuning — seventeen dials, wardrobe, notes),
and inside it a `<fieldset>` labelled **Relationship** renders one radio card per `NINA_RELATIONSHIPS`
member. Only the second is a *list of characters you pick from*, only the second currently has five
members (so only the second is one short of 3x2), and *"add a new character: Instructor"* names a new
member of a list. Read as: **a sixth `NinaRelationship`.** Nothing else in the codebase is a countable
set of five that a sixth entry would square off.

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

`NINA_RELATIONSHIPS` is a five-member closed union — `nobody`, `casual_friend`, `sister`,
`best_friend`, `girlfriend` — documented as *"the five levels, in the order the user wrote them, which
is also least-to-most intimate."* Every level is a *personal* relation. The user wants a sixth that is
not on that axis at all: a **professional** one, where Nina is a coach and the conversation's purpose
is his running getting faster.

Three things follow, and they are the three phases:

1. The union gains a member, and every reader of that union gains an entry. There are eight code
   readers and four test readers, listed under Reference List. Two of them are `Record<NinaRelationship, …>`
   and will not compile without the entry — which is the property that makes this change safe.
2. She needs somewhere durable to put a schedule. `NINA_SLOT_KEYS` has `running_days` (parsed
   weekday names) and `goals` (prose) but nothing that holds *what he does on each of those days*. A
   schedule she proposes in a message and cannot store is a schedule she contradicts next week.
3. She needs to be told what to *say* about the numbers. The app already computes both of the user's
   named examples as named longitudinal patterns; what it does with them today is get *angry*.

**Success Criteria**

- `/admin/personality` shows six character cards, three across and two down, cells of equal height,
  at the widths the admin tool is actually used at.
- Selecting **Instructor** and saving produces a prompt in which she is a coach: professional register,
  running performance as the stated objective, and the coaching machinery of criteria 4 and 5 live.
- A schedule she sets up survives the conversation it was set up in, is visible and editable at
  `/admin/memory`, and is in front of her on every later turn.
- When `REPEATED_HIGH_AVG_HR` or `PACE_REGRESSION` fires under `instructor`, she says **what to do
  about it**, not just that it happened.
- The other five levels are byte-identical. `tests/__snapshots__/nina.prompts.test.ts.snap` is the
  gate, and it is not regenerated.

**Key Considerations**

- **`NINA_NOT_A_DOCTOR` is not on any dial and is not touched.** R3 asks her to advise on a *heart
  rate*, which raises the stakes of this guardrail rather than lowering them. An instructor telling
  him to run easier is coaching; an instructor telling him his heart rate is dangerous is a diagnosis.
  `persona.ts:403-407` already draws that line in those words and the instructor register sits inside
  it, not beside it.
- **The default must not move.** `NINA_DEFAULT_RELATIONSHIP` stays `best_friend`. A sixth option is an
  option; nobody who has never opened the panel gets a different Nina.
- **The snapshot is a trap for the careless.** `tests/nina.prompts.test.ts:220` iterates
  `RELATIONSHIPS`, skips `girlfriend`, and asserts `toHaveLength(4)`. A sixth member makes that 5 and
  fails on the length *before* it fails on the snapshot. The fix is to exclude `instructor` by name;
  regenerating the snapshot would silently discard the byte-identity invariant two plan sets are
  standing on.
- **Assumption, stated:** "instructor" is a *character*, not a *mode* — it is chosen on the same radio
  group as the other five and it is therefore mutually exclusive with them. The user put it in the
  same list ("add a new character"), and the geometry request ("3 columns x 2 rows") only makes sense
  if it is a sixth cell in that grid.
- **Assumption, stated:** "set up schedules" means a *training schedule* she authors and maintains in
  her own memory, not a calendar integration, not a push-notification scheduler, and not a new cron
  trigger. The app already has a scheduler (`lib/nina/proactive.ts`) and a durable slot mechanism
  (`NINA_SLOT_SPECS`); this reuses both. Nothing in the request asks for a new table and nothing here
  adds one.

---

## Analysis Scope

### Explicitly Mentioned Files

None.

### Discovered Related Files

Reached by following `NINA_RELATIONSHIPS` and `NinaRelationship` to every definition, consumer,
`Record<>` key set, test and comment:

- `lib/nina/tuning.ts` — the union, the default, the coercer, `NINA_ADDRESS`
- `lib/nina/persona.ts` — `NINA_RELATIONSHIP_BLOCKS`, `ninaIdentity`, `NINA_NOT_A_DOCTOR`, the anger ladder
- `lib/admin/tuningModel.ts` — `RELATIONSHIP_NOTE`, `relationshipCopy`
- `lib/nina/prompts/distill.ts` — `RELATIONSHIP_GLOSS`, and a hardcoded prose list of address forms
- `lib/nina/prompts/system.ts` — `buildContextGuide`, `angerSourceClause`
- `lib/nina/prompts/index.ts` — `NINA_PROMPT_VERSION`, `buildProactiveInstruction`, `PROACTIVE_INSTRUCTIONS`
- `components/admin/CharacterPanel.tsx` — the radio-card grid
- `lib/db/schema.ts` — the `nina_tuning.relationship` docstring, which spells the union out
- `lib/nina/memory.ts` — `NINA_SLOT_KEYS`, `NINA_SLOT_SPECS`
- `lib/admin/memoryVocab.ts` — `SLOT_LABELS`, refusal reasons, `buildMemoryRows`
- `lib/nina/patterns.ts` — `PATTERN_CODES`, `PATTERN_THRESHOLDS`
- `lib/nina/proactive.ts` — `PROACTIVE_PRIORITY`, `decideProactive`, the trigger block
- `lib/nina/context.ts` — `PATTERN_VALUE_FORMAT`, the payload projection
- `lib/admin/schema.ts` — `z.enum(NINA_RELATIONSHIPS)`
- Tests: `tests/nina.tuning.test.ts`, `tests/nina.prompts.test.ts`,
  `tests/admin.tuning.test.ts`, `tests/nina.memory.test.ts`, `tests/admin.memory.test.ts`
- `tests/__snapshots__/nina.prompts.test.ts.snap`

---

## Current Dataflow

### Entry Point A: the operator picks a character

**Location:** `components/admin/CharacterPanel.tsx:266`
**Trigger:** a click on one of the radio cards rendered by `NINA_RELATIONSHIPS.map(...)`
**Input Schema:** the radio's `value` is the union member, verbatim
**Validation:** none client-side; the draft is local state (`setDraft`)
**Next Step:** the one Save button calls `saveNinaTuningAction` at `lib/admin/tuningActions.ts:85`

The grid geometry is one class string at `CharacterPanel.tsx:264`:

```
grid gap-2 sm:grid-cols-2 xl:grid-cols-3
```

Five members therefore render **1 x 5** on a phone, **2 x 3** from `sm` (640 px), and **3 + 2** from
`xl` (1280 px) — the ragged shape R1 is about. Each card is a `<label>` with
`flex items-start gap-2 rounded-card bg-paper-2 p-3`, so a cell is exactly as tall as its own hint and
adjacent cells in a row do not match. `relationshipCopy(value)` (`lib/admin/tuningModel.ts:174`)
supplies `label` and `hint`, and the hint is `NINA_ADDRESS[value].words.join(', ')` followed by
`RELATIONSHIP_NOTE[value]` — two sources, so hint length varies by roughly a factor of three across
the five.

**A width fact that constrains R1.** `components/admin/AdminNav.tsx:99` is `fixed` bottom bar below
`lg` and `lg:sticky` in the grid's first column at and above it, so from 1024 px the nav *takes* a
column and the panel is narrower than the viewport. Three cards each carrying a label plus a
sentence, inside that narrowed column at exactly `lg`, is roughly 250 px per card. At `xl` it is
roughly 340 px. This is why the existing breakpoint is `xl` and not `lg`.

### Entry Point B: the Server Action writes the row

**Location:** `lib/admin/tuningActions.ts:85`
**Validation:** `lib/admin/schema.ts:465` — `relationship: z.enum(NINA_RELATIONSHIPS)`. The Zod enum
is built *from* the union, so a new member is accepted with no edit here. This is the load-bearing
property of the whole change: the vocabulary has one home.
**State Changes:** `nina_tuning.relationship`, an untyped `text` column
(`lib/db/schema.ts:1688`). Untyped on purpose — `coerceNinaRelationship` is where an unknown value
degrades, so a row written by an older deploy never throws.
**Exit Points:** `revalidatePath`, then `AdminTuningResult`

### Entry Point C: the row becomes prompt text

**Location:** `lib/nina/persona.ts:317`, inside `ninaIdentity(tuning)`

```
const spec = NINA_RELATIONSHIP_BLOCKS[ninaActiveRelationship(tuning)]
```

`ninaActiveRelationship` (`lib/nina/tuning.ts:674`) returns `NINA_DEFAULT_RELATIONSHIP` when the
`relationship` key is toggled off, so "excluded from the prompt" costs zero bytes — `best_friend`'s
blocks *are* the shipping text.

**Data Transformation:** `ninaIdentity` assembles five paragraphs:

1. `NINA_PREAMBLE` + `spec.identity.join(' ')` — the relationship's, and the only one that varies by level
2. `NINA_WHERE_SHE_LIVES` — fixed (27, Tebet, physiotherapist and strength coach)
3. `NINA_HOW_SHE_RUNS` — fixed (four times a week, 1:52 half PB)
4. `NINA_HUMOUR` + (`NINA_JOKES_ALLOWED` if `funny` is turned up else `NINA_NO_JOKES`)
5. `spec.history` — the relationship's

**Paragraph 2 is a gift to R2 and worth naming.** *"You work at a sports clinic as a physiotherapist
and strength coach, which is why you know what you know"* is already in the prompt at **every** level,
unconditionally. The professional knowledge R2 asks for is not a new claim about her — it is the
credential she has always had, promoted from background colour to the point of the conversation.

**Exit Points:** `buildNinaSystemPrompt(tuning)` composes `ninaIdentity` with the register blocks, the
numbers rules, `buildContextGuide`, the anger ladder and `NINA_NOT_A_DOCTOR`; `lib/nina/turn.ts` sends
it; `lib/nina/load.ts:292` stamps `NINA_PROMPT_VERSION` (currently **4**) on the row.

### Entry Point D: the distiller is told which relationship it is reading

**Location:** `lib/nina/prompts/distill.ts:79`, `buildDistillSystemPrompt(relationship)`
**Input:** `RELATIONSHIP_GLOSS[relationship]` — `as const satisfies Record<NinaRelationship, string>`,
so **this will not compile without an `instructor` entry.** One of the two compiler-enforced sites.

**A second, softer site in the same file.** `distill.ts:105` carries a *hardcoded prose list* of the
address forms — *"a full name, a nickname, "bro", "bestie", or "yang" / "sayang" / "beb" / "baby""* —
which the compiler cannot check. A sixth address form is invisible to the librarian unless this
sentence is edited, and the failure mode is quiet: it records Nina's coaching vocabulary as a fact
about him.

### Entry Point E: how "monitor his performance" already works

**Location:** `lib/nina/patterns.ts:481`, `evaluatePatterns(input)`

A closed union of five hand-authored longitudinal codes, thresholds exported as data, every threshold
strict, no formatting and no SQL in the file. **Two of the five are precisely the user's two named
examples:**

| Code | Line | What it is | R3 example it answers |
|---|---|---|---|
| `REPEATED_HIGH_AVG_HR` | `patterns.ts:307` | he kept running at a high average heart rate | *"reduce his average high heart rate during run"* |
| `PACE_REGRESSION` | `patterns.ts:418` | his pace is going the wrong way | *"increase his average running pace"* |
| `REPEATED_LATE_START` | `patterns.ts:268` | he kept starting late | — |
| `MISSED_USUAL_DAY` | `patterns.ts:353` | he skipped a day he usually runs | — |
| `ACWR_SPIKE` | `patterns.ts:465` | acute:chronic load ratio out of the sweet spot | — |

**So the monitoring R3 asks for is built, tested, and shipping.** What is missing is entirely on the
*output* side. Follow a fired pattern forward:

- `lib/nina/context.ts:569` projects it into the payload as `patterns[]` with a `nagLevel`
- `lib/nina/prompts/system.ts:247` describes that key to her, and the sentence it ends on is
  `angerSourceClause(tuning)` — *"This is where your anger comes from."*
- `lib/nina/persona.ts:862`'s ladder turns `nagLevel` into a rung, rung 4 being CAPS

A fired `REPEATED_HIGH_AVG_HR` today produces **"JANTUNG LO BAKAL PECAH TAH"** — the file's own
example. That is the best-friend response, it is deliberate, and it is exactly right for five of the
six levels. It is not what a professional coach does with the same number. **The gap R3 names is not
detection. It is that the only thing the app currently knows how to do with a detected pattern is
shout about it.**

### Entry Point F: proactivity

**Location:** `lib/nina/proactive.ts:628`

```
const proactive = `${buildProactiveInstruction(detail.kind, tuning)}\n\n${triggerBlock(detail)}`
```

Five reasons she opens a conversation, resolved to **one** per evaluation by `PROACTIVE_PRIORITY`
(`proactive.ts:74`), each with a durable idempotence marker keyed on the Jakarta calendar day. The
module's own header states the property that matters: *"Firing 'jadi ga lari selasa ini?' twice on one
Tuesday is the exact failure that makes her feel like a cron job instead of a friend."*
`buildProactiveInstruction` already takes `tuning` and already appends a tuning-dependent suffix, so
the seam for a relationship-dependent opener exists and is in use.

### Data Persistence

**Database — the tuning:** `nina_tuning`, one row per user, `relationship` an untyped `text`,
`revision` bumped on every write. No migration is needed for a sixth member: the column is `text` and
the domain lives in TypeScript.

**Database — the memory:** `nina_memory_slots` (upserted, one row per key) and `nina_memory_facts`
(the append-only ledger). `NINA_SLOT_KEYS` is **nine** members; `NINA_SLOT_SPECS` gives each a
`policy` (`replace` | `merge`), a `category`, a `canonicalise` that may refuse the write by returning
`null`, and a one-line `prompt` that is the whole spec the distiller gets.

**The two slots adjacent to "schedule", and the hole between them:**

| Slot | Policy | Stores | Why it is not a schedule |
|---|---|---|---|
| `running_days` | replace | `"Selasa, Kamis, Sabtu, Minggu"` — canonicalised through `formatRunningDays(parseRunningDays(raw))` so it always parses back | *Which* days, never *what* he does on them. Text that does not parse is refused to a ledger fact instead |
| `goals` | replace | up to 240 chars of prose, *"what he is training FOR right now"* | The destination, not the route |

`parseRunningDays` is what makes the evening cron's *"jadi ga lari selasa ini?"* possible from the slot
alone (`memory.ts:698`), and `MISSED_USUAL_DAY` reads the same field. **So a schedule stored as
`running_days` would be monitored automatically — but `running_days` cannot hold a session, only a
weekday.** That is the hole R3's "set up schedules" falls into.

**Nothing hardcodes the slot list.** `distill.ts:27` renders the vocabulary from `NINA_SLOT_SPECS`
(*"One list, so a tenth slot needs no edit here"* — the file says so in as many words) and
`memoryVocab.ts:220` builds the admin rows by filtering `NINA_SLOT_KEYS`. A tenth slot is one spec
entry, one `SLOT_LABELS` entry, and two test counts.

**One comment to correct rather than ignore.** `lib/nina/tuning.ts:44` asserts *"`NINA_SLOT_KEYS`
stays at nine."* Read in context it is an argument that *the tuning* does not belong in a slot — the
reasons given are that the distiller would overwrite it and that `buildSlotCards` would render fifteen
integers as prose. Neither reason bears on a prose training plan, and `distill.ts:24` anticipates a
tenth slot by name. The sentence is a conclusion about one candidate, not a cap; it needs rewording so
a later reader does not mistake it for a prohibition.

### Exit Points

- The panel: `revalidatePath` re-renders the page with the canonical row; the draft follows `revision`
- Her turn: the assembled system prompt, sent by `lib/nina/turn.ts`
- The distiller: `slotKey` writes, gated by `canonicalise`, or a ledger fact when refused
- The cron: at most one proactive message per user per evaluation, with a durable day marker

---

## Key Data Structures

### `NINA_RELATIONSHIPS` / `NinaRelationship`

**Location:** `lib/nina/tuning.ts:321-329`

```ts
export const NINA_RELATIONSHIPS = [
  'nobody', 'casual_friend', 'sister', 'best_friend', 'girlfriend',
] as const
export type NinaRelationship = (typeof NINA_RELATIONSHIPS)[number]
```

**Documented order:** least-to-most intimate, *"in the order the user wrote them."*
**Used In:** `isNinaRelationship`, `coerceNinaRelationship`, `NINA_ADDRESS` (a `Record` over it),
`NINA_RELATIONSHIP_BLOCKS` (a `Record` over it), `RELATIONSHIP_GLOSS` (`satisfies` a `Record` over
it), `lib/admin/schema.ts:465` (`z.enum`), `CharacterPanel.tsx:266` (the grid), and five test files.

**Where a sixth member goes, and why it is a real question.** The array's documented order *is* an
axis, and `instructor` is not on it — a coach is not "more intimate than a girlfriend" or "less
intimate than nobody." Appending is the answer this plan takes; the Decisions table in the plan index
records it with its reason.

### `NinaAddressVocabulary`

**Location:** `lib/nina/tuning.ts:373-388`
**Fields:** `relationship`, `label`, `source` (`'full_name' | 'nickname' | 'literal'`), `words`,
`addressRule`, `addressFallback`
**The invariant on it:** *"Every level still states a fallback, and `addressFallback` is therefore
`string` and never null"* — all five rules lean on a nullable `RunnerFacts` field somewhere, and *"a
prompt that tells her to use a field that is not there teaches her to invent one."* A sixth entry must
state a fallback whatever its `source`.
**Asserted by:** `tests/nina.tuning.test.ts:188` (a non-empty fallback on every level),
`tests/nina.tuning.test.ts:200` (label, source, address rule, and **no `stance` field** — one
relationship, one description of it, and the second half lives in `persona.ts`).

### `NinaRelationshipSpec`

**Location:** `lib/nina/persona.ts:185-190`
**Fields:** `relationship`, `identity` (an **array of sentences**), `history` (one string)
**Why an array:** so `best_friend`'s entry can be exactly the two sentences that shipped while
`girlfriend`'s is eight, *"with no entry being a special case and no `if` anywhere."*
**The constraint on `best_friend`:** its two `identity` sentences and its `history` **are** today's
`NINA_IDENTITY`, character for character. The file says *"Do not improve them."*

### `PatternCode` and `PATTERN_THRESHOLDS`

**Location:** `lib/nina/patterns.ts:48`, `:130`
Five codes, `PATTERN_WINDOW` and `PATTERN_THRESHOLDS` exported as data so a reader can check a
threshold without reading control flow. The file's rule: *"A model free to coin `OVERTRAINING_RISK`
is a model making a medical-adjacent claim nobody wrote, tested, or can reproduce."* Any coaching
prescription must therefore hang off an **existing** code, not a new one.

### `NINA_SLOT_SPECS`

**Location:** `lib/nina/memory.ts:681`
**Fields per slot:** `key`, `policy`, `category`, `canonicalise`, `prompt`
**The composition rule, from `running_days`' own comment:** parse first, then render the canonical
form, *"so the stored string is always something `parseRunningDays` can read back"* — and text that
does not parse yields `null` and becomes a ledger fact *"instead of a slot the cron would act on
wrongly."*

### `NINA_NOT_A_DOCTOR`

**Location:** `lib/nina/persona.ts:403-407`

> You are not his doctor and you never diagnose. You can be as dramatic as you like in your own
> voice — "JANTUNG LO BAKAL PECAH TAH" is you being his friend, and he knows it. What you never do is
> name a condition, tell him he has one, or present one of his numbers as clinically dangerous as
> though a clinician had said so. If something in the numbers genuinely warrants a professional, say
> so once, plainly, in one line, and then drop it. Once. Never twice in the same conversation.

**On no dial, in nobody's scope, and load-bearing for R3.** `persona.ts:1016` records the ruling that
kept it and kept `'the name of a medical condition'` in `NEVER_SAY` through a plan set whose stated
iron rule was to repeal rules: *"No dial in R1 asks her to diagnose him"*, and `lib/llm/facts.ts`
records *a measured failure — a flipped sign on an aerobic-decoupling calculation* — as the reason the
arithmetic rules exist. R3 does ask her to advise on a heart rate, so this analysis states the reading
plainly: **the instructor prescribes training, never physiology.** "Run your easy days easier and hold
this pace for six weeks" is coaching. "Your heart rate indicates a problem" is the sentence this
guardrail exists to prevent, and it stays prevented at every level including this one.

---

## Dependencies

### Configuration / Environment

None new. No env var, no feature flag, no config key.

### Database

**No migration.** `nina_tuning.relationship` is `text`; `nina_memory_slots` is keyed by a `text` slot
key. Both domains are enforced in TypeScript (`coerceNinaRelationship`, `isNinaSlotKey`) precisely so
that widening one is a code change. `lib/db/schema.ts:1685`'s docstring spells the five-member union
out in prose and is therefore a **documentation** site that goes stale silently.

### External Services

The model, through `lib/nina/turn.ts`. No new provider, no new tool, no schema change to
`lib/nina/prompts/tools.ts` — the instructor uses the tools Nina already has (`lookup_runs`, the
memory writes on `SEND_TOOL`).

### Test-time

`vitest`. `tests/__snapshots__/nina.prompts.test.ts.snap` was generated from a tree *before* the
girlfriend register landed and is deliberately frozen; `vitest -u` is how the invariant it guards gets
lost.

---

## Reference List

Every site that touches `NinaRelationship`, plus the slot and pattern sites R3 reaches. **Compiler**
marks a site that fails to typecheck without an `instructor` entry — the change's own safety net.

| Symbol / key | File:line | Kind | Enforced by |
|---|---|---|---|
| `NINA_RELATIONSHIPS` | `lib/nina/tuning.ts:321` | def | — |
| `NinaRelationship` | `lib/nina/tuning.ts:329` | def (derived) | — |
| `NINA_DEFAULT_RELATIONSHIP` | `lib/nina/tuning.ts:332` | def — stays `best_friend` | — |
| `isNinaRelationship` / `coerceNinaRelationship` | `lib/nina/tuning.ts:334`, `:339` | def — no edit, reads the array | — |
| `NINA_ADDRESS` | `lib/nina/tuning.ts:391` | **def, `Record<NinaRelationship, …>`** | **Compiler** |
| `ninaActiveRelationship` | `lib/nina/tuning.ts:674` | def — no edit | — |
| `NINA_SLOT_KEYS` "stays at nine" | `lib/nina/tuning.ts:44` | doc — stale under phase 2 | — |
| `NINA_RELATIONSHIP_BLOCKS` | `lib/nina/persona.ts:206` | **def, `Record<NinaRelationship, …>`** | **Compiler** |
| `ninaIdentity` | `lib/nina/persona.ts:317` | call — no edit, indexes the record | — |
| `NINA_NOT_A_DOCTOR` | `lib/nina/persona.ts:403` | def — **not touched** | — |
| `ANGER_FLOOR_BY_BAND` / `ANGER_CEILING_BY_BAND` | `lib/nina/persona.ts:862`, `:877` | def — **not touched** | — |
| `RELATIONSHIP_NOTE` | `lib/admin/tuningModel.ts:166` | def, `Record<string, string>` — **not** compiler-checked | `tests/admin.tuning.test.ts:105` |
| `relationshipCopy` | `lib/admin/tuningModel.ts:174` | def — no edit | — |
| `RELATIONSHIP_GLOSS` | `lib/nina/prompts/distill.ts:44` | **def, `satisfies Record<NinaRelationship, string>`** | **Compiler** |
| the address-forms prose list | `lib/nina/prompts/distill.ts:105` | prose — invisible to the compiler | — |
| `buildContextGuide` `"patterns"` para | `lib/nina/prompts/system.ts:247` | def | — |
| `angerSourceClause` | `lib/nina/prompts/system.ts:222` | def | — |
| `NINA_PROMPT_VERSION` | `lib/nina/prompts/index.ts:36` | def — currently `4` | — |
| `buildProactiveInstruction` / `PROACTIVE_INSTRUCTIONS` | `lib/nina/prompts/index.ts:21-22` | def — the tuning-suffix seam | — |
| `z.enum(NINA_RELATIONSHIPS)` | `lib/admin/schema.ts:465` | config — **no edit**, built from the array | — |
| the relationship radio grid | `components/admin/CharacterPanel.tsx:264-266` | impl — R1's one class string | — |
| `nina_tuning.relationship` docstring | `lib/db/schema.ts:1685` | doc — spells the union out | — |
| `NINA_SLOT_KEYS` / `NINA_SLOT_SPECS` | `lib/nina/memory.ts:634`, `:681` | def — R3's schedule slot | — |
| `SLOT_LABELS` | `lib/admin/memoryVocab.ts:24` | **def, `Record<NinaSlotKey, string>`** | **Compiler** |
| slot refusal reasons | `lib/admin/memoryVocab.ts:37` | def | — |
| `buildMemoryRows` | `lib/admin/memoryVocab.ts:220` | call — no edit, filters the array | — |
| `SLOT_VOCABULARY_BLOCK` | `lib/nina/prompts/distill.ts:27` | call — no edit, renders from the specs | — |
| `PATTERN_CODES` | `lib/nina/patterns.ts:56` | def — **not extended** | — |
| `REPEATED_HIGH_AVG_HR` | `lib/nina/patterns.ts:307` | impl — R3's first example, already computed | — |
| `PACE_REGRESSION` | `lib/nina/patterns.ts:418` | impl — R3's second example, already computed | — |
| `PROACTIVE_PRIORITY` / `decideProactive` | `lib/nina/proactive.ts:74`, `:~600` | impl — **not extended** | — |
| relationship-order assertion | `tests/nina.tuning.test.ts:159` | test — exact array | — |
| address-form assertions | `tests/nina.tuning.test.ts:172-228` | test — per level | — |
| the four-render snapshot guard | `tests/nina.prompts.test.ts:220-228` | **test — `toHaveLength(4)` + snapshot** | — |
| the address-token record | `tests/nina.prompts.test.ts:520` | **test, `Record<NinaRelationship, string>`** | **Compiler** |
| the relationship matrix | `tests/nina.prompts.test.ts:222`, `:501`, `:510`, `:621`, `:760` | test — iterates, counts distinctness | — |
| relationship-off-is-default | `tests/nina.prompts.test.ts:869` | test — iterates all levels | — |
| `toHaveLength(5)` | `tests/admin.tuning.test.ts:105` | test — the count | — |
| `toHaveLength(9)` | `tests/nina.memory.test.ts:40` | test — the slot count | — |
| slot-kind sweep | `tests/admin.memory.test.ts:29`, `:92` | test — iterates the slots | — |
| the frozen snapshot | `tests/__snapshots__/nina.prompts.test.ts.snap:3` | test data — **never regenerated** | — |

**Two properties of this list worth stating.** Four sites are `Record<NinaRelationship, …>` or
`satisfies` one, so the build fails until each is filled — the change cannot be half-done in code. And
four sites are *prose* (`RELATIONSHIP_NOTE`, `distill.ts:105`, `db/schema.ts:1685`, `tuning.ts:44`)
where the compiler says nothing and the failure is silent; those are the ones a phase plan has to name
explicitly, and they are named above.

---

## Impact Points (files that WILL need changes)

**Phase 1 — the sixth character (R1, R2)**

1. `lib/nina/tuning.ts` — append `'instructor'`; add `NINA_ADDRESS.instructor`; reword the
   "stays at nine" sentence so phase 2 does not read it as a prohibition
2. `lib/nina/persona.ts` — `NINA_RELATIONSHIP_BLOCKS.instructor` (`identity` + `history`)
3. `lib/admin/tuningModel.ts` — `RELATIONSHIP_NOTE.instructor`
4. `lib/nina/prompts/distill.ts` — `RELATIONSHIP_GLOSS.instructor`, and the prose list at `:105`
5. `lib/db/schema.ts` — the union in the `relationship` docstring
6. `components/admin/CharacterPanel.tsx` — R1: equal-height cells in the 3x2 grid
7. `tests/nina.tuning.test.ts` — the exact array, and the per-level address assertions
8. `tests/admin.tuning.test.ts` — `toHaveLength(5)` becomes 6
9. `tests/nina.prompts.test.ts` — the token record; **and exclude `instructor` from the
   four-render snapshot guard by name, keeping `toHaveLength(4)` true of the four it is about**

**Phase 2 — a schedule she can keep (R3)**

10. `lib/nina/memory.ts` — a tenth slot for the training plan, with its `canonicalise` and `prompt`
11. `lib/admin/memoryVocab.ts` — its `SLOT_LABELS` entry and its refusal reason
12. `lib/nina/prompts/system.ts` — the `memory.slots` paragraph of `buildContextGuide`
13. `tests/nina.memory.test.ts` — `toHaveLength(9)` becomes 10, plus canonicalisation cases
14. `tests/admin.memory.test.ts` — the slot-kind sweep picks the new key up

**Phase 3 — the coaching register and the insight path (R3)**

15. `lib/nina/persona.ts` — the instructor's coaching block: what she does with `patterns`,
    `recentRuns` and `records`, gated on the relationship
16. `lib/nina/prompts/system.ts` — the `"patterns"` paragraph, so a fired code under `instructor`
    reads as something to prescribe against rather than only as a source of anger
17. `lib/nina/prompts/index.ts` — the proactive suffix, and `NINA_PROMPT_VERSION` 4 -> 5
18. `tests/nina.prompts.test.ts` — the instructor register: present under `instructor`, absent
    under all five others, and the frozen snapshot still passing

**Files deliberately NOT in this list**

`lib/nina/patterns.ts` (no new code — the two the user named already exist),
`lib/nina/proactive.ts` (no new trigger, no new table, the five openers are enough),
`lib/nina/context.ts` (off-limits by the standing invariant),
`lib/admin/schema.ts` (the Zod enum reads the array),
`drizzle/` (no migration),
`lib/nina/prompts/tools.ts` (no schema change).

**This document describes. The plan files prescribe.**
