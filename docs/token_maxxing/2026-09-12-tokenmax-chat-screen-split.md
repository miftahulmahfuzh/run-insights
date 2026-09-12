# Token-Maxxing Session — 2026-09-12: Nina ChatScreen Seven-Module Split

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `tokenmax-chat-screen-split`) pre-assigned one
  idea by the coordinator (`tokenmax-orch-2026-09-12`): *split
  `components/nina/ChatScreen.tsx` (1645 lines) into smaller cohesive subcomponents. Why: the
  largest untouched component in the repo, never restructured by today's sweep.*
- **Concrete changes:** 7 commits, net **+1519/−1099 across 8 paths** (7 survive — the
  short-lived `useAliveRef.ts` from commit 2 was deleted in commit 3, so the final diff is 7
  files). `ChatScreen.tsx`: **1645 → 672 lines** (646 before the final header-map commit added
  its 26-line module map). Total across the seven resulting files: **2065 lines**. Zero
  behavior change; the exported component contract never changed.
- **Real value delivered:**
  - **The largest client component in the repo decomposed along the concerns its own comments
    already drew** — one concern per module in `components/nina/`, every decision comment moved
    verbatim with the code it explains. What remains in `ChatScreen.tsx` is the skeleton: prop
    contracts, message-list state + server merge, the one-shot URL strip, the composer arms,
    and the render that wires it all.
  - **A genuinely transferable lint finding: a shared `alive` ref threaded from a custom hook
    is UNSATISFIABLE under this repo's lint setup.** The repo runs the React Compiler rule
    `react-hooks/preserve-manual-memoization` as an ERROR (verified: `eslint-plugin-react-hooks`
    7.1.1's recommended preset ships it as `"error"`). A ref returned by a custom hook
    simultaneously trips `exhaustive-deps` (which demands the ref in deps) and the compiler
    rule (which infers `alive.current` and errors on the mismatch); writing `alive.current` in
    deps merely flips the error to a warning. Resolution: **each hook inlines
    `useRef(true)` + the StrictMode re-arm effect** — a locally-created ref is the one shape
    both rules accept, and per-owner flags are semantically identical because the flag is only
    ever written at mount/unmount. The `useAliveRef.ts` abstraction died for this reason.
  - **Verification was deep and per-increment, not end-loaded:** vitest on
    `ChatScreen.test.tsx` (13 tests — it pins the whole wiring contract) + eslint on touched
    files + `npx tsc --noEmit` after every commit (vitest does NOT typecheck — an increment-1
    tsc miss was caught at increment 2 and fixed). Final sweep: full `components/nina` suite
    **31 files / 313 tests ALL PASS**; `npm run lint` shows only the 13 pre-existing findings
    in untouched files (proven via `git status`); `npm run knip` zero findings on the 7 touched
    files; `npm run typecheck` (typegen + tsc) exit 0; and the production `next build` that
    was still running at the worker's doc time **completed successfully** (BUILD_ID
    `m9dapQfHsMWzp0VC7slNL` written 21:08) — verified on the branch before being quoted here.
- **Branch:** `token-maxxing-2026-09-12-chat-screen-split`
- **Merge status:** on branch (worker branch, awaiting coordinator landing; not in origin/main
  at doc time — origin/main's tip is a different session's merge)
- **Approx token burn:** heavy (est. ~0.9M, input-dominated) — the burn went into full-file
  reads of the 1645-line original, the bundled Next 16 guide read, seven gate rounds (each a
  vitest + eslint + `tsc --noEmit`), the full 313-test nina sweep, knip, typegen+tsc, and a
  production build. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed a
pre-assigned idea. This worker drew the Nina chat screen — `components/nina/ChatScreen.tsx`,
at 1645 lines the largest client component in the repo and, unlike every other meaningful
directory, never restructured by the day's sweeps.

Two constraints shaped the work from the start:

- **AGENTS.md's standing warning** — this repo's Next.js has breaking changes vs. training
  data, so the bundled `interactive-apps.md` guide in `node_modules/next/dist/docs/` was read
  before writing any code. The refactor preserves the guide-mandated shape verbatim: plain
  `useState` + async handlers, no transitions, no `useOptimistic`. ChatScreen's header comment
  already argued *why* (a staggered reveal is a sequence of `setState` calls separated by real
  time; a transition would batch all four bubbles to the end and deliver them in one frame —
  RU-5, inverted), and the split inherits that argument untouched.
- **Escalation bar** — the idea was judged UNDER the `/analyze` escalation bar (single
  package, 7 files, no ordering hazard between the moves), so it was executed directly in 7
  commits rather than routed through a plan set.

The split had a property most refactors don't: the file's existing comment block already
delineated the concerns (the transition argument, the arrival machinery, the deep-link
landing, the sheet gestures). The work was therefore less "invent a decomposition" and more
"cut along the seams the comments drew, and let every comment travel with its code."

## What We Did (blow-by-blow)
1. **Read the bundled Next 16 `interactive-apps.md` guide** per AGENTS.md, confirming the
   component's no-transition shape is the guide's own prescription for exactly this kind of
   real-time multi-setState interaction, not a legacy accident.
2. **Commit `8babef5` — `chatScreenCopy.ts`** (61 lines): the `Notice` type,
   `NOTICE_TEXT`, and `RESEND_REFUSAL_TEXT` — every sentence the screen says, in one
   copy module. The first increment also carried the session's only type miss: `tsc
   --noEmit` was not run before committing, and the miss was caught and fixed at increment 2.
3. **Commit `5ea849a` — `usePhotoViewer.ts`** (77 lines): R10's photo overlay state and
   derivations, including the during-render close when a row vanishes underneath. This commit
   also introduced `useAliveRef.ts` (26 lines) as the shared mount-alive flag — the
   abstraction that later had to die.
4. **Commit `5f38772` — `useQuoteLanding.ts`** (351 lines, the largest module): R1's `?jump=`
   deep link — both the mount arrival and the soft-nav arrival, with their *deliberately
   different cleanup policies preserved unsymmetrized* — plus R12's quote tap, the landing
   flash, `measureQuoteScroll`, and the `COMPOSER_CLEARANCE_PX` geometry. **This commit
   deleted `useAliveRef.ts`:** threading the shared ref into callbacks proved unsatisfiable
   under the repo's `preserve-manual-memoization` error rule (details in the next section),
   so each hook took its own inline `useRef(true)` + re-arm effect instead.
5. **Commit `0318303` — `useTurnArrival.ts`** (311 lines): F36 R6's entire arrival
   machinery — `awaiting`/`typing` state, the live session id, the poll cursor, the staggered
   reveal, and the sequential poll loop. Its public surface to the send/resend paths is five
   verbs — `adoptSession` / `takeCursor` / `raiseCursor` / `beginAwaiting` / `endTurn` (plus
   the `showTyping` flag) — so the two directions of the screen share state only through an
   explicit, named protocol.
6. **Commit `0c4842f` — `useNinaSend.ts`** (307 lines): the send path — `busy`,
   `sendAndTrack` (optimistic row, content hashes, deduped tiles, `attachExisting`),
   `handleSend`. It exports the shared `SendAndTrackInput` type so the actions sheet can reuse
   the same tracking entry point.
7. **Commit `4a5add8` — `useMessageActions.ts`** (286 lines): R8's sheet — the acting row and
   the edit/delete/resend/retry handlers. Delete keeps both cleanup halves (the reply unpin
   AND the `clearFlashId`); retry reuses `sendAndTrack` with `replacesId` rather than
   duplicating the send path. This commit also reshaped `useNinaSend.ts` (+37) to expose the
   shared input type cleanly.
8. **Commit `9871833` — the header map** (+26 lines in `ChatScreen.tsx`): the file's opening
   doc comment gains a `WHAT THE SPLIT MOVED WHERE (2026-09-12)` section naming all six
   modules and stating the invariant that makes the split safe: *the hooks share nothing
   mutable — the message list and the notice strip belong to the component, patched through
   setters, and each hook keeps its own mount-alive flag*.
9. **Gates after every increment:** vitest on `ChatScreen.test.tsx` (13 tests — the file pins
   the whole wiring contract, so a broken rewire fails here first), eslint on touched files,
   and `npx tsc --noEmit` — the last added precisely because vitest does not typecheck, a gap
   the increment-1 miss demonstrated live.
10. **Final sweep:** full `components/nina` vitest suite **31 files / 313 tests, all pass**;
    `npm run lint` shows only the 13 pre-existing findings, all in files untouched by the
    branch (proven via `git status`); `npm run knip` reports zero findings on the 7 touched
    files (its other findings pre-date the branch); `npm run typecheck` (Next typegen + tsc)
    exits 0. A production `next build` was launched and finished successfully after the
    worker's own doc deadline — BUILD_ID `m9dapQfHsMWzp0VC7slNL` stamped 21:08 — closing the
    one gate the session left open.

## Code / Design Details

**The resulting module map** (as recorded in ChatScreen's own header):

| Module | Lines | Owns |
|---|---|---|
| `ChatScreen.tsx` | 672 | skeleton: prop contracts, message-list state + server merge, one-shot URL strip, composer arms, render |
| `chatScreenCopy.ts` | 61 | `Notice`, `NOTICE_TEXT`, `RESEND_REFUSAL_TEXT` — every sentence the screen says |
| `usePhotoViewer.ts` | 77 | R10 overlay state + derivations + during-render close |
| `useQuoteLanding.ts` | 351 | R1 `?jump=` deep link (mount + soft-nav arrivals), R12 quote tap, landing flash, `measureQuoteScroll`, `COMPOSER_CLEARANCE_PX` |
| `useTurnArrival.ts` | 311 | F36 R6 arrival: awaiting/typing, live session id, poll cursor, staggered reveal, sequential poll loop |
| `useNinaSend.ts` | 307 | busy, `sendAndTrack`, `handleSend`, shared `SendAndTrackInput` |
| `useMessageActions.ts` | 286 | R8 sheet: acting row + edit/delete/resend/retry |
| **Total** | **2065** | |

**The unsatisfiable shared ref, and the shape that satisfies both rules.** The deleted
`useAliveRef.ts` was a textbook clean abstraction — and that was the problem:

```ts
// DELETED — a ref returned by a custom hook cannot satisfy both rules:
export function useAliveRef() {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true          // re-arm in SETUP, so a StrictMode dev
    return () => { alive.current = false }   // remount lives again
  }, [])
  return alive
}
```

A caller receives `alive` as a value from a hook call. Then:

- `exhaustive-deps` sees a reactive value used inside an effect/callback and demands `alive`
  in the deps array;
- the React Compiler infers the access is really `alive.current` and
  `preserve-manual-memoization` errors on the deps/mismatch;
- writing `alive.current` in deps flips the error to a warning — still not clean.

The resolution, now repeated per hook (this is `useQuoteLanding.ts`'s live code, comment
included):

```ts
// A `useRef` created HERE — not a flag returned by a custom hook — is what keeps both
// react-hooks rules content: exhaustive-deps exempts a ref it can see being created, and the
// React Compiler treats `.current` on it as opaque, so no deps array has to mention either.
const alive = useRef(true)
useEffect(() => {
  alive.current = true
  return () => {
    alive.current = false
  }
}, [])
```

Per-owner flags are semantically identical to the shared one: the flag is only ever written at
mount and unmount, so two hooks can never observe each other's writes anyway. The comment
block stating this reasoning now lives at the first place a future reader would re-introduce
the shared hook.

**The cross-hook protocol.** The hooks share nothing mutable. The message list and the notice
strip are ChatScreen's own state, and hooks receive stable setters. `useTurnArrival` exposes
exactly five verbs to the send/resend paths (`adoptSession`, `takeCursor`, `raiseCursor`,
`beginAwaiting`, `endTurn`), and `useNinaSend` exports `SendAndTrackInput` so
`useMessageActions`' retry composes the real send path with `replacesId` instead of forking a
second one. Hook deps arrays list the passed-in setters — stable identities, zero churn.

**Deliberately-uneven code stayed uneven.** The two landing effects (mount arrival vs.
soft-nav arrival in `useQuoteLanding`) keep their different cleanup policies — a symmetry pass
that "unified" them would have been a behavior change, not a refactor. Every such decision
comment moved verbatim with its code, so the file that explains *why* is still adjacent to the
code it explains.

## Decisions & Trade-offs
- **Cut along the comment seams, don't invent new ones.** The 1645-line file's comment blocks
  already named the concerns; the decomposition followed them rather than imposing a
  layered architecture (no `hooks/` directory, no context providers, no prop-drilling
  helpers). The refactor is mechanical in the strongest sense: each commit's diff reads as
  "these lines, plus their comments, moved to this file."
- **Inline the per-owner alive ref rather than fight the linter.** The alternative shapes —
  an eslint-disable, or `alive.current` in deps accepting a standing warning — would have
  made the *first* shared-flag hook a loaded trap for the next author. Three small
  duplications of a five-line effect buy lint-honesty everywhere; the reasoning comment makes
  the duplication self-documenting.
- **`tsc --noEmit` after every increment, not just at the end.** Vitest does not typecheck
  (a standing repo memory), and the session proved it the honest way: increment 1 was
  committed with a type miss, caught at increment 2's gate, fixed, and the gate was kept for
  all five remaining increments.
- **No hook-level unit tests.** The new hooks' behavior is pinned through
  `ChatScreen.test.tsx`'s 13 tests, which exercise the full wiring contract. Beyond that,
  happy-dom has zero layout, so the DOM-measuring landing arithmetic
  (`measureQuoteScroll`, composer clearance) cannot be unit-tested meaningfully — a fake
  geometry test would pin nothing real. Deliberate, recorded omission.
- **The kill switch is the mechanicalness itself.** Every commit is a pure move; the worker
  recorded the unwind recipe — `git revert 9871833..HEAD` applied in reverse order — as the
  regression plan, rather than defending the split with behavior snapshots.
- **YAGNI held on shared surface.** No barrel file, no hooks index — the six new modules are
  imported directly by `ChatScreen.tsx` and nothing else. A barrel over modules with exactly
  one consumer is pure indirection.

## Follow-ups & YAGNI notes
- **Remaining large nina files for a future sweep:** `Composer.tsx` and `MessageList.tsx` —
  the natural next two cuts if the sweep continues, though their sizes were deliberately not
  measured this session (measuring them was this session's scope creep to resist).
- **No hook-level unit tests** (rationale above). If a future harness grows real layout
  measurement, `useQuoteLanding`'s scroll arithmetic is the first thing worth pinning.
- **The alive-ref finding generalizes:** any repo rule that enables
  `preserve-manual-memoization` as an error makes shared-ref custom hooks unsatisfiable —
  worth remembering before anyone extracts a "useFlag" utility elsewhere in this repo.
- **Kill switch:** `git revert 9871833..HEAD` in reverse order unwinds the whole split
  cleanly; each intermediate state passed its own gates.

## Appendix

**Commits (7, oldest first) with per-increment stats:**

```
8babef5 refactor(nina): extract ChatScreen copy into chatScreenCopy.ts
 components/nina/ChatScreen.tsx    |  57 +-----------------------------------
 components/nina/chatScreenCopy.ts |  61 ++++++++++++++++++++++++++++++++++++++

5ea849a refactor(nina): extract ChatScreen photo overlay into usePhotoViewer
 components/nina/ChatScreen.tsx    |  73 ++++++++++++-------------------------
 components/nina/useAliveRef.ts    |  26 +++++++++++++   (deleted again in 5f38772)
 components/nina/usePhotoViewer.ts |  77 +++++++++++++++++++++++++++++++++++++++

5f38772 refactor(nina): extract ChatScreen landing into useQuoteLanding
 components/nina/ChatScreen.tsx     | 317 ++-------------------------------
 components/nina/useAliveRef.ts     |  26 ---
 components/nina/useQuoteLanding.ts | 351 +++++++++++++++++++++++++++++++++++++

0318303 refactor(nina): extract the turn arrival machinery into useTurnArrival
 components/nina/ChatScreen.tsx    | 382 ++++++++++----------------------------
 components/nina/useTurnArrival.ts | 311 +++++++++++++++++++++++++++++++

0c4842f refactor(nina): extract the send path into useNinaSend
 components/nina/ChatScreen.tsx | 262 ++++-------------------------------
 components/nina/useNinaSend.ts | 300 +++++++++++++++++++++++++++++++++++++++++

4a5add8 refactor(nina): extract the actions sheet handlers into useMessageActions
 components/nina/ChatScreen.tsx       | 278 ++++------------------------------
 components/nina/useMessageActions.ts | 286 +++++++++++++++++++++++++++++++++++
 components/nina/useNinaSend.ts       |  37 +++--

9871833 docs(nina): map the split in ChatScreen's header
 components/nina/ChatScreen.tsx | 26 ++++++++++++++++++++++++++
```

Range total: 8 paths, +1519/−1099 (7 files net, `useAliveRef.ts` cancelling out).

**Verification performed:** per-increment vitest on `ChatScreen.test.tsx` (13 tests) + eslint
on touched files + `npx tsc --noEmit`; final sweep — full `components/nina` suite 31 files /
313 tests pass, `npm run lint` only the 13 pre-existing findings in untouched files (proven
via `git status`), `npm run knip` zero findings on the 7 touched files, `npm run typecheck`
(typegen + tsc) exit 0, production `next build` success (BUILD_ID
`m9dapQfHsMWzp0VC7slNL`, 21:08 — the gate still running at the worker's doc time, verified
afterwards on the branch before being claimed).

**Importers untouched:** `app/nina/page.tsx` and `components/nina/ChatScreen.test.tsx` are
the only two importers of `ChatScreen`; the exported component contract never changed.

**Lint-rule evidence:** `eslint-plugin-react-hooks` 7.1.1 recommended preset ships
`react-hooks/preserve-manual-memoization: "error"` (pulled in via
`eslint-config-next/core-web-vitals`; the repo's own `eslint.config.mjs` adds no override).

**Session identity:** worker session `tokenmax-chat-screen-split`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-chat-screen-split`; final commit `9871833`; on branch at doc time
(landing belongs to the coordinator).
