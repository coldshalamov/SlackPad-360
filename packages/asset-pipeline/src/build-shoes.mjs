// Shoes generator. Unbranded low-profile skate shoe, L/R mirrored. Built from
// lofted cross-sections: a rubber outsole, a foxing stripe band, a suede-look
// lofted upper with heel-counter bulge, a protruding toe cap with a defined
// ridge line, arched lace tubes that follow (and touch) the instep, and an
// ankle-collar torus seated on the opening. Length ~0.29 m (Z). Pivot at sole
// centre. Parts `Shoe_L`, `Shoe_R`. LOD0/1/2 exported as separate GLBs.
//
// M8a visual-review rework (defect #6): flatter/wider silhouette (height ≤
// 0.45 × width at midfoot), collar attached (previous build scaled positions
// AFTER translation, throwing the torus behind the heel), laces arched onto
// the upper instead of floating sticks, toe-cap line, heel counter.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshBuilder } from './geo/mesh.mjs';
import { loft } from './geo/loft.mjs';
import { shoeMaterials } from './materials.mjs';
import { buildDocument, writeGLB } from './export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const RAW_DIR = path.join(REPO, 'assets', 'generated', 'authored', 'raw');

export const SHOE = {
  length: 0.29, // Z
  width: 0.104, // X (peak, at the ball)
  soleTop: 0.016, // low-profile vulc-style sole slab
  toeZ: 0.145,
  heelZ: -0.145,
};

const LOD = [
  { n: 28, zs: 18, radial: 8, laces: 4, lacePath: 8, fine: true },
  { n: 14, zs: 9, radial: 6, laces: 3, lacePath: 5, fine: true },
  { n: 8, zs: 5, radial: 4, laces: 2, lacePath: 4, fine: false },
];

// Foot-outline half-width (X) along normalized length t (0 heel → 1 toe).
function halfWidthAt(t) {
  // wider, flatter skate-shoe plan: heel round, ball widest ~0.64, toe taper
  const ball = Math.exp(-Math.pow((t - 0.64) / 0.34, 2));
  const heelBulge = Math.exp(-Math.pow((t - 0.1) / 0.12, 2)); // heel counter
  const base = 0.034 + 0.018 * ball + 0.004 * heelBulge;
  const heelCap = t < 0.1 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.1 - t) / 0.1, 2))) : 1;
  const toeCap = t > 0.9 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.9) / 0.115, 2))) : 1;
  return base * heelCap * toeCap;
}

function upperHeightAt(t) {
  // Low profile: padded collar peak near the ankle (t~0.28), long flat toe.
  // Midfoot (t=0.5): 0.016 + 0.0295·exp(-1.21) ≈ 0.0247 → total ≈ 0.041 vs
  // width ≈ 0.101 → ratio ≈ 0.40 (review target ≤ 0.45).
  const ankle = Math.exp(-Math.pow((t - 0.28) / 0.2, 2));
  const heel = 0.6 * Math.exp(-Math.pow((t - 0.06) / 0.14, 2));
  return 0.014 + 0.0295 * Math.max(ankle, heel) + 0.006 * (1 - t);
}

function zAt(t) {
  return SHOE.heelZ + t * (SHOE.toeZ - SHOE.heelZ);
}

/** Closed superellipse ring in the X/Y plane at z. */
function ellipseRing(z, rx, ry, cy, n, exp = 2.6) {
  const ring = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / exp) * rx;
    const y = cy + Math.sign(sa) * Math.pow(Math.abs(sa), 2 / exp) * ry;
    ring.push([x, y, z]);
  }
  return ring;
}

/** D-shaped ring: flat bottom at y=baseY, rounded top of height ry. n points. */
function domeRing(z, rx, ry, baseY, n) {
  const ring = [];
  const topN = Math.floor(n * 0.68);
  const botN = n - topN;
  for (let k = 0; k < topN; k++) {
    const a = Math.PI * (k / (topN - 1)); // 0..π
    ring.push([Math.cos(a) * rx, baseY + Math.sin(a) * ry, z]);
  }
  for (let k = 1; k <= botN; k++) {
    const x = -rx + (2 * rx) * (k / (botN + 1));
    ring.push([x, baseY, z]);
  }
  return ring;
}

/** Upper surface height above baseY at (t, x) — matches domeRing's crown. */
function upperSurfaceY(t, x) {
  const rx = halfWidthAt(t) * 0.98;
  const ry = upperHeightAt(t);
  const c = Math.min(1, Math.abs(x) / rx);
  return SHOE.soleTop + ry * Math.sqrt(Math.max(0, 1 - c * c));
}

// ---- Part builders -------------------------------------------------------
function buildSole(L) {
  const rings = [];
  for (let i = 0; i <= L.zs; i++) {
    const t = i / L.zs;
    const rx = halfWidthAt(t) * 1.02;
    rings.push(ellipseRing(zAt(t), rx, SHOE.soleTop / 2, SHOE.soleTop / 2, L.n, 3.2));
  }
  return loft({ rings, capStart: true, capEnd: true, creaseDeg: 45 });
}

function buildFoxing(L) {
  // Thin protruding band around the sole/upper seam.
  const rings = [];
  for (let i = 0; i <= L.zs; i++) {
    const t = i / L.zs;
    const rx = halfWidthAt(t) * 1.045;
    rings.push(ellipseRing(zAt(t), rx, 0.0035, SHOE.soleTop - 0.001, L.n, 3.0));
  }
  return loft({ rings, capStart: true, capEnd: true, creaseDeg: 45 });
}

function buildUpper(L) {
  const rings = [];
  for (let i = 0; i <= L.zs; i++) {
    const t = i / L.zs;
    const rx = halfWidthAt(t) * 0.98;
    const ry = upperHeightAt(t);
    rings.push(domeRing(zAt(t), rx, ry, SHOE.soleTop, L.n));
  }
  return loft({ rings, capStart: true, capEnd: true, creaseDeg: 50 });
}

function buildToeCap(L) {
  // Rubber cap over the toe, offset outward so its rear edge draws a clear
  // cap line across the vamp (review: "defined toe-cap line").
  const rings = [];
  const t0 = 0.74;
  const steps = Math.max(3, Math.floor(L.zs * 0.4));
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (0.995 - t0) * (i / steps);
    const rx = halfWidthAt(t) * 0.98 * 1.045;
    const ry = upperHeightAt(t) * 1.06;
    rings.push(domeRing(zAt(t), rx, ry, SHOE.soleTop, L.n));
  }
  return loft({ rings, capStart: true, capEnd: true, creaseDeg: 50 });
}

/** Sweep a circular tube along a 3D polyline (round profile, open ends). */
function tubeAlongPath(points, radius, radial) {
  const rings = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    let tz = next[2] - prev[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // frame: pick a reference not parallel to tangent
    const ref = Math.abs(ty) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    let ux = ty * ref[2] - tz * ref[1];
    let uy = tz * ref[0] - tx * ref[2];
    let uz = tx * ref[1] - ty * ref[0];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ty * uz - tz * uy;
    const vy = tz * ux - tx * uz;
    const vz = tx * uy - ty * ux;
    const ring = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const ca = Math.cos(a) * radius;
      const sa = Math.sin(a) * radius;
      ring.push([p[0] + ux * ca + vx * sa, p[1] + uy * ca + vy * sa, p[2] + uz * ca + vz * sa]);
    }
    rings.push(ring);
  }
  return loft({ rings, capStart: true, capEnd: true, creaseDeg: 60 });
}

function buildLaces(L) {
  const mb = new MeshBuilder();
  const r = 0.0032;
  for (let k = 0; k < L.laces; k++) {
    const t = 0.3 + k * 0.09;
    const z = zAt(t);
    const x0 = halfWidthAt(t) * 0.98 * 0.66;
    const pts = [];
    for (let s = 0; s <= L.lacePath; s++) {
      const x = -x0 + (2 * x0) * (s / L.lacePath);
      // ride the instep surface, lifted by ~the tube radius so it touches
      pts.push([x, upperSurfaceY(t, x) + r * 0.8, z]);
    }
    mb.merge(tubeAlongPath(pts, r, Math.max(5, L.radial)));
  }
  return mb;
}

function buildCollar(L) {
  // Padded ankle-collar torus seated ON the opening: elliptical path in the
  // X/Z plane around the ankle hole, tube swept along it. (Fixes the review
  // defect where the collar floated behind the shoe — the old build scaled
  // vertex positions after translation.)
  const tC = 0.17;
  const z = zAt(tC);
  const rx = halfWidthAt(tC) * 0.58;
  const rz = 0.043;
  const tube = 0.0062;
  const y = upperSurfaceY(tC, rx * 0.55) - 0.001;
  const pathN = Math.max(12, L.n / 2);
  const pts = [];
  for (let k = 0; k <= pathN; k++) {
    const a = (k / pathN) * Math.PI * 2;
    pts.push([Math.cos(a) * rx, y, z + Math.sin(a) * rz]);
  }
  return tubeAlongPath(pts, tube, Math.max(6, L.radial));
}

/** Mirror a builder across X in place (negate x of pos+normal, flip winding). */
function mirrorX(mb) {
  for (let i = 0; i < mb.positions.length; i += 3) {
    mb.positions[i] = -mb.positions[i];
    mb.normals[i] = -mb.normals[i];
  }
  for (let t = 0; t < mb.indices.length; t += 3) {
    const tmp = mb.indices[t + 1];
    mb.indices[t + 1] = mb.indices[t + 2];
    mb.indices[t + 2] = tmp;
  }
  return mb;
}

/** All primitives for one shoe (right-hand by default). */
export function shoePrimitives(lodIndex) {
  const L = LOD[lodIndex];
  const prims = [
    { builder: buildSole(L), material: 'sole' },
    { builder: buildUpper(L), material: 'upper' },
    { builder: buildLaces(L), material: 'laces' },
  ];
  if (L.fine) {
    prims.push({ builder: buildFoxing(L), material: 'foxing' });
    prims.push({ builder: buildToeCap(L), material: 'toe' });
    prims.push({ builder: buildCollar(L), material: 'collar' });
  }
  return prims;
}

function cloneMirror(primitives) {
  return primitives.map((p) => {
    const mb = new MeshBuilder();
    mb.positions = p.builder.positions.slice();
    mb.normals = p.builder.normals.slice();
    mb.uvs = p.builder.uvs.slice();
    mb.indices = p.builder.indices.slice();
    mirrorX(mb);
    return { builder: mb, material: p.material };
  });
}

export function shoeNodeSpecs(lodIndex) {
  const right = shoePrimitives(lodIndex);
  const left = cloneMirror(right);
  const spread = 0.075; // separate the pair in X
  return [
    { name: 'Shoe_R', translation: [spread, 0, 0], primitives: right },
    { name: 'Shoe_L', translation: [-spread, 0, 0], primitives: left },
  ];
}

export async function buildShoes({ textures } = {}) {
  const outputs = [];
  for (let lod = 0; lod < 3; lod++) {
    const doc = buildDocument({
      materials: shoeMaterials(textures, lod),
      nodes: shoeNodeSpecs(lod),
      sceneName: `shoes-lod${lod}`,
    });
    const raw = path.join(RAW_DIR, `shoes.lod${lod}.glb`);
    await writeGLB(doc, raw);
    outputs.push({ lod, raw });
  }
  return outputs;
}
