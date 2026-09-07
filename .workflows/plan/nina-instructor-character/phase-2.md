# Phase 2: A schedule she can keep

**Plan set:** `NINA_INSTRUCTOR_CHARACTER_PLAN.md`
**Analysis:** `20260907-075444-INST_code_analyzer.md`
**Satisfies:** R3 — the *"she will set up schedules"* half: a training week she authors survives the
conversation it was authored in, is editable at `/admin/memory`, and is in front of her every turn.
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina` (with two reader files in `lib/admin`)

---

## Goal

`NINA_SLOT_KEYS` gains a tenth member, **`training_plan`**, holding *what he does on each day* —
the hole between `running_days` (which days) and `goals` (what he is training for). After this
phase the distiller has a one-line spec for it rendered from `NINA_SLOT_SPECS` with nothing
retyped, `/admin/memory` shows it as a labelled editable row with its own refusal sentence, and
`lib/nina/context.ts` pre-injects its value into `memory.slots` on every turn at **every**
relationship level, with no relationship named anywhere in the diff.

Nothing in this phase gates on the relationship and nothing in it edits a prompt string Nina
herself reads. That second half is a **decision, not an omission** — see P2-D4 below. **It has been
ratified by the reconciler and the plan index has been corrected to match it**, so there is nothing
here left to accept or decline: `lib/nina/prompts/system.ts` is not this phase's file.

---

## Design calls, made concretely

### P2-D1 — the key is `training_plan`

`snake_case`, two words, in the vocabulary of the nine (`running_days`, `work_hours`,
`food_likes`, `pending_promises`).

- **Not a synonym of `running_days`** (`memory.ts:698`), whose docstring and canonicaliser are
  about *weekdays* and whose stored value must parse back for the evening cron. `running_days`
  answers *when*; `training_plan` answers *what he does then*.
- **Not a synonym of `goals`** (`memory.ts:727`, `prompt`: *"what he is training FOR right
  now"*). `goals` is the destination; `training_plan` is the route. The analysis puts it in exactly
  those words ("The destination, not the route").
- **`training_schedule` was considered and rejected.** "Schedule" invites the calendar reading that
  the index's D3 rules out explicitly ("Not a calendar integration, not a notification
  scheduler"), and it reads one synonym closer to `running_days`. "Plan" is the word D3 itself
  uses: *"A training plan she authors."*

**Position in the array: index 3, immediately after `running_days`.** The array's documented order
is *"the order they are described to the distiller and the order `/admin/memory` will naturally
show them in"*, so the two keys a writer could confuse sit adjacent in both places — "which days"
immediately followed by "what he does on them". Nothing reads a slot key by index: `distill.ts:156`
spreads the array into a tool enum (order only), `memoryVocab.ts:220` filters it, and every test
uses `toContain` / `toHaveLength` rather than an exact array (checked: no `toEqual([...])` over
`NINA_SLOT_KEYS` exists anywhere). `pending_promises` stays last.

### P2-D2 — `policy: 'replace'`

Two reasons, either sufficient.

1. **The docstring's own reason.** `SlotWritePolicy` (`memory.ts:652-658`) says `'merge'` exists
   for `pending_promises` alone, because *"a merge cannot discard, so it needs no admin
   exception."* A training week that changes is **superseded**, not accumulated: when she moves his
   Wednesday session, last week's Wednesday is wrong, not additional. A slot that cannot discard
   would silently keep both and hand her a contradictory plan — the exact failure D3 names ("a
   schedule she states in a message and cannot store is one she contradicts next week"), arrived at
   from the other direction.
2. **The mechanical one.** `slotEditKind` (`memoryVocab.ts:80-83`) derives `'structured'` from
   `policy === 'merge'`, and `buildMemoryRows` (`memoryVocab.ts:220-222`) *excludes* structured keys
   from the row list — its entries become the rows instead. A `merge` policy would therefore make
   the slot invisible and uneditable at `/admin/memory`, failing this phase's own exit criterion.
   `proposeSlot` (`memory.ts:1130-1133`) also demotes every non-`replace` slot write outright, so
   `merge` would additionally make it unwritable by Nina.

### P2-D3 — `canonicalise` is prose, capped at 400. It is NOT parsed.

`running_days` composes `formatRunningDays(parseRunningDays(raw))` and its comment states why:
the evening cron and `MISSED_USUAL_DAY` read that slot *through the parser*, so a value that does
not parse is refused to a ledger fact "instead of a slot the cron would act on wrongly." **That
argument is about a reader.** For `training_plan` there is none:

- Nothing in this set adds one. `lib/nina/patterns.ts` gains no code (index Scope), `proactive.ts`
  gains no trigger (D5), `context.ts` is off-limits and already passes slot `key`/`value` through
  verbatim (`context.ts:670-678` — no allowlist, no truncation).
- Phase 3 only **names** the slot in prompt prose (index, Phase 3 "Does not touch").

So a parser here would have no consumer, and it would have a cost the moment it existed: every
legitimate plan phrasing it failed to read would be refused to the ledger, which is a plan the app
*lost* in exchange for a guarantee nothing uses. `goals` is the precedent — prose, capped, no
parser — and it is the neighbour this slot most resembles in shape.

**What prose costs, stated:** no code can act on the value. There is no "did he do Wednesday's
tempo?" check, no cron reads it, and the admin refusal sentence can only ever say "not empty",
because that is the only thing `prose()` refuses. If a later set wants a reader, it must write the
parser then, and it inherits rows whose text may not parse — the honest migration is
"canonicalise on next write, treat unparseable existing values as prose", not a backfill.

**The cap is 400 and that number is not arbitrary.** Both writers are already capped at 400:
`NinaMemoryWriteSchema.text` (`lib/nina/schema.ts:53`) for her own `save_memory` /
`SEND_TOOL.memoryWrites` path, and `ADMIN_SLOT_VALUE_MAX` (`lib/admin/memoryModel.ts:26`) for the
admin, which `canonicaliseSlotValue` slices to before calling `canonicalise`. At 400 the slice in
`prose()` can therefore never truncate a legal write — it is a floor-to-ceiling match rather than a
second, tighter opinion. 240 (`goals`) would silently cut a five-session week.

Whitespace collapse is inherited from `prose()` and is wanted: a multi-line plan becomes one line,
which is what keeps `/admin/memory`'s single-line input honest and what keeps the JSON payload she
reads on one row.

### P2-D4 — `lib/nina/prompts/system.ts` is NOT edited in this phase

**SETTLED. Ratified by the reconciler as decision D6's neighbour and recorded in the plan index's
Reconciliation Log; the index's phase-2 "Owns", "Does not touch" and "Exit criteria" have all been
corrected to match. This section is now the RECORD of a closed decision, not a request for one.**
The `memory.slots` paragraph of `buildContextGuide` is **no phase's** in this set — it stays
byte-identical — and the slot's prose naming moved to phase 3's already-gated instructor block,
which spells `training_plan` at zero default-render cost. The reason is invariant 1, below.

The draft index had assigned me "the `memory.slots` paragraph of `buildContextGuide`". I checked what
the frozen snapshot covers before writing a character of it, as instructed:

- `tests/nina.prompts.test.ts:220-228` renders `buildNinaSystemPrompt(withRelationship(rel))` for
  every relationship except `girlfriend` and snapshots the **whole prompt string** for each.
  (Reconciler's independent re-verification: the file holds exactly **one** `exports[...]` entry,
  `git log --follow` on it returns exactly **one** commit, and the `memory.slots` paragraph appears
  verbatim at lines **155, 328, 501 and 674** — all four of this phase's claims hold.)
- `buildNinaSystemPrompt` composes `buildContextGuide`, so the context guide is inside the
  snapshot. Verified literally: the `memory.slots` paragraph appears at
  `tests/__snapshots__/nina.prompts.test.ts.snap:155`, `:328`, `:501` and `:674` — once per render.
- `git log --follow` on that file shows exactly one commit (`157b8f4`): it has never been
  regenerated or hand-edited since it was created.

So an **unconditional** byte added to that paragraph fails the snapshot four times. The available
responses are:

| Response | Verdict |
|---|---|
| `vitest -u` | Forbidden by the set (invariant 1, in as many words). |
| Hand-edit the four snapshot blocks | The same violation with extra steps — invariant 1 is "the five existing levels render **byte for byte**", not "the file is only regenerated by hand". |
| Gate the clause on the relationship | Forbidden by *this phase's* hard constraint: the slot must not reference `instructor` or any relationship. |
| Gate the clause on a dial | Worse: a Nina whose dial is down would not be told about her own slot, and the choice of dial would be arbitrary. |
| **Do not add the bytes.** | **Chosen.** |

**And the feature does not need them.** The guide's `memory.slots` paragraph describes what the
JSON *section* is and uses `running_days` as its one illustration; **eight of the nine slots are
already unnamed there** — `work_hours`, `goals`, `injuries`, `food_likes`, `gear`, `nickname`,
`name`, `pending_promises`. A tenth slot going unnamed in the guide is the file's existing
convention, not a gap this phase leaves. What actually teaches the vocabulary is:

1. **the distiller**, which gets the exact key names in `SLOT_VOCABULARY_BLOCK` (`distill.ts:27`,
   rendered from `NINA_SLOT_SPECS` — the zero-edit path, see Step 0), and which is the writer that
   can create the first row from *his own words*; and
2. **the payload**, which shows Nina the key and its value on every later turn once a row exists
   (`context.ts:670`), which is how she learns every other slot key she uses.

**The handoff this creates is real, and the reconciler has closed it:** until a `training_plan` row
exists, Nina's own `slotKey` field is free text (`tools.ts:112` — *"e.g. usual_running_days"*, and
`lib/nina/schema.ts:52` accepts any string), so she cannot reliably guess the key. **Phase 3 now
names the key** — `"training_plan"` is spelled inside `INSTRUCTOR_COACHING`, which is `''` at the
other five levels, so the key reaches her at zero default-render bytes and the frozen snapshot never
sees it (reconciliation decision **D7**). Appendix A carries the exact paragraph edit I did **not**
apply, kept only as a record; it is not an instruction to anyone.

### P2-D5 — the `prompt` line

One line, verbatim, into `SLOT_VOCABULARY_BLOCK`. It has to do three jobs: keep the writer off
`running_days`, keep it off `goals`, and separate *he agreed* from *she suggested*:

```
training_plan — the training week he AGREED to: what he does on each day, like "Senin easy 5k, Rabu interval 6x400, Sabtu tempo 8k, Minggu long run 15k". Only when he agrees to it or states it himself, and the quote is his own agreement — a plan he never answered is not one. Which days he runs is running_days; what he is training FOR is goals.
```

The "he agreed" rule is not only prose: on the distiller path it is **enforced**. `proposeSlot`
(`memory.ts:1134-1146`) demotes any slot write whose `quote` does not verify against *his* message
and any whose confidence is under `SLOT_CONFIDENCE_FLOOR` (80). So a plan she proposed into the
void has no quotable span of his to hang on and degrades to a ledger fact, which is exactly the
behaviour the line describes. Her own `memoryWrites` path (`memory.ts:1151-1158`,
`verified: true`) is the one that trusts her, and that is the path phase 3's coaching register
will use once she knows the key.

---

## Interface Contract

**Deletes:** none.
**Renames:** none.
**Creates:**
- `NINA_SLOT_KEYS` member `'training_plan'` at **index 3**, immediately after `'running_days'`
  (`lib/nina/memory.ts:634-644`) — widens the exported `NinaSlotKey` union
- `NINA_SLOT_SPECS.training_plan` (`lib/nina/memory.ts`, inserted after the `running_days` entry
  which ends at `:715`): `policy: 'replace'`, `category: 'training'`, `canonicalise:
  (raw) => prose(raw, 400)`, `prompt` as quoted in P2-D5
- `SLOT_LABELS.training_plan = 'Training plan'` (`lib/admin/memoryVocab.ts:24-34`)
- `SLOT_REFUSALS.training_plan` (`lib/admin/memoryVocab.ts:45-60`)

**Signature changes:** none. `NinaSlotKey` gains a member, so both
`Readonly<Record<NinaSlotKey, …>>` sites (`SLOT_LABELS`, `SLOT_REFUSALS`) are **compiler-enforced**
and cannot be half-done.

**Consumers that pick the key up with no edit** (verified by reading each): `distill.ts:27`
`SLOT_VOCABULARY_BLOCK`, `distill.ts:156` the tool enum, `memoryVocab.ts:220` `buildMemoryRows`,
`memoryVocab.ts:80/89/94/111` the four readers, `memory.ts:1129` `proposeSlot`,
`context.ts:670` the payload projection, `lib/admin/schema.ts:108` `slotKeySchema`,
`tests/admin.memory.test.ts:29` and `:92` (both derived from `NINA_SLOT_KEYS`).

**Requires (from earlier phases):** nothing. This phase gates on nothing and runs concurrently with
phase 1.

**Requires of OTHER phases — both checked and CLOSED by the reconciler:**
- **Phase 1 rewords `lib/nina/tuning.ts:44`** (*"`NINA_SLOT_KEYS` stays at nine"*), which this phase
  makes false and does not edit. **Confirmed present**: phase 1's Step 7a replaces that comment with
  one that keeps its actual argument (*the tuning* does not belong in a slot) and drops the cap
  reading in as many words — *"how many keys `lib/nina/memory.ts` declares is that file's decision
  and not a rule this comment gets to make."* Nothing left to reassign.
- **`NINA_DISTILL_PROMPT_VERSION` `2` -> `3` is PHASE 1'S, and this phase must not bump it**
  (reconciliation decision **D6**). This phase does change the rendered librarian prompt — one more
  `SLOT_VOCABULARY_BLOCK` line, one more `slotKey` tool-enum member — but it changes it *indirectly*
  and never opens `lib/nina/prompts/distill.ts`. Phase 1 edits that file's bytes anyway and now owns
  the single bump; its changelog paragraph names this phase's slot explicitly, so one bump covers
  both edits. **Do not add a bump here even if you notice the drift** — two phases writing one
  hand-maintained integer is the collision, and phases 1 and 2 run concurrently so "whoever lands
  last" cannot be resolved at run time. Nothing asserts the value in tests (checked).

**Leaves alone (owned by others / off-limits):**
- `lib/nina/prompts/system.ts` — **entirely** (P2-D4, ratified). Phase 3 is the **only** phase in
  this set that edits this file: it owns the `"patterns"` paragraph, the `WHAT YOU ARE READING`
  block and `proactiveTuningSuffix`, and it now also owns the gated prose naming of this slot. The
  `memory.slots` paragraph at `:235` is nobody's and stays byte-identical.
- `lib/nina/prompts/distill.ts` — no edit needed and none made (Step 0). **Including its version
  constant**: the `2` -> `3` bump is phase 1's (D6).
- `lib/nina/prompts/index.ts`, `NINA_PROMPT_VERSION` — phase 3.
- Everything relationship-shaped: `NINA_RELATIONSHIPS`, `NINA_ADDRESS`,
  `NINA_RELATIONSHIP_BLOCKS`, `RELATIONSHIP_NOTE`, `RELATIONSHIP_GLOSS`, `CharacterPanel.tsx`,
  `lib/admin/tuningModel.ts`, `lib/nina/persona.ts` — phase 1 and phase 3. The string
  `instructor` does not appear in this phase's diff.
- `running_days` and `goals` — spec, canonicaliser and `prompt` all byte-identical after this
  phase. `parseRunningDays` / `formatRunningDays` / `parseRunningDaysAsJsWeekday` untouched, so
  `MISSED_USUAL_DAY`, `proactive.ts:542` and `gateway.ts:74` keep the path they have.
- `lib/nina/context.ts`, `lib/nina/patterns.ts`, `lib/nina/proactive.ts`,
  `lib/nina/prompts/tools.ts`, `lib/db/schema.ts`, `drizzle/`.

**What phase 3 may say about this slot in prompt prose** (the contract it can code against):

- the key is spelled **`training_plan`**, exactly;
- it holds *what he does on each day of his training week*, as one line of prose, at most 400
  characters, whitespace already collapsed;
- it is a `replace` slot: writing it **supersedes** the previous plan wholesale, and the previous
  value survives only as a `nina_memory_facts` row of category `training`;
- it is available at every relationship level and phase 3 must not imply it is the instructor's
  private field;
- nothing in the app parses or checks it, so phase 3's prose must not promise that the app will
  notice a missed session — she notices, from `recentRuns` and `patterns`, and that is phase 3's
  own machinery;
- she writes it herself via `memoryWrites` / `save_memory` with `kind: 'slot'`,
  `slotKey: 'training_plan'`, `text` = the plan; and phase 3's gated prose is the only place that
  key name can reach her in the system prompt, because P2-D4 leaves `buildContextGuide` unedited.

**File count: 6.** (The draft index said 5; the reconciler has corrected the Phases table.)
`system.ts` is out (P2-D4), and `lib/admin/memoryModel.ts` + `lib/admin/schema.ts` are in for
**comment text only** (Step 6 — sentences that my own change makes false; zero behaviour, zero
exported symbol). Phase 1's "Leaves alone" list has been corrected so that `lib/admin/schema.ts`
stays out of *its* diff, making this phase that file's sole owner in the set.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/memory.ts` | modify | §5 banner + `NINA_SLOT_KEYS` docstring say ten; `'training_plan'` inserted at index 3; the `NINA_SLOT_SPECS.training_plan` entry |
| `lib/admin/memoryVocab.ts` | modify | `SLOT_LABELS.training_plan`, `SLOT_REFUSALS.training_plan`, and the three "nine keys" prose counts |
| `lib/admin/memoryModel.ts` | modify | comment only: `SlotEditKind`'s "eight prose/scalar slots" and "outside phase 5's nine" |
| `lib/admin/schema.ts` | modify | comment only: `slotKeySchema`'s "phase 5's nine" |
| `tests/nina.memory.test.ts` | modify | `toHaveLength(9)` -> `10`; a new describe for the slot: policy, category, stores, caps, refuses, and the `running_days` contrast |
| `tests/admin.memory.test.ts` | modify | an accept case and a refusal case through `canonicaliseSlotValue`, `slotEditKind('training_plan')`, and one test title that counts to nine |

`lib/nina/prompts/system.ts` — **no change** (P2-D4).
`tests/__snapshots__/nina.prompts.test.ts.snap` — **no change**, and that is the point.

---

## Implementation Steps

### Step 0: confirm the two zero-edit claims before writing anything

**Files:** `lib/nina/prompts/distill.ts:24-29`, `lib/admin/memoryVocab.ts:220-222`
**Change:** none. Read them and confirm the claim each makes is still true:

```ts
/**
 * The vocabulary, rendered from `NINA_SLOT_SPECS` rather than retyped. One list, so a tenth slot
 * key is a one-line edit to `memory.ts` and the prompt follows it.
 */
export const SLOT_VOCABULARY_BLOCK = NINA_SLOT_KEYS.map(
  (key) => `- ${NINA_SLOT_SPECS[key].prompt}`,
).join('\n')
```

It is true as of this reading: the block is a `map` over `NINA_SLOT_KEYS`, and `distill.ts:156`
spreads the same array into the tool enum. **Do not edit `distill.ts`.**
**Impact:** none — this step exists so the implementer does not "helpfully" add a line there.

### Step 1: the §5 banner and the `NINA_SLOT_KEYS` docstring stop saying nine

**File:** `lib/nina/memory.ts:622-633`
**Change:** the count in the section banner, and one added sentence in the docstring recording what
the tenth key is for. Replace lines 622-633 with:

```ts
/* ============================================================================
 * §5 The vocabulary — ten keys, and what each one may contain
 * ==========================================================================*/

/**
 * **The closed slot vocabulary.** Phase 2's prompt tells her she never coins a key, and this is
 * the list she is handed. Order is the order they are described to the distiller and the order
 * `/admin/memory` (phase 16) will naturally show them in.
 *
 * `'pending_promises'` must stay identical to phase 1's `NINA_SLOT_PENDING_PROMISES`, which
 * `tests/nina.memory.test.ts` asserts rather than trusting.
 *
 * `'training_plan'` is the tenth, and it sits directly after `'running_days'` because that is the
 * pair a writer confuses: `running_days` holds WHICH days he runs and is read back through
 * `parseRunningDays` by the evening cron; `training_plan` holds WHAT HE DOES on them and is read
 * by nobody but her. `goals` is neither — it is what he is training FOR. The three are adjacent
 * in the librarian's list on purpose.
 */
```

**Impact:** comments only. No behaviour.

### Step 2: the tenth key

**File:** `lib/nina/memory.ts:634-644`
**Change:** insert `'training_plan'` after `'running_days'`. The whole array afterwards:

```ts
export const NINA_SLOT_KEYS = [
  'name',
  'nickname',
  'running_days',
  'training_plan',
  'work_hours',
  'goals',
  'injuries',
  'food_likes',
  'gear',
  'pending_promises',
] as const
```

**Impact:** `NinaSlotKey` widens. `tsc` now fails on `SLOT_LABELS` and `SLOT_REFUSALS` until
Steps 4 and 5 land — that failure is the safety net, so do not reorder the steps to avoid seeing
it. `isNinaSlotKey('training_plan')` becomes `true`, which is what lets an existing orphan row of
that name (there is none in production) become a real slot.

### Step 3: the spec entry

**File:** `lib/nina/memory.ts` — insert immediately after the `running_days` entry, which closes at
`:715` (`},` before `work_hours: {`)
**Change:** the complete new entry:

```ts
  training_plan: {
    key: 'training_plan',
    policy: 'replace',
    category: 'training',
    /*
     * **Prose, deliberately, and this is the one slot where that is a decision rather than a
     * default.** `running_days` above composes `formatRunningDays(parseRunningDays(raw))` because
     * something READS it back: the evening cron and `MISSED_USUAL_DAY` act on the weekday set, so
     * text that does not parse must be refused to a ledger fact rather than stored as a slot the
     * cron would act on wrongly. Nothing reads THIS field. No cron, no pattern, no trigger — the
     * only consumer is Nina, reading the value verbatim out of `memory.slots` on the next turn.
     * A parser with no consumer would buy nothing and cost real plans: every phrasing it failed
     * to read would be thrown away in exchange for a guarantee nobody uses. `goals` is the
     * precedent and the shape.
     *
     * **The 400 is a floor-to-ceiling match, not a second opinion.** Both writers are already
     * capped there — `NinaMemoryWriteSchema.text` for her own slot writes and
     * `ADMIN_SLOT_VALUE_MAX` for the admin editor — so this slice can never truncate a legal
     * write. `goals`' 240 would cut a five-session week in half.
     *
     * If a later set ever wants to CHECK a session against a real run, it writes the parser then
     * and inherits rows that may not parse; the honest path is to canonicalise on the next write,
     * not to backfill.
     */
    canonicalise: (raw) => prose(raw, 400),
    prompt:
      'training_plan — the training week he AGREED to: what he does on each day, like "Senin easy 5k, Rabu interval 6x400, Sabtu tempo 8k, Minggu long run 15k". Only when he agrees to it or states it himself, and the quote is his own agreement — a plan he never answered is not one. Which days he runs is running_days; what he is training FOR is goals.',
  },
```

**Impact:** `SLOT_VOCABULARY_BLOCK` gains one line in position 4, so the librarian's system prompt
changes (see the `NINA_DISTILL_PROMPT_VERSION` note in the Interface Contract). The `slotKey` tool
enum gains `'training_plan'`. `NINA_SLOT_SPECS.running_days` and `.goals` are untouched.

### Step 4: the admin label

**File:** `lib/admin/memoryVocab.ts:24-34`
**Change:** one entry, after `running_days`, mirroring the array's order. The whole record
afterwards:

```ts
const SLOT_LABELS: Readonly<Record<NinaSlotKey, string>> = {
  name: 'Full name',
  nickname: 'Nickname',
  running_days: 'Usual running days',
  training_plan: 'Training plan',
  work_hours: 'Work hours',
  goals: 'Current goal',
  injuries: 'Injuries',
  food_likes: 'Food',
  gear: 'Gear',
  pending_promises: 'Pending promises',
}
```

**Impact:** one of the two compiler errors from Step 2 clears. The row's *hint* is
`NINA_SLOT_SPECS.training_plan.prompt` via `describeSlot` (`:96`) — the longest hint on the page at
~330 characters; see Manual check.

### Step 5: the refusal sentence

**File:** `lib/admin/memoryVocab.ts:45-60`
**Change:** one entry, in the same position. The whole record afterwards:

```ts
const SLOT_REFUSALS: Readonly<Record<NinaSlotKey, string>> = {
  name: 'A name cannot be empty.',
  nickname:
    'That is not a usable nickname — one short word, letters only. Nina stores it as a bare string.',
  running_days:
    'No weekday could be read out of that. Write day names: "Selasa, Kamis, Sabtu". This has to ' +
    'parse back, because the evening cron reads this slot to ask whether he skipped his usual day.',
  training_plan:
    'Cannot be empty. Nothing parses this one — it is prose she reads back, so any wording of the ' +
    'week is accepted. To clear it, delete the row — the key comes back as a blank one.',
  work_hours: 'Write two clock times, like "08:00-17:00".',
  goals: 'A goal cannot be empty.',
  injuries: 'Cannot be empty. To clear it, delete the row — the key comes back as a blank one.',
  food_likes: 'Cannot be empty. To clear it, delete the row — the key comes back as a blank one.',
  gear: 'Cannot be empty. To clear it, delete the row — the key comes back as a blank one.',
  pending_promises:
    'Promises are structured rows, not text — phase 5 refuses a string here on purpose. Each one ' +
    'already has its own row in this table; delete it there.',
}
```

Two existing assertions constrain this sentence and it satisfies both: `admin.memory.test.ts:91-97`
sweeps every key's refusal for `/retire/i` (absent), and the new refusal test below asserts
`/delete/i` (present, same clause the three prose slots use).

**Impact:** the second compiler error from Step 2 clears; the tree builds again.

### Step 6: the counts in prose, in the three files my own change falsifies

Not a cleanup — these four sentences become **false** when Step 2 lands, and each says "nine".

**File:** `lib/admin/memoryVocab.ts:62-64`

```ts
const ORPHAN_HINT =
  'Not one of the ten keys Nina understands. Nothing in the app reads it deliberately — but ' +
  'every slot row goes into her prompt on every turn, so it IS being read, by her. Delete it.'
```

**File:** `lib/admin/memoryVocab.ts:112-119` — the refusal for an unknown key:

```ts
  if (!isNinaSlotKey(key)) {
    return {
      ok: false,
      reason:
        `"${key}" is not one of the ten keys Nina understands, so writing to it would put a ` +
        'value in her prompt that no rule governs. Delete the row instead.',
    }
  }
```

**File:** `lib/admin/memoryVocab.ts:200-201` — inside `buildMemoryRows`' docstring, item 1:

```
 *   1. one row per closed-vocabulary slot key that is NOT structured — nine of the ten — whether
 *      or not a database row exists. An empty row is how a slot is inserted by hand, and it is
```

The same docstring's closing sentence — *"There is deliberately no way to create a TENTH slot key
from this page"* (`:210-211`) — now reads as an off-by-one. Replace those two lines with:

```
 * There is deliberately no way to create a NEW slot key from this page: the vocabulary is closed,
 * and a free-text key field would manufacture exactly the orphans (2) exists to clean up.
```

**File:** `lib/admin/memoryModel.ts:60-65`

```ts
/**
 * `'text'`       — the nine prose/scalar slots. Editable, canonicalised on save.
 * `'structured'` — a `merge`-policy slot (`pending_promises`). Its ENTRIES become rows of their
 *                  own; the key itself is never rendered as a row.
 * `'orphaned'`   — a key outside phase 5's ten. Deletable, never editable.
 */
```

**File:** `lib/admin/schema.ts:107`

```ts
/** A slot key. Membership in phase 5's ten is checked by `canonicaliseSlotValue`, not here. */
```

**Impact:** comments and two operator-facing strings. `admin.memory.test.ts:88` asserts the unknown
-key refusal matches `/delete/i`, which survives; nothing asserts the word "nine".

### Step 7: `tests/nina.memory.test.ts`

**File:** `tests/nina.memory.test.ts:37-47`
**Change (a):** the count, and one extra assertion so the ordering decision in P2-D1 is recorded
where a later edit would trip over it. Replace the §1 describe with:

```ts
describe('the slot vocabulary is closed and agrees with phase 1', () => {
  it('contains phase 1’s one declared key, and every spec is keyed by its own key', () => {
    expect(NINA_SLOT_KEYS).toContain(NINA_SLOT_PENDING_PROMISES)
    expect(NINA_SLOT_KEYS).toHaveLength(10)
    for (const key of NINA_SLOT_KEYS) {
      expect(NINA_SLOT_SPECS[key].key).toBe(key)
      expect(isNinaSlotKey(key)).toBe(true)
    }
    expect(isNinaSlotKey('favourite_colour')).toBe(false)
  })

  it('keeps the training plan next to the days it is not, in the order both readers use', () => {
    /* The order IS the librarian's list order and `/admin/memory`'s row order. These two keys are
     * the pair a writer confuses, so they are adjacent deliberately rather than incidentally. */
    const days = NINA_SLOT_KEYS.indexOf('running_days')
    expect(NINA_SLOT_KEYS[days + 1]).toBe('training_plan')
    expect(NINA_SLOT_KEYS[NINA_SLOT_KEYS.length - 1]).toBe('pending_promises')
  })
})
```

**Change (b):** the canonicalisation cases — one value that stores, one that is refused — appended
immediately after that describe, before the `§2 parseRunningDays` banner:

```ts
describe('NINA_SLOT_SPECS.training_plan — R3’s "set up schedules", stored', () => {
  const spec = NINA_SLOT_SPECS.training_plan

  it('is a replace-policy training slot, which is what makes it an editable admin row', () => {
    /* `merge` would make it structured (`slotEditKind`), and `buildMemoryRows` excludes structured
     * keys from the row list — so this assertion is the admin page's exit criterion, upstream. */
    expect(spec.policy).toBe('replace')
    expect(spec.category).toBe('training')
  })

  it('stores a week of sessions, collapsed onto one line', () => {
    expect(spec.canonicalise('Senin easy 5k\nRabu interval 6x400\n  Sabtu tempo 8k ')).toBe(
      'Senin easy 5k Rabu interval 6x400 Sabtu tempo 8k',
    )
  })

  it('caps at the 400 characters both writers are already capped at', () => {
    const stored = spec.canonicalise('x'.repeat(500))
    expect(stored).not.toBeNull()
    expect(stored).toHaveLength(400)
  })

  it('refuses a value with nothing in it, which §7 turns into a ledger fact', () => {
    expect(spec.canonicalise('   ')).toBeNull()
    expect(spec.canonicalise('')).toBeNull()
  })

  it('is not running_days: the sessions survive here and would not survive there', () => {
    const raw = 'Senin easy 5k, Rabu interval 6x400'
    expect(spec.canonicalise(raw)).toBe(raw)
    /* Whatever `parseRunningDays` makes of that sentence, it is not that sentence — the weekday
     * canonicaliser keeps the days and throws the work away. That is the hole this slot fills. */
    expect(NINA_SLOT_SPECS.running_days.canonicalise(raw)).not.toBe(raw)
  })
})
```

**Impact:** `running_days`' own suite (`§2`, including its round-trip and its
`canonicalise('kapan aja') === null` case) is untouched.

### Step 8: `tests/admin.memory.test.ts`

**File:** `tests/admin.memory.test.ts:84-89`
**Change (a):** the test name counts to nine; the assertion does not. Rename only:

```ts
  it('refuses a key outside the vocabulary, and points at the delete control', () => {
    const result = canonicaliseSlotValue('favourite_shoe', 'Novablast 4')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/delete/i)
  })
```

**Change (b):** the two cases for the new key, inserted after the `work_hours` round-trip test
(`:62-70`) so the parsed and unparsed slots read side by side:

```ts
  it('accepts a training plan verbatim, because nothing parses this slot', () => {
    const result = canonicaliseSlotValue('training_plan', 'Senin easy 5k, Rabu interval 6x400')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe('Senin easy 5k, Rabu interval 6x400')
  })

  it('refuses an empty training plan and points at the delete control', () => {
    const result = canonicaliseSlotValue('training_plan', '   ')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/delete/i)
  })
```

**Change (c):** the edit-kind reading, appended to the existing test at `:101-105`:

```ts
  it('classifies the edit kind from phase 5s write policy, not from a key literal', () => {
    expect(slotEditKind('goals')).toBe('text')
    expect(slotEditKind('training_plan')).toBe('text')
    expect(slotEditKind('pending_promises')).toBe('structured')
    expect(slotEditKind('favourite_shoe')).toBe('orphaned')
  })
```

**Impact:** `NON_STRUCTURED_SLOT_KEYS` (`:29`) becomes nine keys and the sweep at `:92` covers the
new key, both derived — no edit needed at either line, which is the property the analysis
predicted. `buildMemoryRows`' "every non-structured slot key as an empty row" test (`:119-129`)
also follows automatically, including the row ORDER, because it maps
`NON_STRUCTURED_SLOT_KEYS`.

---

## Verification

**Corrected by the reconciler: this worktree now has `node_modules` installed and `.env.local` in
place. There is no install step — do not run `npm install`.** The earlier "no `node_modules`" note
was true when this plan was written.

**The baseline this phase is measured against:** `npx vitest run` on the branch before any phase
lands is green at **145 test files, 2834 tests**. This phase adds cases to two existing files and
creates none, so the file count stays 145.

**Build:** `npx tsc --noEmit`
**Tests, targeted first:**

```
npx vitest run tests/nina.memory.test.ts tests/admin.memory.test.ts
npx vitest run tests/nina.prompts.test.ts
npx vitest run
```

**Never:** `npx vitest -u`, and no hand-edit of `tests/__snapshots__/nina.prompts.test.ts.snap`.

**What a pass looks like:**

- `tsc --noEmit` clean. If it reports `Property 'training_plan' is missing in type` for
  `SLOT_LABELS` or `SLOT_REFUSALS`, Steps 4/5 are incomplete — that is the intended failure mode.
- `tests/nina.memory.test.ts`: the vocabulary length assertion reads `10`, and the five new
  `training_plan` cases pass.
- `tests/admin.memory.test.ts`: green with no edit to lines 29 or 92, and
  `buildMemoryRows({slots:[],facts:[],promises:[]})` returns **nine** slot rows in
  `NINA_SLOT_KEYS` order with `training_plan` fourth.
- `tests/nina.prompts.test.ts`: green, **including** `renders the four non-girlfriend
  relationships exactly as origin/main did`, with the snapshot file unmodified. Confirm with
  `git status --short tests/__snapshots__/` — it must print nothing.
- `git diff --stat` touches six files, none of them `lib/nina/prompts/*`, `lib/nina/persona.ts`,
  `lib/nina/tuning.ts`, `lib/nina/context.ts` or `components/`.
- `git diff | grep -ci instructor` -> `0`. `git diff | grep -c relationship` -> `0`.

**Manual check** (needs `npm run build && npm start`, not a Vercel preview — `/admin` needs
Production-scope env):

1. `/admin/memory` shows a **Training plan** row, fourth, blank, with the hint from the spec's
   `prompt` and an enabled input. Type `Senin easy 5k, Rabu interval 6x400, Sabtu tempo 8k` and
   save: the value comes back verbatim, the note reads `admin — the distiller defers to this`, and
   the `✕` control appears.
2. Save an empty value on that row: the refusal renders inline, mentions delete, and the typed
   value is not stored.
3. The hint is the longest on the page (~330 chars). Confirm it wraps inside its cell rather than
   widening the table; if it visibly harms the row, **shorten the spec's `prompt`, not the label**,
   and re-run the two test files. (Do not "fix" it by giving the admin a second hint string — that
   is a second vocabulary, invariant 4.)
4. Open a Nina chat after step 1 and confirm the value reaches her: the payload logged by
   `lib/nina/load.ts` carries `memory.slots[].key === 'training_plan'` with the value verbatim.

**Exit criteria:**

- `NINA_SLOT_KEYS` has ten members, `training_plan` fourth, `pending_promises` last.
- `training_plan` round-trips through `canonicalise` and refuses an empty value to a ledger fact
  rather than storing it.
- It appears at `/admin/memory` with a label, a hint and an editable value.
- It is described to the distiller by **exactly one** line rendered from `SLOT_VOCABULARY_BLOCK`,
  with nothing retyped anywhere.
- **`lib/nina/prompts/system.ts` does not appear in `git diff --name-only`** (P2-D4), and therefore
  the slot is **not** named in `buildContextGuide`. Phase 3's gated block is where the key name
  reaches Nina — this phase must not add that sentence, and must not "fix" the omission.
- **`lib/nina/prompts/distill.ts` does not appear in `git diff --name-only`** either, so
  `NINA_DISTILL_PROMPT_VERSION` is untouched here (D6 — phase 1's bump).
- `tsc --noEmit` clean; `npx vitest run` green at **145 test files** and at least the baseline's
  2834 tests; `tests/__snapshots__/nina.prompts.test.ts.snap` byte-identical to `HEAD`.

---

## Handoffs

1. **Phase 3 names the key to Nina, gated — ACCEPTED (D7), and phase 3's plan has been edited to do
   it.** P2-D4 leaves `buildContextGuide` unedited, so the system prompt never spells
   `training_plan` at the default. Phase 3's `INSTRUCTOR_COACHING` — `''` at the other five levels —
   now spells it: the plan bullet reads *"The training plan in "memory.slots" under "training_plan"
   is the plan YOU wrote … write the whole week back with "save_memory" in the same turn — kind
   "slot", slotKey "training_plan", one line, and it replaces what was there rather than adding to
   it."* That honours every clause of "What phase 3 may say about this slot" above, including
   `replace` semantics, and costs zero default-render bytes.
2. **Phase 1 rewords `lib/nina/tuning.ts:44` — CONFIRMED present** in phase 1's Step 7a, keeping the
   sentence's real argument (the *tuning* does not belong in a slot) and dropping the cap reading.
   Nothing owed here.
3. **`NINA_DISTILL_PROMPT_VERSION` 2 -> 3: PHASE 1'S, settled (D6).** Written into phase 1's plan as
   Step 5d with the exact before/after and into its exit criteria. This phase does not bump it.
4. **`lib/nina/prompts/tools.ts:112` and `:204` still say `e.g. usual_running_days`** — a key that
   has not existed since the vocabulary closed. Out of scope for this set by the index ("No tool
   schema change"), and a tool-description edit would change the librarian and Nina prompts
   together. Worth its own card; not touched here.
5. **No reader for the field, on purpose (P2-D3).** If a later set wants "did he do Wednesday's
   tempo?", it writes the parser then, and it inherits prose rows. The stated migration is
   canonicalise-on-next-write, never a backfill.

---

## Rollback

**This phase alone:** `git revert` the phase-2 commit. Nothing else in the set imports the key —
phase 1 shares no file with it, and phase 3 only *mentions* it in prose (so a revert of phase 2
alone leaves phase 3 naming a key `isNinaSlotKey` no longer recognises: harmless, and the
degradation is the designed one below).

**What happens to data already written:** a `nina_memory_slots` row under key `'training_plan'`
survives the revert as a `text` key that `isNinaSlotKey` now returns `false` for. It therefore:
appears at `/admin/memory` as an **orphan** row (`memoryVocab.ts:245-265`) with the delete control
and no editor; is refused by `canonicaliseSlotValue`; is demoted to a ledger fact by
`proposeSlot`'s `unknown-key` branch on the next distillation; and is still rendered into
`memory.slots` for Nina, because `context.ts` passes every row through. That is exactly the
designed degradation the index's Rollback section names, and it is why this phase needs **no
migration, no new table and no new column** in either direction.

**Nothing else to undo:** no schema change, no prompt version moved, no default changed, no
snapshot regenerated.

---

## Appendix A — NOT AN INSTRUCTION. DO NOT APPLY THIS EDIT, IN ANY PHASE.

> **STOP. This appendix is a historical record, not a step.** Nothing in it is to be applied by
> phase 2, by phase 3, or by any session in this plan set. The reconciler has ratified P2-D4:
> `lib/nina/prompts/system.ts` is **phase 3's file alone**, the `memory.slots` paragraph stays
> **byte-identical**, and the slot's prose naming lives in phase 3's gated `INSTRUCTOR_COACHING`
> instead (D7). Applying the diff below turns `tests/__snapshots__/nina.prompts.test.ts.snap` red at
> lines 155, 328, 501 and 674 and violates index invariant 1. It is kept only so that a future set
> which deliberately relaxes invariant 1 finds the sentence already written and reviewed rather than
> improvised — and such a set would have to make and record its own decision about the snapshot
> before touching it.

**Before** — `lib/nina/prompts/system.ts:235`, inside `buildContextGuide`:

```
"memory.slots" — standing facts about him that you upserted. This is what makes you proactive: "he usually runs Tuesdays, Thursdays, Saturdays, Sundays" plus today's weekday is the whole of "jadi ga lari selasa ini?".
```

**After** (the minimal form: one added sentence, everything else byte-identical):

```
"memory.slots" — standing facts about him that you upserted. This is what makes you proactive: "he usually runs Tuesdays, Thursdays, Saturdays, Sundays" plus today's weekday is the whole of "jadi ga lari selasa ini?". "running_days" is which days he runs and "training_plan" is what he does on them — write the plan there, in one line, only once he has agreed to it.
```

Again: **it is not applied in this set.** If a later set ever applies it, that set must apply it
together with its own recorded decision about the snapshot, and must bump `NINA_PROMPT_VERSION` in
the same commit — which in *this* set is phase 3's constant and this phase's diff must never contain
`lib/nina/prompts/system.ts` at all.
