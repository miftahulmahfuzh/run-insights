# F19 — The README a visitor can see, and the harness that photographs it

**Card:** [#14](https://github.com/miftahulmahfuzh/run-insights/issues/14) · round 1 · 2026-08-22
**Branch:** `task/14-rewrite-readme-md-from-the-code-and`

---

## 1. Why the two asks are one card

The card reads as two requests — rewrite `README.md`, and add screenshots and GIFs. They are one
because the second one **cannot be answered by hand without lying**, and the first one is the only
place the answer lands.

A screenshot taken by hand is a screenshot nobody can retake. Six weeks and one design change
later the README shows a UI that no longer exists, and the only way to notice is for a human to
compare 8 images against 9 routes by eye. Every other generated asset in this repo already
refuses that deal: badge art is `gen_badge_art.py` plus a committed master, the app icon is
`gen_app_icon.py` plus `make_icon_assets.py`, and the OG image is `scripts/gen-og-default.mjs`.
The rule those three share is D12's actual content — **the image is a build product of a committed
input, not a keepsake** — and README media has no argument for being the exception.

So this card ships a capture harness first and pictures second, the same order F10 took, and the
README rewrite is what consumes its output.

## 2. The four decisions taken before any code

| # | Decision | Why not the alternative |
|---|---|---|
| **F19-D1** | Screenshots come from a **seeded demo user**, created and purged by script | The live database holds **3 runs across 4 days**, all ~10.7 km. `/trends` withholds its pace regression until four weeks exist and draws the 4-week rolling mean's missing points as a visible gap — so real data screenshots the *empty states* of the feature the card wants shown. It also puts a real name and gmail address on the front page of a public repo. |
| **F19-D2** | The seed writes **`extractions` rows only**; Playwright commits each one through the real review screen | Records (10 keys) and badges (22 keys) are written by `lib/derived/invalidate.ts` → `recomputeRecords` + `evaluateBadgesForCommit`, both behind `import 'server-only'`. A `.mjs` script cannot import them (`f04-e2e-probe.mjs` §"HONEST SCOPE NOTE" documents exactly this wall), and reimplementing the rules in the seed would put a second, unchecked copy of the badge table in the repo. Clicking **Confirm & save** runs the production path inside Next, where the alias problem does not exist. |
| **F19-D3** | Assets live in **`docs/media/`**, dark theme, 390×844 @ DPR 2 | Not `public/`: everything there is app-served, and `next.config.ts` serves `public/badges/` `immutable` for a year on the strength of a SHA-256-prefixed filename. README media is documentation, has no cache contract, and should not have to invent one. The viewport is not a simulation — every screen is `max-w-[470px]`. |
| **F19-D4** | The harness is **dev tooling, not CI** | `npm run badges:check` runs in CI because it asserts a *parity* (style.md ↔ catalog) that a human can break by editing one file. Capture asserts nothing; it produces bytes, needs a database, a Blob store and a browser, and would turn every PR into a 3-minute browser run for no proposition. Same boundary `tools/gen_badge_art.py` sits on. |

## 3. The seed, and the invariant it must satisfy

`scripts/capture/seed-demo.mjs`. Raw SQL through `neon()`, in the shape `f04-e2e-probe.mjs`
established: create a throwaway user, do the work, delete the user and let 15 of 17 FKs cascade.

```
node --env-file=.env.local scripts/capture/seed-demo.mjs          # seed, print the manifest
node --env-file=.env.local scripts/capture/seed-demo.mjs --purge  # delete the user + its blobs
```

It writes:

- one `user` row, `demo-<base36 seconds>`, named **Demo Runner**, email `…@demo.invalid`;
- one `profiles` row — birth year, weight, resting HR, and an explicit `hr_max`, so %HRmax has a
  stated basis rather than falling back on a formula the README already records as disproved;
- the three committed fixture screenshots (`research/fixtures/screenshots/`) **uploaded to Blob
  once**, then referenced by every run's `run_photos` rows. Three real objects, not 54: the
  screenshot strip and the share page's photo list only need *a* photo each, and 54 uploads of the
  same three files is a bill and a slower purge for nothing;
- **26 `extractions` rows, `status='ok'`** — 25 carrying a generated `RawExtractedSession`
  payload, and one carrying the canonical fixture. (The plan first said 19 here and 26 in §5; see
  §12.)

**The invariant.** Each payload must pass all four checks in `lib/review/checks.ts` —
`splits_sum_vs_duration`, `zones_sum_vs_duration`, `distance_pace_vs_duration`,
`partial_consistency` — because a green banner is what makes confirming a single tap, and a single
tap is what lets the capture script commit 19 runs without filling 108 fields each. The seed
therefore **derives** the payload rather than inventing it:

1. pick `distanceKm` and a target average pace;
2. `durationSec = round(distanceKm * paceSecPerKm)`;
3. generate `floor(distanceKm)` full-km splits whose times are the pace profile, then set the
   **final partial** split's `timeSec` to the remainder and its `paceSecPerKm` to
   `round(timeSec / partialFraction)` — which is precisely what `partialConsistency` recomputes;
4. absorb the rounding drift into the *last full* split so the split times sum to `durationSec`
   exactly;
5. apportion `durationSec` across five HR zones by largest remainder, so the zones sum exactly too.

One run is seeded deliberately **inconsistent** and left uncommitted: split 7's pace is written as
`436` where its own time says `396`. That is not an invented defect — it is the miss the
parallel-call variant actually made in F04's measurement run, the one F05 exists because of. The
review GIF is a recording of the app catching a failure that really happened.

## 4. The session cookie

`scripts/capture/session-cookie.mjs`. Auth.js is on `strategy: 'jwt'` (`auth.config.ts`), and
`auth.ts` states it plainly: *"No `session` rows are ever written."* So there is no session row to
forge — the session **is** the cookie, and minting one is a call to `encode` from `next-auth/jwt`
with `AUTH_SECRET`, `salt` set to the cookie name, and a payload of `{ sub, name, email }`.
`token.sub` is the whole contract: `authConfig.callbacks.session` copies it to `session.user.id`,
which is what `requireUserId()` returns.

Cookie name is `authjs.session-token` over http (local dev) and `__Secure-authjs.session-token`
over https; the script derives it from the target origin rather than hardcoding, and Auth.js uses
the same string as the JWE salt, so getting it wrong fails closed with a redirect to `/` rather
than a half-authenticated page.

It prints the cookie and exits, so `shoot.mjs` can inject it and a human can paste it into a real
browser to look at the seeded account by hand.

## 5. The capture script

`scripts/capture/shoot.mjs`, Playwright chromium, three passes over one browser context.

**Pass 1 — commit.** For each seeded extraction except the flagged one: `goto /x/<id>`, click
**"Confirm & save"**, await `/r/<id>`. This is the pass that makes the data real; records, badges,
insight-scope invalidation and `runs.reviewed_at` are all written by `commitReviewAction`. 19 runs
× ~2 s.

**Pass 2 — stills.** Eight PNGs at 390×844 DPR 2:

| File | Route | What it has to show |
|---|---|---|
| `01-runs.png` | `/` | the runs list with a real month of runs behind it |
| `02-upload.png` | `/upload` | the picker, with the three-screenshot explanation |
| `03-review.png` | `/x/<flagged>` | the consistency banner pointing at split 7 |
| `04-run-detail.png` | `/r/<id>` | the sanctioned dual-axis pace/HR chart + `PACE (FASTER ↑)` |
| `05-splits.png` | `/r/<id>` (scrolled) | the splits table twin under the chart |
| `06-trends.png` | `/trends` | 11 weeks, so the regression and rolling mean actually draw |
| `07-badges.png` | `/me` | the badge shelf, earned patches against `--paper` |
| `08-share.png` | `/s/<token>` | the public page, signed out (fresh context, no cookie) |

`08` uses a **cookie-free context** on purpose: the share page's whole claim is that it renders for
someone with no account, and a screenshot taken while signed in does not test that.

**Pass 3 — video.** Three recordings, `recordVideo` at 390×844, then ffmpeg:

| GIF | Recording |
|---|---|
| `hero.gif` | `/upload` → pick → the progress screen → the review screen → Confirm & save → `/r/<id>` |
| `review.gif` | the flagged extraction: banner, the pointed-at split, the correction, banner clears, save |
| `trends.gif` | `/trends` scrolled through its charts and the distance-band filter |

The hero's real extraction wait is ~33–38 s. It is **timelapsed, not faked**: the wait is recorded
in full and ffmpeg speeds only that span, and the README caption states the real number next to it.
Cutting to a finished screen would be the dishonest option; pretending the model is instant would
be worse.

## 6. GIF encoding

`scripts/capture/webm-to-gif.mjs` — Playwright writes webm, ffmpeg makes the gif in the two-pass
form, because a single pass quantises to the web-safe palette and the `--paper` blues posterise:

```
ffmpeg -i in.webm -vf "fps=12,scale=390:-1:flags=lanczos,palettegen=max_colors=128" palette.png
ffmpeg -i in.webm -i palette.png -lavfi "fps=12,scale=390:-1:flags=lanczos,paletteuse=dither=bayer:bayer_scale=3" out.gif
```

12 fps and 1× width are the budget: **≤ 2 MB per GIF, ≤ 8 MB for `docs/media/` entire**. The
script measures the output and fails loudly over budget rather than committing a 14 MB front page.
`/usr/bin/ffmpeg` is used; Playwright's bundled build is not on `PATH` and there is no reason to
prefer it.

## 7. The seeded dataset, designed rather than random

19 runs, **2026-06-08 → 2026-08-19** (11 ISO weeks). The shape is chosen so each screen has
something true to show:

- **≥ 4 weeks with runs**, so `/trends`' pace regression is not withheld and the 4-week rolling
  mean has real points — with **one deliberate empty week** so the visible-gap rule is on camera
  rather than merely implemented;
- **two distance bands** (a 5 km cluster and a 10 km cluster) so the band filter has two states;
- **one hard session** whose zone split and fading pace genuinely trip `HIGH_DECOUPLING` and
  `TOO_MUCH_HARD`, because that is the flag set the InsightCard is interesting for;
- **one negative-split run** and one metronomic run, so `negative_split` and `metronome` are earned;
- **a 05:10 start and a 21:40 start**, so `early_bird` and `late_start` fall out of the rules;
- **month totals above 100 km**, so `century_club` is a real award on a real month.

No badge and no record is ever inserted by the seed. Every one on the shelf is there because
`evaluateBadgesForCommit` put it there — which is also a live end-to-end exercise of F09 and F06
against 19 runs, something no unit fixture does.

## 8. The README

Structure — visual tour on top, engineering record kept below, one document:

```
# Run Insights            one line · runins.site · hero.gif
## What it does           5 stills, one sentence each
## The pipeline           the existing ASCII diagram, unchanged
## Try it                 getting started, trimmed
──────
## Why this repo starts with documents
## Why 108/108 still means a human checks every run
## Every number is computed in TypeScript
## One chart is allowed to break the rules, and it argues its case
## The badge art is made by hand, one patch at a time
## The documents · The stack · Build order
## How these screenshots are made          (new, short)
## Licence
```

The prose below the line is the reason this repo is worth a second look, and it is kept. What
changes is that it is no longer the *first* thing a visitor meets, and that it is corrected.

**Three factual corrections the rewrite owes:**

1. The shipped list stops at **F11** and asserts *"all 22 patches generated … v0.1.0 is
   feature-complete."* `docs/plans/` now runs to **F18** — F12 badge panel, F13 award ledger, F14
   mobile keyboards, F15 badge master aspect, two F16s, F17, F18. Feature-complete against the
   original scope, then seven more features.
2. Two consecutive paragraphs both open **"That last row"** and point at *different* rows. One of
   them is a copy-edit fossil.
3. `docs/plans/` is described as "F01–F11, ~11,700 lines", which the tree contradicts.

**And one line that is not optional:** the screenshots are seeded demo data, and the README says
so, in the section that explains the harness. A repo whose front page argues that a model was
caught inventing "5.00 km" for a 10.67 km screenshot does not get to publish a dashboard of runs
nobody ran without saying which it is.

## 9. What CI must still pass, and what is deliberately not added to it

The gate is `.github/workflows/ci.yml`, read out in order: seven bespoke guards
(`ci:openrouter-guard`, `badges:check`, `ci:data-layer-guard`, `ci:client-secret-guard`,
`ci:f08-guard`, `ci:llm-payload-guard`, `ci:f11-guard`), then `format:check`, `lint`, `typecheck`,
`test`, `build`.

Two things this card touches that the gate will notice:

- **`playwright` as a devDependency.** CI runs `npm ci`, which installs the JS package and **no
  browser** — browsers only arrive via `playwright install`, which nothing in CI calls. Pinned to a
  version whose chromium build is already in `~/.cache/ms-playwright/`, so local capture downloads
  nothing either.
- **`prettier` and `eslint` over `scripts/capture/*.mjs`.** New files, same rules as
  `scripts/*.mjs`; `format:check` is the whole reason to write them formatted the first time.

No new `ci:` script. Per **F19-D4**, capture produces bytes and asserts nothing, so there is
nothing for CI to check that CI could act on.

## 10. Cleanup, and the property that makes it safe

`--purge` issues `DELETE FROM "user" WHERE id = <demo id>` and deletes the three demo blobs. The
cascade is the roadmap's §4.3 property — 15 of 17 FKs — and it is what makes seeding into the live
database acceptable rather than reckless: the demo user's runs, splits, zones, photos,
extractions, insights, records, badges and shares are reachable **only** through its `user` row, and
that row is the only thing the seed creates outside of Blob.

The verification is a count, not a hope: after purge, `select count(*) from "user"` must be 1 and
every child table's demo rows must be 0. The script prints both. `npm run blob:reap` is the
independent safety net for the blobs, and the `reap-orphaned-blobs` skill already knows what
"orphaned" means here.

## 11. Risks, and the honest state of each

| Risk | Handling |
|---|---|
| The minted cookie is rejected — wrong salt, wrong claim shape | Fails closed: `requireUserId()` redirects to `/`, so pass 1 lands on the sign-in screen instead of committing. The script asserts it is signed in (a `/me` fetch) before pass 1, so this fails in 2 s rather than 19 commits later. |
| The seeded payload trips a check the plan mis-derived | Pass 1 fails visibly on the first run, not silently — `commitReview` returns `ok: false` and the page stays put. Blast radius is one seeded row. |
| Playwright's cached chromium does not match the pinned package | It downloads once. Slower, not broken. |
| Seeding writes to the live database | Mitigated, not eliminated. One extra `user` row, cascade-deletable, verified by count. This is a stated trade, not an oversight. |
| A GIF over budget | The encoder fails on the byte count. |

## 12. What the work taught

The plan's shape held. Its numbers did not, and four of its statements were wrong in ways only the
doing could show.

**The dataset is 25 runs plus the fixture, not 19 or 26.** §3 said 19 and §5 said 26 — the design
grew while the plan was being written and the two sections were never reconciled. The shipped table
is 25 generated runs over 2026-06-09 → 08-19, plus one uncommitted fixture, plus one real upload
from the hero recording. **20 of the 22 badges are earned by the real rules.**

**The flagged run should not have been generated at all — it should be the fixture.** The plan had
`shoot.mjs` inject a misread into a synthetic payload. That works, and it is subtly dishonest: the
review screen renders the uploaded screenshots in a strip directly above the fields, so a generated
payload puts a real screenshot reading `1:18:36` above a field reading something else, on the one
screen whose whole job is catching exactly that kind of disagreement. Using
`research/fixtures/golden-response.json` makes the strip and the fields describe the same run, puts
the genuine vendor JSON in `raw_response`, and lets the screenshot show F05's year-less date guess
doing real work. The misread is also **km 1**, not km 7 — `checks.ts` names it at CHK-1's tolerance
and the plan misread its own citation.

**`runs.extraction_id` does not cascade, and this is the one place it matters.** §10 leaned on
"15 of 17 FKs cascade" without checking which two do not. `resetHeroUpload` deleted extractions
first and got `runs_extraction_id_extractions_id_fk` — correctly, since §4.3's rule is that the run
references the audit trail and never the reverse. The run has to go first.

**Two of the four checks would have passed a broken fixture.** The first version broke split 7 by
19 s against a 22 s tolerance, and every check stayed green. Nothing cross-checks a mid-table pace
against its own row, so only a row whose error moves the *split sum* past CHK-1's band is findable
at all. `tests/capture/dataset.test.ts` now pins the 40 s the real miss was worth, and the four
calibration figures `checks.ts` quotes for its tolerances (6 s, 121 s, 0.14 s, 1 s).

### Five things the plan could not have known

- **Pass order is load-bearing, and the dependency is not obvious.** The hero recording uploads a
  real run dated a day after anything the seed writes. That run falls inside the current ISO week,
  so it changes the week's facts — and `insights` is keyed by a hash of those facts. Warming the
  cache before the hero commits produces a `/trends` screenshot whose header reads 47.87 km above
  prose reading "3 runs, 37.2 km". Worse, the commit is a Server Action the recording does not wait
  for, so it can land *after* the pass returns: the stills and the GIFs disagreed with each other
  for two runs before the cause was clear. The pass now ends when the database says the run exists.
- **A burst of commits throttles the narrative endpoint, and the app reports it as nothing.**
  Committing 25 runs fires ~20 insight calls in about a minute, because every commit redirects to
  `/r/[id]` where `InsightTrigger` generates that run's prose. The following cron call then returns
  `{"generated":0,"failed":0}` — R-17's honest null-payload state, working exactly as specified —
  and the only visible symptom is an empty card in a screenshot. The warm pass retries.
- **Framing by pixel offset does not survive model output.** Scroll offsets were chosen against a
  layout whose tallest element is LLM prose, whose height is not stable between two capture runs of
  the same data. Every still now seeks its subject by selector. Two of them still collided:
  `querySelector('table')` finds `ChartFrame`'s table twin, not the splits table, and produced two
  byte-identical PNGs that twelve logged paths did nothing to reveal. There is now a hash check.
- **Selecting runs by list position is a bug waiting for the hero.** `[0]` and `[1]` meant "the
  long run" and "a typical 10 km" until the hero committed a newer run and shifted everything by
  one — silently relabelling the frames. Runs are now chosen by reading the distance off each card.
- **The GIF budget was the most useful constraint in the plan.** It failed four times and every
  failure was a real finding: 8.4 MB found a 90-second recording that had stalled on the
  duplicate-upload guard; the ladder found that dithering costs ~20% for nothing visible at 64
  colours on a flat interface; `mpdecimate` returned less than hoped (~18%) because the pending
  screen animates an `ri-pulse` skeleton; and the fourth GIF was dropped rather than raise the
  ceiling it broke.

### Three findings about the app, for their own cards

- **`1 check still disagree`** — the review screen's sticky bar does not pluralise. Visible in
  `docs/media/03-review-banner.png`.
- **No `prefers-reduced-motion` anywhere.** `globals.css` defines `ri-pulse` and `ri-spin` and nine
  call sites run them `infinite`, with no reduced-motion guard in the stylesheet.
- **The pace/HR chart crowds its x-axis past ~20 splits.** On the 21.2 km run, 22 tick labels
  overprint into an unreadable smear at 390 px. The README's chart frame deliberately uses a
  10.5 km run instead, which is the modal distance — but the long-run case is a real limit.
