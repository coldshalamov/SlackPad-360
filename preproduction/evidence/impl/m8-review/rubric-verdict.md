# M8 hero art — shot rubric verdict (orchestrator review)

Reviewer: incoming studio lead (orchestrator), HDRI-lit three.js viewer.
Date: 2026-07-11
Shots: `s1-*` / `s2-*` / `s3-*` / `s5-*` (first pass) and
`fix2-*` (post punch-list, in `packages/asset-pipeline/tools/review-viewer/shots/`).

## Verdict per rubric shot

| Shot | Criterion | Verdict |
| --- | --- | --- |
| S1 | Hero board 3/4 — deck reads as skateboard, grip vs wood separation, trucks/wheels distinct, no brands, PBR responds to HDRI | **PASS** (post-fix: matte black grip, wood rails, galvanized trucks, opaque warm-white wheels) |
| S2 | Shoes planted — readable, L/R distinct, no logos, believable contact | **PASS** (post-fix: seated collar, instep laces, toe cap, skate profile; toe slightly faceted at LOD0 — acceptable) |
| S3 | Air flip readability — top vs bottom of deck clear mid-flip | **PASS** (teal duotone chevron underside vs grip top gives instant orientation) |
| S4 | Grind approach — rail metal vs concrete contrast | Deferred to M6/M9 in-scene (rail module present in plaza kit) |
| S5 | Plaza establishing — readable line, coherent materials | Deferred to M9 plaza assembly (modules are individually correct; layout not yet built) |
| S6 | Bail — failure distinct | Deferred to M7 (bail presentation) |
| S7 | Desktop framing / HUD | Deferred to M7 |
| S8 | Performance still — nonblank, no z-fight | **PASS** (clean render, no z-fight observed) |

## Root causes fixed (both systemic, credit to the asset agent)

1. Triangle winding contradicted authored normals → front faces culled, viewers
   saw interiors ("glossy grip", "wood underside", "glass wheels"). Fixed in the
   generators + a `harmonizeWinding()` export step + a validator lock.
2. Factor×texture roughness double-multiply + linear-authored factors crushed
   metal/urethane roughness and darkened the deck graphic. Fixed with identity
   factors when textured + sRGB→linear conversion + MR range remap.

## Outstanding (non-blocking, tracked for M7/M9)

- Concrete ground texture reads warm-cream; shift toward warm-grey during M9
  plaza material assembly.
- L-shoe mirrored UVs lack TANGENT accessors — normal map may light inverted on
  tangent-deriving clients; confirm in-engine at M7.
- Grip grit reads flat-black beyond ~1 m (correct behavior, not a defect).

## Promotion status

Assets remain in `assets/generated/authored/staged/`. `assets/runtime/` stays
empty. Promotion to runtime happens at M7 once the board+shoes are confirmed
in-engine under the game camera/lighting (G-RUNTIME-ASSETS evidence).
