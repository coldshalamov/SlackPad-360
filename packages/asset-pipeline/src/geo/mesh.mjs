// Mesh core: an indexed triangle mesh builder producing flat
// positions/normals/uvs/indices arrays, plus assembly, transform, normal
// recomputation (smooth with crease angle) and reporting utilities.

import { vec3, quatRotate } from './math.mjs';

export class MeshBuilder {
  constructor() {
    /** @type {number[]} */ this.positions = [];
    /** @type {number[]} */ this.normals = [];
    /** @type {number[]} */ this.uvs = [];
    /** @type {number[]} */ this.indices = [];
  }

  /** Append one vertex, returns its index. */
  vertex(px, py, pz, nx, ny, nz, u, v) {
    const i = this.positions.length / 3;
    this.positions.push(px, py, pz);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    return i;
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  /** Quad as two triangles with consistent CCW winding a-b-c-d. */
  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  triCount() {
    return this.indices.length / 3;
  }

  vertexCount() {
    return this.positions.length / 3;
  }

  /**
   * Merge another builder's geometry into this one, offsetting indices.
   * @param {MeshBuilder} other
   */
  merge(other) {
    const base = this.vertexCount();
    for (let i = 0; i < other.positions.length; i++) this.positions.push(other.positions[i]);
    for (let i = 0; i < other.normals.length; i++) this.normals.push(other.normals[i]);
    for (let i = 0; i < other.uvs.length; i++) this.uvs.push(other.uvs[i]);
    for (let i = 0; i < other.indices.length; i++) this.indices.push(other.indices[i] + base);
    return this;
  }

  /**
   * Apply a translate/rotate(quat [x,y,z,w])/scale transform in place.
   * Scale is uniform-or-per-axis; normals are rotated (assumes ~uniform scale
   * for the parts we use it on — trucks/wheels — which is true here).
   * @param {{t?:number[], q?:number[], s?:number|number[]}} trs
   */
  transform({ t = [0, 0, 0], q = [0, 0, 0, 1], s = 1 } = {}) {
    const sx = Array.isArray(s) ? s[0] : s;
    const sy = Array.isArray(s) ? s[1] : s;
    const sz = Array.isArray(s) ? s[2] : s;
    for (let i = 0; i < this.positions.length; i += 3) {
      let p = [this.positions[i] * sx, this.positions[i + 1] * sy, this.positions[i + 2] * sz];
      p = quatRotate(q, p);
      this.positions[i] = p[0] + t[0];
      this.positions[i + 1] = p[1] + t[1];
      this.positions[i + 2] = p[2] + t[2];
      let n = [this.normals[i], this.normals[i + 1], this.normals[i + 2]];
      // Non-uniform scale would need inverse-transpose; our part scales are
      // uniform, so rotate + renormalize is exact.
      n = vec3.normalize(quatRotate(q, n));
      this.normals[i] = n[0];
      this.normals[i + 1] = n[1];
      this.normals[i + 2] = n[2];
    }
    return this;
  }

  /** Axis-aligned bounds of current geometry. */
  bounds() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = this.positions[i + a];
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
    return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
  }

  /**
   * Recompute smooth vertex normals with a crease angle: triangles sharing a
   * position whose face normals are within `creaseDeg` of each other are
   * averaged (smooth); sharper joins are split into duplicate vertices (hard
   * edge). Rebuilds positions/normals/uvs/indices. UVs are carried per source
   * vertex. Use for parts where analytic normals are awkward (rounded box,
   * lofted shoe, truck hanger).
   * @param {number} creaseDeg
   */
  recomputeNormals(creaseDeg = 40) {
    const cosThresh = Math.cos((creaseDeg * Math.PI) / 180);
    const triCount = this.indices.length / 3;
    // Face normals.
    const faceN = new Array(triCount);
    for (let f = 0; f < triCount; f++) {
      const ia = this.indices[f * 3] * 3;
      const ib = this.indices[f * 3 + 1] * 3;
      const ic = this.indices[f * 3 + 2] * 3;
      const pa = [this.positions[ia], this.positions[ia + 1], this.positions[ia + 2]];
      const pb = [this.positions[ib], this.positions[ib + 1], this.positions[ib + 2]];
      const pc = [this.positions[ic], this.positions[ic + 1], this.positions[ic + 2]];
      faceN[f] = vec3.normalize(vec3.cross(vec3.sub(pb, pa), vec3.sub(pc, pa)));
    }
    // Group triangle-corners by quantized position.
    const key = (i) => {
      const q = (x) => Math.round(x * 1e5);
      return `${q(this.positions[i * 3])},${q(this.positions[i * 3 + 1])},${q(this.positions[i * 3 + 2])}`;
    };
    /** @type {Map<string, {face:number, corner:number}[]>} */
    const groups = new Map();
    for (let f = 0; f < triCount; f++) {
      for (let c = 0; c < 3; c++) {
        const vi = this.indices[f * 3 + c];
        const k = key(vi);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push({ face: f, corner: c, vi });
      }
    }
    const out = new MeshBuilder();
    // Map from (face,corner) → new vertex index.
    const remap = new Map();
    for (const [, corners] of groups) {
      // Cluster corners by face-normal similarity (smoothing groups).
      /** @type {{normal:number[], members:any[]}[]} */
      const clusters = [];
      for (const corner of corners) {
        const fn = faceN[corner.face];
        let placed = false;
        for (const cl of clusters) {
          if (vec3.dot(cl.normal, fn) >= cosThresh) {
            cl.members.push(corner);
            cl.normal = vec3.normalize(vec3.add(cl.normal, fn));
            placed = true;
            break;
          }
        }
        if (!placed) clusters.push({ normal: [...fn], members: [corner] });
      }
      for (const cl of clusters) {
        // Average unnormalized face normals (area-agnostic but stable).
        let acc = [0, 0, 0];
        for (const m of cl.members) acc = vec3.add(acc, faceN[m.face]);
        const n = vec3.normalize(acc);
        for (const m of cl.members) {
          const vi = m.vi;
          const nvi = out.vertex(
            this.positions[vi * 3],
            this.positions[vi * 3 + 1],
            this.positions[vi * 3 + 2],
            n[0], n[1], n[2],
            this.uvs[vi * 2], this.uvs[vi * 2 + 1],
          );
          remap.set(`${m.face}:${m.corner}`, nvi);
        }
      }
    }
    for (let f = 0; f < triCount; f++) {
      out.tri(
        remap.get(`${f}:0`),
        remap.get(`${f}:1`),
        remap.get(`${f}:2`),
      );
    }
    this.positions = out.positions;
    this.normals = out.normals;
    this.uvs = out.uvs;
    this.indices = out.indices;
    return this;
  }

  /** Typed-array view for glTF accessors. Uint16 indices when possible. */
  toTypedArrays() {
    const vcount = this.vertexCount();
    const IndexArray = vcount > 65535 ? Uint32Array : Uint16Array;
    return {
      position: Float32Array.from(this.positions),
      normal: Float32Array.from(this.normals),
      texcoord: Float32Array.from(this.uvs),
      indices: IndexArray.from(this.indices),
    };
  }
}
