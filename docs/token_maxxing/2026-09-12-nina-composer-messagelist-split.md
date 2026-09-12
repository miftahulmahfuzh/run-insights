# Token-Maxxing Session — 2026-09-12: Nina Composer & MessageList Split

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `tokenmax-nina-composer-messagelist-split`)
  pre-assigned one idea by the coordinator (`tokenmax-orch-2026-09-12`): *split
  `components/nina/Composer.tsx` and `components/nina/MessageList.tsx` into cohesive
  hook/copy modules the way ChatScreen.tsx was split. Why: that session's own follow-up
  notes named these two files as the explicit next large-file splits in `components/nina`,
  deliberately left unmeasured/untouched to keep its scope disciplined.*
- **Concrete changes:** 4 commits, net **+697/−508 across 7 paths** (base `c42c67a`).
  `Composer.tsx`: **752 → 440 lines**; `MessageList.tsx`: **344 → 222 lines**. Three new
  modules: `useComposerPhotos.ts` (339), `useChatPageScroll.ts` (188), `useComposerDraft.ts`
  (95) — the five-file total is 1284 lines. Zero behavior change; Composer's props contract
  is untouched, so `ChatScreen`'s call site never moved.
- **Real value delivered:**
  - **The two files the chat-screen-split session explicitly deferred are now decomposed
    along the same seams** — cut where the files' own header comments already delineated
    concerns, every decision comment moved verbatim with the code it explains. Composer
    keeps only the render contract, props contracts, `canSend`, and the `submit` junction;
    MessageList keeps only composition.
  - **The session's one non-mechanical decision is its best export: `useChatPageScroll`
    takes PRIMITIVES (`messageCount`, `lastMessageIsFromUser`), not the messages array.**
    Both reasons are argued in the hook's header: RULING E2b's locality stays true
    (MessageList remains the one module that knows `ChatMessage`'s field names — its
    quote-candidates memo is the only field derivation left there), and the hook is honest
    about what its cause derivation actually reads. The behavioral note is documented: the
    old effect re-ran on every messages identity change including in-place edits, those
    runs re-synced refs and returned on a null cause, so skipping them is
    outcome-identical.
  - **Verification was per-increment and complete before doc time:** vitest + eslint +
    `npm run typecheck` (typegen + tsc) after every increment; final sweep — full
    `components/nina` suite **31 files / 313 tests ALL PASS** (same counts as the
    chat-screen baseline), `npm run lint` 0 errors with 12 warnings all in untouched
    files, `npm run knip` zero findings on the 7 touched files, prettier clean, and the
    production `next build` **EXIT 0 (BUILD_ID `Vjbm-y4E-Om54KiWbiMSb`)** — verified
    before this doc was written, unlike the predecessor session whose build landed after
    doc time.
- **Branch:** `token-maxxing-2026-09-12-nina-composer-messagelist-split`
- **Merge status:** on branch (worker branch, awaiting coordinator landing per Worker Mode
  W4; not in origin/main at doc time)
- **Approx token burn:** heavy (est. ~0.8M, input-dominated) — the burn went into reading
  both source files in full plus their header-comment seams, the bundled Next 16 guide
  re-read, four gate rounds (each vitest + eslint + typegen+tsc), the full 313-test nina
  sweep, knip, prettier, and a production build. 🔥

## Context & Motivation
This session continues the 2026-09-12 token-maxxing fan-out run by coordinator
`tokenmax-orch-2026-09-12`. Its premise is literally written down in another session's
doc: the chat-screen-split worker's follow-up notes named `Composer.tsx` and
`MessageList.tsx` as the natural next two cuts and deliberately did not measure or touch
them, resisting that session's scope creep. This worker inherited the deferred half of
exactly that idea.

The same two constraints applied as in the predecessor:

- **AGENTS.md's standing warning** — the bundled Next 16 `interactive-apps.md` guide in
  `node_modules/next/dist/docs/` was read before coding. The files' plain-`useState` shape
  was preserved verbatim: no transitions, no `useOptimistic` introduced anywhere in the
  split.
- **Escalation bar** — single package, 7 files, no ordering hazard between the moves, so
  the work ran directly as 4 ordered commits rather than a plan set.

Both source files had the same helpful property ChatScreen had: header comments that
already delineated the concerns. Composer's header separated
picker-latency/hashing/planNinaPicked (which moved with the photo pipeline) from
geometry/glass/16px/44px/reply-strip (which stayed with the render). MessageList's scroll
concerns were already split three ways in prose across `lib/nina/chatview.ts` (pure
arithmetic) and `useChatScroll.ts` (the URL mark half) — this session only had to name the
fourth quarter and give it a home.

## What We Did (blow-by-blow)
1. **Read the bundled Next 16 `interactive-apps.md` guide** per AGENTS.md, confirming
   plain `useState` + async handlers is the guide's prescription for these interactive
   client components, then read both files in full and inventoried their header-comment
   seams before cutting anything.
2. **Commit `b401b95` — `useComposerPhotos.ts`** (339 lines, the largest new module): the
   entire photo pipeline. `Tile`/`TileState` shapes; the compress → `contentHashOf`
   (two keys: encode hash + source hash) → `findNinaDuplicateChatImage` pre-check → Blob
   upload → `describeNinaImage` state machine; `planNinaPicked`'s decide-then-set-then-run
   `onPick`; `removeTile` with the dropped-ids set; `REJECTION_TEXT` copy; and the exported
   `ComposerDraftImage` payload union. Four header sections moved verbatim from Composer's
   header: "THE PICKER, AND WHY IT UPLOADS IMMEDIATELY (PHASE 6)", "WHY EVERY PICK IS
   HASHED (media-dedupe P2)", "WHY planNinaPicked IS A PURE FUNCTION IN lib/", and the
   userId-not-a-capability section (reworded prop→argument, since the hook is what builds
   the pathname). New surface verbs: `collectDraft()` (the ready-tiles →
   `ComposerDraftImage` mapping that submit used to inline) and `reset()` (revoke previews,
   drop tiles, drop notice). `ComposerDraftImage`'s two importers repointed to the type's
   new home: `useNinaSend.ts` and `Composer.test.tsx`.
3. **Commit `ae0802c` — `useComposerDraft.ts`** (95 lines): the text half. `value` state,
   textarea ref, the reply-arming focus effect (keyed on `replyTargetId`), autoresize
   (`TEXTAREA_MAX_PX=132`), `handleChange`, and `clear()` — empty draft + collapse height +
   the release-the-keyboard blur with its owner-ask comment verbatim. `isPhoneReturn()` and
   the module-level matchMedia cache moved as an EXPORTED module function rather than a
   hook method, because the Enter split itself stays in Composer's `onKeyDown` — it is
   render wiring deciding which key sends. `submit()` in Composer now reads as the
   junction: `onSend(draft.value.trim(), collectDraft())`, then the two reset halves
   grouped by owner — `clearDraft()` then `resetPhotos()`. One documented nuance: the new
   epilogue's order differs from the original's exact sequence (original: setValue, revoke,
   tiles, notice, height, blur; new: setValue, height, blur, revoke, tiles, notice) — every
   step is synchronous, so the reorder is unobservable; stated in the code comment and the
   commit message.
4. **Commit `21643fa` — the header map** (+19 lines in `Composer.tsx`): a
   `WHAT THE SPLIT MOVED WHERE` section in the same format as ChatScreen's, naming both
   new hook modules and what stayed behind.
5. **Commit `25d875c` — `useChatPageScroll.ts`** (188 lines): MessageList's behaviour
   half. The passive reader-position sampler effect; the R14 restore-to-mark
   `useLayoutEffect` (with its rAF re-application); and the follow-new-content effect with
   its cause table (mount / own-message / incoming / viewport). All comments verbatim.
   **The key design decision lives here:** the hook takes primitives — `messageCount` and
   `lastMessageIsFromUser` (plus `typing`, `keyboardOverlapPx`, `restoreMark`) — NOT the
   messages array, for the two reasons in the Achievement above. MessageList.tsx now opens
   with a single `useChatPageScroll({...})` call and keeps composition only; its header
   gained a `WHAT THE SPLIT MOVED (2026-09-12)` section laying out the three-way scroll
   split: `lib/nina/chatview.ts` (pure arithmetic) / `useChatScroll.ts` (URL mark half,
   untouched) / `useChatPageScroll.ts` (behaviour half).
6. **Gates after every increment:** vitest on `Composer.test.tsx` (19 tests) after
   increments 1–2; `MessageList.test.tsx` (12) + `ChatScreen.test.tsx` (13) after
   increment 4; eslint on touched files after every increment; `npm run typecheck` (next
   typegen + `tsc --noEmit`) after every increment — this worktree needed the typegen run
   first, since bare tsc shows the known PageProps/LayoutProps missing-typegen errors (a
   standing repo memory for fresh worktrees).
7. **Final sweep:** full `components/nina` vitest suite **31 files / 313 tests, all pass**
   — the same counts as the chat-screen-split session's baseline, so zero regressions;
   `npm run lint` 0 errors, 12 warnings ALL in files untouched by the branch (the
   predecessor measured 13 pre-existing; the count moved because the base moved — proven
   via `git status` + file list); `npm run knip` ZERO findings on the 7 touched files (its
   ~70 findings elsewhere in lib/metrics, app/, tests/ pre-date the branch and touch no
   file this branch touched); prettier `--check` clean on all 7 touched files; production
   `npm run build` EXIT 0, BUILD_ID `Vjbm-y4E-Om54KiWbiMSb` — completed and verified
   before this doc was written, closing the gate the predecessor session had to close
   after its own doc time.

## Code / Design Details

**The resulting module map:**

| Module | Lines | Owns |
|---|---|---|
| `Composer.tsx` | 440 (was 752) | render contract, props contracts, `canSend`, the `submit` junction, Enter-split `onKeyDown` |
| `MessageList.tsx` | 222 (was 344) | composition only — one `useChatPageScroll({...})` call + the quote-candidates memo |
| `useComposerPhotos.ts` | 339 | Tile/TileState, compress → double-hash → dedupe pre-check → upload → describe state machine, `planNinaPicked`, `removeTile`, `REJECTION_TEXT`, `ComposerDraftImage` |
| `useComposerDraft.ts` | 95 | value state, textarea ref, reply-arming focus, autoresize, `handleChange`, `clear()`, exported `isPhoneReturn()` |
| `useChatPageScroll.ts` | 188 | reader-position sampler, R14 restore-to-mark (+rAF), follow-new-content with its cause table |
| **Five-file total** | **1284** | |

**The submit junction.** After both composer extractions, the component's send handler
degenerates to two lines of orchestration plus owner-grouped resets:

```ts
onSend(draft.value.trim(), collectDraft())
clearDraft()    // the text half: empty draft, collapse height, release-keyboard blur
resetPhotos()   // the photo half: revoke previews, drop tiles, drop notice
```

`collectDraft()` is the seam that made this read possible — the ready-tiles →
`ComposerDraftImage` mapping that submit used to inline became a named verb on the photo
hook, so neither half of the reset needs to know the other exists.

**The primitives-not-array hook input.** The one non-mechanical decision of the session,
fully argued in `useChatPageScroll`'s header:

```ts
// NOT (messages: ChatMessage[]) — the hook reads only two derived facts:
useChatPageScroll({ messageCount, lastMessageIsFromUser, typing, keyboardOverlapPx, restoreMark })
```

(a) RULING E2b's locality survives: `MessageList` stays the one module that knows
`ChatMessage`'s field names — its quote-candidates memo is the only field derivation left
in the file. (b) The hook is honest about what its cause derivation reads: it never needed
the array, only its length and whether the last row is the user's own. The behavioral note
is recorded rather than hand-waved: the old effect re-ran on every messages identity
change, including in-place edits; those extra runs re-synced refs from the same values and
returned on a null cause, so skipping them is outcome-identical, not a behavior change
being smuggled in.

**Contract-level moves, not shims.** `ComposerDraftImage` moved to its producer
(`useComposerPhotos.ts`) and both importers (`useNinaSend.ts`, `Composer.test.tsx`)
repointed — no re-export from `Composer.tsx`, which would be indirection knip would
eventually question. Composer's props contract never changed, so `app/nina/page.tsx` and
`ChatScreen.tsx` — the only importers of the two components — were untouched.

## Decisions & Trade-offs
- **Cut along the comment seams, again.** Same method as the predecessor, and it worked
  twice: Composer's header already delineated picker-latency/hashing/planNinaPicked
  (moved with the pipeline) vs geometry/glass/16px/44px/reply-strip (stayed with the
  render). The diffs read as "these lines, plus their comments, moved to this file."
- **NO `composerCopy.ts`, deliberately.** Half of Composer's user-visible strings are
  render-inline (placeholder, aria-labels); a partial copy module would lose the
  one-place property that justified `chatScreenCopy.ts` in the predecessor. Instead,
  `REJECTION_TEXT` and the two pipeline error strings travelled with their producer inside
  `useComposerPhotos.ts`.
- **No re-export shim for `ComposerDraftImage`.** The type moved to its producer and both
  importers repointed; a courtesy re-export from `Composer.tsx` would be exactly the kind
  of indirection the freshly-adopted knip gate exists to question.
- **`isPhoneReturn` exported rather than folded into the hook.** The Enter split is render
  wiring — it decides which physical key sends — so it stays in the component's
  `onKeyDown`; only the platform probe moved out, as an exported module function with its
  matchMedia cache.
- **The primitives-not-array hook input** (detailed above) is the session's one
  non-mechanical decision, and it buys both the locality ruling and honesty about data
  flow; the cost is that MessageList derives two facts the hook used to derive itself,
  which is two lines of trivially-checked arithmetic.
- **Conventions matched, not invented.** All three new hooks use `'use client'` with
  input-side annotated params and inferred returns, matching `useTurnArrival`/`useChatScroll`.
  Inferred returns keep `Tile` unexported — which is also why knip stays silent.
- **The kill switch is the 4 ordered commits.** `git revert 25d875c..b401b95` in reverse
  (or the `c42c67a..HEAD` range) unwinds cleanly; each intermediate state passed its own
  gates, so any single commit is a valid resting point.

## Follow-ups & YAGNI notes
- **The chat-screen-split lineage is now closed:** both files its follow-up notes named
  are split, with the same method and the same gates. No third nina component stands out;
  a future sweep should re-measure the directory rather than assume more monoliths.
- **No hook-level unit tests added** — the same deliberate omission and rationale as the
  predecessor: behavior is pinned through the existing component suites
  (`Composer.test.tsx` 19, `MessageList.test.tsx` 12, `ChatScreen.test.tsx` 13), and
  happy-dom has zero layout, so the scroll arithmetic cannot be meaningfully unit-tested.
  `useChatPageScroll`'s cause table is the first thing worth pinning if a harness ever
  grows real layout measurement.
- **The primitives-input pattern generalizes:** any hook extracted from a list-owning
  component should ask "does the effect read the array, or two facts about it?" before
  taking the array. Worth remembering before the next extraction in this repo.
- **YAGNI held:** no barrel file over the new hooks, no `hooks/` subdirectory, no
  copy-module extraction, no transition/`useOptimistic` modernization (explicitly out per
  the Next guide read).

## Appendix

**Commits (4, oldest first) with per-increment stats:**

```
b401b95 refactor(nina): extract the composer's photo pipeline into useComposerPhotos
 components/nina/Composer.test.tsx    |   3 +-
 components/nina/Composer.tsx         | 322 +++------------------------------
 components/nina/useComposerPhotos.ts | 339 +++++++++++++++++++++++++++++++++++++
 components/nina/useNinaSend.ts       |   2 +-

ae0802c refactor(nina): extract the composer's text half into useComposerDraft
 components/nina/Composer.tsx        |  85 +++++++--------------------------
 components/nina/useComposerDraft.ts |  95 +++++++++++++++++++++++++++++++++++++

21643fa docs(nina): map the composer split in Composer's header
 components/nina/Composer.tsx | 19 ++++++++++++++++++

25d875c refactor(nina): extract the conversation's scroll behaviour into useChatPageScroll
 components/nina/MessageList.tsx      | 158 ++++-------------------------
 components/nina/useChatPageScroll.ts | 188 +++++++++++++++++++++++++++++++++++
```

Range total (base `c42c67a`): 7 files, +697/−508.

**Verification performed:** per-increment vitest (`Composer.test.tsx` 19 tests after
increments 1–2; `MessageList.test.tsx` 12 + `ChatScreen.test.tsx` 13 after increment 4) +
eslint on touched files + `npm run typecheck` (next typegen + `tsc --noEmit` — typegen
first, per the fresh-worktree PageProps/LayoutProps memory); final sweep — full
`components/nina` suite 31 files / 313 tests pass (identical counts to the chat-screen
baseline), `npm run lint` 0 errors / 12 warnings all in untouched files (proven via
`git status` + file list; predecessor measured 13 pre-existing on an older base),
`npm run knip` zero findings on the 7 touched files, prettier `--check` clean on all 7,
production `next build` exit 0 (BUILD_ID `Vjbm-y4E-Om54KiWbiMSb`).

**Importers untouched:** `app/nina/page.tsx` and `ChatScreen.tsx` are the only importers
of the two components; Composer's props contract never changed. Contract-level imports of
`ComposerDraftImage` (`useNinaSend.ts`, `Composer.test.tsx`) repointed to the type's new
home in `useComposerPhotos.ts`.

**Session identity:** worker session `tokenmax-nina-composer-messagelist-split`, spawned
by coordinator `tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-nina-composer-messagelist-split`; final commit `25d875c`; on
branch at doc time (landing belongs to the coordinator per Worker Mode W4).
