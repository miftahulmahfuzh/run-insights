# Plan: Nina's chat avatar follows her profile settings

**Slug:** nina-chat-avatar-profile
**Date:** 2026-09-07 09:26:29 WIB
**Analysis:** `20260907-092629-AVTR_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-chat-avatar-profile`
**Branch:** `feature/nina-chat-avatar-profile` (base: `origin/main` @ `414f5b2`)
**Phases:** 1
**Status:** landed — 1/1 phases merged to `main` as `b1763fe`
**Coordinator:** `orch-nina-chat-avatar-profile`

---

## Why

The user's report, verbatim:

> nina small circle doesn't follow her profile settings in chat doesn't follow her profile settings

With a screenshot of `/nina` mid-typing: a small round avatar beside the three-dot bubble.

That circle is `components/nina/TypingIndicator.tsx:26` — `<NinaAvatar size="sm" />`, with no
`src`, no `natural`, no `crop`. `NinaAvatar` defaults to the committed
`public/nina/avatar-001.png` and, because `crop == null` and the src is the fallback, takes the
`isFallback` branch: `next/image`, plain `object-cover`, **`ninaCropStyle` never called**. So
neither the current album photo nor its saved framing can reach it.

`lib/nina/crop.ts`'s own docstring already says this circle was supposed to be wired:

> **THE ONE CROP-TO-CSS MAPPING IN THE REPO.** The admin studio's preview, the album grid's
> thumbnails, the chat header's 44 px avatar **and the typing row's 28 px avatar** must all render
> through this function.

Phase 13 wired the other two call sites (`NinaSidebar.tsx:330`, `NinaAboutScreen.tsx:234`) and
missed this one. The value it needs is already in hand on the server —
`app/nina/page.tsx:259`, `const avatar = ninaAvatarView(avatarRow)` — and is passed to
`<NinaSidebar>` and not to `<ChatScreen>`.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | The small circular avatar in chat must render the profile settings actually in force — the current album photo and its saved crop framing — not a hardcoded picture | 1 |

## Scope

**In scope**
- Threading the already-resolved `{ src, natural, crop }` triple from `app/nina/page.tsx` through
  `ChatScreen` → `MessageList` → `TypingIndicator` → `NinaAvatar`.
- A source-text test that keeps the wiring wired.

**Out of scope, and why**
- `NinaAvatar.tsx` itself — it is correct. It already renders a crop through `ninaCropStyle` when
  given one; nothing about the renderer is broken.
- `NinaSidebar.tsx` / `NinaAboutScreen.tsx` — both already pass the triple. Their `NinaSidebarAvatar`
  type is *not* refactored into a shared one (see Decisions).
- The album, the crop studio, `getCurrentNinaAvatar`, the `nina_avatars` schema. The database
  already holds the right answer; no read is added, changed, or removed.
- Per-message avatars in `MessageBubble`. The screenshot shows the typing row only, and her
  message bubbles have never carried a face; adding one is a design change the user did not ask
  for.

## Invariants

1. **No new query and no new await on `/nina`.** Invariant 4 of the original F33 plan — the page
   is indexed reads and no model call. This phase moves a value that is already fetched.
2. **`description` never crosses into a client component.** Invariant 5. The new prop carries the
   three render fields only, destructured field by field at the call site, exactly as
   `app/nina/page.tsx:498` already does for the sidebar.
3. **The no-album case renders byte for byte what it renders today** — `/nina/avatar-001.png`
   through `next/image`, centred cover. `ninaAvatarView(null)` returns `crop: null` and the
   fallback src, so `NinaAvatar`'s `isFallback` branch still fires. This phase must not change
   `NinaAvatar`.
4. **`npm run build`, `npx tsc --noEmit`, `npm test` and `npm run lint` all pass.**

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Thread the current avatar into the chat's typing row | R1 | `components/nina`, `app/nina` | 5 | — | EASY | `.workflows/plan/nina-chat-avatar-profile/phase-1.md` | `P1-RI-A019` | `miftahulmahfuzh/run-insights#111` |

### Phase 1 — Thread the current avatar into the chat's typing row
**Satisfies:** R1
**Owns:** `components/nina/types.ts` (new `ChatAvatar` type), `components/nina/ChatScreen.tsx`,
`components/nina/MessageList.tsx`, `components/nina/TypingIndicator.tsx`, `app/nina/page.tsx`
(the `<ChatScreen>` call only), and the new `tests/nina.chatAvatar.test.ts`.
**Does not touch:** `components/nina/NinaAvatar.tsx`, `components/nina/NinaSidebar.tsx`,
`components/nina/NinaAboutScreen.tsx`, `lib/nina/crop.ts`, `lib/nina/album.ts`,
`lib/nina/queries.ts`, any schema or migration.
**Exit criteria:**
- `TypingIndicator` renders `<NinaAvatar size="sm" src={…} natural={…} crop={…} />`.
- The triple originates at `ninaAvatarView(avatarRow)` in `app/nina/page.tsx` — the same call the
  sidebar already reads, so the 28 px circle and the 44 px circle cannot disagree.
- The prop is REQUIRED at every hop (`ChatScreen`, `MessageList`), so a future caller that forgets
  it is a type error and not a silent regression to the fallback.
- `tests/nina.chatAvatar.test.ts` passes and would fail if any hop were removed.
- `npx tsc --noEmit && npm run lint && npm test && npm run build` all green.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Where the shared `{src, natural, crop}` type lives: reuse `NinaSidebarAvatar`, or a new one | A new `ChatAvatar` in `components/nina/types.ts` | 6: surrounding convention — `ChatScreen` and `MessageList` already import from `types.ts`, and `ChatChrome.tsx:238` states "`ChatScreen` never learns a sidebar exists", so importing the sidebar's type into the chat path would contradict a documented boundary to save one interface |
| Whether to also refactor `NinaSidebarAvatar` onto the new shared type | No — leave it | 4: the index's Scope. The sidebar is not broken; a two-surface type refactor widens a one-line bug fix's blast radius for no user-visible gain. The duplication is three fields and is noted here so a later consolidation is a deliberate act |
| Prop optional (defaulting to the fallback) vs required | Required at `ChatScreen` and `MessageList` | 5: the user's raw input. A prop that silently defaults to the fallback re-creates exactly the reported bug the next time a caller is added — which is how this bug happened |
| Whether `TypingIndicator` keeps a default | Yes, it keeps `NinaAvatar`'s fallback behaviour when called bare | 6: surrounding convention — it is `aria-hidden` decoration, and `NinaAvatar` itself defaults. The defect was never the default; it was that no caller overrode it |
| How to verify with no jsdom | A `readFileSync` source-text assertion in `tests/nina.chatAvatar.test.ts` | 6: `vitest.config.ts` is `environment: 'node'`, and `tests/nina.softDelete.test.ts`, `tests/motion.reducedMotion.test.ts` and `tests/admin.shell.test.ts` are the repo's precedent for exactly this |

## Open Questions

None.

## Rollback

`git revert` the single commit, or `git branch -D feature/nina-chat-avatar-profile`. No migration,
no data written, no external state. The prior behaviour is "the 28 px circle shows the committed
PNG", which is what reverting restores.

## Next

Execute the single phase:

    /implement -f NINA_CHAT_AVATAR_PROFILE_PLAN.md --phase 1

Or run it as a swarm — one session, resumable on any machine:

    /analyze-orchestrator -f NINA_CHAT_AVATAR_PROFILE_PLAN.md

Or put it on the board first:

    /create-task --from-plan NINA_CHAT_AVATAR_PROFILE_PLAN.md
