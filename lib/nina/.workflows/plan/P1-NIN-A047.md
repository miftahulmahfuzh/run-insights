> Adopted from `NINA_QUERIES_SPLIT_PLAN.md` phase 8. Source: `.workflows/plan/nina-queries-split/phase-8.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 8: Final sweep — §-ref audit, package readmes, barrel module map, full gates incl. build

**Plan set:** `NINA_QUERIES_SPLIT_PLAN.md`
**Analysis:** `20260912-201916_code_analyzer.md`
**Satisfies:** R2 (barrel surface proven unchanged at set level), R3 (header carries the layer invariants + the new module map), R6 (every §-pointer and line-pointer the split made false is repointed), R7 (verified: historical records untouched; by-name citations left alone; pre-existing rot not "fixed" by this refactor), R8 (package readmes restated over the new layout, rules not state, dated counts), R10 (the set's full gate run: whole-suite vitest, typegen+tsc, eslint, prettier, knip, real `next build`)
**Depends on:** Phase 7 (and through it 1–6)
**Difficulty:** NORMAL
**Package:** `lib/nina` (secondary: `lib`, `lib/admin`, `scripts`-adjacent live prose)

---

## Goal

After phases 1–7 the layer is `lib/nina/queries/*.ts` (12 domain modules + module-internal
`columns.ts`) behind a barrel that is a JSDoc header plus 12 `export *` lines and zero imports.
This phase makes the rest of the repo tell the truth about that: the barrel header gains a
module map (invariant prose byte-identical), every live §-pointer and stale line-pointer the
split made false is repointed to the owning module without rewording a single argument, the two
package readmes are restated over the new layout (one of them turns out to need no edit —
verified below), and the full gate set runs on the finished tree.

**Anchor rule for this whole plan:** phases 1–7 run before it and shift line numbers inside
`lib/nina/queries*.ts`. Every edit below is anchored on exact OLD TEXT (measured at
`2c823eb`, where `lib/nina/queries.ts` is 4573 lines). If an OLD TEXT is already gone when this
phase runs, the phase that owns it fixed it first — skip that edit and say so in the commit
body. Line numbers are given only as provenance ("old :NNNN @ 2c823eb").

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing — no symbol, no file, no config key.
**Renames:** none.
**Creates:** no new files and no new symbols. The only additions are prose: a module-map block
inside the existing barrel JSDoc, and readme sentences.
**Signature changes:** none. No runtime behavior changes anywhere in this phase — every edit is
a comment or a markdown line.

**Text-level edits (the complete list; details in Implementation Steps):**

| # | File (post-split path) | Old text (verbatim, @ 2c823eb unless noted) | New text |
|---|---|---|---|
| 1 | `lib/nina/queries.ts` (header) | `` * Every Nina read and write, in one module — `lib/db/queries.ts` for `lib/nina/`. `` | same with `in one layer` for `in one module` |
| 2 | `lib/nina/queries.ts` (header) | (insert before `## The two invariants it inherits`) | 19-line module map — full text in Step 1 |
| 3 | `lib/nina/queries/shapes.ts` | `` *      function, because every function selects `messageColumns` (§2) and that is where the alias `` | `(§2)` → `` (`queries/columns.ts`) `` |
| 4 | `lib/nina/queries/messages.ts` | `` * ── AND IT IS THE SECOND PLACE IN THIS FILE THAT VALIDATES AN FK BY HAND ──────────────────── `` | `IN THIS FILE` → `IN THE LAYER` (both 12 chars — dash run untouched) |
| 5 | `lib/nina/queries/messages.ts` | `` * `insertNinaMessageImages` was the first, for the same reason: the foreign key proves the session `` | `` `insertNinaMessageImages` (`queries/images.ts`) was the first, … `` (rest of line unchanged) |
| 6 | `lib/nina/queries/messages.ts` | OWNED BY PHASE 3 (its Rewrite B — `banner below` → `and the images module`). SKIP here: verify via Step 0 that the old text `` `§5 Images` banner below `` is gone; edit only if phase 3 skipped it | — |
| 7 | `lib/nina/queries/images.ts` | OWNED BY PHASE 4 (its rewrite (c) — `in §9` → `` in `lib/nina/queries/avatars.ts` ``). SKIP here: verify via Step 0; edit only if phase 4 skipped it | — |
| 8 | `lib/nina/queries/images.ts` | ``   * reason (:1025-1030): `notExists()` emits `not exists ` followed by its argument's chunks `` | `` (:1025-1030) `` → `` (`queries/sessions.ts`) `` |
| 9 | `lib/nina/queries/images.ts` | `` * the album count plus this one — the mistake `countNinaAvatars` (:2336) was written to undo, not `` | `` (:2336) `` → `` (`queries/avatars.ts`) `` |
| 10 | `lib/nina/queries/images.ts` | OWNED BY PHASE 4 (its rewrite (d) — `in §9` → `` in `lib/nina/queries/avatars.ts` ``). SKIP here: verify via Step 0; edit only if phase 4 skipped it | — |
| 11 | `lib/nina/queries/imageprefs.ts` | `` * mistake `countNinaAvatars` exists to undo, and `listNinaAvatars` (:2314) is that unbounded read — `` | `` (:2314) `` → `` (`queries/avatars.ts`) `` |
| 12 | `lib/nina/queries/imageprefs.ts` | `` * literally `countNinaChatPhotos` (:1713) rather than a second copy of its predicate. `` | `` (:1713) `` → `` (`queries/images.ts`) `` |
| 13 | `lib/nina/queries/imageprefs.ts` | `` * exactly this shape. The chat side is `generatedChatPhotoScope` (:1649), i.e. `kind = 'generated'` `` | `` (:1649) `` → `` (`queries/images.ts`) `` |
| 14 | `lib/nina/queries/imageprefs.ts` | `` * (`lib/nina/queries.ts:1649-1655`) is `and(eq(userId), eq(kind, 'generated'), isOriginalPhoto())`, `` | `` (`lib/nina/queries.ts:1649-1655`) `` → `` (`queries/images.ts`) `` |
| 15 | `lib/nina/queries/imageprefs.ts` | `` * and `isOriginalPhoto()` (`:1616-1618`) is `` | `` (`:1616-1618`) `` → `` (`queries/images.ts`) `` |
| 16 | `lib/nina/queries/imageprefs.ts` | `` * `and(isNull(sourceAvatarId), isNull(sourceImageId))`. `countNinaChatPhotos` (:1713) shares that `` | `` (:1713) `` → `` (`queries/images.ts`) `` |
| 17 | `lib/nina/queries/imageprefs.ts` | `` * function's own docstring makes at `:1642-1647`. `` | `` at `:1642-1647` `` → `` in `queries/images.ts` `` |
| 18 | `lib/nina/searchActions.ts:40` | `` * phase 1 owns `lib/nina/queries.ts` §4; this set's whole concurrency discipline is that two phases `` | `` * phase 1 owns the conversation query modules (`lib/nina/queries/sessions.ts`, `messages.ts`); this set's whole concurrency discipline is that two phases `` (one long comment line — every word kept) |
| 19 | `lib/admin/folderOps.ts:320` | `` * (`lib/nina/queries.ts:1116-1128`): *"`eq(ninaAvatars.isCurrent, false)` in the WHERE clause is `` | `` (`lib/nina/queries.ts:1116-1128`) `` → `` (`lib/nina/queries/avatars.ts`) `` |
| 20 | `lib/admin/ninaAlbumActions.ts:635` | `` * Because it un-currents and re-currents on EVERY insert (`lib/nina/queries.ts:955`), and it has `` | `` (`lib/nina/queries.ts:955`) `` → `` (`lib/nina/queries/avatars.ts`) `` |
| 21 | `lib/nina/imageprefs.ts:456` | `` * `countNinaAvatars` exists to undo, and `listNinaAvatars` (`lib/nina/queries.ts:2314`) is the `` | `` (`lib/nina/queries.ts:2314`) `` → `` (`lib/nina/queries/avatars.ts`) `` |
| 22–29 | `lib/nina/.workflows/package_readme.md` | eight text edits at (pre-edit) lines 49, 72, 449, 554, 590, 692, 593–594/747–748, Tests section | full texts in Step 4 |

**Requires (from earlier phases — all assumed landed):**
- The final barrel: `lib/nina/queries.ts` = header JSDoc + 12 `export *` lines (shapes,
  sessions, messages, images, memory, shortcuts, nags, turns, avatars, tuning, imageprefs,
  jobphotos), zero import statements; `queries/columns.ts` exists, module-internal, NOT
  re-exported (Phase 1, confirmed by Phase 7's final state).
- `lib/nina/queries.test.ts` exists and freezes the runtime value-export name set — 83 names at
  Phase 1, grown to exactly 85 by Phase 4 (`isOriginalPhoto`, `generatedChatPhotoScope`); the
  four column lists are absent from it.
- Phase 1 left two prose §-refs inside `shapes.ts` byte-identical for this phase: the §1 banner
  title and ruling A1's "`messageColumns` (§2)" (old queries.ts:140; phase 1 places it in the
  `shapes.ts:38` area).
- Phase 3 moved the "SECOND PLACE IN THIS FILE" banner (old :1311–1312) into `messages.ts`
  byte-identical (rows 4–5 fix it here), and rewrote the §4c intro's "`§5 Images` banner
  below" (old :1433) itself — its Rewrite B made it "and the images module" — so row 6 is a
  verify-only row for this phase.
- Phase 4 moved §5/§5a-2/§5b into `images.ts`, rewriting the two §9 §-pointers itself under
  R6 (old :1763, :2413 — its rewrites (c)/(d), which cite `lib/nina/queries/avatars.ts`) and
  leaving the two stale line-pointers byte-identical for this phase (old :2069, :2092 —
  rows 8–9 below).
- Phase 7 moved §10b byte-identical into `imageprefs.ts` carrying the six stale pointers
  (7 instances), and repointed `tests/db.schema.nina.test.ts:525,705`'s `readFileSync` paths to
  the new modules (its plan owns those two test-file edits).
- Phase 4 repointed `scripts/nina-dedupe-media.mjs:60` and `scripts/nina-dedupe-plan.mjs:71,93`;
  phases 2–6 rewrote the §-refs in their own spans (R6). This phase sweeps residue and enforces
  the final grep gates either way.

**Leaves alone (owned by others / verified true):**
- `tests/admin.memory.test.ts` — the non-recursive walk is DOCUMENTED in the readme (Step 4),
  not changed; making it recursive is a handoff (below).
- `lib/.workflows/package_readme.md` — VERIFIED NO-OP: it is the combined readme for
  `lib/date`, `lib/flags`, `lib/derived` (its H1 says so), not a lib-wide doc. Its only two nina
  mentions (:105 importer-count breakdown, :108 `lib/nina/context.ts`) stay true post-split —
  the split adds and removes zero imports. Evidence: `grep -n 'nina' lib/.workflows/package_readme.md`.
- All by-NAME citations of `lib/nina/queries.ts` (complete verified list in Step 3's keep-table).
- Every historical record: nothing under any `*/.workflows/plan/**` except this set's own
  `nina-queries-split/*.md`, and nothing under `docs/plans/archive/**` (gate in Step 5).
- The invariant prose of the barrel header (everything between `## The two invariants it
  inherits` and the end of the JSDoc) — byte-identical; only the two edits of rows 1–2 above
  touch the header at all.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries.ts` | modify | header only: opening line `module`→`layer`, + 19-line module map block; the 12 `export *` lines and all invariant prose untouched |
| `lib/nina/queries/shapes.ts` | modify | one comment edit: A1's `(§2)` → `(`queries/columns.ts`)` |
| `lib/nina/queries/messages.ts` | modify | two comment edits (rows 4–5): FK banner `IN THIS FILE`→`IN THE LAYER`, first-place citation gains `(`queries/images.ts`)` — row 6 landed in phase 3 (Rewrite B) |
| `lib/nina/queries/images.ts` | modify | two comment edits (rows 8–9): `(:1025-1030)` → `(`queries/sessions.ts`)`; `(:2336)` → `(`queries/avatars.ts`)` — rows 7/10 landed in phase 4 (rewrites (c)/(d)) |
| `lib/nina/queries/imageprefs.ts` | modify | seven comment edits: the six stale pointers (7 instances) → owning-module citations |
| `lib/nina/searchActions.ts` | modify | one comment edit: `§4` pointer → the two conversation query modules |
| `lib/admin/folderOps.ts` | modify | one comment edit: dead line-pointer → `lib/nina/queries/avatars.ts` |
| `lib/admin/ninaAlbumActions.ts` | modify | one comment edit: dead line-pointer → `lib/nina/queries/avatars.ts` |
| `lib/nina/imageprefs.ts` | modify | one comment edit: dead line-pointer → `lib/nina/queries/avatars.ts` (model layer — not a queries/ module) |
| `lib/nina/.workflows/package_readme.md` | modify | Persistence rule restated over queries/ + barrel (4 sites), module-map row, planNinaImageWrite rule, test counts re-measured + barrel test named, admin.memory.test.ts walk note |
| `lib/.workflows/package_readme.md` | none | verified no-op (see Interface Contract) — grep evidence recorded in the commit body |

Ten files edited, one verified no-op. (The plan index's "Files: 4" for this phase undercounts —
reconciler note.)

---

## Implementation Steps

Run everything from the worktree root:
`/home/miftah/.worktrees/run-insights/tokenmax-2026-09-12-nina-queries-split`.

### Step 0: Preflight — confirm phases 1–7 landed as assumed

**File:** none (read-only checks)
**Change:** run and eyeball:

```bash
git log --oneline -8
grep -c "export \* from './queries/" lib/nina/queries.ts   # expect 12
grep -n "^import" lib/nina/queries.ts                       # expect no output
ls lib/nina/queries/                                        # expect 13 .ts files
grep -n "messageColumns\` (§2)" lib/nina/queries/shapes.ts  # expect 1 hit (edit 3's anchor)
grep -rn "SECOND PLACE IN THIS FILE" lib/nina/queries/      # expect 1 hit (edit 4's anchor)
grep -rn "queries.ts:1649-1655" lib/nina/queries/           # expect 1 hit (edit 14's anchor)
grep -rn "in §9" lib/nina/queries/images.ts                 # expect no hits (phase 4's rewrites (c)/(d) landed — rows 7/10 skip)
grep -rn "banner below" lib/nina/queries/messages.ts        # expect no hits (phase 3's Rewrite B landed — row 6 skips)
npx vitest run lib/nina/queries.test.ts                     # expect green, 85 frozen names
```

If any anchor grep comes back empty, the owning phase already fixed it — drop that edit, keep
the rest. If the barrel shape differs from 12 `export *` lines / zero imports, STOP: the
assumptions of this plan are false and the phase must not run until the reconciler resolves it.

**Impact:** none — this step only refuses to run on a tree this plan does not describe.

### Step 1: Barrel header — module map

**File:** `lib/nina/queries.ts` (header JSDoc; post-split it sits at the top of the file with
no imports above it)
**Change:** two edits, anchored on text.

Edit 1 — the opening line (the one word that the split made false; not invariant prose):

```
 * Every Nina read and write, in one module — `lib/db/queries.ts` for `lib/nina/`.
```

becomes

```
 * Every Nina read and write, in one layer — `lib/db/queries.ts` for `lib/nina/`.
```

Edit 2 — insert the map between the (blank ` *`) line after the opening line and the
`## The two invariants it inherits` heading:

```
 * ## Where each domain lives (the 2026-09-12 split into `lib/nina/queries/`)
 *
 * The layer is `lib/nina/queries/*.ts`, one module per domain; THIS file is the public barrel —
 * one `export * from './queries/<module>'` line per module below, zero imports, no SQL of its
 * own. `queries/columns.ts` (the four shared column lists) is module-internal and deliberately
 * NOT re-exported. The § numbers below are the pre-split section banners, which persist inside
 * each module: a `§4b` title inside `messages.ts` is by design, not staleness.
 *
 *   queries/shapes.ts      §1               the DTO types — ruling A1 lives here
 *   queries/sessions.ts    §3 + §4a         identity and the sessions
 *   queries/messages.ts    §4b + §4c        the messages and their mutation
 *   queries/images.ts      §5, §5a-2, §5b   images, the media view, the admin photo writes
 *   queries/memory.ts      §6               memory slots and the facts ledger
 *   queries/shortcuts.ts   §6b              the trigger → expansion registry
 *   queries/nags.ts        §7               the escalation ledger
 *   queries/turns.ts       §8               the turn audit trail
 *   queries/avatars.ts     §9 + §9b         her album and its file-manager reads
 *   queries/tuning.ts      §10              character tuning
 *   queries/imageprefs.ts  §10b             image-gen prefs + photo references
 *   queries/jobphotos.ts   §11 + §12        the job → photograph link
```

This satisfies phase 3's request ("the module map should record that §4b/§4c banner titles
persist inside messages.ts by design") and phase 7's ("the header stays byte-identical until
then (R3)"). Everything from `## The two invariants it inherits` to the end of the JSDoc stays
byte-identical — verify with `git diff` showing no removed line below the inserted block.

**Impact:** comment-only; no runtime effect. The barrel test does not read the header.

### Step 2: Moved-prose sweep — the pointers that travel inside queries/*.ts

**Files:** `lib/nina/queries/shapes.ts`, `lib/nina/queries/messages.ts`,
`lib/nina/queries/images.ts`, `lib/nina/queries/imageprefs.ts`
**Change:** apply Interface-Contract rows 3–5 and 8–17 exactly (rows 6, 7 and 10 are phase
3's / phase 4's own R6 rewrites — Step 0 verifies they landed; this phase edits them only if
the preflight finds the old text still present). Every replacement cites the OWNING
MODULE only — no line numbers — because line numbers inside the new modules are state that the
next edit rots (the same decision the plan index took for the scripts in phase 4). Three of
these deserve their reasoning written down:

- Row 3 (A1's `(§2)`): the ONE live §-pointer shapes.ts carries. `messageColumns` now lives in
  `queries/columns.ts`, which is deliberately not barrel-reachable, so a reader following "§2"
  from shapes.ts finds only a provenance banner. Repoint to the real home. The §1 banner title
  itself is NOT an edit: module banners keep their § numbers by design (invariant 5), the map
  from Step 1 explains the numbering, and phase 1's provenance header already names the origin —
  that is this phase's R6/R7 ruling on the two refs phase 1 handed over.
- Row 4 + 5 ("SECOND PLACE IN THIS FILE"): post-split the first FK-by-hand validation
  (`insertNinaMessageImages`) is in `queries/images.ts`, and within `messages.ts` itself this is
  the only such place — "THIS FILE" is false on both counts. `IN THIS FILE` → `IN THE LAYER` is
  a same-length substitution (12 chars → 12 chars) so the banner's dash run stays untouched, and
  the body line names where the first place actually lives. The argument (an unowned session id
  must return `[]`, not file a message into a stranger's conversation) is untouched.
- Rows 8, 9, 11–16: these pointers were stale ON ARRIVAL — they cite `queries.ts` line ranges
  that the media-dedupe commits of 2026-09-10 shifted (e.g. `isOriginalPhoto` sits at old
  :1993, not `:1616-1618`; `countNinaChatPhotos` at old :2099, not `:1713`; `listNinaAvatars` at
  old :3006, not `:2314`; `countNinaAvatars` in §9b, not `:2336`). The module-level repoint
  fixes the split-breakage AND the pre-existing staleness in one swap, which is why
  module-level (not recomputed-line) citations are the right shape.

The KEEP-within-moved-prose list (verified, do NOT edit): `images.ts`'s bare `:167-172`,
`:332`, `:301`, `:166-174`, `:185-192` are CONTINUATION citations — each continues an explicit
full-path citation in the same sentence (`lib/nina/actions.ts:512-531` / `…:143-192`,
`lib/admin/ninaAlbumActions.ts:278`) and still resolves. `images.ts`'s `:2204` "rather than in
§5: §5 is what the…" is intra-module (the §5 banner lives in the same file). `messages.ts`'s
`:1158` "see §4b's header" is intra-module. `jobphotos.ts`'s `:4408` "(§11)" is intra-module
(phase 7's explicit ruling). `messages.ts`'s old-:2303 "whose `ON DELETE CASCADE` takes the
image rows with it" is PRE-EXISTING prose rot (the delete is explicit — `lib/db/schema.ts`
:1085-1088 says so) that the split does not make false; R7's "only live prose that would become
false is fixed" leaves it byte-identical here — handoff below.

**Impact:** comment-only. No test reads these comments (verified: the source-reading tests read
`lib/nina/queries.ts` paths only for `tuningToColumns`/`imagePrefs*` mappings, which phase 7
repointed).

### Step 3: Live-code sweep — the pointers in files that never moved

**Files:** `lib/nina/searchActions.ts`, `lib/admin/folderOps.ts`,
`lib/admin/ninaAlbumActions.ts`, `lib/nina/imageprefs.ts`
**Change:** apply Interface-Contract rows 18–21 exactly. Notes:

- Row 18: the only live §-pointer into `queries.ts` outside the layer. `§4` covered the group
  banner + §4a + §4b + §4c, i.e. exactly today's `queries/sessions.ts` + `queries/messages.ts`.
  The replacement keeps every word of the concurrency-discipline argument; only the citation
  changes. The banner title two lines up ("WHY THE QUERY IS HERE AND NOT IN
  `lib/nina/queries.ts`") stays — by-name, still true.
- Row 19: doubly stale on arrival — `:1116-1128` is §4a (`removeNinaSession`'s batch), while the
  quoted "isCurrent" prose lives in `deleteNinaAvatar`'s docstring (old :3221 area, §9). The
  module-level citation fixes both.
- Row 20: same shape — `:955` is §4a; `insertNinaAvatarAsCurrent` lives in §9 (old :3048).
- Row 21: the model-layer twin of row 11 — same symbol, same fix, in
  `lib/nina/imageprefs.ts` (which no phase moves).

**Verified KEEP table — by-name citations that stay true because of the barrel (complete
inventory at `2c823eb`; none edited):**

| Sites | Why true post-split |
|---|---|
| `lib/db/schema.ts` :34 (db/queries), :527, :910, :948, :1087, :1127, :1359, :1463, :1471, :2197, :2210, :2481, :2499, :2507 | by name; every named symbol is still exported by the barrel |
| `lib/nina/errorlogs.ts` :10, :15 | by name; "adding the first unscoped read to `queries.ts` would blunt the one rule" — still the argument against editing the barrel |
| `lib/nina/chatturn.ts` :444–445 | by name + historical concurrency note ("phase 6's file this cycle"); the read still does not live in the barrel |
| `lib/admin/memoryStore.ts` :24, :45 | by name; :45's "edited by another phase of this plan set" is that past set's history |
| `lib/admin/schema.ts` :131 | by name + historical ("the reason phase 15 gave") |
| `lib/admin/shortcutStore.ts` :24; `lib/admin/chatPhotoActions.ts` :43, :682; `lib/admin/chatPhotos.ts` :311; `lib/admin/filetree.ts` :1076 | by name; `isOriginalPhoto()` at chatPhotoActions:682 is still barrel-reachable (phase 4 grew the frozen list by it) |
| `app/nina/about/page.tsx` :44, :48; `components/nina/types.ts` :3 | by name |
| `lib/nina/imagerun.ts` :71, :333, :469; `lib/nina/shortcuts.ts` :30, :97, :139 | by name |
| `lib/push/queries.ts` :18, :21 | db/queries banner + historical "phase 1 put Nina's reads in" |
| `lib/nina/imageprefs.ts` :419, :521 | by name |
| `scripts/nina-image-worker.ts` :43, :366, :844; `scripts/nina-memory-reap.mjs` :12, :32 | by-name prose |
| `lib/nina/unread.test.ts` :6; `lib/nina/shortcuts.test.ts` :64 | prose mentions |
| `components/nina/NinaUnreadBadge.test.tsx` :13 | `vi.mock` of the barrel path — untouched by contract (R2) |
| `app/admin/nina/page.tsx` :268, `app/(public)/s/[token]/page.tsx`, charts, onboarding, trends §-refs | roadmap/design-doc section refs, not queries.ts pointers |

And the NEGATIVE sweep that proves the inventory complete: every other `queries.ts` token in
live code is `lib/db/queries.ts` (the runs layer) or `lib/push/queries.ts` — e.g.
`app/actions/share.ts:36`, `lib/runs/actions.ts:43`, `lib/share/project.ts:10,69`,
`lib/db/index.ts:12`, `tests/integration/pushQueries.int.test.ts:27`,
`tests/db.client.test.ts:65` — none of them nina.

**Impact:** comment-only in all four files.

### Step 4: Package readmes

**File:** `lib/nina/.workflows/package_readme.md`
**Change:** eight edits. Write RULES NOT STATE; every volatile count carries a fresh date
stamp. The required wording (coordinator-encoded): the `queries/` directory is the layer,
`queries.ts` the public barrel, the four column lists in `queries/columns.ts` stay
module-internal.

Edit 4.1 — Persistence bullet in Overview (line 49–50 area). Old:

```
- **Persistence** — `queries.ts` is the single home for every `nina_*` table access — except the
  failure log, whose write and read sides live in `errorlogs.ts`, because that file's stated
```

New:

```
- **Persistence** — the `queries/` directory is the single home for every `nina_*` table access
  — 12 domain modules + a module-internal `columns.ts` behind the `queries.ts` barrel (one
  `export *` per module, zero imports; 12 + columns + barrel, measured 2026-09-12) — except the
  failure log, whose write and read sides live in `errorlogs.ts`, because that file's stated
```

(lines 3–4 of the bullet unchanged)

Edit 4.2 — standing rule 3 (line 72). Old: `` `tuningToColumns` (`queries.ts`) keeps `` →
New: `` `tuningToColumns` (`queries/tuning.ts`) keeps ``

Edit 4.3 — Images section (line 449). Old: `` `generatedChatPhotoScope` (`queries.ts`) is the
one definition of "her `` → New: `` `generatedChatPhotoScope` (`queries/images.ts`) is the one
definition of "her ``

Edit 4.4 — Memory section (line 554). Old: `` `removeNinaSession` (`queries.ts`) purges the ``
→ New: `` `removeNinaSession` (`queries/sessions.ts`) purges the ``

Edit 4.5 — Module map row (line 590). Old row starts:

```
| Persistence | `queries.ts` (every `nina_*` access; `tuningFromRow`/`tuningToColumns` are the one place the flat row and the nested model meet), `errorlogs.ts` (
```

New row starts (tail of the `errorlogs.ts` cell unchanged):

```
| Persistence | `queries/` — 12 domain modules + module-internal `columns.ts` behind the `queries.ts` barrel (`export *` per module, zero imports; every `nina_*` access; `tuningFromRow`/`tuningToColumns` in `queries/tuning.ts` are the one place the flat row and the nested model meet), `errorlogs.ts` (
```

Edit 4.6 — Gotchas rule (line 692). Old:

```
- **Do not merge the three dedup decision modules**, and never grow `planNinaImageWrite` into
  `queries.ts` — the worker would lose its one shared decision.
```

New:

```
- **Do not merge the three dedup decision modules**, and never grow `planNinaImageWrite` into
  the query layer (`lib/nina/queries/`) — the worker would lose its one shared decision.
```

Edit 4.7 — the two test-count sites (lines 593–594 and 747–748). MEASURE, don't guess:

```bash
ls lib/nina/*.test.ts | wc -l                # colocated suites at the lib/nina level
ls lib/nina/queries/*.test.ts 2>/dev/null | wc -l
ls tests/nina.*.test.ts | wc -l
```

Expected: the pure-module `(T)` count is unchanged at 28 (no pure module gains a colocated
test), `tests/nina.*` stays 51, and there is one new lib/nina-level file the old sentence had no
place for: `lib/nina/queries.test.ts` (phase 1's barrel contract test). Rewrite both sites to
name it and re-stamp the date, e.g. line 747–748 becomes:

```
28 colocated suites over the pure modules; 51 repo-level `tests/nina.*.test.ts` (re-counted
2026-09-12 after the queries split — unchanged; plus the barrel contract test
`lib/nina/queries.test.ts`, which freezes the barrel's 85 runtime value exports and is not a
(T): the barrel is not a pure module). The guards that can actually catch a regression, by
mechanism:
```

and the footnote at 593–594 gets the same re-count + the `queries.test.ts` exclusion. If the
measured numbers differ from 28/51, write the measured numbers — the date stamp is the point.

Edit 4.8 — Tests section: the coverage note phase 2 handed over (the walk that the split
silently narrowed). Add after the source-reading-tests bullet list's intro paragraph:

```
`tests/admin.memory.test.ts` asserts admin-memory isolation with a ONE-LEVEL
`readdirSync('lib/nina')` walk: since 2026-09-12's queries split, `lib/nina/queries/` is a
subdirectory outside its scan, so the guarantee over `lib/nina` files is enumerated, not
recursive — a new module under `queries/` does not automatically join the walk.
```

**File:** `lib/.workflows/package_readme.md`
**Change:** NONE — verified no-op (Interface Contract). Record the grep evidence in the commit
body so the next reader does not re-litigate R8's second file.

**Impact:** markdown-only.

### Step 5: Historical-records gate

**File:** none (read-only)
**Change:**

```bash
git status --porcelain
git diff HEAD --name-only -- '*/.workflows/plan/*' 'docs/plans/archive/*'
```

Exit criteria: the only names under those globs anywhere in status/diff are this set's own
`nina-queries-split/*.md` (orchestration surface, not historical corpus). No file under
`lib/*/.workflows/plan/` other than `lib/nina`'s own set directory, nothing under
`docs/plans/archive/`. If anything else appears, STOP and restore it
(`git checkout -- <path>`) before committing — invariant 7.

**Impact:** none — this is the R7 proof.

### Step 6: The two audit greps (R6's proof)

**File:** none (read-only)
**Change:**

Gate A — no dead line-pointer survives anywhere in the layer or its live citers:

```bash
grep -rnE 'nina/queries\.ts:[0-9]+' app components lib scripts --include='*.ts' --include='*.tsx' --include='*.mjs' | grep -v '.workflows'
```

Expected: EMPTY. (`lib/db/queries.ts:NNN` and `lib/push/queries.ts` cites do not match this
pattern because of the `nina/` prefix in the pattern.)

Gate B — the §-audit inside the layer. Every remaining `§` in `lib/nina/queries/*.ts` must be
one of: (a) a section banner title (all 13 modules keep their §-numbered banners by design),
(b) a provenance header line, (c) one of the intra-module refs: `messages.ts`'s "§4b's header"
(old :1158), `images.ts`'s two "§5" self-refs (old :2204), `jobphotos.ts`'s "(§11)" (old
:4408). Run:

```bash
grep -n '§' lib/nina/queries/*.ts
```

and check every hit against that allowlist. Any hit outside it is a missed repoint — fix it by
the Step 2/3 rules (owner-module citation, argument untouched) and re-run. This gate is what
catches anything phases 2–6 left behind in spans whose plans this phase could not read.

**Impact:** none — this is the R6 proof.

### Step 7: Full gates

**File:** none
**Change:** in order, from the worktree root:

```bash
npx prettier --check lib/nina/queries.ts lib/nina/queries/shapes.ts lib/nina/queries/messages.ts lib/nina/queries/images.ts lib/nina/queries/imageprefs.ts lib/nina/searchActions.ts lib/admin/folderOps.ts lib/admin/ninaAlbumActions.ts lib/nina/imageprefs.ts lib/nina/.workflows/package_readme.md
npm run lint
npm run typecheck          # next typegen && tsc --noEmit — the barrel surface check against all 14 importers
npx vitest run             # the WHOLE suite — includes lib/nina/queries.test.ts (85 names), tests/db.schema.nina.test.ts, components/nina/*
npm run knip               # observe; see below
npm run build              # real node_modules install landed in phase 1 — Turbopack, the set's final proof
```

Expected results:

- prettier: clean (comment/markdown edits are prettier-inert, but run it — the repo's format
  gate is repo-wide and this phase must not leave the tree format-dirty).
- lint: 0 errors, 0 warnings.
- typecheck: green — proves R2's type half (every type the importers pull from the barrel still
  resolves) without touching an importer.
- vitest: every suite green. `lib/nina/queries.test.ts` proves the runtime surface (85 names);
  `tests/db.schema.nina.test.ts` proves the mapping-fidelity guards against the NEW module
  paths (phase 7's edits). If a source-reading test still reads a moved code path, STOP — that
  fix belongs to the phase that moved the code; record it as a handoff, do not patch it here.
- knip: the known open question is the two phase-4 module exports (`isOriginalPhoto`,
  `generatedChatPhotoScope`) which surface through the barrel's `export *` while their only
  importers are sibling modules (`./images`), not external barrel consumers. If knip flags
  either: record the finding VERBATIM in the commit body. Do NOT suppress, annotate, or
  reconfigure — the plan index's Decision 3 accepted and documented this surface, and a knip
  annotation at the symbol is a decision for a follow-up, not this sweep.
- build: green. This is the set-level R10 gate; phase 1 retired the Turbopack/symlink risk, this
  run proves the finished tree ships.

**Impact:** none — measurement only.

### Step 8: Commit

**File:** none
**Change:** one commit, all ten files, pathspec-limited (shared-worktree rule: add by name,
commit by explicit pathspec, read the `--stat`):

```bash
git add lib/nina/queries.ts lib/nina/queries/shapes.ts lib/nina/queries/messages.ts \
  lib/nina/queries/images.ts lib/nina/queries/imageprefs.ts lib/nina/searchActions.ts \
  lib/admin/folderOps.ts lib/admin/ninaAlbumActions.ts lib/nina/imageprefs.ts \
  lib/nina/.workflows/package_readme.md
git commit -m "refactor(nina): queries split phase 8 — final sweep" \
  -m "<body: skipped-anchor notes from Step 0, knip finding if any, lib/.workflows no-op evidence>" \
  -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

(If phases 1–7 committed with a different prefix, match theirs.) Verify with
`git show --stat HEAD` that exactly ten files changed and none of them is under
`.workflows/plan/` or `docs/plans/archive/`.

**Impact:** the phase is exactly one commit — the rollback unit.

---

## Verification

**Build:** `npm run build` (Turbopack, real `node_modules` from phase 1)
**Tests:** `npx vitest run` — whole suite, zero red
**Type/lint/format:** `npm run typecheck` (includes `next typegen`), `npm run lint`,
`npx prettier --check <touched files>` — all clean
**Knip:** `npm run knip` — run, observed, findings recorded not suppressed
**Manual checks:** Step 5's historical-records gate; Step 6's two audit greps; the barrel
header diff shows the invariant prose byte-identical (`git diff lib/nina/queries.ts` — no
removed line between `## The two invariants it inherits` and the JSDoc's end)
**Exit criteria:** every gate green on the finished tree; `lib/nina/queries.ts` is a truthful
barrel (header + map + 12 re-export lines, no SQL); no live §-pointer or `nina/queries.ts:NNN`
line-pointer remains anywhere in `app/ components/ lib/ scripts/`; both package readmes state
the layer rule with date-stamped counts; nothing historical changed.

## Handoffs

- **`tests/admin.memory.test.ts` recursive walk (recommended follow-up, NOT this phase):** the
  readme now documents the one-level walk's blind spot (Step 4.8). A two-line change to walk
  `lib/nina/queries/` recursively would restore the guarantee the split narrowed; it is a test
  behavior change, out of this phase's "no source semantics" boundary, and belongs to its own
  diff.
- **`ON DELETE CASCADE` prose rot (pre-existing, travels byte-identical in `images.ts`):** old
  queries.ts:2303 claims `deleteNinaMessage`'s image cleanup works by `ON DELETE CASCADE`; the
  delete is explicit (`db.batch` statement 1) and `lib/db/schema.ts:1085-1088` says so in
  words. The split does not make this false — R7 forbids fixing it here. A one-line prose fix
  is a legitimate tiny follow-up commit for whoever owns the images module next.
- **Knip annotation for the two internal-shared exports:** if Step 7's knip run flags
  `isOriginalPhoto`/`generatedChatPhotoScope`, the `@knip`-style annotation at the symbol (per
  the repo's dead-export convention: annotate at the symbol, never suppress globally) is a
  follow-up decision, recorded verbatim in this phase's commit body.
- **Source-reading test paths (owned by the moving phases, listed for the reconciler):**
  `tests/db.schema.nina.test.ts:525,705` must read `queries/tuning.ts` / `queries/imageprefs.ts`
  — phase 7's plan already owns both edits; this phase's full-suite gate is the net, not the
  owner.

## Rollback

`git revert <phase-commit>` — the phase is exactly one commit of comment/markdown edits, so the
revert restores every pointer and both readmes exactly. Nothing else in the tree depends on
this phase's text: if the phase never committed, `git checkout -- <the ten files>` restores
the pre-sweep state; historical records were never touched (Step 5 proves it before the commit
exists).
