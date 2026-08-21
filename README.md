# Run Insights

Screenshot your Apple Watch run. A vision model reads it. Get coaching-grade analysis of that
run, that week, and that month.

**[runins.site](https://runins.site)** · v0.1.0 · shipped: **F01** foundation, **F03** data layer, **F02** auth &
profile, **F04** ingest & vision extraction · next: F05 review & correction

```
1–3 screenshots  ──►  glm-4.6v extraction  ──►  REVIEW & CORRECT  ──►  runs
   │                   (background, ~33 s)         (mandatory)           │
   └──► extractions ──► run_photos                                       ▼
                                             deterministic metrics ──► glm-5.3 narrative
                                                        │
                                                        ├──► personal records
                                                        └──► badge evaluation
```

---

## Why this repo starts with documents

Every number below was **measured against the live API before a line of application code was
written**, using three real Apple Fitness screenshots and a hand-transcribed 108-field ground
truth. The scripts are in [`research/`](research/) and re-run in one command.

That research killed the original plan. It was going to use GLM-5.2, which turns out to be
text-only, on an endpoint that **accepts images, returns HTTP 200, and silently discards them** —
after which the model invents plausible numbers. Asked for the distance in a screenshot showing
10.67 km, it answered *"5.00 km"*, confidently.

| What was measured | Result |
|---|---|
| Extraction accuracy, 3 screenshots → 108 fields | **108/108, five runs in a row** |
| Median latency | 33.7 s |
| Best preprocessing | JPEG q80 @ 560w — 170 KB, 3,277 tokens, no accuracy cost |
| Cost per run | ~$0.006 |
| LLM computing its own metrics | **aerobic decoupling came back −14.1% when the truth is +12.3%** |

That last row is why every number in this app is computed in TypeScript and the LLM only writes
prose about numbers it was handed.

---

## The documents

| File | What it is |
|---|---|
| [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) | The feasibility record. Endpoint matrix, measured accuracy, the token-floor trap. Authoritative on everything it measured. |
| [`ROADMAP_v0.1.0.md`](ROADMAP_v0.1.0.md) | Scope, the 17 locked decisions, and §4 — the authoritative shared contract every feature builds against. |
| [`RECONCILIATION_v0.1.0.md`](RECONCILIATION_v0.1.0.md) | 39 rulings arbitrating eleven plans written in parallel. **Supersedes any individual plan file.** |
| [`docs/plans/F01`–`F11`](docs/plans/) | One comprehensive plan per feature, ~11,700 lines. |
| [`docs/design/DESIGN_INTEGRATION.md`](docs/design/DESIGN_INTEGRATION.md) | What came back from Claude Design and how it overrode the plans. |
| [`docs/google-auth-setup.md`](docs/google-auth-setup.md) | Google OAuth + DomaiNesia DNS, step by step. |
| [`research/`](research/) | The live feasibility harness and the 108-field fixture. Stays in the repo; `score.mjs` runs in CI. |

**Read `RECONCILIATION_v0.1.0.md` before any plan file.** The eleven plans were written
concurrently and three of them contradicted each other; several also found real bugs in the
roadmap they were built against — a duplicate-upload guard that stopped guarding on NULL, an
acute:chronic workload ratio algebraically pinned at 0.25 that could never fire, and a %HRmax
figure computed against a formula the runner's own watch had already disproved.

---

## The stack

Next.js 16 App Router · Drizzle + Neon Postgres · Vercel Blob · Auth.js v5 (Google) · Recharts ·
Tailwind v4 · Vitest · Vercel.

Two LLM clients, deliberately: **`glm-4.6v`** for vision on z.ai's OpenAI-shaped coding endpoint
(plain `fetch` — the Anthropic SDK cannot be pointed at it), and **`glm-5.3`** for narrative on
the Anthropic-compatible endpoint. Badge art is generated offline by a skill against
`qwen/qwen-image-3-pro` and committed; nothing generates images at runtime.

## Build order

`F01` → `F03` → `F02` → **`F04` → `F05`** → `F06` → `F08` → `F07` → `F09` → `F11` → `F10`

**F04 (extraction) and F05 (review) are the project.** Everything else is competent CRUD over a
good schema.

## Getting started

```bash
cp .env.example .env.local     # then fill it — see docs/google-auth-setup.md
node research/show-metrics.mjs # deterministic metrics, no API key needed

npm run db:smoke               # is Neon reachable on the pooled string?
npm run db:migrate             # apply drizzle/ to the database
npm test                       # unit suites; never touches a database, never calls an LLM
TEST_DATABASE_URL=<pooled url> npm run test:int   # the real-Postgres suite
npm run test:live:vision       # opt-in: calls glm-4.6v for real. Costs money
```

Uploading a run needs a Vercel Blob store linked to the project (`BLOB_READ_WRITE_TOKEN`).
`scripts/f04-e2e-probe.mjs` walks the whole ingest pipeline once against the real Blob store, the
real model and the real database, then deletes what it made:

```bash
node --env-file=.env.local scripts/f04-e2e-probe.mjs path/to/a-screenshot.png
```

Sign-in needs a Google OAuth client — `docs/google-auth-setup.md` has the console walkthrough.
Leave `AUTH_URL` **empty** locally and on preview; it is production-only, and Auth.js infers the
origin from the request everywhere else.

`npm test` is safe by construction: `tests/integration/**` is excluded unless
`VITEST_INTEGRATION=1`, `tests/live/**` unless `LLM_LIVE_TEST=1`, and every other suite runs
against a recording fake driver that generates real SQL and sends none of it anywhere. The vision
client is exercised with an injected `fetch`, so the token-floor guard is tested against the
measured failure body without a network.

The live vision suite additionally needs the three canonical screenshots, which are **no longer in
the repo or the image cache**. It skips with a message naming what is missing —
`docs/plans/F04-ingest-extraction.md` §13 records which tasks that leaves open.

## Licence

Personal project. No licence granted.
