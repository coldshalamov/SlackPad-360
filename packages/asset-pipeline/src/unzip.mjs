// Minimal, dependency-free ZIP reader (store + deflate) using Node zlib. The
// vendor CC0 packs are standard PKZIP; we only need to pull a few JPGs out, so
// a full library is overkill and would add a dependency. Portable across the
// PowerShell / bash shells the pipeline may run under.

import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * List entries in a zip: [{ name, method, compSize, uncompSize, localOffset }]
 */
function readCentralDirectory(buf) {
  // Find End Of Central Directory record (0x06054b50), scanning backwards.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('EOCD not found (not a zip?)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central dir signature');
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const uncompSize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOffset = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({ name, method, compSize, uncompSize, localOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractEntry(buf, entry) {
  // Local file header at entry.localOffset (0x04034b50).
  const off = entry.localOffset;
  if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error('bad local header');
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLen + extraLen;
  const comp = buf.subarray(dataStart, dataStart + entry.compSize);
  if (entry.method === 0) return Buffer.from(comp); // stored
  if (entry.method === 8) return zlib.inflateRawSync(comp); // deflate
  throw new Error(`unsupported zip method ${entry.method}`);
}

/**
 * Extract entries whose basename matches `predicate(name)` into destDir,
 * writing each as its chosen output name from `nameFn(basename)`.
 * Skips writing when the target already exists AND has the expected size
 * (idempotent; keeps re-runs cheap for tests).
 * @returns {{name:string, path:string, bytes:number}[]}
 */
export function extractFromZip(zipPath, destDir, predicate, nameFn) {
  const buf = fs.readFileSync(zipPath);
  const entries = readCentralDirectory(buf);
  fs.mkdirSync(destDir, { recursive: true });
  const out = [];
  for (const e of entries) {
    const base = e.name.split('/').pop();
    if (!predicate(base)) continue;
    const outName = nameFn(base);
    const outPath = `${destDir}/${outName}`;
    if (!(fs.existsSync(outPath) && fs.statSync(outPath).size === e.uncompSize)) {
      const data = extractEntry(buf, e);
      fs.writeFileSync(outPath, data);
    }
    out.push({ name: outName, path: outPath, bytes: e.uncompSize });
  }
  return out;
}
