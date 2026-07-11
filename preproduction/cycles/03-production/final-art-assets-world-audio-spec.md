# Final Art, Assets, World, and Audio Spec

**Status:** Normative
**Readiness verdict:** **`asset-gap`** (useful sources; hero/pro plaza/runtime audio incomplete)
**Runtime policy:** `assets/runtime/` empty until quality + license + runtime-format review

---

## 1. Asset bill vs acquired

| Need | Disposition | ID / path |
| --- | --- | --- |
| Daylight HDRI | Acquired source | ph-kloppenheim-05-puresky |
| Concrete PBR | Acquired source | acg-concrete-040 |
| Metal PBR | Acquired source | acg-metal-006 |
| Wood PBR | Acquired source | acg-wood-floor-043 |
| Rubber PBR | Acquired source (C3) | acg-rubber-004 |
| Layout blockout | Acquired; rejected as final look | kenney-mini-skate |
| UI SFX | Acquired source (C3) | kenney-interface-sounds |
| Impact/land/bail/pop proxies | Acquired source (C3) | kenney-impact-sounds |
| Metal/wood grind proxies | Acquired source (C3) | oga-100-cc0-metal-wood-sfx |
| Ambience loops | Acquired source (C3) | oga-100-cc0-sfx-2 |
| Hero board/trucks/wheels | **Bespoke** | gap-hero-board |
| Unbranded shoes | **Bespoke** | gap-shoes-feet |
| Pro modular plaza | **Bespoke + some procedural** | gap-modular-plaza |
| Grip tape material | Procedural or bespoke | gap-grip-tape-material |
| Skate grind field recording | Auth-gated candidate | cand-fs-grind-655371 |

Hashes/LICENSE/SOURCE: see `assets/catalog/assets.json` and vendor sidecars.
Machine ledger: `asset-readiness.json`.

---

## 2. Procedural Three.js vs must-be-GLB

| Can be procedural in Three (if quality holds) | Must be GLB / authored |
| --- | --- |
| Simple curbs, flat ground planes, basic boxes for early blockout | Hero board with trucks/wheels detail |
| Dark high-roughness grip material (noise) | Hero shoes with readable silhouette |
| Temporary colliders for layout | Modular plaza hero pieces (banks, QP, stairs with trim) |
| Debug gizmo meshes | Final rail metal with bevels if hero |
| Particle dust (optional) | Any mesh that must match art rubric beauty shots |

**Rule:** Procedural is allowed for non-hero structural pieces. Do not permanently ship Kenney mini aesthetic.

---

## 3. Audio event map

| Event | Proxy pack | Notes |
| --- | --- | --- |
| roll | procedural soft loop | Field later |
| push | kenney-impact-sounds | Map soft whoosh/hit |
| pop | kenney-impact-sounds | Short hit |
| catch | kenney-impact-sounds | Soft tick |
| land | kenney-impact / oga wood | |
| bail | kenney-impact cluster | |
| grind | oga-100-cc0-metal-wood-sfx | Metal scrape/hit mapping |
| ambience | oga-100-cc0-sfx-2 | Street/highway loops |
| ui | kenney-interface-sounds | |

None are runtime-ready until listen pass + loudness normalize + mapping table committed.

**Negative result:** Freesound skate grind 655371 labeled CC0 but **download requires login** — not acquired; catalog-candidate-auth-gated.

---

## 4. Isolated Blender task contract {#isolated-blender-task-contract}

### 4.0 Ownership preflight (mandatory)

Before any Blender use:

1. List processes: if a non-SlackPad Blender is running, **pause** — do not attach, save, close, or create a second process for the foreign scene.
2. Only proceed when no foreign Blender owns the workstation **or** an explicitly isolated SlackPad-only Blender is approved by the user.
3. Output paths must be under this repo only:
   - `assets/source/blender/hero-board/`
   - `assets/source/blender/shoes/`
   - `assets/source/blender/plaza-modules/`
   - exports → staging then pipeline → `assets/runtime/` only after review
4. Do not read other game repos, shared Blender temps, or foreign recent files.

### 4.1 Hero board deliverables

- `hero-board.blend` + `hero-board.glb`
- Parts: Deck, GripTape, Truck_F/R, Axle_F/R, Wheel_*, Socket_NoseFoot, Socket_TailFoot
- Dimensions: length 0.80 m, width 0.20 m, wheelbase ~0.43 m
- LOD0/1/2 tri budgets per cycle-2 brief
- Materials unbranded; UV unique on deck
- Collider proxies as empties or separate low meshes named `COL_*`
- Renders: 3/4 hero, macro trucks, underside, flip top/bottom readability

### 4.2 Shoes deliverables

- `shoes.blend` + `shoes.glb` (L/R)
- Unbranded; LOD0 ~3–6k tris/shoe
- Sole uses rubber material candidate; upper fabric/suede
- Renders: planted, flick lift, catch, bail detach

### 4.3 Plaza modules deliverables

- Modular pieces: flat, ledge, rail segment, stairs, bank, QP corner
- Named collision meshes `*_Col_*`
- Kenney may seed layout metrics only

### 4.4 Acceptance + catalog

- Pass art shot rubric professional bar
- glTF Transform + meshopt + KTX2 pipeline
- Update `assets/catalog/assets.json` with hashes
- Promote to `assets/runtime/` only with quality/license/runtime evidence

### 4.5 Do not run this contract during cycle 3

Blender is unavailable (foreign ownership). Contract is for M8 / autonomous goal pause/resume.

---

## 5. World / plaza design

- Compact line-rich plaza; THUG2-style loops not open city
- ≥3 readable lines for first ship
- Blockout allowed pre-G2 with Kenney; final look after G1 accept + art milestone

## 6. UI

- Minimal HUD: speed optional, grind balance, score pop, stance indicator
- Desktop safe areas 16:9 and 16:10
- No HUD covering board center
- Onboarding: calibration → push → ollie → flip → grind

## 7. Quality bar

Professional tactile materials, readable shadows, HDRI lighting path.
**Forbidden:** permanent low-poly toy look as performance “solution.” Use LOD/budgets instead.
