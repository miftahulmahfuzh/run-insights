# Token-Maxxing Session — 2026-09-11: Components Dead-Code Sweep

> **A coordinator-assigned worker session under `tokenmax-orch-2026-09-11`** —
> by the index's count, the twelfth token-maxxing doc on this date. The idea
> was pre-assigned rather than self-picked: a dead-code / unused-export sweep
> across `app/` and six component directories. The repo's earlier surveys had
> established there are no orphaned **files** anywhere, but no session had
> ever asked the symbol-level question — which of the thousands of `export`
> keywords has **zero callers**. An empty result was declared valid up front;
> the sweep was required to be able to find nothing.

## 🎯 Achievement / End Result
- **Goal of the burn:** Sweep `app/`, `components/ui/`, `components/charts/`,
  `components/review/`, `components/profile/`, `components/share/`, and
  `components/trends/` for exported symbols with genuinely zero callers —
  grepping the whole repo for every exported symbol, not counting the
  defining file's own tests — and remove exactly those, targeted removal
  only. `lib/nina`, `lib/admin`, `components/nina`, `components/admin`, and
  `lib/db` were off-limits (owned by parallel sessions).
- **Concrete changes:** one commit, `eb93607` — *"components/ui: de-export
  symbols with zero callers, trim unused barrel re-exports"* — **9 exported
  symbols de-exported across 4 component files plus the barrel, 2 test files
  reworked onto the public surface. 7 files changed, 46 insertions(+),
  38 deletions(-)**:
  - `components/ui/Button.tsx` — `ButtonVariant`, `ButtonSize`,
    `ButtonBaseProps`, `ButtonProps`, `ButtonLinkProps` de-exported (5
    symbols; every one is consumed only inside the file's own components).
  - `components/ui/Field.tsx` — `FieldProps`, `InputProps` de-exported.
  - `components/ui/Chip.tsx` — `chipClasses` de-exported (module-private;
    only `Chip` renders it).
  - `components/ui/Flag.tsx` — `Flag` de-exported (module-private; only
    `FlagList` renders it).
  - `components/ui/index.ts` — the barrel dropped 6 re-export lines with
    zero importers-through-the-barrel (`Chip`, `chipClasses`, `EmptySlot`,
    `Input`, `TabBar`, and the Button/Field prop-type lines) and gained a
    header paragraph documenting the invariant behind the trim.
  - `components/ui/Chip.test.tsx` + `components/ui/Flag.test.tsx` — the
    pins that named the now-private symbols reworked to reach the **same
    DOM through the public surface** (`render(<Chip/>)` class assertions;
    `render(<FlagList/>)` + `getByRole('listitem')`). Coverage preserved,
    not deleted: **9 Chip tests and 8 Flag tests before, 9 and 8 after.**
- **Real value delivered:**
  - First symbol-level YAGNI pass these directories have ever had. The
    repo-wide survey that cleared them looked for orphaned *files*; the
    symbol-level question had never been asked, and it had 9 real answers
    (plus two false alarms, correctly dismissed — see below).
  - The public API surface of the design system shrank: the Button/Field
    prop types are no longer a pretend-public contract nobody consumes, and
    two helpers (`chipClasses`, `Flag`) are now provably module-private, so
    a future reader can refactor them without checking the world.
  - The barrel trim was turned into a **standing rule**, not just a cleanup:
    `index.ts`'s header now documents "only the names screens actually pull
    through the barrel are re-exported here … Re-add one only when a screen
    imports it from here."
  - Two false alarms caught and correctly dismissed, each of which would
    have been a regression masquerading as cleanup: the `components/review/`
    `SplitsTable`/`ZoneBar` twins (imported by **relative** path from
    `ReviewClient.tsx`, and documented as a deliberate pair) and the
    "dead-looking" barrel itself (42 code files import through it).
  - The verification method itself is a deliverable: a
    TypeScript-compiler-API export extractor plus a four-layer caller
    verifier, positive-controlled against a deliberately dead symbol, and
    re-run after the removals to prove zero remaining candidates.
- **Branch:** `token-maxxing-2026-09-11-components-dead-code-a`
  (coordinator-assigned worker branch, base `41b297e`, main's tip at
  session start).
- **Merge status:** merged (commit `3155019`)
- **Approx token burn:** high — thousands of exports enumerated and
  individually grep-verified, a bespoke verifier script written and
  debugged through four layers of false-signal filtering, two forensic
  false-alarm investigations, a full-suite gate run, and a post-removal
  re-sweep. 🔥

## Context & Motivation

This session ran in worker mode: the orchestrator (`tokenmax-orch-2026-09-11`)
pre-assigned the idea instead of the session generating its own menu, and gave
it its own branch and slug (`components-dead-code-a`). The assignment's
premise came from a repo-wide survey an earlier session performed, which
established a negative result — **no orphaned files** — and stopped there. A
file with an importer can still be full of dead surface: every `export`
keyword that nothing imports is API surface with no consumer, and none of the
assigned directories had ever had a pass that asked the question per symbol.

The assignment scoped the sweep to `app/` and six component directories and
fenced off `lib/nina`, `lib/admin`, `components/nina`, `components/admin`,
and `lib/db` — all owned by parallel sessions running the same day. Two
ground rules mattered for method design:

- **"Genuinely zero callers, not counting the file's own tests."** A symbol
  whose only importer is its own `.test.tsx` is exported for the test's
  benefit — the definition of test-driven API surface.
- **An empty result is valid.** Declared up front so the sweep would have no
  incentive to manufacture findings. (It found some anyway — but the two
  loudest initial candidates both dissolved under inspection, which is
  exactly what the rule is for.)

## What We Did (blow-by-blow)

1. **Enumerated every export precisely with the TypeScript compiler API**
   (`/tmp/extract_exports.cjs`, listed in full in the Appendix). A regex
   over `^export` was tried first and rejected: it misses multi-line export
   clauses, and this repo has them — `ButtonProps` is declared as
   `export interface ButtonProps\n  extends ButtonBaseProps, Omit<…> {`,
   where the `export` keyword and the identifier live on different lines.
   The script walks each file's AST and emits `file<TAB>name, name, …`,
   handling re-export clauses, `export *`, variable statements, functions,
   classes, interfaces, type aliases, enums, and default exports.

2. **Verified each symbol repo-wide with `git grep` at a word boundary**,
   excluding the defining file, that file's own tests, and markdown. Any
   symbol whose hits were only its own definition (and its own test) became
   a candidate.

3. **Classified each remaining hit line-by-line** to separate real use from
   three classes of false signal: comments that merely mention the name,
   `scripts/*` boundary scripts that reference module *paths* (strings, not
   imports), and incidental text matches.

4. **Re-scanned every barrel importer with a multiline-aware import scan.**
   This was the layer the first three would have failed without: a per-line
   regex for `import { A, B } from '@/components/ui'` silently misses the
   same import list when prettier has wrapped it across lines, and the repo
   has 42 code files importing through `@/components/ui`. Several candidate
   symbols were saved from wrongful deletion by this pass alone.

5. **Ran a positive control.** A deliberately dead scratch symbol was
   planted and fed through the verifier; it was flagged. The pipeline was
   thereby proven capable of saying "dead" — not silently blind, which is
   the only failure mode worse than a wrong deletion, because it looks like
   a clean bill of health.

6. **Investigated the two loudest candidates — and dismissed both** (see
   Code / Design Details for the forensics):
   - `components/review/SplitsTable.tsx` and `components/review/ZoneBar.tsx`
     looked zero-caller by import path. They are not: `ReviewClient.tsx`
     imports them by **relative** path (`'./SplitsTable'`, `'./ZoneBar'`),
     and `components/ui/index.ts`'s header explicitly documents the twin
     pair — `components/review/*` are F05's *editable* review controls,
     `components/ui/*` are F08's *read-only* presentations — as "deliberate
     and not a duplication to collapse."
   - The `components/ui/index.ts` barrel itself looked dead: only plan docs
     seemed to mention it. It has **42 code-file importers**. The real
     finding was *inside* the barrel — six re-export lines nothing pulls
     through it.

7. **Applied the removals** (`eb93607`): the 9 de-exports, the barrel trim,
   the new barrel-header invariant, and the test rework, as a single commit.

8. **Ran the full local gate, all green:**
   - `next typegen` then `npx tsc --noEmit` → clean. (The fresh worktree
     initially reported `PageProps` errors — missing typegen, pre-existing
     and known from prior sessions' fresh-worktree notes, not caused by the
     removals.)
   - `npx vitest run` → **265 test files / 5,107 tests, all passing**.
   - `npx eslint` on the changed files → clean.
   - Prettier verified against the **HEAD blobs**, inside the repo:
     `Chip.test.tsx` was *already* prettier-unclean on HEAD — pre-existing
     drift, deliberately **not** swept into the removal commit.
   - **Post-removal re-sweep:** the verifier re-run over the same scope
     after the commit returned **0 remaining candidates**.

## Code / Design Details

**The four-layer verifier, and the trap each layer exists to defeat.** The
interesting engineering of this session is that "grep for the symbol and
count the hits" gives the wrong answer in this repo in at least four
independent ways:

| Trap | Example | Layer that defeats it |
|------|---------|----------------------|
| Multi-line export clauses | `export interface ButtonProps\n  extends …` | TS compiler API enumeration |
| Comments / path strings | doc headers naming a helper; `scripts/*` referencing module paths | line-level classifier |
| Barrel re-exports as phantom callers | `index.ts` re-exporting a symbol no one imports *through* the barrel | importer-side scan, not definition-side |
| Wrapped import lists | `import {\n  Chip,\n} from '@/components/ui'` spanning lines | multiline-aware import scan |

**The positive control** closed the loop: a verifier that flags nothing is
indistinguishable from one that can't see anything. Planting a known-dead
symbol and watching it get flagged proved the "no callers" verdicts were
measurements, not blindness.

**What a de-export looks like** (`Button.tsx`, the largest single-file
change — 5 symbols):

```diff
-export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
+type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
```

Every removal is exactly this shape — the keyword goes, the declaration
stays. No signature changed, no behavior changed; only the visibility
contract shrank to match reality.

**The barrel trim, before → after:**

```diff
 export { Button, ButtonLink, LoadingDots, buttonClasses } from './Button'
-export type { ButtonProps, ButtonLinkProps, ButtonSize, ButtonVariant } from './Button'
 export { Card, Eyebrow, Stat } from './Card'
-export { Chip, chipClasses, CHIP_CLASS } from './Chip'
-export { EmptySlot, EmptyState } from './EmptyState'
-export { CONTROL_CLASS, Field, Input, NumberInput } from './Field'
-export type { FieldProps, InputProps } from './Field'
-export { Flag, FlagList } from './Flag'
+export { CHIP_CLASS } from './Chip'
+export { EmptyState } from './EmptyState'
+export { CONTROL_CLASS, Field, NumberInput } from './Field'
+export { FlagList } from './Flag'
 export { SplitsTable } from './SplitsTable'
-export { TabBar } from './TabBar'
 export { ZoneBar } from './ZoneBar'
```

And the invariant the barrel's header gained, so the trim survives as a rule
rather than rotting back:

> Only the names screens actually pull through the barrel are re-exported
> here. `Chip`, `EmptySlot`, `Input` and `TabBar` are imported by direct
> path today, `Flag` is internal to `FlagList`, and the Button/Field prop
> types have no external consumer — so none of them are re-exported. Re-add
> one only when a screen imports it from here.

**The test rework — same pins, public surface.** `Chip.test.tsx` named
`chipClasses` directly; since the function is module-private now, the same
rules are pinned through the rendered component:

```tsx
// before: string surgery on a private function's return value
const off = chipClasses(false)
expect(off).toContain('h-11')
expect(on).toContain('bg-ink')

// after: the same rules, observed on the real DOM
const off = render(<Chip>Easy</Chip>).container.firstElementChild!
const on = render(<Chip selected>Easy</Chip>).container.firstElementChild!
expect(chip).toHaveClass('h-11', 'rounded-pill')
expect(on).toHaveClass('bg-ink')
expect(off).toHaveClass('bg-paper-2')
```

`Flag.test.tsx` likewise renders `<FlagList flags={[WARN]} />` and queries
`getByRole('listitem')` instead of importing the now-private `Flag`. This is
the strictly better shape anyway — the tests now assert what a user's
browser actually sees — and it means the pins survive any future de-export
by construction. Test counts held exactly: Chip 9 → 9, Flag 8 → 8.

**False alarm #1, the forensics.** The `components/review/` twins failed
the import-path check because the check looked for
`from '@/components/review/SplitsTable'`-style specifiers;
`ReviewClient.tsx` (lines 19–20) says `import { SplitsTable } from
'./SplitsTable'`. And even absent callers, the barrel header's twin-pair
paragraph (`components/review/*` = editable F05 controls with a sheet per
row and draft state; `components/ui/*` = read-only F08 presentations of
committed data) marks them deliberate — a finding to *respect*, not a
duplication to collapse.

**False alarm #2, the barrel.** With only plan docs naming `@/components/ui`,
the barrel looked like speculative surface. The repo-wide importer scan
found 42 code files pulling through it. The lesson generalizes: a barrel's
*deadness* is a property of its importers, and its *contents* are a separate
question — which is where the real finding lived.

**What the sweep did *not* find, and why that's the expected result.** In
`app/`, essentially every export is framework-reserved — `page`/`layout`/
`route` defaults, `metadata`, `viewport`, `dynamic`, `maxDuration`, `runtime`,
`generateMetadata`, NextAuth's `GET`/`POST` — reserved by Next.js's own
conventions, invisible to any caller grep by design. The rest had real
callers (`share.ts`'s server actions and `copy.ts`'s constants are all
consumed by the share page and not-found). The directories with zero or
near-zero test-file coupling (charts, profile, share, trends) simply didn't
grow speculative exports.

## Decisions & Trade-offs

- **Targeted removal only.** Keyword-level de-exports and barrel-line
  trims; no file deletions, no API reshaping, no merging of the twin
  components. The sweep's mandate was explicitly removal of zero-caller
  *exports*, and every diff hunk is exactly that.
- **Tests reworked, never deleted.** The two test files that named
  now-private symbols were migrated to the public surface with identical
  coverage (9 + 8 tests, before = after). Deleting the tests would have
  been easier and strictly worse.
- **One commit, not per-file.** Unlike the day's test-writing sessions
  (which batched commits per component group), the removals are one atomic
  commit — the unit of meaning here is "the verified result of one sweep,"
  and splitting it would put unverified intermediate states on the branch.
- **Exclusion zones honored.** `lib/nina`, `lib/admin`, `components/nina`,
  `components/admin`, `lib/db` untouched — owned by parallel sessions
  running today. The `lib/nina` YAGNI hunt (deferred five times by earlier
  sessions) therefore remains open, not closed by this session.
- **Prettier drift left out of the removal commit.** `Chip.test.tsx` was
  already prettier-unclean on HEAD; formatting noise in a commit whose
  every hunk should be auditable as "an `export` keyword removed" would
  have buried the signal. Recorded as a follow-up instead.
- **Empty result declared valid up front** — and the two loudest
  candidates *were* empties. A sweep that must find something deletes the
  `ReviewClient.tsx` imports.

## Follow-ups & YAGNI notes

- **A lint-rule gate would make this sweep unnecessary next time.** The
  whole method — compiler-API extraction, per-symbol grep, classification,
  multiline import scan — exists because nothing in the toolchain notices
  an unused export. A `ts-prune`-style check in CI would catch each of
  these 9 symbols at birth. Deliberately not built today: a CI gate is a
  repo-wide decision, out of scope for a worker session.
- **`Chip.test.tsx` still carries HEAD's prettier drift.** One
  `prettier --write` on that file, whenever someone next touches it for
  real. Do not ship it as a drive-by.
- **The review/ vs ui/ twins are deliberate — do not "deduplicate" them.**
  Now documented in two places: `components/ui/index.ts`'s header and this
  doc. A future sweep (or an over-eager refactor) will re-flag them.
- **The fenced-off directories have never had this pass.** `lib/`,
  `components/admin`, and `components/nina` were off-limits today because
  parallel sessions own them; they remain the highest-value targets for a
  rerun of this exact method once the day's branches have landed. The
  verifier script (Appendix) is reusable as-is.
- **Carried-forward context:** the sweep confirms `app/`'s exports are
  framework-reserved or consumed, so future dead-code effort should start
  from `lib/` and the admin/nina component trees, not from pages.

## Appendix

**The export extractor** (`/tmp/extract_exports.cjs`, 37 lines, run with
`node /tmp/extract_exports.cjs <files…>` — reuse it for the lib/ + admin +
nina pass):

```js
// Precisely list exported symbol names per file using the TypeScript compiler API.
const ts = require('<repo>/node_modules/typescript/lib/typescript.js');
const fs = require('fs');

for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const names = [];
  sf.forEachChild((node) => {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const e of node.exportClause.elements) {
          names.push(e.propertyName ? `${e.propertyName.text} as ${e.name.text}` : e.name.text);
        }
      } else if (!node.exportClause && node.moduleSpecifier) {
        names.push(`*from ${node.moduleSpecifier.text}`);
      }
      return;
    }
    const mods = node.modifiers || [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return;
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) names.push(d.name.getText(sf));
    } else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      names.push(node.name ? node.name.text : 'default(fn)');
    } else if (
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      names.push(node.name.text);
    } else if (ts.isExportAssignment(node)) {
      names.push('default(assignment)');
    }
  });
  console.log(`${f}\t${names.join(', ')}`);
}
```

**Key commands run this session:**

```bash
node /tmp/extract_exports.cjs app/**/*.{ts,tsx} components/{ui,charts,review,profile,share,trends}/**/*.{ts,tsx}
git grep -wn '<symbol>' -- '*.ts' '*.tsx' ':(exclude)<defining file>' ':(exclude)<its tests>' ':(exclude)*.md'
npx vitest run                      # full suite: 265 files / 5107 tests
npx tsc --noEmit                    # after next typegen
npx eslint <changed files>
git show <HEAD-blob> | npx prettier --stdin-filepath components/ui/Chip.test.tsx --check
```

**Gate results:**
- `next typegen` + `npx tsc --noEmit`: clean (fresh-worktree `PageProps`
  errors were missing typegen — pre-existing, not from the removals).
- `npx vitest run`: **265 test files / 5,107 tests passing** (count
  unchanged — this session removed zero tests; it re-homed 17 of them onto
  the public surface).
- eslint on changed files: clean. Prettier vs HEAD blobs: only the
  pre-existing `Chip.test.tsx` drift, left alone.
- Post-removal re-sweep: **0 remaining candidates.**

**Commit (on `token-maxxing-2026-09-11-components-dead-code-a`, base
`41b297e`):**

```
eb93607 components/ui: de-export symbols with zero callers, trim unused barrel re-exports

 components/ui/Button.tsx    | 11 +++++------
 components/ui/Chip.test.tsx | 27 ++++++++++++++++-----------
 components/ui/Chip.tsx      |  2 +-
 components/ui/Field.tsx     |  4 ++--
 components/ui/Flag.test.tsx | 22 ++++++++++++----------
 components/ui/Flag.tsx      |  2 +-
 components/ui/index.ts      | 16 +++++++++-------
 7 files changed, 46 insertions(+), 38 deletions(-)
```

**Branch:** `token-maxxing-2026-09-11-components-dead-code-a` — on branch,
not merged (the coordinator owns merging; this session committed the work
and this doc and stopped).
