import { describe, expect, it, vi } from 'vitest'

import { captionNinaPhotoWith } from '@/lib/nina/caption'
import {
  NINA_CAPTION_MAX_CHARS,
  buildNinaCaptionRequest,
  buildNinaCaptionSystemPrompt,
  parseNinaCaption,
  sanitizeNinaCaption,
} from '@/lib/nina/prompts/caption'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'

const SEEN =
  'She is underwater over a coral reef, wearing a dark swimsuit, a mask and a snorkel with black ' +
  'fins, arms out in front of her. The light is blue and comes from above.'

/** One tool_use block, the shape `findCaptionBlock` scans for. */
const reply = (caption: unknown, stop = 'tool_use') =>
  ({
    content: [{ type: 'tool_use', name: 'caption', id: 't1', input: { caption } }],
    stop_reason: stop,
  }) as never

const clientReturning = (message: unknown) => ({
  messages: { create: vi.fn().mockResolvedValue(message) },
})

describe('sanitizeNinaCaption', () => {
  it('keeps a short line in her register', () => {
    expect(sanitizeNinaCaption('eh gw nyelam tadi, airnya bening banget')).toBe(
      'eh gw nyelam tadi, airnya bening banget',
    )
  })

  it('strips a label prefix, wrapping quotes and markdown edges', () => {
    expect(sanitizeNinaCaption('Caption: **"nih, dari bawah laut"**')).toBe('nih, dari bawah laut')
  })

  it('unwraps a quote inside a quote, because a model that quotes itself twice exists', () => {
    expect(sanitizeNinaCaption('"\'nih\'"')).toBe('nih')
  })

  it('collapses control characters and drops zero-width invisibles', () => {
    expect(sanitizeNinaCaption('nih\n\ndari​ laut')).toBe('nih dari laut')
  })

  it('keeps a colon that belongs to the sentence', () => {
    // NOT a general "strip anything before a colon" — this is a legitimate line.
    expect(sanitizeNinaCaption('eh liat: gw nyelam')).toBe('eh liat: gw nyelam')
  })

  // Invariant 2. The absolute one.
  it.each(['gw nyelam 12 meter tadi', 'airnya 28 derajat', 'nyelam 2 jam'])(
    'refuses a caption containing a digit: %s',
    (line) => expect(sanitizeNinaCaption(line)).toBeNull(),
  )

  // Invariant 9: a caption is not the description with an accent.
  it.each([
    'foto ini menunjukkan gw sedang menyelam',
    'terlihat gw pakai masker snorkel',
    'the photo shows her underwater',
  ])('refuses alt-text narration: %s', (line) => expect(sanitizeNinaCaption(line)).toBeNull())

  it('does not refuse an ordinary word that merely contains a forbidden one', () => {
    // The alt-text list is WORD-BOUNDED on purpose, the same correction R22's list needed.
    expect(sanitizeNinaCaption('gw tampan ya')).toBe('gw tampan ya')
  })

  it('refuses rather than truncates over the ceiling', () => {
    expect(sanitizeNinaCaption('a'.repeat(NINA_CAPTION_MAX_CHARS + 1))).toBeNull()
    expect(sanitizeNinaCaption('a'.repeat(NINA_CAPTION_MAX_CHARS))).toHaveLength(
      NINA_CAPTION_MAX_CHARS,
    )
  })

  it.each(['', '   ', '​', '!!!', '...'])('refuses an empty or letterless answer: %s', (line) =>
    expect(sanitizeNinaCaption(line)).toBeNull(),
  )
})

describe('parseNinaCaption', () => {
  it.each([null, undefined, 'a string', 42, {}, { caption: 7 }, { caption: '' }])(
    'returns null for %s',
    (input) => expect(parseNinaCaption(input as unknown)).toBeNull(),
  )

  it('sanitises what it accepts', () => {
    expect(parseNinaCaption({ caption: '  "nih"  ' })).toBe('nih')
  })
})

describe('buildNinaCaptionRequest', () => {
  it('returns null for nothing to caption, so no call is made', () => {
    expect(buildNinaCaptionRequest('   ', 'described')).toBeNull()
  })

  it('clamps a runaway description and puts the instruction last', () => {
    const built = buildNinaCaptionRequest('x'.repeat(5_000), 'described')
    expect(built).not.toBeNull()
    expect(built!.length).toBeLessThan(1_200)
    expect(built!.trimEnd().endsWith('Send it to him with one line.')).toBe(true)
  })

  it('introduces a requested scene differently from a described one', () => {
    expect(buildNinaCaptionRequest(SEEN, 'requested')).not.toBe(
      buildNinaCaptionRequest(SEEN, 'described'),
    )
  })

  it('carries the observation itself, whichever kind it is', () => {
    for (const kind of ['described', 'requested'] as const) {
      expect(buildNinaCaptionRequest(SEEN, kind)).toContain('coral reef')
    }
  })
})

describe('buildNinaCaptionSystemPrompt', () => {
  const prompt = buildNinaCaptionSystemPrompt(NINA_TUNING_DEFAULTS)

  it('is hers and carries the voice blocks', () => {
    expect(prompt).toContain('You are Nina')
    expect(prompt).toContain('Jakarta')
  })

  it('does not carry the full character assembly', () => {
    // The concrete failure this guards: a caption that coaches, diagnoses, or brings up training.
    expect(prompt).not.toContain('sports science')
    expect(prompt).not.toContain('never diagnose')
  })

  it('gives the model a way to decline, so a vague observation is not invented over', () => {
    expect(prompt).toContain('empty string')
  })

  it('has no empty paragraph at the default relationship', () => {
    expect(prompt).not.toMatch(/\n{3,}/)
  })
})

describe('captionNinaPhotoWith', () => {
  const request = { seen: SEEN, seenKind: 'described' as const, tuning: NINA_TUNING_DEFAULTS }

  it('returns the sanitised line', async () => {
    const client = clientReturning(reply('eh gw nyelam tadi'))
    await expect(captionNinaPhotoWith(client, request, { model: 'm' })).resolves.toBe(
      'eh gw nyelam tadi',
    )
  })

  it('makes no call at all when there is nothing to caption', async () => {
    const client = clientReturning(reply('nih'))
    await expect(
      captionNinaPhotoWith(client, { ...request, seen: '' }, { model: 'm' }),
    ).resolves.toBeNull()
    expect(client.messages.create).not.toHaveBeenCalled()
  })

  it('reads past a thinking block rather than off the front of the array', async () => {
    // MEASURED in distill.ts: a reader that read content[0] would have failed on round 1.
    const client = clientReturning({
      content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'tool_use', name: 'caption', id: 't1', input: { caption: 'nih' } },
      ],
      stop_reason: 'tool_use',
    })
    await expect(captionNinaPhotoWith(client, request, { model: 'm' })).resolves.toBe('nih')
  })

  it.each([
    ['a throw', () => ({ messages: { create: vi.fn().mockRejectedValue(new Error('boom')) } })],
    ['a max_tokens stop', () => clientReturning(reply('nih', 'max_tokens'))],
    [
      'no tool block',
      () => clientReturning({ content: [{ type: 'text', text: 'nih' }], stop_reason: 'end_turn' }),
    ],
    ['the sanctioned empty answer', () => clientReturning(reply(''))],
    ['a refused line', () => clientReturning(reply('gw nyelam 12 meter'))],
  ])('degrades to null on %s, and never throws', async (_label, make) => {
    await expect(captionNinaPhotoWith(make() as never, request, { model: 'm' })).resolves.toBeNull()
  })

  it('sends the forced tool and disables thinking', async () => {
    const client = clientReturning(reply('nih'))
    await captionNinaPhotoWith(client, request, { model: 'm' })
    const [body, options] = client.messages.create.mock.calls[0]!
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'caption' })
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(options?.timeout).toBe(12_000)
  })
})
