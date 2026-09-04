import { describe, expect, it } from 'vitest'

import {
  ANGER_LADDER,
  JAKARTA_SLANG,
  NEVER_SAY,
  NINA_APPEARANCE,
  VOICE_EXAMPLES,
} from '@/lib/nina/persona'
import {
  NINA_PROMPT_VERSION,
  NINA_SYSTEM_PROMPT,
  NINA_TOOLS,
  PROACTIVE_INSTRUCTIONS,
  SEND_TOOL,
} from '@/lib/nina/prompts'

/**
 * The prompt is a deliverable, so it gets a test. Not a test of taste — a test that every piece
 * of the canon actually reached the string that gets sent, and that no schema lost the property
 * descriptions the 2026-08-21 measurement bought.
 */

describe('NINA_SYSTEM_PROMPT — the canon reached the prompt', () => {
  it('carries every slang term, so adding a word to the array is the only edit needed', () => {
    for (const entry of JAKARTA_SLANG) {
      expect(NINA_SYSTEM_PROMPT).toContain(entry.term)
    }
  })

  it("carries all five of the user's own example lines, verbatim", () => {
    expect(VOICE_EXAMPLES).toHaveLength(5)
    for (const example of VOICE_EXAMPLES) {
      expect(NINA_SYSTEM_PROMPT).toContain(example.line)
    }
  })

  it('carries every rung of the anger ladder', () => {
    for (const rung of ANGER_LADDER) {
      expect(NINA_SYSTEM_PROMPT).toContain(rung.name)
    }
  })

  it('carries every never-say string', () => {
    for (const phrase of NEVER_SAY) {
      expect(NINA_SYSTEM_PROMPT).toContain(phrase)
    }
  })

  it('forbids "lo" being replaced by formal Indonesian (R2)', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('Never "kamu"')
    expect(NINA_SYSTEM_PROMPT).toContain('Never "Anda"')
  })

  it('states the arithmetic prohibition and names its consequence', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('Do NOT compute')
    expect(NINA_SYSTEM_PROMPT).toContain('no BMI')
    expect(NINA_SYSTEM_PROMPT).toContain('"daysAgo"')
  })

  it('spells the pace example exactly as formatPace does, with no escape character', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('7\'22"/km')
    expect(NINA_SYSTEM_PROMPT).not.toContain('\\"/km')
  })

  it("labels the runner's note as his words rather than as data (R6)", () => {
    expect(NINA_SYSTEM_PROMPT).toContain('HIS OWN WORDS')
  })

  it('keeps the not-a-doctor rule AND permits her own hyperbole', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('never diagnose')
    expect(NINA_SYSTEM_PROMPT).toContain('JANTUNG LO BAKAL PECAH TAH')
  })

  it('describes her face, so phase 12 has one source for it', () => {
    expect(NINA_APPEARANCE).toContain('ponytail')
    expect(NINA_APPEARANCE).toContain('heather-grey racerback tank')
  })

  it('never claims she is an assistant', () => {
    expect(NINA_SYSTEM_PROMPT).toContain('not an assistant')
  })
})

describe('the tool schemas', () => {
  it('gives EVERY property a description — the 2026-08-21 measurement, not a convention', () => {
    const walk = (schema: Record<string, unknown>, path: string): void => {
      const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
      if (properties != null) {
        for (const [name, property] of Object.entries(properties)) {
          expect(property.description, `${path}.${name} has no description`).toBeTruthy()
          walk(property, `${path}.${name}`)
        }
      }
      const items = schema.items as Record<string, unknown> | undefined
      if (items != null) {
        expect(items.description, `${path}[] has no description`).toBeTruthy()
        walk(items, `${path}[]`)
      }
    }
    for (const tool of NINA_TOOLS) {
      expect(tool.description).toBeTruthy()
      walk(tool.input_schema as unknown as Record<string, unknown>, tool.name)
    }
  })

  it('defines the six tools phases 3, 12 and 13 expect, under these exact names', () => {
    expect(NINA_TOOLS.map((t) => t.name)).toEqual([
      'send',
      'lookup_runs',
      'compare_runs',
      'save_memory',
      'generate_image',
      'set_avatar',
    ])
  })

  it('caps the reply at 1-4 bubbles, as RU-5 chose', () => {
    const bubbles = (
      SEND_TOOL.input_schema as unknown as {
        properties: Record<string, Record<string, unknown>>
      }
    ).properties.bubbles!
    expect(bubbles.minItems).toBe(1)
    expect(bubbles.maxItems).toBe(4)
  })
})

describe('PROACTIVE_INSTRUCTIONS', () => {
  it("covers all four RU-15 triggers plus RU-17's avatar change", () => {
    expect(Object.keys(PROACTIVE_INSTRUCTIONS).sort()).toEqual([
      'avatar_changed',
      'missed_usual_day',
      'pattern_crossed',
      'run_committed',
      'silence',
    ])
  })

  it('tells her in every case that she is opening the conversation', () => {
    for (const text of Object.values(PROACTIVE_INSTRUCTIONS)) {
      expect(text).toContain('opening this conversation')
    }
  })
})

describe('NINA_PROMPT_VERSION', () => {
  it('exists and is a positive integer, so nina_turns can record it', () => {
    expect(Number.isInteger(NINA_PROMPT_VERSION)).toBe(true)
    expect(NINA_PROMPT_VERSION).toBeGreaterThan(0)
  })
})
