# Agent Observability — ContactFrame, API, Replay, Testing

**Access date:** 2026-07-10

Labels: **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**

---

## 1. Design principle

**Recommendation (hard rule):** Humans and agents share **one** input path:

```
Adapter(Human HID | Agent inject | Replay file) → ContactFrame stream → Gesture FSM → Physics → Observations
```

The agent **must not**:

- Set board pose/velocity directly
- Invoke trick functions
- Bypass gesture recognition
- Write internal assist flags except via documented difficulty settings applied at reset

Cheating paths invalidate training and regression value.

---

## 2. ContactFrame contract

Normalized, JSON-serializable, fixed schema version.

```json
{
  "schemaVersion": 1,
  "frameId": 0,
  "tPerfMs": 0.0,
  "tScanUs": null,
  "source": "hardware | agent | replay | synthetic",
  "contacts": [
    {
      "id": 1,
      "tip": true,
      "x": 0.42,
      "y": 0.61,
      "confidence": true,
      "pressure": null,
      "width": null,
      "height": null
    }
  ],
  "buttons": {
    "primary": false,
    "secondary": false,
    "auxiliary": false
  },
  "meta": {
    "deviceId": "optional-string",
    "contactCountRaw": 2
  }
}
```

### Field norms

| Field | Norm | Notes |
| --- | --- | --- |
| `x`,`y` | float 0–1 | Pad space; (0,0) top-left per PTP convention |
| `tip` | bool | Surface contact |
| `id` | uint | Stable while tip lifecycle active; may reuse after lift |
| `tPerfMs` | monotonic ms | Host performance counter mapping |
| `tScanUs` | optional | HID scan time × 100 µs units if available |
| `pressure` | 0–1 or null | Optional; null if unsupported |
| `buttons.primary` | bool | Kick/click |

### Batching

Adapters may emit **multiple ContactFrames per physics step**. Simulator consumes in timestamp order. Recording stores **all** frames.

### Identity mapping is **not** in ContactFrame

Foot roles live in a separate **InputProfile** (stance, swap, offsets) applied after frames enter the recognizer—so raw recordings remain device-faithful.

---

## 3. Agent API

Suggested TypeScript-facing surface (host or in-page when mock):

```ts
interface SlackPadAgentAPI {
  reset(seed: number, levelId: string, profile?: InputProfile): Observation;
  injectContacts(frames: ContactFrame[]): void;
  step(n?: number): StepResult; // fixed physics steps
  observe(): Observation;
  events(sinceSeq?: number): GameEvent[];
  startRecording(): void;
  stopRecording(): Recording;
  playRecording(rec: Recording, opts?: {realtime?: boolean}): void;
  captureImage(opts?: {width?: number; height?: number}): ImageBlob;
  getTelemetry(): TelemetrySnapshot;
}
```

### Observation (minimal)

```ts
interface Observation {
  step: number;
  timeMs: number;
  board: {
    position: [number, number, number];
    rotation: [number, number, number, number]; // quat
    linearVel: [number, number, number];
    angularVel: [number, number, number];
    phase: "ground" | "air" | "grind" | "bail";
  };
  grind: null | { railId: string; balance: number };
  lastGesture: null | { name: string; conf: number };
  score: number;
  flags: { landed: boolean; bailed: boolean };
}
```

### GameEvent examples

`pop`, `trick_recognized`, `catch`, `land`, `bail`, `grind_enter`, `grind_exit`, `collision`, `checkpoint`

Events are append-only with `seq` and `step` for replay diffs.

---

## 4. Deterministic replay requirements

| Requirement | Detail | Label |
| --- | --- | --- |
| Fixed dt | Physics always `dt = 1/120` or `1/60` | Recommendation |
| Ordered inputs | Frames sorted by `(tPerfMs, frameId)` | Recommendation |
| Seeded RNG | All random (bail juice, debris) from seed | Recommendation |
| Rapier deterministic build | Use enhanced-determinism package | Confirmed need (Rapier docs) |
| Same module versions | Pin WASM/JS builds in recordings header | Recommendation |
| No wall-clock branches | Gameplay code must not branch on `Date.now()` | Recommendation |
| Floating init | Use deterministic math for level placement | Confirmed (Rapier guidance) |

**Recording header** must store: schemaVersion, buildId, physicsHz, rapierPackage, levelId, seed, InputProfile, startBoardState.

**Success criterion:** byte-identical (or ε-equal with documented tolerances) board state at N checkpoints for two offline replays.

**Hypothesis:** Cross-machine bit-identical is achievable with deterministic Rapier + fixed inputs; validate early.

---

## 5. Telemetry

Ship from prototype day 1:

- ContactFrame rate, loss, max gap
- Gesture FSM transitions
- Click-to-pop latency
- Physics step time, render frame time
- Assist interventions count (snap, catch damp)
- Bail reasons histogram

Export JSONL for sessions.

---

## 6. Synthetic gesture generators

**Recommendation:** Pure functions `generateOllie(profile, t0) → ContactFrame[]` etc., parameterized by noise.

Uses:

- Unit tests for recognizer
- Fuzz corpus
- Agent baselines
- CI without hardware

Noise models: timing jitter, spatial jitter, missing frames, extra palm contact (confidence false).

---

## 7. Testing strategy

| Layer | Method |
| --- | --- |
| **Schema** | JSON schema / zod validation of ContactFrame |
| **Recognizer** | Golden ContactFrame traces → expected events |
| **Physics** | Property tests: energy bounds; no NaN; land cone monotonicity |
| **Fuzz** | Random frame streams; assert no crash, phase invariants |
| **Replay** | Record once, replay twice, diff observations |
| **Agent contract** | Static/runtime assert no privileged moveBoard API |
| **Visual QA** | Optional `captureImage` hashes for camera stability (loose thresholds) |
| **Performance** | step() batch timing under 0.5× realtime for CI |

### Golden traces (v0 set)

1. Dual plant hold 2 s
2. Steer left/right S
3. Push ×5
4. Ollie land
5. Nollie land
6. Kickflip catch land
7. Failed flip bail
8. Grind enter/exit

Store under `research/` or future `testdata/traces/` (not production game yet).

---

## 8. Preventing agent test cheating

| Attack | Defense |
| --- | --- |
| Direct transform write | No public API; private sim module |
| Inject ManeuverSpec | Not exposed |
| Slow-mo + frame peek beyond human | Allowed for agent **if** same ContactFrame rules; separate leaderboards |
| Modify assist mid-run | Locked at reset |
| Nondeterministic score farm | Seed + replay audit |

---

## 9. Image capture

`captureImage` reads WebGL canvas (or WebView2 host screenshot). Use for:

- Human visual QA
- Optional vision agents

**Not** required for core physics golden tests (flaky). Prefer state observations for CI gates.

---

## 10. Unresolved

- Exact IPC: in-process WebView host object vs WebSocket localhost (**recommendation:** in-process first).
- Multi-agent parallel instances resource limits.
- Whether to expose partial observability modes (hide gesture name) for harder RL.
