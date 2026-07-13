import { defineConfig } from 'vite';
import { shotSink } from './vite-plugin-shot-sink';
import { devAssets } from './vite-plugin-dev-assets';
import { externalRapierWasm } from './vite-plugin-external-rapier-wasm';

export default defineConfig({
  base: './',
  plugins: [externalRapierWasm(), shotSink(), devAssets()],
  build: {
    target: 'es2022',
    // The eagerly needed game + Three renderer stays below a 1 MB minified JS
    // budget (and < 300 kB gzip). The pinned Rapier binary ships separately as
    // cacheable WASM instead of inflating JavaScript parse/compile work.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
