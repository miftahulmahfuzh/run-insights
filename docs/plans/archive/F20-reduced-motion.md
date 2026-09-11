# F20 — The pulse that would not stop for anybody who asked

**Card:** [#17 — No prefers-reduced-motion guard for ri-pulse / ri-spin](https://github.com/miftahulmahfuzh/run-insights/issues/17)
**Date:** 2026-08-22
**Round:** 1

## 1. The finding, corrected on two counts

`app/globals.css` defines two infinite keyframes and no `prefers-reduced-motion` escape, so a
visitor whose OS says *reduce motion* still gets a 2.4 s opacity oscillation for the whole ~35 s
extraction wait. That much is exactly as reported, and it is the substance of this plan.

Two details in the card are wrong, and both change what the fix has to cover.

**`ri-spin` has no call sites.** Not one. A grep across the whole repo finds the keyframe
definition at `app/globals.css:190` and two mentions in prose — this card, and the F19 plan
paragraph it was written from — and nothing else. It is dead CSS, and it got into the card because
the finding was made by reading the stylesheet rather than the components. This matters beyond
tidiness: it is the reason §4 grows a guard nobody would otherwise argue for.

**All ten call sites are `ri-pulse`.** The card says nine; its own list sums to ten:

| File | Sites |
|---|---|
| `components/extract/ExtractingSkeleton.tsx` | 2 — the photo tiles and every `SkeletonBlock` |
| `components/ui/Button.tsx` | 3 — the three-dot pending state, staggered 0 / 0.18 s / 0.36 s |
| `app/(app)/loading.tsx` | 2 |
| `app/trends/loading.tsx` | 2 |
| `components/charts/ChartFrame.tsx` | 1 |

So the guard has **one** keyframe to cover, not two, and the fix needs no per-site knowledge.

**A third motion surface the card does not mention**, checked and deliberately left alone — see §3.

## 2. What "reduced motion" should mean on the pending screen

The card leaves one thing open: *"Worth deciding whether the extraction skeleton should then show
something static that still reads as 'working'."*

**It already does, and it is text.** `ExtractingSkeleton` renders a live elapsed count in an
`aria-live="polite"` span, next to "Usually about 35 seconds" and, past 1.6× that, "this one is
running long". The component's own docstring is explicit that the skeleton itself "claims nothing"
— it is the run card the screen is about to become, and no more:

> No percentage. No partial numbers. The skeleton below is the run card it is about to become,
> which is the one part of the design that costs nothing and claims nothing.

The pulse was never the progress signal. So stopping it removes decoration and leaves the honest
signal — the count — untouched. Nothing is substituted for it.

The alternative considered was pinning a distinct resting opacity (say `0.65`) so the blocks read
as deliberate placeholders rather than as content that failed to load. Rejected: `ChartFrame` and
the two `loading.tsx` files pulse elements sitting on `bg-card` and `bg-paper-2`, where a fixed
two-thirds opacity looks like a rendering fault rather than a placeholder. Full opacity on a
`bg-paper-2` block is what a skeleton is supposed to look like when it is standing still.

There is a second beneficiary. F19's capture harness set Playwright's `reducedMotion: 'reduce'`
expecting the pending screen to hold still so `mpdecimate` could collapse the duplicate frames,
and the flag did nothing — which is how this gap was found from the outside. Under this fix those
frames become pixel-identical, and F19's measured ~18% saving is a number worth re-taking later.

## 3. The mechanism: flatten the keyframe, not the call sites

Three ways to do it.

| | Approach | Verdict |
|---|---|---|
| **Redefine the keyframe under the media query** | One block in `globals.css`; every stop resolves to one value | **Chosen** |
| `motion-reduce:` variant per call site | Tailwind v4 ships the variant; ten edits | Rejected |
| Global `*` reset with `!important` | Total coverage, one rule | Rejected |

The chosen form is four lines:

```css
@media (prefers-reduced-motion: reduce) {
  @keyframes ri-pulse {
    0%, 50%, 100% { opacity: 1; }
  }
}
```

**Why this works, and it is the one non-obvious thing in the diff.** Keyframes cascade *by name*:
a later `@keyframes ri-pulse` **replaces** the earlier one wholesale rather than merging with it,
and one nested inside a media query applies only while that query matches. So all ten call sites
go still with no selector, no `!important`, and no edit to any component — and the eleventh site,
whenever somebody writes it, is covered before they think about it.

The per-call-site variant is rejected for exactly that last property: it is ten edits that must be
remembered an eleventh time, which is the failure this card *is*. And the global `!important`
reset is rejected twice over — it would be the only `!important` in the codebase, and it would
take out `Button`'s tap feedback along with the decoration it was aimed at.

**`ri-spin` is deleted** rather than guarded. Guarding a keyframe with no call sites means the
guard in §4 has to reason about one, and dead code that survives a whole feature cycle is what
made this card's premise wrong in the first place.

**The `transition-*` utilities stay.** Three components carry them and neither is what a
reduced-motion request is about:

- `Chip` (`transition-[background-color,color]`) and `KindSelector` (`transition-colors`) animate
  colour only. Colour is not motion; nothing moves and nothing oscillates.
- `Button` (`transition-[opacity,transform] active:scale-[0.985]`) is a 1.5% press that lasts as
  long as the finger is down. That is interaction feedback on a discrete tap, not the sustained
  oscillation the setting exists to suppress.

Recharts needed checking and turns out to need nothing: all six `*Inner.tsx` chart files already
pass `isAnimationActive={false}` on every series. There is no third-party motion surface in this
app, which is also why the global reset buys nothing that the four lines above do not.

## 4. The guard, and why it is a test rather than an eighth CI script

A reduced-motion contract is invisible to a typecheck, a lint, and every other tool in this repo.
The precedent for that exact situation is `tests/pwa.install.test.ts`, which says so in its own
header — *"an install contract is invisible to every tool except a phone — so it is asserted here
or it is not asserted at all"* — and then reads `app/layout.tsx` and the PNG headers as text.

So: **`tests/motion.reducedMotion.test.ts`**, running inside `npm test`, which is already the
gate's eighth step. Not a `scripts/check-*.mjs` with its own npm script and its own workflow line:
those seven exist for *boundary* properties spanning directories, and this is one stylesheet and
the files that reference it.

It reads `app/globals.css` and text-scans `app/` and `components/` for
`[animation:<name>_…]` utilities, then asserts four things.

**1. Every animated keyframe has an escape.** Every name used in an `[animation:…]` utility is
redefined inside the reduced-motion block. This is the drift guard, and the only one that catches
the actual regression: a future `ri-shimmer`, written and used, with no line in that block.

**2. Each redefinition is genuinely static.** All stops in a flattened keyframe declare the same
properties at the same values. Without this, `0%, 100% { opacity: 1 } 50% { opacity: 0.5 }` passes
assertion 1 while pulsing merrily — the guard would be checking that somebody typed the block, not
that the block does anything.

**3. The block exists at all.** Deleting the media query fails loudly rather than silently
reverting the whole feature.

**4. No `@keyframes` in `globals.css` is unused.** This one is debatable and is included on
purpose. Against it: dead CSS is harmless, and failing CI over harmless is how guards become the
thing people switch off. For it: an unused keyframe is not a hypothetical here — `ri-spin` sat
unreferenced long enough to be reported as a live defect in two separate documents, and it
distorted this card's own premise. The guard costs one scan the test is already doing.

## 5. Files

| File | Change |
|---|---|
| `app/globals.css` | delete `@keyframes ri-spin`; add the reduced-motion block and its comment |
| `tests/motion.reducedMotion.test.ts` | new — the four assertions of §4 |

No component changes. No new npm script and no new CI step.

## 6. Verification

The repo's own gate, all fourteen commands, `npm test` among them.

**The guard was mutation-tested rather than merely watched to pass**, because assertion 2 is the
kind that is easy to write and not have work. Against the finished stylesheet all five cases pass;
with the escape block edited to differ at one stop, and again with it reduced to a lone `to`, the
"holds each escape completely still" case fails both times and names the reason. Before the fix
existed it failed for three reasons — no block, `ri-pulse` unguarded across five files, `ri-spin`
unused — which is also how the ten-sites-in-five-files count in §1 was confirmed independently of
the card.

**The cascade claim was measured in a real engine**, since it is the one thing the text scan cannot
see: whether a media-nested `@keyframes` redefinition actually replaces the outer one. Chromium via
Playwright, the two keyframe blocks alone on a page, computed opacity sampled 24 times across one
2.4 s period:

```
reducedMotion=no-preference   distinct opacities over 2.4s: 24
reducedMotion=reduce          distinct opacities over 2.4s: 1   (1)
```

Twenty-four values to one. The redefinition overrides, and the element holds still at full opacity.

**And the block survives the build**, which is worth one grep because the guard reads the source
and Tailwind is what ships. In `.next/static/chunks/*.css`:

```
@media (prefers-reduced-motion:reduce){@keyframes ri-pulse{0%,50%,to{opacity:1}}
```

The minifier rewrites `100%` as `to`, which still spans the range — the same equivalence `isStill`
accepts. `ri-spin` occurs zero times in the bundle.

What remains for a human is the judgement no assertion covers: the pending screen under an
OS-level reduce-motion setting, confirming the elapsed counter still reads as "working" once the
pulse is gone.

## 7. Out of scope

- **Re-taking F19's `mpdecimate` measurement.** The saving should improve now that the pending
  screen can hold still, but re-shooting the GIF budget is F19's harness, not this card.
- **`Button`'s `active:scale-[0.985]`.** Argued in §3 and left deliberately; if it ever wants a
  `motion-reduce:` variant, that is a separate decision about interaction feedback.
- **The other two F19 findings** — the `1 check still disagree` plural, and the pace/HR x-axis
  crowding past ~20 splits. Both have their own cards.
