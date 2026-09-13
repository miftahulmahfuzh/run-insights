---
name: set-current-image-gen-prompt-as-default
description: Promote Nina's currently live, hand-edited image-generation prompt (the per-user override saved from /admin/image-generation) into the shipped default in lib/nina/imagegen.ts, for Run Insights. Use when the user has been trial-and-error editing the image generation prompt and now believes the current version is better than the original default and wants it baked in as the new default — e.g. "/set-current-image-gen-prompt-as-default", "make my current image prompt the new default", "promote this prompt to prod", "the tweaked prompt is better, ship it as the baseline", "stop treating this as an override".
---

# Promote the live image-generation prompt to the shipped default

## The two places this prompt lives, and why promoting it is two operations

Nina's selfie prompt has a **default** and an **override**, and they are different kinds of
thing:

| | What | Where |
|---|---|---|
| Default | `NINA_PROMPT_TEMPLATE_DEFAULT`, a hardcoded TS constant | `lib/nina/imagegen.ts:431-455` |
| Override | `nina_image_prefs.prompt_template`, one row per user, `''` = "use the default" | production DB, written by `/admin/image-generation` |

`effectiveNinaImageTemplate()` (`lib/nina/imagegen.ts:495-501`) picks the override when it is
non-empty and valid, else the default. **"Promote the current prompt to the new default" is
therefore a source edit plus a production DB write, not a single operation** — and the two must
happen in a specific order, below.

There is no third place: no `is_default` column, no `image_gen_prompts` history table.
`drizzle/0017_retire_imageprefs_revision.sql` dropped the one versioning column this table ever
had. A promotion is irreversible unless you keep your own copy of the old constant (git history
does this for free — that is reason enough not to skip the commit step).

## Read this before you run it: the promoted text usually forks shared canon

The default constant is not one hand-written paragraph — it is assembled from persona canon
(`lib/nina/persona/appearance.ts`): `NINA_SELFIE_STYLE` (defined in `imagegen.ts:82` itself),
`NINA_FACE`, `NINA_BODY_FACTS` and `NINA_BODY_SENTENCES`. Those same constants also feed the
avatar prompt (`NINA_AVATAR_PROMPT_TEMPLATE_DEFAULT`, `imagegen.ts:467-485`) and other places
`ninaAppearance()` is called.

**Measured on this database, 2026-09-13:** the live override had rewritten the opening style
line, the whole SUBJECT paragraph and the whole FACE paragraph — none of the three canon blocks
survived verbatim — and left only the static label lines (`Her outfit for this photograph:
{{wardrobe}}`, `FOCUS:`, `POSE AND PRESENCE:`, `VENUE:`, `TIME:`, `SCENE:`, `EXPRESSION AND
ENERGY:`, `NOTES:`) byte-identical to the shipped default. **Expect this, don't be surprised by
it** — the admin textarea starts from the assembled default and an operator doing real trial and
error edits the persona prose first, because that's what's wrong with the photos.

This forces a real product decision that this skill does not make silently:

- **Inline only** — rewrite `NINA_PROMPT_TEMPLATE_DEFAULT`'s array with the edited prose as plain
  string literals. The selfie prompt changes; the avatar prompt and anything else reading
  `NINA_FACE`/`NINA_BODY_FACTS` directly keep the OLD canon text. The two diverge on purpose.
- **Update canon too** — also edit the changed sentences into `lib/nina/persona/appearance.ts`'s
  `NINA_FACE` / `NINA_BODY_FACTS` / `NINA_BODY_SENTENCES`, so `imagegen.ts` keeps referencing the
  symbols rather than inlining a copy, and the avatar prompt converges to match.

**Ask the operator which one they want, naming exactly which canon blocks changed and what changed
in each, before writing anything.** Do not default to "inline only" just because it is the smaller
diff — a face description that quietly stops matching the avatar is exactly the kind of drift
`update-nina-profpic`'s own doc warns about for the *anchor* image, and this is the text
equivalent.

## The loop

### 1. Dry run — read the live override

```bash
npm run nina:promote-image-prompt
```

On more than one user this refuses and lists them; re-run with `--user <id>`. It prints, in order:
the user, the row's `updated_at`, then the override's raw text between `--- live override,
verbatim ---` markers, after validating it with `validateNinaImageTemplate` — a stored override
that fails validation is refused (`effectiveNinaImageTemplate` is already silently ignoring it in
production; promoting it would ship the same brokenness as the new baseline) and a `''` override
means "already the default, nothing to promote," both exit 0/1 with no write either way.

### 2. Diff it by hand against the default and its canon

Read `lib/nina/imagegen.ts:431-455` (`NINA_PROMPT_TEMPLATE_DEFAULT`) and, since that array quotes
`NINA_SELFIE_STYLE` (`imagegen.ts:82`) and pulls `NINA_FACE`/`NINA_BODY_FACTS`/
`NINA_BODY_SENTENCES` from `lib/nina/persona/appearance.ts` rather than spelling them out, resolve
those symbols before comparing. Line up the live text against this resolved version paragraph by
paragraph. The static label lines almost never change — they're the eight `LABEL: {{token}}` lines
— so the real diff is normally confined to the style line, the SUBJECT paragraph and the FACE
paragraph.

### 3. Resolve the canon-fork question (previous section), then edit

- **Always** edit `NINA_PROMPT_TEMPLATE_DEFAULT`'s array literal (`imagegen.ts:431-455`) to the
  live text, preserving the `.join('\n')` shape and the blank-line separators between blocks (they
  matter: `renderNinaImagePrompt` drops a whole line when one of its tokens expands empty, and
  blank lines are the visual paragraph breaks in the rendered prompt).
- **If updating canon too**, edit the changed sentences into `lib/nina/persona/appearance.ts`
  (`NINA_FACE` at line 98, `NINA_BODY_FACTS` at line 64) and keep `imagegen.ts` referencing the
  symbols rather than inlining — do not fork the same text into two files.
- Leave `NINA_AVATAR_PROMPT_TEMPLATE_DEFAULT` (`imagegen.ts:467-485`) alone either way — per its
  own comment, it is deliberately the one template the operator never edits from the panel.

### 4. Verify before touching anything else

```bash
npm run typecheck
npx vitest run tests/nina.imagerecipe.test.ts
```

No test pins `NINA_PROMPT_TEMPLATE_DEFAULT`'s exact text (checked: only `toContain` assertions on
specific facts like `'on the track'`, `'high ponytail'`), so a passing rewrite is a real green, not
a stale snapshot. If you changed canon constants too, widen the test run — `NINA_FACE` /
`NINA_BODY_FACTS` feed other suites beyond this one file.

### 5. Commit, then stop for push

```bash
git add lib/nina/imagegen.ts lib/nina/persona/appearance.ts   # whichever files you actually touched
git commit -m "..."
```

**Stop here and ask before `git push`.** This repo has one database and pushing to `main` starts a
Vercel production deploy — a shared, hard-to-reverse action, not a local edit. State what changed
and let the operator say go.

### 6. After the deploy has actually shipped — retire the override

Not before. Until the new code is live, `nina_image_prefs.prompt_template` is the ONLY thing
serving the improved prompt — clearing it early makes `effectiveNinaImageTemplate` fall through to
the OLD default for every photograph generated in the deploy window, a real regression. Confirm
the deploy shipped (Vercel dashboard, or `vercel inspect`), then:

```bash
npm run nina:promote-image-prompt -- --user <id> --reset-after-deploy
```

This is the script's only write: `update nina_image_prefs set prompt_template = ''`. It is not
strictly required for correctness — the row now merely duplicates the new default rather than
diverging from it — but it keeps "override" meaningful and makes the panel's own "Reset to
default template" read as true again for this user.

### 7. Confirm

```bash
npm run nina:promote-image-prompt -- --user <id>
```

Should now say `prompt_template is "" — this user is already on the shipped default.` Then open
`/admin/image-generation` and check the textarea shows the new prose with no unsaved-diff state.

## Refusals, and what each one means

| It says | It means |
|---|---|
| `missing DATABASE_URL` | run with `--env-file=.env.local` |
| `this database holds N users; pass --user <id>` | pick the account whose override you mean; do not guess |
| `this database holds no users at all` | wrong Neon branch — fix the connection |
| `no nina_image_prefs row for this user` | the panel has never saved anything for them; nothing to promote |
| `prompt_template is ""` | already on the default; nothing to promote |
| `REFUSING to promote: ... does not pass validateNinaImageTemplate` | the stored override is already broken and `effectiveNinaImageTemplate` is silently ignoring it in production — the row is stale, not live; fix it in the panel first if it should be promoted |
| `there is no nina_image_prefs table` | the image-gen-controls migration (`drizzle/0020_image_gen_controls.sql`) hasn't been applied here |

## Common mistakes

| Mistake | What happens |
|---|---|
| Running `--reset-after-deploy` before the push actually deployed | production silently regenerates photos from the OLD default until the deploy catches up |
| Inlining the edited FACE/BODY prose without checking whether it still matches `lib/nina/persona/appearance.ts` | the avatar prompt and any other canon consumer quietly stop matching the selfie prompt, and nobody decided that on purpose |
| Assuming the static label lines changed too | in the one measured case they didn't — the real diff is almost always the style/SUBJECT/FACE prose, not the `{{token}}` scaffolding |
| Treating this as a database-only change | the default constant must be edited too, or the *next* user to touch the panel (or any code path with an empty override) still gets the old prompt |
| Pushing straight to `main` without asking | this repo has one database and one production deploy target; treat the push like any other shared, hard-to-reverse action |
| Looking for a prompt-history table to roll back from | there isn't one (revision columns were dropped, `drizzle/0017`); the git commit from step 5 is the only rollback path |

## What this skill deliberately does not do

- **It never edits `NINA_AVATAR_PROMPT_TEMPLATE_DEFAULT`.** That template is not operator-editable
  by design (`imagegen.ts:457-465`'s own comment), and this skill has no business changing that.
- **It never guesses the canon-fork decision.** Inline-only vs. update-canon-too changes what other
  surfaces of the app show; it is asked, not assumed.
- **It never pushes to `main` on its own.** The commit is made and the operator is asked, exactly
  once, before anything leaves the local tree.
- **It does not add a prompt-history/versioning table.** None exists; inventing one is a separate,
  larger decision than "promote what's live today."
