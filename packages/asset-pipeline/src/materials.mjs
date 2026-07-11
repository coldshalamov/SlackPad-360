// PBR material specs for the authored assets. Textures are applied on LOD0
// only (distant LODs drop to factor-only materials — smaller files, standard
// LOD practice). All materials carry baseColorFactor + roughnessFactor so the
// validator's "baseColor + roughness set" check passes regardless of LOD.
// No material name contains a brand string.

import fs from 'node:fs';

const has = (p) => !!p && fs.existsSync(p);

/** Attach vendor/procedural maps if present. */
function withMaps(base, tex, keys) {
  if (!tex) return base;
  const out = { ...base };
  if (keys.baseColor && has(tex.baseColor)) out.baseColorTexture = tex.baseColor;
  if (keys.normal && has(tex.normal)) { out.normalTexture = tex.normal; out.normalScale = keys.normalScale ?? 1; }
  if (keys.mr && has(tex.mr)) out.metallicRoughnessTexture = tex.mr;
  if (keys.ao && has(tex.ao)) out.occlusionTexture = tex.ao;
  return out;
}

export function boardMaterials(textures, lod) {
  const t = lod === 0 ? textures : null;
  return {
    deckWood: withMaps(
      { baseColorFactor: [0.62, 0.44, 0.28, 1], metallic: 0, roughness: 0.55 },
      t?.wood, { baseColor: true, normal: true, mr: true, ao: true, normalScale: 0.8 },
    ),
    deckGraphic: withMaps(
      { baseColorFactor: [0.14, 0.34, 0.4, 1], metallic: 0, roughness: 0.5 },
      t?.deckGraphic, { baseColor: true },
    ),
    grip: withMaps(
      { baseColorFactor: [0.03, 0.03, 0.035, 1], metallic: 0, roughness: 0.96 },
      t?.grip, { baseColor: true, normal: true, mr: true, normalScale: 1 },
    ),
    truckMetal: withMaps(
      { baseColorFactor: [0.66, 0.68, 0.7, 1], metallic: 1, roughness: 0.4, doubleSided: true },
      t?.metal, { baseColor: true, normal: true, mr: true, normalScale: 0.7 },
    ),
    urethane: withMaps(
      { baseColorFactor: [0.93, 0.9, 0.82, 1], metallic: 0, roughness: 0.35 },
      t?.urethane, { mr: true },
    ),
    collider: { baseColorFactor: [0.9, 0.2, 0.2, 0.25], metallic: 0, roughness: 1 },
  };
}

export function shoeMaterials(textures, lod) {
  const t = lod === 0 ? textures : null;
  return {
    sole: withMaps(
      { baseColorFactor: [0.12, 0.12, 0.13, 1], metallic: 0, roughness: 0.7, doubleSided: false },
      t?.rubber, { baseColor: true, normal: true, mr: true, normalScale: 0.8 },
    ),
    foxing: { baseColorFactor: [0.92, 0.9, 0.85, 1], metallic: 0, roughness: 0.6 },
    upper: withMaps(
      { baseColorFactor: [0.42, 0.3, 0.22, 1], metallic: 0, roughness: 0.85 },
      t?.upperRough ? { mr: t.upperRough } : null, { mr: true },
    ),
    toe: { baseColorFactor: [0.36, 0.25, 0.18, 1], metallic: 0, roughness: 0.8 },
    laces: { baseColorFactor: [0.85, 0.82, 0.74, 1], metallic: 0, roughness: 0.7 },
    collar: { baseColorFactor: [0.3, 0.22, 0.18, 1], metallic: 0, roughness: 0.9 },
  };
}

export function plazaMaterials(textures) {
  const t = textures;
  return {
    concrete: withMaps(
      { baseColorFactor: [0.62, 0.61, 0.58, 1], metallic: 0, roughness: 0.85 },
      t?.concrete, { baseColor: true, normal: true, mr: true, ao: true, normalScale: 0.8 },
    ),
    metalTrim: withMaps(
      { baseColorFactor: [0.55, 0.57, 0.6, 1], metallic: 1, roughness: 0.42, doubleSided: true },
      t?.metal, { baseColor: true, normal: true, mr: true, normalScale: 0.6 },
    ),
    wood: withMaps(
      { baseColorFactor: [0.6, 0.44, 0.29, 1], metallic: 0, roughness: 0.6 },
      t?.wood, { baseColor: true, normal: true, mr: true, ao: true, normalScale: 0.7 },
    ),
    soil: { baseColorFactor: [0.2, 0.14, 0.09, 1], metallic: 0, roughness: 0.95 },
    collider: { baseColorFactor: [0.2, 0.6, 0.9, 0.25], metallic: 0, roughness: 1 },
  };
}
