# Phase 1: Paste an image into the composer

**Plan set:** `COMPOSER_CLIPBOARD_IMAGE_PASTE_PLAN.md`
**Analysis:** `20260916-074527-J14P_code_analyzer.md`
**Satisfies:** R1 — copy an image anywhere (a WhatsApp image bubble included) and paste it straight
into the "Message Nina" textarea, where it attaches as a photo exactly the way the camera-icon
picker already does.
**Depends on:** none (single-phase set)
**Difficulty:** NORMAL
**Package:** `components/nina`

---

## Goal

After this phase the Nina composer has a second way in for a photograph. Focus the textarea, press
Ctrl/Cmd+V (or long-press → Paste on a phone), and if the clipboard carries an image file it becomes
a tile that runs the identical compress → hash → dedupe-check → upload → describe pipeline a picked
file runs, and sends in the identical `ComposerDraftImage` shape. The picker and the paste handler
are two thin event adapters over one `handleFiles(files: File[])` core — there is no second copy of
the three-photo cap, the 25 MB ceiling, the rejection copy, or the tile construction. Pasting plain
text is untouched: `preventDefault()` is called only when an image file is actually present.

## Interface Contract

**Deletes:** nothing.
**Renames:** nothing.
**Creates:**
- `handleFiles(files: File[]): void` — module-internal to `components/nina/useComposerPhotos.ts`
  (not exported; a function declaration inside `useComposerPhotos`, beside `onPick`).
- `onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void` — inside
  `useComposerPhotos`, and **added to the hook's return object** (`useComposerPhotos.ts:338`).
- `pasteFiles(files: File[])` test helper in `components/nina/Composer.test.tsx`.

**Signature changes:**
- `useComposerPhotos({ userId })`'s **return type** gains one member: `onPaste`. The return object
  goes from `{ tiles, notice, ready, inFlight, onPick, removeTile, collectDraft, reset }` to
  `{ tiles, notice, ready, inFlight, onPick, onPaste, removeTile, collectDraft, reset }`. Purely
  additive; the one caller (`Composer.tsx`) destructures, so nothing breaks by omission.
- `onPick(event: React.ChangeEvent<HTMLInputElement>): void` — signature UNCHANGED; only its body
  shrinks to two lines plus a `handleFiles(picked)` call.

**Requires (from earlier phases):** none.

**Leaves alone (owned by nobody else in this set, and deliberately not touched here):**
- `lib/nina/images.ts` (`planNinaPicked`, every constant) — reused verbatim, not edited.
- `lib/nina/dedupe.ts`, `lib/photos/compressForNina.ts`, `lib/photos/contentHash.ts`,
  `lib/nina/actions/*`, `app/api/upload/route.ts`, `lib/db/schema/nina/chat.ts` — a pasted `File`
  is indistinguishable from a picked one by the time any of them sees it.
- `components/nina/useComposerDraft.ts` — the paste handler is a photo concern; the text hook's
  `ref`/`value`/`onChange` contract on the same `<textarea>` is untouched, `onPaste` is a sibling
  prop beside them.
- `components/nina/ChatScreen.tsx`, `components/nina/useNinaSend.ts` — `Composer`'s prop contract
  does not change shape.

## Files

| File | Action | What changes |
|---|---|---|
| `components/nina/useComposerPhotos.ts` | modify | header docstring gains the two-entry-points section (`:19-75`); `NinaPickCandidate` added to the existing type import (`:9-14`); `onPick`'s body (`:261-299`) split into `handleFiles` + a two-line `onPick` + a new `onPaste`; `onPaste` added to the return (`:338`) |
| `components/nina/Composer.tsx` | modify | destructure `onPaste` from `useComposerPhotos(...)` (`:226-235`); wire `onPaste={onPaste}` onto the `<textarea>` (`:379-384`) |
| `components/nina/Composer.test.tsx` | modify | a `pasteFiles` helper beside `textbox()` (`:75-81`) and six paste-path cases appended inside the `describe` block, before its close at `:408` |

## Implementation Steps

### Step 1: Import `NinaPickCandidate` as a type

**File:** `components/nina/useComposerPhotos.ts:9-14`
**Change:** `handleFiles` keys its `File` lookup on candidate object IDENTITY rather than on
`{name, size}` (Step 3 explains why), which needs the candidate type by name.
**Code:** replace the whole import block with:

```ts
import {
  NINA_MAX_CHAT_IMAGES,
  ninaChatPathname,
  planNinaPicked,
  type NinaPickCandidate,
  type NinaPickRejectionReason,
} from '@/lib/nina/images'
```

**Impact:** none at runtime — `NinaPickCandidate` is already exported from `lib/nina/images.ts:164`
and this is a type-only addition that erases at compile time.

---

### Step 2: Document the two entry points in the hook's header

**File:** `components/nina/useComposerPhotos.ts:59` (insert a new section immediately BEFORE the
existing `── AND WHY `planNinaPicked` IS A PURE FUNCTION IN `lib/` ──` divider, which currently
starts at line 60)
**Change:** the file's header is the repo's idiom for "why is it shaped like this"; a second entry
point with a `preventDefault` rule that is not written down is the next person's bug.
**Code:** insert these lines (keeping the blank ` *` line that already separates sections):

```ts
 * ── TWO ENTRY POINTS, ONE PIPELINE (clipboard paste, 2026-09-16) ──────────────────────────────
 * A photograph arrives here two ways and is processed exactly one way. `onPick` is the camera
 * button's hidden `<input type="file">`; `onPaste` is the textarea's clipboard, asked for by
 * analogy — *"in whatsapp, i can hold down on a bubble containing image, select copy, then i can
 * paste it directly into whatsapp text chat field input"*. Neither does anything but turn its own
 * event into a `File[]` and hand it to `handleFiles`, which owns the whole decision: the
 * `planNinaPicked` accept/reject, the tile construction, the notice, and the `process()` kickoff.
 * So the three-photo cap, the 25 MB ceiling and the rejection copy are not re-stated per entry
 * point and cannot drift apart — a third entry point (drag-and-drop, say) is another two-line
 * adapter, not another pipeline.
 *
 * `onPaste` calls `preventDefault()` ONLY when the clipboard actually carries an image file.
 * Pasting ordinary text has to stay ordinary: no interception, no notice, nothing — that path is
 * the browser's and this hook must not be able to see it. When the clipboard carries BOTH an image
 * and a text item (some screenshot tools do), the image wins and the default is prevented anyway,
 * which is WhatsApp's own call; the alternative is a garbled bytes-string landing in the draft
 * beside the tile. Non-image files in a paste are dropped SILENTLY rather than rejected with
 * "That is not a photo." — the picker's notice answers a deliberate choice of a file in an OS
 * dialog, and a paste of whatever happened to be on the clipboard is not one.
 *
```

**Impact:** comment only.

---

### Step 3: Split `onPick` into `handleFiles` + `onPick` + `onPaste`

**File:** `components/nina/useComposerPhotos.ts:261-299` (the `/** Decide, then set, then run. … */`
docstring through the closing brace of `onPick`)
**Change:** replace that whole block — docstring included — with the three functions below.

Two things move, and nothing else does:

1. Everything after `onPick`'s first three lines becomes `handleFiles(files)`, verbatim except for
   the file lookup (point 2). `onPick` keeps exactly the two lines that are about an
   `<input type="file">` and nothing else: reading `event.target.files` and blanking
   `event.target.value`.
2. The lookup `picked.find((f) => f.name === candidate.name && f.size === candidate.size)` becomes
   an identity `Map` from the candidate object to its `File`. `planNinaPicked` pushes the very
   objects it was handed into `plan.accepted` (`lib/nina/images.ts:207` — `accepted.push(file)`),
   so identity is exact and total. This is not a cleanup for its own sake: clipboard images
   routinely arrive named `image.png` by the OS rather than by the user, so a multi-image paste can
   carry several files with an identical `{name, size}` and the old `.find()` would hand the same
   `File` to two tiles. The picker path's behaviour is unchanged in every case where names differ,
   and strictly more correct in the case where they do not. Step 6's cap test is its positive
   control.

**Code:**

```ts
  /**
   * The pipeline's one door. Decide, then set, then run — nothing in here is inside a `setState`
   * updater, so Strict Mode has nothing to double-invoke (see the header's F17 note). Both entry
   * points below call this and neither adds a rule of its own.
   */
  function handleFiles(files: File[]) {
    if (files.length === 0) return

    /*
     * Keyed by IDENTITY, not by `{name, size}`: `planNinaPicked` hands back the very candidate
     * objects it was given, and a clipboard paste can carry several files the OS named identically
     * (`image.png`), which a name+size lookup would collapse onto one `File`.
     */
    const byCandidate = new Map<NinaPickCandidate, File>()
    const candidates: NinaPickCandidate[] = files.map((file) => {
      const candidate = { name: file.name, type: file.type, size: file.size }
      byCandidate.set(candidate, file)
      return candidate
    })

    const plan = planNinaPicked(candidates, { alreadyHeld: tiles.length })

    const fresh: Array<{ tile: Tile; file: File }> = []
    for (const candidate of plan.accepted) {
      const file = byCandidate.get(candidate)
      if (file == null) continue
      fresh.push({
        tile: {
          id: `tile-${newId()}`,
          previewUrl: URL.createObjectURL(file),
          state: 'compressing',
          error: null,
          ticket: null,
          blobUrl: null,
          pathname: null,
          contentHash: null,
          existing: null,
        },
        file,
      })
    }

    setTiles((current) => [...current, ...fresh.map((f) => f.tile)])
    const firstRejection = plan.rejected[0]
    setNotice(firstRejection != null ? REJECTION_TEXT[firstRejection.reason] : null)
    for (const { tile, file } of fresh) void process(tile, file)
  }

  /** The camera button's hidden `<input type="file">`. Everything that is not about an input
   *  element lives in `handleFiles`. */
  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = '' // so picking the same file twice in a row still fires onChange
    handleFiles(picked)
  }

  /**
   * The textarea's clipboard. `preventDefault()` is called ONLY when an image file is actually on
   * the clipboard, so a plain-text paste is never touched — see the header's paste section for
   * that rule and for why a mixed image+text clipboard still counts as an image paste.
   *
   * Note the ordering: the interception is decided by "is there an image file here", BEFORE
   * `planNinaPicked` gets a say. A pasted image that the three-photo cap then rejects still
   * prevented the default — it has to, or the clipboard's bytes would be inserted as text into the
   * draft as consolation for the rejection.
   */
  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(event.clipboardData?.files ?? [])
    const images = pasted.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    event.preventDefault()
    handleFiles(images)
  }
```

**Impact:**
- `onPick`'s observable behaviour is unchanged; its early return on an empty pick now happens one
  frame deeper, inside `handleFiles`, and `event.target.value = ''` still runs before it (the order
  the existing code has, and the one that matters for re-picking the same file).
- `handleFiles` closes over `tiles` and `process` exactly as `onPick` did. It is a plain function
  declaration, not a `useCallback` — it is never a dependency of anything, same as `onPick`,
  `removeTile`, `collectDraft` and `reset` beside it.
- `event.clipboardData?.files` uses optional chaining although React types `clipboardData` as
  non-nullable `DataTransfer`: a synthetic paste in a test (and some older mobile browsers) can
  deliver the event without one, and `?? []` turns that into a no-op instead of a throw inside a
  React event handler. No lint rule in `eslint.config.mjs` forbids the redundant `?.`
  (`@typescript-eslint/no-unnecessary-condition` is not enabled).

---

### Step 4: Return `onPaste` from the hook

**File:** `components/nina/useComposerPhotos.ts:338` (the return statement) and
`components/nina/useComposerPhotos.ts:71-73` (the header sentence that enumerates the surface)
**Change:** add the new member to the returned object, and keep the header's list of the surface
honest.
**Code:** the return becomes:

```ts
  return { tiles, notice, ready, inFlight, onPick, onPaste, removeTile, collectDraft, reset }
}
```

and in the header, the sentence currently reading

```
 * The surface is the original component's, minus what only the component's render needed: the
 * tile list and the notice for rendering, `ready`/`inFlight` for `canSend`, `onPick`/`removeTile`
 * for the gestures — and two send-side verbs, `collectDraft` (the payload's discriminated union)
```

becomes

```
 * The surface is the original component's, minus what only the component's render needed: the
 * tile list and the notice for rendering, `ready`/`inFlight` for `canSend`,
 * `onPick`/`onPaste`/`removeTile` for the gestures — and two send-side verbs, `collectDraft`
 * (the payload's discriminated union)
```

**Impact:** purely additive to the hook's return type. `Composer.tsx` is the only caller.

---

### Step 5: Wire `onPaste` onto the textarea

**File:** `components/nina/Composer.tsx:226-235` and `components/nina/Composer.tsx:379-384`
**Change:** destructure the new handler and hand it to the `<textarea>` beside `onChange`.
**Code:** the hook call becomes:

```tsx
  const {
    tiles,
    notice,
    ready,
    inFlight,
    onPick,
    onPaste,
    removeTile,
    collectDraft,
    reset: resetPhotos,
  } = useComposerPhotos({ userId })
```

and the textarea's opening props (lines 379-384, through the existing `onKeyDown={(event) => {`)
become:

```tsx
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={handleChange}
            /* The photo hook's second entry point: a clipboard image is attached as a tile,
               exactly as a picked file is. It intercepts nothing else — a plain-text paste never
               reaches `preventDefault()`, so `handleChange` sees it the ordinary way. See
               `useComposerPhotos`'s header. */
            onPaste={onPaste}
            onKeyDown={(event) => {
```

**Impact:** no prop of `Composer` changes, so `ChatScreen.tsx` is untouched. The textarea gains one
listener; React's `onPaste` is delegated at the root and `paste` bubbles, so nothing about the
existing `onKeyDown`/`onChange` wiring shifts.

---

### Step 6: Paste-path test cases

**File:** `components/nina/Composer.test.tsx` — the helper goes beside `textbox()` (after line 81,
i.e. after `imageFile`), and the six cases go inside the `describe('Composer', …)` block, appended
after the last existing case (`'keeps Send disabled while busy even with a typed draft'`, which ends
at line 407) and before the block's closing `})` at line 408.

**Change:** mirror the existing pick-path cases through the clipboard, and pin the two rules that
are new rather than mirrored — the `preventDefault` boundary and the shared cap.

**Code — the helper** (place directly below `imageFile`):

```tsx
/**
 * A synthetic clipboard paste on the textarea.
 *
 * `fireEvent` does not build a real `DataTransfer`: dom-testing-library defines the `clipboardData`
 * key from the init object straight onto the event, so the handler sees this plain `{ files }`
 * object verbatim and a plain array stands in for a `FileList` (`Array.from` takes either).
 *
 * The RETURN VALUE is the point of the helper: `fireEvent` returns `dispatchEvent`'s boolean —
 * `false` exactly when a handler called `preventDefault()`. That is how these tests prove the
 * text-paste path is left alone, which no amount of DOM inspection can show (fireEvent never
 * performs the browser's own insertion).
 */
function pasteFiles(files: File[]) {
  return fireEvent.paste(textbox(), { clipboardData: { files } })
}
```

**Code — the cases:**

```tsx
  it('runs a pasted image through compress, hash, dedupe-check, upload and describe', async () => {
    mockUploadPipeline()
    render(<Composer {...baseProps()} />)

    // image/png, not jpeg: the clipboard hands over whatever the source app copied, and
    // `compressForNina` re-encodes to JPEG regardless — the server's jpeg-only check is
    // post-compression and needs no widening.
    expect(pasteFiles([imageFile('image.png', 'image/png')])).toBe(false)

    await waitFor(() => expect(sendButton()).toBeEnabled())
    expect(compressForNina).toHaveBeenCalledTimes(1)
    expect(findNinaDuplicateChatImage).toHaveBeenCalledWith({
      contentHash: 'a'.repeat(64),
      sourceHash: 'a'.repeat(64),
    })
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^nina\/user-1\/chat\/[A-Za-z0-9_-]{12}\.jpg$/),
      expect.anything(),
      expect.objectContaining({ access: 'public', handleUploadUrl: '/api/upload' }),
    )
    expect(describeNinaImage).toHaveBeenCalledTimes(1)
  })

  it('sends a pasted image in the same upload shape a picked one sends', async () => {
    mockUploadPipeline({ ticket: 'ticket-pasted' })
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Composer {...baseProps({ onSend })} />)

    pasteFiles([imageFile('image.png', 'image/png')])
    await waitFor(() => expect(sendButton()).toBeEnabled())
    await user.click(sendButton())

    expect(onSend).toHaveBeenCalledWith({
      body: '',
      images: [
        {
          source: 'upload',
          ticket: 'ticket-pasted',
          url: 'https://blob.example/nina/user-1/chat/abc-suffix.jpg',
          pathname: 'nina/user-1/chat/abc-suffix.jpg',
          contentHash: 'a'.repeat(64),
        } satisfies ComposerDraftImage,
      ],
    })
  })

  it('rejects a paste past the three-photo cap, but still processes the accepted ones', async () => {
    mockUploadPipeline()
    render(<Composer {...baseProps()} />)

    // All four are named `image.png` and carry identical bytes, which is what a multi-image
    // clipboard actually looks like — and the positive control for the identity-keyed lookup in
    // `handleFiles`: a `{name, size}` lookup would hand the same `File` to all three tiles.
    const pasted = [
      imageFile('image.png', 'image/png'),
      imageFile('image.png', 'image/png'),
      imageFile('image.png', 'image/png'),
      imageFile('image.png', 'image/png'),
    ]
    pasteFiles(pasted)

    expect(await screen.findByText('Nina takes 3 photos at a time.')).toBeInTheDocument()
    await waitFor(() => expect(compressForNina).toHaveBeenCalledTimes(3))

    const compressed = compressForNina.mock.calls.map((call) => call[0])
    expect(new Set(compressed).size).toBe(3)
    expect(compressed[0]).toBe(pasted[0])
    expect(compressed[1]).toBe(pasted[1])
    expect(compressed[2]).toBe(pasted[2])
  })

  it('counts a pasted image against the same three-photo cap the picker fills', async () => {
    mockUploadPipeline()
    const user = userEvent.setup()
    const { container } = render(<Composer {...baseProps()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, [imageFile('a.jpg'), imageFile('b.jpg'), imageFile('c.jpg')])
    await waitFor(() => expect(compressForNina).toHaveBeenCalledTimes(3))

    // Prevented even though the cap then rejects it: the interception is decided by "is there an
    // image on the clipboard", before `planNinaPicked` gets a say — otherwise the refusal would
    // come with the image's bytes pasted into the draft as text.
    expect(pasteFiles([imageFile('image.png', 'image/png')])).toBe(false)

    expect(await screen.findByText('Nina takes 3 photos at a time.')).toBeInTheDocument()
    expect(compressForNina).toHaveBeenCalledTimes(3)
  })

  it('leaves a paste with no image on it completely alone', async () => {
    render(<Composer {...baseProps()} />)

    // A plain text paste: nothing on `clipboardData.files` at all.
    expect(pasteFiles([])).toBe(true)
    // And a non-image FILE is dropped silently rather than rejected — a paste is not a deliberate
    // choice of a file, so it earns no "That is not a photo." notice the way the picker's does.
    expect(pasteFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })])).toBe(true)

    await Promise.resolve()
    expect(compressForNina).not.toHaveBeenCalled()
    expect(screen.queryByText('That is not a photo.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()
  })

  it('takes the image and prevents the default when the clipboard carries text too', async () => {
    mockUploadPipeline()
    render(<Composer {...baseProps()} />)

    expect(
      pasteFiles([
        new File(['some caption'], 'caption.txt', { type: 'text/plain' }),
        imageFile('image.png', 'image/png'),
      ]),
    ).toBe(false)

    await waitFor(() => expect(compressForNina).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('That is not a photo.')).not.toBeInTheDocument()
  })
```

**Impact:** six new cases, no existing case edited. `fireEvent` is already imported at line 2 and
`waitFor` at line 2; nothing new needs importing. The `beforeEach` mock resets at lines 106-112
already cover every mock these cases touch.

## Verification

This worktree is **fresh — it has no `node_modules` and no `.env.local`.** Both are needed before
anything below runs, and a `node_modules` SYMLINK is not enough (it passes vitest and then
Turbopack's build rejects it):

```bash
cd /home/miftah/.worktrees/run-insights/composer-clipboard-image-paste
cp /home/miftah/run-insights/.env.local .
npm install
```

**Build (typecheck — vitest does NOT typecheck):**

```bash
cd /home/miftah/.worktrees/run-insights/composer-clipboard-image-paste && npm run typecheck
```

(that is `next typegen && tsc --noEmit`; skipping the typegen half produces spurious `PageProps`
errors that have nothing to do with this change)

**Tests:**

```bash
cd /home/miftah/.worktrees/run-insights/composer-clipboard-image-paste && npx vitest run components/nina/Composer.test.tsx
cd /home/miftah/.worktrees/run-insights/composer-clipboard-image-paste && npm test
```

**Lint and format:**

```bash
cd /home/miftah/.worktrees/run-insights/composer-clipboard-image-paste && npx eslint components/nina
cd /home/miftah/.worktrees/run-insights/composer-clipboard-image-paste && npx prettier --check components/nina/useComposerPhotos.ts components/nina/Composer.tsx components/nina/Composer.test.tsx
```

**Manual check** (optional, `npm run dev` then `/nina`): copy an image in another app, focus the
composer's textarea, paste — a tile appears, spins, goes solid, Send lights up. Then copy a
paragraph of text and paste it into the same box — it inserts as text, with no tile and no notice.

**Exit criteria:**
- `useComposerPhotos` returns an `onPaste`, and `Composer`'s `<textarea>` carries `onPaste={onPaste}`.
- `onPick` and `onPaste` both reach `process()` only through `handleFiles`; `planNinaPicked`,
  `URL.createObjectURL`, `setTiles`, `setNotice` and the `process` loop each appear exactly once in
  the file.
- All six new cases and all twenty pre-existing cases in `Composer.test.tsx` pass, and the full
  `npm test` suite is green.
- `npm run typecheck` is clean.

## Handoffs

Nothing is handed to another phase — this set has one phase. Found and deliberately NOT done here,
for a future set if it is ever wanted:

- **Drag-and-drop attach.** `handleFiles` now makes it an ~8-line `onDrop` adapter on the composer
  bar, and the analysis's "out of scope" list names it. Not asked for; not added.
- **A pasted image's generic filename.** A clipboard `File` is typically `image.png`, so the tile
  carries no meaningful name. Nothing downstream reads the name (the stored pathname is
  `ninaChatPathname(userId, newId())`), so there is nothing to fix — noted only so the next reader
  does not go looking for the name in the send payload.
- **Paste into any other input in the app** (admin surfaces, album upload). Out of scope by the
  plan index; the ask was specifically the Nina chat composer.
- **The `never`-returning notice for a non-image paste.** Dropping non-image clipboard files
  silently is a judgement call recorded in the hook's header and pinned by the fifth test; if the
  owner later wants "That is not a photo." on a paste too, it is a one-line change in `onPaste`
  (pass `pasted` instead of `images` to `handleFiles` once an image is present).

## Rollback

Single commit, three files, all under `components/nina/`, no server state and no migration:

```bash
cd /home/miftah/.worktrees/run-insights/composer-clipboard-image-paste
git checkout origin/main -- components/nina/useComposerPhotos.ts components/nina/Composer.tsx components/nina/Composer.test.tsx
```

or revert the phase's commit. Nothing outside the browser ever saw the difference between a pasted
and a picked photograph, so there is no data to unwind: rows already written by a pasted image are
ordinary `kind: 'upload'` chat images and stay valid after a revert.
