import { desc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaErrorLogs, type NinaErrorCategory, type NinaErrorLog } from '@/lib/db/schema'
import { newId } from '@/lib/id'

/**
 * The write and read sides of `nina_error_logs` — every model call Nina made that FAILED.
 *
 * ── WHY THIS IS NOT IN `lib/nina/queries.ts` ─────────────────────────────────────────────────
 * That module's contract, stated in `lib/db/schema.ts`'s F33 header, is the CONVERSATION: every
 * function there is ownership-scoped (`userId` first) because every row it touches belongs to a
 * runner and may not leak across accounts. This table is neither — it is an operator's diagnostic
 * log, read by `/admin/error-logs` with no per-user filter at all, and adding the first unscoped
 * read to `queries.ts` would blunt the one rule that makes that file safe to read at a glance.
 * The `user_id` column still exists — a failure belongs to whoever's turn it was, and the cascade
 * must take those rows with the account — but it is NULLABLE, because two of the three writing
 * seams genuinely have no runner in hand at the point of failure. See the table's own header.
 *
 * ── EVERY WRITE IS BEST-EFFORT, BY CONSTRUCTION ──────────────────────────────────────────────
 * `logNinaError` cannot throw. It is called from inside the catch blocks of the very calls it
 * records, and a log that cannot be written must not cost a reply that can — the rule
 * `runNinaTurn` already states over `deps.store.record` (`lib/nina/turn.ts`), spelled the same
 * way here: one try/catch, one `console.warn`, no rethrow.
 */

/**
 * The per-column character ceiling, and it is a STORAGE GUARD, not the contract.
 *
 * R2 asks for the FULL input and the FULL error message, and 64 000 characters is far past any
 * real one: a text turn's assembled body runs to a few tens of kilobytes, a z.ai error body to a
 * few hundred bytes. What the clamp actually stops is a caller that JSON-stringifies a request
 * body with a base64 `data:` image still inside it — which the vision path's `toDataUri` makes
 * one careless line away — turning a log row into a multi-megabyte insert over the Neon HTTP
 * driver. Callers must not send base64; this is what happens when one does anyway.
 */
export const NINA_ERROR_LOG_TEXT_MAX = 64_000

/**
 * How many failures `/admin/error-logs` renders per page — the DEFAULT and the CEILING, so a
 * hand-edited `?limit=` cannot turn one page into an unpaginated read. Same construction as
 * `NINA_ADMIN_PAGE_SIZE` in `lib/nina/album.ts`, and a much smaller number for one reason: this
 * list ships the full input and the full error text with every row, because phase 5's popup is a
 * read-only dialog over props rather than a second round trip. Twenty-five rows of a few tens of
 * kilobytes is a few hundred kilobytes of RSC payload — smaller than the 48-original photo grid
 * `NINA_CHAT_PHOTO_PAGE_SIZE` already ships, and bounded above by `NINA_ERROR_LOG_TEXT_MAX`.
 */
export const NINA_ERROR_LOG_PAGE_SIZE = 25

/** Everything one failed attempt needs to be diagnosable later. One call = one row. */
export interface NinaErrorLogWrite {
  category: NinaErrorCategory
  /**
   * Whose turn it was, when the caller knows. **Optional and nullable**: the text fallback client
   * (phase 2) sits behind an interface that carries no user, and the vision describe path (phase 3)
   * never has one. Omitted or `null` stores NULL, which reads as "not attributable to one runner".
   */
  userId?: string | null
  /** `'zai'` | `'openrouter'` today. Free text — see the table's header. */
  provider: string
  /** The model id ACTUALLY attempted. A fallback attempt names the fallback model. */
  model: string
  /** The request payload actually sent, stringified. Never a base64 image. */
  fullInput: string
  /** The raw stringified cause or HTTP error body. Never a summarised code. */
  errorMessage: string
  /** The ceiling configured for THIS attempt, in ms. Omit when the caller has none. */
  timeoutMs?: number | null
  /** Blob URL of the INPUT image, when the call had one. Never a generated output. */
  imageUrl?: string | null
}

/** One page of one tab. `total` is a second statement — see `NinaAvatarFolderPage`'s note. */
export interface NinaErrorLogPage {
  rows: NinaErrorLog[]
  total: number
}

/** The projection, spelled out rather than `select().from()` — `avatarColumns`' convention. */
const errorLogColumns = {
  id: ninaErrorLogs.id,
  userId: ninaErrorLogs.userId,
  category: ninaErrorLogs.category,
  provider: ninaErrorLogs.provider,
  model: ninaErrorLogs.model,
  fullInput: ninaErrorLogs.fullInput,
  errorMessage: ninaErrorLogs.errorMessage,
  timeoutMs: ninaErrorLogs.timeoutMs,
  imageUrl: ninaErrorLogs.imageUrl,
  createdAt: ninaErrorLogs.createdAt,
}

/**
 * Truncate to `NINA_ERROR_LOG_TEXT_MAX`, saying so in the stored text rather than silently.
 * Exported because the schema test asserts the ceiling is real and not aspirational.
 */
export function clampNinaErrorText(text: string): string {
  if (text.length <= NINA_ERROR_LOG_TEXT_MAX) return text
  const dropped = text.length - NINA_ERROR_LOG_TEXT_MAX
  return `${text.slice(0, NINA_ERROR_LOG_TEXT_MAX)}\n[truncated ${dropped} more characters]`
}

/**
 * Record one failed attempt. **Never throws, never rejects** — the caller is already in a catch
 * block and is about to decide the fate of a turn; this must not be able to change that decision.
 *
 * Await it rather than firing and forgetting: on Vercel an un-awaited promise inside `after()`
 * can be dropped before it flushes, and awaiting costs nothing here because this cannot reject.
 */
export async function logNinaError(entry: NinaErrorLogWrite): Promise<void> {
  try {
    await db.insert(ninaErrorLogs).values({
      id: newId(),
      /* `?? null` and not `entry.userId`: the field is optional, and drizzle would otherwise omit
       * the column from the INSERT rather than sending NULL for it. */
      userId: entry.userId ?? null,
      category: entry.category,
      provider: entry.provider,
      model: entry.model,
      fullInput: clampNinaErrorText(entry.fullInput),
      errorMessage: clampNinaErrorText(entry.errorMessage),
      timeoutMs: entry.timeoutMs ?? null,
      imageUrl: entry.imageUrl ?? null,
    })
  } catch (cause) {
    console.warn('[nina] error log write failed', {
      category: entry.category,
      error: String(cause),
    })
  }
}

/**
 * One page of one tab, newest first. **Not ownership-scoped** — see the module header.
 *
 * `(created_at desc, id desc)` rather than `created_at` alone, so two failures written in the
 * same millisecond (a z.ai attempt and its OpenRouter retry, which is the common case) have a
 * stable order across two renders of the same `?page=`.
 *
 * `total` is a second statement rather than a `count(*) OVER ()` window, so an over-shot `?page=`
 * returns `rows: []` with a TRUTHFUL total instead of `0` — `NinaAvatarFolderPage`'s argument,
 * and what lets phase 5's empty-page branch offer "go to the first page" rather than claiming the
 * tab is empty.
 */
export async function listNinaErrorLogs(
  category: NinaErrorCategory,
  opts: { limit?: number; offset?: number } = {},
): Promise<NinaErrorLogPage> {
  const limit = Math.max(
    1,
    Math.min(opts.limit ?? NINA_ERROR_LOG_PAGE_SIZE, NINA_ERROR_LOG_PAGE_SIZE),
  )
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0))
  const scope = eq(ninaErrorLogs.category, category)

  const [rows, counted] = await Promise.all([
    db
      .select(errorLogColumns)
      .from(ninaErrorLogs)
      .where(scope)
      .orderBy(desc(ninaErrorLogs.createdAt), desc(ninaErrorLogs.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(ninaErrorLogs)
      .where(scope),
  ])

  return { rows, total: counted[0]?.total ?? 0 }
}

/**
 * One row by id, or `null`.
 *
 * It exists so that phase 5 has an escape hatch it can take WITHOUT editing this module: if the
 * full-text page payload turns out too heavy for a real tab, the page can drop to a summary list
 * and fetch the two long columns on popup-open through this. Nothing else needs it.
 */
export async function getNinaErrorLog(id: string): Promise<NinaErrorLog | null> {
  const rows = await db
    .select(errorLogColumns)
    .from(ninaErrorLogs)
    .where(eq(ninaErrorLogs.id, id))
    .limit(1)
  return rows[0] ?? null
}
