# Observability and Verification — Cycle 2

**Access date:** 2026-07-10

---

## 1. Evidence levels (normative)

| Level | Purpose | Typical n / method | Can claim ship? |
| --- | --- | --- | --- |
| **Structural smoke** | Files, validators, schema, nonblank canvas | Automated | No |
| **Deterministic automated regression** | Golden traces, PBT, snapshot hashes | CI unlimited | Supports G4/G6; not G1/G2 |
| **Hardware acceptance** | G1 device matrix, latency harness | Target machines | Required for input ship |
| **Formative feel test** | Early fun/fair signals | **n≥5 OK** | **No** — formative only |
| **Tuning study** | Threshold A/B, cones, assist | Repeated trials; log CIs when useful | Informs defaults |
| **Release confidence** | Broader playtests, soak, perf p95, accessibility | Larger n / multi-session | Yes (define in cycle 3) |

**Change from cycle 1:** `n≥5` is **formative**, never release proof.

---

## 2. Golden traces (deterministic)

Record ContactFrame JSONL + sim checkpoint hashes.

| Suite | Covers |
| --- | --- |
| GT-malformed | Missing fields, NaN, >2 contacts, bad ids |
| GT-noisy | Jitter, dropouts, ID reuse |
| GT-foot-id | Reassignment, dual lift, stance flip |
| GT-click | 0/1/2 plant masks |
| GT-recog-conflict | push vs ollie, flip vs shuv |
| GT-maneuver-interrupt | collision mid-flip |
| GT-catch | volume hit/miss |
| GT-land | clean/dirty/bail cones |
| GT-bail | inverted deck |
| GT-grind | 50-50 entry; boardslide entry (ship) |
| GT-replay-hash | full session MD5 of snapshots |

Property tests (fast-check): arbitrary ContactFrame streams never throw; plant mask invariants; no agent pose shortcut.

---

## 3. Image / frame / performance checks

| Check | Method | Level |
| --- | --- | --- |
| Nonblank canvas | Pixel variance / sample center | Structural |
| Visual framing | Screenshot vs shot rubric S1–S7 | Structural + review |
| Materials respond | HDRI on/off diff | Structural |
| Shadows/readability | Rubric S4/S5 | Review |
| No HUD overlap board | Bounds test | Structural |
| Desktop viewports | 1920×1080, 1366×768 | Structural |
| FPS / frame time | Log p50/p95 on target laptop | G5 hardware/perf |

**Cannot prove beauty by web research.**

---

## 4. Agent API (observable harness)

```
reset(seed, levelId)
injectContactFrame(frame | frame[])
step(n=1)
observe() -> { boardPose, phase, label, contactsLogical, grind, scores, ... }
captureScreenshot(path?)
startRecording() / stopRecording() -> SessionTrace
replay(trace)
log(event)
```

**Forbidden:** `setBoardPose`, `forceTrick`, `applyImpulse` from agent public API, teleport board for tests except via documented debug build flag excluded from ship.

Agents, replays, synthetic, hardware → same InputHub.

---

## 5. Gate evidence mapping

| Gate | Evidence level | Artifact |
| --- | --- | --- |
| G1 | Hardware acceptance | P0 CSV/JSONL + metrics report |
| G2 | Formative feel | Survey sheets n≥5; not release |
| G3 | Hardware + instrumentation | Latency histogram |
| G4 | Deterministic regression | Dual replay hash |
| G5 | Perf log on target | FPS p95 |
| G6 | Deterministic + contract tests | Agent API tests |

---

## 6. Provisional thresholds

Numeric cones, ms windows, FPS targets remain **calibration hypotheses** until measured. Do not present as facts.
