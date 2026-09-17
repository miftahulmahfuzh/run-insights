# Plan: Nina adopts an existing photo as her profile picture, from chat

**Slug:** nina-avatar-existing-photo
**Date:** 2026-09-17
**Analysis:** `20260917-100827-K9F2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-avatar-existing-photo`
**Branch:** `feature/nina-avatar-existing-photo` (base: `origin/main` @ `e3a224c`)
**Phases:** 1
**Status:** complete
**Coordinator:** —

---

## Why

User's own words (verbatim, from the `/analyze` prompt):

> there is a bug i just found. maybe the root cause is LLM misunderstanding user intent in the chat.
> first of all, you need to pull the most recent chat session in prod. i said this (Case A):
> me:cantik banget na
> ganti profpic lu pake foto ini
> nina:cantik doang? pahanya tuh yang liat dong, jangan gw doang 😌
> nina: okeee sudah gw jadiin profpic, sekarang semua orang tau paha siapa yang lo save di hp lo
>
> but turns out, because of this, nina started a new image generation job, and use the result of it as the profile picture.
>
> don't get me wrong, this is cool. but this behavior should have been triggered if i said this instead (Case B):
> me: cantik banget na
> ganti profpic lu pake FOTO BARU YANG MIRIP INI
>
> see the difference?
>
> bottom line is, i want all these natural capabilities, so nina can really really feels like a person:
> 1. nina can change her profpic by herself. can be a reward for my run. can be manually instructed by me myself during chat.
> 2. nina can change her profpic using user selected photo (case A is an example, another example is when i just attached an image from Media, with message "ganti profpic lu pake ini")
> 3. this accidental capability here. i want it as well. nina can start a new image generation job and use the result as the new profpic (case B is an example)

Production evidence (pulled live from the Neon `neondb`) confirms the root cause precisely: the runner's message ("ganti profpic lu pake foto ini") produced `nina_turns.tool_calls = 'set_avatar,prose:no_tool'`, and `set_avatar` — the only avatar-changing tool that exists — always invents a brand-new `scene` and fires a generation job. There is no tool anywhere in the codebase for "make an already-existing photograph her avatar, unchanged." R1 (self/manual change) and R3 (explicit new-photo request) are both **already fully implemented** by existing code (`set_avatar`, `generateNinaAvatar`, the `promises.ts` reward sweep) — see the analysis document's Dataflow section. This plan's entire job is R2.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Nina changes her own profile picture — reward for a run, or manual chat instruction (new photo) | already implemented — no phase |
| R2 | Nina changes her profile picture using a specific **existing** photo the runner selects, with no new generation | 1 |
| R3 | Nina starts a **new** generation job and uses its result as the profile picture, on explicit request | already implemented — no phase |

## Scope

**In scope:**
- One new chat tool, `set_avatar_from_photo`, dispatched alongside `set_avatar`/`generate_image`.
- A handler that resolves "this photo" deterministically (no model-supplied id — the model never sees one): prefer a photo attached to the runner's *current* message; otherwise the most recent original photo shown earlier in the *same chat session*.
- Copying that photo's bytes into a fresh `nina_avatars` row (never sharing the object — same "bytes are copied, not shared" decision the admin path already made, for the same reasons), marking it current, and marking it announced in the same turn (since, unlike generation, there is no async delay and no risk of her describing a photo she hasn't seen).
- One new DB query (`lib/nina/queries/images.ts`) to find the most recent original photo in a session.
- Minimal, single-clause disambiguating edits to `SET_AVATAR_TOOL`'s and the new tool's `description` strings.
- **Resolver-level flattening for reference rows** (added by the phase planner, see Decisions): the phase brief's draft invariant 4 ("refuse a reference row") is kept verbatim at the adoption *core* (`adoptNinaChatPhotoAsAvatar` still refuses one outright), but `resolveAttachment` (`lib/nina/actions/send.ts`) writes a reference row for **every** Media/album attach — so a literal refusal at the tool level would defeat the user's own second R2 example ("attached an image from Media"). The resolver therefore flattens a reference to what it points at *before* calling the core: a re-shown chat photo resolves to its original id; a Media/album attach resolves straight to the existing `nina_avatars` row and is promoted with **zero** bytes copied. See `phase-1.md`'s "Flagged deviation" section for the full table.

**Out of scope, and why:**
- Anything under `lib/admin/` — the admin adoption path (`setChatPhotoAsAvatarAction`) is a separate, already-shipped, already-tested feature. It is read as a reference implementation only. Do not refactor it to share code with the new chat tool: `lib/nina/` may not import from `lib/admin/` (layering — admin depends on nina, never the reverse), so the two paths necessarily duplicate a small, closed, stable 3-case extension/content-type mapping (jpg/png/webp). This is a bounded, low-risk duplication of a pure lookup table, not the kind of business-rule duplication this codebase's own comments warn against.
- Any change to `NinaToolContext`, `turn.ts`, `turnrun.ts`, or `context.ts`. `sourceMessageId` is already sufficient; the handler resolves session and photo by querying, not by a new field threaded through the turn loop.
- R1 and R3 — no code changes; verified already correct by reading `lib/nina/promises.ts`, `lib/nina/avatartools.ts`'s existing `handleSetAvatar`, and `lib/nina/avatargen.ts`.
- Any change to `generate_image`'s description or dispatch — it is not part of the ambiguity (it never touches `nina_avatars`).

## Invariants

1. The tree builds (`npx tsc --noEmit`) and all tests pass at the end of the phase.
2. No behavior change to `set_avatar`, `generate_image`, or any `/admin/*` avatar action — this is purely additive.
3. The new tool never triggers an image-generation job, a vendor LLM call, or a GitHub Actions dispatch — it is a same-request Blob copy plus a DB write, nothing else.
4. A photo whose row carries `source_avatar_id`/`source_image_id` (a re-share reference, not an original) is never copied a second time — the adoption core refuses one outright (same rule as `setChatPhotoAsAvatarAction`), and the tool-level resolver flattens one to what it points at before the core is ever called (see Scope).
5. Re-adopting the same photo a second time is idempotent: no duplicate blob, no duplicate `nina_avatars` row (`source_key = 'chat-photo:<imageId>'`, exactly the admin path's convention).
6. The adopted row's `announced_at` is set (not left `NULL`) as part of the same operation that promotes it to current, so the proactive `avatar_changed` cron never announces a change she already spoke about in the same turn that made it.
7. `userId` scoping is preserved on every new query/write, per `lib/nina/queries/*`'s house rule (every function takes `userId` first, every WHERE clause includes it).
8. `lib/nina/` code never imports from `lib/admin/`.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Add `set_avatar_from_photo`: adopt an existing photo as Nina's avatar from chat | R2 | `lib/nina` | 8 (2 new, 6 modified) | — | NORMAL | `.workflows/plan/nina-avatar-existing-photo/phase-1.md` | `P1-NIN-A054` | — |

### Phase 1 — Add `set_avatar_from_photo`: adopt an existing photo as Nina's avatar from chat

**Satisfies:** R2
**Owns:**
- `lib/nina/queries/images.ts` — new query for the most recent original photo in a session.
- New file `lib/nina/avatarAdopt.ts` — the adoption core (resolve photo → refuse-if-reference → dedupe-by-source-key → copy bytes → set current → mark announced) plus the resolver that flattens a reference row before the core is called.
- `lib/nina/prompts/tools.ts` — new `SET_AVATAR_FROM_PHOTO_TOOL` schema; append to `NINA_TOOLS`; one-clause description edits on `SET_AVATAR_TOOL` and the new tool.
- `lib/nina/prompts/index.ts` — `NINA_PROMPT_VERSION` bump (10 → 11), per that file's own standing rule that a schema edit is a prompt edit. Forced by Step 3's edit, not discretionary.
- `lib/nina/avatartools.ts` — new `handleSetAvatarFromPhoto`; extend `NINA_FULL_TOOL_SET`.
- `tests/nina.prompts.test.ts` — the exact-tool-name list it pins grows from seven to eight. Forced by Step 3's edit, not discretionary.
- New test file `tests/nina.avatarFromPhoto.test.ts` for the adoption logic, the resolver, and tool dispatch.

**Does not touch:** `lib/admin/**`, `lib/nina/tools.ts`, `lib/nina/turn.ts`, `lib/nina/turnrun.ts`, `lib/nina/context.ts`, `lib/nina/imagetools.ts`, `lib/nina/avatargen.ts`, `lib/nina/promises.ts`, any DB migration (no schema change — `'operator'` already exists in `NinaAvatarSource`).

**Exit criteria:**
- Calling the new tool with a photo attached to the current runner message adopts *that* photo.
- Calling it with no attachment on the current message, but an earlier photo already shown in the same session, adopts *that* one.
- Calling it with a reference row (re-share) refuses cleanly (`isError: false`, a true "can't use that one" answer).
- Calling it with no eligible photo anywhere in the session refuses cleanly.
- Re-calling it for the same photo does not create a second `nina_avatars` row or a second Blob object.
- `npx tsc --noEmit` and the full `vitest` suite pass.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Share `copyChatPhotoIntoAlbum`'s bytes-copy logic between `lib/admin/` and the new chat tool, vs. duplicate a small pure mapping | Duplicate only the closed 3-case ext/content-type mapping in `lib/nina/`; do not import `lib/admin/` from `lib/nina/` and do not refactor the admin module | 6: surrounding convention — `lib/admin` depends on `lib/nina`, never the reverse, in every file read during analysis |
| How the model identifies "this photo" (an id argument vs. handler-side resolution) | No id argument — the handler resolves the photo itself (current-message attachment, else most recent session photo) | 5: the user's raw input, read against the codebase — `lib/nina/context.ts` never exposes a photo id to the model, so an id-shaped argument would only ever be guessed |
| `announced_at` timing: leave `NULL` for the cron to announce later (like `set_avatar`), or mark it announced immediately | Mark it announced immediately, in the same operation that sets it current | 3: the plan's own code blocks / invariant 6 — this adoption is synchronous, so (unlike generation) she can truthfully announce it in the same reply, and leaving it `NULL` would risk a duplicate cron announcement of a change she already described a moment earlier |
| Which `NinaAvatarSource` value to write for adopted rows | `'operator'` | 6: surrounding convention — the value already exists in the schema and has zero current writers; `'admin'` is reserved for the `/admin` UI path and `'generated'` for the model-authored path |
| Refuse every reference row at the tool (per the draft phase brief), vs. flatten a reference to its original/album row before the core runs | Flatten at a resolver step; the core still refuses a reference outright, unchanged | 4: the index's own Requirements table — a blanket tool-level refusal would make the runner's own named R2 example ("attached an image from Media") always fail, since `resolveAttachment` writes every Media/album attach as a reference row by construction |
| Bump `NINA_PROMPT_VERSION` and update `tests/nina.prompts.test.ts`'s pinned tool-name list, though neither file was named in the phase's original "Owns" list | Both edited, as forced follow-ons of adding a tool schema | 6: surrounding convention — `lib/nina/prompts/index.ts`'s own header states a schema edit is a prompt edit and must bump the constant in the same commit; the test pins the literal list and is red otherwise |

## Open Questions

None. Every fork above is reversible (a description tweak, a source-value choice, a resolution heuristic) — none destroys data, rewrites history, or is an unrepeatable migration.

## Rollback

Phase 1 is purely additive (new file, new query, new tool schema, new handler, new tests) plus two single-clause description edits on an existing constant. To back out: revert the phase's commit(s) wholesale — no migration to reverse, no data written by this phase that any other code path depends on (`nina_avatars` rows it creates are ordinary album rows, removable exactly like any other via the existing `/admin/nina` delete action if ever needed).

## Next

Execute phase 1:

    /implement -f NINA_AVATAR_EXISTING_PHOTO_PLAN.md --phase 1
