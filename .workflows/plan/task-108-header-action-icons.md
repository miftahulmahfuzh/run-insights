# task-108 — Run detail header: three actions, one vocabulary

**Card**: [#108](https://github.com/miftahulmahfuzh/run-insights/issues/108) · round 1
**Branch**: `task/108-run-detail-header-make-correct-and` off `origin/main` @ `414f5b26`
**Touches**: `app/r/[id]/page.tsx`, `components/share/ShareButton.tsx`

## The ask

> in run detail page, change Correct into an icon and Share into an icon. make these 3 icons
> uniformly icons, not text

`/r/[id]`'s hand-rolled header currently renders two text links (`Correct`, `Share`) beside one
icon button (attach-to-Nina). Make all three icons.

## Scope: the narrowest reading

Only the three actions in `/r/[id]`'s action group. Explicitly **not**:

- the `‹ Runs` back link on the same header — it is navigation out of the screen, not one of the
  three actions, and it is the one affordance a reader needs to be unambiguous;
- `ScreenHeader`'s action slot on the tabbed screens (`components/ui/AppShell.tsx`), whose
  "a plain-text link, never an icon button" rule is untouched by this — see below;
- `ShareLinkPanel`'s `Copy link` / `Stop sharing` buttons, which are body copy inside a panel, not
  header chrome.

*The wider reading that lost*: "make the app's actions icons everywhere". Nothing on the card
points outside this one row, and `AppShell`'s rule argues against it in the general case.

## Why this does not reverse `AppShell`'s rule

`ScreenHeader`'s docstring says *"a plain-text link, never an icon button — 'TRENDS →' is
unambiguous at a glance and an icon is a guess."* That rule governs the **screen-title row**, where
the action is a navigation to another named screen and the screen's name is what disambiguates it.

`/r/[id]` hand-rolls its own header and this group is an **action row**, not a title row — the
argument already written into the file at `app/r/[id]/page.tsx:160-183` when the Nina icon was
added. This change extends that existing exception to the whole row rather than opening a new one,
and it makes the row internally consistent, which is the actual complaint. `ScreenHeader` is not
edited.

## Approaches considered

The only real design question is **the `Copied` state**. `ShareButton` currently uses its own label
as the success confirmation (`{status === 'copied' ? SHARE_COPIED : SHARE_ACTION}`), which is the
only feedback a runner gets on the clipboard fallback path — when `navigator.share()` is absent or
refused, nothing else on screen changes.

| # | Approach | Verdict |
|---|---|---|
| A | **Glyph swap to a checkmark for ~2 s**, plus an `sr-only` live region carrying `SHARE_COPIED` | **chosen** |
| B | Icon, with `Copied` as a small text chip beside it | rejected |
| C | Icon, and let `ManualLink` carry all feedback | rejected |

- **B** puts text back into the row the card asked to make uniform, and it reflows a
  `justify-between` header mid-tap. It also only shows the text on the *failure* path if kept
  minimal, which is backwards.
- **C** silently drops the success confirmation: `ManualLink` renders only on `status === 'manual'`,
  i.e. when the clipboard *refused*. A successful copy would produce no feedback at all — the exact
  regression the card warns about.
- **A** scores best on all four criteria: it is the repo's own icon idiom (**convention**), it edits
  one render and adds one timer (**scope**), the checkmark and the `role="status"` text are both
  assertable (**verifiability**), and it is one commit to undo (**reversibility**).

`status === 'copied'` currently persists forever, which was tolerable for a word and is wrong for a
glyph — a permanently-ticked button is no longer a share button. So A adds a revert timer with
cleanup on unmount.

## The icons

House idiom, taken from `components/nina/NinaJobActions.tsx` and `ChatPhotoActions.tsx`:
`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, round caps and joins,
`aria-hidden="true"`, and the colour decided by the parent's `text-accent`.

| Action | Glyph | Accessible name |
|---|---|---|
| Correct | pencil | `Correct this run` — the `/r/[id]/edit` page's own `<h1>` |
| Share | box with an up arrow (the platform share mark) | `SHARE_TITLE` → `Share this run` |
| Copied | checkmark | `SHARE_COPIED` → `Copied` |
| Nina | paper plane (unchanged) | unchanged |

Stroke `1.8` to match the paper plane already in the row, not the `2`/`2.4` used on Nina's filled
pill buttons — this row is thin accent-coloured line work on paper.

The two new accessible names come from `lib/share/copy.ts` and the edit page rather than being
invented here, so the icon's name and the screen it opens cannot drift apart.

## Steps

1. `components/share/ShareButton.tsx`
   - render `<ShareIcon />` / `<CheckIcon />` instead of the label; `aria-label` follows the state
     (`SHARE_TITLE` / `SHARE_COPIED`), `title` likewise;
   - add an `sr-only` `role="status"` region so the copy confirmation is announced — an
     `aria-label` change on a button is not reliably announced;
   - revert `copied` → `idle` after 2 s, cleaned up on unmount;
   - keep `onPointerDown`/`onFocus` warming, `disabled`/`aria-busy`, and every fallback rung
     untouched — none of this touches the transient-activation path;
   - match the Nina link's box: `-m-1 inline-flex p-1`.
2. `app/r/[id]/page.tsx`
   - `Correct` becomes an icon `<Link>` with `aria-label`/`title`, same box;
   - the action group goes `items-baseline` → `items-center`, and the header with it: an icon has
     no baseline worth aligning, which is why the Nina link needed `self-center` in the first place.
     With three icons that per-item patch comes off and the container states it once;
   - `gap-4` stays. The `-m-1 p-1` boxes' negative margins exactly cancel their padding, so the gap
     is the glyph-to-glyph distance — 16 px, comfortably separated 28 px touch targets.
   - the long comment justifying the Nina icon is rewritten to justify the row, since its
     "the one icon in this app's chrome" premise stops being true with this commit.
3. Gate: the repo's 14 CI commands, `ci:f08-guard` and `ci:f11-guard` among them. Neither is
   implicated — f08 polices hand-rolled *units* in views (no number is added) and f11 polices what
   the **public** `/s/[token]` route may reach (this is the owner-side tree, and
   `tests/share.bundle.test.ts` already asserts `ShareButton` stays out of the public bundle).

## Not done, deliberately

Not screenshotted on a device. The row is three 20 px glyphs in a 470 px column with 16 px between
them, well inside the touch-target floor the rest of the app uses; if the spacing reads tight in the
hand, that is a comment on this card and a one-line change to `gap-4`.
