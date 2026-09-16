import type Anthropic from '@anthropic-ai/sdk'

/**
 * **Every tool Nina can call, as a constant. No logic, no I/O** — the same shape as
 * `lib/llm/prompts/narrate.ts`'s `REPORT_TOOL`, so a test can assert a schema without importing
 * the loop that sends it.
 *
 * ── THE PROPERTY DESCRIPTIONS ARE PART OF THE PROMPT, NOT DOCUMENTATION ──────────────────────
 * MEASURED against live `glm-5.3`, 2026-08-21 (`lib/llm/prompts/narrate.ts`):
 *
 *   · no descriptions                        ->  0 / 3 valid on the first attempt
 *   · a hard rule added to the SYSTEM prompt ->  1 / 4   (the prompt is the wrong lever)
 *   · descriptions on the properties         ->  5 / 6
 *
 * It cost 3 s and one whole extra model call per turn. Keep them, and keep them TERSE — one extra
 * clause on one description took the same schema back down to 2 / 4. `required` is documentation
 * and not enforcement: the same endpoint returned HTTP 200 for a call that omitted a required
 * field from every array entry, so `lib/nina/schema.ts` (phase 3) is what actually checks.
 *
 * ── A SCHEMA EDIT IS A PROMPT EDIT ───────────────────────────────────────────────────────────
 * "The prompt" means the system text AND these schemas. Bump `NINA_PROMPT_VERSION` by hand in the
 * same commit as any edit below.
 *
 * ── THE TWO TUNING DIALS THAT WERE PROPOSED FOR THIS FILE, AND WHY THEY ARE NOT HERE ─────────
 * The nina-character-tuning set (phase 3) proposed exactly two edits below: the verbosity dial on
 * `SEND_TOOL.input_schema.properties.bubbles.description`, and the photo-eagerness dial on
 * `GENERATE_IMAGE_TOOL.description`. **Both were declined. Neither description changed.** Four
 * reasons, in the order they decided it:
 *
 * 1. THE MEASUREMENT ABOVE IS THE WHOLE ARGUMENT. One extra clause on one description took the
 *    same schema from 5/6 to 2/4 valid on the first attempt. A description that varies with a
 *    slider is not one extra clause; it is a family of clauses, none of which can be measured
 *    before it ships, on an app with one user and no eval harness. The cost of getting it wrong is
 *    a dropped reply in her voice — the most expensive failure this feature has.
 * 2. THE VERBOSITY DIAL CANNOT MOVE WHAT THIS DESCRIPTION SAYS. `bubbles`' description states the
 *    CAP — `1-4` — and the cap is `minItems`/`maxItems` here plus `lib/nina/schema.ts`'s Zod.
 *    No slider may widen it. What the dial actually varies is the PREFERENCE, and the preference
 *    already lives in `OUTPUT_RULE` ("One bubble is the right answer more often than four"), where
 *    it has worked since F33 phase 2. The dial went where the sentence it changes already was.
 * 3. `GENERATE_IMAGE_TOOL`'s description states the OCCASIONS to call it — "when he asks, or when
 *    you promised one". Eagerness is a third occasion, which is precisely the "one extra clause"
 *    shape reason 1 measured. `prompts/system.ts`'s `── THE CAMERA ──` block carries it instead,
 *    and only when the dial is off its default.
 * 4. A DESCRIPTION THAT READS A TUNING MAKES `NINA_TOOLS` A BUILDER. It is a
 *    `readonly Anthropic.Tool[]` constant, and three module-level tool sets are derived from it at
 *    load — `NINA_CORE_TOOL_SET` (`lib/nina/tools.ts`), `NINA_CHAT_TOOL_SET`
 *    (`lib/nina/imagetools.ts`), `NINA_FULL_TOOL_SET` (`lib/nina/avatartools.ts`) — plus
 *    `NinaTurnDeps.toolSet` and the walk in `tests/nina.prompts.test.ts`. Per-turn tool sets are a
 *    five-file refactor across three owners, to carry two sentences that have a better home.
 *
 * THE COUNTER-ARGUMENT, STATED SO IT IS NOT LOST: the measurement above also says a hard rule in
 * the SYSTEM prompt scored 1/4 — *"the prompt is the wrong lever"*. It is, for FORMAT: for getting
 * a schema-valid tool call out of this endpoint, the descriptions are the lever and nothing else
 * is. Both dials here are CONTENT — how many bubbles she prefers, how readily she reaches for the
 * camera — and content is what the system prompt has always carried. The measurement does not
 * reach them.
 *
 * `NINA_PROMPT_VERSION` still went 2 -> 3 in that set, because `prompts/system.ts` changed shape.
 * Nothing in THIS file did.
 */

/**
 * **The output tool. She always answers with this** — never prose outside a tool call, which is
 * what makes a malformed reply a validation failure instead of a bubble containing an apology
 * about JSON.
 *
 * `bubbles` is `1..4` because RU-5 chose staggered multi-bubble over SSE: each bubble becomes a
 * real `nina_messages` row, revealed one at a time behind a typing indicator, and each is
 * independently reply-able. The cap is 4 because five is a monologue.
 *
 * `memoryWrites` is the CHEAP path — what he revealed in this turn, ridden along with the reply so
 * the common case costs no extra round trip. `SAVE_MEMORY_TOOL` is the explicit path, for a
 * correction she needs written before she says anything. Phase 5 owns what a `slotKey` may be.
 */
export const SEND_TOOL: Anthropic.Tool = {
  name: 'send',
  description: 'Send your reply. Always answer with this tool.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['bubbles'],
    properties: {
      bubbles: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        description: '1-4 chat messages, in the order he reads them. A line or two each.',
        items: {
          type: 'string',
          description: 'REQUIRED. One WhatsApp-length message, in your own voice.',
        },
      },
      replyToMessageId: {
        type: 'string',
        description: 'A conversation.window[].id you are answering, when it is not the last one.',
      },
      memoryWrites: {
        type: 'array',
        maxItems: 6,
        description: 'What he revealed about himself in THIS turn. Omit when he revealed nothing.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'text'],
          description: 'REQUIRED. One thing to remember about him.',
          properties: {
            kind: {
              type: 'string',
              enum: ['slot', 'fact'],
              description: 'REQUIRED. "slot" replaces a standing fact; "fact" appends a new one.',
            },
            slotKey: {
              type: 'string',
              description:
                'For kind "slot": which standing fact it replaces, e.g. usual_running_days.',
            },
            text: {
              type: 'string',
              description: 'REQUIRED. The fact in one plain English sentence.',
            },
          },
        },
      },
      /**
       * R1, the nina-natural-reminders set. **Inline, not a standalone tool**, for the reason
       * `memoryWrites` is inline and one sharper one: `lib/nina/turn.ts:946-954` drops sibling
       * `tool_use` blocks when a `send` is present, so a `set_reminder` tool would be dropped
       * exactly when she also replied — and cost a whole extra round trip when she did not.
       *
       * `timeOfDay`'s `pattern` is the JSON-Schema copy of `NINA_REMINDER_TIME_PATTERN`
       * (`lib/nina/schema.ts`), which is what VALIDATES; the copy exists because this module is a
       * constant with no imports but `type Anthropic`, and `tests/nina.prompts.test.ts` asserts the
       * two are equal so it cannot drift.
       */
      reminders: {
        type: 'array',
        maxItems: 4,
        description:
          'Daily check-ins he asked you to start, or asked you to stop. Omit when he asked for ' +
          'neither.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          description: 'REQUIRED. One reminder to start, or one to stop.',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'cancel'],
              description: 'REQUIRED. "create" starts a daily check-in; "cancel" stops one.',
            },
            id: {
              type: 'string',
              description: 'For "cancel": the id in memory.slots "reminders". To move one, cancel it and create it again.',
            },
            timeOfDay: {
              type: 'string',
              pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
              description: 'For "create": the Jakarta time he named, as HH:mm, e.g. "20:45".',
            },
            label: {
              type: 'string',
              description: 'For "create": what it is, two or three words, e.g. "tidur".',
            },
            message: {
              type: 'string',
              description: 'For "create": why HE said it matters. You say this back to him daily.',
            },
          },
        },
      },
    },
  },
}

/**
 * RU-13: **she emits ISO dates and the server validates them.** The alternative — handing her a
 * free-text date and parsing "tanggal 3 bulan ini" server-side — puts a second date parser in the
 * app, and this one has `now.todayISO` in front of it already.
 *
 * The `pattern` is advisory (see the `required` note above); `lib/nina/dates.ts` in phase 3 is
 * what actually validates, and it answers an explicit "no run that day" rather than an empty
 * object, so absence can never be read as a run with no numbers.
 */
export const LOOKUP_RUNS_TOOL: Anthropic.Tool = {
  name: 'lookup_runs',
  description: 'His runs on specific days. Use it whenever he names a day you do not already have.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['dates'],
    properties: {
      dates: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        description: 'REQUIRED. Calendar days as YYYY-MM-DD, worked out from now.todayISO.',
        items: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'REQUIRED. One day, YYYY-MM-DD.',
        },
      },
    },
  },
}

/**
 * R15's comparison, and it is a **precomputed** comparison. The tool returns differences already
 * worked out, never two run objects with an instruction to subtract — the whole point of the
 * boundary, restated at the one place a model would otherwise be handed two numbers and a minus
 * sign.
 */
export const COMPARE_RUNS_TOOL: Anthropic.Tool = {
  name: 'compare_runs',
  description: 'Compare two of his runs. Returns the differences already worked out for you.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['dateA', 'dateB'],
    properties: {
      dateA: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'REQUIRED. The first day, YYYY-MM-DD.',
      },
      dateB: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'REQUIRED. The second day, YYYY-MM-DD.',
      },
    },
  },
}

/**
 * **One SQL aggregate, one number** (R1) — the counterpart to `LOOKUP_RUNS_TOOL`, which caps at
 * five named days and returns every per-run fact for each. A question about a training BLOCK
 * ("rata-rata durasi lari gw 2 bulan terakhir") is not five days, and averaging a printed list of
 * rows in prose is exactly the arithmetic invariant 2 exists to refuse.
 *
 * `to` is INCLUSIVE, because that is what a model reasons in: "the last 2 months" ends today, and
 * today is a day he may have run. `handleAggregateRuns` converts it to the half-open upper bound
 * `lib/db/queries/rollups.ts` actually scans — the same translation `monthRange`/`isoWeekRange`
 * already perform for their own callers.
 *
 * The six `metric` values and five `agg` values are the JSON-Schema copy of
 * `NINA_AGGREGATE_METRICS`/`NINA_AGGREGATE_FNS` in `lib/nina/schema.ts`, which is what validates.
 * They are spelled here rather than imported because this module is a constant with no imports but
 * `type Anthropic` (see the header) — and `tests/nina.prompts.test.ts` asserts the two lists are
 * equal, so the copy cannot drift unnoticed.
 */
export const AGGREGATE_RUNS_TOOL: Anthropic.Tool = {
  name: 'aggregate_runs',
  description:
    'One number over a date range — average, total, fastest, slowest or count. Use it when he asks ' +
    'about a stretch of time rather than a day.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['metric', 'agg', 'from', 'to'],
    properties: {
      metric: {
        type: 'string',
        enum: ['durationSec', 'distanceM', 'avgPaceSec', 'avgHr', 'activeKcal', 'elevationM'],
        description: 'REQUIRED. Which number to work out.',
      },
      agg: {
        type: 'string',
        enum: ['avg', 'sum', 'min', 'max', 'count'],
        description: 'REQUIRED. How to combine it. "count" counts runs that have that reading.',
      },
      from: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'REQUIRED. First day of the range, YYYY-MM-DD, worked out from now.todayISO.',
      },
      to: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'REQUIRED. Last day of the range, YYYY-MM-DD. This day is included.',
      },
      intent: {
        type: 'string',
        enum: ['easy', 'tempo', 'long', 'race', 'unspecified'],
        description: 'Only count runs of this kind. Omit for all of them.',
      },
    },
  },
}

/** The explicit memory path. See `SEND_TOOL.memoryWrites` for the division of labour. */
export const SAVE_MEMORY_TOOL: Anthropic.Tool = {
  name: 'save_memory',
  description: 'Save something about him permanently, before you reply. Use it for a correction.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'text'],
    properties: {
      kind: {
        type: 'string',
        enum: ['slot', 'fact'],
        description: 'REQUIRED. "slot" replaces a standing fact; "fact" appends a new one.',
      },
      slotKey: {
        type: 'string',
        description: 'For kind "slot": which standing fact it replaces, e.g. usual_running_days.',
      },
      text: {
        type: 'string',
        description: 'REQUIRED. The fact in one plain English sentence.',
      },
    },
  },
}

/**
 * R18, phase 12. Her face and build are already fixed by the anchor image and by
 * `NINA_APPEARANCE`, so `scene` deliberately does NOT ask her to describe herself — a
 * self-description in the payload would fight the reference on every generation.
 */
export const GENERATE_IMAGE_TOOL: Anthropic.Tool = {
  name: 'generate_image',
  description:
    'Take a photo of yourself and send it. Use it when he asks, or when you promised one.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scene'],
    properties: {
      scene: {
        type: 'string',
        description:
          'REQUIRED. What is happening in the photo, in a sentence or two. Not your face — never ' +
          'state your own ethnicity or nationality here (never "Indonesian", never any other ' +
          'nationality); you are already a white, beautiful, caucasian woman. Never write yourself ' +
          'smiling or laughing.',
      },
      mood: {
        type: 'string',
        description:
          'Your expression and energy, e.g. "smug, out of breath". Never smiling or laughing — she ' +
          'reads serious, like a magazine cover model, lips just barely parted.',
      },
      outfit: {
        type: 'string',
        description:
          'ONLY if he asked for specific clothing this turn, e.g. "a black mini dress". Leave unset ' +
          'if he did not — use `ootd` for that case instead. Never also describe clothing inside ' +
          '`scene`.',
      },
      pose: {
        type: 'string',
        description:
          'Only spent when your energy is steamy: one short phrase for how you are physically ' +
          'standing or moving, matched to what is happening in `scene` — mid-stride if running, ' +
          'crouched on a switchback if hiking, leaning in a doorway if indoors. Leave unset to fall ' +
          'back to a generic pose. Vary this across photos — do not default to the same stance ' +
          'every time regardless of the scene.',
      },
      ootd: {
        type: 'string',
        description:
          'When he did NOT ask for specific clothing this turn (leave `outfit` unset for that): ' +
          'invent an outfit that fits `scene`, and vary it photo to photo — do not repeat the same ' +
          'look every time. Ignored whenever `outfit` is set. Never also describe clothing inside ' +
          '`scene`.',
      },
    },
  },
}

/** R19, phase 13. `because` is required so the announcement in chat can be honest about why. */
export const SET_AVATAR_TOOL: Anthropic.Tool = {
  name: 'set_avatar',
  description: 'Change your profile picture. Use it when a promise you made has come true.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scene', 'because'],
    properties: {
      scene: {
        type: 'string',
        description:
          'REQUIRED. What the new picture shows, in a sentence or two. Not your face — never state ' +
          'your own ethnicity or nationality here (never "Indonesian", never any other nationality); ' +
          'you are already a white, beautiful, caucasian woman. Never write yourself smiling or ' +
          'laughing.',
      },
      because: {
        type: 'string',
        description: 'REQUIRED. Why now, e.g. "he ran 10k on 4 Sep like he said he would".',
      },
    },
  },
}

/**
 * All seven. **The dispatched set is a SUBSET**: `NINA_CORE_TOOL_SET` (`lib/nina/tools.ts`) ships
 * `send`, `lookup_runs`, `compare_runs`, `aggregate_runs` and `save_memory`; phases 12 and 13 add
 * the last two through `extendToolSet`. The array exists so `tests/nina.prompts.test.ts` can walk
 * every schema, not so a caller sends all of it.
 */
export const NINA_TOOLS: readonly Anthropic.Tool[] = [
  SEND_TOOL,
  LOOKUP_RUNS_TOOL,
  COMPARE_RUNS_TOOL,
  AGGREGATE_RUNS_TOOL,
  SAVE_MEMORY_TOOL,
  GENERATE_IMAGE_TOOL,
  SET_AVATAR_TOOL,
]
