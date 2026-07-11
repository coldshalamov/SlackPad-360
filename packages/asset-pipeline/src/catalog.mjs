// Catalog updater. Appends the three authored-asset entries to
// assets/catalog/assets.json, matching the existing entry schema (reviewStatus,
// license, runtimeIntent, sha256, path, …). Existing entries and
// catalogVersion are never modified. Idempotent: re-running replaces only the
// authored-* entries this pipeline owns.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const CATALOG = path.join(REPO, 'assets', 'catalog', 'assets.json');

const OWNED_IDS = ['authored-hero-board', 'authored-shoes', 'authored-plaza-modules'];

const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');

function entryFor(id, description, assetManifest) {
  const primary = assetManifest.files[0];
  return {
    id,
    description,
    sourceUrl: null,
    exactAssetPage: null,
    author: 'SlackPad procedural authoring pipeline (M8a)',
    license: 'original-work (repo)',
    spdx: null,
    provenance: 'procedural-authored',
    retrievalDate: '2026-07-11',
    originalFilename: null,
    checksum: `sha256:${primary.sha256}`,
    sha256: primary.sha256,
    files: assetManifest.files.map((f) => ({ file: rel(f.path), sha256: f.sha256, bytes: f.bytes, lod: f.lod })),
    allowedUses: ['project-owned'],
    attributionRequirement: 'n/a',
    modificationStatus: 'created',
    runtimeIntent: 'none',
    reviewStatus: 'staged-pending-review',
    path: rel(primary.path),
    localPath: rel(primary.path),
    licenseSidecar: null,
    sourceSidecar: null,
    previewPath: null,
    rejectionReason: null,
    notes:
      'Procedurally authored via packages/asset-pipeline (IMPL-004: Blender unavailable). '
      + 'Staged under assets/generated/authored/staged/; NOT promoted to assets/runtime/. '
      + 'Awaiting shot-rubric visual review before promotion.',
  };
}

export function updateCatalog(manifest) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  // Drop any prior authored-* entries this pipeline owns (idempotent re-run).
  catalog.assets = catalog.assets.filter((a) => !OWNED_IDS.includes(a.id));

  const byId = Object.fromEntries(manifest.assets.map((a) => [a.id, a]));
  const descriptions = {
    'authored-hero-board': 'Procedurally authored hero skateboard (deck, grip, trucks, wheels, sockets, colliders) — LOD0/1/2 GLBs, staged pending review',
    'authored-shoes': 'Procedurally authored unbranded skate shoes (L/R) — LOD0/1/2 GLBs, staged pending review',
    'authored-plaza-modules': 'Procedurally authored modular plaza kit (flat, ledge, rail, stairs, bank, quarter-pipe, curb, planter) with named colliders — staged pending review',
  };
  for (const id of OWNED_IDS) {
    if (byId[id]) catalog.assets.push(entryFor(id, descriptions[id], byId[id]));
  }
  fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');
  return OWNED_IDS;
}
