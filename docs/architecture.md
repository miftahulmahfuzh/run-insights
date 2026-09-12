# Run Insights — Current-State Architecture

**Written 2026-09-11; drift-corrected 2026-09-12** — the same-day dead-code sweeps over `lib/db`,
`lib/nina`, `lib/admin` and `components/ui` landed after the first write and invalidated a
handful of this document's citations; each is fixed in place below, and the Scale row was
re-measured. This is the one document that describes the system **as it actually
exists today** — not as any plan proposed it. Every plan under `docs/plans/archive/` is a
point-in-time artifact; several of them were overruled by reconciliation rulings, by measurements
taken during execution, or by later features. Where a plan and this document disagree, this
document wins, and §13 says exactly where and why, plan by plan.

Sources for every claim here, in order of authority: the code (read and grepped on 2026-09-11),
`CHANGELOG.md`, the 36 plan documents (now archived under `docs/plans/archive/`) and their own
execution records, and `.workflows/plan/*/` for everything after that set.

---

## 1. The system at a glance

| | |
|---|---|
| **What it is** | A single-user (per-account) running app: Apple Watch screenshots → vision-model extraction → human review → coaching-grade metrics, records, badges, weekly/monthly narratives — plus, since v1.0.0, **Nina**, a chatbot who lives in the app, remembers the runner, and comments unprompted. |
| **Production origin** | `https://runins.site` (Vercel, Hobby plan, `sin1` region, Fluid compute) |
| **Framework** | Next.js 16.3.1, App Router, React 19.2.8, TypeScript 5.9 strict + `noUncheckedIndexedAccess`. **No route groups except `(app)` and `(public)`**; `proxy.ts` (Next 16's renamed middleware) guards authenticated routes. |
| **Database** | One Neon Postgres (`ep-winter-bonus-azjhv7a4`, `ap-southeast-1`). **There is no "dev" database — `.env.local`'s `DATABASE_URL` is the instance production reads.** Pooled URL at runtime, unpooled for drizzle-kit only. `neon-http` driver: no `db.transaction()`, every multi-statement write is `db.batch([...])`. |
| **Object storage** | Vercel Blob store `run-insights-photos` (public, `sin1`). Folders: `shots/` (run screenshots), `nina/<userId>/…` (Nina images, avatars, album). |
| **Models** | Vision: `glm-4.6v` via z.ai coding endpoint (plain fetch). Text: `glm-5.3` / `glm-5.3-flash` via z.ai Anthropic-compatible endpoint (`@anthropic-ai/sdk`, runtime-selectable per account). Images: `qwen/qwen-image-3` / `-3-pro` via OpenRouter. Badge/record art generation is an **offline tool** (`tools/*.py`) — `OPENROUTER_API_KEY` is CI-guarded out of `app/`, `lib/`, `components/`. |
| **Crons** | `/api/cron/rollup` `0 20 * * *` (insights week/month sweep) · `/api/cron/nina` `0 12 * * *` (= 19:00 WIB; Nina proactivity + promise resolution) |
| **Route handlers** | Exactly seven, by decision D7 + one Nina addition: `auth/[...nextauth]`, `upload`, `extract`, `extract/[id]`, `health`, `cron/rollup`, `cron/nina` (plus `admin/manifest.webmanifest` and `api/admin/nina/upload` added by the admin console). |
| **Scale (2026-09-12)** | 762 commits since 2026-08-20 · 203 lib modules · 133 component files (non-test) · 28 tables · 21 migration files · 265 unit-test files, 5,093 tests, all green · 7 bespoke CI guards. |
| **Tests** | Vitest, `environment: 'node'`, `*.test.ts` only — **no jsdom** by design until the 2026-09-11 component-test sessions added `.test.tsx` DOM tests under `components/`. Integration tests opt-in via `VITEST_INTEGRATION=1`; live LLM suites are tagged `LLM_LIVE_TEST=1` (vision, narrate, nina, nina-vision, nina-image). |

---

## 2. How it got here (one page of history)

```
2026-08-20  v0.1.0 build begins. ROADMAP + IMPLEMENTATION_PLAN + 11 feature plans (F01–F11),
            reconciled by RECONCILIATION_v0.1.0.md (39 rulings, R-1..R-45 — since REMOVED from
            the tree; readable in git history).
2026-08-20  F01 scaffold, F02 auth/HRmax, F03 data layer land. F04–F11 land 08-20/08-21.
2026-08-21  F12–F18: badge panel, award ledger, phone-keyboard fixes, badge aspect fix,
            splits gutters, upload kind-swap, picker purity, photo viewer.
2026-08-22  F19 README + capture harness; F20 reduced motion; F21 pluralisation;
            F22 axis ticks; F23–F27 the records/badge-panel set (2nd art deck, panels,
            award dates); F28 recent-run history.
2026-08-26  F29 default kind order; F30 clock-time normalisation.
2026-08-27  F31 narrative thinking disabled (a vendor-side model change had silently killed
            every insight).
2026-09-03  F32 `earliest_start` record. F33 (Nina) planned: 16 phases, reconciled by
            .workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md (~30 rulings A1..).
2026-09-06  Measured: Vercel Hobby + Fluid compute holds 300 s — Nina image generation moves
            in-process to after(); GitHub Actions demoted to backstop.
2026-09-10  /admin/photos redesign + image-gen controls (env-tunable quota, editable prompt
            template, model dropdowns) — the two 2026-09-10 design docs.
2026-09-11  v1.0.0. 291 commits / 755 files / +507k lines for the Nina release window alone.
            Today: five token-maxxing test-coverage sessions + this document, and the
            archival of docs/plans/ into docs/plans/archive/ (all 36 plans SHIPPED or
            SHIPPED+AMENDED per §13; the F16 race's second claimer renumbered F16b).
```

The archived numbering itself is a record: two `F16` files and a `F20→F21/F22` renumber once
existed because `F<N+1>` is not race-safe across parallel sessions; the F23–F27 set switched to
`F<card-number + 1>` and stopped colliding. At the 2026-09-11 archival the tree's `F16` residue
was settled: the race's second claimer (upload kind swap, committed 23 minutes after the first)
is `F16b-upload-kind-swap.md`.

---

## 3. Runtime topology

```
Browser (mobile-first, max-w-[470px], Asia/Jakarta)
   │  Auth.js v5 — Google OAuth, JWT strategy (no session rows), proxy.ts guards
   ▼
Vercel (sin1, Hobby + Fluid, maxDuration 60–300 by route)
   │                                   │
   │  neon-http (pooled)               │  z.ai  ── glm-4.6v   /api/coding/paas/v4   (vision)
   ▼                                   │        ── glm-5.3(.3f) /api/anthropic      (narrative+Nina)
Neon Postgres (ap-southeast-1)         │  OpenRouter ── qwen-image-3(-pro)          (Nina images)
                                       ▼
                                    Vercel Blob (sin1, public store)
Vercel Cron ─► /api/cron/rollup (03:00 WIB+1) · /api/cron/nina (19:00 WIB)
GitHub Actions nina-image.yml ─► BACKSTOP ONLY (drain stuck jobs, manual run, rollback target)
Local tooling ─► tools/*.py art decks, scripts/capture/* README media, scripts/* backfills/reapers
```

Load-bearing latency facts, measured in F01/F04/F31 and still governing design: extraction
33–38 s median (hence `after()` + 60 s route ceiling + the repair-budget gate); narrative 13–16 s
(thinking **disabled** — F31; enabled, the model burns its whole token ceiling and emits no tool
call); Nina image generation 78–90 s (hence after() + Fluid's 300 s, measured with a live 90.4 s
probe before the move).

---

## 4. Data model

### 4.1 Table inventory (28, in `lib/db/schema.ts`)

| Domain | Tables |
|---|---|
| Auth.js adapter (camelCase columns, canonical shapes) | `user`, `account`, `session` (unused — JWT strategy), `verificationToken` |
| Runner core | `profiles` (PK = user_id), `runs`, `run_splits` (PK run_id+km), `run_zones` (PK run_id+zone), `run_photos` |
| Extraction audit | `extractions` — **append-only**: no query ever deletes a row; `corrections` jsonb holds `Record<path, CorrectionEvent[]>` with `phase: 'review' \| 'post-review-edit' \| 'manual'` |
| Derived / coaching | `insights` (UNIQUE user+scope+scope_key+facts_hash; `insights_latest_idx` for the recency read), `records` (PK user_id+key; value always int — `earliest_start` encodes seconds-past-midnight as `unit: 'clock'`), `badges` (**award ledger**: PK user_id+key+dedupe_key since F13), `shares` (token PK, partial unique `run_id WHERE revoked_at IS NULL`) |
| Nina | `nina_turns` (one row per model call — chat AND image jobs share it, incl. daily-cap accounting), `nina_chat_sessions`, `nina_messages` (`seq bigserial` = the total order; FKs to quoted messages / attached runs are `set null`), `nina_message_images`, `nina_memory_slots` (10 slots incl. `training_plan`), `nina_memory_facts` (the distilled ledger), `nina_shortcuts`, `nina_nags` (the nag ladder), `nina_avatars` (current-face pointer; `source_key` unique index makes chat-photo adoption idempotent), `nina_folders`, `nina_tuning` (per-account character dials — persona reads it live, no cache), `nina_image_prefs` (prompt template, image model, quota is env) |
| Platform | `push_subscriptions` (Web Push), `app_settings` (PK `key`; row `text_model` selects glm-5.3 vs glm-5.3-flash for *all* narrative including Nina) |

### 4.2 The invariants that shape every query

These are the properties every later feature had to preserve; the CI guards exist because each
one was judged too important to leave to review:

1. **userId scoping** — every read/write carries `user_id`; child tables (`run_splits`,
   `run_zones`, `run_photos`) reach it via correlated `EXISTS` predicates. Exactly three
   sanctioned exceptions, allow-listed in `scripts/check-data-layer-invariants.mjs`:
   `getRunByShareToken` (the 96-bit token is the credential), `isUniqueViolation` (a pure
   predicate over an error object), and `listActiveUserIds` (cron). The admin console's
   operator reads live in `lib/admin/*`, outside the one file that guard scans.
2. **Reviewed-only derived data** — every rollup, record recompute, badge evaluation and
   insight fact is built from rows with `reviewed_at IS NOT NULL`. A hallucination that reached
   `runs` can therefore never reach a chart, a record, or a badge. Enforced per-query by
   `tests/db.queries.reviewedOnly.test.ts`, whose completeness test **fails when a new
   rollup-shaped export is added without being listed**.
3. **Runs are born reviewed** (R-1) — `commitExtractedRun` is the only run-creating write and
   it sets `reviewed_at` at INSERT. Post-review edits go through `applyRunCorrections`, which
   stamps `corrected_at` and never touches `reviewed_at`.
4. **Duplicate-run guard** — `UNIQUE (user_id, occurred_on, coalesce(started_at,'00:00:00'))`;
   the `coalesce` closes the two-NULLs-are-distinct hole in the plain constraint. Collision →
   `DuplicateRunError` carrying the existing run id.
5. **Badges are append-only facts; records are recomputed truth** — a correction can make a run
   newly earn a badge and can never revoke one (`badges.run_id` is the schema's one
   `ON DELETE SET NULL`, so even deleting the earning run preserves the award, with F13's
   `dedupe_key` written at insert so the ledger survives). Records, by contrast, are fully
   DELETE+INSERT-recomputed on every commit and every deletion.
6. **The LLM never computes** — every number in any prompt or payload was computed by
   `lib/metrics/*` in TypeScript and is handed over pre-formatted (`lib/format.ts` is the only
   formatter, CI-guarded). Measured root: glm-5.3 flipped the sign of aerobic decoupling
   (−14.1% vs +12.3%) when asked to compute it itself.
7. **Insights are compare-and-regenerate** — the recency read fetches the newest row for a
   scope key, compares its `facts_hash` against a fresh hash, and regenerates on mismatch; the
   commit path additionally sweeps affected scopes so the gap shows *no* narrative rather than
   stale narrative.
8. **The share page never resolves HRmax live** (INVARIANT B) — `/s/[token]` renders from
   frozen values only; the %HRmax figure must have been frozen into the insight payload at
   generation time or it is omitted. Enforced by `tests/share.bundle.test.ts`'s import-graph
   assertion (`/s` must not reach `lib/metrics/hrMax.ts`) and `scripts/check-f11-share-boundaries.mjs`.
9. **Blob URL honesty** — revoking a share also **rotates** the run's screenshot blobs to fresh
   random pathnames (R-15) so a copied image URL dies with the link; the revoke copy still says
   plainly that already-saved copies are unreachable.

### 4.3 The migration chain as it exists

`drizzle/0000_confused_madame_hydra.sql` (the 14-table base) through
`0020_image_gen_controls.sql`. Two things a reader should know before treating it as a clean
ladder: **there are two `0011_*` files and no `0014`** — the residue of two parallel branches
each adding a table, whose snapshot chain had to be constructed by hand at the tip (this is
also why the house rule is *check `origin/main` for the next free number*, and *regenerate,
never rename*). Migrations `0015`–`0017` are `retire_*` migrations that walked back Nina
tuning/wardrobe/imageprefs revision columns — the schema, like everything else here, carries
its reversals in place rather than pretending they didn't happen.

---

## 5. The run pipeline

```
/upload          1–3 screenshots, per-tile kind (default order = DEVICE hand-off order:
                 heartrate → splits → summary, F29; wrong label = one-tap swap, F16b)
   │ client: compressForExtraction — JPEG q80, short edge 560 (long-edge arithmetic,
   │         resizeTarget.ts; verified in pixels by scripts/shipped-image-recipe.py)
   ▼
POST /api/upload    Blob client-upload handshake; kind rides the signed token
   ▼
POST /api/extract   requireUserIdApi() → insert extractions(status='pending') → 202 in <500ms
   │                after(() => runExtractionJob(id))   [maxDuration = 60, literal]
   ▼
runExtractionJob    fetch blob URLs (SSRF-guarded: host must be *.public.blob.vercel-storage.com)
   │                → data URIs → callVision  ── THE TOKEN-FLOOR GUARD ──
   │                usage.prompt_tokens ≥ 500 × imageCount, checked BEFORE the text is ever
   │                read; the measured drop signature is 141 tokens (endpoint 200s and silently
   │                drops images, and the model invents plausible numbers). Trip ⇒ fail fast,
   │                no repair.
   │                → Zod (lib/schema/extractedSession.ts, FIELD_SOURCES provenance null-out:
   │                  fields from a screen that wasn't uploaded are discarded, not flagged;
   │                  normalizeClockTime repairs "5.32 PM"→"17:32" and nulls ambiguous bare times)
   │                → one TEXT-ONLY repair round-trip (imageCount: 0 — measured: a repair that
   │                  inherited 3-image floor would always die), budget-gated by elapsed time
   │                → terminal row: ok | repaired | failed (token_floor|transport|timeout|validation)
   ▼
GET /api/extract/[id]   poll (2s→3s→5s backoff); lazy self-heal flips >90s 'pending' to
   │                    failed/stale_timeout — no queue, no cron
   ▼
/x/[extractionId]   the review screen (ExtractionGate is the F04/F05 seam)
   │                ConsistencyBanner: four arithmetic cross-checks (splits Σ=duration,
   │                zones Σ=duration, distance×pace=duration, partial-km) derived from the
   │                data, not from model confidence — the fixture's real observed miss (436
   │                vs 396) trips CHK-1.
   │                Every field editable; sheets pin the source screenshot (whole image,
   │                section-based provenance — R-45 rejected bounding boxes)
   ▼
commitReview        validate → commitExtractedRun (born-reviewed run + splits + zones,
   │                photo backfill, DuplicateRunError mapping) → corrections log →
   │                onRunCommitted (lib/derived/invalidate.ts):
   │                  records: full recompute (delete+insert)   [failures logged, never
   │                  badges:  ledger insert via dedupe PK          block the human's save]
   │                  insights: scope sweep so stale prose never renders
   │                  nina:    run_committed proactivity trigger fires from after()
   ▼
/r/[id]   hero, provenance mark, intent chips, narrative card (suspended, never blocking),
          pace+HR dual-axis chart (the app's ONE sanctioned dual axis, argued in F08 §12),
          zone bar (zero-JS), splits table (the chart's accessible twin)
```

**Manual entry is not a separate surface** — a `failed` extraction hands the same review screen
an empty draft (`source: 'manual'`, `extraction_id` still pointing at the failed attempt: an
auditable claim that the numbers are 100% human-entered).

**Input UX hardening** (the bug-hunt arc): `ParsedInput` masks `mm:ss`/`hh:mm:ss` so a digits-only
phone keypad can produce a colon (F14); `Sheet`'s focus effect was rearmed to not steal the
keyboard (F14 round 2); native `type="time"` inputs (F14/F30); the picker's side effects live
outside state updaters with a per-generation guard (F17 — StrictMode double-fired every upload).

---

## 6. Derived data

- **`lib/metrics/*`** — pure, no I/O, no clock. Session (decoupling, drift, pace σ, cadence fade,
  zone shares, HR recovery; the partial-km row is filtered before any split-aggregate — the one
  regression class with a dedicated "wrong value must not appear" test), week (buckets,
  volume delta, `VOLUME_JUMP`), month, ACWR (Gabbett's coupled form — the naive Σ7/Σ28 is
  identically 0.25 and can never enter the 0.8–1.3 band; insufficient history ⇒ null, never a
  misleading ratio).
- **HRmax** — `resolveHrMax` (measured → observed-beats-estimate → Tanaka → null) is the only
  door to a max HR; `null` callers omit the field, never substitute 220−age. Transition banner
  announces observed-overtakes-estimated. One observed read survives, `getObservedMaxHrRun` —
  it names the run the peak came from and takes the Tanaka floor and an `asOf` cutoff in SQL,
  which is how a run keeps itself out of its own resolution (R-3's self-exclusion); the plain
  max() read and the exclude-one-run variant it superseded were removed as dead in the
  2026-09-11 YAGNI sweeps.
- **Flags** — 7 session codes + `VOLUME_JUMP` + `ACWR_OUT_OF_RANGE`, fixed thresholds,
  `lib/flags/copy.ts` gives each one English sentence. Boundary tests pin every threshold from
  both sides.
- **Records** — 11 keys (`RECORD_CATALOG`), recomputed wholesale on every commit; ties break to
  the earlier run; `previousValue` snapshots the displaced value; a derived table with no row
  for a new key is a known gap ⇒ `scripts/backfill-record-keys.mjs` (insert-only, dry-run
  default) ships for the twelfth key.
- **Badges** — 22-key catalog (`badge('key','Title','scope')`), pure rules, ledger storage,
  idempotent evaluation (dedupe by PK), `dawn_patrol` fires once ever, period badges stamp the
  run that *completed* the threshold (F27 R3: min-count rule). Art: 22 patches, 1024×768
  pentagon-free (badge deck: shield/hexagon/chevron/rounded-triangle), graded by
  `tools/check_badge_art.py` with per-shape observed bands; `npm run badges:check` asserts
  sidecars, style version (v2 everywhere — F25 measured that appending ANY addendum to the
  style block destroys subject adherence), and the shared anchor.
- **Insights** — `getOrCreateInsight` per scope; `facts_hash` over canonicalized facts +
  `promptVersion` (bump in the same commit as any prompt edit); weekly/monthly carry
  `trendSincePrevious` (set arithmetic computed in TS, never by the model) and `recentRuns`
  (F28: last 8 reviewed runs before this one, `daysBefore` precomputed); timeouts sized by
  measurement (session 25/18/45s, period 28/20/50s); cron stops itself at 55 s; total LLM
  failure ⇒ `{payload: null, source: 'unavailable'}` — there is no fallback prose, because a
  canned sentence in a coach's voice is worse than none.
- **Narrative model selection** — `narrativeModel()` reads `app_settings.text_model`
  (glm-5.3 default, glm-5.3-flash) at every call site, so the admin Personality dropdown moves
  *all* text generation without a deploy (2026-09-10 design doc; vision extraction deliberately
  excluded).

---

## 7. Nina (v1.0.0 — the largest single body of code in the repo)

Canon: `docs/nina/persona.md` (the intent) + `lib/nina/persona.ts` / `lib/nina/tuning.ts` (what
ships — per-account dials in `nina_tuning`, read live with no cache anywhere on the path).
Six relationship registers (nobody → … → girlfriend, plus the **Instructor**, who turns the
existing pattern detector into named prescriptions with a `training_plan` memory slot). The
character-tuning work repealed twelve hardcoded prompt rules; deliberately **not** repealed:
not-a-doctor, the arithmetic rule, medical-condition never-say, and the image provider's own
guardrails.

| Subsystem | Shape |
|---|---|
| **Turn loop** | `sendNinaMessage` persists the runner's message + a claim in <1 s, then runs the 13–45 s model turn in `after()`; an open tab polls and reveals bubbles on a staggered schedule; a closed tab loses nothing (WhatsApp-style). Offline replies (nina-offline-reply plan set). |
| **Context builder** | `lib/nina/context.ts` + `lib/nina/gateway.ts` — the three-spelling DTO seam (DB `text/sent_at` → queries `body/createdAt` → prompt-layer `text/sentAt`; one mapper, rulings A1). |
| **Memory** | `nina_memory_slots` (10 named slots incl. `training_plan`) + `nina_memory_facts` (the distilled ledger); a librarian prompt distils conversation into memory; `/admin/memory` hand-edits it; `nina-memory-reap` prunes. |
| **Tools** | `lib/nina/tools.ts` — she can quote a message, attach a run, generate images. |
| **Images she makes** | `nina_turns` rows are the job ledger AND the daily-cap accounting; generation runs **in-process in `after()`** (Fluid compute, measured 90.4 s hold; quota via `NINA_IMAGE_DAILY_CAP` env, default 30/day); **GitHub Actions `nina-image.yml` is demoted to backstop/manual-drain/rollback and must not be deleted**; `scripts/nina-image-worker.ts` drains locally. Prompt = admin-editable block-token template (`nina_image_prefs.prompt_template`, three protected layers: save validator, build degrade, byte-identity default); model per-pref (`qwen-image-3` / `-3-pro`). Media dedupe: content-hash + perceptual twin gate (aspect 1% + size-ratio 0.5 + dHash 3, in BOTH the upload and admin paths — the constants must stay in sync). |
| **Her face** | `nina_avatars` + `setCurrentNinaAvatar`; the album, `/admin/nina` (circular crop via `CropStudio`/`CircleFrame`), chat-photo adoption (bytes copied, idempotent via `source_key`), the committed face anchor + `update-nina-profpic` skill + `scripts/nina-profpic.mjs`. |
| **Proactivity** | `run_committed` fires from `after()` at commit; the evening cron evaluates 2–5 trigger kinds (missed usual day, pattern crossed, silence, avatar changed) through the nag ladder (`nina_nags`); promise resolution (`promises.ts`) on the same cron. |
| **Push** | Web Push via `push_subscriptions`, VAPID (Production-scope env only — which is why previews can't serve `/nina`), unread badge (`countUnreadNinaMessages`). |
| **Chat UX** | `/nina` fifth tab; sessions sidebar, search, jump-pinpoint, quoting, message actions sheet (retry/resend/edit/delete), emoji shortcuts, composer dedupe, reduced-motion-aware animations. |

Nina's live gates: `npm run test:live:nina`, `test:live:nina-vision`, `test:live:nina-image`.

---

## 8. The admin console

`/admin` (requireAdmin — separate from the runner's session) with five surfaces beyond the
overview hub:

- **`/admin/nina`** — the **Image collection**: her avatar album, circular crop, current-face
  management, and — image-collection p2 having purged the separate chat-photos route — the
  chat-photo rail too: icon-only controls in ONE flex row (2026-09-10 redesign), expandable
  description/prompt sections, set-as-profile-picture (adoption), the `FileExplorer` with
  folder maintenance actions and the move bar.
- **`/admin/memory`** — hand-editing the memory slots and facts.
- **`/admin/personality`** — the character dials (relationship register, traits incl. `horny`,
  anger model) + the text-model dropdown.
- **`/admin/image-generation`** — quota display, template editor with token legend + reset,
  image-model dropdown, test panel.
- **`/admin/shortcuts`** — her emoji/macro shortcuts (`nina_shortcuts`, importable via
  `nina:shortcuts-import`).

---

## 9. Sharing

`/s/[token]` — token = 96 bits; soft revoke with re-share; get-or-create mint (no-target
`ON CONFLICT DO NOTHING` absorbs both PK and partial-index races); per-photo inclusion
(`excluded_from_share`, default included); the share page omits location, clock times, note,
`doNext[]`, `questionForRunner` (coaching advice about a body is not for a forwarded link), and
%HRmax unless frozen at generation time; `noindex` both header and meta; static OG image only;
force-dynamic with **no `loading.tsx` on its ancestry** (the root `(app)/loading.tsx` once caused
soft-404s — streaming a 200 before `notFound()` could set the status; the route groups are
load-bearing); the pace/HR chart and splits table render for strangers with narrow client props
only. Tests: `tests/share.bundle.test.ts` (import graph, projection shape, revoked≡unknown).

---

## 10. The guard system

CI = 7 bespoke guards + `format:check` + `lint` + `typecheck` + `test` + `build`:

| Guard | Property it freezes |
|---|---|
| `ci:openrouter-guard` | `OPENROUTER_API_KEY` never appears in `app/ lib/ components/` |
| `badges:check` | both art decks' parity, sidecars, style version, anchor, hashes |
| `ci:data-layer-guard` | no `delete(extractions)`; the unscoped-read allow-list; `userId`-first signatures |
| `ci:client-secret-guard` | no server secret crosses into client-reachable modules |
| `ci:f08-guard` | Recharts only in `*Inner.tsx`; one dual-axis chart; `lib/format.ts` is the only formatter |
| `ci:llm-payload-guard` | what the narrative layer may receive (no weight, ever) |
| `ci:f11-guard` | `/s` stays four files, HRmax-free, analytics-free, loading.tsx-free |

Plus structural tests in the same idiom (source scans via `readRepoCode`, so a guard can't be
satisfied by its own doc comment): reduced-motion keyframe escapes, `Sheet`'s dependency list,
picker purity, `KindSelector` has no `taken`, the reviewed-only completeness list, share
projection shape, badge copy budget. And source-anchored static assertions where DOM can't
exist (`environment: 'node'`) — with `.test.tsx` DOM tests (happy-dom) added 2026-09-11 for
Nina chat components and the admin explorer.

---

## 11. Environment & configuration

`.env.local` is the **production** database's credentials (there is no separate dev DB — every
`db:migrate` and every seeded capture run writes production; the capture harness exists because
of this and cleans up by cascade-verified counts). Vercel env is Production-scope for
`ADMIN_EMAILS`, `VAPID_*`, `AUTH_URL` — preview deploys cannot serve `/admin` or push. Two
runtimes-tunable knobs live in the DB or env by design: `app_settings.text_model` and
`NINA_IMAGE_DAILY_CAP`. Local prod-build probing runs on a non-3000 port (3000 is frequently
held by an unrelated process that 302s to `/login`).

---

## 12. Documentation map

| Path | What it is |
|---|---|
| `docs/architecture.md` | **this document** — the current-state reference |
| `docs/plans/archive/*.md` | the 36 point-in-time plans F01–F33 + two 2026-09-10 design docs, archived 2026-09-11 (the race's second `F16` renumbered `F16b`); each carries its own execution record where it has one. **Not current.** §13 is the reconciliation. |
| `.workflows/plan/<set>/` | ~35 plan sets after the `docs/plans/archive/` set — Nina (16 phases), admin console, media dedupe, composer, search, image pipeline, and more. `RECONCILIATION_RULINGS.md` in `nina-chatbot/` is the binding cross-phase record for Nina. |
| `CHANGELOG.md` | the authoritative narrative history; v0.1.0 → v1.0.0. Notes that `RECONCILIATION_v0.1.0.md` (the 39 v0.1.0 rulings, R-1..R-45) was **removed from the tree** in Sept 2026 — read it from git history. |
| `README.md` | visitor-facing, with capture-harness media (`docs/media/`, seeded demo data — it says so) |
| `docs/nina/persona.md` | Nina's canon (intent; `lib/nina/persona.ts` ships it) |
| `docs/token_maxxing/` | session records for the token-maxxing series |
| `.claude/skills/generate-badge/` | the badge-art skill; `style.md` is parsed by the Python tools — its `<!-- STYLE BLOCK v2 -->` is frozen (see §6) |

---

## 13. Plan-by-plan cross-reference

The part this document exists for. Status vocabulary: **SHIPPED** = in the tree and load-bearing
today; **SHIPPED+AMENDED** = shipped with deltas that later work changed again; **SUPERSEDED** =
a later ruling/feature replaced the plan's central mechanism. Verification was by reading the
plan's own execution record and spot-checking the code (grep/read on 2026-09-11), not by
re-running suites. The plans themselves live under `docs/plans/archive/` (archived 2026-09-11).
The two `F16` entries below are two different files: `F16-splits-column-gutters.md` and
`F16b-upload-kind-swap.md`, the latter renamed from its race-duplicate name at archival.

### F01 — Foundation & Deployment · **SHIPPED+AMENDED**
Planned the scaffold, `lib/env.ts` (six-var eager core + lazy groups), CI, Vercel/Neon/Blob
provisioning, the `after()` background-job decision with a 55 s soft deadline, and the
`runins.site` origin. As built: one z.ai key for both endpoints (R-40 deleted
`LLM_VISION_API_KEY` — today's `.env.example`/`lib/env.ts` have no such var); `typecheck` =
`next typegen && tsc`; the probe route (Task 31) verified `after()`/`waitUntil` live and was
removed; the F01 directory skeleton was repeatedly reshaped by later features (e.g. `lib/llm/`
gained `prompts/`, `catalog.ts`, `textModel.ts`; `lib/extract/`, `lib/review/`, `lib/nina/`,
`lib/admin/`, `lib/push/`, `lib/panel/`, `lib/photos/`, `lib/share/` did not exist yet). The
Hobby 60 s ceiling itself was later superseded by Fluid compute's 300 s (measured 2026-09-06,
`.github/workflows/nina-image.yml` header) — the plan's "upgrade path" paragraph is the one
that aged correctly.

### F02 — Auth, profile & onboarding · **SHIPPED+AMENDED**
Google-only Auth.js v5, JWT sessions, `proxy.ts` positive matcher, `requireUserId()`/`requireUserIdApi()`,
`profiles` + skippable onboarding, `/me`, and **`lib/metrics/hrMax.ts`** — the single HRmax
resolver (measured → observed-beats-estimate → Tanaka → null, never a constant). As built: the
three resolver queries live in `lib/db/queries/` (F03's convention) not inline; the never-shipped
§4.5 transition banner (`hrMaxTransitionAt`/`resolveHrMaxAsOf`) was removed on 2026-09-12; the runs
list *is* `/` (decision b); `AUTH_URL=''` treated as unset.
Still true and load-bearing: observed-only-reviewed (D16 at the resolver), the null-degradation
table, and the INVARIANT B hand-off that F11 later discharged with frozen payload values.

### F03 — Data Layer · **SHIPPED, with the reconciliation's three biggest rulings**
The keystone. Planned 10 app tables + queries; R-1 overruled the draft-run design (**runs are
born reviewed; F05's commit creates them**), R-5 forced the `coalesce` dedupe index, R-7 made
`corrections` an event array, R-10 made record writes wholesale replace. As built: 45→
(now far more) exported queries; `lib/id.ts` (no nanoid dep), `lib/date/ranges.ts` (zero-dep
ISO-week math), `fakeDb` recording driver for unit suites; `getRunDetail` = one `db.batch` round
trip (N+1 regression-guarded); the two-insight-query additions (`getInsight`/`getLatestInsight`/
`saveInsight`) and `getRunsBetween`; `db:push` deliberately absent. (Its HRmax reads later
collapsed into the one surviving `getObservedMaxHrRun`; the monthly-totals pair and
`listExtractions`/`deletePhoto` went caller-less and were removed in the 2026-09-11 sweeps.)
Today the file is shared by seven domains and guarded by `ci:data-layer-guard` +
`tests/db.queries.reviewedOnly.test.ts`'s completeness test. The `shares` partial index and the
`runs` coalesce index are live and asserted against the migration *file*, not just the schema.

### F04 — Ingest & Vision Extraction · **SHIPPED, constants re-measured twice**
The token-floor guard (500/image, checked before the text is read) is exactly as planned and is
still the single highest-value ten lines. The execution record corrected the plan twice: the
repair is text-only with `imageCount: 0` (a 3-image floor would have killed every repair), and
the repair budget moved 12→18→36 s with `MIN_REPAIR_BUDGET_MS` 6→14→28 (a real repair costs
about what the primary costs; on Hobby the repair is *usually skipped*, by design of the gate).
`FIELD_OWNERSHIP` became `FIELD_SOURCES` (avg HR lives on two screens). The canonical
screenshots are committed (`research/fixtures/`) with a golden 108/108 response wired into CI.
`/x/[extractionId]` (R-1's pre-commit route) replaced the planned `/r/new/review` shape. The
kind picker's defaults are now the device order (F29) and mislabels swap in one tap (F16b).

### F05 — Review & Correction · **SHIPPED+AMENDED (route superseded)**
Four arithmetic consistency checks (tolerances seeded from the fixture), the corrections log
with `phase` and `checkId` attribution, manual-entry-as-blank-review, `corrected_at`, and
`onRunCommitted` as the invalidation seam — all shipped and still current (the four checks are
also the capture harness's seed invariant). Superseded: `/r/[id]/review` never existed; the
review lives at `/x/[extractionId]`, edits at `/r/[id]/edit`. The commit is one transaction plus
two follow-ups (corrections write is after, not atomic) — recorded, accepted. Post-F05 life:
the input masks (F14), `commitStatusLine` extraction after the pluralisation bug (F21), and the
review screen now also feeds the demo/capture pipeline.

### F06 — Metrics & Personal Records · **SHIPPED+AMENDED**
Every formula as planned (canonical-fixture values pinned in tests, including the two
"wrong value must not appear" regressions); 7 flags with strict-threshold boundary pairs;
ACWR as coupled Gabbett with the insufficient-history null; 10-record catalog with basis-points
`best_paced_run`. Amended by R-3 (avgHrPctMax uses the inclusive resolver — 91.5% not 92.5%;
the self-excluding resolver belongs to `new_ceiling` alone), R-9 (`end_hr_bpm`/`hr_1min_post_bpm`
landed so `SLOW_HR_RECOVERY` is live), R-10 (`RecordsGateway.replace`, `{rows, changed, removed}`).
Since then: an **eleventh** record (`earliest_start`, F32) with `unit: 'clock'`, and the
recompute-staleness gap has a named mitigation (`scripts/backfill-record-keys.mjs`).

### F07 — Insights (LLM Narrative) · **SHIPPED+AMENDED, twice by vendor drift**
Prompts, forced `report` tool, Zod + one repair + *silence* (no fallback prose), `facts_hash`
+ `promptVersion`, week/month memory (`trendSincePrevious`), the intent write-back
(`NULL` = keep asking, `'unspecified'` = asked-and-answered), `/api/cron/rollup`. As built:
**property descriptions on the tool schema** (measured 0/3→5/6 valid first attempts — the
highest-value change in the feature); timeouts raised after glm-5.3 measured 13–16 s; the cron
self-limits at 55 s; the recency-read/compare-and-regenerate mechanism replaced the
exact-tuple read (F07 delta 6). **F31 later found the endpoint had started emitting thinking
blocks that ate the whole token ceiling — `thinking: {type:'disabled'}` is now mandatory on
this client too**, with `maxDuration = 60` on `/r/[id]` and `/trends`. F28 added `recentRuns`.
`narrativeModel()` is now async (app_settings). The rule "the LLM never computes" has one
Nina-era exception by explicit repeal (RU-1 lets body weight reach Nina's payloads) — the
*insights* payload guard (`ci:llm-payload-guard`) is unchanged.

### F08 — Views, Charts & Trends · **SHIPPED**
All five charts, the RSC/client split (`*Inner.tsx` + dynamic, Recharts in one lazy chunk),
`lib/format.ts` as the only formatter, ISO-week clipping with the sum invariant, the dual-axis
waiver contained to one file (grep-guarded), `?scope=&key=` clamping, the empty/partial/loading
state table. Deltas as built: F06's distance buckets replaced the plan's `DistanceBand`;
components live in `components/charts/` (no route groups existed); design tokens landed at first
write (no placeholder hex ever shipped). Post-F08: F22 added `kmAxisTicks` (stride ladder,
force-appended final tick carrying `*`) after 22-row runs overprinted their axis.

### F09 — Badges, Achievements & Profile · **SHIPPED+AMENDED**
22-key catalog (R-33's two additions included), pure rules + gateway, `/me` shelf with visible-
but-locked treatment, first-run-fires-trivially, `dawn_patrol` fires once. Amended: crossings
are "qualifies now, deduped by PK" (idempotent); `new_ceiling`/`long_way_home` read
`RecomputeResult.changed`; the shelf is a list not a grid. Then F12/F13 rebuilt the data model
(**award ledger**, PK user_id+key+dedupe_key) and F27 R3 stamped the completing run onto period
awards (min-count rule) — the plan's `count` semantics are historical.

### F10 — Badge Art Skill · **SHIPPED, with one measured reversal**
The skill, `style.md` (STYLE BLOCK v2 — frozen; appending anything destroys subject adherence,
measured 12 pizzas), the Python toolchain, key hygiene (`badges:check`). As built: 22/22 in 35
generations; **the anchor is a ruler, not a stencil** — `input_references` is a strong img2img
(the plan's central mechanism reversed, measured); deck coherence comes from the style block +
seed 1970; two scene rewrites; four bands re-derived at six badges (two got *stricter*).
F15 later widened every master to 1024×768 (outpaint + arithmetic crop, `extend_badge_art.py`)
and F25 added the **records deck** (pentagon, native 4:3, shared anchor, `tools/decks.py`,
`SHAPE_WIDTH` with provenance bands, `observed=0` ⇒ advisory-then-hard).

### F11 — Sharing · **SHIPPED, mitigation superseded by R-15**
Get-or-create with the partial unique index, revoke≡unknown 404s, per-photo inclusion, the
include/exclude table (sharper than planned: `intent` is *not* shown), OG discipline, the
route-group fix that killed soft-404s (measured 200→404), the client-prop audit. Superseded:
the plan's "say the true thing and accept blob permanence" was replaced by R-15's **blob
rotation on revoke** (`lib/share/rotateBlobs.ts`) — the designed-but-unbuilt photo proxy
never needed building.

### F12 — Badge Panel & Count · **SHIPPED, data model superseded by F13**
Native `<dialog>` shell (focus trap, `onCancel`, the CSS `::backdrop`), rows-as-buttons, the
×N pill, halved copy with an enforced budget. Its §4.1 known defect (count inflation on
re-review) and its "most recently" date line are both **gone** — F13's ledger replaced the
upsert, F23 removed the line, F27's expander replaced the summary with the actual dates.

### F13 — Badge Award Ledger · **SHIPPED**
The hand-written migration (drizzle-kit cannot express the backfill+PK swap), `dedupe_key` as a
plain column (generated columns would recompute on R-22's SET NULL — the documented trap),
`foldAwards` in `facts.ts`, `insertBadgeAward`/`getBadgeAwards*`, deploy-order warning
(migrate-then-deploy, no review in between). Live in production; `count` sums the column (pre-F13
rows carry their aggregate; F27's panel says "N earlier, dates not recorded" rather than
inventing dates).

### F14 — Mobile Input Keyboards · **SHIPPED+AMENDED**
`maskTimeInput` (strip, cap, left-pad-min-3, group from the right; clearable — the
found-by-tests defect), `deferError`, the Sheet focus fix (ref-synced `onClose`, deps `[open]`,
asserted by source scan). Amended away: **`ClockInput` and the mask are gone from the two clock
fields** — F14 round 1 made Started/Ended native `type="time"` (and F30 confirmed the native
control as the right home), so the mask now serves the duration/pace/split fields only.

### F15 — Badge Master Aspect · **SHIPPED**
The measured seam defect (raking light + weave), the outpaint tool, the crop-to-deck-size
arithmetic, `SHAPE_WIDTH × h/w`, the three latent LOOK-AT-IT crop bugs, 1024×768 masters with
`small` = centre-square crop (shelf unchanged by the geometry identity), panels −25% bytes.
The records deck later superseded *the tool's necessity* (F25 generates native 4:3) but
`extend_badge_art.py` remains for the badge deck's 22 masters, which are still 1024×768 widens.

### F16 (splits gutters) · **SHIPPED** — `pl-3` gutters + `whitespace-nowrap`; the paired
structural+class tests exist because the structural test alone **passed on the broken
component** (the honest lesson recorded in the plan).
### F16b (upload kind swap) · **SHIPPED** — `reassignKind` pure function, `taken` prop deleted,
no dimming, per-tile `gen` race guard; re-upload-not-relabel decision stands (the signed token's
kind is read by nothing *today*, and the comment anticipates the day it is).
### F17 — onPick purity · **SHIPPED** — `planPicked` in `lib/`, value-not-updater `setTiles`,
per-generation `started` guard with delete-on-failure; measured 2→1 uploads, 6→3 for a triple
pick; the orphaned-blob cleanup it deferred became the `reap-orphaned-blobs` skill/`blob:reap`.
### F18 — Screenshot Gallery · **SHIPPED** — `lib/photos/gallery.ts` (`stepIndex` double-modulo,
`decideSwipe` with the three pinch guards), one lifted `PhotoViewer`, split
zoom/toggle rows, square `object-cover object-top` tiles; `SheetSource` left alone on purpose.
### F19 — README & Capture Harness · **SHIPPED+AMENDED**
`scripts/capture/` (seed → mint JWE cookie → Playwright commit/stills/GIFs → ffmpeg two-pass →
byte-budget), the seeded-invariant dataset (all four checks pass; the flagged run is the real
golden fixture with km 1's real 436 miss), the README rewrite with the seeded-data disclosure.
Amended: F21 added `--only`; the hero GIF budget and pass-ordering lessons are recorded; F22
rewrote the harness comment that justified photographing the modal-distance run.
### F20 — Reduced Motion · **SHIPPED** — the four-line keyframe flattening (cascade-by-name),
`ri-spin` deleted, the four-assertion guard, mutation-tested and engine-measured.
### F21 — Review Copy Pluralisation · **SHIPPED** — `commitStatusLine` pure function +
agreement invariant; the re-shoot discipline (`--only`, produced-what-was-asked check).
### F22 — Pace/HR Axis Ticks · **SHIPPED** — `kmAxisTicks` stride ladder, `interval={0}` kept
and documented as load-bearing, dots/table/accessibility untouched.
### F23 — Badge Copy Trim · **SHIPPED+AMENDED** — "most recent of N" and the panel's dates
line removed. F27 later gave every earned date a home (the expander), which is the future F23's
comment pointed at.
### F24 — Detail Panel Shell & History · **SHIPPED** — `?panel=kind.key` (one parameter,
`.` separator), `pushState`/back-or-replace close semantics, `DetailPanel` render-prop shell,
`RunDateLink`, the closed-ref focus fix anticipating F27's expander.
### F25 — Record Patch Art · **SHIPPED** — ten 1024×768 pentagon masters, `tools/decks.py` +
`decks.json`, per-deck parity, shared anchor, `next.config.ts` immutable headers, the addendum
finding (§4: appending to the style block = pizzas), 26 generations/$1.04.
### F26 — Record Row & Panel · **SHIPPED (round 2 included)** — one-line rows, `RecordDialog`
on the shared shell, and round 2's uniform "Beat … / No earlier value recorded." slot (the
round-1 absence read as a bug; "first one on record" was rejected because cascade-deletes can
manufacture a null).
### F27 — Badge Earn Dates · **SHIPPED through round 4** — `earnedDays` through the fold, the
expander, `&dates=1` via `replaceState`, the R3 min-count rule (period awards stamp the
completing run; `periodLabel`/`scopeKey` reverted in R3), the backfill script (dry-run default)
whose own run found the `Date`-vs-`DateISO` timezone bug (cast the column `::text`, the
parameter `::date`).
### F28 — Recent-Run History · **SHIPPED** — `getReviewedRunsBefore` (reviewed-only-listed),
8-run `recentRuns` facts with precomputed `daysBefore`, prompt rules incl. "don't hang more
than one prose field on one contextual fact", `SESSION_PROMPT_VERSION` 1→2 in the same commit.
### F29 — Default Kind Order · **SHIPPED** — `DEFAULT_KIND_BY_INDEX = ['heartrate','splits','summary']`
(device order), the permutation invariant asserted, `planPicked` fallback follows the same
order; the picker's render order deliberately untouched.
### F30 — Clock-Time Normalisation · **SHIPPED** — `normalizeClockTime` Zod transform +
RULE 10; ambiguous bare times ⇒ null (the blank the reviewer already corrects), meridiem'd
times auto-convert; `research/schema.mjs` deliberately untouched (the frozen 108/108 baseline).
### F31 — Narrate Thinking Disabled · **SHIPPED** — `thinking: {type:'disabled'}` on the
narrate client (measured 17 s/tool_use vs never), `maxDuration = 60` on `/r/[id]` + `/trends`,
the cron-session-gap comment corrected (narrow reading won).
### F32 — Earliest Start Record · **SHIPPED through round 2** — `unit: 'clock'`, plain-min
comparison (no invented day boundary), moka-pot pentagon patch (the 9b light-sentence lever,
recorded in style.md), `scripts/backfill-record-keys.mjs` after round 2 found the
derived-table-staleness gap.
### F33 — Nina · **SHIPPED** — the pointer plan's 16 phases all exist as code: sessions/chat,
memory, images (in-process after() + GH backstop), proactivity+nags, push, avatars, admin
surfaces, and the `RECONCILIATION_RULINGS.md` three-repeal set (RU-1 weight, RU-2 runtime
OpenRouter in `lib/nina/` only, RU-3 push). The plan index (`NINA_CHATBOT_PLAN.md`) itself no
longer sits in `.workflows/plan/nina-chatbot/` — the phase files and rulings do; the index's
content survives in `CHANGELOG.md` and the tree.
### 2026-09-10 — `/admin/photos` redesign · **SHIPPED, route since merged** — icon-only one-row
controls, compact rail, chat-photo→avatar adoption with byte-copy + `source_key` idempotence
(verified: `components/admin/*`, `lib/admin/ninaAlbumActions.ts`, `chatPhotoActions.ts`). The
`/admin/photos` route itself was purged into `/admin/nina`'s Image collection by image-collection
p2; the work lives on there (see §8).
### 2026-09-10 — Image-gen controls · **SHIPPED** — `NINA_IMAGE_DAILY_CAP` env (default 30),
block-token `prompt_template` with three protection layers, per-pref image model,
`app_settings.text_model` + async `narrativeModel()` (verified: `lib/nina/imageprefs.ts`,
`imagerecipe.ts`, `lib/admin/imageGenModel.ts`, `TextModelSelect.tsx`, migration
`0020_image_gen_controls.sql`).

### What no plan describes (and only the tree does)

- **The post-F33 plan sets** (~35 under `.workflows/plan/`): the admin album/file explorer,
  media dedupe (content-hash + perceptual twin gate in both write paths), chat sessions,
  offline replies, burst-cancel, search, composer, job redo/soft-delete, personality tuning,
  photo-caption-from-image, share-to-Nina, and more. The changelog + `.workflows/plan/` are
  their record.
- **The component-test tier** (2026-09-11): `.test.tsx` DOM tests for Nina chat components and
  the admin explorer, ending the "no component tests by design" era that F14/F16/F17/F18/F21
  all had to design around.
- **v1.0.0's own summary** in `CHANGELOG.md` is the best single prose account of the Nina
  release: 291 commits, +507k lines, 3,948 tests at release.

---

## 14. Known sharp edges (for the next reader)

1. **One database.** Every migration, backfill, and capture run touches production. The
   backfill scripts are dry-run-by-default for this reason; keep that property.
2. **The migration numbering has a fork scar** (two `0011_*`, no `0014`). Derive the next
   number from `origin/main`, never from a local checkout or a plan doc.
3. **Plan-number races** (`F16` ×2, `F20→F21/F22`) — settled by the `F<card+1>` convention and
   by re-checking `origin/main` immediately before committing. The tree's `F16` residue was
   renamed `F16b` at the 2026-09-11 archival.
4. **STYLE BLOCK v2 is frozen.** Per-deck or per-patch wording rides in scene lines, `--note`,
   and sidecars; bumping the block means regenerating both decks (and appending anything was
   measured to be worse than either).
5. **Vendor drift is a live risk.** F31's thinking-block incident and F04's endpoint traps were
   both silent-200 failures. The guards (token floor, `thinking: disabled` tests, live suites)
   are the tripwires — keep them failing loudly.
6. **`records` staleness on a new key** recurs by design (the derived table only recomputes on
   commit). `scripts/backfill-record-keys.mjs` exists; run it when the twelfth key lands.
7. **`research/fixtures` and the golden response are the extraction baseline.** Production
   prompt rules (6a/8/9/10) are additive to it on purpose; do not mirror them back into
   `research/schema.mjs`.
