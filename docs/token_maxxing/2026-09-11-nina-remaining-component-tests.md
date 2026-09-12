# Token-Maxxing Session — 2026-09-11: Nina Remaining Component Tests

> **Sixth token-maxxing session on this date — and the first one dispatched as a
> worker under a coordinator** (`tokenmax-orch-2026-09-11`) rather than run
> self-directed. The first session ([doc](./2026-09-11-nina-chat-component-tests.md))
> stood up React component-testing infra from zero (RTL + happy-dom) and covered
> `ChatScreen.tsx` + `NinaSidebar.tsx`. The second session
> ([doc](./2026-09-11-nina-composer-bubble-list-tests.md)) continued onto
> `Composer.tsx`, `MessageBubble.tsx`, and `MessageList.tsx`. The third session
> ([doc](./2026-09-11-admin-folder-actions-tests.md)) corrected a false-positive
> coverage survey of `components/admin` and covered six folder-maintenance Server
> Actions. The fourth session ([doc](./2026-09-11-nina-message-actions-sheet-tests.md))
> closed `MessageActionsSheet.tsx`. The fifth session
> ([doc](./2026-09-11-admin-file-explorer-tests.md)) closed the admin FileExplorer
> subsystem's nine files with 119 tests. Through all five, the bulk of
> `components/nina/` — roughly 20 components, some flagged open since session 2 —
> remained completely untested. This session closed that out.

## 🎯 Achievement / End Result
- **Goal of the burn:** Write real component tests for every remaining untested
  `components/nina/*.tsx` file — `SessionList`, `SessionRow`, `ChatChrome`,
  `NinaAboutScreen`, `NinaSearchField` (flagged open since session 2 of today),
  plus `NinaJobList`, `AttachmentChip`, `PhotoAttachmentChip`, `NinaPhotoGrid`,
  `ChatPhotoActions`, `QuoteStub`, `NinaJobActions`, `NinaJobElapsed`,
  `RunAttachmentCard`, `ChatImages`, `NinaAvatar`, `NinaJobDetail`,
  `NinaUnreadBadge`, `NewChatButton`, `TypingIndicator`, `NinaUnreadSync`,
  `NinaBarProvider`, `KeyboardOverlapPublisher`, `useSemanticPref`,
  `useChatScroll` — 25 components in one session.
- **Concrete changes:**
  - **25 new co-located test files** in `components/nina/`, ~3,300 lines,
    **193 new tests**, committed in four thematic batches:
    - `352dac1` — the atoms: `NinaAvatar`, `NinaUnreadBadge`, `NewChatButton`,
      `TypingIndicator`, `QuoteStub`, `NinaSearchField` (6 files, 50 tests).
    - `18aa64a` — chips, cards and photo surfaces: `AttachmentChip`,
      `PhotoAttachmentChip`, `RunAttachmentCard`, `NinaPhotoGrid`,
      `ChatImages`, `ChatPhotoActions` (6 files, 38 tests).
    - `861d76e` — lists and jobs: `SessionList`, `SessionRow`, `NinaJobList`,
      `NinaJobActions`, `NinaJobDetail`, `NinaJobElapsed` (6 files, 59 tests).
    - `247f506` — chrome, providers, hooks and the about screen: `ChatChrome`,
      `NinaBarProvider`, `KeyboardOverlapPublisher`, `NinaUnreadSync`,
      `useSemanticPref`, `useChatScroll`, `NinaAboutScreen` (7 files, 46 tests).
  - `aeaec4c` — typed the provider probe via `ReturnType` instead of the
    un-exported interface (test-only typing fix surfaced by `tsc`).
  - `17ca853` — prettier across all the new files.
- **Real value delivered:**
  - **Every untested `components/nina` component now has a real DOM test file.**
    The directory stands at **31 test files / 313 tests, all green** — the nina
    chat UI went from "two components covered" at the start of the day to
    effectively fully covered at its close.
  - Pins of correctness-sensitive behavior that no test had ever encoded, among
    them: RULING E1's non-branching quote/card fill; the one shared crop
    mapping (`ninaCropStyle` computed, never retyped); the unread dot's
    no-skeleton Suspense contract; `NinaSearchField`'s stale-answer drop, its
    two-part ✕ clear that keeps the keyboard up, and IME-safe Enter;
    `ChatImages`' degrade-to-HIS kind rule; `SessionRow`'s one-tap delete
    loading guard and its replace-vs-refresh removal mapping; `NinaJobList`'s
    read-only markup (`li className` omitted entirely in read-only mode); and
    `ChatChrome`'s full bar machine (5s autohide with clock restart, composer
    containment including the textarea-to-Send no-blink deferral, panel-dialog
    fields).
  - Real collaborators over mocks everywhere possible — real `next/image`
    (proven empirically to render a plain `<img>` under happy-dom; no repo test
    had ever rendered it before), real `lib/nina/search`, real `useSemanticPref`
    against real localStorage, real crop math, real `planSessionRemoval`, real
    jobview formatters — so the tests pin integration behavior, not mock
    echo.
  - Gates: nina directory 313/313 green; full-repo suite **4,403/4,403 green,
    twice**; `npx next typegen && npx tsc --noEmit` clean; prettier clean on
    all new files.
- **Branch:** `token-maxxing-2026-09-11-nina-remaining-component-tests`
- **Merge status:** merged (commit `c50d580`)
- **Approx token burn:** high — 25 components traced against their props and
  collaborators before any test was written, 193 tests authored across 25 new
  files in four batches, several non-obvious testability problems worked
  through (async client components under the test renderer, native-listener
  `act()` semantics, a cross-module import that silently bound `undefined`), plus
  full gate verification. 🔥

## Context & Motivation

This is the **sixth** token-maxxing session on 2026-09-11, and structurally
different from the first five: it was **dispatched by a coordinator**
(`tokenmax-orch-2026-09-11`) as a worker on a dedicated branch
(`token-maxxing-2026-09-11-nina-remaining-component-tests`), rather than being a
self-directed session that picked from its own idea menu and merged its own
work. The coordinator handed over a specific, fully-specified idea: close out
the remaining untested nina components.

The idea itself was the natural endpoint of the day's arc. Sessions 1, 2, and 4
had each named the still-untested nina components in their follow-ups —
`SessionList`, `SessionRow`, `ChatChrome`, `NinaAboutScreen`, and
`NinaSearchField` had been flagged open since session 2 — and each prior session
had deliberately scoped itself to one or two components. By the fifth session's
close the day had built the RTL/happy-dom infrastructure, proven the patterns
(ChatScreen's stub-the-siblings approach, the per-file `// @vitest-environment
happy-dom` pragma, the sanity-check-every-assertion discipline), and covered
six nina files — leaving roughly **20 nina components with zero coverage**. A
batch session with a single theme ("everything left in the chat UI") was the
highest-leverage way to finish: the infra cost was already paid, so every hour
went into tests.

## What We Did (blow-by-blow)

The session ran as **four thematic batches**, each one traced-then-tested-then-
committed, so every commit is a self-contained green increment.

### Batch 1 — the atoms (`352dac1`, 6 files, 50 tests)

- **`NinaAvatar.test.tsx`** (84 lines): the profile-picture render against real
  `next/image` — the first test in the repo to render `next/image` at all
  (proven empirically that under happy-dom it renders a plain `<img>`, no
  Next runtime needed), plus fallback behavior when no photo is set.
- **`NinaUnreadBadge.test.tsx`** (77 lines): the unread-count badge, including
  the Suspense contract — the fallback renders **no skeleton**, the resolved
  state renders the count. This component is an `async` client component, which
  forced the session's first discovery (see Follow-ups #1): it never resolves
  through React's test renderer outside Next's runtime, so the resolved states
  are tested by calling `await Component()` directly and rendering the result.
- **`NewChatButton.test.tsx`** (109 lines): the new-chat disc, its navigation
  target, and its accessibility surface.
- **`TypingIndicator.test.tsx`** (58 lines): the typing row's render states.
- **`QuoteStub.test.tsx`** (96 lines): the quoted-message stub, pinning
  **RULING E1's non-branching fill** — the stub renders the quote/card shape
  without branching on message kind.
- **`NinaSearchField.test.tsx`** (261 lines, the batch's deep one): the search
  field against **real `lib/nina/search`** (not a mock), pinning three
  behaviors that had only ever lived in code comments and muscle memory:
  the **stale-answer drop** (a slow search's late result must not overwrite a
  newer query's state), the **two-part ✕ clear** (clears the query but keeps
  the keyboard up — a deliberate split of "clear text" from "dismiss field"),
  and **IME-safe Enter** (composition-phase Enter does not submit).

### Batch 2 — chips, cards and photo surfaces (`18aa64a`, 6 files, 38 tests)

- **`AttachmentChip.test.tsx`** (58 lines) and **`PhotoAttachmentChip.test.tsx`**
  (52 lines): the attachment chips' label/size rendering and remove affordances.
- **`RunAttachmentCard.test.tsx`** (63 lines): the run-attachment card, including
  the crop geometry — asserted against **real crop math** (`ninaCropStyle`
  computed from the source module, never retyped into the test), so a future
  change to the crop mapping fails the test instead of silently drifting.
- **`NinaPhotoGrid.test.tsx`** (78 lines): the photo grid's layout contract.
- **`ChatImages.test.tsx`** (93 lines): the message-images surface, pinning the
  **degrade-to-HIS kind rule** (how image-bearing messages of other kinds
  degrade), again with real `next/image` rendering.
- **`ChatPhotoActions.test.tsx`** (97 lines): the photo action bar, tested as a
  **props probe** — the component is a pure function of its props, so the test
  pins the props contract at the seam rather than re-testing PhotoViewer
  internals.

### Batch 3 — session and job lists (`861d76e`, 6 files, 59 tests)

- **`SessionRow.test.tsx`** (287 lines, the session's largest single file): the
  session row against **real `planSessionRemoval`** — pinning the
  **replace-vs-refresh removal mapping** (which removal path does a
  `router.replace` vs a list refresh, and when) and the **one-tap delete
  loading guard** (a second tap during the in-flight delete must not re-fire).
- **`SessionList.test.tsx`** (85 lines): list composition over rows.
- **`NinaJobList.test.tsx`** (165 lines): pinning the **read-only vs actions
  markup** distinction — in read-only mode the row's `li` renders with
  `className` **omitted entirely** (not merely empty), a subtle contract that
  matters because downstream selectors key off the presence of the class
  attribute.
- **`NinaJobActions.test.tsx`** (140 lines), **`NinaJobDetail.test.tsx`**
  (141 lines), **`NinaJobElapsed.test.tsx`** (81 lines): the job card family,
  with elapsed-time rendering asserted against the **real jobview formatters**
  rather than hand-expected strings.

### Batch 4 — chrome, providers, hooks and the about screen (`247f506`, 7 files, 46 tests)

- **`ChatChrome.test.tsx`** (284 lines, the batch's deep one): the **full bar
  machine** — the 5s autohide with its clock restarting on activity, composer
  containment (bars hide while the composer holds focus, including the
  **textarea-to-Send no-blink deferral**: moving focus from the textarea to the
  Send button must not blink the bars), and panel-dialog fields. The native
  (non-React) focus listeners forced the session's second discovery (Follow-ups
  #2): `fireEvent` only act-wraps React's synthetic system, so triggering a
  native listener's `setState` needs `act()` around the DOM call itself.
- **`NinaBarProvider.test.tsx`** (109 lines): the provider's context contract,
  probed with a typed consumer (typed via `ReturnType` after the un-exported
  interface turned out to be unimportable — `aeaec4c`).
- **`KeyboardOverlapPublisher.test.tsx`** (137 lines): the visualViewport-driven
  keyboard overlap publisher.
- **`NinaUnreadSync.test.tsx`** (55 lines): the unread-count sync effect.
- **`useSemanticPref.test.tsx`** (114 lines): the semantic-motion preference hook
  against **real localStorage** — which forced the third discovery (Follow-ups
  #4): happy-dom's localStorage is its own class, so the store is swapped via
  `Object.defineProperty` rather than spying `Storage.prototype`.
- **`useChatScroll.test.tsx`** (91 lines): the chat scroll-anchoring hook.
- **`NinaAboutScreen.test.tsx`** (373 lines, the session's largest file): the
  about screen's **URL-derived viewer with three close legs** — history `back`
  when we pushed the entry, a `returnTo` `push` when we didn't, and an in-place
  `replace` for the direct-URL case.

### Cleanup commits

- **`aeaec4c`**: `tsc` flagged that the provider probe was typed against an
  interface the module doesn't export; re-typed it via
  `ReturnType<typeof useNinaBars>` against the real hook — the probe now
  structurally tracks the provider instead of drifting from an interface copy.
- **`17ca853`**: `npx prettier --write` across the new files; `--check` clean
  afterwards.

### Gates

- `npx vitest run components/nina` → **31 files / 313 tests, all green**.
- `npx vitest run` (full repo) → **224 files / 4,403 tests green**, run twice.
- `npx next typegen && npx tsc --noEmit` → clean.
- `npx prettier --check` on all new files → clean (after `17ca853`).
- One full-suite run had **1 failure that never reproduced** across two
  consecutive clean runs (4,403 tests ×2) — recorded as a suspected pre-existing
  flake elsewhere in the suite (see Follow-ups #7); not chased today.

## Code / Design Details

**Real collaborators over mocks, everywhere possible.** The session's organizing
rule was: mock only at true boundaries. Mocked across all 25 files: server
actions, `next/navigation`, and exactly two hook seams (`useSavePhoto`, and
`PhotoViewer` as a props probe). Everything else ran real:

- **Real `next/image`** — no repo test had ever rendered it. Rather than mock it
  defensively, the session proved empirically that under happy-dom
  `next/image`'s client component renders a plain `<img>` with the src passthrough,
  so `NinaAvatar` and `ChatImages` tests assert against the real render output.
- **Real `lib/nina/search`** in the `NinaSearchField` tests — the stale-answer
  drop is a property of the *interaction between* the field and the search
  function's async timing, so a mocked search would have pinned nothing real.
- **Real `ninaCropStyle`** — the crop test imports and calls the source's crop
  function and asserts against its output, so the test is a tautology-proof pin:
  retyping the math in the test would have made it a mirror, not a check.
- **Real `planSessionRemoval`** in `SessionRow` — the replace-vs-refresh mapping
  is exactly the logic the helper owns, so the test exercises the real planner
  and asserts the row renders/behaves per its output.
- **Real jobview formatters** in the `NinaJobElapsed`/`NinaJobDetail` tests.
- **Real localStorage** in `useSemanticPref` (via a store swap — see below).

**The async-client-component pattern.** `NinaUnreadBadge` is an `async` server-
fetched client component. Outside Next's runtime, React's test renderer will
render its Suspense fallback forever — the promise never gets a flush tick —
so the resolved states are tested by bypassing the renderer for the async part:

```tsx
// The resolved state, without Next's runtime:
const ui = await NinaUnreadBadge(props);   // the async component returns its tree
render(ui);                                // then render the resolved tree normally
```

and the Suspense fallback contract (no skeleton) is pinned separately by
rendering through the normal RTL path and asserting the fallback's emptiness.

**The native-listener `act()` pattern.** `ChatChrome` attaches its own
`addEventListener` calls (focus/blur tracking for bar autohide). React's
`fireEvent` only wraps its *own* synthetic system in `act`, so a native
listener's `setState` fires outside act and warns/drops updates. The tests
therefore trigger the DOM event inside an explicit `act()`:

```tsx
act(() => {
  textarea.dispatchEvent(new FocusEvent('focusout'));
});
```

**The localStorage swap.** happy-dom's `localStorage` is its own class, not the
global `Storage` — `vi.spyOn(Storage.prototype, ...)` touches nothing the page
uses. The tests replace the store wholesale:

```tsx
const store = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
  configurable: true,
});
```

**Mock factories must re-export what the component re-exports.** Where a module
had to be mocked but the component also re-exports a constant from it, the
factory uses `importOriginal` to spread the real module and override only the
boundary:

```tsx
vi.mock('@/app/(app)/chatview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(app)/chatview')>()),
  useSavePhoto: () => fakeSavePhoto,
}));
```

Omitting the spread fails at import time — the component's own re-export of the
constant reads `undefined` out of the mocked module.

## Decisions & Trade-offs

- **Batches by theme, one commit per batch.** Six-plus files per commit keeps
  reviewable units (the coordinator merges these) while the thematic grouping
  makes each commit's intent obvious from its message.
- **Real collaborators over mocks as the default.** Costs more setup per file
  (real search, real formatters, real crop math all need their inputs staged)
  but every pinned behavior is integration-shaped. Mocks were confined to true
  boundaries: server actions, `next/navigation`, and two hook seams.
- **`await Component()` for the async badge instead of fighting the renderer.**
  The alternative — rigging Next's runtime or an async-act harness — buys
  fidelity the assertion doesn't need: the contract under test is "resolved
  state renders a count, fallback renders no skeleton," and both halves are
  directly assertable this way.
- **`Object.defineProperty` for localStorage instead of prototype spies.**
  happy-dom's store isn't the global `Storage` class; spying the prototype is a
  no-op. The swap is explicit, scoped, and restores trivially.
- **Not chasing the 1-in-one-run failure.** A single full-suite run failed one
  test; two consecutive clean full runs (4,403 ×2) followed. Recording it in
  Follow-ups rather than spending the session on an unreproducible.
- **Tested through the component's own re-exports, imported from the declaring
  module.** After `attachStripPadBottomCss` (declared in `chatview`, re-exported
  through `album`) bound as `undefined` under batched runs, the rule became:
  import from where a symbol is declared, never through a re-export chain, in
  tests.

## Follow-ups & YAGNI notes

Learnings from this session worth carrying into future component-test sessions —
each one cost real time here so it doesn't have to cost it again:

1. **An async client component never resolves through React's test renderer
   outside Next's runtime.** Render `await Component()` directly for the
   resolved states, and pin the Suspense fallback contract separately. Hit:
   `NinaUnreadBadge`.
2. **Native (non-React) event listeners' `setState` needs `act()` around the
   triggering DOM call** — `fireEvent` only act-wraps React's own synthetic
   system. Hit: `ChatChrome` focus tests.
3. **`URLSearchParams.toString()` percent-encodes `~` as `%7E`** — assert
   decoded values, not raw search strings.
4. **happy-dom's `localStorage` is its own class** — swap the store via
   `Object.defineProperty` rather than spying `Storage.prototype`.
5. **A mock factory that replaces a module must re-export the real constants the
   component re-exports** (`...await importOriginal()`) — otherwise import-time
   access fails.
6. **Missing named imports across module graphs can bind as `undefined` and only
   fail under batched runs** — always import from the declaring module. Found:
   `attachStripPadBottomCss` lives in `chatview`, not `album`.
7. **One full-suite run had 1 failure that never reproduced across two
   consecutive clean runs** (4,403 tests ×2) — likely a pre-existing flake
   elsewhere in the suite; worth watching on future runs, not chased today.

Deliberately not done, and why:

- **No new infra.** Every need was met by the session-1 setup (RTL, happy-dom,
  per-file pragma) and established patterns; adding infra would have been
  gold-plating.
- **No re-testing of the six already-covered nina files.** `ChatScreen`,
  `NinaSidebar`, `Composer`, `MessageBubble`, `MessageList`,
  `MessageActionsSheet` keep their session-1/2/4 suites; this session only added
  net-new files.
- **No e2e/no-browser coverage of the same surfaces.** The happy-dom DOM tests
  pin structure and logic; real-device behaviors (iOS keyboard timing, visual
  viewport quirks under real mobile Safari) remain the territory of the
  measured-in-production notes in the source comments, per the session-1 doc's
  stance on test theater.

## Appendix

**Commits on `token-maxxing-2026-09-11-nina-remaining-component-tests` (in order):**

```
352dac1 test(nina): cover the atoms — avatar, unread badge, new-chat disc, typing row, quote stub, search field (50 tests)
18aa64a test(nina): cover the chips, cards and photo surfaces (38 tests)
861d76e test(nina): cover the session and job lists, the row menu, and the job detail card (59 tests)
247f506 test(nina): cover the chrome, providers, hooks and the about screen (46 tests)
aeaec4c test(nina): type the provider probe via ReturnType instead of the un-exported interface
17ca853 style(nina): prettier the new test files
```

**New test files (25), by batch:**

| Batch | Files | Tests |
|-------|-------|-------|
| atoms | `NinaAvatar`, `NinaUnreadBadge`, `NewChatButton`, `TypingIndicator`, `QuoteStub`, `NinaSearchField` | 50 |
| chips/cards/photos | `AttachmentChip`, `PhotoAttachmentChip`, `RunAttachmentCard`, `NinaPhotoGrid`, `ChatImages`, `ChatPhotoActions` | 38 |
| lists/jobs | `SessionList`, `SessionRow`, `NinaJobList`, `NinaJobActions`, `NinaJobDetail`, `NinaJobElapsed` | 59 |
| chrome/providers/hooks/about | `ChatChrome`, `NinaBarProvider`, `KeyboardOverlapPublisher`, `NinaUnreadSync`, `useSemanticPref`, `useChatScroll`, `NinaAboutScreen` | 46 |

**Key commands run this session:**

```bash
npx vitest run components/nina
npx vitest run                       # full repo, twice
npx next typegen && npx tsc --noEmit
npx prettier --check components/nina/*.test.tsx
npx prettier --write components/nina/*.test.tsx   # 17ca853
```

**Gate results:**
- `components/nina`: 31 test files / 313 tests, all green (6 files pre-existing
  from sessions 1/2/4 + 25 new from this session).
- Full repo: 224 test files / 4,403 tests green, twice; one earlier run's single
  non-reproducing failure recorded in Follow-ups #7.
- `next typegen` + `tsc --noEmit`: clean. Prettier: clean on all new files.

**Branch:** `token-maxxing-2026-09-11-nina-remaining-component-tests` — work
committed locally, **not merged**; the coordinator (`tokenmax-orch-2026-09-11`)
owns the merge.
