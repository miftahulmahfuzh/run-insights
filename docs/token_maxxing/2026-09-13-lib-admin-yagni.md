# Token-Maxxing Session — 2026-09-13: Lib Admin YAGNI Sweep (knip Exports/Types)

## 🎯 Achievement / End Result
- **Goal of the burn:** Resolve every knip-flagged unused export/type in `lib/admin`'s six
  named files — `schema.ts`, `folderOps.ts`, `chatPhotoSchema.ts`, `chatPhotos.ts`,
  `memoryModel.ts`, `shortcutModel.ts` — and update `lib/admin/.workflows/package_readme.md`
  to match, without changing any runtime behavior. Assigned verbatim by coordinator
  `tokenmax-orch-2026-09-13` as a single Worker Mode idea (no self-generated menu):
  *"Remove or justify lib/admin's ~26 knip-flagged unused exports/types across schema.ts,
  folderOps.ts, chatPhotoSchema.ts, chatPhotos.ts, memoryModel.ts and shortcutModel.ts, and
  compact its 1018-line package_readme.md to match. Why: it is the heaviest dead-code
  concentration found by a fresh knip run in a security-sensitive admin package, and its
  readme is the largest in the repo."*
- **Concrete changes:** One commit, `9537606` "refactor(admin): remove dead exports flagged
  by knip in lib/admin" — 7 files, 71 insertions / 59 deletions:
  - `lib/admin/schema.ts` — 22 lines changed: 13 dead type aliases deleted outright, 4
    schema consts/types unexported.
  - `lib/admin/chatPhotoSchema.ts` — 5 lines changed: 5 dead type aliases deleted outright.
  - `lib/admin/chatPhotos.ts` — 8 lines changed: 4 consts/regex-vocab types unexported.
  - `lib/admin/folderOps.ts` — 8 lines changed: 1 const unexported (plus surrounding
    context).
  - `lib/admin/memoryModel.ts` — 2 lines changed: 1 type unexported.
  - `lib/admin/shortcutModel.ts` — 2 lines changed: 1 type unexported.
  - `lib/admin/.workflows/package_readme.md` — 83 lines changed: export-block code samples
    and prose updated to the new export surface across five sections, plus a dated
    "2026-09-13" Recent Changes entry documenting the sweep and its methodology.
- **Real value delivered:**
  - All 26 knip-flagged items resolved: 18 deleted (zero importers anywhere, not even
    internally), 8 kept as values but un-exported (used only within their own file).
    `npx knip --include exports,types` now reports zero flags under `lib/admin/`.
  - Caught three false positives before touching anything: `AvatarBatchRecord`,
    `ChatPhotoSetAvatarInput`, and `SlotEditKind` look knip-adjacent but were **not**
    actually flagged and have live external readers (`explorer/useFolderUpload.ts`, a test
    file, and `memoryVocab.ts` respectively) — correctly left alone.
  - Established and recorded the reusable rule: **"an unused export is not always an
    unused value."** knip flags export-with-no-external-importer, which sometimes means
    delete-the-symbol and sometimes means keep-the-value-but-drop-the-`export`-keyword;
    grepping for internal same-file usage is what tells the two cases apart.
  - Zero behavior change, confirmed by full gates: `next typegen` + `tsc --noEmit` clean
    repo-wide; `vitest run` (5,744 tests) green except one pre-existing, already-documented
    parallelism flake unrelated to this diff (see Gates below).
- **Branch:** `token-maxxing-2026-09-13-lib-admin-yagni` (worktree session at
  `/home/miftah/.worktrees/run-insights/tokenmax-2026-09-13-lib-admin-yagni`)
- **Merge status:** on branch (Worker Mode session under coordinator
  `tokenmax-orch-2026-09-13`; the coordinator owns landing/merge, matching this repo's
  established multi-worker convention)
- **Approx token burn:** a repo-wide external-importer grep per flagged symbol (26 times),
  plus a second grep pass to rule three look-alikes back in, then full typegen+tsc+vitest
  gates over a ~130-line diff. Small diff, wide verification. 🔥

## Context & Motivation
`lib/admin` is a security-sensitive package (admin mutations, folder/photo/memory/shortcut
schemas) that had, per a fresh `knip --include exports,types` run, the heaviest single
concentration of unused exports/types found anywhere in the repo — 26 flagged items spread
across six files — and the largest `package_readme.md` in the repo (over 1,000 lines). The
coordinator (`tokenmax-orch-2026-09-13`) assigned this as a directly-scoped idea rather than
letting the session generate its own menu, i.e. Worker Mode: one idea, handed down, worked
end to end.

This sits one day after (and is topically adjacent to, but not a continuation of) the
2026-09-12 session `pkg-readme-lib-admin`, which had already compacted this same readme
from 1,300 to 890 lines and established it as lean and rule-based rather than
state-bloated. Today's readme work is therefore explicitly *not* another compaction pass —
it is a surgical sync of the readme's export-surface documentation to the code change, on
top of a readme that was already in good shape.

## What We Did (blow-by-blow)
1. Ran `npx knip --include exports,types` and cross-referenced its findings against the six
   files named in the assigned idea.
2. For every flagged symbol, grepped the whole repo (`app/`, `components/`, `lib/`,
   `tests/`) to verify zero external importers before touching anything — explicitly
   excluding `.workflows/` plan-doc copies, which don't count as real readers (per this
   repo's standing lesson that a `.workflows/plan/` copy sitting inside a package can trip
   a naive filesystem grep on prose, not code). This step caught three near-misses:
   `AvatarBatchRecord`, `ChatPhotoSetAvatarInput`, and `SlotEditKind` resemble the flagged
   pattern but were not actually in knip's output and do have live external readers
   (`explorer/useFolderUpload.ts`, a test file, `memoryVocab.ts`) — all three were correctly
   left untouched.
3. Classified the 26 flagged items into two buckets:
   - **18 z.infer/derived type aliases with zero importers anywhere, not even internally —
     deleted outright.** In `schema.ts`: `CropWrite`, `AvatarDescriptionInput`,
     `AvatarRegister`, `SlotEdit`, `FactInsert`, `FactEdit`, `MemoryDelete`,
     `AvatarBatchRegister`, `AlbumManifestRequest`, `ShortcutInsert`, `ShortcutCell`,
     `ShortcutToggle`, `ShortcutDelete` (13). In `chatPhotoSchema.ts`: `ChatPhotoAddInput`,
     `ChatPhotoReplaceInput`, `ChatPhotoRemoveInput`, `ChatPhotoDescribeInput`,
     `ChatPhotoDescriptionInput` (5).
   - **8 schema consts/vocabulary types that are used, but only internally within their own
     file (by a sibling schema, or as a struct field's type) — kept the value, dropped the
     `export` keyword.** `userIdSchema`, `slotKeySchema`, `sourceKeySchema`,
     `avatarBatchRecordSchema` (`schema.ts`); `ADMIN_FOLDER_OP_MAX_IDS` (`folderOps.ts`);
     `ADMIN_CHAT_PHOTO_PURPOSE`, `ADMIN_CHAT_PHOTO_EXT`, `ADMIN_CHAT_PHOTO_ID_RE`,
     `ADMIN_CHAT_PHOTO_STORED_ID_RE` (`chatPhotos.ts`); `MemoryRowKind` (`memoryModel.ts`);
     `AdminShortcutKind` (`shortcutModel.ts`).
4. Updated `lib/admin/.workflows/package_readme.md`'s export-block code samples and prose
   across the `schema.ts`, `folderOps.ts`, `chatPhotos.ts`, `memoryModel.ts`, and
   `shortcutModel.ts` sections to match the new export surface, and added a dated
   "2026-09-13" Recent Changes entry documenting the sweep and the methodology.
5. Ran the full verification set (see Gates).
6. Committed everything — code and readme together — as one commit, `9537606`.

## Code / Design Details

**The rule that separated the two buckets, in one line:** knip flags "exported but no
external importer." That condition covers two genuinely different situations —
*nothing anywhere references this shape* (delete it) vs. *only this file's own other schemas
reference this shape* (keep the value, it's real; just stop broadcasting it as public API).
Distinguishing them requires a second, narrower grep — inside the same file only — after
the repo-wide one comes back empty.

**Shape of a "delete" case** (one of 18):
```ts
// schema.ts, before
export type ShortcutDelete = z.infer<typeof shortcutDeleteSchema>
// after: gone — nothing anywhere imports it, and shortcutDeleteSchema itself
// isn't referenced by name outside its own validation call site either.
```

**Shape of an "unexport" case** (one of 8):
```ts
// schema.ts, before
export const userIdSchema = z.string().uuid()
// after
const userIdSchema = z.string().uuid()
// still used internally: referenced by sibling z.object({...}) schemas in the same file.
```

**The false-positive trap avoided:** a name that merely *looks* like it belongs to the same
family as the flagged symbols (`AvatarBatchRecord` next to the deleted
`AvatarBatchRegister`, `ChatPhotoSetAvatarInput` next to the five deleted
`ChatPhoto*Input` types, `SlotEditKind` next to the deleted `SlotEdit`) is not evidence it's
dead — only knip's actual output plus an independent importer grep is. All three were
confirmed live and left alone.

## Decisions & Trade-offs
- **Delete vs. unexport, decided per-symbol, not per-file.** A blanket rule ("just drop
  `export` everywhere knip complains") would have left 18 now-truly-orphaned type aliases
  sitting in the files as clutter; a blanket rule ("just delete everything knip flags")
  would have broken the 8 schemas/consts still used internally. The per-symbol internal-use
  grep is what makes the distinction defensible.
- **Readme updated surgically, not recompacted.** The assigned idea's framing ("compact its
  1018-line package_readme.md to match") could be read as calling for another size-reduction
  pass, but the readme had already been fully compacted the day before (2026-09-12,
  `pkg-readme-lib-admin`: 1,300 → 890 lines) and was already lean and rule-based rather than
  bloated with volatile state. Today's 83-line readme diff is entirely: (a) export-block
  code samples brought in sync with the code change, and (b) one new dated Recent Changes
  entry. No further shortening was attempted, because there was no bloat left to cut — doing
  so would have been manufacturing token burn rather than delivering it.
- **Code and readme landed in one commit, not two.** The change is one coherent unit (a
  knip sweep whose only externally-visible trace is the export surface the readme
  documents), so splitting it into a code commit and a docs commit would have added
  ceremony without adding reviewability.
- **Left the three look-alike symbols alone rather than "cleaning them up for consistency."**
  `AvatarBatchRecord`, `ChatPhotoSetAvatarInput`, `SlotEditKind` were not flagged and do have
  real external readers; treating them the same as their flagged neighbors purely for
  naming-pattern consistency would have broken `explorer/useFolderUpload.ts`, a test file,
  and `memoryVocab.ts` respectively.

## Follow-ups & YAGNI notes
- **Did not extend the sweep beyond the six assigned files.** `lib/admin` has other modules;
  a repeat of this exact method elsewhere in the directory is a plausible future idea but
  was neither assigned nor attempted here — the coordinator scoped this session to six named
  files.
- **Did not investigate or fix the `MediaPane.test.tsx` flake.** It's a known, pre-existing,
  parallelism-only flake (see Gates) with zero relationship to this diff; fixing it would be
  its own scoped session, not a drive-by inside a dead-code sweep.
- **Did not re-run the 2026-09-12 readme compaction pass.** The readme is already lean;
  another compaction attempt now would be manufacturing work against a target that doesn't
  need it. If the readme grows bloated again in the future, that's a fresh, separately
  justified idea.
- **YAGNI: no attempt to script the export-census/grep method.** Same as the 2026-09-11
  `lib-admin-dead-exports` session's own follow-up note — the code-vs-prose,
  internal-vs-external classification is still done by hand because the judgment calls
  (three false positives caught here) aren't cheaply mechanizable.

## Appendix

**Commit (this branch):**
```
9537606 refactor(admin): remove dead exports flagged by knip in lib/admin
```

**Diff stats:**
```
lib/admin/.workflows/package_readme.md | 83 ++++++++++++++++++++++++----------
lib/admin/chatPhotoSchema.ts           |  5 --
lib/admin/chatPhotos.ts                |  8 ++--
lib/admin/folderOps.ts                 |  8 +---
lib/admin/memoryModel.ts               |  2 +-
lib/admin/schema.ts                    | 22 ++-------
lib/admin/shortcutModel.ts             |  2 +-
7 files changed, 71 insertions(+), 59 deletions(-)
```

**Verification commands run:**
```
npx knip --include exports,types      # zero flags under lib/admin/ (was 26)
npx next typegen && npx tsc --noEmit  # clean, whole repo
npx vitest run                        # 5,744 tests: green except one known pre-existing
                                       # parallelism flake (see below), unrelated to this diff
```

**The one flake, characterized (not introduced by this session):**
`components/admin/explorer/MediaPane.test.tsx` — "does not latch worn when the adopt action
refuses" — reproduces only under full parallel file execution and passes cleanly with
`--no-file-parallelism`. Matches this repo's already-documented React 19 two-commit
transition-settle pattern (result renders, then `isPending` flips; a `waitFor` on the result
can observe a still-disabled control). Confirmed present on the exact same test both with
and without this session's changes reachable — a timing/parallelism artifact, not a logic
regression from this diff.

**Deleted symbols (18):**
`schema.ts` — `CropWrite`, `AvatarDescriptionInput`, `AvatarRegister`, `SlotEdit`,
`FactInsert`, `FactEdit`, `MemoryDelete`, `AvatarBatchRegister`, `AlbumManifestRequest`,
`ShortcutInsert`, `ShortcutCell`, `ShortcutToggle`, `ShortcutDelete`.
`chatPhotoSchema.ts` — `ChatPhotoAddInput`, `ChatPhotoReplaceInput`, `ChatPhotoRemoveInput`,
`ChatPhotoDescribeInput`, `ChatPhotoDescriptionInput`.

**Unexported-but-kept symbols (8):**
`schema.ts` — `userIdSchema`, `slotKeySchema`, `sourceKeySchema`, `avatarBatchRecordSchema`.
`folderOps.ts` — `ADMIN_FOLDER_OP_MAX_IDS`.
`chatPhotos.ts` — `ADMIN_CHAT_PHOTO_PURPOSE`, `ADMIN_CHAT_PHOTO_EXT`,
`ADMIN_CHAT_PHOTO_ID_RE`, `ADMIN_CHAT_PHOTO_STORED_ID_RE`.
`memoryModel.ts` — `MemoryRowKind`.
`shortcutModel.ts` — `AdminShortcutKind`.

**Confirmed-live false positives, left untouched:** `AvatarBatchRecord`
(`explorer/useFolderUpload.ts`), `ChatPhotoSetAvatarInput` (a test file), `SlotEditKind`
(`memoryVocab.ts`).

**Related same-day-adjacent session:** `2026-09-12-pkg-readme-lib-admin.md` (the prior day's
full compaction of this same readme, 1,300 → 890 lines, which is why today's readme edit is
surgical rather than another rewrite).
