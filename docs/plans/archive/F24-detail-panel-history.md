# F24 — The detail panel becomes a shared shell, and its open state becomes a history entry

Card: [#23](https://github.com/miftahulmahfuzh/run-insights/issues/23) · round 1 · 2026-08-22
Base: `d5e6f25` (`origin/main` with F23's badge-copy trim already landed)

Part 2 of 5 of the "Personal records + badge panel" set — **the enabler**. Blocks #25 (record
panel) and #26 (earn-date expander). Nothing on this card is a new screen; all three deliverables
are pieces two later cards consume.

The label is **F24** and not `F<N+1>`: `docs/plans/` already carries F23 (card #22, landed) and
card #24 has claimed F25 on its own card body while running in parallel. F24 was the free slot.

---

## 1. What the card asks for, and the one part of it that cannot land here

> **(1b)** In the badge modal, we should be able to click the date and be redirected to the
> corresponding run detail page. AND we must be able to track the history of user opened pages …
> swiping right from the phone's left border goes back and shows the badge detail modal again.

Three deliverables:

1. the panel's open/closed state becomes a **history entry**, so the iOS back-swipe closes the
   panel instead of leaving `/me`, and a return from `/r/<id>` restores it;
2. `BadgeDialog`'s chrome becomes a **reusable shell**, so #25's record panel is a different body
   in the same dialog;
3. a **run-date link** primitive: a day that is a link to its run when there is a runId, and plain
   text when there is not.

### The date is not in the badge panel any more, and this card does not put it back

The card's acceptance list has two items that read as if the badge panel still printed a date:

> - Tapping the date in a session badge's panel opens that run; the back-swipe returns to `/me`
>   with the same panel open, not to a bare `/me`.
> - A period badge (e.g. `century_club`) shows its date as text, not a link.

**F23 (card #22) deliberately emptied this panel of dates.** Its own comment in the file says so:

> NO DATE HERE, AT EITHER COUNT (F23). … Card #26 is what gives every earned date a home.

So there is no date in the badge panel to tap, and inventing one here would reverse a decision
taken two cards ago and then be restructured immediately by #26, whose whole subject is *where the
earned dates live* (an expander under "Earned 3 times", one link per earning). Re-adding a single
date line for the length of one card is churn in a surface that has now been edited three times.

What this card does instead:

- ships `RunDateLink` with **both** branches — link when `runId`, text when `null` — and proves
  both by test, since `StoredBadge.runId` is null for every period badge and for a session badge
  whose run was deleted;
- proves the *navigation* half of the criterion on the real device path it actually depends on —
  panel open → route change → back → panel open again — which is the history mechanism, not the
  date;
- hands the two date-tap criteria to **#26** (badges) and **#25** (records), which is where a date
  next exists on screen. Both cards already depend on this one.

Stated on the card rather than left for the next session to discover.

---

## 2. The history entry: `?panel=badge.<key>`

### The shape

One query parameter for the whole page, `panel`, whose value is `<kind>.<key>`:

```
/me                          no panel
/me?panel=badge.early_bird   the Early Bird badge panel is open
/me?panel=record.longest_distance   (#25)
```

**One parameter and not two** (`?badge=` plus a later `?record=`) for a structural reason: with two
parameters, `/me?badge=tourist&record=most_kcal` is a representable state, two dialogs would both
be told to open, and keeping them exclusive means every panel's opener remembering to clear every
other panel's parameter — a registry that #25 can silently forget to join. With one parameter the
exclusivity is the data type. The `kind` is a union (`'badge' | 'record'`), so #25 adding `record`
gets an exhaustiveness error from `tsc` if it misses a branch rather than a second open dialog.

`.` and not `:` as the separator: `URLSearchParams.toString()` percent-encodes `:` and leaves `.`
alone, so `?panel=badge.early_bird` survives a round trip through the URL bar legibly.

### The codec is pure, and it does not validate the key

`lib/panel/param.ts`:

```ts
export const PANEL_PARAM = 'panel'
export type PanelKind = 'badge' | 'record'
export interface PanelSelection { kind: PanelKind; key: string }

export function encodePanelSelection(selection: PanelSelection): string
export function decodePanelSelection(raw: string | null): PanelSelection | null
```

`key` is a `string`, not `BadgeKey`. Two reasons: a codec that narrowed to `BadgeKey` would import
`lib/badges/types.ts` into a module #25 also uses for record keys, and — the load-bearing one —
`BadgeShelf`'s existing comment already covers an unknown key correctly:

> The KEY, not the entry. `shelf` is replaced wholesale on every navigation to /me … A key resolves
> against whatever the current shelf is, or resolves to nothing and closes.

So `?panel=badge.nonsense` decodes fine, resolves against the shelf to nothing, and no panel opens.
An unknown *kind* is `null`, because that one is not a stale key — it is not this page's parameter.

### The write is `window.history.pushState`, not `router.push`

Verified against this repo's own Next (16.3.1) rather than assumed —
`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`, "Native
History API":

> Next.js allows you to use the native `window.history.pushState` and `window.history.replaceState`
> methods to update the browser's history stack without reloading the page. `pushState` and
> `replaceState` calls integrate into the Next.js Router, allowing you to sync with `usePathname`
> and `useSearchParams`.

That is exactly the shape the card hoped for: the entry is pushed, `useSearchParams()` re-renders
the client tree with the new value, and **`app/me/page.tsx` never re-runs**. `router.push` or a
`searchParams` prop on the page would re-run six database queries every time a panel opened, on a
page that is already dynamic (`requireUserId()` reads the session cookie), for a state change that
is entirely client-side.

No `Suspense` boundary is needed for the same reason the page is dynamic: the docs' prerender
caveat applies to a *statically rendered* route, and `useSearchParams` "will be available on the
server during the initial server render" of a dynamically rendered one. `npm run build` is in the
CI gate and is what proves it.

### Closing: `back()` when we pushed, `replaceState` when we did not

`components/ui/usePanelParam.ts` (a `'use client'` hook):

- `selection` — `decodePanelSelection(searchParams.get(PANEL_PARAM))`.
- `open(selection)` — sets the parameter on a copy of the current query and `pushState`s it. Records
  in a ref that *this* mount pushed the entry.
- `close()` —
  - if we pushed: `window.history.back()`. This *undoes* our entry, so the Close button, Escape and
    a backdrop tap all leave the history stack exactly as it was before the panel opened. Anything
    else grows the stack on every open/close and makes the number of back-swipes needed to leave
    `/me` depend on how many badges the runner looked at.
  - if we did not push: `replaceState` to the query without the parameter. This is the deep-link and
    the returned-from-`/r/<id>` case — there is no entry of ours to pop, and `back()` there would
    navigate *off* `/me` (deep link) or *forward* into the run we just came back from.

The ref resets whenever `selection` becomes `null`, which is what a back-swipe produces: the gesture
pops the entry, `useSearchParams` re-renders without the parameter, the dialog closes through the
same effect that opens it, and the next open pushes a fresh entry.

Known and accepted: after `/me?panel=x → /r/<id> → back`, the panel is open but `pushedRef` is
false, so Close does a `replaceState` and the *next* back-swipe goes to whatever preceded the panel
(usually the bare `/me`) rather than to the run. That is one harmless extra back press in a corner
of the stack, and the alternative — calling `back()` when we hold no entry — walks the runner
forward into the run detail page they just left, which is a bug rather than a wasted press.

---

## 3. The shell

`components/ui/DetailPanel.tsx` — the dialog element, the art band, the scrolling body and the
footer, with **every comment in `BadgeDialog` moved rather than re-derived**: why a native
`<dialog>` and not `Sheet`, why no `role="dialog" aria-modal="true"`, why the `::backdrop` lives in
`app/globals.css`, why both `el.open` guards exist, `onCancel → onClose`, the
`event.target === ref.current` backdrop test, and the three-edge-flush 4:3 band.

`components/ui/` and not `components/profile/`, per `BadgeShelf`'s own rule — "exactly one caller in
the app needs a tappable badge, and `components/ui` is where a *second* caller would put it". #25 is
that second caller. It is **not** added to the `components/ui` barrel: `Sheet` and `PhotoViewer` are
both in that directory and both imported by path, and the barrel is in the public share route's
import graph, which `tests/share.bundle.test.ts` audits module by module.

```tsx
export interface PanelArt { src: string; twill: string; width: number; height: number
                            dimmed?: boolean }

export function DetailPanel({ open, art, onClose, children }: {
  open: boolean
  art: PanelArt | null
  onClose: () => void
  children: (titleId: string) => React.ReactNode
})
```

- `art` carries its own intrinsic `width`/`height` because #24's record deck is a separate manifest
  generated at 1024×768 while `BADGE_ART` is 768×576; a shell hardcoding `BADGE_ART_WIDTH` would be
  the record panel's first bug. `dimmed` is the locked-badge `opacity-50 grayscale` treatment, which
  a record — always held by a real run — never wants.
- `children` is a **render prop taking the title id**, so `useId` and `aria-labelledby` stay wired
  inside the shell while each body stamps the id onto its own `<h2>`.
- Nothing renders while closed, for the reason the current comment gives: a `display: none`
  `<dialog>` still has its subtree in the document and a screen reader can reach it.

### One mechanism hardened, and why that is not a re-derivation

The current focus line is `el.querySelector('button')?.focus()`, and its comment is about *choosing
the Close button explicitly, after `showModal()`*. It works today only because the body happens to
contain no buttons — the Close button is the first `<button>` in DOM order. #26 puts an expander
control inside the body, above the footer, and the positional query would then focus **the
expander** while the comment still claimed it focused Close.

So the shell keeps the decision and drops the coincidence: a ref on the Close button,
`closeRef.current?.focus()`. The comment gains one paragraph recording why the query was replaced —
the reasoning about `showModal()`'s focus delegate, the scroll container, `tabIndex={-1}` and
`autoFocus`-versus-effect ordering is untouched, because none of it changed.

`BadgeDialog` keeps its name and its file and becomes the badge *body*: it resolves
`BADGE_ART[entry.key]` into a `PanelArt`, renders the eyebrow / title / condition / gloss /
progress it renders today, and hands the rest to the shell.

---

## 4. The run-date link

`components/ui/RunDateLink.tsx`:

```tsx
export function RunDateLink({ day, runId, className }: {
  day: string; runId: string | null; className?: string })
```

`formatDay(day)` either way — R-23, every date goes through `lib/format.ts`. With a `runId` it is a
`next/link` to `/r/<runId>` carrying the link affordance (underline, offset); with `null` it is a
`<span>` and nothing about it invites a tap. The caller owns size and weight through `className`;
the primitive owns only the affordance, so a record panel and a badge panel cannot disagree about
what a tappable date looks like.

`runId` nullable is the point of the primitive, not an edge case: `lib/badges/types.ts` says
`StoredBadge.runId` is "Null for a period badge, or a session badge whose run was deleted".

---

## 5. Tests

`npm test` runs in the `node` environment with no jsdom (`vitest.config.ts`), so a click and a
`popstate` cannot be simulated. Split accordingly:

- **`tests/panel.param.test.ts`** — the codec, pure: round trip, a key containing underscores, an
  unknown kind → `null`, a missing parameter → `null`, no separator → `null`, and a value with a
  second `.` splitting on the first only.
- **`tests/panel.render.test.ts`** — `DetailPanel` and `RunDateLink` through
  `renderToStaticMarkup`, `createElement` rather than JSX because the runner's `include` is
  `tests/**/*.test.ts`. Asserts: closed renders no body; open renders the band, the body and Close;
  `RunDateLink` with a runId emits `href="/r/…"`, and with `null` emits no `<a>` at all.
- **`tests/badges.render.test.ts`** — gains `vi.mock('next/navigation')` so `BadgeShelf` can render
  outside a router, plus a case that a mocked `?panel=badge.<key>` opens that badge's panel. The
  mock is the router and nothing else; every existing assertion in the file stays.

`npm run test`, `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` are
the gate, and the gate is the repo's own 14 commands.

### And one thing the gate cannot see

Whether the back-swipe actually closes the panel. The plan is to drive it for real with the F19
capture harness's own machinery — `playwright` plus `scripts/capture/session-cookie.mjs` against a
local dev server on the seeded database — in a throwaway script, not a committed test: open a badge
panel by clicking a row, assert the URL and the open dialog, `goBack()`, assert the panel is shut
and the page is still `/me`; then `goto('/r/<id>')`, `goBack()`, assert the panel is open again.
If that cannot be stood up, it is reported as unverified rather than assumed — the mechanism is
documented Next behaviour, but "documented" is not "seen".
