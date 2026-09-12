# Google sign-in setup — runins.site

Everything needed to fill `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `.env.local`, plus the
DNS to point **runins.site** (DomaiNesia) at Vercel.

`AUTH_SECRET` is **already generated and written** to `.env.local`. Don't regenerate it —
changing it invalidates every existing session.

---

## Part 1 · Create the Google Cloud project

1. Go to **<https://console.cloud.google.com/>** and sign in with the Google account you want to
   own this project.
2. Click the **project dropdown** in the top bar → **New Project**.
   - **Project name:** `run-insights`
   - **Organization / Location:** *No organization* is fine for a personal project.
3. **Create**, then make sure the project dropdown now shows `run-insights`. Everything below
   happens inside this project — creating credentials in the wrong project is the single most
   common way to lose an hour here.

---

## Part 2 · Configure the OAuth consent screen

Google now calls this **Google Auth Platform**. Left sidebar → **APIs & Services** →
**OAuth consent screen** (or search "Google Auth Platform").

1. **Get started** / **Configure consent screen**.
2. **App Information**
   - **App name:** `Run Insights` — this is what you'll see on the consent dialog, so it's worth
     getting right.
   - **User support email:** your address.
3. **Audience:** choose **External**.
   > **Internal** is only available on Google Workspace and would restrict sign-in to your
   > organisation. The product ruling is that **any Google account may sign in** — ruling D8 of
   > the v0.1.0 roadmap (the contract docs were retired from the tree in September 2026 and live
   > in git history) — so this must be External.
4. **Contact Information:** your email again.
5. Agree to the policy and **Create**.

### Scopes

**Add or Remove Scopes** → select only these three, then **Update**:

| Scope | Why |
|---|---|
| `.../auth/userinfo.email` | the account identifier Auth.js keys users on |
| `.../auth/userinfo.profile` | display name and avatar |
| `openid` | standard OIDC |

**Do not add anything else.** Extra scopes trigger Google's verification review, which takes days
and is entirely avoidable — these three are all "non-sensitive" and need no review.

### Publishing status

Leave the app in **Testing** for now and add your own Google account under **Test users** →
**Add users**. In Testing mode only listed test users can sign in, which is exactly right while
you build.

> **A gotcha this app has opted out of:** Google expires the refresh tokens of a Testing-mode
> app after **7 days** — but only tokens it actually issued. Run Insights deliberately requests
> `access_type=online` and stores **no** Google refresh token at all (`auth.config.ts`: the app
> calls zero Google APIs after sign-in), and the session itself is a self-signed **30-day**
> cookie. So Testing mode does not sign you out weekly, and there is no session-length reason to
> publish. Hit **Publish app** when people other than you start signing in — with only those
> three non-sensitive scopes, publishing is immediate and needs no verification review.

---

## Part 3 · Create the OAuth client

**APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth client ID**.

1. **Application type:** **Web application**
2. **Name:** `run-insights web` (internal label only)

### Authorised JavaScript origins

Add all three:

```
http://localhost:3000
https://runins.site
https://www.runins.site
```

### Authorised redirect URIs

Add all three. **These must match byte-for-byte** — Google compares them literally, and a
trailing slash or `http` vs `https` is a `redirect_uri_mismatch` error:

```
http://localhost:3000/api/auth/callback/google
https://runins.site/api/auth/callback/google
https://www.runins.site/api/auth/callback/google
```

> The path is fixed by Auth.js v5's route handler at `/api/auth/[...nextauth]` — the provider id
> `google` is the last segment. Don't invent a different path.

> **Vercel preview deployments won't work with this.** Every preview gets a fresh
> `run-insights-<hash>.vercel.app` hostname, and you can't pre-register a wildcard — Google
> doesn't accept them. Two options: test auth on localhost and production only (recommended, and
> what the expense tracker does), or add one stable preview alias domain in Vercel and register
> that one URL here.

3. **Create.** Google shows a modal with the **Client ID** and **Client secret**.

---

## Part 4 · Fill `.env.local`

Copy the two values straight into `/home/miftah/run-insights/.env.local`:

```bash
AUTH_GOOGLE_ID=<the Client ID, ends in .apps.googleusercontent.com>
AUTH_GOOGLE_SECRET=<the Client secret, starts with GOCSPX->
```

Leave `AUTH_URL` **empty** locally. Auth.js infers the origin from the request in development
and on preview; setting it is what breaks preview sign-in.

You can re-download the client secret later from the Credentials page, so the modal isn't your
only chance — but treat it like a password: it goes in `.env.local` and Vercel's environment
variables, never into a file that's committed.

**One choice this document makes for you:** whichever Google account completes its first sign-in
becomes your `user` row, and the admin pages (`/admin/nina`, `/admin/memory`) check that address
against `ADMIN_EMAILS`. If you want those pages, make sure the account you sign in with appears
in `ADMIN_EMAILS` — comma-separated, case-insensitive, set in `.env.local` and in Vercel's
**Production** scope. A mismatch doesn't error: the pages just 404, which is easy to misread as
a broken deploy (`lib/env.ts`).

---

## Part 5 · DomaiNesia DNS → Vercel

Do this **after** the project is deployed to Vercel at least once.

1. In **Vercel** → project → **Settings** → **Domains** → add `runins.site`.
2. Vercel shows the target records. Add them in **DomaiNesia** → **Domain** → **DNS Management**:

| Type | Name / Host | Value | Note |
|---|---|---|---|
| `A` | `@` | `76.76.21.21` | Vercel's apex IP — **use whatever Vercel shows you**, not this from memory |
| `CNAME` | `www` | `cname.vercel-dns.com` | |

3. In Vercel, set **`runins.site` as the primary domain** and `www.runins.site` to **redirect**
   to it. That gives you the single canonical origin the share-link rule requires — share links
   are built from `https://runins.site`, never from a per-deployment URL, so a link sent over
   WhatsApp today resolves identically tomorrow (`lib/share/origin.ts`; this was §4.8 of the
   v0.1.0 roadmap, which now lives in git history).
4. Wait for propagation (DomaiNesia is usually minutes, but allow up to a few hours). Vercel
   issues the TLS certificate automatically once the records resolve.

Then set the production environment variables in **Vercel** → **Settings** →
**Environment Variables**:

- `AUTH_URL=https://runins.site` — **Production scope only.** Do not set it for Preview or
  Development.
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — all three scopes.
- `ADMIN_EMAILS` — Production scope; the Google address(es) that may open the admin pages. See
  the note at the end of Part 4.

---

## Verification checklist

- [ ] `console.cloud.google.com` project dropdown reads `run-insights`
- [ ] Consent screen shows **External**, three scopes, your account under Test users
- [ ] Credentials page lists one Web application client
- [ ] All three redirect URIs registered, exactly as written above
- [ ] `.env.local` has `AUTH_GOOGLE_ID` ending `.apps.googleusercontent.com`
- [ ] `.env.local` has `AUTH_GOOGLE_SECRET` starting `GOCSPX-`
- [ ] `AUTH_URL` is **empty** in `.env.local`
- [ ] `ADMIN_EMAILS` (locally, and in Vercel's Production scope) contains the Google address you
      sign in with
- [ ] `.env.local` is git-ignored (`git check-ignore .env.local` prints the path)

---

## When it goes wrong

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | The URI isn't registered byte-for-byte. Compare `http`/`https`, trailing slash, `www`. |
| `access_blocked: has not completed verification` | App is in Testing and your account isn't a Test user — add it. |
| Sign-in works locally, fails on Vercel | `AUTH_URL` set on Preview, or the production URI not registered. |
| Signed out sooner than 30 days | Not the old 7-day Testing expiry — no Google refresh token is stored. The usual cause is an `AUTH_SECRET` rotation, which signs every session out at once. |
| `INVALID AUTH ENVIRONMENT` at boot | A required auth var is missing or empty — `lib/env.ts` validates loudly when `auth.ts` loads, and the banner names the offender. On Vercel, check the variable's environment scopes. |
| Admin pages 404 | The signed-in address isn't in `ADMIN_EMAILS` (Part 4 note). By design this is a 404, not an error. |

---

## Where these live in the code

For whoever debugs the setup rather than performs it — the code that consumes what this document
tells you to create. Authenticated against the tree as of 2026-09-12.

| What | Where |
|---|---|
| Loud boot validation of all four `AUTH_*` vars | `lib/env.ts` (`authSchema`), invoked at module scope in `auth.ts` — a missing value crashes the boot with an `INVALID AUTH ENVIRONMENT` banner, never a silent `undefined` |
| The Google provider: `prompt=select_account`, `access_type=online` (no refresh token stored), `allowDangerousEmailAccountLinking: false` | `auth.config.ts` |
| Session shape: JWT in a cookie, 30-day `maxAge`, rewritten at most daily | `auth.config.ts` (`session`) |
| The callback path the redirect URIs point at (`/api/auth/callback/google`) | `app/api/auth/[...nextauth]/route.ts` — the directory name must stay exactly `[...nextauth]` |
| The sign-in / sign-out actions behind the form on `/` | `lib/auth/actions.ts`, rendered by `components/auth/SignInCard.tsx` |
| Post-sign-in redirect sanitising (`?next=`) | `lib/auth/safeNext.ts` |
| The actual security boundary on every request | `lib/auth/requireUserId.ts` — `proxy.ts` only bounces obvious unauthenticated pages and never matches `/api/auth/*` |
| Share links built from the canonical origin | `lib/share/origin.ts` |
| The committed template these values belong in | `.env.example` — ships `AUTH_URL` empty on purpose; `AUTH_URL=''` is how a dotenv file spells "unset" |
