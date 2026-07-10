# Technical Architecture — Cycle 1

**Status:** Single primary path + fallbacks
**Access date:** 2026-07-10
**Windows-first product**

---

## 1. Primary architecture (committed)

```
┌─────────────────────────────────────────────────────────────┐
│  Native Host (.NET 8 WinUI/WPF or Win32)                    │
│  - RegisterTouchpadCapableWindow (Win11)                    │
│  - GetPointerFrameTouchpadInfo → himetric contacts          │
│  - Fallback: Raw Input HID Touch Pad 0x0D/0x05              │
│  - Normalize → ContactFrame JSON                            │
│  - WebView2 control (Evergreen runtime)                     │
│  - PostWebMessageAsJson / SharedBuffer optional later       │
│  - Focus, packaging, updates, secure host APIs              │
└───────────────────────────┬─────────────────────────────────┘
                            │ ContactFrame stream
┌───────────────────────────▼─────────────────────────────────┐
│  Game (TypeScript, Vite build, loaded in WebView2)          │
│  - Input adapter (host messages | agent | replay)           │
│  - Foot tracker + Gesture FSM                               │
│  - BoardController + Rapier fixed step                      │
│  - Three.js renderer (interpolated)                         │
│  - Telemetry / recording / agent API                        │
└─────────────────────────────────────────────────────────────┘
```

### Why this path

| Criterion | Rationale | Label |
| --- | --- | --- |
| Dual-foot input | Browser alone cannot | **Confirmed fact** (research + PE3 scope) |
| Three.js fit | Chromium WebView2 | **Confirmed fact** |
| Latency | In-process host messages | **Inference** better than separate bridge process |
| Packaging | MSIX/installer + WV2 evergreen | **Recommendation** |
| Weight | Lighter than full Electron ship for v1 Windows | **Recommendation** |

**Host language commitment:** **C# / .NET 8** primary for WebView2Samples alignment and Windows productivity.
**Alternative:** Rust host if HID parsing memory-safety becomes dominant risk — re-evaluate, do not dual-implement in cycle 1 code.

Primary sources:

- RegisterTouchpadCapable: https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/registertouchpadcapable
- GetPointerTouchpadInfo: https://learn.microsoft.com/en-us/windows/win32/input-precisiontouchpad/getpointertouchpadinfo
- WebView2 messaging: https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/communicate-btwn-web-native
- WebView2 overview: https://developer.microsoft.com/microsoft-edge/webview2/

**Note:** Win11 touchpad pointer docs carry pre-release disclaimers on Learn pages (**confirmed fact** research 2026-07-10) — treat as P0 risk; Raw Input is production-capable fallback.

---

## 2. Fallback paths

| Fallback | When | Notes |
| --- | --- | --- |
| **Input P0-B Raw Input** | Win11 pointer path pan/zoom-only or incomplete button/scan | HID parse Touch Pad TLC |
| **Packaging Electron + N-API** | Multi-OS shell required before Windows G1–G4 done | Same ContactFrame contract |
| **Standalone localhost bridge** | Research probes only | Not preferred ship architecture |
| **Tauri 2** | If WebView2 packaging fails and team is Rust-first | Re-evaluate; dual skill cost |
| **Pure browser** | **Rejected** for human dual-foot play | Agent/synthetic still work in browser |

---

## 3. Input API details

### 3.1 P0-A Win11 pointer path

1. `RegisterTouchpadCapableWindow` on game HWND.
2. Handle `WM_POINTER*`.
3. `GetPointerFrameTouchpadInfo` → `POINTER_TOUCH_INFO[]`.
4. Use **himetric** device-relative positions — **not** pixel location fields (freeze at gesture-start cursor per MS docs).
5. Map device rect to 0–1 pad space.
6. Emit ContactFrames with QPC-based `tPerfMs`.

### 3.2 P0-B Raw Input

1. `RegisterRawInputDevices` for HID usage page `0x0D` usage `0x05`.
2. Parse preparsed data: contact id, tip, X/Y, scan time, contact count, Button 1.
3. Same ContactFrame normalize.

Reference pattern (study, not vendor wholesale): https://github.com/emoacht/RawInput.Touchpad (MIT, sample).

### 3.3 OS gesture conflict

Focused game window must consume touchpad messages. Validate 5 min dual-plant without desktop hijack (P1). Avoid requiring users to change global OS settings as the primary strategy.

---

## 4. Native ↔ JavaScript transport

| Channel | Use | Priority |
| --- | --- | --- |
| `PostWebMessageAsJson` host→page | ContactFrame batches, host events | **v0 primary** |
| `chrome.webview.postMessage` page→host | settings, focus requests, quit | **v0** |
| SharedBuffer | High-rate frames if JSON overhead fails G3 | **v1 optimization** |
| localhost WebSocket | Probe-only dual process | Reject for ship default |

Message envelope:

```json
{
  "type": "contact_frames",
  "payload": [ /* ContactFrame[] */ ]
}
```

Validate with schema/zod on JS side; drop malformed frames; count drops in telemetry.

---

## 5. Simulation vs renderer separation

| Concern | Owner |
| --- | --- |
| Time authority | Fixed sim clock |
| Board pose authority | Rapier + controller |
| Mesh transforms | Copy/interpolate from sim |
| Input sampling | Host timestamps |
| RNG | Seeded from reset seed only |
| Wall clock | UI only; never gameplay branch |

Context loss (`webglcontextlost` / restore):

1. Sim state remains on CPU.
2. Reload GPU resources.
3. Resync meshes from sim.
4. Do not treat GPU buffers as authority.

---

## 6. Save / config boundaries

| Store | Contents | Location |
| --- | --- | --- |
| InputProfile | stance, offsets, thresholds | `%AppData%/SlackPad360/profile.json` |
| Settings | assist, graphics, audio, a11y | same |
| Recordings | ContactFrame sessions | user Documents or AppData; size cap |
| Saves | cosmetics, scores | local only v0 |

Host exposes limited file APIs; web content cannot arbitrary filesystem.

---

## 7. Security

| Risk | Mitigation |
| --- | --- |
| WebView2 script ↔ host trust | Explicit message schema; no eval of remote strings |
| Remote content | Ship local packaged web assets; no drive-by URL game |
| Node-like bridges | Prefer WebView2 without enabling unsafe host objects |
| AbsoluteTouch-style injection | **Rejected** (process injection) |
| Agent API in ship builds | Dev/debug flag or separate build; still no pose cheat |
| Updates | Code-signed installer; WV2 evergreen from Microsoft |

---

## 8. Packaging and updates

| Item | Plan |
| --- | --- |
| Installer | MSIX or signed setup.exe |
| WebView2 | Evergreen bootstrapper if missing |
| Auto-update | Optional later; manual updates OK for prototype |
| Crash dumps | Host-level; strip PII from pad recordings if shared |

---

## 9. Game stack pins (at implement time — record exact versions then)

| Layer | Choice | License (verify at pin) | Ownership boundary |
| --- | --- | --- | --- |
| TypeScript | language | — | game logic |
| Vite | bundler | MIT | tooling |
| three | renderer | MIT | rendering only |
| @dimforge/rapier3d-deterministic | physics | Apache-2.0 (verify) | sim authority |
| zod (optional) | schema | MIT | validation |
| vitest | tests | MIT | dev |
| fast-check | PBT | MIT | devDependency only |
| three-mesh-bvh | mesh queries | MIT | render/tools, not physics authority |
| gltf-transform / gltfpack | asset pipeline | MIT | offline pipeline |
| KTX-Software / KTX2Loader | textures | Apache-2.0 / three examples | pipeline + runtime decode |
| SpectorJS | WebGL debug | MIT | **dev only**, not ship runtime default |

See `reuse-and-dependency-audit.md` and `assets/catalog/dependencies.json`.

---

## 10. Forbidden production paths (cycle 1)

Do not create shippable game trees such as:

- `src/game/**` playable loop as product
- `app/` Electron full game
- Vendoring uncertain assets into `assets/runtime/`

Research probes under `research/probes/` and cycle validators under `preproduction/probes/` remain allowed.

---

## 11. Build topology (when production begins post-cycle 3)

```
/host          C# WebView2 + input bridge
/game          TS Three.js Rapier (Vite)
/shared        ContactFrame types, schema
/tools         gltf pipeline, recording utilities
/assets        see assets/README.md
```

Cycle 1 does **not** create these production trees.
