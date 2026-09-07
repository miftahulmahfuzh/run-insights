# Code Analysis: Nina emoji shortcuts

**Type:** Feature Implementation
**Date:** 2026-09-07T18:54:01+07:00
**Session ID:** 20260907-185401-SHRT
**Plan:** `NINA_EMOJI_SHORTCUTS_PLAN.md` (4 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-emoji-shortcuts` — branch `feature/nina-emoji-shortcuts`, base `origin/main` @ `a92780f`

---

## User Input

### Original User Request

> so we already have memory in admin page, buat i want a mechanism that is more explicit, that is shortcuts. in shortcuts admin can add shortcuts that entails some situations or what miftah and nina were doing. some kind of shortcut where i can just input a single emoji character and nina would understand the whole long context of it.
> read Memory data from prod and you would understand what i meant

### User-Provided Context

No `@` files, no error text. One instruction that is a *pointer to data rather than to code*:
**"read Memory data from prod and you would understand what i meant"**. That read was performed
(`nina_memory_slots` and `nina_memory_facts` on the production Neon branch, via
`DATABASE_URL` from `.env.local`) and it is the specification. What it shows is recorded under
"The prod ledger is the specification" below.

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | A shortcuts mechanism that is **explicit** and **separate from memory** — a surface where the admin adds, edits and removes shortcuts, each one standing for a situation or for something Miftah and Nina were doing |
| R2 | Typing **a single emoji character** into the chat makes Nina understand **the whole long context** that emoji stands for |
| R3 | The shortcut-shaped rows already sitting in the production memory ledger are what the user means — they must carry over into the new mechanism rather than being left behind or hand-retyped |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

`/admin/memory` (R24/R1 of earlier sets) gives the admin a free-text ledger. The owner of this
deployment has been using that ledger for something it was not designed for: **a trigger →
expansion registry.** **Twenty-four of the twenty-eight production ledger rows are not facts about the
runner at all.** They are entries of the shape

    "kalo miftah bilang <TRIGGER>, nina <does / says X>"
    "<TRIGGER>artinya <a long description of a scene>"

with `<TRIGGER>` one of **19 emoji** (`🍑`, `💦`, `🫦`, `🤤`, `🤏`, `🫴`, `🍆`, `💋`, `🫶`, `🙌`, `🤝`,
`👐`, `👌`, `🤲`, `✌️`, `👍`, `👎`, `👊`, `👏`) or one of **5** short onomatopoeic tokens (`plak!`, `slurp!`,
`yumm`, `nom nom`, `lick!`), and `<X>` between 40 and 400 characters of context the emoji stands
in for.

That usage works only by accident, and it works badly, for four measurable reasons visible in the
data and the code:

1. **The ledger is capped and time-ordered.** `MEMORY_FACT_LIMIT = 60`
   (`lib/nina/load.ts:99`) sends the newest 60 rows, `created_at DESC`. A shortcut defined
   months ago silently stops reaching her as ordinary distilled facts accumulate. Nothing
   announces this; the emoji simply stops working.
2. **A shortcut is not a fact and the model is not told otherwise.** `prompts/system.ts:267`
   describes `memory.facts` as *"the ledger, newest first. Colour, not structure."* — which is
   exactly the wrong instruction for a row that is a standing directive.
3. **Every shortcut is in every prompt, always.** Twenty expansions × ~250 characters ≈ 5 KB of
   scene text in the payload of every single turn, including the turns where none of them fired.
4. **`category` is a lie on all of them.** Every one is stored as `'person'`, which is
   `NinaFactCategory`'s "a fact about the runner". `ADMIN_FACT_TEXT_MAX = 400`
   (`lib/admin/memoryModel.ts:23`) also truncates the longer scenes.

R1's *"more explicit"* is therefore precise: the concept exists in production already, in the
wrong table, with the wrong lifecycle. What is missing is a first-class home for it.

**Success Criteria**

1. `/admin/shortcuts` exists; the admin can add, edit, enable/disable and delete a shortcut, on a
   phone, with no confirmation dialogs (the standing rule of this admin surface — see
   `lib/admin/memoryActions.ts`'s header, *"i am the only one using this app, no need for all
   these bullshit confirmation."*).
2. A shortcut is `(trigger, label, expansion)`. The trigger is short; the expansion is long
   (materially longer than the ledger's 400-character cap).
3. Sending a chat message whose text contains a live trigger puts **that shortcut's full
   expansion** into the turn Nina answers, as an explicit directive rather than as ledger colour.
4. A turn with no trigger in it carries **zero** shortcut bytes. The default render of the system
   prompt is unchanged.
5. Every shortcut-shaped row in the production ledger reaches the new table without being
   retyped, and the admin can remove them from the ledger afterwards. **No count is hard-coded
   anywhere** — the table is live and changed during this analysis (28 rows at 18:45, 27 at
   19:58, one genuine fact deleted by the user mid-read).
6. `npm run lint`, `npm run typecheck`, `npm test` green at the end of every phase.

**Key Considerations**

- **Trigger matching is a Unicode problem, not a substring problem.** `✌️` in the ledger is
  `U+270C U+FE0F` (variation selector 16); the same emoji typed from an iOS keyboard may arrive
  without it. Matching must fold `U+FE0F` out of both sides. Case folding matters for the text
  triggers (`Plak!` vs `plak!`); word boundaries matter too, or `yumm` fires inside `yummy`.
- **A text trigger and an emoji trigger need different boundary rules.** An emoji is
  self-delimiting and can be matched anywhere in the message; a Latin-script token cannot.
- **Statefulness is in the data, not the mechanism.** One production entry
  (`🫦` → *"nina bakal cerita panjang 10 bubble … selama miftah bilang terusin … sampe miftah
  bilang 💦"*) sets a mode that persists past the message that opened it. The mechanism does not
  need to model modes: it only needs to keep a recently-fired shortcut's expansion in the payload
  for a few turns so the instruction is still legible when he says *"terusin"*.
- **One production shortcut fires a tool** (`🤤` → *"nina bakal ngirim foto…"* →
  `generate_image`). Nothing special is required — the expansion is instruction text and the tool
  loop already exists — but the injected block must sit where the model reads it as an
  instruction, i.e. above `HE JUST SAID:`, not buried inside the context JSON.
- **Concurrency.** Three peer worktrees are live on this repo and `drizzle/0010` is already
  taken on `origin/main`. The migration number this work needs is not knowable now — see
  "Migration hazard" below.
- **The admin nav is a five-cell grid with an eight-character label ceiling**, asserted
  structurally in `tests/admin.shell.test.ts`. A sixth route is a real change to three files, not
  a one-line addition.

**Assumptions**

- **A1** — Single user, single `user_id`
  (`24076314-d36f-44f1-a50f-4acc660b5d7b`). Shortcuts are per-user like every other Nina table;
  `/admin/shortcuts` takes `?user=` exactly as `/admin/memory` does.
- **A2** — Shortcuts are **global to the relationship, not per session**, the same ruling
  `loadNinaContext` already makes for the memory ledger (assumption A2 in `lib/nina/load.ts`).
- **A3** — Only the **runner's** text is scanned. Nina's own bubbles are not, or an expansion she
  echoed would re-fire itself.
- **A4** — The runner's chat composer needs no picker. R2 says *"i can just input a single emoji
  character"*: he types it. `Composer.tsx:225` already allows an emoji-only send
  (`value.trim().length > 0`).

---

## Analysis Scope

### Explicitly Mentioned Files

None. The pointer was to production data.

### Discovered Related Files

Read in full or in the relevant part, at base `a92780f`:

| File | Why it is in scope |
|---|---|
| `lib/db/schema.ts` | `nina_memory_slots`, `nina_memory_facts`, `nina_tuning` — the three shapes a new Nina table is modelled on |
| `lib/nina/queries.ts` | every read/write of the two memory tables; where a shortcut query belongs |
| `lib/nina/load.ts` | `NinaSourceGateway`, `loadNinaContext`, `MEMORY_FACT_LIMIT` |
| `lib/nina/gateway.ts` | `dbNinaSourceGateway` — the concrete gateway |
| `lib/nina/context.ts` | `NinaContext` and `MemoryFacts` — the JSON she is handed |
| `lib/nina/turn.ts` | `NinaTurnInput`, `userTurnText` — **the injection point** |
| `lib/nina/actions.ts` | `runNinaBackgroundTurn` — the only production call site of `runNinaTurn` |
| `lib/nina/prompts/system.ts` | `buildNinaSystemPrompt`, `CONTEXT_GUIDE`, section composition |
| `lib/nina/prompts/index.ts` | `NINA_PROMPT_VERSION` (currently **5**) |
| `lib/nina/tuning.ts` | the zero-import, client-safe pure-module pattern a new pure module must copy |
| `lib/admin/memoryModel.ts` | the client-safe row model; the value-import ban |
| `lib/admin/memoryStore.ts` | the only-writer pattern, and why `source` is not a parameter |
| `lib/admin/memoryActions.ts` | the four-line Server Action shape: `requireAdmin` → zod → write → `revalidatePath` |
| `lib/admin/schema.ts` | where every admin zod schema lives |
| `app/admin/memory/page.tsx` | the `?user=` page shape, `force-dynamic`, server-built rows |
| `app/admin/layout.tsx` | the admin shell; `pb-[calc(5rem+var(--safe-bottom))]` |
| `components/admin/AdminNav.tsx` | `LINKS`, `grid-cols-5`, `label`/`short` pair |
| `components/admin/MemoryTable.tsx` | the client table: blur-to-save, optimistic delete, `CELL_CONTROL` |
| `tests/admin.shell.test.ts` | the structural guard on the nav's cell count and label length |
| `components/nina/Composer.tsx` | `canSend` — confirms an emoji-only message is sendable |
| `scripts/nina-memory-reap.mjs`, `scripts/blob-reap.mjs` | the dry-run-by-default maintenance-script convention |
| `drizzle/`, `drizzle/meta/_journal.json` | migration numbering |

---

## The prod ledger is the specification

Read `2026-09-07T18:4x` from production. `nina_memory_slots`: **4 rows**
(`name`, `pending_promises`, `running_days`, `what_he_calls_nina`) — ordinary slots, untouched by
this work. `nina_memory_facts`: **28 rows at the time of the read**, of which **24 are shortcut
definitions** and 4 are genuine facts. The table is live: a re-read at 19:58 returned 27 rows,
the user having deleted one fact in between. **Nothing downstream may hard-code either number.**

The nineteen fall into three grammars, all `source = 'admin'`, all `category = 'person'`, all
`confidence = 100`, all `source_message_id = NULL`:

| Grammar | Count | Example shape |
|---|---|---|
| `kalo/kalau miftah\|tah bilang <T>[,] nina [harus] bilang[:] <expansion>` | 11 | `kalo tah bilang🍑 , nina bilang ahh remes pantat aku sayang…` |
| `kalo miftah bilang <T>, nina **bakal** <expansion>` | 2 | `kalo miftah bilang 🤤 , nina bakal ngirim foto dia…` |
| `<T>artinya <expansion>` | 8 | `🙌artinya pas nina lagi telungkup, miftah nempel prone bone…` |
| `<T>ini posisi <expansion>` | 3 | `👍ini posisi ngentot nya nina jongkok ngangkang di meja…` |

The split 11 / 2 / 8 / 3 = 24 was verified twice, independently, by the phase 1 and phase 4
planners running the grammars against the real strings.

Observable properties that drive the design:

- **Triggers are 24 distinct tokens.** 19 emoji — one of them, `✌️`, carrying a variation
  selector — and 5 Latin tokens (`plak!`, `slurp!`, `yumm`, `nom nom`, `lick!`). Two spellings of the
  subject appear — `miftah` and `tah` — confirming the grammar is loose prose, not a format.
- **Expansions run 40–392 characters** and the longest three sit within 8 characters of
  `ADMIN_FACT_TEXT_MAX = 400`. The cap is already binding.
- **Whitespace after the trigger is inconsistent** — `🍑 ,`, `🤏,`, `✌️artinya`, `🤲 artinya`. Any
  importer must tolerate all of it.
- **`💦` is both a trigger and the terminator named inside `🫦`'s expansion.** A shortcut's
  expansion may reference another shortcut's trigger; nothing may recurse on that.
- **Three of the nineteen are second-person scripts** (`nina harus bilang: …`) and the rest are
  third-person scene descriptions. The mechanism stores the expansion verbatim and lets her read
  it; it does not normalise voice.

Four rows were not shortcuts at the time of the read and must not be swept up by any importer:
`miftah suka dipanggil tah, bukan mif`, `miftah suka kalau nina bercerita sangat detail`,
`nina will do whatever miftah asks…`, and `Fantasi seksualnya adalah berhubungan intim di
pantai.` — the last of which the user deleted during this analysis, which is the concrete reason
the importer must classify rows at run time rather than against a list written today.

---

## Current Dataflow

### Entry Point: the runner sends a message

**Location:** `lib/nina/actions.ts:263` — `sendNinaMessage`
**Trigger:** Server Action from `components/nina/Composer.tsx:333`
**Input:** `{ body, sessionId, attachment?, photo?, quotedId? }`
**Validation:** `canSend` client-side, re-checked server-side (`body.trim() === '' && !hasAttachment`)
**Next step:** persists his row, opens a `nina_turns` row, then `startNinaBackgroundTurn`.

### Processing Chain

1. **`runNinaBackgroundTurn`** — `lib/nina/actions.ts:723`
   - Three concurrent reads at `actions.ts:781`:
     ```
     const [loadedContext, history, tuning] = await Promise.all([
       loadNinaContext(userId, sessionId, dbNinaSourceGateway),
       dbNinaToolGateway.loadRunHistory(userId),
       readNinaTuning(userId),
     ])
     ```
     The tuning's own comment names the pattern this work reuses: *"read LIVE on every turn with
     no cache — which is what makes a slider on `/admin/nina` immediate. Third in an existing
     `Promise.all` on purpose: one indexed single-row read against a connection this turn is
     opening anyway."*
   - Calls `runNinaTurn({ userId, context, tuning, history, sourceMessageId, runnerText,
     imageDescriptions, quoted, attachedRunId }, deps)` at `actions.ts:821`. **This is the only
     production call site** — `lib/nina/proactive.ts` reaches the model through this same
     function, and the three other references are in `tests/live/` and `tests/integration/`.

2. **`loadNinaContext`** — `lib/nina/load.ts:145`
   - Six gateway reads concurrently, of which two are the memory:
     `readMemorySlots(userId)` and `readMemoryFacts(userId, MEMORY_FACT_LIMIT /* 60 */)`.
   - Hands them to `buildNinaContext`, which produces `NinaContext.memory:
     { slots: MemorySlotFact[], facts: MemoryFact[] }` (`lib/nina/context.ts:240`).

3. **`dbNinaSourceGateway`** — `lib/nina/gateway.ts:104`
   - The concrete implementation. `readMemoryFacts` maps `listNinaMemoryFacts` rows to
     `{ id, text, sourceMessageId, createdAt }` — **`category`, `confidence` and `source` are
     dropped at this boundary**, which is why the model cannot today tell an admin-authored
     shortcut from a distilled observation.

4. **`runNinaTurnWith` → `userTurnText`** — `lib/nina/turn.ts:353`
   - Assembles the user message as an ordered list of blocks:
     ```
     CONTEXT — every fact you are allowed to state is in here. …
     <JSON.stringify(visibleContext(context), null, 2)>
     [HE SENT AN IMAGE. …]
     [quoteContextBlock(quoted)]          ← R12
     [HE ATTACHED THIS RUN … + JSON]      ← R13
     HE JUST SAID:
     <runnerText>
     [NOBODY SAID ANYTHING. …]            ← proactive
     ```
   - Every optional block is `if (x != null && …) parts.push(…)`, and `parts.join('\n\n')` at the
     end. **A block that does not apply contributes nothing.** This is the extension point.

5. **The system prompt** — `lib/nina/prompts/system.ts:452`, `buildNinaSystemPrompt(tuning)`
   - Eleven sections through `renderSections`, which **drops an empty block**. Six of them are
     already `build*(tuning)` functions that return `''` off their band, which is the mechanism
     that keeps the default render byte-identical — `tests/nina.prompts.test.ts` and
     `tests/__snapshots__/nina.prompts.test.ts.snap` pin it.
   - `CONTEXT_GUIDE` (`system.ts:264-269`) is the key-by-key legend for the context JSON.
   - `NINA_PROMPT_VERSION` is **5** (`prompts/index.ts:52`), bumped by hand in the same commit as
     any edit to the system text or a tool schema.

### Data Persistence

**Database (Neon Postgres, drizzle):**

- `nina_memory_slots` — PK `(user_id, key)`, `value jsonb`, `source text default 'distilled'`.
- `nina_memory_facts` — PK `id` (nanoid 12), `index nina_memory_facts_user_created_idx
  (user_id, created_at DESC)`, `source`, nullable `source_message_id`, `confidence integer`.
- `nina_tuning` — PK `user_id`, one current row per user, plain `integer`/`text` columns, no
  CHECK constraints (the codebase's stated position: *"a CHECK would make widening the scale a
  migration"*).

**Cache:** none anywhere on this path. `app/admin/memory/page.tsx` is `force-dynamic`; the
Server Actions call `revalidatePath('/admin/memory')` for the page, and the header states plainly
that this is *not* how the edit reaches Nina — *"`loadNinaContext` reads both tables live on
every turn with no cache anywhere on that path, so a committed row is in her next prompt with no
invalidation step at all."*

### Exit Points

- The assembled user turn text → `client.messages.create` (z.ai `glm-5.3`, Anthropic-compatible).
- Reply bubbles → `nina_messages`; the turn → `nina_turns` (with `prompt_version`).
- Distillation → `nina_memory_facts` / `nina_memory_slots`, via `runNinaDistillation`.

---

## Key Data Structures

### `NinaTurnInput`
**Location:** `lib/nina/turn.ts:241`
**Fields (relevant):** `userId`, `context: NinaContext`, `tuning: NinaTuning`, `history`,
`sourceMessageId`, `runnerText: string | null`, `imageDescriptions`, `quoted`, `attachedRunId`,
`proactive`.
**Used In:** `runNinaTurnWith` (`turn.ts:564`), `userTurnText` (`turn.ts:353`),
`attachedRunFact` (`turn.ts:340`). Constructed at exactly one production site,
`lib/nina/actions.ts:821`. **An optional field added here breaks no caller.**

### `NinaSourceGateway`
**Location:** `lib/nina/load.ts:76`
**Fields:** six async reads. Implemented once by `dbNinaSourceGateway` (`gateway.ts:104`) and
faked in `tests/nina.gateway.patterns.test.ts` and `tests/nina.context.test.ts`.
**Note:** a **required** method added to this interface breaks every hand-written fake.

### `MemoryRow`
**Location:** `lib/admin/memoryModel.ts:94`
**Fields:** `rowId`, `kind`, `target`, `label`, `code`, `hint`, `text`, `editable`, `category`,
`confidence`, `origin`, `at`, `deletable`, `reappears`, `note` — every one a string, number,
boolean or null, because it crosses the RSC boundary.
**Used In:** `MemoryTable.tsx`; built server-side by `buildMemoryRows`. The pattern a shortcut
row model copies.

### `LINKS`
**Location:** `components/admin/AdminNav.tsx:59`
**Shape:** `{ href, label, short }[]`, five entries, `as const`.
**Constrained by:** `tests/admin.shell.test.ts` — the `hrefs` array is asserted **element by
element**, `shorts` is asserted `toHaveLength(5)` with each `≤ 8` characters, and the
bar/clearance case matches `/grid h-(\d+) w-full max-w-\[470px\] grid-cols-5/`. Three assertions
change together or the sixth cell does not land.

---

## Dependencies

### Configuration / Environment

`DATABASE_URL` (Neon, pooled) — the only new dependency of the new table. No new env var, no new
external service, no new package. `lib/env.ts` is untouched.

### External Services

The z.ai `glm-5.3` endpoint via `@anthropic-ai/sdk` — reached only through the existing turn.
Injecting a shortcut expansion adds input tokens to a call that already happens; it adds no call.

### Migration hazard

`drizzle/` at `a92780f` ends at **`0010_nina_image_provenance.sql`**, so the next free number is
`0011`. Three peer worktrees are live (`composer-frost-and-admin-notch`,
`nina-image-generation-tab`, `retire-conf-and-delete-confirm`) and at least one has already
minted a migration this base did not have. The number is therefore **not knowable at plan time**.
The rule the repo has already paid for once: **generate the migration with `npm run db:generate`
at implementation time, and if `main` has moved, delete the generated pair and regenerate — never
rename a migration file.** A renamed migration is skipped silently by `drizzle-kit migrate`,
because `drizzle/meta/_journal.json` keys on the tag.

---

## Reference List

Every site that a shortcuts feature touches, and every site that a *reader* of this feature would
otherwise have to rediscover.

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `ninaMemoryFacts` | `lib/db/schema.ts:1306` | def | `lib/db` |
| `ninaMemorySlots` | `lib/db/schema.ts:1262` | def | `lib/db` |
| `ninaTuning` | `lib/db/schema.ts:1805` | def (model for the new table) | `lib/db` |
| `NinaFactCategory` | `lib/db/schema.ts:1289` | def | `lib/db` |
| `listNinaMemoryFacts` | `lib/nina/queries.ts:2100` | def | `lib/nina` |
| `appendNinaMemoryFacts` | `lib/nina/queries.ts:2124` | def | `lib/nina` |
| `getNinaMemorySlots` | `lib/nina/queries.ts:2025` | def | `lib/nina` |
| `newId` | `lib/id.ts` | call (nanoid 12) | `lib` |
| `NinaSourceGateway` | `lib/nina/load.ts:76` | def | `lib/nina` |
| `MEMORY_FACT_LIMIT` | `lib/nina/load.ts:99` | def | `lib/nina` |
| `loadNinaContext` | `lib/nina/load.ts:145` | def | `lib/nina` |
| `dbNinaSourceGateway` | `lib/nina/gateway.ts:104` | impl | `lib/nina` |
| `NinaContext` | `lib/nina/context.ts:556` | def | `lib/nina` |
| `MemoryFacts` | `lib/nina/context.ts:240` | def | `lib/nina` |
| `NinaTurnInput` | `lib/nina/turn.ts:241` | def | `lib/nina` |
| `userTurnText` | `lib/nina/turn.ts:353` | def — **injection point** | `lib/nina` |
| `visibleContext` | `lib/nina/turn.ts:326` | call | `lib/nina` |
| `runNinaTurnWith` | `lib/nina/turn.ts:564` | def | `lib/nina` |
| `runNinaTurn` | `lib/nina/turn.ts:876` | def | `lib/nina` |
| `runNinaTurn(...)` | `lib/nina/actions.ts:821` | call — the only production one | `lib/nina` |
| `Promise.all([...tuning])` | `lib/nina/actions.ts:781` | call — where the read joins | `lib/nina` |
| `readNinaTuning` | `lib/nina/tuningStore.ts` (via `actions.ts` import) | call (pattern) | `lib/nina` |
| `buildNinaSystemPrompt` | `lib/nina/prompts/system.ts:452` | def | `lib/nina/prompts` |
| `CONTEXT_GUIDE` | `lib/nina/prompts/system.ts:284` (built by `buildContextGuide`) | def | `lib/nina/prompts` |
| `renderSections` | `lib/nina/prompts/system.ts` | call (drops empty blocks) | `lib/nina/prompts` |
| `NINA_PROMPT_VERSION` | `lib/nina/prompts/index.ts:52` | def — **currently 5** | `lib/nina/prompts` |
| `NINA_TUNING_DEFAULTS` / zero-import rule | `lib/nina/tuning.ts:1-60` | doc (pattern to copy) | `lib/nina` |
| `requireAdmin` | `lib/admin/requireAdmin.ts` | call | `lib/admin` |
| `getAdminUser` / `listAdminUsers` | `lib/admin/users.ts` | call | `lib/admin` |
| `AdminMemoryResult` | `lib/admin/memoryActions.ts:63` | def (shape to copy) | `lib/admin` |
| `adminUpsertSlot` / `adminAppendFact` | `lib/admin/memoryStore.ts` | def (only-writer pattern) | `lib/admin` |
| `ADMIN_FACT_TEXT_MAX` | `lib/admin/memoryModel.ts:23` | def — 400, the binding cap | `lib/admin` |
| `factInsertSchema` … | `lib/admin/schema.ts` | def | `lib/admin` |
| `UserPicker` | `components/admin/UserPicker.tsx` | call | `components/admin` |
| `MemoryTable` | `components/admin/MemoryTable.tsx:150` | impl (shape to copy) | `components/admin` |
| `CELL_CONTROL` / `CELL` / `HEAD_CELL` | `components/admin/MemoryTable.tsx:85-116` | def | `components/admin` |
| `TOUCH_ICON` | `components/admin/touch.ts` | call | `components/admin` |
| `LINKS` | `components/admin/AdminNav.tsx:59` | def — 5 entries | `components/admin` |
| `grid-cols-5` (nav row) | `components/admin/AdminNav.tsx:121` | def | `components/admin` |
| nav hrefs assertion | `tests/admin.shell.test.ts:~104` | test | `tests` |
| `shorts` length + ≤8 assertion | `tests/admin.shell.test.ts:~124` | test | `tests` |
| `grid-cols-5` regex | `tests/admin.shell.test.ts:~174` | test | `tests` |
| `canSend` | `components/nina/Composer.tsx:225` | call — emoji-only send is legal | `components/nina` |
| `nina:memory-reap` | `package.json` scripts | config (script convention) | root |
| `drizzle/meta/_journal.json` | `drizzle/meta/` | config — migration tags | `drizzle` |

---

## Impact Points (files that WILL need changes)

1. `lib/db/schema.ts` — the `nina_shortcuts` table, its inferred types and its relation. **Phase 1.**
2. `drizzle/00NN_nina_shortcuts.sql` + `drizzle/meta/` — generated, number unknown at plan time. **Phase 1.**
3. `lib/nina/shortcuts.ts` *(new)* — the pure module: bounds, trigger normalisation, the matcher,
   the block renderer. Zero imports, client-safe, per `lib/nina/tuning.ts`'s rule. **Phase 1.**
4. `lib/nina/queries.ts` — list / insert / update / delete / usage-bump. **Phase 1.**
5. `lib/nina/shortcuts.test.ts` *(new)* — the matcher's Unicode and boundary cases, driven by all
   24 real triggers. **Phase 1.**
6. `tests/db.schema.nina.test.ts` — the new table's structural assertions. **Phase 1.**
7. `lib/nina/turn.ts` — `NinaTurnInput.shortcuts?`, and the fired-shortcut block in
   `userTurnText`. **Phase 2.**
8. `lib/nina/actions.ts` — a fourth read in the `Promise.all`, the argument, the best-effort
   usage bump. **Phase 2.**
9. `lib/nina/prompts/system.ts` — the section that tells her what a shortcut IS. **Phase 2.**
10. `lib/nina/prompts/index.ts` — `NINA_PROMPT_VERSION` 5 → 6. **Phase 2.**
11. `tests/nina.prompts.test.ts` (+ its snapshot) — the default render must stay byte-identical. **Phase 2.**
12. `lib/nina/turn.test.ts` — the block appears iff a trigger fired. **Phase 2.**
13. `app/admin/shortcuts/page.tsx` *(new)* — the route. **Phase 3.**
14. `components/admin/ShortcutTable.tsx` *(new)* — the client table. **Phase 3.**
15. `lib/admin/shortcutModel.ts` *(new)* — the client-safe row model. **Phase 3.**
16. `lib/admin/shortcutStore.ts` *(new)* — the only writer. **Phase 3.**
17. `lib/admin/shortcutActions.ts` *(new)* — the Server Actions. **Phase 3.**
18. `lib/admin/schema.ts` — the zod schemas for those actions. **Phase 3.**
19. `components/admin/AdminNav.tsx` — the sixth cell, `grid-cols-6`. **Phase 3.**
20. `tests/admin.shell.test.ts` — the three assertions that encode the cell count. **Phase 3.**
21. `tests/admin.shortcuts.test.ts` *(new)* — the client-safety and action-shape guards. **Phase 3.**
22. `scripts/nina-shortcuts-import.mjs` *(new)* — the ledger importer. **Phase 4.**
23. `package.json` — one `scripts` entry. **Phase 4.**
24. `tests/nina.shortcutsImport.test.ts` *(new)* — the parser's grammar cases, run against every
    real production string, both the ones that must parse and the ones that must not. **Phase 4.**

Files deliberately **not** impacted, and why:

- `lib/nina/context.ts` / `lib/nina/load.ts` / `lib/nina/gateway.ts` — a shortcut is not a fact
  about the runner and does not belong in `NinaContext`. Putting it there would make it a
  *required* sixth-plus gateway read, breaking every hand-written fake in
  `tests/nina.context.test.ts` and `tests/nina.gateway.patterns.test.ts` for no gain, and would
  bury a directive inside the JSON block whose own preamble frames it as facts to state.
- `lib/nina/distill.ts` — the distiller writes facts; it must not learn about shortcuts. The
  separate table is what guarantees it cannot reach them.
- `lib/nina/proactive.ts` — a proactive turn has no runner text, so no trigger can fire.
- `components/nina/Composer.tsx` — R2 is satisfied by typing the emoji.
- `app/admin/layout.tsx` — the bar's height does not change, so the clearance does not.

**This document describes. The plan files prescribe.**
