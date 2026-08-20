// Stub for the 'server-only' poison pill inside Vitest. Production still resolves the real
// package via Next's bundler and still enforces the client/server boundary — this alias
// only affects the test runner. See vitest.config.ts's resolve.alias comment.
export {}
