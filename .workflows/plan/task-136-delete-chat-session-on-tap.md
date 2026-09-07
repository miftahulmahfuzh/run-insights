# task-136 — Delete a chat session on the tap

**Card**: [#136](https://github.com/miftahulmahfuzh/run-insights/issues/136) · round 1
**Branch**: `task/136-delete-a-chat-session-on-the-tap-remove` off `origin/main` @ `a92780fe`
**Touches**: `components/nina/SessionRow.tsx`, `components/nina/NinaJobActions.tsx`,
`lib/nina/jobActions.ts`, `lib/db/schema.ts`, `lib/nina/queries.ts`

## The ask

> "remove confirmation message during user chat session deletion"

`⋯` → Hapus → Hapus chat becomes `⋯` → Hapus. `RowMode`'s `'remove'` member and the panel it
renders both go; the menu's destructive button calls `removeNinaChatSession` through the existing
`run()` helper. The server side is untouched — `removeNinaChatSession({ sessionId,
activeSessionId })` already returns `next` and `planSessionRemoval` already maps it.

This is not re-argued. The instruction is already on the record in this codebase for the same
class of control — `components/nina/NinaJobActions.tsx:19` and `lib/nina/jobActions.ts:40` both
quote *"we dont need confirmation message to execute them"* — so the card is consistency with a
stated preference, not an oversight.

## Approaches, and why A won

| | Convention | Scope | Verifiability | Reversibility |
|---|---|---|---|---|
| **A. Delete the mode; the menu's Hapus deletes** | matches `NinaJobActions` exactly | smallest change that satisfies the words | typecheck proves no dead reference survives | one commit |
| B. Keep the mode, render it as one bare destructive button | — | still three taps — fails the ask | — | — |
| C. Delete the panel, add a transient client-side undo | — | far wider | can't be proved | — |

**B loses on the ask itself.** A panel with one button in it is still a third tap; the card asks
for two.

**C loses on the card's own words** and on honesty. An undo needs somewhere to put the row, and
sessions have no archive flag — the removal is a hard delete of the session, its messages and,
through the cascades, their photo rows. A client-side "undo" would be offering to reverse
something already gone. Giving sessions what `nina_turns.deleted_at` gave jobs (a nullable column
plus a trash view) is a feature, not a drive-by, and the card puts it out of scope.

## The three consequences A forces

Removing the panel is four lines. These are the actual work.

### 1. The refusal sentence loses its home

`run()`'s contract is that a refusal *leaves the panel open with the sentence in it* — closing it
"would throw away the only explanation the runner is going to get". After this change the panel
still standing on a refused removal is the **menu**, and the menu block renders no error line. So
the line moves from the deleted panel into the menu block: a one-for-one relocation, not a new
pattern.

`components/admin/FolderMenu.tsx:351` renders its error **once, outside** every panel, which would
also work. Not adopted: `SessionRow`'s rename error lives in `Field`'s `error` slot, which is the
right place for a form error and the wrong thing to move for this card.

### 2. The double-tap safeguard changes hands

The old panel's third property — *"the safe answer sits where the finger is heading"* — is what
made a double-tap on the menu's "Hapus" land on prose. That property is gone, and what replaces it
is the one `NinaJobActions` already records as sufficient for a one-tap mutation:

- **`loading={pending}`** on the destructive button. `components/ui/Button.tsx:101` turns `loading`
  into `disabled`, so a second tap inside the round trip cannot fire a second removal.
- **Two deliberate taps still**, because the menu is still behind `⋯`. The card names this as the
  cheap way to soften the loss, and it costs nothing: the row's own tap is still navigation, so no
  stray tap on a scrolling list can delete anything. The `⋯` and `Hapus` targets are at different
  positions, so a double-tap on the disclosure cannot reach the destructive button either.
- **44px targets** (`size-11`, `Button`'s `md`), which `NinaJobActions` calls "the safeguard the
  confirmation dialog would have been, spent on the input instead of on a second screen".
- **No `window.confirm`**, on `RetryExtraction`'s recorded iOS grounds. Nothing in this change
  reopens that.

Two things deliberately **not** changed, so the diff stays the card's:

- `pending` is one flag for the whole row, so a removal in flight also spins the pin button beside
  it. Splitting it into per-action state to fix a sub-second spinner on a row that is about to
  vanish costs more than it buys.
- `Ganti nama` still carries no `disabled={pending}`. That gap predates this card — `pin` already
  fires from the same panel — so closing it here would be a drive-by.

### 3. The header is rewritten, and so are its four citations elsewhere

The file's header (`:62-84`) argues the confirmation is *the* genuinely dangerous control in the
set. After this change that section describes code that no longer exists, so it is replaced by one
that records what actually holds: the delete is still permanent and still has no undo — that fact
did not change — and what changed is the judgement about what to spend on it. The new section also
names what an undo would cost, so the next reader does not have to re-derive it.

Two notes in the old section die with it: the typed-confirmation-phrase alternative (moot without a
confirm panel) and the `countNinaSessionMessages` follow-up, which existed to put a message count
into the confirm copy. The function stays; the reason to wire it into *this* file goes.

**Then the citations.** Six passages in four other files assert the three-tap confirm as a live
fact, and most of them build an argument on it:

| Site | What it says today |
|---|---|
| `components/nina/NinaJobActions.tsx:16` | "`SessionRow` guards its remove behind `⋯` → Hapus → Hapus chat … **None of that transfers here**" |
| `components/nina/NinaJobActions.tsx:134` | "why `SessionRow`'s R11 confirmation is the right call there and the wrong one here" |
| `lib/nina/jobActions.ts:41` | "deliberately OVERRIDES `components/nina/SessionRow.tsx`'s three-tap confirm" |
| `lib/nina/jobActions.ts:130` | "`SessionRow.tsx` builds a three-tap confirmation panel for its delete and argues for it at length" |
| `lib/db/schema.ts:702` | "`SessionRow`'s R11 confirmation exists because *'there is no archive flag and therefore no undo'*, and here there is" |
| `lib/nina/queries.ts:787` | `countNinaSessionMessages` — "**for phase 5's delete confirmation, which is the only thing standing between a mis-tap and a lost conversation**" |

Each is corrected in place, minimally. **The substantive argument at each site survives untouched**
— `nina_turns.deleted_at` is reversible and a session removal is not, and that asymmetry is still
the reason the two controls could have differed. What changes is the tense and the conclusion: the
comparison is no longer "we override a confirming precedent" but "the whole set is one tap behind a
disclosure, and here is the difference in stakes that would have justified a divergence".

`countNinaSessionMessages` is the one that needs a decision rather than a reword: it exists solely
for the confirm copy, and after this change nothing in the repo calls it (it was already
comment-only, so this adds no lint risk). **Kept, with its docstring corrected to say it has no
caller and why it is still worth having** — deleting a data-layer read is a judgement the card does
not authorise, and the number is what any future undo, trash view or pre-purge line would need.

*The narrower reading that lost*: touch only `SessionRow.tsx`, because that is the only file the
card names. It loses on the card's own justification — "must be rewritten, not left contradicting
the code" — which does not stop at a file boundary. In a codebase whose headers *are* the design
record, a reader of `jobActions.ts` being told that `SessionRow` confirms is the same defect one
file over.

## Explicitly out of scope

- **`components/nina/MessageActionsSheet.tsx`** — message deletion is a different control, and the
  card says so.
- **An archive flag for sessions**, and any undo built on one.
- **Wiring `countNinaSessionMessages` into the row.**

## Verification

The repo's own CI gate, in `.github/workflows/ci.yml` order: seven bespoke boundary guards,
`format:check`, `lint`, `typecheck`, `npm test`, `build`. `typecheck` is the one that actually
proves this change — a surviving `'remove'` reference is a type error once the union member is
gone. No test asserts `SessionRow`'s source (the source-asserting tests are
`nina.chatPhoto`, `nina.sidebarProvider`, `tabbar.geometry`, and none of them names this file), so
none needs updating.
