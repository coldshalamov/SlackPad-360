import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
    ],
    // Deterministic goldens depend on stable execution; keep tests in one
    // process pool so Rapier WASM instances do not interleave across threads.
    pool: 'forks',
    testTimeout: 30000,
  },
});
