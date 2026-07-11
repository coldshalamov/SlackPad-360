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

  // Winding consistency: triangle winding must agree with stored normals or
  // front faces get culled (M8a review defect — deck top/grip invisible from
  // above, wheels rendering their interiors as "translucent glass").
  {
    let inverted = 0;
    let total = 0;
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')?.getArray();
        const nrm = prim.getAttribute('NORMAL')?.getArray();
        const idxAcc = prim.getIndices();
        if (!pos || !nrm || !idxAcc) continue;
        const idx = idxAcc.getArray();
        for (let t = 0; t < idx.length; t += 3) {
          const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
          const ax = pos[a * 3];
          const ay = pos[a * 3 + 1];
          const az = pos[a * 3 + 2];
          const e1x = pos[b * 3] - ax;
          const e1y = pos[b * 3 + 1] - ay;
          const e1z = pos[b * 3 + 2] - az;
          const e2x = pos[c * 3] - ax;
          const e2y = pos[c * 3 + 1] - ay;
          const e2z = pos[c * 3 + 2] - az;
          const gx = e1y * e2z - e1z * e2y;
          const gy = e1z * e2x - e1x * e2z;
          const gz = e1x * e2y - e1y * e2x;
          const sx = nrm[a * 3] + nrm[b * 3] + nrm[c * 3];
          const sy = nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c * 3 + 1];
          const sz = nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[c * 3 + 2];
          total++;
          if (gx * sx + gy * sy + gz * sz < 0) inverted++;
        }
      }
    }
    ok('winding-matches-normals', inverted === 0, `${inverted}/${total} inverted`);
  }

  // Dimension checks.
  if (spec.dims) spec.dims(root, ok, { findNode, boundsSize, boundsCenter, within, getBounds });

  // Material look-target checks (async: decodes embedded MR textures).
  if (spec.materialTargets) await spec.materialTargets(root, ok);

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
    // Spike guard (review defect #5): deck top must not exceed base + kick
    // rise. A converging-tip fin previously poked ~0.012 above the kick.
    const { getBounds } = h;
    const b = getBounds(deck);
    ok('geom:no-tip-spike (deck maxY<=0.0635)', b.max[1] <= 0.0635, b.max[1].toFixed(4));
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

/**
 * Material look-targets from the M8a visual review (defects #1–#3, #7).
 * EFFECTIVE roughness = roughnessFactor × meanG(MR texture); likewise
 * metalness. Locks: grip near-black matte, wheels opaque warm, trucks
 * galvanized, deck-bottom graphic present.
 */
async function boardMaterialTargets(root, ok, textured) {
  const matByName = Object.fromEntries(root.listMaterials().map((m) => [m.getName(), m]));

  const meanChannel = async (tex, ch) => {
    if (!tex) return null;
    const { default: sharp } = await import('sharp');
    const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    const n = info.width * info.height;
    for (let i = 0; i < n; i++) sum += data[i * info.channels + ch];
    return sum / n / 255;
  };
  const effRough = async (m) =>
    m.getRoughnessFactor() * ((await meanChannel(m.getMetallicRoughnessTexture(), 1)) ?? 1);
  const effMetal = async (m) =>
    m.getMetallicFactor() * ((await meanChannel(m.getMetallicRoughnessTexture(), 2)) ?? 1);

  const grip = matByName.grip;
  if (grip) {
    const r = await effRough(grip);
    const mtl = await effMetal(grip);
    ok('mat:grip-matte (effRough>=0.9)', r >= 0.9, r.toFixed(3));
    ok('mat:grip-nonmetal', mtl <= 0.05, mtl.toFixed(3));
  } else ok('mat:grip-matte (effRough>=0.9)', false, 'grip material missing');

  const ure = matByName.urethane;
  if (ure) {
    const bc = ure.getBaseColorFactor();
    const r = await effRough(ure);
    ok('mat:wheel-opaque', ure.getAlphaMode() === 'OPAQUE' && bc[3] === 1, `${ure.getAlphaMode()} a=${bc[3]}`);
    ok('mat:wheel-soft-specular (0.3<=effRough<=0.65)', r >= 0.3 && r <= 0.65, r.toFixed(3));
    ok('mat:wheel-warm-offwhite (r>=g>=b)', bc[0] >= bc[1] && bc[1] >= bc[2] && bc[0] > 0.7, bc.slice(0, 3).map((v) => v.toFixed(2)).join(','));
  } else ok('mat:wheel-opaque', false, 'urethane material missing');

  const truck = matByName.truckMetal;
  if (truck) {
    const mtl = await effMetal(truck);
    const r = await effRough(truck);
    ok('mat:truck-metallic (effMetal>=0.8)', mtl >= 0.8, mtl.toFixed(3));
    ok('mat:truck-specular-streak (0.3<=effRough<=0.6)', r >= 0.3 && r <= 0.6, r.toFixed(3));
  } else ok('mat:truck-metallic (effMetal>=0.8)', false, 'truckMetal material missing');

  if (textured) {
    const graphic = matByName.deckGraphic;
    if (graphic) {
      const tex = graphic.getBaseColorTexture();
      const size = tex ? tex.getSize() : null;
      ok('mat:deck-bottom-graphic-present (1024x256)', !!size && size[0] === 1024 && size[1] === 256, size ? size.join('x') : 'no texture');
      const bc = graphic.getBaseColorFactor();
      ok('mat:deck-graphic-not-double-darkened', bc[0] >= 0.9 && bc[1] >= 0.9 && bc[2] >= 0.9, bc.slice(0, 3).map((v) => v.toFixed(2)).join(','));
    } else ok('mat:deck-bottom-graphic-present (1024x256)', false, 'deckGraphic material missing');
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
  materialTargets: (root, ok) => boardMaterialTargets(root, ok, lod === 0),
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
      // Review defect #6c: low-profile skate shoe, not a bread loaf. Overall
      // AABB height stays under 0.07 (collar peak) and width reads wide.
      ok('dim:shoe-low-profile (height<=0.07)', s[1] <= 0.07, s[1].toFixed(4));
      ok('dim:shoe-width 0.095-0.115', s[0] >= 0.095 && s[0] <= 0.115, s[0].toFixed(4));
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
