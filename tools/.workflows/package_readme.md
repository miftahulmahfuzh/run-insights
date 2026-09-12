# Package: tools

**Location**: `tools`
**Last Updated**: 2026-09-12 (first package_readme; full audit of the same date)

## Overview

`tools/` is the offline art pipeline for everything on this app that is a *picture of
cloth*: the badge deck, the record deck, and the home-screen icons. Nothing here is
imported by the app and none of it runs at runtime — the app consumes only committed
OUTPUTS (`assets/**` masters, `public/**` derivatives, the two generated manifest
modules), by URL and by type, never by import. Generation is the only part that
spends money; everything else — grading, promotion, review sheets, test controls —
is free and runs offline.

The pipeline has exactly one non-tool consumer inside the repo, and it is load-bearing:
`scripts/check-badge-art.mjs` (`npm run badges:check`, run by CI) reads
`tools/decks.json` and its failure messages instruct running `tools/*.py` by name. A
script here that looks unreferenced from `app/` may therefore still be wired into CI,
an npm script, or the skill that drives generation.

**The standing rules of the directory** — each script's header restates the ones it
lives by, and the headers are the deep documentation; this file is the map, not the
territory:

1. **The skill is the contract; tools are the mechanics.**
   `.claude/skills/generate-badge/` (`SKILL.md` + `style.md`) owns the style block and
   the step-by-step loop. `style.md`'s `<!-- STYLE BLOCK vN -->` is sent to the image
   model verbatim, so the prompt that was sent can never drift from the prompt that is
   documented. Adding a deck is an entry in `tools/decks.py` plus
   `python3 tools/decks.py --write` — nothing else.
2. **One bolt of cloth.** Both decks are generated against the ONE shared style block
   and share ONE anchor (`assets/badges/_anchor.png`), so twill-tone drift BETWEEN
   decks is measurable. `scripts/check-badge-art.mjs` §5 fails if a deck ever grows
   its own anchor.
3. **The exit code of `check_badge_art.py` is not the verdict.** The verdict is
   SKILL.md step 5 read against the three crops it writes. Lettering — the largest
   failure mode of these models — is not measured at all (see that file's
   NOT_MEASURED).
4. **Dry-run is free and reads no key.** Every generator's `--dry-run` assembles and
   prints prompts with no key read, no network, no file written. The key
   (`OPENROUTER_API_KEY`) is read only by the two generators and `gen_app_icon.py`,
   and CI guards it out of everything that ships (`ci:openrouter-guard`,
   `badges:check` §1). It is NOT `LLM_API_KEY` — different provider, different bill.
5. **Generated files are never hand-edited.** `tools/decks.json` (by
   `decks.py --write`), `lib/badges/badge-art.ts` and `lib/records/record-art.ts` (by
   `make_badge_assets.py`). Hand-editing a generated file fights the generator; the
   next run resurrects the old bytes.
6. **Dependency posture is deliberate.** Generators are stdlib-only (one hand-built
   JSON POST; this machine has no `requests`/`httpx`/`openai`); the measurer, the
   promoters and the sheet/controls need PIL and nothing else.

## The pipeline, as data

```
lib/<deck>/catalog.ts ─┐
style.md (STYLE BLOCK) ─┴─► gen_badge_art.py ─► assets/<deck>/_candidates/<key>.aNN.{png,txt}
                                                              │
                              check_badge_art.py <file> ◄─────┘   grade + 3 crops, judge per SKILL.md step 5
                                                              │
        badges only:  extend_badge_art.py --source <aNN.png> ─┘   widen 1:1 → 4:3 (the .wNN pair)
                                                              │
                              check_badge_art.py again; judge again
                                                              │
        promote BOTH files:  cp <wNN|aNN>.{png,txt} assets/<deck>/
                                                              │
                              make_badge_assets.py            →  public/<deck>/<key>.<hash8>.{webp,sm.webp}
                                                              →  lib/<deck>/<deck>-art.ts (TOTAL Record)
                                                              │
                              npm run badges:check && npm run typecheck   (the two drift guards)
```

Records skip the widen step — they are generated natively at 4:3
(`gen_badge_art.py <key> --deck records --aspect-ratio 4:3`), which is the experiment
the `--aspect-ratio` flag existed to run. Icons run their own two-step:
`gen_app_icon.py` → promote a candidate to `assets/icon/silhouette.png` →
`make_icon_assets.py` composes and writes every shipped PNG.

## The scripts

### `decks.py` / `decks.json` — the deck table
The one table answering "where do this deck's scenes, catalog, masters, public dir,
manifest and anchor live", for every deck at once. `--write` regenerates the JSON
sidecar; `--selftest` is offline and asserts cross-deck uniqueness, the shared anchor,
and that `decks.json` on disk is still in step with the Python (a stale sidecar is a
table that disagrees with itself — the JS guard reads the JSON, this file owns it).
`--deck` defaults to `badges` everywhere so every command ever written down still
means what it said. Records' catalog shape differs (`badge('key', …)` vs
`{ key: '…' }`), which is why the key regex is per-deck data, not shared code.

### `gen_badge_art.py` — `npm`-less; one patch per invocation
Generates one candidate against the style block plus its scene line, with the
sidecar `.txt` (exact prompt, seed, style version) that promotion must carry.
Refuses to START on any style↔catalog parity disagreement — the only one of the
three drift mechanisms that fires before money is spent (the others: `typecheck`
catches a key with no art; `badges:check` catches art with no key). `--all` is
legal only with `--dry-run`: the three-attempt cap and the look-at-it step are per
badge, and a loop makes both ceremonial. The `1:1` aspect default is load-bearing —
the style block's composition contract was measured on square frames; see the
constant's comment before changing it.

### `check_badge_art.py` — the grader (needs PIL)
Ten measurements (hard checks set the exit code; advisory ones print), three crops
for the human. Every band carries its provenance `(observed, 6 badges, v2)` and the
rule that bands are re-derived from a DISTRIBUTION, never from one new sample — the
next honest re-derivation is at the full deck, if the spread warrants it. Check 4's
unauthorised-blue guard was DELETED, not re-tuned: the substrate IS navy here, and a
guard that fails every correct candidate is a guard somebody comments out. Run
controls with `--no-anchor`: a synthetic control is not a deck member and fails
check 9 by construction.

### `extend_badge_art.py` — badges-deck widening pass (spends money)
Outpaints an approved square master to the band's own 4:3 by extending its own
twill — because a mean-colour fill is measurably wrong at both seams (raking light
from the upper LEFT: left edges up to 12.4 sRGB lighter than right) and has no
weave grain. A separate file, not a flag: the prompt is an OUTPAINT instruction,
the reference image is REQUIRED, and the cheap model suffices — three things the
opposite of `gen_badge_art.py`, by design. `--all` is allowed here and forbidden
there because this operation is mechanical 22 times over; the looking is still
mandatory and per badge. Imports `check_badge_art.foreground_box` rather than
reimplementing "foreground". **Known limit: badge-deck paths are hardcoded; records
don't need it (native 4:3), so neither does the flag.**

### `make_badge_assets.py` — promotion (needs PIL)
Approved masters → content-hashed `public/` derivatives (panel 768×576 + shelf
mark 192² centre square crop) + the deck's generated manifest, a TOTAL
`Record<Key, Art>` so a key without art fails `typecheck` in the same session.
The hash in the filename is what licenses `next.config.ts` to serve
`/badges/*` and `/records/*` as `immutable` for a year; the orphan sweep removes
only files matching the generated shape for a known key. **The skill never runs
this** — regenerating `public/**` changes what ships and belongs in its own commit
alongside `badges:check` and `typecheck`.

### `make_badge_sheet.py` — whole-deck contact sheet (needs PIL; free)
All masters on one sheet at shelf (40px) and panel (160px) size, both `--paper`
themes. Answers the three questions no per-badge tool can ask: do any two badges
collide at shelf size, is it one bolt of cloth, does the shelf read as a set.
Session-invoked review tool — deliberately not part of the SKILL.md loop.
**Known limit: reads `lib/badges/catalog.ts` directly (pre-`decks.py`), so a
records sheet needs the `--deck` treatment first.**

### `make_badge_control.py` — free fixtures for the grader (needs PIL)
Draws four synthetic patches by arithmetic — `good`, `flat`, `offcentre`,
`bleached` — so `check_badge_art.py` can be exercised with no API call: good must
pass every hard check; each failure control must fail EXACTLY its designed check
and nothing else. CI runs this loop on every push —
`tools/check_badge_controls.py` (via `npm run badges:controls`) asserts all four
designed outcomes. Not art, never a grading fixture, never a source for
re-deriving a band. Controls are drawn from `style.md`'s tokens by copy (a shared
import shim would be more coupling than the duplication costs) — if the palette
moves, both files move.

### `gen_app_icon.py` — app-icon generator (spends money)
Same plumbing as `gen_badge_art.py` (key read, WSL DNS workaround, hand-built
POST, sidecars) and a completely different visual register: one flat vector idea
that survives a 40px squircle, not satin stitch. Separate from the badge tool on
purpose — borrowing it would mean weakening the parity guard that protects the
decks.

### `make_icon_assets.py` — `npm run icon:assets` (needs PIL)
Lifts the promoted silhouette off its ground by luminance, composes ground/bar/
scale from the app's real tokens (the model draws the figure; a rectangle draws
everything a rectangle can express), and writes every shipped icon: `public/icons/*`
(two decks — the runner's and a dark `/admin` tile), `app/icon.png`,
`app/apple-icon.png`, `app/admin/apple-icon.png`. Composed at 4× and downsampled
because PIL has no vector output. Icon filenames are deliberately NOT
content-hashed (manifests and Next file conventions want stable URLs; the immutable
header stops at `/badges|records/*` — do not move icons under those paths).

## Reverse wiring (why "no imports" ≠ "unused")

- **CI** (`.github/workflows/ci.yml`) runs `npm run badges:check`
  → `scripts/check-badge-art.mjs` reads `tools/decks.json`, both catalogs,
  `style.md`, both manifests and both `public/` trees, and asserts the API-key
  boundary via `scripts/check-openrouter-boundary.mjs`. Its separate
  `badge-art-controls` job runs `npm run badges:controls` →
  `check_badge_controls.py` (stdlib + a pinned Pillow, no npm ci) — the four
  designed control outcomes, asserted on every push.
- **`package.json`**: `badges:check`, `badges:controls`, `icon:assets`.
- **`next.config.ts`**: the immutable headers' comments credit `tools/decks.py` (the
  header matchers are per-deck ON PURPOSE so a third deck must be added consciously)
  and `make_badge_assets.py`'s orphan sweep.
- **`README.md`** drives both generators' dry-runs; `docs/architecture.md` describes
  this directory as the offline art pipeline; `assets/badges/README.md` and
  `lib/pwa.ts`/`components/ui/DetailPanel.tsx` credit the promoter and widening tools
  in their doc comments.
- **`docs/plans/archive/F10/F15/F25`** are the design records the headers cite;
  `docs/token_maxxing/2026-09-11-docs-plans-archive.md` repointed those citations.

## Gotchas

- **The control loop is CI-gated (2026-09-12).** The `badge-art-controls` job runs
  `make_badge_control.py` → `check_badge_art.py --no-anchor` on all four patches
  and asserts each one's designed outcome — the gate whose absence let F15's frame
  move silently kill the loop for three weeks (the controls stayed square, `good`
  died on check 1, nothing noticed until a session RAN the loop; re-cut in the
  same pass). The designed outcomes live in `check_badge_controls.py`'s EXPECTED
  table, stamped with their measure date and Pillow pin: after any change to a
  check's contract or band, re-run the loop and re-stamp — never widen EXPECTED
  to make red go away.
- **`RECORD_ART_SMALL_SIZE` is zero-reference and KEPT — decided 2026-09-12.** The
  generator emits `{deck.const_name}_SMALL_SIZE` unconditionally per deck; only the
  badges deck consumes it today. Resolution: keep, documented at the symbol —
  `emit_manifest` now writes the records deck's sizes block with the why (it is the
  contract half of the same F25 bet as the `small` field; the future shelf imports
  it exactly as `BadgeShelf` imports the badge deck's). Stopping emission would need
  a per-deck flag keyed on a product fact the generator cannot observe, and the
  constant is one line riding a derivative already decided to ship. The generated
  manifest's own docblock is the decision record; no future sweep re-litigates it
  (full analysis: `docs/token_maxxing/2026-09-12-badges-records-yagni.md`).
- **The records `.sm.webp` set ships unrendered** — the F25 plan pre-generated them
  deliberately (regenerating later would re-hash every filename); a product call,
  not dead code.
- **`--all` asymmetry is design, not drift**: forbidden in `gen_badge_art.py`
  (invention is per-badge), allowed in `extend_badge_art.py` (mechanical, identical).
  Don't "fix" it.
- **Warmth is `r − b` and NEGATIVE here.** The reference tool's cream substrate
  demanded the opposite sign; porting it back is the single easiest mistake in the
  grader.
- **The `.workflows/plan/` copies live INSIDE this repo tree.** Prose in adopted
  plans can name tools scripts and even `OPENROUTER_API_KEY`; that is why
  `check-openrouter-boundary.mjs` greps only source extensions.

## Verification stamp

2026-09-12, this tree: all ten scripts compile under Python 3.12.7 (PIL 12.3.0
present); `decks.py --selftest` all green; `badges:check` green with both decks
complete (22 badges, 11 records, style v2, one shared anchor); both decks'
`gen_badge_art.py --dry-run --all` assemble (22 + 11 prompts, parity guards green);
both promoters `--dry-run` clean; `gen_app_icon.py --all --dry-run` clean; the sheet
builds 22/22; the four controls grade exactly as designed and
`check_badge_controls.py` asserts that on every push (good passes; flat → check 3
sd floor; offcentre → 8a; bleached → check 3 grey band). Counts are
as-of-this-date state, not rules — the live count is whatever `badges:check` says.

## Notes

Documentation created 2026-09-12 by the `tokenmax-tools-package-hygiene` session,
which audited every script in the directory for dead/unused status. Verdict: **no
dead scripts** — every entry is either CI/npm-wired, part of the SKILL.md loop, or a
documented free review/control tool whose next use is foreseeable (the audit's
method and the one repair it produced are in
`docs/token_maxxing/2026-09-12-tools-package-hygiene.md`). Of that session's four
hygiene findings, the two hardcoded-deck limitations (sheet, extend) still stand
recorded above; the other two were resolved the same day — the control loop is now
CI-gated (`check_badge_controls.py`, added by `tokenmax-badge-pipeline-followups`),
and the zero-ref `_SMALL_SIZE` emission is decided and documented in the generator.
