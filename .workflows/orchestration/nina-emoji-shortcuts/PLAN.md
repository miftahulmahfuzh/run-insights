# Plan: Nina emoji shortcuts

**Slug:** nina-emoji-shortcuts
**Date:** 2026-09-07T18:54:01+07:00
**Analysis:** `20260907-185401-SHRT_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-emoji-shortcuts`
**Branch:** `feature/nina-emoji-shortcuts` (base: `origin/main` @ `5ed3b76` — rebased from the planned base `a92780f` during phase 1, which moved the migration to `0012`; the local `main` ref is stale and divergent, so merge from `origin/main`)
**Phases:** 4
**Status:** phase 1/4 complete — phase 1 landed on `feature/nina-emoji-shortcuts`; phases 2, 3 and 4 are unblocked and may run concurrently (each depends only on 1). A phase is complete when its row in the Phases table is ticked ✅. The set is reviewed and merged as a whole.
**Coordinator:** —

---

## Why

The user's rationale, verbatim:

> so we already have memory in admin page, buat i want a mechanism that is more explicit, that is shortcuts. in shortcuts admin can add shortcuts that entails some situations or what miftah and nina were doing. some kind of shortcut where i can just input a single emoji character and nina would understand the whole long context of it.
> read Memory data from prod and you would understand what i meant

And what the production read showed, because *"read Memory data from prod and you would
understand what i meant"* is the other half of the specification. `nina_memory_facts` held 28
rows for the single user at 18:45; **24 of them are already shortcuts**, written by hand into the
ledger in four prose grammars:

    kalo|kalau miftah|tah bilang <T> [,] nina [harus] bilang [:] <expansion>    (11)
    kalo miftah bilang <T> , nina bakal <expansion>                              (2)
    <T>artinya <expansion>                                                       (8)
    <T>ini posisi <expansion>                                                    (3)

24 distinct triggers — 19 emoji (one of them `✌️`, carrying a `U+FE0F` variation selector) and
5 Latin tokens (`plak!`, `slurp!`, `yumm`, `nom nom`, `lick!`) — with expansions of 40 to 392
characters. **The 24 / 11-2-8-3 split was verified twice, independently, by the phase 1 and
phase 4 planners running the grammars against the real strings.** The table is live and moved
during analysis (27 rows at 19:58, one fact deleted by the user), so **no count is hard-coded
in any phase** — every phase classifies at run time.

The feature already exists in the user's head and in his data. It exists nowhere in
the code, which is why it is capped at the newest 60 ledger rows, described to the model as
*"colour, not structure"*, truncated at 400 characters, mislabelled `category: 'person'`, and
sent in full on every turn whether or not he used one.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | An explicit shortcuts mechanism, separate from memory: an admin surface to add, edit, disable and remove shortcuts, each standing for a situation or for something Miftah and Nina were doing | 1, 3 |
| R2 | Typing a single emoji character in the chat makes Nina understand the whole long context that emoji stands for | 1, 2 |
| R3 | The shortcut-shaped rows already in the production memory ledger carry over into the new mechanism instead of being retyped | 1, 4 |

**Phase 1 serves all three, and that coupling is real rather than sloppy decomposition:** one
table and one matcher are what phases 2, 3 and 4 each build against, and splitting the schema
three ways would produce three migrations of one table.

This table is **final, after reconciliation** — it is what `create-task` reads to shape the board's
cards, and it matches the four plans' `Satisfies` lines rather than the draft's. No requirement id
moved between phases during reconciliation: every conflict resolved was about a signature, an
ownership boundary or a figure, and none of them relocated work across a phase line. No `R` is
unowned.

## Scope

**In scope**

- A new table, `nina_shortcuts`, per user: `trigger`, `label`, `expansion`, `enabled`, plus usage
  telemetry (`uses`, `last_used_at`) so the admin can see which codes actually fire.
- A pure, zero-import matcher module, `lib/nina/shortcuts.ts`, that folds Unicode variation
  selectors, case, and whitespace, and applies a different boundary rule to glyph triggers than
  to word triggers.
- Injection of a **fired** shortcut's full expansion into the user turn, immediately above
  `HE JUST SAID:`, as an explicit directive.
- `/admin/shortcuts` — a sixth admin route, a table of shortcuts, add / edit / toggle / delete,
  no confirmations, phone-first.
- `scripts/nina-shortcuts-import.mjs` — a dry-run-by-default importer that lifts every existing
  shortcut-shaped ledger row into the new table and, with `--apply --prune`, removes them from the
  ledger. It classifies at run time and hard-codes no count, and it **imports**
  `normalizeNinaTrigger` / `classifyNinaTrigger` from `lib/nina/shortcuts.ts` under
  `--experimental-strip-types` rather than reimplementing them — so the key it writes is computed
  by the same function the matcher compares against, and the drift class is eliminated rather than
  tested for. See invariant 4.

**Out of scope, and why**

- **`NinaContext` / `lib/nina/load.ts` / `lib/nina/gateway.ts` are not touched.** A shortcut is
  not a fact about the runner. Putting it in the context JSON would make it a required seventh
  gateway read — breaking every hand-written fake in `tests/nina.context.test.ts` and
  `tests/nina.gateway.patterns.test.ts` — and would bury a standing directive inside a block
  whose own preamble frames its contents as *"every fact you are allowed to state"*.
- **`lib/nina/prompts/system.ts` is not edited, and the prompt snapshot does not move.** Every
  word of instruction a shortcut needs travels with the shortcut, in the user turn, where it is
  adjacent to the expansion it governs. A permanent system-prompt section would cost bytes on
  every turn including the ones where nothing fired — the exact defect this plan set exists to
  remove. `NINA_PROMPT_VERSION` is still bumped 5 → 6, because `lib/nina/turn.ts:186` already
  records that the constant *"identifies the ASSEMBLER, not the output"*, and `userTurnText` is
  the assembler.
- **`lib/nina/distill.ts` is not touched.** The distiller writes facts and must stay unable to
  reach a shortcut; a separate table is what guarantees that structurally, at no cost.
- **`components/nina/Composer.tsx` is not touched.** No shortcut picker, no palette. R2 is
  *"i can just input a single emoji character"* — he types it, and `canSend` already accepts an
  emoji-only message (`Composer.tsx:225`).
- **`lib/nina/proactive.ts` is not touched.** A proactive turn has no runner text, so nothing can
  fire.

## Invariants

1. **The tree builds and `npm run lint && npm run typecheck && npm test` pass at the end of every
   phase.** No phase leaves the next one a broken tree.
2. **A turn in which no trigger fired carries zero shortcut bytes.** No block, no empty header,
   no `"shortcuts": []` anywhere in the payload. Asserted, not intended.
3. **`buildNinaSystemPrompt`'s output is byte-identical to `a92780f` for every tuning.**
   `tests/__snapshots__/nina.prompts.test.ts.snap` is not regenerated by any phase.
4. **`lib/nina/shortcuts.ts` has zero imports** — no value import, no type import, no
   `server-only`, nothing from `@/lib/db/*`. `lib/nina/tuning.ts`'s rule, and it is **load-bearing
   for two consumers, not one**:
   - phase 3's `'use client'` `ShortcutTable.tsx` needs the three length bounds in the browser
     (it reaches them through `lib/admin/shortcutModel.ts`'s re-export, but the property it rests
     on is this one);
   - **phase 4's `scripts/nina-shortcuts-import.mjs` imports this module directly** under
     `--experimental-strip-types`, so the importer's `match_key` is computed by literally the same
     function the matcher compares against. `scripts/nina-memory-reap.mjs`'s header records the one
     case where a `.mjs` cannot import a `.ts` — a module whose own imports are runtime values
     rather than `import type` — and zero imports is exactly what keeps this module out of it.

   So a value import added here does not merely fatten a bundle: **it stops phase 4's script
   booting.** Asserted three times — phase 1 reads the file's own source (as
   `tests/nina.tuning.test.ts` does), phase 3 re-asserts it in `tests/admin.shortcuts.test.ts`
   because its re-export depends on it, and phase 4's `expect(scriptNormalize).toBe(normalizeNinaTrigger)`
   fails the moment the import becomes a copy.
5. **Every admin write is `requireAdmin()` → zod → the store module → `revalidatePath`, in that
   order**, and every SQL statement is `user_id`-scoped first. `lib/admin/memoryActions.ts`'s
   four-line rule.
6. **No confirmation dialogs, no typed-word gates, no two-step flows** on `/admin/shortcuts`.
   The standing ruling of this admin surface: *"i am the only one using this app, no need for all
   these bullshit confirmation."*
7. **Nothing on the turn path may throw for a shortcut problem.** A malformed trigger, an
   unreadable row, or a failed usage bump degrades to "no shortcut fired" and the turn proceeds.
8. **`source_message_id` and the memory tables are untouched by phases 1–3.** Only phase 4's
   importer deletes ledger rows, only under `--prune`, and only rows it has already written into
   `nina_shortcuts`.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The table and the matcher | R1, R2, R3 | `lib/db`, `lib/nina` | 8 | — | NORMAL | `.workflows/plan/nina-emoji-shortcuts/phase-1.md` | `P1-DB-A004` | — |
| 2 | Firing a shortcut into the turn | R2 | `lib/nina` | 5 | 1 | HARD | `.workflows/plan/nina-emoji-shortcuts/phase-2.md` | `P1-NIN-A023` | — |
| 3 | `/admin/shortcuts` | R1 | `lib/admin`, `components/admin`, `app/admin` | 10 | 1 | HARD | `.workflows/plan/nina-emoji-shortcuts/phase-3.md` | `P1-ADM-A001` | — |
| 4 | Import the ledger's shortcuts | R3 | `scripts` | 3 | 1 | NORMAL | `.workflows/plan/nina-emoji-shortcuts/phase-4.md` | `P1-SC-A000` | — |

Phase 1's 8 include the three generated `drizzle/` artefacts — the `.sql`, the `meta/*_snapshot.json`
and the `meta/_journal.json` diff — which are committed together or not at all.

Phases 2, 3 and 4 share no file and no edge. They run concurrently once phase 1 lands.

### Phase 1 — The table and the matcher

**Satisfies:** R1, R2, R3
**Owns:**

- `lib/db/schema.ts` — the `ninaShortcuts` `pgTable`, its two indexes, its inferred types and its
  `relations` entry, placed beside `ninaMemoryFacts` (`lib/db/schema.ts:1306`).
- The generated migration pair under `drizzle/` and `drizzle/meta/`.
- `lib/nina/shortcuts.ts` *(new)* — the pure module: bounds, `normalizeNinaTrigger`,
  `classifyNinaTrigger`, `matchNinaShortcuts`, `renderNinaShortcutBlock`. **Zero imports.**
- `lib/nina/queries.ts` — `listNinaShortcuts`, `insertNinaShortcut`, `updateNinaShortcut`,
  `deleteNinaShortcut`, `bumpNinaShortcutUses`.
- `lib/nina/shortcuts.test.ts` *(new)* — the matcher, driven by the real production triggers as a
  fixture (24 at the time of the read; no count is asserted).
- `tests/db.schema.nina.test.ts` — the new table's structural assertions.

Eight files: the four above, plus the three generated `drizzle/` artefacts and `lib/db/schema.ts`.

**Does not touch:** `turn.ts`, `actions.ts`, any prompt file, anything under `lib/admin/`,
`components/`, `app/`, or `scripts/`.

**The contract phases 2, 3 and 4 build against — this is the interface, and it is fixed here:**

```
nina_shortcuts
  id            text primary key                  -- newId(), nanoid 12
  user_id       text not null -> users.id cascade
  trigger       text not null                     -- as the admin typed it; what the table renders
  match_key     text not null                     -- normalizeNinaTrigger(trigger); what matching uses
  kind          text not null                     -- 'glyph' | 'word'; decides the boundary rule
  label         text not null                     -- one line, what this code is for
  expansion     text not null                     -- the long context
  enabled       boolean not null default true
  uses          integer not null default 0
  last_used_at  timestamptz
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()   -- $onUpdate, and written explicitly on upsert
  unique index nina_shortcuts_user_match_unq  (user_id, match_key)
  index        nina_shortcuts_user_enabled_idx (user_id, enabled)
```

Bounds, exported from `lib/nina/shortcuts.ts`:

| Constant | Value | Why |
|---|---|---|
| `NINA_TRIGGER_MAX` | 16 | the longest real trigger is `nom nom` (7); 16 leaves room for a ZWJ emoji sequence |
| `NINA_SHORTCUT_LABEL_MAX` | 80 | one line in a phone table cell |
| `NINA_SHORTCUT_EXPANSION_MAX` | 2000 | `NINA_NOTES_MAX`'s number; 5× the ledger cap that is currently binding |
| `NINA_SHORTCUT_MAX_FIRED` | 4 | fired + still-in-play, combined |
| `NINA_SHORTCUT_LOOKBACK` | 6 | how many earlier runner messages are scanned for still-in-play |
| `NINA_SHORTCUT_BLOCK_MAX_CHARS` | 5000 | hard ceiling on the rendered block, after the count cap |

Function signatures, fixed — `lib/nina/shortcuts.ts` (zero imports):

```ts
normalizeNinaTrigger(raw: string): string
classifyNinaTrigger(normalized: string): NinaShortcutKind          // 'glyph' | 'word'
matchNinaShortcuts(input: {
  shortcuts: readonly NinaShortcutMatchable[]   // { id, trigger, matchKey, kind, label, expansion, enabled }
  current: string | null                        // the runner's message this turn
  recent?: readonly string[]                    // earlier RUNNER messages, newest first, already sliced
}): NinaShortcutHits                            // { fired: NinaShortcutHit[]; inPlay: NinaShortcutHit[] }
renderNinaShortcutBlock(hits: NinaShortcutHits | null | undefined): string | null
```

**`renderNinaShortcutBlock` returns `null` only when BOTH lists are empty — not when `fired` alone
is.** An in-play-only hit renders, under its own STILL IN PLAY header, because `🫦`'s production
expansion opens a mode that runs *"sampe miftah bilang 💦"* and the instruction has to survive the
turn where he only says "terusin". (The draft index said *"null when nothing fired"*; that was the
drift that sent phase 2's invariant-2 test after the wrong condition.)

Function signatures, fixed — `lib/nina/queries.ts`. **Phase 1 owns this file and these shapes are
the authority for phases 2, 3 and 4:**

```ts
interface NinaShortcutRecord {                  // a structural SUPERSET of NinaShortcutMatchable,
  id: string                                    // so it is assignable with NO mapping step
  trigger: string
  matchKey: string
  kind: NinaShortcutKind
  label: string
  expansion: string
  enabled: boolean
  uses: number
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
interface NinaShortcutInsert { trigger; label; expansion; enabled? }   // NO matchKey, NO kind
interface NinaShortcutPatch  { trigger?; label?; expansion?; enabled? } // NO matchKey, NO kind

listNinaShortcuts(userId, opts?: { onlyEnabled?: boolean }): Promise<NinaShortcutRecord[]>
insertNinaShortcut(userId, input: NinaShortcutInsert): Promise<NinaShortcutRecord>   // THROWS 23505
updateNinaShortcut(userId, id, patch: NinaShortcutPatch): Promise<NinaShortcutRecord | null>
deleteNinaShortcut(userId, id): Promise<boolean>
bumpNinaShortcutUses(userId, ids: readonly string[]): Promise<void>
```

Three things about that block are load-bearing, and each of them was got wrong by a draft phase:

1. **`match_key` and `kind` are derived INSIDE this layer**, from `trigger`, by one private
   `derivedTrigger`. The input types have no field to put them in, so *"a caller cannot mislabel a
   row because there is nowhere to put the label"* is enforced by the compiler. No caller computes
   them, and `lib/admin/shortcutStore.ts` does not import `classifyNinaTrigger` at all.
2. **A duplicate THROWS** — `(user_id, match_key)` is the authority and a check-then-write races
   itself. Phase 3 catches the 23505 with `isUniqueViolation`; phase 4 writes its own
   `on conflict … do nothing` statement because it wants the opposite behaviour on a re-run.
3. **Bare `listNinaShortcuts(userId)` returns every row, disabled included, with the telemetry
   columns on it.** `{ onlyEnabled: true }` is the turn path's narrowing — the read
   `nina_shortcuts_user_enabled_idx` exists for. `/admin/shortcuts` passes nothing and writes no
   `SELECT` of its own.

**Normalisation is exactly this, and phase 4 must use the same function:** `NFC`, remove every
`U+FE0F`, collapse internal whitespace runs to one space, trim, lowercase. **`U+200D` (ZWJ) is
kept** — it is meaningful inside emoji sequences and stripping it would merge distinct glyphs.

**Matching:** a `'glyph'` trigger matches anywhere in the normalised haystack. A `'word'` trigger
matches only when not adjacent to a letter or digit on either side (`(?<![\p{L}\p{N}])` /
`(?![\p{L}\p{N}])`), so `yumm` does not fire inside `yummy`. Disabled rows are filtered before
matching. `fired` is ordered by first index of occurrence in `current`; `inPlay` is what matched
in `recent` and **not** in `current`, newest first; the combined list is truncated to
`NINA_SHORTCUT_MAX_FIRED` with `fired` taking every slot it needs first.

**Exit criteria:** `npm run db:generate` has produced a migration, `npm run db:check` passes, the
matcher's test file drives every real production trigger in its fixture plus the `✌️`/`✌`
variation-selector pair, `yummy`, `Plak!`, `nomnom`, a disabled row, an empty message and a null
message, and `npm test` is green. **No count is asserted anywhere** — the fixture is a fixture.

**Migration hazard — read this before running `db:generate`.** `drizzle/` at this base ends at
`0010_nina_image_provenance.sql` and three peer worktrees are live on this repo. If `main` has
moved by the time this phase runs, **delete the generated `.sql` and its
`drizzle/meta/*_snapshot.json`, `git checkout` `drizzle/meta/_journal.json`, rebase, and
regenerate.** Never rename a migration file: `drizzle-kit migrate` keys on the journal's tag and
a renamed file is skipped in silence.

### Phase 2 — Firing a shortcut into the turn

**Satisfies:** R2
**Owns:**

- `lib/nina/turn.ts` — an **optional** `shortcuts?: readonly NinaShortcutMatchable[]` and
  `recentRunnerTexts?: readonly string[]` on `NinaTurnInput`; a **required**
  `firedShortcutIds: readonly string[]` on `NinaTurnResult`; the module-private `shortcutHits` /
  `shortcutBlock` helpers; the second parameter on the module-private
  `userTurnText(input, hits)`; and the fired-shortcut block, pushed **after** the attached-run
  block and **immediately before** `'HE JUST SAID:'`. The matcher runs **exactly once per turn**,
  in `runNinaTurnWith`, and feeds both the block and `firedShortcutIds`.
- `lib/nina/actions.ts` — a fourth entry in the `Promise.all` at `actions.ts:781`
  (`listNinaShortcuts(userId, { onlyEnabled: true })`, its rejection swallowed), the
  `recentRunnerTexts` derivation from the already-loaded window, the two new arguments at the
  `runNinaTurn` call at `actions.ts:821`, and a best-effort `bumpNinaShortcutUses` after the turn
  returns.
- `lib/nina/prompts/index.ts` — `NINA_PROMPT_VERSION` 5 → 6, with the reason in the existing
  numbered-comment format. **The set's single bump.**
- `lib/nina/turn.test.ts` — the block appears iff something fired *or is still in play*; it is
  absent otherwise, asserted three ways against a baseline built with the fields absent.
- `tests/nina.resend.test.ts` — three lines: two entries in the `@/lib/nina/queries` mock factory
  (which is a *factory*, so a missing name is an import error) and `firedShortcutIds: []` on the
  `runNinaTurn` mock, which the drained background turn reads. **Assigned here at reconciliation;
  the draft index assigned it to nobody.**

Five files.

**Does not touch:** `lib/nina/prompts/system.ts`, `lib/nina/context.ts`, `lib/nina/load.ts`,
`lib/nina/gateway.ts`, `lib/db/schema.ts`, `lib/nina/queries.ts`, `lib/nina/shortcuts.ts`,
anything under `lib/admin/`, `components/`, `app/` or `scripts/`. **The snapshot file is not
regenerated.** `tests/nina.prompts.test.ts` is **not** touched either — its only version assertion
is `>= 3` and `6` satisfies it, so the draft index's conditional entry is withdrawn rather than
carried as a maybe.

**Why the optional fields are optional:** `runNinaTurn` has exactly one production call site
(`actions.ts:821`) but three in `tests/live/` and `tests/integration/`. An optional field breaks
none of them and no test fixture has to be rewritten to land a feature they do not exercise.

**Where the recent runner texts come from:** `loadedContext.conversation.window`, already loaded
and already in memory — filter to the runner's own turns, take the newest
`NINA_SHORTCUT_LOOKBACK`, excluding the message this turn is answering. **No new query.**

**The usage bump is fire-and-forget and never fails a turn.** One `UPDATE … WHERE user_id = $1
AND id = ANY($2)`, wrapped so a rejection is logged and swallowed — invariant 7.

**Exit criteria:** a turn whose text contains `🍑` puts that whole expansion in `userTurnText`,
after the attached-run block and before `HE JUST SAID:`, with `firedShortcutIds === ['<that id>']`;
a turn that matches **neither in `runnerText` nor in `recentRunnerTexts`** produces a `userTurnText`
byte-identical to today's; a turn that matches only in `recentRunnerTexts` DOES carry the block,
under its STILL IN PLAY header, with `firedShortcutIds` still `[]`; `NINA_PROMPT_VERSION === 6`; the
prompt snapshot is unmodified in `git status`; `npm test` green.

### Phase 3 — `/admin/shortcuts`

**Satisfies:** R1
**Owns:**

- `app/admin/shortcuts/page.tsx` *(new)* — `force-dynamic`, `requireAdmin()`, `?user=` with the
  signed-in admin as the default, `UserPicker`, rows built **server-side**.
- `lib/admin/shortcutModel.ts` *(new)* — the client-safe row model, and **the one door** the three
  length bounds come through. `lib/admin/memoryModel.ts`'s value-import ban with **one argued
  exception**: a single `export { … } from '@/lib/nina/shortcuts'` re-export, so that
  `ShortcutTable.tsx` names no `@/lib/nina/` specifier at all and the boundary is one file wide
  and testable. (The draft index said "zero value imports"; that is one re-export, deliberately —
  see phase 3's Step 1.)
- `lib/admin/shortcutStore.ts` *(new)* — `'server-only'`, the only `lib/admin` module that writes a
  shortcut. It reaches **no drizzle table and no `db` handle**: every statement is
  `lib/nina/queries.ts`'s. It owns the duplicate catch, the empty-trigger refusal, and the admin
  read's newest-first ordering and ceiling. It derives nothing — `match_key` and `kind` are
  computed inside the query layer, which has no field for a caller to supply them in.
- `lib/admin/shortcutActions.ts` *(new)* — `'use server'`. Add, save a cell, toggle `enabled`,
  delete. Four actions, four things a person can do to the table.
- `lib/admin/schema.ts` — the zod schemas for those four.
- `components/admin/ShortcutTable.tsx` *(new)* — `'use client'`. Blur-to-save, optimistic delete,
  `MemoryTable.tsx`'s `CELL_CONTROL` / `CELL` / `HEAD_CELL` tokens reused verbatim.
- `components/admin/AdminNav.tsx` — the sixth `LINKS` entry and `grid-cols-5` → `grid-cols-6`.
- `components/admin/UserPicker.tsx` — one **optional, defaulted** `basePath = '/admin/memory'`
  prop, because the component hardcodes the memory href and would otherwise navigate off the page
  it is picking for. Additive; `app/admin/memory/page.tsx` is not edited. **Accepted at
  reconciliation**, and it is why this phase's file count is 10 and not the draft's 9. No other
  phase touches this file.
- `tests/admin.shell.test.ts` — the three assertions that encode the cell count.
- `tests/admin.shortcuts.test.ts` *(new)* — the client-safety guard and the action shape.

Ten files.

**Does not touch:** anything under `lib/nina/` (phase 1 owns `queries.ts` and `shortcuts.ts`;
this phase imports them), `lib/db/schema.ts`, `drizzle/`, `scripts/`, `app/admin/layout.tsx`,
`app/admin/memory/page.tsx`, `components/admin/MemoryTable.tsx`.

**The nav's sixth cell, decided here rather than left to the phase session.** The label pair is
`{ href: '/admin/shortcuts', label: 'Shortcuts', short: 'Shortcut' }`, placed **last**, after
Memory — it is the newest surface and Memory is the one it grew out of. Three assertions in
`tests/admin.shell.test.ts` move together with it: the `hrefs` array gains its sixth element, the
`shorts` length goes 5 → 6, and the bar/clearance regex goes `grid-cols-5` → `grid-cols-6`. The
**8-character ceiling stays 8** and `'Shortcut'` sits exactly on it: six cells share 414 px on the
target XS Max, so a cell is 69 px and its content box 61 px after `px-1`; eight characters of
Poppins semibold at `text-[11px]` measure ≈ 51 px. It fits with 10 px to spare, and the phase's
own test comment must carry that arithmetic so the next person to add a seventh route knows what
they are spending. `h-14` does not change, so `app/admin/layout.tsx`'s
`pb-[calc(5rem+var(--safe-bottom))]` does not either.

**The table's columns:** trigger · label · expansion · on/off · fired (uses + last used) · ✕.
Below `lg`, "fired" is the column to hide — it is telemetry the operator reads, not a cell he
edits — following `MemoryTable`'s own reasoning for dropping Origin and When, and using the same
`hidden lg:table-cell` mechanism rather than a `<colgroup>`.

**A duplicate trigger is refused by the unique index and reported as a sentence**, not caught by
a pre-flight SELECT: `(user_id, match_key)` is the authority and a check-then-write would race
itself. `insertNinaShortcut` lets the 23505 THROW and `lib/admin/shortcutStore.ts` catches it via
`isUniqueViolation`. The add row's error text names the trigger that already exists.

**The page reads through `listNinaShortcuts(userId)` — bare — and writes no SQL of its own.** The
bare call returns every row including the disabled ones (a disabled code is still one he edits and
re-enables), with `uses`, `lastUsedAt`, `createdAt` and `updatedAt` on it, so there is no column
this page renders that phase 1's read lacks. What the store still does for itself is the ordering:
phase 1 sorts by `match_key` because a registry is scanned by trigger, and this page re-sorts
newest-first in memory so a row he just added lands directly under the add row.

**Exit criteria:** the route renders on a 414 px viewport with no horizontal page scroll; add,
edit, toggle and delete each write production and re-render in the same response; a duplicate
trigger is refused with a sentence and nothing changes; `npm test` green.

### Phase 4 — Import the ledger's shortcuts

**Satisfies:** R3
**Owns:**

- `scripts/nina-shortcuts-import.mjs` *(new)* — the importer.
- `package.json` — one `scripts` entry, `nina:shortcuts-import`.
- `tests/nina.shortcutsImport.test.ts` *(new)* — the parser, driven by the real production strings
  as fixtures: every shortcut-shaped row, every genuine fact that must **not** match, and two
  mid-sentence-`artinya` decoys. **Per-string assertions only; no total is asserted.**

**Does not touch:** anything under `lib/`, `app/`, `components/`, `drizzle/` or `tests/` other
than its own new file.

**Four grammars, tried A → B → C → D, all anchored and all case-insensitive.**
`.workflows/plan/nina-emoji-shortcuts/phase-4.md` §D2 holds the **only** definition of the four
regexes and is the authority; this index does not restate them, because the draft's sketch was
broken two ways and a second copy is a second thing to get wrong. The two corrections worth naming
here, so nobody reintroduces them:

- the alternation is `(?:kalo|kalau)`, **parenthesised**. Unparenthesised, `^\s*kalo|kalau\s+…`
  splits the whole pattern — `^\s*kalo` OR an unanchored `kalau\s+…` — and the first alternative
  matches any string that starts with "kalo".
- grammars **C and D take `\S+?` for the trigger**, not a lazy `[\s\S]*?`. Anchoring alone is not
  enough: `^\s*(?<trigger>[\s\S]*?)\s*artinya` is anchored and still matches
  `kalo dia diem artinya dia marah` with a 13-character trigger, which is under `NINA_TRIGGER_MAX`,
  so the length bound would not have caught it either. `\S+?` cannot cross a space, and every real
  C/D trigger is a single emoji. Grammars A and B keep a whitespace-tolerant trigger group because
  one real trigger is `nom nom`.

The shape, in words: A is `… nina [harus] bilang …`; B is the `bakal` variant the prod data
contains (`kalo miftah bilang 🤤 , nina bakal …`), where the expansion is a description rather than
a script; C is `<T>artinya …`; D is `<T>ini posisi …`. All four are tried and the first that parses
cleanly wins — stopping at the first *structural* match would misread the `🫦` row, which has A's
shape up to the verb and only B parses correctly.

**A row that does not match any grammar is left alone and reported.** The genuine facts in
production (`miftah suka dipanggil tah, bukan mif`, `nina will do whatever miftah asks…`, and so
on — 4 of them at the time of the read) must survive untouched; the importer's own test asserts
that per string, on the real strings.

**Dry run is the default**, per `scripts/blob-reap.mjs` and `scripts/nina-memory-reap.mjs`:
- no flag → print what would be imported, what would be skipped and why, write nothing;
- `--apply` → insert into `nina_shortcuts`, idempotent on `(user_id, match_key)`
  (`onConflictDoNothing`), still leaving the ledger intact;
- `--prune` → **only valid with `--apply`** — delete the ledger rows whose shortcut is confirmed
  present in `nina_shortcuts` after the insert, by id, never by pattern.

`label` for an imported row is the first ~60 characters of the expansion, trimmed at a word
boundary. It is a placeholder the admin will rewrite on `/admin/shortcuts`, and the script says
so in its output rather than pretending to have understood the scene.

**Exit criteria:** run against production with no flag, the output names every importable row and
every skipped one with a reason each — **no count is hard-coded anywhere**, in the script, the test
or these criteria, because the ledger is live and moved during the analysis; the parser's test
passes per string on the real production fixtures, both the ones that must parse and the ones that
must not; `npm run lint`, `npm run typecheck` and `npm test` green. **The script is not run with
`--apply` — or `--prune` — by anyone: not the implementing session, not a verifier, not CI.** It
writes production, and whether and when the ledger is migrated is the user's call.

## Reconciliation Log

The four phase planners ran concurrently and could not see each other. Fourteen conflicts were
found; all fourteen are resolved in the plan files, not merely reported here.

| # | Class | Conflict | Resolution |
|---|---|---|---|
| 1 | Contract drift | The query-layer signatures were contradicted three ways. Phase 3 assumed `insertNinaShortcut(userId, {trigger, matchKey, kind, label, expansion}) -> row \| null` and `updateNinaShortcut(...) -> boolean`; phase 2 assumed `listNinaShortcuts(userId) -> NinaShortcutMatchable[]`. Phase 1 actually declares `insertNinaShortcut(userId, {trigger, label, expansion, enabled?}) -> Promise<NinaShortcutRecord>` (THROWS on duplicate), `updateNinaShortcut(...) -> Promise<NinaShortcutRecord \| null>`, `listNinaShortcuts(userId, opts?) -> Promise<NinaShortcutRecord[]>`. | **Phase 1 is the authority — it owns `lib/nina/queries.ts`.** Phases 2 and 3 rewritten to its exact signatures. Phase 3's store drops `matchKey`/`kind` from both call sites, drops the `classifyNinaTrigger` import entirely, replaces `row == null ? 'duplicate'` with a try/catch on the THROW (already present, now the only path), and splits `settle` into `settleWrite(record \| null)` and `settleDelete(boolean)`. The full signature set is now written into the index so no reader guesses again. |
| 2 | Contract drift | Phase 3's *"a caller cannot mislabel a row because there is nowhere to put the label"* property was planned as two function calls in `shortcutStore.ts`. Phase 1 achieves it inside the query layer, where `NinaShortcutInsert` / `NinaShortcutPatch` have **no field** for `matchKey` or `kind`. | Phase 3 gets the property it asked for, one layer down and enforced by the compiler rather than by remembering two calls. Its store now calls `normalizeNinaTrigger` only to answer *"does this fold to nothing?"* (the `'empty'` refusal), and its structural test was rewritten: the `classifyNinaTrigger(` count assertion is gone, replaced by an absence check against the source **with comments stripped** (`lib/nina/shortcuts.test.ts`'s technique — the store's header names the identifier in the very sentence explaining why it is absent) plus a per-call-site check that no derived column is handed into `insertNinaShortcut(` or `updateNinaShortcut(`. A naive `not.toContain('matchKey:')` over the whole file was drafted and discarded: `adminReadShortcuts`' projection legitimately contains `matchKey: row.matchKey`, so it would have failed on correct code. |
| 3 | Duplicate work | Phase 3's `adminReadShortcuts` issued its own `SELECT` against `ninaShortcuts`, on the belief that `listNinaShortcuts` returned an enabled-only, telemetry-free projection. It returns `NinaShortcutRecord[]` with every column, and bare it returns disabled rows too. | **The bespoke `SELECT` is deleted.** `adminReadShortcuts` calls `listNinaShortcuts(userId)` and keeps only what genuinely differs: the newest-first re-sort and the `ADMIN_SHORTCUT_PAGE` slice, both in memory over tens of rows. No column was found that the record lacks. Phase 3's store no longer imports `db`, `ninaShortcuts`, `desc` or `eq`; a new structural case asserts `not.toContain('db.select')`. |
| 4 | Contract drift | The index declared `renderNinaShortcutBlock(hits): string \| null // null when nothing fired`. Phase 1 actually returns a non-null block whenever `inPlay` is non-empty even if `fired` is empty. | Index corrected, with the reason (`🫦` opens a mode that runs until `💦`). This drift is the root of conflict 5. |
| 5 | Gap / contract drift | Phase 2's invariant-2 proof rested on *"`shortcutBlock`'s empty-hits short circuit"*, which covers only the both-lists-empty case — and phase 2 carried **no positive case** proving an in-play-only hit reaches `userTurnText`. A regression dropping `inPlay` from the block would have kept the suite green. | Verified the three byte-identity cases already miss on `recentRunnerTexts` as well as on `runnerText` — they do — and made that requirement **explicit** in the test's own comment, in manual check 2 and in the exit criteria, so a future edit cannot quietly add a matching recent message. **Added the missing positive case:** `runnerText: 'terusin'`, `recentRunnerTexts: ['pengen 🍑']` must contain the expansion and `STILL IN PLAY`, must not contain `HE USED A SHORTCUT`, and must differ from the same turn with no history. Phase 2's case count 10 → 11. |
| 6 | Contract drift | Phase 1's handoff told phase 4 to *"reimplement the normalisation rules in plain JS"* and stated that a `.mjs` cannot import a `.ts`. Phase 4 measured that assertion false (`scripts/nina-profpic.mjs:151-153`, `scripts/backfill-record-keys.mjs:85`, `package.json:31-32`) and imports the module instead. | **Phase 4's deviation accepted; phase 1's handoff rewritten to match.** The drift class is eliminated rather than tested for, and the guard is stronger — `expect(scriptNormalize).toBe(normalizeNinaTrigger)` cannot be satisfied by a copy. Phase 1's handoff also now names the raw `on conflict … do nothing` statement phase 4 writes for itself, since `insertNinaShortcut` deliberately throws. |
| 7 | Contract drift (propagated) | Invariant 4's zero-import rule was written as a browser-bundle concern only. It is now also the precondition for phase 4's script to **boot**. | Stated in invariant 4 in the index, in `lib/nina/shortcuts.ts`'s header in phase 1, in phase 1's Interface Contract, in phase 4's `Requires`, and in phase 3's re-assertion case. One rule, two consumers, asserted in three files. |
| 8 | Ordering / duplicate definition | Phase 1's handoff and its schema comment say the turn path calls `listNinaShortcuts(userId, { onlyEnabled: true })` — the read `nina_shortcuts_user_enabled_idx` exists for. Phase 2 called it bare, arguing *"one definition of live"*. Left as drafted, phase 1's `onlyEnabled` option and its index would both have been dead code (phase 3 also calls bare). | **Phase 2 rewritten to `{ onlyEnabled: true }`.** The matcher's own `enabled` filter stays as the guarantee for any caller; the query narrows what is fetched, not what counts. Phase 2's `NinaTurnInput.shortcuts` docstring, its `Promise.all` comment and its disabled-row test comment were all rewritten to match. See Decisions D2. |
| 9 | Unowned file | `tests/nina.resend.test.ts` is in no phase's draft `Owns` list and is absent from the analysis's Impact Points, yet phase 2 must edit it (three lines): the file replaces `@/lib/nina/queries` with a **factory**, so the two new imports are import errors without it, and it drains the background turn, which reads `result.firedShortcutIds.length`. | **Assigned to phase 2**, recorded in the index's phase-2 `Owns` and in phase 2's own contract. Swept all four plans — no other phase names it. |
| 10 | Unowned file | `components/admin/UserPicker.tsx` is in no draft `Owns` list and no Impact Point, yet phase 3 must add an optional defaulted `basePath` or the picker navigates off `/admin/shortcuts`. | **Accepted and assigned to phase 3.** Additive, defaulted, no existing call site edited. Swept all four plans — no other phase names it. Phase 3's Files column corrected 9 → 10. |
| 11 | Contract drift | The draft index listed `tests/nina.prompts.test.ts` in phase 2's `Owns` ("the version assertion's floor, if it needs moving") and an optional new actions-level test file. Phase 2 declined both, with reasons (`6 >= 3` holds; no equality assertion exists anywhere). | **Both withdrawn from the index.** Phase 2's Files count 6 → 5. The analysis's impact point 11 ("the default render must stay byte-identical") is discharged by invariant 3's verification step — `git status` on the snapshot — not by an edit. Recorded so nobody re-adds it as a gap. |
| 12 | Contract drift | The index's phase-4 grammar sketch had unparenthesised alternation (`^\s*kalo\|kalau\s+…`, which reads `^\s*kalo` OR an unanchored `kalau…`) and a C/D trigger group (`[\s\S]*?`) permissive enough to match `kalo dia diem artinya dia marah` with a 13-character trigger — under `NINA_TRIGGER_MAX`, so the length bound would not have caught it. Phase 4's plan carries the corrected forms. | **The index no longer restates the regexes.** It points at `phase-4.md` §D2 as the single definition and names only the two corrections (`(?:kalo\|kalau)`, and `\S+?` for C/D) so they cannot be reintroduced. "Three grammars" corrected to four throughout. |
| 13 | Stale figures | Counts disagreed across all four plans and the index: "19 distinct triggers", "nineteen of the twenty-eight rows", "nineteen expansions", "nineteen labels", "nine non-shortcut rows", "the analysis says 19", "three prose grammars", plus phase-1 and phase-4 notes litigating the discrepancy. | **Settled everywhere: 24 shortcut-shaped rows at the time of the read — 19 emoji (one `✌️`, carrying `U+FE0F`) and 5 Latin — 4 genuine facts, grammar split 11 / 2 / 8 / 3.** Every stale figure in all four plan files was rewritten, and every remaining mention now says *at the time of the read* and states that the ledger is live (28 → 27 during the analysis). **No phase hard-codes any count**, in a script, a test, an exit criterion or a UI string; phase 3's `ADMIN_SHORTCUT_PAGE` docstring lost its "nineteen rows exist today" too. |
| 14 | Duplicate definition | The migration recipe (generate; if `main` moved, delete the `.sql` + snapshot, `git checkout` `_journal.json`, rebase, regenerate; **never rename**) risked being restated per phase. | Verified: only phase 1 carries it, in its Step 2 hazard block, and the index's phase-1 section states the same recipe in the same words. Phases 2, 3 and 4 name `drizzle/` only under "leaves alone". No variant exists to drift. |

**Checked and found clean** (listed so a second pass does not re-derive them):

- **Three names for one row concept are mutually consistent.** `NinaShortcutRow` (`$inferSelect`,
  `kind: string`, named only inside `lib/nina/queries.ts`) → `NinaShortcutRecord` (the DTO, `kind`
  narrowed to `NinaShortcutKind` by `toShortcutRecord`, which re-derives an unrecognised value
  rather than trusting it) → `NinaShortcutMatchable` (the matcher's structural minimum). The
  record is a strict superset of the matchable and their `kind` fields are the same type, so
  phase 2 passes one where the other is expected with **no mapping**, and phase 3's
  `AdminShortcutKind = NinaShortcutMatchable['kind']` resolves to the same union.
- **Single ownership** of every contested file: `lib/db/schema.ts` (1), `lib/nina/queries.ts` (1),
  `lib/nina/shortcuts.ts` (1), `lib/nina/turn.ts` (2), `lib/nina/actions.ts` (2),
  `lib/nina/prompts/index.ts` (2), `tests/nina.resend.test.ts` (2), `lib/admin/schema.ts` (3),
  `components/admin/AdminNav.tsx` (3), `components/admin/UserPicker.tsx` (3),
  `tests/admin.shell.test.ts` (3), `package.json` (4). Verified by sweeping all four plans; every
  other mention is a "leaves alone" reference.
- **`NINA_PROMPT_VERSION` is bumped exactly once**, 5 → 6, by phase 2. No other plan names the
  constant or the file.
- **Every dependency points backward.** Phases 2, 3 and 4 each depend on 1 and on nothing else,
  share no file and no symbol, and run concurrently.
- **Every phase builds green on its own.** Phase 1 adds five exported query functions and a pure
  module that nothing imports yet — `typecheck` passes with them unreferenced. Phases 2, 3 and 4
  each only add call sites to what phase 1 landed.
- **Every impact point is owned.** All 24 in the analysis map to a phase, with two documented
  exceptions: impact point 9 (`lib/nina/prompts/system.ts` — declined by the Scope section, since
  every word a shortcut needs travels with the shortcut) and impact point 11
  (`tests/nina.prompts.test.ts` — verified as needing no change; see row 11 above).
- **Every requirement id is owned and no phase serves one outside its `Satisfies` line.** Phase 2's
  `uses` / `last_used_at` writes were checked for creep into R1 and are not: the telemetry columns
  belong to phase 1's table (R1), and writing them on the turn path is R2's mechanism. Phase 3
  reads them and writes neither.

## Decisions

Behavioural forks settled here rather than left to a phase session. The rung is the highest one on
the precedence ladder that actually spoke.

| Fork | Choice | Rung |
|---|---|---|
| **D1 — where `match_key` and `kind` are derived.** Phase 3 planned to compute them in `lib/admin/shortcutStore.ts` and pass them down; phase 1 computes them inside `lib/nina/queries.ts` and gives its input types no field for them. | **Inside the query layer.** Phase 3's store computes neither and does not import `classifyNinaTrigger`. | *The plans' code blocks.* Phase 1's `derivedTrigger` and its `NinaShortcutInsert` / `NinaShortcutPatch` shapes are typed code in the file that owns the write; phase 3's version was typed code in a file that only calls it. Both express the same intent (*"nowhere to put the label"*), and phase 1's is the one that makes it unrepresentable rather than merely unwritten. Phase 3 loses nothing it argued for. |
| **D2 — whether the turn path fetches disabled shortcut rows.** Phase 2 called `listNinaShortcuts(userId)` bare, arguing one definition of "live"; phase 1's handoff and its schema comment both say `{ onlyEnabled: true }`. | **`{ onlyEnabled: true }`.** The matcher's `enabled` filter stays, so "live" still has one definition. | *The plans' code blocks*, decided by which reading leaves dead code. Phase 1's schema declares `nina_shortcuts_user_enabled_idx (user_id, enabled)` and annotates it *"phase 2's every-turn read"*; phase 3 calls the query bare. Under phase 2's reading, both the index and the `onlyEnabled` option have no caller in the entire set. Under phase 1's, each has exactly one. |
| **D3 — how `/admin/shortcuts` reads the registry.** A bespoke `SELECT` in `shortcutStore.ts` (phase 3's draft) or phase 1's `listNinaShortcuts`. | **`listNinaShortcuts(userId)`, bare.** The store keeps only the newest-first re-sort and the page slice, in memory. | *The plans' code blocks.* Phase 3's justification was three factual claims about `listNinaShortcuts` — enabled-only, no `uses`, no `lastUsedAt` — and phase 1's code block falsifies all three. With the premise gone the argument goes with it, and what is left is one read written twice. |
| **D4 — the admin table's row order.** Phase 1 sorts by `match_key ASC` (*"a registry is scanned by trigger"*); phase 3 wants `created_at DESC` (*"the row just added appears under the add row"*). | **Both, at different layers.** The query keeps `match_key ASC`; `adminReadShortcuts` re-sorts newest-first for the page. | *The phases' exit criteria.* Phase 3's manual check 4 states the newest-first behaviour as an acceptance condition (*"the row appears above nothing and below the add row"*), and its `AddRow` docstring depends on it. Phase 1's ordering has no exit criterion attached — it is a reproducibility property, and it survives untouched for the turn path. Sorting tens of rows in memory costs nothing and avoids widening a turn-path signature for an admin page. |
| **D5 — whether phase 4 reimplements or imports the matcher.** The original brief said a `.mjs` cannot import a `.ts` and asked for a parity-tested copy; phase 4 measured the opposite. | **Import.** `scripts/nina-shortcuts-import.mjs` imports `normalizeNinaTrigger` and `classifyNinaTrigger` from `lib/nina/shortcuts.ts` under `--experimental-strip-types`. | *The surrounding code's convention*, which is the rung that decides a factual question about the repo: `scripts/nina-profpic.mjs:151-153` and `scripts/backfill-record-keys.mjs:85` already import `.ts` this way and `package.json:31-32` carry the flags. Phase 1's handoff, which said otherwise, was written from the same false premise and has been corrected. |
| **D6 — where an in-play-only hit is decided.** Phase 2 deferred to phase 1 and would have accepted either ruling; the index said `null` when nothing fired, phase 1 says a block renders. | **A block renders**, under a STILL IN PLAY header, and phase 2 now asserts it positively. | *A stated invariant* — invariant 2 is *"a turn in which no trigger fired carries zero shortcut bytes"*, and phase 1's expansion of it (`null` means both lists empty, not that `fired` is) is the only reading under which the one real production shortcut that opens a mode survives the turn after it opens. The index's looser sentence was the drift and has been corrected. |
| **D7 — whether `UserPicker` gains a prop.** Reuse unmodified (the original brief) or add an optional defaulted `basePath`. | **Add the prop.** | *The plans' code blocks*, against the two alternatives phase 3 enumerated. Unmodified, the picker's hardcoded `/admin/memory?user=` navigates off the page it is picking for. `usePathname()` would turn a Server Component into a Client Component, which `components/admin/.workflows/package_readme.md` forbids **by name for this component**; a duplicate pill row is two pickers to keep in step. The prop is additive and defaulted, so `/admin/memory` is byte-identical. |
| **D8 — whether `tests/nina.prompts.test.ts`'s version floor moves to `>= 6`.** | **No.** The floor stays `>= 3` and no phase touches the file. | *The plans' code blocks.* `6 >= 3` holds, and a grep of `tests/`, `lib/` and `app/` finds no equality assertion on the constant. Moving a floor nothing is testing would edit a file phase 2's contract lists as not-touched, for no signal. |

## Open Questions

**None.** Every fork above was decidable on the ladder, and nothing in this set is irreversible:
no phase writes production, phase 4's `--apply` and `--prune` are explicitly barred from every
implementing session by its exit criteria, and phase 1's migration is generated but never run.

## Rollback

**Per phase.** Every phase is one commit on `feature/nina-emoji-shortcuts`; `git revert` it.
Phase 1 additionally leaves a migration: reverting the code leaves an unused table, which is
inert (nothing reads it once phases 2–4 are gone) and is dropped with
`drop table nina_shortcuts;` if that matters. No phase alters an existing column, so no phase's
revert can strand data that predates it.

**As a whole.** `git branch -D feature/nina-emoji-shortcuts` and
`git worktree remove /home/miftah/.worktrees/run-insights/nina-emoji-shortcuts`. Nothing outside
the worktree has changed: no production write happens anywhere in phases 1–3, and phase 4's
importer only writes under `--apply`, which the implementing session does not pass.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_EMOJI_SHORTCUTS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_EMOJI_SHORTCUTS_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_EMOJI_SHORTCUTS_PLAN.md
