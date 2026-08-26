import { SCREEN_KINDS, type ScreenKind } from '@/lib/extract/constants'

/**
 * The production extraction prompt.
 *
 * RULES 1–7 and the SHAPE block are **byte-for-byte the wording that measured 108/108 five
 * consecutive times** (`research/schema.mjs`'s `SYSTEM` / `SHAPE`, scored by
 * `research/run-extract.mjs` variant A). Do not reword them. If a future change to this file
 * touches rules 1–7 or the shape, re-run the scorer before shipping it.
 *
 * RULES 6a, 8 and 9 are ADDITIVE — appended after the proven block, never replacing any of it —
 * and exist because production must handle inputs the measured test never covered:
 *
 *  - the measured recipe always sent exactly three images in a fixed order (1=summary,
 *    2=splits, 3=heartrate) because the *test* controls the order. A real upload may be one
 *    image, or three in reverse, so each image is labelled with its kind (closer to the measured
 *    variant C, which also scored 108/108) and rule 8 tells the model that an unlabelled screen
 *    simply does not exist for this request;
 *  - rule 9 pins where `maxHrBpm` and `restingHrBpm` live, which **R-4 settled by reading the
 *    three screenshots** rather than by inference;
 *  - rule 6a closes the one hole R-4 exposed: the summary screen shows the first three split
 *    rows, and a three-row splits array for an eleven-km run is a silently truncated table.
 *    `FIELD_SOURCES` refuses those rows structurally; this rule stops the model producing them
 *    in the first place;
 *  - **rule 10 (F30) authorises the one conversion the prompt asked for but never licensed.**
 *    `startTime`/`endTime` were the two most-corrected fields in the application — 15 human
 *    corrections each — and 34 of 38 production values came back in Apple's on-screen shape
 *    (`"5.32 PM"`, `"6.09AM"`, `"5:37"`) rather than the `"07:07"` the SHAPE block asks for.
 *    That was never a resolution problem: `research/score.mjs` scores both fields and
 *    `results-downscale.json` reports `errs: []` down to 460 px. It was a rules problem. Every
 *    other unit conversion here has a numbered rule lifting it out from under RULE 1's "never
 *    infer, never compute" — RULE 2 for comma decimals, RULE 3 for durations, RULE 4 for pace —
 *    and the time conversion had only a `//` comment. A model obeying the rule it was told
 *    "matters more than anything else" transcribes literally, which is exactly what it did.
 *
 *    The rule's second half matters more than the padding: **8 of 15 start times dropped the
 *    AM/PM entirely**, including one `5.32 PM–6.46 PM` run returned as `"5:32"`. The meridiem
 *    is on screen and legible; losing it is a twelve-hour error that reaches
 *    `lib/badges/rules.ts`. `normalizeClockTime` refuses to guess it back, so the rule has to
 *    stop it being dropped.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You transcribe Apple Fitness / Apple Watch workout screenshots into JSON.

RULES — these matter more than anything else:
1. Transcribe ONLY what is literally visible. Never infer, never compute, never fill a
   plausible value. If a field is not visible in the images, use null.
2. Apple uses a COMMA as the decimal separator for distance: "10,67KM" is 10.67 km.
3. Durations "1:18:36" are H:MM:SS -> seconds. "06:36" in a splits table is MM:SS -> seconds.
4. Pace "7'22\\"/KM" means 7 min 22 s per km -> 442 seconds per km.
5. The splits table may have a final PARTIAL kilometre: its time is shorter than its pace
   implies (e.g. time 04:48 but pace 7'09"). Set "partial": true for that row only.
6. Copy the splits table row for row. Do not skip rows, do not reorder, do not average.
6a. The SUMMARY screen sometimes previews the first two or three split rows. That preview is
   NOT the splits table. Only transcribe "splits" from a SPLITS screen. If you were not given
   a SPLITS screen, "splits" is an empty array even if you can see a few rows elsewhere.
7. Heart-rate zone rows give a duration MM:SS and a bpm range. Zone 1 has no lower bound
   and Zone 5 has no upper bound; use null for the missing side.
8. You are given between 1 and 3 images, each preceded by a label naming which screen it is
   (SUMMARY, SPLITS or HEART RATE). Only the images you actually receive exist. If a screen
   kind is not among the labels you were given, you have no information about it: output null
   (or an empty array, for splits / hrZones / postWorkoutHr) for every field that screen alone
   would show. Do not reuse, estimate or infer a value for an absent screen from a screen you
   were given, even if it looks derivable.
9. avgHrBpm is a labelled stat on the SUMMARY screen (and again on the HEART RATE screen; they
   should agree). maxHrBpm is the top-of-axis label on the HEART RATE screen's chart — never
   computed from any split's hrBpm. restingHrBpm is the small-print footnote under the zones on
   the HEART RATE screen. Without a HEART RATE screen, maxHrBpm and restingHrBpm are both null.
10. The SUMMARY screen prints the start and end as ONE range line under the activity name, using
   a DOT as the time separator: "5.32 PM-6.46 PM" means startTime 5:32 PM and endTime 6:46 PM.
   Convert both to zero-padded 24-hour "HH:MM" — this conversion is required, exactly like rules
   2, 3 and 4, and rule 1 does not forbid it. "5.32 PM" -> "17:32". "6.09 AM" -> "06:09".
   "12.15 AM" -> "00:15". "12.30 PM" -> "12:30". NEVER drop the AM/PM: it is what decides the
   hour, and a morning run and an evening run are indistinguishable without it. If that line is
   not visible, both fields are null.

Return ONLY a JSON object. No markdown fences, no commentary, no text before or after the
JSON object.`

/** Byte-identical to `research/schema.mjs`'s `SHAPE`, plus the two comments rule 9 needs. */
export const EXTRACTION_SHAPE = `{
  "activityType": string|null,          // "Outdoor Run"
  "goal": string|null,                  // "Open Goal"
  "dateLabel": string|null,             // "Thu, 20 Aug"
  "startTime": string|null,             // "07:07" 24h
  "endTime": string|null,               // "08:26" 24h
  "location": string|null,              // "Tangerang"
  "durationSec": number|null,           // 1:18:36 -> 4716
  "distanceKm": number|null,            // 10.67
  "activeKcal": number|null,
  "totalKcal": number|null,
  "elevationGainM": number|null,
  "avgCadenceSpm": number|null,
  "avgPaceSecPerKm": number|null,       // 7'22" -> 442
  "avgHrBpm": number|null,              // SUMMARY screen
  "maxHrBpm": number|null,              // HEART RATE screen, chart axis label. null if no HR screen.
  "restingHrBpm": number|null,          // HEART RATE screen, footnote. null if no HR screen.
  "splits": [ { "km": number, "timeSec": number, "paceSecPerKm": number,
                "hrBpm": number|null, "cadenceSpm": number|null, "partial": boolean } ],
  "hrZones": [ { "zone": 1..5, "durationSec": number,
                 "minBpm": number|null, "maxBpm": number|null } ],
  "postWorkoutHr": [ { "label": string, "bpm": number } ]
}`

const IMAGE_LABEL: Record<ScreenKind, string> = {
  summary: 'SUMMARY screen',
  splits: 'SPLITS screen (transcribe every row)',
  heartrate: 'HEART RATE screen',
}

export type VisionTextPart = { type: 'text'; text: string }
export type VisionImagePart = { type: 'image_url'; image_url: { url: string } }
export type VisionContentPart = VisionTextPart | VisionImagePart

export interface PromptImage {
  kind: ScreenKind
  /** `data:image/jpeg;base64,…` — §2.2: a data URI, never a hosted URL. */
  dataUri: string
}

/**
 * The user turn: every image, each preceded by its label, then the request and the shape.
 *
 * All images go in ONE turn (§2.1). The parallel per-image variant is twice as fast and was
 * rejected: it scored 94.4% and misread split 1's pace as 436 s where the screenshot says 6'36"
 * (396 s) — a genuine misread with no dropped context to blame. Splitting the images removes the
 * cross-image context that lets the model check the summary's total duration against the sum of
 * the split times, and it does not compensate for what it cannot see.
 *
 * The trailing text part comes LAST, matching the measured recipe's ordering exactly.
 */
export function buildExtractionUserContent(images: PromptImage[]): VisionContentPart[] {
  const given = images.map((i) => IMAGE_LABEL[i.kind]).join(', ')
  const intro =
    images.length === SCREEN_KINDS.length
      ? 'These are screenshots of ONE running workout: the summary, the full splits table, and the heart-rate detail.'
      : `These are ${images.length} screenshot(s) of ONE running workout. You are given: ${given}. No other screen exists for this workout.`

  const parts: VisionContentPart[] = []
  for (const image of images) {
    parts.push({ type: 'text', text: `IMAGE — ${IMAGE_LABEL[image.kind]}:` })
    parts.push({ type: 'image_url', image_url: { url: image.dataUri } })
  }
  parts.push({
    type: 'text',
    text: `${intro}\n\nReturn one JSON object with exactly this shape:\n${EXTRACTION_SHAPE}`,
  })
  return parts
}

/**
 * The user turn for the **text-only repair** (R-2 / D17). No image parts, by ruling: the measured
 * failure mode is *structural* (a field listed as required simply absent), not perceptual. The
 * model saw the image correctly and emitted the wrong shape; re-showing it the image cannot help,
 * and costs ~1,700 tokens and ~28 s to learn nothing — through the 60 s ceiling.
 *
 * So the repair says which screens the original request contained, without attaching them, so
 * rule 8 still binds and the model does not "helpfully" invent the absent screen's fields on the
 * second attempt.
 */
export function buildRepairRequestText(kinds: ScreenKind[]): string {
  const given = kinds.map((k) => IMAGE_LABEL[k]).join(', ')
  return (
    `Earlier in this conversation you were shown ${kinds.length} screenshot(s) of ONE running ` +
    `workout: ${given}. The images are not repeated here — you already read them, and rule 8 ` +
    `still applies: any screen not in that list does not exist for this workout.\n\n` +
    `Return one JSON object with exactly this shape:\n${EXTRACTION_SHAPE}`
  )
}

export function buildRepairNote(issues: string): string {
  return (
    'Your last reply did not match the required JSON shape, or contained a value outside the ' +
    'allowed range. Reply again with ONLY the corrected JSON object, in exactly the same shape. ' +
    'Change nothing except what is listed below — every other value you already transcribed was ' +
    'accepted, and re-guessing it from memory would make things worse.\n\nProblems found:\n' +
    issues
  )
}
