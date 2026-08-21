import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import manifest from '@/app/manifest'
import { APPLE_WEB_APP, INSTALL, PWA_ICONS } from '@/lib/pwa'

/**
 * The regression guard for "Add to Home Screen gave me a bookmark with an 'R' on it".
 *
 * Both halves of that bug were one absence: this app shipped with no manifest, no
 * `mobile-web-app-capable`, and no icon file of any kind, so iOS had nothing to install and
 * nothing to draw and fell back to a Safari bookmark tiled with the first letter of the title.
 * Neither half fails a typecheck, a lint, or any other test in this repo — an install contract is
 * invisible to every tool except a phone — so it is asserted here or it is not asserted at all.
 *
 * WHY THIS DOES NOT IMPORT `app/layout.tsx`. That module opens with `next/font/google` and
 * `./globals.css`, both of which are compiler transforms rather than runtime modules; Vitest has
 * neither, so importing the layout throws before a single assertion runs. That constraint is the
 * reason `lib/pwa.ts` exists at all: the contract lives in a plain module the layout spreads and
 * this file imports, so there is one source of truth and it is reachable from a test. The last
 * case below is what stops the layout from quietly drifting away from it.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/**
 * Width, height and "does it have an alpha channel" straight out of the PNG header — 8-byte
 * signature, then the IHDR chunk, whose payload is width:u32, height:u32, depth:u8, colour type:u8.
 *
 * Hand-parsed because the alternative is a dependency, and this is 12 bytes at a fixed offset.
 * Colour type is the interesting field: 4 and 6 carry alpha, 0/2/3 do not. iOS composites a
 * transparent apple-touch-icon onto BLACK rather than onto the page background, which turns any
 * icon with a soft edge into a dark halo on the home screen, so opacity is a real requirement
 * rather than a stylistic one.
 */
function pngHeader(path: string) {
  const buf = readFileSync(path)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(buf.subarray(0, 8).equals(signature), `${path} is not a PNG`).toBe(true)
  expect(buf.subarray(12, 16).toString('ascii'), `${path}: first chunk is not IHDR`).toBe('IHDR')
  const colourType = buf[25]
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    hasAlpha: colourType === 4 || colourType === 6,
  }
}

describe('the web app manifest', () => {
  const m = manifest()

  it('declares standalone display, which is the entire fix for the Safari chrome', () => {
    // Without this the install is a bookmark: URL bar at the bottom, tab strip, share bar.
    expect(m.display).toBe('standalone')
  })

  it('scopes the whole app so an in-app link does not eject to Safari', () => {
    expect(m.start_url).toBe('/')
    expect(m.scope).toBe('/')
  })

  it('keeps short_name inside the label iOS will actually draw', () => {
    // Over ~12 characters iOS truncates under the icon, and the truncation is the app's name.
    expect(m.short_name).toBeTruthy()
    expect(m.short_name!.length).toBeLessThanOrEqual(12)
  })

  it('tints the splash from the design tokens rather than from a guess', () => {
    // --paper, light scheme, app/globals.css. A manifest takes one value, so it takes the light one.
    expect(m.background_color).toBe('#c9e9fb')
    expect(m.theme_color).toBe('#c9e9fb')
  })

  it('offers the three icons an installer looks for', () => {
    const icons = m.icons ?? []
    const any = icons.filter((i) => i.purpose === 'any')
    expect(any.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
    // Android/Chrome crops a non-maskable icon into its shape and clips the art. A maskable
    // variant is the one that survives that crop, and it is a separate file, not a flag.
    expect(icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true)
  })
})

describe('the icon files on disk', () => {
  it('exist at every path the manifest advertises', () => {
    for (const icon of PWA_ICONS) {
      const path = `${ROOT}public${icon.src}`
      expect(existsSync(path), `manifest advertises ${icon.src}, which is not in public/`).toBe(
        true,
      )
    }
  })

  it('are the size they claim to be, and are opaque', () => {
    for (const icon of PWA_ICONS) {
      const [declared] = icon.sizes.split('x')
      const header = pngHeader(`${ROOT}public${icon.src}`)
      expect(header.width, `${icon.src} width`).toBe(Number(declared))
      expect(header.height, `${icon.src} is not square`).toBe(header.width)
      expect(header.hasAlpha, `${icon.src} has an alpha channel; iOS mattes it onto black`).toBe(
        false,
      )
    }
  })

  it('include the two file-convention icons Next puts in <head>', () => {
    // app/icon.png becomes <link rel="icon">; app/apple-icon.png becomes <link
    // rel="apple-touch-icon">, which is the one Safari reads for "Add to Home Screen". A manifest
    // alone does NOT give iOS a home-screen icon — this file is what fixes the "R".
    for (const name of ['icon.png', 'apple-icon.png']) {
      const path = `${ROOT}app/${name}`
      expect(existsSync(path), `app/${name} is missing`).toBe(true)
      const header = pngHeader(path)
      expect(header.width, `app/${name} is not square`).toBe(header.height)
      expect(header.hasAlpha, `app/${name} has an alpha channel; iOS mattes it onto black`).toBe(
        false,
      )
    }
  })
})

describe('the Apple web-app metadata', () => {
  it('claims standalone capability', () => {
    expect(APPLE_WEB_APP.capable).toBe(true)
  })

  it('keeps the status bar opaque, because no header in this app pads the notch', () => {
    /*
     * NOT 'black-translucent', however much better it looks in a screenshot. Translucent means the
     * page runs UNDER the status bar, which is only safe when every fixed top element pads itself
     * by env(safe-area-inset-top). In this app exactly one does — components/review/
     * ScreenshotStrip.tsx, a full-bleed overlay — while `ScreenHeader` and every page use a plain
     * p-5. Switching this to translucent slides the "TODAY" and "TRENDS" titles under the clock.
     *
     * If the padding is ever done properly, this assertion is the thing to change, and changing it
     * is how you are reminded that the padding is the prerequisite.
     */
    expect(APPLE_WEB_APP.statusBarStyle).toBe('default')
  })

  it('names the app in the same twelve characters as the manifest', () => {
    expect(APPLE_WEB_APP.title).toBe(INSTALL.shortName)
  })
})

describe('the root layout', () => {
  const source = readFileSync(`${ROOT}app/layout.tsx`, 'utf8')

  it('wires the contract in rather than restating it', () => {
    // The contract being correct is worth nothing if the layout does not read it. These three are
    // what actually reach the <head>.
    expect(source).toMatch(/from '@\/lib\/pwa'/)
    expect(source).toMatch(/APPLE_WEB_APP/)
    expect(source).toMatch(/manifest:/)
  })

  it('still sets viewportFit, which every safe-area inset in the app depends on', () => {
    expect(source).toMatch(/viewportFit: 'cover'/)
  })

  it('emits the legacy apple capability meta as well as the standard one', () => {
    /*
     * Next 16 renders `appleWebApp.capable` as the standardised `mobile-web-app-capable` and does
     * NOT emit the older `apple-mobile-web-app-capable`. Safari has honoured the standard name
     * since iOS 16.4, so on a current phone the legacy tag is redundant — but standalone mode is
     * the whole point of this change, and one line of insurance costs less than discovering on an
     * un-updated device that Add to Home Screen still opens a browser tab.
     */
    expect(source).toMatch(/'apple-mobile-web-app-capable': 'yes'/)
  })
})
