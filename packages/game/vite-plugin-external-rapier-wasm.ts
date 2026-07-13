import type { Plugin } from 'vite';

const RAPIER_ENTRY_SUFFIX = '/@dimforge/rapier3d-deterministic-compat/rapier.mjs';
const WASM_URL_IMPORT =
  "import __slackpadRapierWasmUrl from './rapier_wasm3d_bg.wasm?url';\n";

// Rapier deterministic-compat 0.19.3 embeds its WASM as a 2.1 MB base64
// literal and passes the decoded ArrayBuffer through a now-deprecated init
// signature. The package also ships the exact same .wasm file beside the ESM
// entry. Replace only that generated init expression so Vite emits the pinned
// binary as an external, cacheable asset and calls the current object API.
const EMBEDDED_INIT =
  /yield ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.toByteArray\("([A-Za-z0-9+/=]+)"\)\.buffer\)/;

export function externalizeRapierWasmSource(code: string, id: string): string | null {
  const normalizedId = id.replaceAll('\\', '/').split('?')[0]!;
  if (!normalizedId.endsWith(RAPIER_ENTRY_SUFFIX)) return null;

  const match = EMBEDDED_INIT.exec(code);
  if (!match || match[3]!.length < 1_000_000) {
    throw new Error(
      '[external-rapier-wasm] pinned Rapier embed signature changed; refusing to emit a fallback bundle',
    );
  }

  const initFunction = match[1]!;
  const transformed = code.replace(
    EMBEDDED_INIT,
    `yield ${initFunction}({module_or_path:__slackpadRapierWasmUrl})`,
  );
  return WASM_URL_IMPORT + transformed;
}

export function externalRapierWasm(): Plugin {
  return {
    name: 'external-rapier-wasm',
    enforce: 'pre',
    transform(code, id) {
      return externalizeRapierWasmSource(code, id);
    },
  };
}
