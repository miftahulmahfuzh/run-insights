# Token-Maxxing Session — 2026-09-13: Nina Turnflight YAGNI

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `nina-turnflight-yagni`) in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`), pre-assigned one idea verbatim, with no
  menu of candidates offered: remove `components/nina`'s three knip-flagged unused
  exports/types (`NINA_AVATAR_SRC`, `ChatRole`, `ChatMessageState`); fix the one real
  duplicate-export finding in `lib/nina/turnflight.ts`
  (`NINA_BACKGROUND_BUDGET_MS`/`NINA_TURN_POLL_GIVE_UP_MS`); extend the optional-prop-vs-
  callsite scan to `components/nina`; update both package readmes. The pitch: this
  duplicate-export finding is the only genuine one in the whole repo's current knip run, and
  a named follow-up from an earlier sweep.
- **Concrete changes:** three commits on this branch. `ddb176c` removed the dead
  `NINA_AVATAR_SRC` re-export from `NinaAvatar.tsx` and un-exported `ChatRole`/
  `ChatMessageState` in `components/nina/types.ts`, and annotated `lib/nina/turnflight.ts`'s
  `NINA_TURN_POLL_GIVE_UP_MS = NINA_BACKGROUND_BUDGET_MS` alias with a knip-recognized
  `@alias` JSDoc tag. `246a107` re-ran the optional-prop-vs-callsite scan against a tree that
  had drifted since the 2026-09-12 sweep (`ChatScreen`/`Composer` had since split into 8 new
  hook files) and hardened 9 props to required across `Composer.tsx` (6 props) and
  `MessageList.tsx` (3 props), dropping two now-dead runtime guards and updating both files'
  test helpers. `dc8073d` updated both `components/nina` and `lib/nina` package readmes.
- **Real value delivered:**
  - **Closed the repo's last genuine duplicate-export knip finding**, using knip's own
    sanctioned mechanism (discovered by reading
    `node_modules/knip/dist/typescript/visitors/exports.js`): a bare-identifier initializer
    (`export const B = A`) is skipped by knip's duplicate-export check when the declaration
    carries an `@alias` JSDoc tag. This is not a suppression and not a semantic merge — the
    two constants stay numerically identical (server background budget vs. client poll
    give-up) per the file's own docstring, exactly as before; only the knip finding and the
    doc annotation changed.
  - **Corrected the assigned idea's stale premise instead of executing it blind**: `git log`
    /`git show 4f655e0` showed `components/nina` already had a full optional-prop sweep on
    2026-09-12, merged to main before this session started. Rather than re-scan virgin
    territory that didn't exist, the session diffed `4f655e0` against `HEAD` for
    `components/nina/`, found the tree had genuinely moved (`ChatScreen.tsx`/`Composer.tsx`
    split into 8 new hook files plus `MessageActionsSheet.tsx`/`MessageList.tsx` changes),
    and re-ran the scan against *that* — turning "extend the scan" into "re-verify the
    sweep's premise against a changed tree," which is what actually had value here.
  - **Found real dead code the re-scan predicted**: two `!== undefined` runtime guards in
    `Composer.tsx` (on `attachment`/`onClearAttachment` and `photo`/`onClearPhoto`) that
    become provably dead once those props are required, plus an asymmetric third branch
    (`onCancelReply`) with no equivalent guard at all — confirmed by reading both files
    directly before touching code, not by trusting the subagent's report.
  - **The 8 new hook files (extracted since the 2026-09-12 sweep) already have zero optional
    option-object fields** — their authors applied the "required over optional" discipline
    from the start, so the re-scan's actionable surface was entirely in the two files that
    hadn't been touched by the split.
  - **Deliberately left two items un-actioned, on the record**: `MessageList.flashId`
    (weaker secondary candidate, no dead-code smoking gun) and `ChatChrome.ninaBadge`
    (architecturally required to stay optional-shaped by the Server/Client component
    boundary; its twin lives on `components/ui/TabBar.tsx`, outside this session's scope).
- **Branch:** `token-maxxing-2026-09-13-nina-turnflight-yagni`
- **Merge status:** on branch, not merged — this is a WORKER session in a coordinator
  fan-out (coordinator `tokenmax-orch-2026-09-13`); the coordinator owns merging worker
  branches to main, not the worker itself.
- **Approx token burn:** moderate-high — reading knip's own visitor source to find the
  `@alias` mechanism, a full git-history reconstruction of the prior sweep's premise, a
  delegated AST investigation across 8 new hook files plus the two changed components, and
  four full gate passes (knip, typecheck, vitest) across the three commits. 🔥

## Context & Motivation
This was a WORKER session in the 2026-09-13 token-maxxing fan-out, coordinated by
`tokenmax-orch-2026-09-13`. Unlike a solo session that generates its own menu of candidate
ideas, this worker received one idea pre-assigned by the coordinator verbatim, with the
stated justification that the `lib/nina/turnflight.ts` duplicate-export pair is the only
genuine duplicate-export finding in the whole repo's current knip run — a distinctive,
already-identified target rather than a speculative pick.

The assignment bundled four sub-tasks: three mechanical knip-driven removals, one duplicate-
export fix, and an instruction to "extend the optional-prop-vs-callsite scan to
`components/nina`." That last clause turned out to rest on a stale premise: `components/nina`
had already had a full optional-prop sweep the day before (2026-09-12, commit `4f655e0`,
documented in `docs/token_maxxing/2026-09-12-nina-optional-props.md`, already merged to main
long before this session started). Rather than either skip the clause or blindly re-run a
scan that would find nothing new, the session used `git diff --stat 4f655e0 HEAD --
components/nina/` to check whether the tree had moved since that sweep — and it had:
`ChatScreen.tsx` and `Composer.tsx` had been split into 8 new hook files
(`useChatPageScroll`, `useComposerDraft`, `useComposerPhotos`, `useMessageActions`,
`useNinaSend`, `usePhotoViewer`, `useQuoteLanding`, `useTurnArrival`) plus
`MessageActionsSheet.tsx` and `MessageList.tsx` had changed. That made a re-scan genuinely
warranted — not virgin-territory scanning, but re-verifying an existing sweep's conclusions
against a tree that had since forked away from the state it verified.

## What We Did (blow-by-blow)
1. **Investigated the three knip-flagged dead symbols before removing anything.** Confirmed
   via grep that nothing imports `NINA_AVATAR_SRC` from `components/nina/NinaAvatar.tsx` —
   both real callers already import `NINA_AVATAR_FALLBACK_SRC` directly from `lib/nina/album`
   — so the re-export was pure dead weight, not an in-use alias under a different name.
   Confirmed `ChatRole`/`ChatMessageState` in `components/nina/types.ts` are used only inside
   `ChatMessage` in the same file, with no external importer, so un-exporting (not deleting)
   was the correct fix.
2. **Read knip's own duplicate-export visitor source** at
   `node_modules/knip/dist/typescript/visitors/exports.js` to understand exactly what its
   duplicate-export check does and does not flag, rather than guessing at a workaround. Found
   that a bare-identifier initializer (`export const B = A`) is knip's own sanctioned pattern
   for a deliberate alias, and is skipped by the check specifically when the declaration's
   JSDoc carries an `@alias` tag — a first-class annotation, not a suppression comment or a
   lint-disable.
3. **Committed the three removals plus the alias annotation as `ddb176c`** ("yagni(nina):
   remove 3 dead knip exports, annotate the one real duplicate"): dropped the dead
   `NINA_AVATAR_SRC` re-export; un-exported `ChatRole`/`ChatMessageState`; added the `@alias`
   JSDoc tag to `NINA_TURN_POLL_GIVE_UP_MS`'s declaration in `lib/nina/turnflight.ts`,
   explicitly preserving the file's existing docstring explaining the two constants are
   semantically distinct (server background budget vs. client poll give-up) but deliberately
   kept numerically identical.
4. **Discovered the optional-prop-scan clause's stale premise** via `git log` and
   `git show 4f655e0`, then confirmed the scope of what had changed since via
   `git diff --stat 4f655e0 HEAD -- components/nina/` — the 8-hook split plus
   `MessageActionsSheet.tsx`/`MessageList.tsx` changes.
5. **Delegated the AST investigation to a subagent**, following the same classifier shape as
   the 2026-09-12 sweep (production call sites are plain non-spread JSX literals and always
   exactly countable; test spreads drown per-attribute greps; tag indirection and children
   need special handling). Its findings: the 8 new hooks have zero optional option-object
   fields (already built to the "required over optional" discipline); all 4 prior KEEP
   verdicts from the 2026-09-12 sweep (`NinaSidebar`'s `searchSlot`/`newChatSlot`,
   `NinaAvatar`'s fallback quad, `ChatImages`' `kinds`/`onOpen`, `TypingIndicator.avatar`)
   still hold unchanged; but `Composer.tsx` (6 props: `reply`, `onCancelReply`, `attachment`,
   `onClearAttachment`, `photo`, `onClearPhoto`) and `MessageList.tsx` (3 props: `onReply`,
   `onJumpToQuote`, `onRequestActions`) had drifted out of step with the directory's own
   established convention (Ruling E2b from the prior sweep: harden a single-caller
   always-passed prop from optional to required so `tsc` catches a caller that stops passing
   it).
6. **Verified the findings personally before touching code** — read both `Composer.tsx` and
   `MessageList.tsx` directly, confirmed `ChatScreen.tsx`'s single call site to each component
   always passes all 9 flagged props, and found concrete dead-code evidence: two
   `!== undefined` runtime guards in `Composer.tsx` (on `attachment`/`onClearAttachment` and
   `photo`/`onClearPhoto`) that become provably dead once the props are required, plus an
   asymmetric third branch (`onCancelReply`) with no such guard at all.
7. **Committed the hardening as `246a107`** ("refactor(nina): re-run the optional-prop-vs-
   callsite scan, harden 9 props"): made all 9 props required in `Composer.tsx` and
   `MessageList.tsx`, dropped the two dead guards, and updated both files' test helpers
   (`baseProps()` in `Composer.test.tsx` and `MessageList.test.tsx`) to supply explicit
   values for the newly-required props instead of omitting them. Deliberately left
   `MessageList.flashId` (weaker evidence, no dead-code smoking gun) and `ChatChrome.ninaBadge`
   (architecturally required to stay optional by the Server/Client boundary; twin lives on
   `components/ui/TabBar.tsx`, out of scope) un-actioned, per the investigating agent's own
   calls.
8. **Committed the doc refresh as `dc8073d`** ("docs(nina): update both package readmes for
   today's knip/optional-prop sweep"): corrected `components/nina/.workflows/package_readme.md`'s
   module map and Exported API table (removed the deleted `NINA_AVATAR_SRC` export and the
   now-unexported `ChatRole`/`ChatMessageState`; documented the 9 hardened-to-required props)
   and added a 2026-09-13 "Recent changes" entry; added a note to
   `lib/nina/.workflows/package_readme.md`'s "Last Updated" header (following that file's own
   existing "restated same day" convention) about the `turnflight.ts` `@alias` fix.
9. **Ran the full gate suite at every step**: `npm run knip` confirmed all 3 targeted findings
   (`NINA_AVATAR_SRC`, `ChatRole`, `ChatMessageState` unused-export flags, plus the
   `turnflight.ts` duplicate-export flag) are gone from the report; `npm run typecheck`
   (`next typegen` + `tsc --noEmit`) clean at every commit; `npx vitest run components/nina
   lib/nina` — 60 test files, 1068 tests, all passing after the final changes (313/313 for
   `components/nina` alone after the prop-hardening commit).

## Code / Design Details

**The `@alias` annotation that closed knip's duplicate-export finding** (the mechanism found
by reading knip's own visitor source, not invented):
```ts
/**
 * @alias NINA_BACKGROUND_BUDGET_MS
 * ... existing docstring explaining the two constants are semantically distinct
 *     (server background budget vs. client poll give-up) but deliberately kept
 *     numerically identical ...
 */
export const NINA_TURN_POLL_GIVE_UP_MS = NINA_BACKGROUND_BUDGET_MS
```
knip's `visitors/exports.js` specifically special-cases a bare-identifier initializer
(`export const B = A`) as a candidate duplicate export, and specifically skips flagging it
when the JSDoc on that declaration carries `@alias` — the tool's own sanctioned way to mark a
deliberate value-alias. This is the difference between annotating the finding away correctly
and suppressing it: the tag documents intent knip already knows how to read, rather than
disabling the rule.

**The dead-guard pattern found in `Composer.tsx`** — before hardening, two of the three
optional-reply-state props were guarded at runtime even though the single call site in
`ChatScreen.tsx` always passed them:
```tsx
// before: attachment / onClearAttachment guarded, so were photo / onClearPhoto
{attachment !== undefined && onClearAttachment !== undefined && (
  <AttachmentPreview attachment={attachment} onClear={onClearAttachment} />
)}
```
Once `attachment`/`onClearAttachment`/`photo`/`onClearPhoto` became required (always passed
by the only caller), these `!== undefined` checks were provably dead and were dropped. The
third branch, `onCancelReply`, had no such guard at all — an asymmetry the investigating
agent flagged and the personal file read confirmed, reinforcing that these three props had
drifted independently rather than as a single deliberate pattern.

## Decisions & Trade-offs
- **Corrected the assigned idea's premise rather than executing it literally.** The
  coordinator's wording said "extend the optional-prop-vs-callsite scan to
  `components/nina`," but that scan had already been run there the day before. Treating the
  instruction as "re-verify the sweep against whatever the tree looks like today" (rather
  than either skipping the clause as already-done, or force-scanning for novelty that wasn't
  there) is what actually matched the coordinator's underlying intent and found real value —
  the 8-hook split had genuinely changed the surface.
- **Used knip's own `@alias` mechanism instead of a suppression comment or an eslint-disable.**
  Reading the visitor source before writing a fix meant the annotation is something knip's
  own logic understands and will keep respecting on future runs, rather than a workaround that
  a later refactor could silently invalidate.
- **Did not merge the two turnflight constants into one, despite them being numerically
  identical.** The file's existing docstring argues they are semantically distinct (server
  background budget vs. client poll give-up) and only coincidentally equal; the `@alias` tag
  documents that coincidence for knip without collapsing the two names, preserving the
  distinction for any future reader or refactor that might need to diverge them.
- **Verified the delegated AST investigation's findings by reading the files personally**
  before making any prop required — the subagent's report was treated as a lead, not a
  verdict, consistent with this session's own "check personally before acting" discipline
  used throughout the fan-out.
- **Left `MessageList.flashId` and `ChatChrome.ninaBadge` un-actioned rather than forcing a
  clean sweep.** `flashId` lacked the dead-code smoking gun the other 9 props had (no
  now-provably-dead guard); `ninaBadge` is required to stay optional-shaped by the Server/
  Client component boundary, and its twin on `components/ui/TabBar.tsx` sits outside this
  session's directory scope entirely. Both left on the record rather than silently dropped
  or silently promoted.

## Follow-ups & YAGNI notes
- **`MessageList.flashId`** is a secondary candidate for a future required-promotion pass, but
  needs its own dead-code evidence before acting — this session found none and left it
  optional.
- **`ChatChrome.ninaBadge`** and its twin on `components/ui/TabBar.tsx` are a paired
  Server/Client boundary case that would need to be looked at together, outside
  `components/nina`'s scope — a future session covering both `nina` and `ui` chrome
  components could revisit this pair specifically.
- **Deliberately NOT done, on YAGNI grounds:** no merge of the two turnflight constants into
  one name (the docstring's distinctness argument stands); no forced hardening of
  `flashId`/`ninaBadge` without evidence; no touching of any file outside
  `components/nina`/`lib/nina`; no merge to main (worker session; coordinator's job).

## Appendix

**Commits on this branch (worker, not yet merged):**
```
dc8073d docs(nina): update both package readmes for today's knip/optional-prop sweep
246a107 refactor(nina): re-run the optional-prop-vs-callsite scan, harden 9 props
ddb176c yagni(nina): remove 3 dead knip exports, annotate the one real duplicate
```

**Verification performed:** `npm run knip` — all 4 targeted findings (3 unused-export flags
plus the `turnflight.ts` duplicate-export flag) confirmed gone; `npm run typecheck`
(`next typegen` + `tsc --noEmit`) clean at every commit; `npx vitest run components/nina
lib/nina` — 60 test files, 1068 tests, all passing, 313/313 for `components/nina` alone
after the final prop-hardening commit; both files' single production call site
(`ChatScreen.tsx`) read directly to confirm all 9 hardened props are always passed before any
prop was made required.

**Session identity:** worker session `nina-turnflight-yagni`, spawned by coordinator
`tokenmax-orch-2026-09-13`; branch `token-maxxing-2026-09-13-nina-turnflight-yagni`; worktree
`/home/miftah/.worktrees/run-insights/tokenmax-2026-09-13-nina-turnflight-yagni`; commits
`ddb176c`, `246a107`, `dc8073d`; not merged — the coordinator lands worker branches.

**Related sessions:** `2026-09-12-nina-optional-props.md` (the original optional-prop-vs-
callsite sweep over `components/nina`, whose premise this session re-verified against a
changed tree, and whose 4 KEEP verdicts this session confirmed still hold); the same day's
sibling workers `changed-components-sweep`, `hooks-sweep`, and
`remaining-components-sweep` (concurrent fan-out members under the same
`tokenmax-orch-2026-09-13` coordinator).
