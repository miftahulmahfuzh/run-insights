# F30 — `startTime` / `endTime`: the reader was right, the format was never agreed

**Card:** [#39](https://github.com/miftahulmahfuzh/run-insights/issues/39) — *"Extraction: startTime and endTime are always null"*
**Date:** 2026-08-26
**Status:** round 1

---

## 1. The card's premise is false, and the real bug is more interesting

The card reports the two fields coming back `null` and proposes the 560 px downscale
recipe as the likely cause. Measured against production, **neither holds**.

Nineteen real extractions, thirty-eight time values:

| | count |
|---|---|
| `null` | **0** |
| conforming `HH:MM` | 4 |
| **non-conforming** | **34 (89%)** |

The field is never null. It is nearly always the *right time in the wrong shape*.

`startTime` and `endTime` are also the **two most-corrected fields in the entire
application** — 15 human corrections each, against 5 for `durationSec` and 2 for
`intent`. Every one of those 30 corrections preserves the digits the model read and
changes only the formatting:

```
startTime: "5:37"     -> "05:37"
startTime: "5.25AM"   -> "05:25"
startTime: "6.09 AM"  -> "06:09"
startTime: "5:10PM"   -> "17:10"
startTime: "5:32"     -> "17:32"      <- the dangerous one; see §3
```

So the model reads the timestamps **perfectly** at the shipped recipe. The pixels
were never the problem.

### The resolution hypothesis is independently dead

The card's own Note asked the right question: were these fields part of the 108?
They were. `research/score.mjs:3` lists `startTime` and `endTime` in `SCALARS`, and
`research/results-downscale.json` reports `"errs": []` at `100.0` for **every**
variant — including `jpeg q70 460w`, a full 100 px below what ships. A field that
scores clean at 460 px is not failing at 560 px.

## 2. Why the user sees `null` when the database holds a value

Three layers, and only the third is visible to the runner:

1. **The prompt never authorises the conversion.** `EXTRACTION_SHAPE` asks for
   `"07:07" 24h` in a `//` comment. Meanwhile RULE 1 — *"Transcribe ONLY what is
   literally visible. Never infer, never compute"* — is introduced by the line
   *"these matter more than anything else"*. Every other unit conversion in this
   prompt gets its own numbered rule that lifts it out from under RULE 1: RULE 2 for
   Apple's comma decimals, RULE 3 for durations, RULE 4 for pace. **The time
   conversion is the only one with no rule.** So the model does what RULE 1 tells it
   to and transcribes Apple's on-screen string: `5.32 PM`, `6.09 AM`, `5:37`.

2. **The schema accepts anything.** `RawExtractedSession.startTime` is
   `z.string().nullable()`, so the raw transcription passes validation untouched and
   `hydrateDraftFromExtraction` copies it straight into the draft.

3. **A native `<input type="time">` silently swallows it.** `ClockInput`
   (`components/review/HeroFields.tsx:189`) renders `value={value ?? ''}`. The
   browser discards any value that is not a valid `HH:MM`, so `"5.32 PM"` renders as
   **an empty control**. The runner sees a blank field on every upload and reports it
   as "always null."

The value was in the database the whole time. The component's own doc comment even
states the invariant it depends on — *"the native control cannot produce the one
shape the schema refuses"* — which is true of the control's **output** and says
nothing about what it will accept as **input**. That gap is the bug.

## 3. The meridiem is real information, and the model is dropping it

Of the 15 start times, **8 carried no AM/PM at all**. Seven were morning runs, where
zero-padding would have been right. One was not:

> `"5:32"` — corrected by hand to `"17:32"`.

The screenshot behind that extraction, at the shipped 560 px, reads
**`5.32 PM–6.46 PM`** in plain legible type. The `PM` was on screen and the model
threw it away. Same for `5.10 PM–6.21 PM` on another. This is information loss at
the reader, not illegibility at the pixel level — which is exactly what a prompt rule
can fix and a downscale change cannot.

It also means **a bare time cannot be safely assumed to be AM**: production says that
assumption is wrong 1 time in 8.

## 4. Approaches

| | Convention | Scope | Verifiability | Reversibility |
|---|---|---|---|---|
| **A. Prompt only** | ✅ matches RULE 2/3/4 | ✅ smallest | ❌ | ✅ |
| **B. Normaliser only** | ✅ | ✅ | ✅ | ✅ |
| **C. Both** ← chosen | ✅ | ✅ | ✅ | ✅ |

**A — add the missing RULE and stop there.** *Lost on verifiability.* The card asks
for a regression test so this "cannot come back silently," and no offline test can
assert what an LLM will emit. The gate would have nothing to hold.

**B — normalise in the schema and leave the prompt alone.** *Lost on correctness.* A
normaliser cannot invent a meridiem the model discarded, so it would turn `"5:32"`
into `"05:32"` — silently twelve hours wrong. `lib/badges/rules.ts:103` feeds
`started_at` into the time-of-day badge rules, so that error does not merely display
wrong, it **mints a wrong badge**. And leaving the prompt unfixed keeps feeding the
normaliser ambiguous input forever.

**C — both, chosen.** RULE 10 stops the meridiem loss at the source; the normaliser
deterministically absorbs the separator-and-padding variance and is fully unit-testable
with no network. Each covers the other's blind spot: the rule is untestable but
addresses the root, the normaliser is testable but cannot recover lost information.

## 5. The ambiguity call (one-digit hour, no meridiem)

When `"5:37"` arrives with no meridiem, the reading is genuinely ambiguous and
production says guessing AM is wrong 1 time in 8. Two readings of the card:

- **Narrow (built):** return `null` and let the human type it.
- **Wide (rejected):** zero-pad to `"05:37"` — fills the field in 14 of 15 real cases.

The wide reading is more satisfying and is still wrong, for one reason:

> **Today an ambiguous bare time already renders as a blank field, and the human fills
> it in correctly.** Zero-padding would replace a blank that gets corrected with a
> plausible value that gets accepted.

That is a strict *regression* in correctness for that case, not an improvement — a
review screen catches an empty field and is blind to a filled one that looks right. It
is the same asymmetry this repo already takes a side on in RULE 1, in the
splits-truncation note in `extractedSession.ts`, and in `ExtractedSplit` refusing to
default a missing `hrBpm`.

Nothing is destroyed either way: the model's raw text stays in
`extractions.raw_response.vendor`. And nothing regresses — 8 of 15 cases (every one
carrying a meridiem) become correct automatically, and 0 get worse.

A two-digit hour is **not** ambiguous and is accepted as-is: `"07:07"` is the shape the
prompt asks for, and reading it as 24-hour is the contract, not a guess. That is what
keeps the golden fixture and `tests/review.draft.test.ts` passing unchanged.

If the runner would rather see `05:37` pre-filled and correct the rare evening run by
hand, that is one comment on the card and a two-line change to the ambiguous branch.

## 6. Work

1. `normalizeClockTime()` in `lib/schema/extractedSession.ts`, applied to both fields
   via a Zod transform so every consumer — primary parse, repair round-trip, review
   hydrate — gets it from one place.
2. **RULE 10** in `lib/llm/prompts/extraction.ts`, appended after the proven block in
   the additive style RULES 6a/8/9 already established. RULES 1–7 are not touched.
3. **`research/schema.mjs` is deliberately left alone.** It holds the frozen wording that
   measured 108/108 — rules 1–7 and the SHAPE block, nothing else. RULES 6a, 8 and 9 were
   added to production only, for exactly this reason, and RULE 10 follows them. Mirroring
   it would destroy the baseline the additive rules are measured against. The SHAPE block
   is likewise untouched, so the documented byte-identity still holds.
4. Regression tests: the normaliser table, the schema-level transform, and a fixture
   built from the exact strings production emitted.

## 7. What would have caught this sooner

`research/score.mjs`'s `eq()` strips `.` and `,` and lowercases before comparing, so
`"7.07 AM"` vs `"07:07"` *does* fail — but nothing scored the **shape** of a value
against the shape the review form can actually display. The new tests close that gap
at the schema boundary, which is the only place all three entry paths pass through.
