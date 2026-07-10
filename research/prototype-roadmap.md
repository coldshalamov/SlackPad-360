# Prototype Roadmap — Ordered Experiments

**Access date:** 2026-07-10

**Principle:** Cheapest **invalidating** experiments first. No park art until input is real. No production game tree in this research phase—probes only under `research/probes/`.

---

## Phase map

```
P0 Contact identity → P1 Click+OS conflict → P2 Mapping/ergonomics
        → P3 Locomotion physics → P4 Ollie/land → P5 Flip/catch
        → P6 Grind → P7 Determinism/agent → P8 Vertical slice feel
        → G1–G6 gates → production
```

---

## P0 — Dual contact identity (native)

| | |
| --- | --- |
| **Goal** | Prove two persistent contacts, positions, independent lift on this laptop |
| **Build** | Minimal Win32/Rust window with **two ordered backends**: **P0-A** `RegisterTouchpadCapableWindow` + `GetPointerFrameTouchpadInfo` (Win11; log himetric contacts, tip flags); **P0-B** Raw Input HID Touch Pad `0x0D/0x05` if A fails continuous dual feet |
| **Cost** | 1–3 days |
| **Accept** | 2 contacts; stable IDs ≥60 s; independent tip clear; free dual-plant (not only pan/zoom); median Δt ≤16 ms or documented ≥60 Hz; click edge with plant-count 0/1/2 logged; optional pressure/force flagged; dual-lift ID reorder rate logged (see `followup-decisions.json` p0MustMeasure) |
| **Abandon** | Only mouse relative deltas; IDs reshuffle every frame; cannot lift one finger independently; Win11 path only during OS gesture and HID path also fails |
| **Kills** | Core concept on trackpad |
| **API rank** | Prefer **GetPointerFrameTouchpadInfo** when it meets continuous dual-foot needs (less HID parsing); keep **Raw Input** as production fallback for full PTP fields / older stacks |

---

## P1 — Click + gesture conflict

| | |
| --- | --- |
| **Goal** | Button 1 edges concurrent with 2 contacts; OS does not steal session |
| **Build** | Extend P0 with button bit + focus stress (open Start, Alt-Tab back) |
| **Accept** | Click edges captured while two fingers down; 5 min steer without system desktop gesture hijack in focused mode |
| **Abandon** | Clicks never appear in same stream; unfixable OS hijack without forbidden global settings hacks |
| **Kills / pivots** | May force controller hybrid product |

---

## P2 — Board-relative mapping & ergonomics

| | |
| --- | --- |
| **Goal** | Stance/hand calibration; 10 min comfort |
| **Build** | 2D pad visualization + virtual deck top-down; calibration wizard |
| **Accept** | Users set stance; relaxed plant = straight; fatigue ≤2/5 after 10 min (n≥3) |
| **Abandon** | Majority cannot keep dual plant comfortably; mapping fights intuition after calib |

---

## P3 — Locomotion in 3D (Three.js + Rapier)

| | |
| --- | --- |
| **Goal** | Push, steer, coast on flat + one ramp |
| **Build** | WebView2 or Electron shell feeding ContactFrames; fixed step; debug colliders |
| **Accept** | Controllable S-curves; ramp maintain; 60 FPS empty scene; no NaNs |
| **Abandon** | Steering unreadable; physics unstable |

---

## P4 — Ollie / nollie / land

| | |
| --- | --- |
| **Goal** | Pop height readable; land cone fair |
| **Build** | Gesture FSM pop window; hybrid impulse; land/bail |
| **Accept** | After 10 min tutorial, ≥50% ollie land success; false pop &lt;10% |
| **Abandon** | Random pops; cannot land without luck |

---

## P5 — Flip + catch

| | |
| --- | --- |
| **Goal** | Kickflip/heelflip with catch assist levels |
| **Accept** | Recognizer golden traces pass; playtester agency ≥4/5; bail understandable |
| **Abandon** | Flips pure lottery; assist feels fully automatic (survey) |

---

## P6 — One grind rail

| | |
| --- | --- |
| **Goal** | Enter, balance, exit |
| **Accept** | ≥50% success on tutorial rail in 10 tries with soft snap; telemetry shows snap radius |
| **Abandon** | Magnetism complaints + boredom OR zero entries |

---

## P7 — Recording, replay, agent API

| | |
| --- | --- |
| **Goal** | Deterministic ContactFrame replay; agent inject only |
| **Accept** | Dual replay checkpoint match; agent cannot set pose; synthetic ollie golden passes CI |
| **Abandon** | Inherent nondeterminism after deterministic Rapier + discipline → block agent goals (human game may continue with warning) |

---

## P8 — Vertical slice feel gate

| | |
| --- | --- |
| **Goal** | 30–60 s line: push, gap, flip, grind, land |
| **Accept** | G2 feel gate; G3 latency; G5 FPS on target iGPU with simple art |
| **Abandon** | “Not fun” majority → redesign grammar or stop |

---

## Pre-production gates (must pass)

| Gate | Criteria | From |
| --- | --- | --- |
| **G1 Input** | P0–P1 accept | Hardware |
| **G2 Feel** | P8 playtests | Design |
| **G3 Latency** | ≤50 ms move / ≤80 ms click-pop typical | Perf |
| **G4 Determinism** | P7 accept | Engineering |
| **G5 Performance** | 60 FPS p95 milestone park | Perf |
| **G6 Agent** | Contract tests | QA |

**Production content (full park, polish, meta systems) only after G1–G4.**

---

## Parallelizable after P0

- Art pipeline spikes (CC0 Kenney plaza) — **no dependency on fun**
- ContactFrame schema + vitest goldens with **synthetic** data
- Camera prototype with gamepad mock

Do **not** parallelize large narrative/open-world scope.

---

## Research probes in-repo

| Probe | Path | Purpose |
| --- | --- | --- |
| Browser capability | `research/probes/browser-contact-probe.html` | Show what Pointer/Touch events expose on trackpad vs touchscreen |
| ContactFrame schema | `research/probes/contact-frame.schema.json` | Contract for future adapters |
| Schema validate script | `research/probes/validate-deliverables.mjs` | Structural verification of research package |

These are **not** production game code.
