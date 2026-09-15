/**
 * **What an album photograph's vector is computed FROM** — one function, so no two runtimes can
 * disagree about it. `nina-album-search-relevance-tools` R2.
 *
 * ── WHY IT IS NOT INSIDE `embedNinaAvatarDescription` ───────────────────────────────────────
 * That function is still the one place an album vector is MADE, and this does not change it: it
 * calls this and then calls `embedNinaText`. What moved out is the string, because three callers
 * in three runtimes need the identical bytes — the app's deferred describe pass, the one-off
 * backfill script, and the `/search-analysis` diagnostic. A second spelling of the join would
 * embed a text the app never embeds, and the corpus would end up half in one space and half in
 * another with no error anywhere. `lib/db/schema/nina/avatars.ts`'s header names that failure mode
 * for the model id; it is the same failure mode for the input text.
 *
 * ── ZERO IMPORTS, AND THAT IS A CONTRACT ────────────────────────────────────────────────────
 * `lib/id.ts`'s rule, restated: *"it exists to be importable from Vitest, from `research/*.mjs`
 * and from a Route Handler alike, with nothing to resolve."* `scripts/` reaches this module as
 * `../lib/nina/avatarEmbedText.ts` under `node --experimental-strip-types`
 * (`scripts/backfill-record-keys.mjs`'s precedent), which works only while stripping the types
 * leaves no runtime dependency and no `@/` alias behind. Do not add an import here.
 *
 * ── THE SHAPE, AND WHY IT IS THIS SHAPE ─────────────────────────────────────────────────────
 * A BLANK LINE and a labelled line, not a comma-append. Embedding models weight a coherent
 * paragraph differently from a bag of words, and appending `", tete, putih"` to the last sentence
 * of a description reads to the model as part of that sentence — the phrases would inherit its
 * subject. A blank line and a label is the plainest way to say "these are separate, and they are
 * keywords", using an English word the model has seen a great many times in exactly that role.
 *
 * Nothing is parsed. The user's requirement is free text — *"bentuk nya sama dengan existing image
 * description (free text), cuma bentuk nya kumpulan phrase dipisah dengan koma"* — so the commas
 * are a human's convention and not a grammar this function enforces. It does not split, sort,
 * de-duplicate or re-punctuate. What the operator typed is what the model reads.
 */

/** The join. Exported so a test asserts the literal rather than re-typing it. */
export const NINA_AVATAR_KEYWORDS_PREFIX = '\n\nKeywords: '

/**
 * The description, or the description followed by a labelled keyword line.
 *
 * `null`, `''` and an all-whitespace string are ONE case — "no keywords" — and all three answer the
 * description unchanged. That is what makes every vector computed before this column existed still
 * correct: an untagged row re-embeds to the identical text and therefore the identical vector.
 *
 * The description is returned untrimmed and unaltered; `clampEmbedInput` (`lib/nina/embedding.ts`)
 * owns trimming and the 8 000-character ceiling, and owning it twice is how the two disagree.
 */
export function buildNinaAvatarEmbedText(
  description: string,
  searchKeywords: string | null,
): string {
  const keywords = searchKeywords?.trim() ?? ''
  if (keywords.length === 0) return description
  return `${description}${NINA_AVATAR_KEYWORDS_PREFIX}${keywords}`
}
