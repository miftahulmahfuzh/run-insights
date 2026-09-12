/**
 * **OpenRouter's CHAT surface, and the one model Nina falls back to.** Two constants, no imports.
 *
 * ── WHY A FILE OF ITS OWN ─────────────────────────────────────────────────────────────────────
 * Two unrelated call paths need the same two values: the vision/describe fallback
 * (`lib/nina/vision.ts`, this plan set's phase 3) and the text-chat fallback
 * (`lib/nina/llmFallbackText.ts`, phase 2). Declaring them twice is how a model id and an endpoint
 * drift apart — RULING A6's rule, the same one that keeps `NINA_BLOB_PREFIX` in exactly one place.
 * A vision module is the wrong home for a text client's model id and vice versa, so neither owns
 * them: this file does.
 *
 * ── ZERO IMPORTS, ON PURPOSE ──────────────────────────────────────────────────────────────────
 * Same rule and same reason as `imagerecipe.ts` and `imagefail.ts`: a constants module with no
 * imports can be read by anything, including a `node --experimental-strip-types` script, without
 * dragging `server-only` or a database client in behind it. There is no secret here — the API KEY
 * is read through `ninaEnv()` at the call site, which is what `ci:openrouter-guard` checks for.
 *
 * ── NOT ENV VARS ──────────────────────────────────────────────────────────────────────────────
 * There is no `OPENROUTER_BASE_URL` and no `OPENROUTER_MODEL` in `lib/env.ts` and this phase does
 * not add one. `lib/nina/imagerecipe.ts` already hardcodes both halves for the image path
 * (`OPENROUTER_IMAGE_URL`, `NINA_IMAGE_MODEL`) and that is the convention being followed. A
 * fallback model an operator can point anywhere is a fallback nobody can reason about.
 */

/** OpenRouter's OpenAI-Chat-Completions endpoint. The image path's sibling of `/images/generations`. */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * **The one fallback model, for BOTH the text chat and the photo-description call.**
 *
 * Chosen because it is natively multimodal — text, image and video in, text out, per
 * `openrouter.ai/z-ai/glm-5.3-flash` — unlike the text-only `glm-5.2`/`glm-5.3`. That single
 * property is what lets one constant serve phase 2's Anthropic-shaped text turn and phase 3's
 * OpenAI-shaped describe call: the describe call sends an `image_url` part and this model accepts
 * one.
 *
 * It is deliberately the same *family* as the primary z.ai model but a DIFFERENT ROUTE. The
 * 2026-09-11 22:29–00:12 UTC outage that motivated this work was an 11-in-a-row failure streak on
 * one z.ai coding-plan subscription, not a model defect — so a different path to a comparable model
 * is exactly the right shape of redundancy.
 */
export const NINA_FALLBACK_TEXT_MODEL = 'z-ai/glm-5.3-flash'
