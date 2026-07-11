// Full pipeline orchestrator: prep textures → build raw GLBs → optimize to
// staged → write manifest.json (sha256, tri counts per LOD, texture sizes,
// verified part names) → update catalog → validate. Deterministic; leaves
// assets/runtime/ untouched (promotion is a later, human-reviewed step).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prepTextures } from './prep-textures.mjs';
import { buildBoard } from './build-board.mjs';
import { buildShoes } from './build-shoes.mjs';
import { buildPlaza } from './build-plaza-modules.mjs';
import { optimizeGLB, toktxAvailable } from './optimize.mjs';
import { makeIO } from './export.mjs';
import { validateAll } from './validate.mjs';
import { updateCatalog } from './catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const STAGED = path.join(REPO, 'assets', 'generated', 'authored', 'staged');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');

async function inspectStaged(io, file, lod) {
  const bytes = fs.readFileSync(file);
  const doc = await io.read(file);
  const root = doc.getRoot();
  let tris = 0;
  const nodeTris = {};
  for (const n of root.listNodes()) {
    let t = 0;
    const walk = (node) => {
      const ex = node.getExtras();
      if (ex && ex.collider) return; // visual count excludes colliders
      const m = node.getMesh();
      if (m) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3;
      for (const c of node.listChildren()) walk(c);
    };
    walk(n);
    if (t > 0 && n.getName()) nodeTris[n.getName()] = t;
  }
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  const parts = root.listNodes().map((n) => n.getName()).filter(Boolean);
  const textures = root.listTextures().map((t) => {
    let size = null;
    try { size = t.getSize(); } catch { /* header unreadable */ }
    return { name: t.getName(), bytes: t.getImage()?.byteLength ?? 0, size };
  });
  return {
    file: path.basename(file),
    path: file,
    lod,
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
    tris,
    nodeTris,
    parts,
    textureCount: textures.length,
    textures,
  };
}

export async function buildAssets({ log = console.log } = {}) {
  log('[1/6] Preparing textures…');
  const textures = await prepTextures();

  log('[2/6] Building raw GLBs…');
  const raw = {
    'authored-hero-board': await buildBoard({ textures }),
    'authored-shoes': await buildShoes({ textures }),
    'authored-plaza-modules': await buildPlaza({ textures }),
  };

  log('[3/6] Optimizing → staged…');
  const io = await makeIO();
  const ktx2 = toktxAvailable() ? 'attempted' : 'deferred (no toktx on PATH)';
  const manifest = {
    generator: 'SlackPad360-asset-pipeline',
    note: 'Staged authored assets. NOT runtime-promoted. Awaiting shot-rubric review.',
    meshopt: 'EXT_meshopt_compression (level medium)',
    ktx2,
    assets: [],
  };
  const nameFor = { 'authored-hero-board': 'hero-board', 'authored-shoes': 'shoes', 'authored-plaza-modules': 'plaza-modules' };
  for (const [id, outs] of Object.entries(raw)) {
    const files = [];
    for (const { lod, raw: rawPath } of outs) {
      const staged = outs.length > 1
        ? path.join(STAGED, `${nameFor[id]}.lod${lod}.glb`)
        : path.join(STAGED, `${nameFor[id]}.glb`);
      const res = await optimizeGLB(rawPath, staged);
      if (res.ktx2 === 'applied') manifest.ktx2 = 'applied';
      files.push(await inspectStaged(io, staged, lod));
    }
    manifest.assets.push({ id, files });
  }

  log('[4/6] Writing manifest…');
  fs.mkdirSync(STAGED, { recursive: true });
  fs.writeFileSync(path.join(STAGED, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  log('[5/6] Updating catalog…');
  const ids = updateCatalog(manifest);
  log(`  appended: ${ids.join(', ')}`);

  log('[6/6] Validating staged set…');
  const { ok, results } = await validateAll(STAGED);
  for (const r of results) {
    const fails = r.checks.filter((c) => !c.pass);
    if (fails.length) {
      log(`  ${r.file}: FAIL`);
      for (const c of fails) log(`    - ${c.name}: ${c.detail}`);
    } else {
      log(`  ${r.file}: PASS (${r.checks.length} checks)`);
    }
  }
  // Assert runtime stays empty.
  const runtime = path.join(REPO, 'assets', 'runtime');
  const runtimeFiles = fs.existsSync(runtime)
    ? fs.readdirSync(runtime).filter((f) => f !== '.gitkeep')
    : [];
  if (runtimeFiles.length) throw new Error(`assets/runtime/ must stay EMPTY, found: ${runtimeFiles.join(', ')}`);

  if (!ok) throw new Error('Validation FAILED — see checks above.');
  log('\nDONE — staged + validated. Runtime left empty (promotion pending review).');
  return { manifest, ok };
}

if (process.argv[1] && process.argv[1].endsWith('build-assets.mjs')) {
  buildAssets().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
