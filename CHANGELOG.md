# Changelog

All notable changes to Run Insights are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Feature codes (`F01`–`F33`) refer to the plan files in [`docs/plans/archive/`](docs/plans/archive/). Ruling codes
(`R-nn`) refer to `RECONCILIATION_v0.1.0.md`, the v0.1.0 arbitration record — removed from the
tree in September 2026, readable in git history.

## [Unreleased]

### Changed

- **`docs/plans/` archived to [`docs/plans/archive/`](docs/plans/archive/).** All 36 remaining
  plan documents (F01–F33 plus the two 2026-09-10 design docs) are SHIPPED or SHIPPED+AMENDED
  per the plan-by-plan cross-reference in `docs/architecture.md` §13, so the primary docs tree
  now holds only living references. The plan-number race's residue is settled in the filename:
  the second `F16` claimer (upload kind swap, committed 23 minutes after the splits-gutters
  F16 on 2026-08-21) is renumbered `F16b-upload-kind-swap.md`. Content is byte-identical —
  nothing was deleted — and every live reference (this changelog, README, the CI guards' error
  strings, source comments, the badge-art tools and skill) points at the archive location.

## [v1.0.0] - 2026-09-11

Nina. The app that read one run at a time now has a runner inside it — a chatbot who
remembers him, nags him, photographs herself for him, and reaches his phone when the app is
closed. Everything else that shipped is smaller than that, including five bug-hunt cards
(F28–F32) that each found something wrong by measuring production rather than by guessing.

291 commits, 755 files changed (+507,346/-2,248 lines), 3,948 unit tests across 183 files —
up from 1,199 tests at v0.1.0. Live at **[runins.site](https://runins.site)**.

### Added

**Nina — a chatbot who lives in the app (F33)**

- **A companion character with a name, a memory, a face and eleven traits**, built across
  sixteen phases (`docs/plans/archive/F33-nina.md`). `/nina` becomes the fifth tab; her system prompt
  (`lib/nina/persona.ts`, `lib/nina/prompts/`) is assembled fresh on every turn from a stored
  `nina_tuning` row rather than a frozen `const`, read live with no cache anywhere on the path.
  Six relationship registers ship — nobody, casual friend, sister, best friend, girlfriend, and
  a sixth added later, **the Instructor** — each with its own address forms, its own prose
  blocks and its own gate, so clearing the relationship checkbox degrades every gated feature
  back to best-friend behaviour with zero leftover bytes. The girlfriend register got its own
  *manja*, vowel-lengthening vocabulary, and later a `horny` trait. The Instructor register
  turned the app's existing pattern detector — `REPEATED_HIGH_AVG_HR`, `PACE_REGRESSION` — into
  an actual coaching response: a fired pattern now becomes a named prescription with one change
  and one deadline, and a tenth memory slot, `training_plan`, holds the week she authored for
  him, distinct from `running_days` (when) and `goals` (what for). The character-tuning work
  repealed twelve hardcoded prompt rules to make the dials real — the frozen "best friend"
  identity, the nickname-only address rule, all three copies of the no-body-comments
  prohibition, the threat/withdrawal line, computed-only anger — each repeal leaving its reason
  in the file it came out of, with a test pinning that the defaults reproduce the pre-tuning
  prompt character for character until a slider actually moves. Deliberately **not** repealed:
  the not-a-doctor rule, the arithmetic rule, the medical-condition entry in the never-say list,
  and the image provider's own content guardrails. The librarian that distils conversation into
  memory was told the relationship register too, so a couple's own words are read as their
  register rather than filed as a fact about him.
- **Chat is instant and survives a closed tab.** `sendNinaMessage` used to await the model
  inline; it now persists the runner's message and a claim in well under a second and hands the
  13–45 s model turn to a server-owned `after()` task, WhatsApp-style. An open tab polls and
  reveals her bubbles on a staggered schedule; a closed tab needs nothing, because the rows are
  already in the database by the time the page next renders. A second send while she is still
  thinking cancels and retargets the pending turn rather than queuing behind it, and if several
  of his messages land before she answers, one turn now answers all of them together instead of
  only the last.
- **A turn that died gets revived, and a message she never answered can be resent.** Reopening
  `/nina` mid-turn no longer guesses from a 90-second heuristic alone — the page reads the
  pending claim directly, and the give-up window is pinned to the server's own background
  budget rather than an identity that happened to match it. A turn whose `after()` invocation
  died outright is now swept and re-fired on arrival, capped at three attempts per runner
  message so a genuinely broken turn stops retrying rather than looping forever. And where the
  only way to ask again used to be retyping the sentence — writing a second copy of it into the
  context she reads — `resendNinaMessage` now reopens the same persisted row with no new insert
  at all, proven by a test asserting the insert functions are unreachable from its body.
- **She remembers across separate conversations, not just within one.** `/nina` gained a
  sidebar of named chat sessions — pin, rename, delete, automatic titling after the first
  exchange that never overwrites a name he typed himself. Messages, his and hers, can be edited
  or deleted with a left-swipe gate, because `getNinaMessageWindow` puts the raw text into every
  later prompt and a correction has to change what she actually read, not just what's on
  screen. A search box deep-links straight to a hit with a soft-navigation landing and a
  blinking highlight on the right bubble. Every photograph in a conversation is a tap target for
  a full-screen overlay, with a download that actually saves cross-origin bytes via a
  share-sheet-or-fetch ladder, and an attach action that reuses the existing attachment
  machinery with no re-upload. One production bug shipped the whole sidebar unreachable for a
  day: its provider was mounted one level too low in the tree, so its trigger button rendered
  null on the one screen it was needed — invisible to a green suite because nothing in this
  repo's tests renders a component.
- **Memory, distilled from conversation into durable facts.** A librarian model condenses chat
  history into slots and a fact ledger (`lib/nina/memory.ts`, `lib/nina/distill.ts`);
  `/admin/memory` lets an operator hand-edit or retire what she knows, and deleting a session
  now takes its distilled memory with it.
- **Photographs, in both directions.** A runner can send her photos (compressed client-side,
  described by a vision call, captioned into the conversation), and she can generate her own —
  a selfie or an avatar change dressed by the same tuning dials that shape her prose, captioned
  from the actual generated scene rather than a canned line. Image generation shipped first as
  a GitHub Actions dispatch behind a `workflow_dispatch` doorbell, then moved onto Vercel Fluid
  compute after a live probe measured the platform surviving 90 seconds past its documented
  60-second Server Action ceiling with the response already closed — GitHub Actions is now a
  backstop, not the primary path. A promise she makes now knows which camera pays it out and
  settles against an exact job id, never a same-day count, so a photo requested on demand can't
  accidentally settle a promise made days earlier. A reference image can ride along on a
  generation request at the cost of a measured timeout budget; a re-attached photo is a
  reference rather than a copy; a chat photograph orphaned by a deleted session is re-parented
  rather than destroyed.
- **Push notifications and her first service worker.** A phone buzzes when she answers with the
  app closed. `lib/service-worker.js` holds exactly two listeners — push and
  notification-click, no fetch handler, no cache, deliberately — with three documented
  deviations from Next's own PWA guide (the VAPID key travels as a server-component prop, not a
  `NEXT_PUBLIC_` var; the header matcher targets the framework's real compiled path, not the
  guide's `/sw.js`), each verified against the running build rather than assumed.
- **Emoji/phrase shortcuts and admin-configurable image generation.** `/admin/shortcuts` lets an
  operator add trigger phrases that expand into the runner's turn. `/admin/image-generation` and
  `/admin/personality` gained model dropdowns for the image camera (Qwen Image 3 / Qwen Image 3
  Pro) and the text model (GLM 5.3 / GLM 5.3 Flash) so an operator can change either without a
  redeploy; a daily generation quota that used to be a hardcoded 6 became an env-tunable default
  of 30; and the entire image prompt template became admin-editable as labelled blocks
  (`{{camera}}`, `{{subject}}`, `{{scene}}`, …), guarded by one shared validator so a stray brace
  or a missing required block refuses the save with a named reason rather than shipping a broken
  prompt.
- **`/admin/nina` became a real file manager for her photo album** (seven phases): a folder
  tree, breadcrumb, paginated grid, drag-and-drop upload with a four-parallel bounded queue,
  batch registration, thumbnail derivation, and folder maintenance that refuses operations with
  no honest inverse (a rename onto an occupied path, a delete of the folder holding her current
  photo). A later pass added a read-only virtual "Media" folder aggregating every original
  regardless of kind, then simplified `/admin/photos` to one icon-only control row per the
  operator's own request for something "compact and simple," including turning any chat
  photograph into her profile picture without leaving the page.

**Five bugs found by measuring production, not by guessing (F28–F32)**

- **The session narrative reads the runner's recent history (F28).** It used to see three
  aggregate scalars over the trailing 28 days and nothing else — the 22 Aug narrative spent
  three of its four prose fields on the same number ("on a once-a-week schedule", "with only
  one run per week", "at roughly one run per week"). The payload now carries the last eight
  reviewed runs before this one, each with its date, the gap in days, and how hard it was, plus
  prompt rules saying `runsPerWeek` is an average and not a schedule, cited at most once, and
  that no two prose fields may lean on the same fact. Every existing session insight
  re-narrates once, by design.
- **The upload picker's default kind order now follows the device, not the Fitness app
  (F29).** The hardcoded default — Summary → Splits → Heart rate, justified as "the order the
  screens appear in the app itself" — was wrong on every single upload: the runner's device
  hands screenshots over Heart rate → Splits → Summary, the opposite order. `DEFAULT_KIND_BY_INDEX`
  stopped being an alias of the canonical kind list and became its own literal, decoupled from
  `SCREEN_KINDS`; the per-tile dropdown order was deliberately left untouched, since it answers
  a different question ("which screen is this?" not "which screen is this probably?").
- **`startTime`/`endTime` were never actually `null` (F30).** Measured against nineteen real
  extractions across 38 time values: zero nulls, 89% non-conforming but present — the model
  read Apple's on-screen timestamp perfectly and the extraction prompt simply never authorised
  converting it, so a value like `"5.32 PM"` silently failed the native `<input type="time">`
  and rendered as a blank field the runner reported as "always null." Fixed with **both** a new
  prompt rule (the one on-screen Apple convention that had never gotten its own numbered
  override) and a `normalizeClockTime()` Zod transform covering all three entry paths. One case
  stayed a deliberate `null`: a bare one-digit hour with no AM/PM is genuinely ambiguous —
  production shows a bare-time guess is wrong 1 time in 8 — and a blank field a human corrects
  beats a plausible value nobody checks.
- **The narrative call needed thinking disabled too (F31)** — see Fixed, below.
- **`earliest_start`, the eleventh personal record (F32).** The earliest clock time the runner
  has ever set off at, stored as seconds past midnight in a new `clock` unit, compared as a
  plain minimum with no invented "sane morning" threshold — 00:15 legitimately beats 04:30,
  because the card asked for "the earliest time," not "the earliest reasonable time." Its patch
  is a stovetop moka coffee pot, chosen to avoid a clock face (the style's no-legible-dial
  rule), a second dawn bird (already spent on `early_bird`), a milk-bottle label, or a fifth
  light source in a deck that already has four. The art took five generation attempts to
  isolate a single lever — the twill/brightness check answers to a sentence describing the
  *light*, not the cloth's colour — a finding now written into `style.md` for the next patch
  that drifts. A second round found that a new catalog key needs a **backfill**, not a
  migration: the records table is fully derived and only recomputes on the next reviewed run,
  so every existing user sat on a stale ten-key set with no signal distinguishing "no record
  yet" from "never computed for you" — `scripts/backfill-record-keys.mjs` (`npm run
  records:backfill`) ships insert-only, `on conflict do nothing`, computing a winner only for
  keys a user has no row for.

### Changed

- **Four independent layers of media dedupe now exist**, added in response to four separately
  measured production bugs. Byte-hash dedupe (shipped at v0.1.0) only ever caught a picked file
  whose bytes matched a stored row's bytes exactly — but every pick re-encodes through
  client-side compression, so a photo downloaded out of the album and re-uploaded in chat
  always produced a fresh byte hash and grew the collection by one duplicate. A perceptual
  layer followed: `perceptual_hash`/`perceptual_sig` columns, a 64-bit dHash plus a 16×16
  signature, checked at write time and self-healed by a sweep. A re-encoded photo that had
  already landed as two separate rows before the perceptual gate existed needed its own
  catch-up sweep. The sweep's own first landing computed hash fills for its report but never
  wrote them, leaving 27 production rows permanently `NULL` and quietly defeating the
  write-time check meant to prevent the next duplicate — caught and fixed by turning every fill
  into a real, guarded op. Most recently, the twin gate assumed same-photo duplicates always
  arrive at identical pixel dimensions; a same photo re-saved at a different resolution passed
  straight through, so the gate grew a second, more tolerant comparison path gated on aspect
  ratio, size ratio and a wider dHash threshold — kept structurally separate from the
  exact-dimensions path so neither regresses the other. And because a stored signature is
  trusted forever and never automatically re-verified, one "still duplicates after re-upload"
  report turned out to be a signature that was simply wrong from the moment it was written — 3
  of 17 production signatures, bulk-checked, disagreed with a fresh recompute of their own live
  bytes — so the sweep now re-verifies rather than only ever trusting storage.
- **Nina's character is now tunable, per user, from `/admin/nina`.** Eleven trait sliders —
  anger, chill, sad, flirty, steamy, wise, annoying, funny, happy, anxious, concerned — plus the
  relationship setting above, four further dials (profanity, clinginess, photo eagerness,
  verbosity) and a free-text note. **The defaults reproduce the prompt that shipped before
  this, character for character, and a test asserts it** — until a slider moves, the diff to
  her behaviour is empty. A promise she makes can now pay out as a photograph *in the
  conversation* rather than only as a profile-picture change, which is the feature the user
  asked for by name: *"she is proposing if i run consistently this week, then she will send me
  her sexy photo … will DEFINITELY MOTIVATE ME TO RUN AS CONSISTENT AS I COULD BE."* The
  Personality admin panel auto-saves rather than requiring an explicit commit through a
  tuning-revision mechanism, which was purged along with its counter and its database column.
- **The app-wide bottom chrome was rebuilt for a phone, repeatedly.** The bottom bar's raised
  coral FAB — which overhung the bar by 20px — became an ordinary fifth tab cell (`+`/`New`),
  closing 18 of a reported 19px gap between the Nina composer and the tab bar. The admin area
  got its own responsive shell: a safe-area-aware, icon-only one-row bottom nav (seven Lucide
  glyphs, one 5rem floor); its own PWA install target, so the `/admin` home-screen tile opens
  `/admin` rather than the runner's app; its own status-bar tint; and its own home-screen icon
  deck, "so it is not the runner's."
- **`docs/plans/archive/` and the orchestration bookkeeping tree were purged of landed work** — the
  v0.1.0 contract trio (roadmap, feasibility record, reconciliation), 53 root plan-set files
  (18.4k lines), and 25 landed orchestration sets — leaving only the feature-pointer stubs (like
  `F33-nina.md`) and two active design docs. The full reasoning behind every repealed rule and
  every measured decision remains readable in git history, per this project's own convention
  for retired contract documents.

### Fixed

- **`glm-5.3` started emitting an extended `thinking` block by default and it silently broke
  every insight (F31).** The block consumed the entire `max_tokens` ceiling before any
  `tool_use` block appeared, so the narrative call returned nothing for every scope, every
  user, for a full day, with nothing recording the attempt — a run committed completely
  (splits, zones, photos, badges all fine) and only the prose silently never arrived. This was a
  vendor-side model behaviour change, not a regression. Fixed the way the sibling vision client
  already had it since F04: `thinking: { type: 'disabled' }`, which also *dropped* latency
  (17.0s vs 18.3–38.3s measured) rather than costing anything — plus giving the two calling
  pages the 60-second `maxDuration` their timeout budget had always assumed and never received.
- **The vision token-floor guard was false-tripping legible small photographs off as
  "dropped."** The floor was sized for a 768px photo; a 612×862 image that was never resized
  (its short edge was already under the composer's target) scored under the floor and got
  refused — Nina told the runner "the picture didn't load" about a photo that had, in fact,
  arrived. Measured relationship: image tokens run roughly pixels/1,100; lowering the floor to
  150 keeps the real drop signature caught while passing genuine photos down to ~350px.
- **A mid-reveal merge could render the same Nina bubble twice.** One chat rendered seven
  bubbles for four committed rows in production: the staggered reveal appended every polled
  bubble unconditionally, while a full-route delivery landing mid-reveal delivered the same
  rows through a separate, already-idempotent merge path — two channels feeding one list, and
  only one of them was idempotent. Fixed by making the reveal's own append id-idempotent
  against the list as React will actually commit it.
- **`/admin/photos` refused every upload, silently orphaning a paid Blob object per click.**
  `ADMIN_CHAT_PHOTO_ID_RE` didn't match Vercel Blob's actual stored pathname shape (a 12-char id
  plus a 30-char Vercel-generated suffix = 43 chars, not the 12–24 the regex allowed) — the same
  defect, independently, in the in-chat camera path's own id pattern. Both unit-test suites had
  used unrealistically short random suffixes, which is why it shipped green; fixtures now copy a
  real 30-char suffix from production.
- **A tab-bar drift bug turned out to be a CSS `translate` axis mistake.** A user-reported
  rightward drift traced to `translate`'s single-value shorthand form, which is the **X** axis —
  a formula intended as a vertical drop rendered as horizontal instead. Fixed by spelling both
  axes explicitly (`translate: 0 calc(...)`); a second pass fixed the composer floating 1px
  above the bar because it cleared the grid height but not the border, and added geometry tests
  specifically so a regression to grid-height-only fails.
- A drizzle migration (`0012`) was regenerated above production's already-applied watermark
  after two branches' migrations collided on ordering — verified byte-identical DDL before the
  stale file was deleted, per this project's standing "regenerate, never rename" rule.
- A CI guard (`ci:client-secret-guard`) had been reading prose comments as if they were
  executable source, flagging a README sentence *describing* the security boundary as if it
  violated it; fixed by filtering the grep by file extension so the guard's own stated reasoning
  actually matches its implementation.
- Assorted smaller chat-chrome and admin fixes: a landing-flash animation that never
  self-cancelled on a warm navigation, now guarded and blinking exactly three times; a Chromium
  bug that ran a duplicated `steps()` keyframe as a smooth fade instead of a hard cut; sidebar
  and search panels that fought the mobile keyboard for screen position; several
  admin-shortcuts rows that didn't fit on one phone-width line; and a merge-resolution mishap
  where a comment-section opener was lost mid-fix and shipped anyway, because the local gates
  that passed had run against the corrected working tree rather than the actual committed blob
  — caught by Vercel's build 18 seconds into the deploy.

### Known gaps

- **The image-generation "primary" path (Vercel Fluid) still keeps GitHub Actions as its
  backstop, and the backstop's own schedule drifts** — measured runs fired 1h46m to 4h19m apart
  against a declared `*/10` cron, a gap documented in the workflow's own comments rather than
  fixed, since the primary path made the backstop's punctuality no longer load-bearing.
- **Most Nina UI work in this release was verified structurally — types, unit tests, a `next
  build` — rather than by looking at a phone.** This repo's suite runs in a Node environment and
  renders no component, so a provider mounted one level too low in the tree (the sidebar door
  bug above) passed a fully green suite before a runner found it in production. A design change
  is provably correct by reasoning about the tree; it is not provably correct on a screen until
  someone taps it.
- **There is still exactly one database, and it is production.** Every migration, backfill
  script, and dedupe sweep's `--apply` in this release wrote to the same Neon instance the app
  serves from. Several of the fixes above were applied directly to production data as part of
  landing the fix, verified by a fresh dry run reading zero remaining findings rather than by a
  staging rehearsal.
- **The records deck's twill and centring notes still live in per-patch sidecars rather than in
  `style.md`**, carried forward unchanged from v0.1.0 — F25 §4 measured that the shared style
  block cannot safely absorb them, and `earliest_start`'s five-attempt art session added one
  more finding to the sidecar rather than to the block.
- **`npm test` still never touches a database and never calls an LLM.** The live-suite roster
  grew (`test:live:nina`, `test:live:nina-vision`, `test:live:nina-image` joined the existing
  vision/narrate suites), but the gate is unchanged: integration and live suites stay excluded
  unless `VITEST_INTEGRATION=1` / `LLM_LIVE_TEST=1` are set. A green `npm test` (3,948 tests, 183
  files) is a statement about typechecking, pure-function correctness and structural contracts —
  not about Postgres or about any model. Every dry-run, sweep and backfill number quoted above
  was measured against production directly, by hand, in the session that shipped it.

## [v0.1.0] - 2026-08-22

The first release. Screenshot an Apple Watch run, a vision model reads it, and you get
coaching-grade analysis of that run, that week, and that month. Feature-complete at **F11**;
sixteen more features landed on top of it, mostly the kind found only by using the thing on a
phone.

90 commits, 601 files, 1,199 unit tests. Live at **[runins.site](https://runins.site)**.

### Added

**Foundation and data (F01–F03)**

- Next.js 16 App Router skeleton on Vercel, with a Zod-validated server-only environment contract
  (`lib/env.ts`) that fails the build rather than a request, a Neon smoke test, a health route, and
  CI.
- Drizzle schema for all 14 tables against Neon Postgres, the migration applied, and every query
  ownership-scoped — with a CI guard on the two invariants so an unscoped query cannot land.
- `lib/id.ts` and `lib/date/ranges.ts`, both dependency-free.
- Auth.js v5 with Google sign-in, the profile, `/onboarding`, and one HRmax resolver rather than a
  formula scattered across call sites.

**Ingest and review — the project (F04–F05)**

- `/upload` takes one to three screenshots, labels each one by which screen it came from, compresses
  client-side, and stores to Vercel Blob. Which screen a number came from is what decides whether
  the model is allowed to have read it at all.
- One vision call to `glm-4.6v` on z.ai's OpenAI-shaped coding endpoint, behind a **token-floor
  guard**: the Anthropic-compatible endpoint accepts image blocks, returns HTTP 200, and silently
  drops the image, so a `prompt_tokens` count below the floor is treated as a dropped image rather
  than a confident answer.
- The review screen at `/r/[id]/review`. **Nothing is saved until you confirm.** Every field stays
  editable, the date is a stated guess when the screenshot carries no year, and corrections are
  persisted alongside the extraction rather than overwriting it.
- Four quantities that must agree by arithmetic, checked on screen, with the banner naming which
  block disagrees.
- The wall between a model's guess and a stored fact (F05): a provenance rule enforced in code, not
  convention.

**Numbers, views and prose (F06–F08)**

- Every metric computed in TypeScript — decoupling, zone share, cadence fade, fast start, splits —
  with recompute-on-change, plus a records shelf that can forget a record when the run behind it
  changes.
- The three screens (`/`, `/r/[id]`, `/trends`), the splits table, the zone bar, and the weekly and
  monthly graphs.
- One dual-axis pace + heart-rate chart, allowed to break the rules, that argues its case
  underneath. Up is faster, everywhere; `*` marks the partial final kilometre.
- Session, week and month insights from `glm-5.3`, with a tool schema that keeps its own contract,
  Zod validation with repair, `facts_hash` caching, and a cron refresh. The coach reads only
  numbers the app handed it.

**Badges, records and sharing (F09–F13, F25–F27)**

- 22 badges evaluated only against numbers a human signed off, and a shelf that prints locked ones
  with their progress instead of a silhouette.
- The badge-art skill (`.claude/skills/generate-badge/`) with its parsed style contract, all 22
  embroidered patches, and `tools/check_badge_art.py` — a checker that refuses to trust its own
  numbers. Art is generated offline and committed; nothing generates images at runtime.
- Ten personal-record patches on their own deck, with derivatives, a manifest and an observed twill
  band.
- An award ledger with one row per earn, so the primary key does the counting; a detail panel for
  every patch; and an earn count that expands to every date it was earned.
- Sharing: one link, no account needed, and a revoke that reaches the images too.

**Polish found on a phone (F14–F24)**

- Mobile keyboards that can actually type a colon, and a mask that can be emptied.
- The screenshot gallery: one overlay, a swipe that comes round, and a tile told its own width.
- The detail panel's open state as a history entry, so the back gesture closes the panel instead of
  leaving the page.
- Reduced-motion escape for the pulse animation.

**Repo and tooling**

- A README a visitor can actually see, and the Playwright harness that photographs it (F19) —
  including the hero GIF, timelapsed 8× over a real 33–38 s read.
- A reaper for Vercel Blob objects nothing points at, plus the skill that knows what "nothing"
  means.
- PWA install and a home-screen icon that is an icon rather than a letter, rebuildable from the
  committed silhouette without another paid image call.
- `research/`: the live feasibility harness and the 108-field fixture, with `score.mjs` running in
  CI.

### Changed

- The v2 design tokens are wired into the app, and R-41..R-46 reconcile that revamp with the
  shipped architecture.
- One z.ai credential now serves both LLM endpoints. `LLM_VISION_API_KEY` was deleted deliberately:
  a second variable holding a duplicate of the first is a credential-rotation bug waiting to happen
  (R-40). Do not reintroduce it.
- The pace/HR axis stops shouting over itself past 20 splits.
- Badge copy says each number once, and the panel says no date at all where a date would be a
  guess.
- Feature plans are numbered by claim rather than by `F<N+1>`, which is not race-safe when plans are
  written in parallel.
- npm is pinned to 12.0.1 in CI so `npm ci` survives the esbuild aix entry.

### Fixed

- The picker that uploaded everything twice, and a purity decision that moved out of the component
  and into `lib/`.
- The upload-kind toggle that disabled itself once all three screens were picked.
- Three splits columns that had no space between them.
- The review sheet that re-focused itself on every keystroke.
- The record panel's fourth line disappearing, and a period badge that did not say it was a period.
- The back-swipe that closed the whole list instead of the panel.
- A badge backfill that let a day become a `Date`, and a count threshold crossed mid-run that the
  award now names.
- Badge art: a twill check measuring the patch rather than the cloth (so it called the cloth pale),
  a check comparing a hexagon's bounding box against a shield's, an anchor demoted to a ruler, and
  an addendum deleted because it made the model ignore the scene.
- Cloth that runs to the edge, and two seams that had no colour.

### Known gaps

- **The twill note and the centring note** live in the records deck's sidecars rather than in
  `style.md`, because F25 §4 measured that the style block cannot be added to. Both need per-patch
  tuning today — three keys use a middle wording, because the strongest wording pushed
  `longest_distance` and `fastest_km_split` under check 3's brightness floor. A future v3 that
  regenerates both decks should absorb them into the block.
- The live vision suite is opt-in and costs money. It last scored **108/108 three runs running**,
  median 38 s — but every run still goes through a human on the review screen before anything is
  stored.
- `npm test` never touches a database and never calls an LLM. Integration and live suites are
  excluded unless `VITEST_INTEGRATION=1` / `LLM_LIVE_TEST=1` are set, so a green `npm test` is not a
  statement about Postgres or about the model.

[v1.0.0]: https://github.com/miftahulmahfuzh/run-insights/releases/tag/v1.0.0
[v0.1.0]: https://github.com/miftahulmahfuzh/run-insights/releases/tag/v0.1.0
