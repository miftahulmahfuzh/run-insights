# Code Analysis: Detail foto jump — from "the bubble that asked" to "the earliest bubble that carries the photo"

**Type:** Feature Update
**Date:** 2026-09-11 11:31 WIB
**Session ID:** 20260911-113127
**Plan:** `JOB_JUMP_PHOTO_BUBBLE_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/job-jump-photo-bubble` — branch `feature/job-jump-photo-bubble` (base `origin/main` @ `f1b0394`; local `main` == `origin/main`, tree clean)

---

## User Input

### Original User Request
> pada halaman Proses foto -> Detail foto. bisa ga ya tombol ke pesan pemicu ini, logicnya diganti jadi:
> the earliest chat bubble accross all chat sessions that attached this image (it could be nina's bubble, or user's own bubble)

### User-Provided Context
None beyond the prose. "Proses foto" is `/nina/jobs`; "Detail foto" is `/nina/jobs/[id]` (`ScreenHeader title="Detail foto"`). "tombol ke pesan pemicu" is the icon-only `Buka chat-nya` button on that page — the jump control this repo's prior plan sets (`JOB_PHOTO_LINK_PLAN.md`, `20260910-090042_code_analyzer.md`) built to target `args.replyToId`. "this image" is the job's photograph — the same fact the page's full-screen photo icon already resolves.

### User-Provided Files
None marked `@`.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | On Detail foto, the jump button's target-selection logic becomes: the **earliest chat bubble, across ALL chat sessions, whose message attached this job's image** — Nina's bubble or the runner's own bubble alike. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: The jump button on `/nina/jobs/[id]` currently targets `args.replyToId` — the message that *asked* for the photograph, resolved through one owner-scoped read into its session. That target fails in the field (MEASURED: fourteen production `kind='image'` rows whose `args.replyToId` resolves to nothing — the common case on this screen, not an edge), and it points at a bubble that does not show the photograph. The user replaces the selection rule: resolve the job's photograph (the existing job→photo chain), find **every live bubble that attached that photograph** — the original carrier bubble (Nina's, `nina_messages.turn_id = jobId`) *and* every reference bubble (the runner's own re-attach, `nina_message_images.source_image_id`), in any session — and target the **earliest** one.

**Success Criteria**:
- A completed selfie job's jump button opens `/nina?s=<earliestSession>&jump=<earliestMessage>` and flashes that bubble (the existing landing — unchanged — already accepts any session).
- A job whose `args.replyToId` dangles (the fourteen measured rows) but whose photograph still lives in a bubble now gets a WORKING button — today it gets the `gone` sentence.
- An avatar job, and any selfie job whose photograph does not resolve into a live bubble, gets the refusal sentence — never a button to nowhere.
- `args.replyToId` and its second owner-scoped read leave the jump path entirely; no schema migration; `vitest` + `tsc --noEmit` green.

**Key Considerations**:
- **"This image" = the job's photograph row** — `getNinaJobPhoto`'s row, the same fact the photo icon uses. That read resolves *through the carrier message* (`nina_messages.turn_id`), so a photograph whose carrier is gone (admin Remove, single-message delete, session removal) resolves to nothing and there is no jump — the sentence.
- **References point at the ORIGINAL, flat** — `ninaPhotoProvenance` (`lib/nina/attach.ts`) flattens `source_image_id ?? id`, so "copy of a copy" names the original row. The candidate set is therefore exactly two predicates deep: `i.id = photo OR i.source_image_id = photo`. No recursion.
- **"Earliest" = conversation order** — `nina_messages.seq` (bigserial), which the schema states is "the total order of the whole conversation"; sessions slice it. `MessageList` renders in `seq` order. In practice the carrier bubble (Nina's) is the earliest candidate — every re-attach is written later — but the rule as specified takes the minimum across all candidates, which is what makes a runner's bubble win whenever it *is* first.
- **A bubble with no message is not a bubble** — `message_id` is nullable (`ON DELETE SET NULL`); the read joins to `nina_messages`, which skips NULLs by construction.
- **Consequence, stated plainly**: jobs with no photograph (queued/running/failed, photo removed, session removed) show the refusal sentence where today a failed-but-requested job could still jump to the request. Decided per the user's replacement language — see the plan index's *Decisions*.

---

## Analysis Scope

### Explicitly Mentioned Files
None. Named surfaces: `/nina/jobs` (Proses foto), `/nina/jobs/[id]` (Detail foto), the `Buka chat-nya` jump button.

### Discovered Related Files
- `lib/nina/jobview.ts` — `planJobJump` (:423), `NinaJobJump` (:379), `NINA_JOB_JUMP_NOTE` (:443), `ninaJumpHref` (:90), `JOB_JUMP_PARAM` (:68), `nextSoftNavJump` (:559) — the jump vocabulary
- `lib/nina/imagejobs.ts` — `getNinaImageJobDetail` (:973) resolves `replySessionId` via a second owner-scoped read; `toJobRecord` (:922) parses `args.replyToId` off the jsonb
- `lib/nina/queries.ts` — `getNinaJobPhoto` (:4433, §12 the job→photograph link); `isOriginalPhoto` (:2008) and its "reads that render must NOT filter" rule (:4149-4165)
- `app/nina/jobs/[id]/page.tsx` — the server page; decides jump (:111) and photo (:82) from owner-scoped reads
- `components/nina/NinaJobDetail.tsx` — renders the jump row (:150-164); `NINA_JOB_JUMP_NOTE` lookup
- `lib/nina/attach.ts` — `ninaPhotoProvenance` (:~200): reference rows point at the ORIGINAL
- `lib/db/schema.ts` — `nina_message_images` (:1057: nullable `message_id`, `source_image_id` flattened, `kind`), `nina_messages` (:867: `seq` bigserial = total order, `turn_id` unindexed by design)
- `tests/nina.jobview.test.ts` — `planJobJump` arms (:214-263) + note sentences
- `tests/nina.photoRefs.test.ts` — fakeDb SQL-shape assertions; `getNinaJobPhoto` describe (:268), render-read absence (:121)
- `tests/support/fakeDb.ts` — the recording driver the SQL-shape tests assert against

---

## Current Dataflow

### Entry Point: `/nina/jobs/[id]` (Detail foto)

**Location:** `app/nina/jobs/[id]/page.tsx:66`
**Trigger:** GET (server render)
**Input:** `{ params: Promise<{ id: string }> }`; `isValidId` shape-check, then 404-on-null
**Next Step:** `getNinaImageJobDetail(userId, id)` → `planJobJump(...)` → `NinaJobDetail`

### Processing Chain

1. **`getNinaImageJobDetail(userId, jobId)`**
   - **Location:** `lib/nina/imagejobs.ts:973`
   - **Read 1:** `nina_turns` WHERE `user_id`, `id`, `kind='image'`, `deleted_at IS NULL` — the job row (a claim owner-scoped into a fact)
   - **Transform:** `toJobRecord` (:891) parses `args.replyToId` off the jsonb (:922)
   - **Read 2 (the trigger-message resolution):** if `replyToId !== null`, `getNinaMessagesByIds(userId, [replyToId])` (:997) — owner-scoped; deleted message, removed session, or foreign id → empty → `replySessionId: null` (:995-998)
   - **Output:** `NinaImageJobDetail = record & { replySessionId }`

2. **`planJobJump(input)`**
   - **Location:** `lib/nina/jobview.ts:423`
   - **Input:** `{ purpose, replyToId, replySessionId, sessionParam }`
   - **Transform:** `avatar && replyToId===null → 'avatar'`; `replyToId===null → 'no-message'`; `replySessionId===null → 'gone'`; else `'ready'`
   - **Output:** `NinaJobJump`; `ready` builds `ninaJumpHref` (:90) = `/nina?s=<replySessionId>&jump=<replyToId>`

3. **`getNinaJobPhoto(userId, jobId)`** — the photograph fact (page :82, avatar-skipped)
   - **Location:** `lib/nina/queries.ts:4433` (§12)
   - **Transform:** `nina_message_images ⋈ nina_messages ON message_id` WHERE both `user_id`s + `turn_id = jobId` + `kind='generated'`, ORDER `created_at DESC, id DESC`, LIMIT 1
   - **Output:** `{ id }` — the ONLY job→photo key the schema has (the image row carries no job id)

4. **Render (`components/nina/NinaJobDetail.tsx:150-164`)**
   - `jump.kind === 'ready'` → icon `ButtonLink` (`aria-label="Buka chat-nya"`, MessageCircle glyph)
   - otherwise → the sentence from `NINA_JOB_JUMP_NOTE[jump.kind]` (:443 — `avatar` / `no-message` / `gone`)
   - `photo.kind === 'ready'` → the full-screen photo icon beside it (independent)

5. **Landing side (UNCHANGED by this work)**
   - `/nina?s=<session>&jump=<message>` → `ChatScreen` keyed by session; `nextSoftNavJump` (`jobview.ts:559`) one-shot consumption; flash `nina-flash-blink`. Session-agnostic — any session id on the link works.

### Data Persistence
**Read-only feature.** No write, no cache. Tables touched: `nina_turns` (job + `args` jsonb), `nina_messages` (`turn_id` carrier, `seq`, `session_id`), `nina_message_images` (`message_id` nullable, `kind`, `source_image_id`).

### Exit Points
- `ready` → `ButtonLink` href `/nina?s=…&jump=…` (deep link into any chat, bubble pinpointed + flashed)
- non-ready → dashed refusal sentence (`NINA_JOB_JUMP_NOTE`)

---

## Key Data Structures

### Union: `NinaJobJump`
**Location:** `lib/nina/jobview.ts:379`
**Arms:** `ready {href}` · `avatar` · `no-message` · `gone` — the first a control, the rest sentences in `NINA_JOB_JUMP_NOTE` (:443)
**Used In:** `NinaJobDetail` prop; page :111; tests :214

### Read: `getNinaJobPhoto`
**Location:** `lib/nina/queries.ts:4433`
**Projection:** `{ id }` deliberately — "widen only with a consumer" (its header)
**Used In:** page :82 → `planJobPhoto`; asserted in `tests/nina.photoRefs.test.ts:268`

### Column pair: `nina_message_images.message_id` / `source_image_id`
**Location:** `lib/db/schema.ts:1096` / `:1145`
**Facts:** `message_id` nullable (`SET NULL` — a session delete orphans the photograph, and "NULL is a real, permanent state"); `source_image_id` is flattened by `ninaPhotoProvenance` (`lib/nina/attach.ts`) so every reference names the ORIGINAL row
**Used In:** every bubble render read (no reference filter — invariant 2), the collection listings (filter ON), and — proposed — the new earliest-bubble read

### Column: `nina_messages.seq`
**Location:** `lib/db/schema.ts:~915` (`bigserial`)
**Fact:** "the total order of the whole conversation"; sessions slice it; `MessageList` orders by it
**Used In:** every message ordering; proposed as "earliest"'s sort key

---

## Dependencies

- `SESSION_PARAM` (`lib/nina/active.ts`) — threaded into `ninaJumpHref` by the page (one spelling)
- `vitest` `environment: 'node'` — the reason `planJobJump` is a pure function in `lib/`, not logic in the client component
- `tests/support/fakeDb.ts` — records generated SQL; the new read's tests assert SQL shape (`whereOf` slices the WHERE)
- Fresh worktree: needs `.env.local` copied and dependencies installed (`lib/env.ts` validates at load) before vitest/tsc run
- No new Next.js API touched — the page already follows the Next 16 conventions in `node_modules/next/dist/docs/` (`PageProps`, awaited `params`)

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `planJobJump` | lib/nina/jobview.ts:423 | def | lib/nina |
| `planJobJump` | app/nina/jobs/[id]/page.tsx:111 | call | app/nina |
| `planJobJump` | tests/nina.jobview.test.ts:214+ | test | tests |
| `NinaJobJump` | lib/nina/jobview.ts:379 | def | lib/nina |
| `NINA_JOB_JUMP_NOTE` | lib/nina/jobview.ts:443 | def | lib/nina |
| `NINA_JOB_JUMP_NOTE` | components/nina/NinaJobDetail.tsx:162 | call | components/nina |
| `NINA_JOB_JUMP_NOTE` | tests/nina.jobview.test.ts:258,263 | test | tests |
| `ninaJumpHref` / `JOB_JUMP_PARAM` | lib/nina/jobview.ts:90 / :68 | def | lib/nina |
| `replyToId` (jsonb parse) | lib/nina/imagejobs.ts:922 | def/parse | lib/nina |
| `replySessionId` (resolve) | lib/nina/imagejobs.ts:995-998 | def | lib/nina |
| `getNinaMessagesByIds` | lib/nina/queries.ts (def) · imagejobs.ts:997 · sessionResolve.ts:68 · messageActions.ts:91 · imagerun.ts:299 · admin/chatPhotoActions.ts:717 | call | lib/nina, lib/admin |
| `getNinaJobPhoto` | lib/nina/queries.ts:4433 | def | lib/nina |
| `getNinaJobPhoto` | app/nina/jobs/[id]/page.tsx:82 | call | app/nina |
| `getNinaJobPhoto` | tests/nina.photoRefs.test.ts:121,127,268+ | test | tests |
| `planJobPhoto` / `NinaJobPhoto` | lib/nina/jobview.ts:514 / :476 | def | lib/nina |
| `ninaPhotoProvenance` (flatten) | lib/nina/attach.ts:~200 | def | lib/nina |
| `isOriginalPhoto` / render-read rule | lib/nina/queries.ts:2008 / :4149-4165 | def/doc | lib/nina |
| `nina_message_images` (schema) | lib/db/schema.ts:1057 | def | lib/db |
| `nina_messages.seq` (total order) | lib/db/schema.ts:~915 | def | lib/db |
| `nextSoftNavJump` (landing) | lib/nina/jobview.ts:559 · ChatScreen.tsx | def/call | lib/nina, components |
| redo path (`replyToId` stays in args) | lib/nina/jobActions.ts:122 · imagerun.ts:299,554 · worker :965,1023 | call | lib/nina, scripts |

---

## Impact Points (files that WILL need changes)
1. `lib/nina/queries.ts` — one new owner-scoped read beside `getNinaJobPhoto` (§12): the earliest live bubble over the photograph's original + reference rows — **phase 1**
2. `lib/nina/jobview.ts` — `planJobJump` re-inputs (`bubble` replaces `replyToId`/`replySessionId`), `NinaJobJump` loses an arm, `NINA_JOB_JUMP_NOTE` rewritten, docstrings — **phase 1**
3. `lib/nina/imagejobs.ts` — `replySessionId` and its second read removed from the detail read — **phase 1**
4. `app/nina/jobs/[id]/page.tsx` — wire the new read into `planJobJump`; docstrings — **phase 1**
5. `components/nina/NinaJobDetail.tsx` — header comments (three kinds → two; the fourteen-row fact now argues the button gains a target) — **phase 1**
6. `tests/nina.jobview.test.ts` — `planJobJump` arms + note sentences rewritten — **phase 1**
7. `tests/nina.photoRefs.test.ts` — SQL-shape tests for the new read, including the absence assertion (a reference IS a valid target; no `isOriginalPhoto` here) — **phase 1**

**This document describes. The plan files prescribe.**
