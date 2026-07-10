# Art Direction — Cycle 1

**Status:** Visual direction for professional laptop presentation
**Access date:** 2026-07-10

---

## 1. Creative brief

**Mood:** Sunlit concrete plaza, tactile materials, toy-scale control fantasy on real-skate readable geometry.
**Not:** Generic low-poly starter kit aesthetic as the final look; flat unlit prototypes; neon cyber bloom soup; deliberately ugly “dev art forever.”

**Hero reads (in priority order):**

1. Board deck, grip, trucks, wheels
2. Shoes / feet proxies tied to contacts
3. Grind edges and ledges (silhouette + material contrast)
4. Ramps/banks light planes
5. Background architecture (support, not noise)

---

## 2. Visual pillars

| Pillar | Guidance |
| --- | --- |
| **Material honesty** | Wood grain deck, grippy tape, metal trucks, urethane wheels, worn concrete |
| **Scale coherence** | Playable skate scale; props sized for lines |
| **Daylight clarity** | Single sun + sky/ambient; soft shadows; restrained post |
| **Motion readability** | Board rotation readable in chase cam; avoid camouflage colors on deck edges |
| **Tactile UI ghosts** | Foot contact ghosts subtle, not arcade billboards |

---

## 3. Color and lighting

| Element | Direction |
| --- | --- |
| Time of day | Late morning / soft afternoon |
| Sun | Warm directional; one shadow cascade start |
| Ambient | Hemisphere or HDRI low intensity (Poly Haven CC0 candidates) |
| Board accent | High-contrast deck graphic edges for flip read |
| Rails | Cool metal vs warm concrete |
| Post | Color grade + optional FXAA/SMAA; **no** default heavy bloom/SSR/SSAO |

---

## 4. Character and board

| Asset | Approach |
| --- | --- |
| Board | Hero mesh, high texture density, LODs |
| Shoes | Stylized but detailed; may be floating foot proxies early |
| Skater body | Simplified athletic silhouette; animation follows board; ragdoll later |
| Style | Slightly stylized realism — not photoreal skin pore race |

---

## 5. Environment

Compact plaza: modular concrete, metal rails, stairs, banks, one QP or mini-ramp, planters as soft obstacles. Verticality without maze density. See `world-ui-audio-spec.md`.

**Prototype kits (CC0)** may bootstrap blockout (e.g. Kenney Mini Skate / city kits) but **shipping look** must pass professional readability review — either re-dressed materials or bespoke modular set.

Kenney Mini Skate (CC0): https://kenney-assets.itch.io/mini-skate
Kenney general CC0: https://kenney.nl/
Poly Haven CC0: https://polyhaven.com/

---

## 6. Effects (restrained)

| Effect | Use |
| --- | --- |
| Wheel dust / sparks | Light, grounded |
| Grind sparks | Short, readable |
| Landing dust | Soft |
| Speed lines / chromatic | **Off** by default |
| Screen shake | Optional, a11y toggle |

---

## 7. What “professional on target laptop” means

| Check | Pass bar |
| --- | --- |
| Materials | PBR basecolor/rough/metal/normal on heroes |
| Lighting | Coherent daylight; no pure ambient flat |
| Silhouette | Board and rails read at chase distance |
| Budget | Meets G5 FPS with these assets — **do not** drop to unlit cubes to hit FPS without art plan |
| Consistency | Single art bible; no mixed toy/real chaos |

**Performance is a budget problem, not an excuse for permanent placeholder aesthetics.**

---

## 8. Reference policy

- Legal references in `assets/reference/` only when retainable (own photos, CC0, licensed).
- No proprietary game screenshot dumps as redistributable assets.
- Mood boards may live outside repo if unlicensed; do not vendor illegal rips.

---

## 9. Blender policy

- Project sources in `assets/source/blender/`.
- Export GLB via documented pipeline.
- Record Blender MCP actions in session notes if used.
- Cycle 1: **no requirement** to author final board mesh; direction only.

---

## 10. Verification

| Claim | Method |
| --- | --- |
| Not low-poly final | Art review checklist + side-by-side blockout vs hero board |
| Readable flips | Side-cam recording of kickflip |
| Lighting coherent | Screenshot under sun + overcast HDRI test |
| Budget hold | G5 with final-ish LODs |
