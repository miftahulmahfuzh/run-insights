# `research/fixtures/` — the offline regression artefacts

## `golden-response.json`

A complete `glm-4.6v` response envelope for the canonical fixture run (2026-08-20, Tangerang,
10.67 km in 1:18:36), used by `tests/research/goldenFixture.test.ts` as F04's **offline**
regression test (roadmap D13, §4.9, plan Task 21/22). It runs on every PR with no network call and
no API key.

The test feeds `choices[0].message.content` through the production pipeline —
`lib/llm/extractJson.ts` → `makeExtractedSessionSchema` → `research/score.mjs`'s `score()` — and
asserts **108/108**. That chain is the point: a change to the JSON extractor, to the Zod schema,
or to the field set is caught here rather than on the next real upload.

### Provenance — read this before trusting it as a vendor capture

**This file is a faithful RECONSTRUCTION, not a captured vendor response.** It is
`research/schema.mjs`'s hand-transcribed `TRUTH` serialised as the model returns it (bare JSON
object, no fences), wrapped in the response envelope shape the coding endpoint really produces,
with the **measured** `usage` numbers from `research/downscale.mjs`'s shipped variant
(`prompt_tokens: 3277` for three images at 560w/q80, `completion_tokens` ≈ 940 from
`results-repeat.json`).

It is a reconstruction because the raw text of the 108/108 runs was never saved.
`research/results-repeat.json` records five consecutive perfect runs — but only their scores,
timings and token counts, not their `rawText`. The three source screenshots are also no longer on
disk (`research/lib.mjs` points at an image-cache directory that has since been cleared), so they
could not be re-run to capture one.

What that costs, stated plainly:

- ✅ It is a valid test of the **scorer, the JSON extractor, the Zod schema and the provenance
  guard** — everything downstream of the model.
- ✅ Its content is byte-identical in *meaning* to what a 108/108 response contains, because
  "108/108" means precisely "every one of these 108 values matched".
- ❌ It does **not** prove the vendor still returns 108/108 today. Only the tagged live suite
  (`npm run test:live:vision`) can do that, and it needs the three screenshots restored first.
- ❌ It carries none of the incidental quirks a real capture would — stray whitespace, a fence,
  a field in an unexpected order. `tests/research/goldenFixture.test.ts` therefore also runs the
  same content through a fenced and a chatty wrapper on purpose, so the extractor is still
  exercised against messy output.

**If you restore the three screenshots, replace this file with a real capture** — run
`node --env-file=.env.local research/run-extract.mjs`, take variant A's `rawText` and `usage`
verbatim, and delete this paragraph. The test needs no change: it reads `choices[0].message.content`
either way.

### The `startTime` note

`TRUTH.startTime` is `'07:07'` (24-hour), which is what the production prompt's SHAPE block asks
for. The one real capture that survives anywhere in `research/` — `results-parallel.json`, from the
*rejected* parallel variant — returned `'7.07 AM'` for the same field. That variant scored 94.4%
and is not what ships, but it is a reminder that time formatting is one of the fields most likely
to drift, and it is worth checking first if a future live run regresses.
