# Token-Maxxing Session — 2026-09-12: Admin Optional-Props YAGNI

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `admin-optional-props`) pre-assigned one idea
  by the coordinator (`tokenmax-orch-2026-09-12`): extend the **optional-prop-vs-callsite**
  YAGNI scan — used successfully on `components/ui` earlier the same day
  (`2026-09-12-ui-primitives-yagni.md`, which explicitly named `components/admin` as the
  next target in its follow-ups) — to `components/admin`, which is larger (73 components vs
  ui's 17 source files) and had never been swept for props that are always/never passed a
  non-default value. Where the ui pass hunted dead *exports*, this pass asked a different
  question of every prop on every component: **does any production call site ever set this,
  and does any production call site ever leave this at its default?** A prop nobody sets is
  a second way to render, waiting; a default nobody overrides is a parameter pretending to
  be a decision.
- **Concrete changes:** 1 commit (`1fec595`), 10 files, **+55/−182**, every file under
  `components/admin`:
  - **CircleFrame**: `ring` + `className` props set at **0 of 4** production call sites
    (tests only; `ring` was born in `de34b1b` and never adopted by any caller) → removed
    with their test cases. `sizeClass` passed at **4/4** production sites with its
    `'size-24'` default never used → made **REQUIRED** (the RunDateLink round-3 rule).
    Docstring drift fixed: "Three call sites" was four, measured.
  - **ShareToNinaItem**: `className` + `onOpened` had no caller — the only host
    (`SelectionPane:347`) passes neither. The R6 styling had converged into the component
    (`w-11 px-0` hardcoded) and the item had moved out of the host menu the `onOpened`
    callback was meant to close. Both removed with their test cases; the `cn` import went
    with them.
  - **DialSlider**: `step` set at **0 of 3** production sites → hardcoded `step={1}` with a
    comment; `disabled` set at **0 of 3** → removed with its three threading sites
    (undo-button guard, checkbox disabled attr + opacity class, range disabled attr +
    opacity class). `DialSliderProps` had zero importers → un-exported. Two doc drifts
    fixed: "exactly one caller" (actually 3 call sites in 2 files) and "ten 'use client'
    files import it" (**43** files measured 2026-09-12 — the same stale claim the ui
    session fixed in `index.ts`).
  - **PhotoReferencePicker**: `disabled` was born for "while the save transition runs"
    (`b691af8`) but the one call site (`ImageGenPanel:745`) never armed it → removed with
    its three threading sites and the tiles' now-unreachable `disabled:opacity-50`.
  - **photoIcons**: `EyeIcon`, `ChevronLeftIcon`, `ChevronRightIcon` — exported, rendered
    NOWHERE in the repo, imported only by their own test file (tests for dead icons) →
    deleted; the signature table went **13 → 10 glyphs**.
- **Real value delivered:**
  - **The method is the durable artifact, now proven on a second directory.** The TS-AST
    import-graph classifier was rebuilt from the ui session's method as a throwaway script
    in gitignored `.next/` (not committed): whole-repo parse, per-file import resolution
    (relative + `@/` alias + re-export chains), component census with props-type extraction
    (interfaces, inline literals, destructured defaults), JSX callsite scan with spread
    flagging, `React.createElement` attribution. Positively controlled **before any verdict
    was trusted**: synthetic probe component with planted NEVER-SET / VARIATION /
    ALWAYS-SET shapes, spread-flag control, createElement control, and a ground-truth grep
    agreement check (CircleFrame 4/4).
  - **Four NEW verifier lessons this session added** (beyond the ui session's four traps):
    JSX children are the `children` prop (the attribute-only scan false-flagged a
    required-children component as NEVER-SET — caught by the manual read, scanner fixed,
    verdict flipped to alive); head-cutoff greps lie (an inventory grep piped through
    `head -10` silently dropped two real call sites and nearly drove a false removal — the
    repo's `inventory-grep-head-cutoff` lesson re-confirmed live); `Partial<Props>` test
    spread walls blind the scanner to every test-set prop at once (54 prop-rows landed in
    HAS-SPREAD(manual)); data-driven tag indirection (`const Icon = link.icon` →
    `<Icon className/>`) renders components with zero direct tag sites, so NO-CALLSITES
    rows are manual-review-only.
  - **The honest harvest, as measured:** **zero dead exports** in `components/admin` (the
    directory is clean at the export level — a real deliverable that retires the idea for
    future sessions) and **zero clean default-never-overridden fold candidates**; 12
    test-only exports kept deliberately (their consumers live in root `tests/`, outside
    this worker's fence); five dismissals recorded with reasons so the next sweep doesn't
    re-litigate them.
  - **Two full gates came back fully green**: `tsc --noEmit` exit 0 whole-repo after
    typegen (the compiler votes on every "no other setter exists" claim at once), and the
    touched + consumer suites 167/167.
- **Branch:** `token-maxxing-2026-09-12-admin-optional-props`
- **Merge status:** merged (commit `cb210af` — "merge: token-maxxing session admin-optional-props")
- **Approx token burn:** high (est. **~0.6M**, input-dominated) — the classifier build and
  its positive controls, per-callsite manual reads of every candidate, the stash-protocol
  clean-HEAD repro, and two full `tsc` runs. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed
a pre-assigned idea. This worker's assignment was the optional-prop scan's second
application, handed over with its lineage attached.

The idea had three legs. First, **momentum**: the ui session had proven the scan that same
day and ended by naming `components/admin` as the next target — this session is that
follow-up acted on within hours rather than left to rot. Second, **scale**: at 73
components, `components/admin` is the largest component directory the scan had touched
(ui's 17 source files was the previous ceiling), so the per-component verdict table is
correspondingly more valuable as a record. Third, **the gap itself**: despite being the
admin control surface of the whole app, the directory had never been asked which of its
props are real — prior sweeps (`2026-09-11-lib-admin-dead-exports.md` for the lib side,
the 2026-09-12 package-readme compaction for the docs side) audited exports and prose, not
props-vs-callsites.

The constraints held from the start: strictly within `components/admin`, no
`package_readme.md`, no production DB — and the fence bound on real verdicts, exactly as
the ui session predicted it would: the 12 test-only exports whose consumers live in root
`tests/` stayed, conditionally.

## What We Did (blow-by-blow)
1. **Rebuilt the classifier before running any grep.** The ui session's throwaway script
   lived only in gitignored `.next/` of another worktree, by design — so this pass rebuilt
   it: a TypeScript-compiler-AST script (again in gitignored `.next/`, again deliberately
   not committed) that parses the whole repo, resolves every import per file (relative
   paths, the `@/` alias, and re-export chains), enumerates every component in
   `components/admin` with its props type (interfaces, inline literals, destructured
   defaults), and scans every JSX callsite for attribute sets — flagging `{...spread}` so
   spread sites stop pretending to be visibility.
2. **Positive-controlled the classifier before trusting a single verdict.** A synthetic
   probe component carried planted NEVER-SET / VARIATION / ALWAYS-SET shapes, and each was
   classified correctly; the spread flag and `React.createElement` attribution each got
   their own control; and a ground-truth agreement check ran the classifier against a
   manual grep on `CircleFrame` (4/4 agreement) before any verdict on the real directory
   was trusted.
3. **Classified every prop of 73 components.** The verdicts fell into the expected buckets
   — never-set-in-prod, default-never-overridden, always-set (make-required candidates),
   HAS-SPREAD(manual), and NO-CALLSITES — but this directory added shapes the ui pass had
   never seen, and each one became a verifier lesson (next section).
4. **Removed 8 dead props, each by its own evidence:**
   - `CircleFrame.ring` + `CircleFrame.className`: set at **0 of 4** production call sites;
     both survived on test-only setters. Removed with their test cases. `ring`'s history
     made the case vivid: born in `de34b1b` and never adopted by a single caller since —
     speculative surface that stayed speculative for its whole life.
   - `ShareToNinaItem.className` + `onOpened`: no caller at all — the only host
     (`SelectionPane:347`) passes neither. The R6 styling had converged *into* the
     component (`w-11 px-0` hardcoded), and the item had moved out of the host menu that
     `onOpened` existed to close. Both removed with their tests; `cn` went with `className`.
   - `DialSlider.step`: 0 of 3 production sites → hardcoded `step={1}` with a comment
     recording why (a constant is not a configuration option). `DialSlider.disabled`: 0 of
     3 → removed with all three threading sites (undo-button guard, checkbox disabled attr
     + opacity class, range disabled attr + opacity class) — a dead prop's plumbing is
     dead too.
   - `PhotoReferencePicker.disabled`: the archaeology was the point — born in `b691af8`
     for "while the save transition runs", but its one call site (`ImageGenPanel:745`)
     never armed it. Removed with its three threading sites and the tiles'
     now-unreachable `disabled:opacity-50`.
5. **Made one prop REQUIRED.** `CircleFrame.sizeClass` was passed at **4/4** production
   sites while its `'size-24'` default sat unused — the default documented a decision
   nobody makes. Now a required `string`, so the compiler enforces what every caller was
   already doing.
6. **Un-exported `DialSliderProps`** (zero importers — the ui session's un-export bucket,
   same rule).
7. **Deleted 3 dead glyphs.** `photoIcons`' `EyeIcon`, `ChevronLeftIcon`,
   `ChevronRightIcon` were exported, rendered nowhere in the repo, and imported only by
   their own test file — a test suite for dead icons. Deleted; the signature table went
   13 → 10 glyphs.
8. **Measured the directory's own doc claims while in there** — two had drifted, both
   fixed in the same commit: `DialSlider`'s "exactly one caller" (actually 3 call sites in
   2 files) and the barrel's "ten 'use client' files import it" (**43**, measured
   2026-09-12 — notably the *same* stale "ten" claim the ui session fixed in its barrel
   the same morning; the two directories had copied each other's folklore).
9. **Dismissed five findings with reasons, not deletions:**
   - `FolderTree` `Row.menu` "always set": one site passes literal `null` — nullable by
     contract, not a make-required candidate.
   - Semantic-default booleans (`unsaved`, `enabled`): the idiomatic optional-flag pattern,
     kept.
   - `UploadQueue` headline and `useFolderUpload`: function-called hooks/helpers, not
     components — scan-shape artifacts, alive.
   - `FolderMenu` `MenuItem`'s required `children`: the attribute-only scan read it as
     NEVER-SET (see lesson 1) — manual read caught it, verdict flipped to **alive**.
   - `UserPicker.basePath`: both values genuinely used (see lesson 2) — false removal
     avoided.
10. **Gates, in order:** `npx tsc --noEmit` first showed only the worktree's known
    missing-typegen `PageProps`/`LayoutProps`/`RouteContext` noise → `npx next typegen` →
    re-run **exit 0, fully clean, whole repo**. Touched + consumer test files (9 files,
    incl. `MediaPane`/`SelectionPane`/`ImageGenPanel`/`CharacterPanel`): **167/167**. Full
    `components/admin` suite with the diff: **443 tests, 1 failure** (`MediaPane` "does not
    latch worn when the adopt action refuses") in a file untouched by the diff; it passes
    **10/10** in isolation and the failure set varies run-to-run (**3 → 1 → 0** across
    runs). Clean-HEAD repro via the tagged-stash protocol (SHA captured, applied by SHA,
    dropped): **464/464 green** that run — the documented parallel-load flake signature,
    not attributed to the diff. The repro is stated honestly: the flake did **not**
    reproduce on the one clean-HEAD run; what is proven is isolation-pass + varying failure
    sets + untouched files. eslint clean on all ten changed files; prettier clean (no
    reflow needed).
11. **One mid-flight hazard handled:** origin/main moved **+11 commits** during the session
    (sibling workers landing); the overlap check showed only `ImageGenTestPanel.test.tsx`
    touched in this directory's area, which this diff does not touch — **zero conflict**.
12. **Committed as `1fec595`** on the worker branch and stopped — no merge, no push; the
    coordinator lands worker branches.

The test-count arithmetic reconciles to the digit: the `components/admin` suite went
**464 → 443**, exactly the 21 removed cases (`CircleFrame` 3, `ShareToNinaItem` 1,
`DialSlider` 1, `PhotoReferencePicker` 1, `photoIcons` 15 = 3 glyphs × 5 `it.each`
instances).

## Code / Design Details

**The four verifier lessons this session added** (on top of the ui session's four traps —
the list a future sweep must read first):

1. **JSX children are the `children` prop.** The attribute-only scan read `FolderMenu`
   `MenuItem`'s *required* `children` as NEVER-SET — of course no call site sets it as an
   attribute; it arrives as JSX content. The manual read caught it before any edit; the
   scanner was fixed to count JSX children as setting `children`, and the verdict flipped
   to alive. A false alarm dismissed with a reason, and with the scanner improved for the
   next pass.
2. **Head-cutoff greps lie — again.** An inventory grep piped through `head -10` silently
   dropped the `/admin/shortcuts` page's two `UserPicker` callsites, which nearly flipped
   `UserPicker.basePath` (default `'/admin/memory'`, override `'/admin/shortcuts'` — both
   genuinely used) into a false removal. The AST scan saw all **16** sites; the classifier
   was right, the grep was wrong. This is the repo's `inventory-grep-head-cutoff` lesson
   re-confirmed live, in the highest-stakes way it can manifest: a grep under-census
   nearly deleting a prop whose two values are both real.
3. **Test spread walls.** `Partial<Props>` render-helper bags (`{...props}`) wall off
   test-set visibility entirely — **54 prop-rows** landed in HAS-SPREAD(manual), and every
   candidate behind the wall needed the bag read by hand. Production counts stay exact
   through the wall (production spreads are flagged per-site); it is the *test* side that
   goes dark, so a "test-only, remove" verdict must never be issued from behind the wall
   without reading the bag.
4. **Data-driven tag indirection.** `const Icon = link.icon` → `<Icon className/>` renders
   components with zero direct tag sites — the scanner sees the variable, not the
   component. All NO-CALLSITES rows are therefore **manual-review-only**;
   `AdminNavLinks`' 7 icons are alive exactly this way and would have died to a naive
   "zero tag sites → delete" rule.

**The verdict that shows the method working end to end** (`DialSlider.tsx`, after):

```tsx
 *        the old `step` prop was set by no call site; the old `disabled` prop by none either,
 *        ...
        step={1}
```

**Two doc drifts fixed at the source** — and the second is a small finding about the
campaign itself: the ui session fixed "ten 'use client' files" in its barrel the same
morning, and this directory's barrel carried the *same* stale "ten". The two directories
had copied each other's folklore, which is exactly how a stale count survives: not by
being checked, but by being copied.

## Decisions & Trade-offs
- **Rebuild the throwaway classifier rather than commit it.** Same ruling as the ui
  session, held deliberately: a one-shot analyzer nobody maintains is its own YAGNI
  violation. The *method* is the artifact and it lives in these docs (this one and the
  ui session's). Cost: one script-build per sweep. Benefit: every verdict still comes with
  a resolved module path, and the positive controls made "the classifier says" mean
  something before it said anything.
- **The type gate outranks the scanner — extended to props.** After removing a prop,
  `tsc --noEmit` votes on every "no other setter exists" claim at once; the full-repo exit
  0 after typegen is the compile-time proof behind all 8 removals. Lesson 1 (children) and
  lesson 2 (head cutoff) both showed the *scanner* being wrong and the gate/manual read
  being right — the correction went into the scanner, the verdict, or both, never into a
  reverted removal that the evidence didn't support.
- **Made `sizeClass` required instead of just noting it.** "Default never overridden" is
  the mirror-image finding of "never set", and it got the symmetric treatment: if 4/4
  callers pass it, the default is documentation of a decision nobody makes, and making the
  prop required moves the invariant from prose to compiler. This is the same
  `showTrendLine`-made-required move the charts sweep made, now applied to props.
- **Kept the 12 test-only exports on scope grounds, with the condition written down.**
  `photoReferenceModel.ts`'s helpers/constants, the 3 photoIcons glyphs *pre-deletion*,
  `EXPLORER_REGISTER_CHUNK`, `DescribeOutcome` — all test-only, all surviving because
  their consumers live in root `tests/`, outside the `components/admin` fence. Same
  conditional-keep verdict shape as the ui session's `TAB_BAR_*` seams: a *scope* verdict,
  not a *liveness* verdict, and re-litigable the day the consumers move.
- **The honest-verdict framing over the bigger-diff framing.** The headline findings are
  the *negative results*: zero dead exports in the whole directory, zero clean fold
  candidates. Publishing "this directory is clean at the export level, with evidence"
  retires the idea for every future session — the same deliverable shape the ui session
  claimed, now covering the largest component directory in the repo.
- **Scope discipline held.** No file outside `components/admin` touched, no
  `package_readme.md` (the directory's readme was compacted by a sibling worker the same
  day), no production DB. The fence bound exactly where predicted — on the 12 test-only
  exports — and the keep-with-condition is the record of it binding.

## Follow-ups & YAGNI notes
- **The same scan could now cover `components/nina`** (a sibling worker was sweeping it
  the same day — **check its session doc before re-running**) **and
  `components/{extract,auth,push}`.** The extract/auth/push trio got an export-level pass
  (`2026-09-12-auth-push-runs-trends-yagni.md`, `2026-09-12-extract-photos-yagni.md`) but
  not the prop-level one; `components/nina` is the largest remaining prop-level gap.
- **The 12 test-only exports stay conditional on their `tests/` consumers.** If those
  tests move into `components/admin`, their verdict flips to removable (same geography
  condition as the ui session's `TAB_BAR_*`). The next sweep of this directory should
  re-check consumer geography before re-classifying.
- **The classifier script was deliberately not committed** — one-shot analyzer nobody
  maintains is its own YAGNI violation; the method lives in this doc and the ui session's.
  A third sweep (nina) would be the point where "rebuild it a third time" starts arguing
  for a committed, tested tool — that threshold call belongs to the session that actually
  runs the third sweep.
- **`FolderMenu` `MenuItem` is a plain `<button>` holding children with no className
  passthrough — fine today.** If a second styling need appears, that is the moment to
  reach for the ui barrel's `Button` instead of re-growing props here.
- **Deliberately NOT done, on YAGNI grounds:** no prop re-added "for flexibility", no
  `className` threading restored anywhere, no package readme updated (another session's
  assignment), and the full-suite flake was not "fixed" from this branch — it is the
  documented parallel-load signature and belongs to the harness, not to this diff.

## Appendix

**Files touched** (all under `components/admin/`; 10 files, +55/−182, commit `1fec595`):
```
components/admin/CircleFrame.test.tsx          | 40 +++++--------------   (ring/className cases removed)
components/admin/CircleFrame.tsx               | 35 +++++++---------       (drop ring+className; sizeClass required; count fix)
components/admin/DialSlider.test.tsx           | 16 ++------               (disabled case removed)
components/admin/DialSlider.tsx                | 23 +++++------            (step={1}; drop disabled; un-export props type; 2 count fixes)
components/admin/PhotoReferencePicker.test.tsx |  8 ----                   (disabled case removed)
components/admin/PhotoReferencePicker.tsx      | 14 +++----                (drop disabled + disabled:opacity-50)
components/admin/ShareToNinaItem.test.tsx      | 16 ++------               (className/onOpened case removed)
components/admin/ShareToNinaItem.tsx           | 18 ++++-----              (drop className+onOpened; cn import gone)
components/admin/photoIcons.test.tsx           | 12 +-----                 (3 dead-glyph rows removed)
components/admin/photoIcons.tsx                | 55 -------------------    (EyeIcon, ChevronLeftIcon, ChevronRightIcon deleted; 13 -> 10)
```

**Verification performed:** positively-controlled TS-AST import-graph classifier (synthetic
NEVER-SET / VARIATION / ALWAYS-SET probes, spread-flag control, createElement control,
ground-truth grep agreement on CircleFrame 4/4) run before any verdict; every candidate's
call sites read by hand; `npx next typegen` then `npx tsc --noEmit` **exit 0 whole-repo**;
touched + consumer suites **167/167** (9 files incl. MediaPane/SelectionPane/ImageGenPanel/
CharacterPanel); full `components/admin` suite **443 tests** with the single red proven the
known parallel-load flake signature (MediaPane latch test, file untouched by the diff;
10/10 in isolation; failure set varies 3 → 1 → 0 across runs; clean-HEAD tagged-stash run
464/464 — stated honestly, the flake did not reproduce on that one run, so attribution
rests on isolation-pass + varying sets + untouched files, not on a reproduction); test
arithmetic reconciled to the digit (464 − 21 = 443); eslint clean on all ten changed
files; prettier clean; origin/main overlap check at +11 commits mid-session, zero
conflicting files.

**Session identity:** worker session `admin-optional-props`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-admin-optional-props`; work commit `1fec595`; merged
(commit `cb210af`).

**Related sessions:** `2026-09-12-ui-primitives-yagni.md` (the same-day scan this session
extends — its four verifier traps are the foundation this pass added four lessons to, and
its follow-ups named this directory as the target);
`2026-09-12-pkg-readme-admin-cmp.md` (the same-day components/admin readme compaction —
the doc side of this directory); `2026-09-12-insights-metrics-panel-yagni.md` and
`2026-09-12-badges-records-yagni.md` (sibling AST-verifier sweeps of the same fan-out, for
method comparison).
