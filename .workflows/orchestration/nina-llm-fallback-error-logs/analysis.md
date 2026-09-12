# Code Analysis: Nina LLM OpenRouter Fallback + Admin Error Logs

**Type:** Feature Implementation
**Date:** 2026-09-12T07:31:15+07:00
**Session ID:** 20260912-073115-KZHE
**Plan:** `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md` (5 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-llm-fallback-error-logs`, branch `feature/nina-llm-fallback-error-logs` (base `origin/main` @ `faace78`)

---

## User Input

### Original User Request

> 1. kita sudah punya openrouter api key, buat fallback, jika LLM pake z.ai api key gagal , maka kita gunakan glm-5.3 flash pada openrouter untuk menggantikannya. pastikan glm-5.3 flash openrouter ini bisa support multimodal karena chat kita membutuhkan nina untuk memahami gambar
> 2. tolong buat satu tab baru di admin page: Error logs
> bagi jadi 3 :
> Text # log setiap failure call to LLM . timestamp , full input , full llm error message , nama LLM
> Multimodal # log setiap failure call to LLM yang ada image attachment nya . timestamp , full input, full llm error message , nama LLM, image link
> Image generation # log setiap failure call to LLM untuk menggenerate gambar . timestamp, full input, full llm error message, nama LLM , image anchor link
>
> note:
> - timeout juga dimasukin ke full llm error message, di kolom itu juga perlu ditambahkan nilai timeoutnya (misal 300s)
> - image link atau image anchor link, ketika di klik akan show the image in full screen. kita udah punya fitur ini pas klik satu image di /nina/about
> - biar tabel logs nya rapi, kayanya full input di rownya perlu dibikin jadi tombol icon aja. kik tombol ini baru pop up nunjukin full input text nya
> - biar tabel logs nya rapi, kayanya full llm error message di rownya perlu dibikin jadi tombol icon aja. kik tombol ini baru pop up nunjukin full llm error message nya
> - biar tabelnya keliatan compact, buat sedemikian rupa supaya satu row ditabel benar2 cuma makan satu row di xsmax screen

### User-Provided Context

This request follows directly from a same-session incident investigation (2026-09-12): production `nina_turns` showed an 11-in-a-row streak of `status='failed', error_code='unavailable'` for the text-chat model (`glm-5.3-flash` via z.ai), from 2026-09-11 22:29:41 UTC to 00:12:08 UTC, with zero automatic recovery — resend performed the identical failing call with no retry or fallback. A live probe of the same endpoint at 00:17 UTC succeeded, consistent with a transient z.ai-side condition (the personal "coding-plan" subscription backing both the text and vision endpoints) rather than a code bug. That investigation is the direct motivation for R1 and R2 below.

### User-Provided Files

None (`@`-referenced).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Add a fallback: when the LLM call using the z.ai API key fails, retry against `glm-5.3-flash` on OpenRouter instead. That OpenRouter model must support multimodal input, because the chat needs Nina to understand images. |
| R2 | Add a new "Error logs" tab on the admin page, split into 3 sub-tabs — Text, Multimodal, Image generation — each logging every failed LLM call with: timestamp, full input, full LLM error message (including the configured timeout value, e.g. "300s"), model name, and (Multimodal/Image generation only) an image link that opens the existing full-screen photo viewer. Full input and full error message render as icon buttons that open a popup with the full text. The table must be compact enough that one log entry occupies exactly one visual row even at the narrowest ("xs-max") screen width. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement:** This app's AI companion "Nina" makes three distinct kinds of LLM calls, all through z.ai except image generation (already OpenRouter): (a) text-chat replies (`glm-5.3`/`glm-5.3-flash`, Anthropic-Messages-shaped, `lib/nina/turn.ts`), (b) photo-understanding/vision descriptions (`glm-4.6v`, OpenAI-Chat-Completions-shaped, `lib/nina/vision.ts`), and (c) selfie/photo generation (`qwen/qwen-image-3[-pro]`, already OpenRouter, `lib/nina/imagecall.ts`). All three currently have **zero retry across providers** and **no persisted record of the raw failure** — every failure is a `console.warn`/`console.error` line in ephemeral Vercel/GitHub Actions logs, and the app-facing effect is silence (chat) or a canned apology (image generation) or a permanently-`NULL` description (vision).

R1 asks for cross-provider resilience on the two z.ai-backed calls (text, vision) by falling back to OpenRouter's `z-ai/glm-5.3-flash` — confirmed via OpenRouter's own model page (`openrouter.ai/z-ai/glm-5.3-flash`) to be natively multimodal (accepts text, image, and video, unlike the text-only `glm-5.2`/`glm-5.3`), so one fallback model can stand in for both the text model and (for vision) at least an alternative image-understanding path. R2 asks for visibility into every failure across all three call kinds (whether or not a fallback rescues it), surfaced as a new admin page.

**Success Criteria:**
- A z.ai failure on a text-chat turn is retried once against OpenRouter's `z-ai/glm-5.3-flash` before the turn is given up as `'unavailable'`; a z.ai failure on a vision/description call is retried once the same way before the photo is given up as undescribed.
- Every individual failed attempt (z.ai OR the OpenRouter fallback, whichever fails) is persisted with enough detail for an admin to diagnose it after the fact, across all three call kinds.
- `/admin` has a new "Error logs" entry; the page has three sub-views (Text / Multimodal / Image generation), each a compact list of failure rows; each row's full input and full error text are behind an icon-button popup; Multimodal and Image-generation rows carry a clickable image link reusing the existing `PhotoViewer` full-screen viewer; the list is legibly one-row-per-entry down to the narrowest supported viewport.

**Key Considerations / Decisions made during analysis** (see also `## Decisions` in the plan index):

1. **Fallback scope is text + vision only, not image generation.** Image generation is already OpenRouter (`qwen/qwen-image-3`); R1's rationale ("kita sudah punya openrouter api key... chat kita membutuhkan nina untuk memahami gambar") is specifically about z.ai reliability for *understanding*, not generation. R2's third tab logs image-generation failures as they already occur — no fallback change there.
2. **One shared log table, not three, and not an extension of `nina_turns`.** `nina_turns` is schema-pinned by `tests/db.schema.nina.test.ts` to carry no message text and exactly one index; extending it to hold full prompts/raw errors would fight that invariant. A new table `nina_error_logs` with a `category` column (`'text' | 'multimodal' | 'image_generation'`) serves all three tabs with one schema, one writer convention, one reader.
3. **The OpenRouter fallback lives at the client-injection seam, not inside `turn.ts`'s control flow.** `NinaTurnDeps.client: NinaLlmClientLike` (`{ messages: { create(body, opts) } }`) is already the seam `productionDeps()` constructs. A wrapping client — try z.ai, log+retry OpenRouter on throw, log+rethrow on second failure — covers both of `turn.ts`'s existing catch sites (primary/continuation loop, and the repair call) with zero changes to the loop/repair logic itself.
4. **Text-path fallback needs a real translation layer.** OpenRouter's chat API is OpenAI-Chat-Completions-shaped; `turn.ts` is built entirely around `@anthropic-ai/sdk`'s `Anthropic.Message`/`MessageCreateParamsNonStreaming` shapes (system/messages/tools/tool_choice in, content-blocks/stop_reason/usage out), including forced single-tool `tool_choice` (`forceSend`) and multi-round tool dispatch. The OpenRouter client must translate request and response both ways so the rest of `turn.ts` (`findSendBlock`, `findToolUses`, `usageOf`, `stop_reason` checks) needs no changes.
5. **Vision-path fallback needs no translation** — both z.ai's vision endpoint and OpenRouter's chat endpoint speak OpenAI Chat Completions already; the fallback swaps base URL/key/model and reshapes the request only trivially (image as `image_url` part either way).
6. **The z.ai vision token-floor guard (`NinaVisionTokenFloorError`, calibrated for `glm-4.6v`'s behavior) must not gate the OpenRouter fallback's response.** Applying a floor tuned for one model's token-per-image behavior to a different model risks a fresh false-trip (see prior incident memory on this exact guard). The fallback response is accepted on a plain non-empty-description check instead.
7. **"Full input" is the full request payload actually sent to the model** (system + messages/content, JSON-stringified), not just the runner's typed text — for text, that means capturing what `ninaBody()` builds; for vision, the fixed subject-prompt + instruction text; for image generation, `args.prompt` (already assembled and stored today, per `NinaImageJobArgs`).
8. **The two image-link columns point at input images, not outputs.** Multimodal's link is the photo Nina failed to describe (it exists, in Blob storage). Image-generation's link is the reference/anchor photo used as input (`args.referenceUrl`), when one was supplied — a failed generation genuinely produces no output image (confirmed: `nina_message_images` gets no row on failure, and the existing `/nina/jobs` detail page already renders no photo affordance for a failed job). When there is no reference photo, the row has no image link, matching the existing "never a link the server hasn't proved" convention in `lib/nina/jobview.ts`.
9. **The compact "one row per entry, even at xs-max" list is built as a flex `<li>` row (`min-w-0 truncate` + `shrink-0` companions), not a literal `<table>`.** This codebase's only proven "true one-row-at-any-width" pattern is `components/nina/NinaJobList.tsx`; its one real `<table>` (`SplitsTable`) is desktop-oriented and not built for this constraint.
10. **Full-input/full-error popups are a new, small, read-only `<dialog>` component modeled on `DetailPanel`'s native-`<dialog>` mechanics** (focus trap, `showModal()`/`close()`, Escape, backdrop click), not `Sheet` (whose contract assumes a form with a footer action) and not `DetailPanel` itself (whose contract assumes a picture band).
11. **New OpenRouter-reading code must live under `lib/nina/`.** `scripts/check-openrouter-boundary.mjs` (run in CI) fails any `OPENROUTER_API_KEY` reference outside `lib/nina/`/`lib/env.ts`.

---

## Analysis Scope

### Explicitly Mentioned Files

None — target and scope inferred from the prose per the process above.

### Discovered Related Files

**Text-chat path:** `lib/nina/turn.ts`, `lib/llm/client.ts`, `lib/llm/textModel.ts`, `lib/llm/catalog.ts`, `lib/nina/turnrun.ts`, `lib/nina/chatturn.ts`, `lib/nina/gateway.ts`, `lib/nina/queries.ts` (`insertNinaTurn`), `lib/env.ts`.

**Vision/multimodal path:** `lib/nina/vision.ts`, `lib/nina/prompts/describe.ts`, `lib/nina/actions.ts` (`describeNinaImage`), `lib/admin/chatPhotoActions.ts`, `lib/admin/ninaAlbumActions.ts`.

**Image-generation path:** `lib/nina/imagecall.ts`, `lib/nina/imagerecipe.ts`, `lib/nina/imagejobs.ts`, `lib/nina/imagerun.ts`, `lib/nina/imagefail.ts`, `lib/nina/jobview.ts`.

**DB/schema:** `lib/db/schema.ts`, `lib/id.ts`, `drizzle.config.ts`, `drizzle/meta/_journal.json`, `tests/db.schema.test.ts`, `tests/db.schema.nina.test.ts`.

**Admin UI:** `app/admin/layout.tsx`, `components/admin/AdminNav.tsx`, `components/admin/AdminNavLinks.tsx`, `components/admin/touch.ts`, `app/admin/nina/page.tsx`, `components/admin/explorer/PhotoGrid.tsx`, `components/admin/FileExplorer.tsx`, `components/nina/NinaJobList.tsx`, `app/nina/jobs/page.tsx`, `lib/nina/jobview.ts`, `components/ui/PhotoViewer.tsx`, `components/ui/DetailPanel.tsx`, `components/ui/Sheet.tsx`, `components/ui/SplitsTable.tsx`, `components/ui/index.ts`.

**OpenRouter boundary:** `scripts/check-openrouter-boundary.mjs`.

---

## Current Dataflow

### Text-chat call (today, no fallback)

**Entry point:** `runNinaBackgroundTurn` (`lib/nina/turnrun.ts:129`), invoked via `after()` from both `sendNinaMessage` and `resendNinaMessage` (`lib/nina/actions.ts`).

`turnrun.ts:278-298` calls `runNinaTurn(input, { ...(await productionDeps()), toolSet: NINA_FULL_TOOL_SET, store: ninaChatTurnStore(turnId) })`.

`productionDeps()` (`lib/nina/turn.ts:1107-1115`):
```ts
export async function productionDeps(): Promise<NinaTurnDeps> {
  return {
    client: ninaClient(),          // = narrativeClient(), lib/llm/client.ts:34
    model: await ninaModel(),      // = narrativeModel(), reads app_settings.text_model live
    toolSet: NINA_CORE_TOOL_SET,
    gateway: dbNinaToolGateway,
    store: dbNinaTurnStore,
  }
}
```
`narrativeClient()` (`lib/llm/client.ts:34-48`): a lazy-singleton `new Anthropic({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL, maxRetries: 0 })` — `env.LLM_BASE_URL = 'https://api.z.ai/api/anthropic'`.

Inside `runNinaTurnWith` (`lib/nina/turn.ts`), two call sites hit `deps.client.messages.create`:

**Primary/continuation** (`turn.ts:904-917`):
```ts
const ceiling = call === 0 ? NINA_TURN_BUDGET.primary : NINA_TURN_BUDGET.continue   // 22_000 / 20_000 ms
let message: Anthropic.Message
try {
  message = await deps.client.messages.create(
    ninaBody(deps.model, system, messages, deps.toolSet, forceSend),
    { timeout: Math.min(ceiling, Math.max(remaining(), 1)) },
  )
} catch (cause) {
  logNinaFailure(call === 0 ? 'primary' : 'continue', cause)
  return finish(null, 'unavailable')
}
```

**Repair** (`turn.ts:1072-1081`, budget `NINA_TURN_BUDGET.repair = 16_000` ms, clamped to `remaining()`):
```ts
let second: Anthropic.Message
try {
  second = await deps.client.messages.create(
    ninaBody(deps.model, system, repairMessages, deps.toolSet, true),
    { timeout: Math.max(input.timeoutMs, 1) },
  )
} catch (cause) {
  logNinaFailure('repair', cause)
  return null
}
```

`NINA_TURN_BUDGET` (`turn.ts:75-83`): `{ primary: 22_000, continue: 20_000, repair: 16_000, overall: 45_000 }`. (The route segment's `maxDuration = 300`, `app/nina/page.tsx:148`, and `NINA_BACKGROUND_BUDGET_MS = 240_000`, `lib/nina/turnflight.ts:89`, are outer platform/background ceilings — not the per-`messages.create` timeout.)

`logNinaFailure` (`turn.ts:782-784`) discards everything but a string: `console.warn(\`[nina] ${stage} call failed\`, { error: String(cause) })`.

**Exit points:** `finish(payload, source)` where `source ∈ {'llm', 'llm_repair', 'unavailable'}`. `runNinaTurn` (`turn.ts:1141-1167`) always calls `deps.store.record(...)`, which for production chat turns is `ninaChatTurnStore(turnId)` (`lib/nina/chatturn.ts:264-306`), eventually closed by `closeNinaChatTurn` (`chatturn.ts:357-378`):
```ts
const status = failure != null ? 'failed' : STATUS_BY_SOURCE[source]
const errorCode = failure != null ? failure : source === 'unavailable' ? 'unavailable' : null
await db.update(ninaTurns).set({ status, errorCode })
  .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, turnId), eq(ninaTurns.kind, 'chat'), eq(ninaTurns.status, 'pending')))
```
`STATUS_BY_SOURCE` (`lib/nina/gateway.ts:456-460`): `{ llm: 'ok', llm_repair: 'repaired', unavailable: 'failed' }`.

**`NinaTurnDeps`/`NinaLlmClientLike`** — the injection seam (`turn.ts:172-179, 389-397`):
```ts
export interface NinaLlmClientLike {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming, options?: { timeout?: number }): Promise<Anthropic.Message>
  }
}
export interface NinaTurnDeps {
  client: NinaLlmClientLike
  model: string
  toolSet: NinaToolSet
  gateway: NinaToolGateway
  store: NinaTurnStore | null
  now?: () => number
}
```

**What "full input" means here:** `NinaTurnInput` (`turn.ts:255-387`) is the structured boundary (session, runnerText, history, tuning, image descriptions, quoted message, etc) — but the actual bytes sent to the model are assembled by `userTurnText(input, hits)` (`turn.ts:572-664`, JSON-serialized `NinaContext` + image-description/quote/run/shortcut/burst blocks + `runnerText`) combined with `buildNinaSystemPrompt(input.tuning)` (`turn.ts:842`) into the `system`+`messages` fields of the `MessageCreateParamsNonStreaming` body `ninaBody()` builds (`turn.ts:718-743`). This full body is what a "full input" log column should capture — `NinaTurnInput` alone loses everything the model actually saw.

### Vision/multimodal call (today, no fallback, no persistence at all)

**Entry point (real-time):** `describeNinaImage` (`lib/nina/actions.ts:1601-1667`), its own Server Action invocation (not inside the 45s chat-turn budget) — plus two admin callers (`lib/admin/chatPhotoActions.ts:635-638` manual retry, `:796-799` auto-caption `after()` pass) and two avatar/album callers (`lib/admin/ninaAlbumActions.ts:145,551`), all funneling into `describeNinaImages` → `describeNinaImagesWithFetch` (`lib/nina/vision.ts:204-224`):
```ts
res = await fetchImpl(`${env.LLM_VISION_BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
  body: JSON.stringify({
    model: env.LLM_VISION_MODEL,      // 'glm-4.6v'
    max_tokens: NINA_DESCRIBE_MAX_TOKENS,   // 500
    thinking: { type: 'disabled' },
    messages,   // [{role:'system', content: <subject prompt>}, {role:'user', content: <image_url parts + fixed instruction>}]
  }),
  signal: AbortSignal.timeout(opts.timeoutMs ?? NINA_DESCRIBE_TIMEOUT_MS),   // 25_000 ms default
})
```
`env.LLM_VISION_BASE_URL = 'https://api.z.ai/api/coding/paas/v4'`, same `env.LLM_API_KEY` as text (R-40, one z.ai coding-plan key for both).

**Failure classification** (`vision.ts:225-274`) — two typed errors:
```ts
export class NinaVisionTokenFloorError extends Error {
  constructor(readonly promptTokens: number, readonly floor: number, readonly imageCount: number)
}
export class NinaVisionTransportError extends Error {
  constructor(message: string, readonly detail?: unknown)
}
```
`floor = estimateTextTokens(promptChars) + NINA_TOKEN_FLOOR_PER_IMAGE(150) * imageCount` — text-aware, recalibrated 2026-09-09 specifically for `glm-4.6v`'s measured behavior. `promptTokens < floor` → `NinaVisionTokenFloorError` (image silently dropped). Checked *before* `res.ok`, since a below-floor 200 is itself the failure signature. Otherwise non-200 or empty completion → `NinaVisionTransportError`.

**Persistence: none.** `NinaTurnKind` already has a `'vision'` member (`lib/db/schema.ts:535`) with a doc comment anticipating exactly this ("a turn where the endpoint silently dropped the image") — but zero call sites in the repo ever `insertNinaTurn` with `kind: 'vision'`. A failed describe call's only trace is `console.error`/`console.warn` (`actions.ts:1654-1659`, `chatPhotoActions.ts:649-657,807-817`) and the fact that `nina_message_images.description` stays `NULL` forever (no automatic retry anywhere).

**Input shape:** two fixed system-prompt variants (`NINA_DESCRIBE_SYSTEM_PROMPT` / `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`, `lib/nina/prompts/describe.ts:37-62,137-162`) + one fixed instruction string (`"Describe this photo."`) + the image as a base64 `data:` URI (re-fetched and re-encoded from Blob, `toDataUri`, `vision.ts:291-316`) — no conversation history, no per-request text variability beyond `subject`/image count.

**Image storage/viewer:** `nina_message_images` (`lib/db/schema.ts:1058-1237`) holds `blobUrl`, `pathname`, `description`, etc. The existing full-screen viewer is `components/ui/PhotoViewer.tsx` — `{ photos: ViewerPhoto[]; index; onIndex; onClose; subject?; actions? }`, `ViewerPhoto = { url, kind, label? }` — invoked from `components/nina/NinaAboutScreen.tsx:495-496` (client-held `index`/open state, native pinch-zoom, swipe paging via `lib/photos/gallery`).

### Image-generation call (today, already OpenRouter, no fallback needed, no raw-error persistence)

**Entry point:** `runNinaImageJob` (`lib/nina/imagerun.ts`) attempts, on both the in-platform (Vercel) and GitHub Actions backstop hosts, via `callNinaImageModel`/`lib/nina/imagecall.ts:243-254`:
```ts
res = await fetch(OPENROUTER_IMAGE_URL, {    // 'https://openrouter.ai/api/v1/images/generations'
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(buildImageRequestBody({ prompt, seed, referenceDataUrl, model })),
  signal: AbortSignal.timeout(postTimeoutMs),
  cache: 'no-store',
})
```
`apiKey = ninaEnv().OPENROUTER_API_KEY` (lazy-read). `model` defaults to `NINA_IMAGE_MODEL = 'qwen/qwen-image-3'` (operator dropdown adds `'qwen/qwen-image-3-pro'`). Timeouts: `NINA_IMAGE_CALL_TIMEOUT_MS = 150_000` (unanchored), `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS = 235_000` (anchored), `NINA_WORKER_CALL_TIMEOUT_MS = 290_000` (GitHub backstop) — all in `lib/nina/imagerecipe.ts`.

**The call never throws** — every failure path returns `{ ok: false, kind: NinaImageFailure, latencyMs, costMicroUsd, detail }` (`imagecall.ts:79-100`), `detail` explicitly commented `"Never rendered. Log only."`. `classifyImageFailure` (`lib/nina/imagefail.ts:59-87`) sorts it into `'timeout' | 'policy' | 'transport' | 'stale'`.

**Persistence today:** `failNinaImageJob` (`lib/nina/imagejobs.ts:480-565`) writes `status:'failed', errorCode: kind` (the coarse classification, e.g. `'timeout'`) to the existing `nina_turns` row — **`detail` (the raw provider text/body/stack) is passed into `failNinaImageJob` but never included in the `.set({...})`; it is `console.warn`'d and discarded.** Retries: in-invocation loop while budget allows (`NINA_IMAGE_MAX_ATTEMPTS = 2`), cross-render revival, a GitHub Actions backstop sweep, and a stale-sweep give-up — all same-model, same-provider; **no cross-provider fallback exists**, and a user-initiated "redo" after terminal failure inserts a *new* row (never resets the failed one).

**`args` jsonb (`NinaImageJobArgs`)** already carries `prompt` (the fully-assembled generation prompt, stored once, "the load-bearing choice") and `referenceUrl?` (the anchor photo's Blob URL, when supplied) — the natural "full input" and "image link" sources respectively.

**On failure, no output image ever exists**: `finishSelfie` (which writes the `nina_message_images` row) only runs on success; `planJobPhoto` (`lib/nina/jobview.ts:510-523`) returns `{ kind: 'none' }` for a job with no `imageId`, and the existing `/nina/jobs/[id]` detail page already renders no photo affordance for a failed job — this is a deliberate, already-shipped convention ("never a link the server has not proved").

---

## Key Data Structures

### `nina_turns` (`lib/db/schema.ts:580-716`) — read but not modified by this feature

Columns: `id, user_id, kind ('chat'|'proactive'|'image'|'vision'), trigger, model, prompt_version, input_tokens, output_tokens, tool_calls, latency_ms, cost_micro_usd, status ('pending'|'ok'|'repaired'|'failed'), error_code (short internal reason, NOT the raw provider message), args (jsonb, image jobs only), deleted_at, created_at`. One index: `nina_turns_user_created_idx (user_id, created_at desc)`, pinned exact by `tests/db.schema.nina.test.ts`. Pinned invariant: "carries no message text."

### New: `nina_error_logs` (introduced by this feature, Phase 1)

Not yet defined in code — see Phase 1's plan for the exact Drizzle definition. Conceptually: `id (nanoid12 PK), category ('text'|'multimodal'|'image_generation'), userId (FK users, cascade), provider ('zai'|'openrouter'), model (text), fullInput (text), errorMessage (text), timeoutMs (integer, nullable), imageUrl (text, nullable), createdAt (timestamptz, default now)`, one index `(category, created_at desc)`.

### `NinaImageJobArgs` (`lib/nina/imagerecipe.ts:611-652`)

`{ purpose, scene, mood, prompt, seed, replyToId, source, attempts, sidecar, referenceUrl?, model? }` — `prompt` and `referenceUrl` feed the new Image-generation log rows directly.

### `ViewerPhoto` (`components/ui/PhotoViewer.tsx:61-95`)

`{ url: string; kind: string; label?: string }` — what a new image-link click handler must construct to reuse `PhotoViewer`.

---

## Dependencies

### Configuration / Environment

- `LLM_API_KEY`, `LLM_BASE_URL` (`https://api.z.ai/api/anthropic`), `LLM_MODEL` — text, eager-validated in `lib/env.ts`'s core schema.
- `LLM_VISION_BASE_URL` (`https://api.z.ai/api/coding/paas/v4`), `LLM_VISION_MODEL` (`glm-4.6v`) — vision, same core schema, same key.
- `OPENROUTER_API_KEY` — already present, lazily validated via `ninaEnv()` (`lib/env.ts`), currently consumed only by `lib/nina/imagecall.ts`. No `OPENROUTER_BASE_URL`/`OPENROUTER_MODEL` env vars exist; the image path hardcodes both as code constants (`OPENROUTER_IMAGE_URL`, `NINA_IMAGE_MODEL` in `lib/nina/imagerecipe.ts`) — the new fallback should follow this same convention (hardcoded `OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'` and a `NINA_FALLBACK_TEXT_MODEL = 'z-ai/glm-5.3-flash'` constant in `lib/nina/`), not new env vars.
- `app_settings.text_model` (DB row, not env) — live-read model selector for the *primary* z.ai model; the fallback model is a fixed constant, not operator-selectable, per this analysis's scope (not requested).

### External services

- z.ai Anthropic-compatible endpoint (text), z.ai OpenAI-compatible coding endpoint (vision) — both same API key.
- OpenRouter (`openrouter.ai`) — already used for image generation; this feature adds a second, chat-shaped usage (`/api/v1/chat/completions`), confirmed to exist and to list `z-ai/glm-5.3-flash` as natively multimodal (text+image+video in, text out) per `openrouter.ai/z-ai/glm-5.3-flash`.

### Build-time/CI guard

- `scripts/check-openrouter-boundary.mjs` (npm script `ci:openrouter-guard`) — greps for `OPENROUTER_API_KEY` outside `lib/nina/`/`lib/env.ts` and fails. Any new fallback client reading this key must live under `lib/nina/`.
- `tests/db.schema.test.ts`, `tests/db.schema.nina.test.ts` — Vitest schema-shape pins; a new table needs a corresponding new pin (not modifying existing `nina_turns` assertions, since this feature does not touch that table).

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `runNinaTurnWith` primary/continuation call | `lib/nina/turn.ts:904-917` | call site | `lib/nina` |
| `attemptNinaRepair` call | `lib/nina/turn.ts:1072-1081` | call site | `lib/nina` |
| `NinaLlmClientLike` | `lib/nina/turn.ts:172-179` | interface (injection seam) | `lib/nina` |
| `productionDeps` | `lib/nina/turn.ts:1107-1115` | def | `lib/nina` |
| `narrativeClient` | `lib/llm/client.ts:34-48` | def | `lib/llm` |
| `describeNinaImagesWithFetch` | `lib/nina/vision.ts:204-224` | call site | `lib/nina` |
| `NinaVisionTokenFloorError` / `NinaVisionTransportError` | `lib/nina/vision.ts:86-111` | def | `lib/nina` |
| `describeNinaImage` | `lib/nina/actions.ts:1601-1667` | caller | `lib/nina` |
| `callNinaImageModel` | `lib/nina/imagecall.ts:243-254` | call site | `lib/nina` |
| `failNinaImageJob` | `lib/nina/imagejobs.ts:480-565` | write path (drops `detail`) | `lib/nina` |
| `NinaImageJobArgs` | `lib/nina/imagerecipe.ts:611-652` | type | `lib/nina` |
| `nina_turns` table | `lib/db/schema.ts:580-716` | def (read-only for this feature) | `lib/db` |
| `nina_message_images` table | `lib/db/schema.ts:1058-1237` | def (read-only) | `lib/db` |
| `newId` | `lib/id.ts` | def (id convention) | `lib` |
| `drizzle.config.ts` | repo root | migration config | — |
| `drizzle/meta/_journal.json` (highest idx 20, `0020_image_gen_controls`) | `drizzle/` | migration history | — |
| `AdminNavLinks.tsx` `LINKS` array | `components/admin/AdminNavLinks.tsx:67-111` | config (needs a 7th entry) | `components/admin` |
| `PhotoViewer` | `components/ui/PhotoViewer.tsx` | reusable component | `components/ui` |
| `DetailPanel` | `components/ui/DetailPanel.tsx` | reusable pattern (native `<dialog>`) | `components/ui` |
| `NinaJobList` | `components/nina/NinaJobList.tsx:94-158` | compact-row pattern | `components/nina` |
| `scripts/check-openrouter-boundary.mjs` | repo root | CI guard | — |

---

## Impact Points (files that WILL need changes)

1. `lib/db/schema.ts` — new `nina_error_logs` table. **Phase 1.**
2. `drizzle/0021_<slug>.sql` (+ `drizzle/meta/`) — migration. **Phase 1.**
3. `lib/nina/errorlogs.ts` (new) — writer (`logNinaError`) + admin paginated readers per category. **Phase 1.**
4. `tests/db.schema.errorlogs.test.ts` (new, or extend `tests/db.schema.test.ts`) — schema pin for the new table. **Phase 1.**
5. `lib/nina/llmFallbackText.ts` (new) — Anthropic⇄OpenAI-shaped OpenRouter fallback client implementing `NinaLlmClientLike`. **Phase 2.**
6. `lib/nina/turn.ts` — `productionDeps()`'s `client` field swapped to the fallback-wrapping client. **Phase 2.**
7. `lib/nina/vision.ts` — retry against OpenRouter on z.ai failure; skip the glm-4.6v-calibrated token floor for the fallback response. **Phase 3.**
8. `lib/nina/imagejobs.ts` / `lib/nina/imagerun.ts` — pass the currently-discarded `detail`/timeout into a new `nina_error_logs` write on terminal image-generation failure. **Phase 4.**
9. `app/admin/error-logs/page.tsx` (new) — Server Component, `?tab=`/`?page=` reads. **Phase 5.**
10. `components/admin/ErrorLogList.tsx`, `components/admin/ErrorLogDetailDialog.tsx` (new, names indicative) — compact list + popup. **Phase 5.**
11. `components/admin/AdminNavLinks.tsx` — new nav entry. **Phase 5.**

**This document describes. The plan files prescribe.**
