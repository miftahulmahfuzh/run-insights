'use server'

import { and, desc, eq, ilike } from 'drizzle-orm'

import { requireUserId } from '@/lib/auth/requireUserId'
import { jakartaDayOf } from '@/lib/date/ranges'
import { db } from '@/lib/db'
import { ninaChatSessions, ninaMessages } from '@/lib/db/schema'
import { formatDay } from '@/lib/format'
import {
  SEARCH_RESULT_MAX,
  SEMANTIC_RECENCY_WINDOW,
  TEXT_CANDIDATE_MAX,
  applySemanticRanking,
  buildSemanticCandidates,
  emptySearchResponse,
  likePattern,
  normalizeSearchQuery,
  rankTextHits,
  searchTerms,
  shouldRunSearch,
  shouldRunSemantic,
  type NinaSearchCandidate,
  type NinaSearchMode,
  type NinaSearchResponse,
} from './search'
import { rankNinaSearchHits } from './semantic'

/**
 * R6's search, as one Server Action.
 *
 * ── WHY AN ACTION AND NOT A ROUTE HANDLER ─────────────────────────────────────────────────────
 * D7 fixes the route-handler list at `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]` and
 * `/api/cron/*`; everything else is a Server Action. This one writes nothing, but it does reach a
 * model, and `lib/nina/actions.ts` already establishes the shape for that.
 *
 * ── WHY THE QUERY IS HERE AND NOT IN `lib/nina/queries.ts` ────────────────────────────────────
 * Two reasons, and the first is the binding one. `lib/nina/search.ts` is imported by a **client**
 * component, so it cannot reach `db` — invariant 7 and `lib/nina/reply.ts`'s stated rule. And
 * phase 1 owns `lib/nina/queries.ts` §4; this set's whole concurrency discipline is that two phases
 * never want the same file, because a shared git index across concurrent sessions has already
 * destroyed committed work on this repo once. So the narrowing lives here, as a private
 * non-exported helper, which is exactly `lib/nina/actions.ts`'s shape for `scheduleDistillation`.
 *
 * `searchNinaChats` is the ONLY export, so this module surfaces exactly one endpoint.
 *
 * ── INVARIANT 3, PROVED TWICE ─────────────────────────────────────────────────────────────────
 * `requireUserId()` first, and then `user_id = $1` on **both** tables. The foreign key proves that
 * a session exists, not that it is his — the distinction `insertNinaMessageImages` spells out, and
 * the reason it runs an extra statement of its own. Nothing here takes an id from the client, so
 * there is nothing to forge: the input is a string of text and a boolean.
 *
 * ── INVARIANT 5, STRUCTURALLY ─────────────────────────────────────────────────────────────────
 * `nina_message_images` is not named in this file. There is no projection that could carry
 * `description`, so there is no path by which `glm-4.6v`'s private prose reaches a component. The
 * visible consequence is that an image-only message has empty `text` and can never be a hit, which
 * is also why a result row can never be blank.
 *
 * ── INVARIANT 4, WHICH IS WHY `day` IS A SENTENCE ─────────────────────────────────────────────
 * `formatDay(jakartaDayOf(sentAt))` runs HERE, on the server, through the one module that owns
 * every rendered string. A client component formatting an instant is the classic hydration
 * mismatch: the server's timezone is UTC and the phone's is not, and the codebase says so in three
 * places. `NinaSearchField` receives sentences and imports no formatter.
 */

/** A row as the two message statements project it. Structural; the pure layer never sees it. */
interface MessageCandidateRow {
  messageId: string
  seq: number
  role: string
  text: string
  createdAt: Date
  sessionId: string | null
  sessionTitle: string | null
}

function toMessageCandidate(row: MessageCandidateRow): NinaSearchCandidate {
  return {
    kind: 'message',
    /* A message whose session is somehow NULL still opens the chat — `?s=` simply carries an empty
       value and phase 3's degradation rules decide what that means. Dropping the hit instead would
       hide a real message from a search that claims to cover all of them. */
    sessionId: row.sessionId ?? '',
    sessionTitle: row.sessionTitle ?? '',
    messageId: row.messageId,
    seq: row.seq,
    /* `'runner'` is him and `'nina'` is her (never `user`/`assistant`). Narrowed structurally, the
       same way `app/nina/page.tsx` does it, so the pure module never learns a column's spelling. */
    mine: row.role !== 'nina',
    text: row.text,
    day: formatDay(jakartaDayOf(row.createdAt)),
  }
}

/**
 * The candidate-narrowing SQL. Three statements at most, two round trips at most.
 *
 * `ILIKE '%term%'` and not `to_tsvector`, and the reasoning is worth keeping next to the code: the
 * corpus is mixed Indonesian and English, `to_tsvector` takes exactly one `regconfig`, so any
 * choice silently mis-stems half the conversation; `to_tsquery` matches lexemes, so `lari` would not
 * find `berlari`, which is a bug report; and `user_id = $1` already reduces the scan to one
 * runner's messages, which the prompt layer itself counts in hundreds. **The known limit:** this
 * does not scale to a six-figure conversation, and the fix is `to_tsvector` plus a GIN index — a
 * schema change phase 1 owns and this phase may not make. It is a stated handoff.
 *
 * `leftJoin` and not `innerJoin`, with `sessionTitle` tolerated as `null`: phase 1 decides whether
 * `session_id` is nullable, and this phase must be correct either way. An inner join would silently
 * drop a message whose session is NULL from a search that promises to cover every chat.
 *
 * The join predicate carries `ninaChatSessions.userId` as well as the id, so ownership is proved on
 * both sides of it rather than inferred from the foreign key.
 *
 * The recency statement runs only in semantic mode, and it is where the round trip goes from one to
 * two. That is a fair trade against a call that is about to spend up to 8 s in a model.
 */
async function narrowSearchCandidates(
  userId: string,
  terms: readonly string[],
  wantSemantic: boolean,
): Promise<{
  sessions: NinaSearchCandidate[]
  textMatches: NinaSearchCandidate[]
  recent: NinaSearchCandidate[]
}> {
  const titleWhere = and(
    eq(ninaChatSessions.userId, userId),
    ...terms.map((term) => ilike(ninaChatSessions.title, likePattern(term))),
  )

  const messageWhere = and(
    eq(ninaMessages.userId, userId),
    ...terms.map((term) => ilike(ninaMessages.text, likePattern(term))),
  )

  const sessionOwned = and(
    eq(ninaMessages.sessionId, ninaChatSessions.id),
    eq(ninaChatSessions.userId, userId),
  )

  const messageProjection = {
    messageId: ninaMessages.id,
    seq: ninaMessages.seq,
    role: ninaMessages.role,
    text: ninaMessages.text,
    createdAt: ninaMessages.sentAt,
    sessionId: ninaMessages.sessionId,
    sessionTitle: ninaChatSessions.title,
  }

  const [[sessionRows, messageRows], recentRows] = await Promise.all([
    db.batch([
      db
        .select({ sessionId: ninaChatSessions.id, title: ninaChatSessions.title })
        .from(ninaChatSessions)
        .where(titleWhere)
        .limit(SEARCH_RESULT_MAX),

      db
        .select(messageProjection)
        .from(ninaMessages)
        .leftJoin(ninaChatSessions, sessionOwned)
        .where(messageWhere)
        .orderBy(desc(ninaMessages.seq))
        .limit(TEXT_CANDIDATE_MAX),
    ]),

    wantSemantic
      ? db
          .select(messageProjection)
          .from(ninaMessages)
          .leftJoin(ninaChatSessions, sessionOwned)
          .where(eq(ninaMessages.userId, userId))
          .orderBy(desc(ninaMessages.seq))
          .limit(SEMANTIC_RECENCY_WINDOW)
      : Promise.resolve([] as MessageCandidateRow[]),
  ])

  return {
    sessions: sessionRows.map((row) => ({
      kind: 'session' as const,
      sessionId: row.sessionId,
      sessionTitle: row.title ?? '',
      messageId: null,
      /* Zero, so a title hit never competes with a message on recency. Its `SESSION_HIT_BONUS`
         already puts it above every message; the seq only has to be deterministic. */
      seq: 0,
      mine: false,
      text: row.title ?? '',
      /* A session is not an instant, so it gets no day. Nothing renders one for a title hit. */
      day: '',
    })),
    textMatches: messageRows.map(toMessageCandidate),
    recent: recentRows.map(toMessageCandidate),
  }
}

/**
 * Search every chat. Text always; a `glm-5.3` ranking pass on top when the toggle is on and the
 * query is long enough to be a concept.
 *
 * **The response always carries the text ranking as its fallback**, so one call does both jobs and
 * there is never a second round trip from the field. `requested` versus `mode` is how the UI knows
 * to say that the ranking degraded.
 *
 * Every input is re-validated here even though the caller is our own component: a Server Action is
 * an untrusted POST endpoint (`lib/nina/actions.ts`'s point 3). `normalizeSearchQuery` takes
 * `unknown`, so a client that sends a number, an object or nothing at all gets an empty query
 * rather than a stack trace.
 */
export async function searchNinaChats(input: {
  query: string
  semantic: boolean
}): Promise<NinaSearchResponse> {
  const userId = await requireUserId()

  const requested: NinaSearchMode = input?.semantic === true ? 'semantic' : 'text'
  const query = normalizeSearchQuery(input?.query)
  if (!shouldRunSearch(query)) return emptySearchResponse(requested)

  const terms = searchTerms(query)
  if (terms.length === 0) return emptySearchResponse(requested)

  const wantSemantic = shouldRunSemantic(query, requested === 'semantic')
  const { sessions, textMatches, recent } = await narrowSearchCandidates(
    userId,
    terms,
    wantSemantic,
  )

  const hits = rankTextHits([...sessions, ...textMatches], terms)
  /* The SQL cap, surfaced honestly: at the cap, "nothing else matched" is a claim we cannot make. */
  const capped = textMatches.length >= TEXT_CANDIDATE_MAX

  if (!wantSemantic) return { requested, mode: 'text', hits, capped }

  const candidates = buildSemanticCandidates(sessions, textMatches, recent)
  const order = await rankNinaSearchHits({ query, candidates })
  /* `null` is transport failure, a `max_tokens` cut, an unparseable body, or a model that judged
     nothing relevant. All four degrade to the text ranking, and the field says the ranking
     degraded — see `lib/nina/semantic.ts`'s header for why silence is the wrong answer here. */
  if (order === null) return { requested, mode: 'text', hits, capped }

  return {
    requested,
    mode: 'semantic',
    hits: applySemanticRanking(candidates, order, terms),
    capped,
  }
}
