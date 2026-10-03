# Plan: Profile pictures always point at the real Media file

**Slug:** profpic-pointer-sync
**Date:** 2026-10-03 14:33 (+07)
**Analysis:** `20261003-143305-P7Q2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/profpic-pointer-sync`
**Branch:** `feature/profpic-pointer-sync` (base: `origin/main` @ `d4491e5`)
**Phases:** 3
**Status:** phase 2/3 complete — phases 1 and 3 done; phase 2 (`P1-NIN-A060`) unblocked
**Coordinator:** —

---

## Why

> every photo in /nina/about Foto profil must point to a certain real image file in the Media or other places.
> check the current nina's profile picture. it should be the same with https://runins.site/admin/nina?view=media&image=jWWu8vkl09fT
> but turns out the photo is different. this is the old photo before i replaced it manually.
> the sequence:
> 1. i replaced jWWu8vkl09fT in /admin/nina?view=media (v1 -> v2)
> 2. i set jWWu8vkl09fT (v2) as the profile picture (by clicking the set as profpic icon)
> 3. i checked /nina/about . but the profpic showed still the v1
>
> ---
>
> i am afraid this bug causes us to consume much more harddisk space. if the photo has been replaced, then the v1 file must be deleted permanently.
> there is another possibility that this is a local cache problem (cache in my xsmax safari, or in desktop browsers). but i don't think this is the case.

**Root cause (confirmed on production rows, not a browser cache):** the current avatar
`Daofejusg4Xa` is a *legacy copy*. It was made on 2026-09-14, before the pointer design, as its own
`avatar-…` object with `source_key 'chat-photo:jWWu8vkl09fT'` and `source_image_id NULL`. Adoption
looks the row up by `source_key` and only re-currents what it finds, so step 2 put v1 back on. There
are also 21 legacy copies (8.9 MB), 11 stale pointers and 13 stale image→image chat references, plus
7 image→avatar chat references that become stale the moment their album row is repaired. Every one of
them keeps a replaced file alive, because the blob release sees "still referenced".

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Every photo in `/nina/about` → Foto profil points at one real image file (Media or elsewhere) — no detached copies | 1, 2, 3 |
| R2 | Replace a Media photo, set it as profile picture → `/nina/about` shows the new version | 1, 3 |
| R3 | A replaced photo's old file is permanently deleted — storage does not grow | 2, 3 |

## Scope

**In scope:**
- Adoption (admin Media pane and Nina's chat tool) turns a legacy copy or stale pointer into a fresh
  pointer, then releases the object it stopped naming.
- Replace (Media, album original, Photoshop) moves every dependent row to the new bytes in one
  `db.batch`, then releases the old object. This adds the release that Photoshop replace lacks.
- A one-off production repair script for the existing 21 legacy copies, 11 stale pointers, 13 stale
  image→image references and 7 cascading image→avatar references, with the freed objects deleted.

**Out of scope:**
- The read-side redirect in `resolveNinaAvatarLinkedText` / `/admin/nina` stays as it is. It is
  harmless and redundant once the columns are correct.
- No schema migration. No change to `isBlobPathnameReferenced`'s reference definition.
- Album thumbnails for pointers (none are generated today).

## Invariants

1. The tree passes `npm run typecheck`, `npm run lint`, `npm test` and all seven `ci:*` guards at the end of every phase.
2. **Row first, blob second.** No object is deleted while any row names it. Every delete goes through `releaseBlobIfUnreferenced` (TS) or the same six-column check (the script).
3. Multi-row writes that must agree are one `db.batch` (neon-http; `db.transaction()` throws).
4. A pointer row (`source_image_id` set) carries the Media row's *current* `blob_url/pathname/width/height/bytes`, and NULL `description/search_keywords/negative_search_keywords/description_embedding`. Every writer that makes a row re-show new bytes uses the one column contract in Decisions D1 (pointers) and D2 (references).
5. Drizzle/`db` stays inside `lib/nina/queries/*` (`ci:data-layer-guard`).
6. A row's `id`, `is_current`, `folder` and `source_key` survive a relink. The current photo never drops to zero.
7. Phase 3's script defaults to dry-run. `--apply` writes a JSON backup of every row it changes before it changes anything.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✓ | Adoption relinks legacy copies and stale pointers | R1, R2 | `lib/nina`, `lib/admin` | 7 | — | NORMAL | `.workflows/plan/profpic-pointer-sync/phase-1.md` | `P1-NIN-A059` | — |
| 2 | Replace propagates to dependents and frees the old file | R1, R3 | `lib/nina`, `lib/admin` | 12 | 1 | HARD | `.workflows/plan/profpic-pointer-sync/phase-2.md` | — | — |
| 3 ✓ | Repair existing production rows and delete freed files | R1, R2, R3 | `scripts` | 3 | — | NORMAL | `.workflows/plan/profpic-pointer-sync/phase-3.md` | `P1-SC-A004` | — |

**Requirement map (final):** R1 → 1, 2, 3 · R2 → 1, 3 · R3 → 2, 3.

**Worktree setup (all three phases):** the worktree has no `node_modules` and no `.env.local`.
Each phase symlinks both from `/home/miftah/run-insights` with `[ -e … ] || ln -s …` guards (the
lockfiles are byte-identical at `d4491e5`). Both paths are git-ignored; never `git add -f` them,
and stage files by name. Node: `export PATH=/home/miftah/tools/node-v24.20.0-linux-x64/bin:$PATH`.

**Shared files:** `lib/nina/queries/avatars.ts` and `lib/admin/ninaAlbumAvatarActions.ts` are
edited by Phase 1 then Phase 2, in disjoint regions; Phase 2's plan quotes them post-Phase-1.
`lib/nina/queries.test.ts` and `lib/nina/queries/shapes.ts` are Phase 1's only. Phase 3 touches only
`scripts/nina-profpic-pointer-repair.mjs`, `package.json` and `tests/nina.profpicPointerRepair.test.ts`
— no overlap, so it can run in parallel with Phases 1–2.

### Phase 1 — Adoption relinks legacy copies and stale pointers
**Satisfies:** R1, R2
**Owns:** `relinkNinaAvatarToImage` (new, `lib/nina/queries/avatars.ts`, after `getNinaAvatarBySourceKey`)
with the D1 pointer SET list, returning the refs it stopped naming; `NinaAvatarRelinkSource` /
`NinaAvatarRelinkResult` (`shapes.ts`); `refreshAdoptedNinaAvatar` (new `lib/nina/avatarRelink.ts`),
which relinks a stale `source_key` hit then releases the dropped object and thumb; the relink branch
in `setChatPhotoAsAvatarAction` and `adoptNinaChatPhotoAsAvatar` (`changed: true` when bytes swapped);
the barrel allowlist line; `tests/nina.avatarRelink.test.ts`.
**Does not touch:** `updateNinaChatPhotoBlob`, `updateNinaAvatarBlob`, `replaceNinaAvatarAction`,
`photoshopResolve.ts`, scripts, `package.json`. Moves no `nina_message_images` row (D4).
**Exit criteria:** adopting a Media photo whose `source_key` row is a legacy copy or stale pointer,
from either path, yields the same row id rewritten under D1; the dropped object and thumbnail are
passed to `releaseBlobIfUnreferenced` after the UPDATE; typecheck, lint, format, `npm test`, seven
guards and knip are green.

### Phase 2 — Replace propagates to dependents and frees the old file
**Satisfies:** R1, R3
**Owns:** `updateNinaChatPhotoBlob` as one gated `db.batch` of 4 (Media row; pointers under D1;
image→image references under D2; references re-showing a pointer of this original under D2);
`updateNinaAvatarBlob` as one gated `db.batch` of 2 (album row, now also nulling its thumb pair;
its `source_avatar_id` references under D2); `replaceNinaAvatarAction` releasing the old thumbnail;
`resolvePhotoshopReplace` reading before writing and releasing after; docstrings in
`chatPhotoActions.ts`; the two existing single-statement tests moved to the batch shape; new
`tests/nina.replacePropagation.test.ts`, `tests/nina.photoshopResolve.test.ts`,
`tests/integration/replacePropagation.int.test.ts`.
**Does not touch:** adoption code and `relinkNinaAvatarToImage` (Phase 1), `queries.test.ts`,
`shapes.ts`, scripts, `package.json` (Phase 3), `isBlobPathnameReferenced`, `releaseBlobIfUnreferenced`.
**Exit criteria:** both writers issue exactly one batch (4 / 2 statements) with the D1/D2 SET lists
and the gate pinned by tests; after the batch the release on the old object returns `'deleted'`;
Photoshop replace reads, writes, resolves, then releases object and thumb; typecheck, lint, format,
`npm test`, seven guards and knip are green.

### Phase 3 — Repair existing production rows and delete freed files
**Satisfies:** R1, R2, R3
**Owns:** `scripts/nina-profpic-pointer-repair.mjs` (raw SQL via `@neondatabase/serverless`, `del`
via `@vercel/blob`, pure planner + I/O `main()`, dry-run default, backup JSON outside the repo before
any write, one `sql.transaction`, release after commit through the six-column + jsonb check), the
`nina:profpic-pointer-repair` npm script, and `tests/nina.profpicPointerRepair.test.ts`. It writes
D1 for legacy relinks and stale pointers and D2 for references, resolving image→avatar references
against post-repair bytes. The phase runs dry-run, checks the counts (expected **21 / 11 / 13 / 7**,
0 skipped; lower is fine, higher stops), runs `--apply` unattended (D5), then re-runs dry-run and
expects zeros.
**Does not touch:** any `lib/` or `app/` code.
**Exit criteria:** the second dry run prints 0 / 0 / 0 / 0 / 0 skipped and `Daofejusg4Xa → media
jWWu8vkl09fT blob_url MATCHES`; the apply printed `failed 0`; the backup sits outside the repo;
`git status` shows only the phase's three files; tests, typecheck, lint, format and knip are green.

## Post-merge handoff

- **Re-run the repair after deploy (D6).** Owner: the completion step / the user. Once `main` with
  Phases 1–2 is live on Vercel, run `npm run nina:profpic-pointer-repair` (dry run) from the main
  checkout. All zeros means done. Otherwise run it with `--apply --backup <path outside the repo>`.
- **Docs.** `docs/architecture.md` (replace data flow, adoption refresh) and `CHANGELOG.md`.
- **Follow-up cards (no R owns them):** copy the re-described original's prose onto its references
  after a replace (Phase 2 handoff); the admin path does not re-announce an already-current relinked
  avatar (Phase 1 handoff); an album original's own crop after a replace with new dimensions
  (Phase 2 handoff); 13 references with NULL dims but the correct pathname (Phase 3 handoff).

## Reconciliation Log

| # | Conflict | Class | Resolution |
|---|---|---|---|
| 1 | Pointer SET list differed: Phase 2 statement 2 left prose/keywords/embedding and the thumb pair untouched; Phase 3 `refresh-pointer` left prose untouched; Phase 1 nulled both | Contract drift | One contract (D1). Phase 2 statement 2 and Phase 3 `refresh-pointer` gain the NULLs; Phase 2's "member 2 never touches prose" test replaced by a test pinning the NULLs |
| 2 | Reference SET list differed: Phase 2 nulled `description` and left `perceptual_*`; Phase 3 copied `perceptual_*` and left `description` | Contract drift | One contract (D2): a reference mirrors its target's post-write `content_hash`, `description`, `perceptual_*`. Phase 2 adds `perceptual_* = NULL` to statements 3/4 and the album batch's statement 2; Phase 3 loads and copies `description`. Tests updated in both |
| 3 | `lib/nina/queries/avatars.ts` edited by Phases 1 and 2; Phase 2 quoted pre-Phase-1 line numbers and a conditional import merge | File collision | Phase 2 now states Phase 1's exact edits (+2 in the `./shapes` import, insertion below `updateNinaAvatarBlob`), quotes the import blocks as post-Phase-1 text, and locates the function by name |
| 4 | `lib/admin/ninaAlbumAvatarActions.ts` edited by Phases 1 and 2 | File collision | Disjoint regions confirmed (Phase 1: import, `RE-ADOPTION` docstring, `setChatPhotoAsAvatarAction` body; Phase 2: `replaceNinaAvatarAction`). Phase 2 quotes post-Phase-1 numbering (~+4) and locates by name |
| 5 | Barrel allowlist / `shapes.ts` possibly shared | File collision | Checked: only Phase 1 adds a barrel name and shapes. Phase 1's "reconciler merges" caveat replaced by the confirmed fact |
| 6 | Phase 3 vs Phases 1–2 files | File collision | None: Phase 3 edits only `scripts/`, `package.json`, its own test |
| 7 | Index counts said ≤21 / ≤11 / ≤13 and missed the 7 cascading image→avatar references Phase 3 found | Gap | Index scope, Why and Phase 3 summary now state 21 / 11 / 13 / 7 |
| 8 | Phase 1's relink of a legacy copy leaves its `source_avatar_id` chat references on the copy's object | Gap | Decided not to widen Phase 1 (D4); Phase 3's planner heals it in either run order; recorded in Phase 1 Handoffs |
| 9 | Worktree setup (node_modules / `.env.local` symlinks) stated only by Phase 3 | Unmet assumption | Same guarded setup and "never commit the links" rule added to Phases 1 and 2 and to the index |
| 10 | Phase 3 asked to re-run "once Phases 1–2 are live on Vercel", which no phase session can observe | Ordering violation | Moved to a post-merge handoff (D6); Phase 3's in-session sequence is unchanged |
| 11 | Phase 2 Step 6 (album Replace) and Phase 2 statement 4: confirm Phase 1 does not conflict | Duplicate work check | No overlap: Phase 1 moves no reference rows and never edits `updateNinaAvatarBlob`; both kept for R3 (D4) |
| 12 | Phase 1 Step 4a anchored on line 26; the `releaseBlobIfUnreferenced` import is line 25 | Contract drift (minor) | Anchor fixed to the import text |

## Decisions

| # | Fork | Chosen | Rung |
|---|---|---|---|
| — | Fix staleness on the read side (redirect every runner read) or the write side (sync columns on replace/adopt) | Write side. A read-side redirect leaves the old pathname in the row, so `isBlobPathnameReferenced` keeps v1 alive forever and R3 fails | 5: user's raw input ("v1 file must be deleted permanently") |
| — | Do chat references (`source_image_id`/`source_avatar_id` on `nina_message_images`) follow a replace of their original? | Yes. They are by definition re-shows of it, and leaving them pins the old object | 5: user's raw input (R3) |
| — | A pointer's crop when the new bytes have different dimensions | Set it to NULL (identity, always covers the circle). Same dimensions keep the crop | 6: convention — `cropForWrite` treats identity as NULL, `clampCrop`'s guarantee needs the real dims |
| — | A legacy copy's own description/keywords/embedding/content_hash/thumb on relink | Dropped. The row becomes a pointer, and the Media row holds the prose (`avatarPointer.ts` doctrine). The thumb object is released | 1: invariant 4 |
| D1 | The pointer column contract — what a `nina_avatars` row that re-shows a Media row's new bytes gets, across Phase 1 relink, Phase 2 propagation, Phase 3 repair (Phase 2/3 drafts left prose and/or thumbs untouched) | `blob_url, pathname, width, height, bytes` ← target; `source_image_id` ← target id; NULL `description, search_keywords, negative_search_keywords, description_embedding, content_hash, thumb_url, thumb_pathname`; crop NULL iff dims differ. Phase 2 cannot release a pointer's thumb from inside the batch; pointers carry none by construction (only the folder upload writes thumbs, on originals), so the NULL changes zero rows and any freak orphan is the reaper's | 1: invariant 4 (prose NULL) + Phase 1's code block for the rest; `avatarPointer.ts` states pointer prose is "NULL forever" |
| D2 | The reference column contract — `content_hash`, `perceptual_*`, `description` on a `nina_message_images` re-show (Phase 2 nulled description and kept perceptual; Phase 3 copied perceptual and kept description) | A reference mirrors its target's **post-write** values: bytes, `content_hash`, `description`, `perceptual_*` (NULL for an album target). In Phase 2 that resolves to new hash + NULL description/perceptual (statement 1 just nulled the original's); in Phase 3 it copies the described original's prose, so the 13 + 7 repaired references get true prose instead of v1 prose or a placeholder | 6: convention — readers read a reference's OWN `description` with no provenance redirect (`gateway.ts` history read: "a re-show carries its own copied description"; `send.ts`, `turnrevive.ts`), references are born by copying the target's (`resolveAttachment`), and both byte-swap writers refuse old prose on new bytes (`updateNinaChatPhotoBlob`, D-P2-1). The twin scan reads perceptual only on originals (`isOriginalPhoto()`), so the pair on references is inert either way |
| D3 | Do Phase 2's statement 4 (references re-showing a pointer of the replaced original) and `updateNinaAvatarBlob`'s thumb nulling stay? | Keep both. Without them those rows/thumbs keep naming the old object and the release answers `'shared'` | 5: user's raw input (R3) |
| D4 | Does Phase 1's adoption relink also move the relinked row's chat references? | No. Phase 1 stays one `UPDATE … RETURNING`; the release answers `'shared'` for an object those references still name (safe direction). Phase 3's planner treats the relinked row as a pointer and moves the references, in either run order; after Phase 3 no legacy copy remains for Phase 1 to meet, and Phase 2's statement 4 covers pointers from then on | 2: exit criteria — Phase 1's exit criteria are about the album row; Phase 3's (0 stale references) close the gap |
| D5 | Does Phase 3 run `--apply` against production unattended? | Yes, after a dry-run whose counts match 21 / 11 / 13 / 7 (lower is fine, higher or any skip stops), with a JSON backup of every changed row outside the repo. Deleting the freed files is exactly what R3 asks for | 5: user's raw input |
| D6 | Phase 3 "re-run after Phases 1–2 are deployed" — a phase step or a handoff? | Handoff. Deploy happens after the set merges, after every phase session ends; Phase 3 runs its sequence in-session and the post-deploy dry run (then `--apply` only if non-zero) is the completion step's / user's | 2: exit criteria — Phase 3's exit criteria are all in-session observable |

## Open Questions

(none)

## Rollback

- Phases 1–2: `git revert` the phase commit. Columns written by the new code are valid under the old code.
- Phase 3: the backup JSON restores row columns (`UPDATE … SET` from the file). Deleted Blob objects
  cannot be restored. Only objects that no row named after the repair are deleted, so nothing
  visible breaks.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f PROFPIC_POINTER_SYNC_PLAN.md --phase 1

Or run the whole set as a swarm:

    /analyze-orchestrator -f PROFPIC_POINTER_SYNC_PLAN.md
