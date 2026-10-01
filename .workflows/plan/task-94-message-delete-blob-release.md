# task-94 — a deleted message must release the bytes nothing else names

**Card:** [#94](https://github.com/miftahulmahfuzh/run-insights/issues/94) — *BUG: deleting an
avatar can blank a chat photo that shares its blob*
**Round 1 · 2026-10-01 · branch `task/94-bug-deleting-an-avatar-can-blank-a-chat`**

---

## What the card asked for, and what is left of it

The card named **two sites** and a closing note. Measured on `main` @ `73ce323`, two of the three
are already closed — by work that landed after the card was filed, which is why this plan starts
with an audit rather than a fix.

| The card's item | State on `main` today |
|---|---|
| **Site 1** — `deleteNinaAvatarAction` deletes the blob unconditionally | **Already fixed.** It now moved to `lib/admin/ninaAlbumAvatarActions.ts:388` and routes both objects through `releaseBlobIfUnreferenced` (`:412`, `:422`), after `promoteNinaAvatarDependents`. |
| **Site 2** — `lib/nina/messageActions.ts` logs orphaned pathnames and deletes no bytes | **Still live.** `removeNinaMessage` still ends at a `console.warn` listing the pathnames. This is the whole of this round's work. |
| **The note** — `scripts/blob-reap.mjs` does not know the `nina/` prefix | **Already fixed**, and the card's own newest comment says so: `2c1e7ba` taught the reaper `nina/`, counting references over rows. Verified: `scripts/blob-reap.mjs:94` registers the prefix, `:46-47` enumerate all six reference columns. |

So the deliverable is one function, its three stale docstrings, and a test.

## The behaviour being fixed

`removeNinaMessage` deletes one bubble. `deleteNinaMessage` deletes that bubble's
`nina_message_images` rows in the same transaction (deliberately — `ON DELETE SET NULL` would
otherwise leave a floating photograph, which is the *session* delete's wanted behaviour, not the
bubble's). The rows go; the Blob objects stay forever.

That is the **safe** direction of the card's bug — nothing is lost, bytes accumulate — which is
why it was logged rather than fixed at the time. The cost is real anyway: every photograph the
runner ever deleted with its bubble is still paid for, and `reap-orphaned-blobs` is a manual
sweep, not a write-time rule.

## The approaches

**A — adopt the repo's full three-step chat-photo delete sequence. ← chosen**
`promoteNinaImageDependents` → `deleteNinaMessage` → `releaseBlobIfUnreferenced` per distinct
pathname. Exactly what `deleteNinaChatPhoto` (`lib/nina/albumActions.ts:213`) and
`removeChatPhotoAction` (`lib/admin/chatPhotoActions.ts:697`) already do, in that order, for the
same table.

- **Convention** — it is not a new rule, it is the existing one applied at the one delete path
  that skipped it. `promoteNinaImageDependents`' own docstring names this caller in advance:
  *"Call it immediately before `deleteNinaMessageImage` (or before the `deleteNinaMessage` that
  takes the row with it), never after."*
- **Scope** — one function, three comment blocks that currently assert the opposite, one test file.
- **Verifiability** — the collaborators mock at the edges, which is how
  `tests/nina.galleryDelete.test.ts` proves the identical sequence for the sibling action.
- **Reversibility** — one commit, and every failure path inside the two helpers already degrades
  to today's behaviour rather than throwing.

**B — release only; skip the promotion.** Smaller, and loses on Convention. The repo documents
promote-then-delete-then-release as one unit across three files; adopting half of it is adopting a
*different* rule, not the "one definition" the card asked for. It would also leave a ghost-photo
mint (an unmeasured dependent that no dedup pass can ever match) on the exact line being edited,
in the one delete path `lib/nina/provenancePromotion.ts` claims to cover.

**C — push the release down into `deleteNinaMessage`,** so every caller gets it free. Rejected on
correctness, not taste: `lib/nina/queries/*` is the data layer and a network `del()` does not
belong behind `ci:data-layer-guard`'s boundary — and more decisively, `removeNinaSession` shares
that FK and must **not** release, because a deleted session deliberately keeps its photographs.
A rule pushed down there would have to be conditional on its caller, which is the rule not being
pushed down.

## Decisions inside A

**Every object is asked about, including a pointer row's.** A row with `source_image_id` /
`source_avatar_id` set copied its `blob_url` and `pathname` from a keeper and owns no bytes.
`deleteNinaAvatarAction` skips the question for a pointer as a measured optimisation; this path
does not, following `deleteNinaChatPhoto` instead. Asking is *correct* either way —
`isBlobPathnameReferenced` sees the keeper, answers `shared`, the object is kept — and a bubble
holds a handful of rows, not the hundreds that made the skip worth arguing for in the album.

**Grouped by pathname, one question per object.** A bubble can show the same photograph more than
once (`provenancePromotion` groups for this reason). Without grouping, the second release asks
about bytes the first just deleted and then `del`s them again.

**The pre-read is the handle, and that is forced.** `deleteNinaMessage` deliberately does not
surface its image delete's rows (*"a return value nothing consumes is a promise this set has not
made"*), so unlike `deleteNinaChatPhoto` the release cannot be fed from the DELETE's return. The
read already exists — it is what the log was built on — and it is owner-scoped. The contract is
still honoured: `releaseBlobIfUnreferenced` requires only that the caller's own reference is
**gone by the time it is asked**, and those rows are deleted inside the transaction above it.

**The release cannot fail the delete.** `releaseBlobIfUnreferenced` catches both its reference
check and its `del`, returning `'shared'`/`'failed'`, so no path through it rejects. The message
is already gone when it runs; reporting `failed` for a message that *was* deleted would be the
one genuinely wrong outcome.

**The log is replaced, not kept.** `"a deleted message left blobs with no row pointing at them"`
becomes false the moment this lands, and the helper logs `shared` and `failed` itself.

## Ambiguity calls (the narrower reading, and what lost)

1. **"Worth folding in" (the reaper note).** Could be read as *extend `scripts/blob-reap.mjs`*.
   The card's own newest comment retracts that paragraph — `2c1e7ba` landed it — so the narrow
   reading is **verify and report**, which is what this plan does. Nothing in `scripts/` changes.
2. **`removeNinaSession` is not touched.** It shares the FK and the hazard shape, and the card
   does not name it. The wider reading would be actively wrong: `ON DELETE SET NULL` on
   `message_id` exists *so that* a deleted session leaves its photographs standing, and those rows
   still reference the bytes.

## The changes

| File | Change |
|---|---|
| `lib/nina/messageActions.ts` | `removeNinaMessage`: promote dependents before the delete; release each distinct object after it. Imports `promoteNinaImageDependents` and `releaseBlobIfUnreferenced`. The `── THE IMAGE ROWS ARE READ BEFORE THE DELETE` block is rewritten — its closing paragraph currently asserts the bytes are left behind and that the reaper does not cover `nina/`, both now false. |
| `lib/nina/queries/messages.ts` | `deleteNinaMessage`'s doc item 2 says *"The Blob bytes are NOT deleted and nothing in this tree reaps them"* — rewritten to point at the caller that now does. |
| `lib/nina/queries/images.ts` | one pointer calling `getNinaMessageImagesForMessages`' consumer "the delete log" — now the release. |
| `tests/nina.messageDelete.test.ts` | new, modelled on `tests/nina.galleryDelete.test.ts`: order, grouping, pointer-row handling, and that a release outcome never changes the action's result. |

## Gate

The repo's own CI, read out of `.github/workflows/`: the seven guards, `format:check`, `lint`,
`typecheck`, `test`, `build`.
