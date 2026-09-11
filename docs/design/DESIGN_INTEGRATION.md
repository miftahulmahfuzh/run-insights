# Design integration — pulled 2026-08-20

Source: Claude Design project `b383f65b-1bb5-4c8a-979d-32add72688bc` ("Run Insights web app"),
files `01 Foundations.dc.html`, `02 Components.dc.html`, `Run Insights.dc.html`.
Pulled via `DesignSync`. Normalised tokens live in `docs/design/tokens.css`.

**The design wins over the feature plans wherever they disagree**, except where an iOS constraint
is at stake. Rulings here are **R-29 – R-35**, continuing the v0.1.0 arbitration record's
numbering.

> **Where the retired citations point.** `RECONCILIATION_v0.1.0.md` and `ROADMAP_v0.1.0.md` no
> longer sit in the tree — they were retired on 2026-09-10 (commit `204fd34`, "retire the v0.1.0
> contract trio"), on the reasoning that the shipped code and `CHANGELOG.md` are the record now.
> Both files' final text is one command away:
>
> ```bash
> git show 204fd34^:RECONCILIATION_v0.1.0.md   # the arbitration record: R-1 – R-28, then R-36 – R-46
> git show 204fd34^:ROADMAP_v0.1.0.md          # the roadmap; this doc cites §4.6 (badge catalog), §4.7 (badge art)
> ```
>
> The ruling numbering is shared across the two documents. The record ran R-1 – R-28; this pull
> continued it at R-29; the record's Part IV then picked the sequence up again at R-36 and states
> that R-29 – R-35 live *here*. Between them the two files hold the complete R-1 – R-46 set — so
> every `R-nn` and "Roadmap §" citation below resolves in that history, not to a missing file.
> Current-state authority: `docs/architecture.md`. Narrative record: `CHANGELOG.md`.

> ## ⚠️ Superseded on the aesthetics by the v2 revamp
>
> This file records the **v1 pull**. On 2026-08-20 the Claude Design project was fully revamped:
> warm cream + Georgia + system-mono + no-shadows became **sky blue + white cards + Poppins-only
> + soft shadows**. Everything below about *colour, typeface, radii and elevation is historical.*
> `docs/design/tokens.css` — mirrored into `app/globals.css` — is the current token sheet, and
> rulings **R-41 – R-46** stand. Their full text is in the git-history copy of the record
> (retrieval above); the shipped components also carry each one in its header comment:
> `ExtractingSkeleton` (R-41), `BadgeShelf` / `BadgeDialog` (R-42 – R-44), `ProvenanceMark` /
> `SplitsTable` (R-45), `HonestyChip` (R-46).
>
> | v1 ruling | status after v2 |
> |---|---|
> | **R-29** honesty marks = three underlines | **revised by R-46** — same three states, now `scan` / `edited` / `check` pill chips |
> | **R-30** partial-km bar shortened | **stands**, and v2 elaborates it (bar length = pace, colour = dominant zone) |
> | **R-31** correction sheet shows a screenshot crop | **narrowed by R-45** — the whole source screenshot, zoomable, not a per-field crop; no bounding boxes were ever measured |
> | **R-32** Century Club is 100 km | **regressed in v2, repaired by R-42** — the locked-tile example is now `double_century` |
> | **R-33** catalog is 22 keys | **regressed in v2 ("9 of 20"), repaired by R-42** — 44 stale "twenty"/"20" references corrected across the roadmap (since retired), design-brief, F09, F10 |
> | **R-34 / R-36** keep the navy patches | **stands; rationale restated by R-43** — the cream-paper argument is gone, the decision is not |
> | **R-35** adopted without comment | stands |
>
> New with v2, ruled in the record's Part IV (git history; retrieval above): **R-41** (extraction
> progress may not claim per-screenshot state — the design changed, D4 stands). R-42 – R-46 are
> carried by the components named above and glossed in the table where they amend a v1 ruling.


> **Note on project type.** This is a `PROJECT_TYPE_PROJECT` (design *canvas*), not a
> `PROJECT_TYPE_DESIGN_SYSTEM`. It is fully readable and re-pullable, but it will not appear in
> `list_projects`, which filters to design-system projects — fetch it by id. The type is
> immutable at creation, so if you ever want it in the picker it has to be recreated.

---

## The direction, in one paragraph — v1, historical

> Superseded by the v2 revamp; see the banner above. Kept because F10's patch decision
> (R-43) is still argued against it.

Warm paper (`#f0ede4`) and near-black ink; **Georgia** for anything that is *language* and the
**system monospace** for anything that is a *measurement* — numbers in mono deliver tabular
figures by construction rather than by CSS trick. Zones cool-to-warm, water to ember; **no
shadows anywhere** — a raised surface is `card` over `paper` plus a hairline. The full v1 detail
— palette hexes, zone sequence, input sizes — is in R-34 and R-35 below; it is not restated here.

---

## What arrived

| File | Contents |
|---|---|
| `01 Foundations.dc.html` | 13 colour tokens + 5 zones in both schemes, type scale, number formats, the honesty marks, radii/spacing |
| `02 Components.dc.html` | Button, Card/Stat, Sheet, Field, ZoneBar, SplitsTable, Flag, RecordRow, BadgeTile, EmptyState, Toast, TabBar, extraction skeleton |
| `Run Insights.dc.html` | 12 screen states behind a picker: `signin`, `onboard`, `upload`, `extracting`, `review`, `detail`, `week`, `month`, `monthEmpty`, `history`, `profile`, `share` |

All ten briefed screens are present, plus `extracting` and `monthEmpty` as separate states.

---

## R-29 · The honesty marks are three underlines. Adopted, and better than briefed.

The brief asked for provenance and attention treatments without specifying form. The design
returns a single mechanism — the underline under a number — carrying three states:

| State | Treatment |
|---|---|
| read from image | `1px dotted var(--ink-3)` |
| corrected by hand | `1px solid var(--accent)` |
| worth checking | `1px dashed var(--warn)`, and the number itself in `--warn` |

This is right on three independent grounds. It costs no layout — it attaches to a number already
on screen, so provenance can be shown on *every* value rather than only where a badge fits. It
degrades to nothing at a glance and resolves on inspection, which matches how often you actually
care. And the third state is generated by F05's consistency checks, not by model self-reported
confidence — the Foundations page even captions it with the real mechanism: *"worth checking —
splits sum to 1:16:35"*.

**F05 and F08 adopt this as the sole provenance vocabulary.** No badges, no icons, no chips.

## R-30 · The splits bar shortens for a partial kilometre. Adopted — it solves D14 visually.

D14 says the partial final kilometre must never read as a sprint. The design solves it in the
component rather than in prose: each split row carries a horizontal bar whose **length is pace**
(longer = slower) and whose **colour is that split's dominant zone** — and for a partial
kilometre **the track itself is shortened** to the fraction of a kilometre actually run.

A 0.67 km split therefore occupies two-thirds of the track no matter how fast its pace was. The
eye reads "short effort" before it reads any number. Paired with the caption — *"km 11 is
partial — 0.67 km at 7'31"/km pace, 5'02" elapsed"* — this is a better answer than the "visually
distinct" the brief asked for.

## R-31 · The correction sheet shows a crop of the source screenshot. ⚠️ new requirement

The Sheet component pins **the region of the screenshot the value was read from** above the
input. The brief asked for extracted values shown "next to the screenshot they came from"; the
design tightened that to a per-field crop.

**This is a real feature F04 and F05 must now support, and neither plan has it.** Options, in
descending order of fidelity:

1. **Bounding boxes from the model.** Would require asking `glm-4.6v` for coordinates per field.
   **Not free** — it changes the proven extraction prompt, and `research/` measured 108/108 on
   the current one. Any such change must be re-scored with `research/score.mjs` before it ships.
2. **Static region maps per screen kind.** Apple's layout is fixed; `avgHrBpm` is always in the
   same place on the summary card. A hand-authored normalised-rect table per `kind` gets ~90% of
   the value for none of the extraction risk. **Recommended.**
3. **Whole-screenshot thumbnail**, tap to zoom. The honest fallback.

**Ruling: build (2), fall back to (3) per field where no rect is defined.** Do not touch the
extraction prompt for this. F04 gains a `lib/photos/regions.ts`; F05 gains the crop viewer.

## R-32 · Century Club is 100 km, not 200. Design copy is wrong.

`02 Components.dc.html`'s locked BadgeTile reads *"Century Club — 200 km in a calendar month"*.
Roadmap §4.6 defined `century_club` as **100 km** and `double_century` as 200 km. The design
conflated them. (The ruling held, and R-42 later made it structural: the 100 km lives only as
`BADGE_THRESHOLDS.centuryM` in `lib/badges/catalog.ts`; `lib/badges/rules.ts` compares against it
and `lib/badges/meta.ts` interpolates it into the condition sentence.)

**The catalog wins** — this is a data contract, not a visual choice. The tile's *form* (condition
stated, plus your current distance from it: "you're at 141") is excellent and is adopted; the
number is corrected to 100 km.

## R-33 · The badge shelf drifted from the catalog. ⚠️ three badges to resolve

The design ships twenty badges, but not the twenty in roadmap §4.6 — retired now; the live
catalog is `lib/badges/catalog.ts`. It **drops** three and
**invents** three:

| Dropped by the design | Verdict |
|---|---|
| `sandbagger` — Suspiciously Sensible | **Restore.** It is the only badge that fires on an *easy* run, and for a runner who spends 90% of his time in Z4–Z5 it is the one worth chasing. |
| `warmup_who` — Warm-Up? Never Met Her | **Restore.** R-26 already hand-verified its predicate. |
| `double_century` — Double Century | **Restore.** At 180 km/month it is the live stretch goal. |

| Invented by the design | Verdict |
|---|---|
| **Two-a-Days** | **Adopt** as `two_a_days`. Trivially computable: two reviewed runs sharing one `occurred_on`. |
| **Boring Excellence** | **Adopt** as `boring_excellence`, with a definition the design didn't give: three consecutive runs whose avg pace all sit within ±10 s/km *and* whose decoupling is all under 5%. It is the sincere counterweight to the joke badges, and it rewards exactly the behaviour the app's whole analysis argues for. |
| **Rain Tax** | **Cut. It is not implementable.** Apple Fitness screenshots carry no weather data — not in the summary, not in the splits, not in the heart-rate screen. There is no field to derive it from and no API in scope to fetch it from. A badge that can never fire is worse than no badge. |

**Net: the catalog grows from 20 to 22 keys.** Roadmap §4.6, F09's rules and F10's twenty scene
lines all needed updating, and were updated — R-42 closed the count regressions the v2 design
re-introduced. `lib/badges/catalog.ts` holds the 22-key catalog today.
`tools/gen_badge_art.py`'s key-diff guard will catch any file that misses a future change, which
is exactly what it is for.

## R-34 · The palette is shared with two other projects. Flagged, not ruled.

`--paper: #f0ede4`, `--accent: #2f5d50`, `--red: #8a3324` are **the same values** as
`expense-tracking`'s design system and the `daily-words` badge deck's two inks. Three of your
apps will look like the same app.

That may be exactly what you want — a personal house style is a legitimate thing to have, and it
is unusually coherent. **But it collides with a decision already locked.** Roadmap §4.7 required
badge art that is *vastly different* from the daily-words letterpress deck — a requirement that
now lives in `.claude/skills/generate-badge/style.md`, which F10's tools parse — and F10 specced
**dark navy twill patches with five saturated threads**. Those will sit on warm cream paper
alongside a pine-green accent that is literally the daily-words badge ink.

Two coherent resolutions, and this one is yours:

- **(a) Keep the warm paper, re-key the patches.** Swap navy twill for a natural or oatmeal
  canvas ground and pull the thread palette toward the app's earth tones. The patches stay
  embroidered — a genuinely different *medium* from letterpress, which is what §4.7 actually
  requires — but stop fighting the page.
- **(b) Keep the navy patches, let them be loud.** The design already anticipates this: the
  BadgeTile placeholder is `#1d2436` navy, and its caption says *"the shelf stays quiet so the
  patches can be loud."* The clash becomes deliberate — the one wall with something silly on it.

**Resolved 2026-08-20: (b).** See R-36. F10's style block ships unchanged; the `#1d2436`
placeholder tile is the intended final treatment, and the theme strip now renders on the app's
real `#f0ede4` / `#131311` paper values.

## R-35 · Adopted without comment

- **Georgia + system mono**, split by language-vs-measurement. F08's `lib/format.ts` outputs
  mono-destined strings; nothing else changes.
- **Zone sequence** `#56789b → #567d4e → #a8842c → #b05c2a → #8a3324`, water to ember, with the
  zone number always shown so colour never carries meaning alone.
- **Extraction skeleton states progress in words** — *"reading the splits table · 2 of 3
  screenshots"* — never a fake percentage. Matches F04's plan, which independently refused a
  progress bar.
- **4-tab bar**, Upload centre and raised. (The shipped bar is five tabs now — Nina joined as a
  tab at v1.0.0 and the centre tab reads *New*; `components/ui/TabBar.tsx`.)
- **Inputs at 22px in the sheet, 17px in fields** — both comfortably over the 16px Safari-zoom
  floor. No iOS constraint is violated anywhere in the pull.
- **`--miss: #bfb9a9`** is defined but unused in the three artboards. Presumably intended for
  absent/unextracted values. F05 should use it for exactly that rather than inventing another.
  (It did, via a later change: `bg-miss` is now the fallback for a zone segment the run's data
  doesn't report — both `ZoneBar`s and `SplitsTable`.)

---

## Open items — none

1. ~~R-34~~ — **closed, navy (R-36).**
2. ~~**R-31's region maps** need hand-authoring against the three fixture screenshots once F04
   starts.~~ — **closed by R-45**: provenance is by section, with the whole source screenshot
   pinned and zoomable; no rects were ever authored (`components/runs/ProvenanceMark.tsx`).
3. ~~The GitHub association in the project points at `miftahulmahfuzh/run-insights`, currently
   empty. First push will let the design project map screens to files.~~ — **stale**: the repo
   was pushed long ago and is live (v1.0.0 shipped 2026-09-11).
