# Phase 4: The tab and the chat screen

**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R9 (a new tab between Runs and `+`, leaving `+` exactly centred) — and R1 in the one
sense a UI phase can serve it: the turn a runner can actually have with Nina, staggered the way
RU-5 says, is what makes the persona and the loop of phases 2–3 visible at all.
**Depends on:** Phase 1 (schema + `lib/nina/queries.ts`), Phase 2 (persona/context), Phase 3 (turn
engine + `lib/nina/actions.ts`)
**Difficulty:** NORMAL
**Package:** `components/nina`, `app/nina` (plus two files in `components/ui` and two new pure
modules in `lib/nina`)

---

## Goal

After this phase the bottom bar has five cells and the coral `+` FAB is at the exact horizontal
centre of the screen for the first time — the roadmap has claimed "centre, raised, coral" since
§4.8 was written, and in a four-column grid the FAB actually sat at 37.5%. The second cell is a
Nina tab pointing at `/nina`, a real screen that server-renders the stored conversation instantly
and lets the runner send a message and watch one to four bubbles arrive one at a time behind a
typing indicator. Every timed and geometric decision the screen makes — reveal gaps, when to
follow the conversation down, how far the iOS keyboard overlaps the composer — is a pure function
in `lib/nina/` with a `*.test.ts` beside it, because `vitest.config.ts` runs `environment: 'node'`
and cannot render a component.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing.

**Renames:** nothing.

**Creates:**

- `components/ui/TabBar.tsx` gains two exports: `TAB_BAR_HEIGHT_PX = 58`,
  `TAB_BAR_FAB_OVERHANG_PX = 20` (module-local `NinaIcon` is *not* exported)
- `components/ui/AppShell.tsx` gains a prop: `bottomGap?: 'tabs' | 'chat'` (default `'tabs'`) and
  the exported type `AppShellBottomGap`
- `lib/nina/reveal.ts` — `planReveal`, `REVEAL_FLOOR_MS`, `REVEAL_MS_PER_CHAR`,
  `REVEAL_CEILING_MS`, `REVEAL_TOTAL_CEILING_MS`, `REVEAL_SCALED_FLOOR_MS`, `REVEAL_MAX_BUBBLES`
- `lib/nina/reveal.test.ts`
- `lib/nina/chatview.ts` — `groupIntoDays`, `isNearBottom`, `decideAutoScroll`,
  `keyboardOverlapPx`, `composerBottomCss`, `STICK_TO_BOTTOM_PX`, `KEYBOARD_MIN_PX`, and the types
  `DayGroup`, `ScrollCause`, `ScrollDecision`, `ScrollGeometry`
- `lib/nina/chatview.test.ts`
- `components/nina/types.ts` — `ChatRole`, `ChatMessage`, `ChatMessageState`
- `components/nina/ChatScreen.tsx` — `ChatScreen`
- `components/nina/MessageList.tsx` — `MessageList`
- `components/nina/MessageBubble.tsx` — `MessageBubble`
- `components/nina/Composer.tsx` — `Composer`
- `components/nina/TypingIndicator.tsx` — `TypingIndicator`
- `components/nina/NinaAvatar.tsx` — `NinaAvatar`, `NINA_AVATAR_SRC`
- `app/nina/page.tsx` — the route, plus the segment config export
  **`export const maxDuration = 60`** (RULING C7: this phase owns that line, because a Server
  Action's timeout is the *page segment's*, not the action file's)

**Modifies (comment only):** `proxy.ts` — one sentence added to the matcher's docstring. The
matcher array itself is **unchanged** (RULING D3).

**Signature changes:** `AppShell({ children, className })` -> `AppShell({ children, className,
bottomGap })`. Additive with a default, so every existing call site compiles untouched.

**Requires (from earlier phases).** These four are the whole of this phase's upstream surface. If
a name or shape differs, the change is one line at one call site and is named here so the
reconciler can make it:

1. **Phase 1** — `public/nina/avatar-001.png` exists as a committed public asset (the plan index's
   phase-1 "Owns" line promises it). `NinaAvatar` is the only reader.
2. **Phase 1** — `lib/nina/queries.ts` exports a read of the conversation:

   ```ts
   listNinaMessages(
     userId: string,
     opts: { limit: number },
   ): Promise<Array<{ id: string; role: string; body: string; createdAt: Date }>>
   ```

   Returned **oldest first** (display order). The rows are consumed structurally in
   `app/nina/page.tsx` — extra columns are ignored, and `role` is narrowed by string comparison
   rather than by importing phase 1's enum type, so a `pgEnum`, a `text` check constraint or a
   `varchar` all work.

   **This shape is settled (RULING A1), and this phase's destructure is the correct one.** Phase 1
   ships `body` / `createdAt` uniformly, through one shared `messageColumns` used by **every**
   query function in `lib/nina/queries.ts` — not just this one — so there is no function on that
   module where the DTO is spelled differently. Phase 3's counter-proposal (that this phase read
   `text` instead) is **overruled**. The seam has three layers, three spellings and exactly one
   mapper:

   | Layer | Owner | Message field names |
   |---|---|---|
   | `lib/db/schema.ts` — the columns | phase 1 | `text`, `sent_at` (`ninaMessages.text`, `ninaMessages.sentAt`) |
   | `lib/nina/queries.ts` — the data-access DTO (`NinaMessageRow`, `NinaMessageInsert`) | phase 1 | **`body`, `createdAt`**, uniformly |
   | `lib/nina/context.ts` — the prompt-layer input (`MessageInput`) | phase 2 | `text`, `sentAt` |

   The single translation point is phase 3's `lib/nina/gateway.ts` (`dbNinaSourceGateway`), which
   maps `NinaMessageRow → MessageInput` as `text: row.body`, `sentAt: row.createdAt`. **Neither
   side is to be "fixed" to match the other** — the columns keep the schema's vocabulary, the DTO
   keeps the view's, the prompt layer keeps the model's, and one file pays for all three.

   **The multi-bubble ordering worry this phase filed is also settled**, and settled better than
   the two options it offered ("either a monotonic tiebreak column or distinct `created_at`
   values"): `nina_messages.seq` is a `bigserial` assigned by Postgres (phase 1's D-2), so
   `ORDER BY seq` alone is deterministic — no tiebreak, no dependence on clock resolution. The
   four rows phase 3 writes in one turn go in through **one multi-row `INSERT`**, which numbers a
   turn's bubbles in emission order. Nothing in this phase reads or writes `seq`; it just gets the
   order it asked for.
3. **Phase 3** — `lib/nina/actions.ts` exports the Server Action:

   ```ts
   sendNinaMessage(input: { body: string }): Promise<{
     ok: boolean
     userMessageId: string | null
     bubbles: Array<{ id: string; body: string }>
     unavailable: boolean
   }>
   ```

   Called from exactly one place, `ChatScreen.handleSend`. Two behavioural requirements beyond the
   shape: (a) the runner's own message is **persisted before the model is called**, so a failed
   turn does not lose it — the "your message is saved" copy in this phase is a claim about phase
   3's write order; (b) `bubbles` is already clamped to at most `REVEAL_MAX_BUBBLES` (4) per RU-5.
4. **Phase 1** — `scripts/check-llm-payload-boundary.mjs`: phase 1 owns the file and ships the
   complete `GUARDED_CALLS` table (RULING D1), including `runNinaTurn` with `lib/nina/actions.ts`
   among its sanctioned callers. Consumed as shipped; nothing to add here.
   **This phase's job under invariant 4 is to call nothing else**: `app/nina/page.tsx` awaits only
   `requireUserId()` and `listNinaMessages`, and the turn is fired from a client event handler
   after the page has rendered — the same shape as `components/insights/InsightTrigger.tsx` firing
   `ensureRunInsight`.

**Leaves alone (owned by others):**

- `components/nina/MessageBubble.tsx`'s `above` slot and the `id={`nina-msg-${id}`}` anchor exist
  but are unused here. Per RULING E2, `above` carries **two** inset kinds and not three — the
  images (Phase 6) then the run card (Phase 8) — because Phase 7 gives the reply quote its own
  `quote` prop on `MessageBubble` rather than making the two compete for one slot. Phase 7 also
  makes this module `'use client'`.
- The `Tab` component gains no `badge` prop — Phase 10 owns the unread dot.
- `NinaAvatar` renders an `<Image>`, never a `<Link>` — Phase 13 makes it tappable, widens the
  props additively, and turns `NINA_AVATAR_SRC` into a re-export of its own
  `NINA_AVATAR_FALLBACK_SRC` (RULING A5). Nothing here changes for that.
- The composer's icon-button seam (`flex items-end gap-2`) is left empty — Phase 6 adds the image
  picker, Phase 8 adds nothing here (its button is on `app/r/[id]/page.tsx`).
- `lib/nina/scroll.ts` is **not** created. Scroll *restoration* across a navigation is Phase 8's;
  this phase's `chatview.ts` only decides whether a newly arrived bubble should move the page.
- `ROADMAP_v0.1.0.md` §4.8 is **not** edited here, and RULING D2 confirms that: phase 1 owns every
  roadmap amendment this cycle, including the four-tab → five-tab sentence, §4.8's table row and
  the route list. See Handoffs for the sentence this phase supplies for phase 1 to use.
- `proxy.ts`'s `config.matcher` array. The only edit to that file is a comment (RULING D3), so
  `tests/auth.proxy.matcher.test.ts` is untouched.
- `lib/format.ts` gains nothing. See Handoffs for the per-message-time non-goal.

## Files

| File | Action | What changes |
|---|---|---|
| `components/ui/TabBar.tsx` | modify | `grid-cols-4` -> `grid-cols-5`; a fifth `TABS` entry and a hand-written `NinaIcon`; the FAB moves to the third grid child and gains `left-1/2 -translate-x-1/2`; two exported pixel constants (`TabBar.tsx:31`, `:47`, `:49–66`, `:104`) |
| `components/ui/AppShell.tsx` | modify | `bottomGap` prop and a two-entry class record; the docstring's list of screens that get the bar admits `/nina` (`AppShell.tsx:1–45`) |
| `lib/nina/reveal.ts` | create | the reveal schedule, pure |
| `lib/nina/reveal.test.ts` | create | the reveal schedule's properties |
| `lib/nina/chatview.ts` | create | day grouping, auto-scroll rule, keyboard overlap, composer offset — all pure |
| `lib/nina/chatview.test.ts` | create | those four rules |
| `components/nina/types.ts` | create | the `ChatMessage` view model |
| `components/nina/NinaAvatar.tsx` | create | her circular face, two sizes |
| `components/nina/TypingIndicator.tsx` | create | `LoadingDots` in a bubble |
| `components/nina/MessageBubble.tsx` | create | one row, two sides, one extension slot |
| `components/nina/MessageList.tsx` | create | day-grouped list + the auto-scroll effect |
| `components/nina/Composer.tsx` | create | auto-growing textarea + send button, fixed above the bar |
| `components/nina/ChatScreen.tsx` | create | the turn: optimistic row, the action, the staggered reveal |
| `app/nina/page.tsx` | create | the route — server-renders stored history, awaits no model; carries `export const maxDuration = 60` for the Server Action fired from `ChatScreen` (RULING C7) |
| `proxy.ts` | modify — comment only | one sentence in the matcher's docstring naming `/nina` and `/admin/**` as deliberately omitted, and why (RULING D3). `config.matcher` is byte-identical, so `tests/auth.proxy.matcher.test.ts` is untouched (`proxy.ts:34–58`) |

Fifteen files, against the index's estimate of ~11. The four extra are the second pure module and
its test (invariant 6 applied to the scroll and keyboard decisions, exactly as the phase brief
instructs), `types.ts`, and `proxy.ts` — which the brief did not anticipate because the ruling
that lands there is a comment rather than a matcher line.

---

## Implementation Steps

### Step 1: `lib/nina/reveal.ts` — the reveal schedule

**File:** `lib/nina/reveal.ts` (new)
**Change:** the whole of RU-5's timing, as one pure function over the bubble bodies.

The number that decides the shape of this function is in the analysis: fifteen live `glm-5.3` calls
took 10.2–16.4 s. By the time `sendNinaMessage` resolves, the runner has already watched a typing
indicator for a quarter of a minute and **every bubble is already in hand**. So the first bubble's
gap is zero, and the remaining gaps are theatre with a hard total budget — a 4-bubble turn must not
add five more seconds to a sixteen-second wait.

**Code:**

```ts
/**
 * The reveal schedule for a multi-bubble turn (RU-5), as one pure function.
 *
 * Extracted from `components/nina/ChatScreen.tsx` for the reason `lib/photos/gallery.ts` was
 * extracted from `PhotoViewer.tsx`, and the argument is that file's verbatim: `vitest.config.ts`
 * runs `environment: 'node'` with an `include` that matches `*.test.ts` only, so there is no
 * jsdom, no testing library and no timer to advance inside a rendered component. **This is the
 * whole of the behaviour**, and a pure function is the only version of it this repo can prove.
 *
 * ── WHY THE FIRST GAP IS ZERO ─────────────────────────────────────────────────────────────────
 * The client has all of Nina's bubbles the moment the Server Action resolves — RU-5 chose
 * staggered multi-bubble over SSE precisely so there is no stream to wait on. And resolving takes
 * a while: the analysis records fifteen live `glm-5.3` calls at 10.2–16.4 s, clustering at 13–16.
 * The runner has therefore already watched a typing indicator for that long. Making him wait
 * another 700 ms for the first line would be a lie told for atmosphere. The stagger exists to
 * separate her second, third and fourth thoughts from her first, and that is all it does.
 *
 * ── WHY THERE IS A TOTAL CEILING AND NOT JUST A PER-BUBBLE ONE ────────────────────────────────
 * Four bubbles at the per-bubble ceiling is 4.2 s of pure delay on top of a 16 s turn. That is a
 * fifth of the interaction spent on a typing animation. `REVEAL_TOTAL_CEILING_MS` scales the whole
 * schedule down proportionally when it would exceed the budget, so the *rhythm* survives (a long
 * bubble still gets a longer pause than a short one) while the total stays honest.
 *
 * ── WHY THE SCALED FLOOR CANNOT FIGHT THE CEILING, FOR THE COUNTS THAT MATTER ─────────────────
 * With `REVEAL_MAX_BUBBLES = 4` there are at most three non-zero gaps, each at least
 * `REVEAL_FLOOR_MS` (450) and at most `REVEAL_CEILING_MS` (1400). The worst total before scaling
 * is 3 x 1400 = 4200, so the smallest scale factor is 3200/4200 = 0.762, and the smallest scaled
 * gap is 450 x 0.762 = 343 ms — comfortably above `REVEAL_SCALED_FLOOR_MS` (150). So for every
 * schedule RU-5 permits, the floor never binds and the ceiling holds exactly. Above four bubbles
 * the floor wins instead, deliberately: a gap of 40 ms is not a reveal, it is a flicker, and a
 * caller that ignored the clamp has a bug that should look like one.
 */

/** The pause before a bubble whose body is empty — she still had to press send. */
export const REVEAL_FLOOR_MS = 450

/**
 * Per code point of trimmed body. 11 ms is not a typing speed — a real mobile typist is nearer
 * 300 ms per character and a 120-character bubble would take half a minute. It is the coefficient
 * that puts a short bubble near the floor and a long one near the ceiling, which is the only
 * signal the pause is carrying.
 */
export const REVEAL_MS_PER_CHAR = 11

/** No single pause exceeds this, however long the bubble. */
export const REVEAL_CEILING_MS = 1400

/** The whole schedule's budget. Exceeding it scales every gap down proportionally. */
export const REVEAL_TOTAL_CEILING_MS = 3200

/** After scaling, no gap drops below this. See the header for why it never binds at n <= 4. */
export const REVEAL_SCALED_FLOOR_MS = 150

/** RU-5's clamp, restated here because the ceiling arithmetic above depends on it. */
export const REVEAL_MAX_BUBBLES = 4

/**
 * The gap, in milliseconds, to wait after bubble `i - 1` has appeared before showing bubble `i`.
 *
 * Element 0 is always exactly 0. The returned array has the same length as `bodies`, so a caller
 * can zip it against the bubbles without a second thought. An empty input returns an empty array.
 *
 * Code points rather than UTF-16 units (`[...body]`, not `body.length`): an emoji is one thing she
 * typed, not two, and Jakarta slang carries plenty of them.
 */
export function planReveal(bodies: readonly string[]): number[] {
  if (!Array.isArray(bodies) || bodies.length === 0) return []

  const gaps = bodies.map((body, index) => (index === 0 ? 0 : gapFor(body)))
  const total = gaps.reduce((sum, gap) => sum + gap, 0)
  if (total <= REVEAL_TOTAL_CEILING_MS) return gaps

  const factor = REVEAL_TOTAL_CEILING_MS / total
  return gaps.map((gap, index) =>
    index === 0 ? 0 : Math.max(REVEAL_SCALED_FLOOR_MS, Math.round(gap * factor)),
  )
}

function gapFor(body: string): number {
  const chars = typeof body === 'string' ? [...body.trim()].length : 0
  const raw = REVEAL_FLOOR_MS + chars * REVEAL_MS_PER_CHAR
  if (!Number.isFinite(raw)) return REVEAL_FLOOR_MS
  return Math.min(REVEAL_CEILING_MS, Math.max(REVEAL_FLOOR_MS, Math.round(raw)))
}
```

**Impact:** nothing yet — no caller until step 8. The module is importable from a test and from a
client component alike (it imports nothing).

---

### Step 2: `lib/nina/reveal.test.ts`

**File:** `lib/nina/reveal.test.ts` (new)
**Change:** the properties, in the shape of `lib/photos/gallery.test.ts` — co-located, no DOM.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  planReveal,
  REVEAL_CEILING_MS,
  REVEAL_FLOOR_MS,
  REVEAL_MAX_BUBBLES,
  REVEAL_MS_PER_CHAR,
  REVEAL_SCALED_FLOOR_MS,
  REVEAL_TOTAL_CEILING_MS,
} from './reveal'

/**
 * RU-5's timing, proven without a browser. `vitest.config.ts` is `environment: 'node'`, so there
 * is no component to render and no timer to advance — which is exactly why the schedule is a
 * function and not a `setTimeout` chain inside `ChatScreen`.
 */

const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0)

/** `n` code points of body, so a case can name the length it means. */
const body = (n: number) => 'a'.repeat(n)

describe('planReveal shape', () => {
  it('returns one gap per bubble', () => {
    expect(planReveal([body(10), body(10), body(10)])).toHaveLength(3)
  })

  it('returns an empty schedule for an empty turn', () => {
    // Phase 3 can legitimately come back with nothing to say (the double-invalid path), and the
    // screen renders a quiet notice instead. That must not be an exception here.
    expect(planReveal([])).toEqual([])
  })

  it('never delays the first bubble', () => {
    // The runner has already watched the indicator for 13-16 s. See the module header.
    expect(planReveal([body(400)])).toEqual([0])
    expect(planReveal([body(400), body(400)])[0]).toBe(0)
  })
})

describe('planReveal gap arithmetic', () => {
  it('grows the pause with the length of the bubble', () => {
    const short = planReveal(['x', body(60)])[1] as number
    const long = planReveal(['x', body(140)])[1] as number
    expect(long).toBeGreaterThan(short)
  })

  it('applies the floor to an empty or whitespace-only bubble', () => {
    // `body` is trimmed, so "   " is zero characters and lands on the floor rather than below it.
    expect(planReveal(['x', ''])[1]).toBe(REVEAL_FLOOR_MS)
    expect(planReveal(['x', '   \n  '])[1]).toBe(REVEAL_FLOOR_MS)
  })

  it('applies the ceiling to a bubble long enough to blow past it', () => {
    const chars = Math.ceil((REVEAL_CEILING_MS - REVEAL_FLOOR_MS) / REVEAL_MS_PER_CHAR) + 50
    expect(planReveal(['x', body(chars)])[1]).toBe(REVEAL_CEILING_MS)
  })

  it('counts code points, not UTF-16 units', () => {
    // Four astral emoji are `.length === 8` and `[...s].length === 4`. Counting units would make
    // her emoji twice as slow to "type" as her letters, which is nonsense.
    const emoji = planReveal(['x', '\u{1F602}\u{1F602}\u{1F602}\u{1F602}'])[1] as number
    const letters = planReveal(['x', 'aaaa'])[1] as number
    expect(emoji).toBe(letters)
  })
})

describe('planReveal total budget', () => {
  it('holds the total ceiling exactly at the bubble count RU-5 permits', () => {
    const worst = Array.from({ length: REVEAL_MAX_BUBBLES }, () => body(500))
    const gaps = planReveal(worst)
    expect(gaps).toHaveLength(REVEAL_MAX_BUBBLES)
    expect(sum(gaps)).toBeLessThanOrEqual(REVEAL_TOTAL_CEILING_MS)
    // And the scaled floor is not what saved it: every gap is well clear of it. This is the
    // arithmetic the module header spells out, asserted rather than trusted.
    for (const gap of gaps.slice(1)) expect(gap).toBeGreaterThan(REVEAL_SCALED_FLOOR_MS)
  })

  it('leaves a schedule inside the budget untouched', () => {
    const gaps = planReveal(['x', body(20), body(20)])
    expect(sum(gaps)).toBeLessThan(REVEAL_TOTAL_CEILING_MS)
    expect(gaps[1]).toBe(gaps[2])
  })

  it('preserves the rhythm when it scales', () => {
    // A long bubble keeps a longer pause than a short one even after the whole schedule shrinks.
    const gaps = planReveal([body(200), body(200), body(30), body(200)])
    expect(sum(gaps)).toBeLessThanOrEqual(REVEAL_TOTAL_CEILING_MS)
    expect(gaps[2] as number).toBeLessThan(gaps[1] as number)
    expect(gaps[3] as number).toBeGreaterThan(gaps[2] as number)
  })

  it('prefers a visible pause over the budget above four bubbles', () => {
    // The documented inversion: a caller that ignored RU-5's clamp gets a schedule that is longer
    // than the budget rather than a flicker. Named here so nobody "fixes" it into a flicker.
    const gaps = planReveal(Array.from({ length: 40 }, () => body(500)))
    for (const gap of gaps.slice(1)) expect(gap).toBeGreaterThanOrEqual(REVEAL_SCALED_FLOOR_MS)
  })
})
```

**Impact:** `npm test` gains 12 assertions. No other suite is touched.

---

### Step 3: `lib/nina/chatview.ts` — day grouping, auto-scroll, keyboard, composer offset

**File:** `lib/nina/chatview.ts` (new)
**Change:** the other four decisions the chat screen makes that are worth proving. Same rationale
as step 1, and the phase brief asks for the scroll one by name.

`decideAutoScroll` deliberately takes a boolean rather than the geometry, because of a fact about
`useEffect`: by the time an effect runs the new bubble is already in the DOM and `scrollHeight`
already includes it, so "was the reader at the bottom" cannot be measured after the fact. The
component samples `isNearBottom` from a passive scroll listener and hands the answer in.

**Code:**

```ts
/**
 * The four decisions the chat screen makes that are not markup, as pure functions.
 *
 * Same argument as `lib/nina/reveal.ts` and `lib/photos/gallery.ts` before it: `vitest.config.ts`
 * runs `environment: 'node'` with an `include` matching `*.test.ts`, so there is no jsdom, no
 * `visualViewport` and no scroll container. Every one of these is a rule, and a rule can be
 * asserted; a rendered scenario could only demonstrate one instance of it.
 *
 * Deliberately NOT named `scroll.ts`: phase 8 owns `lib/nina/scroll.ts`, which is the *restoration*
 * arithmetic for returning from a run detail page to the exact prior offset. That is a different
 * question from "should this new bubble move the page", and two files named for the same word
 * would be read as one.
 *
 * No DOM types appear in any signature here. The component measures; this decides.
 */

/* ── day grouping ──────────────────────────────────────────────────────────────────────────── */

export interface DayGroup<T> {
  /** 'YYYY-MM-DD', the Asia/Jakarta calendar day (D6). */
  dayISO: string
  messages: T[]
}

/**
 * Consecutive runs of messages that share a calendar day, in the order given.
 *
 * Generic over `{ dayISO }` rather than typed against `components/nina/types.ts`, so that a
 * module under `lib/` never imports from `components/`. It also means phases 6, 7 and 8 can widen
 * `ChatMessage` freely without touching this.
 *
 * **Consecutive runs, not a keyed bucket.** A `Map` keyed by day would silently merge two
 * separated stretches of the same day if the rows ever arrived out of order, which would put a
 * "Today" divider above yesterday's messages. Grouping adjacently makes a mis-ordered read look
 * wrong instead of looking plausible.
 */
export function groupIntoDays<T extends { dayISO: string }>(
  messages: readonly T[],
): Array<DayGroup<T>> {
  const groups: Array<DayGroup<T>> = []
  for (const message of messages) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.dayISO === message.dayISO) last.messages.push(message)
    else groups.push({ dayISO: message.dayISO, messages: [message] })
  }
  return groups
}

/* ── following the conversation down ───────────────────────────────────────────────────────── */

/**
 * How close to the bottom counts as "the reader is following along".
 *
 * 96 px is a little over one bubble's height. Tighter and a reader who nudged the page a
 * thumb-width stops receiving new messages in view; looser and a reader two bubbles up gets
 * yanked away from the line he was re-reading.
 */
export const STICK_TO_BOTTOM_PX = 96

/** What the component measures, with no DOM types in the signature. */
export interface ScrollGeometry {
  /** `window.scrollY`, or a container's `scrollTop`. */
  scrollTop: number
  /** `document.documentElement.scrollHeight`. */
  scrollHeight: number
  /** `window.innerHeight`, or a container's `clientHeight`. */
  clientHeight: number
}

/** Non-finite geometry reads as "at the bottom": the safe answer is to keep following. */
export function isNearBottom(
  geometry: ScrollGeometry,
  threshold: number = STICK_TO_BOTTOM_PX,
): boolean {
  const { scrollTop, scrollHeight, clientHeight } = geometry
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return true
  return scrollHeight - (scrollTop + clientHeight) <= threshold
}

export type ScrollCause =
  /** First paint of the screen. */
  | 'mount'
  /** The runner just sent something. */
  | 'own-message'
  /** A bubble from Nina, or the typing indicator appearing. */
  | 'incoming'
  /** The software keyboard opened or closed and the visible area changed size. */
  | 'viewport'

export type ScrollDecision = 'jump' | 'smooth' | 'none'

/**
 * Whether, and how, a change should move the page to the newest message.
 *
 * ── THE FOUR RULES ───────────────────────────────────────────────────────────────────────────
 *   1. `mount` always jumps, never animates. A conversation opens at its newest line, and an
 *      animated scroll on first paint is motion in place of an instant result.
 *   2. `own-message` always follows. The runner just acted; going with him is not an
 *      interruption, it is the acknowledgement.
 *   3. `incoming` follows only a reader who was already at the bottom. This is the whole rule
 *      that separates a chat screen from a hostile one: never take the page away from someone
 *      reading history because Nina had a fourth thought.
 *   4. `viewport` — the keyboard opening — follows only a reader at the bottom, and jumps rather
 *      than animates, because the layout has already moved underneath him and a 300 ms smooth
 *      scroll chasing it reads as a glitch.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────────────────────────
 * `prefers-reduced-motion: reduce` turns every 'smooth' into 'jump'. A smooth scroll is sustained
 * motion the user did not ask for, which is the thing that setting exists to suppress — the same
 * line `app/globals.css` draws when it exempts `active:scale-[0.985]` (discrete tap feedback) but
 * neutralises `ri-pulse` (sustained oscillation). The destination never changes; only the journey.
 */
export function decideAutoScroll(input: {
  cause: ScrollCause
  readerNearBottom: boolean
  reducedMotion: boolean
}): ScrollDecision {
  const { cause, readerNearBottom, reducedMotion } = input
  if (cause === 'mount') return 'jump'
  if (cause === 'viewport') return readerNearBottom ? 'jump' : 'none'
  if (cause === 'incoming' && !readerNearBottom) return 'none'
  return reducedMotion ? 'jump' : 'smooth'
}

/* ── the iOS keyboard ──────────────────────────────────────────────────────────────────────── */

/**
 * The smallest overlap that is allowed to count as a keyboard.
 *
 * iOS does **not** resize the layout viewport when the software keyboard opens, so a
 * `position: fixed` composer sits behind it and Safari will not scroll fixed chrome into view.
 * `window.visualViewport` is the only honest measurement of what is actually visible, and moving
 * the composer by that overlap is the fix.
 *
 * But the visual viewport shrinks for other reasons too — a collapsing URL bar is 60-90 px, a
 * pinch-zoom is arbitrary. 120 px is below every iOS keyboard and above every URL-bar delta, so
 * the composer does not twitch while the runner scrolls.
 */
export const KEYBOARD_MIN_PX = 120

/**
 * How many CSS pixels of the layout viewport's bottom are covered by the software keyboard.
 *
 * `innerHeight - (visualHeight + visualOffsetTop)`. The `offsetTop` term is what makes a
 * pinch-scrolled page report the same overlap as an unscrolled one, rather than reporting the
 * pinch as a keyboard.
 *
 * Returns 0 for anything non-finite, anything negative, and anything under `KEYBOARD_MIN_PX` —
 * three different ways of saying "there is no keyboard", all of which must mean "leave the
 * composer where the CSS put it".
 */
export function keyboardOverlapPx(viewport: {
  innerHeight: number
  visualHeight: number
  visualOffsetTop: number
}): number {
  const { innerHeight, visualHeight, visualOffsetTop } = viewport
  if (![innerHeight, visualHeight, visualOffsetTop].every(Number.isFinite)) return 0
  const overlap = Math.round(innerHeight - visualHeight - visualOffsetTop)
  if (overlap < KEYBOARD_MIN_PX) return 0
  return Math.min(overlap, Math.round(innerHeight))
}

/**
 * The composer's `bottom`, as a CSS length.
 *
 * With no keyboard it clears the fixed chrome below it: the tab bar's own height, the FAB's
 * overhang above the bar's top edge, and the home-indicator inset the bar pads itself by. The
 * inset is honoured **here and not as the composer's own padding** — the composer sits above
 * chrome that already pads by `--safe-bottom`, so padding it a second time would open a gap.
 *
 * With a keyboard, the keyboard's top edge is the floor and every one of those terms is behind it.
 *
 * Returns a string because that is what the style attribute takes, and because `var(--safe-bottom)`
 * cannot be resolved in JavaScript — `env(safe-area-inset-bottom)` is only readable to CSS.
 */
export function composerBottomCss(overlapPx: number, chromeClearancePx: number): string {
  if (Number.isFinite(overlapPx) && overlapPx > 0) return `${Math.round(overlapPx)}px`
  const clearance = Number.isFinite(chromeClearancePx) ? Math.round(chromeClearancePx) : 0
  return `calc(${clearance}px + var(--safe-bottom))`
}
```

**Impact:** nothing yet. Two consumers arrive in steps 7 and 9.

---

### Step 4: `lib/nina/chatview.test.ts`

**File:** `lib/nina/chatview.test.ts` (new)

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  composerBottomCss,
  decideAutoScroll,
  groupIntoDays,
  isNearBottom,
  keyboardOverlapPx,
  KEYBOARD_MIN_PX,
  STICK_TO_BOTTOM_PX,
} from './chatview'

/** iPhone XS Max, the design target (docs/design-brief.md), in CSS px. */
const IPHONE_HEIGHT = 812
/** Roughly what iOS gives a QWERTY keyboard with the predictive bar on that device. */
const KEYBOARD_HEIGHT = 336

describe('groupIntoDays', () => {
  const m = (id: string, dayISO: string) => ({ id, dayISO })

  it('returns one group per consecutive run of a day', () => {
    const groups = groupIntoDays([
      m('a', '2026-09-01'),
      m('b', '2026-09-01'),
      m('c', '2026-09-03'),
    ])
    expect(groups.map((g) => g.dayISO)).toEqual(['2026-09-01', '2026-09-03'])
    expect(groups[0]?.messages.map((x) => x.id)).toEqual(['a', 'b'])
    expect(groups[1]?.messages.map((x) => x.id)).toEqual(['c'])
  })

  it('does not merge two separated stretches of the same day', () => {
    // A keyed bucket would return one group here and put a divider above the wrong messages. The
    // adjacent grouping makes a mis-ordered read visible rather than plausible.
    const groups = groupIntoDays([
      m('a', '2026-09-01'),
      m('b', '2026-09-02'),
      m('c', '2026-09-01'),
    ])
    expect(groups).toHaveLength(3)
  })

  it('is empty for an empty conversation', () => {
    expect(groupIntoDays([])).toEqual([])
  })

  it('does not alias the input array', () => {
    // The list is React state. A group holding a reference into it would let a push here mutate
    // rendered state, which is the class of bug that only shows up on the second turn.
    const input = [m('a', '2026-09-01')]
    const groups = groupIntoDays(input)
    groups[0]?.messages.push(m('b', '2026-09-01'))
    expect(input).toHaveLength(1)
  })
})

describe('isNearBottom', () => {
  it('is true at the very bottom', () => {
    expect(isNearBottom({ scrollTop: 1200, scrollHeight: 2012, clientHeight: 812 })).toBe(true)
  })

  it('is true exactly on the threshold', () => {
    // Strict thresholds, one case at the line and one past it — the `lib/metrics/flags.ts` rule.
    expect(
      isNearBottom({
        scrollTop: 1200 - STICK_TO_BOTTOM_PX,
        scrollHeight: 2012,
        clientHeight: 812,
      }),
    ).toBe(true)
  })

  it('is false one pixel past the threshold', () => {
    expect(
      isNearBottom({
        scrollTop: 1200 - STICK_TO_BOTTOM_PX - 1,
        scrollHeight: 2012,
        clientHeight: 812,
      }),
    ).toBe(false)
  })

  it('is true for a page shorter than the viewport', () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 400, clientHeight: 812 })).toBe(true)
  })

  it('is true rather than false for unmeasurable geometry', () => {
    expect(isNearBottom({ scrollTop: NaN, scrollHeight: 2012, clientHeight: 812 })).toBe(true)
  })
})

describe('decideAutoScroll', () => {
  it('jumps on mount, animating nothing', () => {
    for (const readerNearBottom of [true, false]) {
      for (const reducedMotion of [true, false]) {
        expect(decideAutoScroll({ cause: 'mount', readerNearBottom, reducedMotion })).toBe('jump')
      }
    }
  })

  it('follows the runner even when he had scrolled up', () => {
    expect(
      decideAutoScroll({ cause: 'own-message', readerNearBottom: false, reducedMotion: false }),
    ).toBe('smooth')
  })

  it('never yanks a reader who is up in the history', () => {
    // The single most important rule on the screen.
    expect(
      decideAutoScroll({ cause: 'incoming', readerNearBottom: false, reducedMotion: false }),
    ).toBe('none')
  })

  it('follows an incoming bubble for a reader at the bottom', () => {
    expect(
      decideAutoScroll({ cause: 'incoming', readerNearBottom: true, reducedMotion: false }),
    ).toBe('smooth')
  })

  it('jumps rather than animates when the keyboard moves the layout', () => {
    expect(
      decideAutoScroll({ cause: 'viewport', readerNearBottom: true, reducedMotion: false }),
    ).toBe('jump')
    expect(
      decideAutoScroll({ cause: 'viewport', readerNearBottom: false, reducedMotion: false }),
    ).toBe('none')
  })

  it('replaces every smooth scroll with a jump under reduced motion', () => {
    // The destination is unchanged; only the journey. Nothing is substituted for the animation.
    expect(
      decideAutoScroll({ cause: 'own-message', readerNearBottom: true, reducedMotion: true }),
    ).toBe('jump')
    expect(
      decideAutoScroll({ cause: 'incoming', readerNearBottom: true, reducedMotion: true }),
    ).toBe('jump')
  })
})

describe('keyboardOverlapPx', () => {
  it('is zero with no keyboard', () => {
    expect(
      keyboardOverlapPx({
        innerHeight: IPHONE_HEIGHT,
        visualHeight: IPHONE_HEIGHT,
        visualOffsetTop: 0,
      }),
    ).toBe(0)
  })

  it('measures the keyboard iOS does not resize the layout viewport for', () => {
    expect(
      keyboardOverlapPx({
        innerHeight: IPHONE_HEIGHT,
        visualHeight: IPHONE_HEIGHT - KEYBOARD_HEIGHT,
        visualOffsetTop: 0,
      }),
    ).toBe(KEYBOARD_HEIGHT)
  })

  it('subtracts the pinch offset so a zoomed page is not read as a keyboard', () => {
    // Visual viewport 400 tall, scrolled 200 down inside a 812 layout: 212 px of layout is below
    // it, and that is not a keyboard — it is under the threshold and reads as zero.
    expect(
      keyboardOverlapPx({ innerHeight: IPHONE_HEIGHT, visualHeight: 400, visualOffsetTop: 200 }),
    ).toBe(0)
  })

  it('ignores a URL-bar-sized change', () => {
    const urlBar = KEYBOARD_MIN_PX - 1
    expect(
      keyboardOverlapPx({
        innerHeight: IPHONE_HEIGHT,
        visualHeight: IPHONE_HEIGHT - urlBar,
        visualOffsetTop: 0,
      }),
    ).toBe(0)
  })

  it('is zero for a negative or unmeasurable viewport', () => {
    expect(
      keyboardOverlapPx({ innerHeight: 400, visualHeight: IPHONE_HEIGHT, visualOffsetTop: 0 }),
    ).toBe(0)
    expect(
      keyboardOverlapPx({ innerHeight: NaN, visualHeight: 400, visualOffsetTop: 0 }),
    ).toBe(0)
  })
})

describe('composerBottomCss', () => {
  it('clears the tab bar, the FAB overhang and the home-indicator inset when idle', () => {
    expect(composerBottomCss(0, 78)).toBe('calc(78px + var(--safe-bottom))')
  })

  it('sits on the keyboard when there is one', () => {
    // Every term of the idle clearance is behind the keyboard, so none of it is added.
    expect(composerBottomCss(KEYBOARD_HEIGHT, 78)).toBe('336px')
  })

  it('treats unmeasurable input as no keyboard', () => {
    expect(composerBottomCss(NaN, 78)).toBe('calc(78px + var(--safe-bottom))')
  })
})
```

**Impact:** `npm test` gains 22 assertions.

---

### Step 5: `components/ui/TabBar.tsx` — five cells, `+` at 50%

**File:** `components/ui/TabBar.tsx` (rewrite; the changed lines are the docstring's table, `TABS`
at `:31`, the grid class at `:47`, the FAB block at `:49–66`, and a new `NinaIcon` after `:104`)
**Change:** `grid-cols-4` -> `grid-cols-5`, a Nina tab in cell 2, the FAB in cell 3, and the two
pixel constants the composer needs.

**The arithmetic R9 turns on.** In `grid-cols-4` the FAB's cell centre is at `(1 + 0.5) / 4` =
**37.5 %** of the bar. In `grid-cols-5` the third cell's centre is `(2 + 0.5) / 5` = **exactly
50 %**. So the roadmap's own §4.8 claim — "**centre**, raised, coral (`--z5`)" — becomes true for
the first time with this change, which is precisely what the user asked for.

The FAB also gains `left-1/2 -translate-x-1/2`. Today it is horizontally placed by its *static
position* as an absolutely-positioned child of a `flex justify-center` cell — correct per the
Flexbox spec, but inferred from two layers of layout. `left-1/2 -translate-x-1/2` against the
`relative` bar is centring that can be read off one line, which is what an exit criterion of
"pixel-centred" deserves. **Verified for Tailwind v4** (this repo is on 4.3.3): compiling
`-translate-x-1/2 scale-[0.97]` emits `translate: var(--tw-translate-x) var(--tw-translate-y)` and
`scale: 0.97` as two independent CSS longhands, so `active:scale-[0.97]` no longer clobbers the
translate the way a v3 `transform` shorthand would have.

**Code (complete file):**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'

/**
 * The five-tab bottom bar (roadmap §4.8, from the v2 design's `TabBar`).
 *
 * | tab | route | note |
 * |---|---|---|
 * | Runs | `/` | the default landing once signed in |
 * | Nina | `/nina` | F33's conversational surface; owns `/nina/*` |
 * | **Upload** | `/upload` | **centre, raised, coral** — a circular FAB breaking the bar's top edge |
 * | Trends | `/trends` | |
 * | Me | `/me` | profile, records, badge shelf |
 *
 * **Upload is still not a peer of the other four.** It is the one flow that matters (roadmap §1),
 * and the information architecture says so out loud: a raised coral circle, larger tap target, its
 * label suppressed because a `+` in a circle needs no caption. Making it the fifth grey icon in a
 * row would be a design that disagrees with the product. F33 adds a tab beside it and changes
 * nothing about that argument.
 *
 * ── WHY THE FIFTH CELL MAKES THE ROADMAP TRUE (F33 / R9) ──────────────────────────────────────
 * §4.8 has described the FAB as "centre, raised, coral" since it was written, and in a four-column
 * grid the FAB's cell centre was at (1 + 0.5) / 4 = 37.5 % of the bar — raised and coral, but not
 * centre. With five columns the third cell's centre is (2 + 0.5) / 5 = exactly 50 %. So the new
 * tab is what finally centres the `+`, which is the whole of the request.
 *
 * `left-1/2 -translate-x-1/2` then makes that centring explicit rather than inferred. Before F33
 * the FAB was placed horizontally by its *static position* inside a `flex justify-center` cell —
 * correct per the Flexbox spec for an absolutely-positioned flex child, and two layers of layout
 * away from being readable. Positioning it against the `relative` bar states the intent in one
 * line. Safe in Tailwind v4, which compiles `translate` and `scale` to separate CSS longhands, so
 * `active:scale-[0.97]` and the translate compose instead of overwriting each other.
 *
 * `'use client'` for exactly one reason: `usePathname`, for `aria-current`. Nothing else here is
 * interactive — the tabs are plain `<Link>`s, so the bar works before hydration.
 *
 * The bar pads its bottom by `--safe-bottom` (the home-indicator inset), which is inert without
 * `viewport-fit=cover` in the root layout — already set, and load-bearing (see `app/layout.tsx`).
 */

/**
 * The bar's own height, matching `h-[58px]` below. Exported because `/nina`'s composer is the
 * app's first fixed bar that stacks *above* the tab bar and has to compute its own `bottom` in
 * JavaScript (`lib/nina/chatview.ts`). **If the class changes, change this with it** — Tailwind
 * cannot read a TypeScript constant, so the number is spelled twice by necessity.
 */
export const TAB_BAR_HEIGHT_PX = 58

/** How far the FAB overhangs the bar's top edge, matching `-top-5` below. Same coupling. */
export const TAB_BAR_FAB_OVERHANG_PX = 20

const TABS = [
  { href: '/', label: 'Runs', icon: RunsIcon },
  { href: '/nina', label: 'Nina', icon: NinaIcon },
  { href: '/trends', label: 'Trends', icon: TrendsIcon },
  { href: '/me', label: 'Me', icon: MeIcon },
] as const

export function TabBar() {
  const pathname = usePathname()

  // `/` matches only itself; every other tab owns its subtree, so `/r/abc` highlights Runs — a
  // pushed run-detail screen is still "in" the Runs tab even though it is not a tab itself. The
  // same rule already covers F33's second screen: `/nina/about` (phase 13) highlights Nina.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/r/') : pathname.startsWith(href)

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 backdrop-blur-sm"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="relative mx-auto grid h-[58px] w-full max-w-[470px] grid-cols-5 items-center">
        <Tab {...TABS[0]} active={isActive(TABS[0].href)} />
        <Tab {...TABS[1]} active={isActive(TABS[1].href)} />

        {/* The FAB owns the middle cell of five and overflows upward out of the bar. */}
        <div className="flex justify-center">
          <Link
            href="/upload"
            aria-label="Upload a run"
            aria-current={pathname.startsWith('/upload') ? 'page' : undefined}
            className="absolute -top-5 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full bg-z5 text-white shadow-card active:scale-[0.97]"
          >
            <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        </div>

        <Tab {...TABS[2]} active={isActive(TABS[2].href)} />
        <Tab {...TABS[3]} active={isActive(TABS[3].href)} />
      </div>
    </nav>
  )
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: (props: { className: string }) => React.ReactNode
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold',
        active ? 'text-ink' : 'text-ink-3',
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  )
}

/* The icons are hand-written SVG rather than a dependency: four glyphs is not worth a package,
   and an icon font would be a second webfont on a page whose first is already Poppins. */

function RunsIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * A speech balloon with a tail, not Nina's face.
 *
 * The other three glyphs name what the tab *is* — a list, a trend, a person — at 20 px in one
 * stroke weight. A 20 px portrait would be a smudge, and the tab already carries her name in
 * words underneath. Her face belongs at 44 px in the chat header, where it can be read.
 */
function NinaIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M20 12.2c0 3.5-3.6 6.3-8 6.3-.86 0-1.7-.1-2.48-.3L5.2 20.4l1.2-3.1C5.15 16.1 4 14.3 4 12.2 4 8.7 7.6 5.9 12 5.9s8 2.8 8 6.3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrendsIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 16.5 9 11l3.5 3.5L20 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MeIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 20c1.6-3.4 4-5 7-5s5.4 1.6 7 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
```

**Impact:** every screen's bottom bar changes. `/`, `/trends`, `/me`, `/upload` and `/r/[id]` all
gain the Nina tab and see the `+` move 12.5 % of the bar's width to the right. Nothing else about
them changes. `components/ui/index.ts` needs no edit — it re-exports `{ TabBar }` by name, and the
two new constants are imported by path from `lib/nina`'s consumer, matching how
`components/insights/InsightCard.tsx` imports `Card` by path rather than through the barrel.

---

### Step 6: `components/ui/AppShell.tsx` — admit `/nina`, and reserve the composer's space

**File:** `components/ui/AppShell.tsx:1–45`
**Change:** the docstring's list of screens that get the bar admits `/nina`; a `bottomGap` prop
picks between two bottom-padding classes.

Why a prop and not a `className` override: `cn` joins strings and does not merge conflicting
utilities — its own docstring leans on "a caller's `className` is applied LAST", which is true of
the *class attribute* and not of the generated stylesheet, where two arbitrary `padding-bottom`
utilities sort by Tailwind's order and not by call site. A record of one class per value has no
conflict to resolve.

**Code (complete file):**

```tsx
import type * as React from 'react'

import { cn } from '@/lib/cn'
import { TabBar } from './TabBar'

/**
 * The frame every tabbed screen sits in: a 470px column, 20px gutters, and enough bottom padding to
 * clear the fixed tab bar plus the home-indicator inset.
 *
 * **Which screens get the bar, and why it is a prop rather than a layout file.** Roadmap §4.8 names
 * `/`, `/upload`, `/trends` and `/me` as the four tabs, and **F33 adds `/nina` as the fifth**;
 * `/x/[id]`, `/r/[id]/edit`, `/onboarding` and `/s/[token]` are pushed screens or standalone pages
 * with no bar at all. `/r/[id]` is the one case the roadmap and F08's own wireframes read
 * differently — §4.8 calls it a pushed screen, and §2.2's wireframe draws the bar at the bottom of
 * it. **The wireframe wins**: a run detail page is where a reader lands from a share link or after
 * a commit and then wants to go somewhere, and a screen with no way out is worse than one whose
 * chrome slightly over-claims.
 *
 * Not a route-group `layout.tsx` because `/upload`, `/x/*` and `/r/[id]/edit` are F04/F05's screens
 * with their own full-bleed chrome, and wrapping them by directory would take a layout decision
 * away from the feature that owns them.
 */

/**
 * How much room the frame leaves at the bottom for fixed chrome.
 *
 * `'chat'` exists for `/nina`, the app's first screen with **two** fixed bars stacked: the tab bar,
 * and the message composer above it.
 */
export type AppShellBottomGap = 'tabs' | 'chat'

const BOTTOM_GAP: Record<AppShellBottomGap, string> = {
  // 58px bar + the FAB's overhang + breathing room, then the safe-area inset on top.
  tabs: 'pb-[calc(6rem+var(--safe-bottom))]',
  /*
   * 78px of chrome below the composer (the 58px bar plus the FAB's 20px overhang, which the
   * composer must clear or it would slice the top off the coral circle), the composer's own 68px
   * (a 44px control in a py-3 bar), and 16px so the newest bubble is not flush against it. The
   * three numbers are `TAB_BAR_HEIGHT_PX`, `TAB_BAR_FAB_OVERHANG_PX` and `Composer`'s own
   * geometry; Tailwind cannot read a constant, so a change to any of them changes this literal.
   */
  chat: 'pb-[calc(10.5rem+var(--safe-bottom))]',
}

export function AppShell({
  children,
  className,
  bottomGap = 'tabs',
}: {
  children: React.ReactNode
  className?: string
  bottomGap?: AppShellBottomGap
}) {
  return (
    <>
      <main className={cn('mx-auto min-h-dvh w-full max-w-[470px] p-5', BOTTOM_GAP[bottomGap], className)}>
        {children}
      </main>
      <TabBar />
    </>
  )
}

/**
 * The screen title row: a name on the left, at most one plain-text link on the right.
 *
 * A plain-text link, never an icon button — "TRENDS →" is unambiguous at a glance and an icon is a
 * guess. The design brief's reading-app stance, applied to navigation.
 *
 * `/nina` deliberately does not use this: a conversation's identity is a face and a name, not a
 * title and a link, so that screen builds its own header row out of `NinaAvatar`. See
 * `app/nina/page.tsx` for the argument.
 */
export function ScreenHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-baseline justify-between gap-3">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
      {action}
    </header>
  )
}
```

**Impact:** additive with a default, so `/`, `/trends`, `/me`, `/r/[id]` and both `loading.tsx`
files compile and render identically.

---

### Step 7: the presentational components

**File:** `components/nina/types.ts` (new)

**Code:**

```ts
/**
 * What the chat screen renders. **Not a database row** — `app/nina/page.tsx` maps
 * `lib/nina/queries.ts`'s rows onto this on the server, and the mapping is the only place that
 * knows the schema.
 *
 * The indirection buys two things. Phase 1's column names, enum spelling and timestamp type can
 * change without touching a component; and the client never has to reason about a timezone,
 * because `dayISO` is computed once, on the server, by the one function in the codebase that
 * converts an instant into a day.
 */

export type ChatRole = 'user' | 'nina'

export type ChatMessageState =
  /** An optimistic row: the runner pressed send and the action has not answered. */
  | 'sending'
  /** The server has it. Every row the page renders starts here. */
  | 'sent'
  /** The action threw — a network drop, not a model failure. The text is still in the bubble. */
  | 'failed'

export interface ChatMessage {
  /** `nina_messages.id`, or a client-minted `local-…` id until the action returns the real one. */
  id: string
  role: ChatRole
  /** Plain text. There is no markdown renderer in this app; see `MessageBubble`. */
  body: string
  /** The Asia/Jakarta calendar day (D6) this message belongs to, from `jakartaDayOf`. */
  dayISO: string
  state: ChatMessageState
}
```

---

**File:** `components/nina/NinaAvatar.tsx` (new)

**Code:**

```tsx
import Image from 'next/image'

import { cn } from '@/lib/cn'

/**
 * Nina's face, circular. **The app's first avatar** — `grep` finds no other, and `/s/[token]`
 * explicitly refuses one ("a shared run is a run, not a profile"), so there is nothing to inherit
 * and nothing forbidding it.
 *
 * `next/image` and not a plain `<img>`, which inverts the rule at the other four image call sites
 * — and the inversion is the point. Those serve Vercel Blob URLs holding files the browser already
 * compressed to ~55 KB, so re-optimising them would spend a paid transformation on nothing. This is
 * committed local art (phase 1 writes `public/nina/avatar-001.png`) at unknown intrinsic size, drawn
 * at 28 or 44 px, which is exactly the case `next/image` is for — the same reason `DetailPanel`
 * uses it for badge art.
 *
 * `fill` inside a fixed-size box rather than `width`/`height`, because her portrait is not square
 * (the anchor is 1792x2400) and a circular crop needs `object-cover` against a square box.
 *
 * `alt=""`. Both call sites already name her in adjacent text — the header says "Nina", the typing
 * row is `aria-hidden` behind a live region that says "Nina is typing". An `alt="Nina"` here would
 * make a screen reader say her name twice and tell the reader nothing new.
 *
 * Phase 13 replaces the source with `nina_avatars.is_current` and wraps this in a `<Link>` to
 * `/nina/about`. It renders here; it does not navigate here.
 */

/**
 * Phase 1 commits this file. The album that supersedes it is phase 13's, and RULING A5 fixes how:
 * phase 13 turns this constant into a **re-export of `NINA_AVATAR_FALLBACK_SRC` from
 * `lib/nina/album.ts`**, so every import written in this phase keeps compiling and the string
 * `'/nina/avatar-001.png'` is spelled exactly once in the repo. Phase 15's `CircleFrame` imports
 * that same constant rather than declaring a third copy.
 */
export const NINA_AVATAR_SRC = '/nina/avatar-001.png'

const SIZES = {
  /** 28px — beside the typing indicator. */
  sm: 'size-7',
  /** 44px — the chat header. Also the iOS tap-target floor, for when phase 13 makes it a link. */
  md: 'size-11',
} as const

export function NinaAvatar({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-pill bg-paper-2',
        SIZES[size],
        className,
      )}
    >
      <Image src={NINA_AVATAR_SRC} alt="" fill sizes="88px" className="object-cover" />
    </span>
  )
}
```

**`size="sm"` below is `NinaAvatar`'s own union, not `Button`'s — verified, do not "fix" it.**
`components/ui/Button.tsx` declares `ButtonSize = 'md' | 'lg'` and has no `'sm'`, which is a real
trap; but the `<NinaAvatar size="sm" />` in `TypingIndicator` resolves against the
`SIZES = { sm: 'size-7', md: 'size-11' }` record printed three lines up, and it is correct as
written (RULING E7). This phase writes `size="sm"` on no `Button` anywhere.

---

**File:** `components/nina/TypingIndicator.tsx` (new)

**Code:**

```tsx
import { LoadingDots } from '@/components/ui/Button'

import { NinaAvatar } from './NinaAvatar'

/**
 * Nina, mid-thought.
 *
 * **`LoadingDots` is reused, not re-drawn**, and this is not merely tidiness. That component's
 * docstring is the app's whole loading vocabulary — "Not a spinner: a spinner reads as 'the app is
 * thinking about itself', three dots read as 'your thing is being worked on'" — which is precisely
 * the sentence a typing indicator wants to say. And it animates through `ri-pulse`, the app's one
 * keyframe, which `app/globals.css` already neutralises under `prefers-reduced-motion`. A
 * hand-rolled second keyframe would fail `tests/motion.reducedMotion.test.ts`, whose job is to
 * assert that every animated keyframe has an escape.
 *
 * `aria-hidden`, because three dots are not information. `ChatScreen` carries the spoken version in
 * an `aria-live="polite"` region, which is where a screen reader should hear it.
 *
 * The bubble shape is `MessageBubble`'s "hers" exactly — same fill, same radii, same tail corner —
 * so the dots occupy the space her first line is about to occupy, rather than announcing themselves
 * as a different kind of object.
 */
export function TypingIndicator() {
  return (
    <li className="flex items-end justify-start gap-2" aria-hidden="true">
      <NinaAvatar size="sm" />
      <span className="rounded-card rounded-bl-chip bg-card px-4 py-3.5 text-ink-3 shadow-card">
        <LoadingDots />
      </span>
    </li>
  )
}
```

---

**File:** `components/nina/MessageBubble.tsx` (new)

**Code:**

```tsx
import type * as React from 'react'

import { cn } from '@/lib/cn'
import type { ChatMessage } from './types'

/**
 * One message. Two sides, one extension slot, no client JavaScript.
 *
 * Not marked `'use client'` **at this phase's landing**, for the reason `Button` and `Chip` are
 * not: nothing here uses a hook, so the module compiles into whichever graph imports it. Today
 * that is only `MessageList`.
 *
 * **Phase 7 adds `'use client'` to this file, and that is checked and fine (RULING E8).** It owns
 * a touch gesture on the quote stub, which needs a hook, so the directive is unavoidable there.
 * Nobody downstream loses anything: phase 6 does not edit this file and reaches it through
 * `MessageList`; phase 8 fills `above` from `MessageList`; phase 11 states explicitly that it does
 * not touch this file; and phase 13 needs no server-rendered bubble, because attaching an album
 * photo writes a real row and the page navigates to `/nina`, where this renderer draws it. So no
 * `BubbleShell` split is needed — and the directive is recorded here rather than discovered by
 * watching a build fail.
 *
 * ── WHY THESE TWO FILLS AND NOT A COLOURED ONE ────────────────────────────────────────────────
 * Hers is `bg-card` + `shadow-card` at `rounded-card`, which is the app's *only* surface — "White
 * fill, 22px radius, soft shadow, no border" (`components/ui/Card.tsx`). An incoming message is a
 * card floating on sky paper, and the design system already had the answer.
 *
 * His is `bg-ink text-card`, which is the one saturated fill this system endorses: `Chip` calls it
 * "a solid ink slab" and pairs it with the tint of the page "so a chip and a button never disagree
 * about what 'chosen' looks like". Here it means "mine". It also inverts correctly — in dark mode
 * `--ink` is near-white and `--card` is near-navy, so the two sides stay opposites in both schemes.
 *
 * `--accent` is **not** available for this. `Button`'s docstring records the measurement: white on
 * the cyan accent lands near 2:1, well under WCAG's 4.5:1, and "the accent earns its keep on labels
 * and links, where it sits on paper". `--z5` coral is spoken for by the Upload FAB, and `--warn` /
 * `--red` are the attention language and "never decoration" (`docs/design/tokens.css`).
 *
 * ── THE TAIL IS A RADIUS, NOT A TRIANGLE ──────────────────────────────────────────────────────
 * One corner drops from `rounded-card` (22px) to `rounded-chip` (8px) on the side the message came
 * from. That reads as a WhatsApp tail using two radii the system already publishes, and it needs no
 * pseudo-element, no rotated square and no border — which matters, because "no borders on surfaces"
 * is a hard rule and a drawn tail is the classic way people break it.
 *
 * ── 15px, WHERE THE APP'S BODY TEXT IS 13 ─────────────────────────────────────────────────────
 * A deliberate step up, and the only place in the app that takes it for prose. `InsightCard`'s 13px
 * body sits *below* a 19px headline that carries the screen; a chat bubble has nothing above it, so
 * the bubble text IS the screen's content. 15px is an existing step in the scale (it is `Button`'s
 * label size), not a new one, and `leading-[1.5]` keeps the block readable at that size.
 *
 * ── NO ENTRANCE ANIMATION ─────────────────────────────────────────────────────────────────────
 * A bubble appears. It does not slide, fade or scale in. This app has exactly one keyframe and a
 * global reduced-motion escape that redefines it to hold still; a second keyframe for decoration
 * would be the first in the codebase and would have to argue against that file's own conclusion
 * that "the pulse was decoration over a signal that does not need it". The stagger from
 * `lib/nina/reveal.ts` is the only timing on this screen, and it carries real information — that
 * these are four separate things she said.
 *
 * ── PLAIN TEXT, ON PURPOSE ────────────────────────────────────────────────────────────────────
 * `whitespace-pre-wrap` so her line breaks survive, `break-words` so a pasted URL cannot widen the
 * column. No markdown renderer and no `dangerouslySetInnerHTML`: there is no markdown anywhere in
 * this app, and adding one here would be inventing a capability rather than shipping a screen.
 * iOS auto-linking of times and dates is already off app-wide (`app/layout.tsx`'s
 * `formatDetection`), which is what stops "jam 7" turning into a phone number in a bubble.
 */
export function MessageBubble({
  message,
  above,
}: {
  message: ChatMessage
  /**
   * Rendered inside the bubble, above the text. **The seam for phases 6 and 8** — the images (6)
   * and the attached-run card (8) hang here, composed by `MessageList`. The reply quote does
   * **not**: phase 7 gives it its own `quote` prop on this component so the two never compete for
   * one slot, and renders `quote` above `above` (RULING E2). Render order, top to bottom:
   * quote stub → images → run card → text.
   *
   * The pattern to follow is `InsightCard`'s nested block, with one substitution:
   * `rounded-field bg-ink-3/20 p-3.5`, **not** `bg-paper-2`. `bg-paper-2` is near-white in light
   * mode and near-navy in dark, so inside a `bg-ink` bubble it inverts and reads as a hole in one
   * scheme. `--ink-3` is `#93a2b0` in light and `#7c8d9b` in dark (`app/globals.css`) — a
   * mid-grey in both — so one class works on both sides with no per-side branch and no variant
   * plumbing (RULING E1). Phase 4 never passes this prop.
   */
  above?: React.ReactNode
}) {
  const mine = message.role === 'user'

  return (
    <li
      /*
       * A stable DOM id per message. Phase 7 needs exactly this to scroll a tapped quote to its
       * target; it costs one attribute now and would cost a re-read of every row later.
       */
      id={`nina-msg-${message.id}`}
      data-role={message.role}
      className={cn('flex', mine ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] px-4 py-2.5 text-[15px] leading-[1.5] font-medium break-words whitespace-pre-wrap',
          mine
            ? 'rounded-card rounded-br-chip bg-ink text-card'
            : 'rounded-card rounded-bl-chip bg-card text-ink shadow-card',
          // Two quiet states, both of which leave the text readable. An optimistic row is dimmed
          // while it is unconfirmed; a row whose send threw keeps a red hairline so the runner can
          // see which line to try again, without an icon, a badge or a retry button.
          message.state === 'sending' && 'opacity-60',
          message.state === 'failed' && 'ring-1 ring-red',
        )}
      >
        {above}
        {message.body}
      </div>
    </li>
  )
}
```

**Impact:** none until the list renders it.

---

### Step 8: `components/nina/MessageList.tsx`

**File:** `components/nina/MessageList.tsx` (new)
**Change:** the day-grouped list, and the one effect that decides whether to follow the
conversation down.

The screen uses **document scroll**, not an inner `overflow-y-auto` panel. An inner scroller sized
in `dvh` fights the iOS keyboard and the collapsing URL bar, both of which Safari handles correctly
for the document. It also means the list needs no height of its own and inherits `AppShell`'s
470px column and 20px gutters unchanged.

**Code:**

```tsx
'use client'

import { useEffect, useRef } from 'react'

import { formatDayCompact } from '@/lib/format'
import { decideAutoScroll, groupIntoDays, isNearBottom, type ScrollCause } from '@/lib/nina/chatview'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import type { ChatMessage } from './types'

/**
 * The conversation, grouped by day, newest at the bottom.
 *
 * ── WHY THE PAGE SCROLLS AND NOT A PANEL ──────────────────────────────────────────────────────
 * There is no `overflow-y-auto` container here. A chat pane sized in `dvh` has to fight two things
 * iOS does to the document and does correctly: the collapsing URL bar, and the keyboard changing
 * the visible area without changing the layout viewport. Letting the document scroll hands both
 * back to the platform, and it is also the reading-app answer — a conversation is a document with
 * the composer as its last row, not a viewport with a feed inside it.
 *
 * ── WHY THE "WAS HE AT THE BOTTOM" ANSWER IS SAMPLED, NOT MEASURED IN THE EFFECT ──────────────
 * By the time an effect runs, the new bubble is already in the DOM and `scrollHeight` already
 * includes it, so measuring the distance to the bottom *then* always says "far away" and would
 * turn rule 3 of `decideAutoScroll` into "never follow". A passive `scroll` listener keeps the
 * answer up to date instead, and the effect reads the last sample. The listener does no work
 * beyond one comparison, and it holds a ref rather than state so a scroll never re-renders the
 * list.
 *
 * The day divider reuses `RunList`'s week-divider recipe exactly — `text-[11px] font-semibold
 * tracking-[0.06em] text-ink-3 uppercase`, and "Today" in place of a date for the current day for
 * the same reason that file gives: a reader at the bottom of his own conversation knows what day
 * it is, and the date is noise there but only there.
 *
 * **There is no per-message timestamp**, deliberately. See `app/nina/page.tsx`.
 */
export function MessageList({
  messages,
  typing,
  todayISO,
  keyboardOverlapPx,
}: {
  messages: readonly ChatMessage[]
  /** True while a turn is in flight, and between bubbles of a staggered reveal. */
  typing: boolean
  /** Computed on the server so "Today" cannot disagree between render and hydration. */
  todayISO: string
  /** Changes when the software keyboard opens or closes; a reason to re-check the scroll. */
  keyboardOverlapPx: number
}) {
  const readerNearBottom = useRef(true)
  const mounted = useRef(false)
  const lastCount = useRef(messages.length)
  const lastTyping = useRef(typing)
  const lastOverlap = useRef(keyboardOverlapPx)

  // Sample where the reader is, continuously and cheaply, so the effect below has an answer that
  // predates the DOM change it is reacting to.
  useEffect(() => {
    const sample = () => {
      readerNearBottom.current = isNearBottom({
        scrollTop: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight,
      })
    }
    sample()
    window.addEventListener('scroll', sample, { passive: true })
    window.addEventListener('resize', sample)
    return () => {
      window.removeEventListener('scroll', sample)
      window.removeEventListener('resize', sample)
    }
  }, [])

  useEffect(() => {
    const grew = messages.length > lastCount.current
    const startedTyping = typing && !lastTyping.current
    const viewportMoved = keyboardOverlapPx !== lastOverlap.current
    const first = !mounted.current

    const cause: ScrollCause | null = first
      ? 'mount'
      : grew && messages[messages.length - 1]?.role === 'user'
        ? 'own-message'
        : grew || startedTyping
          ? 'incoming'
          : viewportMoved
            ? 'viewport'
            : null

    mounted.current = true
    lastCount.current = messages.length
    lastTyping.current = typing
    lastOverlap.current = keyboardOverlapPx
    if (cause === null) return

    const decision = decideAutoScroll({
      cause,
      readerNearBottom: readerNearBottom.current,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    if (decision === 'none') return

    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: decision === 'jump' ? 'instant' : 'smooth',
    })
    // A jump lands at the bottom, so the sample is stale by one frame; correct it now rather than
    // wait for a scroll event that an 'instant' scroll may not fire.
    readerNearBottom.current = true
  }, [messages, typing, keyboardOverlapPx])

  return (
    <div className="space-y-5">
      {groupIntoDays(messages).map((day) => (
        <section key={day.dayISO}>
          <h2 className="text-center text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            {day.dayISO === todayISO ? 'Today' : formatDayCompact(day.dayISO)}
          </h2>
          {/* 8px between bubbles: on the 4pt base (4, 8, 12, 16, 22, 28) even though `space-y-2`
              is a step this codebase had not needed before a conversation existed. */}
          <ul className="mt-3 space-y-2">
            {day.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </ul>
        </section>
      ))}

      {typing && (
        <ul className="space-y-2">
          <TypingIndicator />
        </ul>
      )}
    </div>
  )
}
```

**Impact:** none outside `/nina`.

---

### Step 9: `components/nina/Composer.tsx`

**File:** `components/nina/Composer.tsx` (new)

**Code:**

```tsx
'use client'

import { useRef, useState } from 'react'

import { cn } from '@/lib/cn'

/**
 * The message composer: a fixed bar above the tab bar, an auto-growing textarea, one send button.
 *
 * ── IT OWNS ITS OWN TEXT, AND THAT IS A BUG FIX WRITTEN IN ADVANCE ────────────────────────────
 * `value` lives here, not in `ChatScreen`, so a keystroke re-renders this component and nothing
 * above it. `components/ui/Sheet.tsx` carries the report of what happens otherwise: an unstable
 * dependency reaching a focused input made "focus leave the input and iOS dropped the keyboard —
 * one digit per keyboard". A composer is that bug's natural habitat. The rules that follow from it:
 * this component is never given a `key` that changes, and `onSend` is a `useCallback` upstream.
 *
 * ── THE FIXED BAR'S GEOMETRY ──────────────────────────────────────────────────────────────────
 * `bottomCss` is computed by `composerBottomCss` in `lib/nina/chatview.ts` and clears 78 px of
 * chrome: the tab bar's 58 px plus the Upload FAB's 20 px overhang above the bar's top edge. The
 * FAB is not optional to clear — the composer is at `z-40` and the bar at `z-30`, so a bar sitting
 * flush on the tab bar's top edge would slice the top off the coral circle. The home-indicator
 * inset rides in that same offset rather than in this element's padding, because the tab bar below
 * already pads by it and counting it twice would open a gap.
 *
 * `z-40` matches `ReviewClient`'s sticky action bar, the app's only other second fixed bar, and
 * leaves `Sheet` (`z-50`) and `PhotoViewer` (`z-60`) covering it. `bg-paper/90 backdrop-blur-md` is
 * that file's recipe too.
 *
 * ── 16px, AND WHY IT IS NOT NEGOTIABLE ────────────────────────────────────────────────────────
 * `app/globals.css` sets `input, select, textarea { font-size: max(16px, 1rem) }` because Safari
 * zooms the viewport when you focus anything smaller, and the design brief makes that one of the
 * iOS rules that beat the design. So this is the one place on the screen where text is 16px rather
 * than the bubble's 15px, and no `text-[15px]` may be added here to "fix" it.
 *
 * `CONTROL_CLASS` from `components/ui/Field.tsx` is not reused: it is `h-[52px]` and
 * `tabular-nums`, built for a fixed-height numeric field. An auto-growing prose textarea shares
 * its radius and its fill and nothing else, so it borrows those two literally rather than
 * inheriting a shape that fights it.
 *
 * ── THE SEND BUTTON IS 44px, AND DISABLING IT IS NOT A VALIDATION MESSAGE ─────────────────────
 * `size-11` is the iOS floor, the same as every other icon-only button in the app.
 * `ReviewClient`'s rule — "NEVER disabled for validation… a greyed-out button with no explanation
 * is the least useful message an app can send" — is about a rule the user has broken and cannot
 * see. This is not that: an empty box is the explanation, and there is nothing to send.
 */

/** Roughly five lines at 16px, after which the textarea scrolls instead of growing. */
const TEXTAREA_MAX_PX = 132

export function Composer({
  onSend,
  busy,
  bottomCss,
}: {
  /**
   * Receives the trimmed body. Must be referentially stable — see the docstring.
   *
   * `void | Promise<void>` rather than `void`: `ChatScreen`'s handler is async, and while an
   * async function is assignable to a `void`-returning type, spelling the union means nobody has
   * to know that to read this signature.
   */
  onSend: (body: string) => void | Promise<void>
  /** A turn is in flight. The box stays editable; only sending is held. */
  busy: boolean
  /** From `composerBottomCss`. A CSS length, because `var(--safe-bottom)` is CSS-only. */
  bottomCss: string
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const canSend = value.trim().length > 0 && !busy

  function resize() {
    const el = ref.current
    if (el == null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`
  }

  function submit() {
    if (!canSend) return
    onSend(value.trim())
    setValue('')
    const el = ref.current
    if (el != null) {
      el.style.height = 'auto'
      // Keep the keyboard up. He is going to type again — that is what a conversation is.
      el.focus()
    }
  }

  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-rule bg-paper/90 backdrop-blur-md"
      style={{ bottom: bottomCss }}
    >
      <div className="mx-auto flex max-w-[470px] items-end gap-2 px-5 py-3">
        {/* Phases 6 and 8 add `size-11` icon buttons to the left of the textarea, in this row. */}
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            resize()
          }}
          onKeyDown={(event) => {
            /*
             * Enter sends; Shift+Enter is a newline. `enterKeyHint="send"` relabels the iOS return
             * key so the phone agrees with the behaviour. `isComposing` is the guard that keeps an
             * IME's own Enter — committing a candidate — from firing the message half-typed.
             */
            if (event.key !== 'Enter' || event.shiftKey) return
            if (event.nativeEvent.isComposing) return
            event.preventDefault()
            submit()
          }}
          enterKeyHint="send"
          placeholder="Message Nina"
          aria-label="Message Nina"
          className={cn(
            'max-h-[132px] min-h-11 w-full resize-none rounded-field bg-card px-4 py-2.5',
            'text-base font-medium text-ink outline-none',
            'placeholder:font-medium placeholder:text-ink-3',
            'focus-visible:ring-2 focus-visible:ring-accent',
          )}
        />

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className="grid size-11 shrink-0 place-items-center rounded-pill bg-ink text-card transition-opacity active:scale-[0.97] disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M12 19V5M6 11l6-6 6 6"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
```

**Impact:** none outside `/nina`.

---

### Step 10: `components/nina/ChatScreen.tsx` — the turn

**File:** `components/nina/ChatScreen.tsx` (new)
**Change:** the optimistic row, the one call to phase 3's action, and the staggered reveal.

**The two Next-16 facts this file is built on**, both from
`node_modules/next/dist/docs/01-app/02-guides/interactive-apps.md`:

1. "Inside a transition, `useState` setters are **deferred until the transition completes**". So
   the reveal loop must **not** run inside `startTransition` or `useActionState` — every
   `setMessages` between bubbles would be batched to the end and all four would land at once,
   which is the exact opposite of RU-5.
2. `useOptimistic` pending state is discarded when the transition ends. That frame is precisely
   when the first bubble is meant to appear, so the doc's `OptimisticComments` pattern is the wrong
   one here and plain `useState` is the right one.

The consequence is that this screen does not `router.refresh()` after a turn. It does not need to:
phase 3 has already persisted every row, a reload renders the same conversation, and refreshing
would re-render the server list underneath a reveal that is still in flight. Proactive messages
written elsewhere (phase 10) are that phase's problem to surface.

**Code:**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { TAB_BAR_FAB_OVERHANG_PX, TAB_BAR_HEIGHT_PX } from '@/components/ui/TabBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { todayInJakarta } from '@/lib/date/ranges'
import { sendNinaMessage } from '@/lib/nina/actions'
import { composerBottomCss, keyboardOverlapPx } from '@/lib/nina/chatview'
import { planReveal } from '@/lib/nina/reveal'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import type { ChatMessage } from './types'

/**
 * The interactive half of `/nina`: one turn, from the runner pressing send to Nina's last bubble.
 *
 * ── WHY THIS IS NOT INSIDE A TRANSITION ───────────────────────────────────────────────────────
 * Next 16's own interactive-apps guide is explicit that "inside a transition, `useState` setters
 * are deferred until the transition completes". A staggered reveal is a sequence of `setState`
 * calls separated by real time, so wrapping the turn in `startTransition` or `useActionState`
 * would batch all four bubbles to the end and deliver them in one frame — RU-5, inverted. For the
 * same reason the guide's `useOptimistic` pattern is wrong here: optimistic state is discarded
 * when the transition ends, and that is exactly the frame the first bubble is supposed to appear
 * in. Plain `useState` and a plain async handler are the correct tools, not the lazy ones.
 *
 * ── WHY NOTHING IS REFRESHED AFTERWARDS ───────────────────────────────────────────────────────
 * Phase 3 persists the runner's message and every bubble before the action returns, so a reload
 * renders exactly what is on screen. Calling `router.refresh()` would re-render the server list
 * underneath a reveal still in progress and make her bubbles blink out and back. The rows this
 * component appends are the same rows the server would send.
 *
 * ── WHY THE PAGE DID NOT AWAIT THE MODEL ──────────────────────────────────────────────────────
 * The same boundary that guards `getOrCreateInsight`, and now guards Nina's turn (invariant 4,
 * enforced by `scripts/check-llm-payload-boundary.mjs`): a turn is a 13-16 s model call. The page
 * renders the stored conversation from indexed reads, and the model is only ever reached from
 * here, on an event, after the screen is already useful. `components/insights/InsightTrigger.tsx`
 * is the same shape one interaction earlier.
 *
 * ── THE TWO FAILURE STATES, AND WHY NEITHER IS A FAKE NINA MESSAGE ────────────────────────────
 * A thrown action is a send that did not happen; a returned `unavailable` or an empty `bubbles`
 * array is phase 3's documented silence after a repair also failed. They are told apart because
 * they call for different things — try again, versus she has nothing to say. Neither is rendered
 * as a bubble. Putting app-authored words in her mouth would be the fabrication `lib/llm/narrate.ts`
 * refuses ("the only safe fallback for prose is the absence of prose"), and it would teach the
 * runner to distrust every other bubble on the screen. R22's in-character apology is a genuinely
 * different case — a *tool* failing mid-turn, which phase 12 owns, and where Nina really is the one
 * who should speak.
 */

type Notice = 'send-failed' | 'no-reply'

const NOTICE_TEXT: Record<Notice, string> = {
  'send-failed': 'That didn’t send. Check your connection and try it again.',
  'no-reply': 'Nina went quiet on that one. Your message is saved — send another and she will pick it up.',
}

/** The chrome the composer sits above: the bar, plus the FAB's overhang past the bar's top edge. */
const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX

export function ChatScreen({
  initial,
  todayISO,
}: {
  /** The stored conversation, oldest first, mapped on the server. */
  initial: readonly ChatMessage[]
  /** From the server, so "Today" cannot differ between render and hydration. */
  todayISO: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...initial])
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [overlap, setOverlap] = useState(0)

  // Every timed step checks this before touching state. StrictMode double-invokes effects in
  // development and a runner can navigate away mid-reveal; both would otherwise set state on an
  // unmounted tree. `InsightTrigger` uses the same guard for the same reason.
  const alive = useRef(true)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  /*
   * The iOS keyboard. Safari does not resize the layout viewport when it opens, so a fixed
   * composer would sit behind it and Safari will not scroll fixed chrome into view. `visualViewport`
   * is the only honest measurement; `keyboardOverlapPx` turns it into a number and filters out the
   * URL bar and pinch-zoom. Empty deps, so a keystroke never re-subscribes.
   */
  useEffect(() => {
    const vv = window.visualViewport
    if (vv == null) return
    const sync = () => {
      setOverlap(
        keyboardOverlapPx({
          innerHeight: window.innerHeight,
          visualHeight: vv.height,
          visualOffsetTop: vv.offsetTop,
        }),
      )
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      timer.current = window.setTimeout(resolve, ms)
    })

  const handleSend = useCallback(
    async (body: string) => {
      if (busy) return

      const localId = `local-${crypto.randomUUID()}`
      const dayISO = todayInJakarta()
      setNotice(null)
      setMessages((current) => [
        ...current,
        { id: localId, role: 'user', body, dayISO, state: 'sending' },
      ])
      setBusy(true)
      setTyping(true)

      let result: Awaited<ReturnType<typeof sendNinaMessage>> | null = null
      try {
        result = await sendNinaMessage({ body })
      } catch {
        result = null
      }
      if (!alive.current) return

      if (result === null || !result.ok) {
        setTyping(false)
        setBusy(false)
        setMessages((current) =>
          current.map((m) => (m.id === localId ? { ...m, state: 'failed' } : m)),
        )
        setNotice('send-failed')
        return
      }

      // Adopt the server's id for the runner's own row, so phase 7 can quote it and phase 8 can
      // anchor to it. Until this point it carried a client-minted `local-` id.
      const confirmedId = result.userMessageId
      setMessages((current) =>
        current.map((m) =>
          m.id === localId ? { ...m, id: confirmedId ?? m.id, state: 'sent' } : m,
        ),
      )

      const bubbles = result.bubbles
      if (bubbles.length === 0) {
        setTyping(false)
        setBusy(false)
        setNotice(result.unavailable ? 'no-reply' : 'no-reply')
        return
      }

      const plan = planReveal(bubbles.map((b) => b.body))
      for (const [index, bubble] of bubbles.entries()) {
        const gap = plan[index] ?? 0
        if (gap > 0) {
          setTyping(true)
          await sleep(gap)
          if (!alive.current) return
        }
        // The indicator stays up while there is another thought coming, and drops with the last.
        setTyping(index < bubbles.length - 1)
        setMessages((current) => [
          ...current,
          { id: bubble.id, role: 'nina', body: bubble.body, dayISO: todayInJakarta(), state: 'sent' },
        ])
      }

      setTyping(false)
      setBusy(false)
    },
    [busy],
  )

  return (
    <>
      {messages.length === 0 && !typing ? (
        <EmptyState
          title="Nina has not started yet"
          description="Say something and she will answer. She has read every run you have logged, so she already has opinions."
        />
      ) : (
        <MessageList
          messages={messages}
          typing={typing}
          todayISO={todayISO}
          keyboardOverlapPx={overlap}
        />
      )}

      {notice !== null && (
        <p className="mt-4 text-[12px] font-medium text-ink-3">{NOTICE_TEXT[notice]}</p>
      )}

      {/* The spoken half of the typing indicator. The dots themselves are `aria-hidden`. */}
      <p className="sr-only" role="status" aria-live="polite">
        {typing ? 'Nina is typing' : ''}
      </p>

      <Composer
        onSend={handleSend}
        busy={busy}
        bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}
      />
    </>
  )
}
```

**Impact:** the only caller of `sendNinaMessage` in the tree, which is what keeps invariant 4's
grep satisfied with `lib/nina/actions.ts` as the sanctioned boundary.

Note the deliberate redundancy at `setNotice(result.unavailable ? 'no-reply' : 'no-reply')`: both
branches are the same message today because the runner does not care *why* she said nothing, and
the ternary is left in place so that the moment they need to differ, the site is already there.
**If a reviewer prefers it collapsed to `setNotice('no-reply')`, collapse it** — it is a comment
written as code, and it should not survive as one.

---

### Step 11: `app/nina/page.tsx`

**File:** `app/nina/page.tsx` (new)

**Code:**

```tsx
import { AppShell } from '@/components/ui/AppShell'
import { ChatScreen } from '@/components/nina/ChatScreen'
import { NinaAvatar } from '@/components/nina/NinaAvatar'
import type { ChatMessage } from '@/components/nina/types'
import { requireUserId } from '@/lib/auth/requireUserId'
import { jakartaDayOf, todayInJakarta } from '@/lib/date/ranges'
import { listNinaMessages } from '@/lib/nina/queries'

/**
 * `/nina` — F33's conversational surface, and the fifth tab (R9).
 *
 * ── ONE READ, NO MODEL CALL ───────────────────────────────────────────────────────────────────
 * This page awaits `requireUserId()` and one indexed query, and nothing else. A turn is a 13-16 s
 * `glm-5.3` call (fifteen measured, 10.2-16.4 s), so awaiting one here would trade a complete
 * screen for a blank one — invariant 4, the same boundary that keeps `getOrCreateInsight` out of
 * `/r/[id]`'s render path and is enforced by the same CI grep. The conversation is stored rows;
 * the model is reached only from `ChatScreen`'s send handler, after this has painted.
 *
 * ── WHY THE HEADER IS NOT `ScreenHeader` ──────────────────────────────────────────────────────
 * `ScreenHeader`'s contract is "a name on the left, at most one plain-text link on the right", and
 * a conversation's identity is a face. So this screen builds its own row: her avatar at 44px, her
 * name at the same `text-[26px] font-bold tracking-[-0.02em]` every other screen title uses, and
 * one quiet line under it. The type is identical; only the avatar is new, which is the smallest
 * possible departure. Phase 13 turns the avatar into a link to `/nina/about`; nothing else here
 * moves.
 *
 * ── WHY THERE ARE NO PER-MESSAGE TIMESTAMPS ───────────────────────────────────────────────────
 * Day dividers only. Three reasons, in order of weight. `lib/format.ts` has no time-of-day
 * formatter for an instant (`formatClock` narrows a Postgres `time`, `formatClockSec` a seconds
 * offset) and inventing one would put a rendered string outside the file that owns every rendered
 * string (invariant 3, R-23). Formatting an instant in a client component is the classic hydration
 * mismatch, because the server's timezone is UTC and the phone's is not. And the reading-app stance
 * is explicit that "if you're deciding between adding something and leaving it out, leave it out" —
 * a clock on every line of a conversation you had five minutes ago is the thing to leave out.
 * `dayISO` is therefore computed here, on the server, by the one function in the codebase that
 * converts an instant into a calendar day.
 *
 * ── WHY THE ROWS ARE MAPPED RATHER THAN PASSED ────────────────────────────────────────────────
 * `ChatMessage` is a view model, not a row. The mapping below is the only code in the phase that
 * knows a column name, which is what lets phase 1 spell `role` as a `pgEnum`, a `text` with a
 * check, or a `varchar` without touching a component. `row.role === 'nina' ? 'nina' : 'user'`
 * narrows structurally on purpose.
 */

/**
 * How much conversation the screen renders. Deliberately unrelated to RU-14's 40-message *prompt*
 * window: what Nina is given to read and what the runner can scroll back through are two different
 * questions, and conflating them would either starve the screen or bloat the payload.
 */
const CHAT_HISTORY_LIMIT = 200

/**
 * **For the Server Action, not for this render.** This page is one indexed read and is done in
 * milliseconds; `ChatScreen` then calls `sendNinaMessage` from a client event handler, and a
 * Server Action's timeout is the *page segment's*, not the action file's. `app/r/[id]/page.tsx:65`
 * already states this quoting Next's `maxDuration` reference — "If using Server Actions, set the
 * `maxDuration` at the page level to change the default timeout of all Server Actions used on the
 * page" — and `app/trends/page.tsx` and `app/r/[id]/page.tsx` both carry the line for exactly this
 * reason.
 *
 * Without it, `sendNinaMessage`'s 45 s budget is fiction: the platform default kills the action
 * mid-call and the runner gets R-17's "unavailable" for a model that was answering correctly. Worse
 * than the failure is how it reads — an intermittent bug rather than a timeout, which is the same
 * trap F31 walked into once already.
 *
 * A LITERAL `60`, for the reason `app/api/extract/route.ts` spells out at length: segment config
 * exports are statically analysed at build time and an imported constant is not a value the
 * analyser can see.
 */
export const maxDuration = 60

export default async function NinaPage() {
  const userId = await requireUserId()
  const rows = await listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT })

  const initial: ChatMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role === 'nina' ? 'nina' : 'user',
    body: row.body,
    dayISO: jakartaDayOf(row.createdAt),
    state: 'sent',
  }))

  return (
    <AppShell bottomGap="chat">
      <header className="mb-5 flex items-center gap-3">
        <NinaAvatar size="md" />
        <div className="min-w-0">
          <h1 className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">Nina</h1>
          <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
            Reads every run. Says what she thinks.
          </p>
        </div>
      </header>

      <ChatScreen initial={initial} todayISO={todayInJakarta()} />
    </AppShell>
  )
}
```

**Impact:** one new route. No `loading.tsx` is added — see Handoffs for why that is deliberate.
The `maxDuration` line is load-bearing downstream and this phase is its only owner: **phase 6**
(whose describe-then-send turn is longer still) and **phase 12** (whose image tool extends the same
action) both depend on the line already being there, and phase 3's handoff about it is a record
that it landed here rather than an ask.

---

### Step 11b: `proxy.ts` — one sentence in the matcher's docstring, and nothing else

**File:** `proxy.ts` (modify — **comment only**)
**Change:** one sentence appended to the matcher's docstring. `config.matcher` is byte-identical
before and after.

**The matcher gains nothing. `/nina` is not added, and phase 15 does not add `/admin/:path*`**
(RULING D3). Four reasons, and they compound:

1. The file's own header already draws the line: authorization lives in `requireUserId()` plus the
   `userId` filter inside every query, *"Full stop"* (`proxy.ts:14–17`). The matcher is a **UX
   redirect list**, not the security boundary.
2. Nothing is unprotected either way. `/nina` is gated by `requireUserId()` — the first `await` in
   `app/nina/page.tsx` above — and `/admin/**` by `requireAdmin()`, which redirects a signed-out
   visitor and `notFound()`s a signed-in non-admin.
3. The only gain would be a marginally nicer bounce, and it is smaller than it looks: `?next=` is
   read by **nothing** on `/`, so the redirect's whole payload is currently decoration.
4. Listing `/admin/:path*` in a UX-redirect matcher would **imply the proxy is the admin
   boundary** — precisely the misreading that header exists to prevent. Adding a line to buy a
   nicer bounce and paying for it with that misreading is a bad trade.

What is genuinely wrong today is one sentence of documentation: *"Adding a protected page means
adding a line here"* is now half-true, because this phase adds a protected page and deliberately
does not. So the docstring says so, immediately after that sentence:

```ts
 * `/r/:path*` covers `/r/[id]` and `/r/[id]/edit` in one line. `/x/:path*` covers the pre-commit
 * review screen (R-1). Adding a protected page means adding a line here; adding a public one means
 * doing nothing, which is the safer default because every page also enforces auth itself.
 *
 * DELIBERATELY OMITTED, and not an oversight: `/nina` (F33) and `/admin/**`. Both are protected —
 * `/nina` by `requireUserId()`, `/admin/**` by `requireAdmin()`, which redirects a signed-out
 * visitor and `notFound()`s a signed-in non-admin — so neither needs this file to be safe, and the
 * only thing a line here would buy is a slightly nicer bounce. It would cost more than that:
 * `?next=` is read by nothing on `/`, and listing `/admin/:path*` in a UX-redirect matcher implies
 * this file is the admin boundary, which is the exact misreading the header above exists to
 * prevent.
```

**Impact:** none at runtime — a comment. `tests/auth.proxy.matcher.test.ts` is **untouched**,
because it asserts the matcher array against Next's own matcher compiler and that array does not
change. Phases 15 and 16 record this ruling and change nothing.

*Revisit if* a `?next=` handler is ever built on `/`. The moment the sign-in screen actually
consumes that parameter, the "nicer bounce" stops being decoration and the trade is worth
re-running.

---

## Verification

**Build:**

```
npm run format && npm run typecheck && npm run lint
```

`npm run format` first, not as an afterthought: `prettier-plugin-tailwindcss` sorts class strings,
and this phase writes a lot of them. Committing hand-ordered classes and letting `format:check`
fail in review is noise nobody needs to read.

**Tests:**

```
npm test
npm run ci:llm-payload-guard && npm run ci:f08-guard && npm run ci:client-secret-guard && npm run ci:data-layer-guard
```

The four guards are the ones this phase can plausibly trip, and each has a specific reason to run:

- `ci:llm-payload-guard` — rule 2 walks `app/`, `lib/` and `components/`. Phase 1 ships the whole
  `GUARDED_CALLS` table (RULING D1), so `ChatScreen.tsx` calling `sendNinaMessage` must be inside
  the sanctioned callers via `lib/nina/actions.ts`, and `app/nina/page.tsx` must call nothing
  model-shaped at all.
- `npm test`'s `tests/auth.proxy.matcher.test.ts` must pass **unchanged**. It is the proof that
  Step 11b really was comment-only: if that test's expected array needed editing, the edit was not
  a comment.
- `ci:f08-guard` — rule 3 fails on an interpolated value followed by `km`/`kcal`/`bpm`/`spm` and on
  any `Intl.NumberFormat` outside `lib/format.ts`. This phase renders no measurement and formats no
  number itself; the guard proves it.
- `ci:client-secret-guard` — RULE 3 fails unconditionally on `NEXT_PUBLIC_`. Nothing here reads an
  environment variable, and the avatar path is a literal.
- `ci:data-layer-guard` — this phase writes no SQL and imports `lib/db` nowhere; it reads through
  phase 1's `lib/nina/queries.ts`.

**Manual check** (`npm run dev`, iPhone-width viewport):

1. **The `+` is centred.** With the bar rendered, the FAB's centre and the viewport's centre must
   coincide. Measure it rather than eyeball it: in the console,
   `const b = document.querySelector('[aria-label="Upload a run"]').getBoundingClientRect(); b.left + b.width / 2 - innerWidth / 2`
   must be `0` (or within a rounding pixel). Run it on `/`, not just `/nina` — the bar is shared.
2. **The FAB is not clipped on `/nina`.** The coral circle's top 20px sits in the gap between the
   composer and the tab bar and must be fully visible.
3. **The stagger is visible.** Send a message that provokes several bubbles. They must arrive one
   at a time with the dots between them, and the whole reveal must feel like roughly a second or
   two on top of the turn, not five.
4. **Scrolled-up reading is not interrupted.** Send a message, scroll up two screens while she
   thinks, and confirm the page does not jump when her bubbles land.
5. **The keyboard does not eat the composer.** Focus the textarea on a real iPhone (or Safari's
   responsive-design mode with the keyboard simulated); the composer must sit on the keyboard's top
   edge, not behind it.
6. **Reduced motion.** Enable it and confirm the auto-scroll jumps rather than glides, and that the
   typing dots hold still (the second is free, via `app/globals.css`).
7. **Dark mode.** Both bubble fills invert: his goes near-white with dark text, hers near-navy with
   light text, and they stay opposites.

**Exit criteria:**

- The bottom bar has five cells in the order Runs / Nina / `+` / Trends / Me, and the FAB's centre
  is at the viewport's centre to within a pixel.
- `/nina` renders the stored conversation without awaiting a model call, and the runner can send a
  message and watch one to four bubbles arrive one at a time behind a typing indicator.
- `lib/nina/reveal.ts` and `lib/nina/chatview.ts` are pure, are tested by co-located
  `*.test.ts` files, and **no test in this phase renders a component or touches a DOM API.**
- `npm run typecheck && npm run lint && npm test` and every `ci:*` guard pass.

## Handoffs

Work found and deliberately left, with its owner:

- **`ROADMAP_v0.1.0.md` §4.8 still says four tabs**, its table has no `/nina` row and its route
  list has no `/nina` line — and **this is settled in this phase's favour (RULING D2): phase 1 owns
  every roadmap amendment this cycle** (RU-2, RU-3, D12), including the four-tab → five-tab
  sentence, the §4.8 table's Nina row between Runs and Upload, and the route list. Phase 1's
  counter-recommendation — that the phase which changes the bar should change the doc — is
  overruled for the reason this phase filed: phase 1 already edits that very file, and a second
  writer is a merge conflict for nothing. Nothing to do here except supply the sentence, which
  phase 1 is to use verbatim in that amendment: *the FAB sat at 37.5% in a four-column grid and is
  at 50% in a five-column one, so §4.8's own "centre" claim is newly true rather than newly
  written.*
- **Phase 10 makes two small edits inside this phase's files, and both are expected.** Naming them
  here so neither reads as a surprise when the diff lands:
  1. `components/ui/TabBar.tsx` — `Tab` gains `badge?: React.ReactNode` and a positioned dot, and
     `TabBar` gains a `ninaBadge` prop (`TabBar({ ninaBadge })`) to feed it. Not added here,
     because an unused prop is API nobody has argued for yet; the seam is the `TABS` entry and the
     `Tab` call it renders.
  2. `app/nina/page.tsx` — `after(() => markNinaMessagesRead(userId))`, so opening the screen is
     what clears the dot. `after()` is the right place: it is a write that must not delay the
     paint, and a page render is a request scope — which is the whole constraint, since `after()`
     throws E468 anywhere else (the reason phase 10's other hook stays in `lib/review/actions.ts`).
- **Nina's avatar becoming a link, and coming from the album (Phase 13).** `NinaAvatar` takes only
  `size` and `className` and reads `NINA_AVATAR_SRC`, and **it keeps that constant exactly as
  written here** — nothing else exists at its landing (RULING A5). Two things happen in phase 13,
  and both are designed so this phase's two call sites compile untouched:
  1. `NINA_AVATAR_SRC` becomes a **re-export of `NINA_AVATAR_FALLBACK_SRC` from
     `lib/nina/album.ts`**, not a deletion. Every phase-4 import keeps compiling, and
     `'/nina/avatar-001.png'` ends up spelled once in the whole repo. Phase 15's `CircleFrame`
     imports the same constant rather than declaring a third copy.
  2. `NinaAvatar`'s props widen **additively** to `{ size, src, natural, crop, className }` — all
     four new props optional with defaults — and the `<span>` is wrapped in a
     `<Link href="/nina/about">`. `<NinaAvatar size="md" />` and `<NinaAvatar size="sm" />` here
     are unchanged by that. Because `size="md"` is already `size-11`, the tap target is already at
     the iOS floor when the link appears.
- **The bubble's `above` slot carries two inset kinds, not three (RULING E2).** This phase's note
  that "all three inset kinds go there" is corrected: the **quote does not**. Phase 7 gives the
  reply quote its own `quote` prop on `MessageBubble` precisely so the two do not compete for one
  slot, and `MessageBubble` renders `quote` **above** `above`. So `above` carries **the images
  (phase 6) then the run card (phase 8)**, composed by `MessageList`, and the render order inside
  the bubble is **quote stub → images → run card → text** — what he is answering, then what he is
  handing over, then what he said. The final composition, pasted here so phases 6, 7 and 8 all read
  one version of it:

  ```tsx
  <MessageBubble
    message={m}
    quote={resolveQuote(m, index)}          // phase 7 — its own prop, rendered ABOVE `above`
    above={
      m.imageUrls?.length || m.attachment != null ? (
        <div className="space-y-2">
          {m.imageUrls?.length ? <ChatImages urls={m.imageUrls} /> : null}   {/* phase 6 */}
          {m.attachment != null ? <RunAttachmentCard attachment={m.attachment} /> : null}  {/* phase 8 */}
        </div>
      ) : undefined
    }
  />
  ```

  Phase 6 ships the images-only branch; phase 8 widens it to the two-branch stack and adopts this
  expression verbatim. **Each inset block owns its own bottom margin** — the stack does not space
  its children from outside, because which blocks are present varies per message.
- **The inset fill inside a bubble is `bg-ink-3/20`, and it is binding on phases 6, 7, 8 and 13
  (RULING E1).** This phase flagged that `InsightCard`'s `rounded-field bg-paper-2 p-3.5` inverts
  inside a `bg-ink` bubble — near-white inset on ink in light mode, near-navy inset on near-white in
  dark — and the flag was right. The answer is verified rather than argued: `app/globals.css` sets
  `--ink-3` to `#93a2b0` in light and `#7c8d9b` in dark, a mid-grey in **both** schemes, so
  `bg-ink-3/20` works on both sides with no per-side branch, no `data-[role=…]` fallback and no
  variant plumbing. `bg-current/10` (phase 8's proposal) loses on evidence rather than taste: phase
  8's own plan admits its arbitrary-opacity support is unverified in this Tailwind setup, and an
  unverified mechanism must not be the shared answer for four phases. The pattern to follow is
  therefore `rounded-field bg-ink-3/20 p-3.5`, and `MessageBubble`'s `above` docstring says so.
- **The composer's icon-button seam (Phase 6).** The row is `flex items-end gap-2`; an image picker
  goes left of the textarea at `size-11`.
- **`ChatMessage` is the type to widen, not to replace** (Phases 6, 7, 8) — and the three fields
  this phase guessed at are all corrected by ruling, so take these spellings and not the earlier
  ones:
  - **Phase 6** adds `imageUrls?: readonly string[]` — **plural** (RULING E2b). Phase 6 owns the
    field and argued it: a message carries up to `NINA_MAX_CHAT_IMAGES`, so a singular `imageUrl`
    would be wrong on the second image. The `imageUrl` named in this phase's original note is
    withdrawn.
  - **Phase 7** adds `replyToId: string | null` — **required, not optional**, because every message
    either answers one or does not and `undefined` would be a third state nobody renders. Not
    `replyTo`: the field holds an id, and phase 7 resolves it against the messages already in the
    list.
  - **Phase 8** adds `attachment?: RunAttachment | null` — a display-ready object, which
    **supersedes** the `runId` this phase suggested. The reason is where the formatting lives: the
    card needs formatted distance, pace and date strings, and `lib/format.ts` owns every rendered
    string (invariant 3), so the server hands over finished strings rather than an id the client
    would have to resolve and format.

  `app/nina/page.tsx`'s mapper stays the one place that turns a row into a `ChatMessage`, so all
  three widenings land in one function.
- **Proactive messages arriving while `/nina` is open — the live path is Phase 11's, not Phase
  10's.** `ChatScreen` deliberately does not `router.refresh()`, so a message written by cron or by
  `after()` appears on the next load; phase 10 writes those messages and is content with that.
  **Phase 11 is the phase that makes them arrive live**, and it does it inside `ChatScreen` with
  two `useEffect`s and a `useRouter()`. One of those is **the `useEffect` on `initial` that this
  phase flagged as missing** — the flag stands, and phase 11 owns it: re-seeding `messages` from a
  changed `initial` prop is the only way a server-pushed row reaches a client list that has already
  mounted. Named here so the two-line-looking diff is understood as the intended seam rather than a
  gap.
- **Phase 12 adds one `await` to `app/nina/page.tsx`.** Its sweep side effect joins this page's
  read: the lone `listNinaMessages` await above becomes a `Promise.all` of two, so the sweep costs
  no extra round trip in wall-clock terms. The page's "one read, no model call" property survives,
  because a sweep is a query and not a turn — which is the property `ci:llm-payload-guard` checks.
- **`components/nina/MessageBubble.tsx` becomes a client module in Phase 7, and that is fine
  (RULING E8).** This phase's earlier claim — that the file is left directive-free "so phase 13's
  album page can render a bubble on the server if it wants one" — is **deleted**, because it is
  false: phase 7 owns a touch gesture on the quote stub and therefore adds `'use client'`. Every
  other consumer was checked. Phase 6 does not edit the file and reaches it through `MessageList`;
  phase 8 fills `above` from `MessageList`; phase 11 states explicitly that it does not touch the
  file; and phase 13 confirms it needs no server-rendered bubble, because attaching an album photo
  writes a real row and the page navigates to `/nina`, where the existing renderer draws it. So no
  `BubbleShell` split is needed, and the directive is recorded in the file's own docstring rather
  than discovered by watching a build fail.
- **`export const maxDuration = 60` on `app/nina/page.tsx` is this phase's, and it is not
  optional** (RULING C7, Step 11). Phase 3's handoff asking for it becomes a record that it landed
  here; phase 6 and phase 12, whose turns are longer than the plain chat turn, both depend on the
  line already being present.
- **No `app/nina/loading.tsx`.** Deliberate: `loading.tsx` wraps its segment *and every segment
  below it*, and `app/(app)/loading.tsx`'s docstring records what that cost — a soft 404 on every
  dynamic route under it, because a streamed response cannot change its status code. Phase 13 adds
  `/nina/about` under this segment. If a skeleton is wanted, it belongs in a route group, and that
  is phase 13's call to make once it knows what its own page needs.
- **Per-message timestamps** are a deliberate non-goal, not an oversight. If they are ever wanted,
  the prerequisite is a `formatTimeOfDay(instant, timeZone)` in `lib/format.ts` (invariant 3) and
  server-side formatting to avoid a hydration mismatch.
- **Markdown in a bubble** is not supported and should not be added casually: this app has no
  markdown renderer anywhere, and phase 2's system prompt is the right place to tell her to write
  plain text rather than the bubble's place to start parsing it.

## Rollback

Every file in this phase is either new or additive, so reverting the phase's commit is sufficient
and leaves nothing behind:

- `lib/nina/reveal.ts`, `lib/nina/chatview.ts`, their tests, `components/nina/*` and
  `app/nina/page.tsx` are new files with no importers outside the phase. Deleting them removes the
  route and nothing else.
- `components/ui/TabBar.tsx` reverts to `grid-cols-4` with four children. The two exported
  constants disappear with their only consumer.
- `components/ui/AppShell.tsx` reverts to two props. Because `bottomGap` has a default, no other
  call site ever passed it, so no other file needs touching.
- `proxy.ts` reverts a comment. There is nothing to undo behaviourally, and
  `tests/auth.proxy.matcher.test.ts` passes before, during and after — which is the whole point of
  the ruling that put a sentence there instead of a matcher line.

There is no migration, no stored state and no deployed artefact — the one thing this phase adds to
production is a route, and a route stops existing when its file does. The single external
dependency is `public/nina/avatar-001.png`, which is phase 1's and stays.
