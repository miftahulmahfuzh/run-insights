# Feasibility harness — run-insights

Live evidence behind `../IMPLEMENTATION_PLAN.md`. Every number in §1 of the plan came from
these scripts, run against the author's z.ai key and three real Apple Fitness screenshots on
2026-08-20.

| script | what it proves |
|---|---|
| `matrix.mjs` | endpoint × model probe — **run this first after any z.ai change** |
| `run-extract.mjs` | extraction variants, scored against ground truth |
| `run-repeat.mjs` | 5× stability of the winning config |
| `downscale.mjs` | accuracy vs image resize / JPEG quality |
| `control.mjs` | that the LLM must NOT compute metrics itself |
| `narrate.mjs` | the coaching report from pre-computed metrics |
| `show-metrics.mjs` | deterministic metrics, no API key needed |

`schema.mjs` holds the extraction prompt and the **108-field hand-transcribed ground truth**.
`score.mjs` scores a candidate against it. Keep both — they are the regression test for F04.

```bash
LLM_API_KEY=… node matrix.mjs
node show-metrics.mjs          # no key needed
```

Point `lib.mjs`'s `DIR` at your own copies of the three screenshots.
