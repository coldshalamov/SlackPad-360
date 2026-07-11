# Autonomy and Empirical Gates

**Status:** Binding for autonomous implementation
**Also:** `preproduction/final/AUTONOMOUS_BUILD_GOAL.md`, `RISK_AND_GATES.md`

---

## 1. Principle

Agents may build and test **everything expressible as ContactFrame streams**.
Agents **must pause** when evidence requires: target trackpad, human fun judgment, target-machine performance certification, or exclusive Blender ownership.

---

## 2. Gate table

| Gate | Agent can do first | Must pause | Smallest user action | Continue when |
| --- | --- | --- | --- | --- |
| **G1 Input** | Both adapters, logger, synthetic | Before dual-foot claim; before expensive content | Run T1–T11; save traces | Accept metrics ≥1 adapter |
| **G2 Feel** | Slice mechanics, goldens | Before fun/fair ship claims | 20–30 min + formative survey n≥5 | Formative pass summary |
| **G3 Latency** | Clocks, JSON vs SharedBuffer | Before ship latency claims | Instrumented play | Histograms ≤ budget or fallback |
| **G4 Determinism** | Full automated | Rarely | Optional dual-machine | Green goldens |
| **G5 Perf** | Budget tools | Before content freeze claim | Run on target iGPU | p95 log |
| **G6 Agent** | Contract tests | — | None if CI green | Tests green |
| **G-BLENDER** | Catalog, pipeline scripts | Before authoring | Free Blender ownership | Ownership check pass |

---

## 3. Stop / continue / pivot

### G1

| Outcome | Action |
| --- | --- |
| Accept Raw or Pointer | Continue vertical slice |
| Accept after device swap | Update supported list; continue |
| Reject both on available PTP laptops | **Stop content**; pivot input/product — **no** plaza art marathon |

### G2

| Outcome | Action |
| --- | --- |
| Formative pass | Continue first-ship art/grind expansion |
| Unfun fixable | Tune assist; retest — no city-scale content |
| Structural control failure | Pivot grammar; freeze features |

### G-BLENDER

| Outcome | Action |
| --- | --- |
| Foreign Blender active | Pause art milestone; do not touch foreign process |
| Ownership free + path explicit | Author into SlackPad paths only |

---

## 4. Pause packet format

```json
{
  "gate": "G1",
  "status": "pause",
  "why": "need hardware dual-plant",
  "user_actions": ["run host spike", "perform T1-T11", "save traces"],
  "continue_when": ["dual_plant_stable_s >= 60", "..."],
  "artifacts_needed": ["trace.jsonl", "metrics.json"],
  "resume_commit": "git SHA",
  "next_milestone": "M1"
}
```

Save under `preproduction/evidence/impl/<gate>/pause-packet.json`.

---

## 5. Anti-patterns

- Claiming G1/G2/G5 from synthetic alone
- `forceTrick` / `setPose` in agent path
- Continuing content after G1 reject
- Touching foreign Blender
- Permanent quality downgrade for FPS
