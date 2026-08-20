import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Every route in this app runs on the Node.js runtime — see docs/plans/F01-foundation.md §6.
  reactStrictMode: true,

  // Vercel Blob public URLs. Roadmap D9/§4.3: run_photos.blob_url and /s/[token] both serve
  // these to the browser. Declared here so all host allow-listing lives in one place.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
  },

  // No `eslint` key: `next build` no longer runs the linter in Next 16.
  // No `webpack` key: Turbopack is the default bundler.
}

export default nextConfig
