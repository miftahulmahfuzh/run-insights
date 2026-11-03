# A run's page

## Sub-features

- `/r/<id>`: headline (date, place, distance, duration, pace, start-end), the stat grid (avg/max HR,
  cadence, active kcal, elevation, 1-min HR drop), average HR as a share of max.
- The written analysis ("What happened"): `glm-5.3` narrates facts that `lib/metrics/*` computed and
  `lib/format.ts` formatted first (the LLM never computes). Cached in `insights` by a hash of the
  facts; generated on first view by `InsightTrigger` (`ensureRunInsight`).
- Findings with severities (decoupling, cadence fade, fast first kilometre).
- The pace / heart-rate chart: the one chart allowed a dual y-axis, pace inverted.
- Time in zone, zone table, splits with fastest/slowest and the partial final kilometre.
- Edit at `/r/<id>/edit`; share icon (see share.md).

## How to get to it (user POV)

Runs tab -> tap a run. Or land here after **Confirm & save**.

## Driving it with verify.sh

```sh
$V api RUN GET /r/<RUN_ID>
# 2026-11-03, the re-dated upload: "Mon, 2 Nov 2026 · Tangerang", "10.67 km", then the prose:
#   "First run on record since 19 August, and it went out hard and got harder ...", and
#   "decoupling of 12.3% says the engine was falling apart while effort didn't." (the +12.3% the
#   metrics layer computed; CLAUDE.md's sign-error story is why the model never computes it),
#   "Pace & heart rate", "Time in zone", "Splits".
$V sql RUN "select scope, scope_key, model from insights where scope='session'"
# session | BifIQnRUAbca | glm-5.3
```

For the chart and the page as drawn, drive it in the browser and read the PNGs:

```sh
$V ui RUN .claude/skills/verify-run-insights/features/steps/run-detail.mjs -- <RUN_ID>
# 2026-11-03, a seeded run never viewed: "headline: ‹ Runs | Mon, 17 Aug 2026 · Bintaro, South
#   Tangerang | Outdoor Run | 5.10 km | 34:00 · 6'40"/km · 05:28–06:02", "analysis: present"
#   (1 llm call; re-running it on the same run: present, 0 calls). PNGs: top, chart, analysis.
```

Cost: 1 llm call the first time a run is viewed (0 when the commit already wrote it, or on a
re-view: the hash hits).

## Gotchas

- The card's eyebrow is "This run"; "What happened" is the public share page's heading, not this
  page's. Until the prose lands the card says "The written analysis is not ready for this one yet."
- A demo run's 25 seeded runs have no narrative (seeding refused it): the first view of each
  spends 1 call. Pick the runs a change touches, not all 25.
- Offline, the analysis card shows the not-ready state; every number on the page is still final,
  because none of them come from the model.
