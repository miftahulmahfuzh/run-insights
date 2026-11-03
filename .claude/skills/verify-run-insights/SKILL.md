---
name: verify-run-insights
description: Prove a Run Insights change works by driving a real, throwaway copy of it (Next dev server signed in as a seeded runner, its own local Postgres with pgvector, a local stand-in for Neon and Vercel Blob, the real z.ai LLMs under a per-run call budget) and capturing evidence. Use before reporting any app/, components/ or lib/ change as done, when a plan's Proof section names feature-map entries, when a verifier must confirm another agent's work, or to reproduce a bug on main. Never touches the production Neon database, the production Blob store (shots/, nina/), web push, Google sign-in, Vercel, GitHub workflows or the owner's accounts; OpenRouter (Nina's photos, embeddings) only behind --openrouter.
---

# verify-run-insights

"Tests pass" is not proof (vitest runs against a fake DB driver and never calls a model). Proof is
the code under test, running, doing what the runner does, with the action and the resulting state
saved as evidence a reviewer can open. Everything goes through one script, run from the checkout
(or worktree) being verified:

```sh
V=.claude/skills/verify-run-insights/scripts/verify.sh
$V            # usage
```

The script is bash (shebang), so the zsh the Bash tool may run does not matter. Never hand-write
launch sequences, never `npm run dev` for verification (`.env.local` is production), and never
`pkill node` / `pkill -f "next dev"`: the owner's dev server and other runs look the same.

## Launch

```sh
$V up                      # demo runner, 25 committed runs, real LLM (25 calls): RUN= URL= EVIDENCE= MODE=  (~60 s)
$V up --seed=review        # demo runner, 26 extractions waiting at /x/<id>, nothing committed   (~20 s)
$V up --seed=new           # a bare signed-in user with no profile: / goes to /onboarding        (~20 s)
$V up --offline            # no paid call leaves; every z.ai call is refused (plumbing only, NOT proof)
$V up --llm=40             # a bigger z.ai budget (default 25 calls)
$V up --openrouter=2       # also allow OpenRouter (Nina's photographs, embeddings, chat fallback), 2 calls
```

What a run is:

- **Postgres**: database `v_<run>` in the Docker container `run-insights-pg-verify`
  (`pgvector/pgvector:pg16`, 127.0.0.1:55438, created on first use, left running). `up` applies
  every `drizzle/*.sql` in `meta/_journal.json` order, each file in one transaction, and records it
  in `drizzle.__drizzle_migrations` (drizzle-kit itself cannot reach a local Postgres: the repo ships
  only Neon's HTTP driver).
- **Stand-in** (`scripts/standin.mjs`, one loopback port): Neon's HTTP `/sql` protocol in front of
  that database, the Vercel Blob API (`put`, `del`, `head`, `list`, `copy`, `rename`, the browser's
  client-token PUT with its signature and options enforced), the stored blobs' bytes, and the
  paid-call budget. `scripts/preload.mjs` (in every Node process via `NODE_OPTIONS`) routes the app's
  `neon()` fetches and the fake store's `https://riverifystore0000.public.blob.vercel-storage.com/...`
  URLs to it. No app code changes.
- **App**: a snapshot of the checkout (rsync without `.env.local`, `.vercel`, `.git`, `docs`, badge
  masters; `node_modules` hard-linked) served by its own `next dev` on a free port. A snapshot because
  Next 16 locks `.next/dev` per project directory. `up` returns once `/me` answers 200 signed in.
- **Runner**: `--seed=demo|review` run the README capture harness's own seeder,
  `scripts/capture/seed-demo.mjs` (user `demo-<base36>`, profile, 25 runs' extractions plus the
  flagged canonical fixture, the three shipped screenshots put into the run's store). `demo` then
  commits the 25 through the real review screen (`features/steps/seed-commit-all.mjs`, the harness's
  commit pass in the fenced browser). `new` inserts `ri-verify-runner`, not onboarded.
- **Session**: a cookie minted with `scripts/capture/session-cookie.mjs` and the run's random
  `AUTH_SECRET`. `ADMIN_EMAILS` is the seeded runner's email, so `/admin` opens. Auth.js is not
  bypassed: the cookie is a JWT it decrypts like any other.
- **Env**: the server starts from `env -i` with only the run's values (see Gotchas for each one).

Runs are isolated: parallel verifiers each `up` their own. Measured 2026-11-03: two runs up at once,
an upload, a share and a Nina chat written in one, all absent from the other's database and store.

## Doctor

```sh
$V doctor RUN
```

Read-only. Checks the stand-in, that `next` is alive and owns its port (process group, not a
name), that `/me` answers 200 as `Demo Runner`, the database (migrations, runs, extractions,
`nina_messages`, `push_subscriptions`), the run's blob count, mode and budget, and the egress fence:
from a process with the server's exact env and preload, `api.github.com`, a foreign Blob store and
`console.neon.tech` must be `blocked` and the fake store must answer 404 from the stand-in. It also
counts the paid calls refused and hosts blocked so far. Run it before the first drive and after any
surprise.

- `code WARN HEAD moved` / `working tree changed since up`: the snapshot is stale. `down` + `up`.
- `budget SEEDING`: `up` died before arming; `down` it.
- `egress N paid call REFUSED POST https://api.z.ai`: calls the budget refused (seeding, or spent).

## Drive

| Surface | Command | Notes |
| --- | --- | --- |
| Web page (text) | `$V api RUN GET /path` | Signed in. HTML saved whole; the visible text (aria-labels as `[label]`) printed. |
| HTTP route | `$V api RUN POST /api/... '{json}'` | Cookie + same-origin `Origin`. JSON in, status and body out. |
| Upload | `$V upload RUN [kind=]a.jpg ...` | `UploadPicker`'s sequence: `/api/upload` token, Blob PUT, `POST /api/extract`, poll `/api/extract/<id>`. Kinds default to summary, splits, heartrate in order. Prints `EXTRACTION=`. |
| Browser | `$V ui RUN steps.mjs [--width 390] [--theme light] [-- ARG...]` | Playwright, signed in, fenced network. Video, screenshots, console errors. Default 390 px dark. |
| Cron | `$V cron RUN rollup\|nina` | The Vercel cron route with the run's own `CRON_SECRET`. |
| State | `$V sql RUN "select ..."` | Read-only transaction. Writes are refused. |
| Blobs | `$V blobs RUN [shots/\|nina/]` | The run's stand-in store. |
| Server log | `$V logs RUN [REGEX] [N]` | Matching `next.log` lines (default: errors, refusals, blocks). |
| Budget | `$V budget RUN` | Paid calls spent / left / refused, and the last ones made. |
| Log | `$V note RUN "what this proved"` | Appends to `evidence/LOG.md`. |

A steps file (the ones in `features/steps/` run as they are; put ad-hoc ones in the scratchpad):

```js
const steps = async ({ page, base, shot, log, fixture, args }) => {
  await page.goto(`${base}/x/${args[0]}`, { waitUntil: 'networkidle' }) // let it hydrate
  await page.getByText('Nothing has been saved yet.').waitFor()
  await page.getByRole('button', { name: 'Confirm & save' }).click()
  await page.waitForURL(/\/r\/[^/]+$/, { timeout: 90_000 })
  await shot('committed')
  log(`committed ${new URL(page.url()).pathname}`)
}
export default steps
```

`fixture('1.jpg')` is `research/fixtures/screenshots/shipped/1.jpg` (summary; `2.jpg` splits, `3.jpg`
heart rate). Use roles and aria-labels: `grep -rhoE 'aria-label="[^"]+"' app components | sort -u`.
Copy lives in constants (`lib/share/copy.ts`, `components/nina/chatScreenCopy.ts`); several Nina and
admin labels are Indonesian on purpose (`Chat baru`, `Kosongkan`). Never coordinates. `ui` fails on a
console error, a page error, ending on the signed-out screen ("Continue with Google"), or horizontal
scroll.

Examples, one per surface:

```sh
$V api RUN GET /me                                   # "Personal records ... Badges 20 earned 2 to find"
$V upload RUN research/fixtures/screenshots/shipped/{1,2,3}.jpg   # status "ok" in ~30 s, EXTRACTION=<id>
$V ui RUN .claude/skills/verify-run-insights/features/steps/review-commit.mjs -- <id>
$V cron RUN rollup                                   # {"ok":true,"users":N,"generated":...}
$V sql RUN "select role, source, left(text,120) from nina_messages order by seq"
$V blobs RUN shots/
```

## Targeted, not exhaustive

z.ai is the product (vision read, narratives, Nina), so it is real by default, under a per-run
budget of **25 calls** (`--llm=N` to change). Every fetch to the configured `LLM_BASE_URL` /
`LLM_VISION_BASE_URL` host takes one call from the stand-in; an empty budget makes the fetch fail
like a vendor outage (the app shows its own failure state). Pick the feature-map entries the change
touches; the index lists what each journey spends. Measured costs:

| Journey | z.ai calls |
| --- | --- |
| `up` (seeding is refused, unspent) | 0-2 (in-flight work that lands after arming) |
| upload + vision read | 1 (2 if the repair pass fires) |
| commit a run | 2-3 (session narrative on `/r/<id>`, Nina's `run_committed` reaction in `after()`) |
| one Nina chat turn | 3-5 (one per tool round) |
| `cron rollup` with an active runner | up to 2 (week, month) |
| `cron nina` with an active runner | 0-2 |
| first view of a run with no narrative | 1 (0 on a re-view) |

OpenRouter is peripheral and per-image money (~$0.04 a photograph): off unless `--openrouter[=N]`
(default 3 when bare). Never raise budgets to make a journey pass; a journey that needs more calls
than the table says is a finding.

## Evidence

Everything lands in `~/.local/state/run-insights-verify/<RUN>/evidence/`, numbered in drive order:
`NN-api-*.txt` (+ `.html`), `NN-upload-*.txt`, `NN-cron-*.txt`, `NN-sql-*.txt`, `NN-blobs-*.txt`,
`NN-logs-*.txt`, `NN-ui-*.{txt,png,webm}`, `00-seed-commit*` (the demo commit pass), `LOG.md`, and
after `down`: `zz-next.log`, `zz-standin.log` (every SQL statement, blob write and paid call),
`zz-seed.log`, `zz-commit.log`, `zz-migrate.log`, `zz-budget.json`, `zz-meta`.

Proof standards:

- Drive the real user path: the page, button or route the runner uses, not a lib function or a
  test hook. Writes go through the app (`ui`, `api`, `upload`, `cron`). `sql` only reads.
- Capture the action AND the resulting state. A 202 is not proof that a run exists: read the row
  back with `sql`, and re-render the page that shows it.
- For a bug fix, show the failure first (a run from `main`, or before the fix), then the pass.
- LLM output is nondeterministic: assert on structure (`extractions.status`, the `insights` row and
  its model, `nina_messages` rows by `role`/`source`, `nina_turns.status`, the budget counter) and
  quote text only as support. One miss earns one re-run; two misses are a finding.
- **Read the PNGs.** A green `ui` exit only means nothing threw.
- A step you could not drive is `inconclusive` with its reason. Never weaken a journey to make it
  pass. A `MODE=offline` run is not proof of anything that needs a model.

The report you hand back lists the evidence files that prove each claim, one line each.

## Cleanup

```sh
$V down RUN       # kills exactly the process groups up started, drops v_<run>, deletes the snapshot and blobs
$V down --all     # every run still up
$V ls             # runs, state, mode, seed, evidence count
```

Evidence survives `down`. Run `down` after every run, failed ones included. The container
`run-insights-pg-verify` stays up for the next run; it holds nothing but `v_*` databases.

## Feature map

`features/README.md` indexes what the app does and what proves each feature works, one file per
feature. A plan's **Proof** section names entries from it. A change that adds or alters a
user-facing feature updates its entry in the same change. A journey that fails because the app is
wrong is a product bug: report it, do not edit the entry to match.

## Gotchas

- **Never driven, no flag turns them on (harmful):**
  - The production Neon database. `.env.local`'s `DATABASE_URL` IS production (there is no dev
    instance); the snapshot has no `.env.local`, the server env never holds that URL, and the
    preload refuses every Neon host.
  - The production Blob store (`shots/`, `nina/`). `BLOB_READ_WRITE_TOKEN` is a per-run fake for
    the store id `riverifystore0000`; `VERCEL_OIDC_TOKEN` and `BLOB_STORE_ID` (which the Blob SDK
    prefers over the token) are never in the env; any other `*.public.blob.vercel-storage.com` host
    is refused by the preload and aborted by the browser.
  - Web push. `VAPID_*` is a throwaway pair minted per run, the browser is never granted
    notifications, and the run's database only ever holds subscriptions its own browser made (none,
    in practice: `doctor` prints the count). `lib/push/send.ts` posts with `node:https`, which the
    fetch guard does not see, so this is structural rather than fenced: no real subscription is
    reachable from a run.
  - Google sign-in (`AUTH_GOOGLE_*` are placeholders; the session is minted), Vercel (no `.vercel`
    link, no `VERCEL_*`), and GitHub (`.github/workflows/nina-image.yml` is a scheduled backstop
    that reads production; nothing here dispatches it, and the app has no dispatch token any more).
  - The repo's own ops scripts (`npm run nina:*`, `blob:reap`, `capture:*`, `thumbs:backfill`,
    `records:backfill`, `db:migrate`, `/update-nina-profpic`, `/photoshop`, `/redo-image-gen-job`):
    they all load `.env.local`, i.e. production. A verify run never calls them; the demo seeder is
    run inside the snapshot with the run's env, never `npm run capture:seed`.
- **Off unless a flag opts in:** OpenRouter (`--openrouter`): Nina's photographs, album embeddings,
  the chat fallback model and photoshop. Without it `OPENROUTER_API_KEY` is empty, so `ninaEnv()`
  throws "INVALID NINA ENVIRONMENT" wherever she would reach for it: a photo request fails as a
  job, album search falls back to words, and when z.ai fails she has no fallback. That is the
  expected end state, not a bug.
- **Decided here, because the code cannot say (2026-11-03, nobody to ask):** z.ai is the product, so
  it is real by default at 25 calls; OpenRouter is peripheral money and stays off; seeding refuses
  paid calls rather than spending them (so the 25 demo commits leave no session narratives and no
  `run_committed` openers; the first visit to a demo run's `/r/<id>` generates one, for 1 call); the
  demo commit pass reuses the harness seeder but not `shoot.mjs` itself, whose browser is not fenced
  and would fetch the fake store's URLs from the real Vercel host.
- **Egress control is best effort.** The preload wraps `globalThis.fetch` (Next wraps it later, so
  the guard stays underneath) and the Anthropic SDK, the vision client, OpenRouter and the Blob SDK's
  reads all go through it. Code on `node:http(s)` directly (web-push) is not covered. The server has
  no dead proxy: Turbopack fetches Poppins for `next/font/google` in Rust, and the font CDN is the
  only other allowed host.
- **The crons see no one on demo data.** `/api/cron/rollup` and `/api/cron/nina` only look at
  runners with a run in the last 60 days, and the demo's newest run is 20 Aug 2026. Commit a run
  re-dated to this week first (`review-commit.mjs -- <id> <YYYY-MM-DD>`), then call the cron.
- `--seed=new` has no profile, so `/upload`, `/r` and friends redirect to `/onboarding` until the
  onboarding journey has run.
- The snapshot does not follow your edits. `down` + `up` after changing the app.
- The first hit on each route compiles it (5-20 s once). Steps use `waitUntil: 'networkidle'`
  before clicking: a click before hydration is silently dropped (React 19).
- `onUploadCompleted provided but no callbackUrl could be determined` in `next.log` on every
  `/api/upload`: the Blob completion webhook needs a public URL. The app's handler only logs, so
  nothing depends on it.
- A demo run starts with ~25 `nina_turns` rows `failed / unavailable` (and as many Text rows on
  `/admin/error-logs`): the `run_committed` reactions seeding refused. Filter by `created_at`.
- `next.log` noise that is not a finding: `uncaughtException: Error: aborted` (`ECONNRESET`) right
  after the demo commit pass (its browser closes while the last page's server action is in flight),
  and `egress BLOCKED GET https://registry.npmjs.org/-/package/next/dist-tags` (Next dev's version
  check).
- A demo run's session email is `demo-<base36>@demo.invalid`; nothing real sits in a run.
