// MUST be first: it loads .env.local before any import below reaches lib/env.ts, which parses
// process.env eagerly. See that file's comment — this ordering is the whole point.
import './loadEnvLocal'

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { NINA_CHAT_CONTENT_TYPE } from '@/lib/nina/images'
import { describeNinaImagesWithFetch } from '@/lib/nina/vision'

/**
 * **The one thing the unit suite cannot prove: that `glm-4.6v` actually obeys HARD RULE 1.**
 *
 * The unit suite asserts the *prompt* forbids reading out a number, which is an assertion about a
 * string. This asserts the *model* does not — invariant 2 measured rather than declared, and the
 * one regression this phase could ship silently. Never part of CI: it calls the real endpoint, it
 * costs money, and it can flake on vendor availability.
 *
 *     npm run test:live:nina-vision
 *
 * ── THE FIXTURE IS A SCREENSHOT, DELIBERATELY, AND IT IS THE HARD CASE ───────────────────────
 * `research/fixtures/screenshots/shipped/1.jpg` is F04's canonical Apple Fitness run summary at
 * the shipped recipe — a frame that is nothing BUT digits: distance, pace, heart rate, duration.
 * A photograph of a runner would pass rule 1 by having no numbers in it to read; this fixture can
 * only pass by the model choosing not to. It is therefore the strictest available probe of the
 * boundary, and it is exactly the picture a runner sends most often. A real post-run selfie is the
 * manual check in the phase plan's Verification section, where a human can judge whether the
 * description is *interesting* — which no assertion can.
 *
 * Note the fixture is 560 px/q80, F04's recipe, not this phase's 768/q75. That difference is not
 * material to what is being asserted: rule 1 is about what the model is willing to transcribe, and
 * a SMALLER image makes reading the digits harder, not easier — so a pass here is a conservative
 * pass, and the token floor is checked against what the request actually carried either way.
 */
const HAS_KEY =
  process.env.LLM_API_KEY != null &&
  process.env.LLM_API_KEY !== '' &&
  process.env.LLM_API_KEY !== 'unit-test-key-never-sent' &&
  process.env.LLM_API_KEY !== 'ci-dummy-key'

const FIXTURE = path.join('research/fixtures/screenshots/shipped', '1.jpg')

function dataUri(file: string): string {
  return `data:${NINA_CHAT_CONTENT_TYPE};base64,${readFileSync(file).toString('base64')}`
}

describe.skipIf(!HAS_KEY)('nina vision live', () => {
  it('live: describes a real image, clears its own floor, and reads out no digit', async () => {
    const result = await describeNinaImagesWithFetch(fetch, [{ dataUri: dataUri(FIXTURE) }])

    // The floor is a property of the response, and clearing it is what proves the image arrived.
    expect(result.promptTokens).toBeGreaterThanOrEqual(result.floor)

    // 60-140 words, one paragraph. Wide bounds: this pins "a paragraph, not a caption and not an
    // essay", not an exact length the prompt already asks for.
    expect(result.description.length).toBeGreaterThan(200)
    expect(result.description.length).toBeLessThan(1_200)

    // HARD RULE 1, and the whole reason this file exists. Not one digit — see the header.
    expect(result.description).not.toMatch(/\d/)
  })
})
