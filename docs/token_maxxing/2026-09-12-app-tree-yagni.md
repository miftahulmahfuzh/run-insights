# Token-Maxxing Session — 2026-09-12: App Tree YAGNI Sweep & Design-Brief Citation Repair

## 🎯 Achievement / End Result
- **Goal of the burn:** The coordinator's assigned idea, verbatim: *"Run a YAGNI/dead-code
  sweep across app/ (page/layout tree, excluding app/api which already has test coverage)
  and fix the stale design-brief.md citations in app/layout.tsx, app/admin/layout.tsx and
  app/admin/page.tsx. Why: app/ only ever got a shallow 1-of-7-directories pass and was
  never individually audited."* Worker mode: the idea arrived pre-chosen (one of the
  fan-out under `tokenmax-orch-2026-09-12`, no Step-4 menu — see Context). The
  achievement is double-edged, like the best sweeps: the tree came back **almost entirely
  clean** (knip's only non-api finding was one dead constant; no orphaned routes; no
  TODO markers), **and** the citation audit the idea asked for caught four false or
  stale comment claims — one of them *born wrong*: a citation to a value the design
  brief has never contained in its entire git history.
- **Concrete changes:** One commit, `4f17bfe` "refactor(app): fix false design-brief
  citations; sweep app/ for dead code" — 5 files, +19/−15, comments and one dead
  constant only, zero behavioral change to any route:
  - `app/admin/layout.tsx` — the false citation rewritten to the true attribution.
  - `app/admin/page.tsx` — stale link count fixed (five → four); the true citation
    beside it verified and kept.
  - `app/nina/about/page.tsx` — a provably-dead `eslint-disable-next-line
    react-hooks/purity` directive removed and its argument comment rewritten; the
    rewrite also killed a stale line-range citation.
  - `app/(public)/s/[token]/copy.ts` — dead `SECTION_CHART` deleted (knip's only app/
    non-api finding).
  - `app/r/[id]/page.tsx` — a mis-attributed "90.6%" reworded from brief-quote to
    computed-share-of-the-brief's-example.
- **Real value delivered:**
  - **The born-wrong citation found and fixed.** `app/admin/layout.tsx:21` called the
    470 px column "`docs/design-brief.md`'s iPhone XS Max target". The brief specifies
    **414 × 896**, and `git log -S "470"` across the brief's *whole history* is empty —
    the citation was never true, at any point in the file's life. 470 is the app's own
    phone-column cap (AppShell, TabBar's row, Sheet and the onboarding share it), and
    `components/admin/AdminNavLinks.tsx:160` already spelled that correctly ("a no-op
    at 414 px"). The comment now says what is true: the cap is the app's own, wider
    than the design device, so it is full-bleed at the brief's target and only caps
    anything wider.
  - **A stale count repaired where the drift was proven.** `app/admin/page.tsx:88` said
    "these five links" — the fifth card (`/admin/photos`) was purged by `746e454`
    (image-collection p2). The count is four. The comment's *other* citation, the
    44 pt tap-target minimum, is TRUE (brief:175) and was deliberately left.
  - **A dead suppression directive removed with a real evidence chain, not a hunch.**
    The `react-hooks/purity` disable on `app/nina/about/page.tsx` suppresses nothing —
    eslint itself reports the directive unused — while the *byte-identical* binding in
    `app/nina/jobs/page.tsx` still holds a live flag (proven by a strip-and-lint
    experiment). The plugin version is 7.1.1 both when the directive landed (`3912cec`)
    and at HEAD, so it is not a version story. Removing the directive took the app/
    eslint count from 1 problem to 0.
  - **One genuinely dead constant deleted.** `SECTION_CHART` in the share page's copy
    module — knip's only app/ (non-api) hit — cross-checked per the verifier-traps
    playbook before deleting (details below): the string renders via PaceHrChart's
    `ChartFrame` title, every other `SECTION_*` constant is imported by the share
    page, and no test scrapes the constant.
  - **The coordinator's premise honestly closed.** `app/layout.tsx` was named by the
    assigned idea as a stale-citation suspect, and it is not one: both its
    design-brief citations check out (the XS Max design target at brief:26, and the
    Next 16 claim — verified against the *installed framework*,
    `node_modules/next/dist/lib/metadata/metadata.js:606` emitting only
    `mobile-web-app-capable`). Recorded as verified-true rather than edited; an audit
    that only produces edits is fishing.
  - **All gates green, evidence-based:** prettier clean on all five files; eslint over
    all of app/ 0 problems; `next typegen` + `tsc --noEmit` clean; full vitest sweep
    5,235 passed / 2 failed — both failures the known MemoryTable parallel-load flake
    (per project memory), reproduced clean 20/20 in isolation, with the import graph
    untouched by the diff.
- **Branch:** `token-maxxing-2026-09-12-app-tree-yagni` (worktree
  `tokenmax-2026-09-12-app-tree-yagni`), head `4f17bfe`, one commit on top of `b39c6e5`.
- **Merge status:** on branch, **awaiting coordinator landing** — the worker does not
  merge to main; coordinator `tokenmax-orch-2026-09-12` owns the merge (same contract
  as the other 2026-09-12 worker sessions).
- **Approx token burn:** no meter was read; by shape a mid-weight worker session whose
  spend is evidence-dominant over a tiny diff — a knip pass over the whole page/layout
  tree, an orphan-route census, a TODO sweep, then the citation audit proper: grepping
  each cited source, `git log -S` archaeology across the brief's entire history, a
  strip-and-lint experiment to prove a suppression asymmetry, plugin-version
  archaeology back to the directive's landing commit, and the full gate battery with
  one full-sweep rerun for the flake. The tokens bought verdicts with receipts.
  🔥🔥

## Context & Motivation
The 2026-09-11/12 dead-code campaign has now swept nearly every package in the repo —
lib areas, components directories, scripts, tools, schema — but `app/` had only ever
been touched in passing: the 2026-09-11 components sweep (session
`components-dead-code-a`) covered app/ as one of seven directories in a single pass,
and nothing since had ever audited the page/layout tree on its own terms. Meanwhile the
same-day `docs-design-audit` session (`580863d`) had verified the design docs
themselves and recorded, as follow-ups, that several *code comments citing the design
brief* looked stale — including `app/admin/layout.tsx:21`'s 470 px claim, which it
could not settle from the docs side alone.

The coordinator `tokenmax-orch-2026-09-12` combined both into one worker assignment:
sweep the tree for the dead code a real audit would have caught, and run the citation
audit the docs session had flagged. The two halves share an instrument — both are
"does the claim match the tree?" — and the app/api subtree was explicitly excluded
because it already has dedicated test coverage from today's api-route-tests session
and a different failure profile (routes are load-bearing by construction).

This was a **worker session**: the idea arrived pre-assigned, no menu was generated,
and the branch/worktree were pre-cut by the coordinator. knip (adopted earlier the
same day by `tokenmax-dead-export-tooling`) was available as the mechanical net, which
made the dead-code half a census rather than a hand-rolled hunt — freeing the session's
attention for the citation half, where the actual findings were.

## What We Did (blow-by-blow)
1. **Knip census of app/ (non-api).** One finding total: `SECTION_CHART` in
   `app/(public)/s/[token]/copy.ts` — an unused export. Everything else in the page/
   layout tree came back alive.
2. **Verifier-trap cross-check before deleting `SECTION_CHART`.** Per the
   dead-export-sweep playbook, the deletion was only after three independent checks:
   the human-readable string `'Pace & heart rate'` still renders — via PaceHrChart's
   `ChartFrame` title (`components/charts/PaceHrChart.tsx:28`), so no user-visible copy
   depends on the constant; the share page imports all the *other* `SECTION_*`
   constants from the same module, so this is a dead twin of an inline default, not a
   barrel being starved; and no test or regex scrapes the constant (the knip blind-spot
   class). Deleted.
3. **Orphan-route census and TODO sweep.** Every page in app/ has an inbound reference
   (no route exists that nothing links to); no TODO/FIXME markers anywhere in app/.
   Both negatives recorded so the next sweep starts from evidence.
4. **The citation audit — the session's real center of gravity.** Each comment in the
   tree that cites `docs/design-brief.md` was checked against the cited source:
   - `app/admin/layout.tsx:21` — **FALSE, born wrong.** The brief specifies 414 × 896
     for the iPhone XS Max; `git log -S "470"` over the brief's entire history returns
     nothing, so the 470 px figure was never the brief's. It is the app's own
     phone-column cap, shared by AppShell, TabBar's row, Sheet and onboarding — and
     `AdminNavLinks.tsx:160` already attributed it correctly. Rewrote the comment to
     the true attribution, including the *consequence* the old comment missed: at the
     brief's 414 px device the cap is a no-op, and it only binds on anything wider.
   - `app/admin/page.tsx:88` — **stale count.** "These five links" counted a fifth
     card (`/admin/photos`) that commit `746e454` purged. Fixed to four. The same
     comment's 44 pt citation is true (brief:175) and stays.
   - `app/nina/about/page.tsx:140` — **dead directive.** eslint reports the
     `eslint-disable-next-line react-hooks/purity` unused. To prove the asymmetry is
     real (and not an eslint invocation quirk), a strip-and-lint experiment on
     `app/nina/jobs/page.tsx` — which carries the byte-identical binding and directive —
     showed the rule DOES still flag there. Plugin version checked at both ends:
     7.1.1 when the directive landed (`3912cec`) and at HEAD — not a version story.
     Directive removed; the argument comment rewritten to record the history, the
     evidence, and the honest limit (the *mechanism* of the asymmetry is undiagnosed).
     The rewrite also removed a stale `jobs/page.tsx:41-56` line-range citation — that
     block now lives at ~58-72. `jobs/page.tsx` itself deliberately untouched: its
     directive is live.
   - `app/r/[id]/page.tsx:359` — **mis-attribution.** The comment attributed "90.6%"
     to the design brief as a quote; the brief says "ninety percent" (its example zone
     table computes to 90.6%). Reworded so the number is named as the computed share
     of the brief's example run, not a quotation.
   - `app/layout.tsx` — **verified TRUE, untouched.** Both citations hold: the XS Max
     design target (brief:26) and the Next 16 metadata claim, verified against the
     installed framework's own emitted tags (`metadata.js:606` emits only
     `mobile-web-app-capable`). The assigned idea listed this file as a suspect; the
     audit's finding is that the coordinator's premise over-included it.
   - `app/globals.css` tokens — **kept by contract.** The 25-token mirror relationship
     with `docs/design/tokens.css` means the tokens are design-system vocabulary;
     usage-scanning them as dead code would fight the mirror gate.
5. **One commit for everything** (`4f17bfe`): the sweep's deletions and the citation
   repairs landed together because they are one audit's output — five files, +19/−15,
   comments and one constant, no behavioral change.
6. **Gates.** `prettier --check` clean on the five files; eslint over all of app/ —
   0 problems (down from 1, the removed directive); `next typegen` then
   `tsc --noEmit` clean; full vitest sweep 5,235 passed / 2 failed in
   `components/admin/MemoryTable.test.tsx` add-row tests — the known parallel-load
   flake (project memory), verdict per protocol: reproduced clean 20/20 in isolation,
   and the diff touches no import the tests load.

## Code / Design Details
**The false citation, before and after** (`app/admin/layout.tsx:21`) — the interesting
one, because the fix is an attribution *inversion*, not a number swap. The old comment
used the brief to explain the 470 px column; the truth is the reverse — the app's own
cap, and the brief's device is *narrower* than it:

```diff
- * borrows it invites the runner to tap into it; the 470 px column is `docs/design-brief.md`'s
- * iPhone XS Max target, and the album manager's content is genuinely side-by-side.
+ * borrows it invites the runner to tap into it; and the 470 px column is the app's own phone
+ * cap (`AppShell`, `TabBar`'s row, `Sheet` share it) — wider than the 414 × 896 iPhone XS Max
+ * that `docs/design-brief.md` actually targets, so it is full-bleed on the design device and
+ * only caps anything wider — while the album manager's content is genuinely side-by-side.
```

The proof the old line was never true: `git log -S "470"` across the brief's whole
history is empty. A drifted citation at least was true once; this one misquotes at
birth, which is exactly the class a "check the doc hasn't drifted" audit misses and a
"grep the cited source for the quoted value" audit catches.

**The dead directive, and the comment that replaced it** (`app/nina/about/page.tsx`).
The old block argued the suppression was a legitimate false-positive exemption; the
new block records that the directive suppresses nothing here, keeps the *argument*
alive for the file where it does hold, and states the operative check:

```diff
-  // eslint-disable-next-line react-hooks/purity -- server render, once per request; see above.
   const jobsNowMs = Date.now()
```

with the comment now closing: *"Why the same shape flags there and not here is
undiagnosed (this function's analysis is the suspect, not an exemption) and left so:
the operative check is one lint run, not a mechanism story. If the flag ever fires
here, that file's comment block is the argument for restoring the directive."* That is
the honest shape: keep the reasoning, drop the claim of knowledge nobody has.

**The re-attribution** (`app/r/[id]/page.tsx:359`) — quotation vs computation:

```diff
-              : /* The design brief asks for 90.6% to be unmissable "without scolding me about it".
+              : /* The brief's example run is 90.6% zones 4+5 — the "ninety percent" it rounds to —
+                   and asks for that share to be unmissable "without scolding me about it". One
```

The brief never says 90.6; its example zone table *computes* to it. A reader who went
to check the quote would have found a number that is not there — the same failure
class as the 470 px citation, milder because the number is at least derivable from the
cited source.

**Why the citation audit caught what knip could not:** knip and eslint are mechanical
nets over the *syntax* — exports, directives, imports. A comment's claim lives at a
different layer entirely: it binds a source file (the brief), a value (470), and an
attribution (the brief says) — and any of the three can rot independently. The
method that worked, recorded for reuse: grep the cited source for the quoted value;
`git log -S` the value across the cited file's history to distinguish *drifted* (was
true once) from *born-wrong* (never true); and for suppression directives,
strip-and-lint a sibling carrying the same directive to test whether the asymmetry is
real before believing either eslint's "unused" or the comment's justification.

## Decisions & Trade-offs
- **Record verified-true files as findings, not just edits.** `app/layout.tsx` was
  named by the assignment and came back clean. Editing nothing is still a result —
  recording it (with the receipts: brief:26, metadata.js:606) prevents the next audit
  from re-suspecting the file, and honestly scopes what the session *didn't* find
  rather than inflating the fix list.
- **Leave `jobs/page.tsx` untouched.** Its `react-hooks/purity` directive is *live*
  (the strip-and-lint experiment proved the rule fires there). Removing it would have
  been symmetrical-looking and wrong. The asymmetry is the finding; symmetry was not
  the goal.
- **One commit for citations + dead code.** Five files, all comments-or-constant,
  one audit. Splitting would have been process purity with no review benefit — the
  commit message already enumerates each finding with its evidence.
- **Don't diagnose the purity asymmetry in this session.** The mechanism (why an
  identical binding flags in jobs but not about) is a compiler-bailout question with
  no bearing on the fix's correctness — the directive is gone because eslint proves
  it suppresses nothing, which is independent of why. The comment records the limit
  instead of papering over it with a plausible mechanism story.
- **Keep the globals.css tokens despite "unused-looking".** Any usage scan of
  custom properties fights the tokens.css mirror contract (25/25). They are
  vocabulary, not dead code — the sweep's job is to remove what nothing means, not
  what nothing references.

## Follow-ups & YAGNI notes
- **The `react-hooks/purity` asymmetry is undiagnosed by mechanism** — jobs flagged,
  about not, byte-identical binding, same plugin version. The about comment now says
  the operative check is one lint run, not a mechanism story. If someone wants the
  mechanism, it is a compiler-bailout question (what in `about`'s function shape makes
  the rule's analysis bail or pass) — a self-contained curiosity for a future session,
  not a defect.
- **Line-number citations keep dying.** Two died this session: `jobs/page.tsx:41-56`
  (removed with the comment that cited it — the block now lives at ~58-72), and the
  count of live line-number citations is now essentially one: DialSlider's brief:175,
  kept deliberately by the docs-design-audit. Consider anchored citations (quoted
  text or section names) over line numbers in future comments; line numbers rot on
  any edit above them, silently and invisibly to every gate.
- **The docs-design-audit session's remaining follow-ups are all outside app/ and
  remain open:** `components/admin/UserPicker.tsx:12` (icon-button citation), the
  archived admin plan `P2-CA-A002.md` quote, `docs/architecture.md:36`/`:362`
  R-range, and generate-badge's `style.md` Roadmap §4.7. This session closed only the
  `admin/layout.tsx:21` item it flagged.
- **Deliberately not done:** no route consolidation, no restructuring of any page or
  layout (the sweep's mandate was dead code and false claims, and the tree is tight);
  no touching app/api (excluded by the assignment — it has today's dedicated test
  coverage); no knip backlog work (the standing repo-wide census belongs to
  `tokenmax-dead-export-tooling`'s task list, and app/ contributed exactly one item
  to it, now resolved).
- **The MemoryTable parallel-load flake cost one full-sweep rerun.** The verdict
  protocol (isolate first, never attribute to your own diff before reproducing on
  clean shape) worked exactly as designed — the two reds were 20/20 green in
  isolation and the diff touches no import they load. Noted here so the rerun cost is
  visible when weighing whether to defake the flake at its root.

## Appendix
- **Commit:** `4f17bfe5a9abdabb5dbc3af09ef56799c9d82fe1` "refactor(app): fix false
  design-brief citations; sweep app/ for dead code" — 5 files, +19/−15:
  `app/(public)/s/[token]/copy.ts` (−1), `app/admin/layout.tsx` (+4/−2),
  `app/admin/page.tsx` (+1/−1), `app/nina/about/page.tsx` (+11/−9),
  `app/r/[id]/page.tsx` (+3/−2).
- **Branch base:** `b39c6e5` ("docs(token_maxxing): backfill Achievement one-liner
  cap onto existing index"); head `4f17bfe`. Branch
  `token-maxxing-2026-09-12-app-tree-yagni`, worktree
  `tokenmax-2026-09-12-app-tree-yagni`.
- **Assigned idea (verbatim, for the record):** "Run a YAGNI/dead-code sweep across
  app/ (page/layout tree, excluding app/api which already has test coverage) and fix
  the stale design-brief.md citations in app/layout.tsx, app/admin/layout.tsx and
  app/admin/page.tsx. Why: app/ only ever got a shallow 1-of-7-directories pass and
  was never individually audited."
- **Evidence receipts:**
  - Brief's XS Max target: `docs/design-brief.md` specifies 414 × 896; the "ninety
    percent" wording and the 44 pt minimum (brief:175) both verified in the brief.
  - `git log -S "470"` over `docs/design-brief.md`'s entire history: empty.
  - Correct 470 px attribution already present at
    `components/admin/AdminNavLinks.tsx:160` ("a no-op at 414 px").
  - Fifth admin card purged by `746e454` (image-collection p2).
  - Purification directive archaeology: landed at `3912cec`; eslint-plugin-react-hooks
    7.1.1 at both `3912cec` and HEAD; strip-and-lint on `app/nina/jobs/page.tsx` shows
    the identical binding still flags there.
  - `SECTION_CHART` string survives via `components/charts/PaceHrChart.tsx:28`
    (ChartFrame title); all other `SECTION_*` imported by the share page.
  - Next 16 claim: `node_modules/next/dist/lib/metadata/metadata.js:606` emits only
    `mobile-web-app-capable`.
- **Gates as run:** `prettier --check` clean on all five touched files; eslint over
  app/ 0 problems (1 before); `next typegen` + `tsc --noEmit` exit 0; full vitest
  sweep 5,235 passed / 2 failed (MemoryTable add-row, known parallel-load flake,
  20/20 green in isolation, import graph untouched).
- **Negative results (as valuable as the finds):** knip's only app/ non-api finding
  was the one deleted constant; no orphaned routes (every app/ page has inbound
  references); no TODO/FIXME markers anywhere in app/; `app/layout.tsx`'s citations
  both true; globals.css tokens under the mirror contract, not dead.
- **Instrument lineage:** knip adopted same-day by `tokenmax-dead-export-tooling`
  (`4f4fa3f`) — this session ran it over a surface no prior instrument had covered;
  the citation-audit method (grep cited source, `git log -S` quoted values,
  strip-and-lint directives) is this session's addition to the playbook, covering
  the layer the mechanical nets cannot see.
