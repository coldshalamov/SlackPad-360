# Reuse Audit — Code, Libraries, Assets

**Access date:** 2026-07-10
Audit of named candidates only. **Catalog before import; do not vendor blindly.**

| Field | Meaning |
| --- | --- |
| License | As stated by project; re-verify at pin |
| Maintenance | Activity / last meaningful release signal |
| Reuse | What to learn or optionally adopt |
| Do not use | Why not ship as-is |

---

## 1. RawInput.Touchpad (emoacht)

| | |
| --- | --- |
| **URL** | https://github.com/emoacht/RawInput.Touchpad |
| **License** | MIT |
| **Maintenance** | Small sample; release v1.0.0 dated 2021-06-17; low commit volume — **maintenance-light / sample** |
| **Reusable modules** | C# pattern for `RegisterRawInputDevices` on digitizer touchpad; per-contact parse inspired by TouchpadGestures_Advanced |
| **Architectural lessons** | Confirms app-level multi-contact PTP via Raw Input is practical; UI shows N contacts with coordinates |
| **Do not use as-is** | .NET 5 sample, not a library; not Win11 `GetPointerFrameTouchpadInfo` path; no ContactFrame contract; no game loop. **Reference implementation only** for P0-B |

---

## 2. AbsoluteTouchEx (apsun)

| | |
| --- | --- |
| **URL** | https://github.com/apsun/AbsoluteTouchEx |
| **License** | MIT |
| **Maintenance** | Last release 1.1.0 (2019-04-27); inactive |
| **Reusable modules** | Calibration rectangle concept (map pad region); absolute himetric→screen mapping ideas |
| **Architectural lessons** | Absolute pad→screen is a **cursor/tablet** model; injects into process and hooks APIs for speed |
| **Do not use** | Process injection / API hooking (**anti-cheat risk**, security); wrong control model for skate (finite pad→world); not dual-foot game grammar. Use only as negative example for absolute mapping |

---

## 3. Microsoft WebView2Samples

| | |
| --- | --- |
| **URL** | https://github.com/MicrosoftEdge/WebView2Samples |
| **License** | Microsoft open-source sample terms / CLA (confirm `LICENSE` in tree at clone; historically sample copyright headers) |
| **Maintenance** | Actively used Microsoft sample set |
| **Reusable modules** | Host↔web message patterns; window creation; environment options; focus handling |
| **Architectural lessons** | Canonical way to host Chromium UI with native input side-channel |
| **Do not use wholesale** | Samples are tutorials, not a game shell; strip to minimal host. Prefer MIT/Apache game code ownership in app layer |

---

## 4. Shuvit 1 / 2 (open skate game)

| | |
| --- | --- |
| **URL** | Historical: shuvit.org / Blender Game Engine open skate project (community references e.g. Reddit 2018; itch free tag listings) |
| **License** | **Unresolved at pin** — verify Blender/.blend and scripts (often GPL for BGE-era projects); do not ship assets until license file confirmed |
| **Maintenance** | Effectively **dormant / abandoned** for modern engines |
| **Reusable modules** | Level layout ideas; trick naming culture; “open skate feel” reference |
| **Architectural lessons** | Early open skate ambition; BGE stack obsolete for Three.js path |
| **Do not use** | Do not depend on dead runtime; do not copy assets without license proof. Treat as **design reference only** |

---

## 5. $P+ (point-cloud multistroke recognizer)

| | |
| --- | --- |
| **URL** | https://depts.washington.edu/acelab/proj/dollar/pdollarplus.html |
| **License** | New BSD (3-clause) per project page |
| **Maintenance** | Academic; stable reference code (JS/C# downloads); paper CHI 2017 |
| **Reusable modules** | Template point-cloud matching for 2D stroke gestures; good for **offline** flick shape experiments |
| **Architectural lessons** | Explainable template matching; low training cost |
| **Do not use as primary recognizer** | Prior research prefers rule FSM + click windows for latency/explainability; $P+ is secondary for fancy flicks. $Q exists as faster successor for low-power |

---

## 6. fast-check

| | |
| --- | --- |
| **URL** | https://www.npmjs.com/package/fast-check · https://fast-check.dev/ |
| **License** | MIT (verify package) |
| **Maintenance** | Active (modern releases on npm) |
| **Reusable modules** | Property-based generators for ContactFrame streams, recognizer invariants, replay diffs |
| **Architectural lessons** | Complements golden traces; finds edge cases human tests miss |
| **Do not use** | N/A as product dependency in runtime — **devDependency only**. Do not replace unit tests entirely |

---

## 7. three-mesh-bvh

| | |
| --- | --- |
| **URL** | https://www.npmjs.com/package/three-mesh-bvh · https://github.com/gkjohnson/three-mesh-bvh |
| **License** | MIT |
| **Maintenance** | Active, widely used in three.js ecosystem |
| **Reusable modules** | BVH raycast acceleration; mesh spatial queries for grind guides / camera collision |
| **Architectural lessons** | Keep physics colliders simple in Rapier; use BVH for **render mesh** queries and tools |
| **Do not use** | As physics engine substitute; dual collision systems must not fight Rapier authority |

---

## 8. Rapier examples / testbeds

| | |
| --- | --- |
| **URL** | https://rapier.rs/ · https://github.com/dimforge/rapier.js (testbed demos) |
| **License** | Apache-2.0 OR MIT (confirm package LICENSE) |
| **Maintenance** | Active |
| **Reusable modules** | `world.step` loop; debug render; joint/collider setup patterns; deterministic package selection |
| **Architectural lessons** | Fixed step; don’t drive physics from mesh transforms |
| **Do not use** | Copy testbed UI wholesale; avoid non-deterministic build if golden traces required |

---

## 9. glTF tooling (gltfpack / gltf-transform / KTX)

| | |
| --- | --- |
| **URL** | https://meshoptimizer.org/gltf/ · https://gltf-transform.dev/ · https://github.com/KhronosGroup/KTX-Software |
| **License** | MIT (meshoptimizer/gltfpack); MIT (gltf-transform); Apache-2.0 (KTX-Software) |
| **Maintenance** | Active industry tools |
| **Reusable modules** | meshopt compress; texture KTX2; prune/weld pipeline for plaza GLB |
| **Architectural lessons** | Budget triangles/textures early; pipeline > hand-tuning |
| **Do not use** | Unlicensed sample models from random marketplaces |

---

## 10. Cross-cutting recommendations

| Prefer | Avoid |
| --- | --- |
| MIT/Apache/BSD/CC0 components | Injection hacks, unclear GPL assets without counsel |
| Patterns from RawInput.Touchpad | AbsoluteTouchEx in product |
| WebView2Samples host patterns | Shipping entire sample apps |
| fast-check + golden ContactFrames | ML black-box as v0 gate |
| Rapier deterministic flavor for tests | Parallel physics authority in three-mesh-bvh |

---

## 11. License pin checklist (before any import)

1. Clone/download LICENSE file.
2. Record version + URL in credits.
3. Reject if dual-license unclear for commercial ship.
4. CC0-first for art (Kenney, Poly Haven) per prior tech research.
