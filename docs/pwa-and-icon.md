# PWA install and the home-screen icon

Moved out of the README on 2026-09-17 to keep the front page lean — see
[`README.md#getting-started`](../README.md#getting-started).

"Add to Home Screen" is a real install, not a bookmark, and the two things that make it one are
`app/manifest.ts` (`display: 'standalone'`) and `app/apple-icon.png` (the `apple-touch-icon` Safari
reads). Both read their names and colours from `lib/pwa.ts`, and `tests/pwa.install.test.ts`
asserts the whole contract — including that each icon file exists, is the size it claims, and
carries no alpha channel, because iOS mattes a transparent icon onto black. `/admin` ships a second
manifest, so installing it from the workshop opens the workshop.

`lib/pwa.ts` is also where to look before switching `statusBarStyle` to `'black-translucent'`: it
is `'default'` on purpose, because almost nothing in this app pads `env(safe-area-inset-top)` yet
and translucent would slide the screen titles under the notch.

The art is two steps, offline and committed, the same rule D12 sets for badge art — no runtime
image calls for it, no key on the server:

```bash
python3 tools/gen_app_icon.py plain      # candidates → assets/icon/_candidates/ (gitignored)
cp assets/icon/_candidates/plain.aNN.png assets/icon/silhouette.png   # pick one, by looking at it
npm run icon:assets                      # compose + write public/icons/* and app/*-icon.png
```

The split is deliberate: the model draws the runner, and `tools/make_icon_assets.py` draws the
ground, the zone bar, the scale and the centring from `globals.css`'s real tokens. It has to,
because the model returned `#2dc1f9` for a `#23beeb` ground, desaturated the zone colours, and
twice ignored an instruction to keep the bar clear of the bottom edge — where Android's circular
crop would have eaten it.
