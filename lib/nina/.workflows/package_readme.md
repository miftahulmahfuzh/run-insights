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
see Images.
**Documentation Created**: 2026-09-05 (`NINA_CHARACTER_TUNING_PLAN.md` phase 2)

## Overview

`lib/nina` is the whole of Nina — the in-app running companion. It owns who she is (the canon),
what she is handed on each turn (the context), how she is asked to answer (the prompts and the
tool-use loop), what she remembers, when she speaks unprompted, the photographs she generates of
herself, and every Drizzle query behind her tables. It is a **flat package with no `index.ts`
barrel**: every importer names a submodule directly, because a barrel would drag `server-only`
modules into `'use client'` components.

**Key responsibilities:**

- **The canon** — identity, register, anger ladder and prohibitions as text (`persona.ts`), and
  the stored per-user character that varies it (`tuning.ts`).
- **The turn** — assemble a context, run the tool-use loop, validate the reply, persist the
  bubbles, distil memory afterwards — as a background job that survives the response, with every
  model call behind a z.ai-first/OpenRouter-second fallback client (`llmFallbackText.ts`).
- **Proactive speech** — whether she opens a conversation, and on what.
- **Images** — her selfies and avatars, prompt → job row → Blob, plus the caption she writes
  under a photograph of hers from what is actually in it.
- **Chat UI logic** — the pure, node-testable decisions the chat screen makes (grouping, reveal
  timing, idempotent appends, scroll, gestures, chrome geometry), kept out of the components.
- **Persistence** — `queries.ts` is the single home for every `nina_*` table access — except the
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
   Source-reading tests enforce the property. `persona.ts` is nearly the same: pure text, no
   I/O, no `server-only`; it imports `./tuning` for the vocabulary plus a type-only import from
   `./imageprefs` (erases at compile time).
3. **The prompt side never reads the raw tuning.** `persona.ts`, `prompts/system.ts` and
   `proactive.ts` go through `ninaTraitScore` / `ninaDialScore` / `ninaActiveRelationship`
   (`tuning.ts`) — a direct read of `tuning.traits`/`dials`/`relationship` compiles and produces
   a checkbox the operator can clear with no effect, so `tests/nina.prompts.test.ts` reads the
   sources and fails on one. The store is the exception: `tuningToColumns` (`queries.ts`) keeps
   the value the operator PARKED, not the value the prompt uses.
4. **A `nina_turns` row is money and audit.** Never `DELETE` one; the trash icon writes
   `deleted_at` (a flag, not a cancel, not a refund — see Images). `countNinaTurnsSince`, the
   daily image cap, deliberately ignores the flag: a spend is not un-spent by hiding its row.
5. **Every bubble in her mouth was written by the model.** No app-authored prose, no apology
   bubbles, no `insertNinaMessages` on the resend path — the sweep closes a dead turn `failed`
   and retries nothing. This is the plan-set "invariant 7" and it is asserted, not intended.
6. **The image description is the vision model's private prose.** `nina_message_images.description`
   (from `describeNinaImages`, `glm-4.6v`) is never selected by a render read — projections name
   `{ id }` or go through `galleryPhotos`, which strips it — and never crosses into client props.
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

**`persona.ts`** — the text. No logic beyond string assembly, no I/O, so tests can assert rule
text and `/admin/nina` can render a preview. `docs/nina/persona.md` is the prose canon the user
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

**Version constants.** `NINA_PROMPT_VERSION` (7) identifies the ASSEMBLER — system text and the
schemas in `prompts/tools.ts`; it has bumped twice without any system text moving (the shortcut
block and the burst block are conditional user-turn bytes), because `nina_turns` must be able to
date a turn that could carry bytes no earlier version could. Three other calls carry their own
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
the second only what THIS reply must answer. Then `runNinaTurn` → persist bubbles → close →
distillation + auto-title. It calls no `after()` itself: callers own their scheduling.

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
CLAIM never landing on a row that does not own the bytes; `updateNinaChatPhotoBlob` coalesces a
new replace's hash to NULL in the same `.set()` (a stale claim is the one lie the lookup cannot
survive). A deduped GENERATED row keeps its own description and prompt (`args.scene` truthfully
describes ITS bytes); a deduped admin ADD copies the keeper's (the `resolveAttachment` case).
Avatar is out of scope in both hosts. The sweep's `scripts/nina-dedupe-plan.mjs` restates policy
in raw SQL with `REQUIRED_COLUMNS` naming every column it touches — drift takes the workflow red.

**The reference picker's chat side skips a photograph her album already adopted** (since
2026-09-12, P1-NIN-A039). `generatedChatPhotoScope` (`queries.ts`) is the one definition of "her
chat photographs" — `userId`, `kind = 'generated'`, `isOriginalPhoto()` — plus a fourth arm: a
correlated `NOT EXISTS` against `nina_avatars` on
`source_key = 'chat-photo:' || nina_message_images.id`, `user_id` bound INSIDE the subquery (an
unscoped one would let another operator's album hide these photographs; the probe is index-backed
via `nina_avatars_user_source_key_unq`). The arm exists because adoption COPIES:
`setChatPhotoAsAvatarAction` (`lib/admin`) writes the only link there is onto the new album row,
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
("bytes copied, not shared" is the write side's own rule). The `'chat-photo:'` literal is spelled
at the reader and the writer with no shared constant (a `'use server'` module may export only
actions), held together by `tests/nina.photoRefs.test.ts` (the emitted `not exists` SQL, the
writer's side, and the Media/about absence asserted as an absence) and
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

**`openrouter.ts` is the constants' single home** — `OPENROUTER_CHAT_URL` and
`NINA_FALLBACK_TEXT_MODEL`, zero imports like the rest of the roster. The vision fallback is its
sole owner no longer: the text-chat client (`llmFallbackText.ts`) imports the same two constants,
and neither module redeclares — `imagerecipe.ts`' standing rule for
`OPENROUTER_IMAGE_URL`/`NINA_IMAGE_MODEL`, now package-wide. The `OPENROUTER_API_KEY` read stays
inside `lib/nina/` (`ninaEnv()`, inside the function and inside a try, so a missing key costs the
fallback and never an import-time crash of the working z.ai path);
`scripts/check-openrouter-boundary.mjs` (`ci:openrouter-guard`) enforces that boundary on source
files.

## Memory, promises, patterns, proactive

- **Deleting a session takes what it taught her.** `removeNinaSession` (`queries.ts`) purges the
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
- **Proactive** (`proactive.ts`): `evaluateAndEmitForUser` (cron) and `emitRunCommitted` (fired
  by `lib/review/actions.ts` on commit). `clinginess` moves `SILENCE_NO_CHAT_DAYS` (4),
  `SILENCE_NO_RUN_DAYS` (5), `SILENCE_COOLDOWN_DAYS` (3) — the only day-counts, and the reason
  the manja register must never be folded into it.

## Module map

| Area | Files |
|---|---|
| Server Actions | `actions.ts` (send/describe/poll/resend — the chat's mutation surface), `jobActions.ts`, `sessionActions.ts`, `albumActions.ts`, `searchActions.ts`, `messageActions.ts` (each a one-screen surface) |
| Turn pipeline | `turnrun.ts`*, `turnrevive.ts`*, `turn.ts`(T), `llmFallbackText.ts`* (the z.ai-first/OpenRouter-second client `productionDeps` wraps), `tools.ts`(T), `schema.ts`(T), `gateway.ts`, `load.ts`, `context.ts`, `dates.ts`(T), `chatturn.ts`(T), `turnflight.ts` |
| Prompts | `prompts/index.ts`, `prompts/system.ts`, `prompts/tools.ts`, `prompts/distill.ts`, `prompts/describe.ts` (two witness prompts behind a `Record` — a third subject is a compile error, and `subject` defaults to `'runner'` so existing callers are byte-identical), `prompts/caption.ts` |
| Character | `tuning.ts`, `persona.ts` |
| Memory/behaviour | `memory.ts`, `distill.ts`, `promise.ts`(T)/`promises.ts`, `nags.ts`, `patterns.ts`, `shortcuts.ts`(T), `title.ts`/`autotitle.ts` |
| Images | `imagerecipe.ts`, `imagegen.ts`, `imageprefs.ts`, `imagejobs.ts`, `imagecall.ts`, `imageDedupe.ts`, `perceptual.ts`/`perceptualSign.ts`, `imagerun.ts`, `imagefail.ts`, `caption.ts`, `imagetools.ts`/`avatartools.ts`, `selfiegen.ts`/`avatargen.ts`/`imagetest.ts`, `jobview.ts`(T) |
| Vision/intake | `vision.ts`(T), `imageTicket.ts`(T) (HMAC carrier, `node:crypto`), `images.ts`(T), `crop.ts`(T) |
| Provider constants | `openrouter.ts` (zero imports; the ONE home of `OPENROUTER_CHAT_URL` + `NINA_FALLBACK_TEXT_MODEL` — the vision fallback and the text-chat fallback client both read it) |
| Album/attachments | `album.ts`(T), `albumActions.ts`, `attach.ts`(T) |
| Chat UI logic | `chatview.ts`(T), `reply.ts`(T), `reveal.ts`(T), `scroll.ts`(T), `live.ts`(T), `edit.ts`(T), `chrome.ts`(T) |
| Persistence | `queries.ts` (every `nina_*` access; `tuningFromRow`/`tuningToColumns` are the one place the flat row and the nested model meet), `errorlogs.ts` (`nina_error_logs` write/read — the deliberate unscoped exception, server-side db-touching; its writers are `vision.ts`'s fallback orchestrator, category `multimodal`, `imagerun.ts`'s `recordImageCallFailure`, category `image_generation`, and `llmFallbackText.ts`'s `ninaFallbackTextClient`, category `text` — all three 2026-09-12) |

\* server-only, not Server Actions. (T) = colocated `*.test.ts` (28 of them, all over the pure
modules; integration lives in 51 `tests/nina.*.test.ts` files, both counted 2026-09-12).

## Dataflow

- **Send**: `Composer.tsx` (optional `describeNinaImage` pre-pass → signed `imageTicket`) →
  `sendNinaMessage` → persist + claim + `after()` → `runNinaBackgroundTurn` (context/tuning/
  shortcuts live) → `runNinaTurn` (shortcut match once, burst framing, every model call through
  `productionDeps`' fallback-wrapped client — z.ai, then OpenRouter once; tool rounds via
  `dispatchNinaTool`; `generate_image` opens a job and fires `fireNinaImageGeneration`) →
  validated send payload → bubbles → metrics → distillation. Client renders through
  `reveal.ts`/`chatview.ts`/`reply.ts` and polls `pollNinaReply`; refresh merges via
  `mergeServerMessages`.
- **Died turn**: sweep closes it `stale`; next render of `/nina` revives it (`turnrevive.ts`);
  his tap resends it (`resendNinaMessage`) — manual override outruns the cap.
- **Proactive**: cron per user → `resolveNinaPromises` → `evaluateAndEmitForUser` →
  `emitProactiveMessage` (trigger block from `system.ts`'s copy, push via `lib/push/send`).
- **Character path**: `readNinaTuning` → `coerceNinaTuning` → `buildNinaSystemPrompt(tuning)`.
  Live every turn; no cache; no invalidation step anywhere.

## Dependencies

**External:** `@anthropic-ai/sdk` (type-only; the client is `@/lib/llm/client`), `zod`, `drizzle-orm`,
`next/server`'s `after()`, `next/cache`'s `revalidatePath` (jobActions only), `server-only`
(25 modules as of this rewrite — `llmFallbackText.ts` is the newest), `node:crypto`.
**Internal:** `@/lib/db` + `@/lib/db/schema`
(heaviest), `@/lib/photos/contentHash` (the sha-256 hex format the whole dedupe set answers
from), `@/lib/date/ranges` (the Jakarta day model behind nags/patterns/promises/proactive),
`@/lib/format`, `@/lib/metrics/*`, `@/lib/llm/client`, `@/lib/env`, `@/lib/id`, `@/lib/auth`,
`@/lib/push/send`. One benign cycle: `proactive.ts` → `lib/push/send` → type-only back. One
dynamic import: `distill.ts` → `./gateway`.

## Reverse dependencies

101 files outside the package import from it (measured 2026-09-12): `app/`, `components/`,
`lib/{admin,photos,push,review}`, `scripts/` — plus the 51 `tests/nina.*` files. Widest:
`components/nina/ChatScreen.tsx` (ten submodules), `app/nina/page.tsx`,
`scripts/nina-image-worker.ts`, `lib/admin/*` (memory, album, chat photos, shortcuts, image-gen
test view). `persona.ts` and `tuning.ts` are the least-depended-upon modules — the point of the
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
errs toward keep — an orphan is recoverable, a dead reference is not). `vision.ts` has two named
error classes (`NinaVisionTokenFloorError` — text-aware, computed AFTER the prompt is chosen so
the longer self prompt raises it toward "I could not see it"; `NinaVisionTransportError`); when
the z.ai attempt and the OpenRouter fallback have BOTH failed, the describe orchestrator rethrows
the PRIMARY error — every caller's `instanceof` branching survives unchanged — and each failed
attempt has already written its best-effort `nina_error_logs` row (see Vision); a failed
image-generation call has already written its own (see Images); a failed TEXT call has written one
row per attempt (see The chat turn, whose wrapper rethrows the OPENROUTER cause instead —
`turn.ts`'s catch branches on nothing, so the asymmetry costs no caller its classification);
`imagefail.ts` classifies failures
and picks what she says — a failure is a message from Nina, never a stack trace.

## Gotchas

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
- **A new read of an image row carries `isNull(ninaTurns.deletedAt)` itself** — no shared helper,
  by design, and the test names every function that must have it. `countNinaTurnsSince` is the
  ONE reader that must never grow the predicate.
- **Never `DELETE` a `nina_turns` row**; never add a confirmation to a `/nina/jobs` control;
  never let a redo touch the failed row or copy `attempts`.
- **Never widen a blob-pathname range to cover the stored form**, and never write an invented
  fixture suffix — a 3-symbol one hid a shipped-broken feature behind a green suite.
- **The five `PERCEPTUAL_*` gates move in TWO files or not at all.**
- **Do not merge the three dedup decision modules**, and never grow `planNinaImageWrite` into
  `queries.ts` — the worker would lose its one shared decision.
- **A NULL `content_hash` on a reference row is expected**, not drift; fill it by hand and you
  have written a claim nobody made.
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
- **`openrouter.ts` is the ONE home of the OpenRouter chat constants.** Import
  `OPENROUTER_CHAT_URL`/`NINA_FALLBACK_TEXT_MODEL`, never redeclare them (the rule
  `imagerecipe.ts` already applies to the image constants), and read `OPENROUTER_API_KEY` through
  `ninaEnv()` inside `lib/nina/` only — `ci:openrouter-guard`
  (`scripts/check-openrouter-boundary.mjs`) enforces that boundary on source files.
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

28 colocated suites over the pure modules; 51 repo-level `tests/nina.*.test.ts` (counted
2026-09-12; phase 4 added `nina.imagelog.test.ts`, phase 2 `nina.llmFallbackText.test.ts`). The
guards that can actually catch a regression, by mechanism:

- **Source-reading tests** (read the file, strip nothing): `tests/nina.prompts.test.ts` fails if
  `persona.ts`/`prompts/system.ts`/`proactive.ts` name a raw tuning field;
  `lib/nina/shortcuts.test.ts` fails on any `import` line; `tests/nina.softDelete.test.ts`
  asserts `countNinaTurnsSince`'s predicate ABSENCE and that no statement `DELETE`s a turn;
  `tests/nina.imagerun.test.ts` asserts `vision` is absent from `imagerun`'s import graph (a spy
  on a module never imported can only pass); `tests/nina.chatPhoto.test.ts` counts
  `replaceState` writers in `ChatScreen`'s code.
- **The snapshot** (`tests/__snapshots__/nina.prompts.test.ts.snap`) is the byte-identity gate
  for the default character — regenerate it and invariant 2 is silently lost.
- **SQL-shape tests** (`tests/support/fakeDb`) split emitted statements into SET/WHERE halves:
  the soft-delete predicate per function, the supersede WHERE, the claim's state machine,
  `getNinaJobPhoto`'s two-table owner scope and `{ id }` projection.
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
- **Known-answer vectors** pin the perceptual gates in BOTH copies of the predicate
  (`tests/nina.perceptual.test.ts`, `tests/nina.dedupeMedia.test.ts`), so the two cannot drift.
- **Real-module integration**: `tests/nina.resend.test.ts` and `tests/nina.burstCancel.test.ts`
  mock only the edges and drain the deferred turn by hand — mocking the module under test would
  make every property untestable. `tests/nina.turnrevive.test.ts` asserts invariant 4 against
  the produced sources (`server-only`, no `'use server'`, no runner declared in `actions.ts`).
- Component tests live beside the components (`components/nina/**`); the pure logic they would
  otherwise need lives HERE so it can be tested without a DOM.
