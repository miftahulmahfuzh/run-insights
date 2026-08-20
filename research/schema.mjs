export const SYSTEM = `You transcribe Apple Fitness / Apple Watch workout screenshots into JSON.

RULES — these matter more than anything else:
1. Transcribe ONLY what is literally visible. Never infer, never compute, never fill a
   plausible value. If a field is not visible in the images, use null.
2. Apple uses a COMMA as the decimal separator for distance: "10,67KM" is 10.67 km.
3. Durations "1:18:36" are H:MM:SS -> seconds. "06:36" in a splits table is MM:SS -> seconds.
4. Pace "7'22\\"/KM" means 7 min 22 s per km -> 442 seconds per km.
5. The splits table may have a final PARTIAL kilometre: its time is shorter than its pace
   implies (e.g. time 04:48 but pace 7'09"). Set "partial": true for that row only.
6. Copy the splits table row for row. Do not skip rows, do not reorder, do not average.
7. Heart-rate zone rows give a duration MM:SS and a bpm range. Zone 1 has no lower bound
   and Zone 5 has no upper bound; use null for the missing side.

Return ONLY a JSON object. No markdown fences, no commentary.`

export const SHAPE = `{
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
  "avgHrBpm": number|null,
  "maxHrBpm": number|null,              // top-of-axis value on the HR chart, else null
  "restingHrBpm": number|null,          // from the zones footnote, else null
  "splits": [ { "km": number, "timeSec": number, "paceSecPerKm": number,
                "hrBpm": number|null, "cadenceSpm": number|null, "partial": boolean } ],
  "hrZones": [ { "zone": 1..5, "durationSec": number,
                 "minBpm": number|null, "maxBpm": number|null } ],
  "postWorkoutHr": [ { "label": string, "bpm": number } ]
}`

// Ground truth, read off the three screenshots by hand.
export const TRUTH = {
  activityType: 'Outdoor Run', goal: 'Open Goal', dateLabel: 'Thu, 20 Aug',
  startTime: '07:07', endTime: '08:26', location: 'Tangerang',
  durationSec: 4716, distanceKm: 10.67, activeKcal: 646, totalKcal: 747,
  elevationGainM: 15, avgCadenceSpm: 144, avgPaceSecPerKm: 442, avgHrBpm: 173,
  maxHrBpm: 189, restingHrBpm: 72,
  splits: [
    { km: 1, timeSec: 396, paceSecPerKm: 396, hrBpm: 154, cadenceSpm: 154, partial: false },
    { km: 2, timeSec: 428, paceSecPerKm: 428, hrBpm: 171, cadenceSpm: 148, partial: false },
    { km: 3, timeSec: 431, paceSecPerKm: 431, hrBpm: 168, cadenceSpm: 151, partial: false },
    { km: 4, timeSec: 431, paceSecPerKm: 431, hrBpm: 173, cadenceSpm: 148, partial: false },
    { km: 5, timeSec: 423, paceSecPerKm: 423, hrBpm: 179, cadenceSpm: 146, partial: false },
    { km: 6, timeSec: 440, paceSecPerKm: 440, hrBpm: 177, cadenceSpm: 145, partial: false },
    { km: 7, timeSec: 452, paceSecPerKm: 452, hrBpm: 177, cadenceSpm: 143, partial: false },
    { km: 8, timeSec: 474, paceSecPerKm: 474, hrBpm: 175, cadenceSpm: 139, partial: false },
    { km: 9, timeSec: 467, paceSecPerKm: 467, hrBpm: 174, cadenceSpm: 138, partial: false },
    { km: 10, timeSec: 480, paceSecPerKm: 480, hrBpm: 176, cadenceSpm: 136, partial: false },
    { km: 11, timeSec: 288, paceSecPerKm: 429, hrBpm: 183, cadenceSpm: 145, partial: true },
  ],
  hrZones: [
    { zone: 1, durationSec: 104, minBpm: null, maxBpm: 140 },
    { zone: 2, durationSec: 25, minBpm: 141, maxBpm: 151 },
    { zone: 3, durationSec: 303, minBpm: 152, maxBpm: 163 },
    { zone: 4, durationSec: 2165, minBpm: 164, maxBpm: 174 },
    { zone: 5, durationSec: 1998, minBpm: 175, maxBpm: null },
  ],
  postWorkoutHr: [
    { label: '8.26', bpm: 185 }, { label: '1 MIN', bpm: 162 }, { label: '2 MIN', bpm: 169 },
  ],
}
