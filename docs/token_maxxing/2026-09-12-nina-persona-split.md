# Token-Maxxing Session — 2026-09-12: Nina Persona Monolith Split

## 🎯 Achievement / End Result
- **Goal of the burn:** Split `lib/nina/persona.ts` (1723 lines) into cohesive modules —
  relationship-level logic and prompt construction separated from each other — behind a barrel
  at the old path, with zero behavior change, so that structural gaps like today's missing
  relationship level can no longer hide inside a monolith.
- **Concrete changes:**
  - `lib/nina/persona.ts` is now a pure barrel: it defines nothing, it re-exports nine modules
    under `lib/nina/persona/`.
  - Nine new modules: `bands.ts` (94), `identity.ts` (269), `appearance.ts` (235), `voice.ts`
    (255), `instructor.ts` (139), `anger.ts` (240), `verbosity.ts` (64), `never-say.ts` (163),
    `tuning-blocks.ts` (320).
  - New contract test `tests/nina.persona-split.test.ts` (189 lines) pinning the split's shape.
  - `tests/nina.prompts.test.ts`: the R4 source-scan now discovers `lib/nina/persona/*.ts` via
    `readdirSync` instead of watching the barrel file alone.
  - `docs/nina/persona.md`, `lib/nina/.workflows/package_readme.md`, and
    `lib/nina/tuning.ts` re-pointed at the split layout.
  - All six persona import sites untouched — they still import `'../persona'` /
    `'@/lib/nina/persona'`.
- **Real value delivered:**
  - The rendered-prompt pins (four-render snapshot, `DEFAULT_RENDER === NINA_SYSTEM_PROMPT`
    identity) pass unchanged across the split — byte-for-byte code moves, zero behavior change,
    proven rather than asserted.
  - A future module added under `lib/nina/persona/` is picked up by the R4 source-scan the
    moment it exists; the naive split would have left that scan watching an empty barrel —
    the trap was caught and fixed in this session, not in a future incident.
  - The export surface is now guarded: exactly the old monolith's 36 runtime + 4 type exports,
    nothing dropped, nothing renamed, additions deliberate (opt-in via the contract test).
  - knip caught one real defect during the work: `identityBandOf` had been exported from
    `bands.ts` but is only used within it — de-exported to restore the monolith's visibility
    exactly.
- **Branch:** token-maxxing-2026-09-12-nina-persona-split
- **Merge status:** on branch (Worker Mode — spawned by coordinator tokenmax-orch-2026-09-12;
  landing owned by the coordinator)
- **Approx token burn:** ~500k 🔥 (estimate: full monolith read + nine-module write, contract
  test TDD loop, two full-suite verifications, doc re-pointing)

## Context & Motivation

This session ran in Worker Mode: the coordinator (tokenmax-orch-2026-09-12) pre-assigned the
idea, so there was no Step-4 idea menu. The assignment arrived with its rationale attached:

> Split lib/nina/persona.ts (1723 lines) into cohesive modules (relationship-level logic,
> prompt construction) behind a barrel at lib/nina/persona.ts. Why: today's persona audit
> found a missing relationship level in this file's prose canon, and a monolith this size is
> exactly why such gaps hide.

That motivation matters. An earlier session the same day
(`2026-09-12-docs-nina-persona-audit.md`) audited the persona canon and found the prose docs
had drifted from the code — a relationship level existed in behavior but not in the written
canon. The audit could only happen by hand-reading a 1723-line file. A file that size defeats
section-scanning: banners blur together, cross-references go stale invisibly, and an entire
concern can be under-documented without anyone noticing. The split makes each concern small
enough that its doc section and its code live in a 1:1 correspondence a reader can verify at
a glance.

The risk profile was unusual for a refactor: `persona.ts` is not ordinary code, it is prompt
canon. Its exports are string constants and template fragments assembled into Nina's system
prompt. A refactor that changes a single byte inside a template literal changes what the
model sees at runtime — silently, with no type error and no crash. So the acceptance bar was
"byte-for-byte moves, proven by rendered-output pins," not merely "tests pass."

## What We Did (blow-by-blow)

### Commit 1 — c10ab81 `refactor(nina): split persona.ts into cohesive modules behind a barrel`

**TDD order, honored literally.** The contract test `tests/nina.persona-split.test.ts` was
written *first* and watched to fail — for the right reasons: no `lib/nina/persona/` directory
existed yet, and the barrel (`persona.ts` itself) still defined its symbols, so the
barrel-purity pin failed on real declarations, not on an import error. Only then was the
split implemented.

**The split.** The monolith's own banner sections defined the grain. Each became a module,
moved byte-for-byte:

| Module | Lines | Owns |
|---|---|---|
| `bands.ts` | 94 | The R4 gate — how a tuning is read |
| `identity.ts` | 269 | Relationship blocks, `ninaIdentity`, `ninaNameRules`, `NINA_EXPERTISE`, `NINA_NOT_A_DOCTOR` |
| `appearance.ts` | 235 | Image canon |
| `voice.ts` | 255 | Jakarta register, manja orthography, verbatim example lines |
| `instructor.ts` | 139 | Coaching register |
| `anger.ts` | 240 | Computed anger ladder + floor/ceiling |
| `verbosity.ts` | 64 | Horny's verbosity floor |
| `never-say.ts` | 163 | Prohibition phrases + repeals |
| `tuning-blocks.ts` | 320 | Trait/dial band tables + operator notes |

The old `persona.ts` became a barrel that defines nothing — only re-exports. All six import
sites across the repo kept importing the same path (`'../persona'` or
`'@/lib/nina/persona'`) and were not touched.

**Only enumerated comment adjustments.** Code moved byte-for-byte; the only edits inside the
moved text were comment re-wordings where "this file" would now point at the wrong unit —
e.g. a comment saying "shaped exactly like isGirlfriend above" became "voice.ts's
isGirlfriend". Each such change was enumerated, not swept.

**The silent-failure trap: the R4 source-scan.** `tests/nina.prompts.test.ts` contains the R4
gate — it fails if prompt-side code reads `tuning.traits` / `tuning.dials` /
`tuning.relationship` directly instead of going through the band functions. Before this
session it watched `persona.ts` *as a file*. A naive split would have made the barrel empty
of definitions while the real prompt-side code moved to `lib/nina/persona/*.ts` — and the
scan would have gone on scanning an empty file, green forever, gating nothing. The scan now
`readdirSync`s `lib/nina/persona/` and scans every `.ts` it finds, so a module added later is
scanned the moment it exists. This single change is arguably the most load-bearing line of
the session: without it the split would have quietly disarmed a standing guard.

**The contract test pins four properties** (`tests/nina.persona-split.test.ts`):
1. The exact module set — no orphans; a file added under `lib/nina/persona/` must be
   registered deliberately.
2. Barrel purity — after stripping comments, no line in `persona.ts` may open a declaration.
3. The exact export surface of the old monolith: 36 runtime exports + 4 type exports, by
   name — nothing dropped, nothing renamed; additions require a deliberate edit to
   `EXPECTED_RUNTIME` / `EXPECTED_TYPES`.
4. Every persona import must be relative — the property that keeps the canon importable from
   a `'use client'` module (the admin personality preview imports it client-side).

### Commit 2 — e47054a `docs(nina): re-point the canon's file references at the split modules`

- `docs/nina/persona.md`: *live* references now name the owning module (`voice.ts`,
  `appearance.ts`, `instructor.ts`); *historical* mentions keep their history — the doc
  distinguishes "what the file is now" from "what it was when this note was written."
- `lib/nina/tuning.ts`: `NINA_DIAL_SPECS.profanity.path` — a string written deliberately as a
  grep target so humans can find the canonical phrase list — re-pointed from the old monolith
  to `lib/nina/persona/voice.ts`, where `JAKARTA_SLANG` lives. A stale pointer here would
  have been a doc-lie embedded in code.
- `lib/nina/.workflows/package_readme.md`: structure entry, client-import rule, module map,
  and the R4-scan gotcha all now describe the barrel layout.

## Code / Design Details

**Before:** one 1723-line file, six import sites, one R4 scan watching that file by name.

**After:**

```
lib/nina/persona.ts            # barrel — re-exports only, defines nothing
lib/nina/persona/
  bands.ts                     # the R4 gate: how a tuning is read
  identity.ts                  # relationship blocks, name rules, expertise, not-a-doctor
  appearance.ts                # image canon
  voice.ts                     # Jakarta register, manja orthography, verbatim examples
  instructor.ts                # coaching register
  anger.ts                     # computed ladder + floor/ceiling
  verbosity.ts                 # verbosity floor
  never-say.ts                 # prohibitions + repeals
  tuning-blocks.ts             # trait/dial band tables + operator notes
```

Net diff of commit 1: 12 files, +2065 / −1665 — the removal side is the old monolith body
leaving `persona.ts`, the additions are the same bytes distributed into nine modules plus the
189-line contract test.

**Why a barrel at the old path.** The six import sites — including a `'use client'` module
(admin personality preview) — keep importing `'../persona'`. Repointing them would have been
six Mechanical changes that churn lines other sessions may be editing, and would have lost
the single canonical import path. The barrel also gives the contract test one place to pin
the public surface.

**Why the export surface is a literal list in the test.** The pins compare the barrel's
actual exports against `EXPECTED_RUNTIME` (36 names) and `EXPECTED_TYPES` (4 names), captured
from the monolith before the split. This is the `NINA_SECTION_TITLES` precedent: make the
canonical list explicit in one place so drift is a test failure rather than an archaeology
project. The friction of "new export? edit the test" is deliberate.

**knip's catch.** During the move, `identityBandOf` was exported from `bands.ts` because the
monolith had exported it — but `knip` flagged it as module-internal-only. The monolith's
visibility was `export` (repo-visible); the honest equivalent in the split world is
module-private. De-exported. That restored the exact pre-split visibility, and it is the
difference between "the split happened to be clean" and "the split was *checked* to be
clean."

## Decisions & Trade-offs

- **TDD on a refactor.** Even for a pure move, the contract test came first and was watched
  to fail for the right reasons. This proved the test *can* fail — a green-only guard is
  unfalsifiable.
- **Nine modules, not two.** The assignment sketched "relationship-level logic, prompt
  construction" as the split axis, but the file's own banner sections were the natural grain
  — nine cohesive concerns, each 64–320 lines. Two mega-modules would have re-created the
  monolith at half scale.
- **Minimal comment churn.** Only enumerated "this file"-style adjustments were made. Loose
  `"persona.ts"` mentions in *other* files' comments (`nags.ts`, `patterns.ts`,
  `describe.ts`, `prompts/index.ts`) were deliberately left: they remain *true* via the
  barrel (the path still exists and still exports everything), and sweeping them would churn
  lines other sessions may be editing.
- **Scan the directory, not the file.** Widening the R4 scan from one path to `readdirSync`
  over the module dir trades a little specificity for future-proofing; the contract test's
  exact-module-set pin keeps the directory from becoming a dumping ground.
- **Docs in a second commit.** Code and its documentation re-pointing landed separately so a
  revert of the refactor does not half-revert the docs, and vice versa.

## Follow-ups & YAGNI notes

- **Do not merge modules back or fragment further** without a new cohesive concern. The
  nine-module grain matches the old file's banner sections; e.g. a seventh relationship level
  would extend `identity.ts` + `tuning.ts`, not create new files.
- **New exports must be added to `EXPECTED_RUNTIME` / `EXPECTED_TYPES`** in
  `tests/nina.persona-split.test.ts`. That friction is deliberate (the `NINA_SECTION_TITLES`
  precedent) — do not "fix" it by making the test derive expectations dynamically.
- **Loose `persona.ts` mentions** in other files' comments were left on purpose (see
  Decisions). If a future session is already editing those files, re-pointing them is a
  one-line courtesy, not a campaign.
- **Historical mentions in `docs/nina/persona.md`** intentionally keep saying the old thing;
  only live references were updated. Future readers should not "correct" the history.

## Appendix

**Commits (this branch):**
- `c10ab81` refactor(nina): split persona.ts into cohesive modules behind a barrel
  — 12 files, +2065/−1665 (persona.ts → barrel + 9 modules; new
  `tests/nina.persona-split.test.ts`; R4 scan widened in `tests/nina.prompts.test.ts`)
- `e47054a` docs(nina): re-point the canon's file references at the split modules
  — 3 files, +24/−19 (`docs/nina/persona.md`, `lib/nina/.workflows/package_readme.md`,
  `lib/nina/tuning.ts` profanity path)

**Verification (all green, at session time):**
- Baseline before any change: 214 tests across the three persona-touching files; `tsc` clean.
- After: full suite — 293 files / 5391 tests passed.
- `npm run typecheck` (next typegen + tsc): clean.
- eslint: clean on all touched files. prettier: clean.
- knip: zero persona findings (one real catch en route — `identityBandOf` de-exported).
- Rendered-prompt pins: four-render snapshot and `DEFAULT_RENDER === NINA_SYSTEM_PROMPT`
  identity pass unchanged — the zero-behavior-change proof.

**Branch state at doc time:** `token-maxxing-2026-09-12-nina-persona-split`, HEAD `e47054a`,
tree clean. Not merged, not pushed — landing belongs to the coordinator.

**Related sessions (same day):** `2026-09-12-docs-nina-persona-audit.md` (the audit whose
finding motivated this split) and `2026-09-12-nina-persona-comments.md` (the prior
persona/prompts YAGNI sweep this file survived).
