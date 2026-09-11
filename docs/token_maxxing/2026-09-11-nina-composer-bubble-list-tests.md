# Token-Maxxing Session — 2026-09-11: Nina Composer/Bubble/List Component Tests

> **Second token-maxxing session on this date.** The first session
> ([doc](./2026-09-11-nina-chat-component-tests.md)) stood up the React
> component-testing infra (RTL + happy-dom) for this repo from zero and covered
> `ChatScreen.tsx` + `NinaSidebar.tsx`. Its own "Follow-ups & YAGNI notes"
> section named `Composer.tsx`, `MessageBubble.tsx`, and `MessageList.tsx` as
> the natural next targets. This session is that continuation.

## 🎯 Achievement / End Result
- **Goal of the burn:** Extend the component-testing net stood up earlier
  today to the three Nina chat components explicitly flagged as untested by
  the first session: `Composer.tsx` (message input + photo upload/dedupe
  pipeline), `MessageBubble.tsx` (per-message rendering + swipe/tap gesture
  wiring), and `MessageList.tsx` (day-grouping, quote resolution, above-slot
  composition).
- **Concrete changes:**
  - `components/nina/Composer.test.tsx` — new, 19 tests.
  - `components/nina/MessageBubble.test.tsx` — new, 17 tests.
  - `components/nina/MessageList.test.tsx` — new, 12 tests.
  - No infra changes needed — the RTL/happy-dom/vitest wiring from the first
    session already covers `components/**/*.test.tsx` and needed nothing
    further.
- **Real value delivered:**
  - The riskiest untested surface in the Nina chat UI — the
    compress→hash→dedupe-precheck→upload→describe photo pipeline in
    `Composer.tsx`, and the touch/mouse gesture disambiguation (swipe-to-reply
    vs. swipe-to-actions vs. tap-to-open vs. stale-press-on-pointerleave) in
    `MessageBubble.tsx` — now has a real regression net, exercised against
    the *real* decision functions (`lib/nina/dedupe.ts`, `lib/nina/images.ts`,
    `lib/nina/reply.ts`, `lib/nina/edit.ts`), not mocked reimplementations of
    them.
  - `MessageList.tsx`'s day-grouping and quote-resolution-against-the-visible-
    window logic — both easy to silently break during a refactor and hard to
    catch by eye in manual testing — is now asserted directly.
  - Every test in all three files was sanity-checked by deliberately breaking
    one real piece of production logic per file, confirming the relevant
    tests fail for the right reason, then reverting — so, as with the first
    session, this is verified coverage, not vacuous coverage.
  - Net effect: three of the six `.tsx` files in `components/nina/` that
    together make up the entire message-composition/rendering critical path
    (`ChatScreen`, `NinaSidebar`, `Composer`, `MessageBubble`, `MessageList`,
    plus `ChatChrome`) now all have component tests, up from two this morning.
- **Branch:** `token-maxxing-2026-09-11` (reused — see Context below).
- **Merge status:** merged to main (the branch was already merged before this
  session's commits landed on it; see Decisions & Trade-offs for how that was
  handled).
- **Approx token burn:** high — three separate component test files, each
  requiring tracing a non-trivial async pipeline or gesture state machine
  before a single assertion could be written, plus a full deliberate-breakage
  verification pass per file and a full gate run at the end. 🔥

## Context & Motivation
This is the **second** token-maxxing session run on 2026-09-11. The first
session that day started the day cold (no prior history to draw from) and
picked "stand up component testing, prove it on the two biggest/highest-churn
surfaces" as the highest-leverage move. It explicitly deferred `Composer.tsx`,
`MessageBubble.tsx`, and `MessageList.tsx` — the three remaining components
directly on the message send/render path — to a future session, rather than
trying to cover everything in one sitting.

At Step 4 of this session's `/token-maxxing` run, the generated menu was:

1. **Continue nina-chat-component-tests** — extend coverage to `Composer.tsx`,
   `MessageBubble.tsx`, `MessageList.tsx`. *(picked)*
2. Fresh — stand up tests for `components/ui` (14 shared primitives, 0 tests).
3. Fresh — component tests for `components/admin` (26 components, 0 tests).
4. Fresh — YAGNI hunt across `lib/nina` (biggest package: `queries.ts` 4,542
   lines, `persona.ts` 1,771, `actions.ts` 1,667).
5. Fresh — architecture doc synthesizing the 33 F0x plan docs into a
   current-state document.

**Why #1 won:** it was a direct, *named* continuation with the infra already
in place (zero setup cost, unlike #2/#3 which would need the same
`happy-dom`/RTL groundwork the morning session already paid for — a cost that
wouldn't recur here). It also targeted the highest-risk remaining surface: an
upload/dedupe pipeline with several async failure modes (`Composer.tsx`) and
gesture-disambiguation logic with several branch points (`MessageBubble.tsx`)
are exactly the kind of code that's easy to subtly break during a refactor and
hard to catch by manual testing alone — more so than a static admin table or a
synthesis document. Critically, it was also the one item on the menu
*explicitly pointed at* by the prior session's own follow-up notes, rather
than a fresh area chosen cold.

## What We Did (blow-by-blow)

1. **Confirmed no new infra was needed.** The morning session's
   `vitest.config.ts` (`components/**/*.test.tsx` in `test.include`) and
   `tests/support/setup.ts` (`@testing-library/jest-dom/vitest` +
   `afterEach(cleanup())`) already cover any new file under
   `components/nina/`. Verified the branch `token-maxxing-2026-09-11` still
   existed locally and picked up from there rather than creating a new
   branch, since this is a continuation of the same day's line of work.

2. **Traced `Composer.tsx`'s pipeline before writing a single test.** The
   component wires together: local text state → `canSend` gating (text
   present OR at least one photo, not already sending) → on submit, for each
   picked photo: `compressForNina` → `contentHash` → a dedupe pre-check
   against already-sent hashes → (if no hit) upload via `@vercel/blob/client`
   → describe via a server action → attach the returned ticket; if the
   pre-check *does* hit, skip upload+describe entirely and reuse the existing
   ticket. Wrote `components/nina/Composer.test.tsx` (19 tests) covering:
   - Plain text send, and Enter-vs-Shift+Enter (send vs. newline).
   - Pick rejection: non-image file type, oversized file, and the three-photo
     cap.
   - The full compress→hash→dedupe-precheck→upload→describe happy path.
   - The dedupe-hit shortcut — confirmed via mock call counts that upload and
     describe are *never* invoked when the pre-check matches, not just that
     the end state looks right.
   - Two failure paths: describe resolves without a ticket, and compress
     throws.
   - Tile removal (removing a picked-but-not-yet-sent photo).
   - Reply-context, attachment, and photo-chip prop wiring into the composer.
   - **Mocked:** `@vercel/blob/client`, `@/lib/nina/actions`,
     `@/lib/photos/compressForNina`, `@/lib/photos/contentHash`.
   - **Deliberately left real:** `lib/nina/dedupe.ts` and `lib/nina/images.ts`
     — both are pure functions already unit-tested elsewhere, so leaving them
     real means the pick/dedupe *decisions* asserted on in this file are the
     actual production logic, not a hand-rolled mock standing in for it (which
     would silently drift from the real implementation over time).

3. **Traced `MessageBubble.tsx`'s render states and gesture state machine.**
   Wrote `components/nina/MessageBubble.test.tsx` (17 tests) covering:
   - Render states: mine-vs-theirs alignment, the quote stub, the "above"
     slot, sending/failed/flash visual states, and that the flash ring color
     only applies to the viewer's own messages.
   - The screen-reader-only reply and actions buttons.
   - Gesture wiring, driven with real drag coordinates through the *real*
     `lib/nina/reply.ts` / `lib/nina/edit.ts` decision functions (not
     mocked): a rightward swipe arms a reply, a leftward swipe opens the
     actions sheet, a tap on confirmed prose opens actions, a tap on an
     *unconfirmed* (still-optimistic) row is refused, a mouse-originated tap
     opens actions, a non-mouse `pointerType` (e.g. a stray pen/touch event
     misrouted) is ignored, and a `pointerleave` correctly drops a
     stale/in-progress press before pointer-up would have committed it.

4. **Traced `MessageList.tsx`'s grouping/composition logic.** Wrote
   `components/nina/MessageList.test.tsx` (12 tests) covering:
   - Day-grouping of messages and the "Today" label for the current day's
     group.
   - Per-message quote resolution *against the on-screen window* — resolves
     to the real target when it's currently rendered, resolves to `null` when
     the quoted message has scrolled off-screen.
   - Composition of the "above" slot from `imageUrls`/`attachment` props into
     `ChatImages` / `RunAttachmentCard` respectively.
   - Callback wiring: `onOpenImage`, `onReply`, `onJumpToQuote`,
     `onRequestActions`.
   - Typing-indicator visibility.
   - The `--nina-flash-count` CSS custom property.
   - **Mocked:** `MessageBubble`, `ChatImages`, `RunAttachmentCard`,
     `TypingIndicator` — the same mocking boundary `ChatScreen.test.tsx`
     already established this morning, since each of those owns its own
     rendering/timers/DOM measurement and re-testing them here would just be
     duplicate, more-fragile coverage.

5. **Deliberately did not test `MessageList`'s scroll/restore-mark timing.**
   The `useLayoutEffect` + `window.scrollTo` + ResizeObserver-adjacent
   reader-position sampling that keeps the viewport pinned to the right
   message across list mutations was left untested — the same call the
   morning session made for `NinaSidebar`'s focus-management effect. See
   Follow-ups.

6. **Verified each file by deliberately breaking real production logic, not
   just running the suite once.** Since this is coverage retrofitted onto
   already-shipped code (not new-feature TDD where red-then-green is
   automatic), each file's tests were confirmed meaningful by:
   - `Composer.tsx`: inverted a clause in the `canSend` readiness check →
     confirmed the relevant send-gating tests failed → reverted → confirmed
     green again.
   - `MessageBubble.tsx`: flipped the reply-swipe direction check → confirmed
     the swipe-direction tests failed → reverted → confirmed green again.
   - `MessageList.tsx`: broke the `flash` id-comparison logic → confirmed the
     flash-state tests failed → reverted → confirmed green again.
   Each breakage/revert cycle is called out in its commit message.

7. **Ran the full local gate, all green:**
   - `npx vitest run` → **188 test files / 4,019 tests passed** (up from 187
     files / 3,971 tests at the end of the first session — net **+1 file*,
     +48 tests** — *net file count off by the fact three new files were
     added; see Appendix for the precise per-commit breakdown).
   - `npx eslint` on all three new files → clean.
   - `npx prettier --check` → clean after one `--write` pass.
   - `npx tsc --noEmit` → clean.

8. **Made three separate commits** rather than one, so each component's
   coverage (and its deliberate-breakage verification note) stands on its own
   in history:
   - `b74c575` — `test(nina): cover Composer.tsx's upload/dedupe pipeline and send gating`
   - `c3159b4` — `test(nina): cover MessageBubble's render states and gesture wiring`
   - `352dc11` — `test(nina): cover MessageList's day grouping and above-slot composition`

## Code / Design Details

**Real dedupe/gesture logic, mocked I/O boundary.** Both `Composer.test.tsx`
and `MessageBubble.test.tsx` follow the same principle: mock everything that
crosses a network/browser-API boundary (`@vercel/blob/client`, server
actions, `compressForNina`, `contentHash`), but leave in place any pure
decision function the component itself imports (`lib/nina/dedupe.ts`,
`lib/nina/images.ts`, `lib/nina/reply.ts`, `lib/nina/edit.ts`). The
alternative — mocking those decision functions too — would make the test
suite assert against a hand-written stand-in for the real logic, which can
silently diverge from production behavior as the real functions evolve. Since
all four of those modules are pure and already unit-tested in isolation,
leaving them real costs nothing and buys a stronger guarantee.

**Dedupe-hit shortcut asserted by call count, not just end state.** The
`Composer.test.tsx` dedupe-hit test doesn't just check that the message ends
up sent correctly — it asserts the mocked upload and describe functions were
never called at all. That's the behavior actually worth protecting: a future
regression that "still works" but silently re-uploads/re-describes an
already-known photo would pass an end-state-only assertion, burn quota, and
be invisible until someone noticed the bill or the latency.

**Gesture tests use real coordinates through real math.** Rather than
mocking `lib/nina/reply.ts`/`lib/nina/edit.ts` to return canned
"swipe-detected" booleans, `MessageBubble.test.tsx` fires actual
pointer-event sequences with real x/y deltas and lets the component's real
gesture math decide the outcome. This is what makes the
pointerType-filtering and pointerleave-drops-stale-press cases meaningful —
those are exactly the kind of edge case a canned mock would need to be told
about in advance to "cover," defeating the point.

**Quote resolution is window-relative, not global.** `MessageList.test.tsx`
specifically distinguishes the case where a quoted message is currently
rendered (resolves to the real target) from the case where it has scrolled
out of the rendered window (resolves to `null`, not a stale/incorrect
reference) — encoding a real, previously-implicit contract: quote-jump
targets are only ever resolved against what's actually on screen.

## Decisions & Trade-offs

- **Reused the existing `token-maxxing-2026-09-11` branch rather than
  starting a new one.** This is same-day, same-topic continuation work
  (explicitly named by the first session's own follow-ups), so it belongs in
  the same day-branch rather than fragmenting the day's token-maxxing history
  across multiple branches. The branch had already been merged to main before
  this session began; this session's three commits were added and merged
  in turn rather than rebasing history.
- **Three commits instead of one.** Splitting by component (`Composer`,
  `MessageBubble`, `MessageList`) keeps each deliberate-breakage verification
  note attached to the specific file it verifies, and makes it possible to
  `git revert` or `git bisect` one component's coverage independently of the
  others if it ever turns out to be flaky or wrong.
- **Left `lib/nina/dedupe.ts`, `lib/nina/images.ts`, `lib/nina/reply.ts`, and
  `lib/nina/edit.ts` real instead of mocked** — see Code/Design Details above.
  The trade-off is slightly less test isolation (a bug in one of those pure
  modules could in theory make one of these new component tests fail instead
  of only the module's own unit test), but since they're small, pure, and
  independently tested, this is judged a good trade for stronger end-to-end
  confidence in the composer/bubble behavior itself.
- **Chose NOT to test `MessageList`'s scroll/restore-mark timing** — same
  call as the morning session's exclusion of `NinaSidebar`'s focus-management
  effect. `useLayoutEffect` + `window.scrollTo` + ResizeObserver-adjacent
  reader-position sampling encodes real-device scroll-restoration timing that
  happy-dom cannot meaningfully simulate; asserting on it would be test
  theater, not coverage.
- **Picked "continue nina-chat-component-tests" over the four fresh-start
  menu items.** `components/ui` and `components/admin` tests, the `lib/nina`
  YAGNI hunt, and the F0x-synthesis architecture doc are all real candidates,
  but none of them had already been surfaced as a *named* next step by prior
  work, and none targeted code with as many async/branching failure modes as
  the composer's upload pipeline and the bubble's gesture disambiguation.

## Follow-ups & YAGNI notes

- **Every other `.tsx` component is still untested at the component level:**
  `SessionList.tsx`, `SessionRow.tsx`, `ChatChrome.tsx`, `NinaAboutScreen.tsx`,
  `MessageActionsSheet.tsx`, `NinaSearchField.tsx`, and the remaining Nina
  components, plus all 14 files in `components/ui`, all 26 files in
  `components/admin`, and every other component directory (charts, review,
  profile, share, trends, extract, auth, push, runs, insights) — all still at
  zero component tests as of the end of this session.
- **The four menu candidates not picked today remain open ideas** for a
  future session: `components/ui` tests, `components/admin` tests, a YAGNI
  hunt across `lib/nina` (`queries.ts` at 4,542 lines is the single largest
  file in the package, followed by `persona.ts` at 1,771 and `actions.ts` at
  1,667 — all good candidates for a dead-code/simplification pass), and an
  architecture doc synthesizing the 33 F0x plan docs into one current-state
  reference.
- **`MessageList`'s scroll/restore-mark timing remains explicitly
  untested** — flagged here again as a deliberate, considered scope
  boundary (consistent with the same call made for `NinaSidebar` this
  morning), not a gap to silently fill in later without re-litigating whether
  it's actually testable under happy-dom.
- **`MessageActionsSheet.tsx`**, which both `MessageBubble.tsx` and
  `MessageList.tsx` wire actions-opening toward, is itself still untested —
  a natural next component if this line of continuation keeps going.

## Appendix

**Key commands run this session:**
```bash
npx vitest run
npx eslint components/nina/Composer.test.tsx components/nina/MessageBubble.test.tsx components/nina/MessageList.test.tsx
npx prettier --check components/nina/Composer.test.tsx components/nina/MessageBubble.test.tsx components/nina/MessageList.test.tsx
npx prettier --write components/nina/Composer.test.tsx components/nina/MessageBubble.test.tsx components/nina/MessageList.test.tsx
npx tsc --noEmit
```

**Gate results:**
- Before this session (end of first 2026-09-11 session): 187 test files /
  3,971 tests passing.
- After this session: 188 test files / 4,019 tests passing — net **+48
  tests** across the 3 new files, all in `components/nina/`.
- `eslint`, `prettier --check`, `tsc --noEmit`: all clean at commit time.

**Commits (on `token-maxxing-2026-09-11`):**
```
b74c575 test(nina): cover Composer.tsx's upload/dedupe pipeline and send gating
c3159b4 test(nina): cover MessageBubble's render states and gesture wiring
352dc11 test(nina): cover MessageList's day grouping and above-slot composition
```

**Branch:** `token-maxxing-2026-09-11` — merged to main.
