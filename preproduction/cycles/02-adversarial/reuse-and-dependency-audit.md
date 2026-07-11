# Reuse and Dependency Audit — Cycle 2

**Access date:** 2026-07-10
**Registry evidence:** npm view / package pages
**Policy:** No node_modules vendoring; no nested git repos; minimal third_party only with LICENSE + commit + note

---

## 1. Runtime dependencies (adopt)

| ID | Install | Version (2026-07-10) | License | Role | Boundary | Risk | Alt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dep-three | `three` | 0.185.1 | MIT | Render | Not physics | Low | — |
| dep-rapier3d-deterministic-compat | `@dimforge/rapier3d-deterministic-compat` | **0.19.3** | Apache-2.0 | Physics | Sim only | Med WASM | non-compat det |
| dep-vite | `vite` | 8.1.4 | MIT | Bundler | Tooling | Low | — |
| dep-webview2 | WebView2 Evergreen + NuGet SDK | evergreen | Microsoft | Host shell | Messaging | Low-Med | Electron |
| dep-dotnet-host | net8.0-windows | LTS line | MIT/.NET | Host | Bridge | Low | Rust host |

### Rapier decision detail

| Package | Exists? | Selected? |
| --- | --- | --- |
| `@dimforge/rapier3d-deterministic-compat` | Yes 0.19.3 | **Primary** |
| `@dimforge/rapier3d-deterministic` (optional alt non-compat) | Yes 0.19.3 | Optional alt (separate WASM) |
| `@dimforge/rapier3d` | Yes 0.19.3 | Reject as primary |
| Cycle-1 bare name without strategy | Ambiguous | Quote only as defect |

**Import:** `import RAPIER from '@dimforge/rapier3d-deterministic-compat'; await RAPIER.init();`
**Determinism:** official JS guide — cross-platform if same version/order/ICs; avoid non-det Math for sim inputs.
**Sources:** npm pages; https://rapier.rs/docs/user_guides/javascript/determinism/

---

## 2. Dev / pipeline

| ID | Install | Version | License | Decision |
| --- | --- | --- | --- | --- |
| vitest | `vitest` | 4.1.10 | MIT | adopt |
| fast-check | `fast-check` | 4.9.0 | MIT | adopt (dev) |
| three-mesh-bvh | `three-mesh-bvh` | 0.9.11 | MIT | adopt-optional (render queries only) |
| @gltf-transform/cli | `@gltf-transform/cli` | 4.4.1 | MIT | adopt pipeline |
| meshoptimizer/gltfpack | binary/npm | pin-at-build | MIT | adopt pipeline |
| KTX-Software | release binary | pin-at-build | Apache-2.0 | adopt pipeline |
| spectorjs | `spectorjs` | pin-at-implement | MIT | adopt-optional-dev |

---

## 3. Reference / reject

| Project | URL | License | Decision | Why |
| --- | --- | --- | --- | --- |
| RawInput.Touchpad | https://github.com/emoacht/RawInput.Touchpad | MIT | study | HID patterns; not product lib |
| WebView2Samples | https://github.com/MicrosoftEdge/WebView2Samples | MS sample | study | Messaging patterns; reimplement |
| AbsoluteTouchEx | https://github.com/apsun/AbsoluteTouchEx | MIT | **reject** | Injection + absolute pad model |
| cannon-es | https://github.com/pmndrs/cannon-es | MIT | reject | Rapier preferred |
| Electron | electronjs.org | MIT | optional fallback packaging | Weight |
| Free Godot/Unity skate kits | various | vary | study feel only | No wholesale IP/behavior copy |

**third_party/reference:** none copied this cycle — study links sufficient.

---

## 4. Host language evidence

| Path | Pros | Cons |
| --- | --- | --- |
| **C# / .NET 8 + WebView2** | Samples, Windows productivity, NuGet WebView2 | HID unsafe parse still possible if careless |
| Rust + WebView2 | Memory safety culture | Higher host interop cost, fewer turnkey samples |

**Primary:** C#.
**Switch trigger:** documented HID safety failure class, or org-wide Rust mandate.

---

## 5. OSS skating / vehicle source audit (inspected 2026-07-10)

Stars ≠ quality. Findings from **source files + LICENSE + HEAD commit**, not marketplace blurbs.

### 5.1 `3deric/Godot_Skate`

| Field | Value |
| --- | --- |
| URL | https://github.com/3deric/Godot_Skate |
| License | MIT |
| Commit | `e4ff4687fa4f03a9cbe3a86d5f6e65607032cc9e` |
| Sources | `Skategame/Scripts/character_controller.gd` (~18 KB), README, `Scripts/Editor/rail_*.gd` |
| Decision | **study** (algorithms/workflows); **reject** wholesale adoption |

| Reusable idea | File evidence | Adopt? |
| --- | --- | --- |
| Rail as `Path3D` + closest-offset grind entry | `character_controller.gd` overlap `rampRail` → `get_closest_offset` → `GRIND` | Study → reimplement as grind latch on Rapier board |
| Project velocity onto curve tangent for grind speed | `path_vel = velocity.project(curve_tangent)...` | Study |
| Balance angle fail bail (`|angle| > π/4`) | `_fall("balance issues")` | Study as fail cone cousin |
| Editor park naming (`*_Col_Floor`, `*_Rail_*`) | README + `park_setup.gd` | Study asset workflow only |
| Kinematic character + button Grind action | whole controller | **Reject** for product physics/input |
| MetaHuman-derived character / Kenney textures as ship art | README notes | **Reject** as SlackPad hero path |

### 5.2 `DAShoe1/Godot-Easy-Vehicle-Physics`

| Field | Value |
| --- | --- |
| URL | https://github.com/DAShoe1/Godot-Easy-Vehicle-Physics |
| License | MIT |
| Commit | `c392257f54f6ca537dc10bc5badad0c060f18982` |
| Sources | `addons/gevp/scripts/vehicle.gd`, `wheel.gd` (extends RayCast3D) |
| Decision | **study** for Model B; **reject** as runtime dependency |

| Reusable idea | File evidence | Adopt? |
| --- | --- | --- |
| Per-wheel raycast suspension length → spring/damper force at contact | `wheel.gd` `process_suspension` / `process_forces` + `apply_force` | Study for P3 raycast board |
| Lateral + longitudinal force split at contact | `force_vector.x/y` apply_force | Study |
| Assist knobs orthogonal to core suspension | `vehicle.gd` stability/traction exports | Study (maps to assist levels) |
| Documented ≥120 Hz physics note | README “Physics Engine” | Study — supports Hz **benchmark**, not mandate |
| Godot vehicle addon as npm/host dep | whole repo | **Reject** |

### 5.3 Explicit non-adoptions

| Project | Reason |
| --- | --- |
| AbsoluteTouchEx | Process injection; absolute pad→screen |
| Proprietary Skate/THUG code | Closed; study feel only via public marketing, never code |
| Unlicensed Unity “skate tutorial” dumps without SPDX | Reject until license on source tree |

**third_party/reference:** none copied this cycle — findings recorded; reimplement when coding. Optional later: minimal MIT excerpts only with LICENSE + commit note.

### 5.4 Sources.json IDs

- `oss-godot-skate`
- `oss-gevp-vehicle`

---

## 6. Maintenance signal summary

All selected npm packages returned current latest versions on 2026-07-10 via `npm view`. Re-pin at implementation; re-run G4 on Rapier upgrades.
