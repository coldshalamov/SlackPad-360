// Plaza modules generator. A modular kit (1 unit = 1 m, 0.5 m grid) authored
// into a single library GLB with each piece as a self-contained node subtree
// (visual mesh + named local collider children `<piece>_Col_N`, hidden and
// flagged). Pieces are laid out on a spacing grid for library/preview; runtime
// re-places a piece by setting its root node translation. Concrete / metal /
// wood materials from the vendor packs; worn-edge feel via roughness + bevels.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshBuilder } from './geo/mesh.mjs';
import { roundedBox } from './geo/box.mjs';
import { cylinderX } from './geo/lathe.mjs';
import { extrudeProfile } from './geo/sweep.mjs';
import { plazaMaterials } from './materials.mjs';
import { buildDocument, writeGLB } from './export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const RAW_DIR = path.join(REPO, 'assets', 'generated', 'authored', 'raw');

const colliderChild = (name, builder, translation = [0, 0, 0], rotation) => ({
  name,
  translation,
  ...(rotation ? { rotation } : {}),
  primitives: [{ builder, material: 'collider' }],
  extras: { collider: true, hidden: true },
});

// Rotate a Z-extruded profile so its sweep axis becomes X (quarter turn Y).
const QY = [0, 0.70710678, 0, 0.70710678];

function boxCollider(size) {
  return roundedBox({ size, radius: 0.001, bevelSegments: 1 });
}

// ---- Individual pieces (each returns a NodeSpec) -------------------------

function flat4x4(pos) {
  const slab = roundedBox({ size: [4, 0.1, 4], radius: 0.02, bevelSegments: 1 });
  slab.transform({ t: [0, -0.05, 0] });
  return {
    name: 'flat_4x4', translation: pos,
    primitives: [{ builder: slab, material: 'concrete' }],
    children: [colliderChild('flat_4x4_Col_0', boxCollider([4, 0.1, 4]), [0, -0.05, 0])],
  };
}

function ledge2m(pos) {
  const body = roundedBox({ size: [2, 0.5, 0.6], radius: 0.02, bevelSegments: 2 });
  body.transform({ t: [0, 0.25, 0] });
  const trim = new MeshBuilder();
  // metal edge trim along the two top long edges
  for (const dz of [0.29, -0.29]) {
    const bar = roundedBox({ size: [2, 0.03, 0.04], radius: 0.008, bevelSegments: 2 });
    bar.transform({ t: [0, 0.5, dz] });
    trim.merge(bar);
  }
  return {
    name: 'ledge_2m', translation: pos,
    primitives: [{ builder: body, material: 'concrete' }, { builder: trim, material: 'metalTrim' }],
    children: [colliderChild('ledge_2m_Col_0', boxCollider([2, 0.5, 0.6]), [0, 0.25, 0])],
  };
}

function railRound3m(pos) {
  const railH = 0.3;
  const rail = cylinderX({ x0: -1.5, x1: 1.5, r: 0.025, segments: 16, capRadius: 0.02 });
  rail.transform({ t: [0, railH, 0] });
  const posts = new MeshBuilder();
  for (const sx of [1.35, -1.35]) {
    const post = cylinderX({ x0: 0, x1: railH, r: 0.02, segments: 12 });
    post.transform({ q: [0, 0, 0.70710678, 0.70710678], t: [sx, 0, 0] }); // stand up
    posts.merge(post);
  }
  const railCol = boxCollider([3, 0.05, 0.05]);
  return {
    name: 'rail_round_3m', translation: pos,
    primitives: [{ builder: rail, material: 'metalTrim' }, { builder: posts, material: 'metalTrim' }],
    children: [colliderChild('rail_round_3m_Col_0', railCol, [0, railH, 0])],
  };
}

function stairs(name, pos, nSteps) {
  const riser = 0.17;
  const tread = 0.3;
  const width = 2;
  const depth = nSteps * tread;
  const H = nSteps * riser;
  const poly = [[0, 0]];
  let x = 0;
  let y = 0;
  for (let i = 0; i < nSteps; i++) {
    y += riser; poly.push([x, y]);
    x += tread; poly.push([x, y]);
  }
  poly.push([depth, 0]);
  const steps = extrudeProfile({ profile: poly, length: width });
  steps.transform({ q: QY }); // extrude axis Z→X (width along X)
  // ramp collider (wedge approximating the slope)
  const wedge = extrudeProfile({ profile: [[0, 0], [depth, 0], [depth, H]], length: width });
  wedge.transform({ q: QY });
  return {
    name, translation: pos,
    primitives: [{ builder: steps, material: 'concrete' }],
    children: [colliderChild(`${name}_Col_0`, wedge)],
  };
}

function bank2m(pos) {
  const len = 1.5;
  const angle = (30 * Math.PI) / 180;
  const H = len * Math.tan(angle);
  const width = 2;
  const tri = [[0, 0], [len, 0], [len, H]];
  const wedge = extrudeProfile({ profile: tri, length: width });
  wedge.transform({ q: QY });
  const col = extrudeProfile({ profile: tri, length: width });
  col.transform({ q: QY });
  return {
    name: 'bank_2m', translation: pos,
    primitives: [{ builder: wedge, material: 'concrete' }],
    children: [colliderChild('bank_2m_Col_0', col)],
  };
}

function qpCorner2m(pos) {
  const R = 0.6;
  const width = 2;
  const arcN = 14;
  const poly = [];
  for (let i = 0; i <= arcN; i++) {
    const phi = (i / arcN) * (Math.PI / 2);
    poly.push([R * Math.sin(phi), R - R * Math.cos(phi)]);
  }
  poly.push([R, 0]); // down the back to ground, ground closes to (0,0)
  const qp = extrudeProfile({ profile: poly, length: width });
  qp.transform({ q: QY });
  // coping cylinder along X at the top lip
  const coping = cylinderX({ x0: -width / 2, x1: width / 2, r: 0.03, segments: 14 });
  coping.transform({ t: [0, R, R] });
  const col = extrudeProfile({ profile: [[0, 0], [R, 0], [R, R]], length: width });
  col.transform({ q: QY });
  return {
    name: 'qp_corner_2m', translation: pos,
    primitives: [{ builder: qp, material: 'concrete' }, { builder: coping, material: 'metalTrim' }],
    children: [colliderChild('qp_corner_2m_Col_0', col)],
  };
}

function curb1m(pos) {
  const body = roundedBox({ size: [1, 0.15, 0.3], radius: 0.015, bevelSegments: 2 });
  body.transform({ t: [0, 0.075, 0] });
  const trim = roundedBox({ size: [1, 0.02, 0.03], radius: 0.006, bevelSegments: 1 });
  trim.transform({ t: [0, 0.15, 0.135] });
  return {
    name: 'curb_1m', translation: pos,
    primitives: [{ builder: body, material: 'concrete' }, { builder: trim, material: 'metalTrim' }],
    children: [colliderChild('curb_1m_Col_0', boxCollider([1, 0.15, 0.3]), [0, 0.075, 0])],
  };
}

function planter1x2m(pos) {
  const wall = new MeshBuilder();
  const outer = roundedBox({ size: [1, 0.45, 2], radius: 0.02, bevelSegments: 2 });
  outer.transform({ t: [0, 0.225, 0] });
  wall.merge(outer);
  const soil = roundedBox({ size: [0.82, 0.06, 1.82], radius: 0.01, bevelSegments: 1 });
  soil.transform({ t: [0, 0.44, 0] });
  return {
    name: 'planter_1x2m', translation: pos,
    primitives: [{ builder: wall, material: 'concrete' }, { builder: soil, material: 'soil' }],
    children: [colliderChild('planter_1x2m_Col_0', boxCollider([1, 0.45, 2]), [0, 0.225, 0])],
  };
}

export function plazaNodeSpecs() {
  // Lay pieces on a coarse spacing grid so the library GLB is inspectable.
  const g = 3.5;
  return [
    flat4x4([0, 0, 0]),
    ledge2m([g * 2, 0, 0]),
    railRound3m([g * 3.2, 0, 0]),
    stairs('stairs_3set', [0, 0, g * 1.6], 3),
    stairs('stairs_5set', [g * 1.6, 0, g * 1.6], 5),
    bank2m([g * 2.9, 0, g * 1.6]),
    qpCorner2m([0, 0, g * 3]),
    curb1m([g * 1.6, 0, g * 3]),
    planter1x2m([g * 2.6, 0, g * 3]),
  ];
}

export async function buildPlaza({ textures } = {}) {
  const doc = buildDocument({
    materials: plazaMaterials(textures),
    nodes: plazaNodeSpecs(),
    sceneName: 'plaza-modules',
  });
  const raw = path.join(RAW_DIR, 'plaza-modules.glb');
  await writeGLB(doc, raw);
  return [{ lod: 0, raw }];
}
