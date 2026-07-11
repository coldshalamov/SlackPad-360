// PBR material specs for the authored assets.
//
// M8a visual-review rework. Two rules learned the hard way:
//  1. glTF FACTORS MULTIPLY TEXTURES. A "tint" factor over an already-dark
//     map double-darkens (deck graphic rendered near-black-mirror), and a
//     roughnessFactor over a low-roughness map double-glosses (trucks 0.077
//     effective → mirror reading as matte black; wheels 0.11 → "translucent
//     glass"). So: when a texture is bound, the corresponding factor is
//     identity (or a mild, intentional tint) and the TEXTURE carries the
//     target value (see prep-textures remaps).
//  2. baseColorFactor is LINEAR. Authoring "sRGB-looking" numbers as factors
//     brightens everything (shoe upper rendered beige instead of suede).
//     srgb() converts display targets to linear factors.
//
// Textures apply on LOD0 only; LOD1/2 use factor-only materials whose factors
// are the BAKED FINAL targets so distant LODs match. All materials carry
// baseColor + roughness (validator contract). No brand strings.

import fs from 'node:fs';

const has = (p) => !!p && fs.existsSync(p);

/** sRGB [0..1] component → linear. */
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** sRGB hex like '#9aa0a6' → linear RGBA factor. */
function srgb(hex, a = 1) {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return [s2l(r), s2l(g), s2l(b), a];
}

/** Attach maps if present. */
function withMaps(base, tex, keys) {
  if (!tex) return base;
  const out = { ...base };
  if (keys.baseColor && has(tex.baseColor)) out.baseColorTexture = tex.baseColor;
  if (keys.normal && has(tex.normal)) { out.normalTexture = tex.normal; out.normalScale = keys.normalScale ?? 1; }
  if (keys.mr && has(tex.mr)) out.metallicRoughnessTexture = tex.mr;
  if (keys.ao && has(tex.ao)) out.occlusionTexture = tex.ao;
  return out;
}

// --- Final look targets (single source of truth for textured + flat) -------
const T = {
  // Deck wood: warm tint over WoodFloor043 (brief: "tinted"); flat = tinted mean.
  deckWoodTint: [1.0, 0.9, 0.78, 1],
  deckWoodFlat: srgb('#8a5f3c'),
  deckWoodRough: 0.58,
  // Deck-bottom graphic (texture carries color; flat = its mean).
  deckGraphicFlat: srgb('#3a5c63'),
  deckGraphicRough: 0.5,
  // Grip: near-black matte grit (review: ~#0f0f10, rough ≥ 0.95).
  gripFlat: srgb('#0f0f10'),
  gripRough: 0.96,
  // Trucks: galvanized (review: ~#9aa0a6, metallic ~0.9, rough ~0.45).
  truckFlat: srgb('#9aa0a6'),
  truckMetal: 0.9,
  truckRough: 0.45,
  // Wheels: warm off-white urethane (review: #f2ede2), soft specular.
  urethane: srgb('#f2ede2'),
  urethaneRough: 0.46,
};

export function boardMaterials(textures, lod) {
  const t = lod === 0 ? textures : null;
  return {
    deckWood: t
      ? withMaps(
          { baseColorFactor: T.deckWoodTint, metallic: 0, roughness: 1 },
          t.wood, { baseColor: true, normal: true, mr: true, ao: true, normalScale: 0.8 },
        )
      : { baseColorFactor: T.deckWoodFlat, metallic: 0, roughness: T.deckWoodRough },
    deckGraphic: t
      ? withMaps(
          { baseColorFactor: [1, 1, 1, 1], metallic: 0, roughness: T.deckGraphicRough },
          t.deckGraphic, { baseColor: true },
        )
      : { baseColorFactor: T.deckGraphicFlat, metallic: 0, roughness: T.deckGraphicRough },
    grip: t
      ? withMaps(
          { baseColorFactor: [1, 1, 1, 1], metallic: 0, roughness: 1 },
          t.grip, { baseColor: true, normal: true, mr: true, normalScale: 1 },
        )
      : { baseColorFactor: T.gripFlat, metallic: 0, roughness: T.gripRough },
    truckMetal: t
      ? withMaps(
          { baseColorFactor: [1, 1, 1, 1], metallic: T.truckMetal, roughness: 1, doubleSided: true },
          t.metal, { baseColor: true, normal: true, mr: true, normalScale: 0.7 },
        )
      : { baseColorFactor: T.truckFlat, metallic: T.truckMetal, roughness: T.truckRough, doubleSided: true },
    urethane: t
      ? withMaps(
          { baseColorFactor: T.urethane, metallic: 0, roughness: 1 },
          t.urethane, { mr: true },
        )
      : { baseColorFactor: T.urethane, metallic: 0, roughness: T.urethaneRough },
    collider: { baseColorFactor: [0.9, 0.2, 0.2, 1], metallic: 0, roughness: 1 },
  };
}

export function shoeMaterials(textures, lod) {
  const t = lod === 0 ? textures : null;
  return {
    sole: t
      ? withMaps(
          // Rubber004 Color is mid-grey; darken toward gum-black skate sole.
          { baseColorFactor: [0.32, 0.32, 0.34, 1], metallic: 0, roughness: 1 },
          t.rubber, { baseColor: true, normal: true, mr: true, normalScale: 0.8 },
        )
      : { baseColorFactor: srgb('#2e2e30'), metallic: 0, roughness: 0.72 },
    foxing: { baseColorFactor: srgb('#ddd8cd'), metallic: 0, roughness: 0.62 },
    upper: { baseColorFactor: srgb('#6e5138'), metallic: 0, roughness: 0.85 }, // suede brown
    toe: { baseColorFactor: srgb('#5d442f'), metallic: 0, roughness: 0.8 },
    laces: { baseColorFactor: srgb('#d9d2c2'), metallic: 0, roughness: 0.75 },
    collar: { baseColorFactor: srgb('#4a372a'), metallic: 0, roughness: 0.9 },
  };
}

export function plazaMaterials(textures) {
  const t = textures;
  return {
    concrete: withMaps(
      { baseColorFactor: [1, 1, 1, 1], metallic: 0, roughness: 1 },
      t?.concrete, { baseColor: true, normal: true, mr: true, ao: true, normalScale: 0.8 },
    ),
    metalTrim: withMaps(
      { baseColorFactor: [1, 1, 1, 1], metallic: T.truckMetal, roughness: 1, doubleSided: true },
      t?.metal, { baseColor: true, normal: true, mr: true, normalScale: 0.6 },
    ),
    wood: withMaps(
      { baseColorFactor: [1, 0.94, 0.85, 1], metallic: 0, roughness: 1 },
      t?.wood, { baseColor: true, normal: true, mr: true, ao: true, normalScale: 0.7 },
    ),
    soil: { baseColorFactor: srgb('#4a3826'), metallic: 0, roughness: 0.95 },
    collider: { baseColorFactor: [0.2, 0.6, 0.9, 1], metallic: 0, roughness: 1 },
  };
}
