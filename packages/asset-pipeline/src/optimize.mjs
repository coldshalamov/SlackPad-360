// Optimize pass: dedup → prune(keepLeaves) → weld → meshopt. Reads a raw GLB,
// writes an optimized/staged GLB. KTX2 (toktx) is attempted only when the
// binary is on PATH; otherwise textures are left as PNG/JPG and the deferral
// is logged (never fails the build).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dedup, prune, weld, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { makeIO } from './export.mjs';

/** Whether a `toktx` binary is resolvable on PATH. */
export function toktxAvailable() {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['toktx'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Optimize a raw GLB into a staged GLB.
 * @param {string} rawPath
 * @param {string} stagedPath
 * @returns {Promise<{ktx2: 'applied'|'deferred', bytes: number}>}
 */
export async function optimizeGLB(rawPath, stagedPath) {
  await MeshoptEncoder.ready;
  const io = await makeIO();
  const doc = await io.read(rawPath);

  await doc.transform(
    dedup(),
    // keepLeaves:true  → mesh-less socket nodes (Socket_NoseFoot/Tail) survive.
    // keepAttributes:true → factor-only-material meshes keep authored UVs
    //   (brief requires UV coords present on visual meshes).
    // keepExtras:true → collider {collider,hidden} flags survive.
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  let ktx2 = 'deferred';
  if (toktxAvailable()) {
    try {
      await doc.transform(textureCompress({ targetFormat: 'ktx2' }));
      ktx2 = 'applied';
    } catch {
      ktx2 = 'deferred';
    }
  }

  fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
  const glb = await io.writeBinary(doc);
  fs.writeFileSync(stagedPath, glb);
  return { ktx2, bytes: glb.byteLength };
}
