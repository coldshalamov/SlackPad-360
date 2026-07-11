# Cycle 02 — Adversarial Revision

**Cycle:** 2 of 3 (preproduction)
**Status:** Complete adversarial package (no production game)
**Access date:** 2026-07-10
**Baseline:** Cycle 1 immutable at commit `53b3f14`
**Working tree start:** `c0aa320` (clean) when cycle 2 began

Labels: **confirmed fact** | **inference** | **recommendation** | **hypothesis** | **unresolved**.

---

## Verdict

Cycle 1 remains a sound foundation. Cycle 2 **does not rewrite** it. It accepts the Codex audit, records explicit deltas, settles package identities with registry evidence, turns the asset shell into a provenance-backed source library (with honest hero-board/shoe gaps), and hardens gates so dual-contact hardware cannot be mistaken for solved research.

**Overall recommendation:** Proceed to cycle 3 production planning **only with G1 still open as an empirical pause**. Do not unlock content production until G1 accepts on target hardware.

---

## Committed recommendations (cycle 2)

| ID | Commitment | Confidence |
| --- | --- | --- |
| **C2-RAPIER-PACKAGE** | `@dimforge/rapier3d-deterministic-compat@0.19.3` primary; Apache-2.0; inlined WASM for Vite/WebView2 | High |
| **C2-INPUT-PRIMARY-API** | Spike both paths; **Raw Input primary ranking** for free dual-plant until Win11 pointer proves free feet | Medium-High (docs); device **unresolved** |
| **C2-HOST-LANG** | C#/.NET 8 + WebView2 primary; Rust on HID safety/toolchain trigger | High |
| **C2-PHYSICS-REPRESENTATION** | Single dynamic board + assist v0; raycast wheels P3 probe; no articulated rider first ship | High architecture |
| **C2-HZ-PLAN** | 60 Hz default; 120 Hz benchmark/quality mode | High policy |
| **C2-BOARD-SLIDE-SCOPE** | Boardslide family first-ship; 50-50 first vertical-slice grind | High design |
| **C2-FEET-VISUAL** | Disembodied shoes; catch volumes ≠ mesh contact | High |
| **C2-ASSET-LIBRARY** | Acquired CC0 HDRI/materials/blockout; Kenney not final look; hero board/shoes Blender brief deferred | High |
| **C2-EVIDENCE-LEVELS** | Smoke / deterministic / hardware / formative / tuning / release | High |
| **C2-AUTONOMY-GATES** | Agent continues on synthetic path; **pause** at device/feel gates; failed G1 stops content | High |

---

## Remaining empirical gates

| Gate | Status | Accept / Reject / Fallback |
| --- | --- | --- |
| **G1 Input** | **Open — not researched away** | Dual stable contacts + lifts + click + free dual-plant ≥60 s / thrashing or gesture-only / different device or product pivot |
| **G2 Feel** | Open | Formative playtest pass / unfun unfair / retune assist then retest |
| **G3 Latency** | Open | ≤50 ms contact→sim typical; click→pop visual ≤80 ms / exceed / SharedBuffer or lower rate |
| **G4 Determinism** | Open | Same recording → same checkpoints / diverge / fix non-determinism sources |
| **G5 Performance** | Open | 60 FPS p95 target iGPU / miss / LOD/budget cut without lowering quality bar permanently |
| **G6 Agent** | Open | Inject-only ContactFrame path; no pose cheat / cheat possible / contract tests harden |

Production content lock still requires **G1–G4**. Failed G1 ⇒ stop plaza content, pivot to input only (`autonomy-and-gate-plan.md`).

---

## Document map

| File | Role |
| --- | --- |
| [audit-findings.md](./audit-findings.md) | Codex audit disposition by severity |
| [delta-from-cycle-01.md](./delta-from-cycle-01.md) | Added / Changed / Rejected / Deferred |
| [product-and-scope-spec.md](./product-and-scope-spec.md) | Product intent + slice vs ship |
| [input-platform-and-device-spec.md](./input-platform-and-device-spec.md) | APIs, P0 spike, device matrix |
| [input-and-trick-spec.md](./input-and-trick-spec.md) | Primitives, recognition, failure |
| [physics-animation-and-camera-spec.md](./physics-animation-and-camera-spec.md) | Bodies, assist math, feet, camera |
| [technical-architecture.md](./technical-architecture.md) | Host, transport, modules |
| [reuse-and-dependency-audit.md](./reuse-and-dependency-audit.md) | Exact deps + OSS study |
| [asset-bill-of-materials.md](./asset-bill-of-materials.md) | Full BOM |
| [asset-selection-and-gap-plan.md](./asset-selection-and-gap-plan.md) | Acquired assets + Blender briefs |
| [art-direction-and-shot-rubric.md](./art-direction-and-shot-rubric.md) | Visual acceptance shots |
| [world-ui-audio-spec.md](./world-ui-audio-spec.md) | Plaza, HUD, audio |
| [observability-and-verification.md](./observability-and-verification.md) | Evidence levels, goldens, agent API |
| [autonomy-and-gate-plan.md](./autonomy-and-gate-plan.md) | Stop/continue/pivot |
| [risk-register.md](./risk-register.md) | Risks |
| [open-questions.md](./open-questions.md) | Experiments |
| [internet-stop-log.md](./internet-stop-log.md) | Research exhaustion |
| [decisions.json](./decisions.json) | Machine-readable decisions |
| [sources.json](./sources.json) | Source catalog |
| [review-checklist.md](./review-checklist.md) | Cycle-3 readiness checklist |

Assets: `assets/catalog/*`, `assets/source/vendor/*`, `assets/generated/previews/*`
Validator: `preproduction/probes/validate-cycle-02.mjs`

---

## Consistency anchors (cycle 2)

1. ContactFrame v1 remains sole agent/hardware/replay path.
2. Relative board-local control; no pad→world teleport.
3. Board axes: +X right, +Y up, +Z nose.
4. Button 1 report-level; foot attribution by plant mask + stance.
5. Hybrid assist opens maneuvers; Rapier owns collisions/fails.
6. Rapier package name in new text: `@dimforge/rapier3d-deterministic-compat` (cycle-1 bare name only when quoting the defect).
7. No production game tree this cycle.
8. Blender authoring deferred (process unavailable), not optional art.

---

## What cycle 3 must still attack

1. **G1 on metal** — free dual-plant traces beat any remaining docs debate.
2. **Hero board/shoes authoring** — isolated Blender pass or equally credible source.
3. **Assist fairness** — magnetic grind vs dead rail.
4. **60 vs 120 Hz** on target iGPU with golden parity.
5. **Boardslide recognition** conflicts with flip yaw.
6. **Packaging weight** of WebView2 host + WASM.
7. **First vertical slice cut** that is enjoyable without content bloat.
