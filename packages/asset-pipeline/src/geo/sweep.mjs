// Swept / extruded builders.
//  * gridSurface: a parametric (rows × cols) surface from a point function,
//    with smooth normals averaged from grid faces. This is the engine behind
//    the concave, kicked, rounded-outline deck (top / bottom / grip sheets).
//  * extrudeProfile: sweep a closed 2D cross-section along a straight path —
//    used for plaza wedges / banks / prisms.

import { MeshBuilder } from './mesh.mjs';
import { vec3 } from './math.mjs';

/**
 * Build a grid surface. `pointFn(i, j, u, v)` returns [x,y,z] for grid node
 * (i in 0..rows, j in 0..cols; u,v normalized 0..1). Normals are computed from
 * neighbouring grid positions (smooth). Winding is CCW seen from +normal when
 * flip=false.
 * @returns {MeshBuilder}
 */
export function gridSurface({ rows, cols, pointFn, flip = false, uvFn }) {
  const P = [];
  for (let i = 0; i <= rows; i++) {
    const rowP = [];
    for (let j = 0; j <= cols; j++) {
      rowP.push(pointFn(i, j, i / rows, j / cols));
    }
    P.push(rowP);
  }
  // Grid normals via central differences of positions.
  const N = [];
  for (let i = 0; i <= rows; i++) {
    const rowN = [];
    for (let j = 0; j <= cols; j++) {
      const im = P[Math.max(0, i - 1)][j];
      const ip = P[Math.min(rows, i + 1)][j];
      const jm = P[i][Math.max(0, j - 1)];
      const jp = P[i][Math.min(cols, j + 1)];
      const du = vec3.sub(ip, im);
      const dv = vec3.sub(jp, jm);
      let n = vec3.normalize(vec3.cross(du, dv));
      if (flip) n = vec3.scale(n, -1);
      rowN.push(n);
    }
    N.push(rowN);
  }
  const mb = new MeshBuilder();
  const idx = [];
  for (let i = 0; i <= rows; i++) {
    const row = [];
    for (let j = 0; j <= cols; j++) {
      const p = P[i][j];
      const n = N[i][j];
      const uv = uvFn ? uvFn(i / rows, j / cols) : [i / rows, j / cols];
      row.push(mb.vertex(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1]));
    }
    idx.push(row);
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = idx[i][j];
      const b = idx[i][j + 1];
      const c = idx[i + 1][j + 1];
      const d = idx[i + 1][j];
      if (flip) mb.quad(a, d, c, b);
      else mb.quad(a, b, c, d);
    }
  }
  return mb;
}

/**
 * Extrude a closed 2D profile (points in the local X/Y plane) along +Z for
 * `length`, producing side walls + two end caps. Profile is a list of
 * [x, y]; assumed CCW so caps face outward. Used for plaza banks / wedges /
 * prisms.
 * @returns {MeshBuilder}
 */
export function extrudeProfile({ profile, length, capStart = true, capEnd = true, uvScale = 1 }) {
  const mb = new MeshBuilder();
  const n = profile.length;
  const z0 = -length / 2;
  const z1 = length / 2;

  // Side walls: for each edge, a quad with an outward normal.
  for (let i = 0; i < n; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % n];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1;
    // outward normal for CCW polygon: (ey, -ex) normalized... for CCW the
    // outward normal of edge a→b is (dy, -dx)? CCW interior on left → outward
    // is (dy, -dx) rotated: use (ey, -ex)/len points outward for CW; for CCW
    // outward is (ey,-ex) negated. We normalise sign via polygon area below.
    const nx = ey / len;
    const ny = -ex / len;
    const v0 = mb.vertex(a[0], a[1], z0, nx, ny, 0, 0, 0);
    const v1 = mb.vertex(b[0], b[1], z0, nx, ny, 0, 1, 0);
    const v2 = mb.vertex(b[0], b[1], z1, nx, ny, 0, 1, uvScale);
    const v3 = mb.vertex(a[0], a[1], z1, nx, ny, 0, 0, uvScale);
    mb.quad(v0, v1, v2, v3);
  }

  const addCap = (z, nz) => {
    // Fan triangulation from vertex 0 (profiles are convex enough for our use).
    const center = [0, 0];
    for (const p of profile) {
      center[0] += p[0] / n;
      center[1] += p[1] / n;
    }
    const cIdx = mb.vertex(center[0], center[1], z, 0, 0, nz, 0.5, 0.5);
    const ring = profile.map((p) =>
      mb.vertex(p[0], p[1], z, 0, 0, nz, 0.5 + p[0] * uvScale, 0.5 + p[1] * uvScale),
    );
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      if (nz > 0) mb.tri(cIdx, a, b);
      else mb.tri(cIdx, b, a);
    }
  };
  if (capStart) addCap(z0, -1);
  if (capEnd) addCap(z1, 1);

  // Fix winding sign of side walls if polygon is CW (compute signed area).
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) {
    // CW polygon → our side normals & winding are inverted; flip normals.
    for (let i = 0; i < mb.normals.length; i++) mb.normals[i] *= -1;
    for (let t = 0; t < mb.indices.length; t += 3) {
      const tmp = mb.indices[t + 1];
      mb.indices[t + 1] = mb.indices[t + 2];
      mb.indices[t + 2] = tmp;
    }
  }
  return mb;
}
