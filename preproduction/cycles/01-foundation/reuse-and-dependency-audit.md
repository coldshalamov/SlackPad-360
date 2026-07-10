# Reuse and Dependency Audit — Cycle 1

**Access date:** 2026-07-10
**Policy:** Inspect primary repos/docs. Record adopt / study / reject. Re-verify license at pin. “Available to download” ≠ permission to redistribute.

---

## 1. Named dependency audits

### 1.1 RawInput.Touchpad (emoacht)

| Field | Value |
| --- | --- |
| URL | https://github.com/emoacht/RawInput.Touchpad |
| License | MIT (repo LICENSE.txt) |
| Tag/release | v1.0.0 (2021-06-17); maintenance-light sample |
| Language | C# |
| Architecture | RegisterRawInputDevices; parse PTP contacts; WPF UI demo |
| Reuse | **Study** patterns for P0-B HID parse |
| Reject reason (as-is) | Sample app, not library; no ContactFrame; no Win11 GetPointerFrameTouchpadInfo path |
| Transitive risk | Low (MIT sample) |
| Decision | **study** |

### 1.2 Microsoft WebView2Samples

| Field | Value |
| --- | --- |
| URL | https://github.com/MicrosoftEdge/WebView2Samples |
| License | Microsoft sample terms / per-tree LICENSE (confirm at clone) |
| Maintenance | Active Microsoft samples |
| Reuse | Host↔web messaging, environment options, focus |
| Reject wholesale | Tutorial apps ≠ game shell |
| Decision | **study** (copy patterns, own code) |

Primary messaging docs: https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/communicate-btwn-web-native

### 1.3 Rapier / rapier.js

| Field | Value |
| --- | --- |
| URL | https://rapier.rs/ · https://github.com/dimforge/rapier · https://github.com/dimforge/rapier.js |
| npm | `@dimforge/rapier3d-deterministic` / `-compat` (e.g. 0.19.x lineage published 2025-11; re-pin at implement) |
| License | Apache-2.0 (crate/npm — verify package LICENSE at pin); dual culture Apache/MIT in ecosystem |
| Maintenance | Active |
| Ownership boundary | **Simulation authority only** |
| Decision | **adopt** (deterministic flavor for goldens) |

### 1.4 Three.js

| Field | Value |
| --- | --- |
| URL | https://threejs.org/ · https://github.com/mrdoob/three.js |
| License | MIT |
| Ownership | Rendering, loaders, math helpers — **not** physics authority |
| Decision | **adopt** |

### 1.5 fast-check

| Field | Value |
| --- | --- |
| URL | https://github.com/dubzzz/fast-check · https://fast-check.dev/ |
| License | MIT |
| Ownership | **devDependency** property tests for ContactFrame streams |
| Reject | Runtime ship dependency |
| Decision | **adopt** (dev) |

### 1.6 three-mesh-bvh

| Field | Value |
| --- | --- |
| URL | https://github.com/gkjohnson/three-mesh-bvh |
| License | MIT |
| Ownership | Render-mesh raycast / camera collision helpers |
| Reject | Second physics world |
| Decision | **adopt optional** (tools/render) |

### 1.7 glTF Transform / meshoptimizer / KTX2

| Item | URL | License | Decision |
| --- | --- | --- | --- |
| glTF Transform | https://gltf-transform.dev/ | MIT | **adopt** pipeline |
| meshoptimizer gltfpack | https://meshoptimizer.org/gltf/ | MIT | **adopt** pipeline |
| KTX-Software | https://github.com/KhronosGroup/KTX-Software | Apache-2.0 | **adopt** pipeline |
| KTX2Loader (three) | three.js examples | MIT | **adopt** runtime decode |

### 1.8 SpectorJS

| Field | Value |
| --- | --- |
| URL | https://github.com/BabylonJS/Spector.js |
| License | MIT |
| Ownership | WebGL frame capture **dev/debug only** |
| Reject | Default production dependency / always-on |
| Decision | **adopt optional dev** |

### 1.9 AbsoluteTouchEx (apsun)

| Field | Value |
| --- | --- |
| URL | https://github.com/apsun/AbsoluteTouchEx |
| License | MIT |
| Issue | Process injection / API hooking; absolute pad→screen model |
| Decision | **reject** product use (negative example only) |

### 1.10 $P+ recognizer

| Field | Value |
| --- | --- |
| URL | https://depts.washington.edu/acelab/proj/dollar/pdollarplus.html |
| License | BSD-3-Clause (project page) |
| Decision | **study** offline flick shapes; **reject** as primary recognizer (rule FSM primary) |

---

## 2. Open-source skate / controller candidates

### 2.1 3deric/Godot_Skate (GodotSkate)

| Field | Value |
| --- | --- |
| URL | https://github.com/3deric/Godot_Skate |
| License | MIT (GitHub license metadata) |
| Engine | Godot |
| Maintenance | Prototype-level |
| Reuse | Study grind/rail and arcade skate feel notes |
| Quality | Prototype; not Three.js |
| Decision | **study** (design/feel), **reject** code port as core |

### 2.2 Blooker/Skateboarding

| Field | Value |
| --- | --- |
| URL | https://github.com/Blooker/Skateboarding |
| Engine | Unity C# |
| Theme | THPS/SSX-inspired |
| License | **Verify at clone** (do not assume) |
| Decision | **study** if license clear; no asset lift without proof |

### 2.3 XifengAlpha/Slidingboard-Unity

| Field | Value |
| --- | --- |
| URL | https://github.com/XifengAlpha/Slidingboard-Unity |
| Description | Modular abstract skating |
| License | Verify at clone |
| Decision | **study** modularity ideas; reject blind vendor |

### 2.4 nahkranoth/Skateboard (GGJ 2018)

| Field | Value |
| --- | --- |
| URL | https://github.com/nahkranoth/Skateboard |
| Engine | Unity touch skate jam |
| Decision | **study** touch→board mapping analogies; reject as architecture |

### 2.5 arnauddrain/ugly-skater

| Field | Value |
| --- | --- |
| URL | https://github.com/arnauddrain/ugly-skater |
| Engine | Godot |
| Decision | **study** minimal scope ethos; reject art direction “ugly” as ship target |

### 2.6 Shuvit (historical open skate)

| Field | Value |
| --- | --- |
| URL | Historical shuvit.org / BGE-era references |
| License | **Unresolved** without license file |
| Decision | **reject** assets/code until license proven; design culture reference only |

### 2.7 Skating Rabbit / HTML JS toys

| Field | Value |
| --- | --- |
| Notes | Various topic-tagged demos |
| Decision | **reject** as dependency; may **study** camera toy patterns if license clear |

### 2.8 OpenStudiosCo/Langenium

| Field | Value |
| --- | --- |
| URL | https://github.com/OpenStudiosCo/Langenium |
| Engine | three.js game universe |
| Decision | **study** large three.js project structure only; not skate-specific |

---

## 3. Gesture / replay / camera / park generators

| Candidate | URL | Decision | Notes |
| --- | --- | --- | --- |
| $P+ / $Q | Washington ACE Lab | study | Offline strokes |
| Rapier testbeds | https://github.com/dimforge/rapier.js | study | step/debug patterns |
| three.js example cameras | three.js repo | study | do not copy unchecked |
| Procedural park gens | various | reject until license + fit | Prefer hand-authored compact plaza v0 |
| Replay systems (generic) | e.g. game networking journals | study concepts | ContactFrame is our contract |

---

## 4. Free assets (policy, not bulk import)

| Source | License | Decision |
| --- | --- | --- |
| Kenney Mini Skate | CC0 | **candidate** blockout — catalog before download |
| Poly Haven | CC0 per asset | **candidate** HDRI/textures |
| AmbientCG | CC0 | **candidate** materials |
| Freesound | varies | **per-file** only |
| Random Sketchfab | varies / NC | **reject** without SPDX + commercial OK |

Cycle 1: **no bulk download**; catalogs may list candidates with `reviewStatus: unreviewed` and `runtimeIntent: none`.

---

## 5. Dependency ownership matrix (summary)

| Dependency | Runtime? | Boundary | Reject if… |
| --- | --- | --- | --- |
| three | yes | render | used as physics |
| rapier3d-deterministic | yes | physics | non-deterministic build for goldens |
| WebView2 | host | shell | remote untrusted content |
| fast-check | no | tests | bundled to clients |
| three-mesh-bvh | optional | queries | dual sim |
| SpectorJS | no | debug | always-on ship |
| RawInput.Touchpad | no | study | vendored as product |
| AbsoluteTouchEx | no | — | any injection |
| React Three Fiber | no v0 | — | hides fixed-step (optional tools later) |
| cannon-es / ammo | no | — | unless Rapier blocked |
| Electron | fallback | packaging | default before WV2 tried |

---

## 6. Fashionable tech explicitly not added without need

| Tech | Why not now |
| --- | --- |
| ML gesture nets | Opaque, data-hungry, determinism risk |
| Full ECS frameworks | Overhead before vertical slice |
| Multiplayer netcode | Out of v0 scope |
| Pixel-streaming cloud | Wrong latency for trackpad feel |
| Vendor Synaptics SDK | Lock-in; PTP HID sufficient |

---

## 7. License pin checklist (before import)

1. Clone LICENSE.
2. Record version/commit + URL in catalogs.
3. Reject dual-license ambiguity for commercial ship without counsel.
4. CC0-first art.
5. Run `validate-cycle-01.mjs` after catalog edits.
