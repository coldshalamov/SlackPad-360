// Hero board generator. Authors the deck (concave cross-section, nose/tail
// kicks, rounded popsicle outline, micro-bevelled rails), grip sheet, trucks
// (baseplate + angled kingpin + lofted hanger + axle), four lathe wheels with
// rounded urethane tread + hub bore, foot sockets (empty nodes), and hidden
// flagged collider boxes. Exports LOD0/1/2 as separate GLBs.
//
// Axes: +Z nose, +Y up, +X right (toe side). Origin at deck-center COM.
// Wheels are placed so they spin about local X.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshBuilder } from './geo/mesh.mjs';
import { roundedBox } from './geo/box.mjs';
import { lathe, cylinderX } from './geo/lathe.mjs';
import { gridSurface } from './geo/sweep.mjs';
import { loft } from './geo/loft.mjs';
import { clamp, vec3 } from './geo/math.mjs';
import { boardMaterials } from './materials.mjs';
import { buildDocument, writeGLB } from './export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const RAW_DIR = path.join(REPO, 'assets', 'generated', 'authored', 'raw');

// --- Brief dimensions (metres) -------------------------------------------
export const BOARD = {
  length: 0.8, // Z
  width: 0.2, // X
  thickness: 0.013,
  concaveRise: 0.012, // rail rise vs centre
  kickRise: 0.055,
  noseKickLen: 0.15, // nose slightly longer
  tailKickLen: 0.13,
  endRound: 0.1, // popsicle plan rounding (== width/2)
  railBevel: 0.0015,
  gripLift: 0.0006,
  gripWidthFrac: 0.93,
  wheelbase: 0.43, // axle-to-axle (Z)
  truckAxleWidth: 0.15, // wheel-centre span (X)
  wheelDiameter: 0.057, // mid brief window 0.054–0.060
  wheelWidth: 0.033,
  truckDropY: 0.03, // baseplate top just below deck bottom
  socketZ: 0.25,
};

// LOD segment tables. rows = along length, cols = across width.
const LOD = [
  { deckRows: 64, deckCols: 16, rimSeg: 3, gripRows: 54, gripCols: 12, radial: 28, arc: 4 },
  { deckRows: 30, deckCols: 10, rimSeg: 2, gripRows: 26, gripCols: 8, radial: 16, arc: 2 },
  { deckRows: 16, deckCols: 6, rimSeg: 1, gripRows: 12, gripCols: 4, radial: 10, arc: 1 },
];

// ---- Deck height field ---------------------------------------------------
function halfWidthAt(s) {
  const absS = Math.abs(s);
  const dEnd = BOARD.length / 2 - absS;
  if (dEnd >= BOARD.endRound) return BOARD.width / 2;
  const t = clamp(dEnd / BOARD.endRound, 0, 1); // 0 at tip, 1 at round start
  return (BOARD.width / 2) * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
}

function kickAt(s) {
  if (s > 0) {
    const start = BOARD.length / 2 - BOARD.noseKickLen;
    if (s <= start) return 0;
    const t = clamp((s - start) / BOARD.noseKickLen, 0, 1);
    return BOARD.kickRise * Math.pow(t, 1.6);
  }
  const start = BOARD.length / 2 - BOARD.tailKickLen;
  const as = -s;
  if (as <= start) return 0;
  const t = clamp((as - start) / BOARD.tailKickLen, 0, 1);
  return BOARD.kickRise * Math.pow(t, 1.6);
}

/** Surface point of the deck. surface: 'top' | 'bottom'. tn in [-1,1]. */
function deckPoint(u, tn, surface) {
  const s = -BOARD.length / 2 + u * BOARD.length; // Z
  const w = halfWidthAt(s);
  const x = tn * w;
  const concave = BOARD.concaveRise * tn * tn;
  const kick = kickAt(s);
  const baseY = surface === 'top' ? BOARD.thickness / 2 : -BOARD.thickness / 2;
  return [x, baseY + concave + kick, s];
}

/** Deck top surface height at (z, x) — used for socket placement. */
export function deckTopHeight(z, x) {
  const u = (z + BOARD.length / 2) / BOARD.length;
  const w = halfWidthAt(z);
  const tn = w > 1e-6 ? clamp(x / w, -1, 1) : 0;
  return deckPoint(u, tn, 'top')[1];
}

// ---- Deck builder --------------------------------------------------------
export function buildDeckParts(lodIndex) {
  const L = LOD[lodIndex];
  const rows = L.deckRows;
  const cols = L.deckCols;

  const top = gridSurface({
    rows,
    cols,
    pointFn: (i, j) => deckPoint(i / rows, -1 + 2 * (j / cols), 'top'),
    flip: false,
    uvFn: (u, v) => [v, u],
  });
  const bottom = gridSurface({
    rows,
    cols,
    pointFn: (i, j) => deckPoint(i / rows, -1 + 2 * (j / cols), 'bottom'),
    flip: true,
    uvFn: (u, v) => [v, u],
  });

  // Rim: connect top & bottom outline (left rail v=0, right rail v=cols) with a
  // micro-bevel bulge. Build as one strip per side; tips close naturally.
  const rim = new MeshBuilder();
  const addRail = (tn) => {
    const rings = [];
    for (let i = 0; i <= rows; i++) {
      const u = i / rows;
      const tp = deckPoint(u, tn, 'top');
      const bp = deckPoint(u, tn, 'bottom');
      const outwardMag = Math.abs(tp[0]) / (BOARD.width / 2); // 0 at tips
      const outX = (tn >= 0 ? 1 : -1) * BOARD.railBevel * outwardMag;
      const ring = [];
      for (let k = 0; k <= L.rimSeg; k++) {
        const t = k / L.rimSeg;
        const p = vec3.lerp(tp, bp, t);
        const bulge = Math.sin(Math.PI * t);
        ring.push([p[0] + outX * bulge, p[1], p[2]]);
      }
      rings.push(ring);
    }
    const vidx = [];
    for (let i = 0; i <= rows; i++) {
      const r = [];
      for (let k = 0; k <= L.rimSeg; k++) {
        const p = rings[i][k];
        r.push(rim.vertex(p[0], p[1], p[2], (tn >= 0 ? 1 : -1), 0, 0, i / rows, k / L.rimSeg));
      }
      vidx.push(r);
    }
    for (let i = 0; i < rows; i++) {
      for (let k = 0; k < L.rimSeg; k++) {
        if (tn >= 0) rim.quad(vidx[i][k], vidx[i + 1][k], vidx[i + 1][k + 1], vidx[i][k + 1]);
        else rim.quad(vidx[i][k], vidx[i][k + 1], vidx[i + 1][k + 1], vidx[i + 1][k]);
      }
    }
  };
  addRail(1);
  addRail(-1);
  rim.recomputeNormals(45);

  return { top, bottom, rim };
}

export function buildGrip(lodIndex) {
  const L = LOD[lodIndex];
  const rows = L.gripRows;
  const cols = L.gripCols;
  const frac = BOARD.gripWidthFrac;
  return gridSurface({
    rows,
    cols,
    pointFn: (i, j) => {
      const u = i / rows;
      const tn = (-1 + 2 * (j / cols)) * frac;
      const p = deckPoint(u, tn, 'top');
      return [p[0], p[1] + BOARD.gripLift, p[2]];
    },
    flip: false,
    uvFn: (u, v) => [v * 8, u * 24], // tile grit finely
  });
}

// ---- Wheel (lathe) -------------------------------------------------------
export function buildWheel(lodIndex) {
  const L = LOD[lodIndex];
  const R = BOARD.wheelDiameter / 2; // ~0.0285
  const hw = BOARD.wheelWidth / 2; // ~0.0165
  const bore = 0.006; // hub bore radius
  const edge = 0.006; // tread edge fillet
  const recess = 0.004; // hub dish depth
  const hubR = 0.012; // hub face radius
  const prof = [];
  if (lodIndex >= 2) {
    // Coarse: chamfered cylinder with a bore, no hub dish (~80 tri target).
    prof.push({ x: hw, r: bore });
    prof.push({ x: hw, r: R - edge });
    prof.push({ x: hw - edge, r: R });
    prof.push({ x: -hw + edge, r: R });
    prof.push({ x: -hw, r: R - edge });
    prof.push({ x: -hw, r: bore });
    return lathe({ profile: prof, segments: L.radial, closed: true });
  }
  // Closed cross-section contour (x = axial, r = radius), traced CCW so the
  // lathe's radial normals face outward (bore normals face the axle hole).
  const steps = Math.max(2, L.arc + 1);
  // +x side face: bore → dished hub → up to the +x rim below the tread edge
  prof.push({ x: hw, r: bore });
  prof.push({ x: hw - recess, r: hubR });
  prof.push({ x: hw - recess, r: R - edge - 0.002 });
  prof.push({ x: hw, r: R - edge });
  // +x tread shoulder round: (hw, R-edge) → (hw-edge, R)
  for (let k = 1; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    prof.push({ x: hw - edge * (1 - Math.cos(a)), r: R - edge + edge * Math.sin(a) });
  }
  // (flat tread is the implicit segment from here to the -x shoulder start)
  // -x tread shoulder round: (-hw+edge, R) → (-hw, R-edge)
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    prof.push({ x: -hw + edge * (1 - Math.sin(a)), r: R - edge * (1 - Math.cos(a)) });
  }
  // -x side face dished down to bore
  prof.push({ x: -hw + recess, r: R - edge - 0.002 });
  prof.push({ x: -hw + recess, r: hubR });
  prof.push({ x: -hw, r: bore });
  // bore wall closes back to (hw, bore)
  return lathe({ profile: prof, segments: L.radial, closed: true });
}

/** A ring of `n` points in the Y–Z plane at position x (for lofting hangers). */
function ringYZ(x, ry, rz, cy, cz, n, exponent = 2.6) {
  const ring = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const y = cy + Math.sign(ca) * Math.pow(Math.abs(ca), 2 / exponent) * ry;
    const z = cz + Math.sign(sa) * Math.pow(Math.abs(sa), 2 / exponent) * rz;
    ring.push([x, y, z]);
  }
  return ring;
}

// ---- Truck ---------------------------------------------------------------
export function buildTruck(lodIndex) {
  const L = LOD[lodIndex];
  const mb = new MeshBuilder();
  const seg = Math.max(6, L.radial | 0);

  const fine = lodIndex <= 1; // bushings / nuts only on near LODs

  // Baseplate: flat bevelled box bolted under the deck.
  const baseplate = roundedBox({
    size: [0.09, 0.012, 0.062],
    radius: 0.004,
    bevelSegments: lodIndex === 0 ? 4 : lodIndex === 1 ? 2 : 1,
  });
  baseplate.transform({ t: [0, -0.006, 0] });
  mb.merge(baseplate);

  // Hanger: a lofted tapered T. Wide, tall boss at the pivot centre tapering
  // to slim axle stubs at each end. Lofted along X for a true truck silhouette.
  const np = lodIndex === 0 ? 18 : lodIndex === 1 ? 12 : 8;
  const half = BOARD.truckAxleWidth * 0.46;
  const spans = lodIndex === 0
    ? [-1, -0.72, -0.45, -0.2, 0, 0.2, 0.45, 0.72, 1]
    : lodIndex === 1
      ? [-1, -0.6, -0.25, 0, 0.25, 0.6, 1]
      : [-1, -0.4, 0, 0.4, 1];
  const rings = spans.map((sx) => {
    const x = sx * half;
    const a = Math.abs(sx);
    // radius profile: thick boss near centre, slim near ends
    const ry = 0.006 + (1 - a) * 0.012; // taller at centre (kingpin boss)
    const rz = 0.006 + (1 - a) * 0.007;
    const cy = -0.02 - (1 - a) * 0.004; // boss dips slightly to hold kingpin
    return ringYZ(x, ry, rz, cy, 0, np);
  });
  const hanger = loft({ rings, capStart: true, capEnd: true, creaseDeg: 50 });
  mb.merge(hanger);

  // Kingpin: angled cylinder through the pivot + a nut on top.
  const kpQ = [0, 0, 0.32557, 0.94551]; // ~38° tilt about Z
  const kingpin = cylinderX({ x0: -0.016, x1: 0.016, r: 0.0035, segments: Math.max(6, seg) });
  kingpin.transform({ q: kpQ, t: [0, -0.012, 0.008] });
  mb.merge(kingpin);
  if (fine) {
    const kpNut = cylinderX({ x0: -0.003, x1: 0.003, r: 0.005, segments: 6 });
    kpNut.transform({ q: kpQ, t: [0.014, 0.0, 0.014] });
    mb.merge(kpNut);
    // Two bushings (truncated cones) hugging the pivot boss.
    for (const dz of [0.004, -0.008]) {
      const bushing = lathe({
        profile: [
          { x: -0.004, r: 0.0038 }, { x: -0.004, r: 0.008 },
          { x: 0.004, r: 0.007 }, { x: 0.004, r: 0.0038 },
        ],
        segments: Math.max(8, seg),
        closed: true,
      });
      bushing.transform({ q: kpQ, t: [0, -0.018, dz] });
      mb.merge(bushing);
    }
  }

  // Axle: cylinder along X spanning the wheel mounts, with end nuts.
  const axle = cylinderX({
    x0: -BOARD.truckAxleWidth / 2,
    x1: BOARD.truckAxleWidth / 2,
    r: 0.0035,
    segments: Math.max(6, seg),
  });
  axle.transform({ t: [0, -0.028, 0] });
  mb.merge(axle);
  if (fine) {
    for (const sx of [1, -1]) {
      const nut = cylinderX({ x0: -0.003, x1: 0.003, r: 0.006, segments: 6 });
      nut.transform({ t: [sx * (BOARD.truckAxleWidth / 2 - 0.003), -0.028, 0] });
      mb.merge(nut);
    }
  }
  return mb;
}

// ---- Assembly ------------------------------------------------------------
export function boardNodeSpecs(lodIndex) {
  const deck = buildDeckParts(lodIndex);
  const grip = buildGrip(lodIndex);
  const wheelGeo = buildWheel(lodIndex);
  const truckGeo = buildTruck(lodIndex);

  const halfWB = BOARD.wheelbase / 2;
  const truckY = -BOARD.thickness / 2 - BOARD.truckDropY;
  const wheelY = truckY - 0.028;
  const halfAxle = BOARD.truckAxleWidth / 2;

  const nodes = [];
  // Deck: one mesh, two materials (top+rim = wood, bottom = graphic).
  nodes.push({
    name: 'Deck',
    primitives: [
      { builder: deck.top, material: 'deckWood' },
      { builder: deck.rim, material: 'deckWood' },
      { builder: deck.bottom, material: 'deckGraphic' },
    ],
  });
  nodes.push({ name: 'GripTape', primitives: [{ builder: grip, material: 'grip' }] });

  // Trucks (static). Front = +Z (nose side), rear = -Z. The pair is
  // mirror-symmetric about deck centre: the front truck is rotated 180° about
  // Y so both kingpins/bushings face INWARD (toward each other), as on a real
  // board. Baseplate/hanger/axle are Z- and X-symmetric, so only the kingpin
  // assembly flips; bounds + wheelbase are unchanged.
  nodes.push({ name: 'Truck_F', translation: [0, truckY, halfWB], rotation: [0, 1, 0, 0], primitives: [{ builder: truckGeo, material: 'truckMetal' }] });
  nodes.push({ name: 'Truck_R', translation: [0, truckY, -halfWB], primitives: [{ builder: cloneBuilder(truckGeo), material: 'truckMetal' }] });

  // Visual axles (separate named parts per brief).
  const axleGeo = () => cylinderX({ x0: -halfAxle, x1: halfAxle, r: 0.0035, segments: 12 });
  nodes.push({ name: 'Axle_F', translation: [0, wheelY, halfWB], primitives: [{ builder: axleGeo(), material: 'truckMetal' }] });
  nodes.push({ name: 'Axle_R', translation: [0, wheelY, -halfWB], primitives: [{ builder: axleGeo(), material: 'truckMetal' }] });

  // Wheels — nodes positioned at axle ends; geometry already spins about X.
  const wheelPositions = {
    Wheel_FR: [halfAxle, wheelY, halfWB],
    Wheel_FL: [-halfAxle, wheelY, halfWB],
    Wheel_RR: [halfAxle, wheelY, -halfWB],
    Wheel_RL: [-halfAxle, wheelY, -halfWB],
  };
  for (const [name, t] of Object.entries(wheelPositions)) {
    nodes.push({ name, translation: t, primitives: [{ builder: cloneBuilder(wheelGeo), material: 'urethane' }] });
  }

  // Hardware: 8 low-poly bolt insets on deck top corners (nose+tail).
  const bolts = buildBolts(lodIndex);
  nodes.push({ name: 'Hardware_Bolts', primitives: [{ builder: bolts, material: 'truckMetal' }] });

  // Sockets — empty nodes at deck-top nose/tail stance positions.
  nodes.push({ name: 'Socket_NoseFoot', translation: [0, deckTopHeight(BOARD.socketZ, 0) + 0.002, BOARD.socketZ] });
  nodes.push({ name: 'Socket_TailFoot', translation: [0, deckTopHeight(-BOARD.socketZ, 0) + 0.002, -BOARD.socketZ] });

  // Colliders — hidden, flagged. Only on LOD0 (runtime uses one proxy set).
  if (lodIndex === 0) {
    const colDeck = roundedBox({ size: [BOARD.width, 0.02, BOARD.length * 0.98], radius: 0.001, bevelSegments: 1 });
    nodes.push({ name: 'COL_Deck', primitives: [{ builder: colDeck, material: 'collider' }], extras: { collider: true, hidden: true } });
    for (const [nm, z] of [['COL_Truck_F', halfWB], ['COL_Truck_R', -halfWB]]) {
      const b = roundedBox({ size: [BOARD.truckAxleWidth, 0.06, 0.05], radius: 0.001, bevelSegments: 1 });
      nodes.push({ name: nm, translation: [0, truckY - 0.01, z], primitives: [{ builder: b, material: 'collider' }], extras: { collider: true, hidden: true } });
    }
  }
  return nodes;
}

function buildBolts(lodIndex) {
  const L = LOD[lodIndex];
  const mb = new MeshBuilder();
  const halfWB = BOARD.wheelbase / 2;
  // 4 bolts per truck footprint, near the baseplate corners, on deck top.
  const xs = [-0.03, 0.03];
  const zsF = [halfWB - 0.02, halfWB + 0.02];
  const zsR = [-halfWB - 0.02, -halfWB + 0.02];
  const place = (x, z) => {
    const y = deckTopHeight(z, x);
    const head = cylinderX({ x0: -0.0015, x1: 0.0015, r: 0.004, segments: Math.max(6, L.radial / 4) });
    head.transform({ q: [0, 0, 0.70710678, 0.70710678], t: [x, y + 0.0015, z] }); // stand upright (axis→Y)
    mb.merge(head);
  };
  for (const x of xs) for (const z of [...zsF, ...zsR]) place(x, z);
  return mb;
}

/** Deep-ish clone of a builder (fresh arrays) so nodes don't alias geometry. */
function cloneBuilder(src) {
  const mb = new MeshBuilder();
  mb.positions = src.positions.slice();
  mb.normals = src.normals.slice();
  mb.uvs = src.uvs.slice();
  mb.indices = src.indices.slice();
  return mb;
}

export async function buildBoard({ textures } = {}) {
  const outputs = [];
  for (let lod = 0; lod < 3; lod++) {
    const nodes = boardNodeSpecs(lod);
    const doc = buildDocument({
      materials: boardMaterials(textures, lod),
      nodes,
      sceneName: `hero-board-lod${lod}`,
    });
    const raw = path.join(RAW_DIR, `hero-board.lod${lod}.glb`);
    await writeGLB(doc, raw);
    outputs.push({ lod, raw });
  }
  return outputs;
}
