# Package: `lib/nina`

**Location**: `lib/nina`
**Last Updated**: 2026-09-12 (compact rewrite of the 2026-09-05 accretion: per-phase narratives
moved out — the plan files under `.workflows/plan/` and the session docs carry that history —
and every remaining claim re-verified against the tree on this date. Stale claims corrected
include: the tuning-aware exports and `captionNinaPhoto` ARE wired; the live tuning/shortcut
reads moved from `actions.ts` into `turnrun.ts`'s `Promise.all`; the anchored image call is
235 s (was 220 s) and `NINA_IMAGE_RUN_BUDGET_MS` 255 s; the daily image cap is 30 by fallback
constant and env-tunable (the old "six a day"); `maxDuration = 300` now sits on FOUR segments;
the soft-delete predicate is ten `WHERE`s across nine functions.) Restated later the same day for
P1-NIN-A037 (LLM-fallback phase 3): `openrouter.ts` added, `vision.ts` gained the OpenRouter
describe fallback, `errorlogs.ts` gained its first writer — see Vision. Restated again the same
day for P1-NIN-A038 (phase 4): every failed image-generation CALL writes a `nina_error_logs` row
(`imagerun.ts`'s `recordImageCallFailure`) and `NinaImageCallResult`'s failure variant reports the
abort budget that actually applied (`timeoutMs`) — see Images. Restated a third time the same day
for P1-NIN-A036 (phase 2): `llmFallbackText.ts` added — `productionDeps` now hands the turn a
z.ai-first/OpenRouter-second client, one best-effort `nina_error_logs` row (category `text`) per
failed CALL — see The chat turn. Restated a fourth time the same day for P1-NIN-A039
(photo-reference dedup): `generatedChatPhotoScope` gained a fourth arm — a correlated `NOT EXISTS`
against `nina_avatars` on `source_key = 'chat-photo:' || nina_message_images.id` — so a chat
photograph her album has adopted ("Set as her profile picture") is offered by the admin
image-reference picker exactly once, as its album copy (four production tiles stopped being
double-shown, measured 2026-09-12); the Media view and `/nina/about` are deliberately unchanged —
see Images. Restated 2026-09-13: `turnflight.ts`'s `NINA_TURN_POLL_GIVE_UP_MS = NINA_BACKGROUND_BUDGET_MS`
was knip's one genuine "duplicate exports" finding across the repo — a bare-identifier initializer
pointing at another export in the same file. It carries a `@alias` JSDoc tag now (knip's own
escape hatch for a deliberate value alias — see The chat turn's Flight paragraph for why the two
names must stay equal), not a suppression or a merge of the two names. Restated 2026-09-14 for
P1-NIN-A049 (NINA_PUSH_EVERY_MESSAGE phase 3): the image path now knocks — `finishSelfie` notifies
`'photo_delivered'` as its last statement, and the module-private `postNinaApologyMessage` notifies
`'photo_apology'` once for both of its callers — see Images. Restated again 2026-09-14 for
P1-NIN-A048 (the same set's phase 2): the reply knocks too — `runNinaBackgroundTurn` sends ONE
`'chat_reply'` push per committed reply, after the claim is closed and before the distillation,
through a defaulted `notify` seam (`NinaTurnDeps` / `NinaTurnNotifier`), which is how all four
entry points into the turn are covered by a single call site — see The chat turn. Restated
2026-09-15 for P2-DB-A001 (ADMIN_ALBUM_SEMANTIC_SEARCH phase 1 of 4): `embedding.ts` added —
one string in, one 1536-wide `number[]` out, one `fetch`, no fallback ladder and no retry, the
first OpenRouter path in this package with no z.ai primary in front of it; `openrouter.ts` gained
`OPENROUTER_EMBEDDINGS_URL` and `NINA_EMBEDDING_MODEL` — see Embeddings. Restated 2026-09-16 for
P1-NIN-A051 (nina-ghost-photo-dedup-fix phase 1 of 2): `provenancePromotion.ts` added — a delete
now MEASURES the rows it is about to orphan before it orphans them, and the three avatar-side blob
deletes ask `isBlobPathnameReferenced` before `del()` — see Images' *Promote before delete*.
Restated again 2026-09-16 for P1-NIN-A052 (nina-imagegen-proportion-fix): the selfie camera block
(`NINA_SELFIE_STYLE`), the `calves` focus TERM and the high-`steamy` presence clause were retuned
together against arm's-length framing, head-to-body proportion and cropped feet — the recorded
rules are that the tool description never reaches the image prompt, that there is no
`negative_prompt` to put negatives in, that a focus key's phrase must be spelled in its `.term`, and
that a non-empty stored `prompt_template` outranks the source default — see Images' *The
photograph's aesthetic*. Restated a third time 2026-09-16 for P1-NIN-A053 (nina-natural-reminders, a one-phase
set): `reminders.ts` (pure) + `reminderstore.ts` (server-only) added — standing daily reminders the
runner asks for in ordinary chat prose, carried on `SEND_TOOL`'s new optional `reminders` array,
persisted as a `reminders` key in the existing `nina_memory_slots` jsonb (**no new table, no
migration**), and delivered by a SIXTH `ProactiveTriggerKind` (`reminder_due`) at the FRONT of
`PROACTIVE_PRIORITY`; the `/api/cron/nina` schedule moved `"0 12 * * *"` → `"0 13 * * *"` (19:00 →
20:00 WIB) so the Hobby plan's within-the-hour window brackets 20:45 — see *Memory, promises,
patterns, proactive* and Gotchas. Restated 2026-09-17 for P1-NIN-A054
(nina-avatar-existing-photo, a one-phase set): `avatarAdopt.ts` added — a SECOND avatar tool,
`set_avatar_from_photo`, which adopts a photograph that already exists and generates nothing;
`NINA_PROMPT_VERSION` 10 → 11 (a whole new tool, no system text, snapshot UNREGENERATED);
`getLatestOriginalNinaSessionPhoto` added to `queries/images.ts`; `'chat-photo:'` now has a named
export on the nina side (`NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX`) and is still three spellings, not one
import — see Images' *Adopting a photograph that already exists*. Restated 2026-09-18: the
**prompt-length dial is removed** end to end — the slider, the `promptLength` preference, the
prompt-length ladder in `imagegen.ts`, `NINA_FOCUS_EMPHASIS[key].sentence`,
`NINA_AVATAR_STYLE_SHORT` and the `nina_image_prefs.prompt_length` column
(`drizzle/0031_greedy_jocasta.sql`, committed and deliberately unapplied until this code ships).
The operator never moved it off its shipped default of `50`, so the avatar path now permanently
renders what that value's `mid` band always resolved to — see Images' *The prompt-length dial is
gone*.
**Documentation Created**: 2026-09-05 (`NINA_CHARACTER_TUNING_PLAN.md` phase 2)

## Overview

`lib/nina` is the whole of Nina — the in-app running companion. It owns who she is (the canon),
what she is handed on each turn (the context), how she is asked to answer (the prompts and the
tool-use loop), what she remembers, when she speaks unprompted, the photographs she generates of
herself, and every Drizzle query behind her tables. It is a **flat package with no `index.ts`
barrel**: every importer names a submodule directly, because a barrel would drag `server-only`
modules into `'use client'` components.

**Key responsibilities:**

- **The canon** — identity, register, anger ladder and prohibitions as text (`persona.ts`, a
  barrel over the `persona/` modules), and
  the stored per-user character that varies it (`tuning.ts`).
- **The turn** — assemble a context, run the tool-use loop, validate the reply, persist the
  bubbles, distil memory afterwards — as a background job that survives the response, with every
  model call behind a z.ai-first/OpenRouter-second fallback client (`llmFallbackText.ts`).
- **Proactive speech** — whether she opens a conversation, and on what. Six triggers: five she
  INFERS about him, plus `reminder_due` (since 2026-09-16) — the only one he wrote, a standing
  daily check-in he asked for in chat prose and she delivers once per Jakarta day.
- **Images** — her selfies and avatars, prompt → job row → Blob, plus the caption she writes
  under a photograph of hers from what is actually in it. One avatar path has none of that
  (`avatarAdopt.ts`, since 2026-09-17): a photograph that already exists becomes her face inside the
  tool round, no prompt, no job row, no camera.
- **Embeddings** — one string to one 1536-wide vector (`embedding.ts`, since 2026-09-15), the
  vendor seam BOTH searchable tables read and write through: `nina_avatars.description_embedding`
  (`queries/avatarEmbeddings.ts`) and, since 2026-09-17, `nina_message_images.description_embedding`
  (`queries/imageEmbeddings.ts` — the media twin, function for function).
- **Unified photo search** — the three cosine-similarity reads that rank `nina_avatars` AND
  `nina_message_images` against the same query vector and merge them into one ranked list
  (`queries/avatarsearch.ts`; album-only from 2026-09-15, merged since 2026-09-17). The package
  ranks; it does not embed and does not caption — the vectors arrive as arguments from the Server
  Action (`lib/admin/ninaAlbumSearchActions.ts`), which is what lets the whole ranking be asserted
  against generated SQL with no network. **Every physical photograph appears in a result at most
  once**, whichever table's embedding matched it, and that is a property of the two arms'
  predicates rather than of a post-hoc filter.
- **Chat UI logic** — the pure, node-testable decisions the chat screen makes (grouping, reveal
  timing, idempotent appends, scroll, gestures, chrome geometry), kept out of the components.
- **Persistence** — the `queries/` directory is the single home for every `nina_*` table access
  — one module per domain area plus a module-internal `columns.ts`, behind the `queries.ts` barrel
  (one `export *` per module, zero imports; the roster grows, so read that file's `§` map rather
  than any count quoted here) — except the
  failure log, whose write and read sides live in `errorlogs.ts`, because that file's stated
  contract is ownership-scoped reads (every row belongs to a runner, so `userId` leads) and this
  log's one list read is an operator's diagnostic scoped by category with no per-user filter.

## The standing rules of the package

1. **No barrel.** Import the submodule, not the package.
2. **The zero-import roster is load-bearing.** `tuning.ts`, `shortcuts.ts`, `images.ts`,
   `imagefail.ts`, `imageDedupe.ts`, `perceptual.ts`, `turnflight.ts`, `imagerecipe.ts`,
   `imageprefs.ts`, `openrouter.ts` and `crop.ts` import NOTHING — no value, no type, no
   `server-only`. Two kinds of host reach for them where an import would break:
   `scripts/nina-image-worker.ts` and
   `scripts/nina-shortcuts-import.mjs` load them by relative path under
   `--experimental-strip-types` (one runtime-value import stops the worker booting), and
   `'use client'` panels (`/admin/nina`, `/admin/shortcuts`) need the constants in the browser.
   Source-reading tests enforce the property. `persona.ts` — and every module under `persona/` with
   it — is nearly the same: pure text, no I/O, no `server-only`; they import `./tuning` for the
   vocabulary plus a type-only import from `./imageprefs` (erases at compile time).
3. **The prompt side never reads the raw tuning.** Every `persona/` module (the source-reading
   test discovers the directory, so a module added later is scanned the moment it exists),
   `prompts/system.ts` and `proactive.ts` go through `ninaTraitScore` / `ninaDialScore` / `ninaActiveRelationship`
   (`tuning.ts`) — a direct read of `tuning.traits`/`dials`/`relationship` compiles and produces
   a checkbox the operator can clear with no effect, so `tests/nina.prompts.test.ts` reads the
   sources and fails on one. The store is the exception: `tuningToColumns` (`queries/tuning.ts`) keeps
   the value the operator PARKED, not the value the prompt uses.
4. **A `nina_turns` row is money and audit.** Never `DELETE` one; the trash icon writes
   `deleted_at` (a flag, not a cancel, not a refund — see Images). `countNinaTurnsSince`, the
   daily image cap, deliberately ignores the flag: a spend is not un-spent by hiding its row.
5. **Every bubble in her mouth was written by the model.** No app-authored prose, no apology
   bubbles, no `insertNinaMessages` on the resend path — the sweep closes a dead turn `failed`
   and retries nothing. This is the plan-set "invariant 7" and it is asserted, not intended.
6. **The image description is the vision model's private prose — on the RUNNER's side of the app.**
   `nina_message_images.description` (from `describeNinaImages`, `glm-4.6v`) is never selected by a
   chat or gallery render read: projections name `{ id }` or go through `galleryPhotos`, which
   strips it, and it never crosses into a `/nina` client prop. **The admin surface is the stated
   exception, and it is the only one**: the operator is the person who writes and corrects that
   prose, so the Media pane reads it to edit it and — since 2026-09-17 — a merged search hit
   carries it to the results grid. The rule that still holds without exception is the one that
   matters: it is never shown to the runner, and the 1536-float `description_embedding` beside it
   is never selected by ANY read, admin included.
7. **Server Actions return typed result unions and degrade instead of throwing.** Coercers
   (`coerceNinaTuning`, `coerceNinaEnabled`) never throw; recovery paths (resend, cancel, revive,
   dedup lookups) swallow their own failures, because the acceptable blast radius is a duplicate
   answer or an orphaned blob — never a lost reply, never a 500 into the render that hosts the
   recovery. Every spend is still recorded even when the answer is discarded (invariant 9).
8. **Model calls never run in a page render.** `scripts/check-llm-payload-boundary.mjs` scans
   every non-test file for nine guarded symbols and fails on an unsanctioned call site; the
   honest fix for a moved call site is the array entry, not a rename.
9. **`after()` is bound by the invoking route segment's `maxDuration`.** The four segments that
   can start a generation or a turn carry a literal `export const maxDuration = 300` —
   `app/nina/page.tsx`, `app/api/cron/nina/route.ts`, `app/nina/jobs/page.tsx`,
   `app/admin/image-generation/page.tsx`. Segment config exports are statically analysed: an
   imported constant is invisible to the analyser, so the literal is load-bearing.
10. **Committed drizzle migrations are applied post-merge with `npm run db:migrate`** — and
    `.env.local`'s `DATABASE_URL` is the instance production reads, so read before running. The
    tip as of this rewrite is `0021_nina_error_logs.sql`. Package rule: **no stored value
    carries a SQL default** — defaults live in the TS constants (`NINA_TUNING_DEFAULTS`,
    `NINA_IMAGE_PREFS_DEFAULTS`) and nowhere else; a nullable column's NULL means exactly one
    thing, and the coercer defines what.
11. **No confirmation dialogs on `/nina/jobs` row controls** — the user's explicit requirement.
    `SessionRow`'s three-tap confirm is deliberately not the precedent: it hard-deletes a
    conversation with no undo; these controls cost a capped generation or write a reversible flag.

## The character layer

**`tuning.ts`** — zero imports, plain data, client-importable. The scale is 0–100 in five equal
bands (`off|low|mid|high|max`), five because `NinaBandIndex` must be exactly `AngerRung['level']`.
Twelve traits, four dials (`profanity`, `clinginess`, `photoEagerness`, `verbosity` — each spec's
`path` names the real code path it moves), and **six relationships** (`nobody`, `casual_friend`,
`sister`, `best_friend`, `girlfriend`, `instructor` — the sixth APPENDED, not inserted: a coach is
not on the least-to-most-intimate axis; her address word is `atlet`). `NINA_ADDRESS[rel]` owns what
she calls him and lives here, not in `persona.ts`, precisely so `/admin/nina` can render the
vocabulary without importing the canon.

**The defaults are not uniform, and that matters everywhere.** `anger`, `sad`, `flirty`, `steamy`,
`annoying`, `anxious`, `horny` default to 0; `profanity` to 30; the other eight to 50. Each was
read off the canon (`defaultBecause` quotes the line it was read from) because the default is
defined as *the value that reproduces the text that ships* — which is what makes
`buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` byte-identical to pre-tuning Nina ARITHMETICALLY.

**The enable map (R4).** `NINA_TUNING_KEYS` = `[relationship, ...NINA_TRAITS, ...NINA_DIALS]` —
seventeen keys, derived, never restated; a new trait inherits its checkbox, Zod field, column and
gate in one commit (adding `horny` touched nothing under `lib/admin/`). **Only an explicit `false`
disables**; a missing map reads all-on, which IS the migration backfill for pre-toggle rows. A
disabled key is a key the operator never moved: the parked score stays on the slider and in the
row, and every prompt-side reader gets that key's own `defaultScore` — zero added bytes. The gate
lives at the score seam (the three helpers above) because floors, repeals and dial clauses read
raw scores too; a gate that only skipped the paragraph would leave a disabled `anger: 100` still
flooring the nag ladder. `relationship` has a toggle (disabling means `best_friend`, because
`nobody` is active cold instruction, not an off switch); `notes` deliberately does not (`''` is
already its absence).

**`persona.ts`** — the text: a barrel that defines nothing, fronting nine modules under
`persona/` (bands = the R4 gate; identity; appearance; voice; instructor; anger; verbosity;
never-say; tuning-blocks). No logic beyond string assembly and no I/O in any of them, so tests
can assert rule text and `/admin/nina` can render a preview. `docs/nina/persona.md` is the prose canon the user
redlines; when the two disagree, the document is the intent and this file is what ships. The
organising idea: **every block that varies is a function of `NinaTuning`; every block that does
not is still a constant** — the frozen-text constants (`NINA_IDENTITY`, `NAME_RULES`,
`ANGER_LADDER_BLOCK`, `NEVER_SAY_BLOCK`) are kept under their old names as the default render of
their own functions, so the default render is byte-identical and reviewable. Each key has an
**identity band** (the band containing its `defaultScore`); a key sitting in it is SKIPPED, so the
whole tuning section renders `''` at the defaults. Load-bearing exceptions and registers:

- **`horny` speaks from 40, not 60** — the only trait with a `mid` band paragraph, because its
  three bands are three distinguishable behaviours (suggestive → explicit → self-initiating with
  variety and continuity), not near-duplicates. Distinct from `flirty` (teasing) and `steamy`
  (how explicit she goes once HE has): `horny` is whether SHE takes it there. It adds a
  `max(own, floor)` verbosity floor (`VERBOSITY_FLOOR_BY_HORNY_BAND`: high→60, max→80) and joins
  `BODY_REPEALED_BY` (`['flirty','steamy','concerned','horny']` — one list for all three places
  the body rule is stated, the third in `prompts/system.ts`). The model's ceiling is the model's:
  no refusal detection, no re-softening retry anywhere in this package or `lib/llm/`.
- **The girlfriend register (manja/imut)** is `MANJA_ORTHOGRAPHY` (module-private, sitting under
  `JAKARTA_REGISTER`, amending it for `girlfriend` alone) plus `GIRLFRIEND_VOICE_EXAMPLES` — the
  user's five example lines stored VERBATIM and walked by tests, never retyped. It is **not** the
  `clinginess` dial: clinginess decides WHEN she speaks first (three day-count constants in
  `proactive.ts`); manja is how a message she is already sending sounds.
- **The instructor register** (`INSTRUCTOR_COACHING`): pattern DETECTION existed all along
  (`patterns.ts`); what changed is the RESPONSE — a fired code is a working list (one change, one
  duration, re-read next turn), not a best friend's anger. Nothing was repealed: the diagnosis
  rule is TIGHTER for a coach. Known gaps by design: no deadline-recall proactive trigger, and
  three pattern codes get no bespoke prescription.
- **Old repeals are gated, not deleted** — twelve rule sites became per-band or gated text
  (anger's floor/ceiling, the nickname rules, the threat clause, `system.ts`'s greeting and
  sulk clauses…), each recorded in place with a `REPEAL`/`FINDING` comment. `NINA_NOT_A_DOCTOR`
  and the medical-condition refusal were never repealed. Accepted deviation:
  `ANGER_CEILING_BY_BAND.off === 4` — "she never gets angry" is not representable, because the
  default must render the shipping ladder exactly.

**`prompts/`** — `persona.ts` is WHO SHE IS; `prompts/system.ts` is WHAT SHE IS READING and HOW
SHE MUST ANSWER. The split matters because the second changes whenever `context.ts` changes shape
and the first only when the user redlines the canon. `buildNinaSystemPrompt(tuning)` composes the
`nina*` block functions into ten sections and drops empty sections header-and-all. Proactive split:
trigger LOGIC (day-count thresholds) is `proactive.ts`'s; trigger COPY is `system.ts`'s.

**Version constants.** `NINA_PROMPT_VERSION` (11 as of 2026-09-17) identifies the ASSEMBLER —
system text **and** the schemas in `prompts/tools.ts`; it has bumped several times without any
system text moving (the shortcut block and the burst block are conditional user-turn bytes;
version 8 was the first bump since version 1 in which a TOOL SCHEMA moved and the system text did
not, and versions 9, 10 and 11 are all of that kind — 10 is the nina-natural-reminders set's
`SEND_TOOL.reminders` array, 11 is the whole new `SET_AVATAR_FROM_PHOTO_TOOL` plus one appended
clause on `SET_AVATAR_TOOL.description`), because `nina_turns` must be able to date a turn that
could carry bytes no earlier version could — a turn whose `body.tools` held a fifth dispatched tool
is not a version-7 turn, a turn whose `send` could carry a `reminders` array is not a version-9 one,
and a turn that could have DISPATCHED `set_avatar_from_photo` is not a version-10 one. Version 11 is
the rule's widest case and the one to copy: ADDING a tool bumps this constant exactly as editing one
does, and it still leaves the snapshot alone. The
corollary is the one that catches people out in both directions: adding or editing a tool schema
bumps this constant, and it leaves `tests/__snapshots__/nina.prompts.test.ts.snap` UNTOUCHED,
because the snapshot is `buildNinaSystemPrompt`'s bytes and the tool array is not in them. A
regenerated snapshot alongside a tool-only change is the tell that something else moved.
Three other calls carry their own
constants and none of them is `NINA_PROMPT_VERSION`: `NINA_DISTILL_PROMPT_VERSION` (3,
relationship-aware librarian), `NINA_CAPTION_PROMPT_VERSION` (1), `NINA_TITLE_PROMPT_VERSION` (1).
Changelog comments sit above each constant.

**The snapshot is the byte-identity gate.** `tests/__snapshots__/nina.prompts.test.ts.snap` holds
the assembled prompt for the non-girlfriend relationships, generated from a pristine tree. Never
run `vitest -u` to make it pass: a failure there is a bug in your change. The containment tests
beside it are the readable half.

## The chat turn

**Send** (`actions.ts`): `requireUserId` → validate body/tickets → supersede a still-thinking
claim → persist his row (`insertNinaMessages` is the batch; it `returning`s the poll cursor) →
`openNinaChatTurn` claim on `nina_turns` → schedule via the private `startNinaBackgroundTurn` =
`after(() => runNinaBackgroundTurn(input))`. The action returns in well under a second; the
13–45 s turn runs in the background (R6).

**`turnrun.ts`** — server-only, deliberately NOT a `'use server'` module (every export of one is
an untrusted POST endpoint, and the runner's input carries a raw `userId`; `actions.ts`
type-re-exports `SentBubble` for the client). STEP 2 is the four-way `Promise.all`:
`loadNinaContext`, `loadRunHistory`, `readNinaTuning` and `listNinaShortcuts(userId,
{onlyEnabled: true})` — **tuning and shortcuts are read LIVE on every turn, no cache**, which is
what makes a slider or an admin row effective on the very next message with no invalidation. The
shortcuts entry is the one whose rejection is swallowed (invariant-7 garnish: a turn with no
shortcut in it is what most turns are). `recentRunnerTexts` (shortcut lookback) and
`earlierRunnerTexts` (the burst) are both derived from the already-loaded window with no new
query — two lists, deliberately not one: the first feeds the matcher regardless of answeredness,
the second only what THIS reply must answer. Then `runNinaTurn` → persist bubbles → close → push →
distillation + auto-title. It calls no `after()` itself: callers own their scheduling.

**The reply knocks, exactly once, from ONE site** (since 2026-09-14, P1-NIN-A048) — `notifyNinaPush`
(`lib/push/send`), kind `'chat_reply'`. Four rules hold it:

- **One call site covers four entry points.** `sendNinaMessage`, `resendNinaTurn`,
  `reviveNinaChatTurn` and the burst chain all converge on this function, so the push is written
  once; a copy per action would be four chances to get the ordering wrong. The chain is a FULL turn
  — it commits its own bubbles at the same insert and sends its own push — and it forwards `deps`
  rather than defaulting, so an injected notifier cannot silently revert to the production one link
  in.
- **The position is the design, in both directions.** BELOW `closeNinaChatTurn`, because the poll's
  two questions ("is a turn in flight", "is there anything past my cursor") both flip there and
  nowhere else: a push sent one statement earlier wakes him onto a typing indicator for a reply
  already in the database. ABOVE the distillation, because `runNinaDistillation` is a second model
  call (10–20 s) and `titleNinaSessionIfNeeded` a third — the reply is already 13–45 s old, and the
  whole premise is that he put the phone down.
- **No bubble, no push.** Three no-bubble exits `return` above the line (the supersession discard,
  the deleted-session abandon, the null payload); the fourth is not structural and is what
  `bubbles.length > 0` guards — `insertNinaMessages` degrades to `[]` for a session that is not his,
  so a turn CAN reach here with nothing committed. The guard sits at the site that knows what an
  empty list MEANS, not in the payload builder two modules away.
- **Its own `try`, logging rather than throwing** (`proactive.ts`'s shape). A failed push must not
  cost the distillation, the auto-title or the chain — and must not let the enclosing catch file a
  turn that SUCCEEDED as crashed. Awaited rather than fire-and-forget: a handful of subscriptions
  inside a 240 s budget, and a deterministic order is what makes it assertable.

**The seam is a second, DEFAULTED parameter, not a field on the input.** `NinaTurnDeps`
(`{ notify?: NinaTurnNotifier }`) defaults to `{}`, so every existing caller keeps compiling
untouched; and `NinaBackgroundTurnInput` is a DTO two of whose three builders assemble it from
DATABASE ROWS (the revive rebuilds a dead turn from `nina_messages`, the chain from
`listNinaMessages`' newest row) — a function has no column to be rebuilt from, so a `notify` field
there would make every builder decide what to do about a field none of them can source.
`NinaTurnNotifier` restates `ProactiveNotifier`'s three parameters ONE union wider (`NinaPushKind`,
not `ProactiveTriggerKind` — that narrowing is the single type-level reason the reactive path could
not just call `pushNotifier`), and returns `Promise<unknown>` so this module's type does not depend
on whether the notifier reports. The phone shows the FIRST bubble's body: the pre-existing
`bubbles = rows.map(…)` projection narrows the rows to `SentBubble` (`{ id, body, replyToId }`), so
**`seq` is not available at the notify call site** — anything that needs turn ordering must be handed
it, not derived here.

**The fallback client** (`llmFallbackText.ts`, server-only): `productionDeps(userId)` no longer
hands the turn the z.ai client — it hands it `ninaFallbackTextClient(ninaClient(), { userId })`, a
wrapper that is itself a `NinaLlmClientLike`, so `turn.ts` cannot tell the difference and NO line
of the loop changed. That is the whole reason the fallback is a client and not a branch in the
loop: one construction covers all FIVE model calls a turn can make (primary, two continuations,
the prose re-ask, `attemptNinaRepair`'s), because every one of them goes through
`deps.client.messages.create`; inlining a retry at each `catch` would be five edits to the most
carefully-reasoned control flow in this repo. The client is stateless per call, so a multi-round
turn may answer round 1 from z.ai and round 2 from OpenRouter — the tool-id rules below are what
make that safe. It exists because of a measured incident: 2026-09-11, eleven consecutive
`nina_turns` rows `failed`/`unavailable` on a transient z.ai condition with zero automatic
recovery. No second fallback, no retry of the fallback, no chain, and still no fallback bubble —
both providers failing ends the turn `'unavailable'` with a runner who sees no reply, exactly as
before.

The contract, attempt by attempt. On a z.ai throw: one `nina_error_logs` row (category `text`,
provider `zai`, `fullInput` = the Anthropic-shaped body verbatim, `errorMessage` = `describeCause`
— `name: message | status | body | cause`, written against the error's SHAPE because it must
describe an `AbortError`, a plain `Error` and an SDK error alike without importing any of them),
then ONE retry against OpenRouter (`z-ai/glm-5.3-flash` over `OPENROUTER_CHAT_URL`). The
translation (`toOpenRouterChatBody`) is pure and total — no throw, so the logged `fullInput` is
the payload that actually went on the wire — and it discards `body.model` (a z.ai id means
nothing to OpenRouter), carries `max_tokens` unchanged, emits a turn's `tool_result`s BEFORE its
own text (adjacent to the assistant `tool_calls`, per OpenAI's protocol), folds a tool result's
`is_error` into its text (`ERROR: ` prefix — OpenAI's `tool` role has no error flag, and a failed
lookup must not read as a successful empty one), drops thinking blocks, and spells the forced
send (`{ type: 'tool', name: 'send' }` — the loop's termination property) as an OpenAI function
choice. `reasoning: { enabled: false }` is the request-side translation of the measured
`thinking: disabled`. Tool-call ids round-trip deterministically both ways — `openAiToolCallId`
(OpenAI's 40-char ceiling) on the way in, `toolu_or_`-prefixed Anthropic-SHAPED ids on the way
out, so z.ai never sees a foreign id shape when a turn changes providers mid-flight. The response
side (`toAnthropicMessage`) synthesizes a full SDK `Message` (nulls for every field OpenRouter
does not know), maps ONLY `finish_reason: 'length'` → `max_tokens` (the one `stop_reason`
`turn.ts` compares; a truncated completion degrades the turn, it is never repaired), lets a
`tool_use` beat a `finish_reason` of `'stop'`, and THROWS on an empty completion — a 200 with no
usable content is a failure, the same rule as the image call, not a success with nothing in it.

Two gates and the logging rules. The fallback is DECLINED — and the z.ai error rethrown as-is —
when the caller's remaining `timeout` is under `NINA_FALLBACK_MIN_BUDGET_MS` (5 s): a second call
started with two seconds cannot finish and only writes a junk row; the incident this feature
exists for was z.ai failing FAST, so the gate declines the hopeless case, not the failure case.
(`NINA_FALLBACK_DEFAULT_TIMEOUT_MS` 20 s is reached only by a caller passing no `timeout`;
`turn.ts` always passes one.) When BOTH providers fail, both rows are written and the OPENROUTER
cause is rethrown — the deliberate mirror image of the vision fallback's rethrow-the-primary
rule, and safe precisely because `turn.ts`'s catch branches on nothing. Every `logNinaError` is
awaited and `.catch()`-ed (the second lock over a writer that already cannot throw); `userId`
rides `productionDeps`' optional parameter, threaded from `runNinaTurn`'s own input so the rows
join the `nina_turns` row for the same turn (nullable for callers that have none); and a missing
`OPENROUTER_API_KEY` — read via `ninaEnv()` inside the POST, never at module scope — is itself
caught and logged as an OpenRouter failure, so an unwired safety net is a visible row, not a
silence that looks like an outage.

**The tool set is three layers that never see each other** — and the layering, not the count, is
what a new tool has to satisfy. `prompts/tools.ts` is the JSON schema the model reads (a constant
whose only import is `type Anthropic`); `schema.ts` is the Zod object that VALIDATES what comes
back; `tools.ts` is the handler plus one method on `NinaToolGateway`; `gateway.ts` is the only one
of the four that may touch the database. **Neither `tools.ts` nor `prompts/tools.ts` imports
`@/lib/db` or `@/lib/db/schema`** (plan-set invariant 9) — which is why a handler that needs a row
shape RESTATES it as an interface beside the gateway method rather than importing the query's
return type. `NINA_CORE_TOOL_SET` is what this package dispatches; `extendToolSet` (`imagetools.ts`,
`avatartools.ts`) adds the tools that carry their own infrastructure, and `NINA_CHAT_TOOL_SET` /
`NINA_FULL_TOOL_SET` derive from the core set, so a tool added to the core array reaches both with
no edit in either extender. **Tools the model must CHOOSE BETWEEN are added in one `extendToolSet`
call, never split across two** — `set_avatar` and `set_avatar_from_photo` (2026-09-17) are both in
`avatartools.ts`' single extension for exactly that reason: a build where only one of the pair is
dispatchable is the failure the second tool exists to remove, and the guard is structural, not a
comment. The test that counts is `tests/nina.prompts.test.ts`: it walks
`NINA_TOOLS` (every schema that EXISTS, a superset of what any caller sends) and, for the tools
whose arguments are enumerated, asserts the JSON-Schema `enum` lists are equal to the Zod const
arrays — the hand-written copy is a checked claim, not a hopeful comment.

Three rules the handlers hold, whatever the tool:

- **Nothing numeric leaves a handler unspelled** (invariant 2/3). Every value in a `tool_result` has
  been through a `lib/format.ts` call, so there is no number in her context she could subtract from
  another number. `aggregate_runs` (2026-09-16) is the sharp case: it exists precisely so an average
  over a training block is a `select avg(...)` the database answers in ONE row, rather than
  `lookup_runs` printing up to five days of rows for her to average in prose.
- **The public argument shape is what a model reasons in; the query's shape is not.** A range tool
  takes an INCLUSIVE `to` and the handler adds the day, because `lib/db/queries/`'s half-open
  `>= start AND < endExclusive` convention is an implementation detail of the layer below — the same
  translation `monthRange`/`isoWeekRange` already perform for their own callers. Do that conversion
  once, in the handler, and hand the gateway a parameter type on which it is already done.
- **An absence is an ANSWER, not an error.** `isError` is false for "no reviewed run in that range"
  and for "no run has that reading" — both are complete answers to a well-formed question, and
  flagging them invites her to apologise for the tool instead of telling him what the data says
  (`lookup_runs`' `no_run` branch made the call first). `isError: true` is for a malformed argument,
  a backwards range, or a request that is meaningless on its face — a `sum` over a column that is
  already a per-run average. Each of those returns a sentence she can act on, never a throw.

Every gateway read is `userId`-scoped and gated on `isNotNull(runs.reviewedAt)` (D16), including
the per-call ones: `aggregateRuns` is the one method that queries per tool CALL instead of riding
`loadRunHistory`'s once-per-turn `db.batch`, and what makes that acceptable is the payload — three
numbers (`value`, `n`, `runCount`), never rows. `n` is the non-null READING count, which is also
what the tool's `count` returns, because three of the six metrics are nullable and "how many runs
have a recorded elevation gain" has to be answerable; `runCount - n` is how many had none.

**The claim** (`chatturn.ts`): open, read, cancel, record, close, sweep — the lifecycle and its
SQL-shape tests live here. `sweepStaleNinaChatTurns` closes a dead turn `failed`/`stale` and
never retries or apologises (rule 5). `NINA_TURN_STALE_MS` (90 s) is the freshness bound;
`supersedeNinaChatTurn` closes a still-THINKING claim as `failed`/`'superseded'` so a burst
restarts as one fresh turn — its WHERE re-asserts `status='pending' AND error_code='running'` and
the freshness bound, so a lost race to `'persisting'` is a false answer, not a corruption; the
superseded invocation discards its answer whole (no bubbles, no chain) but its metrics arm still
lands the token spend on its row. One race is accepted permanently: two different clients within
~50 ms can both open a claim — one duplicate reply, both real.

**Flight** (`turnflight.ts`, zero imports): the ONE home of the poll's numbers — backoff,
`NINA_TURN_POLL_GIVE_UP_MS = NINA_BACKGROUND_BUDGET_MS` (240 s, pairing the open tab's backstop
with the server's own budget; the sweep's `awaiting: false` is what actually stops a dead turn),
`NINA_TURN_STALE_MS`, and the `ninaFlightView` view shared by the page, `ChatScreen` and the
poll, so no runtime restates a number another owns. The cold load's `awaiting` ORs the same
disjunct the poll ORs: a fresh claim OR the newest-row-is-his window; an EXPIRED pending row is
passed through and declined (a sweep is a write; the cold load stays read-only).

**Revive** (`turnrevive.ts`, server-only, called only by the `/nina` page render, which AWAITS it
between `chooseActiveSession` and the page's `Promise.all` so the claim read observes what it
just did): if the invocation behind a turn died, arriving on the page is the turn's self-repair —
sweep, then if the newest row is HIS and no fresh claim blocks and the attempt cap allows, open
and schedule. Three bounds: ONE candidate per render; suppression is the open's fresh-claim
refusal (it never reads the claim itself); `NINA_TURN_REVIVE_ATTEMPT_CAP = 3` per runner message
(the send included → at most two revives), counted BEFORE the open (the open INSERTs the row it
opens; counting after could strand a fresh claim with nothing behind it). Every failure degrades
to silence EXCEPT the attempt-count read, which degrades OPEN — a failed read costs at most a
duplicate; a failed revive costs the reply the user asked for by name. Returns 1/0, never throws.

**Resend** (`resendNinaMessage`, `actions.ts`): the send path from STEP 1c onward, nothing above
it — the input is rebuilt field by field from the ROW (photos via `getNinaMessageImagesForMessages`,
`NINA_DESCRIPTION_UNAVAILABLE` for undescribed; `depth: 0`; the cursor is the NEWEST persisted
`seq`, never the resent row's own). No `insertNinaMessages` (test-asserted), no new model call
(the descriptions were paid for once), no cancel — it never supersedes, whatever the claim's
phase. Five refusals (`not-found`, `not-mine`, `empty`, `turn-live`, `failed`); `turn-live` is
reportable here precisely because the burst cancel took the send path's null off the table.
`canResendMessage` (`edit.ts`) has deliberately NO "was this answered" clause — `nina_turns` is
the one authority on turn state, and refusing at the action is honest, hiding the item is a guess.
The gateway hardcodes `imageDescriptions: []` into every window row (recorded gap, out of scope),
which is why the rebuild-from-row exists at all.

**Shortcuts** (`shortcuts.ts`, zero imports; `nina_shortcuts`; the table itself is `lib/db`'s
doc): one code stands for a directive he wrote once. Normalisation is five ops in order — NFC,
strip `U+FE0F` (what makes `✌️` and `✌` one shortcut), collapse whitespace, trim, lowercase — and
`U+200D` is deliberately KEPT (stripping it collides two distinct ZWJ shortcuts). `classifyNinaTrigger`
is glyph-vs-word, not emoji-detection: a glyph matches anywhere, a word only at
`(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` boundaries (`\b` is ASCII and wrong here; the lookbehind is
try-wrapped for runtimes that refuse it). The matcher runs ONCE per turn in `runNinaTurnWith`,
before the first model call, feeding both the user-turn block and `firedShortcutIds` — a second
match could disagree with the block the model was actually sent. `bumpNinaShortcutUses` is one
SQL statement, fire-and-forget, and the caller must `.catch()` — telemetry, not bookkeeping.
`match_key`/`kind` are derived in the query layer; the insert types have no field for them.
A turn with no fired shortcut carries ZERO shortcut bytes; an in-play-only hit still renders
(`STILL IN PLAY` header — the `🫦` mode must survive turns that merely say "terusin"). The block
cap is CHARS (5000, drop whole entries from the end — half a directive can invert it); the burst
cap is COUNT (6) — an expansion clamps, a message she is told to answer never gets truncated.

## Chat UI logic (pure, node-testable)

`chatview.ts`, `reply.ts`, `reveal.ts`, `scroll.ts`, `live.ts`, `edit.ts`, `chrome.ts`,
`turnflight.ts`, `jobview.ts` — pure modules because `vitest` runs `environment: 'node'` and
cannot assert a condition written inside a `.tsx` file. The components measure; `lib/` decides.

- **Chrome geometry ships as CSS strings**, never numbers, because every length must add
  `var(--safe-bottom)` (= `env(safe-area-inset-bottom)`, unreadable from JS). `composerBottomCss`
  and `composerPadBottomCss` are a PAIR with complementary gates on the SAME custom property
  (`--nina-bar-visible`): the home-indicator inset is contributed by exactly one term in every
  state. Never add the inset outside a gate — that is the unpainted-strip bug this pair fixed.
  `controlBottomCss`'s two branches are asymmetric on purpose (the unmeasured fallback adds the
  inset UNGATED — it is what SSR and first paint render; gating it puts the floating discs behind
  the composer's glass); a test asserts the branches differ so they cannot be "simplified" into one.
- **`COMPOSER_RESTING_PX` (60) is hand-copied in four places** (`Composer.tsx`'s `py-2`, the
  constant, `ChatScreen`'s fallback, `AppShell`'s `BOTTOM_GAP.chat`) — Tailwind cannot read a
  constant, and a stale literal in the shell reads as *a gap under the conversation*, not as a
  bug; it has survived review twice.
- **`live.ts` holds the two idempotent appends into one list**: `mergeServerMessages` (the
  refresh) and `appendNewBubbles` (the reveal), the latter born from the prod "gj" bug — an RSC
  delivery landing mid-reveal double-rendered bubbles because only one channel deduped. It is
  id-idempotent, returns the same array reference when nothing is new (a React bail-out), and the
  check runs INSIDE the state updater, against the list as React will commit it. Both message
  shapes are restated structurally (no type imports from a `'use server'` module) and held to
  the real types by `tsc` at the call site.
- **Gestures** (`edit.ts` — no DOM types, ever): edit caps 4000 (his) / 700 (hers); the three
  windows are disjoint by construction — reply swipe `dx > +44`, actions swipe `dx < −44` (same
  imported constant), tap within 10 px slop both axes; the 34 px between is a dead band, not
  slack. A rejected tap is silent; a rejected swipe reports — a thumb resting on the send target
  is noise, a deliberate drag that does nothing is a broken screen. `MessageBubble` adds no
  button/role/tabIndex; selection refuses the tap, so long-press needs no rule of its own.
- **`ChatScreen` has exactly TWO sanctioned `replaceState` writers** (mount-strip effect, and the
  soft-nav `?jump=` watcher in its commit only); a new query parameter joins the mount effect's
  by-name delete list, never a new effect. `tests/nina.chatPhoto.test.ts` counts the writers in
  the source (comments stripped) so an unsanctioned third fails loudly.
- **Deep links.** `?jump=` (message pinpoint; consumed on arrival) and scroll's `?at=` (must
  survive back-swipe) have opposite lifetimes and never mix. `searchHitHref`'s message arm
  delegates to `ninaJumpHref` — one builder for the grammar. The `/nina/about` `?photo=` codec
  (`album.<id>|chat.<id>`, dot-spelled) lives in `album.ts`; `attach.ts`'s colon grammar is a
  DIFFERENT grammar sharing only the key. An any-age chat deep link resolves ON THE SERVER and
  crosses to the client only through `galleryPhotos`, which strips `description`.

## Images

**Generation runs in-platform**, inside `after()` on the invoking segment's 300 s budget —
re-measured in production (a 90 s inline render held HTTP 200; the old 60 s ceiling that exiled
this to GitHub Actions was an expired measurement). There is NO asynchronous OpenRouter image
API (`POST /api/v1/images` is synchronous; the async job API is video-only), so durability is
ours: three nets in order — `after()` itself; `reviveNinaImageJobs` on the next render
(`NINA_IMAGE_REVIVE_BUDGET = 1`); the `.github/workflows/nina-image.yml` worker as demoted
backstop, manual drain and rollback target. `imagedispatch.ts` is gone; `error_code='dispatched'`
is a legacy value that still renders.

**Budgets** (`imagerecipe.ts`, zero imports): `NINA_IMAGE_CALL_TIMEOUT_MS` 150 s unanchored,
`NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS` 235 s with a reference (a reference rides `input_references`
as a `data:` URL; a fetch failure degrades to unanchored, never a crash), `NINA_IMAGE_RUN_BUDGET_MS`
255 s, worker 290 s — read through `ninaImageCallTimeoutMs(anchored)`, never directly; the
threshold chain to the 300 s host ceiling is test-asserted. **The daily cap is a money cap**:
fallback constant `NINA_IMAGE_DAILY_CAP = 30` (the 2026-09-10 ask), moved at runtime by the
`NINA_IMAGE_DAILY_CAP` env var via `ninaImageDailyCap()` (clamped 1–200 so a dropped digit fails
modest), counting FAILED generations too. `photoEagerness` changes how eagerly she OFFERS, never
what the operator spends.

**`NINA_IMAGE_ASPECT_RATIOS`** (`imagerecipe.ts`) is OpenRouter's ~23-value discrete `aspect_ratio`
enum — exported (2026-09-19, was module-private) alongside a new lookup,
`ninaImageAspectRatioValue(label)`, which resolves a label back to its numeric ratio or `null` for
an unrecognized one. Both are phase 1 of the photoshop aspect-ratio crop feature: the picker reads
the enum directly, and `photoshopRun.ts` (phase 3, landed 2026-09-19) resolves the admin's chosen
label through the lookup rather than re-deriving it — a label that fell out of the enum between the
click and the run resolves to `null`, which is read as "no crop", never as a failed job.
`nearestNinaImageAspectRatio` (unchanged) still picks
the CLOSEST bucket to a source photo's real shape; it cannot make the match exact, which is the
whole reason `photoshopCrop.ts` exists — see Module map.

**The crop is applied to real bytes in exactly ONE place** (2026-09-19, phase 3):
`fetchNinaImageReference` (`imagecall.ts`, module-private), in the gap between "the Blob object
arrived" and "it became a `data:` URL". `callNinaImageModel` gained a trailing optional `cropBox`
— a `NinaImageCropBox`, integer `left`/`top`/`width`/`height` in SOURCE pixels, declared in
`imagecall.ts` rather than imported so the one file that touches the bytes owns the shape it
consumes (`photoshopCropBox`'s return type assigns to it structurally) — threaded straight through
and applied with `sharp().extract(...)`. Purely additive: every existing positional caller,
`imagerun.ts` included, is byte-identical to before. Four rules hold it together:

- **The crop changes the REFERENCE, never the request body.** The `aspect_ratio` label is
  `aspectRatio`'s job, one parameter earlier. `photoshopRun.ts` derives both from one place so the
  pair cannot drift; `callNinaImageModel` does not police a box passed without its label.
- **A box that cannot be applied drops the ANCHOR — it does not clamp.** A non-integer, negative or
  degenerate box, bytes `sharp` cannot decode, or a box that overhangs the pixels that actually
  arrived each return `null` and the job degrades to unanchored with a `console.warn`. Trimming an
  overhanging box would change its ratio, and off-ratio bytes sent under an EXACT `aspect_ratio`
  label reproduce the very stretch this feature removes, invisibly. A lost anchor is loud; a
  silently mis-shaped one is not.
- **No format method before `toBuffer()`, on purpose.** `sharp` re-encodes in the input's own
  format, so a JPEG stays a JPEG and the served `content-type` that `buildImageReferenceDataUrl`
  vouches for stays true. `NINA_IMAGE_REFERENCE_MAX_BYTES` is then checked a THIRD time, against the
  cropped bytes, because a re-encode is new bytes and a ceiling checked only on the input has a hole
  in it.
- **The crop lives on the job row as parameters, never as a derived blob.** It is recomputed and
  re-applied to bytes fetched fresh on every attempt — the same posture as `sourceUrl`, which is
  resolved per attempt rather than stored.

In `photoshopRun.ts`, `photoshopCropFor` is the whole seam and the only place naming a phase-1/2
symbol: it reads the job's four `crop_*` args, resolves the label through
`ninaImageAspectRatioValue`, calls `photoshopCropBox(source, targetRatio, crop)` and re-checks the
returned box against the stored source dimensions. Every miss — four NULLs, a PARTIAL set (a
half-written crop is not a crop the admin ever looked at, and guessing the missing half crops
somewhere nobody chose), an uncatalogued label, unknown source dimensions, a `null` box, an
overhanging box — degrades to "no crop, today's path" rather than failing the job; the bounds
re-check is not distrust of phase 1 but a choice between two failure modes, since the cheap one
(no crop) beats the expensive one (`sharp` refuses, anchor gone). On a hit the label is passed to
`callNinaImageModel` EXACTLY, **bypassing `nearestNinaImageAspectRatio` in BOTH anchor and edit
mode** — the rectangle IS one of the provider's exact values, so the label is the truth about the
bytes rather than the nearest bucket to them. Anchor mode's fixed `NINA_IMAGE_ASPECT` default and
edit mode's nearest-bucket fix both survive UNCHANGED as the no-crop path. The one failure that
costs money and still looks like success — a picture billed and composed to the promised ratio from
bytes that were never cropped — always surfaces as `anchored: false`, and the
`[photoshop] crop requested but the reference was dropped` warning is where the job log says so.

**The photograph's aesthetic is decided in `imagegen.ts` and nowhere else.** `NINA_SELFIE_STYLE` is
the camera block at the head of `NINA_PROMPT_TEMPLATE_DEFAULT`; `GENERATE_IMAGE_TOOL.description`
("take a photo of yourself and send it") is what the CHAT model reads when it decides to offer a
photograph and is **never concatenated into the sent image prompt** — which is the whole reason the
aesthetic lives in this constant rather than in the tool schema: the model cannot drift it. Five
rules a prompt edit has to hold. (Restated 2026-09-16 for P1-NIN-A052, which retuned the camera
against three reported defects — the pictures read as arm's-length selfies, her head read too big
for her body, her calves and feet read short, small or cropped. The three share one near-field
cause, which is why one paragraph now names the photographer, the lens, the distance, the
head-to-body proportion and a whole-body frame with the floor under her feet.)

- **There is no `negative_prompt` on this call.** `buildImageRequestBody` (`imagerecipe.ts`) sends
  `model, prompt, resolution, aspect_ratio, n, seed` plus a conditional `input_references` and
  nothing else, so every negative is an inline "no X" clause inside the POSITIVE prompt — the
  mechanism the watermark/border/retouching run has always used. Do not invent a parameter for one.
- **Every other clause rendered into the prompt must agree with the camera block.** The pose clauses
  `ninaPhotoPresence` appends land in the same string: the high-`steamy` one used to end *"the phone
  held close"*, a direct contradiction of a camera block that says no phone and no hand near the
  lens (it holds the pose for the person photographing her now). Every new dial clause is a fresh
  chance to re-contradict it, and nothing mechanical catches that — only reading both.
- **`NINA_FOCUS_EMPHASIS[key].term` is the ONLY per-key text there is, and both paths render the
  same single-line list.** The selfie path builds `{{focus}}` from `joinTerms` over the ticked
  `.term`s; `ninaFocusBlock` does the same for the avatar after filtering to
  `NINA_AVATAR_FOCUS_KEYS` (`face`, `skin`) and returns `null` when nothing the crop can honour was
  ticked. That is why the calf-length and foot-proportion fix is spelled inside the term. A term
  therefore carries **no internal "and" and no trailing preposition**: `joinTerms` may put five
  other terms in front of it and the template appends "above everything else in this photograph."
  (The record carried a second field, `.sentence`, an elaborated per-key prose form that only
  `ninaFocusBlock` read and only at the prompt-length dial's top two bands; both the dial and the
  field were removed 2026-09-18 — see *The prompt-length dial is gone*.)
- **The avatar path is a separate shell and stays out of it** (`NINA_AVATAR_STYLE`,
  `NINA_AVATAR_PROMPT_TEMPLATE_DEFAULT`, untouched by A052) — a head-and-shoulders crop rendered in
  a 28-44 px circle has no use for whole-body framing, foot visibility or a three-metre standoff.

**The prompt-length dial is gone (2026-09-18), and the avatar path is now permanently what its
middle band rendered.** There was a `promptLength` 0-100 preference, read through the repo's five
bands (`off`/`low`/`mid`/`high`/`max`), driving a "prompt-length ladder" in `imagegen.ts` that
spent more or less canon prose: body-sentence count, whether the face / outfit / presence blocks
appeared at all, whether the focus block got its elaborated per-key sentences, and which of two
camera shells the avatar used. The operator never moved it off its shipped default of `50`, so
every band but `mid` was dead code that only the tests ever reached. What the removal deleted:
`NINA_IMAGE_PROMPT_LENGTH_MIN/MAX/DEFAULT`, `NinaPromptLengthRung`, `NINA_PROMPT_LENGTH_RUNGS`,
`ninaPromptLengthRungFor`, `clampNinaImageScore` and `coerceNinaImagePromptLength` from
`imageprefs.ts` (plus `promptLength` from `NinaImagePrefs`, `NinaImagePrefsInput`,
`NINA_IMAGE_PREFS_DEFAULTS` and `coerceNinaImagePrefs`); `NinaPromptRung`, `NINA_PROMPT_RUNGS`,
`ninaPromptRung` and `NINA_PROMPT_LENGTH_FALLBACK` from `imagegen.ts`; the `rung` parameter of
`ninaFocusBlock`; `NINA_FOCUS_EMPHASIS[key].sentence`; and `NINA_AVATAR_STYLE_SHORT`, whose text
IS now the one `NINA_AVATAR_STYLE` because the "full" avatar camera was unreachable in practice.
Two rules survive it. **The five-band scale is `tuning.ts`'s and is not this feature's** — nothing
here was the reason `ninaBand` exists, and removing this dial does not license touching it.
**The column drop lands after the deploy**: `drizzle/0031_greedy_jocasta.sql` drops
`nina_image_prefs.prompt_length` and is committed but deliberately unapplied until the code that
stopped selecting it is in production — the repo's standing DROP COLUMN discipline, because
Drizzle expands a bare select into explicit columns. The column name still appears in
`tests/nina.imageprefs.test.ts`, which asserts the *historical* backfill migration's column list:
an applied migration is a fact about what happened and is not reinterpreted to match today's
schema, so that literal stays.
- **The source constants are the DEFAULT, not automatically what goes on the wire.**
  `effectiveNinaImageTemplate` returns the stored `nina_image_prefs.prompt_template` whenever it is
  non-empty and valid, and falls back to `NINA_PROMPT_TEMPLATE_DEFAULT` only for `''` or a row that
  fails validation. Measured 2026-09-16: the stored template was byte-identical to the shipped
  default, so A052 needed no migration alongside the source edit. The reverse direction — a prompt
  hand-tuned in `/admin/image-generation` becoming the shipped constant — is the
  `set-current-image-gen-prompt-as-default` skill's job and always a separate, later step; A052's
  text is a candidate camera block promoted by nobody yet.

**The pathname has two windows** (`images.ts`, zero imports): what the browser may ASK for
(`NINA_CHAT_ID_RE`, exactly `{12}` — `newId()`'s length; the mint got TIGHTER, not looser) and
what Blob actually STORES (`NINA_CHAT_STORED_ID_RE`, `{12}` + `-` + `{16,64}` — Vercel's
`addRandomSuffix` is an internal we do not control). One range admitting both would also let the
upload token mint authorise a suffixed id nothing legitimates — the original single `{12,24}`
range made every real upload fail AFTER payment, leaving an orphaned blob per attempt, and an
invented 3-symbol fixture suffix is what hid that from a green suite. Never widen a range to
cover the stored form; never write a fixture suffix you have not copied out of the store.

**Jobs** (`imagejobs.ts` / `jobview.ts` / `jobActions.ts`): every image row read carries
`isNull(ninaTurns.deletedAt)` — ten `WHERE`s across nine functions, no shared helper, each named
by `tests/nina.softDelete.test.ts` — because hiding must reach the SCHEDULER predicates, not just
the list query, or a dismissed job gets re-fired or apologised for. The one gap is accepted in
writing: the GitHub worker's hand-written claim does not know the column; anyone re-promoting it
to primary must add the predicate in the same commit. The flag is four things it is not: not a
refund (the cap ignores it), not a cancel (a hidden `pending` job still finishes and delivers),
not a delete (`softDeleteNinaImageJob` is an idempotent `UPDATE … deleted_at = now()`), not
per-kind (`kind='image'` writers only). **Redo** INSERTs a NEW row from the failed one's args
(`attempts: 0` is the one field that does not copy — a copied attempts would open a row no claim
can pick; the seed does not re-roll), never touches the failed row (audit trail), no dialog.
`jobview.ts` also owns the jump vocabulary (`JOB_JUMP_PARAM`, `ninaJumpHref`, `planJobJump` →
`ready|avatar|no-photo` decided from `getNinaJobPhotoBubble`'s earliest bubble carrying the
photograph — original OR reference) and `planJobPhoto` (the Detail-foto icon; an avatar job
answers `none` — no job→avatar key exists, and matching one by description or date would be a
guess). `getNinaJobPhoto` projects `{ id }`: `description` is structurally never selected.

**The photograph knocks, and so does the apology** (since 2026-09-14, P1-NIN-A049) — both through
`notifyNinaPush` (`lib/push/send`), the seam that already swallows its own failures, and both still
wrapped in a `try` of their own (`proactive.ts`'s shape; the seam's list read is outside its
`try`). Two rules hold the placement:

- **The notify is the LAST statement, never an earlier one.** `finishSelfie` notifies
  `'photo_delivered'` AFTER `completeNinaImageJob`, for the same reason the message and image rows
  go in before the job is marked `ok`, only harder: a signed HTTPS POST per live subscription
  placed above the terminal write widens the window in which the job is still `pending` while its
  photograph is already in the chat — and an instance killed inside that window hands
  `sweepStaleNinaImageJobs` a job to apologise for that nobody needs an apology about. Below it,
  the most a push can cost is the push. The body is the `caption` this process computed and proved
  non-empty at the insert, not a column round trip off the returned row; `message.id` is the row's,
  because a notification's `messageId` must name a row that exists.
- **The apology notifies from ONE site, which INHERITS its callers' gates instead of restating
  them.** `postNinaApologyMessage` is where `'photo_apology'` is sent, so both callers —
  `failNinaImageJob`'s terminal give-up and `sweepStaleNinaImageJobs`' 20-minute deadline — are
  covered by one line, and an AVATAR job or a job the runner HID (`deleted_at`, read off each
  caller's own `returning`, R2) pushes nothing by never reaching the helper. A notification written
  in the callers would be a second copy of both rules, free to drift. It is bound on the returned
  row (`insertNinaMessages` returns `[]` when the session is not his, so an empty result means NO
  ROW — buzzing a phone about a message that does not exist is strictly worse than silence), and
  the swallow is load-bearing in both callers specifically: `failNinaImageJob`'s catch logs *"image
  apology could not be written"*, which would misfile a notify failure under a message that DID get
  written, and the sweep's `swept += 1` sits AFTER the call, so an escaping failure would
  under-count the sweep.

`finishAvatar` deliberately notifies nothing: nobody asked in the chat, and the NULL `announced_at`
is the `avatar_changed` proactive trigger — the next cron tick is what makes her mention it.

**Adopting a photograph that already exists** (`avatarAdopt.ts`, since 2026-09-17, P1-NIN-A054) —
the THIRD avatar path and the only one with no camera in it. `generateNinaAvatar` invents a scene
and waits minutes; `setChatPhotoAsAvatarAction` (`lib/admin`) is the operator's; this one is the
runner pointing at a photograph mid-conversation. The tool is `set_avatar_from_photo`
(`handleSetAvatarFromPhoto`, `avatartools.ts`), and `SET_AVATAR_TOOL.description` now says in one
clause that it takes a NEW photo, because the two tools are only useful as a pair. Seven rules, and
the first is the one a new caller gets wrong:

- **The referent is resolved from STRUCTURE and never from a tool argument.** The model has never
  seen a photograph's id — `context.ts` hands it `imageDescriptions: string[]`, prose only — so an
  id-shaped property could only ever be hallucinated, and the schema has none (`because` is the sole
  property, `required` in the JSON schema and OPTIONAL in the Zod that validates, this file's
  documented *"`required` is documentation and not enforcement"* split). `resolveNinaAdoptTarget`
  answers in the order a person points: whatever is attached to the message being answered (first
  by `sort_order` — the leftmost tile is what "ini" means), else the most recent ORIGINAL photograph
  in the same session (`getLatestOriginalNinaSessionPhoto`), else nothing and she asks which. A
  proactive turn has no runner message and therefore no referent.
- **A reference row is flattened before the core, and refused inside it.** The resolver rewrites a
  re-share to what it points at (`sourceAvatarId` beats `sourceImageId`; `ninaPhotoProvenance`
  guarantees one hop, never a chain) and an album target is a PROMOTION — zero blob calls, zero
  inserts, only the crown moves. `adoptNinaChatPhotoAsAvatar` still refuses either provenance column
  outright, because a core that is only correct when its own resolver called it is not correct.
  `getLatestOriginalNinaSessionPhoto` carries `isOriginalPhoto()` for the same reason at the read.
- **Bytes first, rows second.** `fetch` → `put` (`nina/<userId>/avatar-<id>.<ext>`,
  `addRandomSuffix`) → INSERT, and the row records `put`'s RETURNED pathname, never the requested
  one. A failed copy writes nothing; a failed insert at worst orphans an object, which is the
  recoverable direction and `scripts/blob-reap.mjs`' domain.
- **`source_key = 'chat-photo:<imageId>'` is the whole of idempotence, and the LOOKUP is the
  policy.** A second "pakai foto ini" finds the first copy before any bytes move;
  `nina_avatars_user_source_key_unq` is only the backstop for the race the lookup cannot close, and
  a conflicted insert re-reads by key rather than erroring. `changed` is read BEFORE the promotion,
  so she can say "it already was" instead of pretending to have just changed it.
- **`source: 'operator'`, and `description` is inherited.** `'operator'` is the `NinaAvatarSource`
  member that had no writer until this: a PERSON picked these exact bytes — not the generator
  (`'generated'`), not `/admin` (`'admin'`). The chat row's `description` seeds the album row's, so
  adopting an already-described photograph costs no second vendor call; a NULL stays NULL, because
  the deferred describe is `lib/admin`'s and this layer must not reach for it.
- **It announces INLINE, which is the exact inverse of `finishAvatar`, and the two statements may
  not be reordered.** `setCurrentNinaAvatar` re-arms `announced_at` to NULL by design ("a
  hand-changed avatar makes her speak"); `markNinaAvatarAnnounced` immediately after closes it,
  because she describes the change in this same reply. Leaving it NULL would queue the
  `avatar_changed` cron to announce tomorrow a change she already told him about. For the same
  reason the `in_flight` guard is DELIBERATELY ABSENT here: `handleSetAvatar` refuses while an
  unannounced generation is in the air because two generations queue two announcements, and this
  tool queues none — applying the guard would refuse a legitimate adoption just because a selfie
  happened to be developing.
- **Nothing in it throws, and almost nothing is an error.** A vendor-shaped failure becomes `null`,
  becomes `copy_failed`, becomes one sentence in her own voice (`SET_AVATAR_FROM_PHOTO_ANSWERS`,
  written for a model and never rendered). Every refusal is `isError: false` — they are true answers
  to a legitimate request (`tools.ts`' ruling (g)); the single `isError: true` is a payload that is
  not an object at all.

**The layering direction is what forces the copy.** `lib/admin` depends on `lib/nina` and never the
reverse, and `setChatPhotoAsAvatarAction` is a `'use server'` action behind `requireAdmin()`
besides, so the chat path cannot call it. What `avatarAdopt.ts` duplicates is a CLOSED three-case
mapping (`jpg|png|webp` → content type) and one pathname template — a bounded copy of a pure
mapping, not of a business rule — while `NINA_BLOB_PREFIX` is imported, because that one has a
single home. Tests hold the copies together, exactly as they hold `'chat-photo:'`.

**Every failed generation CALL leaves a `nina_error_logs` row** (`imagerun.ts`'s module-private
`recordImageCallFailure`, since 2026-09-12), not merely every failed JOB. The call site sits in
`attemptOnce`, ABOVE `closeFailed`, deliberately: `closeFailed` either requeues (the attempt was
billed and, before this, invisible — the requeue UPDATE writes only latency and cost) or gives up,
and BOTH are failed calls, so a job that burns every attempt writes one row per attempt. The row:
`category` `'image_generation'`; `provider` `'openrouter'` as a CONSTANT (generation has no
fallback — the plan index's Decisions); `model` = the job's own coerced camera; `fullInput` =
`args.prompt` verbatim, exactly what `buildImageRequestBody` sent; `errorMessage` = the kind in
square brackets then the detail verbatim (`'[kind] detail'`) — the four-value classification PLUS
the raw provider text, which until now survived only in an expiring `console.warn`
(`nina_turns.error_code` keeps the kind and loses the sentence);
`imageUrl` = the normalised anchor URL (an INPUT image — a failed generation produces no output
one); `timeoutMs` = the abort budget the attempt actually got, reported by
`NinaImageCallResult`'s failure variant because the caller cannot re-derive it
(`ninaImageCallTimeoutMs` picks 235 s only when a reference truly went on the wire, so a job that
REQUESTED an anchor may have run a 150 s call, and the reference fetch's own time is already
subtracted). `timeoutMs` is `null` on exactly one path — the key was absent, nothing was sent.
Two failures never log: the store (`store: …`) and finish (`finish: …`) arms of `closeFailed` —
the model call succeeded there, so the Error-logs tab must not claim it failed. And the GitHub
worker writes no row at all: it cannot import `imagecall.ts` (out of scope by the plan's
Handoffs), so anyone re-promoting it to primary ports this writer too. Best-effort like every
writer — own try/catch, awaited inside `after()` — so it cannot cost the job its requeue or its
apology.

**Dedup** — three decision modules, deliberately not merged (`dedupe.ts` runner-upload,
`imageDedupe.ts` generated-hosts, `planChatPhotoAddWrite` in `lib/admin`): each host needs a
different import posture. `imageDedupe.ts` is zero-import so the worker strips and runs it;
`planNinaImageWrite({hit, stored})` has exactly three answers (original / pre-put skip / race)
and the race releases the loser blob ROW-FIRST. `imagerun.ts` hashes BEFORE the put (the only
way to skip it) and re-asks at the insert — **the race is closed by asking twice, not by a lock**;
a lookup fault degrades to put+original (the generation is already paid for; the photograph is
never lost to a dedup read). The hash rides on reference rows too: `content_hash` means
*identical hash ⟺ identical bytes in the store*; a NULL on an upload-path reference is a client
CLAIM never landing on a row that does not own the bytes — with ONE sanctioned exception, the
promotion below, which fills it on a reference row in the milliseconds before that row stops being
one; `updateNinaChatPhotoBlob` coalesces a
new replace's hash to NULL in the same `.set()` (a stale claim is the one lie the lookup cannot
survive). A deduped GENERATED row keeps its own description and prompt (`args.scene` truthfully
describes ITS bytes); a deduped admin ADD copies the keeper's (the `resolveAttachment` case).
Avatar is out of scope in both hosts. The sweep's `scripts/nina-dedupe-plan.mjs` restates policy
in raw SQL with `REQUIRED_COLUMNS` naming every column it touches — drift takes the workflow red.

**Promote before delete** (`provenancePromotion.ts`, since 2026-09-16, P1-NIN-A051) — the fourth
module in the dedup family and the only one that is not a decision module: it is a WRITE that has
to happen at one exact moment. A `nina_message_images` row may be a REFERENCE
(`source_avatar_id`/`source_image_id` set) which by the column header's own doctrine carries NO
measurements — `content_hash`, `perceptual_hash`, `perceptual_sig`, `width`, `height`, `bytes` all
NULL, because the keeper owns them. Both provenance FKs are `ON DELETE SET NULL` **and that is
correct** (*"the collection KEEPS the picture instead of losing it"*), but the instant the parent
goes the row reclassifies: `isOriginalPhoto()` counts it, the Media grid shows it, and it carries
nothing either dedup mechanism reads. A **ghost original** — a photograph that can never be
recognised as a duplicate of anything, forever (measured on production 2026-09-16,
`nina_message_images.id = 'Tdw_AkrJT0ks'`, byte-identical prose to a selfie four tiles away, every
measurement NULL, its object already 404). The fix is not to change the FK; it is to make the row
TRUE before the transition. Five rules, and the first is the one a new delete path gets wrong:

- **The order is promote → delete the row → guarded blob delete, and none of the three may move.**
  The promotion must run while the parent id still links the dependents (the FK fires INSIDE the
  parent's own DELETE statement, so a `RETURNING` arrives too late — which is why
  `deleteNinaAlbumFolderAction` reads `listNinaAvatarIdsInFolderTree` separately, carrying
  `deleteNinaAvatarsInFolderTree`'s WHERE clause for clause, `is_current = false` included). The
  blob question must run AFTER the row delete, so it observes the post-`SET NULL` state and needs
  no "except this one" exclusion parameter. Five delete paths share the two entry points
  (`promoteNinaAvatarDependents` / `promoteNinaImageDependents` — two functions, never one `kind`
  parameter, so handing an avatar id to the image arm is a type error rather than a silent miss).
- **It can never cost the operator their delete.** Nothing in the module rejects: the lookup, each
  object's fetch/hash/sign and each write are wrapped individually, one dead object does not stop
  the ones after it, and every failure degrades to exactly today's behaviour and logs. Same ladder
  `storeNinaImage` walks and `dedupe.ts`'s header states for the family (rule 7). A dedup
  optimisation failing must never fail the user's actual request.
- **One GET per OBJECT, not per row, and sequential.** Rows sharing a `pathname` share bytes and
  therefore share a measurement, so the pass groups by pathname and issues one `UPDATE … id IN (…)`
  per group. The groups are walked in order rather than in `Promise.all`: each GET holds a whole
  image in memory inside a duration-limited Server Action, and a folder delete can be hundreds of
  objects. It also fetches ONCE — `fetchAndSignImage` is the obvious call and the wrong one, because
  the hash and the signature must describe the same buffer.
- **`promoteNinaImageMeasurements` is the one write in `queries/images.ts` that deliberately omits
  `isOriginalPhoto()`**, and adding it back makes the statement a guaranteed no-op. Its rows are
  references *for another few milliseconds*, and the window is provably inert: both dedup reads
  (`findNinaImageByContentHash`, `findNinaSignedOriginals`) carry the predicate themselves, so
  nothing can match against a row until it stops being a reference. Two guards instead:
  `content_hash IS NULL` (idempotence against a concurrent promotion or the sweep's own `fill-hash`)
  and **`pathname = $n`** — the 2026-09-15 ghost-signature lesson, the same clause
  `updateNinaChatPhotoPerceptualSignature` carries: an admin Replace can repoint the row between the
  read and the write, and writing THESE bytes' measurements onto THOSE bytes' row is how a ghost is
  minted. A sharp failure leaves the perceptual pair and `width`/`height` UNTOUCHED rather than
  NULLed — "could not measure" is not "has no value", and the sweep's `fill-perceptual` owns the
  rest.
- **The blob delete asks first, per object.** All three avatar-side deletes were unconditional
  `del`s and are not any more: `deleteNinaAvatarAction` goes through the shared
  `releaseBlobIfUnreferenced` (`blobRelease.ts` — the canonical version of the argument), and the
  folder/bulk path's `reapAvatarBlobs` spells the same rule inline because batching is the reason it
  exists, asking `isBlobPathnameReferenced` in windows of `ADMIN_BLOB_REF_CHECK_CONCURRENCY` (8 —
  bounded concurrency, deliberately unrelated to `ADMIN_BLOB_DEL_BATCH`'s 100, which bounds blast
  radius). A check that THROWS answers "referenced" and keeps the object — an orphan is recoverable,
  a dead reference is not. Original and thumbnail are asked about SEPARATELY: a chat row can
  reference the full-size photograph while nothing anywhere references its album thumbnail, so one
  `del([both])` would have to take the weaker answer for both.

**The reference picker's chat side skips a photograph her album already adopted** (since
2026-09-12, P1-NIN-A039). `generatedChatPhotoScope` (`queries/images.ts`) is the one definition of "her
chat photographs" — `userId`, `kind = 'generated'`, `isOriginalPhoto()` — plus a fourth arm: a
correlated `NOT EXISTS` against `nina_avatars` on
`source_key = 'chat-photo:' || nina_message_images.id`, `user_id` bound INSIDE the subquery (an
unscoped one would let another operator's album hide these photographs; the probe is index-backed
via `nina_avatars_user_source_key_unq`). The arm exists because adoption COPIES:
`setChatPhotoAsAvatarAction` (`lib/admin`) and, since 2026-09-17, `adoptNinaChatPhotoAsAvatar`
(`avatarAdopt.ts`) write the only link there is onto the new album row,
the chat row it copied from keeps both provenance columns NULL, and `isOriginalPhoto()` — which
catches ALBUM → CHAT — cannot see CHAT → ALBUM, so the picker showed the photograph twice. All
three readers of the scope change together: `listNinaPhotoReferences` (the picker's chat page),
`countNinaChatPhotos` (its total) and `resolveNinaPhotoReference` (the stored selection — a saved
chat id whose row has since been adopted resolves to nothing). **The album copy is the survivor**:
it is the row the adoption made current and the one the picker can still offer after the chat row
is deleted. Deliberately unchanged: `mediaCollectionScope` (the Media view) and
`listNinaMessageImages` (`/nina/about`) must NOT grow the arm — an adopted chat row is still a real
photograph in a real bubble, and the Media view is the operator's only Replace/Remove handle on it;
un-adopted photographs are unaffected. Read-path only: no migration, no back-reference column
("bytes copied, not shared" is the write side's own rule). Since 2026-09-17 the arm also hides a
photograph the RUNNER adopted from chat, with no change to the scope: the chat path writes the same
`source_key`, so the one predicate covers both writers — which is the point of keying on the column
rather than on who wrote it. **The `'chat-photo:'` literal is spelled THREE times and cannot be one
import**: `queries/images.ts` builds it in SQL (not in TS), `lib/admin/ninaAlbumAvatarActions.ts` is
a `'use server'` module and may export only actions, and `avatarAdopt.ts` now names it
`NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX` — an exported constant so its test can pin it against the
literal rather than re-spell it, and deliberately NOT a shared one, because a db module must not
import an actions module and the SQL side has nothing to import into. They are
held together by `tests/nina.photoRefs.test.ts` (the emitted `not exists` SQL, the
writer's side, and the Media/about absence asserted as an absence),
`tests/admin.chatPhotoAdoption.test.ts`, `tests/nina.avatarFromPhoto.test.ts` and
`tests/nina.imageprefs.test.ts` (the scope's body must keep `notExists(` and the literal — the
do-not-inline guard).

**The perceptual twin gate** (`perceptual.ts`, zero imports): signatures (64-bit dHash +
16×16 grayscale mean-abs from `perceptualSign.ts`) see through re-encodes that `content_hash`
cannot. Five constants — `PERCEPTUAL_MAX_DHASH` 1, `PERCEPTUAL_MAX_SIG16` 2,
`PERCEPTUAL_ASPECT_TOLERANCE` 0.01, `PERCEPTUAL_MIN_SIZE_RATIO` 0.5,
`PERCEPTUAL_CROSS_RES_MAX_DHASH` 3 — exist VERBATIM in BOTH this file and
`scripts/nina-dedupe-plan.mjs` (the sweep is `.mjs` and cannot import the package): **if one
number moves, move BOTH**. Same-dimensions path: dHash ≤ 1 and mean-abs ≤ 2. Cross-resolution
path (added for the measured production twin that two resize paths produced): aspect tolerance
AND both size ratios ≥ 0.5 AND cross-res dHash ≤ 3 AND the SAME mean-abs ceiling — strictly
additive, and the exact vector that passes across resolutions is refused when both sides share
one size. Every gate was measured on a real production pair and pinned one step above; a
perceptual merge can destroy a near-miss (two shots of the same court are not duplicates), so
loosening one "to see what happens" is exactly how that happens. Known gap: the sweep's
stale-signature repair still shortlists by `(user, width, height)`.

**Captions come from the photograph.** The canned fallback `ninaImageCaption(jobId)` draws from
`NINA_IMAGE_CAPTION_POOL` (derived: all five of `NINA_IMAGE_CAPTIONS` minus the scene-asserting
`'ini gw abis lari tadi'`) — the set itself is an IDENTIFIER, never shrunk: rows in the database
carry all five sentences, and `isNinaPhotoCarrierMessage` recognises photo carriers by membership.
The real caption is `captionNinaPhoto` (`caption.ts`): one `glm-5.3` call → parse → `null`, never
throws, never a repair round trip. `prompts/caption.ts` (pure, never grows into a second
character assembler — voice blocks only) + `sanitizeNinaCaption`: clean, strip to a fixed point,
then refuse — no letter, ANY digit (`\p{Nd}|\p{No}`; every number near a caption came off the
photograph, and the prompt stops the number being produced while the sanitiser stops it being
said), alt-text vocabulary, over `NINA_CAPTION_MAX_CHARS` 120 — REFUSED, not truncated. Budget:
400 tokens / 12 s. `seenKind` is `'described'` (a witness ran — the admin add) or `'requested'`
(the selfie path, where paying a vision call to be told back our own prompt is absurd); a selfie
captions from `args.scene`, the runner's upload captions from the witness, and the GitHub-worker
path permanently uses the canned fallback (no z.ai key) — all three are true sentences.

## Vision

**`vision.ts` describes the photographs, and since 2026-09-12 it falls back.** The primary attempt
(`describeNinaImagesWithFetch`) is one `glm-4.6v` call to z.ai under the TEXT-AWARE token floor
(`NINA_TOKEN_FLOOR_PER_IMAGE` 150 since the measured 2026-09-09 false trip). Production enters
through `describeNinaImagesWithFallback`: on ANY z.ai throw — transport, non-200, empty completion,
or a floor trip — it writes a log row and retries ONCE against OpenRouter (`z-ai/glm-5.3-flash` over
`OPENROUTER_CHAT_URL`), then gives up to the existing degraded path. No backoff, no chain. Four
contracts:

- **The token floor gates the z.ai response ONLY.** The floor is a measurement of `glm-4.6v`'s
  tokens-per-pixel, not a property of images (150 exists because 500 false-tripped a real 612×862
  card). Nobody has measured the fallback model's prompt-token accounting, and a false trip there
  would convert a recoverable outage back into the undescribed photo the fallback exists to
  prevent — so the fallback's whole acceptance test is the plain non-empty trimmed completion, with
  the raw response snippet carried in the error for the log row. `NinaDescribeResult.floor` comes
  back `0` from that path: the honest "no floor was applied", and how a reader of the success log
  line knows the paragraph came from the fallback.
- **Both providers failing rethrows the PRIMARY error.** Every caller branches on the original
  class (`NinaVisionTokenFloorError` ⇒ `dropped`, else `transport` — `actions.ts`' composer
  pre-pass and the admin chat-photo/album actions alike), and the fallback only ever raises
  transport errors; rethrowing IT would silently reclassify every floor trip. Today's failure
  behaviour is preserved exactly — a total failure costs two log rows and nothing else.
- **The fallback's ceilings are its own, not borrowed.** `NINA_DESCRIBE_FALLBACK_TIMEOUT_MS` (30 s)
  — the z.ai 25 s was measured on a different vendor, and OpenRouter adds a broker hop;
  `NINA_DESCRIBE_FALLBACK_MAX_TOKENS` (900) budgets for a reasoning preamble instead of sending the
  z.ai-only `thinking` field nobody has probed against OpenRouter. The two endpoints are BOTH OpenAI
  Chat Completions, so the fallback is a URL/key/model swap with NO translation layer. A `toDataUri`
  blob-fetch failure is neither retried nor logged: the app's own storage failing is not a model
  failing.
- **Every failed attempt writes one best-effort `nina_error_logs` row** (`recordDescribeFailure` →
  `logNinaError`, category `'multimodal'`). Best-effort twice over: `logNinaError` cannot throw,
  and the writer wraps it in its own catch, so a phase-1 regression cannot cost a description.
  `fullInput` is the real prompt with the data URI replaced by a marker (`describeLogInput` — a
  base64 payload never reaches a row); `imageUrl` is the hosted Blob URL, filled in by
  `describeNinaImages` because it is the last layer still holding a link; `userId` is NULL by
  design — the describe seam has no user id, and the option exists so a caller that has one can
  hand it over without another signature change.

**`openrouter.ts` is the constants' single home** — every OpenRouter URL and every model id this
package names, zero imports like the rest of the roster. The vision fallback is its sole owner no
longer: the text-chat client (`llmFallbackText.ts`) and, since 2026-09-15, `embedding.ts` read from
the same file, and no module redeclares — `imagerecipe.ts`' standing rule for
`OPENROUTER_IMAGE_URL`/`NINA_IMAGE_MODEL`, now package-wide. Two URLs (`OPENROUTER_CHAT_URL`,
`OPENROUTER_EMBEDDINGS_URL`) and three model vocabularies, each with a different mutability rule:
`NINA_VISION_FALLBACK_MODEL` is hardcoded (the describe path sends an `image_url` part, so a
text-only id would 400 every photo); `NINA_CHAT_FALLBACK_MODEL_IDS` /
`NINA_CHAT_FALLBACK_MODEL_SPECS` / `NINA_CHAT_FALLBACK_DEFAULT_MODEL` are a CLOSED dropdown
vocabulary the operator moves with no redeploy (swapping a chat model changes only prose);
`NINA_EMBEDDING_MODEL` is the least movable of the three — see Embeddings. The `OPENROUTER_API_KEY`
read stays inside `lib/nina/` (`ninaEnv()`, inside the function and inside a try, so a missing key
costs the one call and never an import-time crash of the path that still works);
`scripts/check-openrouter-boundary.mjs` (`ci:openrouter-guard`) enforces that boundary on source
files.

## Embeddings

**`embedding.ts` (server-only, since 2026-09-15, P2-DB-A001) is one string in, one `number[]` out.**
`embedNinaText(text, opts)` → `embedNinaTextWithFetch(fetch, text, opts)`; the DI seam is the same
one `describeNinaImagesWithFetch` has and for the same reason — the module is `server-only` and
reads `@/lib/env`, so a fake `fetch` is the only honest way to test the validation. One `fetch`, no
SDK: `@anthropic-ai/sdk` cannot be pointed at an OpenAI-shaped embeddings endpoint, and a second
vendor SDK to send one JSON object would be more dependency than request. The album's semantic
search has exactly two jobs for a vendor — a photo's stored `description` at write time, an
operator's query at read time — and both are this one call.

- **No fallback ladder, and that is not an omission.** `vision.ts` and `llmFallbackText.ts` each try
  z.ai then OpenRouter because both vendors serve chat/completions. Neither configured z.ai base URL
  (`LLM_VISION_BASE_URL`, `LLM_BASE_URL`) exposes an embeddings surface this repo has confirmed, so
  there is nothing to fall back FROM: one attempt, one `nina_error_logs` row, one throw. No retry
  either. If a second vendor is ever confirmed, this module gains a `…WithFallback` SIBLING in
  `describeNinaImagesWithFallback`'s shape — never a branch inside the core.
- **The width check is this module's token floor.** `vision.ts` refuses a response whose
  `prompt_tokens` says the image never arrived; the analogue here is length. The return is GATED on
  `embedding.length === NINA_EMBEDDING_DIMENSIONS` (`lib/db/schema`, 1536) and on every element
  being a finite `number`, because a wrong-width vector is not a worse ranking — it is a failed
  INSERT thrown from deep inside an `after()` callback, where pgvector's own message surfaces as an
  unattributable warning hours after the model was swapped. The error names both numbers.
- **The model and the dimension move together or not at all.** `NINA_EMBEDDING_MODEL` =
  `openai/text-embedding-3-small`, PROBED LIVE 2026-09-15 (200 OK on the first candidate,
  `data[0].embedding.length` 1536, every element finite) rather than assumed — the plan set's own
  exit criterion. It is deliberately NOT admin-configurable, unlike the chat fallback: its id fixes
  the width of `description_embedding` on both searchable tables, two embedding models do not share a vector
  space, and a mixed column ranks nonsense. Changing it is a new dimension constant, a new
  migration and a full re-embed, in one commit. pgvector's HNSW ceiling is 2000 dimensions, which is
  why "a bigger model" is not simply better here.
- **One error class, not two.** `NinaEmbeddingError(message, detail?)` covers empty input, a missing
  credential, transport/timeout, non-2xx, non-JSON, a missing or non-numeric vector and a wrong
  width — because no caller needs to branch on which (phase 2 logs and moves on, phase 3 returns
  `{ ok: false }`). The distinguishing detail rides in `message`/`detail`, and `embedErrorText`
  (pure, exported) is what keeps `detail` out of `String(cause)`'s blind spot.
- **A row before every throw but one.** `recordEmbedFailure` writes `nina_error_logs` with
  `category: 'text'` — an embedding IS a text-model call, and a fourth `NinaErrorCategory` would be
  a four-file edit reaching into an admin UI model for a tab nobody asked for — `provider`
  `'openrouter'` as a constant, `imageUrl` always NULL (this path never holds a photo), and the
  doubled best-effort guard `recordDescribeFailure` has. The one silent throw is the EMPTY-input
  check, hoisted above everything that could log: nothing reached a vendor, so a programmer error is
  one throw and zero rows.
- **Ceilings are its own.** `NINA_EMBEDDING_TIMEOUT_MS` 15 s — deliberately shorter than the
  describe path's 25/30 s, because an embedding is a single forward pass with no autoregressive
  decode, and phase 2 embeds every row of a folder upload inside one `after()` budget.
  `NINA_EMBEDDING_MAX_CHARS` 8 000 is a STORAGE-SHAPED GUARD, not a contract (`NINA_ERROR_LOG_TEXT_MAX`'s
  posture): a real description is ~900 characters, so nothing legitimate truncates; what it stops is
  a caller handing over a `data:` URI or a whole file. `clampEmbedInput` (pure, exported) appends NO
  truncation marker, unlike `clampNinaErrorText` — this string is EMBEDDED, and a sentence about
  truncation would put words in the vector the photograph does not contain. `encoding_format:
  'float'` is named explicitly: several providers behind this broker default to a base64-packed
  vector, which arrives as a string and fails the array check with a confusing message.
- **The write side is TWO modules with one shape, not one module with a table parameter**
  (since 2026-09-17). `queries/avatarEmbeddings.ts` fills `nina_avatars.description_embedding`;
  `queries/imageEmbeddings.ts` (§5c) fills `nina_message_images.description_embedding` — function
  for function, docstring argument for docstring argument, because the choice made was *mirror the
  album pattern* rather than unify the two tables. Two deltas, both forced by the table and neither
  optional: a media describe target carries `kind`, since that table holds both sides and the
  vision witness is picked with `describeSubjectForSide(photoSideOf(kind))` where an album row is
  always hers; and `isOriginalPhoto()` is in every media WHERE, because a row that re-shows a
  photograph living elsewhere must never be paid for a vector nothing can rank.
- **The 1536-float vector is NEVER selected — on either table.** No read projects
  `description_embedding`; every statement either writes it or projects `IS NOT NULL`
  (`(… IS NOT NULL)::int` with `.mapWith(Number)`, never a bare `sql<boolean>`, because a driver
  that hands back the STRING `'f'` is truthy and would silently skip every unembedded row as
  already done). In particular it is not in `imageColumns`, which `listNinaMediaPhotos` reads 48
  rows at a time, nor in `avatarColumns`.
- **A description write and a description+embedding write are different statements, deliberately.**
  `setNinaMessageImageDescription` / `updateNinaChatPhotoDescription` (`queries/images.ts`) are
  untouched and keep their callers: they are the right statements for a write that is knowingly NOT
  accompanied by a vector — the chat-caption path describes a photograph so Nina's prompt can read
  the prose, at a moment when whether search can find it is nobody's question.
- **`embedNinaText` has a caller as of 2026-09-15 — the read side.**
  `lib/admin/ninaAlbumSearchActions.ts` calls it once per query arm (the typed phrase, the query
  photo's caption, or both in one `Promise.all`), which is why `npm run knip` no longer flags it.
  The rule the seam was shipped ahead of its callers for still stands and is why it must not be
  inlined into either caller: the width guard and the `nina_error_logs` row are the vendor's ONE
  choke point, and a second call site that skipped them would put a wrong-width vector into a
  ranking nobody could explain.

## Unified photo search (album + media)

**`queries/avatarsearch.ts` (§9d) is three reads over TWO tables, merged into one ranked list.**
`searchNinaPhotosByText`, `searchNinaPhotosByImageCaption` and `searchNinaPhotosByTextAndCaption`
each rank `nina_avatars` AND `nina_message_images` by cosine similarity between a caller-supplied
query vector and each row's stored `description_embedding`. Like every other read in the layer they
take `userId` first and put it in the `WHERE` (rule 1) — and they search across EVERY folder,
because a search confined to the folder already open answers a question the operator could answer
by looking.

The three names were RENAMED from `searchNinaAvatarsBy*` on 2026-09-17: they stopped being about
avatars the moment they grew a second arm, and a name that says "avatars" over a merged ranking is
the kind of half-truth that survives three refactors. The row shape moved with them —
`NinaAvatarSearchRow`/`Page` → `NinaPhotoSearchRow`/`Page`.

- **Every physical photograph appears at most once, and that is a property of the two arms'
  PREDICATES, not of a dedup pass.** Nothing is deduplicated at merge time and nothing needs to be,
  because the two candidate sets are disjoint by construction:
  - the album arm carries `source_image_id IS NULL`, so a POINTER row is never a candidate (its
    vector is permanently NULL anyway — that arm is the one place the invariant is STATED rather
    than implied, and it is what keeps a mistakenly-filled pointer vector from doubling a tile);
  - the media arm carries `isOriginalPhoto()` (no album→chat re-share) AND a `NOT EXISTS` against
    an album row whose `source_key = 'chat-photo:<id>'` **and whose `source_image_id IS NULL`** —
    a legacy byte-COPY hides its original, following `generatedChatPhotoScope`'s existing "the copy
    is the survivor" rule rather than inventing a second one.
  - **That `source_image_id is null` qualifier inside the subquery is the whole of the
    correctness.** A pointer row keeps `source_key = 'chat-photo:<id>'` too (that is what makes
    re-adoption a constraint decision), so an unqualified `NOT EXISTS` would hide the Media row of
    every newly linked photograph — the one half of the pair that IS ranked. A photo promoted to
    her profile picture would silently vanish from search. Only a COPY hides its original; a LINK
    does not, because a link is not a second photograph.
- **Four statements, one `Promise.all`, and the JS merge is four ORDERED steps that are the
  contract.** Each arm runs its page and its count together; the two arms run together as well, so
  a search costs one round trip's latency, not two. Then: (1) concatenate, tagged with `origin`;
  (2) the relevance floor applied IDENTICALLY to both origins — one floor over one comparison
  against one query vector in one space, so a media hit and an album hit at the same score are the
  same statement about relevance; (3) the negative-keyword exclusion on the same pass, reading each
  row's OWN `negative_search_keywords` whichever table it came from (`queryText === null`, the
  image-only arm, exempts both origins by construction — no branch, no flag); (4) sort `score desc,
  created_at desc, id desc` over the COMBINED set, then clamp. Reordering those steps changes
  results.
- **The clamp is LAST and it is over the WHOLE result, not per table.** Each arm is asked for the
  full limit and the merged ~2× is trimmed once. Splitting the budget per arm would silently
  under-serve any query one collection dominates, which is most of them.
- **The merged sort is a TOTAL order, deliberately — not a stable sort over concatenation order**,
  which would make the album arm win every exact tie for no reason a reader could name. `id desc`
  is the final decider, so two renders of one corpus cannot disagree. An id collision across the
  two tables is possible in principle (both are `newId()`) and harmless: that pair is already
  ordered by score and date.
- **The cross-origin score comparison is legitimate rather than lucky.** One embedding model, one
  vector space, one column shape on both tables — which is why the merged sort may put a media row
  above an album row at all. Break that (a second model on one table) and the merge becomes
  nonsense with no error anywhere.
- **Negative keywords are a LITERAL whole-word match, not a second semantic layer.**
  Case-insensitive, comma-split, each phrase regex-escaped and wrapped in `\b…\b`. The cosine
  ranking already answers "what is this semantically near"; a fuzzy negative would stack a second
  tunable floor on the one the min-score already is, for a feature whose whole point is a hard,
  predictable exclusion the operator can explain by reading the two boxes in the panel. The `\b`
  ASCII word boundary is an accepted limitation for non-Latin scripts.
- **The media arm's projection is NOT `imageColumns`**, and its five constant fields are each
  `MediaExplorerPhoto`'s own existing convention rather than an opinion invented for search:
  `folder: ''` (a media row is filed nowhere), `isCurrent: false` (a message image is never itself
  her face), `thumbUrl: null` (no such column; consumers fall back to `url`), the three crop fields
  `null` (all-null folds to centred `object-cover`), `source: row.kind` (on that table the kind IS
  the provenance). `filename` is `null` because the display name is DERIVED from date and id in the
  UI and the data layer does not know that format; the consumer's `?? id` fallback is truthful.
- **`NinaPhotoSearchRow` is a FLAT shape and not a discriminated union**, because the consumer maps
  every hit to one `AdminSearchHit` (the grid draws one kind of tile). A union would make that a
  two-branch `switch` whose branches wrote the same object, and would push the media conventions
  above into the consumer instead of into the query that knows them. `origin` rides along for the
  deep link and the pane to open, not because the type varies by it.
- **The vectors arrive as arguments; this module does not know what a model is.** No embed call, no
  vision call, no `fetch`. The Server Action owns the vendor edge, which is the property that lets
  `tests/nina.avatarSearch.test.ts` and `tests/nina.mediaSearch.test.ts` assert the whole ranking
  against generated SQL through `tests/support/fakeDb` with nothing mocked and nothing on the
  network.
- **There is ONE EMBEDDING SPACE — two columns, one model — and image search still works, because
  an image query becomes text first.** No CLIP-style image embedding exists in this repo's vendor
  arsenal (both z.ai base URLs are chat/completions-shaped), so a query photo is captioned by the
  same `glm-4.6v` witness prompt that wrote every row's `description` — same `subject: 'self'`
  mapping, or cosine similarity would be measuring prompt register as much as content — and the
  caption is then embedded as text. Every query vector and both tables' columns therefore live in
  the SAME space. That is not a nicety: it is the precondition that makes both the combined read's
  weighted average AND the cross-origin merged sort legitimate rather than two (now four) scores
  from systems that happen to be numbers.
- **`ORDER BY <distance> ASC` is the one spelling a pgvector HNSW `vector_cosine_ops` index can
  answer.** `ORDER BY 1 - (...) DESC` is the identical ordering and forces a sort. So the ordering
  is on the raw distance and the PROJECTION computes `1 - distance`, because the human-facing number
  is the similarity. The direction is pinned by a test; do not "simplify" it into the DESC form.
- **The combined search is ONE statement PER ARM, not two ranked passes merged in JS.** A weighted average
  of the two distances is the same number as the weighted average of the two similarities (the
  weights sum to 1), so one expression is both the ranking key and, via `1 - x`, the reported score,
  and the weights cannot drift between them. The weights are module-private constants at an even
  split — deliberately not operator-configurable. This one read cannot use the index (it sums over
  two different query vectors) and is a scan of the user's embedded rows; at the requirement's scale
  that is a few hundred 1536-float dot products, and it is stated so nobody converts it back into
  two indexed passes and a merge.
- **`description_embedding IS NOT NULL` is in the candidate predicate of EVERY statement** — within
  each arm the ranked page and the count share one scope function (`albumSearchScope`,
  `mediaSearchScope`), so a page and its total can never describe different sets.
- **`NinaPhotoSearchPage.total` is a COVERAGE number, not a collection size and not a pager
  denominator.** It is the SUM of both arms' candidate counts: the rows that carried an embedding,
  were not excluded by their arm's dedup predicate, and were therefore compared — "48 shown, out of
  the photos that have been described". Search returns one flat top-N list and has no pager. A
  results pane that reads this as the collection's size will tell the operator a photo is missing
  when it is only un-embedded. A Media backfill is what moves it.
- **The top-N cap is module-private and is a UI number.** It is both the default and the ceiling
  (`listNinaAvatarsInFolder`'s posture — a caller may ask for fewer, never for more, so nothing can
  turn a ranked search into an unpaginated read of the album), and its value is the length of
  `components/ui/PhotoViewer`'s pager dot row, which the viewer draws one-per-photo. It stays
  private because the barrel re-exports this module with `export *` and the barrel contract test
  pins every runtime export to being a function.
- **The query vector is bound with an explicit `::vector` cast and `JSON.stringify` encoding** —
  byte-for-byte what drizzle's `PgVector.mapToDriverValue` writes for the column, so a stored vector
  and a searched-for vector cannot disagree. drizzle's `cosineDistance()` does resolve in 0.45.2 and
  is still not used: it binds without the cast, and all three reads need the distance composed into
  something else. Two cheap guards run before the bind — an empty array and a non-finite value are
  caller bugs that Postgres would otherwise report as a dimension mismatch or a parse error naming a
  column the function never mentioned.
- **The tiebreak is the album's own `(created_at desc, id desc)`, and it stays INSIDE each arm.**
  Exact ties in a float distance need two identical descriptions, which the "duplicate the folder"
  workflow really does produce; without the tiebreak those tiles swap places between renders for no
  reason. Per-arm is not redundant with the merged sort: it is what makes each arm's own `LIMIT`
  deterministic — WHICH rows of many equally distant ones come back is decided before the merge
  ever sees them.

## Linked album rows — the pointer redirection

**An album row whose `source_image_id` is non-null is a POINTER, and a pointer owns no prose.**
Since 2026-09-17 an adopted chat photograph is LINKED into the album rather than byte-copied into
it: the album row shows the `nina_message_images` row's bytes and names it in `source_image_id`.

- **The rule, in one sentence: a pointer row's own `description`, `search_keywords`,
  `negative_search_keywords` and `description_embedding` are DEAD.** All four are NULL on that row,
  permanently, and the values the operator sees and edits belong to the media row its
  `source_image_id` names. That is not a synchronisation mechanism, it is the ABSENCE of one, which
  is exactly why it cannot drift: editing in one place shows up in the other because there is only
  ever one row holding the data. A dual write would have a failure mode; this has none to have.
- **Reads redirect through an EXPLICIT second call — `resolveNinaAvatarLinkedText(userId, rows)`
  (`queries/avatarPointer.ts`, §9e).** It is deliberately NOT folded into `listNinaAvatarsInFolder`:
  the folder read stays one statement and every caller that does not render prose pays nothing. The
  call is a BATCH — one `inArray` statement for a whole page, so 120 tiles cost one extra indexed
  read rather than 120 — and it is keyed by the AVATAR id, so the caller's lookup is
  `linked.get(row.id) ?? row` with no second mapping. Rows that are not pointers are absent from
  the result (their own columns are the truth); a pointer whose target has gone is absent too,
  degrading to "no description" rather than throwing a 500 into an admin page.
- **Writes redirect too, and that is why the redirection lives in the query layer and not in a join
  in the page.** The four description/keyword edit actions all have to land on the linked media row
  for a pointer. They do not call `resolveNinaAvatarLinkedText` — they already hold the row and read
  `row.sourceImageId` off it — but they and it share one rule and one docstring, which is the point.
- **Nothing may render `row.description` for a pointer without going through the redirection
  first.** It will be NULL, and the photograph will look undescribed while its description sits one
  row away.
- **The pointer index is spelled `nina_avatars_source_image_id_idx`.** Every read that finds album
  rows by the image they point at is an index-backed equality on that name.
- **Deleting a media row is GUARDED before the FK refuses it.** `countNinaAvatarsLinkedToImage`
  (`queries/images.ts`, beside `isBlobPathnameReferenced` — that one asks "is anything pointing at
  these BYTES", this one "is anything pointing at this ROW", and a reader looking for either should
  find both without leaving the file) returns a COUNT and not a boolean, because the refusal's
  sentence says a number: *"2 album entries still show this photo."* An existence probe would make
  the operator open the album to find out how much work the refusal is asking for, and the count is
  index-backed so it costs what the probe would. The FK is `ON DELETE RESTRICT` and stays the
  backstop for the race this read cannot close — the pre-check exists to turn a constraint
  violation naming a constraint the operator has never heard of into the `{ ok: false }` + one
  sentence shape the delete action already uses.

## Memory, promises, patterns, proactive

- **Deleting a session takes what it taught her.** `removeNinaSession` (`queries/sessions.ts`) purges the
  session's `nina_memory_facts`, `nina_memory_slots` and `pending_promises` entries in the SAME
  transaction (five statements over one snapshot), because `loadNinaContext` reads the whole
  relationship's ledger — the one channel a deleted conversation could still reach her through.
  Scoped by PROVENANCE, not authorship: admin-typed rows (`source_message_id` NULL) survive
  every delete; a deleted MESSAGE never deletes its session. `npm run nina:memory-reap` is the
  standing backstop for the distillation race.
- **Distillation** (`distill.ts`) is relationship-aware (`NINA_DISTILL_PROMPT_VERSION` 3) —
  without it the librarian files "he calls her sayang" as a standing fact and can overwrite
  `nickname` with a word SHE said. Lazily imports `./gateway`, keeping the DB out of the pure
  path. Memory slots number ten; `training_plan` (tenth, directly after `running_days` — the
  pair a writer confuses) is `replace`-policy `prose(raw, 400)`: nothing parses it, only Nina
  reads it, and a parser with no consumer would discard legitimate phrasings.
- **Promises**: `promise.ts` (pure) / `promises.ts` (impure) split; a kept promise pays out
  through whichever camera `photoEagerness` names (send a selfie vs change her avatar), decided
  at fire time and recorded on the entry, so a dial moving mid-flight cannot make the evaluator
  watch the wrong table. A settle is an exact `turn_id` match, never a same-day count.
- **Reminders** (since 2026-09-16): `reminders.ts` (pure) / `reminderstore.ts` (server-only)
  split, the same shape `promise.ts`/`promises.ts` has and for the same reason — every question
  the feature asks is about strings and dates, so all of it is node-testable with no clock and no
  database (`todayISO`, `nowHHmm` and `newId` are all PARAMETERS). The runner asks in ordinary
  prose; the model expresses it on `SEND_TOOL`'s optional `reminders` array, **inline on `send`
  rather than as its own tool** because `turn.ts` drops sibling `tool_use` blocks when a `send` is
  present — a standalone `set_reminder` would be silently dropped exactly when she also replied.
  Storage is a `reminders` key in `nina_memory_slots` (`NINA_SLOT_REMINDERS`, `lib/db/schema/nina/
  memory.ts`), the `pending_promises` mechanism reused: **no new table and no migration**. Every
  time is a zero-padded Jakarta `'HH:mm'`, which makes "is it time yet" a plain string compare
  against `jakartaMinuteClockOf(now)` with no parser on either side. Two SEPARATE caps, and
  conflating them is the easy mistake: `MAX_REMINDER_WRITES` (4, `schema.ts`) bounds ONE TURN's
  writes; `MAX_ACTIVE_REMINDERS` (4, `reminders.ts`) bounds how many may be live at once, because
  the whole slot is rendered into her per-turn context. Cancelled entries are kept, newest
  `MAX_CANCELLED_KEPT` (3) only, so "you told me to stop" is answerable. Entries in one array are
  applied IN ORDER, which is load-bearing: an edit ("move it to 9") is a `cancel` followed by a
  `create`, and reordering them either refuses the create against a cap the cancel was about to
  free or cancels the entry just made. Since 2026-09-16 (`/admin/memory` CRUD, `lib/admin`), a
  fourth pure function, `patchReminder`, edits `label`/`message`/`timeOfDay` of one entry **in
  place** — `id`/`createdOn`/`lastFiredOn` untouched — unlike the chat path's cancel-then-create;
  the admin surface is its only caller.
- **Proactive** (`proactive.ts`): `evaluateAndEmitForUser` (cron) and `emitRunCommitted` (fired
  by `lib/review/actions.ts` on commit). `clinginess` moves `SILENCE_NO_CHAT_DAYS` (4),
  `SILENCE_NO_RUN_DAYS` (5), `SILENCE_COOLDOWN_DAYS` (3) — the only day-counts, and the reason
  the manja register must never be folded into it. **Six triggers since 2026-09-16**, five of
  them cron-eligible; `reminder_due` sits FIRST in `PROACTIVE_PRIORITY`, ahead of `avatar_changed`,
  because it is the only entry in that list the runner himself wrote and the engine emits at most
  ONE message per user per tick. Its idempotence marker is NOT a `nina_nags` row: it is the
  reminder's own `lastFiredOn` field, stamped by `markNinaReminderFired` AFTER the message rows
  are committed (the ordering `emitProactiveMessage` already gives every other trigger — marking
  first would spend the day's reminder on a model call that failed). `markerFor` therefore returns
  `null` for it, alongside `avatar_changed` and `run_committed`. A second reminder due on the same
  tick waits for tomorrow; that is stated Out of scope, not an oversight.

## Module map

| Area | Files |
|---|---|
| Server Actions | `actions.ts` (send/describe/poll/resend — the chat's mutation surface), `jobActions.ts`, `sessionActions.ts`, `albumActions.ts`, `searchActions.ts`, `messageActions.ts` (each a one-screen surface) |
| Turn pipeline | `turnrun.ts`* (also the ONE `'chat_reply'` push site; `NinaTurnDeps.notify` is its only injectable edge), `turnrevive.ts`*, `turn.ts`(T), `llmFallbackText.ts`* (the z.ai-first/OpenRouter-second client `productionDeps` wraps), `tools.ts`(T), `schema.ts`(T), `gateway.ts`, `load.ts`, `context.ts`, `dates.ts`(T), `chatturn.ts`(T), `turnflight.ts` |
| Prompts | `prompts/index.ts`, `prompts/system.ts`, `prompts/tools.ts`, `prompts/distill.ts`, `prompts/describe.ts` (two witness prompts behind a `Record` — a third subject is a compile error, and `subject` defaults to `'runner'` so existing callers are byte-identical), `prompts/caption.ts` |
| Character | `tuning.ts`, `persona.ts` (barrel) + `persona/` (bands, identity, appearance, voice, instructor, anger, verbosity, never-say, tuning-blocks) |
| Memory/behaviour | `memory.ts`, `distill.ts`, `promise.ts`(T)/`promises.ts`, `reminders.ts`/`reminderstore.ts`* (2026-09-16 — the same pure/impure split as promises; the pure half imports NO value and never reads a clock, and the impure half is the only file in the feature that knows a database exists; its suite is repo-level `tests/nina.reminders.test.ts`, not colocated), `nags.ts`, `patterns.ts`, `shortcuts.ts`(T), `title.ts`/`autotitle.ts` |
| Images | `imagerecipe.ts`, `imagegen.ts`, `imageprefs.ts`, `imagejobs.ts`, `imagecall.ts`, `imageDedupe.ts`, `perceptual.ts`/`perceptualSign.ts`, `imagerun.ts`, `imagefail.ts`, `caption.ts`, `imagetools.ts`/`avatartools.ts`, `selfiegen.ts`/`avatargen.ts`/`avatarAdopt.ts`*(2026-09-17 — the no-camera avatar path; the only avatar writer that announces inline)/`imagetest.ts`, `jobview.ts`(T), `provenancePromotion.ts` (2026-09-16 — the promote-before-delete pass; `blobRelease.ts` is the reference-checked release every single-object delete goes through; neither declares `server-only`, both are db-touching and neither is a Server Action), `photoshopCrop.ts`(T) (2026-09-19 — zero-import, same footing as `imagerecipe.ts`; the rectangle/ratio-aware analogue of `crop.ts` — resolve/clamp/pan/zoom/nudge over a per-axis `x`/`y` thousandths-of-frame crop, `ninaPhotoshopCropStyle` for the CSS preview, and `photoshopCropBox(source, targetRatio, crop)`, the one capability `crop.ts` never needed: an integer pixel rectangle for `sharp().extract()`, or `null` when the crop cannot be applied — phase 1 of the photoshop aspect-ratio crop feature; its one server-side caller is `photoshopRun.ts`'s `photoshopCropFor`, which hands the box to `callNinaImageModel`'s `cropBox` — phase 3, 2026-09-19) |
| Vision/intake | `vision.ts`(T), `imageTicket.ts`(T) (HMAC carrier, `node:crypto`), `images.ts`(T), `crop.ts`(T) |
| Provider constants | `openrouter.ts` (zero imports; the ONE home of `OPENROUTER_CHAT_URL` + `OPENROUTER_EMBEDDINGS_URL` and of all three model vocabularies — `NINA_VISION_FALLBACK_MODEL` hardcoded, `NINA_CHAT_FALLBACK_MODEL_IDS`/`_SPECS`/`_DEFAULT_MODEL` operator-picked, `NINA_EMBEDDING_MODEL` migration-locked; read by the vision fallback, the text-chat fallback client and `embedding.ts`) |
| Embeddings | `embedding.ts`*(T) (one `fetch` to `OPENROUTER_EMBEDDINGS_URL`, no fallback ladder, no retry; the width guard gates the return against `NINA_EMBEDDING_DIMENSIONS`) |
| Album/attachments | `album.ts`(T), `albumActions.ts`, `attach.ts`(T) |
| Chat UI logic | `chatview.ts`(T), `reply.ts`(T), `reveal.ts`(T), `scroll.ts`(T), `live.ts`(T), `edit.ts`(T), `chrome.ts`(T) |
| Persistence | `queries/` — one module per domain area + module-internal `columns.ts` behind the `queries.ts` barrel (`export *` per module, zero imports; every `nina_*` access; `queries/avatarsearch.ts` (§9d) is the MERGED ranked read over both photo tables and the only module that hand-writes a pgvector operator — and the only one that imports a sibling DOMAIN module, `./images`' `isOriginalPhoto`, deliberately, so the media arm's "not a re-share" rule is the same predicate every other collection read uses; `queries/avatarEmbeddings.ts` (§9c) and `queries/imageEmbeddings.ts` (§5c, 2026-09-17) are the two `description_embedding` write sides, one per table, same shape; `queries/avatarPointer.ts` (§9e, 2026-09-17) is where a LINKED album row's prose actually lives; `tuningFromRow`/`tuningToColumns` in `queries/tuning.ts` are the one place the flat row and the nested model meet), `errorlogs.ts` (`nina_error_logs` write/read — the deliberate unscoped exception, server-side db-touching; its writers are `vision.ts`'s fallback orchestrator, category `multimodal`, `imagerun.ts`'s `recordImageCallFailure`, category `image_generation`, and `llmFallbackText.ts`'s `ninaFallbackTextClient`, category `text` — all three 2026-09-12) |

\* server-only, not Server Actions. (T) = colocated `*.test.ts` (29 as of 2026-09-15 —
`embedding.test.ts` is the newest and the one exception to "all over the pure modules": the module
is `server-only`, and its suite reaches it through the `fetchImpl` seam; integration lives in the
`tests/nina.*.test.ts` files, whose number moves with every landing — `ls` them rather than trusting
a count quoted here.
`lib/nina/queries.test.ts` also sits at this level but is
not a (T): it is the barrel contract test, not a pure module's suite.

## Dataflow

- **Send**: `Composer.tsx` (optional `describeNinaImage` pre-pass → signed `imageTicket`) →
  `sendNinaMessage` → persist + claim + `after()` → `runNinaBackgroundTurn` (context/tuning/
  shortcuts live) → `runNinaTurn` (shortcut match once, burst framing, every model call through
  `productionDeps`' fallback-wrapped client — z.ai, then OpenRouter once; tool rounds via
  `dispatchNinaTool` — `lookup_runs`/`compare_runs` read the once-per-turn `loadRunHistory`
  snapshot, `aggregate_runs` issues its own one-row `aggregateRunMetric`
  (`@/lib/db/queries/rollups.ts`) per call; `generate_image` opens a job and fires
  `fireNinaImageGeneration`) →
  validated send payload → bubbles → metrics → close → `notifyNinaPush(…, 'chat_reply')` (one per
  committed reply, guarded by `bubbles.length`) → `applyNinaReminderWrites` (a PK read plus at most
  one upsert; its own call with its own `try`, deliberately NOT routed through the distillation,
  whose contract is `memory.ts`'s `slot`/`fact` STRING vocabulary while a reminder is a structured
  record) → distillation. Client renders through
  `reveal.ts`/`chatview.ts`/`reply.ts` and polls `pollNinaReply`; refresh merges via
  `mergeServerMessages`.
- **Died turn**: sweep closes it `stale`; next render of `/nina` revives it (`turnrevive.ts`);
  his tap resends it (`resendNinaMessage`) — manual override outruns the cap.
- **Photograph home**: `runNinaImageJob` → `finishSelfie` → message row + image row →
  `completeNinaImageJob` → `notifyNinaPush(…, 'photo_delivered')`, in that order and never another.
  When it cannot: `failNinaImageJob` (budget spent) or `sweepStaleNinaImageJobs` (20 min) →
  `postNinaApologyMessage` → apology row → `notifyNinaPush(…, 'photo_apology')`. An avatar job and
  a hidden job reach neither notify, because they reach neither writer.
- **Avatar adopted, no camera** (since 2026-09-17): `set_avatar_from_photo` →
  `handleSetAvatarFromPhoto` → `setNinaAvatarFromExistingPhoto` → `resolveNinaAdoptTarget`
  (`ctx.sourceMessageId`'s attachments, else `getLatestOriginalNinaSessionPhoto`) → either
  `promoteNinaAvatarAsCurrent` (an album re-share: nothing copied) or
  `adoptNinaChatPhotoAsAvatar` (`getNinaAvatarBySourceKey` → `fetch` + `put` → `insertNinaAvatars`)
  → `setCurrentNinaAvatar` → `markNinaAvatarAnnounced`, in that order, all inside the tool round.
  Nothing is queued and no job row exists, so this path reaches neither notify nor the
  `avatar_changed` cron.
- **Photograph away** (since 2026-09-16): `promoteNinaAvatarDependents`/`promoteNinaImageDependents`
  (measure everything that re-shows it, while the link still exists) → the row DELETE (where
  `ON DELETE SET NULL` fires) → `releaseBlobIfUnreferenced` per object, or `reapAvatarBlobs`'
  windowed `isBlobPathnameReferenced` + chunked `del` for the bulk paths. Five callers, one order:
  `deleteNinaChatPhoto` (`albumActions.ts`), `removeChatPhotoAction`, `deleteNinaAvatarAction`,
  `deleteNinaAlbumFolderAction` (via `listNinaAvatarIdsInFolderTree`, read BEFORE the delete) and
  `removeNinaAvatarsAction`.
- **Proactive**: cron per user → `resolveNinaPromises` → `evaluateAndEmitForUser` →
  `loadProactiveFacts` (which reads the `reminders` slot DIRECTLY through `readNinaReminders`, not
  off `context.memory.slots` — that path renders every value to a display STRING) →
  `decideProactive` (five cron evaluators in `PROACTIVE_PRIORITY` order, `reminder_due` first) →
  `emitProactiveMessage` (trigger block from `system.ts`'s copy, push via `lib/push/send`, then
  the marker — `markNinaReminderFired` for a reminder, a `nina_nags` upsert for the others).
- **Character path**: `readNinaTuning` → `coerceNinaTuning` → `buildNinaSystemPrompt(tuning)`.
  Live every turn; no cache; no invalidation step anywhere.
- **Photo search** (read-only; album-only from 2026-09-15, merged since 2026-09-17): `/admin/nina` →
  the search Server Action (`lib/admin/`) → `requireAdmin()` → schema parse → a query photo, if any,
  through `describeNinaImagesWithFallback` (`subject: 'self'`, never stored, no Blob PUT) →
  `embedNinaText` on each arm in one `Promise.all` → `searchNinaPhotosByText` / `…ByImageCaption` /
  `…ByTextAndCaption` → **album arm and media arm concurrently, then one merged sort and one clamp**
  → ranked rows (each tagged `origin`) + a coverage total summed over both arms. The path writes
  NOTHING and deliberately does not `revalidatePath` — a search that re-rendered the grid under its
  own results fights the screen it is on. Each hit carries `origin`, `searchKeywords` and
  `negativeSearchKeywords` through to the consumer's `AdminSearchHit`, where all three are REQUIRED
  fields.
- **Adopting a chat photo into the album** (since 2026-09-17): the adopt action LINKS rather than
  copies — one `nina_avatars` row whose `source_image_id` names the `nina_message_images` row,
  written by exactly ONE writer and by nothing else ever, with `description` left unset because a
  pointer's prose lives on the row it names. `(user_id, source_key)` stays the only key that
  statement conflicts on, which is what keeps re-adoption a constraint decision rather than a second
  pointer row. Reads of that row's prose go through `resolveNinaAvatarLinkedText`; a delete of the
  media row goes through `countNinaAvatarsLinkedToImage` first.

## Dependencies

**External:** `@anthropic-ai/sdk` (type-only; the client is `@/lib/llm/client`), `zod`, `drizzle-orm`,
`next/server`'s `after()`, `next/cache`'s `revalidatePath` (jobActions only), `server-only`
(33 top-level modules, measured 2026-09-16 — `reminderstore.ts` is the newest; the count moves with
every landing, so `grep -l "import 'server-only'" lib/nina/*.ts | wc -l` rather than trust it),
`node:crypto`, `sharp` (three `server-only` files and no more: `perceptualSign.ts` measures,
`photoshopRun.ts` measures, and — since 2026-09-19 — `imagecall.ts` `extract()`s the photoshop
crop; all three treat a `sharp` failure as a degraded result, never as a throw).
**Internal:** `@/lib/db` + `@/lib/db/schema`
(heaviest), `@/lib/photos/contentHash` (the sha-256 hex format the whole dedupe set answers
from), `@/lib/date/ranges` (the Jakarta day model behind nags/patterns/promises/proactive),
`@/lib/format`, `@/lib/metrics/*`, `@/lib/llm/client`, `@/lib/env`, `@/lib/id`, `@/lib/auth`,
`@/lib/push/send` (`proactive.ts`'s own notifier, plus — since 2026-09-14 — `imagerun.ts`,
`imagejobs.ts` and `turnrun.ts` (the last through its defaulted `notify` dep) through its
`notifyNinaPush` seam, with `@/lib/push/payload`'s `NinaPushKind` imported type-only by
`turnrun.ts`; the seam exists because `proactive.ts`'s
`ProactiveNotifier` infers the narrower `ProactiveTriggerKind`, and that file must stay untouched).
One benign cycle: `proactive.ts` → `lib/push/send` → type-only back. One
dynamic import: `distill.ts` → `./gateway`.

## Reverse dependencies

101 files outside the package import from it (measured 2026-09-12): `app/`, `components/`,
`lib/{admin,photos,push,review}`, `scripts/` — plus the 51 `tests/nina.*` files. Widest:
`components/nina/ChatScreen.tsx` (ten submodules), `app/nina/page.tsx`,
`scripts/nina-image-worker.ts`, `lib/admin/*` (memory, album, chat photos, shortcuts, image-gen
test view) — `lib/admin/ninaAlbumSearchActions.ts` joined that list on 2026-09-15 and is the widest
single-purpose importer of them, reaching `queries`, `embedding`, `vision` and `album` in one file
because a search is a caption plus an embed plus a rank. `persona.ts` and `tuning.ts` are the least-depended-upon modules — the point of the
split: no file outside the package imports either, and `lib/db/schema.ts` keeps its own row type
rather than importing the model type.

## Concurrency

Request-scoped async TypeScript, not threads. The four things worth knowing: `after()` work
outlives the response and must never throw into it (which is why `reviveNinaChatTurn` returns
0/1); the dedup race is closed by asking twice, not by a lock; `persona.ts`/`tuning.ts` are pure
and stateless; `NINA_TUNING_DEFAULTS` is frozen and shared, and `coerceNinaTuning` returns a
fresh unfrozen object precisely so callers may hold and spread it. Two different clients can
legally double-open a chat claim (~50 ms window) — one duplicate reply, accepted in writing.

## Error handling

Coercers never throw (the consumer is a model call mid-conversation). Actions return typed unions
(`SendNinaMessageResult`, `ResendNinaMessageResult`, `NinaJobActionResult`, …); `ChatScreen`
treats a THROWN action as `'failed'`. Recovery paths degrade rather than 500: resend/cancel/revive
swallow their own failures (the one deliberate exception is the revive's attempt-count read,
which degrades OPEN); a superseded turn's metrics still land; a dedup fault degrades to
put+original; a failed blob release leaves the object for the reaper (`releaseBlobIfUnreferenced`
errs toward keep — an orphan is recoverable, a dead reference is not; since 2026-09-16 the album
side releases through it too, and `reapAvatarBlobs` restates the same erring-toward-keep rule for
its batched form); a promotion that cannot measure a dependent before its parent's delete logs and
leaves the row exactly as un-measured as it was (see Images' *Promote before delete*). `vision.ts` has two named
error classes (`NinaVisionTokenFloorError` — text-aware, computed AFTER the prompt is chosen so
the longer self prompt raises it toward "I could not see it"; `NinaVisionTransportError`); when
the z.ai attempt and the OpenRouter fallback have BOTH failed, the describe orchestrator rethrows
the PRIMARY error — every caller's `instanceof` branching survives unchanged — and each failed
attempt has already written its best-effort `nina_error_logs` row (see Vision); a failed
image-generation call has already written its own (see Images); a failed TEXT call has written one
row per attempt (see The chat turn, whose wrapper rethrows the OPENROUTER cause instead —
`turn.ts`'s catch branches on nothing, so the asymmetry costs no caller its classification);
`embedding.ts` has ONE class (`NinaEmbeddingError`) rather than two, because it has no ladder to
classify and no caller that branches — everything from an empty input to a wrong-width vector
throws it, with the diagnosis in `message`/`detail` and a `nina_error_logs` row already written
for every case except the empty input (see Embeddings);
`imagefail.ts` classifies failures
and picks what she says — a failure is a message from Nina, never a stack trace.

## Gotchas

- **A new column in `avatarColumns` or `imageColumns` is APPENDED, never inserted where it belongs
  semantically.** Both lists are projected POSITIONALLY by `projectedRow(...)` fixtures under
  `tests/` (`avatarRow()`, `imageRow()`), so an insertion in the middle silently RE-ASSIGNS every
  field after it — including the provenance ids the adoption guard and the dedup predicates read,
  which then fail as a wrong photograph rather than as a type error. An append costs each fixture
  one extra value and nothing else. This is why `searchKeywords`/`negativeSearchKeywords` sit after
  `createdAt` in `imageColumns` instead of beside `description`, and why `sourceImageId` is last in
  `avatarColumns` and last in `NinaAvatarRow`. Adding one anyway is a fixture audit, not an edit.
- **Only an explicit `false` disables a tuning key**; `enabled[key] === true` mutes a
  pre-migration row's personality on deploy. `isNinaKeyEnabled`/`coerceNinaEnabled` are the readers.
- **Never hard-code seventeen.** `NINA_TUNING_KEYS` is a spread; the migrations' `ADD COLUMN`
  list is the one place the number is a fact.
- **The identity band is not always `mid`** (seven keys identify at `off`, `profanity` at `low`),
  and `horny` speaks from 40. Ask the specs; a tidied band table silently deletes the middle of
  the axis the user described in most detail.
- **Contradictory dials are the operator's problem.** No arbitration: `/admin/nina` renders the
  assembled prompt; the operator reads the contradiction they wrote. That feedback loop IS the
  arbitration.
- **Keep the data tables walkable** (`JAKARTA_SLANG`, `ANGER_LADDER`, `NEVER_SAY_ENTRIES`,
  `GIRLFRIEND_VOICE_EXAMPLES`, …). A paragraph that restates a list is a second source of truth,
  and the failure is silent. Tests walk them.
- **`NINA_IMAGE_CAPTIONS` never shrinks**; what you may do is stop PICKING a member (add it to
  `NINA_SCENE_ASSERTING_CAPTIONS`; the pool derives itself). Never hand-copy the pool.
- **`prompts/caption.ts` must never grow a second character assembler**, and caption edits bump
  `NINA_CAPTION_PROMPT_VERSION`, never `NINA_PROMPT_VERSION` (the tool property `description`
  is part of the prompt and counts).
- **A tool's vocabulary lives in `schema.ts` and is COPIED into `prompts/tools.ts`, never
  imported.** The prompt module's zero-value-imports property is deliberate, so the const arrays
  (`NINA_AGGREGATE_METRICS`, `NINA_AGGREGATE_FNS`, `NINA_AGGREGATE_INTENTS`) are re-spelled as
  JSON-Schema `enum`s and `tests/nina.prompts.test.ts` asserts the two equal. Widen one list and the
  test fails; widen both and forget the handler's `Record`, and `tsc` fails — the record is keyed by
  the derived union, so it is exhaustive by type. A list mirrored from `lib/db/schema` (run intents)
  fails at the handler's `RunIntent | null` assignment instead. Three different mechanisms, none of
  them a comment.
- **A tool schema change bumps `NINA_PROMPT_VERSION` and must NOT move the prompt snapshot.** The
  two facts look contradictory and are not: the constant covers system text and tool schemas, the
  snapshot covers only `buildNinaSystemPrompt`'s bytes. Adding `PROACTIVE_COPY.reminder_due`
  (version 10) did not move it either, and that is not luck: `buildNinaSystemPrompt` renders no
  trigger copy — `PROACTIVE_INSTRUCTIONS` is appended to the USER turn by `proactive.ts`. Adding a
  WHOLE tool is the same case, not a bigger one: version 11 (`set_avatar_from_photo`, 2026-09-17)
  bumped the constant and left the snapshot unregenerated. A regenerated snapshot in a tool-only
  commit is still the tell that something else moved.
- **A new `ProactiveTriggerKind` is a THREE-list change and only one of the three can import the
  union.** `NINA_PUSH_KINDS` (`lib/push/payload.ts`) spells the names by hand because the
  off-platform image worker loads that module under `--experimental-strip-types`, and
  `NinaMessageSource` (`lib/db/schema/nina/chat.ts`) is a column domain — `emitProactiveMessage`
  writes `source: detail.kind` straight through, so a trigger the column cannot hold is a trigger
  that cannot be persisted. Neither list is optional and neither is a comment: `npx tsc --noEmit`
  fails at `pushNotifier satisfies ProactiveNotifier` (`lib/push/send.ts`) and at
  `lib/push/payload.test.ts`'s exhaustive `Record` if either drifts. `vitest` alone will NOT catch
  it — run the typecheck.
- **`reminders` is deliberately NOT a member of `NINA_SLOT_KEYS`.** That list is the closed
  vocabulary the DISTILLER may write and `/admin/memory` renders, and every key in it owes a
  `SlotSpec` (`canonicalise` + a line of distiller prompt) plus entries in two exhaustive
  `Record<NinaSlotKey, …>` tables in `lib/admin/memoryVocab.ts`. A reminder is written by its own
  applier and never by the distiller, so joining that vocabulary would buy nothing and cost the
  distiller a key it must be told to refuse. `NINA_SLOT_REMINDERS` is declared in
  `lib/db/schema/nina/memory.ts` beside `NINA_SLOT_PENDING_PROMISES` for exactly that reason: its
  value is STRUCTURED, so the evaluator must be able to name the key without reaching into
  `memory.ts`'s prose vocabulary.
- **The reminder slot row carries a NULL `source_message_id`, and that is what keeps it alive.**
  A NULL there is what makes the row structurally unreachable by `removeNinaSession`'s
  `source_message_id IN (…)` purge, and a standing daily instruction should outlive the
  conversation it was given in. The ENTRY still carries its own `sourceMessageId` for provenance.
  The row's own `source` is read and written back, never relabelled as distilled.
- **The Nina cron is `"0 13 * * *"` (20:00 WIB) and the account may hold exactly two cron jobs.**
  Vercel `schedule` strings are UTC always; Asia/Jakarta is UTC+7 with no DST, and 13 + 7 = 20 < 24
  so there is no date rollover (unlike `/api/cron/rollup`'s `"0 20 * * *"`, which lands at 03:00
  WIB the FOLLOWING day). It moved from `"0 12 * * *"` (19:00 WIB) for the reminders set: the Hobby
  plan fires a cron within the HOUR of its schedule, so the real window is ~20:00–21:00 WIB, which
  brackets the 20:45 that was asked for. `MISSED_DAY_EVENING_HOUR` (18) and `MISSED_DAY_LATEST_HOUR`
  (23) did NOT move with it and must not: they are an admission WINDOW, and 20:00–21:00 sits inside
  it exactly as 19:00–20:00 did. `vercel.json` still declares exactly two crons — the Hobby cap —
  which is why a second Nina pass is not proposed.
- **Stated limitation, recorded rather than papered over: a reminder due before the evening window
  cannot be delivered on time.** `dueReminder` is built generically and fires "at or past its
  time", so a 07:00 reminder is due every morning and delivered every evening. Firing it EARLY
  would be worse (a reminder that arrives before the thing it is about is noise) and a third cron
  job is not available on this plan. Do not "fix" this in the evaluator.
- **`jakartaMinuteClockOf` is the comparable clock; `context.ts`'s private `jakartaClockOf` is the
  rendered one.** The first is plain arithmetic in `proactive.ts` producing a zero-padded `'HH:mm'`
  that string-compares in clock order; the second renders the same shape through `Intl` for
  `NowFacts.clock`, a prompt value. Parsing the prompt value back out to decide whether to send a
  message is the wrong one of the two.
- **`NINA_REMINDER_TIME_PATTERN` is exported as a STRING, not a `RegExp`**, because
  `prompts/tools.ts` needs the same characters as a JSON-Schema `pattern` and that module may not
  import a value. `tests/nina.prompts.test.ts` pins the two equal, the same mechanism the
  `aggregate_runs` enums use.
- **A new read of an image row carries `isNull(ninaTurns.deletedAt)` itself** — no shared helper,
  by design, and the test names every function that must have it. `countNinaTurnsSince` is the
  ONE reader that must never grow the predicate.
- **Never `DELETE` a `nina_turns` row**; never add a confirmation to a `/nina/jobs` control;
  never let a redo touch the failed row or copy `attempts`.
- **A push is the last statement of the writer that earned it, and it is always swallowed.** Never
  move `notifyNinaPush` above the terminal ledger write (`completeNinaImageJob`) "to tell him
  sooner" — that trades a few hundred milliseconds for a window where a killed instance leaves a
  delivered photograph looking like a job to apologise for. And never hoist the apology's notify up
  into `failNinaImageJob` or the stale sweep: the avatar gate and the `deleted_at` gate are the
  callers', and `postNinaApologyMessage` inherits both by being the one site below them. The chat
  reply obeys the same rule from the other end: `'chat_reply'` sits BELOW `closeNinaChatTurn` (the
  poll's two flags flip there, so an earlier push wakes him onto a typing indicator) and ABOVE the
  distillation (two more model calls he should not wait through) — and it is guarded by
  `bubbles.length`, never by "the turn succeeded".
- **Every message writer's push is written ONCE, at the writer, not at the action.** Four entry
  points (`sendNinaMessage`, `resendNinaTurn`, `reviveNinaChatTurn`, the burst chain) converge on
  `runNinaBackgroundTurn`; a push added to one of the actions is a second copy free to drift, and
  the chain link would then double-notify. Same shape as the apology's one site.
- **Never widen a blob-pathname range to cover the stored form**, and never write an invented
  fixture suffix — a 3-symbol one hid a shipped-broken feature behind a green suite.
- **The five `PERCEPTUAL_*` gates move in TWO files or not at all.**
- **Do not merge the three dedup decision modules**, and never grow `planNinaImageWrite` into
  the query layer (`lib/nina/queries/`) — the worker would lose its one shared decision.
- **A NULL `content_hash` on a reference row is expected**, not drift; fill it by hand and you
  have written a claim nobody made. The ONE sanctioned filler is
  `promoteNinaImageMeasurements`, and only from `provenancePromotion.ts`, and only immediately
  before the parent delete that stops the row being a reference — it measures the object the row's
  own `blob_url` already serves and will go on serving.
- **A delete that can orphan a reference row runs promote → delete → guarded blob delete, in that
  order.** Adding a sixth delete path means adding `promoteNinaAvatarDependents` /
  `promoteNinaImageDependents` above its row delete and routing its `del` through
  `releaseBlobIfUnreferenced` (or, if it batches, through `isBlobPathnameReferenced` per object)
  below it. Running the promotion after the delete finds nothing — `ON DELETE SET NULL` fires
  inside the parent's own statement — and running the blob check before it gets the wrong answer.
  Neither step may throw at the operator: both are optimisations over a delete that must succeed.
- **`promoteNinaImageMeasurements` must NOT grow an `isOriginalPhoto()` clause.** Every other write
  in `queries/images.ts` carries it; this one is the deliberate exception and the predicate would
  make it a guaranteed no-op. Its `pathname = $n` guard is equally load-bearing — drop it and a
  concurrent admin Replace mints exactly the ghost signature the 2026-09-15 incident was about.
- **A reference check that throws keeps the object.** `reapAvatarBlobs` answers "referenced" on a
  failed `isBlobPathnameReferenced`, the same direction `releaseBlobIfUnreferenced` errs in: an
  orphan is recoverable, a dead reference is not. And never collapse an original and its thumbnail
  back into one `del([...])` — they have different answers.
- **`bumpNinaShortcutUses` is telemetry** — `.catch()` it. **`matchNinaShortcuts` runs once per
  turn**; `actions.ts`/`turnrun.ts` read `firedShortcutIds`, they do not re-match.
- **Do not delete the `U+FE0F` strip, and do not "also strip `U+200D` while you are there"** —
  the two look like the same tidy-up and are opposites.
- **The burst cancel's three conditionals are load-bearing** (the supersede WHERE; the
  phase-advance arm conditional on `status='pending'` with a metrics arm that names neither
  `status` nor `error_code`; `chatTurnWasSuperseded` answering exactly `failed`+`superseded`).
  Each is one "tidy-up" from a corruption or a silently lost reply. `chatturn.test.ts` pins them
  against the generated SQL.
- **`ChatScreen`'s two `replaceState` writers are the whole budget**, `jobCanRedo` lives in
  `jobview.ts` because a `.tsx` condition is unassertable in node, and `lib/nina/context.ts` was
  ruled off-limits by its plan set — anger fixes belong in the ladder block.
- **`*/10` inside a JSDoc block closes the comment.** Write `*\/10` (the worker and the render
  tests carry the convention). Harmless in `//` comments and YAML; escaping it there is noise a
  later reader will try to "fix".
- **`logNinaError` cannot throw, and every writer wraps it in its own try/catch.** It is invoked
  from inside the failure path of the very call it records (a catch block in `vision.ts`, the
  `!outcome.ok` branch in `imagerun.ts`, the two catch sites in `llmFallbackText.ts`), so it is
  one try/catch, one `console.warn`, no rethrow —
  and it is awaited rather than fired and forgotten, because Vercel can drop an un-awaited promise
  inside `after()`. The vision fallback became its first writer on 2026-09-12 (`vision.ts`, with a
  second catch of its own so a phase-1 regression cannot cost a description); the image-generation
  call became its second the same day (`imagerun.ts`'s `recordImageCallFailure`); the text call
  became its third the same day (`llmFallbackText.ts`'s wrapper — category `text`, one row per
  failed ATTEMPT, not per turn); the set's last phase, the `/admin/error-logs` reader, lives in
  `lib/admin`.
- **The `glm-4.6v` token floor gates the z.ai describe response ONLY.** It is a measurement of one
  model's tokens-per-pixel, not a property of images; the OpenRouter fallback's response is
  accepted on a plain non-empty check and returns `floor: 0`. Porting the floor to a new provider
  repeats the 2026-09-09 false trip in the worst place — a path that only runs when the primary
  has already failed.
- **`openrouter.ts` is the ONE home of every OpenRouter URL and model id.** Import
  `OPENROUTER_CHAT_URL`/`OPENROUTER_EMBEDDINGS_URL` and the model constants, never redeclare them
  (the rule `imagerecipe.ts` already applies to the image constants), and read `OPENROUTER_API_KEY`
  through `ninaEnv()` inside `lib/nina/` only — `ci:openrouter-guard`
  (`scripts/check-openrouter-boundary.mjs`) enforces that boundary on source files. Reading
  `process.env.OPENROUTER_API_KEY` directly passes the grep and breaks the invariant it stands for.
- **`NINA_EMBEDDING_MODEL` and `NINA_EMBEDDING_DIMENSIONS` are one decision spelled in two files.**
  Never move one alone, and never give the embedding model a dropdown the way the chat fallback has
  one: the id fixes the width of `description_embedding` on BOTH searchable tables
  (`nina_avatars` and `nina_message_images`), and two embedding models do not share a vector space,
  so a mixed column ranks nonsense rather than failing — and since 2026-09-17 the merged search
  sorts the two tables' scores against each other, so a model swap on one table alone is a ranking
  that is wrong with no error anywhere. Changing it is a new constant, TWO re-embeds and a
  migration, in one commit. The width guard in
  `embedding.ts` exists so that mistake surfaces at the call with both numbers named, not as an
  opaque pgvector INSERT error inside an `after()` hours later.
- **`embedNinaText` is an unused export on purpose** (knip flags it, measured 2026-09-15). It is the
  seam phases 2 and 3 of the semantic-search set consume. Do not delete it, and do not annotate or
  suppress the finding — the phase that adds the first caller is what clears it.
- **The embedding path has no fallback and no retry, and adding one inline would be the wrong
  shape.** There is no confirmed second vendor for this endpoint; if one appears, it becomes a
  `…WithFallback` sibling in `describeNinaImagesWithFallback`'s shape, because that split is what
  keeps a fake `fetch` from answering both providers with the same body and going green for the
  wrong reason.
- **Never append a truncation marker to text being embedded.** `clampEmbedInput` deliberately does
  not do what `clampNinaErrorText` does: one string is stored for a human, the other goes into a
  vector, and a sentence about truncation puts words in it the photograph does not contain.
- **The describe fallback rethrows the PRIMARY error, never the fallback's** — every caller
  branches on the original class (`dropped` vs `transport`), and the fallback only ever raises
  transport errors.
- **The TEXT fallback rethrows the FALLBACK's cause — the mirror image, on purpose.** The wrapper
  (`llmFallbackText.ts`) rethrows OpenRouter's error when both providers fail, because `turn.ts`'s
  catch branches on nothing (every failure ends the turn `'unavailable'`); the describe
  orchestrator must rethrow the primary because every caller `instanceof`-branches. "Unifying"
  the two rules silently reclassifies a failure in one direction or the other.
- **The error-log read is unscoped on purpose and bounded twice.** `listNinaErrorLogs` filters by
  category only — no `userId` parameter — and `NINA_ERROR_LOG_PAGE_SIZE` (25) is the read's
  CEILING as well as its default, so a hand-edited `?limit=` cannot unpaginate it.
  `NINA_ERROR_LOG_TEXT_MAX` (64 000) is a storage guard against a JSON-stringified base64
  `data:` URI, not a contract — the clamp annotates the truncation in the stored text rather
  than hiding it.

## Tests

29 colocated suites as of 2026-09-15 (28 over the pure modules, plus `embedding.test.ts` over a
`server-only` one it reaches through the `fetchImpl` seam); the repo-level `tests/nina.*.test.ts`
files carry the integration side; plus the barrel contract test `lib/nina/queries.test.ts`, which
freezes the barrel's exact runtime value-export LIST and is not a (T): the barrel is not a pure
module. **That list is the contract, not its length** — every landing that adds a query moves the
number, so the rule is that the list is re-sorted and extended in the SAME commit as the new export,
never weakened to a `toContain`. (It stood at 104 names on 2026-09-17, after the merged search
renamed three and added eight; read the file, not that number.) A RENAME is two edits in that one
commit, not a `toContain` escape hatch. The guards that can actually catch a regression, by
mechanism:

`tests/admin.memory.test.ts` asserts admin-memory isolation with a ONE-LEVEL
`readdirSync('lib/nina')` walk: since 2026-09-12's queries split, `lib/nina/queries/` is a
subdirectory outside its scan, so the guarantee over `lib/nina` files is enumerated, not
recursive — a new module under `queries/` does not automatically join the walk.

- **Cross-module equality tests** are the guard over every hand-written copy the layering forces.
  `tests/nina.prompts.test.ts` pins the tool ROSTER (`NINA_TOOLS`' names, in order) and each
  enumerated tool's JSON-Schema `enum` against the Zod const array that validates it — the copy
  exists because `prompts/tools.ts` may not import a value, so the test is what makes it safe.
  Since 2026-09-16 it also pins `SEND_TOOL`'s `reminders[].timeOfDay` JSON-Schema `pattern` against
  `NINA_REMINDER_TIME_PATTERN` (`schema.ts`), which is the same copy-and-pin for the same reason.
  Same family as the barrel contract test: the list is the contract, and it is extended in the SAME
  commit as the thing it mirrors — adding `set_avatar_from_photo` (2026-09-17) moved the roster
  list, `lib/nina/queries.test.ts`' frozen barrel list and `NINA_PROMPT_VERSION` together, and
  nothing else.
- **The no-camera avatar path is tested as a repo-level suite**
  (`tests/nina.avatarFromPhoto.test.ts`, 2026-09-17), because `avatarAdopt.ts` is `server-only` and
  its edges are a `fetch`, a `put` and the query barrel. The cases that would otherwise rot
  silently: the resolution ORDER (attachment before session fallback; a proactive turn resolves to
  nothing and asks the database nothing), a reference flattened by the resolver AND refused by the
  core, re-adoption copying and inserting nothing, the container derived from the SOURCE pathname
  rather than a hard-coded `png`, the row recording the STORED refs, and no image job row EVER
  opened. Two assertions there are invisible from the handler's answer and are the ones to keep:
  `announced_at` set in the same operation as the promotion (what stops the `avatar_changed` cron
  re-announcing it) and `changed: false` when the photograph was already her face.
- **The reminders feature is tested almost entirely as pure functions**
  (`tests/nina.reminders.test.ts`, 2026-09-16, plus the `reminder_due` cases in
  `tests/nina.proactive.test.ts`). That is the point of the `reminders.ts`/`reminderstore.ts`
  split: `todayISO`, `nowHHmm` and `newId` are parameters, so ordering, the caps, the duplicate
  refusal, the cancel-then-create edit and — the case the whole feature exists for — "already fired
  today" are all asserted with no clock, no database and not one mock. `tests/db.schema.nina.test.ts`
  holds the widened `NinaMessageSource` domain; `lib/push/payload.test.ts` holds
  `NINA_PUSH_KINDS`' sixth member.
- **Source-reading tests** (read the file, strip nothing): `tests/nina.prompts.test.ts` fails if
  the `persona/` modules (auto-discovered)/`prompts/system.ts`/`proactive.ts` name a raw tuning field;
  `lib/nina/shortcuts.test.ts` fails on any `import` line; `tests/nina.softDelete.test.ts`
  asserts `countNinaTurnsSince`'s predicate ABSENCE and that no statement `DELETE`s a turn;
  `tests/nina.imagerun.test.ts` asserts `vision` is absent from `imagerun`'s import graph (a spy
  on a module never imported can only pass); `tests/nina.chatPhoto.test.ts` counts
  `replaceState` writers in `ChatScreen`'s code.
- **The snapshot** (`tests/__snapshots__/nina.prompts.test.ts.snap`) is the byte-identity gate
  for the default character — regenerate it and invariant 2 is silently lost.
- **SQL-shape tests** (`tests/support/fakeDb`) split emitted statements into SET/WHERE halves:
  the soft-delete predicate per function, the supersede WHERE, the claim's state machine,
  `getNinaJobPhoto`'s two-table owner scope and `{ id }` projection. `tests/nina.avatarSearch.test.ts`
  (2026-09-15) established the technique and it is worth copying: every property it pins is one a
  `vi.fn()` could not see — that BOTH statements of a search carry the ownership scope AND the
  `IS NOT NULL`, that the ORDER BY is the raw distance ASCENDING (the index-answerable spelling),
  that the combined read carries both vectors and both weights in ONE statement (a JS merge would
  pass a behaviour test and fail this one), and that an oversized `limit` comes back capped.
  `tests/nina.mediaSearch.test.ts` and `tests/nina.mediaEmbeddings.test.ts` (2026-09-17) extend it
  to the merged read and the media write side, and each pins something only a SQL-shape test can
  reach: that the media arm's `NOT EXISTS` is QUALIFIED with `source_image_id is null` (unqualified,
  every behaviour test still passes and every newly linked photograph vanishes from search); that
  the merge interleaves the two origins by score and breaks an exact tie by `created_at`/`id` and
  NEVER by origin; that the relevance floor cuts a 0.19 media row exactly as it cuts a 0.19 album
  row; that the clamp happens AFTER the merge, with both origins still represented; that each
  `…AndEmbedding` writer touches exactly its two columns and no third; and that both batch reads are
  empty-safe (zero statements, not a round trip to say nothing).
- **The failure log is pinned at both ends**: `tests/db.schema.errorlogs.test.ts` holds the table
  to its promised shape (`user_id` nullable in the generated SQL too, exactly one index and not
  on the user, `category` text with no CHECK) and `tests/nina.errorlogs.test.ts` holds the writer
  to best-effort (`logNinaError` RESOLVES on a failed insert and sends NULL, not undefined, for
  the optional columns) and the reader to its ceiling (a `?limit=` above 25 clamps; an over-shot
  page returns `rows: []` with a truthful total).
- **The image-generation writer is pinned through the one door it has.**
  `tests/nina.imagelog.test.ts` (since 2026-09-12) cannot call `recordImageCallFailure` directly —
  it is module-private — so every case drives `runNinaImageJob` with everything leaving the process
  mocked, and pins: a row per failed CALL (requeued attempt included), the `[kind] detail` prefix,
  the anchor's URL and the anchored ceiling, the coerced camera, NO row for a Blob store failure,
  and a throwing `logNinaError` still costing the job neither its requeue nor its apology.
  Technique worth copying: the no-key sub-case is UNREACHABLE by unsetting the env var in-process,
  because `ninaEnv()` memoizes its parse (`ninaCache ??=` in `lib/env.ts`) and any earlier case in
  the same registry has warmed it with a key — the test gets the cold registry with
  `vi.resetModules()` plus a dynamic re-import.
- **The photoshop crop is pinned on both sides of the seam** (2026-09-19). The new
  `tests/nina.photoshopRun.test.ts` drives `attemptPhotoshopOnce` with `callNinaImageModel` mocked
  and asserts the ARGUMENTS, because the whole feature is which two values that call receives: the
  three no-crop cases are pinned byte-identical to before (edit mode's nearest bucket, anchor
  mode's `undefined`, edit mode with unknown dimensions), a crop overrides BOTH modes' fallback
  identically, and every degradation — partial args, an uncatalogued label, missing source
  dimensions, a `null` box, an overhanging box — comes back as "no crop" rather than a failed job,
  with the crop module asserted NEVER asked on a partial set. The `anchored: false` warning has a
  case of its own, since a silently uncropped-but-billed picture is the failure worth the test.
  `tests/nina.imagecall.test.ts` holds the other side with an injected `fetch` and real bytes: a box
  crops before encoding, NO box leaves the reference byte-identical to the fetched object, a box
  that does not fit the bytes that arrived drops the anchor rather than sending the wrong pixels,
  and a box on an UNANCHORED call is inert — no reference, no fetch, no throw.
- **The describe fallback is driven by a fake that routes on URL** (`vision.test.ts`, 32 cases as
  of 2026-09-12): the single-provider core keeps its own cases untouched, and the orchestrator's
  cases hand it a fake that answers `LLM_VISION_BASE_URL` one way and `OPENROUTER_CHAT_URL`
  another, the way the real world does. That split is WHY the orchestrator is a separate function —
  a fallback inlined into `describeNinaImagesWithFetch` would retry against a fake answering every
  call with the same body, and its floor-tripping body would sail through the (correctly)
  floor-free fallback check, green for the wrong reason. `describeLogInput`/`describeErrorText` are
  pinned so no data URI ever reaches a row and a floor trip stays diagnosable weeks later.
- **The text fallback is pinned in three layers** (`tests/nina.llmFallbackText.test.ts`, 15 cases
  as of 2026-09-12). The two pure translators get direct cases: `toOpenRouterChatBody` (the
  envelope `ninaBody` builds; the forced send as a function choice — the termination property; a
  completed tool round replayed as assistant `tool_calls` then a matching `tool` message;
  `is_error` folded into the text; thinking blocks dropped) and `toAnthropicMessage` (the fields
  `findSendBlock` and `usageOf` actually read; `length` → `max_tokens`; an empty completion
  THROWS; a tool-call id surviving the round trip). The client cases drive
  `ninaFallbackTextClient` with a scripted primary: z.ai answering touches neither OpenRouter nor
  the log; the z.ai rescue logs one row and recovers; a double failure writes two rows and still
  rejects; a sub-`NINA_FALLBACK_MIN_BUDGET_MS` timeout skips the fallback and rethrows z.ai's OWN
  error; a rejecting `logNinaError` costs nothing; and one client instance serves a whole
  multi-round turn (the statelessness property). The loop's own suite stays out of the way:
  `lib/nina/turn.test.ts` injects its scripted client through `fakeTurnDeps`, so it never
  exercises the wrapper — the seam is what keeps both suites honest.
- **The image push is pinned at both ends of the job, in two suites split by which door is
  exported** (2026-09-14). The delivered side has none — `finishSelfie` is module-private — so
  `tests/nina.imagerun.test.ts` drives `runNinaImageJob` whole and asserts the ARGUMENTS
  (`'photo_delivered'`, the row id, and the body being whatever landed in the bubble, canned
  fallback included), that an avatar generation notifies nothing, and that a rejecting
  `notifyNinaPush` costs neither the rows nor the `ok`. The apology side has two exported doors, so
  `tests/nina.imagepush.test.ts` (new) drives `failNinaImageJob` and `sweepStaleNinaImageJobs`
  directly and pins the same properties through the shared helper: one push carrying her apology
  verbatim, NOTHING for an avatar or a hidden job, nothing when the insert wrote no row, and a
  notify failure neither losing the apology row nor stopping the sweep counting the job.
  `@/lib/push/send` is MOCKED in both rather than left inert-for-lack-of-`VAPID_*` — that is what
  makes the kind and body assertable instead of resting on an unset environment variable. **What no
  test pins is the ORDERING** (the notify sitting after `completeNinaImageJob`): it is held by the
  docstring and by review, so read the Gotcha before moving that line.
- **The reply push is pinned through the injected seam, and the ORDERING with it**
  (`tests/nina.turnpush.test.ts`, new 2026-09-14). It drives `runNinaBackgroundTurn` with every edge
  mocked and a `notify` of its own, and pins: one call carrying the committed rows and
  `'chat_reply'`; the call landing after the insert and after `closeNinaChatTurn` but before
  `runNinaDistillation` (the property the image side has no test for — here the seam makes it cheap,
  so it is asserted rather than reviewed); NOTHING on each of the four no-bubble paths
  (superseded, deleted session, null payload, empty insert) with the turn still closing and
  distilling; a chained follow-up sending its OWN push through the forwarded `deps`; a rejecting
  notifier costing neither the rows, the closed claim, the distillation nor the auto-title. The last
  case is the one that needs the module mock: `@/lib/push/send` is mocked so the DEFAULT seam can be
  observed when no `deps` are passed, instead of resting on an unset `VAPID_*` making the real
  sender inert.
- **The embedding seam is pinned by a fake `fetch` and never touches the network**
  (`lib/nina/embedding.test.ts`, 15 cases as of 2026-09-15 — colocated, not repo-level, because the
  injectable core is exported). Four groups: the pure `clampEmbedInput` (trims, clamps, appends NO
  marker); the REQUEST (the probed shape on the wire — url, model, `encoding_format: 'float'`, the
  bearer, the ceiling — a caller-supplied `timeoutMs`, and empty text refused BEFORE the vendor with
  zero log rows); the WIDTH GUARD (the exact width returned; a wrong width naming BOTH numbers; a
  right-width vector carrying a non-finite element; a base64-packed vector refused as a shape rather
  than as a confusing length); and the FAILURES, each asserted against the row it writes (a thrown
  fetch logged under category `text`, a non-2xx carrying the raw body snippet a `res.json()` would
  have thrown away, a non-JSON body not pretending it parsed, a rejecting `logNinaError` changing no
  outcome, and `embedErrorText` keeping the `detail` that `String(cause)` drops). The `res.text()`-
  then-parse order is what makes the snippet assertable at all — copy it rather than "simplifying"
  to `res.json()`.
- **The promotion is pinned as a degradation ladder, and its ORDER is pinned at the caller**
  (2026-09-16). `tests/nina.provenancePromotion.test.ts` drives the module with a fake `fetch` and
  asserts the properties a `vi.fn()` could not see: one GET however many rows share a pathname; the
  UPDATE carrying BOTH guards; an unsignable object still getting its hash while the perceptual
  columns stay untouched; a non-https `blob_url` refused before any request leaves; and each of the
  four failure sites (lookup, fetch, measure, write) swallowed with the objects after it still
  landing. `tests/admin.albumAvatarDelete.test.ts` carries the half the module cannot see — that the
  promotion runs BEFORE the row delete, that a still-referenced object survives, that the thumbnail
  is asked about separately, and that a promotion which cannot reach the store never costs the
  operator the delete. Unlike the image push (whose ordering is held by docstring and review only),
  this ordering IS asserted; keep it that way when a sixth delete path joins.
- **Known-answer vectors** pin the perceptual gates in BOTH copies of the predicate
  (`tests/nina.perceptual.test.ts`, `tests/nina.dedupeMedia.test.ts`), so the two cannot drift.
- **Real-module integration**: `tests/nina.resend.test.ts` and `tests/nina.burstCancel.test.ts`
  mock only the edges and drain the deferred turn by hand — mocking the module under test would
  make every property untestable. `tests/nina.turnrevive.test.ts` asserts invariant 4 against
  the produced sources (`server-only`, no `'use server'`, no runner declared in `actions.ts`).
- Component tests live beside the components (`components/nina/**`); the pure logic they would
  otherwise need lives HERE so it can be tested without a DOM.
