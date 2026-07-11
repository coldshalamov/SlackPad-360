// Texture prep. Extracts the needed 1K JPG maps from the vendor CC0 zips,
// packs glTF metallic-roughness textures (G=roughness, B=metalness), and
// generates the procedural textures (grip grit, deck-bottom graphic, subtle
// urethane roughness). All procedural output is seeded/deterministic and
// encoded as lossless PNG for byte-stable rebuilds.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { extractFromZip } from './unzip.mjs';
import { makeFbm, makeValueNoise, clamp } from './geo/math.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const VENDOR = path.join(REPO, 'assets', 'source', 'vendor');
const TEX_OUT = path.join(REPO, 'assets', 'generated', 'textures');

const SEED = { grip: 1337, graphic: 7331, urethane: 4242 };

// Per-pack MR retargets (M8a visual-review fix). The raw vendor roughness
// maps are authored for their own contexts (WoodFloor043 is a POLISHED floor,
// mean rough ~0.28; Metal006 mean ~0.19) — used verbatim they render
// mirror-like under an HDRI. We keep each map's variation but remap its range
// so the EFFECTIVE roughness lands on the art targets (shot-rubric §4: metal
// "specular streak not chrome mirror", wood "soft grain not plastic").
// forceMetal bakes constant metalness so metallicFactor alone tunes metals.
const VENDOR_MAP = {
  metal: { id: 'acg-metal-006', zip: 'Metal006_1K-JPG.zip', gLo: 0.33, gHi: 0.62, forceMetal: 255 },
  wood: { id: 'acg-wood-floor-043', zip: 'WoodFloor043_1K-JPG.zip', gLo: 0.45, gHi: 0.75 },
  concrete: { id: 'acg-concrete-040', zip: 'Concrete040_1K-JPG.zip', gLo: 0.72, gHi: 0.96 },
  rubber: { id: 'acg-rubber-004', zip: 'Rubber004_1K-JPG.zip', gLo: 0.55, gHi: 0.85 },
};

const MAP_SUFFIXES = ['Color', 'NormalGL', 'Roughness', 'Metalness', 'AmbientOcclusion'];

function extractVendor(logical) {
  const { id, zip } = VENDOR_MAP[logical];
  const zipPath = path.join(VENDOR, id, zip);
  const destDir = path.join(TEX_OUT, logical);
  const files = extractFromZip(
    zipPath,
    destDir,
    (base) => MAP_SUFFIXES.some((s) => base.endsWith(`_${s}.jpg`)),
    (base) => {
      const m = base.match(/_([A-Za-z]+)\.jpg$/);
      return `${m[1]}.jpg`;
    },
  );
  const byKind = {};
  for (const f of files) byKind[f.name.replace('.jpg', '')] = f.path;
  return { destDir, byKind };
}

/**
 * Pack a glTF metallic-roughness PNG from separate roughness/metalness maps.
 * Output matches the roughness map's NATIVE dimensions so it stays aligned
 * with the pack's Color/Normal maps (some ambientCG packs are non-square,
 * e.g. WoodFloor043 is 1024x512).
 *
 * gLo/gHi: remap the roughness channel's observed [min..max] onto this target
 * range (keeps the map's variation, fixes its absolute level). forceMetal:
 * constant metalness byte (otherwise the pack's Metalness map or 0).
 */
async function packMR(destDir, roughPath, metalPath, { gLo, gHi, forceMetal } = {}) {
  const outPath = path.join(destDir, 'MR.png');
  const meta = await sharp(roughPath).metadata();
  const w = meta.width;
  const h = meta.height;
  const rough = await sharp(roughPath).greyscale().raw().toBuffer();
  let metal = null;
  if (forceMetal == null && metalPath && fs.existsSync(metalPath)) {
    metal = await sharp(metalPath).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer();
  }
  let mapG = (g) => g;
  if (gLo != null && gHi != null) {
    let mn = 255;
    let mx = 0;
    for (let i = 0; i < w * h; i++) {
      const g = rough[i];
      if (g < mn) mn = g;
      if (g > mx) mx = g;
    }
    const span = Math.max(1, mx - mn);
    const lo = Math.round(gLo * 255);
    const hi = Math.round(gHi * 255);
    mapG = (g) => lo + Math.round(((g - mn) / span) * (hi - lo));
  }
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = 255; // R unused by glTF MR
    rgb[i * 3 + 1] = mapG(rough[i]); // G = roughness
    rgb[i * 3 + 2] = forceMetal != null ? forceMetal : metal ? metal[i] : 0; // B = metalness
  }
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 9 }).toFile(outPath);
  return outPath;
}

/** Encode an RGB(A) raw buffer to a deterministic PNG. */
async function writePNG(buf, width, height, channels, outPath) {
  await sharp(buf, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toFile(outPath);
  return outPath;
}

/** Normal map from a height function via central differences (GL, +Y up). */
function heightToNormalRGB(size, heightFn, strength) {
  const buf = Buffer.alloc(size * size * 3);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = heightFn(x, y);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 3;
      buf[i] = Math.round((nx * 0.5 + 0.5) * 255);
      buf[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      buf[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return buf;
}

async function genGrip(destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const size = 512;
  const grit = makeValueNoise(SEED.grip, 512);
  const fine = makeValueNoise(SEED.grip ^ 0x9e37, 512);
  // Albedo: near-black with subtle grit lightening.
  const albedo = Buffer.alloc(size * size * 3);
  const rough = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = grit(x * 1.7, y * 1.7);
      const f = fine(x * 6.0, y * 6.0);
      const speck = g > 0.72 ? (g - 0.72) * 2.2 : 0;
      // Near-black grit, target ~#0f0f10 sRGB (bytes are sRGB): base 15/255
      // with grit specks lightening to ~70/255.
      const val = clamp(0.058 + speck * 0.22 + f * 0.04, 0, 1);
      const i = (y * size + x) * 3;
      const v8 = Math.round(val * 255);
      albedo[i] = v8; albedo[i + 1] = v8; albedo[i + 2] = Math.min(255, v8 + 1);
      // Roughness: matte grit, ≥0.95 mean (review target); grit varies subtly.
      const r = clamp(0.96 + (g - 0.5) * 0.05, 0.93, 0.995);
      const r8 = Math.round(r * 255);
      rough[i] = 255; rough[i + 1] = r8; rough[i + 2] = 0;
    }
  }
  const baseColor = await writePNG(albedo, size, size, 3, path.join(destDir, 'baseColor.png'));
  const mr = await writePNG(rough, size, size, 3, path.join(destDir, 'MR.png'));
  const nheight = (x, y) => {
    const g = grit(x * 1.7, y * 1.7);
    return g > 0.7 ? g * 1.4 : g * 0.2;
  };
  const normalBuf = heightToNormalRGB(size, nheight, 2.4);
  const normal = await writePNG(normalBuf, size, size, 3, path.join(destDir, 'NormalGL.png'));
  return { baseColor, normal, mr };
}

async function genDeckGraphic(destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const w = 1024;
  const h = 256;
  // Unbranded duotone geometric fade — no text/logos. Two-colour diagonal
  // gradient + abstract chevron banding + faint grain. Values below are sRGB
  // (PNG bytes are sRGB-encoded; the earlier build authored these as linear
  // and the graphic rendered near-black — M8a review defect #4).
  const cA = [0.16, 0.19, 0.26]; // deep slate  (#293142)
  const cB = [0.26, 0.56, 0.59]; // teal        (#428f96)
  const cAccent = [0.87, 0.58, 0.27]; // warm amber (#de9445)
  const grain = makeFbm(SEED.graphic, 3, 256);
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const t = clamp(u * 0.75 + v * 0.25, 0, 1);
      let col = [cA[0] + (cB[0] - cA[0]) * t, cA[1] + (cB[1] - cA[1]) * t, cA[2] + (cB[2] - cA[2]) * t];
      // chevron bands: periodic V using |folded| coordinate
      const band = Math.abs(((u * 6 + Math.abs(v - 0.5) * 2) % 1) - 0.5);
      if (band < 0.06) col = [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6];
      // one accent diagonal stripe
      const diag = u - v * 0.4;
      if (diag > 0.62 && diag < 0.66) col = cAccent;
      const gr = (grain(x * 0.08, y * 0.08) - 0.5) * 0.05;
      const i = (y * w + x) * 3;
      buf[i] = Math.round(clamp(col[0] + gr, 0, 1) * 255);
      buf[i + 1] = Math.round(clamp(col[1] + gr, 0, 1) * 255);
      buf[i + 2] = Math.round(clamp(col[2] + gr, 0, 1) * 255);
    }
  }
  const baseColor = await writePNG(buf, w, h, 3, path.join(destDir, 'baseColor.png'));
  return { baseColor };
}

async function genUrethane(destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const size = 256;
  const noise = makeFbm(SEED.urethane, 4, 128);
  const buf = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Soft-specular urethane (rubric §4), review target effective ~0.46.
      const r = clamp(0.46 + (noise(x * 0.05, y * 0.05) - 0.5) * 0.12, 0.38, 0.55);
      const i = (y * size + x) * 3;
      buf[i] = 255; buf[i + 1] = Math.round(r * 255); buf[i + 2] = 0;
    }
  }
  const mr = await writePNG(buf, size, size, 3, path.join(destDir, 'MR.png'));
  return { mr };
}

/**
 * Run full texture prep. Returns a manifest of absolute texture paths.
 */
export async function prepTextures() {
  fs.mkdirSync(TEX_OUT, { recursive: true });
  const manifest = {};

  for (const logical of Object.keys(VENDOR_MAP)) {
    const { destDir, byKind } = extractVendor(logical);
    const mr = await packMR(destDir, byKind.Roughness, byKind.Metalness || null, VENDOR_MAP[logical]);
    manifest[logical] = {
      baseColor: byKind.Color,
      normal: byKind.NormalGL,
      mr,
      ...(byKind.AmbientOcclusion ? { ao: byKind.AmbientOcclusion } : {}),
    };
  }

  manifest.grip = await genGrip(path.join(TEX_OUT, 'grip'));
  manifest.deckGraphic = await genDeckGraphic(path.join(TEX_OUT, 'deck-graphic'));
  manifest.urethane = await genUrethane(path.join(TEX_OUT, 'urethane'));

  fs.writeFileSync(path.join(TEX_OUT, 'textures.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

// Allow running standalone.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('prep-textures.mjs')) {
  prepTextures().then((m) => {
    console.log('textures prepared:', Object.keys(m).join(', '));
  });
}
