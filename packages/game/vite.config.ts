import { defineConfig } from 'vite';
import { shotSink } from './vite-plugin-shot-sink';

export default defineConfig({
  base: './',
  plugins: [shotSink()],
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
