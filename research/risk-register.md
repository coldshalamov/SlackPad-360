# Risk Register — Failure Modes

**Access date:** 2026-07-10

Severity: **S1** blocks concept | **S2** blocks ship quality | **S3** painful | **S4** minor
Likelihood: **L1** almost certain without mitigation | **L2** likely | **L3** possible | **L4** unlikely

Labels on evidence: **confirmed fact** | **inference** | **hypothesis**

---

## R01 — Browser cannot provide dual-foot stream

| | |
| --- | --- |
| **Severity** | S1 |
| **Likelihood** | L1 (if pure web assumed) |
| **Evidence** | W3C never shipped raw trackpad multi-contact API (issue #206); Edge PTP events merged two-finger pan to one contact; WebHID digitizer blocking discussions (**confirmed fact** / strong **inference** for current Chromium) |
| **Impact** | Concept fails as “web game only” |
| **Mitigation** | Native Raw Input / host bridge; browser mock for agents |
| **Validation** | Browser probe logs &lt;2 absolute pad contacts; native probe succeeds |

---

## R02 — This laptop’s Synaptics path lacks stable dual IDs

| | |
| --- | --- |
| **Severity** | S1 |
| **Likelihood** | L3 |
| **Evidence** | Device presents HID touch pad VEN_06CB (**confirmed** local); PTP class requires IDs (**confirmed** docs); per-device behavior **unresolved** |
| **Mitigation** | Probe early; fallback devices list; refuse unsupported hardware with clear message |
| **Validation** | P0 60 s dual-contact stability test |

---

## R03 — OS gesture conflicts (scroll/pinch/three-finger)

| | |
| --- | --- |
| **Severity** | S1–S2 |
| **Likelihood** | L2 |
| **Evidence** | Windows owns PTP gestures; browsers convert to wheel/pan (**confirmed** behavior patterns) |
| **Mitigation** | Foreground native sink; avoid depending on system multi-finger gestures; document required OS settings only as last resort (research process did not change settings) |
| **Validation** | Play 5 min two-finger steer without unintended OS switches |

---

## R04 — Ambiguous click / false pops

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L2 |
| **Evidence** | Button is report-level not per-foot (**confirmed**); hinge non-uniform (**confirmed** haptic vs mechanical docs) |
| **Mitigation** | Context-gated kick; push vs pop rules; suppress click when speed high optional |
| **Validation** | False pop rate &lt;10% in E2 protocol |

---

## R05 — Ergonomic fatigue / handedness exclusion

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L2 |
| **Evidence** | Two-finger precision + click fatigue **hypothesis**; handedness matrix needs calib (**inference**) |
| **Mitigation** | Calibration, swap feet, assist levels, session breaks UX |
| **Validation** | E6 15 min fatigue scores |

---

## R06 — Camera/input mismatch

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L2 if screen-relative chosen |
| **Evidence** | Chase cameras rotate continuously; screen-relative mapping fights feet model (**inference**) |
| **Mitigation** | Board-relative mapping; camera never rewrites feet |
| **Validation** | Camera A/B with same ContactFrame replay |

---

## R07 — Recognizer brittleness

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L2 |
| **Evidence** | Gesture systems overfit thresholds (**inference** from game design practice) |
| **Mitigation** | Click windows; explainable FSM; golden traces; per-user calib |
| **Validation** | Golden + noisy synthetic suites green |

---

## R08 — Excessive assistance (“auto skate”)

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L3 |
| **Evidence** | Hybrid risk; Skate itself offers assist toggles (**confirmed** product notes on catch assist culture) |
| **Mitigation** | Assist 0–2; show interventions in telemetry; skill ceilings |
| **Validation** | Playtesters report agency ≥4/5 |

---

## R09 — Excessive realism (unfair)

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L3 if pure RB chosen |
| **Evidence** | Micro-fail rate of free physics finger control **hypothesis** |
| **Mitigation** | Hybrid model; wide land cone |
| **Validation** | Ollie success after tutorial ≥50% |

---

## R10 — Grind frustration

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L2 |
| **Evidence** | Snap vs skill tension classic in skate games (**inference**) |
| **Mitigation** | Soft snap + readable volumes + camera blend |
| **Validation** | ≥50% grind success on tutorial rail after 10 approaches |

---

## R11 — Latency

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L3 |
| **Evidence** | Multi-hop pipelines add delay (**inference**) |
| **Mitigation** | In-process host; measure click-to-pop; avoid double buffering excess |
| **Validation** | G3 latency gates |

---

## R12 — Nondeterminism breaks replay/agents

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L2 without discipline |
| **Evidence** | Rapier local vs cross-platform determinism docs (**confirmed**) |
| **Mitigation** | Deterministic package; fixed step; seed; pin builds |
| **Validation** | Dual replay diff = 0 |

---

## R13 — Device variation

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L2 |
| **Evidence** | Optional pressure; 3–5 contacts; haptic vs click (**confirmed** PTP variance) |
| **Mitigation** | Capability query; degrade gracefully; min requirements doc |
| **Validation** | Test matrix ≥2 hardware models before production |

---

## R14 — Agent test cheating

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L3 if API sloppy |
| **Evidence** | Design risk only |
| **Mitigation** | Single ContactFrame path; no moveBoard |
| **Validation** | API review + contract tests |

---

## R15 — Performance cliffs on iGPU

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L3 |
| **Evidence** | Three.js + shadows + post can tank iGPUs (**inference**) |
| **Mitigation** | Budgets in technology doc; scalable quality |
| **Validation** | G5 FPS gate |

---

## R16 — Asset licensing contamination

| | |
| --- | --- |
| **Severity** | S2 legal |
| **Likelihood** | L3 |
| **Evidence** | Mixed Sketchfab licenses common industry failure mode |
| **Mitigation** | CC0-first catalog; credits file; license audit CI |
| **Validation** | All shipped assets listed with license URL |

---

## R17 — Uncontrolled scope

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L1 without gates |
| **Evidence** | Open-world skate games are large (**inference**) |
| **Mitigation** | Prototype roadmap abandon criteria; one plaza milestone |
| **Validation** | No production content before G1–G4 |

---

## R18 — Win11 touchpad pointer path insufficient for free dual feet

| | |
| --- | --- |
| **Severity** | S2 |
| **Likelihood** | L3 |
| **Evidence** | `GetPointerTouchpadInfo` / `GetPointerFrameTouchpadInfo` + `RegisterTouchpadCapableWindow` documented for Win11 (**confirmed fact**, Learn 2026-03-28) but portal text ties `WM_POINTER` to **two-finger pan/zoom gestures**; pixel fields do not track fingers; docs marked pre-release |
| **Mitigation** | P0-A then P0-B Raw Input; map himetric device coords to ContactFrame; do not use screen pixel fields for feet |
| **Validation** | P0 accept requires continuous dual-plant outside pure scroll demos |

---

## Active disproof stance

Cheapest concept killers in order:

1. No dual independent contacts (R01/R02)
2. Unusable gesture conflict (R03)
3. Unfun after hybrid tuning (R08/R09)
4. Performance unusable (R15)

Stop expansion when a killer hits; do not “art through” input failure.
