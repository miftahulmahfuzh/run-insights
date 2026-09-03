# RECONCILIATION RULINGS — binding on every phase plan

Written by the reconciler for `NINA_CHATBOT_PLAN.md`, 2026-09-03. **This file is the recovery
state.** It is complete enough to execute from cold: one section per queue item, each carrying the
ruling, the exact edit, and the files it lands in. A `DONE:` checklist at the bottom records
progress; a resumed attempt continues from there rather than restarting.

These are decided. Do not re-litigate, do not soften, do not add "if the reconciler prefers".
Every edit must leave the plan it touches consistent with this sheet — including its **Interface
Contract**, its **Satisfies** line, its **Files** table, its **Requires** list, and any code block
that quotes the affected symbol.

Two global rules:

- **No Open Questions may survive in any plan as a question.** RU-21. Where a plan has an
  `## Open Questions` section, rename it `## Decisions on the open items` and rewrite every entry
  as "Decided X because Y; revisit if Z". Never "ask the user", never "the reconciler should
  decide". **The final index's Open Questions section must be EMPTY.**
- **Fix the code blocks, not just the prose.** A ruling that renames a symbol or changes a shape
  must be applied to the Implementation Steps' code too.

---

## A1 — The DTO boundary: three layers, three spellings, one mapper

The most-referenced ruling in the sheet.

| Layer | Owner | Message field names |
|---|---|---|
| `lib/db/schema.ts` — the columns | phase 1 | `text`, `sent_at` (Drizzle `ninaMessages.text`, `.sentAt`) |
| `lib/nina/queries.ts` — the data-access DTO (`NinaMessageRow`, `NinaMessageInsert`) | phase 1 | **`body`, `createdAt`** — uniformly, in **every** function, because they all `select(messageColumns)` |
| `lib/nina/context.ts` — the prompt-layer input (`MessageInput`) | phase 2 | `text`, `sentAt` |

**The single translation point is `lib/nina/gateway.ts`'s `dbNinaSourceGateway` (phase 3)**, which
maps `NinaMessageRow → MessageInput` (`text: row.body`, `sentAt: row.createdAt`).

Consequences:
- Every consumer of `lib/nina/queries.ts` — phases 4, 6, 7, 8, 10, 12, 13, 15, 16 — uses
  `body` / `createdAt`. Phase 6's `row.body` is **correct**; phase 4's destructure is **correct**.
- Phase 2's `MessageInput { text, sentAt }` is **correct** and does not move.
- Phase 3's "Requires the column spelling `text`" and its "the reconciler should pick `text` and
  edit phase 4's one destructure" are **wrong and deleted**, as is its Open Question 8.
- Nobody may "fix" one side to match the other. Say so in every plan that touches the seam.

**Lands in:** 1 (strengthen D-1 + the `NinaMessageRow` docstring + Handoff 5), 2 (Requires), 3
(delete the Provides note and OQ 8; fix `gateway.ts` bodies), 4 (Requires 2), 6, 7, 8.

## A2 — Phase 1's `lib/nina/queries.ts` names are canonical

Phase 1 owns the file. Phase 3's `lib/nina/gateway.ts` is the only adapter, exactly as phase 3
itself offered ("or names close enough that `lib/nina/gateway.ts` is the only file that changes").
Canonical signatures, verbatim from phase-1.md:

```ts
getNinaIdentity(userId): Promise<{ fullName: string | null; nickname: string | null }>
listNinaMessages(userId, opts: { limit: number }): Promise<NinaMessageRow[]>          // oldest first
getNinaMessageWindow(userId, limit: number): Promise<{ messages: NinaMessageRow[]; olderCount: number }>
getNinaMessagesByIds(userId, ids: readonly string[]): Promise<NinaMessageRow[]>
insertNinaMessages(userId, rows: readonly NinaMessageInsert[]): Promise<NinaMessageRow[]>
countUnreadNinaMessages(userId): Promise<number>
markNinaMessagesRead(userId, now?): Promise<number>
insertNinaMessageImages(userId, rows: readonly NinaImageInsert[]): Promise<NinaImageRow[]>
listNinaMessageImages(userId, opts): Promise<NinaImageRow[]>
getNinaMessageImagesForMessages(userId, messageIds)
getNinaMemorySlots(userId): Promise<NinaSlotRow[]>                    // value RENDERED to string
getNinaMemorySlot(userId, key): Promise<{ value: NinaSlotValue; ... } | null>   // value PARSED
upsertNinaMemorySlot(userId, input: NinaSlotUpsert): Promise<void>
deleteNinaMemorySlot(userId, key): Promise<void>
listNinaMemoryFacts(userId, opts: { limit: number }): Promise<NinaFactRow[]>
appendNinaMemoryFacts(userId, rows: readonly NinaFactInsert[]): Promise<NinaFactRow[]>
updateNinaMemoryFact(userId, id, patch)
deleteNinaMemoryFact(userId, id)
getNinaNags(userId): Promise<NinaNagRow[]>
upsertNinaNag(userId, input: NinaNagUpsert): Promise<void>            // { code, level, lastMentionedOn }
insertNinaTurn(userId, input: NinaTurnInsert): Promise<string>        // returns the id
countNinaTurnsSince(userId, kind: NinaTurnKind, since: Date): Promise<number>
getCurrentNinaAvatar(userId): Promise<NinaAvatarRow | null>
listNinaAvatars(userId): Promise<NinaAvatarRow[]>
getUnannouncedCurrentNinaAvatar(userId): Promise<NinaAvatarRow | null>
markNinaAvatarAnnounced(userId, id, now?): Promise<boolean>
insertNinaAvatarAsCurrent(userId, input: NinaAvatarInsert): Promise<NinaAvatarRow>
updateNinaAvatarCrop(userId, id, crop: NinaAvatarCrop)
setNinaAvatarDescription(userId, id, description)
```

Losing spellings and their fixes:

| Wrong name (phase) | Canonical |
|---|---|
| `listNinaMemorySlots` (3) | `getNinaMemorySlots` |
| `insertNinaMessage` singular with a caller-supplied `seq` (3) | `insertNinaMessages` (batch, **no `seq`** — A2b) |
| `insertNinaMemoryFact` (3) | `appendNinaMemoryFacts` |
| `countNinaMessages` (3, 5) | **does not exist.** Use `getNinaMessageWindow`'s `olderCount`, or `context.conversation.window.length` |
| `listNinaNags` (10) | `getNinaNags` |
| `upsertNinaNag(userId, code, {...})` (10) | `upsertNinaNag(userId, { code, level, lastMentionedOn })` |
| `getUnannouncedCurrentAvatar` (10) | `getUnannouncedCurrentNinaAvatar` |
| `markAvatarAnnounced` (10) | `markNinaAvatarAnnounced` |

**A2b — `seq` is a `bigserial` assigned by Postgres** (phase 1's D-2). Phase 3 must NOT write
`seq`, must NOT require `seq integer not null default 0`, and must NOT order by
`(sent_at asc, seq asc)`. Emission order comes from one multi-row `INSERT` (Postgres evaluates
`nextval` once per row in `VALUES` order); every read is `ORDER BY seq`. Delete phase 3's
Requires item 4.

**A2c — `lib/nina/queries.ts` has exactly two writers:** phase 1 (creates it) and phase 15
(appends `setCurrentNinaAvatar`, `deleteNinaAvatar`). **Phase 10 does not modify it** — everything
it asked for is already shipped under the names above. Delete that row from phase 10's Files table
and rewrite its Step 1.

**Lands in:** 3 (Requires 3+4, `gateway.ts` code), 5 (Requires 2, OQ 1), 9 (Requires), 10
(Requires 4/5/7, Files, call sites), 16 (Requires).

## A3 — `appendNinaMemoryFacts` wins over `insertNinaMemoryFact`

Covered by A2. The extra constraint: **phase 5's structural R24 guarantee depends on which
functions the distiller imports**, so `tests/nina.distill.test.ts` case 14 — which `readFileSync`s
`lib/nina/memory.ts` and `lib/nina/distill.ts` and asserts neither imports `updateNinaMemoryFact`
or `deleteNinaMemoryFact` — must survive unchanged in substance. Phase 5's Step 9 is already
written against phase 1's name; delete its "if the reconciler prefers phase 3's spelling" branch.

**Lands in:** 5 (OQ 1 → decision), 3 (`gateway.ts`).

## A4 — Avatar-announcement query names

`getUnannouncedCurrentNinaAvatar` / `markNinaAvatarAnnounced` (phase 1) win; phase 10's two call
sites change. Phase 13 independently reached the same conclusion — record the agreement.

**Lands in:** 10 (Requires 5 + two call sites), 13 (Handoff 3 → record).

## A5 — One spelling for the committed avatar path

`'/nina/avatar-001.png'` is defined **once**, as `NINA_AVATAR_FALLBACK_SRC` in `lib/nina/album.ts`
(phase 13). Phase 13 already ruled this; propagate it.

- **Phase 4** creates `NINA_AVATAR_SRC` in `components/nina/NinaAvatar.tsx` as written (nothing
  else exists at its landing). No edit beyond one handoff sentence naming phase 13.
- **Phase 13** turns `NINA_AVATAR_SRC` into a re-export of `NINA_AVATAR_FALLBACK_SRC`, so every
  phase-4 import keeps compiling and the path is spelled once.
- **Phase 15** must NOT define `NINA_AVATAR_FALLBACK_SRC` in `components/admin/CircleFrame.tsx`.
  It imports it from `@/lib/nina/album`. Its handoff 3 is resolved.

**Lands in:** 4 (handoff), 13 (record the adoption), 15 (delete the declaration, fix Handoff 3).

## A6 — `NINA_BLOB_PREFIX = 'nina/'` has exactly one definition

**`lib/nina/images.ts` (phase 6)** is the definition. It is pure and zero-import, so every host can
reach it — and it must stay that way forever, because three hosts now depend on the property.

- **Phase 12** — `lib/nina/imagerecipe.ts` must keep its **zero-import** property (the GitHub
  Actions worker imports it under `--experimental-strip-types`, and a cross-module
  extension-bearing import chain is a needless risk on a scheduled job). So it does **not**
  re-export the constant and does **not** declare a second one: delete `NINA_BLOB_PREFIX` from
  `imagerecipe.ts`'s export list, spell the prefix inline inside `ninaImagePathname` with a comment
  naming `lib/nina/images.ts` as the authority, and add one case to
  `tests/nina.imagerecipe.test.ts` asserting
  `ninaImagePathname(u,'selfie',id).startsWith(NINA_BLOB_PREFIX)` with `NINA_BLOB_PREFIX` imported
  from `@/lib/nina/images`. A test can import both; the worker's module still cannot. Same
  mitigation shape as phase 12's own `information_schema` preflight.
- **Phase 15** — `lib/admin/avatars.ts` must NOT declare `ADMIN_AVATAR_PREFIX`. It imports
  `NINA_BLOB_PREFIX` from `@/lib/nina/images`. Phase 15's `depends_on` gains **6**, which also
  makes its `describeNinaImages` dependency hard rather than soft — so delete its
  `await import()` behind a narrow local interface and import directly.
- **Phase 14** — its **claim that "a `.mjs` script cannot import a TypeScript constant" is
  factually WRONG** and must be corrected. `scripts/backfill-record-keys.mjs:85` does exactly
  that: `import { RECORD_CATALOG } from '../lib/records/catalog.ts'`, run as
  `node --experimental-strip-types --no-warnings --env-file=.env.local …` (`package.json:30`).
  So phase 14 imports `NINA_BLOB_PREFIX` from `'../lib/nina/images.ts'` and
  `NINA_IMAGE_PATHNAME_RE` from `'../lib/nina/imagerecipe.ts'`, its `nina:profpic` script gains
  `--experimental-strip-types --no-warnings`, and `tests/nina.profpic.test.ts` asserts its own
  `avatarPathname` output against that regex. It **keeps** `avatarPathname`, because phase 12's
  `ninaImagePathname` hardcodes `.png` and phase 14 writes `.jpg` (the regex admits `.jpg` for
  exactly that reason). The real wall is `lib/env.ts` being `server-only` and alias-imported —
  **not** `.ts` files in general.

**Lands in:** 6 (Provides note + the zero-import obligation), 12, 14, 15.

---

## B1 — The ONE final `sendNinaMessage` signature and refusal rule

```ts
// lib/nina/actions.ts — phase 3 creates it; 6, 7, 8 and 13 each add exactly one optional field.
export async function sendNinaMessage(input: {
  body: string
  imageTickets?: readonly string[]                              // phase 6
  replyToMessageId?: string | null                              // phase 7
  runId?: string | null                                         // phase 8
  attachExisting?: { kind: 'avatar' | 'image'; id: string } | null   // phase 13
}): Promise<SendNinaMessageResult>
```

The ONE final refusal rule — an empty `body` is refused unless the message carries something else:

```ts
const hasAttachment =
  (input.imageTickets?.length ?? 0) > 0 ||   // phase 6
  input.runId != null ||                      // phase 8
  input.attachExisting != null                // phase 13
if (input.body.trim() === '' && !hasAttachment) return refuse('empty')
```

`replyToMessageId` adds **no** refusal clause: a quote alone is not a message. Each phase adds its
own clause in its own commit, so the rule is monotone and the tree is green at every boundary.
Phase 3 ships `body.trim() === ''` alone. Print the final signature and rule in 3, 6, 8 and 13,
marking which clauses exist at that phase's landing. This is what phases 7 and 8 both asked for —
ONE combined object, not four rewrites of the head.

**`SentBubble` gains `replyToId: string | null`, and phase 7 owns that edit** (phase 7 already
modifies `lib/nina/actions.ts` where the type is declared, and it is two lines), so Nina's own
quote renders on the optimistic reveal instead of only on the next server render. Phase 7's "the
reconciler should decide whether it lands in phase 3 or as a follow-up card" is resolved: phase 7.

**Lands in:** 3, 6, 7, 8, 13.

## B2 — The ONE final `NinaTurnInput`, and `NinaTurnOptions.runId` beside it

```ts
export interface NinaTurnInput {
  /* phase 3's base fields, unchanged */
  imageDescriptions?: readonly string[]   // phase 6 — glm-4.6v's text, never an image block
  quoted?: QuotedMessageInput | null      // phase 7
  attachedRunId?: string | null           // phase 8
}
```

`avatar` is **not** on `NinaTurnInput`: phase 13 puts it on **`NinaContext`** and
`BuildNinaContextInput`, which is correct and stays there. (The queue's B2 misattributed it.)

**`NinaTurnOptions.runId` (phase 10) and `NinaTurnInput.attachedRunId` (phase 8) are different
fields and both exist.** `runId` is written to `nina_messages.run_id` on every row the turn
persists; `attachedRunId` is resolved through `buildNinaRunFact` and rendered into the prompt. For
a chat attachment they carry the same id; for phase 10's `run_committed` turn they need not.
Phase 8's paragraph on this is promoted from a conditional to a statement.

Also reconcile phase 10's required `NinaTurnOptions` shape (`context`, `extraInstruction?`,
`source: NinaMessageSource`, `runId?`, `runnerMessageId?`) with phase 3's `NinaTurnDeps` /
`runNinaTurnWith`: `runNinaTurn(userId, options: NinaTurnOptions)` is the shape, a proactive turn
must tolerate a conversation whose last message is Nina's own, and it must persist its rows with
the `source` and `runId` it was handed.

**Lands in:** 3, 6, 7, 8, 10, 13.

## B3 — `buildNinaRunFact` must be exported from phase 2

Phase 2's module-local `runFact(run, today)` (phase-2.md ~:1281) becomes an exported
`buildNinaRunFact(run: NinaRunInput, today: DateISO): NinaRunFact`, signature unchanged. Phase 3
called this "the single largest coupling between phases 2 and 3"; phase 8 needs it too. Without it,
`lookup_runs`, `compare_runs` and phase 8's run attachment each re-spell distance, pace and HR for
runs outside the recent-20 window — a second formatting authority, which invariant 3 forbids.

**Lands in:** 2 (rename + `export` + Creates list + Provides), 3 and 8 (Requires → satisfied).

---

## C — Upstream asks folded into phase 1

Phase 1 absorbs all of these. The phases that asked stop asking and stop editing phase 1's files.
**Every "fallback if refused" branch in phase 12 is deleted**, because nothing is refused.

**C1. `nina_turns.args jsonb` (nullable).** Phase 12 does not work without it: the repo is
**public**, so a `workflow_dispatch` input is world-readable in the run log and the prompt must
travel in the database with only an opaque `job_id` in the dispatch; and the `schedule:` backstop
wakes with no arguments at all, so a retry is impossible unless the args are in the row. Document
the shape on the column (phase 12's `NinaImageJobArgs`: `purpose`, `scene`, `mood`, `prompt`,
`seed`, `replyToId`, `source`, `attempts`, `sidecar`). Add to the table, the row types,
`NinaTurnInsert`, the Creates list, the migration audit, and the Provides for phase 12.
Phase 12's Risk 2 becomes a record that it was granted.

**C2. `NinaTurnStatus` gains `'pending'`** → `'pending' | 'ok' | 'repaired' | 'failed'`. Plain
`text` with `.$type<>()`, so **no migration change**. Phase 12's fallback (`failed` +
`error_code:'queued'`) is withdrawn — it would poison every "how often does she fail" reading of
the table forever. Phase 12's Risk 8 is deleted with it. `error_code`'s comment gains the
pending-phase use: `'queued' | 'dispatched' | 'running'` while `status='pending'`, the failure
reason (`'timeout' | 'policy' | 'transport' | 'stale'`) when `status='failed'`.

**C3. `NinaPendingPromise` gains `jobId?: string | null`, `firedOn?: string | null` (Jakarta
`YYYY-MM-DD`), `attempts?: number`.** `jsonb`, so no migration; all optional, so phase 5's
candidate constructor, `mergePendingPromises` and its tests compile untouched. Quote phase 13's
promise state machine into the docstring as the reason (RU-20 makes generation land in another
process minutes later, so "did she keep her promise" cannot be answered by a return value).

**C4. `lib/env.ts` and `.env.example` have exactly one owner: phase 1.**
- `ninaEnv()` returns `{ OPENROUTER_API_KEY, GITHUB_DISPATCH_TOKEN }`
- `pushEnv()` returns `{ VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT }`
- `.env.example` documents all five plus `ADMIN_EMAILS`
- **Phase 11 drops** its signature change 1 and its `lib/env.ts` / `.env.example` Files rows.
  It keeps `scripts/check-client-secret-boundary.mjs` gaining `'VAPID_PRIVATE_KEY'` to `SECRETS`
  (and deliberately **not** `VAPID_PUBLIC_KEY`) — that file is not phase 1's.
- **Phase 12's Requires 7** becomes "consumed as shipped", keeping its two constraints: it must go
  through `lib/env.ts` and never `process.env` in `app/`/`lib/`/`components/`, and never be
  `NEXT_PUBLIC_` anything (invariant 10). The **repo coordinates are NOT env vars** — they stay
  module constants in `lib/nina/imagedispatch.ts` so a deploy cannot be misconfigured into
  dispatching at someone else's repo.

**C5. `ProfileFacts` and the three narrate prompts gain `weightKg` and `sex`.** This is the index's
"Decisions taken under RU-21" and it is binding on phase 1, which already edits `lib/llm/facts.ts`.
Phase 1 currently says the opposite in three places and **all three must invert**: its
`NarrativeProfile` signature bullet ("`ProfileFacts` — the *output* type — is **not** touched"),
its `tests/llm.facts.test.ts` Files row ("one assertion that `ProfileFacts` did **not** widen"),
and its Handoffs "Deliberately not done — F07's narrative does not yet mention weight or sex".
The reasoning: the user repealed D15 because "exposing user details like weight to ai analysis will
100% make the analysis much more accurate", and an insight that cannot see them is the half of the
repeal that does nothing. **Accepted consequence, stated plainly:** `factsHash` moves and every
cached insight regenerates on next view — one model call per run the user actually opens, spread
over time, against a user who said not to stint on tokens. *Revisit if* regeneration cost ever
matters; the escape is to seed the new fields only for runs newer than a cutoff date, which keeps
old hashes stable. Add whatever narrate-prompt files this needs to phase 1's Files table.

**C6. `productionDeps()` in `lib/nina/turn.ts` is `export`ed by phase 3 at creation.** Phase 12
therefore does **not** modify `lib/nina/turn.ts`: delete that row from its Files table and its
Modifies list, and its Requires 11 becomes "consumed as exported".

**C7. `export const maxDuration = 60` on `app/nina/page.tsx` — phase 4 owns it.** A Server Action's
timeout is the page segment's (`app/r/[id]/page.tsx:65`, `app/trends/page.tsx`), so without it
`sendNinaMessage`'s 45 s budget is fiction and the symptom reads as an intermittent bug. Phase 3's
handoff becomes a record. Phases 6, 8, 12 and 13 also edit that file and must not re-declare it.

**C8 (found while reconciling). `nina_turns.tool_calls` is `text NOT NULL DEFAULT ''`, not
`integer`.** `NinaTurnInsert.toolCalls?: string` — comma-joined tool names, `''` when none. Phase
3's ruling (b) has an empirical exit condition — *drop the `save_memory` tool if it never fires* —
that is only decidable if the column records **which** tools fired; a count answers a question
nobody asked. Phase 12 also writes `dropped:save_memory` there. Phase 1 owns the column and the
migration.

**C9 (found while reconciling). `NinaMessageSource = 'chat' | 'run_committed' |
'missed_usual_day' | 'pattern_crossed' | 'silence' | 'avatar_changed'`** — `'chat'` plus every
member of phase 2's `ProactiveTriggerKind`. Phase 1 declared `'chat' | 'proactive' | 'operator'`
and both losers go. Reasons: phase 10 owns every writer of a non-`'chat'` source, and its durable
idempotence marker for R8 is `source='run_committed' AND run_id=<this run>` — a single indexed read
that `'proactive'` would force into a join against `nina_turns.trigger`; and `'operator'` has **no
writer at all**, because phase 14 deliberately writes no `nina_messages` row and the operator path
announces through `avatar_changed`. Declared in `lib/db/schema.ts` (it is a column domain);
**phase 10** owns the test asserting it equals `'chat' | ProactiveTriggerKind`, because that is the
first phase where both types exist. Phase 1 must also ship the unread index phase 10's Requires 3
asks for — `(user_id, read_at) WHERE read_at IS NULL` or `(user_id, role, read_at)` — because the
count runs on every page render of every tabbed screen.

**Lands in:** 1 (all nine), 11 (C4), 12 (C1, C2, C4, C6, C8), 3 (C6, C8), 4 (C7), 5 (C3), 13 (C3),
14 (C9's `'operator'` clarification), 10 (C9's test).

---

## D — Single-owner guard and doc edits

**D1. `scripts/check-llm-payload-boundary.mjs` has exactly one owner: phase 1.** Rule 1 is deleted
(RU-1); rule 2 becomes a table named **`GUARDED_CALLS`** (phase 3's `SANCTIONED` /
`BLOCKING_CALLS` and phase 5's `BLOCKING_CALLS` are wrong). The complete, final table, shipped
whole by phase 1:

| symbol | sanctioned callers | source |
|---|---|---|
| `getOrCreateInsight` | its existing three | unchanged |
| `runNinaTurn` | `lib/nina/turn.ts`, `lib/nina/actions.ts`, `lib/nina/proactive.ts`, `app/api/cron/nina/route.ts` | phase 1's "its own four" |
| `distillNinaMemory` | `lib/nina/distill.ts`, `lib/nina/actions.ts` | phase 5 |
| `describeNinaImage` | `lib/nina/actions.ts`, `components/nina/Composer.tsx` | phase 6 |

`describeNinaImage`'s second caller matters: the guard greps the symbol across `app/`, `lib/` and
`components/`, and the actual caller is the composer's client event handler, so listing only
`actions.ts` would fail CI. Remove the file from the Files tables of phases 3, 5 and 6, and replace
with one line recording phase 1's ownership. **Rule numbering goes stale** — after phase 1's
rewrite there is one rule, so any "rule 2"/"rule 3" reference elsewhere in the set must be
re-worded to name the table rather than a number.

**D2. `ROADMAP_v0.1.0.md`, `RECONCILIATION_v0.1.0.md` and the F33 doc pointer have exactly one
owner: phase 1.** Phase 4 is right to leave §4.8 alone; phase 1's own recommendation is overruled
because phase 1 already edits that file. Phase 1's roadmap step covers exactly:

1. §4.8's route block gains `/nina`, `/nina/about`, `/admin`, `/admin/nina`, `/admin/memory`,
   `/api/cron/nina`, `/api/admin/nina/upload`.
2. §4.8's *"Navigation is a four-tab bottom bar"* → **five-tab**, and its table gains a Nina row
   between Runs and Upload. Add phase 4's sentence: the FAB sat at 37.5% in a four-column grid and
   is at 50% in a five-column one, so §4.8's own "centre" claim is newly true rather than newly
   written.
3. **The "sanctioned route handlers" claim lives in §2's D7 row (line 64), and the correction is
   smaller than filed.** Its four entries are `/api/extract`, `/api/upload`,
   `/api/auth/[...nextauth]`, `/api/cron/*` — a **glob**, which already covers `/api/cron/nina`, so
   the cron needs **no** entry. Phase 12 now creates no route handler at all. The one genuinely new
   handler in the plan set is **phase 15's `/api/admin/nina/upload`**, and D7 gains it with one
   clause: an admin-gated Blob handshake, separate from `/api/upload` because its auth rule, size
   cap, content types and pathname regex all differ.
4. §5's feature table is **not** extended. It is headed "Eleven" and scoped to v0.1.0, and F12–F32
   — twenty-one shipped features — are all absent, so adding only F33 would make the table wrong in
   a new way. Add one line under §5: features after F11 are tracked in `docs/plans/` and
   `CHANGELOG.md`.
5. **`docs/plans/F33-nina.md` is created by phase 1** as a pointer stub (what F33 is, the sixteen
   phases, a link to `NINA_CHATBOT_PLAN.md`, where the rulings live). The retrospective write-up is
   a follow-up card, as phase 8 proposed — not sixteen appends to one file.
6. RU-1's `RECONCILIATION_v0.1.0.md` R-28 **Repealed** block, and RU-2's and RU-3's amendments, as
   already planned.

**D3. `proxy.ts`'s matcher gains NOTHING. Comment-only edit, owned by phase 4.**
Decided: do not add `/nina` or `/admin/:path*`. Four reasons: the file's own header says
authorization lives in `requireUserId()` plus the `userId` filter in every query, *"Full stop"* —
the matcher is a UX redirect list, not the security boundary; `/nina` is already gated by
`requireUserId()` and `/admin/**` by `requireAdmin()` (redirect when signed out, `notFound()` when
signed in and not an admin), so nothing is unprotected; `?next=` is read by nothing on `/`, so the
only gain is a marginally nicer bounce; and listing `/admin/:path*` in a UX-redirect matcher would
imply the proxy is the admin boundary, which is precisely the misreading that header exists to
prevent. **Phase 4** adds one sentence to the matcher's docstring naming `/nina` and `/admin/**` as
deliberately omitted and why, so the existing *"adding a protected page means adding a line here"*
sentence stops being half-true. `tests/auth.proxy.matcher.test.ts` is untouched, which is the proof
the edit was comment-only. Phases 15 and 16 record the ruling and change nothing.
*Revisit if* a `?next=` handler is ever built on `/`.

**D4. The blob reaper: ONE follow-up card, plus ONE compensating delete in phase 12.**
Five deferrals is how a leak ships, so the deferral is bounded rather than repeated.
- **Phase 12 gains a required mitigation.** It is the only phase that can leave a *genuine* orphan
  — `runOneJob` stores the PNG and then fails to write the row. In the same `catch` that closes the
  job as `transport`, the worker must `del()` the blob it just stored, best-effort and inside its
  own `try`. `@vercel/blob`'s `del` is already a runtime dependency (phase 15 uses it, and the
  worker installs with `npm ci --omit=dev`). After that, the only unreferenced bytes under `nina/`
  come from abandoned composer tiles and describe-then-never-send — the same harmless trade
  `UploadPicker`'s kind-change abandonment already makes.
- **Everything else is one card, named in the index:** teach `scripts/blob-reap.mjs` a second
  prefix `nina/` with reference sites `nina_message_images.pathname` and `nina_avatars.pathname`,
  and update `.claude/skills/reap-orphaned-blobs/SKILL.md`. It cannot be written before its
  reference sites exist — the skill's own doc says the prefix must not be added before them — which
  is why no phase in this set owns it.
- Phases 6, 13, 14 and 15 each replace their reaper handoff with one sentence pointing at that
  card. Phase 12 replaces its handoff 6 with the mitigation plus the same pointer.

---

## E — Design disagreements, settled

**E1. The inset surface inside a bubble is `bg-ink-3/20`.** Verified in `app/globals.css`:
`--ink-3` is `#93a2b0` in light (`:29`) and `#7c8d9b` in dark (`:70`) — a mid-grey in **both**
schemes, which is exactly phase 6's argument, and it is one class with no per-side branch.
`bg-current/10` loses because phase 8's own Open Question 4 admitted its arbitrary-opacity support
is unverified in this Tailwind setup, and an unverified mechanism must not be the shared answer for
four phases. Propagate to **6, 7, 8, 13**; in phase 8 delete the `bg-current/10` block, its
`data-[role=…]` fallback and OQ 4, keeping the colour reasoning as the recorded runner-up.

**E2. The `above` slot carries images then the run card. The quote has its own prop.**
Phase 7 owns `MessageBubble`'s head and deliberately gave the quote its own prop so the two would
not compete for one slot; phase 8's expression, which nests `ReplyQuote` inside `above`,
contradicts that and loses. Final composition, owned by `MessageList`:

```tsx
<MessageBubble
  message={m}
  quote={resolveQuote(m, index)}          // phase 7 — its own prop, rendered ABOVE `above`
  above={
    m.imageUrls?.length || m.attachment != null ? (
      <div className="space-y-2">
        {m.imageUrls?.length ? <ChatImages urls={m.imageUrls} /> : null}
        {m.attachment != null ? <RunAttachmentCard attachment={m.attachment} /> : null}
      </div>
    ) : undefined
  }
/>
```

Render order inside the bubble, top to bottom: **quote stub → images → run card → text.** This
preserves phase 8's own reasoning — the quote says what he is answering, the images and the card
are what he is handing over, the text is the message — while giving each prop one owner. Phase 6
ships the images-only branch; phase 8 widens it to the two-branch stack. Each inset block owns its
own bottom margin.

**E2b. `ChatMessage`'s fields.** `imageUrls?: readonly string[]` (**plural**, phase 6, argued: a
message carries up to `NINA_MAX_CHAT_IMAGES`); `replyToId: string | null` (**required**, phase 7);
`attachment?: RunAttachment | null` (phase 8, a display-ready object, superseding phase 4's `runId`
note). **Phase 7's speculative `imageUrl?: string | null` and `runId?: string | null` are
deleted.**

Because phase 7 lands *before* phase 8 it cannot name `RunAttachment`, so **phase 7's
`quoteMediaOf` takes booleans the caller computes**: `QuoteCandidate` carries `hasImage: boolean`
and `hasRun: boolean`, and `MessageList` fills them (`hasImage: (m.imageUrls?.length ?? 0) > 0`,
`hasRun: m.attachment != null` — `false` at phase 7's landing, wired by phase 8). `QuoteMedia`
keeps both `'photo'` and `'run'`: phase 7 ships the photo path live and the run path reachable, and
phase 8 flips one boolean. **Consequence: no later phase ever edits `lib/nina/reply.ts`.**

**E3. Phase 10's `after()` hook stays in `lib/review/actions.ts`. ACCEPTED.**
`after()` throws E468 outside a request scope and `tests/review.commit.test.ts` calls
`commitReview` directly, so the hook cannot live in `lib/review/commit.ts` without either breaking
that test or wrapping a request scope around a pure function. Phase 5 hit and cited the identical
constraint independently, which is corroboration rather than coincidence. The index's phase-10
**Owns** line, which named `lib/review/commit.ts`, is corrected; `commit.ts` is still edited, but
only to widen `CommitOutcome`.

**E4. `parseRunningDays` — apply phase 5's binding edit to phase 10, verbatim.**
`lib/nina/memory.ts` (phase 5) owns the token table and the parse and returns
`readonly IsoWeekday[]` (**1 = Monday … 7 = Sunday**), which is what phase 9's
`PatternInput.usualRunningDays` declares; it also exports `parseRunningDaysAsJsWeekday` for phase
10's `Weekday` (0 = Sunday). Phase 10 deletes its `DAY_TOKENS` constant and the whole body of its
own `parseRunningDays`, adds `import { parseRunningDaysAsJsWeekday } from './memory'`, and keeps
its own name and type through phase 5's three-line wrapper. Two behaviour changes come for free and
are improvements: `"Senin sampe Jumat"` now names five days instead of two, and
`"tiap hari kecuali senin"` now disables the trigger instead of firing it every Monday.

**E5. Phase 5's "orphaned slot keys are simply not read" is FALSE and is rewritten.**
Phase 16 verified it with file:line: `getNinaMemorySlots(userId)` selects **every** row for the
user with no vocabulary filter, and phase 2's `loadNinaContext` passes the whole array into the
context that becomes the system text — there is no `isNinaSlotKey` check anywhere on that path. So
an orphaned key **is in Nina's prompt on every turn**.

**Decided: phase 2 gains NO filter, and `/admin/memory`'s Retire button is the whole answer.**
Phase 16 declined it correctly. `lib/nina/context.ts` and `lib/nina/load.ts` are phase 2's files
and a filter there changes what Nina sees on every turn — a prompt change, owned by the phase that
owns the prompt. Retirement is also strictly better than filtering: it moves the sentence into the
ledger, where R4 wants it, instead of silently dropping it. *Revisit if* phase 3's verbatim sink
ever writes unknown keys faster than a human retires them.

**E6. `lib/nina/crop.ts` and `crop.test.ts` belong to phase 13. Confirmed.**
Phase 13's D-1 stands: phase 13 lands before phase 15 and needs `ninaCropStyle` for the chat header
and her detail page, and leaving it in 15 would mean the chat header and the admin tool's circular
preview render her face with arithmetic that disagrees — precisely the drift the module exists to
prevent. Phase 15's Steps 1–2 become explicit no-ops that **import** rather than create; both rows
leave its Files table; its `depends_on` gains **13**. The exported symbol lists in the two contracts
are identical — the **bodies** must be diffed function by function and every divergence reconciled
**in phase 13's favour**, porting anything phase 15 argued (it is that phase's named risk) rather
than dropping it. Carry into phase 13 the crop convention (`crop_scale` a multiple of the **cover**
fit, `crop_x`/`crop_y` the image centre's offset in thousandths of the frame's width, positive x
right and positive y down, all three NULL = no transform, a partial triple reading missing offsets
as 0) and the load-bearing property that the mapping uses **percentages of the frame only — no
`px`, no `transform`** — so the same three numbers are correct at a 28 px bubble avatar and at a
512 px studio frame without either caller knowing the other's size.
**Rollback coupling, stated in BOTH plans:** if phase 15 has landed, reverting phase 13 must not
revert `crop.ts` / `crop.test.ts` — revert the phase-13 commit with those two files restored, or
`/admin/nina` loses its arithmetic.

**E7. VERIFIED NON-ISSUE — do not "fix" `size="sm"`.** `components/ui/Button.tsx` declares only
`ButtonSize = 'md' | 'lg'` (`:14`), and phase 16's warning was well-founded — but no plan writes
`size="sm"` on a `Button`. The single occurrence in the whole set is `phase-4.md:1253`,
`<NinaAvatar size="sm" />`, and `NinaAvatar` declares its **own** `SIZES = { sm: 'size-7',
md: 'size-11' }` at `phase-4.md:1193`. Nothing to change; recorded so nobody edits it later.

**E8. `MessageBubble.tsx` becoming `'use client'` (phase 7) breaks nothing.** Checked every other
consumer: phase 6 does not edit the file and reaches it through `MessageList`; phase 8 fills `above`
from `MessageList`; phase 11 states explicitly that it does not touch the file; phase 13 confirms it
needs no server-rendered bubble, because attaching an album photo produces a real row and the page
navigates to `/nina` where the existing renderer draws it. No `BubbleShell` split is needed.
**Phase 4's docstring claim that the module is left directive-free "so phase 13's album page can
render a bubble on the server" is false and is deleted.**

---

## F — Index bookkeeping (applied to `NINA_CHATBOT_PLAN.md` itself)

F1. Phase 13's Satisfies is **`R17, R19, R25, R26`**. R20 is phase 1's alone (RU-18 struck its
second half). The Requirements table already reads "1" for R20; the phase table now agrees.

F2. Final file counts: 1 → ~28 · 2 → ~10 · 3 → ~14 · 4 → ~15 · 5 → ~8 · 6 → ~16 · 7 → ~11 ·
8 → ~17 · 9 → ~4 · 10 → ~14 · 11 → ~16 · 12 → ~15 · 13 → ~22 · 14 → ~5 · 15 → ~15 · 16 → ~13.

F3. Dependency edges: 8 gains **6, 7** (it widens phase 6's `above` branch and flips a boolean
phase 7 shipped) · 12 gains **6** · 13 already has 6 · 15 gains **6** and **13** · 16 stays 1, 5,
15 (verified: it imports neither `lib/nina/album.ts` nor `lib/nina/crop.ts`, as value or as type).

F4. Every R1–R26 must be served by at least one phase, and the Requirements table's Phases column
must match the phase table's Satisfies column in both directions.

F5. `**Status:** planned`. Reconciliation Log appended, one row per conflict. **Open Questions
EMPTY.**

## G — Late findings from the first editing pass (also binding)

**G1. Phase 2's `MessageRole` and phase 1's `NinaRole` are two declarations of
`'runner' | 'nina'`.** Decided: **both stay.** `NinaRole` is a **column domain** and lives with the
schema; `MessageRole` is the **prompt-layer** name and is used by `ConversationTurn` as well, in a
module whose whole design is that no schema type crosses into it (the same boundary that keeps
`MessageInput` spelling `text`). Phase 3's `gateway.ts` is the one mapper and imports `NinaRole`,
deleting `toRole`. This is deliberately the opposite call from `Sex` (where phase 2 was told to
import phase 1's type) because `Sex` is a *value domain the prompt renders verbatim* while `role`
is a *discriminator each layer switches on*. *Revisit if* a third spelling ever appears.

**G2. Phase 9's `FiredNinaPattern` vs phase 2's `FiredPattern`.** Phase 9's contract says it
*creates* `FiredNinaPattern` while its Requires says it *imports* `FiredPattern` "rather than
redeclaring". Decided: **`FiredNinaPattern` is a type alias of phase 2's `FiredPattern`**, exported
for readability inside `patterns.ts` and nothing more — one definition, no structural copy, and
`evaluatePatterns` returns the alias. Phase 9's contract must say alias, not create.

**G3. Phase 12's "existing `Promise.all`" in `app/nina/page.tsx` does not exist.** Phase 4's page
does sequential awaits. Phase 12's plan must say it **creates** the `Promise.all` (joining
`listNinaMessages` and `listOpenNinaImageJobs`) rather than joining one.

**G4. `SendNinaMessageResult` is the exported return-type name** (phase 3). Phase 4 quotes the
shape structurally; that is fine, but phase 3 must export the name so phase 7's `SentBubble` edit
has one place to land.

**G5. Phase 5's handoff pointing phase 16 at `updateNinaMemoryFact` for a confidence-40 distilled
row** conflicts with phase 16 §2, which restricts in-place edit to `source: 'admin'` rows because
rewriting a distilled row's `text` forges what its `source_message_id` claims the message said.
Decided: **phase 16 §2 is right**; phase 5's sentence gains one clause pointing at **Retract**
(append-then-delete) as the route for a distilled row.

**G6. Phase 10 owns the exit test that the pattern gateway stops returning stubs** —
`readFiredPatterns` returns a non-empty array for a seeded offender — since phase 10 is the phase
that implements those two method bodies.

**G7. Phase 16's file:line pins into phases 1 and 2 go stale** once C5/C8/C9 move phase 1's lines.
The claims are correct; the offsets are not. Demote them to symbol names.

---

# APPLICATION STATUS — 2026-09-03, and how to finish

Three reconciler attempts died to infrastructure, not to disagreement: two API 529s and one session
usage limit. **No ruling above was lost or changed by any of those failures** — this file is the
whole of the reasoning, and it was written before the edits precisely so that a fourth attempt
would not have to re-derive it from 2.0 MB of plans.

## Folded into the plan bodies

Phases **1, 2, 3, 4, 5, 6, 7, 8, 9, 16** were edited in place by the reconciler's editing passes.
Their bodies, interface contracts and code blocks reflect the rulings above.

## Carried by banner, not yet folded into the body

Phases **10, 11, 12, 13, 14, 15** carry a `⚠ RECONCILIATION` banner immediately under their title,
naming every ruling binding on them and what to do differently. Two were also applied mechanically:

- **A4** — phase 10's eight references to `getUnannouncedCurrentAvatar` / `markAvatarAnnounced` were
  renamed to phase 1's `getUnannouncedCurrentNinaAvatar` / `markNinaAvatarAnnounced`.
- **The global no-questions rule** — phase 13's `## Open Questions` (whose body already read
  "None.") became `## Decisions on the open items`.

**This is a deliberate stopping point, not an unfinished one.** A ruling duplicated into sixteen
plans is a ruling with sixteen chances to drift; a ruling stated once and declared normative has
one. The banner tells an implementer exactly which rulings bind the plan in front of them, and this
file is the single authority when a plan body and a ruling disagree. **The sheet wins. Always.**

## The four edits still worth making inside a body, when that phase is picked up

Each is safe to do at implementation time, by the session that owns the phase:

1. **Phase 10, ruling E4** — delete the `DAY_TOKENS` table and the local `parseRunningDays` body;
   re-export phase 5's parser. The banner carries the replacement line.
2. **Phase 15, ruling E6** — Steps 1–2 become no-ops; `import` `lib/nina/crop.ts` from phase 13
   rather than creating it.
3. **Phase 15, ruling A5** — delete `CircleFrame`'s `NINA_AVATAR_FALLBACK_SRC` and import it from
   `@/lib/nina/album`.
4. **Phase 14, RU-18** — keep the anchor write, delete the claim that it affects later generations.

## Verified by hand, not by an agent

- All 16 plan files exist; none contains the string "ask the user".
- `NINA_CHATBOT_PLAN.md` retains its Worktree setup, Verified live, Rulings (RU-1…RU-21),
  Decisions-taken-under-RU-21, Scope, Invariants and Rollback sections.
- Every requirement R1–R26 maps to at least one phase, and R20 is served by phase 1 alone after
  RU-18 struck it from phase 13.
