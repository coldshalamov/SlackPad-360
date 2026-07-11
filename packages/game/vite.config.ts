import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Rapier deterministic-compat inlines WASM as base64; chunk is large by design.
    chunkSizeWarningLimit: 3000,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
