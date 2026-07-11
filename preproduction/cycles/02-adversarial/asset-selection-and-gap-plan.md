# Asset Selection and Gap Plan — Cycle 2

**Access date:** 2026-07-10
**Blender:** Deferred — shared process owned by unrelated work. **Not optional art.** Cycle 3 must schedule isolated Blender pass or equal source.

---

## 1. Selection process

1. Prefer CC0 primary pages (Poly Haven, ambientCG, Kenney).
2. Open **exact asset page**, not only collection home.
3. Verify commercial/modify/redistribute.
4. Download reasonable size (1K textures, 1K HDR).
5. Write LICENSE + SOURCE.md + SHA-256 + preview.
6. Reject if free but looks wrong for professional target.

---

## 2. Selected and downloaded

### 2.1 ph-kloppenheim-05-puresky

| Field | Value |
| --- | --- |
| Page | https://polyhaven.com/a/kloppenheim_05_puresky |
| Author | Greg Zaal / Poly Haven |
| License | CC0 1.0 |
| Files | `kloppenheim_05_puresky_1k.hdr`, tonemapped jpg, LICENSE, SOURCE.md |
| SHA-256 (hdr) | `9da5a7f9c799fa6e41cac8fbc4fb7aa2d4556e2f00ce9943abe0fd83b6d4caf5` |
| Role | Daylight plaza IBL |
| Review | selected-source; not yet runtime approved |
| Preview | `assets/generated/previews/ph-kloppenheim-05-puresky/tonemapped.jpg` |

### 2.2 acg-concrete-040

| Field | Value |
| --- | --- |
| Page | https://ambientcg.com/view?id=Concrete040 |
| License | CC0 (site: free commercial, no attribution required) |
| File | Concrete040_1K-JPG.zip |
| SHA-256 | `24af2b6826d114cc6c55106d9a49bf71b6bf32f710111708dadce0152e28677f` |
| Role | Plaza ground/curbs |
| Preview | `.../acg-concrete-040/color.jpg` |

### 2.3 acg-metal-006

| Field | Value |
| --- | --- |
| Page | https://ambientcg.com/view?id=Metal006 |
| File | Metal006_1K-JPG.zip |
| SHA-256 | `6b836315b5f846ec2dbe3964dd67a0e62addb5943365a03231803c592d45296f` |
| Role | Rails / painted metal |
| Preview | `.../acg-metal-006/color.jpg` |

### 2.4 acg-wood-floor-043

| Field | Value |
| --- | --- |
| Page | https://ambientcg.com/view?id=WoodFloor043 |
| File | WoodFloor043_1K-JPG.zip |
| SHA-256 | `0bd1309b36c9a0add6fd9b4108f8cba73ba475afb6fb824c42bb05080c01403b` |
| Role | Wood props/ledges; not final hero deck |
| Preview | `.../acg-wood-floor-043/color.jpg` |

### 2.5 kenney-mini-skate

| Field | Value |
| --- | --- |
| Page | https://kenney.nl/assets/mini-skate |
| License | CC0 |
| File | kenney_mini-skate.zip |
| SHA-256 | `82582f6de507e93090c16bb4802a7c361015fe246eddd571e6e96f816b12e8c6` |
| Role | **Blockout only** |
| Review | **rejected-as-final-look** |
| Reason | Mini low-detail conflicts professional tactile target |

---

## 3. Searched but not selected as hero

Public free skateboard/truck/shoe candidates tended to be: 3D-print STLs, NC licenses, brand-heavy, low-poly toy, or license-unclear marketplace AI. **None cleared** high-quality + safe redistribute + unbranded professional bar in this cycle.

Audio: Freesound grind https://freesound.org/people/21100495/sounds/655371/ labeled CC0 — catalog candidate only (download deferred).

---

## 4. Gap A — Hero board Blender-ready brief

**Why gap:** No suitable redistributable detailed unbranded board.
**Why not authored now:** Blender process unavailable (unrelated ownership), not optional.

### 4.1 Dimensions (playable visual scale)

| Part | Target |
| --- | --- |
| Deck length | 0.80 m |
| Deck width | 0.20 m |
| Deck thickness | ~0.012–0.015 m visual; collider thicker OK |
| Wheelbase | ~0.43 m axle-to-axle |
| Wheel diameter | ~0.054–0.060 m |
| Truck width | ~0.15–0.16 m axle |

Axes: +X right, +Y up, +Z nose. Origin at deck center COM.

### 4.2 Named parts (objects)

`Deck`, `GripTape`, `Truck_F`, `Truck_R`, `Axle_F`, `Axle_R`, `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`, `Hardware_*` (optional), sockets `Socket_NoseFoot`, `Socket_TailFoot`.

### 4.3 Topology targets

| LOD0 | LOD1 | LOD2 |
| --- | --- | --- |
| Deck ~4–8k tris | ~2k | ~800 |
| Truck each ~1.5–3k | ~600 | ~200 |
| Wheel each ~800–1200 | ~300 | ~80 |

Quads preferred in .blend; export triangulated GLB OK. Hard edges on metal; bevel micro on deck rails.

### 4.4 Materials / UV

- Deck wood: unique UV; albedo/rough/normal; **no brand graphic** (solid color, subtle grain, or abstract)
- Grip: dark high-roughness; may be second UV/trim
- Trucks: metal; galvanized vs painted variants as material slots
- Wheels: urethane; simple colorway
- Texel density target: ~512–1024 px/m on hero

### 4.5 Pivots / attachment

- Board root = COM
- Wheels rotate on local X
- Trucks static to deck for v0 (visual lean via board roll)
- Foot sockets at top of deck nose/tail, offset ±Z

### 4.6 Collision proxies

- Deck box/convex
- Truck boxes
- Optional wheel spheres

### 4.7 Export

- glTF 2.0 binary `.glb`
- Y-up, +Z forward
- Embedded or external textures → pipeline to KTX2 later
- meshopt after approve

### 4.8 Acceptance renders (when Blender available)

1. Three-quarter hero on neutral grey, daylight HDRI
2. Macro trucks/wheels
3. Underside
4. In-plaza mock (even proxy plaza)
5. Flip readability: deck top vs bottom in air

Must pass art-direction-and-shot-rubric professional bar.

---

## 5. Gap B — Shoes / feet Blender-ready brief

### 5.1 Concept

Disembodied **unbranded** skate shoes; optional short ankle cuff; L/R mirrored.

### 5.2 Dimensions

Shoe length ~0.28–0.30 m; width ~0.10–0.11 m; scale to read next to 0.8 m deck.

### 5.3 Parts

`Shoe_L`, `Shoe_R`, optional `Ankle_L/R`. Bones: root, ball pivot optional.

### 5.4 Topology

LOD0 ~3–6k tris per shoe; LOD1 ~1k; LOD2 ~300.

### 5.5 Materials

Rubber sole, fabric/suede upper, laces simple; **no logos**. PBR maps 1–2K.

### 5.6 Attachment

Parent to board sockets or follow catch volumes; pivot at sole center.

### 5.7 Acceptance renders

1. Both shoes planted on hero board
2. One foot lifted flick pose
3. Catch silhouette
4. Bail detached

---

## 6. Cycle 3 art schedule note

| Option | When |
| --- | --- |
| A | Isolated Blender session after unrelated work releases process |
| B | Commission/hire external under work-for-hire
| C | Purchase commercial kit with clear redistributable license + quality bar |

Do **not** permanently adopt Kenney as ship look.
