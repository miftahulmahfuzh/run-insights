# Runs list, Trends, Me, and the nightly rollup

## Sub-features

- `/` (Runs): runs grouped by ISO week with the week's count and distance; each row links to
  `/r/<id>` and says "⧉ 3 screenshots". Empty state: "No runs yet ... Upload a run". It doubles as
  the signed-out sign-in screen ("Continue with Google").
- `/trends`: Week / Month, previous-period arrows, the period's runs, pace at each distance, the
  written week/month analysis, weekly volume for 12 weeks with a 4-week mean and a table view.
- `/me`: lifetime totals, the 11 personal records (each opens its run), the badge shelf ("N earned,
  M to find", each badge with its count and the date last earned), the profile form, push setup.
- `GET /api/cron/rollup` (Vercel cron 20:00 UTC): for every runner with a run in the last 60 days,
  writes the week and month insights and runs the badge sweep.

## How to get to it (user POV)

Bottom tabs **Runs**, **Trends**, **Me**.

## Driving it with verify.sh

```sh
$V api RUN GET /
# demo: "Week of 17 Aug 2026 · 3 runs · 37.20 km", "Wed 19 Aug ⧉ 3 screenshots", "21.20 km · 2:21:20"
$V api RUN GET /me
# demo: "Runs 25", eleven "[<record> — <value>. Show the record.]" lines ("Longest distance 21.20 km",
#   "Most elevation 118 m"), "Badges 20 earned 2 to find"
$V cron RUN rollup
# with no recent run: {"ok":true,"users":0,"generated":0,...,"weekKey":"2026-W45","monthKey":"2026-11"}
# after review-commit.mjs re-dated a run to this week: {"users":1,"generated":2,"failed":0}
$V api RUN GET /trends
# then: "Week of 2 Nov 2026 · 10.67 km · 1 run", the verdict "hard", and the prose
#   "One hard 10k all week — load spiked, zone 2 nearly absent ..."
$V sql RUN "select scope, scope_key, model from insights order by created_at"
```

Cost: 0 for the pages; `cron rollup` spends up to 2 llm calls per active runner (week + month),
0 on a re-run (the facts hash hits).

## Gotchas

- "Most elevation" prints in metres (`118 m`), like the run page. It printed `0.12 km` until
  2026-11-04 (`formatRecordValue` sent both `unit: 'm'` records through `formatDistanceM`); a
  regression shows up here first, and in `tests/records.labels.test.ts`.
- The rollup and Nina crons see nobody on plain demo data (newest run 20 Aug 2026, 60-day window).
  Commit a re-dated run first (review-commit.md).
- `/trends` before a rollup says "The written analysis is not ready for this one yet. Every number on
  this screen is already final".
