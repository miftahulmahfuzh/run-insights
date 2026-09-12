# Package: `lib/review` + `components/review` — the review surface

**Location**: `lib/review` (the rules) and `components/review` (the screen)
**Last Updated**: 2026-09-12 — initial creation. Every module in both directories was read in
full; every count below is measured on this date; the export surface had already been
compiler-audited the same day by the `review-yagni` session (see *Notes*).
**Documentation Created**: 2026-09-12

## Overview

This is the wall between "a model's guess" and "a fact". The extractor (F04) reads screenshots
and guesses ~108 fields; this surface is where a human confirms or corrects them (F05), and the
commit it performs is **the only code path in the product that creates a `runs` row** (R-1) and
**the only writer of `runs.reviewed_at`**. Everything downstream — every rollup, every record,
every badge, every narrative, Nina's proactivity — treats what `commit.ts` writes as ground truth
(D16) and never asks again whether it is plausible. That trust is why this surface is documented
as one package despite living in two directories: it is one feature, and its invariants only
hold jointly.

The two halves:

- **`lib/review`** — 8 modules, 1,915 lines (2026-09-12): the draft shape and its diff, the four
  consistency checks, the Zod wall, the input parsers and the time mask, the baseline loader,
  the commit pipeline, and the sticky bar's one line of copy. Everything here is rules.
- **`components/review`** — 12 components, 2,147 lines (2026-09-12): the correction screen that
  renders those rules — the evidence strip, the hero fields, the splits table, the zone bar, the
  chips, the banner, the disclosures. Everything here is the spending of reviewer attention.

The design brief both halves serve: review cannot be a nag the runner learns to dismiss. The
extractor scored 108/108 five times in a row and its variant misread *one* split pace while
getting 101 fields right — **a model can be locally wrong and globally convincing**. So the cost
of review scales with how wrong the extraction is, not with how many fields exist: on a clean
extraction (the expected case; the canonical fixture passes all four checks) confirming a run
costs one tap.

**Key responsibilities:**

- The **review draft** — the one object the screen edits, the commit validates, and the
  corrections log diffs; mirrors `ExtractedSession` field-for-field.
- The **wall** (`schema.ts`) — the last place a nonsense value can be stopped before the rest of
  the product treats it as fact.
- The **four consistency checks** — arithmetic that points attention, advice that never gates.
- The **commit pipeline** — one transaction for the run, then the corrections log, then
  invalidation, then Nina — in that order, for reasons written below.
- The **corrections log** (`extractions.corrections`, R-7) — the measurement column that makes
  "how wrong is the extractor" a queryable question.
- The **screen** — evidence always visible, chips that never overclaim, a save button that is
  never disabled for validation.

## The standing rules of the surface

1. **The server re-reads the baseline. The client nominates nothing.** The browser sends the
   edited draft and ids — never `from` values. A client that could nominate its own `from`
   values could rewrite the extractor's error profile. `loadReview.ts` exists to make the
   baseline a server fact.
2. **`requireUserId()` is line 1, before the payload is even looked at** (INVARIANT A), and it
   sits above every `try` in the action's call graph: it signals by throwing `NEXT_REDIRECT`,
   and so does the final `redirect()` — neither may ever be caught. Ownership is inside the
   reads: someone else's id resolves to null, which becomes the same 404/not-found a
   nonexistent id gets, so the action cannot probe which ids exist.
3. **The wall validates the payload the browser sent, not the payload the extractor produced** —
   a client is not trusted just because it was ours. The four checks do not run here and cannot
   block a commit: they are advice, not gates. A genuinely odd run (paused watch, tunnel,
   treadmill) can legitimately fail CHK-2 forever, and a human who has looked at the screenshot
   outranks arithmetic that only knows the numbers disagree.
4. **The save button is never pre-emptively disabled for validation.** The wall's failures are
   all "this cannot be stored", never "this looks unusual"; a greyed button with no explanation
   is the least useful message an app can send. The button always submits and errors come back
   attached to the fields that caused them.
5. **`commit.ts` is the only creator of `runs` rows and the only writer of `reviewed_at`.**
   Under R-1 there is not even a placeholder row — `/x/[extractionId]` exists precisely because
   a run cannot be addressed before it exists.
6. **`actions.ts` is the boundary; `commit.ts` is everything real.** A `'use server'` module may
   only export async functions, which would make `commitReview`'s injectable clock and
   invalidation hook impossible; and `after()` lives in the action because it throws `E468`
   unconditionally outside a request scope, and the commit suite drives `commitReview()`
   directly with no request scope (ruling E3). The action holds identity, cache, navigation —
   and, since F33, scheduling.
7. **`checks.ts`, `draft.ts`, `inputs.ts` and `copy.ts` are pure modules** — no I/O, no React,
   no `server-only`. The client imports them directly and they re-run on every keystroke; they
   are also the parts a node-environment vitest can assert. `loadReview.ts` and `commit.ts` are
   `'server-only'`; `actions.ts` is `'use server'`.
8. **A check may only implicate fields it can name** (the honesty constraint). CHK-1 knows the
   splits disagree with the duration; it does not know which row, so it flags the block and says
   "one of the 11 splits below looks off" — never row 7. Only CHK-4 names an exact field, because
   it is row-specific by construction. Overclaiming precision teaches the reviewer to trust a
   flag that lied about how much it knew.
9. **The corrections log is append-only and measures edits, not attention.** A field the
   reviewer read carefully and left alone produces nothing. Events append onto whatever the
   column already holds (`mergeCorrections`), so a field corrected twice keeps both stories.
   The `manual` phase is a transcript, not a diff: every `from` is null, because there is no
   extracted baseline and our own pre-filled defaults are not model output.
10. **`runs.source` is never rewritten by an edit.** A run typed by hand stays `manual` however
    many times it is corrected; one read from a screenshot stays `screenshot`. `commit.ts`'s
    edit branch strips `source` from the patch deliberately.

## The two routes

Both pages mount the same `<ReviewScreen>`; they differ only in the `ReviewContext` the server
hands it. This is R-1's design: `/x/[id]` before a run exists, `/r/[id]/edit` after.

| route | page | baseline | branches resolved server-side |
|---|---|---|---|
| `/x/[extractionId]` | `app/x/[extractionId]/page.tsx` | **what the model said** (`hydrateDraftFromExtraction`) | already committed → redirect to the run; still pending → `ExtractionGate`; terminal (`ok`/`repaired`) → review; `failed` → the SAME screen with an empty draft (§8 manual entry), still keyed to the failed extraction so `runs.extraction_id` records where the pipeline broke |
| `/r/[id]/edit` | `app/r/[id]/edit/page.tsx` | **what is currently stored** (`draftFromRun`) | not found → 404; otherwise review with `mode: 'edit'` |

Both pages declare **`export const maxDuration = 60` as a literal** — segment config exports are
statically analysed and an imported constant is invisible to the analyser. It is load-bearing:
`commitReviewAction` schedules Nina's reaction in `after()`, and `after` runs for the route
segment's configured max duration. Without the literal her ~15 s model call is cut off after the
redirect has already succeeded — a failure nothing can surface. A Server Action's timeout is the
page segment's, not the action's.

`/x/…` is not `/r/[id]/review` because `runs.occurred_on` is NOT NULL and unknown until the
vision call returns; a placeholder row would violate D1, and two placeholder rows created on the
same day would collide on the R-5 dedupe index — which is exactly what happens after two weekend
runs.

## Module map — `lib/review`

| File | Role |
|---|---|
| `actions.ts` | The `'use server'` boundary: `commitReviewAction` — identity (INVARIANT A), the call into `commitReview`, the F33 `after()` scheduling, `revalidatePath`, `redirect`. Nothing else. |
| `commit.ts` | `'server-only'`. The commit pipeline itself: envelope + draft validation, baseline re-read, already-committed short-circuit, correction attribution, the write, the corrections log, invalidation. Injectable clock and invalidation hook for tests. |
| `loadReview.ts` | `'server-only'`. The baseline resolver: `loadExtractionReview` (pre-commit) and `loadRunEdit` (post-review), one shared `ReviewContext` shape. |
| `draft.ts` | The `ReviewDraft` shape, the three ways a draft comes into existence (`emptyDraft`, `hydrateDraftFromExtraction`, `draftFromRun`), the yearless-date resolver, the time narrow/widen pair, and the corrections diff (`flattenDraft` / `diffCorrections` / `mergeCorrections`). Pure. |
| `checks.ts` | The four consistency checks, the attribution helper, and the flagged-path set. Pure; runs on every keystroke in the client and again on the server at commit time. |
| `schema.ts` | The wall: `ReviewDraftSchema` and its primitives, the two-step envelope parse, `toRunInput` (the D5 unit conversion), `fieldErrorsOf`, `CommitReviewState`. |
| `inputs.ts` | Text in, integers out: the parse/pair for duration, pace, integer and distance fields, and `maskTimeInput` — the colon-drawing mask. Pure. |
| `copy.ts` | `commitStatusLine` — the sticky bar's one sentence, written once as a pure function. Pure. |

## The draft (`draft.ts`)

The draft mirrors `ExtractedSession` **field-for-field — same names, same units, same
nullability** — so that a correction's field path is literally the extractor's own field path,
which is what makes `extractions.corrections` analysable against the prompt that produced the
error (`tests/review.draft.test.ts` asserts the mirror). Three fields are additions rather than
mirrors, and each is a column F05 is the only writer of in the product:

- `occurredOn` — `runs.occurred_on` is NOT NULL and the extraction only ever sees a year-less
  label ("Thu, 20 Aug"). `resolveOccurredOn` guesses the only safe way — **a run cannot have
  happened in the future**: the Jakarta current year, stepped back one if that lands after
  today, and an explicit year in the label always wins. It never falls back to `Date.parse`,
  which would happily accept "Tangerang" as a date in some runtimes. The label it guessed from
  is kept verbatim on the draft as the evidence shown under the date input.
- `intent` and `note` — `runs.intent` / `runs.note`. Without them here those columns are dead
  schema. They are also the only fields on the screen that were never on a screenshot.

**The baseline rule, stated once:** first commit → the baseline is *what the model said*;
later edits → the baseline is *what is currently stored*. `draftFromRun` exists for the second
case, and the distinction is the whole reason it exists: a second correction's `from` value must
be the first correction's `to`. Diffing an edit against the extraction would record a value that
has not been true since the first commit and make the error-profile query count one model error
twice. `postWorkoutHr` round-trips lossily on purpose — `runs` keeps only the two readings R-9
gave columns to.

**Field paths are F05's syntax to own** (R-7): dotted, zero-indexed, extractor-identical —
`distanceKm`, `splits.0.timeSec`, `hrZones.3.durationSec`, `postWorkoutHr.0.bpm`. Index, not km
number: a correction that renumbers km 11 to km 10 has to be expressible, and a key that changes
identity when its own value changes cannot express it. `flattenDraft`'s flat map is what makes
`diffCorrections` total — an added row and a deleted row are the same operation as a changed
value (a key present on one side and absent on the other), so no branch can forget a case, and a
future field is diffed the moment it is added to `SCALAR_FIELDS`.

`postWorkoutHr` is **positional** (R-9): `[0]` becomes `runs.end_hr_bpm`, `[1]` becomes
`runs.hr_1min_post_bpm`. Clearing the first reading must leave a hole rather than promote the
one-minute reading into its place and mislabel it — the component-side `withHr` holds slots open
and only compacts when *both* are null.

`narrowTime`/`widenTime` are the screen-vs-database seam: Postgres `time` widens `'07:07'` to
`'07:07:00'`; the screenshot and the input both print `07:07`.

## The four checks (`checks.ts`)

Confidence derived from arithmetic rather than from the model. Self-reported certainty would be
the wrong signal anyway — it comes from the same process that produced the error. What is free
is that several quantities must agree by construction, and when numbers that must agree don't,
that disagreement localises an error far more precisely than any self-rating.

| id | identity | tolerance | can implicate |
|---|---|---|---|
| CHK-1 `splits_sum_vs_duration` | Σ split times ≈ duration | max(10 s, 0.5 %) | the splits block, never a row |
| CHK-2 `zones_sum_vs_duration` | Σ zone durations ≈ duration | max(90 s, 3.5 %) | the zones block, never a row |
| CHK-3 `distance_pace_vs_duration` | distance × pace ≈ duration | max(5 s, 0.5 %) — tightest, the identity is near-exact | all three inputs, never one |
| CHK-4 `partial_consistency` | the partial final kilometre (D14) — three directions: unmarked partial, pace vs remainder, partial with no remainder to spend | 15 s pace tolerance | **the only check that names exact fields**, because it is row-specific by construction |

**Tolerances are seeded, not tuned.** There is exactly one ground-truth fixture; every tolerance
is a starting value chosen to clear the fixture's natural slack and catch the historically
observed error class (§1.3's misread moves the split sum by 40 s; the fixture's zones are
legitimately 121 s short of their own duration, which is why CHK-2 is looser — a 0.5 % tolerance
there would cry wolf on every clean run and train the reviewer to ignore the banner).
`getExtractionErrorProfile` (`lib/db/queries.ts`) is the intended mechanism for tightening them
once a month of real corrections exists.

**Attribution is against the baseline's failures, never the corrected draft's**: by the time a
number is fixed, the check that flagged it has stopped firing. `checkIdForFieldPath` is
prefix-aware — CHK-1's `'splits'` covers `splits.0.timeSec` — which is the honest reading of
"this check could not tell you which row, so it flagged them all", and it is what lets the
analytics query answer *did any automated check catch this, or did the human catch it unaided?*
A `null` checkId is itself signal (a field corrected repeatedly with no check firing is a
candidate for a new check) and is recorded honestly rather than omitted.

## The wall (`schema.ts`)

Everything past this schema is treated as ground truth by every other feature. The bounds are
not taste calls:

- `MAX_DURATION_SEC` = 86,400 — `duration_sec` is the denominator of every pace, zone
  percentage and decoupling figure downstream; a transposed digit that survives here poisons all
  of them at once.
- `MAX_DISTANCE_KM` = 300 — wide enough for an ultra, narrow enough to catch metres typed into a
  km field.
- bpm fields are 40–230; resting HR 30–120; cadence 0–300.
- **Zero splits is legal** — `/upload` accepts one screenshot and a summary-only upload has no
  splits table to read; the provenance guard nulls the array out precisely so no invented rows
  reach a reviewer.
- **Zones come as all five or none** — Apple always prints all five when it prints any; three
  zones means three were transcribed and two were lost, and a zone percentage over a truncated
  denominator is wrong in a way nothing downstream can detect.
- **At most one partial split row, and it must be the last** (D14) — a partial km in the middle
  of a table is not a short final kilometre, it is a misread row, and F06's
  `WHERE partial = false` filter would silently drop a full kilometre from every pace average.
  Duplicate km numbers are refused because `(run_id, km)` is `run_splits`' primary key — the
  INSERT would otherwise fail with a constraint error the reviewer cannot act on.
- **`endTime < startTime` is deliberately NOT an error** — a run that starts 23:40 and ends
  00:12 is a real run, and `occurred_on` already pins the day.

**The envelope and the draft are validated in two steps, deliberately.** Parsing them as one
nested object would prefix every issue path with `draft.`, and the screen looks its errors up by
the draft's own dot-path (`splits.0.timeSec`) — a nested parse would silently deliver errors
nothing renders. `fieldErrorsOf` joins issue paths with dots (`|| 'form'` for the root) into the
`Record<string, string>` every field reads from.

`toRunInput` is the D5 unit conversion, once: kilometres → integer metres, and **`avgPaceSec` is
stored, not recomputed on read** — taken from the reviewed value when there is one, derived only
as the fallback for the summary-less upload. That is the reason CHK-3 exists at all: Apple
prints its own average pace, the reviewer confirms *that number*, and CHK-3 tells them when it
disagrees with distance and duration. Always deriving would make the stored value unfalsifiable
and CHK-3 a check on nothing.

## Inputs and the mask (`inputs.ts`, `ParsedInput.tsx`)

The draft is integers in the smallest sensible unit (D5) — right to store, unusable to type.
Every control shows the value the way the screenshot shows it and the parser pair converts, once,
in a module a unit test can reach.

**The parse contract, three outcomes:** `''` → `{ value: null }` (a cleared field is a null, not
a zero); unparseable → `{ value: null, invalid: true }`; parseable → `{ value: <int> }`. The
middle one is the one that matters: `null` is a legitimate value for most of these fields (a
blank cadence cell is normal), so collapsing "I typed nonsense" into "there was nothing there"
would let a typo erase a number the screenshot plainly shows, with no error and no trace.

- A bare number in a duration/pace field is **seconds**, not minutes — the cells are always
  MM:SS on screen, so a lone integer means the stored unit was entered deliberately. Only the
  leading field may exceed 59 (`'90:00'` is a legitimate ninety minutes).
- **A comma is accepted and read as a decimal point** in distance — Apple prints `10,67KM` and
  the reviewer is copying from that screen. Reading it is free; rendering stays a period.
- Out-of-range is `invalid`, never clamped — clamping hides a typo.
- Output spellings (`toDurationInput` etc.) are the editable spellings; `lib/format` owns the
  display spellings. Pace renders as `7:09`, not `7'09"`, because a colon is one keystroke on a
  phone keyboard — though `7'09"` IS accepted as input.

**The mask** (`maskTimeInput`) exists because `inputMode="numeric"` asks the OS for a
digits-only keypad and both iOS and Android oblige: **there is no colon key on it**. Duration,
pace, split time, split pace and time-in-zone were impossible to correct on a phone — on the one
screen whose entire justification is correcting a field. No `inputMode` value fixes this, so the
separator is drawn instead of typed: digits shift in from the right and the function lays the
colons. Four steps, one reason each: strip non-digits (idempotent over its own output; a desktop
`4:48` still lands on `4:48`); **drop leading zeros, then cap** (dropping is what makes the
field CLEARABLE — padding without it sticks at `0:00` forever, and a blank is legitimate on
every one of these fields); pad to three (`0:01`, not a bare `1`); group from the right in
twos. The ceiling is `59:59`/`1:18:36`-shaped because `toDurationInput` rolls past sixty minutes
into a third group. Intermediate invalid states are unavoidable and deliberate — `1:18:36` is
typed `1,1,8,3,6` and the fourth keystroke is `11:83`; refusing it would make the destination
unreachable, which is why `ParsedInput`'s `deferError` holds the message instead.

**`ParsedInput` holds its own string state, and that is the entire point.** A controlled input
driven off the parsed number cannot be typed into (`4:48` passes through unparseable
intermediates). So the string is local and the number is lifted: every keystroke re-parses;
parses push up and clear the local error; failures keep the text, mark invalid, push nothing —
**the value is never pushed up as `null` on a parse failure**. The external value re-seeds the
text only when it stops agreeing with what is typed (compared on the PARSED value, so `04:48`
counts as already agreeing with 288), and the re-seed happens **during render, not in an
effect** — React's documented adjust-state-when-a-prop-changes pattern; an effect would paint
the stale text first, a visible flicker under a moving cursor. Masked fields pin the caret to
the end after the DOM updates (right-to-left entry is the whole gesture; there is no mid-string
edit worth preserving), only while focused. `deferError` holds the invalid message until blur —
the message waits, the value contract does not change. A server-side `error` is never deferred,
because it did not arrive from the keystroke under the reviewer's thumb.

## The commit pipeline (`commit.ts` + `actions.ts`)

Order of operations, and why it is this order:

1. **Re-read the baseline from the database** (`loadBaseline`: `runId` wins when both ids are
   present — an edit diffs against the run, never against the extraction that produced it three
   weeks ago).
2. **Validate the submitted draft** — the wall. Envelope first, then draft, two parses.
3. **Write run + splits + zones in ONE batch** — `commitExtractedRun` (first commit) or
   `applyRunCorrections` (edit, `source` stripped from the patch).
4. **Append the corrections log** — deliberately outside step 3's transaction and after it: the
   failure this ordering opens is a saved run whose log is missing events (measurable signal
   lost, no stored number wrong); the other ordering opens a log describing a run that does not
   exist. Losing analytics beats lying about history, so a failure here is logged, not raised.
5. **Fire `onRunCommitted`** — after by ruling: invalidation failure must never roll back a
   human's confirmed save. Records first, then badges (the order lives in `lib/derived/
   invalidate.ts` and matters: badges read the records the recompute just wrote).

The already-committed short-circuit sits between 1 and 2: an extraction that has produced a run
must not produce a second one. Two tabs on the same `/x/[id]`, or a double-tap on a slow
connection, would otherwise commit twice — and the R-5 dedupe index only catches identical
start times, surfacing as a confusing duplicate error rather than a no-op. **Answer with the run
they already have** (`ok`, `isNewRun: false`, empty earned/moved arrays — a caller never has to
distinguish "nothing earned" from "we did not look").

`DuplicateRunError` becomes a `status: 'duplicate'` state with the existing run's id so the
screen can link to it; `NotFoundError` becomes a plain error state; anything else throws.

**Nina's reaction (F33 R8) is scheduled in the action, in `after()`, only when `isNewRun`.**
A run becoming real is the event; a post-review edit and the short-circuit are not — Nina
reacting to a corrected split as though the runner had just come home is the failure that makes
proactivity feel automated. The block does not await, does not touch `outcome.state`, and cannot
throw into the response (`emitRunCommitted` returns a result; the catch is the backstop that
keeps an unhandled rejection out of `after`). `emitRunCommitted` is handed `recordsMoved`/
`newlyEarned` from the invalidation pass — re-deriving them later would recompute the shelf at a
later instant than the commit, and a run edited twice in a minute would mis-report. The action
then revalidates `/`, `/trends`, `/me` and `/r/<id>` (revalidating a route with no page is a
no-op; listing them is what stops the sweep being forgotten when they land) and redirects —
on success the action NEVER returns to the caller.

`occurredOnOf` reads the run's calendar day back off the raw payload for Nina's trigger block,
returning `''` on malformed shape rather than throwing inside `after` — an empty string says
nothing about the date instead of lying about it.

## The screen (`components/review`)

**State is shaped once, in `ReviewClient`:** one `draft` object, one `baseline` that never
changes, everything else derived — `checks = checkDraft(draft)` re-run on change, never cached
across an edit; `editedPaths` = the same diff the server will run, with a throwaway timestamp
(only the key set is used, so no browser-computed `correctedAt` is ever stored); `flagged` = the
paths the failing checks can honestly implicate. The client-side baseline drives chips only.

| component | the one thing to know about it |
|---|---|
| `ReviewScreen` | The thinnest binding between `ReviewClient` and the Server Action — it exists so the component tree never imports the action (which pulls `server-only` modules transitively). `useActionState` is the double-submit guard: React will not run a second action while the first is in flight — on a slow phone, the difference between one run and a duplicate-key error. The action never returns on success, so only validation and duplicate failures land back here. |
| `ReviewClient` | The state owner, the jump resolver (a check's field path resolves to the BLOCK that owns it — never a row, per the honesty constraint), the error-summary scroll (a validation failure that scrolls nowhere is a save button that appears not to work), and the sticky bar: `aria-live="polite"` (the checks re-run per keystroke; `assertive` would talk over the field being corrected), button never disabled, submit always sends the whole `{extractionId, runId, draft}` envelope. |
| `HeroFields` | Always open — the five values a run *is*, plus the three CHK-3 inputs which must be visible together (a sheet would show them one at a time). Under the date input: the yearless label and "no year, so this is our best guess". `ClockInput` is the native `type="time"` on purpose: it emits exactly the zero-padded `HH:mm` the schema's `clockTime` requires and cannot produce the one shape the schema refuses, so there is no parse step at all — a deletion, not a port. The `scan` chip is suppressed on hero fields (eighteen identical pills is noise; the section already says everything was scanned) — only `check` and `edited` are drawn. |
| `SplitsTable` | Always open, never collapsed — this is exactly where the historically-observed error lives. Rows are summaries, never edited in place (55 tiny inputs is unhittable on a phone); tapping opens a sheet with that row's fields and the splits screenshot pinned above. The partial flag is a first-class checkbox with D14 said out loud. Row edit buttons quote the row's own values in their aria-label — "Edit row 11" eleven times over is useless to a VoiceOver user. |
| `ZoneBar` | A stacked bar first, because the shape IS the finding (90 % in zones 4–5 reads instantly as two enormous blocks); a second, independent way of catching what CHK-2 catches arithmetically. The `--z1`..`--z5` hues deliberately do not change in dark mode: they encode data, not chrome. Zone 1 has no floor and zone 5 no ceiling, and the sheet renders "No lower bound" as a statement rather than an empty box that invites the reviewer to invent one. |
| `MoreDetails` | The only collapsed section, and the rule that earns it: **"collapsed" is reserved for fields with no cross-check and low downstream leverage** — a wrong elevation is a wrong number on one card; a wrong split corrupts averages, rollups, records and badges forever. Nothing in here is checkable today, but it is a *controlled* `<details>` so the day a check names one of its fields, forcing it open is a one-line change. |
| `HonestyChip` | R-46's three states — `scan` (read from an image, untouched), `check` (a check points here), `edited` (differs from the extraction) — chips rather than underlines because a 1 px underline is invisible at arm's length and asks the runner to learn a legend of line styles; a chip carries the word. Colour is never the only signal: each chip carries its own word and an sr-only description. |
| `ConsistencyBanner` | `role="alert"` when something failed, `role="status"` when nothing did — the all-clear line is not decoration; on a clean extraction it is the only feedback that the checks ran at all. Its footer states the posture: hints from arithmetic, not rules — save anyway if the screenshots say otherwise. Rendered only once `draft.durationSec !== null`: an all-null manual draft has no sums to compare, and four passes of nothing would be a false all-clear. |
| `ScreenshotStrip` | The evidence, always on screen and first — a review screen with no screenshot on it is proofreading from memory. `SheetSource` is R-45's provenance resolver: by SECTION, not per field — the photo whose `kind` matches the section leads; when it does not exist (the common one-screenshot upload), **the fallback is every photo that does exist**, because a reviewer with something imperfect to check against is strictly better off than one looking at a blank panel. The strip's 104 px tile width is a documented bug fix (the image and its caption disagreed about width; the caption always won); the sheet's thumbnails are deliberately NOT squared — that panel exists to be read a number off, and cropping half of it away would remove the thing it exists to show. |
| `RawResponseDisclosure` | The vendor's untouched reply, never auto-opened, and **nothing on the screen is ever read from it**. Every rendered value came from the Zod-validated `parsedSession`; the disclosure shows what the model actually said, provenance-guard differences included. A field visible here but not on the screen was discarded because no uploaded screenshot could have contained it — that is the disclosure working, not a bug. `safeStringify` caps at 40,000 chars and catches cycles, so a gigantic vendor payload cannot take the screen down. |
| `RetryExtraction` | "Read these screenshots again" — re-POSTs `extractions.blob_urls` verbatim (that column IS the record of what was sent; the route re-validates every field regardless — a blob URL is an SSRF primitive if ever taken on trust), creating a NEW audit row rather than overwriting. It asks first, inline (not `window.confirm`, which on iOS reads as an error), because a vision call is ~33 s and costs real money while hand-correcting is faster, free and certain — and it is shown only pre-commit: once a run exists, a second extraction has nothing to attach to. |

`copy.ts`'s `commitStatusLine` is the sticky bar's one sentence, and its history is the
package's lesson in testability: it shipped saying **"1 check still disagree"** for as long as
it did because it was a private JSX component in a `'use client'` file — unreachable from this
repo's node-environment vitest, riding out on the front page of a screen whose entire purpose is
careful reading of small numbers. It is now a pure function returning a string, and any future
count-and-verb sentence here keeps the WHOLE clause (noun and verb) inside the ternary, so
singular and plural are two complete sentences that cannot drift apart.

## Dataflow

```
POST /api/extract (F04) → extractions row (status ok/repaired/failed, blob_urls, raw_response)
        │
app/x/[extractionId] ── loadExtractionReview ── ReviewContext { baseline = hydrateDraftFromExtraction }
app/r/[id]/edit      ── loadRunEdit          ── ReviewContext { baseline = draftFromRun }
        │
ReviewScreen (useActionState) ── ReviewClient ── keystroke: checkDraft(draft) → banner/chips/jumps
        │ submit {extractionId, runId, draft}
commitReviewAction ── requireUserId ── commitReview
        │            ├─ 1 baseline re-read (loadBaseline)
        │            ├─ 2 CommitReviewEnvelopeSchema → ReviewDraftSchema (the wall)
        │            ├─ (already-committed? → ok, the run they already have)
        │            ├─ diffCorrections(baseline, draft, checkIdFor ← baseline's failing checks)
        │            ├─ 3 commitExtractedRun / applyRunCorrections   ← the ONLY runs writer
        │            ├─ 4 recordCorrections (append; failure logged, never raised)
        │            └─ 5 onRunCommitted (records → badges; failure never fails the save)
        ├─ after(): emitRunCommitted (only isNewRun) — Nina names the records and badges
        ├─ revalidatePath /, /trends, /me, /r/<id>
        └─ redirect /r/<runId>          ← never returns to the screen on success
```

## Dependencies

**External:** `zod` (the wall), `next/cache` (`revalidatePath`), `next/navigation` (`redirect` —
in the action only), `next/server` (`after`), React (`useActionState`, `useState`/`useMemo` in
the client tree). No other third-party code touches this surface.

**Internal (lib/review →):** `@/lib/db/queries` — `getExtraction`, `getRunDetail`,
`getRunIdForExtraction`, `listExtractionPhotos`, `commitExtractedRun`, `applyRunCorrections`,
`recordCorrections`, `DuplicateRunError`, `NotFoundError` (the persistence layer is documented
in `lib/db/.workflows/package_readme.md`; this package is its most consequential consumer);
`@/lib/derived/invalidate` — `onRunCommitted` (`RunChangeEvent`); `@/lib/nina/proactive` —
`emitRunCommitted` (the one edge into the chat half; Nina reacts to a run becoming real);
`@/lib/auth/requireUserId`; `@/lib/date/ranges` (`todayInJakarta`, `isValidDateISO`, `DateISO` —
the Jakarta day model); `@/lib/schema/extractedSession` (`ExtractedSession`, the mirrored
shape); `@/lib/db/schema` (`CorrectionEvent`, `ExtractionCorrections`, `RunIntent`, `RunSource`,
`ExtractionBlobRefRow`); `@/lib/format` (display spellings); `@/lib/badges/types` and
`@/lib/records/types` (the earned/moved key types); `@/lib/llm/runExtractionJob`
(`RawResponseColumn`, type-only); `@/lib/id` (`isValidId`, in the pages).

**Internal (components/review →):** `@/components/ui` (the client-safe barrel: `Button`, `Card`,
`CONTROL_CLASS`), `@/components/ui/Sheet`, `@/components/ui/PhotoViewer` (the ONE full-screen
overlay — see Reverse dependencies), `@/lib/cn`, `@/lib/extract/constants`
(`SCREEN_KIND_LABEL`/`ScreenKind`), `@/lib/schema/extractionResult` (`errorCopy`,
`ExtractAcceptedResponse`) — plus everything from `lib/review` listed above.

**Direction rule:** `lib/review` never imports `components/`. The one channel from the checks to
the screen is data — `CheckResult.fieldPaths` — and the component decides what a path means
(jump targets the block that owns it).

## Reverse dependencies

Importers of `lib/review`, in full (2026-09-12):

- **`app/x/[extractionId]/page.tsx`** and **`app/r/[id]/edit/page.tsx`** — the only production
  consumers of `loadReview` and `components/review`. The review screen is not mounted anywhere
  else, and that is by design: it is the wall's front, and mounting it against a baseline no
  loader resolved would be a hole in rule 1.
- **`components/review/*`** — nine of the twelve components import the pure modules
  (`checks`, `copy`, `draft`, `inputs`, `schema` types). `ReviewScreen` is the ONLY component
  that imports `lib/review/actions` (the `'use server'` module), keeping that edge in one file.
- **The eight `tests/review.*.test.ts` suites** — see Tests.

Source-reading suites (read the files as TEXT — they hold cross-cutting contracts, not unit
assertions): `tests/ui.photoViewer.test.ts` and `tests/nina.chatPhoto.test.ts` both scan
`components/review/ScreenshotStrip.tsx` (with the share page's inclusion list and the public
page) to assert there is **exactly one full-screen image overlay** — `PhotoViewer` lives in
`components/ui`, moved out of this package precisely so the share page could use it; adding a
second overlay implementation here breaks both suites. `tests/pwa.install.test.ts` cites the
strip in prose as one of only two surfaces that pad `env(safe-area-inset-top)`, which is why
`APPLE_WEB_APP.statusBarStyle` must stay `'default'` — flipping the status bar to translucent
slides page titles under the clock until every fixed top element pads itself.

**The twins, and why they are not a duplication to collapse:** `components/ui` has its own
read-only `SplitsTable` and `ZoneBar` (F08's presentations of committed data); these are F05's
**editable** controls (sheets per row, draft state, correction chips). Merging them would put a
review-only concern (`editedPaths`, `onChange`) into the run detail page and a display-only
concern (R-30's pace bar) into the review screen. The barrel's comment says the same; the
`review-yagni` session's compiler sweep confirmed both sides of each twin are live.

**Prose mentions that are NOT imports:** `components/ui/index.ts` (the twins note),
`components/ui/PhotoViewer.tsx` (its "why it lives here" history),
`components/share/PhotoInclusionList.tsx` (the same `<img>` eslint waiver), and
`lib/share/copy.ts:86`, which still names `components/review/SheetSource` — a component that no
longer exists under that name — recorded as a stale-comment follow-up by the `review-yagni`
session, deliberately out of any review-scoped sweep's line.

## Concurrency

Request-scoped async TypeScript, one user, one form — no threads, no locks. The four things
worth knowing:

- **The double-submit guard is `useActionState`**: React will not run a second action while the
  first is in flight.
- **The two-tabs guard is the already-committed short-circuit**, not an error: whoever commits
  second is answered with the run they already have.
- **The unique-start-time guard is `DuplicateRunError`**, surfaced as a `duplicate` state with a
  link to the existing run — the R-5 index is the database's own opinion and is allowed to speak
  last.
- **`after()` work outlives the response** and must never throw into it: Nina's reaction is
  awaited inside its own try/catch, and its idempotence (the message row keyed on the run) makes
  a retried `after()` cost nothing.

## Error handling

No custom error types and no sentinel errors are defined here; this package *classifies* the
database layer's two (`DuplicateRunError`, `NotFoundError`) into rendered states. The failure
philosophy is degradation by consequence:

| failure | what happens | why |
|---|---|---|
| envelope fails validation | `'error'` state, generic message | the payload could not be read at all |
| draft fails the wall | `'error'` state + `fieldErrors` by dot-path | a validation error is not an exception; it is the normal outcome of a human typing |
| run not found / not owned | `'error'` "could not be found" | ownership-in-the-read: no id probing |
| duplicate start time | `'duplicate'` state + existing run id | the run they already have is the answer |
| corrections log write fails | `console.error`, the run stays saved | measurable signal lost beats a log describing a nonexistent run |
| `onRunCommitted` fails | `console.error`, earned/moved stay `[]` | invalidation must never roll back a human's confirmed save (plan §7.3) |
| Nina's reaction fails | `console.error` inside `after()` | the run itself is saved; the reaction was never promised |
| malformed payload for `occurredOnOf` | `''` | say nothing about the date rather than throw inside `after` |
| vendor payload un-stringifiable / huge | truncated / stringified fallback at 40,000 chars | a disclosure must not take the screen down |
| retry fetch fails | inline error text, pending cleared | the reviewer keeps their draft either way |

`CommitReviewState` (`idle | error | duplicate`) is the whole contract between action and
screen; `IDLE_COMMIT_STATE` is its shared starting value.

## Performance

The checks re-run on every keystroke — four arithmetic reductions over at most 60+5 small
arrays, memoized at the `ReviewClient` boundary. Nothing here touches the network except the
commit itself and `RetryExtraction`'s explicit retry; the photos are plain `<img>` (waived from
`next/image` in both this package and the share list: Blob-hosted, arbitrary dimensions, already
compressed to ~55 KB client-side before upload — re-optimising would spend a paid transform
quota for no gain). The vendor disclosure caps its `<pre>` at 40,000 characters and 320 px of
scroll.

## Configuration

None of its own — no env vars, no config files. The two things that look like configuration are
not:

- `maxDuration = 60` on both mounting pages is a **segment config export** and must stay a
  literal (statically analysed; see The two routes).
- The revalidate list in `commitReviewAction` (`/`, `/trends`, `/me`, `/r/<id>`) is the cache
  contract; revalidating a not-yet-existing route is a no-op by design.

## Usage

### Adding a field to the draft

The checklist, in order — this is the map that keeps the mirror honest:

1. **`draft.ts`** — the field on `ReviewDraft` (+ `DraftSplit`/`DraftZone` if nested), and for a
   scalar, its name in `SCALAR_FIELDS`. That one list entry is what makes the diff total for the
   new field the moment it lands.
2. **`schema.ts`** — a primitive (reuse `bpm`/`nonNegInt`/`optionalText`/`clockTime` where one
   fits) and the field on `ReviewDraftSchema`; a cross-field rule goes in the `superRefine`.
3. **The mirror** — if the extractor can produce it, `lib/schema/extractedSession.ts` grows the
   same-named field, `hydrateDraftFromExtraction` copies it, and
   `tests/review.draft.test.ts`'s "the draft type mirrors the extractor field-for-field" block
   is what fails if you forget.
4. **The edit round-trip** — `StoredRunShape` + `draftFromRun` if a stored run must rebuild it
   (and a `runs` column if it persists — which means `toRunInput`, `NewRunInput` in
   `lib/db/queries.ts`, and a drizzle migration; see the migration rules in the root readme).
5. **A place on the screen** — hero if a check can implicate it or it identifies the run;
   `MoreDetails` if it is low-leverage and uncheckable (that rule is written on the component).
   Add the `inputs.ts` parse/format pair for anything typed, `mask`/`deferError` if it is a
   colon field.
6. **Tests** — the wall's accept/refuse rows in `review.schema.test.ts`, the parser's three
   outcomes in `review.inputs.test.ts`, the diff in `review.draft.test.ts`.

### Adding a consistency check

Add the id to `CheckId`'s union (exhaustive — the compiler finds the rest), write the pure
function, register it in `runAllChecks`, and then honour the honesty constraint: `fieldPaths`
names exactly what the check can actually blame. Tolerances get a comment saying what they were
seeded against. If the check can name a field inside `MoreDetails`, force the section open —
the wiring is the controlled `<details>`, one line.

## Gotchas

- **Never catch around `requireUserId()` or `redirect()`** — both signal by throwing
  `NEXT_REDIRECT`; catching them converts navigation into a rendered error state. The actions
  suite pins this by requiring the action's promise to REJECT on success.
- **Never trust the client's `from` values, and never diff an edit against the extraction** —
  both are the same error (rewriting the error profile), one at commit time, one at baseline
  time.
- **`checkIdForFieldPath` runs against the BASELINE's failing checks.** Running it against the
  corrected draft attributes every correction to `undefined` — the check stopped firing when the
  number was fixed.
- **The two-step parse is not a style choice.** One nested parse prefixes every issue path with
  `draft.` and the screen renders none of the errors.
- **Do not "fix" `endTime < startTime`** — midnight-crossing runs are real.
- **Do not require one-or-more splits, and do not allow a partial zone set** — both rules exist
  because of the one-screenshot upload, and both have the reasoning written on them in
  `schema.ts`.
- **`11:83` is a deliberate intermediate state.** The mask must pass through it; `deferError`
  holds the message; refusing the keystroke makes `1:18:36` unreachable.
- **A parse failure must never push `null` up.** `null` is "cleared"; a typo is `invalid`.
  Collapsing them erases a real number silently.
- **Keep the whole count-and-verb clause inside the ternary** in any new `copy.ts` sentence.
  The split version shipped on the front page as "1 check still disagree".
- **Do not jump to a row.** `jumpTo` resolves to blocks on purpose; a check that cannot name a
  row must not scroll as if it could.
- **Do not add a second full-screen image overlay**, and do not inline one into a review
  component — `PhotoViewer` in `components/ui` is the one overlay, and two suites read this
  package's source to keep it that way.
- **Do not merge the review `SplitsTable`/`ZoneBar` with the `components/ui` twins** — editable
  vs read-only is the whole distinction (see Reverse dependencies).
- **`postWorkoutHr` is positional.** Clearing slot 0 leaves a hole; compacting promotes the
  one-minute reading into the end-of-run column and mislabels it everywhere downstream.
- **`source` is stripped from the edit patch.** Re-introducing it from the draft would let a
  correction rewrite a run's provenance.
- **`scan` chips are suppressed on hero fields on purpose** — do not restore them for
  consistency; eighteen identical pills is how a chip becomes invisible.
- **Nothing reads `RawResponseDisclosure`'s content**, and nothing ever should: the differences
  between it and the screen are the provenance guard working.
- **`RetryExtraction` re-validates server-side regardless of where the blob URLs came from** —
  they are re-sent from a database column, but a blob URL is an SSRF primitive if ever taken on
  trust.
- **Nina's reaction fires only on `isNewRun`.** Wiring it to "a commit happened" makes her greet
  every split correction like a finish line.

## Tests

Eight suites under `tests/`, ~2,170 lines (as of 2026-09-12); the same day's follow-up session
measured **197 passing** across these eight plus `tests/derived.invalidate.test.ts`:

| suite | posture | what it actually pins |
|---|---|---|
| `review.checks.test.ts` | pure functions | the golden fixture passes its own review (all four); each check's trip and pass bands; attribution prefix-matching; `isFlagged` |
| `review.draft.test.ts` | pure functions, real hydrators | the year resolver (including last-December-in-January); both baselines; narrow/widen; `flattenDraft` totality; diff (manual = transcript, `Object.is`, added/deleted rows); append-never-overwrite; **the field-for-field mirror** |
| `review.inputs.test.ts` | pure functions | the three-outcome parse contract for all four parsers; the mask (leading-zero drop, cap, idempotence, intermediate states) |
| `review.schema.test.ts` | pure functions | what the wall stops, and what it deliberately lets through; `toRunInput`'s unit conversion and stored-pace rule; `fieldErrorsOf` |
| `review.copy.test.ts` | pure functions | subject/verb agreement at every count; the five sticky-bar states |
| `review.commit.test.ts` | real `commitReview`, DB stubbed | golden/corrected/edit paths; §8 manual; `DuplicateRunError` → duplicate state; order (corrections logged, invalidation tolerated); injectable clock |
| `review.loadReview.test.ts` | queries mocked, **draft hydrators run for real** | baseline provenance split; failed-extraction blank through the same branch; ownership null before any second query; vendor JSON carried by reference |
| `review.actions.test.ts` | `'use server'` module, all Next collaborators mocked | INVARIANT A ordering; redirect THROWS (success = rejected promise); `after()` scheduled-never-awaited; exactly one reaction on `isNewRun`, none on an edit; the four `revalidatePath`s before the redirect; `occurredOnOf`'s malformed-payload contract |

Two structural facts worth keeping: the commit suite drives `commitReview()` **directly, with no
request scope** — which is precisely why `after()` lives in `actions.ts` and not in `commit.ts`
(ruling E3; `after` throws `E468` outside a request scope); and `loadReview`'s suite stubs the
queries but runs `draft.ts`'s hydrators for real, because the mapping IS the feature — stubbing
it would let provenance rot while the suite stayed green. Component-level interaction tests for
`components/review` do not exist yet (the repo's happy-dom component harness postdates this
package); the pure logic the components would otherwise need lives in `lib/review` so it stays
assertable in node.

## Notes

### Charter

Created 2026-09-12 as **one combined readme for both directories** — the surface had been
cleaned, tested and audited but never mapped, and its invariants only hold jointly across the
two halves (the draft's shape is the screen's state AND the wall's schema AND the diff's key
space). The upstream extractor (F04: upload, vision call, provenance guard) and the downstream
readers (F06 records, F08 trends, F09 badges) are documented in their own packages
(`lib/db/.workflows/package_readme.md`, the root readme); nothing here duplicates them. The
`lib/review` side of the Nina edge (`emitRunCommitted`) is described from the review side only;
the chat half lives in `lib/nina/.workflows/package_readme.md`.

### History

- **2026-09-12, `review-yagni` session** (commit `38ac737`): compiler-API export audit of both
  packages — 60 exported declarations across 20 files, one fully-dead symbol deleted
  (`CommitReviewPayload`, a `z.infer` mirror alias), seventeen file-local symbols un-exported.
  What remains exported here is exactly what something outside the file imports; the packages
  were measured clean, and the method's trap list (twin names, comment mentions, barrels,
  multiline imports) is in that session's doc.
- **2026-09-12, `review-followup-cleanup` session** (commits `63bfbf6`, `644ec6c`): removed the
  write-only `changedFieldPaths` passthrough from `RunChangeEvent` (the R-7 gate that computes
  it survives), and wrote the two suites this file's Tests table lists for `loadReview` and
  `actions` — closing the last two coverage gaps in `lib/review`.

### Known gaps, accepted in writing

- `components/review` has no rendered-component (happy-dom) tests; interaction coverage is the
  natural next target, and the mask/`ParsedInput` logic is deliberately kept in pure modules
  until then.
- The check tolerances are seeded against one ground-truth fixture; the tightening mechanism
  (`getExtractionErrorProfile`) exists but has no consumer yet.
- `lib/share/copy.ts:86` cites the no-longer-existent `components/review/SheetSource` component
  (prose only; a stale-comment fix outside every review-scoped sweep's line so far).
