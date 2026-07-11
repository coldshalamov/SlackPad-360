# Internet Stop Log — Cycle 2

**Access date:** 2026-07-10

Purpose: record where research helped, dead ends, and why more browsing has diminishing value.

---

## 1. Search areas covered

| Area | Decisive primary sources | Outcome |
| --- | --- | --- |
| Win11 touchpad pointer APIs | learn.microsoft.com RegisterTouchpadCapable, GetPointerTouchpadInfo, PTP portal | API shape confirmed; free dual-plant **not** proven; pre-release disclaimer |
| PTP HID | MS Precision Touchpad collection + buttons report-level | Field inventory confirmed |
| Raw Input | MS Raw Input docs + emoacht sample repo | Viable multi-contact class path |
| WebView2 transport | MS Edge WebView2 interop docs | PostWebMessageAsJson primary; SharedBuffer fallback concept |
| Rapier npm | npmjs `@dimforge/rapier3d*` + rapier.rs determinism | Exact packages 0.19.3; compat selected |
| Tooling npm | three, vite, vitest, fast-check, three-mesh-bvh, gltf-transform | Versions recorded |
| HDRI | polyhaven.com/a/kloppenheim_05_puresky + license | Downloaded CC0 |
| Materials | ambientcg Concrete040, Metal006, WoodFloor043 | Downloaded CC0 |
| Blockout kit | kenney.nl/assets/mini-skate | Downloaded CC0; rejected final look |
| Free hero board/shoes | free3d, sketchfab, thingiverse, meshy, makerworld samples | **Dead end** for high-quality + safe redistribute + unbranded |
| Audio | Freesound grind 655371 page | Candidate only; download deferred |
| OSS skate/vehicle source | github.com/3deric/Godot_Skate @ e4ff468; github.com/DAShoe1/Godot-Easy-Vehicle-Physics @ c392257; MIT LICENSE + character_controller.gd / vehicle.gd / wheel.gd | Grind Path3D latch + raycast wheel force patterns **studied**; wholesale adopt **rejected** |

---

## 2. Decisive sources (bookmark)

1. https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/registertouchpadcapable
2. https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/getpointertouchpadinfo
3. https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/touchpad-windows-precision-touchpad-collection
4. https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/communicate-btwn-web-native
5. https://www.npmjs.com/package/@dimforge/rapier3d-deterministic-compat
6. https://rapier.rs/docs/user_guides/javascript/determinism/
7. https://polyhaven.com/a/kloppenheim_05_puresky
8. https://ambientcg.com/view?id=Concrete040
9. https://kenney.nl/assets/mini-skate

Full machine catalog: `sources.json`.

---

## 3. Dead ends

| Dead end | Why stop |
| --- | --- |
| Searching for “free dual touchpad game API proven” | Only docs + samples; target device required |
| Marketplace free skateboards | License/quality fail |
| AI model galleries claiming CC0 without page verification | Not treated as evidence without license page |
| Stars ranking OSS skate repos | Stars ≠ inspectable suitability |
| More blog posts summarizing PTP | Secondary; primary MS pages already read |

---

## 4. Why further browsing has diminishing value

1. **G1** is empirical; additional Learn pages will not show this laptop’s free dual-plant.
2. **Rapier/npm** versions re-check only at implement/pin time.
3. **Hero board/shoes** need authoring, not more low-quality free searches.
4. **Feel/ergonomics/visual quality** cannot be proven by web research (project rule).
5. Remaining audio SFX acquisition is an implementation download pass with provenance, not preproduction theory.

**Stop internet research for cycle 2.** Defer version re-pins and audio downloads to implementation-time checks.
