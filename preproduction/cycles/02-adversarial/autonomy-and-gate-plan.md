# Autonomy and Gate Plan — Cycle 2

**Access date:** 2026-07-10
**Binding for cycle-3 autonomous implementation goals.**

---

## 1. Principle

Agents may build and test **everything expressible as ContactFrame streams**.
Agents **must pause** when evidence requires a human body, target trackpad, or subjective fun judgment.

---

## 2. Gate table

| Gate | Agent can do first | Must pause when | Smallest user action | Artifacts to continue |
| --- | --- | --- | --- | --- |
| **G1 Input** | Implement both adapters, logger, synthetic tests, CI | Before claiming dual-foot works on device; before plaza content production | Run P0 gesture script T1–T11 on target laptop; attach traces | Accept metrics report for ≥1 adapter |
| **G2 Feel** | Build slice mechanics, goldens, assist tunables | Before “fun/fair” claims; before content freeze | Play 20–30 min; fill formative survey (n≥5 formative) | Survey summary + recording IDs |
| **G3 Latency** | Instrument clocks, JSON vs SharedBuffer | Before ship latency claims | Play while harness records | Histogram ≤ budgets or fallback chosen |
| **G4 Determinism** | Full automated | Only if hardware RNG involved (shouldn't) | Optional spot dual-machine | Green CI goldens |
| **G5 Perf** | Budget tools, LOD | Before content freeze claim | Run slice on target iGPU | FPS log p95 |
| **G6 Agent** | Contract tests fully automated | — | None if CI green | Test report |

---

## 3. Stop / continue / pivot

### 3.1 G1

| Outcome | Action |
| --- | --- |
| Accept on Raw or Pointer | **Continue** vertical slice mechanics |
| Accept only after device swap | Update supported hardware list; continue |
| Reject both on all available PTP laptops | **Stop content**; pivot product (controller hybrid = different product) or hardware requirement change — **do not** spend months on plaza art |

### 3.2 G2

| Outcome | Action |
| --- | --- |
| Formative pass | Continue first-ship art/grind expansion |
| Unfun but fixable | Tune assist; retest formative — **no** city-scale content |
| Structural control failure | Pivot grammar; freeze features |

### 3.3 Failed G1 must not unlock

- Modular plaza authoring marathon
- Audio music production
- Marketing screenshots as ship
- Multiplayer / career

Allowed after failed G1: input research, synthetic recognizer work, **no** production park.

---

## 4. Evidence bundle format (pause packet)

```
gate: G1
status: pause
why: need hardware dual-plant
user_actions:
  - run host/p0 spike
  - perform T1-T11
  - save traces to ...
continue_when:
  - dual_plant_stable_s >= 60
  - ...
artifacts_needed: [trace.jsonl, metrics.json]
```

---

## 5. Agent work that never needs pause

- Validators, schemas, pure TS sim with injected frames
- Golden traces, PBT
- Asset catalog hygiene
- Offline glTF pipeline on local files
- Docs

---

## 6. Anti-patterns

- Calling G1 “done” from Microsoft docs alone
- Treating formative n≥5 as release
- `forceTrick` shortcuts in agent tests
- Continuing content after G1 reject
