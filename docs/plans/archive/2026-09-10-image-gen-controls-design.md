# Design: image-generation controls — env quota, editable prompt template, model dropdowns

Date: 2026-09-10
Status: approved (user answered the two design forks in session; "y" on the whole)
Branch: `feature/image-gen-controls` (off `origin/main` @ `3a0f175`)

Four features from the user, in their words and resolved:

1. *"buat quota untuk image generation can be easily changed via vercel env. right now set it
   to 30 images"* — **the existing daily cap becomes env-tunable, default 30/day** (user chose
   "Daily, 30/day" over monthly and all-time).
2. *"tambahkan editable text field of the template prompt itself pada halaman admin -> Image
   generation"* — **block-token template** (user chose block tokens over value tokens and
   conditional markup), with the explicit requirement that *"admin tidak bisa merusak placeholder
   formatting yang diperlukan"*.
3. Image-model dropdown on `/admin/image-generation`: **Qwen Image 3** / **Qwen Image 3 Pro**,
   *"supaya admin ga perlu deploy ulang vercel kalo mau ganti LLM settings"*.
4. Text-model dropdown on `/admin/personality`: **GLM 5.3** / **GLM 5.3 Flash** — same purpose.

Both model options were verified live on 2026-09-10 against the exact endpoints the app calls:
`qwen/qwen-image-3` and `qwen/qwen-image-3-pro` both listed by OpenRouter's `/api/v1/images/models`;
`glm-5.3` and `glm-5.3-flash` both answered a 1-token POST on the Anthropic-compatible
`LLM_BASE_URL`. No id is guessed.

## A. Quota via Vercel env

- `lib/nina/imagerecipe.ts`: `NINA_IMAGE_DAILY_CAP` becomes the **fallback default, 30** (was a
  hardcoded 6). New `ninaImageDailyCap(): number` reads `process.env.NINA_IMAGE_DAILY_CAP` —
  integer, clamped 1..200, falls back to the constant on absent/garbage. The file keeps its
  zero-import property: `process.env` is a global, not an import (the `lib/share/origin.ts`
  precedent for an optional env read beside its fallback).
- Readers: `ninaImageQuotaLeft` (`lib/nina/imagejobs.ts`) and the capped sentence in
  `lib/admin/imageGenActions.ts` — the only two places the NUMBER reaches code or copy.
- No Vercel change is needed for today's value (the default IS 30); the env var exists so the
  number moves without a deploy.
- Cost framing the user accepted: ~$0.040 per generation ⇒ 30/day ≈ $1.20/day ≈ $36/month worst
  case, counting failed attempts, rolling at Jakarta midnight — all unchanged.

## B. The editable prompt template (block tokens)

- **Storage**: `nina_image_prefs.prompt_template text NOT NULL DEFAULT ''`. `''` = the shipped
  default template. Same table and read/write path as every other pref, so the template is read
  live at dispatch by all four `buildNinaImagePrompt` callers (chat selfie, avatar, admin test,
  admin preview) with no signature changes.
- **Vocabulary** — nine tokens, each expanding to its whole block INCLUDING its label, the line
  vanishing when the block is empty (today's omit-when-empty rule):
  `{{camera}} {{subject}} {{focus}} {{pose}} {{venue}} {{time}} {{scene}} {{mood}} {{notes}}`.
  Vocabulary, operator-facing descriptions, the default template string, the validator and
  `coerceNinaImageTemplate` live in `lib/nina/imageprefs.ts` (client-importable, zero imports) so
  the panel's legend cannot drift from what the assembler accepts. The token→block substitution
  map stays in `lib/nina/imagegen.ts`, typed `Record<NinaImageTemplateToken, …>` so a renamed
  token is a compile error, not a silently missing block.
- **Required tokens**: `{{camera}}`, `{{subject}}`, `{{scene}}`. Rationale: the subject block is
  PLAN INVARIANT 4 (nothing may remove the body canon); the camera block is the verified
  phone-photograph style; the scene is what the photograph is of. The other six are droppable by
  choice. Labels (`VENUE:`, `SCENE:`, …) are owned by the blocks and are NOT rewordable — that is
  the accepted trade for dangling-label impossibility.
- **Three protection layers**:
  1. *Save* — one pure validator shared by the Zod schema (`lib/admin/schema.ts`): an unknown
     `{{…}}` token, a stray `{`/`}`, or a missing required token REFUSES the save with a sentence
     naming the specific violation. The panel adds a token legend and a "Reset to default" button.
  2. *Build* — `buildNinaImagePrompt` renders through the stored template; a template that fails
     the same validator at render time (hand-run SQL is the only way one gets stored) degrades to
     the default template with a logged warning. Never throws, never ships a broken prompt.
  3. *Byte-identity* — the default template renders byte-identical to today's assembly (same
     collapse of 3+ newlines to the blank-line separator, same trims). The existing prompt test
     suite is left unchanged and is the proof.
- The length ladder, focus, wardrobe/venue/time/notes, reference and tuning all keep working
  unchanged — inside the blocks. The template owns the shell: order, presence, extra prose.

## C. Image-model dropdown

- `nina_image_prefs.model text NOT NULL DEFAULT 'qwen/qwen-image-3-pro'`, enum
  `{ 'qwen/qwen-image-3' | 'qwen/qwen-image-3-pro' }`. Vocabulary + coerce live beside the
  existing constant in `lib/nina/imagerecipe.ts` (`NINA_IMAGE_MODEL` remains the default).
- Threading mirrors `referenceUrl`: optional `NinaImageJobArgs.model` (jsonb, old rows read
  through a `ninaImageJobModel` normalizer that defaults), stamped on `nina_turns.model` at
  `openNinaImageJob`, passed to `buildImageRequestBody` (gains an optional `model` param default
  to the constant — byte-identity for callers passing nothing) by BOTH run hosts
  (`lib/nina/imagerun.ts` and `scripts/nina-image-worker.ts`), printed by `sidecarText`.
- Panel: a `<select>` committing on change, next to the picker. Hint states honestly that
  seed/resolution/aspect honoring was measured on Pro only — the Test button is the probe for the
  plain model (R11's stated purpose).
- Worker needs no env/alias changes: it imports `imagerecipe.ts` already.

## D. Text-model dropdown

- Storage: a new `app_settings` table (`key text PK`, `value text NOT NULL`, `updated_at`), one
  fixed row `text_model`. NOT a `nina_tuning` column, because `narrativeModel()` also feeds
  non-Nina text (insights rollup), and the user said *seluruh* text generation. Extraction is a
  VISION call (glm-4.6v) and is deliberately out of scope, as is the image model (feature C).
- `narrativeModel()` becomes async: one indexed PK SELECT on the settings row, falling back to
  `env.LLM_MODEL` when unset or unknown (unknown logs a warning). Its seven call sites —
  `lib/llm/narrate.ts`, `lib/nina/{caption,autotitle,distill,semantic}.ts`,
  `lib/nina/{turn,chatturn}.ts` — all add `await` inside already-async flows.
- Enum `{ 'glm-5.3' (default) | 'glm-5.3-flash' }`, declared in a new client-safe zero-import
  `lib/llm/catalog.ts` so the Personality panel reads the same list the resolver enforces.
- New server action on `/admin/personality` (`requireAdmin` → Zod enum → settings upsert →
  revalidate), dropdown rendered beside the character dials.

## Migration

ONE migration adds all three DB changes (`prompt_template`, `model`, `app_settings`) — additive
only, no data steps, safe against the one-production-database rule. Number checked against
`origin/main` at land time.

## Tests

- cap reader: parse/clamp/fallback; `NINA_IMAGE_DAILY_CAP <= 20` assertion replaced.
- template validator matrix: valid default; reorder; dropped optional block; unknown token;
  missing required; stray brace; over-length; coercion of garbage → `''`.
- template render: default byte-identity (existing suite untouched); custom template changes
  order/presence; invalid stored template degrades.
- model catalogs: enum membership, normalizer defaults on absent/unknown args,
  `buildImageRequestBody` model param.
- admin structural tests updated for the new fields/action allowlists.

## Out of scope

- Vision/extraction model selection (glm-4.6v stays fixed).
- Free-form model ids in the dropdowns — the vocabularies are closed; a new model is a code
  change plus (for image models) a probe, which is the repo's own discipline for a $0.04 call.
- Per-purpose or per-session model overrides.
