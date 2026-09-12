# Feasibility harness — run-insights

Live evidence for the ingest pipeline's design. Every accuracy figure behind the
vision-extraction choices came from these scripts, run against the author's z.ai key and three
real Apple Fitness screenshots on 2026-08-20. (The feasibility record that first wrote the
numbers up was removed from the tree in September 2026; it survives in git history.)

| script | what it proves |
|---|---|
| `matrix.mjs` | endpoint × model probe — **run this first after any z.ai change** |
| `run-extract.mjs` | extraction variants, scored against ground truth |
| `run-repeat.mjs` | 5× stability of the winning config |
| `downscale.mjs` | accuracy vs image resize / JPEG quality |
| `control.mjs` | that the LLM must NOT compute metrics itself |
| `narrate.mjs` | the coaching report from pre-computed metrics |
| `show-metrics.mjs` | deterministic metrics, no API key needed |

`schema.mjs` holds the extraction prompt and the **108-field hand-transcribed ground truth**;
`score.mjs` scores a candidate against it. `metrics.mjs` is the deterministic metric engine
every narrative number comes from — `show-metrics.mjs` prints it, `narrate.mjs` feeds it to
the model. Nothing here is scratch: `schema.mjs` and `score.mjs` are imported by a dozen test
files, and `tests/research/` wires them into CI (D13) — `score.test.ts` proves the scorer
itself, `goldenFixture.test.ts` pushes the committed golden response through the production
extract → Zod → score chain on every PR, no network and no key.

```bash
LLM_API_KEY=… node matrix.mjs
node show-metrics.mjs          # no key needed
```

The scripts read the three screenshots from the committed `fixtures/screenshots/`; point
`RI_FIXTURE_DIR` at different copies (the same override `tests/live/vision.live.test.ts`
honors). `narrate.mjs` and `control.mjs` default to `glm-5.3` — production's narrative model —
and honor `LLM_NARRATE_MODEL` for reproducing the original `glm-5.2` runs.

The four `results-*.json` are the 2026-08-20/21 captures that plans and code comments cite:
`tests/llm.schema.test.ts` reads `results-narrative.json` straight out of this directory, so
don't rerun `narrate.mjs` over it casually. `run-extract.mjs`'s `results-extract.json` is
rerun output — gitignored; only captures something else cites get committed.
