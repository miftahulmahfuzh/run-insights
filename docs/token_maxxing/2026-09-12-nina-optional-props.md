# Token-Maxxing Session — 2026-09-12: Nina Optional-Props YAGNI

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `nina-optional-props`) pre-assigned one idea by
  the coordinator (`tokenmax-orch-2026-09-12`): run the **optional-prop-vs-call-sites** scan
  over `components/nina` — the exact follow-up the sibling `ui-primitives-yagni` session
  industrialized and explicitly nominated four hours earlier ("the same optional-prop-vs-
  call-sites scan could be run over `components/admin` and `components/nina` next"). The
  target is the largest component tree in the repo — **14,011 lines across 62 files** (31
  sources + 31 co-located test files), nearly 3× the 5,234-line `ui` tree — and it had never
  been swept for props that are always or never passed a non-default value. Hard constraints
  from the coordinator: stay **strictly within `components/nina`** (co-located tests
  included — unlike the charts sweep, this directory's tests live inside it); touch **no
  `package_readme.md`**; **no production DB**.
- **Concrete changes:** 1 commit (`4f655e0`), 8 files, **+29/−56**, every file under
  `components/nina`: four test-only `className` props deleted (`NewChatButton.className`,
  `NinaAvatar.className`, `NinaJobElapsed.className`, `NinaJobList.className`) — each
  consumed via `cn()` but set at **0 production call sites**, its only setters being the
  component's own test — with each component's docstring now recording the rule at the
  removal site, two test cases carrying real coverage **rewritten** onto the slimmer
  signatures, and two pure-fiction test cases removed.
- **Real value delivered:**
  - **The method is the durable artifact, v2**: a throwaway TS-compiler-AST classifier in
    gitignored `.next/nina-props.js` (not committed) — never regex — that enumerated all 34
    components (function components with inline prop-type literals; the directory has NO
    named `*Props` types and NO barrel to map through), resolved every import repo-wide
    (alias + relative, through local renames), and captured JSX attributes **and spread
    attributes plus hook-style call arguments**. The spread capture is the v2 upgrade: it is
    exactly the `{...props}` blind spot that let the ui session's scanner misread
    `AppShell.className` until `tsc` caught it. This run had **zero scanner-vs-compiler
    disagreements**.
  - **Positive-controlled before any verdict was trusted**: known-alive optionals
    (`TypingIndicator.avatar` via `MessageList`) correctly showed their production passer;
    the spreads were correctly flagged (the test suites here render via `{...props}` helper
    wrappers — 13–31 spread sites per big component); and a JSX-children false alarm
    (`NinaBarProvider.children` / `NinaSidebarProvider.children` read as
    "required-never-passed") was caught and classified as a **scanner blind spot** (children
    arrive by nesting, not as attributes) — not a finding.
  - **The honest harvest, as measured:** zero NEVER-PASSED props, zero
    ALWAYS-PASSED+DEFAULT (no required-promotion candidates), zero write-only props. Every
    spread-obscured prop has its single production call site passing it — and because every
    production site is a non-spread JSX literal, production usage is measured exactly, not
    inferred. The entire actionable surface was **six test-only optionals** — of which four
    were the `className` pattern (removed) and two are documented seams (kept, see below).
  - **A negative result with the same standing as the ui session's**: 14,011 lines scanned,
    and the one speculative surface is four props with no caller. Saying so, with the
    classifier's census behind it, retires the idea from every future session's menu and
    makes the directory's prop surface legible for the next pass.
  - **Keeps recorded where the next sweep will look**: `NinaSidebar`'s `searchSlot` and
    `newChatSlot` stay — deliberately, on the record — as documented seams; every
    dismissal carries its verified reason (see Decisions), so none of them gets
    re-litigated from scratch.
- **Branch:** `token-maxxing-2026-09-12-nina-optional-props`
- **Merge status:** merged (commit `c9792ac`)
- **Approx token burn:** high (est. ~0.7M, input-dominated) — the burn went into the
  classifier build and its positive controls, per-site classification of every optional prop
  across 34 components, and four gate runs (`next typegen` + `tsc --noEmit`, the nina suite,
  the full 5,184-test sweep, lint/format) plus the closed-loop classifier re-run. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed a
pre-assigned idea. This worker's assignment was the second half of a nomination written into
another worker's doc the same morning: the `ui-primitives-yagni` session had built an
optional-prop-vs-call-sites scanner for `components/ui`, and its follow-ups section named
`components/nina` (and `components/admin`) as the directories that scan should hit next —
"both are larger than `ui` was, and neither has had the pass."

The pitch had three legs, mirroring the ui session's. First, scale: `components/nina` at
14,011 lines is the largest component tree in the repo — nearly 3× the `ui` tree the pattern
was proven on — and it is the app's emotional center (the entire chat surface), so a
speculative prop here is a second way to render the product's most-seen pixels. Second,
safety: the directory's test coverage had landed the day before
(`2026-09-11-nina-chat-component-tests.md`, `-composer-bubble-list-tests.md`,
`-message-actions-sheet-tests.md`, `-remaining-component-tests.md` — 31 co-located suites,
311 tests at sweep time), which is the same precondition every prior YAGNI session had
deferred on. Third, the gap itself: the 2026-09-11 component-tests sessions covered
*behavior*, not *API surface* — no pass had ever asked which of nina's optional props any
caller actually sets.

Two structural differences from the `ui` sweep shaped the method. `components/nina` has **no
barrel** (`index.ts`) and **no named `*Props` types** — all 34 components declare their prop
types inline in the function signature, so the classifier enumerated components rather than
exports, and there was no through-barrel attribution to get wrong. And the directory's test
style is **spread-heavy**: each suite renders through a helper that builds a base-props
object and spreads it (`{...props}`), which is why a naive per-attribute grep reports 13–31
uncertain sites per big component here — and why the ui session's lesson (JSX-attribute
scanners have a test-pass blind spot) had to be designed out up front rather than discovered
by a `tsc` failure.

## What We Did (blow-by-blow)
1. **Built the classifier before running any grep.** A throwaway TypeScript-compiler-AST
   script, written into gitignored `.next/nina-props.js` and deliberately not committed
   (same disposal discipline as the ui session: the *method* is the artifact, and it is
   recorded here). It enumerated all 34 function components with inline prop-type literals,
   resolved every import repo-wide — `@/` alias and relative paths, through local renames
   (`import { NinaAvatar as Avatar }`) — and captured three usage channels: JSX attributes,
   **spread attributes** (`{...props}`, tracked to their originating object literal where
   resolvable), and hook-style call arguments. The commit message's own census of the run:
   34 components, 671 files in the graph.
2. **Positive-controlled the classifier before trusting a single verdict** — three
   controls, each aimed at a known failure mode:
   - *Known-alive optionals*: `TypingIndicator.avatar`, optional and genuinely passed in
     production, correctly showed `MessageList` as its production passer — the classifier
     finds usage that exists.
   - *Spreads*: the test helpers' `{...props}` wrappers were correctly flagged as
     spread-obscured sites (13–31 per big component) rather than silently missed or
     silently counted as set — the ui session's `AppShell` failure mode, closed by
     construction this time.
   - *The false alarm*: `NinaBarProvider.children` and `NinaSidebarProvider.children` read
     as "required-never-passed" — no caller ever writes `children={...}` as an attribute.
     Caught, and classified as a **scanner blind spot** (children arrive by nesting, not as
     attributes), NOT as a finding. Neither provider was touched.
3. **Ran the census; the verdict space collapsed.** Zero NEVER-PASSED props, zero
   ALWAYS-PASSED+DEFAULT (no `showTrendLine`-style required-promotion candidates), zero
   write-only props. Because every production call site in the directory is a literal JSX
   element (spreads live only in the test helpers), production usage is measured exactly.
   The entire actionable surface was **six TEST-ONLY optionals** — optional props whose only
   setters are their own test files: the four `className` props, plus `NinaSidebar`'s two
   slot props.
4. **Removed the four `className` props, each by its own evidence** (commit `4f655e0`):
   - `NewChatButton.className`: the disc's skin is the rail's own policy
     (`NINA_CHROME_CONTROL_CLASS` at `size-11`, argued in the file's R5 section) and the one
     caller has never dressed it differently.
   - `NinaAvatar.className`: all three callers want the same circle — the one real
     variation is the size, and the size is already a prop.
   - `NinaJobElapsed.className`: the sharpest of the four — the prop was the span's ENTIRE
     `className`, and both production render sites (`NinaJobDetail:123`,
     `NinaJobList:123`) omit it, so **production has rendered a bare span all along**. The
     removed test passing `tabular-nums` was coverage of a render production has never
     once produced.
   - `NinaJobList.className`: both callers want the same list — the empty sentence's
     wording is the caller's whole say (via `emptyText`).
   All four follow the repo's own `RunDateLink` round-3 rule — **a prop with no caller is a
   second way to render, waiting** (`components/ui/RunDateLink.tsx:27`) — the precedent the
   ui session applied to `EmptyState`/`Field`/`AppShell`. Each component's docstring now
   carries the rule *at the removal site*, citing `RunDateLink`, so the next hand tempted to
   re-add the prop meets the argument where they'd write the code.
5. **Sorted the tests by what they actually covered.** The two cases carrying real
   assertions were **rewritten onto the slimmer signatures** (the `AppShell` precedent from
   the ui session): `NewChatButton`'s plus-glyph case lost only its `className` rider, and
   `NinaAvatar`'s three chip-shape assertions (`rounded-pill`/`overflow-hidden`/`bg-paper-2`)
   survived intact. The two pure-fiction cases — `NinaJobElapsed`'s "className rides the
   span" and `NinaJobList`'s "className rides the ul — or the empty sentence, whichever
   shape this render took" — were **removed**: they tested nothing but the prop itself.
6. **Kept the two remaining test-only optionals, deliberately, on the record.**
   `NinaSidebar.searchSlot` and `NinaSidebar.newChatSlot` (1 of 9 call sites, default
   `null`, set only by `NinaSidebar.test.tsx:149`) are **documented seams** — "PHASE 6 SEAM"
   and "PHASE 3 / R2 SEAM" in their prop doc comments — with live replace-the-default
   contracts (`{searchSlot ?? <NinaSearchField />}`, `{newChatSlot ?? <NewChatButton …>}`)
   and even a note on where an override would land in the R5 rail. This is the `TAB_BAR_*`
   kind of verdict: a **scope/design keep, not a liveness keep**. The next sweep should NOT
   re-litigate them without reading those docstrings — the docstrings are the authority.
7. **Dismissed everything else with verified reasons** — the negative-result harvest, each
   checked before keeping:
   - `NinaAvatar`'s `size`/`src`/`natural`/`crop`: passed by **all 3 production sites**, but
     their defaults are the documented fallback form ("passes nothing at all… renders
     exactly what phase 4 rendered"), deliberately exercised by the tests — a
     required-promotion would delete tested, documented behavior.
   - `ChatImages.kinds`/`onOpen`: documented contracts ("Absent means the grid is not
     interactive, which is how phase 6 shipped it").
   - `TypingIndicator.avatar`: the R1-documented deliberate asymmetry.
   - `Composer`'s six optionals: all passed at its only production site.
   - `NinaJobList.actions`: genuinely *sometimes* — only `/nina/jobs` sets it, and the
     boolean's own docstring argues why a render-prop was impossible across the
     Server-Component boundary.
   - `QuoteStub.className` and `NinaSidebarTrigger.className`: **production-alive** (2/2 and
     1/1 production sites pass them) — NOT part of the `className` pattern despite the name.
     These two are exactly why verdicts were per-prop, not per-prop-name.
8. **Gates, in order:** `next typegen` first, then `npx tsc --noEmit` — **exit 0, fully
   clean, zero findings** (running typegen first retired the fresh-worktree
   `PageProps`/`LayoutProps` noise every earlier session has caveated; and this run had no
   scanner-vs-compiler disagreement — the ui session's AppShell-spread catch did not
   recur); `vitest components/nina` **311/311**; full repo sweep **5,184/5,184 across 272
   files, zero failures and zero flakes** this run (the `MemoryTable` parallel-load flake
   that has haunted three sibling sessions did not show); eslint clean on all 8 changed
   files; prettier clean after one `--write` (it collapsed the now-short `NinaJobElapsed`
   span to one line — output identical).
9. **Reconciled the test arithmetic to the digit**: the four touched suites went **27 → 25**
   cases (`NinaJobElapsed` 5→4, `NinaJobList` 10→9, `NewChatButton` 6→6 rewritten,
   `NinaAvatar` 6→6 rewritten); the repo suite went **5,186 → 5,184** — exactly the two
   removed fiction cases, with the rewrites costing zero.
10. **Closed the loop with the classifier itself**: re-run against the edited tree, the four
    `className` rows are gone and the only TEST-ONLY rows remaining are the two documented
    seams. The remaining `className` mentions in the census are the production-alive props
    (`QuoteStub` and `NinaSidebarTrigger` among them). The scanner agrees with the diff.
11. **Committed as `4f655e0`** on the worker branch and stopped — no merge, no push; the
    coordinator lands worker branches.

**Session timeline note:** mid-session the worker hit a 429 and went idle ~9 minutes in;
the coordinator's resume ping recovered it with no lost work (the classifier was mid-build).
Recorded so the day's doc readers know the session's wall-clock shape.

## Code / Design Details

**The verdict table as landed** (from the commit message):

```
- className on NewChatButton, NinaAvatar, NinaJobElapsed and NinaJobList:
  optional, consumed, but set at 0 of their production call sites, their only
  setters being each component's own test file -> removed per the RunDateLink
  round-3 rule.
- NinaSidebar searchSlot/newChatSlot: documented PHASE 3/6 seams with live
  replace-the-default contracts, not speculation -> kept, on the record.
- Every other optional prop: passed by its production caller or documented as
  the fallback form (NinaAvatar's no-props face, ChatImages' non-interactive
  grid, TypingIndicator's R1 asymmetry).
```

**The docstring rule, recorded at the site of the removal** (`NinaJobElapsed.tsx` — the
component where the prop was the *entire* className, making the "second way to render"
argument concrete: production was already rendering the bare form):

```
 * ── NO `className` PROP ────────────────────────────────────────────────────────────────────────
 * Both callers (`NinaJobDetail`, `NinaJobList`) render the bare span — neither has ever passed a
 * class — so the prop was a second way to render a number, waiting, and came back out (the rule
 * `RunDateLink` applied when its `label` override came back out).
```

**The strongest single diff of the commit** — the bare span, before and after:

```diff
-  return (
-    <span className={className} suppressHydrationWarning>
-      {formatJobSeconds(seconds)}
-    </span>
-  )
+  return <span suppressHydrationWarning>{formatJobSeconds(seconds)}</span>
```

**The NewChatButton removal, showing the design argument riding along** — the docstring does
not just cite the rule, it names the policy the prop would have competed with:

```
 * It takes no `className` either. The disc's skin is the rail's own policy — `NINA_CHROME_CONTROL_CLASS`
 * at `size-11`, argued in R5 above — and the one caller has never dressed it differently: a prop
 * with no caller is a second way to render a button, waiting (the rule `RunDateLink` applied when
 * its `label` override came back out).
```

**A rewritten test case (coverage kept, speculation dropped)** — `NinaAvatar`'s chip-shape
case, which kept its three real assertions and lost only the rider
(`NewChatButton`'s plus-glyph case got the same treatment):

```diff
-  it('is a clipped circle on a paper chip, and a caller’s className rides along', () => {
-    const { container } = render(<NinaAvatar className="my-2" />)
+  it('is a clipped circle on a paper chip', () => {
+    const { container } = render(<NinaAvatar />)
     const span = container.firstElementChild as HTMLElement
     expect(span.className).toContain('rounded-pill')
     expect(span.className).toContain('overflow-hidden')
     expect(span.className).toContain('bg-paper-2')
-    expect(span.className).toContain('my-2')
   })
```

**Why the spread capture was the classifier's defining feature, in one paragraph:** the
directory's test suites render through per-component helpers that build a base-props object
and spread it — 13–31 spread sites per big component — so a JSX-attribute-only scanner (the
ui session's v1) reads every prop as "not set by tests" and every verdict needs a manual
spread hunt, which is exactly how `AppShell.className` nearly got mis-deleted yesterday. In
`components/nina` the spread style is ubiquitous, so v2 tracked spread attributes
structurally. The payoff is asymmetric in the right direction: production sites are all
literal JSX, so *production* usage is exact, while *test* usage is conservatively flagged —
and a test-only verdict (the only kind this sweep acted on) is precisely the case the spread
channel decides.

## Decisions & Trade-offs
- **Version-2 the scanner instead of inheriting v1's known bug.** The ui session's
  classifier captured JSX attributes only, and its own doc records the `{...props}` blind
  spot as a lesson. Building the nina pass on the same shape would have re-armed a known
  trap in a directory where spreads are the default test style. Cost: the spread-tracking
  code. Benefit: zero scanner-vs-compiler disagreements this run — the `tsc` gate confirmed
  the scanner instead of overruling it. The type gate still outranks the scanner; it just
  had nothing to overrule.
- **Removed test-only props even though the consumers were tests — unlike the ui session's
  TAB_BAR_* keeps — because geography differs.** The ui seams survived on a *scope* argument:
  their consumer test lives outside `components/ui`, outside the coordinator's fence. Here
  the tests are **co-located inside `components/nina`**, inside the fence, so the scope
  argument could not save the four `className` props — the only question was the
  `RunDateLink` rule, and it has no caller to plead. The fence held where it existed and
  did not pretend to where it didn't.
- **Rewrote rather than deleted where coverage was real; deleted where it was fiction.**
  The plus-glyph and chip-shape cases assert things production cares about; their
  `className` riders were incidental. The two "className rides" cases assert nothing but
  the prop. Applying the `AppShell` precedent case-by-case (rather than blanket-rewriting
  or blanket-deleting) kept the suite honest: 5,186 → 5,184 reconciles to the two fiction
  cases and nothing else.
- **Kept the slot seams with the reason written where the next sweep will look.**
  `searchSlot`/`newChatSlot` are the exact shape this pass hunted (optional, one setter,
  and it's a test) — and they survive because their docstrings document a live
  replace-the-default contract with a named phase and a named landing spot in the R5 rail.
  That is a *design* keep, not a liveness keep; the record says so explicitly, and names
  the re-read condition (sidebar tests restructuring onto real defaults).
- **Dismissed the tempting required-promotions.** `NinaAvatar`'s `size`/`src`/`natural`/
  `crop` are passed by 100% of production sites, which is the `showTrendLine` shape the
  charts session promoted to required — but promoting here would delete the documented
  no-props fallback face ("renders exactly what phase 4 rendered") that the tests
  deliberately exercise. Always-passed-in-production is not the same fact as
  default-is-dead; the defaults here are the documented form.
- **Per-prop verdicts, never per-prop-name.** `QuoteStub.className` and
  `NinaSidebarTrigger.className` would have died in any sweep that pattern-matched
  "className = the test-only pattern" — both are production-alive (2/2 and 1/1). The
  census's per-prop rows are what kept the name twin trap from firing inside a single
  prop name.
- **The honest-verdict framing over the bigger-diff framing.** Fourteen thousand lines
  scanned; the diff is +29/−56. As with the ui session, the deliverable is partly the
  negative result — zero never-passed, zero promotion candidates, zero write-only props —
  and the census that makes the claim auditable. Publishing a small true diff beat
  manufacturing a large speculative one.
- **Constraint compliance held everywhere it could have slipped.** Everything under
  `components/nina` (the co-located tests included); no `package_readme.md` touched (the
  directory's readme had been compacted by a sibling worker this same day — touching it
  hours later would have churned another session's fresh landing); no production DB (no
  DB-touching test is among the changes, and the full sweep ran green as-is); no file
  outside the directory; the classifier stayed uncommitted in gitignored `.next/`.

## Follow-ups & YAGNI notes
- **`components/admin` remains the other nominated-but-unswept directory.** The ui
  session's follow-up named two targets; this pass took `components/nina`. `components/admin`
  is larger than `ui` was, has had no optional-prop pass, and the v2 classifier
  (spread-aware) is the right instrument for it — admin's suites also render via helpers.
  The natural next assignment, and the scanner's port cost is now near zero.
- **`NinaSidebar.test.tsx:149` is the only exerciser of the slot seams.** If the sidebar
  tests are ever restructured to render real defaults, the `searchSlot`/`newChatSlot`
  keep-verdict should be re-read — their prop docstrings ("PHASE 6 SEAM", "PHASE 3 / R2
  SEAM") are the authority, and they record where an override would land in the R5 rail.
- **`NinaJobElapsed`'s bare span renders a ticking number with NO `tabular-nums` in
  production** — the removed test passed it; no caller ever did, so every production render
  to date has used the default proportional figures. If the number is ever seen jittering
  as it ticks, the fix belongs **at the callers** as a deliberate styling decision, not by
  re-adding the prop the sweep just removed.
- **The spread-heavy test style is a standing instrument constraint for this directory.**
  Per-component render helpers spreading base props are why naive per-attribute greps report
  13–31-site uncertainty per component here. Any future sweep of `components/nina` — dead
  code, prop liveness, anything call-site-shaped — needs the AST approach, not grep.
- **Deliberately NOT done, on YAGNI grounds:** the classifier script was not committed (the
  method is recorded here; committing a one-shot analyzer nobody will maintain is its own
  YAGNI violation), no prop was re-added "for flexibility", no `tabular-nums` was
  unilaterally added to the bare span, and no package readme was updated.

## Appendix

**Files touched** (all under `components/nina/`; 8 files, +29/−56, commit `4f655e0`):
```
components/nina/NewChatButton.test.tsx  |  5 ++---    (plus-glyph case rewritten, rider dropped)
components/nina/NewChatButton.tsx       |  9 +++++--  (drop className; rule doc'd with the R5 argument)
components/nina/NinaAvatar.test.tsx     |  5 ++---    (chip-shape case rewritten, rider dropped)
components/nina/NinaAvatar.tsx          | 13 +++-----   (drop className; rule doc'd)
components/nina/NinaJobElapsed.test.tsx | 12 --------   ("className rides the span" removed)
components/nina/NinaJobElapsed.tsx      | 13 +++-----   (drop className; bare span; rule doc'd)
components/nina/NinaJobList.test.tsx    | 12 --------   ("className rides the ul" removed)
components/nina/NinaJobList.tsx         | 16 ++++-----   (drop className; empty <p> and <ul> bare; rule doc'd)
```

**Verification performed:** positive-controlled TS-AST classifier (known-alive
`TypingIndicator.avatar` correctly attributed to `MessageList`; spreads flagged rather than
missed; the `children` reads on both providers caught as a nesting blind spot, not a
finding); all 34 components' every optional prop classified against repo-resolved call
sites; `next typegen` + `npx tsc --noEmit` exit 0 fully clean (zero findings — typegen run
first retired the known fresh-worktree noise); `vitest components/nina` 311/311; full repo
sweep 5,184/5,184 across 272 files, zero failures, zero flakes; repo-wide suite 5,186 →
5,184 (exactly the two removed fiction cases; touched suites 27 → 25); eslint clean on all
8 changed files; prettier clean after one `--write`; and the closed loop — the classifier
re-run against the edited tree shows the four `className` rows gone and only the two
documented-seam TEST-ONLY rows remaining.

**Session identity:** worker session `nina-optional-props`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-nina-optional-props`; work commit `4f655e0`; not merged
(coordinator lands worker branches). Mid-session 429 → ~9 idle minutes, recovered by the
coordinator's resume ping with no lost work.

**Related sessions:** `2026-09-12-ui-primitives-yagni.md` (the session that industrialized
the optional-prop-vs-call-sites scan and nominated this one; its v1 scanner's spread blind
spot is why v2 tracks spreads); `2026-09-11-nina-chat-component-tests.md`,
`2026-09-11-nina-composer-bubble-list-tests.md`,
`2026-09-11-nina-message-actions-sheet-tests.md` and
`2026-09-11-nina-remaining-component-tests.md` (the 31-suite coverage that made the pass
safe); `2026-09-12-pkg-readme-nina-cmp.md` (the directory's readme, compacted by a sibling
worker the same day — untouched here by constraint); `2026-09-12-tokenmax-charts-yagni.md`
(the `showTrendLine` required-promotion precedent, considered and declined for
`NinaAvatar`).
