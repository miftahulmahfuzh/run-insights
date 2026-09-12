# Plan: Nina LLM OpenRouter Fallback + Admin Error Logs

**Slug:** nina-llm-fallback-error-logs
**Date:** 2026-09-12T07:31:15+07:00
**Analysis:** `20260912-073115-KZHE_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-llm-fallback-error-logs`
**Branch:** `feature/nina-llm-fallback-error-logs` (base: `origin/main` @ `faace78`)
**Phases:** 5
**Status:** reconciled
**Coordinator:** —

---

## Why

> 1. kita sudah punya openrouter api key, buat fallback, jika LLM pake z.ai api key gagal, maka kita gunakan glm-5.3 flash pada openrouter untuk menggantikannya. pastikan glm-5.3 flash openrouter ini bisa support multimodal karena chat kita membutuhkan nina untuk memahami gambar
> 2. tolong buat satu tab baru di admin page: Error logs, bagi jadi 3: Text / Multimodal / Image generation — masing-masing log setiap failure call to LLM dengan timestamp, full input, full LLM error message, nama LLM (+ image link untuk Multimodal dan Image generation).
>
> Notes: timeout dimasukin ke full error message beserta nilainya (mis. 300s); image link membuka full-screen viewer yang sudah ada di /nina/about; full input dan full error message jadi tombol icon yang pop up; tabel compact — satu row benar-benar satu row bahkan di layar xs-max.

Direct follow-on from the same-session incident investigation: an 11-in-a-row z.ai text-chat failure streak (2026-09-11 22:29–00:12 UTC) with zero automatic recovery and zero persisted diagnostic detail beyond a generic `error_code='unavailable'`.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | OpenRouter (`z-ai/glm-5.3-flash`, multimodal) fallback when a z.ai-backed LLM call fails | 1, 2, 3 |
| R2 | New admin "Error logs" tab, 3 sub-tabs, with the specified columns/behaviors | 1, 4, 5 |

## Scope

**In scope:**
- A cross-provider (z.ai → OpenRouter) fallback for the text-chat model call (`lib/nina/turn.ts`) and the vision/photo-description call (`lib/nina/vision.ts`).
- A new `nina_error_logs` table capturing every individual failed LLM call attempt (z.ai or OpenRouter, whichever fails) across all three call kinds — text, multimodal, image generation.
- Wiring the already-computed-but-discarded failure detail (`detail`, timeout) from the existing image-generation path into the new log table (no fallback change there).
- A new `/admin/error-logs` page: 3 sub-tabs, compact one-row-per-entry list, icon-button popups for full input/full error text, `PhotoViewer` reuse for image links, pagination.

**Out of scope, and why:**
- A fallback for image generation itself — it is already OpenRouter; R1's rationale is specifically about z.ai reliability for understanding, not generation.
- Making the fallback model operator-configurable (an `app_settings` dropdown like `text_model`'s) — not requested; the fallback model is a fixed code constant, mirroring how the image path already hardcodes `NINA_IMAGE_MODEL`.
- Any change to `nina_turns`' schema or its pinned invariants (no message text, exactly one index) — the new log table is entirely separate.
- Retrying more than once against OpenRouter, or chaining further providers — R1 asks for one fallback, not an arbitrary retry chain.

## Invariants

- The tree builds (`tsc --noEmit`), typechecks, and passes `npm test`/`vitest` at the end of every phase.
- `nina_turns`' existing pinned shape and its "no message text" test invariant are untouched.
- `scripts/check-openrouter-boundary.mjs` (`ci:openrouter-guard`) continues to pass — all new `OPENROUTER_API_KEY` reads live under `lib/nina/`.
- No change to runner-facing (non-admin) UI or behavior beyond: a chat/vision call that previously died now sometimes succeeds via fallback. No new user-facing copy, no new runner-visible error state.
- Every new admin-log write is best-effort: a failure to write a `nina_error_logs` row must never affect the outer call's own success/failure/timeout, and must never throw past its own try/catch (matching the existing `try { await deps.store.record(...) } catch { console.warn(...) }` idiom already in this codebase).
- `/admin/error-logs` is admin-gated the same way every other `/admin/*` page is (`requireAdmin()` as the page's first statement).

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| One log table vs. three vs. extending `nina_turns` | One new table `nina_error_logs` with a `category` discriminator; `nina_turns` untouched | 6: surrounding convention (single-index-per-table philosophy; the pinned "no message text" test on `nina_turns`) |
| Where the fallback logic lives | Wrapping `NinaLlmClientLike` client (the existing `deps.client` injection seam), not inlined into `turn.ts`'s loop/repair control flow | 6: surrounding convention (`turn.ts` already isolates the model call behind this interface for exactly this kind of substitution) |
| Whether image-generation gets a fallback too | No — R1's own words scope the fallback to *understanding* ("chat kita membutuhkan nina untuk memahami gambar"), not generation; image generation is already OpenRouter | 5: user's raw input from Step 0 |
| Fallback model id source | Hardcoded constant in `lib/nina/`, not a new env var or `app_settings` row | 6: surrounding convention (`NINA_IMAGE_MODEL` in `lib/nina/imagerecipe.ts` is the existing precedent for a fixed OpenRouter model id) |
| Does the glm-4.6v token-floor guard apply to the OpenRouter vision fallback's response | No — floor is calibrated for `glm-4.6v` specifically (recalibrated 2026-09-09 after a real false-trip incident); the fallback response is accepted on a plain non-empty-description check | 6: surrounding convention + prior-incident memory on this exact guard |
| What the "image link" points at for Multimodal / Image generation rows | The *input* image in both cases (the undescribed photo; the reference/anchor photo used for generation, if any) — never a generated output, since a failed generation produces none | 3: the plan's own code blocks / existing `planJobPhoto` convention (`{kind:'none'}` when no proven image exists) |
| Literal `<table>` vs. flex `<li>`-row list for the compact admin view | Flex `<li>` row (`min-w-0 truncate` + `shrink-0`), following `NinaJobList.tsx` | 6: surrounding convention (only proven "one row at any width" pattern in this codebase) |
| Full-input/full-error popup component | New minimal read-only `<dialog>` component modeled on `DetailPanel`'s native-dialog mechanics, not `Sheet` (form contract) or `DetailPanel` itself (picture-band contract) | 6: surrounding convention |
| **`nina_error_logs.user_id`: NOT NULL or nullable?** (Phase 1 drafted NOT NULL; phases 2 and 3 both wrote against nullable) | **NULLABLE**, `userId?: string \| null` on the writer | 2: the phases' exit criteria. Phase 3's exit criteria require a double-failure to write two rows from a seam (`describeNinaImages`) that structurally has no user id, and Phase 2's require its client to be constructible without one. A NOT NULL column makes both writes failed inserts — which `logNinaError` swallows by design, so the loss is silent. NULL here reads as "not attributable to one runner", a true statement rather than missing data. |
| **Where do `OPENROUTER_CHAT_URL` / `NINA_FALLBACK_TEXT_MODEL` live?** (Phase 2 declared them in `lib/nina/llmFallbackText.ts`; Phase 3 declared them in a new `lib/nina/openrouter.ts`) | **`lib/nina/openrouter.ts`, created and owned by Phase 3**; Phase 2 imports both and declares neither, and gains `depends_on: [1, 3]` | 6: surrounding convention. One endpoint and one model id spelled twice is how they drift apart — the rule `lib/nina/imagerecipe.ts` already applies to `OPENROUTER_IMAGE_URL`/`NINA_IMAGE_MODEL`. Neither a text-chat client nor a vision module is the right home for the other's copy, so neither owns them. Phase 3 keeps the file because the canonical documented text already lives there; the edge is ordering only (pure constants, zero imports, one writer), so there is no merge hazard and no cycle. |
| **Admin page size: 50 (Phase 5) or 25 (Phase 1's reader ceiling)?** | **25** — `ADMIN_ERROR_LOG_PAGE_SIZE` mirrors `NINA_ERROR_LOG_PAGE_SIZE` | 3: the plans' code blocks. `listNinaErrorLogs` *clamps* `limit` to 25 rather than merely defaulting to it, so a page asking for 50 renders 25 rows while advancing its offset by 50 — every other row skipped, silently. Phase 1 owns the reader and its ceiling argument is the stronger one (this list ships the full input and full error text with every row). Phase 5 pins the relationship with a test rather than re-deriving the number. |

## Open Questions

*(none — every fork above was decidable from the user's own words, this codebase's existing
load-bearing conventions, or the phases' own exit criteria. Every requirement id is owned:
R1 by phases 1/2/3, R2 by phases 1/4/5. Nothing is parked.)*

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Error-log schema + writer/reader | R1, R2 | `lib/db`, `lib/nina` | 7 | — | NORMAL | `.workflows/plan/nina-llm-fallback-error-logs/phase-1.md` | P1-DB-A007 | — |
| 2 | OpenRouter fallback — text chat | R1 | `lib/nina` | 4 | 1, 3 | HARD | `.workflows/plan/nina-llm-fallback-error-logs/phase-2.md` | P1-NIN-A036 | — |
| 3 | OpenRouter fallback — vision/multimodal | R1 | `lib/nina` | 3 | 1 | NORMAL | `.workflows/plan/nina-llm-fallback-error-logs/phase-3.md` | P1-NIN-A037 | — |
| 4 | Image-generation error logging | R2 | `lib/nina` | 5 | 1 | NORMAL | `.workflows/plan/nina-llm-fallback-error-logs/phase-4.md` | P1-NIN-A038 | — |
| 5 | Admin Error Logs page | R2 | `app/admin`, `components/admin`, `lib/admin` | 9 | 1 | HARD | `.workflows/plan/nina-llm-fallback-error-logs/phase-5.md` | P1-ADM-A002 | — |

**Concurrency after reconciliation.** Phase 1 is the root. Once it lands, **3, 4 and 5 can run
concurrently**; **2 waits on 3** (it imports the shared `lib/nina/openrouter.ts` constants module
that Phase 3 creates — see Decisions). No cycle: 3 → 1, 2 → {1, 3}. No two phases write the same
file; `lib/nina/openrouter.ts` is the only file two phases name, and only one of them writes it.

### Phase 1 — Error-log schema + writer/reader
**Satisfies:** R1, R2 (shared infrastructure both later phases need; splitting it would leave one half unowned)
**Owns:** the new `nina_error_logs` Drizzle table, its migration, a `logNinaError(entry)` writer (best-effort, never throws) and the paginated per-category reader `listNinaErrorLogs(category, { limit, offset })`, plus `getNinaErrorLog(id)` and the schema-pinning test. **`user_id` is NULLABLE** and `NinaErrorLogWrite.userId` is `string | null | undefined`; the reader takes **no `userId`** (admin-only, cross-user read). `NINA_ERROR_LOG_PAGE_SIZE = 25` is the reader's default **and its ceiling**.
**Does not touch:** `nina_turns`, any call site that will use the writer (phases 2–4), `lib/nina/openrouter.ts` (Phase 3), any UI.
**Exit criteria:** `npm run db:generate && npm run db:migrate` produces and applies a clean `0021_*` migration and a re-run reports "No schema changes"; the schema pin asserts `user_id` is nullable in both the Drizzle config and the generated SQL; `logNinaError()` (including a call with no `userId` at all), `listNinaErrorLogs` and `getNinaErrorLog` are exported and unit-tested against `installFakeDb()`; `npm test` and `npm run typecheck` pass.

### Phase 2 — OpenRouter fallback — text chat
**Satisfies:** R1
**Depends on:** 1, **3** (imports `OPENROUTER_CHAT_URL` / `NINA_FALLBACK_TEXT_MODEL` from the `lib/nina/openrouter.ts` module Phase 3 creates)
**Owns:** a new OpenRouter-backed `NinaLlmClientLike` implementation in `lib/nina/llmFallbackText.ts` (Anthropic⇄OpenAI-Chat-Completions request/response translation, including forced single-tool `tool_choice` and tool-result round-trips), wired into `productionDeps(userId)` so both of `turn.ts`'s existing catch sites transparently retry via OpenRouter on a z.ai throw; writes a `nina_error_logs` row (`category:'text'`) for each failed attempt (z.ai and/or OpenRouter).
**Does not touch:** `turn.ts`'s loop/repair control flow itself, `nina_turns` writes, any admin UI, **`lib/nina/openrouter.ts`** (read-only here — Phase 3 owns and writes it; this phase must not redeclare either constant).
**Exit criteria:** existing `lib/nina/turn.ts`/`chatturn` tests still pass unmodified in behavior when the fallback is never exercised (z.ai succeeds); a new test simulates a z.ai throw and asserts the OpenRouter path is called and its result flows through `findSendBlock`/`findToolUses` unchanged; a double-failure test asserts both attempts are logged and the turn still ends `'unavailable'`.

### Phase 3 — OpenRouter fallback — vision/multimodal
**Satisfies:** R1
**Owns:** retry logic inside the vision/describe path: on a z.ai throw, `NinaVisionTokenFloorError`, or `NinaVisionTransportError`, retry once against OpenRouter (`z-ai/glm-5.3-flash`, same OpenAI-Chat-Completions shape, no translation layer needed) without applying the glm-4.6v-calibrated token floor to the fallback's response; logs a `nina_error_logs` row (`category:'multimodal'`, with `imageUrl`, `userId` NULL) for each failed attempt. **Also owns `lib/nina/openrouter.ts`** — the new zero-import constants module holding `OPENROUTER_CHAT_URL` and `NINA_FALLBACK_TEXT_MODEL`, shared with Phase 2, created here and written by no one else.
**Does not touch:** `lib/llm/vision.ts` (the unrelated `extractions`/screenshot feature), `describeNinaImagesWithFetch` (byte-identical), any admin UI.
**Exit criteria:** existing vision tests pass unmodified when z.ai succeeds; a new test simulates a z.ai token-floor trip and a transport failure, asserting the OpenRouter retry fires and its plain non-empty check (not the floor) gates acceptance; a double-failure test asserts both attempts are logged with the photo's Blob URL.

### Phase 4 — Image-generation error logging
**Satisfies:** R2
**Owns:** threading the currently-discarded `detail` (raw provider text) and the actual configured timeout through `failNinaImageJob`'s call chain into a `nina_error_logs` write (`category:'image_generation'`, `fullInput` = `args.prompt`, `imageUrl` = `args.referenceUrl` when present).
**Does not touch:** the retry/requeue/revival logic itself, `nina_turns`'s own `error_code` classification, any provider/model choice.
**Exit criteria:** a test that forces a terminal image-generation failure asserts a `nina_error_logs` row is written with the raw detail text and the correct timeout value for that host/anchoring combination; existing image-job tests unaffected.

### Phase 5 — Admin Error Logs page
**Satisfies:** R2
**Owns:** `app/admin/error-logs/page.tsx` (Server Component, `?tab=text|multimodal|image_generation`, `?page=`), `lib/admin/errorLogModel.ts` (the pure row/URL model, zero value imports), a compact flex-row list component, a read-only popup dialog for full input/full error text, `PhotoViewer` integration for image links, the new `AdminNavLinks` entry (6→7 cells) and the six pinned counts in `tests/admin.shell.test.ts` that move with it. Calls Phase 1's reader as `listNinaErrorLogs(category, { limit, offset })` — **no `userId` argument** — with `ADMIN_ERROR_LOG_PAGE_SIZE = 25`, mirroring Phase 1's ceiling.
**Does not touch:** any of the writer code from phases 2–4 (reads `nina_error_logs` directly via Phase 1's reader) — can be built and reviewed independently of whether 2/3/4 have landed, since Phase 1 alone is enough to exercise it end-to-end (seed rows via `logNinaError` in a dev one-liner if needed). Sole owner of `components/admin/AdminNavLinks.tsx` and `tests/admin.shell.test.ts` in this set.
**Exit criteria:** `/admin/error-logs` renders all three tabs with real (or seeded) data; a narrow-viewport (375px) visual/manual check confirms one entry = one row; full-input/full-error icon buttons open the popup with complete text and the error popup's first line is `Timeout: <n>s` when the row has one; image links open `PhotoViewer` full-screen and rows without an image draw no image control at all; pagination works past one page (`?page=2` reads "26–50 of N"); the bottom bar is one row of seven cells at 375/414/896px.

## Reconciliation Log

Round 1, 2026-09-12. The five phase planners ran concurrently and could not see each other's work.
Ten conflicts found, ten resolved **by editing the plan files in place** — nothing deferred to the
implementers.

| # | Conflict | Class | Resolution (edited files) |
|---|---|---|---|
| 1 | Phase 1 built `nina_error_logs.user_id` **NOT NULL**; Phase 2's `ninaFallbackTextClient` writes `userId: null` and Phase 3's describe seam has no user id at all | Contract drift / unmet assumption | **Phase 1** made the column nullable — Drizzle definition (`.notNull()` dropped), table docblock, expected generated SQL (`"user_id" text,`), `NinaErrorLogWrite.userId` → `userId?: string \| null`, the insert (`entry.userId ?? null`), the module header, and contract note 1. Schema pin moved `user_id` from the NOT-NULL list to the nullable list (now 7 / 3) and gained a case asserting the generated SQL does **not** say `"user_id" text NOT NULL`. Writer suite gained a case for a write with no user id at all. Phases 2 and 3 already assumed this and were left intact; their "if Phase 1 lands NOT NULL this phase is blocked" warnings were rewritten as **resolved**. |
| 2 | `OPENROUTER_CHAT_URL` + `NINA_FALLBACK_TEXT_MODEL` declared **twice** — Phase 2 in `lib/nina/llmFallbackText.ts`, Phase 3 in a new `lib/nina/openrouter.ts` | Duplicate work | **Phase 3 owns `lib/nina/openrouter.ts`** (its Files table now marks it a NEW SHARED FILE with a single writer). **Phase 2** deleted both declarations from its code block, added `import { NINA_FALLBACK_TEXT_MODEL, OPENROUTER_CHAT_URL } from './openrouter'`, moved the two names out of its **Creates** into a new *"Does NOT create — imports from Phase 3"* block, repointed its test import, added a read-only row to its Files table, and added a `grep` check to Verification that the two constants have exactly two definition sites. |
| 3 | Conflict 2 put two concurrently-runnable phases (2 and 3, both `depends_on: [1]`) on one file | File collision | **Phase 2 → `depends_on: [1, 3]`**, in its own header and in the index's phase table. Cycle checked: 3 → 1, 2 → {1, 3}; none. Only Phase 3 writes the file, so there is no merge hazard — the edge buys ordering alone. Concurrency after Phase 1 is now {3, 4, 5}, then 2. |
| 4 | Phase 5 assumed `listNinaErrorLogs(userId, category, {limit, offset})`; Phase 1's actual reader is `listNinaErrorLogs(category, opts?)` with **no `userId`** (admin-only cross-user read, by design) | Contract drift | **Phase 5** fixed at the single call site (argument dropped) and stopped destructuring `requireAdmin()` — an unused binding would be a lint error and would falsely read as a scoped list. Its Interface Contract's three "tolerated divergences" were replaced with Phase 1's verified signature; the Handoffs claim *"the reader already takes `userId` first"* was corrected. |
| 5 | Phase 5's `ADMIN_ERROR_LOG_PAGE_SIZE = 50` against Phase 1's `NINA_ERROR_LOG_PAGE_SIZE = 25`, which the reader **clamps** to | Contract drift (silent data loss) | **Phase 5** set to 25. Would have rendered 25 rows per page while advancing the offset by 50 — every other row skipped with no error. Constant's docblock now states the relationship, Step 7a's `toBe(50)` became `toBe(25)` plus a new test asserting `ADMIN_ERROR_LOG_PAGE_SIZE <= NINA_ERROR_LOG_PAGE_SIZE`, the manual check reads "26–50 of N", and **Phase 1** gained a handoff saying its ceiling moves first if the page size ever changes. |
| 6 | Phase 5's `ErrorLogSource` was a guess at the row shape | Contract drift | Checked field-by-field against Phase 1's `NinaErrorLog` (`$inferSelect`): `id`, `userId`, `category`, `provider`, `model`, `fullInput`, `errorMessage`, `timeoutMs`, `imageUrl`, `createdAt`. **All eight fields Phase 5 renders match exactly** — no rename needed. Kept structural (not imported) for the bundle-boundary reason, and the docblock's stale rationale ("Phase 1 has not published a type name") was replaced with the real one; `userId`/`category` are now documented as deliberately unread. |
| 7 | `logNinaError`'s call shape assumed independently by phases 2, 3 and 4 | Contract drift | Cross-checked all three against Phase 1's `NinaErrorLogWrite`. **Every field name, every optionality and all three category literals (`'text'`, `'multimodal'`, `'image_generation'`) already agreed byte for byte** — no call site needed editing. The three phases' quoted `Requires` blocks (which were guesses) were replaced with Phase 1's actual interface and marked *verified*, so a later reader cannot mistake a guess for a contract. |
| 8 | Phase 3's `NINA_DESCRIBE_FALLBACK_TIMEOUT_MS = 30_000` vs Phase 1's `timeout_ms` column | Consistency check | **No conflict.** All three writers store milliseconds (Phase 2: `turn.ts`'s per-call ceiling; Phase 3: 25 000 / 30 000; Phase 4: 150 000 / 235 000 minus the reference fetch, `null` when nothing was sent), the column is a nullable `integer`, and Phase 5's `formatErrorTimeout` divides by 1000. Recorded in Phase 4's Assumptions. |
| 9 | Phase 4's new `timeoutMs` on `NinaImageCallResult`'s failure variant | Consistency check | **No conflict.** The union is constructed in `lib/nina/imagecall.ts` and read in `lib/nina/imagerun.ts`, both owned solely by Phase 4; `scripts/nina-image-worker.ts` cannot import `imagecall.ts` at all. Assumption upgraded to *verified across all five plan files*. |
| 10 | Phase 5's `AdminNavLinks` 6→7 cells and the six pinned counts in `tests/admin.shell.test.ts` | File collision check | **No conflict.** Grep across all five plan files: `components/admin/AdminNavLinks.tsx` and `tests/admin.shell.test.ts` are named by Phase 5 only. Sole ownership stated explicitly in the index's Phase 5 section. |

**Full-set file-ownership sweep.** Every file in every phase's Files table has exactly one writer:
`lib/db/schema.ts` + `drizzle/**` + `lib/nina/errorlogs.ts` (1); `lib/nina/llmFallbackText.ts` +
`lib/nina/turn.ts` + `lib/nina/turnrun.ts` (2); `lib/nina/openrouter.ts` + `lib/nina/vision.ts` +
`lib/nina/vision.test.ts` (3); `lib/nina/imagecall.ts` + `lib/nina/imagerun.ts` +
`tests/nina.image*.test.ts` (4); `app/admin/error-logs/**` + `lib/admin/errorLogModel*` +
`components/admin/{ErrorLogList,LogTextDialog,AdminNavLinks}` + `tests/admin.shell.test.ts` (5).
`lib/nina/openrouter.ts` is the only file two phases name, and Phase 2 only reads it.

**Build-green check.** Each phase compiles on its own: Phase 1 is additive; Phases 2/3/4 add
imports of `lib/nina/errorlogs.ts`, which exists after Phase 1; Phase 2 additionally needs
`lib/nina/openrouter.ts`, which is why the edge was added; Phase 5 reads only Phase 1's exports and
renders an empty state when 2/3/4 have not landed.

## Rollback

- Phase 1: drop the new table via a down-migration (or a follow-up migration) if schema needs revision; no other phase's code depends on data existing in it, only on it existing.
- Phases 2/3: reverting `productionDeps()`'s `client` field (or the vision retry call) to the pre-fallback code is a single-file revert each; the wrapping-client design means no control-flow changes to unwind in `turn.ts`/`vision.ts` themselves. **Keep `lib/nina/openrouter.ts` in either direction** — it is two constants with no behaviour, Phase 3 creates it and Phase 2 imports it, so deleting it while the other phase is landed breaks a build for nothing.
- Phase 4: revert the `detail`/timeout plumbing in `failNinaImageJob`'s callers; `nina_turns` itself is untouched.
- Phase 5: the admin page is additive (new route, new nav entry) — revert by removing the route and the `AdminNavLinks` entry.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md
