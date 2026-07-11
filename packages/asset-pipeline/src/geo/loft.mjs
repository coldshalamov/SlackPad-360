// Loft builder: connect a sequence of closed cross-section rings (each an
// ordered loop of 3D points with the SAME vertex count) into a tube-like
// surface, with optional end caps. Used for the shoe sole + upper. Normals are
// computed smooth from ring neighbours via recomputeNormals with a crease
// angle so the toe/heel curvature stays soft while the sole/upper seam can be
// crisp.

import { MeshBuilder } from './mesh.mjs';
import { vec3 } from './math.mjs';

/**
 * @param {object} o
 * @param {number[][][]} o.rings  array of rings; each ring is array of [x,y,z]
 * @param {boolean} [o.capStart]
 * @param {boolean} [o.capEnd]
 * @param {number} [o.creaseDeg]
 * @returns {MeshBuilder}
 */
export function loft({ rings, capStart = true, capEnd = true, creaseDeg = 55 }) {
  const mb = new MeshBuilder();
  const R = rings.length;
  const N = rings[0].length;
  const idx = [];
  for (let i = 0; i < R; i++) {
    const row = [];
    for (let j = 0; j < N; j++) {
      const p = rings[i][j];
      // provisional normal (fixed by recompute); uv follows ring param
      row.push(mb.vertex(p[0], p[1], p[2], 0, 1, 0, j / N, i / (R - 1)));
    }
    idx.push(row);
  }
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = idx[i][j];
      const b = idx[i][(j + 1) % N];
      const c = idx[i + 1][(j + 1) % N];
      const d = idx[i + 1][j];
      mb.quad(a, b, c, d);
    }
  }
  const capFan = (ring3D, ringIdx, outward) => {
    const c = [0, 0, 0];
    for (const p of ring3D) {
      c[0] += p[0] / N;
      c[1] += p[1] / N;
      c[2] += p[2] / N;
    }
    const ci = mb.vertex(c[0], c[1], c[2], outward[0], outward[1], outward[2], 0.5, 0.5);
    for (let j = 0; j < N; j++) {
      const a = ringIdx[j];
      const b = ringIdx[(j + 1) % N];
      // winding chosen by outward dot; recomputeNormals fixes shading anyway
      mb.tri(ci, a, b);
    }
  };
  if (capStart) {
    const dir = vec3.normalize(vec3.sub(centroid(rings[0]), centroid(rings[1])));
    capFan(rings[0], idx[0], dir);
  }
  if (capEnd) {
    const dir = vec3.normalize(vec3.sub(centroid(rings[R - 1]), centroid(rings[R - 2])));
    capFan(rings[R - 1], idx[R - 1], dir);
  }
  mb.recomputeNormals(creaseDeg);
  return mb;
}

function centroid(ring) {
  const c = [0, 0, 0];
  for (const p of ring) {
    c[0] += p[0] / ring.length;
    c[1] += p[1] / ring.length;
    c[2] += p[2] / ring.length;
  }
  return c;
}

/**
 * Helper: build a closed superellipse ring in a local X/Y plane, offset to a
 * given z, scaled by (rx, ry) with a squareness exponent. `n` points, CCW.
 */
export function superellipseRing({ n, rx, ry, z, exponent = 2, cx = 0, cy = 0 }) {
  const ring = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x = cx + Math.sign(ca) * Math.pow(Math.abs(ca), 2 / exponent) * rx;
    const y = cy + Math.sign(sa) * Math.pow(Math.abs(sa), 2 / exponent) * ry;
    ring.push([x, y, z]);
  }
  return ring;
}
