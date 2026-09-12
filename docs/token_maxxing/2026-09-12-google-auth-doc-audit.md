# Token-Maxxing Session — 2026-09-12: Google Auth Setup Doc Drift Audit

> **A WORKER session** (worker `google-auth-doc-audit` of coordinator
> `tokenmax-orch-2026-09-12`; no solo menu — the idea was pre-assigned by the
> coordinator, as with all of that fan-out's workers). The assignment: audit
> `docs/google-auth-setup.md` against the current `lib/auth` code and env vars,
> fixing any drift — it was **the one repo doc the entire 2-day token-maxxing
> sweep had not touched** (last commit 2026-08-20, `be3673d`).

## 🎯 Achievement / End Result

- **Goal of the burn:** Close the longest drift window any repo doc still
  carried. `docs/google-auth-setup.md` was written 2026-08-20 and every
  feature, refactor and doc sweep since then had walked past it — so every
  claim it made about auth behaviour, env vars and failure modes was three
  weeks stale by default. The pass re-measured each claim against the tree,
  fixed what the window had falsified, and left the rest explicitly verified.
- **Concrete changes:** commit `f15c272` — 1 file, +47/−10:
  `docs/google-auth-setup.md` only. Four drifts fixed, one new section added,
  and every surviving claim re-stamped with a measure date.
- **Real value delivered:**
  - The doc's headline gotcha was **backwards**: it told readers Google's
    7-day Testing-mode refresh-token expiry would sign them out weekly and to
    publish to stop it. The code deliberately requests `access_type=online`,
    stores **no** Google refresh token, and calls zero Google APIs after
    sign-in; sessions are self-signed 30-day JWT cookies — so Testing mode
    cannot expire anything. Rewrote the gotcha, the troubleshooting row (now:
    signed out sooner than 30 days → suspect an `AUTH_SECRET` rotation), and
    the publish recommendation (now about strangers signing in, not session
    length).
  - The "MissingSecret at boot" troubleshooting row can no longer be the first
    symptom of anything: `auth.ts` calls `authEnv()` at module scope **before**
    `NextAuth()` is constructed, so a missing/empty auth var crashes with
    `lib/env.ts`'s `INVALID AUTH ENVIRONMENT` banner naming the offender.
    Replaced with the real symptom.
  - Two citations pointed at a **deleted file**: the doc's "D8" and "roadmap
    §4.8" referenced `ROADMAP_v0.1.0.md`, retired in `204fd34`. Both
    requirements are now stated self-contained (any Google account may sign
    in; canonical origin `https://runins.site` for share links) and point at
    living code (`lib/share/origin.ts`) instead of the corpse.
  - `ADMIN_EMAILS` — which landed in feat(f33), inside the drift window — was
    entirely absent from a setup doc for the pages it gates. Now in Part 4 (as
    "one choice this document makes for you"), Part 5's Vercel env-var list
    (Production scope), the verification checklist, and a new troubleshooting
    row (admin pages fail as a **404**, not an error).
  - A new **"Where these live in the code"** section: a table mapping each env
    var and behaviour the setup doc creates to the file implementing it,
    stamped "Authenticated against the tree as of 2026-09-12" — the next
    auditor's starting point, not another blind re-read.
  - Five load-bearing claims survived verification unchanged and are now
    confirmed rather than assumed (details below).
- **Branch:** `token-maxxing-2026-09-12-google-auth-doc-audit`
- **Merge status:** on branch — worker does not merge in worker mode;
  coordinator `tokenmax-orch-2026-09-12` owns the landing of `f15c272`
  immediately after this report.
- **Approx token burn:** high, deliberately — ~10 ground-truth files read in
  full, roadmap archaeology in git history, a full claim-by-claim findings
  table, and byte-level verification of the coordinator's on-behalf commit. 🔥

## Context & Motivation

The 2026-09-12 fan-out swept the repo twice over — dead code, package readmes,
todo ledgers, design docs, architecture doc — and one document kept not coming
up: `docs/google-auth-setup.md`. It is the operator-facing walkthrough for
standing up Google sign-in on `runins.site`, and its last commit predates the
entire sweep: `be3673d`, 2026-08-20 ("plan v0.1.0 — measured feasibility, 11
feature plans, 39 rulings" — the doc was born as an appendix to the roadmap
era).

Everything that could have invalidated it landed *after* that commit: the
auth refactor that split `auth.ts`/`auth.config.ts`, the `lib/env.ts` boot
validation, the share-origin canonicalisation, the contract-trio retirement
that deleted the roadmap it cited, and the f33 admin-gating work that added
`ADMIN_EMAILS`. The coordinator assigned exactly this audit as one worker of
the fan-out: read the doc claim by claim, check each against the tree, and
fix what the window broke.

## What We Did (blow-by-blow)

1. **Established the drift window from git, not from the header.**
   `git log --follow -- docs/google-auth-setup.md` gave exactly two commits:
   `be3673d` (2026-08-20, birth) and this session's fix. Everything between
   2026-08-20 and today is candidate drift — which includes f01, f02, the
   auth split, the env-validation work, f33 and `204fd34`.

2. **Read the ground truth in full** — ~10 files: `auth.ts`, `auth.config.ts`,
   `lib/env.ts`, `lib/auth/actions.ts`, `lib/auth/requireUserId.ts`,
   `lib/auth/safeNext.ts`, `app/api/auth/[...nextauth]/route.ts`, `proxy.ts`,
   `.env.example`, and `.env.local` for **names and emptiness only** — no
   secret value was ever printed. Plus `README.md` cross-references, and the
   deleted `ROADMAP_v0.1.0.md` recovered from history.

3. **Recovered the deleted roadmap's actual wording.** The doc cites "D8" and
   "roadmap §4.8", and `ROADMAP_v0.1.0.md` no longer exists in the tree.
   `git show be3673d:ROADMAP_v0.1.0.md` recovered the real text, so the
   rewrites quote the actual ruling (any Google account may sign in; canonical
   origin for share links) rather than a paraphrase of a paraphrase.

4. **Built the full claim-by-claim findings table** — every stated fact in the
   doc, re-measured today: word-boundary greps for each named symbol,
   existence/path checks for every file and route the doc names, version
   checks from `package.json`, and scope checks for each env var.

5. **Fixed the four drifts and added the code-map section** (all landing in
   `f15c272`, blow-by-blow under Code / Design Details below).

6. **Ran the gate** (`npx prettier --check` on the doc — clean; no code
   changed, so no tsc/vitest/build), then stopped — worker mode.

## Code / Design Details

**Drift 1 — the Testing-mode gotcha was backwards.** The doc's central
warning said Google's Testing-mode 7-day refresh-token expiry signs users out
weekly and recommended publishing the app to stop it. The tree says otherwise:
`auth.config.ts` deliberately requests `access_type=online` and stores **no**
Google refresh token, because the app calls zero Google APIs after sign-in —
there is no refresh token for Testing mode to expire. The session cookie is a
self-signed 30-day JWT, untouched by Google's consent-screen status. Three
passages were rewritten around the real model: the gotcha callout, the
"Signed out every week" troubleshooting row (now "Signed out sooner than 30
days → the usual cause is an `AUTH_SECRET` rotation, which signs every session
out at once"), and the publish recommendation (now motivated by strangers
signing in to your app, not by session length).

**Drift 2 — "MissingSecret at boot" is no longer reachable as first symptom.**
`auth.ts` calls `authEnv()` at module scope **before** `NextAuth()` is
constructed, so a missing or empty auth var crashes at import time with
`lib/env.ts`'s `INVALID AUTH ENVIRONMENT` banner — which names the offender —
long before Auth.js could emit its own `MissingSecret`. The troubleshooting
row now describes the banner and points at Vercel environment scopes as the
usual culprit.

**Drift 3 — citations to a deleted file.** "D8" and "roadmap §4.8" died with
`ROADMAP_v0.1.0.md` in `204fd34` (2026-09-10, contract-trio retirement). Both
requirements are now stated self-contained in the doc — any Google account may
sign in; share links are built from the canonical origin
`https://runins.site` — each pointing at the living code that enforces it
(`lib/share/origin.ts` for the origin rule).

**Drift 4 — `ADMIN_EMAILS` missing from its own setup doc.** The variable
landed in feat(f33), inside the drift window, and gates `/admin/nina` and
`/admin/memory` on the Google address you sign in with — failing as a **404**
by design, not an error. Added in four places: Part 4 (framed as "one choice
this document makes for you"), Part 5's Vercel env-var list (**Production
scope**), the verification checklist, and a new troubleshooting row
("Admin pages 404 → the signed-in address isn't in `ADMIN_EMAILS`").

**New section — "Where these live in the code".** A table mapping each env
var and behaviour the setup doc creates to its implementing file:
`lib/env.ts` (`authSchema`, invoked at module scope in `auth.ts`),
`auth.config.ts` (consent scopes, `access_type=online`, session shape with
30-day `maxAge`), `app/api/auth/[...nextauth]/route.ts` (the callback path),
`lib/auth/actions.ts` + `components/auth/SignInCard.tsx` (the sign-in
surface), `lib/auth/safeNext.ts`, `lib/auth/requireUserId.ts`,
`lib/share/origin.ts` (canonical origin), `.env.example`. Stamped
"Authenticated against the tree as of 2026-09-12" so the next auditor knows
the claim's measure date.

**Verified-unchanged claims** (the audit's negative results, now on record):
the three consent-screen scopes in the doc exactly match what the code
requests — `auth.config.ts` sets no scope override, so Auth.js v5's Google
default (`openid email profile`) applies; the callback path
`/api/auth/callback/google` matches the `[...nextauth]` route handler;
`AUTH_URL` measured **empty (length 0)** in `.env.local` and is
Production-scope-only in both `lib/env.ts` and `.env.example`; `next-auth` is
`5.0.0-beta.32`, so "Auth.js v5" is the correct name; and the
preview-deployment wildcard limitation stands.

## Decisions & Trade-offs

- **Re-measure every claim, not just the suspects.** A three-week window is
  wide enough that "probably fine" is not a verdict; the findings table covered
  every stated fact, which is what turned five claims into confirmed-unchanged
  rather than unexamined.
- **Quote the dead roadmap's real wording.** Recovering the text via
  `git show be3673d:ROADMAP_v0.1.0.md` cost one command and bought
  self-contained rewrites that ruling-faithful rather than memory-faithful.
- **Point at living code, not at another doc.** The replacement citations name
  the file that enforces each requirement, so the next drift is a code move,
  which greps catch — not a doc-to-doc chain, which rots silently.
- **`ADMIN_EMAILS` treated as setup-doc material, not just a troubleshooting
  row.** It gates which sign-in can open admin pages — a reader following the
  doc top to bottom needs it before the verification checklist, so it went into
  four places rather than one.
- **One related observation recorded, deliberately not acted on:** local
  `.env.local` has **no `ADMIN_EMAILS` key at all**, so local admin-page calls
  would fail `lib/env.ts`'s lazy `adminEnv()` validation. Out of scope for a
  doc audit, and production scopes were not inspected — recorded here so it is
  a known fact, not a surprise.
- **Report, never merge.** Worker mode — coordinator `tokenmax-orch-2026-09-12`
  owns the landing.

## Follow-ups & YAGNI notes

- **Local `.env.local` lacks `ADMIN_EMAILS` entirely.** Anyone debugging admin
  pages locally hits `lib/env.ts`'s lazy `adminEnv()` validation failure. Left
  alone: adding the key is an operator-env decision, not a doc-audit one, and
  production scopes were not inspected.
- **The "Where these live in the code" table is now the doc's fastest-drifting
  part** — every row is a file path. The stamp names its measure date; a future
  auth refactor should re-check that table first.
- **The doc still carries no automated guard** (no test or CI check ties it to
  the code). Consistent with the repo's other prose docs; the drift-window
  method in the Appendix is the manual gate.

## Appendix

**Method — the transferable bit.** The drift window came from
`git log --follow -- docs/google-auth-setup.md`, **not** from any header date.
Every stated fact was re-measured today: word-boundary greps, path extraction
for every file and route the doc names, and secret values never printed. The
deleted roadmap's actual wording was recovered with
`git show be3673d:ROADMAP_v0.1.0.md` so the rewrites quote the real ruling.

**Drift window:** `be3673d` (2026-08-20) → HEAD. Everything in between —
including the auth split, `lib/env.ts` validation, feat(f33) and the
`204fd34` contract-trio retirement — was candidate drift; four hits, five
confirmed-unchanged.

**Work commit (on `token-maxxing-2026-09-12-google-auth-doc-audit`):**

```
f15c272 docs: close the google-auth-setup.md drift window
```

1 file changed, 47 insertions(+), 10 deletions(-) — `docs/google-auth-setup.md`
only.

**A note on who committed it:** the worker hit repeated API errors at the
commit step; coordinator `tokenmax-orch-2026-09-12` committed `f15c272` on the
worker's branch on the worker's behalf, and the content was verified
byte-identical to the worker's edit via `git diff` before acceptance. The
session doc records this so the commit's authorship story stays recoverable
from git.

**Gates run:** `npx prettier --check` on the doc — clean. No code changed, so
no tsc/vitest/build run.

**Merge status:** on branch — coordinator `tokenmax-orch-2026-09-12` merges
`f15c272` to main immediately after this report.
