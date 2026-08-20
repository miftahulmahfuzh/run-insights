# F01 — Foundation & Deployment

**Depends on:** nothing. This is Wave 1.
**Unblocks:** F03 (data layer), F02 (auth — already drafted against this plan's `lib/env.ts`
shape), and via them everything else.
**Authoritative contract:** `ROADMAP_v0.1.0.md` §3 (pinned versions), §4 (shared contract, esp.
§4.1 env, §4.8 routes, §4.9 testing). `IMPLEMENTATION_PLAN.md` is authoritative on every
measured number this plan relies on (extraction latency, the endpoint trap, why the LLM must
not compute) — this plan does not re-derive those, it builds infrastructure around them.

> **Read this first, seriously:** `AGENTS.md` at the repo root says Next.js here has breaking
> changes versus training data and points at `node_modules/next/dist/docs/`. That directory
> does not exist until Task 2 installs `next`. Once it does, **read
> `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` and
> `.../03-file-conventions/02-route-segment-config/maxDuration.md` before writing a line of
> `/api/extract`** — §2 of this plan is built entirely on what those two files say, not on
> memory of an older Next.js. `next dev` will also regenerate the managed block in `AGENTS.md`
> on first run (Task 24 here) — that is expected; commit it.

---

## 0. What this feature owns

| Owns | Does **not** own |
|---|---|
| `package.json`, lockfile, all npm scripts | `lib/db/schema.ts`, migrations, queries (F03) |
| `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` | `auth.ts`, `auth.config.ts`, `proxy.ts` (F02) |
| `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` | `lib/metrics/*`, `lib/records/*`, `lib/badges/*` (F06/F09) |
| `.gitignore`, `.env.example`, `.env.local` scaffolding | `lib/llm/vision.ts`, `lib/llm/narrate.ts`, `lib/llm/extract.ts` (F04) — **F01 decides the background-job mechanism they must build inside; F01 does not write the extraction code itself** |
| `lib/env.ts` — the two-LLM-client + Neon core group, eager; lazy groups reserved for F02/F04/F06/F07 | Any feature UI, any page beyond a placeholder `/` |
| `drizzle.config.ts` (config only, not the schema) | Tailwind `@theme` token *values* (design system, pulled in later) |
| `app/layout.tsx`, `app/globals.css` (skeleton only) | `research/*.mjs` content — F01 only wires `score.mjs` into CI, per D13 |
| `app/api/health/route.ts`, `scripts/db-smoke.mjs` | The badge-art skill, `tools/gen_badge_art.py` (F10) |
| `.github/workflows/ci.yml` | |
| Vercel project, env vars, Blob store, Neon connection | |

---

## 1. Preflight

Verified on this machine before writing a single file:

```bash
cd /home/miftah/run-insights
node -v && npm -v && git config user.email && git remote -v
```

```
v22.23.1
12.0.1
mahfuzh74@gmail.com
origin  git@github.com:miftahulmahfuzh/run-insights.git (fetch/push)
```

Node ≥ 22 satisfies Next 16's `>=20.9` floor and, more importantly, gives the Neon WebSocket
driver a global `WebSocket` with **no polyfill** — the same reason `expense-tracking` pins
Node 22 in `engines`.

The repo already has an uncommitted `.git`, three root docs, `docs/design-brief.md`, a drafted
`docs/plans/F02-auth-profile.md` (which already assumes this plan's `lib/env.ts` shape — do not
diverge from what it expects: a core group plus lazy `authEnv()`), `research/` (ten scripts and
four result JSONs — the feasibility harness, kept per D13), and an `.env.local` holding four
empty keys: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `OPENROUTER_API_KEY`. No `DATABASE_URL`
yet — Task 16 adds the placeholder, a real Neon project is a Task 26 precondition.

| Value | Source | Known now? |
|---|---|---|
| `LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */` / `LLM_API_KEY` (same z.ai key works both endpoints — see roadmap §4.1) | z.ai console | integrator supplies |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Neon console, **create the project in `ap-southeast-1`** — see §5 Q1 | integrator supplies |
| `AUTH_SECRET` | generated in Task 17 | generated locally |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | F02's walkthrough | not yet — F01 reserves the schema slot only |
| `BLOB_READ_WRITE_TOKEN` | Vercel CLI `blob create-store`, Task 29 | not yet |
| `CRON_SECRET` | generated in Task 17 (F07 consumes it) | generated locally |
| Vercel account | vercel.com, Hobby plan (this plan stays on Hobby — see §2) | |

> **Secrets discipline**, unchanged from the sibling app: `.env.local` is git-ignored (Task 5)
> and must stay that way. Never paste a real key into `.env.example`, this plan, or a commit
> message.

---

## 2. THE decision — how extraction runs as a background job (D4)

This is the single most consequential call F01 makes, because every downstream feature (F04's
extraction, F05's review screen, F09's badge evaluation timing) is shaped by it. Roadmap D4 says
only "background job, never inside a request." This section is F01 discharging that decision
into an actual mechanism, with the platform limits pinned down.

### 2.1 The constraint, restated precisely

From `IMPLEMENTATION_PLAN.md` §1.3 and §2.3, measured against the real fixture:

| Quantity | Value | Source |
|---|---|---|
| Extraction latency, median (thinking off, 3 images, 1 call) | **33.7 s** | §1.3, 5-run stability test |
| Extraction latency, worst observed (5-run sample) | **41.1 s** | `research/results-repeat.json` |
| Extraction latency, thinking **on** | 73 s | §1.3 — 2× cost for zero accuracy gain; thinking must stay off |
| Vercel Hobby function ceiling | **60 s** (`maxDuration`, configurable up to this on Hobby) | roadmap D4, `IMPLEMENTATION_PLAN.md` §2.3 |

`33.7`–`41.1` s already consumes 56%–68% of a 60 s budget **before** Zod validation or a repair
round-trip. `IMPLEMENTATION_PLAN.md` §2.3 is explicit: *"That is too tight for `fetch → 33 s →
Zod → repair`. Extraction must not run inside the request."*

### 2.2 What Next.js 16 actually offers here — read from `node_modules/next/dist/docs/`

Two files, and only two, are relevant (confirmed by grepping the installed docs tree for
`waitUntil`, `background function`, `maxDuration`):

- `01-app/03-api-reference/04-functions/after.md`
- `01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`

**There is no separate "Vercel Background Functions" primitive documented in Next.js itself.**
The framework's one mechanism for "do work after the response is sent" is `after()` from
`next/server`, usable in Route Handlers, Server Actions, Server Components and `proxy`. Its
own doc is blunt about the budget: *"`after` will run for the platform's default or configured
max duration of your route"* — i.e., **the background work shares the same `maxDuration` clock
as the request that scheduled it.** Deferring work with `after()` does not buy extra wall-clock
time; it only decouples *when the client gets a response* from *when the server-side work
finishes*. That distinction is exactly what D4 needs, and exactly what it doesn't solve on its
own (see §2.4).

On Vercel specifically, `after()` is backed by the platform's `waitUntil(promise)` primitive
(documented in the same file's "supporting `after` for serverless platforms" appendix): Vercel
keeps the invocation alive until every promise passed to `waitUntil` settles, up to the route's
`maxDuration`. Route Segment Config confirms `maxDuration`'s default is *"Set by deployment
platform"* and is overridable per-route via `export const maxDuration = <n>`.

**Chosen mechanism: `after()` self-invocation, not a queue.**

```
POST /api/extract
  1. insert extractions row, status='pending'          (<50ms)
  2. return { extractionId, status: 'pending' } to the client   ← response sent, client unblocked
  3. after(() => runExtraction(extractionId))            ← keeps this SAME invocation alive
       runExtraction: vision fetch → token-floor guard → Zod → (repair if needed) → write result
GET  /api/extract/[id]
  select extractions.status, corrections, run fields once committed  (poll every ~2s client-side)
```

No queue product (Vercel Queues/QStash/Inngest), no separate "background function" deployment
target, no second Vercel project. **Rejected, and why:**

| Alternative | Rejected because |
|---|---|
| Hold the HTTP connection open for the full 33–41 s | Exactly what D4 forbids — the client is either polling or blocked, and a blocked client can't distinguish "still working" from "hung," and a network hiccup loses the whole result |
| A third-party queue (QStash, Inngest, Upstash) | An extra paid service, an extra webhook endpoint to authenticate, and an extra failure domain, to solve a problem `after()` + a disciplined deadline already solves at 17 runs/month scale. Revisit only if `after()` proves unreliable in production (see the Task 31 verification step) or the app ever needs retries/backoff sophistication a raw DB status column can't express |
| Vercel Cron as the trigger (`/api/cron/*` picks up pending rows) | Adds up to a whole cron interval of user-visible latency for something that should start the instant the upload lands. Cron is right for F07's nightly rollup, wrong for "the user is looking at a spinner right now" |
| Edge runtime for `/api/extract` | `after()` support and duration budget differ by runtime, and Edge cannot use the Neon WebSocket driver or hold a `fetch` to z.ai open as comfortably. See §6 — nothing in this app runs on Edge |

### 2.3 The gap `after()` does not close by itself — and the fix

Restating the risk plainly: `after()` shares the route's `maxDuration`. If the *total* pipeline
— vision call, possible repair, DB writes — exceeds that ceiling, Vercel kills the invocation
exactly as if it had run inline. Background execution fixes the **user experience** (fast
response, pollable status) but does **not**, by itself, fix the **time budget**. Two things
close that gap, and both are contract items F04 must follow, not suggestions:

**1. The repair round-trip must be text-only — never resend the images.**

`expense-tracking/lib/llm/parseExpense.ts:150`'s repair pattern resends the *entire* prior
`messages` array (because that app's Zod-validated payload never contained images to begin
with). Naively porting that pattern to vision extraction would resend three images on every
repair — another 30–40 s call, stacking to 70–80 s total, blowing the 60 s ceiling outright.

But `IMPLEMENTATION_PLAN.md` §1.6 shows the actual failure mode this app hits is **structural**,
not perceptual: *"the model omitted `title` from every observation object despite it being
listed in the tool schema's required array."* The model already read the screenshots correctly
(§1.3: 108/108 fields, 5 consecutive runs) — a repair here is "reshape the JSON you already
produced to match the schema," which needs only the model's own prior text output plus the Zod
error description, never the source images again. **F04's `lib/llm/extract.ts` repair call must
be text-only**, sending `{ role: 'user', content: [{type:'text', text: firstAttemptText}] }` +
the validation errors, not the original image parts. This keeps a repair call in the same
latency class as `IMPLEMENTATION_PLAN.md` §1.6's narrate call (~10 s for ~485 output tokens),
not the same class as a fresh vision call.

**2. An internal soft deadline, ported from the exact pattern `parseExpenseWith` already uses.**

Even with a cheap repair, stacking a worst-observed 41.1 s vision call with a ~10–15 s repair
call lands at 51–56 s — inside 60 s, but with little margin against z.ai latency variance under
load. `parseExpenseWith` already solves this shape of problem with a wall-clock deadline object
(`deadline = Date.now() + OVERALL_DEADLINE_MS`, `remaining()`, skip the repair if
`deadline - Date.now() <= MIN_REPAIR_BUDGET_MS`). **F04 must port that exact pattern** with a
deadline of **55 s** (5 s of buffer under the Hobby ceiling), so that:

- if the primary vision call plus a would-be repair can't both fit, the repair is *skipped*,
  not attempted and cut off mid-flight;
- the deadline's own expiry always writes `extractions.status = 'failed'` with
  `error_code = 'timeout'` **before** returning from the `after()` callback, so a slow run
  becomes a clean, retryable failure row — never a `'pending'` row stuck forever because the
  Lambda was hard-killed by the platform first. `Promise.race` against the deadline, with the
  losing branch's `finally` doing the DB write, is the shape; F04 owns the implementation.

With both of these, worst-realistic-case total is **≈ 55 s inside a 60 s ceiling**, with an
explicit self-terminating fallback rather than a hope that the platform never enforces its own
limit first.

### 2.4 Vercel plan implications — pinned

**Stay on Hobby for v0.1.0.** `maxDuration = 60` on `/api/extract` is the maximum Hobby permits
and is sufficient given §2.3's discipline. Concretely:

```ts
// app/api/extract/route.ts (F04 owns the body; F01 pins the route-segment config)
export const runtime = 'nodejs'      // after() + a long fetch + Neon: never Edge, see §6
export const maxDuration = 60        // the Hobby ceiling — see §2.1
```

| If this happens in production | Do this |
|---|---|
| The soft-deadline `'failed'` path fires more than rarely (say, >5% of extractions) | z.ai is slower under load than the research sample suggests. First lever: confirm the repair path is genuinely text-only (§2.3.1) — a regression there is the most likely cause. Second lever: upgrade to **Vercel Pro** (`maxDuration` up to 300 s) and raise the constant. This is a one-line change (`maxDuration = 300`, deadline `~290`) — nothing about the `after()` architecture changes |
| `after()` callbacks appear to not run at all in production (status stuck at `'pending'` indefinitely, not `'failed'`) | This means Vercel is not honoring `waitUntil` the way `after.md`'s appendix describes for this project's plan tier/region — verify with Task 31's smoke test before F04 builds on top of a false assumption |
| Cost ever becomes a real concern | It won't — `IMPLEMENTATION_PLAN.md` §1.7: ≈$0.006/run, ~11¢/month at 17 runs. Function *duration* is the constraint here, not the LLM bill or the Vercel function-second bill at this volume |

**This plan does not provision Vercel Pro.** It documents the upgrade path so F04 is never
blocked rediscovering it under deadline pressure.

### 2.5 What F01 ships vs. what F04 must still build

| F01 ships now | F04 builds on top of it |
|---|---|
| The route files exist with correct `runtime`/`maxDuration` exports and a typed `pending`-row stub (Task 21b) | The actual vision `fetch`, token-floor guard, Zod schema, repair call, and the `runExtraction` body |
| `extractions.status` lifecycle is documented here (`pending → ok\|repaired\|failed`) | The lifecycle's implementation, including the 55 s deadline object |
| This section's mandate: text-only repair, no re-sent images | Honoring it — a code reviewer should reject a repair call that includes an `image_url` part |
| The CI guard that `OPENROUTER_API_KEY` never appears in `app/`, `lib/`, `components/` (§4) | Not touching that guard |

---

## 3. Tasks

### Task 1 — Toolchain check

Already run in §1 Preflight. Proceed.

### Task 2 — Scaffold Next.js 16.3.1 into a temp dir

`create-next-app` refuses to run in a directory containing a `.md` file (three exist at the
root here). Scaffold into `scaffold-tmp/` and move up, exactly as `expense-tracking` did.

```bash
cd /home/miftah/run-insights
npx --yes create-next-app@16.3.1 scaffold-tmp \
  --ts --eslint --tailwind --app --no-src-dir \
  --import-alias "@/*" --use-npm --skip-install --yes
```

`--skip-install` avoids npm 12's `EALLOWSCRIPTS` failure on project-scoped installs (same
finding as `expense-tracking` Task 2); Task 4 installs from a hand-pinned `package.json`
instead.

### Task 3 — Move the scaffold into the repo root

**Guard first** — `mv scaffold-tmp/app .` does not merge if `./app` already exists:

```bash
cd /home/miftah/run-insights
for p in app package.json tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs; do
  [ -e "$p" ] && echo "CONFLICT: $p already exists — inspect before continuing"
done; echo "guard done"
```

Expect `guard done` and nothing else — nothing on that list exists yet in this repo.

```bash
cd /home/miftah/run-insights
rm -rf scaffold-tmp/.git scaffold-tmp/README.md scaffold-tmp/CLAUDE.md \
       scaffold-tmp/AGENTS.md scaffold-tmp/public \
       scaffold-tmp/app/page.tsx scaffold-tmp/app/layout.tsx \
       scaffold-tmp/app/globals.css scaffold-tmp/app/favicon.ico
find scaffold-tmp -mindepth 1 -maxdepth 1 -exec mv {} . \;
rmdir scaffold-tmp
```

> Deleting `AGENTS.md`/`CLAUDE.md` here is deliberate, mirroring the header of this document:
> `next dev` regenerates the managed block in Task 24, matched to the installed Next version,
> rather than committing a stale copy now. **`CLAUDE.md`'s `@AGENTS.md` include line must be
> re-added by hand after Task 24** if `create-next-app` doesn't restore it — check before
> committing.

### Task 4 — Pinned `package.json`, install

Every roadmap §3 version pinned exactly (no `^`, no `~`), plus the deltas listed in
**Contract deltas** below.

**File: `/home/miftah/run-insights/package.json`**

```json
{
  "name": "run-insights",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "lint:fix": "eslint --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:live": "LLM_LIVE_TEST=1 vitest run --dir . --testNamePattern=live",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:smoke": "node --env-file=.env.local scripts/db-smoke.mjs",
    "ci:openrouter-guard": "node scripts/check-openrouter-boundary.mjs"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "0.117.1",
    "@auth/drizzle-adapter": "1.11.3",
    "@neondatabase/serverless": "1.1.0",
    "@vercel/blob": "2.8.0",
    "browser-image-compression": "2.0.2",
    "drizzle-orm": "0.45.2",
    "nanoid": "5.1.16",
    "next": "16.3.1",
    "next-auth": "5.0.0-beta.32",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "recharts": "3.10.1",
    "server-only": "0.0.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "22.20.1",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "dotenv": "17.4.2",
    "drizzle-kit": "0.31.10",
    "eslint": "9.39.5",
    "eslint-config-next": "16.3.1",
    "eslint-config-prettier": "10.1.8",
    "prettier": "3.9.6",
    "prettier-plugin-tailwindcss": "0.8.1",
    "tailwindcss": "4.3.3",
    "typescript": "5.9.3",
    "vitest": "4.1.2"
  }
}
```

Notes on non-§3 pins (repeated under **Contract deltas**): `nanoid` for the `nanoid(12)` /
`nanoid(16)` ids §4.3/D9 require but §3 never pins; `server-only` as the import-guard marker;
`dotenv` because `drizzle.config.ts` runs outside the Next bundler; tooling majors
(`eslint@9`, not 10; `typescript@5.9`, not the Go rewrite) pinned to versions this stack was
last validated against in the sibling app, not to "latest."

**No `sharp`, `@vitest/coverage-v8`, or `tsx` yet** — the expense tracker added those for image
generation and coverage reporting after F01. Add them when F06/F10 actually need them, not
speculatively.

```bash
cd /home/miftah/run-insights
npm install
npx drizzle-kit --version && npx tsc --version && npx eslint --version && npx vitest --version
```

The `esbuild`/`unrs-resolver` "install scripts blocked" warning from `expense-tracking` Task 4
is expected here too and is benign for the same reason (prebuilt native binaries ship as
optional deps) — do not "fix" it by approving scripts.

### Task 5 — `.gitignore`

Identical shape to `expense-tracking`'s, plus a `.claude/` entry since this repo's `.env.local`
and future scratch files may sit under agent tooling directories on this machine.

**File: `/home/miftah/run-insights/.gitignore`**

```gitignore
# dependencies
/node_modules

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files — .env.example is the ONLY one that is committed
.env
.env.*
!.env.example

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# editors
.idea/
.vscode/*
!.vscode/extensions.json

# scaffolding leftovers
/scaffold-tmp
```

Verify exactly as `expense-tracking` Task 5 does:

```bash
cd /home/miftah/run-insights
git check-ignore -v .env.local .env.example
git check-ignore .env.example && echo "BROKEN: .env.example is ignored"
```

Expect two lines from the first command (the second ending in `!.env.example`), and **nothing**
from the second.

### Task 6 — Commit checkpoint 1

```bash
cd /home/miftah/run-insights
git add -A
git commit -m "chore(f01): scaffold Next.js 16.3.1 App Router with pinned dependency set

- create-next-app@16.3.1 template app-tw, TypeScript + Tailwind v4 + ESLint
- package.json pins every runtime dep to roadmap v0.1.0 section 3 exactly
- npm scripts: dev, build, lint, typecheck, test, db:generate/migrate/studio/smoke
- .gitignore: ignore all .env* except .env.example"
```

### Task 7 — `tsconfig.json`

Identical rationale to `expense-tracking`'s: strict mode plus `noUncheckedIndexedAccess` (a
`SELECT` returning zero rows is the most common runtime crash in this shape of app —
`records`, `run_splits`, `run_zones` queries all return arrays a downstream feature must not
assume are non-empty) and `verbatimModuleSyntax`.

**File: `/home/miftah/run-insights/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules", "drizzle", "research"]
}
```

`research` is excluded from the TS project (it's plain `.mjs`, not typechecked) but **not** from
Vitest's test discovery (Task 20) — those are different tools with different globs.

### Task 8 — `next.config.ts`

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Every route in this app runs on the Node.js runtime — see docs/plans/F01-foundation.md §6.
  reactStrictMode: true,

  // Vercel Blob public URLs. Roadmap D9/§4.3: run_photos.blob_url and /s/[token] both serve
  // these to the browser. Declared here so all host allow-listing lives in one place.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
    ],
  },

  // No `eslint` key: `next build` no longer runs the linter in Next 16.
  // No `webpack` key: Turbopack is the default bundler.
}

export default nextConfig
```

### Task 9 — `postcss.config.mjs` (Tailwind v4)

Verify the scaffold generated the CSS-first plugin config; overwrite only if it doesn't match:

```js
const config = { plugins: { '@tailwindcss/postcss': {} } }
export default config
```

**No `tailwind.config.js`, ever.** v4 is CSS-first; that file only exists as a v3 compatibility
shim and would defeat the `@theme` pipeline the design system (pulled in around F08) depends on.

### Task 10 — ESLint flat config

```js
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must come last: disables stylistic rules that conflict with Prettier.
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'drizzle/**',
    'next-env.d.ts',
    'scaffold-tmp/**',
    'research/**', // plain feasibility scripts, not part of the app's lint surface
  ]),
])

export default eslintConfig
```

### Task 11 — Prettier config

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./app/globals.css"
}
```

**File: `.prettierignore`**

```gitignore
.next
node_modules
drizzle
package-lock.json
*.md
research
```

`research` is excluded so Prettier never touches the feasibility scripts' hand-tuned formatting
(several of them pack multiple statements per line deliberately, for scan-ability while
iterating against the live API).

### Task 12 — Directory skeleton

Every path roadmap §4/§5 will need, created now with `.gitkeep` so ownership is unambiguous
from commit one — mirroring `expense-tracking`'s Task 12, extended for this app's larger
`lib/` surface (metrics, records, badges are new relative to the expense tracker).

```bash
cd /home/miftah/run-insights
mkdir -p app/actions app/api/health app/api/upload app/api/extract \
         "app/api/extract/[id]" app/api/cron/rollup \
         lib/db lib/llm lib/metrics lib/records lib/badges lib/schema lib/format \
         components scripts tests/support tests/research
for d in app/actions lib/db lib/llm lib/metrics lib/records lib/badges lib/schema components; do
  touch "$d/.gitkeep"
done
find app lib components scripts tests -type d | sort
```

| Path | Contents | Owner |
|---|---|---|
| `app/actions/*` | Server Actions per D7 | F02/F05/F06/F09/F11 |
| `lib/env.ts` | validated env | **F01 (this plan)** |
| `lib/format.ts` | `formatPace`, `formatDistance`, `formatDuration`, `TZ`, per §4.2 | F03 |
| `lib/db/schema.ts`, `client.ts`, `queries.ts`, `ids.ts` | Drizzle, §4.3 | F03 |
| `lib/llm/vision.ts`, `narrate.ts`, `extract.ts` | two clients, §2 above | F04/F07 |
| `lib/metrics/*` | §4 metrics + `hrMax.ts` (§4.4) | F02 (`hrMax.ts` only)/F06 |
| `lib/records/catalog.ts` | §4.5 | F06 |
| `lib/badges/catalog.ts` | §4.6 | F09 |
| `lib/schema/*` | Zod shapes for extraction/insights | F04/F07 |
| `components/*` | shared UI | F08/F11 |
| `app/api/health/route.ts` | liveness probe | **F01** |
| `app/api/upload/route.ts` | Blob client-upload handshake | F04 |
| `app/api/extract/route.ts`, `app/api/extract/[id]/route.ts` | background job + poll, §2 | F04 |
| `app/api/cron/rollup/route.ts` | nightly refresh | F07 |
| `tests/research/` | the score.mjs self-test, §4 below | **F01** |
| `tests/support/` | Vitest setup, the `server-only` stub | **F01** |
| `drizzle/` | generated migrations | F03 |

### Task 13 — `app/globals.css` (Tailwind v4 skeleton)

Minimal placeholder — the design system replaces token values once F08 has real screens.

```css
@import 'tailwindcss';

/*
 * Tailwind v4 is CSS-first: this @theme block IS the config. No tailwind.config.js, ever.
 * The design system (docs/design-brief.md, pulled once F08 has screens) owns the real
 * token ramps. What's here keeps the build green and gives prettier-plugin-tailwindcss a
 * stylesheet to sort classes against.
 */
@theme {
  --font-sans:
    ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

html {
  /* iOS: never let Safari zoom on input focus. Design system enforces 16px min on inputs. */
  -webkit-text-size-adjust: 100%;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  -webkit-tap-highlight-color: transparent;
}
```

> **No dark-mode toggle, per roadmap's core tenet** ("follow system"). The `@media
> (prefers-color-scheme: dark)` block above *is* the entire dark-mode feature — there is no
> `data-theme` attribute, no toggle UI, and no feature plan should add one.

### Task 14 — `app/layout.tsx` and `app/page.tsx`

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Run Insights',
  description: 'Screenshot a run. Get a coach, not a dashboard.',
}

// viewport-fit=cover is required for env(safe-area-inset-*) on iPhone XS Max — this app's
// design target per docs/design-brief.md.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
```

`lang="en"` — not `"id"` — per roadmap D10: copy is straight English, deliberately, unlike the
expense tracker's Indonesian-flavoured English.

```tsx
// app/page.tsx — F02 replaces this with the sign-in landing / signed-in redirect to `/`.
export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold">Run Insights</h1>
      <p className="text-sm opacity-60">Foundation is up. F02 lands sign-in here.</p>
    </main>
  )
}
```

`LayoutProps<'/'>` is a Next 16 generated global type, not an import — see the `typecheck`
script's `next typegen` step and `expense-tracking`'s Task 14 note; the same caveat applies
verbatim here.

### Task 15 — Commit checkpoint 2

```bash
cd /home/miftah/run-insights
git add -A
git commit -m "chore(f01): tsconfig, next.config, eslint flat config, prettier, app shell

- tsconfig: strict + noUncheckedIndexedAccess + verbatimModuleSyntax, target ES2022
- eslint.config.mjs: next core-web-vitals + typescript + eslint-config-prettier (last)
- prettier: no semicolons, single quotes, tailwind class sorting; research/ excluded
- app/globals.css: Tailwind v4 @import + placeholder @theme, no dark-mode toggle (D-tenet)
- app/layout.tsx: lang=en (D10), viewport-fit=cover for iOS safe-area insets
- directory skeleton for the full roadmap section 4/5 surface"
```

### Task 16 — `.env.example`

**File: `/home/miftah/run-insights/.env.example`**

```bash
# ---------------------------------------------------------------------------
# Copy to .env.local and fill in. .env.local is git-ignored and must stay so.
# Every variable here is SERVER-ONLY. None may ever be prefixed NEXT_PUBLIC_.
# ---------------------------------------------------------------------------

# --- Vision: glm-4.6v via z.ai CODING endpoint (F04) ------------------------
# OpenAI-shaped. NOT the Anthropic base URL — that endpoint silently drops images and
# invents numbers. See IMPLEMENTATION_PLAN.md §1.1 before ever changing this URL.
LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */=
LLM_VISION_BASE_URL=https://api.z.ai/api/coding/paas/v4
LLM_VISION_MODEL=glm-4.6v

# --- Narrative: glm-5.3 via z.ai Anthropic-compatible endpoint (F07) --------
# No trailing slash, no /v1 suffix — the @anthropic-ai/sdk baseURL override handles that.
LLM_API_KEY=
LLM_BASE_URL=https://api.z.ai/api/anthropic
LLM_MODEL=glm-5.3

# --- Neon Postgres (F03) ----------------------------------------------------
# DATABASE_URL          -> POOLED. Host contains "-pooler". App runtime.
# DATABASE_URL_UNPOOLED -> DIRECT. No "-pooler". drizzle-kit migrate/studio ONLY.
# Create the Neon project in ap-southeast-1 (Singapore) — see this plan's open questions.
DATABASE_URL=
DATABASE_URL_UNPOOLED=

# --- Auth.js v5 (F02) -------------------------------------------------------
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_URL=

# --- Vercel Blob (F04) -------------------------------------------------------
BLOB_READ_WRITE_TOKEN=

# --- Cron guard (F07) --------------------------------------------------------
CRON_SECRET=

# --- Build-time ONLY. Read by tools/gen_badge_art.py (F10) and by NOTHING in --
# app/, lib/, or components/. CI asserts this boundary — see .github/workflows/ci.yml.
OPENROUTER_API_KEY=
```

### Task 17 — `.env.local`

The repo already has an `.env.local` with four empty keys. **Append-only**, same discipline as
`expense-tracking` Task 17 — never `cat >` over it.

```bash
cd /home/miftah/run-insights
[ -f .env.local ] && cp .env.local ".env.local.bak.$(date +%s)"

add_env() {
  local key="$1" val="$2"
  if grep -qE "^${key}=.+" .env.local 2>/dev/null; then
    echo "skip  ${key} (already set)"
  else
    sed -i "/^${key}=\s*$/d" .env.local 2>/dev/null || true
    printf '%s=%s\n' "$key" "$val" >> .env.local
    echo "add   ${key}"
  fi
}

touch .env.local
add_env LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */ '<<PASTE z.ai API KEY — same key works both endpoints>>'
add_env LLM_VISION_BASE_URL 'https://api.z.ai/api/coding/paas/v4'
add_env LLM_VISION_MODEL 'glm-4.6v'
add_env LLM_BASE_URL 'https://api.z.ai/api/anthropic'
add_env LLM_MODEL 'glm-5.3'
add_env DATABASE_URL '<<PASTE NEON POOLED CONNECTION STRING>>'
add_env DATABASE_URL_UNPOOLED '<<PASTE NEON DIRECT CONNECTION STRING>>'
add_env AUTH_SECRET "$(openssl rand -base64 32)"
add_env CRON_SECRET "$(openssl rand -base64 32)"

rm -f .env.local.bak.*   # only after confirming the pasted values are correct
```

`LLM_API_KEY` was already present (empty) from before this plan ran — `add_env` skips it if
non-empty, or fills it if still blank; use the same z.ai key as `LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */`.

Verify:

```bash
grep -c '<<PASTE' .env.local || true
git status --short | grep -c '\.env\.local' || echo "0 (good: .env.local is ignored)"
```

Both must print `0` (after real values are pasted for the first check).

### Task 18 — `lib/env.ts`

This is F01's most important file. Three deliberate choices, extending `expense-tracking`'s
pattern with a **second eager client** because this app, uniquely, has two LLMs on two
different endpoint shapes:

1. **`import 'server-only'` on line 1** — a client component importing this transitively is a
   build-time error, not a runtime leak.
2. **Eager validation for the core group — now six required vars, not three** — vision client,
   narrative client, and Neon. A missing `LLM_VISION_MODEL` must crash the build exactly as
   loudly as a missing `DATABASE_URL`, because §1.1's finding (`IMPLEMENTATION_PLAN.md`) is
   that a *misconfigured* vision endpoint doesn't error, it returns 200 with invented data —
   the only defence against a variable simply being wrong is asserting it's present and
   shaped right before the app ever starts, plus the token-floor guard F04 owns at call time.
3. **Lazy groups for F02 (`authEnv`), F04-adjacent (`blobEnv`), F07 (`cronEnv`)** — same
   deferred-crash-at-first-call pattern as the sibling app, so each feature's vars can land
   independently without F01 blocking on them.

**File: `/home/miftah/run-insights/lib/env.ts`**

```ts
import 'server-only'
import { z } from 'zod'

/**
 * Environment contract for Run Insights.
 *
 * ROADMAP_v0.1.0.md section 4.1 is authoritative for variable names. Every variable is
 * server-only; none is prefixed NEXT_PUBLIC_.
 *
 * TWO LLM CLIENTS, DELIBERATELY (roadmap section 3's note, repeated here because it is the
 * reason this schema has six required vars instead of three):
 *   - LLM_VISION_*  -> glm-4.6v, OpenAI-shaped chat/completions, the CODING endpoint.
 *                      Never point this at api.z.ai/api/anthropic — that endpoint accepts
 *                      image blocks, returns HTTP 200, and silently drops the image. See
 *                      IMPLEMENTATION_PLAN.md section 1.1. The prompt_tokens floor guard in
 *                      lib/llm/vision.ts (F04) is the runtime half of this defence; this
 *                      schema's `.url()` + non-empty checks are the boot-time half.
 *   - LLM_*         -> glm-5.3, Anthropic-compatible endpoint, @anthropic-ai/sdk.
 *
 * Import rules identical to expense-tracking/lib/env.ts:
 *   - Server Components, Route Handlers, Server Actions, lib/**  -> allowed
 *   - Client Components ('use client')                           -> build error
 *   - Node scripts outside Next (scripts/*.mjs, drizzle.config,
 *     research/*.mjs)                                            -> NOT importable; those
 *     read process.env directly (research/lib.mjs already does; keep it that way).
 */

const nonEmpty = (name: string) => z.string().min(1, `${name} is required but was empty or unset`)

const postgresUrl = (name: string) =>
  nonEmpty(name).startsWith('postgres', `${name} must be a postgres:// or postgresql:// URL`)

/** Always required. Parsed eagerly at module load -> a missing value fails the build. */
const coreSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // F04 — glm-4.6v, OpenAI-shaped, coding/paas/v4. Plain fetch, no SDK (roadmap section 3).
  LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */: nonEmpty('LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */'),
  LLM_VISION_BASE_URL: z.url('LLM_VISION_BASE_URL must be an absolute URL'),
  LLM_VISION_MODEL: nonEmpty('LLM_VISION_MODEL'),

  // F07 — glm-5.3, Anthropic-compatible, @anthropic-ai/sdk with a baseURL override.
  LLM_API_KEY: nonEmpty('LLM_API_KEY'),
  LLM_BASE_URL: z.url('LLM_BASE_URL must be an absolute URL'),
  LLM_MODEL: nonEmpty('LLM_MODEL'),

  // F03 — Neon. DATABASE_URL is pooled (runtime); DATABASE_URL_UNPOOLED is direct
  // (drizzle-kit migrate/studio only, read via dotenv in drizzle.config.ts, not this module).
  DATABASE_URL: postgresUrl('DATABASE_URL'),
  DATABASE_URL_UNPOOLED: postgresUrl('DATABASE_URL_UNPOOLED'),
})

/** F02 owns these. Validated on first call — call it at module scope in auth.ts so it still
 *  crashes at boot, not mid-request. */
const authSchema = z.object({
  AUTH_SECRET: nonEmpty('AUTH_SECRET'),
  AUTH_GOOGLE_ID: nonEmpty('AUTH_GOOGLE_ID'),
  AUTH_GOOGLE_SECRET: nonEmpty('AUTH_GOOGLE_SECRET'),
  AUTH_URL: z.url('AUTH_URL must be an absolute URL').optional(), // production only
})

/** F04 owns this. Vercel injects it once a Blob store is linked to the project. */
const blobSchema = z.object({
  BLOB_READ_WRITE_TOKEN: nonEmpty('BLOB_READ_WRITE_TOKEN'),
})

/** F07 owns this. Guards every /api/cron/* handler. */
const cronSchema = z.object({
  CRON_SECRET: nonEmpty('CRON_SECRET'),
})

function fail(group: string, error: z.ZodError): never {
  const lines = error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(
    [
      '',
      '',
      `================ INVALID ${group.toUpperCase()} ENVIRONMENT ================`,
      lines,
      '',
      'Local dev : copy .env.example to .env.local and fill in the blanks.',
      'Vercel    : Project Settings > Environment Variables (per environment).',
      '============================================================',
      '',
    ].join('\n'),
  )
}

function load<T extends z.ZodType>(group: string, schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) fail(group, parsed.error)
  return parsed.data
}

/** Validated core environment. Evaluated at import time. */
export const env = load('core', coreSchema)

let authCache: z.infer<typeof authSchema> | null = null
export function authEnv(): z.infer<typeof authSchema> {
  authCache ??= load('auth', authSchema)
  return authCache
}

let blobCache: z.infer<typeof blobSchema> | null = null
export function blobEnv(): z.infer<typeof blobSchema> {
  blobCache ??= load('blob', blobSchema)
  return blobCache
}

let cronCache: z.infer<typeof cronSchema> | null = null
export function cronEnv(): z.infer<typeof cronSchema> {
  cronCache ??= load('cron', cronSchema)
  return cronCache
}

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'

export type CoreEnv = z.infer<typeof coreSchema>
export type AuthEnv = z.infer<typeof authSchema>
export type BlobEnv = z.infer<typeof blobSchema>
export type CronEnv = z.infer<typeof cronSchema>
```

### Task 19 — Neon connection smoke test script

Identical in spirit to `expense-tracking/scripts/db-smoke.mjs` — deliberately independent of
`lib/env.ts` (which is `server-only` and unresolvable outside the Next bundler) and of Drizzle.

**File: `/home/miftah/run-insights/scripts/db-smoke.mjs`**

```js
// Neon connectivity smoke test.
//   npm run db:smoke                       (reads .env.local, pooled)
//   node --env-file=.env.local scripts/db-smoke.mjs -- --unpooled
import { neon } from '@neondatabase/serverless'

const useUnpooled = process.argv.includes('--unpooled')
const varName = useUnpooled ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL'
const url = process.env[varName]

if (!url) {
  console.error(`FAIL  ${varName} is not set.`)
  process.exit(1)
}

const host = new URL(url).host
const looksPooled = host.includes('-pooler')
if (useUnpooled && looksPooled) {
  console.error(`FAIL  ${varName} points at a POOLED host (${host}). Use the direct string.`)
  process.exit(1)
}
if (!useUnpooled && !looksPooled) {
  console.warn(`WARN  ${varName} host (${host}) has no "-pooler". Runtime should use the pooled URL.`)
}

const sql = neon(url)
const startedAt = Date.now()

try {
  const rows = await sql`
    select now() as now, current_database() as db, current_user as usr, version() as version
  `
  const row = rows[0]
  console.log(`OK    var      = ${varName}`)
  console.log(`OK    host     = ${host}`)
  console.log(`OK    database = ${row.db}`)
  console.log(`OK    user     = ${row.usr}`)
  console.log(`OK    now      = ${row.now}`)
  console.log(`OK    server   = ${row.version.split(',')[0]}`)
  console.log(`OK    latency  = ${Date.now() - startedAt} ms`)
} catch (err) {
  console.error(`FAIL  ${err.message}`)
  process.exit(1)
}
```

Run both directions (pooled, then `--unpooled`) once `DATABASE_URL`/`DATABASE_URL_UNPOOLED`
hold real values (Task 26 precondition).

### Task 20 — `drizzle.config.ts`

F01 owns this file (owns `db:generate`/`db:migrate`/`db:studio`); **F03 owns the schema it
points at.** Until F03 lands, `drizzle-kit generate` reports "no schema file found" — expected,
the handoff point.

```ts
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next.js: no automatic .env.local loading, and lib/env.ts
// (server-only) is not importable here.
loadEnv({ path: '.env.local', quiet: true })

const url = process.env.DATABASE_URL_UNPOOLED
if (!url) {
  throw new Error(
    'DATABASE_URL_UNPOOLED is not set. drizzle-kit must use the DIRECT (unpooled) Neon ' +
      'connection string. Copy .env.example to .env.local and fill it in.',
  )
}
if (new URL(url).host.includes('-pooler')) {
  throw new Error(
    `DATABASE_URL_UNPOOLED points at a pooled host (${new URL(url).host}). ` +
      'Use the direct connection string from the Neon console.',
  )
}

export default defineConfig({
  schema: './lib/db/schema.ts', // F03's file — this path is fixed, F03 must not move it
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
```

### Task 21 — `app/api/health/route.ts`

Same rationale as `expense-tracking`: the fastest way to answer "is this deployment wired to
the right database with the right env" locally and in production, and the only F01 consumer of
`lib/env.ts` (making Task 24's env-guard crash observable). **Not in roadmap §4.8 — declared
under Contract deltas.**

```ts
import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  try {
    const sql = neon(env.DATABASE_URL)
    await sql`select 1`
    return NextResponse.json({
      ok: true,
      db: true,
      latencyMs: Date.now() - startedAt,
      // Safe to expose: model ids and base URLs, no key, no DSN. See Contract delta 1 for
      // why the payload stays this small (learned from expense-tracking's own R-27).
      vision: { baseUrl: env.LLM_VISION_BASE_URL, model: env.LLM_VISION_MODEL },
      narrative: { baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL },
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message, latencyMs: Date.now() - startedAt },
      { status: 500 },
    )
  }
}
```

> Learn from `expense-tracking`'s reconciliation R-27 from commit one instead of rediscovering
> it: keep this payload minimal (booleans and model ids, never the database name or a
> connection string) — there is no benefit to an unauthenticated caller seeing more.

### Task 21b — `/api/extract` and `/api/extract/[id]` — route shape only

F01 does not implement extraction (F04 does), but ships the route files with the correct
Route Segment Config from §2, so F04 starts from a shape that already can't violate the
maxDuration decision by accident.

**File: `/home/miftah/run-insights/app/api/extract/route.ts`**

```ts
import { NextResponse } from 'next/server'

// See docs/plans/F01-foundation.md section 2: after() shares this budget. 60 is the Hobby
// ceiling. F04 must not raise this without also reading section 2.4's upgrade path.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  // F04 implements: insert `extractions` (status='pending'), respond immediately, then
  // `after(() => runExtraction(id))`. See plan section 2 for the required text-only repair
  // and the 55s internal deadline.
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 })
}
```

**File: `/home/miftah/run-insights/app/api/extract/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Default maxDuration is fine — this is a single indexed SELECT, not the extraction itself.

export async function GET(_req: Request, ctx: RouteContext<'/api/extract/[id]'>) {
  const { id } = await ctx.params
  // F04 implements: select extractions.status/corrections + the committed run, once reviewed.
  return NextResponse.json({ id, error: 'not_implemented' }, { status: 501 })
}
```

Both return `501` until F04 lands — this is intentional scaffolding, not a bug, and Task 23's
lint/typecheck/build pass with these stubs in place.

### Task 22 — `vitest.config.ts` + the `research/score.mjs` CI test

This is F01's D13 deliverable: `research/` stays in the repo, and `score.mjs` — the scorer
behind the 108-field ground truth — becomes something CI actually exercises, without ever
calling a live LLM (roadmap §4.9: "No test may call a live LLM except the explicitly-tagged
live suites").

**Why only `score.mjs` and `schema.mjs`, not the rest of `research/`:** every other script
(`matrix.mjs`, `run-extract.mjs`, `control.mjs`, `narrate.mjs`, `downscale.mjs`,
`run-repeat.mjs`) imports `research/lib.mjs`, which hardcodes an absolute path to the three
screenshots outside this repo (`/home/miftah/.claude/image-cache/...`) and requires
`LLM_API_KEY` to do anything. Those remain manual, live, re-run-by-hand tools per
`IMPLEMENTATION_PLAN.md`'s Appendix — never part of CI. `score.mjs` and `schema.mjs` are
different: pure functions over an in-repo, hand-transcribed constant. That purity is exactly
what makes them CI-safe, and exactly why D13 singles `score.mjs` out.

**File: `/home/miftah/run-insights/vitest.config.ts`**

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The single test-runner config for this repo (F01 owns it; do not write a second one).
 *
 *   - F03/F04/F06/F07/F09 write co-located `lib/**\/*.test.ts` and `app/**\/*.test.ts`.
 *   - F01 writes `tests/research/*.test.ts` — see docs/plans/F01-foundation.md section 4.
 *   - `tests/integration/**` (F03, opt-in via VITEST_INTEGRATION=1) is excluded by default
 *     so a plain `npm test` never reaches a real database.
 */
const integration = process.env.VITEST_INTEGRATION === '1'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      /*
       * 'server-only' throws on import outside a bundler that selects the react-server
       * condition, which Vitest does not. Any module opening with `import 'server-only'`
       * (lib/env.ts, and later F04's lib/llm/*.ts, F03's lib/db/client.ts) is untestable as
       * shipped without this alias. See expense-tracking/vitest.config.ts for the fuller
       * rationale — same tradeoff, same answer.
       */
      'server-only': fileURLToPath(new URL('./tests/support/serverOnlyStub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'app/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', ...(integration ? [] : ['tests/integration/**'])],
    setupFiles: ['tests/support/setup.ts'],
  },
})
```

**File: `/home/miftah/run-insights/tests/support/serverOnlyStub.ts`**

```ts
// Stub for the 'server-only' poison pill inside Vitest. Production still resolves the real
// package via Next's bundler and still enforces the client/server boundary — this alias
// only affects the test runner. See vitest.config.ts's resolve.alias comment.
export {}
```

**File: `/home/miftah/run-insights/tests/support/setup.ts`**

```ts
// Empty for now — F01 leaves this in place so F03/F04/F07 have one shared setup file to add
// to (e.g. a fake Neon client, a fake LLM client) instead of each writing their own.
export {}
```

**File: `/home/miftah/run-insights/tests/research/score.test.ts`** — the D13/§4.9 deliverable:

```ts
import { describe, expect, it } from 'vitest'
import { score } from '../../research/score.mjs'
import { TRUTH } from '../../research/schema.mjs'

/**
 * This is NOT a test of the vision model — no network call happens here, no LLM_API_KEY is
 * read. It is a regression test of the SCORER itself: the 108-field ground truth in
 * schema.mjs, and the score() function research/*.mjs scripts already call against it.
 *
 * Why this matters at F01 time, before F04 exists: `score.mjs` is the instrument F04's own
 * extraction tests will be measured with (D13). If the instrument silently breaks — say, a
 * refactor drops a field from SCALARS, or `eq()`'s float tolerance regresses — every future
 * "108/108" claim becomes meaningless without anyone noticing. This test is the tripwire.
 */
describe('research/score.mjs (D13 — the F04 regression instrument)', () => {
  it('scores the ground truth against itself as a perfect match', () => {
    const result = score(TRUTH)
    expect(result.errs).toEqual([])
    expect(result.pct).toBe('100.0')
    expect(result.pass).toBe(result.total)
  })

  it('detects a wrong scalar field', () => {
    const got = { ...TRUTH, distanceKm: 5.0 } // truth is 10.67
    const result = score(got)
    expect(result.pct).not.toBe('100.0')
    expect(result.errs.some((e) => e.startsWith('distanceKm:'))).toBe(true)
  })

  it('detects a truncated splits table', () => {
    const got = { ...TRUTH, splits: TRUTH.splits.slice(0, 5) } // truth has 11 rows
    const result = score(got)
    expect(result.errs.some((e) => e.includes('splits.length'))).toBe(true)
  })

  it('detects a misread value inside one split row (the exact class of error the parallel-call variant made)', () => {
    const got = {
      ...TRUTH,
      splits: TRUTH.splits.map((s, i) => (i === 0 ? { ...s, paceSecPerKm: 436 } : s)),
    }
    const result = score(got)
    expect(result.errs.some((e) => e.includes('splits[0].paceSecPerKm'))).toBe(true)
  })
})
```

Run it:

```bash
cd /home/miftah/run-insights
npm test
```

**Expected:** 4 passing tests under `tests/research/score.test.ts`, plus whatever else exists
in `lib/**`/`app/**` at this point in the build (none yet — F01 is the only test author so
far).

### Task 23 — `scripts/check-openrouter-boundary.mjs`

Wires roadmap §4.1's literal requirement — `grep -rE 'OPENROUTER_API_KEY' app/ lib/
components/` stays empty — into a script with a real exit code, rather than a shell one-liner
duplicated between a developer's terminal and CI.

```js
// OPENROUTER_API_KEY is build-time-only, read by tools/gen_badge_art.py (F10) and by
// NOTHING at runtime. If this script ever fails, something in app/, lib/, or components/
// started reading a key meant only for an offline image-generation skill — fix the import,
// don't silence this check. See ROADMAP_v0.1.0.md section 4.1 and D12.
import { execSync } from 'node:child_process'

const DIRS = ['app', 'lib', 'components']
let leaked = ''
try {
  leaked = execSync(`grep -rnE 'OPENROUTER_API_KEY' ${DIRS.join(' ')}`, {
    encoding: 'utf8',
  })
} catch (err) {
  // grep exits 1 when it finds nothing — that's the success path.
  if (err.status === 1) {
    console.log(`OK    OPENROUTER_API_KEY does not appear in ${DIRS.join('/, ')}/`)
    process.exit(0)
  }
  console.error(`FAIL  grep itself errored: ${err.message}`)
  process.exit(2)
}
console.error('FAIL  OPENROUTER_API_KEY found outside its build-time boundary:\n' + leaked)
process.exit(1)
```

```bash
cd /home/miftah/run-insights
npm run ci:openrouter-guard
```

**Expected:** `OK    OPENROUTER_API_KEY does not appear in app/, lib/, components/` — this
passes trivially right now because those directories hold only placeholders and `.gitkeep`
files, and stays wired into CI (Task 25) so it never silently stops being checked once F04's
`lib/llm/` and F10's badge tooling actually exist.

### Task 24 — Prove the env guard crashes the build, then format/lint/typecheck/dev

Identical drill to `expense-tracking` Task 22–24, extended to hit the **vision** group too
(the newer, app-specific half of the schema):

```bash
cd /home/miftah/run-insights
cp .env.local .env.local.bak
sed -i 's/^LLM_VISION_MODEL=.*/LLM_VISION_MODEL=/' .env.local
npm run build 2>&1 | tail -15
```

**Expected:** build fails, banner names `LLM_VISION_MODEL` under `INVALID CORE ENVIRONMENT`.

```bash
mv .env.local.bak .env.local
npm run build 2>&1 | tail -10          # green again
npm run format && npm run lint && npm run typecheck && npm run format:check
npm run dev                             # Ctrl-C after confirming it boots
```

`npm run dev` regenerates `AGENTS.md`'s managed block (per this document's header) — commit it
in Task 25.

### Task 25 — CI workflow, commit checkpoint 3

**File: `/home/miftah/run-insights/.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      # CI-only dummy values. next build only validates SHAPE (lib/env.ts is a Zod schema,
      # not a live connection check) — nothing here ever reaches a real z.ai or Neon host.
      # NEVER put a real secret in this block; see docs/plans/F01-foundation.md section 4.
      LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */: ci-dummy-key
      LLM_VISION_BASE_URL: https://api.z.ai/api/coding/paas/v4
      LLM_VISION_MODEL: glm-4.6v
      LLM_API_KEY: ci-dummy-key
      LLM_BASE_URL: https://api.z.ai/api/anthropic
      LLM_MODEL: glm-5.3
      DATABASE_URL: postgres://ci:ci@localhost:5432/ci
      DATABASE_URL_UNPOOLED: postgres://ci:ci@localhost:5432/ci
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      # Roadmap section 4.1's literal requirement, given a real exit code (Task 23).
      - name: OPENROUTER_API_KEY boundary guard
        run: npm run ci:openrouter-guard

      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck

      # Runs tests/research/score.test.ts among everything else — the D13 requirement.
      # No network call happens in this step; see Task 22's rationale for why score.mjs
      # specifically is CI-safe and the rest of research/ deliberately is not.
      - run: npm test

      - run: npm run build
```

No `db:smoke` step — CI has no reachable Neon instance, and doesn't need one: `lib/env.ts`
only validates shape, and `app/api/health` is never invoked at build time (Route Handlers
execute per-request, not during `next build`). Real connectivity is proven once per deploy by
Task 31, against the actual Vercel + Neon pairing, not on every PR.

```bash
cd /home/miftah/run-insights
git add -A
git commit -m "feat(f01): Zod-validated two-LLM environment, Neon smoke test, health route, CI

- lib/env.ts: server-only module, six-var eager core (two LLM clients + Neon), lazy
  authEnv()/blobEnv()/cronEnv() for F02/F04/F07
- .env.example documents every roadmap section 4.1 var, vision vs narrative endpoints
- scripts/db-smoke.mjs, drizzle.config.ts (postgresql, ./lib/db/schema.ts for F03)
- app/api/health/route.ts: nodejs liveness probe (contract delta)
- app/api/extract/route.ts + [id]/route.ts: route shape only, maxDuration=60 pinned
  per this plan's section 2 background-job decision; F04 implements the body
- vitest.config.ts + tests/research/score.test.ts: wires D13's score.mjs into CI
  without ever calling a live LLM (roadmap section 4.9)
- scripts/check-openrouter-boundary.mjs + .github/workflows/ci.yml: CI runs the
  OPENROUTER_API_KEY boundary grep, format/lint/typecheck/test/build on every push"
```

---

## 4. CI — what actually runs and why (summary)

| Step | Command | Proves | Needs a live key? |
|---|---|---|---|
| OpenRouter boundary | `npm run ci:openrouter-guard` | §4.1's `grep` requirement holds, with a real exit code | No |
| Format | `npm run format:check` | Prettier + Tailwind class order | No |
| Lint | `npm run lint` | ESLint flat config, next core-web-vitals + typescript | No |
| Typecheck | `npm run typecheck` | `next typegen && tsc --noEmit` | No |
| Test | `npm test` | **`research/score.mjs` — D13/§4.9**, plus every future `lib/**`/`app/**` unit test | No — `score.mjs`/`schema.mjs` are pure; `research/lib.mjs`'s live scripts are never imported by CI |
| Build | `npm run build` | The env guard is real, the app compiles, routes have correct `runtime`/`maxDuration` | No — dummy-shaped env values only |

**What CI deliberately does not do:** call z.ai (no test may call a live LLM per §4.9 except
an explicitly tagged live suite — none exists yet at F01 time), connect to a real Neon
database, or deploy. Live-endpoint re-probing stays a manual `research/matrix.mjs` run per
`IMPLEMENTATION_PLAN.md`'s Appendix; live deploy health stays Task 31's job, once per push to
`main` via Vercel's own Git integration, not GitHub Actions.

---

## 5. Deployment

Unlike `expense-tracking` (which already had a live domain, a provisioned Neon project, and a
Vercel account state to react to when its runbook was written), **no infrastructure exists yet
for run-insights.** This plan writes the steps to execute once, not a record of what already
happened — treat every "expected output" below as a prediction to verify, not history.

> **⚠️ SUPERSEDED, 2026-08-20 — the paragraph below lost.** It proposed skipping the custom
> domain, which contradicts **ROADMAP §4.8 ("Canonical origin is `https://runins.site`")** —
> and it never declared that as a Contract delta, so it was a silent divergence, not an agreed
> simplification. Adjudicated in favour of the roadmap. **`https://runins.site` is the
> production origin.** Concretely: `AUTH_URL=https://runins.site` in the production environment
> only, F02's Google OAuth redirect URI uses that host, and F11 builds `/s/<token>` links from
> it — never from `VERCEL_URL`. Attach the domain during Task 30 (`vercel domains add`, then
> `www` 301s to the apex) following `expense-tracking`'s runbook Step 4–5. The reasoning below
> is kept only to explain why the Vercel alias appears in Tasks 30–31's example commands.

**~~Deliberate simplification versus the sibling app: no custom domain for v0.1.0.~~** This is a
single-user reading app (roadmap's core tenet), not a public product — `<project>.vercel.app`
is a fine permanent home, and skipping DNS removes an entire class of misconfiguration risk
(apex-vs-CNAME rules, nameserver confusion, TTL waits) for zero product cost. A domain can be
attached later in five minutes exactly as `expense-tracking`'s runbook Step 4–5 show, if wanted.

### Task 26 — Neon project

Create the project in **`ap-southeast-1` (Singapore)**, not a US region. The runner (and the
`Asia/Jakarta` timezone D6 hard-codes) is in Tangerang; every other region adds ~200 ms RTT to
every query, on top of which F04's already-tight §2 timing budget has zero margin to spare.
Copy the **pooled** string into `DATABASE_URL` and the **direct** string (toggle "Pooled
connection" off) into `DATABASE_URL_UNPOOLED` in `.env.local` (Task 17).

```bash
npm run db:smoke
node --env-file=.env.local scripts/db-smoke.mjs -- --unpooled
```

Both must print `OK` lines ending in a latency figure — ideally under ~50 ms from a
Singapore-adjacent network, confirming the region choice.

### Task 27 — Install and link the Vercel CLI

```bash
npm i -g vercel@latest
vercel --version
vercel login
cd /home/miftah/run-insights
vercel link
```

Prompts: set up `~/run-insights` → yes; scope → your personal account; link to existing
project → no; project name → `run-insights`; directory → `./`.

```bash
vercel project inspect run-insights 2>&1 | head -20
```

If the reported Node runtime major differs from `engines.node` (`>=22.0.0`), set it to 22.x in
Project Settings → General for dev/prod parity — same reasoning as `expense-tracking`'s runbook
Step 1.

**File: `/home/miftah/run-insights/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"]
}
```

Pinning the function region to Singapore in a committed file (rather than a dashboard setting)
keeps the choice reviewable and matched to the Neon region from Task 26 — copied verbatim from
`expense-tracking`'s working config for the same reason.

### Task 28 — Push environment variables

**Do not** loop `vercel env add KEY production preview` as one call — `expense-tracking`'s
runbook Step 2 already found both ways this breaks on Vercel CLI 59 (quoted values surviving
into the stored variable; `environment` and `gitBranch` being mutually exclusive positional
args). Write the same kind of guarded script this repo needs — one invocation per
`{variable} × {environment}`, values over stdin (never `--value`, which is world-readable via
`/proc`), `--force` for idempotent re-runs, sensitive flag on every secret-shaped variable.

**File: `/home/miftah/run-insights/scripts/vercel-env-push.sh`** (adapt
`expense-tracking/scripts/vercel-env-push.sh` if it exists there, or write fresh following its
description in that repo's runbook Step 2 — the variable list here is roadmap §4.1's thirteen
names: `LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */`, `LLM_VISION_BASE_URL`, `LLM_VISION_MODEL`, `LLM_API_KEY`,
`LLM_BASE_URL`, `LLM_MODEL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL` (production-only), `CRON_SECRET`; plus
`BLOB_READ_WRITE_TOKEN` once Task 29 creates the store).

```bash
./scripts/vercel-env-push.sh          # dry run
./scripts/vercel-env-push.sh --apply
vercel env ls
```

**Count Preview explicitly — do not trust a green Production deploy alone**, per
`expense-tracking`'s hard-won finding that a first `--apply` run can silently leave Preview
empty:

```bash
vercel env ls | grep -c Preview     # want 12 before Task 29, 13 after
```

### Task 29 — Create the Blob store

```bash
vercel blob create-store run-insights-photos --access public --region sin1 --yes
```

`--access public` is required by the design, not a shortcut: roadmap §4.3 stores `blob_url` as
a public URL, and F11's `/s/[token]` renders photos to unauthenticated viewers. `--region sin1`
matches Task 26/27 — the flag defaults to `iad1` (Virginia) if omitted.

> `create-store` ends with a `vercel env pull`, rewriting `.env.local` from the *development*
> environment. Verify all vars survived afterward (same warning as `expense-tracking`'s
> runbook, Step 6 footnote).

### Task 30 — Deploy preview, then production

```bash
vercel deploy                                          # first deploy on a fresh project goes
                                                        # to production regardless of the flag
curl -s https://<alias-url>/api/health; echo
```

**Expected:** `{"ok":true,"db":true,"latencyMs":<n>,"vision":{...},"narrative":{...},"commit":"<sha>"}`.
Probe the **alias** URL (`run-insights-<words>.vercel.app`), not the per-deployment hash URL —
Deployment Protection guards the latter and a `curl` there returns a redirect, not JSON.

```bash
vercel deploy --prod
curl -s https://<production-alias>/api/health; echo
```

### Task 31 — Verify the background-job mechanism actually works on this account

**This is the one verification step that is genuinely new to this app** — nothing in
`expense-tracking`'s runbook exercises `after()`, because that app's LLM call fits inside a
single request. Do not skip it; §2's entire design rests on the assumption that Vercel honors
`waitUntil` for this project's plan tier and region, and that assumption is cheap to check
directly, right now, before F04 builds real extraction on top of it.

Deploy a **throwaway** route (delete it after this task passes) that proves the shape works:

```ts
// app/api/_probe-after/route.ts — TEMPORARY, delete after Task 31 passes
import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST() {
  const startedAt = Date.now()
  after(async () => {
    await new Promise((r) => setTimeout(r, 8000)) // simulate a slow vision call
    const sql = neon(env.DATABASE_URL)
    await sql`select ${Date.now() - startedAt} as probe_ms`.catch(() => {})
    console.log(`[probe] after() completed ${Date.now() - startedAt}ms after request start`)
  })
  return NextResponse.json({ startedAt, note: 'response sent; after() should still be running' })
}
```

```bash
vercel deploy --prod
time curl -s -X POST https://<production-alias>/api/_probe-after; echo
```

**Expected:** the `curl` returns in well under 1 second (proving the response doesn't wait on
`after()`). Then, in `vercel logs <deployment-url> --follow` (or the dashboard's Runtime Logs),
the `[probe]` line must appear roughly 8 seconds later — proving the invocation was kept alive
past the response. **If that log line never appears, stop before F04 starts:** it means this
Vercel account/plan/region does not honor `waitUntil` the way `after.md`'s appendix describes,
and §2's whole mechanism needs re-deciding (most likely fallback: hold the response instead,
with a strict client-side abort, or revisit the rejected-queue option in §2.2's table) before
any extraction code is written against a false assumption.

Delete the probe route once this passes:

```bash
rm -rf app/api/_probe-after
git add -A && git commit -m "chore(f01): remove after() verification probe (Task 31 passed)"
git push
```

### Task 32 — Commit and connect Git

```bash
git push -u origin main
```

Connect the repo in Vercel Project → Settings → Git → Connect Git Repository →
`miftahulmahfuzh/run-insights`. From here, push to `main` → production, any other branch →
preview, matching `expense-tracking`'s convention.

---

## 6. Node runtime vs Edge runtime — the rule for this app

**Identical rule to `expense-tracking`: every route runs on the Node.js runtime. No file in
this repo may ever contain `export const runtime = 'edge'`.**

| Surface | Runtime | Why |
|---|---|---|
| `proxy.ts` (F02) | nodejs — not configurable | Next 16 renamed `middleware` to `proxy`; Edge is not supported there at all |
| `app/api/auth/[...nextauth]/route.ts` (F02) | nodejs | Auth.js v5 + Drizzle adapter writes rows on sign-in |
| `app/api/extract/route.ts` (F04) | nodejs, `maxDuration = 60` | §2's entire background-job design — Edge's shorter/different duration model and lack of the Neon WebSocket path buy nothing here and would reopen a solved problem |
| `app/api/upload/route.ts` (F04) | nodejs | `@vercel/blob` handshake + a DB write recording the pending extraction |
| `app/api/cron/rollup/route.ts` (F07) | nodejs | Neon queries, potentially a narrative LLM call |
| Server Actions (`app/actions/*`) | nodejs | every one does `requireUserId()` + scoped queries |
| Page routes | nodejs | RSCs querying Neon |
| `app/api/health/route.ts` (F01) | nodejs, `dynamic = 'force-dynamic'` | reads server-only env, queries Neon |

**The Neon detail that decides it**, unchanged from the sibling app: `@neondatabase/serverless`
offers `neon(url)` (HTTP/fetch, works on Node *and* Edge — what the health route and smoke
script use) and `Pool`/`Client` (WebSocket, required for interactive transactions — what F03's
multi-table run inserts will need, since committing `runs` + `run_splits` + `run_zones`
atomically is exactly the shape that needs either a WebSocket transaction or the HTTP driver's
`transaction([...])` batch form). Node ≥ 22 gets the WebSocket path with **no `ws` polyfill** —
Edge would bring that polyfill back for a cold-start win this single-user app doesn't need.

**One Next 16 caveat worth flagging for whoever writes F04/F07's route files:** the Route
Segment Config reference notes that `dynamic`, `dynamicParams`, `revalidate`, and `fetchCache`
exports are *removed* when Cache Components (`experimental.cacheComponents` /
`"use cache"` adoption) is enabled. This app does not enable Cache Components in F01 — nothing
here requires it — but if a later feature turns it on, `app/api/health/route.ts`'s `dynamic =
'force-dynamic'` export would silently stop doing anything and need to be re-expressed per
that mode's caching model. Not a decision F01 needs to make now; a tripwire for whoever does.

---

## 7. Verification

Run top to bottom from `/home/miftah/run-insights`. Every command exits `0` and produces the
stated shape. This is the definition of "F01 is done."

```bash
# 1. Versions match roadmap section 3 exactly.
node -e "const p=require('./package.json');const want={next:'16.3.1',react:'19.2.8','react-dom':'19.2.8','next-auth':'5.0.0-beta.32','@auth/drizzle-adapter':'1.11.3','drizzle-orm':'0.45.2','@neondatabase/serverless':'1.1.0','@vercel/blob':'2.8.0','recharts':'3.10.1','zod':'4.4.3','@anthropic-ai/sdk':'0.117.1','browser-image-compression':'2.0.2'};const bad=Object.entries(want).filter(([k,v])=>p.dependencies[k]!==v);const tw=p.devDependencies.tailwindcss!=='4.3.3'||p.devDependencies['drizzle-kit']!=='0.31.10'||p.devDependencies.vitest!=='4.1.2';if(bad.length||tw){console.error('MISMATCH',bad);process.exit(1)}console.log('OK all pinned versions match roadmap section 3')"

# 2. Required npm scripts exist.
node -e "const s=require('./package.json').scripts;const need=['dev','build','lint','typecheck','test','db:generate','db:migrate','db:studio','ci:openrouter-guard'];const miss=need.filter(n=>!s[n]);if(miss.length){console.error('MISSING',miss);process.exit(1)}console.log('OK scripts:',need.join(', '))"

# 3. Directory skeleton exists.
for d in app lib lib/db lib/llm lib/metrics lib/records lib/badges lib/schema components tests/research tests/support research; do [ -d "$d" ] || { echo "MISSING $d"; exit 1; }; done; echo "OK directory skeleton"

# 4. Tailwind v4 CSS-first, no v3 config file.
[ ! -f tailwind.config.js ] && [ ! -f tailwind.config.ts ] && grep -q '@import' app/globals.css && grep -q '@theme' app/globals.css && echo "OK tailwind v4 CSS-first"

# 5. Secrets not tracked; the example file is.
git ls-files | grep -qx '.env.example' && ! git ls-files | grep -q '^\.env\.local$' && echo "OK .env.example tracked, .env.local not"

# 6. No secret value ever entered git history.
git grep -I -l -E 'postgres(ql)?://[^ ]*:[^ @]+@' -- . ':!docs' ':!*.example' && { echo "LEAK"; exit 1; } || echo "OK no connection strings in tracked files"

# 7. lib/env.ts is server-only and validates the vision group, not just DB.
head -1 lib/env.ts | grep -q "server-only" && grep -q "LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */" lib/env.ts && grep -q "LLM_VISION_BASE_URL" lib/env.ts && echo "OK lib/env.ts covers both LLM clients"

# 8. The OPENROUTER_API_KEY boundary is empty, with a real exit code.
npm run ci:openrouter-guard

# 9. Lint, types, format.
npm run lint && npm run typecheck && npm run format:check

# 10. Tests pass — this is where D13's requirement is actually checked.
npm test 2>&1 | tee /tmp/f01-test-output.txt
grep -q "research/score.mjs" /tmp/f01-test-output.txt && echo "OK score.mjs test ran"

# 11. Production build succeeds, and the extraction route carries the section 2 contract.
npm run build
grep -q "maxDuration = 60" app/api/extract/route.ts && grep -q "runtime = 'nodejs'" app/api/extract/route.ts && echo "OK /api/extract carries the section 2 route-segment config"

# 12. Neon reachable on both connection strings (needs real credentials — Task 26).
npm run db:smoke
node --env-file=.env.local scripts/db-smoke.mjs -- --unpooled

# 13. drizzle-kit loads its config (schema-not-found is the expected F03 handoff).
npx drizzle-kit generate 2>&1 | tail -3

# 14. The env guard is real (destructive, restores itself).
cp .env.local .env.local.bak && sed -i 's/^LLM_VISION_MODEL=.*/LLM_VISION_MODEL=/' .env.local
npm run build 2>&1 | grep -q 'INVALID CORE ENVIRONMENT' && echo "OK build fails loudly on missing vision env"
mv .env.local.bak .env.local && npm run build >/dev/null && echo "OK build green again"

# 15. Live: health route and the after()/waitUntil probe (needs a real deploy — Tasks 30-31).
curl -s https://<alias>/api/health | grep -q '"ok":true' && echo "OK production health"
# Task 31's probe output ("[probe] after() completed ~8000ms after request start" in
# `vercel logs`) is verified by inspection, not grep — see Task 31 for the exact procedure.
```

**Definition of done:** all fifteen blocks pass, `git log --oneline` shows the F01 commits, and
Task 31's log line was observed once, live, before this plan is marked complete.

---

## Contract deltas

Deviations from `ROADMAP_v0.1.0.md` §4. Nothing in §4.2–§4.7 changed; the items below are
additions, matching the shape of `expense-tracking`'s own F01 deltas.

1. **New route handler `GET /api/health`, not listed in §4.8.**
   *What:* an unauthenticated JSON liveness probe: `{ ok, db, latencyMs, vision: {baseUrl,
   model}, narrative: {baseUrl, model}, commit }`.
   *Why:* none of §4.8's listed handlers can answer "did this deployment get the right env and
   reach the right database" without either auth or an LLM call — exactly the question every
   Vercel task in this plan needs answered, repeatedly, for the life of the project. It is
   also the only F01 consumer of `lib/env.ts`, which is what makes the boot-time env crash
   (Verification #14) observable at all.
   *Risk accepted:* the endpoint reveals model ids, base URLs, and the deployed commit SHA —
   no credential. Learning from `expense-tracking`'s own R-27, the payload here ships lean
   from the start rather than being trimmed after the fact.

2. **Dependencies added beyond roadmap §3's pinned table:** `nanoid@5.1.16` (§4.3/D9 need
   `nanoid(12)`/`nanoid(16)` ids but §3 never pins the package), `server-only@0.0.1` (the
   mechanism that makes `lib/env.ts` un-importable from client components), `dotenv@17.4.2`
   (dev-only, `drizzle.config.ts` runs outside Next). Tooling versions §3 doesn't cover
   (`typescript`, `eslint`, `prettier`, `@types/*`, `@tailwindcss/postcss`) pinned to the
   versions validated in the sibling app's F01 plan, which shares this exact stack.

3. **`drizzle.config.ts` lives at the repo root, owned by F01, not F03.** §4 assigns it to
   nobody explicitly; F01 owns the `db:*` scripts that invoke it. It points at
   `./lib/db/schema.ts` — fixed, F03 must not move it.

4. **A new CI workflow file and two new scripts, not named anywhere in §4:**
   `.github/workflows/ci.yml`, `scripts/check-openrouter-boundary.mjs`,
   `tests/research/score.test.ts`. These exist specifically to *fulfil* two requirements §4
   already states (the `grep` boundary in §4.1, `score.mjs` running in CI per D13/§4.9) —
   they are the *mechanism*, not a change to what's required. Flagged here only so their
   existence and location is traceable to this plan rather than appearing unexplained.

**Not a delta, but a heads-up F02 must absorb** (same finding as `expense-tracking`'s own F01
plan, since both apps are on the same Next.js version): roadmap doesn't name a middleware file
at all, but if F02's draft (`docs/plans/F02-auth-profile.md`) or any later plan writes
`middleware.ts`, know that Next.js 16 renamed the convention to **`proxy.ts`** (exported
function `middleware` → `proxy`), and Edge is not supported there. F02's own plan already
writes `proxy.ts` — this note exists only to confirm F01 is not the source of a mismatch.

---

## Interfaces I publish

### `lib/env.ts`

```ts
import { env, authEnv, blobEnv, cronEnv, isProduction, isDevelopment } from '@/lib/env'
import type { CoreEnv, AuthEnv, BlobEnv, CronEnv } from '@/lib/env'
```

| Export | Shape | Availability | Consumers |
|---|---|---|---|
| `env` | `{ NODE_ENV, LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */, LLM_VISION_BASE_URL, LLM_VISION_MODEL, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, DATABASE_URL, DATABASE_URL_UNPOOLED }` | validated eagerly — missing/malformed fails the **build** | F03 (`lib/db/client.ts`), F04 (`lib/llm/vision.ts` uses `LLM_VISION_*`), F07 (`lib/llm/narrate.ts` uses `LLM_*`) |
| `authEnv()` | `{ AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_URL? }` | validated on first call — call at module scope in `auth.ts` | F02 |
| `blobEnv()` | `{ BLOB_READ_WRITE_TOKEN }` | validated on first call | F04 |
| `cronEnv()` | `{ CRON_SECRET }` | validated on first call | F07 |
| `isProduction`, `isDevelopment` | `boolean` | — | anyone |

**Contract for consumers:** never read `process.env.<APP_VAR>` directly in `app/`, `lib/`, or
`components/` — import from `@/lib/env`. `research/*.mjs` and `scripts/*.mjs` are the
documented exception (they run outside the Next bundler and read `process.env` directly by
design). Adding a variable means updating the right schema here, `.env.example`, and all three
Vercel environments — miss one and preview builds fail with a banner naming exactly which.

### The background-job contract (§2), for F04

| What F01 fixes | What F04 must do |
|---|---|
| `runtime = 'nodejs'`, `maxDuration = 60` on `/api/extract` | Implement `runExtraction`, called via `after()` |
| The repair round-trip **must not** resend images | Build the repair call text-only, per §2.3.1 |
| A 55 s internal soft deadline, `Promise.race` pattern from `parseExpenseWith` | Port it; on expiry, write `status='failed', error_code='timeout'` before returning |
| `extractions.status` lifecycle: `pending → ok\|repaired\|failed` | Implement every transition; never leave a row `pending` forever |
| Verified once, live, in Task 31 | Trust the mechanism; re-run Task 31's probe if extraction failures spike in a way that suggests `after()` stopped running |

### Build & tooling surface

| Command | Contract |
|---|---|
| `npm run dev` / `build` / `start` | standard Next 16 lifecycle; `build` fails loudly on any missing core env var |
| `npm run lint` / `lint:fix` | ESLint flat config |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run format` / `format:check` | Prettier + Tailwind class sorting |
| `npm test` / `test:watch` | Vitest; includes `tests/research/score.test.ts` (D13) |
| `npm run db:generate` / `db:migrate` / `db:studio` | drizzle-kit, unpooled URL enforced |
| `npm run db:smoke` | Neon connectivity check |
| `npm run ci:openrouter-guard` | §4.1's grep boundary, real exit code |

### Deployment facts downstream plans can rely on

- Production origin: **`https://runins.site`**, per ROADMAP §4.8 — the custom domain ships in
  v0.1.0 after all (see §5's superseded note). `AUTH_URL=https://runins.site`, production
  environment only. F02's Google OAuth redirect URI must use that host, and F11 builds
  `/s/<token>` links from it, never from `VERCEL_URL`. The Vercel-issued
  `run-insights-<words>.vercel.app` alias remains valid and is what Tasks 30–31 probe before
  DNS propagates.
- Vercel function region: `sin1`, matched to the Neon `ap-southeast-1` project.
- Vercel plan: **Hobby**, with `/api/extract`'s `maxDuration = 60` as the load-bearing number
  in this whole plan — see §2.4 for the Pro-upgrade escape hatch if it's ever not enough.
- Git-integrated deploys: push to `main` → production, any other branch → preview.
- `BLOB_READ_WRITE_TOKEN` and `AUTH_*` exist in all three Vercel environments once Tasks 28–29
  complete, even though F01 doesn't consume them.

---

## Open questions for the integrator

**Q1 — Neon project region and credentials.** Not yet created. §5 Task 26 specifies
`ap-southeast-1`; this is a recommendation grounded in the runner's timezone (D6) and in §2's
already-tight extraction timing budget, not something the roadmap pins explicitly. Confirm
before Task 26, since moving regions later means a data migration instead of a checkbox.

**Q2 — Is the Hobby 60 s `maxDuration` ceiling still accurate at execution time?** This plan,
`ROADMAP_v0.1.0.md` D4, and `IMPLEMENTATION_PLAN.md` §2.3 all state it, but it is a Vercel
account/plan policy, not a fact documented in `node_modules/next/dist/docs/` — Next.js's own
docs only say `maxDuration`'s default is "set by deployment platform" (§2.2 above). Vercel's
own numbers can change between when this plan is written and when Task 27 runs. Reconfirm in
the Vercel dashboard (Project Settings → Functions) before treating §2.4's "stay on Hobby"
recommendation as settled.

**Q3 — Does `after()`/`waitUntil` actually behave as documented on this specific account?**
Task 31 exists precisely because this is not something to assume from documentation alone —
it is the one piece of this plan's architecture with no equivalent already proven in
`expense-tracking`. Do not let F04 start building `runExtraction` until Task 31's probe has
been run once, live, and its log line observed.

**Q4 — Should `/api/health` stay public, gate behind a query key, or be deleted after Task 31
passes?** Same tradeoff `expense-tracking` faced (Contract delta 1's "Risk accepted" note).
Recommendation: keep it — it's genuinely useful on every future deploy, and this app has no
public traffic to leak reconnaissance to. F02's `proxy.ts` matcher must exclude it either way.

**Q5 — `LLM_API_KEY /* R-40: was LLM_VISION_API_KEY */` and `LLM_API_KEY`: one z.ai key or two?** Roadmap §4.1 lists them
as separate variables (correctly — different endpoints, different request shapes), but
`IMPLEMENTATION_PLAN.md`'s research scripts use a single `LLM_API_KEY` against
`api.z.ai/api/coding/paas/v4`. In practice a single z.ai account key almost certainly works
against both endpoints (they're the same billing account, different API surfaces) — but this
has not been verified against both endpoints *simultaneously* with two different env var names
pointing at the same underlying key. F04 should confirm with one real call to each endpoint
before assuming it, exactly as `IMPLEMENTATION_PLAN.md`'s own Appendix recommends re-running
`matrix.mjs` "after any z.ai change."

**Q6 — `noUncheckedIndexedAccess` is on**, same as the sibling app. It will make F03/F06/F07/F08
write `rows[0]?.x` or a length check instead of `rows[0].x`, everywhere. Same taste call as
`expense-tracking` made; say now if this should be off, since undoing it after F03 lands means
touching every query file.

**Q7 — ESLint 9 vs 10, TypeScript 5 vs 7 (native Go compiler).** Pinned to `eslint@9.39.5` /
`typescript@5.9.3` deliberately, matching the exact versions `expense-tracking`'s F01 validated
this stack against. If newer majors are wanted, do that upgrade as an isolated change after F01
is green, not folded into it.
