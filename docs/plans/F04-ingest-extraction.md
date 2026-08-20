# F04 — Ingest & Vision Extraction

> **Feature:** 1–3 Apple Fitness screenshots → client compression → Vercel Blob → `glm-4.6v`
> vision extraction → a validated, human-reviewable `ExtractedSession`.
> **Depends on:** F01 (scaffold, `lib/env.ts`), F03 (Drizzle schema, `db`, `newId()`)
> **Consumed by:** F05 (Review & correction — takes the `ExtractedSession` + `extractions.id`
> and turns it into a `runs` row with `reviewed_at` set)
> **Authoritative contract:** `ROADMAP_v0.1.0.md` §4.1 (env), §4.2 (units), §4.3 (schema), D1–D5,
> D13; `IMPLEMENTATION_PLAN.md` §1 (measured evidence), §2 (architecture)

**This is the project.** Both roadmap documents say so independently, and they are right: every
other feature (F06–F11) is competent CRUD over a well-shaped `runs` row. F04 is the only place
where an LLM looks at pixels and turns them into numbers a person will make training decisions
from. Get the numbers wrong here and every chart, every badge, every "you're overtraining"
warning downstream is confidently wrong too.

The single highest-value artifact in this document is **§1, the token-floor guard**. Read it
before writing any code that touches `lib/llm/vision.ts`.

---

## 0. What F04 owns, and what it deliberately does not

**Owns:**
- `/upload` — the screenshot picker, per-image kind assignment, client-side compression
- The Vercel Blob client-upload handshake at `POST /api/upload`
- `lib/llm/vision.ts` — the raw `glm-4.6v` call, and the token-floor guard
- The production extraction prompt
- `POST /api/extract` — starts a background job, returns immediately
- `GET /api/extract/[id]` — poll status, and the stale-pending self-heal
- The background job mechanism itself (Next.js `after()`)
- `lib/schema/extractedSession.ts` — the Zod schema for one extracted session
- The one-shot repair round-trip
- Writing and updating `extractions` rows (§4.3 of the roadmap; this table is F04's alone)
- Wiring `research/score.mjs` into CI as F04's regression test (D13)

**Does not own:**
- The `/r/[id]/review` correction screen, or any UI for editing a field (F05)
- Committing a reviewed extraction into `runs` / `run_splits` / `run_zones` / `run_photos`
  (F05 — F04 hands off a validated `ExtractedSession`, F05 writes the durable rows)
- `lib/metrics/*` (F06) and anything that computes a derived number from splits or zones
- Narrative generation (F07)

The boundary is exact: **F04's job is done the moment `GET /api/extract/[id]` can return a
`status` and, if not `failed`, a validated `ExtractedSession` object.** What happens to that
object next is F05's problem.

---

## 1. THE TOKEN-FLOOR GUARD — read this first

`IMPLEMENTATION_PLAN.md` §1.1 measured, against the live API, that
`https://api.z.ai/api/anthropic/v1/messages` accepts an image content block, returns **HTTP
200**, and **silently drops the image**. The model then answers the text prompt alone — and
because `glm-4.6v` is a helpful model asked a specific factual question about a run, **it
invents a plausible-sounding number instead of refusing.**

Verbatim from the measured probe: asked for distance and pace from a screenshot whose true
values are **10.67 km at 7'22"/km**, the endpoint returned **"Distance: 5.00 km, Avg Pace:
05:00/km"** — wrong, confident, and formatted exactly like a correct answer would be. There is
no error field, no warning, no non-200 status. A naive integration would parse this, and a
runner would see a training log with a fabricated split.

**This is why F04 uses `https://api.z.ai/api/coding/paas/v4/chat/completions` and not the
Anthropic-compatible endpoint for vision** (§2 below) — but endpoint choice alone is not the
mitigation. The coding endpoint is the one that *works*, but the failure mode this guard exists
for is a class of bug ("200 OK, wrong answer, no signal") that can recur on any provider change,
config typo, or upstream regression. **The guard must exist regardless of which endpoint is
configured**, because the day someone points `LLM_VISION_BASE_URL` at the wrong host by mistake
is exactly the day this bug returns.

### The tell

The measured discriminator is `usage.prompt_tokens`. A single 739×1600 screenshot costs
**~1,500 input tokens** when it actually reaches the model; at the shipped 560w/q80
preprocessing (§4 below) three images together cost **3,277 tokens** (~1,092/image). When the
image is dropped, the request reports **141 prompt tokens** — text-prompt-only, regardless of
how many images were attached or how large they were.

### The exact assertion

```ts
// lib/llm/vision.ts
const TOKEN_FLOOR_PER_IMAGE = 500

if (usage.prompt_tokens < TOKEN_FLOOR_PER_IMAGE * imageCount) {
  throw new VisionTokenFloorError(usage.prompt_tokens, imageCount)
}
```

`500` per image is deliberately conservative on both sides: it sits **3.4× above** the observed
drop signature (141 for the whole request, not even per-image) and **more than 2× below** the
measured cost of the actual preprocessed image (1,092/image). There is no plausible real image
that lands in that gap, and no plausible dropped-image response that clears it. Multiplying by
`imageCount` matters — a fixed floor of, say, 800 would let a 3-image request with only one
image actually delivered slip through.

**Where it lives:** inside `callVision()` in `lib/llm/vision.ts`, immediately after the HTTP
response is parsed and **before `choice.message.content` is read for any purpose.** This is not
a validation step alongside JSON-parsing — it gates JSON-parsing. Nothing downstream is allowed
to see the text of a response that fails this check.

**Its error type:** `VisionTokenFloorError`, a distinguished subclass of `Error` carrying
`promptTokens` and `imageCount`. `lib/llm/extract.ts` catches this specifically (never generic
`Error`) and routes straight to `status: 'failed'`, `error_code: 'token_floor'` — **no repair
round-trip is attempted**, because a repair round-trip re-sends the same request shape to the
same endpoint and would fail the same way. This is the one failure class in F04 that skips
straight past the repair stage described in §5.

**The CI test that proves it fires** (no live API call, fully mocked):

```ts
// lib/llm/__tests__/vision.test.ts
it('throws VisionTokenFloorError when prompt_tokens collapses to the drop signature', async () => {
  const fakeFetch = vi.fn().mockResolvedValue(
    jsonResponse({
      choices: [{ message: { content: '{"distanceKm": 5.00, "avgPaceSecPerKm": 300}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 141, completion_tokens: 12 }, // the measured drop signature
    }),
  )
  await expect(
    callVisionWithFetch(fakeFetch, threeTestImages, { timeoutMs: 5000 }),
  ).rejects.toThrow(VisionTokenFloorError)
  // The strongest form of this assertion: prove the fabricated distance was NEVER read.
  expect(fakeFetch).toHaveBeenCalledOnce()
})

it('does not throw at the measured real-image token cost', async () => {
  const fakeFetch = vi.fn().mockResolvedValue(
    jsonResponse({
      choices: [{ message: { content: VALID_EXTRACTION_JSON }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3277, completion_tokens: 950 }, // §4 measured value, 3 images
    }),
  )
  await expect(callVisionWithFetch(fakeFetch, threeTestImages, { timeoutMs: 5000 })).resolves.toBeDefined()
})

it('scales the floor with image count — 2 images at 1-image cost still trips', async () => {
  const fakeFetch = vi.fn().mockResolvedValue(
    jsonResponse({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 900, completion_tokens: 5 } }), // clears 1×500, fails 2×500
  )
  await expect(callVisionWithFetch(fakeFetch, twoTestImages, { timeoutMs: 5000 })).rejects.toThrow(VisionTokenFloorError)
})
```

`callVisionWithFetch` is `callVision` with the `fetch` implementation injected — the same
dependency-injection shape `expense-tracking/lib/llm/parseExpense.ts` uses for `LlmClientLike`,
for the same reason: the unit suite must never touch the network, and `vision.ts` imports
`server-only` + `@/lib/env`, so it cannot be imported directly under Vitest without the same lazy
`await import()` trick `parseExpense.ts` uses (§7, Task 3).

This is, per the brief, the highest-value ten lines in the codebase. Everything else in F04
exists to get a request that clears this floor, and to do something sane when it does not.

---

## 2. The endpoint and request shape

```
POST https://api.z.ai/api/coding/paas/v4/chat/completions
Authorization: Bearer <LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */>
Content-Type: application/json
```

OpenAI Chat Completions shape — **not** the Anthropic Messages shape. `@anthropic-ai/sdk`
cannot be pointed at this endpoint (different request/response envelope entirely: `messages[].content`
image parts are `{ type: 'image_url', image_url: { url } }` here, not
`{ type: 'image', source: { type: 'base64', ... } }`). Fighting the SDK to bend it into this
shape buys nothing — `lib/llm/vision.ts` is one `fetch` call and stays that way.

**Fixed body parameters, non-negotiable, each backed by a measurement:**

| Parameter | Value | Why |
|---|---|---|
| `model` | `env.LLM_VISION_MODEL` (`glm-4.6v`) | the only vision-capable model reachable on the coding plan (§1.2 of the implementation plan) |
| `thinking` | `{ type: 'disabled' }` | measured: thinking mode **doubles** latency (73s vs 33.7s) for an **identical** 108/108 score. There is no accuracy trade to make here — it is pure waste. |
| `max_tokens` | `4096` | measured sufficient for the full 108-field JSON with room to spare; the observed completion is well under this |
| `messages` | `[system, user]`, all 1–3 images **in the single user turn** | measured: one call with all images scored 108/108 five consecutive times; three parallel per-image calls scored 94.4% and made a genuine misread (see §2.1) |

### 2.1 Why one call, not parallel per-image calls

The parallel variant is **twice as fast** (16s vs 33.7s) — and this plan still rejects it.
Measured: it misread split 1's pace as `436 s` when the screenshot says `6'36"` (396 s). Four of
its six total misses were prompt-wording issues, fixable in principle — **but that fifth one was
a genuine misread of a real value with no dropped context to blame.** Splitting the images across
calls removes the cross-image context that lets the model sanity-check one screen against
another (e.g. total duration on the summary screen against the sum of split times), and the
model does not compensate for what it cannot see.

**Extraction is a background job (§4). The user is not staring at a spinner for the extra 17
seconds — they are looking at a well-designed skeleton (§4.4).** Accuracy costs nothing to buy
here; latency does. Buy accuracy.

### 2.2 What the F04 client sends per image

```ts
{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,<...>' } }
```

Base64 data URI, not a hosted URL — even though the image already lives in Vercel Blob by the
time extraction runs. This matches the measured recipe exactly (`research/lib.mjs`'s `imgPart`)
and avoids introducing an untested request shape (a `url:`-only `image_url` pointing at the Blob
URL was never probed against this endpoint, and per §1's lesson, an untested shape on this vendor
is not something to trust in production). The background job fetches the three Blob URLs
server-side and re-encodes them as data URIs before calling `glm-4.6v`.

---

## 3. Image preprocessing — resize 560w, JPEG q80, client-side

Full measured table (`research/downscale.mjs`, `IMPLEMENTATION_PLAN.md` §1.4), all five variants
scoring identically:

| Variant | Bytes (3 imgs) | Input tokens | Latency | Score |
|---|---|---|---|---|
| original PNG 739w | 1222 KB | 5143 | 28.9 s | 108/108 |
| PNG 560w | 822 KB | 3277 | 33.0 s | 108/108 |
| JPEG q80 739w | 236 KB | 5143 | 32.7 s | 108/108 |
| **JPEG q80 560w** | **170 KB** | **3277** | 28.2 s | **108/108** |
| JPEG q70 460w | 107 KB | 2425 | 33.4 s | 108/108 |

**Ship JPEG q80 at 560w.** 7× fewer bytes than the original over the wire, 36% fewer input
tokens than PNG-at-original, zero measured accuracy cost. Input tokens track **pixel dimensions**,
not file size — this is why the JPEG-at-739w row costs the same tokens as the PNG-at-739w row
despite an 80% byte reduction; only resizing reduces tokens. Compression saves upload bandwidth
and Blob storage; resizing saves model cost and, per the latency column, is a wash either way.

460w/q70 is left on the table deliberately: it also scored 108/108 (53% fewer tokens than the
shipped choice) but sits closer to the legibility edge on the splits table's smallest type — the
measurement is real but the margin is thinner. Revisit it only if latency or token cost becomes
an actual constraint (§1.7: at 11 cents/month it is not), and re-run
`research/downscale.mjs` before trusting a lower setting than what is shipped here.

### 3.1 The width-vs-long-edge trap

`browser-image-compression` (already wired in `expense-tracking/lib/photos/compress.ts`) exposes
`maxWidthOrHeight`, which clamps the **longer** of the two dimensions. Apple Fitness screenshots
are **portrait** — the measured fixture is 739×1600 (width × height), height is the long edge.

**Passing `maxWidthOrHeight: 560` on a portrait image scales the 1600px height down to 560,
producing a ~259px-wide image** — nowhere near the tested 560w recipe, and well outside the
measured accuracy envelope (the smallest tested width was 460w). This is a one-line, easy-to-miss
bug that silently ships an under-sized image with no error anywhere in the pipeline; the
extraction would likely still "succeed" (clear the token floor, return valid JSON) while quietly
degrading accuracy on the fiddly cells (comma decimals, small-print footnotes) that §1.3's
findings depend on legible source pixels for.

**Fix: compute the long-edge target from the known short-edge target before calling the
compressor.**

```ts
// lib/photos/compressForExtraction.ts
import imageCompression from 'browser-image-compression'

const TARGET_WIDTH = 560
const TARGET_QUALITY = 0.8 // matches the measured "JPEG q80" recipe exactly

/**
 * Screenshots are portrait: width < height. The measured 560w/q80 recipe controls WIDTH,
 * but browser-image-compression's `maxWidthOrHeight` controls whichever dimension is
 * LARGER — height, for every screenshot this feature will ever see. Passing 560 directly
 * would resize by height and produce a ~259px-wide image, well outside the tested
 * envelope (§3.1). We read the source dimensions first and derive the long-edge value
 * that makes the SHORT edge land on 560.
 *
 * If a future upload is ever landscape (width > height — should not happen for a Fitness
 * app screenshot, but a screen-rotated capture is possible), this still does the right
 * thing: short edge is width in both branches, so the formula is symmetric.
 */
export async function compressForExtraction(file: File): Promise<{ file: File; width: number; height: number }> {
  const { width, height } = await readDimensions(file)
  const shortEdge = Math.min(width, height)
  const longEdge = Math.max(width, height)
  const targetLongEdge = Math.round(TARGET_WIDTH * (longEdge / shortEdge))

  const out = await imageCompression(file, {
    maxWidthOrHeight: targetLongEdge,
    initialQuality: TARGET_QUALITY,
    fileType: 'image/jpeg',
    // maxIteration: 1 is deliberate and differs from expense-tracking's compress.ts.
    // That module targets a BYTE budget (maxSizeMB) and lets the library iterate
    // quality downward to hit it — appropriate for arbitrary photos. This module
    // targets the EXACT recipe that was measured at 108/108 (560w, q80) and must not
    // let an iterative byte-budget search silently pick a different quality that was
    // never scored. maxSizeMB is set generously (0.5) purely as a safety ceiling, not
    // a target — at 560w/q80 a screenshot lands at ~55-60KB, far under it.
    maxSizeMB: 0.5,
    maxIteration: 1,
    useWebWorker: true,
    libURL: COMPRESSION_LIB_URL, // reuse expense-tracking's self-hosted copy
    preserveExif: false, // screenshots have no GPS EXIF, but strip on principle (D-consistent with expense-tracking)
  })

  const dims = await readDimensions(out)
  return { file: out, width: dims.width, height: dims.height }
}
```

**Verification, not just code review:** a unit test decodes the compressed output and asserts
`Math.min(width, height)` is `560 ± 5` — this is the test that would have caught the bug above,
and the one that must exist before this module ships (Task 12).

---

## 4. The background job

### 4.1 Why extraction cannot run inside the request

Extraction is **33.7s median** against a **60s** Vercel Hobby function ceiling
(`IMPLEMENTATION_PLAN.md` §2.3, roadmap D4). That 33.7s is the *happy path* — it does not include
a repair round-trip, network variance, or cold start. `fetch → 33.7s → Zod → repair(≈15-30s) →
DB write` does not reliably fit in 60s, and even the happy path leaves uncomfortably little
margin once cold start and JSON parsing of a multi-KB response are counted. **Extraction must not
run inside the request/response cycle the browser is waiting on.**

### 4.2 Mechanism: Next.js `after()`

```ts
// app/api/extract/route.ts
import { after } from 'next/server'

export const maxDuration = 60 // Vercel Hobby ceiling — the honest number, not aspirational

export async function POST(request: Request) {
  const userId = await requireUserIdApi()
  const { images } = ExtractRequestSchema.parse(await request.json())

  const extractionId = await insertPendingExtraction({ userId, images })

  after(async () => {
    await runExtractionJob(extractionId) // §5 — vision call, Zod, repair, DB write
  })

  return Response.json({ extractionId }, { status: 202 })
}
```

`after()` (stable in Next.js since 15, carried into Next 16) schedules its callback to run
**after the response has been sent to the client**, but **within the same serverless
invocation**, extending its lifetime up to `maxDuration`. This is the correct primitive here
specifically because it needs no new infrastructure (no queue service, no cron, nothing beyond
what Vercel already provides) and the client-visible latency drops to the time it takes to insert
one row — typically under 200ms — while the actual 33.7s of work still happens on Vercel's
compute, not the runner's browser tab.

`@vercel/functions`'s `waitUntil()` is the lower-level primitive `after()` is built on; if a
future Next.js upgrade ever changes `after()`'s guarantees, `waitUntil()` is the documented
fallback with the same semantics for this use case.

**This is the single biggest structural difference from the expense tracker**, where
`parseExpense`'s worst case (~41s, §0.2 of `expense-tracking/docs/plans/F04-llm-parsing.md`) fits
comfortably inside one request and the user simply waits for it.

### 4.3 Status lifecycle

```
pending ──► ok         extraction succeeded, Zod validated on the first attempt
        ├─► repaired   Zod failed once; the one-shot repair round-trip validated
        └─► failed     token floor tripped, transport error, timeout, or repair also failed
```

`pending` is the only non-terminal state. Every terminal state carries `completed_at`. `failed`
additionally carries `error_code` (`'token_floor' | 'transport' | 'timeout' | 'validation' |
'stale_timeout'`) so the review screen (F05) and any future prompt-tuning work
(`extractions.corrections`, roadmap D13's stated purpose) can distinguish failure classes without
re-parsing `raw_response`.

### 4.4 How the client learns it finished: poll, not stream

**Poll**, not Server-Sent Events or a WebSocket. Reasoning:

- The result is a single JSON blob delivered once, not an incremental stream of tokens the UI
  benefits from rendering progressively — there is nothing for the user to usefully watch update
  mid-extraction. A skeleton with a static "reading your screenshots…" message is honest about
  what is happening and costs nothing to build.
- Vercel serverless functions are not well-suited to holding a connection open for 30+ seconds
  waiting on a background computation happening in a *different* invocation's `after()` — SSE
  from the polling endpoint itself would need to poll the DB internally anyway, which is strictly
  more moving parts for no user-visible benefit.
- Polling is trivially resilient to the tab being closed and reopened, or to navigating away and
  back — `GET /api/extract/[id]` is idempotent and stateless from the client's perspective.

**Interval:** poll `GET /api/extract/[id]` starting at 2s, backing off to 3s after the 4th
attempt and 5s after the 10th, capped at 5s. Against a 33.7s median this delivers the result
within one poll interval of it actually finishing in the common case, without hammering the
endpoint during the (rare) slow tail.

**Client-side giving-up:** if polling has run past 90 seconds without a terminal status, the UI
stops polling and offers "This is taking longer than expected — you can wait, or start over."
It does **not** silently keep polling forever, and it does not need to — the server-side sweep
below already guarantees a terminal status is reachable.

### 4.5 What happens if the job dies mid-flight

`after()`'s guarantee is "runs to completion or the invocation is killed at `maxDuration`" — it
has no notion of "resume" or "retry." If the invocation is killed (hits the 60s wall, the
underlying compute is recycled during a deploy, OOM, whatever), the callback simply stops, and
the `extractions` row is left at `status: 'pending'` forever with no further update coming.
**No queue, no cron, and no separate worker process exist to notice this — one must be designed
in**, and a full queue/worker system is not justified for a personal app's ~17 runs/month.

**The chosen mechanism is a lazy, pull-based self-heal inside the polling endpoint itself:**

```ts
// GET /api/extract/[id]
const STALE_MS = 90_000 // ~2.7x the measured 33.7s median; comfortably past the slow tail

const row = await getExtraction(extractionId, userId)
if (row.status === 'pending' && Date.now() - row.createdAt.getTime() > STALE_MS) {
  await updateExtraction(extractionId, {
    status: 'failed',
    errorCode: 'stale_timeout',
    completedAt: new Date(),
  })
  row.status = 'failed'
  row.errorCode = 'stale_timeout'
}
return Response.json(toClientShape(row))
```

Because the client is already polling every few seconds, this check runs "for free" on the very
next poll after 90s elapses — no cron job needed to reach a terminal state. `research/matrix.mjs`
proved the vendor's own failure modes are silent; F04's own failure mode must not be. A stuck
`pending` row that the UI eventually gives up on anyway (§4.4) is a worse outcome than a `failed`
row with a clear `error_code`, because the latter is auditable in `extractions` and the former is
indistinguishable from "still working" without inspecting timestamps by hand.

**Recovery path for the user:** the review screen (F05) offers "try again" on any `failed`
extraction, which calls `POST /api/extract` again with the same `blob_urls` — a fresh row, fresh
attempt, previous row kept as an audit trail (`extractions` rows are never deleted, per the
roadmap's data model comment). No idempotency key is needed across attempts; two `pending` rows
for the same screenshots existing briefly is harmless.

### 4.6 Budget inside the job

There is no measured latency for a *repair* round-trip on the vision path (only `parseExpense`'s
text-only repair has been measured, at a much smaller prompt). The budget below is **designed,
not measured** — flagged explicitly so nobody mistakes it for another §1 finding — and should be
tightened once real repair-latency data exists (Task 19 adds that measurement).

| Phase | Budget | Notes |
|---|---|---|
| Route: parse body, insert `pending` row | < 300 ms | before the response is sent |
| **Response returned to client** | — | 202, ~200-500ms total |
| `after()`: primary vision call | **45 s** hard timeout | median is 33.7s; this allows for the observed tail without eating the whole ceiling |
| Token-floor check + JSON parse | < 50 ms | |
| Zod validate | < 10 ms | |
| Repair round-trip (only if Zod failed AND ≥ 15s of the 60s ceiling remains) | **min(remaining − 3s, 20s)** | skipped outright otherwise — see below |
| DB write (`extractions` update) | < 200 ms | |
| **Total worst case (repair attempted)** | **~51 s** | 45 (primary, its own timeout) + 20 (repair) is 65s and WOULD blow the ceiling if primary actually used its full budget; the repair gate below prevents that |

**The repair gate is budget-aware, mirroring `parseExpense.ts`'s `MIN_REPAIR_BUDGET_MS` pattern
but with numbers sized for vision's longer calls:** if the primary call already consumed most of
the 60s ceiling (i.e., took close to its own 45s timeout), there is not enough of `maxDuration`
left to safely start a second image-bearing call. In that case, skip the repair round-trip
entirely and go straight to `status: 'failed'`, `error_code: 'validation'` — the same
"don't start a round-trip we can't finish" principle expense-tracking already applies, just with
a larger minimum because a vision repair costs as much as the original call, not a few seconds.

**If Vercel Pro ever becomes available**, raising `maxDuration` to 120–300s removes this pressure
entirely and the repair gate can be relaxed to a flat "always attempt." Not assumed here — design
for Hobby's 60s, which is the ceiling actually cited by both source documents.

---

## 5. Zod schema, the one repair round-trip, and fail-to-manual-entry

### 5.1 Why the schema must not trust the shape at all

`IMPLEMENTATION_PLAN.md` §1.6 measured this exact vendor failure on the narrative side: `glm-5.3`
omitted `title` from every observation object **despite `title` being listed in the tool
schema's `required` array.** z.ai does not enforce JSON Schema `required`. There is no reason to
expect the vision model on the coding endpoint to behave differently, and no tool-schema
`required` array was even used in the measured extraction recipe (`research/run-extract.mjs` asks
for raw JSON via the prompt, not via OpenAI function-calling) — so there is *even less* structural
enforcement here than the narrative path had. **Every field, at every depth, must be validated by
Zod. Nothing is assumed present because the prompt described it as present.**

### 5.2 The Zod schema

```ts
// lib/schema/extractedSession.ts
import { z } from 'zod'

export const ScreenKind = z.enum(['summary', 'splits', 'heartrate'])
export type ScreenKind = z.infer<typeof ScreenKind>

const bpm = z.number().int().min(40).max(230).nullable()
const nonNegInt = z.number().int().nonnegative().nullable()

export const ExtractedSplit = z.object({
  km: z.number().int().positive(),
  timeSec: z.number().int().positive(),
  paceSecPerKm: z.number().int().positive(),
  hrBpm: bpm,
  cadenceSpm: z.number().int().min(0).max(300).nullable(),
  partial: z.boolean(),
})

export const ExtractedZone = z.object({
  zone: z.number().int().min(1).max(5),
  durationSec: z.number().int().nonnegative(),
  minBpm: z.number().int().nullable(), // null only valid for zone 1
  maxBpm: z.number().int().nullable(), // null only valid for zone 5
})

export const ExtractedPostWorkoutHr = z.object({
  label: z.string().min(1),
  bpm: z.number().int().min(40).max(230),
})

/** The raw, unvalidated shape the LLM is asked to return. Every field optional/nullable —
 *  per §5.1, nothing here is trusted to be present just because the prompt asked for it. */
const RawExtractedSession = z.object({
  activityType: z.string().nullable().default(null),
  goal: z.string().nullable().default(null),
  dateLabel: z.string().nullable().default(null),
  startTime: z.string().nullable().default(null),
  endTime: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  durationSec: z.number().int().positive().nullable().default(null),
  distanceKm: z.number().positive().nullable().default(null),
  activeKcal: nonNegInt.default(null),
  totalKcal: nonNegInt.default(null),
  elevationGainM: nonNegInt.default(null),
  avgCadenceSpm: z.number().int().min(0).max(300).nullable().default(null),
  avgPaceSecPerKm: z.number().int().positive().nullable().default(null),
  avgHrBpm: bpm.default(null),
  maxHrBpm: bpm.default(null),
  restingHrBpm: z.number().int().min(30).max(120).nullable().default(null),
  splits: z.array(ExtractedSplit).default([]),
  hrZones: z.array(ExtractedZone).default([]),
  postWorkoutHr: z.array(ExtractedPostWorkoutHr).default([]),
})

/**
 * §6: which screen kind each field group can ONLY come from. Used by
 * `makeExtractedSessionSchema` to null out (never merely flag) any field a screen that
 * was not uploaded could not possibly have produced. This is a defense against
 * hallucination, not a UX nicety — a splits table cannot be transcribed from a photo
 * that is not of a splits table.
 *
 * ASSUMPTION, stated because it was derived from field semantics and Apple Fitness's
 * known layout rather than from inspecting the three research screenshots directly:
 * avgHrBpm is read off the SUMMARY screen (Apple shows it as a top-line stat); maxHrBpm
 * ("top-of-axis value on the HR chart", schema.mjs) and restingHrBpm ("from the zones
 * footnote", schema.mjs) are read off the HEART RATE screen specifically, not the
 * summary. VERIFY this against the actual three screenshots in
 * `/home/miftah/.claude/image-cache/3a4e3940-26e9-4619-8bb5-9e0f6c5e0ad9/` during Task 6
 * and correct this table if the real layout differs — it is load-bearing for the
 * provenance guard below and easy to get backwards.
 */
const FIELD_OWNERSHIP: Record<'splits' | 'heartrate', (keyof z.infer<typeof RawExtractedSession>)[]> = {
  splits: ['splits'],
  heartrate: ['hrZones', 'postWorkoutHr', 'maxHrBpm', 'restingHrBpm'],
}

/**
 * Builds the schema for THIS extraction, parameterised by which screen kinds were
 * actually uploaded. `kindsPresent` comes from our own upload records — never from the
 * LLM's response — so this check cannot be defeated by the model claiming to have seen
 * a screen it wasn't given.
 */
export function makeExtractedSessionSchema(kindsPresent: Set<ScreenKind>) {
  return RawExtractedSession.transform((val) => {
    const out = { ...val }
    if (!kindsPresent.has('splits')) out.splits = []
    if (!kindsPresent.has('heartrate')) {
      out.hrZones = []
      out.postWorkoutHr = []
      out.maxHrBpm = null
      out.restingHrBpm = null
    }
    return out
  })
}

export type ExtractedSession = z.infer<typeof RawExtractedSession>
```

This is a **hard null-out, not a soft warning**: if the `heartrate` screen was never uploaded and
the model nonetheless returns five populated `hrZones` rows, those rows are discarded before the
data ever reaches F05's review screen — not merely flagged. There is no legitimate way for those
numbers to be real, so there is no legitimate reason to show them to a human as "extracted."

### 5.3 Screen-type detection: how kinds are assigned

The user may upload 1–3 of {summary, splits, heartrate} **in any order**, and may skip any of
them. F04 resolves "which image is which kind" **client-side, from the user, not from the
model** — this was a deliberate choice against two alternatives considered and rejected:

- *Let the model infer kind from content, unlabelled.* This is closest to the measured recipe
  (`research/run-extract.mjs`'s winning variant sends three unlabelled images in a fixed,
  known order — 1=summary, 2=splits, 3=heartrate — because the *test* always uses that order).
  Production input has no such guarantee: a user might upload only the splits and summary
  screens, or upload all three in reverse order. Nothing in the measured results tests
  order-independence or partial screen sets, so trusting the model to silently figure out "which
  of these 1–2 images is which kind, and what's simply absent" is exactly the kind of untested
  assumption §1's lesson warns against.
- *Auto-detect kind from aspect ratio or OCR heuristics.* Over-engineered for three fixed screen
  layouts from one app on one device family, and still needs a human override path for when it
  guesses wrong — so it doesn't remove any UI, it just adds a heuristic that can be confidently
  wrong in the same way §1 warns about.

**Chosen design:** the `/upload` picker shows one tile per selected image. Each tile gets a
kind selector (segmented control: Summary / Splits / Heart Rate), **defaulted by upload
order** (1st picked → Summary, 2nd → Splits, 3rd → Heart Rate — the common case, since that is
the order the screens naturally appear in the iOS Fitness app's own share flow) but always
user-editable before submit. The assigned kind is:

1. Sent to `POST /api/upload` as part of the client payload and stored in the Blob token payload
   (mirrors `expense-tracking/app/api/photos/upload/route.ts`'s `TokenPayload` pattern).
2. Stored in `extractions.blob_urls` as `[{ url, pathname, kind }]` — this jsonb column's shape
   is a F04 convention, not a schema change (§8, no migration needed).
3. Used to build the **labelled prompt** (§6) so the model is told what it is looking at, and to
   parameterise `makeExtractedSessionSchema` (§5.2) so the provenance guard knows what was and
   wasn't uploaded.

**What is null when a screen is absent:** exactly the fields in `FIELD_OWNERSHIP` (§5.2) for the
missing kind(s) — forced to `null`/`[]` regardless of what the model returns. All other fields
degrade naturally: e.g. with only the summary screen uploaded, `splits: []` and `hrZones: []`,
but `distanceKm`, `durationSec`, `avgPaceSecPerKm` etc. are still extracted normally from the one
image present. A 1-image upload is a fully supported, first-class case — not a degraded one.

---

## 6. The production prompt

```ts
// lib/llm/prompts/extraction.ts

export const EXTRACTION_SYSTEM_PROMPT = `You transcribe Apple Fitness / Apple Watch workout screenshots into JSON.

RULES — these matter more than anything else:
1. Transcribe ONLY what is literally visible. Never infer, never compute, never fill a
   plausible value. If a field is not visible in the images you were given, use null.
2. Apple uses a COMMA as the decimal separator for distance: "10,67KM" is 10.67 km.
3. Durations "1:18:36" are H:MM:SS -> seconds. "06:36" in a splits table is MM:SS -> seconds.
4. Pace "7'22\\"/KM" means 7 min 22 s per km -> 442 seconds per km.
5. The splits table may have a final PARTIAL kilometre: its time is shorter than its pace
   implies (e.g. time 04:48 but pace 7'09"). Set "partial": true for that row only.
6. Copy the splits table row for row. Do not skip rows, do not reorder, do not average.
7. Heart-rate zone rows give a duration MM:SS and a bpm range. Zone 1 has no lower bound
   and Zone 5 has no upper bound; use null for the missing side.
8. You will be given between 1 and 3 images, each preceded by a label naming which screen
   it is (SUMMARY, SPLITS, or HEART RATE). Only images you actually receive exist. If a
   screen kind is not among the labels you were given, you have no information about it:
   output null (or an empty array, for splits/hrZones/postWorkoutHr) for every field that
   screen alone would show. Do not reuse, estimate, or infer a value for an absent screen
   from a screen you do were given, even if it seems derivable.
9. maxHrBpm is read from the top-of-axis label on the heart-rate chart on the HEART RATE
   screen, not computed from any split's hrBpm. restingHrBpm is read from the small-print
   footnote on the HEART RATE screen. If you do not have a HEART RATE screen, both are null.

Return ONLY a JSON object. No markdown fences, no commentary, no text before or after the
JSON object.`

export const EXTRACTION_SHAPE = `{
  "activityType": string|null,          // "Outdoor Run"
  "goal": string|null,                  // "Open Goal"
  "dateLabel": string|null,             // "Thu, 20 Aug"
  "startTime": string|null,             // "07:07" 24h
  "endTime": string|null,               // "08:26" 24h
  "location": string|null,              // "Tangerang"
  "durationSec": number|null,           // 1:18:36 -> 4716
  "distanceKm": number|null,            // 10.67
  "activeKcal": number|null,
  "totalKcal": number|null,
  "elevationGainM": number|null,
  "avgCadenceSpm": number|null,
  "avgPaceSecPerKm": number|null,       // 7'22" -> 442
  "avgHrBpm": number|null,              // SUMMARY screen
  "maxHrBpm": number|null,              // HEART RATE screen, chart axis label. null if no HR screen.
  "restingHrBpm": number|null,          // HEART RATE screen, footnote. null if no HR screen.
  "splits": [ { "km": number, "timeSec": number, "paceSecPerKm": number,
                "hrBpm": number|null, "cadenceSpm": number|null, "partial": boolean } ],
  "hrZones": [ { "zone": 1..5, "durationSec": number,
                 "minBpm": number|null, "maxBpm": number|null } ],
  "postWorkoutHr": [ { "label": string, "bpm": number } ]
}`

export function buildExtractionUserContent(
  images: { kind: 'summary' | 'splits' | 'heartrate'; dataUri: string }[],
): Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  const label = { summary: 'SUMMARY screen', splits: 'SPLITS screen (transcribe every row)', heartrate: 'HEART RATE screen' }
  const intro = images.length === 3
    ? 'These are screenshots of ONE running workout: the summary, the full splits table, and the heart-rate detail.'
    : `These are ${images.length} screenshot(s) of ONE running workout. You are given: ${images.map((i) => label[i.kind]).join(', ')}.`

  const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []
  for (const img of images) {
    parts.push({ type: 'text', text: `IMAGE — ${label[img.kind]}:` })
    parts.push({ type: 'image_url', image_url: { url: img.dataUri } })
  }
  parts.push({ type: 'text', text: `${intro}\n\nReturn one JSON object with exactly this shape:\n${EXTRACTION_SHAPE}` })
  return parts
}
```

**Deviation from the measured winning variant, and why it's safe:** the measured 108/108 config
(`research/run-extract.mjs` variant A) sends three *unlabelled* images. This prompt labels each
image with its kind (closer to variant C, "3-imgs labelled"), because production must support
partial and reordered uploads that the fixed-order measured test never covers (§5.3). This is a
deliberate, documented divergence from the letter of the measured recipe in service of a
requirement (order/count independence) the recipe was never tested against — not a guess made in
its place. **Task 20 re-runs `research/run-extract.mjs` with this exact labelled-and-partial
prompt against the canonical fixture before this prompt ships**, to confirm the label wording
does not regress the score below 108/108 on the full 3-image case (rule 8/9 additions are
additive to the proven RULES 1–7 and SHAPE, not replacements, which is the safest form of change
to a prompt this load-bearing).

---

## 7. `lib/llm/vision.ts` — the client module

```ts
import 'server-only'
import { env } from '@/lib/env'
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserContent } from './prompts/extraction'

const TOKEN_FLOOR_PER_IMAGE = 500
const MAX_TOKENS = 4096

export class VisionTokenFloorError extends Error {
  constructor(public readonly promptTokens: number, public readonly imageCount: number) {
    super(
      `vision response reported prompt_tokens=${promptTokens} for ${imageCount} image(s); ` +
      `expected >= ${TOKEN_FLOOR_PER_IMAGE * imageCount}. The endpoint may have silently ` +
      `dropped the image(s) (IMPLEMENTATION_PLAN.md §1.1) — refusing to parse a response ` +
      `that may have invented its numbers.`,
    )
    this.name = 'VisionTokenFloorError'
  }
}

export class VisionTransportError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'VisionTransportError'
  }
}

export interface VisionImage {
  kind: 'summary' | 'splits' | 'heartrate'
  dataUri: string // data:image/jpeg;base64,...
}

export interface VisionResult {
  text: string
  promptTokens: number
  completionTokens: number
  finishReason: string | null
  raw: unknown
}

type FetchLike = typeof fetch

/**
 * The injectable core. Production calls this via `callVision`, below; tests call it
 * directly with a fake `fetch`, the same DI shape `parseExpense.ts` uses for its client —
 * necessary here for the same reason: `vision.ts` imports `server-only` and `@/lib/env`,
 * so it cannot be imported under Vitest without a fake at this seam.
 */
export async function callVisionWithFetch(
  fetchImpl: FetchLike,
  images: VisionImage[],
  opts: { timeoutMs: number; priorMessages?: unknown[]; repairNote?: string },
): Promise<VisionResult> {
  if (images.length < 1 || images.length > 3) {
    throw new Error(`callVision expects 1-3 images, got ${images.length}`)
  }

  const messages = opts.priorMessages ?? [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: buildExtractionUserContent(images) },
  ]
  if (opts.repairNote) {
    messages.push({ role: 'user', content: opts.repairNote })
  }

  let res: Response
  try {
    res = await fetchImpl(`${env.LLM_VISION_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */}` },
      body: JSON.stringify({
        model: env.LLM_VISION_MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'disabled' }, // §2: measured to double latency for zero score gain when enabled
        messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
  } catch (cause) {
    throw new VisionTransportError('vision request failed or timed out', cause)
  }

  const json = await res.json().catch((cause) => {
    throw new VisionTransportError('vision response was not valid JSON', cause)
  })

  const usage = json?.usage ?? {}
  const promptTokens: number = usage.prompt_tokens ?? 0
  const completionTokens: number = usage.completion_tokens ?? 0
  const choice = json?.choices?.[0]

  // ── THE TOKEN-FLOOR GUARD — see §1. Gates everything below it. Never move this. ──
  if (promptTokens < TOKEN_FLOOR_PER_IMAGE * images.length) {
    throw new VisionTokenFloorError(promptTokens, images.length)
  }

  if (!res.ok) {
    throw new VisionTransportError(`vision endpoint returned ${res.status}: ${JSON.stringify(json).slice(0, 300)}`)
  }

  return {
    text: choice?.message?.content ?? '',
    promptTokens,
    completionTokens,
    finishReason: choice?.finish_reason ?? null,
    raw: json,
  }
}

export function callVision(images: VisionImage[], opts: { timeoutMs: number }): Promise<VisionResult> {
  return callVisionWithFetch(fetch, images, opts)
}
```

Note `res.ok` is checked **after** the token-floor guard, not before — a non-200 with a low
token count should surface as the more specific `VisionTokenFloorError` when both are true,
since that is the more actionable diagnosis (matches the measured failure, which was itself a
200). A non-200 that clears the floor (unlikely, but not impossible) still gets a clear
`VisionTransportError`.

---

## 8. `lib/llm/extract.ts` — the orchestrator (Zod → repair → fail)

```ts
import { callVision, VisionTokenFloorError, VisionTransportError, type VisionImage } from './vision'
import { makeExtractedSessionSchema, type ScreenKind } from '@/lib/schema/extractedSession'
import { extractJsonObject } from './extractJson' // fence-stripping regex, ported from research/score.mjs

export interface ExtractOutcome {
  status: 'ok' | 'repaired' | 'failed'
  session: ExtractedSession | null
  errorCode: 'token_floor' | 'transport' | 'timeout' | 'validation' | null
  promptTokens: number | null
  rawVendorResponse: unknown
}

const PRIMARY_TIMEOUT_MS = 45_000
const REPAIR_TIMEOUT_MS = 20_000
const MIN_REPAIR_BUDGET_MS = 15_000 // see §4.6 — larger than parseExpense's 3s; a vision repair costs as much as the original call

/**
 * The testable core, `remainingBudgetMs` injected so the repair gate (§4.6) can be
 * exercised deterministically without real timers. `runExtractionJob` (the `after()`
 * entry point) computes the real remaining budget from `Date.now()` against the route's
 * own deadline and calls this.
 */
export async function extractSession(
  images: VisionImage[],
  kindsPresent: Set<ScreenKind>,
  remainingBudgetMs: number,
): Promise<ExtractOutcome> {
  const schema = makeExtractedSessionSchema(kindsPresent)

  let primary
  try {
    primary = await callVision(images, { timeoutMs: Math.min(PRIMARY_TIMEOUT_MS, remainingBudgetMs) })
  } catch (cause) {
    // §1: the token-floor trip NEVER attempts a repair — resending the same request
    // shape to the same misbehaving endpoint would fail identically.
    if (cause instanceof VisionTokenFloorError) {
      return { status: 'failed', session: null, errorCode: 'token_floor', promptTokens: cause.promptTokens, rawVendorResponse: null }
    }
    if (cause instanceof VisionTransportError) {
      return { status: 'failed', session: null, errorCode: 'transport', promptTokens: null, rawVendorResponse: null }
    }
    throw cause // genuinely unexpected — surfaces as a 500 from runExtractionJob's caller, logged loudly
  }

  const parsedJson = extractJsonObject(primary.text)
  const firstAttempt = parsedJson ? schema.safeParse(parsedJson) : { success: false as const, error: null }

  if (firstAttempt.success) {
    return { status: 'ok', session: firstAttempt.data, errorCode: null, promptTokens: primary.promptTokens, rawVendorResponse: primary.raw }
  }

  // ── One repair round-trip, budget-gated (§4.6) ──────────────────────────────────
  const truncated = primary.finishReason === 'length'
  const budgetLeft = remainingBudgetMs - PRIMARY_TIMEOUT_MS
  if (truncated || budgetLeft < MIN_REPAIR_BUDGET_MS) {
    // Truncated JSON would truncate identically on retry (same max_tokens); not worth a
    // round-trip. Insufficient budget: starting a call we can't finish risks the whole
    // invocation dying mid-flight (§4.5) instead of failing cleanly now.
    return { status: 'failed', session: null, errorCode: 'validation', promptTokens: primary.promptTokens, rawVendorResponse: primary.raw }
  }

  const issues = describeZodIssues(firstAttempt.error, parsedJson)
  let repair
  try {
    repair = await callVision(images, {
      timeoutMs: Math.min(REPAIR_TIMEOUT_MS, budgetLeft),
      priorMessages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: buildExtractionUserContent(images) },
        { role: 'assistant', content: primary.text },
      ],
      repairNote:
        'Your last reply did not match the required JSON shape or had invalid values. ' +
        'Reply again with ONLY the corrected JSON object, same shape as before. ' +
        'Problems found:\n' + issues,
    })
  } catch (cause) {
    // A repair call can ALSO trip the token floor or a transport error — same handling.
    if (cause instanceof VisionTokenFloorError) {
      return { status: 'failed', session: null, errorCode: 'token_floor', promptTokens: cause.promptTokens, rawVendorResponse: null }
    }
    return { status: 'failed', session: null, errorCode: 'transport', promptTokens: primary.promptTokens, rawVendorResponse: primary.raw }
  }

  const repairedJson = extractJsonObject(repair.text)
  const repairedAttempt = repairedJson ? schema.safeParse(repairedJson) : { success: false as const }
  if (repairedAttempt.success) {
    return { status: 'repaired', session: repairedAttempt.data, errorCode: null, promptTokens: repair.promptTokens, rawVendorResponse: repair.raw }
  }

  // ── Fail to manual entry (§8.1) ──────────────────────────────────────────────────
  return { status: 'failed', session: null, errorCode: 'validation', promptTokens: repair.promptTokens, rawVendorResponse: repair.raw }
}
```

### 8.1 "Fail to manual entry" — reconciling with the roadmap's non-goals

The roadmap's non-goals list explicitly excludes "manual run entry as a primary flow… no UI
ships" for v0.1.0. Read narrowly, that appears to conflict with this brief's instruction to
"fail to manual entry." **It does not, once "manual entry" is read correctly**: F05's review
screen already owns per-field correction of every extracted value (roadmap §4, F05's row: "the
correction screen"). **A `failed` extraction is handed to that exact same review screen, with
every field null instead of populated.** There is no second UI to build — the fallback *is* the
review screen, degraded to its empty state. This satisfies the instruction ("the user is never
hard-blocked; they can always get a run into the system by hand") without violating the
non-goal ("no *dedicated* manual-entry flow ships") — the review-and-correct screen was always
going to have to handle "the model got a field wrong," and "the model got every field wrong (or
didn't run at all)" is the same code path at the limit, not a new one.

**Practical implication for F05:** its review screen must render sensibly when
`GET /api/extract/[id]` returns `status: 'failed'`, `session: null`. F05's contract with F04 is:
render an all-blank, all-required-fields-empty form in that case, pre-filled with nothing but
still backed by the same `extractionId` for provenance (`runs.extraction_id` still points at the
failed attempt — an honest record that this run's data is 100% human-entered, not model-derived).

---

## 9. Data written — `extractions` rows

No schema changes to §4.3 of the roadmap are needed; F04 uses exactly the columns already
specified there. The convention this plan adds (not a migration) is the **shape stored inside
the two jsonb columns**:

```ts
// extractions.blob_urls — set once, at insert, from the upload payload
type BlobUrlsColumn = Array<{ url: string; pathname: string; kind: 'summary' | 'splits' | 'heartrate' }>

// extractions.raw_response — set once, at completion (ok/repaired/failed)
type RawResponseColumn = {
  vendor: unknown          // the exact JSON body the endpoint returned (primary call, or repair call if one happened)
  parsedSession: ExtractedSession | null   // the Zod-validated result GET reads back, so it never re-parses vendor text
  attempts: 1 | 2          // 1 = ok on first try, 2 = repair was needed (redundant with status='repaired' but cheap and explicit)
}
```

Storing `parsedSession` pre-validated (rather than re-running Zod on every poll) keeps
`GET /api/extract/[id]` a pure read — it never re-executes extraction logic, never re-imports
the schema module with a fresh `kindsPresent` set, and can never disagree with what was actually
written at completion time.

---

## 10. `/upload` screen and the upload flow

```
1. User picks 1-3 images (native file input, accept="image/*")
2. Each becomes a tile with:
     - thumbnail preview
     - a kind selector, defaulted by pick order (1st=Summary, 2nd=Splits, 3rd=Heart Rate),
       always overridable (§5.3)
     - a progress indicator through: compressing -> uploading -> done
3. compressForExtraction() runs client-side per image (§3.1) — 560w/q80 JPEG, in a Web Worker
4. Vercel Blob client upload: upload() from @vercel/blob/client -> POST /api/upload
     (mirrors expense-tracking's handshake: onBeforeGenerateToken authenticates and mints a
     token scoped to this user with a signed tokenPayload carrying {userId, kind};
     onUploadCompleted is a production-only safety net, never the primary writer locally)
5. "Analyse" button enabled once all tiles report done. On tap:
     POST /api/extract  { images: [{ url, pathname, kind }, ...] }
     -> 202 { extractionId }
6. Navigate to a pending/skeleton screen that polls GET /api/extract/[extractionId] (§4.4)
7. On a terminal status, hand off to F05:
     - ok / repaired  -> /r/new/review?extractionId=... with the parsed session
     - failed          -> the same review route, session omitted (all-blank form, §8.1)
```

`POST /api/upload`'s token-mint step (`onBeforeGenerateToken`) is a direct structural port of
`expense-tracking/app/api/photos/upload/route.ts`: authenticate first (a redirect to an HTML
sign-in page is a terrible answer to a `fetch()` call, so use the bare `getUserId()`-style check
that throws rather than redirects), constrain the client-chosen pathname with a regex,
`allowedContentTypes: ['image/jpeg']` only (compression always outputs JPEG), and carry `kind`
through the signed `tokenPayload` so a server-to-server webhook retry can't be spoofed into
claiming a different kind than what the authenticated upload session actually declared.

---

## Contract deltas

**None.** Every table, column, env var, and route this plan needs already exists in
`ROADMAP_v0.1.0.md` §4:

- `extractions` (§4.3) already has `blob_urls jsonb`, `prompt_tokens int`, `status text`,
  `error_code text`, `raw_response jsonb`, `corrections jsonb` — exactly what §9 above needs,
  used as intended (D3's "the canary, stored" is literally `extractions.prompt_tokens`).
- `run_photos.kind` (§4.3) already has the `'summary'|'splits'|'heartrate'|'other'` enum this
  plan's `ScreenKind` mirrors (F04 only ever produces the first three; `'other'` is F05/user
  territory for photos that end up attached to a run without feeding extraction).
- `LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */` / `LLM_VISION_BASE_URL` / `LLM_VISION_MODEL` (§4.1) are already specified,
  already pointed at the coding endpoint, already separate from the narrative model's env group.
- Routes `/upload`, `/api/upload`, `/api/extract`, `/api/extract/[id]` (§4.8) are already listed
  with the exact responsibilities this plan implements.

The only additions in this document are **conventions within existing jsonb columns** (§9) and
**a client-side default-assignment rule for `run_photos.kind` equivalent data pre-run-creation**
(§5.3) — neither changes a contract, both are implementation choices this plan is the correct
place to pin down so F05 doesn't have to guess them.

---

## 11. Task breakdown

1. **`lib/llm/prompts/extraction.ts`** — `EXTRACTION_SYSTEM_PROMPT`, `EXTRACTION_SHAPE`,
   `buildExtractionUserContent()` exactly as in §6.
2. **`lib/schema/extractedSession.ts`** — `ExtractedSplit`, `ExtractedZone`,
   `ExtractedPostWorkoutHr`, `RawExtractedSession`, `FIELD_OWNERSHIP`,
   `makeExtractedSessionSchema()` exactly as in §5.2. Unit tests: every truth-fixture field
   round-trips; a screen-absent case forces the right fields to null/[] regardless of what raw
   input claims.
3. **`lib/llm/extractJson.ts`** — port `research/score.mjs`'s `extractJson()` fence-stripping
   regex verbatim (it is already proven against real model output); add a wrapper name,
   `extractJsonObject`, that also returns `null` on malformed JSON rather than throwing.
4. **`lib/llm/vision.ts`** — `callVisionWithFetch`, `callVision`, `VisionTokenFloorError`,
   `VisionTransportError` exactly as in §7. The token-floor guard (§1) ships in this task and
   is not deferred or simplified for a later pass.
5. **Token-floor guard tests** (`lib/llm/__tests__/vision.test.ts`) — the three tests in §1
   verbatim (drop signature throws; real-image cost passes; per-image scaling with 2 images).
   These must exist and pass before Task 6 begins; they are the regression guard for the
   highest-value code in the feature.
6. **Verify the field-ownership assumption** (§5.2's `FIELD_OWNERSHIP` comment) against the
   actual three screenshots in the image cache directory referenced there. Correct the table if
   `avgHrBpm`/`maxHrBpm`/`restingHrBpm` are laid out differently than assumed.
7. **`lib/llm/extract.ts`** — `extractSession()` exactly as in §8, including the budget-gated
   repair (§4.6) and the token-floor-skips-repair rule (§1).
8. **`extractSession` unit tests** (mocked `callVision`, no network) — covers: first-try success
   (`ok`); Zod failure then successful repair (`repaired`); Zod failure, repair also fails
   (`failed`/`validation`); `VisionTokenFloorError` on the primary call skips repair entirely
   (`failed`/`token_floor`, and assert the repair mock was never called); truncated
   (`finish_reason: 'length'`) skips repair; insufficient remaining budget skips repair.
9. **`lib/db/extractions.ts`** — `insertPendingExtraction`, `updateExtraction`, `getExtraction`
   (with ownership check baked in — a user must never fetch another user's extraction by
   guessing an id), matching the jsonb conventions in §9.
10. **`POST /api/extract` route** — request validation (`ExtractRequestSchema`: 1–3
    `{url, pathname, kind}` entries, kinds from `ScreenKind`, no duplicate kinds), insert
    `pending` row, `after(() => runExtractionJob(...))`, `export const maxDuration = 60`,
    return 202 immediately, exactly as in §4.2.
11. **`runExtractionJob`** — fetches the Blob URLs server-side, re-encodes as data URIs, calls
    `extractSession` with the real remaining-budget computation, writes the terminal
    `extractions` row per §9's shape.
12. **`GET /api/extract/[id]` route** — ownership check, stale-pending self-heal exactly as in
    §4.5, returns the client-shaped status/session/errorCode.
13. **`lib/photos/compressForExtraction.ts`** — the width-vs-long-edge-corrected compressor
    exactly as in §3.1. Unit test: feed a synthetic portrait image, assert
    `Math.min(outWidth, outHeight) === 560 ± 5`. This test is what would have caught the bug
    the module exists to prevent — it is not optional.
14. **`/api/upload` route** — port `expense-tracking/app/api/photos/upload/route.ts`'s handshake
    structure; swap `groupId` ownership logic for nothing (no run exists yet at upload time,
    per §9's design — ownership is just "this authenticated user"), carry `kind` through the
    signed token payload.
15. **`/upload` page + components** — file picker, per-tile kind selector (default by order,
    §5.3), compression + upload progress per tile, "Analyse" gate, exactly the flow in §10.
16. **Polling hook** (`useExtractionStatus(extractionId)`) — the backoff schedule in §4.4
    (2s → 3s after 4 attempts → 5s after 10, cap 5s), the 90s client give-up in §4.4.
17. **Pending/skeleton screen** — shown while polling; a static, honest "reading your
    screenshots…" message, no fake progress bar (nothing to meaningfully show progress of).
18. **Hand-off contract to F05** — document (in this file's own §8.1, done) and in code (a
    typed `ExtractionResult` returned from the polling hook: `{status, session, errorCode}`)
    exactly what F05's review screen receives for each terminal status, including the
    all-blank-form case for `failed`.
19. **Measure real repair-round-trip latency** once Task 7 exists: run a live, tagged test
    (`test:live:vision:repair`, not part of default CI) that deliberately corrupts one field
    of a real extraction to force a repair, and record the actual latency. Tighten §4.6's
    designed (not measured) budget numbers against this real data; update this document's §4.6
    table if the numbers move materially.
20. **Re-validate the labelled prompt (§6) against `research/score.mjs`** before shipping: run
    the production prompt (with per-image kind labels) through the full 3-image canonical
    fixture and confirm 108/108 is preserved with the added rules 8–9. If it regresses, the
    labels are wrong, not the underlying proven prompt — revert to closer wording from
    `research/schema.mjs`'s `SYSTEM`/`SHAPE` and iterate.
21. **Commit the golden regression fixture** — `research/fixtures/golden-response.json`: the
    raw vendor `choices[0].message.content` from one real, scored 108/108 run of the exact
    production prompt (from Task 20), plus its `usage`. This is the offline artifact CI scores
    against — no live API call on every PR (§12 below).
22. **Wire `research/score.mjs` into CI** (roadmap D13, §4.9) — a Vitest test that imports
    `score()`/`TRUTH` from `research/score.mjs`/`research/schema.mjs`, feeds it the committed
    golden fixture's parsed content, and asserts `pass === total` (108/108). Fails the build if
    it drops below 108/108 — this is F04's regression test, not merely a nice-to-have script.
23. **Tagged live suite** (`test:live:vision`, mirroring `expense-tracking`'s `test:live`
    pattern) — actually calls `glm-4.6v` against the three real screenshots and asserts
    108/108, `prompt_tokens` in the 3000–3600 range (§3's measured 3277 ± margin), and median
    latency under ~40s across 3 consecutive runs. Not run on every PR; run manually or on a
    schedule, because it costs money and can flake on vendor availability (§1.2's
    `glm-4.6v-flash` overload note is a reminder this vendor's uptime is not guaranteed).
24. **CI env-hygiene assertion** — `grep -rE 'LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */' app/ components/` must return
    empty (mirrors the roadmap's `OPENROUTER_API_KEY` grep pattern, §4.1) to catch an accidental
    client-side leak of the vision key.
25. **`/dev/extract` harness (optional, recommended)** — a dev-only page that runs the full
    pipeline against the canonical fixture images with one click, showing the score and timing
    inline, for fast local iteration on the prompt without going through the upload UI each
    time. Not shipped to production (guard behind `NODE_ENV !== 'production'`).

---

## 12. Verification — acceptance criteria

All of the following must be true before F04 is considered done. Numbers are the measured
findings from `IMPLEMENTATION_PLAN.md` §1, restated here as the bar this implementation must
clear — not new numbers invented for this plan.

| # | Criterion | Source |
|---|---|---|
| 1 | Offline regression (`score.mjs` against the committed golden fixture) scores **108/108**, every PR, no live call | §1.3, Task 22 |
| 2 | Tagged live suite scores **108/108 across ≥3 consecutive runs** against the real 3-image fixture | §1.3 measured 5/5; Task 23 |
| 3 | `VisionTokenFloorError` fires on a mocked `prompt_tokens: 141` response and the fabricated content is provably never parsed | §1, Task 5 |
| 4 | `VisionTokenFloorError` does NOT fire on a mocked `prompt_tokens: 3277` (the measured real cost for 3 images at 560w/q80) | §1.4, Task 5 |
| 5 | Request body sent to the vision endpoint contains `thinking: { type: 'disabled' }` on every call, asserted by inspecting the captured fetch body in a test | §1.3 | 
| 6 | A 3-image extraction issues exactly **one** `fetch` call to the vision endpoint (never 3 parallel calls) | §2.1 |
| 7 | Compressed upload output has `min(width, height) === 560 ± 5px` — proves the long-edge trap (§3.1) did not regress | §3, Task 13 |
| 8 | Compressed upload output is JPEG at approximately q80 (visually/byte-size sanity: ~50-60KB per image, not the ~270KB a q100/uncompressed JPEG would produce) | §3 measured 170KB/3 images |
| 9 | `extractions.status` lifecycle test suite covers all of `pending→ok`, `pending→repaired`, `pending→failed` (each of `token_floor`/`transport`/`validation`/`stale_timeout`) | §4.3, §4.5 |
| 10 | A `pending` row older than 90s flips to `failed`/`stale_timeout` on the next `GET`, without any cron | §4.5 |
| 11 | A response missing a field the prompt asked for (simulating z.ai's measured `required`-non-enforcement, §1.6) is caught by Zod and does not crash the route; it either repairs successfully or reaches `failed`/`validation` cleanly | §5.1 |
| 12 | With only `summary`+`splits` uploaded, the returned `ExtractedSession` has `hrZones: []`, `postWorkoutHr: []`, `maxHrBpm: null`, `restingHrBpm: null` **even if the mocked model response populates them** | §5.2, §5.3 |
| 13 | On `status: 'failed'`, the object handed to F05 has `session: null` and F05's review contract renders an all-blank, fully editable form keyed to the same `extractionId` | §8.1 |
| 14 | `grep -rE 'LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */' app/ components/` is empty in CI | Task 24, mirrors roadmap §4.1 |
| 15 | Worst-case designed budget (primary timeout + repair timeout + overhead) stays under 60s in the repair-attempted path; verified against real measured repair latency once Task 19 lands, and this document's §4.6 table updated to match | §4.6 |
| 16 | `POST /api/extract` returns within ~500ms (the client never waits for the 33.7s extraction) | §4.1, §4.2 |

Anything that fails item 1 or item 3 blocks merge outright — those two are, respectively, the
regression test for the entire feature's reason to exist and the guard for the single most
expensive failure mode measured against this vendor.
