# Phase 13: Her page, her album, her promises

> ## ⚠ RECONCILIATION — binding rulings not yet folded into the body of this plan
>
> `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md` is **normative** and outranks anything
> below it. This plan's own four rulings (D-1 `crop.ts`'s home, D-2 no seed row, D-3 phase 10
> announces, D-4 no `loading.tsx`) were **accepted** and are carried into the sheet. Also relevant:
>
> - **C3 — `NinaPendingPromise` gains optional `jobId?` / `firedOn?` / `attempts?`**, folded into
>   phase 1 (jsonb, no migration, all optional so phase 5 still compiles).
> - **E6 — `lib/nina/crop.ts` is yours**, and phase 15's Steps 1–2 become no-ops. Its rollback
>   coupling stands: if phase 15 has landed, `crop.ts` must not be reverted with this phase.
> - **A5 — `NINA_AVATAR_FALLBACK_SRC` is exported from `lib/nina/album.ts`**, and phase 4's
>   `NINA_AVATAR_SRC` becomes a re-export of it. One spelling.
> - **F1 — R20 is struck from this phase's Satisfies line** (RU-18 dropped the face anchor); the
>   phase serves R17, R19, R25, R26.
> - **A1 — the DTO boundary**, and **B1/B2** for the `sendNinaMessage` / `NinaTurnInput` shapes.


**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R17 (her detail page, avatar full-screen, every chat image), R19 (a conditional
promise honoured by a real avatar change she then announces), R25 (the story behind the photo),
R26 ("attach to chat" from the zoomed album photo).
**R20 is NOT in this phase** — RU-18 dropped the face anchor and the index's phase-13 row still
lists R20; the reconciler should strike it. `nina.png` as her initial avatar is phase 1's, and
nothing else of R20 survives.
**Depends on:** Phases 1, 4, 5, 6, 12
**Difficulty:** HARD
**Package:** `lib/nina`, `components/nina`, `app/nina`

---

## Goal

After this phase her avatar is a door. Tapping it in the chat header opens `/nina/about` — a
WhatsApp-shaped detail page carrying her current face, her album of every avatar she has ever had,
and every photograph either party has put in the conversation; tapping any of them opens the one
full-screen swipeable viewer this repo already has, and from a zoomed album photo one button drops
that photo back into the chat as an ordinary message she will answer.

And her promises become real. A conditional promise she made in chat — *"kalo lo lari 10km besok,
gw ganti foto profil"* — is now evaluated against the runs he actually committed, on the Jakarta
day the condition named. Met, she asks phase 12 for a new photograph and the promise is not
consumed until that photograph actually lands in `nina_avatars`; unmet, nothing happens and she
never mentions it; failed, nothing is consumed and nothing is announced. She also knows what her
current photo *depicts*, so asked where she is in it she improvises a story that fits both the
picture and the conversation.

---

## The four rulings this phase was asked to make

RU-21 forbids a human in the loop, so each of these is decided here, with what would falsify it.

### D-1. `lib/nina/crop.ts` moves into THIS phase, verbatim

Phase 15 filed the plan set's one ordering conflict twice: it creates `lib/nina/crop.ts` but
phase 13 lands first and needs `ninaCropStyle`. **Decided: the file moves to phase 13, byte for
byte, as Step 1 and Step 2 below.** Phase 15's own Steps 1 and 2 become no-ops.

Why here and not phase 1: phase 1 is the migration, the env and the three repeals, and it is the
one phase in this set whose rollback is not a `git revert` — adding a pure rendering module to it
buys nothing and makes the riskiest commit larger. Why not leave it in 15: because then the chat
header and her detail page would render her face with arithmetic that disagrees with the admin
tool's circular preview, which is precisely the drift the module exists to prevent.

*Revisit if* the reconciler reorders the set so 15 lands before 13 — then it goes back to 15 and
this phase imports it.

### D-2. No `seed` row. `getCurrentNinaAvatar() === null` means the committed constant

**Decided: confirmed, phase 15's assumption stands.** The album is exactly the rows that exist,
and an empty album renders `NINA_AVATAR_FALLBACK_SRC` (`/nina/avatar-001.png`).

The argument is that `nina_avatars.blob_url` is documented as a Vercel Blob URL and
`pathname` as `nina/<userId>/avatar-<id>.jpg`; a seed row would have to put `/nina/avatar-001.png`
in both, which is a repo-relative public path and not either of those things. Every consumer would
then need a special case for the one row whose blob does not exist — `blob-reap` would see an
orphan, phase 15's delete button would offer to delete a committed file, and phase 14's re-anchor
would have a row it cannot replace. NULL-means-constant puts that special case in exactly one
pure function (`ninaAvatarView`) instead of in five callers.

*Revisit if* a second committed avatar is ever shipped — two constants is the point at which a
table beats an `if`.

### D-3. **Phase 10 announces. This phase never does.**

Phase 10's contract says "either, never both". **Decided: phase 10.** This phase inserts nothing
and calls neither `markNinaAvatarAnnounced` nor `getUnannouncedCurrentNinaAvatar`.

Three reasons, and RU-20 is the decisive one. (a) Under RU-20 the image is produced by a GitHub
Actions runner minutes later, in another process; the request that evaluated the promise is over,
so there is no "in-turn" left to announce in and an in-turn announcement would be a claim about a
photograph that does not exist yet. (b) Phase 12 already documents the mechanism —
"`announced_at` is left NULL by that function, and that NULL IS phase 10's `avatar_changed`
trigger" — and its `insertNinaAvatarAsCurrent` is the only writer on the generated path. (c) It is
also the operator path (RU-17): one announcer for the promise avatar, the admin avatar and the CLI
avatar means one voice and one place a duplicate could ever come from.

Consequence, stated so nobody re-adds it: the `set_avatar` tool's `tool_result` tells her the
camera is running and **explicitly instructs her not to claim the photo has changed yet.** She may
say she is taking one. Phase 10 says it landed.

*Revisit if* phase 12's rewrite ever lands a synchronous path again — then an in-turn announcement
becomes possible, and it is still not obviously better.

### D-4. No `app/nina/loading.tsx`, and none under `app/nina/about/` either

Phase 4 left this open, citing the measured soft-404 recorded in `app/(app)/loading.tsx`'s
docstring. **Decided: no `loading.tsx` anywhere under `app/nina`.**

A `loading.tsx` at `app/nina/` wraps `/nina/about` as well, which is the specific thing phase 4
declined to impose on a page it did not own. And this page does not want one: it awaits
`requireUserId()`, `listNinaAvatars` and `listNinaMessageImages` — two indexed reads on
`(user_id, created_at desc)` with no join and no model call — so the shell would flash and be
replaced inside one paint. A skeleton that appears and disappears is worse than no skeleton, which
is the same reading the `(app)` docstring reaches from the other direction.

*Revisit if* the album ever grows a per-photo derived read (a description generated on view, say),
because that is when the page stops being two index lookups.

---

## The promise state machine — the heart of the phase

RU-20 makes this the only hard part. Generation is dispatched to GitHub Actions and the avatar row
appears later, in another process. So "did she keep her promise" cannot be answered by a return
value, and the three requirements in the brief —

1. consumed **exactly once**,
2. **not** consumed and **not** announced when generation fails,
3. **expires** rather than haunting the slot forever,

— cannot all hold with a one-shot `fire()`. The machine is therefore two stages over durable
state, and the durable state is the promise entry itself:

```
                     ┌──────────────────────────────────────────────┐
                     │  status:'pending'  jobId:null                │  never fired
                     └───────────────┬──────────────────────────────┘
        condition not met yet, deadline in the future → stay here
        deadline passed, condition not met            → status:'expired'  (STAGE B)
        condition MET                                 → generateNinaAvatar (STAGE A)
                                     │
             ┌───────────────────────┴────────────────────────┐
             │ {ok:false}                                     │ {ok:true, jobId}
             ▼                                                ▼
   jobId:null, firedOn=today, attempts+1           jobId, firedOn=today, attempts+1
   status STILL 'pending'                          status STILL 'pending'
   retried on a LATER day, at most                            │
   PROMISE_MAX_ATTEMPTS times                                 │
                                     ┌──────────────────────────┴─────────────┐
                                     │ an avatar landed  → status:'met'       │
                                     │                     resolvedOn=today   │
                                     │ nothing landed and firedOn < today     │
                                     │   → clear jobId, allow one more try    │
                                     │   → attempts at the ceiling: 'expired' │
                                     └────────────────────────────────────────┘
```

**Stage A never writes `status`.** Both paths write the same attempt marker — `firedOn = today`
and `attempts + 1` — and only the accepted path also writes `jobId`. That is requirement 2
structurally: there is no code path from a failed generation to `status: 'met'`, and none to a
message either, because this phase posts no message at all (D-3). Writing the marker on the refused
path is not consumption, it is the **cooldown**: without it a five-minute cron would dispatch a
`workflow_dispatch` every five minutes against a transport error, and phase 12's cap of six
generations a day is the resource that would pay for it.

**Stage B is what makes it exactly-once.** A promise with a `jobId` is never re-fired inside the
same Jakarta day, so a sweep that runs every five minutes cannot dispatch twelve jobs against one
promise. And a job that never completes ages out through `attempts`, so the slot does not haunt.

**The landing test, and its one honest tolerance.** There is no `promise_id` on `nina_avatars` and
adding one is a migration in phase 1's commit, which this phase will not ask for. The test is
therefore: the current avatar has `source === 'generated'` and was created on or after the Jakarta
day the job was fired. It can be fooled by exactly one thing — a *different* generated avatar
landing the same day, from a `generate_image` selfie promoted to avatar or from a second promise.
The consequence of being fooled is that a promise is marked met on the day her photo really did
change, by a generation she really did run. That is not a lie about the world; it is the wrong
attribution of a true event, and it costs one wasted generation at most. The alternative — a
`nina_avatars.promise_id` column — is a migration, a phase-1 edit and a cross-phase conflict, for
a race that requires two avatar generations inside one day against a cap of six.

Three optional fields are all this needs on phase 1's type, and they are optional so phase 5's
constructor and its `mergePendingPromises` compile untouched. `nina_memory_slots.value` is `jsonb`,
so **there is no migration.**

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**

- `NINA_AVATAR_SRC` as an independently-defined constant in `components/nina/NinaAvatar.tsx`
  (phase 4). It becomes a re-export of `NINA_AVATAR_FALLBACK_SRC` from `lib/nina/album.ts`, so
  every phase-4 import keeps compiling and the path is spelled once. **This resolves phase 15's
  handoff 3.** Phase 15's `components/admin/CircleFrame.tsx` must import
  `NINA_AVATAR_FALLBACK_SRC` from `@/lib/nina/album` instead of defining its own.
- Nothing else. No table, no column, no config key, no file.

**Renames:** none.

**Creates — `lib/nina/crop.ts` and `lib/nina/crop.test.ts`** — **moved verbatim from phase 15**
(D-1). Every symbol in phase 15's contract for that file is created here instead, unchanged:
`NINA_CROP_MIN_SCALE`, `NINA_CROP_MAX_SCALE`, `NINA_CROP_SCALE_DECIMALS`,
`NINA_CROP_OFFSET_UNITS_PER_FRAME`, `NINA_CROP_MAX_ABS_OFFSET`, `NINA_CROP_KEY_STEP`,
`NINA_CROP_WHEEL_DIVISOR`, `NINA_CROP_WHEEL_MAX_FACTOR`, `NINA_CROP_IDENTITY`; `resolveCrop`,
`isIdentityCrop`, `cropSpanPct`, `maxCropOffset`, `clampCrop`, `panCrop`, `zoomCrop`,
`zoomFactorForWheel`, `nudgeCrop`, `ninaCropStyle`, `cropForWrite`; types `NinaCrop`,
`NinaCropInput`, `NinaNaturalSize`, `NinaCropStyle`, `NinaCropSpan`.

**Creates — `lib/nina/album.ts`** (pure, zero imports except `./crop`'s types — the
`lib/photos/gallery.ts` rule, so the client grid, the server page and the test all read it):

- `NINA_AVATAR_FALLBACK_SRC = '/nina/avatar-001.png'`
- `NINA_GALLERY_LIMIT = 200`, `NINA_ALBUM_MAX = 60`
- types `NinaAvatarView`, `NinaAlbumPhoto`, `NinaGalleryPhoto`, `NinaPhotoSide`
- `ninaAvatarView(row: AvatarLike | null): NinaAvatarView` — the one place NULL-means-constant
  lives (D-2)
- `albumPhotos(rows: readonly AvatarLike[]): NinaAlbumPhoto[]`
- `galleryPhotos(rows: readonly ImageLike[]): NinaGalleryPhoto[]`
- `photoSideOf(kind: string): NinaPhotoSide` — `'generated' -> 'hers'`, everything else `'his'`
- `NINA_SIDE_LABEL: Record<NinaPhotoSide, string>`, `NINA_ALBUM_LABEL: string`
- types `AvatarLike`, `ImageLike` (structural, so no schema type crosses into a client component)

**Creates — `lib/nina/album.test.ts`.**

**Creates — `lib/nina/promise.ts`** (pure, zero I/O, no `server-only` — invariant 6; this is the
module the brief says must be tested hard):

- types `PromiseRunFact`, `PromiseEarnedMarker`, `PromiseFacts`, `PromiseVerdict`,
  `PromiseVerdictKind`, `PromiseSlotResolution`, `PromiseEvalInput`
- constants `PROMISE_MAX_ATTEMPTS = 3`, `PROMISE_EXPIRY_GRACE_DAYS = 2`,
  `PROMISE_OPEN_ENDED_TTL_DAYS = 60`
- `promiseWindow(promise): { startISO: DateISO; endExclusiveISO: DateISO } | null`
- `conditionMet(promise, facts): boolean`
- `evaluatePromise(promise, input): PromiseVerdict`
- `evaluatePromises(promises, input): PromiseVerdict[]`
- `applyVerdict(promise, verdict, todayISO): NinaPendingPromise` (pure; returns a NEW entry,
  `source` is not its business because `source` lives on the row, not the entry)
- `resolvePromiseSlot(slot, verdicts, todayISO): PromiseSlotResolution`

**Creates — `lib/nina/promise.test.ts`.**

**Creates — `lib/nina/promises.ts`** (`server-only`; the impure orchestration, no arithmetic):

- `resolveNinaPromises(userId: string, deps?: NinaPromiseDeps): Promise<NinaPromiseSweep>`
- types `NinaPromiseDeps`, `NinaPromiseSweep`
- `productionPromiseDeps(): NinaPromiseDeps`
- `loadPromiseFacts(userId, promises, deps): Promise<PromiseFacts>`
- `NINA_PROMISE_SWEEP_BUDGET_MS = 20_000`

**Creates — `lib/nina/avatartools.ts`** (`server-only`; the `set_avatar` dispatch and the final
tool set):

- `handleSetAvatar: NinaToolHandler`
- `SetAvatarArgsSchema` (Zod), type `SetAvatarArgs`
- `NINA_FULL_TOOL_SET: NinaToolSet` —
  `extendToolSet(NINA_CHAT_TOOL_SET, [{ tool: SET_AVATAR_TOOL, handler: handleSetAvatar }])`
- `SET_AVATAR_ANSWERS: Record<'queued' | 'capped' | 'failed' | 'in_flight', string>`

**Creates — `lib/nina/albumActions.ts`** (`'use server'`; R26):

- `attachNinaPhotoToChat(input: NinaAttachInput): Promise<NinaAttachResult>`
- types `NinaAttachInput` (`{ kind: 'avatar' | 'image'; id: string; body: string }`),
  `NinaAttachResult` (`{ ok: boolean; userMessageId: string | null; unavailable: boolean }`)
- `NINA_ATTACH_MAX_CHARS = 600`

A one-call wrapper over phase 3's `sendNinaMessage`, so the album imports a file this phase owns
and phase 3's action gains one optional field rather than a second caller's worth of logic.

**Creates — `components/nina/NinaPhotoGrid.tsx`:** `NinaPhotoGrid` (client). One square grid, three
call sites (album, gallery, and phase 15 may reuse it).

**Creates — `components/nina/NinaAboutScreen.tsx`:** `NinaAboutScreen` (client). Owns the hero tap,
both grids, the viewer state and the attach button.

**Creates — `app/nina/about/page.tsx`:** the route. Server Component, three awaits, no model call.

**Signature changes:**

- `components/nina/NinaAvatar.tsx` (phase 4) — `NinaAvatar({ size, className })` becomes
  `NinaAvatar({ size, src, natural, crop, className })`. **Additive, all four new props optional
  with defaults**, so phase 4's two call sites (`app/nina/page.tsx:2026`,
  `TypingIndicator.tsx:1253`) and phase 6/7/8's compile untouched. Body routed through
  `ninaCropStyle` exactly as phase 15's handoff 1 writes it.
- `components/ui/PhotoViewer.tsx` — `ViewerPhoto` gains `label?: string`; `PhotoViewer` gains
  `subject?: string` (default `'screenshot'`). Both additive and both defaulted, so
  `ScreenshotStrip`, `SheetSource` and `PhotoInclusionList` are untouched. Without them the
  overlay's title reads `SCREEN_KIND_LABEL[photo.kind] ?? photo.kind`, which for
  `kind: 'generated'` renders the literal word "generated" and announces "generated screenshot".
- `components/nina/ChatImages.tsx` (phase 6) — gains `onOpen?: (index: number) => void` and
  `kinds?: readonly string[]`. **This is phase 6's own instruction**, verbatim: *"widen it with
  `onOpen` rather than writing a second grid."* When `onOpen` is absent the markup is byte-identical
  to phase 6's.
- `lib/nina/context.ts` (phase 2) — `NinaContext` gains `avatar: AvatarFacts | null` and
  `BuildNinaContextInput` gains `avatar: AvatarInput | null`. **Additive**; `buildNinaContext` gains
  four lines. R25.
- `lib/nina/load.ts` (phase 2) — `loadNinaContext`'s second `Promise.all` gains
  `getCurrentNinaAvatar(userId)`. One element, one mapping.
- `lib/nina/prompts/system.ts` (phase 2) — `CONTEXT_GUIDE` gains one paragraph naming
  `avatar`. No other prompt text changes.
- `lib/nina/actions.ts` (phase 3, already edited by phases 5, 6 and 12) — **two changes**. (a) One
  word: the `toolSet` option becomes `NINA_FULL_TOOL_SET` instead of phase 12's
  `NINA_CHAT_TOOL_SET`. (b) `sendNinaMessage`'s input gains **one optional field**,
  `attachExisting?: { kind: 'avatar' | 'image'; id: string }`, for a blob **the server already
  owns**. Additive and optional, so phase 4's and phase 6's call sites compile unchanged, and its
  refusal rule widens the same way phase 6 widened it: an empty `body` is refused only when
  `imageTickets` is empty **and** `attachExisting` is absent. R26's text-free attach is then a
  valid send, exactly as phase 8's run attachment is. Step 14 writes the block.
- `app/api/cron/nina/route.ts` (phase 10, one line) — one `await resolveNinaPromises(userId)`
  inside the existing per-user body, before the trigger sweep.
- `app/nina/page.tsx` (phase 4, three lines) — one `getCurrentNinaAvatar` read, the header avatar
  wrapped in a `<Link href="/nina/about">`, and the row's view passed to `NinaAvatar`.

**Requires (from earlier phases).** Each is named so the reconciler can push it into the owning
plan rather than leaving implementation to discover it.

1. **Phase 1 — `NinaPendingPromise` gains three OPTIONAL fields.** `jobId?: string | null`,
   `firedOn?: string | null` (Jakarta `'YYYY-MM-DD'`), `attempts?: number`. The column is `jsonb`,
   so **no migration changes**, and every field is optional, so phase 5's candidate constructor,
   its `mergePendingPromises` and its tests compile unchanged. The three exist because RU-20 makes
   generation land in another process minutes later; the rationale is in "The promise state
   machine" above and it should be quoted into phase 1's type docstring.
2. **Phase 1 — `getCurrentNinaAvatar`, `listNinaAvatars`, `insertNinaAvatarAsCurrent`,
   `listNinaMessageImages`, `getNinaMemorySlot`, `upsertNinaMemorySlot`, `insertNinaMessages`,
   `insertNinaMessageImages`** exactly as `phase-1.md` writes them (`:1951`, `:1961`, `:2001`,
   `:1603`, plus §Memory). All consumed unchanged. **`getUnannouncedCurrentNinaAvatar` and
   `markNinaAvatarAnnounced` exist and this phase calls neither** (D-3).
3. **Phase 1 — `NinaAvatarSource` includes `'generated'` and `'seed'`.** The landing test in Stage
   B reads `source === 'generated'`; `'seed'` is never inserted by anyone (D-2) and its presence in
   the union is harmless.
4. **Phase 1 — `nina_avatars.description`, `width`, `height`, `crop_scale`, `crop_x`, `crop_y`**
   nullable exactly as written. `description` is R25's whole input.
5. **Phase 2 — `SET_AVATAR_TOOL`** from `lib/nina/prompts/tools.ts`, with input schema
   `{ scene: string (required), because: string (required) }` (`phase-2.md:1902`). Consumed
   verbatim; the schema is not edited. Phase 2's own note — *"Phase 13 consumes
   `SET_AVATAR_TOOL`"* — is honoured.
6. **Phase 2 — `NinaContext`, `BuildNinaContextInput`, `buildNinaContext`, `loadNinaContext`,
   `CONTEXT_GUIDE`** exist with the shapes at `phase-2.md:1116`, `:1407`, `:1553`, `:2015`, and
   **the context reaches the model as JSON**, so a new field on `NinaContext` needs no renderer
   change beyond one `CONTEXT_GUIDE` paragraph.
7. **Phase 3 — `extendToolSet`, `NinaToolSet`, `NinaToolHandler`, `NinaToolContext`,
   `NinaToolAnswer`** from `lib/nina/tools.ts` (`phase-3.md:782`–`:860`). Consumed exactly as
   advertised; `tools.ts` and `turn.ts` bodies are not edited. `productionDeps()` is exported by
   phase 12's Requires 11, and this phase reuses that export rather than asking again.
8. **Phase 3 — `sendNinaMessage`'s write order and result shape.** `attachNinaPhotoToChat` is
   modelled on it and reuses `runNinaTurn`; it persists the runner row (and its image row) before
   the model call, for the same reason.
9. **Phase 4 — `components/nina/NinaAvatar.tsx`, `app/nina/page.tsx`, `components/ui/AppShell.tsx`
   with `bottomGap`.** `size-11` is already at the iOS tap floor, which is why making it a link
   needs no size change. Phase 4's handoff — *"Nina's avatar becoming a link, and coming from the
   album (Phase 13)"* — is discharged here.
10. **Phase 5 — `pending_promises` is written only through `mergePendingPromises`, and its
    phase-13 handoff.** Honoured to the letter: resolve **in place** (`status` / `resolvedOn`),
    write the **whole** slot back, **never remove an entry**, **carry the row's existing `source`
    through**, and **`metric: 'free'` stays `'pending'`**. The three new optional fields are set in
    place by the same rule.
11. **Phase 6 — `components/nina/ChatImages.tsx`, `nina_message_images` with
    `kind = 'upload'` under `nina/<userId>/chat/`, and `bg-ink-3/20` as the inset surface.** The
    gallery reads both `'upload'` (his and any of hers phase 6 wrote) and `'generated'` (phase 12's
    selfies). Phase 6's colour ruling is adopted for both grids without re-litigation.
12. **Phase 12 — `generateNinaAvatar(request: NinaAvatarRequest): Promise<NinaAvatarResult>`** from
    `lib/nina/avatargen.ts`, and **`NINA_CHAT_TOOL_SET`** from `lib/nina/imagetools.ts`. Only the
    NAME and the `ok` discriminant are relied on; see the port in Step 5. **It never throws and it
    never posts a message** — both are phase 12's stated guarantees and both are load-bearing here.
13. **Phase 12 — the terminal failure kinds** `'timeout' | 'policy' | 'transport' | 'stale'` plus
    `'capped'`. Every one of them is a `{ ok: false }`, and every `{ ok: false }` writes nothing.
14. **Phase 10 — `app/api/cron/nina/route.ts` exists with a per-user body**, and phase 10 owns the
    `avatar_changed` trigger on `is_current AND announced_at IS NULL`.
15. **`lib/date/ranges.ts`** — `todayInJakarta`, `jakartaDayOf`, `addDays`, `daysBetween`,
    `isValidDateISO`, type `DateISO`. **`lib/db/queries.ts`** — `getRunsBetween(userId, startISO,
    endExclusiveISO)`, reviewed-gated (invariant 9). **`lib/badges/gateway.ts`** —
    `dbBadgeGateway.readCurrent`-shaped `StoredBadge` with `earnedOn` / `firstEarnedOn`.
    **`lib/records/types.ts`** — `StoredRecord`. **`lib/id.ts`** — `newId()`.
    **`lib/format.ts`** — `formatKm`. All read unchanged.

**Leaves alone (owned by others):**

- **`lib/nina/imagegen.ts`, `imagejobs.ts`, `imagetools.ts`, `avatargen.ts`, `imagefail.ts` and
  `app/api/nina/image/route.ts` (phase 12).** This phase calls `generateNinaAvatar` and reads
  `NINA_CHAT_TOOL_SET`; it opens no job, claims none, sweeps none and writes no `nina_turns` row.
  The GitHub Actions workflow of RU-20 is entirely phase 12's.
- **`lib/nina/memory.ts` and `lib/nina/distill.ts` (phase 5).** Promises are *created* there. This
  phase never creates one, never edits `text` / `condition` / `metric` / `target` / `targetKey` /
  `byDate` / `promisedOn` / `sourceMessageId`, and never calls `mergePendingPromises`.
- **`components/nina/MessageBubble.tsx` (phase 7's client module), `MessageList.tsx`,
  `Composer.tsx`, `ChatScreen.tsx` (phases 4, 6, 7, 8).** Phase 7 noted its change *"invalidates
  phase 4's note that the album could server-render a bubble; split into `BubbleShell` if needed"*
  — **no split is needed**, because the album renders no bubble: attaching a photo produces a real
  row and the page navigates to `/nina`, where the existing renderer draws it.
- **`app/admin/**`, `components/admin/**`, `lib/admin/**` (phases 15, 16)** — including
  `CircleFrame`, `CropStudio` and every album-management action. This phase reads the album; it
  never adds, deletes or re-frames a photo, and it exposes no crop editor.
- **`scripts/nina-profpic.mjs` (phase 14)**, `lib/nina/proactive.ts` and the four other triggers
  (phase 10), `lib/nina/patterns.ts` / `nags.ts` (phase 9), `lib/nina/reply.ts` (phase 7),
  `lib/nina/scroll.ts` (phase 8), `lib/nina/vision.ts` (phase 6).
- **`lib/photos/gallery.ts` and `lib/photos/gallery.test.ts` — READ AND REUSED, NOT EDITED.**
  `stepIndex` and `decideSwipe` are imported through `PhotoViewer`, which already calls both.
  No second swipe implementation and no second overlay is written; the exit criteria say so and so
  does `PhotoViewer`'s header.
- **`lib/panel/param.ts`, `components/ui/usePanelParam.ts`, `DetailPanel.tsx`, `Sheet.tsx`** —
  read as prior art (F24), imported by nothing here. See Step 8's ruling on why.
- `lib/format.ts`, `lib/db/queries.ts`, `lib/db/schema.ts`, `lib/env.ts`, every `scripts/check-*`,
  `proxy.ts`, `package.json`.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/crop.ts` | create | **moved from phase 15 verbatim** (D-1) — the one crop-to-CSS mapping |
| `lib/nina/crop.test.ts` | create | **moved from phase 15 verbatim** (D-1) |
| `lib/nina/album.ts` | create | pure view models; `NINA_AVATAR_FALLBACK_SRC`; NULL-means-constant |
| `lib/nina/album.test.ts` | create | the fallback rule, the side discriminator, the caps |
| `lib/nina/promise.ts` | create | the promise evaluator and the slot resolver, pure |
| `lib/nina/promise.test.ts` | create | 22 cases; the edge cases the brief names |
| `lib/nina/promises.ts` | create | `resolveNinaPromises` — the two-stage sweep, server-only |
| `lib/nina/avatartools.ts` | create | `handleSetAvatar`, `NINA_FULL_TOOL_SET` |
| `lib/nina/albumActions.ts` | create | R26's `attachNinaPhotoToChat` Server Action |
| `lib/nina/albumActions.test.ts` | create | the ownership check and the empty-body rule |
| `components/nina/NinaPhotoGrid.tsx` | create | one square grid, three call sites |
| `components/nina/NinaAboutScreen.tsx` | create | the client half of `/nina/about` |
| `app/nina/about/page.tsx` | create | the route: three awaits, no model call |
| `components/nina/NinaAvatar.tsx` | modify | `NinaAvatar` (`:1200`) gains `src`/`natural`/`crop`; `NINA_AVATAR_SRC` re-exported |
| `components/ui/PhotoViewer.tsx` | modify | `ViewerPhoto.label?` (`:47`), `PhotoViewer subject?` (`:52`), title + aria (`:181`) |
| `components/nina/ChatImages.tsx` | modify | `onOpen?` and `kinds?` on `ChatImages` (phase-6 `:1997`) |
| `lib/nina/context.ts` | modify | `NinaContext.avatar` (`phase-2.md:1116`), `buildNinaContext` (`:1407`) |
| `lib/nina/load.ts` | modify | one more element in `loadNinaContext`'s second `Promise.all` (`:1567`) |
| `lib/nina/prompts/system.ts` | modify | one `CONTEXT_GUIDE` paragraph (`phase-2.md:2015`) |
| `lib/nina/actions.ts` | modify | `toolSet: NINA_FULL_TOOL_SET`; `attachExisting?` input field |
| `app/api/cron/nina/route.ts` | modify | one line: `await resolveNinaPromises(userId)` |
| `app/nina/page.tsx` | modify | avatar read + `<Link>` around the header avatar (phase-4 `:2026`) |

Twenty-two files. Thirteen created, nine modified, none deleted.

---

## Implementation Steps

### Step 1: `lib/nina/crop.ts` — moved from phase 15, byte for byte

**File:** `lib/nina/crop.ts` (new)
**Change:** D-1. The file body is phase 15's Step 1 with **no edit of any kind** — not a comment,
not a constant, not a name. It is reproduced in full below so this plan is self-contained and so a
diff against `phase-15.md:322-628` proves the move was faithful.

**Code:**

```ts
/**
 * The circular-frame transform (R23), as pure arithmetic.
 *
 * ── WHY THIS IS A MODULE AND NOT A COMPONENT ─────────────────────────────────────────────────
 * `/admin/nina` is the only free-form direct-manipulation UI in this repo, and `vitest.config.ts`
 * runs `environment: 'node'`: no jsdom, no `PointerEvent`, no `getBoundingClientRect`. So the
 * clamping, the aspect fit, the gesture conversion and the CSS mapping all live here where they
 * can be proven, and `components/admin/CropStudio.tsx` is left holding two pointer positions and
 * a subtraction. This is the same carve-out as `lib/photos/gallery.ts` out of `PhotoViewer.tsx`
 * and `lib/photos/resizeTarget.ts` out of `compressForExtraction.ts`, for the same stated reason.
 *
 * Zero imports, so a `'use client'` component, a Server Action, a Server Component and the unit
 * suite can all read it — the `lib/extract/constants.ts` rule.
 *
 * ── THE STORED CONVENTION (phase 1 owns it; this module implements it) ───────────────────────
 * `nina_avatars.crop_scale` is a multiple of the **cover** fit: `1.000` is the smallest scale that
 * still fills the circle, `1.500` is 50% further in. `crop_x` / `crop_y` are the image centre's
 * offset from the frame centre in **thousandths of the frame's width**, positive x right, positive
 * y down. All three NULL means "no transform" — render `object-cover`, centred. A partial triple
 * reads a missing scale as 1 and missing offsets as 0 rather than throwing.
 *
 * ── WHY THE FRAME IS ASSUMED SQUARE ──────────────────────────────────────────────────────────
 * A circle is inscribed in a square box, so frame width == frame height at every call site, and
 * `top: N%` (which resolves against the containing block's HEIGHT) is therefore the same unit as
 * `left: N%` (which resolves against its WIDTH). That equality is what lets one stored offset unit
 * — thousandths of the frame's *width* — position both axes. **Every caller must render the frame
 * in a square box** (`size-7`, `size-11`, `h-[512px] w-[512px]`, `aspect-square`); a non-square
 * box would silently stretch the y offset. `CircleFrame` is the component that guarantees it.
 *
 * ── WHY PERCENTAGES AND NOT `transform: translate()` ─────────────────────────────────────────
 * A percentage `translate()` resolves against the ELEMENT's own box, not its container's — so a
 * translate-based mapping would need the frame's pixel size at every call site, and the 28 px
 * bubble avatar and the 512 px studio frame would each have to know their own size to agree. With
 * `width`/`height`/`left`/`top` all expressed as percentages of the frame, the same three stored
 * numbers are correct at any size, with no measurement anywhere. That property is the reason the
 * admin preview and the chat header cannot drift.
 */

/** The resolved transform: never null, always usable. */
export interface NinaCrop {
  /** Multiple of the cover fit. >= NINA_CROP_MIN_SCALE. */
  scale: number
  /** Thousandths of the frame's width, positive = image moves right. Integer. */
  x: number
  /** Thousandths of the frame's width, positive = image moves down. Integer. */
  y: number
}

/** What the database hands back: any of the three may be NULL. */
export interface NinaCropInput {
  scale: number | null
  x: number | null
  y: number | null
}

/** The image's intrinsic pixel size. `nina_avatars.width`/`height` may be NULL, hence the union. */
export interface NinaNaturalSize {
  width: number | null
  height: number | null
}

/** The rendered image's size in frame-widths, before offsets. Both >= 100. */
export interface NinaCropSpan {
  widthPct: number
  heightPct: number
}

/**
 * The inline style for the `<img>` inside a square, `overflow-hidden`, `rounded-pill` box.
 * Deliberately a plain object of strings rather than `React.CSSProperties`, so this module keeps
 * its zero imports and stays assertable with `toEqual`.
 */
export interface NinaCropStyle {
  position: 'absolute'
  width: string
  height: string
  left: string
  top: string
  objectFit: 'cover'
}

/** `1.000` is cover. Below it the image would not fill the circle, so it is the floor. */
export const NINA_CROP_MIN_SCALE = 1

/**
 * 4x cover. Chosen against the real source: the anchor is 1792x2400, so 4x cover renders a
 * 1792 px-wide face into a 512 px studio frame at 448 px of source per 128 px of screen — still
 * sharp. A higher ceiling only offers the operator a way to make her face a blur.
 */
export const NINA_CROP_MAX_SCALE = 4

/** `numeric(5,3)` — three decimals is what the column stores, so it is what we round to. */
export const NINA_CROP_SCALE_DECIMALS = 3

/** Offsets are thousandths of the frame's width. Phase 1's column comment, as a constant. */
export const NINA_CROP_OFFSET_UNITS_PER_FRAME = 1000

/**
 * A hard cap the server can apply WITHOUT knowing the image's dimensions.
 * `clampCrop` is exact when `width`/`height` are known; this is the fallback for a row whose
 * dimension columns are NULL, and it is generous on purpose — at the 4x ceiling a 1:6 panorama's
 * legitimate x range is +/-4900.
 */
export const NINA_CROP_MAX_ABS_OFFSET = 5_000

/** One arrow-key press: 10 thousandths = 1% of the frame. Fine enough to centre an eye. */
export const NINA_CROP_KEY_STEP = 10

/** Wheel sensitivity: `deltaY` of 400 (about three notches) is one e-fold of zoom. */
export const NINA_CROP_WHEEL_DIVISOR = 400

/** No single wheel event may more than double or halve the scale — trackpads emit huge deltas. */
export const NINA_CROP_WHEEL_MAX_FACTOR = 2

/** "No transform", as the value every pre-phase-15 row means. */
export const NINA_CROP_IDENTITY: NinaCrop = { scale: NINA_CROP_MIN_SCALE, x: 0, y: 0 }

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * A stored triple (or nothing at all) as usable numbers.
 *
 * The partial-triple rule is phase 1's, quoted: *"A renderer must treat a partial triple (scale
 * set, offsets NULL) as offsets of zero rather than as an error."* NaN, Infinity and a
 * below-cover scale are all folded into the identity too — a renderer that throws on bad data
 * shows the user a broken page, and this data has three writers.
 */
export function resolveCrop(input: NinaCropInput | null | undefined): NinaCrop {
  if (input == null) return { ...NINA_CROP_IDENTITY }
  return {
    scale: Math.max(NINA_CROP_MIN_SCALE, finiteOr(input.scale, NINA_CROP_MIN_SCALE)),
    x: Math.round(finiteOr(input.x, 0)),
    y: Math.round(finiteOr(input.y, 0)),
  }
}

/** True when this crop renders exactly as plain centred `object-cover`. */
export function isIdentityCrop(crop: NinaCrop): boolean {
  return crop.scale === NINA_CROP_MIN_SCALE && crop.x === 0 && crop.y === 0
}

/**
 * How much of the frame the rendered image spans, per axis, in percent — the aspect fit.
 *
 * At `scale = 1` the SHORT edge is exactly 100% (that is what "cover" means) and the long edge
 * overflows by the aspect ratio. An unknown or implausible natural size degrades to a square:
 * `{100, 100}` renders as plain `object-cover`, which is the honest answer when we do not know
 * the shape of the file.
 */
export function cropSpanPct(natural: NinaNaturalSize, crop: NinaCrop): NinaCropSpan {
  const w = finiteOr(natural.width, 0)
  const h = finiteOr(natural.height, 0)
  if (w <= 0 || h <= 0) return { widthPct: 100 * crop.scale, heightPct: 100 * crop.scale }
  const short = Math.min(w, h)
  return {
    widthPct: (w / short) * crop.scale * 100,
    heightPct: (h / short) * crop.scale * 100,
  }
}

/**
 * The furthest the image centre may sit from the frame centre, per axis, in stored units —
 * i.e. **the clamp that makes dragging the image off its frame impossible.**
 *
 * The frame must stay fully covered, so the image's left edge may not cross 0% and its right edge
 * may not cross 100%:
 *
 *     left  = 50 + x/10 - widthPct/2 <= 0     ->  x <=  10 * (widthPct/2 - 50)
 *     right = 50 + x/10 + widthPct/2 >= 100   ->  x >= -10 * (widthPct/2 - 50)
 *
 * so `|x| <= 5 * widthPct - 500`. At `scale = 1` on a portrait image that is exactly 0 for x — the
 * width already fits the frame precisely, so there is nowhere to slide horizontally, which is
 * correct and is the case a naive implementation gets wrong by allowing a sliver of background.
 *
 * `Math.max(0, ...)` guards the sub-cover case, which `resolveCrop` already prevents.
 */
export function maxCropOffset(natural: NinaNaturalSize, crop: NinaCrop): { x: number; y: number } {
  const { widthPct, heightPct } = cropSpanPct(natural, crop)
  return {
    x: Math.max(0, Math.floor(widthPct * 5 - 500)),
    y: Math.max(0, Math.floor(heightPct * 5 - 500)),
  }
}

/**
 * The only way a crop becomes valid. Scale into `[MIN, MAX]` and rounded to the column's three
 * decimals FIRST, because the offset bounds depend on it — clamping offsets against the old scale
 * and then changing the scale is how a zoom-out leaves a corner of background showing.
 */
export function clampCrop(natural: NinaNaturalSize, crop: NinaCrop): NinaCrop {
  const scale = round(
    Math.min(NINA_CROP_MAX_SCALE, Math.max(NINA_CROP_MIN_SCALE, finiteOr(crop.scale, 1))),
    NINA_CROP_SCALE_DECIMALS,
  )
  const limit = maxCropOffset(natural, { ...crop, scale })
  const clamp = (value: number, max: number) =>
    Math.round(Math.min(max, Math.max(-max, finiteOr(value, 0))))
  return { scale, x: clamp(crop.x, limit.x), y: clamp(crop.y, limit.y) }
}

/**
 * A drag: pointer deltas in CSS px against a frame of `framePx` px, converted to stored units and
 * clamped. The image follows the pointer, so a rightward drag increases x.
 *
 * `framePx <= 0` returns the crop untouched rather than dividing by zero — a component can be
 * asked for a pointer move before layout has measured the frame.
 */
export function panCrop(
  natural: NinaNaturalSize,
  crop: NinaCrop,
  dxPx: number,
  dyPx: number,
  framePx: number,
): NinaCrop {
  if (!Number.isFinite(framePx) || framePx <= 0) return crop
  const perUnit = NINA_CROP_OFFSET_UNITS_PER_FRAME / framePx
  return clampCrop(natural, {
    scale: crop.scale,
    x: crop.x + finiteOr(dxPx, 0) * perUnit,
    y: crop.y + finiteOr(dyPx, 0) * perUnit,
  })
}

/**
 * A zoom about the FRAME CENTRE, which is where the face is being aimed.
 *
 * ── WHY THE OFFSETS SCALE TOO ────────────────────────────────────────────────────────────────
 * The image point currently under the frame centre sits at some image-relative position `p`; its
 * frame position is `imageCentre + p * s`. Holding it still while the scale becomes `s * k`
 * requires the centre offset to become `k` times what it was. Leaving x and y alone instead —
 * the obvious implementation — makes the picture appear to slide away from the crosshair as you
 * zoom in, which is the single most common bug in a crop widget.
 */
export function zoomCrop(natural: NinaNaturalSize, crop: NinaCrop, factor: number): NinaCrop {
  const k = finiteOr(factor, 1)
  if (k <= 0) return crop
  return clampCrop(natural, { scale: crop.scale * k, x: crop.x * k, y: crop.y * k })
}

/**
 * A wheel/trackpad `deltaY` as a multiplicative zoom factor. Up (negative delta) zooms in.
 * Exponential, so zoom feels linear per notch at every scale, and hard-capped both ways because a
 * momentum trackpad can emit a `deltaY` of several hundred in one event.
 */
export function zoomFactorForWheel(deltaY: number): number {
  const raw = Math.exp(-finiteOr(deltaY, 0) / NINA_CROP_WHEEL_DIVISOR)
  return Math.min(NINA_CROP_WHEEL_MAX_FACTOR, Math.max(1 / NINA_CROP_WHEEL_MAX_FACTOR, raw))
}

/** An arrow-key nudge, in stored units. The keyboard path to the same clamp. */
export function nudgeCrop(
  natural: NinaNaturalSize,
  crop: NinaCrop,
  dx: number,
  dy: number,
): NinaCrop {
  return clampCrop(natural, { scale: crop.scale, x: crop.x + dx, y: crop.y + dy })
}

/**
 * **THE ONE CROP-TO-CSS MAPPING IN THE REPO.** The admin studio's preview, the album grid's
 * thumbnails, the chat header's 44 px avatar and the typing row's 28 px avatar must all render
 * through this function. Two implementations of it means a crop that looks centred in the tool and
 * off-centre in the app, with nothing failing anywhere — the exact silent failure R23 exists to
 * prevent.
 *
 * Usage — the box MUST be square, `relative` and `overflow-hidden`:
 *
 *     <span className="relative block size-11 overflow-hidden rounded-pill bg-paper-2">
 *       <img src={url} alt="" style={ninaCropStyle({ width, height }, resolveCrop(row))} />
 *     </span>
 *
 * The identity crop returns `{100%, 100%, 0%, 0%}` for a square image and a correctly
 * cover-centred box for any other aspect ratio, so a row with NULL crop columns renders exactly as
 * `object-cover` did before this phase existed. That equality is asserted in the test suite and is
 * what makes the whole album safe to leave un-backfilled.
 */
export function ninaCropStyle(natural: NinaNaturalSize, crop: NinaCrop): NinaCropStyle {
  const { widthPct, heightPct } = cropSpanPct(natural, crop)
  const offsetPct = (units: number) => units / (NINA_CROP_OFFSET_UNITS_PER_FRAME / 100)
  const pct = (value: number) => `${round(value, 4)}%`
  return {
    position: 'absolute',
    width: pct(widthPct),
    height: pct(heightPct),
    left: pct(50 + offsetPct(crop.x) - widthPct / 2),
    top: pct(50 + offsetPct(crop.y) - heightPct / 2),
    objectFit: 'cover',
  }
}

/**
 * What to persist. An identity crop is written as three NULLs, so the "Reset framing" button and
 * "Save framing" are one code path and one query — phase 1's `updateNinaAvatarCrop` docstring
 * makes exactly that promise, and this is the function that keeps it.
 */
export function cropForWrite(crop: NinaCrop): NinaCropInput {
  if (isIdentityCrop(crop)) return { scale: null, x: null, y: null }
  return { scale: crop.scale, x: crop.x, y: crop.y }
}
```

**Impact:** one new pure module, no existing file touched. It is the only place in the repo that
knows what `crop_scale` means. **Phase 15's Step 1 becomes a no-op** and its plan should say so.

---

### Step 2: `lib/nina/crop.test.ts` — moved from phase 15, byte for byte

**File:** `lib/nina/crop.test.ts` (new; `vitest.config.ts:37` includes `lib/**/*.test.ts`)
**Change:** D-1, the other half. Phase 15's Step 2 verbatim.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  NINA_CROP_IDENTITY,
  NINA_CROP_MAX_SCALE,
  NINA_CROP_MIN_SCALE,
  clampCrop,
  cropForWrite,
  cropSpanPct,
  isIdentityCrop,
  maxCropOffset,
  ninaCropStyle,
  nudgeCrop,
  panCrop,
  resolveCrop,
  zoomCrop,
  zoomFactorForWheel,
} from './crop'

/** Her anchor, and therefore the shape of every generated and hand-uploaded photo so far. */
const PORTRAIT = { width: 1792, height: 2400 }
const LANDSCAPE = { width: 4000, height: 3000 }
const SQUARE = { width: 1024, height: 1024 }

describe('resolveCrop', () => {
  it('reads all-NULL as the identity — phase 1 s "no transform" row', () => {
    expect(resolveCrop({ scale: null, x: null, y: null })).toEqual(NINA_CROP_IDENTITY)
    expect(resolveCrop(null)).toEqual(NINA_CROP_IDENTITY)
    expect(resolveCrop(undefined)).toEqual(NINA_CROP_IDENTITY)
  })

  it('reads a PARTIAL triple as offsets of zero, not as an error', () => {
    expect(resolveCrop({ scale: 1.5, x: null, y: null })).toEqual({ scale: 1.5, x: 0, y: 0 })
    expect(resolveCrop({ scale: null, x: 40, y: -10 })).toEqual({ scale: 1, x: 40, y: -10 })
  })

  it('folds nonsense into the identity rather than throwing', () => {
    expect(resolveCrop({ scale: Number.NaN, x: Number.POSITIVE_INFINITY, y: 0 })).toEqual(
      NINA_CROP_IDENTITY,
    )
    expect(resolveCrop({ scale: 0.25, x: 0, y: 0 }).scale).toBe(NINA_CROP_MIN_SCALE)
  })
})

describe('cropSpanPct — the aspect fit', () => {
  it('puts the SHORT edge at exactly 100% at cover scale', () => {
    expect(cropSpanPct(PORTRAIT, NINA_CROP_IDENTITY).widthPct).toBeCloseTo(100, 6)
    expect(cropSpanPct(PORTRAIT, NINA_CROP_IDENTITY).heightPct).toBeCloseTo(133.9286, 4)
    expect(cropSpanPct(LANDSCAPE, NINA_CROP_IDENTITY)).toEqual({ widthPct: 400 / 3, heightPct: 100 })
    expect(cropSpanPct(SQUARE, NINA_CROP_IDENTITY)).toEqual({ widthPct: 100, heightPct: 100 })
  })

  it('scales both axes together', () => {
    const span = cropSpanPct(PORTRAIT, { scale: 2, x: 0, y: 0 })
    expect(span.widthPct).toBeCloseTo(200, 6)
    expect(span.heightPct).toBeCloseTo(267.8571, 4)
  })

  it('degrades an unknown natural size to a square instead of dividing by zero', () => {
    expect(cropSpanPct({ width: null, height: null }, NINA_CROP_IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
    expect(cropSpanPct({ width: 0, height: 900 }, NINA_CROP_IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
  })
})

describe('maxCropOffset — the image can never leave its frame', () => {
  it('allows NO horizontal travel on a portrait at cover scale', () => {
    expect(maxCropOffset(PORTRAIT, NINA_CROP_IDENTITY)).toEqual({ x: 0, y: 169 })
  })

  it('allows NO vertical travel on a landscape at cover scale', () => {
    expect(maxCropOffset(LANDSCAPE, NINA_CROP_IDENTITY)).toEqual({ x: 166, y: 0 })
  })

  it('pins a square at cover scale completely', () => {
    expect(maxCropOffset(SQUARE, NINA_CROP_IDENTITY)).toEqual({ x: 0, y: 0 })
  })

  it('opens up as the scale rises', () => {
    expect(maxCropOffset(PORTRAIT, { scale: 2, x: 0, y: 0 })).toEqual({ x: 500, y: 839 })
  })
})

describe('clampCrop', () => {
  it('holds the scale inside [1, MAX] and rounds to the column s three decimals', () => {
    expect(clampCrop(PORTRAIT, { scale: 0.2, x: 0, y: 0 }).scale).toBe(NINA_CROP_MIN_SCALE)
    expect(clampCrop(PORTRAIT, { scale: 99, x: 0, y: 0 }).scale).toBe(NINA_CROP_MAX_SCALE)
    expect(clampCrop(PORTRAIT, { scale: 1.23456, x: 0, y: 0 }).scale).toBe(1.235)
  })

  it('clamps offsets to the frame, symmetrically', () => {
    expect(clampCrop(PORTRAIT, { scale: 1, x: 900, y: 900 })).toEqual({ scale: 1, x: 0, y: 169 })
    expect(clampCrop(PORTRAIT, { scale: 1, x: -900, y: -900 })).toEqual({ scale: 1, x: 0, y: -169 })
  })

  it('clamps offsets against the NEW scale, not the old one', () => {
    // The regression this ordering exists to prevent: legal at 2x, illegal at 1x.
    expect(clampCrop(PORTRAIT, { scale: 1, x: 0, y: 800 }).y).toBe(169)
  })

  it('returns integer offsets, because the columns are integers', () => {
    const crop = clampCrop(PORTRAIT, { scale: 2, x: 12.6, y: -4.2 })
    expect(Number.isInteger(crop.x)).toBe(true)
    expect(crop).toEqual({ scale: 2, x: 13, y: -4 })
  })
})

describe('panCrop', () => {
  it('converts pointer px to thousandths of the frame and follows the pointer', () => {
    // 51.2px on a 512px frame is 100 thousandths; x is pinned at cover, y is free.
    expect(panCrop(PORTRAIT, { scale: 1, x: 0, y: 0 }, 51.2, 51.2, 512)).toEqual({
      scale: 1,
      x: 0,
      y: 100,
    })
    expect(panCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 51.2, 0, 512).x).toBe(100)
  })

  it('is size-independent — the same fraction of any frame is the same crop', () => {
    const big = panCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 128, 0, 512)
    const small = panCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 7, 0, 28)
    expect(big.x).toBe(250)
    expect(small.x).toBe(250)
  })

  it('is a no-op before the frame has been measured', () => {
    const crop = { scale: 2, x: 10, y: 10 }
    expect(panCrop(PORTRAIT, crop, 40, 40, 0)).toBe(crop)
    expect(panCrop(PORTRAIT, crop, 40, 40, Number.NaN)).toBe(crop)
  })
})

describe('zoomCrop', () => {
  it('scales the offsets with the zoom, so the frame centre holds still', () => {
    expect(zoomCrop(PORTRAIT, { scale: 1, x: 0, y: 100 }, 2)).toEqual({ scale: 2, x: 0, y: 200 })
  })

  it('pulls an offset back inside the frame when zooming OUT', () => {
    // y=800 is legal at 2x (max 839) and must not survive the return to 1x (max 169).
    expect(zoomCrop(PORTRAIT, { scale: 2, x: 0, y: 800 }, 0.5)).toEqual({ scale: 1, x: 0, y: 169 })
  })

  it('refuses a non-positive factor rather than inverting the image', () => {
    const crop = { scale: 2, x: 0, y: 0 }
    expect(zoomCrop(PORTRAIT, crop, 0)).toBe(crop)
    expect(zoomCrop(PORTRAIT, crop, -1)).toBe(crop)
  })
})

describe('zoomFactorForWheel', () => {
  it('zooms in on a negative delta and out on a positive one', () => {
    expect(zoomFactorForWheel(-100)).toBeCloseTo(1.284, 3)
    expect(zoomFactorForWheel(100)).toBeCloseTo(0.7788, 4)
    expect(zoomFactorForWheel(0)).toBe(1)
  })

  it('caps a momentum trackpad s huge delta at 2x / 0.5x per event', () => {
    expect(zoomFactorForWheel(-4000)).toBe(2)
    expect(zoomFactorForWheel(4000)).toBe(0.5)
    expect(zoomFactorForWheel(Number.NaN)).toBe(1)
  })
})

describe('nudgeCrop', () => {
  it('is the keyboard path to the same clamp', () => {
    expect(nudgeCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 10, -10)).toEqual({
      scale: 2,
      x: 10,
      y: -10,
    })
    expect(nudgeCrop(PORTRAIT, { scale: 1, x: 0, y: 169 }, 0, 10).y).toBe(169)
  })
})

describe('ninaCropStyle — the one mapping', () => {
  it('renders the identity exactly as centred object-cover', () => {
    expect(ninaCropStyle(SQUARE, NINA_CROP_IDENTITY)).toEqual({
      position: 'absolute',
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
      objectFit: 'cover',
    })
    expect(ninaCropStyle(PORTRAIT, NINA_CROP_IDENTITY)).toEqual({
      position: 'absolute',
      width: '100%',
      height: '133.9286%',
      left: '0%',
      top: '-16.9643%',
      objectFit: 'cover',
    })
  })

  it('moves the image right and down for positive offsets', () => {
    const style = ninaCropStyle(PORTRAIT, { scale: 2, x: 100, y: -200 })
    expect(style).toEqual({
      position: 'absolute',
      width: '200%',
      height: '267.8571%',
      left: '-40%', // 50 + 10 - 100
      top: '-103.9286%', // 50 - 20 - 133.9286
      objectFit: 'cover',
    })
  })

  it('always covers the frame for any clamped crop — the property that matters', () => {
    for (const natural of [PORTRAIT, LANDSCAPE, SQUARE, { width: 6000, height: 1000 }]) {
      for (const scale of [1, 1.001, 1.5, 2.75, 4]) {
        for (const [x, y] of [
          [0, 0],
          [9999, 9999],
          [-9999, -9999],
          [9999, -9999],
        ]) {
          const crop = clampCrop(natural, { scale, x, y })
          const style = ninaCropStyle(natural, crop)
          const left = Number.parseFloat(style.left)
          const top = Number.parseFloat(style.top)
          const width = Number.parseFloat(style.width)
          const height = Number.parseFloat(style.height)
          expect(left).toBeLessThanOrEqual(0.0001)
          expect(top).toBeLessThanOrEqual(0.0001)
          expect(left + width).toBeGreaterThanOrEqual(99.9999)
          expect(top + height).toBeGreaterThanOrEqual(99.9999)
        }
      }
    }
  })
})

describe('cropForWrite', () => {
  it('writes an identity crop as three NULLs, so Reset needs no second query', () => {
    expect(cropForWrite(NINA_CROP_IDENTITY)).toEqual({ scale: null, x: null, y: null })
    expect(isIdentityCrop(NINA_CROP_IDENTITY)).toBe(true)
  })

  it('writes a real crop as itself', () => {
    expect(cropForWrite({ scale: 1.75, x: -120, y: 40 })).toEqual({ scale: 1.75, x: -120, y: 40 })
  })
})
```

**Impact:** the arithmetic is proved before either renderer depends on it. **Phase 15's Step 2
becomes a no-op.**

---

### Step 3: `lib/nina/album.ts` — the view models, and the one place NULL means the constant

**File:** `lib/nina/album.ts` (new)
**Change:** every decision the two grids and the header avatar make about *what to show*, as pure
functions over structural inputs. `AvatarLike` and `ImageLike` are structural on purpose:
`NinaAvatarRow` and `NinaImageRow` assign to them with no adapter, but no schema type crosses into
a client component, which is the same rule `ViewerPhoto` follows against `ReviewPhoto`.

**Code:**

```ts
import type { NinaCropInput } from './crop'

/**
 * Her album and the conversation's photographs, as the screens need them — F33 R17/R19/R26.
 *
 * ── WHY THIS FILE IS PURE AND IMPORT-FREE ─────────────────────────────────────────────────────
 * Invariant 6: vitest runs `environment: 'node'` with no jsdom, so UI behaviour worth testing has
 * to be a pure function in `lib/`. Everything below is read by a client grid, a Server Component
 * and a unit suite, which is exactly the `lib/photos/gallery.ts` and `lib/nina/images.ts` shape.
 * The single import is a TYPE, so it erases.
 *
 * ── THE ALBUM IS DELIBERATELY A SET OF DIFFERENT FACES ────────────────────────────────────────
 * RU-18 dropped the face anchor: *"i only want successful image generation"*. So her generated
 * photos do not look like each other, and nothing here tries to hide that — no grouping by
 * likeness, no "current face" section, no ordering that buries the odd one out. Newest first, that
 * is all. She also never remarks on it; see `CONTEXT_GUIDE` in Step 9.
 */

/**
 * The committed seed, spelled ONCE.
 *
 * Phase 4 defined `NINA_AVATAR_SRC` in `components/nina/NinaAvatar.tsx` and phase 15 defined
 * `NINA_AVATAR_FALLBACK_SRC` in `components/admin/CircleFrame.tsx`, each because importing across
 * the other's boundary looked worse than a second string. Phase 15 filed the collapse as its
 * handoff 3 and this is it: the constant lives in `lib/`, both components import it, and a third
 * copy has nowhere to appear from.
 *
 * It is a `public/` path and not a Blob URL, which is the whole of why `getCurrentNinaAvatar()`
 * returning null does not need a database row to mean something — see `ninaAvatarView`.
 */
export const NINA_AVATAR_FALLBACK_SRC = '/nina/avatar-001.png'

/**
 * How many conversation photographs the gallery renders.
 *
 * Matched to phase 4's `CHAT_HISTORY_LIMIT` of 200 for one reason: the gallery is a view of the
 * conversation, and a photo visible in the gallery whose message has scrolled out of the chat is a
 * dead end for the runner. Equal limits keep the two surfaces describing the same conversation.
 */
export const NINA_GALLERY_LIMIT = 200

/**
 * How many album photos render at once. Six generations a day (phase 12's cap) is ten days of
 * flat-out use, and `listNinaAvatars` is unpaginated by design, so this is a render cap and not a
 * query cap: the rows are already in hand.
 */
export const NINA_ALBUM_MAX = 60

/** Whose photograph it is. `kind` is phase 6's his/hers discriminator; this names it. */
export type NinaPhotoSide = 'his' | 'hers'

/**
 * Deliberately shown in the viewer's title, so it is a phrase and not a word:
 * `SCREEN_KIND_LABEL[kind] ?? kind` used to render the literal string "generated".
 */
export const NINA_SIDE_LABEL: Readonly<Record<NinaPhotoSide, string>> = {
  his: 'Foto kamu',
  hers: 'Foto Nina',
}

/** The album's own label. Not a `NinaPhotoSide`: an avatar is not a chat photograph. */
export const NINA_ALBUM_LABEL = 'Foto profil Nina'

/**
 * `'generated'` is phase 12's kind and `'upload'` is phase 6's. Anything else — a kind added
 * later, or a string from a row written by hand — reads as his, because the app's uploads are his
 * and defaulting an unknown kind to "hers" would put a stranger's photo under her name.
 */
export function photoSideOf(kind: string): NinaPhotoSide {
  return kind === 'generated' ? 'hers' : 'his'
}

/** A `nina_avatars` row, structurally. `NinaAvatarRow` assigns to this. */
export interface AvatarLike {
  id: string
  blobUrl: string
  width: number | null
  height: number | null
  description: string | null
  cropScale: number | null
  cropX: number | null
  cropY: number | null
  isCurrent: boolean
  createdAt: Date
  source: string
}

/** A `nina_message_images` row, structurally. `NinaImageRow` assigns to this. */
export interface ImageLike {
  id: string
  messageId: string
  kind: string
  blobUrl: string
  createdAt: Date
}

/** What the header avatar and the detail page's hero need, and nothing more. */
export interface NinaAvatarView {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCropInput | null
  /** What the photograph shows (R25), or null. Rendered nowhere; read by the context builder. */
  description: string | null
  /** True when this is the committed constant rather than an album row. */
  isFallback: boolean
}

/** One album photo, ready for both the grid and `ViewerPhoto`. */
export interface NinaAlbumPhoto {
  id: string
  url: string
  kind: 'avatar'
  label: string
  isCurrent: boolean
  description: string | null
}

/** One conversation photo, ready for both the grid and `ViewerPhoto`. */
export interface NinaGalleryPhoto {
  id: string
  messageId: string
  url: string
  kind: string
  side: NinaPhotoSide
  label: string
}

/**
 * **D-2, and the only implementation of it.** `getCurrentNinaAvatar()` returning null means "use
 * the committed constant" — there is no seed row, so there is no row whose `blob_url` is a
 * repo-relative path, and `blob-reap`, phase 15's delete button and phase 14's re-anchor all see
 * an album containing only real blobs.
 *
 * The fallback carries `crop: null`, which `resolveCrop` folds to the identity, which
 * `ninaCropStyle` renders as plain centred `object-cover` — so the constant looks exactly as it
 * did in phase 4, and `NinaAvatar` can keep its `next/image` branch for it (Step 10).
 */
export function ninaAvatarView(row: AvatarLike | null | undefined): NinaAvatarView {
  if (row == null) {
    return {
      src: NINA_AVATAR_FALLBACK_SRC,
      natural: { width: null, height: null },
      crop: null,
      description: null,
      isFallback: true,
    }
  }
  return {
    src: row.blobUrl,
    natural: { width: row.width, height: row.height },
    crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
    description: row.description,
    isFallback: false,
  }
}

/**
 * The album, newest first, capped. `listNinaAvatars` already orders
 * `(created_at desc, id desc)`, so this preserves rather than imposes an order — re-sorting here
 * would put a second opinion about "newest" next to the index that answers it.
 *
 * An EMPTY album returns one synthetic entry for the committed constant, so the album is never a
 * blank grid on a fresh install: the runner sees the face he is looking at, and tapping it opens
 * the same viewer. Its `id` is `'fallback'`, which is not a nanoid and so cannot collide.
 */
export function albumPhotos(rows: readonly AvatarLike[]): NinaAlbumPhoto[] {
  if (rows.length === 0) {
    return [
      {
        id: 'fallback',
        url: NINA_AVATAR_FALLBACK_SRC,
        kind: 'avatar',
        label: NINA_ALBUM_LABEL,
        isCurrent: true,
        description: null,
      },
    ]
  }
  return rows.slice(0, NINA_ALBUM_MAX).map((row) => ({
    id: row.id,
    url: row.blobUrl,
    kind: 'avatar' as const,
    label: NINA_ALBUM_LABEL,
    isCurrent: row.isCurrent,
    description: row.description,
  }))
}

/**
 * Every photograph in the conversation, both parties, newest first.
 *
 * `listNinaMessageImages` orders `(created_at desc, id desc)` and reads
 * `nina_message_images_user_created_idx` with no join — which is phase 1's stated reason for the
 * table existing at all. So again: preserved, not re-sorted.
 *
 * `messageId` is carried because it is the only thing that makes a gallery photo reachable: the
 * viewer's "go to the message" affordance is Step 12's, and it needs phase 8's `?at=` idiom rather
 * than a second scroll mechanism.
 */
export function galleryPhotos(rows: readonly ImageLike[]): NinaGalleryPhoto[] {
  return rows.slice(0, NINA_GALLERY_LIMIT).map((row) => {
    const side = photoSideOf(row.kind)
    return {
      id: row.id,
      messageId: row.messageId,
      url: row.blobUrl,
      kind: row.kind,
      side,
      label: NINA_SIDE_LABEL[side],
    }
  })
}
```

**Impact:** one new pure module. Nothing imports it yet.

---

### Step 4: `lib/nina/album.test.ts`

**File:** `lib/nina/album.test.ts` (new)
**Change:** the four decisions above, asserted.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  albumPhotos,
  galleryPhotos,
  NINA_ALBUM_MAX,
  NINA_AVATAR_FALLBACK_SRC,
  NINA_GALLERY_LIMIT,
  ninaAvatarView,
  photoSideOf,
  type AvatarLike,
  type ImageLike,
} from './album'

function avatar(over: Partial<AvatarLike> = {}): AvatarLike {
  return {
    id: 'av000000000a',
    blobUrl: 'https://blob.example/nina/u1/avatar-av000000000a.jpg',
    width: 1024,
    height: 1365,
    description: 'selfie di Jalan Kemang Selatan sore-sore',
    cropScale: null,
    cropX: null,
    cropY: null,
    isCurrent: true,
    createdAt: new Date('2026-09-04T10:00:00Z'),
    source: 'generated',
    ...over,
  }
}

function image(over: Partial<ImageLike> = {}): ImageLike {
  return {
    id: 'im000000000a',
    messageId: 'ms000000000a',
    kind: 'upload',
    blobUrl: 'https://blob.example/nina/u1/chat/im000000000a.jpg',
    createdAt: new Date('2026-09-04T10:00:00Z'),
    ...over,
  }
}

describe('ninaAvatarView', () => {
  it('null means the committed constant, with no crop (D-2)', () => {
    const view = ninaAvatarView(null)
    expect(view).toEqual({
      src: NINA_AVATAR_FALLBACK_SRC,
      natural: { width: null, height: null },
      crop: null,
      description: null,
      isFallback: true,
    })
  })

  it('undefined behaves as null', () => {
    expect(ninaAvatarView(undefined).isFallback).toBe(true)
  })

  it('a row becomes its blob url, its natural size and its stored triple', () => {
    const view = ninaAvatarView(avatar({ cropScale: 1.4, cropX: -120, cropY: 60 }))
    expect(view.isFallback).toBe(false)
    expect(view.src).toBe('https://blob.example/nina/u1/avatar-av000000000a.jpg')
    expect(view.natural).toEqual({ width: 1024, height: 1365 })
    expect(view.crop).toEqual({ scale: 1.4, x: -120, y: 60 })
  })

  it('carries the description through — it is R25s only input', () => {
    expect(ninaAvatarView(avatar()).description).toBe(
      'selfie di Jalan Kemang Selatan sore-sore',
    )
  })

  it('an all-null triple is still an object, so resolveCrop folds it to the identity', () => {
    expect(ninaAvatarView(avatar()).crop).toEqual({ scale: null, x: null, y: null })
  })
})

describe('albumPhotos', () => {
  it('an empty album is one synthetic entry for the constant, never a blank grid', () => {
    const photos = albumPhotos([])
    expect(photos).toHaveLength(1)
    expect(photos[0]!.id).toBe('fallback')
    expect(photos[0]!.url).toBe(NINA_AVATAR_FALLBACK_SRC)
    expect(photos[0]!.isCurrent).toBe(true)
  })

  it('preserves the query order rather than re-sorting', () => {
    const rows = [
      avatar({ id: 'c', createdAt: new Date('2026-09-04T00:00:00Z'), isCurrent: true }),
      avatar({ id: 'b', createdAt: new Date('2026-09-03T00:00:00Z'), isCurrent: false }),
      avatar({ id: 'a', createdAt: new Date('2026-09-02T00:00:00Z'), isCurrent: false }),
    ]
    expect(albumPhotos(rows).map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })

  it('marks exactly the current row, because the grid draws a ring on it', () => {
    const rows = [avatar({ id: 'c', isCurrent: true }), avatar({ id: 'b', isCurrent: false })]
    expect(albumPhotos(rows).map((p) => p.isCurrent)).toEqual([true, false])
  })

  it('caps at NINA_ALBUM_MAX', () => {
    const rows = Array.from({ length: NINA_ALBUM_MAX + 7 }, (_, i) => avatar({ id: `a${i}` }))
    expect(albumPhotos(rows)).toHaveLength(NINA_ALBUM_MAX)
  })
})

describe('photoSideOf', () => {
  it('generated is hers', () => {
    expect(photoSideOf('generated')).toBe('hers')
  })

  it('upload is his', () => {
    expect(photoSideOf('upload')).toBe('his')
  })

  it('an unknown kind is his, never hers', () => {
    expect(photoSideOf('')).toBe('his')
    expect(photoSideOf('screenshot')).toBe('his')
  })
})

describe('galleryPhotos', () => {
  it('shows BOTH parties in one list, in query order (R17)', () => {
    const rows = [
      image({ id: 'i3', kind: 'generated' }),
      image({ id: 'i2', kind: 'upload' }),
      image({ id: 'i1', kind: 'upload' }),
    ]
    const photos = galleryPhotos(rows)
    expect(photos.map((p) => p.id)).toEqual(['i3', 'i2', 'i1'])
    expect(photos.map((p) => p.side)).toEqual(['hers', 'his', 'his'])
  })

  it('labels each side in words, so the viewer never renders the raw kind', () => {
    const [hers, his] = galleryPhotos([
      image({ id: 'i2', kind: 'generated' }),
      image({ id: 'i1', kind: 'upload' }),
    ])
    expect(hers!.label).toBe('Foto Nina')
    expect(his!.label).toBe('Foto kamu')
  })

  it('carries messageId, which is what makes a photo reachable', () => {
    expect(galleryPhotos([image({ messageId: 'ms1' })])[0]!.messageId).toBe('ms1')
  })

  it('caps at NINA_GALLERY_LIMIT', () => {
    const rows = Array.from({ length: NINA_GALLERY_LIMIT + 5 }, (_, i) => image({ id: `i${i}` }))
    expect(galleryPhotos(rows)).toHaveLength(NINA_GALLERY_LIMIT)
  })

  it('an empty conversation is an empty gallery, not a fallback', () => {
    expect(galleryPhotos([])).toEqual([])
  })
})
```

**Impact:** 21 assertions, no jsdom, no fixture file.

---

### Step 5: `lib/nina/promise.ts` — the evaluator, pure

**File:** `lib/nina/promise.ts` (new)
**Change:** the whole of R19's judgement, as functions over rows. This is the module invariant 6
exists for and the one the brief says must be tested hard.

**Code:**

```ts
import { addDays, daysBetween, type DateISO } from '@/lib/date/ranges'
import type { NinaPendingPromise, NinaPendingPromisesSlot } from '@/lib/db/schema'

/**
 * Did she keep her promise? — F33 R19, the pure half.
 *
 * ── WHY THIS IS A PURE MODULE AND NOT A METHOD ON THE SWEEP ───────────────────────────────────
 * Invariant 6, and the brief's own list of edge cases: the condition's date is Jakarta time; "besok"
 * was already resolved to a concrete day when the promise was made; a run can be COMMITTED days
 * after it happened; a deadline can pass unfulfilled; and there can be two runs on the day. Every
 * one of those is a question about strings and numbers, and `vitest` is `environment: 'node'` —
 * so all of it lives here and `promises.ts` does nothing but fetch and write.
 *
 * ── EVERY DATE IS A JAKARTA CALENDAR DAY, AS A STRING ─────────────────────────────────────────
 * `runs.occurred_on` is a Postgres `date` read in string mode (roadmap D6), `promisedOn` /
 * `byDate` / `resolvedOn` are the same, and `lib/date/ranges.ts` owns every conversion. There is
 * no `Date` in this file's logic and no `new Date()` anywhere in it — a `Date` here would put the
 * server's UTC midnight between him and credit for an evening run.
 *
 * ── WHAT THIS FILE DOES NOT DECIDE ────────────────────────────────────────────────────────────
 * It never creates a promise (phase 5), never calls a generator (Step 7), never posts a message
 * (phase 10 announces — D-3), and never edits a promise's `text`, `condition`, `metric`, `target`,
 * `targetKey`, `byDate`, `promisedOn` or `sourceMessageId`. It reads those and writes only
 * `status`, `resolvedOn`, `jobId`, `firedOn` and `attempts`.
 */

/**
 * How many times a met promise may ask for a photograph before it gives up.
 *
 * Three, with a one-Jakarta-day cooldown between attempts, so a promise that keeps hitting phase
 * 12's cap or a dead GitHub Actions runner is done inside four days rather than dispatching a job
 * every five minutes forever. Under RU-20 an attempt costs a `workflow_dispatch` and one of six
 * daily generations, which is exactly the resource a runaway retry would burn.
 */
export const PROMISE_MAX_ATTEMPTS = 3

/**
 * How long after a deadline a run may still arrive and count.
 *
 * **This exists because of `reviewed_at` (invariant 9).** A run only becomes visible to
 * `getRunsBetween` once the runner has reviewed its extraction, and he reviews on his own schedule
 * — the analysis records screenshots sitting unreviewed for a day or more. Expiring at midnight on
 * the deadline would mean a 10 km he really ran on the 4th, uploaded on the 5th and reviewed on the
 * 6th, silently failing a promise he kept. Two days is generous enough to cover that and short
 * enough that she is not still watching for a promise he has forgotten making.
 */
export const PROMISE_EXPIRY_GRACE_DAYS = 2

/**
 * How long an open-ended promise (`byDate: null`) waits before it expires.
 *
 * Sixty days, because an open-ended promise is a standing intention — *"kalau lo pecahin PR 10k,
 * gw ganti foto"* — and a two-month-old one she is still tracking is a friend who keeps score.
 */
export const PROMISE_OPEN_ENDED_TTL_DAYS = 60

/** One reviewed run, reduced to what a condition can be about. */
export interface PromiseRunFact {
  /** Jakarta calendar day, `'YYYY-MM-DD'`. */
  occurredOn: DateISO
  /** `runs.distance_m`. Metres, as stored — the conversion to km happens once, below. */
  distanceM: number
}

/** A record or badge he holds, and the day he took it. */
export interface PromiseEarnedMarker {
  key: string
  earnedOn: DateISO
}

/**
 * Everything reality has to say. Loaded by `promises.ts`; assembled from `getRunsBetween`,
 * `StoredRecord` and `StoredBadge`, none of which this file imports.
 */
export interface PromiseFacts {
  /** Reviewed runs covering the union of every open promise's window. Order irrelevant. */
  runs: readonly PromiseRunFact[]
  records: readonly PromiseEarnedMarker[]
  badges: readonly PromiseEarnedMarker[]
}

export interface PromiseEvalInput {
  todayISO: DateISO
  facts: PromiseFacts
  /**
   * **The landing test (Stage B).** True when a `nina_avatars` row with `source = 'generated'` was
   * created on or after `dayISO`. Injected as a predicate rather than as a row so this module
   * stays free of the schema and so the test can pin it.
   *
   * Its one tolerance is stated in the plan: a *different* generated avatar landing the same day
   * settles this promise. The cost is a mis-attributed true event, not a false one.
   */
  avatarLandedOnOrAfter: (dayISO: DateISO) => boolean
}

/**
 * What to do with one promise. Five kinds, and only three of them write anything:
 *
 *   - `wait`    nothing at all. The common case, and the only one with no write.
 *   - `fire`    the condition is MET and no job is in flight: ask for a photograph.
 *   - `settle`  a job was fired and the photograph has landed: `status: 'met'`.
 *   - `retry`   a job was fired on an earlier day and nothing landed: clear `jobId` so a later
 *               sweep may fire again, if `attempts` allows.
 *   - `expire`  `status: 'expired'`. The deadline plus grace has passed unfulfilled, or the
 *               attempt ceiling is reached, or an open-ended promise has aged out.
 */
export type PromiseVerdictKind = 'wait' | 'fire' | 'settle' | 'retry' | 'expire'

export interface PromiseVerdict {
  id: string
  kind: PromiseVerdictKind
  /** For the log and for the test's failure message. Never shown to anyone. */
  reason: string
}

/** A verdict plus, for an accepted `fire`, the job the generator handed back. */
export interface PromiseDecision {
  verdict: PromiseVerdict
  /** The accepted job's id, or null when the generator refused. Ignored for every other kind. */
  jobId?: string | null
}

export interface PromiseSlotResolution {
  /** The WHOLE slot, to be written back through `saveMemorySlot`. No entry is ever removed. */
  slot: NinaPendingPromisesSlot
  /** False when nothing changed, so the sweep can skip the write entirely. */
  changed: boolean
}

/** `attempts` is optional on the entry; absent means zero. */
function attemptsOf(promise: NinaPendingPromise): number {
  const raw = (promise as { attempts?: number }).attempts
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}

function jobIdOf(promise: NinaPendingPromise): string | null {
  const raw = (promise as { jobId?: string | null }).jobId
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

function firedOnOf(promise: NinaPendingPromise): DateISO | null {
  const raw = (promise as { firedOn?: string | null }).firedOn
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/**
 * The half-open day range a condition may be satisfied in, or null when the promise names no
 * window at all (which only `metric: 'free'` with `byDate: null` does).
 *
 * ── WHY `promisedOn` IS INCLUDED AND NOT EXCLUDED ─────────────────────────────────────────────
 * A run on the day of the promise counts. `occurred_on` is a calendar day and `started_at` is a
 * nullable `time`, so there is no reliable way to ask whether that run happened before or after
 * she spoke — and the far more common case is that the run under discussion IS the run she is
 * promising about (*"gw mau lari 10k hari ini na" / "kalo beneran, gw ganti foto"*). Refusing
 * credit for it would make her pedantic about the one run the conversation was about.
 *
 * ── WHY `byDate` IS A DEADLINE AND NOT AN EXACT DAY ───────────────────────────────────────────
 * Phase 1's field comment says *"Deadline, or NULL for open-ended"*, so that is what it is: the
 * window runs from `promisedOn` through `byDate` inclusive, which is why the exclusive end is
 * `byDate + 1`. "Besok" was already resolved to a concrete date when the promise was made (phase
 * 5), so an early finish satisfies it and there is nothing here that re-parses Indonesian.
 */
export function promiseWindow(
  promise: NinaPendingPromise,
  todayISO: DateISO,
): { startISO: DateISO; endExclusiveISO: DateISO } {
  const startISO = promise.promisedOn
  const lastISO = promise.byDate ?? todayISO
  /* A deadline before the promise was made is nonsense the distiller could still emit; treat the
   * window as the single promise day rather than as an empty or inverted range. */
  const endBase = lastISO < startISO ? startISO : lastISO
  return { startISO, endExclusiveISO: addDays(endBase, 1) }
}

function inWindow(dayISO: DateISO, window: { startISO: DateISO; endExclusiveISO: DateISO }): boolean {
  return dayISO >= window.startISO && dayISO < window.endExclusiveISO
}

/**
 * Is the condition satisfied by what actually happened?
 *
 * ── TWO RUNS IN A DAY: `distance_km_total` SUMS, DELIBERATELY ─────────────────────────────────
 * Phase 3 hit the same question. The metric is named `distance_km_total`, and total is what it
 * means: a 12 km day made of a 7 km morning and a 5 km evening satisfies "kalo lo lari 10km". A
 * per-run threshold is a different metric and it would be phase 5's to coin, because phase 5 is
 * what decides which metric a sentence becomes. Being generous about HOW he got there is also
 * simply more in character than a friend auditing his split.
 *
 * ── `free` IS NEVER MET HERE ──────────────────────────────────────────────────────────────────
 * Phase 5's handoff is explicit: *"`metric: 'free'` promises cannot be decided by any field. Leave
 * them `'pending'`; she may ask him. That is what the escape hatch is for, and it is not a bug to
 * route into."* So `free` returns false and `evaluatePromise` never fires it. It can still
 * `expire`, but only on the calendar's authority — see the note there.
 */
export function conditionMet(
  promise: NinaPendingPromise,
  input: PromiseEvalInput,
): boolean {
  const window = promiseWindow(promise, input.todayISO)
  const runs = input.facts.runs.filter((run) => inWindow(run.occurredOn, window))

  switch (promise.metric) {
    case 'distance_km_total': {
      if (promise.target == null || !(promise.target > 0)) return false
      const km = runs.reduce((sum, run) => sum + run.distanceM, 0) / 1000
      /* A hair of tolerance: a 10.00 km promise met by a 9.9996 km GPS trace is met, and refusing
       * it over the fourth decimal of a distance he read off a watch is not a judgement anyone
       * would defend out loud. One metre. */
      return km + 0.001 >= promise.target
    }
    case 'run_count': {
      if (promise.target == null || !(promise.target > 0)) return false
      return runs.length >= promise.target
    }
    case 'record': {
      if (promise.targetKey == null) return false
      return input.facts.records.some(
        (marker) => marker.key === promise.targetKey && inWindow(marker.earnedOn, window),
      )
    }
    case 'badge': {
      if (promise.targetKey == null) return false
      return input.facts.badges.some(
        (marker) => marker.key === promise.targetKey && inWindow(marker.earnedOn, window),
      )
    }
    case 'free':
      return false
    default:
      /* An unknown metric from a hand-edited slot (phase 16) is not met, and is not an exception:
       * a thrown error here would stop the whole sweep over one bad row. */
      return false
  }
}

/**
 * Has the calendar run out on this promise?
 *
 * `byDate` plus `PROMISE_EXPIRY_GRACE_DAYS`, or `promisedOn` plus `PROMISE_OPEN_ENDED_TTL_DAYS`
 * when there is no deadline. **Applies to `free` too**, and that is not a contradiction of phase
 * 5's rule: phase 5 forbids DECIDING a free promise from a field, and a deadline that has passed
 * is not a field about the condition, it is the calendar. A free promise with no deadline never
 * expires here, which is phase 5's instruction taken literally and is bounded anyway by its
 * `MAX_PENDING_PROMISES` cap dropping resolved entries first.
 */
function deadlinePassed(promise: NinaPendingPromise, todayISO: DateISO): boolean {
  if (promise.byDate != null) {
    return todayISO > addDays(promise.byDate, PROMISE_EXPIRY_GRACE_DAYS)
  }
  if (promise.metric === 'free') return false
  return daysBetween(promise.promisedOn, todayISO) > PROMISE_OPEN_ENDED_TTL_DAYS
}

/**
 * One promise, one verdict. The order of the branches IS the state machine, and it is the reason
 * a failed generation can never consume a promise: `settle` is reachable only through
 * `avatarLandedOnOrAfter`, and nothing else in this function writes `status: 'met'`.
 */
export function evaluatePromise(
  promise: NinaPendingPromise,
  input: PromiseEvalInput,
): PromiseVerdict {
  const id = promise.id
  const { todayISO } = input

  /* Already resolved. Phase 5's cap ages it out; we never touch it again and never remove it. */
  if (promise.status !== 'pending') {
    return { id, kind: 'wait', reason: `already ${promise.status}` }
  }

  const jobId = jobIdOf(promise)
  const firedOn = firedOnOf(promise)
  const attempts = attemptsOf(promise)

  /* ── STAGE B: a job is on record ─────────────────────────────────────────────────────────── */
  if (jobId != null) {
    /* The photograph landed. This is the ONLY path to 'met'. */
    if (input.avatarLandedOnOrAfter(firedOn ?? promise.promisedOn)) {
      return { id, kind: 'settle', reason: `avatar landed for job ${jobId}` }
    }
    /* Still the same Jakarta day: a GitHub Actions runner takes minutes (RU-20), so waiting is
     * the correct answer and re-firing would be the bug. */
    if (firedOn == null || firedOn >= todayISO) {
      return { id, kind: 'wait', reason: `job ${jobId} in flight` }
    }
    /* A day has passed with nothing to show. Out of attempts, this is over. */
    if (attempts >= PROMISE_MAX_ATTEMPTS) {
      return { id, kind: 'expire', reason: `${attempts} attempts, no avatar` }
    }
    return { id, kind: 'retry', reason: `job ${jobId} produced nothing on ${firedOn}` }
  }

  /* ── STAGE A: nothing fired yet ──────────────────────────────────────────────────────────── */
  if (conditionMet(promise, input)) {
    if (attempts >= PROMISE_MAX_ATTEMPTS) {
      return { id, kind: 'expire', reason: `condition met but ${attempts} attempts spent` }
    }
    /* One attempt per Jakarta day, whether the last one was accepted or refused. This is the whole
     * of the cooldown: without it a five-minute cron would dispatch 288 jobs against a transport
     * error, and phase 12's cap of six a day is the resource that would pay for it. */
    if (firedOn != null && firedOn >= todayISO) {
      return { id, kind: 'wait', reason: `already attempted today (${attempts})` }
    }
    return { id, kind: 'fire', reason: 'condition met' }
  }

  /* Not met. The only remaining question is whether it still can be. */
  if (deadlinePassed(promise, todayISO)) {
    return { id, kind: 'expire', reason: 'deadline passed unfulfilled' }
  }
  return { id, kind: 'wait', reason: 'not met yet' }
}

/** Every promise, in slot order. */
export function evaluatePromises(
  promises: readonly NinaPendingPromise[],
  input: PromiseEvalInput,
): PromiseVerdict[] {
  return promises.map((promise) => evaluatePromise(promise, input))
}

/**
 * The slot, rewritten in place.
 *
 * ── PHASE 5'S FOUR RULES, HONOURED HERE AND NOWHERE ELSE ──────────────────────────────────────
 * *"set `status` and `resolvedOn` IN PLACE and write the whole slot back … Do not remove the
 * entry … carry the row's existing `source` through … `metric: 'free'` stays pending."* This
 * function never filters, never reorders and never touches an entry with no decision. `source`
 * lives on the ROW, not on the entry, so carrying it through is `promises.ts`'s job (Step 7) and
 * it is done there by reading it back out of `getNinaMemorySlot`.
 *
 * `changed` exists so the common sweep — every promise `wait` — performs no write at all. An
 * unconditional upsert would bump `updated_at` on `pending_promises` every five minutes, and phase
 * 2 renders `updatedAt` into her context, so she would see her promise list "change" constantly.
 */
export function resolvePromiseSlot(
  slot: NinaPendingPromisesSlot | null | undefined,
  decisions: readonly PromiseDecision[],
  todayISO: DateISO,
): PromiseSlotResolution {
  const current = slot?.promises ?? []
  const byId = new Map(decisions.map((d) => [d.verdict.id, d]))
  let changed = false

  const promises = current.map((promise) => {
    const decision = byId.get(promise.id)
    if (decision == null) return promise

    switch (decision.verdict.kind) {
      case 'wait':
        return promise
      case 'settle':
        changed = true
        return { ...promise, status: 'met' as const, resolvedOn: todayISO }
      case 'expire':
        changed = true
        return { ...promise, status: 'expired' as const, resolvedOn: todayISO }
      case 'fire':
        changed = true
        return {
          ...promise,
          jobId: decision.jobId ?? null,
          firedOn: todayISO,
          attempts: attemptsOf(promise) + 1,
        }
      case 'retry':
        changed = true
        /* `firedOn` is deliberately LEFT ALONE. Clearing the job is what lets a later sweep fire;
         * keeping the day is what stops that sweep being the very next one. */
        return { ...promise, jobId: null }
      default:
        return promise
    }
  })

  return { slot: { promises }, changed }
}
```

**Impact:** one new pure module, no I/O, no `server-only`, no schema write. Nothing imports it yet.

---

### Step 6: `lib/nina/promise.test.ts` — the edge cases the brief names, one by one

**File:** `lib/nina/promise.test.ts` (new)
**Change:** twenty-four cases. The brief's list is the spine: the condition's date is Jakarta time,
"besok" was already a concrete date, a run committed late, a deadline that passed unfulfilled, and
two runs in one day. The three that are not on that list — a failed generation, an accepted job
that never lands, and a hand-edited slot — are the ones RU-20 added.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import type { NinaPendingPromise, NinaPendingPromisesSlot } from '@/lib/db/schema'
import {
  conditionMet,
  evaluatePromise,
  evaluatePromises,
  promiseWindow,
  PROMISE_EXPIRY_GRACE_DAYS,
  PROMISE_MAX_ATTEMPTS,
  PROMISE_OPEN_ENDED_TTL_DAYS,
  resolvePromiseSlot,
  type PromiseEvalInput,
  type PromiseFacts,
} from './promise'

/** The user's own example, verbatim from R19: promised on 3 Sep, due 4 Sep, 10 km. */
function promise(over: Partial<NinaPendingPromise> = {}): NinaPendingPromise {
  return {
    id: 'pr0000000001',
    text: 'oke, kalo lo beneran lari 10k besok gw ganti foto profil',
    condition: 'kalau lo lari 10km besok',
    metric: 'distance_km_total',
    target: 10,
    targetKey: null,
    byDate: '2026-09-04',
    promisedOn: '2026-09-03',
    sourceMessageId: 'ms0000000001',
    status: 'pending',
    resolvedOn: null,
    ...over,
  }
}

const NO_FACTS: PromiseFacts = { runs: [], records: [], badges: [] }

function input(over: Partial<PromiseEvalInput> = {}): PromiseEvalInput {
  return {
    todayISO: '2026-09-04',
    facts: NO_FACTS,
    avatarLandedOnOrAfter: () => false,
    ...over,
  }
}

function runs(...specs: Array<[string, number]>): PromiseFacts {
  return {
    runs: specs.map(([occurredOn, distanceM]) => ({ occurredOn, distanceM })),
    records: [],
    badges: [],
  }
}

describe('promiseWindow', () => {
  it('runs from the promise day through the deadline, inclusive', () => {
    expect(promiseWindow(promise(), '2026-09-04')).toEqual({
      startISO: '2026-09-03',
      endExclusiveISO: '2026-09-05',
    })
  })

  it('an open-ended promise ends today, so it grows as the days pass', () => {
    expect(promiseWindow(promise({ byDate: null }), '2026-09-20')).toEqual({
      startISO: '2026-09-03',
      endExclusiveISO: '2026-09-21',
    })
  })

  it('a deadline BEFORE the promise day collapses to the promise day, never inverts', () => {
    expect(promiseWindow(promise({ byDate: '2026-09-01' }), '2026-09-04')).toEqual({
      startISO: '2026-09-03',
      endExclusiveISO: '2026-09-04',
    })
  })
})

describe('conditionMet — distance', () => {
  it('R19s own case: 10 km on 4 Sep meets it', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-04', 10_100]) }))).toBe(true)
  })

  it('9.5 km on 4 Sep does not', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-04', 9_500]) }))).toBe(false)
  })

  it('TWO RUNS IN A DAY SUM — 7 km plus 5 km meets a 10 km promise', () => {
    const facts = runs(['2026-09-04', 7_000], ['2026-09-04', 5_000])
    expect(conditionMet(promise(), input({ facts }))).toBe(true)
  })

  it('a run on the promise day itself counts — it is usually the run she meant', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-03', 10_200]) }))).toBe(true)
  })

  it('a run BEFORE the promise does not count', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-02', 21_000]) }))).toBe(false)
  })

  it('a run AFTER the deadline does not count', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-05', 21_000]) }))).toBe(false)
  })

  it('a GPS trace one metre short still counts', () => {
    expect(conditionMet(promise(), input({ facts: runs(['2026-09-04', 9_999.5]) }))).toBe(true)
  })

  it('a null target is never met, however far he ran', () => {
    const p = promise({ target: null })
    expect(conditionMet(p, input({ facts: runs(['2026-09-04', 42_195]) }))).toBe(false)
  })
})

describe('conditionMet — the other metrics', () => {
  it('run_count counts runs in the window', () => {
    const p = promise({ metric: 'run_count', target: 3, byDate: '2026-09-09' })
    const facts = runs(['2026-09-04', 5_000], ['2026-09-06', 5_000], ['2026-09-08', 5_000])
    expect(conditionMet(p, input({ todayISO: '2026-09-09', facts }))).toBe(true)
  })

  it('record is met by a marker with that key earned inside the window', () => {
    const p = promise({ metric: 'record', target: null, targetKey: 'longest_distance' })
    const facts: PromiseFacts = {
      runs: [],
      records: [{ key: 'longest_distance', earnedOn: '2026-09-04' }],
      badges: [],
    }
    expect(conditionMet(p, input({ facts }))).toBe(true)
  })

  it('a record earned before the promise does not count — he already had it', () => {
    const p = promise({ metric: 'record', target: null, targetKey: 'longest_distance' })
    const facts: PromiseFacts = {
      runs: [],
      records: [{ key: 'longest_distance', earnedOn: '2026-08-30' }],
      badges: [],
    }
    expect(conditionMet(p, input({ facts }))).toBe(false)
  })

  it('badge works the same way, against the badge markers', () => {
    const p = promise({ metric: 'badge', target: null, targetKey: 'early_bird' })
    const facts: PromiseFacts = {
      runs: [],
      records: [],
      badges: [{ key: 'early_bird', earnedOn: '2026-09-04' }],
    }
    expect(conditionMet(p, input({ facts }))).toBe(true)
  })

  it('free is NEVER met — phase 5s escape hatch stays an escape hatch', () => {
    const p = promise({ metric: 'free', target: null })
    expect(conditionMet(p, input({ facts: runs(['2026-09-04', 42_195]) }))).toBe(false)
  })

  it('an unknown metric is not met and does not throw', () => {
    const p = promise({ metric: 'phase_16_typo' as NinaPendingPromise['metric'] })
    expect(() => conditionMet(p, input({ facts: runs(['2026-09-04', 42_195]) }))).not.toThrow()
    expect(conditionMet(p, input({ facts: runs(['2026-09-04', 42_195]) }))).toBe(false)
  })
})

describe('evaluatePromise — stage A', () => {
  it('not met and the deadline is still ahead: wait', () => {
    const v = evaluatePromise(promise(), input({ todayISO: '2026-09-04' }))
    expect(v.kind).toBe('wait')
  })

  it('met: fire', () => {
    const v = evaluatePromise(promise(), input({ facts: runs(['2026-09-04', 10_500]) }))
    expect(v.kind).toBe('fire')
  })

  it('A RUN COMMITTED LATE still fires, inside the grace window', () => {
    /* He ran on the 4th; he reviewed the extraction on the 6th, so the row only became visible
     * to `getRunsBetween` then. `reviewed_at` is invariant 9 and this is its consequence. */
    const late = '2026-09-06'
    expect(late <= addDaysLocal('2026-09-04', PROMISE_EXPIRY_GRACE_DAYS)).toBe(true)
    const v = evaluatePromise(
      promise(),
      input({ todayISO: late, facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('fire')
  })

  it('A DEADLINE THAT PASSED UNFULFILLED expires, once the grace is over', () => {
    const v = evaluatePromise(promise(), input({ todayISO: '2026-09-07' }))
    expect(v.kind).toBe('expire')
    expect(v.reason).toContain('deadline')
  })

  it('the grace day itself is not yet expiry', () => {
    const v = evaluatePromise(promise(), input({ todayISO: '2026-09-06' }))
    expect(v.kind).toBe('wait')
  })

  it('an open-ended promise expires only after the TTL', () => {
    const p = promise({ byDate: null })
    const inside = evaluatePromise(p, input({ todayISO: '2026-10-30' }))
    expect(inside.kind).toBe('wait')
    const outside = evaluatePromise(p, input({ todayISO: '2027-01-01' }))
    expect(outside.kind).toBe('expire')
    expect(PROMISE_OPEN_ENDED_TTL_DAYS).toBe(60)
  })

  it('an open-ended FREE promise never expires — phase 5s instruction, taken literally', () => {
    const p = promise({ metric: 'free', target: null, byDate: null })
    expect(evaluatePromise(p, input({ todayISO: '2030-01-01' })).kind).toBe('wait')
  })

  it('a free promise WITH a deadline does expire, on the calendars authority', () => {
    const p = promise({ metric: 'free', target: null })
    expect(evaluatePromise(p, input({ todayISO: '2026-09-07' })).kind).toBe('expire')
  })

  it('one attempt per Jakarta day, even when the last one was refused', () => {
    const p = promise({ ...({ firedOn: '2026-09-04', attempts: 1 } as object) })
    const v = evaluatePromise(p, input({ facts: runs(['2026-09-04', 10_500]) }))
    expect(v.kind).toBe('wait')
    expect(v.reason).toContain('attempted today')
  })

  it('a new day allows the next attempt', () => {
    const p = promise({ ...({ firedOn: '2026-09-04', attempts: 1 } as object) })
    const v = evaluatePromise(
      p,
      input({ todayISO: '2026-09-05', facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('fire')
  })

  it('the attempt ceiling expires it rather than firing forever', () => {
    const p = promise({
      ...({ firedOn: '2026-09-04', attempts: PROMISE_MAX_ATTEMPTS } as object),
    })
    const v = evaluatePromise(
      p,
      input({ todayISO: '2026-09-05', facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('expire')
  })
})

describe('evaluatePromise — stage B, the RU-20 cases', () => {
  const fired = promise({ ...({ jobId: 'jb0000000001', firedOn: '2026-09-04', attempts: 1 } as object) })

  it('a job in flight on the same day waits — a runner takes minutes', () => {
    const v = evaluatePromise(fired, input({ facts: runs(['2026-09-04', 10_500]) }))
    expect(v.kind).toBe('wait')
    expect(v.reason).toContain('in flight')
  })

  it('THE AVATAR LANDED: settle. This is the only path to met', () => {
    const v = evaluatePromise(
      fired,
      input({
        todayISO: '2026-09-04',
        facts: runs(['2026-09-04', 10_500]),
        avatarLandedOnOrAfter: (day) => day === '2026-09-04',
      }),
    )
    expect(v.kind).toBe('settle')
  })

  it('A GENERATION THAT NEVER COMPLETES is retried, not consumed', () => {
    const v = evaluatePromise(
      fired,
      input({ todayISO: '2026-09-05', facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('retry')
  })

  it('and at the ceiling it expires rather than haunting the slot', () => {
    const spent = promise({
      ...({ jobId: 'jb0000000001', firedOn: '2026-09-04', attempts: PROMISE_MAX_ATTEMPTS } as object),
    })
    const v = evaluatePromise(
      spent,
      input({ todayISO: '2026-09-05', facts: runs(['2026-09-04', 10_500]) }),
    )
    expect(v.kind).toBe('expire')
  })

  it('an already-resolved promise is never re-examined', () => {
    const met = promise({ status: 'met', resolvedOn: '2026-09-04' })
    expect(evaluatePromise(met, input({ todayISO: '2026-12-01' })).kind).toBe('wait')
    const expired = promise({ status: 'expired', resolvedOn: '2026-09-07' })
    expect(evaluatePromise(expired, input({ todayISO: '2026-12-01' })).kind).toBe('wait')
  })
})

describe('resolvePromiseSlot', () => {
  const slot: NinaPendingPromisesSlot = {
    promises: [promise({ id: 'a' }), promise({ id: 'b' }), promise({ id: 'c' })],
  }

  it('every verdict wait means no write at all', () => {
    const decisions = evaluatePromises(slot.promises, input()).map((verdict) => ({ verdict }))
    const out = resolvePromiseSlot(slot, decisions, '2026-09-04')
    expect(out.changed).toBe(false)
    expect(out.slot.promises).toHaveLength(3)
  })

  it('NEVER REMOVES AN ENTRY, whatever happened to it', () => {
    const out = resolvePromiseSlot(
      slot,
      [
        { verdict: { id: 'a', kind: 'settle', reason: '' } },
        { verdict: { id: 'b', kind: 'expire', reason: '' } },
      ],
      '2026-09-04',
    )
    expect(out.slot.promises.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('settle writes met and resolvedOn, in place', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'settle', reason: '' } }],
      '2026-09-04',
    )
    const a = out.slot.promises.find((p) => p.id === 'a')!
    expect(a.status).toBe('met')
    expect(a.resolvedOn).toBe('2026-09-04')
    /* Everything phase 5 owns is byte-identical. */
    expect(a.text).toBe(slot.promises[0]!.text)
    expect(a.condition).toBe(slot.promises[0]!.condition)
    expect(a.metric).toBe(slot.promises[0]!.metric)
    expect(a.byDate).toBe(slot.promises[0]!.byDate)
    expect(a.promisedOn).toBe(slot.promises[0]!.promisedOn)
    expect(a.sourceMessageId).toBe(slot.promises[0]!.sourceMessageId)
  })

  it('fire records the job and the attempt but NOT the status', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, jobId: 'jb1' }],
      '2026-09-04',
    )
    const a = out.slot.promises.find((p) => p.id === 'a')! as NinaPendingPromise & {
      jobId?: string | null
      firedOn?: string | null
      attempts?: number
    }
    expect(a.status).toBe('pending')
    expect(a.resolvedOn).toBeNull()
    expect(a.jobId).toBe('jb1')
    expect(a.firedOn).toBe('2026-09-04')
    expect(a.attempts).toBe(1)
  })

  it('A REFUSED GENERATION CONSUMES NOTHING: no status, no job, only the cooldown', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, jobId: null }],
      '2026-09-04',
    )
    const a = out.slot.promises.find((p) => p.id === 'a')! as NinaPendingPromise & {
      jobId?: string | null
      attempts?: number
    }
    expect(a.status).toBe('pending')
    expect(a.jobId).toBeNull()
    expect(a.attempts).toBe(1)
  })

  it('retry clears the job and KEEPS firedOn, so the next sweep is not the very next one', () => {
    const pending: NinaPendingPromisesSlot = {
      promises: [promise({ id: 'a', ...({ jobId: 'jb1', firedOn: '2026-09-04', attempts: 1 } as object) })],
    }
    const out = resolvePromiseSlot(
      pending,
      [{ verdict: { id: 'a', kind: 'retry', reason: '' } }],
      '2026-09-05',
    )
    const a = out.slot.promises[0]! as NinaPendingPromise & {
      jobId?: string | null
      firedOn?: string | null
    }
    expect(a.jobId).toBeNull()
    expect(a.firedOn).toBe('2026-09-04')
    expect(a.status).toBe('pending')
  })

  it('a null slot resolves to an empty slot rather than throwing', () => {
    expect(resolvePromiseSlot(null, [], '2026-09-04')).toEqual({
      slot: { promises: [] },
      changed: false,
    })
  })
})

/** Local, so the late-commit case asserts its own arithmetic instead of trusting the constant. */
function addDaysLocal(dayISO: string, delta: number): string {
  const [y, m, d] = dayISO.split('-').map(Number) as [number, number, number]
  const t = Date.UTC(y, m - 1, d) + delta * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}
```

**Impact:** the evaluator is proved before anything calls it. No jsdom, no database, no clock.

---

### Step 7: `lib/nina/promises.ts` — the sweep, and the only place a generator is called

**File:** `lib/nina/promises.ts` (new)
**Change:** fetch, evaluate, dispatch, write once. No arithmetic — `lib/nina/gateway.ts`'s rule
applied to a second module.

**Code:**

```ts
import 'server-only'

import { addDays, jakartaDayOf, todayInJakarta, type DateISO } from '@/lib/date/ranges'
import { getBadgeAwards, getRecords, getRunsBetween } from '@/lib/db/queries'
import {
  NINA_SLOT_PENDING_PROMISES,
  type NinaMemorySource,
  type NinaPendingPromise,
  type NinaPendingPromisesSlot,
} from '@/lib/db/schema'
import { generateNinaAvatar } from './avatargen'
import {
  evaluatePromises,
  resolvePromiseSlot,
  type PromiseDecision,
  type PromiseEarnedMarker,
  type PromiseFacts,
  type PromiseVerdict,
} from './promise'
import { getCurrentNinaAvatar, getNinaMemorySlot, upsertNinaMemorySlot } from './queries'

/**
 * The promise sweep — F33 R19, the impure half.
 *
 * ── WHY THIS IS NOT IN A RENDER PATH, AND CANNOT BE ───────────────────────────────────────────
 * It calls a generator, which is a model call, which invariant 4 forbids anywhere a page renders.
 * Its one caller is phase 10's cron route (`app/api/cron/nina/route.ts`), which already runs
 * per-user on a schedule and already owns "notice something and make her speak". `/nina/about`
 * renders the album; it never evaluates a promise.
 *
 * ── WHY THE CRON AND NOT A POST-TURN HOOK ─────────────────────────────────────────────────────
 * A promise's deadline passes whether or not he opens the app, and the run that satisfies it is
 * committed on `/upload`, not on `/nina`. A post-turn hook would only ever notice a kept promise
 * during a conversation, which is the one moment she is least likely to be told about the run.
 * Phase 5 already owns the post-turn `after()`; adding a second consumer there would also make the
 * distillation and the sweep race for the same slot.
 *
 * ── WHY IT NEVER POSTS A MESSAGE ──────────────────────────────────────────────────────────────
 * D-3. `insertNinaAvatarAsCurrent` (called inside `generateNinaAvatar`) leaves `announced_at`
 * NULL, and that NULL is phase 10's `avatar_changed` trigger. One announcer, reached identically
 * by the promise path, the admin path and phase 14's CLI. So this module writes to exactly one
 * place: the `pending_promises` slot.
 *
 * ── WHY `source` IS READ BACK OUT AND WRITTEN BACK IN ─────────────────────────────────────────
 * Phase 5's handoff, verbatim: *"carry the row's existing `source` through, exactly as this
 * phase's merge does. If it says `'admin'`, write `'admin'` back … relabelling a human's row as
 * distilled is the one way to lose the R24 guarantee from your side."* `getNinaMemorySlot` returns
 * it, so it costs nothing, and `upsertNinaMemorySlot` takes it.
 */

/**
 * How long the sweep may spend. Under RU-20 a `fire` is a `workflow_dispatch` and returns in
 * hundreds of milliseconds, not the 78 s the generation itself takes, so twelve open promises
 * still fit comfortably inside phase 10's route budget of 60 s.
 */
export const NINA_PROMISE_SWEEP_BUDGET_MS = 20_000

/** Injected so the whole sweep is drivable from a test with no database and no network. */
export interface NinaPromiseDeps {
  readSlot: (
    userId: string,
  ) => Promise<{ value: unknown; source: NinaMemorySource } | null>
  writeSlot: (
    userId: string,
    input: { key: string; value: NinaPendingPromisesSlot; source: NinaMemorySource },
  ) => Promise<void>
  readRuns: (userId: string, startISO: DateISO, endExclusiveISO: DateISO) => Promise<
    ReadonlyArray<{ occurredOn: string; distanceM: number }>
  >
  readRecordMarkers: (userId: string) => Promise<PromiseEarnedMarker[]>
  readBadgeMarkers: (userId: string) => Promise<PromiseEarnedMarker[]>
  /** The current avatar, for the landing test. Null when there is none (D-2). */
  readCurrentAvatar: (
    userId: string,
  ) => Promise<{ source: string; createdAt: Date } | null>
  /**
   * The generator port. **Only `ok` and `jobId` are read**, deliberately: phase 12 is being
   * rewritten around GitHub Actions (RU-20) and this is the narrowest surface that survives it.
   * If its result gains or loses an `avatar` field, nothing here changes.
   */
  generateAvatar: (input: {
    userId: string
    scene: string
  }) => Promise<{ ok: boolean; jobId?: string | null }>
  now: () => Date
}

export interface NinaPromiseSweep {
  /** Every verdict, for the log. */
  verdicts: PromiseVerdict[]
  /** How many generations were dispatched. */
  fired: number
  /** How many promises reached `met`. */
  settled: number
  /** How many reached `expired`. */
  expired: number
  /** Whether the slot was written. False on the common no-op sweep. */
  wrote: boolean
}

export function productionPromiseDeps(): NinaPromiseDeps {
  return {
    readSlot: (userId) => getNinaMemorySlot(userId, NINA_SLOT_PENDING_PROMISES),
    writeSlot: (userId, input) => upsertNinaMemorySlot(userId, input),
    readRuns: (userId, startISO, endExclusiveISO) =>
      getRunsBetween(userId, startISO, endExclusiveISO),
    /* `records.achieved_on` is the day of the RUN that holds the key, which is exactly what a
     * promise about breaking a record is about. `getRecords` is the reviewed-gated read
     * (invariant 9); this phase writes no SQL. */
    readRecordMarkers: async (userId) =>
      (await getRecords(userId)).map((row) => ({ key: row.key, earnedOn: row.achievedOn })),
    /* Raw award rows, not `foldAwards`: a folded `StoredBadge` reports only the LATEST earn day,
     * and a promise about a badge he has earned before needs the award that lands INSIDE the
     * window. One row per award is what `badges` stores and what this needs. */
    readBadgeMarkers: async (userId) =>
      (await getBadgeAwards(userId)).map((row) => ({ key: row.key, earnedOn: row.earnedOn })),
    readCurrentAvatar: (userId) => getCurrentNinaAvatar(userId),
    generateAvatar: async ({ userId, scene }) => {
      const result = await generateNinaAvatar({ userId, scene, source: 'generated' })
      return {
        ok: result.ok,
        jobId: (result as { jobId?: string | null }).jobId ?? null,
      }
    },
    now: () => new Date(),
  }
}

/** A slot value that is not the shape we expect is an empty slot, never an exception. */
function parseSlot(value: unknown): NinaPendingPromisesSlot {
  if (value == null || typeof value !== 'object') return { promises: [] }
  const promises = (value as { promises?: unknown }).promises
  if (!Array.isArray(promises)) return { promises: [] }
  return { promises: promises.filter((p): p is NinaPendingPromise => p != null && typeof p === 'object') }
}

/**
 * One read per fact family, over the UNION of every open promise's window.
 *
 * A per-promise query would be up to twelve round trips for twelve promises; the union is one
 * indexed range scan on `(user_id, occurred_on)`. `conditionMet` re-filters per promise, so
 * over-fetching is free and under-fetching is the only failure mode there is.
 */
export async function loadPromiseFacts(
  userId: string,
  promises: readonly NinaPendingPromise[],
  todayISO: DateISO,
  deps: NinaPromiseDeps,
): Promise<PromiseFacts> {
  const open = promises.filter((promise) => promise.status === 'pending')
  if (open.length === 0) return { runs: [], records: [], badges: [] }

  let startISO = todayISO
  let lastISO = todayISO
  for (const promise of open) {
    if (promise.promisedOn < startISO) startISO = promise.promisedOn
    const end = promise.byDate ?? todayISO
    if (end > lastISO) lastISO = end
  }

  const [runs, records, badges] = await Promise.all([
    deps.readRuns(userId, startISO, addDays(lastISO, 1)),
    deps.readRecordMarkers(userId),
    deps.readBadgeMarkers(userId),
  ])

  return {
    runs: runs.map((run) => ({ occurredOn: run.occurredOn, distanceM: run.distanceM })),
    records,
    badges,
  }
}

/**
 * The whole of R19's mechanism, in one idempotent call.
 *
 * **Idempotent** is the property that matters: phase 10's cron runs every five minutes, and a
 * second call inside the same Jakarta day fires nothing new, settles nothing twice and writes
 * nothing when no verdict changed. That is what makes "consumed exactly once" true of the system
 * and not merely of one code path.
 */
export async function resolveNinaPromises(
  userId: string,
  deps: NinaPromiseDeps = productionPromiseDeps(),
): Promise<NinaPromiseSweep> {
  const empty: NinaPromiseSweep = {
    verdicts: [],
    fired: 0,
    settled: 0,
    expired: 0,
    wrote: false,
  }

  const row = await deps.readSlot(userId)
  if (row == null) return empty

  const slot = parseSlot(row.value)
  if (slot.promises.length === 0) return empty

  const now = deps.now()
  const todayISO = todayInJakarta(now)

  const [facts, avatar] = await Promise.all([
    loadPromiseFacts(userId, slot.promises, todayISO, deps),
    deps.readCurrentAvatar(userId),
  ])

  /*
   * THE LANDING TEST. A generated avatar created on or after the day the job was fired means the
   * photograph arrived — which under RU-20 happened in a GitHub Actions runner, minutes later, in
   * a process that knew nothing about promises. Its one tolerance (a different generated avatar
   * landing the same day) is argued in the plan and costs a mis-attribution of a true event.
   *
   * `source !== 'generated'` is what keeps an ADMIN upload (phase 15) or an OPERATOR push (phase
   * 14) from settling a promise she never took a photograph for.
   */
  const avatarLandedOnOrAfter = (dayISO: DateISO): boolean => {
    if (avatar == null || avatar.source !== 'generated') return false
    return jakartaDayOf(avatar.createdAt) >= dayISO
  }

  const verdicts = evaluatePromises(slot.promises, {
    todayISO,
    facts,
    avatarLandedOnOrAfter,
  })

  const byId = new Map(slot.promises.map((promise) => [promise.id, promise]))
  const decisions: PromiseDecision[] = []
  let fired = 0

  const deadline = now.getTime() + NINA_PROMISE_SWEEP_BUDGET_MS

  for (const verdict of verdicts) {
    if (verdict.kind !== 'fire') {
      decisions.push({ verdict })
      continue
    }

    /* Out of budget: leave it entirely alone. A `fire` recorded without a dispatch would burn an
     * attempt for a job that was never asked for. */
    if (Date.now() > deadline) {
      decisions.push({ verdict: { ...verdict, kind: 'wait', reason: 'sweep budget spent' } })
      continue
    }

    const promise = byId.get(verdict.id)
    if (promise == null) {
      decisions.push({ verdict })
      continue
    }

    /*
     * The scene is HER promise in her own words plus his condition — the two display-ready strings
     * phase 5 already distilled. It becomes `nina_avatars.description` verbatim (phase 12's
     * `NinaAvatarRequest.scene` says so), which is precisely what R25 then reads back out of the
     * row to invent a story about. No prompt engineering happens here: phase 12 owns
     * `buildNinaImagePrompt` and phase 2 owns `NINA_APPEARANCE`.
     */
    const scene = `${promise.text} (${promise.condition})`

    /* `generateNinaAvatar` never throws — phase 12's stated guarantee. The catch is belt and
     * braces: an unexpected throw must degrade to "refused", never to a half-written slot. */
    let outcome: { ok: boolean; jobId?: string | null }
    try {
      outcome = await deps.generateAvatar({ userId, scene })
    } catch (error) {
      console.warn('[nina] promise generation threw', { promiseId: promise.id, error })
      outcome = { ok: false, jobId: null }
    }

    if (outcome.ok) fired += 1
    decisions.push({ verdict, jobId: outcome.ok ? (outcome.jobId ?? null) : null })
  }

  const resolution = resolvePromiseSlot(slot, decisions, todayISO)

  if (resolution.changed) {
    /* Phase 5's rule: the WHOLE slot, and the row's own `source`. */
    await deps.writeSlot(userId, {
      key: NINA_SLOT_PENDING_PROMISES,
      value: resolution.slot,
      source: row.source,
    })
  }

  const applied = decisions.map((decision) => decision.verdict)
  return {
    verdicts: applied,
    fired,
    settled: applied.filter((v) => v.kind === 'settle').length,
    expired: applied.filter((v) => v.kind === 'expire').length,
    wrote: resolution.changed,
  }
}
```

**Impact:** the only new server module in the phase. It writes one slot and calls one generator.

---

### Step 8: `lib/nina/avatartools.ts` — `set_avatar`, and the tool set she is actually given

**File:** `lib/nina/avatartools.ts` (new)
**Change:** the tool phase 2 declared and phase 3 deliberately did not dispatch.

**Why a separate file rather than an edit to phase 12's `imagetools.ts`:** phase 12 is being
rewritten around RU-20 right now, and adding a member to an array inside a file under rewrite is
the most conflict-prone edit available. `extendToolSet` exists precisely so a phase can compose
without touching another phase's module — phase 3 says so ("purely additive composition, and the
reason phases 12 and 13 need no edit here") — so this phase composes on top of
`NINA_CHAT_TOOL_SET` and changes exactly one word at one call site.

**Code:**

```ts
import 'server-only'

import { z } from 'zod'

import { SET_AVATAR_TOOL } from './prompts/tools'
import { extendToolSet, type NinaToolAnswer, type NinaToolHandler, type NinaToolSet } from './tools'
import { NINA_CHAT_TOOL_SET } from './imagetools'
import { generateNinaAvatar } from './avatargen'
import { getCurrentNinaAvatar } from './queries'

/**
 * `set_avatar` — she changes her own profile picture, in a turn, on purpose (R19's direct route).
 *
 * ── SHE MUST NOT CLAIM IT HAS CHANGED, AND THE `tool_result` SAYS SO ──────────────────────────
 * D-3: phase 10 announces an avatar change, this phase never does. Under RU-20 the photograph is
 * produced by a GitHub Actions runner a minute or more after this handler returns, so a bubble
 * saying *"nih udah gw ganti"* would be a claim about a file that does not exist. The answer below
 * therefore tells her, in the protocol's own channel, that the camera is running and that she may
 * say she is taking one — and phase 10 says it landed, once it has.
 *
 * That also removes the double-announcement `avatar_changed` could otherwise produce: there is
 * exactly one message about a new face, and `announced_at` is what makes it exactly one.
 *
 * ── WHY THE PROMISE SWEEP DOES NOT GO THROUGH THIS TOOL ───────────────────────────────────────
 * A promise is honoured whether or not they are talking (Step 7's cron argument), so the sweep
 * calls `generateNinaAvatar` directly. This tool is the other half: he asks her to change it, or
 * she decides to, mid-conversation. Same generator, same `source: 'generated'`, same announcer.
 */

export const SetAvatarArgsSchema = z.object({
  scene: z.string().trim().min(1).max(600),
  because: z.string().trim().min(1).max(600),
})

export type SetAvatarArgs = z.infer<typeof SetAvatarArgsSchema>

/**
 * What she is told, per outcome. Written for a MODEL, not for the runner: these strings are never
 * rendered, they are `tool_result` content she then speaks in her own words. Phase 12's
 * `NINA_IMAGE_APOLOGIES` is the other kind of string — those are hers to say — and the two must
 * not be confused.
 */
export const SET_AVATAR_ANSWERS = {
  queued:
    'Kamera jalan. Foto barunya belum ada — proses di belakang, bisa satu-dua menit. ' +
    'JANGAN bilang fotonya sudah ganti. Bilang saja lo lagi ambil foto, santai, ' +
    'nanti dia lihat sendiri.',
  in_flight:
    'Masih ada satu proses foto yang belum kelar. Jangan mulai yang baru dan jangan ' +
    'bilang fotonya sudah ganti — bilang aja masih proses.',
  capped:
    'Kuota foto hari ini habis. Bilang apa adanya, santai, tanpa istilah teknis: ' +
    'hari ini nggak bisa, besok lagi.',
  failed:
    'Kameranya gagal. Bilang apa adanya, singkat, tanpa istilah teknis, dan jangan ' +
    'janji ulang di kalimat yang sama.',
} as const

/**
 * `set_avatar` dispatch. **Never throws** — phase 3's `dispatchNinaTool` would turn a rejection
 * into an `isError` answer anyway, and a thrown exception here would cost a whole chat turn over
 * one tool call.
 */
export const handleSetAvatar: NinaToolHandler = async (args, ctx): Promise<NinaToolAnswer> => {
  const parsed = SetAvatarArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: { ok: false, why: 'set_avatar butuh `scene` dan `because`, dua-duanya teks.' },
      isError: true,
    }
  }

  /*
   * One in-flight photograph at a time. The check is on the CURRENT avatar being unannounced
   * rather than on phase 12's job table, and that is deliberate: an unannounced current avatar is
   * a face phase 10 has not spoken about yet, so starting a second generation would queue two
   * announcements for one conversation. Reading phase 12's job table instead would couple this
   * handler to a module under rewrite (RU-20) for no better answer.
   */
  const current = await getCurrentNinaAvatar(ctx.userId)
  if (current != null && current.announcedAt == null && current.source === 'generated') {
    return { answer: { ok: false, note: SET_AVATAR_ANSWERS.in_flight }, isError: false }
  }

  const result = await generateNinaAvatar({
    userId: ctx.userId,
    scene: parsed.data.scene,
    source: 'generated',
  })

  if (result.ok) {
    return { answer: { ok: true, note: SET_AVATAR_ANSWERS.queued }, isError: false }
  }

  const kind = (result as { kind?: string }).kind
  return {
    answer: {
      ok: false,
      note: kind === 'capped' ? SET_AVATAR_ANSWERS.capped : SET_AVATAR_ANSWERS.failed,
    },
    isError: false,
  }
}

/**
 * All six tools, and the set `lib/nina/actions.ts` actually passes.
 *
 * Layered rather than redefined: phase 3 ships four, phase 12 adds `generate_image`, this adds
 * `set_avatar`. `extendToolSet` throws at module load on a duplicate name, in the phase that added
 * it — which is the only time anyone can fix it.
 */
export const NINA_FULL_TOOL_SET: NinaToolSet = extendToolSet(NINA_CHAT_TOOL_SET, [
  { tool: SET_AVATAR_TOOL, handler: handleSetAvatar },
])
```

**Impact:** she can change her own photograph. **One line changes in `lib/nina/actions.ts`:**
phase 12's `toolSet: NINA_CHAT_TOOL_SET` becomes `toolSet: NINA_FULL_TOOL_SET`, with the import
moved from `./imagetools` to `./avatartools`. Nothing else in that file moves.

---

### Step 9: R25 — she knows what her photograph shows

**Files:** `lib/nina/context.ts` (phase 2, `phase-2.md:1116` and `:1407`), `lib/nina/load.ts`
(phase 2, `:1567`), `lib/nina/prompts/system.ts` (phase 2, `:2015`)

**Change:** one field on `NinaContext`, one field on `BuildNinaContextInput`, four lines in
`buildNinaContext`, one element in `loadNinaContext`'s second `Promise.all`, and one paragraph in
`CONTEXT_GUIDE`. **Additive throughout** — no existing field moves, no prompt sentence is rewritten,
and phase 2's tests keep passing because every new thing is nullable.

**Why this is the whole of R25.** The context reaches `glm-5.3` as JSON (phase 2's
`CONTEXT_GUIDE` introduces it with *"The JSON below is everything you know"*), so a new field on
the object is a new fact she has. `nina_avatars.description` says what the photograph DEPICTS —
phase 12 writes it from its own generation prompt, phases 14 and 15 write it by running phase 6's
`glm-4.6v` describe pass over a hand-uploaded file. Given that, *"lah lo ganti foto profil na, itu
lagi dimana?"* is answerable in character with no new machinery at all.

**The story is never stored, and that is a decision.** `nina_avatars` gains no `story` column and
nothing here writes one. A stored story is quoted verbatim the next time he asks, next week and
next month, and a friend who repeats a sentence word for word is the single most reliable tell that
she is not one. Improvising from the same description plus the current conversation is what makes
the second telling different from the first, which is what a person remembering actually sounds
like.

**Code — `lib/nina/context.ts`, appended to the facts types:**

```ts
/**
 * Her current profile photograph, as a fact about herself — R25.
 *
 * ── WHY THE DESCRIPTION AND NOT THE IMAGE ─────────────────────────────────────────────────────
 * Invariant 5: `glm-5.3` is never sent an image; the endpoint answers 200 and silently drops it.
 * RU-12 is the pattern — `glm-4.6v` writes a dense private description and `glm-5.3` reacts to
 * that text. Her own avatar follows the same route: whoever created the row wrote what it shows,
 * and she reads the words.
 *
 * ── WHY THERE IS NO `story` FIELD ─────────────────────────────────────────────────────────────
 * Because a stored story is re-quoted verbatim next month. See the plan.
 *
 * ── RU-18: SHE DOES NOT REMARK ON HER OWN FACE ────────────────────────────────────────────────
 * The anchor is dropped, so consecutive generated photographs are different-looking women. That is
 * accepted and deliberate. `CONTEXT_GUIDE` instructs her not to comment on it, and this type
 * carries no field she could comment from: there is nothing here about a previous face.
 */
export interface AvatarFacts {
  /** What the photograph shows, in prose. Null when nobody has described it. */
  description: string | null
  /** Jakarta day it became her photograph. Null for the committed seed. */
  changedOn: string | null
  /** `'generated' | 'admin' | 'operator' | 'seed'`, or null for the committed seed. */
  source: string | null
  /** True when this is `public/nina/avatar-001.png` and not an album row (D-2). */
  isSeed: boolean
}

/** What `loadNinaContext` hands `buildNinaContext`. */
export interface AvatarInput {
  description: string | null
  createdAt: Date
  source: string
}
```

**Code — `NinaContext`, one member added after `badges`:**

```ts
export interface NinaContext {
  now: NowFacts
  runner: RunnerFacts
  memory: MemoryFacts
  conversation: ConversationFacts
  /** **Newest first**, so index 0 is his most recent run and `daysAgo` ascends down the array. */
  recentRuns: NinaRunFact[]
  /** All eleven keys, catalog order. */
  records: RecordFact[]
  badges: BadgeFacts
  /** Her own profile photograph — R25. Never null: the seed is a value, not an absence. */
  avatar: AvatarFacts
  /** Phase 9's codes that fired, with their nag level. `[]` when nothing fired. */
  patterns: PatternFact[]
  /** Bumped by hand whenever the system text or any tool schema changes. Logged, never sent. */
  promptVersion: number
}
```

**Code — `BuildNinaContextInput`, one member added after `badges`:**

```ts
  /** The current `nina_avatars` row, or null for the committed seed (D-2). */
  avatar: AvatarInput | null
```

**Code — `buildNinaContext`, the mapping, placed beside the `badges` mapping:**

```ts
  const avatar: AvatarFacts =
    input.avatar == null
      ? { description: null, changedOn: null, source: null, isSeed: true }
      : {
          description: input.avatar.description,
          changedOn: jakartaDayOf(input.avatar.createdAt),
          source: input.avatar.source,
          isSeed: false,
        }
```

…and `avatar` added to the returned object literal, between `badges` and `patterns`.

**Code — `lib/nina/load.ts`, the second `Promise.all` (`phase-2.md:1567`) and its mapping:**

```ts
  const [profileRow, allRuns, recordRows, badgeRows, hrMax, avatarRow] = await Promise.all([
    getProfile(userId),
    getReviewedRunsWithChildren(userId),
    getRecords(userId),
    getBadgeAwards(userId),
    resolveHrMax(userId),
    /* R25. A single-row lookup on the partial unique index `nina_avatars_user_current_unq`, so it
     * costs the same as reading a column off `profiles`. Null is a real answer — D-2. */
    getCurrentNinaAvatar(userId),
  ])

  const avatar: AvatarInput | null =
    avatarRow == null
      ? null
      : {
          description: avatarRow.description,
          createdAt: avatarRow.createdAt,
          source: avatarRow.source,
        }
```

…and `avatar` passed into `buildNinaContext`'s input object.

**Code — `lib/nina/prompts/system.ts`, one paragraph appended inside `CONTEXT_GUIDE`:**

```
- `avatar`: your own profile picture right now. `description` is what the photo actually shows —
  treat it as your own memory of where you were and what you were doing, not as a caption someone
  wrote for you. If he asks where you are in it, or what was going on, tell him: invent the details
  that are not in the description, keep them consistent with the photo AND with what you two have
  been talking about, and keep it short, the way anyone answers a question about their own photo.
  Do not repeat a story you already told word for word. `changedOn` is the day it became your
  picture. If `isSeed` is true you have never changed it, so do not talk as if you had.
  Never comment on your own face changing between photos, and never compare one photo of yourself
  to another — that is not a thing you would notice about yourself.
```

**Impact:** she can answer *"itu lagi dimana?"*. Phase 2's fixture test gains `avatar: null` in
its input literal, which is the one existing test file this step touches.

---

### Step 10: `components/nina/NinaAvatar.tsx` — her face comes from the album, and it is a link

**File:** `components/nina/NinaAvatar.tsx` (phase 4's file, `phase-4.md:1200`)
**Change:** four optional props, the body routed through `ninaCropStyle`, and `NINA_AVATAR_SRC`
demoted to a re-export. **This is phase 15's handoff 1, applied with its own code**, plus phase
15's handoff 3 resolved.

**Code — the whole file:**

```tsx
import Image from 'next/image'

import { ninaCropStyle, resolveCrop, type NinaCropInput } from '@/lib/nina/crop'
import { NINA_AVATAR_FALLBACK_SRC } from '@/lib/nina/album'
import { cn } from '@/lib/cn'

/**
 * Nina's face, in a circle — F33 R9/R17/R19.
 *
 * ── THE SOURCE IS THE ALBUM, WITH THE COMMITTED FILE AS THE ANSWER FOR "NO ALBUM" ─────────────
 * Phase 4 hardcoded `public/nina/avatar-001.png` because there was no album yet. Now there is, and
 * `getCurrentNinaAvatar()` returning null means "use the committed constant" — D-2, implemented
 * once in `ninaAvatarView`. Every caller passes a `NinaAvatarView`'s three fields or passes
 * nothing at all, and passing nothing renders exactly what phase 4 rendered.
 *
 * ── ONE CROP MAPPING, SHARED WITH THE ADMIN PREVIEW ───────────────────────────────────────────
 * `ninaCropStyle` is the only function in the repo that knows what `crop_scale` means. Phase 15's
 * circular studio and this 44 px header avatar therefore cannot disagree about where her face is,
 * which is the entire reason that module exists and why it was moved into this phase (D-1).
 *
 * ── WHY THE FALLBACK KEEPS ITS `next/image` AND A BLOB URL DOES NOT GET ONE ───────────────────
 * The committed PNG is a build-time asset at a known path: `next/image` can size, format and cache
 * it for free. An album photo is a Blob URL of arbitrary dimensions that phase 12 already produced
 * at its target size, so `next/image` would re-optimise a finished file on a paid transform quota
 * — the same argument `PhotoViewer` makes in its own eslint-disable. And the crop transform sets
 * `position`/`width`/`height`/`left`/`top`, which is exactly what `next/image fill` sets itself.
 */

/** `public/nina/avatar-001.png`, re-exported so phase 4's importers do not change. */
export { NINA_AVATAR_FALLBACK_SRC as NINA_AVATAR_SRC } from '@/lib/nina/album'

const SIZES = {
  /** 28px — the typing indicator and the message list. */
  sm: 'size-7',
  /** 44px — the chat header. Also the iOS tap-target floor, which is why Step 13 needs no resize. */
  md: 'size-11',
  /** 128px — the hero on `/nina/about`. */
  xl: 'size-32',
} as const

export function NinaAvatar({
  size = 'md',
  src = NINA_AVATAR_FALLBACK_SRC,
  natural = null,
  crop = null,
  className,
}: {
  size?: keyof typeof SIZES
  src?: string
  natural?: { width: number | null; height: number | null } | null
  crop?: NinaCropInput | null
  className?: string
}) {
  const isFallback = src === NINA_AVATAR_FALLBACK_SRC && crop == null

  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-pill bg-paper-2',
        SIZES[size],
        className,
      )}
    >
      {isFallback ? (
        <Image src={src} alt="" fill sizes="128px" className="object-cover" />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, arbitrary
           dimensions, already at its target size, and the crop transform owns every positioning
           property `next/image fill` would set. See the header. */
        <img
          src={src}
          alt=""
          draggable={false}
          style={ninaCropStyle(natural ?? { width: null, height: null }, resolveCrop(crop))}
        />
      )}
    </span>
  )
}
```

**Impact:** phase 4's two call sites and phases 6–8's compile untouched — every new prop is
optional and the no-argument render is byte-identical. `size="xl"` is new and is used only by
Step 13's hero. **Phase 15's `CircleFrame` must drop its own `NINA_AVATAR_FALLBACK_SRC` and import
this one from `@/lib/nina/album`.**

---

### Step 11: `components/ui/PhotoViewer.tsx` — two optional props, so it can name a photograph

**File:** `components/ui/PhotoViewer.tsx` (`:47` the type, `:52` the props, `:181` the header)
**Change:** `ViewerPhoto` gains `label?: string`; `PhotoViewer` gains `subject?: string`.

**Why this is the right edit and not a second overlay.** The exit criteria are explicit that
`gallery.ts` must be reused, and `PhotoViewer`'s own header says the swipe stays identical on every
surface only because there is one implementation. But the overlay titles itself with
`SCREEN_KIND_LABEL[photo.kind] ?? photo.kind`, which for an album photo renders the literal word
`avatar` and announces *"avatar screenshot"*. Two defaulted props fix that without touching
`stepIndex`, `decideSwipe`, the touch handlers or any of the three existing call sites.

**Code — the type:**

```ts
export interface ViewerPhoto {
  url: string
  kind: string
  /**
   * What to call this photo, when `kind` is not a `ScreenKind`. F33's album and chat gallery pass
   * a human phrase here; the review surfaces pass nothing and keep `SCREEN_KIND_LABEL`.
   */
  label?: string
}
```

**Code — the props and the one derived string:**

```tsx
export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  subject = 'screenshot',
}: {
  photos: readonly ViewerPhoto[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
  /**
   * The noun in the dialog's accessible name. `'screenshot'` for the review surfaces, `'photo'`
   * for F33's album and gallery — "avatar screenshot" is not a thing.
   */
  subject?: string
}) {
  const photo = photos[index]!
  const nameOf = (p: ViewerPhoto) =>
    p.label ?? SCREEN_KIND_LABEL[p.kind as ScreenKind] ?? p.kind
```

**Code — the three places `nameOf` replaces the inline lookup:**

```tsx
      aria-label={`${nameOf(photo)} ${subject}`}
```

```tsx
        <span className="text-[13px] font-semibold text-card">
          {nameOf(photo)}
          {photos.length > 1 && (
            <span className="ml-2 font-medium opacity-60">
              {index + 1} / {photos.length}
            </span>
          )}
        </span>
```

```tsx
              aria-label={`Show the ${nameOf(p)} ${subject}`}
```

**Impact:** `ScreenshotStrip`, `SheetSource` and `PhotoInclusionList` are byte-identical in
behaviour — `label` is absent, `subject` defaults, and `nameOf` reduces to the expression that was
already there. No test changes.

---

### Step 12: `components/nina/ChatImages.tsx` — widened with `onOpen`, exactly as phase 6 asked

**File:** `components/nina/ChatImages.tsx` (phase 6's file, `phase-6.md:1997`)
**Change:** two optional props. Phase 6's instruction, verbatim: *"widen it with `onOpen` rather
than writing a second grid. `kind` is the his/hers discriminator."*

**Code — the whole component; the header keeps phase 6's paragraphs and gains one:**

```tsx
export function ChatImages({
  urls,
  kinds,
  onOpen,
}: {
  urls: readonly string[]
  /**
   * Parallel to `urls`. Only read to label the viewer, so a missing entry degrades to "his" —
   * `photoSideOf`'s own default, for its own reason.
   */
  kinds?: readonly string[]
  /**
   * Tap-to-open, F33 phase 13. **Absent means the grid is not interactive**, which is how phase 6
   * shipped it: the markup below is then identical to phase 6's, `<li>` for `<li>`, so a message
   * bubble in the chat renders exactly as it did before this phase.
   */
  onOpen?: (index: number) => void
}) {
  if (urls.length === 0) return null

  const many = urls.length > 1
  const imgClass = many
    ? 'block aspect-square w-full object-cover'
    : 'block max-h-64 w-full object-cover'

  return (
    <ul className={many ? 'mb-2 grid grid-cols-2 gap-1' : 'mb-2 grid grid-cols-1 gap-1'}>
      {urls.map((url, i) => (
        <li key={url} className="overflow-hidden rounded-field bg-ink-3/20">
          {onOpen == null ? (
            /* eslint-disable-next-line @next/next/no-img-element -- see phase 6's header */
            <img src={url} alt="" className={imgClass} />
          ) : (
            <button
              type="button"
              onClick={() => onOpen(i)}
              aria-label={`Buka ${NINA_SIDE_LABEL[photoSideOf(kinds?.[i] ?? 'upload')].toLowerCase()}`}
              className="block w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see phase 6's header */}
              <img src={url} alt="" className={imgClass} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
```

plus `import { NINA_SIDE_LABEL, photoSideOf } from '@/lib/nina/album'`.

**Impact:** phase 6's one call site (`MessageList.tsx`, which passes only `urls`) is unchanged and
its rendered markup is unchanged. **This phase does not add `onOpen` at that call site** — see
Handoffs: opening a viewer from inside the message list is a second interaction on a surface
phases 6, 7 and 8 all own slots in, and `/nina/about` is the screen R17 actually asked for.

---

### Step 13: `components/nina/NinaPhotoGrid.tsx` — one square grid, three call sites

**File:** `components/nina/NinaPhotoGrid.tsx` (new)
**Change:** the grid both sections of `/nina/about` use.

**Code:**

```tsx
'use client'

import * as React from 'react'

/**
 * A square photo grid that opens a viewer — F33 R17.
 *
 * ── WHY ONE COMPONENT FOR THE ALBUM AND THE GALLERY ───────────────────────────────────────────
 * They differ in exactly two ways: the album rings its current photo, and the gallery shows two
 * parties. Everything else — three columns, `aspect-square`, `object-cover`, a `<button>` per cell,
 * the tap target — is identical, and two components would be two chances for them to drift the way
 * `ScreenshotStrip`'s arrows and its swipe drifted before F18 unified them.
 *
 * ── `bg-ink-3/20`, NOT `bg-paper-2` ──────────────────────────────────────────────────────────
 * Phase 6 settled this after phases 4, 7 and 8 argued it: `ink-3` is a mid-grey in BOTH schemes, so
 * an alpha of it composites correctly over `bg-ink` and `bg-card` alike, where `bg-paper-2`
 * inverts. Adopted here rather than re-litigated.
 *
 * ── `alt=""` ON EVERY CELL ───────────────────────────────────────────────────────────────────
 * Phase 6's argument holds for both sections: the only description that exists for a chat photo is
 * `glm-4.6v`'s, which is private, and the only one for an avatar is `nina_avatars.description`,
 * which is her memory and not a caption. The `<button>` carries the accessible name instead, which
 * is where a screen reader wants it.
 */

export interface NinaGridCell {
  id: string
  url: string
  /** The button's accessible name. */
  label: string
  /** Draws the current-photo ring. The album sets it; the gallery never does. */
  isCurrent?: boolean
}

export function NinaPhotoGrid({
  cells,
  onOpen,
}: {
  cells: readonly NinaGridCell[]
  onOpen: (index: number) => void
}) {
  if (cells.length === 0) return null

  return (
    <ul className="grid grid-cols-3 gap-1">
      {cells.map((cell, i) => (
        <li key={cell.id} className="overflow-hidden rounded-field bg-ink-3/20">
          <button
            type="button"
            onClick={() => onOpen(i)}
            aria-label={cell.label}
            className={
              cell.isCurrent === true
                ? 'block w-full ring-2 ring-ink ring-inset'
                : 'block w-full'
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, arbitrary
                dimensions, already compressed by whoever wrote the row. `next/image` would
                re-optimise finished files on a paid transform quota, three at a time. */}
            <img src={cell.url} alt="" className="block aspect-square w-full object-cover" />
          </button>
        </li>
      ))}
    </ul>
  )
}
```

**Impact:** one new client component. Nothing imports it yet.

---

### Step 14: R26 — "attach to chat", as an ordinary message carrying an existing blob

**Files:** `lib/nina/actions.ts` (phase 3's file), `lib/nina/albumActions.ts` (new)

**The design, stated before the code.** R26 is not a new attachment kind. It is *"an ordinary chat
message carrying an EXISTING blob"*, so it reuses phase 6's `nina_message_images` row shape and
nothing else is invented. Three consequences fall out of that and each one removes work:

1. **No ticket.** Phase 6's signed ticket exists so the CLIENT cannot claim a blob it did not
   upload. A Server Action resolving an id against `nina_avatars`/`nina_message_images` **by
   `user_id`** proves more than a ticket can, and the album photo's pathname
   (`nina/<userId>/avatar-<id>.jpg`) would fail `isNinaChatRequestPathname` anyway — which is
   correct, because it is not a chat upload.
2. **No vision call.** We already know what is in the picture: `nina_avatars.description` for an
   album photo, `nina_message_images.description` for a gallery photo. Both are exactly what
   phase 6's `glm-4.6v` pass would have produced, already paid for. So the description is copied
   onto the new row and reaches her through phase 3's `imageDescriptions`, and R26's *"ini pas lari
   kapan na?"* is answered from the same text R25 tells stories from.
3. **No new send path.** `sendNinaMessage` already persists the runner row before the model call,
   already clamps bubbles to four, already handles a failed turn without losing his message. One
   optional field on its input is the whole edit.

**A text-free attach must be valid**, exactly as phase 8's run attachment is — hence the widened
refusal rule.

**Code — `lib/nina/actions.ts`, the input type and the one resolution block:**

```ts
/**
 * A blob **the server already owns**, attached to a new message — F33 R26.
 *
 * Deliberately an id and a kind rather than a URL: a URL from a client is a claim, and an id
 * resolved against `user_id` is a fact. `'avatar'` reads `nina_avatars`, `'image'` reads
 * `nina_message_images`, and either miss is a refusal rather than a silently text-only send.
 */
export interface NinaAttachExisting {
  kind: 'avatar' | 'image'
  id: string
}

/** Resolved once, before the runner's row is written. Null when the id is not his. */
async function resolveAttachment(
  userId: string,
  attach: NinaAttachExisting,
): Promise<{ blobUrl: string; pathname: string; kind: NinaImageKind; description: string | null } | null> {
  if (attach.kind === 'avatar') {
    const rows = await listNinaAvatars(userId)
    const row = rows.find((candidate) => candidate.id === attach.id)
    if (row == null) return null
    /* Her own photograph, so `kind: 'generated'` — the gallery's his/hers discriminator has to
     * keep telling the truth about a photo that has now appeared twice. */
    return {
      blobUrl: row.blobUrl,
      pathname: row.pathname,
      kind: 'generated',
      description: row.description,
    }
  }

  const rows = await listNinaMessageImages(userId, { limit: NINA_GALLERY_LIMIT })
  const row = rows.find((candidate) => candidate.id === attach.id)
  if (row == null) return null
  /* A re-attached chat photo keeps whoever's it was. */
  return {
    blobUrl: row.blobUrl,
    pathname: row.pathname,
    kind: row.kind,
    description: row.description,
  }
}
```

…and inside `sendNinaMessage`, three edits to what phases 3 and 6 wrote:

```ts
  /* Phase 6 widened this from "body is empty" to "body and imageTickets are both empty".
   * R26 widens it once more: an attached photo with no question is a valid send. */
  const attach = input.attachExisting ?? null
  const tickets = input.imageTickets ?? []
  if (input.body.trim().length === 0 && tickets.length === 0 && attach == null) {
    return { ok: false, userMessageId: null, bubbles: [], unavailable: false }
  }

  /* Resolved BEFORE the runner's row is written, so a bad id costs nothing. */
  const attached = attach == null ? null : await resolveAttachment(userId, attach)
  if (attach != null && attached == null) {
    return { ok: false, userMessageId: null, bubbles: [], unavailable: false }
  }
```

…and, immediately after the runner's `nina_messages` row is inserted and beside phase 6's own
`insertNinaMessageImages` call:

```ts
  if (attached != null) {
    await insertNinaMessageImages(userId, [
      {
        messageId: runnerMessage.id,
        kind: attached.kind,
        blobUrl: attached.blobUrl,
        pathname: attached.pathname,
        description: attached.description,
        sortOrder: tickets.length,
      },
    ])
  }
```

…and `attached.description` appended to the `imageDescriptions` array phase 6 already builds, so
`glm-5.3` receives text and never an image (invariant 5).

**Code — `lib/nina/albumActions.ts`, the whole file:**

```ts
'use server'

import { sendNinaMessage } from './actions'

/**
 * "Attach to chat", from the album's zoomed-photo state — F33 R26.
 *
 * ── WHY THIS FILE EXISTS AT ALL, GIVEN IT IS ONE CALL ─────────────────────────────────────────
 * Isolation. `lib/nina/actions.ts` is phase 3's file and phases 5, 6, 12 and 13 all edit it; the
 * album importing from here instead means the only thing this phase asks of that file is one
 * optional input field and one word of tool set. If the reconciler moves `sendNinaMessage`, this
 * is the single call site that follows it.
 *
 * ── WHY THERE IS NO REVEAL ANIMATION ON THIS PATH ─────────────────────────────────────────────
 * `ChatScreen`'s staggered reveal (RU-5) is for bubbles arriving while he is watching the
 * conversation. Here he is on `/nina/about`, and the WhatsApp behaviour he described is that
 * attaching takes you to the chat. So the action persists everything and the caller navigates:
 * `/nina` is a Server Component reading `listNinaMessages`, so her reply is simply there when it
 * paints, with no client state to hand across a route change.
 */

/** A question is optional. `600` is generous for one line and short of `MAX_RUNNER_MESSAGE_CHARS`. */
export const NINA_ATTACH_MAX_CHARS = 600

export interface NinaAttachInput {
  kind: 'avatar' | 'image'
  id: string
  /** May be empty — a text-free attach is a valid send, exactly as phase 8's run attachment is. */
  body: string
}

export interface NinaAttachResult {
  ok: boolean
  userMessageId: string | null
  /** True when the turn could not reach the model. His message is still saved. */
  unavailable: boolean
}

export async function attachNinaPhotoToChat(input: NinaAttachInput): Promise<NinaAttachResult> {
  const body = input.body.trim().slice(0, NINA_ATTACH_MAX_CHARS)
  const result = await sendNinaMessage({
    body,
    attachExisting: { kind: input.kind, id: input.id },
  })
  return {
    ok: result.ok,
    userMessageId: result.userMessageId,
    unavailable: result.unavailable,
  }
}
```

**Code — `lib/nina/albumActions.test.ts`:** the two rules that are not about the model.

```ts
import { describe, expect, it } from 'vitest'

import { NINA_ATTACH_MAX_CHARS } from './albumActions'

/**
 * `attachNinaPhotoToChat` is one call into a Server Action, so there is nothing pure in it to
 * assert beyond its clamp — and asserting the clamp is worth it, because `MAX_RUNNER_MESSAGE_CHARS`
 * (4000, phase 3) would otherwise let a paste of an entire article into the album's question box
 * reach the model as a "question about this photo".
 *
 * The ownership check and the empty-body rule live in `sendNinaMessage` and are asserted by phase
 * 3's and phase 6's suites; the one thing this phase must not do is duplicate them here, where a
 * second copy could disagree.
 */
describe('NINA_ATTACH_MAX_CHARS', () => {
  it('is short enough to be one question and shorter than the message ceiling', () => {
    expect(NINA_ATTACH_MAX_CHARS).toBe(600)
    expect(NINA_ATTACH_MAX_CHARS).toBeLessThan(4000)
  })
})
```

**Impact:** she answers questions about her own photographs. Phase 3's action gains one field;
phase 6's ticket path is untouched.

---

### Step 15: `components/nina/NinaAboutScreen.tsx` — the client half of her detail page

**File:** `components/nina/NinaAboutScreen.tsx` (new)
**Change:** the hero, the two sections, the viewer, and the attach control.

**Two rulings this step makes.**

**(a) The open viewer is a history entry, and it is `pushState` — not `usePanelParam`.** F24's
argument applies exactly: React state is invisible to the phone's back gesture, so a back-swipe
with a photo open would leave `/nina/about` altogether instead of closing the photo. But
`usePanelParam` is `/me`'s codec — it decodes a `PanelSelection` union out of `?panel=badge.<key>`
and carries a second `?dates=` disclosure — and importing it here would either widen that union
with a kind `/me` cannot render or make this screen encode a badge selection it does not have. So
this reuses the **technique** (`window.history.pushState`, `pushedRef`, `back()`-when-we-pushed
and `replaceState`-when-we-did-not — all four verified against `usePanelParam.ts`'s own docstring
and the Next 16.3.1 "Native History API" note it quotes) and not the module. There is exactly one
reader of `?photo=`, so its codec is four lines and stays local; a shared module would be the
second surface `lib/panel/param.ts`'s header warns about.

**(b) Attaching navigates, and it uses `router.push`, not `replace`.** He came from `/nina`, so
`/nina/about` is already an entry; pushing `/nina` means the back gesture returns him to the album
he was looking at, which is what WhatsApp does after a forward. `router.refresh()` is called first
so the pushed `/nina` renders the message that was just written rather than a cached RSC payload —
that is the one Next-16-specific call in the file and it is why phase 4's note that `ChatScreen`
never refreshes does not apply here.

**Code:**

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/Button'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import { NinaPhotoGrid, type NinaGridCell } from './NinaPhotoGrid'
import { NinaAvatar } from './NinaAvatar'
import { attachNinaPhotoToChat, NINA_ATTACH_MAX_CHARS } from '@/lib/nina/albumActions'
import {
  type NinaAlbumPhoto,
  type NinaAvatarView,
  type NinaGalleryPhoto,
} from '@/lib/nina/album'

/**
 * `/nina/about` — her detail page, the WhatsApp shape R17 asked for.
 *
 * Three tap levels, and each one is a real history entry:
 *
 *   1. `/nina`'s header avatar  ->  this page          (a route; `<Link>` does it)
 *   2. this page's hero         ->  the album, zoomed   (`?photo=album.<id>`, pushed)
 *   3. any grid cell            ->  that photo, zoomed  (same parameter)
 *
 * ── ONE VIEWER, AND IT IS THE ONE THAT ALREADY EXISTS ─────────────────────────────────────────
 * `components/ui/PhotoViewer.tsx` is the full-screen swipeable overlay R17 describes, and it is
 * already correct in ways a second one would not be: `decideSwipe`'s three rules keep the browser's
 * own pinch-zoom and momentum panning alive, `stepIndex`'s double modulo makes a backward swipe off
 * the FIRST photo land on the last, and the arrow keys page through the same function so they
 * cannot drift from the gesture. F18 unified those; a second viewer here would be a defect, not a
 * feature, and this phase's exit criteria say so.
 *
 * ── THE TWO SECTIONS ARE ONE VIEWER LIST EACH, DELIBERATELY ───────────────────────────────────
 * Swiping inside the album should not wander into his chat photos and back. So `section` selects
 * which list the viewer is over, and paging wraps within it — which is also what makes
 * `stepIndex`'s wrap read correctly against the dot row at the bottom.
 *
 * ── RU-18: THE ALBUM IS A SET OF DIFFERENT FACES, AND NOTHING HERE APOLOGISES FOR IT ──────────
 * The generation anchor is dropped, so consecutive photos are different-looking women. There is no
 * grouping, no "most like her" ordering and no note on screen about it. Newest first, that is all.
 */

type Section = 'album' | 'chat'

interface Open {
  section: Section
  index: number
}

const PHOTO_PARAM = 'photo'

/** `album.pr0000000001`. `.` and not `:` because `URLSearchParams` leaves `.` unencoded. */
function encodePhoto(section: Section, id: string): string {
  return `${section}.${id}`
}

function decodePhoto(raw: string | null): { section: Section; id: string } | null {
  if (raw == null) return null
  const dot = raw.indexOf('.')
  if (dot <= 0) return null
  const section = raw.slice(0, dot)
  const id = raw.slice(dot + 1)
  if (id.length === 0) return null
  if (section !== 'album' && section !== 'chat') return null
  return { section, id }
}

export function NinaAboutScreen({
  avatar,
  album,
  gallery,
}: {
  avatar: NinaAvatarView
  album: readonly NinaAlbumPhoto[]
  gallery: readonly NinaGalleryPhoto[]
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState<Open | null>(null)
  const [question, setQuestion] = React.useState('')
  const [attaching, setAttaching] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  /** Whether THIS mount pushed the entry the parameter is sitting on. See `usePanelParam`. */
  const pushedRef = React.useRef(false)

  const albumViewer: ViewerPhoto[] = React.useMemo(
    () => album.map((photo) => ({ url: photo.url, kind: photo.kind, label: photo.label })),
    [album],
  )
  const galleryViewer: ViewerPhoto[] = React.useMemo(
    () => gallery.map((photo) => ({ url: photo.url, kind: photo.kind, label: photo.label })),
    [gallery],
  )

  /**
   * A deep link or a refresh of `/nina/about?photo=album.<id>` opens the viewer with no entry of
   * ours underneath it — which is exactly the state `pushedRef` is false for, so closing will
   * `replaceState` rather than navigating off the app.
   */
  React.useEffect(() => {
    const parsed = decodePhoto(new URLSearchParams(window.location.search).get(PHOTO_PARAM))
    if (parsed == null) return
    const list = parsed.section === 'album' ? album : gallery
    const index = list.findIndex((photo) => photo.id === parsed.id)
    /* A stale id closes rather than crashes — `lib/panel/param.ts`'s rule, for its reason. */
    if (index < 0) return
    setOpen({ section: parsed.section, index })
  }, [album, gallery])

  /** The back gesture pops our entry; the parameter disappears and the viewer closes with it. */
  React.useEffect(() => {
    const onPopState = () => {
      const parsed = decodePhoto(new URLSearchParams(window.location.search).get(PHOTO_PARAM))
      if (parsed == null) {
        pushedRef.current = false
        setOpen(null)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openAt = React.useCallback(
    (section: Section, index: number) => {
      const list = section === 'album' ? album : gallery
      const photo = list[index]
      if (photo == null) return
      setQuestion('')
      setNotice(null)
      setOpen({ section, index })
      const url = new URL(window.location.href)
      url.searchParams.set(PHOTO_PARAM, encodePhoto(section, photo.id))
      window.history.pushState(null, '', url)
      pushedRef.current = true
    },
    [album, gallery],
  )

  /** Paging inside the open section. `replaceState`, so twelve swipes are not twelve backs. */
  const onIndex = React.useCallback(
    (index: number) => {
      setOpen((current) => {
        if (current == null) return current
        const list = current.section === 'album' ? album : gallery
        const photo = list[index]
        if (photo == null) return current
        const url = new URL(window.location.href)
        url.searchParams.set(PHOTO_PARAM, encodePhoto(current.section, photo.id))
        window.history.replaceState(null, '', url)
        return { ...current, index }
      })
    },
    [album, gallery],
  )

  const close = React.useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false
      window.history.back()
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.delete(PHOTO_PARAM)
    window.history.replaceState(null, '', url)
    setOpen(null)
  }, [])

  /** R26. `''` is a valid question: attaching with nothing to ask must work. */
  const attach = React.useCallback(async () => {
    if (open == null || attaching) return
    const list = open.section === 'album' ? album : gallery
    const photo = list[open.index]
    if (photo == null) return
    setAttaching(true)
    setNotice(null)
    try {
      const result = await attachNinaPhotoToChat({
        kind: open.section === 'album' ? 'avatar' : 'image',
        id: photo.id,
        body: question,
      })
      if (!result.ok) {
        setNotice('Gagal kirim fotonya. Coba lagi.')
        return
      }
      /* Refresh first, so the pushed `/nina` renders the row that was just written. */
      router.refresh()
      router.push('/nina')
    } finally {
      setAttaching(false)
    }
  }, [album, attaching, gallery, open, question, router])

  const currentAlbumIndex = Math.max(
    0,
    album.findIndex((photo) => photo.isCurrent),
  )

  return (
    <>
      <div className="mb-7 flex flex-col items-center">
        <button
          type="button"
          onClick={() => openAt('album', currentAlbumIndex)}
          aria-label="Lihat foto profil Nina ukuran penuh"
          className="rounded-pill"
        >
          <NinaAvatar
            size="xl"
            src={avatar.src}
            natural={avatar.natural}
            crop={avatar.crop}
          />
        </button>
        <h1 className="mt-3 text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">
          Nina
        </h1>
        <p className="mt-1 text-[11px] font-medium text-ink-3">
          Reads every run. Says what she thinks.
        </p>
      </div>

      <section className="mb-7">
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Foto profil
        </h2>
        <NinaPhotoGrid
          cells={album.map(toCell)}
          onOpen={(index) => openAt('album', index)}
        />
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Media
        </h2>
        {gallery.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            Belum ada foto di chat. Kirim satu ke Nina, atau minta dia kirim.
          </p>
        ) : (
          <NinaPhotoGrid
            cells={gallery.map(toCell)}
            onOpen={(index) => openAt('chat', index)}
          />
        )}
      </section>

      {open != null && (
        <>
          <PhotoViewer
            photos={open.section === 'album' ? albumViewer : galleryViewer}
            index={open.index}
            onIndex={onIndex}
            onClose={close}
            subject="foto"
          />
          {/*
            The attach control sits ABOVE the overlay (z-70 against its z-60) rather than inside
            it, and that is deliberate: `PhotoViewer` is shared with three review surfaces that
            must not grow an F33 button, and its bottom row is already the dot pager. A fixed strip
            over it costs that component nothing.
          */}
          <div className="fixed inset-x-0 bottom-0 z-70 flex flex-col gap-2 bg-ink/95 px-4 pt-3 pb-[calc(1rem+var(--safe-bottom))]">
            {notice != null && (
              <p className="text-[12px] font-medium text-card/80" role="status">
                {notice}
              </p>
            )}
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={NINA_ATTACH_MAX_CHARS}
              placeholder="Tanya soal foto ini (opsional)"
              aria-label="Pertanyaan tentang foto ini"
              className="w-full rounded-field bg-card/10 px-3 py-2 text-[15px] text-card placeholder:text-card/50"
            />
            <Button size="md" onClick={attach} disabled={attaching}>
              {attaching ? 'Mengirim…' : 'Kirim ke chat'}
            </Button>
          </div>
        </>
      )}
    </>
  )
}

/** Both photo types are already `{ id, url, label }` plus, for the album, `isCurrent`. */
function toCell(photo: NinaAlbumPhoto | NinaGalleryPhoto): NinaGridCell {
  return {
    id: photo.id,
    url: photo.url,
    label: photo.label,
    isCurrent: (photo as NinaAlbumPhoto).isCurrent === true,
  }
}
```

**Impact:** the screen. `Button` is used at `size="md"` — **`ButtonSize` is `'md' | 'lg'` and there
is no `'sm'`**; phase 16 verified this and noted that a planner working from memory would have
written `size="sm"` throughout.

---

### Step 16: `app/nina/about/page.tsx` — the route

**File:** `app/nina/about/page.tsx` (new)
**Change:** the Server Component. Three awaits, no model call, no `loading.tsx` (D-4).

**Read before writing this:** `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
(a nested `page.tsx` under an existing route segment is the whole of the routing here — no
`layout.tsx` is added, so `app/layout.tsx` and `AppShell` supply the chrome),
`04-linking-and-navigating.md` (why the header avatar is a `<Link>` and why the viewer uses the
native History API instead), and `12-images.md` (why the committed PNG keeps `next/image` and a
Blob URL does not get one). Next 16.3.1, not the Next.js in training data.

**Code:**

```tsx
import { AppShell } from '@/components/ui/AppShell'
import { NinaAboutScreen } from '@/components/nina/NinaAboutScreen'
import { requireUserId } from '@/lib/auth/requireUserId'
import {
  albumPhotos,
  galleryPhotos,
  NINA_GALLERY_LIMIT,
  ninaAvatarView,
} from '@/lib/nina/album'
import { listNinaAvatars, listNinaMessageImages } from '@/lib/nina/queries'

/**
 * `/nina/about` — her detail page (R17), reached by tapping her avatar in the chat header.
 *
 * ── TWO INDEXED READS AND NOTHING ELSE ────────────────────────────────────────────────────────
 * `listNinaAvatars` reads `nina_avatars_user_created_idx`; `listNinaMessageImages` reads
 * `nina_message_images_user_created_idx` with no join, which is phase 1's stated reason for that
 * table existing rather than a `jsonb` column. No model call, so invariant 4 is satisfied
 * structurally: there is nothing here for the payload-boundary grep to object to.
 *
 * ── WHY THERE IS NO `loading.tsx`, HERE OR AT `app/nina/` ─────────────────────────────────────
 * D-4. One at `app/nina/` would wrap this route too, which is the specific thing phase 4 declined
 * to impose on a page it did not own; and this page's two index lookups resolve inside one paint,
 * so a skeleton would flash and be replaced. `app/(app)/loading.tsx`'s docstring records the
 * measured cost of getting that wrong in the other direction.
 *
 * ── THE CURRENT PHOTO IS TAKEN FROM THE ALBUM, NOT RE-QUERIED ─────────────────────────────────
 * `listNinaAvatars` already returns the row with `is_current`, so calling `getCurrentNinaAvatar`
 * here as well would be a second round trip for a row we are holding. `ninaAvatarView(null)` is
 * what an empty album means (D-2) and it is the same function the chat header uses, so the two
 * surfaces cannot disagree about which face is hers.
 */
export default async function NinaAboutPage() {
  const userId = await requireUserId()

  const [avatars, images] = await Promise.all([
    listNinaAvatars(userId),
    listNinaMessageImages(userId, { limit: NINA_GALLERY_LIMIT }),
  ])

  const current = avatars.find((row) => row.isCurrent) ?? null

  return (
    <AppShell>
      <NinaAboutScreen
        avatar={ninaAvatarView(current)}
        album={albumPhotos(avatars)}
        gallery={galleryPhotos(images)}
      />
    </AppShell>
  )
}
```

**Impact:** one new route. `AppShell` takes its default `bottomGap="tabs"`, so the tab bar is
present and `/nina` stays the selected tab — `AppShell.tsx` already admits `/nina`, and a nested
segment of an admitted path needs no change there. (If the tab highlight is computed by exact
match rather than prefix, that is a one-line `startsWith` in phase 4's file; verify at
implementation and fix it there, since phase 4 owns `TabBar`.)

---

### Step 17: `app/nina/page.tsx` — the avatar becomes a door

**File:** `app/nina/page.tsx` (phase 4's file, `phase-4.md:2026`)
**Change:** one read, one import, one `<Link>`, three props. Phase 4's handoff, discharged.

**Code — the two edited regions:**

```tsx
import Link from 'next/link'

import { ninaAvatarView } from '@/lib/nina/album'
import { getCurrentNinaAvatar, listNinaMessages } from '@/lib/nina/queries'
```

```tsx
export default async function NinaPage() {
  const userId = await requireUserId()
  /*
   * A second indexed read, not a model call: `getCurrentNinaAvatar` is a single-row lookup on the
   * partial unique index `nina_avatars_user_current_unq`. Invariant 4 is about model calls, and
   * this page still makes none — phase 12 adds `listOpenNinaImageJobs` here on the same argument.
   */
  const [rows, avatarRow] = await Promise.all([
    listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT }),
    getCurrentNinaAvatar(userId),
  ])
  const avatar = ninaAvatarView(avatarRow)

  const initial: ChatMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role === 'nina' ? 'nina' : 'user',
    body: row.body,
    dayISO: jakartaDayOf(row.createdAt),
    state: 'sent',
  }))

  return (
    <AppShell bottomGap="chat">
      <header className="mb-5 flex items-center gap-3">
        {/*
          R17's first tap level. `size-11` is already 44 px — the iOS tap-target floor — which
          phase 4 chose "for when phase 13 makes it a link", so no geometry changes here. A
          `<Link>` and not a `<button>`: it is a navigation, so it gets the platform's own
          long-press, middle-click and back behaviour for free, and Next 16 prefetches the route.
        */}
        <Link href="/nina/about" aria-label="Buka detail Nina" className="rounded-pill">
          <NinaAvatar size="md" src={avatar.src} natural={avatar.natural} crop={avatar.crop} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">Nina</h1>
          <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
            Reads every run. Says what she thinks.
          </p>
        </div>
      </header>

      <ChatScreen initial={initial} todayISO={todayInJakarta()} />
    </AppShell>
  )
}
```

**Impact:** her face is now whatever the album says it is, and tapping it opens her page. Phase 6's
`userId` prop on `ChatScreen` and phase 12's `<NinaImageJobWatcher>` element are untouched by this
edit — it changes only the header and the reads above it.

---

### Step 18: `app/api/cron/nina/route.ts` — one call, so a promise is kept even when he is not looking

**File:** `app/api/cron/nina/route.ts` (phase 10's file, its per-user body)
**Change:** one import and one awaited call, placed **before** phase 10's trigger sweep.

**Code:**

```ts
import { resolveNinaPromises } from '@/lib/nina/promises'
```

```ts
    /*
     * R19. Before the triggers, deliberately: a promise that settles here inserts a
     * `nina_avatars` row with `announced_at` NULL, and phase 10's `avatar_changed` trigger is
     * exactly "a current avatar nobody has mentioned". Running the sweep first means a photograph
     * that landed since the last tick is announced on THIS tick rather than the next one.
     *
     * Idempotent, so the five-minute cadence costs one indexed slot read on the common tick and
     * nothing else. It never posts a message — D-3, phase 10 is the only announcer.
     */
    try {
      const sweep = await resolveNinaPromises(userId)
      if (sweep.wrote) {
        console.log('[nina] promise sweep', {
          userId,
          fired: sweep.fired,
          settled: sweep.settled,
          expired: sweep.expired,
        })
      }
    } catch (error) {
      /* A promise sweep that throws must not cost the four triggers their tick. */
      console.warn('[nina] promise sweep failed', { userId, error })
    }
```

**Impact:** R19 works whether or not he opens the app. Phase 10's own four triggers are untouched
and its route's `maxDuration = 60` is unchanged — the sweep's own budget is 20 s and a `fire` under
RU-20 is a `workflow_dispatch`, not a generation.

---

## Verification

**Build:**

```
npm run format && npm run typecheck && npm run lint && npm run build
```

`format` first, not last: `prettier-plugin-tailwindcss` sorts class strings and this phase writes a
lot of them. `build` is included because Step 16 adds a route and Step 17 adds a `<Link>` — a
prerender error on a new segment is not something `typecheck` sees.

**Tests:**

```
npm test
npm test -- lib/nina/promise.test.ts     # the evaluator, 24 cases
npm test -- lib/nina/album.test.ts       # the view models, 21 assertions
npm test -- lib/nina/crop.test.ts        # moved from phase 15 (D-1)
npm test -- lib/photos/gallery.test.ts   # UNCHANGED — proof it was reused, not reimplemented
```

**Guards:**

```
npm run ci:llm-payload-boundary   # no model call in a render path (invariant 4)
npm run ci:openrouter-boundary    # lib/nina/ is exempt; app/ and components/ are not
```

`ci:llm-payload-boundary` is the one that matters here. `app/nina/about/page.tsx` awaits
`requireUserId`, `listNinaAvatars` and `listNinaMessageImages`; `app/nina/page.tsx` adds
`getCurrentNinaAvatar`. None is a guarded symbol, and `resolveNinaPromises` — which *does* reach a
generator — is called from a route handler and from nothing else. **If the reconciler adds
`resolveNinaPromises` to `GUARDED_CALLS`, its sanctioned set is exactly
`{ lib/nina/promises.ts, app/api/cron/nina/route.ts }`** and that is the better outcome, because it
makes "never from a page" a CI fact rather than a paragraph.

**Manual check, in order:**

1. `/nina` — her face is the current album photo, or `avatar-001.png` on an empty album. Tapping it
   opens `/nina/about`. Back returns to the chat at the same scroll position.
2. `/nina/about` — the hero, then "Foto profil", then "Media". Tap the hero: full screen. Swipe
   left off the LAST album photo: it wraps to the first. Swipe right off the FIRST: it wraps to the
   last (this is `stepIndex`'s double modulo, and it is the specific thing a hand-rolled viewer
   gets wrong). Pinch: the browser's own zoom, and a horizontal drag while zoomed pans instead of
   paging.
3. The back gesture with a photo open closes the photo and leaves you on the album — not on
   `/nina`, and not off the app.
4. Reload `/nina/about?photo=album.<id>`: the viewer opens on that photo. Close: the parameter goes
   and you stay on the page.
5. "Media" contains photos from BOTH parties — one he uploaded (`kind='upload'`) and one she
   generated (`kind='generated'`) — in one list, newest first.
6. Open one of her album photos, leave the question box empty, tap "Kirim ke chat". You land on
   `/nina` with the photo as your own message and her reply under it. Repeat with
   *"ini pas lari kapan na?"* typed in: her reply is about what is in the picture.
7. Ask her *"lah lo ganti foto profil na, itu lagi dimana?"*. She answers with a place and a
   moment consistent with `nina_avatars.description`. Ask again two turns later: a different
   telling of the same story, not the same sentence.
8. **The promise, end to end.** Tell her *"kalo gw lari 10km besok, lo ganti foto profile ya"* and
   let her agree. Confirm `pending_promises` holds one entry with `metric='distance_km_total'`,
   `target=10`, `byDate` = tomorrow. Then:
   - **met** — commit and review a 10 km run dated tomorrow, hit the cron. `pending_promises`
     gains `jobId`/`firedOn`/`attempts:1` and `status` stays `pending`. When the worker finishes, a
     `nina_avatars` row appears with `is_current`, `source='generated'`, `announced_at` NULL. Next
     cron tick: `status='met'`, `resolvedOn` = today, and **phase 10** posts her message.
   - **not met** — with no run, the cron writes nothing until the deadline plus two days, then
     `status='expired'`. She never mentions it and no avatar is generated.
   - **failed** — force `generateNinaAvatar` to refuse (unset `OPENROUTER_API_KEY`, or exhaust the
     daily cap). `attempts` increments, `jobId` stays null, `status` stays `pending`, and **no
     message is posted**. Three days later it expires.
9. `/admin/nina` (phase 15, when it lands) frames a photo; the chat header and the hero move with
   it, because both go through `ninaCropStyle`.

**Exit criteria:**

- `/nina/about` renders; the header avatar links to it; her avatar opens full-screen and swipes,
  wrapping in both directions.
- Every image from both parties appears in the gallery, newest first, in one list.
- The album shows every avatar she has ever had, with the current one ringed.
- A zoomed album photo can be attached to the chat with or without a question, and she answers it.
- Asked where she is in her photo, she tells a story consistent with `nina_avatars.description`
  and with the conversation, and does not repeat it verbatim.
- A promise stated and then **met** produces a new avatar plus an unprompted message about it.
- A promise **not met** produces neither, and expires rather than haunting the slot.
- A **failed** generation consumes nothing and announces nothing.
- `lib/photos/gallery.ts` and `lib/photos/gallery.test.ts` are **unmodified**, and `git diff --stat`
  proves it.

---

## Handoffs

**1. Reconciler — three index amendments.**
- **Phase 13's `Satisfies` should read `R17, R19, R25, R26`.** R20 is listed there and RU-18
  removed it; phase 1 keeps "`nina.png` is her initial avatar" and nothing else of R20 survives.
- **Phase 13's file count** is `~22`, not `~13`.
- **`lib/nina/crop.ts` and `lib/nina/crop.test.ts` move from phase 15 to phase 13** (D-1). Phase
  15's Steps 1 and 2 become no-ops; everything else in phase 15 is unchanged.

**2. Phase 15 — three edits this phase's rulings imply.**
- Delete `NINA_AVATAR_FALLBACK_SRC` from `components/admin/CircleFrame.tsx` and import it from
  `@/lib/nina/album`. That is phase 15's own handoff 3, resolved in favour of `lib/`.
- Its Steps 1–2 are no-ops (above).
- Its assumption that `getCurrentNinaAvatar() === null` means the committed constant is
  **confirmed** (D-2). No seed row exists and none should be inserted.

**3. Phase 10 — two names to reconcile, and one it must not change.**
Phase 10's Requires 5 asks for `getUnannouncedCurrentAvatar` / `markAvatarAnnounced`; phase 1
exports `getUnannouncedCurrentNinaAvatar` / `markNinaAvatarAnnounced`. **This is a pre-existing
phase 1 / phase 10 spelling disagreement, not one this phase introduces** — this phase calls
neither. Phase 1 owns the file, so phase 1's spelling should win and phase 10's two call sites
change. What phase 10 must **not** change is that it is the announcer: D-3 is decided, its
`avatar_changed` trigger stays, and nothing in this phase sets `announced_at`.

**4. Phase 1 — three optional fields on `NinaPendingPromise`.** `jobId?`, `firedOn?`, `attempts?`,
argued in "The promise state machine". `jsonb`, so no migration. All optional, so phase 5 compiles
untouched.

**5. Phase 6 — the message list stays non-interactive, and that is deliberate.** `ChatImages` now
takes `onOpen`, but `MessageList` does not pass it. Opening a viewer from inside a bubble is a
third gesture on a surface phases 6, 7 and 8 all own slots in (image, reply quote, run card), and
R17 asked for the detail page rather than for a lightbox in the thread. Wiring it is two lines in
`MessageList.tsx` plus viewer state in `ChatScreen`, and it should be its own card so the
interaction with phase 7's quote taps gets thought about once.

**6. A "go to this message" affordance in the gallery is not built.** `NinaGalleryPhoto.messageId`
is carried for it, and phase 8 already chose the idiom (`?at=<msgId>~<offset>` with
`history.replaceState`). It is left out because phase 8 owns that parameter's codec and its
scroll-restoration arithmetic (`lib/nina/scroll.ts`), and a second writer of `?at=` in this phase
would be exactly the "two surfaces, one parameter" mistake `lib/panel/param.ts` warns about. One
card, phase 8's file.

**7. `scripts/blob-reap.mjs` still only knows `shots/`.** This phase creates no blobs at all — it
reads them — but it is the fourth reader under `nina/` and the third phase to file this. Phases 6,
12, 14 and 15 all write there. One card.

**8. A per-run distance metric, if the sum ever reads wrong.** `distance_km_total` sums a two-a-day
(Step 5's argument). If *"kalo lo lari 10km"* should mean one continuous 10 km, that is a new
`NinaPromiseMetric` and it is **phase 5's** to coin, because phase 5 decides which metric a
sentence becomes. `conditionMet` gains one `case`.

**9. Not done, deliberately, each a card rather than a TODO:** deleting a chat photo from the
gallery (destructive, and phase 15 owns album deletion); a "generate one now" button on this page
(phase 12 owns the queue, the cap and the failure copy); pinch-to-zoom implemented in JS (the
browser's is better and `decideSwipe` exists to protect it); a per-photo caption; and promises with
a metric this phase cannot decide being *asked about* by her rather than left pending — phase 5's
escape hatch already permits it and phase 2's prompt is where it would live.

---

## Rollback

Additive except for nine edits, so backing it out is mechanical.

1. `git revert` the phase commit. That removes the thirteen new files
   (`lib/nina/{crop,crop.test,album,album.test,promise,promise.test,promises,avatartools,albumActions,albumActions.test}.ts`,
   `components/nina/{NinaPhotoGrid,NinaAboutScreen}.tsx`, `app/nina/about/page.tsx`) and restores
   the nine edited ones. `/nina/about` 404s; `/nina` renders phase 4's hardcoded avatar again.
2. **Check three of the nine reverts by hand**, because they are files several phases edit:
   `lib/nina/actions.ts` must keep phase 12's `toolSet: NINA_CHAT_TOOL_SET` and phase 6's
   `imageTickets`; `app/api/cron/nina/route.ts` must keep phase 10's four triggers; and
   `components/nina/ChatImages.tsx` must keep phase 6's `bg-ink-3/20`.
3. **If phase 15 has already landed, `lib/nina/crop.ts` must NOT be reverted** — phase 15's
   `CropStudio`, `CircleFrame` and `saveNinaAvatarCropAction` all import it. Revert everything else
   and keep that one file; it is pure and imports nothing, so it survives alone. This is the one
   coupling D-1 creates and it is the price of fixing the ordering conflict.
4. **Three things survive the revert and are data, not code:**
   - `nina_avatars` rows this phase's sweep caused to be generated, including whichever is
     `is_current`. Her face stays whatever last landed; `public/nina/avatar-001.png` reappears only
     if the album is emptied by hand.
   - `pending_promises` entries carrying `jobId` / `firedOn` / `attempts` and `status: 'met'` or
     `'expired'`. **They are inert after a revert** — phase 5's merge matches by `id` and leaves
     unknown fields alone, and nothing else reads them. To clear the resolutions:
     `update nina_memory_slots set value = jsonb_set(value, '{promises}', '[]'::jsonb) where key = 'pending_promises';`
     which is destructive of her memory of having promised anything, so prefer leaving them.
   - `nina_message_images` rows written by an "attach to chat" send. They are ordinary chat images
     and phase 6's renderer draws them; nothing about them is phase-13-shaped.
5. No migration, no `package.json` change, no new environment variable, no `proxy.ts` edit, and no
   blob written. Phase 12's GitHub Actions workflow is untouched.

---

## Decisions on the open items

None outstanding. Every decision this phase was handed is ruled on above — `lib/nina/crop.ts`'s home (D-1), the
seed row (D-2), the announcer (D-3), `loading.tsx` (D-4) — plus the four that were not asked for
and would otherwise have been discovered during implementation: the two-stage promise machine and
its landing test, the sum semantics of `distance_km_total`, the ticket-free attach path, and the
one-word tool-set swap that keeps this phase out of a file being rewritten.
