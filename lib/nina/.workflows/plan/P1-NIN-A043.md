> Adopted from `NINA_QUERIES_SPLIT_PLAN.md` phase 4. Source: `.workflows/plan/nina-queries-split/phase-4.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 4: Images module (§5 + §5a-2 + §5b) + script pointer fixes

**Plan set:** `NINA_QUERIES_SPLIT_PLAN.md`
**Analysis:** `20260912-201916_code_analyzer.md`
**Satisfies:** R1, R2, R4, R6, R7, R11
**Depends on:** Phase 3 (which depends transitively on 1–2)
**Difficulty:** HARD
**Package:** `lib/nina` (plus `scripts` comments-only, two `tests/` pointer fixes)

---

## Goal

`lib/nina/queries/images.ts` exists — the largest module of the split (~979 lines): §5 Images,
§5a-2 The Media view and §5b Conversation photographs move from `lib/nina/queries.ts`
(HEAD `1567–2491`, 925 lines) byte-identical except exactly four changed lines (two `export `
keywords, two §9→module pointer rewrites). The two §5 helpers `isOriginalPhoto` and
`generatedChatPhotoScope` become module exports — internal-shared per the plan index's
Decisions — which grows the barrel's value-export surface by exactly two names; phase 1's
barrel snapshot test is extended by exactly those two. The three live line-pointer comments in
the two operator scripts cite the new module. Zero behavior change: same SQL, same signatures,
same return shapes.

## FACT CORRECTIONS incorporated (coordinator + peer plans; read before implementing)

1. **`tests/nina.imageprefs.test.ts:566–567` breaks in THIS phase, not phase 7.** The test
   slices `generatedChatPhotoScope` out of `lib/nina/queries.ts` by source text, anchored on
   `'\nfunction generatedChatPhotoScope(userId: string) {'`. This phase (a) moves that text to
   `lib/nina/queries/images.ts` and (b) adds the `export ` keyword, so both the path and the
   anchor go stale. Phase 4 repoints both (Step 6). Phase 7's plan **Requires** exactly this.
   The sibling test at `:546` (the `listNinaPhotoReferences` slice) stays valid until phase 7 —
   do not touch it.
2. **`countNinaChatPhotos` is already `export async function` (HEAD `:2099`) and moves as-is** —
   no keyword change. It is one of phase 7's two required imports from `./images` (with
   `generatedChatPhotoScope`). Phase 7's plan does **not** import `isOriginalPhoto`; its export
   is nonetheless required by the plan index's Decision row (internal-shared helpers) and by the
   prose contracts that cite it — export all three names under today's exact spellings.
3. **The brief's "code-level deps on other domains: NONE" is verified true.** The §5→§8/§9/§10b/
   §12 mentions in the moved span are comments only. The only cross-module §-refs in the span
   are two prose pointers to §9 symbols (Step 2's rewrites (c)/(d)). `generatedChatPhotoScope`'s
   `NOT EXISTS` subquery reads `ninaAvatars` **directly from `@/lib/db/schema`** — no dependency
   on phase 6's avatars module.
4. **Line-number note.** The task brief cites §5 as 1568–2107, §5a-2 as 2108–2199, §5b as
   2200–2493. Measured on HEAD `2c823eb`: the §5 banner comment starts at **1567** (title line
   1568), the §5a-2 banner at **2107**, the §5b banner at **2199**; §5b's last code line
   (`updateNinaChatPhotoDescription`'s closing brace) is **2491**; blanks at 1566 and 2492
   bracket the span; §6's banner starts at **2493**. The code wins; all ranges below are
   HEAD-measured. Phases 2–3 only removed lines ABOVE 1566 and added barrel lines at the top,
   so the span's content and internal line numbers are unchanged when this phase starts — locate
   blocks by banner text, not by number.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:** `lib/nina/queries/images.ts` exporting exactly 19 symbols (18 functions +
1 interface), in source order:
`hasProactiveMessageForRun`, `insertNinaMessageImages`, `adoptNinaMessageImage`,
`listNinaMessageImages`, `getNinaMessageImage`, `getNinaMessageImagesForMessages`,
`findNinaImageByContentHash`, `findNinaSignedOriginals`, **`isOriginalPhoto`** (was private,
now exported — internal — shared with sibling query modules), **`generatedChatPhotoScope`**
(was private, now exported — same marking), `countNinaChatPhotos`,
`listNinaMediaPhotos`, `countNinaMediaPhotos`, `NinaChatPhotoBlobPatch` (type-only interface),
`updateNinaChatPhotoBlob`, `deleteNinaMessageImage`, `isBlobPathnameReferenced`,
`setNinaMessageImageDescription`, `updateNinaChatPhotoDescription`.
`mediaCollectionScope` moves module-private (private at HEAD `:2134`, stays private).

**Deletes:** from `lib/nina/queries.ts` — the contiguous span from the blank above the §5
banner through `updateNinaChatPhotoDescription`'s closing brace (HEAD 1566–2491; the blank at
2492 is KEPT, so exactly one blank line remains between §4c's last line and §6's banner). From
the barrel's import block, exactly these members/statements (each measured: zero remaining uses
in §6–§12, i.e. HEAD 2493–4573): `notExists` (drizzle-orm); `type NinaImageKind`
(`@/lib/db/schema`); `NINA_CHAT_PHOTO_PAGE_SIZE` (`@/lib/nina/album` — its three sibling
members STAY, §9b uses them); the entire `@/lib/nina/perceptual` statement;
the entire `@/lib/photos/contentHash` statement; `NinaImageInsert`, `NinaImageRow`,
`NinaMediaPage` (phase 1's `./queries/shapes` import-back); `imageColumns` (phase 1's
`./queries/columns` import-back — `avatarColumns` STAYS for §9/§9b; the only `imageColumns`
text left in the barrel after this phase is the docstring title at HEAD `:4448`, prose). No
config keys. No symbols cease to exist — every deleted line reappears in the new module.

**Renames:** none.

**Signature changes:** none.

**Adds (to `lib/nina/queries.ts`):** `export * from './queries/images'` — fourth `export *`
line of the barrel block (after `./queries/shapes`, `./queries/sessions`,
`./queries/messages`; `./queries/columns` is phase-1-imported, never re-exported, so it is
not a block line; phase 7 expects exactly this order) — and
`import { countNinaChatPhotos, generatedChatPhotoScope } from './queries/images'`
in the relative-import group. The import-back is REQUIRED: §10b still in the barrel calls
`generatedChatPhotoScope` at HEAD `:4253`/`:4331` and `countNinaChatPhotos` at `:4257`; `export *`
does not bring names into local scope. `isOriginalPhoto` gets NO import-back (its only
post-phase-4 mentions in the barrel are prose). Phase 7 deletes the whole import block when §10b
moves (phase 6's wholesale import-block replacement must PRESERVE this line).

**Adds (to the barrel's public surface):** exactly two value exports — `isOriginalPhoto`,
`generatedChatPhotoScope` — via `export *`, per the plan index Decisions row. Phase 1's
`lib/nina/queries.test.ts` name-freeze snapshot gains exactly these two names (Step 5).
`NinaChatPhotoBlobPatch` was already public and stays public; no other surface change.

**images.ts's exact import list** (nothing more — eslint flags unused; every member verified
used in the moved span):

```ts
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaAvatars, ninaMessageImages, ninaMessages, type NinaImageKind } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import { NINA_CHAT_PHOTO_PAGE_SIZE } from '@/lib/nina/album'
import { normalizeClaimedPerceptualHash, normalizeClaimedPerceptualSig } from '@/lib/nina/perceptual'
import { isValidContentHash } from '@/lib/photos/contentHash'
import type { NinaImageInsert, NinaImageRow, NinaMediaPage } from './shapes'
import { imageColumns } from './columns'
```

(Both single-line `@/lib/db/schema` and `@/lib/nina/perceptual` imports measure ≤ 100 chars —
prettier's printWidth — and must stay single-line or `prettier --check` rewrites them.
Grouping/order per the house style phases 1–3 established: externals, blank, `@/` aliases,
relative last.)

**Requires (from earlier phases):**
- Phase 1: `lib/nina/queries/shapes.ts` exports `NinaImageInsert`, `NinaImageRow`,
  `NinaMediaPage`; `lib/nina/queries/columns.ts` exports `imageColumns`;
  `lib/nina/queries.ts` contains the foundation re-export block and import-backs;
  `lib/nina/queries.test.ts` (barrel value-export name-freeze) exists and is green.
- Phase 2: `export * from './queries/sessions'` present; `removeNinaSession` lives in
  `queries/sessions.ts` (so the moved span's bare pointer `(:1025-1030)` at HEAD `:2069` is
  already dangling on arrival — invariant 5 keeps it byte-identical here; see Handoffs).
- Phase 3: `export * from './queries/messages'` present; whatever import-back members phase 3
  pruned stay pruned. This phase's prunes are member-level and additive to whatever phase 3 left.

**Adds (comments only, `scripts/`):** three line-pointer citations repointed, prose untouched:
- `scripts/nina-dedupe-media.mjs:60` — `` (`lib/nina/queries.ts:2073`) `` →
  `` (`lib/nina/queries/images.ts:859`) `` (the `isBlobPathnameReferenced` citation; the old
  line was already stale — the function is at HEAD `:2371`).
- `scripts/nina-dedupe-plan.mjs:71` — `` in `lib/nina/queries.ts:1812`. `` →
  `` in `lib/nina/queries/images.ts:481`. `` (the `isOriginalPhoto` citation; old line already
  stale — HEAD `:1993`.)
- `scripts/nina-dedupe-plan.mjs:93` — `` (`lib/nina/queries.ts:1757`) `` →
  `` (`lib/nina/queries/images.ts:285`) `` (the `getNinaMessageImagesForMessages` citation; old
  line already stale — HEAD `:1797`.)
  859/481/285 assume the Step 1 header is 54 lines; verify with the Step 2 greps before writing.

**Adds (tests):** `tests/nina.imageprefs.test.ts:566` path → `'lib/nina/queries/images.ts'`;
`:567` anchor → `'\nexport function generatedChatPhotoScope(userId: string) {'`.

**Leaves alone (owned by others):** §6 onward bodies (phases 5–7); `lib/nina/tuning.ts` /
`lib/nina/imageprefs.ts` flat model layers; all 14 importers and every
`vi.mock('@/lib/nina/queries')` factory (runtime, satisfied by the barrel — verified for
`nina.chatDedupe`/`nina.chatPhotoReattach`/`nina.settingsActions`/`nina.attachTargets` etc.,
all `importOriginal` spreads or fixed factories over the barrel path); `tests/nina.photoRefs.test.ts`
(barrel-importing, generated-SQL assertions — byte-identical code keeps them green);
`tests/nina.imageprefs.test.ts:546–547` (phase 7's); `tests/db.schema.nina.test.ts:525,705`
(phase 7's — they read for tuning/imageprefs mappings, not image symbols); script LOGIC
(comments only here); the six stale §10b line pointers phase 7 travels byte-identical
(its Handoffs → phase 8); historical records under `*/.workflows/plan/**` and
`docs/plans/archive/**` (R7). **Cycle rule honored:** `images.ts` never imports
`@/lib/nina/queries`.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/images.ts` | create | provenance header + 22-line import block + HEAD 1567–2491 verbatim except 4 changed lines (2 `export ` keywords, 2 §9 pointer rewrites) — 979 lines total |
| `lib/nina/queries.ts` | modify | delete the moved span (HEAD 1566–2491); prune 6 import members/statements; add 1 re-export line + 1 import-back |
| `scripts/nina-dedupe-media.mjs` | modify | line 60: file/line citation only |
| `scripts/nina-dedupe-plan.mjs` | modify | lines 71, 93: file/line citations only |
| `tests/nina.imageprefs.test.ts` | modify | lines 566–567: source path + slice anchor |
| `lib/nina/queries.test.ts` | modify | phase 1's frozen barrel value-export set gains exactly `isOriginalPhoto`, `generatedChatPhotoScope` |

## Implementation Steps

All HEAD line numbers refer to `lib/nina/queries.ts` at branch base `2c823eb`.

### Step 1: Create `lib/nina/queries/images.ts` — imports and provenance header

**File:** `lib/nina/queries/images.ts:1` (new)
**Change:** write the complete header (everything down to where the moved body starts). This is
the only new prose in the phase; everything else is moved. Imports FIRST, provenance doc second
— the pattern phases 2–4 set for the new modules (the reconciler aligned phase 7 to the same
order; rung: surrounding repo convention).

**Code:**

```ts
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaAvatars, ninaMessageImages, ninaMessages, type NinaImageKind } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import { NINA_CHAT_PHOTO_PAGE_SIZE } from '@/lib/nina/album'
import { normalizeClaimedPerceptualHash, normalizeClaimedPerceptualSig } from '@/lib/nina/perceptual'
import { isValidContentHash } from '@/lib/photos/contentHash'
import type { NinaImageInsert, NinaImageRow, NinaMediaPage } from './shapes'
import { imageColumns } from './columns'

/**
 * Nina's photographs in the conversation: the write path, every read, the dedup finders, the
 * two collection scopes, the Media view, and the admin's replace/remove/describe side.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12. Origin sections, in file order:
 *   - §5 Images — `hasProactiveMessageForRun`, `insertNinaMessageImages`,
 *     `adoptNinaMessageImage`, `listNinaMessageImages`, `getNinaMessageImage`,
 *     `getNinaMessageImagesForMessages`, `findNinaImageByContentHash`,
 *     `findNinaSignedOriginals`, `countNinaChatPhotos`, plus the two helpers this split
 *     EXPORTS — `isOriginalPhoto` and `generatedChatPhotoScope`: internal — shared with
 *     sibling query modules (phase 7's imageprefs module needs `generatedChatPhotoScope`
 *     across the boundary; the plan index's Decisions export both helpers for it). They
 *     surface through the barrel's `export *` — accepted and documented there.
 *   - §5a-2 The Media view — `countNinaMediaPhotos`, `listNinaMediaPhotos`, plus the
 *     module-private `mediaCollectionScope`
 *   - §5b Conversation photographs — the admin write side: `NinaChatPhotoBlobPatch`,
 *     `updateNinaChatPhotoBlob`, `deleteNinaMessageImage`, `isBlobPathnameReferenced`,
 *     `setNinaMessageImageDescription`, `updateNinaChatPhotoDescription`
 *
 * Banner prose moved byte-identical apart from the two `export ` keywords added to the helpers
 * above and two §-pointer rewrites where prose named §9 (`getNinaAvatar`'s and
 * `setNinaAvatarDescription`'s doc-comments — that section becomes
 * `lib/nina/queries/avatars.ts` in phase 6). The §5↔§5a-2↔§5b mentions stay as written: all
 * three sections landed here together, so the provenance header above keeps them resolvable.
 *
 * The layer-wide rules the banners cite — userId scoping, never writing `runs`, `db.batch`
 * over `db.transaction`, the `ORDER BY seq` note, the deliberate lack of `server-only` — stay
 * on `lib/nina/queries.ts`'s header. This module inherits those rules; it does not restate
 * them.
 *
 * Imports foundation-wards only (`./shapes`, `./columns`, `@/lib/*`) — never the barrel
 * `@/lib/nina/queries`, which re-exports this module.
 */
```

The header block is 22 import lines + 1 blank + 31 doc lines = **54 lines**; the moved body
starts at line **55**. (If your editor's line count differs, re-derive the Step 2 citation
numbers: `images.ts line = 54 + HEAD line − 1566`.)

**Impact:** none yet (file unreferenced). `import type` for the three shapes is required by
`verbatimModuleSyntax`.

### Step 2: Move the §5 + §5a-2 + §5b span into `images.ts`

**File:** `lib/nina/queries/images.ts` (body, directly after the header doc's `*/`)
**Change:** append HEAD `queries.ts` lines **1567–2491** verbatim, in order, then apply exactly
four line replacements — the complete list of changes inside the moved block (grep proof: the
span contains exactly six `§` occurrences — the three banner titles at :1568/:2108/:2200, which
travel as origin markers; the intra-module §5 mention at :2204, byte-identical; and the two §9
pointers rewritten below; there are no other §-refs and no `queries.ts:` file citations in the
span):

```sh
git show HEAD:lib/nina/queries.ts | sed -n '1567,2491p' >> lib/nina/queries/images.ts
```

**(a) HEAD :1993** — `isOriginalPhoto` becomes a module export (plan index Decisions). One
line, replaced in place:

- Before: `function isOriginalPhoto(): SQL | undefined {`
- After: `export function isOriginalPhoto(): SQL | undefined {`

**(b) HEAD :2067** — `generatedChatPhotoScope` becomes a module export. One line, replaced
in place:

- Before: `function generatedChatPhotoScope(userId: string) {`
- After: `export function generatedChatPhotoScope(userId: string) {`

**(c) HEAD :1763** — `getNinaMessageImage`'s doc cites §9; the section becomes
`lib/nina/queries/avatars.ts` in phase 6 (R6: rewrite the pointer, keep the argument). One
line, replaced in place:

- Before: ` * One conversation photo by id, ownership-scoped. The mirror of \`getNinaAvatar\` in §9, and it`
- After: ` * One conversation photo by id, ownership-scoped. The mirror of \`getNinaAvatar\` in \`lib/nina/queries/avatars.ts\`, and it`

**(d) HEAD :2413** — `setNinaMessageImageDescription`'s doc cites §9 the same way. One line,
replaced in place:

- Before: ` * in §9, and it exists for the mirror reason: a hand-uploaded photograph has no generation prompt,`
- After: ` * in \`lib/nina/queries/avatars.ts\`, and it exists for the mirror reason: a hand-uploaded photograph has no generation prompt,`

The moved body is therefore **925 lines with 4 changed lines**; everything else — all three
`====` banners, all 18 functions, the `NinaChatPhotoBlobPatch` interface, both private helpers'
doc-comments — is byte-identical to HEAD.

**Considered and left unchanged (do not touch):**
- HEAD `:2069` — `generatedChatPhotoScope`'s doc cites `removeNinaSession`'s measured reason
  `(:1025-1030)`; that function moved to `queries/sessions.ts` in phase 2, so the bare pointer
  is already dangling on arrival. Invariant 5 keeps it byte-identical; phase 8's sweep owns it
  (Handoffs).
- HEAD `:2092` — `countNinaChatPhotos`'s doc cites `countNinaAvatars` `(:2336)` — stale at HEAD
  (the function is at `:3752`). Same disposition: byte-identical here, phase 8's sweep.
- HEAD `:2141` — `listNinaMediaPhotos`'s doc says "Modelled on `listNinaChatPhotos` above";
  that function no longer exists anywhere (surface-merge casualty — only prose and archived
  plans mention it). Stale at HEAD, i.e. historical; R7 forbids rewording it here.
- HEAD `:1826` "calling it from above its definition is this file's normal order" — still true
  verbatim: `findNinaImageByContentHash` (:1860) still sits above `isOriginalPhoto` (:1993) in
  the new module, and hoisted function declarations behave identically.
- HEAD `:1744`, `:1960–1964`, `:2111` — prose naming `listNinaMessageImages`,
  `countNinaChatPhotos`, `listNinaMediaPhotos`, `mediaCollectionScope`, `isOriginalPhoto`:
  all intra-module post-move; the symbols are co-resident, prose stays true.
- HEAD `:2204` "rather than in §5: §5 is what the chat reads" — intra-module (both sections in
  `images.ts`); the provenance header keeps the §-names resolvable (phase 7's precedent for
  §11→§12).
- All `lib/nina/actions.ts`, `lib/nina/album.ts`, `lib/admin/ninaAlbumActions.ts`,
  `lib/db/schema.ts:1781`, `tests/nina.photoRefs.test.ts`,
  `tests/admin.chatPhotoAdoption.test.ts:132` citations — external paths, still true.

**Expected landing lines** (with the Step 1 header = 54 lines; `images.ts = 54 + HEAD − 1566`):

| Symbol / marker | HEAD | images.ts |
|---|---|---|
| §5 banner | 1567 | 55 |
| `hasProactiveMessageForRun` | 1581 | 69 |
| `insertNinaMessageImages` | 1602 | 90 |
| `adoptNinaMessageImage` | 1716 | 204 |
| `listNinaMessageImages` | 1750 | 238 |
| `getNinaMessageImage` | 1776 | 264 |
| `getNinaMessageImagesForMessages` | 1797 | 285 |
| `findNinaImageByContentHash` | 1860 | 348 |
| `findNinaSignedOriginals` | 1905 | 393 |
| `isOriginalPhoto` (now `export`) | 1993 | 481 |
| `generatedChatPhotoScope` (now `export`) | 2067 | 555 |
| `countNinaChatPhotos` | 2099 | 587 |
| §5a-2 banner | 2107 | 595 |
| `mediaCollectionScope` (private) | 2134 | 622 |
| `listNinaMediaPhotos` | 2156 | 644 |
| `countNinaMediaPhotos` | 2191 | 679 |
| §5b banner | 2199 | 687 |
| `NinaChatPhotoBlobPatch` | 2209 | 697 |
| `updateNinaChatPhotoBlob` | 2260 | 748 |
| `deleteNinaMessageImage` | 2308 | 796 |
| `isBlobPathnameReferenced` | 2371 | 859 |
| `setNinaMessageImageDescription` | 2420 | 908 |
| `updateNinaChatPhotoDescription` | 2477 | 965 |
| EOF | 2491 | 979 |

Verify before writing the script citations (Step 3):

```sh
grep -n '^export async function isBlobPathnameReferenced' lib/nina/queries/images.ts   # expect 859
grep -n '^export function isOriginalPhoto' lib/nina/queries/images.ts                  # expect 481
grep -n '^export async function getNinaMessageImagesForMessages' lib/nina/queries/images.ts  # expect 285
wc -l lib/nina/queries/images.ts                                                       # expect 979
```

**Impact:** `images.ts` compiles standalone against the Step 1 imports; `tsc` proves the import
list is exactly sufficient.

### Step 3: Repoint the three script line-pointer comments

**File:** `scripts/nina-dedupe-media.mjs:60`
**Change:** the reference-gate banner cites `isBlobPathnameReferenced` by its old barrel line.
Change ONLY the citation — the prose argument is identical:

- Before: ` * \`isBlobPathnameReferenced\` (\`lib/nina/queries.ts:2073\`) is the one reference-checked delete in`
- After: ` * \`isBlobPathnameReferenced\` (\`lib/nina/queries/images.ts:859\`) is the one reference-checked delete in`

**File:** `scripts/nina-dedupe-plan.mjs:71`
**Change:**

- Before: `/** F37's predicate, verbatim: \`isOriginalPhoto()\` in \`lib/nina/queries.ts:1812\`. */`
- After: `/** F37's predicate, verbatim: \`isOriginalPhoto()\` in \`lib/nina/queries/images.ts:481\`. */`

**File:** `scripts/nina-dedupe-plan.mjs:93`
**Change:**

- Before: ` *      rows written in one statement (\`lib/nina/queries.ts:1757\`), and the only step that makes`
- After: ` *      rows written in one statement (\`lib/nina/queries/images.ts:285\`), and the only step that makes`

(All three old line numbers were already stale at HEAD — 2073 vs actual 2371, 1812 vs 1993,
1757 vs 1797 — noted in the plan index Decisions; the repoint makes them true. If Step 2's grep
returned different landing lines, use those.)

**Impact:** the scripts' operator-facing prose stays true; no logic changes; `node --check`
still passes (comments).

### Step 4: Delete the moved span from `lib/nina/queries.ts` and prune its imports

**File:** `lib/nina/queries.ts` (post-Phase-3 coordinates; anchored by content, not numbers)
**Change:** two edits.

**(i) Delete the span:** from the blank line above the §5 banner through
`updateNinaChatPhotoDescription`'s closing brace — at HEAD, lines **1566–2491** (leading blank
1566, §5 banner 1567–1569, §5 body, §5a-2 banner 2107–2117, §5b banner 2199–2206, §5b body
through 2491). **Keep the blank at 2492**: after deletion exactly one blank line separates the
last surviving line above the span (§4c's closing brace, HEAD 1565) from §6's banner (HEAD
2493), matching house spacing. Content anchors: begins at the line ` * §5 Images` (with its
`====` borders), ends at the line before ` * §6 Memory`.

**(ii) Prune the import block — member-level, additive to whatever phase 3 left:**

1. drizzle-orm: remove `notExists` (measured: zero occurrences in HEAD 2493–4573; its only code
   use was `generatedChatPhotoScope` at :2084). Every other member stays — including
   `asc`, `isNotNull`, `or`, `type SQL` (used by §12 / §9b's `folderSubtree`) and `PgColumn`
   (drizzle-orm/pg-core — used by `folderSubtree` at :3290).
2. `@/lib/db/schema`: remove `type NinaImageKind` (only use was `findNinaSignedOriginals`
   :1908). `ninaAvatars`, `ninaMessageImages`, `ninaMessages` STAY (used by §9/§9b/§10b/§12).
3. `@/lib/nina/album`: remove `NINA_CHAT_PHOTO_PAGE_SIZE` (only use :2162). The three
   `NINA_ADMIN_*` members STAY (§9b :2830–2930 region).
4. `@/lib/nina/perceptual`: delete the whole statement (both members' only uses were
   :1654–1655).
5. `@/lib/photos/contentHash`: delete the whole statement (`isValidContentHash`'s only code use
   was :1645; :1839–1843 is prose).
6. Phase 1's `./queries/shapes` import-back: remove `NinaImageInsert`, `NinaImageRow`,
   `NinaMediaPage` (zero occurrences in HEAD 2493–4573). All other shape members stay.
7. Phase 1's `./queries/columns` import-back: remove `imageColumns` (after this phase its only
   barrel occurrence is the docstring title at :4448 — prose). `avatarColumns` STAYS (§9/§9b).

Do not otherwise restructure any import statement.

**Impact:** `queries.ts` loses 926 lines net of the Step 5 additions. `tsc` fails on a wrongly
kept-but-unused member (eslint unused-vars) or a wrongly-pruned one — that symmetry is the gate.

### Step 5: Add the barrel re-export, the import-back, and the two snapshot names

**File:** `lib/nina/queries.ts`
**Change:** two additions.

(1) Join the barrel block as its fourth `export *` line, in dependency order (after
`export * from './queries/messages'`):

```ts
export * from './queries/images'
```

(2) In the import block's relative-import group (after the `./queries/…` lines phases 1–3
added):

```ts
import { countNinaChatPhotos, generatedChatPhotoScope } from './queries/images'
```

**File:** `lib/nina/queries.test.ts` (phase 1's barrel name-freeze)
**Change:** the frozen value-export name set gains exactly two names — `isOriginalPhoto`,
`generatedChatPhotoScope` — with a one-line comment citing the plan index Decisions
(internal-shared helpers surfacing through `export *`). Locate the set phase 1 froze
(`grep -n "Object.keys\|toEqual(\[\|toMatchInlineSnapshot\|export" lib/nina/queries.test.ts`)
and extend it in place; if phase 1 used an inline snapshot, regenerate with
`npx vitest run lib/nina/queries.test.ts -u` and check `git diff` on the snapshot adds exactly
the two names. No other name changes: all 18 moved functions + `NinaChatPhotoBlobPatch` were
already exported and re-export under identical names; the frozen set grows by exactly two.

**Impact:** the barrel's export surface changes only by the two documented additions; the 14
importers, the scripts' by-name contracts and every `vi.mock` stay untouched. `tsc` resolves
§10b's calls at (post-move) barrel lines; without the import-back they fail.

### Step 6: Repoint the `generatedChatPhotoScope` source-slice test

**File:** `tests/nina.imageprefs.test.ts:566`
**Change:** the slice's source path — the function's text moved:

- Before: `    const source = readSource('lib/nina/queries.ts')`
- After: `    const source = readSource('lib/nina/queries/images.ts')`

**File:** `tests/nina.imageprefs.test.ts:567`
**Change:** the slice anchor — Step 2(b) added the `export ` keyword:

- Before: `    const fn = source.slice(source.indexOf('\nfunction generatedChatPhotoScope(userId: string) {'))`
- After: `    const fn = source.slice(source.indexOf('\nexport function generatedChatPhotoScope(userId: string) {'))`

Nothing else in the test changes: the slice end (`fn.indexOf('\n}\n')`) and all four assertions
(`notExists(`, `ninaAvatars.sourceKey`, `'chat-photo:'`, `isOriginalPhoto()`) hold verbatim
against the moved text (verified against HEAD :2067–2086). The sibling test at :546–547 (the
`listNinaPhotoReferences` slice) is NOT this phase's — it still reads `lib/nina/queries.ts`,
where §10b remains until phase 7 repoints it.

**Impact:** without this step the phase's own gates fail — the test reads a barrel that no
longer contains the anchor text.

### Step 7: Gates

Run, in order:

```sh
npm run typecheck
npx vitest run lib/nina components/nina tests/nina.imageprefs.test.ts tests/nina.photoRefs.test.ts tests/nina.attachTargets.test.ts tests/nina.chatDedupe.test.ts tests/nina.chatPhotoReattach.test.ts tests/nina.galleryDelete.test.ts tests/nina.photoOrphans.test.ts
npx eslint lib/nina scripts
npx prettier --check lib/nina/queries.ts lib/nina/queries/images.ts scripts/nina-dedupe-media.mjs scripts/nina-dedupe-plan.mjs tests/nina.imageprefs.test.ts lib/nina/queries.test.ts
```

(`npm run typecheck` = `next typegen && tsc --noEmit` — vitest does not typecheck; this is the
net that catches every missed import-back or wrong prune. The named `tests/` files are the
suites whose subjects live in the moved span: imageprefs slices this phase's repointed source;
photoRefs asserts `generatedChatPhotoScope`'s generated SQL (`ADOPTED_SKIPPED`) through the
barrel; attachTargets/chatDedupe exercise `findNinaImageByContentHash`; chatPhotoReattach and
photoOrphans exercise `adoptNinaMessageImage`/the orphan path; galleryDelete the remove path.
Do NOT run `npm run format` — repo-wide.)

## Verification

**Byte-proof of the move (R4/R11 evidence):**

```sh
git show HEAD:lib/nina/queries.ts | sed -n '1567,2491p' | diff - <(tail -n +55 lib/nina/queries/images.ts)
```

(`55` = Step 1's 54 header lines + 1; adjust to the actual first body line if the header's
physical line count shifted.) The expected diff is exactly the four replacements (a)–(d) —
nothing else. Additionally:

```sh
grep -c "from '@/lib/nina/queries'" lib/nina/queries/images.ts   # expect 0 (cycle rule)
grep -n '§5 Images\|§5a-2\|§5b' lib/nina/queries.ts              # expect no hits
grep -c '^export \*' lib/nina/queries.ts                         # expect 4 (shapes, sessions, messages, images)
grep -n 'notExists\|NinaImageKind\|NINA_CHAT_PHOTO_PAGE_SIZE\|isValidContentHash\|normalizeClaimed' lib/nina/queries.ts  # expect no hits
grep -cn 'imageColumns' lib/nina/queries.ts                      # expect hits only on comment lines (HEAD :4448)
grep -n "queries.ts:20\|queries.ts:17\|queries.ts:18" scripts/nina-dedupe-media.mjs scripts/nina-dedupe-plan.mjs  # expect no hits
node --check scripts/nina-dedupe-media.mjs && node --check scripts/nina-dedupe-plan.mjs
```

**Build/typecheck:** `npm run typecheck` (Step 7).
**Tests:** the Step 7 vitest line — must include `lib/nina/queries.test.ts` green with the
two-name extension, and `tests/nina.imageprefs.test.ts` green on the repointed slice.
**Manual check:** `git diff --stat` shows exactly the six files; no change under any
`*/.workflows/plan/` or `docs/plans/archive/` path; `scripts/*.mjs` diffs are one line each
(two in the plan script).

**Exit criteria:** all gates green; the byte-proof diff is exactly (a)–(d); `images.ts` exports
exactly the 19 symbols; the barrel surface grew by exactly `isOriginalPhoto` +
`generatedChatPhotoScope`; the script comments cite `lib/nina/queries/images.ts`. Commit once,
pathspec limited to `lib/nina/queries.ts lib/nina/queries/images.ts lib/nina/queries.test.ts
scripts/nina-dedupe-media.mjs scripts/nina-dedupe-plan.mjs tests/nina.imageprefs.test.ts`,
and read the `--stat` (~1010 insertions / ~945 deletions).

## Handoffs

- **Phase 7 (imageprefs):** `queries/images.ts` exports `countNinaChatPhotos`,
  `generatedChatPhotoScope`, `isOriginalPhoto` under today's exact names — its planned import
  (`import { countNinaChatPhotos, generatedChatPhotoScope } from './images'`) lands unchanged;
  it does not import `isOriginalPhoto`, which is fine (the export exists per the index
  Decision). The barrel fixup import this phase added becomes deletable when §10b moves — phase 7
  deletes the whole barrel import block anyway. Phase 7 repoints
  `tests/nina.imageprefs.test.ts:546` (still reading `lib/nina/queries.ts` — true until §10b
  moves).
- **Phase 8 (stale-pointer sweep — this module's two, both moved byte-identical):** in
  `lib/nina/queries/images.ts`, `generatedChatPhotoScope`'s docstring cites
  `removeNinaSession`'s `(:1025-1030)` — the function now lives in `queries/sessions.ts`; and
  `countNinaChatPhotos`'s docstring cites `countNinaAvatars` `(:2336)` — stale already at HEAD
  (actual `:3752`, now `queries/avatars.ts`). Sweep them with phase 7's six by the same rule:
  repoint, never reword the argument.
- **Phase 8 (readmes):** `queries.ts` shrinks by ~926 lines this phase (to ~2.4k); date-stamp
  any stated counts. The `lib/nina` readme's image-domain prose may name the new module.
- **Reconciler — index corrections (actioned 2026-09-12):** (a) the Phase-4 row's "Files: 4"
  undercounts — six files are touched (new module, barrel, barrel snapshot test, two scripts,
  one test). (b) The brief's §5 range "1568–2107" starts one line late — the banner opens at
  1567 (same class of off-by-one phase 2 recorded for §3). (c) New-module header order —
  resolved to imports-first everywhere (phase 7's plans were aligned to this phase's pattern).
  (d) The barrel block counts `export *` lines only: after this phase there are FOUR
  (shapes, sessions, messages, images) — `./queries/columns` is imported, never re-exported.
- **Phase 8 or readme pass (optional, R7-adjacent):** `listNinaMediaPhotos`'s docstring (now
  `images.ts:630` region) says "Modelled on `listNinaChatPhotos` above" — that function no
  longer exists anywhere (surface-merge casualty). Left byte-identical here (stale at HEAD =
  historical); a sweep may annotate it.

## Rollback

One commit contains the whole phase. `git revert <phase-commit>` restores `queries.ts`, the
barrel snapshot, the three script/test pointer lines exactly and removes `images.ts`. Without
the commit: `git checkout HEAD -- lib/nina/queries.ts lib/nina/queries.test.ts
scripts/nina-dedupe-media.mjs scripts/nina-dedupe-plan.mjs tests/nina.imageprefs.test.ts &&
rm lib/nina/queries/images.ts`. No migrations, no data, no other files touched.
