import type {
  NinaAvatarSource,
  NinaFactCategory,
  NinaImageKind,
  NinaMemorySource,
  NinaMessageSource,
  NinaRole,
  NinaSessionTitleSource,
  NinaSlotValue,
  NinaTurnKind,
  NinaTurnStatus,
} from '@/lib/db/schema'

import type { NinaShortcutKind } from '@/lib/nina/shortcuts'

/**
 * §1 Shapes — every row, insert and result type of the Nina query layer's §1, in one leaf
 * module. (The layer's three other exported types — `NinaChatPhotoBlobPatch` in §5b and
 * `NinaJobPhotoRow`/`NinaJobPhotoBubbleRow` in §12 — travel with their sections, not here.)
 *
 * These types are the foundation every domain module under `lib/nina/queries/` imports, so
 * they live together in a module that imports nothing but schema types — a pure leaf of the
 * dependency graph. No runtime code lives here, so this module contributes nothing to the
 * barrel's runtime surface; `lib/nina/queries.test.ts` freezes that surface either way.
 *
 * Provenance: everything from the section banner below to the end of the file is
 * `lib/nina/queries.ts` §1 (its lines 122–611) moved byte-identical by the queries-split
 * (2026-09-12) — the THREE-LAYER BOUNDARY ruling A1 inside `NinaMessageRow`'s note included.
 */

/* ============================================================================
 * §1 Shapes
 * ==========================================================================*/

export interface NinaIdentity {
  /** `users.name` as the OAuth provider gave it. */
  fullName: string | null
  /** The `nickname` memory slot, once phase 5 has confirmed one. */
  nickname: string | null
}

/**
 * One message, as every reader wants it.
 *
 * ── THE THREE-LAYER BOUNDARY (RULING A1). DO NOT "FIX" EITHER END TO MATCH THE OTHER ───────────
 *   1. `lib/db/schema.ts` — the COLUMNS: `text`, `sent_at` (`ninaMessages.text`,
 *      `ninaMessages.sentAt`). Phase 2's spelling, and a column name is forever.
 *   2. THIS FILE — the data-access DTO: **`body`** and **`createdAt`**, uniformly, in EVERY
 *      function, because every function selects `messageColumns` (§2) and that is where the alias
 *      is written. There is no function in this module that returns `text`/`sentAt`.
 *   3. `lib/nina/context.ts` (phase 2) — the prompt-layer input `MessageInput`: `text`, `sentAt`.
 *
 * **`lib/nina/gateway.ts`'s `dbNinaSourceGateway` (phase 3) is the SINGLE mapper** between layers
 * 2 and 3 (`text: row.body`, `sentAt: row.createdAt`). It is the only file in the feature that
 * knows both spellings, which is the whole point: one translation point, reviewable in one diff,
 * instead of nine consumers each guessing. Every other reader — phases 4, 6, 7, 8, 10, 12, 13,
 * 15, 16 — consumes `body`/`createdAt` and is correct in doing so.
 *
 * `seq` rides along because phase 10 needs a read watermark and phase 4 needs a stable React key
 * that is also a sort key.
 */
export interface NinaMessageRow {
  id: string
  seq: number
  /**
   * Which conversation this message is in (F35 R2). Added by phase 3, which needs to read a session
   * OFF a message rather than only filter by one: `lib/nina/sessionResolve.ts` resolves R22's
   * apology into the chat where he asked for the photo, and `NinaImageJobArgs.replyToId` is the only
   * handle it has. `NOT NULL` in the column, so `string` and never nullable here.
   */
  sessionId: string
  role: NinaRole
  body: string
  createdAt: Date
  source: NinaMessageSource
  turnId: string | null
  replyToId: string | null
  runId: string | null
  readAt: Date | null
  /**
   * **This bubble exists only to carry a photograph** (see the column's note in `lib/db/schema.ts`).
   * Not nullable, because the column is `NOT NULL DEFAULT false` — a reader never branches on null.
   * `isNinaPhotoCarrierMessage` is the only consumer, and `removeChatPhotoAction` hands it the whole
   * row, so projecting it here is what makes that call site need no change at all.
   */
  photoOnly: boolean
}

/** What a writer supplies. `seq` is absent on purpose — Postgres assigns it. */
export interface NinaMessageInsert {
  role: NinaRole
  body: string
  source?: NinaMessageSource
  turnId?: string | null
  replyToId?: string | null
  runId?: string | null
  /**
   * **`true` when this row exists only to carry a photograph** — see the column's own note.
   * Optional and defaulting to `false`, so the four existing writers of ordinary messages are
   * unchanged and a new writer has to opt in deliberately rather than inherit a flag.
   */
  photoOnly?: boolean
}

/**
 * One session, as the sidebar and the resolver want it. `userId` is absent on purpose: it is the
 * scope, not a field — nothing downstream needs it and a row that carries it invites a caller to
 * trust it instead of `requireUserId()`.
 *
 * `title` may be NULL, and `sessionTitleFor` in `lib/nina/sessions.ts` is the only sanctioned way to
 * turn that into something a screen can show.
 */
export interface NinaSessionRow {
  id: string
  title: string | null
  titleSource: NinaSessionTitleSource | null
  pinnedAt: Date | null
  createdAt: Date
}

/**
 * A session plus R5's sort key, which is derived and therefore not on the row: `max(sent_at)` over
 * `role = 'runner'` inside it. NULL means he has never written in this session — a session he just
 * created, or one where only her proactive messages live.
 *
 * See `nina_chat_sessions`'s header for why this is not a stored column.
 */
export interface NinaSessionListRow extends NinaSessionRow {
  lastUserMessageAt: Date | null
}

export interface NinaImageRow {
  id: string
  /**
   * NULL when the photograph has outlived its bubble — a session delete now orphans these rows
   * instead of destroying them (R1). See `nina_message_images.message_id`'s own comment for the
   * argument. Every reader downstream degrades: `/nina/about`'s gallery renders the photograph with
   * no way back into a conversation, `/admin/photos` prints "no message", and
   * `removeChatPhotoAction` skips its carrier-message lookup entirely.
   *
   * `NinaImageInsert.messageId` below is deliberately NOT nullable: a NULL here is only ever the
   * residue of a delete, never something a writer asks for.
   */
  messageId: string | null
  kind: NinaImageKind
  blobUrl: string
  pathname: string
  width: number | null
  height: number | null
  bytes: number | null
  description: string | null
  prompt: string | null
  /**
   * F37 R3. The `nina_avatars` row these bytes belong to, or NULL. Non-null means this row is a
   * REFERENCE and the three collection reads skip it; see `isOriginalPhoto`.
   */
  sourceAvatarId: string | null
  /**
   * F37 R1. The earlier `nina_message_images` row these bytes belong to, or NULL. Always the
   * ORIGINAL rather than the row he tapped — `ninaPhotoProvenance` flattens, and
   * `drizzle/0010`'s backfill wrote the same thing for the rows that predate it.
   */
  sourceImageId: string | null
  /**
   * media-dedupe P1. sha-256 hex of the bytes this row's Blob object stores, or NULL — a row that
   * predates the column, or a write whose path had nothing to hash. NULL means dedup is inactive
   * for this row; see `nina_message_images.content_hash`'s header for the full contract.
   * `findNinaImageByContentHash` is the reader this column exists for.
   */
  contentHash: string | null
  /**
   * The perceptual signature pair (`lib/nina/perceptual.ts` holds the only parsers): the 64-bit
   * dHash as 16 hex characters and the 16x16 grayscale thumbnail as base64. NULL is "unsigned" —
   * the row cannot participate in a perceptual twin match, exactly as a NULL `content_hash` cannot
   * participate in a byte match. Originals only; see the column headers in `lib/db/schema.ts`.
   */
  perceptualHash: string | null
  perceptualSig: string | null
  sortOrder: number
  createdAt: Date
}

export interface NinaImageInsert {
  messageId: string
  kind: NinaImageKind
  blobUrl: string
  pathname: string
  width?: number | null
  height?: number | null
  bytes?: number | null
  description?: string | null
  prompt?: string | null
  /**
   * F37. **Optional on purpose, and the default is what makes the rest of the repo correct.** An
   * upload (`lib/nina/actions.ts:534`), one of her generations (`lib/nina/imagerun.ts:260`) and an
   * operator's Add (`lib/admin/chatPhotoActions.ts:229`) are all ORIGINALS: they say nothing, and
   * `insertNinaMessageImages` coalesces to NULL. Exactly one writer sets them —
   * `resolveAttachment`'s attach INSERT — and it gets them from `ninaPhotoProvenance`.
   */
  sourceAvatarId?: string | null
  sourceImageId?: string | null
  /**
   * media-dedupe P1. **Optional on purpose, and nobody sends one yet** — that is what makes this
   * phase foundation. The value is sha-256 hex over the bytes being stored, computed by
   * `lib/photos/contentHash.ts`; on the upload path it is a CLIENT CLAIM, so the insert
   * coalesces anything that fails `isValidContentHash` to NULL (below) — invariant 9's "gagal
   * validasi = tulis NULL, bukan error", enforced once here at the door every write path shares,
   * rather than re-promised at each of the three callers.
   */
  contentHash?: string | null
  /**
   * media-dedupe follow-up (2026-09-10). **Optional, and set only where the writer HELD the
   * bytes**: the generated store signed what it put, the chat send's race-close signed what it
   * fetched back. The insert coalesces anything the one parsers reject to NULL — the same door
   * rule as `contentHash` — and a REFERENCE row binds NULL: a reference serves the KEEPER's
   * object and signatures describe the bytes a row OWNS, so a reference carrying one would be a
   * fact about bytes it stopped serving.
   */
  perceptualHash?: string | null
  perceptualSig?: string | null
  sortOrder?: number
}

/**
 * One page of the Media view — `/admin/nina?view=media` (R1, image-collection phase 1).
 *
 * The mirror of `NinaAvatarFolderPage` and the same argument for `total` being here rather than
 * inferred: the pager renders "1-48 of 137" and offers Newer as well as Older, and an over-shot
 * `?page=` has to be distinguishable from an empty collection. It is deliberately not a rename of
 * the retired `/admin/photos` page type — that surface's contract died with the surface, in the
 * image-collection merge. `rows` is `NinaImageRow` unchanged — `imageColumns` is the projection,
 * so the admin surface reads exactly what every other reader of this table reads and no second row
 * shape enters the module.
 */
export interface NinaMediaPage {
  rows: NinaImageRow[]
  /** Every ORIGINAL row for this user, BOTH kinds — not just this page. */
  total: number
}

/**
 * A slot as phase 2's context wants it: `value` already RENDERED to a display string. See
 * `renderSlotValue` for what rendering means, and `getNinaMemorySlot` for the parsed form.
 */
export interface NinaSlotRow {
  key: string
  value: string
  source: NinaMemorySource
  sourceMessageId: string | null
  updatedAt: Date
}

export interface NinaSlotUpsert {
  key: string
  value: NinaSlotValue
  /** Defaults to 'distilled'. Phase 16's editor passes 'admin'. */
  source?: NinaMemorySource
  /** NULL is a real answer — nothing in the chat said it. */
  sourceMessageId?: string | null
}

export interface NinaFactRow {
  id: string
  category: NinaFactCategory
  text: string
  source: NinaMemorySource
  sourceMessageId: string | null
  createdAt: Date
}

export interface NinaFactInsert {
  category: NinaFactCategory
  text: string
  source?: NinaMemorySource
  sourceMessageId?: string | null
}

/**
 * A shortcut as every caller wants it: the row, with `kind` narrowed. **A superset of
 * `NinaShortcutMatchable`**, deliberately — phase 2 hands the array straight to
 * `matchNinaShortcuts` and phase 3's table renders the four extra fields, so neither needs a
 * mapping step and there is no third shape to keep in step.
 *
 * `NinaShortcutRecord` and not `NinaShortcutRow`: the latter is the raw drizzle row in
 * `lib/db/schema.ts`, where `kind` is bare `string` because the column is untyped `text`. See
 * that table's header for why it is untyped.
 */
export interface NinaShortcutRecord {
  id: string
  /** As the admin typed it. */
  trigger: string
  /** `normalizeNinaTrigger(trigger)`. Derived on write; never supplied by a caller. */
  matchKey: string
  kind: NinaShortcutKind
  label: string
  expansion: string
  enabled: boolean
  uses: number
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * `matchKey` and `kind` are absent on purpose: they are DERIVED from `trigger` by
 * `insertNinaShortcut`, so there is exactly one place in the app that can get the normalisation
 * wrong, and the unique index can never see an underived key.
 */
export interface NinaShortcutInsert {
  trigger: string
  label: string
  expansion: string
  /** Defaults to true — an admin adding a code means to use it. */
  enabled?: boolean
}

/** Every field optional; an absent field is left alone. `trigger` re-derives the pair. */
export interface NinaShortcutPatch {
  trigger?: string
  label?: string
  expansion?: string
  enabled?: boolean
}

export interface NinaNagRow {
  code: string
  level: number
  count: number
  lastMentionedOn: string | null
  updatedAt: Date
}

export interface NinaNagUpsert {
  code: string
  level: number
  /** Jakarta 'YYYY-MM-DD'. */
  lastMentionedOn: string | null
}

export interface NinaTurnInsert {
  kind: NinaTurnKind
  model: string
  /** `'pending'` is an image job in flight (RULING C2). See the column's note. */
  status: NinaTurnStatus
  trigger?: string | null
  promptVersion?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  /**
   * Comma-joined tool NAMES, `''` when none — a string, not a count (RULING C8). Defaults to
   * `''`, so a caller that makes no tool call passes nothing.
   */
  toolCalls?: string
  latencyMs?: number | null
  /** Millionths of a USD. */
  costMicroUsd?: number | null
  /** On `status: 'pending'`, phase 12's job phase: `'queued' | 'dispatched' | 'running'`. */
  errorCode?: string | null
  /**
   * The job's arguments (RULING C1) — phase 12's `NinaImageJobArgs`, `null` for every other
   * `kind`. `unknown` rather than that type, because the type is phase 12's and this module must
   * not import from a later phase. The column's docstring carries the shape and the reason.
   */
  args?: unknown
}

export interface NinaAvatarRow {
  id: string
  blobUrl: string
  pathname: string
  /** `''` is the album root — F34 R1. See `nina_avatars`'s header. */
  folder: string
  /** The file's name on the laptop; NULL for a row that was handed bytes, not a file. */
  filename: string | null
  /** The derived grid thumbnail; NULL means render `blobUrl` instead. */
  thumbUrl: string | null
  /** The thumbnail's STORED Blob pathname, so a delete can remove both objects. */
  thumbPathname: string | null
  width: number | null
  height: number | null
  bytes: number | null
  source: NinaAvatarSource
  cropScale: number | null
  cropX: number | null
  cropY: number | null
  description: string | null
  isCurrent: boolean
  announcedAt: Date | null
  createdAt: Date
}

export interface NinaAvatarInsert {
  blobUrl: string
  pathname: string
  source: NinaAvatarSource
  width?: number | null
  height?: number | null
  bytes?: number | null
  description?: string | null
}

/**
 * The circular-frame transform (R23). `scale` is a multiple of the cover fit; `x` and `y` are the
 * image centre's offset from the frame centre in thousandths of the frame width. Passing `null`
 * for all three clears the transform back to plain centred `object-cover`.
 */
export interface NinaAvatarCrop {
  scale: number | null
  x: number | null
  y: number | null
}

/**
 * What a batch writer supplies. Separate from `NinaAvatarInsert` and NOT an extension of it,
 * because the two describe different acts: `NinaAvatarInsert` is one photo becoming her face, and
 * this is N files landing in a folder with nobody's face changing. `folder` and `sourceKey` are
 * REQUIRED here — a file arriving from a directory walk has both, and making them optional would
 * let the one caller that matters (`registerNinaAvatarsAction`) write a row with no dedupe key and
 * silently opt out of the unique index that exists to protect it. The second writer
 * (`setChatPhotoAsAvatarAction`) has a key too — `chat-photo:<imageId>`, which is what makes
 * re-adoption a constraint decision — but no laptop file, and `filename: null` is exactly what the
 * column records for bytes that arrived without one.
 */
export interface NinaAvatarBatchInsert {
  blobUrl: string
  pathname: string
  source: NinaAvatarSource
  folder: string
  filename: string | null
  sourceKey: string
  width?: number | null
  height?: number | null
  bytes?: number | null
  thumbUrl?: string | null
  thumbPathname?: string | null
  description?: string | null
}

/**
 * One page of one folder, plus how many rows the folder holds in total.
 *
 * ── AN OFFSET PAGE WITH A COUNT, AND NOT A KEYSET CURSOR ────────────────────────────────────
 * The draft of this phase returned a keyset cursor, and phase 5 — the only consumer — needed
 * `total` and a backward step, so this is the reconciled shape. The pager it feeds says
 * *"121–240 of 314"* and offers **Newer** as well as **Older**, and a cursor gives up both: it
 * carries no count and it walks one way unless the URL accumulates a stack of cursors. `?page=N`
 * is also something a human can read, type and bookmark.
 *
 * **What the cursor was right about, stated rather than dropped.** Rows are inserted at the FRONT
 * of `(created_at desc, id desc)`, so a page-2 read taken *during* an upload is shifted by however
 * many rows landed in between, and a tile can appear on two consecutive pages. That is the whole
 * of the cost, and it is bounded and self-correcting: nothing is lost (the shift is forward, so a
 * row can repeat but cannot be skipped), the operator watching an upload is watching the queue
 * rather than paging, and the next render with the same `?page=` is consistent again. Against
 * that, `OFFSET` on `nina_avatars_user_folder_created_idx` at the scale the requirement states
 * (*"hundreds"*) is an index range scan; the deep-offset cost a cursor exists to avoid begins in
 * the tens of thousands.
 *
 * `total` is a second statement rather than a `count(*) OVER ()` window, so that an over-shot
 * `?page=` returns `rows: []` with a TRUTHFUL total instead of `0` — which is what lets phase 5's
 * empty-page branch offer "go to the first page" rather than claiming the folder is empty.
 */
export interface NinaAvatarFolderPage {
  rows: NinaAvatarRow[]
  /** Rows in THIS folder, not in its subtree. The grid is not recursive; the tree is. */
  total: number
}

/**
 * One already-uploaded file, as the client-side diff needs it — F34 R1's *"only upload the new
 * folders and files"*.
 *
 * `sourceKey` is what the diff matches on. `folder` and `id` ride along so that a skipped file can
 * be reported as *where it already is* rather than as a silent omission: a drop that uploads
 * nothing has to say so, or it looks broken.
 */
export interface NinaAvatarManifestEntry {
  id: string
  folder: string
  sourceKey: string
}

/**
 * One folder and how many photos are DIRECTLY in it — not counting its descendants.
 *
 * The roll-up is deliberately not SQL's. `lib/admin/filetree.ts`'s `buildTree` already assembles
 * the nested model the tree pane renders, and it has to sum children to place them anyway; a
 * recursive `WITH` here would be a second opinion about the same tree, provable only against a
 * database while the pure function is provable in `npm test`. So: SQL groups, the pure module
 * rolls up.
 */
export interface NinaAvatarFolderCount {
  folder: string
  photos: number
}

/**
 * Everything a caller needs to remove a photo's objects from Blob after its row is gone. Both
 * thumbnail fields are nullable, and a caller must treat NULL as "there is nothing to delete"
 * rather than as an error — pre-F34 rows have no thumbnail and never will.
 */
export interface NinaAvatarBlobRef {
  id: string
  blobUrl: string
  pathname: string
  thumbUrl: string | null
  thumbPathname: string | null
}

/**
 * `renameNinaAvatarFolder`'s outcome. `moved` is a count and `0` is a legitimate success — a
 * folder can be renamed while it holds nothing but subfolders that hold nothing.
 *
 * `reason: 'root'` covers both of the album root's refusals, because they are one fact: the root
 * is not a node. It cannot be renamed (it has no name), and it cannot be a destination (the
 * rewrite is `to || substr(folder, …)`, and a zero-length `to` would produce a leading slash,
 * which is not a canonical path). `reason: 'cycle'` is a folder being moved inside itself.
 */
export type NinaFolderRenameResult =
  { ok: true; moved: number } | { ok: false; reason: 'root' | 'cycle' }
