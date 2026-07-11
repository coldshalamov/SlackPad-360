# Asset Bill of Materials — Cycle 2

**Access date:** 2026-07-10
**Rule:** No `assets/runtime/` shipping promotions until review approved.

---

## 1. Required BOM

| ID | Category | Requirement | Status |
| --- | --- | --- | --- |
| BOM-BOARD | Hero board | Deck, grip tape, trucks, wheels, bearings/hardware; detailed; unbranded | **Gap — Blender brief** |
| BOM-SHOES | Shoes/feet | Generic unbranded skate shoes; minimal foot/ankle; L/R | **Gap — Blender brief** |
| BOM-PLAZA-MOD | Plaza geometry | Modular floor, banks, stairs, ledges, rails, curb, QP, background props | Blockout: Kenney (not final); final: bespoke/modular re-dress |
| BOM-COLPROXY | Collision proxies | Simplified hulls for modular pieces | Author with final geometry |
| BOM-MAT-CONCRETE | Material | Concrete PBR | **Acquired** acg-concrete-040 |
| BOM-MAT-METAL | Material | Painted/galvanized metal | **Acquired** acg-metal-006 |
| BOM-MAT-WOOD | Material | Wood | **Acquired** acg-wood-floor-043 |
| BOM-MAT-GRIP | Material | Rubber/grip | Gap (procedural black grit OK interim) |
| BOM-HDRI | Env light | Daylight HDRI | **Acquired** ph-kloppenheim-05-puresky |
| BOM-RAIL | Obstacle | Rail + coping | Geometry gap / blockout Kenney |
| BOM-CURB | Obstacle | Curb | same |
| BOM-STAIR | Obstacle | Stairs | same |
| BOM-BANK | Obstacle | Bank | same |
| BOM-QP | Obstacle | Quarter-pipe | same |
| BOM-LEDGE | Obstacle | Ledge | same |
| BOM-BG | Props | Background | same |
| BOM-SFX-ROLL | Audio | Roll loop | Catalog candidate; download later |
| BOM-SFX-PUSH | Audio | Push | later |
| BOM-SFX-POP | Audio | Pop | later |
| BOM-SFX-CATCH | Audio | Catch | later |
| BOM-SFX-LAND | Audio | Land | later |
| BOM-SFX-BAIL | Audio | Bail | later |
| BOM-SFX-GRIND | Audio | Grind | Freesound 655371 candidate (CC0 page) |
| BOM-SFX-SURFACE | Audio | Surface | later |
| BOM-SFX-AMB | Audio | Ambience | later |
| BOM-SFX-UI | Audio | UI | later |
| BOM-FONT | UI | Fonts/icons | Only if license-clean; system UI OK interim |

---

## 2. Acquired this cycle (summary)

| Asset ID | Page | License | Path |
| --- | --- | --- | --- |
| ph-kloppenheim-05-puresky | https://polyhaven.com/a/kloppenheim_05_puresky | CC0 | `assets/source/vendor/ph-kloppenheim-05-puresky/` |
| acg-concrete-040 | https://ambientcg.com/view?id=Concrete040 | CC0 | `assets/source/vendor/acg-concrete-040/` |
| acg-metal-006 | https://ambientcg.com/view?id=Metal006 | CC0 | `assets/source/vendor/acg-metal-006/` |
| acg-wood-floor-043 | https://ambientcg.com/view?id=WoodFloor043 | CC0 | `assets/source/vendor/acg-wood-floor-043/` |
| kenney-mini-skate | https://kenney.nl/assets/mini-skate | CC0 | `assets/source/vendor/kenney-mini-skate/` (blockout only) |

Each has LICENSE, SOURCE.md, original binary, SHA-256 in catalog, preview under `assets/generated/previews/`.

---

## 3. Explicit rejects

| Asset | Reason |
| --- | --- |
| Kenney Mini Skate as final look | Low-detail mini aesthetic vs professional tactile target |
| Branded deck graphics | IP |
| NC/unclear marketplace “free” boards | Not shippable commercial |
| AI marketplace models without clear SPDX | Reject until license page proves CC0/commercial |

---

## 4. Runtime promotion criteria (future)

1. Geometry/material quality pass (shot rubric)
2. License/redistribution pass
3. Performance budget pass
4. `reviewStatus: approved` and `runtimeIntent: shipping`
5. Checksums recorded

**None meet this yet.**
