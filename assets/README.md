# Assets Workspace

Catalog-first asset management for SlackPad 360. **Do not** drop unlicensed or unreviewed files into `runtime/`.

## Layout

| Path | Purpose |
| --- | --- |
| `catalog/` | Machine-readable manifests (`assets.json`, `licenses.json`, `dependencies.json`) |
| `source/vendor/` | Untouched licensed originals with `LICENSE` / source URL beside them |
| `source/blender/` | Editable project `.blend` sources created for this game |
| `reference/` | Legally retainable visual/technical references |
| `generated/` | Generated candidates and preview renders (not shipping) |
| `runtime/` | **Validated shipping** GLB / textures / audio only |

## Rules

1. Every binary or redistributed file must have a catalog entry with: id, description, source URL, author, license/SPDX when possible, retrieval date, original filename, checksum (if present), allowed uses, attribution requirement, modification status, runtime intent, review status.
2. `runtimeIntent: shipping` requires `reviewStatus: approved`.
3. Code libraries belong in `catalog/dependencies.json`, not under vendor art trees.
4. Prefer CC0 for prototypes (Kenney, Poly Haven, AmbientCG). Verify each asset page.
5. “Available to download” ≠ permission to ship. Reject NC/ND/unclear licenses for commercial runtime.
6. Cycle-1 foundation leaves `runtime/` empty of candidates (`.gitkeep` only).

## Pipeline (summary)

See `preproduction/cycles/01-foundation/asset-acquisition-and-pipeline.md`.

```
vendor/blender sources → optimize (meshopt/KTX2) → review → runtime/
```

## Validation

```bash
node preproduction/probes/validate-cycle-01.mjs
node preproduction/probes/validate-cycle-02.mjs
```

## Cycle 2 note

Selected CC0 sources live under `source/vendor/<asset-id>/` with `LICENSE`,
`SOURCE.md`, original binaries, and SHA-256 catalog entries. Previews are under
`generated/previews/`. Kenney Mini Skate is blockout-only (not final look).
Hero board and shoes remain bespoke gaps (Blender deferred). `runtime/` stays
empty of shipping candidates until approved.
