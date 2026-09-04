import type { NinaSlotValue } from '@/lib/db/schema'
import { buildNinaContext, type NinaContext } from '@/lib/nina/context'
import { indexRunsByDate } from '@/lib/nina/dates'
import { SEND_TOOL } from '@/lib/nina/prompts'
import { NINA_TUNING_DEFAULTS, type NinaTuning } from '@/lib/nina/tuning'
import {
  NINA_CORE_TOOL_SET,
  type NinaDetailedRunInput,
  type NinaRunHistory,
  type NinaToolGateway,
} from '@/lib/nina/tools'
import type { NinaLlmClientLike, NinaTurnDeps, NinaTurnRow, NinaTurnStore } from '@/lib/nina/turn'
import type Anthropic from '@anthropic-ai/sdk'

import { NINA_FIXTURE_TODAY, ninaFixtureInput } from './ninaContext'

/**
 * The seam fixtures. Phase 2 built the CONTEXT fixture; this file builds everything needed to
 * drive the LOOP: a scripted client, an in-memory tool gateway, and a recording turn store.
 *
 * ── THE SCRIPTED CLIENT RETURNS A QUEUE, NOT A FUNCTION OF ITS INPUT ─────────────────────────
 * `narrate.ts`'s tests hand back one measured body. A loop needs a SEQUENCE — tool call, then
 * reply — and asserting on the order of the requests is half the point of these tests, so every
 * body sent is recorded in `calls` for the test to inspect.
 */

export function ninaContextFixture(): NinaContext {
  return buildNinaContext(ninaFixtureInput())
}

/** `NinaRunInput` fixtures with splits attached, so the tool handlers have something to enrich. */
export function detailedRunsFixture(): NinaDetailedRunInput[] {
  return ninaFixtureInput().recentRuns.map((run) => ({
    ...run,
    splits: [
      { km: 1, timeSec: 427, paceSec: 427, hr: 148, cadence: 168, partial: false },
      { km: 2, timeSec: 433, paceSec: 433, hr: 155, cadence: 166, partial: false },
      { km: 3, timeSec: 190, paceSec: 452, hr: 159, cadence: 165, partial: true },
    ],
  }))
}

export function runHistoryFixture(runs = detailedRunsFixture()): NinaRunHistory {
  return {
    runs,
    index: indexRunsByDate(runs),
    splitsByRunId: new Map(runs.map((run) => [run.runId, run.splits])),
    zonesByRunId: new Map(runs.map((run) => [run.runId, run.metrics.zonePct])),
  }
}

/**
 * The default tuning, spreadably overridable. **The default and not a random setting**, because
 * the compatibility contract makes the defaults the thing every other test is implicitly
 * asserting against: a fixture that shipped a tuned Nina would make every unrelated turn test a
 * test of the tuning.
 *
 * Overriding a single trait needs the nested spread, which is deliberate — `traits` is a full
 * record and a partial one would be a tuning with holes in it:
 *
 *     ninaTuningFixture({ traits: { ...NINA_TUNING_DEFAULTS.traits, concerned: 100 } })
 */
export function ninaTuningFixture(overrides: Partial<NinaTuning> = {}): NinaTuning {
  return { ...NINA_TUNING_DEFAULTS, ...overrides }
}

export interface FakeToolGateway extends NinaToolGateway {
  /**
   * `value` is `NinaSlotValue` and not `string` because phase 5 widened
   * `NinaToolGateway.saveMemorySlot` to carry `pending_promises`' structured value. The recorder
   * has to be at least as wide as the row it records; every assertion against it still compares a
   * plain string, because that is what phase 3's `save_memory` writes.
   */
  slots: Array<{ key: string; value: NinaSlotValue }>
  facts: Array<{ text: string; sourceMessageId: string | null }>
}

export function fakeToolGateway(history: NinaRunHistory = runHistoryFixture()): FakeToolGateway {
  const slots: Array<{ key: string; value: NinaSlotValue }> = []
  const facts: Array<{ text: string; sourceMessageId: string | null }> = []
  return {
    slots,
    facts,
    async loadRunHistory() {
      return history
    },
    async saveMemorySlot(_userId, row) {
      slots.push(row)
    },
    async appendMemoryFact(_userId, row) {
      facts.push(row)
    },
  }
}

export interface FakeTurnStore extends NinaTurnStore {
  rows: NinaTurnRow[]
}

export function fakeTurnStore(): FakeTurnStore {
  const rows: NinaTurnRow[] = []
  return {
    rows,
    async record(_userId, row) {
      rows.push(row)
    },
  }
}

/** A `tool_use` assistant message, as this endpoint returns one. */
export function toolUseMessage(name: string, input: unknown, id = `tu_${name}`): Anthropic.Message {
  return {
    id: 'msg_fake',
    type: 'message',
    role: 'assistant',
    model: 'glm-5.3',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [{ type: 'tool_use', id, name, input } as Anthropic.ToolUseBlock],
    usage: { input_tokens: 100, output_tokens: 50 },
  } as unknown as Anthropic.Message
}

/** A `send` reply. Pass a malformed `input` to drive the repair path. */
export function sendMessage(input: unknown): Anthropic.Message {
  return toolUseMessage(SEND_TOOL.name, input, 'tu_send')
}

/**
 * **The shape this endpoint ACTUALLY returned on round 1, 2026-09-03: a `thinking` block in slot
 * 0, the `tool_use` behind it, despite `thinking: { type: 'disabled' }` being sent.** Not a
 * hypothetical — it is a transcript. Every parse in `turn.ts` scans `content[]`, and this fixture
 * is what proves it: a slot-0 parser passes every other test in the suite and fails this one.
 */
export function withLeadingThinking(message: Anthropic.Message): Anthropic.Message {
  return {
    ...message,
    content: [
      { type: 'thinking', thinking: 'user asks about wednesday…', signature: '' },
      ...message.content,
    ],
  } as unknown as Anthropic.Message
}

/**
 * **The other thing this endpoint measurably does, 2026-09-04: prose, with no tool call at all,
 * despite `tool_choice: { type: 'any' }`.** Recorded on the call after a `tool_result`:
 * `stop_reason: 'end_turn'`, `content [thinking, text]`, her whole answer in the text block. The
 * loop must ask again with `send` forced rather than degrade — degrading throws away a reply she
 * already wrote. `thinking` sits in slot 0 here too, exactly as the transcript had it.
 */
export function proseMessage(text: string): Anthropic.Message {
  return {
    ...toolUseMessage('unused', {}),
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: 'he asked about two dates…', signature: '' },
      { type: 'text', text },
    ],
  } as unknown as Anthropic.Message
}

/** A turn that produced a `thinking` block and nothing else — there is no prose to echo back. */
export function thinkingOnlyMessage(): Anthropic.Message {
  return {
    ...toolUseMessage('unused', {}),
    stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: 'still deliberating…', signature: '' }],
  } as unknown as Anthropic.Message
}

/**
 * `stop_reason: 'max_tokens'` — the shape a turn whose ceiling was ENTIRELY eaten produces. Never
 * repaired: the same prompt at the same ceiling cuts at the same place.
 */
export function truncatedMessage(): Anthropic.Message {
  const message = sendMessage({ bubbles: ['half a th'] })
  return { ...message, stop_reason: 'max_tokens' } as Anthropic.Message
}

export interface ScriptedClient extends NinaLlmClientLike {
  calls: Anthropic.MessageCreateParamsNonStreaming[]
  timeouts: Array<number | undefined>
}

/**
 * Returns each queued message in turn. **Running off the end throws** — deliberately, because a
 * loop that made more calls than the test scripted is the bug the test exists to catch, and an
 * unhelpful default reply would hide it.
 */
export function scriptedClient(queue: Array<Anthropic.Message | Error>): ScriptedClient {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = []
  const timeouts: Array<number | undefined> = []
  let index = 0
  return {
    calls,
    timeouts,
    messages: {
      async create(body, options) {
        calls.push(body)
        timeouts.push(options?.timeout)
        const next = queue[index++]
        if (next == null) throw new Error(`scriptedClient: unexpected call #${index}`)
        if (next instanceof Error) throw next
        return next
      },
    },
  }
}

/** Deps wired to fakes, with a clock the test controls. */
export function fakeTurnDeps(
  client: NinaLlmClientLike,
  overrides: Partial<NinaTurnDeps> = {},
): NinaTurnDeps {
  return {
    client,
    model: 'glm-5.3',
    toolSet: NINA_CORE_TOOL_SET,
    gateway: fakeToolGateway(),
    store: null,
    ...overrides,
  }
}

/** A clock that advances by a fixed step on every read. `NINA_FIXTURE_TODAY` pins the calendar. */
export function steppingClock(startMs = 0, stepMs = 0): () => number {
  let value = startMs
  return () => {
    const current = value
    value += stepMs
    return current
  }
}

export { NINA_FIXTURE_TODAY }
