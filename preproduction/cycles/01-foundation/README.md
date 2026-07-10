# Cycle 01 — Foundation

**Cycle:** 1 of 3 (preproduction)
**Status:** Foundation assembled for adversarial review (cycle 2)
**Access date:** 2026-07-10
**Scope:** Product, input/trick grammar, physics/camera, runtime, art/assets, world/UI/audio, OSS reuse, observability, risks. **No production game implementation.**

Labels used throughout: **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**.

Research under `research/` is **preserved input**, not rewritten. This cycle promotes and normalizes it into implementation-ready contracts. Where cycle 1 refines research, the change is recorded in `decisions.json`.

---

## Committed recommendations (summary)

| Domain | Commitment | Confidence |
| --- | --- | --- |
| **Feasibility** | Conditionally feasible with native dual-foot bridge; pure browser dual-foot is not shippable | High (API docs + browser gap) |
| **Product** | Expressive hybrid finger-skate: Skate-like forgiving initiation + THUG2-like line exploration; compact plaza; small combinable vocab | High design; feel unproven |
| **Control model** | Board-local relative rest-pose control; click-centered rule FSM; planted-state click→foot attribution | High architecture |
| **Physics** | Hybrid assisted Rapier body; player owns approach/timing/catch/land/rail; assist 0–2 | High architecture; numbers are hypotheses |
| **Camera** | Default low three-quarter chase; board-relative input never rewritten by camera | Medium (playtest for constants) |
| **Runtime** | Primary: Win32/.NET host + WebView2 + touchpad bridge → ContactFrame → TS Three.js/Rapier. Fallback packaging: Electron + N-API. Input fallback: Raw Input HID PTP | High Windows-first |
| **Input APIs** | P0-A: Win11 `RegisterTouchpadCapableWindow` + `GetPointerFrameTouchpadInfo` (himetric). P0-B: Raw Input Touch Pad `0x0D/0x05` | High docs; device behavior unproven |
| **Determinism** | Single ContactFrame path for human/replay/agent; `@dimforge/rapier3d-deterministic`; fixed step 120 Hz preferred | High policy |
| **Art** | Professional tactile fingerboard look on iGPU budgets; not low-poly prototype aesthetic; CC0-first pipeline | Medium (art quality unmeasured) |
| **Assets** | Catalog-first; no unreviewed files in `assets/runtime/`; licenses beside downloads | High policy |
| **v0 ship set** | Push, steer, ollie, nollie, kickflip, heelflip, front/back shuv 180, catch/land/bail, 50-50 grind family | High scope |

---

## Unresolved gates (must not be hidden)

These are **not** claimed proven. Each has a decisive experiment in `open-questions.md`.

| Gate | Question | Cheap experiment |
| --- | --- | --- |
| **G1 Input** | Dual stable contacts + lift + click + free dual-plant on target laptop? | P0-A then P0-B probe |
| **G2 Feel** | Is hybrid fun and fair after tutorial? | P8 playtest n≥5 |
| **G3 Latency** | Contact move ≤50 ms typical; click→pop visual ≤80 ms? | Instrumented host+sim |
| **G4 Determinism** | Same recording → same sim checkpoints? | Dual offline replay |
| **G5 Performance** | 60 FPS p95 on target iGPU with budgeted plaza art? | Vertical slice FPS log |
| **G6 Agent** | Agent inject-only path; no pose cheat? | Contract tests |

**Production content lock requires G1–G4.** G5–G6 before content freeze.

---

## Document map

| File | Role |
| --- | --- |
| [product-vision.md](./product-vision.md) | Fantasy, audience, loop, non-goals, measurable “physics quality” |
| [game-design-spec.md](./game-design-spec.md) | Core loop, plaza sandbox, difficulty, failure/recovery |
| [input-and-trick-spec.md](./input-and-trick-spec.md) | ContactFrame, foot tracker, FSM, v0 gesture sequences |
| [physics-and-camera-spec.md](./physics-and-camera-spec.md) | Hybrid controller, Rapier model, camera transitions |
| [technical-architecture.md](./technical-architecture.md) | Host, transport, sim/render split, security, packaging |
| [art-direction.md](./art-direction.md) | Visual direction, readability, lighting philosophy |
| [world-ui-audio-spec.md](./world-ui-audio-spec.md) | Plaza, HUD, audio, onboarding, accessibility |
| [asset-acquisition-and-pipeline.md](./asset-acquisition-and-pipeline.md) | Units, GLB, meshopt/KTX2, catalog rules |
| [reuse-and-dependency-audit.md](./reuse-and-dependency-audit.md) | OSS adopt/study/reject + dep ownership |
| [observability-and-verification.md](./observability-and-verification.md) | Golden traces, PBT, gates, playtests |
| [risk-register.md](./risk-register.md) | Cycle-1 risk register (extends research) |
| [decisions.json](./decisions.json) | Structured committed decisions |
| [sources.json](./sources.json) | Primary sources catalog |
| [open-questions.md](./open-questions.md) | Experiments with accept/reject/fallback |
| [review-checklist.md](./review-checklist.md) | Cycle-2 adversarial checklist |

Asset ledgers: `assets/README.md`, `assets/catalog/{assets,licenses,dependencies}.json`.

Validator: `preproduction/probes/validate-cycle-01.mjs`.

---

## Consistency anchors (do not contradict across docs)

1. **ContactFrame** schema version 1 matches `research/probes/contact-frame.schema.json` until a versioned bump is decided.
2. **Primary architecture** is always Win host + WebView2 + ContactFrame → TS game; never “browser-only dual feet.”
3. **Relative board-local control** — never finite pad→world teleport.
4. **Board-local axes:** right **+X**, up **+Y**, nose/forward **+Z** (same in physics, assets, animation).
5. **Kick/pop** is report-level Button 1 attributed by planted feet, not per-finger hardware click.
6. **Hybrid assist** initiates maneuvers; physics owns collisions, rails, fails.
7. **Agent** injects ContactFrames only.
8. **v0 grind** is 50-50 family first.
9. **No production game tree** until cycles 1–3 reviewed and prototype gates pass.

---

## Relationship to research

| Research | Cycle-1 treatment |
| --- | --- |
| `research/README.md` feasibility + gates | Promoted; gates restated with verification methods |
| Control grammar / attribution / trick matrix | Normative sequences + conflict table in input-and-trick-spec |
| Physics / camera / tech | Concrete numbers labeled hypothesis; measurement list explicit |
| Reuse audit | Expanded OSS search + dependency ledger ownership |
| Risk / roadmap | Risk-register + open-questions experiments |

---

## Cycle-2 should attack

- Whether C# host is better than Rust for HID safety.
- Whether 120 Hz physics is worth the CPU vs 60 Hz on iGPU.
- Whether click-centered FSM is too arcade vs continuous-force README wording.
- Whether Kenney/low-poly plaza kits conflict with “professional graphics” art direction.
- Whether soft grind snap is “too magnetic.”
- Whether Win11 pointer path is pan/zoom-only on real hardware (may force Raw Input primary).
