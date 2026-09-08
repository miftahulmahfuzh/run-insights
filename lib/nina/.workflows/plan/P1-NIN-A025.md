Adopted from `SEARCH_JUMP_PINPOINT_PLAN.md` phase 1. Source: `.workflows/plan/search-jump-pinpoint/phase-1.md`.
Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: Search hits deep-link through `?jump=` and the landing survives a same-session soft nav

**Plan set:** `SEARCH_JUMP_PINPOINT_PLAN.md`
**Analysis:** `20260908-142555-A3F7_code_analyzer.md`
**Satisfies:** R1 (search tap → session → auto-scroll to the referenced bubble), R2 (blue outline, the reply-to effect)
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

A message hit in the sidebar's search results navigates to `/nina?s=<sid>&jump=<mid>` — the same
URL `/nina/jobs/[id]`'s "Buka chat-nya" button builds, via the same `ninaJumpHref` — and the
ChatScreen landing (instant scroll into the composer-safe band + blue ring for `QUOTE_FLASH_MS`)
fires on BOTH arrival paths: the existing mount path (cross-session hit) and a new watcher for a
same-session soft navigation, which today `?jump=` cannot serve. `?at=`'s contract is untouched.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**
- `nextSoftNavJump(prev: string | null, raw: string | null): string | null` — appended pure export
  at the end of `lib/nina/jobview.ts`. Semantics: `raw === null` → `null`; `raw === prev` → `null`
  (already handled / the mount value); otherwise `parseNinaJumpParam(raw)` (null when invalid).
- `landOn(targetId: string)` — new `useCallback` inside `ChatScreen` (not exported; component-local).
- One new `useEffect` in `ChatScreen` watching `searchParams.get(JOB_JUMP_PARAM)`; one new
  `useRef<string | null>` (`softNavSeen`) initialised to the first render's raw jump value.

**Changes:**
- `searchHitHref` behaviour: message hits now return `ninaJumpHref({ sessionId, messageId,
  sessionParam: SESSION_PARAM })` = `/nina?s=<sid>&jump=<mid>` (was `/nina?s=<sid>&at=<mid>~0`);
  session hits (`messageId: null`) return `/nina?s=<sid>` byte-identically to today. Signature
  unchanged: `(hit: { sessionId: string; messageId: string | null }) => string`.
- `lib/nina/search.ts` gains `import { ninaJumpHref } from './jobview'` (verified safe:
  `jobview.ts` imports only `@/lib/format` and `@/lib/id`, and is already imported both by
  `'use client'` components and by the `'use server'` `lib/nina/jobActions.ts`).
- `ChatScreen`'s mount landing effect deps change from `[measureQuoteScroll, flashMessage]` to
  `[landOn]` (behaviour-identical: both underlying callbacks are stable).
- One comment paragraph appended to the strip effect's header in `ChatScreen` (documents the
  sanctioned second `replaceState` writer; no code change to that effect).

**Deletes:** nothing. No config keys, no renames.

**Requires (from earlier phases):** none.

**Leaves alone (owned by others / out of scope):** `components/nina/MessageList.tsx`,
`components/nina/MessageBubble.tsx`, `components/nina/useChatScroll.ts`, `lib/nina/scroll.ts`,
`lib/nina/reply.ts`, `components/nina/NinaSearchField.tsx`, `app/nina/page.tsx`,
`lib/nina/searchActions.ts`, and `handleJumpToQuote` in `ChatScreen` (reply-to behaviour stays
byte-unchanged — it uses `plan.behavior` = smooth and no second rAF, deliberately different from
the landing's `'instant'`).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/jobview.ts` | modify | append the `nextSoftNavJump` guard + doc comment at end of file (after `NINA_JOB_JUMP_NOTE`, line 447) — appended, not interleaved, per the dirty-file hazard in the analysis |
| `lib/nina/search.ts` | modify | `searchHitHref` delegates to `ninaJumpHref`; doc comment rewritten; add the `./jobview` import |
| `lib/nina/search.test.ts` | modify | rewrite the `searchHitHref` suite (lines 258–278) for the jump grammar; add three test-file imports |
| `tests/nina.jobview.test.ts` | modify | append a `nextSoftNavJump` describe block; add `nextSoftNavJump` to the import list |
| `components/nina/ChatScreen.tsx` | modify | import the guard; extract `landOn` from the mount landing effect; add the soft-nav watcher effect; extend the strip comment by one paragraph |

## Implementation Steps

Quoted anchors are the bytes in this worktree at base `9db3113` (the tree is clean except the two
untracked plan/analysis `.md` files).

### Step 0: Make the worktree runnable

A fresh worktree has neither `node_modules` nor `.env.local` — verified absent here. `lib/env.ts`
validates 14 vars at load, so typecheck, vitest and build all die until both exist.

```bash
cd /home/miftah/.worktrees/run-insights/search-jump-pinpoint
cp /home/miftah/run-insights/.env.local .env.local
npm install
```

### Step 1: The one-shot guard, appended to `lib/nina/jobview.ts`

**File:** `lib/nina/jobview.ts:447` (append after the file's last export)
**Change:** append the section below, verbatim, after the `NINA_JOB_JUMP_NOTE` const (the current
end of file):

```ts
export const NINA_JOB_JUMP_NOTE: Record<Exclude<NinaJobJump['kind'], 'ready'>, string> = {
  avatar:
    'Foto ini bukan dari chat — Nina ganti foto profilnya sendiri, jadi nggak ada bubble yang memicunya.',
  'no-message': 'Job ini nggak nyimpen pesan pemicunya, jadi nggak ada bubble yang bisa dituju.',
  gone: 'Pesan yang minta foto ini sudah nggak ada — kehapus, atau chatnya dihapus.',
}
```

**Code to append:**

```ts
/* ── the soft-navigation guard ────────────────────────────────────────────────────────────── */

/**
 * **The one-shot rule for a `?jump=` that arrives WITHOUT a remount, as a function rather than as
 * a `useRef` comparison buried inside `ChatScreen`.**
 *
 * `app/nina/page.tsx` keys `ChatScreen` by the session id, so a `?jump=` naming a DIFFERENT
 * conversation remounts the screen and the mount path delivers it: `jumpRef`'s initialiser runs on
 * the first render and nowhere else, which is already one-shot by construction. But a `?jump=`
 * naming the session already on screen — a search hit tapped while its own conversation is open —
 * is a soft navigation: same key, no remount, that initialiser never runs. Somebody has to notice
 * the NEW arrival without also firing on the mount value, and this is that rule.
 *
 * `prev` is the last RAW value the caller saw on a render (its ref is initialised to the first
 * render's value, so the mount case answers "already seen" and never double-lands beside the
 * `jumpRef` path); `raw` is the value on THIS render. Three answers:
 *
 *   - `raw === null` — nothing arrived. `null`, and the caller resets `prev` to `null`, which is
 *     what makes a repeat GENUINE: the landing strips the parameter from the entry, so a later
 *     arrival of the same id is a second tap the runner meant, not a repeat render.
 *   - `raw === prev` — this render's value has been handled (or is the mount value). `null`.
 *   - anything else — a new arrival: `parseNinaJumpParam(raw)`, which is `null` when the value
 *     cannot be one of our ids. The caller records `raw` as `prev` regardless, so a malformed
 *     value is not retried on every render.
 *
 * It lives beside `JOB_JUMP_PARAM` for the same reason `parseNinaJumpParam` does: this is that
 * parameter's rule, and `vitest` runs `environment: 'node'` with no jsdom — a comparison written
 * inside a `'use client'` component is a comparison nothing in this repo can assert. The caller's
 * obligations after calling are one line: assign the raw value it was handed onto the ref.
 */
export function nextSoftNavJump(prev: string | null, raw: string | null): string | null {
  if (raw === null) return null
  if (raw === prev) return null
  return parseNinaJumpParam(raw)
}
```

**Impact:** purely additive; no existing import or behaviour changes.

### Step 2: Guard tests, appended to `tests/nina.jobview.test.ts`

**File:** `tests/nina.jobview.test.ts:19` (import list) and end of file (line 296)
**Change:** add `nextSoftNavJump` to the existing `@/lib/nina/jobview` import — it slots
alphabetically between `ninaJobTitle` and `ninaJumpHref` (uppercase-first ordering, as the list
already keeps). Current import block:

```ts
import {
  JOB_JUMP_PARAM,
  NINA_JOBS_HREF,
  NINA_JOB_JUMP_NOTE,
  NINA_JOB_STAGE_LABEL,
  formatJobLatency,
  formatMicroUsd,
  jobCanRedo,
  jobElapsedSeconds,
  jobErrorLabel,
  jobIsOpen,
  jobStage,
  ninaJobHref,
  ninaJobTitle,
  ninaJumpHref,
  parseNinaJumpParam,
  planJobJump,
  toNinaJobListItems,
} from '@/lib/nina/jobview'
```

becomes:

```ts
import {
  JOB_JUMP_PARAM,
  NINA_JOBS_HREF,
  NINA_JOB_JUMP_NOTE,
  NINA_JOB_STAGE_LABEL,
  formatJobLatency,
  formatMicroUsd,
  jobCanRedo,
  jobElapsedSeconds,
  jobErrorLabel,
  jobIsOpen,
  jobStage,
  ninaJobHref,
  ninaJobTitle,
  ninaJumpHref,
  nextSoftNavJump,
  parseNinaJumpParam,
  planJobJump,
  toNinaJobListItems,
} from '@/lib/nina/jobview'
```

Then append this block after the closing `})` of `describe('the numbers', …)` — the file's last
describe:

```ts
describe('nextSoftNavJump is the one-shot rule for a jump that does not remount', () => {
  it('lands a value it has not seen, from no prev and from a different one', () => {
    expect(nextSoftNavJump(null, 'bbbbbbbbbbbb')).toBe('bbbbbbbbbbbb')
    expect(nextSoftNavJump('aaaaaaaaaaaa', 'bbbbbbbbbbbb')).toBe('bbbbbbbbbbbb')
  })

  it('does not land the value it was initialised to — mount is the ref path’s job', () => {
    /* The caller’s ref starts at the first render’s raw value, so the mount render answers
     * "already seen" and the jumpRef path owns the landing. */
    expect(nextSoftNavJump('bbbbbbbbbbbb', 'bbbbbbbbbbbb')).toBeNull()
  })

  it('after the strip (null resets prev), the same value is new again', () => {
    /* Mount: seen = raw, nothing to do. The landing strips the param, the next render sees null,
     * the caller resets prev — so a second tap of the SAME hit re-lands. */
    let prev: string | null = 'bbbbbbbbbbbb'
    expect(nextSoftNavJump(prev, 'bbbbbbbbbbbb')).toBeNull()
    prev = 'bbbbbbbbbbbb'
    const stripped: string | null = null
    expect(nextSoftNavJump(prev, stripped)).toBeNull()
    prev = stripped
    expect(nextSoftNavJump(prev, 'bbbbbbbbbbbb')).toBe('bbbbbbbbbbbb')
  })

  it('refuses anything that cannot be one of our ids', () => {
    expect(nextSoftNavJump(null, 'short')).toBeNull()
    expect(nextSoftNavJump('aaaaaaaaaaaa', 'not-an-id-!!')).toBeNull()
  })

  it('has nothing to say when nothing arrived', () => {
    expect(nextSoftNavJump('bbbbbbbbbbbb', null)).toBeNull()
    expect(nextSoftNavJump(null, null)).toBeNull()
  })
})
```

**Impact:** none — additive.

### Step 3: `searchHitHref` delegates to `ninaJumpHref`

**File:** `lib/nina/search.ts:25` (import) and `lib/nina/search.ts:326-357` (doc comment + function)
**Change:** add the import, then replace the whole block. Current text at 326–357:

```ts
/**
 * Where a hit goes: **phase 3's `?s=` and `lib/nina/scroll.ts`'s `?at=`, and no third grammar.**
 *
 * `decodeChatScrollMark` accepts `<messageId>~<offset>` with the id matching
 * `^[A-Za-z0-9_-]{1,64}$` and the offset `^-?\d{1,6}$`, and `resolveRestoreTop` returns
 * `anchorTop - offset` clamped into the document. So `~0` means "this message's top edge at the top
 * of the viewport", which is exactly a jump to it, and `components/nina/MessageList.tsx` already
 * consumes the mark. Deep-linking to the message therefore costs one function and no new parameter.
 *
 * `encodeURIComponent` rather than `URLSearchParams`: the latter percent-encodes `~` to `%7E`,
 * which round-trips fine through `useSearchParams().get('at')` but throws away the reason
 * `scroll.ts` chose `~` in the first place ("unreserved in a query string, so no percent-encoding").
 * Ids are `[0-9A-Za-z_-]{12}` so the call is a no-op in practice and correct hygiene anyway.
 *
 * **A message older than `CHAT_HISTORY_LIMIT` inside its own session degrades**: the anchor is not
 * in the document, `resolveRestoreTop` returns `null`, and the screen opens where it normally
 * would. That is `scroll.ts`'s documented behaviour, not a new failure mode.
 *
 * **RECONCILED: the parameter's name is imported, not spelled.** Phase 3 exports
 * `SESSION_PARAM = 's'` from `lib/nina/active.ts`, which is pure and client-safe (its cap comes
 * from phase 1's `lib/nina/sessions.ts`, and phase 4's model call lives in
 * `lib/nina/autotitle.ts`, so nothing `server-only` is reachable from it). This module is imported
 * by the `'use client'` `NinaSearchField`, so that matters — and it is the very path phase 4's D1
 * cites when it argues for keeping `active.ts` pure. Phase 5's session hrefs import the same
 * constant, so `?s=` has exactly one spelling in the set.
 */
export function searchHitHref(hit: { sessionId: string; messageId: string | null }): string {
  const session = encodeURIComponent(hit.sessionId)
  const base = `/nina?${SESSION_PARAM}=${session}`
  if (hit.messageId === null) return base
  return `${base}&at=${encodeURIComponent(hit.messageId)}~0`
}
```

The import at line 25:

```ts
import { SESSION_PARAM } from './active'
```

becomes:

```ts
import { SESSION_PARAM } from './active'
import { ninaJumpHref } from './jobview'
```

The replacement block (doc comment + function):

```ts
/**
 * Where a hit goes: **`lib/nina/active.ts`'s `?s=` and `lib/nina/jobview.ts`'s `?jump=`, and no
 * third grammar.**
 *
 * The message arm DELEGATES to `ninaJumpHref`, so a search tap and `/nina/jobs/[id]`'s "Buka
 * chat-nya" button build the same URL and land through the same code in `ChatScreen`: instant
 * scroll into the band the composer leaves over, then the blue ring for `QUOTE_FLASH_MS`. That is
 * the ask in one sentence — "the same effect as clicking the reply-to box" — and the four reasons
 * `jobview.ts` documents for `jump` ≠ `at` all hold for a search box too: different arithmetic,
 * no offset to give (a search field never measured this conversation), opposite lifetimes, and
 * the two must coexist on one entry.
 *
 * The session arm keeps its hand-built `encodeURIComponent` form, byte-for-byte as it was: one
 * key, no `~` anywhere, so `scroll.ts`'s unreserved-tilde argument is out of scope and there is
 * nothing to migrate. Ids are `[0-9A-Za-z_-]{12}`, so `URLSearchParams` inside `ninaJumpHref`
 * encodes nothing — correct hygiene without a second spelling of `?s=`.
 *
 * **A message older than `CHAT_HISTORY_LIMIT` inside its own session degrades to the
 * `'quote-missing'` notice** — the landing's own degradation in `ChatScreen`, which is already the
 * right sentence — rather than this function's old behaviour of a `?at=` that silently failed to
 * restore. The hit's message is real (the SQL read it); it is simply not among the rows the screen
 * renders, and a sentence beats a tap that looks broken.
 *
 * **RECONCILED: the parameter's name is imported, not spelled.** Phase 3 exports
 * `SESSION_PARAM = 's'` from `lib/nina/active.ts`, which is pure and client-safe (its cap comes
 * from phase 1's `lib/nina/sessions.ts`, and phase 4's model call lives in
 * `lib/nina/autotitle.ts`, so nothing `server-only` is reachable from it). This module is imported
 * by the `'use client'` `NinaSearchField`, so that matters — and it is the very path phase 4's D1
 * cites when it argues for keeping `active.ts` pure. Phase 5's session hrefs import the same
 * constant, so `?s=` has exactly one spelling in the set. The `./jobview` import is safe for the
 * same reason twice over: `jobview.ts` imports nothing but `lib/format` and `lib/id`, and the
 * `'use server'` `lib/nina/jobActions.ts` already imports it beside this module's other consumer,
 * the Server Action `searchActions.ts`.
 */
export function searchHitHref(hit: { sessionId: string; messageId: string | null }): string {
  if (hit.messageId === null) {
    return `/nina?${SESSION_PARAM}=${encodeURIComponent(hit.sessionId)}`
  }
  return ninaJumpHref({
    sessionId: hit.sessionId,
    messageId: hit.messageId,
    sessionParam: SESSION_PARAM,
  })
}
```

**Impact:** `NinaSearchHit.href` for message hits changes grammar (intended — R1/R2). `NinaSearchField`
renders `hit.href` unchanged. No other caller of `searchHitHref` exists (`toSearchHit` alone).
`NinaSearchHit.href`'s field comment ("`searchHitHref`, so the grammar is tested and not retyped")
stays true and is not edited.

### Step 4: Rewrite the href test suite in `lib/nina/search.test.ts`

**File:** `lib/nina/search.test.ts:1-33` (imports) and `lib/nina/search.test.ts:258-278` (the suite)
**Change:** the current import tail is

```ts
  searchHitHref,
  searchTerms,
  semanticCandidateBlock,
  shouldRunSearch,
  shouldRunSemantic,
  snippetAround,
  type NinaSearchCandidate,
} from './search'
```

Append after it (new module imports; the file has no import sorter, so no ordering gate applies):

```ts
import { SESSION_PARAM } from './active'
import { ninaJumpHref } from './jobview'
import { CHAT_SCROLL_PARAM } from './scroll'
```

Replace the whole existing suite (current bytes):

```ts
/* ── the href: no third URL grammar ────────────────────────────────────────────────────────── */

describe('searchHitHref', () => {
  it('deep-links to the message through phase 3 s ?s= and scroll.ts s ?at=', () => {
    expect(searchHitHref({ sessionId: 'sess00000001', messageId: 'msg000000001' })).toBe(
      '/nina?s=sess00000001&at=msg000000001~0',
    )
  })

  it('leaves the ~ unencoded, which is why scroll.ts chose it', () => {
    const href = searchHitHref({ sessionId: 's1', messageId: 'm1' })
    expect(href).toContain('~0')
    expect(href).not.toContain('%7E')
  })

  it('opens the session with no mark when the hit is a title', () => {
    expect(searchHitHref({ sessionId: 'sess00000001', messageId: null })).toBe(
      '/nina?s=sess00000001',
    )
  })
})
```

with:

```ts
/* ── the href: no third URL grammar ────────────────────────────────────────────────────────── */

describe('searchHitHref', () => {
  it('deep-links to the message through active.ts s ?s= and jobview.ts s ?jump=', () => {
    expect(searchHitHref({ sessionId: 'sess00000001', messageId: 'msg000000001' })).toBe(
      '/nina?s=sess00000001&jump=msg000000001',
    )
  })

  it('is the href the job pages button builds — one builder, not a second spelling', () => {
    /* The pin in `ninaJumpHref`. If a search tap and a "Buka chat-nya" tap ever disagreed about
     * the grammar, one of the two landings would break while the other kept working. */
    const input = { sessionId: 'aaaaaaaaaaaa', messageId: 'bbbbbbbbbbbb' }
    expect(searchHitHref(input)).toBe(ninaJumpHref({ ...input, sessionParam: SESSION_PARAM }))
  })

  it('writes no scroll mark — at keeps saveMark as its only writer', () => {
    const url = new URL(
      searchHitHref({ sessionId: 'sess00000001', messageId: 'msg000000001' }),
      'https://example.test',
    )
    expect(url.searchParams.has(CHAT_SCROLL_PARAM)).toBe(false)
  })

  it('opens the session with no mark when the hit is a title', () => {
    expect(searchHitHref({ sessionId: 'sess00000001', messageId: null })).toBe(
      '/nina?s=sess00000001',
    )
  })
})
```

**Impact:** the old `~`-encoding test is deleted with its rationale (the tilde is gone from the
grammar); the `at`-absence assertion takes its place as the guard against quietly reintroducing
restore semantics.

### Step 5: `ChatScreen` — import the guard

**File:** `components/nina/ChatScreen.tsx:32`
**Change:** current:

```ts
import { JOB_JUMP_PARAM, parseNinaJumpParam } from '@/lib/nina/jobview'
```

becomes:

```ts
import { JOB_JUMP_PARAM, nextSoftNavJump, parseNinaJumpParam } from '@/lib/nina/jobview'
```

### Step 6: `ChatScreen` — extend the strip comment with the sanctioned second writer

**File:** `components/nina/ChatScreen.tsx:368-374`
**Change:** the strip effect's header currently ends (do not touch the code below it):

```ts
 * ── AND SINCE F35 PHASE 4, `?jump=` IS THE THIRD KEY THIS EFFECT DELETES ────────────────────
 * R1's deep link from `/nina/jobs/[id]`. **The deletes are BY NAME so that `?s=` and `?at=`
 * survive; a fourth parameter belongs in this same list, never in a new effect** — which is the
 * general form of the rule the two paragraphs above state about `?s=` in particular. Phase 4
 * added a `delete`, not a `replaceState`, and that is precisely why its change went inside this
 * effect rather than beside it.
 */
```

Insert this paragraph immediately before the closing `*/` (so the header stays honest about the
component it describes — without it, the sentence below it would be false after Step 8):

```ts
 * ── AND THE ONE SANCTIONED SECOND WRITER: THE SOFT-NAV WATCHER BELOW ────────────────────────
 * "Do not add a third `replaceState`" keeps its exact meaning: never TWO writers in ONE commit,
 * because two writers in one commit race to decide which URL survives. The watcher that lands a
 * same-session `?jump=` (search hit for the open conversation — see its own header) also deletes
 * the key by name, but in the commit where the navigation arrived, a commit this effect does not
 * run in (its deps are `[]`), and in which the only other writer of the URL was the navigation
 * itself. Same idiom, same by-name rule, still one writer per commit.
```

### Step 7: `ChatScreen` — extract `landOn`, rewrite the mount effect, add the watcher

**File:** `components/nina/ChatScreen.tsx:663-722`
**Change:** replace the entire region — the big landing doc comment plus the landing effect — with
the three blocks below. The region being replaced, current bytes, starts at

```ts
  /**
   * **R1's landing: a job page said "this bubble", so pinpoint it.**
```

and ends at

```ts
    return () => window.cancelAnimationFrame(frame)
  }, [measureQuoteScroll, flashMessage])
```

(the code immediately before it is `handleJumpToQuote`, ending `[measureQuoteScroll, flashMessage],
  )`; immediately after it begins the `R8, arming.` comment). Replace it with:

```ts
  /**
   * **The landing: something said "this bubble", so pinpoint it.** One callback so the two ways a
   * `?jump=` can arrive — a MOUNT (`/nina/jobs/[id]`'s "Buka chat-nya", or a search hit for a
   * different conversation) and a same-session SOFT NAVIGATION (a search hit for the conversation
   * already on screen, handled by the watcher below) — cannot drift into two
   * scroll-and-flash arithmetics. The extraction follows `measureQuoteScroll`'s own precedent one
   * position up: that one was pulled out of `handleJumpToQuote` so the mount landing would reuse
   * the quote tap's arithmetic rather than invent a second one, and this callback now sits under
   * both arrivals for the same reason.
   *
   * ── WHY IT REUSES `planQuoteScroll` ───────────────────────────────────────────────────────
   * The user asked for it in those words — "just like how we can click and directly pinpoint
   * reply_to message". A second scroll-and-flash would be a second set of rules about the band the
   * composer leaves over, and the two would drift the first time the composer's geometry changed.
   *
   * ── WHY `'instant'`, OVERRIDING THE PLAN'S OWN `behavior` ─────────────────────────────────
   * `planQuoteScroll` chooses `'smooth'` because a quote tap is a movement WITHIN a screen the
   * runner is already reading, and watching the page travel is what tells them they went backwards.
   * This is an ARRIVAL: the runner navigated here from elsewhere and has not seen this
   * conversation yet, so there is no "from" to animate out of — smooth-scrolling a screen that
   * just painted only shows them the bottom of the chat on the way past. `MessageList`'s R14
   * restore takes `'instant'` for the same reason and says so. (`handleJumpToQuote` keeps the
   * plan's `'smooth'` on purpose: it is the within-screen case.)
   *
   * ── WHY AN ANIMATION FRAME, AND WHY TWICE ─────────────────────────────────────────────────
   * The callers schedule this inside one `requestAnimationFrame` so layout has settled; the second
   * application below is `MessageList`'s restore idiom, verbatim and for its reason: a web font
   * settling or an image finishing decode moves the target after the first measurement, and
   * re-deriving the same pure number from the element's new position is cheap. When nothing moved,
   * `planQuoteScroll` returns `'none'` under its 8px tolerance and the second call is a no-op.
   *
   * ── IT MUST NOT CALL `revealBubbles` ──────────────────────────────────────────────────────
   * That callback is phase 3's staggered reveal of rows Nina has just sent, and it is the SOLE
   * appender of her bubbles. This callback appends nothing: every row it can land on was already
   * rendered. Scrolling is not arriving.
   *
   * A missing element is the `'quote-missing'` notice, which is already the right sentence: the
   * message is real (the job page resolved it against the database; the search SQL read it) but it
   * is not among the `CHAT_HISTORY_LIMIT` rows this screen renders.
   */
  const landOn = useCallback(
    (targetId: string) => {
      const plan = measureQuoteScroll(targetId)
      if (plan === null) {
        setNotice('quote-missing')
        return
      }
      if (plan.kind === 'scroll') window.scrollTo({ top: plan.top, behavior: 'instant' })
      flashMessage(targetId)

      window.requestAnimationFrame(() => {
        if (!alive.current) return
        const again = measureQuoteScroll(targetId)
        if (again !== null && again.kind === 'scroll') {
          window.scrollTo({ top: again.top, behavior: 'instant' })
        }
      })
    },
    [measureQuoteScroll, flashMessage],
  )

  /* R1's mount landing. `jumpRef`'s block above states the one-shot reasoning; the short version:
   * the ref is cleared inside the frame rather than the effect body so StrictMode's first,
   * immediately torn-down run leaves the target for the second run, and the frame is cancelled on
   * cleanup so a navigation away mid-flight lands on nothing. The landing itself is `landOn`'s —
   * this effect only decides WHEN, never HOW. */
  useEffect(() => {
    if (jumpRef.current === null) return

    const frame = window.requestAnimationFrame(() => {
      const targetId = jumpRef.current
      if (targetId === null || !alive.current) return
      jumpRef.current = null
      landOn(targetId)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [landOn])

  /*
   * ── R1's OTHER ARRIVAL: A `?jump=` THAT DOES NOT REMOUNT ─────────────────────────────────
   * `app/nina/page.tsx` keys this component by the session id, so a jump naming a DIFFERENT
   * conversation remounts and the effect above delivers it. A jump naming the one already open —
   * a search hit tapped while its own session is on screen — is a soft navigation: same key, no
   * remount, `jumpRef`'s initialiser never runs, and the strip effect at the top of this file
   * (deps `[]`) never re-runs. Before search switched onto `?jump=`, `?at=` covered this case
   * through `MessageList`'s restore, so leaving it unhandled would be a regression, not a gap.
   *
   * ── WHY THE GUARD REF IS INITIALISED TO THE MOUNT VALUE ────────────────────────────────────
   * On a mount that CARRIES a `?jump=`, this effect's first run sees the same raw string its ref
   * was initialised to, `nextSoftNavJump` answers "already seen", and the landing belongs to the
   * mount path above. Without the initialised ref, a deep-linked mount would scroll and flash
   * TWICE. `nextSoftNavJump` (in `lib/nina/jobview.ts`, tested there because `vitest` has no
   * jsdom) owns the rest of the rule: the ref records the raw value after every run, and a `null`
   * raw resets it — so once the strip has consumed the parameter, a FRESH navigation to the same
   * id still counts as new (a genuine second tap on the same hit lands again).
   *
   * ── WHY THE STRIP RUNS BEFORE THE FRAME ───────────────────────────────────────────────────
   * The landing reads the DOM (`measureQuoteScroll` → `getElementById`), never the URL, so
   * removing the parameter first cannot starve it — and stripping in the same tick closes the
   * re-arm window a frame earlier. It deletes BY NAME on a `URLSearchParams` copy of
   * `window.location.search`, the idiom of the mount-time strip above, so `?s=` and `?at=`
   * survive; it reads `window.location.search` rather than the `searchParams` snapshot for the
   * reason `saveMark` states ("the write has to be against whatever the URL is at the moment");
   * and it skips itself when the key is already gone, which is the case where the mount-time
   * strip won the race on a freshly mounted screen. `replaceState`, not a navigation, for the
   * reason that header gives — this entry is where we already are — and Next 16 patches it so
   * `useSearchParams` stays in sync afterwards, which is what delivers the `null` render that
   * resets the guard.
   *
   * RESIDUAL EDGE, accepted: a second tap of the SAME hit re-navigates to a byte-identical URL,
   * which the router may deduplicate into no render at all — no re-land. The first tap landed,
   * so nothing is lost; telling a repeat tap from a repeat render is not worth a nonce in the URL.
   */
  const jumpRaw = searchParams.get(JOB_JUMP_PARAM)
  const softNavSeen = useRef<string | null>(jumpRaw)
  useEffect(() => {
    const targetId = nextSoftNavJump(softNavSeen.current, jumpRaw)
    softNavSeen.current = jumpRaw
    if (targetId === null) return

    const params = new URLSearchParams(window.location.search)
    if (params.has(JOB_JUMP_PARAM)) {
      params.delete(JOB_JUMP_PARAM)
      const query = params.toString()
      window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
    }

    const frame = window.requestAnimationFrame(() => {
      if (alive.current) landOn(targetId)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [jumpRaw, landOn])
```

**Impact and reasoning notes for the implementer:**

- `landOn`'s deps `[measureQuoteScroll, flashMessage]` are both stable `useCallback`s (deps `[]`),
  so `landOn` is stable and the mount effect's `[landOn]` is behaviourally the old
  `[measureQuoteScroll, flashMessage]`. `setNotice` is a state setter (stable, never a dep) and
  `alive` is a ref.
- The watcher's `useRef(jumpRaw)` sits low in the file rather than beside `jumpRef`: a ref's
  initialiser only matters on the first render, wherever the line is, and the ref belongs to the
  effect that owns it. Hook order is unchanged in kind (all hooks unconditional).
- An INVALID raw value (`nextSoftNavJump` → null via `parseNinaJumpParam`) neither lands nor
  strips on this path: nothing consumed it, and the mount-time strip remains the thing that tidies
  a forged `jump` off the entry. Recording it as `prev` still happens, so it is not retried every
  render.
- StrictMode: the watcher's double-invoked first run calls the guard twice with the same
  `(mountValue, mountValue)` and returns null twice; no frame is scheduled, so there is nothing to
  cancel and nothing to double-land.
- `NinaSearchField`'s hit `<Link>` already calls `onNavigate` (the sidebar folds), and the pushed
  URL carries no `sidebar` key — the panel closes exactly as it does for today's `?s=`/`?at=` hits.
  No change needed or made there.

## Verification

Run everything from the worktree root. Step 0's two commands are prerequisites; `lib/env.ts`
validates 14 vars at load, so typecheck/vitest die without `.env.local`, and there is no
`node_modules` until `npm install` (both verified absent in this worktree).

**Build (types):**
```bash
cd /home/miftah/.worktrees/run-insights/search-jump-pinpoint && npm run typecheck
```

**Lint:**
```bash
cd /home/miftah/.worktrees/run-insights/search-jump-pinpoint && npm run lint
```

**Targeted tests (iteration):**
```bash
cd /home/miftah/.worktrees/run-insights/search-jump-pinpoint && npx vitest run lib/nina/search.test.ts tests/nina.jobview.test.ts
```

**Full suite — the phase's gate:**
```bash
cd /home/miftah/.worktrees/run-insights/search-jump-pinpoint && npx vitest run
```

**Manual smoke checklist** (there is no jsdom, so the watcher effect itself is covered by the pure
guard's tests plus these steps — run the dev server on a port other than 3000, which is held by a
stranger process that 302s everything to /login):

```bash
cd /home/miftah/.worktrees/run-insights/search-jump-pinpoint && npm run dev -- -p 3100
```

1. **Same-session hit (the new path).** Open a session, open the sidebar's search, search a term
   that hits a message IN that session, tap the hit. Expect: the sidebar folds, the page scrolls
   instantly (no smooth animation) putting the bubble in the readable band, the blue ring
   (`ring-2 ring-accent`) holds ~1.6 s, exactly once. The URL ends `?s=<sid>` — `jump` gone, `s`
   intact.
2. **Cross-session hit (the mount path, unchanged).** With a different session open, tap a hit.
   Expect the identical landing, once, and the same URL state.
3. **Session-title hit.** Tap a `kind: 'session'` row. Expect: the session opens plain, no scroll,
   no flash, no `jump` and no `at` on the URL.
4. **Back-swipe does not re-arm.** After case 1 or 2, navigate to another route (e.g. a run page or
   `/nina/jobs`) and back-swipe into the chat. Expect: NO re-scroll, NO re-flash (the strip removed
   `jump` from the stored entry).
5. **Repeat tap (residual edge).** Tap the same message hit twice in a row. First tap lands; the
   second may do nothing (identical URL). Acceptable by design.
6. **Old message.** A hit whose message is older than `CHAT_HISTORY_LIMIT` in its session shows the
   `'quote-missing'` notice ("That message isn't on this screen any more…") instead of scrolling.

**Exit criteria (mirrors the plan index):** a message hit's href is `/nina?s=<sid>&jump=<mid>`
(session hit: `/nina?s=<sid>`), produced by `ninaJumpHref`; a jump arriving on a soft nav (no
remount) scrolls instantly and flashes exactly as the mount path does, once, and strips itself from
the entry; the mount path's behaviour is unchanged; typecheck, lint and the full vitest suite are
green.

## Handoffs

None — single phase, no other phases in the set. Two deliberate non-changes worth recording for a
future reconciliation of local/`origin/main`: the `nextSoftNavJump` export and its tests are
APPENDED to `lib/nina/jobview.ts` / `tests/nina.jobview.test.ts` (never interleaved) because the
landed-but-unmerged `nina-photo-refs-and-bubble-actions` set (origin `2c987d4`) edits both files;
and `handleJumpToQuote` was left untouched even though it now neighbours a near-twin — its
`plan.behavior`-smooth, no-second-rAF shape is the reply-to contract (invariant 4), not duplication.

## Rollback

Single phase, single revert:

```bash
cd /home/miftah/.worktrees/run-insights/search-jump-pinpoint && git revert <phase-commit>
```

restores the `?at=` href, removes the guard, its tests, `landOn` and the watcher. No migration, no
data, no env change; `?at=`'s own contract was never touched.
