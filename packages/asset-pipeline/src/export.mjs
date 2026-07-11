// Export layer: assemble a @gltf-transform Document from geometry builders +
// material specs + node specs, and write a raw GLB. Deterministic: fixed
// generator string, no timestamps, stable buffer ordering. Textures are cached
// by source path and embedded as raw bytes.

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const GENERATOR = 'SlackPad360-asset-pipeline';

/** A NodeIO wired with all extensions + meshopt codec (read & write). */
export async function makeIO() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  return io;
}

const REPEAT = 10497;

/**
 * @typedef {object} MaterialSpec
 * @property {[number,number,number,number]} [baseColorFactor]
 * @property {number} [metallic]
 * @property {number} [roughness]
 * @property {string} [baseColorTexture]  absolute path to sRGB image
 * @property {string} [normalTexture]     absolute path to linear normal (GL)
 * @property {string} [metallicRoughnessTexture] absolute path (G=rough,B=metal)
 * @property {string} [occlusionTexture]  absolute path (R=AO)
 * @property {number} [normalScale]
 * @property {boolean} [doubleSided]
 * @property {[number,number]} [uvScale]  (informational; UVs baked in geometry)
 */

/**
 * @typedef {object} PrimitiveSpec
 * @property {import('./geo/mesh.mjs').MeshBuilder} builder
 * @property {string} material  material key
 */

/**
 * @typedef {object} NodeSpec
 * @property {string} name
 * @property {PrimitiveSpec[]} [primitives]  omit for empty (socket) nodes
 * @property {[number,number,number]} [translation]
 * @property {[number,number,number,number]} [rotation]
 * @property {[number,number,number]} [scale]
 * @property {Record<string, unknown>} [extras]
 */

/**
 * Build a Document from material + node specs.
 * @param {object} o
 * @param {Record<string, MaterialSpec>} o.materials
 * @param {NodeSpec[]} o.nodes
 * @param {string} o.sceneName
 * @returns {Document}
 */
export function buildDocument({ materials, nodes, sceneName }) {
  const doc = new Document();
  doc.getRoot().getAsset().generator = GENERATOR;
  const buffer = doc.createBuffer();
  const scene = doc.createScene(sceneName);

  /** @type {Map<string, import('@gltf-transform/core').Texture>} */
  const texCache = new Map();
  const getTexture = (absPath) => {
    if (texCache.has(absPath)) return texCache.get(absPath);
    const bytes = fs.readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    const tex = doc
      .createTexture(path.basename(absPath))
      .setImage(new Uint8Array(bytes))
      .setMimeType(mime);
    texCache.set(absPath, tex);
    return tex;
  };

  /** @type {Map<string, import('@gltf-transform/core').Material>} */
  const matObjs = new Map();
  for (const [key, spec] of Object.entries(materials)) {
    const m = doc.createMaterial(key);
    m.setBaseColorFactor(spec.baseColorFactor ?? [0.8, 0.8, 0.8, 1]);
    m.setMetallicFactor(spec.metallic ?? 0);
    m.setRoughnessFactor(spec.roughness ?? 0.8);
    m.setDoubleSided(!!spec.doubleSided);
    if (spec.baseColorTexture) {
      m.setBaseColorTexture(getTexture(spec.baseColorTexture));
      const info = m.getBaseColorTextureInfo();
      info.setWrapS(REPEAT).setWrapT(REPEAT);
    }
    if (spec.metallicRoughnessTexture) {
      m.setMetallicRoughnessTexture(getTexture(spec.metallicRoughnessTexture));
      m.getMetallicRoughnessTextureInfo().setWrapS(REPEAT).setWrapT(REPEAT);
    }
    if (spec.normalTexture) {
      m.setNormalTexture(getTexture(spec.normalTexture));
      m.getNormalTextureInfo().setWrapS(REPEAT).setWrapT(REPEAT);
      if (spec.normalScale != null) m.setNormalScale(spec.normalScale);
    }
    if (spec.occlusionTexture) {
      m.setOcclusionTexture(getTexture(spec.occlusionTexture));
      m.getOcclusionTextureInfo().setWrapS(REPEAT).setWrapT(REPEAT);
    }
    matObjs.set(key, m);
  }

  const makePrimitive = (builder, matKey) => {
    const { position, normal, texcoord, indices } = builder.toTypedArrays();
    const pos = doc.createAccessor().setType('VEC3').setArray(position).setBuffer(buffer);
    const nrm = doc.createAccessor().setType('VEC3').setArray(normal).setBuffer(buffer);
    const uv = doc.createAccessor().setType('VEC2').setArray(texcoord).setBuffer(buffer);
    const idx = doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer);
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', pos)
      .setAttribute('NORMAL', nrm)
      .setAttribute('TEXCOORD_0', uv)
      .setIndices(idx);
    const mat = matObjs.get(matKey);
    if (mat) prim.setMaterial(mat);
    return prim;
  };

  const makeNode = (spec) => {
    const node = doc.createNode(spec.name);
    if (spec.translation) node.setTranslation(spec.translation);
    if (spec.rotation) node.setRotation(spec.rotation);
    if (spec.scale) node.setScale(spec.scale);
    if (spec.extras) {
      for (const [k, v] of Object.entries(spec.extras)) node.setExtras({ ...node.getExtras(), [k]: v });
    }
    if (spec.primitives && spec.primitives.length) {
      const mesh = doc.createMesh(spec.name);
      for (const p of spec.primitives) mesh.addPrimitive(makePrimitive(p.builder, p.material));
      node.setMesh(mesh);
    }
    if (spec.children) {
      for (const child of spec.children) node.addChild(makeNode(child));
    }
    return node;
  };

  for (const spec of nodes) scene.addChild(makeNode(spec));
  return doc;
}

/** Write a Document to a raw GLB path (creates parent dirs). */
export async function writeGLB(doc, absPath) {
  const io = await makeIO();
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const glb = await io.writeBinary(doc);
  fs.writeFileSync(absPath, glb);
  return absPath;
}
