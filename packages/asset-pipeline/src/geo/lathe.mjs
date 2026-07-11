// Lathe / surface-of-revolution builder. Revolves a 2D profile (points in the
// axial–radial plane) around the local X axis. Used for wheels (rounded
// urethane tread + hub recess bore) and cylindrical rail / coping / kingpin /
// axle parts. Normals derived from the profile tangent, revolved.

import { MeshBuilder } from './mesh.mjs';
import { vec3 } from './math.mjs';

/**
 * @param {object} o
 * @param {{x:number, r:number}[]} o.profile ordered contour points; revolve about X
 * @param {number} [o.segments] radial subdivisions
 * @param {boolean} [o.closed] treat profile as a closed loop (connect last→first)
 * @param {number} [o.uScale] u tiling
 * @returns {MeshBuilder}
 */
export function lathe({ profile, segments = 24, closed = false, uScale = 1 }) {
  const mb = new MeshBuilder();
  const seg = Math.max(3, segments | 0);
  const n = profile.length;
  const count = closed ? n : n - 1;

  // Profile-space normals (perpendicular to local tangent, pointing "outward"
  // in +r). For a contour traced CCW in (x,r) the outward normal is
  // (dr, -dx)-ish; we compute per-vertex averaged tangents.
  const pnorm = [];
  for (let i = 0; i < n; i++) {
    const prev = profile[(i - 1 + n) % n];
    const next = profile[(i + 1) % n];
    let dx, dr;
    if (closed) {
      dx = next.x - prev.x;
      dr = next.r - prev.r;
    } else {
      const a = i === 0 ? profile[i] : prev;
      const b = i === n - 1 ? profile[i] : next;
      dx = b.x - a.x;
      dr = b.r - a.r;
    }
    // normal in (x,r): rotate tangent (dx,dr) by -90° → (dr,-dx)
    let nx = dr;
    let nr = -dx;
    const len = Math.hypot(nx, nr) || 1;
    pnorm.push({ nx: nx / len, nr: nr / len });
  }

  // Build ring vertices.
  const rings = [];
  for (let i = 0; i < n; i++) {
    const p = profile[i];
    const pn = pnorm[i];
    const row = [];
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const y = p.r * ca;
      const z = p.r * sa;
      // revolve the profile normal: radial component spun around X
      let nrm = [pn.nx, pn.nr * ca, pn.nr * sa];
      nrm = vec3.normalize(nrm);
      const u = (s / seg) * uScale;
      const v = i / (n - 1);
      row.push(mb.vertex(p.x, y, z, ...nrm, u, v));
    }
    rings.push(row);
  }

  for (let i = 0; i < count; i++) {
    const a = rings[i];
    const b = rings[(i + 1) % n];
    for (let s = 0; s < seg; s++) {
      mb.quad(a[s], a[s + 1], b[s + 1], b[s]);
    }
  }
  return mb;
}

/**
 * Convenience: a capped cylinder along X from x0..x1 at radius `r`. Rounded
 * end option adds a small fillet. Used for axles, kingpins, rail tubes, posts.
 */
export function cylinderX({ x0, x1, r, segments = 20, capRadius = 0 }) {
  const cr = Math.min(capRadius, r * 0.9, Math.abs(x1 - x0) * 0.45);
  /** @type {{x:number,r:number}[]} */
  const profile = [];
  profile.push({ x: x0, r: 0 });
  if (cr > 0) {
    profile.push({ x: x0, r: r - cr });
    const steps = 4;
    for (let k = 1; k <= steps; k++) {
      const a = (k / steps) * (Math.PI / 2);
      profile.push({ x: x0 + cr * (1 - Math.cos(a)), r: (r - cr) + cr * Math.sin(a) });
    }
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * (Math.PI / 2);
      profile.push({ x: x1 - cr * (1 - Math.cos(a)), r: r - cr + cr * Math.cos(a) });
    }
    profile.push({ x: x1, r: r - cr });
  } else {
    profile.push({ x: x0, r });
    profile.push({ x: x1, r });
  }
  profile.push({ x: x1, r: 0 });
  return lathe({ profile, segments, closed: false });
}
