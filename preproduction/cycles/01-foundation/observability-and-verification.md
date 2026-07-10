# Observability and Verification — Cycle 1

**Access date:** 2026-07-10
**Principle:** Every requirement has an objective method **or** is labeled subjective with a structured playtest.

---

## 1. Deterministic recording

### Recording contents

| Field | Required |
| --- | --- |
| Header: schemaVersion, buildId, physicsHz, rapierPackage, levelId, seed, InputProfile, startBoardState | yes |
| ContactFrame[] full stream | yes |
| GameEvent[] append-only | yes |
| Optional video/screenshot refs | no |

### Replay

Same frames → same events and board checkpoints within ε (document tolerances for float).

**Package:** `@dimforge/rapier3d-deterministic` — https://rapier.rs/docs/user_guides/javascript/determinism/

### Golden traces

| Trace | Intent |
| --- | --- |
| `golden_push_steer` | locomotion |
| `golden_ollie_land` | pop + land |
| `golden_kickflip_catch` | flip |
| `golden_shuv_180` | yaw |
| `golden_50_50` | grind enter/exit |
| `golden_bail_overrotate` | fail path |

Stored as ContactFrame JSON + expected event sequence.

---

## 2. Synthetic gesture generation

- Scripted ContactFrame builders for each v0 trick.
- Noise models: jitter, timing skew, ID swap after dual lift.
- Property-based: **fast-check** generators for valid frames and invariant tests (devDependency).

---

## 3. Property-based / unit tests (planned)

| Property | Assert |
| --- | --- |
| Schema | every frame validates ContactFrame v1 |
| Order | consume sorts by (tPerfMs, frameId) |
| Agent | inject cannot set pose API (type/export tests) |
| Phase exclusivity | not AIR and GRIND simultaneously |
| Assist log | catch damping events only when assist>0 and catch applied |

---

## 4. Physics invariants

| Invariant | Check |
| --- | --- |
| No NaN poses | after each step |
| Energy soft bound | speed < hard cap + epsilon |
| Interrupt | collision can clear ManeuverSpec mid-air |
| Authority | mesh pose not written back into Rapier |

---

## 5. Agent restrictions

```
Agent MAY: reset(seed), injectContacts, step, observe, record, replay, captureImage
Agent MUST NOT: setBoardPose, fireTrick(name), setAssistMidRun (except via reset settings), bypass FSM
```

Contract tests enforce absence of privileged exports in agent surface.

---

## 6. Screenshots / video evidence

| Capture | Use |
| --- | --- |
| Still board+plaza | art review |
| Kickflip side cam | flip readability |
| Grind approach | snap honesty |
| Input theater | onboarding QA |

Visual regression: optional pixel diff on fixed camera golden **after** renderer stabilizes; label flaky platforms.

---

## 7. Performance budgets and measurement

| Metric | Budget | Method |
| --- | --- | --- |
| FPS p95 | ≥60 | in-app sampler, 60 s free skate |
| Physics step | <4 ms avg @120 Hz hypothesis | perf.now around step |
| Draw calls | <150 | renderer.info |
| Motion-to-photon contact | ≤50 ms typical | host timestamp vs frame present (instrument) |
| Click-to-pop visual | ≤80 ms | kick edge → first pop visual event |

---

## 8. Hardware test matrix

| Dimension | Values |
| --- | --- |
| OS | Windows 11 (primary) |
| Touchpad | PTP certified class; research device VEN_06CB |
| Click type | mechanical vs haptic if available |
| GPU | target iGPU class + one discrete |
| Display | 1080p and 1440p laptop |
| Input path | P0-A and P0-B |

---

## 9. Playtest protocol (subjective items)

Reuse E1–E6 from research camera/ergonomics + product PQ bars.

| ID | Task | Metrics |
| --- | --- | --- |
| E1 | Steer S-curves | error, fatigue |
| E2 | 20 ollies | success, false pop |
| E3 | 10 kickflips | success, agency |
| E4 | Gap line | camera occlusion |
| E5 | Rail grind | entry rate |
| E6 | 15 min free | pain map 0–5 |

**n≥5** preferred for G2. Stop if pain ≥4/5.

Subjective “fun” ≥4/5 is **structured survey**, not vibes-only.

---

## 10. Release gates

| Gate | Objective criteria | Blocks |
| --- | --- | --- |
| G1 Input | P0 accept: dual contact, lift, free dual-plant, click, rate | all production content |
| G2 Feel | tutorial success + fun/agency surveys | ship feel lock |
| G3 Latency | ≤50/80 ms typical | ship input polish |
| G4 Determinism | dual replay checkpoint match | agent + regression |
| G5 Performance | 60 FPS p95 budgeted art | content freeze |
| G6 Agent | contract tests green | training/automation claims |

---

## 11. Requirement → verification index

| Area | Objective | Subjective + protocol |
| --- | --- | --- |
| ContactFrame | schema + goldens | — |
| Tricks v0 | synthetic suite | E2–E5 |
| Hybrid fairness | PQ-1,2,7 tests | PQ-4 survey |
| Camera | occlusion cast unit | E4 A/B |
| Plaza EX bars | path checklist | EX-2 playtest |
| Art quality | budget metrics | art review checklist |
| Ergonomics | click count telemetry | E6 pain map |
| Licenses | catalog validator | — |

---

## 12. Cycle-1 verification (this package)

| Check | Command |
| --- | --- |
| Research intact | `node research/probes/validate-deliverables.mjs` |
| Follow-up intact | `node research/probes/validate-followup.mjs` |
| Cycle 1 package | `node preproduction/probes/validate-cycle-01.mjs` |
