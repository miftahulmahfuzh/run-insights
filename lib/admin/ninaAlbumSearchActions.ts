'use server'

import type {
  AdminSearchHit,
  AdminSearchMode,
  AdminSearchResult,
} from '@/lib/admin/ninaAlbumActions'
import { ninaAlbumSearchSchema } from '@/lib/admin/ninaAlbumSearchSchema'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { describeSubjectForSide } from '@/lib/nina/album'
import { embedNinaText } from '@/lib/nina/embedding'
import {
  searchNinaPhotosByImageCaption,
  searchNinaPhotosByText,
  searchNinaPhotosByTextAndCaption,
  type NinaPhotoSearchRow,
} from '@/lib/nina/queries'
import {
  describeNinaImagesWithFallback,
  NinaVisionTokenFloorError,
  NinaVisionTransportError,
} from '@/lib/nina/vision'

/**
 * **The album's semantic search, as one Server Action.** R2 (text), R3 (image), R4 (both), server
 * side.
 *
 * ── THE SHAPE OF THE ANSWER TO "SEARCH BY IMAGE" ────────────────────────────────────────────
 * There is no image-embedding model in this app's arsenal, so an uploaded query photo is CAPTIONED
 * first — `describeNinaImagesWithFallback`, the same z.ai-then-OpenRouter `glm-4.6v` path that
 * wrote every album row's `description` — and the caption is then embedded and searched exactly as
 * typed text is. Which means the whole feature is one comparison, run against one column, and R4's
 * "resolve the scoring" is a weighted average of two numbers that were always comparable
 * (`lib/nina/queries/avatarsearch.ts`).
 *
 * ── THE QUERY IMAGE IS NEVER STORED ─────────────────────────────────────────────────────────
 * No Blob PUT, no row, no cleanup. `describeNinaImagesWithFallback` takes a
 * `NinaDescribeImage { dataUri }` directly — only `describeNinaImages` needs a hosted URL, and only
 * because it is fetching bytes this action already has. A comparison input that lives for one
 * request has no business in a store that a reaper then has to learn about.
 *
 * ── `subject: 'self'`, AND IT IS NOT A DETAIL ───────────────────────────────────────────────
 * Every `nina_avatars.description` in the corpus was written by `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`
 * (`describeNinaAvatarAction`, `scheduleDescribe` — both pass `describeSubjectForSide('hers')`).
 * Captioning the QUERY image with the runner prompt instead would produce a paragraph in a
 * different register, hunting for a man who is not in the frame, and cosine similarity would then
 * be measuring prompt style as much as content. The query must be described by the same witness
 * that described the corpus, so this action calls the same mapping rather than spelling `'self'`.
 *
 * ── NO `revalidatePath`, AND NO WRITE OF ANY KIND ───────────────────────────────────────────
 * This is the layer's only READ action. It stores nothing, changes nothing, and must not
 * invalidate the album route — a search that re-rendered the grid underneath its own results is a
 * search that fights the screen it is on.
 *
 * ── IT IS AWAITED, AND THAT IS CORRECT ──────────────────────────────────────────────────────
 * Two model calls on the request path, deliberately: the operator pressed Search and there is
 * nothing to show until they return. The non-blocking rule is about RENDER paths; a Server Action
 * fired from a click is exactly where an expensive call belongs.
 */

/* `AdminSearchHit`, `AdminSearchResult` and `AdminSearchMode` are declared on the plain barrel
 * (`lib/admin/ninaAlbumActions.ts`) and imported above, beside the rule that forces it: a
 * `'use server'` module may export only async functions, and phase 4 imports the hit type by name
 * in three files. `AdminActionResult` already lives there for the same reason. */

/**
 * The three-way branch, as one function so the caller needs no `NinaAvatarSearchPage` annotation
 * and therefore no `import type` from the query layer (see `AdminSearchHit`'s note).
 *
 * The throw is unreachable: `ninaAlbumSearchSchema`'s refine guarantees at least one arm. It is a
 * throw rather than an empty page because a silent empty result here would look exactly like "the
 * album has nothing like that", which is the one wrong answer this function could give.
 *
 * `typed` rides along beside the embeddings — `nina-album-search-relevance-tools` R2 follow-up —
 * so the data layer can check a row's hand-written negative keywords against the actual words the
 * operator typed, not the vector they became. It is `null` on the image-only arm for the same
 * reason `searchNinaAvatarsByImageCaption` never receives it: a vision-model caption is not
 * something the operator typed.
 */
async function runSearch(
  userId: string,
  textEmbedding: number[] | null,
  captionEmbedding: number[] | null,
  typed: string | null,
) {
  if (textEmbedding !== null && captionEmbedding !== null) {
    return searchNinaPhotosByTextAndCaption(userId, textEmbedding, captionEmbedding, typed)
  }
  if (textEmbedding !== null) return searchNinaPhotosByText(userId, textEmbedding, typed)
  if (captionEmbedding !== null) return searchNinaPhotosByImageCaption(userId, captionEmbedding)
  throw new Error('searchNinaAvatarsAction: no query arm — the schema should have refused this')
}

/**
 * One ranked row, narrowed for the browser — for EITHER collection.
 *
 * ── ONE MAPPER AND NOT TWO, BECAUSE THE QUERY LAYER ALREADY RESOLVED THE DIFFERENCES ────────
 * `media-album-unified-search` R1. A media row has no folder, no framing, no thumbnail and can
 * never be her current face, and `lib/nina/queries/avatarsearch.ts`'s `rankMedia` fills each of
 * those with `MediaExplorerPhoto`'s own documented constant (`''`, three NULLs, `null`, `false`)
 * rather than leaving the convention to be re-invented here. So this stays the field-for-field
 * narrowing it has always been, plus `origin` and the two keyword columns.
 *
 * `filename: row.filename ?? row.id` is unchanged and now does double duty: a media row carries
 * `null` (that table has no filename column) and therefore prints its id, which is a truthful
 * name. The Media view's nicer date-and-id form is built in `app/admin/nina/page.tsx` and is the
 * UI phase's to reuse here if it wants it.
 */
function toHit(row: NinaPhotoSearchRow): AdminSearchHit {
  return {
    origin: row.origin,
    id: row.id,
    url: row.blobUrl,
    thumbUrl: row.thumbUrl,
    folder: row.folder,
    filename: row.filename ?? row.id,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    isCurrent: row.isCurrent,
    description: row.description,
    searchKeywords: row.searchKeywords,
    negativeSearchKeywords: row.negativeSearchKeywords,
    crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
    createdAt: row.createdAt.toISOString(),
    score: row.score,
  }
}

/**
 * **Search the whole collection — album AND media.** `{ text?, imageDataUri? }` in, a ranked
 * top-48 out, every physical photograph at most once.
 *
 * `requireAdmin()` is line 1 and the `userId` it returns is the only one any statement below sees —
 * the action never reads an id from its own argument, so a hand-crafted POST cannot search someone
 * else's album (plan invariant 3).
 *
 * Failure is always the same shape: `ok: false`, an operator-readable sentence, `hits: []`,
 * `searched: 0`. The vendor layers have already written their own `nina_error_logs` rows by the
 * time an error reaches here (`recordDescribeFailure` for the caption, `embedNinaText`'s own
 * logging for the vectors), so this catch reports rather than re-logs — the posture
 * `describeNinaAvatarAction` takes.
 */
export async function searchNinaAvatarsAction(input: unknown): Promise<AdminSearchResult> {
  const { userId } = await requireAdmin()

  const parsed = ninaAlbumSearchSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Type something to look for, or add a photo to match against.',
      hits: [],
      searched: 0,
      mode: 'text',
    }
  }

  const typed = parsed.data.text != null && parsed.data.text.length > 0 ? parsed.data.text : null
  const imageDataUri = parsed.data.imageDataUri ?? null
  const mode: AdminSearchMode =
    typed !== null && imageDataUri !== null ? 'both' : typed !== null ? 'text' : 'image'

  try {
    /* The caption first and on its own await: the embeddings below need it, and running it beside
     * them would mean embedding a caption that does not exist yet. */
    const caption =
      imageDataUri === null
        ? null
        : (
            await describeNinaImagesWithFallback(fetch, [{ dataUri: imageDataUri }], {
              subject: describeSubjectForSide('hers'),
              userId,
            })
          ).description

    /* The two embed calls are independent, so they go together. On a combined search that is one
     * round trip's latency instead of two.
     *
     * `{ userId }` is passed because phase 1's contract asks for it in as many words — it is the
     * `user_id` on the `nina_error_logs` row `embedNinaText` writes before it throws, and a failure
     * row that cannot say whose search produced it is a row nobody can act on. */
    const [textEmbedding, captionEmbedding] = await Promise.all([
      typed === null ? null : embedNinaText(typed, { userId }),
      caption === null ? null : embedNinaText(caption, { userId }),
    ])

    const page = await runSearch(userId, textEmbedding, captionEmbedding, typed)

    return {
      ok: true,
      mode,
      searched: page.total,
      hits: page.rows.map(toHit),
      ...(caption === null ? {} : { caption }),
    }
  } catch (cause) {
    /* The vision classes are the ONE failure worth its own sentence: it names the half of the query
     * the operator can actually change, and a token-floor refusal in particular means the photo
     * reached the model as too little to believe — a different photo fixes it, a retry does not. */
    const photoFailed =
      cause instanceof NinaVisionTokenFloorError || cause instanceof NinaVisionTransportError
    console.error('[album-search] search failed', cause)
    return {
      ok: false,
      error: photoFailed
        ? 'Could not read that photo. Try a different one, or search by text.'
        : 'The search could not run. Try again.',
      hits: [],
      searched: 0,
      mode,
    }
  }
}
