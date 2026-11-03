# The mandatory review and commit

## Sub-features

- `/x/<extractionId>`: the reader's numbers, every field editable, "Nothing has been saved yet."
- Consistency checks from arithmetic ("1 thing worth checking: Splits total 1:19:10, the run is
  1:18:36 (34s off)"), with a **Jump** link; they warn, they never block.
- **Confirm & save** -> `commitReviewAction` writes the run with splits and zones in one batch
  (runs are born reviewed; there is no draft run), then `onRunCommitted` recomputes the 11 records,
  evaluates the badge rules, sweeps stale insights, and fires Nina's `run_committed` reaction in
  `after()`.
- Lands on `/r/<runId>`, whose `InsightTrigger` writes the session narrative.

## How to get to it (user POV)

After an upload the review screen opens by itself; any unreviewed extraction is also at
`/x/<id>`. Check the numbers, fix any, **Confirm & save**.

## Driving it with verify.sh

```sh
$V ui RUN .claude/skills/verify-run-insights/features/steps/review-commit.mjs -- <EXTRACTION_ID> [YYYY-MM-DD]
# 2026-11-03: "review banner: no checks", "re-dated to 2026-11-02", "committed: /r/BifIQnRUAbca"
$V sql RUN "select id, distance_m, started_at, (select count(*) from runs) from runs where extraction_id='<EXTRACTION_ID>'"
# BifIQnRUAbca | 10670 | 07:07:00 | 26
$V sql RUN "select role, source, left(text,100) from nina_messages where source='run_committed' order by seq"
# three nina bubbles about that run ("... 90.6% waktunya di zona 4 dan 5 ...")
$V logs RUN 'nina reacted|push\] notified' 10
# [push] notified { kind: 'run_committed', attempted: 0, skipped: 'no live subscriptions' }
# [review] nina reacted { emitted: true, kind: 'run_committed', messageIds: [ ... 3 ids ] }
```

The flagged fixture (a `--seed=review` or `demo` run):

```sh
$V sql RUN "select id from extractions where raw_response->'vendor'->>'seeded' is null and status='ok'"
$V ui RUN .claude/skills/verify-run-insights/features/steps/review-commit.mjs -- <that id>
# "review banner: 1 thing worth checking", committed anyway. Works offline too: a commit needs no model.
```

Cost: 2-3 llm calls per commit (the narrative, then Nina's reaction, which can take two rounds and
lands up to a minute after the redirect).

## Gotchas

- `up --seed=demo` commits its 25 runs before the budget is armed, so they carry no narrative and
  no `run_committed` opener, and `nina_turns` starts with ~25 `failed / unavailable` rows (the
  refused reactions). Filter `nina_turns` by `created_at` after the run's `started` time.
- Nina's reaction arrives in `after()`: read `nina_messages` a minute after the commit, not at the
  redirect.
- Re-dating in the review form is the only way to make a run "recent" (the crons look back 60 days,
  the demo's newest run is 20 Aug 2026).
