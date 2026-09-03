# Phase 1: Schema, env, and the three repeals

**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** **R6, R20, R23, R24, R25, R26.** R6 (Nina can read everything stored about the
runner — runs, badges, records, height, **gender**, **weight**) and R20 (`nina.png` becomes her
first avatar and the face anchor for every generation after it) in full; and the persisted half of
the four requirements that arrived mid-flight — R23's circular crop transform, R24's
`ADMIN_EMAILS`, R25's "what the avatar depicts", and the nullable `source_message_id` plus the
`source` discriminator that R26's hand-editing needs. **Phases 15 and 16 serve the pages behind
R23–R26; this phase serves their schema and env.** R20 is this phase's alone — RU-18 struck its
second half.
**Depends on:** none — this is the ground floor.
**Difficulty:** NORMAL — the index's call, and it holds. Twenty-eight files is a lot of volume,
but there is no design decision left inside any of them — the reconciler's rulings closed the last
few, and every one of them is recorded in the step that carries it out. Two genuinely risky steps
remain: reading the generated migration against Step 5's checklist before applying it, and Step
8's five-file weight repeal, which now moves `facts_hash` and must land as one commit.
**Package:** `lib/db`, `lib/nina`, `lib/llm`, `scripts`, `assets`, `docs`

---

## Goal

After this phase the database has somewhere to put a conversation, a memory, an avatar album and
a push subscription; `profiles` knows the runner's sex — which the schema has never carried — and the day the app
was last opened;
`lib/nina/queries.ts` is the single ownership-scoped door to all of it; `lib/env.ts` knows the
five new credentials and the admin allowlist; and the three invariants the user repealed are
repealed **in writing** — every guard still runs, still explains itself, and now names the ruling
that changed it. Nina does not exist yet: no prompt, no component, no route, no model call. This
phase makes the ground ready and nothing else.

---

## Decisions taken here, stated once so the reconciler can act on one sentence each

| # | Decision | Why |
|---|---|---|
| D-1 | **Phase 2's spelling wins.** `nina_messages` is `{ id, role 'runner'\|'nina', text, sent_at, reply_to_id, run_id }`, `nina_memory_slots` is `{ key, value, updated_at }`, `nina_memory_facts` is `{ id, text, source_message_id, created_at }`, `nina_nags` is `{ code, level, last_mentioned_on }`, `nina_message_images.description` exists, `profiles.sex` is exactly `'male'\|'female'\|'other'\|'unspecified'`. My brief proposed `role 'user'\|'nina'`, `body`, `created_at`; I am **not** taking it. Phase 2's ten files and phase 4's components already reference the other spelling, and phase 4's `listNinaMessages` return shape (`body`, `createdAt`) is a *query alias*, not a column name — so aliasing in **every** function serves both plans and rewrites neither. **RULING A1 settles this as a THREE-LAYER BOUNDARY, and it is not to be “fixed” from either end.** (1) `lib/db/schema.ts` owns the *columns*: `text`, `sent_at` — Drizzle `ninaMessages.text`, `ninaMessages.sentAt`. (2) `lib/nina/queries.ts` owns the *data-access DTO* — `NinaMessageRow`, `NinaMessageInsert` — and spells those two fields **`body`** and **`createdAt`** *uniformly, in every function*, because every function selects `messageColumns` and `messageColumns` is where the alias lives. (3) `lib/nina/context.ts` (phase 2) owns the *prompt-layer input* `MessageInput` and spells them `text` and `sentAt`. **The single translation point is phase 3's `dbNinaSourceGateway` in `lib/nina/gateway.ts`**, which maps `NinaMessageRow → MessageInput` (`text: row.body`, `sentAt: row.createdAt`) and is the only file in the whole plan set that knows both spellings. Three layers, three spellings, one mapper: every other consumer of this file — phases 4, 6, 7, 8, 10, 12, 13, 15, 16 — uses `body`/`createdAt`, so phase 6's `row.body` and phase 4's destructure are both **correct as written** and neither is to be rewritten to match a column name. |
| D-2 | **Ordering is a `bigserial`, not a per-turn integer.** `nina_messages.seq bigserial` gives a total order over the whole conversation, so `ORDER BY seq` alone is deterministic — no composite `ORDER BY`, and no tie is possible even between two turns that share a `sent_at` to the microsecond. A per-turn integer (my brief's suggestion) would need `ORDER BY sent_at, turn_seq` and still ties when two turns land in the same instant, which is exactly what an `after()` hook plus a cron can do. Phase 3 gets emission order for free: rows inside one `db.batch` insert are numbered in array order. |
| D-3 | **`nina_memory_slots.value` is `jsonb`, and a scalar slot stores a JSON string.** My brief said `jsonb`; phase 2 said "text, already display-ready". `jsonb` holds a bare JSON string perfectly well, so `"suka lari pagi"` is a valid slot value and `pending_promises` is a valid slot value, in one column with no second `display` column to keep in step. `lib/nina/queries.ts` absorbs the difference: `getNinaMemorySlots` returns `value` **rendered to a string** for phase 2's `MemorySlotInput`, and `getNinaMemorySlot` returns it parsed for phase 13. |
| D-4 | **The badges R-22 comment gains four words.** It currently claims `badges.run_id` is "the ONE non-cascade FK in the schema". Two of my columns (`nina_messages.reply_to_id`, `nina_messages.run_id`) are `ON DELETE SET NULL`, so that sentence would become false. I narrow it to "the one non-cascade FK **among the F03 tables**" and change nothing else — R-22's semantics, the `set null` on `run_id`, and the plain `dedupe_key` are untouched. |
| D-5 | **FK where the UI dereferences it, a plain column where it is provenance.** `reply_to_id` and `run_id` are rendered every frame, so a dangling id would paint an empty quote or an empty run card — they are real FKs with `ON DELETE SET NULL`. `nina_messages.turn_id`, `nina_memory_slots.source_message_id` and `nina_memory_facts.source_message_id` are audit provenance that nothing renders, so they are plain `text`: a provenance pointer must not be able to block or rewrite a conversation delete, and it keeps the non-cascade FK count at two. |
| D-6 | **`ADMIN_EMAILS` is env, not schema.** Argued in Step 8. |
| D-7 | **`assets/nina/_anchor.png` is `nina.png`'s bytes, unmodified.** A `git mv`, not a re-encode, so the anchor is sha256-identical to the source the user supplied and there is no generation-loss argument to have. Phase 14 re-anchors through a 2048 px fit, so a *later* anchor may be slightly smaller than this first one; that is fine, because the anchor's job is face identity, not print resolution. |

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**

- `scripts/check-llm-payload-boundary.mjs` — rule 1 in its entirety: the `WEIGHT` regex
  (`:39`) and the loop over `lib/llm` + `lib/insights` that used it (`:41-50`). **RU-1.** The
  file keeps its header, its comment-stripper, its walker and rule 2, and its header gains a
  paragraph recording the repeal.
- `nina.png` at the worktree root (untracked, 1792×2400, 6.4 MB). Moved, not deleted — see
  Step 11.

**Renames:** none.

**Creates — `lib/db/schema.ts`** (all names as they appear in the module, table name in
parentheses):

- `Sex` (type), `SEX_VALUES` (const tuple)
- `profiles.sex` — new column `sex text NULL`
- `profiles.last_seen_on` — new column `last_seen_on date NULL` (Asia/Jakarta day, string
  mode). **Declared here, written by nobody in this phase** — phase 10 reads it for R3's
  silence trigger; whoever owns the touch writes it.
- `ninaTurns` (`nina_turns`), `NinaTurnKind`, `NinaTurnStatus`, `NinaTurn`, `NewNinaTurn`.
  Three of its columns are fixed by rulings rather than by this phase's own judgement:
  **`args jsonb` NULL** (RULING C1 — RU-20's job arguments must live in the row, because the repo
  is public and the `schedule:` backstop wakes with none), **`tool_calls text NOT NULL DEFAULT ''`**
  (RULING C8 — comma-joined tool *names*, not a count), and `status` typed
  **`NinaTurnStatus = 'pending' | 'ok' | 'repaired' | 'failed'`** (RULING C2 — plain `text` with
  `.$type<>()`, so the new member costs no migration)
- `ninaMessages` (`nina_messages`), `NinaRole`, `NinaMessageSource`, `NinaMessage`,
  `NewNinaMessage`. **`NinaMessageSource` is fixed by RULING C9 as
  `'chat' | 'run_committed' | 'missed_usual_day' | 'pattern_crossed' | 'silence' |
  'avatar_changed'`** — `'chat'` plus every member of phase 2's `ProactiveTriggerKind`.
  `'proactive'` and `'operator'` are **deleted**: the first would force R8's idempotence check
  (`source='run_committed' AND run_id=<this run>`, one indexed read) into a join against
  `nina_turns.trigger`, and the second has no writer at all, because phase 14 deliberately writes
  no `nina_messages` row and the operator path announces through `'avatar_changed'`. Plain `text`
  with `.$type<>()`, so no CHECK constraint and no migration when phase 10 adds a sixth trigger.
  **Phase 10 owns the test asserting the union equals `'chat' | ProactiveTriggerKind`**, because
  it is the first phase in which both types exist
- `ninaMessageImages` (`nina_message_images`), `NinaImageKind`, `NinaMessageImage`,
  `NewNinaMessageImage`
- `ninaMemorySlots` (`nina_memory_slots`), `NinaMemorySource`, `NinaSlotValue`,
  `NinaPendingPromise`, `NinaPromiseMetric`, `NinaPendingPromisesSlot`,
  `NINA_SLOT_PENDING_PROMISES`, `NinaMemorySlot`, `NewNinaMemorySlot`
- `ninaMemoryFacts` (`nina_memory_facts`), `NinaFactCategory`, `NinaMemoryFact`,
  `NewNinaMemoryFact`
- `ninaNags` (`nina_nags`), `NinaNag`, `NewNinaNag`
- `ninaAvatars` (`nina_avatars`), `NinaAvatarSource`, `NinaAvatar`, `NewNinaAvatar`
- `pushSubscriptions` (`push_subscriptions`), `PushSubscriptionRow`, `NewPushSubscriptionRow`
- relations: `ninaMessagesRelations`, `ninaMessageImagesRelations`, `ninaAvatarsRelations`

**Creates — `lib/nina/queries.ts`** (exact signatures in Step 6; names only here):
`NinaIdentity`, `NinaMessageRow`, `NinaMessageInsert`, `NinaImageRow`, `NinaImageInsert`,
`NinaSlotRow`, `NinaSlotUpsert`, `NinaFactRow`, `NinaFactInsert`, `NinaNagRow`, `NinaNagUpsert`,
`NinaTurnInsert`, `NinaAvatarRow`, `NinaAvatarInsert`, `NinaAvatarCrop`;
`getNinaIdentity`, `listNinaMessages`, `getNinaMessageWindow`, `insertNinaMessages`,
`getNinaMessagesByIds`, `countUnreadNinaMessages`, `markNinaMessagesRead`,
`insertNinaMessageImages`, `listNinaMessageImages`, `getNinaMessageImagesForMessages`,
`getNinaMemorySlots`, `getNinaMemorySlot`, `upsertNinaMemorySlot`, `deleteNinaMemorySlot`,
`listNinaMemoryFacts`, `appendNinaMemoryFacts`, `updateNinaMemoryFact`, `deleteNinaMemoryFact`,
`getNinaNags`, `upsertNinaNag`, `insertNinaTurn`, `countNinaTurnsSince`,
`getCurrentNinaAvatar`, `listNinaAvatars`, `getUnannouncedCurrentNinaAvatar`,
`insertNinaAvatarAsCurrent`, `markNinaAvatarAnnounced`, `updateNinaAvatarCrop`,
`setNinaAvatarDescription`.

**Creates — `lib/env.ts`:** `ninaEnv()` (`OPENROUTER_API_KEY`, **`GITHUB_DISPATCH_TOKEN`**),
`pushEnv()` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, **`VAPID_SUBJECT`**), `adminEnv()`
(`ADMIN_EMAILS`), `isAdminEmail(email)`; types `NinaEnv`, `PushEnv`, `AdminEnv`.
**Config keys added: all five above plus `ADMIN_EMAILS`, seeded `mahfuzh74@gmail.com`.**
**RULING C4 — `lib/env.ts` and `.env.example` have exactly one owner and it is this phase.**
`GITHUB_DISPATCH_TOKEN` is RU-20's `workflow_dispatch` credential (a fine-grained PAT with
`actions: write`); the repo coordinates are deliberately **not** env vars but module constants in
phase 12's `lib/nina/imagedispatch.ts`, so a deploy cannot be misconfigured into dispatching at
someone else's repository. `VAPID_SUBJECT` is the `mailto:` that `web-push`'s `setVapidDetails()`
throws without. **Phase 11 drops its `lib/env.ts` and `.env.example` rows and its signature
change 1; phase 12 drops its Requires 7 ask.** Both consume as shipped.

**Creates — files:** `drizzle/0002_nina.sql` + `drizzle/meta/0002_snapshot.json`,
`assets/nina/_anchor.png`, `public/nina/avatar-001.png`,
`tests/db.schema.nina.test.ts`, `tests/env.admin.test.ts`.

**Signature changes:**

- `NarrativeProfile` (`lib/llm/facts.ts:53`) gains **two required fields**: `weightKg: number |
  null`, `sex: Sex | null`. **RU-1.** Its one constructor, `narrativeProfileOf`
  (`lib/insights/load.ts:179`), is widened in the same commit.
- **`ProfileFacts` — the *output* type — GAINS THEM TOO, and so do all three narrate prompts.
  RULING C5.** This inverts what this plan filed. The plan index's "Decisions taken under RU-21"
  is binding and its reasoning is the user's own: D15 was repealed because *"exposing user details
  like weight to ai analysis will 100% make the analysis much more accurate"*. Carrying weight and
  sex as far as `NarrativeProfile` and then dropping them before the payload delivers the half of
  the repeal that does nothing — Nina would see the numbers and the insight that reads the same
  runs would not. So `ProfileFacts` gains `weightKg: number | null` and `sex: Sex | null`,
  `profileFacts()` copies them through, and `lib/llm/prompts/narrate.ts`'s session, week and month
  prompts each lose the *"Never mention or imply anything about body weight"* rule and gain a rule
  about using it honestly. All three `*_PROMPT_VERSION` constants bump in the same commit, because
  a prompt edit with no version bump is a stale insight served forever.
  **The accepted consequence, stated plainly rather than discovered later:** the facts fed to the
  model change, so **`factsHash` moves and every cached insight regenerates on next view** — one
  model call per run the user actually opens, spread over however long it takes him to open them,
  against a user who said in as many words not to stint on tokens. No backfill, no cache purge,
  no migration; `insights` is unique on `(user_id, scope, scope_key, facts_hash)` and the old rows
  simply stop being hit. *Revisit if* the regeneration cost ever matters — the escape is to seed
  the two new fields only for runs newer than a cutoff date, which keeps every older hash stable
  and costs one date comparison in `narrativeProfileOf`.
- `scripts/check-openrouter-boundary.mjs` — `checkOpenRouterBoundary()` keeps its signature and
  gains an exemption pass over **two** paths, `lib/nina/` and `lib/env.ts` (Step 7 argues the
  second). **`BOUNDARY_DIRS` stays exported** (`check-badge-art.mjs:43` imports it) and a new
  `EXEMPT_PATHS` is exported beside it. **RU-2.**
- `scripts/check-llm-payload-boundary.mjs` — rule 2's single hardcoded symbol becomes a
  **`GUARDED_CALLS`** table, and **RULING D1 makes this phase its only writer. The table is
  complete and no other phase edits this file** — it is removed from the Files tables of phases 3,
  5 and 6. The four entries, shipped whole:

  | symbol | sanctioned callers | whose |
  |---|---|---|
  | `getOrCreateInsight` | `lib/insights/actions.ts`, `lib/llm/narrate.ts`, `app/api/cron/rollup/route.ts` | existing, unchanged |
  | `runNinaTurn` | `lib/nina/turn.ts`, `lib/nina/actions.ts`, `lib/nina/proactive.ts`, `app/api/cron/nina/route.ts` | phase 3 + phase 10 |
  | `distillNinaMemory` | `lib/nina/distill.ts`, `lib/nina/actions.ts` | phase 5 |
  | `describeNinaImage` | `lib/nina/actions.ts`, `components/nina/Composer.tsx` | phase 6 |

  Ten of the eleven paths do not exist at this phase's landing, which costs nothing — `sanctioned`
  is a string list compared against walked paths — and buys the property that the guard is
  correct on the day each symbol appears rather than one commit later. The name `GUARDED_CALLS`
  is binding: phase 3's `SANCTIONED`/`BLOCKING_CALLS` and phase 5's `BLOCKING_CALLS` are renamed
  in their plans. Note also that **`app/api/nina/image/route.ts` is NOT a sanctioned caller** — it
  no longer exists, because RU-20 replaced it with a `workflow_dispatch`.
- `lib/profile/schema.ts` — `profileFormSchema`, `profileWriteSchema`, `ProfileFormValues` and
  `toProfileWrite` all gain `sex`.
- `components/profile/ProfileForm.tsx` — renders a sex fieldset. `ProfileFormProps` is unchanged.

**Requires (from earlier phases):** nothing. This phase has no upstream.

**Provides — read these as fixed:**

- **Phase 2** gets `profiles.sex` with exactly the four-member domain and a `Sex` type it may
  import instead of re-declaring `RunnerSex`; `nina_messages.{id, role, text, sent_at,
  reply_to_id, run_id}`; `nina_message_images.description`; `nina_memory_slots.{key, value,
  updated_at}`; `nina_memory_facts.{id, text, source_message_id, created_at}`;
  `nina_nags.{code, level, last_mentioned_on}`; and the six reads its `NinaSourceGateway`
  declares, under the names in Step 6 (`getNinaIdentity`, `getNinaMemorySlots`,
  `listNinaMemoryFacts`, `getNinaMessageWindow`, `getNinaNags`; `readFiredPatterns` has no
  database half — patterns are computed by phase 9, not stored).
- **Phase 3** gets `insertNinaMessages` (emission order preserved), `insertNinaTurn`, and
  `lib/nina/actions.ts` already sanctioned in the payload guard's `GUARDED_CALLS` table. **It must
  name its turn entry point `runNinaTurn`**, because that is the string the guard greps for; any
  other name is a one-line edit to `GUARDED_CALLS`.
  **RULING A2 — these names are canonical and phase 3's `lib/nina/gateway.ts` is the only adapter**
  (exactly as phase 3 itself offered: *"or names close enough that `lib/nina/gateway.ts` is the
  only file that changes"*). The four spellings phase 3 drafted and must adapt to:

  | phase 3 wrote | ships as |
  |---|---|
  | `listNinaMemorySlots` | **`getNinaMemorySlots`** |
  | `insertNinaMessage` (singular, caller-supplied `seq`) | **`insertNinaMessages`** (batch, and **no `seq` at all**) |
  | `insertNinaMemoryFact` | **`appendNinaMemoryFacts`** |
  | `countNinaMessages` | **does not exist** — see below |

  **A2b, and it is a schema fact rather than a naming preference:** `seq` is a `bigserial`
  assigned by Postgres (D-2). Phase 3 must not write it, must not ask for
  `seq integer not null default 0`, and must not order by `(sent_at asc, seq asc)`. Emission order
  comes from one multi-row `INSERT`; every read in this file is `ORDER BY seq`.
- **Phase 4** gets `public/nina/avatar-001.png` and
  `listNinaMessages(userId, { limit }) -> Array<{ id, role, body, createdAt, … }>`, oldest
  first, deterministic (D-2).
- **Phase 5** gets `upsertNinaMemorySlot`, `appendNinaMemoryFacts`, the `NinaSlotValue` union and
  the `NinaPendingPromise` shape it must write.
- **`countNinaMessages` DOES NOT EXIST AND IS NOT BEING ADDED** (RULING A2). Phases 3 and 5 both
  named it; neither needs it. `getNinaMessageWindow`'s **`olderCount`** is the answer — it is a SQL
  `count(*)` taken in the same batch as the window, so the number can never disagree with the rows
  it accompanies, which a separate count call could not promise. A caller that already holds a
  context can read `context.conversation.window.length` instead. A second counting function would
  be a second snapshot of the same table and a second thing to keep in step.
- **Phase 9** gets `getNinaNags` / `upsertNinaNag`.
- **Phase 10** gets `countUnreadNinaMessages`, `markNinaMessagesRead`, `nina_messages.source`
  (with the final union — see C9 below), `nina_turns.trigger`, and **`profiles.last_seen_on`** —
  the app-open signal R3's silence trigger needs and could not otherwise have. NULL is "no
  signal", never "silent forever".
  **RULING A2/A2c — everything phase 10 asked for is ALREADY SHIPPED HERE, so PHASE 10 DOES NOT
  MODIFY `lib/nina/queries.ts`.** Its four asks exist under this file's names, and phase 10 changes
  its own call sites rather than this file:

  | phase 10 wrote | ships as |
  |---|---|
  | `listNinaNags` | **`getNinaNags`** |
  | `upsertNinaNag(userId, code, { level, lastMentionedOn })` | **`upsertNinaNag(userId, { code, level, lastMentionedOn })`** — one input object, `code` inside it |
  | `getUnannouncedCurrentAvatar` | **`getUnannouncedCurrentNinaAvatar`** |
  | `markAvatarAnnounced` | **`markNinaAvatarAnnounced`** |

  **`lib/nina/queries.ts` has exactly TWO writers of new functions: this phase, which creates the
  file, and phase 15, which appends `setCurrentNinaAvatar` and `deleteNinaAvatar`.** Nobody else
  appends to it — a data-access module with nine authors is a module with no invariants, and
  invariant 1 (`userId` in every `WHERE`) is the one that must not be optional.
- **Phase 11** gets the `push_subscriptions` table (declaration only — it owns every write) and
  `pushEnv()` returning **all three** of `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
  `VAPID_SUBJECT` (RULING C4). `VAPID_SUBJECT` is the `mailto:` that `web-push`'s
  `setVapidDetails()` throws without; phase 11 offered to add it and **does not need to** — it
  ships here, along with its `.env.example` entry, because `lib/env.ts` and `.env.example` have one
  owner. **Phase 11 therefore drops its `lib/env.ts` and `.env.example` Files rows and its
  signature change 1**, and consumes `pushEnv()` as shipped.
- **Phase 12** gets `ninaEnv().OPENROUTER_API_KEY` **and `ninaEnv().GITHUB_DISPATCH_TOKEN`**
  (RULING C4 — it consumes both as shipped and edits neither `lib/env.ts` nor `.env.example`),
  `lib/nina/` exempted from the OpenRouter guard,
  `nina_turns.{input_tokens, output_tokens, cost_micro_usd, latency_ms}` and
  `countNinaTurnsSince` for the daily cap. Plus the three columns RU-20 turned from conveniences
  into requirements:
  - **`nina_turns.args jsonb`** (RULING C1) — the job's own `NinaImageJobArgs`
    (`purpose`, `scene`, `mood`, `prompt`, `seed`, `replyToId`, `source`, `attempts`, `sidecar`).
    The repo is PUBLIC, so a `workflow_dispatch` input is world-readable and the prompt must
    travel in the database with only the opaque turn id in the dispatch; and the `schedule:`
    backstop wakes with no arguments at all, so a retry is impossible unless they are in the row.
  - **`NinaTurnStatus`'s `'pending'`** (RULING C2). Phase 12's documented fallback — `failed` plus
    `error_code: 'queued'` — is **withdrawn**; it would have written a failure row for every image
    she ever made. Write `'pending'`, keep the job phase (`'queued' | 'dispatched' | 'running'`)
    in `error_code`, and close the row from the callback.
  - **`nina_turns.tool_calls text`** (RULING C8) — where phase 12 writes `'dropped:save_memory'`.
- **Phase 13** gets `nina_avatars` end to end, `getCurrentNinaAvatar`,
  `insertNinaAvatarAsCurrent`, `getUnannouncedCurrentNinaAvatar`, `markNinaAvatarAnnounced`,
  `NINA_SLOT_PENDING_PROMISES`, and `listNinaMessageImages` for the gallery. Its promise evaluator
  also gets `NinaPendingPromise.{jobId, firedOn, attempts}` (RULING C3): RU-20 moved generation
  into another process minutes away, so the evaluator cannot learn from a return value whether it
  has already acted on a promise — `jobId` is that memory, `firedOn` is the not-twice-in-one-day
  rule, and `attempts` is what stops the `schedule:` backstop retrying forever. All three are
  optional and the slot is `jsonb`, so nothing else moves.
- **Phase 14** gets `nina_avatars` with **exactly** the eleven columns it named, `source`
  accepting `'operator'`, `announced_at` nullable, and the partial unique index
  `nina_avatars_user_current_unq on (user_id) where is_current` it asked for. Its statement order
  (un-current, then insert) is load-bearing under that index and is correct as written.
- **Phase 15** (new, `/admin/nina`) gets `nina_avatars.{crop_scale, crop_x, crop_y, description}`,
  `updateNinaAvatarCrop`, `setNinaAvatarDescription`, and `adminEnv()` / `isAdminEmail()`.
- **Phase 16** (new, `/admin/memory`) gets nullable `source_message_id` on both memory tables, a
  `source` discriminator `'distilled' | 'admin'` on both, and
  `upsertNinaMemorySlot` / `deleteNinaMemorySlot` / `updateNinaMemoryFact` /
  `deleteNinaMemoryFact`.

**Index amendments — APPLIED.** The reconciler has made all four: R23, R24, R25 and R26 are in
`NINA_CHATBOT_PLAN.md`'s Requirements table, rows 15 and 16 are in its Phases table, phase 1's own
row now reads its final **Satisfies `R6, R20, R23, R24, R25, R26`** and **~28 files** with an
**Owns** line naming *eight tables plus three `profiles` columns*, and phase 10's row cites
`profiles.last_seen_on` as satisfied rather than proxied. Nothing is left for a reader of this
section to do.

**Leaves alone (owned by others):** every prompt and every file under `lib/nina/` except
`queries.ts` (phases 2, 3, 5, 6, 9, 10, 12) · everything under `components/nina/` and `app/nina/`
(phases 4, 13) · `app/admin/**` and any admin gate (phases 15, 16) · every route handler ·
`scripts/nina-profpic.mjs` and `sharp` in `package.json` (phase 14) · `scripts/check-badge-art.mjs`
(verified: it imports `BOUNDARY_DIRS` only to build a section heading, and passes unchanged) ·
`badges.run_id`'s `set null`, `badges.dedupe_key`'s plainness, and `runs.reviewed_at`'s gate —
all three untouched · `lib/format.ts` · `components/ui/*` (the sex control is written inside
`ProfileForm.tsx` from existing class constants, so no primitive is added).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/schema.ts` | modify | `Sex` + `profiles.sex` + `profiles.last_seen_on` (`:97-122`); the R-22 comment narrowed by four words (`:406`); eight new tables appended after `shares` (`:462`); three new relations (`:507`); eighteen new row types (`:533`) |
| `drizzle/0002_nina.sql` | create | generated by `npm run db:generate`, then hand-audited against Step 5's checklist |
| `drizzle/meta/0002_snapshot.json` | create | generated |
| `drizzle/meta/_journal.json` | modify | generated — gains the `0002_nina` entry |
| `lib/nina/queries.ts` | create | every Nina read and write, `userId`-scoped exactly as `lib/db/queries.ts` is |
| `lib/env.ts` | modify | `ninaEnv()` (2 keys), `pushEnv()` (3 keys), `adminEnv()`, `isAdminEmail()` — the whole F33 environment contract, RULING C4 (`:86-89`, `:131-143`) |
| `.env.example` | modify | `OPENROUTER_API_KEY`'s comment rewritten for RU-2; `GITHUB_DISPATCH_TOKEN`, all three `VAPID_*` and `ADMIN_EMAILS` added — six variables, one owner (RULING C4) (`:44-47`) |
| `scripts/check-llm-payload-boundary.mjs` | modify | RU-1: rule 1 deleted, header rewritten to record the repeal. RULING D1: rule 2 becomes the **complete, final** `GUARDED_CALLS` table — `getOrCreateInsight`, `runNinaTurn`, `distillNinaMemory`, `describeNinaImage` — shipped whole here, and the file is removed from phases 3, 5 and 6 |
| `scripts/check-openrouter-boundary.mjs` | modify | RU-2: `EXEMPT_PREFIXES = ['lib/nina/']`, header gains the ruling, `BOUNDARY_DIRS` still exported |
| `lib/llm/facts.ts` | modify | RU-1: the `weightKg` bullet **rewritten as a record of the repeal**; `NarrativeProfile` gains `weightKg` and `sex`, and — RULING C5 — so do `ProfileFacts` and `profileFacts()` (`:17-23`, `:49-68`, `:237-246`) |
| `lib/insights/load.ts` | modify | `narrativeProfileOf` widened and its comment rewritten (`:179-188`) |
| `lib/llm/prompts/narrate.ts` | modify | RULING C5: the session, week and month prompts drop *"Never mention or imply anything about body weight"* and gain the honest-use rule; `SESSION_PROMPT_VERSION` 2→3, `WEEK_PROMPT_VERSION` 1→2, `MONTH_PROMPT_VERSION` 1→2 (`:16`, `:41-43`, `:53`, `:102`, `:141`) |
| `ROADMAP_v0.1.0.md` | modify | **RULING D2 — this phase is the file's only writer.** Seven edits: §2's D7 row (corrected — the new handler is phase 15's `/api/admin/nina/upload`, and `/api/cron/nina` is already inside the `/api/cron/*` glob) and D15 row, §4.1's env block (six variables), §4.2's Weight row, §4.8's route list **and its four-tab→five-tab sentence and tab table**, §5's "after F11" pointer line, and §6's non-goals — RU-1, RU-2, RU-3 |
| `RECONCILIATION_v0.1.0.md` | modify | R-28 gains a **Repealed** block; the D15 amendment row points at it |
| `docs/plans/F33-nina.md` | create | RULING D2 item 5: a pointer stub — what F33 is, the sixteen phases, a link to `NINA_CHATBOT_PLAN.md`, and where the rulings table lives. Not a retrospective; that is a follow-up card |
| `lib/profile/schema.ts` | modify | `sex` through the form schema, the write schema, `ProfileFormValues` and `toProfileWrite` |
| `components/profile/ProfileForm.tsx` | modify | a four-option sex fieldset between Height and Weight |
| `app/onboarding/page.tsx` | modify | one line in the `values` literal (`:34-40`) |
| `app/me/page.tsx` | modify | one line in the `values` literal (`:116-122`) |
| `assets/nina/_anchor.png` | create | `nina.png`'s bytes, unmodified — the generation anchor (R20, RU-16) |
| `public/nina/avatar-001.png` | create | 764×1024 downscale — her first avatar and phase 4's committed constant |
| `nina.png` | delete | moved to `assets/nina/_anchor.png`; must not survive at the repo root |
| `tests/db.schema.nina.test.ts` | create | asserts the shapes that nine other phases depend on |
| `tests/env.admin.test.ts` | create | `isAdminEmail` parsing, the one piece of new env logic worth a test |
| `tests/profile.schema.test.ts` | modify | `sex` through the `form()` helper and two `toEqual`s, plus two new cases (`:13`, `:85`, `:102`) |
| `tests/llm.facts.test.ts` | modify | RULING C5, and it is the noisiest file in the phase: the `PROFILE` literal gains two fields (`:31`), the `facts.profile` keys assertion gains them (`:137`), and the **three** “never mentions weight” tests at `:140`, `:236` and `:362` invert into assertions that it now DOES — same coverage, opposite sign |
| `tests/live/narrate.live.test.ts` | modify | one profile literal — a `typecheck` failure, not a test failure (`:63`) |
| `tests/db.schema.test.ts` | modify | two test titles that become lies, and two lines asserting D-4 (`:119`, `:385`) |

**Twenty-eight files against the index's estimate of ~14, and the fourteen extra are all
consequences rather than ideas.** Two generated drizzle artefacts · two one-line profile-page
edits · two committed PNGs · two new tests · four existing test **files** this phase breaks — nine
edit sites between them once RULING C5 is applied, and two of the nine are `tsc` failures rather
than assertion failures, which is exactly the kind that gets missed · and the two the reconciler added: `lib/llm/prompts/narrate.ts`, because RULING C5
put weight and sex in the payload and three prompts still forbade the subject, and
`docs/plans/F33-nina.md`, because RULING D2 gives every doc edit in the set to this phase and §5's
feature table is deliberately not being extended to carry F33.

Two of the fourteen are worth naming as *reductions* elsewhere, since a file count is only honest
read against the whole set: phases 3, 5 and 6 each **lose** `scripts/check-llm-payload-boundary.mjs`
(RULING D1), and phase 11 loses both `lib/env.ts` and `.env.example` (RULING C4). This phase is
larger so that four others are smaller and no shared file has two authors.

---

## Implementation Steps

### Step 1: `profiles.sex`, the `Sex` domain, and four words in the R-22 comment

**File:** `lib/db/schema.ts:97-122` (the `profiles` table), `:404-408` (the badges comment)

**Change:** Add the `Sex` type above `profiles`, add the column inside it, and rewrite
`weight_kg`'s comment — it currently says the value "is read by nothing that talks to a model",
which RU-1 makes false, and a comment that lies is worse than no comment.

**Code** — replace the whole `profiles` declaration and add the type immediately above it:

```ts
/**
 * The runner's sex, R6. **The schema has never carried this** — the roadmap's §4.3 `profiles`
 * block has five columns and none of them is gender — so this is a genuinely new fact about the
 * runner rather than a rename of something.
 *
 * Four members, and `'unspecified'` is deliberately distinct from `NULL`: NULL means "never
 * asked", `'unspecified'` means "asked, and declined to say". Nina treats those differently — the
 * first is a thing she may ask about once, the second is a thing she must not ask about again.
 *
 * A plain `text` column, not a `pgEnum`: this file has no enum anywhere (`runs.intent`,
 * `runs.source`, `badges.key` and `insights.scope` are all `text().$type<…>()`), and adding the
 * first one would mean every future member is a migration instead of a one-line union edit.
 */
export type Sex = 'male' | 'female' | 'other' | 'unspecified'

/** Iteration order for the form's segmented control. Same order, one source. */
export const SEX_VALUES = ['male', 'female', 'other', 'unspecified'] as const

export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** The YEAR, not an age and not a birthday. Age is derived at read time or not at all. */
  birthYear: integer('birth_year'),
  heightCm: integer('height_cm'),
  /**
   * kg, one decimal — the one non-integer measured column in the schema (roadmap §4.2).
   *
   * **D15/R-28 REPEALED (RU-1, F33).** This column used to be documented as "must never enter an
   * LLM payload, and read by nothing that talks to a model". Both halves of that are now false:
   * `lib/llm/facts.ts`'s `NarrativeProfile` carries it, Nina's context carries it, and the
   * grep in `scripts/check-llm-payload-boundary.mjs` that enforced it has been deleted. The
   * repeal is recorded in RECONCILIATION_v0.1.0.md R-28 and in NINA_CHATBOT_PLAN.md RU-1; the
   * user's reason, verbatim, is "i am the only one that uses this app… this is my personal toy".
   *
   * Everything else about the column is unchanged: still `numeric(4,1)`, still the one deliberate
   * non-integer, still rounded to one decimal by `lib/profile/schema.ts` before it gets here.
   */
  weightKg: numeric('weight_kg', { precision: 4, scale: 1, mode: 'number' }),
  /** R6 / F33. See `Sex` above for why NULL and `'unspecified'` are not the same answer. */
  sex: text('sex').$type<Sex>(),
  restingHr: integer('resting_hr'),
  /**
   * MEASURED only (roadmap §4.4 / D11). A Tanaka estimate never lands here — the resolver
   * computes it on the fly and labels it `estimated`, so that a stored number always means a
   * human or a watch actually observed it.
   */
  maxHr: integer('max_hr'),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true, mode: 'date' }),
  /**
   * **The day the app was last opened**, as an Asia/Jakarta calendar day (roadmap D6) — a string,
   * never a JS `Date`, exactly like `runs.occurred_on`.
   *
   * F33 R3's fourth proactive trigger is prolonged silence, and the user specified it on two
   * signals: *no run in N days*, **or** *the app unopened for N days*. The schema had no answer
   * to the second — there is no last-seen column anywhere — so phase 10 was forced to proxy it
   * with CHAT silence, which is a different thing: he can open the app every morning, read his
   * runs, never message Nina, and be scolded for ghosting her. This column is the missing signal.
   *
   * **A cheap best-effort touch, not an audit trail.** One `date`, not a timestamp and not a
   * history table: the trigger asks "which day", so a day is the whole of what needs storing, and
   * a per-request timestamp write would turn every page load into a database write for a number
   * nobody reads at that resolution. A missed touch costs nothing.
   *
   * **NULL means "never seen", which the silence rule must read as NO SIGNAL and not as
   * infinitely silent.** A profile row exists from the moment onboarding is skipped, so a fresh
   * install has `NULL` here — and a rule that treats NULL as "silent since the epoch" roasts him
   * on day one for not having used an app he just installed.
   *
   * **This phase declares the column and nothing else.** Nothing writes it yet: phase 10 owns the
   * trigger that reads it, and where the touch belongs (a layout, a middleware, a Server Action)
   * is a later phase's decision. See Handoffs.
   */
  lastSeenOn: date('last_seen_on', { mode: 'string' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
```

**Then the four-word narrowing (D-4).** In the `badges.runId` comment at `:404-408`, replace the
first sentence only:

```ts
    /**
     * R-22 — the one non-cascade FK among the F03 tables, and deliberately so. A badge is a fact
     * about the past; deleting the run that earned it must not delete the history that it
     * happened. Do not "fix" this to cascade by pattern-matching the other FKs in this file.
     *
     * (F33 adds two more `set null` FKs, both on `nina_messages`, for the reason given in that
     * table's header. R-22's argument here is untouched by them.)
     */
    runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
```

**Impact:** `profiles` gains a nullable column, so every existing row stays valid and
`upsertProfile`'s `Partial<Omit<NewProfile, 'userId'>>` signature already accepts it with no
change. `Profile` and `NewProfile` widen automatically. Nothing that reads `profiles` today
breaks, because nothing enumerates its columns exhaustively.

---

### Step 2: the import list, and the first three Nina tables

**File:** `lib/db/schema.ts:1-15` (imports), then appended after `shares` at `:462`

**Change:** Two new imports, then the audit table, the conversation, and its images. Order
matters: `ninaTurns` is declared first because `nina_messages.turn_id` carries its id (as a plain
column, D-5), and `ninaMessageImages` last because it references `nina_messages.id`.

**Code** — the import block, replacing `:1-15` wholesale:

```ts
import { relations, sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
```

**Code** — appended after the `shares` table and before the Relations banner:

```ts
/* ============================================================================
 * F33 — Nina. Eight tables, and one rule that explains the shape of all of them:
 * SHE READS THROUGH `lib/nina/queries.ts` AND NOWHERE ELSE. Every table below
 * carries `user_id` even though this app has exactly one user (plan invariant 7),
 * because the query layer is built that way and diverging from it is more work
 * rather than less.
 *
 * `nina_turns` is declared first because `nina_messages.turn_id` carries its id.
 * ==========================================================================*/

export type NinaTurnKind = 'chat' | 'proactive' | 'image' | 'vision'

/**
 * **`'pending'` is here under RULING C2, and it is what makes RU-20's out-of-process generation
 * auditable.** A `kind = 'image'` turn is dispatched to a GitHub Actions worker and finishes
 * minutes later in another process, so between the dispatch and the callback there is a real row
 * that is neither a success nor a failure. Phase 12's originally documented fallback — write it
 * as `failed` with `error_code: 'queued'` and correct it later — is **withdrawn**: it would put a
 * failure row in the table for every single image she ever makes, and poison every "how often
 * does she fail" reading of `nina_turns` for the life of the app. A cheap word in a union beats a
 * permanently wrong table.
 *
 * Plain `text` with `.$type<>()`, exactly like `kind`, so **adding the member is NOT a migration**
 * — the column domain lives in TypeScript and Postgres holds a string.
 */
export type NinaTurnStatus = 'pending' | 'ok' | 'repaired' | 'failed'

/**
 * **The audit trail for every model call Nina makes.** One row per call, written whether it
 * succeeded or not — this is the table that answers "why did that turn take nineteen seconds",
 * "how much has she cost this month" and "how often does the repair round-trip actually fire",
 * and it is the only place those questions can be answered after the fact.
 *
 * It is deliberately NOT `insights`-shaped: no `facts_hash`, no unique index, no cache. An
 * insight is a cacheable product keyed by its inputs; a conversation turn is an event, and two
 * identical inputs a minute apart are two events. Nothing here is ever read to avoid a call.
 *
 * `cost_micro_usd` is an INTEGER in millionths of a dollar, not a float in dollars — the schema's
 * smallest-sensible-unit rule (roadmap D5) applied to money, which is where float drift is least
 * forgivable. A $0.04 image generation is `40000`.
 *
 * ── IT IS ALSO THE JOB ROW FOR RU-20, WHICH IS WHY `args` AND `'pending'` EXIST ───────────────
 * An `image` turn does not finish in this process. It is dispatched to a GitHub Actions worker
 * and lands minutes later, so its row is written `status = 'pending'` with the job phase in
 * `error_code` and its full arguments in `args`, and is closed by the callback. That makes this
 * one row the audit record AND the queue entry, which is the right call for exactly one reason:
 * a separate `nina_image_jobs` table would hold the same nine columns, need the same daily-cap
 * count, and then have to be joined against this table to answer "what did that cost". One row
 * per model call stays one row per model call even when the call outlives the request.
 *
 * `trigger` holds phase 2's `ProactiveTriggerKind` ('run_committed' | 'missed_usual_day' |
 * 'pattern_crossed' | 'silence' | 'avatar_changed') for `kind = 'proactive'` rows and NULL
 * otherwise. It is untyped `text` here on purpose: the vocabulary belongs to phase 10, and this
 * table must not become the thing phase 10 has to migrate to add a fifth trigger.
 */
export const ninaTurns = pgTable(
  'nina_turns',
  {
    /** nanoid(12) — lib/id.ts newId(). Phase 3 stamps it onto every message the turn emitted. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NinaTurnKind>().notNull(),
    trigger: text('trigger'),
    model: text('model').notNull(),
    /** `NINA_PROMPT_VERSION` at call time, so a voice regression can be dated. */
    promptVersion: integer('prompt_version'),
    /**
     * The D3 token-floor canary again, one feature over: `extractions.prompt_tokens` exists for
     * exactly this reason and `lib/llm/vision.ts` reads it. A vision turn whose `input_tokens`
     * sits far below the floor is a turn where the endpoint silently dropped the image.
     */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /**
     * **WHICH tools fired, comma-joined. `''` when none — not an integer count (RULING C8).**
     * A count would have answered a question nobody asked. Phase 3's ruling (b) keeps
     * `save_memory` as a tool with an *empirical exit condition* — drop it if it never actually
     * fires — and that is only decidable if the column records the tool NAMES. `'save_memory'`,
     * `'save_memory,attach_run'`, `''`. `NOT NULL DEFAULT ''` so "no tools" and "not recorded"
     * cannot be told apart by accident, and so `WHERE tool_calls <> ''` is the whole query.
     * Phase 12 also writes the sentinel `'dropped:save_memory'` here.
     */
    toolCalls: text('tool_calls').notNull().default(''),
    latencyMs: integer('latency_ms'),
    /** Millionths of a USD. See the header — never a float, never dollars. */
    costMicroUsd: integer('cost_micro_usd'),
    status: text('status').$type<NinaTurnStatus>().notNull(),
    /**
     * Free text, ours not the provider's. NULL on success.
     *
     * **Phase 12 also uses it as the job PHASE while `status = 'pending'`** —
     * `'queued' | 'dispatched' | 'running'` — and only writes an actual failure reason here when
     * `status = 'failed'`. Two meanings in one column, disambiguated by `status`, which is
     * cheaper than a `job_phase` column that is NULL for every one of the other three kinds.
     */
    errorCode: text('error_code'),
    /**
     * **The job's own arguments, and RU-20 makes them mandatory rather than nice to have
     * (RULING C1).** Nullable, and NULL for every `kind` except `'image'`.
     *
     * Phase 12's `NinaImageJobArgs`, verbatim as the documented shape:
     * `{ purpose, scene, mood, prompt, seed, replyToId, source, attempts, sidecar }`.
     *
     * TWO independent reasons it cannot live anywhere else:
     *
     *   1. **THE REPO IS PUBLIC.** A `workflow_dispatch` input is world-readable in the Actions
     *      run log, forever. So the prompt must travel in the DATABASE and the dispatch may carry
     *      only an opaque job id. Putting the prompt in the dispatch input would publish every
     *      word Nina ever generates an image from.
     *   2. **The `schedule:` backstop wakes with NO ARGUMENTS AT ALL.** It exists because a
     *      dispatch can be dropped, and its whole job is to find work that was left behind. A
     *      retry is therefore impossible unless the arguments are in the row — a job whose args
     *      were only ever in the dispatch payload is a job that can never be retried.
     *
     * Untyped `jsonb` on purpose: `NinaImageJobArgs` belongs to phase 12, and this table must not
     * become the thing phase 12 has to migrate to add a tenth field to its own job shape. Same
     * argument as `trigger` above.
     */
    args: jsonb('args'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** "her turns, newest first" and "how many image turns today" both read this. */
    index('nina_turns_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

export type NinaRole = 'runner' | 'nina'

/**
 * **Why the row exists. RULING C9 fixed this union, and it is `'chat'` plus every member of phase
 * 2's `ProactiveTriggerKind` — nothing more and nothing less.**
 *
 * This phase originally declared `'chat' | 'proactive' | 'operator'`. Both of the losers lost for
 * a concrete reason, and the reasons are recorded here because a column domain is the hardest
 * thing in the schema to widen later.
 *
 * ── `'proactive'` LOSES: IT WOULD HAVE COST R8 ITS INDEXED READ ───────────────────────────────
 * Phase 10 owns every writer of a non-`'chat'` source, and its durable idempotence marker for R8
 * — "did I already speak about this run?" — is
 * `source = 'run_committed' AND run_id = <this run>`: one indexed read on
 * `nina_messages_user_run_idx`, decided by the row itself. Collapsing all five triggers into
 * `'proactive'` would make that question unanswerable from this table and force a join against
 * `nina_turns.trigger` — an audit table — to decide whether to send a message. Idempotence that
 * depends on a join against the audit trail is idempotence that breaks the first time the audit
 * trail is pruned.
 *
 * ── `'operator'` LOSES: IT HAS NO WRITER AT ALL ──────────────────────────────────────────────
 * It was declared for phase 14's operator script, and phase 14 deliberately writes **no**
 * `nina_messages` row: it re-anchors her face and inserts a `nina_avatars` row, and the
 * announcement reaches the conversation through `'avatar_changed'` when she next speaks. A member
 * with no writer is a member every `switch` has to handle and no test can ever exercise.
 *
 * ── ONE VOCABULARY, TWO DECLARATIONS, AND A TEST THAT PINS THEM TOGETHER ─────────────────────
 * The union is declared HERE, in `lib/db/schema.ts`, because it is a column domain and the column
 * lives here. Phase 2 declares `ProactiveTriggerKind` for the prompt layer. **Phase 10 owns the
 * test asserting `NinaMessageSource` equals `'chat' | ProactiveTriggerKind`** — not this phase,
 * because phase 10 is the first phase in which both types exist and a test cannot import a type
 * that has not been written yet.
 */
export type NinaMessageSource =
  | 'chat'
  | 'run_committed'
  | 'missed_usual_day'
  | 'pattern_crossed'
  | 'silence'
  | 'avatar_changed'

/**
 * **The conversation.** One row per bubble, which is RU-5 made structural: Nina returns 1–4 short
 * messages per turn and each one is a real row, so each is independently quotable (phase 7),
 * independently unread (phase 10) and independently attachable to an image (phase 6). A `jsonb`
 * array of bubbles on one row would have made every one of those a special case.
 *
 * ── `seq`, AND WHY IT IS A SEQUENCE AND NOT A TIMESTAMP ───────────────────────────────────────
 * Four bubbles written inside one `db.batch` must read back in the order Nina emitted them, and
 * `sent_at` cannot promise that: `defaultNow()` inside one transaction returns the SAME instant
 * for all four statements, so `ORDER BY sent_at` leaves their order up to the planner. A
 * per-turn integer would fix that but still ties two DIFFERENT turns landing in the same instant,
 * which is exactly what an `after()` hook and a cron running concurrently can do.
 *
 * So `seq` is a `bigserial`: a total order over the whole conversation, `ORDER BY seq` is
 * deterministic with no composite key, and rows inserted in one batch are numbered in array
 * order. It is also the natural cursor for "the messages before this one" (phase 4's
 * `olderCount`) and the natural watermark for "read up to here" (phase 10).
 *
 * The PK stays `id` (nanoid(12)) because ids appear in URLs, in `reply_to_id` and in the DOM
 * (`#nina-msg-<id>`), and a guessable integer in any of those is a change of kind.
 *
 * ── TWO `SET NULL` FKs, DELIBERATELY (see `badges.run_id`'s note) ─────────────────────────────
 * `reply_to_id` and `run_id` are BOTH dereferenced on every render — a quote bubble and a run
 * card. A dangling id would paint an empty quote or an empty card, so they are real FKs; and a
 * deleted run must not delete the conversation about it, so they are `set null` rather than
 * cascade. Phase 7 and phase 8 both degrade a NULL to plain text, which is the designed outcome.
 * `turn_id` gets neither: nothing renders it, and an audit pointer must not be able to block a
 * delete.
 */
export const ninaMessages = pgTable(
  'nina_messages',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    /**
     * The total order. Assigned by Postgres, never by the app, and never reused. See the header.
     */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'runner' is him, 'nina' is her. Not 'user'/'assistant' — she is not an assistant. */
    role: text('role').$type<NinaRole>().notNull(),
    /** Her words or his, verbatim. Never a template, never a rendered number. */
    text: text('text').notNull(),
    /**
     * Why the row exists — see the type's own note (RULING C9). `'chat'` is him or her in a
     * conversation; the other five are phase 10's, one per `ProactiveTriggerKind`, and phase 10
     * is the only writer of any of them. `'run_committed'` plus `run_id` is R8's whole
     * idempotence check, which is why the triggers are spelled out instead of collapsed.
     */
    source: text('source').$type<NinaMessageSource>().notNull().default('chat'),
    /** `nina_turns.id`. A plain column on purpose — see the header's last paragraph. */
    turnId: text('turn_id'),
    /** WhatsApp-style quote (R12). Self-referencing; `AnyPgColumn` is what makes that typecheck. */
    replyToId: text('reply_to_id').references((): AnyPgColumn => ninaMessages.id, {
      onDelete: 'set null',
    }),
    /** The run he shared into the chat (R13). */
    runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    /** Phase 11 stamps it when Web Push accepted the notification. NULL = never pushed. */
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    /** Phase 10's unread badge is `role = 'nina' AND read_at IS NULL`. */
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    /** The one hot read: "her last N messages, in order". Index-only for the ORDER BY. */
    index('nina_messages_user_seq_idx').on(t.userId, t.seq),
    /**
     * **The unread count, as a PARTIAL index — and RULING C9's index check resolves to "already
     * done here".** Phase 10 asked for either `(user_id, read_at) WHERE read_at IS NULL` or
     * `(user_id, role, read_at)`; this index is strictly stronger than both and no second one is
     * added. It carries the `role = 'nina'` predicate too, so his own messages — which are
     * `read_at IS NULL` forever, because nothing ever marks them read — are not even in the
     * index, let alone counted.
     *
     * Partial rather than full, on the `shares_run_id_active_unq` precedent one table over:
     * almost every row is read almost all of the time, so a full index on `read_at` would be a
     * big index answering a question about a handful of rows.
     *
     * This matters more than an index note usually does, which is why it is spelled out: the
     * count runs on **every page render of every tabbed screen** — the badge lives in the bottom
     * bar, so `/`, `/runs`, `/nina`, `/trends` and `/me` each pay for it. A sequential scan of
     * the whole conversation on every navigation is the one performance mistake in this schema
     * that a user would actually feel.
     */
    index('nina_messages_user_unread_idx')
      .on(t.userId, t.seq)
      .where(sql`${t.readAt} is null and ${t.role} = 'nina'`),
    /** Phase 7 resolves a quote's target, and phase 13 needs "what replied to this". */
    index('nina_messages_reply_to_idx').on(t.replyToId),
    /** Phase 8's "did he already share this run" and the run-detail back-link. */
    index('nina_messages_user_run_idx').on(t.userId, t.runId),
  ],
)

export type NinaImageKind = 'upload' | 'generated'

/**
 * **Its own table, not a `jsonb` column on `nina_messages`.** Three readers force that: phase 13's
 * detail page queries "every image in this conversation, newest first" without touching the
 * message rows, phase 6 writes a `description` per image, and phase 12 writes a `prompt` per
 * image. A `jsonb` array would make the gallery a full table scan plus a TypeScript flatten, and
 * `run_photos` — the table this one is modelled on — made the same call for the same reason.
 *
 * `user_id` is denormalised alongside `message_id` so the gallery read is `WHERE user_id = $1`
 * rather than a join back through `nina_messages` purely to prove ownership (invariant 7).
 *
 * `description` is `glm-4.6v`'s dense private text (RU-12): what is actually in the picture, in
 * prose, written for `glm-5.3` to react to and never shown to the runner. It is what makes R10
 * work at all, and phase 6 is the only writer.
 */
export const ninaMessageImages = pgTable(
  'nina_message_images',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Cascade: an image with no message is nothing. Unlike a badge, it is not a fact. */
    messageId: text('message_id')
      .notNull()
      .references(() => ninaMessages.id, { onDelete: 'cascade' }),
    /** 'upload' = he sent it (phase 6). 'generated' = she made it (phase 12). */
    kind: text('kind').$type<NinaImageKind>().notNull(),
    blobUrl: text('blob_url').notNull(),
    /** `nina/<userId>/…` (RU-7). The reaper's future handle on these — see Handoffs. */
    pathname: text('pathname').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    /** `glm-4.6v`'s private description. See the header. Phase 6 writes it. */
    description: text('description'),
    /** The generation prompt, `kind = 'generated'` only. Phase 12 writes it. */
    prompt: text('prompt'),
    /** Stable order for a multi-image message, the `run_photos.sort_order` precedent. */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** "the images on these messages" — phase 4's list hydration. */
    index('nina_message_images_message_idx').on(t.messageId),
    /** Phase 13's gallery, newest first, without a join. */
    index('nina_message_images_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)
```

**Impact:** three new tables, no existing table touched. The self-FK on `reply_to_id` is
`ON DELETE NO ACTION`-safe under a user cascade because the FK is checked at end of statement and
the whole conversation goes in one statement — but it is `set null` anyway, so the question does
not arise.

---

### Step 3: memory, nags, avatars, push

**File:** `lib/db/schema.ts`, appended directly after `ninaMessageImages`

**Change:** The remaining five tables. The two memory tables are RU-6 made structural — an
upserted slot table that drives proactivity, and an append-only ledger that supplies colour — and
both now carry the two columns R26's hand-editing needs.

**Code:**

```ts
/** Who put the row there. `'admin'` is the `/admin/memory` editor (R26, phase 16). */
export type NinaMemorySource = 'distilled' | 'admin'

/**
 * One `pending_promises` entry (R19). Phase 5 writes them from a finished turn, phase 13's
 * evaluator reads them, checks each against reality, and on a met promise generates a new avatar
 * and makes her announce it.
 *
 * `metric` plus `target`/`targetKey` is what makes a promise CHECKABLE against precomputed facts
 * instead of re-asked of the model — invariant 2 applied to a promise. `'free'` is the escape
 * hatch for a promise no field can decide; phase 13 leaves those pending and she may ask.
 *
 * Every date is a Jakarta `'YYYY-MM-DD'` string (roadmap D6), never a JS `Date`.
 */
export type NinaPromiseMetric =
  | 'distance_km_total'
  | 'run_count'
  | 'record'
  | 'badge'
  | 'free'

export type NinaPendingPromise = {
  /** nanoid(12), so she can refer to one promise across turns. */
  id: string
  /** Her promise in her own words, display-ready. */
  text: string
  /** The condition in his terms, display-ready — "kalau lo lari 50k bulan ini". */
  condition: string
  metric: NinaPromiseMetric
  /** The number to reach, in the metric's own unit. NULL for 'record' | 'badge' | 'free'. */
  target: number | null
  /** A `RECORD_CATALOG` or `BADGE_CATALOG` key for 'record' | 'badge'. NULL otherwise. */
  targetKey: string | null
  /** Deadline, or NULL for open-ended. */
  byDate: string | null
  promisedOn: string
  /** `nina_messages.id` she said it in, or NULL if the admin typed it. */
  sourceMessageId: string | null
  status: 'pending' | 'met' | 'expired'
  resolvedOn: string | null
  /**
   * ── THE THREE FIELDS BELOW ARE RULING C3, AND RU-20 IS WHY THEY HAVE TO EXIST ────────────────
   * The promise state machine used to be answerable in one process: evaluate the promise,
   * generate the avatar, make her announce it, mark it `met`. RU-20 broke that — generation is
   * now dispatched to a GitHub Actions worker and LANDS IN ANOTHER PROCESS MINUTES LATER. So
   * "did she keep her promise" can no longer be answered by a return value, and the only place
   * left to answer it is the promise itself.
   *
   *   · `jobId`   — the `nina_turns.id` of the dispatched generation. Without it, a promise that
   *                 has been acted on and a promise nobody has touched are indistinguishable,
   *                 and the evaluator fires a second job on its next sweep. This is the
   *                 idempotence marker for the promise path, exactly as
   *                 `source='run_committed' AND run_id=…` is for R8.
   *   · `firedOn` — the Jakarta `'YYYY-MM-DD'` the job was dispatched. A day, not an instant,
   *                 because every other date on this type is a day (roadmap D6) and the rule it
   *                 serves is "not twice in one day".
   *   · `attempts`— how many dispatches this promise has already cost. A worker that fails
   *                 transport is retried by the `schedule:` backstop, and a promise with no
   *                 attempt counter is a promise that can be retried forever.
   *
   * `nina_memory_slots.value` is `jsonb`, so **all three cost no migration**; and all three are
   * **optional**, so phase 5's constructor, its `mergePendingPromises` and its tests compile
   * untouched — a promise written before phase 12 lands simply has none of them, which reads
   * correctly as "never dispatched".
   */
  jobId?: string | null
  /** Jakarta `'YYYY-MM-DD'`. See the note above. */
  firedOn?: string | null
  attempts?: number
}

/** The `pending_promises` slot's value, in full. Phase 13 parses exactly this. */
export type NinaPendingPromisesSlot = { promises: NinaPendingPromise[] }

/** The one slot key this phase names. Phase 5 owns every other key in the vocabulary. */
export const NINA_SLOT_PENDING_PROMISES = 'pending_promises'

/**
 * What may live in `nina_memory_slots.value`. A bare JSON string is the common case — see the
 * table's header for why that is a feature and not a shortcut.
 */
export type NinaSlotValue =
  | string
  | number
  | boolean
  | NinaPendingPromisesSlot
  | { [key: string]: unknown }
  | unknown[]

/**
 * **The upserted half of RU-6.** One row per `(user, key)`, overwritten in place: the runner's
 * nickname, his usual running days, what he is training for, what hurts, what he has promised.
 * These are the facts Nina must not have to search for — they are pre-injected on every turn
 * (RU-4), so a slot that is wrong is wrong in every conversation until it is corrected.
 *
 * ── WHY `jsonb` AND NOT `text` ────────────────────────────────────────────────────────────────
 * Almost every slot is a short display-ready phrase, and `jsonb` stores one as a bare JSON string
 * (`"suka lari pagi"`) perfectly well. But `pending_promises` is a list of records with a
 * deadline and a status, and phase 13 has to evaluate its fields — so one column has to hold
 * both. The alternative, a `text` column plus a `value_json` column, is two columns to keep in
 * step and a rule about which one wins. `lib/nina/queries.ts` absorbs the difference instead:
 * `getNinaMemorySlots` renders every value to the string phase 2's context wants, and
 * `getNinaMemorySlot` returns one parsed for phase 13.
 *
 * ── `source_message_id` IS NULLABLE, AND `source` SAYS WHY ────────────────────────────────────
 * A distilled slot points at the message it came from. A slot the admin typed into
 * `/admin/memory` (R26, phase 16) points at nothing, because nothing in the chat said it. NULL is
 * therefore a real answer and not missing data — and `source` is what tells the two apart, so
 * phase 5's distiller can refuse to silently overwrite something a human asserted, and so the
 * editor can show which rows it owns. Same argument as `nina_avatars.source`.
 */
export const ninaMemorySlots = pgTable(
  'nina_memory_slots',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Phase 5 owns the vocabulary. `NINA_SLOT_PENDING_PROMISES` is the one key declared here. */
    key: text('key').notNull(),
    value: jsonb('value').$type<NinaSlotValue>().notNull(),
    source: text('source').$type<NinaMemorySource>().notNull().default('distilled'),
    /** `nina_messages.id`, unenforced (see `nina_messages`' header). NULL = the admin typed it. */
    sourceMessageId: text('source_message_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // `(user_id, key)` is the natural key and the whole access pattern is "every slot for this
  // user", which is a leading-column PK scan. No secondary index earns its place — the same
  // argument `records` makes for its own PK.
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
)

/**
 * Phase 5 owns this vocabulary; these six are its starting set. A `text` column, so adding a
 * seventh is a one-line union edit and not a migration.
 */
export type NinaFactCategory =
  | 'person'
  | 'preference'
  | 'body'
  | 'life'
  | 'goal'
  | 'training'
  | 'other'

/**
 * **The append-only half of RU-6.** A slot answers "what is true now"; the ledger answers "what
 * has he told me". It is never updated and never deleted by the app — a contradicting later
 * statement REPLACES the slot and leaves both ledger rows, which is what lets her say "lo bilang
 * benci lari pagi bulan lalu" three months after the slot moved on.
 *
 * `confidence` is an INTEGER PERCENT, 0–100 — the smallest-sensible-unit rule applied to a
 * probability, so that summing or thresholding it never drifts. 100 is "he said it outright".
 *
 * `source_message_id` is nullable for the same reason as the slots table, and `source`
 * distinguishes a distilled row from one the admin typed (R26, phase 16). Phase 16 is the only
 * caller of `updateNinaMemoryFact` and `deleteNinaMemoryFact`; nothing in the runtime mutates a
 * ledger row.
 */
export const ninaMemoryFacts = pgTable(
  'nina_memory_facts',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').$type<NinaFactCategory>().notNull(),
    /** One fact, one sentence, in the language he said it in. */
    text: text('text').notNull(),
    /** Integer percent 0–100. See the header. */
    confidence: integer('confidence').notNull().default(100),
    source: text('source').$type<NinaMemorySource>().notNull().default('distilled'),
    /** `nina_messages.id`, unenforced. NULL = the admin typed it, not the chat. */
    sourceMessageId: text('source_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** "the newest 60 facts" — the only read (`MEMORY_FACT_LIMIT`, phase 2). */
    index('nina_memory_facts_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

/**
 * **The escalation ledger (RU-9).** `lib/nina/patterns.ts` computes what is true; this table
 * records what she has already SAID about it, so the third late start gets a different sentence
 * from the first instead of the same one three times. Anger that repeats verbatim stops being
 * anger and starts being a notification.
 *
 * `level` is the rung on phase 2's anger ladder, `count` is how many times the code has ever
 * fired, and `last_mentioned_on` is a Jakarta calendar day (roadmap D6, a string) because "did
 * she already mention this today" is a day question and never an instant question.
 *
 * Phase 9 owns the decay rule — a level that never falls is a friend who never forgives.
 */
export const ninaNags = pgTable(
  'nina_nags',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Phase 9's code. **The model never coins one** — it is handed codes that fired. */
    code: text('code').notNull(),
    level: integer('level').notNull().default(0),
    count: integer('count').notNull().default(0),
    lastMentionedOn: date('last_mentioned_on', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.code] })],
)

/** 'seed' is the committed first avatar, 'generated' phase 12, 'operator' phase 14, 'admin' 15. */
export type NinaAvatarSource = 'seed' | 'generated' | 'operator' | 'admin'

/**
 * **Her album (RU-7, R19).** Per-user, blobs under `nina/<userId>/`, exactly one row current.
 *
 * ── THE PARTIAL UNIQUE INDEX IS THE POINT ─────────────────────────────────────────────────────
 * `nina_avatars_user_current_unq on (user_id) where is_current` makes two current avatars
 * IMPOSSIBLE rather than merely unlikely — the `shares_run_id_active_unq` precedent, and for the
 * same reason: the alternative is a read-then-compare that is correct until two writers race.
 * **A consequence every writer must respect: un-current the old row BEFORE inserting the new
 * one, in one `db.batch`.** Insert-first violates the index mid-transaction. Phase 14's script
 * documents this and gets the order right; `insertNinaAvatarAsCurrent` in Step 6 is the runtime
 * half and gets it right for the same reason.
 *
 * ── `announced_at` ────────────────────────────────────────────────────────────────────────────
 * Nullable, so "the current avatar she has not mentioned yet" is a query
 * (`is_current AND announced_at IS NULL`) and not a flag someone has to remember to set. That
 * query is what makes RU-17 work: a hand-uploaded avatar makes her speak, because something
 * finds the un-announced row and asks her to comment on it.
 *
 * ── THE CROP TRANSFORM (R23) ──────────────────────────────────────────────────────────────────
 * `/admin/nina` (phase 15) lets the user zoom and drag an image until her face sits centred in a
 * CIRCULAR frame, and that transform has to persist per avatar or every screen re-guesses it.
 * Three nullable columns, in a resolution-independent convention so the same numbers work for a
 * 28 px bubble avatar and a full-screen photo:
 *
 *   - `crop_scale` — a multiple of the COVER fit. `1.000` is the smallest scale that still fills
 *     the circle; `1.500` is zoomed 50% further in. `numeric(5,3)`, so 0.001 … 9.999.
 *   - `crop_x`, `crop_y` — the image centre's offset from the frame centre, in THOUSANDTHS OF
 *     THE FRAME'S WIDTH. Positive x moves the image right, positive y moves it down. Integers,
 *     because the schema's rule is integers in the smallest sensible unit and a per-mille of a
 *     frame is that unit here.
 *
 * **All three NULL together means "no transform": render the image `object-cover`, centred.**
 * That is the value every row written before phase 15 carries — the seed row, phase 12's
 * generations, phase 14's operator uploads — so none of them needs a backfill and none of them is
 * invalid. A renderer must treat a partial triple (scale set, offsets NULL) as offsets of zero
 * rather than as an error.
 *
 * ── `description` (R25) ───────────────────────────────────────────────────────────────────────
 * What the picture DEPICTS, in prose. It exists so that "lah lo ganti foto profil na, itu lagi
 * dimana?" can be answered with a story consistent with the actual image and with the chat
 * history — she cannot invent where she was in a photograph she cannot see, and RU-12 forbids
 * sending `glm-5.3` an image. Nullable, and three different phases populate it three different
 * ways: **phase 12** already has its own generation prompt and writes from that; **phase 14**
 * and **phase 15** are handed a file with no prompt at all, so both run phase 6's `glm-4.6v`
 * describe pre-pass over it. Declaring the column is this phase's whole share of R25.
 */
export const ninaAvatars = pgTable(
  'nina_avatars',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blobUrl: text('blob_url').notNull(),
    /** `nina/<userId>/avatar-<id>.jpg` (RU-7). Phase 12 owns the exact shape. */
    pathname: text('pathname').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    source: text('source').$type<NinaAvatarSource>().notNull(),
    /** Multiple of the cover fit; NULL = no transform. See the header. */
    cropScale: numeric('crop_scale', { precision: 5, scale: 3, mode: 'number' }),
    /** Per-mille of frame width, positive = right. NULL = 0. */
    cropX: integer('crop_x'),
    /** Per-mille of frame width, positive = down. NULL = 0. */
    cropY: integer('crop_y'),
    /** What the picture shows, in prose (R25). See the header for its three writers. */
    description: text('description'),
    isCurrent: boolean('is_current').notNull().default(false),
    /** NULL = she has not mentioned this one yet. See the header. */
    announcedAt: timestamp('announced_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** Two current avatars are impossible, not unlikely. Writers: un-current first. */
    uniqueIndex('nina_avatars_user_current_unq')
      .on(t.userId)
      .where(sql`${t.isCurrent}`),
    /** The album, newest first. */
    index('nina_avatars_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

/**
 * **DECLARATION ONLY — phase 11 owns every write against this table.** It is here because a
 * migration per phase is a migration per phase, and because phase 11's exit criteria are about
 * VAPID and a service worker rather than about DDL.
 *
 * The shape is the Web Push subscription as `PushSubscription.toJSON()` gives it, flattened:
 * `endpoint` plus the two `keys` fields. `endpoint` is globally unique by spec, so it gets a
 * unique index — but the PK stays a nanoid, because an endpoint is a 300-character URL and a
 * 300-character primary key is a 300-character foreign key everywhere it is referenced.
 *
 * `failure_count` and `revoked_at` are the pruning story: a browser that has revoked its
 * subscription answers 404/410 to every send, and a sender that does not record that will retry
 * forever. Phase 11 decides the threshold.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    /** `keys.p256dh` — the client's public key, base64url. */
    p256dh: text('p256dh').notNull(),
    /** `keys.auth` — the client's auth secret, base64url. */
    auth: text('auth').notNull(),
    /** Which browser this is, so a stale subscription is identifiable by a human. */
    userAgent: text('user_agent'),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'date' }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true, mode: 'date' }),
    failureCount: integer('failure_count').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** One row per browser endpoint. Re-subscribing upserts on this. */
    uniqueIndex('push_subscriptions_endpoint_unq').on(t.endpoint),
    /** "every live subscription for this user" — the send fan-out. */
    index('push_subscriptions_user_idx').on(t.userId),
  ],
)
```

**Impact:** five more tables, nothing existing touched. `numeric(5,3)` on `crop_scale` is the
second non-integer column in the schema and the header says why; it is a display transform rather
than a measurement, so `profiles.weight_kg`'s "one deliberate exception" claim is about measured
values and stays true.

**One more comment to keep true.** The file header at `:25-27` says `profiles.weight_kg` is "the
single deliberate exception" to the integer rule. Add one clause so `crop_scale` is accounted for
rather than contradicting it:

```ts
 *   - **Integers in the smallest sensible unit** (roadmap D5). Distance is metres, duration and
 *     pace are seconds. `profiles.weight_kg` is the single deliberate exception among MEASURED
 *     values; `nina_avatars.crop_scale` is a display transform rather than a measurement and is
 *     `numeric` for the same reason a zoom factor is not an integer. Floats summed over a month
 *     drift visibly; integers do not.
```

---

### Step 4: relations and row types

**File:** `lib/db/schema.ts:507` (after `sharesRelations`) and `:533` (the end of the file)

**Change:** Three relations and eighteen row types. The relations cost nothing at runtime and are
declared for the same reason the existing seven are — `db.query.*` stays available if a later
phase wants a relational read, even though the sanctioned path is explicit selects inside
`db.batch`. Only the three tables with a real FK between them get one; `nina_memory_*`,
`nina_nags`, `nina_turns` and `push_subscriptions` have no relationship to declare.

**Code** — appended after `sharesRelations`:

```ts
export const ninaMessagesRelations = relations(ninaMessages, ({ one, many }) => ({
  user: one(users, { fields: [ninaMessages.userId], references: [users.id] }),
  run: one(runs, { fields: [ninaMessages.runId], references: [runs.id] }),
  /** The quoted message (R12). Named so `replyTo` reads as the noun it is. */
  replyTo: one(ninaMessages, {
    relationName: 'ninaMessageReplyTo',
    fields: [ninaMessages.replyToId],
    references: [ninaMessages.id],
  }),
  /** The messages quoting THIS one. The other side of the self-relation. */
  replies: many(ninaMessages, { relationName: 'ninaMessageReplyTo' }),
  images: many(ninaMessageImages),
}))

export const ninaMessageImagesRelations = relations(ninaMessageImages, ({ one }) => ({
  message: one(ninaMessages, {
    fields: [ninaMessageImages.messageId],
    references: [ninaMessages.id],
  }),
  user: one(users, { fields: [ninaMessageImages.userId], references: [users.id] }),
}))

export const ninaAvatarsRelations = relations(ninaAvatars, ({ one }) => ({
  user: one(users, { fields: [ninaAvatars.userId], references: [users.id] }),
}))
```

**Code** — appended at the end of the Row types block:

```ts
export type NinaTurn = typeof ninaTurns.$inferSelect
export type NewNinaTurn = typeof ninaTurns.$inferInsert
export type NinaMessage = typeof ninaMessages.$inferSelect
export type NewNinaMessage = typeof ninaMessages.$inferInsert
export type NinaMessageImage = typeof ninaMessageImages.$inferSelect
export type NewNinaMessageImage = typeof ninaMessageImages.$inferInsert
export type NinaMemorySlot = typeof ninaMemorySlots.$inferSelect
export type NewNinaMemorySlot = typeof ninaMemorySlots.$inferInsert
export type NinaMemoryFact = typeof ninaMemoryFacts.$inferSelect
export type NewNinaMemoryFact = typeof ninaMemoryFacts.$inferInsert
export type NinaNag = typeof ninaNags.$inferSelect
export type NewNinaNag = typeof ninaNags.$inferInsert
export type NinaAvatar = typeof ninaAvatars.$inferSelect
export type NewNinaAvatar = typeof ninaAvatars.$inferInsert
/**
 * `PushSubscriptionRow`, not `PushSubscription` — the latter is a DOM lib global that phase 11's
 * client code uses by that exact name, and shadowing it in a module that also talks to the
 * browser API is how a subscription gets written to the wrong shape.
 */
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert
```

**Impact:** `seq` is a `bigserial`, so `NewNinaMessage['seq']` is optional (it has a database
default) — inserts must NOT pass it, and `insertNinaMessages` in Step 6 does not.

---

### Step 5: generate the migration, then audit it

**File:** `drizzle/0002_nina.sql`, `drizzle/meta/0002_snapshot.json`, `drizzle/meta/_journal.json`

**Change:** One command, then a read-through. `drizzle.config.ts` is already pointed at
`./lib/db/schema.ts` and `./drizzle`, so nothing about the config changes.

```bash
npm run db:generate     # writes drizzle/0002_<name>.sql + meta/0002_snapshot.json + journal entry
```

Rename the generated file to `drizzle/0002_nina.sql` **and** update its `tag` in
`drizzle/meta/_journal.json` to `0002_nina` — `0001_badge_award_ledger` set that precedent
(drizzle's own generated name was replaced by a descriptive one), and `drizzle-kit migrate` reads
the tag from the journal, so the two must agree.

**Audit checklist — read the generated SQL and confirm all ten, because a wrong guess here is a
production migration:**

1. `ALTER TABLE "profiles" ADD COLUMN "sex" text;` and
   `ALTER TABLE "profiles" ADD COLUMN "last_seen_on" date;` — both nullable, neither with a
   default, neither backfilled.
2. Eight `CREATE TABLE` statements. **`nina_messages"."seq"` must be
   `bigserial NOT NULL`** (drizzle emits `bigserial` for `bigserial(…, { mode: 'number' })`); if
   it came out as `bigint NOT NULL` with no sequence, the import is wrong and every insert will
   fail on a null.
3. `nina_messages` gets **three** FK constraints — `user_id` cascade, `reply_to_id` **self**,
   `run_id` → `runs`. The last two are `ON DELETE SET NULL`. There is **no** FK on `turn_id`.
4. `nina_memory_slots` and `nina_memory_facts` get **no** FK on `source_message_id`, and both
   columns are nullable.
5. `nina_avatars` gets `CREATE UNIQUE INDEX "nina_avatars_user_current_unq" ON "nina_avatars"
   ("user_id") WHERE "nina_avatars"."is_current";` — **`UNIQUE`, and with the `WHERE`.** A plain
   unique index here forbids an album; no index at all forbids nothing.
6. `nina_messages_user_unread_idx` carries its `WHERE … is null and … = 'nina'`.
7. `crop_scale numeric(5, 3)`, `confidence integer DEFAULT 100 NOT NULL`,
   **`tool_calls text DEFAULT '' NOT NULL`** (RULING C8 — if this comes out `integer`, Step 2 was
   applied from a stale draft), `failure_count integer DEFAULT 0 NOT NULL`,
   `source` on `nina_memory_*` defaulting to `'distilled'`, `source` on `nina_messages`
   defaulting to `'chat'`, `is_current boolean DEFAULT false NOT NULL`.
8. **Nothing touches `badges`, `runs`, `insights`, `records`, `shares`, `extractions`,
   `run_photos`, `run_splits`, `run_zones` or any Auth.js table.** The R-22 edit was a comment;
   if `badges` appears in this SQL, something in Step 1 went wrong and the diff must be discarded.
   In particular there must be no `GENERATED` clause anywhere near `dedupe_key`.
9. Exactly one new journal entry, `idx: 2`, `version: "7"`, `breakpoints: true`.
10. **`nina_turns` carries `"args" jsonb` and it is NULLABLE with no default** (RULING C1). It is
    the one column in this migration whose absence does not fail a test and does fail a feature:
    phase 12 cannot dispatch an image job without it — the prompt would have to travel in a
    world-readable `workflow_dispatch` input — and the `schedule:` backstop could never retry one.
    `status` stays plain `"status" text NOT NULL` with no CHECK constraint, because
    `NinaTurnStatus`'s new `'pending'` member (RULING C2) is a TypeScript domain and must not
    become a migration every time the union grows.

Then apply and verify:

```bash
npm run db:migrate      # against DATABASE_URL_UNPOOLED
npm run db:check        # drizzle-kit's own consistency check on the journal + snapshots
npm run db:smoke        # the existing smoke script — proves the pooled connection still works
```

**Impact:** forward-only. The rollback section names the eight `DROP TABLE`s and the one
`DROP COLUMN` by hand, because that is what forward-only means.

---

### Step 6a: `lib/nina/queries.ts` — header, types, identity, the conversation

**File:** `lib/nina/queries.ts` (new; create `lib/nina/`)

**Change:** The module header and the first third. Every function takes `userId` first and that
value appears in the `WHERE` of every statement it runs — `lib/db/queries.ts`'s invariant 1,
restated here because this is a second door to the same database and a second door is exactly
where an unscoped read gets in.

**No `import 'server-only'`.** `lib/db/queries.ts` does not have it either, deliberately: adding
it would make this module unimportable from Vitest and from `scripts/*.mjs`, and phase 14's
operator script is a `scripts/*.mjs`.

**Code:**

```ts
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  ninaAvatars,
  ninaMemoryFacts,
  ninaMemorySlots,
  ninaMessageImages,
  ninaMessages,
  ninaNags,
  ninaTurns,
  users,
  type NinaAvatarSource,
  type NinaFactCategory,
  type NinaImageKind,
  type NinaMemorySource,
  type NinaMessageSource,
  type NinaRole,
  type NinaSlotValue,
  type NinaTurnKind,
  type NinaTurnStatus,
} from '@/lib/db/schema'
import { newId } from '@/lib/id'

/**
 * Every Nina read and write, in one module — `lib/db/queries.ts` for `lib/nina/`.
 *
 * ## The two invariants it inherits
 *
 * **1. userId scoping (roadmap D8, plan invariant 7).** Every exported function takes `userId`
 * as its first parameter and that value is in the `WHERE` of every statement it runs. There is
 * NO exception in this file — `lib/db/queries.ts` has exactly one (`getRunByShareToken`, where a
 * 96-bit token is the credential) and nothing here is credential-addressed. `userId` comes from
 * the session via `requireUserId()`, never from a Server Action argument or a URL segment.
 *
 * A row that exists but is not yours and a row that does not exist are the same outcome. These
 * functions return `null`, `[]` or `false` rather than throwing a `NotFoundError`, because every
 * caller is either Nina's own turn loop (which must degrade, not 500) or an admin screen (which
 * shows "gone" rather than an error page). Nothing here distinguishes absent from forbidden.
 *
 * **2. She never writes her own SQL against `runs` (plan invariant 9).** There is not one
 * reference to `runs`, `records`, `badges` or `insights` below. Nina's view of the training
 * history comes from `lib/db/queries.ts` through `lib/nina/load.ts`, so `reviewed_at IS NOT NULL`
 * keeps gating every aggregate she sees without this file having to remember to.
 *
 * ## Why `db.batch` and never `db.transaction`
 *
 * `db.transaction()` throws on the neon-http driver. `db.batch([...])` is one HTTP request that
 * Postgres runs inside one transaction. Same rule as `lib/db/queries.ts`, same reason.
 *
 * ## Ordering
 *
 * `nina_messages.seq` is a `bigserial`, so `ORDER BY seq` is the emission order of the whole
 * conversation and nothing in this file needs a composite sort or a tiebreak. See that table's
 * header for why a timestamp could not do the job.
 */

/* ============================================================================
 * §1 Shapes
 * ==========================================================================*/

export interface NinaIdentity {
  /** `users.name` as the OAuth provider gave it. */
  fullName: string | null
  /** The `nickname` memory slot, once phase 5 has confirmed one. */
  nickname: string | null
}

/**
 * One message, as every reader wants it.
 *
 * ── THE THREE-LAYER BOUNDARY (RULING A1). DO NOT “FIX” EITHER END TO MATCH THE OTHER ───────────
 *   1. `lib/db/schema.ts` — the COLUMNS: `text`, `sent_at` (`ninaMessages.text`,
 *      `ninaMessages.sentAt`). Phase 2's spelling, and a column name is forever.
 *   2. THIS FILE — the data-access DTO: **`body`** and **`createdAt`**, uniformly, in EVERY
 *      function, because every function selects `messageColumns` (§2) and that is where the alias
 *      is written. There is no function in this module that returns `text`/`sentAt`.
 *   3. `lib/nina/context.ts` (phase 2) — the prompt-layer input `MessageInput`: `text`, `sentAt`.
 *
 * **`lib/nina/gateway.ts`'s `dbNinaSourceGateway` (phase 3) is the SINGLE mapper** between layers
 * 2 and 3 (`text: row.body`, `sentAt: row.createdAt`). It is the only file in the feature that
 * knows both spellings, which is the whole point: one translation point, reviewable in one diff,
 * instead of nine consumers each guessing. Every other reader — phases 4, 6, 7, 8, 10, 12, 13,
 * 15, 16 — consumes `body`/`createdAt` and is correct in doing so.
 *
 * `seq` rides along because phase 10 needs a read watermark and phase 4 needs a stable React key
 * that is also a sort key.
 */
export interface NinaMessageRow {
  id: string
  seq: number
  role: NinaRole
  body: string
  createdAt: Date
  source: NinaMessageSource
  turnId: string | null
  replyToId: string | null
  runId: string | null
  readAt: Date | null
}

/** What a writer supplies. `seq` is absent on purpose — Postgres assigns it. */
export interface NinaMessageInsert {
  role: NinaRole
  body: string
  source?: NinaMessageSource
  turnId?: string | null
  replyToId?: string | null
  runId?: string | null
}

export interface NinaImageRow {
  id: string
  messageId: string
  kind: NinaImageKind
  blobUrl: string
  pathname: string
  width: number | null
  height: number | null
  bytes: number | null
  description: string | null
  prompt: string | null
  sortOrder: number
  createdAt: Date
}

export interface NinaImageInsert {
  messageId: string
  kind: NinaImageKind
  blobUrl: string
  pathname: string
  width?: number | null
  height?: number | null
  bytes?: number | null
  description?: string | null
  prompt?: string | null
  sortOrder?: number
}

/**
 * A slot as phase 2's context wants it: `value` already RENDERED to a display string. See
 * `renderSlotValue` for what rendering means, and `getNinaMemorySlot` for the parsed form.
 */
export interface NinaSlotRow {
  key: string
  value: string
  source: NinaMemorySource
  sourceMessageId: string | null
  updatedAt: Date
}

export interface NinaSlotUpsert {
  key: string
  value: NinaSlotValue
  /** Defaults to 'distilled'. Phase 16's editor passes 'admin'. */
  source?: NinaMemorySource
  /** NULL is a real answer — nothing in the chat said it. */
  sourceMessageId?: string | null
}

export interface NinaFactRow {
  id: string
  category: NinaFactCategory
  text: string
  confidence: number
  source: NinaMemorySource
  sourceMessageId: string | null
  createdAt: Date
}

export interface NinaFactInsert {
  category: NinaFactCategory
  text: string
  /** Integer percent 0–100. Defaults to 100. */
  confidence?: number
  source?: NinaMemorySource
  sourceMessageId?: string | null
}

export interface NinaNagRow {
  code: string
  level: number
  count: number
  lastMentionedOn: string | null
  updatedAt: Date
}

export interface NinaNagUpsert {
  code: string
  level: number
  /** Jakarta 'YYYY-MM-DD'. */
  lastMentionedOn: string | null
}

export interface NinaTurnInsert {
  kind: NinaTurnKind
  model: string
  /** `'pending'` is an image job in flight (RULING C2). See the column's note. */
  status: NinaTurnStatus
  trigger?: string | null
  promptVersion?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  /**
   * Comma-joined tool NAMES, `''` when none — a string, not a count (RULING C8). Defaults to
   * `''`, so a caller that makes no tool call passes nothing.
   */
  toolCalls?: string
  latencyMs?: number | null
  /** Millionths of a USD. */
  costMicroUsd?: number | null
  /** On `status: 'pending'`, phase 12's job phase: `'queued' | 'dispatched' | 'running'`. */
  errorCode?: string | null
  /**
   * The job's arguments (RULING C1) — phase 12's `NinaImageJobArgs`, `null` for every other
   * `kind`. `unknown` rather than that type, because the type is phase 12's and this module must
   * not import from a later phase. The column's docstring carries the shape and the reason.
   */
  args?: unknown
}

export interface NinaAvatarRow {
  id: string
  blobUrl: string
  pathname: string
  width: number | null
  height: number | null
  bytes: number | null
  source: NinaAvatarSource
  cropScale: number | null
  cropX: number | null
  cropY: number | null
  description: string | null
  isCurrent: boolean
  announcedAt: Date | null
  createdAt: Date
}

export interface NinaAvatarInsert {
  blobUrl: string
  pathname: string
  source: NinaAvatarSource
  width?: number | null
  height?: number | null
  bytes?: number | null
  description?: string | null
}

/**
 * The circular-frame transform (R23). `scale` is a multiple of the cover fit; `x` and `y` are the
 * image centre's offset from the frame centre in thousandths of the frame width. Passing `null`
 * for all three clears the transform back to plain centred `object-cover`.
 */
export interface NinaAvatarCrop {
  scale: number | null
  x: number | null
  y: number | null
}

/* ============================================================================
 * §2 Column lists
 *
 * Spelled out once each rather than `db.select()`, for the same reason
 * `lib/llm/facts.ts` builds its profile field by field: a `select()` widens
 * silently when a column is added, and two of these rows go to a model.
 * ==========================================================================*/

const messageColumns = {
  id: ninaMessages.id,
  seq: ninaMessages.seq,
  role: ninaMessages.role,
  body: ninaMessages.text,
  createdAt: ninaMessages.sentAt,
  source: ninaMessages.source,
  turnId: ninaMessages.turnId,
  replyToId: ninaMessages.replyToId,
  runId: ninaMessages.runId,
  readAt: ninaMessages.readAt,
}

const imageColumns = {
  id: ninaMessageImages.id,
  messageId: ninaMessageImages.messageId,
  kind: ninaMessageImages.kind,
  blobUrl: ninaMessageImages.blobUrl,
  pathname: ninaMessageImages.pathname,
  width: ninaMessageImages.width,
  height: ninaMessageImages.height,
  bytes: ninaMessageImages.bytes,
  description: ninaMessageImages.description,
  prompt: ninaMessageImages.prompt,
  sortOrder: ninaMessageImages.sortOrder,
  createdAt: ninaMessageImages.createdAt,
}

const avatarColumns = {
  id: ninaAvatars.id,
  blobUrl: ninaAvatars.blobUrl,
  pathname: ninaAvatars.pathname,
  width: ninaAvatars.width,
  height: ninaAvatars.height,
  bytes: ninaAvatars.bytes,
  source: ninaAvatars.source,
  cropScale: ninaAvatars.cropScale,
  cropX: ninaAvatars.cropX,
  cropY: ninaAvatars.cropY,
  description: ninaAvatars.description,
  isCurrent: ninaAvatars.isCurrent,
  announcedAt: ninaAvatars.announcedAt,
  createdAt: ninaAvatars.createdAt,
}

/* ============================================================================
 * §3 Identity
 * ==========================================================================*/

/**
 * RU-8's seed. `users.name` is what Google gave us; the `nickname` slot is what he told her to
 * call him, which she asks for in the first conversation. One batch, two statements, one snapshot
 * — so she can never be handed a name from before a rename and a nickname from after it.
 */
export async function getNinaIdentity(userId: string): Promise<NinaIdentity> {
  const [nameRows, slotRows] = await db.batch([
    db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),

    db
      .select({ value: ninaMemorySlots.value })
      .from(ninaMemorySlots)
      .where(and(eq(ninaMemorySlots.userId, userId), eq(ninaMemorySlots.key, 'nickname')))
      .limit(1),
  ])

  const raw = slotRows[0]?.value
  return {
    fullName: nameRows[0]?.name ?? null,
    nickname: typeof raw === 'string' && raw.length > 0 ? raw : null,
  }
}

/* ============================================================================
 * §4 The conversation
 * ==========================================================================*/

/**
 * The last `limit` messages, returned **OLDEST FIRST** — display order, which is what phase 4's
 * `app/nina/page.tsx` renders straight down the page.
 *
 * The query itself is `ORDER BY seq DESC LIMIT n` and the array is reversed in TypeScript,
 * because "the newest n" is an index-backed descending scan of n rows while "the oldest n of the
 * tail" is not expressible without knowing where the tail starts. Reversing `n <= 200` items is
 * free; reading the whole conversation to reverse it would not be.
 */
export async function listNinaMessages(
  userId: string,
  opts: { limit: number },
): Promise<NinaMessageRow[]> {
  const rows = await db
    .select(messageColumns)
    .from(ninaMessages)
    .where(eq(ninaMessages.userId, userId))
    .orderBy(desc(ninaMessages.seq))
    .limit(opts.limit)

  return rows.reverse()
}

/**
 * Phase 2's `readMessageWindow`: the last `limit` messages oldest-first, plus how many exist
 * before them, so the system prompt can say "there are 312 earlier messages" instead of implying
 * the conversation began forty messages ago.
 *
 * `olderCount` is a SQL `count(*)` minus the window's length — never `allMessages.length - limit`,
 * which would mean materialising the whole conversation to compute one integer. One batch, so the
 * count and the window are the same snapshot and the number can never disagree with the rows.
 */
export async function getNinaMessageWindow(
  userId: string,
  limit: number,
): Promise<{ messages: NinaMessageRow[]; olderCount: number }> {
  const [rows, countRows] = await db.batch([
    db
      .select(messageColumns)
      .from(ninaMessages)
      .where(eq(ninaMessages.userId, userId))
      .orderBy(desc(ninaMessages.seq))
      .limit(limit),

    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaMessages)
      .where(eq(ninaMessages.userId, userId)),
  ])

  const total = countRows[0]?.total ?? 0
  return { messages: rows.reverse(), olderCount: Math.max(0, total - rows.length) }
}

/**
 * **One multi-row INSERT, not a batch of single inserts, and that is the R for phase 4's
 * ordering.** Postgres evaluates `nextval` once per row in the order the `VALUES` list gives
 * them, so `seq` comes out ascending in emission order — bubble 1 before bubble 4, always. A
 * `db.batch` of four separate inserts would also work today but does not promise it.
 *
 * Returns the inserted rows in the same order, ids and `seq` included, because phase 3 needs the
 * ids to hand back to the client and phase 6 needs them to attach images.
 */
export async function insertNinaMessages(
  userId: string,
  rows: readonly NinaMessageInsert[],
): Promise<NinaMessageRow[]> {
  if (rows.length === 0) return []

  const inserted = await db
    .insert(ninaMessages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        role: row.role,
        text: row.body,
        source: row.source ?? 'chat',
        turnId: row.turnId ?? null,
        replyToId: row.replyToId ?? null,
        runId: row.runId ?? null,
      })),
    )
    .returning(messageColumns)

  return [...inserted].sort((a, b) => a.seq - b.seq)
}

/** Phase 7 resolves a quote target; phase 4 hydrates after an optimistic send. Scoped, so a */
/** foreign id simply does not come back. */
export async function getNinaMessagesByIds(
  userId: string,
  ids: readonly string[],
): Promise<NinaMessageRow[]> {
  if (ids.length === 0) return []
  return db
    .select(messageColumns)
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), inArray(ninaMessages.id, [...ids])))
    .orderBy(asc(ninaMessages.seq))
}

/**
 * Phase 10's unread dot. Reads `nina_messages_user_unread_idx` exactly — the partial index exists
 * for this one query, which runs on every render of the tab bar.
 */
export async function countUnreadNinaMessages(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessages)
    .where(
      and(
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
  return rows[0]?.n ?? 0
}

/**
 * Opening the chat marks everything of hers read. `now` is a parameter so a test pins a date
 * instead of mocking global time — `lib/profile/schema.ts`'s `toProfileWrite` precedent.
 * Returns how many rows changed, so phase 10 can skip a `revalidatePath` when nothing did.
 */
export async function markNinaMessagesRead(userId: string, now: Date = new Date()): Promise<number> {
  const updated = await db
    .update(ninaMessages)
    .set({ readAt: now })
    .where(
      and(
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
    .returning({ id: ninaMessages.id })
  return updated.length
}
```

**Impact:** nothing existing is touched — the file is new. `lt` and `asc` are imported here and
used in §5–§7 below.

---

### Step 6b: `lib/nina/queries.ts` — images and memory

**File:** `lib/nina/queries.ts`, appended

**Code:**

```ts
/* ============================================================================
 * §5 Images
 * ==========================================================================*/

/**
 * Phase 6 writes uploads, phase 12 writes generations. `messageId` is checked against the
 * caller's own messages first: the FK only proves the message EXISTS, and an attacker-supplied
 * message id that exists is exactly what invariant 7 is about. One extra statement, and it is
 * the only place in this file where a write validates a foreign key by hand.
 */
export async function insertNinaMessageImages(
  userId: string,
  rows: readonly NinaImageInsert[],
): Promise<NinaImageRow[]> {
  if (rows.length === 0) return []

  const messageIds = [...new Set(rows.map((row) => row.messageId))]
  const owned = await db
    .select({ id: ninaMessages.id })
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), inArray(ninaMessages.id, messageIds)))

  if (owned.length !== messageIds.length) return []

  const inserted = await db
    .insert(ninaMessageImages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        messageId: row.messageId,
        kind: row.kind,
        blobUrl: row.blobUrl,
        pathname: row.pathname,
        width: row.width ?? null,
        height: row.height ?? null,
        bytes: row.bytes ?? null,
        description: row.description ?? null,
        prompt: row.prompt ?? null,
        sortOrder: row.sortOrder ?? 0,
      })),
    )
    .returning(imageColumns)

  return inserted
}

/**
 * Phase 13's gallery: every image in the conversation, newest first, his and hers together. Reads
 * `nina_message_images_user_created_idx` with no join — which is the whole reason this is a table
 * and not a `jsonb` column on `nina_messages`.
 */
export async function listNinaMessageImages(
  userId: string,
  opts: { limit: number },
): Promise<NinaImageRow[]> {
  return db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(eq(ninaMessageImages.userId, userId))
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
    .limit(opts.limit)
}

/**
 * Hydrating a rendered message list: the images belonging to these messages, in one query rather
 * than one per bubble. Ordered by `(message_id, sort_order)` so a caller can group by the first
 * column without re-sorting.
 *
 * `id` is the final tiebreak above and here because `created_at` ties for rows written in one
 * statement — the same problem `nina_messages.seq` solves properly, and one worth solving
 * cheaply rather than properly for a table nobody paginates.
 */
export async function getNinaMessageImagesForMessages(
  userId: string,
  messageIds: readonly string[],
): Promise<NinaImageRow[]> {
  if (messageIds.length === 0) return []
  return db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        inArray(ninaMessageImages.messageId, [...messageIds]),
      ),
    )
    .orderBy(asc(ninaMessageImages.messageId), asc(ninaMessageImages.sortOrder))
}

/* ============================================================================
 * §6 Memory — slots and the ledger (RU-6)
 * ==========================================================================*/

/**
 * `nina_memory_slots.value` is `jsonb`, and phase 2's context wants a display string. This is the
 * one place that conversion happens.
 *
 * A bare JSON string is returned as itself — no quotes, no escaping — which is the common case
 * and the reason the column is `jsonb` rather than two columns. Anything structured is
 * `JSON.stringify`d, which is honest rather than pretty: a structured slot in a prompt should
 * look like data, because it IS data, and `pending_promises` is read by phase 13's evaluator and
 * not by the sentence Nina is writing.
 */
function renderSlotValue(value: NinaSlotValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/**
 * Phase 2's `readMemorySlots`. Every slot for this user — a leading-column PK scan, which is why
 * the table has no secondary index. Ordered by `key` so two identical states produce two
 * identical prompts, which is what makes a voice regression bisectable.
 */
export async function getNinaMemorySlots(userId: string): Promise<NinaSlotRow[]> {
  const rows = await db
    .select({
      key: ninaMemorySlots.key,
      value: ninaMemorySlots.value,
      source: ninaMemorySlots.source,
      sourceMessageId: ninaMemorySlots.sourceMessageId,
      updatedAt: ninaMemorySlots.updatedAt,
    })
    .from(ninaMemorySlots)
    .where(eq(ninaMemorySlots.userId, userId))
    .orderBy(asc(ninaMemorySlots.key))

  return rows.map((row) => ({ ...row, value: renderSlotValue(row.value) }))
}

/**
 * One slot, **parsed** — the counterpart to `getNinaMemorySlots`' rendering. Phase 13 calls it
 * with `NINA_SLOT_PENDING_PROMISES` and casts the result to `NinaPendingPromisesSlot`; the cast
 * is the caller's because the caller is the only one that knows which key it asked for.
 */
export async function getNinaMemorySlot(
  userId: string,
  key: string,
): Promise<{ value: NinaSlotValue; source: NinaMemorySource; updatedAt: Date } | null> {
  const rows = await db
    .select({
      value: ninaMemorySlots.value,
      source: ninaMemorySlots.source,
      updatedAt: ninaMemorySlots.updatedAt,
    })
    .from(ninaMemorySlots)
    .where(and(eq(ninaMemorySlots.userId, userId), eq(ninaMemorySlots.key, key)))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Upsert on `(user_id, key)` — RU-6's "upserted", made literal. A contradicting later statement
 * REPLACES the slot; the ledger below is what keeps the earlier claim.
 *
 * `updated_at` is set explicitly as well as by `$onUpdate`, because `$onUpdate` fires on the
 * UPDATE path and the INSERT path takes `defaultNow()` — spelling it in `set` means both paths
 * write the same instant and a caller comparing two slots' `updated_at` is comparing like with
 * like.
 */
export async function upsertNinaMemorySlot(userId: string, input: NinaSlotUpsert): Promise<void> {
  const source = input.source ?? 'distilled'
  const sourceMessageId = input.sourceMessageId ?? null

  await db
    .insert(ninaMemorySlots)
    .values({ userId, key: input.key, value: input.value, source, sourceMessageId })
    .onConflictDoUpdate({
      target: [ninaMemorySlots.userId, ninaMemorySlots.key],
      set: { value: input.value, source, sourceMessageId, updatedAt: new Date() },
    })
}

/** Phase 16's editor only. Nothing in the runtime deletes a slot — she corrects, she forgets. */
export async function deleteNinaMemorySlot(userId: string, key: string): Promise<boolean> {
  const deleted = await db
    .delete(ninaMemorySlots)
    .where(and(eq(ninaMemorySlots.userId, userId), eq(ninaMemorySlots.key, key)))
    .returning({ key: ninaMemorySlots.key })
  return deleted.length > 0
}

/**
 * Phase 2's `readMemoryFacts`: the ledger's newest `limit` rows, **newest first**. `created_at
 * DESC, id DESC` because a distillation pass writes several facts in one statement and they share
 * an instant; `id` is a random nanoid, so it is an arbitrary but STABLE tiebreak, which is all
 * that is needed for a prompt to be reproducible.
 */
export async function listNinaMemoryFacts(
  userId: string,
  opts: { limit: number },
): Promise<NinaFactRow[]> {
  return db
    .select({
      id: ninaMemoryFacts.id,
      category: ninaMemoryFacts.category,
      text: ninaMemoryFacts.text,
      confidence: ninaMemoryFacts.confidence,
      source: ninaMemoryFacts.source,
      sourceMessageId: ninaMemoryFacts.sourceMessageId,
      createdAt: ninaMemoryFacts.createdAt,
    })
    .from(ninaMemoryFacts)
    .where(eq(ninaMemoryFacts.userId, userId))
    .orderBy(desc(ninaMemoryFacts.createdAt), desc(ninaMemoryFacts.id))
    .limit(opts.limit)
}

/** Append-only. One multi-row INSERT, no upsert, no dedupe — two identical statements a month */
/** apart are two facts, and collapsing them would throw away the "he keeps saying this" signal. */
export async function appendNinaMemoryFacts(
  userId: string,
  rows: readonly NinaFactInsert[],
): Promise<NinaFactRow[]> {
  if (rows.length === 0) return []

  return db
    .insert(ninaMemoryFacts)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        category: row.category,
        text: row.text,
        confidence: row.confidence ?? 100,
        source: row.source ?? 'distilled',
        sourceMessageId: row.sourceMessageId ?? null,
      })),
    )
    .returning({
      id: ninaMemoryFacts.id,
      category: ninaMemoryFacts.category,
      text: ninaMemoryFacts.text,
      confidence: ninaMemoryFacts.confidence,
      source: ninaMemoryFacts.source,
      sourceMessageId: ninaMemoryFacts.sourceMessageId,
      createdAt: ninaMemoryFacts.createdAt,
    })
}

/**
 * **Phase 16's editor only, and the one exception to "append-only".** A ledger the app never
 * mutates but a human can correct is still an honest ledger; a ledger the DISTILLER can rewrite
 * is not, which is why phase 5 has no path to this function.
 */
export async function updateNinaMemoryFact(
  userId: string,
  id: string,
  patch: { category?: NinaFactCategory; text?: string; confidence?: number },
): Promise<boolean> {
  if (patch.category == null && patch.text == null && patch.confidence == null) return false

  const updated = await db
    .update(ninaMemoryFacts)
    .set({
      ...(patch.category != null ? { category: patch.category } : {}),
      ...(patch.text != null ? { text: patch.text } : {}),
      ...(patch.confidence != null ? { confidence: patch.confidence } : {}),
    })
    .where(and(eq(ninaMemoryFacts.userId, userId), eq(ninaMemoryFacts.id, id)))
    .returning({ id: ninaMemoryFacts.id })
  return updated.length > 0
}

/** Phase 16's editor only. See `updateNinaMemoryFact`. */
export async function deleteNinaMemoryFact(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(ninaMemoryFacts)
    .where(and(eq(ninaMemoryFacts.userId, userId), eq(ninaMemoryFacts.id, id)))
    .returning({ id: ninaMemoryFacts.id })
  return deleted.length > 0
}
```

**Impact:** `insertNinaMessageImages` returning `[]` on an unowned `messageId` is deliberate and
documented — same-outcome-for-absent-and-forbidden, one layer down. Phase 6 must treat `[]` from
a non-empty input as a failure, which is named in Handoffs.

---

### Step 6c: `lib/nina/queries.ts` — nags, turns, avatars

**File:** `lib/nina/queries.ts`, appended

**Change:** The last third. **Correct the §1 import line while you are here** — the final set is
`import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'`. (`lt` was in the
first draft of Step 6a and nothing ends up using it; `gte` is what `countNinaTurnsSince` needs.
`eslint` would have caught it, but catching it here saves a lint round trip.)

**Code:**

```ts
/* ============================================================================
 * §7 Nags — the escalation ledger (RU-9)
 * ==========================================================================*/

/** Phase 2's `readNags`. `[]` when she has never nagged, which is a normal first-week state. */
export async function getNinaNags(userId: string): Promise<NinaNagRow[]> {
  return db
    .select({
      code: ninaNags.code,
      level: ninaNags.level,
      count: ninaNags.count,
      lastMentionedOn: ninaNags.lastMentionedOn,
      updatedAt: ninaNags.updatedAt,
    })
    .from(ninaNags)
    .where(eq(ninaNags.userId, userId))
    .orderBy(asc(ninaNags.code))
}

/**
 * Records that she has now said something about `code`. `level` is supplied by phase 9 — this
 * function does not compute the ladder, because "what rung is he on" is a decision with a decay
 * rule and a threshold table, and neither belongs in a query.
 *
 * `count` is incremented IN SQL (`nina_nags.count + 1`) rather than read-then-written, so two
 * concurrent writers — the cron and an `after()` hook, which is a real pair — cannot lose one.
 */
export async function upsertNinaNag(userId: string, input: NinaNagUpsert): Promise<void> {
  await db
    .insert(ninaNags)
    .values({
      userId,
      code: input.code,
      level: input.level,
      count: 1,
      lastMentionedOn: input.lastMentionedOn,
    })
    .onConflictDoUpdate({
      target: [ninaNags.userId, ninaNags.code],
      set: {
        level: input.level,
        count: sql`${ninaNags.count} + 1`,
        lastMentionedOn: input.lastMentionedOn,
        updatedAt: new Date(),
      },
    })
}

/* ============================================================================
 * §8 Turns — the audit trail
 * ==========================================================================*/

/**
 * One row per model call, success or failure. Returns the id so the caller can stamp it onto the
 * messages the turn emitted — which means the turn row is written FIRST, before the messages, and
 * a turn with no messages is a turn that failed. That asymmetry is the point: a conversation that
 * silently lost a turn is unexplainable, and this is the table that explains it.
 *
 * **A third outcome exists and it is not a failure:** `status: 'pending'` with `args` populated is
 * phase 12's dispatched image job, closed by the callback minutes later in another process
 * (RULINGS C1 and C2). The id this function returns is that job's id — the opaque handle that
 * goes into the `workflow_dispatch` input *instead of the prompt*, because the repo is public.
 */
export async function insertNinaTurn(userId: string, input: NinaTurnInsert): Promise<string> {
  const id = newId()
  await db.insert(ninaTurns).values({
    id,
    userId,
    kind: input.kind,
    trigger: input.trigger ?? null,
    model: input.model,
    promptVersion: input.promptVersion ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    toolCalls: input.toolCalls ?? '',
    latencyMs: input.latencyMs ?? null,
    costMicroUsd: input.costMicroUsd ?? null,
    status: input.status,
    errorCode: input.errorCode ?? null,
    args: input.args ?? null,
  })
  return id
}

/**
 * Phase 12's daily cap, and phase 10's "have I already spoken today". Counts by `kind` since an
 * instant, and counts FAILED turns too — a cap that only counts successes is a cap an unlucky
 * afternoon can spend ten times over.
 */
export async function countNinaTurnsSince(
  userId: string,
  kind: NinaTurnKind,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, kind),
        gte(ninaTurns.createdAt, since),
      ),
    )
  return rows[0]?.n ?? 0
}

/* ============================================================================
 * §9 Avatars — her album (RU-7, R19, R23, R25)
 * ==========================================================================*/

/** Her face right now. Reads the partial unique index, so it is a single-row index lookup. */
export async function getCurrentNinaAvatar(userId: string): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true)))
    .limit(1)
  return rows[0] ?? null
}

/** The album, newest first. Phase 13's grid and phase 15's admin list. */
export async function listNinaAvatars(userId: string): Promise<NinaAvatarRow[]> {
  return db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(eq(ninaAvatars.userId, userId))
    .orderBy(desc(ninaAvatars.createdAt), desc(ninaAvatars.id))
}

/**
 * RU-17's whole mechanism: the current avatar she has NOT mentioned yet. Phase 13 (promise path)
 * and phase 10 (operator path) both poll this, make her comment on it in character, and then call
 * `markNinaAvatarAnnounced`. Two readers, one query, and no flag anyone has to remember to set.
 */
export async function getUnannouncedCurrentNinaAvatar(userId: string): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, true),
        isNull(ninaAvatars.announcedAt),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * **The order of these two statements is load-bearing.** `nina_avatars_user_current_unq` is a
 * partial unique index on `(user_id) where is_current`, so inserting a second current row before
 * un-currenting the first violates it mid-transaction. Un-current, then insert — the same order
 * phase 14's operator script uses, for the same reason, and one `db.batch` so the album is never
 * momentarily faceless.
 *
 * `announced_at` is left NULL: she has not said anything about this face yet, and
 * `getUnannouncedCurrentNinaAvatar` is what notices. The crop triple is left NULL too — no
 * transform, render it centred — because whoever generated or uploaded the image has not framed
 * it yet and phase 15 is where framing happens.
 */
export async function insertNinaAvatarAsCurrent(
  userId: string,
  input: NinaAvatarInsert,
): Promise<NinaAvatarRow> {
  const [, inserted] = await db.batch([
    db
      .update(ninaAvatars)
      .set({ isCurrent: false })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true))),

    db
      .insert(ninaAvatars)
      .values({
        id: newId(),
        userId,
        blobUrl: input.blobUrl,
        pathname: input.pathname,
        width: input.width ?? null,
        height: input.height ?? null,
        bytes: input.bytes ?? null,
        source: input.source,
        description: input.description ?? null,
        isCurrent: true,
      })
      .returning(avatarColumns),
  ])

  const row = inserted[0]
  if (row == null) {
    // Unreachable: an INSERT … RETURNING that ran without throwing produced a row. Thrown rather
    // than `!`-asserted so that if the driver ever changes shape, the failure names itself.
    throw new Error('insertNinaAvatarAsCurrent: INSERT returned no row')
  }
  return row
}

/** She has now said something about this face. Idempotent — a second call is a no-op. */
export async function markNinaAvatarAnnounced(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ announcedAt: now })
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.id, id),
        isNull(ninaAvatars.announcedAt),
      ),
    )
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * R23. `/admin/nina` (phase 15) saves the circular-frame transform it just let the user drag.
 * Passing `{ scale: null, x: null, y: null }` clears it back to plain centred `object-cover`,
 * which is the "reset" button — so this one function is both save and reset and there is no
 * second code path for the second one.
 *
 * No range validation here. The bounds ("scale ≥ 1, offsets inside the frame") are a property of
 * the framing UI and belong to a Zod schema phase 15 owns, next to the widget that produces the
 * numbers — the same division `lib/profile/schema.ts` keeps against `profiles`.
 */
export async function updateNinaAvatarCrop(
  userId: string,
  id: string,
  crop: NinaAvatarCrop,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ cropScale: crop.scale, cropX: crop.x, cropY: crop.y })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/**
 * R25. What the picture DEPICTS, so "itu lagi dimana?" has an answer. Three writers, three
 * origins: phase 12 writes from its own generation prompt, phase 14 and phase 15 write what
 * phase 6's `glm-4.6v` describe pre-pass came back with. Separate from
 * `insertNinaAvatarAsCurrent` because two of those three only learn the description after the
 * row exists — a describe call is a second network round trip, and holding the album faceless
 * while it runs would be the wrong trade.
 */
export async function setNinaAvatarDescription(
  userId: string,
  id: string,
  description: string | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ description })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}
```

**Impact:** `push_subscriptions` gets **no** functions here — phase 11 owns every write against
it, and a read with no writer is a read nobody has designed. That is deliberate and is in
Handoffs.

---

### Step 7: `lib/env.ts` — five credentials and the admin allowlist

**File:** `lib/env.ts:86-89` (after `cronSchema`) and `:131-143` (the accessors and types)

**Change:** Three lazy groups in the shape of `blobEnv()` / `cronEnv()`, holding five
credentials between them, and one derived helper.

**RULING C4 — `lib/env.ts` and `.env.example` have exactly ONE owner, and it is this phase.**
Phase 11 asked to add `VAPID_SUBJECT` itself and phase 12 asked for `GITHUB_DISPATCH_TOKEN`;
both ship here instead. The reason is not tidiness: a file whose whole purpose is to be the
single environment contract cannot have three authors landing in three different commits, because
the failure mode is a deploy that validates four of five variables and discovers the fifth at
Nina's first turn. Phases 11 and 12 consume these **as shipped** and edit neither file.
**Nothing goes into `coreSchema`** — `coreSchema` is parsed at import time and a missing value
there fails the *build*, which is right for `DATABASE_URL` and wrong for a credential only Nina
needs. A deploy that has not got a VAPID key yet must still serve `/` and `/r/[id]`.

**On `OPENROUTER_API_KEY`, and one deliberate widening of RU-2.** The variable is added here, in
`lib/env.ts`, which is under `lib/` and would fail `ci:openrouter-guard` as it stands. My brief
says to exempt `lib/nina/`; the ruling's intent is "Nina may use this key at runtime". So Step 9
exempts **two** paths, `lib/nina/` and the single file `lib/env.ts`, and says so in the guard.

I considered the alternative — a `lib/nina/env.ts` holding this one variable, so `lib/nina/` is
the only exemption — and rejected it. `lib/env.ts` is the app's single environment contract; its
header is where the LLM credential story is documented and where the next person looks. Moving one
variable out of it to satisfy a grep, or assembling the string `'OPENROUTER_' + 'API_KEY'` so the
grep misses it, are both the guard being *evaded* rather than *amended*, which plan invariant 8
forbids in as many words. An exemption written into the guard is reviewable; a clever string is
not.

**Code** — inserted after `cronSchema`:

```ts
/**
 * F33 owns these. Lazily validated, like `blobEnv()` and `cronEnv()`: a deploy without an
 * OpenRouter key must still serve every screen that is not Nina's, so a missing value is an
 * error at her first turn and not at build time.
 *
 * **RU-2 in one variable.** `OPENROUTER_API_KEY` was build-time-only (D12) and read by
 * `tools/gen_badge_art.py` and nothing else. It is now also a RUNTIME credential, for `lib/nina/`
 * ONLY, queued and daily-capped. Badge and record art stay offline-and-committed.
 *
 * `scripts/check-openrouter-boundary.mjs` still greps `app/`, `lib/` and `components/` for this
 * literal and still fails for every one of them except two exempted paths: `lib/nina/`, and this
 * file. `lib/env.ts` is exempted because it is the app's single environment contract and the
 * alternative — hiding the variable in `lib/nina/env.ts`, or assembling its name so the grep
 * misses it — would be evading the guard rather than amending it.
 */
const ninaSchema = z.object({
  OPENROUTER_API_KEY: nonEmpty('OPENROUTER_API_KEY'),
  /**
   * **RU-20's dispatch credential (RULING C4).** A GitHub fine-grained PAT with `actions: write`
   * on this repo, used by `lib/nina/imagedispatch.ts` to fire the image worker's
   * `workflow_dispatch`. Lazily validated with the rest of the group, so a deploy without it
   * serves every screen and fails only at the first image job.
   *
   * **The repo coordinates are deliberately NOT env vars.** `owner`/`repo`/`workflow` are module
   * constants in `lib/nina/imagedispatch.ts`, exactly as phase 12 wrote them, because an
   * environment variable is a thing a deploy can get wrong — and getting these wrong means
   * dispatching a workflow at SOMEBODY ELSE'S repository with this token in the header. A
   * constant in a reviewed file cannot be misconfigured; only rewritten.
   */
  GITHUB_DISPATCH_TOKEN: nonEmpty('GITHUB_DISPATCH_TOKEN'),
})

/**
 * F33 / R3 owns these. Generate a pair with:
 *
 *     npx --yes web-push generate-vapid-keys
 *
 * **The public key is read SERVER-SIDE and passed to the client component as a prop** — there is
 * no `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and there must not be one (plan invariant 10, enforced by
 * `ci:client-secret-guard`). The Next.js PWA guide's recipe uses the `NEXT_PUBLIC_` form; that
 * step is deliberately not followed here.
 */
const pushSchema = z.object({
  VAPID_PUBLIC_KEY: nonEmpty('VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: nonEmpty('VAPID_PRIVATE_KEY'),
  /**
   * **The `mailto:` `web-push` requires (RULING C4).** `webpush.setVapidDetails(subject, pub,
   * priv)` throws unless `subject` is a `mailto:` or `https:` URL — it is the contact address a
   * push service uses to reach the sender when a subscription misbehaves, so it is part of the
   * credential and not part of the code. Env rather than a hardcoded string for the same reason
   * `ADMIN_EMAILS` is env: it is a personal address, it is the one field here that a second
   * deploy would want different, and a literal in `lib/nina/push.ts` would be a code change.
   *
   * Phase 11 asked to add this line itself; it ships here, because this file has one owner.
   */
  VAPID_SUBJECT: nonEmpty('VAPID_SUBJECT'),
})

/**
 * R23 / R24 — who may open `/admin/nina` and `/admin/memory`.
 *
 * ── WHY ENV AND NOT A `users.is_admin` COLUMN ─────────────────────────────────────────────────
 * Considered, and rejected on three grounds. (1) A column needs a bootstrap: the first admin has
 * to be granted by something, and that something is either a migration with an email literal in
 * it — which is this variable with extra steps and a deploy to change — or an admin page you
 * cannot reach until you are an admin. (2) Authorisation that lives in the database is data an
 * SQL bug can grant; authorisation that lives in the environment is data only a deploy can grant,
 * and for a two-page admin surface on a single-user app the environment is the stronger of the
 * two. (3) It matches how `CRON_SECRET` already gates `/api/cron/*` — the app's existing answer
 * to "who is allowed to do the privileged thing" is an environment variable, and a second,
 * different answer is a second thing to reason about.
 *
 * Comma-separated so a second address is a Vercel env edit rather than a code change.
 *
 * **The Google account you sign in with must be one of these**, or the admin pages 404. There is
 * no relationship between this list and `users.email` other than string equality, and if the app
 * is signed in as a different Google address than the one below, the pages are unreachable and
 * the symptom is a 404 rather than an error — which is the correct symptom and a confusing one,
 * so it is written down here.
 */
const adminSchema = z.object({
  ADMIN_EMAILS: nonEmpty('ADMIN_EMAILS'),
})
```

**Code** — inserted after `cronEnv()` at `:135`:

```ts
let ninaCache: z.infer<typeof ninaSchema> | null = null
export function ninaEnv(): z.infer<typeof ninaSchema> {
  ninaCache ??= load('nina', ninaSchema)
  return ninaCache
}

let pushCache: z.infer<typeof pushSchema> | null = null
export function pushEnv(): z.infer<typeof pushSchema> {
  pushCache ??= load('push', pushSchema)
  return pushCache
}

let adminCache: z.infer<typeof adminSchema> | null = null
export function adminEnv(): z.infer<typeof adminSchema> {
  adminCache ??= load('admin', adminSchema)
  return adminCache
}

/**
 * The one piece of logic in this module, and therefore the one piece with a test
 * (`tests/env.admin.test.ts`). Case-insensitive because Google reports `Foo@Gmail.com` and
 * `foo@gmail.com` as the same account and a person typing the variable will not think about it;
 * whitespace-tolerant because `a@b.com, c@d.com` is how anyone writes a list.
 *
 * `null` and `''` are not admins. That matters: `requireUserId()` gives a user id, the email
 * comes from the session, and a session without one must fail closed.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (email == null || email.trim() === '') return false
  const needle = email.trim().toLowerCase()
  return adminEnv()
    .ADMIN_EMAILS.split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .includes(needle)
}
```

**Code** — appended to the type exports at `:140-143`:

```ts
export type NinaEnv = z.infer<typeof ninaSchema>
export type PushEnv = z.infer<typeof pushSchema>
export type AdminEnv = z.infer<typeof adminSchema>
```

**Code** — `.env.example`, replacing the badge-art block at `:44-47` and appending:

```dotenv
# --- OpenRouter (F10 build-time, F33 runtime) -------------------------------
# ONE key, two lifetimes, and RU-2 is the reason:
#   · build time — tools/gen_badge_art.py and tools/extend_badge_art.py. Badge and
#     record art is still generated offline and committed (D12 stands for art).
#   · runtime   — lib/nina/ ONLY, for Nina's image generation (F33 R18), queued
#     and daily-capped. scripts/check-openrouter-boundary.mjs exempts exactly
#     two paths — lib/nina/ and lib/env.ts — and still fails for app/, for
#     components/ and for every other file under lib/.
# Copy the value from /home/miftah/daily-words/.env.local
OPENROUTER_API_KEY=

# --- GitHub Actions dispatch (F33 R18/R22, RU-20) ---------------------------
# A GitHub FINE-GRAINED PAT with `actions: write` on THIS repository, and nothing
# else. lib/nina/imagedispatch.ts uses it to fire the image worker's
# workflow_dispatch; the worker does the generation and stores the PNG, so the
# 45 s Server Action budget never has to contain a 40 s image call.
#
# THE REPO COORDINATES ARE NOT HERE, AND THAT IS DELIBERATE. owner / repo /
# workflow are module CONSTANTS in lib/nina/imagedispatch.ts. An env var is a
# thing a deploy can get wrong, and getting these wrong means firing a
# workflow_dispatch at somebody else's repository with this token in the header.
# A constant in a reviewed file cannot be misconfigured, only rewritten.
GITHUB_DISPATCH_TOKEN=

# --- Web Push (F33 R3) ------------------------------------------------------
# Generate the pair with:  npx --yes web-push generate-vapid-keys
# BOTH KEYS ARE SERVER-ONLY. The public key is read server-side and handed to the
# client component as a PROP — there is no NEXT_PUBLIC_ form of it and there must
# not be one. ci:client-secret-guard enforces that.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
# The contact address web-push demands: setVapidDetails() THROWS unless this is a
# mailto: or https: URL. It is how a push service reaches the sender when a
# subscription misbehaves, so it is part of the credential, not part of the code.
VAPID_SUBJECT=mailto:mahfuzh74@gmail.com

# --- Admin (F33 R23/R24) ----------------------------------------------------
# Who may open /admin/nina and /admin/memory. Comma-separated, case-insensitive.
# THE GOOGLE ACCOUNT YOU SIGN IN WITH MUST APPEAR HERE or those pages 404.
ADMIN_EMAILS=mahfuzh74@gmail.com
```

**Impact:** `lib/env.ts` gains three lazy groups holding five credentials, plus one exported
function; no existing accessor changes, so nothing that imports `env`, `authEnv`, `blobEnv` or
`cronEnv` is touched. Phases 11 and 12 now consume `pushEnv()` and `ninaEnv()` as shipped and edit
neither this file nor `.env.example` (RULING C4).
`ci:client-secret-guard` still passes because no name here is `NEXT_PUBLIC_`-prefixed, and
`ci:openrouter-guard` passes because Step 9 exempts this file by name.

---

### Step 8: RU-1 — the weight repeal, and every doc edit in the set, in seven files

**RU-1 verbatim:** *D15/R-28 is repealed app-wide. Body weight enters every LLM payload, public
share pages included. The guard's weight rule is deleted and its header rewritten to record the
repeal.*

Invariant 8 governs how: **a repeal is a rewrite, not a deletion.** The guard keeps its
explanatory header and gains a sentence naming the ruling. The prose in `lib/llm/facts.ts` that
explained the rule is not deleted either — it is rewritten to record that the rule was repealed
and by whom, so a reader who wonders why weight is in a prompt finds the answer in the file
rather than in git.

**The step grew from five files to seven, and both additions are rulings rather than scope
creep.** RULING C5 carries the repeal all the way into `ProfileFacts` and therefore into the three
prompts that currently forbid the subject (8d). RULING D2 makes this phase the only writer of
every roadmap, reconciliation and `docs/plans/` file in the set, which folds what used to be two
loose sub-steps into one complete roadmap pass (8e) and adds the F33 pointer stub (8g).

#### 8a — `scripts/check-llm-payload-boundary.mjs`

**File:** `scripts/check-llm-payload-boundary.mjs:1-83` — the header, rule 1 (deleted), rule 2
(generalised), and the success line.

**Change:** Rule 1 goes; rule 2 becomes a `GUARDED_CALLS` table so that a guarded entry point is
data. This also satisfies phase 4's fourth requirement.

**RULING D1 — this file has exactly ONE owner and the table below is FINAL.** The name is
`GUARDED_CALLS`; phase 3's `SANCTIONED` / `BLOCKING_CALLS` and phase 5's `BLOCKING_CALLS` are
wrong and are renamed in their own plans. All four symbols ship here, in one commit — including
`distillNinaMemory` (phase 5) and `describeNinaImage` (phase 6), which do not exist yet. **The
file is removed from the Files tables of phases 3, 5 and 6**, each of which now carries one line
instead: *"phase 1 ships the complete `GUARDED_CALLS` table including this symbol; nothing to add
here."* The reason is not ownership hygiene: three phases appending to one guard is three merge
conflicts on a fifteen-line array, and — worse — a window in each of them where the newly added
expensive call is unguarded exactly while it is new and most likely to be called from the wrong
place.

**Code** — the whole file, replaced:

```js
// F07's grep-able invariant, with a real exit code. There used to be two.
//
// ── RULE 1 IS REPEALED. IT IS NOT DISABLED, IT IS GONE, AND HERE IS WHY ───────────────────────
// This file used to open by asserting that BODY WEIGHT NEVER REACHES A MODEL (D15 / R-28): it
// grepped `lib/llm/` and `lib/insights/` for `weightKg` and failed the build on a hit, because a
// type only protects the path that goes through the type and a future `{ ...profile }` in a fact
// builder would have compiled, shipped, and put a weight in a coaching prompt.
//
// **NINA_CHATBOT_PLAN.md RU-1 repeals D15/R-28 app-wide** — F33 gives the runner a chatbot that
// is a nutritionist and a physiologist as well as a friend, and a physiologist who may not know
// what you weigh cannot answer the questions being asked of her. The user's reason, verbatim:
// "i am the only one that uses this app. so i dont care about any privacy whatsoever. this is my
// personal toy." The repeal is recorded in RECONCILIATION_v0.1.0.md R-28 and in
// ROADMAP_v0.1.0.md §2 (D15) and §6.
//
// So `lib/llm/facts.ts`'s `NarrativeProfile` now carries `weightKg` and `sex`, `lib/nina/`
// carries both into every turn, and there is no grep left to keep. Restoring the rule means
// restoring the ruling first: this comment is here so that nobody re-adds the check without
// finding out that a decision was taken, and nobody deletes the weight from a payload thinking
// they are fixing a leak.
//
// ── RULE 2 STANDS, AND NOW COVERS FOUR ENTRY POINTS. THIS TABLE IS COMPLETE ──────────────────
// A MODEL CALL IS NEVER AWAITED FROM A PAGE RENDER (plan §7.2, and F33 plan invariant 4).
//
// All four entries ship in ONE commit, from the phase that owns this file, and NO OTHER PHASE
// EDITS IT. Three of the four symbols do not exist yet — phases 3, 5 and 6 create them — and the
// table is written for them anyway, because the alternative was three phases each appending to
// one guard: three merge conflicts, and a window in each of them where the new expensive call
// was unguarded precisely while it was new.
//   · `getOrCreateInsight` — a cache miss is a 10-35 s call. The run detail page's numbers are
//     stored and already correct, so blocking the render on prose trades a complete screen for a
//     blank one. A `page.tsx` that awaits it looks fine in dev against a warm cache and hangs in
//     production the first time a runner opens a new run.
//   · `runNinaTurn` — Nina's turn entry point. Fifteen measured `glm-5.3` calls took 10.2-16.4 s,
//     and a turn may make tool round trips on top of that. `app/nina/page.tsx` server-renders
//     STORED messages and awaits no model; the turn is fired from a client event handler, the
//     same shape as `components/insights/InsightTrigger.tsx` firing `ensureRunInsight`.
//   · `distillNinaMemory` — a SECOND model call on top of the turn that triggered it, so a turn
//     that awaited it would double its own latency for a write the runner never sees. It runs
//     from `lib/nina/actions.ts` inside `after()`.
//   · `describeNinaImage` — a `glm-4.6v` describe pass, 5-15 s. `components/nina/Composer.tsx`
//     fires it on pick, from a client event handler, so the description is already in hand by
//     the time he hits send. A render that awaited it would block the chat on a thumbnail.
//
// Fix the code, never silence the check.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const failures = []

/** Same approximate comment-stripper as the F08 guard, for the same reason: prose may say the name. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(path)) out.push(path)
  }
  return out
}

/* ── the non-blocking boundary ─────────────────────────────────────────────────────────────── */

/**
 * One entry per guarded symbol. A table rather than two copies of one loop: the next expensive
 * entry point is four lines here, and a second copy of a boundary grep is a second thing to keep
 * in step — which is the argument `check-openrouter-boundary.mjs` makes about itself.
 */
const GUARDED_CALLS = [
  {
    symbol: 'getOrCreateInsight',
    sanctioned: [
      join('lib', 'insights', 'actions.ts'),
      join('lib', 'llm', 'narrate.ts'),
      join('app', 'api', 'cron', 'rollup', 'route.ts'),
    ],
    advice:
      'On a cache miss that is a 10-35 s model call — see docs/plans/F07-insights.md §7.2. ' +
      'Call it from lib/insights/actions.ts (a Server Action, fired from a client effect) or ' +
      'from the cron route, never from a render path.',
  },
  {
    symbol: 'runNinaTurn',
    sanctioned: [
      // Its own module, because a guard that fails on the definition site is a guard that
      // forces the definition to be renamed. `lib/db/queries.ts` is greppable the same way.
      join('lib', 'nina', 'turn.ts'),
      join('lib', 'nina', 'actions.ts'),
      join('lib', 'nina', 'proactive.ts'),
      join('app', 'api', 'cron', 'nina', 'route.ts'),
    ],
    advice:
      'A Nina turn is a 10-16 s model call plus tool round trips (F33 plan invariant 4). Call ' +
      'it from lib/nina/actions.ts (a Server Action, fired from the composer), from ' +
      'lib/nina/proactive.ts inside after(), or from the cron route. app/nina/page.tsx renders ' +
      'stored messages and awaits no model.',
  },
  {
    symbol: 'distillNinaMemory',
    sanctioned: [join('lib', 'nina', 'distill.ts'), join('lib', 'nina', 'actions.ts')],
    advice:
      'Distillation is a second model call on top of the turn that triggered it (F33 phase 5). ' +
      'It runs from lib/nina/actions.ts inside after(), never on a render path and never ' +
      'awaited before the reply is returned to the composer.',
  },
  {
    symbol: 'describeNinaImage',
    sanctioned: [join('lib', 'nina', 'actions.ts'), join('components', 'nina', 'Composer.tsx')],
    advice:
      'A glm-4.6v describe pass is a 5-15 s vision call (F33 phase 6). The composer fires it ' +
      'from a client event handler on pick, so the description is already in hand when he hits ' +
      'send; no page render may await it.',
  },
]

for (const path of [...walk('app'), ...walk('lib'), ...walk('components')]) {
  if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
  const source = stripComments(readFileSync(path, 'utf8'))
  for (const guard of GUARDED_CALLS) {
    if (guard.sanctioned.includes(path)) continue
    if (new RegExp(`\\b${guard.symbol}\\s*\\(`).test(source)) {
      failures.push(`${path} calls ${guard.symbol}. ${guard.advice}`)
    }
  }
}

/* ── report ───────────────────────────────────────────────────────────────────────────────── */

if (failures.length > 0) {
  console.error('F07/F33 payload boundary guard FAILED:\n')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  console.error('')
  process.exit(1)
}

console.log(
  `F07/F33 payload boundary guard passed: all ${GUARDED_CALLS.length} guarded symbols ` +
    `(${GUARDED_CALLS.map((g) => g.symbol).join(', ')}) are confined to their sanctioned ` +
    'non-blocking callers. ' +
    '(The D15/R-28 body-weight rule is repealed — see this file\'s header, RU-1.)',
)
```

**Two things to check after this edit, both cheap and both real:**

1. **Every sanctioned path except `lib/nina/actions.ts`'s three siblings is a file that does not
   exist yet — ten of the eleven, in fact.** That is fine and it is why the table ships whole:
   `sanctioned` is a list of strings compared against walked paths, so a path that never appears
   is never consulted, and a symbol with no call sites is a grep that finds nothing. The guard
   passes today, with zero `runNinaTurn`, `distillNinaMemory` and `describeNinaImage` call sites,
   and starts biting the moment phases 3, 5 and 6 land — which is the whole point of shipping the
   final table in the phase that owns the file rather than letting three phases append to it.
2. The loop no longer walks `lib/insights` separately, and `walk('lib')` already covered it. No
   directory loses coverage.

#### 8b — `lib/llm/facts.ts`

**File:** `lib/llm/facts.ts:17-23` (the bullet), `:49-56` (`NarrativeProfile`), `:58-68`
(`ProfileFacts`) and `:237-246` (`profileFacts`)

**Change:** Rewrite the bullet as a record of the repeal — RU-1's own instruction — and widen
**both** types.

**RULING C5 inverts what this plan originally proposed here, and the reasoning is the user's own.**
The first draft of this step widened only `NarrativeProfile`, the *input* type, and left
`ProfileFacts` — the type that actually becomes the payload — alone, on the grounds that no cached
insight would then be invalidated. The reconciler overruled it, correctly. D15 was repealed
because *"exposing user details like weight to ai analysis will 100% make the analysis much more
accurate"*; an insight that cannot see weight or sex is **the half of that repeal that does
nothing**. Carrying the fields to the doorstep of the payload and dropping them there would have
left Nina able to reason about the runner's mass while F07, reading the same runs, could not — two
coaches in one app with different eyesight, and no way for the runner to tell which is which.

**The accepted cost, named up front:** `ProfileFacts` is inside the hashed object, so **`factsHash`
moves for every scope and every cached insight regenerates on next view.** That is one model call
per run the user actually opens, arriving spread over however long it takes him to open them —
against a user who said in as many words not to stint on tokens. Nothing is purged, nothing is
migrated, nothing is backfilled: `insights` is unique on
`(user_id, scope, scope_key, facts_hash)`, so the old rows are simply never hit again and can be
left where they are as a record of what the old prompt said.

*Revisit if* the regeneration cost ever matters. The escape is not to narrow the type again — it is
to seed `weightKg` and `sex` only for runs newer than a cutoff date, which keeps every older hash
byte-identical and costs one comparison in `narrativeProfileOf`.

**Code** — replacing the `weightKg` bullet at `:19-23`:

```ts
 *  · **`weightKg` — WAS FORBIDDEN, NOW CARRIED. D15/R-28 IS REPEALED (RU-1, F33).** This bullet
 *    used to read: "`research/narrate.mjs`'s `profile` object carried it; this feature drops it,
 *    and `NarrativeProfile` below is a two-field type rather than F03's `Profile` so that passing
 *    it is a compile error rather than a code-review catch." That was true and is now history.
 *    F33 gives the runner a chatbot who is a nutritionist and a physiologist, and the questions
 *    she is there to answer cannot be answered without a body mass. The user's reason, verbatim:
 *    "i am the only one that uses this app. so i dont care about any privacy whatsoever."
 *    `scripts/check-llm-payload-boundary.mjs` no longer greps for the name; its header records
 *    why. **The type below is now a FOUR-field type, and it is still not F03's `Profile`** — a
 *    spread of the row would still pull in `restingHr`, `maxHr`, `onboardedAt` and `updatedAt`,
 *    none of which a narrator has any use for, and `hrMax` already arrives resolved and labelled.
 *
 *  · **`runs.note`** — a runner's own words can contain numbers ("did 15k today") that disagree
```

**Code** — replacing `:49-56`:

```ts
/**
 * The profile, minus everything a narrator has no use for. Four fields, all self-reported, all
 * labelled as such in every prompt (§1.2) — they come from a form, not a sensor.
 *
 * Still deliberately NOT F03's `Profile`: a spread of the row would carry `restingHr`, `maxHr`,
 * `onboardedAt` and `updatedAt` into a payload, and `hrMax` already arrives separately, resolved
 * and labelled `measured` or `estimated`. Naming the fields is what keeps that true.
 *
 * `weightKg` and `sex` are here under RU-1 — see the header's first bullet for the repeal.
 * BOTH ARE REQUIRED, not optional: an optional field is one a new call site can forget, and the
 * whole point of this type is that a caller has to decide about every field it carries.
 */
export interface NarrativeProfile {
  birthYear: number | null
  heightCm: number | null
  weightKg: number | null
  sex: Sex | null
}
```

**Code** — `ProfileFacts` at `:58-68`, the OUTPUT type, widened under RULING C5. This is the edit
that moves `facts_hash`:

```ts
/**
 * What actually reaches the model, and therefore what `factsHash` hashes.
 *
 * **`weightKg` and `sex` are here under RULING C5, and this is the field pair that moved every
 * cache key in the database.** D15/R-28 is repealed (RU-1) *because* the analysis is better with
 * them — "exposing user details like weight to ai analysis will 100% make the analysis much more
 * accurate" — and a payload that stops at height delivers none of that. `age` is still DERIVED
 * from `birthYear` rather than carried, for the reason it always was: a birth year in a payload is
 * a birth year in a cache key that changes meaning every January.
 *
 * Both are `| null` and both are REQUIRED KEYS: `profileFacts()` emits them on every call, so a
 * runner who has never filled in the form hashes as `{ weightKg: null, sex: null }` rather than as
 * an object missing two keys. That matters more here than anywhere else in the file — an *absent*
 * key and a `null` key canonicalise differently, so an optional field would mean two hashes for
 * one runner.
 */
export interface ProfileFacts {
  age: number | null
  heightCm: number | null
  /** Self-reported, and every prompt says so. RULING C5. */
  weightKg: number | null
  /** Self-reported, four-member domain (`lib/db/schema.ts`'s `Sex`). RULING C5. */
  sex: Sex | null
  /**
   * Carries its `source` into the prompt, and every prompt has a rule about it: an `estimated`
   * HRmax is a Tanaka formula and must be called a formula whenever a percentage leans on it.
   * IMPLEMENTATION_PLAN §4.1 measured the estimate wrong by 2 bpm on the very first run analysed;
   * presenting a formula as a measurement is the most likely way this app gives bad advice.
   */
  hrMax: { bpm: number; source: HrMaxSource } | null
}
```

**Code** — `profileFacts()` at `:237-246`, the one builder all three scopes share, so this single
edit widens the session, week and month payloads at once:

```ts
function profileFacts(
  profile: NarrativeProfile | null,
  hrMax: HrMax | null,
  now: Date,
): ProfileFacts {
  return {
    age: profile?.birthYear == null ? null : ageFromBirthYear(profile.birthYear, now),
    heightCm: profile?.heightCm ?? null,
    // RULING C5. `?? null` rather than `?.` alone, so the key is always present and a runner with
    // no profile hashes as two explicit nulls instead of two absent keys.
    weightKg: profile?.weightKg ?? null,
    sex: profile?.sex ?? null,
    hrMax: hrMax == null ? null : { bpm: hrMax.bpm, source: hrMax.source },
  }
}
```

`buildSessionFacts`, `buildWeekFacts` and `buildMonthFacts` all call `profileFacts` and need no
edit of their own — which is exactly why the builder exists.

and add `Sex` to the existing type import at `:2`:

```ts
import type { RunIntent, Sex } from '@/lib/db/schema'
```

#### 8c — `lib/insights/load.ts`

**File:** `lib/insights/load.ts:179-188` — `narrativeProfileOf`, the type's one constructor.

**Code:**

```ts
function narrativeProfileOf(
  profile: {
    birthYear: number | null
    heightCm: number | null
    weightKg: number | null
    sex: Sex | null
  } | null,
): NarrativeProfile | null {
  // Still field-by-field, never a spread of the row — see `NarrativeProfile`'s own note. What
  // changed under RU-1 is WHICH fields, not whether they are enumerated: `weightKg` and `sex` are
  // now carried, `restingHr` / `maxHr` / `onboardedAt` / `updatedAt` still are not, and the
  // enumeration is what keeps that a decision rather than an accident.
  return profile == null
    ? null
    : {
        birthYear: profile.birthYear,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        sex: profile.sex,
      }
}
```

Add `Sex` to this file's `@/lib/db/schema` type import. Its callers pass a `Profile` row, which
already has both new fields after Step 1, so no call site changes.

#### 8d — `lib/llm/prompts/narrate.ts` — the three prompts widen (RULING C5)

**File:** `lib/llm/prompts/narrate.ts:16` (the module docstring's first numbered claim), `:41-43`
(the three versions), `:53` (session), `:102` (week), `:141` (month).

**Change:** `ProfileFacts` now carries weight and sex, and three prompts currently *forbid* the
model from using them. A payload that contains a field the prompt forbids is worse than either
alternative: the model sees the number, is told not to mention it, and the tokens are spent on a
rule instead of on advice. So the prohibition inverts into an instruction about honesty.

**The version bumps are not optional and they are the reason this sub-step exists at all.**
`facts_hash` hashes the numbers plus `promptVersion` (see this file's own header: *"Edit a prompt
and the numbers do not move, so the hash does not move, so the stale insight serves forever"*).
Here the numbers move too, so the cache misses either way — but the bump must still land, because
the next prompt edit will not have a field widening to hide behind. Bump BY HAND, in this commit:
`SESSION_PROMPT_VERSION` **2 → 3**, `WEEK_PROMPT_VERSION` **1 → 2**, `MONTH_PROMPT_VERSION`
**1 → 2**.

**Code** — the module docstring's claim 1 at `:16-17`, which becomes false:

```ts
 *   1. ~~the weight exclusion (D15 / R-28)~~ — **REPEALED (RU-1, and RULING C5 carried it all the
 *      way into the payload).** The research script's `profile` carried `weightKg`; F07 dropped
 *      it; F33 puts it back, and `sex` beside it, because the repeal's whole point was that
 *      "exposing user details like weight to ai analysis will 100% make the analysis much more
 *      accurate". The three prompts below therefore no longer forbid the subject — they set the
 *      rules for using it. This bullet is kept rather than deleted so that the one prompt in this
 *      repo with a measured output attached still explains every way it diverges from the
 *      measurement.
```

**Code** — the session prompt's HARD RULES, at `:51-54`. The self-report rule widens and the
prohibition is replaced, in place, so the block keeps its shape:

```
- The runner's age, height, weight and sex are self-reported; an "estimated" HRmax is a
  formula, not a measurement. Say so when it matters. An "observed" HRmax is a real watch
  reading and may be stated plainly.
- Body weight and sex ARE in your data and you may use them: for load, for pace-at-effort,
  for fuelling and hydration, for anything the physiology genuinely depends on. Two limits.
  Use the number only when it changes the advice — do not restate it as colour. And never
  comment on the body itself: no target weight, no "you would be faster if", no judgement of
  the runner's size or shape. You are reading a workout, not a body.
```

**Code** — the week prompt at `:100-101` and the month prompt at `:139-140` carry the SAME two
lines as each other (`- Self-reported profile fields and estimated HRmax must be labelled as
such.` followed by `- Never mention or imply anything about body weight.`). **Both occurrences
must be edited — a `sed` on the first hit leaves the month prompt contradicting the payload**,
which is the single most likely way this step lands half-done:

```
- Self-reported profile fields — age, height, weight, sex — and estimated HRmax must be
  labelled as such.
- Weight and sex are available and may be used where the physiology depends on them. Never
  comment on the body itself, and never set a weight target.
```

**Impact:** three prompt strings, three version constants. No type changes here, so `typecheck`
is unaffected by this sub-step alone; `tests/llm.narrate.test.ts` asserts behaviour rather than
prompt text and passes unchanged.

#### 8e — `ROADMAP_v0.1.0.md` — every doc edit in this plan set, in one file, once

**RULING D2 — `ROADMAP_v0.1.0.md`, `RECONCILIATION_v0.1.0.md` and the F33 doc pointer have exactly
ONE owner, and it is this phase.** That includes §4.8's tab sentence, which this plan originally
recommended handing to phase 4. **That recommendation is overruled and phase 4 is right to leave
§4.8 alone:** phase 1 already edits this very file in six other places, and a second writer on
the same document is a merge conflict bought for nothing — the sentence is one word long and does
not need to be in the same commit as `grid-cols-5` to be correct. Phase 4 records the ruling and
changes no document.

Seven edits, and the list is exhaustive:

- **§2, D15's row (`:72`)** — replace with:
  `| D15 | ~~No weight-based coaching claims, ever~~ — **REPEALED for v0.2.0 by F33/RU-1.** Body weight enters every LLM payload, public share pages included. See RECONCILIATION_v0.1.0.md R-28 | Was: "this is a running app, not a weight app". Now: the app has a physiologist in it, and one who may not know your mass cannot do the job |`
- **§4.2's Weight row (`:151`)** — append one clause to the "Rendered as" cell:
  `| Weight | `numeric(4,1)` kg | `55.0 kg` — and, since F33/RU-1, a value that reaches LLM payloads |`
- **§6 (`:519-521`)** — three strikes in one list. Remove `push notifications ·` (**RU-3**, they
  ship in phase 11); replace `weight tracking or any weight-based advice (D15) ·` with
  `weight *tracking* as a feature (the column is collected, not charted — but weight-based advice is no longer a non-goal: F33/RU-1) ·`; and replace `runtime badge-image generation (D12)` with
  `runtime **badge** image generation (D12 — narrowed by F33/RU-2: badge and record art stay offline-and-committed, while `lib/nina/` generates at runtime)`.

The resulting §6 paragraph, in full, so there is nothing to guess:

```markdown
## 6. Non-goals for v0.1.0

Apple Health / HealthKit import · GPX or route maps · manual run entry as a primary flow (the
schema allows `source='manual'`; no UI ships) · training-plan generation · social features,
following, comparison against other runners · streak pressure mechanics · weight *tracking* as a
feature (the column is collected, not charted — weight-based **advice** is no longer a non-goal:
F33/RU-1 repealed D15) · a settings page beyond `/me` · non-running activity types · runtime
**badge** image generation (D12, narrowed by F33/RU-2 — badge and record art stay
offline-and-committed; `lib/nina/` generates at runtime, queued and daily-capped).

> **Two of these shipped in v0.2.0 and are struck rather than deleted, so the change is
> auditable.** ~~push notifications~~ — F33/RU-3, real Web Push plus an unread badge, phase 11.
> ~~weight-based advice~~ — F33/RU-1, above.
```

- **§4.1's env block (`:104-135`)** — the `OPENROUTER_API_KEY` comment currently reads *"Build-time
  ONLY. Read by tools/gen_badge_art.py and by NOTHING in app/ or lib/. `grep -rE
  'OPENROUTER_API_KEY' app/ lib/ components/` must stay empty, asserted in CI."* That grep is no
  longer empty and no longer must be. Replace the block's tail with all six F33 variables — the
  same set `.env.example` documents in Step 7, because RULING C4 gives this phase both files and
  two environment lists that disagree is worse than one that is merely long:

  ```bash
  # Build-time AND runtime, since F33/RU-2. Read by tools/gen_badge_art.py and
  # tools/extend_badge_art.py offline, and by lib/nina/ at runtime (queued, daily-capped).
  # `grep -rE 'OPENROUTER_API_KEY' app/ lib/ components/` must match ONLY lib/nina/ and
  # lib/env.ts, asserted in CI by scripts/check-openrouter-boundary.mjs.
  OPENROUTER_API_KEY=

  # F33/RU-20 — a fine-grained GitHub PAT with `actions: write` on THIS repo, used to fire
  # the image worker's workflow_dispatch. The repo coordinates are NOT env: they are module
  # constants in lib/nina/imagedispatch.ts, so no deploy can dispatch at another repository.
  GITHUB_DISPATCH_TOKEN=

  # F33 — Web Push (R3). All three server-only; the public key reaches the client as a PROP.
  # VAPID_SUBJECT is the mailto: that web-push's setVapidDetails() throws without.
  VAPID_PUBLIC_KEY=
  VAPID_PRIVATE_KEY=
  VAPID_SUBJECT=mailto:mahfuzh74@gmail.com

  # F33 — who may open /admin/nina and /admin/memory (R23/R24). Comma-separated.
  ADMIN_EMAILS=mahfuzh74@gmail.com
  ```

- **§2's D7 row (`:64`) — and this is a CORRECTION to what this plan originally filed.** The
  original bullet said phase 12 adds `/api/nina/image/route.ts` and D7 must gain it. That is no
  longer true and the correction is *smaller* than the filing, in three ways worth stating so
  nobody re-adds the wrong entry:

  1. D7's four existing entries are `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]` and
     **`/api/cron/*`** — a glob. **`/api/cron/nina` is therefore ALREADY covered** and needs no
     entry at all. Adding one would imply the glob does not mean what it says.
  2. **Phase 12 creates no route handler any more.** RU-20 moved generation into a GitHub Actions
     worker fired by `workflow_dispatch`, so there is no `/api/nina/image` to sanction.
  3. The one genuinely new handler in this whole plan set is **phase 15's
     `/api/admin/nina/upload`**, and it needs its own clause because it is not `/api/upload` with
     a different caller: its auth rule (`ADMIN_EMAILS`, not just a session), its size cap, its
     accepted content types and its pathname regex all differ, and folding it into `/api/upload`
     would mean one handler with two auth rules chosen by a parameter.

  Replace with:

  `| D7 | **Server Actions** for every mutation. Route Handlers only for `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]`, `/api/cron/*` and — since F33 — `/api/admin/nina/upload` (an ADMIN-GATED Blob handshake: separate from `/api/upload` because its auth rule, size cap, content types and pathname regex all differ) | Fewest files |`

- **§4.8's route list (`:434-451`)** — the list claims to be the app's whole surface, so it gains
  every route this plan set adds. Append inside the code fence, after `/s/[token]`:

  ```
  /nina                 Nina — the chat (F33, the fifth tab)
  /nina/about           her detail page: avatar full-screen, every image in the chat
  /admin                DESKTOP, ADMIN_EMAILS only — the admin index
  /admin/nina           DESKTOP, ADMIN_EMAILS only — avatar upload and circular-frame crop
  /admin/memory         DESKTOP, ADMIN_EMAILS only — hand-edit her memory slots and ledger
  ```

  and after `/api/cron/rollup`:

  ```
  /api/cron/nina        Nina's proactivity sweep     (guarded by CRON_SECRET)
  /api/admin/nina/upload  admin-gated Blob handshake (guarded by ADMIN_EMAILS)
  ```

  There is deliberately **no `/api/nina/image` line**: RU-20 replaced it with a GitHub Actions
  `workflow_dispatch`, so the route never exists.

- **§4.8's navigation sentence and tab table (`:453` and the table under it)** — **"Navigation is a
  four-tab bottom bar"** becomes **five-tab**, and the table gains a **Nina** row between Runs and
  Upload. This phase makes the edit (RULING D2 overrules its own earlier hand-off to phase 4).
  Use the sentence phase 4 supplied, because it turns an existing claim from aspiration into
  arithmetic: *the FAB sat at 37.5% of the bar's width in a four-column grid and sits at 50% in a
  five-column one, so §4.8's own "centre" claim is newly TRUE rather than newly written.*

- **§5's feature table is NOT extended, and that is a decision rather than an omission.** It is
  headed *"Eleven"*, it is scoped to v0.1.0, and **F12–F32 — twenty-one shipped features — are all
  absent from it.** Adding only F33 would make the table wrong in a *new* way: a reader would
  conclude the app has twelve features and that F12–F32 do not exist. Add one line under §5
  instead:

  ```markdown
  > Features after F11 are tracked in `docs/plans/` and `CHANGELOG.md`, not here. This table is
  > v0.1.0's scope and is left as the record of it.
  ```

#### 8f — `RECONCILIATION_v0.1.0.md`

**File:** `:343-349` (R-28's block) and `:355` (the D15 amendment row).

**Change:** R-28 is not deleted — the reconciliation document is a record of decisions, and a
decision that was later reversed is still a decision that was taken. It gains a **Repealed**
block, in the voice of the surrounding entries:

```markdown
### R-28 · Weight never reaches the narrative model.

F07 dropped `weightKg` from the payload that `research/narrate.mjs` included. D15 said no
weight-based coaching claims; F07 made that structural instead of instructional — the model
cannot comment on what it never receives. **D15 is amended to say so.**

> **REPEALED, 2026-09-03, by NINA_CHATBOT_PLAN.md RU-1.** F33 puts a nutritionist and a
> physiologist in the app, and the questions she exists to answer cannot be answered without a
> body mass. `lib/llm/facts.ts`'s `NarrativeProfile` now carries `weightKg` and `sex`;
> `scripts/check-llm-payload-boundary.mjs`'s weight rule is deleted and its header records why;
> `profiles.weight_kg`'s schema comment records it too. The user's reason, verbatim: *"i am the
> only one that uses this app. so i dont care about any privacy whatsoever. this is my personal
> toy. just let me do whatever i want with it"*. **The rest of R-28's neighbourhood stands** —
> R-1, R-5, R-7, R-8, R-9, R-11, R-12 and R-22 are untouched, and R-22's non-cascade
> `badges.run_id` and plain `dedupe_key` in particular are not to be reopened.
```

and the D15 row at `:355`:

```markdown
| **D15** | ~~now reads: *No weight-based coaching claims, ever — enforced structurally: `weight_kg` is never included in any LLM payload.*~~ (R-28) — **REPEALED by F33/RU-1; see R-28's Repealed block.** |
```

**Impact of Step 8 as a whole:** `npm run ci:llm-payload-guard` passes with one rule instead of
two, and rule 2 now ships the complete four-symbol `GUARDED_CALLS` table (RULING D1).
**`npm test` does NOT pass unchanged** — RULING C5 widened `ProfileFacts`, so the payload moved,
`facts_hash` moved, and four assertions in `tests/llm.facts.test.ts` invert. Step 13 enumerates
every one of them; there is no "and a few others" in that list. `npm run typecheck` requires 8b,
8c **and 8d** to land in the same commit, because widening a required field on `NarrativeProfile`
without widening its constructor is a type error, and shipping a payload the prompt forbids is a
correctness error the compiler cannot see; that is the intended coupling and the reason they are
one step.

**And it is worth saying once, plainly:** the visible consequence of this step is that **every
cached insight in the database regenerates the next time its run is opened.** That is deliberate,
it is accepted (see 8b), and it is not a bug report waiting to be filed.

#### 8g — `docs/plans/F33-nina.md`, a pointer and nothing more (RULING D2 item 5)

**File:** `docs/plans/F33-nina.md` (new).

**Change:** F07's own doc (`docs/plans/F07-insights.md`) is cited by name from two guards and one
prompt, which is the precedent: `docs/plans/` is where a feature's decisions are findable by a
reader who has only a filename from a comment. F33 has no such file, and `§5`'s feature table is
deliberately not being extended (above), so without this the sixteen phase plans are reachable
only by knowing that `.workflows/plan/nina-chatbot/` exists.

**It is a POINTER, not a retrospective.** The full write-up is a follow-up card, exactly as phase
8 proposed — sixteen phases appending their own section to one document is sixteen merge conflicts
on one file, and a retrospective written before the feature ships is a plan with a different name.

```markdown
# F33 — Nina

A chatbot who lives in the app, remembers the runner, and comments on his training without being
asked. Sixteen phases, `v0.2.0`.

**The plan set lives in `.workflows/plan/nina-chatbot/`.** Start with `NINA_CHATBOT_PLAN.md` — the
index: the requirements table (R1–R26), the phase table, the dependency edges and the invariants
every phase is held to. Then `phase-<n>.md` for the phase you care about.

| # | Phase |
|---|---|
| 1 | schema, env, and the three repeals |
| 2 | the prompt layer and the context builder |
| 3 | the turn loop, the tools, the Server Action |
| 4 | `/nina` — the chat screen and the fifth tab |
| 5 | memory: distillation, slots, the ledger |
| 6 | images he sends her |
| 7 | quoting a message (R12) |
| 8 | attaching a run (R13) |
| 9 | patterns and the nag ladder |
| 10 | proactivity — she speaks first |
| 11 | Web Push and the unread badge |
| 12 | images she makes (RU-20: dispatched to GitHub Actions) |
| 13 | her album, her detail page, and the promise machine |
| 14 | the operator script — re-anchoring her face |
| 15 | `/admin/nina` — avatar upload and the circular crop |
| 16 | `/admin/memory` — hand-editing what she knows |

**The reconciler's rulings** — the cross-phase decisions that override anything an individual
phase plan says — are the rulings table in `NINA_CHATBOT_PLAN.md`. Three of them repeal earlier
project invariants and are recorded where those invariants live: RU-1 (body weight reaches every
LLM payload) in `RECONCILIATION_v0.1.0.md` R-28 and `ROADMAP_v0.1.0.md` §2/§6; RU-2 (runtime
OpenRouter generation, `lib/nina/` only) in `ROADMAP_v0.1.0.md` §2/§4.1/§6; RU-3 (push
notifications ship) in `ROADMAP_v0.1.0.md` §6.
```

**Impact:** documentation only. No code, no test, no guard reads it — but `docs/plans/` is where
the next person looks, which is the whole point.

---

### Step 9: RU-2 — `lib/nina/` (and `lib/env.ts`) out of the OpenRouter boundary

**RU-2 verbatim:** *D12 is repealed for `lib/nina/` only. Runtime OpenRouter image generation,
queued and daily-capped. Badge and record art stay offline-and-committed.*

**File:** `scripts/check-openrouter-boundary.mjs:1-40` — the whole file.

**Change:** The grep still runs over all three directories; its output is now filtered by an
exported, named list of exempt paths. `BOUNDARY_DIRS` **stays exported** because
`scripts/check-badge-art.mjs:43` imports it (verified) and uses it at `:154` to build a section
heading — that file is not edited here and passes unchanged.

**Why filter in JavaScript rather than pass `--exclude-dir=nina` to grep:** `--exclude-dir`
matches a directory *name* anywhere in the tree, so it would silently exempt `app/nina/` and
`components/nina/` too — and those must keep failing. A path-prefix filter says exactly what it
means.

**Code** — the whole file, replaced:

```js
// OPENROUTER_API_KEY's boundary, and a ruling that moved it.
//
// It used to be build-time-only: read by tools/gen_badge_art.py (F10) and tools/extend_badge_art.py
// (F15) and by NOTHING at runtime, per ROADMAP_v0.1.0.md §4.1 and D12.
//
// **NINA_CHATBOT_PLAN.md RU-2 repeals D12 for `lib/nina/` ONLY.** F33's Nina generates images at
// runtime (R18) — queued, daily-capped, and cost-logged in `nina_turns`. Badge and record art is
// unchanged: still generated offline by a skill and committed, still $0.04 and 4-5 minutes an
// image, still no reason whatsoever to do at request time.
//
// So this check is NARROWED, not removed. It still greps app/, lib/ and components/, and it still
// fails for every hit outside two exempt paths:
//
//   · `lib/nina/`  — the ruling's own boundary. Her generation client lives here.
//   · `lib/env.ts` — the app's single environment contract, which is where every other
//                    credential is declared and where the next person will look for this one.
//                    Hiding the variable in a lib/nina/env.ts, or assembling its name so this
//                    grep misses it, would be evading the check rather than amending it — which
//                    the plan's invariant 8 forbids in as many words.
//
// If this script fails, something in app/, components/ or the rest of lib/ started reading a key
// that only Nina and the offline skills may see. Fix the import, don't widen the exemption.
//
// Exported as well as run: `scripts/check-badge-art.mjs` asserts the same property as its first
// section, because `npm run badges:check` is meant to be the one command that says whether F10 is
// whole, and "the key never leaked" is the most important thing it can say. One implementation,
// two callers — a second copy of a security grep is a second thing to keep in step, and the copy
// is always the one that goes stale.
import { execSync } from 'node:child_process'

const DIRS = ['app', 'lib', 'components']

/**
 * Paths the key is allowed to appear in, as PREFIXES of a repo-relative path. RU-2.
 *
 * Prefix-matched in JS rather than handed to `grep --exclude-dir`, because `--exclude-dir=nina`
 * matches a directory NAME anywhere in the tree and would quietly exempt `app/nina/` and
 * `components/nina/` as well — and a client component reading this key is exactly the leak this
 * script exists to catch.
 */
const EXEMPT_PATHS = ['lib/nina/', 'lib/env.ts']

function isExempt(line) {
  // grep -rn output is `path:lineno:text`; the path is everything before the first colon.
  const path = line.slice(0, line.indexOf(':'))
  return EXEMPT_PATHS.some((prefix) => path === prefix || path.startsWith(prefix))
}

/** @returns {{ok: true} | {ok: false, reason: string, detail: string}} */
export function checkOpenRouterBoundary() {
  let raw
  try {
    raw = execSync(`grep -rnE 'OPENROUTER_API_KEY' ${DIRS.join(' ')}`, { encoding: 'utf8' })
  } catch (err) {
    // grep exits 1 when it finds nothing — that's a success path, and still is.
    if (err.status === 1) return { ok: true }
    return { ok: false, reason: 'grep itself errored', detail: err.message }
  }

  const leaked = raw
    .split('\n')
    .filter((line) => line.length > 0 && !isExempt(line))
    .join('\n')

  if (leaked.length === 0) return { ok: true }
  return { ok: false, reason: 'found outside its boundary', detail: leaked }
}

export const BOUNDARY_DIRS = DIRS
export { EXEMPT_PATHS }

// Run directly (`npm run ci:openrouter-guard`) rather than imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkOpenRouterBoundary()
  if (result.ok) {
    console.log(
      `OK    OPENROUTER_API_KEY appears in ${DIRS.join('/, ')}/ only under ` +
        `${EXEMPT_PATHS.join(' and ')} (RU-2)`,
    )
    process.exit(0)
  }
  console.error(`FAIL  OPENROUTER_API_KEY ${result.reason}:\n${result.detail}`)
  process.exit(result.reason === 'grep itself errored' ? 2 : 1)
}
```

**Impact:** `npm run ci:openrouter-guard` passes with `lib/env.ts` naming the key. `npm run
badges:check` passes unchanged — it imports `checkOpenRouterBoundary` and `BOUNDARY_DIRS`, both
still exported with the same shapes, and its §1 heading string is unaffected. Note that
`badges:check` now reports the narrowed property rather than the old one, which is correct: one
implementation, two callers, and the caller should not have its own opinion about the boundary.

---

### Step 10: RU-3 — push notifications leave the non-goals

**RU-3 verbatim:** *Push notifications ship. Unread badge on the tab, plus real Web Push where the
browser supports it. Struck from the roadmap's non-goals.*

Done in Step 8e — `push notifications ·` is struck from `ROADMAP_v0.1.0.md` §6 in the same edit
that reworks the weight and badge-art entries, because they are three items in one prose list and
three separate edits to one line is three chances to mangle it. The struck-through footnote below
that paragraph is what makes the change auditable rather than silent.

**Nothing else in this repeal is this phase's.** The service worker, the VAPID send path, the
subscribe action and the iOS install hint are all phase 11; the unread badge is phase 10. What
phase 1 owns is the table (`push_subscriptions`, Step 3), the two credentials (`pushEnv()`,
Step 7), and the sentence in the roadmap.

---

### Step 11: the profile form gains a sex field

**Files:** `lib/profile/schema.ts` (four places), `components/profile/ProfileForm.tsx:59-76`,
`app/onboarding/page.tsx:34-40`, `app/me/page.tsx:116-122`

**Change:** `sex` through the whole form pipeline. **No new UI primitive.** `components/ui` has no
`Select` and no `RadioGroup`, and adding one for a four-option field on one screen is a primitive
built on spec — the plan's own words about `Toast`. Instead the control is a `<fieldset>` of four
radios styled with `CHIP_CLASS`, written inside `ProfileForm.tsx`, using the class vocabulary
that already exists.

It is deliberately **not** wrapped in `Field`. `Field` owns a single `inputId` and renders
`<label htmlFor>` pointing at it, which is right for one input and wrong for a group of four —
the label would target whichever radio happened to read the context. A `fieldset`/`legend` is the
HTML for this, and it needs no wiring.

**Code** — `lib/profile/schema.ts`, four edits:

```ts
// 1. the import at :1-3
import { z } from 'zod'

import type { Sex } from '@/lib/db/schema'
import { birthYearFromAge } from '@/lib/metrics/age'
```

```ts
// 2. inside profileFormSchema, after heightCm at :37
    /**
     * Optional like everything else on this form (D11), and `''` is a real submission: the
     * radios ship with none selected, so an untouched form posts no `sex` key at all and
     * `blankToUndefined` turns a cleared one into the same thing.
     *
     * `z.enum` over the schema's own `SEX_VALUES`, so the form's domain and the column's domain
     * cannot drift — one tuple, two consumers.
     */
    sex: z.preprocess(blankToUndefined, z.enum(SEX_VALUES).optional()),
```

with `SEX_VALUES` added to the schema import:

```ts
import { SEX_VALUES, type Sex } from '@/lib/db/schema'
```

```ts
// 3. profileWriteSchema at :63-69
export const profileWriteSchema = z.object({
  birthYear: z.number().int().nullable(),
  heightCm: z.number().int().min(100).max(250).nullable(),
  weightKg: z.number().min(20).max(300).nullable(),
  sex: z.enum(SEX_VALUES).nullable(),
  restingHr: z.number().int().min(30).max(120).nullable(),
  maxHr: z.number().int().min(100).max(230).nullable(),
})
```

```ts
// 4. toProfileWrite at :80-88, and ProfileFormValues at :91-97
export function toProfileWrite(input: ProfileFormInput, now: Date = new Date()): ProfileWrite {
  return {
    birthYear: input.age != null ? birthYearFromAge(input.age, now) : null,
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    sex: input.sex ?? null,
    restingHr: input.restingHr ?? null,
    maxHr: input.maxHr ?? null,
  }
}

/** The shape `/onboarding` and `/me` render back into their inputs. */
export interface ProfileFormValues {
  age: number | null
  heightCm: number | null
  weightKg: number | null
  sex: Sex | null
  restingHr: number | null
  maxHr: number | null
}
```

**Code** — `components/profile/ProfileForm.tsx`. Add to the imports:

```ts
import { Button, CHIP_CLASS, Field, NumberInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { SEX_VALUES, type Sex } from '@/lib/db/schema'
```

Add this component above `ProfileForm`:

```tsx
/** Sentence case, in the copy's own voice — the column's value is never shown to anyone. */
const SEX_LABELS: Record<Sex, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  unspecified: 'Rather not say',
}

/**
 * Four radios that look like the chips everywhere else. A `fieldset`/`legend` rather than a
 * `Field`, because `Field` labels ONE input and this is a group — see the plan's Step 11.
 *
 * `peer` + `peer-checked:` is what lets a native radio carry the chip's selected styling with no
 * client state: the input is visually hidden but still focusable and still the thing a screen
 * reader announces, and the `<span>` beside it is what gets painted. `has-[:focus-visible]` puts
 * the focus ring on the painted half, so keyboard focus is visible where the eye is looking.
 *
 * NOTHING IS PRESELECTED. A default of 'male' would be the app guessing, and 'unspecified' as a
 * default would record a decision he never made — the column's NULL already means "never asked".
 */
function SexField({ value, error }: { value: Sex | null; error?: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-xs font-semibold tracking-[0.02em] text-ink-2">
        Sex
      </legend>
      <p className="mb-2 text-[11px] font-medium text-ink-3">
        Used for the physiology, and safe to leave blank.
      </p>

      <div className="flex flex-wrap gap-2">
        {SEX_VALUES.map((option) => (
          <label
            key={option}
            className="cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent rounded-pill"
          >
            <input
              type="radio"
              name="sex"
              value={option}
              defaultChecked={value === option}
              className="peer sr-only"
            />
            <span
              className={cn(
                CHIP_CLASS,
                'bg-paper-2 text-ink-2 peer-checked:bg-ink peer-checked:text-card',
              )}
            >
              {SEX_LABELS[option]}
            </span>
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red">
          {error}
        </p>
      )}
    </fieldset>
  )
}
```

and render it between the Height and Weight fields, replacing `:59-76`:

```tsx
        <Field label="Height" error={errors.heightCm} suffix="cm">
          <NumberInput
            name="heightCm"
            defaultValue={defaultOf(values.heightCm)}
            placeholder="—"
            maxLength={3}
          />
        </Field>

        <SexField value={values.sex} error={errors.sex} />

        <Field label="Weight" error={errors.weightKg} suffix="kg">
          <NumberInput
            name="weightKg"
            decimal
            defaultValue={defaultOf(values.weightKg)}
            placeholder="—"
            maxLength={5}
          />
        </Field>
```

Also update the component's docstring: it says "blank is a valid answer to all five questions" —
there are six now.

**Code** — one line in each of the two pages, inside the existing `values` literal:

```tsx
            sex: profile?.sex ?? null,
```

placed after `weightKg` in both `app/onboarding/page.tsx:37` and `app/me/page.tsx:119`.

**Impact:** `sr-only` must exist as a utility. Tailwind v4 ships it in preflight, and the repo
already uses Tailwind 4.3.3 — if a grep shows the project has purged it, the fallback is
`absolute size-0 opacity-0`. Verify with one grep before writing rather than after.

---

### Step 12: `nina.png` becomes an anchor and an avatar

**Files:** `assets/nina/_anchor.png` (new), `public/nina/avatar-001.png` (new), `nina.png`
(removed from the worktree root)

**Change:** `nina.png` is an untracked 1792×2400 6.4 MB PNG sitting at the repo root, which is
not a place a committed asset lives. R20 makes it two things: the **anchor** every later
generation is matched against, and her **first avatar**.

**The anchor is a move, not a re-encode** (D-7). `assets/badges/_anchor.png` is the convention —
a committed, lossless, full-size reference image that the generation skill passes as a reference —
and `assets/nina/_anchor.png` is the same idea for a face. Copying the bytes rather than
re-compressing them means the committed anchor is sha256-identical to the image the user supplied,
which is checkable, and means there is no generation-loss argument to have later. Note that phase
14's `/update-nina-profpic` re-anchors through a 2048 px fit, so a *replacement* anchor may be
slightly smaller than this first one; that is fine, because an anchor's job is face identity, not
print resolution.

```bash
cd /home/miftah/.worktrees/run-insights/nina-chatbot

mkdir -p assets/nina public/nina

# 1. the anchor — bytes unchanged, so the commit is verifiable
cp nina.png assets/nina/_anchor.png
sha256sum nina.png assets/nina/_anchor.png    # the two hashes must match

# 2. her first avatar — 764x1024, the portrait aspect kept
#    Pillow is already the tool this repo images with (tools/make_icon_assets.py); 12.3.0 is
#    installed. `LANCZOS` because a downscale of a face by 2.3x with anything cheaper stipples
#    the eyes, which is the one part of a 28px circular avatar anyone can actually see.
python3 - <<'PY'
from PIL import Image
src = Image.open('assets/nina/_anchor.png')
assert src.size == (1792, 2400), f'unexpected source size {src.size}'
out = src.resize((764, 1024), Image.LANCZOS)
out.save('public/nina/avatar-001.png', 'PNG', optimize=True)
print('public/nina/avatar-001.png', out.size)
PY

# 3. the root must not keep a 6.4 MB stray
rm nina.png

git add assets/nina/_anchor.png public/nina/avatar-001.png
git status --short          # nina.png must not appear at all
```

**Why 764×1024 and not a square thumbnail.** Phase 4 draws it at `size-7` (28 px) and `size-11`
(44 px) inside a circle with `object-cover`, so aspect is irrelevant there and any crop works.
Phase 13 opens it **full-screen** as the static fallback when `nina_avatars` has no current row,
and a square crop of a portrait would cut her off at the shoulders on that screen. Keeping the
portrait aspect at a long edge of 1024 serves both: ~1 MB rather than 6.4, sharp at every size the
app draws, and still a photograph rather than a thumbnail. `public/` is served as-is by Next, so
this file is what the browser downloads — the 6.4 MB original would be a 6.4 MB download on a
44 px avatar.

**No `nina_avatars` seed row is written by this phase.** The committed PNG is a constant that
phase 4 imports by path (`NINA_AVATAR_SRC = '/nina/avatar-001.png'`), and phase 13 is the phase
that decides whether the album's first entry is a real row pointing at Blob or the static
fallback. Writing a row here would mean inventing a `blob_url` for a file that is not in Blob.
`'seed'` exists in `NinaAvatarSource` for whoever makes that call. See Handoffs.

**Impact:** two committed binaries, ~7.4 MB of git history. Worth naming: the anchor is 6.4 MB of
it, and it is committed for the same reason `assets/badges/_anchor.png` (1.4 MB) is — a generation
input that is not in the repository is a generation that cannot be reproduced.

---

### Step 13: the four existing test files this phase breaks, and the two it adds

**Found by reading, not by running** — every one of these is a real failure that has to land in
the same commit, and two of them are typecheck failures rather than test failures.

**RULING C5 changed the SHAPE of this step and the honest count is now nine sites across four
files, not four.** The original filing had `tests/llm.facts.test.ts` needing one literal widened;
widening `ProfileFacts` instead of only `NarrativeProfile` means **three assertions in that file
now say the opposite of what is true and must be INVERTED, not deleted** — they are the only
tests in the repo that pin what does and does not reach a model, and a repeal that removes them
leaves nothing watching the boundary in either direction.

**RULINGS C8 and C9 break nothing that exists, and that was checked rather than assumed.**
`nina_turns.tool_calls` (integer → `text`) and `NinaMessageSource` (three members → six) are both
inside tables this migration creates, so no existing test names either. What they do change is
**13e**, this phase's own new contract test, which gains three assertions it would otherwise have
been written without — see 13e.

**Three files were checked and are genuinely unaffected. Recorded so nobody "fixes" them:**

- **`tests/share.project.test.ts:91`** forbids `weightKg` in the public share projection and
  **still passes**, which surprised me enough to verify it by reading. RU-1 lets weight reach a
  *model*; it does not publish the number. `toSharedRunView` carries the insight's PROSE
  (`headline`, `whatHappened`, `observations`) and never `payload.facts`, so no fact field of any
  kind reaches `/s/[token]`. The test is asserting that nobody joins `profiles` into the share
  read, which is still exactly the regression worth guarding.
- **`tests/llm.factsHash.test.ts`** has no hardcoded digest anywhere in it — every assertion
  compares two hashes computed in the test. `factsHash` moving is therefore invisible to it, which
  is why that file was written that way.
- **`tests/llm.narrate.test.ts:306`** builds a `ProfileFacts`-shaped literal but casts it
  `as unknown as SessionNarrateFacts`, so widening the interface is not a typecheck error there.
  Leave the cast alone — it is deliberate, and the test is about caching, not about facts.

#### 13a — `tests/profile.schema.test.ts` (a real assertion failure, 4 places)

`toProfileWrite` gains a sixth key, and two `toEqual` calls compare the whole object.

- `:13-20` — the `form()` helper gains `sex: ''`, so an untouched form still models a real
  submission.
- `:33` — `expect(parsed).toEqual({ age: 30, heightCm: 170, weightKg: 55, restingHr: 72, maxHr: 189 })`
  stays correct as written: `sex: ''` preprocesses to `undefined` and an `optional()` key that is
  `undefined` is absent from Zod's output. **Verify that rather than assume it** — if `parsed`
  comes back with `sex: undefined` as a present key, `toEqual` still passes (Vitest's `toEqual`
  ignores `undefined` properties), so this line needs no change either way.
- `:85-92` — add `sex: null`.
- `:102-108` — add `sex: null`, and add one new case:

```ts
  it('carries sex through untouched — it is the one field that is neither converted nor rounded', () => {
    const write = toProfileWrite(profileFormSchema.parse(form({ sex: 'male' })), TODAY)
    expect(write.sex).toBe('male')
    expect(profileWriteSchema.safeParse(write).success).toBe(true)
  })

  it('rejects a sex outside the four-member domain, so a hand-posted form cannot widen it', () => {
    expect(profileFormSchema.safeParse(form({ sex: 'Male' })).success).toBe(false)
    expect(profileFormSchema.safeParse(form({ sex: 'nonbinary' })).success).toBe(false)
  })
```

#### 13b — `tests/llm.facts.test.ts` (one typecheck failure and four assertions that INVERT)

**The noisiest file in the phase, and every edit in it is RULING C5.** The three "never mentions
weight" tests were written to pin D15/R-28; D15 is repealed and `ProfileFacts` now carries the
field, so all three currently assert something false. **They are inverted, not deleted.** The
boundary is still worth a test — it has just changed direction, and a repeal that leaves nothing
watching is how the *next* field gets in by accident.

**`:31`** — the fixture literal (a typecheck failure, since both new fields are required):

```ts
/** birthYear for an age of 30 as of the frozen `now` below. RU-1 added the last two fields. */
const PROFILE = { birthYear: 1996, heightCm: 169, weightKg: 55, sex: 'male' as const }
```

**`:137`** — the keys assertion, which is the one line that pins the payload's shape:

```ts
    // RULING C5 widened BOTH the input type (`NarrativeProfile`) and the output (`ProfileFacts`),
    // so the payload now carries weight and sex and `facts_hash` moved with them. Five keys, not
    // three. This is the assertion to change if the payload's shape is ever revisited — and the
    // one that fails if somebody narrows the type back without reading the ruling.
    expect(Object.keys(facts.profile).sort()).toEqual([
      'age',
      'heightCm',
      'hrMax',
      'sex',
      'weightKg',
    ])
```

**`:140-143`** — the session-facts prohibition, inverted:

```ts
  it('CARRIES body weight and sex — D15/R-28 repealed, RU-1 and RULING C5', () => {
    // This test asserted the opposite until v0.2.0, and the inversion is the point of the repeal:
    // "exposing user details like weight to ai analysis will 100% make the analysis much more
    // accurate". Both values are in the serialised payload, labelled self-reported by the prompt.
    expect(facts.profile.weightKg).toBe(55)
    expect(facts.profile.sex).toBe('male')
    expect(serialised).toContain('weightKg')
  })
```

**`:236-238`** — the same claim at session level with history attached:

```ts
  it('still carries weight and sex with the history attached', () => {
    expect(JSON.stringify(facts).toLowerCase()).toContain('weightkg')
  })
```

**`:362-364`** — and at week level, which matters more than it looks: `profileFacts()` is shared
by all three scopes, so this is the assertion that catches a widening applied to one builder and
forgotten in the others:

```ts
  it('carries weight and sex into the WEEK payload too — one builder, three scopes', () => {
    const facts = buildWeekFacts(base)
    expect(facts.profile.weightKg).toBe(55)
    expect(facts.profile.sex).toBe('male')
  })
```

**One assertion worth ADDING, since `factsHash` moving is the whole accepted cost of C5** — it
makes the cache consequence a fact in the suite rather than a paragraph in a plan:

```ts
  it('a different weight is a different facts_hash, which is why every insight regenerates', () => {
    // RULING C5's accepted consequence, pinned. `ProfileFacts` is inside the hashed object, so
    // adding the field moved every existing key. If this ever passes with the two hashes equal,
    // weight is in the type but not in the payload — the exact half-repeal C5 overruled.
    const a = canonicalFacts()
    const b = buildSessionFacts({ ...SESSION_INPUT, profile: { ...PROFILE, weightKg: 61 } })
    expect(factsHash(a)).not.toBe(factsHash(b))
  })
```

#### 13c — `tests/live/narrate.live.test.ts:63` (a typecheck failure)

```ts
    profile: { birthYear: 1996, heightCm: 169, weightKg: 55, sex: 'male' },
```

Excluded from `npm test` (it needs `LLM_LIVE_TEST=1`) but **not** excluded from
`npm run typecheck`, which is `tsc --noEmit` over the whole project. This is the one that gets
forgotten.

#### 13d — `tests/db.schema.test.ts:385` (a test whose NAME becomes a lie)

Its body enumerates the ten F03 tables explicitly, so it keeps passing — but it is titled *"R-22:
badges.run_id is nullable and SET NULL — the only non-cascade FK in the schema"*, and after this
phase there are three. Rename it and add one line to its body, so the claim it makes is the claim
it checks (this is exactly D-4, restated as a test):

```ts
  it('R-22: badges.run_id is nullable and SET NULL — the only non-cascade FK among the F03 tables', () => {
```

and, at the end of that test's body:

```ts
    // F33 adds two more `set null` FKs, both on nina_messages, and both deliberate — see that
    // table's header. Asserted here so the count is a fact rather than a comment.
    expect(fkFor(schema.ninaMessages, 'reply_to_id')?.onDelete).toBe('set null')
    expect(fkFor(schema.ninaMessages, 'run_id')?.onDelete).toBe('set null')
```

The `numericColumns` test at `:119-138` needs **no** change for the same reason: it enumerates the
ten F03 tables by hand, so `nina_avatars.crop_scale` is outside its scope. Its title — *"weight_kg
is the one and only numeric column in the schema"* — is the same kind of lie, so give it the same
kind of fix: *"…the one and only numeric column among the F03 tables"*.

#### 13e — `tests/db.schema.nina.test.ts` (new)

The contract test. Nine other phases were written against these names before the schema existed,
and this file is what makes a typo fail here instead of in phase 6.

```ts
import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import * as schema from '@/lib/db/schema'

/**
 * F33's eight tables and two `profiles` columns, asserted against the names the phase plans were
 * written against. `tests/db.schema.test.ts` does this for F03 and explains why: a typo here
 * surfaces as a wrong number in a rollup — or, for Nina, as a phase-6 image with no description —
 * six features later.
 *
 * Deliberately NOT a copy of that file's helpers: this suite asks different questions (an
 * emission-order column, a partial unique index, a nullable provenance pointer) and sharing the
 * helpers would mean one of the two files owning them.
 */
function cfg(table: PgTable) {
  return getTableConfig(table)
}
function columns(table: PgTable): Map<string, ReturnType<typeof cfg>['columns'][number]> {
  return new Map(cfg(table).columns.map((c) => [c.name, c]))
}
function sqlType(table: PgTable, column: string): string {
  const col = columns(table).get(column)
  if (!col) throw new Error(`no column ${column} on ${cfg(table).name}`)
  return col.getSQLType()
}
function names(table: PgTable): string[] {
  return [...columns(table).keys()].sort()
}
function indexNames(table: PgTable): string[] {
  return cfg(table).indexes.map((i) => i.config.name ?? '(unnamed)').sort()
}
function fkFor(table: PgTable, column: string) {
  return cfg(table)
    .foreignKeys.find((fk) =>
      fk
        .reference()
        .columns.map((c) => c.name)
        .includes(column),
    )
}

describe('profiles gains sex and last_seen_on', () => {
  it('sex is a nullable text column, and SEX_VALUES is its domain in the same order', () => {
    expect(sqlType(schema.profiles, 'sex')).toBe('text')
    expect(columns(schema.profiles).get('sex')?.notNull).toBe(false)
    expect(schema.SEX_VALUES).toEqual(['male', 'female', 'other', 'unspecified'])
  })

  it('last_seen_on is a nullable DATE — a Jakarta calendar day, like runs.occurred_on', () => {
    expect(sqlType(schema.profiles, 'last_seen_on')).toBe('date')
    expect(sqlType(schema.runs, 'occurred_on')).toBe('date')
    expect(columns(schema.profiles).get('last_seen_on')?.notNull).toBe(false)
  })
})

describe('the eight table names', () => {
  it('are exactly what the plan index promised', () => {
    expect(cfg(schema.ninaMessages).name).toBe('nina_messages')
    expect(cfg(schema.ninaMessageImages).name).toBe('nina_message_images')
    expect(cfg(schema.ninaMemorySlots).name).toBe('nina_memory_slots')
    expect(cfg(schema.ninaMemoryFacts).name).toBe('nina_memory_facts')
    expect(cfg(schema.ninaAvatars).name).toBe('nina_avatars')
    expect(cfg(schema.ninaNags).name).toBe('nina_nags')
    expect(cfg(schema.ninaTurns).name).toBe('nina_turns')
    expect(cfg(schema.pushSubscriptions).name).toBe('push_subscriptions')
  })

  it('all eight cascade from user, so deleting the account leaves no conversation behind', () => {
    for (const table of [
      schema.ninaMessages,
      schema.ninaMessageImages,
      schema.ninaMemorySlots,
      schema.ninaMemoryFacts,
      schema.ninaAvatars,
      schema.ninaNags,
      schema.ninaTurns,
      schema.pushSubscriptions,
    ]) {
      expect(fkFor(table, 'user_id')?.onDelete, cfg(table).name).toBe('cascade')
    }
  })
})

describe('nina_messages', () => {
  it('spells the columns phase 2 and phase 4 were written against', () => {
    expect(names(schema.ninaMessages)).toEqual(
      [
        'id',
        'seq',
        'user_id',
        'role',
        'text',
        'source',
        'turn_id',
        'reply_to_id',
        'run_id',
        'sent_at',
        'delivered_at',
        'read_at',
      ].sort(),
    )
  })

  it('seq is a bigserial — the emission order phase 4 cannot solve for itself', () => {
    // `bigserial` is what makes a four-bubble turn read back in the order Nina emitted it: four
    // rows written in one transaction share `sent_at` to the microsecond, so a timestamp cannot
    // order them and a per-turn integer cannot order two turns in the same instant.
    expect(sqlType(schema.ninaMessages, 'seq')).toBe('bigserial')
    expect(columns(schema.ninaMessages).get('seq')?.notNull).toBe(true)
    expect(columns(schema.ninaMessages).get('id')?.primary).toBe(true)
  })

  it('reply_to_id references itself and run_id references runs, both SET NULL', () => {
    expect(fkFor(schema.ninaMessages, 'reply_to_id')?.onDelete).toBe('set null')
    expect(fkFor(schema.ninaMessages, 'run_id')?.onDelete).toBe('set null')
  })

  it('turn_id carries no FK — an audit pointer must not be able to block a delete', () => {
    expect(fkFor(schema.ninaMessages, 'turn_id')).toBeUndefined()
  })

  it('has the four indexes the reads need', () => {
    expect(indexNames(schema.ninaMessages)).toEqual([
      'nina_messages_reply_to_idx',
      'nina_messages_user_run_idx',
      'nina_messages_user_seq_idx',
      'nina_messages_user_unread_idx',
    ])
  })
})

describe('nina_message_images', () => {
  it('is its own table with a description column, because phase 13 queries it directly', () => {
    expect(sqlType(schema.ninaMessageImages, 'description')).toBe('text')
    expect(columns(schema.ninaMessageImages).get('description')?.notNull).toBe(false)
    expect(fkFor(schema.ninaMessageImages, 'message_id')?.onDelete).toBe('cascade')
  })
})

describe('memory: the slots, the ledger, and R26 hand-editing', () => {
  it('is keyed (user_id, key) for slots and by id for the ledger', () => {
    expect(cfg(schema.ninaMemorySlots).primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'user_id',
      'key',
    ])
    expect(columns(schema.ninaMemoryFacts).get('id')?.primary).toBe(true)
  })

  it('slot values are jsonb, so one column holds a phrase and pending_promises alike', () => {
    expect(sqlType(schema.ninaMemorySlots, 'value')).toBe('jsonb')
    expect(schema.NINA_SLOT_PENDING_PROMISES).toBe('pending_promises')
  })

  it('source_message_id is NULLABLE on both, because the admin editor types rows the chat never said', () => {
    expect(columns(schema.ninaMemorySlots).get('source_message_id')?.notNull).toBe(false)
    expect(columns(schema.ninaMemoryFacts).get('source_message_id')?.notNull).toBe(false)
    // And neither is an FK: provenance must not be able to block a conversation delete.
    expect(fkFor(schema.ninaMemorySlots, 'source_message_id')).toBeUndefined()
    expect(fkFor(schema.ninaMemoryFacts, 'source_message_id')).toBeUndefined()
  })

  it('both carry a source discriminator defaulting to distilled', () => {
    expect(sqlType(schema.ninaMemorySlots, 'source')).toBe('text')
    expect(columns(schema.ninaMemorySlots).get('source')?.notNull).toBe(true)
    expect(columns(schema.ninaMemoryFacts).get('source')?.notNull).toBe(true)
  })

  it('confidence is an integer percent, not a float probability', () => {
    expect(sqlType(schema.ninaMemoryFacts, 'confidence')).toBe('integer')
  })
})

describe('nina_avatars', () => {
  it('carries exactly the fifteen columns phases 12-15 were written against', () => {
    expect(names(schema.ninaAvatars)).toEqual(
      [
        'id',
        'user_id',
        'blob_url',
        'pathname',
        'width',
        'height',
        'bytes',
        'source',
        'crop_scale',
        'crop_x',
        'crop_y',
        'description',
        'is_current',
        'announced_at',
        'created_at',
      ].sort(),
    )
  })

  it('has a PARTIAL unique index on (user_id) where is_current, so two current avatars cannot exist', () => {
    const unq = cfg(schema.ninaAvatars).indexes.find(
      (i) => i.config.name === 'nina_avatars_user_current_unq',
    )
    expect(unq).toBeDefined()
    expect(unq?.config.unique).toBe(true)
    // The WHERE is what makes an ALBUM possible at all — a plain unique index would allow one
    // avatar per user, ever. Same shape as shares_run_id_active_unq.
    expect(unq?.config.where).toBeDefined()
  })

  it('announced_at and the crop triple are nullable — NULL is the pre-phase-15 answer', () => {
    for (const column of ['announced_at', 'crop_scale', 'crop_x', 'crop_y', 'description']) {
      expect(columns(schema.ninaAvatars).get(column)?.notNull, column).toBe(false)
    }
  })

  it('crop_scale is numeric(5, 3) and the offsets are integers (per-mille of the frame)', () => {
    expect(sqlType(schema.ninaAvatars, 'crop_scale')).toBe('numeric(5, 3)')
    expect(sqlType(schema.ninaAvatars, 'crop_x')).toBe('integer')
    expect(sqlType(schema.ninaAvatars, 'crop_y')).toBe('integer')
  })
})

describe('nina_nags and nina_turns', () => {
  it('nags are keyed (user_id, code) and remember the DAY, not the instant', () => {
    expect(cfg(schema.ninaNags).primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'user_id',
      'code',
    ])
    expect(sqlType(schema.ninaNags, 'last_mentioned_on')).toBe('date')
  })

  it('turns log cost in integer micro-USD, never a float in dollars', () => {
    expect(sqlType(schema.ninaTurns, 'cost_micro_usd')).toBe('integer')
    expect(sqlType(schema.ninaTurns, 'input_tokens')).toBe('integer')
    expect(sqlType(schema.ninaTurns, 'output_tokens')).toBe('integer')
    expect(sqlType(schema.ninaTurns, 'latency_ms')).toBe('integer')
  })

  it('tool_calls is TEXT with a NOT NULL default — tool NAMES, not a count (RULING C8)', () => {
    // Phase 3's ruling (b) drops the `save_memory` tool if it never fires, and that is only
    // decidable if the column says WHICH tools fired. An integer answers a question nobody asked.
    expect(sqlType(schema.ninaTurns, 'tool_calls')).toBe('text')
    expect(columns(schema.ninaTurns).get('tool_calls')?.notNull).toBe(true)
    expect(columns(schema.ninaTurns).get('tool_calls')?.hasDefault).toBe(true)
  })

  it('args is NULLABLE jsonb, which is what makes RU-20 retryable at all (RULING C1)', () => {
    // The repo is public, so a workflow_dispatch input is world-readable and the prompt has to
    // travel in the row with only an opaque job id in the dispatch; and the `schedule:` backstop
    // wakes with no arguments, so a job whose args are not here can never be retried.
    expect(sqlType(schema.ninaTurns, 'args')).toBe('jsonb')
    expect(columns(schema.ninaTurns).get('args')?.notNull).toBe(false)
    expect(columns(schema.ninaTurns).get('args')?.hasDefault).toBe(false)
  })

  it('status is plain text with no CHECK, so adding a member is not a migration', () => {
    // `NinaTurnStatus` gained 'pending' under RULING C2 with no SQL change at all. That property
    // is the reason `kind`, `trigger`, `source` and `status` are all `text` + `.$type<>()`.
    expect(sqlType(schema.ninaTurns, 'status')).toBe('text')
    expect(columns(schema.ninaTurns).get('status')?.notNull).toBe(true)
  })
})

describe('push_subscriptions', () => {
  it('is unique per endpoint but keyed by a nanoid, because an endpoint is a 300-char URL', () => {
    expect(columns(schema.pushSubscriptions).get('id')?.primary).toBe(true)
    const unq = cfg(schema.pushSubscriptions).indexes.find(
      (i) => i.config.name === 'push_subscriptions_endpoint_unq',
    )
    expect(unq?.config.unique).toBe(true)
  })
})
```

#### 13f — `tests/env.admin.test.ts` (new)

`isAdminEmail` is the only logic this phase adds to `lib/env.ts`, so it is the only part with a
test. `lib/env.ts` opens with `import 'server-only'`, which Vitest resolves to
`tests/support/serverOnlyStub.ts` (see `vitest.config.ts`'s alias and its comment) — so this
module IS importable from a test, and no refactor into a separate pure file is needed.

```ts
import { afterEach, describe, expect, it } from 'vitest'

/**
 * `ADMIN_EMAILS` gates `/admin/nina` and `/admin/memory` (R23/R24). The parsing is four lines and
 * every one of them is a way to be locked out of your own admin page, which is why it has a test:
 * Google reports `Foo@Gmail.com` and `foo@gmail.com` as one account, and a person typing a
 * comma-separated list puts spaces after the commas.
 *
 * `lib/env.ts` caches its groups in module scope, so each case re-imports the module with
 * `vi.resetModules()`-equivalent isolation via a dynamic import after setting the variable.
 */
const ORIGINAL = process.env.ADMIN_EMAILS

async function withAllowlist(value: string) {
  process.env.ADMIN_EMAILS = value
  const mod = await import(`@/lib/env?admin=${encodeURIComponent(value)}`)
  return mod.isAdminEmail as (email: string | null | undefined) => boolean
}

afterEach(() => {
  if (ORIGINAL == null) delete process.env.ADMIN_EMAILS
  else process.env.ADMIN_EMAILS = ORIGINAL
})

describe('isAdminEmail', () => {
  it('admits the seeded address', async () => {
    const isAdminEmail = await withAllowlist('mahfuzh74@gmail.com')
    expect(isAdminEmail('mahfuzh74@gmail.com')).toBe(true)
  })

  it('is case-insensitive, because Google is', async () => {
    const isAdminEmail = await withAllowlist('mahfuzh74@gmail.com')
    expect(isAdminEmail('Mahfuzh74@Gmail.com')).toBe(true)
    expect(isAdminEmail('  mahfuzh74@gmail.com  ')).toBe(true)
  })

  it('reads a list with spaces after the commas, because that is how people type one', async () => {
    const isAdminEmail = await withAllowlist('a@b.com, mahfuzh74@gmail.com ,c@d.com')
    expect(isAdminEmail('mahfuzh74@gmail.com')).toBe(true)
    expect(isAdminEmail('c@d.com')).toBe(true)
  })

  it('fails CLOSED on a missing, empty or unknown email', async () => {
    const isAdminEmail = await withAllowlist('mahfuzh74@gmail.com')
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
    expect(isAdminEmail('')).toBe(false)
    expect(isAdminEmail('   ')).toBe(false)
    expect(isAdminEmail('someone@else.com')).toBe(false)
    // No substring matching: an allowlist that admits a suffix is not an allowlist.
    expect(isAdminEmail('evil+mahfuzh74@gmail.com')).toBe(false)
    expect(isAdminEmail('mahfuzh74@gmail.com.evil.com')).toBe(false)
  })
})
```

**If the query-string dynamic import trick does not defeat the module cache** (Vitest's resolver
may normalise it away), the fallback is `vi.resetModules()` in a `beforeEach` plus a plain
`await import('@/lib/env')`. Either is fine; do not restructure `lib/env.ts` to make the test
easier, because the shape of that file is a documented decision.

---

## Verification

**Before anything else — replace the symlink.** The plan index says so and phase 14 needs a real
install; `npm install` through a symlink into `/home/miftah/run-insights/node_modules` would
mutate the other checkout's dependencies.

```bash
cd /home/miftah/.worktrees/run-insights/nina-chatbot
rm node_modules && npm install
```

**Build:**

```bash
npm run typecheck        # next typegen && tsc --noEmit — this is what catches 13b and 13c
npm run lint
npm run format:check
```

**Tests:**

```bash
npm test                                  # includes tests/db.schema.nina.test.ts and env.admin
npm run ci:llm-payload-guard              # one rule now, and it names the repeal
npm run ci:openrouter-guard               # passes with lib/env.ts naming the key
npm run badges:check                      # §1 imports the narrowed guard and must still pass
npm run ci:data-layer-guard
npm run ci:client-secret-guard            # no NEXT_PUBLIC_ was introduced
npm run ci:f08-guard
npm run ci:f11-guard
```

**Database:**

```bash
npm run db:generate     # ONE migration
npm run db:check
npm run db:migrate
npm run db:smoke
```

**Manual checks — four, and each one catches a distinct class of mistake:**

1. **`git status --short` shows no `nina.png`** and shows `assets/nina/_anchor.png` +
   `public/nina/avatar-001.png` staged. `sha256sum` the anchor against the original before
   deleting it.
2. **Read `drizzle/0002_nina.sql` against Step 5's ten-point checklist.** In particular confirm
   `seq` came out as `bigserial` and the avatar index came out `UNIQUE … WHERE`. If
   `getSQLType()` for `bigserial(…, { mode: 'number' })` turns out to be `bigint` rather than
   `bigserial`, the SQL is what decides — adjust the one assertion in 13e to match the emitted
   type, and only worry if the SQL has no sequence at all.
3. **Open `/me` on a phone-width viewport** and confirm the sex chips wrap rather than overflow,
   that none is preselected on a profile with `sex IS NULL`, and that selecting one and saving
   round-trips (reload shows it selected). Then clear it — there is no "clear" affordance on a
   radio group, which is a real gap and is in Handoffs.
4. **Generate one F07 narrative** (open a run detail page and let the insight trigger fire) and
   confirm **three** things, because RULING C5 makes this the one manual check with a real
   behaviour change behind it. (a) It **regenerates** rather than serving the cached row —
   `ProfileFacts` widened, so `facts_hash` moved and the first open of any run is a fresh model
   call. That is the expected symptom, not a cache bug. (b) The prose is *allowed* to mention
   weight or sex now, and may well not — the prompt says use the number only when it changes the
   advice, so silence on a run where it does not matter is the rule working. (c) It must **not**
   comment on the runner's body, set a weight target, or restate the number as colour; all three
   are forbidden in as many words by the prompts Step 8d writes. If any of the three appears, the
   prompt edit landed but its limits did not.

**Exit criteria — the phase is done when all six are true:**

1. `npm run db:generate` produces exactly ONE new migration, and `npm run db:migrate` applies it
   to a fresh and to the existing database without error.
2. Every `ci:*` guard passes, `ci:llm-payload-guard` with one rule instead of two and
   `ci:openrouter-guard` with two exempt paths — and neither one is silenced, commented out or
   removed from `package.json`.
3. `npm run typecheck && npm run lint && npm test` is green with the widened `NarrativeProfile`
   **and the widened `ProfileFacts`** — which means F07's insight tests are green *after* the four
   inversions Step 13b lists, not before them. A green `npm test` that still contains a passing
   assertion named *"NEVER mentions body weight"* means `ProfileFacts` was not actually widened.
4. `assets/nina/_anchor.png` and `public/nina/avatar-001.png` exist and are committed;
   `nina.png` is gone from the repo root.
5. `/me` and `/onboarding` collect sex, and a saved value survives a reload.
6. **Nina does not exist.** No prompt, no component, no route, no model call, no
   `components/nina/`. Grep for it: `ls components/nina app/nina 2>&1` must say no such file.

---

## Handoffs

Work found while planning this phase and deliberately left elsewhere.

**To the reconciler, as conflicts to resolve:**

1. **RESOLVED AGAINST THIS PLAN — RULING D2. Phase 1 owns every roadmap, reconciliation and doc
   edit in the set, §4.8's tab sentence included.** This plan recommended handing §4.8 to phase 4
   on the grounds that whoever writes `grid-cols-5` should write "five-tab". The reconciler
   overruled it and **phase 4 is right to leave §4.8 alone**: phase 1 already edits
   `ROADMAP_v0.1.0.md` in six other places, so a second writer on the same document buys a merge
   conflict and nothing else — the sentence is one word long and does not need to be in the same
   commit as the grid change to be true. Step 8e now makes the edit, using phase 4's own
   supplied sentence (the FAB sat at 37.5% of the bar in a four-column grid and sits at 50% in a
   five-column one, so §4.8's "centre" claim is newly *true* rather than newly written). Phase 4
   records the ruling and changes no document.
2. **Phase 2's `RunnerSex` local alias.** Phase 2 says: *if phase 1 exports a `Sex` type from
   `lib/db/schema.ts`, replace the local alias with an import of it.* It does — `Sex`, with
   exactly those four members, plus `SEX_VALUES` as an ordered tuple. Make the swap.
3. **Phase 2's `MemorySlotInput.value` is a string; my column is `jsonb`.** No plan needs to
   change: `getNinaMemorySlots` returns rendered strings (D-3), which is what phase 2's gateway
   declares. Note it so nobody "fixes" one side to match the other.
4. **Phase 3 must name its turn entry point `runNinaTurn`.** That is the literal string
   `check-llm-payload-boundary.mjs` greps for. Any other name is a one-line edit to
   `GUARDED_CALLS`, but it has to be made or the guard guards nothing. **RULING D1 settles the
   rest of it:** the table is named `GUARDED_CALLS` (phase 3's `SANCTIONED` / `BLOCKING_CALLS`
   and phase 5's `BLOCKING_CALLS` are renamed in their plans), it ships complete from here with
   all four symbols, and **`scripts/check-llm-payload-boundary.mjs` is removed from the Files
   tables of phases 3, 5 and 6** — each carries one sentence instead: *"phase 1 ships the complete
   `GUARDED_CALLS` table including this symbol; nothing to add here."*
5. **SETTLED, not lucky — RULING A1's three-layer boundary is now a rule with an owner.** This
   was filed as "both plans happen to be right"; the reconciler has made it binding instead, and
   it is recorded in D-1 and in `NinaMessageRow`'s docstring so a future reader cannot mistake it
   for an accident. Columns are `text` / `sent_at` (phase 1). The `lib/nina/queries.ts` DTO is
   `body` / `createdAt`, in **every** function, because `messageColumns` is selected by all of
   them. Phase 2's `MessageInput` is `text` / `sentAt` and does not move. **Phase 3's
   `dbNinaSourceGateway` in `lib/nina/gateway.ts` is the one and only mapper.** Phase 3's earlier
   claims — "requires the column spelling `text`" and "the reconciler should pick `text` and edit
   phase 4's one destructure" — are deleted from phase 3's plan. Nobody edits phase 4's
   destructure and nobody edits phase 6's `row.body`; a PR that "unifies the spelling" is
   reverting a ruling.

**To named phases:**

- **Phase 6** — `insertNinaMessageImages` returns `[]` when a `messageId` is not the caller's.
  A non-empty input that returns `[]` is a failure, not "no images", and phase 6 must treat it as
  one rather than proceeding with a described image nobody can see.
- **Phase 10** — `profiles.last_seen_on` exists but **nothing writes it**. The silence trigger
  needs both the column and a toucher, and whoever adds the touch has to decide where it lives
  (a Server Action on app open, a `layout.tsx`, a middleware). Until then the column is
  permanently NULL, which the rule must read as "no signal" — a fresh install must not be
  scolded on day one. Also: the unread badge reads `countUnreadNinaMessages`, and
  `markNinaMessagesRead` takes a `now` so it is testable.
- **Phase 11** — `push_subscriptions` is declared and **has no query functions at all**. That is
  deliberate: a read with no writer is a read nobody has designed, and phase 11 owns the write
  path. **`VAPID_SUBJECT` is already shipped** (RULING C4): this plan filed it as a one-line edit
  for phase 11 to make, and the reconciler moved it here instead, because `lib/env.ts` and
  `.env.example` have one owner and a five-variable environment contract landing in three commits
  is a deploy that validates four of them. `pushEnv()` returns all three keys and
  `.env.example` documents the `mailto:` and why `setVapidDetails()` throws without it. Phase 11
  drops its `lib/env.ts` and `.env.example` Files rows and its signature change 1 — nothing for it
  to add here.
- **Phase 12** — `countNinaTurnsSince(userId, 'image', startOfJakartaDay)` is the daily cap's
  read. `nina_message_images.prompt` is where the generation prompt goes, and
  `nina_avatars.description` is where R25's "what this depicts" goes for a generated avatar —
  phase 12 already has the prompt and is the only writer that does not need a describe pass.
  **Everything RU-20 needed from this phase is now shipped rather than asked for**, and phase 12
  edits none of these files: `nina_turns.args jsonb` (C1), `NinaTurnStatus`'s `'pending'` (C2),
  `nina_turns.tool_calls text` (C8), and `ninaEnv().GITHUB_DISPATCH_TOKEN` plus its
  `.env.example` entry (C4). **Phase 12's Requires 7 becomes "consumed as shipped."** The repo
  coordinates stay module constants in its own `lib/nina/imagedispatch.ts` — deliberately not env,
  so no deploy can point the dispatch at another repository.
- **Phase 13** — decide whether the album's first entry is a real `nina_avatars` row. Step 12
  writes none, because a row needs a `blob_url` and `public/nina/avatar-001.png` is not in Blob.
  `'seed'` exists in `NinaAvatarSource` for whoever makes that call; the alternative is that
  `getCurrentNinaAvatar` returning `null` means "use the committed constant", which is also fine
  and needs no row. Pick one and say so, because phase 4 and phase 13 both render an avatar.
- **Phase 14** — `nina_avatars` matches its eleven columns exactly and adds four more
  (`crop_scale`, `crop_x`, `crop_y`, `description`), all nullable, so its `INSERT` needs no
  change. The partial unique index it asked for exists, so its statement order is now *required*
  rather than merely tidy. And `scripts/blob-reap.mjs` still knows nothing about the `nina/`
  prefix — an orphan under `nina/<userId>/` is invisible to the reaper today, which is a real
  gap that phase 14's own plan also names.
- **Phase 15** — `updateNinaAvatarCrop` does **no range validation**; the bounds belong in a Zod
  schema next to the framing widget, the way `lib/profile/schema.ts` sits next to the profile
  form. The coordinate convention is documented on the column: `crop_scale` is a multiple of the
  cover fit, `crop_x`/`crop_y` are per-mille of the frame's width, and all three NULL means
  centred `object-cover`. A renderer must treat a partial triple as offsets of zero.
- **Phase 16** — both memory tables carry `source` (`'distilled' | 'admin'`) and a nullable
  `source_message_id`, and `upsertNinaMemorySlot` / `deleteNinaMemorySlot` /
  `updateNinaMemoryFact` / `deleteNinaMemoryFact` are the four writes it needs. `adminEnv()` and
  `isAdminEmail()` exist; **the gate itself does not** — nothing in `app/` checks either, and
  building that gate is phase 15's or phase 16's, not mine. Whichever builds it first should own
  it and the other should import it.
- **Phase 15 or 16, whichever ships the gate** — `isAdminEmail` needs the session's email, and
  `requireUserId()` returns an id. Whether `auth()` already exposes `session.user.email` on this
  Auth.js config is unverified by me; if it does not, the gate is a `users` read by id.

**Deliberately not done, and why:**

- **STRUCK — F07's narrative DOES now use weight and sex, and this plan was wrong to defer it
  (RULING C5).** The bullet that stood here read: *"RU-1 makes them available — `NarrativeProfile`
  carries them — but `ProfileFacts` (the output type) is untouched, so no insight payload, no
  `facts_hash` and no prompt changed. Widening the output would invalidate every cached insight
  and change F07's prose, which is a decision about F07 and belongs in an F07 card."* The
  reconciler overruled it, and the reasoning is the user's own words in the plan index: D15 was
  repealed because *"exposing user details like weight to ai analysis will 100% make the analysis
  much more accurate"*. **An insight that cannot see weight and sex is the half of that repeal
  that does nothing** — it would have left Nina reasoning about the runner's mass while F07,
  reading the same runs, could not, which is two coaches with different eyesight and no way for
  the runner to know which he is reading. So `ProfileFacts` widens (Step 8b), all three narrate
  prompts widen with it (Step 8d), and the three `*_PROMPT_VERSION` constants bump.
  **The cost is accepted, not overlooked:** `factsHash` moves and **every cached insight
  regenerates on next view** — one model call per run the user actually opens, spread over
  however long that takes, against a user who said not to stint on tokens. *Revisit if* the
  regeneration cost ever matters; the escape is to seed the two fields only for runs newer than a
  cutoff date, which keeps every older hash stable.
- **No sex field on the public share page.** R-28's repeal covers share pages per RU-1, but
  nothing on `/s/[token]` renders a profile today and adding one is F11's.
- **No "clear" affordance on the sex radio group.** A radio group cannot be un-selected without a
  fifth "clear" control, and `'unspecified'` is the closest honest answer, which is why it is
  labelled "Rather not say". If the user wants NULL back, that is a small UI card.
- **No index on `nina_turns.kind`.** `countNinaTurnsSince` filters on `(user_id, kind,
  created_at)` and reads `nina_turns_user_created_idx`, which covers the leading and trailing
  columns; `kind` is a filter over a handful of rows per day. If the audit table ever grows past
  a few thousand rows per user, a `(user_id, kind, created_at desc)` index is the fix — and a
  cheap one, since nothing depends on the current index's name.
- **No `nina_message_images` entry in the blob reaper.** Named above under phase 14.

---

## Rollback

This phase is the one that is not a `git revert`, and both reasons deserve naming.

**The code half reverts cleanly.** `lib/nina/queries.ts` is a new file, the schema additions are
new declarations, and the eight edits to shared files (`lib/env.ts`, `.env.example`, two guards,
`lib/llm/facts.ts`, `lib/insights/load.ts`, two roadmap documents, the profile form pipeline) are
all textual. `git revert <commit>` restores every one of them.

**The migration is forward-only.** Reverting the code leaves the tables in place, which is
harmless but untidy. To actually undo it, by hand, against `DATABASE_URL_UNPOOLED`, **in this
order** (children before parents, so the FKs do not block):

```sql
begin;
drop table if exists nina_message_images;
drop table if exists nina_messages;        -- after its images; the self-FK drops with the table
drop table if exists nina_memory_facts;
drop table if exists nina_memory_slots;
drop table if exists nina_nags;
drop table if exists nina_avatars;
drop table if exists nina_turns;
drop table if exists push_subscriptions;
alter table profiles drop column if exists sex;
alter table profiles drop column if exists last_seen_on;
commit;
```

then delete `drizzle/0002_nina.sql`, `drizzle/meta/0002_snapshot.json`, and the `idx: 2` entry
from `drizzle/meta/_journal.json` — all three, or `drizzle-kit check` will disagree with the
database on the next generate.

**Two things to check after any revert of this phase**, because they are the two that fail
quietly:

1. **The F07 narrative still generates, and it will regenerate a second time.** Reverting 8b,
   8c and 8d narrows `NarrativeProfile` and `ProfileFacts` back to two and three fields and undoes
   the three prompt-version bumps; if anything downstream started reading `weightKg` from either
   type in the meantime, that is a compile error, and if anything started reading it *optionally*,
   it is not. Run `npm run test:live:narrate` or trigger one insight.
   **The cache consequence is symmetric and worth expecting rather than debugging:** narrowing
   `ProfileFacts` moves `factsHash` back, so **every insight generated since this phase landed
   misses again and regenerates on next view.** The pre-phase-1 rows are still in `insights` and
   still keyed by their original hashes, so what actually happens is that the old cache comes back
   — which is the best available outcome, and only true because nothing was ever purged.
2. **`ci:llm-payload-guard` fails after a revert if any later phase's `lib/nina/` code names
   `weightKg`** — which it will, because that is what RU-1 was for. So a revert of phase 1 alone
   is only safe while no later phase has landed. **In practice: revert the whole branch, not this
   phase.** The plan index's own rollback section says the same thing, and this is the concrete
   reason.

**The two committed PNGs.** `git revert` removes them from the tree but not from history, and
`nina.png` at the repo root is not restored by it — it was untracked. Keep a copy outside the
worktree before Step 12 if that matters; the anchor is byte-identical to it, so
`git show <commit>:assets/nina/_anchor.png > nina.png` recovers it exactly.
