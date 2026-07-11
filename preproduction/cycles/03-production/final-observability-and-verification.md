# Final Observability and Verification

**Status:** Normative
**Access date:** 2026-07-10

---

## 1. Evidence levels

| Level | Purpose | Can claim ship? |
| --- | --- | --- |
| Structural smoke | Files, validators, schema, nonblank canvas | No |
| Deterministic automated regression | Goldens, PBT, snapshot hashes | Supports G4/G6; not G1/G2 |
| Hardware acceptance | G1 device matrix, latency | Required for input ship |
| Formative feel | Early fun/fair (n≥5 OK) | **No** — formative only |
| Tuning study | Threshold A/B | Informs defaults |
| Release confidence | Broader playtests, soak, perf p95, a11y | Yes when packet complete |

**Never** claim G1/G2/G5 from synthetic ContactFrame tests alone.

---

## 2. Test suites

| Suite | Covers |
| --- | --- |
| Unit | FootTracker, plant mask, cones, envelope math |
| Property (fast-check) | Arbitrary ContactFrame streams never throw; invariants |
| Golden | GT-malformed, noisy, foot-id, click, recog-conflict, interrupt, catch, land, bail, grind 50-50, boardslide, replay-hash |
| Integration | Host message envelope parse; InputHub multi-source |
| Host-contract | Origin validation; batch ordering; schema |
| Agent-contract | inject-only; no forceTrick/setPose; observe shape |
| Visual | Playwright/WebView2 screenshots; canvas pixel variance; framing; text-overlap |
| Perf | frame time, physics time, input latency, memory, draw calls, tris, textures, bundle size |
| Installer | offline first-run, WebView2 bootstrap, calibration recovery |

---

## 3. Performance budgets (targets — measure on hardware)

| Metric | Budget (hypothesis until G5) |
| --- | --- |
| Frame time p95 | ≤16.7 ms (60 FPS) |
| Physics step p95 | ≤4 ms @ 60 Hz |
| Input→sim latency typical | ≤50 ms (G3) |
| Click→pop visual | ≤80 ms (G3) |
| Working set | Track; fail if unbounded growth soak |
| Draw calls | Track per plaza; LOD if exceed target machine |
| Triangles | Hero LOD budgets from art brief |
| Texture memory | Prefer KTX2; 1K sources for prototype |
| JS bundle (game) | Track; code-split if needed |

**Forbidden:** permanent quality reduction to hit FPS.

---

## 4. Evidence artifact paths

```
preproduction/evidence/
  cycle-03/                 # preproduction smokes (this cycle)
  impl/
    m0-toolchain/
    m1-g1/
      traces/*.jsonl
      metrics.json
      pause-packet.json     # if paused
    m2-goldens/
    ...
    g2-formative/
    g3-latency/
    g4-determinism/
    g5-perf/
    release/
assets/runtime/             # only after promotion evidence
```

### 4.1 Machine-readable result formats

`metrics.json` example:

```json
{
  "gate": "G1",
  "status": "accept|reject|pause",
  "adapter": "raw|pointer",
  "dualPlantStableS": 0,
  "clickEdges": 0,
  "liftIndependence": true,
  "artifacts": ["traces/..."]
}
```

Golden report:

```json
{
  "suite": "GT-catch",
  "passed": true,
  "hashExpected": "...",
  "hashActual": "...",
  "steps": 120
}
```

---

## 5. Hardware / human protocols

| Gate | Protocol | Smallest user action |
| --- | --- | --- |
| G1 | T1–T11 gesture script on target laptop; dual-plant ≥60 s | Run spike; save traces |
| G2 | 20–30 min play; formative survey n≥5 | Play + survey |
| G3 | Instrumented session histogram | Play while recording |
| G5 | Slice on target iGPU | Run perf scene |

Pause packets must be resumable without restarting the whole project.

---

## 6. Agent anti-cheat / contract

- Same InputHub as hardware
- Contract tests fail if pose/trick shortcuts exist in public API
- Scoring cannot be forced without board state

---

## 7. Feel diagnosis without trackpad

Leave: ContactFrame recordings, ObserveState logs, golden diffs, screenshots, assist parameter dumps, commit SHAs. Another agent must be able to reason about feel regressions offline.
