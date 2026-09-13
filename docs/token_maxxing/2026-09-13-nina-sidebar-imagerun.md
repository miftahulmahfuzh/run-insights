# Token-Maxxing Session — 2026-09-13: Nina Sidebar/Imagerun Doc-Drift Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `nina-sidebar-imagerun`) in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`), assigned one idea verbatim: deeply read
  `components/nina/NinaSidebar.tsx` (907 lines), `lib/nina/imagerun.ts` (901 lines), and
  `lib/nina/context.ts` (886 lines) for dead code, doc drift, and genuine mixed-concerns worth
  splitting — not on line-count alone. The pitch: none of these three had been touched by any
  prior token-maxxing session despite being among the largest files in their directories.
- **Concrete changes:** one commit, `e15c3d6` — "fix(nina): repair stale MessageList.tsx
  scroll citation in NinaSidebar". Repointed a stale doc comment in
  `components/nina/NinaSidebar.tsx` that cited `MessageList.tsx:163,223` for
  `window.scrollTo` call sites that had moved to `components/nina/useChatPageScroll.ts`
  (lines 120 and 180) the day before, in the 2026-09-12 chat-screen split.
- **Real value delivered:**
  - **Found and fixed one genuine, freshly-introduced doc-drift bug**: `NinaSidebar.tsx`'s
    ~250-line keyboard/scroll-reassert effect justified its window-scroll listener by citing
    exact line numbers in `MessageList.tsx` where the chat page calls `window.scrollTo`. That
    citation was already wrong by the time this session read it — `MessageList.tsx`'s own
    header now documents "WHAT THE SPLIT MOVED (2026-09-12)," recording that the scroll
    machinery (both `window.scrollTo` call sites included) had moved out into the newly
    extracted `useChatPageScroll.ts` hook. `NinaSidebar.tsx`'s citation was never updated to
    match, so it pointed a future reader at the wrong file and the wrong (now-stale) line
    numbers. Fixed by repointing the comment to `useChatPageScroll.ts:120,180`, with a note
    explaining the split.
  - **Verified roughly 20 other checkable factual claims across the three files** against the
    live repo state, and two of them directly against the live Vercel docs pages they cite —
    all held up; this is what turned "read three large files" into a real, load-bearing
    verification pass rather than a skim.
  - **Confirmed no dead code in any of the three files**: every export from
    `NinaSidebar.tsx`, `imagerun.ts`, and `context.ts` is used by at least one other file,
    checked individually via repo-wide grep.
  - **Declined two speculative splits, with reasoning recorded on the record** rather than
    forcing a refactor to justify the session: NinaSidebar's keyboard/scroll effect is a
    single invariant-bound unit shaped by three documented production incidents, with zero
    test coverage because happy-dom cannot simulate the iOS keyboard-reveal behavior it
    corrects; and `imagerun.ts` is already the thin orchestration layer atop roughly a dozen
    already-split sibling modules, not a mixed-concerns dump.
- **Branch:** `token-maxxing-2026-09-13-nina-sidebar-imagerun`
- **Merge status:** on branch, not merged — this is a WORKER session in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`); the coordinator owns merging worker
  branches to main, not the worker itself.
- **Approx token burn:** moderate-high — full read of 3 files (~2700 lines combined), a fork
  agent for independent claim verification, direct grep/Read verification of ~20 claims, 2
  live WebFetch calls against vercel.com, a typecheck pass, a targeted test run, and a
  prettier check, all in service of landing a single, narrowly-scoped comment fix. 🔥

## Context & Motivation
This was a WORKER session in the 2026-09-13 token-maxxing fan-out, coordinated by
`tokenmax-orch-2026-09-13`. The coordinator pre-assigned one idea verbatim, with slug
`nina-sidebar-imagerun`: deeply read `components/nina/NinaSidebar.tsx` (907 lines),
`lib/nina/imagerun.ts` (901 lines), and `lib/nina/context.ts` (886 lines) — three of the
largest files in their respective directories — for dead code, doc drift, and genuine
mixed-concerns worth splitting. The assignment was explicit that size alone should not
motivate a split; a split had to earn its place by separating concerns that weren't already
separated.

The underlying justification was simple: unlike most of `components/nina` and `lib/nina`,
none of these three specific files had been touched by any prior token-maxxing session in this
multi-day campaign, despite their size making them obvious candidates for exactly this kind of
sweep. This session's job was to give them the first real look.

All three files share this codebase's dense, heavily-narrated documentation style — long
docstrings and inline comments that make many specific, checkable factual claims: about
sibling files' contents and behavior (including exact line numbers), about test coverage,
about external doc pages (with cited "last updated" dates), about model names, and about
constant values. That density is exactly what makes doc drift both likely (any of those
citations can go stale the moment the file it cites changes) and checkable (each claim can be
verified against the current repo state, and in two cases against a live external source).

## What We Did (blow-by-blow)
1. **Read all three files in full**, front to back, rather than skimming for size — roughly
   2700 lines combined. Treated every specific, falsifiable claim encountered (a cited file
   and line number, a cited constant value, a cited external doc URL with a "last updated"
   date, a cited test file, a cited model name) as something to verify rather than something
   to trust because it read as confident and detailed.
2. **Dispatched a fork agent for independent claim verification** to cross-check findings
   without polluting this session's own context with the mechanical grep/Read noise of
   chasing down each citation.
3. **Directly verified roughly 20 of those claims** via grep and Read against the current
   repo state:
   - `components/ui/Sheet.tsx`'s three documented behaviors — confirmed current.
   - `components/ui/usePanelParam.ts`'s quoted Next.js history-API text — confirmed current.
   - Tailwind 4.3.3's `transition-property: transform, translate, scale, rotate` — grepped
     straight out of the installed `node_modules/tailwindcss/dist/lib.js`, matching the cited
     version exactly.
   - `tests/nina.sidebarProvider.test.ts` and `tests/motion.reducedMotion.test.ts` — both
     exist with the claimed structural assertions.
   - `lib/nina/search.ts` and `createNinaChatSession` (`lib/nina/sessionActions.ts`) — both
     exist as claimed.
   - `scripts/nina-image-worker.ts` and `.github/workflows/nina-image.yml` — both still exist
     as the off-platform backstop the docs describe.
   - `NINA_IMAGE_REVIVE_BUDGET` — still 1, as cited.
   - `sweepStaleNinaImageJobs`'s 20-minute figure — still matches
     `NINA_IMAGE_STALE_MS = 1_200_000`.
   - `lib/llm/facts.ts`'s three-way divergence claims made inside `context.ts` — still
     accurate; `facts.ts`'s `note`/`splits` exclusions are unchanged, and `context.ts`'s own
     "WHY NOT REUSE NarrativeProfile" section already correctly tracks that `facts.ts` also
     gained `weightKg`/`sex` under the same RU-1 repeal, so this reads as easy-to-misread-in-
     isolation rather than actual drift.
   - `glm-5.3`/`glm-4.6v` — still the live model names used elsewhere in `lib/nina/`.
   - `CONTEXT_MESSAGE_WINDOW` (40, `lib/nina/load.ts:64`) and `lib/nina/patterns.ts` — both
     check out against the files' claims about them.
4. **Live-verified two claims against vercel.com directly**, rather than trusting the cited
   "last updated" dates at face value: fetched `https://vercel.com/docs/fluid-compute` and
   `https://vercel.com/docs/functions/configuring-functions/duration`. Both still carry
   `last_updated: 2026-08-24`, exactly as `imagerun.ts`'s docstring cites, and both still state
   the Hobby-plan 300s default/max duration and the "fluid compute on by default since
   2025-04-23" facts that `imagerun.ts`'s justification for moving image generation
   on-platform (instead of the off-platform worker) rests on.
5. **Found the one genuine drift**: `NinaSidebar.tsx`'s keyboard/scroll-reassert effect cited
   `MessageList.tsx:163,223` as the location of the chat page's `window.scrollTo` calls, used
   to justify why the sidebar needs its own window-scroll listener. Reading
   `components/nina/MessageList.tsx`'s own header revealed a "WHAT THE SPLIT MOVED
   (2026-09-12)" section recording that this exact scroll machinery — both `window.scrollTo`
   call sites — had been extracted into `components/nina/useChatPageScroll.ts` the day before
   this session ran, now living at lines 120 and 180. `NinaSidebar.tsx`'s citation was never
   updated to follow the move.
6. **Fixed the citation** in `NinaSidebar.tsx`, repointing it to
   `useChatPageScroll.ts:120,180` and adding a short note that the scroll machinery moved
   there in the 2026-09-12 split, so a future reader hitting the same citation won't be sent
   to the wrong file.
7. **Committed the fix as `e15c3d6`** — "fix(nina): repair stale MessageList.tsx scroll
   citation in NinaSidebar".
8. **Checked every export of all three files for dead code**, one export at a time via
   repo-wide grep. Every export from `NinaSidebar.tsx`, `imagerun.ts`, and `context.ts` has at
   least one real importer — no dead code found in any of the three files.
9. **Evaluated both files for genuine mixed-concerns splits and declined both**, recording the
   reasoning rather than silently skipping the question:
   - NinaSidebar's ~250-line keyboard/scroll-reassert effect is a single invariant-bound unit
     — its own comments forbid adding a dependency to the effect's dependency array — shaped
     by three separately documented production incidents (R1/R2/R3). It has zero test
     coverage because happy-dom cannot simulate the iOS keyboard-reveal behavior the effect
     corrects. Extracting it to a hook would add file-boundary indirection with no regression
     net, under a change that is inherently hard to get right twice.
   - `lib/nina/imagerun.ts` is already the thin orchestration layer (claim → call → store →
     finish → retry) sitting atop roughly a dozen already-split sibling modules
     (`imagecall.ts`, `imageDedupe.ts`, `imagejobs.ts`, `imagerecipe.ts`, `blobRelease.ts`,
     `caption.ts`, `errorlogs.ts`, `sessionResolve.ts`, `queries.ts`, `perceptualSign.ts`,
     `imageprefs.ts`, `imagefail.ts`). It is not a mixed-concerns dump; it is the one file that
     ties those already-separated concerns together, and splitting it further would not
     separate anything that isn't already separated.
10. **Verified the fix with a full gate pass** before committing: `npx next typegen && npx tsc
    --noEmit` (clean); the three directly-relevant test files, 26/26 passing; `npx prettier
    --check` (clean).

## Code / Design Details

**The stale citation, before and after** (the actual diff from commit `e15c3d6`), in
`components/nina/NinaSidebar.tsx`'s keyboard/scroll-reassert effect:

```diff
      * ── THE WINDOW IS THE CHANNEL THAT ASSERT CANNOT SEE, AND THE REPORT SURVIVED IT ─────────────
-     * The conversation behind this opaque panel scrolls the WINDOW (`MessageList` calls
-     * `window.scrollTo` — MessageList.tsx:163,223), so the document carries real scrollable
-     * overflow while the panel is open, and the keyboard reveal's second act pans the layout
+     * The conversation behind this opaque panel scrolls the WINDOW (the chat page's scroll
+     * machinery calls `window.scrollTo` — moved out of `MessageList.tsx` into
+     * `useChatPageScroll.ts:120,180` by the 2026-09-12 split; MessageList's own header records the
+     * move), so the document carries real scrollable overflow while the panel is open, and the
+     * keyboard reveal's second act pans the layout
       viewport itself: `window.scrollY` moves, and every `position: fixed` element on the glass
```

The underlying behavior described by the comment (why the sidebar needs its own
window-scroll listener) was never wrong — only the citation pointing at where the related
logic lives had gone stale, one day after the split that moved it.

## Decisions & Trade-offs
- **Treated dense, confident documentation as a set of falsifiable claims, not as ambient
  truth.** The volume of specific detail in these three files (exact line numbers, exact
  constant values, exact external doc dates) is precisely what makes silent drift both likely
  and worth hunting for — a vaguer comment can't go stale in a checkable way, but a citation
  with a line number can, and did.
- **Verified two claims against live external sources instead of only the repo.**
  `imagerun.ts`'s justification for its architecture rests partly on Vercel platform behavior
  (fluid compute defaults, Hobby-plan duration limits) that could change independently of this
  repo; fetching the actual current doc pages was the only way to confirm the citation, not
  just the code, was still accurate.
- **Fixed exactly one bug and did not manufacture additional busywork to look more productive
  during a burn session.** Once ~20 claims checked out clean and dead-code coverage came back
  empty, the honest report is "found one real bug, verified everything else" — not padding the
  diff with unnecessary touch-ups to the two clean files.
- **Declined both speculative splits on their merits, not to save effort.** NinaSidebar's
  effect is untestable-by-design (an iOS keyboard behavior happy-dom can't simulate) and
  already invariant-bound by its own comments; splitting it would trade a working, if
  understaffed-on-tests, unit for indirection with no safety net. `imagerun.ts` is the
  connective tissue for concerns already split into a dozen sibling files elsewhere — further
  splitting it would not separate anything, it would just add a layer.
- **Did not extend scope beyond the three assigned files.** The fix touched only
  `NinaSidebar.tsx`; no changes were made to `MessageList.tsx`, `useChatPageScroll.ts`,
  `imagerun.ts`, or `context.ts` themselves, since none of them needed one.

## Follow-ups & YAGNI notes
- **NinaSidebar's keyboard/scroll-reassert effect remains untested.** A future session with
  access to a real device-behavior test harness (rather than happy-dom) could pin the iOS
  keyboard-reveal correction directly; this session did not attempt to build such a harness,
  since that is a materially larger undertaking than a doc-drift audit.
- **Deliberately NOT done, on YAGNI grounds:** no split of NinaSidebar's scroll effect into a
  hook; no further split of `lib/nina/imagerun.ts`; no changes to `context.ts` (every claim
  checked there held up, with nothing to fix); no touching of any file outside
  `components/nina/NinaSidebar.tsx`; no merge to main (worker session; coordinator's job).
- **A general pattern worth naming for future doc-drift audits**: a file-split changelog entry
  ("WHAT THE SPLIT MOVED") in the split-out file itself is a great place to look for exactly
  this class of bug — anything a *sibling* file cited about the pre-split location is now
  silently wrong, and the split's own commit will not have touched the sibling to fix it.

## Appendix

**Commit on this branch (worker, not yet merged):**
```
e15c3d6 fix(nina): repair stale MessageList.tsx scroll citation in NinaSidebar
```

**Verification performed:** `npx next typegen && npx tsc --noEmit` — clean; the three
directly-relevant test files — 26/26 passing; `npx prettier --check` — clean; every export of
`NinaSidebar.tsx`, `imagerun.ts`, and `context.ts` individually grepped repo-wide for
importers — all in use; ~20 factual claims across the three files verified against current
repo state via direct grep/Read; 2 of those claims additionally verified live against
`https://vercel.com/docs/fluid-compute` and
`https://vercel.com/docs/functions/configuring-functions/duration`.

**Session identity:** worker session `nina-sidebar-imagerun`, spawned by coordinator
`tokenmax-orch-2026-09-13`; branch `token-maxxing-2026-09-13-nina-sidebar-imagerun`; worktree
`/home/miftah/.worktrees/run-insights/tokenmax-2026-09-13-nina-sidebar-imagerun`; commit
`e15c3d6`; not merged — the coordinator lands worker branches.

**Related sessions:** `2026-09-12-tokenmax-chat-screen-split.md` (the chat-screen split that
extracted `useChatPageScroll.ts` from `MessageList.tsx`/`ChatScreen.tsx`, whose "WHAT THE
SPLIT MOVED" changelog entry is what let this session locate the stale citation);
`2026-09-13-nina-turnflight-yagni.md` (the same day's sibling worker over
`components/nina`/`lib/nina`, under the same `tokenmax-orch-2026-09-13` coordinator).
