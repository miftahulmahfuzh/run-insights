import { describe, expect, it } from 'vitest'

import * as barrel from '@/lib/nina/queries'

/**
 * The barrel contract (queries-split phase 1, 2026-09-12 @ 2c823eb).
 *
 * Every consumer of the Nina layer imports from `@/lib/nina/queries`, and the split into
 * `lib/nina/queries/*` must not change what that import exposes: the 14 source importers and
 * `NinaUnreadBadge.test.tsx`'s `vi.mock` keep working untouched. This test freezes the exact
 * RUNTIME surface — the 92 exported functions below, sorted — derived mechanically from
 * `queries.ts` by a TypeScript-AST walk BEFORE any section moved. Type-only exports (the
 * file's 30 — 27 of them §1 interfaces, three riding in §5b/§12) are invisible here by
 * nature and are covered by `npm run typecheck` against the live importers.
 *
 * The four column lists in `./queries/columns` were private before the split and are
 * deliberately NOT re-exported, so they must not appear here either. The second test keeps
 * that honest from the other side: everything the barrel exposes at runtime is a function.
 *
 * If this fails because a name was ADDED, the barrel grew. That is legitimate only as a
 * documented decision — plan-index Decision 3's internal-shared helpers (phase 4 adds
 * `generatedChatPhotoScope` and `isOriginalPhoto`) being the known case — and the list is
 * updated in the same commit, sorted, with a pointer to that decision. Never weaken this to
 * a `toContain`, and never let `export *` change the surface by accident.
 *
 * admin-album-semantic-search takes it 85 → 92: four names in phase 2 (the
 * description_embedding writers) and three in phase 3 (the album's semantic search).
 */
const BARREL_VALUE_EXPORTS = [
  'adoptNinaMessageImage',
  'appendNinaMemoryFacts',
  'bumpNinaShortcutUses',
  // admin-album-semantic-search phase 2: the description_embedding writers, documented growth.
  // See `lib/nina/queries/avatarEmbeddings.ts`'s header for why they are a module of their own.
  'countNinaAvatarDescribeBacklog',
  'countNinaAvatars',
  'countNinaChatPhotos',
  'countNinaMediaPhotos',
  'countNinaTurnsSince',
  'countUnreadNinaMessages',
  'createNinaSession',
  'declareNinaFolders',
  'deleteNinaAvatar',
  'deleteNinaAvatars',
  'deleteNinaAvatarsInFolderTree',
  'deleteNinaFolderSubtree',
  'deleteNinaMemoryFact',
  'deleteNinaMemorySlot',
  'deleteNinaMessage',
  'deleteNinaMessageImage',
  'deleteNinaShortcut',
  'ensureNinaSession',
  // dup-image-push-notify phase 1: the `nina_avatars` arm of the cross-table duplicate lookup
  // (plan index R1). A documented growth of the surface, 85 -> 86, added in the same commit as
  // the query — which is what this file's header asks for.
  'findNinaAvatarByContentHash',
  'findNinaImageByContentHash',
  'findNinaSignedOriginals',
  // queries-split phase 4: internal — shared with sibling query modules (plan index Decisions),
  // surfacing through the barrel's `export *` — the set's only documented growth (83 → 85).
  'generatedChatPhotoScope',
  'getCurrentNinaAvatar',
  'getNinaAvatar',
  'getNinaAvatarBySourceKey',
  'getNinaIdentity',
  'getNinaJobPhoto',
  'getNinaJobPhotoBubble',
  'getNinaMemorySlot',
  'getNinaMemorySlots',
  'getNinaMessageImage',
  'getNinaMessageImagesForMessages',
  'getNinaMessageWindow',
  'getNinaMessagesByIds',
  'getNinaNags',
  'getNinaSession',
  'getUnannouncedCurrentNinaAvatar',
  'hasProactiveMessageForRun',
  'insertNinaAvatarAsCurrent',
  'insertNinaAvatars',
  'insertNinaMessageImages',
  'insertNinaMessages',
  'insertNinaShortcut',
  'insertNinaTurn',
  'isBlobPathnameReferenced',
  'isOriginalPhoto',
  'listNinaAvatarDescribeBacklog',
  'listNinaAvatarDescribeTargets',
  'listNinaAvatarFolders',
  'listNinaAvatarManifest',
  'listNinaAvatars',
  'listNinaAvatarsInFolder',
  'listNinaMediaPhotos',
  'listNinaMemoryFacts',
  'listNinaMessageImages',
  'listNinaMessages',
  'listNinaMessagesAfter',
  'listNinaPhotoReferences',
  'listNinaSelfieJobIdsSince',
  'listNinaSessions',
  'listNinaShortcuts',
  'markNinaAvatarAnnounced',
  'markNinaMessagesRead',
  'moveNinaAvatarsToFolder',
  'readNinaImagePrefs',
  'readNinaTuning',
  'removeNinaSession',
  'renameNinaAvatarFolder',
  'renameNinaFolderSubtree',
  'renameNinaSession',
  'resolveNinaPhotoReference',
  // admin-album-semantic-search phase 3: the album's semantic search (R2/R3/R4), documented
  // growth under this file's "a name was ADDED" rule.
  'searchNinaAvatarsByImageCaption',
  'searchNinaAvatarsByText',
  'searchNinaAvatarsByTextAndCaption',
  'setCurrentNinaAvatar',
  'setNinaAvatarDescription',
  // admin-album-semantic-search phase 2: writes prose and vector in one UPDATE.
  'setNinaAvatarDescriptionAndEmbedding',
  'setNinaMessageImageDescription',
  'setNinaSessionPinned',
  'setNinaSessionTitleIfUntitled',
  'updateNinaAvatarCrop',
  'updateNinaChatPhotoBlob',
  'updateNinaChatPhotoDescription',
  // ghost-signature fix (2026-09-15): the pathname-guarded re-sign write behind
  // `scheduleChatPhotoResign` — documented growth, argued at the function's own header.
  'updateNinaChatPhotoPerceptualSignature',
  'updateNinaMemoryFact',
  'updateNinaMessage',
  'updateNinaShortcut',
  'upsertNinaMemorySlot',
  'upsertNinaNag',
  'writeNinaImagePrefs',
  'writeNinaTuning',
]

describe('lib/nina/queries barrel contract', () => {
  it('exposes exactly the frozen public surface — nothing more, nothing less', () => {
    expect(Object.keys(barrel).sort()).toEqual(BARREL_VALUE_EXPORTS)
  })

  it('exposes nothing at runtime except functions (the §1 shapes are types only)', () => {
    for (const name of Object.keys(barrel).sort()) {
      expect(typeof (barrel as unknown as Record<string, unknown>)[name]).toBe('function')
    }
  })
})
