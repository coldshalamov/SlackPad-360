// Shoes generator. Unbranded low-profile skate shoe, L/R mirrored. Built from
// lofted cross-sections: a rubber outsole, a foxing stripe band, a suede-look
// lofted upper, a toe cap, a simple lace bridge (tubes) and an ankle collar.
// Length ~0.29 m (Z), scaled to read next to the 0.8 m deck. Pivot at sole
// centre. Parts `Shoe_L`, `Shoe_R`. LOD0/1/2 exported as separate GLBs.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshBuilder } from './geo/mesh.mjs';
import { lathe, cylinderX } from './geo/lathe.mjs';
import { loft } from './geo/loft.mjs';
import { shoeMaterials } from './materials.mjs';
import { buildDocument, writeGLB } from './export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const RAW_DIR = path.join(REPO, 'assets', 'generated', 'authored', 'raw');

export const SHOE = {
  length: 0.29, // Z
  width: 0.1, // X (peak)
  soleTop: 0.024, // sole slab top height
  soleBottom: 0.0,
  toeZ: 0.145,
  heelZ: -0.145,
};

const LOD = [
  { n: 28, zs: 18, radial: 10, laces: 4, fine: true },
  { n: 16, zs: 11, radial: 8, laces: 3, fine: true },
  { n: 8, zs: 5, radial: 5, laces: 2, fine: false },
];

// Foot-outline half-width (X) along normalized length t (0 heel → 1 toe).
function halfWidthAt(t) {
  // heel round, ball widest ~0.68, toe taper
  const ball = Math.exp(-Math.pow((t - 0.62) / 0.32, 2));
  const base = 0.03 + 0.022 * ball;
  const heelCap = t < 0.12 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.12 - t) / 0.12, 2))) : 1;
  const toeCap = t > 0.9 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.9) / 0.12, 2))) : 1;
  return base * heelCap * toeCap;
}

function upperHeightAt(t) {
  // instep high near t~0.35 (ankle), lower toward toe
  const ankle = Math.exp(-Math.pow((t - 0.32) / 0.26, 2));
  return 0.03 + 0.03 * ankle - (t > 0.7 ? (t - 0.7) * 0.06 : 0);
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
    const rx = halfWidthAt(t) * 1.04;
    rings.push(ellipseRing(zAt(t), rx, 0.004, SHOE.soleTop, L.n, 3.0));
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
  // Short dome over the front third, slightly larger to read as a rubber cap.
  const rings = [];
  const t0 = 0.78;
  const steps = Math.max(3, Math.floor(L.zs * 0.4));
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (0.99 - t0) * (i / steps);
    const rx = halfWidthAt(t) * 1.0;
    const ry = upperHeightAt(t) * 0.85;
    rings.push(domeRing(zAt(t), rx, ry, SHOE.soleTop, L.n));
  }
  return loft({ rings, capStart: false, capEnd: true, creaseDeg: 50 });
}

function buildLaces(L) {
  const mb = new MeshBuilder();
  // Lace tubes across the instep, spanning X over the top of the upper.
  for (let k = 0; k < L.laces; k++) {
    const t = 0.24 + k * 0.1;
    const z = zAt(t);
    const rx = halfWidthAt(t) * 0.7;
    const y = SHOE.soleTop + upperHeightAt(t) * 0.92;
    const tube = cylinderX({ x0: -rx, x1: rx, r: 0.004, segments: Math.max(6, L.radial) });
    // slight downward bow via scale not needed; place straight across
    tube.transform({ t: [0, y, z] });
    mb.merge(tube);
  }
  return mb;
}

function buildCollar(L) {
  // Raised ankle collar ring at the heel-top opening (torus-ish via lathe).
  const t = 0.14;
  const z = zAt(t);
  const rx = halfWidthAt(t) * 0.9;
  const ry = upperHeightAt(t);
  const ring = lathe({
    profile: [
      { x: -0.01, r: 0.006 }, { x: -0.01, r: 0.012 },
      { x: 0.01, r: 0.012 }, { x: 0.01, r: 0.006 },
    ],
    segments: Math.max(10, L.radial + 2),
    closed: true,
  });
  // orient the torus opening upward: the lathe spins about X; we want a ring in
  // the X/Z plane around the ankle hole → rotate 90° about Z then place.
  ring.transform({ q: [0, 0, 0.70710678, 0.70710678], t: [0, SHOE.soleTop + ry * 0.9, z] });
  // scale to an oval matching the collar footprint
  for (let i = 0; i < ring.positions.length; i += 3) {
    ring.positions[i] *= rx / 0.012;
    ring.positions[i + 2] *= 1.3;
  }
  return ring;
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
