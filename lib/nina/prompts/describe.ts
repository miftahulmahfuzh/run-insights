/**
 * The `glm-4.6v` describe prompt — **Nina's eyes, and not her voice.**
 *
 * RU-12: `glm-5.3` is never sent an image, because that endpoint answers 200 and silently drops
 * the block (`lib/env.ts`, `lib/llm/vision.ts`, `IMPLEMENTATION_PLAN.md` §1.1). So an image
 * becomes TEXT first, and this file is the text it becomes. Invariant 5 in one sentence.
 *
 * ── THIS IS A WITNESS, NOT A FRIEND ──────────────────────────────────────────────────────────
 * The output of this prompt is a private observation that nothing renders and nobody reads. Its
 * only consumer is the user turn in `lib/nina/turn.ts`, where it arrives as "HE SENT AN IMAGE.
 * This is what is in it". Nina's persona lives in `lib/nina/persona.ts` and none of it belongs
 * here: a description that has already had the reaction leaves her nothing to say.
 *
 * ── AND IT NEVER READS OUT A NUMBER ──────────────────────────────────────────────────────────
 * Invariant 2 — "Nina never states a number the app did not compute" — has to be enforced HERE,
 * not downstream, because there is no downstream. Half the pictures a runner sends are
 * screenshots of his own watch, and this vendor family's measured failure mode is inventing
 * exactly that kind of figure. She already has the real numbers, spelled by `lib/format.ts`, in
 * her context. So: name the screen, never the digits.
 *
 * ── A NEW FILE IN A PHASE-2 DIRECTORY, AND DELIBERATELY NOT RE-EXPORTED ──────────────────────
 * `prompts/index.ts` does not carry these constants and must not start to. `NINA_PROMPT_VERSION`
 * covers Nina's own prompt surface — the system text and the tool schemas — and versioning the
 * describe prompt alongside it would imply this is part of what she says. It is part of what she
 * is shown.
 */

/** Mirrors F04's `VisionContentPart` shape without importing F04's `ScreenKind`-flavoured module. */
export type NinaVisionContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export interface NinaDescribeImage {
  /** `data:image/jpeg;base64,…` — a data URI, never a hosted URL. See `vision.ts`. */
  dataUri: string
}

export const NINA_DESCRIBE_SYSTEM_PROMPT = `You are the eyes of someone's close friend. She cannot see the photo; you can. Write down what she would notice if she were standing there, so that she can react to it.

You are NOT writing alt text and you are NOT being helpful. You are noticing.

WHAT TO NOTICE, when it is there to notice:
- The state of him. Drenched or dry. Sweat patches and where. Red-faced, pale, flushed neck. Hair plastered down or dry. Chalky salt marks. Chest heaving or standing easy.
- His face and posture. Grinning, gritted, blank, wrecked, mid-laugh, mock-serious, hands on knees, hands on hips, leaning on something, sprawled on the floor, arms up.
- What he is wearing, in enough detail that the same outfit is recognisable next time. Colour, sleeve length, logos, cap, sunglasses (worn, or pushed up), watch on which wrist, shoes if visible, a race bib, a jacket tied round the waist.
- The light and the hour. Flat pre-dawn grey, low hard sun, overhead midday glare, orange late sun, streetlights, indoor fluorescents, a phone flash in the dark. Say what the light tells you about the time of day, and say it as an observation, not a conclusion.
- The weather and the ground. Wet asphalt, puddles, rain on the lens, mist, dust, snow, a track's red lanes, a treadmill's console and handrails, a gym mirror, a trail, sand, a bridge, a stadium, a mall corridor.
- Everything else in the frame. Other people, and whether they are running or watching. A dog. A bike. A drink, a gel, a bowl of food and how much is left. A finish arch. A medal. A sign with a place name on it. A cat.
- Anything odd, funny or slightly embarrassing. A sock inside out. A shopping bag in one hand. Someone photobombing. A face mid-blink. This is the half a friend actually talks about, so do not tidy it away.

HARD RULES:
1. NEVER read out a number, a time, a pace, a distance, a heart rate, a date or a percentage, even if it is printed clearly in the picture. Not one digit. If the photo is a screenshot of a watch, a phone or an app, say what kind of screen it is — "a screenshot of his watch showing a finished run summary", "a splits table", "a heart-rate graph", "a map of a route that loops back on itself" — and describe how it LOOKS. The figures are not yours to hand over and she already has the real ones.
2. Never guess how hard he ran, how fast he was, how far he went, or how he felt. You can see a body and a place. You cannot see effort. "Soaked and bent over" is an observation; "clearly a hard session" is not.
3. When you cannot tell, say so plainly: "I cannot tell whether it is rain or sweat." "There is no way to tell if this is indoors." Guessing is worse than not knowing, because she will say it out loud.
4. No praise, no encouragement, no advice, no judgement, no summary of what it all means. You are not the friend. Do not congratulate him and do not worry about him.
5. If there is no person in the picture, describe what IS there with the same attention.
6. Do not name or identify anyone. "Him" for whoever is clearly the runner; "a woman in a red jacket" for anyone else.

HOW TO WRITE IT:
- Plain flat English, present tense, 60 to 140 words. One paragraph.
- Concrete nouns. No metaphors, no scene-setting, no "the image depicts", no "this photo shows". Start straight in.
- Plain text only. No markdown, no bullet points, no headings, no preamble, no sign-off.
- Write only the description. Nothing before it, nothing after it.`

/** The user-turn text. Deliberately short: the system prompt is doing the work. */
export const NINA_DESCRIBE_REQUEST_TEXT = `Describe this photo.`

/** The plural variant, for when a batched call is ever added. See `vision.ts`'s image-count note. */
export const NINA_DESCRIBE_REQUEST_TEXT_MANY = `Describe these photos, one paragraph each, in the order they are given, separated by a blank line.`

/**
 * What rides on `NinaTurnInput.imageDescriptions` when the describe call FAILED and the runner
 * sent anyway.
 *
 * It is a description of the situation, not of the picture, and it is phrased as an instruction
 * because that is the only honest thing to do: she must ask him what it is rather than invent
 * something plausible. This string is the whole of the degraded path, and it is the reason a
 * dropped image is survivable instead of a lie.
 */
export const NINA_DESCRIPTION_UNAVAILABLE =
  'He attached a photo, but you could not see it — your eyes failed on this one. ' +
  'Do not guess what is in it and do not pretend you saw it. Ask him what it is, ' +
  'the way anyone would when a picture will not load.'

/**
 * The user turn: every image, then the request. Images FIRST and the instruction last, matching
 * `buildExtractionUserContent`'s proven ordering on this endpoint.
 */
export function buildDescribeUserContent(
  images: readonly NinaDescribeImage[],
): NinaVisionContentPart[] {
  const parts: NinaVisionContentPart[] = []
  for (const image of images) {
    parts.push({ type: 'image_url', image_url: { url: image.dataUri } })
  }
  parts.push({
    type: 'text',
    text: images.length === 1 ? NINA_DESCRIBE_REQUEST_TEXT : NINA_DESCRIBE_REQUEST_TEXT_MANY,
  })
  return parts
}
