# Phase 16: Admin: the memory editor

**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R24 — *"maybe create another page runins.site/admin/memory : in this page, admin can
see the persistent memory that is collected for each user. and admin can edit them as well. (this
way, i can add some important data of myself through a backdoor in admin page) , and i can edit
inaccurate / stale data about myself that is currently saved in memory."*
**Depends on:** Phase 1 (schema + memory queries), Phase 5 (slot vocabulary + canonicalisers),
Phase 15 (admin gate, admin layout, `AdminNav`, `lib/admin/schema.ts`)
**Difficulty:** NORMAL
**Package:** `app/admin/memory`, `lib/admin`

---

## Goal

`/admin/memory` exists: for any user, every `nina_memory_slots` row and every
`nina_memory_facts` row is on screen, labelled with who wrote it, and editable — a slot value can
be corrected, a stale ledger fact can be retracted or purged, and a slot or a fact can be typed in
by hand with nothing in the chat behind it. Every row this page writes carries
`source: 'admin'` and `source_message_id: null`, which is what makes phase 5's protections fire:
an admin ledger row is unreachable from the distiller by construction, and an admin `replace`-slot
is deferred rather than overwritten. Nothing this page does can silently lose text that R4
promised to keep.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No file, no symbol, no config key, no migration.

**Renames:** nothing.

**Creates — `lib/admin/memoryModel.ts`** (new file; **pure, ZERO value imports** — only
`import type` — so it is client-bundle-safe, the `lib/nina/crop.ts` / `lib/photos/gallery.ts` rule):

- constants `ADMIN_FACT_TEXT_MAX = 400`, `ADMIN_RETRACTION_TEXT_MAX = 1000`,
  `ADMIN_SLOT_VALUE_MAX = 400`, `ADMIN_LEDGER_PAGE = 200`, `ADMIN_PURGE_CONFIRMATION = 'PURGE'`,
  `ADMIN_FACT_CATEGORIES` (the seven, `as const satisfies readonly NinaFactCategory[]`)
- types `SlotEditKind`, `SlotProtection`, `SlotCard`, `FactCard`, `FactPermissions`,
  `RetractionInput`, `SlotRetirementInput`
- functions `factPermissions(row)`, `composeRetraction(input)`, `composeSlotRetirement(input)`,
  `isPurgeConfirmed(raw)`

**Creates — `lib/admin/memoryVocab.ts`** (new file; **the only file in this phase that imports
`lib/nina/memory.ts`**, and it imports it as a reader — no key is coined, no policy redefined, no
second canonicaliser written). Used by the page, the actions and the test; never by a component:
`slotEditKind(key)`, `slotProtection(key, origin)`, `describeSlot(key)`, `slotFactCategory(key)`,
`canonicaliseSlotValue(key, raw)`, `buildSlotCards(rows)`; type `SlotCanonicalisation`.
The split from `memoryModel.ts` is deliberate and argued in that file's header: the client
components need the bounds and the category list, and pulling `NINA_SLOT_SPECS` (which reaches zod
and `lib/db/schema.ts`) into a browser bundle to render a label is not acceptable.

**Creates — `lib/admin/memoryStore.ts`** (`server-only`): **the single choke point where
`source: 'admin'` is applied.** Exports `adminUpsertSlot`, `adminDeleteSlot`, `adminAppendFact`,
`adminUpdateFact`, `adminDeleteFact`, `adminReadSlots`, `adminReadFacts`, `adminReadSlot`; types
`AdminFactDraft`, `AdminSlotDraft`. Its write parameter types **omit `source` and
`sourceMessageId`**, so no caller can pass `'distilled'` even by accident, and it is the only file
in the phase that names phase 1's memory writers.

**Creates — `lib/admin/users.ts`** (`server-only`): `listAdminUsers()`, `getAdminUser(userId)`;
types `AdminUserRow`. **`listAdminUsers()` is deliberately unscoped** — it *is* the user picker —
and it lives here rather than in `lib/db/queries.ts` so that file's "every export takes `userId`
first" invariant stays literally true and `scripts/check-data-layer-invariants.mjs` needs no new
`ALLOWED_UNSCOPED` entry. Every read *after* the pick is `userId`-first (invariant 7).

**Creates — `lib/admin/memoryActions.ts`** (`'use server'`): eight Server Actions, all returning
one shape.

```ts
export interface AdminMemoryResult {
  ok: boolean
  error?: string
  /** What the row now says, so the client can show the canonical form without a refetch. */
  canonical?: string
  /** One sentence describing what else was written (the ledger record a retraction left). */
  note?: string
  /** The id of a row this action created. */
  id?: string
}

saveSlotAction(input: { userId: string; key: string; value: string }): Promise<AdminMemoryResult>
recordSlotAsFactAction(input: { userId: string; key: string; value: string }): Promise<AdminMemoryResult>
retireSlotAction(input: { userId: string; key: string; reason: string }): Promise<AdminMemoryResult>
removePendingPromiseAction(input: { userId: string; promiseId: string }): Promise<AdminMemoryResult>
insertFactAction(input: { userId: string; category: string; text: string; confidence: number }): Promise<AdminMemoryResult>
editFactAction(input: { userId: string; id: string; category: string; text: string; confidence: number }): Promise<AdminMemoryResult>
retractFactAction(input: { userId: string; id: string; replacement: string }): Promise<AdminMemoryResult>
purgeFactAction(input: { userId: string; id: string; confirm: string }): Promise<AdminMemoryResult>
```

**Creates — `app/admin/memory/page.tsx`** (`PageProps<'/admin/memory'>`,
`export const dynamic = 'force-dynamic'`). Route path is exactly **`/admin/memory`**; the selected
user is a search param, **`?user=<userId>`**, defaulting to the signed-in admin's own `userId`.

**Creates — `components/admin/MemorySlots.tsx`** (`'use client'`): `MemorySlots`. Consumes
`SlotCard` from `memoryModel.ts`; declares no type of its own.
**Creates — `components/admin/MemoryLedger.tsx`** (`'use client'`): `MemoryLedger`. Consumes
`FactCard` from `memoryModel.ts`.
**Creates — `components/admin/UserPicker.tsx`** (server-rendered, no `'use client'`): `UserPicker`.
None of the three imports `lib/admin/memoryVocab.ts`, `lib/nina/memory.ts` or `lib/db/schema.ts` as
a value — the page builds every card server-side.
**Creates — `tests/admin.memory.test.ts`**: the pure model, the retraction composer, the
canonicalise round trip, and the structural assertion that `source: 'admin'` cannot be forgotten.

**Modifies — `lib/admin/schema.ts`** (phase 15's file, **appended at the end**, nothing existing
touched): `userIdSchema`, `slotKeySchema`, `slotEditSchema`, `factInsertSchema`, `factEditSchema`,
`factRetractSchema`, `factPurgeSchema`, `promiseRemoveSchema`, `slotRetireSchema`; types
`SlotEdit`, `FactInsert`, `FactEdit`, `FactRetract`. Appended rather than put in a second file for
the reason phase 15 gave for appending to `lib/nina/queries.ts`: two homes for one concern is worse
than one additive edit to a landed file.

**Modifies — `components/admin/AdminNav.tsx`**: **one entry in the `LINKS` array**
(`{ href: '/admin/memory', label: 'Memory' }`). Nothing else in that file changes — phase 15
reserved exactly this edit.

**Modifies — `app/admin/page.tsx`**: **one `<Card>` added** inside the existing
`grid gap-4 sm:grid-cols-2`, plus the two counts it shows. Phase 15 reserved exactly this edit
("Phase 16 adds a second card for `/admin/memory`").

**Signature changes:** none, to any existing exported symbol, anywhere.

**Requires (from earlier phases):**

- **Phase 1 — `lib/nina/queries.ts` exports** `getNinaMemorySlots(userId)`,
  `getNinaMemorySlot(userId, key)`, `upsertNinaMemorySlot(userId, NinaSlotUpsert)`,
  `deleteNinaMemorySlot(userId, key)`, `listNinaMemoryFacts(userId, { limit })`,
  `appendNinaMemoryFacts(userId, rows)`, `updateNinaMemoryFact(userId, id, patch)`,
  `deleteNinaMemoryFact(userId, id)` — with the bodies at `phase-1.md:1666-1826`. **This phase is
  the only caller of the last four**, exactly as phase 1's docstrings say.
  **RULING A2 — all eight names and signatures above are checked, one by one, against the
  reconciler's canonical list of phase 1's exports, and all eight match.** In particular
  `listNinaMemoryFacts` takes an **options object**, `listNinaMemoryFacts(userId, opts: { limit:
  number })`, which is how this plan already spells it here, in §1, in Step 5's
  `adminReadFacts` and in the ledger-paging handoff — a bare `limit` number would not typecheck.
  Nothing in this phase names any of the losing spellings the ruling struck (`listNinaMemorySlots`,
  `insertNinaMemoryFact`, `countNinaMessages`), because this phase never wanted them.
- **Phase 1 — `lib/db/schema.ts` exports** `NinaMemorySource = 'distilled' | 'admin'`,
  `NinaFactCategory` (the seven values), `NinaSlotValue`, `NinaPendingPromise`,
  `NinaPendingPromisesSlot`, `NINA_SLOT_PENDING_PROMISES = 'pending_promises'`, and
  `nina_memory_slots.source_message_id` / `nina_memory_facts.source_message_id` are **NULLABLE**.
- **Phase 1 — `NinaSlotUpsert.source` and `NinaFactInsert.source` both default to `'distilled'`**
  when omitted. That default is the whole reason `lib/admin/memoryStore.ts` exists.
- **Phase 5 — `lib/nina/memory.ts` exports** `NINA_SLOT_KEYS` (the nine), `NinaSlotKey`,
  `isNinaSlotKey`, `NINA_SLOT_SPECS` (`{ key, policy, category, canonicalise, prompt }` per key),
  `SlotWritePolicy = 'replace' | 'merge'`, `parseRunningDays`, `formatRunningDays`,
  `parseWorkHours`, `formatWorkHours`, `canonicaliseNickname`. **`NINA_SLOT_SPECS[key].canonicalise`
  is the ONE canonicaliser and this page runs it on every save** — phase 5's ruling (b) puts the
  round trip on the writer, and this page is a writer.
- **Phase 5 — the admin-row preservation rule (its ruling (c))**, all three parts: the distiller
  imports neither `updateNinaMemoryFact` nor `deleteNinaMemoryFact`; a `replace`-policy slot whose
  current row is `source: 'admin'` is *deferred* (dropped from slot writes, appended to the ledger)
  rather than overwritten; `pending_promises` merges and its `source` is sticky. **This phase adds
  nothing to that mechanism and depends on all of it.**
- **Phase 5 — `tests/nina.distill.test.ts` case 14** `readFileSync`s `lib/nina/memory.ts` and
  `lib/nina/distill.ts` and asserts neither imports the mutating fact queries. **This phase's
  mutating imports are in `lib/admin/memoryStore.ts`, which is neither of those two files**, so
  that test still passes untouched. It is not edited here.
- **Phase 15 — `lib/admin/requireAdmin.ts` exports `requireAdmin(): Promise<AdminIdentity>`**
  (`{ userId, email }`), no session → `redirect('/')`, signed in but not an admin → `notFound()`.
  Reused, never re-derived; `getAdminIdentity()` and `requireAdminApi()` are not needed here
  because this phase adds no Route Handler.
- **Phase 15 — `app/admin/layout.tsx`** (the 224 px sticky sidebar + `min-w-0` fluid work area,
  `max-w-[1400px]`, `lg:` stack-to-column, `robots: { index: false }`) **already calls
  `requireAdmin()`**, and `components/admin/AdminNav.tsx` already exists with a `LINKS` array.
  **This phase adds no second admin shell.**
- **Phase 15 — `lib/admin/schema.ts` exists** and already imports `zod`.
- **On `main` today, verified:** `lib/id.ts`'s `isValidId`, `lib/date/ranges.ts`'s
  `jakartaDayOf(instant): DateISO` (`lib/date/ranges.ts:145`), `lib/cn.ts`'s `cn`,
  `components/ui`'s `Card`, `Eyebrow`, `Button`, `Field`, `Input`, `EmptyState`,
  `lib/db/schema.ts`'s `users` table (`lib/db/schema.ts:43-51`, columns `id`, `name`, `email`,
  `image`), `zod` 4.4.3.

**Leaves alone (owned by others):**

- **`lib/nina/distill.ts`, `lib/nina/memory.ts`, `lib/nina/prompts/distill.ts` — phase 5.** Read as
  contract, imported for `NINA_SLOT_SPECS`, never edited. In particular the distiller gains no
  awareness of this page.
- **`lib/nina/context.ts`, `lib/nina/load.ts`, `lib/nina/prompts/**` — phase 2.** Not edited. This
  is load-bearing: the mechanism by which an edit reaches Nina must be one phase 2 *already*
  honours (see §2 below), not a new filter in her context builder.
- **`app/admin/nina/**`, `components/admin/{AlbumManager,CropStudio,CircleFrame,UploadAvatar}.tsx`,
  `lib/admin/{avatars,ninaAlbumActions,requireAdmin}.ts`, `lib/nina/crop.ts`,
  `app/api/admin/nina/upload/route.ts` — phase 15.** Reused or ignored, never edited.
  `lib/admin/schema.ts` is appended to and nothing in it is modified.
- **`lib/nina/queries.ts` — phase 1.** Not edited at all. Every function this phase needs is
  already there; phase 1 wrote the update/delete pair *for* this phase.
- **`lib/db/queries.ts`** — not edited, so `ci:data-layer-guard` sees no new unscoped export.
- **`scripts/check-*.mjs`, `package.json`, `proxy.ts`, `auth.config.ts`, `next.config.ts`,
  `vercel.json`, `drizzle/**`** — no edits. Verified against each guard in §Verification.
- **`app/nina/**`, `components/nina/**`, `components/ui/**`** — untouched; `components/ui/index.ts`
  gains nothing.

---

## The semantics, decided before any UI

R24 ("let me edit memory") and R4 ("distil everything permanently", an append-only ledger) can
destroy each other. Phase 5 built half the answer and this section states the other half: exactly
what **edit**, **delete** and **retire** mean here, and what a reader sees afterwards.

### §1 The reconciler's RULING E5: the prompt reads EVERY slot and EVERY recent fact

**This section was filed as a verified fact that changes the design; the reconciler took it whole
and it is now RULING E5, and phase 5's prose has been corrected in phase 5's plan.** Nothing below
is a proposal any more — it is the settled reading of the two paths this phase depends on, and it
still decides everything after it.

Phase 5 wrote that keys outside its nine "are left in place and simply not read". That is true of
the *machine* consumers — phase 10's cron reads `running_days` by name — but it is **not** true of
the prompt, and the prompt is what R24 is about. Verified against the plans this phase depends on:

- `lib/nina/queries.ts`'s `getNinaMemorySlots(userId)` (`phase-1.md:1666`) selects **every row for
  the user**, ordered by `key`, with no vocabulary filter, and renders each value to a display
  string.
- Phase 2's `NinaSourceGateway.readMemorySlots` (`phase-2.md:1514`) is backed by that function, and
  `loadNinaContext` (`phase-2.md:1560`) passes the whole array into the context that becomes the
  system text. There is no `isNinaSlotKey` check anywhere on that path.
- `listNinaMemoryFacts(userId, { limit })` returns the newest rows `created_at DESC, id DESC`, and
  `loadNinaContext` asks for `MEMORY_FACT_LIMIT = 60` of them. **`confidence` is not read on that
  path and not rendered** — `MemoryFactInput` is `{ id, text, sourceMessageId, createdAt }`.

Three consequences, and they decide everything below:

1. **An orphaned slot key is in Nina's prompt on every turn.** Retiring it is therefore a real
   correction and not housekeeping, which is why this phase owns the retirement (§4).
2. **Lowering a fact's `confidence` changes nothing Nina sees.** So "demote it" is not an available
   meaning of "edit" — offering it would be theatre.
3. **Deleting the row is the ONLY operation that stops text reaching her**, for both tables. Any
   design where a correction leaves the wrong sentence in the newest 60 has not corrected anything.

And because `loadNinaContext` runs per turn with no `unstable_cache` and no `use cache` anywhere on
that path (phase 2 states this explicitly of its own module), **a committed row is in the next
turn's prompt with no invalidation step at all.** `revalidatePath('/admin/memory')` in each action
is for *this page's* rendering only; it is not how the edit reaches Nina.

### §2 The ledger: three operations, one of them destructive, and it is named `purge`

| Operation | Available on | What it does | What survives |
|---|---|---|---|
| **Edit** | rows with `source: 'admin'` **only** | `updateNinaMemoryFact` — rewrites `text`, `category`, `confidence` in place | nothing is destroyed: the row was never a record of a message |
| **Retract** | **every** row, and the default for a distilled one | appends an admin row that **quotes the original verbatim**, *then* deletes the original | the original text, inside the retraction, forever |
| **Purge** | every row, behind a typed `PURGE` | `deleteNinaMemoryFact` alone, no record | nothing. This is the one lossy path in the app |

**Why in-place editing is restricted to `source: 'admin'` rows.** A distilled row is a record of
what the distiller read out of a specific message, and `source_message_id` points at that message.
Rewriting its `text` makes the row *claim that message said something it did not* — that is not an
edit, it is forged evidence, and it destroys the one thing that makes a bad distillation
diagnosable (re-read the conversation). A row the admin typed has no message behind it
(`source_message_id IS NULL`), so editing it is fixing his own typo and there is nothing to
falsify. One rule, no sub-cases, and it is a pure predicate: `factPermissions(row).canEditInPlace
=== (row.source === 'admin')`.

**Why retract appends before it deletes.** The two statements are not in one transaction — phase 1
exposes them as two functions and `runBatch` is not on this path. So the order is the guarantee:
the retraction row, which contains the original text, is committed *first*. A crash between them
leaves a duplicate-ish pair of rows (recoverable, visible on this very page) instead of a hole. The
reverse order can lose the sentence permanently, and R4 forbids exactly that.

**Why the retraction is a thing Nina should read.** The composed text is not a tombstone, it is a
correction in the register a friend would use:

    Corrected by admin on 2026-09-03: he runs Tuesday and Thursday, not the weekend.
    (This replaces an earlier note that said "he only runs on weekends", which was wrong or stale.)

Nina reading that is *better* than her never having seen the bad note — she now knows the claim was
wrong, and she can say so. So the retraction row is deliberately a normal ledger row: real
`category`, `confidence: 100` (a human asserting a correction is certain), `source: 'admin'`,
`source_message_id: null`. The retraction is not exempt from anything.

**Why `purge` exists at all, and why it is not called "delete".** This phase's scope says "correct
or **remove** a stale ledger fact", and phase 1 wrote `deleteNinaMemoryFact` for this page. There is
also a genuine case retract cannot serve: text the runner wants *gone* — a retraction that quotes it
verbatim would defeat the request. So the hard delete ships, gated behind typing the literal word
`PURGE` (`ADMIN_PURGE_CONFIRMATION`), labelled "loses the text permanently" on screen, and named
`purge` so that the UI never offers "delete" as the cheap-looking option next to "retract". Retract
is the primary button; purge is the small one.

### §3 The slots: canonicalise on save, refuse rather than guess, and never a silent clear

- **Every save runs `NINA_SLOT_SPECS[key].canonicalise(raw)`** and stores what it returns. This is
  phase 5's ruling (b) applied to a human writer: the stored string must be the canonical rendering
  of a parsed value, or `parseRunningDays` on the read side is a guess. A hand-typed
  `"tuesdays and thursdays"` becomes `"Selasa, Kamis"` — and if it did **not** round-trip, phase
  10's Tuesday trigger would silently stop firing, which is the exact bug this rule prevents.
- **A `canonicalise` that returns `null` REFUSES the save**, with the reason on screen and the
  typed text still in the textarea. Phase 5's distiller degrades a refusal into a ledger append
  because there is no human present; here there is one, standing at the keyboard, so a silent
  conversion would be the page lying about what it stored. The append is offered as an explicit
  second button — "record it as a fact instead" (`recordSlotAsFactAction`) — which is phase 5's
  fallback, taken deliberately.
- **The canonical form is shown back**, from the action's `canonical` field and again from the
  re-render, so "saved" always means "saved as *this*".
- **`nickname` is written as a bare JSON string, never an object.** `canonicaliseNickname` returns
  `string | null` and the store passes that string straight into `NinaSlotUpsert.value`, whose type
  admits `string`. Phase 1's `getNinaIdentity` does a `typeof raw === 'string'` check and would
  silently drop anything else.
- **`pending_promises` is not editable as text**, because its `canonicalise` returns `null` by
  design (phase 5: "a string is never a promise"). It renders as pretty-printed read-only JSON with
  exactly one surgical operation: **remove one entry by `id`**. That operation is genuinely needed —
  the slot is `merge` policy, so nothing in the runtime can ever drop an entry — and it is safe,
  because `mergePendingPromises` matches candidates by `id` and a removed `id` is not resurrected
  unless the runner states the promise again in a later turn. The write back is `source: 'admin'`,
  which phase 5's stickiness then preserves through every later merge, honestly recording that a
  human touched it.
- **Clearing a slot is `retireSlotAction`, never a bare delete** — see §4.

### §4 Slot retirement: the vocabulary question phase 5 handed over

Phase 5 settled on nine keys and originally wrote that keys phase 3's verbatim sink put there in
week one are "left in place and simply not read; retiring them is `/admin/memory`'s job." Per §1
those keys **are** read — into the prompt, every turn — and **under RULING E5 phase 5's plan now
says so, and names this section as the mechanism.** So this is the mechanism:

- `slotEditKind(key)` labels every slot row `'text'`, `'structured'` or **`'orphaned'`**
  (the last one is `!isNinaSlotKey(key)`), and independently `row.source` says `'distilled'` or
  `'admin'`; `buildSlotCards` puts both on the card. (Step 3 is the code; the two are separate
  functions rather than one `classifySlot`, because the vocabulary question and the authorship
  question have different consumers.)
- An orphaned row renders in its own section, headed by what it is, and its **only** action is
  **Retire**. It is not editable: editing a key nothing recognises writes a value nothing will ever
  read on purpose, which is a trap, and phase 5's vocabulary is closed by design.
- **Retire is append-then-delete, the same shape as retract**: `adminAppendFact` writes a record
  that quotes the key and its final value verbatim, then `deleteNinaMemorySlot` removes the row.
  The slot leaves the prompt; the sentence it held enters the ledger, where R4 wants it.
- Retire is offered on **in-vocabulary rows too**, because "clear this slot" and "retire this key"
  are the same two statements, and a slot cleared without a record is text lost.

### §5 How `source: 'admin'` is enforced — a type, a choke point, and a test

Phase 5 named the failure: `upsertNinaMemorySlot` defaults to `'distilled'`, so an admin write that
forgets the field is indistinguishable from a distilled one, and phase 5's rule 2 keys off exactly
that value. Forgetting it silently disables the protection. Three layers, cheapest first:

1. **A choke point.** `lib/admin/memoryStore.ts` is the only file in this phase that imports
   `upsertNinaMemorySlot`, `appendNinaMemoryFacts`, `updateNinaMemoryFact`, `deleteNinaMemoryFact`
   or `deleteNinaMemorySlot`. Every write hard-codes `source: 'admin'` and
   `sourceMessageId: null`. `lib/admin/memoryActions.ts` imports only the store.
2. **A type.** The store's draft types are `Omit<..., 'source' | 'sourceMessageId'>`, so a caller
   *cannot pass* `'distilled'` — the field is not in the parameter type. There is nothing to
   remember and nothing to get wrong.
3. **A test.** `tests/admin.memory.test.ts` `readFileSync`s both files and asserts (a) the actions
   module imports nothing from `@/lib/nina/queries`, (b) the store contains no occurrence of the
   literal `'distilled'`, and (c) every `await` of a phase-1 writer in the store sits in a function
   whose body also contains `source: 'admin'`. Same argument phase 5 makes for its case 14: *a
   structural guarantee that is only a comment decays.*

### §6 Two small decisions, stated so they are not re-litigated

- **The route is one page with a `?user=` search param, not `/admin/memory/[userId]`.** There is
  one user today and the picker with one row would otherwise be a mandatory click-through. The page
  is nonetheless fully per-user: `?user` is validated, `getAdminUser` confirms it exists, and every
  read and write below takes that id first (invariant 7). **Absent `?user` defaults to the admin's
  own `userId`** from `requireAdmin()` — deterministic, and exactly right for the backdoor R24 asks
  for. "First user by email" was rejected: a second account signing in would silently move the
  default.
- **Actions take plain object arguments and are invoked from client components inside a
  `useTransition`, not through `<form action={...}>` + `FormData`.** `07-mutating-data.md` supports
  both; phase 15's five album actions already established the plain-argument +
  `AdminActionResult` shape on the sibling admin page, and a desktop-only admin tool gains nothing
  from progressive enhancement that it does not lose in consistency. Validation is still Zod on the
  server for every field, because a Server Action is reachable by direct POST — which that same
  doc warns about in a WARNING block, and which is why `requireAdmin()` is line one of all eight.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/memoryModel.ts` | create | pure, zero value imports: the bounds, the card types, the permission predicate, the retraction and retirement composers |
| `lib/admin/memoryVocab.ts` | create | the only reader of phase 5's `NINA_SLOT_SPECS`: labels, hints, refusals, canonicalisation, and the slot cards |
| `lib/admin/memoryStore.ts` | create | `server-only`; the only file that names phase 1's memory writers, and the only place `source: 'admin'` is spelled |
| `lib/admin/users.ts` | create | `server-only`; the user picker's reads — the one deliberately unscoped query, kept out of `lib/db/queries.ts` |
| `lib/admin/schema.ts` | modify | **append** nine Zod schemas at the end of phase 15's file (after `avatarIdSchema`); nothing existing is touched |
| `lib/admin/memoryActions.ts` | create | `'use server'`; eight actions, each opening with `requireAdmin()` and ending with `revalidatePath('/admin/memory')` |
| `app/admin/memory/page.tsx` | create | the Server Component: gate, resolve `?user`, read slots + ledger, hand them to two client components |
| `components/admin/UserPicker.tsx` | create | the per-user selector; server-rendered links, no client JS |
| `components/admin/MemorySlots.tsx` | create | `'use client'`; nine slot cards, the orphaned section, save / record-as-fact / retire, the promises panel |
| `components/admin/MemoryLedger.tsx` | create | `'use client'`; the ledger table, the hand-insert form (the backdoor), edit / retract / purge |
| `components/admin/AdminNav.tsx` | modify | **one entry** appended to `LINKS` (phase 15's reserved edit; the array is at the top of the file) |
| `app/admin/page.tsx` | modify | **one `<Card>`** added inside the existing `sm:grid-cols-2` grid, plus its two counts (phase 15's reserved edit) |
| `tests/admin.memory.test.ts` | create | the pure model, the composers, the canonicalise round trip, and the three structural assertions of §5 |

**Thirteen files: eleven created, two modified**, and both modifications are the single-line edits
phase 15 reserved. That is the index's ~13 exactly, and it is worth saying out loud because the
number is doing work — a memory editor that needed to touch phase 1's queries, phase 2's context or
phase 5's distiller would be the wrong design, and none of those three appears above.

**`depends_on` is 1, 5, 15, and it stays that way — checked against the whole plan.** Nothing here
needs phase 6 (`lib/nina/images.ts`, `NINA_BLOB_PREFIX`: this page uploads nothing and renders no
image), phase 12 (the image worker), or **phase 13**. That last one is worth being explicit about
under RULING E6, which gives `lib/nina/album.ts` and `lib/nina/crop.ts` to phase 13: **this phase
imports neither, as a value or as a type.** `lib/nina/crop.ts` is named twice above and both times
as a *precedent* — it is the zero-value-imports rule `lib/admin/memoryModel.ts` follows — and once
in "Leaves alone". `NINA_AVATAR_FALLBACK_SRC`, `ninaCropStyle` and the album readers appear nowhere.
So **no edge to 13 is added**, and phase 13 may land before or after this phase without either
noticing. The only phase-13 coupling is behavioural and already documented: `removePendingPromiseAction`
writes `source: 'admin'` on a slot phase 5's merge keeps sticky, which is the behaviour phase 13's
promise resolver is written against.

---

## Implementation Steps

### Step 1: `lib/admin/users.ts` — the picker's reads, and the one unscoped query

**File:** `lib/admin/users.ts` (new)
**Change:** enumerate users with their memory-row counts, and confirm one id exists. This is the
only read in the phase that is not `userId`-first, and it is here rather than in
`lib/db/queries.ts` so that file's invariant needs no new exception.

**Code:**

```ts
import 'server-only'

import { asc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMemoryFacts, ninaMemorySlots, users } from '@/lib/db/schema'

/**
 * `/admin/memory`'s user picker — R24's *"the persistent memory that is collected for each user"*.
 *
 * ── WHY THIS IS NOT IN `lib/db/queries.ts` ──────────────────────────────────────────────────
 * `scripts/check-data-layer-invariants.mjs` reads that file and fails on any export whose first
 * parameter is not `userId`, with four documented exceptions. `listAdminUsers()` would have to
 * become a fifth — and the honest reason ("an admin page needs to enumerate accounts") is a
 * different kind of reason from the other four, which are all about a single user's data. Adding
 * it there would blunt the guard for every future reader.
 *
 * So the unscoped read lives in `lib/admin/`, behind `requireAdmin()`, next to the only page that
 * makes it meaningful, and `lib/db/queries.ts`'s rule stays literally true. **Everything the page
 * does after the pick is `userId`-first** (invariant 7): `getNinaMemorySlots(userId)`,
 * `listNinaMemoryFacts(userId, …)`, and every writer in `lib/admin/memoryStore.ts`.
 *
 * `import 'server-only'` is what stops a client component from ever reaching `db` through here.
 */

export interface AdminUserRow {
  id: string
  name: string | null
  email: string | null
  /** How many `nina_memory_slots` rows this user has. */
  slots: number
  /** How many `nina_memory_facts` rows this user has — the whole ledger, not the newest page. */
  facts: number
}

/**
 * Every account, with its memory-row counts. Three queries and a join in TypeScript rather than
 * two correlated subqueries: the counts are grouped scans of two small tables, the merge is O(n)
 * over a handful of rows, and it stays readable.
 *
 * `::int` on the counts is load-bearing — Postgres `count(*)` is `bigint`, which the Neon driver
 * hands back as a string, and a string in a `number` field is the kind of bug that only shows up
 * in the rendered page.
 *
 * Ordered by `email` so the picker's order is stable across requests.
 */
export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const [rows, slotCounts, factCounts] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .orderBy(asc(users.email)),
    db
      .select({ userId: ninaMemorySlots.userId, n: sql<number>`count(*)::int` })
      .from(ninaMemorySlots)
      .groupBy(ninaMemorySlots.userId),
    db
      .select({ userId: ninaMemoryFacts.userId, n: sql<number>`count(*)::int` })
      .from(ninaMemoryFacts)
      .groupBy(ninaMemoryFacts.userId),
  ])

  const slots = new Map(slotCounts.map((row) => [row.userId, row.n]))
  const facts = new Map(factCounts.map((row) => [row.userId, row.n]))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    slots: slots.get(row.id) ?? 0,
    facts: facts.get(row.id) ?? 0,
  }))
}

/**
 * Confirm a `?user=` parameter names a real account, and get its display fields.
 *
 * Scoped by id, so this one obeys the ordinary rule. It exists so that a mistyped id renders "no
 * such user" rather than an empty memory page, which would read as "this user has no memory" —
 * the wrong answer to the wrong question.
 */
export async function getAdminUser(userId: string): Promise<AdminUserRow | null> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const row = rows[0]
  if (row == null) return null

  const [slotRows, factRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(ninaMemorySlots)
      .where(eq(ninaMemorySlots.userId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(ninaMemoryFacts)
      .where(eq(ninaMemoryFacts.userId, userId)),
  ])

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    slots: slotRows[0]?.n ?? 0,
    facts: factRows[0]?.n ?? 0,
  }
}
```

**Impact:** the first unscoped read outside `lib/db/queries.ts`. `ci:data-layer-guard` does not
read this file and needs no edit — verified against `scripts/check-data-layer-invariants.mjs:20`,
which hard-codes `const QUERIES = 'lib/db/queries.ts'`.

---

### Step 2: `lib/admin/memoryModel.ts` — the pure model, with zero value imports

**File:** `lib/admin/memoryModel.ts` (new)
**Change:** every decision this phase makes that is not a database call: what may be edited, what a
retraction says, what a retirement records, and the bounds. **No value import at all** — only
`import type` — so it is safe in a client bundle, which is the `lib/nina/crop.ts` /
`lib/photos/gallery.ts` rule this repo already follows.

**Code:**

```ts
import type { NinaFactCategory, NinaMemorySource } from '@/lib/db/schema'

/**
 * `/admin/memory`'s pure half — R24's semantics, with no I/O and nothing importable-only-on-a-server.
 *
 * ── WHY THE VALUE-IMPORT BAN IS A RULE AND NOT AN ACCIDENT ─────────────────────────────────
 * `MemorySlots.tsx` and `MemoryLedger.tsx` are `'use client'` and need the bounds, the category
 * list and the confirmation word. `NINA_SLOT_SPECS` lives in `lib/nina/memory.ts`, which imports
 * zod and (for `NINA_SLOT_PENDING_PROMISES`) `lib/db/schema.ts` — a drizzle table module. Pulling
 * that into a browser bundle to render a label would be absurd. So the split is:
 *
 *   this file          — zero value imports, client-safe, the bounds and the composers
 *   `memoryVocab.ts`   — imports `NINA_SLOT_SPECS`; server-only in practice, used by the page,
 *                        the actions and the test, never by a component
 *
 * The page computes every card server-side and passes plain serializable props down, so the client
 * never needs the vocabulary at all — only the numbers below.
 */

/* ── bounds ─────────────────────────────────────────────────────────────────────────────────── */

/** A hand-typed fact. Same number as phase 5's `FACT_TEXT_MAX`, on purpose: one ledger, one cap. */
export const ADMIN_FACT_TEXT_MAX = 400

/**
 * A composed retraction quotes the original (<= 400) and the replacement (<= 400) plus ~120
 * characters of boilerplate, so it is bounded by construction at well under this. The cap is here
 * so the bound is asserted rather than assumed — `tests/admin.memory.test.ts` proves the worst case.
 */
export const ADMIN_RETRACTION_TEXT_MAX = 1000

/** A slot value before canonicalisation. The specs cap the stored form tighter (120–240). */
export const ADMIN_SLOT_VALUE_MAX = 400

/** How much of the ledger the page renders. The table is unbounded; the page is not. */
export const ADMIN_LEDGER_PAGE = 200

/** Typed verbatim to purge a row. The one lossy operation in the app asks for a word, not a click. */
export const ADMIN_PURGE_CONFIRMATION = 'PURGE'

/**
 * The seven `NinaFactCategory` values, as a tuple the hand-insert form can iterate.
 *
 * Retyped rather than imported because importing it as a VALUE is impossible — `NinaFactCategory`
 * is a type union, not a const tuple, and phase 1 owns that file. `satisfies` makes the compiler
 * reject a typo, and the test asserts the length, so a phase-1 eighth category fails loudly here
 * instead of silently missing from the form.
 */
export const ADMIN_FACT_CATEGORIES = [
  'person',
  'preference',
  'body',
  'life',
  'goal',
  'training',
  'other',
] as const satisfies readonly NinaFactCategory[]

/* ── views ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * `'text'`       — the eight prose/scalar slots. Editable, canonicalised on save.
 * `'structured'` — a `merge`-policy slot (`pending_promises`). Read-only JSON plus per-entry removal.
 * `'orphaned'`   — a key outside phase 5's nine. Retire-only; see §4.
 */
export type SlotEditKind = 'text' | 'structured' | 'orphaned'

/**
 * What phase 5's ruling (c) does for this row, said in one word so the page can say it on screen:
 *
 *   `'deferred'` — an admin `replace` slot. The distiller's contradicting reading is dropped from
 *                  the slot write and appended to the ledger instead. The admin's value stands.
 *   `'sticky'`   — an admin `merge` slot. Entries are folded in and `source` stays `'admin'`.
 *   `'none'`     — a distilled row. The next distillation may replace it.
 */
export type SlotProtection = 'deferred' | 'sticky' | 'none'

/** A slot as the page renders it. Every field is serializable — this crosses to a client component. */
export interface SlotCard {
  key: string
  /** The stored value, already rendered to a display string by `getNinaMemorySlots`. `''` if absent. */
  value: string
  /**
   * `false` for one of phase 5's nine keys that has no row yet. Those are still rendered, as empty
   * cards — **typing into one is how a slot is inserted by hand**, which is half of R24's backdoor.
   * There is no separate "add a slot" form, because the vocabulary is closed and a form would
   * invite a tenth key.
   */
  present: boolean
  /** `null` when `present` is `false` — there is no row, so nobody wrote it. */
  origin: NinaMemorySource | null
  sourceMessageId: string | null
  /** ISO 8601, `null` when absent. A string renders identically on both sides of the boundary. */
  updatedAt: string | null
  inVocabulary: boolean
  editKind: SlotEditKind
  protection: SlotProtection
  label: string
  /** Phase 5's own one-line spec for the key, verbatim, or the orphan explanation. */
  hint: string
}

/** A ledger row as the page renders it. */
export interface FactCard {
  id: string
  category: NinaFactCategory
  text: string
  confidence: number
  origin: NinaMemorySource
  sourceMessageId: string | null
  createdAt: string
  canEditInPlace: boolean
  /** Why in-place editing is or is not offered — rendered as a tooltip, never invented in the UI. */
  editNote: string
}

export interface FactPermissions {
  canEditInPlace: boolean
  canRetract: boolean
  canPurge: boolean
  editNote: string
}

/* ── permissions ────────────────────────────────────────────────────────────────────────────── */

/**
 * §2's one rule: **in-place editing is for rows the admin typed, and nothing else.**
 *
 * A distilled row records what the distiller read out of the message at `source_message_id`.
 * Rewriting its text makes it claim that message said something it did not — forged evidence, and
 * the end of being able to diagnose a bad distillation by re-reading the conversation. Retract
 * (which quotes the original and appends) is the correct correction for those, and it is always
 * available.
 */
export function factPermissions(row: {
  source: NinaMemorySource
  sourceMessageId: string | null
}): FactPermissions {
  if (row.source === 'admin') {
    return {
      canEditInPlace: true,
      canRetract: true,
      canPurge: true,
      editNote: 'You wrote this one. Editing it in place changes nothing that was ever a record.',
    }
  }
  return {
    canEditInPlace: false,
    canRetract: true,
    canPurge: true,
    editNote:
      'Distilled from a message. Editing the text would make it misquote that message — retract it ' +
      'instead, which keeps the original wording and records the correction.',
  }
}

/* ── the composers ──────────────────────────────────────────────────────────────────────────── */

export interface RetractionInput {
  /** The row's existing text, verbatim. This is the sentence R4 promised to keep. */
  original: string
  /** The truth, or `''` for a pure retraction ("this was simply wrong"). */
  replacement: string
  /** A Jakarta `YYYY-MM-DD` day. Passed in, so this function stays pure and testable. */
  on: string
}

/**
 * The retraction row's text. **This is what makes "edit a stale fact" non-destructive**: the
 * original wording is inside the new row before the old row is deleted (see
 * `retractFactAction`'s statement order).
 *
 * It is deliberately readable BY NINA and not a tombstone. She reads the newest 60 ledger rows
 * every turn (`MEMORY_FACT_LIMIT`), so this sentence is what she will know — and "that earlier note
 * was wrong, here is the truth" is strictly better than her having never seen the bad note. The
 * quotes around the original are what let her say *"gw pernah nyatet lo cuma lari weekend, ternyata
 * salah"* without inventing anything.
 */
export function composeRetraction({ original, replacement, on }: RetractionInput): string {
  const quoted = original.replace(/\s+/g, ' ').trim()
  const truth = replacement.replace(/\s+/g, ' ').trim()

  if (truth.length === 0) {
    return `Retracted by admin on ${on}: "${quoted}" was wrong or stale and no longer applies.`
  }
  return (
    `Corrected by admin on ${on}: ${truth} ` +
    `(This replaces an earlier note that said "${quoted}", which was wrong or stale.)`
  )
}

export interface SlotRetirementInput {
  key: string
  /** The slot's final value, verbatim. */
  value: string
  /** Optional; why it is going. `''` is fine. */
  reason: string
  on: string
}

/**
 * The record a retired slot leaves behind — §4. A slot removed without this is text lost, and a
 * slot is in Nina's prompt on every single turn (§1), so removing one is a real change to what she
 * knows and deserves a ledger entry saying so.
 */
export function composeSlotRetirement({ key, value, reason, on }: SlotRetirementInput): string {
  const quoted = value.replace(/\s+/g, ' ').trim()
  const why = reason.replace(/\s+/g, ' ').trim()
  const tail = why.length === 0 ? '' : ` Reason: ${why}`
  return `Retired by admin on ${on}: the memory slot "${key}" held "${quoted}" and was removed.${tail}`
}

/** The purge gate. Trimmed and case-sensitive: a lossy operation should be typed on purpose. */
export function isPurgeConfirmed(raw: string): boolean {
  return raw.trim() === ADMIN_PURGE_CONFIRMATION
}
```

**Impact:** a new pure module with no runtime dependency, importable from a client component and
from vitest without a single alias. Every number the UI enforces is here, once.

---

### Step 3: `lib/admin/memoryVocab.ts` — the only reader of phase 5's vocabulary

**File:** `lib/admin/memoryVocab.ts` (new)
**Change:** turn phase 5's `NINA_SLOT_SPECS` into cards, and run its canonicalisers on the way in.
Used by the page (Step 6), the actions (Step 5) and the test (Step 9). **Never by a component.**

**Code:**

```ts
import type { NinaFactCategory, NinaMemorySource } from '@/lib/db/schema'
import {
  ADMIN_SLOT_VALUE_MAX,
  type SlotCard,
  type SlotEditKind,
  type SlotProtection,
} from '@/lib/admin/memoryModel'
import {
  NINA_SLOT_KEYS,
  NINA_SLOT_SPECS,
  isNinaSlotKey,
  type NinaSlotKey,
} from '@/lib/nina/memory'

/**
 * The bridge between phase 5's closed vocabulary and `/admin/memory`'s cards.
 *
 * **This is the only file in the phase that imports `lib/nina/memory.ts`**, and it does so as a
 * READER: it never coins a key, never redefines a policy, and never writes a second canonicaliser.
 * Phase 5's ruling (b) puts canonicalisation on the writer, and this page is a writer — so
 * `NINA_SLOT_SPECS[key].canonicalise` runs on every save, exactly as the distiller's does.
 *
 * No `import 'server-only'`: nothing here touches I/O and the test imports it directly. It is kept
 * out of components by convention and by the fact that the page hands down finished cards.
 */

/** A human column heading per key. Phase 5's `prompt` is the hint; this is the title. */
const SLOT_LABELS: Readonly<Record<NinaSlotKey, string>> = {
  name: 'Full name',
  nickname: 'Nickname',
  running_days: 'Usual running days',
  work_hours: 'Work hours',
  goals: 'Current goal',
  injuries: 'Injuries',
  food_likes: 'Food',
  gear: 'Gear',
  pending_promises: 'Pending promises',
}

/**
 * Why a save was refused, per key, in the words the admin needs to fix it. The two parsed keys get
 * a specific sentence because a generic "invalid" would leave him guessing at a format that phase
 * 10's cron depends on.
 */
const SLOT_REFUSALS: Readonly<Record<NinaSlotKey, string>> = {
  name: 'A name cannot be empty.',
  nickname:
    'That is not a usable nickname — one short word, letters only. Nina stores it as a bare string.',
  running_days:
    'No weekday could be read out of that. Write day names: "Selasa, Kamis, Sabtu". This has to ' +
    'parse back, because the evening cron reads this slot to ask whether he skipped his usual day.',
  work_hours: 'Write two clock times, like "08:00-17:00".',
  goals: 'A goal cannot be empty.',
  injuries: 'Cannot be empty. To clear it, retire the slot instead — that keeps a record.',
  food_likes: 'Cannot be empty. To clear it, retire the slot instead.',
  gear: 'Cannot be empty. To clear it, retire the slot instead.',
  pending_promises:
    'Promises are structured rows, not text — phase 5 refuses a string here on purpose. Remove a ' +
    'single promise with the button on its entry, or let Nina record a new one from a real turn.',
}

const ORPHAN_HINT =
  'Not one of the nine keys Nina understands. Nothing in the app reads it deliberately — but ' +
  'every slot row goes into her prompt on every turn, so it IS being read, by her. Retire it.'

/**
 * A `merge`-policy slot is structured by definition — its value is a record list, which is exactly
 * why it merges rather than replaces. So the edit kind falls out of phase 5's policy field and no
 * key literal is needed here (which also keeps `NINA_SLOT_PENDING_PROMISES` out of this module).
 */
export function slotEditKind(key: string): SlotEditKind {
  if (!isNinaSlotKey(key)) return 'orphaned'
  return NINA_SLOT_SPECS[key].policy === 'merge' ? 'structured' : 'text'
}

/**
 * What phase 5's ruling (c) will do for this row on the next distillation pass. Rendered on the
 * card, so the admin can see that his correction is protected rather than having to trust it.
 */
export function slotProtection(key: string, origin: NinaMemorySource | null): SlotProtection {
  if (origin !== 'admin' || !isNinaSlotKey(key)) return 'none'
  return NINA_SLOT_SPECS[key].policy === 'merge' ? 'sticky' : 'deferred'
}

export function describeSlot(key: string): { label: string; hint: string } {
  if (!isNinaSlotKey(key)) return { label: key, hint: ORPHAN_HINT }
  return { label: SLOT_LABELS[key], hint: NINA_SLOT_SPECS[key].prompt }
}

/** The `nina_memory_facts.category` a statement about this slot becomes. Phase 5's own mapping. */
export function slotFactCategory(key: string): NinaFactCategory {
  return isNinaSlotKey(key) ? NINA_SLOT_SPECS[key].category : 'other'
}

export type SlotCanonicalisation =
  | { ok: true; value: string }
  | { ok: false; reason: string }

/**
 * **Phase 5's ruling (b), on the admin's keystrokes.** `formatRunningDays(parseRunningDays(raw))`
 * is composed inside `NINA_SLOT_SPECS.running_days.canonicalise`, so calling that function is
 * literally the same round trip the distiller does — one implementation, two writers.
 *
 * A refusal is a refusal, not a silent conversion: the distiller degrades a refused slot into a
 * ledger append because no human is present, but here one is, and a page that stores something
 * other than what he typed without saying so is lying. `recordSlotAsFactAction` is the same
 * fallback, taken by an explicit second button.
 */
export function canonicaliseSlotValue(key: string, raw: string): SlotCanonicalisation {
  if (!isNinaSlotKey(key)) {
    return {
      ok: false,
      reason:
        `"${key}" is not one of the nine keys Nina understands, so writing to it would put a ` +
        'value in her prompt that no rule governs. Retire the row instead.',
    }
  }

  const trimmed = raw.slice(0, ADMIN_SLOT_VALUE_MAX)
  const canonical = NINA_SLOT_SPECS[key].canonicalise(trimmed)
  if (canonical === null || canonical.length === 0) {
    return { ok: false, reason: SLOT_REFUSALS[key] }
  }
  return { ok: true, value: canonical }
}

/**
 * Every card the page renders: one per stored row, plus an EMPTY card for each of phase 5's nine
 * keys that has no row yet, plus the orphans last.
 *
 * The empty cards are half of R24's backdoor — *"i can add some important data of myself through a
 * backdoor in admin page"*. Typing into `goals` when there is no `goals` row is how a slot gets
 * inserted by hand, and it needs no separate form. There is deliberately no way to create a TENTH
 * key from this page: the vocabulary is closed (phase 5), and a free-text key field would
 * manufacture exactly the orphans §4 exists to clean up.
 *
 * Order: `NINA_SLOT_KEYS` order — phase 5 wrote that tuple in "the order `/admin/memory` will
 * naturally show them in" — then orphans, alphabetically, in their own section.
 */
export function buildSlotCards(
  rows: readonly {
    key: string
    value: string
    source: NinaMemorySource
    sourceMessageId: string | null
    updatedAt: Date
  }[],
): SlotCard[] {
  const byKey = new Map(rows.map((row) => [row.key, row]))

  const known: SlotCard[] = NINA_SLOT_KEYS.map((key) => {
    const row = byKey.get(key)
    const { label, hint } = describeSlot(key)
    const origin = row?.source ?? null
    return {
      key,
      value: row?.value ?? '',
      present: row != null,
      origin,
      sourceMessageId: row?.sourceMessageId ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      inVocabulary: true,
      editKind: slotEditKind(key),
      protection: slotProtection(key, origin),
      label,
      hint,
    }
  })

  const orphans: SlotCard[] = rows
    .filter((row) => !isNinaSlotKey(row.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({
      key: row.key,
      value: row.value,
      present: true,
      origin: row.source,
      sourceMessageId: row.sourceMessageId,
      updatedAt: row.updatedAt.toISOString(),
      inVocabulary: false,
      editKind: 'orphaned' as const,
      protection: 'none' as const,
      label: row.key,
      hint: ORPHAN_HINT,
    }))

  return [...known, ...orphans]
}
```

**Impact:** phase 5's vocabulary has exactly one reader in this phase, and every label, hint,
refusal message and canonicalisation runs through it. A tenth slot key added to
`NINA_SLOT_KEYS` fails to compile here until `SLOT_LABELS` and `SLOT_REFUSALS` gain an entry —
which is the intended pressure, because a key with no label is a key the admin cannot understand.

---

### Step 4: `lib/admin/schema.ts` — nine schemas appended to phase 15's file

**File:** `lib/admin/schema.ts`, **appended at the end**, immediately after phase 15's
`avatarIdSchema` (`phase-15.md` Step 5). Nothing above is modified.
**Change:** the Zod bounds for all eight actions. Every action validates, because a Server Action is
reachable by direct POST — `07-mutating-data.md`'s own WARNING block.

**Code:**

```ts
/* ============================================================================
 * Phase 16 — /admin/memory. Appended; nothing above this line changed.
 * ==========================================================================*/

/**
 * The eight memory actions' input bounds. They are here rather than in a second `lib/admin/*`
 * schema file for the reason phase 15 gave for appending to `lib/nina/queries.ts`: two homes for
 * one concern is worse than one additive edit to a landed file.
 *
 * `userId` is a `user.id` — `crypto.randomUUID()` from the Auth.js adapter
 * (`lib/db/schema.ts:44-46`), **not** a nanoid — so `isValidId` is the wrong check for it and a
 * length-bounded non-empty string is the right one. Ownership is not established by this regex; it
 * is established by `requireAdmin()`, and every read and write is scoped to the id that survives
 * `getAdminUser`.
 */
export const userIdSchema = z.string().trim().min(1).max(64)

/** A slot key. Membership in phase 5's nine is checked by `canonicaliseSlotValue`, not here. */
export const slotKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'A slot key is lower_snake_case.')

export const slotEditSchema = z.object({
  userId: userIdSchema,
  key: slotKeySchema,
  /** Not trimmed here — `canonicaliseSlotValue` owns every transformation of a slot value. */
  value: z.string().min(1).max(ADMIN_SLOT_VALUE_MAX),
})
export type SlotEdit = z.infer<typeof slotEditSchema>

export const slotRetireSchema = z.object({
  userId: userIdSchema,
  key: slotKeySchema,
  reason: z.string().trim().max(ADMIN_FACT_TEXT_MAX).default(''),
})

export const promiseRemoveSchema = z.object({
  userId: userIdSchema,
  /** A `NinaPendingPromise.id`, minted by `newId()`. */
  promiseId: z.string().trim().min(1).max(64),
})

const factCategorySchema = z.enum(ADMIN_FACT_CATEGORIES)

/**
 * A hand-typed fact — R24's backdoor, literally. `confidence` defaults to 100 because a human
 * asserting something outright is phase 1's documented meaning of 100, and it is still editable.
 */
export const factInsertSchema = z.object({
  userId: userIdSchema,
  category: factCategorySchema,
  text: z.string().trim().min(1).max(ADMIN_FACT_TEXT_MAX),
  confidence: z.number().int().min(0).max(100).default(100),
})
export type FactInsert = z.infer<typeof factInsertSchema>

export const factEditSchema = z.object({
  userId: userIdSchema,
  id: z.string().trim().min(1).max(64),
  category: factCategorySchema,
  text: z.string().trim().min(1).max(ADMIN_FACT_TEXT_MAX),
  confidence: z.number().int().min(0).max(100),
})
export type FactEdit = z.infer<typeof factEditSchema>

/** `replacement` may be empty — that is a pure retraction rather than a correction. */
export const factRetractSchema = z.object({
  userId: userIdSchema,
  id: z.string().trim().min(1).max(64),
  replacement: z.string().trim().max(ADMIN_FACT_TEXT_MAX).default(''),
})
export type FactRetract = z.infer<typeof factRetractSchema>

export const factPurgeSchema = z.object({
  userId: userIdSchema,
  id: z.string().trim().min(1).max(64),
  /** Compared against `ADMIN_PURGE_CONFIRMATION` by `isPurgeConfirmed`, not by a Zod literal, so */
  /** the refusal message can explain itself rather than being a field error. */
  confirm: z.string(),
})
```

**Also added to that file's existing import block** — two lines, appended to the imports phase 15
wrote (`z` is already imported there):

```ts
import {
  ADMIN_FACT_CATEGORIES,
  ADMIN_FACT_TEXT_MAX,
  ADMIN_SLOT_VALUE_MAX,
} from '@/lib/admin/memoryModel'
```

**Impact:** `lib/admin/schema.ts` grows by one section and keeps being client-safe —
`memoryModel.ts` has zero value imports, so nothing server-side rides in on that import. Phase 15's
three schemas and two types are untouched, so `tests/admin.avatars.test.ts` still passes.

---

### Step 5: `lib/admin/memoryStore.ts` — the choke point where `source: 'admin'` is spelled

**File:** `lib/admin/memoryStore.ts` (new)
**Change:** wrap phase 1's five memory writers and three readers so that `source` and
`sourceMessageId` are not parameters at all. This is §5's layers 1 and 2.

**Code:**

```ts
import 'server-only'

import type { NinaFactCategory, NinaSlotValue } from '@/lib/db/schema'
import {
  appendNinaMemoryFacts,
  deleteNinaMemoryFact,
  deleteNinaMemorySlot,
  getNinaMemorySlot,
  getNinaMemorySlots,
  listNinaMemoryFacts,
  updateNinaMemoryFact,
  upsertNinaMemorySlot,
  type NinaFactRow,
  type NinaSlotRow,
} from '@/lib/nina/queries'

/**
 * **The only file in `/admin/memory` that names a phase-1 memory writer.**
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────
 * `upsertNinaMemorySlot` and `appendNinaMemoryFacts` both default `source` to `'distilled'`
 * (`phase-1.md:1713`, `:1763`). Phase 5's whole admin-preservation ruling keys off that column: a
 * `replace` slot whose row is `'admin'` is DEFERRED rather than overwritten, and an `'admin'`
 * ledger row is the row the distiller cannot reach. So an admin write that forgets `source:
 * 'admin'` does not fail — it silently disables its own protection, and the next thing the runner
 * says in chat quietly re-breaks the memory he just came here to fix. That is the one failure mode
 * of this whole page, and it is invisible.
 *
 * The fix is to make the field impossible to omit by removing it from the vocabulary: every draft
 * type below is `Omit<…, 'source' | 'sourceMessageId'>`, so a caller cannot pass `'distilled'`
 * because there is nowhere to put it. `lib/admin/memoryActions.ts` imports only this module, and
 * `tests/admin.memory.test.ts` asserts both halves structurally.
 *
 * ── AND WHY IT IS NOT IN `lib/nina/` ────────────────────────────────────────────────────────
 * `tests/nina.distill.test.ts` case 14 reads `lib/nina/memory.ts` and `lib/nina/distill.ts` and
 * asserts neither imports `updateNinaMemoryFact` or `deleteNinaMemoryFact` — phase 5's structural
 * guarantee that the distiller cannot rewrite the ledger. This file imports both. Putting it under
 * `lib/nina/` would put the mutating imports one directory away from a test whose entire point is
 * that they are not reachable from there. Under `lib/admin/` the separation is a directory
 * boundary, not a naming convention, and phase 5's test needs no edit.
 *
 * `source_message_id` is ALWAYS null here, and that is a real answer rather than missing data:
 * nothing in the chat said it. Phase 1 made the column nullable for exactly this page.
 */

/** A hand-written or composed ledger row. No `source`, no `sourceMessageId` — see the header. */
export interface AdminFactDraft {
  category: NinaFactCategory
  text: string
  /** Integer percent 0–100. Phase 1 defaults it to 100; every caller here passes it explicitly. */
  confidence: number
}

/** A slot write. `value` is already canonicalised by `canonicaliseSlotValue`. */
export interface AdminSlotDraft {
  key: string
  value: NinaSlotValue
}

export async function adminUpsertSlot(userId: string, draft: AdminSlotDraft): Promise<void> {
  await upsertNinaMemorySlot(userId, {
    key: draft.key,
    value: draft.value,
    source: 'admin',
    sourceMessageId: null,
  })
}

export async function adminDeleteSlot(userId: string, key: string): Promise<boolean> {
  return deleteNinaMemorySlot(userId, key)
}

/**
 * One ledger row. `appendNinaMemoryFacts` takes an array and returns the inserted rows; the array
 * of one is deliberate — there is exactly one writer of this table and it should stay the
 * multi-row INSERT phase 1 wrote, not gain a singular twin.
 *
 * Returns the row so a caller can report its id, and `null` if the insert returned nothing — which
 * `retractFactAction` and `retireSlotAction` treat as "do not delete anything".
 */
export async function adminAppendFact(
  userId: string,
  draft: AdminFactDraft,
): Promise<NinaFactRow | null> {
  const rows = await appendNinaMemoryFacts(userId, [
    {
      category: draft.category,
      text: draft.text,
      confidence: draft.confidence,
      source: 'admin',
      sourceMessageId: null,
    },
  ])
  return rows[0] ?? null
}

/**
 * In-place edit — offered **only** for a row that is already `source: 'admin'` (§2). Phase 1's
 * patch type has no `source` field, which is exactly right: the row is already labelled and there
 * is nothing to relabel. The caller enforces the eligibility rule with `factPermissions`; this
 * function does not re-derive it, because two opinions about who may edit is one too many.
 */
export async function adminUpdateFact(
  userId: string,
  id: string,
  patch: { category: NinaFactCategory; text: string; confidence: number },
): Promise<boolean> {
  return updateNinaMemoryFact(userId, id, patch)
}

/** The one lossy call in the app. Reached only through `purgeFactAction`'s typed confirmation. */
export async function adminDeleteFact(userId: string, id: string): Promise<boolean> {
  return deleteNinaMemoryFact(userId, id)
}

/* ── reads ──────────────────────────────────────────────────────────────────────────────────── */

/** Every slot, `value` rendered to the display string phase 2's prompt also gets. */
export async function adminReadSlots(userId: string): Promise<NinaSlotRow[]> {
  return getNinaMemorySlots(userId)
}

/** One slot, **parsed** — the shape `pending_promises` needs. The cast is the caller's. */
export async function adminReadSlot(userId: string, key: string) {
  return getNinaMemorySlot(userId, key)
}

/** The newest `limit` ledger rows, newest first — the same read phase 2's context makes. */
export async function adminReadFacts(userId: string, limit: number): Promise<NinaFactRow[]> {
  return listNinaMemoryFacts(userId, { limit })
}
```

**Impact:** the five phase-1 writers have exactly one caller each in the entire application, and
`'admin'` appears in this file and nowhere else in the phase. `'distilled'` appears nowhere in
`lib/admin/` at all — which is what the test asserts.

---

### Step 6: `lib/admin/memoryActions.ts` — eight actions, and the statement orders that make R4 safe

**File:** `lib/admin/memoryActions.ts` (new)
**Change:** every mutation the page can perform. `requireAdmin()` is line one of all eight
(`07-mutating-data.md`'s WARNING: a Server Action is reachable by direct POST, so the check goes
*inside*), Zod second, `revalidatePath('/admin/memory')` last.

**Code:**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  ADMIN_FACT_TEXT_MAX,
  composeRetraction,
  composeSlotRetirement,
  factPermissions,
  isPurgeConfirmed,
} from '@/lib/admin/memoryModel'
import {
  adminAppendFact,
  adminDeleteFact,
  adminDeleteSlot,
  adminReadFacts,
  adminReadSlot,
  adminReadSlots,
  adminUpdateFact,
  adminUpsertSlot,
} from '@/lib/admin/memoryStore'
import { canonicaliseSlotValue, slotFactCategory } from '@/lib/admin/memoryVocab'
import {
  factEditSchema,
  factInsertSchema,
  factPurgeSchema,
  factRetractSchema,
  promiseRemoveSchema,
  slotEditSchema,
  slotRetireSchema,
} from '@/lib/admin/schema'
import { jakartaDayOf } from '@/lib/date/ranges'
import { NINA_SLOT_PENDING_PROMISES, type NinaPendingPromisesSlot } from '@/lib/db/schema'
import { ADMIN_LEDGER_PAGE } from '@/lib/admin/memoryModel'

/**
 * `/admin/memory`'s write side — R24.
 *
 * Every action follows the same four lines, in this order and for these reasons:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists, and `proxy.ts` does not
 *                                 match `/admin` (phase 15 verified and deliberately kept that).
 *   2. Zod                      — every field, every time. The client is not a source of truth.
 *   3. the write                 — through `lib/admin/memoryStore.ts` only, so `source: 'admin'`
 *                                 cannot be forgotten (§5).
 *   4. `revalidatePath`          — re-renders THIS page. It is **not** how the edit reaches Nina:
 *                                 `loadNinaContext` reads both tables live on every turn with no
 *                                 cache anywhere on that path, so a committed row is in her next
 *                                 prompt with no invalidation step at all (§1).
 *
 * ── THE ONE THING TO NOT REORDER ────────────────────────────────────────────────────────────
 * `retractFactAction` and `retireSlotAction` each perform TWO statements that are not in one
 * transaction (phase 1 exposes them as two functions; `runBatch` is not on this path). **The
 * append comes first, always.** The appended row contains the original text verbatim, so a crash
 * between the two leaves a recoverable duplicate rather than a hole. Reversed, a crash loses the
 * sentence for good, and R4's "permanently" is exactly the promise that would break.
 */

export interface AdminMemoryResult {
  ok: boolean
  error?: string
  /** What the row now says, so the client can show the canonical form without a refetch. */
  canonical?: string
  /** One sentence about what else was written — the ledger record a retraction or retirement left. */
  note?: string
  /** The id of a row this action created. */
  id?: string
}

/** Every action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(where: string, cause: unknown): AdminMemoryResult {
  console.error(`[f33] admin memory ${where} failed`, cause)
  return { ok: false, error: 'The write failed and nothing was changed. Try again.' }
}

/* ── slots ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Save a slot — an upsert, so this is both "edit the value" and "insert a slot by hand". There is
 * no separate insert action, because `(user_id, key)` is the primary key and the vocabulary is
 * closed: every card the page can save into already exists as a card (Step 3's `buildSlotCards`).
 *
 * The canonicalisation is phase 5's, run here because phase 5's ruling (b) puts the round trip on
 * the WRITER. A refused value is reported, not converted (§3).
 */
export async function saveSlotAction(input: {
  userId: string
  key: string
  value: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = slotEditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a slot edit this page can make.' }
  const { userId, key, value } = parsed.data

  const canonical = canonicaliseSlotValue(key, value)
  if (!canonical.ok) return { ok: false, error: canonical.reason }

  try {
    await adminUpsertSlot(userId, { key, value: canonical.value })
  } catch (cause) {
    return failed('saveSlot', cause)
  }

  revalidatePath('/admin/memory')
  return {
    ok: true,
    canonical: canonical.value,
    note:
      canonical.value === value.trim()
        ? 'Saved. The distiller will not overwrite it.'
        : `Saved as "${canonical.value}" — that is the canonical form, and it parses back.`,
  }
}

/**
 * The explicit fallback for a refused slot value: record it in the ledger instead. This is phase
 * 5's own degradation ("a write whose raw text does not parse is refused as a slot and appended to
 * the ledger instead"), taken by a second button rather than silently, because a human is present.
 */
export async function recordSlotAsFactAction(input: {
  userId: string
  key: string
  value: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = slotEditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not something this page can record.' }
  const { userId, key, value } = parsed.data

  const text = value.replace(/\s+/g, ' ').trim().slice(0, ADMIN_FACT_TEXT_MAX)
  if (text.length === 0) return { ok: false, error: 'Nothing to record.' }

  try {
    const row = await adminAppendFact(userId, {
      category: slotFactCategory(key),
      text,
      confidence: 100,
    })
    if (row == null) return { ok: false, error: 'The ledger did not accept it. Nothing changed.' }
    revalidatePath('/admin/memory')
    return {
      ok: true,
      id: row.id,
      note: 'Recorded in the ledger. She will read it, but no rule reads it as a slot.',
    }
  } catch (cause) {
    return failed('recordSlotAsFact', cause)
  }
}

/**
 * Retire a slot — §4. **Append the record, then delete the row.** This is the only way a slot
 * leaves the table on this page: a bare delete would remove a sentence from the app entirely, and
 * a slot is in Nina's prompt on every single turn, so removing one is a real change to what she
 * knows.
 *
 * The value is read from `adminReadSlots` rather than `adminReadSlot` on purpose: the list read
 * returns the value already RENDERED to the display string (`renderSlotValue`), which is what the
 * record should quote, while the single read returns it parsed.
 */
export async function retireSlotAction(input: {
  userId: string
  key: string
  reason: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = slotRetireSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a slot this page can retire.' }
  const { userId, key, reason } = parsed.data

  try {
    const rows = await adminReadSlots(userId)
    const row = rows.find((candidate) => candidate.key === key)
    if (row == null) return { ok: false, error: 'There is no such slot, so nothing was removed.' }

    const text = composeSlotRetirement({
      key,
      value: row.value,
      reason,
      on: jakartaDayOf(new Date()),
    })

    // ── APPEND FIRST. See the header. ──
    const record = await adminAppendFact(userId, {
      category: slotFactCategory(key),
      text,
      confidence: 100,
    })
    if (record == null) {
      return {
        ok: false,
        error: 'Could not record the slot in the ledger, so it was NOT removed. Nothing changed.',
      }
    }

    const removed = await adminDeleteSlot(userId, key)
    revalidatePath('/admin/memory')
    return {
      ok: true,
      id: record.id,
      note: removed
        ? 'Recorded in the ledger, then removed from her prompt.'
        : 'Recorded in the ledger. The slot row was already gone.',
    }
  } catch (cause) {
    return failed('retireSlot', cause)
  }
}

/**
 * Remove one entry from `pending_promises` — the only surgical operation on a `merge` slot, and
 * the only way an entry can ever leave it, because `mergePendingPromises` appends and never
 * discards (phase 5's ruling (c) rule 3).
 *
 * Written back with `source: 'admin'`, which phase 5's stickiness then preserves through every
 * later merge — an honest record that a human touched this row. The removed `id` does not come
 * back: the merge matches candidates by `id`, and a fresh candidate only appears if the runner
 * states the promise again in a later turn, which is a new promise and should reappear.
 *
 * No retraction record is appended here, and that is deliberate: a promise is *structured state*
 * about a future obligation, not a claim about the runner, and phase 13 writes an outcome row when
 * one is met. Recording "the admin deleted a promise" as a ledger FACT would put a sentence about
 * app administration into Nina's memory of her friend.
 */
export async function removePendingPromiseAction(input: {
  userId: string
  promiseId: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = promiseRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a promise id.' }
  const { userId, promiseId } = parsed.data

  try {
    const slot = await adminReadSlot(userId, NINA_SLOT_PENDING_PROMISES)
    if (slot == null) return { ok: false, error: 'There are no pending promises to remove.' }

    const current = slot.value as NinaPendingPromisesSlot
    const promises = Array.isArray(current?.promises) ? current.promises : []
    const next = promises.filter((promise) => promise.id !== promiseId)
    if (next.length === promises.length) {
      return { ok: false, error: 'No promise with that id. Nothing changed.' }
    }

    await adminUpsertSlot(userId, {
      key: NINA_SLOT_PENDING_PROMISES,
      value: { promises: next } satisfies NinaPendingPromisesSlot,
    })
    revalidatePath('/admin/memory')
    return { ok: true, note: `Removed. ${next.length} promise(s) left.` }
  } catch (cause) {
    return failed('removePendingPromise', cause)
  }
}
```

**Code, continued — the ledger half of the same file:**

```ts
/* ── the ledger ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Find one ledger row **without adding a query to phase 1's file.**
 *
 * There is no `getNinaMemoryFact(userId, id)` in `lib/nina/queries.ts` and this phase does not add
 * one: `lib/nina/queries.ts` is phase 1's and this phase touches no file it owns. Instead the row
 * is looked up in the same window the page rendered (`ADMIN_LEDGER_PAGE` newest rows), which is by
 * construction the set of rows the admin could have clicked a button on. A row older than that
 * window is not editable from this page, and the page says so under the table.
 */
async function findFact(userId: string, id: string) {
  const rows = await adminReadFacts(userId, ADMIN_LEDGER_PAGE)
  return rows.find((row) => row.id === id) ?? null
}

/**
 * **The backdoor, literally** — R24's *"this way, i can add some important data of myself through a
 * backdoor in admin page"*. A ledger row with no message behind it: `source: 'admin'`,
 * `source_message_id: null`.
 *
 * It lands in `nina_memory_facts` and therefore in `listNinaMemoryFacts`' newest 60, so **Nina
 * reads it on her very next turn** with nothing else to do. No distillation pass, no cache, no
 * deploy. And phase 5 imports neither `updateNinaMemoryFact` nor `deleteNinaMemoryFact`, so no
 * distillation can ever rewrite or remove it: the row is permanent by construction.
 */
export async function insertFactAction(input: {
  userId: string
  category: string
  text: string
  confidence: number
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = factInsertSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Pick a category and write something under 400 characters.' }
  }
  const { userId, category, text, confidence } = parsed.data

  try {
    const row = await adminAppendFact(userId, { category, text, confidence })
    if (row == null) return { ok: false, error: 'The ledger did not accept it. Nothing changed.' }
    revalidatePath('/admin/memory')
    return { ok: true, id: row.id, note: 'She reads this on her next turn.' }
  } catch (cause) {
    return failed('insertFact', cause)
  }
}

/**
 * In-place edit — **only for a row whose `source` is already `'admin'`** (§2). The eligibility
 * check is `factPermissions`, the same pure predicate the page used to decide whether to render
 * the button, so the UI and the server cannot disagree.
 *
 * A distilled row is refused here with its reason, not silently ignored, because the refusal is
 * the interesting part: *retract it instead, which keeps the original wording.*
 */
export async function editFactAction(input: {
  userId: string
  id: string
  category: string
  text: string
  confidence: number
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = factEditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not an edit this page can make.' }
  const { userId, id, category, text, confidence } = parsed.data

  try {
    const row = await findFact(userId, id)
    if (row == null) return { ok: false, error: 'That row is not in the ledger window.' }

    const permissions = factPermissions(row)
    if (!permissions.canEditInPlace) return { ok: false, error: permissions.editNote }

    const updated = await adminUpdateFact(userId, id, { category, text, confidence })
    if (!updated) return { ok: false, error: 'Nothing was updated.' }

    revalidatePath('/admin/memory')
    return { ok: true, canonical: text, note: 'Updated in place.' }
  } catch (cause) {
    return failed('editFact', cause)
  }
}

/**
 * **Retract — the answer to "i can edit inaccurate / stale data", and the mechanism that keeps R4
 * and R24 from destroying each other.** Two statements, in this order and never the other:
 *
 *   1. APPEND an admin row whose text QUOTES the original verbatim (`composeRetraction`).
 *   2. DELETE the original row.
 *
 * What a reader sees afterwards: the wrong sentence is gone from the newest-60 window Nina reads,
 * and in its place is a row saying what was wrong and (if given) what is actually true, with the
 * old wording quoted inside it. Nothing was lost — the retraction row is itself append-only and
 * unreachable from the distiller, so it is now the permanent record of both the claim and its
 * correction.
 *
 * Why the delete is necessary rather than optional: `loadNinaContext` passes every one of the
 * newest 60 rows into the prompt and reads no `confidence` (§1). Leaving the bad row in place —
 * "superseded" only by a later row — means she is handed both sentences and has to guess, which is
 * not a correction. Deleting the row it quotes is what makes the retraction take effect.
 */
export async function retractFactAction(input: {
  userId: string
  id: string
  replacement: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = factRetractSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a retraction this page can make.' }
  const { userId, id, replacement } = parsed.data

  try {
    const row = await findFact(userId, id)
    if (row == null) return { ok: false, error: 'That row is not in the ledger window.' }

    const text = composeRetraction({
      original: row.text,
      replacement,
      on: jakartaDayOf(new Date()),
    })

    // ── APPEND FIRST. The original's wording lives in this row before the row holding it goes. ──
    const record = await adminAppendFact(userId, {
      category: row.category,
      text,
      confidence: 100,
    })
    if (record == null) {
      return {
        ok: false,
        error:
          'Could not write the retraction, so the original was NOT removed. Nothing changed — ' +
          'which is the safe outcome. Try again.',
      }
    }

    const removed = await adminDeleteFact(userId, id)
    revalidatePath('/admin/memory')
    return {
      ok: true,
      id: record.id,
      note: removed
        ? 'Retraction recorded and the original row removed. Her next turn reads the correction.'
        : 'Retraction recorded. The original row was already gone.',
    }
  } catch (cause) {
    return failed('retractFact', cause)
  }
}

/**
 * **Purge — the one operation in this application that loses text.** No record, no quote, no
 * trace: `deleteNinaMemoryFact` and nothing else.
 *
 * It exists because retract cannot serve one real case — text the runner wants *gone*, where a
 * retraction quoting it verbatim would defeat the request. It is gated on typing
 * `ADMIN_PURGE_CONFIRMATION` verbatim, it is named `purge` rather than `delete` so the UI never
 * offers it as the cheap-looking option next to retract, and the page labels it "loses the text
 * permanently".
 *
 * `isPurgeConfirmed` rather than a Zod literal, so the refusal can be a sentence that explains
 * itself instead of a field error.
 */
export async function purgeFactAction(input: {
  userId: string
  id: string
  confirm: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = factPurgeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a row this page can purge.' }
  const { userId, id, confirm } = parsed.data

  if (!isPurgeConfirmed(confirm)) {
    return {
      ok: false,
      error:
        'Type PURGE to confirm. This one deletes the text with no record — use Retract if you ' +
        'want the correction kept.',
    }
  }

  try {
    const removed = await adminDeleteFact(userId, id)
    if (!removed) return { ok: false, error: 'That row is no longer in the ledger.' }
    revalidatePath('/admin/memory')
    return { ok: true, note: 'Purged. Nothing about it survives.' }
  } catch (cause) {
    return failed('purgeFact', cause)
  }
}
```

**Impact:** eight POST endpoints exist. All eight are 404 to a non-admin (phase 15's
`requireAdmin()` calls `notFound()`), all eight validate every field, and none of them can write a
`'distilled'` row or delete a ledger row without a record having been committed first — except
`purgeFactAction`, which is the documented exception and says so on screen.

---

### Step 7: `app/admin/memory/page.tsx` and `components/admin/UserPicker.tsx`

**File:** `app/admin/memory/page.tsx` (new), `components/admin/UserPicker.tsx` (new)
**Change:** the Server Component — gate, resolve `?user`, read both tables, build the cards, hand
them down. It renders inside phase 15's `app/admin/layout.tsx` and adds no shell of its own.

**Code — `app/admin/memory/page.tsx`:**

```tsx
import { MemoryLedger } from '@/components/admin/MemoryLedger'
import { MemorySlots } from '@/components/admin/MemorySlots'
import { UserPicker } from '@/components/admin/UserPicker'
import {
  ADMIN_LEDGER_PAGE,
  factPermissions,
  type FactCard,
} from '@/lib/admin/memoryModel'
import { adminReadFacts, adminReadSlot, adminReadSlots } from '@/lib/admin/memoryStore'
import { buildSlotCards } from '@/lib/admin/memoryVocab'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { getAdminUser, listAdminUsers } from '@/lib/admin/users'
import {
  NINA_SLOT_PENDING_PROMISES,
  type NinaPendingPromise,
  type NinaPendingPromisesSlot,
} from '@/lib/db/schema'

/**
 * `/admin/memory` — R24 in full: *"admin can see the persistent memory that is collected for each
 * user. and admin can edit them as well."*
 *
 * ── ONE ROUTE, A `?user=` PARAM ─────────────────────────────────────────────────────────────
 * There is one user today, so `/admin/memory/[userId]` would make the picker a mandatory
 * click-through past a list of one. The page is nonetheless per-user in every respect: the param
 * is validated, `getAdminUser` confirms the account exists, and every read and write below takes
 * that id FIRST (invariant 7). Absent `?user`, the default is **the signed-in admin's own id** —
 * deterministic, and exactly the account R24's backdoor is about. "First user by email" was
 * rejected: a second account signing in would silently move the default.
 *
 * ── `force-dynamic` ─────────────────────────────────────────────────────────────────────────
 * The page is per-request state that must reflect the action that just ran, exactly like
 * `/admin/nina`. `revalidatePath('/admin/memory')` in each action makes that immediate.
 *
 * ── WHY THE CARDS ARE BUILT HERE AND NOT IN THE COMPONENTS ──────────────────────────────────
 * `buildSlotCards` reads phase 5's `NINA_SLOT_SPECS`, which reaches zod and `lib/db/schema.ts`.
 * Building the cards on the server means the `'use client'` components below receive plain
 * serializable props and import only `lib/admin/memoryModel.ts` (zero value imports), so no part
 * of the vocabulary or the drizzle schema is ever bundled for the browser.
 */

export const dynamic = 'force-dynamic'

export default async function AdminMemoryPage(props: PageProps<'/admin/memory'>) {
  const { userId: adminUserId } = await requireAdmin()

  const search = await props.searchParams
  const requested = typeof search.user === 'string' ? search.user : null
  const targetId = requested ?? adminUserId

  const [users, target] = await Promise.all([listAdminUsers(), getAdminUser(targetId)])

  if (target == null) {
    return (
      <div>
        <Header />
        <UserPicker users={users} selectedId={null} />
        <p className="mt-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          No account with that id. Pick one above — this is &ldquo;which user&rsquo;s memory&rdquo;,
          not &ldquo;no memory&rdquo;.
        </p>
      </div>
    )
  }

  const [slotRows, factRows, promisesSlot] = await Promise.all([
    adminReadSlots(target.id),
    adminReadFacts(target.id, ADMIN_LEDGER_PAGE),
    adminReadSlot(target.id, NINA_SLOT_PENDING_PROMISES),
  ])

  const slots = buildSlotCards(slotRows)

  const promises: NinaPendingPromise[] = (() => {
    if (promisesSlot == null) return []
    const value = promisesSlot.value as NinaPendingPromisesSlot
    return Array.isArray(value?.promises) ? value.promises : []
  })()

  // `NinaFactRow` carries a `Date`; the card carries a string, so nothing about serialization
  // depends on how the RSC boundary treats `Date` today.
  const facts: FactCard[] = factRows.map((row) => {
    const permissions = factPermissions(row)
    return {
      id: row.id,
      category: row.category,
      text: row.text,
      confidence: row.confidence,
      origin: row.source,
      sourceMessageId: row.sourceMessageId,
      createdAt: row.createdAt.toISOString(),
      canEditInPlace: permissions.canEditInPlace,
      editNote: permissions.editNote,
    }
  })

  const hidden = Math.max(0, target.facts - facts.length)

  return (
    <div>
      <Header />
      <UserPicker users={users} selectedId={target.id} />

      <div className="mt-8 space-y-8">
        <MemorySlots userId={target.id} slots={slots} promises={promises} />
        <MemoryLedger userId={target.id} facts={facts} hiddenCount={hidden} total={target.facts} />
      </div>
    </div>
  )
}

/**
 * Split out only so the "no such user" branch above and the normal branch share it verbatim. It
 * says the two things the admin has to know before touching anything: this writes production, and
 * her next turn reads it.
 */
function Header() {
  return (
    <header className="mb-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Memory</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Everything Nina has kept: the nine <strong>slots</strong> she is handed on every turn, and
        the append-only <strong>ledger</strong> of what she has been told. Edits here write
        production and she reads them on her very next message — there is no distillation pass and
        no cache in between.
      </p>
    </header>
  )
}
```

**Code — `components/admin/UserPicker.tsx`:**

```tsx
import Link from 'next/link'

import { cn } from '@/lib/cn'
import type { AdminUserRow } from '@/lib/admin/users'

/**
 * Which user's memory. Server-rendered plain links, no `'use client'` and no `usePathname()` — the
 * same argument phase 15's `AdminNav` makes for not going client to bold one word, and the same
 * "a plain-text link, never an icon button" stance from `docs/design-brief.md`.
 *
 * It renders even when there is one account, because the page is per-user by contract (invariant
 * 7) and hiding the picker would make that invisible. One row is a fine list.
 */
export function UserPicker({
  users,
  selectedId,
}: {
  users: readonly AdminUserRow[]
  selectedId: string | null
}) {
  if (users.length === 0) {
    return (
      <p className="text-[13px] font-medium text-ink-3">
        No accounts yet. Sign in once and this page has something to show.
      </p>
    )
  }

  return (
    <nav aria-label="Which user" className="flex flex-wrap gap-2">
      {users.map((user) => {
        const selected = user.id === selectedId
        return (
          <Link
            key={user.id}
            href={`/admin/memory?user=${encodeURIComponent(user.id)}`}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'rounded-field border px-3 py-2 text-[13px] font-semibold transition-colors',
              selected
                ? 'border-accent bg-card text-ink'
                : 'border-rule text-ink-2 hover:bg-card hover:text-ink',
            )}
          >
            {user.name ?? user.email ?? user.id}
            <span className="ml-2 font-medium text-ink-3">
              {user.slots} slots &middot; {user.facts} facts
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
```

**Impact:** `/admin/memory` renders, and `/admin/memory?user=<anything-else>` 404s for a non-admin
and says "no such account" for an admin with a bad id. Two new files, nothing existing touched.
`PageProps<'/admin/memory'>` comes from `next typegen`, which `npm run typecheck` runs first.

---

### Step 8a: `components/admin/MemorySlots.tsx`

**File:** `components/admin/MemorySlots.tsx` (new)
**Change:** nine editable slot cards, the orphaned section, and the promises panel. Imports only
`lib/admin/memoryModel.ts` (zero value imports), `lib/admin/memoryActions.ts` and
`components/ui` — no vocabulary, no schema, no drizzle in the bundle.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { Button, Card, CONTROL_CLASS, Field } from '@/components/ui'
import { cn } from '@/lib/cn'
import { ADMIN_SLOT_VALUE_MAX, type SlotCard } from '@/lib/admin/memoryModel'
import {
  recordSlotAsFactAction,
  removePendingPromiseAction,
  retireSlotAction,
  saveSlotAction,
  type AdminMemoryResult,
} from '@/lib/admin/memoryActions'
import type { NinaPendingPromise } from '@/lib/db/schema'

/**
 * The upserted half of RU-6, editable — R24's *"i can edit inaccurate / stale data about myself"*.
 *
 * Every card is one `<textarea>` and two or three buttons. There is no "add a slot" form and that
 * is deliberate: phase 5's vocabulary is closed, the page already renders an empty card for each
 * of the nine keys, and a free-text key field would manufacture exactly the orphaned rows the
 * bottom section exists to clean up.
 *
 * `useTransition` rather than `<form action={…}>`: phase 15's album manager established the
 * plain-argument + `AdminMemoryResult` shape on the sibling admin page, and a desktop-only tool
 * gains nothing from progressive enhancement that it does not lose in consistency. Validation is
 * still Zod on the server for every field.
 */

export function MemorySlots({
  userId,
  slots,
  promises,
}: {
  userId: string
  slots: readonly SlotCard[]
  promises: readonly NinaPendingPromise[]
}) {
  const known = slots.filter((slot) => slot.inVocabulary)
  const orphans = slots.filter((slot) => !slot.inVocabulary)

  return (
    <section>
      <h2 className="mb-1 text-[16px] font-semibold text-ink">Slots</h2>
      <p className="mb-4 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Nine keys, all nine handed to her on every turn. A value you write here is marked
        <code className="mx-1 text-ink">admin</code>and the distiller defers to it instead of
        overwriting it.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        {known.map((slot) =>
          slot.editKind === 'structured' ? (
            <PromisesPanel
              key={slot.key}
              userId={userId}
              slot={slot}
              promises={promises}
            />
          ) : (
            <SlotEditor key={slot.key} userId={userId} slot={slot} />
          ),
        )}
      </div>

      {orphans.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-1 text-[15px] font-semibold text-ink">Orphaned keys</h3>
          <p className="mb-4 max-w-[70ch] text-[13px] font-medium text-ink-2">
            Keys outside the nine. No rule reads them — but every slot row goes into her prompt, so
            <strong> she does</strong>. Retiring one records its value in the ledger and takes it
            out of her prompt.
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            {orphans.map((slot) => (
              <SlotEditor key={slot.key} userId={userId} slot={slot} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** `admin` / `distilled` / `not set`, plus what the distiller will do about it. */
function OriginBadge({ slot }: { slot: SlotCard }) {
  const label = slot.present ? slot.origin : 'not set'
  const protection =
    slot.protection === 'deferred'
      ? 'the distiller defers to this'
      : slot.protection === 'sticky'
        ? 'merges keep the admin label'
        : slot.present
          ? 'the next distillation may replace this'
          : ''

  return (
    <span className="text-[11px] font-medium text-ink-3">
      <span
        className={cn(
          'rounded-field px-1.5 py-0.5 font-semibold',
          slot.origin === 'admin' ? 'bg-accent/15 text-accent' : 'bg-paper-2 text-ink-2',
        )}
      >
        {label}
      </span>
      {protection && <span className="ml-2">{protection}</span>}
    </span>
  )
}

function SlotEditor({ userId, slot }: { userId: string; slot: SlotCard }) {
  const [draft, setDraft] = React.useState(slot.value)
  const [result, setResult] = React.useState<AdminMemoryResult | null>(null)
  const [retiring, setRetiring] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  // The server re-renders with the canonical value after every action, so the draft follows the
  // prop rather than diverging from it — a stale textarea next to a "saved as …" message is how a
  // second save writes the pre-canonical text back.
  React.useEffect(() => {
    setDraft(slot.value)
  }, [slot.value])

  const editable = slot.editKind === 'text'
  const dirty = draft !== slot.value

  function run(action: () => Promise<AdminMemoryResult>) {
    startTransition(async () => {
      setResult(await action())
    })
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{slot.label}</h3>
          <code className="text-[11px] font-medium text-ink-3">{slot.key}</code>
        </div>
        <OriginBadge slot={slot} />
      </div>

      <Field
        label="Value"
        hint={editable ? slot.hint : undefined}
        error={result?.ok === false ? result.error : undefined}
      >
        <textarea
          className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
          value={draft}
          maxLength={ADMIN_SLOT_VALUE_MAX}
          disabled={!editable || pending}
          onChange={(event) => setDraft(event.target.value)}
        />
      </Field>

      {!editable && <p className="mt-2 text-[11px] font-medium text-ink-3">{slot.hint}</p>}

      {result?.ok === true && result.note && (
        <p className="mt-2 text-[11px] font-semibold text-accent">{result.note}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editable && (
          <Button
            disabled={pending || !dirty || draft.trim().length === 0}
            onClick={() => run(() => saveSlotAction({ userId, key: slot.key, value: draft }))}
          >
            Save
          </Button>
        )}

        {/* Phase 5's own fallback for a refused value, offered explicitly rather than silently. */}
        {editable && result?.ok === false && draft.trim().length > 0 && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(() => recordSlotAsFactAction({ userId, key: slot.key, value: draft }))
            }
          >
            Record it as a fact instead
          </Button>
        )}

        {slot.present && !retiring && (
          <Button variant="ghost" disabled={pending} onClick={() => setRetiring(true)}>
            Retire
          </Button>
        )}
      </div>

      {retiring && (
        <div className="mt-3 rounded-card border border-rule bg-paper-2 p-3">
          <p className="mb-2 text-[12px] font-medium text-ink-2">
            The value is recorded in the ledger first, then the slot is removed from her prompt.
            Nothing is lost.
          </p>
          <Field label="Why (optional)">
            <input
              className={CONTROL_CLASS}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
                disabled={pending}
              onClick={() => {
                run(() => retireSlotAction({ userId, key: slot.key, reason }))
                setRetiring(false)
                setReason('')
              }}
            >
              Record and retire
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setRetiring(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/**
 * `pending_promises` — read-only JSON, plus per-entry removal.
 *
 * Not editable as text because phase 5's `canonicalise` returns `null` for this key on purpose
 * ("a string is never a promise"): phase 13 has to evaluate `metric`, `target` and `byDate`
 * against precomputed facts, and a sentence cannot be evaluated. Removal is the one operation that
 * has to exist here — the slot is `merge` policy, so nothing in the runtime can ever drop an entry.
 */
function PromisesPanel({
  userId,
  slot,
  promises,
}: {
  userId: string
  slot: SlotCard
  promises: readonly NinaPendingPromise[]
}) {
  const [result, setResult] = React.useState<AdminMemoryResult | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{slot.label}</h3>
          <code className="text-[11px] font-medium text-ink-3">{slot.key}</code>
        </div>
        <OriginBadge slot={slot} />
      </div>

      <p className="mb-3 text-[11px] font-medium text-ink-3">{slot.hint}</p>

      {promises.length === 0 ? (
        <p className="text-[13px] font-medium text-ink-2">No pending promises.</p>
      ) : (
        <ul className="space-y-2">
          {promises.map((promise) => (
            <li key={promise.id} className="rounded-card border border-rule bg-paper-2 p-3">
              <p className="text-[13px] font-semibold text-ink">{promise.text}</p>
              <p className="mt-1 text-[12px] font-medium text-ink-2">{promise.condition}</p>
              <p className="mt-1 text-[11px] font-medium text-ink-3">
                {promise.status} &middot; {promise.metric}
                {promise.target !== null && <> &middot; target {promise.target}</>}
                {promise.targetKey !== null && <> &middot; {promise.targetKey}</>}
                {promise.byDate !== null && <> &middot; by {promise.byDate}</>}
                {' '}&middot; promised {promise.promisedOn}
              </p>
              <Button
                    variant="ghost"
                className="mt-2"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setResult(await removePendingPromiseAction({ userId, promiseId: promise.id }))
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {result?.ok === false && (
        <p className="mt-2 text-[11px] font-semibold text-red">{result.error}</p>
      )}
      {result?.ok === true && result.note && (
        <p className="mt-2 text-[11px] font-semibold text-accent">{result.note}</p>
      )}
    </Card>
  )
}
```

**Impact:** the slot half of the page works. **Verified against `components/ui/Button.tsx` on
`main`:** `ButtonVariant` is `'primary' | 'secondary' | 'ghost' | 'destructive'` (line 12) and
`ButtonSize` is **`'md' | 'lg'` only** (line 14) — there is no `sm`, so every button here takes the
default size and no size prop appears. `text-red` resolves through `--color-red: var(--red)`
(`app/globals.css:109`), so the error colour is a token and not a hex. `components/ui/**` is not
this phase's to edit and gains nothing.

---

### Step 8b: `components/admin/MemoryLedger.tsx`

**File:** `components/admin/MemoryLedger.tsx` (new)
**Change:** the ledger table, the hand-insert form (the backdoor), and the three row operations
with retract as the primary one and purge visibly the lossy one.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { Button, Card, CONTROL_CLASS, Field } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  ADMIN_FACT_CATEGORIES,
  ADMIN_FACT_TEXT_MAX,
  ADMIN_PURGE_CONFIRMATION,
  type FactCard,
} from '@/lib/admin/memoryModel'
import {
  editFactAction,
  insertFactAction,
  purgeFactAction,
  retractFactAction,
  type AdminMemoryResult,
} from '@/lib/admin/memoryActions'

/**
 * The append-only half of RU-6 — R4's *"PERMANENTLY"* — made editable without becoming lossy.
 *
 * Three operations, and the UI is deliberately asymmetric about them:
 *
 *   **Retract** is the primary button on every row. It appends a record quoting the original and
 *   then removes the original, so the wording survives and the wrong sentence stops reaching her.
 *   **Edit** appears only on rows you wrote yourself. A distilled row points at the message it came
 *   from, and rewriting its text would make it misquote that message.
 *   **Purge** is small, last, and asks you to type PURGE. It is the only thing in this application
 *   that loses text.
 */

export function MemoryLedger({
  userId,
  facts,
  hiddenCount,
  total,
}: {
  userId: string
  facts: readonly FactCard[]
  hiddenCount: number
  total: number
}) {
  return (
    <section>
      <h2 className="mb-1 text-[16px] font-semibold text-ink">Ledger</h2>
      <p className="mb-4 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Everything she has been told, newest first. She reads the newest 60 on every turn. Nothing
        here is ever rewritten by the distiller — a row marked <code className="text-ink">admin</code>
        is unreachable from it entirely.
      </p>

      <InsertFact userId={userId} />

      <div className="mt-6 space-y-3">
        {facts.length === 0 ? (
          <p className="rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
            The ledger is empty. Add the first row above — she will read it on her next turn.
          </p>
        ) : (
          facts.map((fact) => <FactRow key={fact.id} userId={userId} fact={fact} />)
        )}
      </div>

      {hiddenCount > 0 && (
        <p className="mt-4 text-[12px] font-medium text-ink-3">
          Showing the newest {facts.length} of {total}. {hiddenCount} older row(s) are not listed
          and cannot be edited from this page.
        </p>
      )}
    </section>
  )
}

/** R24's backdoor: a fact with nothing in the chat behind it. */
function InsertFact({ userId }: { userId: string }) {
  const [category, setCategory] = React.useState<(typeof ADMIN_FACT_CATEGORIES)[number]>('person')
  const [text, setText] = React.useState('')
  const [confidence, setConfidence] = React.useState(100)
  const [result, setResult] = React.useState<AdminMemoryResult | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink">Tell her something directly</h3>
      <p className="mt-1 mb-3 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Goes straight into the ledger as <code className="text-ink">admin</code>, with no message
        behind it. She reads it on her next turn and no distillation can ever remove it.
      </p>

      <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_120px]">
        <Field label="Category">
          <select
            className={cn(CONTROL_CLASS, 'appearance-none')}
            value={category}
            disabled={pending}
            onChange={(event) =>
              setCategory(event.target.value as (typeof ADMIN_FACT_CATEGORIES)[number])
            }
          >
            {ADMIN_FACT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fact" error={result?.ok === false ? result.error : undefined}>
          <textarea
            className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
            value={text}
            maxLength={ADMIN_FACT_TEXT_MAX}
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>

        <Field label="Confidence" suffix="%">
          <input
            className={CONTROL_CLASS}
            type="number"
            min={0}
            max={100}
            step={1}
            value={confidence}
            disabled={pending}
            onChange={(event) => setConfidence(Number(event.target.value))}
          />
        </Field>
      </div>

      {result?.ok === true && result.note && (
        <p className="mt-2 text-[11px] font-semibold text-accent">{result.note}</p>
      )}

      <Button
        className="mt-3"
        disabled={pending || text.trim().length === 0}
        onClick={() =>
          startTransition(async () => {
            const next = await insertFactAction({ userId, category, text, confidence })
            setResult(next)
            if (next.ok) setText('')
          })
        }
      >
        Add to the ledger
      </Button>
    </Card>
  )
}

type RowMode = 'idle' | 'edit' | 'retract' | 'purge'

function FactRow({ userId, fact }: { userId: string; fact: FactCard }) {
  const [mode, setMode] = React.useState<RowMode>('idle')
  const [text, setText] = React.useState(fact.text)
  const [category, setCategory] = React.useState(fact.category)
  const [confidence, setConfidence] = React.useState(fact.confidence)
  const [replacement, setReplacement] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [result, setResult] = React.useState<AdminMemoryResult | null>(null)
  const [pending, startTransition] = React.useTransition()

  function run(action: () => Promise<AdminMemoryResult>) {
    startTransition(async () => {
      const next = await action()
      setResult(next)
      if (next.ok) setMode('idle')
    })
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-3">
          <span
            className={cn(
              'rounded-field px-1.5 py-0.5 font-semibold',
              fact.origin === 'admin' ? 'bg-accent/15 text-accent' : 'bg-paper-2 text-ink-2',
            )}
          >
            {fact.origin}
          </span>
          <span className="ml-2">{fact.category}</span>
          <span className="ml-2">{fact.confidence}%</span>
          <span className="ml-2">{fact.createdAt.slice(0, 10)}</span>
          {fact.sourceMessageId === null ? (
            <span className="ml-2">no message behind it</span>
          ) : (
            <span className="ml-2">from a message</span>
          )}
        </span>
      </div>

      <p className="mt-2 text-[14px] leading-snug font-medium text-ink">{fact.text}</p>

      {result?.ok === false && (
        <p className="mt-2 text-[11px] font-semibold text-red">{result.error}</p>
      )}
      {result?.ok === true && result.note && (
        <p className="mt-2 text-[11px] font-semibold text-accent">{result.note}</p>
      )}

      {mode === 'idle' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={pending} onClick={() => setMode('retract')}>
            Retract
          </Button>
          {fact.canEditInPlace && (
            <Button variant="secondary" disabled={pending} onClick={() => setMode('edit')}>
              Edit
            </Button>
          )}
          {!fact.canEditInPlace && (
            <span className="max-w-[52ch] text-[11px] font-medium text-ink-3">{fact.editNote}</span>
          )}
          <Button variant="ghost" disabled={pending} onClick={() => setMode('purge')}>
            Purge
          </Button>
        </div>
      )}

      {mode === 'retract' && (
        <div className="mt-3 rounded-card border border-rule bg-paper-2 p-3">
          <p className="mb-2 max-w-[70ch] text-[12px] font-medium text-ink-2">
            A new row is written that quotes this one word for word, then this row is removed. The
            wording survives; the wrong sentence stops reaching her. Leave the box empty for a plain
            retraction.
          </p>
          <Field label="What is actually true (optional)">
            <textarea
              className={cn(CONTROL_CLASS, 'min-h-[64px] resize-y py-2 leading-snug')}
              value={replacement}
              maxLength={ADMIN_FACT_TEXT_MAX}
              disabled={pending}
              onChange={(event) => setReplacement(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              disabled={pending}
              onClick={() => run(() => retractFactAction({ userId, id: fact.id, replacement }))}
            >
              Record the retraction
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="mt-3 rounded-card border border-rule bg-paper-2 p-3">
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_120px]">
            <Field label="Category">
              <select
                className={cn(CONTROL_CLASS, 'appearance-none')}
                value={category}
                disabled={pending}
                onChange={(event) => setCategory(event.target.value as FactCard['category'])}
              >
                {ADMIN_FACT_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Text">
              <textarea
                className={cn(CONTROL_CLASS, 'min-h-[64px] resize-y py-2 leading-snug')}
                value={text}
                maxLength={ADMIN_FACT_TEXT_MAX}
                disabled={pending}
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
            <Field label="Confidence" suffix="%">
              <input
                className={CONTROL_CLASS}
                type="number"
                min={0}
                max={100}
                step={1}
                value={confidence}
                disabled={pending}
                onChange={(event) => setConfidence(Number(event.target.value))}
              />
            </Field>
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              disabled={pending || text.trim().length === 0}
              onClick={() =>
                run(() => editFactAction({ userId, id: fact.id, category, text, confidence }))
              }
            >
              Save
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'purge' && (
        <div className="mt-3 rounded-card border border-red/40 bg-paper-2 p-3">
          <p className="mb-2 max-w-[70ch] text-[12px] font-semibold text-red">
            Purge loses this text permanently. No record, no quote, nothing left. If you want the
            correction kept, cancel and use Retract.
          </p>
          <Field label={`Type ${ADMIN_PURGE_CONFIRMATION} to confirm`}>
            <input
              className={CONTROL_CLASS}
              value={confirm}
              disabled={pending}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              variant="destructive"
              disabled={pending || confirm.trim() !== ADMIN_PURGE_CONFIRMATION}
              onClick={() => run(() => purgeFactAction({ userId, id: fact.id, confirm }))}
            >
              Purge
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
```

**Impact:** the ledger half works, and the visual hierarchy encodes §2 — retract is primary,
purge is a ghost button that turns into a red confirmation. `variant="destructive"` exists in
`components/ui/Button.tsx:12` and is used here for the only genuinely destructive action in the
app.

---

### Step 9: the two reserved edits — `AdminNav` and the `/admin` hub

**File:** `components/admin/AdminNav.tsx` (the `LINKS` array, near the top of phase 15's file —
`phase-15.md` Step 8), `app/admin/page.tsx` (inside the existing
`<div className="grid gap-4 sm:grid-cols-2">`)
**Change:** one array entry and one card. Phase 15 reserved both in writing: *"the one array phase
16 appends to — its `/admin/memory` entry goes in `LINKS` and nothing else about this file
changes"* and *"Phase 16 adds a second card for `/admin/memory`."*

**Code — `components/admin/AdminNav.tsx`, the `LINKS` array in full after the edit:**

```tsx
const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/nina', label: "Nina's album" },
  { href: '/admin/memory', label: 'Memory' },
] as const
```

Phase 15's comment on that file says active-link highlighting can be revisited "when there are
five". There are three. It is not revisited here, and the component stays a Server Component.

**Code — `app/admin/page.tsx`, in full after the edit:**

```tsx
import Link from 'next/link'

import { Card } from '@/components/ui'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { getAdminUser } from '@/lib/admin/users'
import { getCurrentNinaAvatar, listNinaAvatars } from '@/lib/nina/queries'

/**
 * `/admin` — the hub. It exists because `/admin` would otherwise 404 for an admin, which reads as
 * the gate misfiring rather than as "there is no index here".
 *
 * Deliberately thin: two counts and a link, per card. Phase 16 added the memory card.
 */

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  const { userId, email } = await requireAdmin()
  const [album, current, me] = await Promise.all([
    listNinaAvatars(userId),
    getCurrentNinaAvatar(userId),
    getAdminUser(userId),
  ])

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Admin</h1>
        <p className="mt-1 text-[13px] font-medium text-ink-2">
          Signed in as {email}. Everything here writes production.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Nina&rsquo;s album</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {album.length === 0
              ? 'Empty — she is still using the committed photo.'
              : `${album.length} photo${album.length === 1 ? '' : 's'}, ${
                  current ? 'one current' : 'none current'
                }.`}
          </p>
          <Link href="/admin/nina" className="text-[13px] font-semibold text-accent">
            Manage the album &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Memory</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {me === null
              ? 'Nothing kept yet.'
              : `${me.slots} slot${me.slots === 1 ? '' : 's'} and ${me.facts} ledger row${
                  me.facts === 1 ? '' : 's'
                } for your account.`}
          </p>
          <Link href="/admin/memory" className="text-[13px] font-semibold text-accent">
            Read and edit her memory &rarr;
          </Link>
        </Card>
      </div>
    </div>
  )
}
```

**Impact:** two additive edits to phase 15's files, both of which phase 15 named in advance. No
existing line is modified in either.

---

### Step 10: `tests/admin.memory.test.ts`

**File:** `tests/admin.memory.test.ts` (new; `vitest.config.ts:37` includes `tests/**/*.test.ts`)
**Change:** the pure model, the composers, the canonicalise round trip, and the three structural
assertions of §5. Invariant 6 holds: `environment: 'node'`, no jsdom, so nothing here renders a
component.

**Code:**

```ts
import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  ADMIN_FACT_CATEGORIES,
  ADMIN_FACT_TEXT_MAX,
  ADMIN_PURGE_CONFIRMATION,
  ADMIN_RETRACTION_TEXT_MAX,
  composeRetraction,
  composeSlotRetirement,
  factPermissions,
  isPurgeConfirmed,
} from '@/lib/admin/memoryModel'
import {
  buildSlotCards,
  canonicaliseSlotValue,
  slotEditKind,
  slotFactCategory,
  slotProtection,
} from '@/lib/admin/memoryVocab'
import {
  NINA_SLOT_KEYS,
  formatWorkHours,
  parseRunningDays,
  parseWorkHours,
} from '@/lib/nina/memory'

/**
 * `/admin/memory`'s testable surface — invariant 6's "testable here = pure functions".
 *
 * Cases 13–16 are STRUCTURAL: they read source files and assert an import boundary, the same
 * technique (and the same reason) as `tests/nina.distill.test.ts` case 14 — *a structural guarantee
 * that is only a comment decays.*
 */

describe('the fact category vocabulary', () => {
  it('has all seven of phase 1s categories, in a stable order', () => {
    expect(ADMIN_FACT_CATEGORIES).toEqual([
      'person',
      'preference',
      'body',
      'life',
      'goal',
      'training',
      'other',
    ])
  })
})

describe('factPermissions — §2s one rule', () => {
  it('lets the admin edit a row he wrote', () => {
    const permissions = factPermissions({ source: 'admin', sourceMessageId: null })
    expect(permissions.canEditInPlace).toBe(true)
    expect(permissions.canRetract).toBe(true)
    expect(permissions.canPurge).toBe(true)
  })

  it('refuses in-place editing of a distilled row, and says to retract instead', () => {
    const permissions = factPermissions({ source: 'distilled', sourceMessageId: 'msg_1' })
    expect(permissions.canEditInPlace).toBe(false)
    expect(permissions.canRetract).toBe(true)
    expect(permissions.editNote).toMatch(/retract/i)
  })

  it('still refuses a distilled row whose source message is null', () => {
    // `source` is the discriminator, not the presence of a message id. A distilled row with a null
    // message id is a distiller bug, not an admin row.
    expect(factPermissions({ source: 'distilled', sourceMessageId: null }).canEditInPlace).toBe(
      false,
    )
  })
})

describe('composeRetraction — the sentence that makes an edit non-destructive', () => {
  it('quotes the original verbatim in a pure retraction', () => {
    const text = composeRetraction({
      original: 'he only runs on weekends',
      replacement: '',
      on: '2026-09-03',
    })
    expect(text).toContain('"he only runs on weekends"')
    expect(text).toContain('2026-09-03')
  })

  it('carries both the truth and the original in a correction', () => {
    const text = composeRetraction({
      original: 'he only runs on weekends',
      replacement: 'he runs Tuesday and Thursday',
      on: '2026-09-03',
    })
    expect(text).toContain('he runs Tuesday and Thursday')
    expect(text).toContain('"he only runs on weekends"')
  })

  it('collapses whitespace so a pasted multi-line original does not break the row', () => {
    const text = composeRetraction({
      original: 'he\n  only   runs\ton weekends ',
      replacement: '',
      on: '2026-09-03',
    })
    expect(text).toContain('"he only runs on weekends"')
  })

  it('stays inside ADMIN_RETRACTION_TEXT_MAX at the worst case', () => {
    const text = composeRetraction({
      original: 'x'.repeat(ADMIN_FACT_TEXT_MAX),
      replacement: 'y'.repeat(ADMIN_FACT_TEXT_MAX),
      on: '2026-09-03',
    })
    expect(text.length).toBeLessThanOrEqual(ADMIN_RETRACTION_TEXT_MAX)
  })
})

describe('composeSlotRetirement — §4s record', () => {
  it('names the key and quotes the final value', () => {
    const text = composeSlotRetirement({
      key: 'favourite_shoe',
      value: 'Novablast 4',
      reason: '',
      on: '2026-09-03',
    })
    expect(text).toContain('"favourite_shoe"')
    expect(text).toContain('"Novablast 4"')
    expect(text).not.toContain('Reason:')
  })

  it('appends the reason when one is given', () => {
    const text = composeSlotRetirement({
      key: 'favourite_shoe',
      value: 'Novablast 4',
      reason: 'not one of the nine keys',
      on: '2026-09-03',
    })
    expect(text).toContain('Reason: not one of the nine keys')
  })
})

describe('isPurgeConfirmed — the one lossy gate', () => {
  it('accepts the word, trimmed', () => {
    expect(isPurgeConfirmed(ADMIN_PURGE_CONFIRMATION)).toBe(true)
    expect(isPurgeConfirmed('  PURGE  ')).toBe(true)
  })

  it('rejects anything else, including the lowercase form', () => {
    expect(isPurgeConfirmed('purge')).toBe(false)
    expect(isPurgeConfirmed('')).toBe(false)
    expect(isPurgeConfirmed('PURGE PLEASE')).toBe(false)
  })
})

describe('canonicaliseSlotValue — phase 5s round trip, on the admins keystrokes', () => {
  it('round-trips running_days so phase 10s trigger keeps working', () => {
    const result = canonicaliseSlotValue('running_days', 'tuesdays and thursdays')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // THE assertion this whole rule exists for: what we stored parses back to what he meant.
    expect(parseRunningDays(result.value)).toEqual(parseRunningDays('tuesdays and thursdays'))
    expect(parseRunningDays(result.value).length).toBeGreaterThan(0)
  })

  it('refuses running_days text with no weekday in it, and explains why it matters', () => {
    const result = canonicaliseSlotValue('running_days', 'kapan aja')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/cron|parse/i)
  })

  it('round-trips work_hours', () => {
    const result = canonicaliseSlotValue('work_hours', '08:00-17:00')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = parseWorkHours(result.value)
    expect(parsed).not.toBeNull()
    if (parsed === null) return
    expect(formatWorkHours(parsed)).toBe(result.value)
  })

  it('stores a nickname as a bare string, because getNinaIdentity typeof-checks it', () => {
    const result = canonicaliseSlotValue('nickname', 'Miftah')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(typeof result.value).toBe('string')
  })

  it('refuses pending_promises as text', () => {
    const result = canonicaliseSlotValue('pending_promises', 'he promised to change his photo')
    expect(result.ok).toBe(false)
  })

  it('refuses a key outside the nine', () => {
    const result = canonicaliseSlotValue('favourite_shoe', 'Novablast 4')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/retire/i)
  })
})

describe('the slot cards', () => {
  it('renders all nine keys as empty cards when there is no row at all', () => {
    const cards = buildSlotCards([])
    expect(cards).toHaveLength(NINA_SLOT_KEYS.length)
    expect(cards.map((card) => card.key)).toEqual([...NINA_SLOT_KEYS])
    expect(cards.every((card) => card.present === false)).toBe(true)
    expect(cards.every((card) => card.origin === null)).toBe(true)
  })

  it('puts an orphaned key after the nine, marked and retire-only', () => {
    const cards = buildSlotCards([
      {
        key: 'favourite_shoe',
        value: 'Novablast 4',
        source: 'distilled',
        sourceMessageId: 'msg_1',
        updatedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ])
    expect(cards).toHaveLength(NINA_SLOT_KEYS.length + 1)
    const orphan = cards[cards.length - 1]
    expect(orphan.key).toBe('favourite_shoe')
    expect(orphan.inVocabulary).toBe(false)
    expect(orphan.editKind).toBe('orphaned')
  })

  it('classifies the edit kind from phase 5s write policy, not from a key literal', () => {
    expect(slotEditKind('goals')).toBe('text')
    expect(slotEditKind('pending_promises')).toBe('structured')
    expect(slotEditKind('favourite_shoe')).toBe('orphaned')
  })

  it('reports phase 5s protection so the page can show it', () => {
    expect(slotProtection('goals', 'admin')).toBe('deferred')
    expect(slotProtection('pending_promises', 'admin')).toBe('sticky')
    expect(slotProtection('goals', 'distilled')).toBe('none')
    expect(slotProtection('goals', null)).toBe('none')
    expect(slotProtection('favourite_shoe', 'admin')).toBe('none')
  })

  it('maps a slot to phase 5s own fact category, and an orphan to other', () => {
    expect(slotFactCategory('injuries')).toBe('body')
    expect(slotFactCategory('favourite_shoe')).toBe('other')
  })
})

/* ── the structural half — §5 layer 3 ───────────────────────────────────────────────────────── */

const STORE = 'lib/admin/memoryStore.ts'
const ACTIONS = 'lib/admin/memoryActions.ts'
const MODEL = 'lib/admin/memoryModel.ts'

describe("source: 'admin' cannot be forgotten", () => {
  it('routes every memory write through memoryStore, never straight at phase 1', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).not.toMatch(/from '@\/lib\/nina\/queries'/)
    for (const writer of [
      'upsertNinaMemorySlot',
      'appendNinaMemoryFacts',
      'updateNinaMemoryFact',
      'deleteNinaMemoryFact',
      'deleteNinaMemorySlot',
    ]) {
      expect(source).not.toContain(writer)
    }
  })

  it("spells source: 'admin' on both write paths and never mentions 'distilled'", () => {
    const source = readFileSync(STORE, 'utf8')
    expect(source).not.toContain("'distilled'")
    // The slot upsert and the fact append. `adminUpdateFact` needs none: only an already-admin row
    // is editable, so there is nothing to relabel.
    expect(source.match(/source: 'admin'/g)).toHaveLength(2)
    expect(source.match(/sourceMessageId: null/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('is not reachable from anything under lib/nina, so phase 5s case 14 stays true', () => {
    for (const entry of readdirSync('lib/nina', { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
      const source = readFileSync(`lib/nina/${entry.name}`, 'utf8')
      expect(source).not.toContain('admin/memoryStore')
      expect(source).not.toContain('admin/memoryActions')
    }
  })

  it('keeps memoryModel client-safe: every import in it is a type import', () => {
    const source = readFileSync(MODEL, 'utf8')
    const imports = source.match(/^import .*$/gm) ?? []
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) expect(line.startsWith('import type ')).toBe(true)
  })
})
```

**Impact:** `npm test` gains ~25 cases and no new dependency. The four structural cases fail loudly
if a later change routes a write around the store, mentions `'distilled'` in `lib/admin/`, imports
the store from `lib/nina/`, or adds a value import to `memoryModel.ts`.

---

## Verification

**Build:** `npm run typecheck` (runs `next typegen` first, which is what mints
`PageProps<'/admin/memory'>`), then `npm run build`.
**Lint / format:** `npm run lint` and `npm run format:check`.
**Tests:** `npm test` — `tests/admin.memory.test.ts` plus the whole existing suite. Two suites
worth watching because this phase deliberately does not touch them and must not break them:
`tests/nina.distill.test.ts` (phase 5's case 14, the distiller's import list) and
`tests/admin.avatars.test.ts` (phase 15, which reads the file this phase appends to).

**Guards — every one, and why each is unaffected:**

| Command | Why it still passes |
|---|---|
| `npm run ci:data-layer-guard` | reads `lib/db/queries.ts` only (`scripts/check-data-layer-invariants.mjs:20`); this phase does not touch that file, and its one unscoped read lives in `lib/admin/users.ts` |
| `npm run ci:client-secret-guard` | no file here is `'use client'` *and* names a secret; nothing reads `process.env` directly; nothing is `NEXT_PUBLIC_`-prefixed; `ADMIN_EMAILS` is reached only through phase 15's `requireAdmin()`, which is `server-only` |
| `npm run ci:f08-guard` | no `recharts` import, no `yAxisId`, no interpolated unit and no `Intl.NumberFormat` — the only interpolated numbers on the page are `{fact.confidence}%` and the counts, and `%` is not in the guard's unit set (`km|kcal|bpm|spm`) |
| `npm run ci:llm-payload-guard` | no LLM call anywhere in this phase; `getOrCreateInsight` and `runNinaTurn` are not called |
| `npm run ci:openrouter-guard` | no OpenRouter usage |
| `npm run ci:f11-guard` | no share code touched |
| `npm run badges:check` | no badge art touched |

**Manual check** — the exit criteria, in order, against a dev server:

1. **Visible, per user.** `/admin/memory` shows the picker with one row, nine slot cards (empty
   ones included) and the ledger. `?user=<the other id>` — if a second account exists — shows that
   account's rows and nothing of the first's.
2. **A hand-inserted row is distinguishable.** Add a fact through the form. It renders with the
   `admin` badge and "no message behind it"; the distilled rows next to it say `distilled` and
   "from a message".
3. **It survives the next distillation pass.** Send Nina a message that contradicts the
   hand-written fact and let the `after()` distillation run. The admin row is **still there**
   (phase 5 imports neither mutating query), and the distiller's contradicting reading has been
   appended as a *new* row rather than replacing anything. Do the same with a slot: write `goals`
   by hand, then say something in chat that contradicts it — the slot still holds the admin value
   and the distiller's version appears in the ledger, which is phase 5's deferral working.
4. **An edit takes effect in Nina's very next turn.** Add a fact like "gw alergi kacang", then ask
   her about food in the very next message. No deploy, no cron, no cache flush — `loadNinaContext`
   read it live.
5. **Nothing is silently lost.** Retract a distilled fact with a replacement. The original row is
   gone from the table and a new admin row quotes it verbatim. Retire a slot: same shape, the value
   is in the ledger and the slot is out of her prompt. Purge one row and confirm the page says, and
   means, that nothing about it survives.
6. **A non-admin gets phase 15's refusal.** Sign in with an email not in `ADMIN_EMAILS`:
   `/admin/memory` is a 404, identical to `/admin/nonsense`. Sign out: `redirect('/')`. POST
   directly at a Server Action with a non-admin session: 404, because `requireAdmin()` is line one.

**Exit criteria:** `/admin/memory` lists every slot and ledger row for a chosen user; a value can
be corrected, a fact retracted, and a slot or fact typed in by hand; every row this page writes is
`source: 'admin'` with `source_message_id: null` and is visibly labelled as such; a hand-written
row survives a distillation pass that contradicts it; an edit is in Nina's next prompt with no
intervening step; the only operation that loses text is `purge` and it requires typing a word;
`npm run typecheck && npm run lint && npm test` and all seven `ci:*` guards pass.

---

## Handoffs

**The correction to phase 5's prose LANDED. RULING E5.** Phase 5 wrote that pre-vocabulary slot
keys are "left in place and simply not read"; per §1, verified against phase 1's
`getNinaMemorySlots` and phase 2's `loadNinaContext`, **every slot row does reach the prompt** —
there is no `isNinaSlotKey` filter on that path. The reconciler adopted the finding as ruling E5,
**phase 5's plan now says so and points at this phase's §4 as the mechanism**, and no code moved:
phase 5's mechanism was never affected (its distiller still refuses to write an unknown key) and
this phase needed no change from it. Only the sentence was imprecise; §4 was written against the
true behaviour all along.

**No filter in phase 2's loader. Not taken here, and DECIDED not taken, ever, in this plan set —
and phase 2's plan now records the decision.** `loadNinaContext` *could* filter `readMemorySlots`
through `isNinaSlotKey` and drop unknown keys from the prompt, which would make an orphaned key
genuinely unread and reduce retirement to housekeeping. It is not done, for two reasons, and the
second is the stronger one:

1. **It is a prompt change, and the prompt is phase 2's.** `lib/nina/context.ts` and
   `lib/nina/load.ts` are phase 2's files, and a filter there changes what Nina sees on *every*
   turn. That decision belongs to the phase that owns the prompt, and this plan set gives phase 2 no
   reason to make one.
2. **Retirement is strictly better than filtering.** A filter silently drops the sentence; Retire
   moves it into the ledger, which is where R4 wants it. Filtering makes the text unreachable and
   unaccounted for; retirement makes it unreachable *as a slot* and permanently recorded *as a
   fact*. Given a choice between the two, the plan set should never take the one that loses text.

The observation that made this an offer in the first place still holds and is worth keeping: **the
editor works either way.** With a filter, retirement would stop mattering; without one, retirement
matters and this page provides it. Nothing in §4 is contingent on which is true.
*Revisit if* phase 3's verbatim sink ever writes unknown keys faster than a human retires them — at
which point the filter is the stopgap, and it is still phase 2's call to make.

**To phase 5, if it wants it (NOT taken here):** `MEMORY_FACT_LIMIT`'s window means a retraction
only supersedes the bad row *because this page deletes the original*. If phase 5 ever renders
`confidence` into the prompt, a softer retraction (demote to 0, keep the row) becomes possible and
this page could stop deleting. Recorded, not requested.

**Ledger paging, deliberately not built.** The page renders the newest `ADMIN_LEDGER_PAGE` (200)
rows and says how many older ones it is not showing; rows outside that window cannot be edited from
this page. At the observed rate (a handful of distilled facts per conversation) 200 rows is months
of history, and paging is a `?before=` param plus an offset argument to `listNinaMemoryFacts` —
phase 1's file, which this phase does not touch. Raise the constant first; add paging only when
that stops being enough.

**No Route Handler, and none needed.** Every mutation is a Server Action, so this phase adds nothing
to `app/api/**` and needs neither `requireAdminApi()` nor `forbiddenJson()` from phase 15. They
stay used by phase 15's upload route alone.

**`proxy.ts` is not edited, and the question is RESOLVED — RULING D3, ruled once for `/nina` and
`/admin/**` together, exactly as this handoff asked.** The matcher gains **nothing**: not `/nina`,
not `/admin/:path*`. The four reasons, recorded so nobody reopens it:

1. **The file's own header says authorization lives in `requireUserId()` plus the query-level
   `userId` filter — *"Full stop".*** The matcher is a UX redirect list, not the security boundary.
2. **Both routes are already gated in-page.** `/nina` by `requireUserId()`; `/admin/**` by
   `requireAdmin()`, which redirects a signed-out visitor and `notFound()`s a signed-in non-admin.
   Nothing is unprotected either way, and `/admin/memory` is gated in the layout, in the page and in
   all eight actions.
3. **`?next=` is read by nothing on `/`,** so the only gain from listing a route is a marginally
   nicer bounce.
4. **Listing `/admin/:path*` in a UX-redirect matcher would imply the proxy IS the admin
   boundary** — precisely the misreading that header exists to prevent.

**Phase 4** makes the only edit: a **comment-only** change to the matcher's docstring, naming
`/nina` and `/admin/**` as deliberately omitted and why, so that file's existing *"adding a
protected page means adding a line here"* sentence stops being half-true. `proxy.ts` joins phase
4's Files table as `modify — comment only`; `tests/auth.proxy.matcher.test.ts` is untouched.
**This phase changes nothing** — it records the ruling and moves on. *Revisit if* a `?next=` handler
is ever built on `/`.

**Not this phase's, and untouched:** the distillation pass (5), the album and the crop studio (15),
Nina's prompts and persona (2), the nag ledger (9), `pending_promises` *evaluation* — this page can
remove a promise entry but never marks one `'met'`, never checks one against reality and never
generates an avatar. That is phase 13's, and phase 5 warned that phase 13 resolves promises in
place and must carry `source` through: `removePendingPromiseAction` writes `source: 'admin'` on a
slot phase 5's merge then keeps sticky, which is exactly the behaviour phase 13 is written against.

---

## Rollback

Revert this phase's commit. Four consequences, all bounded:

1. **Five new files under `lib/admin/` and one route disappear**, plus two components and one test.
   Nothing else imports them: `grep -rn 'memoryStore\|memoryActions\|memoryVocab\|memoryModel\|admin/users' app lib components` returns only this phase's own files plus the two reserved edits.
2. **The two reserved edits revert cleanly.** `AdminNav`'s `LINKS` loses one array entry and
   `app/admin/page.tsx` loses one `<Card>` and one `getAdminUser` call. Phase 15's pages keep
   working — they never linked to `/admin/memory` themselves.
3. **`lib/admin/schema.ts` loses its appended section.** Phase 15's `cropWriteSchema`,
   `avatarRegisterSchema` and `avatarIdSchema` are above the appended block and untouched, so
   `tests/admin.avatars.test.ts` is unaffected.
4. **No data migrates back, and nothing needs to.** There is no migration in this phase, no column
   added and no table created. Rows this page wrote stay in `nina_memory_slots` and
   `nina_memory_facts` with `source = 'admin'`, which is a value phase 1's schema declares and
   phase 5 already honours — so **a hand-written memory survives the rollback of the page that
   wrote it**, still protected from the distiller, still in Nina's prompt. That is the correct
   outcome: R4 promised permanence, not permanence-conditional-on-the-editor-existing. The only
   thing lost is the ability to write more of them.
