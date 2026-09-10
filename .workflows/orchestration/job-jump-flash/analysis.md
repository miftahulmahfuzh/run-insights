# Code Analysis: image-job "Buka chat-nya" pinpoint+flicker, and the user-bubble flash color

**Type:** Feature Update (investigation of a believed-missing mechanism + a tuning change)
**Date:** 2026-09-10 09:00 WIB
**Session ID:** 20260910-090042
**Plan:** `JOB_JUMP_FLASH_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/job-jump-flash` — branch `feature/job-jump-flash` (base: `origin/main` @ `204fd34`; checkout was clean and local `main` == `origin/main`)

---

## User Input

### Original User Request

> kita sudah punya teknik "auto point to precise bubble + flicker" pada reply to bubble dan search result. namun sekarang image generation job item tidak punya mekanisme ini.
> di halaman Proses foto , klik item teratas dan klik button "Buka chat-nya" , harus nya button ini langsung pinpoint to the exact bubble , plus flicker bubble nya.
>
> additional request: kayanya flicker putih di user's bubble masih kurang conspicuous. coba ganti warna nya jadi warna yang sama dengan warna user's bubble itu sendiri

### User-Provided Context

None beyond the prose. Reproduction named: "Proses foto" page (`/nina/jobs`) → top item → its detail page → the "Buka chat-nya" button.

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | On the Proses foto page, opening the top item and clicking "Buka chat-nya" must pinpoint the exact bubble that triggered the job and flicker it — same technique as reply-to and search results |
| R2 | The flicker on the user's own bubble is not conspicuous enough; change its color to the same color as the user's bubble itself |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: The user believes image-generation job items lack the
"pinpoint + flicker" deep link that reply-to quotes and search hits already have. Investigation
says otherwise: the mechanism is fully wired, on this tree, on `origin/main` — and a jobs jump
lands through **byte-identical code** to a search hit (`searchHitHref` delegates to the same
`ninaJumpHref`; both land through `ChatScreen`'s `landOn`). What differs is only what the user can
SEE: a jobs jump always lands on **his own message** (the photo request is his bubble), and his
bubbles' blink ring is `#fff` — a 2px white ring against light sky paper `#c9e9fb`, which the CSS
comment itself calls "a modest step" and the owner now reports as "masih kurang conspicuous".
Her bubbles blink `--accent` (cyan `#23beeb`), which is why reply-to and search landings read as
working. R1's live fix is therefore R2's color change; R1's residual risk — a mount-path failure
no code reading found — is closed by the phase's live verification, not by new code.

**Success Criteria**:

1. From `/nina/jobs` → top item → "Buka chat-nya": the chat opens with the triggering message
   inside the readable band (or already fully on screen), and that bubble blinks a 2px ring in
   the user bubble's own fill color (`--ink`) — unmistakably visible in light mode, unchanged in
   dark mode.
2. Reply-to quote taps and search-hit landings on **his** bubbles blink the same new color; hers
   keep `--accent`.
3. `prefers-reduced-motion: reduce` still renders a still ring (the reduce keyframe escapes are
   untouched; they already read `var(--nina-flash-ring-color, --accent)`).
4. No behavior change anywhere else: scroll arithmetic, one-shot param semantics, the three
   degraded jump sentences — untouched.

**Key Considerations**:

- **The mechanism is not missing.** The full chain is verified below, link by link, against
  `origin/main` (= what production runs; local `main` had no drift).
- **Measured production data (2026-09-10, read-only SQL against production):** the top job on
  `/nina/jobs` (`xZoxXUCs…`, `ok`, created 09-10 01:50) has a LIVE `args.replyToId` — its message
  sits 8-from-the-end of a 17-message session, comfortably inside the 200-row render window, so
  both the scroll AND the flash fire for the exact case the user described. The next 7 of the top
  8 jobs resolve to nothing (their sessions were deleted; the cascade took the messages) — those
  show the `gone` sentence, not the button, exactly as `planJobJump` documents ("the sentence is
  the COMMON case here").
- **When the target is already on screen, `planQuoteScroll` returns `'none'` and the flash is the
  ONLY signal** (`lib/nina/reply.ts:406-408` — a move under 8px leaves the page alone). An
  invisible flash on that path reads as "nothing happened at all". This is the sharpest version of
  the user's R1 experience, and the color change fixes it without touching the scroll rule.
- **The color must be `var(--ink)`, not a literal.** "Warna yang sama dengan warna user's bubble
  itu sendiri" — the bubble's fill is the TOKEN `bg-ink`, which is `#1d2733` in light mode and
  `#f2f7fa` in dark. Spelling the light-mode hex would vanish against dark paper. `var(--ink)` on
  the bubble element resolves per scheme automatically and is literally the bubble's own fill.
- **Out-of-window targets degrade, unchanged.** A trigger message older than `CHAT_HISTORY_LIMIT`
  (200, `app/nina/page.tsx:111`) is not in the DOM; `landOn` shows the `'quote-missing'` notice.
  Measured population today: zero live cases among recent jobs (the dead ones are dead at the
  SESSION level, not the window level). Changing this would mean a server read of a window ending
  at the target plus poll-cursor consequences — a real feature with no measured need. Documented
  here, out of scope.
- **Assumption**: Vercel deploys `origin/main` automatically; the user's test last night ran a
  deployment containing the complete mechanism (last flash commit `c52abc5`, 09-09 17:13).

---

## Analysis Scope

### Explicitly Mentioned Files

None marked `@`. Named surfaces: the "Proses foto" page (`/nina/jobs`), the "Buka chat-nya"
button, the reply-to bubble landing, the search-result landing.

### Discovered Related Files

- `lib/nina/jobview.ts` (`JOB_JUMP_PARAM`, `parseNinaJumpParam`, `ninaJumpHref`, `planJobJump`,
  `nextSoftNavJump`, `NINA_JOB_JUMP_NOTE`) — the deep-link grammar and the jump decision
- `app/nina/jobs/[id]/page.tsx:90` — server resolves `planJobJump` from
  `getNinaImageJobDetail(userId, id)` (owner-scoped)
- `components/nina/NinaJobDetail.tsx:111-121` — renders `jump.kind === 'ready'` as the
  `ButtonLink` "Buka chat-nya"; the other three kinds as the dashed sentence
- `components/nina/NinaJobList.tsx` — the Proses foto list; rows link to `/nina/jobs/[id]`
  (newest-first, ordered in SQL)
- `components/nina/ChatScreen.tsx` — `jumpRef` (:421), the strip layout effect (:463-480), the
  mount landing (:777-788), the soft-nav watcher (:843-862), `measureQuoteScroll` (:643),
  `flashMessage` (:682), `landOn` (:751), the `'quote-missing'` copy (:139)
- `components/nina/MessageList.tsx:281` — sets `--nina-flash-count` on the list container;
  `flash={message.id === flashId}` (:327)
- `components/nina/MessageBubble.tsx` — the flash call site (:485) and the two comment blocks
  recording the white decision (:61-64, :470-483)
- `app/globals.css:247-306` — `@keyframes nina-flash-blink` + the reduce-mode redefinition; the
  comment block recording the color decision (:260-266)
- `lib/nina/reply.ts` — `planQuoteScroll` (:410), `QUOTE_SCROLL_TOLERANCE_PX` (:316),
  `flashBlinkCount` (:349), `flashHoldMs` (:362), `NINA_FLASH_CYCLE_MS` (:328)
- `lib/nina/search.ts:362-371` — `searchHitHref` delegates to `ninaJumpHref`; the comment at
  :331-334 records the per-side colors in prose
- `lib/nina/chatview.ts` — `decideAutoScroll` (mount always jumps to newest, :119)
- `app/nina/page.tsx` — `CHAT_HISTORY_LIMIT = 200` (:111), session-scoped read (:215),
  `flashBlinkCount(process.env.NINA_FLASH_BLINKS)` (:266)
- `components/ui/Button.tsx:129` — `ButtonLink` is a plain `next/link`; the href (query included)
  passes through untouched
- `tests/motion.reducedMotion.test.ts` — guards the reduce keyframe by name-token only; asserts
  NO ring color (no test changes needed)

---

## Current Dataflow

### Entry Point: "Buka chat-nya" button

**Location:** `components/nina/NinaJobDetail.tsx:112-115`
**Trigger:** click → `next/link` navigation to the `jump.href` computed on the server
**Input Schema:** `{ jump: NinaJobJump }` — `{ kind: 'ready', href: '/nina?s=<sid>&jump=<mid>' }`
**Validation:** the href exists only when `planJobJump` returned `'ready'` — i.e. an owner-scoped
read resolved `args.replyToId` to a live message in a live session
**Next Step:** `app/nina/page.tsx` server render: `chooseActiveSession` honors `?s=`, reads that
session's newest-200 messages, renders `ChatScreen` (keyed by session id)

### Processing Chain (the landing)

1. **`jumpRef`** — `ChatScreen.tsx:421`
   `useRef(parseNinaJumpParam(searchParams.get(JOB_JUMP_PARAM)))` — read on the first render only;
   one-shot by construction. `parseNinaJumpParam` (jobview.ts:75) shape-checks via `isValidId`.
2. **Strip layout effect** — `ChatScreen.tsx:463-480`
   Deletes `?attach=`, `?photo=`, `?jump=` by name from the entry via `replaceState` (so `?s=` and
   `?at=` survive). `?jump=` is a one-shot instruction, not state.
3. **Mount landing effect** — `ChatScreen.tsx:777-788`
   Schedules one rAF; inside it, clears `jumpRef` and calls `landOn(targetId)`. Cleanup cancels
   the frame (StrictMode-safe: the ref is cleared inside the frame, not in the effect body).
4. **Soft-nav watcher** — `ChatScreen.tsx:843-862`
   For a `?jump=` arriving WITHOUT a remount (a search hit for the already-open session):
   `nextSoftNavJob`/`nextSoftNavJump` (jobview.ts:479) decides new-vs-seen, strips the param, and
   lands in an UNCANCELLED rAF (measured in production 2026-09-09 — a cancel-cleanup there loses
   the race against Next's patched `replaceState` transition).
5. **`landOn(targetId)`** — `ChatScreen.tsx:751-770`
   `measureQuoteScroll` (:643) → `document.getElementById('nina-msg-<id>')`; null →
   `setNotice('quote-missing')` (the only failure sentence). Found → `planQuoteScroll`
   (reply.ts:410) centres the target in the band above the composer (`'none'` when already within
   8px), `window.scrollTo({ behavior: 'instant' })`, then `flashMessage(targetId)`, then a second
   rAF re-applies (image decode / font settle).
6. **`flashMessage(targetId)`** — `ChatScreen.tsx:682-692`
   `setFlashId(targetId)`; a timer clears it after `flashHoldMs(flashBlinks)` (reply.ts:362 —
   count × 320ms + one tail cycle; count from `NINA_FLASH_BLINKS` via `flashBlinkCount`, default 4).

### Exit Points (the visible effect)

- `MessageList` sets `--nina-flash-count` on the container (:281) and `flash={id === flashId}` per
  bubble (:327).
- `MessageBubble` (:440, :484-486): `data-flash="true"`, and on the bubble div:
  `'transition-shadow duration-300'`, `flash && mine && '[--nina-flash-ring-color:#fff]'`,
  `flash && '[animation:nina-flash-blink_0.32s_linear_var(--nina-flash-count,_4)]'`.
- `@keyframes nina-flash-blink` (globals.css:288): hard-cut blinks of
  `box-shadow: 0 0 0 2px var(--nina-flash-ring-color, var(--accent))`; the reduce-mode keyframe
  (:300) holds the ring still.

### The one line that is changing

`components/nina/MessageBubble.tsx:485` — `[--nina-flash-ring-color:#fff]` →
`[--nina-flash-ring-color:var(--ink)]`. The ring is drawn just OUTSIDE the bubble's box on the
paper; in the user's own fill color it reads as the bubble briefly thickening — high-contrast
against light paper `#c9e9fb`, and in dark mode `--ink` is `#f2f7fa`, visually today's white on
`#0e1b26`. Everything else in the chain stays.

### Data Persistence

None new. The flow reads `nina_turns` (jobs) and `nina_messages` (the window); `?jump=` is
consumed from the URL, never stored. The landing writes nothing.

---

## Key Data Structures

### `NinaJobJump`
**Location:** `lib/nina/jobview.ts:378-385`
**Shape:** `{ kind: 'ready'; href } | { kind: 'avatar' } | { kind: 'no-message' } | { kind: 'gone' }`
**Used In:** `app/nina/jobs/[id]/page.tsx:90` (produced), `NinaJobDetail.tsx:112` (rendered)

### `QuoteScroll`
**Location:** `lib/nina/reply.ts:383-384`
**Shape:** `{ kind: 'none' } | { kind: 'scroll'; top; behavior }`
**Used In:** `ChatScreen.measureQuoteScroll` → `landOn` / `handleJumpToQuote`

### Design tokens (both schemes, `docs/design/tokens.css` / `app/globals.css`)
`--paper` `#c9e9fb` / `#0e1b26` · `--ink` `#1d2733` / `#f2f7fa` · `--accent` `#23beeb` / `#3fc9f0`.
His bubble: `bg-ink text-card`; hers: `bg-card text-ink`.

---

## Dependencies

### Configuration / Environment / External Services

- `NINA_FLASH_BLINKS` (Vercel env) → `flashBlinkCount` → `--nina-flash-count`. Not touched.
- `DATABASE_URL` — production Postgres; this analysis read it once, read-only, to measure where
  the top jobs' trigger messages sit.
- No schema, no migration, no new env var.

---

## Reference List

Every site that spells or records the white ring — the complete change surface for R2:

| Symbol / text | File:line | Kind | Notes |
|---|---|---|---|
| `[--nina-flash-ring-color:#fff]` | `components/nina/MessageBubble.tsx:485` | **code (the only one)** | becomes `var(--ink)` |
| "hers blink `--accent`; his blink white" | `components/nina/MessageBubble.tsx:61-64` | doc | header comment, records the 09-09 ask |
| "flicker buat user's bubble … putih" class comment | `components/nina/MessageBubble.tsx:470-483` | doc | call-site comment |
| "AND THE COLOUR IS A VARIABLE TOO … The literal beats `--card`" | `app/globals.css:260-266` | doc | keyframe header |
| "white on one of his bubbles, `--accent` on one of hers" | `lib/nina/search.ts:331-334` | doc | search-hit landing prose |
| `var(--nina-flash-ring-color, var(--accent))` | `app/globals.css:291,303` | code | UNCHANGED — default stays `--accent` for her bubbles |
| `--nina-flash-count` plumbing | `MessageList.tsx:281`, `app/nina/page.tsx:266`, `reply.ts:349` | code | UNCHANGED |
| `nina-flash-blink` prose (color-neutral) | `lib/nina/jobview.ts:52`, `ChatScreen.tsx:672-674`, `reply.ts:324` | doc | UNCHANGED |
| `tests/motion.reducedMotion.test.ts` | tests | test | name-token only; no color assertion; UNCHANGED |

---

## Impact Points (files that WILL need changes)

1. `components/nina/MessageBubble.tsx` — the class literal (:485) + both comment blocks — **owned
   by phase 1**
2. `app/globals.css` — the keyframe header's color paragraph (:260-266) — **owned by phase 1**
3. `lib/nina/search.ts` — the landing prose (:331-334) — **owned by phase 1**

Verification (no file changes unless it finds a defect): a live run of the exact user flow —
local prod build, minted Auth.js cookie, port ≠ 3000 — asserting the target `nina-msg-<id>`
element carries `data-flash="true"` after the jump and that the resting scroll leaves it in the
readable band. The same probe is the closure for R1's "the mechanism is missing" report: code
reading found no broken link, and this proves the chain end-to-end against the real top job.

**This document describes. The plan files prescribe.**
