// Validation. Loads each staged GLB back via gltf-transform (meshopt decoder
// registered) and asserts the brief's acceptance criteria: required named
// parts, AABB dimensions within tolerance, per-LOD tri budgets, materials have
// baseColor + roughness, no brand strings in any name, UVs present on visual
// meshes, colliders hidden + flagged.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBounds } from '@gltf-transform/core';
import { makeIO } from './export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const STAGED = path.join(REPO, 'assets', 'generated', 'authored', 'staged');

// Substrings that would indicate a real-world skate/apparel brand or logo text.
const BRAND_BLOCKLIST = [
  'nike', 'adidas', 'vans', 'thrasher', 'element', 'baker', 'santacruz', 'santa cruz',
  'powell', 'independent', 'venture', 'spitfire', 'bones', 'plan b', 'girl', 'chocolate',
  'primitive', 'palace', 'supreme', 'dc shoes', 'etnies', 'emerica', 'es footwear',
  'converse', 'newbalance', 'new balance', 'puma', 'reebok', 'flip', 'zero', 'toy machine',
  'anti hero', 'antihero', 'real skate', 'krooked', 'birdhouse', 'almost', 'enjoi',
];

const DIM_TOL = 0.02; // ±2%

function within(actual, target, tol = DIM_TOL) {
  return Math.abs(actual - target) / target <= tol;
}

function boundsSize(node) {
  const b = getBounds(node);
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}
function boundsCenter(node) {
  const b = getBounds(node);
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

/** Visual tri count: node's own mesh + descendants, skipping collider subtrees. */
function nodeTris(node) {
  const ex = node.getExtras();
  if (ex && ex.collider) return 0;
  let t = 0;
  const m = node.getMesh();
  if (m) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3;
  for (const c of node.listChildren()) t += nodeTris(c);
  return t;
}

function findNode(root, name) {
  return root.listNodes().find((n) => n.getName() === name) || null;
}

/**
 * @param {string} file staged glb path
 * @returns {Promise<{file:string, checks:{name:string,pass:boolean,detail:string}[]}>}
 */
export async function validateFile(file, spec) {
  const io = await makeIO();
  const doc = await io.read(file);
  const root = doc.getRoot();
  const checks = [];
  const ok = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail });

  const nodes = root.listNodes();
  const nodeNames = nodes.map((n) => n.getName());
  const meshNames = root.listMeshes().map((m) => m.getName());
  const materials = root.listMaterials();
  const allNames = [
    ...nodeNames, ...meshNames,
    ...materials.map((m) => m.getName()),
    ...root.listTextures().map((t) => t.getName()),
  ];

  // Required named parts.
  for (const req of spec.requiredNodes) {
    ok(`node:${req}`, nodeNames.includes(req) || meshNames.includes(req), 'present');
  }

  // No brand strings anywhere in names.
  const brandHit = allNames.find((n) => {
    const low = (n || '').toLowerCase();
    return BRAND_BLOCKLIST.some((b) => low.includes(b));
  });
  ok('no-brand-strings', !brandHit, brandHit ? `found "${brandHit}"` : 'clean');

  // Materials have baseColor + roughness set (factor is enough).
  let matOk = materials.length > 0;
  for (const m of materials) {
    const bc = m.getBaseColorFactor();
    const rf = m.getRoughnessFactor();
    if (!bc || rf == null || Number.isNaN(rf)) matOk = false;
  }
  ok('materials-baseColor+roughness', matOk, `${materials.length} materials`);

  // UVs present on visual (non-collider) meshes.
  let uvOk = true;
  for (const n of nodes) {
    const ex = n.getExtras();
    if (ex && ex.collider) continue;
    const m = n.getMesh();
    if (!m) continue;
    for (const p of m.listPrimitives()) {
      if (!p.getAttribute('TEXCOORD_0')) uvOk = false;
    }
  }
  ok('uvs-present', uvOk, 'visual meshes have TEXCOORD_0');

  // Colliders flagged + hidden.
  const colliders = nodes.filter((n) => n.getName().includes('COL_') || n.getName().includes('_Col_'));
  let colOk = true;
  for (const c of colliders) {
    const ex = c.getExtras() || {};
    if (ex.collider !== true || ex.hidden !== true) colOk = false;
  }
  ok('colliders-flagged-hidden', colOk && (spec.colliders === false || colliders.length > 0), `${colliders.length} colliders`);

  // Tri budgets per named node.
  if (spec.triBudget) {
    for (const [name, ceiling] of Object.entries(spec.triBudget)) {
      const node = findNode(root, name);
      if (!node) { ok(`tris:${name}`, false, 'node missing'); continue; }
      const t = nodeTris(node);
      ok(`tris:${name}<=${ceiling}`, t <= ceiling, `${t} tris`);
    }
  }

  // Dimension checks.
  if (spec.dims) spec.dims(root, ok, { findNode, boundsSize, boundsCenter, within });

  return { file: path.basename(file), checks };
}

// --- Spec tables ----------------------------------------------------------
const BOARD_REQUIRED = [
  'Deck', 'GripTape', 'Truck_F', 'Truck_R', 'Axle_F', 'Axle_R',
  'Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR',
  'Socket_NoseFoot', 'Socket_TailFoot',
];

function boardDims(root, ok, h) {
  const deck = h.findNode(root, 'Deck');
  if (deck) {
    const s = h.boundsSize(deck);
    ok('dim:deck-length(Z)~0.8', h.within(s[2], 0.8), s[2].toFixed(4));
    ok('dim:deck-width(X)~0.2', h.within(s[0], 0.2), s[0].toFixed(4));
  }
  const fr = h.findNode(root, 'Wheel_FR');
  const rr = h.findNode(root, 'Wheel_RR');
  if (fr && rr) {
    const wb = Math.abs(h.boundsCenter(fr)[2] - h.boundsCenter(rr)[2]);
    ok('dim:wheelbase~0.43', h.within(wb, 0.43), wb.toFixed(4));
    const d = h.boundsSize(fr)[1];
    ok('dim:wheel-diameter 0.054-0.060', d >= 0.054 && d <= 0.06, d.toFixed(4));
  }
}

const boardSpec = (lod) => ({
  requiredNodes: lod === 0 ? [...BOARD_REQUIRED, 'COL_Deck', 'COL_Truck_F', 'COL_Truck_R'] : BOARD_REQUIRED,
  colliders: lod === 0,
  triBudget:
    lod === 0
      ? { Deck: 8000, Wheel_FR: 1300, Truck_F: 3200 }
      : lod === 1
        ? { Deck: 2600, Wheel_FR: 520, Truck_F: 1200 }
        : { Deck: 1000, Wheel_FR: 320, Truck_F: 720 },
  dims: boardDims,
});

const shoeSpec = (lod) => ({
  requiredNodes: ['Shoe_L', 'Shoe_R'],
  colliders: false,
  triBudget:
    lod === 0 ? { Shoe_R: 6000 } : lod === 1 ? { Shoe_R: 1600 } : { Shoe_R: 360 },
  dims: (root, ok, h) => {
    const shoe = h.findNode(root, 'Shoe_R');
    if (shoe) {
      const s = h.boundsSize(shoe);
      ok('dim:shoe-length(Z)~0.29', h.within(s[2], 0.29, 0.05), s[2].toFixed(4));
    }
  },
});

const PLAZA_PIECES = ['flat_4x4', 'ledge_2m', 'rail_round_3m', 'stairs_3set', 'stairs_5set', 'bank_2m', 'qp_corner_2m', 'curb_1m', 'planter_1x2m'];
const plazaSpec = () => ({
  requiredNodes: PLAZA_PIECES,
  colliders: true,
  triBudget: {
    flat_4x4: 100, ledge_2m: 3000, rail_round_3m: 3000, stairs_3set: 3000,
    stairs_5set: 3000, bank_2m: 3000, qp_corner_2m: 3000, curb_1m: 3000, planter_1x2m: 3000,
  },
});

/** Validate the full staged set. Returns { ok, results }. */
export async function validateAll(stagedDir = STAGED) {
  const targets = [
    { file: 'hero-board.lod0.glb', spec: boardSpec(0) },
    { file: 'hero-board.lod1.glb', spec: boardSpec(1) },
    { file: 'hero-board.lod2.glb', spec: boardSpec(2) },
    { file: 'shoes.lod0.glb', spec: shoeSpec(0) },
    { file: 'shoes.lod1.glb', spec: shoeSpec(1) },
    { file: 'shoes.lod2.glb', spec: shoeSpec(2) },
    { file: 'plaza-modules.glb', spec: plazaSpec() },
  ];
  const results = [];
  for (const t of targets) {
    const res = await validateFile(path.join(stagedDir, t.file), t.spec);
    results.push(res);
  }
  const ok = results.every((r) => r.checks.every((c) => c.pass));
  return { ok, results };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('validate.mjs')) {
  validateAll().then(({ ok, results }) => {
    for (const r of results) {
      const fails = r.checks.filter((c) => !c.pass);
      console.log(`\n${r.file}: ${fails.length === 0 ? 'PASS' : 'FAIL'} (${r.checks.length} checks)`);
      for (const c of r.checks) if (!c.pass) console.log(`  FAIL ${c.name} — ${c.detail}`);
    }
    console.log(`\nOVERALL: ${ok ? 'PASS' : 'FAIL'}`);
    process.exit(ok ? 0 : 1);
  });
}
