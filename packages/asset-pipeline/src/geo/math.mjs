// Minimal, dependency-free vector / quaternion helpers for the authoring
// pipeline. We deliberately do NOT import three (per M8a constraints) — the
// geometry toolkit owns its own math so the package stays lean.

/** @typedef {[number, number, number]} Vec3 */

export const vec3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  length: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]);
    if (l < 1e-12) return [0, 0, 0];
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

/**
 * Quaternion from axis (unit) + angle (radians). Returned as [x,y,z,w] to
 * match glTF node rotation ordering.
 * @param {Vec3} axis
 * @param {number} angle
 * @returns {[number,number,number,number]}
 */
export function quatAxisAngle(axis, angle) {
  const [x, y, z] = vec3.normalize(axis);
  const h = angle * 0.5;
  const s = Math.sin(h);
  return [x * s, y * s, z * s, Math.cos(h)];
}

/**
 * Rotate a vector by a quaternion [x,y,z,w].
 * @param {[number,number,number,number]} q
 * @param {Vec3} v
 * @returns {Vec3}
 */
export function quatRotate(q, v) {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  // v + qw * t + cross(q.xyz, t)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Multiply two quaternions (a then b applied) → a*b. */
export function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Smoothstep 0..1 with hermite easing. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic pseudo-random generator (mulberry32). Seeded so every run
 * produces identical texture / jitter output — no bare Math.random anywhere.
 * @param {number} seed
 * @returns {() => number} function returning [0,1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 2D value noise with bilinear interpolation over a seeded integer lattice.
 * Deterministic; used for grit / grain textures. Returns [0,1].
 */
export function makeValueNoise(seed, gridSize = 256) {
  const rand = mulberry32(seed);
  const lattice = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const at = (ix, iy) => {
    const x = ((ix % gridSize) + gridSize) % gridSize;
    const y = ((iy % gridSize) + gridSize) % gridSize;
    return lattice[y * gridSize + x];
  };
  return (fx, fy) => {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    const top = a + (b - a) * sx;
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
}

/** Fractal Brownian motion over value noise, octaves summed. */
export function makeFbm(seed, octaves = 4, gridSize = 256) {
  const noise = makeValueNoise(seed, gridSize);
  return (x, y) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}
