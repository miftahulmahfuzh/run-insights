# Plan: A re-attached photo is a reference, and a bubble is a control

**Slug:** `nina-photo-refs-and-bubble-actions`
**Date:** 2026-09-07 12:50:41 +07
**Analysis:** `20260907-125041-PHRF_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-photo-refs-and-bubble-actions`
**Branch:** `feature/nina-photo-refs-and-bubble-actions` (base: `origin/main` @ `e6c68d6`)
**Phases:** 4
**Status:** planned  _(reconciled 2026-09-07; 1 round, 11 conflicts, 0 open questions)_
**Coordinator:** —

---

## Why

The user's words, verbatim:

> admin update
> can we avoid including duplicate photos in Chat Photos? look at prod admin, 2 of the most recent photos are duplicate.
> it looks like everytime i attached a photo into chat, we will add a new duplicate of it into Chat Photos. this is wrong. we must optimize it to only refer to the existing photo.
> there is a "what she can see in it" field. make this field editable by user
>
> - another similar problem is that , existing photos in Nina profpic album being added into Media as well. please optimize this. make sure if user is attaching profile photo, we would not add this profile photo into Media
>
> ---
> sometimes the interaction is embarassing or redundant. so , to keep nina context clean, give user the ability to edit his message, edit nina message, or delete his message, or delete nina message. this requirement is weird, but this is because nina will keep using previous history as context, so we need to give user the capability to make this context more "accurate" . so basically user can click any bubble (his or nina's) and choose: edit , delete
> sometimes, user chat message is left unanswered. add option to resend as well (just for user's bubble)

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Attaching a photo into chat must not add a duplicate to Chat Photos — refer to the existing photo | 1 |
| R2 | "what she can see in it" must be an editable field | 2 |
| R3 | Attaching a photo from Nina's profile album must not add it into Media | 1 |
| R4 | Click any bubble (his or hers) and choose edit or delete | 3 |
| R5 | Resend, on his bubbles only, for a message left unanswered | 4 |

**Final after reconciliation — no requirement moved between phases.** Each phase's `Satisfies` line
was checked against its own implementation steps: phase 1 delivers both listings' filter *and* the
backfill (R1, R3), phase 2 delivers the writable field end to end (R2), phase 3 delivers the pointer
opener (R4), phase 4 delivers Resend on his bubbles only (R5). No phase's steps serve an `R` outside
its own line, and every `R` has an owner. Every Impact Point in the analysis document is owned; the
one conditional entry — item 8, `components/admin/chatPhotoModel.ts` — resolved to **no phase needs
it** (see the Reconciliation Log).

**Phase 1 serves R1 and R3, and cannot be split.** They are one defect — `insertNinaMessageImages`
on the attach path — seen at two listings. Splitting by R would mean two migrations for one column
pair, or a phase that changes the write and a phase that changes the reads, the first of which
ships nothing observable. Per Step 6 the coupling is kept and named.

**R4 is an affordance, not a capability.** Edit and delete of a message — his and hers — already
ship (`75a9c34`): `lib/nina/messageActions.ts`, `components/nina/MessageActionsSheet.tsx`,
`lib/nina/edit.ts`, all tested. What is missing is a *tap*: the only openers today are a left swipe
on touch and a visually-hidden focus button, so on a mouse there is no opener at all. Phase 3
therefore adds the opener and touches neither action nor sheet logic.

## Scope

**In scope**

- Provenance on `nina_message_images`: which existing row or avatar a re-attached photo's bytes
  came from, and the two collection listings learning to skip a reference (phase 1).
- A one-time backfill so production's existing duplicates stop being listed (phase 1).
- An admin control that writes `nina_message_images.description` (phase 2).
- A tap/click opener for the shipped message-actions sheet, on both his and her bubbles (phase 3).
- `resendNinaMessage`: re-run the turn for a runner row already on the server, with no second copy
  of his message (phase 4).

**Out of scope, and why**

- **Deleting the duplicate rows, or their blobs.** A duplicate row is attached to a real message
  and a real bubble; deleting it blanks a photograph in the conversation. The rows stay and stop
  being *listed* — see D1. Blob reaping stays `reap-orphaned-blobs`'s job and it does not cover
  `nina/` yet.
- **`nina_avatars.description`.** The user pointed at one field, on one screen. The album rail
  (`components/admin/explorer/SelectionPane.tsx`) prints only whether a description exists, which
  is the right call for the album; making that editable too is a coherent follow-up and is not
  this set.
- **Any change to what Nina is *given* as context.** `dbNinaSourceGateway.readConversation`
  hardcodes `imageDescriptions: []` for window rows — a real gap, recorded by the previous set as
  out of scope for the same reason it stays out of scope here: it changes what she knows in every
  conversation and nobody asked for it.
- **Deduplicating the *upload* path.** Uploading the same photograph twice from the composer
  writes two blobs and two rows, and that is two photographs as far as anything can tell. The
  user's defect is specifically the attach path, which reuses a blob URL and therefore *can* be
  detected.
- **A "was this answered" indicator, badge or icon on a bubble.** R5 asks for a resend option, and
  `MessageBubble`'s own note records the deliberate choice not to grow retry chrome. See D4.
- **`NINA_PROMPT_VERSION`, the tuning surface, and Nina's system prompt.** Untouched.

## Invariants

Every phase holds all of these. A phase that cannot is a phase whose plan is wrong.

1. **The tree is green at the end of every phase**: `npm run lint`, `npm run typecheck`,
   `npx vitest run`. A phase does not leave the next one a broken build.
2. **A photograph already in the conversation keeps rendering, everywhere.** The bubble, the
   photo viewer, the download control, the job views and Nina's prompt all read
   `nina_message_images` by `message_id`; no phase may remove or repoint a row a message depends
   on. Whatever a listing hides, `getNinaMessageImagesForMessages` still returns.
3. **`description` is private to Nina's prompt and to `/admin`.** It may be read and written behind
   `requireAdmin()`; it may never reach a component under `components/nina/` or any runner-facing
   caption. (Invariant 5 of the shipped chat plans; `ChatPhotoDetail`'s header states the `/admin`
   carve-out.)
4. **Ownership is proved by a `user_id`-scoped read before every write**, and a miss refuses rather
   than degrades. An id from a client is a claim.
5. **No new model call.** Phase 2 writes prose a human typed; phase 4 re-runs an existing turn.
   `scripts/check-llm-payload-boundary.mjs` gains no entry.
6. **The reply swipe is not re-litigated.** `decideReplySwipe` runs first and keeps every pixel it
   has today; phase 3 adds a decision that can only fire where no existing gesture does.
7. **Resend never writes a `nina_messages` row.** It re-opens a turn for an existing
   `runner_message_id`; a second copy of his sentence on screen is a failed phase 4.
8. **One migration in this set, and it is phase 1's.** No other phase may add DDL.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | A re-attached photo is a reference, not a copy | R1, R3 | `lib/db`, `drizzle`, `lib/nina` | 10 | — | HARD | `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-1.md` | — | — |
| 2 | "What she can see in it", editable | R2 | `lib/admin`, `components/admin`, `lib/nina` | 8 | — | NORMAL | `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-2.md` | — | — |
| 3 | Tap a bubble to edit or delete it | R4 | `lib/nina`, `components/nina` | 3 | — | NORMAL | `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-3.md` | — | — |
| 4 | Resend a message that was never answered | R5 | `lib/nina`, `components/nina` | 6 | 3 | HARD | `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-4.md` | — | — |

**Concurrency, after reconciliation.** The only edge in the set is **4 → 3**. Phases **1, 2 and 3
start together**; phase 4 starts when 3 lands. Three file-sharing pairs were checked line by line
rather than serialised, because the parallelism is worth more than the safety margin and the hunks
are genuinely far apart:

| Shared file | Phases | Verdict |
|---|---|---|
| `lib/nina/queries.ts` | 1, 2 | **Disjoint.** Phase 1's lowest hunk ends ~`:1704`; phase 2 inserts at `:1838-1840`. ~134 clear lines. No edge. |
| `lib/nina/actions.ts` | 1, 4 | **Disjoint.** Phase 1: `:9`, `:183-233`, `:562-576`. Phase 4: `:26-36`, `:1022`. Nearest pair ~446 lines apart, and the two import edits are different statements. No edge. |
| `lib/nina/edit.ts` + `edit.test.ts` | 3, 4 | **Sequenced** by the existing 4 → 3 edge; phase 4 now quotes both files post-phase-3 and appends below everything phase 3 writes. |

`components/admin/ChatPhotoDetail.tsx` was a **fourth** pair in the draft and is no longer shared at
all — see D8.

### Phase 1 — A re-attached photo is a reference, not a copy
**Satisfies:** R1, R3
**Owns:** `ninaMessageImages`'s two new provenance columns and `drizzle/0010_*` (generated
`ALTER TABLE` **plus a hand-written backfill**, on `0009`'s precedent); `imageColumns`;
`NinaImageInsert`; `insertNinaMessageImages`; `resolveAttachment`'s return type and the attach
INSERT in `sendNinaMessage`; the reference filter in `listNinaMessageImages`,
`generatedChatPhotoScope` and `countNinaChatPhotos` (the last two inherit the filter through the
scope helper and are not edited directly).
**Does not touch:** any message read used to render a bubble (invariant 2); `components/nina/`;
`lib/admin/chatPhotoActions.ts`; anything in phases 3 and 4. **And — reconciled, D8 —
`components/admin/ChatPhotoDetail.tsx`, `components/admin/chatPhotoModel.ts` and
`app/admin/photos/page.tsx`, all three of which belong to phase 2 outright.** The draft offered
this phase an optional read-only provenance line on that rail; it is withdrawn. `startNinaBackgroundTurn`
and everything else in `lib/nina/actions.ts` outside `resolveAttachment` and the attach INSERT is
phase 4's or nobody's.
**Exit criteria:** attaching an album face or re-attaching a chat photo leaves
`countNinaChatPhotos` unchanged and adds nothing to `galleryPhotos`'s input, while the photo still
renders in the bubble and its description still reaches the turn. The backfill marks production's
existing duplicates. `npm run db:generate` produces exactly one new file and the meta journal
matches it.

### Phase 2 — "What she can see in it", editable
**Satisfies:** R2
**Owns:** a zod schema in `lib/admin/chatPhotoSchema.ts`; an
`updateNinaChatPhotoDescription`-shaped statement in `lib/nina/queries.ts` §5b (the admin write
block); `editChatPhotoDescriptionAction` in `lib/admin/chatPhotoActions.ts`; the editable control
in `components/admin/ChatPhotoDetail.tsx` and whatever `ChatPhotoControls` / `chatPhotoModel.ts`
need for it.
**Does not touch:** `nina_avatars`; any DDL (invariant 8 — the column already exists); the
`describeNinaImages` `after()` pass; `components/nina/`.
**Exit criteria:** an operator can rewrite the description on `/admin/photos`, a save survives a
reload, an empty save is a decided outcome (clear it, or refuse — the plan must choose and say
which), and the next turn reads the new text with no invalidation step.

### Phase 3 — Tap a bubble to edit or delete it
**Satisfies:** R4
**Owns:** a pure tap decision in `lib/nina/edit.ts` and its tests; the pointer/tap opener in
`components/nina/MessageBubble.tsx`.
**Does not touch:** `decideReplySwipe` or `decideMessageActionSwipe` (invariant 6 — both keep
working); `MessageActionsSheet.tsx`; `messageActions.ts`; **`ChatScreen.tsx` — zero lines**
(reconciled: the phase plan's Step 4e establishes that `handleRequestActions` already provides
everything the tap needs, so the file is left entirely to phase 4).
**Exit criteria:** a tap or click on the body of any bubble — his or hers — opens the shipped
sheet; a tap on a photo still opens the viewer, a tap on a quote stub still jumps, a swipe still
replies and still opens the sheet; an optimistic (`sending`) bubble opens nothing.

### Phase 4 — Resend a message that was never answered
**Satisfies:** R5
**Owns:** `resendNinaMessage` in `lib/nina/actions.ts` (sweep → `openNinaChatTurn` →
`startNinaBackgroundTurn`, rebuilding `NinaBackgroundTurnInput` from the persisted row); the
Resend item in `components/nina/MessageActionsSheet.tsx`; its handler in `ChatScreen.tsx`
(`awaiting`, `cursorRef`) — **this phase is the sole owner of both components**; and
`canResendMessage` in `lib/nina/edit.ts`, **appended at the foot of the file after phase 3's
`── the tap ──` block** (D9).
**`startNinaBackgroundTurn` stays module-private and unmodified (D10).** Verified on the branch:
it is a private `function` at `lib/nina/actions.ts:681` wrapping
`after(() => runNinaBackgroundTurn(input))`, with the private async worker `runNinaBackgroundTurn`
at `:723` and the exported `NinaBackgroundTurnInput` at `:695`. `resendNinaMessage` ships inside
`actions.ts` precisely so that seam needs no public name, so nothing in this set exports it.
**Does not touch:** `insertNinaMessages` (invariant 7); `pollNinaReply`; the turnflight cadence;
`messageActions.ts`; phase 1's columns.
**Exit criteria:** Resend appears only on his confirmed bubbles, never on hers; pressing it puts
the screen into the same awaiting state a send does and her answer arrives through the existing
poll; no second copy of his message appears; a resend while a turn is already running is refused
with a reason rather than opening a second claim.

## Reconciliation Log

One round. Eleven conflicts found, eleven resolved by editing the phase files in place. No conflict
was deferred and no requirement moved between phases, so **`contract_changed` is false** — no
deletion, creation or rename shifted owner, and a second round is not needed.

Every line number below was read off the worktree at `origin/main` @ `e6c68d6`. No plan's claim was
taken on trust.

| # | Class | What was wrong | Resolution |
|---|---|---|---|
| 1 | **File collision** | The draft index gave phase 1 an *optional* read-only provenance line on `components/admin/ChatPhotoDetail.tsx` and told it to "coordinate with phase 2, which owns that file". Phases 1 and 2 have **no dependency edge**, so they run concurrently in separate sessions on one branch — "coordinate" named a collision instead of settling it, and phase 2's own contract compounded it by inviting phase 1 in ("Phase 1 may add a provenance field there freely", "If Phase 1 also appends a header paragraph, append it after mine"). | **Phase 2 owns the file outright; the option is withdrawn from phase 1.** D8. Edited out of the index's phase-1 scope, out of phase 1's *Leaves alone* and H1, and out of phase 2's contract and Handoffs. Phase 1 had already refused it independently on the merits (the line would be unreachable code) — that refusal is now the ruling, not a preference. |
| 2 | **Contract drift** | Phase 2's contract asserted phase 1's `lib/nina/queries.ts` footprints were "all above :1631 (the §5b banner)". **False.** Phase 1's Step 7d edits `updateNinaChatPhotoBlob`'s `.set()` at `:1678-1704`, which is *inside* §5b with phase 2. The §5b banner is also at `:1632`, not `:1631`. | Corrected in phase 2's contract, its Step 3, its Files table and its Handoffs. The edits are still **genuinely disjoint** — phase 1's lowest hunk ends ~`:1704`, phase 2 inserts at `:1838-1840`, ~134 clear lines — so **no serialising edge was added** and 1 ‖ 2 parallelism is preserved. Phase 2 also now carries phase 1's H2 request explicitly: its `.set()` touches `description` only. |
| 3 | **Contract drift** | Phase 2's line numbers for phase 1's footprints were stale (`insertNinaMessageImages` :1449 vs the real :1435) and the list was short by one (seven hunks, not six; `NinaImageRow` :203 was missing). | All seven verified and written into phase 2: `:203`, `:218`, `:517`, `:1435`, `:1477`, `:1563`, `:1678`. Also recorded that `listNinaChatPhotos` (`:1589`) and `countNinaChatPhotos` (`:1623`) are edited by **nobody** — they inherit the filter through `generatedChatPhotoScope`, which is the property that helper exists for. |
| 4 | **File collision** | **`lib/nina/actions.ts`, phases 1 and 4, no edge between them** (4 depends only on 3). Both edit this 1341-line file concurrently. | **Verified disjoint; no edge added.** Phase 1: a new `./attach` import statement sorting to `:9`, `resolveAttachment` `:183-233`, the attach INSERT `:562-576`. Phase 4: one name added to the *separate* `./queries` statement at `:26-36`, and a new block at `:1022`. Nearest pair ~446 lines apart; the two import edits are different statements seventeen lines apart. Written into both plans' Handoffs with the ranges named. Phase 4 is the longest plan in the set, so serialising it would have cost real time. |
| 5 | **Contract drift** | Phase 4 quoted phase 1's ranges as `:183-236` and `:552-574`. Both wrong: `resolveAttachment` ends at `:233`, and `:552` is inside the preceding comment — the `if (attached !== null)` block is `:562-576`. | Corrected in phase 4's *Leaves alone*, Files table and Handoffs. |
| 6 | **Unmet assumption / contract drift** | **`lib/nina/edit.ts`, phases 3 and 4.** The edge exists (4 → 3), but phase 4 quoted the file **pre-phase-3**: it inserted `canResendMessage` at `:109`, two lines below `:106` — the exact signature line phase 3 rewrites when it widens `canActOnMessage(target: EditTarget)` to `(target: ActionableMessage)`, and phase 3 also inserts a ~12-line block above `:95`. Adjacent hunks in one file. Phase 3's own Handoffs had asked, in writing, for the gate to be appended after its `── the tap ──` block; phase 4 had not read that request. | **Rule 4 (later phases quote post-change code).** Phase 4's Step 1 now appends `canResendMessage` at the **end of the file**, after phase 3's tap section, and its *Requires* section documents the post-phase-3 state it builds on. Type compatibility verified: `canResendMessage` keeps taking `EditTarget` (it reads `.mine`, absent from `ActionableMessage`) and its `canActOnMessage(target)` call still typechecks, because `EditTarget` satisfies the narrow shape structurally. Both plans' Handoffs now state the arrangement identically. |
| 7 | **File collision** | **`lib/nina/edit.test.ts`, phases 3 and 4.** Phase 4 inserted its describe "at `:73`, after the `canActOnMessage` describe's closing `})` (`:72`)" — but phase 3 adds a case *inside* that describe, so `:72` stops being the closing brace. Worse, phase 4 quoted the **pre-phase-3 `./edit` import block**, which would have silently reverted five of phase 3's imports (`BUBBLE_BODY_SELECTOR`, `BUBBLE_INTERACTIVE_SELECTOR`, `MESSAGE_ACTION_TAP_SLOP_PX`, `decideMessageActionTap`, `type MessageActionTapGesture`) and broken its ~20 new cases. | Phase 4's Step 5a now quotes **phase 3's widened block plus `canResendMessage`** (18 names), with an explicit "if phase 3's names are missing, stop — the dependency was not honoured" check. Step 5b appends the describe at the **end of the file**, below phase 3's `decideMessageActionTap` block. |
| 8 | **Gap (suspected) — closed as verified** | Phase 4's plan was reported to call a background-turn entry point that does not exist under that name, and the analysis document flags `startNinaBackgroundTurn` as private. | **No defect. The plan is right and the suspicion was wrong.** `lib/nina/actions.ts:681` really is `function startNinaBackgroundTurn(input: NinaBackgroundTurnInput): void`, wrapping `after(() => runNinaBackgroundTurn(input))`; `runNinaBackgroundTurn` is the private async worker at `:723` and `NinaBackgroundTurnInput` is exported at `:695`. Phase 4 quotes the real symbol. The **visibility** question is settled and now stated in the index and in phase 1's H3: `resendNinaMessage` ships **inside `actions.ts`**, so `startNinaBackgroundTurn` stays module-private and **nothing is exported to make this phase work** (D10). |
| 9 | **Contract drift** | Phase 4's *Requires* said "Phase 3 may have added **one line** to `components/nina/ChatScreen.tsx`" and hedged its four line numbers accordingly. Phase 3's Step 4e says the opposite in as many words: *"Zero lines of `ChatScreen.tsx` change, which leaves the file entirely to phase 4."* The index's phase-3 scope carried the same hedge ("beyond a prop it may already pass"). | Settled on phase 3's code blocks (rung 3). Phase 4 is the **sole owner** of `ChatScreen.tsx` and of `MessageActionsSheet.tsx`, its line numbers are exact, and the hedge is removed from phase 4's Step 4, from phase 3's Handoffs and from the index's phase-3 *Does not touch*. |
| 10 | **Gap — closed as unneeded** | Analysis Impact Point 8, `components/admin/chatPhotoModel.ts`, was conditional: "only if provenance is surfaced (**phase 1**, optional) or the description edit needs a callback (**phase 2**)". After conflict 1 the first branch is gone, and phase 2's Step 6 establishes the second is unnecessary — `photo.description` is already on `ChatPhoto` (`:56`) and already mapped by `app/admin/photos/page.tsx:91`. | **No phase needs it, and that is now stated rather than left ambiguous.** Recorded in both plans as untouched by the whole set. Not an unowned impact point: an impact point that measurement retired. |
| 11 | **Broken-build / duplicate-work risk — closed as verified** | Phase 4's `tests/nina.resend.test.ts` warns that its `vi.mock('@/lib/nina/queries', …)` factory must list every name `actions.ts` imports from that module, and asks for a name to be added "if phase 1 adds a queries import". A factory replaces the whole module, so a missed name is an import-time error — i.e. a red suite for phase 4 caused by phase 1. | **Phase 1 adds no `./queries` import.** Its one new import is `ninaPhotoProvenance` from `./attach`, which that suite does not mock. The factory's ten names are correct whatever order the phases land in. Written into phase 1's H3 and phase 4's Handoffs so neither session re-opens it. |

**Checked and found correct — no edit needed.** Recorded so the next reader does not re-verify:

- **The migration number.** `drizzle/meta/_journal.json` ends at entry `9`, tag
  `0009_nina_message_photo_only`, and `drizzle/*.sql` ends at the same file. **`0010` is
  uncontested** and phase 1's claim holds.
- **Invariant 8, one migration in the set.** Phases 2, 3 and 4 each declare no DDL in their
  contracts, and none has a `drizzle/` row in its Files table. Phase 1 is the only writer.
- **The backfill-regeneration warning.** Phase 1 carries it three times over, which is the right
  number for a hazard that destroys work silently: Step 2 (*"GENERATE FIRST, APPEND SECOND"*, plus
  "if `0010` is taken, **DELETE AND REGENERATE. Never rename** — a renamed migration keeps the old
  `when`, drops below the applied watermark and is skipped in silence"), Step 3's in-file banner,
  and the Decisions row below. It also carries the diff-before-replacing instruction and read-only
  `SELECT` counterparts to run before `db:migrate`.
- **Requirement coverage.** R1+R3 → 1, R2 → 2, R4 → 3, R5 → 4. Every phase's steps deliver its own
  `R` and no other phase's. No `R` is unowned, so **Open Questions is empty**.
- **Invariant 2** (a photograph in a conversation keeps rendering) is asserted as an *absence* by
  phase 1's Step 8c across `getNinaMessageImagesForMessages`, `getNinaMessageImage`,
  `isBlobPathnameReferenced` and the gateway reads — the strongest form available, since a spy
  cannot distinguish "the function ran" from "the predicate was in the WHERE".
- **Invariant 6** (the reply swipe is not re-litigated) is asserted by phase 3's disjointness cases:
  the tap window (|dx| ≤ 10) cannot overlap either swipe window (|dx| > 44), and the test pins the
  inequality.

## Decisions

Every fork settled before planning, with the rung that settled it, so no phase session meets it
again.

| Fork | Chosen | Rung |
|---|---|---|
| "only refer to the existing photo" — drop the per-message row, or keep it and mark it? | **Keep the row, mark it as a reference, and exclude references from the two listings.** | 5: the user's raw input names the *observable* (no duplicate in the collection), and invariant 2 forbids the alternative — every bubble, viewer, download and prompt read goes through `nina_message_images.message_id`, so a message with no row of its own is a blank bubble. A `nina_messages.attached_image_id` union would touch every reader of the table for the same visible result. |
| How provenance is recorded | **Two nullable columns on `nina_message_images`: `source_avatar_id` → `nina_avatars(id)` and `source_image_id` → `nina_message_images(id)`, both `ON DELETE SET NULL`.** A row is a reference when either is non-null. | 6: surrounding convention — `nina_avatars.source_key` and `nina_messages.reply_to_id` (a self-referencing FK on the same shape) are the repo's two precedents. `SET NULL` is deliberate: when the original is deleted the copy stops being a copy and the collection keeps the picture instead of losing it. |
| The two existing production duplicates | **A hand-written backfill inside the generated `0010`, matching on `blob_url` within one `user_id` — earliest row wins as the original, and a row whose `blob_url` matches a `nina_avatars` row is marked `source_avatar_id`.** Literals and rule frozen at 2026-09-07. | 6: `drizzle/0009_nina_message_photo_only.sql` did exactly this, and states why a migration must not follow later edits to the code it mirrors. Note that regenerating the migration silently drops the backfill — diff before replacing. |
| Which listings filter references | **`listNinaChatPhotos` + `countNinaChatPhotos` (admin Chat photos) and `listNinaMessageImages` (`/nina/about` **Media**).** `getNinaMessageImagesForMessages`, `getNinaMessageImage` and `gateway.readMessageWindow` do **not** filter. | 1: invariant 2. The first three are collection listings; the last three are what makes a bubble render and what Nina reads. |
| Does Resend need an "unanswered" test? | **No. Resend is offered on every confirmed runner bubble.** The action refuses when a turn is already live. | 5: the user's input names a symptom ("sometimes … left unanswered"), not a gate; and a client-side answered/unanswered test would be a second authority on turn state beside `nina_turns`, which `openNinaChatTurn` already owns. Refusing at the action is honest; hiding the item on a guess is not. |
| Does R2 also cover the album's description? | **No — `nina_message_images.description` only.** | 5: the user named one field on one screen ("there is a 'what she can see in it' field"), and that string exists in exactly one file. |
| Tap vs long-press for the opener | **Tap/click.** | 5: "user can click any bubble … and choose: edit, delete" — the user said click. A long-press would also need a timer, a cancel path and a haptic story nobody asked for. |

**Added by the reconciler.** Four forks the parallel planners left open or answered differently.
Each was decidable from a rung, so none is an Open Question.

| Fork | Chosen | Rung |
|---|---|---|
| **D8.** `components/admin/ChatPhotoDetail.tsx` — the draft gave phase 1 an *optional* provenance line on a file phase 2 owns, with no dependency edge between them. Does phase 1 surface provenance there, or declare `Depends on: 2`? | **Neither: phase 1 drops the surfacing entirely and phase 2 owns the file outright.** No edge is added, so 1 ‖ 2 keep running concurrently. `ChatPhoto` gains no field and `app/admin/photos/page.tsx` is untouched. | **3: the plans' own code blocks.** Phase 1's Step 7c makes `/admin/photos` list only rows where *both* provenance columns are NULL, so a "came from her album" line on that rail could never render — it is unreachable markup, and the cheaper answer (drop it) is also the only correct one. An edge `1 → 2` would have serialised two phases to ship dead code. Phase 1 reached this independently in its H1; the reconciler made it binding on both sides. |
| **D9.** `lib/nina/edit.ts` — phase 4 placed `canResendMessage` beside `canActOnMessage` (`:109`); phase 3 asked for it after the `── the tap ──` block. Where does it go? | **The foot of the file, after phase 3's tap section.** It still *composes* with `canActOnMessage`; it just no longer sits next to it, and its docstring says so and why. | **2: the phases' exit criteria** — both phases require a green tree (invariant 1), and `:109` is two lines below the signature line phase 3 rewrites at `:106`, with a further phase-3 insertion above `:95`. Adjacent hunks are a hand-resolved merge, and phase 3 (the earlier phase, so the owner of that region under rule 3) had already named the safe landing spot. Cosmetic locality lost to a clean merge. |
| **D10.** `lib/nina/actions.ts` — does phase 4 **export** `startNinaBackgroundTurn` so a resend can reach it, or keep `resendNinaMessage` inside `actions.ts`? | **Keep `resendNinaMessage` inside `actions.ts`. Nothing is exported; `startNinaBackgroundTurn` stays a module-private `function` at `:681`.** | **6: surrounding convention**, with an assist from rule 3. `messageActions.ts`'s header states its own reason for staying isolated from `actions.ts`, and exporting the `after()` seam would put this repo's durable-background-work convention behind a public name in two modules. It is also the cheapest disjoint outcome for the phase-1/phase-4 file sharing: the new code is purely additive at `:1022`, ~446 lines from phase 1's nearest hunk, so no edge is needed. |
| **D11.** `lib/nina/queries.ts` and `lib/nina/actions.ts` are each edited by two phases with no edge between them. Add serialising edges, or rely on disjoint hunks? | **Rely on the hunks, and name the line ranges in both plans.** No edge added for either file. Phases 1, 2 and 3 all start at once. | **6: measurement over caution.** The gaps are ~134 lines (`queries.ts`, 1 ‖ 2) and ~446 lines (`actions.ts`, 1 ‖ 4), both far outside git's three-line merge context, and each pair's edits were enumerated against the branch rather than described. Phase 4 is the longest plan in the set and phase 2 is fully independent, so an edge here would have cost real wall-clock time to buy a margin that measurement already provides. If a session does hit a conflict, the ranges are recorded and the resolution is mechanical. |

**Added by the coordinator, from outside this worktree.** One hazard no planner and no reconciler could see from inside it, because it lives in a sibling worktree.

| Fork | Chosen | Rung |
|---|---|---|
| **D12.** `drizzle/0010` is claimed by a **second, concurrent plan set**. `nina-image-generation-tab` phase 7 (worktree `/home/miftah/.worktrees/run-insights/nina-image-generation-tab`, `Status: draft`, base `HEAD` @ `b0e492a`) also writes a `drizzle/0010_*.sql`, for `ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe"`. Its base is the shared checkout's local `main`, which has **diverged** from `origin/main` — 4 ahead, 44 behind, and missing `0009` — so its number is derived from a tree this set does not share. Renumber now, or land and resolve? | **Keep `0010`. Do not renumber in advance, and whichever set lands second REGENERATES rather than renames.** Phase 1's landing step must, before `db:generate`, re-read `drizzle/meta/_journal.json` on the merge base: if a `0010` is already there, `rm -f drizzle/0010_*.sql drizzle/meta/0010_snapshot.json`, drop the entry, re-run `npm run db:generate`, then **diff the discarded file against the new one and re-apply the hand-written backfill by hand** — `db:generate` emits only the `ALTER TABLE`s and silently drops the backfill. | **6: surrounding convention, and a measured failure mode.** A renamed migration is skipped in silence — the journal keys on the tag, so a re-tagged file is treated as already applied and its `ADD COLUMN`s never run. Renumbering *this* set pre-emptively is worse than resolving at landing: the other set is still `draft` and may never land, and this set's phase 1 already carries the regenerate-never-rename procedure three times over (Step 2, Step 3's banner, and the backfill Decisions row). `54e8c56` in this repo's history is the same class of collision resolved the same way, one identifier space over. |

## Open Questions

**None.** Every fork was decidable from a rung — the seven settled before planning and the four
(D8-D11) settled during reconciliation. No requirement is unowned, no impact point is unowned, and
no fork in this set has irreversible branches on both sides, so nothing is parked here.

This section being empty is the condition `/analyze` Step 11 checks before it will start an
orchestrator over the set. The set is launch-ready:

    /analyze-orchestrator -f NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md

## Rollback

**Per phase.**

- **Phase 1** — `git revert` the commit, then `drizzle/0010`'s inverse:
  `ALTER TABLE "nina_message_images" DROP COLUMN "source_avatar_id", DROP COLUMN "source_image_id";`
  The backfill is not undone by the revert and does not need to be — the columns go with it. No row
  is deleted at any point, so nothing is lost either way.
- **Phase 2** — revert the commit. The column and every description already written stay; the field
  goes back to read-only.
- **Phase 3** — revert the commit. The swipe and the focus button are untouched by it, so the sheet
  keeps its shipped openers.
- **Phase 4** — revert the commit. `nina_turns` is unaffected: a resend opens and closes an
  ordinary claim.

**As a whole.** `git branch -D feature/nina-photo-refs-and-bubble-actions` before merge, or revert
the merge commit and drop the two columns after.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md
