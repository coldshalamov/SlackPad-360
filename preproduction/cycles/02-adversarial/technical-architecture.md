# Technical Architecture — Cycle 2

**Status:** Primary path + fallbacks
**Access date:** 2026-07-10

---

## 1. Primary architecture

```
┌────────────────────────────────────────────────────────────┐
│  Native Host (.NET 8 WinUI/WPF/Win32)                      │
│  - TouchpadRawInputAdapter (P0-B, production ranking)      │
│  - TouchpadPointerAdapter  (P0-A Win11 co-spike)           │
│  - Normalize → ContactFrame                                │
│  - WebView2 Evergreen                                      │
│  - PostWebMessageAsJson batches                            │
│  - Focus / packaging / updates                             │
└───────────────────────────┬────────────────────────────────┘
                            │ ContactFrame JSON
┌───────────────────────────▼────────────────────────────────┐
│  Game (TypeScript + Vite → WebView2)                       │
│  - InputHub (host | agent | replay | synthetic)            │
│  - FootTracker + GestureFSM                                │
│  - BoardController (ManeuverAssist)                        │
│  - Rapier fixed step (rapier3d-deterministic-compat 0.19.3) │
│  - Three.js render interpolate                             │
│  - Telemetry / AgentHarness                                │
└────────────────────────────────────────────────────────────┘
```

**Host language:** C# / .NET 8 primary (**C2-HOST-LANG**).
**Rust switch trigger:** unresolved HID memory-safety class that C# cannot contain, or mandated single Rust toolchain. Do not dual-implement hosts.

---

## 2. Module ownership boundaries

| Module | Owns | Must not own |
| --- | --- | --- |
| Host adapters | HID/pointer → ContactFrame | Trick names, board pose |
| InputHub | Ordering, batching, source tag | Physics |
| FootTracker | Logical feet | Rendering |
| GestureFSM | Labels, windows | Direct pose writes |
| BoardController | Impulses/torques clamps | Skipping Rapier |
| Rapier world | Integration, collisions | Input parsing |
| Three.js | Meshes, camera, materials | Second physics world |
| AgentHarness | reset/inject/step/observe | `setPose` / `doTrick` |
| Asset pipeline | Offline GLB optimize | Runtime license skip |

---

## 3. Transport timing

| Path | v0 | Notes |
| --- | --- | --- |
| PostWebMessageAsJson | Primary | Batch N frames; include tPerfMs |
| postMessage page→host | Settings, quit | Origin check |
| SharedBuffer | Fallback if G3 fails | |
| HostObjects | Optional settings | Not high-rate input |

**Hypothesis:** host samples ≥125 Hz; sim 60 Hz consumes latest/all ordered frames.

---

## 4. Fallbacks

| Trigger | Fallback |
| --- | --- |
| P0-A free plant fail | Raw Input primary (expected) |
| P0-B fail too | Other PTP device / product pivot |
| WebView2 packaging fail | Electron + N-API same ContactFrame |
| JSON latency fail G3 | SharedBuffer |
| Rapier compat size issue | Optional alt non-compat `@dimforge/rapier3d-deterministic` + WASM asset |
| Single-body rail fail | Model B raycast wheels |

---

## 5. Security

- Validate WebView2 message origin
- No arbitrary host object exposure of filesystem
- Agent API disabled or token-gated in ship builds
- Do not inject foreign processes (AbsoluteTouchEx rejected)

---

## 6. Packaging

- Windows installer/MSIX + WebView2 evergreen bootstrap
- Game assets from `assets/runtime/` only when approved
- No `node_modules` vendored into git

---

## 7. Forbidden this cycle / until gates

Production trees such as `src/game`, `packages/game/src`, `host/bin` shipping game — **not created in cycle 2**. P0 spike may appear later as isolated host project after cycle 3 planning.
