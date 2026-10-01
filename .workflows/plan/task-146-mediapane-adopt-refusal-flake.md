# task-146 — MediaPane adopt-refusal test flakes under parallel load

**Card:** [#146](https://github.com/miftahulmahfuzh/run-insights/issues/146) · round 1 · 2026-10-01
**Branch:** `task/146-mediapane-adopt-refusal-test-flakes`

## The defect

`components/admin/explorer/MediaPane.test.tsx` → *"does not latch worn when the adopt action
refuses"* is red under parallel load and green on its own. Test-only: the product behaviour is
correct, the assertion is.

`MediaPane` adopts inside a `useTransition` (`MediaPane.tsx:129`, `:156`). On a refusal the handler
does `setError(result.error)` and returns; React 19 settles that transition over **two commits** —
the error text renders in the first, `isPending` flips back in the second. The button's
`disabled={pending || worn}` (`:279`) therefore outlives the text by one commit.

The test awaited the text and then read the button *synchronously*:

```ts
expect(await screen.findByText('already exists')).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Set as her profile picture' })).toBeEnabled()
```

`findByText` resolves on commit 1. The next line can read a button that is still
`aria-busy="true" disabled`. Under parallel load the gap between the commits widens past the
window and the assertion loses.

Confirmed by reading the component, not only by the card's trace: the write that satisfies the
`findBy` and the flag that satisfies the `toBeEnabled` are owned by two different commits.

Why a deterministic probe could not show it: wrapping the settle in `act()` drains *both* commits,
so the gap closes (measured — a probe built that way goes green). The race only exists on the
non-`act` path — `userEvent` + `findBy`/`waitFor`, which is exactly this test's shape. That is also
why it is load-dependent rather than reproducible on demand.

## Measured, 2026-10-01, in this worktree

Ten consecutive parallel runs of the card's F34 surface set
(`components/admin/FileExplorer.test.tsx components/admin/FolderMenu.test.tsx
components/admin/ShareToNinaItem.test.tsx components/admin/explorer/ lib/nina/`):

| | |
|---|---|
| Runs red | **5 / 10** |
| The red, every time | `SelectionPane.test.tsx:252` — *"shows the refusal sentence and leaves the crop dirty when the save action refuses"* |
| `MediaPane.test.tsx:191` (the carded one) | never caught in these 10 |

That inverts the card's picture without contradicting it: **the hazard is a class, not a line.**
`SelectionPane` is the same defect with a wider window and it was never carded; `MediaPane` is the
one that happened to be caught on the day. Fixing only the carded line would have left a redder
test in the same directory.

It also exposed a hole in the first sweep, which is why the sweep below is the second one: the
scanner skipped any assertion with `waitFor` within four lines of lookback, and
`SelectionPane:252`'s predecessor is `await waitFor(() => expect(getByText('crop rejected'))…)`.
The lookback heuristic was replaced with a paren-balance check for whether the assertion sits
*inside* a `waitFor` callback, and positive-controlled against `MemoryTable.test.tsx:412` — the
known-good fix of this same shape — which it now reports.

## Approaches considered

### A. Gate on the settle with `waitFor` — **chosen**

```ts
await waitFor(() =>
  expect(screen.getByRole('button', { name: 'Set as her profile picture' })).toBeEnabled(),
)
```

| Criterion | |
|---|---|
| Convention | already the repo's fix for this exact shape — `MemoryTable.test.tsx:412` carries it with a comment naming the two commits |
| Scope | one assertion per site, test-only, no product change |
| Verifiability | the polled predicate *is* the thing under test; it cannot pass early |
| Reversibility | one commit |

It also asserts strictly more than the old line did: the old one asserted "enabled at this instant",
the new one asserts "becomes enabled", which is the actual contract — a refusal must release the
control.

### B. `flushTransition()` — two `await act(async () => {})` in a row

The idiom `IntentChips.test.tsx:20` uses, documented there with the same two-commit explanation.
Deterministic rather than polled, and it would let the test observe the mid-flight state.

**Lost on convention + scope.** It belongs to the `fireEvent` + `act` style; `MediaPane.test.tsx` is
written entirely in `userEvent` + `findBy`, and bolting an `act` pair onto a `userEvent` click means
reaching past the abstraction the rest of the file is written in. It would also mean importing `act`
into three files to fix an assertion that `waitFor` fixes in place.

### C. Serialise the file (`--no-file-parallelism`, or a `sequential` annotation)

Makes the symptom go away without touching the wrong assertion.

**Lost on verifiability and scope.** It would hide the bug rather than fix it, cost the whole
suite's parallelism for one line, and the assertion would stay wrong for the next reader to copy.

## Ambiguity call (4c)

The card says the fix is one line, then adds: *"Worth a sweep of the neighbouring `explorer/` tests
for the same `findBy…` → synchronous-`toBeEnabled` pattern while in there."*

Narrow reading taken: **fix the measured flake, and sweep `components/admin/explorer/` only** — the
directory the card names. The wider reading — change every `*.test.tsx` under `components/` that
*looks* like this — was rejected on evidence rather than on scope: every candidate outside
`explorer/` was opened and traced to its component, and in each one the awaited state and the
asserted state land in the same commit (see the rejected list below). Widening would have meant
touching files for no defect.

The card's "one line" is also read as its estimate, not its boundary: it asks for the sweep in the
next sentence, and the sweep found four sites, one of them redder than the carded one.

## The sweep — `components/admin/explorer/`

Scanned all 21 `components/**/*.test.tsx` carrying `toBeEnabled` / `not.toBeDisabled` for the shape
*"an `await` earlier in the test, then a synchronous enabled-ness assertion outside a `waitFor`"*.
28 candidates; 4 are real, all in `explorer/`:

| Site | Why it is the same hazard |
|---|---|
| `SelectionPane.test.tsx:252` | **red 5/10 above** — `useTransition` (`SelectionPane.tsx:166`), `disabled={!dirty \|\| pending}` (`:349`); the `waitFor` ahead of it gates on `setError`'s sentence, which is commit 1 |
| `MediaPane.test.tsx:191` | the carded flake — `useTransition`, two commits |
| `MediaControls.test.tsx:154-155` | `await findByRole('button', { name: 'Replace this photo' })` — that `aria-label` is **constant** (`MediaControls.tsx:109`), so the await gates on an element that was never absent. The thing asserted (`disabled={busy !== 'idle'}`) is not what was awaited. |
| `PhotoDescription.test.tsx:261` | same: `await findByRole(…/save the description/i)` — the label tracks `willClear`, not `busy` (`PhotoDescription.tsx:299`), so the await gates on nothing and `expect(textarea()).toBeEnabled()` reads a `busy` that may not have cleared |

The two neighbours use a plain `useState` busy rather than `useTransition`, so their window is one
commit rather than two — narrower, but open for the same reason: **the await and the assertion are
about different state.** Pointing the wait at the assertion closes both.

The rejected candidates, for the record:

- **Typing-driven gating** — `ShortcutTable:80`, `PhotoDescription:91,411`, `Composer:142`,
  `SelectionPane:217`. Enabled-ness follows a controlled input's value, which `user.type`/`user.click`
  already flushed. No transition in play.
- **Asserting the in-flight state on purpose**, with the gate still unresolved —
  `PhotoDescription:264,468,604`. These assert a control is *deliberately* left enabled during a
  save; the direction of the race is the opposite one, and `waitFor` would weaken them.
- **Already flushing both commits explicitly** — `IntentChips:112,155` (`flushTransition()`),
  `ShareButton:132`, `CopyAdminLinkButton:188` (a second `await act(async () => {})`),
  `UploadPicker:181,313,412` (the file's own `flush()` helper).
- **Already gated** — `MemoryTable:412`, `NinaJobActions:192`, `ProfileForm:167`,
  `RetryExtraction:128`, `UploadPicker:415,469`. The scanner reports the `await waitFor(…)` line
  itself; these are the positive control.
- **Awaited and asserted are the same state, verified in the component** — three sites outside
  `explorer/` that look like the hazard and are not:
  - `NewChatButton:100` — `aria-busy={pending} disabled={pending}` (`NewChatButton.tsx:87-88`),
    literally one expression, so the `aria-busy='false'` wait is an exact proxy.
  - `NinaAboutScreen:259` — `setAlbumPage` and `setAlbumPaging(false)` are the try/finally of one
    synchronous flow (`NinaAboutScreen.tsx:279-285`), so React batches them into one commit; the
    "Halaman 2 dari 2" wait and `disabled={busy || page <= 1}` cannot separate.
  - `NinaAboutScreen:611` — the strip shares one flight, as its own comment says; the preceding
    `waitFor` is on a sibling driven by that same flag.
- **Asserting `toBeDisabled` mid-flight** — `Composer:342,355,370`, `NewChatButton:93`,
  `NinaAboutScreen:260,602,605`. The race these could lose runs the other way, and a `waitFor`
  would weaken them into tautologies.

## Changes

1. `components/admin/explorer/MediaPane.test.tsx` — import `waitFor`; wrap the re-enable assertion,
   with a comment naming the two-commit settle.
2. `components/admin/explorer/MediaControls.test.tsx` — import `waitFor`; replace the
   gates-on-nothing `findByRole` with `waitFor(() => expect(replaceButton()).toBeEnabled())`.
3. `components/admin/explorer/PhotoDescription.test.tsx` — import `waitFor`; same replacement
   against `textarea()`.
4. `components/admin/explorer/SelectionPane.test.tsx` — wrap the re-arm assertion (`waitFor` was
   already imported), with the measurement in the comment.

No product file changes.

## Gate

The repo's own CI, read out of `.github/workflows/*.yml` by `task_gh.py land`, plus the F34 surface
set run in parallel (the configuration the card measured the red in).
