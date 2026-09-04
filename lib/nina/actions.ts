'use server'

import { requireUserId } from '@/lib/auth/requireUserId'

import { dbNinaSourceGateway, dbNinaToolGateway } from './gateway'
import { loadNinaContext } from './load'
import { insertNinaMessages } from './queries'
import { MAX_RUNNER_MESSAGE_CHARS, type NinaMemoryWrite } from './schema'
import { runNinaTurn } from './turn'

/**
 * **The one entry point phase 4 calls, from exactly one place: `ChatScreen.handleSend`.**
 *
 * ── WHY AN ACTION AND NOT A ROUTE HANDLER ─────────────────────────────────────────────────────
 * D7 fixes the route-handler list at `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]` and
 * `/api/cron/*`, and says Server Actions carry every other mutation. A chat turn writes up to
 * five rows, so it is a mutation, so it is an action — the identical reasoning
 * `lib/insights/actions.ts` states in its own header.
 *
 * ── THREE THINGS FROM NEXT 16.3.1's OWN GUIDES, EACH SHAPING THE CODE BELOW ───────────────────
 * (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`.)
 *
 *  1. **Actions dispatch sequentially per client.** Next runs one at a time; a second `handleSend`
 *     waits for the first. That is exactly the ordering a conversation needs — and it means this
 *     action must never be the thing a client-side `Promise.all` tries to parallelise.
 *  2. **This action deliberately calls NO revalidation.** The guide: *"An action that does none of
 *     the above carries only its return value, and the current route is not re-rendered."* That is
 *     what we want. Phase 4 renders the returned bubbles into client state behind its staggered
 *     reveal (RU-5); a `revalidatePath('/nina')` would re-render the server component in the same
 *     response and race the reveal with a full list that already contains the un-revealed bubbles.
 *  3. **Every action is an untrusted POST endpoint.** `requireUserId()` first, input validated,
 *     return value shaped to what the UI renders. The `replyToMessageId` the *model* produced is
 *     re-checked against rows this user owns before it becomes a foreign key — a well-formed id is
 *     not proof of ownership.
 *
 * ── THE WRITE ORDER IS PART OF THE CONTRACT ───────────────────────────────────────────────────
 * The runner's message is persisted BEFORE the model is called, and there are two reasons, not
 * one. The obvious one is that a 45 s turn that fails must not lose what he typed — phase 4's
 * "your message is saved" copy is a claim about this ordering. The second is subtler and would
 * bite silently: `loadNinaContext` reads the conversation window out of `nina_messages`, so a
 * message not yet written is a message SHE CANNOT SEE. Insert first, then build the context, and
 * the turn she answers includes the thing she is answering.
 *
 * ── NOTHING HERE THROWS FOR A MODEL PROBLEM ───────────────────────────────────────────────────
 * `runNinaTurn`'s contract. `unavailable: true` with an empty `bubbles` array is the honest
 * answer, and phase 4's screen says she is not replying right now. `ok` is about THE REQUEST —
 * false means it could not be carried out at all (empty input, oversized input, a failed write) —
 * and `unavailable` is about HER. `ok: true, unavailable: true` is the normal degraded turn: his
 * message is safely stored and she did not answer.
 */
export interface SentBubble {
  /** The `nina_messages` row id. Phase 7 quotes it; phase 4 keys its list on it. */
  id: string
  /**
   * The bubble text. Named `body` because this return type is a **DTO**, and `body` is the DTO
   * spelling all the way down: phase 1's `NinaMessageRow.body`, phase 4's destructure, phase 6's
   * `row.body`. The *column* is `text` and phase 2's prompt-layer `MessageInput` is `text` too;
   * `lib/nina/gateway.ts` is the one place those meet (RULING A1). Nobody "fixes" either side to
   * match the other.
   */
  body: string
  /* Phase 7 adds `replyToId: string | null` here — it already edits this file, and it needs her
   * own quote to render on the optimistic reveal rather than only on the next server render. */
}

export interface SendNinaMessageResult {
  ok: boolean
  userMessageId: string | null
  /**
   * **At most four, guaranteed by `NinaSendPayloadSchema`'s `.max(MAX_BUBBLES)` rather than by a
   * slice here** — so phase 4's `REVEAL_MAX_BUBBLES` assumption is a property of the type, not of
   * a call this function promises to remember to make. Empty iff `unavailable`.
   */
  bubbles: SentBubble[]
  unavailable: boolean
}

const REFUSED: SendNinaMessageResult = {
  ok: false,
  userMessageId: null,
  bubbles: [],
  unavailable: false,
}

/**
 * ── THE ARGUMENT OBJECT IS THE SHAPE FOUR LATER PHASES CONVERGE ON ────────────────────────────
 * One object, agreed up front, each later phase adding exactly one optional field in its own
 * commit — phases 6 (`imageTickets`), 7 (`replyToMessageId`), 8 (`runId`) and 13
 * (`attachExisting`). Both 7 and 8 asked for this in their own plans, and the alternative is four
 * rewrites of this head, which is four merge conflicts and four chances to drop a field.
 *
 * The final signature and the final refusal rule (RULING B1):
 *
 *     sendNinaMessage(input: {
 *       body: string
 *       imageTickets?: readonly string[]                            // phase 6
 *       replyToMessageId?: string | null                            // phase 7
 *       runId?: string | null                                       // phase 8
 *       attachExisting?: { kind: 'avatar' | 'image'; id: string } | null   // phase 13
 *     })
 *
 *     const hasAttachment =
 *       (input.imageTickets?.length ?? 0) > 0 ||   // phase 6
 *       input.runId != null ||                      // phase 8
 *       input.attachExisting != null                // phase 13
 *     if (input.body.trim() === '' && !hasAttachment) return refuse('empty')
 *
 * **At THIS phase's landing only `body` exists**, so that is all this signature carries and the
 * rule degenerates to `text.length === 0`. `hasAttachment` has no terms yet and is therefore not
 * written yet — a `false` constant with three commented-out clauses is worse than nothing. Phase
 * 7's field takes no clause: answering a message is not a substitute for saying something.
 */
export async function sendNinaMessage(input: { body: string }): Promise<SendNinaMessageResult> {
  const userId = await requireUserId()

  const text = typeof input?.body === 'string' ? input.body.trim() : ''
  /*
   * Both refusals are silent by design. An empty send is a stray Enter key, and an oversized one
   * is a paste of a whole article — neither is worth a persisted row or a 45 s model call, and
   * neither is an error the runner needs explained. The framework's own 1 MB action-body cap sits
   * behind this as the backstop.
   *
   * The rule is MONOTONE: every later phase adds a disjunct, none edits one, and the tree is green
   * at each boundary (RU-11).
   */
  if (text.length === 0 || text.length > MAX_RUNNER_MESSAGE_CHARS) return REFUSED

  /*
   * STEP 1 — his message, first. See the header.
   *
   * `insertNinaMessages` is a BATCH and takes no `seq`: `nina_messages.seq` is a `bigserial`
   * assigned by Postgres (phase 1's D-2), which makes it a total order over the whole conversation
   * rather than a within-turn index this file would have to maintain. The DTO field is **`body`**,
   * not `text` — that is `queries.ts`'s spelling for every message-writing and message-reading
   * function it has, because they all go through one shared `messageColumns` projection.
   */
  let runnerMessageId: string
  try {
    const [row] = await insertNinaMessages(userId, [{ role: 'runner', body: text }])
    if (row == null) throw new Error('insertNinaMessages returned no row')
    runnerMessageId = row.id
  } catch (cause) {
    console.warn('[nina] could not persist the runner message', { error: String(cause) })
    return REFUSED
  }

  /*
   * STEP 2 — the two reads, concurrently. `loadNinaContext` reads the recent-20 window and
   * `loadRunHistory` reads the whole reviewed history; both are one `db.batch` over the same
   * bounded table, and running them together makes the duplication cost one round trip of wall
   * clock instead of two. `getReviewedRunsWithChildren` therefore runs twice per turn, which is
   * ACCEPTED at this size: ~200 rows a year, one user. The clean fix is one optional parameter on
   * `loadNinaContext` — phase 2's file — and it should move together with `lib/insights/load.ts`
   * and `recomputeRecords`, in one card, because all three re-read the same history and all three
   * stop being fine at the same moment.
   */
  const [context, history] = await Promise.all([
    loadNinaContext(userId, dbNinaSourceGateway),
    dbNinaToolGateway.loadRunHistory(userId),
  ])

  /* STEP 3 — the turn. 13–45 s. Never throws for a model problem. */
  const result = await runNinaTurn({
    userId,
    context,
    history,
    sourceMessageId: runnerMessageId,
    runnerText: text,
  })

  if (result.payload == null) {
    return { ok: true, userMessageId: runnerMessageId, bubbles: [], unavailable: true }
  }

  /*
   * STEP 4 — `replyToMessageId`, re-checked against rows this user owns. The model produced this
   * id, and a well-formed id is not proof of ownership (the Server Actions guide's own warning).
   * The context window she was given is the authoritative list of what she could legitimately be
   * answering, so it is also the cheapest check — no extra query. Phase 7 owns the quote UI; this
   * is only the column being populated honestly from day one.
   */
  const ownedIds = new Set(context.conversation.window.map((turn) => turn.id))
  const replyToId =
    result.payload.replyToMessageId != null && ownedIds.has(result.payload.replyToMessageId)
      ? result.payload.replyToMessageId
      : null

  /*
   * STEP 5 — one row per bubble (RU-5), in ONE multi-row `INSERT`.
   *
   * ── WHY THIS IS A BATCH AND WHY THAT MAKES THE ORDER A DATABASE FACT ─────────────────────────
   * This file's draft wrote four sequential single inserts carrying `seq: 0..n-1`, and reasoned
   * about the ordering of concurrent writes. None of that is needed and none of it is allowed:
   * `seq` is a `bigserial` and Postgres assigns it, so nothing here supplies one. **Emission order
   * comes free**, because Postgres evaluates `nextval` once per row in `VALUES` order — the first
   * bubble gets the lower `seq`, always, and `insertNinaMessages` returns the rows in that same
   * order with their ids and `seq` already on them. So phase 4's reveal keys on an array order the
   * database itself produced, not on a convention this loop remembered to honour.
   *
   * It is also one round trip instead of four, and — the part that actually matters — it is
   * **atomic**: the half-written four-bubble reply the `catch` below exists for can no longer
   * happen from a partial insert. It can still happen from a failed statement, which is why the
   * `catch` stays.
   *
   * `replyToId` goes on the FIRST bubble only. A four-bubble reply is one answer to one message,
   * and quoting the same message four times would render four identical quote headers.
   */
  const bubbles: SentBubble[] = []
  try {
    const rows = await insertNinaMessages(
      userId,
      result.payload.bubbles.map((body, index) => ({
        role: 'nina' as const,
        body,
        replyToId: index === 0 ? replyToId : null,
      })),
    )
    for (const row of rows) bubbles.push({ id: row.id, body: row.body })
  } catch (cause) {
    console.warn('[nina] could not persist her reply', { error: String(cause) })
    /* His message IS stored; the batch either landed whole or not at all. `ok: false` tells phase
     * 4 to reload the conversation from the server rather than trust this return value — cheaper
     * than reasoning about which of the two states it is in. */
    return { ok: false, userMessageId: runnerMessageId, bubbles: [], unavailable: false }
  }

  /*
   * STEP 6 — the memory writes she rode along with the reply (ruling b). LAST, and in its own
   * `try`: a fact that failed to save must never cost a reply that succeeded. Phase 5 replaces
   * the INTERPRETATION here — vocabulary, contradictions, the nickname, distillation from the
   * whole turn — and inherits these same two gateway methods, so there is one write path.
   */
  await applyMemoryWrites(userId, result.payload.memoryWrites, runnerMessageId)

  return { ok: true, userMessageId: runnerMessageId, bubbles, unavailable: false }
}

async function applyMemoryWrites(
  userId: string,
  writes: readonly NinaMemoryWrite[] | undefined,
  sourceMessageId: string,
): Promise<void> {
  if (writes == null || writes.length === 0) return
  for (const write of writes) {
    try {
      if (write.kind === 'slot' && write.slotKey != null) {
        await dbNinaToolGateway.saveMemorySlot(userId, { key: write.slotKey, value: write.text })
      } else {
        /* A `slot` write with no `slotKey` degrades to a ledger append rather than being dropped.
         * The fact is real either way; only where it belongs is unclear, and phase 5's
         * distillation is the thing that can promote it later. */
        await dbNinaToolGateway.appendMemoryFact(userId, { text: write.text, sourceMessageId })
      }
    } catch (cause) {
      console.warn('[nina] memory write failed', { kind: write.kind, error: String(cause) })
    }
  }
}
