# Run Insights feature map

What the app does, from the runner's side, and what proves each feature works. One file per
feature, each with the same four sections: `Sub-features`, `How to get to it (user POV)`,
`Driving it with verify.sh`, `Gotchas`. A plan's **Proof** section cites entries by file name.
`V=.claude/skills/verify-run-insights/scripts/verify.sh` throughout; steps files are under
`features/steps/`. Paid calls are z.ai calls against the run's budget (default 25) unless the
table says OpenRouter.

| Feature | File | Surfaces | Paid calls |
| --- | --- | --- | --- |
| Upload and the vision read: screenshots to Blob, `glm-4.6v` in the background, the poll | [upload-extract.md](upload-extract.md) | upload, ui, api, sql, blobs | 1 (2 with repair) |
| The mandatory review and commit: `/x/<id>`, consistency checks, Confirm & save, records, badges, Nina's reaction | [review-commit.md](review-commit.md) | ui, sql | 2-3 per commit |
| A run's page: metrics, pace/HR chart, zones, splits, the written analysis | [run-detail.md](run-detail.md) | api, ui, sql | 1 per run not yet narrated |
| Runs list, Trends, Me (records and badge shelf), the nightly rollup | [runs-trends-me.md](runs-trends-me.md) | api, cron, sql | 0; rollup up to 2 |
| Sharing a run: the link, the signed-out public page | [share.md](share.md) | ui, sql | 0 |
| Nina: chat turns, her proactive openers, the nightly trigger cron | [nina.md](nina.md) | ui, cron, sql, logs | 3-5 per turn |
| Onboarding a new runner: the profile form | [onboarding.md](onboarding.md) | ui, sql | 0 |
| Admin: overview, Nina's album, memory, personality, error logs | [admin.md](admin.md) | api, sql | 0 |

Add an entry when a change ships a new user-facing feature; fix an entry when the app's behavior
changed on purpose. A journey that fails because the app is broken is a product bug: report it,
do not edit the entry to match.
