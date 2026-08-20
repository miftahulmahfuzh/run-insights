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
   > organisation. D8 says any Google account may sign in, so this must be External.
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

> **The one gotcha:** a Testing-mode app expires its refresh tokens after **7 days**, so you'll be
> asked to sign in again roughly weekly. Harmless in development. When you're ready to stop that,
> come back and hit **Publish app** — with only those three non-sensitive scopes, publishing is
> immediate and needs no verification review.

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
   to it. That gives you the single canonical origin the roadmap's §4.8 requires — share links
   must be built from one origin, or a link sent over WhatsApp today resolves differently
   tomorrow.
4. Wait for propagation (DomaiNesia is usually minutes, but allow up to a few hours). Vercel
   issues the TLS certificate automatically once the records resolve.

Then set the production environment variables in **Vercel** → **Settings** →
**Environment Variables**:

- `AUTH_URL=https://runins.site` — **Production scope only.** Do not set it for Preview or
  Development.
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — all three scopes.

---

## Verification checklist

- [ ] `console.cloud.google.com` project dropdown reads `run-insights`
- [ ] Consent screen shows **External**, three scopes, your account under Test users
- [ ] Credentials page lists one Web application client
- [ ] All three redirect URIs registered, exactly as written above
- [ ] `.env.local` has `AUTH_GOOGLE_ID` ending `.apps.googleusercontent.com`
- [ ] `.env.local` has `AUTH_GOOGLE_SECRET` starting `GOCSPX-`
- [ ] `AUTH_URL` is **empty** in `.env.local`
- [ ] `.env.local` is git-ignored (`git check-ignore .env.local` prints the path)

---

## When it goes wrong

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | The URI isn't registered byte-for-byte. Compare `http`/`https`, trailing slash, `www`. |
| `access_blocked: has not completed verification` | App is in Testing and your account isn't a Test user — add it. |
| Sign-in works locally, fails on Vercel | `AUTH_URL` set on Preview, or the production URI not registered. |
| Signed out every week | Expected in Testing mode (7-day refresh token). **Publish app** to stop it. |
| `MissingSecret` at boot | `AUTH_SECRET` not reaching the runtime — check Vercel env scopes. |
