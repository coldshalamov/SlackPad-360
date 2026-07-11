# Final Technical Architecture

**Status:** Normative module topology
**Host TFM:** `net10.0-windows`
**WebView2 SDK:** `Microsoft.Web.WebView2` **1.0.4078.44**
**Game:** TypeScript + Vite 8.1.4 → WebView2

---

## 1. Topology

```
┌────────────────────────────────────────────────────────────┐
│  Native Host (C# / net10.0-windows)                        │
│  - TouchpadRawInputAdapter (production ranking primary)    │
│  - TouchpadPointerAdapter  (Win11 co-spike)                │
│  - Normalize → ContactFrame v1                             │
│  - Ring buffer + batch PostWebMessageAsJson                │
│  - Focus / packaging / WebView2 Evergreen                  │
└───────────────────────────┬────────────────────────────────┘
                            │ Host→Page envelope
┌───────────────────────────▼────────────────────────────────┐
│  Game (TS)                                                 │
│  InputHub → FootTracker → GestureFSM → BoardController     │
│  → ManeuverAssist → Rapier fixed step → Three interpolate  │
│  UI / Audio / Telemetry / AgentHarness / Replay            │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Module ownership

| Module | Owns | Must not own |
| --- | --- | --- |
| Host adapters | HID/pointer → ContactFrame | Trick names, board pose |
| ContactFrame transport | Ordering, batching, clocks, source tag | Physics |
| FootTracker | Logical feet, stance, padYawOffset | Rendering |
| GestureFSM | Labels, confidence, hysteresis | Direct pose writes |
| BoardController + ManeuverAssist | Impulses/torques clamps, assist phases | Skipping Rapier |
| Deterministic simulation | Rapier world.step authority | Input parsing |
| Grinding/collision/failure | Latch, cones, bail transitions | Agent shortcuts |
| Animation/foot presentation | Shoe transforms, cosmetic | Catch authority (volumes in assist) |
| Renderer/camera | Three meshes, camera rig, materials | Second physics world |
| UI/audio | HUD, menus, SFX triggers from telemetry events | Sim writes |
| Replay/telemetry | SessionTrace, hashes, logs | Mutating live control |
| Agent harness | reset/inject/step/observe | setPose/forceTrick/applyImpulse public |
| Asset pipeline | Offline GLB optimize → runtime only when approved | License skip |

---

## 3. Public interfaces (minimum)

### 3.1 ContactFrame (host/page/agent)

Per `research/probes/contact-frame.schema.json` v1.
Fields: `schemaVersion`, `frameId`, `tPerfMs`, contacts[{id, tip, x, y, confidence}], buttons, meta.

### 3.2 Host → page message envelope

```json
{
  "v": 1,
  "type": "contactBatch",
  "source": "hardware|synthetic",
  "hostTPerfMs": 0,
  "frames": [ /* ContactFrame[] */ ]
}
```

Other host→page types: `hostInfo`, `focus`, `settings`.

### 3.3 Page → host

```json
{ "v": 1, "type": "ready|quit|settings|requestCalib", "payload": {} }
```

Validate origin; no arbitrary filesystem host objects.

### 3.4 AgentHarness API

```
reset(seed: u64, levelId: string)
injectContactFrame(frame | frame[])
step(n = 1)
observe() -> ObserveState
captureScreenshot(path?)
startRecording() / stopRecording() -> SessionTrace
replay(trace)
log(event)
```

**Forbidden public:** `setBoardPose`, `forceTrick`, `applyImpulse` (debug builds may gate behind compile flag excluded from ship).

### 3.5 ObserveState (minimum)

```
{
  step, seed,
  board: { p, q, lv, av },
  phase, label, assistLevel,
  feet: { nose, tail },
  grind: { active, family, balance } | null,
  score, lastFailReason,
  inputSource
}
```

### 3.6 Replay header

```json
{
  "replayVersion": 1,
  "gameVersion": "semver",
  "rapierVersion": "0.19.3",
  "hz": 60,
  "seed": 0,
  "levelId": "...",
  "createdAt": "ISO-8601",
  "contactFrameSchema": 1
}
```

Body: ordered ContactFrame batches + optional checkpoint hashes every N steps.

### 3.7 Save format (v0)

```json
{
  "saveVersion": 1,
  "profile": { "stance", "padYawOffset", "assistLevel", "bothClickMeans", "accessibility" },
  "progress": { "challengesCompleted": [], "settings": {} }
}
```

No sim state required for v0 continue (checkpoint respawn uses level markers).

---

## 4. Clocks, batching, interpolation

| Clock | Role |
| --- | --- |
| Host `QueryPerformanceCounter` → `tPerfMs` | Frame timestamp |
| Sim step integer `step` | Authority |
| Render `alpha` | Interpolation between previous/current pose |
| Wall clock | UI only — never inside Rapier step |

**Policy:**

- Host samples ≥125 Hz when possible
- Sim **60 Hz** default consumes ordered frames (batch all since last step or latest with backlog drain — pick one in M2 and test: **recommendation = drain all ordered frames into recognizer, step once**)
- Render interpolates rigid poses; does not step physics
- Seeds: `u64` for procedural + test; fixed for goldens

---

## 5. Fallbacks

| Trigger | Fallback |
| --- | --- |
| Pointer free dual-plant fail | Raw Input primary (expected) |
| Both adapters fail G1 | Stop content; product/device pivot |
| WebView2 packaging fail | Electron + N-API same ContactFrame |
| JSON latency fail G3 | SharedBuffer denser framing |
| Rapier compat size issue | Optional `@dimforge/rapier3d-deterministic` + WASM asset |
| Model A rail fail | Model B probe |
| net10 interop fail | Documented downgrade evidence → net8.0-windows only if proven |

---

## 6. Repo layout (implement-time)

```
host/                     # net10.0-windows WebView2 + adapters
packages/game/            # or src/game — pick one in M0; Vite TS game
packages/shared/          # ContactFrame types, replay header types
assets/source/            # acquired sources
assets/runtime/           # only approved GLB/audio/ktx2
preproduction/            # planning (read-only for implementers after C3)
research/                 # schemas/probes
```

M0 chooses exact monorepo shape; must not invent second sim authority.

---

## 7. Security

- Validate WebView2 message origin
- Agent API disabled or token-gated in ship builds
- No process injection (AbsoluteTouchEx rejected)
- No secret keys in client for “anti-cheat” theater; anti-cheat = contract tests + no pose API

---

## 8. Packaging

Windows installer/MSIX + WebView2 evergreen bootstrap.
Ship assets only from `assets/runtime/` after review.
No `node_modules` in git.
