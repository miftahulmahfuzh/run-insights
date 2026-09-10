> Adopted from `NINA_BURST_CANCEL_PLAN.md` phase 2. Source: `.workflows/plan/nina-burst-cancel/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 2: Answer the accumulated bubbles — burst framing in the turn prompt

**Plan set:** `NINA_BURST_CANCEL_PLAN.md`
**Analysis:** `20260910-090235-A7C2_code_analyzer.md`
**Satisfies:** R2 — the fresh turn answers ALL accumulated unanswered runner bubbles, not only the newest
**Depends on:** Phase 1
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

A turn opened over a burst of unanswered runner messages — the restart turn after phase 1's
supersede, a chained follow-up turn, or a resend — carries an explicit block naming every
unanswered runner message EXCEPT the newest as hers to answer together with what `HE JUST SAID:`
names. The list is computed inside `runNinaBackgroundTurn` from the context window it already
loads, so all three entry paths get the framing from one computation. A turn with no accumulated
messages produces a user turn byte-identical to today's (invariant 5 of the index; "invariant 2"
in `lib/nina/turn.test.ts`'s own numbering).

**SCOPE NOTE — read before the reconciler reads anything else.** The phase brief says "two
production files only: `lib/nina/turn.ts` and `lib/nina/actions.ts`". This plan touches a third:
`lib/nina/prompts/index.ts`, for exactly one line — the `NINA_PROMPT_VERSION` bump 6 → 7 plus its
changelog comment. That file's own convention (the version-6 entry is the template, written by the
nina-emoji-shortcuts set for the identical situation: a new conditional `userTurnText` block fed by
optional input fields) requires an assembler change to bump the version **in the same commit**, and
says "no other phase touches this constant" — one owner per set. There is no later phase in this
set to hand it to. Leaving it out means `nina_turns` can never distinguish a turn that was told
about the burst from one that wasn't, which is the entire audit value the column exists for.
Flagged here, in the Interface Contract, and as Step 4. **Reconciled: the bump stands.** The
reconciliation pass verified against `phase-1.md` that phase 1 touches neither
`lib/nina/prompts/index.ts` nor `lib/nina/turn.ts`, so the one-owner-per-set rule holds and Step 4
is sanctioned scope — recorded in the plan index's Reconciliation Log and Decisions.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No symbol, no config key, no column.

**Renames:** nothing.

**Creates:**
- `NinaTurnInput.earlierRunnerTexts?: readonly string[]` (`lib/nina/turn.ts`, field on the existing
  interface at `turn.ts:359`) — earlier unanswered RUNNER texts, **oldest first**, excluding the
  message this turn is answering, already capped by the caller. Optional; absent on every caller
  that does not set it (`lib/nina/proactive.ts`, `app/api/cron/nina/route.ts`, `tests/live/`,
  `tests/integration/`, every fixture).
- `NINA_BURST_MAX_MESSAGES = 6` (`lib/nina/turn.ts`, exported const) — the burst list's count cap.
  Lives in the prompt layer, mirroring `NINA_SHORTCUT_LOOKBACK` living in `lib/nina/shortcuts.ts`
  while `lib/nina/actions.ts` applies it.
- `burstBlock(earlier: readonly string[] | undefined, hasNewest: boolean): string | null`
  (`lib/nina/turn.ts`, module-private function) — the renderer.
- `NINA_BURST_HEADER` / `NINA_BURST_TRAILER` (`lib/nina/turn.ts`, module-private consts) — the
  block's protocol-register wording.
- `earlierRunnerTexts` local const inside `runNinaBackgroundTurn` (`lib/nina/actions.ts`) — the
  derived list; not exported, not a module symbol.
- `NINA_PROMPT_VERSION = 7` (was `6`) in `lib/nina/prompts/index.ts`, with a dated changelog
  comment in the file's established style.

**Signature changes:** none. `userTurnText(input, hits)` keeps its signature; its body gains one
conditional push. `runNinaBackgroundTurn` keeps its signature.

**Requires (from earlier phases):** Phase 1 must have landed first (`depends_on: [1]`), and —
VERIFIED against `phase-1.md` and the source during reconciliation:
- `runNinaBackgroundTurn` (`lib/nina/actions.ts`) still opens with the same destructuring
  (`const { userId, sessionId, turnId, runnerMessageId } = input`), still runs the same
  `Promise.all` context load, still derives `quoted` and `recentRunnerTexts` from
  `loadedContext.conversation.window`, and still calls `runNinaTurn` with the same input object.
  Phase 1's ownership re-check and discard path are POST-call: inserted between the shortcut
  bump's closing brace (currently `actions.ts:982`) and the "THE SESSION MAY HAVE BEEN DELETED"
  comment (currently `:984`) — below `source = result.source`. This phase inserts its two edits
  BEFORE the `runNinaTurn` call (the walk after `recentRunnerTexts`'s
  `.slice(0, NINA_SHORTCUT_LOOKBACK)` at `:923`; the input key after `recentRunnerTexts,` at
  `:949`) and both MUST STAY ABOVE phase 1's exit: the discard must never sit where it could skip
  a computation the turn's input needed. Nothing this phase does may move that exit or anything
  below it.
- Phase 1's only other `actions.ts` edit — the supersede attempt in `sendNinaMessage`, between
  the sweep's try/catch (ends `:716`) and `let turnId: string | null = null` (`:718`) — is in a
  different function and only shifts this file's line numbers; every edit here is anchored by
  quoted code for exactly that reason.
- The send path's convention `runnerText: text.length > 0 ? text : null` (null for a photo-only
  message) is unchanged — the burst block's `hasNewest` argument depends on it.
- Phase 1 does not touch `lib/nina/turn.ts`, `lib/nina/prompts/index.ts`, or
  `lib/nina/turn.test.ts` (its ownership list: `chatturn.ts` + `actions.ts`'s cancel attempt and
  discard path + their tests).

**Leaves alone (owned by others):**
- `lib/nina/chatturn.ts` — entirely phase 1's.
- `sendNinaMessage`'s claim sequence (sweep / supersede attempt / `openNinaChatTurn`) — phase 1's.
  This phase reads `runnerMessageId` out of `runNinaBackgroundTurn`'s input; it does not touch how
  the claim was opened.
- `lib/nina/turnflight.ts`, the chain's bounds, `resendNinaMessage`'s `'turn-live'` refusal, the
  client (`components/nina/*`), the schema, and `drizzle/` — nobody's to touch in this set.
- `lib/nina/proactive.ts` and `app/api/cron/nina/route.ts` — they call `runNinaTurn` without the
  new field and stay byte-identical.

**Files this phase edits:** `lib/nina/turn.ts`, `lib/nina/actions.ts`,
`lib/nina/prompts/index.ts` (the one flagged line), `lib/nina/turn.test.ts`,
`tests/nina.resend.test.ts`.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/turn.ts` | modify | `NinaTurnInput` gains `earlierRunnerTexts`; new exported `NINA_BURST_MAX_MESSAGES`; new private `burstBlock` + its two wording consts; one conditional push in `userTurnText`; the shortcut block's "IMMEDIATELY BEFORE" comment made truthful |
| `lib/nina/actions.ts` | modify | `./turn` import gains `NINA_BURST_MAX_MESSAGES`; `runNinaBackgroundTurn` derives `earlierRunnerTexts` from the window it already loaded and passes it into the `runNinaTurn` input |
| `lib/nina/prompts/index.ts` | modify | `NINA_PROMPT_VERSION` 6 → 7 with the file's changelog-comment convention (flagged scope note above) |
| `lib/nina/turn.test.ts` | modify | new describes: the walk (`burstTextsFromWindow`'s counterpart), the rendered block, zero-byte invariant, position, cap |
| `tests/nina.resend.test.ts` | modify | the `@/lib/nina/turn` mock factory carries the real constant (via `importOriginal` spread); new trailing describe asserting the derivation through the drained background turn |

## Implementation Steps

> **Line numbers.** `lib/nina/turn.ts`, `lib/nina/prompts/index.ts` and `lib/nina/turn.test.ts`
> are quoted at their CURRENT line numbers: phase 1 does not touch them (verified against
> `phase-1.md` — its Files table owns `chatturn.ts`, `actions.ts` and four test files only).
> `lib/nina/actions.ts` and `tests/nina.resend.test.ts` are quoted AS PHASE 1 LEAVES THEM. Phase 1
> inserts the supersede attempt in `sendNinaMessage` (between the sweep's try/catch and `let
> turnId`, ~30 lines above `runNinaBackgroundTurn`'s definition) and the ownership re-check inside
> `runNinaBackgroundTurn` (between the shortcut bump and the session-exists comment — POST-call,
> BELOW this phase's two anchors), so `actions.ts`'s absolute numbers below are shifted down by
> phase 1's insertion; the resend test's numbers below are the CURRENT ones, shifted by phase 1's
> chatturn const/factory additions above them. **Locate every `actions.ts` and resend-test edit by
> the quoted anchor code, not by line number.**

### Step 1: `NinaTurnInput` gains the burst field

**File:** `lib/nina/turn.ts:359` (between `recentRunnerTexts` and `proactive`)
**Change:** one new optional field, immediately after `recentRunnerTexts?: readonly string[]` and
before the `proactive` doc comment. The name `earlierRunnerTexts` parallels the file's existing
`recentRunnerTexts` voice, as the phase brief prefers.
**Code:**

```ts
  recentRunnerTexts?: readonly string[]
  /**
   * **R2 (the burst-cancel set).** The RUNNER messages this turn must answer TOGETHER WITH
   * `runnerText` — what he sent in a row WITHOUT waiting for a reply: **oldest first**,
   * **excluding the message this turn is answering** (that one is `runnerText`), **excluding every
   * message a reply of hers already answered**, and **already capped to
   * `NINA_BURST_MAX_MESSAGES` by the caller**. The caller owns the window and the renderer owns
   * the wording, and a cap applied in two places is a cap that drifts — the same ruling
   * `recentRunnerTexts` states as "already sliced by the caller".
   *
   * It exists because `'HE JUST SAID:'` names ONE message, and a burst is not one message. Without
   * this field the restart turn's prompt is byte-identical to an ordinary turn's, and she answers
   * "dan makan apa lunch?" with no way to know "mau kemana hari ini?" is still standing unanswered
   * in front of it — the exact failure the burst-cancel set exists to remove.
   *
   * **Not to be confused with `recentRunnerTexts` directly above.** That one feeds the shortcut
   * matcher and carries his last few messages REGARDLESS of whether she answered them; this one
   * feeds the framing and carries only the messages THIS reply must answer. A message can be in
   * both, neither, or either alone, and neither list may be derived from the other: the first is
   * "recent, both roles' replies notwithstanding", the second is "unanswered, hers excluded".
   *
   * Absent, `[]`, and "present but every entry empty" are the SAME turn: **zero burst bytes**
   * (invariant 2), asserted in `lib/nina/turn.test.ts`.
   */
  earlierRunnerTexts?: readonly string[]
  /** Phase 10's `PROACTIVE_INSTRUCTIONS[kind]`, appended to the user turn. */
  proactive?: string | null
```

**Impact:** purely additive to the type. Every existing call site compiles unchanged (the field is
optional); every existing turn renders byte-identically (Step 3 pushes nothing when it is absent).

### Step 2: the cap, the wording, and the renderer

**File:** `lib/nina/turn.ts:458` (insert as a unit between the end of `shortcutBlock` — line 456,
`}` — and the `userTurnText` doc comment at line 458)
**Change:** the exported cap constant, the block's two protocol-register strings, and the private
renderer. Protocol register, never persona: the file's precedent is `NINA_SEND_NUDGE` (this file)
and `quoteContextBlock` (`lib/nina/reply.ts`) — ALL-CAPS situational header, facts, one
instruction line. Phase 2 owns every word Nina is given about who she is; nothing here is one.
**Code:**

```ts
/* ============================================================================
 * R2 (the burst-cancel set) — the burst. The messages he sent in a row without waiting, named so
 * the turn answers all of them and not only the newest.
 * ==========================================================================*/

/**
 * How many earlier unanswered messages the burst block names, at most.
 *
 * Sized against the two numbers that bound this payload: the window is 40 rows
 * (`CONTEXT_MESSAGE_WINDOW`, `lib/nina/load.ts:64`) and each runner message is up to 4 000
 * characters (`MAX_RUNNER_MESSAGE_CHARS`, `lib/nina/schema.ts:44`) — so an UNCAPPED block over a
 * window full of unanswered monologue is 39 × 4 000 ≈ 156 KB, and a single turn's payload would be
 * a function of how long he is willing to type. Six bounds the absolute worst case at
 * 6 × 4 000 = 24 KB, which is still only arithmetic worst case: the bursts this app actually
 * produces are two or three messages of a few words each ("eh", "nina", "gimana" — the chain
 * block's own example in `lib/nina/actions.ts`), so the common cost of the block is one header and
 * two short lines.
 *
 * Six and not fewer, because it is the same "how far back is still one thought" distance
 * `NINA_SHORTCUT_LOOKBACK` chose for the same medium (`lib/nina/shortcuts.ts:85`). Six and not
 * two, because this block is the ONLY place the earlier messages are named as hers to answer: the
 * window JSON carries them, but nothing in it says they are unanswered.
 *
 * **A count cap, and deliberately not a character budget.** `renderNinaShortcutBlock` clamps to
 * `NINA_SHORTCUT_BLOCK_MAX_CHARS` because an expansion is admin-written data of unbounded size
 * riding along on every turn. A burst message is a message she is being TOLD to answer, and
 * truncating or dropping one turns "answer ALL of them" into a lie in exactly the case the
 * requirement is about. The count is the bound; the messages under it go whole.
 *
 * Lives in THIS file and not in `lib/nina/actions.ts` for the reason
 * `NINA_SHORTCUT_LOOKBACK` lives in `lib/nina/shortcuts.ts`: it is the prompt layer's policy about
 * what she is told, applied by the caller that owns the window — one authority, testable from
 * `lib/nina/turn.test.ts`.
 */
export const NINA_BURST_MAX_MESSAGES = 6

/**
 * The burst block's own words. PROTOCOL text, not persona text — the loop telling her what
 * happened to the conversation, in the same register as `NINA_SEND_NUDGE` above and
 * `quoteContextBlock` in `lib/nina/reply.ts`. "WITHOUT WAITING FOR YOUR REPLY" rather than "while
 * you were still thinking" because the block is reached by three paths (the restart turn after a
 * supersede, a chained follow-up, a resend) and only the first of them is literally "thinking".
 */
const NINA_BURST_HEADER =
  'HE SENT SEVERAL MESSAGES IN A ROW WITHOUT WAITING FOR YOUR REPLY — none of them has been ' +
  'answered yet. The earlier ones are below, oldest first. Answer ALL of them in this ONE reply:'

/**
 * Only when a newest message actually follows. A burst whose newest message is a PHOTO has
 * `runnerText: null`, no `'HE JUST SAID:'` heading is rendered, and pointing at one that is not
 * there would be a lie — the photograph still reaches her through the window's
 * `imageDescriptions`, and "answer ALL of them" is the whole instruction she needs.
 */
const NINA_BURST_TRAILER =
  'His newest message is under "HE JUST SAID:" — answer it too, not only the ones listed above.'

/**
 * The rendered burst block, or null.
 *
 * **Null is the invariant.** Absent input, an empty list, and a list whose every entry is blank
 * all render NOTHING — no header, no empty bullets, not one byte (invariant 2). The empty-entry
 * skip is enforced HERE as well as at the producer because this function is the last thing between
 * an input and the payload: a future caller that hands it a `''` gets one fewer bullet, not a
 * blank line the model reads as "he said something unsayable".
 *
 * Each message is collapsed to one line before it becomes a bullet — `quotePreview`'s reason in
 * `lib/nina/reply.ts`: the bubble may be `whitespace-pre-wrap` because her line breaks are how she
 * talks, but a LIST he is being told to answer must read as a list, and a multi-line message
 * spending its lines on blank lines breaks the bullet framing. The character cap therefore keeps
 * meaning characters of message, not of `\n`.
 *
 * `hasNewest` — whether `'HE JUST SAID:'` will actually follow this block (Step 3 computes it
 * from `input.runnerText`, which is null for a photo-only newest message).
 */
function burstBlock(earlier: readonly string[] | undefined, hasNewest: boolean): string | null {
  const texts = (earlier ?? [])
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 0)
  if (texts.length === 0) return null
  const lines = [NINA_BURST_HEADER, ...texts.map((text) => `- ${text}`)]
  if (hasNewest) lines.push(NINA_BURST_TRAILER)
  return lines.join('\n')
}
```

**Impact:** no existing symbol changes; `NINA_BURST_MAX_MESSAGES` is a new export from a file that
already exports constants (`NINA_TURN_BUDGET`, `MAX_TOOL_ROUNDS`, `NINA_MAX_TOKENS`).

### Step 3: render the block in `userTurnText`, after the shortcut block

**File:** `lib/nina/turn.ts:509-527` (the shortcut push and the `HE JUST SAID:` push)
**Change:** two edits in one function body. First, the shortcut block's comment claims
"IMMEDIATELY BEFORE `'HE JUST SAID:'`", which stops being true the moment the burst block sits
between them — fix it so the comment stays truthful. Second, insert the conditional burst push
between the shortcut push and the `HE JUST SAID:` push.
**Code** — replace the comment plus the shortcut push plus the `HE JUST SAID:` push (the whole
block from `/*` at line 509 through the closing `}` of the runnerText push at line 527) with:

```ts
  /*
   * R2. AFTER the attached run and BEFORE `'HE JUST SAID:'` — for the reason R12 gives one block
   * up: this is the standing instruction his next sentence has to be read UNDER, so she reads it
   * before the sentence rather than after it. Below the run block because a run he attached is the
   * SUBJECT of the message, while the shortcut is the register the message is in.
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

  /*
   * **R2 (the burst-cancel set).** AFTER the shortcut block and STILL immediately before
   * `'HE JUST SAID:'` — the last thing she reads before the message she is answering, because the
   * block's entire job is to make that message NOT the only one on the table. Below the shortcut
   * block because a shortcut is the register a message is written in and the burst is WHICH
   * messages are being answered — register before scope, the same ordering the attached-run block
   * argues above. The burst block is the ONE block allowed between the shortcut block and his
   * message, and its own trailer is what re-ties the two.
   *
   * **A turn with no burst pushes nothing** — absent input, an empty list, and a list whose every
   * entry is empty all render zero bytes (invariant 2). That is every ordinary turn, every
   * proactive turn, and the resend of a message with no burst behind it.
   */
  const burst = burstBlock(
    input.earlierRunnerTexts,
    input.runnerText != null && input.runnerText.length > 0,
  )
  if (burst != null) {
    parts.push(burst)
  }

  if (input.runnerText != null && input.runnerText.length > 0) {
    parts.push('HE JUST SAID:', input.runnerText)
  }
```

**Impact:** with `earlierRunnerTexts` absent the rendered string is byte-identical to today's —
the invariant-2 tests in `lib/nina/turn.test.ts` (shortcuts block, line 629) keep passing untouched,
and Step 6 adds the same discipline for this field.

### Step 4: the prompt version bump (flagged scope note above)

**File:** `lib/nina/prompts/index.ts:52-71`
**Change:** append the version-7 changelog entry in the file's established style and bump the
constant. The version-6 entry (written by the nina-emoji-shortcuts set for the identical
assembler-only change) is the template and its ruling is quoted into the new entry.
**Code** — replace the `export const NINA_PROMPT_VERSION = 6` line, leaving the version-6 comment
block above it untouched, with:

```ts
/* 7 — the nina-burst-cancel set, R2. **NO SYSTEM TEXT MOVED AND NO TOOL SCHEMA MOVED.**
 * `./system.ts` and `./tools.ts` were not opened; `buildNinaSystemPrompt` is byte-identical to
 * version 6's at every tuning and `tests/__snapshots__/nina.prompts.test.ts.snap` passes
 * UNREGENERATED. What changed is the ASSEMBLER: `userTurnText` in `lib/nina/turn.ts` gained one
 * conditional block — the burst block, naming the messages he sent in a row without waiting for a
 * reply as hers to answer together with `'HE JUST SAID:'`, rendered by `burstBlock` and pushed
 * after the shortcut block and immediately before `'HE JUST SAID:'` — fed by one new OPTIONAL
 * field on `NinaTurnInput`, `earlierRunnerTexts`, computed by `runNinaBackgroundTurn` from the
 * context window it already loaded (`lib/nina/actions.ts`) and capped by
 * `NINA_BURST_MAX_MESSAGES`. A turn with no unanswered burst pushes nothing at all and is
 * byte-for-byte version 6's user turn, which `lib/nina/turn.test.ts` asserts three ways (field
 * absent, `[]`, and a list whose every entry is empty).
 *
 * **The bump is still correct, and version 6's own entry says why in as many words:**
 * `NINA_PROMPT_VERSION` now identifies the ASSEMBLER, not the output, and what the constant buys
 * is that a change in her behaviour can be dated to the commit that caused it. A turn that now
 * answers three messages where it could never before have been told about two of them is such a
 * change, so `nina_turns` has to be able to tell those turns from version 6's. This is the SINGLE
 * bump for the whole set: phase 2 owns it and no other phase touches this constant, because two
 * bumps would date two commits to one change. */
export const NINA_PROMPT_VERSION = 7
```

**Impact:** `tests/nina.prompts.test.ts` pins only `Number.isInteger`, `toBeGreaterThan(0)` and
`toBeGreaterThanOrEqual(3)` — no literal. The snapshot passes unregenerated (no system text, no
tool schema moved — same as the 5 → 6 bump). `lib/nina/load.ts` picks the new value up unchanged.

### Step 5: derive the list in `runNinaBackgroundTurn` and pass it through

**File:** `lib/nina/actions.ts` — three edits, all inside/near `runNinaBackgroundTurn`, quoted AS
PHASE 1 LEAVES THE FILE. Phase 1's discard path lands AFTER the `runNinaTurn` call; both of this
phase's anchors are before it, so no interleaving is expected.

**5a — the import (current line 54; anchor: the `./turn` import):**

```ts
import {
  NINA_BURST_MAX_MESSAGES,
  NINA_TURN_BUDGET,
  productionDeps,
  runNinaTurn,
  type NinaTurnSource,
} from './turn'
```

**5b — the walk. Anchor:** the end of the `recentRunnerTexts` derivation (currently
`actions.ts:919-923`; the block is untouched by phase 1 — it is pre-call, and phase 1's concern is
post-call). Insert immediately after `.slice(0, NINA_SHORTCUT_LOOKBACK)` and before the
`/* STEP 3 — the turn. */` comment:

```ts
    /*
     * **R2 (the burst-cancel set).** The earlier messages of the burst this turn answers — what he
     * sent in a row WITHOUT waiting for a reply, every one of them still unanswered when this turn
     * was opened. `'HE JUST SAID:'` names the newest; without this list the restart turn's prompt
     * is byte-identical to an ordinary turn's, and she answers "dan makan apa lunch?" with no way
     * to know "mau kemana hari ini?" is standing unanswered in front of it.
     *
     * **No new query**, for the reason the block above already argues: `loadNinaContext` has
     * already loaded the window, OLDEST FIRST with both roles in it
     * (`ConversationFacts.window`, `lib/nina/context.ts:286`). The walk is three predicates, and
     * each is load-bearing:
     *
     *   · `role === 'nina'` ENDS the walk — everything above her row was answered by the reply it
     *     precedes, and naming it would ask her to answer it twice;
     *   · `turn.id === runnerMessageId` is SKIPPED, not collected — that message is
     *     `input.runnerText`, already named by `'HE JUST SAID:'`, and the exclusion is BY ID
     *     because two identical texts are two messages ("eh", "eh");
     *   · `turn.text.length === 0` is SKIPPED — a photo-only message's `body` is `''` (`runnerText`
     *     is null for it on both the send and the chain path), and an empty bullet is a rendering
     *     bug, not a message. The walk does NOT stop for one: the photograph is still part of the
     *     burst, and it still reaches her through the window's `imageDescriptions`.
     *
     * The newest `NINA_BURST_MAX_MESSAGES` survive — see the constant's note in `lib/nina/turn.ts`
     * for the 40-row-window × 4 000-character arithmetic that makes the cap arithmetic, not taste.
     *
     * **All three paths get this from one computation, which is the set's exit criterion**: the
     * restart turn after phase 1's supersede, a chained follow-up, and a resend all arrive HERE,
     * so all three frame the burst identically. Cannot throw — pure array reads over rows already
     * in memory (INVARIANT 7). An empty walk is the ordinary single-message turn and costs zero
     * bytes downstream (invariant 2 of the prompt layer).
     */
    const burstTexts: string[] = []
    for (let i = loadedContext.conversation.window.length - 1; i >= 0; i -= 1) {
      const turn = loadedContext.conversation.window[i]!
      if (turn.role === 'nina') break
      if (turn.id === runnerMessageId) continue
      if (turn.text.length === 0) continue
      burstTexts.push(turn.text)
    }
    const earlierRunnerTexts = burstTexts.reverse().slice(-NINA_BURST_MAX_MESSAGES)
```

(The walk collects newest-first; `.reverse()` makes it oldest-first and `.slice(-…)` then keeps the
NEWEST six — the oldest fall off, never the ones adjacent to `'HE JUST SAID:'`.)

**5c — the pass-through. Anchor:** the `runNinaTurn` input object (currently `actions.ts:937-951`;
phase 1 does not alter this object — its edits are after the call). Add one key after
`recentRunnerTexts,`:

```ts
    const result = await runNinaTurn(
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
        earlierRunnerTexts,
      },
      { ...productionDeps(), toolSet: NINA_FULL_TOOL_SET, store: ninaChatTurnStore(turnId) },
    )
```

**Impact:** no new query, no new model call site (`scripts/check-llm-payload-boundary.mjs` greps
for `runNinaTurn` call sites; this is the existing one), no throw path. The chain's recursive call
at the bottom of `runNinaBackgroundTurn` needs no edit: it calls THIS function, which derives the
list itself — the chain and the resend path inherit the framing for free.

### Step 6: prompt-layer tests

**File:** `lib/nina/turn.test.ts` — two new describes. Add `burstTextsFromWindow`-independent
imports: extend the existing `./turn` import (line 20-28) with `NINA_BURST_MAX_MESSAGES`, and add
`type ConversationTurn` to the `./context` import (`turn.test.ts` does not currently import from
`./context`; add `import type { ConversationTurn } from './context'` below the existing imports).

**Code** — append at the end of the file:

```ts
/* ============================================================================
 * R2 (the burst-cancel set) — the accumulated messages. The WALK lives in `lib/nina/actions.ts`
 * and is proven through the drained background turn in `tests/nina.resend.test.ts`; this block
 * proves the prompt layer's half: the cap's bound, and the WORDS the walk's output becomes.
 * ========================================================================= */

/** A `ConversationTurn` as `conversationFacts` builds one (`lib/nina/context.ts:693`). */
function windowTurn(
  id: string,
  role: 'runner' | 'nina',
  text: string,
  over: Partial<ConversationTurn> = {},
): ConversationTurn {
  return {
    id,
    role,
    text,
    sentOnISO: '2026-09-10',
    sentAtLabel: 'Thu 10 Sep 09:00',
    daysAgo: 0,
    replyToId: null,
    runId: null,
    imageDescriptions: [],
    ...over,
  }
}

describe('NINA_BURST_MAX_MESSAGES — the cap', () => {
  it('bounds the block to a handful — the payload must not be a function of how long he types', () => {
    /* 40 window rows × 4 000 chars would be ~156 KB uncapped; the cap keeps the absolute worst
     * case at a few whole messages. The precise value is prompt policy — pinned small, with WHICH
     * end survives the cap pinned by the walk's own test in `tests/nina.resend.test.ts`. */
    expect(NINA_BURST_MAX_MESSAGES).toBeGreaterThanOrEqual(2)
    expect(NINA_BURST_MAX_MESSAGES).toBeLessThanOrEqual(8)
  })
})

describe('userTurnText — the burst (R2, the burst-cancel set)', () => {
  it('carries ZERO burst bytes when no earlier message is unanswered — INVARIANT 2, three ways', async () => {
    /* The baseline is the turn as this file built it before the feature existed. Every case below
     * must produce it byte for byte: the field ABSENT (what `lib/nina/proactive.ts`, the cron
     * route and every live test still pass), explicitly `[]`, and a list whose every entry is
     * empty — the photo-only degenerate case the renderer is the last guard against. */
    const baseline = await userTurnOf(input())
    expect(await userTurnOf(input({ earlierRunnerTexts: undefined }))).toBe(baseline)
    expect(await userTurnOf(input({ earlierRunnerTexts: [] }))).toBe(baseline)
    expect(await userTurnOf(input({ earlierRunnerTexts: ['', '   '] }))).toBe(baseline)
  })

  it('names the earlier messages as hers to answer together with HE JUST SAID', async () => {
    const userTurn = await userTurnOf(
      input({
        runnerText: 'dan makan apa lunch?',
        earlierRunnerTexts: ['mau kemana hari ini?', 'jangan lupa ya'],
      }),
    )
    expect(userTurn).toContain('WITHOUT WAITING FOR YOUR REPLY')
    expect(userTurn).toContain('- mau kemana hari ini?')
    expect(userTurn).toContain('- jangan lupa ya')
    expect(userTurn).toContain('answer it too, not only the ones listed above')
    /* The newest is named by the existing block, never duplicated as a bullet. */
    expect(userTurn.indexOf('- dan makan apa lunch?')).toBe(-1)
    expect(userTurn).toContain('HE JUST SAID:')
  })

  it('sits AFTER the shortcut block and IMMEDIATELY BEFORE `HE JUST SAID:`', async () => {
    const history = runHistoryFixture()
    const userTurn = await userTurnOf(
      input({
        history,
        runnerText: 'abis ini 🍑 ya',
        shortcuts: [shortcut()],
        earlierRunnerTexts: ['mau kemana hari ini?'],
      }),
    )
    const run = userTurn.indexOf('HE ATTACHED THIS RUN TO HIS MESSAGE')
    const peach = userTurn.indexOf(PEACH)
    const burst = userTurn.indexOf('WITHOUT WAITING FOR YOUR REPLY')
    const said = userTurn.indexOf('HE JUST SAID:')
    expect(run).toBeGreaterThanOrEqual(0)
    expect(peach).toBeGreaterThan(run)
    expect(burst).toBeGreaterThan(peach)
    expect(said).toBeGreaterThan(burst)
  })

  it('drops the trailer when the newest message is a photo — there is no HE JUST SAID: to point at', async () => {
    const userTurn = await userTurnOf(
      input({
        runnerText: null,
        sourceMessageId: null,
        earlierRunnerTexts: ['mau kemana hari ini?'],
      }),
    )
    expect(userTurn).toContain('- mau kemana hari ini?')
    expect(userTurn).not.toContain('answer it too, not only the ones listed above')
    expect(userTurn).not.toContain('HE JUST SAID:')
  })

  it('collapses each message to one line — the list must read as a list', async () => {
    const userTurn = await userTurnOf(input({ earlierRunnerTexts: ['satu\n\ndua   tiga'] }))
    expect(userTurn).toContain('- satu dua tiga')
  })

  it('renders every entry it is given — the CAP IS THE CALLER’S, as recentRunnerTexts already rules', async () => {
    const many = Array.from({ length: NINA_BURST_MAX_MESSAGES + 3 }, (_, i) => `pesan ${i}`)
    const userTurn = await userTurnOf(input({ earlierRunnerTexts: many }))
    for (const text of many) {
      expect(userTurn).toContain(`- ${text}`)
    }
  })
})
```

**Impact:** none on existing tests — the baseline in the invariant-2 case is computed from
`input()`, which does not carry the new field.

### Step 7: derivation tests through the drained background turn

**File:** `tests/nina.resend.test.ts` — two edits. The walk itself lives in
`runNinaBackgroundTurn` (a `'use server'` module cannot export a non-async helper for unit tests),
so this harness — which already proves "the background turn is rebuilt from the persisted row" by
draining the deferred callback — is where the derivation is proven.

**7a — the mock factory (anchor: the `vi.mock('@/lib/nina/turn', …)` block — currently
`tests/nina.resend.test.ts:109-114`, and VERIFIED untouched by phase 1: its edits to this file are
the chatturn const block and factory (lines 82-94), two `beforeEach` defaults, and one extra
assertion inside the 'sweeps, then opens ONE claim' test, all away from this block). Apply onto
the file AS PHASE 1 LEAVES IT — that sequencing is required, not incidental: phase 1's `beforeEach`
defaults (`supersedeNinaChatTurn` → `false`, `chatTurnWasSuperseded` → `false`) are what let Step
7b's drained turns reach the normal persistence path these tests read.**

```ts
vi.mock('@/lib/nina/turn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/turn')>()
  return {
    ...actual,
    /* Everything real EXCEPT the model call and the production deps: the drain below reads the
     * `NinaTurnInput` this action assembles, and `NINA_BURST_MAX_MESSAGES` must stay the REAL
     * constant so the derivation under test is capped by the value the prompt layer owns. The
     * real module loads clean under Vitest — `lib/nina/turn.test.ts` imports it unmocked, and
     * `tests/support/setup.ts` carries the env the import graph needs. */
    productionDeps: () => ({}),
    runNinaTurn: (...a: unknown[]) => runNinaTurn(...a),
  }
})
```

(The old hand-written `NINA_TURN_BUDGET: { overall: 45_000 }` override is subsumed by the spread —
the real module's budget IS the 45 000 literal the old comment wanted.)

**7b — the derivation tests. Append at the end of the file:**

```ts
/* ── the burst framing (the burst-cancel set, R2) ─────────────────────────────────────────── */

/** A `ConversationTurn` as `loadNinaContext` builds one — the shape the burst walk reads. */
function windowTurn(id: string, role: 'runner' | 'nina', text: string) {
  return {
    id,
    role,
    text,
    sentOnISO: '2026-09-10',
    sentAtLabel: 'Thu 10 Sep 09:00',
    daysAgo: 0,
    replyToId: null,
    runId: null,
    imageDescriptions: [] as string[],
  }
}

describe('the turn carries the burst it was opened over (R2)', () => {
  it('names every unanswered message except the resent one, oldest first', async () => {
    loadNinaContext.mockResolvedValue({
      conversation: {
        window: [
          windowTurn(HERS, 'nina', 'answered'),
          windowTurn('msgaaa000001', 'runner', 'mau kemana hari ini?'),
          windowTurn('msgbbb000001', 'runner', 'jangan lupa ya'),
          windowTurn(HIS, 'runner', 'dan makan apa lunch?'),
        ],
      },
    })

    await actions.resendNinaMessage({ messageId: HIS })
    await deferred[0]!()

    expect(runNinaTurn).toHaveBeenCalledOnce()
    const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]
    expect(turnInput.earlierRunnerTexts).toEqual(['mau kemana hari ini?', 'jangan lupa ya'])
    /* The resent message itself is `runnerText`, never also a bullet. */
    expect(turnInput.runnerText).toBe('dan makan apa lunch?')
  })

  it('stops at her first row below the burst, skips a photo-only row, and excludes by id', async () => {
    loadNinaContext.mockResolvedValue({
      conversation: {
        window: [
          windowTurn('msgold000001', 'runner', 'answered already'),
          windowTurn(HERS, 'nina', 'the answer'),
          /* Photo-only mid-burst: skipped as a bullet, and it does NOT end the walk. */
          windowTurn('msgphoto001', 'runner', ''),
          windowTurn('msgaaa000001', 'runner', 'mau kemana?'),
          windowTurn(HIS, 'runner', 'dan makan apa?'),
        ],
      },
    })

    await actions.resendNinaMessage({ messageId: HIS })
    await deferred[0]!()

    const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]
    expect(turnInput.earlierRunnerTexts).toEqual(['mau kemana?'])
  })

  it('caps the list at the NEWEST NINA_BURST_MAX_MESSAGES — the oldest fall off, not the newest', async () => {
    const burst = Array.from({ length: 8 }, (_, i) =>
      windowTurn(`msgb${String(i).padStart(8, '0')}`, 'runner', `pesan ${i}`),
    )
    loadNinaContext.mockResolvedValue({
      conversation: {
        window: [windowTurn(HERS, 'nina', 'answered'), ...burst, windowTurn(HIS, 'runner', 'ok')],
      },
    })

    await actions.resendNinaMessage({ messageId: HIS })
    await deferred[0]!()

    const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]
    const texts = turnInput.earlierRunnerTexts as string[]
    expect(texts).toHaveLength(NINA_BURST_MAX_MESSAGES)
    /* Eight unanswered messages, cap 6: the walk collects newest-first (`pesan 7` … `pesan 0`),
     * reverses to oldest-first, and `.slice(-6)` keeps the NEWEST six — `pesan 2` … `pesan 7`. The
     * two OLDEST fall off, never the ones adjacent to `HE JUST SAID:`. */
    expect(texts).toEqual(['pesan 2', 'pesan 3', 'pesan 4', 'pesan 5', 'pesan 6', 'pesan 7'])
  })

  it('derives nothing extra on an ordinary resend with no burst behind it', async () => {
    /* The `beforeEach` default window is empty, which is also the walk's answer for a resend whose
     * target has no unanswered siblings: invariant 2, at the derivation rather than the renderer. */
    await actions.resendNinaMessage({ messageId: HIS })
    await deferred[0]!()

    const [turnInput] = runNinaTurn.mock.calls[0]! as [Record<string, unknown>]
    expect(turnInput.earlierRunnerTexts).toEqual([])
  })
})
```

…and add `NINA_BURST_MAX_MESSAGES` to the type-only import the file gains for the cap test:

```ts
import { NINA_BURST_MAX_MESSAGES } from '@/lib/nina/turn'
```

placed with the other imports at the top (the mocked module resolves `NINA_BURST_MAX_MESSAGES`
through the spread of the real module, so the import sees the real value).

**Impact:** the existing drain tests read individual properties off `turnInput`, never `toEqual`
on the whole object, so the new key breaks nothing. The mocked turn module is imported by
`lib/nina/actions.ts` for the constant only; `runNinaTurn` stays the mock.

## Verification

**Prerequisite:** this worktree has no `node_modules` and no `.env.local` (verified). Run
`npm install` and copy `.env.local` from the primary checkout before anything below — `lib/env.ts`
parses at import, and typecheck/lint/vitest all die without it
(`tests/support/setup.ts` supplies the LLM dummies, but the file itself must exist for anything
that reads more).

**Build:** `npx tsc --noEmit` (or `npm run typecheck`, which also runs `next typegen`)
**Lint:** `npm run lint` and `npx prettier --check lib/nina/turn.ts lib/nina/actions.ts lib/nina/prompts/index.ts lib/nina/turn.test.ts tests/nina.resend.test.ts` — format only the files this
phase touched (`npm run format` is repo-wide and would sweep unrelated dirt into the diff)
**Tests:**
- `npm run test -- lib/nina/turn.test.ts tests/nina.resend.test.ts tests/nina.prompts.test.ts`
- then the full gate: `npm run test`
- invariant 8: `npm run ci:llm-payload-guard` (no new `runNinaTurn` call site was added; this must
  stay green)
- invariant 6: no migration — `npm run db:check` untouched and clean (no `drizzle/` file added)

**Manual check:** none on a screen — the block is invisible by design (no client change). If a
manual look is wanted, the prompt is inspectable only through a live turn, which costs money and
is out of scope; the drained-turn test in Step 7 is the honest equivalent.

**Exit criteria** (from the index): a turn opened over a burst of unanswered runner messages
carries an explicit block naming every unanswered message except the newest as hers to answer
together; a turn with no accumulated messages produces a byte-identical user turn to before
(invariant 5); the chain path and the resend path get the same framing for free because it is
computed from the window — asserted by Step 7 (the resend path runs through the same
`runNinaBackgroundTurn` body the chain recurses into).

## Assumptions — VERIFIED against `.workflows/plan/nina-burst-cancel/phase-1.md`

This file was written before `phase-1.md` existed (the planners run concurrently). The
reconciliation pass has since verified every expectation below against phase 1's actual contract
and the source tree; they are recorded as facts, not hedges:

1. **Phase 1 does not touch `lib/nina/turn.ts`, `lib/nina/prompts/index.ts`, or
   `lib/nina/turn.test.ts`** — verified: its Files table owns `lib/nina/chatturn.ts`,
   `lib/nina/actions.ts`, and four test files (`chatturn.test.ts` and `nina.burstCancel.test.ts`
   new; `nina.resend.test.ts` and `nina.chatPhotoReattach.test.ts` edited). Step 4's prompt
   version bump is therefore uncontested, and this file's `turn.ts` line numbers are current.
2. **Phase 1's edits inside `runNinaBackgroundTurn` are POST-call** — verified: the ownership
   re-check inserts between the shortcut bump's closing brace (`actions.ts:982`) and the
   session-exists comment (`:984`), below `source = result.source`. This phase's two anchors —
   the `recentRunnerTexts` block (`:919-923`) and the `runNinaTurn` input object (`:937-951`) —
   are pre-call and phase 1 alters neither; its `sendNinaMessage` insertion (between `:716` and
   `:718`) only shifts their line numbers, which is why every edit here is anchored by quoted
   code.
3. **`runnerText: null` for an empty-body message holds on both paths** — verified, and it is
   today's code rather than phase 1's work: the send path (`actions.ts:739`) and the chain's
   recursive call (`:1196`) both spell `text.length > 0 ? text : null`. The burst block's
   `hasNewest` argument reads that convention.
4. **Phase 1's edits to `tests/nina.resend.test.ts` are additive and elsewhere** — verified: the
   chatturn const block and factory, two `beforeEach` defaults, and one assertion inside the
   'sweeps, then opens ONE claim' test. The `@/lib/nina/turn` mock factory this phase rewrites is
   untouched, so Step 7a applies to it verbatim (shifted only by phase 1's added lines above).
5. **`superseded` turns persist nothing** (index invariant 4) — verified: phase 1's discard exit
   returns before the bubble INSERT, the distillation, the auto-title and the chain. No burst
   framing question arises on the discard path; the RESTART turn is a fresh
   `runNinaBackgroundTurn` call and derives the burst itself.

## Handoffs

- **Nothing is left for a later phase** — this is the set's last phase. The two items below are
  recorded for the reconciler, not for a phase:
  - **The `NINA_PROMPT_VERSION` bump (Step 4) exceeds the brief's two-file list — RECONCILED, it
    stands.** The reconciliation pass verified phase 1 does not touch `lib/nina/prompts/index.ts`
    or `lib/nina/turn.ts`, so the version-6 entry's one-owner-per-set rule holds and the bump is
    sanctioned scope (the plan index's Reconciliation Log and Decisions carry it).
  - **`burstTextsFromWindow` does not exist as a named symbol.** The walk is inline in
    `runNinaBackgroundTurn` because a `'use server'` module cannot export a non-async helper and
    the brief allows only two production files. If a third consumer of the walk ever appears
    (none is known), extracting it into `lib/nina/turn.ts` next to `NINA_BURST_MAX_MESSAGES` —
    with the derivation tests moving from `tests/nina.resend.test.ts` to `lib/nina/turn.test.ts` —
    is the move, and the Step 6/7 tests are written to translate directly.

## Rollback

`git revert` the phase-2 commit. The prompt block is gated on an optional input whose only
producer (Step 5b/5c) is in the same commit, so the revert restores byte-identical prompts and
version 6 in one move. No data is involved: `nina_turns.prompt_version` rows stamped `7` remain as
historical fact and read as nothing. Phase 1's supersede machinery does not depend on this phase —
a reverted phase 2 leaves cancel-and-retarget working, with the restart turn answering only the
newest bubble out loud (the earlier ones stay in her window as context, exactly as before this
set).
