# Token-Maxxing Session — 2026-09-12: UI/Share Comment-Citation Polish

> A **WORKER** session (worker `ui-share-polish` of coordinator
> `tokenmax-orch-2026-09-12`; idea pre-assigned, as with all of that fan-out's
> workers — no solo menu). The assignment was deliberately the smallest of the
> day's batch: close two small named leftovers the same-day YAGNI sessions had
> recorded in their follow-up lists instead of acting on — the pre-existing
> `react/no-unescaped-entities` pair at `components/ui/Card.test.tsx:90`, and
> the stale comment at `lib/share/copy.ts:86` citing a "nonexistent"
> `components/review/SheetSource`. Both leftovers trace to earlier sessions'
> docs: the first named three times by the ui-primitives-yagni session (left
> there as "out of mandate"), the second left by the review-yagni session as
> "first candidate for whatever session next touches share copy."

## 🎯 Achievement / End Result
- **Goal of the burn:** Close the two leftovers left behind by the day's
  earlier YAGNI sweeps — one lint pair in a test file, one stale path
  citation in a doc comment — with the smallest safe diff a parallel fan-out
  allows.
- **Concrete changes:** commit `95c99e1` ("docs(share): repair two drifted
  citations in lib/share/copy.ts comments") — **1 file, +8/−8**, every changed
  line inside a `/** */` doc-comment block of `lib/share/copy.ts`. Zero
  runtime effect by construction.
- **Real value delivered:**
  - The naming session's premise was **falsified, not just cleaned up**:
    `SheetSource` is NOT a nonexistent component (as the review-yagni doc
    records it, twice) — it is a live export at
    `components/review/ScreenshotStrip.tsx:129`, imported and rendered by
    `SplitsTable.tsx:238` and `ZoneBar.tsx:211`. The drift was in the
    citation's *form* (a symbol written in path form:
    `components/review/SheetSource`), not in the world. Anyone executing the
    review-yagni doc's verifier-trap list would have drawn the wrong
    conclusion; this doc is the correction.
  - The keep-in-sync warning was **re-verified true and kept, now findable**:
    `ScreenshotStrip.tsx:145` renders the byte-identical `"tap to zoom"` that
    `copy.ts`'s `PHOTO_ZOOM_HINT` holds, so the warning the comment carries is
    real — it just pointed at something unfindable.
  - A **second, un-named same-class defect** caught by the verification pass:
    `copy.ts` line 7 cited `app/s/[token]/copy.ts`, a path that does not
    exist — the public copy module has lived at
    `app/(public)/s/[token]/copy.ts` since the f11 route-group layout
    (`50e03ff`). Both citations repaired in one pass.
  - Half the assignment was **avoided honestly**: the coordinator messaged
    mid-flight that origin/main had moved and `41cbed7` already fixed the
    Card.test.tsx:90 pair. Verified against the actual commit diff before
    accepting (the hunk is exactly `7'22"` → `7&apos;22&quot;`) — so the
    session skipped it as done upstream rather than re-fixing it into a merge
    collision.
  - A clean **negative result** recorded: a sweep of every backticked
    path-like reference in `lib/share/copy.ts` finds no other unresolved
    citation.
- **Branch:** `token-maxxing-2026-09-12-ui-share-polish`
- **Merge status:** merged (commit `5d168da`)
- **Approx token burn:** moderate, and deliberately so — the assignment was
  two comment lines, and the burn went almost entirely into verification
  archaeology (reading the upstream commit's diff, a symbol census with all
  import sites, `ls`-checking both cited paths, sweeping the file's remaining
  backtick refs) rather than into lines changed. That ratio is the point: the
  small sessions are where the verification discipline pays for itself, because
  this one caught a falsified premise *and* an un-named second defect in a
  16-line diff. 🔥

## Context & Motivation

Two prior sessions produced these leftovers as recorded follow-ups:

1. **`Card.test.tsx:90`** — the ui-primitives-yagni session (doc:
   `2026-09-12-ui-primitives-yagni.md`) hit the pre-existing
   `react/no-unescaped-entities` pair on its changed files, correctly left it
   alone as outside its mandate (`components/ui` source only, and this was a
   test file's JSX text), and named it in three places as the known remaining
   lint debt.
2. **`lib/share/copy.ts:86`** — the review-yagni session (doc:
   `2026-09-12-review-yagni.md`) listed it as verifier-trap #2: a comment
   mention that keeps a "dead" symbol alive on the strength of a sentence
   about it, and left the one-line fix as a follow-up because `lib/share` sat
   outside its `lib/review` + `components/review` fence.

The coordinator batched both into one small polish idea and handed it to a
worker — the right shape for a fan-out slot: tiny, self-contained, and
unlikely to collide with the day's other workers.

What neither the coordinator nor the naming session knew: the second
leftover was misdiagnosed, and the file held a second bad citation nobody had
named. Both surfaced because the session verified the premise before editing
instead of trusting the follow-up's framing.

## What We Did (blow-by-blow)

1. **Assignment received.** Two leftovers: the Card.test.tsx:90 eslint pair
   and the copy.ts:86 stale citation.

2. **Mid-flight narrowing from the coordinator.** Partway through, the
   coordinator relayed that origin/main had moved — user-pushed commit
   `41cbed7` ("fix(ci): restore green CI — prettier formatting and two lint
   errors") — and that it already fixed the Card.test.tsx:90 pair. Per
   worker discipline, the message was treated as a claim to verify, not
   evidence: `git show 41cbed7 -- components/ui/Card.test.tsx` confirmed the
   hunk is exactly the named pair — `7'22"` → `7&apos;22&quot;` at line ~90,
   in a commit otherwise about CI formatting and two react-hooks/globals
   errors in test probes. Claim verified against ground truth; that half was
   skipped as done upstream.
   - Note for the record: this worker branch forked *before* `41cbed7`, so
     the local working tree still shows the raw `7'22"` pair in Card.test.tsx.
     That is expected and correct — the coordinator's merge brings the
     upstream fix; a worker "re-fixing" it on this branch would produce a
     conflicting identical-intent hunk at merge time.

3. **Verified the copy.ts:86 premise before editing — and falsified it.**
   The follow-up (and the review-yagni doc at line 164) said `SheetSource`
   "no longer exists as a component." A repo-wide grep said otherwise:
   `export function SheetSource(...)` at
   `components/review/ScreenshotStrip.tsx:129`, imported by
   `SplitsTable.tsx:20` and `ZoneBar.tsx:13`. The symbol is alive with two
   consumers. What rotted was the citation's *form*: the comment wrote the
   symbol as `components/review/SheetSource` — path-shaped, unresolvable,
   unfindable by anyone who tried to open the file it seems to name.

4. **Re-verified the comment's underlying claim.** The comment warns that
   `PHOTO_ZOOM_HINT` is "worded identically to the hint" SheetSource shows.
   `ScreenshotStrip.tsx:145` renders the literal `tap to zoom`;
   `PHOTO_ZOOM_HINT = 'tap to zoom'`. Byte-identical today. So the
   keep-in-sync warning is *true and worth keeping* — the fix was to make it
   findable, not to delete it as noise about a dead thing.

5. **Swept the rest of the file's citations — found a second defect.** While
   enumerating every backticked path-like reference in `lib/share/copy.ts`:
   line 7 cites `app/s/[token]/copy.ts`. `ls` on that path fails; the module
   actually lives at `app/(public)/s/[token]/copy.ts` — it moved under the
   `(public)` route group with the f11 share feature (`50e03ff`, "one link,
   no account, and a revoke that reaches the images too"). Same class of
   drift as line 86, same file, and nobody had named it.

6. **Fixed both citations in one pass.** Line 7 now cites
   `app/(public)/s/[token]/copy.ts`; line 86 now reads "the hint `SheetSource`
   in `components/review/ScreenshotStrip.tsx`" — symbol name plus its real
   file. The surrounding prose survived verbatim except for reflow to
   prettier's line width; the diff is 8 lines out, 8 lines in, all inside
   `/** */` blocks.

7. **Gates.** `npx prettier --check lib/share/copy.ts` passes (which also
   proves the edited comment blocks still parse as the file's doc comments);
   both corrected citations `ls`-verified to exist on disk; the full
   backtick-ref sweep re-run clean — no other unresolved path-like citation
   remains; `git show --stat 95c99e1` confirms exactly one file touched.

8. **Committed** as `95c99e1` with a body that records the upstream-skip
   decision, both fixes, and the verification evidence — then reported to the
   coordinator.

## Code / Design Details

The complete semantic diff (minus prettier reflow) is two citations:

**Line 7 — file-path citation rotted by a route-group move:**

```diff
- * The public page's own strings live in `app/s/[token]/copy.ts` and this file is never imported
+ * The public page's own strings live in `app/(public)/s/[token]/copy.ts` and this file is never
+ * imported from there: ...
```

(`app/s/[token]` does not exist on disk; `app/(public)/s/[token]/copy.ts`
does. The parenthesized route group is invisible to URLs but very visible to
anyone `ls`-ing a cited path.)

**Line 86 — a symbol cited in path form, fixed to symbol + real file:**

```diff
- * Worded identically to the hint `components/review/SheetSource` already shows, so the two places
+ * Worded identically to the hint `SheetSource` in `components/review/ScreenshotStrip.tsx` already
+ * shows, ...
```

The verified ground truth behind the second fix:

- `components/review/ScreenshotStrip.tsx:129` —
  `export function SheetSource({ photos, section }: ...)`
- `components/review/SplitsTable.tsx:238` — `<SheetSource photos={photos} section="splits" />`
- `components/review/ZoneBar.tsx:211` — `<SheetSource photos={photos} section="heartrate" />`
- `components/review/ScreenshotStrip.tsx:145` — renders `<span ...>tap to zoom</span>`
- `lib/share/copy.ts` — `export const PHOTO_ZOOM_HINT = 'tap to zoom'`

The interesting design fact this session confirmed about the *naming*: the
review-yagni session classified this comment as verifier-trap #2 ("comment
mentions that look like usage") and concluded the symbol was dead. Both halves
of that were half-right: the comment IS a prose mention that confuses naive
liveness greps, but the symbol it names is alive — the trap is real, the
example was misread. The corrected citation (symbol + file) still reads as
prose, so the trap's *existence* in the file is unchanged; what changed is
that a human following the citation now lands somewhere real.

## Decisions & Trade-offs

- **Verify-then-accept on the mid-flight narrowing.** A coordinator message
  is a claim, not evidence. Reading `41cbed7`'s actual diff cost one command
  and converted "the coordinator says it's fixed upstream" into "the hunk is
  exactly the named pair." The skip decision is only safe if the claim is
  true — and per the worker's own memory rules, mid-set upstream moves are
  exactly where assumption-based skips go wrong.
- **Keep the keep-in-sync comment; repair the pointer.** Deleting it would
  have been defensible if the claim were dead (it warned about a "nonexistent"
  component). But the claim re-verified true — two literals that must not
  drift, drifting-guarded only by a sentence. The right minimal fix makes the
  sentence findable. The *real* guarantee is the follow-up below, and it was
  deliberately not taken.
- **Fix the un-named line-7 citation in the same pass, not a second commit.**
  Same defect class, same file, same zero-runtime risk profile; a second
  commit would be ceremony. The scope expansion is honest and bounded: it is
  the same class of fix the assignment named, discovered by the verification
  the assignment implied, not a new direction.
- **Comment-only, one file — maximally collision-safe.** In a parallel
  fan-out the cheapest way to be a good sibling is to touch lines nobody else
  has a reason to touch. `lib/share/copy.ts` was last touched by the
  profile-share-yagni worker (already landed); a comment-block-only diff
  carries zero semantic merge risk even if a textual hunk overlaps.
- **No rewording beyond the citations.** The prose arguments (owner-vs-public
  copy separation; the two-taps-one-phrase rationale) survived verbatim —
  only the pointers were wrong.

## Follow-ups & YAGNI notes

- **The real guarantee (deferred deliberately):** import `PHOTO_ZOOM_HINT`
  from `lib/share/copy.ts` into `ScreenshotStrip.tsx` and render it, instead
  of hardcoding `"tap to zoom"` at line 145. That makes drift *impossible*
  rather than commented-about, and the comment's warning could then shrink to
  a note. Left out because it touches a component render path in a fan-out —
  exactly the collision territory worker discipline avoids — and because it
  exceeds the named leftover. First candidate for whatever session next
  touches `components/review` render code.
- **`PhotoViewer.tsx` doc comments refer to `SheetSource` by bare symbol
  name** — accurate as written (the symbol exists; a bare-name mention inside
  the same directory needs no path). No action; noted only because the sweep
  passed over it.
- **Branch-fork note:** this branch forked before `41cbed7`, so its local
  `Card.test.tsx` still shows the raw `7'22"` pair. Do not "fix" it here —
  the coordinator's merge brings the upstream fix, and a duplicate fix would
  collide with it.
- **Correction for the record:** the review-yagni session's doc (line 164 and
  its follow-up entry) states `SheetSource` "no longer exists as a component."
  Falsified by this session — the symbol is live with two production
  consumers. Anyone citing that doc's verifier-trap examples should read the
  case as *a malformed citation*, not *a dead symbol*.

## Appendix

**The commit:**

```
95c99e1 docs(share): repair two drifted citations in lib/share/copy.ts comments
 lib/share/copy.ts | 16 ++++++++--------
 1 file changed, 8 insertions(+), 8 deletions(-)
```

**Verification commands and their verdicts:**

- `git show 41cbed7 -- components/ui/Card.test.tsx` → the exact
  `7'22"` → `7&apos;22&quot;` hunk (upstream fix confirmed; skip justified).
- `grep -n 'SheetSource' components/review/*.tsx` → 1 export site +
  2 import sites (liveness census).
- `ls 'app/(public)/s/[token]/copy.ts'` → exists; `ls 'app/s/[token]'` →
  No such file or directory (the drift proven in both directions).
- `sed -n '143,147p' components/review/ScreenshotStrip.tsx` → the literal
  `tap to zoom` render at line 145 (the keep-in-sync claim re-verified).
- `npx prettier --check lib/share/copy.ts` → clean (comment blocks parse).
- Sweep of all backticked refs in `lib/share/copy.ts` → no unresolved
  path-like citations remain.
- `git show --stat 95c99e1` → exactly one file.

**Source docs for the two leftovers:**
`docs/token_maxxing/2026-09-12-ui-primitives-yagni.md` (Card.test.tsx:90,
three mentions), `docs/token_maxxing/2026-09-12-review-yagni.md`
(copy.ts:86, verifier-trap #2 and the follow-up entry — including the
premise this session falsified).
