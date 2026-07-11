// Rounded / beveled box builder. Exact Minkowski-style construction:
//  * 6 flat faces inset by the corner radius,
//  * 12 quarter-cylinder edge fillets,
//  * 8 spherical corner octants.
// Flat faces keep face normals (crisp), fillets/corners get radial normals
// (smooth rounding). `bevelSegments` subdivides each arc. UVs are box-planar.

import { MeshBuilder } from './mesh.mjs';

/**
 * @param {object} o
 * @param {[number,number,number]} o.size  full width/height/depth (x,y,z), m
 * @param {number} [o.radius] corner radius, m (clamped to < half-min-extent)
 * @param {number} [o.bevelSegments] arc subdivisions per 90° (>=1)
 * @param {number} [o.uvScale] texels-per-metre style UV scale
 * @returns {MeshBuilder}
 */
export function roundedBox({ size, radius = 0.01, bevelSegments = 3, uvScale = 1 }) {
  const hx = size[0] / 2;
  const hy = size[1] / 2;
  const hz = size[2] / 2;
  const r = Math.min(radius, hx * 0.999, hy * 0.999, hz * 0.999);
  const ix = hx - r;
  const iy = hy - r;
  const iz = hz - r;
  const mb = new MeshBuilder();
  const seg = Math.max(1, bevelSegments | 0);

  const uv = (a, b) => [a * uvScale, b * uvScale];

  // --- 6 flat faces -------------------------------------------------------
  // Each face: outward normal, and two in-plane axes spanning the inner rect.
  const faces = [
    { n: [1, 0, 0], o: [hx, 0, 0], u: [0, 0, iz], v: [0, iy, 0] },
    { n: [-1, 0, 0], o: [-hx, 0, 0], u: [0, 0, -iz], v: [0, iy, 0] },
    { n: [0, 1, 0], o: [0, hy, 0], u: [ix, 0, 0], v: [0, 0, iz] },
    { n: [0, -1, 0], o: [0, -hy, 0], u: [ix, 0, 0], v: [0, 0, -iz] },
    { n: [0, 0, 1], o: [0, 0, hz], u: [ix, 0, 0], v: [0, iy, 0] },
    { n: [0, 0, -1], o: [0, 0, -hz], u: [-ix, 0, 0], v: [0, iy, 0] },
  ];
  for (const f of faces) {
    const c = f.o;
    const a = mb.vertex(c[0] - f.u[0] - f.v[0], c[1] - f.u[1] - f.v[1], c[2] - f.u[2] - f.v[2], ...f.n, ...uv(0, 0));
    const b = mb.vertex(c[0] + f.u[0] - f.v[0], c[1] + f.u[1] - f.v[1], c[2] + f.u[2] - f.v[2], ...f.n, ...uv(1, 0));
    const d = mb.vertex(c[0] + f.u[0] + f.v[0], c[1] + f.u[1] + f.v[1], c[2] + f.u[2] + f.v[2], ...f.n, ...uv(1, 1));
    const e = mb.vertex(c[0] - f.u[0] + f.v[0], c[1] - f.u[1] + f.v[1], c[2] - f.u[2] + f.v[2], ...f.n, ...uv(0, 1));
    mb.quad(a, b, d, e);
  }

  // --- 12 edge fillets (quarter cylinders) --------------------------------
  // Each edge is defined by: axis it runs along, the fixed inner-corner
  // position on the other two axes, and the two unit directions the arc sweeps
  // between. sx/sy are the signs of the two rounded axes.
  const A = { x: 0, y: 1, z: 2 };
  const axisDir = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  /** helper to add a quarter cylinder along `along` axis, centered at c, sweeping dir0→dir1 */
  const fillet = (along, cA, cB, cC, dir0, dir1) => {
    const alongVec = axisDir[along];
    const halfLen = along === A.x ? ix : along === A.y ? iy : iz;
    const center = [0, 0, 0];
    center[(along + 1) % 3] = cB;
    center[(along + 2) % 3] = cC;
    // reconstruct center coordinate on each axis from the two rounded axes
    // (cB corresponds to axis (along+1)%3, cC to (along+2)%3)
    const ring0 = [];
    const ring1 = [];
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const ang = (t * Math.PI) / 2;
      const n = [
        dir0[0] * Math.cos(ang) + dir1[0] * Math.sin(ang),
        dir0[1] * Math.cos(ang) + dir1[1] * Math.sin(ang),
        dir0[2] * Math.cos(ang) + dir1[2] * Math.sin(ang),
      ];
      const p0 = [
        center[0] + n[0] * r - alongVec[0] * halfLen,
        center[1] + n[1] * r - alongVec[1] * halfLen,
        center[2] + n[2] * r - alongVec[2] * halfLen,
      ];
      const p1 = [
        center[0] + n[0] * r + alongVec[0] * halfLen,
        center[1] + n[1] * r + alongVec[1] * halfLen,
        center[2] + n[2] * r + alongVec[2] * halfLen,
      ];
      ring0.push(mb.vertex(...p0, ...n, ...uv(t, 0)));
      ring1.push(mb.vertex(...p1, ...n, ...uv(t, 1)));
    }
    for (let s = 0; s < seg; s++) {
      mb.quad(ring0[s], ring0[s + 1], ring1[s + 1], ring1[s]);
    }
  };

  // 4 edges along X (rounded in Y,Z). center at (·, ±iy, ±iz)
  fillet(A.x, ix, iy, iz, [0, 1, 0], [0, 0, 1]);
  fillet(A.x, ix, iy, -iz, [0, 0, -1], [0, 1, 0]);
  fillet(A.x, ix, -iy, iz, [0, 0, 1], [0, -1, 0]);
  fillet(A.x, ix, -iy, -iz, [0, -1, 0], [0, 0, -1]);
  // 4 edges along Y (rounded in Z,X). center at (±ix, ·, ±iz)
  fillet(A.y, iy, iz, ix, [0, 0, 1], [1, 0, 0]);
  fillet(A.y, iy, -iz, ix, [1, 0, 0], [0, 0, -1]);
  fillet(A.y, iy, iz, -ix, [-1, 0, 0], [0, 0, 1]);
  fillet(A.y, iy, -iz, -ix, [0, 0, -1], [-1, 0, 0]);
  // 4 edges along Z (rounded in X,Y). center at (±ix, ±iy, ·)
  fillet(A.z, iz, ix, iy, [1, 0, 0], [0, 1, 0]);
  fillet(A.z, iz, -ix, iy, [0, 1, 0], [-1, 0, 0]);
  fillet(A.z, iz, ix, -iy, [0, -1, 0], [1, 0, 0]);
  fillet(A.z, iz, -ix, -iy, [-1, 0, 0], [0, -1, 0]);

  // --- 8 spherical corner octants -----------------------------------------
  const corner = (sx, sy, sz) => {
    const cc = [sx * ix, sy * iy, sz * iz];
    const rings = [];
    for (let i = 0; i <= seg; i++) {
      const phi = (i / seg) * (Math.PI / 2); // polar from the axis
      const row = [];
      for (let j = 0; j <= seg; j++) {
        const theta = (j / seg) * (Math.PI / 2);
        // local octant direction (all positive), then apply corner signs
        const lx = Math.sin(phi) * Math.cos(theta);
        const ly = Math.cos(phi);
        const lz = Math.sin(phi) * Math.sin(theta);
        const n = [sx * lx, sy * ly, sz * lz];
        const p = [cc[0] + n[0] * r, cc[1] + n[1] * r, cc[2] + n[2] * r];
        row.push(mb.vertex(...p, ...n, ...uv(j / seg, i / seg)));
      }
      rings.push(row);
    }
    // winding depends on sign parity so normals face outward
    const flip = sx * sy * sz < 0;
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg; j++) {
        const a = rings[i][j];
        const b = rings[i][j + 1];
        const c = rings[i + 1][j + 1];
        const d = rings[i + 1][j];
        if (flip) mb.quad(a, d, c, b);
        else mb.quad(a, b, c, d);
      }
    }
  };
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) corner(sx, sy, sz);

  return mb;
}
