# Asset Acquisition and Pipeline — Cycle 1

**Access date:** 2026-07-10
**Policy:** Catalog-first. Download only clearly commercial-reusable assets that are genuinely useful. Never equate “downloadable” with redistributable.

---

## 1. Workspace contract

| Path | Purpose |
| --- | --- |
| `assets/catalog/` | Machine-readable manifests |
| `assets/source/vendor/` | Untouched licensed originals + LICENSE/source URL |
| `assets/source/blender/` | Editable project `.blend` sources |
| `assets/reference/` | Legally retainable references |
| `assets/generated/` | Previews, candidates, AI/experimental outputs |
| `assets/runtime/` | **Validated shipping** GLB/textures/audio only |

**Hard rule:** No unreviewed candidate in `assets/runtime/`. Cycle 1 leaves runtime empty (`.gitkeep` only).

Code dependencies live in `assets/catalog/dependencies.json`, **not** vendored as art.

---

## 2. Catalog record fields (mandatory)

Every asset record in `assets/catalog/assets.json`:

| Field | Description |
| --- | --- |
| `id` | Stable id |
| `description` | What it is |
| `sourceUrl` | Canonical origin |
| `author` | Creator |
| `license` | Human string |
| `spdx` | SPDX id when known |
| `retrievalDate` | ISO date when fetched (null if not downloaded) |
| `originalFilename` | Vendor filename |
| `checksum` | sha256 if file present, else null |
| `allowedUses` | e.g. commercial, modify, redistribute |
| `attributionRequirement` | none / required text |
| `modificationStatus` | unmodified / modified / derived |
| `runtimeIntent` | none / candidate / shipping |
| `reviewStatus` | unreviewed / approved / rejected |
| `path` | repo-relative path if present |

Licenses ledger: `assets/catalog/licenses.json`.
Dependencies: `assets/catalog/dependencies.json`.

---

## 3. Units, axes, naming, pivots

| Convention | Value |
| --- | --- |
| Unit | 1 m |
| Up | +Y |
| Forward (board) | **+Z** (nose); right **+X**; up **+Y** — same as physics-and-camera-spec (glTF-friendly) |
| glTF export | Y-up, +Z forward mesh intent documented per asset |
| Naming | `sm_board_hero`, `sm_plaza_rail_01`, `col_rail_01`, `tex_board_bc` |
| Pivot board | Deck center between trucks, wheels down |
| Pivot rail | Along centerline, Y up |
| Collision proxy | `col_*` separate or custom property |

---

## 4. Materials and textures

| Rule | Spec |
| --- | --- |
| Workflow | PBR metallic-roughness |
| Hero texel density | ~512–1024 px/m for board |
| Props | ~256–512 px/m |
| Max resolution | 2k hero, 1k props (budget) |
| Runtime format | KTX2 (UASTC/ETC1S) |
| Authored format | PNG/EXR sources in blender/vendor |

---

## 5. Collision, LOD, lightmaps

| Concern | Policy |
| --- | --- |
| Collision | Simplified primitives; export sidecar or named nodes |
| LOD | LOD0 hero interaction distance; LOD1/2 periphery |
| Lightmaps | Optional for static plaza; or probe/irradiance only |
| Animation | Board wobble/juice procedural preferred; skater clips in GLB |

---

## 6. Export and optimize pipeline

```
Blender (Y-up) → GLB raw
  → gltf-transform / gltfpack (meshopt)
  → KTX2 textures
  → validate triangle/draw budgets
  → reviewStatus approved
  → copy to assets/runtime/
```

Tools:

- meshoptimizer gltfpack — MIT — https://meshoptimizer.org/gltf/
- glTF Transform — MIT — https://gltf-transform.dev/
- KTX-Software — Apache-2.0 — https://github.com/KhronosGroup/KTX-Software
- three.js KTX2Loader — MIT — https://threejs.org/

---

## 7. Performance budgets (art)

| Budget | Target |
| --- | --- |
| Draw calls | <150 primary |
| Visible tris | <300k soft / 500k hard |
| Plaza package | <25 MB compressed hypothesis |
| Shadow map | 1024–2048 start |
| Audio | ≤32 voices |

---

## 8. Acquisition rules (cycle 1)

1. Prefer **CC0** (Kenney, Poly Haven, AmbientCG).
2. CC-BY only with credits system planned.
3. Reject NC/ND for shipping.
4. Reject unclear Sketchfab “free download” without license file.
5. **Cycle 1 download decision:** no bulk download. Catalog candidates; optional single CC0 fetch only if needed for validation.
6. This cycle **does not** populate `assets/runtime/`.

### Candidate sources (not auto-approved)

| Source | URL | Typical license | Intent |
| --- | --- | --- | --- |
| Kenney Mini Skate | https://kenney-assets.itch.io/mini-skate | CC0 | Blockout plaza / characters study |
| Kenney City kits | https://kenney.nl/assets | CC0 | Modular surrounds |
| Poly Haven HDRI/models | https://polyhaven.com/ | CC0 per asset | Lighting / props |
| AmbientCG | https://ambientcg.com/ | CC0 | Materials |
| Khronos glTF samples | https://github.com/KhronosGroup/glTF-Sample-Models | various | Pipeline tests only |

---

## 9. Blender MCP usage log (cycle 1)

| Date | Action | Output |
| --- | --- | --- |
| 2026-07-10 | No final art authored via Blender MCP in this cycle | N/A — direction-only foundation |

If later cycles use Blender MCP, append rows here or in cycle notes.

---

## 10. Verification

| Check | Method |
| --- | --- |
| Catalog schema | `validate-cycle-01.mjs` |
| Runtime empty of unreviewed | validator + reviewStatus |
| License beside vendor files | path existence when downloaded |
| Budget | automated mesh stats in pipeline (future) |
