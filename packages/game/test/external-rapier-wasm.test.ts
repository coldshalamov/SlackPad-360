import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { externalizeRapierWasmSource } from '../vite-plugin-external-rapier-wasm';

const require = createRequire(import.meta.url);

describe('external Rapier WASM build transform', () => {
  it('extracts the pinned compat payload without changing the physics package', () => {
    const entry = join(
      dirname(require.resolve('@dimforge/rapier3d-deterministic-compat')),
      'rapier.mjs',
    );
    const source = readFileSync(entry, 'utf8');
    const transformed = externalizeRapierWasmSource(source, entry);

    expect(transformed).not.toBeNull();
    expect(transformed).toContain("'./rapier_wasm3d_bg.wasm?url'");
    expect(transformed).toContain('({module_or_path:__slackpadRapierWasmUrl})');
    expect(transformed!.length).toBeLessThan(source.length - 1_000_000);
    expect(transformed).not.toContain('.toByteArray("AGFzbQE');
  });

  it('ignores every non-Rapier module', () => {
    expect(externalizeRapierWasmSource('export const x = 1;', '/src/main.ts')).toBeNull();
  });
});
