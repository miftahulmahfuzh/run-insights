# Phase 4: Automatic session titling, and the rename path

**Plan set:** `NINA_CHAT_SESSIONS_PLAN.md`
**Analysis:** `20260904-223303-S3K9_code_analyzer.md`
**Satisfies:** R3 — *"after first interaction in a new session (user then nina), llm will automatically create an appropriate title for the session (3-4 words). then user can also edit the session name manually."*
**Depends on:** Phase 3 (and through it Phase 1)
**Difficulty:** NORMAL
**Package:** `lib/nina`, `scripts`

---

## Goal

After this phase a brand-new session names itself. The first time the runner speaks in an untitled
session and Nina answers, one `after()` hook makes one small `glm-5.3` call that returns three or
four words, and those words become the session's title — once, whatever happens to the request that
triggered it. A title he typed himself is never overwritten, a model answer that is not a title is
refused rather than shown, and `scripts/check-llm-payload-boundary.mjs` gains both of this plan
set's new model calls in the single commit its own header demands.

Nothing renders differently by this phase's own hand: phase 5 draws the sidebar rows, phase 1
supplies the placeholder they fall back to, and this phase decides what the row *says*.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

### Creates — `lib/nina/title.ts` (NEW, **pure**: no `server-only`, no `db`, no `lib/llm`, no DOM)

Its only imports are `import type Anthropic from '@anthropic-ai/sdk'` (type-only, fully erased
under `verbatimModuleSyntax`) — the same import `lib/nina/prompts/distill.ts` already makes from a
pure file — and, **after reconciliation**, one value import of
`NINA_SESSION_TITLE_MAX_CHARS` from phase 1's `lib/nina/sessions.ts`, which itself imports nothing
at all. The module stays client-safe: neither import reaches `server-only`.

- **No cap of its own.** `NINA_SESSION_TITLE_MAX_CHARS` (`= 60`) is **imported from phase 1's
  `lib/nina/sessions.ts`** and re-exported from nothing. **RECONCILED** — this contract originally
  declared the constant here; see D3 for the adjudication and why `sessions.ts` is its home.
- `NINA_TITLE_PROMPT_VERSION` (`= 1`), `NINA_TITLE_MAX_WORDS` (`= 4`),
  `NINA_TITLE_OVERSHOOT_WORDS` (`= 6`), `NINA_TITLE_TURN_LIMIT` (`= 6`),
  `NINA_TITLE_SNIPPET_CHARS` (`= 400`)
- `NINA_TITLE_SYSTEM_PROMPT`, `NINA_TITLE_TOOL` (an `Anthropic.Tool` named `title`)
- `NinaTitleTurn` (interface: `{ role: 'runner' | 'nina'; body: string }`)
- `sanitizeNinaSessionTitle(raw: unknown): string | null` — **the manual-rename rule (R3's second
  half)**. This is phase 3's exported name and signature, unchanged; only the module it is
  *defined* in moves, and `lib/nina/active.ts` re-exports it so no call site changes.
- `sanitizeNinaModelTitle(raw: string): string | null` — the 3-4 word rule
- `parseNinaTitle(raw: unknown): string | null` — the tool block's `input` -> a title, or nothing
- `titleTranscript(turns: readonly NinaTitleTurn[]): string`
- `buildNinaTitleRequest(turns: readonly NinaTitleTurn[]): string | null`

### Creates — `lib/nina/title.test.ts` (NEW)

Vitest, `environment: 'node'`, no jsdom, no database, no network.

### Creates — `lib/nina/autotitle.ts` (NEW, `import 'server-only'`)

- `titleNinaSessionIfNeeded(userId: string, sessionId: string, deps?): Promise<void>` —
  **the guarded symbol**, spelled exactly as phase 3's seam wrote it
- `titleNinaSessionWith(client, turns, options): Promise<string | null>` — the injectable core
- `NINA_TITLE_TIMEOUT_MS` (`= 12_000`), `NINA_TITLE_MAX_TOKENS` (`= 600`)
- `TitleClientLike`, `NinaTitleStore` (interfaces), `dbNinaTitleStore`

### Creates — `lib/nina/autotitle.test.ts` (NEW)

### Signature changes

None to any existing symbol. `sanitizeNinaSessionTitle` keeps phase 3's exact
`(raw: unknown) => string | null`.

### Deletes

- `lib/nina/active.ts`'s **body** of `sanitizeNinaSessionTitle`, replaced by a re-export from
  `./title` (the name and the import path `@/lib/nina/active` keep resolving for every existing
  importer, including `lib/nina/sessionActions.ts` and `tests/nina.active.test.ts`).
  **RECONCILED: there is no local cap declaration left in `active.ts` to delete.** Phase 3 no
  longer declares one — after reconciliation it imports
  `NINA_SESSION_TITLE_MAX_CHARS` from `lib/nina/sessions.ts` — so this phase deletes one symbol
  from that file, not two, and mints no alias.
- Phase 3's `PHASE 4's SEAM` comment block in `lib/nina/actions.ts`, replaced by the call it
  describes plus a shorter live comment.

### Renames

None.

### Modifies — `scripts/check-llm-payload-boundary.mjs` (**sole editor, this whole plan set**)

Two new `GUARDED_CALLS` entries, in one commit:

| symbol | sanctioned |
|---|---|
| `titleNinaSessionIfNeeded` | `lib/nina/autotitle.ts`, `lib/nina/actions.ts` |
| `rankNinaSearchHits` | `lib/nina/semantic.ts`, `lib/nina/searchActions.ts` |

`rankNinaSearchHits` and its two paths are read verbatim off `phase-6.md`'s contract item 1 (*"an
entry whose `symbol` is exactly `rankNinaSearchHits` and whose `sanctioned` list is exactly
`[join('lib','nina','semantic.ts'), join('lib','nina','searchActions.ts')]`"*). **I did not choose
that name; phase 6 did, and I am registering it unchanged** — which is the arrangement that avoids
the one failure mode this single-author rule exists to prevent.

Plus one correctness repair to that file's own header: it says *"NOW COVERS FOUR ENTRY POINTS. THIS
TABLE IS COMPLETE"* and lists four bullets, while the table has held **five** since
`resolveNinaPromises` landed. The count becomes seven and the missing bullet is written. This is not
a drive-by: the file's contract is that its prose and its table agree.

### Requires (from earlier phases)

1. **Phase 3 — the named seam.** `lib/nina/actions.ts`'s success path carries the comment block
   headed `PHASE 4's SEAM: THE SESSION TITLER FIRES HERE (R3)`, placed immediately after
   `scheduleDistillation({...})` and above `return { ok: true, … }`, with `sessionId: string` in
   scope. I fill exactly that spot with exactly the statement it names:
   `after(() => titleNinaSessionIfNeeded(userId, sessionId))`.
2. **Phase 3 — `lib/nina/active.ts` exists**, pure, exporting `sanitizeNinaSessionTitle` and
   re-exporting nothing else of mine, and phase 3's handoff item 4 invites this phase to replace
   that function's body (*"do not add a second sanitiser"*, and keep the cap in a pure module).
   Both instructions are honoured — see D3. **Reconciled:** the cap is phase 1's
   `NINA_SESSION_TITLE_MAX_CHARS` in `lib/nina/sessions.ts`, which is a pure module with no imports
   at all, so the constraint is satisfied more strongly than the handoff asked.
3. **Phase 3 — `listNinaMessages(userId, { limit, sessionId })`** with `sessionId` **required**,
   returning `NinaMessageRow[]` oldest-first.
4. **Phase 1 — `getNinaSession(userId, id): Promise<NinaSessionRow | null>`** where
   `NinaSessionRow` carries `title: string | null` and `titleSource: NinaSessionTitleSource | null`.
5. **Phase 1 — `setNinaSessionTitleIfUntitled(userId, id, title): Promise<boolean>`**, whose
   `WHERE` includes `isNull(ninaChatSessions.title)`. **This predicate is my idempotence marker**
   (D2), and phase 1's handoff names it for exactly that: *"a read-then-write in `title.ts` would
   reintroduce the race."*
6. **Phase 1 — `renameNinaSession` already stamps `titleSource: 'manual'`** in the same statement
   as the title. Nothing in this phase needs to add that write, which answers phase 3's handoff
   item 5 in the negative: *no* second write from `renameNinaChatSession` is required.
7. **Phase 1 — `NinaSessionTitleSource`** exported from `@/lib/db/schema` (type-only import, for a
   log line).

### Leaves alone (owned by others)

- `app/nina/page.tsx` — phases 3, 5, 8. Not one character.
- Every component: `components/nina/**`, `components/ui/**` — phases 2, 5, 7, 8, 9. **The rename
  UI is phase 5's**; this phase owns the rule it refuses with, not the input it is typed into.
- `lib/db/schema.ts`, `drizzle/**`, `lib/nina/queries.ts`, `lib/nina/sessions.ts` — phase 1. In
  particular I do **not** add a query; the three I need all exist by name in phase 1's contract.
- `lib/nina/sessionActions.ts`, `gateway.ts`, `load.ts`, `proactive.ts`, `imagejobs.ts`,
  `sessionResolve.ts` — phase 3. `lib/nina/actions.ts` is phase 3's file too and I add **one
  statement and one import** to it, at the seam it built for me.
- `lib/nina/search.ts`, `semantic.ts`, `searchActions.ts` — phase 6. I register its call in the
  guard; I do not write, read or import its files.
- `lib/nina/prompts/**` — deliberately untouched, and D6 says why (a concurrent orchestration is
  editing that directory on `main`).
- `tests/nina.active.test.ts` — phase 3's suite for phase 3's module. My new cases go in
  `lib/nina/title.test.ts`, so phase 3's file is not a merge surface.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/title.ts` | **create** | the shared cleaner, the manual-rename rule, the 3-4 word rule, the parse, the prompt and the tool — all pure. It **imports** the cap from phase 1's `lib/nina/sessions.ts` and declares none (D3) |
| `lib/nina/title.test.ts` | **create** | the suite invariant 7 requires; every branch of both rules |
| `lib/nina/autotitle.ts` | **create** | `server-only`. The model call, the two guards, the store seam, and the guarded symbol |
| `lib/nina/autotitle.test.ts` | **create** | the injected-client and injected-store paths, including the double-`after()` case |
| `lib/nina/active.ts` | modify | phase-3 plan `:560-581` (`sanitizeNinaSessionTitle`) becomes ONE re-export line. Reconciled: phase 3 declares no cap, so there is no second declaration to fold |
| `lib/nina/actions.ts` | modify | `:10` import block gains one name; the seam block after the success-path `scheduleDistillation({…})` (today `:639-647`, post-phase-3 ≈ `:700`) becomes the call |
| `scripts/check-llm-payload-boundary.mjs` | modify | header `:22-44` (four -> seven, three bullets added); `GUARDED_CALLS` `:128` gains two entries |

Seven files. The index estimated ~5; D1 explains the two extra (`title.ts` splits into a pure half
and a `server-only` half, each with its own suite).

---

## Decisions

### D1 — Two modules, not one: `title.ts` is pure and `autotitle.ts` makes the call

The index and my scope both say *"a new `lib/nina/title.ts` … plus the model call itself"*. I am
splitting that in two, and the reason is a build error someone else already found for me.

`phase-5.md`'s contract item 3 is headed **"one of them is a hazard"** and argues at length:

> `SessionRow` is `'use client'` and uses the constant for the rename input's `maxLength`;
> `title.ts` also holds the titler's model call, so it reaches `lib/llm/client.ts` -> `lib/env.ts`,
> which opens with `import 'server-only'`. Importing a constant out of it from a client component
> is exactly the failure `components/ui/index.ts` documents at length.

That argument is correct, and it is not only about phase 5's `maxLength`. Two other edges lead the
same way:

- **`lib/nina/active.ts` must stay client-safe, and it is where the rename rule lives.** Phase 3
  declares that file *"pure, no `server-only`, no DB import"*, and phase 6's contract item 4 says
  its `searchHitHref` writes the literal `'s'` and *"if phase 3 exported a named constant for it,
  the reconciler swaps the literal for that import"* — that constant is `SESSION_PARAM`, in
  `active.ts`, and `lib/nina/search.ts` is imported by the `'use client'`
  `components/nina/NinaSearchField.tsx`. So there is a live, already-anticipated path from a client
  component into `active.ts`. If `active.ts` reaches my rule and my rule's module reaches
  `narrativeClient()`, that reconciliation breaks the build.
- **A cycle.** The rename rule needs the character cap; the titler's rule needs the same cap. Put
  the cap in `active.ts` and the rule in `title.ts` and the two files import each other.

So: `lib/nina/title.ts` holds the cap and every pure rule and imports nothing but a *type*;
`lib/nina/autotitle.ts` opens with `import 'server-only'`, holds the model call, and is the only
file the guard has to sanction. `active.ts` imports one pure module and stays pure.

This is precisely the shape phase 6 chose for the same reason — pure `lib/nina/search.ts` beside
`server-only` `lib/nina/semantic.ts`, *"precisely so the guard can sanction the definition site"* —
and the shape `lib/llm/narrate.ts` (`narrateWith` + `getOrCreateInsight`) and `lib/nina/distill.ts`
(`distillWith` + `distillNinaMemory`) both already have inside one file. I take it to two files
because the pure half here has a **client-reachable** consumer and theirs do not.

**Named `autotitle.ts` and not `titler.ts`** because `title.ts` / `titler.ts` differ by one letter
in an import list, and a wrong import that type-checks is the worst kind. `autotitle` also says
which of the two halves of R3 it implements: the automatic one. The manual one is a pure rule with
no model behind it.

**Phase 5's hazard is retired by this, not merely dodged.** After this phase, `lib/nina/title.ts`
*is* client-safe — nothing `server-only` is reachable from it, so `active.ts` re-exporting the
rename rule out of it is safe from a `'use client'` file. See D3 for where the cap itself ended up.

**RECONCILED — the two-module split is blessed, and the index's Phase 4 section now says so.** The
three reasons were checked against the worktree rather than taken on faith: `lib/llm/client.ts:1`
and `lib/env.ts:1` both open with `import 'server-only'` (as does `lib/nina/gateway.ts:1`), so any
module holding the titler's model call is unusable from a client bundle; `lib/nina/active.ts` is
genuinely client-reachable, because phase 6's pure `lib/nina/search.ts` is imported by the
`'use client'` `components/nina/NinaSearchField.tsx` and — per the reconciled contract — takes
`SESSION_PARAM` from `active.ts`; and phase 5's `SessionRow` is `'use client'` and reads the cap for
`maxLength`. The cycle argument is the one that no longer applies, because the cap moved out of both
files (D3) — but it was never the load-bearing reason. The split stands on `server-only` alone.

### D2 — The trigger, and why its idempotence is a row and not a variable

R3's trigger is *"after first interaction in a new session (user then nina)"*. Implemented as three
conditions, checked in cost order:

1. **The session exists, is his, and `title IS NULL`.** One primary-key read
   (`getNinaSession`). This is the *cost* guard: without it, every turn in an already-titled session
   would spend a model call to discover the answer was already on disk.
2. **The rows read back contain at least one `role = 'runner'` row and at least one `role = 'nina'`
   row.** This is R3's clause "(user then nina)", literally. It is free — the rows were read to
   build the prompt anyway. It is also what stops a session that holds *only* a proactive message
   from being titled: assumption A3 sends cron messages to the most recent session, and a session
   where she spoke and he never answered has nothing to name.
3. **`setNinaSessionTitleIfUntitled`'s `WHERE … AND title IS NULL`.** This is the *correctness*
   guard, and it is the one that has to be durable.

`hasProactiveMessageForRun`'s docstring in `lib/nina/queries.ts:622-631` states the rule I am
following:

> Two tabs committing the same extraction, or a retried `after()`, must not produce two reactions
> to one run, and this is the durable thing that says so: **a serverless invocation has no memory of
> the previous one, so the marker has to be a row.**

**My marker is the `nina_chat_sessions.title` column being non-NULL**, tested inside the same
`UPDATE` that sets it. Not a module-level `Set`, not a flag on the request, not a read followed by a
write. Phase 1 wrote that statement for this purpose and said so: *"`title IS NULL` in the predicate
rather than a read-then-write is what makes the whole thing safe under the two conditions phase 4
has to survive."* Two tabs that finish the same first exchange at the same moment both call the
model and both attempt the write; one row is updated, the other `UPDATE` matches nothing, and
`false` comes back. The loser logs `written: false` and returns. There is no second title and no
error.

Guard 1 and guard 3 are not redundant — they answer different questions. Guard 1 is *"is this call
worth making"* and can be stale by microseconds without harming anything. Guard 3 is *"may this
write land"* and cannot be stale at all, because it is evaluated by Postgres inside the statement.
`lib/nina/sessions.ts`'s `sessionTitleFor` uses the same two-guards phrasing for the same reason
(*"the second of two guards rather than the only one … because the titler in phase 4 is a model and
a model's empty string must not be able to blank a row"*).

**A failed attempt persists nothing, on purpose.** No marker, no negative cache. If the model is
unavailable, or the answer is not a title, the session stays untitled and the *next* turn tries
again for free — `narrate.ts`'s rule verbatim: *"the next natural view of the page retries for free,
because nothing recorded that the last attempt failed."* The honest consequence, stated rather than
hidden: on such a retry the transcript in front of the model is the session's *latest* exchange
rather than its first. That is a deviation from R3's wording and it is the right one — a session
titled from turn five is better than a session called "Chat baru" forever, and both are better than
a wrong title.

### D3 — One character cap, four spellings, and which one is real (**RECONCILED**)

Four of these plans named the same number, at two different values:

| Plan | Spelling | Module | Value |
|---|---|---|---|
| Phase 1 | `SESSION_TITLE_MAX_CHARS` | `lib/nina/sessions.ts` | 80 |
| Phase 3 | `NINA_SESSION_TITLE_MAX` | `lib/nina/active.ts` | 60 |
| Phase 4 (this plan's draft) | `NINA_SESSION_TITLE_MAX_CHARS` | `lib/nina/title.ts` | 60 |
| Phase 5 | `NINA_SESSION_TITLE_MAX_CHARS` | expects `lib/nina/sessions.ts` | (imports it) |

**The reconciled answer, which is not the one this plan proposed:**

- **`lib/nina/sessions.ts` declares `NINA_SESSION_TITLE_MAX_CHARS = 60`, once, and that is the only
  title cap in the set.** Phase 5's spelling and path, phase 3's and this phase's value.
- **`lib/nina/title.ts` imports it.** It declares nothing and re-exports nothing.
- **`lib/nina/active.ts` imports it too** (phase 3's own module now does, instead of declaring
  `NINA_SESSION_TITLE_MAX`), so there is no alias and no second name anywhere.
- **Phase 5 changes nothing** — its
  `import { NINA_SESSION_TITLE_MAX_CHARS } from '@/lib/nina/sessions'` was already right.

**Why this plan's own proposal was overruled.** It proposed declaring the cap here at 60 and
leaving phase 1's `SESSION_TITLE_MAX_CHARS = 80` in place as a wider storage clamp, on the
`NINA_ATTACH_MAX_CHARS` precedent. That is a defensible arrangement in general and it is the wrong
one here, for three reasons:

1. **It leaves two numbers and three names alive.** The reconciliation mandate is one name, one
   path, one value. "60 < 80 so the outer never binds" is an argument that the second number is
   *harmless*, not an argument that it is *needed* — and an unbindable constant is exactly the kind
   of thing a later phase reads as permission to type 80 characters.
2. **Phase 1 asked for the opposite, in writing, and owns the file.** Its handoff: *"Phase 4 must
   also import `NINA_SESSION_TITLE_MAX_CHARS` from `lib/nina/sessions.ts` rather than declaring a
   second cap."* Two plans each told the other to import from it; the tie breaks to the earlier
   phase, which is also the one that owns the module the constant would live in either way.
3. **`sessions.ts` is the strictly safer home.** Its docstring is *"pure, no imports outside
   itself"* — client-safe by construction, with no `server-only` reachability argument to make at
   all. `title.ts` is client-safe too, but only for as long as nobody adds an import to it; and
   `title.ts` is this phase's file, while the cap is read by phases 1, 3, 4 and 5.

**Which value, and why 60 rather than 80.** Nothing in the user's request names a number, so this is
an adjudication and not a derivation. 60 wins because two of the three planners that chose a value
chose it for the *rule* — the ceiling on what he may type when renaming — while phase 1's 80 was
chosen as "generous" storage headroom and its own docstring called it *"the STORAGE guard and
nothing more"*. One number cannot be both, and the number the input caps with (`maxLength`) must be
the number the server stores, or the field silently truncates what the refusal would have accepted.
60 is still generous for the three or four words R3 asks for.

**Nothing else in this phase changes.** The `sanitizeNinaSessionTitle` body still moves here, the
3-4 word rule still clamps to the same constant, and `active.ts` still re-exports the function so no
call site moves.

### D4 — The client, the model, and budgets that are this call's own

`narrativeClient()` and `narrativeModel()`, the same pair `turn.ts` and `distill.ts` use, for the
reason `turn.ts` states: one client, one credential, `maxRetries: 0` deliberate. Nothing here
re-argues that.

What this call does **not** inherit is anybody else's arithmetic.

**`max_tokens = 600`, not `NINA_MAX_TOKENS`'s 2400.** The payload is one string of at most 60
characters — under 32 output tokens. Every one of the remaining ~570 is headroom for a `thinking`
block nobody asked for, which the 2026-09-03 probe recorded arriving on this endpoint *"with
`thinking: { type: 'disabled' }` set"*. The ceiling is deliberately low rather than generous, and
that is the opposite of `turn.ts`'s call, for a concrete reason: **output tokens are wall clock**
(~26-33 ms each, F04's measurement) and this call shares one 60 s invocation with
`runTurnDistillation`'s 34 s budget. 600 tokens is ~16-20 s worst case, which fits beside
distillation; 2400 would be ~63-79 s and would starve it. F07 also settled that raising a ceiling is
not the fix for a thinking model — *"4000 tokens buys 4000 tokens of thinking and still no answer"*.
So a `max_tokens` stop is treated as "no title" and the next turn retries free (D2), which is the
cheapest correct answer available.

**`timeout = 12_000`.** The fifteen measured calls on this endpoint were 10.2-16.4 s for F07's
five-field narrative payload; the 2026-09-03 probe measured a real Nina round at 6.2 s. This
request's input is at most six short messages and its output is four words, so it sits at the bottom
of that range, not the top. 12 s is above every observed floor and is the largest number that leaves
distillation whole in the measured case. If it aborts a call that was about to answer, the cost is
one untitled turn and a free retry.

**No repair round trip, and this is the deliberate departure from both precedents.** `narrate.ts`
and `distill.ts` each spend a second call to repair a malformed payload because a five-field object
has interesting failure modes and there is something to tell the model. A single short string has
none: if it came back as a sentence there is nothing to repair, only to refuse (D5); if it came back
empty, that is a *sanctioned answer* the prompt asked for. A repair would double the deadline of a
label. `MIN_REPAIR_BUDGET_MS` and its friends therefore have no analogue in this module, and their
absence is the design, not an omission.

**Forced tool call, not prose.** `tool_choice: { type: 'tool', name: 'title' }` with
`thinking: { type: 'disabled' }` — kept and not relied on, `distill.ts`'s phrasing. The reason to
force a tool for one string is that the alternative is scanning `message.content` for the first
`text` block and hoping the model did not preface it, and `distill.ts` already recorded that
`content[0]` can be a `thinking` block. A tool block is found by name whatever else is in the array.

**No Zod schema.** `describeInsightIssues` and `DistillPayloadSchema` exist because there is a
repair to inform and a shape to describe. For `{ title?: unknown }` a five-line type guard in a pure
function is smaller, has no error type nobody reads, and is directly unit-testable, which is the
whole point of invariant 7.

### D5 — What "3-4 words" means when the model misbehaves

A bad title is worse than no title, because the title is the whole session list. The rule that
follows is entirely in `sanitizeNinaModelTitle`, entirely pure, and every branch below has a test.

Cleaning, in order, and then one decision:

| Input | Answer | Why |
|---|---|---|
| `''`, `'   '`, control characters only | **refuse** -> phase 1's `SESSION_UNTITLED_TITLE` stands | The prompt *asks* for an empty string when the exchange names nothing, so this is a sanctioned answer and not an error. |
| zero-width / bidi-control characters only (`U+200B`, `U+202E`, `U+FEFF`…) | **refuse** | These survive `.trim()` and would render as a blank sidebar row — indistinguishable from a rendering bug, which is the exact failure `sessionTitleFor` guards against. |
| `"Cedera lutut kanan"`, `'Latihan pagi'`, `` `Half marathon` `` | **strip the wrapping pair**, keep the words | A quoted title is the model quoting itself. Looped, because `"'judul'"` needs two passes. |
| `Judul: Cedera lutut` / `Title: Knee pain` | **strip the label**, keep the words | A two-word prefix list (`title`, `judul`, `session title`, `nama chat`) and nothing more general — "strip everything before a colon" would mutilate the legitimate `Cedera lutut: kanan`. |
| `**Latihan pagi**`, `# Latihan pagi`, `- Latihan pagi` | **strip the marks** | Nothing renders markdown in a bubble or a row (the index's scope section: *"a markdown renderer in bubbles. Still none, deliberately"*), so an asterisk would be shown literally. |
| `Latihan pagi 🔥` | **strip the pictograph**, keep the words | An emoji in a machine-written title is noise, not a lie. Removing it leaves a correct title; refusing over it throws a correct title away. Contrast the manual rule, below. |
| `Cedera lutut kanan.` | **strip the trailing `.,;:!?…`** | R3 asked for a name, and a name has no full stop. |
| 1-4 words | **keep** | The 3-4 word constraint is an instruction **to the model**, in the prompt — not a floor to enforce downwards. A two-word `Cedera lutut` is a good session name, and Indonesian compounds make word count a poor proxy for information. Enforcing a minimum would discard usable titles in exchange for the placeholder. |
| 5-6 words | **keep the first 4** | A model that returned five words was aiming at a title and overshot; the first four of a five-word noun phrase is still a noun phrase. |
| 7+ words, a sentence, a question, an explanation, a refusal | **refuse** | It did not write a title, it wrote prose, and `lib/llm/narrate.ts` settles what to do with prose we cannot use: *"There is no mechanical transformation that turns … a truthful sentence"*, and *"the only safe fallback for prose is the absence of prose."* Truncating a sentence to four words invents a label out of the middle of a clause. |
| 4 words but over 60 characters | **refuse** | Four words that long are token soup, and clamping would cut a word in half. The character cap refuses here rather than truncating, precisely because the word rule already passed. |
| no letter survives (`"..."`, `"123"`, `"🔥"`) | **refuse** | A title with no letter names nothing. `\p{L}` under the `u` flag; `target: ES2022` makes Unicode property escapes available, and this is their first use in the repo. |

Refusing always lands on the same place: **phase 1's deterministic placeholder, which is already on
the row**, because a refusal means `setNinaSessionTitleIfUntitled` is never called at all. The
placeholder is `SESSION_UNTITLED_TITLE` (`'Chat baru'`) and `sessionTitleFor` is what renders it.
There is no third state and nothing to clean up.

### D6 — The manual rename is a different rule on purpose, and it lives at phase 3's seam

`sanitizeNinaSessionTitle(raw: unknown): string | null` — phase 3's name, phase 3's signature,
phase 3's semantics, defined in `title.ts` and re-exported from `active.ts` (D1, D3). What it does:
type-check, strip control characters, strip the invisible characters phase 3's regex could not see,
collapse whitespace, trim, refuse empty, clamp to 60 and trim again (a slice at 60 can leave a
trailing space).

What it deliberately does **not** do, and the asymmetry is the point:

- **No word rule.** He may call a session whatever he likes. R3's "3-4 words" constrains the LLM,
  not him. `Latihan half marathon bulan Desember` is a name he chose.
- **No emoji stripping, no quote stripping, no punctuation stripping.** The model's output is a
  guess we are accepting on his behalf and it earns scepticism; his input is an instruction.
  Stripping the emoji he typed is the app overruling him about his own label.
- **An empty rename is refused, not a revert to the automatic title.** Phase 3 already ruled this
  (*"Clearing a title is not a feature anybody asked for — he can rename it to something else"*) and
  I keep it, with one extra reason phase 3 could not see: reverting `title` to NULL would put the
  session back in the titler's reach and it would be re-titled on his next message — so "clear the
  name" would silently mean "let the model rename this", which is not what an empty input box means.
  Phase 5's row renders the sentence the action returns; nothing pre-validates in the client
  (`FolderMenu`'s "THE SERVER OWNS EVERY REFUSAL").

**The one behavioural change to phase 3's function**, and it is a bug fix rather than a preference:
its class `/[\x00-\x1F\x7F]/` does not cover `U+200B`, `U+200C`, `U+200E`, `U+200F`, `U+202A-U+202E`,
`U+2060-U+2064`, `U+2066-U+2069` or `U+FEFF`. A paste carrying only `U+200B` passes its
`collapsed.length === 0` check (`.trim()` does not remove it), gets written, and renders as a blank
row. My cleaner strips that set and then requires a non-blank remainder. **`U+200D` is excluded from
the strip set on purpose** — it is the zero-width joiner, and removing it would explode the emoji
family he typed into three separate people.

**Nobody needs the name `validateSessionTitle`.** `phase-5.md` mentions it twice, but as a
description of what phase 4 would have (*"Phase 4's `validateSessionTitle` should import the cap"*),
not as an import — phase 5's row *"does not validate"* and imports only the constant. The single
importer of the rule is phase 3's `sessionActions.ts`, which calls `sanitizeNinaSessionTitle`. One
name, one implementation, zero call-site changes. Phase 3's instruction — *"do not add a second
sanitiser"* — is satisfied literally.

### D7 — The titler's prompt does not see `nina_message_images.description`, and the distinction matters

**Invariant 5 forbids that column reaching a *component*. A prompt is its declared consumer**, so
this is a choice and not a rule; the plan index says so in as many words and asks for the
distinction to be stated rather than assumed. Stated: the titler *may* see descriptions, and it does
not.

Three reasons, in weight order:

1. **It does not need them.** The transcript already contains Nina's reply, and her reply is written
   *from* the description — RU-12's whole shape, and `lib/nina/actions.ts` hands
   `imageDescriptions` into `runNinaTurn` for exactly that. So a caption-less photo turn still
   yields a titleable transcript: his row may be empty, hers says what she saw, in the language he
   speaks. That is a *better* input than the raw description, because a title should name what the
   conversation is about and her sentence is about the conversation while `glm-4.6v`'s prose is
   about the pixels.
2. **It would cost a query phase 1 did not write.** Reaching descriptions means joining
   `nina_message_images`, and `lib/nina/queries.ts` is phase 1's file. That is a handoff, not an
   edit I may make — and I am not making the handoff either, because of reason 1.
3. **A `glm-4.6v` description is dense prose about one image.** Dropped into a prompt whose entire
   job is to produce four words, it is the largest thing in the context, and F07 measured this model
   *"spending three of four prose fields on the one scalar that happened to be in front of it"*.

An empty-bodied photo message contributes no line to the transcript (`titleTranscript` skips a
message whose cleaned body is empty) and `buildNinaTitleRequest` returns `null` — no call at all —
if that leaves nothing. A session of nothing but silent photos therefore keeps its placeholder and
costs zero tokens.

### D8 — The title is in his language, not always Indonesian

Nina's register is Indonesian and `LANGUAGE_RULE` in `lib/nina/prompts/system.ts:28-32` is explicit
about it. But the same rule ends with a sentence that decides this question the other way:

> Never translate his own slang back at him and never explain a slang word to him.

A title is his words, indexed. If he wrote in English about knee pain after long runs, the good
title is `Knee pain long runs`; rendering it as `Nyeri lutut lari jauh` is translating his own words
back at him in a list he has to search. `system.ts:64` records the same split from the other side —
*"the app's screens are in English"* — so the surface is already bilingual and the runner reads both.

So the prompt instructs: **write it in the language he used.** The placeholder stays Indonesian
(`'Chat baru'`, and 0004's `'Semua chat sebelumnya'`) because a placeholder is app chrome and not
his words — the same distinction, applied consistently.

### D9 — The prompt is an indexer, not Nina

`prompts/distill.ts` records the finding: *"**This is not Nina.** She is a person with a voice; this
pass is a librarian, and telling it it is Nina makes it write in her register and editorialise the
facts it is supposed to be recording."* A titler told it is Nina returns `"eh gimana lutut lo"` — her
voice, addressed to him, and useless as a label. The system prompt says "you are an indexer, not a
participant" for that measured reason, and it lives in `lib/nina/title.ts` rather than in
`lib/nina/prompts/` deliberately: that directory is being edited concurrently by the
`nina-character-tuning` orchestration on `main` (phase 3's handoff item 12 records it), and a new
file there is a merge surface for no gain. This prompt is not part of her canon and does not want
`NINA_PROMPT_VERSION`'s cadence; it carries its own `NINA_TITLE_PROMPT_VERSION`, logged and never
sent, on `NINA_DISTILL_PROMPT_VERSION`'s precedent.

---

## Implementation Steps

### Step 1: `lib/nina/title.ts` — the pure half

**File:** `lib/nina/title.ts` (new)
**Change:** the character cap, the shared cleaner, both rules, the parse, the transcript builder,
the system prompt and the tool. No `server-only`, no runtime import at all beyond a type.

**Code:**

```ts
import type Anthropic from '@anthropic-ai/sdk'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  R3, THE PURE HALF: what a session may be called.
 *
 *  Two rules live here and they are deliberately not the same rule.
 *
 *   · `sanitizeNinaSessionTitle` is what HE typed. It cleans and clamps and refuses nothing else,
 *     because a name he chose is an instruction.
 *   · `sanitizeNinaModelTitle` is what the MODEL guessed. It cleans, enforces R3's 3-4 words, and
 *     REFUSES anything that is not a name — a bad title is worse than no title, because the title
 *     is what the whole session list shows. A refusal keeps phase 1's `SESSION_UNTITLED_TITLE`,
 *     which is already on the row, so there is no third state and nothing to clean up.
 *
 *  ── WHY THIS FILE HAS NO `import 'server-only'` AND MUST NEVER GAIN ONE ──────────────────────
 *  The model call is in `lib/nina/autotitle.ts`, alone, and this file is pure so that:
 *    1. `lib/nina/active.ts` can re-export the rename rule while staying client-safe. Phase 3
 *       declares that file pure and phase 6's `searchHitHref` is expected to import `SESSION_PARAM`
 *       out of it from a `'use client'` component.
 *    2. `NINA_SESSION_TITLE_MAX_CHARS` can be read by phase 5's rename input for its `maxLength`.
 *       `phase-5.md` calls that a hazard rather than a detail, and it is right: `lib/llm/client.ts`
 *       reaches `lib/env.ts`, which opens with `import 'server-only'`, and
 *       `components/ui/index.ts` documents at length what that does to a client import.
 *    3. Every rule below is unit-testable under `vitest.config.ts`'s `environment: 'node'`
 *       (invariant 7).
 *  `lib/nina/search.ts` beside `lib/nina/semantic.ts` (phase 6) is the same split for the same
 *  reason. A runtime import from `@/lib/llm/*`, `@/lib/db/*` or `./queries` does not belong here.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * How long a session title may be, in characters, after sanitising. **The set's one cap, imported.**
 *
 * Sixty, declared in phase 1's `lib/nina/sessions.ts` and imported here — see D3 for the
 * adjudication that put it there rather than in this file. Its reasoning is unchanged: R3's
 * automatic titles are three or four words, so this is not a constraint on the titler but the
 * ceiling on a MANUAL rename, and its job is to stop a pasted paragraph becoming a row in the
 * sidebar.
 *
 * ── ONE DECLARATION, ONE NAME, ONE VALUE ────────────────────────────────────────────────────
 * `lib/nina/sessions.ts` declares it; this file, `lib/nina/active.ts` and phase 5's `SessionRow`
 * all import it under this same name. There is no alias, no storage-versus-rule pair and no second
 * number. `sessions.ts` imports nothing at all, so a `'use client'` row can read the constant with
 * no argument about bundles — which is the property phase 5 needed and the reason it is the home.
 * **Do not re-declare it here.**
 */
import { NINA_SESSION_TITLE_MAX_CHARS } from '@/lib/nina/sessions'

/** Bumped by hand whenever the system prompt or the tool schema below changes. Logged, never sent. */
export const NINA_TITLE_PROMPT_VERSION = 1

/**
 * R3's "3-4 words", as the number of words KEPT.
 *
 * Four and not three: the requirement offers a range and the wider end loses less. There is no
 * matching minimum on purpose — see `sanitizeNinaModelTitle`.
 */
export const NINA_TITLE_MAX_WORDS = 4

/**
 * Above this many words the answer is refused instead of truncated.
 *
 * Six. Five or six words is a model that aimed at a title and overshot, and the first four of a
 * six-word noun phrase is still a noun phrase. Seven or more is prose — a sentence, a question, an
 * explanation, a refusal — and `lib/llm/narrate.ts` settles what to do with prose we cannot use:
 * "the only safe fallback for prose is the absence of prose". Cutting a sentence down to four words
 * invents a label out of the middle of a clause.
 */
export const NINA_TITLE_OVERSHOOT_WORDS = 6

/**
 * How many messages of the session the prompt may see.
 *
 * Six covers R3's trigger with room to spare: the first interaction is one runner message plus up
 * to four of her bubbles (RU-5's ceiling), so five, and the sixth is slack. A titler does not get
 * better with more of the conversation — it gets a bigger context to lose four words in, which is
 * the failure F07 measured when it "spent three of four prose fields on the one scalar that
 * happened to be in front of it".
 */
export const NINA_TITLE_TURN_LIMIT = 6

/**
 * How much of one message the prompt may see.
 *
 * `MAX_RUNNER_MESSAGE_CHARS` is 4000, so a first message can legitimately be a pasted training
 * plan. Four hundred characters is more than enough to name a topic and small enough that six of
 * them cannot crowd out the instruction.
 */
export const NINA_TITLE_SNIPPET_CHARS = 400

/**
 * ASCII control characters, replaced by a SPACE rather than removed: a pasted two-line title is
 * two words, not one run-together word.
 */
/* eslint-disable-next-line no-control-regex -- a pasted title can carry NULs and newlines, and the
 * column is a single-line label. */
const CONTROL_RE = /[\u0000-\u001F\u007F]/g

/**
 * The invisible characters `.trim()` does not remove, deleted outright.
 *
 * **This set is why this rule is not phase 3's rule.** Phase 3's class was `[\x00-\x1F\x7F]`, and a
 * paste carrying only `U+200B` survives it, passes its empty check, gets written and renders as a
 * blank sidebar row — indistinguishable from a rendering bug, which is the exact failure
 * `sessionTitleFor` exists to prevent. Bidi overrides (`U+202A-U+202E`, `U+2066-U+2069`) are in the
 * set too: one pasted into a row reverses the rendering of everything around it.
 *
 * **`U+200D` is deliberately NOT here.** It is the zero-width joiner; removing it explodes the
 * emoji family he typed into three separate people, and his own title is his to type (see
 * `sanitizeNinaSessionTitle`).
 */
const INVISIBLE_RE =
  /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/**
 * Emoji and the joiners that glue them together, stripped from a MODEL title only.
 *
 * Unicode property escapes need the `u` flag and `target: ES2022` supplies them; this is their
 * first use in the repo, and the alternative — an explicit range list — would be wrong the day a
 * new emoji block is assigned.
 */
const PICTOGRAPH_RE = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu

/** A title with no letter in it names nothing. Not global: `.test` only, so no `lastIndex`. */
const HAS_LETTER_RE = /\p{L}/u

/**
 * A label the model sometimes prefixes. Four spellings and NOT a general "strip anything before a
 * colon", which would mutilate the legitimate `Cedera lutut: kanan`.
 */
const LABEL_PREFIX_RE = /^(?:title|judul|session title|nama chat)\s*[:\-–—]\s*/i

/**
 * Markdown at either edge. Nothing renders markdown in a bubble or a row — the plan index's scope
 * section keeps it that way deliberately — so an asterisk would be shown literally.
 */
const MARKDOWN_EDGE_RE = /^[#>\-*_~\s]+|[*_~\s]+$/g

/** Sentence punctuation at the end. R3 asked for a name, and a name has no full stop. */
const TRAILING_PUNCT_RE = /[.,;:!?…]+$/

/**
 * Wrapping quote pairs, stripped from a MODEL title. A quoted title is the model quoting itself.
 * ASCII first because it is the common case.
 */
const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['\u201C', '\u201D'],
  ['\u2018', '\u2019'],
  ['\u00AB', '\u00BB'],
]

/**
 * The cleaning both rules share: control characters to spaces, invisibles gone, whitespace
 * collapsed to single spaces, trimmed. After this the word rule can split on a plain `' '`.
 */
function cleanTitleText(raw: string): string {
  return raw.replace(CONTROL_RE, ' ').replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim()
}

/**
 * A loop and not one pass, because a model that quotes a quote returns `"'judul'"` and one pass
 * would leave the inner pair. It terminates: every iteration removes two characters or returns.
 */
function stripWrappingQuotes(value: string): string {
  let current = value
  for (;;) {
    const next = current.trim()
    const pair = QUOTE_PAIRS.find(
      ([open, close]) => next.length >= 2 && next.startsWith(open) && next.endsWith(close),
    )
    if (pair === undefined) return next
    current = next.slice(1, -1)
  }
}

/** Words, given that `cleanTitleText` has already collapsed every run of whitespace. */
function titleWords(value: string): string[] {
  return value.split(' ').filter((word) => word.length > 0)
}

/**
 * **The manual rename rule (R3's second half).** `unknown -> title | null`.
 *
 * `unknown` on purpose, on `parseNinaSessionParam`'s precedent: the caller is a Server Action and a
 * form value is whatever the client posted. `null` is "that is not a title", and
 * `lib/nina/sessionActions.ts` refuses rather than writing it — a session with a blank name is a
 * blank row in the sidebar, which is worse than the placeholder it replaced.
 *
 * ── WHAT THIS DOES NOT DO, AND WHY THE ASYMMETRY IS THE POINT ───────────────────────────────
 * No word rule, no emoji stripping, no quote stripping, no punctuation stripping. R3's "3-4 words"
 * is an instruction to the MODEL. This string is one he typed, and the model's output is a guess we
 * accept on his behalf while his input is an instruction — so `sanitizeNinaModelTitle` is
 * sceptical and this one is not. Stripping the emoji he chose is the app overruling him about his
 * own label.
 *
 * ── AN EMPTY RENAME IS REFUSED, NOT A REVERT ────────────────────────────────────────────────
 * Clearing a title is not a feature anybody asked for; he can rename it to something else. And
 * reverting `title` to NULL would put the session back inside the titler's reach, so "clear the
 * name" would silently mean "let the model rename this" — which is not what an empty input box
 * means.
 *
 * The final `.trim()` is not redundant: `.slice(0, 60)` can cut in the middle of a space.
 */
export function sanitizeNinaSessionTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = cleanTitleText(raw)
  if (cleaned.length === 0) return null
  return cleaned.slice(0, NINA_SESSION_TITLE_MAX_CHARS).trim()
}

/**
 * **R3's automatic title, from whatever the model actually returned.** `string -> title | null`.
 *
 * Every `null` below lands in the same place and it is a place that already exists: the session
 * keeps `title IS NULL`, `setNinaSessionTitleIfUntitled` is never called, and phase 1's
 * `sessionTitleFor` renders `SESSION_UNTITLED_TITLE`. Nothing is persisted on a refusal, so the
 * next turn tries again for free — `lib/llm/narrate.ts`'s rule about not recording a failure.
 *
 * ── THERE IS NO MINIMUM WORD COUNT, DELIBERATELY ────────────────────────────────────────────
 * A two-word `Cedera lutut` is a good name for a session. Enforcing "at least three" would discard
 * it in exchange for `Chat baru`, and Indonesian compounds make word count a poor proxy for how
 * much a phrase says. What is enforced is the MAXIMUM, because that is the one that breaks the
 * sidebar.
 */
export function sanitizeNinaModelTitle(raw: string): string | null {
  const cleaned = cleanTitleText(raw)
  if (cleaned.length === 0) return null

  const unlabelled = cleaned.replace(LABEL_PREFIX_RE, '')
  const unquoted = stripWrappingQuotes(unlabelled)
  const unmarked = unquoted.replace(MARKDOWN_EDGE_RE, '')
  const unpictured = unmarked.replace(PICTOGRAPH_RE, '')
  const collapsed = unpictured.replace(/\s+/g, ' ').trim()
  const unpunctuated = collapsed.replace(TRAILING_PUNCT_RE, '').trim()

  const words = titleWords(unpunctuated)
  if (words.length === 0) return null
  /* Seven words or more is prose, and there is no mechanical transformation from prose to a name. */
  if (words.length > NINA_TITLE_OVERSHOOT_WORDS) return null

  /* Five or six is an overshoot: keep the first four. Truncating can expose a comma. */
  const kept = words.slice(0, NINA_TITLE_MAX_WORDS).join(' ').replace(TRAILING_PUNCT_RE, '').trim()

  if (kept.length === 0) return null
  /* Four words this long are token soup, and clamping would cut a word in half. Refuse instead. */
  if (kept.length > NINA_SESSION_TITLE_MAX_CHARS) return null
  if (!HAS_LETTER_RE.test(kept)) return null
  return kept
}

/**
 * The tool block's `input` -> a title, or nothing.
 *
 * **No Zod, and that is a considered choice.** `DistillPayloadSchema` and `describeInsightIssues`
 * exist because a five-field payload has interesting failure modes and there is a repair to inform.
 * There is no repair here (see `lib/nina/autotitle.ts`), and for `{ title?: unknown }` a type guard
 * is smaller, has no error type nobody reads, and is directly unit-testable.
 */
export function parseNinaTitle(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null
  const value = (raw as { title?: unknown }).title
  if (typeof value !== 'string') return null
  return sanitizeNinaModelTitle(value)
}

/** One message of the session, as the prompt wants it. Structurally a subset of `NinaMessageRow`. */
export interface NinaTitleTurn {
  role: 'runner' | 'nina'
  body: string
}

/**
 * The transcript the prompt sees. `HIM:` / `NINA:`, `prompts/distill.ts`'s labels.
 *
 * A message whose cleaned body is empty contributes NO line: R10 makes a photo with no caption a
 * legitimate send, so an empty `body` is an ordinary row and not a bug. Her reply is still in the
 * transcript and it says what she saw, which is a better input to a title than the raw
 * `nina_message_images.description` would be — see the plan's D7 for why that column is not read
 * here even though a prompt is its sanctioned consumer.
 *
 * `slice(0, NINA_TITLE_TURN_LIMIT)` is a clamp on the prompt's size and not a claim about which end
 * of the conversation matters: the caller reads at most that many rows.
 */
export function titleTranscript(turns: readonly NinaTitleTurn[]): string {
  const lines: string[] = []
  for (const turn of turns.slice(0, NINA_TITLE_TURN_LIMIT)) {
    const body = cleanTitleText(turn.body)
    if (body.length === 0) continue
    lines.push(`${turn.role === 'runner' ? 'HIM' : 'NINA'}: ${body.slice(0, NINA_TITLE_SNIPPET_CHARS)}`)
  }
  return lines.join('\n')
}

/**
 * The user turn, or `null` for "do not call the model at all".
 *
 * The `null` is load-bearing: a session whose only messages are captionless photos produces an
 * empty transcript, and asking a model to name nothing costs tokens to receive an answer that would
 * be refused anyway.
 */
export function buildNinaTitleRequest(turns: readonly NinaTitleTurn[]): string | null {
  const transcript = titleTranscript(turns)
  if (transcript.length === 0) return null
  return `Name this conversation.\n\n${transcript}`
}

/**
 * **This is not Nina.** `prompts/distill.ts` recorded the finding and it applies exactly: "telling
 * it it is Nina makes it write in her register and editorialise". A titler told it is Nina returns
 * "eh gimana lutut lo" — her voice, addressed to him, useless as a label.
 *
 * ── THE LANGUAGE RULE IS HIS, NOT HERS (plan D8) ────────────────────────────────────────────
 * `prompts/system.ts`'s `LANGUAGE_RULE` ends "never translate his own slang back at him", and a
 * title is his words indexed. So the name is in the language HE used; the Indonesian placeholder
 * stays Indonesian because a placeholder is app chrome and not his words.
 *
 * ── AN EMPTY STRING IS A SANCTIONED ANSWER ──────────────────────────────────────────────────
 * The last paragraph gives the model a way to decline. Without it, a greeting-only exchange gets a
 * confabulated topic; with it, the answer is refused by `sanitizeNinaModelTitle`, the placeholder
 * stands, and the next turn tries again.
 */
export const NINA_TITLE_SYSTEM_PROMPT = `You name one conversation. You are an indexer, not a participant: you never speak to the runner, you never write in Nina's voice, and you never answer anything you read in the transcript.

Return the name through the "title" tool. Nothing else.

THE NAME
Three or four words. What the conversation is ABOUT — the topic, the injury, the race, the meal, the plan, the argument. A noun phrase, the way a folder is named.

IN HIS LANGUAGE
Write it in the language HE used. If he wrote Indonesian, the name is Indonesian; if he wrote English, the name is English. Never translate his own words into the other language — this name is how HE will find this conversation again.

NEVER
- A sentence, a question, or anything ending in a full stop.
- Quotation marks, backticks, markdown, emoji, or a "Title:" prefix. Just the words.
- The words chat, obrolan, percakapan, sesi, conversation. Every conversation is one of those, so the name would say nothing.
- His name, or yours.
- A greeting. "Halo pagi" names nothing — if he greeted you and then asked about his knee, the name is about his knee.

If the exchange is only a greeting, or nothing was really said, return the tool with an empty string. That is a correct answer, and it is better than a name that lies about what is in here.`

/**
 * `maxLength` inside `input_schema` is a JSON Schema keyword, not a request field — `DISTILL_TOOL`
 * already sends `maxItems` and `minimum` to this endpoint. `lib/llm/client.ts`'s warning about
 * unknown fields is about the REQUEST envelope (`strict`, `cache_control`, `temperature`), which
 * this body does not touch.
 *
 * The tool's property description is part of the prompt — `prompts/index.ts` says so of
 * `./tools.ts` and it is true here — so an edit to it bumps `NINA_TITLE_PROMPT_VERSION`.
 */
export const NINA_TITLE_TOOL: Anthropic.Tool = {
  name: 'title',
  description: 'Name this conversation in three or four words.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      title: {
        type: 'string',
        maxLength: NINA_SESSION_TITLE_MAX_CHARS,
        description:
          'REQUIRED. Three or four words naming what this conversation is about, in the language ' +
          'he used. No punctuation, no quotes, no emoji, no prefix. An empty string if the ' +
          'exchange says nothing worth naming.',
      },
    },
  },
}
```

**Impact:** a new module with no dependents until steps 3 and 5. `npm run lint`,
`format:check`, `typecheck` and `test` all pass on this file alone.

---

### Step 2: `lib/nina/title.test.ts` — the suite invariant 7 requires

**File:** `lib/nina/title.test.ts` (new)
**Change:** assert every branch of D5 and D6. Co-located, matching `lib/nina/album.test.ts`,
`attach.test.ts`, `chatview.test.ts` and phase 1's `lib/nina/sessions.test.ts`.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  NINA_SESSION_TITLE_MAX_CHARS,
  NINA_TITLE_MAX_WORDS,
  NINA_TITLE_OVERSHOOT_WORDS,
  NINA_TITLE_SNIPPET_CHARS,
  NINA_TITLE_SYSTEM_PROMPT,
  NINA_TITLE_TOOL,
  NINA_TITLE_TURN_LIMIT,
  buildNinaTitleRequest,
  parseNinaTitle,
  sanitizeNinaModelTitle,
  sanitizeNinaSessionTitle,
  titleTranscript,
  type NinaTitleTurn,
} from './title'

/**
 * R3's pure rules. The interesting cases are not the happy paths — they are the ones where the
 * model misbehaved, because a bad title is worse than no title: it is what the whole session list
 * shows, and a refusal costs nothing since phase 1's placeholder is already on the row.
 */

describe('sanitizeNinaSessionTitle — what HE typed', () => {
  it('keeps a plain title', () => {
    expect(sanitizeNinaSessionTitle('Latihan half marathon')).toBe('Latihan half marathon')
  })

  it('trims and collapses whitespace', () => {
    expect(sanitizeNinaSessionTitle('  Latihan   pagi \n ')).toBe('Latihan pagi')
  })

  it('refuses a non-string, because a form value is whatever the client posted', () => {
    expect(sanitizeNinaSessionTitle(undefined)).toBeNull()
    expect(sanitizeNinaSessionTitle(null)).toBeNull()
    expect(sanitizeNinaSessionTitle(42)).toBeNull()
    expect(sanitizeNinaSessionTitle(['Latihan'])).toBeNull()
  })

  it('refuses empty and whitespace-only — a blank row is worse than the placeholder', () => {
    expect(sanitizeNinaSessionTitle('')).toBeNull()
    expect(sanitizeNinaSessionTitle('   ')).toBeNull()
    expect(sanitizeNinaSessionTitle('\n\t')).toBeNull()
  })

  it('strips control characters a paste can carry, as SPACES not deletions', () => {
    expect(sanitizeNinaSessionTitle('Latihan\u0000pagi')).toBe('Latihan pagi')
    expect(sanitizeNinaSessionTitle('Latihan\u001Fpagi')).toBe('Latihan pagi')
  })

  /* The bug this rule exists to fix: phase 3's class did not cover these, and a title made only of
   * them passes an empty check, gets written, and renders as a blank sidebar row. */
  it('refuses a title made only of invisible characters', () => {
    expect(sanitizeNinaSessionTitle('\u200B')).toBeNull()
    expect(sanitizeNinaSessionTitle('\uFEFF\u200B\u2060')).toBeNull()
    expect(sanitizeNinaSessionTitle('\u202E')).toBeNull()
  })

  it('strips invisible characters from around real words', () => {
    expect(sanitizeNinaSessionTitle('\u200BLatihan\u200Bpagi\uFEFF')).toBe('Latihanpagi')
  })

  it('keeps the zero-width joiner, so his emoji family survives', () => {
    const family = 'Keluarga \u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
    expect(sanitizeNinaSessionTitle(family)).toBe(family)
  })

  it('keeps his emoji, his quotes and his full stop — his label is his instruction', () => {
    expect(sanitizeNinaSessionTitle('Latihan pagi 🔥')).toBe('Latihan pagi 🔥')
    expect(sanitizeNinaSessionTitle('"Latihan pagi"')).toBe('"Latihan pagi"')
    expect(sanitizeNinaSessionTitle('Latihan pagi.')).toBe('Latihan pagi.')
  })

  it('imposes NO word limit on him — R3 constrains the model, not the runner', () => {
    const his = 'Latihan half marathon bulan Desember tahun ini'
    expect(sanitizeNinaSessionTitle(his)).toBe(his)
  })

  it('clamps at the cap and leaves no trailing space behind the cut', () => {
    const long = `${'a'.repeat(NINA_SESSION_TITLE_MAX_CHARS - 1)} bcd`
    const result = sanitizeNinaSessionTitle(long)
    expect(result).toHaveLength(NINA_SESSION_TITLE_MAX_CHARS - 1)
    expect(result?.endsWith(' ')).toBe(false)
  })
})

describe('sanitizeNinaModelTitle — what the MODEL guessed', () => {
  it('keeps a three or four word answer verbatim', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut kanan')).toBe('Cedera lutut kanan')
    expect(sanitizeNinaModelTitle('Rencana half marathon Desember')).toBe(
      'Rencana half marathon Desember',
    )
  })

  it('accepts one and two word answers rather than falling back to the placeholder', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('Karbohidrat')).toBe('Karbohidrat')
  })

  it('refuses the empty string the prompt sanctions', () => {
    expect(sanitizeNinaModelTitle('')).toBeNull()
    expect(sanitizeNinaModelTitle('   ')).toBeNull()
  })

  it('strips wrapping quotes, including a quoted quote', () => {
    expect(sanitizeNinaModelTitle('"Cedera lutut kanan"')).toBe('Cedera lutut kanan')
    expect(sanitizeNinaModelTitle("'Cedera lutut'")).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('`Cedera lutut`')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('\u201CCedera lutut\u201D')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('"\'Cedera lutut\'"')).toBe('Cedera lutut')
  })

  it('strips a Title: or Judul: prefix', () => {
    expect(sanitizeNinaModelTitle('Judul: Cedera lutut')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('Title - Knee pain')).toBe('Knee pain')
    expect(sanitizeNinaModelTitle('TITLE: Knee pain')).toBe('Knee pain')
  })

  it('does not strip a colon that is part of the name', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut: kanan')).toBe('Cedera lutut: kanan')
  })

  it('strips markdown, because nothing renders it in a row', () => {
    expect(sanitizeNinaModelTitle('**Cedera lutut**')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('# Cedera lutut')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('- Cedera lutut')).toBe('Cedera lutut')
  })

  it('strips emoji from a machine title but keeps the words', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut 🔥')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('🏃 Latihan pagi')).toBe('Latihan pagi')
  })

  it('strips a trailing full stop, comma or question mark', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut kanan.')).toBe('Cedera lutut kanan')
    expect(sanitizeNinaModelTitle('Cedera lutut kanan!')).toBe('Cedera lutut kanan')
    expect(sanitizeNinaModelTitle('Cedera lutut kanan…')).toBe('Cedera lutut kanan')
  })

  it('keeps the first four words of a five or six word overshoot', () => {
    expect(sanitizeNinaModelTitle('Rencana half marathon bulan Desember')).toBe(
      'Rencana half marathon bulan',
    )
    expect(sanitizeNinaModelTitle('a b c d e f')).toBe('a b c d')
  })

  it('leaves no dangling comma behind the truncation', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut kanan, sakit banget')).toBe('Cedera lutut kanan')
  })

  it('refuses seven or more words — a sentence is not a title', () => {
    expect(sanitizeNinaModelTitle('a b c d e f g')).toBeNull()
    expect(
      sanitizeNinaModelTitle('Dia bertanya tentang cedera lutut kanannya setelah lari jauh'),
    ).toBeNull()
  })

  it('refuses a refusal, because a refusal is prose', () => {
    expect(
      sanitizeNinaModelTitle('I am sorry, I cannot name this conversation for you.'),
    ).toBeNull()
    expect(sanitizeNinaModelTitle('Maaf, saya tidak bisa membuat judul untuk ini.')).toBeNull()
  })

  it('refuses four words that are too long to be a title', () => {
    expect(sanitizeNinaModelTitle(`${'a'.repeat(58)} b c d`)).toBeNull()
  })

  it('refuses an answer with no letter left in it', () => {
    expect(sanitizeNinaModelTitle('...')).toBeNull()
    expect(sanitizeNinaModelTitle('🔥🔥')).toBeNull()
    expect(sanitizeNinaModelTitle('"" ')).toBeNull()
  })

  it('refuses invisible-only, like the manual rule', () => {
    expect(sanitizeNinaModelTitle('\u200B\uFEFF')).toBeNull()
  })

  it('never returns something over the cap', () => {
    const answers = ['Cedera lutut kanan', `${'x'.repeat(200)}`, 'a b c d e f', '']
    for (const answer of answers) {
      const result = sanitizeNinaModelTitle(answer)
      if (result !== null) expect(result.length).toBeLessThanOrEqual(NINA_SESSION_TITLE_MAX_CHARS)
    }
  })

  it('never returns more than NINA_TITLE_MAX_WORDS words', () => {
    const result = sanitizeNinaModelTitle('satu dua tiga empat lima')
    expect(result?.split(' ')).toHaveLength(NINA_TITLE_MAX_WORDS)
  })
})

describe('parseNinaTitle — the tool block', () => {
  it('reads the title property', () => {
    expect(parseNinaTitle({ title: 'Cedera lutut kanan' })).toBe('Cedera lutut kanan')
  })

  it('refuses anything that is not an object with a string title', () => {
    expect(parseNinaTitle(null)).toBeNull()
    expect(parseNinaTitle(undefined)).toBeNull()
    expect(parseNinaTitle('Cedera lutut')).toBeNull()
    expect(parseNinaTitle({})).toBeNull()
    expect(parseNinaTitle({ title: 42 })).toBeNull()
    expect(parseNinaTitle({ title: null })).toBeNull()
    expect(parseNinaTitle({ name: 'Cedera lutut' })).toBeNull()
  })

  it('applies the whole model rule, not just the type check', () => {
    expect(parseNinaTitle({ title: '"Cedera lutut."' })).toBe('Cedera lutut')
    expect(parseNinaTitle({ title: '' })).toBeNull()
    expect(parseNinaTitle({ title: 'a b c d e f g' })).toBeNull()
  })
})

describe('titleTranscript and buildNinaTitleRequest', () => {
  const turns: NinaTitleTurn[] = [
    { role: 'runner', body: 'lutut gw sakit abis lari 15k' },
    { role: 'nina', body: 'sakitnya di bagian mana' },
  ]

  it('labels the two roles the way the distillation prompt does', () => {
    expect(titleTranscript(turns)).toBe(
      'HIM: lutut gw sakit abis lari 15k\nNINA: sakitnya di bagian mana',
    )
  })

  it('skips a message with an empty body — a captionless photo is a legitimate send', () => {
    expect(titleTranscript([{ role: 'runner', body: '   ' }, ...turns])).toBe(
      'HIM: lutut gw sakit abis lari 15k\nNINA: sakitnya di bagian mana',
    )
  })

  it('caps the number of messages', () => {
    const many: NinaTitleTurn[] = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? ('runner' as const) : ('nina' as const),
      body: `pesan ${String(index)}`,
    }))
    expect(titleTranscript(many).split('\n')).toHaveLength(NINA_TITLE_TURN_LIMIT)
  })

  it('caps the length of one message', () => {
    const long = [{ role: 'runner' as const, body: 'x'.repeat(4000) }]
    /* 'HIM: ' is five characters. */
    expect(titleTranscript(long)).toHaveLength(NINA_TITLE_SNIPPET_CHARS + 5)
  })

  it('builds a request with the transcript in it', () => {
    const request = buildNinaTitleRequest(turns)
    expect(request).toContain('lutut gw sakit abis lari 15k')
    expect(request?.startsWith('Name this conversation.')).toBe(true)
  })

  it('returns null when there is nothing to name, so no call is made', () => {
    expect(buildNinaTitleRequest([])).toBeNull()
    expect(buildNinaTitleRequest([{ role: 'runner', body: '' }])).toBeNull()
    expect(buildNinaTitleRequest([{ role: 'nina', body: '\u200B' }])).toBeNull()
  })
})

describe('the prompt and the tool', () => {
  it('forces the tool the caller looks for by name', () => {
    expect(NINA_TITLE_TOOL.name).toBe('title')
    expect(NINA_TITLE_TOOL.input_schema.required).toEqual(['title'])
  })

  /* The 3-4 word instruction has to be IN the prompt, because the code enforces only the maximum
   * (there is no minimum, deliberately) — so the prompt is the only place the range is asked for. */
  it('asks for three or four words and forbids the useless words', () => {
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('Three or four words')
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('percakapan')
  })

  it('tells it to write in his language and not to translate', () => {
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('language HE used')
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('Never translate')
  })

  it('tells it it is not Nina', () => {
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('not a participant')
  })

  it('offers the empty string as a sanctioned answer', () => {
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('empty string')
  })

  it('keeps the overshoot window above the keep window', () => {
    expect(NINA_TITLE_OVERSHOOT_WORDS).toBeGreaterThan(NINA_TITLE_MAX_WORDS)
  })
})
```

**Impact:** `npm test` gains ~45 assertions and no dependency on a database, a network or a DOM.

---

### Step 3: `lib/nina/autotitle.ts` — the model call and the two guards

**File:** `lib/nina/autotitle.ts` (new)
**Change:** the one impure module of this phase. It holds the guarded symbol, and it is the only
file besides `lib/nina/actions.ts` that the payload guard sanctions for it.

**Code:**

```ts
import 'server-only'

import type { NinaSessionTitleSource } from '@/lib/db/schema'
import { narrativeClient, narrativeModel } from '@/lib/llm/client'
import type Anthropic from '@anthropic-ai/sdk'

import { getNinaSession, listNinaMessages, setNinaSessionTitleIfUntitled } from './queries'
import {
  NINA_TITLE_PROMPT_VERSION,
  NINA_TITLE_SYSTEM_PROMPT,
  NINA_TITLE_TOOL,
  NINA_TITLE_TURN_LIMIT,
  buildNinaTitleRequest,
  parseNinaTitle,
  type NinaTitleTurn,
} from './title'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  R3, THE IMPURE HALF: one small `glm-5.3` call that names a session.
 *
 *  Contract, `lib/llm/narrate.ts`'s minus its repair: **one call -> parse -> silence.** Nothing in
 *  this file throws for a model problem, and nothing is persisted when it fails — no marker, no
 *  negative cache — so the next turn tries again for free. Degrading means the session keeps phase
 *  1's `SESSION_UNTITLED_TITLE`, which is already on the row.
 *
 *  ── WHY THERE IS NO REPAIR ROUND TRIP, UNLIKE narrate.ts AND distill.ts ──────────────────────
 *  Both of those spend a second call because a five-field object can be malformed in ways worth
 *  describing back. A single short string cannot: a sentence is not repairable into a name (see
 *  `sanitizeNinaModelTitle` and narrate.ts's "the only safe fallback for prose is the absence of
 *  prose"), and an empty string is an answer the prompt explicitly asks for. A repair here would
 *  double the deadline of a label.
 *
 *  ── AND WHY THE CALL IS NEVER AWAITED (invariant 2) ─────────────────────────────────────────
 *  It runs from `lib/nina/actions.ts` inside `after()`, which is also why THIS file exports a
 *  plain async function and never calls `after()` itself: `after()` throws E468 outside a request
 *  scope — the lesson `scheduleDistillation` records. `scripts/check-llm-payload-boundary.mjs`
 *  names `titleNinaSessionIfNeeded` and sanctions exactly this file and `actions.ts`.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ── budgets, and they are this call's own ────────────────────────────────────────────────────
 *
 * `NINA_MAX_TOKENS` is 2400 because Nina's payload is four bubbles of prose. This payload is one
 * string of at most 60 characters — under 32 output tokens — so every token below the ceiling is
 * headroom for a `thinking` block nobody asked for. The 2026-09-03 probe recorded one arriving on
 * this endpoint with `thinking: { type: 'disabled' }` set, which is why the flag is sent and not
 * relied on (`distill.ts`'s phrasing).
 *
 * The ceiling is deliberately LOW rather than generous, which is the opposite of `turn.ts`'s call
 * and for a concrete reason: **output tokens are wall clock** (~26-33 ms each, F04's measurement)
 * and this call shares one 60 s invocation with `runTurnDistillation`'s 34 s budget. 600 tokens is
 * ~16-20 s worst case, which fits beside distillation; 2400 would be ~63-79 s and would starve it.
 * F07 also settled that raising a ceiling is not the fix for a thinking model — "4000 tokens buys
 * 4000 tokens of thinking and still no answer" — so a `max_tokens` stop is treated as "no title"
 * and the next turn retries for free.
 *
 * The timeout is 12 s. Fifteen measured calls on this endpoint were 10.2-16.4 s for F07's
 * five-field narrative, and the 2026-09-03 Nina probe measured a real round at 6.2 s; this request
 * carries at most six short messages and returns four words, so it sits at the bottom of that
 * range. 12 s is above every observed floor and is the largest number that leaves distillation
 * whole in the measured case.
 */
export const NINA_TITLE_MAX_TOKENS = 600
export const NINA_TITLE_TIMEOUT_MS = 12_000

/**
 * The injection seam, declared here rather than imported from `lib/llm/narrate.ts` —
 * `distill.ts` made the same call and gave the reason: "that module is F07's file and reaches F07's
 * types. Six lines duplicated beats a coupling."
 */
export interface TitleClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

/**
 * The three statements this pass needs, injected so the whole decision tree is unit-testable with
 * no database — `distill.ts`'s `NinaMemoryGateway` and `recomputeRecords`'s `RecordsGateway`.
 *
 * All three are phase 1's, and phase 1 wrote `writeTitleIfUntitled`'s statement specifically for
 * this caller. **No query is added by this phase**, which is what keeps `lib/nina/queries.ts`
 * exclusively phase 1's file.
 */
export interface NinaTitleStore {
  readTitle(
    userId: string,
    sessionId: string,
  ): Promise<{ title: string | null; titleSource: NinaSessionTitleSource | null } | null>
  readTurns(userId: string, sessionId: string): Promise<NinaTitleTurn[]>
  writeTitleIfUntitled(userId: string, sessionId: string, title: string): Promise<boolean>
}

export const dbNinaTitleStore: NinaTitleStore = {
  async readTitle(userId, sessionId) {
    const session = await getNinaSession(userId, sessionId)
    return session === null ? null : { title: session.title, titleSource: session.titleSource }
  },
  async readTurns(userId, sessionId) {
    const rows = await listNinaMessages(userId, { limit: NINA_TITLE_TURN_LIMIT, sessionId })
    return rows.map((row) => ({ role: row.role, body: row.body }))
  },
  async writeTitleIfUntitled(userId, sessionId, title) {
    return setNinaSessionTitleIfUntitled(userId, sessionId, title)
  },
}

/**
 * SCANS the content array rather than reading `content[0]`, because `distill.ts` recorded a
 * `thinking` block arriving in front of the answer — "a reader that read the first block would have
 * failed on round 1 of that very probe".
 */
function findTitleBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === NINA_TITLE_TOOL.name) return block
  }
  return null
}

/** The testable core. Client injected, no database, no environment beyond the model id. */
export async function titleNinaSessionWith(
  client: TitleClientLike,
  turns: readonly NinaTitleTurn[],
  options: { model: string },
): Promise<string | null> {
  const request = buildNinaTitleRequest(turns)
  /* Nothing to name — a session of captionless photos. No call, no tokens. */
  if (request === null) return null

  let message: Anthropic.Message
  try {
    message = await client.messages.create(
      {
        model: options.model,
        max_tokens: NINA_TITLE_MAX_TOKENS,
        system: NINA_TITLE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: request }],
        tools: [NINA_TITLE_TOOL],
        tool_choice: { type: 'tool', name: NINA_TITLE_TOOL.name },
        /* Kept, not relied on — see the budget note above. */
        thinking: { type: 'disabled' },
      },
      { timeout: NINA_TITLE_TIMEOUT_MS },
    )
  } catch (cause) {
    /* Never `console.error`: a session that did not get named is an expected state of this feature.
     * The placeholder renders and the next turn tries again. */
    console.warn('[nina.title] call failed', { error: String(cause) })
    return null
  }

  /* A `max_tokens` stop is a response cut mid-object, and the same prompt with the same ceiling
   * cuts it again — narrate.ts's and distill.ts's shared ruling. Here it almost always means the
   * ceiling went to a `thinking` block, which is why the log names the number. */
  if (message.stop_reason === 'max_tokens') {
    console.warn('[nina.title] response hit the token ceiling', {
      maxTokens: NINA_TITLE_MAX_TOKENS,
    })
    return null
  }

  const block = findTitleBlock(message)
  if (block === null) return null
  return parseNinaTitle(block.input)
}

/**
 * **The wired pass, and the symbol the payload-boundary guard names.** Called from exactly one
 * place: `after(() => titleNinaSessionIfNeeded(userId, sessionId))` on `sendNinaMessage`'s success
 * path.
 *
 * ── R3's TRIGGER, AS THREE CHECKS IN COST ORDER ─────────────────────────────────────────────
 *  1. `title IS NULL` on a session that is his — one primary-key read. This is the COST guard:
 *     without it every turn in an already-named session would spend a model call to learn the
 *     answer was on disk. It also answers "is a manual title ever overwritten" with a flat no,
 *     because `renameNinaSession` sets `title` and `titleSource = 'manual'` in one statement, and
 *     migration 0004's legacy session carries `title_source = 'backfill'`. Both are non-NULL, so
 *     both are out of reach here and again in check 3.
 *  2. **One runner row AND at least one Nina row**, which is R3's "(user then nina)" literally.
 *     Free — the rows were read for the prompt anyway. It is also what stops a session holding only
 *     a proactive message from being named: assumption A3 puts cron messages in the most recent
 *     session, and a session where she spoke and he never answered has nothing to name.
 *  3. `setNinaSessionTitleIfUntitled`'s `WHERE … AND title IS NULL` — the CORRECTNESS guard, and
 *     the durable one. `hasProactiveMessageForRun`'s docstring states the rule: "a serverless
 *     invocation has no memory of the previous one, so the marker has to be a row". `after()` can
 *     run more than once and two tabs can finish the same first exchange at the same moment; both
 *     may call the model, one `UPDATE` matches a row and the other matches nothing. One title, no
 *     error, no second write.
 *
 *  Checks 1 and 3 are not redundant. Check 1 asks "is this call worth making" and may be stale by
 *  microseconds without harming anything; check 3 asks "may this write land" and is evaluated
 *  inside the statement by Postgres, so it cannot be stale at all.
 *
 * **Never throws.** It runs in `after()`, where a rejection is a log line and nothing else, and a
 * session without a name is a cosmetic state with a free retry behind it.
 */
export async function titleNinaSessionIfNeeded(
  userId: string,
  sessionId: string,
  deps: { store?: NinaTitleStore; client?: TitleClientLike; model?: string } = {},
): Promise<void> {
  try {
    const store = deps.store ?? dbNinaTitleStore

    const session = await store.readTitle(userId, sessionId)
    /* Not his, or gone. One outcome, as everywhere in `queries.ts`. */
    if (session === null) return
    if (session.title !== null) {
      console.info('[nina.title] already named, no call made', { source: session.titleSource })
      return
    }

    const turns = await store.readTurns(userId, sessionId)
    const spoke = turns.some((turn) => turn.role === 'runner')
    const answered = turns.some((turn) => turn.role === 'nina')
    if (!spoke || !answered) return

    const title = await titleNinaSessionWith(deps.client ?? narrativeClient(), turns, {
      model: deps.model ?? narrativeModel(),
    })
    if (title === null) return

    const written = await store.writeTitleIfUntitled(userId, sessionId, title)
    console.info('[nina.title] done', {
      promptVersion: NINA_TITLE_PROMPT_VERSION,
      written,
      chars: title.length,
    })
  } catch (cause) {
    console.warn('[nina.title] pass failed entirely', { error: String(cause) })
  }
}
```

**Impact:** introduces the guarded symbol. `npm run ci:llm-payload-guard` still passes before step 6
(an unlisted symbol is simply not guarded) and passes after it because both call sites are
sanctioned.

---

### Step 4: `lib/nina/autotitle.test.ts` — the decision tree, with no database

**File:** `lib/nina/autotitle.test.ts` (new)
**Change:** drive `titleNinaSessionIfNeeded` and `titleNinaSessionWith` through a fake store and a
fake client, the way `tests/llm.narrate.test.ts` and `lib/nina/turn.test.ts` drive theirs. The
double-`after()` case is here, and it is the phase's headline exit criterion.

**Code:**

```ts
import type Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NINA_TITLE_MAX_TOKENS,
  dbNinaTitleStore,
  titleNinaSessionIfNeeded,
  titleNinaSessionWith,
  type NinaTitleStore,
  type TitleClientLike,
} from './autotitle'
import type { NinaTitleTurn } from './title'

const TURNS: NinaTitleTurn[] = [
  { role: 'runner', body: 'lutut gw sakit abis lari 15k' },
  { role: 'nina', body: 'sakitnya di sisi luar atau dalam' },
]

function toolMessage(input: unknown, stopReason: Anthropic.Message['stop_reason'] = 'tool_use') {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'glm-5.3',
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 200, output_tokens: 8 },
    content: [{ type: 'tool_use', id: 'tu_1', name: 'title', input }],
  } as unknown as Anthropic.Message
}

function clientReturning(message: Anthropic.Message): TitleClientLike {
  return { messages: { create: vi.fn(async () => message) } }
}

/** A store whose session starts untitled and is written at most once, like the real UPDATE. */
function fakeStore(overrides: Partial<NinaTitleStore> = {}): NinaTitleStore & {
  written: string[]
} {
  const state: { title: string | null } = { title: null }
  const written: string[] = []
  const store: NinaTitleStore & { written: string[] } = {
    written,
    readTitle: async () => ({ title: state.title, titleSource: state.title === null ? null : 'auto' }),
    readTurns: async () => TURNS,
    /* The `title IS NULL` predicate, in memory. */
    writeTitleIfUntitled: async (_userId, _sessionId, title) => {
      if (state.title !== null) return false
      state.title = title
      written.push(title)
      return true
    },
    ...overrides,
  }
  return store
}

describe('titleNinaSessionWith', () => {
  it('returns the sanitised title from the tool block', async () => {
    const client = clientReturning(toolMessage({ title: '"Cedera lutut kanan."' }))
    await expect(titleNinaSessionWith(client, TURNS, { model: 'm' })).resolves.toBe(
      'Cedera lutut kanan',
    )
  })

  it('sends the forced tool, the disabled thinking flag and its own ceiling', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut' }))
    await titleNinaSessionWith({ messages: { create } }, TURNS, { model: 'glm-5.3' })
    const [body, options] = create.mock.calls[0] ?? []
    expect(body?.max_tokens).toBe(NINA_TITLE_MAX_TOKENS)
    expect(body?.tool_choice).toEqual({ type: 'tool', name: 'title' })
    expect(body?.thinking).toEqual({ type: 'disabled' })
    expect(options?.timeout).toBeGreaterThan(0)
  })

  it('makes NO call when there is nothing to name', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut' }))
    await expect(
      titleNinaSessionWith({ messages: { create } }, [{ role: 'runner', body: '  ' }], {
        model: 'm',
      }),
    ).resolves.toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('degrades to null when the call throws, and does not rethrow', async () => {
    const client: TitleClientLike = {
      messages: {
        create: vi.fn(async () => {
          throw new Error('socket hang up')
        }),
      },
    }
    await expect(titleNinaSessionWith(client, TURNS, { model: 'm' })).resolves.toBeNull()
  })

  it('degrades on a max_tokens stop rather than using a cut answer', async () => {
    const client = clientReturning(toolMessage({ title: 'Cedera' }, 'max_tokens'))
    await expect(titleNinaSessionWith(client, TURNS, { model: 'm' })).resolves.toBeNull()
  })

  it('degrades when the tool block is absent', async () => {
    const message = {
      ...toolMessage({ title: 'x' }),
      content: [{ type: 'text', text: 'Cedera lutut kanan' }],
    } as unknown as Anthropic.Message
    await expect(titleNinaSessionWith(clientReturning(message), TURNS, { model: 'm' })).resolves
      .toBeNull()
  })

  it('finds the tool block behind a thinking block', async () => {
    const message = {
      ...toolMessage({ title: 'Cedera lutut' }),
      content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'tool_use', id: 'tu_1', name: 'title', input: { title: 'Cedera lutut' } },
      ],
    } as unknown as Anthropic.Message
    await expect(titleNinaSessionWith(clientReturning(message), TURNS, { model: 'm' })).resolves.toBe(
      'Cedera lutut',
    )
  })

  it('degrades when the answer is prose', async () => {
    const client = clientReturning(
      toolMessage({ title: 'Dia bertanya tentang cedera lutut kanannya setelah lari jauh' }),
    )
    await expect(titleNinaSessionWith(client, TURNS, { model: 'm' })).resolves.toBeNull()
  })
})

describe('titleNinaSessionIfNeeded', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('names an untitled session after the first exchange', async () => {
    const store = fakeStore()
    const client = clientReturning(toolMessage({ title: 'Cedera lutut kanan' }))
    await titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' })
    expect(store.written).toEqual(['Cedera lutut kanan'])
  })

  /* The headline exit criterion: after() can run twice and two tabs can race. */
  it('fires exactly once per session under a double-invoked after()', async () => {
    const store = fakeStore()
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut kanan' }))
    const client: TitleClientLike = { messages: { create } }

    await titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' })
    await titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' })

    expect(store.written).toEqual(['Cedera lutut kanan'])
    /* The second invocation short-circuits on the cheap read: one model call, not two. */
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('survives two tabs that both got past the cheap read', async () => {
    const store = fakeStore()
    const client = clientReturning(toolMessage({ title: 'Cedera lutut kanan' }))
    await Promise.all([
      titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' }),
      titleNinaSessionIfNeeded('u1', 's1', { store, client, model: 'm' }),
    ])
    expect(store.written).toEqual(['Cedera lutut kanan'])
  })

  it('never overwrites a title he typed himself', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut kanan' }))
    const store = fakeStore({
      readTitle: async () => ({ title: 'Rencana lari gw', titleSource: 'manual' }),
    })
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
    expect(store.written).toEqual([])
  })

  it("never renames migration 0004's backfilled session", async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut kanan' }))
    const store = fakeStore({
      readTitle: async () => ({ title: 'Semua chat sebelumnya', titleSource: 'backfill' }),
    })
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('does nothing for a session that is not his, or is gone', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut' }))
    const store = fakeStore({ readTitle: async () => null })
    await titleNinaSessionIfNeeded('u1', 'sX', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('does not name a session where only she has spoken (R3 says user THEN nina)', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut' }))
    const store = fakeStore({ readTurns: async () => [{ role: 'nina', body: 'lo ga lari hari ini' }] })
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
    expect(store.written).toEqual([])
  })

  it('does not name a session where only he has spoken', async () => {
    const create = vi.fn(async () => toolMessage({ title: 'Cedera lutut' }))
    const store = fakeStore({ readTurns: async () => [{ role: 'runner', body: 'lutut gw sakit' }] })
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: { messages: { create } },
      model: 'm',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('writes nothing when the model gave no usable title, leaving the retry free', async () => {
    const store = fakeStore()
    await titleNinaSessionIfNeeded('u1', 's1', {
      store,
      client: clientReturning(toolMessage({ title: '' })),
      model: 'm',
    })
    expect(store.written).toEqual([])
  })

  it('never throws, whatever the store does — it runs inside after()', async () => {
    const store = fakeStore({
      readTitle: async () => {
        throw new Error('neon: connection terminated')
      },
    })
    await expect(
      titleNinaSessionIfNeeded('u1', 's1', { store, model: 'm' }),
    ).resolves.toBeUndefined()
  })

  it('ships a production store, so the seam is a test seam and not a second code path', () => {
    expect(typeof dbNinaTitleStore.readTitle).toBe('function')
    expect(typeof dbNinaTitleStore.readTurns).toBe('function')
    expect(typeof dbNinaTitleStore.writeTitleIfUntitled).toBe('function')
  })
})
```

**Impact:** `npm test` gains ~18 assertions. No network: `vitest.config.ts` aliases `server-only`
to `tests/support/serverOnlyStub.ts`, so this module imports cleanly, and every client is injected.

---

### Step 5: `lib/nina/active.ts` — the rename rule moves down one module, under the same name

**File:** `lib/nina/active.ts` — phase-3 plan `:560-581` (`sanitizeNinaSessionTitle` with its
docstring and its `eslint-disable` line). Its cap import from `@/lib/nina/sessions` **and the
same-name `export { NINA_SESSION_TITLE_MAX_CHARS }` beside it** both stay exactly as phase 3 wrote
them. **Do not delete either.** Once the sanitiser's body is gone from this file the re-export is
the import's only remaining consumer, so removing it makes the import unused and fails
`npm run lint`; it is also the path `tests/nina.active.test.ts` reads the cap through, and that
suite is not edited by this phase.

**Change:** delete the declaration and replace it with one re-export. Phase 3's handoff item 4
invites exactly this (*"Replace its body if phase 4's rule differs; do not add a second
sanitiser"*): the rule's body is replaced and no second sanitiser exists.

**RECONCILED — one re-export, not two.** This step originally folded phase 3's local
`NINA_SESSION_TITLE_MAX` into an alias re-export as well. After reconciliation phase 3 declares no
cap: `active.ts` imports `NINA_SESSION_TITLE_MAX_CHARS` from phase 1's `lib/nina/sessions.ts`, which
is the set's single declaration (D3). So there is nothing here to alias, and `active.ts` ends up
with one import line and one re-export line.

**Code** — the two lines that replace them, placed where the constant was, immediately after the
`SESSION_PARAM` declaration:

```ts
/**
 * How long a session title may be, and the rule for what he is allowed to call one.
 *
 * **The rule lives in `lib/nina/title.ts` (phase 4) and is re-exported here so that this module's
 * published surface is unchanged.** `lib/nina/sessionActions.ts` and `tests/nina.active.test.ts`
 * keep importing `sanitizeNinaSessionTitle` from `@/lib/nina/active` and get the same name, the
 * same signature and one implementation. The CAP is imported from `@/lib/nina/sessions` (phase 1),
 * above — one declaration for the whole set.
 *
 * The move exists because `title.ts` holds BOTH title rules — his manual rename and the model's
 * 3-4 word answer — and they share a text cleaner and the same character cap. `title.ts` is pure
 * (a type from `@anthropic-ai/sdk` and one constant from `sessions.ts`); the model call lives in
 * `lib/nina/autotitle.ts`, so nothing `server-only` is reachable from this file and it stays
 * importable from a client component — which matters, because phase 6's `searchHitHref` imports
 * `SESSION_PARAM` from here into a `'use client'` module.
 *
 * Phase 4 also fixed a real hole in the rule while it was there: the old class `[\x00-\x1F\x7F]`
 * did not cover `U+200B` and friends, so a title made only of zero-width characters passed the
 * empty check and rendered as a blank sidebar row.
 */
export { sanitizeNinaSessionTitle } from './title'
```

**Impact:** no call site changes and no behaviour changes except the invisible-character fix.
`tests/nina.active.test.ts` is not edited: every case it asserts still holds (its cap case imports
`NINA_SESSION_TITLE_MAX_CHARS` from `@/lib/nina/active`, which still re-exports it at still 60; its
trim, collapse, control-character and empty cases are all still true). `npm run typecheck` proves the re-export satisfies both importers.

---

### Step 6: `lib/nina/actions.ts` — fill phase 3's seam with the one statement it names

**File:** `lib/nina/actions.ts`. Two edits.

**6a. The import.** Added to the existing block at `:9-29`, in its `./`-relative alphabetical
position — immediately after the `import { runTurnDistillation } from './distill'` line at `:10`:

```ts
import { titleNinaSessionIfNeeded } from './autotitle'
```

(`'./autotitle'` sorts before `'./distill'`; place it above that line if the file's ordering is
strict — `eslint` and `prettier` will confirm which, and the existing block is alphabetical by
module path.)

**6b. The call.** Today the anchor is the success-path `scheduleDistillation({…})` at
`actions.ts:639-645` followed by `return { ok: true, … }` at `:647`. After phase 3 lands, the anchor
is its comment block, findable by the literal string `PHASE 4's SEAM`. **Replace that whole comment
block with the following** — the call it describes, plus a shorter comment that keeps the three
reasons which are still true and drops the "phase 4 will add this" framing:

```ts
  /*
   * STEP 7 — the session's name (R3). `after()` and not `await`, for the same two reasons STEP 6
   * gives: this is another model call on top of a turn that already cost 13-45 s, and invariant 2
   * is enforced by `scripts/check-llm-payload-boundary.mjs` either way. `after()` throws E468
   * outside a request scope, which is why the CALL is here and `titleNinaSessionIfNeeded` never
   * calls it itself.
   *
   * **This exit and no other.** R3's trigger is "the first interaction (user then nina)", and this
   * is the only path on which both rows exist — the `result.payload == null` return above it is a
   * turn where she said nothing, so there is no exchange to name yet.
   *
   * `after()` can run more than once and two tabs can race, so the idempotence is the titler's and
   * not this line's: `setNinaSessionTitleIfUntitled`'s `WHERE … AND title IS NULL` is the durable
   * marker, on `hasProactiveMessageForRun`'s reasoning. `titleNinaSessionIfNeeded` never throws and
   * makes no call at all for a session that already has a name.
   */
  after(() => titleNinaSessionIfNeeded(userId, sessionId))

  return { ok: true, userMessageId: runnerMessageId, bubbles, unavailable: false }
```

`after` is already imported at `:7` and `sessionId` is in scope from phase 3's STEP 0e. No other
line of this function changes, which is what phase 3's seam asked for.

**Impact:** the feature becomes live. `npm run ci:llm-payload-guard` now sees a call to a guarded
symbol from `lib/nina/actions.ts`, which step 7 sanctions.

---

### Step 7: `scripts/check-llm-payload-boundary.mjs` — both new entries, one commit

**File:** `scripts/check-llm-payload-boundary.mjs`. Two edits, and this is the only phase in the set
that may make either.

**7a. The header, `:22-44`.** It currently claims *"NOW COVERS FOUR ENTRY POINTS. THIS TABLE IS
COMPLETE"* and lists four bullets, while the table has held five since `resolveNinaPromises` landed.
Replace lines 22-44 (the banner and the five bullet paragraphs, up to and including the
`describeNinaImage` bullet) with:

```js
// ── RULE 2 STANDS, AND NOW COVERS SEVEN ENTRY POINTS. THIS TABLE IS COMPLETE ──────────────────
// A MODEL CALL IS NEVER AWAITED FROM A PAGE RENDER (plan §7.2, and F33 plan invariant 4).
//
// All seven entries ship from the phase that owns this file, and NO OTHER PHASE EDITS IT. The
// last two arrived together in F35 phase 4 and one of the two symbols did not exist yet — phase 6
// creates it — and the entry is written for it anyway, because the alternative was two phases each
// appending to one guard: two merge conflicts, and a window in each of them where the new
// expensive call was unguarded precisely while it was new. An entry naming a symbol that does not
// exist costs nothing (nothing calls it, so nothing is checked); a call with no entry costs the
// whole point of the file.
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
//   · `resolveNinaPromises` — the promise sweep asks `generateNinaAvatar` for a photograph, so it
//     is a model call behind two indexed reads. It runs from the nightly cron route and nowhere
//     else. This bullet was missing while the table entry was not, which is the kind of drift a
//     table with a prose header invites; the count above is now the length of the array below.
//   · `describeNinaImage` — a `glm-4.6v` describe pass, 5-15 s. `components/nina/Composer.tsx`
//     fires it on pick, from a client event handler, so the description is already in hand by
//     the time he hits send. A render that awaited it would block the chat on a thumbnail.
//   · `titleNinaSessionIfNeeded` — F35 R3's titler. A THIRD model call in the same invocation as
//     a turn and its distillation, so its own ceiling is 600 tokens and its timeout 12 s rather
//     than the turn's 2400/22 s — sized to fit beside `distillNinaMemory` under one 60 s
//     function, not to be fast. It runs from `lib/nina/actions.ts` inside `after()`. A render
//     that awaited it would make the runner wait for a label he cannot see yet.
//   · `rankNinaSearchHits` — F35 R6's semantic search pass over SQL-narrowed candidates. A search
//     BOX is the one surface where a 10-16 s await is most tempting and most wrong: the text
//     results are already correct and already on screen, so awaiting the model would replace a
//     complete list with a spinner. It runs from `lib/nina/searchActions.ts`, a Server Action
//     fired from the sidebar's field.
//
// Fix the code, never silence the check.
```

**7b. The table.** Two entries appended to `GUARDED_CALLS`, after the `describeNinaImage` entry and
before the closing `]` at `:128`:

```js
  {
    symbol: 'titleNinaSessionIfNeeded',
    sanctioned: [
      // Its own module, because a guard that fails on the definition site is a guard that forces
      // the definition to be renamed — the reason `runNinaTurn` sanctions `lib/nina/turn.ts`.
      join('lib', 'nina', 'autotitle.ts'),
      join('lib', 'nina', 'actions.ts'),
    ],
    advice:
      'The session titler is a third model call in an invocation that already made two (F35 R3). ' +
      'It runs from lib/nina/actions.ts inside after(), on sendNinaMessage\'s success path only, ' +
      'and never on a render path. The pure rules it needs are in lib/nina/title.ts, which is ' +
      'client-safe and imports no model client — import from there, not from here.',
  },
  {
    symbol: 'rankNinaSearchHits',
    sanctioned: [
      // Phase 6 split lib/nina/semantic.ts out of lib/nina/search.ts precisely so this list can
      // sanction the definition site while the pure ranking rules stay importable everywhere.
      join('lib', 'nina', 'semantic.ts'),
      join('lib', 'nina', 'searchActions.ts'),
    ],
    advice:
      'Semantic search is a glm-5.3 pass over SQL-narrowed candidates (F35 R6). Call it from ' +
      'lib/nina/searchActions.ts, a Server Action fired from the sidebar field. The text results ' +
      'are already correct without it, so a render that awaited it would trade a complete list ' +
      'for a spinner — fall back to the text ranking instead.',
  },
```

**Impact:** `npm run ci:llm-payload-guard` reports seven guarded symbols and passes. The
`rankNinaSearchHits` entry is inert until phase 6 lands, by design.

---

## Verification

**Build:** `npm run lint && npm run format:check && npm run typecheck`

**Tests:** `npm test` — in particular `lib/nina/title.test.ts`, `lib/nina/autotitle.test.ts`, and
phase 3's `tests/nina.active.test.ts`, which must stay green **unedited** (step 5 changes where its
two imports are declared, not what they do).

**Guards:** all five, because this phase edits one of them:

```
npm run ci:llm-payload-guard    # must print 7 guarded symbols and pass
npm run ci:data-layer-guard
npm run ci:client-secret-guard
npm run ci:f08-guard
npm run ci:f11-guard
```

`ci:llm-payload-guard`'s output line must name both new symbols:

```
F07/F33 payload boundary guard passed: all 7 guarded symbols (getOrCreateInsight, runNinaTurn,
distillNinaMemory, resolveNinaPromises, describeNinaImage, titleNinaSessionIfNeeded,
rankNinaSearchHits) are confined to their sanctioned non-blocking callers.
```

**Manual check** (`npm run dev`, against a real `LLM_API_KEY`):

1. Create a new session and send one message. The reply arrives; the sidebar row still reads
   `Chat baru`. **Within a few seconds** the server log carries `[nina.title] done` with
   `written: true`; reload and the row reads three or four words in the language you typed in.
2. Send a second message in the same session. The log carries
   `[nina.title] already named, no call made { source: 'auto' }` — **no model call**. This is the
   check that the titler is not billing a call per turn.
3. Rename it from the sidebar (phase 5's control) to something else, then send a third message. The
   log says `source: 'manual'` and the name you typed survives.
4. Paste a two-thousand-character paragraph into the rename field: it is refused or clamped at 60,
   and the row never goes blank. Paste only a zero-width space: refused.
5. Open the same new-session flow in two tabs and send in both at once. One `[nina.title] done`
   with `written: true`, one with `written: false`, one title.

**Exit criteria**

- A fresh session is titled within one `after()` of its first user→Nina exchange, three or four
  words, in the language of that exchange, with **no model call awaited in any render path**
  (`ci:llm-payload-guard`).
- A second turn in a titled session makes **zero** model calls for titling.
- A manually renamed session keeps its name across further turns; migration 0004's
  `'Semua chat sebelumnya'` is never renamed.
- Under a double-invoked `after()` and under two concurrent tabs, exactly one title is written and
  exactly one model call is made in the sequential case
  (`lib/nina/autotitle.test.ts`, "fires exactly once per session").
- A model answer that is not a title (empty, a sentence, a refusal, punctuation only) leaves the
  session untitled and writes nothing, so the next turn retries for free.
- `npm run ci:llm-payload-guard` passes with **both** new entries present, and its printed symbol
  list contains `rankNinaSearchHits` spelled exactly as `phase-6.md` requires.
- `npm test`, `lint`, `format:check` and `typecheck` all green with phase 3's
  `tests/nina.active.test.ts` unmodified.

---

## Handoffs

1. **Phase 5 — nothing to change. ✅ RECONCILED.** Your contract item 3 wants
   `NINA_SESSION_TITLE_MAX_CHARS` from a client-safe
   module, imported as `from '@/lib/nina/sessions'`. That is exactly where reconciliation put it:
   phase 1 declares it there at 60, `sessions.ts` imports nothing at all, and this phase imports it
   rather than declaring a rival. **Your import line and your `maxLength` are correct as written**;
   your fallback (drop `maxLength`) is not needed, and there is no second cap anywhere. See D3.
2. **Phase 5 — the rename row still does not validate**, and now there is a written rule behind that.
   `sanitizeNinaSessionTitle` refuses an empty or invisible-only title and clamps at 60; phase 3's
   action turns that into the `error` sentence you render. An empty rename is a refusal, **not** a
   revert to the automatic title, and D6 gives the reason a revert would be actively wrong.
3. **Phase 6 — your guard entry is in, spelled `rankNinaSearchHits`**, sanctioning exactly
   `lib/nina/semantic.ts` and `lib/nina/searchActions.ts`. No rename is needed at your end; keep
   those two file names and that symbol name and `ci:llm-payload-guard` passes the moment you land.
   If you move the definition, you cannot fix it in the guard — tell the reconciler.
4. **Phase 3 — nothing is owed back.** Your handoff item 5 asked whether the "a manual title is
   never overwritten" rule needs `renameNinaChatSession` to stamp `title_source`. It does not:
   phase 1's `renameNinaSession` already sets `titleSource: 'manual'` in the same statement as the
   title, and my guard tests `title IS NULL` rather than the source, so the rule holds even if a
   future writer forgets the stamp. `title_source` earns its place as the field that makes the
   *intent* legible in a log line and the field a future "re-title this session" control would
   branch on.
5. **Phase 8 — the titler does not touch read state.** It writes one column on
   `nina_chat_sessions` and never reads or writes `nina_messages.read_at`, so nothing here
   interacts with your `revalidatePath` decision.
6. **Unowned, worth a card — re-titling a session whose first exchange was a false start.** A
   session named from a greeting-only exchange that later became a real conversation keeps its first
   name, because the titler only ever fires on `title IS NULL`. `title_source = 'auto'` is exactly
   the distinction a "rename with the model" control would need (`'auto'` may be replaced,
   `'manual'` may not), and phase 1 shipped the column with that use in mind. Nothing in R3 asks
   for it.
7. **Unowned, worth a card — the second `after()` model call and the 60 s ceiling.** A turn may now
   schedule `runTurnDistillation` (34 s budget) **and** `titleNinaSessionIfNeeded` (12 s) in one
   invocation whose turn already spent up to 45 s. The budgets above are sized so the measured case
   fits, and both passes degrade silently if the platform cuts them, so the failure mode is
   cosmetic. A real fix — moving distillation to a queue, or firing the titler from the nightly cron
   instead — is a change to F33's architecture and does not belong in an R3 card.
8. **Unowned — `lib/nina/.workflows/package_readme.md`** will want `title.ts` and `autotitle.ts`, and
   `scripts/`'s guard count is quoted in a few places. Left to the set's documentation pass.

---

## Rollback

**This phase alone.** One commit on `feature/nina-chat-sessions`, so `git revert <phase-4 commit>`
backs it out cleanly and leaves phases 1, 2, 3 and 5 working:

- `lib/nina/title.ts`, `title.test.ts`, `autotitle.ts` and `autotitle.test.ts` disappear.
- `lib/nina/active.ts` gets its local `sanitizeNinaSessionTitle` body back (its cap import from
  `@/lib/nina/sessions` is phase 3's and stays),
  so `sessionActions.ts` and `tests/nina.active.test.ts` keep compiling and the manual rename keeps
  working — **R3's second half survives a revert of this phase**, minus the invisible-character fix.
- `lib/nina/actions.ts` returns to phase 3's seam comment. Sessions stop naming themselves; they
  render `SESSION_UNTITLED_TITLE` until he renames them, which is a real screen and not a broken
  one.
- `scripts/check-llm-payload-boundary.mjs` returns to five entries and its stale "four" header.

**Two ordering constraints.**

1. **If phase 5 has landed and its import points at `@/lib/nina/title`** (handoff 1), reverting this
   phase breaks its build. Either revert phase 5 first, or re-point that one import back at whatever
   client-safe constant survives.
2. **If phase 6 has landed, revert 6 before 4.** Phase 6's `rankNinaSearchHits` is *only* guarded by
   this phase's entry; reverting phase 4 alone leaves phase 6's model call unguarded — the guard
   still passes (an unlisted symbol is not checked), which is exactly the silent window the
   single-editor rule exists to prevent. Reverting phase 6 alone is safe in the other direction:
   a table entry naming a symbol nothing calls is inert.

**Nothing to revert in the database.** This phase ships no migration and writes one existing,
nullable column. A title written by a reverted titler is indistinguishable from one he typed, and
is his to rename.

---

## Post-implementation corrections (recorded by orch-nina-chat-sessions, 2026-09-05)

Phase 4 landed as `9e999c1`. These are defects **in this plan document** that the implementing
session found and fixed in code. The reconciled text above is left intact deliberately — a plan
whose body is rewritten is a plan whose reconciliation no longer holds — so the corrections live
here instead. Anyone re-running this phase from this file must apply all three.

1. **Step 1's `sanitizeNinaModelTitle` had a real defect, not a test error.** The snippet's own
   comment says "Truncating can expose a comma" and the code never implemented it, so
   `sanitizeNinaModelTitle('Cedera lutut kanan, sakit banget')` returned
   `'Cedera lutut kanan, sakit'` — the 5-word overshoot slices to 4 words, which leaves the comma
   *interior*, where `TRAILING_PUNCT_RE` cannot see it. Step 2's own assertion expected
   `'Cedera lutut kanan'`, so the plan contradicted itself. Fixed with `CLAUSE_END_RE = /[,;:]$/`
   applied **only when truncation actually happened**, so the legitimate 3-word
   `'Cedera lutut: kanan'` is never sliced. Both cases have tests.

2. **Step 2's test imported `NINA_SESSION_TITLE_MAX_CHARS` from `./title`**, which contradicts
   this phase's own D3 — `title.ts` "declares nothing and re-exports nothing". A leftover from a
   draft that declared the cap there. It imports from `@/lib/nina/sessions`, the cap's one
   declared home for the whole set.

3. **Step 1's `/* eslint-disable-next-line no-control-regex */` is an unused directive** under
   this repo's eslint config, which does not enable that rule. Removed; the explanation it
   carried was kept in the docstring.

Also worth knowing rather than fixing: a bare `vi.fn(async () => …)` infers zero parameters, so
`mock.calls[0]` is a TS2493 tuple-index error. The mock needs typing against
`TitleClientLike['messages']['create']`.
