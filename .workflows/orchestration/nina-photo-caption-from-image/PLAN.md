# Plan: Nina's photo captions come from the photograph

**Slug:** `nina-photo-caption-from-image`
**Date:** 2026-09-07 09:16:05 +07
**Analysis:** `20260907-091605-CAPT_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-photo-caption-from-image`
**Branch:** `feature/nina-photo-caption-from-image` (base: `origin/main` @ `f839116`)
**Phases:** 4
**Status:** planned
**Coordinator:** `orch-nina-photo-caption-from-image`
**Parent card:** [#113](https://github.com/miftahulmahfuzh/run-insights/issues/113) — owns the pull request

---

## Why

The user's words, verbatim:

> nina have successfully send a new chat to user everytime i uploaded an image into Chat photos
> collection (this is correct) . but , nina is not really understanding the context of the image.
> this photo is nina in a swimsuit diving. but she said "ini gw abis lari tadi". can we make llm
> understand multi modal? this is ruining user experience

The sentence he saw is not a model output. `ini gw abis lari tadi` is element index 2 of a
five-string hard-coded array (`NINA_IMAGE_CAPTIONS`, `lib/nina/imagefail.ts:144`), chosen by an
FNV-1a hash of a nanoid. The multimodal call he is asking for **already exists, and already ran on
that photo** — `describeNinaImages` posted it to `glm-4.6v` in `after()` and wrote the answer to
`nina_message_images.description`, a column which on this path has no reader at all. The one text
the runner reads is the only text on the path that no model writes.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | A photo added to the Chat photos collection must arrive with a chat message that says something true about **that** photograph | 1, 2, 3 |
| R2 | "can we make llm understand multi modal?" — every path that posts a photo of hers captions it from what is in the picture, not only the admin one | 1, 2, 4 |

**R2 is an inference, and it is stated as one.** The user reported one instance and then asked a
broader question; the generated-selfie path (`finishSelfie`, `lib/nina/imagerun.ts:189`) draws from
the same five strings and is wrong in the same way. R1 ships without R2. R2 cannot be reached by
fixing only the admin path.

**Phases 1 and 2 serve both Rs and cannot be split by R.** Phase 1 is one caption engine; phase 2 is
one schema change. Splitting either per-R would mean two engines or two migrations for one fact.
Per Step 6's rule, the coupling is kept and named rather than pretended away.

## Scope

**In scope**
- The caption text on `nina_messages` rows written by `addChatPhotoAction` and by `finishSelfie`.
- A self-subject witness prompt for `glm-4.6v` (the shipped one describes *the runner*).
- A `glm-5.3` caption call in Nina's voice, `lib/nina/autotitle.ts`'s shape.
- A structural marker for "this bubble exists only to carry a photograph", because the current test
  for it is the caption string itself.
- Removing the one scene-asserting line from the canned pick pool.

**Out of scope, and why**
- **`gateway.ts`'s empty `imageDescriptions`.** `dbNinaSourceGateway.readConversation`
  (`lib/nina/gateway.ts:164`) hardcodes `imageDescriptions: []` for every window row, so a stored
  description never reaches a later turn. That is a real gap, it is documented in the analysis, and
  it is **not** this set's work: fixing it changes what Nina knows in every conversation, which is a
  behaviour change nobody asked for. This plan routes the reading of the photo into her *caption*,
  which is text she says, not context she is given.
- **`scripts/nina-image-worker.ts`'s caption.** The runner has no z.ai key and
  `lib/nina/imagefail.ts` may never import anything (its header states why: the worker imports it by
  relative path under `--experimental-strip-types`). The worker keeps the canned line, and phase 2
  touches it only to set the marker column. Stated as a limit, not left as a surprise.
- **`replaceChatPhotoAction`'s caption.** Replace keeps the message and its `created_at` on purpose
  — *"Replacing a photograph is not taking a new one"* — and it already nulls `description` so a
  fresh describe is earned in `after()`. Re-captioning a replaced photo is a coherent follow-up and
  is deliberately deferred; phase 3 leaves a one-line note at the call site saying so.
- **His uploads.** `kind = 'upload'` is the composer's path and already describes the image before
  the send (`describeNinaImage`, `lib/nina/actions.ts:1220`). Untouched.
- Any change to Nina's system prompt, tuning surface, or `NINA_PROMPT_VERSION`.

## Invariants

Every phase holds all of these. A phase that cannot is a phase whose plan is wrong.

1. **The tree is green at the end of every phase**: `npm run lint`, `npm run typecheck`,
   `npm run test` all pass. No phase leaves a red tree for the next.
2. **The token-floor guard in `lib/nina/vision.ts` is not moved, weakened, or bypassed.** It stays
   above every read of `choices`, and no new caller may read a response body that failed it. It is
   the only thing standing between a silently-dropped image and a sentence Nina says about a
   photograph she never received.
3. **No caption ever asserts a scene the app cannot prove.** Every degraded path — model failure,
   timeout, token floor, empty completion, missing description — falls back to a **scene-agnostic**
   line, never to an invented one and never to an empty bubble (`nina_messages.text` is NOT NULL and
   an empty bubble is not a message).
4. **No model call is awaited from a page render**, and no model call is added to
   `sendNinaMessage`'s critical path. `scripts/check-llm-payload-boundary.mjs` must pass, with an
   entry for every new entry point.
5. **A late caption writes `nina_messages.text` and nothing else.** Use `updateNinaMessage`
   (`lib/nina/queries.ts:1332`), which already refuses to touch `seq`, `sent_at`, `read_at` or
   `turn_id`. Rewriting a bubble is not re-sending it.
6. **Nina's system prompt renders byte for byte as it does today.**
   `tests/__snapshots__/nina.prompts.test.ts.snap` is not regenerated and `NINA_PROMPT_VERSION` is
   not bumped. The caption prompt is a new surface on `describe.ts`'s side of that line, and phase 1
   records the reason in the file itself.
7. **`lib/nina/imagefail.ts` imports nothing.** Not `server-only`, not `@/lib/env`, not a type. The
   worker resolves it by relative path and one import stops it booting.
8. **The migration is generated, never hand-numbered and never renamed.** See Rollback.
9. **The private description stays private.** Nothing runner-facing renders
   `nina_message_images.description`. The caption is her own sentence stored in
   `nina_messages.text`; it is not the description echoed into the UI, and it must not be a
   paraphrase long enough to read as one.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Her eyes for her own photo, and her voice for the caption | R1, R2 | `lib/nina` | 8 | — | NORMAL | `.workflows/plan/nina-photo-caption-from-image/phase-1.md` | `P1-NIN-A014` | [#114](https://github.com/miftahulmahfuzh/run-insights/issues/114) |
| 2 | The carrier marker: a photo bubble free text cannot hide | R1, R2 | `lib/db` + `lib/nina` + `lib/admin` + `scripts` | 8 | — | NORMAL | `.workflows/plan/nina-photo-caption-from-image/phase-2.md` | `P1-DB-A002` | [#115](https://github.com/miftahulmahfuzh/run-insights/issues/115) |
| 3 | The admin add path captions from the photograph | R1 | `lib/admin` | 3 | 1, 2 | NORMAL | `.workflows/plan/nina-photo-caption-from-image/phase-3.md` | `P1-ADM-A000` | [#116](https://github.com/miftahulmahfuzh/run-insights/issues/116) |
| 4 | Generated selfies caption from the scene she asked for | R2 | `lib/nina` | 3 | 1, 2 | NORMAL | `.workflows/plan/nina-photo-caption-from-image/phase-4.md` | `P1-NIN-A015` | [#117](https://github.com/miftahulmahfuzh/run-insights/issues/117) |

Waves: **{1, 2}** then **{3, 4}**. Phases 1 and 2 share no file; phases 3 and 4 share no file.

### Phase 1 — Her eyes for her own photo, and her voice for the caption
**Satisfies:** R1, R2
**Owns:**
- `lib/nina/imagefail.ts` — split the *pick pool* from the *historical set*: `ninaImageCaption` stops
  being able to return `'ini gw abis lari tadi'`; `NINA_IMAGE_CAPTIONS` keeps all five members
  because rows in the database carry them and phase 2's legacy clause must still recognise them.
- `lib/nina/prompts/describe.ts` — add `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`, a witness for a
  photograph **of Nina**. The shipped prompt notices *"The state of him. Drenched or dry…"* and says
  *"'Him' for whoever is clearly the runner"*; pointed at her own photo it describes the wrong
  person for the wrong reader.
- `lib/nina/vision.ts` — `describeNinaImages(refs, { subject })`, defaulting to `'runner'` so every
  existing caller is unchanged. The floor arithmetic already reads the text it actually sent, so a
  longer or shorter system prompt needs no constant touched.
- `lib/nina/prompts/caption.ts` *(new)* — the caption system prompt (composed from `persona.ts`'s
  tuning-shaped voice blocks), the forced tool schema, and the pure parser/sanitiser.
- `lib/nina/caption.ts` *(new)* — `captionNinaPhoto`, one `glm-5.3` call → parse → `null`.
- `scripts/check-llm-payload-boundary.mjs` — a ninth `GUARDED_CALLS` entry for `captionNinaPhoto`.
- `tests/nina.caption.test.ts` *(new)*, `tests/nina.imagefail.test.ts`, `lib/nina/vision.test.ts`.

**Does not touch:** any writer. Nothing calls `captionNinaPhoto` at the end of this phase, and that
is deliberate — the engine lands and is unit-tested before either wiring phase depends on it.
Not `lib/nina/prompts/system.ts`, not `prompts/index.ts`'s `NINA_PROMPT_VERSION`, not
`lib/admin/*`, not `lib/nina/imagerun.ts`, not `lib/nina/queries.ts`.

**Exit criteria:** `ninaImageCaption` cannot return a scene-asserting sentence for any seed (proved
over the whole pool, not sampled). `captionNinaPhoto` returns a short lower-case line for a stubbed
client, `null` for every failure shape (throw, `max_tokens`, no tool block, empty string, a line
that trips the `NEVER_SAY` check), and never throws. `describeNinaImages(refs, { subject: 'self' })`
sends the self prompt and the floor still trips on the measured drop signature. Guard passes; the
prompt snapshot is unchanged.

### Phase 2 — The carrier marker: a photo bubble free text cannot hide
**Satisfies:** R1, R2
**Owns:**
- A generated migration adding `nina_messages.photo_only boolean NOT NULL DEFAULT false`, plus a
  backfill of the existing rows that are carriers under today's rule.
- `lib/db/schema.ts` — the column, with the argument for it beside the `source` docstring that
  explains why it is not a sixth `NinaMessageSource`.
- `lib/nina/queries.ts` — `NinaMessageInsert.photoOnly`, `messageColumns`/`NinaMessageRow` carry it.
- `lib/admin/chatPhotos.ts` — `isNinaPhotoCarrierMessage` reads the marker, with the caption-array
  test kept as the **legacy** clause for pre-migration rows.
- `lib/admin/chatPhotoActions.ts` — `addChatPhotoAction` sets `photoOnly: true`. **Caption unchanged
  in this phase.**
- `lib/nina/imagerun.ts` — `finishSelfie` sets `photoOnly: true`. **Caption unchanged.**
- `scripts/nina-image-worker.ts` — the raw `INSERT` sets `photo_only = true`.
- `tests/admin.chatPhotos.test.ts`.

**Does not touch:** `lib/nina/imagefail.ts`, `lib/nina/caption.ts`, `lib/nina/vision.ts`,
`lib/nina/prompts/*`. No caption text changes in this phase at all — it is the schema half, and it
is shippable and behaviour-neutral on its own.

**Exit criteria:** `npm run db:generate` produced the migration (not hand-written);
`npm run db:check` passes. `isNinaPhotoCarrierMessage` returns `true` for a marked message with any
text whatsoever, `true` for an unmarked legacy message whose text is one of the five, and `false`
for a `role: 'runner'` message however marked. Remove still deletes the message when the last photo
goes, for a message carrying free text.

### Phase 3 — The admin add path captions from the photograph
**Satisfies:** R1
**Owns:** `lib/admin/chatPhotoActions.ts` (`scheduleChatPhotoDescribe` becomes
`scheduleChatPhotoCaption`: describe with `subject: 'self'` → `captionNinaPhoto` → `updateNinaMessage`,
all inside the one `after()`), plus its tests.
**Does not touch:** `replaceChatPhotoAction`'s caption (out of scope, with a note at the site),
`lib/nina/imagerun.ts`, `lib/nina/caption.ts`, `lib/nina/vision.ts`, `lib/nina/queries.ts`.
**Exit criteria:** an add writes a scene-agnostic placeholder synchronously and, in `after()`,
replaces it with a caption derived from that photograph's own description. Every failure — describe
throws, floor trips, caption returns `null` — leaves the placeholder in place, logs once, and
returns `{ ok: true }`. The description is still written to the row. No `await` was added to the
action's response path.

### Phase 4 — Generated selfies caption from the scene she asked for
**Satisfies:** R2
**Owns:** `lib/nina/imagerun.ts` (`finishSelfie` captions from `args.scene` — no vision call: *"we
wrote the picture, so paying a vision call to be told back our own prompt would be absurd"*), plus
its tests.
**Does not touch:** `lib/admin/*`, `scripts/nina-image-worker.ts` (which keeps the canned line and
cannot do otherwise), `lib/nina/caption.ts`.
**Exit criteria:** a completed selfie job's bubble reads as a line about the scene she requested; a
caption failure leaves the deterministic canned line, so the job still completes and the photograph
still lands. `finishSelfie` still throws only for `insertNinaMessages` returning `[]`, never for a
caption problem.

## Reconciliation Log

All four phase plans were written in one session rather than by parallel planners, so the conflicts
below were resolved as they were written instead of by a reconciliation pass afterwards. The table
is the record of each one and where the resolution lives, not a log of edits made to finished plans.


| Conflict | Phases | Resolution |
|---|---|---|
| `ninaImageCaption`'s pool shrinks in P1 while P2 and P4 both call it | 1, 2, 4 | P1 keeps the function's signature and its determinism; only the array it draws from changes. P2 quotes the call site verbatim and does not touch it. P4 replaces the call with a caption-or-fallback, where the fallback **is** `ninaImageCaption(jobId)` — so P1's narrowed pool is what P4 degrades to. |
| `NINA_IMAGE_CAPTIONS` is P1's constant and P2's predicate input | 1, 2 | P1 does not remove a member, so P2's legacy clause compiles and passes against either ordering of the two phases. This is why the pool and the set are two names for two jobs rather than one array edited twice. |
| `lib/admin/chatPhotoActions.ts` is edited by P2 (marker) and P3 (caption) | 2, 3 | P3 `depends_on: [1, 2]` and quotes the file **as P2 leaves it** — the `insertNinaMessages` call already carrying `photoOnly: true`. P3's diff is confined to `scheduleChatPhotoDescribe` and its import block. |
| `lib/nina/imagerun.ts` is edited by P2 (marker) and P4 (caption) | 2, 4 | Same rule: P4 quotes `finishSelfie` as P2 leaves it. P2's hunk is one added field in the insert; P4's is the `body:` expression and an added import. Disjoint lines, sequenced by `depends_on`. |
| `tests/admin.chatPhotos.test.ts` is P2's and P3's | 2, 3 | P2 owns the carrier-predicate cases; P3 appends the caption cases to the same file after P2 has landed. No test is rewritten by both. |
| Two `after()` bodies would both describe the same image | 3 | There is only one `after()` on the add path and P3 extends it rather than adding a second. The `description != null` early return stays, so a re-run captions from the stored description without paying a second vision call. |

## Decisions

Every fork this plan met, the choice, and the rung that decided it. Precedence ladder: 1 stated
invariant → 2 phase exit criteria → 3 the plan's code blocks → 4 the index's Why and Requirements →
5 the user's raw input → 6 surrounding convention.

| Fork | Chosen | Rung |
|---|---|---|
| How to mark a photo-carrier bubble once its text is free: a new column, a sixth `NinaMessageSource`, or a heuristic | **A new `nina_messages.photo_only` boolean.** `NinaMessageSource`'s docstring calls a column domain *"the hardest thing in the schema to widen later"* and rejects `'operator'` for having no writer; `finishSelfie`'s own ruling is *"`source = 'chat'` on purpose and NOT a sixth `NinaMessageSource`"*. Widening it needs no migration (plain `text`, one comparison in the repo) and that cheapness is exactly what makes it the tempting wrong answer — it would overwrite a recorded ruling for both writers to save a DDL statement. A heuristic ("nina + all images generated + short text") re-introduces the false positive the caption clause was written to prevent. | 6: surrounding convention, against two recorded rulings |
| Caption awaited in the action, or written in `after()` | **`after()`.** Next dispatches Server Actions one at a time per client, so an awaited describe + caption is ~15-25 s added to **every** add, in series across a multi-photo session. `scheduleChatPhotoDescribe` already refuses that trade for the describe call alone and records the arithmetic. | 6: surrounding convention (the same file's stated reasoning) |
| What the bubble says in the ~20 s before the caption lands | **A scene-agnostic canned line**, and the scene-asserting member leaves the pick pool in phase 1 — before any model call exists. The reported sentence therefore becomes impossible at the end of the *first* phase, and stays impossible on every failure path. | 5: the user's raw input — *"this is ruining user experience"* is about the sentence, not about the pipeline |
| One vision call that also writes the caption, or two calls (`glm-4.6v` describes, `glm-5.3` speaks) | **Two.** `describe.ts`'s header is explicit: *"THIS IS A WITNESS, NOT A FRIEND… Nina's persona lives in `lib/nina/persona.ts` and none of it belongs here: a description that has already had the reaction leaves her nothing to say."* Folding them puts her Jakarta register, her tuning bands and her `NEVER_SAY` list into a vision prompt that has never been probed for any of it. Two calls also keep the token floor meaningful: it guards a request whose only job is to look. | 6: surrounding convention, stated at the prompt |
| Whether the GitHub-runner worker also captions | **No — it keeps the canned line.** The runner has no z.ai key and `lib/nina/imagefail.ts` may never import anything. An apology or caption that fails to be produced is the exact bug `imagefail.ts` exists to kill. Written down as a limit in Scope rather than discovered at 3am. | 6: surrounding convention + a measured environment constraint |
| Whether to remove `'ini gw abis lari tadi'` from `NINA_IMAGE_CAPTIONS` outright | **No — it leaves the pick pool and stays in the historical set.** Rows already in the database carry that text, and phase 2's legacy clause is what still recognises them as carriers. Deleting the member would make every existing admin-added bubble un-removable without an empty-bubble bug. | 6: surrounding convention (the predicate's own docstring) |
| Whether to fix `gateway.ts`'s empty `imageDescriptions` while it is in view | **No.** It changes what Nina knows in *every* conversation — a behaviour change nobody asked for, in a file no phase here owns. Recorded in the analysis and in Scope so the next reader finds it deliberately, not by accident. | 4: the index's Requirements — neither R names it |

## Open Questions

None. Every fork above was decided on a rung and written into the phase plans; nothing here is a
choice where every branch is irreversible.

## Rollback

**Per phase.**
- **P1** — revert the commit. Nothing calls the new modules, so the only visible change is that
  `ninaImageCaption` stops returning one of five sentences. Safe to revert at any time.
- **P2** — revert the code commit; the column is `NOT NULL DEFAULT false` and additive, so a
  reverted tree ignores it and the predicate falls back to its legacy clause. Dropping the column is
  a second, optional migration and is not required for a rollback.
- **P3** — revert the commit. The add path returns to a canned (now scene-agnostic) caption plus the
  existing describe-only `after()`.
- **P4** — revert the commit. `finishSelfie` returns to `ninaImageCaption(jobId)`, which is what the
  worker backstop does anyway, so the two hosts agree again.

**As a whole:** `git revert --no-commit` the range, or delete the branch before merging. No data is
destroyed by any phase: the migration only adds a defaulted column, and every caption write goes
through `updateNinaMessage`, which changes `text` and nothing else.

**THE MIGRATION IS THE ONE THING TO GET RIGHT AT MERGE TIME.** A second orchestrated set,
`nina-job-redo-and-soft-delete`, is in flight on this repo from the same base `f839116`, and its
phase 2 adds `nina_turns.deleted_at`. **Both sets will mint `0008`.** The repair belongs to whoever
merges **second**, and it is not a rename:

1. Diff `drizzle/meta/_journal.json` against `main` before merging. A shared `idx` is the signal.
2. Keep `main`'s `_journal.json` and `0008_snapshot.json`. **Delete this branch's `0008_*.sql`** and
   run `npm run db:generate -- --name nina_message_photo_only` against the **merged** `schema.ts`.
   It re-emits the same DDL as `0009` with a fresh `when`.
3. Never rename `0008_x.sql` to `0009_x.sql` and hand-edit `idx`. `when` is the ordering key: a
   renamed entry keeps its old timestamp, falls below the applied watermark, and is **skipped with
   no error at all** — `db:migrate` exits 0 and the column is never created.
4. Verify against the database, not the exit code: check `drizzle.__drizzle_migrations` and that
   `nina_messages.photo_only` actually exists.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md
