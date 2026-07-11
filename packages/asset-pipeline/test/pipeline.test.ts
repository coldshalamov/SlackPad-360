import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssets } from '../src/build-assets.mjs';
import { validateAll } from '../src/validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const STAGED = path.join(REPO, 'assets', 'generated', 'authored', 'staged');

/**
 * The full build→validate cycle takes ~25 s and REWRITES assets/generated/ and
 * assets/catalog/assets.json (idempotent, but it dirties the tree and races
 * concurrent writers). It runs only when explicitly requested:
 *   RUN_ASSET_PIPELINE=1 npx vitest run packages/asset-pipeline
 * or via `npm run validate-assets -w @slackpad/asset-pipeline`. The default
 * unit run keeps the geometry-toolkit tests (geo.test.ts) only.
 */
const RUN_FULL = process.env.RUN_ASSET_PIPELINE === '1';

let result: { manifest: any; ok: boolean };

// Full build → validate cycle. Generous hook timeout (default is 30 s; the
// textured build + meshopt runs ~25 s).
beforeAll(async () => {
  if (!RUN_FULL) return;
  result = await buildAssets({ log: () => {} });
}, 120000);

describe.skipIf(!RUN_FULL)('asset pipeline: full build → validate', () => {
  it('build completes and self-validation passes', () => {
    expect(result.ok).toBe(true);
  });

  it('validateAll passes every check on the staged set', async () => {
    const { ok, results } = await validateAll(STAGED);
    const fails = results.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => `${r.file}:${c.name}`));
    expect(fails).toEqual([]);
    expect(ok).toBe(true);
  }, 60000);

  it('stages the expected 7 GLBs + manifest', () => {
    const files = fs.readdirSync(STAGED);
    for (const f of [
      'hero-board.lod0.glb', 'hero-board.lod1.glb', 'hero-board.lod2.glb',
      'shoes.lod0.glb', 'shoes.lod1.glb', 'shoes.lod2.glb',
      'plaza-modules.glb', 'manifest.json',
    ]) expect(files).toContain(f);
  });

  it('manifest records sha256 + tri counts for every asset', () => {
    expect(result.manifest.assets).toHaveLength(3);
    for (const a of result.manifest.assets) {
      for (const file of a.files) {
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(file.tris).toBeGreaterThan(0);
      }
    }
  });

  it('leaves assets/runtime/ empty (promotion is post-review)', () => {
    const runtime = path.join(REPO, 'assets', 'runtime');
    const files = fs.readdirSync(runtime).filter((f) => f !== '.gitkeep');
    expect(files).toEqual([]);
  });

  it('appends authored-* catalog entries without dropping existing ones', () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(REPO, 'assets', 'catalog', 'assets.json'), 'utf8'));
    const ids = catalog.assets.map((a: any) => a.id);
    for (const id of ['authored-hero-board', 'authored-shoes', 'authored-plaza-modules']) {
      expect(ids).toContain(id);
    }
    // original source + gap entries still present
    for (const id of ['ph-kloppenheim-05-puresky', 'acg-metal-006', 'gap-hero-board']) {
      expect(ids).toContain(id);
    }
    const authored = catalog.assets.find((a: any) => a.id === 'authored-hero-board');
    expect(authored.reviewStatus).toBe('staged-pending-review');
    expect(authored.runtimeIntent).toBe('none');
  });

  it('no brand strings and colliders flagged+hidden across staged set', async () => {
    const { results } = await validateAll(STAGED);
    for (const r of results) {
      const brand = r.checks.find((c) => c.name === 'no-brand-strings');
      expect(brand?.pass, `${r.file} brand`).toBe(true);
      const col = r.checks.find((c) => c.name === 'colliders-flagged-hidden');
      if (col) expect(col.pass, `${r.file} colliders`).toBe(true);
    }
  }, 60000);
});
