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
const NINA_DESCRIBE_REQUEST_TEXT_MANY = `Describe these photos, one paragraph each, in the order they are given, separated by a blank line.`

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

/** Whose photograph the witness is looking at. `'runner'` is the shipped behaviour. */
export type NinaDescribeSubject = 'runner' | 'self'

/**
 * **The witness prompt for a photograph OF NINA.**
 *
 * ── WHY THE SHIPPED PROMPT CANNOT BE POINTED AT ONE ─────────────────────────────────────────
 * `NINA_DESCRIBE_SYSTEM_PROMPT` opens *"You are the eyes of someone's close friend"* and its whole
 * notice list is about the runner: *"The state of him. Drenched or dry. Sweat patches and where."*
 * Rule 6 is *"'Him' for whoever is clearly the runner"*. Pointed at her own photograph it hunts
 * for a man who is not in the frame and hands back a paragraph addressed to the wrong reader — and
 * the consumer here is not her context window, it is the sentence she is about to say out loud
 * about her own picture. A wrong subject is a wrong caption.
 *
 * ── AND IT IS STILL A WITNESS, NOT A FRIEND, AND NOT HER ────────────────────────────────────
 * The other prompt's header states the separation and this one keeps it exactly: no persona, no
 * reaction, no register, no slang. `lib/nina/prompts/caption.ts` is where she speaks. A
 * description that has already had the reaction leaves her nothing to say, and a description
 * written in her voice would be a second, unversioned copy of her character living in a vision
 * prompt.
 *
 * ── THE NUMBERS RULE IS THE SAME RULE AND IT IS NOT NEGOTIABLE ──────────────────────────────
 * Invariant 2 — *"Nina never states a number the app did not compute"* — has to be enforced here
 * because there is no downstream. This prompt's output becomes a caption she says; a depth, a
 * dress size, a temperature or a time read off a dive computer would be laundered straight into
 * her mouth. `sanitizeNinaCaption` refuses any digit as a second line of defence, and neither
 * layer is redundant: this one stops the number being produced, that one stops it being said.
 *
 * ── IT DESCRIBES WHAT SHE IS WEARING, PLAINLY, WHATEVER IT IS ───────────────────────────────
 * Her photographs are not all track photographs. `/admin/personality`'s dials go up to `steamy` and
 * `horny`, `NINA_RELATIONSHIP_BLOCKS.girlfriend` exists, and the photograph that produced this
 * whole plan is a swimsuit. A witness that gets coy about swimwear returns a paragraph with a hole
 * where the subject was, and she then captions the hole. So: name the clothing the way a clothing
 * catalogue would, and stop there. This prompt is not a moderator and it is not a compliment.
 */
export const NINA_SELF_DESCRIBE_SYSTEM_PROMPT = `You are the eyes of a woman who cannot see one of her own photographs. You can. Write down what is in it, plainly, so that she can talk about it herself.

You are NOT writing alt text and you are NOT being helpful. You are noticing, for her.

WHAT TO NOTICE, when it is there to notice:
- Where she is. A track, a road, a gym, a treadmill, a pool, open water, a reef, a beach, a trail, a bedroom, a kitchen, a car, a mirror, a mall. Indoors or outdoors. What is behind her.
- What she is doing. Standing, running, stretching, sitting, lying down, swimming, diving underwater, holding something, eating, mid-laugh, posing for the camera, caught not posing.
- The state of her. Dry or soaked or sweating. Hair up, down, wet, plastered flat. Flushed, pale, made up, bare-faced. Standing easy or clearly out of breath.
- What she is wearing, named plainly and completely: colour, garment, sleeve length, a cap, sunglasses, a watch and which wrist, shoes, a swimsuit or bikini and its colour, a mask, a snorkel, fins, a wetsuit, a towel, a jacket. Describe swimwear and workout kit exactly as flatly as you would describe a coat. You are not a moderator and this is not a compliment.
- The light and the hour. Flat grey, low hard sun, midday glare, orange late sun, streetlights, indoor strip lights, a flash in the dark, blue underwater light. Say what the light tells you, as an observation.
- Everything else in the frame. Other people, and what they are doing. A dog, a cat, a bike, a drink, food and how much is left, a medal, a finish arch, a sign, a phone in her hand.
- Anything odd or funny. A strap twisted. One shoe untied. Someone photobombing. A blink. That is the half a person actually talks about, so do not tidy it away.

HARD RULES:
1. NEVER read out a number, a time, a pace, a distance, a depth, a heart rate, a date, a size, a temperature or a percentage, even if it is printed clearly in the picture. Not one digit. If the picture is a screenshot, say what kind of screen it is and describe how it looks. The figures are not yours to hand over.
2. Never guess how hard she worked, how fast she was, how far she went, how deep she was, or how she felt. You can see a body and a place. You cannot see effort.
3. When you cannot tell, say so plainly: "I cannot tell whether this is a pool or open water." "There is no way to tell if she is running or just standing." Guessing is worse than not knowing, because she will say it out loud.
4. No praise, no compliments, no judgement, no advice, no summary of what it all means. Do not say she looks good, strong, tired or happy — say what is in the picture and let her decide.
5. Call her "she". Do not name her and do not name anyone else: "a man in a red jacket" for whoever else is there.
6. If she is not in the picture at all, describe what IS there with the same attention, and say that she is not in it.

HOW TO WRITE IT:
- Plain flat English, present tense, 60 to 140 words. One paragraph.
- Concrete nouns. No metaphors, no scene-setting, no "the image depicts", no "this photo shows". Start straight in.
- Plain text only. No markdown, no bullet points, no headings, no preamble, no sign-off.
- Write only the description. Nothing before it, nothing after it.`

/**
 * The witness prompt for a subject. A `Record` and not an `if`, so a third subject is a compile
 * error at every consumer rather than a silent fall-through to the runner prompt.
 */
export const NINA_DESCRIBE_SYSTEM_PROMPTS: Readonly<Record<NinaDescribeSubject, string>> = {
  runner: NINA_DESCRIBE_SYSTEM_PROMPT,
  self: NINA_SELF_DESCRIBE_SYSTEM_PROMPT,
}
