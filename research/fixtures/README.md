# `research/fixtures/` — the canonical run, and the regression artefacts built from it

The 2026-08-20 Tangerang run: 10.67 km in 1:18:36, 90.6% of it in zones 4–5, a +41 s/km positive
split and an 18 spm cadence fade. A deliberately unflattering run, which is what makes it a good
fixture. Its 108-field hand-transcribed ground truth is `research/schema.mjs`'s `TRUTH`.

## `screenshots/`

| Path | What it is |
|---|---|
| `screenshots/{1,2,3}.png` | The three originals as captured: **739 × 1600**, 1.3 MB total. 1 = summary, 2 = splits, 3 = heart rate — the order `research/run-extract.mjs` has always used. |
| `screenshots/shipped/{1,2,3}.jpg` | The same three at the **shipped recipe** — 560 px short edge, JPEG q80, **560 × 1212**, 183 KB total. This is what a browser upload actually puts on the wire. |
| `scripts/shipped-image-recipe.py` | Regenerates `shipped/` from the PNGs. Reimplements `lib/photos/resizeTarget.ts` + `TARGET_QUALITY` in Pillow, because the real compressor runs in a browser Web Worker and cannot be called from a script. |

**These were committed on 2026-08-21.** They had previously lived only in
`/home/miftah/.claude/image-cache/…`, which was cleared — which cost F04 its live suite for a day
and left three tasks open. They live in the repo now so that cannot happen again; D13 ("`research/`
stays in the repo") always intended this.

The `shipped/` variant exists because sending the originals measures the wrong thing. The
originals cost **5,494** input tokens; the shipped recipe costs **3,628**. Production sends the
latter, so that is what the live suite sends.

> Regenerating `shipped/` with a different encoder will change the bytes by a few percent —
> Pillow's JPEG is not the browser's. It will **not** change the pixel dimensions, and dimensions
> are what drive both token cost and accuracy. The script asserts the short edge lands on 560 ± 5.

## `golden-response.json`

**A real, verbatim `glm-4.6v` response**, captured 2026-08-21 from the shipped-recipe JPEGs using
the production prompt, and kept only because it scored **108/108**. `model`, `choices` and `usage`
are exactly as the endpoint returned them; the rest of the envelope (request ids, timestamps) was
dropped so the committed file does not churn on recapture.

```
in=3628  out=1070  finish_reason=stop  score=108/108
```

`tests/research/goldenFixture.test.ts` is F04's **offline** regression gate (D13, §4.9, plan Tasks
21–22). It runs on every PR with no network and no API key, feeding
`choices[0].message.content` through the real production chain — `lib/llm/extractJson.ts` →
`makeExtractedSessionSchema` → `research/score.mjs`'s `score()` — and asserting 108/108. A change
to the JSON extractor, to a Zod range, to the field set or to the provenance guard fails there
rather than on the next real upload. It also runs the same content through a fenced and a chatty
wrapper, so the fence stripper stays exercised even though this capture happens to be clean.

### What it does and does not prove

- ✅ The scorer, the JSON extractor, the Zod schema and the provenance guard, on real model output.
- ✅ That the production prompt — RULES 1–7 verbatim from the scored recipe, **plus** the additive
  6a/8/9 and the per-image labels — reaches 108/108 at the compressed size that ships.
- ❌ That the vendor still returns 108/108 **today**. Only `npm run test:live:vision` can say that,
  and it costs money. This file is a snapshot of one good run, frozen.

### Recapturing it

Needed only if the prompt or the schema changes in a way that alters the expected output. Run the
production prompt against `screenshots/shipped/`, confirm 108/108, and write `model` / `choices` /
`usage` verbatim — refusing to write anything that scored lower, or the gate bakes in a regression.
`npm run test:live:vision` is the check that the current prompt still earns a 108/108 first.

### One field worth watching

`startTime` is `"07:07"`. The one other real capture surviving anywhere in `research/` —
`results-parallel.json`, from the **rejected** parallel-call variant — returned `"7.07 AM"` for the
same field, and that variant scored 94.4%. Time formatting is the field most likely to drift, so
it is the first thing to check if a future live run regresses.
