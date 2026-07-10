# Technology, Performance, Dependencies, and Assets

**Access date:** 2026-07-10

Labels: **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**

---

## 1. Runtime architecture comparison

| Option | Dual-foot input | Three.js fit | Latency | Packaging | Portability | Maintenance | Security | License notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Pure browser** | **Fail** | Excellent | N/A (wrong input) | URL | High | Low | Standard web | — |
| **Electron + native module** | Good (N-API HID) | Excellent | Good | Heavy installers | Win/mac/linux shells | Chromium updates | Node integration risk if misconfigured | Electron/Chromium licenses; native code |
| **Tauri 2 + Rust HID** | Good | WebView render | Good | Smaller binaries | Good | Rust+JS dual skill | Smaller attack surface if careful | Tauri/Apache-MIT ecosystem |
| **Win32 + WebView2** | **Best on Windows** | Excellent (Chromium) | Best control | MSIX/installer + Evergreen WV2 | Windows-first | Host C++/C#/Rust + TS | Host owns permissions | WebView2 runtime redistrib |
| **Local native bridge process** | Good for probes | Via WS to browser | Extra hop | Two processes | Awkward | Sync versions | Localhost trust | Research useful |

### Committed choice

**Recommendation:** **Win32 (or Rust) host + WebView2 + touchpad bridge → ContactFrame → TS game**. Bridge order: Win11 `RegisterTouchpadCapableWindow` + `GetPointerFrameTouchpadInfo` first; Raw Input HID PTP fallback.

**Fallback:** Electron + N-API if multi-OS shell demanded before Windows G1–G4 complete.

**Reject for production human input:** pure browser.

**Probe-only:** standalone bridge.

Rationale: README already anticipates native bridge; research confirms browser gap (`input-feasibility.md`); WebView2 minimizes extra Chromium shipping vs Electron while keeping Three.js.

---

## 2. Game stack (recommended pins at implement time)

| Layer | Choice | License (verify at pin) | Role |
| --- | --- | --- | --- |
| Language | TypeScript | — | Game logic |
| Bundler | Vite | MIT | Dev/build |
| Renderer | three | MIT | 3D |
| Physics | `@dimforge/rapier3d-deterministic` | Apache-2.0 / MIT (confirm package) | Sim |
| Input host | WebView2 + Win11 touchpad pointer APIs / Raw Input HID | Microsoft terms for WV2 | Contact stream |
| Schema | zod or similar | MIT | ContactFrame validate |
| Tests | vitest | MIT | Unit/golden |
| Lint | eslint + prettier | MIT | Quality |

**Confirmed fact:** Rapier JS installs via npm; WASM async init; deterministic flavor exists for cross-platform guarantees.

**Recommendation:** Avoid React Three Fiber for v1 core loop unless team velocity needs it—keep thinner control over fixed step. R3F optional for tools.

---

## 3. Simulation / render rates

| Clock | Rate | Notes |
| --- | --- | --- |
| HID / ContactFrame | Device (~100 Hz class **hypothesis**) | Timestamped buffer |
| Physics | **120 Hz** preferred, 60 Hz minimum | Fixed step |
| Gesture FSM | Same as physics | Deterministic |
| Render | 60 FPS target (vsync) | Interpolate |
| Telemetry flush | 1–5 Hz or on event | — |

---

## 4. Performance plan (integrated GPU laptops)

### Budgets (recommendation)

| Resource | Budget |
| --- | --- |
| Draw calls | &lt; 150 primary scene |
| Triangles visible | &lt; 300k soft / 500k hard |
| Shadow map | 1024–2048, one sun cascade start |
| Post-process | Light: color grade + optional SMAA/FXAA; delay SSR/SSAO |
| Textures | KTX2 UASTC/ETC1S; max 2k for hero, 1k props |
| Audio voices | ≤ 32 |
| JS main thread physics | &lt; 4 ms/step @120 Hz average |

### Techniques

- **glTF/GLB** + **meshopt** and/or Draco; prefer meshopt for decode cost balance (`gltfpack` MIT).
- **KTX2** via `KTX2Loader` + Basis transcoder (three.js examples).
- Instancing for repeated props.
- Lightmap or probe GI for static park; one directional + ambient/hemisphere.
- LOD / distance cull.
- `renderer.powerPreference = "high-performance"`.
- Handle **WebGL context loss** (listen `webglcontextlost` / restore; reload GPU resources).
- Stream park chunks only after milestone (single small park first).

### Professional look without overspend

**Recommendation:** Strong art direction (materials, composition, animation juice) &gt; heavy post stack. Avoid intentionally ugly “dev shader” aesthetic; use PBR materials, good HDRI ambient, readable silhouettes.

---

## 5. Asset catalog (downloadable; catalog before import)

**Policy:** Catalog here first; download only small clearly licensed research samples if needed. No bulk import in this research pass.

### 5.1 Libraries / engines (code)

| Item | URL | License | Attribution | Use |
| --- | --- | --- | --- | --- |
| three.js | https://threejs.org/ / https://github.com/mrdoob/three.js | MIT | Retain copyright notice | Renderer |
| Rapier | https://rapier.rs/ / https://github.com/dimforge/rapier | Apache-2.0 OR MIT | Per LICENSE files | Physics |
| Vite | https://vitejs.dev/ | MIT | Notice | Tooling |
| gltfpack / meshoptimizer | https://meshoptimizer.org/gltf/ | MIT | Notice | Pipeline |
| Khronos glTF | https://www.khronos.org/gltf/ | Spec free; assets vary | — | Format |
| WebView2 | https://developer.microsoft.com/microsoft-edge/webview2/ | Microsoft SW License / evergreen runtime | Microsoft terms | Host |

### 5.2 HDRIs / environments (candidates)

| Source | URL | Typical license | Notes |
| --- | --- | --- | --- |
| Poly Haven | https://polyhaven.com/ | CC0 | HDRIs, textures; verify per asset |
| AmbientCG | https://ambientcg.com/ | CC0 | Materials |
| HDRI Haven legacy | now Poly Haven | CC0 | — |

### 5.3 Models / props (candidates)

| Source | URL | License | Notes |
| --- | --- | --- | --- |
| Kenney.nl | https://kenney.nl/assets | CC0 | Prototype park kits |
| Poly Haven models | https://polyhaven.com/models | CC0 | Check each |
| Sketchfab CC-BY | https://sketchfab.com/ | Varies CC-BY | **Attribution required**; avoid non-commercial if shipping |
| glTF Sample Models | https://github.com/KhronosGroup/glTF-Sample-Models | Various (often permissive) | Pipeline tests only |

### 5.4 Sounds (candidates)

| Source | URL | License | Notes |
| --- | --- | --- | --- |
| Freesound | https://freesound.org/ | CC0 / CC-BY / sampling+ | **Per-file license check** |
| Kenney UI/sounds | kenney.nl | CC0 | Prototype SFX |

### 5.5 Tools

| Tool | URL | License | Use |
| --- | --- | --- | --- |
| Blender | https://www.blender.org/ | GPL (app); output owned by you | Modeling |
| toktx (KTX-Software) | https://github.com/KhronosGroup/KTX-Software | Apache-2.0 | KTX2 encode |
| gltf-transform | https://gltf-transform.dev/ | MIT | Optimize |

**Recommendation:** Prototype exclusively with **CC0** (Kenney + Poly Haven) to eliminate attribution risk; introduce CC-BY only with a tracked credits system.

---

## 6. Dependency risk notes

- **Electron size / update cadence** — security patches required if chosen.
- **WebView2 evergreen** — depends on user runtime; bootstrap installer.
- **Rapier WASM** — load time; show loading shell.
- **Native HID code** — memory safety (prefer Rust) and pointer parsing bugs.
- **Asset license contamination** — one bad Sketchfab grab can block ship.

---

## 7. Context loss and streaming

**Recommendation:**

- Single “skate plaza” GLB for milestone (&lt; 25 MB compressed target).
- On context restore: reinit renderer, reload textures, resync from sim state (sim is CPU).
- Do not store authority state only in GPU buffers.

---

## 8. Unresolved

- Final host language (C# WebView2 vs Rust+WebView vs C++). **Recommendation lean:** C# or Rust for safer velocity.
- Whether to support macOS Force Touch trackpad dual-contact later (separate IOKit research).
- Exact three.js major version pin (use current stable at implementation).
