import type { VisionContentPart } from './extraction'

/**
 * The Workout Details screen's OWN prompt — deliberately not a rule appended to
 * `EXTRACTION_SYSTEM_PROMPT`, whose rules 1–7 and SHAPE scored 108/108 and are byte-frozen (a hash
 * test pins them). This screen is read by a separate one-image call that runs in parallel with the
 * primary call (`lib/llm/runExtractionJob.ts`), so the proven request is untouched by construction.
 *
 * It transcribes PRINTED TEXT ONLY. The charts' shapes are measured by deterministic code
 * (`lib/extract/chart/*`); a model asked to read a value off a bar's height would be computing,
 * which this repo does not let a model do.
 *
 * The worked examples use numbers that appear on NEITHER committed fixture (2026-11-20,
 * 2026-11-22), so the live test cannot pass by the model copying an example.
 */
export const DETAILS_SYSTEM_PROMPT = `You transcribe ONE Apple Fitness "Workout Details" screenshot into JSON. The screen is titled
"Workout Details" and shows small charts stacked under each other: Elevation, Heart Rate, Pace
and sometimes Cadence, each with a time axis underneath.

RULES — these matter more than anything else:
1. Transcribe ONLY numbers that are literally printed as text. Never read a value off the shape
   or height of a chart, never compute, never estimate. If a value is not printed, use null.
2. Apple uses a COMMA as the decimal separator: "6,04KM" is 6.04.
3. durationSec is the workout length printed at the RIGHT end of a chart's time axis (the LEFT
   end reads 0:00:00). It is H:MM:SS: "1:02:15" -> 3735. Every chart's axis prints the same value.
4. A pace "7'05''/KM" (Apple may draw '' or ") means 7 min 5 s per km -> 425 seconds per km.
5. The Pace chart prints its range at the top right as SLOWEST–FASTEST, for example
   "8'40''–5'58''/KM": paceSlowestSecPerKm is the LEFT value (520) and paceFastestSecPerKm is
   the RIGHT value (358). Copy them in printed order.
6. The Pace chart's "Average: ...''/KM" is avgPaceSecPerKm. Apple prints "0'00''" or "--'--''"
   when it has no value: that is null, never 0.
7. The Heart Rate chart prints "Average: ...BPM" (avgHrBpm) and its range at the top right, for
   example "98–181BPM": hrMinBpm is the LEFT value (98) and hrMaxBpm is the RIGHT value (181).
8. The Elevation chart prints "Gain: ...M" (elevationGainM, in metres). Ignore its range ("4–7M").
9. distanceKm only when a distance is printed as a number followed by KM, outside the pace
   figures. Most Workout Details screens print no distance: then it is null.
10. Ignore the Cadence chart and the map.

Return ONLY a JSON object. No markdown fences, no commentary, no text before or after the
JSON object.`

export const DETAILS_SHAPE = `{
  "durationSec": number|null,          // time-axis end label, 1:02:15 -> 3735
  "distanceKm": number|null,           // only if a distance is printed, 6,04KM -> 6.04
  "paceSlowestSecPerKm": number|null,  // pace range LEFT value, 8'40'' -> 520
  "paceFastestSecPerKm": number|null,  // pace range RIGHT value, 5'58'' -> 358
  "avgPaceSecPerKm": number|null,      // "Average: 7'05''/KM" -> 425; 0'00'' -> null
  "hrMinBpm": number|null,             // heart-rate range LEFT value
  "hrMaxBpm": number|null,             // heart-rate range RIGHT value
  "avgHrBpm": number|null,             // "Average: 158BPM" -> 158
  "elevationGainM": number|null        // "Gain: 12M" -> 12
}`

/** One labelled image, then the request — the primary prompt's ordering, for one screen. */
export function buildDetailsUserContent(dataUri: string): VisionContentPart[] {
  return [
    { type: 'text', text: 'IMAGE — WORKOUT DETAILS screen:' },
    { type: 'image_url', image_url: { url: dataUri } },
    {
      type: 'text',
      text: `This is the Workout Details screen of ONE running workout.\n\nReturn one JSON object with exactly this shape:\n${DETAILS_SHAPE}`,
    },
  ]
}
