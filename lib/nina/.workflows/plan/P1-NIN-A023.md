> Adopted from `NINA_EMOJI_SHORTCUTS_PLAN.md` phase 2. Source: `.workflows/plan/nina-emoji-shortcuts/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 2: Firing a shortcut into the turn

**Plan set:** `NINA_EMOJI_SHORTCUTS_PLAN.md`
**Analysis:** `20260907-185401-SHRT_code_analyzer.md`
**Satisfies:** R2 — typing a single emoji makes Nina understand the whole long context it stands for
**Depends on:** Phase 1
**Difficulty:** HARD
**Package:** `lib/nina`

---

## Goal

After this phase, a chat message whose text contains a live trigger carries that shortcut's **full
expansion** into the user turn Nina answers, as an explicit directive sitting immediately above
`HE JUST SAID:` — and a message that contains no trigger carries **zero shortcut bytes**, producing
a `userTurnText` byte-identical to the one this repo produced before the feature existed. The
shortcut's `uses` counter is bumped fire-and-forget, and `NINA_PROMPT_VERSION` goes 5 → 6 to date
the assembler change even though `buildNinaSystemPrompt`'s output does not move by one byte.

## Interface Contract

**Deletes:** nothing.

**Renames:** nothing.

**Creates:**

- `lib/nina/turn.ts` — `NinaTurnInput.shortcuts?: readonly NinaShortcutMatchable[]` (optional)
- `lib/nina/turn.ts` — `NinaTurnInput.recentRunnerTexts?: readonly string[]` (optional)
- `lib/nina/turn.ts` — `NinaTurnResult.firedShortcutIds: readonly string[]` (**required**, always
  present, `[]` when nothing fired)
- `lib/nina/turn.ts` — module-private `shortcutHits(input)` and `shortcutBlock(hits)`; neither is
  exported.

**Signature changes:**

- `function userTurnText(input: NinaTurnInput): string`
  -> `function userTurnText(input: NinaTurnInput, hits: NinaShortcutHits): string`
  (module-private; `lib/nina/turn.ts:353`; one call site, `turn.ts:616`)
- `NINA_PROMPT_VERSION` `5` -> `6` (`lib/nina/prompts/index.ts:52`). **This is the set's single
  bump.** No other phase may touch this constant.

**The exact final shape of `NinaTurnInput`** (fields in file order; only the last two before
`proactive` are new):

```
userId, context, tuning, history, sourceMessageId, runnerText,
imageDescriptions?, quoted?, attachedRunId?,
shortcuts?, recentRunnerTexts?,          <-- NEW, both optional
proactive?
```

**The exact position of the new block among `userTurnText`'s `parts`:**

```
1  'CONTEXT — every fact you are allowed to state is in here. …'
2  JSON.stringify(visibleContext(input.context), null, 2)
3  [HE SENT AN IMAGE / IMAGES …]        input.imageDescriptions
4  [quoteContextBlock(quoted)]          R12
5  [HE ATTACHED THIS RUN … + JSON + one of two sentences]   R13
6  [the shortcut block]                 <-- NEW. R2.
7  'HE JUST SAID:' , input.runnerText
8  [NOBODY SAID ANYTHING. …]            proactive
```

i.e. index 6 of 8 — **after** the attached-run block (`turn.ts:397`) and **immediately before**
`'HE JUST SAID:'` (`turn.ts:399`).

**`NinaTurnResult` gained a field:** yes — `firedShortcutIds: readonly string[]`, required.
Constructed at exactly one site (`finish()`, `turn.ts:597-600`); the type name appears nowhere else
in `lib/`, `app/` or `tests/`, and no test constructs one, so the required field costs one line.
`lib/nina/proactive.ts` holds `runTurn?: typeof runNinaTurn` and reads only `result.payload`, so it
compiles unchanged and is not touched.

**Requires (from earlier phases):**

- `lib/nina/shortcuts.ts` exports `matchNinaShortcuts`, `renderNinaShortcutBlock`,
  `NINA_SHORTCUT_LOOKBACK`, `type NinaShortcutMatchable`, `type NinaShortcutHits`,
  `normalizeNinaTrigger` — Phase 1, zero imports.
- `lib/nina/queries.ts` exports
  `listNinaShortcuts(userId, opts?: { onlyEnabled?: boolean }): Promise<NinaShortcutRecord[]>` and
  `bumpNinaShortcutUses(userId, ids: readonly string[]): Promise<void>` — Phase 1.
  **`NinaShortcutRecord` is a structural superset of `NinaShortcutMatchable`** (it adds `uses`,
  `lastUsedAt`, `createdAt`, `updatedAt`, and its `kind` is the same `NinaShortcutKind`), so the
  array is assignable to `readonly NinaShortcutMatchable[]` **with no mapping step**. Phase 1's
  contract states that explicitly and phase 3 renders the four extra fields; this phase simply
  passes the value through. Do not build a projection.
- **This phase calls `listNinaShortcuts(userId, { onlyEnabled: true })`, not the bare form.**
  Reconciled against phase 1, which owns the query layer, declares
  `nina_shortcuts_user_enabled_idx (user_id, enabled)` for this exact read, and states the call in
  its handoff. The matcher filters disabled rows anyway — that filter stays, as belt to this brace
  and as the guarantee for any caller (a test, a future path) that hands it everything — but the
  turn path does not put rows on the wire that can never fire.
- `renderNinaShortcutBlock` returns the block **including its instruction preamble**; this phase
  writes no instruction text of its own — Phase 1.

**Leaves alone (owned by others):** `lib/db/schema.ts`, `drizzle/*`, `lib/nina/queries.ts`,
`lib/nina/shortcuts.ts` (Phase 1); `lib/admin/*`, `components/admin/*`, `app/admin/*`,
`tests/admin.shell.test.ts` (Phase 3); `scripts/nina-shortcuts-import.mjs`, `package.json`
(Phase 4). Also untouched by decision: `lib/nina/prompts/system.ts`, `lib/nina/context.ts`,
`lib/nina/load.ts`, `lib/nina/gateway.ts`, `lib/nina/distill.ts`, `lib/nina/proactive.ts`,
`components/nina/Composer.tsx`, and **`tests/__snapshots__/nina.prompts.test.ts.snap`, which is
never regenerated (invariant 3)**.

**One file the draft index assigned to nobody, and this phase now owns:** `tests/nina.resend.test.ts`.
It appears in no other phase's `Owns` list (confirmed at reconciliation across all four plans and the
analysis's Impact Points, where it is absent entirely). It must change, and the reason is mechanical
rather than stylistic — see Step 6. Three lines. The index's phase-2 `Owns` and its Reconciliation
Log now record the assignment.

**One file the draft index listed for this phase and this plan does NOT touch:**
`tests/nina.prompts.test.ts`. Its only version assertion is
`expect(NINA_PROMPT_VERSION).toBeGreaterThanOrEqual(3)` at `:488`; `6 >= 3`, so the floor does not
need moving and there is no equality assertion on the constant anywhere in `tests/`, `lib/` or
`app/` (verified by grep). Raising the floor would be scope creep. **Settled at reconciliation: it
has been removed from the index's phase-2 `Owns`, and no other phase picked it up.** The analysis's
impact point 11 ("the default render must stay byte-identical") is discharged by invariant 3's
verification step — `git status` on the snapshot — and not by an edit to that file.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/turn.ts` | modify | one import; two optional fields on `NinaTurnInput`; one required field on `NinaTurnResult`; two module-private helpers; `userTurnText` gains a `hits` parameter and one `parts.push`; `runNinaTurnWith` matches once and threads the result |
| `lib/nina/actions.ts` | modify | two imports; a fourth `Promise.all` entry; the `recentRunnerTexts` derivation; two new arguments at the `runNinaTurn` call; the fire-and-forget usage bump |
| `lib/nina/prompts/index.ts` | modify | changelog comment 6, and `NINA_PROMPT_VERSION` 5 -> 6 |
| `lib/nina/turn.test.ts` | modify | one import, two fixtures, two new `describe` blocks (11 cases) |
| `tests/nina.resend.test.ts` | modify | two entries in the `@/lib/nina/queries` mock factory; `firedShortcutIds: []` on the `runNinaTurn` mock |

Five files. No new file: an actions-level test file was considered and declined — see Handoffs.

---

## Implementation Steps

### Step 1: `lib/nina/turn.ts` — import the matcher

**File:** `lib/nina/turn.ts:10` (insert a new line 11, between `./schema` and `./tools`)

**Change:** one import from Phase 1's pure module. `schema` < `shortcuts` < `tools`, so the block
stays sorted.

**Code — insert immediately after line 10:**

```ts
import {
  matchNinaShortcuts,
  renderNinaShortcutBlock,
  type NinaShortcutHits,
  type NinaShortcutMatchable,
} from './shortcuts'
```

**Impact:** `lib/nina/turn.ts` opens with `import 'server-only'`; `lib/nina/shortcuts.ts` has zero
imports and is client-safe, so the dependency runs one way only and adds nothing to any bundle.

---

### Step 2: `lib/nina/turn.ts` — the field on `NinaTurnResult`

**File:** `lib/nina/turn.ts:201-207`

**Change:** add `firedShortcutIds`. Required rather than optional: it is produced by this file on
every path, so a caller must never have to ask whether it is there.

**Code — replace lines 201-207 in full:**

```ts
export interface NinaTurnResult {
  /** null iff `source === 'unavailable'`. There is no fallback bubble; see the header. */
  payload: NinaSendPayload | null
  source: NinaTurnSource
  usage: NinaTurnUsage
  trace: NinaTurnTrace
  /**
   * **R2.** The ids of the shortcuts that FIRED on this turn — the ones whose trigger is in
   * `runnerText` itself. `[]` on every turn where none did, which is most of them, and `[]` for a
   * shortcut that is only still IN PLAY from `recentRunnerTexts`: that one was counted on the turn
   * it fired, and counting it again would turn `nina_shortcuts.uses` into a measure of how
   * RECENTLY he used a code rather than how OFTEN.
   *
   * ── ON THE RESULT, RATHER THAN RECOMPUTED BY THE CALLER ─────────────────────────────────────
   * `matchNinaShortcuts` runs exactly ONCE per turn — in `runNinaTurnWith`, against the
   * `NinaTurnInput` this file actually assembled — and `lib/nina/actions.ts` reads what it decided
   * instead of matching again. A second run in the action would take slightly different inputs
   * (its own view of the window, its own idea of which message is current) and could disagree with
   * the block the model was sent. The bug that produces is "`/admin/shortcuts` says 🍑 fired and
   * the prompt did not contain it", which is unfalsifiable from the outside.
   *
   * **Not on `NinaTurnTrace`.** That object is what `nina_turns` records, and `NinaTurnRow` has no
   * column for this. This is a return value the caller ACTS on, not an audit field.
   */
  firedShortcutIds: readonly string[]
}
```

**Impact:** `NinaTurnResult` is constructed at exactly one site — `finish()` at `turn.ts:597` — and
the type name appears in no other file, so this is one added line at Step 5. It is read by
`lib/nina/actions.ts` (Step 8) and ignored by `lib/nina/proactive.ts`, which destructures nothing.

---

### Step 3: `lib/nina/turn.ts` — the two optional fields on `NinaTurnInput`

**File:** `lib/nina/turn.ts:307` — insert immediately after the line
`  attachedRunId?: string | null`, i.e. between the `attachedRunId?` field and the `proactive?`
field's docblock.

**Change:** two optional fields, documented to the standard the surrounding fields set.

**Code — insert immediately after `attachedRunId?: string | null`:**

```ts
  /**
   * **R2 (the nina-emoji-shortcuts set).** The shortcut rows that can fire — what
   * `listNinaShortcuts(userId, { onlyEnabled: true })` returns, which is the
   * `nina_shortcuts_user_enabled_idx` read the table carries that index for.
   *
   * **Passing disabled rows anyway is harmless and stays supported.** `matchNinaShortcuts` filters
   * on `enabled` itself, so "live" has one definition no matter who calls this — the query is an
   * optimisation over the wire, not the guarantee. A test that hands this field a disabled row and
   * expects nothing to fire is asserting the guarantee, and it passes.
   *
   * ── OPTIONAL, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT ───────────────────────────────
   * Contrast `tuning` directly above, which is required for a stated reason: a forgotten call site
   * would ship the DEFAULT character and nothing would fail. Nothing of the kind is true here.
   * `runNinaTurn` has one production call site (`lib/nina/actions.ts:821`), three more in
   * `tests/live/` and `tests/integration/`, and `lib/nina/proactive.ts` — which has no runner text
   * at all, so nothing there could ever fire. A required field would make every one of them
   * rewrite a fixture to land a feature they do not exercise, and the failure it would guard
   * against ("this turn silently carried no shortcut") is the correct behaviour on all of them.
   *
   * Absent, `[]`, and "present but nothing matched" are the SAME turn: **zero shortcut bytes**
   * (invariant 2), asserted three ways in `lib/nina/turn.test.ts`.
   */
  shortcuts?: readonly NinaShortcutMatchable[]
  /**
   * **R2.** Earlier RUNNER messages — **newest first, already sliced** to
   * `NINA_SHORTCUT_LOOKBACK` by the caller, and **excluding the message this turn is answering**.
   * That one is `runnerText`, and a trigger in it FIRED; it must not also be counted as carried
   * over, or one send would bump the counter twice.
   *
   * It exists because statefulness is in the DATA rather than in the mechanism. One real
   * production shortcut sets a mode that outlives the message that opened it — `🫦`'s expansion
   * reads "…selama miftah bilang terusin … sampe miftah bilang 💦". Without this field, "terusin"
   * arrives as a turn with no trigger in it and the instruction she is meant to still be following
   * has already fallen out of the payload.
   *
   * **His own turns only** (assumption A3). Hers are excluded at the caller, because an expansion
   * she echoed back would otherwise re-fire itself for as long as it stayed in the window.
   */
  recentRunnerTexts?: readonly string[]
```

**Impact:** no existing call site changes. `tests/nina.resend.test.ts:337` and `:370` read
`turnInput` property by property rather than with `toEqual`, so two new keys break nothing there.

---

### Step 4: `lib/nina/turn.ts` — the two helpers and the block

**File:** `lib/nina/turn.ts:346-408`

**Change:** insert `shortcutHits` and `shortcutBlock` between `attachedRunFact` (ends `:346`) and
`userTurnText`'s docblock (`:348`); give `userTurnText` a second parameter; push the block at index
6.

**Code — insert between line 346 (`}`) and line 348 (`/**`):**

```ts
/**
 * **R2.** The shortcuts this turn fired, plus the ones still in play from the last few of HIS
 * messages.
 *
 * ── IT RUNS EXACTLY ONCE PER TURN, AND NOTHING MAY RUN IT A SECOND TIME ─────────────────────
 * `runNinaTurnWith` calls this before it builds the first message and threads the answer into BOTH
 * `userTurnText` (which renders the block) and `NinaTurnResult.firedShortcutIds` (which
 * `lib/nina/actions.ts` bumps). Two runs over two slightly different inputs is exactly the failure
 * this shape exists to make impossible — see `NinaTurnResult.firedShortcutIds`' own note.
 *
 * ── IT CANNOT THROW. INVARIANT 7. ───────────────────────────────────────────────────────────
 * A malformed trigger is a row an admin typed on his phone, not a programming error, and nothing
 * about a chat reply may depend on it. `matchNinaShortcuts` is a pure zero-import function that is
 * not supposed to throw either; this is belt to that brace, and the brace failing would cost a
 * reply rather than a shortcut.
 */
function shortcutHits(input: NinaTurnInput): NinaShortcutHits {
  const shortcuts = input.shortcuts
  if (shortcuts == null || shortcuts.length === 0) return { fired: [], inPlay: [] }
  try {
    return matchNinaShortcuts({
      shortcuts,
      current: input.runnerText,
      recent: input.recentRunnerTexts,
    })
  } catch (cause) {
    console.warn('[nina] shortcut matching failed; this turn carries no shortcut', {
      error: String(cause),
    })
    return { fired: [], inPlay: [] }
  }
}

/**
 * The rendered block, or null.
 *
 * **Not one word of the instruction preamble lives in this file.** `renderNinaShortcutBlock`
 * (`lib/nina/shortcuts.ts`) owns the wording, so it travels with the expansions it governs and
 * there is exactly one copy of it. This function's whole job is the guard around it.
 *
 * The empty-hits short circuit is INVARIANT 2 enforced in the file the invariant is asserted
 * against: a turn where nothing matched must produce a `userTurnText` byte-identical to the one
 * this repo produced before the feature existed, and that must not depend on what a renderer in
 * another file decides to do with an empty argument.
 */
function shortcutBlock(hits: NinaShortcutHits): string | null {
  if (hits.fired.length === 0 && hits.inPlay.length === 0) return null
  try {
    const block = renderNinaShortcutBlock(hits)
    return block != null && block.length > 0 ? block : null
  } catch (cause) {
    console.warn('[nina] shortcut block render failed; this turn carries no shortcut', {
      error: String(cause),
    })
    return null
  }
}
```

**Code — change the signature at line 353:**

```ts
function userTurnText(input: NinaTurnInput, hits: NinaShortcutHits): string {
```

**Code — insert between line 397 (the `}` closing the attached-run `if`) and line 399 (the
`if (input.runnerText != null …)`):**

```ts
  /*
   * R2. AFTER the attached run and IMMEDIATELY BEFORE `'HE JUST SAID:'`, for the reason R12 gives
   * one block up: this is the standing instruction his next sentence has to be read UNDER, so she
   * reads it before the sentence rather than after it. Below the run block because a run he
   * attached is the SUBJECT of the message, while the shortcut is the register the message is in.
   *
   * **A turn that fired nothing pushes nothing** — no header, no empty block, not one byte
   * (invariant 2). That is the whole reason this is a user-turn block and not a section of the
   * system prompt: the two dozen expansions sitting in the production memory ledger cost several
   * kilobytes in every payload today, including all the turns where he used none of them.
   */
  const shortcuts = shortcutBlock(hits)
  if (shortcuts != null) {
    parts.push(shortcuts)
  }
```

**Impact:** `userTurnText` has exactly one caller (`turn.ts:616`), updated in Step 5. Every existing
`turn.test.ts` assertion on the user turn is unaffected because all of them drive inputs with no
`shortcuts`.

---

### Step 5: `lib/nina/turn.ts` — match once in `runNinaTurnWith`, thread the result

**File:** `lib/nina/turn.ts:586-616`

**Change:** compute the hits beside `system` (same "assembled once per turn" reasoning), return the
ids from `finish`, and pass the hits to `userTurnText`.

**Code — insert immediately after `const system = buildNinaSystemPrompt(input.tuning)`
(`turn.ts:586`) and its blank line:**

```ts
  /*
   * R2. Matched HERE and exactly once, for the same reason `system` is assembled here: everything
   * that defines this turn must be fixed before its first model call and must not change between
   * the up-to-four calls it may make. These hits feed BOTH the user turn built thirty lines below
   * and `finish`'s `firedShortcutIds`, so the block the model was actually sent and the rows
   * `lib/nina/actions.ts` bumps afterwards can never disagree.
   */
  const hits = shortcutHits(input)
  const firedShortcutIds: readonly string[] = hits.fired.map((hit) => hit.id)
```

**Code — replace `finish` (`turn.ts:597-600`) in full:**

```ts
  function finish(payload: NinaSendPayload | null, source: NinaTurnSource): NinaTurnResult {
    trace.latencyMs = now() - startedAt
    return { payload, source, usage, trace, firedShortcutIds }
  }
```

**Code — replace line 616:**

```ts
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurnText(input, hits) }]
```

**Impact:** every one of the eleven `return finish(...)` sites now carries the ids, including the
`'unavailable'` ones — which is required, because Step 8 bumps before it knows whether the turn
produced a reply. The replaced line is 99 characters, inside `printWidth: 100`, so Prettier leaves
it on one line.

---

### Step 6: `tests/nina.resend.test.ts` — keep the module fake honest

**File:** `tests/nina.resend.test.ts:65-77` and `:162`

**Change:** three lines. This is not a courtesy edit; without it the suite fails, for two separate
mechanical reasons:

1. The file replaces `@/lib/nina/queries` with a **factory**, and its own comment states the
   contract — *"Every name `lib/nina/actions.ts` imports from `./queries`. A factory replaces the
   whole module, so a missing one is an import error rather than an undefined at call time."*
   Step 7 adds two names to that import.
2. Its last block **drains** the deferred background turn, so `runNinaBackgroundTurn` really runs.
   Step 8 reads `result.firedShortcutIds.length`, and the mock resolves an object without that key,
   which would throw a `TypeError` into the function's own `catch` and make
   `expect(runNinaTurn).toHaveBeenCalledOnce()` fail at `:336`.

**Code — add two entries to the factory at `:65-77`, keeping it alphabetical:**

```ts
vi.mock('@/lib/nina/queries', () => ({
  bumpNinaShortcutUses: vi.fn(),
  getNinaAvatar: vi.fn(),
  getNinaMessageImage: vi.fn(),
  getNinaMessageImagesForMessages: (...a: unknown[]) => getNinaMessageImagesForMessages(...a),
  getNinaMessagesByIds: (...a: unknown[]) => getNinaMessagesByIds(...a),
  getNinaSession: vi.fn(),
  insertNinaMessageImages: (...a: unknown[]) => insertNinaMessageImages(...a),
  insertNinaMessages: (...a: unknown[]) => insertNinaMessages(...a),
  listNinaMessages: (...a: unknown[]) => listNinaMessages(...a),
  listNinaMessagesAfter: vi.fn(),
  /* Resolves `[]` rather than `undefined`: `runNinaBackgroundTurn` awaits it in a `Promise.all`
   * and hands the answer straight to `runNinaTurn`. */
  listNinaShortcuts: vi.fn(async () => []),
  readNinaTuning: (...a: unknown[]) => readNinaTuning(...a),
}))
```

**Code — replace line 162:**

```ts
  /* `firedShortcutIds` is REQUIRED on `NinaTurnResult` and the action reads its length before it
   * checks anything else, so the fake has to carry it. `[]` is the honest value here: the fake
   * `loadNinaContext` returns an empty window and no shortcut row exists. */
  runNinaTurn.mockResolvedValue({ source: 'unavailable', payload: null, firedShortcutIds: [] })
```

**Impact:** none on what the suite measures — no assertion is added, removed or weakened.

---

### Step 7: `lib/nina/actions.ts` — the imports

**File:** `lib/nina/actions.ts:27-38` and `:43-44`

**Change:** two names into the existing `./queries` block (it is alphabetical), and one new import
line for the bound. `schema` < `shortcuts` < `turnflight`, so the new line goes between `:43` and
`:44`.

**Code — replace the `./queries` import block at `:27-38`:**

```ts
import {
  bumpNinaShortcutUses,
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  getNinaSession,
  insertNinaMessageImages,
  insertNinaMessages,
  listNinaMessages,
  listNinaMessagesAfter,
  listNinaShortcuts,
  readNinaTuning,
} from './queries'
```

**Code — insert a new line immediately after
`import { MAX_RUNNER_MESSAGE_CHARS, type NinaMemoryWrite } from './schema'` (`:43`):**

```ts
import { NINA_SHORTCUT_LOOKBACK } from './shortcuts'
```

**Impact:** `lib/nina/actions.ts` opens with `'use server'`; importing the zero-import pure module
costs nothing and reaches no database.

---

### Step 8: `lib/nina/actions.ts` — the read, the derivation, the arguments, the bump

**File:** `lib/nina/actions.ts:781-835`

#### 8a — the fourth `Promise.all` entry

**Replace lines 781-788 in full:**

```ts
    const [loadedContext, history, tuning, shortcuts] = await Promise.all([
      loadNinaContext(userId, sessionId, dbNinaSourceGateway),
      dbNinaToolGateway.loadRunHistory(userId),
      /* THE TUNING, read LIVE on every turn with no cache — which is what makes a slider on
       * `/admin/nina` immediate. Third in an existing `Promise.all` on purpose: one indexed
       * single-row read against a connection this turn is opening anyway. */
      readNinaTuning(userId),
      /* THE SHORTCUTS, read LIVE on every turn with no cache for the same reason and by the same
       * arithmetic — which is what makes a row added on `/admin/shortcuts` fire on his very next
       * message, with no invalidation step anywhere on this path. Fourth in the same `Promise.all`:
       * one `(user_id, enabled)`-indexed read of a table that holds tens of rows, against a
       * connection this turn is opening anyway, so it costs no wall clock the turn was not already
       * spending.
       *
       * **`{ onlyEnabled: true }`, which is the read `nina_shortcuts_user_enabled_idx` exists for.**
       * The bare call returns the disabled rows too, and `/admin/shortcuts` wants those — a
       * disabled code is still a row he edits and re-enables. A turn does not: a disabled row can
       * never fire, so putting it on the wire is bytes for nothing. `matchNinaShortcuts` filters on
       * `enabled` regardless, so "live" still has exactly one definition; this narrows what is
       * fetched, not what counts.
       *
       * **Its rejection is swallowed and the turn continues — INVARIANT 7.** This is the one entry
       * of the four that is garnish. A tuning that will not load is a Nina with the wrong
       * character, and a context that will not load is no turn at all; a shortcut table that will
       * not load is a turn with no shortcut in it, which is what most turns are anyway. Letting it
       * reject would let one unreadable row cost him a reply. */
      listNinaShortcuts(userId, { onlyEnabled: true }).catch((cause) => {
        console.warn('[nina] could not read shortcuts; this turn carries none', {
          turnId,
          error: String(cause),
        })
        return []
      }),
    ])
```

#### 8b — `recentRunnerTexts`, derived from what is already in memory

**Insert after `actions.ts:807`** — the `}` that closes the `quoted` ternary's object literal and
the declaration — **and before the `/* STEP 3 — the turn.` comment at `:809`**, keeping a blank line
on each side:

```ts
    /*
     * R2. The last few things HE said, newest first, so a shortcut that is still IN PLAY survives
     * the turn that opened it — the `🫦` case in the production ledger, whose expansion reads
     * "…selama miftah bilang terusin … sampe miftah bilang 💦" and is therefore useless if it falls
     * out of the payload the moment he answers it.
     *
     * **No new query.** `loadNinaContext` has already loaded the window, and it is OLDEST FIRST
     * with both roles in it (`ConversationFacts.window`, `lib/nina/context.ts:286`), so this is
     * three array operations over ~40 objects already in memory.
     *
     * Filtered to `role === 'runner'` because an expansion SHE quoted back would otherwise re-fire
     * itself every turn it stayed in the window (assumption A3). `runnerMessageId` is dropped
     * because that message is `input.runnerText`: a trigger in it FIRED, and letting it also count
     * as carried-over would bump one shortcut twice for one send. `reverse()` is safe — `map` has
     * already produced a fresh array, so the window itself is not mutated.
     */
    const recentRunnerTexts = loadedContext.conversation.window
      .filter((turn) => turn.role === 'runner' && turn.id !== runnerMessageId)
      .map((turn) => turn.text)
      .reverse()
      .slice(0, NINA_SHORTCUT_LOOKBACK)
```

#### 8c — the two new arguments

**Replace the input object of the `runNinaTurn` call (`actions.ts:822-832`):**

```ts
      {
        userId,
        context: loadedContext,
        tuning,
        history,
        sourceMessageId: runnerMessageId,
        runnerText: input.runnerText,
        imageDescriptions: input.imageDescriptions,
        quoted,
        attachedRunId: input.attachedRunId,
        shortcuts,
        recentRunnerTexts,
      },
```

#### 8d — the usage bump

**Insert immediately after `source = result.source` (`actions.ts:835`):**

```ts
    /*
     * ── R2'S TELEMETRY, AND IT LANDS ABOVE THE EARLY RETURNS ON PURPOSE ──────────────────────
     * `nina_shortcuts.uses` and `last_used_at` answer ONE question on `/admin/shortcuts`: which of
     * these codes does he actually use? A shortcut fired the moment its trigger was in his message
     * and its expansion went into the payload the model was billed for. Deleting the conversation
     * afterwards does not un-fire it, and a reply she failed to produce does not un-fire it either
     * — so counting only the turns that survived to a bubble would make the column a measure of
     * Nina's uptime rather than of his habits, and would under-count exactly the turns that are
     * most annoying to lose. Placing it here also means ONE call site covers all four exits below
     * (`session-gone`, the null payload, the happy path, and a throw) instead of three copies that
     * will drift apart the first time someone edits one of them.
     *
     * **`hits.fired` only, never `inPlay`.** A still-in-play shortcut was counted on the turn it
     * fired; counting it again on every follow-up would make `uses` measure recency, not habit.
     * `runNinaTurn` enforces that split — see `NinaTurnResult.firedShortcutIds`.
     *
     * ── FIRE AND FORGET, AND IT CANNOT REJECT INTO THE TURN. INVARIANT 7. ────────────────────
     * `void` with its own `.catch`, not an `await`. A usage counter is not worth one round trip of
     * wall clock on a path that has just spent 13-45 s, and it is certainly not worth failing a
     * turn for. `after()` was the other candidate and was declined: we are already inside one, and
     * `tests/nina.resend.test.ts` drains `after`'s queue by hand and asserts its length, so a
     * second entry would change what that suite measures.
     */
    if (result.firedShortcutIds.length > 0) {
      void bumpNinaShortcutUses(userId, result.firedShortcutIds).catch((cause) => {
        console.warn('[nina] shortcut usage bump failed', { turnId, error: String(cause) })
      })
    }
```

**Impact:** the send path and the resend path both reach `runNinaBackgroundTurn`, so both get the
feature from this one edit. The chained follow-up turn (`actions.ts:1040`) recurses into the same
function, so a burst gets shortcuts too, with its own freshly-read table.

---

### Step 9: `lib/nina/prompts/index.ts` — the sixth changelog comment and the bump

**File:** `lib/nina/prompts/index.ts:47-52`

**Change:** append comment 6 in the existing numbered-comment voice, directly above the constant,
and change the literal.

**Code — insert immediately after the comment block that begins `/* 5 — the
nina-instructor-character set.` (ends `:51`), and replace line 52:**

```ts
/* 6 — the nina-emoji-shortcuts set, R2. **NO SYSTEM TEXT MOVED AND NO TOOL SCHEMA MOVED.**
 * `./system.ts` and `./tools.ts` were not opened; `buildNinaSystemPrompt` is byte-identical to
 * version 5's at every tuning and `tests/__snapshots__/nina.prompts.test.ts.snap` passes
 * UNREGENERATED. What changed is the ASSEMBLER. `userTurnText` in `lib/nina/turn.ts` gained one
 * conditional block — a fired shortcut's full expansion, rendered by `renderNinaShortcutBlock` and
 * pushed after the attached-run block and immediately before `'HE JUST SAID:'` — fed by two new
 * OPTIONAL fields on `NinaTurnInput`, `shortcuts` and `recentRunnerTexts`. A turn in which no
 * trigger fired pushes nothing at all and is byte-for-byte version 5's user turn, which
 * `lib/nina/turn.test.ts` asserts three ways (field absent, `[]`, and rows present that do not
 * match).
 *
 * **The bump is still correct, and this file's own sibling says why in as many words.**
 * `lib/nina/turn.ts:186`: *"`NINA_PROMPT_VERSION` now identifies the ASSEMBLER, not the output"* —
 * two turns on one version have been able to carry different bytes since the per-user tuning
 * landed at 3, and what the constant buys is that a change in her behaviour can be dated to the
 * commit that caused it. A turn that answers a two-kilobyte standing directive it could never have
 * been sent before is such a change, so `nina_turns` has to be able to tell those turns from
 * version 5's. This is the SINGLE bump for the whole set: phase 2 owns it and no other phase
 * touches this constant, because two bumps would date two commits to one change. */
export const NINA_PROMPT_VERSION = 6
```

**Impact:** `lib/nina/load.ts:292` puts the constant on `NinaContext.promptVersion`, which
`visibleContext` strips from the payload and `nina_turns.prompt_version` records. The only test that
reads it asserts `>= 3` (`tests/nina.prompts.test.ts:488`), which 6 satisfies.

---

### Step 10: `lib/nina/turn.test.ts` — the cases

**File:** `lib/nina/turn.test.ts:18` (import) and end of file (`:586`)

**Change:** one import, two fixtures, two `describe` blocks (11 cases). The existing `input()` builder at `:30`
is reused throughout — no parallel fixture set.

**Code — insert immediately after line 18 (the `./prompts` import):**

```ts
import { normalizeNinaTrigger, type NinaShortcutMatchable } from './shortcuts'
```

**Code — insert after the `GOOD` constant (`turn.test.ts:54`):**

```ts
/**
 * One of the real production expansions, lightly shortened. Long on purpose: the ledger's
 * `ADMIN_FACT_TEXT_MAX = 400` truncation is half of what R2 exists to escape, so a fixture short
 * enough to fit under it would test the wrong thing.
 */
const PEACH =
  'kalo dia remes pantat nina, nina bilang ahh sayang enak banget jangan berhenti dong, ' +
  'terus sampe nina lemes'

/**
 * A shortcut row shaped exactly as `listNinaShortcuts` returns one.
 *
 * `matchKey` is DERIVED through phase 1's own `normalizeNinaTrigger` rather than typed out by hand:
 * a hand-written key is a second implementation of the normalisation rule (NFC, drop `U+FE0F`,
 * collapse whitespace, trim, lowercase) and it would drift from the real one in silence.
 */
function shortcut(over: Partial<NinaShortcutMatchable> = {}): NinaShortcutMatchable {
  const trigger = over.trigger ?? '🍑'
  return {
    id: 'sc0000000001',
    kind: 'glyph',
    label: 'remes pantat',
    expansion: PEACH,
    enabled: true,
    ...over,
    trigger,
    matchKey: normalizeNinaTrigger(trigger),
  }
}

/** The assembled user turn for one input — the string the endpoint was actually sent. */
async function userTurnOf(turnInput: NinaTurnInput): Promise<string> {
  const client = scriptedClient([sendMessage(GOOD)])
  await runNinaTurnWith(fakeTurnDeps(client), turnInput)
  return client.calls[0]!.messages[0]!.content as string
}
```

**Code — append at the end of the file:**

```ts
/* ============================================================================
 * R2 — the fired shortcut. `lib/nina/shortcuts.ts` owns the MATCHER and its own suite proves it
 * against every real production trigger; this block proves the WIRING: that the hits reach the
 * user turn, in the right position, exactly once, and that a turn which fired nothing is untouched.
 * ========================================================================= */

describe('userTurnText — the fired shortcut (R2)', () => {
  it('carries ZERO shortcut bytes when nothing fired — INVARIANT 2, three ways', async () => {
    /*
     * The baseline is the turn as this file built it before the feature existed: the fields are
     * ABSENT from the object entirely, which is still what every call site in `tests/live/`,
     * `tests/integration/` and `lib/nina/proactive.ts` passes.
     *
     * ── EVERY CASE BELOW MUST MISS ON `recent` AS WELL AS ON `current` ─────────────────────────
     * "Nothing fired" is NOT the same condition as "the block is empty". Phase 1's
     * `renderNinaShortcutBlock` returns a NON-NULL block whenever `inPlay` is non-empty even if
     * `fired` is empty — that is deliberate and load-bearing (`🫦` opens a mode that runs until
     * `💦`, and the instruction has to survive the turn where he only says "terusin"). A case that
     * varied only `current` while leaving a MATCHING message in `recentRunnerTexts` would
     * correctly emit a block, and asserting byte-identity against the baseline there would be
     * asserting the opposite of that ruling. So each case below is built so that neither the
     * current message nor any recent one carries a live trigger. The positive counterpart — an
     * in-play-only hit that DOES emit a block — is the case immediately after this one.
     */
    const baseline = await userTurnOf(input())

    /* (1) An empty list — what `listNinaShortcuts` returns for a runner who has defined none. No
     * rows, so no recent message can match either. */
    expect(await userTurnOf(input({ shortcuts: [], recentRunnerTexts: [] }))).toBe(baseline)

    /* (2) Explicitly `undefined`, which is what a caller building the object conditionally
     * produces, and is not the same code path as absent. */
    expect(await userTurnOf(input({ shortcuts: undefined, recentRunnerTexts: undefined }))).toBe(
      baseline,
    )

    /* (3) The case that actually happens all day: shortcuts exist and he used none of them —
     * NOT IN THIS MESSAGE AND NOT IN THE LAST FEW EITHER. The default `runnerText` fixture
     * contains neither `🍑` nor `plak!`, and the recent message is deliberately about running so
     * that it misses both as well. */
    expect(
      await userTurnOf(
        input({
          shortcuts: [shortcut(), shortcut({ id: 'sc0000000002', trigger: 'plak!', kind: 'word' })],
          recentRunnerTexts: ['gw lari 5k tadi pagi'],
        }),
      ),
    ).toBe(baseline)
  })

  it('DOES carry the block when a code is only still in play — the 🫦 case', async () => {
    /*
     * The positive counterpart to the case above, and the reason that one has to be built the way
     * it is. Nothing fired in THIS message; `🍑` fired two messages ago and phase 1's matcher puts
     * it in `inPlay`, so `renderNinaShortcutBlock` returns a block under its STILL IN PLAY header
     * and `userTurnText` pushes it. Without this case, "nothing fired" and "no block" would be
     * indistinguishable in this suite, and a regression that dropped `inPlay` from the rendered
     * block entirely would keep every assertion above green while quietly breaking the one
     * production shortcut whose expansion says it runs "sampe miftah bilang 💦".
     */
    const userTurn = await userTurnOf(
      input({ runnerText: 'terusin', shortcuts: [shortcut()], recentRunnerTexts: ['pengen 🍑'] }),
    )
    expect(userTurn).toContain(PEACH)
    expect(userTurn).toContain('STILL IN PLAY')
    expect(userTurn).not.toContain('HE USED A SHORTCUT')
    /* And it is still byte-different from the same turn with no history — the point of the case. */
    expect(userTurn).not.toBe(await userTurnOf(input({ runnerText: 'terusin' })))
  })

  it('puts the FULL expansion in the user turn when he types the trigger', async () => {
    const userTurn = await userTurnOf(input({ runnerText: 'pengen 🍑 dong', shortcuts: [shortcut()] }))
    /* The whole expansion, not a 400-character truncation of it — the ledger cap this feature
     * exists to escape. */
    expect(userTurn).toContain(PEACH)
    expect(userTurn).toContain('pengen 🍑 dong')
  })

  it('puts the block AFTER the attached run and IMMEDIATELY BEFORE `HE JUST SAID:`', async () => {
    const history = runHistoryFixture()
    const attached = history.runs[0]!
    const userTurn = await userTurnOf(
      input({
        history,
        attachedRunId: attached.runId,
        runnerText: 'abis ini 🍑 ya',
        shortcuts: [shortcut()],
      }),
    )
    const run = userTurn.indexOf('HE ATTACHED THIS RUN TO HIS MESSAGE')
    const block = userTurn.indexOf(PEACH)
    const said = userTurn.indexOf('HE JUST SAID:')
    expect(run).toBeGreaterThanOrEqual(0)
    expect(block).toBeGreaterThan(run)
    expect(said).toBeGreaterThan(block)
  })

  it('hands DISABLED rows to the matcher and lets it drop them', async () => {
    /* The turn path's query already asks for `{ onlyEnabled: true }`, so a disabled row does not
     * normally reach here at all — and the matcher filters on `enabled` anyway, which is what
     * makes "live" have ONE definition regardless of who calls it. This case asserts that
     * guarantee at the `NinaTurnInput` boundary, where a test, a future path, or a stale cache
     * could still hand one in. Compared against the same message with no rows at all rather than
     * against `baseline`, so the only difference under test is the row. */
    const without = await userTurnOf(input({ runnerText: 'pengen 🍑 dong' }))
    const withDisabled = await userTurnOf(
      input({ runnerText: 'pengen 🍑 dong', shortcuts: [shortcut({ enabled: false })] }),
    )
    expect(withDisabled).toBe(without)
  })

  it('reads only `recentRunnerTexts` for history — assumption A3', async () => {
    /* This file has no other route to an earlier message: `context.conversation.window` holds both
     * roles and is never scanned here. An expansion she echoed therefore cannot reach the matcher
     * at all, which is what stops a shortcut re-firing itself off her own bubble. */
    const baseline = await userTurnOf(input())
    expect(await userTurnOf(input({ shortcuts: [shortcut()], recentRunnerTexts: [] }))).toBe(
      baseline,
    )
  })

  it('never lets a shortcut problem cost a reply — INVARIANT 7', async () => {
    /* A row whose trigger is regex-metacharacter soup — an unclosed group, which is what an admin
     * typing on a phone eventually produces. Whatever phase 1's matcher makes of it, the turn
     * answers: `shortcutHits` catches and degrades to "nothing fired". */
    const hostile = shortcut({ id: 'sc0000000003', trigger: '(([', kind: 'word' })
    const result = await runNinaTurnWith(
      fakeTurnDeps(scriptedClient([sendMessage(GOOD)])),
      input({ shortcuts: [hostile] }),
    )
    expect(result.source).toBe('llm')
    expect(result.payload?.bubbles).toEqual(GOOD.bubbles)
  })
})

describe('NinaTurnResult.firedShortcutIds — what the usage bump reads', () => {
  it('is [] on a turn with no shortcuts at all', async () => {
    const result = await runNinaTurnWith(fakeTurnDeps(scriptedClient([sendMessage(GOOD)])), input())
    expect(result.firedShortcutIds).toEqual([])
  })

  it('names the shortcut he typed, and only that one', async () => {
    const result = await runNinaTurnWith(
      fakeTurnDeps(scriptedClient([sendMessage(GOOD)])),
      input({
        runnerText: 'pengen 🍑 dong',
        shortcuts: [shortcut(), shortcut({ id: 'sc0000000002', trigger: '💦' })],
      }),
    )
    expect(result.firedShortcutIds).toEqual(['sc0000000001'])
  })

  it('is [] for a shortcut that is only STILL IN PLAY — it was counted when it fired', async () => {
    const result = await runNinaTurnWith(
      fakeTurnDeps(scriptedClient([sendMessage(GOOD)])),
      input({ runnerText: 'terusin', shortcuts: [shortcut()], recentRunnerTexts: ['pengen 🍑'] }),
    )
    expect(result.firedShortcutIds).toEqual([])
  })

  it('is present even on a turn that produced no reply at all', async () => {
    /* `lib/nina/actions.ts` bumps BEFORE it checks whether the session still exists or whether she
     * answered, so an `unavailable` result still has to carry the ids. */
    const result = await runNinaTurnWith(
      fakeTurnDeps(scriptedClient([new Error('502 upstream')])),
      input({ runnerText: 'pengen 🍑 dong', shortcuts: [shortcut()] }),
    )
    expect(result.source).toBe('unavailable')
    expect(result.firedShortcutIds).toEqual(['sc0000000001'])
  })
})
```

**Impact:** eleven new cases, no existing case edited. `runHistoryFixture` and `scriptedClient` are
already imported at `:1-15`. If Prettier reflows the long `userTurnOf(input({ … }))` line in the
second case, take Prettier's output — `npm run format` is the arbiter.

---

## Verification

**Build:** `npm run typecheck` then `npm run build`

**Tests:**

```
npx vitest run lib/nina/turn.test.ts tests/nina.resend.test.ts tests/nina.prompts.test.ts
npm test
npm run lint
npm run format:check
```

**Manual check — the four things that would be silently wrong:**

1. **The snapshot never moved.** `git status --porcelain tests/__snapshots__/nina.prompts.test.ts.snap`
   prints nothing, and no `-u` / `--update` was ever passed to vitest. Invariant 3.
2. **Invariant 2 is proved, not assumed — and it is proved against the RIGHT condition.** The first
   case in `userTurnText — the fired shortcut` compares three strings against a baseline built with
   the fields absent, and **each of the three misses on `recentRunnerTexts` as well as on
   `runnerText`**. That is not incidental: phase 1's `renderNinaShortcutBlock` deliberately returns
   a non-null block for an in-play-only hit, so a case that left a matching recent message in place
   would be asserting the opposite of phase 1's ruling. The case immediately after it is the
   positive proof that an in-play-only hit DOES emit a block. `shortcutBlock`'s empty-hits short
   circuit covers only the genuinely-empty case (`fired` and `inPlay` both empty), which is the same
   case `renderNinaShortcutBlock` already returns `null` for — it is belt to that brace and nothing
   in this suite may rest on it doing more.
3. **`grep -n "matchNinaShortcuts" lib/nina/actions.ts` prints nothing.** The matcher runs in
   exactly one file. If it ever appears in the action, the block and the counter can disagree.
4. **`node scripts/check-llm-payload-boundary.mjs`** (also run by lint/CI where wired) still passes:
   `runNinaTurn` was not renamed and no new caller was added.

**Exit criteria:**

- A `NinaTurnInput` whose `runnerText` contains `🍑` and whose `shortcuts` holds that row produces a
  `userTurnText` containing the whole expansion, positioned after the attached-run block and before
  `HE JUST SAID:`, and a `NinaTurnResult.firedShortcutIds` of `['<that id>']`.
- A `NinaTurnInput` with `shortcuts` absent, `[]`, or present-but-not-matching — **and with no
  matching message in `recentRunnerTexts` either** — produces a `userTurnText` byte-identical to the
  one produced with the field absent.
- A `NinaTurnInput` whose `runnerText` matches nothing but whose `recentRunnerTexts` carries a
  trigger produces a `userTurnText` that DOES contain that expansion, under the STILL IN PLAY
  header, with `firedShortcutIds` still `[]`.
- `NINA_PROMPT_VERSION === 6`, with comment 6 above it, and
  `tests/__snapshots__/nina.prompts.test.ts.snap` unmodified in `git status`.
- `npm run lint && npm run typecheck && npm test && npm run format:check` all green.

## Handoffs

- **An actions-level test file was considered and declined.** `tests/nina.resend.test.ts` already
  drives the real `runNinaBackgroundTurn` with mocked edges and is the only suite that does. A new
  `tests/nina.shortcutTurn.test.ts` would have to rebuild that entire ten-mock scaffold to assert
  two things (`listNinaShortcuts` is in the `Promise.all`, `bumpNinaShortcutUses` is called with
  `hits.fired`) whose logic lives in `turn.ts` and is already covered there. If a later card wants
  it, the cheapest home is three extra assertions inside `nina.resend.test.ts`'s existing drain
  block, not a new file.
- **`tests/nina.prompts.test.ts` is left untouched and the version floor stays `>= 3`. Settled at
  reconciliation:** no phase in this set raises it. `6 >= 3` holds, there is no equality assertion
  on the constant anywhere in the tree, and moving a floor nothing is testing would be an edit to a
  file this phase's own contract lists as not-touched. The index's phase-2 `Owns` no longer names
  this file.
- **Whether an in-play-only hit renders a block at all was Phase 1's ruling, and Phase 1 made it:
  it DOES.** `renderNinaShortcutBlock` returns a non-null block whenever `inPlay` is non-empty even
  if `fired` is empty, because `🫦` opens a mode that runs until `💦` and the instruction has to
  survive the turn where he only says "terusin". `turn.ts` does not second-guess it — it renders
  whatever the function returns and asserts only that `firedShortcutIds` stays `[]` — but this
  phase now carries BOTH sides of that ruling in `lib/nina/turn.test.ts`: every invariant-2
  byte-identity case is built to miss on `recentRunnerTexts` as well as on `runnerText`, and there
  is a positive case proving an in-play-only hit reaches the user turn under its STILL IN PLAY
  header. Without the positive case a regression that dropped `inPlay` from the block would keep
  this suite green.
- **`NINA_SHORTCUT_BLOCK_MAX_CHARS` truncation is Phase 1's**, applied inside
  `renderNinaShortcutBlock`. This phase does not clamp the block a second time.
- **Nothing here reaches `/admin/shortcuts` (R1) or the ledger importer (R3).** The `uses` /
  `last_used_at` column this phase writes is read by Phase 3's "fired" column; the rows it matches
  against are whatever Phase 3's UI or Phase 4's importer put in the table.
- **A drive-by noticed and NOT done:** `lib/nina/actions.ts:781`'s `loadNinaContext` and
  `dbNinaToolGateway.loadRunHistory` still run `getReviewedRunsWithChildren` twice per turn, as the
  comment at `:770-777` documents. Adding a fourth entry to that `Promise.all` does not make it
  worse and fixing it is the separate card that comment already asks for.

## Rollback

`git revert` this phase's single commit on `feature/nina-emoji-shortcuts`. Nothing else has to
happen: the two `NinaTurnInput` fields are optional so no caller needs unwinding, `NinaTurnResult`
loses a field that only `lib/nina/actions.ts` read, and `NINA_PROMPT_VERSION` returns to 5 — which
makes historical `nina_turns` rows written under 6 point at a constant value that no longer exists
in the tree, exactly as every previous bump's revert would. No schema, no migration, no production
write of its own: `bumpNinaShortcutUses` writes to Phase 1's table, and reverting this phase simply
stops calling it. Any `uses` counts already written stay, and are correct.
