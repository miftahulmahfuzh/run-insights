# Token-Maxxing Session — 2026-09-11: Nina Message-Actions-Sheet Tests

> **Fourth token-maxxing session on this date.** The first session
> ([doc](./2026-09-11-nina-chat-component-tests.md)) stood up React
> component-testing infra from zero (RTL + happy-dom) and covered
> `ChatScreen.tsx` + `NinaSidebar.tsx`. The second session
> ([doc](./2026-09-11-nina-composer-bubble-list-tests.md)) continued that
> line onto `Composer.tsx`, `MessageBubble.tsx`, and `MessageList.tsx`. The
> third session ([doc](./2026-09-11-admin-folder-actions-tests.md))
> corrected a false-positive "zero coverage" survey of `components/admin`
> and closed a real gap in `lib/admin/ninaAlbumActions.ts`'s six
> folder-maintenance Server Actions. This session picked up the one gap
> named by all three prior docs' follow-ups and acted on by none of
> them: `MessageActionsSheet.tsx`.

## 🎯 Achievement / End Result
- **Goal of the burn:** Close the most repeatedly-deferred continuation gap
  in the day's nina-component-test line — `MessageActionsSheet.tsx` — before
  it could be deferred a fourth time, and confirm via a Step-3 import-grep
  survey that no other package-level gap was hiding behind a stale filename
  match.
- **Concrete changes:**
  - `components/nina/MessageActionsSheet.test.tsx` — new, 30 tests, 440
    lines.
  - No infra changes needed — the RTL/happy-dom setup from session 1
    covered the need directly, and the real (unmocked) `lib/nina/edit.ts`
    decision functions were exercised as-is, matching the pattern sessions 1
    and 2 validated.
- **Real value delivered:**
  - Closed the exact gap named three times in a row and acted on zero
    times: `MessageActionsSheet.tsx` (369 lines) governs every menu/edit/
    retry/resend/delete interaction a user has with a sent or failed nina
    chat message, and had no test coverage at all going into this session.
  - Covered a genuine correctness-sensitive decision surface: the
    retryable-vs-non-retryable failed-message distinction (a message with
    photos attached must show explanatory text instead of a retry button
    that would silently drop the photos on resend), the three distinct edit
    refusal shapes (empty-text-on-text-message refuses with "delete
    instead," over-cap refuses locally with an exact character-count
    sentence, and empty-text-on-image-only-message is explicitly allowed
    through), and a pending-guard that disables the action button for the
    duration of an in-flight async call rather than allowing a double-fire.
  - Proved the suite has real detection power via two deliberate,
    immediately-reverted mutations (see Verification below) — not just
    shape-matching against props.
  - Kept the survey method (import-grep against actual test files, not
    filename-matching) that session 3 corrected, and re-confirmed
    `lib/admin/*.ts` is fully covered under that method before ruling out
    an admin-side candidate for this session's menu.
- **Branch:** `token-maxxing-2026-09-11` (reused, same as sessions 1–3).
- **Merge status:** on branch — merged to main as a separate step after this
  doc was written (see Appendix for the merge commit once available).
- **Approx token burn:** medium — a subagent-run Step 2 recall across three
  prior docs, a Step 3 import-grep survey re-confirming admin coverage, a
  5-item Step 4 menu, then close tracing of `MessageActionsSheet.tsx`'s
  props/callbacks and `lib/nina/edit.ts`'s decision functions before writing
  30 tests, plus two deliberate-breakage verification passes and a full gate
  run. 🔥

## Context & Motivation

This is the **fourth** token-maxxing session on 2026-09-11. Step 2 dispatched
a subagent to read all three prior docs and bucket their contents into
`completed` vs `continuation-candidates`:

- **Completed** (from the read): happy-dom/RTL infra; `ChatScreen` +
  `NinaSidebar` tests; `Composer` + `MessageBubble` + `MessageList` tests; the
  six folder-action Server Action tests in `ninaAlbumActions.ts` — all merged
  to main.
- **Continuation-candidates** (from the read): `MessageActionsSheet.tsx`
  tests (named as a follow-up in all three prior docs, picked up in none);
  the 5 remaining untested `ninaAlbumActions.ts` exports; a `lib/nina` YAGNI
  hunt across `queries.ts` / `persona.ts` / `actions.ts`; an architecture doc
  synthesizing 33 `F0x` plan docs; `ChatScreen`'s stubbed photo-viewer path.

Step 3 re-ran the corrected survey method session 3 established — grep which
files each `tests/*.test.ts` / `components/**/*.test.tsx` actually
*imports*, not filename-matching or co-location assumptions — specifically to
check whether `lib/admin/*.ts` had any coverage left to close. It confirmed
every file in `lib/admin` is already imported by some `tests/admin.*.test.ts`
suite (i.e., fully covered), while `components/admin` still has real,
larger gaps (the FileExplorer subsystem and several standalone components)
that were not this session's pick.

**Step 4 menu (5 candidates):**

1. 🔁 `MessageActionsSheet.tsx` component tests — continues the nina
   component-test line; named 3× as a follow-up, acted on 0×. **PICKED.**
2. 🔁 5 remaining untested `ninaAlbumActions.ts` Server Action exports
   (`describeNinaAvatarAction`, `setCurrentNinaAvatarAction`,
   `ensureNinaAvatarDescriptionAction`, `registerNinaAvatarsAction`,
   `listNinaAlbumManifestAction`) — continuation from session 3; two of the
   five need vision-client/`after()` mocking.
3. 🆕 Admin FileExplorer subsystem component tests (`FileExplorer.tsx` + 7
   `explorer/` files, ~3.8k lines, zero tests) — fresh, larger scope, no
   existing coverage.
4. 🆕 `lib/nina` YAGNI hunt in `queries.ts` (4,542 lines) / `persona.ts`
   (1,771 lines) / `actions.ts` (1,667 lines) — fresh, deferred three times
   already, judged riskier to attempt without more surrounding test
   coverage first.
5. 🆕 Architecture doc synthesizing 33 `F0x` plan docs — fresh, docs-only,
   lower burn.

**Why #1 won.** It is the highest-value continuation on the menu: a real,
repeatedly-deferred gap (named in three consecutive prior docs' follow-up
sections and acted on in none of them) on a well-scoped, appropriately-sized
component (369 lines — big enough to matter, small enough to cover
thoroughly in one session). It also matches the exact pattern — real,
unmocked `lib/nina/edit.ts` decision functions exercised through RTL — that
sessions 1 and 2 already validated as the right shape of test for this
component family, so there was no infra risk or new pattern to invent.

**Why #2 was passed over.** It's a legitimate continuation too, but two of
its five remaining actions need vision-client/`after()` mocking that would
add setup complexity beyond what a single session should try to absorb on
top of a fresh survey; deferring it again (a second time, this time with the
mocking need explicitly named) was judged better than rushing it.

**Why #3 was passed over.** Real and large, but ~3.8k lines across 8 files
is a scope better suited to its own `/analyze`-sized session than a single
token-maxxing burn; picking it now would likely produce partial,
shallow coverage rather than a complete pass.

**Why #4 was passed over (again — 4th deferral).** Same reasoning as
session 3: removing/simplifying code with no regression net in an area with
minimal test coverage gets the safety-net ordering backwards. Still true
this session; still deferred.

**Why #5 was passed over.** Valid and low-burn, but a docs-only pass would
under-use the session relative to closing a real, aging code gap that three
prior sessions had already flagged as important.

## What We Did (blow-by-blow)

1. **Step 2 recall.** Dispatched a subagent to read
   `2026-09-11-nina-chat-component-tests.md`,
   `2026-09-11-nina-composer-bubble-list-tests.md`, and
   `2026-09-11-admin-folder-actions-tests.md` in full and bucket their
   content into `completed` vs `continuation-candidates`, producing the
   digest summarized in Context & Motivation above.

2. **Step 3 survey.** Re-ran the import-grep method (not filename-matching)
   against `lib/admin/*.ts` to double-check whether any admin-side gap
   remained after session 3's fix — confirmed every file there is imported
   by some `tests/admin.*.test.ts` suite, i.e. fully covered. Also confirmed
   `components/admin`'s FileExplorer subsystem and several standalone
   components remain real gaps, but scoped them out as menu item #3 (see
   above) rather than this session's pick.

3. **Step 4 menu + pick**, as detailed above — picked
   `MessageActionsSheet.tsx`.

4. **Traced the component and its collaborators before writing any test:**
   - `components/nina/MessageActionsSheet.tsx` (369 lines) — the sheet that
     opens on long-press/tap of a sent or failed message, switching between
     three modes: a confirmed-menu view (Edit/Delete/Resend options), a
     failed-row view (retry-or-explain), and an edit view (textarea +
     Save/Back).
   - `lib/nina/edit.ts` — the real, unmocked decision functions the sheet
     calls into: `canResendMessage` (mine-only gating), the
     `EDIT_MAX_CHARS_MINE` / `EDIT_MAX_CHARS_HERS` character caps, and the
     retryable-vs-non-retryable failed-message classification (a failed
     message with photos attached is non-retryable, since retrying would
     silently drop the photos).
   - The three edit-refusal shapes: empty-text on a text-only message
     refuses locally with "delete instead" copy; over-cap text refuses
     locally with an exact "N characters too long" sentence; empty-text on
     an image-only message is explicitly *allowed* through (there's still
     content — the image — even with no caption).
   - The pending-guard: buttons disable for the duration of an in-flight
     retry/resend/delete/edit-save call, re-enabling only once the promise
     settles.

5. **Wrote `components/nina/MessageActionsSheet.test.tsx` (30 tests)**
   covering:
   - Null-target renders nothing; body-text rendering including the
     empty-body placeholder.
   - Confirmed-menu mode: Edit/Delete labels differ for mine vs Nina's
     message; Resend is shown only when mine, gated through the real
     `canResendMessage`.
   - Failed-row mode: retryable failures show "Send it again" + Delete, no
     Edit/Resend; non-retryable failures (photos attached) show explanatory
     text instead of a retry button that would silently drop them.
   - Retry flow: success closes the sheet; failure shows a refusal and
     keeps the sheet open; in-flight retry disables the button and later
     closes once the call resolves — observed using a manually-controlled
     deferred promise to inspect the async gap directly rather than relying
     on timing assumptions.
   - Resend flow: a `null` resolution closes the sheet; a string resolution
     is displayed verbatim as the refusal (the caller owns that copy, the
     sheet doesn't rewrite it).
   - Delete flow: `true` closes the sheet; `false` keeps it open.
   - Edit flow: prefills the textarea with the current body; `maxLength`
     differs correctly by `EDIT_MAX_CHARS_MINE` vs `EDIT_MAX_CHARS_HERS`;
     Back discards changes without saving; Save on unchanged text closes
     without making a server call; a real edit trims whitespace and
     submits; a failed submit keeps the sheet open; an over-cap edit
     refuses locally with the exact "N characters too long" sentence (had
     to drive this via `fireEvent.change` rather than `userEvent.type`,
     since the textarea's own `maxlength` HTML attribute would otherwise
     truncate typed input before it ever reached the over-cap refusal code
     path — `userEvent.type` respects `maxlength` the way a real browser
     does, which made the over-cap branch unreachable through it); a stale
     refusal message clears on the next keystroke; an empty edit on a
     text-only message refuses with "delete instead" copy; an empty edit on
     an image-only message is allowed through.
   - Subtitle copy differs correctly across menu / failed / edit modes.

6. **Verified the suite has real teeth, via two deliberate mutations —
   each immediately reverted:**
   - Broke the too-long-edit refusal string to the literal `'BROKEN'` →
     the exact-text assertion on the real sentence failed as expected.
   - Short-circuited `canResendMessage` to always return `false` → the
     "Resend shown only when mine" visibility assertion failed as
     expected.
   - Both mutations were made directly in source, observed to fail the
     relevant test, and restored immediately after — confirmed via
     `git diff --stat` showing no residual change before continuing, and
     only the new test file was ever staged or committed.

7. **Ran the full local gate, all green:**
   - `npm test` → **190 test files / 4,072 tests passed** (up from 189
     files / 4,042 tests at the end of session 3 — net **+1 file, +30
     tests**).
   - `npm run lint` → 0 errors (4 pre-existing warnings, all in unrelated
     files, unchanged by this work).
   - `npm run typecheck` → clean.

8. **Confirmed a clean stage before committing** — `git status --porcelain`
   showed only the new test file, and committed as a single commit.

## Code / Design Details

**Real, unmocked `lib/nina/edit.ts` decision functions.** Like sessions 1
and 2's component tests, this suite does not mock the module that makes the
actual decisions (`canResendMessage`, the character caps, the
retryable-vs-non-retryable classification). The component is rendered with
real props and the assertions check what the real decision functions
produce through it, so a regression in either the component's wiring or the
decision function itself is visible from this one suite.

**`fireEvent.change` over `userEvent.type` for the over-cap edit case.**
`userEvent.type` simulates real keystrokes against the DOM, which respects
the textarea's own `maxlength` HTML attribute and therefore silently
truncates the exact input needed to trigger the component's own over-cap
refusal logic — the input would already be capped by the browser before the
component's code could ever see the too-long case. `fireEvent.change`
sets the value directly, bypassing that truncation, which is required to
actually exercise the refusal branch at all. This is a load-bearing test
authoring detail: without it, the "over-cap refuses locally with an exact
sentence" test would silently test nothing.

**Deferred-promise control for the in-flight-retry test.** Rather than
asserting on a fixed timeout, the retry-flow in-flight test holds a
manually-created, externally-resolvable promise as the mocked retry
handler's return value, asserts the button is disabled while the promise is
still pending, then resolves it and asserts the sheet closes — giving
deterministic control over the async gap instead of racing real timers.

**Three edit-refusal shapes kept as three separate assertions, not
one.** Empty-text-on-text-message ("delete instead"), over-cap-text (exact
character-count sentence), and empty-text-on-image-only-message (allowed
through) are easy to accidentally conflate in a future refactor — e.g., a
change that makes all empty edits refuse uniformly would silently break the
image-only-message case, which is deliberately excluded from that refusal.
Each shape gets its own explicit test rather than being covered
incidentally by another case.

## Decisions & Trade-offs

- **Picked the 3×-deferred continuation over three fresh candidates.**
  `MessageActionsSheet.tsx` had been named in every prior 2026-09-11 doc's
  follow-ups and picked up by none; letting it go a fourth round felt like
  the wrong trade against a well-scoped, already-validated-pattern
  component sitting right there on the menu.
- **Declined the 5 remaining `ninaAlbumActions.ts` exports (menu #2) this
  time,** specifically because two of the five need vision-client/`after()`
  mocking this session didn't want to absorb alongside a fresh survey and a
  new component suite in the same burn. Recorded explicitly below so it
  isn't silently re-deferred without the reason being visible.
  - **Not full test-driven-development.** Confirmed props/state semantics
  were traced from source *before* any test was written, but tests were
  authored directly rather than red-green-refactor per case, matching the
  pattern established in sessions 1 and 2.
- **Declined the admin FileExplorer subsystem (menu #3) as too large for
  one session** — flagged instead as a strong candidate for a future
  `/analyze`-sized session given its ~3.8k-line, 8-file scope, rather than
  attempting a shallow partial pass here.
- **Declined the `lib/nina` YAGNI hunt (menu #4) for the fourth time in a
  row,** for the same reason as before: removing code with no regression
  net ahead of more coverage in that area is out-of-order risk.
- **Declined the architecture doc (menu #5)** as lower-value relative to
  closing a real, aging code gap versus writing documentation this burn.
- **Used `fireEvent.change` instead of `userEvent.type` for the over-cap
  case** — a deliberate exception to this repo's usual RTL-idiom preference
  for `userEvent`, made only where `userEvent`'s browser-accurate `maxlength`
  handling would make the target code path unreachable.

## Follow-ups & YAGNI notes

- **Still open:** 5 remaining untested `ninaAlbumActions.ts` exports —
  `describeNinaAvatarAction`, `setCurrentNinaAvatarAction`,
  `ensureNinaAvatarDescriptionAction`, `registerNinaAvatarsAction`,
  `listNinaAlbumManifestAction`. The last two likely need vision-client/
  `after()` mocking, which is why they were deferred again this session.
- **Still open:** Admin FileExplorer subsystem (`FileExplorer.tsx` +
  `explorer/{thumbnail,model,PhotoDescription,useFolderUpload,UploadQueue,
  FolderTree}`) — a real, larger gap; good candidate for a future session,
  possibly warranting `/analyze` given its size (~3.8k lines across 7+
  files).
- **Still open, deferred a 4th time:** `lib/nina` YAGNI hunt across
  `queries.ts` (4,542 lines) / `persona.ts` (1,771 lines) / `actions.ts`
  (1,667 lines).
- **Still open:** architecture doc synthesizing 33 `F0x` plan docs.
- **Deliberately NOT a candidate (by design, not oversight):**
  `components/admin/explorer/dropWalk.ts` — its own header explicitly
  disclaims testability (browser-only `DataTransferItem`/
  `FileSystemDirectoryReader` APIs, no decisions made), as already recorded
  in session 3's doc.
- **Survey-method note, reconfirmed this session:** check test coverage by
  grepping which files each `tests/*.test.ts` / `components/**/*.test.tsx`
  actually imports, not by filename-matching or co-location assumptions —
  both gave false negatives in session 3 before the import-grep corrected
  them, and this session re-applied the corrected method rather than
  reverting to the cheaper, wrong one.

## Appendix

**Key commands run this session:**
```bash
npm test
npm run lint
npm run typecheck
git diff --stat        # after each deliberate-breakage mutation, to confirm revert
git status --porcelain # before commit, to confirm a clean stage
```

**Gate results:**
- Before this session (end of session 3, 2026-09-11): 189 test files /
  4,042 tests passing.
- After this session: 190 test files / 4,072 tests passing — net **+30
  tests** in 1 new file, `components/nina/MessageActionsSheet.test.tsx`.
- `npm run lint`: 0 errors, 4 pre-existing warnings (unrelated files,
  unchanged).
- `npm run typecheck`: clean.

**Deliberate-breakage verification (both reverted immediately after
observing the expected failure, confirmed via `git diff --stat` showing no
residual change):**
1. Broke the too-long-edit refusal string to `'BROKEN'` → the exact-text
   assertion failed as expected.
2. Short-circuited `canResendMessage` to always return `false` → the
   "Resend only when mine" visibility assertion failed as expected.

**Commit (on `token-maxxing-2026-09-11`):**
```
f2e62da test(nina): cover MessageActionsSheet's menu, retry, resend, edit and delete paths
```
1 file changed, 440 insertions(+) — `components/nina/MessageActionsSheet.test.tsx`.

**Branch:** `token-maxxing-2026-09-11` — merged (commit `ae749f6`).
