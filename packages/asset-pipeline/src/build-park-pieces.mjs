// Park pieces generator — the THPS-vocabulary extension of the plaza module
// kit (M8a follow-up for M9): mini half-pipe, straight quarter-pipe wall,
// kickers, pyramid funbox, long/kinked rails, stairs-with-handrail. Staged
// INTO plaza-modules.glb (imported by build-plaza-modules.mjs) so the whole
// kit shares one embedded PBR texture set — a separate GLB would duplicate
// ~5 MB of concrete/metal/wood maps and double runtime texture memory.
//
// TRANSITION COLLIDER APPROACH (the part that makes ramps feel good):
// The game sim builds all static collision as Rapier CUBOIDS from plain data
// (see packages/game/src/sim/levels/*.ts — cuboid-only today), so a trimesh
// arc would be a new runtime requirement. Instead each quarter-pipe
// transition collider is a FAN OF THIN CHORD BOXES along the TRUE circular
// arc: ARC_SEGS (28) segments over the transition angle, each box a separate
// `*_Col_N` node whose translation+rotation place a [width × 0.08 × chord]
// box with its top face exactly through two consecutive arc sample points.
// Consecutive boxes share the sample edge (no gaps), the surface kink per
// seam is ~3.1°, and the max deviation from the true circle (chord sagitta)
// is R·(1 − cos(Δφ/2)) ≈ 0.6 mm — far below contact-solver noise, so Rapier
// reads a smooth circle. M9 turns each node into
// `ColliderDesc.cuboid(sx/2, sy/2, sz/2).setTranslation(...).setRotation(...)`
// by composing node → assembly → piece transforms (assembly nodes carry a
// `transition` extras block with the analytic radius/height/width should a
// level want the exact arc instead).
//
// GRINDABLE NAMING/TAGGING CONVENTION (for M6/M9 collider tagging):
//   * Every grindable collider node carries extras
//       { collider:true, hidden:true, grind:true,
//         ledge:<bool>, grindLine:{ a:[x,y,z], b:[x,y,z] } }
//     where grindLine is the TOP CONTACT SEGMENT (where the board rests) in
//     PIECE-ROOT-LOCAL coordinates — a RailDescriptor {ax..bz, topY} falls
//     out by applying the piece's placement transform. `ledge:true` marks
//     wide forgiving surfaces (ledge/curb), false marks thin rails/coping.
//   * extras.grind === true is the AUTHORITATIVE signal. As a human-readable
//     mirror, every grindable collider name contains a Capitalized grind
//     token — `Coping`, `Rail`, `Ledge`, or `Handrail` — before its `_Col_N`
//     suffix (e.g. `Coping_L_Col_0`, `rail_long_Rail_Col_0`). Piece names are
//     all-lowercase, so a CASE-SENSITIVE token match never false-positives on
//     e.g. `stairs_with_handrail_Col_0` (the steps wedge, not grindable).
//     The validator asserts the two rules are equivalent.
//
// Dimensions: 1 unit = 1 m. Deterministic: pure constants, no RNG, no time.

import { MeshBuilder } from './geo/mesh.mjs';
import { roundedBox } from './geo/box.mjs';
import { cylinderX } from './geo/lathe.mjs';
import { gridSurface, extrudeProfile } from './geo/sweep.mjs';
import { quatAxisAngle, quatMul, vec3 } from './geo/math.mjs';

// Rotate a Z-extruded profile so its sweep axis becomes X (quarter turn Y);
// QY maps +X→−Z, QY_INV maps +X→+Z. Same constants as build-plaza-modules.
export const QY = [0, 0.70710678, 0, 0.70710678];
export const QY_INV = [0, -0.70710678, 0, 0.70710678];
const Y180 = [0, 1, 0, 0];

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const line = (a, b) => ({ a: a.map(r4), b: b.map(r4) });

/**
 * TRANSITION — the shared quarter-pipe profile. A TRUE circular arc of
 * radius R rising to height H. H < R makes the lip slightly under-vert
 * (83.6°), the authentic mini-ramp read: a full quarter circle to vert would
 * force H = R, and the brief's H≈1.6 at R≈1.8 pins the under-vert intent.
 */
export const TRANSITION = {
  R: 1.8,
  H: 1.6,
  phiTop: Math.acos(1 - 1.6 / 1.8), // 1.45946 rad = 83.62°
  ARC_SEGS: 28, // collider fan segments AND visual grid rows
  copingR: 0.03, // 0.06 m diameter coping pipe
};
/** Horizontal run of the transition (arc start → lip). */
export const Z_LIP = TRANSITION.R * Math.sin(TRANSITION.phiTop); // 1.78885

/** Arc sample points [z, y] from tangent start (0, y0) to lip (Z_LIP, y0+H). */
export function arcPoints(y0 = 0, segs = TRANSITION.ARC_SEGS) {
  const { R, phiTop } = TRANSITION;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const phi = (i / segs) * phiTop;
    pts.push([R * Math.sin(phi), y0 + R * (1 - Math.cos(phi))]);
  }
  return pts;
}

/** z of the arc at surface height y (above y0). */
function zAtHeight(y, y0 = 0) {
  const { R } = TRANSITION;
  return R * Math.sin(Math.acos(1 - (y - y0) / R));
}

/**
 * Quaternion tilting local +Z onto the (z,y)-plane direction (dz, dy):
 * a rotation about +X by −atan2(dy, dz). Unit-tested in park.test.ts.
 */
export function xTiltQuatFor(dz, dy) {
  return quatAxisAngle([1, 0, 0], -Math.atan2(dy, dz));
}

const colliderChild = (name, builder, translation = [0, 0, 0], rotation, extras) => ({
  name,
  translation,
  ...(rotation ? { rotation } : {}),
  primitives: [{ builder, material: 'collider' }],
  extras: { collider: true, hidden: true, ...(extras || {}) },
});

function boxCollider(size) {
  return roundedBox({ size, radius: 0.001, bevelSegments: 1 });
}

/**
 * The transition-collider fan: ARC_SEGS chord boxes along the true arc.
 * Returns collider NodeSpecs named `<prefix>_Col_<i0..>`. Coordinates are
 * local to the transition assembly (arc tangent-start at z=0, y=y0).
 */
export function transitionFanColliders(prefix, width, y0, startIndex = 0) {
  const pts = arcPoints(y0);
  const thick = 0.08;
  const { phiTop, ARC_SEGS } = TRANSITION;
  const out = [];
  for (let i = 0; i < ARC_SEGS; i++) {
    const [z0, ya] = pts[i];
    const [z1, yb] = pts[i + 1];
    const dz = z1 - z0;
    const dy = yb - ya;
    const chord = Math.hypot(dz, dy);
    // Into-the-solid direction = radial (away from the circle centre) at the
    // segment's mid angle: (sin φm, −cos φm) in (z, y).
    const phiM = ((i + 0.5) / ARC_SEGS) * phiTop;
    const cx = (z0 + z1) / 2 + (thick / 2) * Math.sin(phiM);
    const cy = (ya + yb) / 2 - (thick / 2) * Math.cos(phiM);
    out.push(
      colliderChild(
        `${prefix}_Col_${startIndex + i}`,
        boxCollider([width, thick, chord]),
        [0, r4(cy), r4(cx)],
        xTiltQuatFor(dz, dy).map(r4),
      ),
    );
  }
  return out;
}

/**
 * A thin wall slab whose silhouette follows an upper boundary polyline
 * [[z, y]...] (ascending z) down to the ground: two large terrain faces at
 * x0/x1 (normals −X/+X — both sides render, no see-through interiors) plus a
 * perimeter rim via extrudeProfile (belt only; the concave profile cannot use
 * its centroid-fan caps).
 */
export function wallSlab(upper, x0, x1) {
  const mb = new MeshBuilder();
  const n = upper.length;
  // Rim: closed CCW polygon (ground run, then the upper boundary reversed).
  const poly = [[upper[0][0], 0], [upper[n - 1][0], 0]];
  for (let i = n - 1; i >= 0; i--) poly.push([upper[i][0], upper[i][1]]);
  const rim = extrudeProfile({ profile: poly, length: Math.abs(x1 - x0), capStart: false, capEnd: false });
  rim.transform({ q: QY_INV, t: [(x0 + x1) / 2, 0, 0] });
  mb.merge(rim);
  // Large faces (terrain strips; boundary is z-monotone).
  for (const [x, nx] of [[x0, -1], [x1, 1]]) {
    for (let i = 0; i < n - 1; i++) {
      const [za, ya] = upper[i];
      const [zb, yb] = upper[i + 1];
      if (ya + yb < 1e-6) continue;
      const u0 = i / (n - 1);
      const u1 = (i + 1) / (n - 1);
      const a = mb.vertex(x, 0, za, nx, 0, 0, u0, 0);
      const b = mb.vertex(x, 0, zb, nx, 0, 0, u1, 0);
      const c = mb.vertex(x, yb, zb, nx, 0, 0, u1, yb / 2);
      const d = mb.vertex(x, ya, za, nx, 0, 0, u0, ya / 2);
      mb.quad(a, b, c, d);
    }
  }
  return mb;
}

/**
 * One transition assembly (visuals + colliders), local frame: arc tangent
 * start at (z=0, y=y0), lip at (Z_LIP, y0+H), deck behind to zBack.
 * Materials: `surface` for the riding skin/deck/walls, framing beams wood.
 */
function transitionAssembly({ name, width, y0, deckDepth, surface, beams }) {
  const { H, R, phiTop, ARC_SEGS } = TRANSITION;
  const deckY = y0 + H;
  const zBack = Z_LIP + deckDepth;
  const wallT = 0.04;
  const halfIn = width / 2 - wallT; // riding skin abuts the wall inner faces

  // Riding skin: smooth-normal grid along the true arc.
  const skin = gridSurface({
    rows: ARC_SEGS,
    cols: 2,
    pointFn: (i, j, u, v) => {
      const phi = u * phiTop;
      return [-halfIn + v * 2 * halfIn, y0 + R * (1 - Math.cos(phi)), R * Math.sin(phi)];
    },
    uvFn: (u, v) => [(R * phiTop * u) / 2, (v * width) / 2],
  });

  // Side walls following the arc + deck silhouette.
  const boundary = [...arcPoints(y0).map(([z, y]) => [z, y]), [zBack, deckY]];
  const walls = new MeshBuilder();
  walls.merge(wallSlab(boundary, width / 2 - wallT, width / 2));
  walls.merge(wallSlab(boundary, -width / 2, -width / 2 + wallT));

  // Deck platform + back panel.
  const deck = roundedBox({ size: [width - 2 * wallT, 0.06, deckDepth], radius: 0.01, bevelSegments: 2, uvScale: 2 });
  deck.transform({ t: [0, deckY - 0.03, Z_LIP + deckDepth / 2] });
  const back = roundedBox({ size: [width - 2 * wallT, deckY - 0.06, 0.05], radius: 0.008, bevelSegments: 1, uvScale: 2 });
  back.transform({ t: [0, (deckY - 0.06) / 2, zBack - 0.025] });

  const primitives = [
    { builder: skin, material: surface },
    { builder: walls, material: surface },
    { builder: deck, material: surface },
    { builder: back, material: surface },
  ];

  // Simple support framing suggestion (outside the back panel).
  if (beams) {
    const framing = new MeshBuilder();
    for (const bx of [-width / 2 + 0.3, 0, width / 2 - 0.3]) {
      const post = roundedBox({ size: [0.08, deckY - 0.1, 0.08], radius: 0.006, bevelSegments: 1 });
      post.transform({ t: [bx, (deckY - 0.1) / 2, zBack + 0.04] });
      framing.merge(post);
    }
    const cross = roundedBox({ size: [width - 0.2, 0.08, 0.08], radius: 0.006, bevelSegments: 1, uvScale: 2 });
    cross.transform({ t: [0, deckY * 0.55, zBack + 0.04] });
    framing.merge(cross);
    primitives.push({ builder: framing, material: 'wood' });
  }

  // Colliders: arc fan + deck + 3 stepped side-wall boxes per side.
  const children = transitionFanColliders(name, width, y0);
  let ci = TRANSITION.ARC_SEGS;
  children.push(
    colliderChild(`${name}_Col_${ci++}`, boxCollider([width - 2 * wallT, 0.06, deckDepth]), [0, r4(deckY - 0.03), r4(Z_LIP + deckDepth / 2)]),
  );
  const steps = [
    [zAtHeight(y0 + 0.3, y0), zAtHeight(y0 + 0.85, y0), 0.85],
    [zAtHeight(y0 + 0.85, y0), Z_LIP, y0 + H - 0.1],
    [Z_LIP, zBack, deckY],
  ];
  for (const sx of [1, -1]) {
    for (const [za, zb, h] of steps) {
      children.push(
        colliderChild(
          `${name}_Col_${ci++}`,
          boxCollider([wallT, h, zb - za]),
          [sx * (width / 2 - wallT / 2), r4(h / 2), r4((za + zb) / 2)],
        ),
      );
    }
  }
  return { primitives, children, zBack, deckY };
}

/** Coping pipe + grind collider at a lip. Node names per the brief. */
function copingNodes(visName, colName, width, center) {
  const { copingR } = TRANSITION;
  const len = width - 0.04; // caps clear the side-wall planes
  const pipe = cylinderX({ x0: -len / 2, x1: len / 2, r: copingR, segments: 14, capRadius: 0.02 });
  const top = center[1] + copingR;
  return {
    vis: {
      name: visName,
      translation: center.map(r4),
      primitives: [{ builder: pipe, material: 'metalTrim' }],
    },
    col: colliderChild(
      colName,
      boxCollider([len, 2 * copingR, 2 * copingR]),
      center.map(r4),
      undefined,
      { grind: true, ledge: false, grindLine: line([-len / 2 + center[0], top, center[2]], [len / 2 + center[0], top, center[2]]) },
    ),
  };
}

// ---- Pieces ---------------------------------------------------------------

/**
 * halfpipe_mini — two facing wooden transitions (R 1.8 / H 1.6, under-vert
 * lip) joined by a 3 m flat bottom, 6 m wide, 1.2 m decks, metal coping both
 * lips, closed side walls, back framing. AABB ≈ 6.00 × 1.648 × 9.138.
 */
export function halfpipeMini(pos) {
  const width = 6;
  const flat = 3;
  const floorT = 0.02;
  const t = transitionAssembly({ name: 'halfpipe_mini_TA', width, y0: floorT, deckDepth: 1.2, surface: 'wood', beams: true });
  const tb = transitionAssembly({ name: 'halfpipe_mini_TB', width, y0: floorT, deckDepth: 1.2, surface: 'wood', beams: true });

  // Flat-bottom floor: 20 mm ply/masonite slab; edges rounded so the open
  // ends ride on. Tucks 7 mm under each arc start.
  const floor = roundedBox({ size: [width, floorT, flat + 0.014], radius: 0.008, bevelSegments: 2, uvScale: 3 });
  floor.transform({ t: [0, floorT / 2, 0] });

  const copingY = floorT + TRANSITION.H - 0.022; // pipe top 8 mm above deck
  const copingZ = flat / 2 + Z_LIP - 0.01;
  const cR = copingNodes('Coping_R', 'Coping_R_Col_0', width, [0, copingY, copingZ]);
  const cL = copingNodes('Coping_L', 'Coping_L_Col_0', width, [0, copingY, -copingZ]);

  return {
    name: 'halfpipe_mini',
    translation: pos,
    primitives: [{ builder: floor, material: 'wood' }],
    extras: { transition: { radius: TRANSITION.R, height: TRANSITION.H, width, arcSegs: TRANSITION.ARC_SEGS } },
    children: [
      { name: 'halfpipe_mini_TA', translation: [0, 0, flat / 2], primitives: t.primitives, children: t.children },
      { name: 'halfpipe_mini_TB', translation: [0, 0, -flat / 2], rotation: Y180, primitives: tb.primitives, children: tb.children },
      cR.vis, cR.col, cL.vis, cL.col,
      colliderChild('halfpipe_mini_Col_0', boxCollider([width, floorT, flat]), [0, floorT / 2, 0]),
    ],
  };
}

/**
 * qp_wall — straight 3 m-wide concrete quarter-pipe (same transition profile),
 * 0.4 m top platform, metal coping. Lines plaza walls / builds extensions.
 */
export function qpWall(pos) {
  const width = 3;
  const t = transitionAssembly({ name: 'qp_wall', width, y0: 0, deckDepth: 0.4, surface: 'concrete', beams: false });
  const c = copingNodes('qp_wall_Coping', 'qp_wall_Coping_Col_0', width, [0, TRANSITION.H - 0.022, Z_LIP - 0.01]);
  return {
    name: 'qp_wall',
    translation: pos,
    primitives: t.primitives,
    extras: { transition: { radius: TRANSITION.R, height: TRANSITION.H, width, arcSegs: TRANSITION.ARC_SEGS } },
    children: [c.vis, c.col, ...t.children],
  };
}

/** kicker — concrete launch wedge, straight 16.3° face (0.35 over 1.2). */
export function kicker(name, pos, { length, height, width }) {
  const tri = [[0, 0], [length, 0], [length, height]];
  const wedge = extrudeProfile({ profile: tri, length: width });
  wedge.transform({ q: QY });
  const col = extrudeProfile({ profile: tri, length: width });
  col.transform({ q: QY });
  return {
    name,
    translation: pos,
    primitives: [{ builder: wedge, material: 'concrete' }],
    children: [colliderChild(`${name}_Col_0`, col)],
  };
}

/**
 * funbox — centre-park pyramid: 4 mitered 30° banks (bank_2m slope) around a
 * 2×2 m flat top at 0.5 m, metal grind ledges on two opposing top edges, and
 * a round rail spine crossing over one bank pair.
 */
export function funbox(pos) {
  const topHalf = 1;
  const H = 0.5;
  const run = H / Math.tan(Math.PI / 6); // 0.866 — the bank_2m 30° profile
  const baseHalf = topHalf + run; // 1.866
  const body = new MeshBuilder();

  // 4 trapezoid bank faces sharing miter edges (closed pyramid, no gaps).
  const c30 = Math.cos(Math.PI / 6);
  const s30 = Math.sin(Math.PI / 6);
  const faces = [
    { n: [0, c30, s30], b: [[-baseHalf, 0, baseHalf], [baseHalf, 0, baseHalf]], t: [[-topHalf, H, topHalf], [topHalf, H, topHalf]] },
    { n: [0, c30, -s30], b: [[baseHalf, 0, -baseHalf], [-baseHalf, 0, -baseHalf]], t: [[topHalf, H, -topHalf], [-topHalf, H, -topHalf]] },
    { n: [s30, c30, 0], b: [[baseHalf, 0, baseHalf], [baseHalf, 0, -baseHalf]], t: [[topHalf, H, topHalf], [topHalf, H, -topHalf]] },
    { n: [-s30, c30, 0], b: [[-baseHalf, 0, -baseHalf], [-baseHalf, 0, baseHalf]], t: [[-topHalf, H, -topHalf], [-topHalf, H, topHalf]] },
  ];
  for (const f of faces) {
    const a = body.vertex(...f.b[0], ...f.n, 0, 0);
    const b = body.vertex(...f.b[1], ...f.n, baseHalf, 0);
    const c = body.vertex(...f.t[1], ...f.n, baseHalf - run / 2, 0.5);
    const d = body.vertex(...f.t[0], ...f.n, run / 2, 0.5);
    body.quad(a, b, c, d);
  }
  // Flat top.
  {
    const a = body.vertex(-topHalf, H, topHalf, 0, 1, 0, 0, 0);
    const b = body.vertex(topHalf, H, topHalf, 0, 1, 0, 1, 0);
    const c = body.vertex(topHalf, H, -topHalf, 0, 1, 0, 1, 1);
    const d = body.vertex(-topHalf, H, -topHalf, 0, 1, 0, 0, 1);
    body.quad(a, b, c, d);
  }

  // Grind ledges: metal edging on the two top edges ⊥ to the rail spine.
  const ledges = [];
  const ledgeNames = ['FunboxLedge_A', 'FunboxLedge_B'];
  const ledgeCols = [];
  [1, -1].forEach((sz, i) => {
    const bar = roundedBox({ size: [2 * topHalf, 0.04, 0.06], radius: 0.008, bevelSegments: 2, uvScale: 2 });
    const cx = [0, H, sz * (topHalf - 0.015)];
    bar.transform({ t: cx });
    ledges.push({ name: ledgeNames[i], primitives: [{ builder: bar, material: 'metalTrim' }] });
    ledgeCols.push(
      colliderChild(`${ledgeNames[i]}_Col_0`, boxCollider([2 * topHalf, 0.04, 0.06]), cx.map(r4), undefined, {
        grind: true,
        ledge: true,
        grindLine: line([-topHalf, H + 0.02, cx[2]], [topHalf, H + 0.02, cx[2]]),
      }),
    );
  });

  // Rail spine over the ±X bank pair.
  const railY = 0.8;
  const railHalf = 2.1;
  const spine = cylinderX({ x0: -railHalf, x1: railHalf, r: 0.025, segments: 16, capRadius: 0.02 });
  spine.transform({ t: [0, railY, 0] });
  const posts = new MeshBuilder();
  for (const sx of [2.0, -2.0]) {
    const post = roundedBox({ size: [0.05, railY, 0.05], radius: 0.006, bevelSegments: 1 });
    post.transform({ t: [sx, railY / 2, 0] });
    posts.merge(post);
  }

  // Bank colliders: 4 rotated slope boxes (30°) + top box. Overlapping slope
  // boxes reproduce the miter corners exactly (union of the two 30° planes).
  const slope = Math.hypot(run, H); // 1.0
  const midY = H / 2 - 0.04 * c30;
  const midOut = (baseHalf + topHalf) / 2 + 0.04 * s30; // centre − normal·(t/2)
  const q30 = (deg) => quatAxisAngle([1, 0, 0], (deg * Math.PI) / 180).map(r4);
  const qz30 = (deg) => quatAxisAngle([0, 0, 1], (deg * Math.PI) / 180).map(r4);
  const bankCols = [
    colliderChild('funbox_Col_0', boxCollider([2 * baseHalf, 0.08, slope]), [0, r4(midY), r4(midOut - 0.08 * s30 / 2 + 0.02 * 0)], q30(30)),
    colliderChild('funbox_Col_1', boxCollider([2 * baseHalf, 0.08, slope]), [0, r4(midY), r4(-(midOut - 0.08 * s30 / 2 + 0.02 * 0))], q30(-30)),
    colliderChild('funbox_Col_2', boxCollider([slope, 0.08, 2 * baseHalf]), [r4(midOut - 0.08 * s30 / 2 + 0.02 * 0), r4(midY), 0], qz30(-30)),
    colliderChild('funbox_Col_3', boxCollider([slope, 0.08, 2 * baseHalf]), [r4(-(midOut - 0.08 * s30 / 2 + 0.02 * 0)), r4(midY), 0], qz30(30)),
    colliderChild('funbox_Col_4', boxCollider([2 * topHalf, 0.1, 2 * topHalf]), [0, H - 0.05, 0]),
  ];

  return {
    name: 'funbox',
    translation: pos,
    primitives: [
      { builder: body, material: 'concrete' },
      { builder: spine, material: 'metalTrim' },
      { builder: posts, material: 'metalTrim' },
    ],
    children: [
      ...ledges,
      { name: 'funbox_RailSpine', primitives: [] }, // marker empty at origin? no
    ].filter(() => false).concat([
      ...ledges,
      ...ledgeCols,
      colliderChild('funbox_Rail_Col_0', boxCollider([2 * railHalf, 0.05, 0.05]), [0, railY, 0], undefined, {
        grind: true,
        ledge: false,
        grindLine: line([-railHalf, railY + 0.025, 0], [railHalf, railY + 0.025, 0]),
      }),
      ...bankCols,
    ]),
  };
}

/** rail_long — 4 m straight round rail on 3 square posts, 0.35 m high. */
export function railLong(pos) {
  const railH = 0.35;
  const half = 2;
  const rail = cylinderX({ x0: -half, x1: half, r: 0.025, segments: 16, capRadius: 0.02 });
  rail.transform({ t: [0, railH, 0] });
  const posts = new MeshBuilder();
  for (const sx of [-1.85, 0, 1.85]) {
    const post = roundedBox({ size: [0.05, railH, 0.05], radius: 0.006, bevelSegments: 1 });
    post.transform({ t: [sx, railH / 2, 0] });
    posts.merge(post);
  }
  return {
    name: 'rail_long',
    translation: pos,
    primitives: [{ builder: rail, material: 'metalTrim' }, { builder: posts, material: 'metalTrim' }],
    children: [
      colliderChild('rail_long_Rail_Col_0', boxCollider([2 * half, 0.05, 0.05]), [0, railH, 0], undefined, {
        grind: true,
        ledge: false,
        grindLine: line([-half, railH + 0.025, 0], [half, railH + 0.025, 0]),
      }),
    ],
  };
}

/**
 * rail_kinked — 2 m flat segment at 0.9 m into a 2 m segment kinked 15° down
 * (stair-handrail read). Two grind colliders, one per segment.
 */
export function railKinked(pos) {
  const KINK = (15 * Math.PI) / 180;
  const yA = 0.9;
  const segLen = 2;
  const endX = segLen * Math.cos(KINK); // 1.9319
  const endY = yA - segLen * Math.sin(KINK); // 0.3824

  const segA = cylinderX({ x0: -segLen, x1: 0.02, r: 0.025, segments: 16, capRadius: 0.02 });
  segA.transform({ t: [0, yA, 0] });
  const segB = cylinderX({ x0: -0.02, x1: segLen, r: 0.025, segments: 16, capRadius: 0.02 });
  segB.transform({ q: quatAxisAngle([0, 0, 1], -KINK), t: [0, yA, 0] });

  const posts = new MeshBuilder();
  const postAt = (x, h) => {
    const p = roundedBox({ size: [0.05, h, 0.05], radius: 0.006, bevelSegments: 1 });
    p.transform({ t: [x, h / 2, 0] });
    posts.merge(p);
  };
  postAt(-1.93, yA);
  postAt(0, yA);
  postAt(1.86, yA - 1.86 * Math.tan(KINK));

  const qB = quatAxisAngle([0, 0, 1], -KINK).map(r4);
  const topOff = 0.025;
  const pB = [Math.sin(KINK), Math.cos(KINK)]; // ⊥ to segment B, upward
  return {
    name: 'rail_kinked',
    translation: pos,
    primitives: [
      { builder: segA, material: 'metalTrim' },
      { builder: segB, material: 'metalTrim' },
      { builder: posts, material: 'metalTrim' },
    ],
    children: [
      colliderChild('rail_kinked_Rail_Col_0', boxCollider([segLen, 0.05, 0.05]), [-segLen / 2, yA, 0], undefined, {
        grind: true,
        ledge: false,
        grindLine: line([-segLen, yA + topOff, 0], [0, yA + topOff, 0]),
      }),
      colliderChild(
        'rail_kinked_Rail_Col_1',
        boxCollider([segLen, 0.05, 0.05]),
        [r4(endX / 2), r4((yA + endY) / 2), 0],
        qB,
        {
          grind: true,
          ledge: false,
          grindLine: line([pB[0] * topOff, yA + pB[1] * topOff, 0], [endX + pB[0] * topOff, endY + pB[1] * topOff, 0]),
        },
      ),
    ],
  };
}

/**
 * stairs_with_handrail — the THPS icon: the kit's 5-stair geometry plus a
 * round handrail beside it, 0.85 m above the nosing diagonal, on 3 square
 * posts. Steps descend toward +z (kit stairs convention); rail beside at
 * x = +1.08 (steps span x ±1).
 */
export function stairsWithHandrail(pos) {
  const nSteps = 5;
  const riser = 0.17;
  const tread = 0.3;
  const width = 2;
  const depth = nSteps * tread; // 1.5
  const H = nSteps * riser; // 0.85

  // Steps (same construction as the kit's stairs()).
  const poly = [[0, 0]];
  let x = 0;
  let y = 0;
  for (let i = 0; i < nSteps; i++) {
    y += riser;
    poly.push([x, y]);
    x += tread;
    poly.push([x, y]);
  }
  poly.push([depth, 0]);
  const steps = extrudeProfile({ profile: poly, length: width });
  steps.transform({ q: QY });
  const wedge = extrudeProfile({ profile: [[0, 0], [depth, 0], [depth, H]], length: width });
  wedge.transform({ q: QY });

  // Handrail along the diagonal (bottom nosing (z=0, y=0) → top (z=−1.5, y=0.85)),
  // 0.85 m above it, overrun 13% past each end.
  const railX = 1.08;
  const slope = Math.atan2(H, depth); // 29.54°
  const dir = vec3.normalize([0, H, -depth]); // (0, 0.4930, −0.8703)
  const t0 = -0.13;
  const t1 = 1.13;
  const p0 = [railX, H + t0 * H, t0 * -depth].map((v, i) => (i === 1 ? 0.85 + t0 * H : v)); // see below
  // Axis endpoints: P(t) = (railX, 0.85 + t·H − wait, use explicit form:
  const axisAt = (t) => [railX, 0.85 + t * H * 0 + (0.85 * 0), 0]; // placeholder
  const A = [railX, 0.85 + t0 * H, -(t0 * depth)];
  const B = [railX, 0.85 + t1 * H, -(t1 * depth)];
  const railLen = Math.hypot(B[1] - A[1], B[2] - A[2]);
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
  // Quat mapping +X → dir: quarter-turn Y (X→−Z), then tilt about X by slope.
  const qRail = quatMul(quatAxisAngle([1, 0, 0], slope), QY).map(r4);

  const rail = cylinderX({ x0: -railLen / 2, x1: railLen / 2, r: 0.025, segments: 16, capRadius: 0.02 });
  rail.transform({ q: qRail, t: mid });

  const posts = new MeshBuilder();
  const stepTopAt = (z) => (z >= 0 ? 0 : riser * Math.min(nSteps, Math.ceil(-z / tread)));
  for (const pz of [0.12, -0.75, -1.45]) {
    const base = stepTopAt(pz);
    const railYHere = 0.85 + (-pz / depth) * H;
    const h = railYHere - base;
    const post = roundedBox({ size: [0.05, h, 0.05], radius: 0.006, bevelSegments: 1 });
    post.transform({ t: [railX, base + h / 2, pz] });
    posts.merge(post);
  }

  // Grind line: top of the pipe (axis + 0.025 along the upward perpendicular).
  const perp = vec3.normalize(vec3.cross(dir, [1, 0, 0])); // (0, −0.87, −0.49)?
  const up = perp[1] > 0 ? perp : vec3.scale(perp, -1);
  const gA = vec3.add(A, vec3.scale(up, 0.025));
  const gB = vec3.add(B, vec3.scale(up, 0.025));

  return {
    name: 'stairs_with_handrail',
    translation: pos,
    primitives: [
      { builder: steps, material: 'concrete' },
      { builder: rail, material: 'metalTrim' },
      { builder: posts, material: 'metalTrim' },
    ],
    children: [
      colliderChild('stairs_with_handrail_Col_0', wedge),
      colliderChild('stairs_with_handrail_Handrail_Col_0', boxCollider([railLen, 0.05, 0.05]), mid.map(r4), qRail, {
        grind: true,
        ledge: false,
        grindLine: line(gA, gB),
      }),
    ],
  };
}

/** All park pieces on the library layout grid (clear of the existing rows). */
export function parkNodeSpecs() {
  return [
    halfpipeMini([4, 0, 22]),
    qpWall([12, 0, 18]),
    kicker('kicker', [16, 0, 17], { length: 1.2, height: 0.35, width: 1.5 }),
    kicker('kicker_big', [19.5, 0, 17], { length: 2, height: 0.6, width: 2 }),
    funbox([17, 0, 22.5]),
    railLong([22, 0, 20]),
    railKinked([22, 0, 25]),
    stairsWithHandrail([12, 0, 25]),
  ];
}
